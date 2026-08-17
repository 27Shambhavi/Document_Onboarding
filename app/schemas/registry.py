import json
from pathlib import Path

from app.schemas.document_schema import DocumentSchema


SCHEMA_DIRECTORY = Path("config/document_types")


class DocumentSchemaRegistry:

    def __init__(self):
        self.schemas = {}
        self.load_schemas()

    def load_schemas(self):

        SCHEMA_DIRECTORY.mkdir(
            parents=True,
            exist_ok=True,
        )

        for file in SCHEMA_DIRECTORY.glob("*.json"):

            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                schema = DocumentSchema(**data)

                self.schemas[
                    schema.document_type
                ] = schema

            except Exception as e:
                print(
                    f"Failed loading schema {file}: {e}"
                )

    def get(self, document_type: str):

        return self.schemas.get(document_type)

    def reload(self):

        self.schemas.clear()
        self.load_schemas()


schema_registry = DocumentSchemaRegistry()