import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


class GuidelineRegistryService:

    def __init__(self, base_path: str = "config/companies"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_company_dir(self, company_id: str) -> Path:
        safe_id = "".join(c for c in company_id if c.isalnum() or c in ("-", "_")).strip() or "DEFAULT_COMPANY"
        company_dir = self.base_path / safe_id
        company_dir.mkdir(parents=True, exist_ok=True)
        return company_dir

    def save_blueprint(self, company_id: str, blueprint_data: Any) -> Any:
        file_path = self._get_company_dir(company_id) / "blueprint.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(blueprint_data, f, indent=2, ensure_ascii=False)
        return blueprint_data

    def get_blueprint(self, company_id: str) -> Dict[str, Any]:
        """
        Blueprint Loading Hierarchy:
        1. Company specific config: config/companies/<company_id>/blueprint.json
        2. Root requirement config: config/company_requirements.json
        3. Master types config: config/document_types/document_types.json
        4. Standard fallback dictionary
        """
        # 1. Check company specific blueprint
        file_path = self._get_company_dir(company_id) / "blueprint.json"
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # 2. Check root company_requirements.json
        req_path = Path("config/company_requirements.json")
        if req_path.exists():
            try:
                with open(req_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # 3. Check master document_types.json
        types_path = Path("config/document_types/document_types.json")
        if types_path.exists():
            try:
                with open(types_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # 4. Standard default fallback
        return {
            "Resume": ["resume_name", "resume_email", "resume_mobile_no", "resume_current_address", "resume_father_name"],
            "Employee Photo": ["face detected(Y/N)"],
            "PAN": ["pan_name", "pan_dob", "pan_number", "pan_father_name"],
            "Aadhar": ["aadhar_name", "aadhar_dob", "aadhar_number", "aadhar_address"],
        }

    def save_guidelines(self, company_id: str, guidelines: List[str]) -> List[str]:
        file_path = self._get_company_dir(company_id) / "guidelines.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(guidelines, f, indent=2, ensure_ascii=False)
        return guidelines

    def get_guidelines(self, company_id: str) -> List[str]:
        file_path = self._get_company_dir(company_id) / "guidelines.json"
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        return [
            "Resume must contain Candidate Name, Email ID, and Mobile Number.",
            "PAN Card must contain Name, Date of Birth, and a valid PAN Number.",
            "Aadhaar Card must contain Name, Date of Birth, and Address.",
            "Candidate Name on PAN Card must match the name provided on Aadhaar Card.",
        ]


guideline_registry = GuidelineRegistryService()