"""Backup & restore endpoints.

Fixes vs. legacy server.py:
- /api/backup/restore validates schema version and backs up current store before overwriting (legacy bug #33).
- AI settings from restore are encrypted via DPAPI before writing (legacy wrote raw).
- /api/backup/folder/pick requires admin (legacy allowed any auth).
"""
from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from app.services import storage
from app.services.pdf import generate_invoice_pdf
from app.services.security import log_structured, read_json_body, require_auth, validate_session

router = APIRouter(prefix="/api/backup", tags=["backup"])


# ── Module definitions for folder export ──────────────────────────────────
MODULE_DEFS = [
    ("invoices-data", "invoices", "الفواتير", True),
    ("proformas-data", "proformas", "عروض الأسعار", True),
    ("customers-data", "customers", "العملاء", False),
    ("suppliers-data", "suppliers", "الموردون", False),
    ("products-data", "products", "المنتجات", False),
    ("employees-data", "employees", "الموظفون", False),
    ("payroll-data", "payroll", "الرواتب", False),
    ("hr-leaves", "hr-leaves", "الإجازات", False),
    ("purchases-data", "purchases", "المشتريات", False),
    ("purchase-orders-data", "purchase-orders", "أوامر الشراء", False),
    ("tenders-data", "tenders", "المناقصات", False),
    ("consultations-data", "consultations", "الاستشارات", False),
    ("finance-transactions", "finance", "المالية", False),
    ("expenses-data", "expenses", "المصاريف", False),
    ("zeralda-services", "services", "الخدمات", False),
    ("stock-movements", "stock", "المخزون", False),
    ("inventory-categories", "inventory-cats", "تصنيفات المخزون", False),
    ("leads-data", "leads", "العملاء المحتملون", False),
    ("opportunities-data", "opportunities", "فرص البيع", False),
    ("projects-data", "projects", "المشاريع", False),
    ("proposals-data", "proposals", "العروض", False),
    ("appointments-data", "appointments", "المواعيد", False),
    ("tickets-data", "tickets", "التذاكر", False),
    ("accounts-data", "accounts", "الحسابات", False),
    ("journal-entries-data", "journal", "القيود المحاسبية", False),
    ("contacts-data", "contacts", "جهات الاتصال", False),
]

SUPPORTED_SCHEMAS = {"1.0", "2.0", "3.0"}


def _read_ai_settings() -> Dict[str, Any]:
    ai_sf = os.path.join(storage.DATA_DIR, "ai_settings.json")
    try:
        with open(ai_sf, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _write_ai_settings(data: Dict[str, Any]) -> None:
    ai_sf = os.path.join(storage.DATA_DIR, "ai_settings.json")
    with open(ai_sf, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── /api/backup (full JSON download, admin) ───────────────────────────────
@router.get("")
async def backup_download(request: Request):
    user = require_auth(request, required_role="admin")
    with storage._lock:
        store = storage.read_store()
    ai_cfg = _read_ai_settings()
    backup = {
        "schema": "3.0",
        "created_at": datetime.datetime.now().isoformat(),
        "created_by": user.get("email", "admin"),
        "store": store,
        "ai_settings": ai_cfg,
    }
    body = json.dumps(backup, ensure_ascii=False, indent=2).encode("utf-8")
    fname = f'zeralda-backup-{datetime.datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
    log_structured("INFO", "Full backup created", action="backup_create",
                   initiator=user.get("email"), keys=len(store), status="success")
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"',
                 "Cache-Control": "no-store"},
    )


# ── /api/backup/restore (FIX #33) ─────────────────────────────────────────
class RestoreRequest(BaseModel):
    store: Dict[str, Any]
    ai_settings: Optional[Dict[str, Any]] = None
    # Use alias to avoid shadowing BaseModel.schema()
    schema_version: str = Field(default="1.0", alias="schema")

    model_config = {"populate_by_name": True}


