"""Mobile & Web Push Notifications Service for Zeralda ERP.

Supports:
- Web Push Notifications (W3C Push API / RFC 8291 & 8292 via VAPID)
- Telegram Mobile Bot Gateway for instant smartphone alerts
- Device registration, subscription persistence, and auto-cleanup of dead endpoints
- Multi-channel alert dispatching for business and security events
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
import urllib.request
import urllib.error

try:
    from pywebpush import webpush, WebPushException
    from py_vapid import Vapid
    HAS_WEBPUSH = True
except ImportError:
    HAS_WEBPUSH = False
    webpush = None
    WebPushException = Exception
    Vapid = None

from app.services import storage

logger = logging.getLogger("zeralda.notifications")

_VAPID_FILE = os.path.join(storage.DATA_DIR, "vapid_keys.json")
_SUBSCRIPTIONS_FILE = os.path.join(storage.DATA_DIR, "push_subscriptions.json")
_NOTIF_SETTINGS_FILE = os.path.join(storage.DATA_DIR, "notification_settings.json")
_NOTIF_HISTORY_FILE = os.path.join(storage.DATA_DIR, "notification_history.json")

_notif_lock = threading.RLock()


# ── VAPID Keys Management ──────────────────────────────────────────────────
def _ensure_vapid_keys() -> Dict[str, str]:
    """Load or generate EC P-256 VAPID keypair for Web Push."""
    with _notif_lock:
        if os.path.exists(_VAPID_FILE):
            try:
                with open(_VAPID_FILE, "r", encoding="utf-8") as f:
                    keys = json.load(f)
                    if keys.get("public_key") and keys.get("private_key"):
                        return keys
            except Exception as e:
                logger.warning(f"Failed to read existing VAPID keys, regenerating: {e}")

        # Generate new VAPID keys if Vapid library is available
        if not Vapid:
            logger.info("py_vapid not installed; web push VAPID keys cannot be generated")
            return {"public_key": "", "private_key": "", "claims_sub": "mailto:admin@zeralda-erp.dz"}

        from cryptography.hazmat.primitives import serialization
        vapid = Vapid()
        vapid.generate_keys()
        
        # Extract keys in URL-safe base64 format without padding (RFC 8292 standard for WebPush)
        raw_pub = vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )
        pub_b64 = base64.urlsafe_b64encode(raw_pub).decode("utf-8").rstrip("=")
        priv_pem = vapid.private_pem().decode("utf-8").strip()

        keys_data = {
            "public_key": pub_b64,
            "private_key": priv_pem,
            "claims_sub": "mailto:admin@zeralda-erp.dz",
            "created_at": datetime.now().isoformat()
        }

        try:
            tmp_file = _VAPID_FILE + ".tmp"
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(keys_data, f, indent=2)
            os.replace(tmp_file, _VAPID_FILE)
            logger.info("Generated new VAPID keypair for Web Push notifications")
        except Exception as e:
            logger.error(f"Failed to save VAPID keys: {e}")

        return keys_data


def get_vapid_public_key() -> str:
    """Return the VAPID public key needed by client browsers to subscribe."""
    keys = _ensure_vapid_keys()
    return keys.get("public_key", "")


# ── Notification Settings ──────────────────────────────────────────────────
def get_notification_settings() -> Dict[str, Any]:
    """Retrieve full mobile and alert configuration."""
    with _notif_lock:
        defaults = {
            "web_push_enabled": True,
            "telegram_enabled": False,
            "telegram_bot_token": "",
            "telegram_chat_id": "",
            "webhook_url": "",
            "triggers": {
                "low_stock": True,
                "new_sales_invoice": True,
                "high_value_invoice_min": 100000.0,
                "new_payment_receipt": True,
                "automated_backup_completed": True,
                "security_alert": True,
            }
        }
        if not os.path.exists(_NOTIF_SETTINGS_FILE):
            try:
                with open(_NOTIF_SETTINGS_FILE, "w", encoding="utf-8") as f:
                    json.dump(defaults, f, indent=2, ensure_ascii=False)
            except Exception:
                pass
            return defaults

        try:
            with open(_NOTIF_SETTINGS_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                # Deep merge defaults
                for k, v in defaults.items():
                    if k not in saved:
                        saved[k] = v
                    elif isinstance(v, dict) and isinstance(saved[k], dict):
                        for sub_k, sub_v in v.items():
                            if sub_k not in saved[k]:
                                saved[k][sub_k] = sub_v
                return saved
        except Exception:
            return defaults


def update_notification_settings(new_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Update notification settings safely."""
    with _notif_lock:
        current = get_notification_settings()
        for k in ("web_push_enabled", "telegram_enabled", "telegram_bot_token", "telegram_chat_id", "webhook_url"):
            if k in new_cfg:
                current[k] = new_cfg[k]
        
        if "triggers" in new_cfg and isinstance(new_cfg["triggers"], dict):
            current["triggers"].update(new_cfg["triggers"])

        tmp = _NOTIF_SETTINGS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        os.replace(tmp, _NOTIF_SETTINGS_FILE)
        return current


