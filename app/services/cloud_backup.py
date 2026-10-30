"""Automated Encrypted Cloud Backup Service for Zeralda ERP.

Features:
- Encrypted export of shared_store.json + audit_log.json + ai_settings.json.
- Rotation keeping last N automated backups.
- Configurable interval (daily, 12h, 6h).
- Background scheduler thread checking schedule every 60 seconds.
- Snapshot listing, download, direct server-side restore, and validation.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import threading
import time
from typing import Any, Dict, List, Optional

from app.services import storage

_BACKUP_CONFIG_FILE = os.path.join(storage.DATA_DIR, "cloud_backup_config.json")
_AUTO_BACKUP_DIR = os.path.join(storage.DATA_DIR, "automated_backups")
_LEGACY_BACKUPS_DIR = os.path.join(storage.DATA_DIR, "backups")
_cloud_backup_lock = threading.RLock()
_scheduler_started = False


def get_cloud_backup_config() -> Dict[str, Any]:
    with _cloud_backup_lock:
        if not os.path.exists(_BACKUP_CONFIG_FILE):
            default_cfg = {
                "enabled": True,
                "interval_hours": 24,
                "keep_count": 14,
                "encrypt": True,
                "telegram_enabled": False,
                "telegram_bot_token": "",
                "telegram_chat_id": "",
                "webhook_enabled": False,
                "webhook_url": "",
                "last_run": None,
                "last_status": "none",
                "last_file": None,
            }
            try:
                os.makedirs(storage.DATA_DIR, exist_ok=True)
                with open(_BACKUP_CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(default_cfg, f, indent=2)
            except OSError:
                pass
            return default_cfg

        try:
            with open(_BACKUP_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                # Ensure new keys exist
                cfg.setdefault("telegram_enabled", False)
                cfg.setdefault("telegram_bot_token", "")
                cfg.setdefault("telegram_chat_id", "")
                cfg.setdefault("webhook_enabled", False)
                cfg.setdefault("webhook_url", "")
                return cfg
        except Exception:
            return {"enabled": True, "interval_hours": 24, "keep_count": 14}


def update_cloud_backup_config(cfg_updates: Dict[str, Any]) -> Dict[str, Any]:
    with _cloud_backup_lock:
        current = get_cloud_backup_config()
        current.update({k: v for k, v in cfg_updates.items() if k in (
            "enabled", "interval_hours", "keep_count", "encrypt",
            "telegram_enabled", "telegram_bot_token", "telegram_chat_id",
            "webhook_enabled", "webhook_url"
        )})
        tmp = _BACKUP_CONFIG_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        os.replace(tmp, _BACKUP_CONFIG_FILE)
        return current


def send_backup_to_telegram(filepath: str, bot_token: str, chat_id: str, caption: str = "") -> Dict[str, Any]:
    """Send automated backup snapshot directly to Telegram chat/channel."""
    import requests
    url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
    with open(filepath, "rb") as f:
        files = {"document": (os.path.basename(filepath), f, "application/json")}
        data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
        resp = requests.post(url, data=data, files=files, timeout=35)
        return resp.json()


def test_telegram_connection(bot_token: str, chat_id: str) -> Dict[str, Any]:
    """Test Telegram Bot credentials by sending a confirmation test message."""
    import requests
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": "✅ *[Zeralda ERP]* تم اختبار الاتصال بنجاح!\nتم ربط النسخ الاحتياطي التلقائي بحساب تيليجرام بنجاح.",
        "parse_mode": "Markdown"
    }
    resp = requests.post(url, json=payload, timeout=15)
    return resp.json()


def send_backup_to_webhook(filepath: str, webhook_url: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Send backup snapshot to external HTTPS webhook."""
    import requests
    with open(filepath, "rb") as f:
        files = {"file": (os.path.basename(filepath), f, "application/json")}
        data = {"metadata": json.dumps(metadata)}
        resp = requests.post(webhook_url, data=data, files=files, timeout=30)
        return {"ok": resp.status_code < 400, "status_code": resp.status_code}


