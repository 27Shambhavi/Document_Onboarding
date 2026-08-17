from typing import Any


class FieldValidator:
    """
    Generic dynamic field validator.

    The central document_types.json defines only the
    parameters that must be extracted for each document.

    Example:

        "PAN": [
            "pan_name",
            "pan_dob",
            "pan_number",
            "pan_father_name"
        ]

    Therefore this validator currently performs
    parameter-presence validation only.

    Document-specific rules such as:
        - PAN regex
        - Aadhaar format
        - date format
        - numeric ranges
        - etc.

    should only be added when those rules are explicitly
    defined in the document schema/configuration.
    """

    def validate(
        self,
        extracted_data: dict[str, Any],
        fields: list[dict[str, Any]],
    ) -> dict[str, Any]:

        missing_fields = []
        invalid_fields = []
        normalized_data = {}

        # =====================================================
        # CHECK EVERY REQUESTED PARAMETER
        # =====================================================

        for field in fields:

            field_name = field["name"]

            value = extracted_data.get(
                field_name
            )

            # =================================================
            # MISSING / EMPTY VALUE
            # =================================================

            if self._is_missing(value):

                missing_fields.append(
                    field_name
                )

                normalized_data[
                    field_name
                ] = None

                continue

            # =================================================
            # VALID VALUE
            # =================================================

            normalized_data[
                field_name
            ] = self._normalize_value(value)

        # =====================================================
        # FINAL VALIDATION RESULT
        # =====================================================

        is_valid = (
            len(missing_fields) == 0
            and len(invalid_fields) == 0
        )

        return {
            "valid": is_valid,
            "missing_fields": missing_fields,
            "invalid_fields": invalid_fields,
            "normalized_data": normalized_data,
        }

    # =========================================================
    # MISSING VALUE CHECK
    # =========================================================

    def _is_missing(
        self,
        value: Any,
    ) -> bool:

        if value is None:
            return True

        if isinstance(value, str):

            return value.strip() == ""

        if isinstance(value, list):

            return len(value) == 0

        if isinstance(value, dict):

            return len(value) == 0

        return False

    # =========================================================
    # BASIC NORMALIZATION
    # =========================================================

    def _normalize_value(
        self,
        value: Any,
    ) -> Any:

        # ---------------------------------------------
        # Strings
        # ---------------------------------------------

        if isinstance(value, str):

            return value.strip()

        # ---------------------------------------------
        # Lists
        # ---------------------------------------------

        if isinstance(value, list):

            return [
                self._normalize_value(item)
                for item in value
            ]

        # ---------------------------------------------
        # Dictionaries
        # ---------------------------------------------

        if isinstance(value, dict):

            return {
                key: self._normalize_value(
                    item
                )
                for key, item in value.items()
            }

        # ---------------------------------------------
        # Numbers / booleans / other values
        # ---------------------------------------------

        return value


field_validator = FieldValidator()