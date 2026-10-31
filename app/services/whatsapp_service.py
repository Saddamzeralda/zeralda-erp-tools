"""WhatsApp Service for Zeralda ERP — Unified multi-provider WhatsApp messaging.

Supports:
1. UltraMsg (QR-based gateway)
2. Meta WhatsApp Business Cloud API (Official)
3. Green-API
4. Custom HTTP Webhook / Self-hosted Baileys Gateway
5. Click-to-chat fallback
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional
import urllib.parse
import urllib.request
import urllib.error

logger = logging.getLogger("zeralda.whatsapp")

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
CONFIG_FILE = _BASE_DIR / "data" / "whatsapp_config.json"

DEFAULT_CONFIG: Dict[str, Any] = {
    "enabled": False,
    "provider": "ultramsg",  # ultramsg | meta | green_api | custom_webhook | click_to_chat
    "default_country_code": "213",
    "ultramsg": {
        "instance_id": "",
        "token": ""
    },
    "meta": {
        "phone_number_id": "",
        "access_token": "",
        "business_account_id": ""
    },
    "green_api": {
        "id_instance": "",
        "api_token_instance": ""
    },
    "custom_webhook": {
        "endpoint_url": "",
        "api_key": ""
    },
    "templates": {
        "invoice_caption": "مرحباً {customer_name}، نرفق لكم فاتورتكم رقم {invoice_number} بمبلغ {total} دج. شكراً لثقتكم بنا!",
        "proforma_caption": "مرحباً {customer_name}، نرفق لكم الفاتورة الشكلية رقم {proforma_number} بمبلغ {total} دج.",
        "payment_reminder": "تذكير: لديكم رصيد مستحق بقيمة {remaining} دج للفاتورة {invoice_number}."
    }
}


def load_config() -> Dict[str, Any]:
    """Load WhatsApp configuration from data/whatsapp_config.json with default fallbacks."""
    if not CONFIG_FILE.exists():
        return json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            merged = json.loads(json.dumps(DEFAULT_CONFIG))
            _deep_merge(merged, data)
            return merged
    except Exception as exc:
        logger.warning(f"Failed to load whatsapp_config.json: {exc}")
        return json.loads(json.dumps(DEFAULT_CONFIG))


def save_config(new_config: Dict[str, Any]) -> Dict[str, Any]:
    """Save WhatsApp configuration, preserving existing secret tokens if masked."""
    current = load_config()
    
    # Handle token masking: if UI sends '••••' or empty when current exists, retain current
    for provider_key in ["ultramsg", "meta", "green_api", "custom_webhook"]:
        current_sub = current.get(provider_key, {})
        new_sub = new_config.get(provider_key, {})
        if isinstance(new_sub, dict):
            for k, v in list(new_sub.items()):
                if isinstance(v, str) and ("••••" in v or (v == "" and current_sub.get(k))):
                    new_sub[k] = current_sub.get(k, "")

    _deep_merge(current, new_config)
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
        return {"ok": True, "config": get_masked_config(current)}
    except Exception as exc:
        logger.error(f"Failed to write whatsapp_config.json: {exc}")
        return {"ok": False, "error": str(exc)}


def get_masked_config(cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return config with API secrets masked for client-side display."""
    if cfg is None:
        cfg = load_config()
    masked = json.loads(json.dumps(cfg))
    
    def _mask(val: str) -> str:
        if not val or len(val) < 6:
            return "••••••••" if val else ""
        return val[:3] + "••••••••" + val[-2:]

    if "ultramsg" in masked and "token" in masked["ultramsg"]:
        masked["ultramsg"]["token"] = _mask(masked["ultramsg"]["token"])
    if "meta" in masked and "access_token" in masked["meta"]:
        masked["meta"]["access_token"] = _mask(masked["meta"]["access_token"])
    if "green_api" in masked and "api_token_instance" in masked["green_api"]:
        masked["green_api"]["api_token_instance"] = _mask(masked["green_api"]["api_token_instance"])
    if "custom_webhook" in masked and "api_key" in masked["custom_webhook"]:
        masked["custom_webhook"]["api_key"] = _mask(masked["custom_webhook"]["api_key"])
        
    return masked


