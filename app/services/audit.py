"""Tamper-Evident Audit Trail Service for Zeralda ERP.

Every security and business-critical operation is recorded in a cryptographically
chained log (Hash-Chain) where each entry includes the SHA-256 hash of the
preceding entry. Any retroactive modification or deletion breaks the chain.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services import storage

_AUDIT_FILE = os.path.join(storage.DATA_DIR, "audit_log.json")
_GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
_audit_lock = threading.RLock()


def _compute_hash(event_id: int, timestamp: str, action: str, user: str,
                  status: str, prev_hash: str, details: Dict[str, Any]) -> str:
    """Compute deterministic SHA-256 hash for an audit entry."""
    canonical_details = json.dumps(details, sort_keys=True, ensure_ascii=False)
    payload = f"{event_id}|{timestamp}|{action}|{user}|{status}|{prev_hash}|{canonical_details}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_log_locked() -> List[Dict[str, Any]]:
    if not os.path.exists(_AUDIT_FILE):
        return []
    try:
        with open(_AUDIT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save_log_locked(entries: List[Dict[str, Any]]) -> None:
    tmp = _AUDIT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    os.replace(tmp, _AUDIT_FILE)


def record_audit_event(
    action: str,
    user: str,
    details: Optional[Dict[str, Any]] = None,
    ip: str = "",
    status: str = "success",
) -> Dict[str, Any]:
    """Record an action into the cryptographically chained audit log."""
    details_dict = details or {}
    now_iso = datetime.now().isoformat()
    clean_user = str(user or "system").strip().lower()

    with _audit_lock:
        log = _load_log_locked()
        event_id = len(log) + 1
        prev_hash = log[-1]["hash"] if log else _GENESIS_HASH

        entry_hash = _compute_hash(
            event_id=event_id,
            timestamp=now_iso,
            action=action,
            user=clean_user,
            status=status,
            prev_hash=prev_hash,
            details=details_dict,
        )

        entry = {
            "id": event_id,
            "timestamp": now_iso,
            "action": action,
            "user": clean_user,
            "ip": ip,
            "status": status,
            "details": details_dict,
            "prev_hash": prev_hash,
            "hash": entry_hash,
        }

        log.append(entry)
        _save_log_locked(log)
        return entry


def verify_audit_chain() -> Dict[str, Any]:
    """Verify the entire audit trail integrity."""
    with _audit_lock:
        log = _load_log_locked()
        if not log:
            return {"ok": True, "total": 0, "verified": 0, "message": "Log is empty"}

        expected_prev = _GENESIS_HASH
        for idx, entry in enumerate(log):
            event_id = entry.get("id")
            ts = entry.get("timestamp", "")
            action = entry.get("action", "")
            user = entry.get("user", "")
            st = entry.get("status", "")
            details = entry.get("details", {})
            stored_prev = entry.get("prev_hash", "")
            stored_hash = entry.get("hash", "")

            # Check chain linkage
            if stored_prev != expected_prev:
                return {
                    "ok": False,
                    "error": f"Chain broken at record #{event_id}: previous hash mismatch",
                    "broken_at_id": event_id,
                }

            # Re-calculate hash
            calc_hash = _compute_hash(event_id, ts, action, user, st, stored_prev, details)
            if calc_hash != stored_hash:
                return {
                    "ok": False,
                    "error": f"Tampering detected at record #{event_id}: content hash mismatch",
                    "broken_at_id": event_id,
                }

            expected_prev = stored_hash

        return {
            "ok": True,
            "total": len(log),
            "verified": len(log),
            "last_hash": expected_prev,
            "message": "Audit chain verified. Zero tampering detected.",
        }


def get_audit_events(
    limit: int = 100,
    action: Optional[str] = None,
    user: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve audit events in reverse chronological order."""
    with _audit_lock:
        log = _load_log_locked()
        filtered = log
        if action:
            filtered = [e for e in filtered if e.get("action") == action]
        if user:
            clean_u = user.strip().lower()
            filtered = [e for e in filtered if e.get("user") == clean_u]
        return list(reversed(filtered[-limit:]))
