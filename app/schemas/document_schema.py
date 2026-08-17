from pydantic import BaseModel


class FieldDefinition(BaseModel):
    """
    Represents one extraction parameter defined by the
    central document_types.json file.

    Example:
        "resume_name"
        "pan_number"
        "aadhar_number"
    """

    name: str


class DocumentSchema(BaseModel):
    """
    Represents one document type and its extraction parameters.

    Example:

    document_type = "Resume"

    fields = [
        FieldDefinition(name="resume_name"),
        FieldDefinition(name="resume_email"),
        ...
    ]
    """

    document_type: str
    fields: list[FieldDefinition]