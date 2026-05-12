"""FastAPI backend for the ONCF optimisation platform.

Endpoints
---------
GET  /api/ertms.xlsx  → serves the cached Excel file. Downloads from SharePoint on first call.
POST /api/refresh     → forces a fresh download from SharePoint. Returns JSON with timestamp.
GET  /api/status      → returns cache state (exists + last updated) without touching SharePoint.
GET  /api/health      → basic liveness check (doesn't hit SharePoint).

Run
---
    cd backend
    pip install -r requirements.txt
    cp .env.example .env           # fill in SharePoint credentials
    python main.py                 # starts uvicorn on :8000

The React app's Vite dev server proxies /api/* → http://localhost:8000 (see vite.config.js).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing sharepoint.py so it sees the vars
load_dotenv()

import uvicorn  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402

from sharepoint import SharePointClient, SharePointError  # noqa: E402

# ---------------------------------------------------------------------------
# Paths & cache state
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).parent
CACHE_DIR = BACKEND_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_FILE = CACHE_DIR / "ertms.xlsx"


def _cache_mtime_iso() -> str | None:
    """Return ISO-8601 UTC timestamp of the cached file, or None if no cache."""
    if not CACHE_FILE.exists():
        return None
    ts = CACHE_FILE.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _download_and_cache() -> dict:
    """Download the Excel from SharePoint, write to cache, return a status dict.

    Raises SharePointError (caught by the endpoint) on any SP-side failure.
    """
    client = SharePointClient()  # validates env vars
    content = client.download_file()
    CACHE_FILE.write_bytes(content)
    return {
        "ok": True,
        "size_bytes": len(content),
        "last_updated": _cache_mtime_iso(),
        "source": f"sharepoint://{client.tenant}/sites/{client.site}",
    }


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ONCF Service Optimisation Backend",
    description="Proxies SharePoint for the ERTMS Excel file and handles refresh/caching.",
    version="1.0.0",
)

# CORS: allow the Vite dev server to call us directly if someone bypasses the proxy.
# In production (same-origin deploy) this is unnecessary but harmless.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",  # vite preview
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Liveness check. Doesn't touch SharePoint — safe to poll frequently."""
    return {
        "ok": True,
        "cache_exists": CACHE_FILE.exists(),
        "last_updated": _cache_mtime_iso(),
    }


@app.get("/api/status")
def status():
    """Reports the cache state in detail. Used by the frontend to show 'Last updated X ago'."""
    exists = CACHE_FILE.exists()
    return {
        "cache_exists": exists,
        "last_updated": _cache_mtime_iso(),
        "size_bytes": CACHE_FILE.stat().st_size if exists else 0,
    }


@app.get("/api/ertms.xlsx")
def get_ertms():
    """Serve the cached Excel file. Downloads from SharePoint on first call (no cache yet)."""
    if not CACHE_FILE.exists():
        # First request ever — warm the cache by downloading from SharePoint
        try:
            _download_and_cache()
        except SharePointError as e:
            # Return a structured error so the frontend can show it nicely.
            # 503 Service Unavailable conveys "SP is down / auth failed" better than 500.
            raise HTTPException(
                status_code=503,
                detail={"error": "sharepoint_error", "message": str(e)},
            )

    return FileResponse(
        path=CACHE_FILE,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="ertms.xlsx",
        headers={
            # Tell browsers/Vite not to cache this — the frontend fetches with cache: no-store anyway,
            # but belt-and-suspenders since the same URL's contents change after /refresh.
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Last-Modified": _cache_mtime_iso() or "",
        },
    )


@app.post("/api/refresh")
def refresh():
    """Force a fresh download from SharePoint. Invoked by the 'Actualiser' button."""
    try:
        result = _download_and_cache()
    except SharePointError as e:
        raise HTTPException(
            status_code=503,
            detail={"error": "sharepoint_error", "message": str(e)},
        )
    except Exception as e:
        # Catch-all — we don't want to leak stack traces to the frontend
        raise HTTPException(
            status_code=500,
            detail={"error": "unexpected", "message": str(e)},
        )
    return JSONResponse(result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    # reload=True is nice for dev but brittle when SharePointClient holds a cached token.
    # Off by default — flip to True in your own shell if you want hot reload.
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=False)
