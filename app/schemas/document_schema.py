from typing import Any

from pydantic import BaseModel, Field


class FieldDefinition(BaseModel):
    """
    Dynamic definition of a document field.

    All document-specific rules come from JSON.
    """

    name: str

    type: str = "string"

    required: bool = True

    pattern: str | None = None

    description: str | None = None

    default: Any = None

    normalize: str | None = None


class DocumentSchema(BaseModel):
    """
    Complete schema for one document type.
    """

    document_type: str

    fields: list[FieldDefinition]

    metadata: dict[str, Any] = Field(
        default_factory=dict
    )