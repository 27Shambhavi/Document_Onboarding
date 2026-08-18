from typing import List

from pydantic import BaseModel, Field


class DocumentRequest(BaseModel):
    document_type: str

    fields: List[str] = Field(
        default_factory=list
    )


class ClientProcessingRequest(BaseModel):
    documents: List[DocumentRequest]