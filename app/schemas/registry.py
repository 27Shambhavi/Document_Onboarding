import json
import re
from pathlib import Path
from typing import Any

from app.schemas.document_schema import (
    DocumentSchema,
    FieldDefinition,
)


# =============================================================
# GLOBAL SCHEMA
# =============================================================

SCHEMA_DIRECTORY = Path(
    "config/document_types"
)

MASTER_SCHEMA_FILE = (
    SCHEMA_DIRECTORY
    / "document_types.json"
)


# =============================================================
# COMPANY SCHEMAS
# =============================================================

COMPANY_SCHEMA_DIRECTORY = Path(
    "config/companies"
)


class DocumentSchemaRegistry:
    """
    Central document schema registry.

    GLOBAL:

        config/document_types/document_types.json

    COMPANY:

        config/companies/<company_id>/document_types.json

    IMPORTANT:

        When company_id is supplied,
        ONLY that company's blueprint is used.

        There is NO global fallback.

    This guarantees:

        ABC requirements
            !=
        XYZ requirements
            !=
        Global requirements
    """

    # =========================================================
    # DOCUMENT TYPE ALIASES
    # =========================================================

    DOCUMENT_TYPE_ALIASES = {

        "resume":
            "Resume",

        "employee_photo":
            "Employee Photo",

        "pan":
            "PAN",

        "aadhaar":
            "Aadhar",

        "aadhar":
            "Aadhar",

        "10th_mark_sheet":
            "10th Mark sheet",

        "10th_marksheet":
            "10th Mark sheet",

        "12th_mark_sheet":
            "12th Mark sheet",

        "12th_marksheet":
            "12th Mark sheet",

        "diploma_mark_sheet":
            "Diploma Mark sheet",

        "diploma_marksheet":
            "Diploma Mark sheet",

        "graduation_mark_sheet_certificate":
            "Graduation Mark sheet / Certificate",

        "graduation_marksheet":
            "Graduation Mark sheet / Certificate",

        "nsm_copy":
            "NSM Copy",

        "referral_form":
            "Referral form",

        "interviewer_evaluation_form":
            "Interviewer Evaluation Form",

        "application_for_employment":
            "Application for Employment",

        "cibil_consent_authorization_form":
            "Cibil Consent/Authorization form",

        "cibil_consentauthorization_form":
            "Cibil Consent/Authorization form",

        "efp_composite_declaration_form_11":
            "EFP Composite Declaration form 11",

        "pf_nomination_form2":
            "PF Nomination Form–2",

        "esic_declaration":
            "ESIC Declaration",

        "gratuity_form_f":
            "Gratuity form F",

        "previous_company_experience_letter":
            "Previous Company Experience letter",

        "previous_company_payslip":
            "Previous Company payslip",

        "cibil_declaration_form":
            "Cibil Declaration form",

        "cheque":
            "Cheque",

        "passbook":
            "Passbook",

        "bank_statement":
            "Bank Statement",

        "nominee_photo":
            "Nominee Photo",
    }

    # =========================================================
    # INIT
    # =========================================================

    def __init__(self):

        # -----------------------------------------------------
        # Global schemas
        # -----------------------------------------------------

        self.schemas: dict[
            str,
            DocumentSchema
        ] = {}

        # -----------------------------------------------------
        # Company schemas
        # -----------------------------------------------------

        self.company_schemas: dict[
            str,
            dict[str, DocumentSchema]
        ] = {}

        # -----------------------------------------------------
        # Load global schemas
        # -----------------------------------------------------

        self.load_schemas()

    # =========================================================
    # SAFE COMPANY ID
    # =========================================================

    @staticmethod
    def _safe_company_id(
        company_id: str,
    ) -> str:

        return re.sub(
            r"[^a-zA-Z0-9_-]",
            "_",
            str(
                company_id
            ).strip(),
        )

    # =========================================================
    # GLOBAL SCHEMAS
    # =========================================================

    def load_schemas(
        self,
    ) -> None:

        self.schemas.clear()

        SCHEMA_DIRECTORY.mkdir(
            parents=True,
            exist_ok=True,
        )

        if not MASTER_SCHEMA_FILE.exists():

            print(
                "Global document_types.json not found."
            )

            return

        try:

            with open(
                MASTER_SCHEMA_FILE,
                "r",
                encoding="utf-8",
            ) as f:

                master_data = json.load(
                    f
                )

            if not isinstance(
                master_data,
                dict,
            ):

                raise ValueError(
                    "Global document_types.json "
                    "must contain a JSON object."
                )

            self.schemas = (
                self._build_schemas(
                    master_data,
                    source="global",
                )
            )

            print(
                f"Loaded {len(self.schemas)} "
                "global document schemas."
            )

        except Exception as e:

            print(
                "Failed loading global schemas: "
                f"{e}"
            )

    # =========================================================
    # COMPANY SCHEMAS
    # =========================================================

    def load_company_schemas(
        self,
        company_id: str,
    ) -> dict[
        str,
        DocumentSchema
    ]:
        """
        Load ONLY the blueprint belonging
        to the specified company.
        """

        if not company_id:

            return {}

        safe_company_id = (
            self._safe_company_id(
                company_id
            )
        )

        schema_file = (
            COMPANY_SCHEMA_DIRECTORY
            / safe_company_id
            / "document_types.json"
        )

        # -----------------------------------------------------
        # Missing blueprint
        # -----------------------------------------------------

        if not schema_file.exists():

            print(
                f"No document blueprint found "
                f"for company '{company_id}'. "
                f"Expected: {schema_file}"
            )

            self.company_schemas[
                company_id
            ] = {}

            return {}

        # -----------------------------------------------------
        # Load
        # -----------------------------------------------------

        try:

            with open(
                schema_file,
                "r",
                encoding="utf-8",
            ) as f:

                master_data = json.load(
                    f
                )

            if not isinstance(
                master_data,
                dict,
            ):

                raise ValueError(
                    "Company document_types.json "
                    "must contain a JSON object."
                )

            schemas = (
                self._build_schemas(
                    master_data,
                    source=f"company:{company_id}",
                )
            )

            self.company_schemas[
                company_id
            ] = schemas

            print(
                f"Loaded {len(schemas)} schemas "
                f"for company '{company_id}'."
            )

            return schemas

        except Exception as e:

            print(
                f"Failed loading company "
                f"'{company_id}': {e}"
            )

            self.company_schemas[
                company_id
            ] = {}

            return {}

    # =========================================================
    # BUILD SCHEMAS
    # =========================================================

    def _build_schemas(
        self,
        master_data: dict[str, Any],
        source: str,
    ) -> dict[
        str,
        DocumentSchema
    ]:
        """
        Supports:

        1. Rich format:

            {
                "pan": {
                    "document_type": "pan",
                    "display_name": "PAN",
                    "fields": [...]
                }
            }

        2. Legacy format:

            {
                "pan": [
                    "pan_name",
                    "pan_dob"
                ]
            }
        """

        schemas: dict[
            str,
            DocumentSchema
        ] = {}

        for (
            document_name,
            document_definition,
        ) in master_data.items():

            try:

                # =================================================
                # RICH FORMAT
                # =================================================

                if isinstance(
                    document_definition,
                    dict,
                ):

                    document_type = (
                        document_definition.get(
                            "document_type"
                        )
                        or document_name
                    )

                    display_name = (
                        document_definition.get(
                            "display_name"
                        )
                        or document_name
                    )

                    raw_fields = (
                        document_definition.get(
                            "fields",
                            [],
                        )
                    )

                    if not isinstance(
                        raw_fields,
                        list,
                    ):

                        print(
                            f"Skipping '{document_name}': "
                            "'fields' must be a list."
                        )

                        continue

                    fields = (
                        self._build_fields(
                            raw_fields
                        )
                    )

                # =================================================
                # LEGACY FORMAT
                # =================================================

                elif isinstance(
                    document_definition,
                    list,
                ):

                    document_type = (
                        document_name
                    )

                    display_name = (
                        document_name
                    )

                    fields = (
                        self._build_legacy_fields(
                            document_definition
                        )
                    )

                # =================================================
                # INVALID
                # =================================================

                else:

                    print(
                        f"Skipping '{document_name}': "
                        "invalid document definition."
                    )

                    continue

                # =================================================
                # CANONICAL TYPE
                # =================================================

                canonical_type = (
                    self._canonical_document_type(
                        str(
                            document_type
                        )
                    )
                )

                if not canonical_type:

                    print(
                        f"Skipping '{document_name}': "
                        "empty document type."
                    )

                    continue

                # =================================================
                # CREATE SCHEMA
                # =================================================

                schema = DocumentSchema(
                    document_type=canonical_type,
                    fields=fields,
                    metadata={
                        "source": source,
                        "display_name": str(
                            display_name
                        ),
                    },
                )

                schemas[
                    canonical_type
                ] = schema

            except Exception as e:

                print(
                    f"Failed building schema "
                    f"for '{document_name}': {e}"
                )

        return schemas

    # =========================================================
    # BUILD RICH FIELDS
    # =========================================================

    def _build_fields(
        self,
        raw_fields: list,
    ) -> list[FieldDefinition]:

        fields = []

        for field_data in raw_fields:

            # -------------------------------------------------
            # Dictionary field
            # -------------------------------------------------

            if isinstance(
                field_data,
                dict,
            ):

                name = field_data.get(
                    "name"
                )

                if not name:
                    continue

                field_type = (
                    field_data.get(
                        "type",
                        "string",
                    )
                )

                required = bool(
                    field_data.get(
                        "required",
                        False,
                    )
                )

                fields.append(
                    FieldDefinition(
                        name=str(name),
                        type=str(
                            field_type
                        ),
                        required=required,
                    )
                )

            # -------------------------------------------------
            # String field
            # -------------------------------------------------

            elif isinstance(
                field_data,
                str,
            ):

                fields.append(
                    FieldDefinition(
                        name=field_data,
                        type="string",
                        required=False,
                    )
                )

        return fields

    # =========================================================
    # BUILD LEGACY FIELDS
    # =========================================================

    def _build_legacy_fields(
        self,
        field_names: list,
    ) -> list[FieldDefinition]:

        fields = []

        for field_name in field_names:

            fields.append(
                FieldDefinition(
                    name=str(
                        field_name
                    ),
                    type="string",
                    required=False,
                )
            )

        return fields

    # =========================================================
    # CANONICAL DOCUMENT TYPE
    # =========================================================

    def _canonical_document_type(
        self,
        document_name: str,
    ) -> str:
        """
        Convert document names into stable internal types.

        Important:

            Aadhar
            Aadhaar

        BOTH become:

            aadhaar

        This prevents:

            classifier = aadhaar
            registry = aadhar

        mismatch.
        """

        if not document_name:
            return ""

        normalized = (
            str(document_name)
            .strip()
            .lower()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("/", "_")
        )

        # -----------------------------------------------------
        # AADHAAR
        # -----------------------------------------------------

        if normalized in {
            "aadhaar",
            "aadhar",
        }:

            return "aadhaar"

        # -----------------------------------------------------
        # PAN
        # -----------------------------------------------------

        if normalized in {
            "pan",
        }:

            return "pan"

        # -----------------------------------------------------
        # RESUME
        # -----------------------------------------------------

        if normalized in {
            "resume",
            "cv",
        }:

            return "resume"

        # -----------------------------------------------------
        # 10TH
        # -----------------------------------------------------

        if normalized in {
            "10th",
            "10th_mark_sheet",
            "10th_marksheet",
        }:

            return "10th_mark_sheet"

        # -----------------------------------------------------
        # 12TH
        # -----------------------------------------------------

        if normalized in {
            "12th",
            "12th_mark_sheet",
            "12th_marksheet",
        }:

            return "12th_mark_sheet"

        # -----------------------------------------------------
        # DIPLOMA
        # -----------------------------------------------------

        if normalized in {
            "diploma",
            "diploma_mark_sheet",
            "diploma_marksheet",
        }:

            return "diploma_mark_sheet"

        # -----------------------------------------------------
        # GRADUATION
        # -----------------------------------------------------

        if normalized in {
            "graduation_marksheet",
            "graduation_mark_sheet",
            "graduation_marksheet_certificate",
            "graduation_mark_sheet_certificate",
        }:

            return (
                "graduation_mark_sheet_certificate"
            )

        # -----------------------------------------------------
        # Explicit aliases
        # -----------------------------------------------------

        for (
            canonical,
            display_name,
        ) in (
            self.DOCUMENT_TYPE_ALIASES.items()
        ):

            if (
                display_name.lower()
                == str(
                    document_name
                ).strip().lower()
            ):

                return canonical

        return normalized

    # =========================================================
    # CLASSIFIER NORMALIZATION
    # =========================================================

    def _canonical_from_classifier(
        self,
        document_type: str,
    ) -> str:
        """
        Normalize classifier output using the SAME
        canonical rules as the registry.
        """

        if not document_type:
            return ""

        return (
            self._canonical_document_type(
                document_type
            )
        )

    # =========================================================
    # GET SCHEMA
    # =========================================================

    def get(
        self,
        document_type: str,
        company_id: str | None = None,
    ) -> DocumentSchema | None:
        """
        Get schema.

        If company_id exists:

            ONLY company schema.

        No global fallback.
        """

        if not document_type:
            return None

        canonical_type = (
            self._canonical_from_classifier(
                document_type
            )
        )

        # =====================================================
        # COMPANY LOOKUP
        # =====================================================

        if company_id:

            if (
                company_id
                not in self.company_schemas
            ):

                self.load_company_schemas(
                    company_id
                )

            return (
                self.company_schemas
                .get(
                    company_id,
                    {},
                )
                .get(
                    canonical_type
                )
            )

        # =====================================================
        # GLOBAL LOOKUP
        # =====================================================

        return self.schemas.get(
            canonical_type
        )

    # =========================================================
    # CHECK COMPANY DOCUMENT
    # =========================================================

    def has_document_type(
        self,
        document_type: str,
        company_id: str,
    ) -> bool:

        if not company_id:
            return False

        return (
            self.get(
                document_type=document_type,
                company_id=company_id,
            )
            is not None
        )

    # =========================================================
    # RELOAD GLOBAL
    # =========================================================

    def reload(
        self,
    ) -> None:

        self.load_schemas()

    # =========================================================
    # RELOAD COMPANY
    # =========================================================

    def reload_company(
        self,
        company_id: str,
    ) -> dict[
        str,
        DocumentSchema
    ]:

        self.company_schemas.pop(
            company_id,
            None,
        )

        return (
            self.load_company_schemas(
                company_id
            )
        )

    # =========================================================
    # LIST GLOBAL TYPES
    # =========================================================

    def list_document_types(
        self,
    ) -> list[str]:

        return list(
            self.schemas.keys()
        )

    # =========================================================
    # LIST COMPANY TYPES
    # =========================================================

    def list_company_document_types(
        self,
        company_id: str,
    ) -> list[str]:
        """
        Return ONLY document types configured
        by this company.
        """

        if not company_id:
            return []

        if (
            company_id
            not in self.company_schemas
        ):

            self.load_company_schemas(
                company_id
            )

        return list(
            self.company_schemas
            .get(
                company_id,
                {},
            )
            .keys()
        )


# =============================================================
# SINGLE REGISTRY INSTANCE
# =============================================================

schema_registry = (
    DocumentSchemaRegistry()
)