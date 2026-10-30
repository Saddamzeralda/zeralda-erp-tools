"""Sync endpoints for offline-to-cloud synchronization.

Exposes /api/sync/* routes for checking sync status, pushing local offline sales,
pulling remote updates, and two-way reconciliation.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import sync_service
from app.services.security import get_session_token, validate_session

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _is_authorized_sync(request: Request) -> bool:
    """Validate either a valid sync token or an authenticated admin session."""
    token = request.headers.get("X-Sync-Token") or request.headers.get("X-Sync-Key")
    expected = sync_service.get_sync_token()
    if token and token.strip() == expected:
        return True

    user = validate_session(request)
    if user and user.get("role") in ("admin", "developer"):
        return True

    return False


class CloudImportRequest(BaseModel):
    data: Dict[str, Any]
    users: Optional[Dict[str, Any]] = None
    allow_shrink: Optional[bool] = False


class SyncPushRequest(BaseModel):
    keys: Optional[List[str]] = None


@router.get("/status")
async def sync_status_endpoint():
    """Return local synchronization status, last sync timestamp, and cloud connectivity."""
    return sync_service.get_sync_status()


@router.get("/cloud-export")
async def cloud_export_endpoint(request: Request):
    """Export authoritative store and accounts for cross-device/cloud synchronization."""
    if not _is_authorized_sync(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"ok": False, "error": "Unauthorized sync export"},
        )
    return sync_service.export_for_cloud()


@router.post("/cloud-import")
async def cloud_import_endpoint(request: Request, body: CloudImportRequest):
    """Import and merge business data and accounts from peer server."""
    if not _is_authorized_sync(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"ok": False, "error": "Unauthorized sync import"},
        )
    return sync_service.import_from_peer(body.data, body.users)


@router.post("/push")
async def sync_push_endpoint(request: Request, body: Optional[SyncPushRequest] = None):
    """Push local store state to the remote cloud server."""
    token = get_session_token(request)
    keys = body.keys if body else None
    result = sync_service.push_to_cloud(auth_token=token, keys=keys)
    if not result.get("ok"):
        return JSONResponse(status_code=502, content=result)
    return result


@router.post("/pull")
async def sync_pull_endpoint(request: Request):
    """Pull remote updates from the cloud server into the local store."""
    token = get_session_token(request)
    result = sync_service.pull_from_cloud(auth_token=token)
    if not result.get("ok"):
        return JSONResponse(status_code=502, content=result)
    return result


@router.post("/reconcile")
async def sync_reconcile_endpoint(request: Request):
    """Perform two-way bidirectional reconciliation between local store and cloud."""
    token = get_session_token(request)
    result = sync_service.reconcile_sync(auth_token=token)
    if not result.get("ok"):
        return JSONResponse(status_code=502, content=result)
    return result
