from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid

from app.models.billing import (
    CompanyProfile,
    PricingRates,
    UsageRecord,
    storage_manager,
)


class UsageAnalyticsService:

  @staticmethod
  def log_transaction(
      company_id: str,
      request_id: str,
      total_pages: int,
      signatures_scanned: int,
  ) -> UsageRecord:
    """Calculates dynamically incurred cost and logs the transaction."""
    pricing: PricingRates = storage_manager.get_pricing()

    cost = (total_pages * pricing.price_per_page) + (
        signatures_scanned * pricing.price_per_signature_check
    )

    record = UsageRecord(
        log_id=f"LOG-{uuid.uuid4().hex[:10].upper()}",
        request_id=request_id,
        company_id=company_id,
        total_pages=total_pages,
        signature_checks_count=signatures_scanned,
        cost_incurred=round(cost, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    storage_manager.record_usage(record)
    return record

  @staticmethod
  def _filter_logs_by_period(
      logs: List[UsageRecord], period: str
  ) -> List[UsageRecord]:
    """Filters log records based on daily, weekly, or monthly windows."""
    now = datetime.now(timezone.utc)
    if period == "daily":
      start_date = now - timedelta(days=1)
    elif period == "weekly":
      start_date = now - timedelta(days=7)
    elif period == "monthly":
      start_date = now - timedelta(days=30)
    else:
      return logs

    filtered = []
    for log in logs:
      try:
        log_dt = datetime.fromisoformat(log.timestamp)
        if log_dt >= start_date:
          filtered.append(log)
      except Exception:
        continue
    return filtered

  @classmethod
  def get_company_metrics(
      cls, company_id: str, period: str = "monthly"
  ) -> Dict[str, Any]:
    """Computes usage analytics and current estimated invoice for a single company."""
    company: CompanyProfile = storage_manager.get_company(company_id)
    pricing: PricingRates = storage_manager.get_pricing()
    logs = storage_manager.get_usage_logs(company_id=company_id)
    period_logs = cls._filter_logs_by_period(logs, period)

    total_requests = len(period_logs)
    total_pages = sum(log.total_pages for log in period_logs)
    total_signatures = sum(log.signature_checks_count for log in period_logs)
    total_billed = sum(log.cost_incurred for log in period_logs)

    return {
        "company_id": company.company_id,
        "company_name": company.company_name,
        "signature_addon_active": company.is_signature_addon_enabled,
        "period": period,
        "metrics": {
            "total_requests": total_requests,
            "total_pages_scanned": total_pages,
            "total_signatures_verified": total_signatures,
        },
        "billing_summary": {
            "rate_per_page": pricing.price_per_page,
            "rate_per_signature": pricing.price_per_signature_check,
            "total_amount_due": round(total_billed, 2),
            "currency": pricing.currency,
        },
    }

  @classmethod
  def get_admin_platform_overview(
      cls, period: str = "monthly"
  ) -> Dict[str, Any]:
    """Aggregates platform-wide metrics across all onboarded clients."""
    pricing: PricingRates = storage_manager.get_pricing()
    companies = storage_manager.list_all_companies()
    all_logs = storage_manager.get_usage_logs()
    period_logs = cls._filter_logs_by_period(all_logs, period)

    total_revenue = sum(log.cost_incurred for log in period_logs)
    total_pages = sum(log.total_pages for log in period_logs)
    total_signatures = sum(log.signature_checks_count for log in period_logs)

    # Per-client breakdown
    client_breakdown = []
    for comp in companies:
      c_logs = [log for log in period_logs if log.company_id == comp.company_id]
      client_breakdown.append({
          "company_id": comp.company_id,
          "company_name": comp.company_name,
          "signature_addon": comp.is_signature_addon_enabled,
          "requests": len(c_logs),
          "pages": sum(l.total_pages for l in c_logs),
          "signatures": sum(l.signature_checks_count for l in c_logs),
          "amount_due": round(sum(l.cost_incurred for l in c_logs), 2),
      })

    return {
        "period": period,
        "active_pricing": pricing.model_dump(),
        "platform_totals": {
            "total_companies_registered": len(companies),
            "total_requests_processed": len(period_logs),
            "total_pages_processed": total_pages,
            "total_signatures_scanned": total_signatures,
            "total_revenue_generated": round(total_revenue, 2),
            "currency": pricing.currency,
        },
        "companies_breakdown": client_breakdown,
    }


usage_service = UsageAnalyticsService()