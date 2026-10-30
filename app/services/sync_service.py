"""Offline-to-Cloud Sync Engine for Zeralda ERP.

Enables bidirectional synchronization between offline desktop clients
and the cloud production server (Railway / Cloud PostgreSQL).
"""
from __future__ import annotations

import os
import json
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

from app.services import storage, license_service
from app.services.security import log_structured

DEFAULT_CLOUD_URL = os.getenv("CLOUD_SYNC_URL", "https://zeralda-erp-production.up.railway.app").rstrip("/")
SYNC_STATE_KEY = "_cloud_sync_metadata"


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
        with urllib.request.urlopen(req, timeout=3) as resp:
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


def push_to_cloud(auth_token: Optional[str] = None, keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Push local store state to the remote cloud server."""
    store = storage.read_store()
    
    # Filter keys if specified, otherwise include business domains
    payload_data = {}
    target_keys = keys or [k for k in store.keys() if not k.startswith("_") and k != SYNC_STATE_KEY]
    for k in target_keys:
        if k in store:
            payload_data[k] = store[k]

    push_url = f"{DEFAULT_CLOUD_URL}/api/store/bulk"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Zeralda-Sync-Client/3.0",
        "X-Requested-With": "XMLHttpRequest",
    }
    if auth_token:
        headers["X-Session-Token"] = auth_token

    body = json.dumps({"items": payload_data}).encode("utf-8")
    req = urllib.request.Request(push_url, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            now_ts = int(time.time())
            # Update sync metadata locally
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


def pull_from_cloud(auth_token: Optional[str] = None) -> Dict[str, Any]:
    """Pull full or updated business state from the remote cloud server."""
    pull_url = f"{DEFAULT_CLOUD_URL}/api/store"
    headers = {
        "User-Agent": "Zeralda-Sync-Client/3.0",
        "X-Requested-With": "XMLHttpRequest",
    }
    if auth_token:
        headers["X-Session-Token"] = auth_token

    req = urllib.request.Request(pull_url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            cloud_store = res_json.get("data", {})
            if not isinstance(cloud_store, dict):
                return {"ok": False, "error": "Invalid cloud response structure"}

            # Merge cloud store into local store
            local_store = storage.read_store()
            merged_count = 0
            for k, v in cloud_store.items():
                if not k.startswith("_"):
                    local_store[k] = v
                    merged_count += 1
            if merged_count > 0:
                storage.write_store(local_store)

            now_ts = int(time.time())
            _update_sync_metadata("pull_success", now_ts)
            log_structured("INFO", "Cloud sync pull succeeded", action="sync_pull_success", count=merged_count)
            return {
                "ok": True,
                "pulled_keys_count": merged_count,
                "timestamp": now_ts,
            }
    except Exception as e:
        log_structured("WARN", "Cloud sync pull failed", action="sync_pull_error", error=str(e))
        return {
            "ok": False,
            "error": f"Cloud pull failed: {str(e)}",
            "cloud_url": pull_url,
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
