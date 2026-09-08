from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.admin_auth import authenticate_admin
from app.core.auth import authenticate_client
from app.db.database import get_db
from app.db.models import Company, DocumentScan
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
    db: Session = Depends(get_db),
):
  """Allows an authenticated company to view their scan usage, signature verifications,
  and estimated invoice for a given period. Also returns the DB-backed
  signature_unlocked flag for the premium feature gate.
  Strictly enforces tenant isolation at the ORM level.
  """
  company_id = client.get("company_id")
  if not company_id:
    raise HTTPException(
        status_code=401, detail="Authenticated client has no company_id"
    )

  # Fetch DB-backed company profile for signature_unlocked flag (Strict tenant check)
  company = db.query(Company).filter(Company.company_id == company_id).first()
  signature_unlocked = company.signature_unlocked if company else False

  # In-memory service metrics
  metrics = usage_service.get_company_metrics(
      company_id=company_id, period=period
  )

  # Strict tenant aggregation on DocumentScan table
  total_db_pages = (
      db.query(func.coalesce(func.sum(DocumentScan.pages_count), 0))
      .filter(DocumentScan.company_id == company_id)
      .scalar()
      or 0
  )
  total_db_cost = round(
      float(
          db.query(func.coalesce(func.sum(DocumentScan.cost_inr), 0.0))
          .filter(DocumentScan.company_id == company_id)
          .scalar()
          or 0.0
      ),
      2,
  )
  total_db_scans = (
      db.query(func.count(DocumentScan.id))
      .filter(DocumentScan.company_id == company_id)
      .scalar()
      or 0
  )

  # Convert metrics to dictionary if needed and inject DB flags
  result = dict(metrics) if hasattr(metrics, "__dict__") else (metrics if isinstance(metrics, dict) else {"data": metrics})
  result["signature_unlocked"] = signature_unlocked
  result["company_id"] = company_id
  result["company_name"] = company.company_name if company else company_id

  # Ensure metrics reflect DB totals if DB has more scans logged
  if "metrics" in result and isinstance(result["metrics"], dict):
    if total_db_pages > result["metrics"].get("total_pages_scanned", 0):
      result["metrics"]["total_pages_scanned"] = total_db_pages
    if total_db_scans > result["metrics"].get("total_requests", 0):
      result["metrics"]["total_requests"] = total_db_scans
  else:
    result["metrics"] = {
        "total_requests": total_db_scans,
        "total_pages_scanned": total_db_pages,
        "total_signatures_verified": 0,
    }

  # Also expose top-level convenience fields for frontend components
  result["total_pages_scanned"] = result["metrics"].get("total_pages_scanned", total_db_pages)
  pricing = storage_manager.get_pricing()
  result["price_per_page"] = pricing.price_per_page
  result["price_per_signature"] = pricing.price_per_signature_check

  return result


# ================================================================
# 2. ADMIN BILLING & PLATFORM ANALYTICS ENDPOINTS
# ================================================================


@billing_router.get("/admin/analytics/overview")
async def get_platform_overview(
    period: str = Query(
        "monthly", enum=["daily", "weekly", "monthly", "all"]
    ),
    admin: dict = Depends(authenticate_admin),
):
  """Admin view: Aggregated platform-wide metrics, total revenue generated,
  and per-company usage breakdown. Protected by admin authentication.
  """
  return usage_service.get_admin_platform_overview(period=period)


@billing_router.get("/admin/analytics/companies/{company_id}")
async def get_admin_company_usage(
    company_id: str,
    period: str = Query(
        "monthly", enum=["daily", "weekly", "monthly", "all"]
    ),
    admin: dict = Depends(authenticate_admin),
):
  """Admin view: Inspect detailed usage logs and computed invoice for a specific company.
  Protected by admin authentication.
  """
  return usage_service.get_company_metrics(
      company_id=company_id, period=period
  )


@billing_router.put("/admin/billing/pricing")
async def update_billing_rates(
    payload: UpdatePricingRequest,
    admin: dict = Depends(authenticate_admin),
):
  """Admin view: Dynamically update per-page and signature verification pricing rates.
  Protected by admin authentication.
  """
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
    admin: dict = Depends(authenticate_admin),
):
  """Admin view: Enable or disable the Premium Signature Scanning Add-on for a specific company.
  Protected by admin authentication.
  """
  updated_company = storage_manager.update_company_addon(
      company_id=company_id,
      signature_enabled=payload.is_signature_addon_enabled,
  )
  return {
      "status": "updated",
      "company_id": updated_company.company_id,
      "signature_addon_enabled": updated_company.is_signature_addon_enabled,
  }