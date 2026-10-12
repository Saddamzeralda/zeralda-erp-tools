"""Storage service — shared JSON store with version history and undo stack.

Fixes vs. legacy server.py:
- All public read functions return deep copies to prevent cache mutation by callers.
- A single RLock guards store/history/undo caches.
- _read_store is always called under _lock internally (no more unlocked reads).
- mtime uses nanosecond precision when available.
- Backup failures are logged (no silent swallow).
- DB write failure no longer blocks the JSON snapshot (JSON is authoritative fallback).

Radical fixes (v2):
- HISTORY_EXCLUDE_KEYS: ephemeral keys (timestamps, zoom, theme) are NOT recorded
  in history — they generated hundreds of useless versions (188 for last-pull-ts).
- compact_history(): removes existing no-op entries (49.7% of file was polluted).
- _sse_drop_notice is now actually called when the SSE queue is full.
- _backup_store cleans up orphaned .tmp files (17 were accumulated).
- read_store catches ALL exceptions (was only JSONDecodeError) + updates cache on DB path.
- write_store uses UPSERT per-key instead of DELETE-all + re-INSERT (O(n) → O(1)).
- write_store_with_events removed (dead code).
"""
from __future__ import annotations

import atexit
import copy
import datetime
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

logger = logging.getLogger("zeralda.storage")

# Optional PostgreSQL support (mirrors legacy behavior)
try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    # FIX P1-4: URL-encode the DB credentials so passwords containing special
    # characters (@, :, /, %, etc.) no longer break the connection string.
    # Previously a password like "p@ss:w/ord" would silently corrupt the URL
    # and the engine would fall back to JSON-only storage.
    _DB_URL = os.getenv("DATABASE_URL")
    if not _DB_URL:
        _db_user = quote_plus(os.getenv("DB_USER", ""))
        _db_pass = quote_plus(os.getenv("DB_PASSWORD", ""))
        _db_host = os.getenv("DB_HOST", "localhost")
        _db_port = os.getenv("DB_PORT", "5432")
        _db_name = os.getenv("DB_NAME", "")
        _DB_URL = f"postgresql://{_db_user}:{_db_pass}@{_db_host}:{_db_port}/{_db_name}"
    # FIX P2-15: add pool options to prevent stale connections and exhaustion
    # under long-running workloads. pool_pre_ping validates each connection
    # before use; pool_recycle reclaims connections older than 1h.
    _engine = create_engine(_DB_URL, pool_pre_ping=True, pool_recycle=3600)
    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    # FIX P2-001: verify the connection actually works before claiming DB is
    # connected. Previously DB_CONNECTED was set to True purely on import
    # success, so a misconfigured URL silently degraded to JSON-only writes
    # while every write_store call still attempted (and failed) a DB round-trip.
    with _engine.connect() as _conn:
        _conn.execute(text("SELECT 1"))
    DB_CONNECTED = True
except Exception as e:  # noqa: BLE001
    DB_CONNECTED = False
    _engine = None
    _SessionLocal = None
    logger.warning("Database using JSON fallback: %s", e)


# ── Paths ───────────────────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = _BASE_DIR / "data"
DATA_FILE = DATA_DIR / "shared_store.json"
HISTORY_FILE = DATA_DIR / "shared_history.json"
UNDO_STACK_FILE = DATA_DIR / "undo_stack.json"
BACKUP_DIR = DATA_DIR / "backups"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Limits (env-overridable) ────────────────────────────────────────────────
MAX_STORE_VALUE_BYTES = int(os.getenv("MAX_STORE_VALUE_BYTES", "5242880"))  # 5MB
MAX_HISTORY_VERSIONS_PER_KEY = int(os.getenv("MAX_HISTORY_VERSIONS_PER_KEY", "500"))
MAX_UNDO_STACK = int(os.getenv("MAX_UNDO_STACK", "200"))
BACKUP_KEEP_COUNT = int(os.getenv("STORE_BACKUP_KEEP", "20"))
HISTORY_FLUSH_DELAY = float(os.getenv("HISTORY_FLUSH_DELAY", "5.0"))

# ── History exclusion ───────────────────────────────────────────────────────
# Ephemeral / volatile keys that change frequently but have NO undo value.
# Recording them generated 188 versions for last-pull-ts, 376 for preferred-language,
# 37 for page-zoom — polluting history with useless entries.
# The set is checked by base key (strip the ::companyId suffix) so it works for
# both scoped and unscoped variants.
HISTORY_EXCLUDE_KEYS = frozenset({
    "zeralda-last-pull-ts",
    "zeralda-page-zoom",
    "zeralda-sidebar-collapsed",
    "zeralda-theme",
    "preferred-language",
    "language",
    "zeralda-settings-backup",
    "server-clone-cleanup-v2",
    "zeralda-last-drive-backup",
    "zeralda-ai-chat-current",
    "zeralda-ai-chat-mode",
    "zeralda-remembered-login",
    "zeralda-remembered-email",
    "zeralda-saved-accounts",
    "zeralda-google-client-id",
    "zeralda-google-profile",
    "zeralda-google-token",
    "zeralda-auth-meta",
    "zeralda-auth-token",
    "zeralda-system-currency",
    "system-currency",
    "date-format",
    "time-format",
    "timezone",
    # Sensitive system keys that should never be recorded in history
    "zeralda-users",
    "zeralda-roles",
    "zeralda-sessions",
    "zeralda-settings",
    # Heavy logs, backups, and ephemeral locks that bloat history
    "zeralda-auto-backup",
    "zeralda-audit-log",
    "zeralda-ai-chat-sessions",
    "zeralda-ai-chat-history",
    "zeralda-google-backup-lock",
    "zeralda-layout-shell-html",
    "zeralda-pending-writes",
})


