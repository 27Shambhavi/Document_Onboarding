from typing import Any, Dict, List


class CrossDocumentAuditor:
    @staticmethod
    def merge_pages(page_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged_documents = []
        current_doc = None

        for page in page_results:
            doc_type = page["document_type"]
            quality = page.get("quality", "GOOD")

            if quality == "BAD":
                merged_documents.append({
                    "document_type": "unknown",
                    "pages": [page["page_number"]],
                    "status": "QUALITY_FAILED",
                    "reason": page.get("quality_reason", "Low image quality"),
                    "extracted_data": {},
                })
                continue

            if current_doc and current_doc["document_type"] == doc_type and doc_type != "unknown":
                current_doc["pages"].append(page["page_number"])
                # Merge non-null fields
                for k, v in page.get("extracted_data", {}).items():
                    if v is not None:
                        current_doc["extracted_data"][k] = v
            else:
                if current_doc:
                    merged_documents.append(current_doc)
                current_doc = {
                    "document_type": doc_type,
                    "pages": [page["page_number"]],
                    "status": "SUCCESS" if doc_type != "unknown" else "UNMATCHED_UNKNOWN",
                    "confidence": page.get("confidence_score", 1.0),
                    "extracted_data": page.get("extracted_data", {}),
                }

        if current_doc:
            merged_documents.append(current_doc)

        return merged_documents

    @staticmethod
    def audit_checklist(detected_docs: List[Dict[str, Any]], company_schemas: Dict[str, Any]) -> Dict[str, Any]:
        required_types = list(company_schemas.keys())
        detected_types = list({d["document_type"] for d in detected_docs if d["document_type"] != "unknown"})
        missing_docs = [t for t in required_types if t not in detected_types]

        return {
            "total_company_requirements": len(required_types),
            "total_detected": len(detected_types),
            "completeness_percentage": round((len(detected_types) / len(required_types)) * 100, 2) if required_types else 100.0,
            "missing_documents": missing_docs,
            "status": "COMPLETE" if not missing_docs else "INCOMPLETE",
        }


cross_auditor = CrossDocumentAuditor()