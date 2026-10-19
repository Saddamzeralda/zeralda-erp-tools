"""Dedicated File Upload, Storage, and Retrieval API for Zeralda ERP.

Solves store bloat by offloading binary attachments (PDFs, images, documents)
from the shared JSON store (5MB limit) to disk storage in data/uploads/.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from app.services import storage
from app.services.security import log_structured, read_json_body, require_auth, validate_session

router = APIRouter(prefix="/api/files", tags=["files"])

# Storage configuration
UPLOADS_DIR = storage.DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
INDEX_FILE = UPLOADS_DIR / "files_index.json"
_index_lock = threading.RLock()

MAX_FILE_BYTES = int(os.getenv("MAX_UPLOAD_FILE_BYTES", str(15 * 1024 * 1024)))  # 15 MB

ALLOWED_EXTENSIONS = {
    "pdf", "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp",
    "doc", "docx", "xls", "xlsx", "csv", "txt", "json", "xml"
}

BLOCKED_EXTENSIONS = {
    "exe", "bat", "cmd", "ps1", "sh", "py", "js", "html", "htm", "vbs", "msi", "dll", "com", "scr"
}

MIME_FALLBACKS = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".json": "application/json",
}


def _read_index() -> Dict[str, Dict[str, Any]]:
    with _index_lock:
        if not INDEX_FILE.exists():
            return {}
        try:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}


def _write_index(index: Dict[str, Dict[str, Any]]) -> None:
    with _index_lock:
        tmp = INDEX_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, INDEX_FILE)


def _sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[^\w\.\-\_]', '_', name.strip())
    return cleaned[:100] if cleaned else "attachment"


@router.post("/upload")
async def upload_file(
    request: Request,
    file: Optional[UploadFile] = File(None)
):
    """Upload a document or image file. Accepts multipart form or JSON payload with base64 data."""
    user = validate_session(request) or {"email": "anonymous"}
    file_bytes: bytes = b""
    original_name = "upload"
    mime_type = "application/octet-stream"

    content_type = (request.headers.get("content-type") or "").lower()

    if "multipart/form-data" in content_type and file is not None:
        original_name = file.filename or "upload"
        mime_type = file.content_type or "application/octet-stream"
        file_bytes = await file.read()
    else:
        # JSON body with base64 support
        body = await read_json_body(request, max_bytes=MAX_FILE_BYTES * 2) or {}
        data_b64 = body.get("data") or body.get("base64")
        original_name = str(body.get("name") or "document")
        mime_type = str(body.get("type") or "application/octet-stream")

        if not data_b64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"ok": False, "error": "No file uploaded or data provided"}
            )

        # Handle data:mime;base64, prefix if present
        if isinstance(data_b64, str) and "," in data_b64 and "data:" in data_b64:
            header, encoded = data_b64.split(",", 1)
            if ";" in header:
                detected_mime = header.split(";")[0].replace("data:", "")
                if detected_mime:
                    mime_type = detected_mime
            data_b64 = encoded

        import base64
        try:
            file_bytes = base64.b64decode(data_b64)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"ok": False, "error": f"Invalid base64 encoding: {e}"}
            )

    size_bytes = len(file_bytes)
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail={"ok": False, "error": "Empty file received"})
    if size_bytes > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={"ok": False, "error": f"File exceeds maximum allowed size of {MAX_FILE_BYTES // (1024*1024)} MB"}
        )

    # Validate extension
    ext = os.path.splitext(original_name)[1].lower()
    clean_ext = ext.lstrip(".")
    if clean_ext in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"ok": False, "error": f"File type .{clean_ext} is not allowed for security reasons"}
        )

    if not mime_type or mime_type == "application/octet-stream":
        mime_type = MIME_FALLBACKS.get(ext, "application/octet-stream")

    file_id = f"f_{uuid.uuid4().hex[:16]}"
    safe_name = _sanitize_filename(original_name)
    disk_filename = f"{file_id}_{safe_name}"
    target_path = UPLOADS_DIR / disk_filename

    # Write file to disk atomically
    tmp_path = target_path.with_suffix(f"{target_path.suffix}.tmp")
    tmp_path.write_bytes(file_bytes)
    os.replace(tmp_path, target_path)

    sha256_hash = hashlib.sha256(file_bytes).hexdigest()

    meta = {
        "id": file_id,
        "name": original_name,
        "size": size_bytes,
        "mime": mime_type,
        "filename": disk_filename,
        "sha256": sha256_hash,
        "uploaded_at": datetime.datetime.now().isoformat(),
        "uploaded_by": user.get("email", "anonymous"),
    }

    index = _read_index()
    index[file_id] = meta
    _write_index(index)

    log_structured("INFO", "File uploaded", action="file_upload",
                   file_id=file_id, name=original_name, size=size_bytes, user=user.get("email"))

    return {
        "ok": True,
        "file": {
            "id": file_id,
            "name": original_name,
            "size": size_bytes,
            "mime": mime_type,
            "url": f"/api/files/{file_id}",
            "uploaded_at": meta["uploaded_at"]
        }
    }


@router.get("/{file_id}")
async def get_file(file_id: str, download: bool = False):
    """Retrieve or download a stored file by its ID."""
    clean_id = re.sub(r'[^a-zA-Z0-9_\-]', '', file_id)
    index = _read_index()
    meta = index.get(clean_id)

    if not meta:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "File not found"})

    disk_filename = meta.get("filename")
    if not disk_filename:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "File record corrupted"})

    target_path = (UPLOADS_DIR / disk_filename).resolve()
    uploads_root = UPLOADS_DIR.resolve()

    # Strict path traversal check
    if os.path.commonpath([str(target_path), str(uploads_root)]) != str(uploads_root) or not target_path.is_file():
        raise HTTPException(status_code=404, detail={"ok": False, "error": "File missing from disk"})

    mime = meta.get("mime", "application/octet-stream")
    disp = "attachment" if download else "inline"

    return FileResponse(
        path=str(target_path),
        media_type=mime,
        filename=meta.get("name", "document"),
        headers={
            "Content-Disposition": f'{disp}; filename="{meta.get("name", "document")}"',
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "X-Content-Type-Options": "nosniff"
        }
    )


@router.get("")
async def list_files(request: Request, limit: int = 100):
    """List uploaded files metadata."""
    require_auth(request)
    index = _read_index()
    items = list(index.values())
    items.sort(key=lambda x: x.get("uploaded_at", ""), reverse=True)
    return {
        "ok": True,
        "count": len(items),
        "files": items[:limit]
    }


@router.delete("/{file_id}")
async def delete_file(file_id: str, request: Request):
    """Delete an uploaded file."""
    user = require_auth(request)
    clean_id = re.sub(r'[^a-zA-Z0-9_\-]', '', file_id)
    index = _read_index()
    meta = index.get(clean_id)

    if not meta:
        raise HTTPException(status_code=404, detail={"ok": False, "error": "File not found"})

    disk_filename = meta.get("filename")
    if disk_filename:
        target_path = (UPLOADS_DIR / disk_filename).resolve()
        uploads_root = UPLOADS_DIR.resolve()
        if os.path.commonpath([str(target_path), str(uploads_root)]) == str(uploads_root):
            try:
                if target_path.exists():
                    target_path.unlink()
            except OSError as e:
                log_structured("WARN", "Failed deleting file from disk", file_id=clean_id, error=str(e))

    del index[clean_id]
    _write_index(index)

    log_structured("INFO", "File deleted", action="file_delete",
                   file_id=clean_id, user=user.get("email"))

    return {"ok": True, "message": "File deleted"}
