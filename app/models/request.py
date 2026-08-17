from typing import Optional

from pydantic import BaseModel


class DocumentMetadata(BaseModel):
    source: Optional[str] = "api"
    user_id: Optional[str] = None


class DocumentRequest(BaseModel):
    document_type: str = "auto"
    document_url: Optional[str] = None
    metadata: Optional[DocumentMetadata] = None