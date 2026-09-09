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
    Pulls name, email, skills, experience, and raw text.
    """
    candidate_name = None
    email = None
    phone = None
    skills: List[str] = []
    experience: List[str] = []
    education: List[str] = []
    raw_snippets: List[str] = []

    # Case 1: DocumentScan with files array
    files = candidate_ocr_json.get("files", [])
    if isinstance(files, list) and files:
        for f in files:
            ocr_data = f.get("ocr_data", {}) if isinstance(f, dict) else {}
            for k, v in ocr_data.items():
                k_lower = k.lower()
                v_str = str(v)
                raw_snippets.append(f"{k}: {v_str}")

                if ("name" in k_lower or "candidate" in k_lower) and not candidate_name:
                    candidate_name = v_str
                if "email" in k_lower and not email:
                    email = v_str
                if ("phone" in k_lower or "mobile" in k_lower) and not phone:
                    phone = v_str
                if "skill" in k_lower:
                    if isinstance(v, list):
                        skills.extend([str(item) for item in v])
                    else:
                        skills.extend([s.strip() for s in v_str.split(",") if s.strip()])
                if "experience" in k_lower or "work" in k_lower or "company" in k_lower:
                    experience.append(v_str)
                if "education" in k_lower or "degree" in k_lower or "college" in k_lower:
                    education.append(v_str)

    # Case 2: Flattened dictionary
    ocr_data = candidate_ocr_json.get("ocr_data", candidate_ocr_json)
    if isinstance(ocr_data, dict):
        for k, v in ocr_data.items():
            k_lower = k.lower()
            v_str = str(v)
            raw_snippets.append(f"{k}: {v_str}")
            if ("name" in k_lower or "candidate" in k_lower) and not candidate_name:
                candidate_name = v_str
            if "email" in k_lower and not email:
                email = v_str
            if ("phone" in k_lower or "mobile" in k_lower) and not phone:
                phone = v_str
            if "skill" in k_lower:
                if isinstance(v, list):
                    skills.extend([str(item) for item in v])
                else:
                    skills.extend([s.strip() for s in v_str.split(",") if s.strip()])
            if "experience" in k_lower or "work" in k_lower:
                experience.append(v_str)
            if "education" in k_lower or "degree" in k_lower:
                education.append(v_str)

    # Clean up name from filename if not detected
    if not candidate_name or candidate_name.lower() in ["none", "null", "unknown"]:
        base_name = filename.rsplit(".", 1)[0]
        cleaned = re.sub(r"[_\-0-9]+", " ", base_name).strip()
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
        "raw_text_summary": "\n".join(raw_snippets[:15]),
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
            raw_response = await qwen_client.chat_async(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=1024,
            )
            logger.info(f"[JD MATCH LLM RAW] {raw_response[:300] if raw_response else 'EMPTY'}")
            parsed = _extract_json_safely(raw_response)
        except Exception as exc:
            logger.error(f"[MATCH CALCULATION ERROR] {exc}")

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

        skills_score = int(min(100, max(20, skills_ratio * 100)))
        exp_score = 75 if cand_summary.get("experience") else 60
        edu_score = 85 if cand_summary.get("education") else 70
        certs_score = 65

        composite = int(0.5 * skills_score + 0.25 * exp_score + 0.15 * edu_score + 0.10 * certs_score)

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


jd_matcher = JDMatcherService()
