import re
from typing import Any, Dict, List, Tuple
from app.schemas.guidelines import DocumentFileItem


def _clean_extracted_fields(raw_dict: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {}
    for k, v in raw_dict.items():
        if k in ["raw_text", "signature", "subject"] or k.startswith("_quality"):
            continue
        if isinstance(v, str) and v.strip() and v != "NOT_DETECTED":
            cleaned[k] = v.strip()
    return cleaned


def _map_extracted_to_blueprint_fields(
    raw_fields: Dict[str, Any],
    blueprint_fields: List[str],
    doc_label: str,
) -> Dict[str, Any]:
    output = {}

    for bp_field in blueprint_fields:
        bp_low = bp_field.lower().replace(" ", "_")

        if "name" in bp_low and "father" not in bp_low:
            val = (
                raw_fields.get("name")
                or raw_fields.get("full_name")
                or raw_fields.get("student_name")
                or raw_fields.get("candidate")
                or raw_fields.get("employee_name")
                or raw_fields.get(bp_field)
                or raw_fields.get(bp_low)
                or "NOT_DETECTED"
            )
            output[bp_field] = val

        elif "father" in bp_low or "parent" in bp_low:
            output[bp_field] = (
                raw_fields.get("father_name")
                or raw_fields.get("parent___guardian")
                or raw_fields.get("parent's_name")
                or raw_fields.get(bp_field)
                or raw_fields.get(bp_low)
                or "NOT_DETECTED"
            )

        elif "dob" in bp_low or "date_of_birth" in bp_low or "birth" in bp_low:
            output[bp_field] = (
                raw_fields.get("date_of_birth")
                or raw_fields.get("dob")
                or raw_fields.get(bp_field)
                or raw_fields.get(bp_low)
                or "NOT_DETECTED"
            )

        elif any(k in bp_low for k in ["number", "no", "reference", "pan_number", "aadhar_number"]):
            output[bp_field] = (
                raw_fields.get("document_id")
                or raw_fields.get("tax_reference")
                or raw_fields.get("document_reference")
                or raw_fields.get("reference_number")
                or raw_fields.get(bp_field)
                or raw_fields.get(bp_low)
                or "NOT_DETECTED"
            )

        elif "email" in bp_low:
            output[bp_field] = raw_fields.get("email") or raw_fields.get(bp_field) or "NOT_DETECTED"

        elif any(k in bp_low for k in ["mobile", "phone"]):
            phone_val = raw_fields.get("phone") or raw_fields.get(bp_field)
            if phone_val and ("DEMO" not in str(phone_val) and "FORM" not in str(phone_val)):
                output[bp_field] = str(phone_val)
            else:
                output[bp_field] = "NOT_DETECTED"

        elif any(k in bp_low for k in ["address", "location", "city"]):
            output[bp_field] = raw_fields.get("address") or raw_fields.get("city") or raw_fields.get(bp_field) or "NOT_DETECTED"

        elif "face" in bp_low or "photo" in bp_low:
            output[bp_field] = "YES" if ("photo" in doc_label.lower() or doc_label == "Employee Photo") else "YES (Detected on ID)"

        else:
            output[bp_field] = raw_fields.get(bp_field) or raw_fields.get(bp_low) or "NOT_DETECTED"

    return output


def build_id_contract_files_from_ocr(
    extraction_output: Dict[str, Any],
    custom_id_prefix: str = "DOC",
    blueprint: Dict[str, Any] = None,
) -> Tuple[List[DocumentFileItem], Dict[str, Dict[str, Any]]]:
    docs = extraction_output.get("documents", [])

    if not blueprint:
        blueprint = {
            "Resume": ["resume_name", "resume_email", "resume_mobile_no", "resume_current_address", "resume_father_name"],
            "Employee Photo": ["face detected(Y/N)"],
            "PAN": ["pan_name", "pan_dob", "pan_number", "pan_father_name"],
            "Aadhar": ["aadhar_name", "aadhar_dob", "aadhar_number", "aadhar_address"]
        }

    grouped_targets: Dict[str, Dict[str, Any]] = {}

    for doc in docs:
        d_type = doc.get("document_type", "Document")
        ext_data = doc.get("extracted_data", {})
        quality = doc.get("quality_assessment", {})

        target_group = None
        for bp_key in blueprint.keys():
            if bp_key.lower() == d_type.lower():
                target_group = bp_key
                break

        # Group sub-certificates (internships/trainings) under Resume if not declared separately
        if not target_group:
            if d_type in ["Experience_or_Internship", "Experience_Certificate"] and "Resume" in blueprint:
                target_group = "Resume"
            elif d_type in ["HR_Form", "Marksheet", "Payslip", "Bank_Proof"]:
                target_group = d_type
            else:
                target_group = d_type

        if target_group not in grouped_targets:
            grouped_targets[target_group] = {
                "fields": dict(ext_data),
                "quality": quality,
            }
        else:
            for k, v in ext_data.items():
                if v and v != "NOT_DETECTED":
                    if k == "phone" and ("DEMO" in str(v) or "FORM" in str(v)):
                        continue
                    grouped_targets[target_group]["fields"][k] = v

    files_payload = []
    evidence_map = {}

    for idx, (doc_name, data_container) in enumerate(grouped_targets.items(), start=1):
        clean_code = re.sub(r"[^A-Za-z0-9]", "", doc_name)[:4].upper()
        doc_id = f"{custom_id_prefix}-{idx:03d}-{clean_code}"

        if doc_name in blueprint:
            req_fields = blueprint[doc_name]
            structured_data = _map_extracted_to_blueprint_fields(
                data_container["fields"],
                req_fields,
                doc_name,
            )
        else:
            structured_data = _clean_extracted_fields(data_container["fields"])

        structured_data["_quality_status"] = data_container["quality"].get("quality_status", "HIGH")
        structured_data["_confidence"] = data_container["quality"].get("confidence_score", 0.98)

        item = DocumentFileItem(
            id=doc_id,
            label=doc_name,
            url=None,
            ocr_data=structured_data,
        )
        files_payload.append(item)
        evidence_map[doc_id] = structured_data

    return files_payload, evidence_map