def _is_history_excluded(key: str) -> bool:
    """Check if a key should be excluded from history recording.

    Strips the ``::companyId`` suffix so scoped keys are also matched.
    """
    if key in HISTORY_EXCLUDE_KEYS:
        return True
    base = key.split("::", 1)[0]
    return base in HISTORY_EXCLUDE_KEYS

# ── Locking & caches ────────────────────────────────────────────────────────
_lock = threading.RLock()
_store_cache: Optional[Dict[str, Any]] = None
_store_cache_mtime_ns: int = 0
_history_cache: Optional[Dict[str, Any]] = None
_history_cache_mtime_ns: int = 0
_undo_stack_cache: Optional[List[Any]] = None
_undo_stack_cache_mtime_ns: int = 0

_history_dirty = False
_undo_stack_dirty = False
_history_flush_timer: Optional[threading.Timer] = None


# ── SSE broadcast bus ───────────────────────────────────────────────────────
# In-process pub/sub for store change events. SSE endpoint subscribes a queue;
# write_store / record_change publish events. Cross-process scaling would require
# Redis pub/sub, but for a single-process desktop ERP this is sufficient.
_sse_lock = threading.Lock()
_sse_subscribers: List["queue.Queue[Dict[str, Any]]"] = []
_sse_seq = 0


def _next_seq() -> int:
    global _sse_seq
    with _sse_lock:
        _sse_seq += 1
        return _sse_seq


def sse_subscribe() -> "queue.Queue[Dict[str, Any]]":
    """Register a new SSE subscriber queue. Returns the queue."""
    import queue as _queue
    q: _queue.Queue[Dict[str, Any]] = _queue.Queue(maxsize=256)
    with _sse_lock:
        _sse_subscribers.append(q)
    return q


def sse_unsubscribe(q: "queue.Queue[Dict[str, Any]]") -> None:
    """Remove a subscriber queue."""
    with _sse_lock:
        try:
            _sse_subscribers.remove(q)
        except ValueError:
            pass


def _sse_publish(event: Dict[str, Any]) -> None:
    """Broadcast an event to all subscribers. Non-blocking; drops on full queue.

    Radical fix: actually call ``_sse_drop_notice`` when an event is dropped so the
    client gets an immediate re-sync signal instead of waiting for a seq-gap.
    The drop-notice itself is published via a separate internal path to avoid
    infinite recursion (drop-notice → publish → drop → drop-notice → ...).
    """
    with _sse_lock:
        subs = list(_sse_subscribers)
    dropped_seq = event.get("seq")
    any_dropped = False
    for q in subs:
        try:
            q.put_nowait(event)
        except Exception:
            # Queue full — drop event. Notify clients so they re-sync immediately.
            any_dropped = True
    if any_dropped and dropped_seq is not None:
        # Publish drop-notice directly (bypass _sse_publish to avoid recursion).
        # FIX P1: reuse the same subscriber snapshot instead of re-copying
        # under lock — this avoids inconsistency between the two snapshots
        # and avoids an unnecessary lock acquisition.
        notice = {"type": "drop-notice", "seq": _next_seq(), "dropped_seq": dropped_seq}
        for q in subs:
            try:
                q.put_nowait(notice)
            except Exception:
                pass  # Best-effort; client will detect seq gap.


# FIX P2-003: the old ``_sse_drop_notice`` called ``_sse_publish`` which
# could recurse. The drop logic is now inlined in ``_sse_publish``. This
# standalone helper is kept as a direct (non-recursive) publisher for
# external callers and tests.
def _sse_drop_notice(dropped_seq: int) -> None:
    """Notify clients that an event was dropped so they can re-sync.

    Publishes directly to subscriber queues (bypassing ``_sse_publish``) to
    avoid infinite recursion.
    """
    notice = {"type": "drop-notice", "seq": _next_seq(), "dropped_seq": dropped_seq}
    with _sse_lock:
        subs = list(_sse_subscribers)
    for q in subs:
        try:
            q.put_nowait(notice)
        except Exception:
            pass


# ── Helpers ─────────────────────────────────────────────────────────────────
def _mtime_ns(path: Path) -> int:
    try:
        return os.stat(path).st_mtime_ns
    except OSError:
        return 0


def _deep_copy(value: Any) -> Any:
    """Return a deep copy (cheap for dict/list, safe for primitives).

    FIX P1-10: if deepcopy fails (e.g. unpicklable object), log the error and
    return the original reference. Previously the failure was silent, which
    broke the "all public reads return deep copies" contract without any
    diagnostic trail. Callers can still mutate the cache through the returned
    reference in the failure case, but at least the operator now sees a log
    entry explaining why.
    """
    try:
        return copy.deepcopy(value)
    except Exception as e:
        logger.warning("deepcopy failed, returning shared reference: %s", e)
        return value


