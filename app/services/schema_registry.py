import json
import os
from pathlib import Path

SCHEMA_DIR = Path("config/document_types")
MASTER_REQUIREMENTS_PATH = Path("config/company_requirements.json")


class SchemaRegistryService:

  @staticmethod
  def save_blueprint(master_schemas: dict) -> dict:
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Save individual document JSON schemas
    for doc_key, schema in master_schemas.items():
      file_path = SCHEMA_DIR / f"{doc_key}.json"
      with open(file_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=4)

    # 2. Save master checklist for candidate cross-verification
    with open(MASTER_REQUIREMENTS_PATH, "w", encoding="utf-8") as f:
      json.dump(
          {
              "total_documents_required": len(master_schemas),
              "required_document_types": list(master_schemas.keys()),
              "schemas": master_schemas,
          },
          f,
          indent=4,
      )

    return {
        "status": "success",
        "registered_document_types": list(master_schemas.keys()),
        "total_types": len(master_schemas),
    }


schema_registry_service = SchemaRegistryService()
schema_registry = schema_registry_service