def normalize_phone_number(phone: str, default_country: str = "213") -> str:
    """Normalize phone numbers to international format without + or spaces."""
    if not phone:
        return ""
    # Strip non-digits
    digits = re.sub(r"\D", "", str(phone).strip())
    if not digits:
        return ""
    
    default_country = re.sub(r"\D", "", default_country or "213")
    
    # If starts with 00, replace with country
    if digits.startswith("00"):
        digits = digits[2:]
        return digits
    
    # If starts with leading 0 (Algerian/French national format like 0550..., 06..., 07...)
    if digits.startswith("0") and len(digits) in (9, 10):
        digits = default_country + digits[1:]
        return digits
    
    # If 9 digits without leading 0 (e.g. 550123456 in Algeria)
    if len(digits) == 9 and digits.startswith(("5", "6", "7")):
        digits = default_country + digits
        return digits

    return digits


def _make_http_request(url: str, data: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None, timeout: int = 15) -> Dict[str, Any]:
    """Helper to perform HTTP POST or GET requests using standard library."""
    req_headers = {"User-Agent": "Zeralda-ERP-WhatsApp/3.0"}
    if headers:
        req_headers.update(headers)
    
    post_data = None
    if data is not None:
        if req_headers.get("Content-Type", "").startswith("application/json"):
            post_data = json.dumps(data).encode("utf-8")
        else:
            req_headers["Content-Type"] = "application/x-www-form-urlencoded"
            post_data = urllib.parse.urlencode(data).encode("utf-8")
            
    req = urllib.request.Request(url, data=post_data, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(body)
                return {"ok": True, "status": resp.status, "data": parsed}
            except Exception:
                return {"ok": True, "status": resp.status, "text": body}
    except urllib.error.HTTPError as he:
        err_body = he.read().decode("utf-8", errors="replace") if he.fp else str(he)
        try:
            err_json = json.loads(err_body)
            return {"ok": False, "status": he.code, "error": err_json}
        except Exception:
            return {"ok": False, "status": he.code, "error": err_body}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def send_message(phone: str, message: str, provider: Optional[str] = None) -> Dict[str, Any]:
    """Send text message via configured WhatsApp provider."""
    cfg = load_config()
    prov = provider or cfg.get("provider", "ultramsg")
    clean_phone = normalize_phone_number(phone, cfg.get("default_country_code", "213"))
    
    if not clean_phone:
        return {"ok": False, "error": "رقم الهاتف غير صالح أو مفقود (Invalid phone number)"}
    if not message:
        return {"ok": False, "error": "نص الرسالة فارغ (Empty message)"}

    # 1. UltraMsg
    if prov == "ultramsg":
        sub = cfg.get("ultramsg", {})
        inst = sub.get("instance_id", "").strip()
        tok = sub.get("token", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "إعدادات UltraMsg غير مكتملة (Instance ID أو Token مفقود)"}
        url = f"https://api.ultramsg.com/{inst}/messages/chat"
        res = _make_http_request(url, data={"token": tok, "to": clean_phone, "body": message})
        if res.get("ok"):
            return {"ok": True, "provider": "ultramsg", "response": res.get("data") or res.get("text")}
        return {"ok": False, "provider": "ultramsg", "error": res.get("error")}

    # 2. Meta WhatsApp Business Cloud API
    elif prov == "meta":
        sub = cfg.get("meta", {})
        pid = sub.get("phone_number_id", "").strip()
        tok = sub.get("access_token", "").strip()
        if not pid or not tok:
            return {"ok": False, "error": "إعدادات Meta Cloud API غير مكتملة (Phone ID أو Access Token مفقود)"}
        url = f"https://graph.facebook.com/v19.0/{pid}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_phone,
            "type": "text",
            "text": {"preview_url": False, "body": message}
        }
        res = _make_http_request(
            url,
            data=payload,
            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        )
        if res.get("ok"):
            return {"ok": True, "provider": "meta", "response": res.get("data")}
        return {"ok": False, "provider": "meta", "error": res.get("error")}

    # 3. Green-API
    elif prov == "green_api":
        sub = cfg.get("green_api", {})
        inst = sub.get("id_instance", "").strip()
        tok = sub.get("api_token_instance", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "إعدادات Green-API غير مكتملة (idInstance أو apiTokenInstance مفقود)"}
        url = f"https://api.green-api.com/waInstance{inst}/sendMessage/{tok}"
        payload = {"chatId": f"{clean_phone}@c.us", "message": message}
        res = _make_http_request(url, data=payload, headers={"Content-Type": "application/json"})
        if res.get("ok"):
            return {"ok": True, "provider": "green_api", "response": res.get("data")}
        return {"ok": False, "provider": "green_api", "error": res.get("error")}

    # 4. Custom Webhook Gateway
    elif prov == "custom_webhook":
        sub = cfg.get("custom_webhook", {})
        ep = sub.get("endpoint_url", "").strip()
        key = sub.get("api_key", "").strip()
        if not ep:
            return {"ok": False, "error": "رابط Endpoint للـ Webhook مفقود"}
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        payload = {"phone": clean_phone, "message": message, "type": "chat"}
        res = _make_http_request(ep, data=payload, headers=headers)
        if res.get("ok"):
            return {"ok": True, "provider": "custom_webhook", "response": res.get("data") or res.get("text")}
        return {"ok": False, "provider": "custom_webhook", "error": res.get("error")}

    # 5. Click-to-chat fallback URL generator
    elif prov == "click_to_chat":
        encoded = urllib.parse.quote(message)
        wa_url = f"https://api.whatsapp.com/send?phone={clean_phone}&text={encoded}"
        return {"ok": True, "provider": "click_to_chat", "url": wa_url}

    return {"ok": False, "error": f"مزود خدمة واتساب غير مدعوم: {prov}"}


