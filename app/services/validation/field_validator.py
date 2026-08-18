from typing import Any


class FieldValidator:
    """
    Generic schema-driven field validator.

    The company blueprint defines exactly which fields are
    required for a document.

    Example:

        ABC → PAN

        pan_name
        pan_dob
        pan_number
        pan_father_name

    The validator:

        1. Checks only configured fields.
        2. Detects missing values.
        3. Normalizes basic values.
        4. Preserves extra information from the extractor
           OUTSIDE the validated schema from entering the
           normalized result.
        5. Does not invent or infer values.
        6. Does not apply document-specific rules unless
           those rules are explicitly provided by the schema.
    """

    # =========================================================
    # VALIDATE
    # =========================================================

    def validate(
        self,
        extracted_data: dict[str, Any],
        fields: list[Any],
    ) -> dict[str, Any]:

        missing_fields: list[str] = []
        invalid_fields: list[str] = []
        normalized_data: dict[str, Any] = {}

        # -----------------------------------------------------
        # Safety
        # -----------------------------------------------------

        if not isinstance(
            extracted_data,
            dict,
        ):
            extracted_data = {}

        if not isinstance(
            fields,
            list,
        ):
            fields = []

        # =====================================================
        # CHECK ONLY BLUEPRINT FIELDS
        # =====================================================

        for field in fields:

            field_name = self._get_field_name(
                field
            )

            if not field_name:
                continue

            value = extracted_data.get(
                field_name
            )

            # =================================================
            # MISSING
            # =================================================

            if self._is_missing(
                value
            ):

                missing_fields.append(
                    field_name
                )

                normalized_data[
                    field_name
                ] = None

                continue

            # =================================================
            # TYPE VALIDATION
            # =================================================

            field_type = self._get_field_type(
                field
            )

            normalized_value, is_valid = (
                self._normalize_and_validate_type(
                    value=value,
                    field_type=field_type,
                )
            )

            if not is_valid:

                invalid_fields.append(
                    field_name
                )

                normalized_data[
                    field_name
                ] = normalized_value

                continue

            # =================================================
            # VALID
            # =================================================

            normalized_data[
                field_name
            ] = normalized_value

        # =====================================================
        # FINAL RESULT
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
    # GET FIELD NAME
    # =========================================================

    @staticmethod
    def _get_field_name(
        field: Any,
    ) -> str:

        # -----------------------------------------------------
        # Dictionary
        # -----------------------------------------------------

        if isinstance(
            field,
            dict,
        ):

            return str(
                field.get(
                    "name",
                    "",
                )
            )

        # -----------------------------------------------------
        # Pydantic / FieldDefinition object
        # -----------------------------------------------------

        return str(
            getattr(
                field,
                "name",
                "",
            )
        )

    # =========================================================
    # GET FIELD TYPE
    # =========================================================

    @staticmethod
    def _get_field_type(
        field: Any,
    ) -> str:

        if isinstance(
            field,
            dict,
        ):

            return str(
                field.get(
                    "type",
                    "string",
                )
            ).lower()

        return str(
            getattr(
                field,
                "type",
                "string",
            )
        ).lower()

    # =========================================================
    # REQUIRED CHECK
    # =========================================================

    @staticmethod
    def _is_required(
        field: Any,
    ) -> bool:

        if isinstance(
            field,
            dict,
        ):

            return bool(
                field.get(
                    "required",
                    False,
                )
            )

        return bool(
            getattr(
                field,
                "required",
                False,
            )
        )

    # =========================================================
    # MISSING VALUE
    # =========================================================

    def _is_missing(
        self,
        value: Any,
    ) -> bool:

        if value is None:
            return True

        # -----------------------------------------------------
        # Empty string
        # -----------------------------------------------------

        if isinstance(
            value,
            str,
        ):

            return (
                value.strip() == ""
            )

        # -----------------------------------------------------
        # Empty list
        # -----------------------------------------------------

        if isinstance(
            value,
            list,
        ):

            return len(value) == 0

        # -----------------------------------------------------
        # Empty dictionary
        # -----------------------------------------------------

        if isinstance(
            value,
            dict,
        ):

            return len(value) == 0

        return False

    # =========================================================
    # TYPE NORMALIZATION + VALIDATION
    # =========================================================

    def _normalize_and_validate_type(
        self,
        value: Any,
        field_type: str,
    ) -> tuple[Any, bool]:

        field_type = (
            field_type
            .strip()
            .lower()
        )

        # =====================================================
        # STRING
        # =====================================================

        if field_type in {
            "string",
            "str",
            "text",
        }:

            if isinstance(
                value,
                str,
            ):

                return (
                    value.strip(),
                    True,
                )

            # Do not silently convert complex objects
            # into strings.

            if isinstance(
                value,
                (
                    int,
                    float,
                    bool,
                ),
            ):

                return (
                    str(value),
                    True,
                )

            return (
                value,
                False,
            )

        # =====================================================
        # NUMBER
        # =====================================================

        if field_type in {
            "number",
            "float",
            "integer",
            "int",
        }:

            # Already numeric
            if isinstance(
                value,
                (
                    int,
                    float,
                ),
            ) and not isinstance(
                value,
                bool,
            ):

                return (
                    value,
                    True,
                )

            # Numeric string
            if isinstance(
                value,
                str,
            ):

                cleaned = value.strip()

                try:

                    if field_type in {
                        "integer",
                        "int",
                    }:

                        return (
                            int(
                                float(
                                    cleaned
                                )
                            ),
                            True,
                        )

                    return (
                        float(
                            cleaned
                        ),
                        True,
                    )

                except (
                    ValueError,
                    TypeError,
                ):

                    return (
                        value,
                        False,
                    )

            return (
                value,
                False,
            )

        # =====================================================
        # BOOLEAN
        # =====================================================

        if field_type in {
            "boolean",
            "bool",
        }:

            if isinstance(
                value,
                bool,
            ):

                return (
                    value,
                    True,
                )

            if isinstance(
                value,
                str,
            ):

                normalized = (
                    value
                    .strip()
                    .lower()
                )

                if normalized in {
                    "true",
                    "yes",
                    "y",
                    "1",
                    "present",
                    "detected",
                }:

                    return (
                        True,
                        True,
                    )

                if normalized in {
                    "false",
                    "no",
                    "n",
                    "0",
                    "absent",
                    "not detected",
                    "not_detected",
                }:

                    return (
                        False,
                        True,
                    )

            return (
                value,
                False,
            )

        # =====================================================
        # ARRAY
        # =====================================================

        if field_type in {
            "array",
            "list",
        }:

            if isinstance(
                value,
                list,
            ):

                return (
                    self._normalize_value(
                        value
                    ),
                    True,
                )

            return (
                value,
                False,
            )

        # =====================================================
        # DATE
        # =====================================================

        if field_type == "date":

            # -------------------------------------------------
            # We intentionally DO NOT transform the date.
            #
            # The document's visible representation is
            # preserved.
            # -------------------------------------------------

            if isinstance(
                value,
                str,
            ):

                cleaned = value.strip()

                if cleaned:

                    return (
                        cleaned,
                        True,
                    )

            return (
                value,
                False,
            )

        # =====================================================
        # OBJECT / DICT
        # =====================================================

        if field_type in {
            "object",
            "dict",
            "json",
        }:

            if isinstance(
                value,
                dict,
            ):

                return (
                    self._normalize_value(
                        value
                    ),
                    True,
                )

            return (
                value,
                False,
            )

        # =====================================================
        # UNKNOWN TYPE
        # =====================================================

        # If the schema contains an unknown type, don't reject
        # the value solely because of that unknown type.
        #
        # We still normalize basic containers.

        return (
            self._normalize_value(
                value
            ),
            True,
        )

    # =========================================================
    # BASIC NORMALIZATION
    # =========================================================

    def _normalize_value(
        self,
        value: Any,
    ) -> Any:

        # -----------------------------------------------------
        # String
        # -----------------------------------------------------

        if isinstance(
            value,
            str,
        ):

            return value.strip()

        # -----------------------------------------------------
        # List
        # -----------------------------------------------------

        if isinstance(
            value,
            list,
        ):

            return [
                self._normalize_value(
                    item
                )
                for item in value
            ]

        # -----------------------------------------------------
        # Dictionary
        # -----------------------------------------------------

        if isinstance(
            value,
            dict,
        ):

            return {
                key: self._normalize_value(
                    item
                )
                for key, item in value.items()
            }

        return value


# =============================================================
# SINGLETON
# =============================================================

field_validator = FieldValidator()