import json
from pathlib import Path
from typing import Any

from app.schemas.document_schema import (
    DocumentSchema,
    FieldDefinition,
)


SCHEMA_DIRECTORY = Path("config/document_types")
MASTER_SCHEMA_FILE = SCHEMA_DIRECTORY / "document_types.json"


class DocumentSchemaRegistry:
    """
    Central registry for all document schemas.

    Source of truth:
        config/document_types/document_types.json

    Example:

        {
            "PAN": [
                "pan_name",
                "pan_dob",
                "pan_number"
            ]
        }

    The rest of the application continues to use:

        schema_registry.get("pan")
    """

    # ---------------------------------------------------------
    # DOCUMENT TYPE ALIASES
    # ---------------------------------------------------------

    DOCUMENT_TYPE_ALIASES = {
        "resume": "Resume",
        "employee_photo": "Employee Photo",
        "pan": "PAN",
        "aadhaar": "Aadhar",
        "10th_marksheet": "10th Mark sheet",
        "12th_marksheet": "12th Mark sheet",
        "diploma_marksheet": "Diploma Mark sheet",
        "graduation_marksheet": "Graduation Mark sheet / Certificate",
        "nsm_copy": "NSM Copy",
        "referral_form": "Referral form",
        "interviewer_evaluation_form": "Interviewer Evaluation Form",
        "application_for_employment": "Application for Employment",
        "cibil_consent_authorization_form": "Cibil Consent/Authorization form",
        "efp_composite_declaration_form_11": "EFP Composite Declaration form 11",
        "pf_nomination_form2": "PF Nomination Form–2",
        "esic_declaration": "ESIC Declaration",
        "gratuity_form_f": "Gratuity form F",
        "previous_company_experience_letter": "Previous Company Experience letter",
        "previous_company_payslip": "Previous Company payslip",
        "cibil_declaration_form": "Cibil Declaration form",
        "cheque": "Cheque",
        "passbook": "Passbook",
        "bank_statement": "Bank Statement",
        "nominee_photo": "Nominee Photo",
    }

    # ---------------------------------------------------------
    # INITIALIZATION
    # ---------------------------------------------------------

    def __init__(self):
        self.schemas: dict[str, DocumentSchema] = {}
        self.load_schemas()

    # ---------------------------------------------------------
    # LOAD MASTER JSON
    # ---------------------------------------------------------

    def load_schemas(self):

        self.schemas.clear()

        SCHEMA_DIRECTORY.mkdir(
            parents=True,
            exist_ok=True,
        )

        if not MASTER_SCHEMA_FILE.exists():

            print(
                f"Master schema not found: "
                f"{MASTER_SCHEMA_FILE}"
            )

            return

        try:

            with open(
                MASTER_SCHEMA_FILE,
                "r",
                encoding="utf-8",
            ) as f:

                master_data = json.load(f)

            if not isinstance(
                master_data,
                dict,
            ):

                raise ValueError(
                    "document_types.json must contain "
                    "a JSON object."
                )

            for document_name, field_names in (
                master_data.items()
            ):

                # -----------------------------------------
                # Validate field list
                # -----------------------------------------

                if not isinstance(
                    field_names,
                    list,
                ):

                    print(
                        f"Skipping '{document_name}': "
                        f"fields must be a list."
                    )

                    continue

                fields = []

                for field_name in field_names:

                    fields.append(
                        FieldDefinition(
                            name=str(field_name),
                            type="string",
                            required=False,
                        )
                    )

                # -----------------------------------------
                # Convert display name to canonical ID
                # -----------------------------------------

                canonical_type = (
                    self._canonical_document_type(
                        document_name
                    )
                )

                schema = DocumentSchema(
                    document_type=canonical_type,
                    fields=fields,
                    metadata={
                        "source": (
                            "document_types.json"
                        ),
                        "display_name": (
                            document_name
                        ),
                    },
                )

                self.schemas[
                    canonical_type
                ] = schema

            print(
                f"Loaded {len(self.schemas)} "
                f"document schemas."
            )

        except Exception as e:

            print(
                f"Failed loading master schema: {e}"
            )

    # ---------------------------------------------------------
    # CANONICAL DOCUMENT TYPE
    # ---------------------------------------------------------

    def _canonical_document_type(
        self,
        document_name: str,
    ) -> str:

        normalized = (
            document_name
            .strip()
            .lower()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("/", "_")
        )

        # -----------------------------------------
        # Explicit mappings
        # -----------------------------------------

        for canonical, display_name in (
            self.DOCUMENT_TYPE_ALIASES.items()
        ):

            if (
                display_name.lower()
                == document_name.strip().lower()
            ):

                return canonical

        # -----------------------------------------
        # Generic fallback
        # -----------------------------------------

        return normalized

    # ---------------------------------------------------------
    # GET SCHEMA
    # ---------------------------------------------------------

    def get(
        self,
        document_type: str,
    ) -> DocumentSchema | None:

        if not document_type:
            return None

        canonical_type = (
            self._canonical_from_classifier(
                document_type
            )
        )

        return self.schemas.get(
            canonical_type
        )

    # ---------------------------------------------------------
    # NORMALIZE CLASSIFIER TYPE
    # ---------------------------------------------------------

    def _canonical_from_classifier(
        self,
        document_type: str,
    ) -> str:

        normalized = (
            document_type
            .strip()
            .lower()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("/", "_")
        )

        # Direct match
        if normalized in self.schemas:
            return normalized

        # Known aliases
        if normalized in self.DOCUMENT_TYPE_ALIASES:
            return normalized

        # Aadhaar spelling variations
        if normalized in {
            "aadhar",
            "aadhaar",
        }:

            return "aadhaar"

        # 10th variations
        if normalized in {
            "10th_mark_sheet",
            "10th_marksheet",
            "10th",
        }:

            return "10th_marksheet"

        # 12th variations
        if normalized in {
            "12th_mark_sheet",
            "12th_marksheet",
            "12th",
        }:

            return "12th_marksheet"

        return normalized

    # ---------------------------------------------------------
    # RELOAD
    # ---------------------------------------------------------

    def reload(self):

        self.load_schemas()

    # ---------------------------------------------------------
    # LIST DOCUMENT TYPES
    # ---------------------------------------------------------

    def list_document_types(self) -> list[str]:

        return list(
            self.schemas.keys()
        )


schema_registry = DocumentSchemaRegistry()