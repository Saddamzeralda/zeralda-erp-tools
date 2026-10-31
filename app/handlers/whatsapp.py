"""FastAPI Router for WhatsApp API Integration in Zeralda ERP."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.services import whatsapp_service
from app.services.security import read_json_body, validate_session

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


@router.get("/config")
async def get_whatsapp_config(request: Request):
    """Return masked WhatsApp configuration."""
    cfg = whatsapp_service.get_masked_config()
    return {"ok": True, "config": cfg}


@router.post("/config")
async def update_whatsapp_config(request: Request):
    """Save updated WhatsApp configuration."""
    data = await read_json_body(request)
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Invalid JSON body"})
    
    res = whatsapp_service.save_config(data)
    if not res.get("ok"):
        raise HTTPException(status_code=500, detail=res)
    return res


@router.post("/test")
async def test_whatsapp(request: Request):
    """Test WhatsApp credentials or send test message."""
    data = await read_json_body(request)
    test_phone = data.get("phone", "").strip() if isinstance(data, dict) else ""
    res = whatsapp_service.test_connection(test_phone)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res


@router.post("/send-message")
async def send_whatsapp_message(request: Request):
    """Send text message via WhatsApp."""
    data = await read_json_body(request)
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Invalid JSON"})
    
    phone = data.get("phone", "").strip()
    message = data.get("message", "").strip()
    provider = data.get("provider")
    
    if not phone or not message:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "رقم الهاتف ونص الرسالة مطلوبان"})
        
    res = whatsapp_service.send_message(phone, message, provider)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res


@router.post("/send-document")
async def send_whatsapp_document(request: Request):
    """Send document (PDF invoice) directly to WhatsApp number."""
    data = await read_json_body(request)
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Invalid JSON"})
    
    phone = data.get("phone", "").strip()
    doc_b64 = data.get("document", "")
    filename = data.get("filename", "Invoice.pdf")
    caption = data.get("caption", "")
    provider = data.get("provider")
    
    if not phone or not doc_b64:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "رقم الهاتف والملف مطلوبان"})
        
    res = whatsapp_service.send_document(phone, doc_b64, filename, caption, provider)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res

