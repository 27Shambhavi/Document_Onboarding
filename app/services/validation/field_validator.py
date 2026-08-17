import re
from datetime import datetime
from typing import Any


class FieldValidator:
    """
    Generic dynamic field validator.

    Document-specific rules are NOT hardcoded here.
    They come from document-type JSON schemas.
    """

    def validate(
        self,
        extracted_data: dict[str, Any],
        fields: list[dict[str, Any]],
    ) -> dict[str, Any]:

        missing_fields = []
        invalid_fields = []
        normalized_data = {}

        for field in fields:

            field_name = field["name"]

            field_type = field.get(
                "type",
                "string",
            )

            required = field.get(
                "required",
                False,
            )

            pattern = field.get(
                "pattern"
            )

            normalize_rule = field.get(
                "normalize"
            )

            value = extracted_data.get(
                field_name
            )

            # =========================================
            # MISSING FIELD
            # =========================================

            if value is None or value == "":

                if required:
                    missing_fields.append(
                        field_name
                    )

                normalized_data[
                    field_name
                ] = None

                continue

            # =========================================
            # BASIC TYPE NORMALIZATION
            # =========================================

            normalized_value = self._normalize_type(
                value,
                field_type,
            )

            # =========================================
            # SCHEMA-DRIVEN NORMALIZATION
            # =========================================

            if normalize_rule:

                normalized_value = (
                    self._apply_normalization(
                        normalized_value,
                        normalize_rule,
                    )
                )

            # =========================================
            # TYPE VALIDATION
            # =========================================

            if not self._valid_type(
                normalized_value,
                field_type,
            ):

                invalid_fields.append(
                    {
                        "field": field_name,
                        "value": value,
                        "reason": (
                            f"Expected type "
                            f"{field_type}"
                        ),
                    }
                )

                normalized_data[
                    field_name
                ] = value

                continue

            # =========================================
            # PATTERN VALIDATION
            # =========================================

            if (
                pattern
                and isinstance(
                    normalized_value,
                    str,
                )
            ):

                if not re.fullmatch(
                    pattern,
                    normalized_value,
                ):

                    invalid_fields.append(
                        {
                            "field": field_name,
                            "value": value,
                            "reason": (
                                "Value does not "
                                "match required pattern"
                            ),
                        }
                    )

                    normalized_data[
                        field_name
                    ] = normalized_value

                    continue

            # =========================================
            # DATE VALIDATION
            # =========================================

            if field_type == "date":

                if not self._valid_date(
                    normalized_value
                ):

                    invalid_fields.append(
                        {
                            "field": field_name,
                            "value": value,
                            "reason": (
                                "Invalid date "
                                "format/value"
                            ),
                        }
                    )

                    normalized_data[
                        field_name
                    ] = normalized_value

                    continue

            # =========================================
            # VALID VALUE
            # =========================================

            normalized_data[
                field_name
            ] = normalized_value

        return {
            "valid": (
                len(missing_fields) == 0
                and len(invalid_fields) == 0
            ),
            "missing_fields": missing_fields,
            "invalid_fields": invalid_fields,
            "normalized_data": normalized_data,
        }

    # =====================================================
    # TYPE NORMALIZATION
    # =====================================================

    def _normalize_type(
        self,
        value: Any,
        field_type: str,
    ) -> Any:

        if field_type == "string":

            return str(value).strip()

        if field_type == "integer":

            if isinstance(value, bool):
                return value

            try:
                return int(value)

            except (
                ValueError,
                TypeError,
            ):
                return value

        if field_type == "number":

            if isinstance(value, bool):
                return value

            try:

                numeric_value = float(value)

                if numeric_value.is_integer():
                    return int(
                        numeric_value
                    )

                return numeric_value

            except (
                ValueError,
                TypeError,
            ):
                return value

        if field_type == "boolean":

            if isinstance(
                value,
                bool,
            ):
                return value

            if isinstance(
                value,
                str,
            ):

                lowered = (
                    value.strip()
                    .lower()
                )

                if lowered in {
                    "true",
                    "yes",
                    "1",
                }:
                    return True

                if lowered in {
                    "false",
                    "no",
                    "0",
                }:
                    return False

            return value

        if field_type == "array":

            if isinstance(
                value,
                list,
            ):
                return value

            return [value]

        if field_type == "date":

            return str(value).strip()

        return value

    # =====================================================
    # SCHEMA-DRIVEN NORMALIZATION
    # =====================================================

    def _apply_normalization(
        self,
        value: Any,
        rule: str,
    ) -> Any:

        if not isinstance(
            value,
            str,
        ):
            return value

        if rule == "remove_spaces":

            return value.replace(
                " ",
                "",
            )

        if rule == "remove_all_whitespace":

            return re.sub(
                r"\s+",
                "",
                value,
            )

        if rule == "uppercase":

            return value.upper()

        if rule == "lowercase":

            return value.lower()

        if rule == "strip":

            return value.strip()

        return value

    # =====================================================
    # TYPE VALIDATION
    # =====================================================

    def _valid_type(
        self,
        value: Any,
        field_type: str,
    ) -> bool:

        if field_type == "string":

            return isinstance(
                value,
                str,
            )

        if field_type == "integer":

            return (
                isinstance(
                    value,
                    int,
                )
                and not isinstance(
                    value,
                    bool,
                )
            )

        if field_type == "number":

            return (
                isinstance(
                    value,
                    (int, float),
                )
                and not isinstance(
                    value,
                    bool,
                )
            )

        if field_type == "boolean":

            return isinstance(
                value,
                bool,
            )

        if field_type == "array":

            return isinstance(
                value,
                list,
            )

        if field_type == "date":

            return isinstance(
                value,
                str,
            )

        return True

    # =====================================================
    # DATE VALIDATION
    # =====================================================

    def _valid_date(
        self,
        value: str,
    ) -> bool:

        formats = [
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%Y-%m-%d",
            "%d/%m/%y",
            "%d-%m-%y",
        ]

        for fmt in formats:

            try:

                datetime.strptime(
                    value,
                    fmt,
                )

                return True

            except ValueError:
                continue

        return False


field_validator = FieldValidator()