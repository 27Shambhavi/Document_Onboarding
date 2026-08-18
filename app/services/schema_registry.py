import json
import re
from pathlib import Path
from typing import Any


# =============================================================
# COMPANY BLUEPRINT DIRECTORY
# =============================================================

COMPANIES_DIRECTORY = Path(
    "config/companies"
)


class SchemaRegistryService:
    """
    Persistent company-specific blueprint storage.

    Every company has exactly ONE blueprint file:

        config/
        └── companies/
            └── ABC/
                └── document_types.json

    The service stores the blueprint exactly in the
    standardized format produced by BlueprintParser.
    """

    # =========================================================
    # SAFE COMPANY ID
    # =========================================================

    @staticmethod
    def _safe_company_id(
        company_id: str,
    ) -> str:

        if not company_id:

            raise ValueError(
                "company_id is required"
            )

        safe_id = re.sub(
            r"[^a-zA-Z0-9_-]",
            "_",
            str(
                company_id
            ).strip(),
        )

        if not safe_id:

            raise ValueError(
                "Invalid company_id"
            )

        return safe_id

    # =========================================================
    # COMPANY DIRECTORY
    # =========================================================

    @classmethod
    def _get_company_directory(
        cls,
        company_id: str,
    ) -> Path:

        safe_company_id = (
            cls._safe_company_id(
                company_id
            )
        )

        company_directory = (
            COMPANIES_DIRECTORY
            / safe_company_id
        )

        company_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        return company_directory

    # =========================================================
    # SCHEMA FILE
    # =========================================================

    @classmethod
    def _get_schema_file(
        cls,
        company_id: str,
    ) -> Path:

        return (
            cls._get_company_directory(
                company_id
            )
            / "document_types.json"
        )

    # =========================================================
    # VALIDATE BLUEPRINT
    # =========================================================

    @classmethod
    def _validate_blueprint(
        cls,
        master_schemas: dict,
    ) -> None:
        """
        Validate the structure before saving.

        Expected:

        {
            "pan": {
                "document_type": "pan",
                "display_name": "PAN",
                "fields": [...]
            }
        }
        """

        if not isinstance(
            master_schemas,
            dict,
        ):

            raise ValueError(
                "Blueprint must be a JSON object."
            )

        if not master_schemas:

            raise ValueError(
                "Blueprint cannot be empty."
            )

        for (
            document_name,
            document_definition,
        ) in master_schemas.items():

            if not isinstance(
                document_definition,
                dict,
            ):

                raise ValueError(
                    f"Invalid blueprint for "
                    f"'{document_name}'."
                )

            document_type = (
                document_definition.get(
                    "document_type"
                )
            )

            display_name = (
                document_definition.get(
                    "display_name"
                )
            )

            fields = (
                document_definition.get(
                    "fields"
                )
            )

            if not document_type:

                raise ValueError(
                    f"'{document_name}' is missing "
                    "'document_type'."
                )

            if not display_name:

                raise ValueError(
                    f"'{document_name}' is missing "
                    "'display_name'."
                )

            if not isinstance(
                fields,
                list,
            ):

                raise ValueError(
                    f"'{document_name}' must contain "
                    "'fields' as a list."
                )

            for index, field in enumerate(
                fields
            ):

                if not isinstance(
                    field,
                    dict,
                ):

                    raise ValueError(
                        f"Field {index} in "
                        f"'{document_name}' "
                        "must be an object."
                    )

                if not field.get(
                    "name"
                ):

                    raise ValueError(
                        f"Field {index} in "
                        f"'{document_name}' "
                        "is missing 'name'."
                    )

    # =========================================================
    # SAVE BLUEPRINT
    # =========================================================

    @classmethod
    def save_blueprint(
        cls,
        master_schemas: dict,
        company_id: str,
    ) -> dict:
        """
        Save the complete blueprint for one company.

        IMPORTANT:

        This method does NOT transform fields.

        Whatever valid structure comes from
        BlueprintParser is persisted directly.
        """

        if not company_id:

            raise ValueError(
                "company_id is required"
            )

        cls._validate_blueprint(
            master_schemas
        )

        schema_file = (
            cls._get_schema_file(
                company_id
            )
        )

        # =====================================================
        # WRITE BLUEPRINT
        # =====================================================

        with open(
            schema_file,
            "w",
            encoding="utf-8",
        ) as f:

            json.dump(
                master_schemas,
                f,
                indent=4,
                ensure_ascii=False,
            )

        # =====================================================
        # RETURN RESULT
        # =====================================================

        return {
            "status": "success",
            "company_id": company_id,
            "registered_document_types": list(
                master_schemas.keys()
            ),
            "total_types": len(
                master_schemas
            ),
            "schema_file": str(
                schema_file
            ),
        }

    # =========================================================
    # LOAD BLUEPRINT
    # =========================================================

    @classmethod
    def load_blueprint(
        cls,
        company_id: str,
    ) -> dict:
        """
        Load the complete blueprint for a company.
        """

        if not company_id:
            return {}

        schema_file = (
            cls._get_schema_file(
                company_id
            )
        )

        if not schema_file.exists():

            return {}

        try:

            with open(
                schema_file,
                "r",
                encoding="utf-8",
            ) as f:

                data = json.load(f)

        except json.JSONDecodeError as e:

            raise ValueError(
                f"Invalid company blueprint JSON: "
                f"{e}"
            )

        if not isinstance(
            data,
            dict,
        ):

            raise ValueError(
                "Company document_types.json "
                "must contain a JSON object."
            )

        return data

    # =========================================================
    # CHECK BLUEPRINT
    # =========================================================

    @classmethod
    def has_blueprint(
        cls,
        company_id: str,
    ) -> bool:

        if not company_id:
            return False

        schema_file = (
            cls._get_schema_file(
                company_id
            )
        )

        return schema_file.exists()

    # =========================================================
    # LIST DOCUMENT TYPES
    # =========================================================

    @classmethod
    def list_document_types(
        cls,
        company_id: str,
    ) -> list[str]:
        """
        Return only the document keys configured
        for the company.
        """

        blueprint = (
            cls.load_blueprint(
                company_id
            )
        )

        return list(
            blueprint.keys()
        )

    # =========================================================
    # DELETE BLUEPRINT
    # =========================================================

    @classmethod
    def delete_blueprint(
        cls,
        company_id: str,
    ) -> bool:
        """
        Delete a company's blueprint.

        Useful when completely replacing
        an existing company configuration.
        """

        schema_file = (
            cls._get_schema_file(
                company_id
            )
        )

        if not schema_file.exists():

            return False

        schema_file.unlink()

        return True


schema_registry_service = (
    SchemaRegistryService()
)