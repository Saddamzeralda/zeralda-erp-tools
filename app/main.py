"""Server entry point — runs uvicorn with the FastAPI app.

Replaces the bottom of legacy server.py (run_server + watchdogs).
Run via:  python -m app.main
"""
from __future__ import annotations

import atexit
import os
import socket
import ssl
import subprocess
import sys
import threading
import time
from pathlib import Path

# ── Windows UTF-8 fix: must run before ANY print/import that may log Unicode ──
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# Ensure project root is on sys.path
_BASE = Path(__file__).resolve().parent.parent
if str(_BASE) not in sys.path:
    sys.path.insert(0, str(_BASE))

# Register backward compatibility alias for backend
try:
    from app import services as _services
    sys.modules['backend'] = _services
except Exception:
    pass

# Load .env file — required for DEFAULT_ADMIN_*, API keys, SECRET_KEY, etc.
# server.py has its own _load_dotenv(); app/main.py must do the same.
try:
    from dotenv import load_dotenv
    load_dotenv(_BASE / ".env")
except ImportError:
    pass

import uvicorn

from app.services.security import ENVIRONMENT, log_structured


# ── Config ─────────────────────────────────────────────────────────────────
PORT = int(os.getenv("PORT", "8080"))
SERVER_HOST = "0.0.0.0"
USE_HTTPS = os.getenv("USE_HTTPS", "false").lower() == "true"
LAUNCH_MODE = os.getenv("LAUNCH_MODE", "manual")
AUTO_SHUTDOWN_ON_CLIENT_CLOSE = os.getenv("AUTO_SHUTDOWN_ON_CLIENT_CLOSE", "false").lower() == "true"
AUTO_SHUTDOWN_GRACE_SECONDS = int(os.getenv("AUTO_SHUTDOWN_GRACE_SECONDS", "300"))
DEFAULT_STARTUP_URL = "https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html"
STARTUP_URL = os.getenv("STARTUP_URL", DEFAULT_STARTUP_URL)
AUTO_OPEN_BROWSER = os.getenv("AUTO_OPEN_BROWSER", "true").lower() in ("true", "1", "yes")

CERT_FILE = str(_BASE / "cert" / "cert.pem")
KEY_FILE = str(_BASE / "cert" / "key.pem")


def _port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _free_port_if_held(port: int) -> None:
    """Kill any process holding the port (Windows-only, PowerShell)."""
    if sys.platform != "win32" or not _port_in_use(port):
        return
    # FIX: Validate port is strictly numeric to prevent command injection
    if not isinstance(port, int) or port < 1 or port > 65535:
        return
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-NetTCPConnection -LocalPort {0} -State Listen -ErrorAction SilentlyContinue"
             " | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}".format(int(port))],
            timeout=6, capture_output=True, creationflags=creationflags,
        )
    except Exception:
        pass
    for _ in range(20):
        time.sleep(0.2)
        if not _port_in_use(port):
            break


def _write_pid_file() -> None:
    if sys.platform != "win32":
        return
    pid_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Zeralda ERP")
    os.makedirs(pid_dir, exist_ok=True)
    pid_file = os.path.join(pid_dir, "chrome_launcher_server.pid")
    try:
        with open(pid_file, "w") as f:
            f.write(str(os.getpid()))
    except OSError:
        pass


def _create_self_signed_cert() -> bool:
    cert_dir = _BASE / "cert"
    cert_dir.mkdir(parents=True, exist_ok=True)
    if Path(CERT_FILE).exists() and Path(KEY_FILE).exists():
        print("[HTTPS] Using existing certificates")
        return True
    try:
        from OpenSSL import crypto
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        cert = crypto.X509()
        cert.get_subject().C = "DZ"
        cert.get_subject().ST = "Algiers"
        cert.get_subject().L = "Zeralda"
        cert.get_subject().O = "Zeralda ERP"
        cert.get_subject().OU = "Development"
        cert.get_subject().CN = "localhost"
        cert.set_serial_number(1000)
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(365 * 24 * 60 * 60)
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(k)
        cert.sign(k, "sha256")
        with open(CERT_FILE, "wb") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        with open(KEY_FILE, "wb") as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        print("[HTTPS] [OK] Self-signed certificate created")
        return True
    except ImportError:
        print("[HTTPS] [WARN] pyOpenSSL not installed — HTTPS disabled")
        return False
    except Exception as e:
        print(f"[HTTPS] [ERROR] Failed to create certificate: {e}")
        return False


