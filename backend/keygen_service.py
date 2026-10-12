"""Key Generation and License Management System for Zeralda ERP"""

import json
import os
import secrets
import datetime
from pathlib import Path

# Path to keys database
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
KEYS_FILE = os.path.join(DATA_DIR, 'keys.json')

# External/installed data directories to keep synchronized
_ALT_DATA_DIRS = [
    Path(r"C:\Program Files\Zeralda ERP\data"),
    Path(r"C:\Program Files (x86)\Zeralda ERP\data"),
]

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)


def _get_sync_keys_files():
    """Return list of existing external keys.json paths to keep synchronized."""
    files = []
    primary = os.path.abspath(KEYS_FILE).lower()
    for d in _ALT_DATA_DIRS:
        try:
            if d.exists():
                candidate = d / "keys.json"
                if os.path.abspath(str(candidate)).lower() != primary:
                    files.append(candidate)
        except Exception:
            pass
    return files


def _load_keys():
    """Load keys database with bidirectional synchronization."""
    keys = {}
    if os.path.exists(KEYS_FILE):
        try:
            with open(KEYS_FILE, 'r', encoding='utf-8') as f:
                keys = json.load(f) or {}
        except Exception:
            keys = {}

    # Merge from external/installed location if available
    changed = False
    for alt_file in _get_sync_keys_files():
        if alt_file.exists():
            try:
                with open(alt_file, 'r', encoding='utf-8') as f:
                    alt_keys = json.load(f) or {}
                for k, v in alt_keys.items():
                    if k not in keys:
                        keys[k] = v
                        changed = True
                    else:
                        # If alt has newer usage or last_used, merge
                        if v.get('last_used') and (not keys[k].get('last_used') or v['last_used'] > keys[k]['last_used']):
                            keys[k]['last_used'] = v['last_used']
                            keys[k]['usage_count'] = max(keys[k].get('usage_count', 0), v.get('usage_count', 0))
                            changed = True
            except Exception:
                pass

    # Ensure all active licenses from licenses.json are also present as keys
    # so that users can log in using either their KEY-XXXX or ZERALDA-XXXX key!
    try:
        from app.services import license_service
        lic_data = license_service._load_licenses()
        for lic_key, rec in lic_data.get("licenses", {}).items():
            payload = rec.get("payload", {})
            phone = payload.get("phone") or payload.get("customer")
            if lic_key and phone and not payload.get("revoked", False):
                if lic_key not in keys:
                    keys[lic_key] = {
                        "phone": phone,
                        "email": payload.get("email"),
                        "created_at": payload.get("issuedAt") or datetime.datetime.utcnow().isoformat(),
                        "last_used": None,
                        "active": True,
                        "usage_count": 0,
                        "created_by": "license_bridge",
                        "expires_at": payload.get("expiresAt") if payload.get("expiresAt") else None,
                    }
                    changed = True
    except Exception:
        pass

    if changed:
        _save_keys(keys, sync=False)

    return keys


def _save_keys(keys_data, sync=True):
    """Save keys database (atomic write to prevent corruption) and sync to installed ERP."""
    os.makedirs(DATA_DIR, exist_ok=True)
    success = False
    try:
        import shutil
        tmp = KEYS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(keys_data, f, ensure_ascii=False, indent=2)
        shutil.move(tmp, KEYS_FILE)
        success = True
    except Exception as e:
        print(f"[ERROR] Failed to save keys: {e}")
        return False

    if sync:
        for alt_file in _get_sync_keys_files():
            try:
                alt_file.parent.mkdir(parents=True, exist_ok=True)
                tmp_alt = str(alt_file) + '.tmp'
                with open(tmp_alt, 'w', encoding='utf-8') as f:
                    json.dump(keys_data, f, ensure_ascii=False, indent=2)
                import shutil
                shutil.move(tmp_alt, alt_file)
            except Exception as e:
                print(f"[WARN] Failed to sync keys to {alt_file}: {e}")

    return success


