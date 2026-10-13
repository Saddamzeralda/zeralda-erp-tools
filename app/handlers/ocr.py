"""OCR and file-analysis endpoints.

Extracted from legacy server.py. Invoice-extract heuristics kept intact
(they're business logic, not security).

FIX (audit finding): all OCR/AI file-processing endpoints (ocr/extract,
ai/invoice-extract, ai/analyze-file, ai/compare-files, ai/extract-table,
ai/classify) were completely unauthenticated in both this module and the
legacy server.py, allowing any network-reachable caller to trigger costly
AI provider calls (cost-exhaustion / DoS). Added ``_require_ai_user`` guard
(auth + per-user rate limit) mirroring app/handlers/ai.py's pattern.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services.security import read_json_body, require_auth, log_structured, ai_rate_limited

router = APIRouter(prefix="/api", tags=["ocr"])


def _require_ai_user(request: Request) -> Dict[str, Any]:
    """Auth + per-user rate limit guard for expensive OCR/AI file endpoints.

    FIX: these endpoints previously had no authentication at all, allowing
    any network-reachable caller to trigger costly AI provider calls
    (cost-exhaustion / DoS) and OCR processing. Mirrors the pattern used by
    app/handlers/ai.py's /chat and /action endpoints.
    """
    user = require_auth(request)
    rate_key = user.get("email") or (request.client.host if request.client else "unknown")
    if ai_rate_limited(rate_key):
        raise HTTPException(429, detail={"ok": False, "error": "Too many AI requests",
                                         "code": "RATE_LIMITED"})
    return user


class OcrExtractRequest(BaseModel):
    fileBase64: str = ""
    mimeType: str = "image/jpeg"
    fileName: Optional[str] = None
    lang: str = "ara+fra+eng"
    aiPrompt: Optional[str] = None
    aiSystemPrompt: Optional[str] = None
    useAI: bool = False


@router.get("/ocr/status")
async def ocr_status(request: Request):
    _require_ai_user(request)
    try:
        from backend.ocr_service import get_ocr_status
        status = get_ocr_status()
    except Exception as exc:
        status = {"ok": False, "tesseract_ready": False, "details": str(exc)}
    import os
    tesseract_cmd = os.environ.get("TESSERACT_CMD", "")
    tessdata_prefix = os.environ.get("TESSDATA_PREFIX", "")
    langs = []
    try:
        import pytesseract as _tess
        langs = _tess.get_languages()
    except Exception:
        pass
    return {**status, "tesseract_cmd": tesseract_cmd or "(auto-detected from PATH)",
            "tessdata_prefix": tessdata_prefix or "(default)", "installed_languages": langs}


@router.get("/ocr/languages")
async def ocr_languages(request: Request):
    _require_ai_user(request)
    langs = []
    error = None
    try:
        import pytesseract as _tess
        from backend.ocr_service import _configure_tesseract_cmd
        _configure_tesseract_cmd()
        langs = _tess.get_languages()
    except Exception as exc:
        error = str(exc)
    return {"ok": bool(langs), "languages": langs, "error": error}


@router.post("/ocr/extract")
async def ocr_extract(request: Request):
    _require_ai_user(request)
    data = await read_json_body(request, max_bytes=104857600)
    try:
        req = OcrExtractRequest(**{k: v for k, v in data.items() if k in OcrExtractRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    if not req.fileBase64:
        raise HTTPException(400, detail={"ok": False, "error": "fileBase64 is required"})
    try:
        import asyncio
        from backend.ocr_service import extract_text_from_payload
        # Run CPU-bound OCR in a thread pool to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: extract_text_from_payload(
                req.fileBase64, req.mimeType, req.lang, file_name=req.fileName or ""
            )
        )
        if (req.useAI or req.aiPrompt) and result.get("ok"):
            from backend.ai_routes import ai_chat as _ai_chat
            text_for_ai = str(result.get("text") or "").strip()
            if text_for_ai:
                default_prompt = ("Analyze the following OCR text and return a concise structured JSON "
                                  "with key fields, detected entities, and a short summary.")
                ai_user_prompt = f"{req.aiPrompt or default_prompt}\n\nOCR text:\n{text_for_ai[:12000]}"
                ai_result = _ai_chat([{"role": "user", "content": ai_user_prompt}],
                                     system_prompt=req.aiSystemPrompt or None)
                result["ai"] = ai_result
        return result
    except Exception as exc:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


# ── Invoice extract (kept compact — full heuristics live in ai_file_processor) ─
def _clean_number(val) -> float:
    """Clean a numeric string/value that may contain thousands separators and comma decimals."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(" ", "").replace("\u00a0", "")  # remove spaces and NBSP
    # If both ',' and '.' present: assume ',' is thousands sep (e.g. "1,234.56")
    if "," in s and "." in s:
        s = s.replace(",", "")
    # If only ',' present: assume it's a decimal separator (e.g. "1234,56")
    elif "," in s:
        s = s.replace(",", ".")
    # Remove any remaining non-numeric chars (currency symbols, etc.)
    s = re.sub(r"[^0-9.\-]", "", s)
    try:
        return float(s) if s else 0.0
    except Exception:
        return 0.0