def _start_launcher_watchdog() -> None:
    """Stop the server when Zeralda_ERP_Launcher.exe closes (Windows-only)."""
    if sys.platform != "win32":
        return
    if os.getenv("ENVIRONMENT") == "development" or LAUNCH_MODE == "manual":
        return
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    def _find_launcher_pid() -> int:
        try:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 '(Get-Process -Name "Zeralda_ERP_Launcher","Zeralda_ERP_Launcher_core" '
                 "-ErrorAction SilentlyContinue | Select-Object -First 1).Id"],
                capture_output=True, text=True, timeout=5, creationflags=creationflags,
            )
            s = r.stdout.strip()
            return int(s) if s.isdigit() else 0
        except Exception:
            return 0

    def _pid_alive(pid: int) -> bool:
        import ctypes
        PROCESS_QUERY_LIMITED = 0x1000
        STILL_ACTIVE = 259
        try:
            h = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED, False, pid)
            if not h:
                return False
            code = ctypes.c_ulong(STILL_ACTIVE)
            ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
            ctypes.windll.kernel32.CloseHandle(h)
            return code.value == STILL_ACTIVE
        except Exception:
            return True

    def _watch():
        launcher_pid = 0
        for _ in range(90):
            launcher_pid = _find_launcher_pid()
            if launcher_pid:
                break
            time.sleep(1)
        if not launcher_pid:
            return
        log_structured("INFO", "Launcher watchdog active", action="launcher_watchdog", pid=launcher_pid)
        while True:
            time.sleep(2)
            if not _pid_alive(launcher_pid):
                log_structured("WARN", "Launcher closed — stopping server",
                               action="launcher_watchdog", pid=launcher_pid)
                time.sleep(0.3)
                # FIX #22: graceful — do NOT kill all python.exe / postgres.exe
                try:
                    from app.services import storage
                    storage.flush_pending()
                except Exception:
                    pass
                try:
                    from app.services import auth
                    auth.flush_sessions()
                except Exception:
                    pass
                # Remove PID file
                try:
                    pid_file = os.path.join(os.environ.get("LOCALAPPDATA", ""),
                                            "Zeralda ERP", "chrome_launcher_server.pid")
                    if os.path.exists(pid_file):
                        os.remove(pid_file)
                except OSError:
                    pass
                os._exit(0)

    threading.Thread(target=_watch, daemon=True, name="launcher-watchdog").start()


def _start_client_presence_monitor() -> None:
    """Auto-shutdown when no browser clients are active."""
    if not AUTO_SHUTDOWN_ON_CLIENT_CLOSE:
        return

    def _monitor():
        from app.handlers import misc
        while True:
            time.sleep(5)
            now = time.time()
            active = misc.prune_client_presence(now)
            if not misc._client_seen_once:
                continue
            if active > 0:
                continue
            if (now - float(misc._last_client_activity_ts or 0)) < max(5, AUTO_SHUTDOWN_GRACE_SECONDS):
                continue
            print("[SERVER] No active browser clients detected. Auto-shutdown triggered.")
            try:
                from app.services import storage
                storage.flush_pending()
            except Exception:
                pass
            os._exit(0)

    threading.Thread(target=_monitor, daemon=True, name="client-presence").start()


# ── Auto Remote Tunnel (Cloudflare) ─────────────────────────────────────────
_tunnel_process = None


def _cleanup_remote_tunnel() -> None:
    global _tunnel_process
    if _tunnel_process:
        try:
            _tunnel_process.terminate()
        except Exception:
            pass
    try:
        from tools import network_host_manager
        if network_host_manager.TUNNEL_INFO_FILE.exists():
            network_host_manager.TUNNEL_INFO_FILE.unlink(missing_ok=True)
    except Exception:
        pass


atexit.register(_cleanup_remote_tunnel)


def _start_remote_tunnel() -> None:
    """Auto-start Cloudflare Quick Tunnel in background for worldwide access."""
    if sys.platform != "win32":
        return
    enabled = os.getenv("ENABLE_REMOTE_TUNNEL", "true").lower() in ("true", "1", "yes")
    if not enabled:
        return

    def _tunnel_worker():
        global _tunnel_process
        time.sleep(1.8)  # Let FastAPI server bind port first
        try:
            from tools import network_host_manager
            import re
            import json

            cmd = [network_host_manager.CLOUDFLARED_PATH, "tunnel", "--url", f"http://127.0.0.1:{PORT}"]
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            _tunnel_process = process
            url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
            public_url = None
            start_ts = time.time()
            for line in iter(process.stdout.readline, ""):
                if not line:
                    break
                match = url_pattern.search(line)
                if match:
                    public_url = match.group(0)
                    break
                if time.time() - start_ts > 35:
                    break

            if public_url:
                print(f"  [TUNNEL] [OK] Worldwide Remote URL: {public_url}")
                try:
                    with open(network_host_manager.TUNNEL_INFO_FILE, "w", encoding="utf-8") as f:
                        json.dump(
                            {
                                "public_url": public_url,
                                "local_port": PORT,
                                "started_at": time.time(),
                                "pid": process.pid,
                            },
                            f,
                            indent=2,
                        )
                except Exception:
                    pass
            process.wait()
        except Exception as e:
            print(f"  [TUNNEL] [WARN] Tunnel not started: {e}")

    threading.Thread(target=_tunnel_worker, daemon=True, name="remote-tunnel-starter").start()