@router.post("/restore")
async def backup_restore(request: Request):
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = RestoreRequest(**{k: v for k, v in data.items() if k in ("store", "ai_settings", "schema")})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    # FIX #33: validate schema
    if req.schema_version not in SUPPORTED_SCHEMAS:
        raise HTTPException(400, detail={"ok": False,
                       "error": f"Unsupported schema: {req.schema_version}. Supported: {sorted(SUPPORTED_SCHEMAS)}"})

    # FIX #33: back up current store before overwriting
    with storage._lock:
        current_store = storage.read_store()
        if current_store:
            storage._backup_store(current_store)

        store = storage.read_store()
        restored_keys = 0
        skipped_keys = 0
        hist = storage.read_history()
        undo_stack = storage.read_undo_stack()
        for key, value in req.store.items():
            try:
                value_bytes = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
                if value_bytes > storage.MAX_STORE_VALUE_BYTES:
                    skipped_keys += 1
                    continue
                old_val = store.get(key)
                store[key] = value
                hist, undo_stack = storage.record_change_locked(key, old_val, value, hist, undo_stack, flush=False)
                restored_keys += 1
            except Exception:
                skipped_keys += 1
        storage.write_history(hist)
        storage.write_undo_stack(undo_stack)
        storage.write_store(store)

    # FIX #33: encrypt AI settings via DPAPI before writing
    if req.ai_settings and isinstance(req.ai_settings, dict):
        try:
            from backend.cloud_ai_service import PROVIDER_CONFIGS, _encrypt_api_key, _DPAPI_PREFIX
            existing = _read_ai_settings()
            existing.update(req.ai_settings)
            for pcfg in PROVIDER_CONFIGS.values():
                k = pcfg.get("api_key_field")
                if k and isinstance(existing.get(k), str) and not existing[k].startswith(_DPAPI_PREFIX):
                    existing[k] = _encrypt_api_key(existing[k])
            _write_ai_settings(existing)
        except Exception as e:
            log_structured("WARN", "AI settings restore failed (encryption)", error=str(e))

    log_structured("INFO", "Backup restored", action="backup_restore",
                   initiator=user.get("email"), schema=req.schema_version,
                   restored=restored_keys, skipped=skipped_keys, status="success")
    return {"ok": True, "restored_keys": restored_keys, "skipped_keys": skipped_keys, "schema": req.schema_version}


# ── Folder picker (FIX: admin only) ───────────────────────────────────────
@router.get("/folder/pick")
async def folder_pick(request: Request):
    require_auth(request, required_role="admin")
    try:
        ps_script = (
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;"
            "Add-Type -AssemblyName System.Windows.Forms;"
            "$form = New-Object System.Windows.Forms.Form;"
            "$form.TopMost = $true; $form.WindowState = 'Minimized';"
            "$form.ShowInTaskbar = $false; $form.Opacity = 0; $form.Show(); $form.Hide();"
            "$fbd = New-Object System.Windows.Forms.FolderBrowserDialog;"
            "$fbd.Description = 'Select Backup Folder - Zeralda ERP';"
            "$fbd.ShowNewFolderButton = $true; $fbd.RootFolder = 'MyComputer';"
            "if ($fbd.ShowDialog($form) -eq 'OK') { [Console]::Out.Write($fbd.SelectedPath) }"
        )
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=120, encoding="utf-8",
        )
        selected = result.stdout.strip() if result.stdout else ""
        if selected and len(selected) > 1:
            return {"ok": True, "path": selected}
        return {"ok": True, "path": None, "message": "No folder selected"}
    except subprocess.TimeoutExpired:
        return {"ok": True, "path": None, "message": "Folder picker timed out"}
    except Exception as e:
        log_structured("WARN", "Folder picker error", error=str(e))
        raise HTTPException(500, detail={"ok": False, "error": str(e)})


@router.get("/folder/settings")
async def folder_settings_get(request: Request):
    user = require_auth(request)
    with storage._lock:
        store = storage.read_store()
    sys_settings = store.get("zeralda-system-settings", {})
    # إصلاح: القيمة قد تكون string (JSON) أو dict
    if isinstance(sys_settings, str):
        try:
            sys_settings = json.loads(sys_settings)
        except (json.JSONDecodeError, TypeError):
            sys_settings = {}
    if not isinstance(sys_settings, dict):
        sys_settings = {}
    cfg = sys_settings.get("backup_folder", {})
    return {"ok": True, "config": cfg}


class FolderSettingsRequest(BaseModel):
    folder_path: str = ""
    auto_backup: bool = False
    export_pdf: bool = True