def _validate_phone_number(phone):
    """Validate phone number format (international)"""
    phone = str(phone or '').strip()
    # Simple validation: starts with +, followed by digits
    if not phone.startswith('+'):
        return False
    digits_only = phone[1:]
    if not digits_only.isdigit() or len(digits_only) < 8 or len(digits_only) > 15:
        return False
    return True


def _normalize_phone(phone):
    """Normalize phone number — auto-convert local Algerian format to international.

    Accepts:
      +21396409083  →  +21396409083  (already international)
      0696409083    →  +213696409083 (local Algerian: drop 0, add +213)
      0696409083    →  +213696409083
      21396409083   →  +21396409083  (missing +, add it)

    Also tries flexible matching for keys stored with slightly different formats.
    """
    phone = str(phone or '').strip().replace(' ', '').replace('-', '')

    # Already international format
    if phone.startswith('+'):
        return phone

    # Local Algerian format: starts with 0 → replace 0 with +213
    if phone.startswith('0'):
        return '+213' + phone[1:]

    # Starts with country code without +
    if phone.startswith('213'):
        return '+' + phone

    # Just digits — assume Algerian
    if phone.isdigit():
        return '+213' + phone

    return phone


def _match_phone(stored_phone, input_phone):
    """Flexible phone matching — tries exact, normalized, digit-only, and suffix matching.

    Handles cases like:
      +21396409083  vs  +213696409083  (last 8 digits match: 96409083)
      +21396409083  vs  0696409083      (normalized + suffix match)
    """
    if not stored_phone or not input_phone:
        return False

    s = _normalize_phone(stored_phone)
    i = _normalize_phone(input_phone)

    # Exact match
    if s == i:
        return True

    # Digit-only match (strip all non-digits)
    s_digits = ''.join(c for c in s if c.isdigit())
    i_digits = ''.join(c for c in i if c.isdigit())
    if s_digits == i_digits:
        return True

    # One is a prefix/suffix of the other
    if s_digits.endswith(i_digits) or i_digits.endswith(s_digits):
        return True

    # Suffix match — try comparing last 7, 8, 9, 10 digits
    # This handles Algerian numbers where the mobile prefix (6/7) may or may not
    # be included in the stored format.
    for n in (8, 7, 9, 10):
        if len(s_digits) >= n and len(i_digits) >= n:
            if s_digits[-n:] == i_digits[-n:]:
                return True

    return False


