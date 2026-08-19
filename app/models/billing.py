from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

DATA_DIR = Path("data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

BILLING_CONFIG_PATH = DATA_DIR / "billing_config.json"
USAGE_LOGS_PATH = DATA_DIR / "usage_logs.json"
COMPANIES_PATH = DATA_DIR / "companies.json"


class CompanyProfile(BaseModel):
  company_id: str
  company_name: str
  is_signature_addon_enabled: bool = False
  created_at: str = Field(
      default_factory=lambda: datetime.now(timezone.utc).isoformat()
  )


class PricingRates(BaseModel):
  price_per_page: float = 0.50
  price_per_signature_check: float = 1.00
  currency: str = "INR"
  updated_at: str = Field(
      default_factory=lambda: datetime.now(timezone.utc).isoformat()
  )


class UsageRecord(BaseModel):
  log_id: str
  request_id: str
  company_id: str
  total_pages: int
  signature_checks_count: int
  cost_incurred: float
  timestamp: str = Field(
      default_factory=lambda: datetime.now(timezone.utc).isoformat()
  )


class StorageManager:

  @staticmethod
  def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
      StorageManager._save_json(path, default)
      return default
    try:
      with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
    except Exception:
      return default

  @staticmethod
  def _save_json(path: Path, data: Any):
    with open(path, "w", encoding="utf-8") as f:
      json.dump(data, f, indent=2)

  # --- Company Management ---
  @classmethod
  def get_company(cls, company_id: str) -> CompanyProfile:
    companies = cls._load_json(COMPANIES_PATH, {})
    if company_id not in companies:
      # Auto-provision company profile with standard tier
      profile = CompanyProfile(
          company_id=company_id, company_name=f"Company {company_id}"
      )
      companies[company_id] = profile.model_dump()
      cls._save_json(COMPANIES_PATH, companies)
      return profile
    return CompanyProfile(**companies[company_id])

  @classmethod
  def update_company_addon(
      cls, company_id: str, signature_enabled: bool
  ) -> CompanyProfile:
    companies = cls._load_json(COMPANIES_PATH, {})
    profile = cls.get_company(company_id)
    profile.is_signature_addon_enabled = signature_enabled
    companies[company_id] = profile.model_dump()
    cls._save_json(COMPANIES_PATH, companies)
    return profile

  @classmethod
  def list_all_companies(cls) -> List[CompanyProfile]:
    companies = cls._load_json(COMPANIES_PATH, {})
    return [CompanyProfile(**data) for data in companies.values()]

  # --- Pricing Management ---
  @classmethod
  def get_pricing(cls) -> PricingRates:
    data = cls._load_json(BILLING_CONFIG_PATH, PricingRates().model_dump())
    return PricingRates(**data)

  @classmethod
  def update_pricing(
      cls, price_per_page: float, price_per_signature: float
  ) -> PricingRates:
    new_pricing = PricingRates(
        price_per_page=price_per_page,
        price_per_signature_check=price_per_signature,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    cls._save_json(BILLING_CONFIG_PATH, new_pricing.model_dump())
    return new_pricing

  # --- Usage Logging ---
  @classmethod
  def record_usage(cls, record: UsageRecord):
    logs = cls._load_json(USAGE_LOGS_PATH, [])
    logs.append(record.model_dump())
    cls._save_json(USAGE_LOGS_PATH, logs)

  @classmethod
  def get_usage_logs(
      cls, company_id: Optional[str] = None
  ) -> List[UsageRecord]:
    logs = cls._load_json(USAGE_LOGS_PATH, [])
    records = [UsageRecord(**item) for item in logs]
    if company_id:
      return [r for r in records if r.company_id == company_id]
    return records


storage_manager = StorageManager()