@router.post("/folder/settings")
async def folder_settings_save(request: Request):
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request)
    try:
        req = FolderSettingsRequest(**{k: v for k, v in data.items() if k in FolderSettingsRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})
    with storage._lock:
        store = storage.read_store()
        sys_settings = store.get("zeralda-system-settings", {})
        # إصلاح: القيمة قد تكون string (JSON) أو dict
        if isinstance(sys_settings, str):
            try:
                sys_settings = json.loads(sys_settings)
            except (json.JSONDecodeError, TypeError):
                sys_settings = {}
        if not isinstance(sys_settings, dict):
            sys_settings = {}
        sys_settings["backup_folder"] = {"folder_path": req.folder_path,
                                         "auto_backup": req.auto_backup, "export_pdf": req.export_pdf}
        store["zeralda-system-settings"] = sys_settings
        storage.write_store(store)
    log_structured("INFO", "Backup folder settings updated", action="backup_folder_settings",
                   initiator=user.get("email"), folder=req.folder_path, status="success")
    return {"ok": True, "message": "Backup folder settings saved"}


@router.post("/folder/run")
async def folder_run(request: Request):
    user = require_auth(request, required_role="admin")
    data = await read_json_body(request) or {}
    with storage._lock:
        store = storage.read_store()
    sys_settings = store.get("zeralda-system-settings", {})
    # إصلاح: القيمة قد تكون string (JSON) أو dict
    if isinstance(sys_settings, str):
        try:
            sys_settings = json.loads(sys_settings)
        except (json.JSONDecodeError, TypeError):
            sys_settings = {}
    if not isinstance(sys_settings, dict):
        sys_settings = {}
    bk_cfg = sys_settings.get("backup_folder", {})
    folder_path = str(data.get("folder_path") or bk_cfg.get("folder_path", "")).strip()
    export_pdf = data.get("export_pdf", bk_cfg.get("export_pdf", True))
    if not folder_path:
        raise HTTPException(400, detail={"ok": False, "error": "No backup folder configured"})

    try:
        os.makedirs(folder_path, exist_ok=True)
    except OSError as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Cannot create folder: {e}"})

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_subdir = os.path.join(folder_path, f"zeralda-backup-{timestamp}")
    try:
        os.makedirs(backup_subdir, exist_ok=True)
    except OSError as e:
        raise HTTPException(500, detail={"ok": False, "error": f"Cannot create backup subfolder: {e}"})

    # Companies map
    companies_map: Dict[str, str] = {}
    if isinstance(sys_settings, dict):
        for comp in (sys_settings.get("companies") or []):
            if isinstance(comp, dict) and comp.get("id"):
                companies_map[str(comp["id"])] = comp.get("name") or comp["id"]
    client_companies = data.get("companies") or []
    if isinstance(client_companies, list):
        for comp in client_companies:
            if isinstance(comp, dict) and comp.get("id"):
                companies_map[str(comp["id"])] = comp.get("name") or comp["id"]

    # Group store keys by company
    company_data: Dict[str, Dict[str, Any]] = {}
    global_data: Dict[str, Any] = {}
    for store_key, store_val in store.items():
        if "::" in store_key:
            base_key, comp_id = store_key.split("::", 1)
        else:
            base_key, comp_id = store_key, "_global"
        matched = None
        for mod_prefix, mod_folder, mod_label, is_invoice in MODULE_DEFS:
            if base_key == mod_prefix or base_key.startswith(mod_prefix):
                matched = (mod_prefix, mod_folder, mod_label, is_invoice)
                break
        if matched:
            company_data.setdefault(comp_id, {})[matched[0]] = {
                "folder": matched[1], "label": matched[2], "is_invoice": matched[3],
                "key": store_key, "value": store_val,
            }
        else:
            global_data[store_key] = store_val

    # Full JSON backup
    ai_cfg = _read_ai_settings()
    backup_data = {"schema": "3.0", "created_at": datetime.datetime.now().isoformat(),
                   "created_by": user.get("email", "admin"), "store": store, "ai_settings": ai_cfg}
    json_path = os.path.join(backup_subdir, "full_backup.json")
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
    except OSError as e:
        raise HTTPException(500, detail={"ok": False, "error": f"Cannot write JSON backup: {e}"})

    # Global data
    if global_data:
        global_dir = os.path.join(backup_subdir, "_system")
        os.makedirs(global_dir, exist_ok=True)
        for gk, gv in global_data.items():
            safe_gk = re.sub(r'[/\\:*?"<>|]', "_", gk)
            gpath = os.path.join(global_dir, f"{safe_gk}.json")
            try:
                with open(gpath, "w", encoding="utf-8") as gf:
                    json.dump(gv, gf, ensure_ascii=False, indent=2)
            except Exception:
                pass

    # Export uploaded attachments to backup directory
    uploads_src = os.path.join(storage.DATA_DIR, "uploads")
    if os.path.isdir(uploads_src):
        attach_dst = os.path.join(backup_subdir, "_attachments")
        try:
            import shutil
            shutil.copytree(uploads_src, attach_dst, dirs_exist_ok=True)
        except Exception as e:
            log_structured("WARN", "Failed copying attachments in folder backup", error=str(e))

    exported_pdfs = 0
    pdf_errors = 0
    exported_modules = 0
    company_dirs: List[str] = []

    for comp_id, modules in company_data.items():
        comp_name = companies_map.get(comp_id, "")
        if comp_name:
            safe_comp = re.sub(r'[/\\:*?"<>|]', "_", comp_name)
            comp_dir_name = f"{safe_comp} ({comp_id[:8]})" if len(comp_id) > 8 else safe_comp
        else:
            comp_dir_name = comp_id
        comp_dir = os.path.join(backup_subdir, comp_dir_name)
        os.makedirs(comp_dir, exist_ok=True)
        company_dirs.append(comp_dir_name)

        comp_info = {"id": comp_id, "name": comp_name or comp_id}
        with open(os.path.join(comp_dir, "_company_info.json"), "w", encoding="utf-8") as cf:
            json.dump(comp_info, cf, ensure_ascii=False, indent=2)

        for mod_prefix, mod_info in modules.items():
            mod_folder = mod_info["folder"]
            is_invoice = mod_info["is_invoice"]
            mod_val = mod_info["value"]
            mod_dir = os.path.join(comp_dir, mod_folder)
            os.makedirs(mod_dir, exist_ok=True)
            json_file = os.path.join(mod_dir, f"{mod_folder}.json")
            try:
                with open(json_file, "w", encoding="utf-8") as mf:
                    json.dump(mod_val, mf, ensure_ascii=False, indent=2)
                    exported_modules += 1
            except Exception:
                pass
            if is_invoice and export_pdf and isinstance(mod_val, list):
                # Determine doc_type from the module folder (proformas vs invoices)
                doc_type = "proforma" if mod_folder == "proformas" else "invoice"
                file_prefix = "proforma_" if doc_type == "proforma" else "invoice_"
                for inv in mod_val:
                    if not isinstance(inv, dict):
                        continue
                    try:
                        pdf_bytes = generate_invoice_pdf(inv, doc_type=doc_type)
                        if pdf_bytes:
                            # Number field differs: proformas use proformaNumber
                            if doc_type == "proforma":
                                inv_num = str(inv.get("proformaNumber") or inv.get("number") or inv.get("id") or "unknown")
                            else:
                                inv_num = str(inv.get("number") or inv.get("id") or "unknown")
                            safe_num = re.sub(r'[/\\:*?"<>|]', "_", inv_num)
                            pdf_path = os.path.join(mod_dir, f"{file_prefix}{safe_num}.pdf")
                            with open(pdf_path, "wb") as pf:
                                pf.write(pdf_bytes)
                            exported_pdfs += 1
                    except Exception as e:
                        pdf_errors += 1
                        log_structured("WARN", "Document PDF export failed", action="backup_folder_pdf",
                                       doc=inv.get("number") or inv.get("proformaNumber", "?"),
                                       company=comp_id, error=str(e))

    log_structured("INFO", "Folder backup completed", action="backup_folder_run",
                   initiator=user.get("email"), folder=backup_subdir,
                   companies=len(company_data), modules=exported_modules,
                   pdfs=exported_pdfs, status="success")
    return {"ok": True, "backup_path": backup_subdir, "json_backup": json_path,
            "companies": len(company_data), "modules_exported": exported_modules,
            "pdfs_exported": exported_pdfs, "pdf_errors": pdf_errors,
            "company_folders": company_dirs,
            "message": f"Backup created: {len(company_data)} companies, {exported_modules} modules, {exported_pdfs} PDFs"}


