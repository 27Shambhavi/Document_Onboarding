from fastapi import FastAPI

from app.api.admin_routes import router as admin_router
from app.api.billing_routes import billing_router
from app.api.company_auth_routes import router as company_auth_router
from app.api.routes import router

app = FastAPI(
    title="Dynamic Document Intelligence",
    description=(
        "Dynamic document quality, classification, extraction, signature"
        " verification, and billing system"
    ),
    version="1.0.0",
)

# Include Document Intelligence, Auth, Admin, and Billing routers
app.include_router(company_auth_router)
app.include_router(admin_router)
app.include_router(router)
app.include_router(billing_router)


@app.get("/", tags=["Health & Status"])
def root():
  return {
      "application": "Dynamic Document Intelligence",
      "status": "running",
      "version": "1.0.0",
  }


@app.get("/health", tags=["Health & Status"])
def health():
  return {"status": "healthy"}