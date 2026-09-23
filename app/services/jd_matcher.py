import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.services.qwen.client import qwen_client

logger = logging.getLogger("jd_matcher")


def _extract_json_safely(raw_text: str) -> Dict[str, Any]:
    if not raw_text or not raw_text.strip():
        return {}

    cleaned = re.sub(r"^```(?:json)?", "", raw_text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"```$", "", cleaned.strip()).strip()

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", raw_text)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return {}


def _extract_candidate_summary(candidate_ocr_json: Dict[str, Any], filename: str = "") -> Dict[str, Any]:
    """
    Consolidates candidate information from varied OCR scan payloads.
    Pulls real candidate name (prioritizing PAN, Aadhaar, marksheet, resume names over father/signer),
    email, phone, skills, experience, and education.
    """
    candidate_name = None
    email = None
    phone = None
    skills: List[str] = []
    experience: List[str] = []
    education: List[str] = []
    raw_snippets: List[str] = []
    priority_names: List[tuple] = []

    def _process_ocr_dict(d: Dict[str, Any]):
        nonlocal email, phone
        if not isinstance(d, dict):
            return
        for k, v in d.items():
            if v is None:
                continue
            k_lower = k.lower().strip()
            v_str = str(v).strip()
            if not v_str or v_str.lower() in ["none", "null", "unknown", "n/a", "-", "false", "true", "clear"]:
                continue

            raw_snippets.append(f"{k}: {v_str}")

            # Filter out non-candidate name fields
            if any(ign in k_lower for ign in ["father", "mother", "signer", "signatory", "company", "college", "institute", "school", "bank", "branch", "issuer", "authority"]):
                pass
            elif any(p in k_lower for p in ["pan_name", "aadhaar_name", "student_name", "candidate_name", "applicant_name", "full_name", "employee_name", "name"]):
                if len(v_str) > 2 and not any(char.isdigit() for char in v_str[:3]):
                    priority = 1 if any(hp in k_lower for hp in ["pan_name", "aadhaar_name", "student_name", "candidate_name", "applicant_name", "full_name"]) else 2
                    priority_names.append((priority, v_str))

            if "email" in k_lower and not email and "@" in v_str:
                email = v_str
            if ("phone" in k_lower or "mobile" in k_lower or "contact" in k_lower) and not phone:
                phone = v_str
            if "skill" in k_lower:
                if isinstance(v, list):
                    skills.extend([str(item) for item in v if item and str(item).strip() not in ["[ Enter gained skills ]", "none", "null"]])
                else:
                    skills.extend([s.strip() for s in v_str.split(",") if s.strip() and s.strip() not in ["[ Enter gained skills ]", "none", "null"]])
            if any(exp in k_lower for exp in ["experience", "designation", "job_title", "previous_company", "employment", "work"]):
                if v_str not in ["[ Company Name ]", ""]:
                    experience.append(v_str)
            if any(edu in k_lower for edu in ["education", "degree", "qualification", "marksheet", "university", "college", "board"]):
                education.append(v_str)

    files = candidate_ocr_json.get("files", [])
    if isinstance(files, list) and files:
        for f in files:
            if isinstance(f, dict):
                _process_ocr_dict(f.get("ocr_data", {}))

    ocr_data = candidate_ocr_json.get("ocr_data", candidate_ocr_json)
    if isinstance(ocr_data, dict):
        _process_ocr_dict(ocr_data)

    if priority_names:
        priority_names.sort(key=lambda x: x[0])
        candidate_name = priority_names[0][1]

    # Clean up name from filename if not detected from OCR
    if not candidate_name or candidate_name.lower() in ["none", "null", "unknown"]:
        base_name = filename.rsplit(".", 1)[0]
        cleaned = re.sub(r"[-_0-9]+", " ", base_name).strip()
        candidate_name = cleaned.title() if cleaned else "Candidate (Anonymous)"

    # Deduplicate skills
    seen_skills = set()
    deduped_skills = []
    for s in skills:
        cleaned_s = s.strip()
        if cleaned_s and cleaned_s.lower() not in seen_skills:
            seen_skills.add(cleaned_s.lower())
            deduped_skills.append(cleaned_s)

    return {
        "candidate_name": candidate_name,
        "email": email or "N/A",
        "phone": phone or "N/A",
        "skills": deduped_skills,
        "experience": experience,
        "education": education,
        "raw_text_summary": "\n".join(raw_snippets[:20]),
    }



