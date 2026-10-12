"""License API endpoints — license generation, validation, and management.

Endpoints:
  GET  /api/license/public-key      — get the RSA public key (for client-side verification)
  POST /api/license/validate        — validate a license key (online activation)
  POST /api/license/deactivate      — deactivate a license for this machine
  POST /api/license/heartbeat       — client phone-home (records last-seen, returns status)
  GET  /api/license/server-status   — get the current server-side license status
  POST /api/license/create          — create a new license (admin only)
  POST /api/license/revoke          — revoke a license (admin only)
  GET  /api/license/list            — list all licenses (admin only)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.security import (
    get_session_token,
    read_json_body,
    require_auth,
    validate_session,
    MAX_BODY_BYTES,
)
from app.services import license_service

router = APIRouter(prefix="/api/license", tags=["license"])


# ── Pydantic models ────────────────────────────────────────────────────────
class ValidateRequest(BaseModel):
    licenseKey: str
    hwFingerprint: Optional[str] = None
    hwId: Optional[str] = None


class DeactivateRequest(BaseModel):
    licenseKey: str
    hwFingerprint: Optional[str] = None


class HeartbeatRequest(BaseModel):
    licenseKey: Optional[str] = None
    hwFingerprint: Optional[str] = None
    hwId: Optional[str] = None


class CreateRequest(BaseModel):
    type: str = "standard"  # standard | trial | enterprise | subscription
    customer: str = ""
    email: str = ""
    expiresDays: int = 0  # 0 = perpetual
    maxDevices: int = 1
    features: list = Field(default_factory=lambda: ["*"])
    hwFingerprint: Optional[str] = None
    hwId: Optional[str] = None


class RevokeRequest(BaseModel):
    licenseKey: str


# ── Public endpoints (no auth required for public-key and validate) ────────
@router.get("/public-key")
async def get_public_key():
    """Return the RSA public key (SPKI, base64) for client-side license verification."""
    try:
        spki_b64 = license_service.get_public_key_spki_b64()
        return {"ok": True, "publicKey": spki_b64}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": f"Failed to get public key: {e}"},
        )


@router.post("/validate")
async def validate(request: Request):
    """Validate a license key and optionally bind it to hardware."""
    data = await read_json_body(request, max_bytes=4096)
    try:
        req = ValidateRequest(**{k: v for k, v in data.items() if k in ValidateRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = license_service.validate_license(
        license_key=req.licenseKey.strip(),
        hw_fingerprint=req.hwFingerprint,
        hw_id=req.hwId,
    )

    # If validation succeeded, clear trial state (license is now active)
    if result.get("ok"):
        try:
            license_service.clear_trial_state()
        except Exception:
            pass

    status_code = 200 if result.get("ok") else 403
    return JSONResponse(status_code=status_code, content=result)


@router.post("/deactivate")
async def deactivate(request: Request):
    """Deactivate a license for this machine."""
    data = await read_json_body(request, max_bytes=4096)
    try:
        req = DeactivateRequest(**{k: v for k, v in data.items() if k in DeactivateRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = license_service.deactivate_license(
        license_key=req.licenseKey.strip(),
        hw_fingerprint=req.hwFingerprint,
    )
    return result


# ── Heartbeat & server status (phone-home mechanism) ───────────────────────
@router.post("/heartbeat")
async def heartbeat(request: Request):
    """Client phone-home endpoint.

    Called periodically by the client to:
      1. Record the last-seen timestamp on the server
      2. Validate the license (if provided) and update activation lastSeen
      3. Return the current server-side license status

    This is the core of the phone-home mechanism: the server tracks
    when clients last checked in, and uses this to enforce the grace period.
    """
    data = await read_json_body(request, max_bytes=4096)
    try:
        req = HeartbeatRequest(**{k: v for k, v in data.items() if k in HeartbeatRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    status = license_service.record_heartbeat(
        license_key=req.licenseKey.strip() if req.licenseKey else None,
        hw_fingerprint=req.hwFingerprint,
        hw_id=req.hwId,
    )
    return {"ok": True, "status": status}


@router.get("/server-status")
async def server_status():
    """Get the current server-side license status (no auth required).

    This is used by the client to check if the server will accept API
    requests, without needing to send the license key.
    """
    status = license_service.get_server_license_status()
    return {"ok": True, "status": status}


@router.get("/hw-info")
async def get_hw_info():
    """Get the host server's machine hardware ID and fingerprint."""
    return {"ok": True, "hw": license_service.get_server_hw_info()}


# ── Admin endpoints (require auth + admin role) ────────────────────────────
async def _require_admin(request: Request):
    """Ensure the request is from an authenticated admin user."""
    if not require_auth(request):
        from app.services.security import AUTH_DISABLED_IN_DEV, ENVIRONMENT
        if not (ENVIRONMENT == "development" and AUTH_DISABLED_IN_DEV):
            raise HTTPException(401, detail={"ok": False, "error": "Authentication required"})

    # Check admin role (skip in dev mode with auth disabled)
    from app.services.security import AUTH_DISABLED_IN_DEV, ENVIRONMENT
    if ENVIRONMENT == "development" and AUTH_DISABLED_IN_DEV:
        return  # dev mode — allow

    token = get_session_token(request)
    if not token:
        raise HTTPException(401, detail={"ok": False, "error": "No session token"})

    session = validate_session(token)
    if not session:
        raise HTTPException(401, detail={"ok": False, "error": "Invalid session"})

    user = session.get("user", {})
    role = user.get("role", "user")
    if role not in ("admin", "superadmin"):
        raise HTTPException(403, detail={"ok": False, "error": "Admin access required"})


@router.post("/create")
async def create_license(request: Request):
    """Create a new license (admin only)."""
    await _require_admin(request)

    data = await read_json_body(request, max_bytes=8192)
    try:
        req = CreateRequest(**{k: v for k, v in data.items() if k in CreateRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = license_service.create_license(
        license_type=req.type,
        customer=req.customer,
        email=req.email,
        expires_days=req.expiresDays,
        max_devices=req.maxDevices,
        features=req.features,
        hw_fingerprint=req.hwFingerprint,
        hw_id=req.hwId,
    )
    return result


@router.post("/revoke")
async def revoke_license(request: Request):
    """Revoke a license (admin only)."""
    await _require_admin(request)

    data = await read_json_body(request, max_bytes=4096)
    try:
        req = RevokeRequest(**{k: v for k, v in data.items() if k in RevokeRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = license_service.revoke_license(req.licenseKey.strip())
    status_code = 200 if result.get("ok") else 404
    return JSONResponse(status_code=status_code, content=result)


@router.get("/list")
async def list_licenses(request: Request):
    """List all licenses (admin only)."""
    await _require_admin(request)
    return license_service.list_licenses()


# ── Usage analytics endpoints (admin only) ─────────────────────────────────
@router.get("/usage-stats")
async def usage_stats(request: Request):
    """Get comprehensive usage statistics (admin only).

    Returns device list, suspicious activity, recent events, and license summary.
    """
    await _require_admin(request)
    return license_service.get_usage_stats()


@router.post("/clear-usage-log")
async def clear_usage_log(request: Request):
    """Clear the usage log (admin only, for maintenance)."""
    await _require_admin(request)
    return license_service.clear_usage_log()
