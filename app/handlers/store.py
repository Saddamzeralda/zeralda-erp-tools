"""Storage endpoints — store read/write/delete, history, rollback, undo, stats, cleanup.

Fixes vs. legacy server.py:
- DELETE /api/store now supports expected_version (legacy bug #36 — delete without optimistic lock).
- /api/store/history returns paginated history (legacy bug #37 — huge responses).
- No bare `except:` (legacy bug #38).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, HTTPException, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.services import storage
from app.services.security import (
    log_structured,
    read_json_body,
    require_auth,
    require_store_permission,
    validate_session,
)

router = APIRouter(prefix="/api/store", tags=["store"])


class StoreWriteRequest(BaseModel):
    key: str
    value: Any
    expected_version: Optional[int] = None
    allow_shrink: Optional[bool] = False


class StoreBulkWriteRequest(BaseModel):
    data: Dict[str, Any]
    allow_shrink: Optional[bool] = False


def _protect_critical_collection(
    key: str,
    old_val: Any,
    new_val: Any,
    allow_shrink: bool = False,
) -> tuple[Any, bool, str]:
    """Server-side Zero-Data-Loss guard for critical ERP arrays (especially invoices-data).

    Prevents:
    1. Accidental empty-array overwrites (e.g. uninitialized tab sending '[]' when server has records).
    2. Stale-cache creates/updates (client adds a new invoice from an empty/stale local array,
       which would otherwise wipe out existing invoices on the server).
    3. Mass shrinkage (>1 record dropped in a single write without allow_shrink=True).

    Returns (protected_value, was_protected, protection_reason).
    """
    if allow_shrink or not storage.is_critical_collection_key(key):
        return new_val, False, ""

    old_list = storage._parse_list_safe(old_val)
    new_list = storage._parse_list_safe(new_val)
    if not old_list or new_list is None:
        return new_val, False, ""

    is_str = isinstance(new_val, str)

    # Case 1: Incoming array is completely empty [] while server has records
    if len(old_list) >= 1 and len(new_list) == 0:
        restored = json.dumps(old_list, ensure_ascii=False) if is_str else old_list
        return restored, True, f"blocked_empty_wipe(preserved={len(old_list)})"

    # Extract ID maps for ID-based reconciliation
    old_by_id: Dict[str, Any] = {}
    for item in old_list:
        if isinstance(item, dict) and item.get("id") is not None:
            old_by_id[str(item.get("id"))] = item

    new_by_id: Dict[str, Any] = {}
    for item in new_list:
        if isinstance(item, dict) and item.get("id") is not None:
            new_by_id[str(item.get("id"))] = item

    if not old_by_id:
        return new_val, False, ""

    added_ids = set(new_by_id.keys()) - set(old_by_id.keys())
    dropped_ids = set(old_by_id.keys()) - set(new_by_id.keys())

    # Case 2: Client added new record(s) while missing existing server record(s) (stale cache create),
    # OR client dropped > 1 existing records in a single write without allow_shrink
    if (added_ids and dropped_ids) or len(dropped_ids) > 1:
        # Merge: keep all existing items (updated with new_by_id if present) + append newly added items
        merged: List[Any] = []
        seen_ids: set[str] = set()
        for item in old_list:
            if isinstance(item, dict) and item.get("id") is not None:
                iid = str(item.get("id"))
                seen_ids.add(iid)
                merged.append(new_by_id.get(iid, item))
            else:
                merged.append(item)
        for item in new_list:
            if isinstance(item, dict) and item.get("id") is not None:
                iid = str(item.get("id"))
                if iid not in seen_ids:
                    seen_ids.add(iid)
                    merged.append(item)
            else:
                merged.append(item)
        reason = (
            f"merged_stale_write(old={len(old_list)},new={len(new_list)},merged={len(merged)})"
            if added_ids
            else f"blocked_mass_shrink(old={len(old_list)},new={len(new_list)},merged={len(merged)})"
        )
        out_val = json.dumps(merged, ensure_ascii=False) if is_str else merged
        return out_val, True, reason

    return new_val, False, ""


class StoreMgetRequest(BaseModel):
    keys: List[str]


class StoreCleanupRequest(BaseModel):
    keep_versions: Optional[int] = None
    keep_undo: Optional[int] = None


def _user_or_raise(request: Request, action: str) -> Dict[str, Any]:
    user = validate_session(request)
    if not user:
        raise HTTPException(401, detail={"ok": False, "error": "Unauthorized"})
    require_store_permission(user, action)
    return user


def _extract_active_company(request: Request, user: Dict[str, Any], store: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Determine the active company ID for data scoping."""
    # 1. Custom headers
    cid = request.headers.get("X-Company-Id") or request.headers.get("X-Active-Company")
    if cid:
        return cid.strip()
    # 2. Query parameters
    cid = request.query_params.get("companyId") or request.query_params.get("company_id")
    if cid:
        return cid.strip()
    # 3. User session record
    cid = user.get("companyId") or user.get("activeCompanyId")
    if cid:
        return str(cid).strip()
    # 4. Fallback to activeCompanyId from store settings
    if store and "zeralda-settings" in store:
        try:
            s_val = store["zeralda-settings"]
            if isinstance(s_val, str):
                s_val = json.loads(s_val)
            if isinstance(s_val, dict) and s_val.get("activeCompanyId"):
                return str(s_val["activeCompanyId"]).strip()
        except Exception:
            pass
    return None