def send_document(
    phone: str,
    document_base64: str,
    filename: str,
    caption: Optional[str] = None,
    provider: Optional[str] = None
) -> Dict[str, Any]:
    """Send document (PDF invoice, receipt, etc.) via configured WhatsApp provider."""
    cfg = load_config()
    prov = provider or cfg.get("provider", "ultramsg")
    clean_phone = normalize_phone_number(phone, cfg.get("default_country_code", "213"))
    caption_text = caption or ""

    if not clean_phone:
        return {"ok": False, "error": "رقم الهاتف غير صالح أو مفقود"}
    if not document_base64:
        return {"ok": False, "error": "ملف الوثيقة فارغ (Document payload missing)"}

    # Ensure document_base64 has no header prefix if pure base64 is needed, or keep data URI
    clean_b64 = document_base64
    if "," in clean_b64 and clean_b64.startswith("data:"):
        clean_b64 = clean_b64.split(",", 1)[1]

    # 1. UltraMsg (supports data:application/pdf;base64,... directly in document parameter)
    if prov == "ultramsg":
        sub = cfg.get("ultramsg", {})
        inst = sub.get("instance_id", "").strip()
        tok = sub.get("token", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "إعدادات UltraMsg غير مكتملة"}
        url = f"https://api.ultramsg.com/{inst}/messages/document"
        data_uri = f"data:application/pdf;base64,{clean_b64}"
        res = _make_http_request(url, data={
            "token": tok,
            "to": clean_phone,
            "filename": filename or "Invoice.pdf",
            "document": data_uri,
            "caption": caption_text
        })
        if res.get("ok"):
            return {"ok": True, "provider": "ultramsg", "response": res.get("data") or res.get("text")}
        return {"ok": False, "provider": "ultramsg", "error": res.get("error")}

    # 2. Green-API (sendFileByUpload)
    elif prov == "green_api":
        sub = cfg.get("green_api", {})
        inst = sub.get("id_instance", "").strip()
        tok = sub.get("api_token_instance", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "إعدادات Green-API غير مكتملة"}
        url = f"https://api.green-api.com/waInstance{inst}/sendFileByUpload/{tok}"
        # Green-API supports sending base64 files
        payload = {
            "chatId": f"{clean_phone}@c.us",
            "fileName": filename or "Invoice.pdf",
            "caption": caption_text,
            "file": f"data:application/pdf;base64,{clean_b64}"
        }
        res = _make_http_request(url, data=payload, headers={"Content-Type": "application/json"})
        if res.get("ok"):
            return {"ok": True, "provider": "green_api", "response": res.get("data")}
        return {"ok": False, "provider": "green_api", "error": res.get("error")}

    # 3. Custom Webhook / Self-hosted Baileys Gateway
    elif prov == "custom_webhook":
        sub = cfg.get("custom_webhook", {})
        ep = sub.get("endpoint_url", "").strip()
        key = sub.get("api_key", "").strip()
        if not ep:
            return {"ok": False, "error": "رابط Webhook غير محدد"}
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        payload = {
            "phone": clean_phone,
            "type": "document",
            "filename": filename or "Invoice.pdf",
            "caption": caption_text,
            "base64": clean_b64
        }
        res = _make_http_request(ep, data=payload, headers=headers)
        if res.get("ok"):
            return {"ok": True, "provider": "custom_webhook", "response": res.get("data") or res.get("text")}
        return {"ok": False, "provider": "custom_webhook", "error": res.get("error")}

    # 4. Meta Cloud API (requires hosted URL or media upload session)
    elif prov == "meta":
        # Meta Cloud API media message format requires either media ID or public link
        # If public link isn't directly available from local, send text message with guidance
        sub = cfg.get("meta", {})
        pid = sub.get("phone_number_id", "").strip()
        tok = sub.get("access_token", "").strip()
        if not pid or not tok:
            return {"ok": False, "error": "إعدادات Meta Cloud API غير مكتملة"}
        
        # We can upload the media first via graph API
        # Or send message notification
        msg = f"{caption_text}\n\n📄 الفاتورة: {filename}"
        return send_message(phone, msg, provider="meta")

    return {"ok": False, "error": f"إرسال الوثائق غير مدعوم حالياً في المزود: {prov}"}


