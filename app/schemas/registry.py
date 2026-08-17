import json
import re
from pathlib import Path

from app.schemas.document_schema import (
    DocumentSchema,
    FieldDefinition,
)


SCHEMA_FILE = Path(
    "config/document_types/document_types.json"
)


class DocumentSchemaRegistry:

    def __init__(self):
        self.schemas: dict[str, DocumentSchema] = {}
        self.load_schemas()

    # =====================================================
    # NORMALIZE DOCUMENT TYPE
    # =====================================================

    @staticmethod
    def _normalize_document_type(
        document_type: str,
    ) -> str:

        value = document_type.strip().lower()

        # Handle common naming variations
        value = value.replace(
            "aadhaar",
            "aadhar",
        )

        # Remove spaces, underscores, hyphens,
        # slashes and other separators.
        value = re.sub(
            r"[^a-z0-9]",
            "",
            value,
        )

        return value

    # =====================================================
    # LOAD CENTRAL JSON
    # =====================================================

    def load_schemas(self):

        self.schemas.clear()

        if not SCHEMA_FILE.exists():

            print(
                f"Schema file not found: "
                f"{SCHEMA_FILE}"
            )

            return

        try:

            with open(
                SCHEMA_FILE,
                "r",
                encoding="utf-8",
            ) as f:

                data = json.load(f)

            if not isinstance(
                data,
                dict,
            ):

                raise ValueError(
                    "document_types.json must contain "
                    "a JSON object."
                )

            # =================================================
            # CENTRAL JSON STRUCTURE
            #
            # {
            #     "Resume": [
            #         "resume_name",
            #         "resume_email"
            #     ],
            #
            #     "PAN": [
            #         "pan_name",
            #         "pan_dob"
            #     ]
            # }
            # =================================================

            for document_type, parameters in data.items():

                if not isinstance(
                    parameters,
                    list,
                ):

                    print(
                        f"Skipping '{document_type}': "
                        f"parameters must be a list."
                    )

                    continue

                fields = []

                for parameter in parameters:

                    if not isinstance(
                        parameter,
                        str,
                    ):

                        print(
                            f"Skipping invalid parameter "
                            f"'{parameter}' in "
                            f"'{document_type}'."
                        )

                        continue

                    fields.append(
                        FieldDefinition(
                            name=parameter
                        )
                    )

                schema = DocumentSchema(
                    document_type=document_type,
                    fields=fields,
                )

                normalized_key = (
                    self._normalize_document_type(
                        document_type
                    )
                )

                self.schemas[
                    normalized_key
                ] = schema

            print(
                f"Loaded {len(self.schemas)} "
                f"document schemas from "
                f"{SCHEMA_FILE}"
            )

        except Exception as e:

            print(
                f"Failed loading central schema: {e}"
            )

    # =====================================================
    # GET SCHEMA
    # =====================================================

    def get(
        self,
        document_type: str,
    ):

        normalized_key = (
            self._normalize_document_type(
                document_type
            )
        )

        return self.schemas.get(
            normalized_key
        )

    # =====================================================
    # GET FIELD NAMES
    # =====================================================

    def get_fields(
        self,
        document_type: str,
    ) -> list[str]:

        schema = self.get(
            document_type
        )

        if not schema:

            return []

        return [
            field.name
            for field in schema.fields
        ]

    # =====================================================
    # RELOAD
    # =====================================================

    def reload(self):

        self.load_schemas()


schema_registry = DocumentSchemaRegistry()