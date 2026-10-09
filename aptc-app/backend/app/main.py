"""FastAPI entrypoint."""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .deps import UPLOAD_DIR, engine
from .models import Base
from .routers import catalog, ops, spec

Base.metadata.create_all(bind=engine)

app = FastAPI(title="APTC-Electrical and Building API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], allow_credentials=False)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.include_router(catalog.router, prefix="/api", tags=["catalog"])
app.include_router(ops.router, prefix="/api", tags=["ops"])
app.include_router(spec.router, prefix="/api", tags=["spec"])


@app.get("/api/health")
def health():
    return {"ok": True, "service": "aptc-api"}