def test_connection(test_phone: Optional[str] = None) -> Dict[str, Any]:
    """Test WhatsApp connection with a ping or test message."""
    cfg = load_config()
    target_phone = test_phone or ""
    
    if target_phone:
        test_msg = "✅ تجربة اتصال ناجحة مع Zeralda ERP WhatsApp API!\nالاتصال يعمل بشكل مثالي."
        return send_message(target_phone, test_msg)
    
    # Provider-level credential ping check if no phone provided
    prov = cfg.get("provider", "ultramsg")
    if prov == "ultramsg":
        sub = cfg.get("ultramsg", {})
        inst = sub.get("instance_id", "").strip()
        tok = sub.get("token", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "يرجى إدخال Instance ID و Token لـ UltraMsg"}
        url = f"https://api.ultramsg.com/{inst}/instance/status?token={tok}"
        res = _make_http_request(url)
        if res.get("ok"):
            return {"ok": True, "provider": "ultramsg", "status": "Connected", "details": res.get("data")}
        return {"ok": False, "provider": "ultramsg", "error": res.get("error")}
        
    elif prov == "green_api":
        sub = cfg.get("green_api", {})
        inst = sub.get("id_instance", "").strip()
        tok = sub.get("api_token_instance", "").strip()
        if not inst or not tok:
            return {"ok": False, "error": "يرجى إدخال idInstance و apiTokenInstance"}
        url = f"https://api.green-api.com/waInstance{inst}/getStateInstance/{tok}"
        res = _make_http_request(url)
        if res.get("ok"):
            return {"ok": True, "provider": "green_api", "status": "Connected", "details": res.get("data")}
        return {"ok": False, "provider": "green_api", "error": res.get("error")}

    elif prov == "meta":
        sub = cfg.get("meta", {})
        pid = sub.get("phone_number_id", "").strip()
        tok = sub.get("access_token", "").strip()
        if not pid or not tok:
            return {"ok": False, "error": "يرجى إدخال Phone Number ID و Access Token"}
        url = f"https://graph.facebook.com/v19.0/{pid}"
        res = _make_http_request(url, headers={"Authorization": f"Bearer {tok}"})
        if res.get("ok"):
            return {"ok": True, "provider": "meta", "status": "Verified", "details": res.get("data")}
        return {"ok": False, "provider": "meta", "error": res.get("error")}

    return {"ok": True, "provider": prov, "message": "المزود جاهز للاستخدام"}


def _deep_merge(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    for k, v in source.items():
        if isinstance(v, dict) and k in target and isinstance(target[k], dict):
            _deep_merge(target[k], v)
        else:
            target[k] = v

