from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_routes import router as admin_router
from app.api.billing_routes import billing_router
from app.api.company_auth_routes import router as company_auth_router
from app.api.document_routes import router as document_router  # <-- Blueprint & OCR Router
from app.api.guideline_routes import router as guideline_router
from app.api.pipeline_routes import router as pipeline_router

app = FastAPI(
    title="Automated Document Intelligence & Compliance Audit",
    description="Full Document Onboarding, Blueprint Validation, and ID Contract Compliance Engine.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Authentication & Admin
app.include_router(company_auth_router)
app.include_router(admin_router)

# 2. Layer 1: Document Onboarding & Blueprint Quality Check
app.include_router(document_router)

# 3. Layer 2: Guidelines Policy & Finetech Webhook Contract
app.include_router(guideline_router)

# 4. Layer 3: 1-Click Automated Audit (ZIP/PDF Folder Pipeline)
app.include_router(pipeline_router)

# 5. Billing & Analytics
app.include_router(billing_router)


@app.get("/", tags=["Health & Status"])
def root():
    return {"application": "Document Intelligence Engine", "status": "running"}


@app.get("/health", tags=["Health & Status"])
def health():
    return {"status": "healthy"}