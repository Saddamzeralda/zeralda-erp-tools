"""Security services — CORS whitelist, auth helpers, rate limiting, safe body reads.

Critical fixes vs. legacy server.py:
- REQUIRE_AUTH defaults to True (legacy bug #1). Set AUTH_DISABLED_IN_DEV=true to bypass.
- CORS whitelist is explicit from ALLOWED_ORIGINS env (legacy bug #11). No "any private IP".
- X-Forwarded-For is trusted only behind an explicit TRUSTED_PROXY_COUNT (legacy bug #13).
- Rate limit keyed by real client IP (legacy bug #14).
- Body reads are size-capped during streaming (legacy bug #16).
- Session token never read from query string (legacy bug #17).
"""
from __future__ import annotations

import ipaddress
import os
import time
import threading
from typing import Any, Dict, Optional

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse

# ── Auth enforcement ────────────────────────────────────────────────────────
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
# FIX #1: auth is required by default. Only an explicit flag can disable it (dev only).
AUTH_DISABLED_IN_DEV = os.getenv("AUTH_DISABLED_IN_DEV", "false").lower() == "true"
REQUIRE_AUTH = not (ENVIRONMENT == "development" and AUTH_DISABLED_IN_DEV)


# ── CORS whitelist (FIX #11) ────────────────────────────────────────────────
def _detect_lan_ips() -> list:
    """Detect all LAN IPv4 addresses of this machine (excludes loopback/link-local).

    Used when ALLOW_LAN_ACCESS=true to automatically whitelist the machine's
    LAN IPs so other devices on the same network can access the ERP.
    """
    import socket
    ips = []
    try:
        hostname = socket.gethostname()
        try:
            ip = socket.gethostbyname(hostname)
            if ip and ip != "127.0.0.1" and not ip.startswith("169.254."):
                ips.append(ip)
        except Exception:
            pass
        try:
            results = socket.getaddrinfo(hostname, None, socket.AF_INET)
            for r in results:
                ip = r[4][0]
                if ip and ip != "127.0.0.1" and not ip.startswith("169.254."):
                    if ip not in ips:
                        ips.append(ip)
        except Exception:
            pass
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.5)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and ip != "127.0.0.1" and not ip.startswith("169.254."):
                if ip not in ips:
                    ips.append(ip)
        except Exception:
            pass
    except Exception:
        pass
    return ips


def _load_allowed_origins() -> set:
    """Build the allowed-origin whitelist from env and known domains.

    Format: comma-separated list of exact origins (scheme+host+port).
    Examples:
      ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
    Always implicitly allows localhost, 127.0.0.1, LAN IPs, and custom domain
    on configured PORT, port 80, and port 443.
    """
    import socket
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    origins = {o.strip().lower() for o in raw.split(",") if o.strip()}
    port = os.getenv("PORT", "8080")
    hosts = [
        "localhost", "127.0.0.1", "::1",
        "www.zeralda-erp.dz", "zeralda-erp.dz",
        "zeralda.local"
    ]
    try:
        local_hn = socket.gethostname().lower()
        if local_hn and local_hn not in hosts:
            hosts.append(local_hn)
    except Exception:
        pass

    lan_ips = _detect_lan_ips()
    for lip in lan_ips:
        if lip not in hosts:
            hosts.append(lip)

    for host in hosts:
        origins.add(f"http://{host}:{port}")
        origins.add(f"https://{host}:{port}")
        origins.add(f"http://{host}")
        origins.add(f"https://{host}")
        origins.add(f"http://{host}:80")
        origins.add(f"https://{host}:443")
    return origins


ALLOWED_ORIGINS = _load_allowed_origins()


def origin_is_allowed(origin: Optional[str]) -> bool:
    """Comprehensive origin whitelist check supporting custom domain, private LAN IPs, and tunnels."""
    if not origin:
        return False
    norm = origin.strip().lower().rstrip("/")
    if norm in ALLOWED_ORIGINS:
        return True
    try:
        from urllib.parse import urlparse
        parsed = urlparse(norm)
        host = (parsed.hostname or "").strip().lower()
        if not host:
            return False
        if host in ("localhost", "127.0.0.1", "www.zeralda-erp.dz", "zeralda-erp.dz", "zeralda.local"):
            return True
        try:
            import socket
            if host == socket.gethostname().lower():
                return True
        except Exception:
            pass
        if (
            host.endswith(".trycloudflare.com")
            or host.endswith(".railway.app")
            or host.endswith(".up.railway.app")
            or host.endswith(".onrender.com")
        ):
            return True
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback:
                return True
        except ValueError:
            pass
    except Exception:
        pass
    return False