# ── Subscriptions Persistence ──────────────────────────────────────────────
def _load_subscriptions() -> List[Dict[str, Any]]:
    with _notif_lock:
        if not os.path.exists(_SUBSCRIPTIONS_FILE):
            return []
        try:
            with open(_SUBSCRIPTIONS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []


def _save_subscriptions(subs: List[Dict[str, Any]]) -> None:
    with _notif_lock:
        tmp = _SUBSCRIPTIONS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(subs, f, indent=2, ensure_ascii=False)
        os.replace(tmp, _SUBSCRIPTIONS_FILE)


def add_subscription(sub_info: Dict[str, Any], user_email: str = "user", device_name: str = "") -> Dict[str, Any]:
    """Register or update a browser push subscription."""
    endpoint = sub_info.get("endpoint", "").strip()
    if not endpoint:
        return {"ok": False, "error": "Invalid subscription: missing endpoint"}

    keys = sub_info.get("keys", {})
    if not keys.get("p256dh") or not keys.get("auth"):
        return {"ok": False, "error": "Invalid subscription: missing cryptographic keys"}

    with _notif_lock:
        subs = _load_subscriptions()
        
        # Check if already registered
        existing = next((s for s in subs if s.get("endpoint") == endpoint), None)
        now_iso = datetime.now().isoformat()
        
        if existing:
            existing["keys"] = keys
            existing["user_email"] = user_email or existing.get("user_email", "user")
            existing["device_name"] = device_name or existing.get("device_name", "هاتف ذكي")
            existing["last_active"] = now_iso
            record = existing
        else:
            record = {
                "id": f"sub_{int(time.time()*1000)}",
                "endpoint": endpoint,
                "keys": keys,
                "user_email": user_email or "user",
                "device_name": device_name or "جهاز محمول",
                "created_at": now_iso,
                "last_active": now_iso
            }
            subs.append(record)

        _save_subscriptions(subs)
        return {"ok": True, "subscription": record, "total": len(subs)}


def remove_subscription(endpoint: str) -> bool:
    """Unregister a push subscription."""
    if not endpoint:
        return False
    with _notif_lock:
        subs = _load_subscriptions()
        initial_len = len(subs)
        subs = [s for s in subs if s.get("endpoint") != endpoint]
        if len(subs) != initial_len:
            _save_subscriptions(subs)
            return True
        return False


def list_subscriptions() -> List[Dict[str, Any]]:
    """Return all active push subscriptions with sanitized keys."""
    subs = _load_subscriptions()
    sanitized = []
    for s in subs:
        sanitized.append({
            "id": s.get("id"),
            "device_name": s.get("device_name", "هاتف غير معروف"),
            "user_email": s.get("user_email", "user"),
            "created_at": s.get("created_at"),
            "last_active": s.get("last_active"),
            "endpoint_short": s.get("endpoint", "")[:45] + "..." if len(s.get("endpoint", "")) > 45 else s.get("endpoint", "")
        })
    return sanitized


# ── Delivery Execution ─────────────────────────────────────────────────────
def _record_history(entry: Dict[str, Any]) -> None:
    with _notif_lock:
        history = []
        if os.path.exists(_NOTIF_HISTORY_FILE):
            try:
                with open(_NOTIF_HISTORY_FILE, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except Exception:
                history = []
        history.append(entry)
        history = history[-100:]  # Keep last 100 entries
        try:
            tmp = _NOTIF_HISTORY_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2, ensure_ascii=False)
            os.replace(tmp, _NOTIF_HISTORY_FILE)
        except Exception:
            pass


def get_notification_history(limit: int = 50) -> List[Dict[str, Any]]:
    with _notif_lock:
        if not os.path.exists(_NOTIF_HISTORY_FILE):
            return []
        try:
            with open(_NOTIF_HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return list(reversed(data[-limit:]))
        except Exception:
            return []


def send_web_push(subscription: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """Send a Web Push notification to a single subscription. Remove if unsubscribed/dead."""
    keys = _ensure_vapid_keys()
    priv_key = keys.get("private_key")
    claims_sub = keys.get("claims_sub", "mailto:admin@zeralda-erp.dz")

    endpoint = subscription.get("endpoint")
    if not endpoint or not priv_key:
        return False

    sub_info = {
        "endpoint": endpoint,
        "keys": subscription.get("keys", {})
    }

    try:
        # Construct message payload
        data_str = json.dumps(payload, ensure_ascii=False)
        webpush(
            subscription_info=sub_info,
            data=data_str,
            vapid_private_key=priv_key,
            vapid_claims={"sub": claims_sub},
            ttl=86400  # 24 hours
        )
        return True
    except WebPushException as ex:
        # Check if the subscription has expired or is unsubscribed
        if ex.response and ex.response.status_code in (404, 410):
            logger.info(f"Removing expired subscription: {endpoint[:30]}...")
            remove_subscription(endpoint)
        else:
            logger.warning(f"Web push delivery failed: {ex}")
        return False
    except Exception as e:
        logger.warning(f"Unexpected error sending web push: {e}")
        return False


def send_telegram_alert(title: str, message: str, url: str = "") -> bool:
    """Send an instant alert message via Telegram Bot to mobile phones."""
    cfg = get_notification_settings()
    if not cfg.get("telegram_enabled"):
        return False

    token = cfg.get("telegram_bot_token", "").strip()
    chat_id = cfg.get("telegram_chat_id", "").strip()
    if not token or not chat_id:
        return False

    formatted = f"🏢 <b>[Zeralda ERP — تنبيه الهاتف]</b>\n\n📌 <b>{title}</b>\n{message}"
    if url:
        formatted += f"\n\n🔗 <a href='{url}'>فتح في النظام</a>"

    try:
        tg_url = f"https://api.telegram.org/bot{token}/sendMessage"
        body = json.dumps({
            "chat_id": chat_id,
            "text": formatted,
            "parse_mode": "HTML",
            "disable_web_page_preview": False
        }).encode("utf-8")
        
        req = urllib.request.Request(
            tg_url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "Zeralda-ERP-Bot/1.0"}
        )
        with urllib.request.urlopen(req, timeout=7) as resp:
            return resp.status == 200
    except Exception as e:
        logger.warning(f"Telegram alert delivery failed: {e}")
        return False


def dispatch_mobile_alert(
    title: str,
    message: str,
    category: str = "general",
    url: str = "/zeralda_erp_dashboard.html",
    level: str = "info",
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Unified dispatcher: pushes notification to all subscribed phones and Telegram in parallel."""
    cfg = get_notification_settings()
    triggers = cfg.get("triggers", {})
    
    # Check category trigger filtering if applicable
    if category in triggers and not triggers.get(category, True):
        return {"dispatched": False, "reason": f"trigger_{category}_disabled"}

    subs = _load_subscriptions()
    web_push_enabled = cfg.get("web_push_enabled", True)
    telegram_enabled = cfg.get("telegram_enabled", False)

    delivered_count = 0
    tg_sent = False

    payload = {
        "title": title,
        "body": message,
        "icon": "/favicon.ico",
        "badge": "/favicon.ico",
        "url": url,
        "tag": f"zeralda-{category}-{int(time.time())}",
        "category": category,
        "level": level,
        "timestamp": int(time.time() * 1000),
        "data": metadata or {}
    }

    # Asynchronous dispatch so API callers don't hang
    def _async_worker():
        nonlocal delivered_count, tg_sent
        if web_push_enabled and subs:
            for s in subs:
                if send_web_push(s, payload):
                    delivered_count += 1

        if telegram_enabled:
            tg_sent = send_telegram_alert(title, message, url)

        # Log history
        _record_history({
            "timestamp": datetime.now().isoformat(),
            "title": title,
            "message": message,
            "category": category,
            "level": level,
            "web_push_delivered": delivered_count,
            "telegram_sent": tg_sent
        })

    t = threading.Thread(target=_async_worker, daemon=True)
    t.start()

    return {
        "dispatched": True,
        "target_devices": len(subs),
        "channels": {
            "web_push": web_push_enabled,
            "telegram": telegram_enabled
        }
    }
