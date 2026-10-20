"""Authentication & user-management endpoints.

Mirrors legacy /api/auth/* and /api/keys/* with security fixes:
- Google OAuth: no auto-create by default (GOOGLE_AUTO_CREATE_USERS defaults to false).
- Google OAuth: requires email_verified=true.
- PATCH /api/auth/users/<email>: explicit field whitelist; non-admins cannot change role.
"""
from __future__ import annotations

import os
import secrets
import urllib.request
import urllib.error
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.security import (
    auth_rate_limited,
    get_client_ip,
    get_session_token,
    log_structured,
    read_json_body,
    require_auth,
    validate_session,
    AUTH_RATE_MAX_ATTEMPTS,
    MAX_AUTH_BODY_BYTES,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
keys_router = APIRouter(prefix="/api/keys", tags=["keys"])


# ── Pydantic models (validation = security) ───────────────────────────────
class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str


class GoogleLoginRequest(BaseModel):
    google_token: Optional[str] = None
    access_token: Optional[str] = None


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class KeyGenerateRequest(BaseModel):
    phone: str
    email: Optional[str] = None


class KeyVerifyRequest(BaseModel):
    key: str
    phone: Optional[str] = None


class KeyLoginRequest(BaseModel):
    phone: str
    key: str
    hwFingerprint: Optional[str] = None
    hwId: Optional[str] = None


class KeyRevokeRequest(BaseModel):
    key: str


def _safe_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in user.items() if k not in ("password", "salt", "session_token")}


def _safe_users(users: Dict[str, Any]) -> Dict[str, Any]:
    return {email: _safe_user(u) for email, u in users.items()}


