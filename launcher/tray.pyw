"""Zeralda ERP -- System Tray Launcher.

Starts the ERP server (app.main FastAPI) as a background process and shows a
tray icon so the user can open the dashboard, stop the server, or quit the
application without any visible console window.

Launched via pythonw.exe (no console) by the installed shortcut.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

import pystray
from PIL import Image

# --- Paths & configuration ---------------------------------------------------
APP_DIR    = Path(__file__).resolve().parent.parent      # {app}
LAUNCHER   = APP_DIR / 'launcher'
PYTHON_EXE = APP_DIR / 'python' / 'python.exe'            # bundled python (not pythonw — see comment below)
SERVER_PY  = APP_DIR / 'server.py'                        # legacy fallback
APP_MAIN   = APP_DIR / 'app' / 'main.py'                  # FastAPI app (preferred)
ICON_PATH  = LAUNCHER / 'app.ico'
DEFAULT_URL = 'https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html'
URL        = os.getenv('STARTUP_URL', DEFAULT_URL)
LOG_FILE   = APP_DIR / 'logs' / 'tray.log'

# --- Logging -----------------------------------------------------------------
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    line = f'{time.strftime("%Y-%m-%d %H:%M:%S")}  {msg}\n'
    try:
        with LOG_FILE.open('a', encoding='utf-8') as fh:
            fh.write(line)
    except Exception:
        pass


# --- Server lifecycle --------------------------------------------------------
server_proc: subprocess.Popen | None = None


def start_server() -> None:
    global server_proc
    if server_proc and server_proc.poll() is None:
        log('Server already running')
        return

    env = os.environ.copy()
    # Prefer the FastAPI app (app.main) 
    # Fall back to legacy server.py if app/ is missing.
    use_fastapi = APP_MAIN.exists()
    if use_fastapi:
        cmd = [str(PYTHON_EXE), '-m', 'app.main']
        log(f'Starting server (FastAPI): {" ".join(cmd)}')
    else:
        cmd = [str(PYTHON_EXE), str(SERVER_PY), str(PORT)]
        log(f'Starting server (legacy): {" ".join(cmd)}')

    creation_flags = 0
    if sys.platform == 'win32':
        creation_flags = subprocess.CREATE_NO_WINDOW

    # Redirect stdout/stderr to server.log for diagnostics.
    # pythonw.exe crashes (exit 1) when stderr has no console, so we use
    # python.exe with CREATE_NO_WINDOW + file redirect instead.
    server_log = APP_DIR / 'logs' / 'server.log'
    server_log.parent.mkdir(parents=True, exist_ok=True)
    log_fh = open(server_log, 'a', encoding='utf-8', buffering=1)

    server_proc = subprocess.Popen(
        cmd,
        cwd=str(APP_DIR),
        env=env,
        creationflags=creation_flags,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
    )
    log(f'Server PID={server_proc.pid}')


def stop_server() -> None:
    global server_proc
    if server_proc and server_proc.poll() is None:
        log(f'Stopping server PID={server_proc.pid}')
        try:
            server_proc.terminate()
            server_proc.wait(timeout=5)
        except Exception:
            try:
                server_proc.kill()
            except Exception:
                pass
    server_proc = None


def wait_for_port(host: str, port: int, timeout: float = 30.0) -> bool:
    """Poll the TCP port until something accepts a connection."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.4)
    return False


# --- Tray icon ---------------------------------------------------------------
def load_icon_image() -> Image.Image:
    if ICON_PATH.exists():
        try:
            return Image.open(ICON_PATH)
        except Exception:
            log(f'Could not open {ICON_PATH}, falling back to generated icon')
    # Fallback: solid orange square with white Z
    img = Image.new('RGB', (64, 64), '#E96A1B')
    return img


def on_open(icon, _item):
    webbrowser.open(URL)


def on_restart(icon, _item):
    log('Manual restart requested')
    stop_server()
    time.sleep(1)
    start_server()


def on_quit(icon, _item):
    log('Quit requested')
    stop_server()
    icon.stop()


def build_menu() -> pystray.Menu:
    return pystray.Menu(
        pystray.MenuItem('Open Dashboard', on_open, default=True),
        pystray.MenuItem('Restart Server', on_restart),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('Quit', on_quit),
    )


# --- Entry point -------------------------------------------------------------
def main() -> int:
    log('=== Zeralda ERP tray launcher starting ===')

    if not PYTHON_EXE.exists():
        log(f'ERROR: bundled Python not found at {PYTHON_EXE}')
        return 1
    if not APP_MAIN.exists() and not SERVER_PY.exists():
        log(f'ERROR: neither app/main.py nor server.py found in {APP_DIR}')
        return 1

    start_server()

    # Open browser once the server is actually listening.
    def deferred_open():
        if wait_for_port('127.0.0.1', PORT, timeout=30):
            log('Server is up, opening browser')
            webbrowser.open(URL)
        else:
            log('Server did not start within 30s')

    threading.Thread(target=deferred_open, daemon=True).start()

    icon = pystray.Icon(
        'zeralda-erp',
        load_icon_image(),
        'Zeralda ERP',
        build_menu(),
    )
    try:
        icon.run()
    finally:
        stop_server()
        log('=== Tray launcher exited ===')
    return 0


if __name__ == '__main__':
    sys.exit(main())
