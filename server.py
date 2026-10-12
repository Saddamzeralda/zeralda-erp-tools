"""
Zeralda ERP - Enhanced Server with HTTPS & Authentication
==========================================================
Serves static files AND provides:
- Shared storage with version control
- Authentication & Session management
- HTTPS/SSL support
- Multi-user support
- Activation Keys (KEYGEN) for managing user access

Auth Endpoints:
  POST   /api/auth/login                  → authenticate user
  POST   /api/auth/google-login           → authenticate with Google OAuth token
  POST   /api/auth/logout                 → destroy session
  GET    /api/auth/validate               → validate session
  GET    /api/auth/me                     → current user profile
  POST   /api/auth/register               → create new user (admin only)
  GET    /api/auth/users                  → list users (admin only)
  PATCH  /api/auth/users/<email>          → update user fields
  DELETE /api/auth/users/<email>          → delete user (admin only)
  POST   /api/auth/change-password        → change own password
  GET    /api/auth/sessions               → list active sessions (admin only)
  POST   /api/auth/sessions/cleanup       → purge expired sessions (admin only)
  POST   /api/auth/login-with-key         → login with phone + activation key
  POST   /api/keys/generate               → generate activation key (admin only)
  POST   /api/keys/verify                 → verify activation key
  GET    /api/keys/list                   → list activation keys (admin only)
  POST   /api/keys/revoke                 → revoke activation key (admin only)

Storage Endpoints:
  GET  /api/ping                          → health check
  GET  /api/store                         → get all data (requires auth)
  GET  /api/store?key=X                   → get specific key
  POST /api/store                         → save data
  DELETE /api/store?key=X                 → delete key
  GET  /api/store/history?key=X           → version history
  POST /api/store/rollback?key=X&version=N → rollback
  POST /api/store/undo                    → undo last change
  GET  /api/store/stats                   → statistics
  POST /api/store/cleanup                 → trim history/undo stack (admin only)

OCR Endpoints:
  GET  /api/ocr/status                    → Tesseract readiness + installed languages
  GET  /api/ocr/languages                 → list installed Tesseract language packs
  POST /api/ocr/extract                   → extract text from image/PDF/document
"""

import sys as _sys
# ── Windows UTF-8 fix: must run before ANY print/import that may log Unicode ──
try:
    if hasattr(_sys.stdout, 'reconfigure'):
        _sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(_sys.stderr, 'reconfigure'):
        _sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import http.server
import ssl
import os
import re
import json
import shutil
import threading
import datetime
import urllib.parse
from urllib.parse import urlparse, parse_qs
import base64
import sys
import socket

# Apply DNS fallback patch early (resolves hostnames via Google DNS when system DNS fails)
try:
    from backend import cloud_ai_service  # noqa: F401 — import side-effect patches socket.getaddrinfo
except Exception:
    pass

import ipaddress
import time
import secrets
import atexit
import signal
from threading import Lock
from pathlib import Path

# ══════════════════════════════════════════════════════════
#  Load .env file into environment variables (no external deps)
# ══════════════════════════════════════════════════════════
def _load_dotenv():
    env_path = Path(__file__).parent / ".env"
    if not env_path.is_file():
        return
    with open(env_path, encoding="utf-8") as _f:
        for _line in _f:
            _line = _line.strip()
            if not _line or _line.startswith("#") or "=" not in _line:
                continue
            _k, _v = _line.split("=", 1)
            _k = _k.strip()
            _v = _v.strip().strip('"').strip("'")
            if _k and _k not in os.environ:  # don't override real env vars
                os.environ[_k] = _v

_load_dotenv()

# ══════════════════════════════════════════════════════════
#  Structured Logging (JSON format)
# ══════════════════════════════════════════════════════════

def log_structured(level, message, **kwargs):
    """Log in structured JSON format for easier parsing and analysis"""
    log_entry = {
        'timestamp': datetime.datetime.now().isoformat(),
        'level': level,
        'message': message,
        'environment': os.getenv('ENVIRONMENT', 'development'),
        **kwargs  # Additional fields like action, user, status, etc.
    }
    print(json.dumps(log_entry, ensure_ascii=False))

# Optional: PostgreSQL/SQLAlchemy support
try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    DB_URL = os.getenv('DATABASE_URL', f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}")
    engine = create_engine(DB_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    DB_CONNECTED = True
    print(f"[SERVER] [OK] Database connected: {os.getenv('DB_NAME')}")
except Exception as e:
    DB_CONNECTED = False
    print(f"[SERVER] [WARN] Database using JSON fallback: {e}")

# Environment configuration
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development').lower()  # development, staging, production
REQUIRE_AUTH = ENVIRONMENT != 'development'  # Require auth in staging/production, optional in dev


def _is_placeholder_or_weak(value: str, min_len: int = 32) -> bool:
    v = str(value or '').strip()
    if not v:
        return True
    lowered = v.lower()
    blocked_exact = (
        'default',
        'example',
        'password',
        'admin@2026'
    )
    blocked_tokens = (
        'change_me',
        'changeme',
        'your-secure-password'
    )
    if lowered in blocked_exact:
        return True
    if any(tok in lowered for tok in blocked_tokens):
        return True
    return len(v) < int(min_len)


def _enforce_production_security():
    if ENVIRONMENT != 'production':
        return

    problems = []
    secret_key = os.getenv('SECRET_KEY', '')
    jwt_secret = os.getenv('JWT_SECRET', '')
    default_admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD', '')

    if _is_placeholder_or_weak(secret_key, min_len=32):
        problems.append('SECRET_KEY is missing/weak/default')

    if _is_placeholder_or_weak(jwt_secret, min_len=32):
        problems.append('JWT_SECRET is missing/weak/default')

    if default_admin_password and _is_placeholder_or_weak(default_admin_password, min_len=10):
        problems.append('DEFAULT_ADMIN_PASSWORD is default/weak in production')

    if problems:
        print('[SERVER] [ERROR] Production security checks failed:')
        for issue in problems:
            print(f'[SERVER] [ERROR] - {issue}')
        print('[SERVER] [ERROR] Fix .env secrets before starting with ENVIRONMENT=production')
        sys.exit(1)


_enforce_production_security()

# Import authentication system
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from backend import auth
    AUTH_ENABLED = True
    print("[SERVER] [OK] Authentication system loaded")
except ImportError as e:
    if REQUIRE_AUTH:
        print(f"[SERVER] [ERROR] CRITICAL: Authentication required but failed to load: {e}")
        print("[SERVER] [ERROR] Server cannot start without authentication in this environment.")
        print(f"[SERVER] [ERROR] Current ENVIRONMENT={ENVIRONMENT}")
        sys.exit(1)
    else:
        AUTH_ENABLED = False
        print(f"[SERVER] [WARN] Authentication disabled (DEV mode): {e}")

# Import KEYGEN system for activation keys
try:
    from backend import keygen_service
    KEYGEN_ENABLED = True
    print("[SERVER] [OK] KEYGEN system loaded")
except ImportError as e:
    KEYGEN_ENABLED = False
    print(f"[SERVER] [WARN] KEYGEN disabled: {e}")

print("[SERVER] [INFO] Hugging Face AI integration active")

# Import web search utility for AI chat
try:
    from backend.groq_service import search_web
    print("[SERVER] [OK] Web search module loaded")
except ImportError as e:
    def search_web(query: str, max_results: int = 5):
        return []
    print(f"[SERVER] [WARN] Web search disabled: {e}")

# Configuration
def _resolve_port():
    """Resolve port from CLI argument first, then .env, then fallback."""
    if len(sys.argv) > 1:
        try:
            return int(sys.argv[1])
        except Exception:
            pass
    try:
        return int(os.getenv('PORT', '80'))
    except Exception:
        return 80

PORT = _resolve_port()
_SERVER_START_TIME = time.time()
LAUNCH_MODE = os.getenv('ZERALDA_LAUNCH_MODE', '').strip().lower()
CUSTOM_DOMAIN = os.getenv('CUSTOM_DOMAIN', 'www.zeralda-erp.dz').strip().lower()
USE_HTTPS = os.getenv('USE_HTTPS', 'false').lower() == 'true'
CERT_FILE = os.path.join(os.path.dirname(__file__), 'cert', 'server.crt')
KEY_FILE = os.path.join(os.path.dirname(__file__), 'cert', 'server.key')

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DATA_FILE = os.path.join(DATA_DIR, 'shared_store.json')
HISTORY_FILE = os.path.join(DATA_DIR, 'shared_history.json')
UNDO_STACK_FILE = os.path.join(DATA_DIR, 'undo_stack.json')
_lock = threading.RLock()  # القفل الرئيسي (reentrant — آمن للـ nested calls)
# ملاحظة: _rw_lock (ReadWriteLock) معرّف لاحقاً لكن غير مستخدم حالياً
# لأن استبدال _lock (RLock reentrant) بـ _rw_lock (غير reentrant) في 43 موقع
# يخاطر بـ deadlocks. يُحتمل استخدامه مستقبلاً في مسارات قراءة محددة.
# In-memory cache for the store to avoid re-reading the JSON file on every request.
# The file is only 374KB but json.load() + dict construction is expensive under load.
_store_cache = None
_store_cache_mtime = 0
# Lazy history/undo persistence: instead of writing 174MB to disk on every POST,
# we keep the in-memory copy and flush periodically.
_history_dirty = False
_undo_stack_dirty = False
_history_flush_timer = None
_HISTORY_FLUSH_DELAY = 5.0  # seconds — flush history/undo after this idle period
# In-memory caches for history and undo stack (avoid re-reading 174MB on every request)
_history_cache = None
_history_cache_mtime = 0
_undo_stack_cache = None
_undo_stack_cache_mtime = 0

# ══════════════════════════════════════════════════════════
#  SSE (Server-Sent Events) — real-time change notifications
# ══════════════════════════════════════════════════════════
# A single set of subscriber queues. Each connected SSE client gets its own
# Queue; _sse_broadcast() pushes the event to every queue. The SSE handler
# thread reads from its queue and writes to the HTTP response stream.
# This decouples broadcast (fast, non-blocking) from delivery (slow clients
# don't block other subscribers).
import queue as _queue_module
_sse_subscribers = {}  # {subscriber_id: Queue}
_sse_sub_lock = threading.Lock()
_sse_next_id = 0
_sse_heartbeat_interval = float(os.getenv('SSE_HEARTBEAT_INTERVAL', '15'))  # seconds
_sse_queue_maxsize = int(os.getenv('SSE_QUEUE_MAXSIZE', '128'))  # إصلاح: زيادة حجم الطابور
_sse_seq = 0  # monotonic event sequence number (for client gap detection)
_sse_seq_lock = threading.Lock()
_sse_dropped_count = 0  # إصلاح: عداد الأحداث المُسقطة


# ═══════════════════════════════════════════════════════════════
# إصلاح جذري: Read-Write Lock بدلاً من global RLock
# يسمح بقراءات متعددة متزامنة، وكتابة واحدة فقط
# ═══════════════════════════════════════════════════════════════
class _ReadWriteLock:
    """A read-write lock allowing multiple concurrent readers but exclusive writers."""
    def __init__(self):
        self._readers = 0
        self._mutex = threading.Lock()
        self._read_cond = threading.Condition(self._mutex)
        self._writer_active = False
        self._writers_waiting = 0

    def acquire_read(self):
        """Acquire a read lock. Multiple readers can hold simultaneously."""
        with self._mutex:
            while self._writer_active or self._writers_waiting > 0:
                self._read_cond.wait()
            self._readers += 1

    def release_read(self):
        """Release a read lock."""
        with self._mutex:
            self._readers -= 1
            if self._readers == 0:
                self._read_cond.notify_all()

    def acquire_write(self):
        """Acquire a write lock. Exclusive — no other readers or writers."""
        with self._mutex:
            self._writers_waiting += 1
            while self._readers > 0 or self._writer_active:
                self._read_cond.wait()
            self._writers_waiting -= 1
            self._writer_active = True

    def release_write(self):
        """Release a write lock."""
        with self._mutex:
            self._writer_active = False
            self._read_cond.notify_all()

    # Context managers for convenience
    def read_lock(self):
        import contextlib
        return contextlib.contextmanager(self._read_ctx)()

    def _read_ctx(self):
        self.acquire_read()
        try:
            yield
        finally:
            self.release_read()

    def write_lock(self):
        import contextlib
        return contextlib.contextmanager(self._write_ctx)()

    def _write_ctx(self):
        self.acquire_write()
        try:
            yield
        finally:
            self.release_write()


# إصلاح: تهيئة read-write lock بعد تعريف الـ class
_rw_lock = _ReadWriteLock()


def _sse_next_seq():
    """Return the next monotonic event sequence number."""
    global _sse_seq
    with _sse_seq_lock:
        _sse_seq += 1
        return _sse_seq


def _sse_broadcast(event_type, key, value=None, version=None, actor=None, company_id=None):
    """Broadcast a storage change event to all SSE subscribers.

    Called after every successful POST/DELETE/rollback/undo on /api/store.
    Non-blocking: if a subscriber's queue is full, the event is dropped for
    that subscriber (they'll detect the sequence gap and re-sync).
    """
    event = {
        'seq': _sse_next_seq(),
        'type': event_type,      # 'set' | 'delete' | 'rollback' | 'undo' | 'bulk'
        'key': key,
        'value': value,
        'version': version,
        'actor': actor,          # email of the user who made the change
        'companyId': company_id,
        'ts': datetime.datetime.now().isoformat()
    }
    with _sse_sub_lock:
        subs = list(_sse_subscribers.values())
    for q in subs:
        try:
            q.put_nowait(event)
        except Exception:
            # إصلاح: سجل الحدث المُسقط بدلاً من التجاهل الصامت
            global _sse_dropped_count
            _sse_dropped_count += 1
            if _sse_dropped_count % 10 == 0:
                log_structured('WARN', f'SSE queue full: {_sse_dropped_count} events dropped total',
                               action='sse_queue_full', dropped_count=_sse_dropped_count)
            # إصلاح: أرسل حدث 'drop-notice' للعميل ليُعلمه بوجود فجوة
            # العميل سيُعالج هذا بإعادة المزامنة فوراً بدلاً من انتظار كشف seq gap
            try:
                drop_event = {
                    'seq': _sse_next_seq(),
                    'type': 'drop-notice',
                    'dropped_seq': event['seq'],
                    'ts': datetime.datetime.now().isoformat()
                }
                q.put_nowait(drop_event)
            except Exception:
                pass  # حتى حدث الإشعار فشل — العميل سيكتشف بالـ seq gap
            # Client will detect seq gap and re-sync.


def _sse_subscribe():
    """Register a new SSE subscriber. Returns (subscriber_id, queue).

    FIX P1: limit the number of concurrent SSE subscribers to prevent
    DoS via connection exhaustion. Default limit is 50.
    """
    global _sse_next_id
    _MAX_SSE_SUBSCRIBERS = int(os.getenv('MAX_SSE_SUBSCRIBERS', '50'))
    with _sse_sub_lock:
        if len(_sse_subscribers) >= _MAX_SSE_SUBSCRIBERS:
            raise RuntimeError(f"Too many SSE subscribers (max {_MAX_SSE_SUBSCRIBERS})")
        sid = _sse_next_id
        _sse_next_id += 1
        q = _queue_module.Queue(maxsize=_sse_queue_maxsize)
        _sse_subscribers[sid] = q
    return sid, q


def _sse_unsubscribe(sid):
    """Remove a subscriber."""
    with _sse_sub_lock:
        _sse_subscribers.pop(sid, None)

# B5: bind to loopback by default for desktop installs. Override with SERVER_HOST=0.0.0.0
# (or a specific LAN IP) in .env when LAN access is intentional.
SERVER_HOST = os.getenv('SERVER_HOST', '127.0.0.1').strip() or '127.0.0.1'
AUTH_RATE_WINDOW_SECONDS = int(os.getenv('AUTH_RATE_WINDOW_SECONDS', '60'))
AUTH_RATE_MAX_ATTEMPTS = int(os.getenv('AUTH_RATE_MAX_ATTEMPTS', '12'))
MAX_BODY_BYTES = int(os.getenv('MAX_BODY_BYTES', '104857600'))  # 100MB (for Base64-encoded files)
MAX_STORE_VALUE_BYTES = int(os.getenv('MAX_STORE_VALUE_BYTES', '5242880'))  # 5MB per key (ERP datasets can be large)
MAX_AUTH_BODY_BYTES = int(os.getenv('MAX_AUTH_BODY_BYTES', '8192'))
MAX_HISTORY_VERSIONS_PER_KEY = int(os.getenv('MAX_HISTORY_VERSIONS_PER_KEY', '500'))
MAX_UNDO_STACK = int(os.getenv('MAX_UNDO_STACK', '200'))
_auth_rate_state = {}
_auth_rate_lock = threading.Lock()
AUTO_SHUTDOWN_ON_CLIENT_CLOSE = os.getenv('AUTO_SHUTDOWN_ON_CLIENT_CLOSE', 'false').lower() == 'true'
CLIENT_SESSION_TTL_SECONDS = int(os.getenv('CLIENT_SESSION_TTL_SECONDS', '45'))
AUTO_SHUTDOWN_GRACE_SECONDS = int(os.getenv('AUTO_SHUTDOWN_GRACE_SECONDS', '300'))
_client_presence = {}
_client_presence_lock = threading.Lock()
_client_seen_once = False
_last_client_activity_ts = 0.0
_dev_mode_warned = False  # Log auth-bypass warning only once per process

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# ══════════════════════════════════════════════════════════
#  Storage Helpers
# ══════════════════════════════════════════════════════════

def _read_store():
    """Read store with support for PostgreSQL fallback to JSON.
    Uses an in-memory cache keyed on file mtime to avoid re-parsing on every request.
    """
    global _store_cache, _store_cache_mtime
    if DB_CONNECTED:
        try:
            with SessionLocal() as db:
                result = db.execute(text("SELECT key, value FROM kv_store"))
                return {row[0]: json.loads(row[1]) for row in result}
        except Exception as e:
            print(f"[DATABASE] Fallback to JSON due to: {e}")
    
    try:
        if not os.path.exists(DATA_FILE):
            _store_cache = None
            return {}
        # Check mtime — if file hasn't changed, return cached version
        mtime = os.path.getmtime(DATA_FILE)
        if _store_cache is not None and mtime == _store_cache_mtime:
            return _store_cache
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            result = data if isinstance(data, dict) else {}
            _store_cache = result
            _store_cache_mtime = mtime
            return result
    except json.JSONDecodeError as e:
        print(f"[ERROR] JSON decode error in store: {e}")
        return {}


def _backup_store(store):
    """Create a timestamped JSON backup of the entire store before writes.

    Keeps the last 20 snapshots in data/backups/ so any operation/addition
    can be reverted by restoring a previous file.
    """
    try:
        if not store or not os.path.exists(DATA_FILE):
            return
        backup_dir = os.path.join(DATA_DIR, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        ts = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        backup_path = os.path.join(backup_dir, f'shared_store-{ts}.json')
        temp_path = backup_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, backup_path)
        backups = sorted(
            [os.path.join(backup_dir, n) for n in os.listdir(backup_dir)
             if n.startswith('shared_store-') and n.endswith('.json')],
            key=os.path.getmtime
        )
        for old in backups[:-20]:
            try:
                os.remove(old)
            except Exception:
                pass
    except Exception:
        pass


def _write_store(store):
    """Write store to PostgreSQL (authoritative) + JSON snapshot.

    B2: deletes are propagated by replacing the full key set inside one
        transaction (delete missing keys, then upsert remaining ones).
    B3: a DB write failure aborts the operation — callers receive an
        exception instead of silent JSON-only divergence.
    """
    _backup_store(store)
    if DB_CONNECTED:
        try:
            with SessionLocal() as db:
                # 1) Remove keys that were deleted (full snapshot semantics)
                if store:
                    placeholders = ", ".join(f":k{i}" for i in range(len(store)))
                    params = {f"k{i}": k for i, k in enumerate(store.keys())}
                    db.execute(text(
                        f"DELETE FROM kv_store WHERE key NOT IN ({placeholders})"
                    ), params)
                else:
                    db.execute(text("DELETE FROM kv_store"))
                # 2) Upsert remaining
                for key, value in store.items():
                    val_str = json.dumps(value, ensure_ascii=False)
                    db.execute(text(
                        "INSERT INTO kv_store (key, value, updated_at) "
                        "VALUES (:key, :val, CURRENT_TIMESTAMP) "
                        "ON CONFLICT (key) DO UPDATE SET value = :val, updated_at = CURRENT_TIMESTAMP"
                    ), {"key": key, "val": val_str})
                db.commit()
        except Exception as e:
            print(f"[DATABASE] Write failed (aborting): {e}")
            try:
                log_structured('ERROR', 'Database write failed',
                               action='store_write_failed', error=str(e))
            except Exception:
                pass
            raise

    try:
        if not isinstance(store, dict):
            raise ValueError("Store must be a dictionary")
        
        os.makedirs(DATA_DIR, exist_ok=True)
        
        # Write with atomic operation (no .bak — history file handles versioning)
        temp_file = DATA_FILE + '.tmp'
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        
        os.replace(temp_file, DATA_FILE)
        
        # Invalidate the in-memory cache
        global _store_cache, _store_cache_mtime
        _store_cache = None
        _store_cache_mtime = 0
        
    except Exception as e:
        print(f"[ERROR] Failed to write store: {e}")
        raise


def _write_store_key(key, value):
    """Incremental single-key write — avoids rewriting the entire store.

    For PostgreSQL: a single upsert (no DELETE FROM ... NOT IN).
    For JSON: updates the in-memory cache and rewrites the file once
              (unavoidable with a single-file backend, but skips the
              expensive backup step since history already versions keys).

    Caller MUST already hold _lock.
    """
    global _store_cache, _store_cache_mtime

    if DB_CONNECTED:
        try:
            with SessionLocal() as db:
                val_str = json.dumps(value, ensure_ascii=False)
                db.execute(text(
                    "INSERT INTO kv_store (key, value, updated_at) "
                    "VALUES (:key, :val, CURRENT_TIMESTAMP) "
                    "ON CONFLICT (key) DO UPDATE SET value = :val, updated_at = CURRENT_TIMESTAMP"
                ), {"key": key, "val": val_str})
                db.commit()
        except Exception as e:
            print(f"[DATABASE] Incremental write failed (aborting): {e}")
            try:
                log_structured('ERROR', 'Database incremental write failed',
                               action='store_write_key_failed', error=str(e))
            except Exception:
                pass
            raise
        # Keep JSON snapshot in sync (best-effort, non-fatal)
        try:
            if _store_cache is None:
                _store_cache = {}
            _store_cache[key] = value
            _store_cache_mtime = 0  # force re-read on next _read_store
            _write_store_json_snapshot(_store_cache)
        except Exception as e:
            print(f"[STORE] JSON snapshot sync failed (non-fatal): {e}")
        return

    # JSON-only backend
    try:
        if _store_cache is None:
            _store_cache = _read_store() or {}
        _store_cache[key] = value
        _write_store_json_snapshot(_store_cache)
    except Exception as e:
        print(f"[ERROR] Failed to write store key '{key}': {e}")
        raise


def _delete_store_key(key):
    """Incremental single-key delete — avoids rewriting the entire store.

    Caller MUST already hold _lock.
    """
    global _store_cache, _store_cache_mtime

    if DB_CONNECTED:
        try:
            with SessionLocal() as db:
                db.execute(text("DELETE FROM kv_store WHERE key = :key"), {"key": key})
                db.commit()
        except Exception as e:
            print(f"[DATABASE] Incremental delete failed (aborting): {e}")
            raise
        try:
            if _store_cache is not None and key in _store_cache:
                del _store_cache[key]
                _store_cache_mtime = 0
                _write_store_json_snapshot(_store_cache)
        except Exception as e:
            print(f"[STORE] JSON snapshot sync after delete failed (non-fatal): {e}")
        return

    # JSON-only backend
    try:
        if _store_cache is None:
            _store_cache = _read_store() or {}
        if key in _store_cache:
            del _store_cache[key]
            _write_store_json_snapshot(_store_cache)
    except Exception as e:
        print(f"[ERROR] Failed to delete store key '{key}': {e}")
        raise


def _write_store_json_snapshot(store):
    """Write the JSON snapshot file atomically (without backup — history handles versioning).

    Caller MUST already hold _lock.
    """
    global _store_cache, _store_cache_mtime
    if not isinstance(store, dict):
        raise ValueError("Store must be a dictionary")
    os.makedirs(DATA_DIR, exist_ok=True)
    temp_file = DATA_FILE + '.tmp'
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(temp_file, DATA_FILE)
    _store_cache = store
    _store_cache_mtime = os.path.getmtime(DATA_FILE)


def _read_history():
    global _history_cache, _history_cache_mtime
    try:
        if not os.path.exists(HISTORY_FILE):
            _history_cache = None
            return {}
        mtime = os.path.getmtime(HISTORY_FILE)
        if _history_cache is not None and mtime == _history_cache_mtime:
            return _history_cache
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            result = data if isinstance(data, dict) else {}
            _history_cache = result
            _history_cache_mtime = mtime
            return result
    except Exception:
        return {}

def _schedule_history_flush():
    """Schedule a deferred flush of history/undo to disk.
    Called after every write to avoid writing 174MB on every POST."""
    global _history_flush_timer
    if _history_flush_timer:
        _history_flush_timer.cancel()
    _history_flush_timer = threading.Timer(_HISTORY_FLUSH_DELAY, _flush_history_to_disk)
    _history_flush_timer.daemon = True
    _history_flush_timer.start()

def _flush_history_to_disk():
    """Actually write history and undo stack to disk."""
    global _history_dirty, _undo_stack_dirty, _history_flush_timer
    _history_flush_timer = None
    with _lock:
        if _history_dirty and _history_cache is not None:
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                temp_file = HISTORY_FILE + '.tmp'
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(_history_cache, f, ensure_ascii=False, indent=2)
                os.replace(temp_file, HISTORY_FILE)
                global _history_cache_mtime
                _history_cache_mtime = os.path.getmtime(HISTORY_FILE)
                _history_dirty = False
            except Exception as e:
                print(f"[HISTORY] Flush failed: {e}")
        if _undo_stack_dirty and _undo_stack_cache is not None:
            try:
                os.makedirs(DATA_DIR, exist_ok=True)
                temp_file = UNDO_STACK_FILE + '.tmp'
                with open(temp_file, 'w', encoding='utf-8') as f:
                    json.dump(_undo_stack_cache, f, ensure_ascii=False, indent=2)
                os.replace(temp_file, UNDO_STACK_FILE)
                global _undo_stack_cache_mtime
                _undo_stack_cache_mtime = os.path.getmtime(UNDO_STACK_FILE)
                _undo_stack_dirty = False
            except Exception as e:
                print(f"[UNDO] Flush failed: {e}")

def _write_history(hist, force_flush=False):
    """Update in-memory history cache and schedule deferred disk flush.
    إصلاح: إذا force_flush=True، اكتب فوراً (للكتابات الحرجة)."""
    global _history_cache, _history_dirty
    _history_cache = hist
    _history_dirty = True
    if force_flush:
        # كتابة فورية للكتابات الحرجة (منع فقدان البيانات عند التعطل)
        _flush_history_to_disk()
    else:
        _schedule_history_flush()

# إصلاح: flush فوري عند إغلاق الخادم لمنع فقدان البيانات
def _emergency_flush(signum=None, frame=None):
    """Flush all pending data to disk immediately (called on exit/signal)."""
    try:
        _flush_history_to_disk()
    except Exception as e:
        print(f"[EMERGENCY] History flush failed: {e}")
    try:
        # Also flush store cache to disk if it exists
        with _lock:
            if _store_cache is not None:
                _write_store_json_snapshot(_store_cache)
    except Exception as e:
        print(f"[EMERGENCY] Store flush failed: {e}")

atexit.register(_emergency_flush)
try:
    signal.signal(signal.SIGTERM, _emergency_flush)
    signal.signal(signal.SIGINT, _emergency_flush)
except (ValueError, OSError):
    pass  # Not in main thread (e.g. when run via launcher)

def _read_undo_stack():
    try:
        if not os.path.exists(UNDO_STACK_FILE):
            _undo_stack_cache = None
            return []
        mtime = os.path.getmtime(UNDO_STACK_FILE)
        if _undo_stack_cache is not None and mtime == _undo_stack_cache_mtime:
            return _undo_stack_cache
        with open(UNDO_STACK_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            result = data if isinstance(data, list) else []
            _undo_stack_cache = result
            _undo_stack_cache_mtime = mtime
            return result
    except Exception:
        return []

def _write_undo_stack(stack):
    """Update in-memory undo stack cache and schedule deferred disk flush."""
    global _undo_stack_cache, _undo_stack_dirty
    if isinstance(stack, list) and len(stack) > MAX_UNDO_STACK:
        stack = stack[-MAX_UNDO_STACK:]
    _undo_stack_cache = stack
    _undo_stack_dirty = True
    _schedule_history_flush()


def _ai_memory_key(company_id=''):
    return f'zeralda-ai-memory::{company_id}' if company_id else 'zeralda-ai-memory'


def _add_ai_memory(store, action_type, args, result, company_id=''):
    """Append a compact command record to the AI's long-term memory."""
    try:
        key = _ai_memory_key(company_id)
        mem = store.get(key)
        if not isinstance(mem, list):
            mem = []
        record = args.get('record') or args.get('data') or {}
        rec_name = str(record.get('name') or record.get('description') or record.get('title') or record.get('customer') or record.get('number') or '')[:80]
        rec_id = str(result.get('id') or record.get('id') or record.get('code') or record.get('reference') or '')[:80]
        mem.append({
            'ts': datetime.datetime.now().isoformat(),
            'action': action_type,
            'module': str(args.get('module') or args.get('key') or ''),
            'record_id': rec_id,
            'record_name': rec_name,
            'total': result.get('total'),
        })
        store[key] = mem[-50:]
    except Exception:
        pass


def _format_ai_memory(store, company_id='', limit=10):
    """Format the most recent AI command memory for system prompt injection."""
    try:
        mem = store.get(_ai_memory_key(company_id)) or []
        if not isinstance(mem, list) or not mem:
            return ''
        recent = mem[-limit:]
        lines = ['\n\n--- Recent AI actions memory ---']
        for item in recent:
            ts = item.get('ts', '')
            action = item.get('action', '')
            mod = item.get('module', '')
            name = item.get('record_name', '')
            rid = item.get('record_id', '')
            total = item.get('total', '')
            lines.append(f"[{ts}] {action} {mod}: {name} (id={rid}, total={total})")
        lines.append('--- End memory ---\n')
        return '\n'.join(lines)
    except Exception:
        return ''


def _prune_history_key_versions(hist, key):
    """Keep only the latest MAX_HISTORY_VERSIONS_PER_KEY entries for a key."""
    entries = hist.get(key)
    if not isinstance(entries, list):
        return
    if len(entries) <= MAX_HISTORY_VERSIONS_PER_KEY:
        return

    pruned = entries[-MAX_HISTORY_VERSIONS_PER_KEY:]
    for idx, item in enumerate(pruned):
        if isinstance(item, dict):
            item['version'] = idx
    hist[key] = pruned

def _record_change_locked(key, old_val, new_val, hist=None, stack=None, flush=True):
    """Record a change in history and undo stack. Caller MUST already hold _lock.

    If hist/stack are provided, they are mutated in-place (caller must persist them).
    If flush=True (default), writes hist+stack to disk immediately.
    For bulk operations, pass flush=False and persist once after the loop.
    Returns (hist, stack) so callers can reuse them across multiple calls.
    """
    if hist is None:
        hist = _read_history()
    if stack is None:
        stack = _read_undo_stack()

    if key not in hist:
        hist[key] = []

    version = len(hist[key])
    hist[key].append({
        'version': version,
        'value': new_val,
        'old_value': old_val,
        'timestamp': datetime.datetime.now().isoformat(),
        'action': 'set'
    })

    _prune_history_key_versions(hist, key)

    current_version = len(hist.get(key, [])) - 1
    stack.append({'key': key, 'version': current_version, 'old_value': old_val})
    if len(stack) > MAX_UNDO_STACK:
        stack = stack[-MAX_UNDO_STACK:]

    if flush:
        _write_history(hist)
        _write_undo_stack(stack)

    return hist, stack


def _record_change(key, old_val, new_val):
    """Record a change in history and undo stack (acquires _lock)."""
    with _lock:
        _record_change_locked(key, old_val, new_val)


def _current_key_version(hist, key):
    """Return current version for a key based on history, -1 if unknown/new."""
    entries = hist.get(key)
    if not isinstance(entries, list) or len(entries) == 0:
        return -1
    return len(entries) - 1


def _all_key_versions(store, hist):
    """Build versions map for keys currently in store."""
    versions = {}
    if not isinstance(store, dict):
        return versions
    for key in store.keys():
        versions[key] = _current_key_version(hist, key)
    return versions


def _safe_remove_file(path):
    """Remove a file if it exists, ignoring errors."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


def _factory_reset_all_data():
    """Factory reset local store/auth/session files and optionally DB key-value data."""
    # Reset JSON/local fallback storage files
    _safe_remove_file(DATA_FILE)
    _safe_remove_file(HISTORY_FILE)
    _safe_remove_file(UNDO_STACK_FILE)

    # Recreate empty store files
    _write_store({})
    _write_history({})
    _write_undo_stack([])

    # Reset authentication data (users/sessions/attempts)
    if AUTH_ENABLED:
        try:
            auth.save_users({})
            auth.save_sessions({})
            auth.save_login_attempts({})
            auth.initialize_default_users()
        except Exception as e:
            print(f"[RESET] Auth reset warning: {e}")

    # Best-effort DB cleanup for common key-value table names
    if DB_CONNECTED:
        try:
            with SessionLocal() as db:
                for table_name in ('kv_store', 'storage_items'):
                    try:
                        db.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
                    except Exception:
                        # Ignore missing table errors
                        pass
                db.commit()
        except Exception as e:
            print(f"[RESET] DB reset warning: {e}")


def _touch_client_presence(session_id, meta=None):
    """Register/refresh a client session heartbeat."""
    global _client_seen_once, _last_client_activity_ts
    sid = str(session_id or '').strip()
    if not sid:
        return

    now = time.time()
    with _client_presence_lock:
        _client_presence[sid] = {
            'last_seen': now,
            'meta': meta or {}
        }
        _client_seen_once = True
        _last_client_activity_ts = now


def _remove_client_presence(session_id):
    """Remove a client session (used on page close)."""
    global _last_client_activity_ts
    sid = str(session_id or '').strip()
    if not sid:
        return

    now = time.time()
    with _client_presence_lock:
        if sid in _client_presence:
            _client_presence.pop(sid, None)
            _last_client_activity_ts = now


def _prune_client_presence(now_ts=None):
    """Drop stale client sessions and return active count."""
    global _last_client_activity_ts
    now = now_ts if isinstance(now_ts, (int, float)) else time.time()
    ttl = max(5, CLIENT_SESSION_TTL_SECONDS)

    with _client_presence_lock:
        stale = [sid for sid, item in _client_presence.items() if (now - float(item.get('last_seen', 0))) > ttl]
        if stale:
            for sid in stale:
                _client_presence.pop(sid, None)
            _last_client_activity_ts = now
        return len(_client_presence)

# ══════════════════════════════════════════════════════════
#  Shared Module Map (used by AI action handlers)
# ══════════════════════════════════════════════════════════

# AI route helpers extracted to backend/ai_routes.py for maintainability.
# MODULE_MAP and helpers are imported from there to avoid duplication.
from backend.ai_routes import MODULE_MAP, ai_chat as _ai_chat, normalize_line_items as _normalize_line_items, sanitize_record as _sanitize_ai_record, is_protected_store_key as _is_protected_store_key


# ══════════════════════════════════════════════════════════
#  Invoice PDF Generator (uses PyMuPDF)
# ══════════════════════════════════════════════════════════

def _generate_invoice_pdf(inv):
    """Generate a PDF from an invoice dict using PyMuPDF. Returns bytes or None."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4

    # Colors
    dark = (0.06, 0.16, 0.27)
    gray = (0.42, 0.45, 0.50)
    light_gray = (0.93, 0.94, 0.96)
    accent = (0.15, 0.39, 0.92)

    y = 50
    left = 40
    right = 555
    col_w = right - left

    # Header bar
    page.draw_rect(fitz.Rect(0, 0, 595, 8), color=accent, fill=accent)

    # Title
    page.insert_text(fitz.Point(left, y), "FACTURE / INVOICE", fontsize=22, fontname="helv", color=dark)
    y += 10
    page.draw_line(fitz.Point(left, y), fitz.Point(right, y), color=light_gray, width=0.5)
    y += 25

    # Invoice meta
    inv_num = str(inv.get('number') or inv.get('id') or 'N/A')
    inv_date = str(inv.get('date') or inv.get('invoiceDate') or '')
    inv_due = str(inv.get('dueDate') or inv.get('due_date') or '')
    inv_status = str(inv.get('status') or 'pending')

    meta_lines = [
        (f"Numero / Number: {inv_num}", True),
        (f"Date: {inv_date}", False),
        (f"Echeance / Due: {inv_due}" if inv_due else "", False),
        (f"Statut / Status: {inv_status}", False),
    ]
    for text, bold in meta_lines:
        if not text:
            continue
        page.insert_text(fitz.Point(left, y), text, fontsize=10, fontname="helv", color=dark if bold else gray)
        y += 16

    y += 10

    # Customer info
    customer = inv.get('customer') or inv.get('customerName') or ''
    if customer:
        page.insert_text(fitz.Point(left, y), "Client / Customer:", fontsize=11, fontname="helv", color=dark)
        y += 14
        page.insert_text(fitz.Point(left + 10, y), str(customer), fontsize=10, fontname="helv", color=gray)
        y += 14
        cust_phone = inv.get('customerPhone') or inv.get('phone') or ''
        cust_addr = inv.get('customerAddress') or inv.get('address') or ''
        if cust_addr:
            page.insert_text(fitz.Point(left + 10, y), str(cust_addr), fontsize=9, fontname="helv", color=gray)
            y += 13
        if cust_phone:
            page.insert_text(fitz.Point(left + 10, y), str(cust_phone), fontsize=9, fontname="helv", color=gray)
            y += 13

    y += 10

    # Line items table
    items = inv.get('items') or inv.get('lineItems') or []
    if not isinstance(items, list):
        items = []

    # Table header
    table_top = y
    page.draw_rect(fitz.Rect(left, y, right, y + 22), color=accent, fill=accent)
    headers = ["#", "Description", "Qty", "Prix/Price", "Total"]
    col_x = [left + 5, left + 30, left + 320, left + 380, left + 460]
    for i, h in enumerate(headers):
        page.insert_text(fitz.Point(col_x[i], y + 15), h, fontsize=9, fontname="helv", color=(1, 1, 1))
    y += 22

    # Table rows
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        if y > 770:
            page = doc.new_page(width=595, height=842)
            y = 50
            page.draw_rect(fitz.Rect(left, y, right, y + 22), color=accent, fill=accent)
            for i, h in enumerate(headers):
                page.insert_text(fitz.Point(col_x[i], y + 15), h, fontsize=9, fontname="helv", color=(1, 1, 1))
            y += 22

        row_bg = light_gray if idx % 2 == 0 else (1, 1, 1)
        page.draw_rect(fitz.Rect(left, y, right, y + 20), color=None, fill=row_bg)

        desc = str(item.get('description') or item.get('name') or item.get('product') or '')[:45]
        qty = str(item.get('quantity') or item.get('qty') or '1')
        price = str(item.get('price') or item.get('unitPrice') or '0')
        total = str(item.get('total') or item.get('lineTotal') or '0')

        page.insert_text(fitz.Point(col_x[0], y + 14), str(idx + 1), fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[1], y + 14), desc, fontsize=8, fontname="helv", color=dark)
        page.insert_text(fitz.Point(col_x[2], y + 14), qty, fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[3], y + 14), price, fontsize=8, fontname="helv", color=gray)
        page.insert_text(fitz.Point(col_x[4], y + 14), total, fontsize=8, fontname="helv", color=dark)
        y += 20

    # Totals
    y += 15
    page.draw_line(fitz.Point(left, y), fitz.Point(right, y), color=light_gray, width=0.5)
    y += 18

    subtotal = inv.get('subtotal') or inv.get('subTotal')
    tax_rate = inv.get('taxRate') or inv.get('tax_rate')
    tax_amount = inv.get('taxAmount') or inv.get('tax_amount')
    total_amount = inv.get('total') or inv.get('totalAmount') or inv.get('grandTotal') or 0

    if subtotal is not None:
        page.insert_text(fitz.Point(right - 150, y), "Sous-total / Subtotal:", fontsize=9, fontname="helv", color=gray)
        page.insert_text(fitz.Point(right - 10, y), str(subtotal), fontsize=9, fontname="helv", color=dark)
        y += 15
    if tax_amount is not None:
        label = f"TVA ({tax_rate}%):" if tax_rate else "TVA / Tax:"
        page.insert_text(fitz.Point(right - 150, y), label, fontsize=9, fontname="helv", color=gray)
        page.insert_text(fitz.Point(right - 10, y), str(tax_amount), fontsize=9, fontname="helv", color=dark)
        y += 15
    if total_amount is not None:
        page.draw_line(fitz.Point(right - 160, y), fitz.Point(right, y), color=dark, width=1)
        y += 15
        page.insert_text(fitz.Point(right - 150, y), "TOTAL:", fontsize=12, fontname="helv", color=dark)
        page.insert_text(fitz.Point(right - 10, y), str(total_amount), fontsize=12, fontname="helv", color=accent)
        y += 20

    # Notes
    notes = inv.get('notes') or inv.get('note') or ''
    if notes and y < 800:
        y += 10
        page.insert_text(fitz.Point(left, y), "Notes:", fontsize=10, fontname="helv", color=dark)
        y += 14
        for line in str(notes).split('\n')[:5]:
            page.insert_text(fitz.Point(left + 10, y), line[:70], fontsize=8, fontname="helv", color=gray)
            y += 12

    # Footer
    page.draw_line(fitz.Point(left, 810), fitz.Point(right, 810), color=light_gray, width=0.5)
    page.insert_text(fitz.Point(left, 825), "Genere par Zeralda ERP", fontsize=7, fontname="helv", color=gray)
    page.insert_text(fitz.Point(right - 80, 825), datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), fontsize=7, fontname="helv", color=gray)

    pdf_bytes = doc.tobytes(deflate=True)
    doc.close()
    return pdf_bytes


