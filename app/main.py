from fastapi import FastAPI

from app.api.billing_routes import billing_router
from app.api.routes import router

app = FastAPI(
    title="Dynamic Document Intelligence",
    description=(
        "Dynamic document quality, classification, extraction, signature"
        " verification, and billing system"
    ),
    version="1.0.0",
)

# Include both Document Intelligence and Billing routers
app.include_router(router)
app.include_router(billing_router)


@app.get("/")
def root():
  return {
      "application": "Dynamic Document Intelligence",
      "status": "running",
      "version": "1.0.0",
  }


@app.get("/health")
def health():
  return {"status": "healthy"}