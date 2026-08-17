from typing import Any, Optional

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    request_id: str
    status: str
    document_type: str
    filename: Optional[str] = None
    quality: Optional[str] = None
    classification: Optional[str] = None
    extracted_data: Optional[Any] = None
    message: Optional[str] = None