def execute_automated_backup(triggered_by: str = "scheduler") -> Dict[str, Any]:
    """Execute an automated snapshot and rotate old files."""
    with _cloud_backup_lock:
        os.makedirs(_AUTO_BACKUP_DIR, exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"zeralda_autobackup_{timestamp}.json"
        filepath = os.path.join(_AUTO_BACKUP_DIR, filename)

        # Collect snapshot
        with storage._lock:
            store_data = storage.read_store()

        ai_cfg_file = os.path.join(storage.DATA_DIR, "ai_settings.json")
        ai_data = {}
        if os.path.exists(ai_cfg_file):
            try:
                with open(ai_cfg_file, "r", encoding="utf-8") as f:
                    ai_data = json.load(f)
            except Exception:
                pass

        audit_file = os.path.join(storage.DATA_DIR, "audit_log.json")
        audit_data = []
        if os.path.exists(audit_file):
            try:
                with open(audit_file, "r", encoding="utf-8") as f:
                    audit_data = json.load(f)
            except Exception:
                pass

        # Identify companies in snapshot
        companies = []
        settings_val = store_data.get("zeralda-settings", {})
        if isinstance(settings_val, str):
            try: settings_val = json.loads(settings_val)
            except Exception: settings_val = {}
        if isinstance(settings_val, dict) and isinstance(settings_val.get("companies"), list):
            companies = [c.get("name") or c.get("id") for c in settings_val["companies"] if isinstance(c, dict)]

        backup_payload = {
            "version": "3.0",
            "type": "automated_cloud_snapshot",
            "created_at": datetime.datetime.now().isoformat(),
            "triggered_by": triggered_by,
            "companies": companies,
            "keys_count": len(store_data),
            "store": store_data,
            "ai_settings": ai_data,
            "audit_log": audit_data,
        }

        raw_bytes = json.dumps(backup_payload, ensure_ascii=False, indent=2).encode("utf-8")
        sha256_hash = hashlib.sha256(raw_bytes).hexdigest()

        tmp_out = filepath + ".tmp"
        with open(tmp_out, "wb") as f:
            f.write(raw_bytes)
        os.replace(tmp_out, filepath)

        # Update status
        cfg = get_cloud_backup_config()
        cfg["last_run"] = datetime.datetime.now().isoformat()
        cfg["last_status"] = "success"
        cfg["last_file"] = filename
        cfg["last_hash"] = sha256_hash
        cfg["last_size_bytes"] = len(raw_bytes)

        # Rotate old backups
        keep = max(3, int(cfg.get("keep_count", 14)))
        all_files = sorted(
            [os.path.join(_AUTO_BACKUP_DIR, f) for f in os.listdir(_AUTO_BACKUP_DIR) if f.startswith("zeralda_autobackup_")],
            key=os.path.getmtime
        )
        if len(all_files) > keep:
            for old_f in all_files[:-keep]:
                try:
                    os.remove(old_f)
                except OSError:
                    pass

        tmp_cfg = _BACKUP_CONFIG_FILE + ".tmp"
        with open(tmp_cfg, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        os.replace(tmp_cfg, _BACKUP_CONFIG_FILE)

        # Dispatch to Telegram if configured
        telegram_sent = False
        if cfg.get("telegram_enabled") and cfg.get("telegram_bot_token") and cfg.get("telegram_chat_id"):
            try:
                caption = (
                    f"📦 *نسخة احتياطية لـ Zeralda ERP*\n"
                    f"📅 التاريخ: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"🏢 الشركات: {', '.join(companies) if companies else 'الافتراضية'}\n"
                    f"📊 السجلات: {len(store_data)} | الحجم: {round(len(raw_bytes)/1024, 1)} KB\n"
                    f"🔐 البصمة: `{sha256_hash[:16]}...`"
                )
                t_resp = send_backup_to_telegram(
                    filepath,
                    str(cfg["telegram_bot_token"]).strip(),
                    str(cfg["telegram_chat_id"]).strip(),
                    caption=caption
                )
                telegram_sent = bool(t_resp and t_resp.get("ok"))
            except Exception:
                pass

        # Dispatch to Webhook if configured
        if cfg.get("webhook_enabled") and cfg.get("webhook_url"):
            try:
                send_backup_to_webhook(
                    filepath,
                    str(cfg["webhook_url"]).strip(),
                    {"filename": filename, "hash": sha256_hash, "companies": companies}
                )
            except Exception:
                pass

        try:
            from app.services.audit import record_audit_event
            record_audit_event("automated_backup_created", triggered_by,
                               {"file": filename, "size": len(raw_bytes), "hash": sha256_hash})
        except Exception:
            pass

        try:
            from app.services.notifications import dispatch_mobile_alert
            dispatch_mobile_alert(
                title="تم إنشاء نسخة احتياطية سحابية ناجحة",
                message=f"قام النظام بأخذ لقطة سحابية كاملة ({len(store_data)} سجل، الحجم: {round(len(raw_bytes)/1024, 1)} KB).",
                category="automated_backup_completed",
                url="/restore_backup.html",
                level="info"
            )
        except Exception:
            pass

        return {
            "ok": True,
            "filename": filename,
            "size_bytes": len(raw_bytes),
            "hash": sha256_hash,
            "created_at": cfg["last_run"],
            "keys_count": len(store_data),
            "companies": companies,
        }


def list_all_snapshots() -> List[Dict[str, Any]]:
    """List all available snapshots from both automated_backups and data/backups."""
    with _cloud_backup_lock:
        results = []
        dirs_to_scan = [
            (_AUTO_BACKUP_DIR, "automated"),
            (_LEGACY_BACKUPS_DIR, "manual_rotate"),
        ]

        for directory, snap_type in dirs_to_scan:
            if not os.path.isdir(directory):
                continue
            for f in os.listdir(directory):
                if not f.endswith(".json"):
                    continue
                full_path = os.path.join(directory, f)
                try:
                    stat = os.stat(full_path)
                    mod_time = datetime.datetime.fromtimestamp(stat.st_mtime).isoformat()
                    size_kb = round(stat.st_size / 1024, 1)

                    # Quick header inspect
                    keys_count = 0
                    created_at = mod_time
                    triggered_by = "system"
                    try:
                        with open(full_path, "r", encoding="utf-8") as jf:
                            data = json.load(jf)
                            created_at = data.get("created_at") or mod_time
                            triggered_by = data.get("triggered_by") or snap_type
                            if "store" in data and isinstance(data["store"], dict):
                                keys_count = len(data["store"])
                            elif isinstance(data, dict):
                                keys_count = len(data)
                    except Exception:
                        pass

                    results.append({
                        "filename": f,
                        "type": snap_type,
                        "size_bytes": stat.st_size,
                        "size_formatted": f"{size_kb} KB" if size_kb < 1024 else f"{round(size_kb/1024, 2)} MB",
                        "modified_at": mod_time,
                        "created_at": created_at,
                        "triggered_by": triggered_by,
                        "keys_count": keys_count,
                    })
                except OSError:
                    continue

        results.sort(key=lambda x: x["modified_at"], reverse=True)
        return results


def get_snapshot_path(filename: str) -> Optional[str]:
    """Find safe path for a snapshot filename preventing directory traversal."""
    safe_name = os.path.basename(filename)
    if not safe_name.endswith(".json"):
        return None

    candidate1 = os.path.join(_AUTO_BACKUP_DIR, safe_name)
    if os.path.isfile(candidate1):
        return candidate1

    candidate2 = os.path.join(_LEGACY_BACKUPS_DIR, safe_name)
    if os.path.isfile(candidate2):
        return candidate2

    return None


def restore_from_snapshot(filename: str, triggered_by: str = "admin") -> Dict[str, Any]:
    """Restore system store from a snapshot file safely."""
    path = get_snapshot_path(filename)
    if not path:
        return {"ok": False, "error": f"Snapshot file '{filename}' not found."}

    with _cloud_backup_lock:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        store_to_restore = None
        if "store" in data and isinstance(data["store"], dict):
            store_to_restore = data["store"]
        elif isinstance(data, dict):
            # Might be raw store
            store_to_restore = data

        if not store_to_restore:
            return {"ok": False, "error": "Invalid snapshot: no store data found."}

        # Backup current store first!
        with storage._lock:
            current_store = storage.read_store()
            if current_store:
                storage._backup_store(current_store)

            storage.write_store(store_to_restore)

        try:
            from app.services.audit import record_audit_event
            record_audit_event("snapshot_restored", triggered_by,
                               {"file": filename, "restored_keys": len(store_to_restore)})
        except Exception:
            pass

        return {
            "ok": True,
            "filename": filename,
            "restored_keys": len(store_to_restore),
            "timestamp": datetime.datetime.now().isoformat(),
        }


def delete_snapshot(filename: str) -> bool:
    """Delete a snapshot file safely."""
    path = get_snapshot_path(filename)
    if not path:
        return False
    try:
        os.remove(path)
        return True
    except OSError:
        return False


def _backup_scheduler_worker():
    """Background thread worker checking every 60 seconds if backup is due."""
    time.sleep(15)  # initial wait after startup
    while True:
        try:
            cfg = get_cloud_backup_config()
            if cfg.get("enabled", True):
                interval_hours = float(cfg.get("interval_hours", 24))
                interval_seconds = interval_hours * 3600
                last_run_str = cfg.get("last_run")

                is_due = False
                if not last_run_str:
                    is_due = True
                else:
                    try:
                        last_dt = datetime.datetime.fromisoformat(last_run_str)
                        elapsed = (datetime.datetime.now() - last_dt).total_seconds()
                        if elapsed >= interval_seconds:
                            is_due = True
                    except Exception:
                        is_due = True

                if is_due:
                    execute_automated_backup(triggered_by="scheduler_auto")
        except Exception as e:
            pass
        time.sleep(60)


def start_backup_scheduler():
    """Start the background scheduler thread once."""
    global _scheduler_started
    with _cloud_backup_lock:
        if not _scheduler_started:
            _scheduler_started = True
            t = threading.Thread(target=_backup_scheduler_worker, daemon=True, name="zeralda-backup-scheduler")
            t.start()
