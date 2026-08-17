from fastapi import FastAPI

from app.api.routes import router


app = FastAPI(
    title="Dynamic Document Intelligence",
    description="Dynamic document quality, classification and extraction system",
    version="1.0.0",
)


app.include_router(router)


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