# ── Store ───────────────────────────────────────────────────────────────────
def read_store() -> Dict[str, Any]:
    """Read the store. Always called under _lock. Returns a deep copy.

    Radical fix: catches ALL exceptions (was only JSONDecodeError) so a
    PermissionError or OSError no longer crashes the server. Also updates the
    in-memory cache when reading from DB so a later DB failure can fall back to
    a warm cache instead of an empty one.

    PERF #2 fix: when DB-connected, use the in-memory cache when warm instead
    of reading from DB on every call. The cache is invalidated on write_store
    and updated in-place by write_key, so it's always consistent. A DB read
    only happens when the cache is cold (first call after startup or after a
    cache invalidation).
    """
    global _store_cache, _store_cache_mtime_ns
    with _lock:
        # PERF #2: check cache first (even when DB-connected)
        if _store_cache is not None:
            mtime = _mtime_ns(DATA_FILE)
            if mtime == _store_cache_mtime_ns:
                return _deep_copy(_store_cache)

        if DB_CONNECTED:
            try:
                with _SessionLocal() as db:
                    result = db.execute(text("SELECT key, value FROM kv_store"))
                    data = {row[0]: json.loads(row[1]) for row in result}
                # Warm the cache so a later DB failure can fall back here.
                _store_cache = data
                _store_cache_mtime_ns = _mtime_ns(DATA_FILE)
                return _deep_copy(data)
            except Exception as e:
                logger.warning("DB read failed, falling back to JSON: %s", e)

        if not DATA_FILE.exists():
            _store_cache = None
            _store_cache_mtime_ns = 0
            return {}
        mtime = _mtime_ns(DATA_FILE)
        if _store_cache is not None and mtime == _store_cache_mtime_ns:
            return _deep_copy(_store_cache)
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            result = data if isinstance(data, dict) else {}
            _store_cache = result
            _store_cache_mtime_ns = mtime
            return _deep_copy(result)
        except Exception as e:  # noqa: BLE001 — was only JSONDecodeError
            logger.error("Store read failed: %s", e)
            # Return cached copy if available (better than empty on transient error)
            if _store_cache is not None:
                logger.info("Returning cached store copy (file unreadable)")
                return _deep_copy(_store_cache)
            # Radical fix: try the most recent backup before giving up
            try:
                if BACKUP_DIR.exists():
                    backups = sorted(
                        [p for p in BACKUP_DIR.iterdir()
                         if p.name.startswith("shared_store-") and p.suffix == ".json"],
                        key=lambda p: p.stat().st_mtime_ns,
                    )
                    if backups:
                        with open(backups[-1], "r", encoding="utf-8") as f:
                            data = json.load(f)
                        if isinstance(data, dict):
                            logger.info("Recovered from backup: %s", backups[-1].name)
                            _store_cache = data
                            _store_cache_mtime_ns = _mtime_ns(backups[-1])
                            return _deep_copy(data)
            except Exception as be:
                logger.error("Backup recovery also failed: %s", be)
            return {}


def read_store_counts() -> Dict[str, int]:
    """Return ``{key: len(value)}`` for list-valued keys without a full deepcopy.

    FIX P1-002 / AI-P1-001: callers that only need counts (e.g. the AI chat
    system prompt injection) previously paid for a full ``deepcopy`` of the
    entire store on every request. This helper reads from the cache when warm
    and only touches list lengths, avoiding the O(n) copy.
    """
    with _lock:
        if _store_cache is not None and _mtime_ns(DATA_FILE) == _store_cache_mtime_ns:
            src = _store_cache
        else:
            # Reuse read_store to warm the cache, then read from it directly
            # (read_store returns a copy; we want the cached reference).
            read_store()
            src = _store_cache if _store_cache is not None else {}
        return {k: len(v) for k, v in src.items() if isinstance(v, list) and v}


def read_store_value(key: str, default: Any = None) -> Any:
    """Return a single store value without copying the whole store.

    FIX P1-002: lightweight accessor for callers that need one key (e.g. the
    active company id). Returns a deepcopy of the value so callers cannot
    mutate the cached store through the returned reference.
    """
    with _lock:
        if _store_cache is not None and _mtime_ns(DATA_FILE) == _store_cache_mtime_ns:
            src = _store_cache
        else:
            read_store()
            src = _store_cache if _store_cache is not None else {}
        val = src.get(key, default)
        return _deep_copy(val) if val is not None else default


# ── Unified settings migration ──────────────────────────────────────────────
# RADICAL FIX: zeralda-settings is the canonical source for companies,
# activeCompanyId, preferredLanguage, systemCurrency, users, roles, etc.
# Standalone keys (zeralda-companies, zeralda-active-company, preferred-language,
# language, system-currency, zeralda-users) are legacy shadows.
# This migration runs once on startup to merge any orphaned standalone data
# into zeralda-settings so all readers see a consistent view.

_MIGRATION_DONE = False


def migrate_unified_settings() -> None:
    """Merge legacy standalone keys into zeralda-settings (canonical source).

    Runs on every startup if settings.companies is empty.
    Idempotent — safe to call multiple times.
    Merges:
      - zeralda-companies  → zeralda-settings.companies
      - zeralda-active-company → zeralda-settings.activeCompanyId
      - preferred-language / language → zeralda-settings.preferredLanguage
      - system-currency → zeralda-settings.systemCurrency
      - zeralda-users → zeralda-settings.users
    After merge, standalone keys are kept as shadows (synced copies) so
    legacy client code that reads them still works.
    """
    with _lock:
        store = read_store()
        settings = store.get("zeralda-settings")
        if not isinstance(settings, dict):
            settings = {}
        changed = False

        # ── companies ──
        zc = store.get("zeralda-companies")
        if isinstance(zc, str):
            try:
                import json as _j
                zc = _j.loads(zc)
            except Exception:
                zc = None
        if isinstance(zc, dict):
            zc = [zc]
        if isinstance(zc, list) and zc:
            s_comps = settings.get("companies")
            if not isinstance(s_comps, list):
                s_comps = []
            # حماية: إذا zeralda-settings.companies فارغة، استعدها من zeralda-companies
            if len(s_comps) == 0 and len(zc) > 0:
                settings["companies"] = zc
                changed = True
            else:
                existing_ids = {str(c.get("id", "")) for c in s_comps if isinstance(c, dict)}
                for c in zc:
                    if isinstance(c, dict) and str(c.get("id", "")) not in existing_ids:
                        s_comps.append(c)
                        existing_ids.add(str(c.get("id", "")))
                        changed = True
                # If zeralda-companies has MORE companies, it's the authoritative source
                if len(zc) > len(s_comps):
                    settings["companies"] = zc
                    changed = True
                elif s_comps != zc and len(s_comps) >= len(zc):
                    # settings has more or equal — keep settings, update shadow
                    pass

        # ── activeCompanyId ──
        ac = store.get("zeralda-active-company")
        if isinstance(ac, str) and ac and not settings.get("activeCompanyId"):
            settings["activeCompanyId"] = ac
            changed = True

        # ── preferredLanguage ──
        pl = store.get("preferred-language")
        if isinstance(pl, str) and pl and not settings.get("preferredLanguage"):
            settings["preferredLanguage"] = pl
            changed = True
        # language is a legacy alias
        lang = store.get("language")
        if isinstance(lang, str) and lang and not settings.get("preferredLanguage"):
            settings["preferredLanguage"] = lang
            changed = True

        # ── systemCurrency ──
        sc = store.get("system-currency")
        if isinstance(sc, str) and sc and not settings.get("systemCurrency"):
            settings["systemCurrency"] = sc
            changed = True

        # ── users ──
        zu = store.get("zeralda-users")
        if isinstance(zu, str):
            try:
                import json as _j
                zu = _j.loads(zu)
            except Exception:
                zu = None
        if isinstance(zu, list) and zu and not settings.get("users"):
            settings["users"] = zu
            changed = True

        if changed:
            store["zeralda-settings"] = settings
            write_store(store)
            logger.info("Unified settings migration: merged legacy keys into zeralda-settings")
        else:
            logger.debug("Unified settings migration: no changes needed")

        # Automatically check and compact history if it exceeds threshold
        auto_maintain_history()



