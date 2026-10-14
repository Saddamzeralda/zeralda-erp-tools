"""Misc endpoints — ping, client presence, factory reset, shutdown, export download, config.

Fixes vs. legacy server.py:
- /api/server/shutdown no longer kills ALL python.exe processes (legacy bug #22 — too destructive).
  It only stops this server process gracefully.
- /api/admin/factory-reset still blocked in production (kept).
- /api/export/download requires auth (legacy allowed in dev).
"""
from __future__ import annotations

import base64
import os
import re
import sys
import time
import threading
from typing import Any, Dict

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.services import storage
from app.services.security import (
    ENVIRONMENT,
    log_structured,
    read_json_body,
    require_auth,
    validate_session,
)

router = APIRouter(prefix="/api", tags=["misc"])


# ── Client presence (in-memory) ───────────────────────────────────────────
_client_presence: Dict[str, Dict[str, Any]] = {}
_client_presence_lock = threading.Lock()
_client_seen_once = False
_last_client_activity_ts = 0.0
CLIENT_SESSION_TTL_SECONDS = int(os.getenv("CLIENT_SESSION_TTL_SECONDS", "45"))
AUTO_SHUTDOWN_ON_CLIENT_CLOSE = os.getenv("AUTO_SHUTDOWN_ON_CLIENT_CLOSE", "false").lower() == "true"
AUTO_SHUTDOWN_GRACE_SECONDS = int(os.getenv("AUTO_SHUTDOWN_GRACE_SECONDS", "300"))
_SERVER_START_TIME = time.time()


def touch_client_presence(session_id: str, meta: Any = None) -> None:
    global _client_seen_once, _last_client_activity_ts
    sid = str(session_id or "").strip()
    if not sid:
        return
    now = time.time()
    with _client_presence_lock:
        _client_presence[sid] = {"last_seen": now, "meta": meta or {}}
        _client_seen_once = True
        _last_client_activity_ts = now


def remove_client_presence(session_id: str) -> None:
    global _last_client_activity_ts
    sid = str(session_id or "").strip()
    if not sid:
        return
    now = time.time()
    with _client_presence_lock:
        if sid in _client_presence:
            _client_presence.pop(sid, None)
            _last_client_activity_ts = now


def prune_client_presence(now_ts: float = None) -> int:
    global _last_client_activity_ts
    now = now_ts if isinstance(now_ts, (int, float)) else time.time()
    ttl = max(5, CLIENT_SESSION_TTL_SECONDS)
    with _client_presence_lock:
        stale = [sid for sid, item in _client_presence.items()
                 if (now - float(item.get("last_seen", 0))) > ttl]
        if stale:
            for sid in stale:
                _client_presence.pop(sid, None)
            _last_client_activity_ts = now
        return len(_client_presence)


# ── /api/ping ─────────────────────────────────────────────────────────────
@router.get("/ping")
async def ping():
    uptime_s = int(time.time() - _SERVER_START_TIME)
    try:
        from backend import auth as _auth
        auth_enabled = True
    except ImportError:
        auth_enabled = False
    return {
        "ok": True, "server": "zeralda-erp", "version": "3.0",
        "auth_enabled": auth_enabled,
        "https_enabled": os.getenv("USE_HTTPS", "false").lower() == "true",
        "db_connected": storage.DB_CONNECTED,
        "environment": ENVIRONMENT,
        "python_version": sys.version.split()[0],
        "uptime_seconds": uptime_s,
        "uptime_human": f"{uptime_s//3600}h {(uptime_s%3600)//60}m {uptime_s%60}s",
    }


# ── /api/config/keygen-status ─────────────────────────────────────────────
@router.get("/config/keygen-status")
async def keygen_status():
    try:
        from backend import keygen_service  # noqa: F401
        keygen_enabled = True
    except ImportError:
        keygen_enabled = False
    try:
        from backend import auth  # noqa: F401
        auth_enabled = True
    except ImportError:
        auth_enabled = False
    return {"ok": True, "keygen_enabled": keygen_enabled, "auth_enabled": auth_enabled,
            "message": "KEYGEN system enabled" if keygen_enabled else "KEYGEN system disabled"}


# ── Client presence endpoints ────────────────────────────────────────────
@router.api_route("/client/alive", methods=["GET", "POST"])
async def client_alive(request: Request):
    payload = await read_json_body(request) if request.method == "POST" else {}
    sid = payload.get("sessionId") or request.headers.get("X-Client-Session", "")
    if not sid:
        from app.services.security import get_client_ip
        sid = f"{get_client_ip(request)}::{request.headers.get('User-Agent', '')[:40]}"
    touch_client_presence(sid, {
        "path": payload.get("page") or request.url.path,
        "ua": request.headers.get("User-Agent", "")[:120],
    })
    active = prune_client_presence()
    return {"ok": True, "active_clients": active}


@router.api_route("/client/bye", methods=["GET", "POST"])
async def client_bye(request: Request):
    payload = await read_json_body(request) if request.method == "POST" else {}
    sid = payload.get("sessionId") or request.headers.get("X-Client-Session", "")
    remove_client_presence(sid)
    active = prune_client_presence()
    return {"ok": True, "active_clients": active}


# ── Factory reset (admin, dev/staging only) ───────────────────────────────
class FactoryResetRequest(BaseModel):
    confirmation: str = ""


