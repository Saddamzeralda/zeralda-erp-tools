"""Sync endpoints for offline-to-cloud synchronization.

Exposes /api/sync/* routes for checking sync status, pushing local offline sales,
pulling remote updates, and two-way reconciliation.
"""
from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services import sync_service
from app.services.security import get_session_token

router = APIRouter(prefix="/api/sync", tags=["sync"])


class SyncPushRequest(BaseModel):
    keys: Optional[List[str]] = None


@router.get("/status")
async def sync_status_endpoint():
    """Return local synchronization status, last sync timestamp, and cloud connectivity."""
    return sync_service.get_sync_status()


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

