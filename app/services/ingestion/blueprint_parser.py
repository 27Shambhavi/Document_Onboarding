import json
import re
from io import BytesIO
from docx import Document


class BlueprintParser:

    @staticmethod
    def _sanitize_field_name(name: str) -> str:
        clean = re.sub(r"[^\w\s]", "", name).strip().lower()
        return re.sub(r"\s+", "_", clean)

    @staticmethod
    def _infer_type(field_name: str) -> str:
        field_lower = field_name.lower()
        if any(d in field_lower for d in ["dob", "date", "yop", "year"]):
            return "date"
        if any(b in field_lower for b in ["(y/n)", "accepted", "completed"]):
            return "boolean"
        if any(n in field_lower for n in ["marks", "salary", "pay", "percentage"]):
            return "number"
        if any(a in field_lower for a in ["skills", "subjects", "details"]):
            return "array"
        return "string"

    @classmethod
    def parse_raw_dict(cls, data: dict) -> dict:
        """Converts raw blueprint dictionary into standard document schemas."""
        master_schemas = {}
        for doc_name, fields in data.items():
            doc_key = cls._sanitize_field_name(doc_name)
            field_definitions = []
            for field in fields:
                field_key = cls._sanitize_field_name(field)
                field_definitions.append(
                    {
                        "name": field_key,
                        "original_name": field,
                        "type": cls._infer_type(field),
                        "required": True,
                        "description": f"Extracted value for {field}",
                    }
                )
            master_schemas[doc_key] = {
                "document_type": doc_key,
                "display_name": doc_name,
                "fields": field_definitions,
            }
        return master_schemas

    @classmethod
    def parse_docx(cls, file_bytes: bytes) -> dict:
        """Extracts key-value document rules from uploaded Word documents."""
        doc = Document(BytesIO(file_bytes))
        raw_text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])

        # If table structured in docx
        extracted_blueprint = {}
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells]
                if len(cells) >= 2:
                    doc_type = cells[0]
                    fields = [f.strip() for f in cells[1].split(",") if f.strip()]
                    if doc_type:
                        extracted_blueprint[doc_type] = fields

        return (
            cls.parse_raw_dict(extracted_blueprint)
            if extracted_blueprint
            else raw_text
        )


blueprint_parser = BlueprintParser()