def is_key_permitted_for_user(
    key: str,
    user: Dict[str, Any],
    action: str = "read",  # "read" or "write"
    active_company_id: Optional[str] = None,
) -> bool:
    """Evaluate whether a store key is accessible to the user on the server.
    Enforces role boundaries, multi-company scoping, and prevents cross-tenant data leaks.
    """
    if not key or not isinstance(key, str):
        return False

    role = (user or {}).get("role", "viewer")
    if role == "admin":
        return True

    clean_key = key.strip().lower()

    # 1. System internal & security keys: strictly admin only
    admin_only_prefixes = (
        "zeralda-license-",
        "zeralda-auth-token",
        "zeralda-sessions",
        "zeralda-users",
        "zeralda-audit-log",
        "zeralda-system-settings",
        "server-clone-cleanup",
    )
    for p in admin_only_prefixes:
        if clean_key.startswith(p):
            return False

    # 2. HR & Employee sensitive records: admin and manager only
    if clean_key.startswith("employees-data") or clean_key.startswith("hr-"):
        if role not in ("admin", "manager"):
            return False

    # 3. Settings write protection: only admin can modify canonical settings
    if clean_key == "zeralda-settings" and action == "write":
        if role != "admin":
            return False

    # 4. User-Private Drafts: only owner or admin can read/write
    user_email = str((user or {}).get("email", "")).lower()
    user_id = str((user or {}).get("id", "")).lower()
    if "-draft-u_" in clean_key or "::u_" in clean_key:
        owner_part = clean_key.split("-draft-u_")[-1] if "-draft-u_" in clean_key else clean_key.split("::u_")[-1]
        owner_tag = f"u_{owner_part}"
        if user_id and owner_tag != f"u_{user_id}":
            if user_email and user_email not in clean_key:
                return False

    # 5. Multi-Company Scoping
    if "::" in key:
        parts = key.split("::", 1)
        scoped_company = parts[1].strip()
        target_company = active_company_id or (user or {}).get("companyId") or (user or {}).get("activeCompanyId")
        if target_company and scoped_company != target_company:
            # Different company data: strictly forbidden
            return False

    return True


def sanitize_settings_for_user(settings_val: Any, user: Dict[str, Any]) -> Any:
    """Filter sensitive administrative settings blocks before returning to non-admin users."""
    role = (user or {}).get("role", "viewer")
    if role == "admin":
        return settings_val
    try:
        is_str = isinstance(settings_val, str)
        parsed = json.loads(settings_val) if is_str else dict(settings_val)
        if not isinstance(parsed, dict):
            return settings_val

        for sec in ("security", "secret_key", "jwt_secret", "audit", "system"):
            parsed.pop(sec, None)
        if "users" in parsed and isinstance(parsed["users"], list):
            safe_list = []
            for u in parsed["users"]:
                if isinstance(u, dict):
                    safe_list.append({k: v for k, v in u.items() if k not in ("password", "salt", "secret", "totp_secret")})
                else:
                    safe_list.append(u)
            parsed["users"] = safe_list

        return json.dumps(parsed, ensure_ascii=False) if is_str else parsed
    except Exception:
        return settings_val


@router.get("")
async def get_store(request: Request, key: Optional[str] = None):
    user = _user_or_raise(request, "read")
    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()

    active_cid = _extract_active_company(request, user, store)

    if key:
        if not is_key_permitted_for_user(key, user, action="read", active_company_id=active_cid):
            raise HTTPException(403, detail={"ok": False, "error": "Access denied to requested key", "code": "KEY_ACCESS_DENIED"})
        val = store.get(key)
        if key == "zeralda-settings":
            val = sanitize_settings_for_user(val, user)
        return {"ok": True, "value": val,
                "version": storage.current_key_version(hist, key)}

    # Scoped dump: filter keys according to user role and active company
    filtered_store = {}
    versions = {}
    is_admin = user.get("role") == "admin"
    for k, v in store.items():
        if is_admin or is_key_permitted_for_user(k, user, action="read", active_company_id=active_cid):
            if k == "zeralda-settings":
                v = sanitize_settings_for_user(v, user)
            filtered_store[k] = v
            versions[k] = storage.current_key_version(hist, k)

    log_structured("INFO", "Storage read", action="store_read",
                   user=user.get("email"), role=user.get("role"),
                   keys_returned=len(filtered_store), status="success")
    return {"ok": True, "data": filtered_store, "versions": versions}