def _extract_first_json_object(text: str) -> Optional[dict]:
    """Extract the first valid JSON object from text using balanced brace matching."""
    s = str(text or "")
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    candidate = s[start:i + 1]
                    try:
                        return json.loads(candidate)
                    except Exception:
                        # Try next brace
                        start = s.find("{", i + 1)
                        if start < 0:
                            return None
                        depth = 0
                        i = start - 1  # will be incremented by loop
    return None


@router.post("/ai/invoice-extract")
async def invoice_extract(request: Request):
    _require_ai_user(request)
    try:
        data = await read_json_body(request, max_bytes=104857600)
    except HTTPException as e:
        if e.status_code == 413:
            return JSONResponse(status_code=413, content={"ok": False,
                            "error": "الملف كبير جداً (الحد الأقصى 100 ميغابايت) / File too large (max 100MB).",
                            "code": "PAYLOAD_TOO_LARGE"})
        raise
    if isinstance(data, dict) and data.get("__error__") == "PAYLOAD_TOO_LARGE":
        return JSONResponse(status_code=413, content={"ok": False,
                        "error": "الملف كبير جداً (الحد الأقصى 100 ميغابايت) / File too large (max 100MB).",
                        "code": "PAYLOAD_TOO_LARGE"})

    file_b64 = str(data.get("fileBase64") or "")
    mime_type = str(data.get("mimeType") or "").lower().strip()
    file_name = str(data.get("fileName") or "").strip()
    plain_text = str(data.get("text") or data.get("content") or "").strip()

    if file_b64:
        try:
            from backend import ai_file_processor
            import os
            import asyncio
            from app.services import storage as _storage
            ai_settings_file = os.path.join(_storage.DATA_DIR, "ai_settings.json")
            ocr_engine = "ai"
            try:
                with open(ai_settings_file, "r", encoding="utf-8-sig") as f:
                    _ai_cfg = json.load(f)
                ocr_engine = str(_ai_cfg.get("ocr_engine", "ai")).strip().lower()
                if ocr_engine not in ("auto", "tesseract", "ai"):
                    ocr_engine = "ai"
            except Exception:
                pass
            # Run CPU-bound file processing in a thread pool
            loop = asyncio.get_event_loop()
            proc_result = await loop.run_in_executor(
                None, lambda: ai_file_processor.process_file_for_analysis(
                    file_b64, mime_type or "application/octet-stream", file_name,
                    analysis_type="invoice", language="ara+fra+eng", ocr_engine=ocr_engine,
                )
            )
            source_text = str(proc_result.get("text") or "").strip()
            # FIX: In vision-first mode, process_file_for_analysis returns ok=True
            # with the extracted data in `analysis` but `text` may be empty (the
            # vision model returns structured JSON, not raw text). Previously this
            # returned a 400 "OCR returned no text" error even though extraction
            # succeeded. Only fail on empty text if there's also no analysis data.
            analysis = proc_result.get("analysis") or {}
            if not source_text:
                if proc_result.get("ok") and analysis and (
                    analysis.get("fields") or analysis.get("line_items") or analysis.get("records")
                ):
                    # Vision-first mode: text is empty but analysis has the data
                    source_text = str(analysis.get("raw_text") or "")
                else:
                    # Automatic fallback to Tesseract if Copilot returned no text/failed
                    try:
                        from backend.ocr_service import extract_text_from_payload
                        tess_res = await loop.run_in_executor(
                            None, lambda: extract_text_from_payload(
                                file_b64, mime_type, "ara+fra+eng", file_name=file_name
                            )
                        )
                        if tess_res.get("ok") and str(tess_res.get("text", "")).strip():
                            source_text = str(tess_res.get("text")).strip()
                            proc_result["text"] = source_text
                            proc_result["ocr_engine_used"] = "tesseract-fallback"
                            proc_result["ok"] = True
                            from backend.ai_file_processor import _regex_invoice_extract
                            reg_data = _regex_invoice_extract(source_text)
                            if reg_data:
                                analysis = reg_data
                                proc_result["analysis"] = reg_data
                    except Exception as tess_e:
                        print(f"[INVOICE-EXTRACT] Final Tesseract fallback error: {tess_e}")

                    if not source_text:
                        proc_error = str(proc_result.get("error") or "OCR returned no text.")
                        if sys.platform.startswith("win") and ("tesseract" in proc_error.lower() or "pytesseract" in proc_error.lower()):
                            proc_error += " (Windows: Install Tesseract OCR engine from https://github.com/UB-Mannheim/tesseract/wiki)"
                        return JSONResponse(status_code=400, content={"ok": False, "error": proc_error})

            fields = analysis.get("fields") or {}
            line_items = analysis.get("line_items") or []

            from backend.ai_routes import normalize_line_items as _normalize_line_items
            from backend.ai_routes import ai_chat as _ai_chat

            # Fallback AI extraction if no line items
            if not line_items and source_text:
                try:
                    fallback_prompt = (
                        "Vous êtes un extracteur de factures expert. Extrayez TOUS les articles du texte.\n"
                        'Retournez UNIQUEMENT un objet JSON valide: {"lineItems": [{"description": "...", '
                        '"quantity": 1, "unit_price": 0.00, "total": 0.00}]}\n\n'
                        f"Texte de la facture:\n{source_text[:12000]}"
                    )
                    fb_result = _ai_chat([{"role": "user", "content": fallback_prompt}],
                                         system_prompt="Retournez uniquement le JSON.",
                                         max_tokens=8192, temperature=0.3)
                    if fb_result.get("ok"):
                        fb_parsed = _extract_first_json_object(str(fb_result.get("reply", "")))
                        if fb_parsed:
                            fb_items = fb_parsed.get("lineItems") or fb_parsed.get("line_items") or []
                            if isinstance(fb_items, list) and fb_items:
                                line_items = fb_items
                except Exception:
                    pass

            # Regex fallback: if AI returned no line items OR no supplier fields, try regex extraction
            # FIX: AI (especially Gemini free tier) sometimes returns ok=True with empty/garbage reply,
            # leaving fields empty even though line_items were extracted. Regex fills the gaps.
            _need_regex = (not line_items) or (not fields.get('supplier_name') and not fields.get('supplier'))
            if _need_regex and source_text:
                try:
                    from backend.ai_file_processor import _regex_invoice_extract
                    regex_result = _regex_invoice_extract(source_text)
                    if regex_result:
                        regex_fields = regex_result.get('fields') or {}
                        # Fill missing supplier fields from regex
                        for _fk in ('supplier_name', 'supplier_address', 'supplier_rc',
                                    'supplier_nif', 'supplier_nis', 'supplier_art', 'supplier_bp',
                                    'supplier_phone', 'supplier_email', 'supplier_rib',
                                    'supplier_bank', 'customer_name', 'invoice_number',
                                    'invoice_date', 'currency', 'total'):
                            if not fields.get(_fk) and regex_fields.get(_fk):
                                fields[_fk] = regex_fields[_fk]
                        # Fill missing line items from regex
                        if not line_items and regex_result.get('line_items'):
                            line_items = regex_result['line_items']
                            print(f'[OCR] Regex fallback extracted {len(line_items)} line items + {len(regex_fields)} fields')
                        elif regex_fields.get('supplier_name'):
                            print(f'[OCR] Regex fallback filled supplier fields: {list(regex_fields.keys())}')
                except Exception:
                    pass

            _supplier_name = (fields.get("supplier_name") or fields.get("supplier") or
                              fields.get("company_name") or fields.get("vendor") or
                              fields.get("seller") or fields.get("emetteur") or "").strip()
            _customer_name = (fields.get("customer_name") or fields.get("customer") or
                              fields.get("client") or fields.get("buyer") or
                              fields.get("acheteur") or fields.get("destinataire") or "").strip()
            _customer_name = _customer_name.lstrip("| \t\r\n").strip()

            if _customer_name and _supplier_name and _customer_name.lower() == _supplier_name.lower():
                _customer_name = ""

            return {
                "ok": True, "text": source_text,
                "externalRef": fields.get("invoice_number"),
                "supplier": _supplier_name, "supplierContact": None,
                "supplierEmail": fields.get("supplier_email"), "supplierPhone": fields.get("supplier_phone"),
                "supplierTaxId": fields.get("supplier_nif") or fields.get("nif"),
                "supplierRc": fields.get("supplier_rc") or fields.get("rc"),
                "supplierNis": fields.get("supplier_nis") or fields.get("nis"),
                "supplierArt": fields.get("supplier_art") or fields.get("art"),
                "supplierBp": fields.get("supplier_bp") or fields.get("bp"),
                "supplierRib": fields.get("supplier_rib") or fields.get("rib"),
                "supplierBank": fields.get("supplier_bank") or fields.get("bank"),
                "supplierWebsite": None, "supplierAddress": fields.get("supplier_address"),
                "supplierCity": fields.get("supplier_city"),
                "supplierState": None, "supplierCountry": None,
                "supplierAi": fields.get("supplier_ai"),
                "customer": _customer_name, "customerAddress": fields.get("customer_address"),
                "customerCity": fields.get("customer_city"),
                "customerPhone": fields.get("customer_phone"),
                "customerEmail": fields.get("customer_email"),
                "customerTaxId": fields.get("customer_nif"),
                "customerRc": fields.get("customer_rc"),
                "customerNis": fields.get("customer_nis"),
                "customerArt": fields.get("customer_art"),
                "amount": _clean_number(fields.get("total")),
                "vatAmount": _clean_number(fields.get("tax")),
                "billDate": fields.get("invoice_date"), "dueDate": fields.get("due_date"),
                "currency": fields.get("currency", "DZD"),
                "lineItems": _normalize_line_items(line_items) if isinstance(line_items, list) else [],
                "model": None, "aiError": analysis.get("error"),
                "ocrEngineUsed": proc_result.get("ocr_engine_used", ""),
                "ocrEngineRequested": proc_result.get("ocr_engine_requested", ""),
            }
        except HTTPException:
            raise
        except Exception as exc:
            import traceback
            log_structured("ERROR", "Invoice extract failed", action="invoice_extract_error",
                           error=str(exc), traceback=traceback.format_exc())
            return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})

    # Text-only fallback
    source_text = plain_text[:12000]
    if not source_text:
        return JSONResponse(status_code=400, content={"ok": False, "error": "No text or file provided"})
    try:
        from backend.ai_routes import ai_chat as _ai_chat
        from backend.ai_routes import normalize_line_items as _normalize_line_items

        # FIX: Run regex extraction first (works without AI API key)
        _regex_fields = {}
        _regex_items = []
        try:
            from backend.ai_file_processor import _regex_invoice_extract
            _regex_result = _regex_invoice_extract(source_text)
            if _regex_result:
                _regex_fields = _regex_result.get('fields') or {}
                _regex_items = _regex_result.get('line_items') or []
        except Exception:
            pass

        prompt = (
            "Vous êtes un extracteur de factures expert. Retournez UNIQUEMENT un objet JSON valide avec: "
            "externalRef, supplier, customer, amount, vatAmount, billDate, dueDate, currency, lineItems."
            f"\n\nDonnées à extraire:\n{source_text}"
        )
        ai_result = _ai_chat([{"role": "user", "content": prompt}],
                             system_prompt="Retournez uniquement le JSON pour l'extraction de facture.",
                             max_tokens=8192, temperature=0.3)

        parsed = {}
        if ai_result.get("ok"):
            reply = str(ai_result.get("reply", ""))
            parsed = _extract_first_json_object(reply) or {}

        _supplier_name = (parsed.get("supplier") or parsed.get("vendor_name") or
                          _regex_fields.get("supplier_name") or "").strip()
        _customer_name = (parsed.get("customer") or parsed.get("client") or
                          _regex_fields.get("customer_name") or "").strip()
        if _customer_name and _supplier_name and _customer_name.lower() == _supplier_name.lower():
            _customer_name = ""

        # Merge: AI results take priority, regex fills gaps
        _line_items = parsed.get("lineItems") or parsed.get("line_items") or []
        if not _line_items and _regex_items:
            _line_items = _regex_items

        return {
            "ok": True, "text": source_text,
            "externalRef": parsed.get("externalRef") or parsed.get("invoice_number") or _regex_fields.get("invoice_number"),
            "supplier": _supplier_name, "customer": _customer_name,
            "supplierRc": _regex_fields.get("supplier_rc"),
            "supplierNif": _regex_fields.get("supplier_nif"),
            "supplierNis": _regex_fields.get("supplier_nis"),
            "supplierArt": _regex_fields.get("supplier_art"),
            "supplierBp": _regex_fields.get("supplier_bp"),
            "supplierPhone": _regex_fields.get("supplier_phone"),
            "supplierEmail": _regex_fields.get("supplier_email"),
            "supplierAddress": _regex_fields.get("supplier_address"),
            "supplierRib": _regex_fields.get("supplier_rib"),
            "supplierBank": _regex_fields.get("supplier_bank"),
            "amount": _clean_number(parsed.get("amount")) or _clean_number(_regex_fields.get("total")),
            "vatAmount": _clean_number(parsed.get("vatAmount")),
            "billDate": parsed.get("billDate") or parsed.get("date") or _regex_fields.get("invoice_date"),
            "dueDate": parsed.get("dueDate") or parsed.get("due_date"),
            "currency": parsed.get("currency", "DZD"),
            "lineItems": _normalize_line_items(_line_items) if isinstance(_line_items, list) else [],
            "model": ai_result.get("model"),
            "aiError": ai_result.get("error") if not ai_result.get("ok") else None,
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(exc)})