def sync_settings_shadows(store: Dict[str, Any]) -> bool:
    """Update standalone shadow keys from zeralda-settings (canonical source).

    Called after write_store to keep shadows in sync. Returns True if any
    shadow was updated (caller should re-write the store).

    Shadows updated:
      - zeralda-companies ← zeralda-settings.companies
      - zeralda-active-company ← zeralda-settings.activeCompanyId
      - preferred-language ← zeralda-settings.preferredLanguage
      - language ← zeralda-settings.preferredLanguage (legacy alias)
      - system-currency ← zeralda-settings.systemCurrency
    """
    settings = store.get("zeralda-settings")
    if not isinstance(settings, dict):
        return False
    changed = False

    comps = settings.get("companies")
    if isinstance(comps, list) and store.get("zeralda-companies") != comps:
        store["zeralda-companies"] = comps
        changed = True

    ac = settings.get("activeCompanyId")
    if isinstance(ac, str) and ac and store.get("zeralda-active-company") != ac:
        store["zeralda-active-company"] = ac
        changed = True

    pl = settings.get("preferredLanguage")
    if isinstance(pl, str) and pl:
        if store.get("preferred-language") != pl:
            store["preferred-language"] = pl
            changed = True
        if store.get("language") != pl:
            store["language"] = pl
            changed = True

    sc = settings.get("systemCurrency")
    if isinstance(sc, str) and sc and store.get("system-currency") != sc:
        store["system-currency"] = sc
        changed = True

    return changed


_LAST_BACKUP_TS_NS = 0
_BACKUP_INTERVAL_NS = 60 * 1_000_000_000  # 60 seconds


def _backup_store(store: Dict[str, Any]) -> None:
    """Timestamped backup before writes. Keeps last BACKUP_KEEP_COUNT snapshots.

    Radical fix: also cleans up orphaned ``.tmp`` files left by crashed writes
    (17 zero-byte .tmp files were accumulated in data/backups/). Logs failures
    instead of silently swallowing them.

    FIX P1-001: backups are now throttled to one per ``_BACKUP_INTERVAL_NS``
    (60s). Previously every ``write_store`` call produced a full JSON snapshot,
    which tripled I/O per write and quickly filled the backup directory. The
    first write after startup always backs up (so a snapshot exists), and a
    backup is forced by ``factory_reset`` via ``_force_backup_store``.

    Orphaned ``.tmp`` cleanup runs on *every* call (even when the throttled
    snapshot is skipped) so crashed writes are still reaped promptly.
    """
    global _LAST_BACKUP_TS_NS
    if not store or not DATA_FILE.exists():
        return

    # Always clean orphaned .tmp files first (cheap, prevents accumulation)
    try:
        if BACKUP_DIR.exists():
            for p in BACKUP_DIR.iterdir():
                if p.name.startswith("shared_store-") and p.suffix == ".tmp":
                    try:
                        p.unlink()
                    except OSError:
                        pass
    except Exception:
        pass

    now_ns = time.time_ns()
    if _LAST_BACKUP_TS_NS and (now_ns - _LAST_BACKUP_TS_NS) < _BACKUP_INTERVAL_NS:
        return
    _LAST_BACKUP_TS_NS = now_ns
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        backup_path = BACKUP_DIR / f"shared_store-{ts}.json"
        tmp_path = backup_path.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, backup_path)
        # Prune old .json backups beyond the keep count
        json_backups = sorted(
            [p for p in BACKUP_DIR.iterdir()
             if p.name.startswith("shared_store-") and p.suffix == ".json"],
            key=lambda p: p.stat().st_mtime_ns,
        )
        for old in json_backups[:-BACKUP_KEEP_COUNT]:
            try:
                old.unlink()
            except OSError as e:
                logger.warning("Could not delete old backup %s: %s", old, e)
    except Exception as e:
        # Log instead of silent swallow (legacy bug #5)
        logger.error("Backup failed: %s", e)


def _force_backup_store(store: Dict[str, Any]) -> None:
    """Force a backup bypassing the throttle (used by factory_reset)."""
    global _LAST_BACKUP_TS_NS
    _LAST_BACKUP_TS_NS = 0
    _backup_store(store)