@router.post("/mget")
async def mget_store(request: Request):
    """Fetch only requested keys from store with server-side access control."""
    user = _user_or_raise(request, "read")
    data = await read_json_body(request)
    try:
        req = StoreMgetRequest(**{k: v for k, v in data.items() if k in StoreMgetRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    if not req.keys or not isinstance(req.keys, list):
        raise HTTPException(400, detail={"ok": False, "error": "keys list required"})

    if len(req.keys) > 500:
        raise HTTPException(400, detail={"ok": False, "error": "too many keys (max 500)",
                                         "code": "TOO_MANY_KEYS"})

    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()

    active_cid = _extract_active_company(request, user, store)
    is_admin = user.get("role") == "admin"

    result: Dict[str, Any] = {}
    versions: Dict[str, int] = {}
    for k in req.keys:
        if k in store:
            if not is_admin and not is_key_permitted_for_user(k, user, action="read", active_company_id=active_cid):
                continue
            val = store[k]
            if k == "zeralda-settings":
                val = sanitize_settings_for_user(val, user)
            result[k] = val
            versions[k] = storage.current_key_version(hist, k)

    log_structured("INFO", "Storage mget", action="store_mget",
                   user=user.get("email"), requested=len(req.keys),
                   returned=len(result), status="success")
    return {"ok": True, "data": result, "versions": versions}


@router.post("")
async def write_store(request: Request):
    user = _user_or_raise(request, "write")
    data = await read_json_body(request)
    try:
        req = StoreWriteRequest(**{k: v for k, v in data.items() if k in StoreWriteRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    if not req.key:
        raise HTTPException(400, detail={"ok": False, "error": "key required"})

    active_cid = _extract_active_company(request, user)
    if not is_key_permitted_for_user(req.key, user, action="write", active_company_id=active_cid):
        log_structured("WARNING", "Storage write forbidden for user", action="store_write_blocked",
                       user=user.get("email"), role=user.get("role"), key=req.key)
        raise HTTPException(403, detail={"ok": False, "error": f"Permission denied to write key '{req.key}'",
                                         "code": "KEY_WRITE_DENIED"})

    # FIX: reject __flushing keys — they are internal client markers, not real data.
    # Allowing them pollutes the store with infinite chains like key__flushing__flushing...
    if "__flushing" in req.key:
        log_structured("WARNING", "Rejected __flushing key write",
                       action="store_write", user=user.get("email"), key=req.key,
                       status="rejected")
        return {"ok": True, "version": storage.current_key_version(storage.read_history(), req.key),
                "rejected": True, "reason": "__flushing keys are not stored"}

    import json
    try:
        value_bytes = len(json.dumps(req.value, ensure_ascii=False).encode("utf-8"))
    except Exception:
        raise HTTPException(400, detail={"ok": False, "error": "value is not JSON-serializable"})
    if value_bytes > storage.MAX_STORE_VALUE_BYTES:
        log_structured("WARNING", "Storage write rejected: value too large",
                       action="store_write", user=user.get("email"), key=req.key,
                       size_bytes=value_bytes, status="rejected")
        raise HTTPException(413, detail={"ok": False,
                       "error": f"value too large (max {storage.MAX_STORE_VALUE_BYTES} bytes)",
                       "code": "VALUE_TOO_LARGE"})

    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()
        current_version = storage.current_key_version(hist, req.key)

        # حماية جذرية من فقدان البيانات: امنع مسح قائمة الشركات في
        # zeralda-settings بقائمة فارغة (سبب متكرر لاختفاء البيانات).
        if req.key == "zeralda-settings":
            try:
                _new = req.value
                if isinstance(_new, str):
                    _new = json.loads(_new)
                _old = store.get("zeralda-settings")
                if isinstance(_old, str):
                    _old = json.loads(_old)
                _old_companies = (_old or {}).get("companies") or []
                _new_companies = (_new or {}).get("companies") or []
                if _old_companies and not _new_companies and isinstance(_new, dict):
                    _new["companies"] = _old_companies
                    if not _new.get("activeCompanyId"):
                        _new["activeCompanyId"] = (_old or {}).get("activeCompanyId")
                    req.value = json.dumps(_new, ensure_ascii=False) if isinstance(req.value, str) else _new
                    log_structured("WARNING", "Prevented companies erasure in zeralda-settings",
                                   action="store_write", user=user.get("email"),
                                   key=req.key, restored_companies=len(_old_companies),
                                   status="protected")
            except Exception:
                pass

        if req.expected_version is not None:
            try:
                expected = int(req.expected_version)
            except Exception:
                raise HTTPException(400, detail={"ok": False, "error": "expected_version must be an integer",
                                                 "code": "INVALID_EXPECTED_VERSION"})
            if expected != current_version:
                log_structured("WARNING", "Storage conflict detected", action="store_write_conflict",
                               user=user.get("email"), key=req.key,
                               expected_version=expected, current_version=current_version, status="conflict")
                # FIX P2-006: use JSONResponse so the error dict is the body
                # root (not nested under body.detail as HTTPException does).
                # FIX P1: do NOT include current_value in the response — it
                # could leak sensitive data to callers who failed the version
                # check (who may not be authorised to read the value).
                return JSONResponse(
                    status_code=409,
                    content={"ok": False, "error": "Version conflict",
                             "code": "VERSION_CONFLICT", "key": req.key,
                             "expected_version": expected,
                             "current_version": current_version},
                )

        old_value = store.get(req.key)

        # حماية جذرية للفواتير والبيانات الحرجة ضد المسح الخاطئ أو الكتابة من ذاكرة قديمة
        allow_shrink = bool(req.allow_shrink) or (
            request.headers.get("X-Allow-Shrink", "").lower() in ("true", "1", "yes")
        )
        protected_val, was_protected, protect_reason = _protect_critical_collection(
            req.key, old_value, req.value, allow_shrink=allow_shrink
        )
        if was_protected:
            req.value = protected_val
            log_structured(
                "WARNING",
                "Zero-Data-Loss guard protected critical collection write",
                action="store_write_protected",
                user=user.get("email"),
                key=req.key,
                reason=protect_reason,
                status="protected",
            )

        is_noop = storage._values_equal(old_value, req.value)
        # FIX P0-003: skip the write entirely when the value is unchanged.
        # Previously the store + backup were rewritten on every no-op call,
        # causing O(n) JSON serialisation + a backup snapshot for zero
        # benefit and racing with concurrent real writes.
        if is_noop:
            new_version = current_version
            changed = {}
        else:
            # PERF #1+#3 fix: use write_key for single-key writes instead of
            # write_store. This updates the cache in-place and does a targeted
            # single-key DB UPSERT instead of rewriting all keys.
            storage.write_key(req.key, req.value)
            storage.record_change_locked(req.key, old_value, req.value, hist=hist)
            # Radical fix: read the actual version from history after recording
            # (was manually computing current_version + 1 which could drift if
            # record_change_locked skipped the entry for excluded keys).
            new_version = storage.current_key_version(hist, req.key)
            changed = {req.key: (old_value, req.value, new_version)}

    # Publish SSE event (outside _lock to avoid holding it during pubsub)
    if changed:
        import json as _json
        sse_event: Dict[str, Any] = {
            "type": "write",
            "key": req.key,
            "version": new_version,
            "seq": storage._next_seq(),
        }
        # BUG #1 fix: include the new value in the SSE event so clients
        # update their local cache instead of deleting it (was: no value
        # → client treated undefined as delete → data loss).
        # For large values, send "write-no-value" so the client pulls the
        # specific key instead of receiving a huge SSE payload.
        try:
            val_str = _json.dumps(req.value, ensure_ascii=False)
            if len(val_str) <= 10240:
                sse_event["value"] = req.value
            else:
                sse_event["type"] = "write-no-value"
        except Exception:
            sse_event["type"] = "write-no-value"
        storage._sse_publish(sse_event)

    log_structured("INFO", "Storage write", action="store_write",
                   user=user.get("email"), role=user.get("role"), key=req.key, status="success")
    return {"ok": True, "version": new_version}


@router.post("/bulk")
async def bulk_write_store(request: Request):
    user = _user_or_raise(request, "write")
    data = await read_json_body(request)
    try:
        req = StoreBulkWriteRequest(**{k: v for k, v in data.items() if k in StoreBulkWriteRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    import json
    # FIX P1: limit the number of keys in a bulk write to prevent
    # excessive I/O and lock contention. 100 keys is generous for any
    # legitimate batch operation.
    MAX_BULK_KEYS = 100
    if len(req.data) > MAX_BULK_KEYS:
        raise HTTPException(400, detail={"ok": False,
                                         "error": f"Too many keys in bulk write (max {MAX_BULK_KEYS})",
                                         "code": "BULK_LIMIT_EXCEEDED"})
    active_cid = _extract_active_company(request, user)
    for k in req.data.keys():
        if isinstance(k, str) and not is_key_permitted_for_user(k, user, action="write", active_company_id=active_cid):
            log_structured("WARNING", "Bulk write forbidden key", action="store_bulk_write_blocked",
                           user=user.get("email"), role=user.get("role"), key=k)
            raise HTTPException(403, detail={"ok": False, "error": f"Permission denied to write key '{k}'",
                                             "code": "KEY_WRITE_DENIED"})

    written = 0
    skipped = 0
    skipped_keys: List[Dict[str, Any]] = []
    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()
        undo_stack = storage.read_undo_stack()
        for k, v in req.data.items():
            if not isinstance(k, str) or not k:
                skipped += 1
                if len(skipped_keys) < 20:
                    skipped_keys.append({"key": str(k), "reason": "invalid_key"})
                continue
            try:
                vb = len(json.dumps(v, ensure_ascii=False).encode("utf-8"))
                if vb > storage.MAX_STORE_VALUE_BYTES:
                    skipped += 1
                    if len(skipped_keys) < 20:
                        skipped_keys.append({"key": k, "reason": "value_too_large", "size_bytes": vb})
                    continue
                old_val = store.get(k)
                allow_bulk_shrink = bool(req.allow_shrink) or (
                    request.headers.get("X-Allow-Shrink", "").lower() in ("true", "1", "yes")
                )
                v, was_prot, prot_reason = _protect_critical_collection(
                    k, old_val, v, allow_shrink=allow_bulk_shrink
                )
                if was_prot:
                    log_structured(
                        "WARNING",
                        "Zero-Data-Loss guard protected bulk collection write",
                        action="store_bulk_write_protected",
                        user=user.get("email"),
                        key=k,
                        reason=prot_reason,
                        status="protected",
                    )
                if storage.is_critical_collection_key(k):
                    old_lst = storage._parse_list_safe(old_val)
                    new_lst = storage._parse_list_safe(v)
                    if old_lst and (new_lst is None or len(new_lst) < len(old_lst)):
                        storage.save_db_key_backup(k, old_val, reason="bulk-pre-shrink", force=True)
                    elif new_lst:
                        storage.save_db_key_backup(k, v, reason="bulk-write", force=False)
                store[k] = v
                hist, undo_stack = storage.record_change_locked(k, old_val, v, hist, undo_stack, flush=False)
                written += 1
            except Exception:
                skipped += 1
                if len(skipped_keys) < 20:
                    skipped_keys.append({"key": k, "reason": "serialization_or_write_error"})
        # Radical fix: write_store FIRST (authoritative, immediate), THEN history
        # and undo. Was: history → undo → store. If the process crashed after
        # history/undo but before store, history would reference values not in
        # the store (inconsistency). Now store is durable first.
        storage.write_store(store)
        storage.write_history(hist)
        storage.write_undo_stack(undo_stack)
    # Publish a 'bulk' event so clients re-sync (cheaper than N individual events)
    if written > 0:
        storage._sse_publish({"type": "bulk", "seq": storage._next_seq()})
    log_structured("INFO", "Bulk store write", action="store_bulk_write",
                   user=user.get("email"), written=written, skipped=skipped,
                   skipped_keys_sample=skipped_keys[:5])
    return {"ok": True, "written": written, "skipped": skipped, "skipped_keys": skipped_keys}


@router.delete("")
async def delete_store(request: Request, key: str = Query(...), expected_version: Optional[int] = None):
    """Delete a key. FIX #36: supports expected_version for optimistic locking."""
    user = _user_or_raise(request, "delete")
    if not key:
        raise HTTPException(400, detail={"ok": False, "error": "key required"})

    active_cid = _extract_active_company(request, user)
    if not is_key_permitted_for_user(key, user, action="write", active_company_id=active_cid):
        log_structured("WARNING", "Store delete forbidden for user", action="store_delete_blocked",
                       user=user.get("email"), role=user.get("role"), key=key)
        raise HTTPException(403, detail={"ok": False, "error": f"Permission denied to delete key '{key}'",
                                         "code": "KEY_DELETE_DENIED"})

    with storage._lock:
        store = storage.read_store()
        if key not in store:
            return {"ok": True, "deleted": False}
        hist = storage.read_history()
        current_version = storage.current_key_version(hist, key)
        # FIX P1: convert expected_version to int for consistent comparison
        # (write_store already does this, but delete was missing it).
        if expected_version is not None:
            try:
                expected = int(expected_version)
            except Exception:
                raise HTTPException(400, detail={"ok": False, "error": "expected_version must be an integer",
                                                 "code": "INVALID_EXPECTED_VERSION"})
            if expected != current_version:
                raise HTTPException(409, detail={"ok": False, "error": "Version conflict",
                                                 "code": "VERSION_CONFLICT", "key": key,
                                                 "expected_version": expected,
                                                 "current_version": current_version})
        old_value = store[key]
        if storage.is_critical_collection_key(key):
            storage.save_db_key_backup(key, old_value, reason="pre-delete", force=True)
        storage.delete_key(key)
        storage.record_change_locked(key, old_value, None)
    # Publish SSE delete event
    storage._sse_publish({
        "type": "delete",
        "key": key,
        "version": -1,
        "seq": storage._next_seq(),
    })
    log_structured("INFO", "Storage delete", action="store_delete",
                   user=user.get("email"), role=user.get("role"), key=key, status="success")
    return {"ok": True}


@router.get("/backups")
async def get_key_backups(request: Request, key: str = Query("invoices-data"), limit: int = Query(30, ge=1, le=100)):
    """List persistent PostgreSQL snapshots for a critical key (default: invoices-data)."""
    user = _user_or_raise(request, "read")
    active_cid = _extract_active_company(request, user)
    if not is_key_permitted_for_user(key, user, action="read", active_company_id=active_cid):
        raise HTTPException(403, detail={"ok": False, "error": "Access denied to requested key"})
    backups = storage.list_key_backups(key, limit=limit)
    return {"ok": True, "key": key, "backups": backups, "count": len(backups)}


@router.post("/backups/restore")
async def restore_key_backup(request: Request, backup_id: int = Query(...)):
    """Restore a critical key from a PostgreSQL kv_backups snapshot by ID (merges safely with current items)."""
    user = _user_or_raise(request, "write")
    rec = storage.get_key_backup_value(backup_id)
    if not rec:
        raise HTTPException(404, detail={"ok": False, "error": "Backup snapshot not found"})
    key, backup_val = rec
    active_cid = _extract_active_company(request, user)
    if not is_key_permitted_for_user(key, user, action="write", active_company_id=active_cid):
        raise HTTPException(403, detail={"ok": False, "error": "Permission denied to restore key"})

    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()
        old_val = store.get(key)
        # Merge backup_val with current old_val so no newer records are lost during restore
        restored_val, _, _ = _protect_critical_collection(key, backup_val, old_val or backup_val, allow_shrink=False)
        storage.write_key(key, restored_val)
        storage.record_change_locked(key, old_val, restored_val, hist=hist)
        new_version = storage.current_key_version(hist, key)

    storage._sse_publish({
        "type": "write-no-value",
        "key": key,
        "version": new_version,
        "seq": storage._next_seq(),
    })
    log_structured("WARNING", "Restored key from PostgreSQL backup", action="store_backup_restore",
                   user=user.get("email"), key=key, backup_id=backup_id, status="success")
    return {"ok": True, "key": key, "backup_id": backup_id, "version": new_version}


@router.get("/history")
async def get_history(request: Request, key: str = Query(...), version: Optional[int] = None,
                      limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    """FIX #37: paginated history (was returning entire history)."""
    user = _user_or_raise(request, "history")
    with storage._lock:
        hist = storage.read_history()
    if not key:
        raise HTTPException(400, detail={"ok": False, "error": "key required"})
    if key not in hist:
        return {"ok": True, "history": [], "total": 0}
    entries = hist[key]
    total = len(entries)
    if version is not None:
        try:
            v = int(version)
            if 0 <= v < total:
                return {"ok": True, "value": entries[v]["value"]}
        except Exception:
            pass
        return {"ok": True, "value": None}
    # Paginated slice
    page = entries[offset: offset + limit]
    log_structured("INFO", "Storage history read", action="store_history",
                   user=user.get("email"), key=key, offset=offset, limit=limit, total=total, status="success")
    return {"ok": True, "history": page, "total": total, "offset": offset, "limit": limit}


@router.post("/rollback")
async def rollback(request: Request, key: str = Query(...), version: int = Query(...),
                   expected_version: Optional[int] = None):
    """Roll back a key to a previous history version.

    Radical fix: supports ``expected_version`` for optimistic locking so a
    rollback can't silently clobber a concurrent write. Also skips the write
    when the rollback target equals the current value (no-op).
    """
    user = _user_or_raise(request, "rollback")
    with storage._lock:
        hist = storage.read_history()
        if key not in hist or not (0 <= version < len(hist[key])):
            raise HTTPException(404, detail={"ok": False, "error": "Version not found"})
        rollback_val = hist[key][version]["value"]
        store = storage.read_store()
        old_val = store.get(key)
        current_version = storage.current_key_version(hist, key)
        # Optimistic locking: reject if the store has moved on since the client
        # last saw it.
        if expected_version is not None and expected_version != current_version:
            raise HTTPException(409, detail={"ok": False, "error": "Version conflict",
                                             "code": "VERSION_CONFLICT", "key": key,
                                             "expected_version": expected_version,
                                             "current_version": current_version})
        # Skip no-op rollback (target == current value)
        if storage._values_equal(old_val, rollback_val):
            log_structured("INFO", "Storage rollback no-op", action="store_rollback",
                           user=user.get("email"), key=key, version=version, status="noop")
            return {"ok": True, "noop": True}
        store[key] = rollback_val
        storage.write_key(key, rollback_val)
        storage.record_change_locked(key, old_val, rollback_val)
        log_structured("WARNING", "Storage rollback", action="store_rollback",
                       user=user.get("email"), key=key, version=version, status="success")
        # FIX P1: re-read history after record_change_locked so the SSE
        # event carries the correct version (record_change_locked may
        # prune/append versions, making the pre-call hist stale).
        hist = storage.read_history()
        new_version = storage.current_key_version(hist, key)
    storage._sse_publish({
        "type": "write", "key": key, "version": new_version,
        "seq": storage._next_seq(),
    })
    return {"ok": True}


@router.post("/undo")
async def undo(request: Request):
    user = _user_or_raise(request, "undo")
    with storage._lock:
        stack = storage.read_undo_stack()
        if not stack:
            raise HTTPException(400, detail={"ok": False, "error": "nothing to undo"})
        last_op = stack.pop()
        key = last_op["key"]
        old_val = last_op["old_value"]
        store = storage.read_store()
        current_val = store.get(key)
        # Radical fix: skip no-op undo (current value already equals the undo
        # target). Was always writing the store + backup + history even when
        # nothing changed.
        is_noop = storage._values_equal(current_val, old_val)
        if not is_noop:
            store[key] = old_val
            storage.write_key(key, old_val)
        storage.write_undo_stack(stack)
        # Radical fix: use record_change_locked instead of manually appending to
        # history. This respects HISTORY_EXCLUDE_KEYS, no-op detection, and
        # pruning (was bypassing all three).
        hist = storage.read_history()
        if not is_noop:
            storage.record_change_locked(key, current_val, old_val, hist=hist, stack=stack, flush=False)
            # record_change_locked already appended to history with action="set";
            # relabel the last entry as "undo" for audit clarity.
            if key in hist and hist[key]:
                hist[key][-1]["action"] = "undo"
            storage.write_history(hist)
    if not is_noop:
        storage._sse_publish({
            "type": "write", "key": key,
            "version": storage.current_key_version(storage.read_history(), key),
            "seq": storage._next_seq(),
        })
    log_structured("WARNING", "Storage undo", action="store_undo",
                   user=user.get("email"), key=key, status="success" if not is_noop else "noop")
    return {"ok": True, "key": key, "noop": is_noop}


@router.get("/stats")
async def stats(request: Request):
    user = _user_or_raise(request, "stats")
    with storage._lock:
        store = storage.read_store()
        hist = storage.read_history()
        undo_stack = storage.read_undo_stack()
    total_versions = sum(len(v) for v in hist.values())
    import os
    store_bytes = 0
    try:
        store_bytes = os.path.getsize(storage.DATA_FILE) if storage.DATA_FILE.exists() else 0
    except OSError:
        pass
    return {"ok": True, "keys": len(store), "versions": total_versions,
            "undo_stack_size": len(undo_stack), "store_size_bytes": store_bytes}


@router.post("/cleanup")
async def cleanup(request: Request):
    user = _user_or_raise(request, "rollback")
    data = await read_json_body(request)
    try:
        req = StoreCleanupRequest(**{k: v for k, v in data.items() if k in StoreCleanupRequest.model_fields})
    except Exception as e:
        raise HTTPException(400, detail={"ok": False, "error": f"Invalid request: {e}"})

    keep_versions = storage.MAX_HISTORY_VERSIONS_PER_KEY
    if req.keep_versions is not None:
        keep_versions = max(1, min(int(req.keep_versions), storage.MAX_HISTORY_VERSIONS_PER_KEY))
    keep_undo = storage.MAX_UNDO_STACK
    if req.keep_undo is not None:
        keep_undo = max(0, min(int(req.keep_undo), storage.MAX_UNDO_STACK))

    with storage._lock:
        hist = storage.read_history()
        pruned_keys = 0
        pruned_versions = 0
        for key in list(hist.keys()):
            # Radical fix: also drop history for excluded keys during cleanup
            if storage._is_history_excluded(key):
                pruned_versions += len(hist[key])
                del hist[key]
                pruned_keys += 1
                continue
            entries = hist.get(key, [])
            if isinstance(entries, list) and len(entries) > keep_versions:
                removed = len(entries) - keep_versions
                hist[key] = entries[-keep_versions:]
                for idx, item in enumerate(hist[key]):
                    if isinstance(item, dict):
                        item["version"] = idx
                pruned_versions += removed
                pruned_keys += 1
        storage.write_history(hist)
        stack = storage.read_undo_stack()
        old_stack_len = len(stack)
        if len(stack) > keep_undo:
            stack = stack[-keep_undo:]
            storage.write_undo_stack(stack)
    log_structured("INFO", "Store cleanup", action="store_cleanup", user=user.get("email"),
                   pruned_keys=pruned_keys, pruned_versions=pruned_versions,
                   undo_trimmed=old_stack_len - len(stack), status="success")
    return {"ok": True, "pruned_keys": pruned_keys, "pruned_versions": pruned_versions,
            "undo_trimmed": old_stack_len - len(stack)}


@router.post("/compact")
async def compact(request: Request):
    """Compact history: remove no-op entries and excluded keys.

    Radical fix for the 49.7% polluted history file. Returns stats about what
    was removed. Safe to run anytime — only touches history, not the store.
    """
    user = _user_or_raise(request, "rollback")
    with storage._lock:
        stats = storage.compact_history()
    log_structured("INFO", "History compact", action="store_compact",
                   user=user.get("email"), **stats, status="success")
    return {"ok": True, **stats}


# ── SSE: Server-Sent Events for real-time store change notifications ─────────
# EventSource (browser API) cannot set custom headers, so the token is passed
# via ?token= query parameter. This is the ONLY endpoint that reads the token
# from the query string — it's acceptable here because:
#   1. SSE is a long-lived read-only connection (no mutation side-effects)
#   2. EventSource provides no other way to authenticate
#   3. The token is in the URL but SSE connections aren't logged in browser
#      history and don't send Referer headers for EventSource requests.
@router.get("/events")
async def store_events(request: Request):
    """SSE stream of store change events.

    Event format (JSON in ``data:`` field):
        {"type": "write|delete|bulk|drop-notice|hello", "key": "...", "version": N, "seq": N}

    The client uses ``seq`` for gap detection: if it receives seq=N+2 after
    seq=N, it knows seq=N+1 was dropped and triggers a full re-sync.
    """
    # Auth: validate session. EventSource can't send headers, so accept ?token=
    # as a fallback (this is the documented exception to FIX #17).
    # In dev mode (REQUIRE_AUTH=False), validate_session returns a synthetic
    # admin user without checking the token, so we just call it directly.
    from app.services.security import get_session_token, validate_session, REQUIRE_AUTH
    token = get_session_token(request)
    if not token:
        token = request.query_params.get("token", "")

    if REQUIRE_AUTH and not token:
        raise HTTPException(401, detail={"ok": False, "error": "Unauthorized", "code": "UNAUTHORIZED"})

    # إصلاح: في dev mode (REQUIRE_AUTH=False)، تجاوز التحقق من token تماماً
    # وأرجع synthetic admin user. السابق كان يحاول التحقق من token عبر
    # _auth.validate_session حتى في dev mode، مما يسبب 401 إذا كان token قديماً.
    if not REQUIRE_AUTH:
        user = {"role": "admin", "email": "admin@local"}
    else:
        # production (validates the token via backend.auth). For SSE, we need to
        # inject the query-string token into the request headers so that
        # get_session_token inside validate_session can find it.
        if token and not get_session_token(request):
            try:
                from app.services import auth as _auth
                ip = request.client.host if request.client else ""
                ua = request.headers.get("User-Agent", "")
                user = _auth.validate_session(token, ip, ua)
            except ImportError:
                user = None
            except Exception:
                user = None
        else:
            user = validate_session(request)

        if not user:
            raise HTTPException(401, detail={"ok": False, "error": "Unauthorized", "code": "UNAUTHORIZED"})

    require_store_permission(user, "read")

    # Subscribe to the broadcast bus
    q = storage.sse_subscribe()

    async def event_stream():
        import queue as _queue
        try:
            # Send hello event so the client knows the connection is live
            hello = {"type": "hello", "seq": storage._next_seq(),
                     "message": "SSE connected"}
            yield f"event: store-change\ndata: {json.dumps(hello)}\n\n"
            loop = asyncio.get_event_loop()
            while True:
                # FIX P1-005: drain any pending events non-blocking first
                # (instant delivery when events are queued), then do a single
                # blocking ``q.get(timeout=…)`` via ``run_in_executor`` to wait
                # for the next event without busy-polling. This borrows a worker
                # thread only for the wait duration (≤ 5s) and releases it back
                # immediately when an event arrives or the timeout fires.
                drained = False
                while True:
                    try:
                        event = q.get_nowait()
                    except Exception:
                        break
                    yield f"event: store-change\ndata: {json.dumps(event)}\n\n"
                    drained = True
                if not drained:
                    # No events queued — block up to 5s for the next one.
                    # This avoids the 200ms busy-poll while keeping the
                    # connection alive with periodic heartbeats.
                    try:
                        event = await loop.run_in_executor(
                            None, q.get, True, 5.0)  # block, timeout=5s
                        yield f"event: store-change\ndata: {json.dumps(event)}\n\n"
                    except _queue.Empty:
                        # Timeout — send heartbeat to keep connection alive
                        yield ": heartbeat\n\n"
                    except Exception:
                        # Executor/thread issues (e.g. TestClient sync mode) —
                        # fall back to a brief sleep + heartbeat to avoid
                        # spinning. This path is only hit in test harnesses.
                        yield ": heartbeat\n\n"
                        await asyncio.sleep(0.2)
        finally:
            storage.sse_unsubscribe(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


def _queue_get_timeout(q, timeout):
    """Blocking get with timeout (runs in executor thread)."""
    import queue as _queue
    try:
        return q.get(timeout=timeout)
    except _queue.Empty:
        return None
