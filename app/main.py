from fastapi import FastAPI

from app.api.routes import router
from app.api.admin_routes import router as admin_router
from app.api.company_auth_routes import (
    router as company_auth_router,
)


app = FastAPI(
    title="Dynamic Document Intelligence",
    description="Dynamic document quality, classification and extraction system",
    version="1.0.0",
)


app.include_router(router)
app.include_router(admin_router)
app.include_router(company_auth_router)


@app.get("/")
def root():
    return {
        "application": "Dynamic Document Intelligence",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }