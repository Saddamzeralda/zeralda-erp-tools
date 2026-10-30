"""Offline-to-Cloud Sync Engine for Zeralda ERP.

Enables bidirectional synchronization between offline desktop clients
and the cloud production server (Railway / Cloud PostgreSQL).
Ensures local and cloud installations share the exact same data and accounts.
"""
from __future__ import annotations

import os
import json
import time
import hashlib
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services import storage, auth
from app.services.security import log_structured

DEFAULT_CLOUD_URL = os.getenv(
    "CLOUD_SYNC_URL",
    "https://zeralda-erp-employees-main-production.up.railway.app"
).rstrip("/")
SYNC_STATE_KEY = "_cloud_sync_metadata"


def get_sync_token() -> str:
    """Generate or retrieve persistent sync token for server-to-server cloud sync.
    Deterministic across all installations running the same licensed key.
    """
    override = os.getenv("SYNC_SECRET_KEY")
    if override and len(override) >= 16:
        return override.strip()

    storage_key_file = Path(__file__).resolve().parent.parent.parent / "data" / ".storage_key"
    base_secret = b"zeralda-default-sync-salt-2026"
    if storage_key_file.exists():
        try:
            base_secret = storage_key_file.read_bytes().strip()
        except Exception:
            pass

    return hashlib.sha256(base_secret + b"-zeralda-cloud-sync-engine").hexdigest()


def get_sync_status() -> Dict[str, Any]:
    """Return local synchronization status, last sync timestamp, and cloud reachability."""
    store = storage.read_store()
    sync_meta = store.get(SYNC_STATE_KEY, {})
    last_sync_ts = sync_meta.get("last_sync_ts", 0)
    last_sync_status = sync_meta.get("last_status", "never_synced")

    # Check cloud reachability
    cloud_reachable = False
    ping_url = f"{DEFAULT_CLOUD_URL}/api/ping"
    try:
        req = urllib.request.Request(ping_url, headers={"User-Agent": "Zeralda-Sync-Client/3.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            if resp.status == 200:
                cloud_reachable = True
    except Exception:
        cloud_reachable = False

    return {
        "ok": True,
        "cloud_url": DEFAULT_CLOUD_URL,
        "cloud_reachable": cloud_reachable,
        "is_database_connected": storage.DB_CONNECTED,
        "last_sync_ts": last_sync_ts,
        "last_sync_formatted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(last_sync_ts)) if last_sync_ts else "Never",
        "last_status": last_sync_status,
        "local_keys_count": len(store),
    }


def export_for_cloud() -> Dict[str, Any]:
    """Export authoritative store and users for cross-device/cloud sync."""
    store = storage.read_store()
    payload_data = {}
    for k, v in store.items():
        if not k.startswith("_") and k != SYNC_STATE_KEY:
            payload_data[k] = v

    users_data = {}
    try:
        raw_users = auth.load_users()
        # Export users safely with existing password hashes
        if isinstance(raw_users, dict):
            users_data = raw_users
    except Exception as e:
        log_structured("WARN", "Sync export users failed", error=str(e))

    return {
        "ok": True,
        "timestamp": int(time.time()),
        "data": payload_data,
        "users": users_data,
    }


def _merge_arrays(old_val: Any, new_val: Any) -> Any:
    """Intelligently merge JSON or object arrays by 'id' attribute to prevent data loss."""
    old_list = storage._parse_list_safe(old_val)
    new_list = storage._parse_list_safe(new_val)

    if not old_list and not new_list:
        return new_val
    if not old_list:
        return new_val
    if not new_list:
        return old_val

    # ID map merging
    merged_map: Dict[str, Any] = {}
    unkeyed_items: List[Any] = []

    for item in old_list:
        if isinstance(item, dict) and item.get("id") is not None:
            merged_map[str(item["id"])] = item
        else:
            unkeyed_items.append(item)

    for item in new_list:
        if isinstance(item, dict) and item.get("id") is not None:
            merged_map[str(item["id"])] = item
        else:
            if item not in unkeyed_items:
                unkeyed_items.append(item)

    merged_list = list(merged_map.values()) + unkeyed_items
    if isinstance(new_val, str) or isinstance(old_val, str):
        return json.dumps(merged_list, ensure_ascii=False)
    return merged_list


def import_from_peer(incoming_data: Dict[str, Any], incoming_users: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Import and merge data and users from peer (local or cloud)."""
    local_store = storage.read_store()
    merged_keys = 0

    if isinstance(incoming_data, dict):
        for k, new_v in incoming_data.items():
            if k.startswith("_") or k == SYNC_STATE_KEY:
                continue

            old_v = local_store.get(k)
            if old_v is None:
                local_store[k] = new_v
                merged_keys += 1
            elif storage.is_critical_collection_key(k):
                local_store[k] = _merge_arrays(old_v, new_v)
                merged_keys += 1
            else:
                # Direct update for settings and non-array keys
                local_store[k] = new_v
                merged_keys += 1

        if merged_keys > 0:
            storage.write_store(local_store)

    # Merge user accounts
    merged_users_count = 0
    if incoming_users and isinstance(incoming_users, dict):
        try:
            local_users = auth.load_users() or {}
            for email, u_data in incoming_users.items():
                if email not in local_users:
                    local_users[email] = u_data
                    merged_users_count += 1
                else:
                    # Merge preferences if available
                    incoming_prefs = u_data.get("preferences")
                    if incoming_prefs and isinstance(incoming_prefs, dict):
                        local_prefs = local_users[email].get("preferences") or {}
                        local_prefs.update(incoming_prefs)
                        local_users[email]["preferences"] = local_prefs
            if merged_users_count > 0:
                auth.save_users(local_users)
        except Exception as e:
            log_structured("WARN", "Sync import users error", error=str(e))

    now_ts = int(time.time())
    _update_sync_metadata("import_success", now_ts)
    return {
        "ok": True,
        "merged_keys_count": merged_keys,
        "merged_users_count": merged_users_count,
        "timestamp": now_ts,
    }


def pull_from_cloud(auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Pull full shared business state and users from the remote cloud server."""
    pull_url = f"{DEFAULT_CLOUD_URL}/api/sync/cloud-export"
    headers = {
        "User-Agent": "Zeralda-Sync-Client/3.0",
        "X-Requested-With": "XMLHttpRequest",
        "X-Sync-Token": get_sync_token(),
    }
    if auth_token:
        headers["X-Session-Token"] = auth_token

    req = urllib.request.Request(pull_url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            cloud_store = res_json.get("data", {})
            cloud_users = res_json.get("users", {})
            if not isinstance(cloud_store, dict):
                return {"ok": False, "error": "Invalid cloud response structure"}

            res_import = import_from_peer(cloud_store, cloud_users)
            now_ts = int(time.time())
            _update_sync_metadata("pull_success", now_ts)
            log_structured("INFO", "Cloud sync pull succeeded", action="sync_pull_success", count=res_import.get("merged_keys_count", 0))
            return {
                "ok": True,
                "pulled_keys_count": res_import.get("merged_keys_count", 0),
                "pulled_users_count": res_import.get("merged_users_count", 0),
                "timestamp": now_ts,
            }
    except Exception as e:
        log_structured("WARN", "Cloud sync pull failed", action="sync_pull_error", error=str(e))
        return {
            "ok": False,
            "error": f"Cloud pull failed: {str(e)}",
            "cloud_url": pull_url,
        }


def push_to_cloud(auth_token: Optional[str] = None, keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Push local store state and users to the remote cloud server."""
    export_payload = export_for_cloud()
    payload_data = export_payload.get("data", {})
    payload_users = export_payload.get("users", {})

    if keys:
        payload_data = {k: v for k, v in payload_data.items() if k in keys}

    push_url = f"{DEFAULT_CLOUD_URL}/api/sync/cloud-import"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Zeralda-Sync-Client/3.0",
        "X-Requested-With": "XMLHttpRequest",
        "X-Sync-Token": get_sync_token(),
    }
    if auth_token:
        headers["X-Session-Token"] = auth_token

    body = json.dumps({"data": payload_data, "users": payload_users}).encode("utf-8")
    req = urllib.request.Request(push_url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            now_ts = int(time.time())
            _update_sync_metadata("push_success", now_ts)
            log_structured("INFO", "Cloud sync push succeeded", action="sync_push_success", count=len(payload_data))
            return {
                "ok": True,
                "synced_keys_count": len(payload_data),
                "timestamp": now_ts,
                "server_response": res_json,
            }
    except Exception as e:
        log_structured("WARN", "Cloud sync push failed", action="sync_push_error", error=str(e))
        return {
            "ok": False,
            "error": f"Cloud push failed: {str(e)}",
            "cloud_url": push_url,
        }


def reconcile_sync(auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Full two-way synchronization: pull cloud changes, merge, then push local changes."""
    pull_res = pull_from_cloud(auth_token=auth_token)
    push_res = push_to_cloud(auth_token=auth_token)

    success = pull_res.get("ok", False) and push_res.get("ok", False)
    now_ts = int(time.time())
    if success:
        _update_sync_metadata("reconcile_success", now_ts)
    else:
        _update_sync_metadata("reconcile_partial_or_failed", now_ts)

    return {
        "ok": success,
        "pull": pull_res,
        "push": push_res,
        "timestamp": now_ts,
    }


def _update_sync_metadata(status: str, ts: int) -> None:
    """Save sync metadata into storage without triggering full business event ripples."""
    try:
        current = storage.read_store()
        current[SYNC_STATE_KEY] = {
            "last_sync_ts": ts,
            "last_status": status,
        }
        storage.write_store(current)
    except Exception:
        pass
