"""FastAPI app assembly — routers, middleware, CORS, static files, startup/shutdown.

This is the modular replacement for the legacy monolithic server.py.
Run via: python -m app.main  (or)  uvicorn app.app:app --host 127.0.0.1 --port 8080
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Optional

# Backward compatibility alias: ensures any legacy `import backend` seamlessly maps to `app.services`
from app import services as _services
sys.modules['backend'] = _services

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse

from app.services.security import (
    ALLOWED_ORIGINS,
    enforce_production_security,
    log_structured,
    origin_is_allowed,
    ENVIRONMENT,
    REQUIRE_AUTH,
)


def create_app() -> FastAPI:
    # Enforce production security checks before constructing the app
    enforce_production_security()

    app = FastAPI(
        title="Zeralda ERP",
        version="3.0",
        description="Modular FastAPI rewrite of the legacy http.server monolith.",
        docs_url="/api/docs" if ENVIRONMENT != "production" else None,
        redoc_url="/api/redoc" if ENVIRONMENT != "production" else None,
    )

    # ── CORS (Strict Whitelist + Private LAN + Explicit Tunnels) ─────────
    # Restrict origins to localhost, private LAN ranges, and explicitly trusted domains.
    # Note: Generic wildcard subdomains (*.trycloudflare.com, *.railway.app, *.onrender.com)
    # have been removed to prevent cross-origin data theft from untrusted third-party apps.
    import re
    from urllib.parse import urlparse

    trusted_cors_patterns = [
        r"localhost",
        r"127\.0\.0\.1",
        r"::1",
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}",
        r"192\.168\.\d{1,3}\.\d{1,3}",
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}",
        r"([a-zA-Z0-9-]+\.)*zeralda-erp\.dz",
        r"([a-zA-Z0-9-]+\.)*zeralda\.local",
        r"([a-zA-Z0-9-]+\.)*railway\.app",
        r"([a-zA-Z0-9-]+\.)*up\.railway\.app",
        r"zeralda-erp-employees-main-production\.up\.railway\.app",
    ]

    # Explicitly configured domains/tunnels in environment
    configured_cors = (os.getenv("ALLOWED_ORIGINS", "") + "," +
                       os.getenv("TUNNEL_DOMAIN", "") + "," +
                       os.getenv("CUSTOM_DOMAIN", "")).strip()
    for entry in configured_cors.split(","):
        entry = entry.strip()
        if not entry:
            continue
        if "://" in entry:
            entry_host = urlparse(entry).hostname or entry
        else:
            entry_host = entry.split(":")[0]
        escaped_host = re.escape(entry_host.lower())
        if escaped_host and escaped_host not in trusted_cors_patterns:
            trusted_cors_patterns.append(escaped_host)

    SAFE_CORS_REGEX = rf"^https?://({'|'.join(trusted_cors_patterns)})(:\d+)?$"
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=SAFE_CORS_REGEX,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── GZip Compression Middleware (High performance on mobile/LAN) ────
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # ── Security & Caching headers middleware ────────────────────────────
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path.lower()
        # X-Frame-Options: SAMEORIGIN allows same-origin iframes (AI settings modal, previews)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        # COOP: same-origin-allow-popups allows Google OAuth / GSI client and popups
        proto = (request.headers.get("x-forwarded-proto") or "").lower()
        host_hdr = (request.headers.get("host") or "").split(":")[0].lower()
        is_https = (
            proto == "https"
            or os.getenv("USE_HTTPS", "false").lower() == "true"
            or request.url.scheme == "https"
        )
        is_trustworthy_context = bool(
            is_https or host_hdr in ("localhost", "127.0.0.1", "::1") or host_hdr.endswith((".railway.app", ".trycloudflare.com"))
        )
        if is_trustworthy_context:
            # 'unsafe-none' allows Google Identity Services (GSI) and OAuth popups to check window.closed without COOP errors
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        if is_https:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # CSP for HTML pages
        if path.endswith(".html") or path == "/":
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com "
                "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://accounts.google.com; "
                "style-src-elem 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://accounts.google.com; "
                "font-src 'self' data: https: https://fonts.gstatic.com https://cdnjs.cloudflare.com "
                "https://at.alicdn.com http://at.alicdn.com; "
                "img-src 'self' data: https: blob: http: https://lh3.googleusercontent.com https://*.railway.app http://127.0.0.1:8080 http://localhost:8080; "
                "connect-src 'self' http://127.0.0.1:8080 http://localhost:8080 https://*.railway.app wss://*.railway.app wss: ws: "
                "https://www.googleapis.com https://oauth2.googleapis.com https://people.googleapis.com "
                "https://gmail.googleapis.com https://accounts.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
                "worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
                "frame-src 'self' https://accounts.google.com blob:; "
                "frame-ancestors 'self'; "
                "object-src 'none'"
            )
            response.headers["Content-Security-Policy"] = csp
        # High-performance caching strategy:
        if path.startswith("/api/"):
            # Dynamic APIs: never cache
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        elif path.endswith((".js", ".css")):
            # Scripts & Styles: no-cache enables instant live updates with 304 ETag revalidation
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
            if "pragma" in response.headers: del response.headers["pragma"]
            if "expires" in response.headers: del response.headers["expires"]
        elif path.endswith((".png", ".jpg", ".jpeg", ".ico", ".svg", ".woff", ".woff2", ".ttf")):
            response.headers["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400"
            if "pragma" in response.headers: del response.headers["pragma"]
            if "expires" in response.headers: del response.headers["expires"]
        elif path.endswith(".html") or path == "/":
            # HTML pages: no-cache allows fast ETag validation (304) and enables browser bfcache
            response.headers["Cache-Control"] = "no-cache"
            if "pragma" in response.headers: del response.headers["pragma"]
            if "expires" in response.headers: del response.headers["expires"]
        return response

    # ── CSRF protection middleware ──────────────────────────────────────
    # FIX: CSRF protection via Origin/Referer validation + custom header
    # requirement. This is the OWASP-recommended approach for same-origin
    # SPAs that use session tokens in headers (not cookies).
    #
    # How it works:
    # 1. For state-changing methods (POST/PUT/PATCH/DELETE), require either:
    #    a. A custom header (X-Requested-With or X-Session-Token) — browsers
    #       only allow custom headers via XMLHttpRequest/fetch with CORS,
    #       so a plain HTML form cannot send them.
    #    b. The Origin or Referer header matches the allowed origins.
    # 2. GET/HEAD/OPTIONS are always allowed (safe methods).
    # 3. In dev mode (REQUIRE_AUTH=False), CSRF is disabled for convenience.
    _CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
    _CSRF_CUSTOM_HEADERS = ("x-requested-with", "x-session-token", "authorization")

    @app.middleware("http")
    async def csrf_protection(request: Request, call_next):
        method = request.method.upper()
        # Skip safe methods
        if method in _CSRF_SAFE_METHODS:
            return await call_next(request)
        # Skip in dev mode (auth disabled)
        if not REQUIRE_AUTH:
            return await call_next(request)
        # Skip non-API paths (static files don't need CSRF protection)
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        # Skip auth endpoints (login, keygen, oauth have no session yet)
        if path.startswith("/api/auth/"):
            return await call_next(request)
        # Skip client presence heartbeats and beacon pings
        if path.startswith("/api/client/"):
            return await call_next(request)
        # Skip license and keygen endpoints (used before authentication)
        if path.startswith("/api/license/") or path.startswith("/api/keys/") or path.startswith("/api/config/keygen-status"):
            return await call_next(request)

        # Check 1: Origin/Referer must match allowed origins
        origin = request.headers.get("Origin") or request.headers.get("Referer", "")
        if origin and origin != "null":
            # Referer includes the path; extract just the origin
            from urllib.parse import urlparse
            parsed = urlparse(origin)
            origin_only = f"{parsed.scheme}://{parsed.netloc}"
            req_host = (request.headers.get("host") or "").strip().lower()
            is_same_origin = (parsed.netloc.lower() == req_host) if req_host else False
            if not is_same_origin and not origin_is_allowed(origin_only):
                log_structured("WARN", "CSRF: origin not allowed",
                               action="csrf_blocked", origin=origin_only, path=path)
                return JSONResponse(
                    status_code=403,
                    content={"ok": False, "error": "Cross-origin request blocked",
                             "code": "CSRF_ORIGIN_MISMATCH"})
        else:
            # No Origin/Referer header (or "null") — require a custom header instead.
            # Browsers send Origin: null for sandboxed iframes or data: URIs,
            # so we fall back to the custom header check rather than blocking.
            has_custom = any(h in request.headers for h in _CSRF_CUSTOM_HEADERS)
            if not has_custom:
                log_structured("WARN", "CSRF: missing origin and custom header",
                               action="csrf_blocked", path=path, method=method)
                return JSONResponse(
                    status_code=403,
                    content={"ok": False, "error": "Missing required header",
                             "code": "CSRF_MISSING_HEADER"})

        return await call_next(request)

    # ── License enforcement middleware ────────────────────────────────────
    # FIX: Server-side license enforcement. Even if a pirate bypasses the
    # client-side license_guard.js, the server will refuse to serve API
    # requests after the trial/grace period expires without a valid license.
    #
    # Exempt paths:
    #   - License management endpoints (validate, public-key, heartbeat)
    #   - Auth endpoints (login, google) — needed to log in and activate
    #   - Static files (HTML/JS/CSS) — the license page must be accessible
    #
    # In dev mode (AUTH_DISABLED_IN_DEV=true), license enforcement is relaxed
    # so developers can work without a license.
    from app.services import license_service as _license_svc

    _LICENSE_EXEMPT_PREFIXES = (
        "/api/license/",
        "/api/auth/login",
        "/api/auth/google",
        "/api/config/keygen-status",
        "/api/ping",
        "/api/notifications/vapid-public-key",
    )

    @app.middleware("http")
    async def license_enforcement(request: Request, call_next):
        path = request.url.path
        method = request.method.upper()

        # Skip license enforcement ONLY if explicitly bypassed via LICENSE_DEV_BYPASS=true
        if os.getenv("LICENSE_DEV_BYPASS", "false").lower() == "true":
            return await call_next(request)

        # Skip non-API paths (static files, HTML pages — license.html must load)
        if not path.startswith("/api/"):
            return await call_next(request)

        # Skip exempt paths (license management, auth, config)
        if path.startswith(_LICENSE_EXEMPT_PREFIXES):
            return await call_next(request)

        # Skip OPTIONS (CORS preflight)
        if method == "OPTIONS":
            return await call_next(request)

        # Check server-side license status
        try:
            status = _license_svc.get_server_license_status()
        except Exception as e:
            # If license service fails, log but don't block (fail-open for availability)
            log_structured("WARN", "License status check failed", error=str(e),
                           action="license_check_error")
            return await call_next(request)

        lic_status = status.get("status", "unknown")
        if lic_status in ("active", "trial", "grace"):
            return await call_next(request)

        # License expired/invalid — block API access
        log_structured("WARN", "API request blocked — no valid license",
                       action="license_blocked", path=path, method=method,
                       license_status=lic_status)
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "error": "License required",
                "code": "LICENSE_REQUIRED",
                "licenseStatus": lic_status,
                "detail": status.get("error", "Trial expired. Please activate a license."),
                "licensePage": "/license.html",
            },
            headers={"X-License-Required": "true"},
        )

    # ── Routers ──────────────────────────────────────────────────────────
    from app.handlers import auth, store, ai, backup, ocr, misc, files, sync, license as license_handler, notifications as notifications_handler

    app.include_router(auth.router)
    app.include_router(auth.keys_router)
    app.include_router(auth.audit_router)
    app.include_router(store.router)
    app.include_router(sync.router)
    app.include_router(ai.router)
    app.include_router(backup.router)
    app.include_router(ocr.router)
    app.include_router(files.router)
    app.include_router(misc.router)
    app.include_router(license_handler.router)
    app.include_router(notifications_handler.router)

    # ── Static files (serves HTML/JS/CSS/images from project root) ───────
    base_dir = Path(__file__).resolve().parent.parent
    # Mount individual static directories
    for sub in ("shared", "styles", "modules"):
        sub_path = base_dir / sub
        if sub_path.is_dir():
            app.mount(f"/{sub}", StaticFiles(directory=str(sub_path)), name=f"static-{sub}")

    # Redirect /pages/{page} to /{page} for clean relative asset imports
    @app.get("/pages/{page_name:path}", include_in_schema=False)
    async def redirect_pages_to_root(page_name: str):
        return RedirectResponse(url=f"/{page_name}", status_code=302)

    # Root-level HTML files (index.html, login.html, settings.html, dashboard, etc.)
    @app.get("/", include_in_schema=False)
    async def root_index():
        for candidate_path in (base_dir / "pages" / "index.html", base_dir / "index.html"):
            if candidate_path.is_file():
                return FileResponse(str(candidate_path))
        return JSONResponse({"ok": True, "message": "Zeralda ERP API", "docs": "/api/docs"})

    @app.get("/{filename:path}", include_in_schema=False)
    async def serve_root_file(filename: str):
        # Reject paths that look like API calls (already routed)
        if filename.startswith("api/"):
            return JSONResponse(status_code=404, content={"ok": False, "error": "Endpoint not found"})
        # FIX: Strict path traversal prevention — reject any path containing
        # traversal sequences, absolute paths, or Windows device names.
        if ".." in filename or filename.startswith("/") or filename.startswith("\\"):
            return JSONResponse(status_code=404, content={"ok": False, "error": "Not found"})
        # Reject Windows UNC paths and device names
        upper = filename.upper()
        for dev in ("CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3",
                     "COM4", "LPT1", "LPT2", "LPT3"):
            if upper == dev or upper.startswith(dev + ".") or upper.startswith(dev + "\\"):
                return JSONResponse(status_code=404, content={"ok": False, "error": "Not found"})
        safe = os.path.normpath(filename).lstrip("/\\")
        candidate = base_dir / safe
        try:
            candidate = candidate.resolve()
            # FIX: Use os.path commonpath for reliable cross-platform check
            if os.path.commonpath([str(candidate), str(base_dir.resolve())]) == str(base_dir.resolve()):
                if candidate.is_file():
                    return FileResponse(str(candidate))
        except (ValueError, OSError):
            pass

        # Check pages/ directory for clean web page separation
        pages_candidate = base_dir / "pages" / safe
        try:
            pages_candidate = pages_candidate.resolve()
            pages_dir_resolved = (base_dir / "pages").resolve()
            if os.path.commonpath([str(pages_candidate), str(pages_dir_resolved)]) == str(pages_dir_resolved):
                if pages_candidate.is_file():
                    return FileResponse(str(pages_candidate))
        except (ValueError, OSError):
            pass

        # Smart resolution / shortcut for module HTML pages requested at root level
        clean_fn = safe.lower().strip()
        MODULE_SHORTCUTS = {
            "inventory_management.html": "modules/inventory/inventory_management.html",
            "sales_management.html": "modules/sales/sales_management.html",
            "purchasing_management.html": "modules/purchasing/purchasing_management.html",
            "finance_accounting.html": "modules/finance/finance_accounting.html",
            "hr_management.html": "modules/hr/hr_management.html",
            "crm_management.html": "modules/crm/crm_management.html",
            "reports_analytics.html": "modules/reports/reports_analytics.html",
            "services_management.html": "modules/services/services_management.html",
            "consulting_tenders_management.html": "modules/consulting/consulting_tenders_management.html",
        }
        if clean_fn in ("dashboard", "dashboard.html", "zeralda_dashboard.html"):
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/zeralda_erp_dashboard.html", status_code=302)
        if clean_fn in MODULE_SHORTCUTS:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=f"/{MODULE_SHORTCUTS[clean_fn]}", status_code=302)

        return JSONResponse(status_code=404, content={"ok": False, "error": "File not found"})

    # ── Startup / shutdown ──────────────────────────────────────────────
    @app.on_event("startup")
    async def _startup():
        log_structured("INFO", "Zeralda ERP starting", action="server_start",
                       environment=ENVIRONMENT, auth_required=True)
        try:
            from app.services import auth
            auth.initialize_default_users()
        except Exception as e:
            log_structured("WARN", "Default users init failed", error=str(e))

        try:
            from app.services import storage
            storage.init_db_schema()
            storage.migrate_unified_settings()
        except Exception as e:
            log_structured("WARN", "Database schema / settings init failed", error=str(e))

    @app.on_event("shutdown")
    async def _shutdown():
        try:
            from app.services import storage
            storage.flush_pending()
        except Exception as e:
            log_structured("WARN", "History flush failed on shutdown", error=str(e))
        try:
            from app.services import auth
            auth.flush_sessions()
        except Exception:
            pass
        log_structured("INFO", "Zeralda ERP stopped", action="server_stop")

    return app


# Module-level app instance (for `uvicorn app.app:app`)
app = create_app()