def _start_port_80_forwarder() -> None:
    """Start transparent TCP stream forwarder on port 80 -> PORT (8080).
    Allows typing http://www.zeralda-erp.dz/ directly in browsers without specifying :8080!
    """
    if sys.platform != "win32":
        return
    def _worker():
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind(("0.0.0.0", 80))
            srv.listen(100)
            print("  [PORT 80] [OK] Direct HTTP access enabled: http://www.zeralda-erp.dz/")
        except Exception as e:
            print(f"  [PORT 80] [WARN] Could not bind port 80 ({e}). Use http://www.zeralda-erp.dz:{PORT}/")
            return

        def _forward(src, dst):
            try:
                while True:
                    data = src.recv(8192)
                    if not data:
                        break
                    dst.sendall(data)
            except Exception:
                pass
            finally:
                try: src.close()
                except Exception: pass
                try: dst.close()
                except Exception: pass

        while True:
            try:
                client_sock, _ = srv.accept()
                backend_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                backend_sock.connect(("127.0.0.1", PORT))
                t1 = threading.Thread(target=_forward, args=(client_sock, backend_sock), daemon=True)
                t2 = threading.Thread(target=_forward, args=(backend_sock, client_sock), daemon=True)
                t1.start()
                t2.start()
            except Exception:
                pass

    threading.Thread(target=_worker, daemon=True, name="port-80-forwarder").start()


def _start_dns_responder() -> None:
    """Start local LAN DNS server to resolve www.zeralda-erp.dz on other devices."""
    if sys.platform != "win32":
        return
    try:
        from app.services import dns_service
        dns_service.start_dns_server()
    except Exception as e:
        print(f"  [DNS] [WARN] DNS server failed to start: {e}")


def _start_browser_auto_opener() -> None:
    """Auto-opens the ERP client in default browser on server startup."""
    if sys.platform != "win32" or not AUTO_OPEN_BROWSER:
        return

    def _worker():
        time.sleep(2.5)  # Allow uvicorn to bind and tunnel to establish
        try:
            import webbrowser
            import json
            from tools import network_host_manager

            target = (STARTUP_URL or "").strip()

            # If dynamic tunnel is active and saved a live public URL, prefer the active live URL
            for _ in range(6):
                tunnel_file = network_host_manager.TUNNEL_INFO_FILE
                alt_tunnel_file = Path("C:/Program Files/Zeralda ERP/data/remote_access_info.json")
                for tf in (tunnel_file, alt_tunnel_file):
                    if tf.exists():
                        try:
                            with open(tf, "r", encoding="utf-8") as f:
                                t_info = json.load(f)
                                active_url = t_info.get("public_url")
                                if active_url and "trycloudflare.com" in active_url:
                                    target = f"{active_url}/login.html?next=%2Fzeralda_erp_dashboard.html"
                                    break
                        except Exception:
                            pass
                if target and "trycloudflare.com" in target and not target.startswith("https://athletic-concepts"):
                    break
                time.sleep(0.5)

            if not target:
                target = f"http://127.0.0.1:{PORT}"

            print(f"  [BROWSER] [OK] Auto-launching ERP URL: {target}")
            webbrowser.open(target)
        except Exception as e:
            print(f"  [BROWSER] [WARN] Browser auto-launch failed: {e}")

    threading.Thread(target=_worker, daemon=True, name="browser-auto-opener").start()