class JDMatcherService:
    """
    Enterprise Explainable AI matching engine.
    Extracts structured requirements from Job Descriptions and calculates
    evidence-backed compatibility scores with explicit matched/missing breakdowns.
    """

    async def extract_jd_requirements(self, raw_text: str) -> Dict[str, Any]:
        """
        Prompts AI text model to extract structured requirements from raw JD text.
        Returns: {
            "job_title": str,
            "skills": List[str],
            "experience_years": str | int,
            "education": List[str],
            "certifications": List[str],
            "key_responsibilities": List[str]
        }
        """
        if not raw_text or not raw_text.strip():
            return {
                "job_title": "General Position",
                "skills": [],
                "experience_years": "Not specified",
                "education": [],
                "certifications": [],
                "key_responsibilities": [],
            }

        system_prompt = (
            "You are an enterprise technical recruiter and job specification parser. "
            "Extract structured hiring requirements from the provided Job Description. "
            "Output strictly valid JSON with no conversational text."
        )

        prompt = f"""
Analyze this Job Description and extract the key hiring requirements into structured JSON:

JOB DESCRIPTION TEXT:
\"\"\"
{raw_text[:4000]}
\"\"\"

Extract the requirements in this EXACT JSON structure:
{{
  "job_title": "<Job Title, e.g. Senior Full-Stack Engineer>",
  "skills": ["<Key technical or core skill 1>", "<Key technical skill 2>", "<Skill 3>"],
  "experience_years": "<e.g., 3+ years or 5 years>",
  "education": ["<e.g. Bachelor's in Computer Science or related degree>"],
  "certifications": ["<e.g. AWS Certified Solutions Architect, or empty if none>"],
  "key_responsibilities": ["<Responsibility 1>", "<Responsibility 2>"]
}}
"""
        try:
            raw_response = await qwen_client.chat_async(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=1024,
            )
            parsed = _extract_json_safely(raw_response)
            if parsed and isinstance(parsed, dict) and "skills" in parsed:
                # Ensure all fields are typed properly
                return {
                    "job_title": parsed.get("job_title") or "Technical Position",
                    "skills": parsed.get("skills") if isinstance(parsed.get("skills"), list) else [],
                    "experience_years": parsed.get("experience_years") or "Not specified",
                    "education": parsed.get("education") if isinstance(parsed.get("education"), list) else [],
                    "certifications": parsed.get("certifications") if isinstance(parsed.get("certifications"), list) else [],
                    "key_responsibilities": parsed.get("key_responsibilities") if isinstance(parsed.get("key_responsibilities"), list) else [],
                }
        except Exception as exc:
            logger.error(f"[JD PARSE ERROR] {exc}")

        # Heuristic fallback if LLM is unavailable or fails to return JSON
        first_line = raw_text.strip().split("\n")[0][:80]
        found_skills = []
        common_tech = ["python", "fastapi", "react", "sql", "postgresql", "docker", "kubernetes", "aws", "node", "typescript", "java", "c++", "golang"]
        for tech in common_tech:
            if re.search(r"\b" + re.escape(tech) + r"\b", raw_text, re.IGNORECASE):
                found_skills.append(tech.title() if tech != "aws" and tech != "sql" else tech.upper())

        return {
            "job_title": first_line if first_line else "Technical Role",
            "skills": found_skills or ["Technical Proficiency", "Problem Solving"],
            "experience_years": "2+ years",
            "education": ["Bachelor's Degree in related field"],
            "certifications": [],
            "key_responsibilities": ["Develop, maintain, and test software solutions."],
        }

    async def calculate_candidate_match(
        self,
        jd_requirements: Dict[str, Any],
        candidate_ocr_json: Dict[str, Any],
        candidate_id: Any = None,
        filename: str = "",
    ) -> Dict[str, Any]:
        """
        Compares a candidate's extracted OCR resume entities against the JD requirements.
        Returns an explainable match payload with score, category breakdown, matched and missing requirements.
        """
        cand_summary = _extract_candidate_summary(candidate_ocr_json, filename=filename)
        candidate_name = cand_summary["candidate_name"]

        system_prompt = (
            "You are an Explainable AI (XAI) talent intelligence engine. "
            "Your task is to evaluate a candidate resume strictly against the Job Description requirements. "
            "You must provide clear evidence for each matched criterion and explicit reasons for missing criteria. "
            "Output strictly valid JSON with no markdown and no conversational preamble."
        )

        prompt = f"""
Evaluate this candidate against the target Job Description requirements.

TARGET JOB DESCRIPTION REQUIREMENTS:
{json.dumps(jd_requirements, indent=2)}

CANDIDATE EXTRACTED RESUME ENTITIES:
- Candidate Name: {candidate_name}
- Extracted Skills: {json.dumps(cand_summary['skills'])}
- Experience Snippets: {json.dumps(cand_summary['experience'])}
- Education Snippets: {json.dumps(cand_summary['education'])}
- Resume Content Summary:
{cand_summary['raw_text_summary']}

EVALUATION INSTRUCTIONS:
1. Compare candidate skills, experience years, education, and certifications against the JD requirements.
2. Calculate an overall composite compatibility score from 0 to 100.
3. Compute category scores:
   - skills_score (0-100)
   - experience_score (0-100)
   - education_score (0-100)
   - certifications_score (0-100)
4. List specific MATCHED requirements with direct evidence snippets found in the resume.
5. List specific MISSING requirements that the JD required but the candidate lacks.
6. Provide a concise 1-2 sentence executive recommendation.

Return STRICT JSON ONLY matching this schema:
{{
  "score": <composite integer score from 0 to 100>,
  "match_status": "<EXCELLENT if >=85, STRONG if >=70, MODERATE if >=50, WEAK if <50>",
  "score_breakdown": {{
    "skills": <skills fit 0-100>,
    "experience": <experience fit 0-100>,
    "education": <education fit 0-100>,
    "certifications": <certifications fit 0-100>
  }},
  "matched_requirements": [
    {{
      "category": "Skills",
      "requirement": "<matched requirement name>",
      "evidence": "<exact evidence snippet or reasoning>"
    }}
  ],
  "missing_requirements": [
    {{
      "category": "Skills",
      "requirement": "<missing requirement name>",
      "reason": "<reason why candidate lacks this requirement>"
    }}
  ],
  "recommendation": "<concise 1-2 sentence recommendation>"
}}
"""
        parsed: Dict[str, Any] = {}
        try:
            raw_response = await asyncio.wait_for(
                qwen_client.chat_async(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    max_tokens=1024,
                ),
                timeout=2.5,
            )
            if raw_response:
                parsed = _extract_json_safely(raw_response)
        except Exception as exc:
            logger.warning(f"[MATCH CALCULATION FALLBACK] LLM call bypassed/timed out ({exc})")

        # Programmatic validation & fallback calculation
        if not parsed or not isinstance(parsed, dict) or "score" not in parsed:
            parsed = self._compute_fallback_match(jd_requirements, cand_summary)
        else:
            # If LLM returned matched/missing, calculate composite score reliably
            matched_reqs = parsed.get("matched_requirements", [])
            missing_reqs = parsed.get("missing_requirements", [])
            if isinstance(matched_reqs, list) and isinstance(missing_reqs, list):
                tot = len(matched_reqs) + len(missing_reqs)
                if tot > 0:
                    skills_ratio = len(matched_reqs) / tot
                    computed = int(
                        0.55 * (skills_ratio * 100)
                        + 0.25 * float(parsed.get("score_breakdown", {}).get("experience", 60))
                        + 0.15 * float(parsed.get("score_breakdown", {}).get("education", 70))
                        + 0.05 * float(parsed.get("score_breakdown", {}).get("certifications", 50))
                    )
                    parsed["score"] = max(10, min(99, computed))

        score = int(parsed.get("score", 70))
        score = max(0, min(100, score))

        # Determine status
        if score >= 85:
            match_status = "EXCELLENT"
        elif score >= 70:
            match_status = "STRONG"
        elif score >= 50:
            match_status = "MODERATE"
        else:
            match_status = "WEAK"

        score_breakdown = parsed.get("score_breakdown", {})
        if not isinstance(score_breakdown, dict):
            score_breakdown = {"skills": score, "experience": score, "education": 80, "certifications": 50}

        matched_reqs = parsed.get("matched_requirements", [])
        if not isinstance(matched_reqs, list):
            matched_reqs = []

        missing_reqs = parsed.get("missing_requirements", [])
        if not isinstance(missing_reqs, list):
            missing_reqs = []

        recommendation = parsed.get("recommendation")
        if not recommendation:
            recommendation = f"Candidate {candidate_name} exhibits a {match_status.lower()} alignment with the specified core technical requirements."

        # Collect verified skills for quick chips in table
        extracted_skills = cand_summary.get("skills", [])
        if not extracted_skills:
            # Fallback to matched skills items
            extracted_skills = [m.get("requirement", "") for m in matched_reqs if m.get("category") == "Skills"]
        # Limit to top 6
        extracted_skills = [s for s in extracted_skills if s][:6]

        return {
            "candidate_id": str(candidate_id) if candidate_id is not None else "SCAN-UNKNOWN",
            "candidate_name": candidate_name,
            "candidate_filename": filename,
            "candidate_email": cand_summary.get("email", "N/A"),
            "score": score,
            "rank": 0,  # Assigned after sorting in API route
            "match_status": match_status,
            "score_breakdown": {
                "skills": int(score_breakdown.get("skills", score)),
                "experience": int(score_breakdown.get("experience", score)),
                "education": int(score_breakdown.get("education", 80)),
                "certifications": int(score_breakdown.get("certifications", 60)),
            },
            "matched_requirements": matched_reqs,
            "missing_requirements": missing_reqs,
            "recommendation": recommendation,
            "extracted_skills": extracted_skills,
        }

    def _compute_fallback_match(
        self,
        jd_requirements: Dict[str, Any],
        cand_summary: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Deterministic set-overlap fallback when LLM is unavailable or unparseable.
        Ensures the ranking engine NEVER breaks or returns 500.
        """
        jd_skills = [s.lower() for s in jd_requirements.get("skills", [])]
        cand_skills = [s.lower() for s in cand_summary.get("skills", [])]
        raw_text_lower = cand_summary.get("raw_text_summary", "").lower()
        has_experience = bool(cand_summary.get("experience"))
        has_education = bool(cand_summary.get("education"))

        # Non-resume or zero-data check:
        # If no skills, no experience, and no education are found, this is an irrelevant non-resume document (e.g. government ID)
        if not cand_skills and not has_experience and not has_education:
            return {
                "score": 0,
                "score_breakdown": {
                    "skills": 0,
                    "experience": 0,
                    "education": 0,
                    "certifications": 0,
                },
                "matched_requirements": [],
                "missing_requirements": [
                    {
                        "category": "All",
                        "requirement": "Professional Profile",
                        "reason": "Document lacks verifiable resume entities (skills, experience, education).",
                    }
                ],
                "recommendation": "Document does not contain professional resume entities. Evaluated as non-matching.",
            }

        matched = []
        missing = []

        for skill in jd_requirements.get("skills", []):
            s_lower = skill.lower()
            if any(s_lower in c or c in s_lower for c in cand_skills) or s_lower in raw_text_lower:
                matched.append({
                    "category": "Skills",
                    "requirement": skill,
                    "evidence": f"Demonstrated proficiency verified in resume profile for {skill}.",
                })
            else:
                missing.append({
                    "category": "Skills",
                    "requirement": skill,
                    "reason": f"Skill '{skill}' was not explicitly detected in candidate scan.",
                })

        total_reqs = len(jd_skills) or 1
        matched_count = len(matched)
        skills_ratio = matched_count / total_reqs

        skills_score = int(min(100, skills_ratio * 100))
        exp_score = 75 if has_experience else 0
        edu_score = 80 if has_education else 0
        certs_score = 50 if cand_skills else 0

        composite = int(0.55 * skills_score + 0.25 * exp_score + 0.15 * edu_score + 0.05 * certs_score)

        return {
            "score": composite,
            "score_breakdown": {
                "skills": skills_score,
                "experience": exp_score,
                "education": edu_score,
                "certifications": certs_score,
            },
            "matched_requirements": matched,
            "missing_requirements": missing,
            "recommendation": f"Candidate demonstrates {matched_count} out of {total_reqs} primary required core competencies.",
        }

    async def rank_and_persist_candidates(
        self,
        db: Any,
        company_id: str,
        jd: Any,
        scans: List[Any],
    ) -> tuple:
        """
        Evaluates a list of DocumentScan records against a JobDescription's extracted requirements,
        ranks them descending by score, computes executive KPIs, and persists the results to candidate_matches.
        Enforces strict tenant isolation by scoping to company_id.
        """
        from datetime import datetime, timezone
        from app.db.models import CandidateMatch

        jd_requirements = getattr(jd, "extracted_requirements", None) or {}
        if not scans:
            return [], {
                "total_candidates_analyzed": 0,
                "top_match_percentage": 0,
                "average_match_percentage": 0,
                "strong_matches_count": 0,
            }

        # Bound candidates to top 20 to protect latency and GPU resources
        bounded_scans = scans[:20]
        semaphore = asyncio.Semaphore(5)

        async def _evaluate_scan(scan: Any):
            async with semaphore:
                try:
                    candidate_ocr = getattr(scan, "extracted_json", None) or {}
                    filename = getattr(scan, "filename", "document.pdf")
                    scan_id = getattr(scan, "id", None)
                    match_res = await self.calculate_candidate_match(
                        jd_requirements=jd_requirements,
                        candidate_ocr_json=candidate_ocr,
                        candidate_id=scan_id,
                        filename=filename,
                    )
                    created_at = getattr(scan, "created_at", None)
                    match_res["uploaded_at"] = created_at.isoformat() if created_at else ""
                    return match_res
                except Exception as e:
                    logger.warning(
                        f"[RANK SCAN ERROR] Gracefully degrading scan ID {getattr(scan, 'id', 'unknown')}: {e}"
                    )
                    created_at = getattr(scan, "created_at", None)
                    return {
                        "candidate_id": str(getattr(scan, "id", "SCAN-UNKNOWN")),
                        "candidate_name": f"Document #{getattr(scan, 'id', 'unknown')}",
                        "candidate_filename": getattr(scan, "filename", "document.pdf"),
                        "candidate_email": "N/A",
                        "score": 0,
                        "rank": 0,
                        "match_status": "WEAK",
                        "score_breakdown": {
                            "skills": 0,
                            "experience": 0,
                            "education": 0,
                            "certifications": 0,
                        },
                        "matched_requirements": [],
                        "missing_requirements": [
                            {
                                "category": "All",
                                "requirement": "Resume Data",
                                "reason": "No relevant professional data found in document.",
                            }
                        ],
                        "recommendation": "Document does not appear to be a relevant resume. Zero match.",
                        "extracted_skills": [],
                        "uploaded_at": created_at.isoformat() if created_at else "",
                    }

        tasks = [_evaluate_scan(s) for s in bounded_scans]
        try:
            evaluated_candidates = await asyncio.wait_for(asyncio.gather(*tasks), timeout=10.0)
        except Exception as exc:
            logger.warning(f"[RANK BATCH TIMEOUT] Candidate evaluation batch timed out ({exc}), computing deterministic fallbacks.")
            evaluated_candidates = []
            for s in bounded_scans:
                cand_ocr = getattr(s, "extracted_json", None) or {}
                cand_sum = _extract_candidate_summary(cand_ocr, filename=getattr(s, "filename", ""))
                fb = self._compute_fallback_match(jd_requirements, cand_sum)
                score_val = fb.get("score", 50)
                status_val = "STRONG" if score_val >= 70 else ("MODERATE" if score_val >= 50 else "WEAK")
                created_at = getattr(s, "created_at", None)
                evaluated_candidates.append({
                    "candidate_id": str(getattr(s, "id", "SCAN-UNKNOWN")),
                    "candidate_name": cand_sum.get("candidate_name") or "Anonymous Candidate",
                    "candidate_filename": getattr(s, "filename", "document.pdf"),
                    "candidate_email": cand_sum.get("email", "N/A"),
                    "score": score_val,
                    "rank": 0,
                    "match_status": status_val,
                    "score_breakdown": fb.get("score_breakdown", {}),
                    "matched_requirements": fb.get("matched_requirements", []),
                    "missing_requirements": fb.get("missing_requirements", []),
                    "recommendation": fb.get("recommendation", "Evaluated based on profile competencies."),
                    "extracted_skills": cand_sum.get("skills", [])[:6],
                    "uploaded_at": created_at.isoformat() if created_at else "",
                })

        # Sort descending by match score
        evaluated_candidates.sort(key=lambda x: x.get("score", 0), reverse=True)

        # Assign explicit ranks
        for idx, cand in enumerate(evaluated_candidates, start=1):
            cand["rank"] = idx


        # Compute KPIs
        total_candidates = len(evaluated_candidates)
        top_match = evaluated_candidates[0]["score"] if total_candidates > 0 else 0
        avg_match = (
            round(sum(c["score"] for c in evaluated_candidates) / total_candidates, 1)
            if total_candidates > 0
            else 0
        )
        strong_count = sum(1 for c in evaluated_candidates if c.get("score", 0) >= 75)

        kpis = {
            "total_candidates_analyzed": total_candidates,
            "top_match_percentage": top_match,
            "average_match_percentage": avg_match,
            "strong_matches_count": strong_count,
        }

        # Persist candidate matches with tenant isolation while preserving explicit allocation statuses
        try:
            from sqlalchemy import or_
            from app.db.models import CandidateAllocation

            target_jd_id = getattr(jd, "id", None)
            is_project_entity = hasattr(jd, "project_name")
            target_project_id = target_jd_id if is_project_entity else getattr(jd, "project_id", None)

            # Retrieve any existing statuses for this project/JD so re-ranking never clears ALLOCATED or REJECTED state
            existing_query = db.query(CandidateMatch).filter(CandidateMatch.company_id == company_id)
            if target_project_id:
                existing_query = existing_query.filter(
                    or_(CandidateMatch.project_id == target_project_id, CandidateMatch.job_description_id == target_jd_id)
                )
            else:
                existing_query = existing_query.filter(CandidateMatch.job_description_id == target_jd_id)

            existing_matches = existing_query.all()
            status_map: Dict[str, tuple] = {}
            for m in existing_matches:
                if m.status and m.status != "PENDING":
                    status_map[m.candidate_name.strip().lower()] = (m.status, m.allocated_at)

            # Also check candidate_allocations table
            if target_project_id:
                existing_allocs = db.query(CandidateAllocation).filter(
                    CandidateAllocation.company_id == company_id,
                    CandidateAllocation.project_id == target_project_id,
                ).all()
                for a in existing_allocs:
                    status_map[a.candidate_name.strip().lower()] = (a.status, a.allocated_at)

            # Assign statuses to evaluated candidates list
            for cand in evaluated_candidates:
                cand_name_key = (cand.get("candidate_name") or "").strip().lower()
                if cand_name_key in status_map:
                    cand_status, cand_alloc_time = status_map[cand_name_key]
                    cand["status"] = cand_status
                    cand["allocated_at"] = cand_alloc_time.isoformat() if cand_alloc_time else None
                else:
                    cand["status"] = cand.get("status") or "PENDING"
                    cand["allocated_at"] = None
                cand["project_id"] = target_project_id

            # Remove prior match snapshot rows for this target
            if target_project_id:
                db.query(CandidateMatch).filter(
                    CandidateMatch.company_id == company_id,
                    or_(CandidateMatch.project_id == target_project_id, CandidateMatch.job_description_id == target_jd_id),
                ).delete(synchronize_session=False)
            else:
                db.query(CandidateMatch).filter(
                    CandidateMatch.company_id == company_id,
                    CandidateMatch.job_description_id == target_jd_id,
                ).delete(synchronize_session=False)

            # Insert updated match rows
            for cand in evaluated_candidates:
                missing = cand.get("missing_requirements", [])
                gaps_summary_parts = [
                    f"{m.get('requirement', '')}: {m.get('reason', '')}"
                    for m in missing
                    if isinstance(m, dict) and m.get("requirement")
                ]
                gaps_text = "; ".join(gaps_summary_parts) if gaps_summary_parts else cand.get("recommendation", "")

                cand_status = cand.get("status") or "PENDING"
                cand_allocated_at = None
                cand_name_key = (cand.get("candidate_name") or "").strip().lower()
                if cand_name_key in status_map and status_map[cand_name_key][1]:
                    cand_allocated_at = status_map[cand_name_key][1]
                elif cand_status == "ALLOCATED":
                    cand_allocated_at = datetime.now(timezone.utc)

                match_row = CandidateMatch(
                    company_id=company_id,
                    job_description_id=target_jd_id if not is_project_entity else None,
                    project_id=target_project_id,
                    candidate_name=cand.get("candidate_name") or "Anonymous Candidate",
                    document_filename=cand.get("candidate_filename"),
                    match_score=int(cand.get("score", 0)),
                    match_category=cand.get("match_status", "WEAK"),
                    matched_competencies=cand.get("matched_requirements", []),
                    gaps_count=len(missing),
                    gaps_summary=gaps_text,
                    status=cand_status,
                    allocated_at=cand_allocated_at,
                    created_at=datetime.now(timezone.utc),
                )
                db.add(match_row)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error(f"[jd_matcher] Failed to persist candidate_matches for target {getattr(jd, 'id', None)}: {exc}", exc_info=True)

        return evaluated_candidates, kpis


jd_matcher = JDMatcherService()
project_matcher = jd_matcher