# ══════════════════════════════════════════════════════════
#  Request Handler
# ══════════════════════════════════════════════════════════

class EnhancedHandler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        """Enhanced logging with rotation"""
        try:
            log_dir = os.path.join(DATA_DIR, 'logs')
            os.makedirs(log_dir, exist_ok=True)
            
            # Daily log files
            log_date = datetime.datetime.now().strftime('%Y-%m-%d')
            log_path = os.path.join(log_dir, f'server_{log_date}.log')
            
            with open(log_path, 'a', encoding='utf-8') as lf:
                timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                log_entry = f"[{timestamp}] {self.address_string()} - {fmt % args}\n"
                lf.write(log_entry)
            
            # Clean old logs (keep last 7 days)
            self._cleanup_old_logs(log_dir)
        except Exception as e:
            print(f"[ERROR] Logging failed: {e}")
    
    def _cleanup_old_logs(self, log_dir, days=7):
        """Remove log files older than specified days"""
        try:
            import time
            cutoff = time.time() - (days * 86400)
            for filename in os.listdir(log_dir):
                if not filename.startswith('server_') or not filename.endswith('.log'):
                    continue
                file_path = os.path.join(log_dir, filename)
                if os.path.getmtime(file_path) < cutoff:
                    os.remove(file_path)
        except Exception:
            pass

    def _get_client_ip(self):
        """Resolve real client IP with best effort behind reverse proxies."""
        xff = self.headers.get('X-Forwarded-For', '')
        if xff:
            first = xff.split(',')[0].strip()
            if first:
                return first
        try:
            return str(self.client_address[0])
        except Exception:
            return '127.0.0.1'

    def _origin_is_allowed(self, origin):
        """Allow only localhost, private LAN origins, or configured custom domain."""
        if not origin:
            return False
        try:
            parsed = urllib.parse.urlparse(origin)
            host = (parsed.hostname or '').strip().lower()
            if not host:
                return False
            if host in ('localhost', '127.0.0.1'):
                return True
            # Allow configured custom domain
            if CUSTOM_DOMAIN and host == CUSTOM_DOMAIN:
                return True
            # Allow private IPs
            ip = ipaddress.ip_address(host)
            return ip.is_private or ip.is_loopback
        except Exception:
            return False

    def _auth_rate_limited(self):
        """Simple in-memory per-IP rate limit for auth endpoints."""
        client_ip = self._get_client_ip()
        now = time.time()

        with _auth_rate_lock:
            # Prune stale IPs every call (cheap — typically few entries)
            stale_ips = [ip for ip, ts_list in _auth_rate_state.items()
                         if ts_list and (now - ts_list[-1]) > AUTH_RATE_WINDOW_SECONDS * 2]
            for ip in stale_ips:
                del _auth_rate_state[ip]

            bucket = _auth_rate_state.get(client_ip)
            if not bucket:
                _auth_rate_state[client_ip] = [now]
                return False

            recent = [ts for ts in bucket if now - ts <= AUTH_RATE_WINDOW_SECONDS]
            recent.append(now)
            _auth_rate_state[client_ip] = recent

            if len(recent) > AUTH_RATE_MAX_ATTEMPTS:
                return True

        return False

    def _cors(self):
        """CORS headers - allow localhost and private LAN origins only."""
        origin = self.headers.get('Origin', '')
        if self._origin_is_allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        else:
            self.send_header('Access-Control-Allow-Origin', 'null')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, X-Requested-With')
        self.send_header('Access-Control-Allow-Credentials', 'true')

    def end_headers(self):
        """Set cache policy to reduce browser cache corruption issues."""
        try:
            path = self.path.split('?', 1)[0].lower()
        except Exception:
            path = ''

        try:
            host_hdr = (self.headers.get('Host', '') or '').split(':', 1)[0].strip().lower()
        except Exception:
            host_hdr = ''

        is_trustworthy_context = bool(USE_HTTPS or host_hdr in ('localhost', '127.0.0.1', '::1'))

        # Baseline hardening headers
        # settings.html needs to be frameable by same-origin (AI chat settings iframe)
        if path.endswith('/settings.html'):
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
        else:
            self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

        # Send COOP only on trustworthy contexts (HTTPS/localhost) to avoid browser ignore warnings.
        # Use same-origin-allow-popups so Google OAuth / GSI client and popups (e.g. Google Drive, OAuth)
        # can communicate back via window.opener without triggering window.closed COOP blocks.
        if is_trustworthy_context:
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        if USE_HTTPS:
            self.send_header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

        if path.endswith('.html') or path == '/':
            host_header = str(self.headers.get('Host') or '').strip()
            current_host = host_header.split(':', 1)[0].strip('[]') if host_header else ''
            connect_sources = [
                "'self'",
                'http://127.0.0.1:8080',
            ]
            connect_sources.extend([
                'https://www.googleapis.com',
                'https://oauth2.googleapis.com',
                'https://people.googleapis.com',
                'https://gmail.googleapis.com',
                'https://accounts.google.com',
                'https://cdn.jsdelivr.net',
                'https://cdnjs.cloudflare.com',
            ])
            # upgrade-insecure-requests and block-all-mixed-content are omitted
            # because the server runs on plain HTTP - those directives would
            # break Google OAuth and mixed resource loading on HTTP origins.
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
                "style-src-elem 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
                "font-src 'self' data: https: https://fonts.gstatic.com https://cdnjs.cloudflare.com https://at.alicdn.com http://at.alicdn.com; "
                "img-src 'self' data: https: blob: https://lh3.googleusercontent.com; "
                f"connect-src {' '.join(connect_sources)}; "
                "worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
                "frame-src 'self' https://accounts.google.com; "
                "frame-ancestors 'self';"
            )
            self.send_header('Content-Security-Policy', csp)

        no_cache_ext = ('.html', '.js', '.css', '.json', '.map')
        if path.startswith('/api/') or path == '/' or path.endswith(no_cache_ext):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')

        super().end_headers()

    def do_OPTIONS(self):
        """Handle preflight requests"""
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, code, obj):
        """Send JSON response"""
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _query(self):
        """Parse query string"""
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        return {k: v[0] for k, v in qs.items()}

    def _read_body(self):
        """Read and parse POST body"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return {}
            if content_length > MAX_BODY_BYTES:
                return {'__error__': 'PAYLOAD_TOO_LARGE'}
            body = self.rfile.read(content_length)
            return json.loads(body.decode('utf-8'))
        except Exception as e:
            print(f"[ERROR] Failed to parse body: {e}")
            return {}

    def _get_session_token(self):
        """Extract session token from headers or query string"""
        # Try Authorization header
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            return auth_header[7:]
        
        # Try custom header
        token = self.headers.get('X-Session-Token', '')
        if token:
            return token
        
        # Fallback: query string parameter (used by navigator.sendBeacon)
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            token_list = qs.get('token', [])
            if token_list:
                return token_list[0]
        except Exception:
            pass
        return ''

    def _validate_session(self):
        """Validate session and return user data"""
        if not AUTH_ENABLED or not REQUIRE_AUTH:
            global _dev_mode_warned
            # B4: log every dev-mode auth bypass so operators don't miss it.
            try:
                log_structured(
                    'WARNING',
                    'AUTH BYPASSED (dev mode) on request',
                    action='auth_bypass_request',
                    path=str(getattr(self, 'path', '?')),
                    method=str(getattr(self, 'command', '?')),
                    remote=self.client_address[0] if getattr(self, 'client_address', None) else '?',
                    environment=ENVIRONMENT,
                )
            except Exception:
                pass
            if not _dev_mode_warned:
                _dev_mode_warned = True
                log_structured(
                    'WARNING',
                    'Authentication bypassed — running in development mode. '
                    'Set ENVIRONMENT=production in .env to enforce authentication.',
                    action='auth_bypass',
                    environment=ENVIRONMENT
                )
            return {'role': 'admin', 'email': 'admin@local'}  # Bypass if auth disabled
        
        session_token = self._get_session_token()
        if not session_token:
            return None
        
        ip = self.client_address[0] if self.client_address else ''
        ua = self.headers.get('User-Agent', '')
        user = auth.validate_session(session_token, ip, ua)
        return user

    def _require_auth(self, required_role=None):
        """Check if user is authenticated and optionally has required role"""
        user = self._validate_session()
        if not user:
            self._json(401, {'ok': False, 'error': 'Unauthorized', 'code': 'UNAUTHORIZED'})
            return None
        
        if required_role:
            if user.get('role') != required_role and user.get('role') != 'admin':
                self._json(403, {'ok': False, 'error': 'Forbidden', 'code': 'FORBIDDEN'})
                return None
        
        return user

    def _require_store_permission(self, user, action):
        """Check storage-specific permissions by role and action."""
        role = (user or {}).get('role', 'viewer')
        email = (user or {}).get('email', 'unknown')

        read_roles = {'admin', 'manager', 'user', 'viewer'}
        write_roles = {'admin', 'manager', 'user'}
        admin_roles = {'admin'}

        allowed = False
        if action in {'read', 'history', 'stats'}:
            allowed = role in read_roles
        elif action in {'write', 'delete'}:
            allowed = role in write_roles
        elif action in {'rollback', 'undo'}:
            allowed = role in admin_roles

        if not allowed:
            log_structured(
                'WARNING',
                'Storage operation forbidden',
                action=f'store_{action}',
                user=email,
                role=role,
                status='forbidden'
            )
            self._json(403, {'ok': False, 'error': 'Forbidden', 'code': 'FORBIDDEN'})
            return False

        return True

    # ══════════════════════════════════════════════════════════
    #  Authentication Endpoints
    # ══════════════════════════════════════════════════════════

    def _handle_auth(self):
        """Handle authentication endpoints"""
        if not AUTH_ENABLED:
            return self._json(503, {'ok': False, 'error': 'Authentication not available'})
        
        path = urlparse(self.path).path

        # POST /api/auth/login
        if path == '/api/auth/login' and self.command == 'POST':
            if self._auth_rate_limited():
                return self._json(429, {
                    'ok': False,
                    'error': 'Too many authentication attempts. Please wait and try again.',
                    'code': 'RATE_LIMITED'
                })

            content_length = int(self.headers.get('Content-Length', 0) or 0)
            if content_length > MAX_AUTH_BODY_BYTES:
                return self._json(413, {
                    'ok': False,
                    'error': 'Authentication payload too large',
                    'code': 'PAYLOAD_TOO_LARGE'
                })

            data = self._read_body()
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {
                    'ok': False,
                    'error': 'Payload too large',
                    'code': 'PAYLOAD_TOO_LARGE'
                })
            identifier = data.get('identifier', data.get('email', '')).strip()
            password = data.get('password', '')
            
            if not identifier or not password:
                return self._json(400, {'ok': False, 'error': 'Username/email and password required'})
            
            ip = self.client_address[0] if self.client_address else ''
            ua = self.headers.get('User-Agent', '')
            result = auth.authenticate(identifier, password, ip, ua)
            return self._json(200 if result['ok'] else 401, result)

        # POST /api/auth/google-login (Google OAuth sign-in)
        if path == '/api/auth/google-login' and self.command == 'POST':
            if self._auth_rate_limited():
                return self._json(429, {
                    'ok': False,
                    'error': 'Too many authentication attempts. Please wait and try again.',
                    'code': 'RATE_LIMITED'
                })

            data = self._read_body()
            google_token = str(data.get('google_token', data.get('access_token', ''))).strip()
            if not google_token:
                return self._json(400, {'ok': False, 'error': 'Google token required', 'code': 'MISSING_TOKEN'})

            # Verify the Google access token by calling Google's userinfo endpoint
            import urllib.request as _urllib_req
            import urllib.error as _urllib_err
            google_userinfo_url = 'https://www.googleapis.com/oauth2/v3/userinfo'
            req = _urllib_req.Request(google_userinfo_url, headers={'Authorization': 'Bearer ' + google_token})
            try:
                with _urllib_req.urlopen(req, timeout=10) as resp:
                    userinfo = json.loads(resp.read().decode('utf-8'))
            except _urllib_err.HTTPError as e:
                log_structured('WARNING', 'Google token verification failed', action='google_login',
                               status='token_invalid', http_code=e.code)
                return self._json(401, {'ok': False, 'error': 'Invalid Google token', 'code': 'INVALID_GOOGLE_TOKEN'})
            except Exception as e:
                log_structured('WARNING', 'Google token verification error', action='google_login',
                               status='error', error=str(e))
                return self._json(502, {'ok': False, 'error': 'Failed to verify Google token', 'code': 'GOOGLE_VERIFY_FAILED'})

            google_email = str(userinfo.get('email', '')).strip().lower()
            google_name = str(userinfo.get('name', userinfo.get('given_name', ''))).strip()
            google_picture = str(userinfo.get('picture', '')).strip()

            if not google_email:
                return self._json(400, {'ok': False, 'error': 'No email in Google account', 'code': 'NO_GOOGLE_EMAIL'})

            # Check if user exists
            users = auth.load_users()
            user = users.get(google_email)

            if user:
                # User exists — check if active
                if not user.get('active', True):
                    return self._json(403, {'ok': False, 'error': 'Account is disabled', 'code': 'ACCOUNT_DISABLED'})
                # Reset failed attempts
                auth.reset_failed_attempts(google_email)
            else:
                # User doesn't exist — auto-create with role 'user'
                # Only if GOOGLE_AUTO_CREATE_USERS is enabled (default: true for convenience)
                auto_create = os.getenv('GOOGLE_AUTO_CREATE_USERS', 'true').strip().lower() == 'true'
                if not auto_create:
                    return self._json(403, {
                        'ok': False,
                        'error': 'No account found for this Google email. Ask your administrator to create an account.',
                        'code': 'USER_NOT_FOUND'
                    })
                # Generate a random password (user will use Google login)
                random_password = secrets.token_urlsafe(32) + '!Aa1'
                create_result = auth.create_user(google_name or google_email.split('@')[0], google_email, random_password, 'user')
                if not create_result.get('ok'):
                    return self._json(400, {'ok': False, 'error': create_result.get('error', 'Failed to create user'), 'code': 'CREATE_FAILED'})
                users = auth.load_users()
                user = users.get(google_email)

            # Create session
            ip = self.client_address[0] if self.client_address else ''
            ua = self.headers.get('User-Agent', '')
            session_token = auth.create_session(google_email, ip, ua)

            # Update user profile with Google info if missing
            if google_picture and not user.get('picture'):
                user['picture'] = google_picture
                users[google_email] = user
                auth.save_users(users)

            safe_user = {k: v for k, v in user.items() if k not in ['password', 'salt']}
            safe_user['google_login'] = True

            log_structured('INFO', 'Google login successful', action='google_login',
                           email=google_email, status='success')

            return self._json(200, {
                'ok': True,
                'session_token': session_token,
                'user': safe_user
            })

        # POST /api/auth/logout
        if path == '/api/auth/logout' and self.command == 'POST':
            session_token = self._get_session_token()
            if session_token:
                auth.destroy_session(session_token)
            return self._json(200, {'ok': True, 'message': 'Logged out'})

        # GET /api/auth/validate
        if path == '/api/auth/validate' and self.command == 'GET':
            user = self._validate_session()
            if user:
                return self._json(200, {'ok': True, 'user': user})
            else:
                return self._json(401, {'ok': False, 'error': 'Invalid session'})

        # POST /api/auth/register (admin only)
        if path == '/api/auth/register' and self.command == 'POST':
            user = self._require_auth('admin')
            if not user:
                return False
            
            data = self._read_body()
            username = data.get('username', '').strip()
            email = data.get('email', '').strip()
            password = data.get('password', '')
            role = data.get('role', 'user')
            
            if not all([username, email, password]):
                log_structured('WARNING', 'User registration attempted with missing fields',
                              action='register', email=email, initiator=user.get('email'),
                              status='missing_fields')
                return self._json(400, {'ok': False, 'error': 'Missing required fields'})
            
            result = auth.create_user(username, email, password, role)
            log_structured('INFO' if result['ok'] else 'WARNING',
                          'User registration',
                          action='register', email=email, role=role, 
                          initiator=user.get('email'), status='success' if result['ok'] else 'failed',
                          reason=result.get('error', 'OK'))
            return self._json(200 if result['ok'] else 400, result)

        # GET /api/auth/users (admin only)
        if path == '/api/auth/users' and self.command == 'GET':
            user = self._require_auth('admin')
            if not user:
                return False
            
            users = auth.load_users()
            # Remove sensitive data
            safe_users = {
                email: {k: v for k, v in u.items() if k not in ['password', 'salt']}
                for email, u in users.items()
            }
            return self._json(200, {'ok': True, 'users': safe_users})

        # ══════════════════════════════════════════════════════════
        #  KEYGEN (Activation Key) Endpoints
        # ══════════════════════════════════════════════════════════

        # POST /api/keys/generate (admin only)
        if path == '/api/keys/generate' and self.command == 'POST':
            if not KEYGEN_ENABLED:
                return self._json(503, {'ok': False, 'error': 'KEYGEN system not available'})
            
            user = self._require_auth('admin')
            if not user:
                return False
            
            data = self._read_body()
            phone = str(data.get('phone', '')).strip()
            email = data.get('email')
            
            if not phone:
                return self._json(400, {'ok': False, 'error': 'Phone number is required', 'code': 'MISSING_PHONE'})
            
            result = keygen_service.generate_key(phone, email)
            log_structured(
                'INFO' if result['ok'] else 'WARNING',
                'Key generation',
                action='keygen_generate',
                phone=phone,
                initiator=user.get('email'),
                status='success' if result['ok'] else 'failed',
                error=result.get('error', '')
            )
            return self._json(200 if result['ok'] else 400, result)

        # POST /api/keys/verify
        if path == '/api/keys/verify' and self.command == 'POST':
            if not KEYGEN_ENABLED:
                return self._json(503, {'ok': False, 'error': 'KEYGEN system not available'})
            
            data = self._read_body()
            key = str(data.get('key', '')).strip()
            phone = data.get('phone')  # Optional
            
            if not key:
                return self._json(400, {'ok': False, 'error': 'Key is required', 'code': 'MISSING_KEY'})
            
            result = keygen_service.verify_key(key, phone)
            return self._json(200 if result['ok'] else 401, result)

        # POST /api/auth/login-with-key (Phone + Key authentication)
        if path == '/api/auth/login-with-key' and self.command == 'POST':
            if not KEYGEN_ENABLED:
                return self._json(503, {'ok': False, 'error': 'KEYGEN system not available'})

            phone = ''
            try:
                if self._auth_rate_limited():
                    return self._json(429, {
                        'ok': False,
                        'error': 'Too many authentication attempts. Please wait and try again.',
                        'code': 'RATE_LIMITED'
                    })

                data = self._read_body()
                phone = str(data.get('phone', '')).strip()
                key = str(data.get('key', '')).strip()

                if not phone or not key:
                    return self._json(400, {
                        'ok': False,
                        'error': 'Phone number and activation key are required',
                        'code': 'MISSING_CREDENTIALS'
                    })

                # Verify key matches phone
                key_result = keygen_service.authenticate_with_key(phone, key)
                if not key_result['ok']:
                    log_structured(
                        'WARNING',
                        'Failed authentication with key',
                        action='auth_key_failed',
                        phone=phone,
                        error=key_result.get('error'),
                        ip=self._get_client_ip()
                    )
                    return self._json(401, key_result)

                # Get or create user for this phone
                user_email = key_result.get('email')
                if not user_email:
                    # Auto-generate email from phone if not provided
                    user_email = f"user_{phone.replace('+', '')}@zeralda.local"

                # Check if user exists, if not create one
                existing_users = auth.load_users()
                if user_email not in existing_users:
                    # Ensure generated password satisfies strict policy requirements.
                    temp_password = f"Tmp@{secrets.token_hex(8)}A1"
                    create_result = auth.create_user(
                        username=phone,
                        email=user_email,
                        password=temp_password,
                        role='user'
                    )
                    if not create_result['ok']:
                        log_structured(
                            'ERROR',
                            'Failed to create user for activation key',
                            action='auth_key_user_creation_failed',
                            phone=phone,
                            email=user_email,
                            error=create_result.get('error')
                        )
                        return self._json(500, {
                            'ok': False,
                            'error': 'Failed to create user account',
                            'code': 'USER_CREATION_FAILED'
                        })

                # Generate session token for this user
                ip = self.client_address[0] if self.client_address else ''
                ua = self.headers.get('User-Agent', '')
                session_token = auth.create_session(user_email, ip, ua)
                if not session_token:
                    return self._json(500, {
                        'ok': False,
                        'error': 'Failed to create session',
                        'code': 'SESSION_CREATION_FAILED'
                    })

                log_structured(
                    'INFO',
                    'Successful authentication with activation key',
                    action='auth_key_success',
                    phone=phone,
                    email=user_email,
                    ip=self._get_client_ip()
                )

                return self._json(200, {
                    'ok': True,
                    'session_token': session_token,
                    'user_email': user_email,
                    'phone': phone,
                    'message': 'Logged in successfully'
                })
            except Exception as exc:
                log_structured(
                    'ERROR',
                    'Unhandled exception during key login',
                    action='auth_key_exception',
                    phone=phone,
                    ip=self._get_client_ip(),
                    error=str(exc)
                )
                return self._json(500, {
                    'ok': False,
                    'error': 'Internal server error during key login',
                    'code': 'INTERNAL_SERVER_ERROR'
                })

        # GET /api/keys/list (admin only)
        if path == '/api/keys/list' and self.command == 'GET':
            if not KEYGEN_ENABLED:
                return self._json(503, {'ok': False, 'error': 'KEYGEN system not available'})
            
            user = self._require_auth('admin')
            if not user:
                return False
            
            params = self._query()
            phone = params.get('phone')
            active_only = params.get('active_only', '').lower() in ('true', '1', 'yes')
            
            result = keygen_service.list_keys(phone_number=phone, active_only=active_only)
            return self._json(200, result)

        # POST /api/keys/revoke (admin only)
        if path == '/api/keys/revoke' and self.command == 'POST':
            if not KEYGEN_ENABLED:
                return self._json(503, {'ok': False, 'error': 'KEYGEN system not available'})
            
            user = self._require_auth('admin')
            if not user:
                return False
            
            data = self._read_body()
            key = str(data.get('key', '')).strip()
            
            if not key:
                return self._json(400, {'ok': False, 'error': 'Key is required', 'code': 'MISSING_KEY'})
            
            result = keygen_service.revoke_key(key)
            log_structured(
                'WARNING',
                'Key revoked',
                action='keygen_revoke',
                key=key,
                initiator=user.get('email'),
                status='success' if result['ok'] else 'failed'
            )
            return self._json(200 if result['ok'] else 400, result)

        # ══════════════════════════════════════════════════════════
        #  Extended User Management Endpoints
        # ══════════════════════════════════════════════════════════

        # GET /api/auth/me — current user profile
        if path == '/api/auth/me' and self.command == 'GET':
            user = self._require_auth()
            if not user:
                return False
            safe = {k: v for k, v in user.items() if k not in ['password', 'salt', 'session_token']}
            return self._json(200, {'ok': True, 'user': safe})

        # POST /api/auth/change-password
        if path == '/api/auth/change-password' and self.command == 'POST':
            user = self._require_auth()
            if not user:
                return False
            data = self._read_body()
            current_pw = data.get('current_password', '')
            new_pw = data.get('new_password', '')
            if not current_pw or not new_pw:
                return self._json(400, {'ok': False, 'error': 'current_password and new_password are required'})
            result = auth.change_password(user['email'], current_pw, new_pw)
            if result['ok']:
                auth.revoke_all_user_sessions(user['email'])
                log_structured('INFO', 'Password changed', action='change_password',
                               user=user['email'], status='success')
            return self._json(200 if result['ok'] else 400, result)

        # PATCH /api/auth/users/<email> — update user fields
        if path.startswith('/api/auth/users/') and self.command == 'PATCH':
            requester = self._require_auth()
            if not requester:
                return False
            target_email = urllib.parse.unquote(path[len('/api/auth/users/'):]).strip().lower()
            if not target_email:
                return self._json(400, {'ok': False, 'error': 'Target email required in URL'})
            is_admin = requester.get('role') == 'admin'
            is_own = requester['email'] == target_email
            if not is_admin and not is_own:
                return self._json(403, {'ok': False, 'error': 'Forbidden', 'code': 'FORBIDDEN'})
            data = self._read_body()
            requester_role = requester.get('role', 'user')
            result = auth.update_user(target_email, data, requester_role)
            if result['ok']:
                log_structured('INFO', 'User updated', action='update_user',
                               target=target_email, initiator=requester['email'],
                               fields=list(data.keys()), status='success')
            return self._json(200 if result['ok'] else 400, result)

        # DELETE /api/auth/users/<email> — delete user (admin only)
        if path.startswith('/api/auth/users/') and self.command == 'DELETE':
            requester = self._require_auth('admin')
            if not requester:
                return False
            target_email = urllib.parse.unquote(path[len('/api/auth/users/'):]).strip().lower()
            if not target_email:
                return self._json(400, {'ok': False, 'error': 'Target email required in URL'})
            result = auth.delete_user(target_email, requester['email'])
            if result['ok']:
                log_structured('WARNING', 'User deleted', action='delete_user',
                               target=target_email, initiator=requester['email'],
                               sessions_revoked=result.get('sessions_revoked', 0), status='success')
            return self._json(200 if result['ok'] else 400, result)

        # GET /api/auth/sessions — list active sessions (admin only)
        if path == '/api/auth/sessions' and self.command == 'GET':
            user = self._require_auth('admin')
            if not user:
                return False
            result = auth.get_sessions_info()
            return self._json(200, result)

        # POST /api/auth/sessions/cleanup — purge expired sessions (admin only)
        if path == '/api/auth/sessions/cleanup' and self.command == 'POST':
            user = self._require_auth('admin')
            if not user:
                return False
            auth.cleanup_expired_sessions()
            return self._json(200, {'ok': True, 'message': 'Expired sessions cleaned up'})

        # GET /api/auth/preferences — get saved preferences for current user
        if path == '/api/auth/preferences' and self.command == 'GET':
            user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            email = user.get('email', '')
            users = auth.load_users()
            prefs = users.get(email, {}).get('preferences', {})
            return self._json(200, {'ok': True, 'preferences': prefs})

        # POST /api/auth/preferences — save preferences for current user
        if path == '/api/auth/preferences' and self.command == 'POST':
            user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            body = self._read_body()
            prefs = body.get('preferences', {})
            if not isinstance(prefs, dict):
                return self._json(400, {'ok': False, 'error': 'preferences must be an object'})
            email = user.get('email', '')
            users = auth.load_users()
            if email in users:
                users[email].setdefault('preferences', {}).update(prefs)
                auth.save_users(users)
            return self._json(200, {'ok': True, 'message': 'Preferences saved'})

        return False

    # ══════════════════════════════════════════════════════════
    #  Storage Endpoints
    # ══════════════════════════════════════════════════════════

    def _handle_storage(self):
        """Handle storage endpoints"""
        path = urlparse(self.path).path
        user = self._validate_session() if AUTH_ENABLED else {'role': 'admin', 'email': 'dev@local'}

        # Paths that don't require an active session.
        # NOTE: /api/backup and /api/backup/restore are NOT here — they check
        # _require_auth('admin') in their own handlers and must remain protected.
        auth_bypass_paths = [
            '/api/ping',
            '/api/client/alive',
            '/api/client/bye',
            '/api/export/download',
            '/api/config/keygen-status',
            '/api/ai/status',
            '/api/ocr/status',
        ]
        if path not in auth_bypass_paths and AUTH_ENABLED and REQUIRE_AUTH:
            user = self._validate_session()
            if not user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})

        # POST /api/server/shutdown — force-stop the server (admin only)
        if path == '/api/server/shutdown' and self.command == 'POST':
            su = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not su:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            if AUTH_ENABLED and REQUIRE_AUTH and (su.get('role') or '').lower() != 'admin':
                log_structured('WARN', 'Non-admin shutdown attempt blocked',
                               action='server_shutdown_denied',
                               initiator=su.get('email', '?'),
                               role=su.get('role', '?'))
                return self._json(403, {'ok': False, 'error': 'Forbidden: admin role required',
                                        'code': 'FORBIDDEN'})
            log_structured('WARN', 'Force shutdown requested', action='server_shutdown',
                           initiator=su.get('email', '?'))
            self._json(200, {'ok': True, 'message': 'Server is shutting down...'})
            def _do_full_exit():
                import time as _t, subprocess as _sp
                _t.sleep(0.8)
                # 1. Stop PostgreSQL — kill directly (no admin needed)
                try:
                    _sp.run(['taskkill', '/F', '/IM', 'postgres.exe', '/T'],
                            timeout=8, capture_output=True)
                except Exception:
                    pass
                try:
                    _pgctl = r'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
                    if os.path.exists(_pgctl):
                        _sp.run([_pgctl, 'stop', '-D', r'C:\Program Files\PostgreSQL\17\data', '-m', 'fast'],
                                timeout=10, capture_output=True)
                except Exception:
                    pass
                # 2. Delete PID file
                try:
                    _p = os.path.join(os.environ.get('LOCALAPPDATA', ''),
                                      'Zeralda ERP', 'chrome_launcher_server.pid')
                    if os.path.exists(_p): os.remove(_p)
                except Exception:
                    pass
                # 3. Kill Launcher exe (both old and new names)
                try:
                    _sp.run(['taskkill', '/F', '/IM', 'Zeralda_ERP_Launcher.exe', '/T'],
                            timeout=8, capture_output=True)
                    _sp.run(['taskkill', '/F', '/IM', 'Zeralda_ERP_Launcher_core.exe', '/T'],
                            timeout=8, capture_output=True)
                except Exception:
                    pass
                # 3b. Kill WebView2
                try:
                    _sp.run(['taskkill', '/F', '/IM', 'msedgewebview2.exe', '/T'],
                            timeout=8, capture_output=True)
                except Exception:
                    pass
                # 4. Kill all Python processes (most reliable)
                try:
                    _sp.run(['taskkill', '/F', '/IM', 'python.exe', '/T'],
                            timeout=8, capture_output=True)
                    _sp.run(['taskkill', '/F', '/IM', 'py.exe', '/T'],
                            timeout=8, capture_output=True)
                except Exception:
                    pass
                try:
                    if AUTH_ENABLED:
                        auth.flush_sessions()
                except Exception:
                    pass
                os._exit(0)
            import threading as _th
            _th.Thread(target=_do_full_exit, daemon=True).start()
            return True

        # GET /api/ai/status
        if path == '/api/ai/status' and self.command == 'GET':
            try:
                from backend.cloud_ai_service import get_cloud_status
                status = get_cloud_status()
                return self._json(200, {
                    'ok': status.get('configured', False),
                    'provider': status.get('provider', 'unknown'),
                    'model': status.get('model', 'unknown'),
                    'configured': status.get('configured', False),
                    'error': status.get('error')
                })
            except Exception as exc:
                return self._json(200, {'ok': False, 'provider': 'unknown', 'configured': False, 'error': str(exc)})

        # GET/POST /api/ai/settings — manage AI configuration (admin only)
        if path == '/api/ai/settings':
            if self.command == 'GET':
                # Require an authenticated session — settings may contain provider/model info
                # and the admin role is needed to view raw API keys (which are masked below anyway).
                get_user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
                if AUTH_ENABLED and REQUIRE_AUTH and not get_user:
                    return self._json(401, {'ok': False, 'error': 'Unauthorized'})
                from backend.cloud_ai_service import PROVIDER_CONFIGS, _read_ai_settings
                ai_cfg = _read_ai_settings(os.path.dirname(os.path.abspath(__file__)))

                provider = str(ai_cfg.get('provider', 'gemini')).strip().lower()
                if provider not in PROVIDER_CONFIGS:
                    provider = 'gemini'
                    ai_cfg['provider'] = 'gemini'

                defaults = {
                    'provider': 'gemini',
                    'features': {'web_search': True, 'exec_actions': True, 'file_analysis': True},
                }
                for pname, pcfg in PROVIDER_CONFIGS.items():
                    if pcfg.get('api_key_field'):
                        defaults[pcfg['api_key_field']] = ai_cfg.get(pcfg['api_key_field'], '')
                    if pcfg.get('model_field'):
                        defaults[pcfg['model_field']] = ai_cfg.get(pcfg['model_field'], pcfg['default_model'])

                from backend.auth import AI_PERMISSIONS
                defaults['role_permissions'] = {r: dict(p) for r, p in AI_PERMISSIONS.items()}
                defaults.update(ai_cfg)
                # Security: mask API keys for non-admin viewers so the GET endpoint
                # never leaks secrets to lower-privileged roles. Admins still see the
                # full (DPAPI-encrypted) value so they can verify configuration.
                if AUTH_ENABLED and REQUIRE_AUTH and (get_user or {}).get('role') != 'admin':
                    for pname, pcfg in PROVIDER_CONFIGS.items():
                        kf = pcfg.get('api_key_field')
                        if kf and isinstance(defaults.get(kf), str) and defaults[kf]:
                            defaults[kf] = '••••••••'
                return self._json(200, {'ok': True, 'settings': defaults})
            if self.command == 'POST':
                req_user = self._require_auth('admin')
                if not req_user:
                    return False
                data = self._read_body()

                from backend.cloud_ai_service import PROVIDER_CONFIGS
                allowed_keys = ['provider', 'features', 'role_permissions', 'ocr_engine']
                for pcfg in PROVIDER_CONFIGS.values():
                    if pcfg.get('api_key_field'):
                        allowed_keys.append(pcfg['api_key_field'])
                    if pcfg.get('model_field'):
                        allowed_keys.append(pcfg['model_field'])
                allowed_keys = list(dict.fromkeys(allowed_keys))

                ai_settings_file = os.path.join(DATA_DIR, 'ai_settings.json')
                try:
                    with open(ai_settings_file, 'r', encoding='utf-8-sig') as f:
                        current = json.load(f)
                except (OSError, json.JSONDecodeError):
                    current = {}

                current.update({k: v for k, v in data.items() if k in allowed_keys})

                from backend.cloud_ai_service import _encrypt_api_key, _DPAPI_PREFIX
                for _pcfg in PROVIDER_CONFIGS.values():
                    _k = _pcfg.get('api_key_field')
                    if _k and isinstance(current.get(_k), str) and not current[_k].startswith(_DPAPI_PREFIX):
                        current[_k] = _encrypt_api_key(current[_k])

                with open(ai_settings_file, 'w', encoding='utf-8') as f:
                    json.dump(current, f, ensure_ascii=False, indent=2)
                print(f'[AI SETTINGS] Saved by {req_user.get("email","unknown")}: provider={current.get("provider")}, keys_updated={len(data)}')
                return self._json(200, {'ok': True, 'message': 'AI settings saved'})

        # GET /api/ai/my-permissions — get current user's AI permissions
        if path == '/api/ai/my-permissions' and self.command == 'GET':
            cur_user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not cur_user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            from backend.auth import get_ai_permissions
            perms = get_ai_permissions(cur_user.get('role', 'viewer'))
            return self._json(200, {'ok': True, 'role': cur_user.get('role'), 'permissions': perms})

        # POST /api/ai/chat
        if path == '/api/ai/chat' and self.command == 'POST':
            # Auth check
            chat_user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not chat_user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            # AI permission check
            from backend.auth import get_ai_permissions
            ai_perms = get_ai_permissions(chat_user.get('role', 'viewer') if chat_user else 'viewer')
            if not ai_perms.get('chat', False):
                return self._json(403, {'ok': False, 'error': 'AI chat not permitted for your role'})

            data = self._read_body()
            messages = data.get('messages', [])
            system_prompt = data.get('system_prompt') or None
            max_tokens = data.get('max_tokens')
            temperature = data.get('temperature')
            use_web = data.get('use_web', True) and ai_perms.get('websearch', False)

            # Validate input
            if not isinstance(messages, list) or len(messages) == 0:
                return self._json(400, {'ok': False, 'error': 'messages array is required'})
            if len(messages) > 100:
                return self._json(400, {'ok': False, 'error': 'Too many messages (max 100)'})
            for m in messages:
                if not isinstance(m, dict) or m.get('role') not in ('user', 'model', 'assistant'):
                    return self._json(400, {'ok': False, 'error': 'Each message must have role (user/model) and content'})
                content = str(m.get('content') or m.get('text') or '')
                if len(content) > 16000:
                    return self._json(400, {'ok': False, 'error': 'Message content too long (max 16000 chars)'})

            try:
                latest_user_query = ''
                for msg in reversed(messages):
                    if isinstance(msg, dict) and msg.get('role') == 'user':
                        latest_user_query = str(msg.get('content') or msg.get('text') or '').strip()
                        if latest_user_query:
                            break

                web_results = []
                effective_system_prompt = system_prompt

                try:
                    with _lock:
                        srv_store = _read_store()
                    store_counts = []
                    for _sk, _sv in list(srv_store.items()):
                        try:
                            if isinstance(_sv, list) and _sv:
                                store_counts.append(f'{_sk}: {len(_sv)}')
                        except Exception:
                            pass
                    if store_counts:
                        _srv_insert = f'\n\n--- Server data counts ---\n{", ".join(store_counts)}\n--- End counts ---\n'
                        _marker = '## YOUR ACTION CAPABILITIES'
                        _sp = effective_system_prompt or ''
                        if _marker in _sp:
                            _idx = _sp.index(_marker)
                            effective_system_prompt = _sp[:_idx] + _srv_insert + _sp[_idx:]
                        else:
                            effective_system_prompt = _sp + _srv_insert
                except Exception:
                    pass

                try:
                    with _lock:
                        srv_store = _read_store()
                    # RADICAL FIX: read from zeralda-settings.activeCompanyId (canonical)
                    _settings = srv_store.get('zeralda-settings', {})
                    company_id = str(_settings.get('activeCompanyId', '') or '').strip() if isinstance(_settings, dict) else ''
                    if not company_id:
                        company_id = str(srv_store.get('zeralda-active-company', '')).strip()
                    _mem_insert = _format_ai_memory(srv_store, company_id, limit=10)
                    if _mem_insert:
                        _marker = '## YOUR ACTION CAPABILITIES'
                        _sp = effective_system_prompt or ''
                        if _marker in _sp:
                            _idx = _sp.index(_marker)
                            effective_system_prompt = _sp[:_idx] + _mem_insert + _sp[_idx:]
                        else:
                            effective_system_prompt = _sp + _mem_insert
                except Exception:
                    pass

                if use_web and latest_user_query:
                    web_results = search_web(latest_user_query, max_results=5)
                    if web_results:
                        web_context = []
                        for idx, item in enumerate(web_results, start=1):
                            title = str(item.get('title') or '').strip()
                            url = str(item.get('url') or '').strip()
                            snippet = str(item.get('snippet') or '').strip()
                            web_context.append(
                                f"[{idx}] {title}\nURL: {url}\nSnippet: {snippet}"
                            )
                        base_prompt = system_prompt or (
                            "You are an intelligent ERP assistant for Zeralda ERP system. "
                            "Use web search results when they are relevant and mention the source URL when you rely on them."
                        )
                        web_context_text = '\n\n'.join(web_context[:5])
                        effective_system_prompt = (
                            f"{base_prompt}\n\n"
                            "Current web search results are provided below. Use them for fresh internet information, "
                            "but if they are insufficient say so clearly instead of guessing.\n\n"
                            f"--- Web results ---\n{web_context_text}--- End web results ---"
                        )

                from backend.ai_chat_service import chat_with_assistant_ai
                result = chat_with_assistant_ai(messages, system_prompt=effective_system_prompt, max_tokens=max_tokens, temperature=temperature)

                if web_results:
                    result['web_results'] = web_results
                result['ai_perms'] = ai_perms
                return self._json(200, result)
            except Exception as exc:
                return self._json(500, {'ok': False, 'error': str(exc)})

        # POST /api/ai/chat/stream — SSE streaming chat
        if path == '/api/ai/chat/stream' and self.command == 'POST':
            chat_user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not chat_user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            from backend.auth import get_ai_permissions
            ai_perms = get_ai_permissions(chat_user.get('role', 'viewer') if chat_user else 'viewer')
            if not ai_perms.get('chat', False):
                return self._json(403, {'ok': False, 'error': 'AI chat not permitted for your role'})

            data = self._read_body()
            messages = data.get('messages', [])
            system_prompt = data.get('system_prompt') or None
            use_web = data.get('use_web', False) and ai_perms.get('websearch', False)

            if not isinstance(messages, list) or len(messages) == 0:
                return self._json(400, {'ok': False, 'error': 'messages array is required'})
            if len(messages) > 100:
                return self._json(400, {'ok': False, 'error': 'Too many messages (max 100)'})
            for m in messages:
                if not isinstance(m, dict) or m.get('role') not in ('user', 'model', 'assistant'):
                    return self._json(400, {'ok': False, 'error': 'Each message must have role (user/model) and content'})
                content = str(m.get('content') or m.get('text') or '')
                if len(content) > 16000:
                    return self._json(400, {'ok': False, 'error': 'Message content too long (max 16000 chars)'})

            try:
                effective_system_prompt = system_prompt

                # ── Web search support ──
                if use_web:
                    latest_user_query = ''
                    for msg in reversed(messages):
                        if isinstance(msg, dict) and msg.get('role') == 'user':
                            latest_user_query = str(msg.get('content') or msg.get('text') or '').strip()
                            if latest_user_query:
                                break
                    if latest_user_query:
                        try:
                            web_results = search_web(latest_user_query, max_results=5)
                            if web_results:
                                web_context_text = '\n\n'.join(
                                    f"[{i+1}] {item.get('title','')}\nURL: {item.get('url','')}\nSnippet: {item.get('snippet','')}"
                                    for i, item in enumerate(web_results[:5])
                                )
                                base_prompt = effective_system_prompt or ''
                                effective_system_prompt = (
                                    f"{base_prompt}\n\n"
                                    "Current web search results are provided below. Use them for fresh internet information, "
                                    "but if they are insufficient say so clearly instead of guessing.\n\n"
                                    f"--- Web results ---\n{web_context_text}\n--- End web results ---"
                                )
                        except Exception:
                            pass

                try:
                    with _lock:
                        srv_store = _read_store()
                    store_counts = []
                    for _sk, _sv in list(srv_store.items()):
                        try:
                            if isinstance(_sv, list) and _sv:
                                store_counts.append(f'{_sk}: {len(_sv)}')
                        except Exception:
                            pass
                    if store_counts:
                        _srv_insert = f'\n\n--- Server data counts ---\n{", ".join(store_counts)}\n--- End counts ---\n'
                        _marker = '## ACTION CAPABILITIES'
                        _sp = effective_system_prompt or ''
                        if _marker in _sp:
                            _idx = _sp.index(_marker)
                            effective_system_prompt = _sp[:_idx] + _srv_insert + _sp[_idx:]
                        else:
                            effective_system_prompt = _sp + _srv_insert
                except Exception:
                    pass

                try:
                    with _lock:
                        srv_store = _read_store()
                    # RADICAL FIX: read from zeralda-settings.activeCompanyId (canonical)
                    _settings = srv_store.get('zeralda-settings', {})
                    company_id = str(_settings.get('activeCompanyId', '') or '').strip() if isinstance(_settings, dict) else ''
                    if not company_id:
                        company_id = str(srv_store.get('zeralda-active-company', '')).strip()
                    _mem_insert = _format_ai_memory(srv_store, company_id, limit=10)
                    if _mem_insert:
                        _marker = '## ACTION CAPABILITIES'
                        _sp = effective_system_prompt or ''
                        if _marker in _sp:
                            _idx = _sp.index(_marker)
                            effective_system_prompt = _sp[:_idx] + _mem_insert + _sp[_idx:]
                        else:
                            effective_system_prompt = _sp + _mem_insert
                except Exception:
                    pass

                # Send SSE headers
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('Connection', 'close')
                self._cors()
                self.end_headers()

                from backend.cloud_ai_service import chat_with_assistant_ai_stream
                for event in chat_with_assistant_ai_stream(messages, system_prompt=effective_system_prompt):
                    try:
                        event_line = 'data: ' + json.dumps(event, ensure_ascii=False) + '\n\n'
                        self.wfile.write(event_line.encode('utf-8'))
                        self.wfile.flush()
                    except Exception:
                        break
                return
            except Exception as exc:
                try:
                    err_event = 'data: ' + json.dumps({'type': 'error', 'error': str(exc)}, ensure_ascii=False) + '\n\n'
                    self.wfile.write(err_event.encode('utf-8'))
                    self.wfile.flush()
                except Exception:
                    pass
                return

        # POST /api/ai/action — execute admin actions on behalf of the AI assistant
        if path == '/api/ai/action' and self.command == 'POST':
            action_user = self._validate_session() if (AUTH_ENABLED and REQUIRE_AUTH) else {'role': 'admin', 'email': 'dev@local'}
            if AUTH_ENABLED and REQUIRE_AUTH and not action_user:
                return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            from backend.auth import get_ai_permissions
            ai_perms = get_ai_permissions(action_user.get('role', 'viewer') if action_user else 'viewer')
            data = self._read_body()
            action_type = str(data.get('action') or '').strip()
            args = data.get('args') or {}

            def _resolve_company_id(args_dict, store_data):
                cid = str(args_dict.get('companyId') or '').strip()
                if cid:
                    return cid
                # RADICAL FIX: read from zeralda-settings.activeCompanyId (canonical)
                try:
                    _s = store_data.get('zeralda-settings', {})
                    if isinstance(_s, dict):
                        ac = _s.get('activeCompanyId', '')
                        if isinstance(ac, str) and ac:
                            return ac.strip()
                except Exception:
                    pass
                try:
                    ac = store_data.get('zeralda-active-company', '')
                    if isinstance(ac, str) and ac:
                        return ac.strip()
                except Exception:
                    pass
                return ''

            try:
                # ── user_list ──────────────────────────────────────────────
                if action_type == 'user_list':
                    if not (ai_perms.get('manage_users') or ai_perms.get('read_all')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_users required'})
                    from backend.auth import list_users
                    users = list_users()
                    safe = [{'email': u.get('email'), 'name': u.get('name'), 'role': u.get('role'),
                             'active': u.get('active', True)} for u in (users or [])]
                    return self._json(200, {'ok': True, 'users': safe, 'count': len(safe)})

                # ── user_create ────────────────────────────────────────────
                elif action_type == 'user_create':
                    if not ai_perms.get('manage_users'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_users required'})
                    from backend.auth import create_user
                    email    = str(args.get('email') or '').strip().lower()
                    name     = str(args.get('name') or email.split('@')[0]).strip()
                    role     = str(args.get('role') or 'user').strip()
                    password = str(args.get('password') or '').strip()
                    if not email or not password:
                        return self._json(400, {'ok': False, 'error': 'email and password are required'})
                    if role not in ('admin', 'manager', 'user', 'viewer'):
                        return self._json(400, {'ok': False, 'error': 'Invalid role. Use: admin/manager/user/viewer'})
                    result = create_user(name, email, password, role)
                    return self._json(200 if result.get('ok') else 400, result)

                # ── user_update ────────────────────────────────────────────
                elif action_type == 'user_update':
                    if not ai_perms.get('manage_users'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_users required'})
                    from backend.auth import update_user
                    email = str(args.get('email') or '').strip().lower()
                    if not email:
                        return self._json(400, {'ok': False, 'error': 'email is required'})
                    update_data = {k: v for k, v in (args.get('data') or args).items()
                                   if k in ('username', 'name', 'role', 'active') and k != 'email'}
                    result = update_user(email, update_data, requester_role='admin')
                    return self._json(200 if result.get('ok') else 400, result)

                # ── user_delete ────────────────────────────────────────────
                elif action_type == 'user_delete':
                    if not ai_perms.get('manage_users'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_users required'})
                    # Only admin role can delete users
                    if action_user.get('role') != 'admin':
                        return self._json(403, {'ok': False, 'error': 'Only admins can delete users'})
                    from backend.auth import delete_user
                    email = str(args.get('email') or '').strip().lower()
                    if not email:
                        return self._json(400, {'ok': False, 'error': 'email is required'})
                    result = delete_user(email, action_user.get('email', ''))
                    return self._json(200 if result.get('ok') else 400, result)

                # ── settings_read ──────────────────────────────────────────
                elif action_type == 'settings_read':
                    if not (ai_perms.get('manage_settings') or ai_perms.get('read_all')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_settings required'})
                    section = str(args.get('section') or 'all').lower()
                    result_data = {}
                    if section in ('all', 'ai'):
                        ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
                        try:
                            with open(ai_sf, 'r', encoding='utf-8') as _f:
                                ai_cfg = json.load(_f)
                        except (OSError, json.JSONDecodeError):
                            ai_cfg = {}
                        result_data['ai'] = ai_cfg
                    if section in ('all', 'general'):
                        with _lock:
                            store = _read_store()
                        sys_settings = store.get('zeralda-system-settings', {})
                        result_data['general'] = sys_settings
                    return self._json(200, {'ok': True, 'settings': result_data})

                # ── settings_update ────────────────────────────────────────
                elif action_type == 'settings_update':
                    if not ai_perms.get('manage_settings'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_settings required'})
                    section = str(args.get('section') or 'general').lower()
                    update  = args.get('data') or {}
                    if not isinstance(update, dict):
                        return self._json(400, {'ok': False, 'error': 'data must be a JSON object'})
                    if section == 'ai':
                        ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
                        try:
                            with open(ai_sf, 'r', encoding='utf-8') as _f:
                                existing = json.load(_f)
                        except (OSError, json.JSONDecodeError):
                            existing = {}

                        existing.update({k: v for k, v in update.items()
                                         if k in ('provider', 'huggingface_api_key', 'huggingface_model',
                                                  'features', 'role_permissions')})
                        with open(ai_sf, 'w', encoding='utf-8') as _f:
                            json.dump(existing, _f, ensure_ascii=False, indent=2)
                    elif section in ('general', 'company', 'system'):
                        with _lock:
                            store = _read_store()
                        sys_settings = store.get('zeralda-system-settings', {})
                        sys_settings.update(update)
                        store['zeralda-system-settings'] = sys_settings
                        _write_store(store)
                    elif section == 'module':
                        with _lock:
                            store = _read_store()
                        mod_settings = store.get('zeralda-module-settings', {})
                        mod_settings.update(update)
                        store['zeralda-module-settings'] = mod_settings
                        _write_store(store)
                    elif section == 'permissions':
                        if not ai_perms.get('manage_users'):
                            return self._json(403, {'ok': False, 'error': 'manage_users permission required to update role permissions'})
                        ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
                        try:
                            with open(ai_sf, 'r', encoding='utf-8') as _f:
                                existing = json.load(_f)
                        except (OSError, json.JSONDecodeError):
                            existing = {}
                        existing.setdefault('role_permissions', {})
                        existing['role_permissions'].update(update)
                        with open(ai_sf, 'w', encoding='utf-8') as _f:
                            json.dump(existing, _f, ensure_ascii=False, indent=2)
                    else:
                        return self._json(400, {'ok': False, 'error': f'Unknown section: {section}. Use: ai | general | company | system | module | permissions'})
                    return self._json(200, {'ok': True, 'updated': section})

                # ── store_read ─────────────────────────────────────────────
                elif action_type == 'store_read':
                    if not (ai_perms.get('read_all') or ai_perms.get('manage_data')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: read_all required'})
                    key = str(args.get('key') or '').strip()
                    limit = min(int(args.get('limit') or 100), 500)
                    search = str(args.get('search') or '').lower().strip()
                    # Security: block reads of system-managed keys (users, sessions,
                    # AI config, backups, multi-tenant state) — these may contain
                    # hashed passwords, salts, API keys, or other sensitive data.
                    if key and _is_protected_store_key(key):
                        log_structured('WARN', 'AI store_read blocked on protected key',
                                        action='ai_store_read_protected', key=key,
                                        initiator=(action_user or {}).get('email', '?'))
                        return self._json(403, {'ok': False,
                            'error': f'Key "{key}" is system-managed and cannot be read via store_read.',
                            'code': 'PROTECTED_KEY'})
                    with _lock:
                        store = _read_store()
                    if key:
                        value = store.get(key)
                        if value is None:
                            return self._json(404, {'ok': False, 'error': f'Key not found: {key}'})
                        if isinstance(value, list) and search:
                            value = [r for r in value if search in json.dumps(r, ensure_ascii=False).lower()]
                        if isinstance(value, list):
                            value = value[:limit]
                        return self._json(200, {'ok': True, 'key': key, 'data': value, 'count': len(value) if isinstance(value, list) else 1})
                    else:
                        # Filter out protected keys from the listing
                        safe_keys = [k for k in store.keys() if not _is_protected_store_key(k)]
                        return self._json(200, {'ok': True, 'available_keys': safe_keys, 'count': len(safe_keys)})

                # ── store_write ────────────────────────────────────────────
                elif action_type == 'store_write':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    key   = str(args.get('key') or '').strip()
                    value = args.get('value')
                    if not key:
                        return self._json(400, {'ok': False, 'error': 'key is required'})
                    # Security: block writes to system-managed keys (auth,
                    # settings, AI config, backups, multi-tenant state).
                    # These must go through their dedicated, permission-checked
                    # endpoints (e.g. settings_update, user_create).
                    if _is_protected_store_key(key):
                        log_structured('WARN', 'AI store_write blocked on protected key',
                                       action='ai_store_write_protected',
                                       key=key,
                                       initiator=(action_user or {}).get('email', '?'))
                        return self._json(403, {'ok': False, 'error': f'Key "{key}" is system-managed and cannot be written via store_write. Use the dedicated settings/user endpoint.', 'code': 'PROTECTED_KEY'})
                    with _lock:
                        store = _read_store()
                        store[key] = value
                        _write_store(store)
                    return self._json(200, {'ok': True, 'key': key})

                # ── store_append ───────────────────────────────────────────
                elif action_type == 'store_append':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    key    = str(args.get('key') or '').strip()
                    record = args.get('record') or {}
                    if not key:
                        return self._json(400, {'ok': False, 'error': 'key is required'})
                    if _is_protected_store_key(key):
                        log_structured('WARN', 'AI store_append blocked on protected key',
                                       action='ai_store_append_protected',
                                       key=key,
                                       initiator=(action_user or {}).get('email', '?'))
                        return self._json(403, {'ok': False, 'error': f'Key "{key}" is system-managed and cannot be appended to via store_append.', 'code': 'PROTECTED_KEY'})
                    with _lock:
                        store = _read_store()
                        arr = store.get(key, [])
                        if not isinstance(arr, list):
                            arr = []
                        # Sequential numeric ID (consistent with client-side getNextProductId)
                        _next_id = 1
                        for _ex in arr:
                            try:
                                _ex_id = int(_ex.get('id', 0))
                                if _ex_id >= _next_id:
                                    _next_id = _ex_id + 1
                            except (ValueError, TypeError):
                                pass
                        record.setdefault('id', _next_id)
                        record.setdefault('createdAt', datetime.datetime.now().isoformat())
                        arr.append(record)
                        store[key] = arr
                        _write_store(store)
                    return self._json(200, {'ok': True, 'key': key, 'id': record.get('id'), 'total': len(arr)})

                # ── store_delete_record ────────────────────────────────────
                elif action_type == 'store_delete_record':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    key       = str(args.get('key') or '').strip()
                    record_id = str(args.get('id') or '').strip()
                    name      = str(args.get('name') or '').lower().strip()
                    if not key or (not record_id and not name):
                        return self._json(400, {'ok': False, 'error': 'key and id (or name) are required'})
                    if _is_protected_store_key(key):
                        log_structured('WARN', 'AI store_delete_record blocked on protected key',
                                       action='ai_store_delete_protected',
                                       key=key,
                                       initiator=(action_user or {}).get('email', '?'))
                        return self._json(403, {'ok': False, 'error': f'Key "{key}" is system-managed and cannot be modified via store_delete_record.', 'code': 'PROTECTED_KEY'})
                    with _lock:
                        store = _read_store()
                        arr = store.get(key, [])
                        before = len(arr) if isinstance(arr, list) else 0
                        if isinstance(arr, list):
                            arr = [r for r in arr if not (
                                (record_id and (str(r.get('id', '')) == record_id or str(r.get('code', '')) == record_id or str(r.get('sku', '')) == record_id or str(r.get('reference', '')) == record_id or str(r.get('_id', '')) == record_id)) or
                                (name and str(r.get('name', '')).lower() == name)
                            )]
                        store[key] = arr
                        _write_store(store)
                    return self._json(200, {'ok': True, 'key': key, 'deleted': before - len(arr)})

                # ── store_update_record ────────────────────────────────────
                elif action_type == 'store_update_record':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    key       = str(args.get('key') or '').strip()
                    record_id = str(args.get('id') or '').strip()
                    name      = str(args.get('name') or '').lower().strip()
                    updates   = args.get('record') or args.get('data') or {}
                    if not key or not updates:
                        return self._json(400, {'ok': False, 'error': 'key and record/data are required'})
                    if _is_protected_store_key(key):
                        log_structured('WARN', 'AI store_update_record blocked on protected key',
                                       action='ai_store_update_protected',
                                       key=key,
                                       initiator=(action_user or {}).get('email', '?'))
                        return self._json(403, {'ok': False, 'error': f'Key "{key}" is system-managed and cannot be modified via store_update_record.', 'code': 'PROTECTED_KEY'})
                    with _lock:
                        store = _read_store()
                        arr = store.get(key, [])
                        updated = 0
                        if isinstance(arr, list):
                            for i, r in enumerate(arr):
                                match = (record_id and (str(r.get('id', '')) == record_id or str(r.get('code', '')) == record_id or str(r.get('sku', '')) == record_id or str(r.get('reference', '')) == record_id or str(r.get('_id', '')) == record_id)) or \
                                        (name and str(r.get('name', '')).lower() == name)
                                if match:
                                    arr[i] = dict(r, **updates)
                                    updated += 1
                        store[key] = arr
                        _write_store(store)
                    return self._json(200, {'ok': True, 'key': key, 'updated': updated})

                # ── report_summary ─────────────────────────────────────────
                elif action_type == 'report_summary':
                    if not (ai_perms.get('manage_reports') or ai_perms.get('read_all')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_reports required'})
                    with _lock:
                        store = _read_store()
                    summary = {}
                    for key, label in [
                        ('employees-data', 'employees'), ('customers-data', 'customers'),
                        ('suppliers-data', 'suppliers'), ('invoices-data', 'invoices'),
                        ('products-data', 'products'), ('tenders-data', 'tenders'),
                        ('consultations-data', 'consultations'), ('hr-leaves', 'leaves'),
                        ('finance-transactions', 'transactions'), ('zeralda-services', 'services'),
                    ]:
                        val = store.get(key, [])
                        summary[label] = len(val) if isinstance(val, list) else (1 if val else 0)
                    return self._json(200, {'ok': True, 'summary': summary})

                # ── Generic module actions (customers, suppliers, employees, products, etc.)
                elif action_type == 'module_list':
                    if not (ai_perms.get('read_all') or ai_perms.get('manage_data')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: read_all required'})
                    module = str(args.get('module') or '').strip().lower()
                    key = MODULE_MAP.get(module, module + '-data') if not module.startswith('zeralda-') else module
                    with _lock:
                        store = _read_store()
                    company_id = _resolve_company_id(args, store)
                    scoped_key = key + '::' + company_id if company_id else key
                    limit = min(int(args.get('limit') or 50), 200)
                    search = str(args.get('search') or '').lower().strip()
                    records = store.get(scoped_key, [])
                    if not isinstance(records, list):
                        records = []
                    if search:
                        records = [r for r in records if search in json.dumps(r, ensure_ascii=False).lower()]
                    return self._json(200, {'ok': True, 'module': module, 'key': key, 'records': records[:limit], 'count': len(records)})

                elif action_type == 'module_append':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    module = str(args.get('module') or '').strip().lower()
                    record = args.get('record') or args.get('data') or {}
                    if not isinstance(record, dict):
                        record = {}
                    if not module:
                        return self._json(400, {'ok': False, 'error': 'module is required'})
                    # Security: strip fields not in the per-module whitelist and
                    # any reserved/system fields (id, createdAt, companyId, ...).
                    # This prevents prompt-injection from writing arbitrary keys
                    # or hijacking record identity.
                    _orig_keys = set(record.keys())
                    record = _sanitize_ai_record(module, record)
                    _dropped_keys = sorted(_orig_keys - set(record.keys()))
                    if _dropped_keys:
                        log_structured('WARN', 'AI module_append dropped non-whitelisted fields',
                                       action='ai_module_append_sanitized',
                                       module=module,
                                       dropped=','.join(_dropped_keys))
                    if not record:
                        return self._json(400, {'ok': False, 'error': 'record contains no whitelisted fields for module ' + module})
                    key = MODULE_MAP.get(module, module + '-data')
                    with _lock:
                        store = _read_store()
                        company_id = _resolve_company_id(args, store)
                        scoped_key = key + '::' + company_id if company_id else key
                        arr = store.get(scoped_key, [])
                        if not isinstance(arr, list):
                            arr = []
                        # Deduplication: skip if record already exists (generic for all modules)
                        _DEDUP_FIELDS_SRV = ['name', 'code', 'number', 'invoiceNumber', 'email', 'phone', 'reference', 'ref', 'barcode', 'sku', 'employeeId', 'nationalId']
                        _rec_vals = {}
                        for _f in _DEDUP_FIELDS_SRV:
                            _v = record.get(_f)
                            if _v is not None and str(_v).strip() != '':
                                _rec_vals[_f] = str(_v).strip().lower()
                        for _ex in arr:
                            if not isinstance(_ex, dict):
                                continue
                            _matched = False
                            for _f, _rv in _rec_vals.items():
                                _ev = _ex.get(_f)
                                if _ev is not None and str(_ev).strip().lower() == _rv:
                                    _matched = True
                                    break
                            if _matched:
                                return self._json(200, {'ok': True, 'module': module, 'id': _ex.get('id', ''), 'total': len(arr), 'dedup': True, 'message': f'Record already exists (duplicate {_f})'})
                            if record.get('id') and str(_ex.get('id') or '') == str(record.get('id')):
                                return self._json(200, {'ok': True, 'module': module, 'id': _ex.get('id', ''), 'total': len(arr), 'dedup': True, 'message': 'Record already exists (duplicate id)'})
                        # Sequential numeric ID (consistent with client-side getNextProductId)
                        _next_id = 1
                        for _ex in arr:
                            try:
                                _ex_id = int(_ex.get('id', 0))
                                if _ex_id >= _next_id:
                                    _next_id = _ex_id + 1
                            except (ValueError, TypeError):
                                pass
                        record.setdefault('id', _next_id)
                        # Auto-generate product code for products module if AI didn't provide one
                        if module == 'products' and not record.get('code'):
                            record['code'] = 'PRD-' + str(_next_id).zfill(3)
                        record.setdefault('createdAt', datetime.datetime.now().isoformat())
                        arr.append(record)
                        store[scoped_key] = arr
                        result = {'ok': True, 'module': module, 'id': record.get('id'), 'total': len(arr)}
                        _add_ai_memory(store, 'module_append', args, result, company_id)
                        _write_store(store)
                    return self._json(200, result)

                elif action_type == 'module_update_record':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    module = str(args.get('module') or '').strip().lower()
                    record_id = str(args.get('id') or '').strip()
                    name = str(args.get('name') or '').lower().strip()
                    updates = args.get('record') or args.get('data') or {}
                    if not module or not updates:
                        return self._json(400, {'ok': False, 'error': 'module and record/data are required'})
                    # Security: only allow whitelisted fields to be updated.
                    updates = _sanitize_ai_record(module, updates)
                    if not updates:
                        return self._json(400, {'ok': False, 'error': 'no whitelisted fields to update for module ' + module})
                    key = MODULE_MAP.get(module, module + '-data')
                    with _lock:
                        store = _read_store()
                        company_id = _resolve_company_id(args, store)
                        scoped_key = key + '::' + company_id if company_id else key
                        arr = store.get(scoped_key, [])
                        updated = 0
                        if isinstance(arr, list):
                            for i, r in enumerate(arr):
                                match = (record_id and (str(r.get('id', '')) == record_id or str(r.get('code', '')) == record_id or str(r.get('sku', '')) == record_id or str(r.get('reference', '')) == record_id or str(r.get('_id', '')) == record_id)) or \
                                        (name and str(r.get('name', '')).lower() == name)
                                if match:
                                    arr[i] = dict(r, **updates)
                                    updated += 1
                        store[scoped_key] = arr
                        _write_store(store)
                    return self._json(200, {'ok': True, 'module': module, 'updated': updated})

                elif action_type == 'module_bulk_update':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    module = str(args.get('module') or '').strip().lower()
                    updates = args.get('updates') or args.get('record') or {}
                    filter_field = str(args.get('filterField') or '').strip()
                    filter_value = args.get('filterValue')
                    if not module or not updates:
                        return self._json(400, {'ok': False, 'error': 'module and updates are required'})
                    # Security: only whitelisted fields may be bulk-updated.
                    updates = _sanitize_ai_record(module, updates)
                    if not updates:
                        return self._json(400, {'ok': False, 'error': 'no whitelisted fields to update for module ' + module})
                    # Safety: a bulk update with no filter would touch EVERY record
                    # in the module. Require an explicit confirmation flag and
                    # cap the number of affected records to prevent accidental
                    # mass destruction (e.g. zeroing all inventory quantities).
                    if not filter_field:
                        if not bool(args.get('confirmAll')):
                            return self._json(400, {
                                'ok': False,
                                'error': 'module_bulk_update without a filterField affects ALL records in the module. '
                                         'Re-send with "confirmAll": true to acknowledge this bulk operation.',
                                'code': 'BULK_UPDATE_NEEDS_CONFIRM'
                            })
                    key = MODULE_MAP.get(module, module + '-data')
                    with _lock:
                        store = _read_store()
                        company_id = _resolve_company_id(args, store)
                        scoped_key = key + '::' + company_id if company_id else key
                        arr = store.get(scoped_key, [])
                        updated = 0
                        # Safety cap: never bulk-update more than 5000 records in
                        # a single call. This stops a runaway / injected action
                        # from rewriting the entire store in one shot.
                        _BULK_CAP = 5000
                        if isinstance(arr, list):
                            for i, r in enumerate(arr):
                                if updated >= _BULK_CAP:
                                    break
                                if filter_field:
                                    fv = r.get(filter_field)
                                    if filter_value is not None and str(fv) != str(filter_value):
                                        continue
                                arr[i] = dict(r, **updates)
                                updated += 1
                        store[scoped_key] = arr
                        _write_store(store)
                    log_structured('WARN', 'AI module_bulk_update executed',
                                   action='ai_module_bulk_update',
                                   module=module, updated=updated,
                                   filter_field=filter_field or '<ALL>',
                                   initiator=(action_user or {}).get('email', '?'))
                    return self._json(200, {'ok': True, 'module': module, 'updated': updated, 'capped': updated >= _BULK_CAP})

                elif action_type == 'module_delete_record':
                    if not ai_perms.get('manage_data'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_data required'})
                    module = str(args.get('module') or '').strip().lower()
                    record_id = str(args.get('id') or '').strip()
                    name = str(args.get('name') or '').lower().strip()
                    if not module or (not record_id and not name):
                        return self._json(400, {'ok': False, 'error': 'module and id (or name) are required'})
                    key = MODULE_MAP.get(module, module + '-data')
                    with _lock:
                        store = _read_store()
                        company_id = _resolve_company_id(args, store)
                        scoped_key = key + '::' + company_id if company_id else key
                        arr = store.get(scoped_key, [])
                        before = len(arr) if isinstance(arr, list) else 0
                        if isinstance(arr, list):
                            arr = [r for r in arr if not (
                                (record_id and (str(r.get('id', '')) == record_id or str(r.get('code', '')) == record_id or str(r.get('sku', '')) == record_id or str(r.get('reference', '')) == record_id or str(r.get('_id', '')) == record_id)) or
                                (name and str(r.get('name', '')).lower() == name)
                            )]
                        store[scoped_key] = arr
                        _write_store(store)
                    return self._json(200, {'ok': True, 'module': module, 'deleted': before - len(arr)})

                # ── company_read / company_update ───────────────────────────
                elif action_type == 'company_read':
                    if not (ai_perms.get('read_all') or ai_perms.get('manage_settings')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: read_all required'})
                    with _lock:
                        store = _read_store()
                    # RADICAL FIX: read from zeralda-settings.companies (canonical)
                    _s = store.get('zeralda-settings', {})
                    companies = _s.get('companies') if isinstance(_s, dict) else None
                    if not isinstance(companies, list):
                        companies = store.get('zeralda-companies', [])
                    if isinstance(companies, dict):
                        companies = [companies]
                    return self._json(200, {'ok': True, 'companies': companies if isinstance(companies, list) else []})

                elif action_type == 'company_update':
                    if not ai_perms.get('manage_settings'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_settings required'})
                    updates = args.get('data') or {}
                    company_id = str(args.get('id') or '').strip()
                    name = str(args.get('name') or '').lower().strip()
                    with _lock:
                        store = _read_store()
                        # RADICAL FIX: read/write zeralda-settings.companies (canonical)
                        _s = store.get('zeralda-settings', {})
                        if not isinstance(_s, dict):
                            _s = {}
                        companies = _s.get('companies', [])
                        if isinstance(companies, dict):
                            companies = [companies]
                        if not isinstance(companies, list):
                            companies = []
                        updated = 0
                        for i, c in enumerate(companies):
                            match = (company_id and str(c.get('id', '')) == company_id) or \
                                    (name and str(c.get('name', '')).lower() == name) or \
                                    (not company_id and not name and i == 0)
                            if match:
                                companies[i] = dict(c, **updates)
                                updated += 1
                        _s['companies'] = companies
                        store['zeralda-settings'] = _s
                        # Keep legacy shadow in sync
                        store['zeralda-companies'] = companies
                        _write_store(store)
                    return self._json(200, {'ok': True, 'updated': updated})

                # ── company_create ──────────────────────────────────────────
                elif action_type == 'company_create':
                    if not ai_perms.get('manage_settings'):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_settings required'})
                    data = args.get('data') or args.get('record') or {}
                    if not isinstance(data, dict):
                        return self._json(400, {'ok': False, 'error': 'data must be a JSON object'})
                    _COMPANY_CREATE_WHITELIST = {
                        'name', 'siege', 'address', 'phone', 'email', 'website',
                        'rc', 'artNumber', 'nif', 'nis', 'ag', 'nin', 'ai',
                        'city', 'country', 'vat', 'bankName', 'bankAccount',
                        'rib', 'capital', 'logo', 'notes', 'currency',
                    }
                    company = {k: v for k, v in data.items() if k in _COMPANY_CREATE_WHITELIST}
                    name = str(company.get('name') or '').strip()
                    if not name:
                        return self._json(400, {'ok': False, 'error': 'company name is required'})
                    import uuid as _uuid
                    company_id = 'company_' + _uuid.uuid4().hex[:8]
                    company['id'] = company_id
                    company['createdAt'] = datetime.datetime.now().isoformat()
                    company['updatedAt'] = company['createdAt']
                    with _lock:
                        store = _read_store()
                        # RADICAL FIX: read/write zeralda-settings.companies (canonical)
                        _s = store.get('zeralda-settings', {})
                        if not isinstance(_s, dict):
                            _s = {}
                        companies = _s.get('companies', [])
                        if isinstance(companies, dict):
                            companies = [companies]
                        if not isinstance(companies, list):
                            companies = []
                        name_lower = name.lower()
                        for c in companies:
                            if str(c.get('name', '')).lower() == name_lower:
                                return self._json(200, {'ok': True, 'id': c.get('id', ''),
                                        'total': len(companies), 'dedup': True,
                                        'message': 'Company already exists (duplicate name)'})
                        companies.append(company)
                        _s['companies'] = companies
                        store['zeralda-settings'] = _s
                        # Keep legacy shadow in sync
                        store['zeralda-companies'] = companies
                        _write_store(store)
                    return self._json(200, {'ok': True, 'id': company_id, 'total': len(companies),
                            'message': 'Company created successfully'})

                # ── backup_create ──────────────────────────────────────────
                elif action_type == 'backup_create':
                    if not (ai_perms.get('manage_settings') or ai_perms.get('read_all')):
                        return self._json(403, {'ok': False, 'error': 'Permission denied: manage_settings required'})
                    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
                    backup_name = str(args.get('name') or f'ai_backup_{timestamp}').strip()
                    backup_key = f'backup-{backup_name}'
                    with _lock:
                        store = _read_store()
                        store[backup_key] = dict(store)
                        _write_store(store)
                    return self._json(200, {'ok': True, 'backup_name': backup_name, 'key': backup_key})

                else:
                    return self._json(400, {'ok': False, 'error': f'Unknown action: {action_type}. Available: user_list, user_create, user_update, user_delete, settings_read, settings_update, store_read, store_write, store_append, store_delete_record, store_update_record, report_summary, module_list, module_append, module_bulk_update, module_update_record, module_delete_record, company_read, company_update, company_create, backup_create'})

            except Exception as exc:
                import traceback
                traceback.print_exc()
                print(f"[AI ACTION ERROR] action={action_type}, args={json.dumps(args, ensure_ascii=False)[:500]}, error={exc}")
                return self._json(500, {'ok': False, 'error': str(exc)})

        # POST /api/ai/company-search — search company data with AI
        if path == '/api/ai/company-search' and self.command == 'POST':
            data = self._read_body()
            query   = str(data.get('query') or '').strip()[:2000]
            context_data = data.get('context_data') or {}   # localStorage data from client
            history  = data.get('history') or []             # previous messages [{role,content}]

            if not query:
                return self._json(400, {'ok': False, 'error': 'query is required'})

            # ── Collect server-side store data ────────────────────────────
            server_chunks = []
            store = {}
            try:
                with _lock:
                    store = _read_store()
                server_tags = (
                    'purchasing', 'services', 'supplier', 'product',
                    'customer', 'invoice', 'sale', 'finance', 'tender',
                    'consult', 'inventory', 'employee', 'payroll', 'crm'
                )
                for k, v in store.items():
                    if any(tag in k.lower() for tag in server_tags):
                        try:
                            if isinstance(v, list):
                                total = len(v)
                                sample = v[:25]
                                note = f' (عرض 25 من {total})' if total > 25 else ''
                                chunk = f'[SERVER:{k}] [{total} سجل{note}]\n' + json.dumps(sample, ensure_ascii=False)[:8000]
                            else:
                                chunk = f'[SERVER:{k}]\n' + json.dumps(v, ensure_ascii=False)[:8000]
                            server_chunks.append(chunk)
                        except Exception:
                            pass
            except Exception:
                pass

            # ── Read server-side users (data/users.json) ─────────────────
            try:
                users_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'users.json')
                if os.path.exists(users_path):
                    with open(users_path, 'r', encoding='utf-8') as _uf:
                        raw_users = json.load(_uf)
                    safe_users = [
                        {'email': e, 'role': u.get('role', ''), 'name': u.get('name', ''),
                         'active': u.get('active', True), 'created_at': u.get('created_at', '')}
                        for e, u in raw_users.items()
                    ] if isinstance(raw_users, dict) else []
                    if safe_users:
                        server_chunks.append(f'[حسابات المستخدمين (نظام)]\n{json.dumps(safe_users, ensure_ascii=False)[:6000]}')
            except Exception:
                pass

            # ── Build context string from client localStorage data ────────
            client_chunks = []
            DATA_LABELS = {
                'employees-data':          'الموظفون',
                'payroll-data':            'الرواتب والمدفوعات',
                'products-data':           'المنتجات/السلع',
                'inventory-categories':    'تصنيفات المخزون',
                'stock-movements':         'حركات المخزون',
                'customers-data':          'العملاء/CRM',
                'invoices-data':           'الفواتير',
                'proformas-data':          'عروض الأسعار',
                'suppliers-data':          'الموردون',
                'purchases-data':          'المشتريات',
                'purchase-orders-data':    'أوامر الشراء',
                'consultations-data':      'مشاريع الاستشارة',
                'tenders-data':            'المناقصات',
                'zeralda-services':        'الخدمات المقدمة',
                'zeralda-services-master': 'قائمة الخدمات',
                'crm-opportunities':       'فرص البيع (CRM)',
                'crm-contacts':            'جهات اتصال CRM',
                'finance-transactions':    'المعاملات المالية',
                'accounting-entries':      'القيود المحاسبية',
                'sales-data':              'المبيعات',
                'hr-leaves':               'إجازات الموظفين',
                'zeralda-companies':       'الشركات',
                'zeralda-users':           'حسابات المستخدمين',
                'zeralda-roles':           'الأدوار والصلاحيات',
                'zeralda-active-company':  'الشركة النشطة حالياً',
                'zeralda-backup-history':  'سجل النسخ الاحتياطية',
                'zeralda-integrations':    'إعدادات التكاملات',
                'zeralda-module-settings': 'إعدادات الوحدات',
                'zeralda-purchasing-data': 'بيانات المشتريات (الشركة)',
            }
            for k, label in DATA_LABELS.items():
                raw = context_data.get(k)
                if raw:
                    try:
                        if isinstance(raw, list):
                            total = len(raw)
                            sample = raw[:25]
                            note = f' (عرض 25 من {total})' if total > 25 else ''
                            chunk = f'[{label}] [{total} سجل{note}]\n' + json.dumps(sample, ensure_ascii=False)[:8000]
                        else:
                            chunk = f'[{label}]\n' + json.dumps(raw, ensure_ascii=False)[:8000]
                        client_chunks.append(chunk)
                    except Exception:
                        pass

            # ── Extract companies/users/roles from zeralda-system-settings ─
            sys_settings = context_data.get('zeralda-system-settings')
            if isinstance(sys_settings, dict):
                for field, label in [('companies', 'الشركات (من الإعدادات)'),
                                     ('users',     'المستخدمون (من الإعدادات)'),
                                     ('roles',     'الأدوار (من الإعدادات)')]:
                    val = sys_settings.get(field)
                    if val:
                        try:
                            client_chunks.append(f'[{label}]\n{json.dumps(val, ensure_ascii=False)[:6000]}')
                        except Exception:
                            pass

            all_context = '\n\n'.join(server_chunks + client_chunks)

            if not all_context:
                all_context = '(لا توجد بيانات متاحة حالياً في قاعدة البيانات)'

            system_prompt = (
                "أنت Zeralda — مساعد ذكي متقدم مدمج في نظام Zeralda ERP.\n"
                "لديك صلاحية الوصول الكاملة لجميع بيانات الشركة المقدمة أدناه، وصلاحيات إدارية كاملة.\n"
                "\nقدراتك:\n"
                "  • تحليل وتلخيص أي بيانات من الشركة\n"
                "  • رصد الاتجاهات والمخاطر والفرص في البيانات\n"
                "  • إجراء حسابات: رواتب، ضرائب، هوامش الربح، مؤشرات KPI، الميزانيات\n"
                "  • صياغة وثائق احترافية: عقود، تقارير، إيميلات، مذكرات\n"
                "\nمعالجة الملفات المرفوعة:\n"
                "  • عند استخراج بيانات من ملفات (فواتير، عروض أسعار، Excel)، أضف المنتجات/الموردين/العملاء مباشرة للنظام\n"
                "  • استخرج معلومات المنتج (الاسم، السعر، الكمية، الوحدة) وأضفها كسجلات منتجات\n"
                "  • استخرج معلومات المورد (الاسم، الهاتف، العنوان، البريد) وأضفها كسجلات موردين\n"
                "  • استخرج معلومات العميل وأضفها كسجلات عملاء\n"
                "  • عند إضافة فاتورة، يجب أيضاً إضافة كل منتجات الفاتورة إلى المخزون (products) باستخدام module_append لكل منتج\n"
                "  • كل منتج في الفاتورة يجب أن يُضاف كسجل منفصل في products بالاسم والسعر والكمية\n"
                "  • بعد الإضافة، أكد للمستخدم ما تم إضافته مع أرقام السجلات\n"
                "\nقواعد الإجابة:\n"
                "  - كن مباشراً، مفصلاً، وقابلاً للتنفيذ\n"
                "  - عند توفر البيانات، استشهد بأرقام وأسماء محددة\n"
                "  - رتب النتائج في قوائم أو جداول واضحة\n"
                "  - إذا لم تجد معلومات كافية، قل ذلك وأوضح ما يلزم من بيانات\n"
                "  - احترم العملة المحلية في الأرقام والأسعار\n"
                "  - أجب بالعربية الفصحى أو الفرنسية أو الإنجليزية حسب لغة السؤال\n"
                f"\n--- بيانات الشركة ---\n{all_context[:8000]}\n--- نهاية البيانات ---\n"
                "\nإدارة البيانات (صلاحيات الأدمن):\n"
                "  • إضافة منتجات: [SRVEXEC:{\"action\":\"module_append\",\"args\":{\"module\":\"products\",\"record\":{...}}}] \n"
                "  • إضافة موردين: [SRVEXEC:{\"action\":\"module_append\",\"args\":{\"module\":\"suppliers\",\"record\":{...}}}]\n"
                "  • إضافة عملاء: [SRVEXEC:{\"action\":\"module_append\",\"args\":{\"module\":\"customers\",\"record\":{...}}}]\n"
                "  • إضافة فواتير: [SRVEXEC:{\"action\":\"module_append\",\"args\":{\"module\":\"invoices\",\"record\":{...}}}]\n"
                "  • إضافة موظفين: [SRVEXEC:{\"action\":\"module_append\",\"args\":{\"module\":\"employees\",\"record\":{...}}}]\n"
                "  • تعديل سجلات: [SRVEXEC:{\"action\":\"module_update_record\",\"args\":{\"module\":\"...\",\"id\":\"...\",\"record\":{...}}}]\n"
                "  • تعديل جماعي (تحديث كل السجلات): [SRVEXEC:{\"action\":\"module_bulk_update\",\"args\":{\"module\":\"products\",\"updates\":{\"quantity\":0}}}]\n"
                "  • حذف سجلات: [SRVEXEC:{\"action\":\"module_delete_record\",\"args\":{\"module\":\"...\",\"id\":\"...\"}}]\n"
                "  • عرض قائمة سجلات: [SRVEXEC:{\"action\":\"module_list\",\"args\":{\"module\":\"...\"}}]\n"
                "  • تصفير كميات المخزون: [SRVEXEC:{\"action\":\"module_bulk_update\",\"args\":{\"module\":\"products\",\"updates\":{\"quantity\":0}}}]\n"
                "\nقواعد الإضافة (مهم جداً):\n"
                "  - عند طلب المستخدم إضافة أي سجل (منتج، عميل، مورد، موظف، فاتورة)، يجب إخراج وسم [SRVEXEC:...] في نهاية الرسالة\n"
                "  - إجراءات module_append تُنفذ تلقائياً دون الحاجة لتأكيد المستخدم\n"
                "  - لا تستخدم [EXEC:...] لإضافة السجلات، استخدم [SRVEXEC:...] مع module_append فقط\n"
                "  - لا تقل 'تمت الإضافة' بدون إخراج وسم [SRVEXEC:...] فعلياً\n"
                "  - عند اقتراح إجراء، استخدم تنسيق [SRVEXEC:{...}] ليتم تنفيذه تلقائياً\n"
                "  - لتصفير كميات المخزون أو تعديل جماعي، استخدم module_bulk_update وليس module_append\n"
                "  - module_bulk_update يحدّث كل السجلات في الوحدة دفعة واحدة، استخدمه للعمليات الجماعية\n"
            )

            # Build messages with history
            api_messages = []
            for m in (history or []):
                if isinstance(m, dict) and m.get('role') in ('user', 'model', 'assistant'):
                    api_messages.append({'role': m['role'], 'content': str(m.get('content', ''))[:4000]})
            api_messages.append({'role': 'user', 'content': query})

            if len(api_messages) > 20:
                api_messages = api_messages[-20:]

            try:
                result = _ai_chat(api_messages, system_prompt=system_prompt)
                result['searched_keys'] = list(DATA_LABELS.keys()) + [k for k in store.keys() if any(t in k for t in ('purchasing','services','supplier','product','customer'))]
                return self._json(200, result)
            except Exception as exc:
                return self._json(500, {'ok': False, 'error': str(exc)})

        # POST /api/ai/bill-review
        if path == '/api/ai/bill-review' and self.command == 'POST':
            data = self._read_body()
            bill_text = str(data.get('text') or data.get('content') or '')
            file_b64 = str(data.get('fileBase64') or '')
            mime_type = str(data.get('mimeType') or 'application/pdf').lower().strip()
            file_name = str(data.get('fileName') or '').strip()

            # If a file is provided, extract text from it (PDF text layer or AI vision)
            if file_b64 and not bill_text:
                try:
                    from backend.ai_file_processor import process_file_for_analysis
                    ocr_engine = 'auto'
                    try:
                        _ai_cfg_path = os.path.join(DATA_DIR, 'ai_settings.json')
                        with open(_ai_cfg_path, 'r', encoding='utf-8-sig') as f:
                            _ai_cfg = json.load(f)
                        ocr_engine = str(_ai_cfg.get('ocr_engine', 'auto')).strip().lower()
                        if ocr_engine not in ('auto', 'tesseract', 'ai'):
                            ocr_engine = 'auto'
                    except Exception:
                        pass
                    extract_result = process_file_for_analysis(
                        file_b64, mime_type, file_name,
                        analysis_type='general', language='ara+fra+eng',
                        ocr_engine=ocr_engine
                    )
                    if extract_result.get('ok'):
                        bill_text = str(extract_result.get('text') or '')
                    else:
                        return self._json(200, {'ok': True,
                            'reply': f"تعذرت قراءة الملف: {extract_result.get('error', '?')[:200]}",
                            'text': '', 'review': ''})
                except Exception as extract_exc:
                    return self._json(500, {'ok': False, 'error': f'File extraction failed: {extract_exc}'})

            bill_text = bill_text[:12000]
            if not bill_text.strip():
                return self._json(200, {'ok': True,
                    'reply': 'لم يتم توفير نص الفاتورة أو ملف. يرجى إرسال نص الفاتورة أو رفع ملف PDF/صورة.',
                    'text': '', 'review': ''})

            try:
                prompt = (
                    "Review this bill/invoice text and provide a structured analysis:\n"
                    "1. Summarize key details (vendor name, total amount, date, line items).\n"
                    "2. Flag any anomalies (unusual charges, missing info, discrepancies, calculation errors).\n"
                    "3. Provide a confidence assessment.\n\n"
                    f"Document text:\n{bill_text}"
                )
                result = _ai_chat([{"role": "user", "content": prompt}])
                # Include the extracted text in the response so the frontend can display it
                result['text'] = bill_text
                result['review'] = result.get('reply', '')
                return self._json(200, result)
            except Exception as exc:
                return self._json(500, {'ok': False, 'error': str(exc)})

        # GET /api/ocr/status — Tesseract readiness + installed languages
        if path == '/api/ocr/status' and self.command == 'GET':
            try:
                from backend.ocr_service import get_ocr_status
                status = get_ocr_status()
            except Exception as exc:
                status = {'ok': False, 'tesseract_ready': False, 'details': str(exc)}

            tesseract_cmd = os.environ.get('TESSERACT_CMD', '')
            tessdata_prefix = os.environ.get('TESSDATA_PREFIX', '')

            # List installed language packs
            langs = []
            try:
                import pytesseract as _tess
                langs = _tess.get_languages()
            except Exception:
                pass

            return self._json(200, {
                **status,
                'tesseract_cmd': tesseract_cmd or '(auto-detected from PATH)',
                'tessdata_prefix': tessdata_prefix or '(default)',
                'installed_languages': langs,
            })

        # GET /api/ocr/languages — list installed Tesseract language packs
        if path == '/api/ocr/languages' and self.command == 'GET':
            langs = []
            error = None
            try:
                import pytesseract as _tess
                from backend.ocr_service import _configure_tesseract_cmd
                _configure_tesseract_cmd()
                langs = _tess.get_languages()
            except Exception as exc:
                error = str(exc)
            return self._json(200, {
                'ok': bool(langs),
                'languages': langs,
                'error': error
            })

        # POST /api/ocr/extract  — OCR (+ optional assistant AI analysis)
        if path == '/api/ocr/extract' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated — allowed any
            # network-reachable caller to trigger costly AI provider calls.
            if not self._require_auth():
                return
            data = self._read_body()
            file_b64 = str(data.get('fileBase64') or '')
            mime_type = str(data.get('mimeType') or 'image/jpeg').lower().strip()
            file_name = str(data.get('fileName') or '').strip()
            lang = str(data.get('lang') or 'ara+fra+eng').strip()
            ai_prompt = str(data.get('aiPrompt') or data.get('prompt') or '').strip()
            ai_system_prompt = str(data.get('aiSystemPrompt') or '').strip()
            use_ai = bool(data.get('useAI')) or bool(ai_prompt)
            if not file_b64:
                return self._json(400, {'ok': False, 'error': 'fileBase64 is required'})
            try:
                from backend.ocr_service import extract_text_from_payload
                result = extract_text_from_payload(file_b64, mime_type, lang, file_name=file_name)

                if use_ai and result.get('ok'):
                    text_for_ai = str(result.get('text') or '').strip()
                    if text_for_ai:
                        default_prompt = (
                            'Analyze the following OCR text and return a concise structured JSON with key fields, '\
                            'detected entities, and a short summary.'
                        )
                        ai_user_prompt = f"{(ai_prompt or default_prompt)}\n\nOCR text:\n{text_for_ai[:12000]}"
                        ai_result = _ai_chat(
                            [{'role': 'user', 'content': ai_user_prompt}],
                            system_prompt=ai_system_prompt or None
                        )
                        result['ai'] = ai_result

                return self._json(200, result)
            except Exception as exc:
                return self._json(500, {'ok': False, 'error': str(exc)})

        # POST /api/ai/invoice-extract  — OCR + AI structured extraction via ai_file_processor
        if path == '/api/ai/invoice-extract' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated.
            if not self._require_auth():
                return
            data = self._read_body()
            
            # Check for body size error
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {'ok': False, 'error': 'File too large (max 100MB). Please use a smaller file.'})
            
            file_b64 = str(data.get('fileBase64') or '')
            mime_type = str(data.get('mimeType') or '').lower().strip()
            file_name = str(data.get('fileName') or '').strip()
            plain_text = str(data.get('text') or data.get('content') or '').strip()

            # Step 1: Extract text — Tesseract first (local, free, fast), then AI Vision fallback
            if file_b64:
                try:
                    from backend.ocr_service import extract_text_from_payload
                    ocr_result = extract_text_from_payload(file_b64, mime_type or 'application/octet-stream', 'ara+fra+eng', file_name=file_name)
                    source_text = str(ocr_result.get('text') or '').strip()
                    ocr_engine_used = ocr_result.get('engine', 'tesseract')

                    if not source_text:
                        proc_error = str(ocr_result.get('error') or 'OCR returned no text.')
                        print(f'[INVOICE-EXTRACT] Tesseract OCR failed: error={proc_error[:300]}')
                        # Fallback: use process_file_for_analysis which has AI Vision support
                        print(f'[INVOICE-EXTRACT] Falling back to AI Vision (process_file_for_analysis)...')
                        try:
                            from backend.ai_file_processor import process_file_for_analysis
                            # Read OCR engine setting
                            _ocr_engine = 'auto'
                            try:
                                _ai_settings_path = os.path.join(DATA_DIR, 'ai_settings.json')
                                with open(_ai_settings_path, 'r', encoding='utf-8-sig') as f:
                                    _ai_cfg = json.load(f)
                                _ocr_engine = str(_ai_cfg.get('ocr_engine', 'auto')).strip().lower()
                                if _ocr_engine not in ('auto', 'tesseract', 'ai'):
                                    _ocr_engine = 'auto'
                            except Exception:
                                pass

                            vision_result = process_file_for_analysis(
                                file_b64, mime_type or 'application/octet-stream',
                                file_name, 'invoice', 'ara+fra+eng',
                                ocr_engine=_ocr_engine
                            )
                            if vision_result.get('ok'):
                                source_text = str(vision_result.get('text') or '').strip()
                                ocr_engine_used = vision_result.get('ocr_engine_used', 'ai-vision')
                                print(f'[INVOICE-EXTRACT] AI Vision fallback: {len(source_text)} chars extracted (engine={ocr_engine_used})')
                                # Use the analysis from process_file_for_analysis directly
                                _vision_analysis = vision_result.get('analysis') or {}
                                if isinstance(_vision_analysis, dict):
                                    # Normalize: ensure line_items key exists
                                    if 'line_items' not in _vision_analysis and 'lineItems' in _vision_analysis:
                                        _vision_analysis['line_items'] = _vision_analysis['lineItems']
                                    if 'fields' not in _vision_analysis:
                                        _flat_keys = [
                                            'invoice_number', 'invoice_date', 'company_name',
                                            'supplier_name', 'supplier', 'supplier_address',
                                            'supplier_rc', 'supplier_nif', 'supplier_nis',
                                            'supplier_art', 'supplier_phone', 'supplier_email',
                                            'vendor', 'seller', 'emetteur',
                                            'customer_name', 'customer', 'customer_address',
                                            'client', 'buyer', 'acheteur', 'destinataire',
                                            'subtotal', 'tax', 'total', 'currency', 'due_date',
                                            'rc', 'nif', 'nis', 'art', 'phone', 'email',
                                        ]
                                        _collected = {k: _vision_analysis[k] for k in _flat_keys if k in _vision_analysis}
                                        if _collected:
                                            _vision_analysis['fields'] = _collected
                                    analysis = _vision_analysis
                                    fields = analysis.get('fields') or {}
                                    line_items = analysis.get('line_items') or []
                                    # Skip the normal _analyze_with_ai path — we already have analysis
                                    # Jump to supplier/customer resolution
                                    # (set a flag to skip re-analysis below)
                                    _skip_reanalysis = True
                                else:
                                    _skip_reanalysis = False
                            else:
                                _skip_reanalysis = False
                                _vision_error = str(vision_result.get('error') or '')
                                print(f'[INVOICE-EXTRACT] AI Vision fallback also failed: {_vision_error[:300]}')
                        except Exception as vision_exc:
                            _skip_reanalysis = False
                            print(f'[INVOICE-EXTRACT] AI Vision fallback exception: {vision_exc}')

                        if not source_text:
                            # Both Tesseract and AI Vision failed
                            if 'tesseract' in proc_error.lower() or 'pytesseract' in proc_error.lower():
                                proc_error += ' Install Tesseract OCR engine from https://github.com/UB-Mannheim/tesseract/wiki'
                            return self._json(400, {'ok': False, 'error': proc_error})
                    else:
                        _skip_reanalysis = False
                        print(f'[INVOICE-EXTRACT] Tesseract OCR: {len(source_text)} chars extracted')

                    # Step 2: If not already analyzed by AI Vision, use AI chat (text-based) to analyze
                    if not _skip_reanalysis:
                        from backend.ai_file_processor import _analyze_with_ai
                        analysis = _analyze_with_ai(source_text, 'invoice', file_name, mime_type, file_base64='')
                        fields = analysis.get('fields') or {}
                        line_items = analysis.get('line_items') or []

                    # Debug: log what AI returned
                    print(f'[INVOICE-EXTRACT] analysis keys: {list(analysis.keys()) if isinstance(analysis, dict) else type(analysis)}')
                    print(f'[INVOICE-EXTRACT] line_items count: {len(line_items) if isinstance(line_items, list) else "not list"}')
                    if isinstance(line_items, list) and line_items:
                        print(f'[INVOICE-EXTRACT] RAW line_items (before normalization): {json.dumps(line_items[:5], ensure_ascii=False)}')
                    print(f'[INVOICE-EXTRACT] Source text preview (first 800 chars): {source_text[:800]}')
                    if not line_items:
                        print(f'[INVOICE-EXTRACT] AI analysis preview: {str(analysis)[:500]}')
                        # If AI didn't return line_items, try extracting directly from text
                        try:
                            fallback_prompt = (
                                "Vous êtes un extracteur de factures expert. Extrayez TOUS les articles du texte de cette facture.\n"
                                "INSTRUCTIONS:\n"
                                "- Chaque ligne d'article DOIT avoir un 'description' (nom du produit) NON VIDE\n"
                                "- 'quantity' = quantité (nombre)\n"
                                "- 'unit_price' = prix unitaire (nombre)\n"
                                "- 'total' = montant total de la ligne (nombre)\n"
                                "- Les nombres peuvent être en chiffres arabes (٠١٢٣) ou occidentaux (0123)\n"
                                "Retournez UNIQUEMENT un objet JSON valide (pas de markdown):\n"
                                "{\n"
                                '  "lineItems": [{"description": "nom du produit", "quantity": 1, "unit_price": 0.00, "total": 0.00}]\n'
                                "}\n\n"
                                f"Texte de la facture:\n{source_text[:12000]}"
                            )
                            fb_result = _ai_chat(
                                [{'role': 'user', 'content': fallback_prompt}],
                                system_prompt='Retournez uniquement le JSON. Extrayez chaque ligne de produit avec son nom.',
                                max_tokens=8192, temperature=0.3
                            )
                            if fb_result.get('ok'):
                                fb_reply = str(fb_result.get('reply', ''))
                                fb_match = re.search(r'\{[\s\S]*\}', fb_reply)
                                if fb_match:
                                    try:
                                        fb_parsed = json.loads(fb_match.group(0))
                                        fb_items = fb_parsed.get('lineItems') or fb_parsed.get('line_items') or []
                                        if isinstance(fb_items, list) and fb_items:
                                            print(f'[INVOICE-EXTRACT] Fallback AI extracted {len(fb_items)} items')
                                            line_items = fb_items
                                    except Exception:
                                        pass
                        except Exception as fb_exc:
                            print(f'[INVOICE-EXTRACT] Fallback AI failed: {fb_exc}')

                    def _norm_li(item):
                        if not isinstance(item, dict):
                            return item
                        def _to_western_digits(val):
                            if val is None:
                                return val
                            s = str(val)
                            # Convert Arabic-Indic (٠-٩) and Persian (۰-۹) to Western
                            for i in range(10):
                                s = s.replace(chr(0x0660 + i), str(i))
                                s = s.replace(chr(0x06F0 + i), str(i))
                            return s
                        def _parse_num(val):
                            if val is None:
                                return 0
                            s = _to_western_digits(val).strip()
                            # European decimal: 1.234,56 → 1234.56
                            if ',' in s and '.' in s:
                                if s.rindex(',') < s.rindex('.'):
                                    s = s.replace(',', '')
                                else:
                                    s = s.replace('.', '').replace(',', '.')
                            elif ',' in s and '.' not in s:
                                parts = s.split(',')
                                if len(parts) == 2 and len(parts[1]) <= 2:
                                    s = parts[0] + '.' + parts[1]
                                else:
                                    s = s.replace(',', '')
                            try:
                                return float(s)
                            except Exception:
                                return 0
                        desc = str(item.get('description') or item.get('item') or item.get('name') or item.get('designation') or item.get('désignation') or '').strip()
                        return {
                            'description': desc,
                            'quantity': _parse_num(item.get('quantity') or item.get('qty') or 1),
                            'unit_price': _parse_num(item.get('unit_price') or item.get('unitPrice') or item.get('price') or item.get('prix_unitaire') or 0),
                            'total': _parse_num(item.get('total') or item.get('line_total') or item.get('lineTotal') or item.get('montant') or 0)
                        }

                    # Resolve supplier/customer names with aliases and confusion detection
                    _supplier_name = (fields.get('supplier_name') or fields.get('supplier') or
                                      fields.get('company_name') or fields.get('vendor') or
                                      fields.get('seller') or fields.get('emetteur') or '').strip()
                    _customer_name = (fields.get('customer_name') or fields.get('customer') or
                                      fields.get('client') or fields.get('buyer') or
                                      fields.get('acheteur') or fields.get('destinataire') or '').strip()
                    # Sanitize: strip leading pipe chars and stray punctuation from AI output
                    _customer_name = _customer_name.lstrip('| \t\r\n').strip()

                    # If AI returned same name for both, it likely confused them.
                    # Clear customer_name so frontend can try text-based extraction.
                    if _customer_name and _supplier_name and _customer_name.lower() == _supplier_name.lower():
                        print(f'[INVOICE-EXTRACT] WARNING: customer_name == supplier_name ({_customer_name}), clearing customer')
                        _customer_name = ''

                    # Detect if AI put the supplier name in the customer field.
                    # Heuristic: if customer_name appears in the first 500 chars of the invoice
                    # (where the supplier header/logo usually is), it's likely the supplier, not the customer.
                    if _customer_name and _supplier_name and _customer_name != _supplier_name:
                        _text_head = source_text[:500].lower() if source_text else ''
                        _text_tail = source_text[500:].lower() if source_text else ''
                        # If customer name appears in the header but NOT in the body, it's probably the supplier
                        _cust_lower = _customer_name.lower()
                        _in_head = _cust_lower in _text_head
                        _in_body = _cust_lower in _text_tail
                        _supp_lower = _supplier_name.lower()
                        _supp_in_body = _supp_lower in _text_tail
                        if _in_head and not _in_body and _supp_in_body:
                            print(f'[INVOICE-EXTRACT] WARNING: customer_name "{_customer_name}" found in header but not body — likely supplier. Swapping.')
                            _customer_name, _supplier_name = _supplier_name, _customer_name
                        # Also: if supplier_name is empty but customer_name matches company_name, swap
                        elif not _supplier_name and _customer_name:
                            _company = (fields.get('company_name') or '').strip()
                            if _company and _company.lower() == _cust_lower:
                                print(f'[INVOICE-EXTRACT] WARNING: customer_name matches company_name — likely supplier. Swapping.')
                                _supplier_name = _customer_name
                                _customer_name = ''

                    # Also check if customer_name is actually the supplier (AI put supplier in customer field)
                    # by checking if it appears in the supplier_address or matches company_name
                    if _customer_name and not _customer_name.strip():
                        _customer_name = ''

                    # Detect AI hallucination: if customer_name doesn't appear anywhere in the OCR text,
                    # AI likely invented it — clear it so text-based extraction can find the real customer
                    if _customer_name and source_text:
                        _cust_lower_check = _customer_name.lower().strip()
                        _text_lower_check = source_text.lower()
                        # Check if any significant part of the customer name appears in the text
                        _cust_words = [w for w in _cust_lower_check.split() if len(w) > 2]
                        _found_in_text = any(w in _text_lower_check for w in _cust_words) if _cust_words else False
                        if not _found_in_text and _cust_lower_check != _supplier_name.lower():
                            print(f'[INVOICE-EXTRACT] WARNING: customer_name "{_customer_name}" not found in OCR text — likely AI hallucination. Clearing.')
                            _customer_name = ''

                    # Final validation: if customer_name is empty or looks wrong, try extracting from text
                    if not _customer_name and source_text:
                        _cust_patterns = [
                            r'(?:factur[eé]\s*[eà]\s*|client\s*[:\-]\s*|acheteur\s*[:\-]\s*|destinataire\s*[:\-]\s*|doit\s*[:\-]\s*|مشتري\s*[:\-]\s*|زبون\s*[:\-]\s*|عميل\s*[:\-]\s*|العميل\s*[:\-]\s*|المشتري\s*[:\-]\s*|المستفيد\s*[:\-]\s*)\s*\n?\s*([^\n\r]{3,80})',
                            r'(?:client|customer|acheteur|buyer)\s*[:\-]\s*([^\n\r]{3,80})',
                            r'(?:^|[\n\r])\s*[AÀ]\s*[:\-]?\s*\n?\s*([^\n\r]{3,80})',
                            r'(?:^|[\n\r])\s*(?:doit|must)\s*[:\-]?\s*\n?\s*([^\n\r]{3,80})',
                        ]
                        for _pat in _cust_patterns:
                            _m = re.search(_pat, source_text, re.IGNORECASE)
                            if _m:
                                _extracted = _m.group(1).strip()
                                # Make sure extracted name is NOT the supplier
                                if _extracted and _extracted.lower() != _supplier_name.lower():
                                    _customer_name = _extracted[:80]
                                    print(f'[INVOICE-EXTRACT] Extracted customer from text: {_customer_name!r}')
                                    break

                    # ── "Client :" with no name after it — look BACKWARDS for the customer name ──
                    # Handles invoices where the customer name appears on a line BEFORE the "Client :" label
                    if not _customer_name and source_text:
                        _cl_label = re.search(r'^[ \t]*client\s*[:\-]\s*[ \t]*$', source_text, re.IGNORECASE | re.MULTILINE)
                        if _cl_label:
                            _before = source_text[:_cl_label.start()]
                            _lines_before = [l.strip() for l in _before.splitlines() if l.strip()]
                            _skip_pats = [
                                r'n\.?[°\s]*(?:rc|if|is|art|nif|nis)\s*[:\-]?', r'n\.?i\.?[fp]\s*[:\-]?',
                                r'rc\s*[:\-]', r'n[°o]\s*[:\-]', r'facture\s+proforma', r'facture\b',
                                r'n[°o]\s*[:\-]?\s*\d', r'\d{6,}', r'mode\s+de\s+paiement',
                                r'proforma', r'devis', r'page\s*[:\-]', r'alger\b', r'le\s+\d',
                                r'innovating', r'technology', r'innotech',
                            ]
                            _addr_inds = ['route', 'zone', 'lot', 'local', 'el hamiz', 'bordj', 'rue', 'bd ', 'boulevard', 'hamiz']
                            _phrase_bl = [
                                'la somme de', 'la somme', 'le montant', 'total ttc', 'total ht',
                                'montant', 'total', 'net a payer', 'net à payer', 'tva', 'taxe',
                                'remise', 'timbre', 'designation', 'quantite', 'prix unitaire',
                                'facture n', 'proforma n', 'date', 'mode de paiement',
                            ]
                            for _line in reversed(_lines_before[-15:]):
                                _is_skip = any(re.search(p, _line, re.IGNORECASE) for p in _skip_pats)
                                if _is_skip:
                                    continue
                                if _line.lower() == _supplier_name.lower():
                                    continue
                                if len(_line) < 3 or _line.replace(' ', '').replace('-', '').replace('.', '').isdigit():
                                    continue
                                _ll = _line.lower()
                                if any(_ll == ph or _ll.startswith(ph) for ph in _phrase_bl):
                                    continue
                                if any(ind in _ll for ind in _addr_inds):
                                    continue
                                if re.match(r'^[\d\s\-\+()]+$', _line) or '@' in _line:
                                    continue
                                _customer_name = _line[:80].strip('| \t\r\n')
                                print(f'[INVOICE-EXTRACT] Found customer BEFORE "Client :" label: {_customer_name!r}')
                                break

                    # Final sanitize: strip stray pipe chars and whitespace from customer name
                    if _customer_name:
                        _customer_name = _customer_name.lstrip('| \t\r\n').strip()

                    print(f'[INVOICE-EXTRACT] supplier={_supplier_name!r}, customer={_customer_name!r}')

                    # Extract supplier registration numbers from AI fields or text
                    _sup_rc = (fields.get('supplier_rc') or fields.get('rc') or '').strip()
                    _sup_nif = (fields.get('supplier_nif') or fields.get('nif') or '').strip()
                    _sup_nis = (fields.get('supplier_nis') or fields.get('nis') or '').strip()
                    _sup_art = (fields.get('supplier_art') or fields.get('art') or '').strip()
                    _sup_phone = (fields.get('supplier_phone') or fields.get('phone') or '').strip()
                    _sup_email = (fields.get('supplier_email') or fields.get('email') or '').strip()

                    # Fallback: extract from raw text if AI didn't return them
                    if not _sup_rc:
                        _rc_match = re.search(r'(?:RC\s*[:\-]?\s*|N°\s*RC\s*[:\-]?\s*|رقم\s*السجل\s*التجاري\s*[:\-]?\s*)([A-Z0-9/\-]{4,20})', source_text, re.IGNORECASE)
                        if _rc_match: _sup_rc = _rc_match.group(1).strip()
                    if not _sup_nif:
                        _nif_match = re.search(r'(?:NIF\s*[:\-]?\s*|N°\s*NIF\s*[:\-]?\s*)([0-9/\-]{8,20})', source_text, re.IGNORECASE)
                        if _nif_match: _sup_nif = _nif_match.group(1).strip()
                    if not _sup_nis:
                        _nis_match = re.search(r'(?:NIS\s*[:\-]?\s*|N°\s*NIS\s*[:\-]?\s*)([0-9/\-]{8,20})', source_text, re.IGNORECASE)
                        if _nis_match: _sup_nis = _nis_match.group(1).strip()
                    if not _sup_art:
                        _art_match = re.search(r'(?:ART\s*[:\-]?\s*|N°\s*ART\s*[:\-]?\s*|Article\s*[:\-]?\s*)([0-9/\-]{4,20})', source_text, re.IGNORECASE)
                        if _art_match: _sup_art = _art_match.group(1).strip()
                    if not _sup_phone:
                        _phone_match = re.search(r'(?:T[eé]l\s*[:\-]?\s*|T[eé]l[eé]phone\s*[:\-]?\s*|Phone\s*[:\-]?\s*|هاتف\s*[:\-]?\s*)\+?([\d\s().-]{8,20})', source_text, re.IGNORECASE)
                        if _phone_match: _sup_phone = _phone_match.group(1).strip()
                    if not _sup_email:
                        _email_match = re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', source_text)
                        if _email_match: _sup_email = _email_match.group(0).strip()

                    return self._json(200, {
                        'ok': True,
                        'text': source_text,
                        'externalRef': fields.get('invoice_number'),
                        'supplier': _supplier_name,
                        'supplierContact': None,
                        'supplierEmail': _sup_email or None,
                        'supplierPhone': _sup_phone or None,
                        'supplierTaxId': _sup_nif or None,
                        'supplierRc': _sup_rc or None,
                        'supplierNis': _sup_nis or None,
                        'supplierArt': _sup_art or None,
                        'supplierWebsite': None,
                        'supplierAddress': fields.get('supplier_address'),
                        'supplierCity': None,
                        'supplierState': None,
                        'supplierCountry': None,
                        'customer': _customer_name,
                        'customerAddress': fields.get('customer_address'),
                        'customerCity': None,
                        'customerPhone': None,
                        'customerEmail': None,
                        'customerTaxId': None,
                        'customerRc': None,
                        'customerNis': None,
                        'amount': float(fields.get('total') or 0),
                        'vatAmount': float(fields.get('tax') or 0),
                        'billDate': fields.get('invoice_date'),
                        'dueDate': fields.get('due_date'),
                        'currency': fields.get('currency', 'DZD'),
                        'lineItems': _normalize_line_items(line_items) if isinstance(line_items, list) else [],
                        'model': None,
                        'aiError': analysis.get('error'),
                        'ocrEngineUsed': ocr_engine_used,
                        'ocrEngineRequested': 'auto'
                    })
                except Exception as exc:
                    return self._json(500, {'ok': False, 'error': str(exc)})

            # Text-only fallback: use direct AI extraction
            source_text = plain_text[:12000]
            if not source_text:
                return self._json(400, {'ok': False, 'error': 'No text or file provided'})

            try:
                prompt = (
                    "Vous êtes un extracteur de factures expert. Les données peuvent être du texte, des tableaux Markdown, ou des lignes de tableur.\n"
                    "RÈGLES IMPORTANTES:\n"
                    "- \"supplier\" = l'entreprise QUI ÉMET la facture (le vendeur/fournisseur, généralement en haut/en-tête)\n"
                    "- \"customer\" = l'entreprise/personne QUI REÇOIT la facture (le client/acheteur, indiqué après 'Facturé à', 'Client', 'مشتري', 'زبون')\n"
                    "- NE CONFONDEZ JAMAIS le fournisseur et le client!\n"
                    "- Si les données ressemblent à un tableau, traitez CHAQUE LIGNE comme un article.\n"
                    "- Pour chaque article: extrayez description (nom du produit), quantity (nombre), unit_price (nombre), total (nombre).\n"
                    "- Le champ description DOIT toujours contenir le nom du produit (jamais vide).\n"
                    "- Remplissez toujours le tableau lineItems — même si les données sont partielles.\n"
                    "- Les nombres peuvent être en chiffres arabes (٠١٢٣) ou occidentaux (0123).\n"
                    "Retournez UNIQUEMENT un objet JSON valide (pas de markdown):\n"
                    "{\n"
                    '  "externalRef": "numéro de facture",\n'
                    '  "supplier": "nom du fournisseur (l\'émetteur)",\n'
                    '  "supplierContact": null,\n'
                    '  "supplierEmail": null,\n'
                    '  "supplierPhone": "téléphone",\n'
                    '  "supplierTaxId": "NIF",\n'
                    '  "supplierRc": "RC",\n'
                    '  "supplierNis": "NIS",\n'
                    '  "supplierWebsite": null,\n'
                    '  "supplierAddress": "adresse",\n'
                    '  "supplierCity": "ville",\n'
                    '  "supplierState": "wilaya",\n'
                    '  "supplierCountry": "DZ",\n'
                    '  "customer": "nom du client (le destinataire)",\n'
                    '  "amount": 0.00,\n'
                    '  "vatAmount": 0.00,\n'
                    '  "billDate": "YYYY-MM-DD",\n'
                    '  "dueDate": null,\n'
                    '  "currency": "DZD",\n'
                    '  "lineItems": [{"description": "nom du produit", "quantity": 1, "unit_price": 0.00, "total": 0.00}]\n'
                    "}\n\n"
                    f"Données à extraire:\n{source_text}"
                )
                ai_result = _ai_chat(
                    [{'role': 'user', 'content': prompt}],
                    system_prompt='Retournez uniquement le JSON pour l\'extraction de facture.',
                    max_tokens=8192, temperature=0.3
                )
                if not ai_result.get('ok'):
                    return self._json(200, {'ok': True, 'text': source_text,
                                           'externalRef': None, 'supplier': None, 'supplierContact': None,
                                           'supplierEmail': None, 'supplierPhone': None, 'supplierTaxId': None,
                                           'supplierRc': None, 'supplierNis': None,
                                           'supplierWebsite': None, 'supplierAddress': None, 'supplierCity': None,
                                           'supplierState': None, 'supplierCountry': None, 'amount': 0,
                                           'vatAmount': 0, 'billDate': None, 'dueDate': None,
                                           'lineItems': [], 'aiError': ai_result.get('error')})

                reply = str(ai_result.get('reply', ''))
                log_structured('DEBUG', 'Invoice text', chars=len(source_text), preview=source_text[:200])
                log_structured('DEBUG', 'Invoice AI reply', preview=reply[:300])
                json_match = re.search(r'\{[\s\S]*\}', reply)
                parsed = {}
                if json_match:
                    try:
                        parsed = json.loads(json_match.group(0))
                    except Exception:
                        pass

                _supplier_name = (parsed.get('supplier') or parsed.get('vendor_name') or '').strip()
                _customer_name = (parsed.get('customer') or parsed.get('customer_name') or
                                  parsed.get('client') or parsed.get('buyer') or
                                  parsed.get('acheteur') or parsed.get('destinataire') or '').strip()

                if _customer_name and _supplier_name and _customer_name.lower() == _supplier_name.lower():
                    print(f'[INVOICE-EXTRACT] WARNING (text-only): customer == supplier ({_customer_name}), clearing customer')
                    _customer_name = ''

                return self._json(200, {
                    'ok': True,
                    'text': source_text,
                    'externalRef': parsed.get('externalRef') or parsed.get('invoice_number'),
                    'supplier': _supplier_name,
                    'supplierContact': parsed.get('supplierContact') or parsed.get('supplier_contact'),
                    'supplierEmail': parsed.get('supplierEmail') or parsed.get('supplier_email'),
                    'supplierPhone': parsed.get('supplierPhone') or parsed.get('supplier_phone'),
                    'supplierTaxId': parsed.get('supplierTaxId') or parsed.get('supplier_tax_id'),
                    'supplierRc': parsed.get('supplierRc') or parsed.get('supplierRC') or parsed.get('supplier_rc') or parsed.get('rc'),
                    'supplierNis': parsed.get('supplierNis') or parsed.get('supplierNIS') or parsed.get('supplier_nis') or parsed.get('nis'),
                    'supplierArt': parsed.get('supplierArt') or parsed.get('supplierART') or parsed.get('supplier_art') or parsed.get('art'),
                    'supplierWebsite': parsed.get('supplierWebsite') or parsed.get('supplier_website'),
                    'supplierAddress': parsed.get('supplierAddress') or parsed.get('supplier_address'),
                    'supplierCity': parsed.get('supplierCity') or parsed.get('supplier_city'),
                    'supplierState': parsed.get('supplierState') or parsed.get('supplier_state'),
                    'supplierCountry': parsed.get('supplierCountry') or parsed.get('supplier_country'),
                    'customer': _customer_name,
                    'amount': float(parsed.get('amount') or parsed.get('total_amount') or 0),
                    'vatAmount': float(parsed.get('vatAmount') or parsed.get('vat_amount') or 0),
                    'billDate': parsed.get('billDate') or parsed.get('date'),
                    'dueDate': parsed.get('dueDate') or parsed.get('due_date'),
                    'currency': parsed.get('currency', 'DZD'),
                    'lineItems': _normalize_line_items(parsed.get('lineItems') or parsed.get('line_items') or []),
                    'model': ai_result.get('model')
                })
            except Exception as exc:
                return self._json(500, {'ok': False, 'error': str(exc)})

        # POST /api/ai/analyze-file — Advanced file analysis with AI
        if path == '/api/ai/analyze-file' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated.
            if not self._require_auth():
                return
            try:
                from backend import ai_file_processor
                
                data = self._read_body()
                file_base64 = data.get('fileBase64', '')
                mime_type = data.get('mimeType', 'application/octet-stream')
                file_name = data.get('fileName', '')
                analysis_type = data.get('analysisType', 'general')
                language = data.get('language', 'ara+fra+eng')
                
                # Read OCR engine setting (auto, tesseract, or ai)
                ocr_engine = 'auto'
                try:
                    ai_settings_file = os.path.join(DATA_DIR, 'ai_settings.json')
                    with open(ai_settings_file, 'r', encoding='utf-8-sig') as f:
                        _ai_cfg = json.load(f)
                    ocr_engine = str(_ai_cfg.get('ocr_engine', 'auto')).strip().lower()
                    if ocr_engine not in ('auto', 'tesseract', 'ai'):
                        ocr_engine = 'auto'
                except Exception:
                    pass
                
                result = ai_file_processor.process_file_for_analysis(
                    file_base64,
                    mime_type,
                    file_name,
                    analysis_type,
                    language,
                    ocr_engine=ocr_engine
                )
                
                return self._json(200, result)
            except Exception as e:
                return self._json(500, {'ok': False, 'error': str(e)})

        # POST /api/ai/compare-files — Compare multiple documents
        if path == '/api/ai/compare-files' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated.
            if not self._require_auth():
                return
            try:
                from backend import ai_file_processor
                
                data = self._read_body()
                files = data.get('files', [])
                comparison_type = data.get('type', 'differences')
                
                result = ai_file_processor.compare_documents(files, comparison_type)
                return self._json(200, result)
            except Exception as e:
                return self._json(500, {'ok': False, 'error': str(e)})

        # POST /api/ai/extract-table — Extract table data from image
        if path == '/api/ai/extract-table' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated.
            if not self._require_auth():
                return
            try:
                from backend import ai_file_processor
                
                data = self._read_body()
                result = ai_file_processor.extract_table_from_image(
                    data.get('fileBase64', ''),
                    data.get('mimeType', ''),
                    data.get('fileName', '')
                )
                return self._json(200, result)
            except Exception as e:
                return self._json(500, {'ok': False, 'error': str(e)})

        # POST /api/ai/classify — Classify document type
        if path == '/api/ai/classify' and self.command == 'POST':
            # FIX (audit finding): was completely unauthenticated.
            if not self._require_auth():
                return
            try:
                from backend import ai_file_processor
                
                data = self._read_body()
                result = ai_file_processor.classify_document(
                    data.get('fileBase64', ''),
                    data.get('mimeType', ''),
                    data.get('fileName', ''),
                    data.get('categories')
                )
                return self._json(200, result)
            except Exception as e:
                return self._json(500, {'ok': False, 'error': str(e)})

        # GET /api/backup — full system backup (admin only, returns JSON file)
        if path == '/api/backup' and self.command == 'GET':
            backup_user = self._require_auth('admin')
            if not backup_user:
                return False
            with _lock:
                store = _read_store()
            ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
            try:
                with open(ai_sf, 'r', encoding='utf-8') as _f:
                    ai_cfg = json.load(_f)
            except (OSError, json.JSONDecodeError):
                ai_cfg = {}
            backup = {
                'schema': '3.0',
                'created_at': datetime.datetime.now().isoformat(),
                'created_by': backup_user.get('email', 'admin'),
                'store': store,
                'ai_settings': ai_cfg,
            }
            body = json.dumps(backup, ensure_ascii=False, indent=2).encode('utf-8')
            fname = f'zeralda-backup-{datetime.datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            log_structured('INFO', 'Full backup created', action='backup_create',
                           initiator=backup_user.get('email'), keys=len(store), status='success')
            return

        # POST /api/backup/restore — restore full backup (admin only)
        if path == '/api/backup/restore' and self.command == 'POST':
            restore_user = self._require_auth('admin')
            if not restore_user:
                return False
            data = self._read_body()
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {'ok': False, 'error': 'Backup file too large'})
            backup_store = data.get('store')
            if not isinstance(backup_store, dict):
                return self._json(400, {'ok': False, 'error': 'Invalid backup: missing or invalid store'})
            schema = str(data.get('schema', '1.0'))
            restored_keys = 0
            skipped_keys = 0
            with _lock:
                store = _read_store()
                for key, value in backup_store.items():
                    try:
                        value_bytes = len(json.dumps(value, ensure_ascii=False).encode('utf-8'))
                        if value_bytes > MAX_STORE_VALUE_BYTES:
                            skipped_keys += 1
                            continue
                        old_val = store.get(key)
                        store[key] = value
                        _record_change_locked(key, old_val, value)
                        restored_keys += 1
                    except Exception:
                        skipped_keys += 1
                _write_store(store)
            if data.get('ai_settings') and isinstance(data['ai_settings'], dict):
                ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
                try:
                    with open(ai_sf, 'r', encoding='utf-8') as _f:
                        existing_ai = json.load(_f)
                except (OSError, json.JSONDecodeError):
                    existing_ai = {}
                existing_ai.update(data['ai_settings'])
                with open(ai_sf, 'w', encoding='utf-8') as _f:
                    json.dump(existing_ai, _f, ensure_ascii=False, indent=2)
            log_structured('INFO', 'Backup restored', action='backup_restore',
                           initiator=restore_user.get('email'), schema=schema,
                           restored=restored_keys, skipped=skipped_keys, status='success')
            return self._json(200, {
                'ok': True,
                'restored_keys': restored_keys,
                'skipped_keys': skipped_keys,
                'schema': schema,
                'message': f'Restored {restored_keys} keys successfully' + (f' ({skipped_keys} skipped)' if skipped_keys else '')
            })

        # ── Folder Backup Settings ──────────────────────────────────────────
        # GET /api/backup/folder/pick — open native folder picker dialog (Windows)
        if path == '/api/backup/folder/pick' and self.command == 'GET':
            user = self._validate_session() if AUTH_ENABLED else {'role': 'admin'}
            if not user:
                return False
            try:
                import subprocess as _sp

                # Use PowerShell with Windows Forms FolderBrowserDialog
                # Set output encoding to UTF-8 so Arabic/Unicode paths are preserved
                # Create a hidden topmost form as parent so dialog appears above the browser
                ps_script = (
                    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;"
                    "Add-Type -AssemblyName System.Windows.Forms;"
                    "$form = New-Object System.Windows.Forms.Form;"
                    "$form.TopMost = $true;"
                    "$form.WindowState = 'Minimized';"
                    "$form.ShowInTaskbar = $false;"
                    "$form.Opacity = 0;"
                    "$form.Show();"
                    "$form.Hide();"
                    "$fbd = New-Object System.Windows.Forms.FolderBrowserDialog;"
                    "$fbd.Description = 'Select Backup Folder - Zeralda ERP';"
                    "$fbd.ShowNewFolderButton = $true;"
                    "$fbd.RootFolder = 'MyComputer';"
                    "if ($fbd.ShowDialog($form) -eq 'OK') { "
                    "  [Console]::Out.Write($fbd.SelectedPath) "
                    "}"
                )
                result = _sp.run(
                    ['powershell', '-NoProfile', '-NonInteractive', '-Command', ps_script],
                    capture_output=True, text=True, timeout=120, encoding='utf-8'
                )
                selected = result.stdout.strip() if result.stdout else ''
                if selected and len(selected) > 1:
                    return self._json(200, {'ok': True, 'path': selected})
                else:
                    return self._json(200, {'ok': True, 'path': None, 'message': 'No folder selected'})
            except _sp.TimeoutExpired:
                return self._json(200, {'ok': True, 'path': None, 'message': 'Folder picker timed out'})
            except Exception as e:
                log_structured('WARN', 'Folder picker error', error=str(e))
                return self._json(500, {'ok': False, 'error': str(e)})

        # GET /api/backup/folder/settings — read backup folder config
        if path == '/api/backup/folder/settings' and self.command == 'GET':
            user = self._validate_session() if AUTH_ENABLED else {'role': 'admin'}
            if not user:
                return False
            with _lock:
                store = _read_store()
            cfg = store.get('zeralda-system-settings', {}).get('backup_folder', {})
            return self._json(200, {'ok': True, 'config': cfg})

        # POST /api/backup/folder/settings — save backup folder config
        if path == '/api/backup/folder/settings' and self.command == 'POST':
            bk_user = self._require_auth('admin')
            if not bk_user:
                return False
            data = self._read_body()
            folder_path = str(data.get('folder_path', '')).strip()
            # FIX P0: validate backup folder path to prevent path traversal.
            # Only allow absolute paths (no .. or relative traversal).
            if folder_path:
                normalized = os.path.normpath(folder_path)
                if '..' in normalized or '\x00' in folder_path:
                    return self._json(400, {'ok': False, 'error': 'Invalid folder path'})
            auto_backup = bool(data.get('auto_backup', False))
            export_pdf = bool(data.get('export_pdf', True))
            with _lock:
                store = _read_store()
            sys_settings = store.get('zeralda-system-settings', {})
            sys_settings['backup_folder'] = {
                'folder_path': folder_path,
                'auto_backup': auto_backup,
                'export_pdf': export_pdf
            }
            store['zeralda-system-settings'] = sys_settings
            _write_store(store)
            log_structured('INFO', 'Backup folder settings updated',
                           action='backup_folder_settings',
                           initiator=bk_user.get('email'),
                           folder=folder_path, status='success')
            return self._json(200, {'ok': True, 'message': 'Backup folder settings saved'})

        # POST /api/backup/folder/run — export all data organized by company/module
        if path == '/api/backup/folder/run' and self.command == 'POST':
            bk_user = self._require_auth('admin')
            if not bk_user:
                return False
            data = self._read_body() or {}
            with _lock:
                store = _read_store()
            sys_settings = store.get('zeralda-system-settings', {})
            bk_cfg = sys_settings.get('backup_folder', {})
            folder_path = str(data.get('folder_path') or bk_cfg.get('folder_path', '')).strip()
            export_pdf = data.get('export_pdf', bk_cfg.get('export_pdf', True))

            if not folder_path:
                return self._json(400, {'ok': False, 'error': 'No backup folder configured'})

            try:
                os.makedirs(folder_path, exist_ok=True)
            except OSError as e:
                return self._json(400, {'ok': False, 'error': f'Cannot create folder: {e}'})

            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_subdir = os.path.join(folder_path, f'zeralda-backup-{timestamp}')
            try:
                os.makedirs(backup_subdir, exist_ok=True)
            except OSError as e:
                return self._json(500, {'ok': False, 'error': f'Cannot create backup subfolder: {e}'})

            # Module definitions: (store_key_prefix, folder_name, arabic_label, is_invoice)
            MODULE_DEFS = [
                ('invoices-data',           'invoices',       'الفواتير',           True),
                ('proformas-data',          'proformas',      'عروض الأسعار',       False),
                ('customers-data',          'customers',      'العملاء',            False),
                ('suppliers-data',          'suppliers',      'الموردون',           False),
                ('products-data',           'products',       'المنتجات',           False),
                ('employees-data',          'employees',      'الموظفون',           False),
                ('payroll-data',            'payroll',        'الرواتب',            False),
                ('hr-leaves',               'hr-leaves',      'الإجازات',           False),
                ('purchases-data',          'purchases',      'المشتريات',          False),
                ('purchase-orders-data',    'purchase-orders','أوامر الشراء',       False),
                ('tenders-data',            'tenders',        'المناقصات',          False),
                ('consultations-data',      'consultations',  'الاستشارات',         False),
                ('finance-transactions',    'finance',        'المالية',            False),
                ('expenses-data',           'expenses',       'المصاريف',           False),
                ('zeralda-services',        'services',       'الخدمات',            False),
                ('stock-movements',         'stock',          'المخزون',            False),
                ('inventory-categories',    'inventory-cats', 'تصنيفات المخزون',    False),
                ('leads-data',              'leads',          'العملاء المحتملون',  False),
                ('opportunities-data',      'opportunities',  'فرص البيع',          False),
                ('projects-data',           'projects',       'المشاريع',           False),
                ('proposals-data',          'proposals',      'العروض',             False),
                ('appointments-data',       'appointments',   'المواعيد',           False),
                ('tickets-data',            'tickets',        'التذاكر',            False),
                ('accounts-data',           'accounts',       'الحسابات',           False),
                ('journal-entries-data',    'journal',        'القيود المحاسبية',   False),
                ('contacts-data',           'contacts',       'جهات الاتصال',       False),
            ]

            # Get company names from settings or from request body
            # (company names are stored in localStorage on the client side, not in server store)
            companies_map = {}
            if isinstance(sys_settings, dict):
                for comp in (sys_settings.get('companies') or []):
                    if isinstance(comp, dict) and comp.get('id'):
                        companies_map[str(comp['id'])] = comp.get('name') or comp['id']
            # Merge company names from request body (client sends from localStorage)
            client_companies = data.get('companies') or []
            if isinstance(client_companies, list):
                for comp in client_companies:
                    if isinstance(comp, dict) and comp.get('id'):
                        companies_map[str(comp['id'])] = comp.get('name') or comp['id']

            # Group store keys by company
            # Keys format: "module-key::company-id" or just "module-key" (unscoped = default)
            company_data = {}  # {company_id: {module_prefix: {key: value, is_invoice: bool}}}
            global_data = {}   # non-scoped keys that aren't module data

            for store_key, store_val in store.items():
                if '::' in store_key:
                    base_key, comp_id = store_key.split('::', 1)
                else:
                    base_key = store_key
                    comp_id = '_global'

                # Check if this is a known module
                matched_module = None
                for mod_prefix, mod_folder, mod_label, is_invoice in MODULE_DEFS:
                    if base_key == mod_prefix or base_key.startswith(mod_prefix):
                        matched_module = (mod_prefix, mod_folder, mod_label, is_invoice)
                        break

                if matched_module:
                    if comp_id not in company_data:
                        company_data[comp_id] = {}
                    company_data[comp_id][matched_module[0]] = {
                        'folder': matched_module[1],
                        'label': matched_module[2],
                        'is_invoice': matched_module[3],
                        'key': store_key,
                        'value': store_val
                    }
                else:
                    global_data[store_key] = store_val

            # Save full JSON backup (all data in one file)
            ai_sf = os.path.join(DATA_DIR, 'ai_settings.json')
            try:
                with open(ai_sf, 'r', encoding='utf-8') as _f:
                    ai_cfg = json.load(_f)
            except (OSError, json.JSONDecodeError):
                ai_cfg = {}
            backup_data = {
                'schema': '3.0',
                'created_at': datetime.datetime.now().isoformat(),
                'created_by': bk_user.get('email', 'admin'),
                'store': store,
                'ai_settings': ai_cfg,
            }
            json_path = os.path.join(backup_subdir, 'full_backup.json')
            try:
                with open(json_path, 'w', encoding='utf-8') as _f:
                    json.dump(backup_data, _f, ensure_ascii=False, indent=2)
            except OSError as e:
                return self._json(500, {'ok': False, 'error': f'Cannot write JSON backup: {e}'})

            # Save global (non-company) data
            if global_data:
                global_dir = os.path.join(backup_subdir, '_system')
                os.makedirs(global_dir, exist_ok=True)
                for gk, gv in global_data.items():
                    safe_gk = re.sub(r'[/\\:*?"<>|]', '_', gk)
                    gpath = os.path.join(global_dir, f'{safe_gk}.json')
                    try:
                        with open(gpath, 'w', encoding='utf-8') as gf:
                            json.dump(gv, gf, ensure_ascii=False, indent=2)
                    except Exception:
                        pass

            exported_pdfs = 0
            pdf_errors = 0
            exported_modules = 0
            company_dirs = []

            # Export per-company, per-module
            for comp_id, modules in company_data.items():
                # Get company name for folder
                comp_name = companies_map.get(comp_id, '')
                if comp_name:
                    safe_comp = re.sub(r'[/\\:*?"<>|]', '_', comp_name)
                    comp_dir_name = f'{safe_comp} ({comp_id[:8]})' if len(comp_id) > 8 else safe_comp
                else:
                    comp_dir_name = comp_id
                comp_dir = os.path.join(backup_subdir, comp_dir_name)
                os.makedirs(comp_dir, exist_ok=True)
                company_dirs.append(comp_dir_name)

                # Save company info
                comp_info = {'id': comp_id, 'name': comp_name or comp_id}
                with open(os.path.join(comp_dir, '_company_info.json'), 'w', encoding='utf-8') as cf:
                    json.dump(comp_info, cf, ensure_ascii=False, indent=2)

                for mod_prefix, mod_info in modules.items():
                    mod_folder = mod_info['folder']
                    mod_label = mod_info['label']
                    is_invoice = mod_info['is_invoice']
                    mod_val = mod_info['value']

                    mod_dir = os.path.join(comp_dir, mod_folder)
                    os.makedirs(mod_dir, exist_ok=True)

                    # Save module data as JSON
                    json_file = os.path.join(mod_dir, f'{mod_folder}.json')
                    try:
                        with open(json_file, 'w', encoding='utf-8') as mf:
                            json.dump(mod_val, mf, ensure_ascii=False, indent=2)
                        exported_modules += 1
                    except Exception:
                        pass

                    # Export invoices as PDF
                    if is_invoice and export_pdf and isinstance(mod_val, list):
                        for inv in mod_val:
                            if not isinstance(inv, dict):
                                continue
                            try:
                                pdf_bytes = _generate_invoice_pdf(inv)
                                if pdf_bytes:
                                    inv_num = str(inv.get('number') or inv.get('id') or 'unknown')
                                    safe_num = re.sub(r'[/\\:*?"<>|]', '_', inv_num)
                                    pdf_path = os.path.join(mod_dir, f'invoice_{safe_num}.pdf')
                                    with open(pdf_path, 'wb') as pf:
                                        pf.write(pdf_bytes)
                                    exported_pdfs += 1
                            except Exception as e:
                                pdf_errors += 1
                                log_structured('WARN', 'Invoice PDF export failed',
                                               action='backup_folder_pdf',
                                               invoice=inv.get('number', '?'),
                                               company=comp_id,
                                               error=str(e))

            log_structured('INFO', 'Folder backup completed',
                           action='backup_folder_run',
                           initiator=bk_user.get('email'),
                           folder=backup_subdir,
                           companies=len(company_data),
                           modules=exported_modules,
                           pdfs=exported_pdfs, status='success')
            return self._json(200, {
                'ok': True,
                'backup_path': backup_subdir,
                'json_backup': json_path,
                'companies': len(company_data),
                'modules_exported': exported_modules,
                'pdfs_exported': exported_pdfs,
                'pdf_errors': pdf_errors,
                'company_folders': company_dirs,
                'message': f'Backup created: {len(company_data)} companies, {exported_modules} modules, {exported_pdfs} PDFs'
            })

        # GET /api/backup/folder/list — list existing folder backups
        if path == '/api/backup/folder/list' and self.command == 'GET':
            user = self._validate_session() if AUTH_ENABLED else {'role': 'admin'}
            if not user:
                return False
            with _lock:
                store = _read_store()
            bk_cfg = store.get('zeralda-system-settings', {}).get('backup_folder', {})
            folder_path = str(bk_cfg.get('folder_path', '')).strip()
            if not folder_path or not os.path.isdir(folder_path):
                return self._json(200, {'ok': True, 'backups': [], 'folder': folder_path})
            backups = []
            try:
                for entry in sorted(os.listdir(folder_path), reverse=True):
                    full = os.path.join(folder_path, entry)
                    if os.path.isdir(full) and entry.startswith('zeralda-backup-'):
                        stat = os.stat(full)
                        json_file = os.path.join(full, 'full_backup.json')

                        # Count PDFs across all company/module subfolders
                        pdf_count = 0
                        company_count = 0
                        for root_dir, dirs, files in os.walk(full):
                            for f in files:
                                if f.endswith('.pdf'):
                                    pdf_count += 1
                            # Count company dirs (have _company_info.json)
                            for d in dirs:
                                if os.path.isfile(os.path.join(root_dir, d, '_company_info.json')):
                                    company_count += 1

                        backups.append({
                            'name': entry,
                            'path': full,
                            'date': datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'has_json': os.path.isfile(json_file),
                            'pdf_count': pdf_count,
                            'company_count': company_count,
                            'size_mb': round(stat.st_size / (1024 * 1024), 2)
                        })
            except OSError:
                pass
            return self._json(200, {'ok': True, 'backups': backups, 'folder': folder_path})

        # POST /api/export/download — serves a file download directly from the server
        # so the browser doesn't generate data-URL / blob-URL warnings on HTTP origins.
        if path == '/api/export/download' and self.command == 'POST':
            payload = self._read_body()
            if AUTH_ENABLED and REQUIRE_AUTH:
                token = self._get_session_token() or str(payload.get('sessionToken', '')).strip()
                session_user = None
                try:
                    if token:
                        session_user = auth.validate_session(token)
                except Exception:
                    session_user = None
                if not session_user:
                    return self._json(401, {'ok': False, 'error': 'Unauthorized'})
            fileName    = str(payload.get('fileName', 'export.txt')).strip()
            mimeType    = str(payload.get('mimeType', 'application/octet-stream')).strip()
            content_b64 = str(payload.get('contentBase64', '')).strip()

            # FIX P0: whitelist MIME types to prevent XSS via text/html or
            # other executable content types. Force safe default for unknown.
            _ALLOWED_EXPORT_MIME = frozenset({
                'application/octet-stream', 'text/plain', 'text/csv',
                'application/json', 'application/pdf',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword', 'image/jpeg', 'image/png', 'image/gif',
            })
            if mimeType not in _ALLOWED_EXPORT_MIME:
                mimeType = 'application/octet-stream'

            safe_name = re.sub(r'[/\\:*?"<>|]', '_', os.path.basename(fileName)) or 'export.txt'

            try:
                raw_bytes = base64.b64decode(content_b64)
            except Exception:
                return self._json(400, {'ok': False, 'error': 'Invalid base64 content'})
            # FIX P0: limit download size to prevent memory exhaustion
            if len(raw_bytes) > 50 * 1024 * 1024:  # 50MB
                return self._json(413, {'ok': False, 'error': 'File too large (max 50MB)'})

            self.send_response(200)
            self.send_header('Content-Type', mimeType)
            self.send_header('Content-Disposition', f'attachment; filename="{safe_name}"')
            self.send_header('Content-Length', str(len(raw_bytes)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw_bytes)
            return

        # GET /api/ping
        if path == '/api/ping':
            uptime_s = int(time.time() - _SERVER_START_TIME)
            return self._json(200, {
                'ok': True,
                'server': 'zeralda-erp',
                'version': '2.1',
                'auth_enabled': AUTH_ENABLED,
                'https_enabled': USE_HTTPS,
                'db_connected': DB_CONNECTED,
                'environment': ENVIRONMENT,
                'python_version': sys.version.split()[0],
                'uptime_seconds': uptime_s,
                'uptime_human': f'{uptime_s//3600}h {(uptime_s%3600)//60}m {uptime_s%60}s'
            })

        # GET /api/config/keygen-status — check if KEYGEN system is enabled
        if path == '/api/config/keygen-status' and self.command == 'GET':
            return self._json(200, {
                'ok': True,
                'keygen_enabled': KEYGEN_ENABLED,
                'auth_enabled': AUTH_ENABLED,
                'message': 'KEYGEN system enabled' if KEYGEN_ENABLED else 'KEYGEN system disabled'
            })

        # POST /api/client/alive
        if path == '/api/client/alive' and self.command in ('POST', 'GET'):
            payload = self._read_body() if self.command == 'POST' else {}
            sid = payload.get('sessionId') or self.headers.get('X-Client-Session', '')
            if not sid:
                # Fallback per request source (best effort)
                sid = f"{self._get_client_ip()}::{self.headers.get('User-Agent', '')[:40]}"
            _touch_client_presence(sid, {
                'path': payload.get('page') or self.path,
                'ua': self.headers.get('User-Agent', '')[:120]
            })
            active = _prune_client_presence()
            return self._json(200, {'ok': True, 'active_clients': active})

        # POST /api/client/bye
        if path == '/api/client/bye' and self.command in ('POST', 'GET'):
            payload = self._read_body() if self.command == 'POST' else {}
            sid = payload.get('sessionId') or self.headers.get('X-Client-Session', '')
            _remove_client_presence(sid)
            active = _prune_client_presence()
            return self._json(200, {'ok': True, 'active_clients': active})

        # POST /api/admin/factory-reset (admin only, dev/staging only)
        if path == '/api/admin/factory-reset' and self.command == 'POST':
            # Prevent factory reset in production
            if ENVIRONMENT == 'production':
                log_structured('ERROR', 'Factory reset attempted in production',
                              action='factory_reset', environment='production',
                              status='blocked')
                return self._json(403, {
                    'ok': False,
                    'error': 'Factory reset is disabled in production environment',
                    'code': 'FORBIDDEN_IN_PRODUCTION'
                })
            
            admin_user = self._require_auth('admin')
            if not admin_user:
                return True

            data = self._read_body()
            confirmation = str(data.get('confirmation', '')).strip().upper()
            if confirmation != 'RESET':
                log_structured('WARNING', 'Factory reset attempted with invalid confirmation',
                              action='factory_reset', initiator=admin_user.get('email'),
                              confirmation_provided=bool(confirmation), status='invalid_confirmation')
                return self._json(400, {
                    'ok': False,
                    'error': 'Confirmation token mismatch. Send confirmation=RESET'
                })

            with _lock:
                _factory_reset_all_data()

            log_structured('CRITICAL', 'Factory reset executed',
                          action='factory_reset', initiator=admin_user.get('email'),
                          environment=ENVIRONMENT, status='success')
            return self._json(200, {'ok': True, 'message': 'Factory reset completed'})

        # GET /api/store
        if path == '/api/store' and self.command == 'GET':
            if not self._require_store_permission(user, 'read'):
                return True

            params = self._query()
            key = params.get('key')

            if key:
                # Single key read — include version for optimistic locking
                # إصلاح: استخدم read lock للقراءة (يسمح بقراءات متعددة متزامنة)
                _rw_lock.acquire_read()
                try:
                    store = _read_store()
                    hist = _read_history()
                finally:
                    _rw_lock.release_read()
                value = store.get(key)
                return self._json(200, {
                    'ok': True,
                    'value': value,
                    'version': _current_key_version(hist, key)
                })
            else:
                # Full store read — only read store, skip history (167MB!)
                # History/versions are only needed for the history page.
                # إصلاح: استخدم read lock للقراءة
                _rw_lock.acquire_read()
                try:
                    store = _read_store()
                finally:
                    _rw_lock.release_read()
                
                log_structured(
                    'INFO',
                    'Storage read',
                    action='store_read',
                    user=user.get('email'),
                    role=user.get('role'),
                    key='*',
                    status='success'
                )
                return self._json(200, {'ok': True, 'data': store, 'versions': {}})

        # POST /api/store/mget — fetch only specific keys (incremental read).
        # Avoids pulling the entire store (which can be hundreds of MB) when the
        # client only needs a handful of scoped keys. Body: {"keys": ["k1","k2",...]}
        # Response includes per-key versions for optimistic locking support.
        if path == '/api/store/mget' and self.command == 'POST':
            if not self._require_store_permission(user, 'read'):
                return True
            data = self._read_body()
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {'ok': False, 'error': 'Payload too large'})
            keys = data.get('keys')
            if not isinstance(keys, list):
                return self._json(400, {'ok': False, 'error': 'keys must be a list'})
            result = {}
            versions = {}
            with _lock:
                store = _read_store()
                hist = _read_history()
                for k in keys:
                    if isinstance(k, str) and k in store:
                        result[k] = store[k]
                        versions[k] = _current_key_version(hist, k)
            return self._json(200, {'ok': True, 'data': result, 'versions': versions})

        # POST /api/store/bulk — write many keys at once (Google Drive restore, etc.)
        if path == '/api/store/bulk' and self.command == 'POST':
            if not self._require_store_permission(user, 'write'):
                return True
            data = self._read_body()
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {'ok': False, 'error': 'Payload too large'})
            bulk_data = data.get('data', {})
            if not isinstance(bulk_data, dict):
                return self._json(400, {'ok': False, 'error': 'data must be a dict of {key: value}'})
            written = 0
            skipped = 0
            skipped_keys = []
            with _lock:
                store = _read_store()
                hist = _read_history()
                undo_stack = _read_undo_stack()
                for k, v in bulk_data.items():
                    if not isinstance(k, str) or not k:
                        skipped += 1
                        if len(skipped_keys) < 20:
                            skipped_keys.append({'key': str(k), 'reason': 'invalid_key'})
                        continue
                    try:
                        vb = len(json.dumps(v, ensure_ascii=False).encode('utf-8'))
                        if vb > MAX_STORE_VALUE_BYTES:
                            skipped += 1
                            if len(skipped_keys) < 20:
                                skipped_keys.append({'key': k, 'reason': 'value_too_large', 'size_bytes': vb})
                            continue
                        old_val = store.get(k)
                        store[k] = v
                        hist, undo_stack = _record_change_locked(k, old_val, v, hist, undo_stack, flush=False)
                        written += 1
                    except Exception:
                        skipped += 1
                        if len(skipped_keys) < 20:
                            skipped_keys.append({'key': k, 'reason': 'serialization_or_write_error'})
                _write_history(hist)
                _write_undo_stack(undo_stack)
                _write_store(store)
            log_structured('INFO', 'Bulk store write', action='store_bulk_write',
                           user=user.get('email'), written=written, skipped=skipped,
                           skipped_keys_sample=skipped_keys[:5])
            # Notify SSE subscribers of each written key (single bulk event)
            if written > 0:
                _sse_broadcast('bulk', None, value={'written': written},
                               actor=user.get('email'))
            return self._json(200, {
                'ok': True,
                'written': written,
                'skipped': skipped,
                'skipped_keys': skipped_keys
            })

        # POST /api/store
        if path == '/api/store' and self.command == 'POST':
            if not self._require_store_permission(user, 'write'):
                return True

            data = self._read_body()
            if data.get('__error__') == 'PAYLOAD_TOO_LARGE':
                return self._json(413, {
                    'ok': False,
                    'error': 'Payload too large',
                    'code': 'PAYLOAD_TOO_LARGE'
                })

            key = data.get('key')
            value = data.get('value')
            expected_version = data.get('expected_version', None)
            
            if not key:
                return self._json(400, {'ok': False, 'error': 'key required'})

            try:
                value_bytes = len(json.dumps(value, ensure_ascii=False).encode('utf-8'))
            except Exception:
                return self._json(400, {'ok': False, 'error': 'value is not JSON-serializable'})

            if value_bytes > MAX_STORE_VALUE_BYTES:
                log_structured(
                    'WARNING',
                    'Storage write rejected: value too large',
                    action='store_write',
                    user=user.get('email'),
                    role=user.get('role'),
                    key=key,
                    size_bytes=value_bytes,
                    max_bytes=MAX_STORE_VALUE_BYTES,
                    status='rejected'
                )
                return self._json(413, {
                    'ok': False,
                    'error': f'value too large (max {MAX_STORE_VALUE_BYTES} bytes)',
                    'code': 'VALUE_TOO_LARGE'
                })
            
            # إصلاح: استخدم write lock (exclusive) للكتابة
            # _rw_lock.acquire_write() يمنع القراءات والكتابات الأخرى
            _rw_lock.acquire_write()
            try:
                store = _read_store()
                hist = _read_history()
                current_version = _current_key_version(hist, key)

                if expected_version is not None:
                    try:
                        expected_version = int(expected_version)
                    except Exception:
                        _rw_lock.release_write()
                        return self._json(400, {
                            'ok': False,
                            'error': 'expected_version must be an integer',
                            'code': 'INVALID_EXPECTED_VERSION'
                        })

                    if expected_version != current_version:
                        log_structured(
                            'WARNING',
                            'Storage conflict detected',
                            action='store_write_conflict',
                            user=user.get('email'),
                            role=user.get('role'),
                            key=key,
                            expected_version=expected_version,
                            current_version=current_version,
                            status='conflict'
                        )
                        _rw_lock.release_write()
                        return self._json(409, {
                            'ok': False,
                            'error': 'Version conflict',
                            'code': 'VERSION_CONFLICT',
                            'key': key,
                            'expected_version': expected_version,
                            'current_version': current_version,
                            'current_value': store.get(key)
                        })

                old_value = store.get(key)
                # Incremental write — only this key is persisted, not the whole store.
                _write_store_key(key, value)
                # إصلاح: atomic version — سجل التغيير ثم احسب الإصدار في نفس القفل
                hist, _ = _record_change_locked(key, old_value, value, hist=hist)
                new_version = _current_key_version(hist, key)
                # إصلاح: flush فوري للكتابات الحرجة (إذا كان المفتاح حرجاً)
                if key in ('zeralda-settings', 'zeralda-active-company'):
                    _write_history(hist, force_flush=True)
            finally:
                _rw_lock.release_write()

            log_structured(
                'INFO',
                'Storage write',
                action='store_write',
                user=user.get('email'),
                role=user.get('role'),
                key=key,
                status='success'
            )

            # Notify SSE subscribers (real-time sync across tabs/users)
            _sse_broadcast('set', key, value=value, version=new_version,
                           actor=user.get('email'))

            return self._json(200, {'ok': True, 'version': new_version})

        # DELETE /api/store
        if path == '/api/store' and self.command == 'DELETE':
            if not self._require_store_permission(user, 'delete'):
                return True

            params = self._query()
            key = params.get('key')
            
            if not key:
                return self._json(400, {'ok': False, 'error': 'key required'})
            
            with _lock:
                store = _read_store()
                if key in store:
                    old_value = store[key]
                    # Incremental delete — only this key is removed.
                    _delete_store_key(key)
                    _record_change_locked(key, old_value, None)

            log_structured(
                'INFO',
                'Storage delete',
                action='store_delete',
                user=user.get('email'),
                role=user.get('role'),
                key=key,
                status='success'
            )

            # Notify SSE subscribers (real-time sync across tabs/users)
            _sse_broadcast('delete', key, value=None,
                           actor=user.get('email'))

            return self._json(200, {'ok': True})

        # GET /api/store/history
        if path == '/api/store/history' and self.command == 'GET':
            if not self._require_store_permission(user, 'history'):
                return True

            params = self._query()
            key = params.get('key')
            version = params.get('version')
            
            with _lock:
                hist = _read_history()
            
            if not key:
                return self._json(400, {'ok': False, 'error': 'key required'})
            
            if key not in hist:
                return self._json(200, {'ok': True, 'history': []})
            
            if version is not None:
                try:
                    v = int(version)
                    if v < len(hist[key]):
                        log_structured(
                            'INFO',
                            'Storage history read by version',
                            action='store_history',
                            user=user.get('email'),
                            role=user.get('role'),
                            key=key,
                            version=v,
                            status='success'
                        )
                        return self._json(200, {'ok': True, 'value': hist[key][v]['value']})
                except Exception:
                    pass
                return self._json(200, {'ok': True, 'value': None})
            
            log_structured(
                'INFO',
                'Storage history read',
                action='store_history',
                user=user.get('email'),
                role=user.get('role'),
                key=key,
                status='success'
            )
            return self._json(200, {'ok': True, 'history': hist[key]})

        # POST /api/store/rollback
        if path == '/api/store/rollback' and self.command == 'POST':
            if not self._require_store_permission(user, 'rollback'):
                return True

            params = self._query()
            key = params.get('key')
            version = params.get('version')
            
            if not key or version is None:
                return self._json(400, {'ok': False, 'error': 'key and version required'})
            
            try:
                v_idx = int(version)
                with _lock:
                    hist = _read_history()
                    if key in hist and v_idx < len(hist[key]):
                        rollback_val = hist[key][v_idx]['value']
                        store = _read_store()
                        old_val = store.get(key)
                        # Incremental write — only this key is restored.
                        _write_store_key(key, rollback_val)
                        _record_change_locked(key, old_val, rollback_val)
                        log_structured(
                            'WARNING',
                            'Storage rollback',
                            action='store_rollback',
                            user=user.get('email'),
                            role=user.get('role'),
                            key=key,
                            version=v_idx,
                            status='success'
                        )
                        # Notify SSE subscribers
                        _sse_broadcast('rollback', key, value=rollback_val,
                                       actor=user.get('email'))
                        return self._json(200, {'ok': True})
            except Exception as e:
                return self._json(500, {'ok': False, 'error': str(e)})
            
            return self._json(404, {'ok': False, 'error': 'Version not found'})

        # POST /api/store/undo
        if path == '/api/store/undo' and self.command == 'POST':
            if not self._require_store_permission(user, 'undo'):
                return True

            with _lock:
                stack = _read_undo_stack()
                if not stack:
                    return self._json(400, {'ok': False, 'error': 'nothing to undo'})
                
                last_op = stack.pop()
                key = last_op['key']
                old_val = last_op['old_value']

                store = _read_store()
                current_val = store.get(key)
                # Incremental write — only this key is restored.
                if old_val is None:
                    _delete_store_key(key)
                else:
                    _write_store_key(key, old_val)
                _write_undo_stack(stack)
                hist = _read_history()
                if key not in hist:
                    hist[key] = []
                hist[key].append({
                    'version': len(hist[key]),
                    'value': old_val,
                    'old_value': current_val,
                    'timestamp': datetime.datetime.now().isoformat(),
                    'action': 'undo'
                })
                _prune_history_key_versions(hist, key)
                _write_history(hist)

            log_structured(
                'WARNING',
                'Storage undo',
                action='store_undo',
                user=user.get('email'),
                role=user.get('role'),
                key=key,
                status='success'
            )

            # Notify SSE subscribers
            _sse_broadcast('undo', key, value=old_val,
                           actor=user.get('email'))

            return self._json(200, {'ok': True, 'key': key})

        # GET /api/store/stats
        if path == '/api/store/stats' and self.command == 'GET':
            if not self._require_store_permission(user, 'stats'):
                return True

            with _lock:
                store = _read_store()
                hist = _read_history()
                undo_stack = _read_undo_stack()
            
            total_versions = sum(len(v) for v in hist.values())
            store_bytes = 0
            try:
                store_bytes = os.path.getsize(DATA_FILE) if os.path.exists(DATA_FILE) else 0
            except Exception:
                pass

            return self._json(200, {
                'ok': True,
                'keys': len(store),
                'versions': total_versions,
                'undo_stack_size': len(undo_stack),
                'store_size_bytes': store_bytes
            })

        # POST /api/store/cleanup — trim history and undo stack (admin only)
        if path == '/api/store/cleanup' and self.command == 'POST':
            if not self._require_store_permission(user, 'rollback'):
                return True
            data = self._read_body()
            keep_versions = int(data.get('keep_versions', MAX_HISTORY_VERSIONS_PER_KEY))
            keep_undo = int(data.get('keep_undo', MAX_UNDO_STACK))
            keep_versions = max(1, min(keep_versions, MAX_HISTORY_VERSIONS_PER_KEY))
            keep_undo = max(0, min(keep_undo, MAX_UNDO_STACK))

            with _lock:
                hist = _read_history()
                pruned_keys = 0
                pruned_versions = 0
                for key in list(hist.keys()):
                    entries = hist.get(key, [])
                    if isinstance(entries, list) and len(entries) > keep_versions:
                        removed = len(entries) - keep_versions
                        hist[key] = entries[-keep_versions:]
                        for idx, item in enumerate(hist[key]):
                            if isinstance(item, dict):
                                item['version'] = idx
                        pruned_versions += removed
                        pruned_keys += 1
                _write_history(hist)

                stack = _read_undo_stack()
                old_stack_len = len(stack)
                if len(stack) > keep_undo:
                    stack = stack[-keep_undo:]
                    _write_undo_stack(stack)

            log_structured('INFO', 'Store cleanup', action='store_cleanup',
                           user=user.get('email'), pruned_keys=pruned_keys,
                           pruned_versions=pruned_versions,
                           undo_trimmed=old_stack_len - len(stack), status='success')
            return self._json(200, {
                'ok': True,
                'pruned_keys': pruned_keys,
                'pruned_versions': pruned_versions,
                'undo_trimmed': old_stack_len - len(stack)
            })

        # ── SSE: GET /api/store/events ───────────────────────────────
        # Server-Sent Events stream for real-time storage change notifications.
        # The client connects with `new EventSource('/api/store/events')` and
        # receives 'store-change' events whenever any client writes/deletes a
        # key. This enables instant cross-tab / cross-user sync without polling.
        if path == '/api/store/events' and self.command == 'GET':
            # Auth: SSE supports token via query string (?token=...) because
            # EventSource cannot set custom headers. We also accept the
            # Authorization header for non-EventSource clients.
            if AUTH_ENABLED and REQUIRE_AUTH:
                token = self._get_session_token()
                if not token:
                    # EventSource can't set headers — try query string
                    qs_token = self._query().get('token', '')
                    if qs_token:
                        token = qs_token
                if not token:
                    return self._json(401, {'ok': False, 'error': 'Unauthorized',
                                            'code': 'UNAUTHORIZED'})
                ip = self.client_address[0] if self.client_address else ''
                ua = self.headers.get('User-Agent', '')
                sse_user = auth.validate_session(token, ip, ua)
                if not sse_user:
                    return self._json(401, {'ok': False, 'error': 'Unauthorized',
                                            'code': 'UNAUTHORIZED'})
            else:
                sse_user = {'role': 'admin', 'email': 'dev@local'}

            sid, q = _sse_subscribe()
            try:
                # Send SSE headers (no buffering, keep-alive)
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-transform')
                self.send_header('Connection', 'keep-alive')
                self.send_header('X-Accel-Buffering', 'no')  # disable nginx buffering
                self._cors()
                self.end_headers()

                # Initial hello event — confirms subscription + sends current seq
                hello = {
                    'seq': _sse_next_seq(),
                    'type': 'hello',
                    'subscriberId': sid,
                    'ts': datetime.datetime.now().isoformat()
                }
                self.wfile.write(("event: store-change\ndata: " +
                                  json.dumps(hello, ensure_ascii=False) + "\n\n").encode('utf-8'))
                try:
                    self.wfile.flush()
                except Exception:
                    pass

                # Heartbeat + event loop
                last_heartbeat = time.time()
                while True:
                    try:
                        event = q.get(timeout=1.0)
                        payload = json.dumps(event, ensure_ascii=False)
                        self.wfile.write(("event: store-change\ndata: " +
                                          payload + "\n\n").encode('utf-8'))
                        self.wfile.flush()
                    except _queue_module.Empty:
                        # No event — send heartbeat periodically to keep
                        # the connection alive through proxies/timeouts.
                        now = time.time()
                        if now - last_heartbeat >= _sse_heartbeat_interval:
                            self.wfile.write(b": heartbeat\n\n")
                            self.wfile.flush()
                            last_heartbeat = now
                    except (BrokenPipeError, ConnectionResetError, OSError):
                        # Client disconnected
                        break
                    # Check if client is still connected
                    if self._sse_client_disconnected():
                        break
            finally:
                _sse_unsubscribe(sid)
            return True

        return False

    def _sse_client_disconnected(self):
        """Best-effort check if the SSE client has closed the connection."""
        try:
            # On Windows, select() on wfile raises if the socket is closed.
            # A simpler heuristic: if wfile is closed.
            return bool(getattr(self, '_closed', False) or
                        (hasattr(self.wfile, 'closed') and self.wfile.closed))
        except Exception:
            return False

    # ══════════════════════════════════════════════════════════
    #  Main Request Handler
    # ══════════════════════════════════════════════════════════

    def do_GET(self):
        """Handle GET requests"""
        # Try auth endpoints
        if self.path.startswith('/api/auth/'):
            auth_result = self._handle_auth()
            if auth_result is not False:
                return
        
        # Try storage/OCR endpoints
        if self.path.startswith('/api/'):
            try:
                storage_result = self._handle_storage()
                if storage_result is not False:
                    return
            except Exception as _e:
                log_structured('ERROR', 'Storage handler exception in GET',
                               path=self.path, error=str(_e))
                return self._json(500, {'ok': False, 'error': 'Server error'})
            # API path not matched — return JSON 404 instead of serving a file
            return self._json(404, {'ok': False, 'error': 'Endpoint not found'})
        
        # Serve static files
        # FIX P0: validate the path before delegating to SimpleHTTPRequestHandler
        # to prevent path traversal attacks (e.g., /../../etc/passwd).
        # SimpleHTTPRequestHandler translates the URL path to a filesystem
        # path relative to the CWD, so we must reject any path containing
        # traversal sequences or targeting sensitive file types.
        import os as _os
        _path = self.path.split('?', 1)[0].split('#', 1)[0]
        # URL-decode to catch encoded traversal sequences
        from urllib.parse import unquote as _unquote
        _decoded = _unquote(_path)
        if '..' in _decoded or _decoded.startswith('/\\') or '\x00' in _decoded:
            return self._json(404, {'ok': False, 'error': 'Not found'})
        # Block sensitive file types
        _ext = _os.path.splitext(_decoded)[1].lower()
        _BLOCKED_EXT = {'.env', '.py', '.pyc', '.key', '.pem', '.cfg', '.ini', '.log', '.sql', '.db', '.sqlite'}
        if _ext in _BLOCKED_EXT:
            return self._json(404, {'ok': False, 'error': 'Not found'})
        # Block Windows device names
        _base = _os.path.basename(_decoded).rsplit('.', 1)[0].upper()
        if _base in ('CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                      'LPT1', 'LPT2', 'LPT3'):
            return self._json(404, {'ok': False, 'error': 'Not found'})
        return super().do_GET()

    def do_POST(self):
        """Handle POST requests"""
        # Try auth endpoints
        if self.path.startswith('/api/auth/'):
            auth_result = self._handle_auth()
            if auth_result is not False:
                return
        
        # Try storage endpoints
        if self.path.startswith('/api/'):
            try:
                storage_result = self._handle_storage()
                if storage_result is not False:
                    return
            except Exception as _e:
                log_structured('ERROR', 'Storage handler exception in POST',
                               path=self.path, error=str(_e))
                return self._json(500, {'ok': False, 'error': 'Server error'})
        
        # Not found
        return self._json(404, {'ok': False, 'error': 'Endpoint not found'})

    def do_DELETE(self):
        """Handle DELETE requests"""
        if self.path.startswith('/api/auth/'):
            auth_result = self._handle_auth()
            if auth_result is not False:
                return
        if self.path.startswith('/api/'):
            storage_result = self._handle_storage()
            if storage_result is not False:
                return
        return self._json(404, {'ok': False, 'error': 'Endpoint not found'})

    def do_PATCH(self):
        """Handle PATCH requests"""
        if self.path.startswith('/api/auth/'):
            auth_result = self._handle_auth()
            if auth_result is not False:
                return
        return self._json(404, {'ok': False, 'error': 'Endpoint not found'})

# ══════════════════════════════════════════════════════════
#  Server Initialization
# ══════════════════════════════════════════════════════════

def create_self_signed_cert():
    """Create self-signed certificate for HTTPS"""
    cert_dir = os.path.join(os.path.dirname(__file__), 'cert')
    os.makedirs(cert_dir, exist_ok=True)
    
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        print(f"[HTTPS] Using existing certificates")
        return True
    
    try:
        from OpenSSL import crypto
        
        # Create key pair
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        
        # Create self-signed cert
        cert = crypto.X509()
        cert.get_subject().C = "DZ"
        cert.get_subject().ST = "Algiers"
        cert.get_subject().L = "Zeralda"
        cert.get_subject().O = "Zeralda ERP"
        cert.get_subject().OU = "Development"
        cert.get_subject().CN = "localhost"
        cert.set_serial_number(1000)
        cert.gmtime_adj_notBefore(0)
        cert.gmtime_adj_notAfter(365*24*60*60)  # Valid for 1 year
        cert.set_issuer(cert.get_subject())
        cert.set_pubkey(k)
        cert.sign(k, 'sha256')
        
        # Save certificate
        with open(CERT_FILE, "wb") as f:
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        
        # Save private key
        with open(KEY_FILE, "wb") as f:
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        
        print(f"[HTTPS] [OK] Self-signed certificate created")
        return True
        
    except ImportError:
        print("[HTTPS] [WARN] pyOpenSSL not installed. Run: pip install pyOpenSSL")
        print("[HTTPS] [WARN] HTTPS disabled. Using HTTP instead.")
        return False
    except Exception as e:
        print(f"[HTTPS] [ERROR] Failed to create certificate: {e}")
        return False

def run_server():
    """Run the server"""
    # Kill any old server still running on this port, then wait until port is free
    import subprocess as _sp, socket as _sock
    _ps_creationflags = getattr(_sp, 'CREATE_NO_WINDOW', 0)
    def _port_in_use(port):
        with _sock.socket(_sock.AF_INET, _sock.SOCK_STREAM) as s:
            s.settimeout(0.3)
            return s.connect_ex(('127.0.0.1', port)) == 0

    if _port_in_use(PORT):
        try:
            _sp.run(
                ['powershell', '-NoProfile', '-Command',
                 f'Get-NetTCPConnection -LocalPort {PORT} -State Listen -ErrorAction SilentlyContinue'
                 f' | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}'],
                timeout=6, capture_output=True, creationflags=_ps_creationflags
            )
        except Exception:
            pass
        for _ in range(20):          # wait up to 4 s
            time.sleep(0.2)
            if not _port_in_use(PORT):
                break

    # Use SO_EXCLUSIVEADDRUSE on Windows to prevent port hijacking by other processes
    # (e.g. Zeralda_ERP_Launcher_core.exe spawning python -m http.server on the same port)
    # Also bind to BOTH IPv4 and IPv6 loopback so localhost resolution (::1 or 127.0.0.1) always hits us
    class _ExclusiveHTTPServer(http.server.ThreadingHTTPServer):
        allow_reuse_address = False
        def server_bind(self):
            import socket as _s
            if hasattr(_s, 'SO_EXCLUSIVEADDRUSE'):
                self.socket.setsockopt(_s.SOL_SOCKET, _s.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    server_address = (SERVER_HOST, PORT)
    httpd = _ExclusiveHTTPServer(server_address, EnhancedHandler)
    
    # Also bind to IPv6 loopback if we're on loopback-only mode
    httpd6 = None
    if SERVER_HOST in ('127.0.0.1', 'localhost'):
        try:
            import socket as _s6
            server_address6 = ('::1', PORT)
            # Create a dedicated IPv6 server class
            class _IPv6ExclusiveHTTPServer(_ExclusiveHTTPServer):
                address_family = _s6.AF_INET6
            httpd6 = _IPv6ExclusiveHTTPServer(server_address6, EnhancedHandler)
            print(f"[SERVER] Also listening on http://[::1]:{PORT} (IPv6 loopback)")
        except Exception as e:
            print(f"[SERVER] [WARN] Could not bind to IPv6 loopback: {e}")

    # Write PID file so Launcher can detect the correct server
    import os as _os
    pid_dir = _os.path.join(_os.environ.get('LOCALAPPDATA', ''), 'Zeralda ERP')
    _os.makedirs(pid_dir, exist_ok=True)
    pid_file = _os.path.join(pid_dir, 'chrome_launcher_server.pid')
    with open(pid_file, 'w') as f:
        f.write(str(_os.getpid()))
    
    # Enable HTTPS if requested
    if USE_HTTPS:
        if create_self_signed_cert():
            try:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(CERT_FILE, KEY_FILE)
                httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
                protocol = "HTTPS"
            except Exception as e:
                print(f"[HTTPS] [ERROR] Failed to enable HTTPS: {e}")
                protocol = "HTTP"
        else:
            protocol = "HTTP"
    else:
        protocol = "HTTP"
    
    print("=" * 60)
    print("  Zeralda ERP Server v2.0 - Enhanced Edition")
    print("=" * 60)
    print(f"  [OK] Server running on {protocol}://localhost:{PORT}")

    if CUSTOM_DOMAIN:
        print(f"  [OK] Custom domain: {protocol}://{CUSTOM_DOMAIN}:{PORT}")

    try:
        lan_ip = socket.gethostbyname(socket.gethostname())
        if lan_ip and lan_ip != '127.0.0.1':
            print(f"  [OK] LAN access URL: {protocol}://{lan_ip}:{PORT}")
    except Exception:
        pass

    if SERVER_HOST not in ('127.0.0.1', 'localhost'):
        print(f"  [OK] Network mode enabled (bind host: {SERVER_HOST})")
    print(f"  [AUTH] Authentication: {'[OK] Enabled' if AUTH_ENABLED else '[WARN] Disabled'}")
    print(f"  [HTTPS] HTTPS: {'[OK] Enabled' if protocol == 'HTTPS' else '[WARN] Disabled'}")
    if LAUNCH_MODE != 'launcher':
        print("  [WARN] Server started outside canonical launcher route. Prefer launcher\\Launch_ERP.cmd")
    print(f"  [AUTO] Auto shutdown on page close: {'[OK] Enabled' if AUTO_SHUTDOWN_ON_CLIENT_CLOSE else '[OFF] Disabled'}")
    if AUTH_ENABLED:
        print(f"  [AUTH] Default admin initialized. Check auth logs for setup.")
        try:
            auth.cleanup_expired_sessions()
        except Exception:
            pass
    print("=" * 60)
    print(f"  Press Ctrl+C to stop the server")
    print("=" * 60)
    
    if AUTO_SHUTDOWN_ON_CLIENT_CLOSE:
        def _monitor_client_presence():
            while True:
                time.sleep(5)
                now = time.time()
                active = _prune_client_presence(now)
                if not _client_seen_once:
                    continue
                if active > 0:
                    continue
                if (now - float(_last_client_activity_ts or 0)) < max(5, AUTO_SHUTDOWN_GRACE_SECONDS):
                    continue
                print("[SERVER] No active browser clients detected. Auto-shutdown triggered.")
                try:
                    _flush_history_to_disk()
                except Exception:
                    pass
                try:
                    httpd.shutdown()
                except Exception:
                    pass
                break

        monitor = threading.Thread(target=_monitor_client_presence, daemon=True)
        monitor.start()

    # ── Rogue http.server watchdog: kill any "python -m http.server" on our port ──
    def _rogue_server_watchdog():
        import subprocess as _sp, time as _t
        while True:
            _t.sleep(5)  # Check every 5 seconds
            try:
                _sp.run(
                    ['powershell', '-NoProfile', '-Command',
                     f'Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like "*http.server {PORT}*" }}'
                     f' | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}'],
                    timeout=5, capture_output=True, creationflags=_ps_creationflags
                )
            except Exception:
                pass

    _rogue_wd = threading.Thread(target=_rogue_server_watchdog, daemon=True, name='rogue-wd')
    _rogue_wd.start()

    # Immediate check on startup (don't wait for first watchdog cycle)
    import subprocess as _sp
    try:
        _sp.run(
            ['powershell', '-NoProfile', '-Command',
             f'Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -like "*http.server {PORT}*" }}'
             f' | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}'],
            timeout=5, capture_output=True, creationflags=_ps_creationflags
        )
    except Exception:
        pass

    # ── Launcher watchdog: stop server when Zeralda_ERP_Launcher.exe closes ──
    def _launcher_watchdog():
        import time as _t, subprocess as _sp, ctypes as _ct

        _PROCESS_QUERY_LIMITED = 0x1000
        _STILL_ACTIVE = 259

        def _find_launcher_pid():
            """Use PowerShell — avoids tasklist encoding issues on Arabic Windows."""
            try:
                r = _sp.run(
                    ['powershell', '-NoProfile', '-Command',
                     '(Get-Process -Name "Zeralda_ERP_Launcher","Zeralda_ERP_Launcher_core" -ErrorAction SilentlyContinue'
                     ' | Select-Object -First 1).Id'],
                    capture_output=True, text=True, timeout=5, creationflags=_ps_creationflags
                )
                s = r.stdout.strip()
                return int(s) if s.isdigit() else 0
            except Exception:
                return 0

        def _pid_alive(pid):
            """Win32 API — 100% reliable, no parsing needed."""
            try:
                h = _ct.windll.kernel32.OpenProcess(_PROCESS_QUERY_LIMITED, False, pid)
                if not h:
                    return False
                code = _ct.c_ulong(_STILL_ACTIVE)
                _ct.windll.kernel32.GetExitCodeProcess(h, _ct.byref(code))
                _ct.windll.kernel32.CloseHandle(h)
                return code.value == _STILL_ACTIVE
            except Exception:
                return True  # assume alive on error

        # Wait up to 90 s for launcher to appear
        launcher_pid = 0
        for _ in range(90):
            launcher_pid = _find_launcher_pid()
            if launcher_pid:
                break
            _t.sleep(1)

        if not launcher_pid:
            return  # Launcher never started — watchdog exits silently

        log_structured('INFO', f'Launcher watchdog active (PID {launcher_pid})',
                       action='launcher_watchdog', pid=launcher_pid)

        def _full_shutdown():
            """Kill server, stop PostgreSQL, clean PID file."""
            import subprocess as _sp

            # 1. Stop PostgreSQL — kill process directly (no admin needed)
            try:
                _sp.run(['taskkill', '/F', '/IM', 'postgres.exe', '/T'],
                        timeout=8, capture_output=True)
            except Exception:
                pass
            # Also try pg_ctl stop (graceful)
            try:
                pg_data = r'C:\Program Files\PostgreSQL\17\data'
                pg_ctl  = r'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
                if os.path.exists(pg_ctl):
                    _sp.run([pg_ctl, 'stop', '-D', pg_data, '-m', 'fast'],
                            timeout=10, capture_output=True)
            except Exception:
                pass

            # 2. Delete PID file
            try:
                _pid_path = os.path.join(
                    os.environ.get('LOCALAPPDATA', ''), 'Zeralda ERP',
                    'chrome_launcher_server.pid'
                )
                if os.path.exists(_pid_path):
                    os.remove(_pid_path)
            except Exception:
                pass

            # 3. Kill Launcher exe (both old and new names)
            try:
                _sp.run(['taskkill', '/F', '/IM', 'Zeralda_ERP_Launcher.exe', '/T'],
                        timeout=8, capture_output=True)
                _sp.run(['taskkill', '/F', '/IM', 'Zeralda_ERP_Launcher_core.exe', '/T'],
                        timeout=8, capture_output=True)
            except Exception:
                pass

            # 4. Kill Microsoft Edge WebView2
            try:
                _sp.run(['taskkill', '/F', '/IM', 'msedgewebview2.exe', '/T'],
                        timeout=8, capture_output=True)
            except Exception:
                pass

            # 5. Kill all Python processes (most reliable method)
            try:
                _sp.run(['taskkill', '/F', '/IM', 'python.exe', '/T'],
                        timeout=8, capture_output=True)
                _sp.run(['taskkill', '/F', '/IM', 'py.exe', '/T'],
                        timeout=8, capture_output=True)
            except Exception:
                pass

            # 6. Fallback: force-exit this process
            os._exit(0)

        # Monitor every 2 s until process exits
        while True:
            _t.sleep(2)
            if not _pid_alive(launcher_pid):
                log_structured('WARN', 'Launcher closed — stopping server + database',
                               action='launcher_watchdog', pid=launcher_pid)
                _t.sleep(0.3)
                _full_shutdown()

    _wdog = threading.Thread(target=_launcher_watchdog, daemon=True, name='launcher-watchdog')
    _wdog.start()

    # Start IPv6 loopback server in background thread if available
    if httpd6:
        _t6 = threading.Thread(target=httpd6.serve_forever, daemon=True, name='ipv6-server')
        _t6.start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[SERVER] Shutting down...")
        try:
            if AUTH_ENABLED:
                auth.flush_sessions()
        except Exception as _e:
            print(f"[SERVER] [WARN] Session flush failed: {_e}")
        # Flush pending history/undo writes before shutting down
        try:
            _flush_history_to_disk()
        except Exception as _e:
            print(f"[SERVER] [WARN] History flush failed: {_e}")
        httpd.shutdown()
        if httpd6:
            httpd6.shutdown()
        print("[SERVER] [OK] Server stopped")

if __name__ == '__main__':
    run_server()