@router.get("/folder/list")
async def folder_list(request: Request):
    user = require_auth(request)
    with storage._lock:
        store = storage.read_store()
    sys_settings = store.get("zeralda-system-settings", {})
    # إصلاح: القيمة قد تكون string (JSON) أو dict
    if isinstance(sys_settings, str):
        try:
            sys_settings = json.loads(sys_settings)
        except (json.JSONDecodeError, TypeError):
            sys_settings = {}
    if not isinstance(sys_settings, dict):
        sys_settings = {}
    bk_cfg = sys_settings.get("backup_folder", {})
    folder_path = str(bk_cfg.get("folder_path", "")).strip()
    if not folder_path or not os.path.isdir(folder_path):
        return {"ok": True, "backups": [], "folder": folder_path}
    backups = []
    try:
        for entry in sorted(os.listdir(folder_path), reverse=True):
            full = os.path.join(folder_path, entry)
            if os.path.isdir(full) and entry.startswith("zeralda-backup-"):
                stat = os.stat(full)
                json_file = os.path.join(full, "full_backup.json")
                pdf_count = 0
                company_count = 0
                for root_dir, dirs, files in os.walk(full):
                    for f in files:
                        if f.endswith(".pdf"):
                            pdf_count += 1
                    for d in dirs:
                        if os.path.isfile(os.path.join(root_dir, d, "_company_info.json")):
                            company_count += 1
                backups.append({
                    "name": entry, "path": full,
                    "date": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "has_json": os.path.isfile(json_file),
                    "pdf_count": pdf_count, "company_count": company_count,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                })
    except OSError:
        pass
    return {"ok": True, "backups": backups, "folder": folder_path}


