"""Real-Time Security & Business Alerts Service for Zeralda ERP.

Dispatches instant alerts for:
- Suspicious logins / New IP addresses
- Account lockout / Repeated failed authentications
- Critical stock depletion (below minimum safety threshold)
- High-value financial transactions & invoices
- Audit tampering or security policy violations

Supports:
- Webhooks (Discord, Slack, Custom HTTP endpoint)
- Telegram Bot Notifications
- Structured logging & local in-app alert inbox
"""
from __future__ import annotations

import json
import os
import threading
import urllib.request
import urllib.error
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services import storage

_ALERTS_CONFIG_FILE = os.path.join(storage.DATA_DIR, "alert_settings.json")
_ALERTS_INBOX_FILE = os.path.join(storage.DATA_DIR, "alert_inbox.json")
_alerts_lock = threading.RLock()


def get_alert_settings() -> Dict[str, Any]:
    with _alerts_lock:
        if not os.path.exists(_ALERTS_CONFIG_FILE):
            default_cfg = {
                "enabled": True,
                "webhook_url": "",
                "telegram_bot_token": "",
                "telegram_chat_id": "",
                "min_invoice_alert_amount": 100000.0,
                "notify_new_ip": True,
                "notify_low_stock": True,
                "notify_critical_security": True,
            }
            try:
                with open(_ALERTS_CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(default_cfg, f, indent=2)
            except OSError:
                pass
            return default_cfg

        try:
            with open(_ALERTS_CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return {"enabled": True}


def update_alert_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    with _alerts_lock:
        current = get_alert_settings()
        current.update({k: v for k, v in new_settings.items() if k in (
            "enabled", "webhook_url", "telegram_bot_token", "telegram_chat_id",
            "min_invoice_alert_amount", "notify_new_ip", "notify_low_stock",
            "notify_critical_security"
        )})
        tmp = _ALERTS_CONFIG_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        os.replace(tmp, _ALERTS_CONFIG_FILE)
        return current


def _record_inbox_alert(alert: Dict[str, Any]) -> None:
    with _alerts_lock:
        inbox: List[Dict[str, Any]] = []
        if os.path.exists(_ALERTS_INBOX_FILE):
            try:
                with open(_ALERTS_INBOX_FILE, "r", encoding="utf-8") as f:
                    inbox = json.load(f)
            except Exception:
                inbox = []
        inbox.append(alert)
        # Keep last 200 alerts
        inbox = inbox[-200:]
        tmp = _ALERTS_INBOX_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(inbox, f, indent=2, ensure_ascii=False)
        os.replace(tmp, _ALERTS_INBOX_FILE)


def get_inbox_alerts(limit: int = 50) -> List[Dict[str, Any]]:
    with _alerts_lock:
        if not os.path.exists(_ALERTS_INBOX_FILE):
            return []
        try:
            with open(_ALERTS_INBOX_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return list(reversed(data[-limit:]))
        except Exception:
            return []


def _send_webhook(url: str, message: str, payload_data: Dict[str, Any]) -> None:
    if not url or not url.startswith("http"):
        return
    try:
        body = json.dumps({"content": message, "text": message, "data": payload_data}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json", "User-Agent": "Zeralda-ERP-Alerts/1.0"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def _send_telegram(token: str, chat_id: str, message: str) -> None:
    if not token or not chat_id:
        return
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        body = json.dumps({"chat_id": chat_id, "text": message, "parse_mode": "HTML"}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json", "User-Agent": "Zeralda-ERP-Alerts/1.0"}
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass


def dispatch_alert(category: str, title: str, details: str, metadata: Optional[Dict[str, Any]] = None, level: str = "warning") -> Dict[str, Any]:
    """Dispatch an alert to configured destinations (inbox, webhook, Telegram)."""
    cfg = get_alert_settings()
    if not cfg.get("enabled", True):
        return {"dispatched": False, "reason": "alerts_disabled"}

    alert_obj = {
        "timestamp": datetime.now().isoformat(),
        "level": level,  # info, warning, critical
        "category": category,
        "title": title,
        "details": details,
        "metadata": metadata or {},
    }

    # Always save to local inbox
    _record_inbox_alert(alert_obj)

    # Format notification message
    formatted_msg = f"🔔 <b>[Zeralda ERP Alert - {level.upper()}]</b>\n<b>{title}</b>\n{details}"
    
    # Webhook dispatch
    webhook = cfg.get("webhook_url", "")
    if webhook:
        _send_webhook(webhook, formatted_msg, alert_obj)

    # Telegram dispatch
    tg_token = cfg.get("telegram_bot_token", "")
    tg_chat = cfg.get("telegram_chat_id", "")
    if tg_token and tg_chat:
        _send_telegram(tg_token, tg_chat, formatted_msg)

    return {"dispatched": True, "alert": alert_obj}