def generate_key(phone_number, user_email=None, expires_at=None, force_new=False,
                 create_linked_license=True, license_expires_days=0, max_devices=1):
    """
    Generate a new activation key for a phone number

    Args:
        phone_number: International phone number (e.g., +21396409083)
        user_email: Optional email to associate with the key
        expires_at: Optional ISO datetime string for key expiry (e.g., '2026-12-31T23:59:59')
        force_new: If True, always generate a new key even if one exists for this phone
        create_linked_license: If True (default), also create an RSA-signed license
                               linked to this keygen key (unified system)
        license_expires_days: License expiry in days (0 = perpetual)
        max_devices: Max devices for the linked license (default 1)

    Returns:
        {
            'ok': bool,
            'key': 'KEY-XXXX-XXXX-XXXX',  # if ok=True
            'licenseKey': 'ZERALDA-XXXX-...',  # linked license (if created)
            'error': 'error message',      # if ok=False
            'phone': normalized_phone,
            'created_at': timestamp
        }
    """
    phone = _normalize_phone(phone_number)

    # Validate phone
    if not _validate_phone_number(phone):
        return {
            'ok': False,
            'error': f'Invalid phone number format: {phone}. Use international format like +21396409083',
            'phone': phone
        }

    keys = _load_keys()

    # Check if phone already has active keys (unless force_new)
    if not force_new:
        phone_keys = [k for k, v in keys.items() if v.get('phone') == phone and v.get('active', True)]
        if phone_keys:
            existing_key = phone_keys[0]
            result = {
                'ok': True,
                'key': existing_key,
                'phone': phone,
                'message': 'Key already exists for this phone number',
                'created_at': keys[existing_key].get('created_at')
            }
            # Include linked license info if it exists
            if create_linked_license:
                license_info = _get_linked_license_info(existing_key)
                if license_info:
                    result['licenseKey'] = license_info.get('licenseKey')
            return result

    # Generate new key format: KEY-XXXX-XXXX-XXXX
    random_bytes = secrets.token_bytes(12)
    random_hex = random_bytes.hex().upper()
    key = f"KEY-{random_hex[0:4]}-{random_hex[4:8]}-{random_hex[8:12]}"

    now = datetime.datetime.utcnow().isoformat()
    key_record = {
        'phone': phone,
        'email': user_email or None,
        'created_at': now,
        'last_used': None,
        'active': True,
        'usage_count': 0,
        'created_by': 'admin'
    }
    if expires_at:
        key_record['expires_at'] = expires_at
    keys[key] = key_record

    if not _save_keys(keys):
        return {
            'ok': False,
            'error': 'Failed to save key to database',
            'phone': phone
        }

    result = {
        'ok': True,
        'key': key,
        'phone': phone,
        'created_at': now,
        'expires_at': expires_at
    }

    # Create linked RSA-signed license (unified system)
    if create_linked_license:
        try:
            license_result = _create_linked_license(
                keygen_key=key,
                phone=phone,
                email=user_email,
                expires_days=license_expires_days,
                max_devices=max_devices,
            )
            if license_result.get('ok'):
                lic_key = license_result['licenseKey']
                result['licenseKey'] = lic_key
                result['signedPayload'] = license_result['signedPayload']
                # Also store licenseKey in keys database so entering either key in login works!
                keys[lic_key] = dict(key_record)
                _save_keys(keys)
        except Exception as e:
            # License creation failed — key is still valid, log warning
            print(f"[KEYGEN] [WARN] Failed to create linked license for {key}: {e}")

    return result