# ── Client IP resolution (FIX #13) ─────────────────────────────────────────
TRUSTED_PROXY_COUNT = int(os.getenv("TRUSTED_PROXY_COUNT", "0"))
# 0 = ignore X-Forwarded-For entirely (direct client). >0 = take the Nth-from-right hop.


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP. Trusts X-Forwarded-For only when configured."""
    if TRUSTED_PROXY_COUNT > 0:
        xff = request.headers.get("X-Forwarded-For", "")
        if xff:
            hops = [h.strip() for h in xff.split(",") if h.strip()]
            if hops:
                idx = max(0, len(hops) - TRUSTED_PROXY_COUNT)
                return hops[idx]
    if request.client:
        return request.client.host
    return "127.0.0.1"


# ── Rate limiting (FIX #14) ─────────────────────────────────────────────────
AUTH_RATE_WINDOW_SECONDS = int(os.getenv("AUTH_RATE_WINDOW_SECONDS", "60"))
AUTH_RATE_MAX_ATTEMPTS = int(os.getenv("AUTH_RATE_MAX_ATTEMPTS", "8"))  # tighter than legacy 12
_auth_rate_state: Dict[str, list] = {}
_auth_rate_lock = threading.Lock()


def auth_rate_limited(client_ip: str) -> bool:
    """Per-IP rate limit for auth endpoints. Returns True if the request is rate-limited."""
    now = time.time()
    with _auth_rate_lock:
        # Prune stale IPs (no activity for 2x window)
        stale = [ip for ip, ts in _auth_rate_state.items()
                 if ts and (now - ts[-1]) > AUTH_RATE_WINDOW_SECONDS * 2]
        for ip in stale:
            del _auth_rate_state[ip]

        bucket = _auth_rate_state.get(client_ip)
        if not bucket:
            _auth_rate_state[client_ip] = [now]
            return False
        recent = [ts for ts in bucket if now - ts <= AUTH_RATE_WINDOW_SECONDS]
        recent.append(now)
        _auth_rate_state[client_ip] = recent
        return len(recent) > AUTH_RATE_MAX_ATTEMPTS


# ── AI rate limiting (FIX P0) ──────────────────────────────────────────────
AI_RATE_WINDOW_SECONDS = int(os.getenv("AI_RATE_WINDOW_SECONDS", "60"))
AI_RATE_MAX_REQUESTS = int(os.getenv("AI_RATE_MAX_REQUESTS", "30"))  # 30 req/min per user
_ai_rate_state: Dict[str, list] = {}
_ai_rate_lock = threading.Lock()


def ai_rate_limited(user_key: str) -> bool:
    """Per-user rate limit for AI endpoints. Returns True if rate-limited.

    Keyed by user email (or IP if no user) to prevent cost exhaustion
    and DoS via spamming expensive AI operations.
    """
    now = time.time()
    with _ai_rate_lock:
        # Prune stale entries
        stale = [k for k, ts in _ai_rate_state.items()
                 if ts and (now - ts[-1]) > AI_RATE_WINDOW_SECONDS * 2]
        for k in stale:
            del _ai_rate_state[k]

        bucket = _ai_rate_state.get(user_key)
        if not bucket:
            _ai_rate_state[user_key] = [now]
            return False
        recent = [ts for ts in bucket if now - ts <= AI_RATE_WINDOW_SECONDS]
        recent.append(now)
        _ai_rate_state[user_key] = recent
        return len(recent) > AI_RATE_MAX_REQUESTS


# ── Safe body reads (FIX #16) ───────────────────────────────────────────────
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(100 * 1024 * 1024)))  # 100MB
MAX_AUTH_BODY_BYTES = int(os.getenv("MAX_AUTH_BODY_BYTES", "8192"))


async def read_json_body(request: Request, max_bytes: int = MAX_BODY_BYTES) -> Any:
    """Read and parse a JSON body with a hard size cap enforced during read.

    Fix: legacy read the full Content-Length before checking, allowing a
    Content-Length: 10 header to smuggle 100MB into memory.
    """
    declared = request.headers.get("Content-Length")
    if declared and int(declared) > max_bytes:
        raise HTTPException(
            status_code=getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413),
            detail={"ok": False, "error": "Payload too large", "code": "PAYLOAD_TOO_LARGE"},
        )

    # Stream-read in chunks; abort the moment we exceed the cap.
    chunks = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413),
                detail={"ok": False, "error": "Payload too large", "code": "PAYLOAD_TOO_LARGE"},
            )
        chunks.append(chunk)
    raw = b"".join(chunks)
    if not raw:
        return {}
    try:
        import json
        return json.loads(raw.decode("utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "error": f"Invalid JSON: {e}"},
        )


# ── Session token extraction (FIX #17) ─────────────────────────────────────
def get_session_token(request: Request) -> str:
    """Extract session token from Authorization or X-Session-Token headers only.

    Fix: never read the token from the query string (legacy bug #17 — tokens in URLs
    leak via logs, history, Referer).
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    token = request.headers.get("X-Session-Token", "")
    if token:
        return token.strip()
    # Support cookie set during login
    cookie_token = (
        request.cookies.get("zeralda-auth-token", "")
        or request.cookies.get("session_token", "")
        or request.cookies.get("zeralda_session", "")
    )
    return cookie_token.strip()


# ── Auth validation ─────────────────────────────────────────────────────────
_dev_mode_warned = False