# ── Auth endpoints ─────────────────────────────────────────────────────────
@router.post("/login")
async def login(request: Request):
    from app.services import auth

    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        return JSONResponse(
            status_code=429,
            content={"ok": False, "error": "Too many authentication attempts. Please wait and try again.",
                     "code": "RATE_LIMITED"},
        )

    data = await read_json_body(request, max_bytes=MAX_AUTH_BODY_BYTES)
    try:
        req = LoginRequest(**{k: v for k, v in data.items() if k in LoginRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    identifier = (req.identifier or req.email or "").strip()
    if not identifier or not req.password:
        raise HTTPException(400, detail={"ok": False, "error": "Username/email and password required"})

    ip = request.client.host if request.client else ""
    ua = request.headers.get("User-Agent", "")
    result = auth.authenticate(identifier, req.password, ip, ua)
    return JSONResponse(status_code=200 if result["ok"] else 401, content=result)


@router.post("/google-login")
async def google_login(request: Request):
    from app.services import auth

    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        return JSONResponse(
            status_code=429,
            content={"ok": False, "error": "Too many authentication attempts.", "code": "RATE_LIMITED"},
        )

    data = await read_json_body(request, max_bytes=MAX_AUTH_BODY_BYTES)
    try:
        req = GoogleLoginRequest(**{k: v for k, v in data.items() if k in GoogleLoginRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    google_token = (req.google_token or req.access_token or "").strip()
    if not google_token:
        raise HTTPException(400, detail={"ok": False, "error": "Google token required", "code": "MISSING_TOKEN"})

    # Verify with Google: support both OAuth Access Tokens and Google One-Tap ID Tokens (JWT)
    if google_token.count(".") == 2:
        google_verify_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(google_token)}"
        http_req = urllib.request.Request(google_verify_url)
    else:
        google_userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        http_req = urllib.request.Request(
            google_userinfo_url, headers={"Authorization": "Bearer " + google_token}
        )
    try:
        with urllib.request.urlopen(http_req, timeout=10) as resp:
            userinfo = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log_structured("WARNING", "Google token verification failed", action="google_login",
                       status="token_invalid", http_code=e.code)
        raise HTTPException(401, detail={"ok": False, "error": "Invalid Google token", "code": "INVALID_GOOGLE_TOKEN"})
    except Exception as e:
        log_structured("WARNING", "Google token verification error", action="google_login",
                       status="error", error=str(e))
        raise HTTPException(502, detail={"ok": False, "error": "Failed to verify Google token",
                                          "code": "GOOGLE_VERIFY_FAILED"})

    google_email = str(userinfo.get("email", "")).strip().lower()
    google_name = str(userinfo.get("name", userinfo.get("given_name", ""))).strip()
    google_picture = str(userinfo.get("picture", "")).strip()
    raw_verified = userinfo.get("email_verified", False)
    email_verified = True if raw_verified is True or str(raw_verified).strip().lower() in ("true", "1") else False

    if not google_email:
        raise HTTPException(400, detail={"ok": False, "error": "No email in Google account", "code": "NO_GOOGLE_EMAIL"})
    # FIX: require verified email (legacy didn't check)
    if not email_verified:
        raise HTTPException(400, detail={"ok": False, "error": "Google email not verified",
                                         "code": "EMAIL_NOT_VERIFIED"})

    users = auth.load_users()
    user = users.get(google_email)
    if not user:
        for u_key, u in users.items():
            if str(u.get("email", "")).strip().lower() == google_email or str(u_key).strip().lower() == google_email:
                user = u
                google_email = u_key
                break
    if not user:
        for u_key, u in users.items():
            rem = str(u.get("preferences", {}).get("zeralda-remembered-login", "")).lower()
            if google_email in rem:
                user = u
                google_email = u_key
                break

    if user:
        if not user.get("active", True):
            raise HTTPException(403, detail={"ok": False, "error": "Account is disabled", "code": "ACCOUNT_DISABLED"})
        auth.reset_failed_attempts(google_email)
    else:
        # FIX: default to NO auto-create (legacy defaulted to true — bug #18)
        auto_create = os.getenv("GOOGLE_AUTO_CREATE_USERS", "false").strip().lower() == "true"
        if not auto_create:
            raise HTTPException(403, detail={
                "ok": False,
                "error": "No account found for this Google email. Ask your administrator to create an account.",
                "code": "USER_NOT_FOUND",
            })
        # FIX: default role is viewer (not user) until admin promotes
        random_password = secrets.token_urlsafe(32) + "!Aa1"
        create_result = auth.create_user(google_name or google_email.split("@")[0], google_email,
                                         random_password, "viewer")
        if not create_result.get("ok"):
            raise HTTPException(400, detail={"ok": False, "error": create_result.get("error", "Failed to create user"),
                                              "code": "CREATE_FAILED"})
        users = auth.load_users()
        user = users.get(google_email)

    ip = request.client.host if request.client else ""
    ua = request.headers.get("User-Agent", "")
    session_token = auth.create_session(google_email, ip, ua)

    if google_picture and not user.get("picture"):
        user["picture"] = google_picture
        users[google_email] = user
        auth.save_users(users)

    safe_user = _safe_user(user)
    safe_user["google_login"] = True
    log_structured("INFO", "Google login successful", action="google_login",
                   email=google_email, status="success")
    return {"ok": True, "session_token": session_token, "user": safe_user}


@router.post("/logout")
async def logout(request: Request):
    from app.services import auth
    token = get_session_token(request)
    if token:
        auth.destroy_session(token)
    return {"ok": True, "message": "Logged out"}


@router.get("/validate")
async def validate(request: Request):
    user = validate_session(request)
    if user:
        return {"ok": True, "user": user}
    raise HTTPException(401, detail={"ok": False, "error": "Invalid session"})


# ── Two-Factor Authentication (2FA / TOTP) ─────────────────────────────────
@router.post("/2fa/verify")
async def verify_2fa(request: Request):
    from app.services import auth

    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        return JSONResponse(
            status_code=429,
            content={"ok": False, "error": "Too many verification attempts. Please wait.", "code": "RATE_LIMITED"},
        )

    data = await read_json_body(request, max_bytes=MAX_AUTH_BODY_BYTES)
    temp_token = str(data.get("temp_token") or "").strip()
    code = str(data.get("code") or "").strip()
    if not temp_token or not code:
        raise HTTPException(400, detail={"ok": False, "error": "temp_token and code are required"})

    ip = request.client.host if request.client else ""
    ua = request.headers.get("User-Agent", "")
    res = auth.verify_2fa_login(temp_token, code, ip, ua)
    return JSONResponse(status_code=200 if res.get("ok") else 400, content=res)


@router.get("/2fa/status")
async def get_2fa_status(request: Request):
    user = require_auth(request)
    from app.services import auth

    users = auth.load_users()
    u = users.get(user.get("email", "").lower(), {})
    return {
        "ok": True,
        "enabled": bool(u.get("totp_enabled")),
        "has_secret": bool(u.get("totp_secret")),
    }


@router.get("/2fa/setup")
async def setup_2fa(request: Request):
    user = require_auth(request)
    from app.services import auth

    res = auth.setup_user_2fa(user.get("email", ""))
    return JSONResponse(status_code=200 if res.get("ok") else 400, content=res)


@router.post("/2fa/enable")
async def enable_2fa(request: Request):
    user = require_auth(request)
    from app.services import auth

    data = await read_json_body(request, max_bytes=MAX_AUTH_BODY_BYTES)
    secret = str(data.get("secret") or "").strip()
    code = str(data.get("code") or "").strip()
    if not secret or not code:
        raise HTTPException(400, detail={"ok": False, "error": "secret and code are required"})

    res = auth.enable_user_2fa(user.get("email", ""), secret, code)
    return JSONResponse(status_code=200 if res.get("ok") else 400, content=res)


@router.post("/2fa/disable")
async def disable_2fa(request: Request):
    user = require_auth(request)
    from app.services import auth

    res = auth.disable_user_2fa(user.get("email", ""))
    return JSONResponse(status_code=200 if res.get("ok") else 400, content=res)


@router.post("/register")
async def register(request: Request):
    from app.services import auth
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = RegisterRequest(**{k: v for k, v in data.items() if k in RegisterRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    if req.role not in ("admin", "manager", "user", "viewer"):
        raise HTTPException(400, detail={"ok": False, "error": "Invalid role"})

    result = auth.create_user(req.username, req.email, req.password, req.role)
    log_structured("INFO" if result["ok"] else "WARNING", "User registration",
                   action="register", email=req.email, role=req.role,
                   initiator=user.get("email"), status="success" if result["ok"] else "failed",
                   reason=result.get("error", "OK"))
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@router.get("/users")
async def list_users(request: Request):
    from app.services import auth
    require_auth(request, required_role="admin")
    users = auth.load_users()
    return {"ok": True, "users": _safe_users(users)}


@router.get("/me")
async def me(request: Request):
    user = require_auth(request)
    return {"ok": True, "user": _safe_user(user)}


@router.post("/change-password")
async def change_password(request: Request):
    from app.services import auth
    user = require_auth(request)
    data = await read_json_body(request)
    try:
        req = ChangePasswordRequest(**{k: v for k, v in data.items() if k in ChangePasswordRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = auth.change_password(user["email"], req.current_password, req.new_password)
    if result["ok"]:
        auth.revoke_all_user_sessions(user["email"])
        log_structured("INFO", "Password changed", action="change_password",
                       user=user["email"], status="success")
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@router.patch("/users/{email}")
async def update_user_endpoint(request: Request, email: str):
    from app.services import auth
    import urllib.parse
    requester = require_auth(request)
    target_email = urllib.parse.unquote(email).strip().lower()
    if not target_email:
        raise HTTPException(400, detail={"ok": False, "error": "Target email required"})

    is_admin = requester.get("role") == "admin"
    is_own = requester["email"] == target_email
    if not is_admin and not is_own:
        raise HTTPException(403, detail={"ok": False, "error": "Forbidden", "code": "FORBIDDEN"})

    data = await read_json_body(request)
    try:
        req = UpdateUserRequest(**{k: v for k, v in data.items() if k in UpdateUserRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    updates = req.model_dump(exclude_none=True)
    # FIX: non-admins cannot change role or active (legacy bug #21)
    if not is_admin:
        updates.pop("role", None)
        updates.pop("active", None)

    result = auth.update_user(target_email, updates, requester_role=requester.get("role", "user"))
    if result["ok"]:
        log_structured("INFO", "User updated", action="update_user",
                       target=target_email, initiator=requester["email"],
                       fields=list(updates.keys()), status="success")
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@router.delete("/users/{email}")
async def delete_user_endpoint(request: Request, email: str):
    from app.services import auth
    import urllib.parse
    requester = require_auth(request, required_role="admin")
    target_email = urllib.parse.unquote(email).strip().lower()
    if not target_email:
        raise HTTPException(400, detail={"ok": False, "error": "Target email required"})
    result = auth.delete_user(target_email, requester["email"])
    if result["ok"]:
        log_structured("WARNING", "User deleted", action="delete_user",
                       target=target_email, initiator=requester["email"],
                       sessions_revoked=result.get("sessions_revoked", 0), status="success")
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@router.get("/sessions")
async def list_sessions(request: Request):
    from app.services import auth
    require_auth(request, required_role="admin")
    return auth.get_sessions_info()


@router.post("/sessions/cleanup")
async def cleanup_sessions(request: Request):
    from app.services import auth
    require_auth(request, required_role="admin")
    auth.cleanup_expired_sessions()
    return {"ok": True, "message": "Expired sessions cleaned up"}


@router.get("/preferences")
async def get_preferences(request: Request):
    from app.services import auth
    user = require_auth(request)
    users = auth.load_users()
    prefs = users.get(user.get("email", ""), {}).get("preferences", {})
    return {"ok": True, "preferences": prefs}


@router.post("/preferences")
async def save_preferences(request: Request):
    from app.services import auth
    user = require_auth(request)
    body = await read_json_body(request)
    prefs = body.get("preferences", {})
    if not isinstance(prefs, dict):
        raise HTTPException(400, detail={"ok": False, "error": "preferences must be an object"})
    email = user.get("email", "")
    users = auth.load_users()
    if email in users:
        users[email].setdefault("preferences", {}).update(prefs)
        auth.save_users(users)
    return {"ok": True, "message": "Preferences saved"}


# ── Key login (separate route, not under /api/auth prefix) ─────────────────
@router.post("/login-with-key")
async def login_with_key(request: Request):
    from app.services import auth
    from app.services import keygen_service

    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        return JSONResponse(
            status_code=429,
            content={"ok": False, "error": "Too many authentication attempts.", "code": "RATE_LIMITED"},
        )

    data = await read_json_body(request, max_bytes=MAX_AUTH_BODY_BYTES)
    try:
        req = KeyLoginRequest(**{k: v for k, v in data.items() if k in KeyLoginRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    key_result = keygen_service.authenticate_with_key(req.phone, req.key)
    if not key_result["ok"]:
        log_structured("WARNING", "Failed authentication with key", action="auth_key_failed",
                       phone=req.phone, error=key_result.get("error"), ip=client_ip)
        return JSONResponse(status_code=401, content=key_result)

    user_email = key_result.get("email") or f"user_{req.phone.replace('+', '')}@zeralda.local"
    existing_users = auth.load_users()
    if user_email not in existing_users:
        temp_password = f"Tmp@{secrets.token_hex(8)}A1"
        create_result = auth.create_user(username=req.phone, email=user_email,
                                          password=temp_password, role="user")
        if not create_result["ok"]:
            log_structured("ERROR", "Failed to create user for activation key",
                           action="auth_key_user_creation_failed", phone=req.phone,
                           email=user_email, error=create_result.get("error"))
            raise HTTPException(500, detail={"ok": False, "error": "Failed to create user account",
                                              "code": "USER_CREATION_FAILED"})

    ip = request.client.host if request.client else ""
    ua = request.headers.get("User-Agent", "")
    session_token = auth.create_session(user_email, ip, ua)
    if not session_token:
        raise HTTPException(500, detail={"ok": False, "error": "Failed to create session",
                                          "code": "SESSION_CREATION_FAILED"})

    # ── Unified system: activate the linked RSA license ──────────────────
    # When a user logs in with a keygen key, also activate the linked
    # RSA-signed license on this machine (if hardware info is provided).
    # This bridges the keygen (phone-based auth) and license (machine-bound
    # protection) systems.
    license_info = None
    if req.hwFingerprint and req.hwId:
        try:
            from app.services import license_service
            # Find the linked license
            record = license_service.find_license_by_keygen_key(req.key)
            if record:
                license_key = record["payload"]["licenseKey"]
                # Activate (bind to hardware if first activation)
                activation = license_service.activate_license_for_hw(
                    license_key=license_key,
                    hw_fingerprint=req.hwFingerprint,
                    hw_id=req.hwId,
                )
                if activation.get("ok"):
                    license_info = {
                        "licenseKey": license_key,
                        "signedPayload": activation["signedPayload"],
                        "payload": activation["payload"],
                    }
                    # Clear trial state since a license is now active
                    try:
                        license_service.clear_trial_state()
                    except Exception:
                        pass
                    log_structured("INFO", "License activated via keygen login",
                                   action="license_activated_via_keygen",
                                   keygenKey=req.key, licenseKey=license_key,
                                   hwId=req.hwId, email=user_email)
                else:
                    log_structured("WARN", "License activation failed via keygen",
                                   action="license_activation_failed",
                                   keygenKey=req.key, error=activation.get("error"),
                                   code=activation.get("code"))
        except ImportError:
            pass  # license_service not available
        except Exception as e:
            log_structured("WARN", "License activation error",
                           action="license_activation_error", error=str(e))

    log_structured("INFO", "Successful authentication with activation key",
                   action="auth_key_success", phone=req.phone, email=user_email, ip=client_ip)

    result = {"ok": True, "session_token": session_token, "user_email": user_email,
              "phone": req.phone, "message": "Logged in successfully"}
    if license_info:
        result["license"] = license_info
    return result


# ── KEYGEN endpoints ───────────────────────────────────────────────────────
@keys_router.post("/generate")
async def generate_key(request: Request):
    from app.services import keygen_service
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = KeyGenerateRequest(**{k: v for k, v in data.items() if k in KeyGenerateRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    result = keygen_service.generate_key(req.phone, req.email)
    log_structured("INFO" if result["ok"] else "WARNING", "Key generation",
                   action="keygen_generate", phone=req.phone, initiator=user.get("email"),
                   status="success" if result["ok"] else "failed", error=result.get("error", ""))
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@keys_router.post("/verify")
async def verify_key(request: Request):
    from app.services import keygen_service
    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        log_structured("WARNING", "Key verification rate limited", action="keygen_rate_limited",
                       ip=client_ip, status="blocked")
        return JSONResponse(status_code=429, content={"ok": False, "error": "Too many verification attempts. Please wait.", "code": "RATE_LIMITED"})
    data = await read_json_body(request)
    try:
        req = KeyVerifyRequest(**{k: v for k, v in data.items() if k in KeyVerifyRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    result = keygen_service.verify_key(req.key, req.phone)
    return JSONResponse(status_code=200 if result["ok"] else 401, content=result)


@keys_router.get("/list")
async def list_keys(request: Request, phone: Optional[str] = None, active_only: bool = False):
    from app.services import keygen_service
    require_auth(request, required_role="admin")
    return keygen_service.list_keys(phone_number=phone, active_only=active_only)


@keys_router.get("/list-unified")
async def list_keys_unified(request: Request, phone: Optional[str] = None, active_only: bool = False):
    """List all keygen keys WITH their linked license info (unified view)."""
    from app.services import keygen_service
    require_auth(request, required_role="admin")
    return keygen_service.list_unified(phone_number=phone, active_only=active_only)


@keys_router.get("/license/{key}")
async def get_license_for_key(request: Request, key: str):
    """Get the linked RSA license info for a keygen key."""
    from app.services import keygen_service
    require_auth(request, required_role="admin")
    return keygen_service.get_license_for_key(key)


@keys_router.post("/revoke")
async def revoke_key(request: Request):
    from app.services import keygen_service
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = KeyRevokeRequest(**{k: v for k, v in data.items() if k in KeyRevokeRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    result = keygen_service.revoke_key(req.key)
    log_structured("WARNING", "Key revoked", action="keygen_revoke", key=req.key,
                   initiator=user.get("email"), status="success" if result["ok"] else "failed")
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


@keys_router.post("/delete")
async def delete_key(request: Request):
    """Permanently delete a key (admin only)."""
    from app.services import keygen_service
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = KeyRevokeRequest(**{k: v for k, v in data.items() if k in KeyRevokeRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    result = keygen_service.delete_key(req.key)
    log_structured("WARNING", "Key deleted", action="keygen_delete", key=req.key,
                   initiator=user.get("email"), status="success" if result["ok"] else "failed")
    return JSONResponse(status_code=200 if result["ok"] else 400, content=result)


# ── 2FA & Session Revocation Endpoints ─────────────────────────────────────
class Verify2FARequest(BaseModel):
    temp_token: str
    code: str


class Enable2FARequest(BaseModel):
    secret: str
    code: str


@router.post("/2fa/verify")
async def verify_2fa_endpoint(request: Request):
    """Verify 2FA TOTP code for a pending login."""
    client_ip = get_client_ip(request)
    if auth_rate_limited(client_ip):
        return JSONResponse(status_code=429, content={"ok": False, "error": "Too many attempts", "code": "RATE_LIMITED"})
    data = await read_json_body(request)
    try:
        req = Verify2FARequest(**{k: v for k, v in data.items() if k in Verify2FARequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    ua = request.headers.get("User-Agent", "")
    from app.services import auth
    result = auth.verify_2fa_login(req.temp_token, req.code, ip_address=client_ip, user_agent=ua)
    return JSONResponse(status_code=200 if result.get("ok") else 401, content=result)


@router.post("/2fa/setup")
async def setup_2fa_endpoint(request: Request):
    """Generate a new TOTP secret and provisioning URI for the authenticated user."""
    user = require_auth(request)
    from app.services import auth
    result = auth.setup_user_2fa(user.get("email", ""))
    return JSONResponse(status_code=200 if result.get("ok") else 400, content=result)


@router.post("/2fa/enable")
async def enable_2fa_endpoint(request: Request):
    """Verify code and enable 2FA for the authenticated user."""
    user = require_auth(request)
    data = await read_json_body(request)
    try:
        req = Enable2FARequest(**{k: v for k, v in data.items() if k in Enable2FARequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    from app.services import auth
    result = auth.enable_user_2fa(user.get("email", ""), req.secret, req.code)
    return JSONResponse(status_code=200 if result.get("ok") else 400, content=result)


@router.post("/2fa/disable")
async def disable_2fa_endpoint(request: Request):
    """Disable 2FA for the authenticated user."""
    user = require_auth(request)
    from app.services import auth
    result = auth.disable_user_2fa(user.get("email", ""))
    return JSONResponse(status_code=200 if result.get("ok") else 400, content=result)


@router.post("/sessions/revoke-all")
async def revoke_sessions_endpoint(request: Request):
    """Revoke all active sessions for the authenticated user (or specified user for admin)."""
    current_user = require_auth(request)
    data = await read_json_body(request) or {}
    target_email = str(data.get("email") or current_user.get("email", "")).strip().lower()

    # Non-admins can only revoke their own sessions
    if target_email != str(current_user.get("email", "")).lower() and current_user.get("role") != "admin":
        raise HTTPException(403, detail={"ok": False, "error": "Only admins can revoke other users sessions"})

    from app.services import auth
    count = auth.revoke_all_sessions(target_email)
    try:
        from app.services.audit import record_audit_event
        record_audit_event("sessions_revoked", current_user.get("email", ""),
                           {"target": target_email, "count": count}, status="success")
    except Exception:
        pass
    return {"ok": True, "message": f"Successfully revoked {count} active session(s)", "revoked_count": count}


# ── Audit Trail Endpoints ──────────────────────────────────────────────────
audit_router = APIRouter(prefix="/api/audit", tags=["audit"])


@audit_router.get("/logs")
async def get_audit_logs(request: Request, limit: int = 100, action: Optional[str] = None, user: Optional[str] = None):
    """Get recent cryptographically chained audit events (admin only)."""
    require_auth(request, required_role="admin")
    from app.services.audit import get_audit_events
    events = get_audit_events(limit=min(limit, 500), action=action, user=user)
    return {"ok": True, "count": len(events), "events": events}


@audit_router.get("/verify")
async def verify_audit_trail(request: Request):
    """Verify cryptographic integrity of the entire audit chain (admin only)."""
    require_auth(request, required_role="admin")
    from app.services.audit import verify_audit_chain
    result = verify_audit_chain()
    return JSONResponse(status_code=200 if result.get("ok") else 400, content=result)


# Late import for JSONResponse (avoid top-level circular)
from fastapi.responses import JSONResponse  # noqa: E402