def main() -> None:
    _free_port_if_held(PORT)
    _write_pid_file()

    # RADICAL FIX: migrate legacy standalone keys into zeralda-settings
    # (canonical source) before the server starts serving requests.
    try:
        from app.services import storage
        storage.migrate_unified_settings()
    except Exception as e:
        print(f"[MIGRATE] [WARN] Unified settings migration failed: {e}")

    # Initialize default admin if auth is enabled
    try:
        from app.services import auth
        auth.initialize_default_users()
        auth.cleanup_expired_sessions()
    except Exception as e:
        print(f"[AUTH] [WARN] Default user init failed: {e}")

    # Optional: import cloud_ai_service for its side-effect (patches socket.getaddrinfo)
    try:
        from backend import cloud_ai_service  # noqa: F401
    except Exception:
        pass

    # Start watchdogs & services
    _start_launcher_watchdog()
    _start_client_presence_monitor()
    _start_remote_tunnel()
    _start_port_80_forwarder()
    _start_dns_responder()
    _start_browser_auto_opener()

    # Start automated backup scheduler
    try:
        from app.services.cloud_backup import start_backup_scheduler
        start_backup_scheduler()
        print("[BACKUP] [OK] Automated backup scheduler active")
    except Exception as e:
        print(f"[BACKUP] [WARN] Could not start backup scheduler: {e}")



    # ── License status check at startup ──────────────────────────────────
    # Check the server-side license status and display it in the banner.
    # In production, an expired license will still start but API requests
    # will be blocked by the license enforcement middleware.
    license_status_info = None
    try:
        from app.services import license_service
        # Integrity check — verify critical files haven't been tampered with.
        # In production, strict=True will refuse to start if files are modified.
        # In production on local machines, strict=True refuses to start if files are modified.
        # On cloud container platforms (Railway, Render, etc.), avoid hard SystemExit so containers never crash-loop.
        is_cloud = bool(os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RENDER") or os.getenv("DYNO") or os.getenv("K_SERVICE"))
        strict_mode = (ENVIRONMENT == "production") and not is_cloud
        try:
            integrity_result = license_service.check_integrity(strict=strict_mode)
            if not integrity_result["ok"]:
                print(f"[LICENSE] [WARN] Integrity check: {len(integrity_result['mismatches'])} file(s) modified")
                # Log tampering events to usage analytics
                try:
                    for mismatch in integrity_result.get("mismatches", []):
                        license_service.log_usage_event(
                            event_type="tampering",
                            extra={"file": mismatch.get("file", ""), "expected": mismatch.get("expected", "")[:16], "actual": mismatch.get("actual", "")[:16]},
                        )
                except Exception:
                    pass
        except SystemExit:
            raise  # Re-raise if strict mode triggered SystemExit
        except Exception as ie:
            print(f"[LICENSE] [WARN] Integrity check failed: {ie}")

        license_status_info = license_service.get_server_license_status()
    except Exception as e:
        print(f"[LICENSE] [WARN] License status check failed: {e}")

    # HTTPS
    protocol = "HTTP"
    ssl_kwargs = {}
    if USE_HTTPS and _create_self_signed_cert():
        ssl_kwargs["ssl_certfile"] = CERT_FILE
        ssl_kwargs["ssl_keyfile"] = KEY_FILE
        protocol = "HTTPS"

    # Banner
    print("=" * 60)
    print("  Zeralda ERP Server v3.0 — FastAPI Edition")
    print("=" * 60)
    print(f"  [OK] Server running on {protocol}://localhost:{PORT}")
    print(f"  [AUTH] Authentication: [OK] Enabled (default) — set AUTH_DISABLED_IN_DEV=true to bypass in dev")
    print(f"  [HTTPS] HTTPS: {'[OK] Enabled' if protocol == 'HTTPS' else '[WARN] Disabled'}")
    if LAUNCH_MODE != "launcher":
        print("  [WARN] Server started outside canonical launcher route. Prefer launcher\\Launch_ERP.cmd")
    print(f"  [AUTO] Auto shutdown on page close: "
          f"{'[OK] Enabled' if AUTO_SHUTDOWN_ON_CLIENT_CLOSE else '[OFF] Disabled'}")
    print(f"  [ENV]  Environment: {ENVIRONMENT}")

    # License status banner
    if license_status_info:
        ls = license_status_info.get("status", "unknown")
        if ls == "active":
            lk = license_status_info.get("licenseKey", "?")
            lt = license_status_info.get("licenseType", "?")
            print(f"  [LICENSE] [OK] Active — Key: {lk} (type: {lt})")
        elif ls == "trial":
            dl = license_status_info.get("daysLeft", 0)
            print(f"  [LICENSE] [TRIAL] Trial period — {dl} days left")
        elif ls == "grace":
            gh = license_status_info.get("graceHoursLeft", 0)
            print(f"  [LICENSE] [GRACE] Grace period — {gh} hours left")
        else:
            print(f"  [LICENSE] [BLOCKED] {ls} — API access will be restricted")
            print(f"           Activate a license at: {protocol}://localhost:{PORT}/license.html")

    print("=" * 60)
    print("  Press Ctrl+C to stop the server")
    print("=" * 60)

    # Run uvicorn — single worker (in-memory state is shared via files, but
    # multi-worker would break the in-memory client-presence/rate-limit maps).
    uvicorn.run(
        "app.app:app",
        host=SERVER_HOST,
        port=PORT,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
        workers=1,
        access_log=os.getenv("ACCESS_LOG", "true").lower() == "true",
        **ssl_kwargs,
    )


if __name__ == "__main__":
    main()
