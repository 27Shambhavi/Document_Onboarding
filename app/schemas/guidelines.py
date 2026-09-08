from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ================================================================
# Core ID Contract Models
# ================================================================

class DocumentFileItem(BaseModel):
    """Represents a single document inside the 'files' request array."""
    id: str = Field(..., description="Unique client/system assigned document ID")
    label: str = Field(..., description="Document type label (Resume, PAN, Aadhar, etc.)")
    url: Optional[str] = Field(None, description="Optional public or S3 URL of the file")
    ocr_data: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Extracted OCR key-value data")


class GuidelineVerdictItem(BaseModel):
    """Represents a single document entry inside the 'guideline' response array (The ID Contract)."""
    id: str = Field(..., description="The document ID that this verdict belongs to")
    cleared_guidelines: List[str] = Field(default_factory=list, description="Rules passed by this document with reasons")
    uncleared_guidelines: List[str] = Field(default_factory=list, description="Rules failed by this document with reasons")


class FinetechUploadRequest(BaseModel):
    """The /finetech/upload_data request payload schema."""
    files: List[DocumentFileItem]
    guidelines: List[str]
    customer_id: str
    requestId: str
    webhook_url: Optional[str] = None
    guideline_check: bool = True


class FinetechWebhookPayload(BaseModel):
    """The payload sent to the webhook conforming to The ID Contract."""
    requestId: str
    customer_id: str
    guideline: List[GuidelineVerdictItem]


# Direct alias for routes expecting WebhookPayload
WebhookPayload = FinetechWebhookPayload


# ================================================================
# Dynamic & Route Compatibility Models
# ================================================================

class DynamicGuidelinesPayload(BaseModel):
    """Payload model for dynamic policy and guidelines configuration."""
    guidelines: List[str] = Field(default_factory=list)
    text: Optional[str] = None
    json_rules: Optional[Any] = None
    rules: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    company_id: Optional[str] = None
    blueprint: Optional[Dict[str, Any]] = Field(default_factory=dict)


class GuidelineCheckRequest(BaseModel):
    """Payload model for /company/guidelines/check."""
    files: List[DocumentFileItem] = Field(default_factory=list)
    guidelines: Optional[List[str]] = Field(default_factory=list)
    customer_id: Optional[str] = None
    requestId: Optional[str] = None
    webhook_url: Optional[str] = None
    guideline_check: bool = True


class GuidelineCheckResponse(BaseModel):
    """Response model for /company/guidelines/check."""
    status: str
    requestId: Optional[str] = None
    customer_id: Optional[str] = None
    total_documents: int
    guideline: List[GuidelineVerdictItem]


class GuidelineUploadResponse(BaseModel):
    status: str
    company_id: str
    total_guidelines: int
    guidelines: List[str]


class GuidelinePolicyUploadResponse(BaseModel):
    status: str
    company_id: str
    filename: str
    total_guidelines_extracted: int
    extracted_guidelines: List[str]


class CompanyGuidelineSaveRequest(BaseModel):
    guidelines: List[str]


__all__ = [
    "DocumentFileItem",
    "GuidelineVerdictItem",
    "FinetechUploadRequest",
    "FinetechWebhookPayload",
    "WebhookPayload",
    "DynamicGuidelinesPayload",
    "GuidelineCheckRequest",
    "GuidelineCheckResponse",
    "GuidelineUploadResponse",
    "GuidelinePolicyUploadResponse",
    "CompanyGuidelineSaveRequest",
]