def write_store(store: Dict[str, Any]) -> None:
    """Write store to JSON (authoritative) + optional DB.

    Radical fix: DB write now uses UPSERT per-key instead of DELETE-all +
    re-INSERT-all. This avoids O(n) DELETE + O(n) INSERT on every write, prevents
    the table from being emptied mid-transaction if the process crashes, and
    respects the PostgreSQL 65535 parameter limit by batching. JSON is written
    first and never blocked by DB failure (legacy bug #6).

    FIX P0-001: the entire write (JSON + cache invalidation + DB) is now
    wrapped in ``_lock`` so concurrent ``write_store`` calls cannot interleave
    and corrupt the file or leave the cache in an inconsistent state.
    ``_lock`` is an ``RLock`` so callers that already hold it (e.g. the AI
    action handlers) will not deadlock.
    """
    if not isinstance(store, dict):
        raise ValueError("Store must be a dictionary")

    with _lock:
        _backup_store(store)

        # JSON snapshot — authoritative fallback, always written first
        tmp_file = DATA_FILE.with_suffix(".json.tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(store, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, DATA_FILE)
        except Exception as e:
            logger.error("Failed to write JSON store: %s", e)
            raise

        # Invalidate cache
        global _store_cache, _store_cache_mtime_ns
        _store_cache = None
        _store_cache_mtime_ns = 0

        # DB write — best-effort, never blocks JSON.
        # Radical fix: UPSERT per-key in batches of 1000 (avoids 65535 param limit).
        if DB_CONNECTED:
            try:
                with _SessionLocal() as db:
                    # Detect keys to DELETE (present in DB but not in store)
                    try:
                        existing = db.execute(text("SELECT key FROM kv_store"))
                        existing_keys = {row[0] for row in existing}
                    except Exception:
                        existing_keys = set()
                    store_keys = set(store.keys())
                    to_delete = existing_keys - store_keys
                    if to_delete:
                        # Batch DELETE in chunks of 1000
                        to_delete_list = list(to_delete)
                        for i in range(0, len(to_delete_list), 1000):
                            chunk = to_delete_list[i:i + 1000]
                            placeholders = ", ".join(f":d{j}" for j in range(len(chunk)))
                            params = {f"d{j}": k for j, k in enumerate(chunk)}
                            db.execute(
                                text(f"DELETE FROM kv_store WHERE key IN ({placeholders})"),
                                params,
                            )
                    # FIX P1-003: use executemany for the UPSERT batch instead
                    # of one db.execute per key. This collapses N round-trips
                    # into one prepared statement and is the recommended
                    # SQLAlchemy 2.x pattern for bulk upserts.
                    items = list(store.items())
                    upsert_stmt = text(
                        "INSERT INTO kv_store (key, value, updated_at) "
                        "VALUES (:key, :val, CURRENT_TIMESTAMP) "
                        "ON CONFLICT (key) DO UPDATE SET "
                        "value = :val, updated_at = CURRENT_TIMESTAMP"
                    )
                    for i in range(0, len(items), 1000):
                        chunk = items[i:i + 1000]
                        params = [
                            {"key": k, "val": json.dumps(v, ensure_ascii=False)}
                            for k, v in chunk
                        ]
                        db.execute(upsert_stmt, params)
                    db.commit()
            except Exception as e:
                # FIX P0: The `with _SessionLocal() as db` context manager
                # automatically rolls back on exception, so no explicit
                # rollback is needed here. The transaction is released when
                # the context exits, preventing connection pool exhaustion.
                logger.warning("DB write failed (JSON snapshot is authoritative): %s", e)


def write_key(key: str, value: Any) -> None:
    """Write a single key to the store efficiently.

    PERF #1+#3 fix: instead of rewriting the entire JSON file and UPSERTing
    all keys in the DB, this function:
    1. Updates the in-memory cache in-place (no invalidation)
    2. Rewrites the JSON file with the updated cache (single I/O)
    3. Does a targeted single-key UPSERT in the DB (not all keys)
    4. Does a throttled backup (same as write_store)

    Must be called under _lock (same as write_store).
    """
    global _store_cache, _store_cache_mtime_ns

    with _lock:
        # Ensure cache is warm
        if _store_cache is None:
            read_store()

        store = _store_cache if _store_cache is not None else {}
        store[key] = value

        # Backup (throttled)
        _backup_store(store)

        # JSON snapshot — write the full store (still needed as authoritative fallback)
        tmp_file = DATA_FILE.with_suffix(".json.tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(store, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, DATA_FILE)
        except Exception as e:
            logger.error("Failed to write JSON store (write_key): %s", e)
            raise

        # PERF #3: update cache in-place instead of invalidating
        _store_cache = store
        _store_cache_mtime_ns = _mtime_ns(DATA_FILE)

        # DB write — single-key UPSERT only
        if DB_CONNECTED:
            try:
                with _SessionLocal() as db:
                    upsert_stmt = text(
                        "INSERT INTO kv_store (key, value, updated_at) "
                        "VALUES (:key, :val, CURRENT_TIMESTAMP) "
                        "ON CONFLICT (key) DO UPDATE SET "
                        "value = :val, updated_at = CURRENT_TIMESTAMP"
                    )
                    db.execute(upsert_stmt, {"key": key, "val": json.dumps(value, ensure_ascii=False)})
                    db.commit()
            except Exception as e:
                logger.warning("DB write_key failed (JSON is authoritative): %s", e)


def delete_key(key: str) -> None:
    """Delete a single key from the store efficiently.

    Like write_key but for deletions: updates cache in-place, rewrites JSON,
    does a targeted single-key DELETE in the DB.
    Must be called under _lock (same as write_store).
    """
    global _store_cache, _store_cache_mtime_ns

    with _lock:
        if _store_cache is None:
            read_store()

        store = _store_cache if _store_cache is not None else {}
        if key not in store:
            return

        del store[key]

        _backup_store(store)

        tmp_file = DATA_FILE.with_suffix(".json.tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(store, f, ensure_ascii=False, indent=2)
            os.replace(tmp_file, DATA_FILE)
        except Exception as e:
            logger.error("Failed to write JSON store (delete_key): %s", e)
            raise

        _store_cache = store
        _store_cache_mtime_ns = _mtime_ns(DATA_FILE)

        if DB_CONNECTED:
            try:
                with _SessionLocal() as db:
                    db.execute(text("DELETE FROM kv_store WHERE key = :k"), {"k": key})
                    db.commit()
            except Exception as e:
                logger.warning("DB delete_key failed (JSON is authoritative): %s", e)


def _values_equal(a: Any, b: Any) -> bool:
    """Structural equality for store values (handles dict/list/primitives).

    FIX P2-004: numeric values compare by value, not by type, so ``1``
    (int) equals ``1.0`` (float). Previously ``type(a) is not type(b)``
    rejected these as different, generating spurious no-op history entries
    when JSON round-trips turned an int into a float.
    """
    if a is b:
        return True
    # Numeric equality across int/float (1 == 1.0)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        if len(a) != len(b):
            return False
        for k in a:
            if k not in b or not _values_equal(a[k], b[k]):
                return False
        return True
    if isinstance(a, list):
        if len(a) != len(b):
            return False
        return all(_values_equal(x, y) for x, y in zip(a, b))
    return a == b



def compact_history(max_versions_per_key: Optional[int] = 50) -> Dict[str, int]:
    """Remove no-op entries (value == old_value) from history, drop excluded keys,
    cap maximum version depth per key, and re-number versions.

    Returns a dict with stats: ``{"removed_noops": N, "removed_excluded": N,
    "removed_depth": N, "remaining": N}``.
    """
    with _lock:
        hist = read_history()
        removed_noops = 0
        removed_excluded = 0
        removed_depth = 0
        for key in list(hist.keys()):
            # Drop history for excluded keys entirely
            if _is_history_excluded(key):
                removed_excluded += len(hist[key])
                del hist[key]
                continue
            entries = hist[key]
            if not isinstance(entries, list):
                continue
            # Keep only entries where value != old_value (real changes)
            cleaned = [
                e for e in entries
                if not _values_equal(e.get("value"), e.get("old_value"))
            ]
            removed_noops += len(entries) - len(cleaned)

            # Cap depth to max_versions_per_key to avoid runaway file size
            if max_versions_per_key and len(cleaned) > max_versions_per_key:
                excess = len(cleaned) - max_versions_per_key
                removed_depth += excess
                cleaned = cleaned[-max_versions_per_key:]

            # Re-number versions sequentially
            for i, e in enumerate(cleaned):
                if isinstance(e, dict):
                    e["version"] = i
            if cleaned:
                hist[key] = cleaned
            else:
                del hist[key]
        write_history(hist)
        # Force immediate flush so the compacted file is durable
        flush_pending()
        return {
            "removed_noops": removed_noops,
            "removed_excluded": removed_excluded,
            "removed_depth": removed_depth,
            "remaining": sum(len(v) for v in hist.values()),
        }


def auto_maintain_history(threshold_bytes: int = 2 * 1024 * 1024) -> Optional[Dict[str, Any]]:
    """Automatically check and compact history if HISTORY_FILE exceeds threshold_bytes (default 2MB).
    Also trims ancient oversized .bak files to conserve disk space and speed up startup.
    """
    try:
        bak_file = DATA_DIR / "shared_history.bak.json"
        if bak_file.exists() and bak_file.stat().st_size > threshold_bytes:
            try:
                bak_file.unlink()
                logger.info("Cleaned up stale oversized shared_history.bak.json")
            except Exception:
                pass

        if HISTORY_FILE.exists() and HISTORY_FILE.stat().st_size > threshold_bytes:
            orig_sz = HISTORY_FILE.stat().st_size
            logger.info("Auto-maintaining history: file size (%d bytes) exceeds threshold (%d bytes). Compacting...",
                        orig_sz, threshold_bytes)
            stats = compact_history(max_versions_per_key=30)
            new_sz = HISTORY_FILE.stat().st_size if HISTORY_FILE.exists() else 0
            stats["orig_bytes"] = orig_sz
            stats["new_bytes"] = new_sz
            logger.info("Auto-maintain completed: original=%d KB, new=%d KB, stats=%s",
                        orig_sz // 1024, new_sz // 1024, stats)
            return stats
    except Exception as e:
        logger.warning("Auto-maintain history failed: %s", e)
    return None




# ── History & Undo ──────────────────────────────────────────────────────────
def read_history() -> Dict[str, Any]:
    global _history_cache, _history_cache_mtime_ns
    with _lock:
        # If the cache has unsaved changes (dirty), return it even if the file
        # doesn't exist yet — the deferred flush hasn't written it to disk.
        if _history_cache is not None and _history_dirty:
            return _deep_copy(_history_cache)
        if not HISTORY_FILE.exists():
            _history_cache = None
            _history_cache_mtime_ns = 0
            return {}
        mtime = _mtime_ns(HISTORY_FILE)
        if _history_cache is not None and mtime == _history_cache_mtime_ns:
            return _deep_copy(_history_cache)
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            result = data if isinstance(data, dict) else {}
            _history_cache = result
            _history_cache_mtime_ns = mtime
            return _deep_copy(result)
        except Exception as e:
            # FIX P2-13: log the error instead of silently returning {}.
            # A corrupted history file used to be invisible to operators.
            logger.error("History read failed: %s", e)
            return {}


def read_undo_stack() -> List[Any]:
    global _undo_stack_cache, _undo_stack_cache_mtime_ns
    with _lock:
        # Return dirty cache even if file doesn't exist yet (deferred flush)
        if _undo_stack_cache is not None and _undo_stack_dirty:
            return _deep_copy(_undo_stack_cache)
        if not UNDO_STACK_FILE.exists():
            _undo_stack_cache = None
            _undo_stack_cache_mtime_ns = 0
            return []
        mtime = _mtime_ns(UNDO_STACK_FILE)
        if _undo_stack_cache is not None and mtime == _undo_stack_cache_mtime_ns:
            return _deep_copy(_undo_stack_cache)
        try:
            with open(UNDO_STACK_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            result = data if isinstance(data, list) else []
            _undo_stack_cache = result
            _undo_stack_cache_mtime_ns = mtime
            return _deep_copy(result)
        except Exception as e:
            # FIX P2-13: log the error instead of silently returning [].
            logger.error("Undo stack read failed: %s", e)
            return []


def _schedule_history_flush() -> None:
    """Debounced flush of history/undo to disk (avoids 174MB write per POST)."""
    global _history_flush_timer
    # FIX P0: hold _lock during timer cancel-and-replace to prevent the
    # race where the old timer fires between cancel and new timer start.
    with _lock:
        if _history_flush_timer is not None:
            try:
                _history_flush_timer.cancel()
            except Exception:
                pass
        _history_flush_timer = threading.Timer(HISTORY_FLUSH_DELAY, _flush_history_to_disk)
        _history_flush_timer.daemon = True
        _history_flush_timer.start()


def _flush_history_to_disk() -> None:
    global _history_dirty, _undo_stack_dirty, _history_flush_timer, _history_cache, _undo_stack_cache
    # FIX P0-1: clear the timer reference INSIDE the lock to prevent a race
    # where _schedule_history_flush (which also acquires _lock) sets a new
    # timer between this line and the lock acquisition — that new timer would
    # be silently nulled here, losing the pending flush.
    with _lock:
        _history_flush_timer = None
        if _history_dirty and _history_cache is not None:
            try:
                tmp = HISTORY_FILE.with_suffix(".json.tmp")
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(_history_cache, f, ensure_ascii=False, indent=2)
                os.replace(tmp, HISTORY_FILE)
                global _history_cache_mtime_ns
                _history_cache_mtime_ns = _mtime_ns(HISTORY_FILE)
                _history_dirty = False
            except Exception as e:
                logger.error("History flush failed: %s", e)
        if _undo_stack_dirty and _undo_stack_cache is not None:
            try:
                tmp = UNDO_STACK_FILE.with_suffix(".json.tmp")
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(_undo_stack_cache, f, ensure_ascii=False, indent=2)
                os.replace(tmp, UNDO_STACK_FILE)
                global _undo_stack_cache_mtime_ns
                _undo_stack_cache_mtime_ns = _mtime_ns(UNDO_STACK_FILE)
                _undo_stack_dirty = False
            except Exception as e:
                logger.error("Undo flush failed: %s", e)


def write_history(hist: Dict[str, Any]) -> None:
    """Update in-memory history cache and schedule deferred disk flush."""
    global _history_cache, _history_dirty
    with _lock:
        _history_cache = hist
        _history_dirty = True
    _schedule_history_flush()


def write_undo_stack(stack: List[Any]) -> None:
    global _undo_stack_cache, _undo_stack_dirty
    with _lock:
        if isinstance(stack, list) and len(stack) > MAX_UNDO_STACK:
            stack = stack[-MAX_UNDO_STACK:]
        _undo_stack_cache = stack
        _undo_stack_dirty = True
    _schedule_history_flush()


def flush_pending() -> None:
    """Force-flush pending history/undo writes (call on shutdown)."""
    _flush_history_to_disk()


# FIX P0-005: register flush_pending with atexit so the deferred 5s history
# flush is forced when the interpreter exits cleanly. Without this, a crash
# or abrupt shutdown within the 5s debounce window loses the last batch of
# history entries (and the undo stack). atexit runs on normal exit, SIGTERM
# (default handler) and sys.exit(); it does NOT run on SIGKILL/hard crash,
# but those cases cannot be handled from Python anyway.
atexit.register(flush_pending)


# ── Version tracking ───────────────────────────────────────────────────────
def _prune_history_key_versions(hist: Dict[str, Any], key: str) -> None:
    """Prune history entries for a key to ``MAX_HISTORY_VERSIONS_PER_KEY``.

    FIX P2-002: after pruning, the ``version`` field of each remaining entry
    is rewritten to match its new index, so ``current_key_version`` (which
    returns ``len(entries) - 1``) stays consistent with the stored version
    numbers. Without this rewrite, optimistic-locking clients would see
    version mismatches after a prune.
    """
    entries = hist.get(key)
    if not isinstance(entries, list):
        return
    if len(entries) <= MAX_HISTORY_VERSIONS_PER_KEY:
        return
    pruned = entries[-MAX_HISTORY_VERSIONS_PER_KEY:]
    for idx, item in enumerate(pruned):
        if isinstance(item, dict):
            item["version"] = idx
    hist[key] = pruned


def record_change_locked(
    key: str,
    old_val: Any,
    new_val: Any,
    hist: Optional[Dict[str, Any]] = None,
    stack: Optional[List[Any]] = None,
    flush: bool = True,
) -> Tuple[Dict[str, Any], List[Any]]:
    """Record a change. Caller MUST hold _lock (or use record_change).

    Radical fix: skip recording when old and new values are structurally equal
    (no-op). Also skip recording for ephemeral keys in HISTORY_EXCLUDE_KEYS
    (last-pull-ts, page-zoom, theme, etc.) — they generated 188+ useless
    versions and polluted the history file. The undo stack is also skipped for
    no-ops and excluded keys so undo doesn't restore useless values.
    """
    if hist is None:
        hist = read_history()
    if stack is None:
        stack = read_undo_stack()

    # Skip excluded keys entirely (ephemeral keys with no undo value)
    if _is_history_excluded(key):
        return hist, stack

    # Skip no-op changes (same value written back). This is the root cause of
    # the 8MB+ shared_history.json — every setItem call recorded an entry even
    # when the value was identical.
    if _values_equal(old_val, new_val):
        return hist, stack

    if key not in hist:
        hist[key] = []
    version = len(hist[key])
    hist[key].append(
        {
            "version": version,
            "value": new_val,
            "old_value": old_val,
            "timestamp": datetime.datetime.now().isoformat(),
            "action": "set",
        }
    )
    _prune_history_key_versions(hist, key)

    current_version = len(hist.get(key, [])) - 1
    stack.append({"key": key, "version": current_version, "old_value": old_val})
    if len(stack) > MAX_UNDO_STACK:
        stack = stack[-MAX_UNDO_STACK:]

    if flush:
        write_history(hist)
        write_undo_stack(stack)
    return hist, stack


def record_change(key: str, old_val: Any, new_val: Any) -> None:
    """Record a change (acquires _lock)."""
    with _lock:
        record_change_locked(key, old_val, new_val)


def current_key_version(hist: Dict[str, Any], key: str) -> int:
    entries = hist.get(key)
    if not isinstance(entries, list) or len(entries) == 0:
        return -1
    return len(entries) - 1


def all_key_versions(store: Dict[str, Any], hist: Dict[str, Any]) -> Dict[str, int]:
    """Return ``{key: version}`` for every key in ``store``.

    FIX P1-004: the previous implementation called ``current_key_version``
    (which does ``hist.get(key)`` + ``len(entries)``) once per store key.
    That is O(n) in store keys *and* requires the full history dict to be
    materialised. We now derive the version map directly from the history
    dict's keys in a single pass, which is O(m) where m = number of keys
    that have history (typically much smaller than the store because
    excluded keys are never recorded). Store keys without history get -1.
    """
    versions: Dict[str, int] = {}
    if not isinstance(store, dict):
        return versions
    if isinstance(hist, dict):
        for key, entries in hist.items():
            if isinstance(entries, list):
                versions[key] = len(entries) - 1
    # Store keys not in history have version -1
    for key in store.keys():
        if key not in versions:
            versions[key] = -1
    return versions


# ── Factory reset ───────────────────────────────────────────────────────────
def _safe_remove_file(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def factory_reset_all_data() -> None:
    """Wipe local store/history/undo + auth data + DB key-value tables."""
    # Cancel any pending deferred flush timer first to prevent it from
    # writing stale data back to disk AFTER the reset.
    global _history_flush_timer, _LAST_BACKUP_TS_NS
    if _history_flush_timer is not None:
        try:
            _history_flush_timer.cancel()
        except Exception:
            pass
        _history_flush_timer = None
    # FIX P1: reset the backup throttle timestamp so the first real write
    # after a factory reset gets a backup (otherwise the throttle window
    # from the pre-reset write would suppress it).
    _LAST_BACKUP_TS_NS = 0

    # FIX P0-2: move file deletion INSIDE the lock. Previously the files were
    # removed outside _lock, so a concurrent _flush_history_to_disk (or
    # write_store) could be mid-write and (a) recreate the file we just
    # deleted, or (b) fail when the file vanishes under it. Deleting under
    # the lock guarantees no other thread is writing while we wipe.
    with _lock:
        global _store_cache, _history_cache, _undo_stack_cache
        global _history_dirty, _undo_stack_dirty
        _safe_remove_file(DATA_FILE)
        _safe_remove_file(HISTORY_FILE)
        _safe_remove_file(UNDO_STACK_FILE)
        _store_cache = None
        _history_cache = None
        _undo_stack_cache = None
        _history_dirty = False
        _undo_stack_dirty = False
    write_store({})
    write_history({})
    write_undo_stack([])
    flush_pending()

    if DB_CONNECTED:
        try:
            with _SessionLocal() as db:
                _RESET_TABLES = ("kv_store", "storage_items")
                for table_name in _RESET_TABLES:
                    try:
                        # FIX P0-3: validate the table name without `assert`,
                        # which is stripped under `python -O` and would allow
                        # SQL injection via a bad table name in optimized mode.
                        if not table_name.isidentifier():
                            raise ValueError(f"bad table name {table_name!r}")
                        db.execute(text(f"TRUNCATE TABLE {table_name} RESTART IDENTITY CASCADE"))
                    except Exception:
                        pass
                db.commit()
        except Exception as e:
            logger.warning("DB reset failed: %s", e)

    # Broadcast SSE "clear-all" so all connected clients wipe their
    # IndexedDB + in-memory cache. Without this, clients re-push their
    # stale local data back to the server after reset, restoring
    # companies and all data that was just wiped.
    _sse_publish({
        "type": "clear-all",
        "seq": _next_seq(),
        "message": "Factory reset — clear all local data",
    })


# ── AI memory helpers ──────────────────────────────────────────────────────
def ai_memory_key(company_id: str = "") -> str:
    return f"zeralda-ai-memory::{company_id}" if company_id else "zeralda-ai-memory"


def add_ai_memory(
    store: Dict[str, Any],
    action_type: str,
    args: Dict[str, Any],
    result: Dict[str, Any],
    company_id: str = "",
) -> None:
    try:
        key = ai_memory_key(company_id)
        mem = store.get(key)
        if not isinstance(mem, list):
            mem = []
        record = args.get("record") or args.get("data") or {}
        rec_name = str(
            record.get("name") or record.get("description") or record.get("title")
            or record.get("customer") or record.get("number") or ""
        )[:80]
        rec_id = str(
            result.get("id") or record.get("id") or record.get("code")
            or record.get("reference") or ""
        )[:80]
        mem.append(
            {
                "ts": datetime.datetime.now().isoformat(),
                "action": action_type,
                "module": str(args.get("module") or args.get("key") or ""),
                "record_id": rec_id,
                "record_name": rec_name,
                "total": result.get("total"),
            }
        )
        store[key] = mem[-50:]
    except Exception:
        pass


def format_ai_memory(store: Dict[str, Any], company_id: str = "", limit: int = 10) -> str:
    try:
        mem = store.get(ai_memory_key(company_id)) or []
        if not isinstance(mem, list) or not mem:
            return ""
        recent = mem[-limit:]
        lines = ["\n\n--- Recent AI actions memory ---"]
        for item in recent:
            lines.append(
                f"[{item.get('ts', '')}] {item.get('action', '')} {item.get('module', '')}: "
                f"{item.get('record_name', '')} (id={item.get('record_id', '')}, total={item.get('total', '')})"
            )
        lines.append("--- End memory ---\n")
        return "\n".join(lines)
    except Exception:
        return ""
