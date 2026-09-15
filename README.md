# Enterprise Document Intelligence & Automated Onboarding Platform 🚀

An enterprise-grade, multi-tenant document onboarding platform engineered with **FastAPI, PostgreSQL, SQLAlchemy, Dual-Context JWT Authentication, Dynamic Blueprint Ingestion, Single-Pass Vision Inference (Qwen VL), Zero-Latency Signature Verification, Asynchronous Usage Metering & Billing, an AI-Powered JD Matching & Candidate Recommendation Engine, and a RAG-Based Conversational Assistant (Chatbot)**.

The system allows platform administrators to govern tenant onboarding and dynamic pricing rates, enables active companies to define custom extraction blueprints, and processes multi-page candidate PDF bundles with automated quality inspection, field extraction, contiguous page stitching, signature/stamp verification, and real-time transaction billing. On top of the extracted candidate data, the platform ranks candidates against job descriptions using an AI matching engine, and exposes all document data, JD rankings, and platform knowledge through a company-scoped, database-grounded conversational chatbot.

---

## 📑 Table of Contents

- [🌟 System Architecture & High-Level Flow](#-system-architecture--high-level-flow)
- [🛠️ Technology Stack](#️-technology-stack)
- [📂 Repository Structure](#-repository-structure)
- [🔐 Security & Dual-Context Authentication](#-security--dual-context-authentication)
- [📑 Dynamic Blueprint & Schema Engine](#-dynamic-blueprint--schema-engine)
- [👁️ Single-Pass Vision & Zero-Latency Signature Scanning](#️-single-pass-vision--zero-latency-signature-scanning)
- [⚡ Parallel Document Processing & Asynchronous Worker Pipeline](#-parallel-document-processing--asynchronous-worker-pipeline)
- [💳 Dynamic Billing, Metering & Usage Analytics](#-dynamic-billing-metering--usage-analytics)
- [🗄️ Database Schema (PostgreSQL)](#️-database-schema-postgresql)
- [🎯 AI-Powered JD Matching & Candidate Recommendation Engine](#-ai-powered-jd-matching--candidate-recommendation-engine)
- [💬 RAG-Based Conversational Assistant (Chatbot)](#-rag-based-conversational-assistant-chatbot)
- [✅ Company Guidelines Verification Layer](#-company-guidelines-verification-layer)
- [🔌 Complete API Reference](#-complete-api-reference)
- [💻 Installation & Local Development](#-installation--local-development)
- [🧪 End-to-End Verification Run](#-end-to-end-verification-run)
- [✅ Implemented vs Planned Checklist](#-implemented-vs-planned-checklist)

---

## 🌟 System Architecture & High-Level Flow

```text
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    PLATFORM ACTORS & GATEWAY                                     |
+────────────────────────────────────+─────────────────────────────+───────────────────────────────+
                                     |                             |
                                Admin Dashboard & Ops         Client Upload, Chat & Ingestion
                                     |                             |
                                     | [Admin JWT]                 | [Company JWT + PDF/JD/Chat]
                                     v                             v
+──────────────────────────────────────────────────────────────────────────────────────────────────+
|                                         FASTAPI GATEWAY                                          |
|                                                                                                  |
|   [ Auth & Tenant Resolution ] ───► Dual-Context JWT (Admin vs Company)                          |
|   [ Company Lifecycle Filter ] ───► Rejects PENDING / REJECTED tenants                           |
|   [ Entitlement & Feature Gate]───► Verifies Premium Signature Add-on Entitlement                |
+────────────────────────────────────+─────────────────────────────+───────────────────────────────+
                                     |                             |
                     +---------------+---------------+             +---------------+---------------+
                     |                               |                             |               |
                     v                               v                             v               v
+─────────────────────────────+     +──────────────────────────────+     +──────────────────────────────+
| ADMIN & BILLING CONTROLLER  |     |     CORE DOCUMENT PIPELINE   |     | JD MATCHING & CHATBOT LAYER  |
+─────────────────────────────+     +──────────────────────────────+     +──────────────────────────────+
| • Dynamic Rates             |     | 1. PDF Normalization (PyMuPDF)|    | • Intent Classifier          |
| • Tenant Approval/Rejection |     | 2. Adaptive Semaphore/Limiter |    |   (Lookup / JD-Match /       |
| • Add-on Provisioning       |     | 3. Single-Pass Vision (Qwen)  |    |    Stored-Ranking / Greeting)|
| • Aggregated Revenue Analytics|   | 4. Contiguous Multi-Page     |    | • JD Requirement Extractor   |
+───────────────+───────────────+     |    Stitching                 |    | • Candidate Match Scorer     |
                |                   +───────────────+────────────────+    | • RAG Retrieval + LLM Answer |
                |                                   |                    | • Chat History Persistence   |
                |                                   v                    +───────────────+───────────────+
                |                   +──────────────────────────────────+                 |
                |                   |  SINGLE-PASS INFERENCE ENGINE    |                 |
                |                   |  (Quality + Category + Fields+Sig)|                |
                |                   +──────────────────+─────────────────+                 |
                |                                      |                                 |
                +──────────────────────┐               |               ┌─────────────────+
                                       v               v               v
                            +──────────────────────────────────────────────────────+
                            |            ASYNCHRONOUS USAGE METERING               |
                            +──────────────────────────────────────────────────────+
                            | Logs every completed transaction event:              |
                            | • company_id | request_id                            |
                            | • total_pages | signatures_scanned                   |
                            | • cost_computed = (pages*R_p) + (sigs*R_s)           |
                            +──────────────────────────+───────────────────────────+
                                                       |
                                                       v
                            +──────────────────────────────────────────────────────+
                            |              PERSISTENCE LAYER (PostgreSQL)          |
                            |                                                      |
                            | admin_users • companies • invite_tokens              |
                            | document_submissions • extracted_documents           |
                            | document_scans • guideline_check_results             |
                            | job_descriptions • chat_sessions • chat_messages     |
                            | audit_logs                                           |
                            |                                                      |
                            | JSON Storage: billing_config, usage_logs             |
                            | Schema Store: config/companies/<id>/blueprints       |
                            +──────────────────────────────────────────────────────+
```

Every table in the persistence layer is strictly **tenant-scoped by `company_id`** — the parallel document processing engine, the JD matching engine, and the chatbot all read and write through this isolation boundary, ensuring strict multi-tenant data separation.

---

## 🛠️ Technology Stack

- **Core Runtime & Web Framework:** Python 3.11+, FastAPI, Uvicorn (ASGI)
- **Database & ORM:** PostgreSQL (primary single source of truth), SQLAlchemy 2.0, Psycopg2-binary
- **Security & Auth:** Dual-context JWT via `python-jose` and `PyJWT`, password hashing with `bcrypt` & `passlib`
- **Validation & Settings:** Pydantic v2, Pydantic-Settings
- **Document Processing & Conversion:** PyMuPDF (`fitz`), Pillow (PIL), `python-docx`, `pypdf`
- **Vision & Extraction Engine:** Qwen VL (Instruct) via an OpenAI-compatible vision interface — used for OCR extraction, quality scoring, and signature detection
- **Guideline Verification & Chatbot Reasoning:** The **same Qwen Instruct model** (single vLLM-served model, OpenAI-compatible endpoint) is reused for guideline verification reasoning and chatbot grounded generation.
- **JD Matching Engine:** Internal `jd_matcher` module — requirement extraction from raw JD text + structured candidate-vs-JD scoring, shared identically by both the HR dashboard and the chatbot.
- **Concurrency & Resilience:** AsyncIO worker pools (`asyncio.gather`), sliding-window rate limiters, token bucket semaphores, and exponential backoff retry mechanisms.

---

## 📂 Repository Structure

```text
Document_Onboarding/
│
├── app/
│   ├── api/
│   │   ├── admin_routes.py             # Admin authentication & tenant management
│   │   ├── billing_routes.py           # Dynamic pricing, usage metering, and billing analytics
│   │   ├── company_auth_routes.py      # Company client login and token issuance
│   │   ├── routes.py                   # Blueprint registration, PDF inference & parallel stitching
│   │   ├── hr_ranking_routes.py        # Job description CRUD + candidate ranking/scoring
│   │   └── chatbot_routes.py           # RAG chatbot query endpoint, intent routing, chat history
│   │
│   ├── core/
│   │   ├── admin_auth.py               # Admin JWT validation and role guardrails
│   │   ├── auth.py                     # Tenant JWT resolution and company status verification
│   │   ├── config.py                   # Pydantic BaseSettings, tier presets, API fallbacks
│   │   └── jwt.py                      # Token generation and cryptographic signing
│   │
│   ├── db/
│   │   ├── base.py                     # SQLAlchemy declarative base
│   │   ├── database.py                 # Engine configuration and scoped session maker
│   │   └── models.py                   # AdminUser, Company, InviteToken, DocumentScan,
│   │                                   # JobDescription, ChatSession, ChatMessage entities
│   │
│   ├── models/
│   │   └── billing.py                  # CompanyProfile, PricingRates, UsageRecord & storage
│   │
│   ├── schemas/
│   │   ├── admin.py                    # Admin request/response schemas
│   │   ├── company_auth.py             # Tenant authentication schemas
│   │   └── registry.py                 # Document schema representations
│   │
│   ├── services/
│   │   ├── analytics/
│   │   │   └── usage_service.py        # Aggregated metrics (daily/weekly/monthly billing)
│   │   ├── ingestion/
│   │   │   ├── blueprint_parser.py     # JSON / DOCX / DOC schema parser
│   │   │   ├── document_loader.py      # Multi-part file buffer handler
│   │   │   └── pdf_processor.py        # PyMuPDF image renderer and bytes normalizer
│   │   ├── qwen/
│   │   │   └── client.py               # Vision + reasoning LLM interface client (shared model)
│   │   ├── matching/
│   │   │   └── jd_matcher.py           # extract_jd_requirements() + calculate_candidate_match()
│   │   ├── resilience/
│   │   │   └── rate_limiter.py         # Sliding-window limiter and exponential backoff retry
│   │   └── schema_registry.py          # Disk-backed schema loader and cache
│   │
│   └── main.py                         # FastAPI entrypoint, middleware, and router binding
│
├── config/
│   └── companies/
│       └── ABC/
│           └── document_types.json     # Dynamic blueprint definitions for tenant ABC
│
├── data/
│   ├── billing_config.json             # Live dynamic rates (per-page & per-signature)
│   ├── companies.json                  # Company profiles and add-on subscriptions
│   └── usage_logs.json                 # Audit ledger of all document processing runs
│
├── frontend/
│   └── src/
│       └── components/
│           └── ChatbotWidget.tsx       # Floating RAG chatbot widget (additive to existing UI)
│
├── create_tables.py                    # Database table initialization script
├── generate_token.py                   # Development token generation script
├── requirements.txt                    # Pinned production dependencies
└── README.md
```

---

## 🔐 Security & Dual-Context Authentication

The platform strictly segregates Platform Administration from Tenant Processing using distinct token structures and authorization middlewares:

```text
+──────────────────────────────────────────────────────────+
|                    DUAL-CONTEXT JWT MODEL                |
+─────────────────────────────┬─────────────────────────────+
|        ADMIN CONTEXT        |       COMPANY CONTEXT       |
| • Prefix: /admin/*          | • Scope: Tenant API Access  |
| • Scope: Platform Owner     | • Prefix: /company/*,       |
| • Claims:                   |   /documents/*, /client/*,  |
|   - sub: admin_id           |   /hr/*, /chatbot/*         |
|   - role: "admin"           | • Claims:                   |
|   - email: admin email      |   - sub: company_id         |
| • Guard: `admin_auth.py`    |   - company_id: tenant ID   |
|                             |   - token_type: "client"    |
|                             | • Guard: `auth.py`          |
+─────────────────────────────┴─────────────────────────────+
```

The **same company JWT and `auth.py` guard** used by the document pipeline is reused by the JD matching routes (`hr_ranking_routes.py`) and chatbot routes (`chatbot_routes.py`). Every JD, ranking result, and chat message is written and read against the `company_id` extracted from that token, enforcing tenant isolation uniformly.

### 🚦 Tenant Lifecycle State Machine

Requests authenticated via company tokens must pass status validation in `app/core/auth.py`:

- **PENDING:** Request is blocked with `403 Forbidden` (Company approval is pending).
- **ACTIVE:** Full access to blueprint registration, document processing, JD matching, chatbot, and self-service analytics.
- **REJECTED:** Request is blocked with `403 Forbidden` (Company access has been rejected).

---

## 📑 Dynamic Blueprint & Schema Engine

Companies register arbitrary document blueprints (via raw JSON, `.docx`, or `.doc`):

```http
POST /company/register-blueprint-json
POST /company/register-blueprint-doc
```

**Blueprint Schema** (`config/companies/<company_id>/document_types.json`):

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

When `POST /documents/process` is invoked with `enable_signature_detection=true`:

1. **Entitlement Verification:** The system verifies whether `is_signature_addon_enabled` is active for the company.
2. **Dynamic In-Pass Prompt Clause:** Signature inspection instructions are injected directly into the single Qwen VL prompt, allowing quality inspection, category matching, field extraction, and signature detection to execute in a single vision inference call per page.
3. **Strict Negative Discrimination:** The vision engine distinguishes genuine handwritten cursive pen ink and official rubber/wet stamps from non-signature artifacts (e.g., portrait photos, QR codes, typed names in parentheses, and decorative borders).

```json
Raw Page Image (Bytes) + Tenant Blueprints + In-Pass Prompt
                      │
                      ▼
               Qwen Vision Engine
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

---

## ⚡ Parallel Document Processing & Asynchronous Worker Pipeline

To handle multi-page candidate bundles and bulk PDF uploads with high throughput, the document processing pipeline uses an asynchronous worker pattern built on `asyncio.gather` and adaptive semaphores:

```text
Incoming Multi-Page PDF / Document Batch
                  │
                  ▼
         PyMuPDF Normalizer
                  │
                  ▼
   [ Page 1 ]   [ Page 2 ]   [ Page 3 ]   ...   [ Page N ]
       │            │            │                   │
       └────────────┼────────────┴───────────────────┘
                    │
                    ▼ (Concurrent Execution via asyncio.gather)
     [ Qwen VL Single-Pass Vision Inference Workers ]
           (Rate-Limited & Semaphore-Protected)
                    │
                    ▼
     Contiguous Page Stitcher & Data Merger
                    │
                    ▼
     PostgreSQL Persistence & Metering Ledger
```

- **Concurrency Control:** Processing tasks utilize token-bucket semaphores and sliding-window rate limiters to prevent flooding downstream vision inference models while maximizing throughput.
- **Resilience:** Network calls to the Qwen vision endpoint are wrapped in exponential backoff retry decorators, handling transient gateway errors gracefully.
- **Unified Extraction Output:** The resulting structured `extracted_data` is persisted per candidate and directly shared with the JD Matching Engine and Chatbot.

---

## 💳 Dynamic Billing, Metering & Usage Analytics

Dynamic rates are configured by administrators in real-time:

> **Total Amount Due = (Total Pages Scanned × Price per Page) + (Actual Signatures Detected × Price per Signature)**

**Data Models** (`app/models/billing.py`):

- **CompanyProfile:** Tracks tenant metadata and signature add-on activation flags.
- **PricingRates:** Live dynamic rate settings (`price_per_page`, `price_per_signature_check`, `currency`).
- **UsageRecord:** Per-request transaction log (`request_id`, `company_id`, `total_pages`, `signature_checks_count`, `cost_incurred`, `timestamp`).

---

## 🗄️ Database Schema (PostgreSQL)

The platform runs on a single PostgreSQL database (`document_onboarding`) as the sole source of truth. Every table below is tenant-scoped by `company_id`.

| Table | Purpose | Consumed by |
|---|---|---|
| `admin_users` | Admin/staff login accounts | Admin dashboard |
| `companies` | Company accounts — login, approval status, active flag, signature add-on entitlement | Auth, billing, all tenant-scoped routes |
| `invite_tokens` | One-time invite codes used to onboard new companies | Admin → Company onboarding flow |
| `document_submissions` | Parent record per uploaded candidate document batch | Document pipeline |
| `extracted_documents` | OCR-extracted structured candidate data (JSONB) + raw OCR output, per document | Document pipeline, JD Matching Engine, Chatbot |
| `document_scans` | Per-scan record: filename, page count, extracted JSON, processing cost | Document pipeline, Billing, Chatbot |
| `guideline_check_results` | Stage 2 guideline verification results (CLEARED / UNCLEARED) per document | Guidelines Verification Layer |
| `job_descriptions` | Stored JD text + AI-extracted requirements (skills, experience, education), per company | JD Matching Engine, Chatbot |
| `chat_sessions` | One row per chatbot conversation thread | Chatbot |
| `chat_messages` | Every user + assistant message, linked to a session, with sources and match counts | Chatbot |
| `audit_logs` | Reserved for admin/company action logging (approvals, rejections) | Administrative auditing |

### Key column detail — `job_descriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER (PK) | |
| `company_id` | VARCHAR(100), FK → `companies.company_id` | Tenant scoping |
| `job_title` | VARCHAR(255) | Reference title for dashboard and chatbot follow-ups |
| `raw_jd_text` | TEXT | Full pasted/uploaded JD |
| `extracted_requirements` | JSONB | Skills, experience, education parsed out by `jd_matcher` |
| `created_at` | TIMESTAMPTZ | |

### Key column detail — `chat_sessions` / `chat_messages`

| Column | Type | Notes |
|---|---|---|
| `chat_sessions.session_id` | VARCHAR(100), UNIQUE | External session ID used by the frontend widget |
| `chat_sessions.company_id` | VARCHAR(100), FK → `companies.company_id` | Tenant scoping for the conversation |
| `chat_sessions.title` | VARCHAR(255) | Auto-generated title from the first message |
| `chat_messages.session_id` | VARCHAR(100), FK → `chat_sessions.session_id` | Links message to its thread |
| `chat_messages.sender` | VARCHAR(20) | `user` or `assistant` |
| `chat_messages.message_text` | TEXT | Message content |
| `chat_messages.sources` | JSONB | Source documents/records grounding the answer |
| `chat_messages.records_found` | INTEGER | Count of DB records used |

---

## 🎯 AI-Powered JD Matching & Candidate Recommendation Engine

Companies can paste or upload a job description to automatically score candidates against it. This uses the extracted candidate data (`extracted_documents` / `document_scans`) produced by the vision pipeline.

```text
    Job Description (raw text)
               │
               ▼
  jd_matcher.extract_jd_requirements()
               │
               ▼
  Structured JD Requirements (JSONB)
   { skills: [...], experience: "X yrs", education: "..." }
               │
               ▼
  jd_matcher.calculate_candidate_match()  ◄──── extracted_documents / document_scans
               │                             (all candidates, scoped to company_id)
               ▼
  Per-candidate Match Result
   { candidate: "...", match_score: 82%, strengths: [...], gaps: [...] }
               │
               ▼
    Ranked Candidate List (persisted, re-queryable without recomputation)
```

**How it works:**
1. **Requirement Extraction:** `jd_matcher.extract_jd_requirements()` parses raw JD text into structured requirements.
2. **Storage:** Saved to `job_descriptions`, scoped to the company.
3. **Scoring:** `jd_matcher.calculate_candidate_match()` compares candidate records against requirements to produce a percentage match score, strengths, and gaps.
4. **Shared Logic:** Called by both the HR ranking dashboard (`app/api/hr_ranking_routes.py`) and the chatbot's JD-matching intent.
5. **Persistence:** Results are stored against `job_description_id` for instant retrieval on subsequent requests.
6. **Tenant Isolation:** Only candidate records belonging to the requesting company are evaluated.

---

## 💬 RAG-Based Conversational Assistant (Chatbot)

A floating chatbot widget is available across the authenticated dashboard, answering queries strictly from the company's database records.

```text
 User message (chat widget)
           │
           ▼
 JWT validated → company_id extracted
           │
           ▼
 Intent classified per message
           │
    ┌──────┼───────────┬──────────────┐
    ▼      ▼           ▼              ▼
 Intent A  Intent B    Intent C       Intent D
 Document  New JD /    Stored JD      Greeting /
 lookup    Match req.  ranking query  small talk
    │          │           │              │
    ▼          ▼           ▼              ▼
 Search    Run JD      Fetch saved    Reply directly
 extracted_ matcher    ranking from   — no DB call,
 documents/ pipeline,  job_descriptions no scoring
 document_ store JD +  + stored match pipeline
 scans     results     results
 (company- (company-   (company-
 scoped)    scoped)     scoped)
    │          │           │
    └─────┬────┴──────┬────┘
          ▼           ▼
   Matched records passed to the
   shared Qwen Instruct model with
   a strict grounding prompt:
   "Answer ONLY from the records
    below. If not present, say so."
          │
          ▼
   Answer + Sources + records_found
          │
          ▼
   Persisted to chat_messages,
   session tracked in chat_sessions
          │
          ▼
   Rendered in the widget — sources
   collapsed by default behind a
   "Sources ▼" toggle
```

### Conversation History & Grounding
- Sessions are tracked via `chat_sessions` and turns are persisted in `chat_messages`, surviving page refreshes and logouts.
- Answers are strictly grounded in retrieved database records with explicit citation tracking.
- Sensitive fields (such as government IDs) are masked according to privacy guidelines.

---

## ✅ Company Guidelines Verification Layer

Structured candidate evidence is verified against business rules using the **shared Qwen Instruct model**.

```text
Company Guidelines (Rules) + Structured Document Evidence (Facts)
                             │
                             ▼
              Guidelines Verification Engine
                             │
                             ▼
              Shared Qwen Instruct Reasoning Call
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
           CLEARED                       UNCLEARED
   (Requirement Verified)         (Deficient / Missing / Conflicted)
```

**Outcomes:**
- **CLEARED:** Evidence completely satisfies the guideline.
- **UNCLEARED:** Requirement cannot be proven due to gaps or missing documentation.

**Response Contract:**
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

## 🔌 Complete API Reference

### 🏥 Health & System Status
- `GET /` - Root status and metadata.
- `GET /health` - System health probe.

### 🛡️ Platform Administration
- `POST /admin/login` - Authenticate admin credentials and return Admin JWT.
- `GET /admin/companies` - List all registered companies.
- `POST /admin/companies/{company_id}/approve` - Approve tenant (PENDING → ACTIVE).
- `POST /admin/companies/{company_id}/reject` - Reject tenant (`is_active = false`).
- `GET /admin/analytics/overview?period={daily|weekly|monthly|all}` - Platform revenue and usage analytics.
- `GET /admin/analytics/companies/{company_id}?period={period}` - Detailed audit logs and invoice for a specific tenant.
- `PUT /admin/billing/pricing` - Dynamically set `price_per_page` and `price_per_signature_check`.
- `PATCH /admin/companies/{company_id}/signature-addon` - Toggle signature scanning subscription.

### 🏢 Company & Document Processing
- `POST /company/login` - Authenticate company credentials.
- `POST /company/register-blueprint-json` - Register document blueprint via JSON.
- `POST /company/register-blueprint-doc` - Register blueprint via file upload.
- `POST /documents/process?enable_signature_detection={true|false}` - Process parallel multi-page candidate PDF batch.
- `GET /client/usage/summary?period={daily|weekly|monthly|all}` - Self-service volume and billing summary.

### 🎯 JD Matching & Candidate Ranking
- `POST /hr/job-descriptions` - Submit a raw JD; parses and stores requirements.
- `GET /hr/job-descriptions` - List all stored JDs for the company.
- `GET /hr/job-descriptions/{jd_id}` - Retrieve a single JD and its requirements.
- `POST /hr/job-descriptions/{jd_id}/rank` - Score candidates against the JD.
- `GET /hr/job-descriptions/{jd_id}/rankings` - Retrieve saved rankings.

### 💬 Chatbot
- `POST /chatbot/query` - Submit a natural-language query; routed via intent classification and grounded in company records.
- `GET /chatbot/sessions` - List company chat sessions.
- `GET /chatbot/sessions/{session_id}/messages` - Retrieve session message history.
- `GET /chatbot/suggestions` - Contextual prompt suggestions.

---

## 💻 Installation & Local Development

### 📋 Prerequisites
- Python 3.11+
- PostgreSQL server
- Active API access to a Qwen VL / Instruct-compatible endpoint

### ⚙️ Setup Steps

**1. Clone Repository & Create Virtual Environment:**
```bash
git clone https://github.com/27Shambhavi/Document_Onboarding.git
cd Document_Onboarding
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**2. Install Dependencies:**
```bash
pip install -r requirements.txt
```

**3. Configure Environment Variables (`.env`):**
```env
NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=qwen/qwen-instruct-model-id

JWT_SECRET_KEY=supersecretjwtkeyforauthentication123
JWT_ALGORITHM=HS256
ADMIN_SECRET_KEY=adminsecretkey123

DATABASE_URL=postgresql+psycopg2://postgres:yourpassword@localhost:5432/document_onboarding
SYSTEM_TIER=FREE
```

**4. Initialize Database Tables:**
```bash
python create_tables.py
```

**5. Start Application Server:**
```bash
uvicorn app.main:app --reload
```
Interactive Swagger UI: `[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)`.

---

## 🧪 End-to-End Verification Run

```text
1.  GET /health                                              -> Verify system health
2.  POST /admin/login                                        -> Obtain Admin JWT
3.  Authorize Swagger UI with Admin Bearer Token
4.  GET /admin/companies                                     -> List pending tenants
5.  POST /admin/companies/ABC/approve                        -> Activate company ABC
6.  PATCH /admin/companies/ABC/signature-addon               -> Set is_signature_addon_enabled: true
7.  PUT /admin/billing/pricing                               -> Set rates
8.  POST /company/login                                      -> Obtain Company JWT for ABC
9.  Authorize Swagger UI with Company Bearer Token
10. POST /company/register-blueprint-json                    -> Submit document blueprint
11. POST /documents/process?enable_signature_detection=true  -> Upload test candidate PDF batch
12. GET /client/usage/summary?period=monthly                 -> Verify usage metrics & bill
13. POST /hr/job-descriptions                                -> Submit sample JD
14. POST /hr/job-descriptions/{jd_id}/rank                   -> Score uploaded candidates
15. GET /hr/job-descriptions/{jd_id}/rankings                -> Confirm persisted rankings
16. POST /chatbot/query  {"message": "What is the PAN number of candidate X?"} -> Grounded RAG answer
17. POST /chatbot/query  {"message": "Rank candidates for: <JD text>"}         -> JD match answer
18. POST /chatbot/query  {"message": "hi"}                                    -> Fast greeting response
19. GET /chatbot/sessions/{session_id}/messages              -> Confirm history persistence
20. Switch Swagger UI to Admin Bearer Token
21. GET /admin/analytics/overview?period=monthly             -> Verify aggregated platform revenue
```

---

## ✅ Implemented vs Planned Checklist

### 🚀 Implemented & Production Ready
- [x] FastAPI modular routing and CORS middleware
- [x] PostgreSQL & SQLAlchemy multi-tenant database models
- [x] Dual-context JWT authentication (Admin vs Company)
- [x] Tenant lifecycle state guardrails (PENDING, ACTIVE, REJECTED)
- [x] Dynamic blueprint ingestion (JSON, DOCX, DOC)
- [x] PyMuPDF-based image normalization pipeline
- [x] Parallel asynchronous worker processing (`asyncio.gather`)
- [x] Single-Pass Vision Inference via Qwen VL
- [x] In-pass quality scoring (GOOD vs BAD)
- [x] Precise handwritten signature and physical stamp detection
- [x] Strict negative visual discrimination
- [x] Multi-page contiguous document stitching
- [x] Sliding-window rate limiters and exponential backoff retry handling
- [x] Dynamic admin pricing management (`price_per_page`, `price_per_signature_check`)
- [x] Asynchronous per-request usage logging and billing calculation
- [x] Time-series analytics aggregation (Daily, Weekly, Monthly, All-time)
- [x] Client self-service billing portal endpoints
- [x] Admin platform-wide revenue and tenant usage overviews
- [x] Company Guidelines ingestion and storage endpoints
- [x] Structured guidelines representation and rule parser
- [x] Shared Qwen Instruct reasoning integration for guideline verification
- [x] Automated CLEARED / UNCLEARED rule verification
- [x] Consolidated candidate onboarding decision API
- [x] AI-powered JD requirement extraction (`jd_matcher.extract_jd_requirements`)
- [x] Candidate-vs-JD scoring engine (`jd_matcher.calculate_candidate_match`) shared across dashboard and chatbot
- [x] Persisted, re-queryable JD rankings (`job_descriptions` table)
- [x] RAG chatbot with company-scoped database grounding (document lookup + JD matching + stored rankings + greetings)
- [x] Persistent chat history (`chat_sessions`, `chat_messages`) with per-message source tracking
- [x] Collapsed-by-default source citations in the chat UI, expandable on demand

### 🎯 Planned (Phase III)
- [ ] Formal `UNIQUE`/`NOT NULL` constraints on `companies.email`
- [ ] Removal of empty legacy `admins` table
- [ ] Active use of `audit_logs` for admin/company action tracking
- [ ] PII masking configuration UI for sensitive extracted fields surfaced via the chatbot
```