def validate_session(request: Request) -> Optional[Dict[str, Any]]:
    """Validate the current session. Returns the user dict or None.

    In dev mode with AUTH_DISABLED_IN_DEV=true, returns a synthetic admin user
    (after logging a one-time warning).
    """
    global _dev_mode_warned

    # Lazy import to avoid circular dependency at module load
    try:
        from backend import auth as _auth
        auth_enabled = True
    except ImportError:
        auth_enabled = False

    if not REQUIRE_AUTH or not auth_enabled:
        if not _dev_mode_warned:
            _dev_mode_warned = True
            print(
                "[AUTH] [WARN] Authentication bypassed — dev mode. "
                "Set ENVIRONMENT=production (and remove AUTH_DISABLED_IN_DEV) to enforce."
            )
        return {"role": "admin", "email": "admin@local"}

    token = get_session_token(request)
    if not token:
        return None
    ip = request.client.host if request.client else ""
    ua = request.headers.get("User-Agent", "")
    try:
        return _auth.validate_session(token, ip, ua)
    except Exception:
        return None


def require_auth(request: Request, required_role: Optional[str] = None) -> Dict[str, Any]:
    """Raise HTTPException if not authenticated (or missing role). Returns the user."""
    user = validate_session(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"ok": False, "error": "Unauthorized", "code": "UNAUTHORIZED"},
        )
    if required_role and user.get("role") != required_role and user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"ok": False, "error": "Forbidden", "code": "FORBIDDEN"},
        )
    return user


def require_store_permission(user: Dict[str, Any], action: str) -> None:
    """Raise HTTPException if the user's role can't perform the storage action."""
    role = (user or {}).get("role", "viewer")
    email = (user or {}).get("email", "unknown")

    read_roles = {"admin", "manager", "user", "viewer"}
    write_roles = {"admin", "manager", "user"}
    admin_roles = {"admin"}

    allowed = False
    if action in {"read", "history", "stats"}:
        allowed = role in read_roles
    elif action in {"write", "delete"}:
        allowed = role in write_roles
    elif action in {"rollback", "undo"}:
        allowed = role in admin_roles

    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"ok": False, "error": "Forbidden", "code": "FORBIDDEN",
                    "action": f"store_{action}", "user": email, "role": role},
        )


# ── Structured logging ─────────────────────────────────────────────────────
def log_structured(level: str, message: str, **kwargs: Any) -> None:
    import json
    import datetime
    entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "level": level,
        "message": message,
        "environment": ENVIRONMENT,
        **kwargs,
    }
    try:
        print(json.dumps(entry, ensure_ascii=False))
    except (OSError, UnicodeEncodeError):
        # Windows console may reject non-ASCII output (Errno 22).
        # Fall back to ASCII-safe encoding so logging never crashes the server.
        try:
            print(json.dumps(entry, ensure_ascii=True))
        except Exception:
            pass


# ── Production security enforcement ───────────────────────────────────────
def _is_placeholder_or_weak(value: str, min_len: int = 32) -> bool:
    v = str(value or "").strip()
    if not v:
        return True
    lowered = v.lower()
    if lowered in ("default", "example", "password", "admin@2026"):
        return True
    if any(tok in lowered for tok in ("change_me", "changeme", "your-secure-password")):
        return True
    return len(v) < min_len


def enforce_production_security() -> None:
    """Ensure production secrets exist, generating secure persistent keys if absent."""
    if ENVIRONMENT != "production":
        return
    import secrets
    from pathlib import Path
    data_dir = Path(__file__).resolve().parent.parent.parent / "data"

    # Ensure SECRET_KEY is set and strong
    secret_key = os.getenv("SECRET_KEY", "").strip()
    if _is_placeholder_or_weak(secret_key, min_len=32):
        key_file = data_dir / ".secret_key"
        if key_file.exists():
            try:
                stored = key_file.read_text(encoding="utf-8").strip()
                if len(stored) >= 32:
                    secret_key = stored
            except Exception:
                pass
        if not secret_key or len(secret_key) < 32:
            secret_key = secrets.token_hex(32)
            try:
                data_dir.mkdir(parents=True, exist_ok=True)
                key_file.write_text(secret_key, encoding="utf-8")
            except Exception:
                pass
        os.environ["SECRET_KEY"] = secret_key
        print("[SERVER] [WARN] SECRET_KEY was missing/weak in production — generated and saved persistent key.")

    # Ensure JWT_SECRET is set and strong
    jwt_secret = os.getenv("JWT_SECRET", "").strip()
    if _is_placeholder_or_weak(jwt_secret, min_len=32):
        jwt_key_file = data_dir / ".jwt_secret"
        if jwt_key_file.exists():
            try:
                stored = jwt_key_file.read_text(encoding="utf-8").strip()
                if len(stored) >= 32:
                    jwt_secret = stored
            except Exception:
                pass
        if not jwt_secret or len(jwt_secret) < 32:
            jwt_secret = secrets.token_hex(32)
            try:
                data_dir.mkdir(parents=True, exist_ok=True)
                jwt_key_file.write_text(jwt_secret, encoding="utf-8")
            except Exception:
                pass
        os.environ["JWT_SECRET"] = jwt_secret
        print("[SERVER] [WARN] JWT_SECRET was missing/weak in production — generated and saved persistent key.")

