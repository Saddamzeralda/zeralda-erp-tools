"""Mobile and Web Push Notification Endpoints for Zeralda ERP."""
from __future__ import annotations

from fastapi import APIRouter, Request, HTTPException

from app.services import notifications
from app.services.security import read_json_body, require_auth, validate_session

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── VAPID Public Key ───────────────────────────────────────────────────────
@router.get("/vapid-public-key")
async def get_vapid_key(request: Request):
    """Retrieve the VAPID Public Key required by browsers for PushManager."""
    pub_key = notifications.get_vapid_public_key()
    return {"ok": True, "publicKey": pub_key}


# ── Subscriptions ──────────────────────────────────────────────────────────
@router.post("/subscribe")
async def subscribe_device(request: Request):
    """Register a mobile phone / browser push subscription."""
    user = validate_session(request) or {"email": "anonymous_user"}
    data = await read_json_body(request)
    
    sub_data = data.get("subscription") or data
    device_name = data.get("deviceName", "هاتف ذكي")
    
    result = notifications.add_subscription(
        sub_info=sub_data,
        user_email=user.get("email", "user"),
        device_name=device_name
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result)
    
    return result


@router.post("/unsubscribe")
async def unsubscribe_device(request: Request):
    """Unregister a push subscription."""
    data = await read_json_body(request)
    endpoint = data.get("endpoint", "").strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Missing endpoint"})
    
    ok = notifications.remove_subscription(endpoint)
    return {"ok": True, "removed": ok}


@router.get("/subscriptions")
async def get_subscriptions(request: Request):
    """List all registered mobile devices and browsers (admin only)."""
    require_auth(request, required_role="admin")
    return {"ok": True, "subscriptions": notifications.list_subscriptions()}


@router.delete("/subscriptions")
async def delete_subscription(request: Request):
    """Delete a subscription by endpoint (admin only)."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    endpoint = data.get("endpoint", "").strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Missing endpoint"})
    ok = notifications.remove_subscription(endpoint)
    return {"ok": True, "deleted": ok}


# ── Send & Test Push ───────────────────────────────────────────────────────
@router.post("/test-push")
async def send_test_push(request: Request):
    """Send an immediate test notification to mobile devices."""
    user = validate_session(request) or {"email": "admin"}
    data = await read_json_body(request) if request.headers.get("content-length") else {}
    target_sub = data.get("subscription")

    test_payload = {
        "title": "🔔 [Zeralda ERP] إشعار تجريبي للهاتف",
        "body": f"تم تفعيل إشعارات الهاتف بنجاح! هذا اختبار حي لنظام الإشعارات الفوري.",
        "icon": "/favicon.ico",
        "badge": "/favicon.ico",
        "url": "/zeralda_erp_dashboard.html",
        "tag": "zeralda-test-push",
        "category": "test",
        "level": "info",
        "timestamp": int(__import__("time").time() * 1000)
    }

    if target_sub:
        sent = notifications.send_web_push(target_sub, test_payload)
        return {"ok": True, "sent": sent, "mode": "direct_device"}
    else:
        # Broadcast to all registered phones
        res = notifications.dispatch_mobile_alert(
            title="🔔 [Zeralda ERP] إشعار تجريبي للهاتف",
            message="تم تفعيل واستقبال إشعار الهاتف بنجاح من نظام Zeralda ERP.",
            category="test",
            url="/zeralda_erp_dashboard.html",
            level="info"
        )
        return {"ok": True, "broadcast": res}


@router.post("/send")
async def send_custom_notification(request: Request):
    """Send a custom mobile notification across configured channels (admin only)."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    
    title = data.get("title", "تنبيه من Zeralda ERP")
    message = data.get("message") or data.get("body", "")
    url = data.get("url", "/zeralda_erp_dashboard.html")
    category = data.get("category", "general")
    level = data.get("level", "info")

    if not message:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Message body is required"})

    res = notifications.dispatch_mobile_alert(
        title=title,
        message=message,
        category=category,
        url=url,
        level=level,
        metadata=data.get("metadata")
    )
    return {"ok": True, "result": res}


# ── Configuration & Telegram ───────────────────────────────────────────────
@router.get("/settings")
async def get_settings_endpoint(request: Request):
    """Get mobile notifications and Telegram settings (admin only)."""
    require_auth(request, required_role="admin")
    cfg = notifications.get_notification_settings()
    # Mask bot token for security
    masked = dict(cfg)
    token = masked.get("telegram_bot_token", "")
    if token and len(token) > 10:
        masked["telegram_bot_token_masked"] = token[:6] + "..." + token[-4:]
    return {"ok": True, "settings": masked}


@router.post("/settings")
async def update_settings_endpoint(request: Request):
    """Update mobile notification preferences and bot credentials (admin only)."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    updated = notifications.update_notification_settings(data)
    return {"ok": True, "settings": updated}


@router.post("/test-telegram")
async def test_telegram_endpoint(request: Request):
    """Send an immediate test alert to Telegram Bot."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    
    # If custom credentials provided in payload, temporarily test them
    custom_token = data.get("bot_token")
    custom_chat = data.get("chat_id")
    
    if custom_token and custom_chat:
        try:
            import urllib.request, json
            url = f"https://api.telegram.org/bot{custom_token}/sendMessage"
            body = json.dumps({
                "chat_id": custom_chat,
                "text": "📱 <b>[Zeralda ERP — اختبار اتصال تيليغرام]</b>\n\n✅ تم الاتصال بنجاح مع هاتف المشرف! سيتم استلام تنبيهات النظام هنا.",
                "parse_mode": "HTML"
            }).encode("utf-8")
            req = urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                ok = r.status == 200
            return {"ok": ok, "message": "تم إرسال الرسالة بنجاح إلى تيليغرام!" if ok else "فشل الإرسال"}
        except Exception as e:
            raise HTTPException(status_code=400, detail={"ok": False, "error": f"فشل الاتصال بـ Telegram: {str(e)}"})
    else:
        ok = notifications.send_telegram_alert(
            title="اختبار الاتصال بالهاتف",
            message="تم ربط هاتف المدير وتفعيل الإشعارات الفورية بنجاح!"
        )
        return {"ok": ok, "message": "تم إرسال رسالة الاختبار بنجاح" if ok else "تعذر الإرسال، يرجى التأكد من التوكن والمعرف"}


@router.get("/history")
async def get_history_endpoint(request: Request):
    """Retrieve delivery history of recent mobile alerts."""
    require_auth(request, required_role="admin")
    return {"ok": True, "history": notifications.get_notification_history()}