# ── Generic file analysis ─────────────────────────────────────────────────
@router.post("/ai/analyze-file")
async def analyze_file(request: Request):
    _require_ai_user(request)
    try:
        from backend import ai_file_processor
        import asyncio
        import os
        from app.services import storage
        data = await read_json_body(request)
        if not data.get("fileBase64"):
            raise HTTPException(400, detail={"ok": False, "error": "fileBase64 is required"})
        ocr_engine = "ai"
        try:
            ai_settings_file = os.path.join(storage.DATA_DIR, "ai_settings.json")
            with open(ai_settings_file, "r", encoding="utf-8-sig") as f:
                _ai_cfg = json.load(f)
            ocr_engine = str(_ai_cfg.get("ocr_engine", "ai")).strip().lower()
            if ocr_engine not in ("auto", "tesseract", "ai"):
                ocr_engine = "ai"
        except Exception:
            pass
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: ai_file_processor.process_file_for_analysis(
                data.get("fileBase64", ""), data.get("mimeType", "application/octet-stream"),
                data.get("fileName", ""), data.get("analysisType", "general"),
                data.get("language", "ara+fra+eng"), ocr_engine=ocr_engine,
            )
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@router.post("/ai/compare-files")
async def compare_files(request: Request):
    _require_ai_user(request)
    try:
        from backend import ai_file_processor
        import asyncio
        data = await read_json_body(request)
        files = data.get("files", [])
        if not isinstance(files, list) or len(files) < 2:
            raise HTTPException(400, detail={"ok": False, "error": "At least 2 files are required for comparison"})
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: ai_file_processor.compare_documents(files, data.get("type", "differences"))
        )
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@router.post("/ai/extract-table")
async def extract_table(request: Request):
    _require_ai_user(request)
    try:
        from backend import ai_file_processor
        import asyncio
        data = await read_json_body(request)
        if not data.get("fileBase64"):
            raise HTTPException(400, detail={"ok": False, "error": "fileBase64 is required"})
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: ai_file_processor.extract_table_from_image(
                data.get("fileBase64", ""), data.get("mimeType", ""), data.get("fileName", "")
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@router.post("/ai/classify")
async def classify(request: Request):
    _require_ai_user(request)
    try:
        from backend import ai_file_processor
        import asyncio
        data = await read_json_body(request)
        if not data.get("fileBase64"):
            raise HTTPException(400, detail={"ok": False, "error": "fileBase64 is required"})
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, lambda: ai_file_processor.classify_document(
                data.get("fileBase64", ""), data.get("mimeType", ""),
                data.get("fileName", ""), data.get("categories"),
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
