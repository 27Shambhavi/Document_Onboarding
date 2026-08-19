# 📄 Enterprise Document Intelligence & Automated Onboarding Platform 🚀

An enterprise-grade, multi-tenant document onboarding platform engineered with **FastAPI**, **PostgreSQL**, **SQLAlchemy**, **Dual-Context JWT Authentication**, **Dynamic Blueprint Ingestion**, **Single-Pass Vision Inference (Qwen 3.5 VL)**, **Zero-Latency Signature Verification**, and an **Asynchronous Usage Metering & Billing Engine**[cite: 2].

The system allows platform administrators to govern tenant onboarding and dynamic pricing rates, enables active companies to define custom extraction blueprints, and processes multi-page candidate PDF bundles with automated quality inspection, field extraction, contiguous page stitching, signature/stamp verification, and real-time transaction billing[cite: 2].

---

## 📑 Table of Contents
1. [🌟 System Architecture & High-Level Flow](#-system-architecture--high-level-flow)
2. [🛠️ Technology Stack](#️-technology-stack)
3. [📂 Repository Structure](#-repository-structure)
4. [🔐 Security & Dual-Context Authentication](#-security--dual-context-authentication)
5. [📑 Dynamic Blueprint & Schema Engine](#-dynamic-blueprint--schema-engine)
6. [👁️ Single-Pass Vision & Zero-Latency Signature Scanning](#️-single-pass-vision--zero-latency-signature-scanning)
7. [💳 Dynamic Billing, Metering & Usage Analytics](#-dynamic-billing-metering--usage-analytics)
8. [🔌 Complete API Reference](#-complete-api-reference)
9. [💻 Installation & Local Development](#-installation--local-development)
10. [🧪 End-to-End Verification Run](#-end-to-end-verification-run)
11. [🔮 Roadmap: Company Guidelines Verification Layer](#-roadmap-company-guidelines-verification-layer)
12. [✅ Implemented vs Planned Checklist](#-implemented-vs-planned-checklist)

---

## 🌟 System Architecture & High-Level Flow

```text
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                      PLATFORM ACTORS & GATEWAY                                    |
+────────────────────────────────────+─────────────────────────────+────────────────────────────────+
                                     |                             |
                       Admin Dashboard & Ops               Client Upload & Ingestion
                                     |                             |
                                     | [Admin JWT]                 | [Company JWT + PDF + Flags][cite: 2]
                                     v                             v
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                          FASTAPI GATEWAY                                         |
|                                                                                                  |
|  [ Auth & Tenant Resolution ] ───► Dual-Context JWT (Admin vs Company)                           |
|  [ Company Lifecycle Filter ] ───► Rejects PENDING / REJECTED tenants                            |
|  [ Entitlement & Feature Gate]───► Verifies Premium Signature Add-on Entitlement                 |
+────────────────────────────────────+─────────────────────────────+────────────────────────────────+
                                     |                             |
                     +---------------+                             +---------------+
                     |                                                             |
                     v                                                             v
+────────────────────────────────────+                      +──────────────────────────────────────+
|     ADMIN & BILLING CONTROLLER     |                      |      CORE DOCUMENT PIPELINE          |
+────────────────────────────────────+                      +──────────────────────────────────────+
| • Dynamic Rates (Page & Signature) |                      | 1. PDF Normalization (PyMuPDF)       |
| • Tenant Approval / Rejection      |                      | 2. Adaptive Semaphore & Limiter      |
| • Add-on Provisioning (Signature)  |                      | 3. Single-Pass Vision Worker (Qwen)  |
| • Aggregated Revenue Analytics     |                      | 4. Contiguous Multi-Page Stitching   |
+─────────────────+──────────────────+                      +──────────────────+───────────────────+
                  |                                                            |
                  |                                                            v
                  |                                         +──────────────────────────────────────+
                  |                                         |  SINGLE-PASS INFERENCE ENGINE        |
                  |                                         |  (Quality + Category + Fields + Sig) |
                  |                                         +──────────────────+───────────────────+
                  |                                                            |
                  +──────────────────────────┐                                 |
                                             v                                 v
                            +──────────────────────────────────────────────────────+
                            |           ASYNCHRONOUS USAGE METERING                |
                            +──────────────────────────────────────────────────────+
                            | Logs every completed transaction event:              |
                            | • company_id | request_id                            |
                            | • total_pages | signatures_scanned                   |
                            | • cost_computed = (pages*R_p) + (sigs*R_s)           |
                            +──────────────────────────+───────────────────────────+
                                                       |
                                                       v
                            +──────────────────────────────────────────────────────+
                            |           PERSISTENCE & SCHEMAS LAYER                |
                            |                                                      |
                            | • PostgreSQL / SQLite: admin_users, companies        |
                            | • JSON Storage: billing_config, usage_logs           |
                            | • Schema Store: config/companies/<id>/blueprints     |
                            +──────────────────────────────────────────────────────+
```

---

## 🛠️ Technology Stack

* **Core Runtime & Web Framework:** Python 3.11+, FastAPI, Uvicorn (ASGI)[cite: 2]
* **Database & ORM:** PostgreSQL, SQLite (Development Fallback), SQLAlchemy 2.0, Psycopg2-binary[cite: 2]
* **Security & Auth:** Dual-context JWT via `python-jose` and `PyJWT`, password hashing with `bcrypt` & `passlib`[cite: 2]
* **Validation & Settings:** Pydantic v2, Pydantic-Settings[cite: 2]
* **Document Processing & Conversion:** PyMuPDF (`fitz`), Pillow (`PIL`), `python-docx`, `pypdf`[cite: 2]
* **Vision & Extraction Engine:** Qwen 3.5 VL via OpenAI-compatible vision interface[cite: 2]
* **Concurrency & Resilience:** AsyncIO worker pools, sliding-window rate limiters, token bucket semaphores, and exponential backoff retry mechanisms[cite: 2]

---

## 📂 Repository Structure

```text
Document_Onboarding/
│
├── app/
│   ├── api/
│   │   ├── admin_routes.py           # Admin authentication & tenant management[cite: 2]
│   │   ├── billing_routes.py         # Dynamic pricing, usage metering, and billing analytics[cite: 2]
│   │   ├── company_auth_routes.py   # Company client login and token issuance[cite: 2]
│   │   └── routes.py                 # Blueprint registration, PDF inference & stitching[cite: 2]
│   │
│   ├── core/
│   │   ├── admin_auth.py             # Admin JWT validation and role guardrails[cite: 2]
│   │   ├── auth.py                   # Tenant JWT resolution and company status verification[cite: 2]
│   │   ├── config.py                 # Pydantic BaseSettings, tier presets, API fallbacks[cite: 2]
│   │   └── jwt.py                    # Token generation and cryptographic signing[cite: 2]
│   │
│   ├── db/
│   │   ├── base.py                   # SQLAlchemy declarative base[cite: 2]
│   │   ├── database.py               # Engine configuration and scoped session maker[cite: 2]
│   │   └── models.py                 # AdminUser and Company database entity definitions[cite: 2]
│   │
│   ├── models/
│   │   └── billing.py                # CompanyProfile, PricingRates, UsageRecord & storage[cite: 2]
│   │
│   ├── schemas/
│   │   ├── admin.py                  # Admin request/response schemas[cite: 2]
│   │   ├── company_auth.py           # Tenant authentication schemas[cite: 2]
│   │   └── registry.py               # Document schema representations[cite: 2]
│   │
│   ├── services/
│   │   ├── analytics/
│   │   │   └── usage_service.py      # Aggregated metrics (daily/weekly/monthly billing)[cite: 2]
│   │   ├── ingestion/
│   │   │   ├── blueprint_parser.py   # JSON / DOCX / DOC schema parser[cite: 2]
│   │   │   ├── document_loader.py    # Multi-part file buffer handler[cite: 2]
│   │   │   └── pdf_processor.py      # PyMuPDF image renderer and bytes normalizer[cite: 2]
│   │   ├── qwen/
│   │   │   └── client.py             # Vision LLM interface client[cite: 2]
│   │   ├── resilience/
│   │   │   └── rate_limiter.py       # Sliding-window limiter and exponential backoff retry[cite: 2]
│   │   └── schema_registry.py        # Disk-backed schema loader and cache[cite: 2]
│   │
│   └── main.py                       # FastAPI entrypoint, middleware, and router binding[cite: 2]
│
├── config/
│   └── companies/
│       └── ABC/
│           └── document_types.json   # Dynamic blueprint definitions for tenant ABC[cite: 2]
│
├── data/
│   ├── billing_config.json           # Live dynamic rates (per-page & per-signature)[cite: 2]
│   ├── companies.json                # Company profiles and add-on subscriptions[cite: 2]
│   └── usage_logs.json               # Audit ledger of all document processing runs[cite: 2]
│
├── create_tables.py                  # Database table initialization script[cite: 2]
├── generate_token.py                 # Development token generation script[cite: 2]
├── requirements.txt                  # Pinned production dependencies[cite: 2]
└── README.md
```

---

## 🔐 Security & Dual-Context Authentication

The platform strictly segregates the **Platform Administration** domain from the **Tenant Processing** domain using distinct token structures and authorization middlewares[cite: 2]:

```text
+───────────────────────────────────────────────────────────+
|                    DUAL-CONTEXT JWT MODEL                 |
+─────────────────────────────┬─────────────────────────────+
|       ADMIN CONTEXT         |       COMPANY CONTEXT       |
| • Prefix: /admin/*          | • Prefix: /company/*,       |
| • Scope: Platform Owner     |           /documents/*,     |
| • Claims:                   |           /client/*         |
|   - sub: admin_id           | • Scope: Tenant API Access  |
|   - role: "admin"           | • Claims:                   |
|   - email: admin email      |   - sub: company_id         |
| • Guard: `admin_auth.py`    |   - company_id: tenant ID   |
|                             |   - token_type: "client"    |
|                             | • Guard: `auth.py`          |
+─────────────────────────────┴─────────────────────────────+
```

### 🚦 Tenant Lifecycle State Machine
Requests authenticated via company tokens must pass status validation in `app/core/auth.py`[cite: 2]:
* **`PENDING`**: Request is blocked with `403 Forbidden` (`Company approval is pending`)[cite: 2].
* **`ACTIVE`**: Full access to blueprint registration, document processing, and self-service analytics[cite: 2].
* **`REJECTED`**: Request is blocked with `403 Forbidden` (`Company access has been rejected`)[cite: 2].

---

## 📑 Dynamic Blueprint & Schema Engine

Rather than hardcoding extraction rules for fixed forms, companies register arbitrary document blueprints (via raw JSON, `.docx`, or `.doc`)[cite: 2]:

```http
POST /company/register-blueprint-json
POST /company/register-blueprint-doc
```

### Blueprint Schema (`config/companies/<company_id>/document_types.json`)
```json
{
  "resume": [
    {"name": "resume_name", "type": "string", "required": true},
    {"name": "resume_email", "type": "string", "required": true},
    {"name": "date_of_birth", "type": "string", "required": false}
  ],
  "pan_card": [
    {"name": "full_name", "type": "string", "required": true},
    {"name": "pan_number", "type": "string", "required": true}
  ],
  "aadhaar_card": [
    {"name": "aadhaar_name", "type": "string", "required": true},
    {"name": "aadhaar_dob", "type": "string", "required": true},
    {"name": "aadhaar_number", "type": "string", "required": true}
  ]
}
```

---

## 👁️ Single-Pass Vision & Zero-Latency Signature Scanning

When `POST /documents/process` is invoked with `enable_signature_detection=true`[cite: 2]:

1. **Entitlement Verification:** The system verifies whether `is_signature_addon_enabled` is active for the company[cite: 2].
2. **Dynamic In-Pass Prompt Clause:** Signature inspection instructions are injected directly into the single Qwen 3.5 VL prompt. This enables quality inspection, category matching, field extraction, and signature detection to execute in a **single vision inference call per page** (0 ms extra network overhead)[cite: 2].
3. **Strict Negative Discrimination:** The vision engine strictly distinguishes genuine handwritten cursive pen ink and official rubber/wet stamps from non-signature artifacts (e.g., portrait photos, QR codes, typed names in parentheses, and decorative borders)[cite: 1].

```text
Raw Page Image (Bytes) + Tenant Blueprints + In-Pass Prompt
                         │
                         ▼
             Qwen 3.5 Vision Engine
                         │
                         ▼
{
  "quality": "GOOD",
  "quality_reason": null,
  "document_type": "pan_card",
  "confidence": 0.98,
  "signature_verification": {
    "is_signed": true,
    "signatory_type": "APPLICANT",
    "signer_name": "SAMAD",
    "signature_location": "below-photo",
    "signature_confidence": 0.95
  },
  "extracted_data": {
    "full_name": "SAMAD",
    "pan_number": "QFVPS0764H"
  }
}
```

4. **Contiguous Page Stitcher:** Asynchronous page worker outputs are sorted by page index and merged into clean, multi-page logical documents[cite: 2].

---

## 💳 Dynamic Billing, Metering & Usage Analytics

Dynamic rates are configured by administrators in real-time[cite: 2]:

$$\text{Total Amount Due} = (\text{Total Pages Scanned} \times \text{Price per Page}) + (\text{Actual Signatures Detected} \times \text{Price per Signature})$$

### Data Models (`app/models/billing.py`)
* `CompanyProfile`: Tracks tenant metadata and signature add-on activation flags[cite: 2].
* `PricingRates`: Live dynamic rate settings (`price_per_page`, `price_per_signature_check`, `currency`)[cite: 2].
* `UsageRecord`: Per-request transaction log (`request_id`, `company_id`, `total_pages`, `signature_checks_count`, `cost_incurred`, `timestamp`)[cite: 2].

---

## 🔌 Complete API Reference

### 🏥 Health & System Status
* `GET /` - Root status and application metadata[cite: 2].
* `GET /health` - System health probe[cite: 2].

### 🛡️ Platform Administration
* `POST /admin/login` - Authenticate admin credentials and return Admin JWT[cite: 2].
* `GET /admin/companies` - List all registered companies and onboarding status[cite: 2].
* `POST /admin/companies/{company_id}/approve` - Approve tenant (`PENDING` $\to$ `ACTIVE`)[cite: 2].
* `POST /admin/companies/{company_id}/reject` - Reject tenant (`is_active = false`)[cite: 2].
* `GET /admin/analytics/overview?period={daily|weekly|monthly|all}` - Platform-wide volume, revenue, and client breakdowns[cite: 2].
* `GET /admin/analytics/companies/{company_id}?period={period}` - Detailed audit logs and estimated invoice for a specific tenant[cite: 2].
* `PUT /admin/billing/pricing` - Dynamically set `price_per_page` and `price_per_signature_check`[cite: 2].
* `PATCH /admin/companies/{company_id}/signature-addon` - Toggle signature scanning subscription for a company[cite: 2].

### 🏢 Company & Document Processing
* `POST /company/login` - Authenticate company credentials and return Company JWT[cite: 2].
* `POST /company/register-blueprint-json` - Register document blueprint via JSON payload[cite: 2].
* `POST /company/register-blueprint-doc` - Register blueprint via DOCX, DOC, or JSON upload[cite: 2].
* `POST /documents/process?enable_signature_detection={true|false}` - Process multi-page candidate PDF bundle[cite: 2].
* `GET /client/usage/summary?period={daily|weekly|monthly|all}` - Self-service volume, verified signature count, and billing summary[cite: 2].

---

## 💻 Installation & Local Development

### 📋 Prerequisites
* Python 3.11+
* PostgreSQL server running locally or accessible remotely[cite: 2]
* Active NVIDIA API key for Qwen 3.5 VL

### ⚙️ Setup Steps

1. **Clone Repository & Create Virtual Environment:**
   ```powershell
   git clone [https://github.com/27Shambhavi/Document_Onboarding.git](https://github.com/27Shambhavi/Document_Onboarding.git)
   cd Document_Onboarding
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

2. **Install Dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables (`.env`):**
   ```ini
   # NVIDIA Inference API
   NVIDIA_API_KEY=your_nvidia_api_key_here
   NVIDIA_BASE_URL=[https://integrate.api.nvidia.com/v1](https://integrate.api.nvidia.com/v1)
   NVIDIA_MODEL=qwen/qwen3.5-397b-a17b

   # JWT Security
   JWT_SECRET_KEY=supersecretjwtkeyforauthentication123
   JWT_ALGORITHM=HS256
   ADMIN_SECRET_KEY=adminsecretkey123

   # Database URL
   DATABASE_URL=postgresql+psycopg2://postgres:yourpassword@localhost:5432/document_onboarding

   # Operational Tier (FREE / PAID)
   SYSTEM_TIER=FREE
   ```

4. **Initialize Database Tables:**
   ```powershell
   python create_tables.py
   ```

5. **Start Application Server:**
   ```powershell
   uvicorn app.main:app --reload
   ```
   Interactive Swagger UI is accessible at `http://127.0.0.1:8000/docs`[cite: 2].

---

## 🧪 End-to-End Verification Run

```text
1. GET /health                                            -> Verify system health[cite: 2]
2. POST /admin/login                                      -> Obtain Admin JWT[cite: 2]
3. Authorize Swagger UI with Admin Bearer Token
4. GET /admin/companies                                   -> List pending tenants[cite: 2]
5. POST /admin/companies/ABC/approve                      -> Activate company ABC[cite: 2]
6. PATCH /admin/companies/ABC/signature-addon             -> Set is_signature_addon_enabled: true[cite: 2]
7. PUT /admin/billing/pricing                             -> Set price_per_page: 5.0, price_per_signature: 2.0[cite: 2]
8. POST /company/login                                    -> Obtain Company JWT for ABC[cite: 2]
9. Authorize Swagger UI with Company Bearer Token
10. POST /company/register-blueprint-json                 -> Submit document blueprint[cite: 2]
11. POST /documents/process?enable_signature_detection=true -> Upload test candidate PDF[cite: 2]
12. GET /client/usage/summary?period=monthly              -> Verify scanned pages, detected signatures & bill[cite: 2]
13. Switch Swagger UI to Admin Bearer Token
14. GET /admin/analytics/overview?period=monthly          -> Verify aggregated platform revenue and usage[cite: 2]
```

---

## 🔮 Roadmap: Company Guidelines Verification Layer

The next major milestone is the **Company Guidelines Verification Engine**[cite: 2]. This reasoning layer compares structured candidate evidence extracted by the vision pipeline against business rules and requirements defined by the hiring organization[cite: 2].

```text
Company Guidelines (Rules) + Structured Document Evidence (Facts)
                                 │
                                 ▼
                     Guidelines Verification Engine
                                 │
                                 ▼
                    gpt-oss-120b Reasoning Layer[cite: 2]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
              CLEARED                        UNCLEARED[cite: 2]
     (Requirement Verified)           (Deficient / Missing / Conflicted)[cite: 2]
```

### 📋 Core Verification Outcomes
* **`CLEARED`:** Candidate evidence completely satisfies the guideline requirement (e.g., valid PAN extracted and names match)[cite: 2].
* **`UNCLEARED`:** The requirement cannot be proven due to missing documentation, qualification gaps, unreadable text, or data discrepancies[cite: 2].

### 📄 Planned Response Contract
```json
{
  "candidate_id": "CAND-4892",
  "company_id": "ABC",
  "onboarding_verdict": "ACTION_REQUIRED",
  "guideline_results": [
    {
      "guideline_id": "G001",
      "rule": "Candidate must possess a valid PAN card.",
      "status": "CLEARED",
      "evidence_documents": ["pan_card"],
      "explanation": "PAN card verified with valid PAN number."
    },
    {
      "guideline_id": "G002",
      "rule": "Candidate must have at least 2 years of professional experience.",
      "status": "UNCLEARED",
      "evidence_documents": ["resume"],
      "explanation": "Resume indicates 1 year 4 months of relevant experience."
    }
  ]
}
```

---

## ✅ Implemented vs Planned Checklist

### 🚀 Implemented & Production Ready
* [x] FastAPI modular routing and CORS middleware[cite: 2]
* [x] PostgreSQL & SQLAlchemy multi-tenant database models[cite: 2]
* [x] Dual-context JWT authentication (Admin vs Company)[cite: 2]
* [x] Tenant lifecycle state guardrails (`PENDING`, `ACTIVE`, `REJECTED`)[cite: 2]
* [x] Dynamic blueprint ingestion (JSON, DOCX, DOC)[cite: 2]
* [x] PyMuPDF-based image normalization pipeline[cite: 2]
* [x] Single-Pass Vision Inference via Qwen 3.5 VL[cite: 2]
* [x] In-pass quality scoring (`GOOD` vs `BAD`)[cite: 2]
* [x] Precise handwritten signature and physical stamp detection[cite: 1]
* [x] Strict negative visual discrimination (excluding photos, QR codes, and typed text)[cite: 1]
* [x] Multi-page contiguous document stitching[cite: 2]
* [x] Sliding-window rate limiters and exponential backoff retry handling[cite: 2]
* [x] Dynamic admin pricing management (`price_per_page`, `price_per_signature_check`)[cite: 2]
* [x] Asynchronous per-request usage logging and billing calculation[cite: 2]
* [x] Time-series analytics aggregation (Daily, Weekly, Monthly, All-time)[cite: 2]
* [x] Client self-service billing portal endpoints[cite: 2]
* [x] Admin platform-wide revenue and tenant usage overviews[cite: 2]

### 🎯 Planned (Phase II)
* [ ] Company Guidelines ingestion and storage endpoints[cite: 2]
* [ ] Structured guidelines representation and rule parser[cite: 2]
* [ ] `gpt-oss-120b` reasoning engine integration[cite: 2]
* [ ] Automated `CLEARED` / `UNCLEARED` rule verification[cite: 2]
* [ ] Consolidated candidate onboarding decision API[cite: 2]