# ── Automated Cloud Backup Endpoints ────────────────────────────────────────
@router.get("/automated/status")
async def automated_backup_status(request: Request):
    """Get status and configuration of automated backups (admin only)."""
    require_auth(request, required_role="admin")
    from app.services.cloud_backup import get_cloud_backup_config
    return {"ok": True, "config": get_cloud_backup_config()}


@router.post("/automated/run")
async def automated_backup_run(request: Request):
    """Trigger an immediate automated cloud backup snapshot (admin only)."""
    user = require_auth(request, required_role="admin")
    from app.services.cloud_backup import execute_automated_backup
    result = execute_automated_backup(triggered_by=user.get("email", "admin"))
    return JSONResponse(status_code=200 if result.get("ok") else 500, content=result)


@router.post("/automated/config")
async def automated_backup_update_config(request: Request):
    """Update automated backup interval and retention settings (admin only)."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    from app.services.cloud_backup import update_cloud_backup_config
    new_cfg = update_cloud_backup_config(data)
    return {"ok": True, "config": new_cfg}


@router.post("/automated/test-telegram")
async def test_telegram_endpoint(request: Request):
    """Test Telegram Bot notification connection (admin only)."""
    require_auth(request, required_role="admin")
    data = await read_json_body(request)
    bot_token = data.get("bot_token")
    chat_id = data.get("chat_id")
    if not bot_token or not chat_id:
        raise HTTPException(400, detail={"ok": False, "error": "Bot token and Chat ID are required."})
    from app.services.cloud_backup import test_telegram_connection
    res = test_telegram_connection(str(bot_token).strip(), str(chat_id).strip())
    return {"ok": bool(res and res.get("ok")), "result": res}


# ── Server Snapshots Management (List / Download / Direct Restore) ─────────
@router.get("/snapshots")
async def list_snapshots(request: Request):
    """List all available snapshots on the server."""
    require_auth(request, required_role="admin")
    from app.services.cloud_backup import list_all_snapshots
    return {"ok": True, "snapshots": list_all_snapshots()}


@router.get("/snapshots/{filename}")
async def download_snapshot(filename: str, request: Request):
    """Download a specific snapshot JSON file."""
    require_auth(request, required_role="admin")
    from app.services.cloud_backup import get_snapshot_path
    path = get_snapshot_path(filename)
    if not path or not os.path.isfile(path):
        raise HTTPException(404, detail={"ok": False, "error": f"Snapshot '{filename}' not found."})
    with open(path, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"}
    )


@router.post("/snapshots/restore/{filename}")
async def restore_snapshot(filename: str, request: Request):
    """Restore the store directly from a server snapshot file."""
    user = require_auth(request, required_role="admin")
    from app.services.cloud_backup import restore_from_snapshot
    res = restore_from_snapshot(filename, triggered_by=user.get("email", "admin"))
    if not res.get("ok"):
        raise HTTPException(400, detail=res)
    return res


@router.delete("/snapshots/{filename}")
async def delete_snapshot_endpoint(filename: str, request: Request):
    """Delete a specific snapshot file."""
    require_auth(request, required_role="admin")
    from app.services.cloud_backup import delete_snapshot
    ok = delete_snapshot(filename)
    if not ok:
        raise HTTPException(404, detail={"ok": False, "error": f"Could not delete '{filename}'."})
    return {"ok": True, "message": f"Snapshot '{filename}' deleted."}

