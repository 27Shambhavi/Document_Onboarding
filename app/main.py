import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.admin_routes import router as admin_router
from app.api.billing_routes import billing_router
from app.api.company_auth_routes import router as company_auth_router
from app.api.document_routes import router as document_router  # <-- Blueprint & OCR Router
from app.api.guideline_routes import router as guideline_router
from app.api.hr_ranking_routes import router as hr_ranking_router
from app.api.pipeline_routes import router as pipeline_router
from app.api.scan_routes import router as scan_router, api_scan_router, static_upload_router  # <-- Scan History & Document Router
from app.api.chatbot_routes import router as chatbot_router  # <-- RAG Chatbot Router

logger = logging.getLogger("app.main")

app = FastAPI(
    title="Automated Document Intelligence & Compliance Audit",
    description="Full Document Onboarding, Blueprint Validation, and ID Contract Compliance Engine.",
    version="2.0.0",
)

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(
        f"Database exception during {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    error_msg = str(exc.orig) if hasattr(exc, "orig") and exc.orig else str(exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "detail": f"Database error occurred: {error_msg}",
            "code": "DATABASE_ERROR",
        },
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

# 6. Scan History & Document Preview Endpoints
app.include_router(scan_router)
app.include_router(api_scan_router)
app.include_router(static_upload_router)

# 7. RAG Chatbot (Task 2)
app.include_router(chatbot_router)

# 8. AI Candidate Ranking & JD Match
app.include_router(hr_ranking_router)


@app.get("/", tags=["Health & Status"])
def root():
    return {"application": "Document Intelligence Engine", "status": "running"}


@app.get("/health", tags=["Health & Status"])
def health():
    return {"status": "healthy"}