def _create_linked_license(keygen_key, phone, email=None, expires_days=0, max_devices=1):
    """Create an RSA-signed license linked to a keygen key.

    Imports license_service lazily to avoid circular dependencies.
    """
    try:
        from app.services import license_service
        return license_service.create_license_for_key(
            keygen_key=keygen_key,
            phone=phone,
            email=email,
            expires_days=expires_days,
            max_devices=max_devices,
        )
    except ImportError:
        # license_service not available (e.g., running standalone KEYGEN.py)
        return {'ok': False, 'error': 'license_service not available'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def _get_linked_license_info(keygen_key):
    """Get linked license info for a keygen key."""
    try:
        from app.services import license_service
        record = license_service.find_license_by_keygen_key(keygen_key)
        if record:
            return record.get('payload', {})
        return None
    except ImportError:
        return None
    except Exception:
        return None


def verify_key(key, phone_number=None):
    """
    Verify an activation key
    
    Args:
        key: The key to verify (e.g., KEY-XXXX-XXXX-XXXX)
        phone_number: Optional phone number to verify against
    
    Returns:
        {
            'ok': bool,
            'phone': '+21396409083',     # if ok=True
            'email': 'user@example.com', # if exists
            'active': bool,
            'usage_count': int,
            'error': 'error message'      # if ok=False
        }
    """
    key = str(key or '').strip().upper()
    if not key:
        return {'ok': False, 'error': 'Key is required'}
    
    keys = _load_keys()
    key_data = None
    actual_key = key
    linked_license_info = None

    if key in keys:
        key_data = keys[key]
        actual_key = key
    elif key.startswith("ZERALDA-"):
        # Look up license directly
        try:
            from app.services import license_service
            lic_data = license_service._load_licenses()
            rec = lic_data.get("licenses", {}).get(key)
            if rec:
                p = rec.get("payload", {})
                linked_license_info = p
                k_link = p.get("keygenKey")
                if k_link and k_link in keys:
                    actual_key = k_link
                    key_data = keys[k_link]
                else:
                    # Treat license itself as valid key record
                    actual_key = k_link or key
                    key_data = {
                        "phone": p.get("phone") or p.get("customer"),
                        "email": p.get("email"),
                        "active": not p.get("revoked", False),
                        "usage_count": len(rec.get("activations", [])),
                        "created_at": p.get("issuedAt"),
                        "expires_at": p.get("expiresAt") if p.get("expiresAt") else None,
                    }
        except Exception:
            pass
    else:
        # Check if user entered phone number
        for k, v in keys.items():
            if _match_phone(v.get("phone", ""), key):
                actual_key = k
                key_data = v
                break

    if not key_data:
        return {'ok': False, 'error': f'Invalid key or phone: {key}'}

    if not key_data.get('active', True):
        return {'ok': False, 'error': f'Key is inactive: {actual_key}'}

    # Check expiry
    expires_at = key_data.get('expires_at')
    if expires_at:
        try:
            if isinstance(expires_at, (int, float)):
                exp_dt = datetime.datetime.utcfromtimestamp(expires_at)
            else:
                exp_dt = datetime.datetime.fromisoformat(str(expires_at).replace('Z', ''))
            if datetime.datetime.utcnow() > exp_dt:
                return {'ok': False, 'error': f'Key has expired: {key} (expired at {expires_at})'}
        except Exception:
            pass  # Invalid expiry format — ignore

    # Verify phone if provided (flexible matching)
    if phone_number:
        if not _match_phone(key_data.get('phone', ''), phone_number):
            return {'ok': False, 'error': f'Key does not match phone number: {phone_number}'}
    
    res = {
        'ok': True,
        'key': actual_key,
        'phone': key_data.get('phone'),
        'email': key_data.get('email'),
        'active': key_data.get('active', True),
        'usage_count': key_data.get('usage_count', 0),
        'created_at': key_data.get('created_at'),
        'expires_at': key_data.get('expires_at'),
    }
    lic = linked_license_info or _get_linked_license_info(actual_key)
    if lic:
        res['licenseKey'] = lic.get('licenseKey')
        res['maxDevices'] = lic.get('maxDevices', 1)
        res['hwFingerprint'] = lic.get('hwFingerprint', '')
        res['hwId'] = lic.get('hwId', '')
    return res


def mark_key_used(key):
    """Mark a key as used and increment counter"""
    key = str(key or '').strip().upper()
    keys = _load_keys()
    
    target_key = key
    if target_key not in keys:
        if key.startswith("ZERALDA-"):
            try:
                from app.services import license_service
                lic = license_service.find_license_by_key(key)
                if lic and lic.get('payload', {}).get('keygenKey') in keys:
                    target_key = lic['payload']['keygenKey']
            except Exception:
                pass
    
    if target_key not in keys:
        return {'ok': False, 'error': f'Key not found: {key}'}
    
    now_iso = datetime.datetime.utcnow().isoformat()
    keys[target_key]['last_used'] = now_iso
    keys[target_key]['usage_count'] = keys[target_key].get('usage_count', 0) + 1
    
    # Also update linked key if present
    try:
        from app.services import license_service
        if target_key.startswith("KEY-"):
            lic = license_service.find_license_by_keygen_key(target_key)
            if lic:
                l_key = lic.get('payload', {}).get('licenseKey')
                if l_key and l_key in keys:
                    keys[l_key]['last_used'] = now_iso
                    keys[l_key]['usage_count'] = keys[target_key]['usage_count']
        elif target_key.startswith("ZERALDA-"):
            lic = license_service.find_license_by_key(target_key)
            if lic:
                k_key = lic.get('payload', {}).get('keygenKey')
                if k_key and k_key in keys:
                    keys[k_key]['last_used'] = now_iso
                    keys[k_key]['usage_count'] = keys[target_key]['usage_count']
    except Exception:
        pass

    if _save_keys(keys):
        return {'ok': True, 'message': 'Key usage recorded'}
    else:
        return {'ok': False, 'error': 'Failed to update key usage'}


def revoke_key(key):
    """Deactivate a key and revoke its linked license (if any).

    Unified system: revoking a keygen key also revokes the RSA-signed license
    associated with it, so the user can no longer access the application.
    """
    key = str(key or '').strip().upper()
    keys = _load_keys()

    if key not in keys:
        return {'ok': False, 'error': f'Key not found: {key}'}

    keys[key]['active'] = False

    if not _save_keys(keys):
        return {'ok': False, 'error': 'Failed to revoke key'}

    # Also revoke the linked license (unified system)
    try:
        from app.services import license_service
        lic_result = license_service.revoke_license_by_keygen_key(key)
        if lic_result.get('ok'):
            return {'ok': True, 'message': f'Key revoked: {key} (license also revoked)'}
    except ImportError:
        pass  # license_service not available
    except Exception as e:
        print(f"[KEYGEN] [WARN] Failed to revoke linked license for {key}: {e}")

    return {'ok': True, 'message': f'Key revoked: {key}'}


def delete_key(key):
    """Permanently delete an activation key and its linked license."""
    key = str(key or '').strip().upper()
    keys = _load_keys()

    # If key is found in keygen database
    if key in keys:
        del keys[key]
        _save_keys(keys)
        # Also remove linked license from licenses database
        try:
            from app.services import license_service
            lic_data = license_service._load_licenses()
            licenses = lic_data.get('licenses', {})
            to_del = [lk for lk, lv in licenses.items() if lv.get('payload', {}).get('keygenKey') == key]
            for lk in to_del:
                del licenses[lk]
            if to_del:
                license_service._save_licenses(lic_data)
        except Exception as e:
            print(f"[KEYGEN] [WARN] Failed to delete linked license for {key}: {e}")
        return {'ok': True, 'message': f'Key deleted: {key}'}

    # If key is a ZERALDA license key
    if key.startswith("ZERALDA-"):
        try:
            from app.services import license_service
            lic_data = license_service._load_licenses()
            licenses = lic_data.get('licenses', {})
            if key in licenses:
                k_link = licenses[key].get('payload', {}).get('keygenKey')
                del licenses[key]
                license_service._save_licenses(lic_data)
                if k_link and k_link in keys:
                    del keys[k_link]
                    _save_keys(keys)
                return {'ok': True, 'message': f'License deleted: {key}'}
        except Exception as e:
            return {'ok': False, 'error': str(e)}

    return {'ok': False, 'error': f'Key not found: {key}'}


def list_keys(phone_number=None, active_only=False):
    """
    List all keys, optionally filtered by phone or active status
    
    Args:
        phone_number: Optional phone number filter
        active_only: Only show active keys
    
    Returns:
        {
            'ok': bool,
            'keys': [
                {
                    'key': 'KEY-XXXX-XXXX-XXXX',
                    'phone': '+21396409083',
                    'email': 'user@example.com',
                    'created_at': '2026-03-28T...',
                    'active': true,
                    'usage_count': 5
                },
                ...
            ]
        }
    """
    keys = _load_keys()
    result = []
    
    for key, data in keys.items():
        # Apply filters
        if phone_number:
            phone = _normalize_phone(phone_number)
            if data.get('phone') != phone:
                continue
        
        if active_only and not data.get('active', True):
            continue
        
        result.append({
            'key': key,
            'phone': data.get('phone'),
            'email': data.get('email'),
            'created_at': data.get('created_at'),
            'last_used': data.get('last_used'),
            'active': data.get('active', True),
            'usage_count': data.get('usage_count', 0),
            'expires_at': data.get('expires_at')
        })
    
    return {
        'ok': True,
        'count': len(result),
        'keys': result
    }


def list_unified(phone_number=None, active_only=False):
    """List all keygen keys WITH their linked license info (unified view).

    This is the merged view that shows both the keygen key (KEY-XXXX) and
    the associated RSA-signed license (ZERALDA-XXXX) for each entry.

    Args:
        phone_number: Optional phone number filter
        active_only: Only show active keys

    Returns:
        {
            'ok': bool,
            'count': int,
            'keys': [
                {
                    'key': 'KEY-XXXX-XXXX-XXXX',
                    'phone': '+213...',
                    'email': '...',
                    'active': bool,
                    'usage_count': int,
                    'created_at': '...',
                    'expires_at': '...',
                    'license': {                    # linked license info
                        'licenseKey': 'ZERALDA-XXXX-...',
                        'type': 'standard',
                        'expiresAt': 0,
                        'revoked': False,
                        'maxDevices': 1,
                        'hwFingerprint': '...',     # bound machine (if any)
                        'activations': 0,           # active device count
                    } or None,                      # None if no linked license
                },
                ...
            ]
        }
    """
    keys = _load_keys()
    result = []

    for key, data in keys.items():
        # Apply filters
        if phone_number:
            phone = _normalize_phone(phone_number)
            if data.get('phone') != phone:
                continue

        if active_only and not data.get('active', True):
            continue

        entry = {
            'key': key,
            'phone': data.get('phone'),
            'email': data.get('email'),
            'created_at': data.get('created_at'),
            'last_used': data.get('last_used'),
            'active': data.get('active', True),
            'usage_count': data.get('usage_count', 0),
            'expires_at': data.get('expires_at'),
            'license': None,
        }

        # Fetch linked license info
        try:
            from app.services import license_service
            record = license_service.find_license_by_keygen_key(key)
            if record:
                payload = record.get('payload', {})
                activations = record.get('activations', [])
                active_count = sum(1 for a in activations if a.get('active', True))
                entry['license'] = {
                    'licenseKey': payload.get('licenseKey'),
                    'type': payload.get('type'),
                    'expiresAt': payload.get('expiresAt', 0),
                    'revoked': payload.get('revoked', False),
                    'maxDevices': payload.get('maxDevices', 1),
                    'hwFingerprint': payload.get('hwFingerprint', ''),
                    'hwId': payload.get('hwId', ''),
                    'activations': active_count,
                    'customer': payload.get('customer', ''),
                }
        except ImportError:
            pass  # license_service not available
        except Exception:
            pass

        result.append(entry)

    return {
        'ok': True,
        'count': len(result),
        'keys': result
    }


def get_license_for_key(keygen_key):
    """Get the linked license info for a keygen key.

    Returns the license payload + signedPayload, or None if no linked license.
    """
    keygen_key = str(keygen_key or '').strip().upper()
    try:
        from app.services import license_service
        record = license_service.find_license_by_keygen_key(keygen_key)
        if not record:
            return {'ok': False, 'error': 'No linked license found'}
        return {
            'ok': True,
            'licenseKey': record['payload']['licenseKey'],
            'signedPayload': record['signedPayload'],
            'payload': record['payload'],
        }
    except ImportError:
        return {'ok': False, 'error': 'license_service not available'}
    except Exception as e:
        return {'ok': False, 'error': str(e)}


def authenticate_with_key(phone_number, key):
    """
    Authenticate user with phone number and key combination
    
    Args:
        phone_number: Phone number (e.g., +21396409083)
        key: Activation key (e.g., KEY-XXXX-XXXX-XXXX)
    
    Returns:
        {
            'ok': bool,
            'email': 'user@example.com',  # if ok=True
            'error': 'error message'       # if ok=False
        }
    """
    phone = _normalize_phone(phone_number)
    key = str(key or '').strip().upper()

    # Validate phone format (after normalization, should start with +)
    if not _validate_phone_number(phone):
        return {'ok': False, 'error': f'Invalid phone number format: {phone_number}. Use format like +213XXXXXXXXX or 0XXXXXXXXX'}

    if not key:
        return {'ok': False, 'error': 'Key is required'}

    # Verify key exists and matches phone (flexible matching)
    verification = verify_key(key, phone)
    if not verification.get('ok'):
        return verification
    
    # Record usage
    mark_key_used(key)
    
    return {
        'ok': True,
        'phone': phone,
        'email': verification.get('email'),
        'key': key
    }