@router.post("/admin/factory-reset")
async def factory_reset(request: Request):
    if ENVIRONMENT == "production":
        log_structured("ERROR", "Factory reset attempted in production",
                       action="factory_reset", environment="production", status="blocked")
        raise HTTPException(403, detail={"ok": False,
                        "error": "Factory reset is disabled in production environment",
                        "code": "FORBIDDEN_IN_PRODUCTION"})
    admin_user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = FactoryResetRequest(**{k: v for k, v in data.items() if k in FactoryResetRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    if req.confirmation.strip().upper() != "RESET":
        log_structured("WARNING", "Factory reset attempted with invalid confirmation",
                       action="factory_reset", initiator=admin_user.get("email"), status="invalid_confirmation")
        raise HTTPException(400, detail={"ok": False,
                        "error": "Confirmation token mismatch. Send confirmation=RESET"})
    with storage._lock:
        storage.factory_reset_all_data()
    log_structured("CRITICAL", "Factory reset executed", action="factory_reset",
                   initiator=admin_user.get("email"), environment=ENVIRONMENT, status="success")
    return {"ok": True, "message": "Factory reset completed"}


# ── Server shutdown (FIX #22: graceful, not killing all python.exe) ───────
@router.post("/server/shutdown")
async def server_shutdown(request: Request):
    user = require_auth(request, required_role="admin")
    log_structured("WARN", "Graceful shutdown requested", action="server_shutdown",
                   initiator=user.get("email"))

    def _graceful_exit():
        import time as _t
        _t.sleep(0.8)
        try:
            storage.flush_pending()
        except Exception:
            pass
        try:
            from backend import auth
            auth.flush_sessions()
        except Exception:
            pass
        # FIX #22: only exit this process — do NOT taskkill python.exe / postgres.exe
        os._exit(0)

    threading.Thread(target=_graceful_exit, daemon=True).start()
    return {"ok": True, "message": "Server is shutting down..."}


# ── Export download (FIX: requires auth always) ───────────────────────────
class ExportDownloadRequest(BaseModel):
    fileName: str = "export.txt"
    mimeType: str = "application/octet-stream"
    contentBase64: str = ""


@router.post("/export/download")
async def export_download(request: Request):
    # FIX: always require auth (legacy allowed in dev)
    user = require_auth(request)
    data = await read_json_body(request)
    try:
        req = ExportDownloadRequest(**{k: v for k, v in data.items() if k in ExportDownloadRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    safe_name = re.sub(r'[/\\:*?"<>|]', "_", os.path.basename(req.fileName)) or "export.txt"
    try:
        raw_bytes = base64.b64decode(req.contentBase64)
    except Exception:
        raise HTTPException(400, detail={"ok": False, "error": "Invalid base64 content"})
    return Response(
        content=raw_bytes, media_type=req.mimeType,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"', "Cache-Control": "no-store"},
    )


# ── Network & Remote Hosting Info ──────────────────────────────────────────
@router.get("/system/network-info")
async def get_network_info(request: Request):
    """Return local IP, LAN URLs, and active remote tunnel URL for network hosting."""
    import socket
    import json
    primary_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    all_ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and ip not in all_ips:
                all_ips.append(ip)
    except Exception:
        pass
    if primary_ip != "127.0.0.1" and primary_ip not in all_ips:
        all_ips.insert(0, primary_ip)

    port = int(os.getenv("PORT", "8080"))

    # Production URL reference
    official_production_url = "https://zeralda-erp-employees-main-production.up.railway.app"

    # 1. Detect if running inside cloud environment (Railway, etc.)
    cloud_env_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN") or os.getenv("RAILWAY_STATIC_URL") or os.getenv("PUBLIC_URL")
    cloud_url = None
    if cloud_env_domain:
        if not cloud_env_domain.startswith("http"):
            cloud_url = f"https://{cloud_env_domain}"
        else:
            cloud_url = cloud_env_domain

    # 2. Check incoming request host if public
    req_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip().lower()
    if req_host and not any(req_host.startswith(prefix) for prefix in ("localhost", "127.", "0.0.0.0", "192.168.", "10.")):
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").lower()
        cloud_url = f"{proto}://{req_host}"

    # 3. Check if a local active remote tunnel info file exists
    active_tunnel_url = None
    tunnel_file = storage.DATA_DIR / "remote_access_info.json"
    if tunnel_file.exists():
        try:
            with open(tunnel_file, "r", encoding="utf-8") as f:
                tinfo = json.load(f)
                t_pid = tinfo.get("pid")
                t_url = tinfo.get("public_url")
                # Validate if PID is actually running
                is_running = False
                if t_pid:
                    try:
                        import psutil
                        is_running = psutil.pid_exists(t_pid)
                    except Exception:
                        try:
                            os.kill(t_pid, 0)
                            is_running = True
                        except Exception:
                            is_running = False
                if is_running and t_url and not t_url.startswith("https://athletic-concepts"):
                    active_tunnel_url = t_url
                else:
                    # Stale tunnel - remove it
                    try:
                        tunnel_file.unlink(missing_ok=True)
                    except Exception:
                        pass
        except Exception:
            pass

    # Remote URL precedence: active dynamic tunnel > cloud URL > official production URL
    remote_url = active_tunnel_url or cloud_url or official_production_url

    hostname = socket.gethostname()
    return {
        "ok": True,
        "hostname": hostname,
        "primaryIp": primary_ip,
        "allIps": all_ips,
        "port": port,
        "localUrl": f"http://localhost:{port}",
        "lanUrl": f"http://{primary_ip}:{port}",
        "directLanUrl": f"http://{primary_ip}/",
        "hostUrl": f"http://{hostname}:{port}",
        "directHostUrl": f"http://{hostname}/",
        "mdnsUrl": f"http://zeralda.local:{port}",
        "directMdnsUrl": "http://zeralda.local/",
        "brandUrl": "http://www.zeralda-erp.dz/",
        "remoteUrl": remote_url,
        "cloudUrl": cloud_url or official_production_url,
        "productionUrl": official_production_url,
        "tunnelUrl": active_tunnel_url,
        "isHosting": True,
    }


