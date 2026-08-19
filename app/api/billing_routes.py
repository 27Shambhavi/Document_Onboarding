from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.auth import authenticate_client
from app.models.billing import storage_manager
from app.services.analytics.usage_service import usage_service

billing_router = APIRouter(tags=["Billing & Usage Analytics"])


# ================================================================
# REQUEST / RESPONSE SCHEMAS
# ================================================================


class UpdatePricingRequest(BaseModel):
  price_per_page: float
  price_per_signature_check: float


class UpdateAddonRequest(BaseModel):
  is_signature_addon_enabled: bool


# ================================================================
# 1. CLIENT SELF-SERVICE ENDPOINTS
# ================================================================


@billing_router.get("/client/usage/summary")
async def get_client_usage_summary(
    period: str = Query(
        "monthly", enum=["daily", "weekly", "monthly", "all"]
    ),
    client: dict = Depends(authenticate_client),
):
  """Allows an authenticated company to view their scan usage, signature verifications,

  and estimated invoice for a given period.
  """
  company_id = client.get("company_id")
  if not company_id:
    raise HTTPException(
        status_code=401, detail="Authenticated client has no company_id"
    )

  return usage_service.get_company_metrics(
      company_id=company_id, period=period
  )


# ================================================================
# 2. ADMIN BILLING & PLATFORM ANALYTICS ENDPOINTS
# ================================================================


@billing_router.get("/admin/analytics/overview")
async def get_platform_overview(
    period: str = Query(
        "monthly", enum=["daily", "weekly", "monthly", "all"]
    ),
):
  """Admin view: Aggregated platform-wide metrics, total revenue generated,

  and per-company usage breakdown.
  """
  return usage_service.get_admin_platform_overview(period=period)


@billing_router.get("/admin/analytics/companies/{company_id}")
async def get_admin_company_usage(
    company_id: str,
    period: str = Query(
        "monthly", enum=["daily", "weekly", "monthly", "all"]
    ),
):
  """Admin view: Inspect detailed usage logs and computed invoice for a specific company."""
  return usage_service.get_company_metrics(
      company_id=company_id, period=period
  )


@billing_router.put("/admin/billing/pricing")
async def update_billing_rates(payload: UpdatePricingRequest):
  """Admin view: Dynamically update per-page and signature verification pricing rates."""
  if (
      payload.price_per_page < 0
      or payload.price_per_signature_check < 0
  ):
    raise HTTPException(status_code=400, detail="Pricing rates cannot be negative")

  updated = storage_manager.update_pricing(
      price_per_page=payload.price_per_page,
      price_per_signature=payload.price_per_signature_check,
  )
  return {
      "status": "updated",
      "pricing": updated.model_dump(),
  }


@billing_router.patch("/admin/companies/{company_id}/signature-addon")
async def toggle_signature_addon(
    company_id: str,
    payload: UpdateAddonRequest,
):
  """Admin view: Enable or disable the Premium Signature Scanning Add-on for a specific company."""
  updated_company = storage_manager.update_company_addon(
      company_id=company_id,
      signature_enabled=payload.is_signature_addon_enabled,
  )
  return {
      "status": "updated",
      "company_id": updated_company.company_id,
      "signature_addon_enabled": updated_company.is_signature_addon_enabled,
  }