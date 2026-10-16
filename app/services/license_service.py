"""License service — RSA-PSS key management, license signing, and validation.

Generates and manages the RSA key pair used to sign licenses.
The private key is stored in data/license_private_key.pem (NEVER exposed to clients).
The public key is served at /api/license/public-key for client-side verification.

License payload format (JSON, signed with RSA-PSS + SHA-256):
{
  "licenseKey": "ZERALDA-XXXX-XXXX-XXXX-XXXX",
  "type": "standard" | "trial" | "enterprise" | "subscription",
  "product": "zeralda-erp",
  "issuedAt": 1234567890,        # unix timestamp
  "expiresAt": 0 | 1234567890,   # 0 = perpetual
  "customer": "Company Name",
  "email": "customer@example.com",
  "hwFingerprint": "abc123...",  # optional: bound to specific machine
  "hwId": "HW-XXXX-XXXX-XXXX-XXXX",
  "maxDevices": 1,               # for enterprise licenses
  "features": ["ai", "ocr"],     # feature flags
  "revoked": false,
  "issuer": "Zeralda ERP",
  "version": 1
}
"""
from __future__ import annotations

import os
import json
import time
import secrets
import threading
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# ── Constants ──────────────────────────────────────────────────────────────
# Use absolute paths relative to the project root (parent of app/) so the
# key files are found regardless of the current working directory.
_BASE_DIR = Path(__file__).resolve().parent.parent.parent
LICENSE_FILE = str(_BASE_DIR / "data" / "licenses.json")
PRIVATE_KEY_FILE = str(_BASE_DIR / "data" / "license_private_key.pem")
PUBLIC_KEY_FILE = str(_BASE_DIR / "data" / "license_public_key.pem")
SERVER_STATE_FILE = str(_BASE_DIR / "data" / "license_server_state.json")
INTEGRITY_FILE = str(_BASE_DIR / "data" / "license_integrity.json")
KEY_BITS = 2048
LICENSE_VERSION = 1

# External/installed data directories to keep synchronized
_ALT_DATA_DIRS = [
    Path(r"C:\Program Files\Zeralda ERP\data"),
    Path(r"C:\Program Files (x86)\Zeralda ERP\data"),
]


def _get_sync_paths(filename: str):
    """Return existing paths in installed locations for file replication."""
    primary = os.path.abspath(str(_BASE_DIR / "data" / filename)).lower()
    paths = []
    for d in _ALT_DATA_DIRS:
        try:
            if d.exists():
                candidate = d / filename
                if os.path.abspath(str(candidate)).lower() != primary:
                    paths.append(candidate)
        except Exception:
            pass
    return paths

_lock = threading.RLock()  # re-entrant lock (revoke_license_by_keygen_key calls other locked functions)
_rsa_private = None  # cryptography RSA private key object
_rsa_public = None   # cryptography RSA public key object
_public_key_spki_b64 = None  # cached base64 SPKI for serving to clients


# ── Key management ─────────────────────────────────────────────────────────
def _ensure_keys():
    """Generate or load the RSA key pair. Called once on startup."""
    global _rsa_private, _rsa_public, _public_key_spki_b64

    if _rsa_private is not None:
        return

    priv_path = Path(PRIVATE_KEY_FILE)
    pub_path = Path(PUBLIC_KEY_FILE)

    # Ensure data/ directory exists
    priv_path.parent.mkdir(parents=True, exist_ok=True)

    # Check if installed directory has keys and sync if missing locally
    for alt_priv in _get_sync_paths("license_private_key.pem"):
        if alt_priv.exists() and not priv_path.exists():
            try:
                import shutil
                shutil.copy2(alt_priv, priv_path)
                alt_pub = alt_priv.parent / "license_public_key.pem"
                if alt_pub.exists() and not pub_path.exists():
                    shutil.copy2(alt_pub, pub_path)
            except Exception:
                pass

    from cryptography.hazmat.primitives import serialization

    # Case 1: Private key exists (Developer / Keygen Workstation)
    if priv_path.exists():
        priv_pem = priv_path.read_bytes()
        _rsa_private = serialization.load_pem_private_key(priv_pem, password=None)
        _rsa_public = _rsa_private.public_key()
        if not pub_path.exists():
            pub_pem = _rsa_public.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            pub_path.write_bytes(pub_pem)
        print(f"[LicenseService] RSA key pair ready ({KEY_BITS} bits - Developer Signing Mode)")
    # Case 2: Only Public key exists (Client Installation - Verification Mode)
    elif pub_path.exists():
        pub_pem = pub_path.read_bytes()
        _rsa_public = serialization.load_pem_public_key(pub_pem)
        _rsa_private = None
        print(f"[LicenseService] RSA Public Key ready ({KEY_BITS} bits - Client Verification Only)")
    # Case 3: Neither exists
    else:
        from app.services.security import ENVIRONMENT
        if ENVIRONMENT == "development" or os.getenv("ALLOW_KEY_GENERATION", "false").lower() == "true":
            from cryptography.hazmat.primitives.asymmetric import rsa

            _rsa_private = rsa.generate_private_key(
                public_exponent=65537,
                key_size=KEY_BITS,
            )
            _rsa_public = _rsa_private.public_key()

            priv_pem = _rsa_private.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
            priv_path.write_bytes(priv_pem)
            try:
                priv_path.chmod(0o600)
            except (OSError, PermissionError):
                pass

            pub_pem = _rsa_public.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            pub_path.write_bytes(pub_pem)
            print(f"[LicenseService] Generated new development RSA keypair ({KEY_BITS} bits)")
        else:
            raise FileNotFoundError(
                "Missing license_public_key.pem. Client installations require the vendor public key to verify licenses."
            )

    # Cache the SPKI in base64 for serving to clients
    import base64
    spki_der = _rsa_public.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    _public_key_spki_b64 = base64.b64encode(spki_der).decode("ascii")


def get_public_key_spki_b64() -> str:
    """Return the public key as base64-encoded SPKI DER."""
    _ensure_keys()
    return _public_key_spki_b64


def _sign_payload(payload: Dict[str, Any]) -> str:
    """Sign a payload with RSA-PSS + SHA-256. Returns 'base64url(payload).base64url(signature)'."""
    _ensure_keys()
    if _rsa_private is None:
        raise RuntimeError(
            "License signing requires the developer RSA private key (license_private_key.pem), "
            "which is kept exclusively by the software vendor and is not distributed to client installations."
        )
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    import base64

    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = _rsa_private.sign(
        payload_json,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=hashes.SHA256().digest_size,
        ),
        hashes.SHA256(),
    )

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")

    return f"{_b64url(payload_json)}.{_b64url(signature)}"


def _generate_license_key() -> str:
    """Generate a human-readable license key: ZERALDA-XXXX-XXXX-XXXX-XXXX"""
    parts = []
    for _ in range(4):
        chunk = secrets.token_hex(2).upper()  # 4 hex chars
        parts.append(chunk)
    return "ZERALDA-" + "-".join(parts)


# ── License storage ────────────────────────────────────────────────────────
def _load_licenses() -> Dict[str, Any]:
    """Load the license database with bidirectional synchronization."""
    primary_data = {"licenses": {}, "activations": {}}
    try:
        with open(LICENSE_FILE, "r", encoding="utf-8") as f:
            primary_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        primary_data = {"licenses": {}, "activations": {}}

    changed = False
    for alt_file in _get_sync_paths("licenses.json"):
        if alt_file.exists():
            try:
                with open(alt_file, "r", encoding="utf-8") as f:
                    alt_data = json.load(f)
                for k, v in alt_data.get("licenses", {}).items():
                    if k not in primary_data.get("licenses", {}):
                        primary_data.setdefault("licenses", {})[k] = v
                        changed = True
                    else:
                        cur_acts = primary_data["licenses"][k].setdefault("activations", [])
                        alt_acts = v.get("activations", [])
                        cur_fps = {a.get("hwFingerprint") for a in cur_acts if a.get("hwFingerprint")}
                        for a in alt_acts:
                            if a.get("hwFingerprint") and a["hwFingerprint"] not in cur_fps:
                                cur_acts.append(a)
                                changed = True
            except Exception:
                pass

    if changed:
        _save_licenses(primary_data, sync=False)

    return primary_data


def _save_licenses(data: Dict[str, Any], sync: bool = True):
    """Save the license database and replicate to installed ERP."""
    Path(LICENSE_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(LICENSE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    if sync:
        for alt_file in _get_sync_paths("licenses.json"):
            try:
                alt_file.parent.mkdir(parents=True, exist_ok=True)
                tmp_alt = str(alt_file) + ".tmp"
                with open(tmp_alt, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                import shutil
                shutil.move(tmp_alt, alt_file)
            except Exception as e:
                print(f"[WARN] Failed to sync licenses to {alt_file}: {e}")


# ── License operations ─────────────────────────────────────────────────────
def create_license(
    license_type: str = "standard",
    customer: str = "",
    email: str = "",
    expires_days: int = 0,  # 0 = perpetual
    max_devices: int = 1,
    features: list = None,
    hw_fingerprint: str = None,
    hw_id: str = None,
) -> Dict[str, Any]:
    """Create a new license and return the signed payload + key."""
    with _lock:
        _ensure_keys()

        license_key = _generate_license_key()
        now = int(time.time())
        expires_at = 0 if expires_days == 0 else now + (expires_days * 24 * 60 * 60)

        payload = {
            "licenseKey": license_key,
            "type": license_type,
            "product": "zeralda-erp",
            "issuedAt": now,
            "expiresAt": expires_at,
            "customer": customer,
            "email": email,
            "hwFingerprint": hw_fingerprint or "",
            "hwId": hw_id or "",
            "maxDevices": max_devices,
            "features": features or ["*"],
            "revoked": False,
            "issuer": "Zeralda ERP",
            "version": LICENSE_VERSION,
        }

        signed_payload = _sign_payload(payload)

        # Store in database
        data = _load_licenses()
        data["licenses"][license_key] = {
            "payload": payload,
            "signedPayload": signed_payload,
            "activations": [],
            "createdAt": now,
            "createdBy": "admin",
        }
        _save_licenses(data)

        return {
            "ok": True,
            "licenseKey": license_key,
            "signedPayload": signed_payload,
            "payload": payload,
        }


def create_license_for_key(
    keygen_key: str,
    phone: str,
    email: str = None,
    customer: str = "",
    expires_days: int = 0,
    max_devices: int = 1,
    features: list = None,
) -> Dict[str, Any]:
    """Create a license bound to a keygen activation key.

    This is the bridge between the keygen system (phone-based KEY-XXXX keys)
    and the license system (RSA-signed ZERALDA-XXXX keys). When a keygen key
    is generated, this function creates a corresponding RSA-signed license
    that is linked via the `keygenKey` field in the payload.

    The license is NOT hardware-bound at creation time — binding happens
    on first activation (when the user logs in with their keygen key on
    a specific machine).

    Args:
        keygen_key: The KEY-XXXX-XXXX-XXXX key from keygen_service
        phone: Phone number (stored as customer identifier)
        email: Optional email
        customer: Customer/company name
        expires_days: 0 = perpetual, >0 = N days from now
        max_devices: Max devices for this license (default 1)
        features: Feature flags (default ["*"] = all)

    Returns:
        {
            "ok": bool,
            "licenseKey": str,       # ZERALDA-XXXX-XXXX-XXXX-XXXX
            "keygenKey": str,        # KEY-XXXX-XXXX-XXXX
            "signedPayload": str,    # RSA-signed payload for client verification
            "payload": dict,         # the license payload
        }
    """
    with _lock:
        _ensure_keys()

        license_key = _generate_license_key()
        now = int(time.time())
        expires_at = 0 if expires_days == 0 else now + (expires_days * 24 * 60 * 60)

        payload = {
            "licenseKey": license_key,
            "keygenKey": keygen_key,  # ← link to keygen system
            "type": "standard",
            "product": "zeralda-erp",
            "issuedAt": now,
            "expiresAt": expires_at,
            "customer": customer or phone,
            "phone": phone,           # ← phone from keygen
            "email": email or "",
            "hwFingerprint": "",      # bound on first activation
            "hwId": "",
            "maxDevices": max_devices,
            "features": features or ["*"],
            "revoked": False,
            "issuer": "Zeralda ERP",
            "version": LICENSE_VERSION,
        }

        signed_payload = _sign_payload(payload)

        data = _load_licenses()
        data["licenses"][license_key] = {
            "payload": payload,
            "signedPayload": signed_payload,
            "activations": [],
            "createdAt": now,
            "createdBy": "keygen:" + keygen_key,
        }
        _save_licenses(data)

        return {
            "ok": True,
            "licenseKey": license_key,
            "keygenKey": keygen_key,
            "signedPayload": signed_payload,
            "payload": payload,
        }


def find_license_by_keygen_key(keygen_key: str) -> Optional[Dict[str, Any]]:
    """Find a license record by its associated keygen key.

    Returns the license record dict (with payload, signedPayload, activations)
    or None if not found.
    """
    with _lock:
        data = _load_licenses()
        for license_key, record in data.get("licenses", {}).items():
            if record.get("payload", {}).get("keygenKey") == keygen_key:
                return record
        return None


def find_license_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    """Find a license record by the associated phone number.

    Returns the license record dict or None if not found.
    """
    with _lock:
        data = _load_licenses()
        for license_key, record in data.get("licenses", {}).items():
            payload = record.get("payload", {})
            if payload.get("phone") == phone or payload.get("customer") == phone:
                return record
        return None


def activate_license_for_hw(
    license_key: str,
    hw_fingerprint: str,
    hw_id: str,
) -> Dict[str, Any]:
    """Bind a license to hardware (first activation) and return signed payload.

    This is called when a user logs in with their keygen key on a specific
    machine. If the license has no hwFingerprint, it gets bound to this machine.
    If it's already bound, it verifies the match.

    Args:
        license_key: The ZERALDA-XXXX license key
        hw_fingerprint: Hardware fingerprint from the client
        hw_id: Hardware ID (human-readable)

    Returns:
        {
            "ok": bool,
            "signedPayload": str,  # updated signed payload
            "payload": dict,
            "error": str,          # if ok=False
            "code": str,           # error code
        }
    """
    with _lock:
        _ensure_keys()
        data = _load_licenses()
        record = data["licenses"].get(license_key)
        if not record:
            return {"ok": False, "error": "License not found", "code": "NOT_FOUND"}

        payload = record["payload"]
        now = int(time.time())

        # Check revoked
        if payload.get("revoked", False):
            return {"ok": False, "error": "License revoked", "code": "REVOKED"}

        # Check expiry
        expires_at = payload.get("expiresAt", 0)
        if expires_at and expires_at > 0 and now > expires_at:
            return {"ok": False, "error": "License expired", "code": "EXPIRED"}

        bound_hw = payload.get("hwFingerprint", "")
        if not bound_hw:
            # First activation — bind to this hardware
            payload["hwFingerprint"] = hw_fingerprint
            payload["hwId"] = hw_id
            record["payload"] = payload
            if _rsa_private is not None:
                record["signedPayload"] = _sign_payload(payload)
        elif bound_hw != hw_fingerprint:
            return {
                "ok": False,
                "error": "License bound to a different machine",
                "code": "HW_MISMATCH",
            }

        # Record activation
        activations = record.get("activations", [])
        existing = [a for a in activations if a.get("hwFingerprint") == hw_fingerprint]
        if not existing:
            max_devices = payload.get("maxDevices", 1)
            active_count = sum(1 for a in activations if a.get("active", True))
            if active_count >= max_devices:
                return {
                    "ok": False,
                    "error": f"Max devices ({max_devices}) reached",
                    "code": "MAX_DEVICES",
                }
            activations.append({
                "hwFingerprint": hw_fingerprint,
                "hwId": hw_id,
                "activatedAt": now,
                "active": True,
                "lastSeen": now,
            })
            record["activations"] = activations
        else:
            for a in activations:
                if a.get("hwFingerprint") == hw_fingerprint:
                    a["lastSeen"] = now

        _save_licenses(data)

        # Log analytics event
        try:
            log_usage_event(
                event_type="activation",
                license_key=license_key,
                keygen_key=payload.get("keygenKey", ""),
                hw_fingerprint=hw_fingerprint,
                hw_id=hw_id,
                phone=payload.get("phone", ""),
            )
        except Exception:
            pass

        return {
            "ok": True,
            "signedPayload": record["signedPayload"],
            "payload": payload,
        }


def revoke_license_by_keygen_key(keygen_key: str) -> Dict[str, Any]:
    """Revoke the license associated with a keygen key.

    Called when a keygen key is revoked, to also revoke the linked license.
    """
    with _lock:
        record = find_license_by_keygen_key(keygen_key)
        if not record:
            return {"ok": False, "error": "No license found for keygen key"}

        license_key = record["payload"]["licenseKey"]
        return revoke_license(license_key)


def validate_license(
    license_key: str,
    hw_fingerprint: str = None,
    hw_id: str = None,
) -> Dict[str, Any]:
    """Validate a license key and optionally bind it to hardware."""
    with _lock:
        _ensure_keys()
        data = _load_licenses()
        cleaned_key = (license_key or "").strip().upper()

        record = data["licenses"].get(cleaned_key)
        # If not found directly, check if input is a linked keygen key (e.g. KEY-XXXX-XXXX-XXXX)
        if not record:
            record = find_license_by_keygen_key(cleaned_key)
            if record:
                cleaned_key = record.get("payload", {}).get("licenseKey", cleaned_key)

        # If still not found, check if input is a phone number
        if not record:
            phone_rec = find_license_by_phone(license_key.strip())
            if phone_rec:
                record = phone_rec
                cleaned_key = record.get("payload", {}).get("licenseKey", cleaned_key)

        if not record:
            return {"ok": False, "error": "License key not found", "code": "NOT_FOUND"}
        license_key = cleaned_key

        # Auto-detect server HW ID if missing from request
        if not hw_id:
            try:
                srv_hw = get_server_hw_info()
                hw_id = srv_hw.get("hwId")
                if not hw_fingerprint:
                    hw_fingerprint = srv_hw.get("hwFingerprint")
            except Exception:
                pass

        payload = record["payload"]
        now = int(time.time())

        # Check revoked
        if payload.get("revoked", False):
            return {"ok": False, "error": "License has been revoked", "code": "REVOKED"}

        # Check expiry
        expires_at = payload.get("expiresAt", 0)
        if expires_at and expires_at > 0 and now > expires_at:
            return {"ok": False, "error": "License has expired", "code": "EXPIRED"}

        # Skip hwFingerprint check (it's unstable — use hwId only)
        # bound_hw = payload.get("hwFingerprint", "")
        # if bound_hw and hw_fingerprint and bound_hw != hw_fingerprint:
        #     return {
        #         "ok": False,
        #         "error": "License is bound to a different machine",
        #         "code": "HW_MISMATCH",
        #     }

        # Check max devices (for enterprise/multi-seat)
        max_devices = payload.get("maxDevices", 1)
        activations = record.get("activations", [])
        active_activations = [a for a in activations if a.get("active", True)]

        if hw_fingerprint and hw_id:
            # Check if this hardware is already activated (use hwId since hwFingerprint is unstable)
            existing = [a for a in active_activations if a.get("hwId") == hw_id]
            if not existing:
                # New activation — check device limit
                if len(active_activations) >= max_devices:
                    return {
                        "ok": False,
                        "error": f"Maximum devices ({max_devices}) reached for this license",
                        "code": "MAX_DEVICES",
                    }
                # Add activation
                activations.append({
                    "hwFingerprint": hw_fingerprint,
                    "hwId": hw_id,
                    "activatedAt": now,
                    "active": True,
                    "lastSeen": now,
                })
                record["activations"] = activations
                _save_licenses(data)
            else:
                # Update last seen
                for a in activations:
                    if a.get("hwId") == hw_id:
                        a["lastSeen"] = now
                _save_licenses(data)

        # Return the signed payload for client verification
        return {
            "ok": True,
            "signedPayload": record["signedPayload"],
            "payload": payload,
        }


def revoke_license(license_key: str) -> Dict[str, Any]:
    """Revoke a license."""
    with _lock:
        data = _load_licenses()
        record = data["licenses"].get(license_key)
        if not record:
            return {"ok": False, "error": "License not found"}

        record["payload"]["revoked"] = True
        # Re-sign the payload
        record["signedPayload"] = _sign_payload(record["payload"])
        _save_licenses(data)

        # Log analytics event
        try:
            p = record["payload"]
            log_usage_event(
                event_type="revocation",
                license_key=license_key,
                keygen_key=p.get("keygenKey", ""),
                phone=p.get("phone", ""),
            )
        except Exception:
            pass

        return {"ok": True, "licenseKey": license_key}


def deactivate_license(license_key: str, hw_fingerprint: str = None) -> Dict[str, Any]:
    """Deactivate a license for a specific hardware."""
    with _lock:
        data = _load_licenses()
        record = data["licenses"].get(license_key)
        if not record:
            return {"ok": False, "error": "License not found"}

        if hw_fingerprint:
            for a in record.get("activations", []):
                if a.get("hwFingerprint") == hw_fingerprint:
                    a["active"] = False
            _save_licenses(data)

        return {"ok": True}


def delete_license(license_key: str) -> Dict[str, Any]:
    """Permanently delete a license record."""
    with _lock:
        data = _load_licenses()
        cleaned = (license_key or "").strip().upper()
        if cleaned not in data.get("licenses", {}):
            return {"ok": False, "error": "License not found"}
        del data["licenses"][cleaned]
        _save_licenses(data)
        return {"ok": True, "message": f"License deleted: {license_key}"}


def list_licenses() -> Dict[str, Any]:
    """List all licenses (for admin panel)."""
    with _lock:
        data = _load_licenses()
        result = []
        for key, record in data["licenses"].items():
            payload = record["payload"]
            activations = record.get("activations", [])
            active_count = sum(1 for a in activations if a.get("active", True))
            result.append({
                "licenseKey": key,
                "type": payload.get("type"),
                "customer": payload.get("customer"),
                "email": payload.get("email"),
                "issuedAt": payload.get("issuedAt"),
                "expiresAt": payload.get("expiresAt"),
                "maxDevices": payload.get("maxDevices"),
                "activeDevices": active_count,
                "revoked": payload.get("revoked", False),
                "features": payload.get("features", []),
            })
        return {"ok": True, "licenses": result}


# ── Server-side license state (for enforcement middleware) ──────────────────
_server_state_lock = threading.Lock()

# Paths exempt from license enforcement (auth + license management itself)
LICENSE_EXEMPT_PATHS = {
    "/api/license/validate",
    "/api/license/public-key",
    "/api/license/heartbeat",
    "/api/license/server-status",
    "/api/auth/login",
    "/api/auth/login-with-key",
    "/api/auth/google",
    "/api/config/keygen-status",
}


def _load_server_state() -> Dict[str, Any]:
    """Load the server-side license state (trial start, last heartbeat, etc.)."""
    try:
        with open(SERVER_STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_server_state(state: Dict[str, Any]) -> None:
    """Save the server-side license state (atomic write)."""
    Path(SERVER_STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=str(Path(SERVER_STATE_FILE).parent), suffix=".tmp"
    )
    try:
        import os as _os
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
        import shutil
        shutil.move(tmp_path, SERVER_STATE_FILE)
        for alt_file in _get_sync_paths("license_server_state.json"):
            try:
                alt_file.parent.mkdir(parents=True, exist_ok=True)
                with open(alt_file, "w", encoding="utf-8") as f:
                    json.dump(state, f, indent=2, ensure_ascii=False)
            except Exception:
                pass
    except Exception:
        try:
            import os as _os
            _os.unlink(tmp_path)
        except Exception:
            pass


def _get_trial_days() -> int:
    """Get the trial period in days from env."""
    return int(os.getenv("LICENSE_TRIAL_DAYS", "14"))


def _get_grace_hours() -> int:
    """Get the grace period in hours from env."""
    return int(os.getenv("LICENSE_GRACE_HOURS", "72"))


def get_server_hw_info() -> Dict[str, str]:
    """Get authoritative hardware identification for the host server machine.

    Reads Windows MachineGuid from HKLM registry (or Linux machine-id / MAC address),
    hashes it with SHA-256, and formats it as HW-XXXX-XXXX-XXXX-XXXX.
    """
    guid = ""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
            guid, _ = winreg.QueryValueEx(key, "MachineGuid")
    except Exception:
        pass

    if not guid:
        for p in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
            try:
                if os.path.exists(p):
                    with open(p, "r", encoding="utf-8") as f:
                        guid = f.read().strip()
                        if guid:
                            break
            except Exception:
                pass

    if not guid:
        try:
            import uuid, platform
            guid = f"{uuid.getnode()}-{platform.node()}"
        except Exception:
            guid = "zeralda-default-node"

    import hashlib
    raw_hash = hashlib.sha256(guid.encode("utf-8")).hexdigest()
    fingerprint = raw_hash[:32]
    h = raw_hash[:16].upper()
    hw_id = f"HW-{h[0:4]}-{h[4:8]}-{h[8:12]}-{h[12:16]}"

    return {
        "rawGuid": guid,
        "hwFingerprint": fingerprint,
        "hwId": hw_id,
    }


def get_server_license_status() -> Dict[str, Any]:
    """Check the current server-side license status.

    Authoritative status used by the enforcement middleware:
      1. Verifies anti-tampering (clock skew check).
      2. Validates active licenses against hardware binding / device limits.
      3. Calculates trial days or grace hours remaining.
    """
    with _server_state_lock:
        data = _load_licenses()
        now = int(time.time())
        trial_days = _get_trial_days()
        grace_hours = _get_grace_hours()
        server_hw = get_server_hw_info()
        server_hw_id = server_hw["hwId"]
        server_fp = server_hw["hwFingerprint"]

        state = _load_server_state()
        last_hb = state.get("lastHeartbeat")

        # Anti-tampering: verify clock wasn't rolled backwards
        if last_hb and now < (last_hb - 300):
            return {
                "status": "invalid",
                "daysLeft": 0,
                "graceHoursLeft": 0,
                "error": "System clock tampering detected. System time is behind recorded state.",
                "code": "CLOCK_TAMPER",
                "serverHwId": server_hw_id,
            }

        # Check if any license is active (non-expired, non-revoked, and matches hardware if bound)
        for key, record in data.get("licenses", {}).items():
            payload = record.get("payload", {})
            if payload.get("revoked", False):
                continue
            expires_at = payload.get("expiresAt", 0)
            if expires_at and expires_at > 0 and now > expires_at:
                continue

            bound_fp = payload.get("hwFingerprint", "")
            bound_id = payload.get("hwId", "")
            activations = record.get("activations", [])
            max_devices = payload.get("maxDevices", 1)

            active_activations = [a for a in activations if a.get("active", True)]
            is_this_machine_activated = any(
                (a.get("hwId") == server_hw_id or a.get("hwFingerprint") == server_fp)
                for a in active_activations
            )

            # Check hardware matching if license has hardware restrictions or reached device limit
            if bound_id or bound_fp:
                if bound_id != server_hw_id and bound_fp != server_fp and not is_this_machine_activated:
                    continue
            elif len(active_activations) >= max_devices and not is_this_machine_activated:
                continue

            days_left = 0
            if expires_at and expires_at > 0:
                days_left = max(0, (expires_at - now) // (24 * 60 * 60))
            return {
                "status": "active",
                "daysLeft": days_left,
                "graceHoursLeft": 0,
                "licenseKey": key,
                "licenseType": payload.get("type", "standard"),
                "expiresAt": expires_at,
                "customer": payload.get("customer", ""),
                "email": payload.get("email", ""),
                "serverHwId": server_hw_id,
                "hwBound": bool(bound_id or bound_fp),
            }

        # No active license — check trial period
        trial_start = state.get("trialStart")
        if trial_start is None:
            trial_start = now
            state["trialStart"] = trial_start
            state["lastHeartbeat"] = now
            _save_server_state(state)

        trial_end = trial_start + (trial_days * 24 * 60 * 60)
        if now < trial_end:
            days_left = max(0, (trial_end - now) // (24 * 60 * 60))
            return {
                "status": "trial",
                "daysLeft": days_left,
                "graceHoursLeft": 0,
                "trialEnd": trial_end,
                "serverHwId": server_hw_id,
            }

        # Trial expired — check grace period
        last_heartbeat = state.get("lastHeartbeat", trial_start)
        grace_end = last_heartbeat + (grace_hours * 60 * 60)
        if now < grace_end:
            grace_hours_left = max(0, (grace_end - now) // (60 * 60))
            return {
                "status": "grace",
                "daysLeft": 0,
                "graceHoursLeft": grace_hours_left,
                "graceEnd": grace_end,
                "serverHwId": server_hw_id,
            }

        # Fully expired
        return {
            "status": "expired",
            "daysLeft": 0,
            "graceHoursLeft": 0,
            "error": "Trial period expired and no valid license activated for this machine",
            "serverHwId": server_hw_id,
        }


def record_heartbeat(
    license_key: str = None,
    hw_fingerprint: str = None,
    hw_id: str = None,
) -> Dict[str, Any]:
    """Record a heartbeat from a client and update server-side state.

    This serves as the phone-home mechanism: the client periodically calls
    this endpoint, and the server records the last-seen timestamp.
    If a license_key is provided, it also validates the license and updates
    the activation's lastSeen timestamp.

    Returns the current server license status.
    """
    with _server_state_lock:
        now = int(time.time())
        state = _load_server_state()
        state["lastHeartbeat"] = now
        state["lastHwFingerprint"] = hw_fingerprint or ""
        state["lastHwId"] = hw_id or ""
        if license_key:
            state["lastLicenseKey"] = license_key
        _save_server_state(state)

    # If a license key was provided, validate it (updates lastSeen)
    if license_key:
        try:
            validate_license(license_key, hw_fingerprint, hw_id)
        except Exception:
            pass

    # Log heartbeat event (throttled — only log every ~5 min per device)
    try:
        log_usage_event(
            event_type="heartbeat",
            license_key=license_key or "",
            hw_fingerprint=hw_fingerprint,
            hw_id=hw_id,
        )
    except Exception:
        pass

    return get_server_license_status()


def is_path_license_exempt(path: str) -> bool:
    """Check if a path is exempt from license enforcement."""
    return path in LICENSE_EXEMPT_PATHS or path.startswith("/api/license/")


def clear_trial_state() -> Dict[str, Any]:
    """Clear the trial state (called when a license is activated)."""
    with _server_state_lock:
        state = _load_server_state()
        state.pop("trialStart", None)
        _save_server_state(state)
    return {"ok": True}


# ── Code integrity verification (anti-tampering) ───────────────────────────
# Critical files whose integrity is checked at startup. If any of these
# files have been modified since the last known-good hash was recorded,
# the server logs a warning and can optionally refuse to start.
#
# The hashes are stored in data/license_integrity.json. On first run,
# the current hashes are recorded. On subsequent runs, they're compared.
#
# This catches casual tampering (e.g., editing license_service.py to
# bypass checks). A determined attacker could re-hash, but that requires
# deeper access.
CRITICAL_FILES = [
    "app/services/license_service.py",
    "app/handlers/license.py",
    "app/app.py",
    "app/main.py",
    "app/services/security.py",
    "shared/license_crypto.js",
    "shared/license_manager.js",
    "shared/license_guard.js",
    "shared/license_auto.js",
]


def _compute_file_hash(filepath: str) -> str:
    """Compute SHA-256 hash of a file."""
    import hashlib
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def check_integrity(strict: bool = False) -> Dict[str, Any]:
    """Check the integrity of critical files.

    Args:
        strict: If True, raise SystemExit on mismatch (for production).
                If False, just log warnings (for development).

    Returns:
        {
            "ok": bool,
            "checked": int,
            "mismatches": list of {file, expected, actual},
            "new": list of files (first run),
        }
    """
    base_dir = Path(__file__).resolve().parent.parent.parent
    integrity_path = base_dir / INTEGRITY_FILE

    # Load stored hashes
    stored = {}
    if integrity_path.exists():
        try:
            with open(integrity_path, "r", encoding="utf-8") as f:
                stored = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass

    mismatches = []
    new_files = []
    checked = 0

    for rel_path in CRITICAL_FILES:
        full_path = base_dir / rel_path
        if not full_path.exists():
            mismatches.append({
                "file": rel_path,
                "error": "File missing",
                "expected": stored.get(rel_path, ""),
                "actual": "MISSING",
            })
            continue

        actual_hash = _compute_file_hash(str(full_path))
        checked += 1

        if rel_path not in stored:
            # First time seeing this file — record it
            stored[rel_path] = actual_hash
            new_files.append(rel_path)
        elif stored[rel_path] != actual_hash:
            mismatches.append({
                "file": rel_path,
                "expected": stored[rel_path][:16] + "...",
                "actual": actual_hash[:16] + "...",
            })

    # Save updated hashes (including any new files)
    if new_files or mismatches:
        try:
            integrity_path.parent.mkdir(parents=True, exist_ok=True)
            with open(integrity_path, "w", encoding="utf-8") as f:
                json.dump(stored, f, indent=2, ensure_ascii=False)
        except OSError as e:
            print(f"[INTEGRITY] [WARN] Failed to save integrity hashes: {e}")

    if mismatches:
        print(f"[INTEGRITY] [WARN] {len(mismatches)} file(s) modified since last check:")
        for m in mismatches:
            print(f"[INTEGRITY] [WARN]   - {m['file']}: {m.get('error', 'hash mismatch')}")
        if strict:
            print("[INTEGRITY] [ERROR] Integrity check failed in strict mode — refusing to start")
            raise SystemExit(1)

    if new_files:
        print(f"[INTEGRITY] [INFO] {len(new_files)} new file(s) registered:")
        for f in new_files:
            print(f"[INTEGRITY] [INFO]   - {f}")

    return {
        "ok": len(mismatches) == 0,
        "checked": checked,
        "mismatches": mismatches,
        "new": new_files,
    }


def reset_integrity() -> Dict[str, Any]:
    """Reset integrity hashes (re-record current state as known-good).

    Use this after intentionally modifying critical files (e.g., deploying
    an update). Requires manual invocation.
    """
    base_dir = Path(__file__).resolve().parent.parent.parent
    integrity_path = base_dir / INTEGRITY_FILE
    stored = {}
    for rel_path in CRITICAL_FILES:
        full_path = base_dir / rel_path
        if full_path.exists():
            stored[rel_path] = _compute_file_hash(str(full_path))
    integrity_path.parent.mkdir(parents=True, exist_ok=True)
    with open(integrity_path, "w", encoding="utf-8") as f:
        json.dump(stored, f, indent=2, ensure_ascii=False)
    return {"ok": True, "registered": len(stored)}


# ── Usage Analytics ────────────────────────────────────────────────────────
# Tracks activation events, heartbeats, and detects unauthorized usage
# (same license on multiple machines, suspicious patterns, etc.)
USAGE_LOG_FILE = str(_BASE_DIR / "data" / "license_usage_log.json")
USAGE_LOG_MAX_ENTRIES = 10000  # keep last 10k events
_usage_log_lock = threading.Lock()


def _load_usage_log() -> Dict[str, Any]:
    """Load the usage log."""
    try:
        with open(USAGE_LOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"events": [], "devices": {}}


def _save_usage_log(data: Dict[str, Any]) -> None:
    """Save the usage log (atomic)."""
    Path(USAGE_LOG_FILE).parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(
        dir=str(Path(USAGE_LOG_FILE).parent), suffix=".tmp"
    )
    try:
        import os as _os
        with _os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        import shutil
        shutil.move(tmp_path, USAGE_LOG_FILE)
    except Exception:
        try:
            import os as _os
            _os.unlink(tmp_path)
        except Exception:
            pass


def log_usage_event(
    event_type: str,
    license_key: str = None,
    keygen_key: str = None,
    hw_fingerprint: str = None,
    hw_id: str = None,
    phone: str = None,
    ip: str = None,
    user_agent: str = None,
    extra: Dict[str, Any] = None,
) -> None:
    """Log a usage event (activation, heartbeat, revocation, tampering, etc.).

    Event types:
      - "activation"      — license activated on a machine
      - "heartbeat"       — periodic check-in from client
      - "revocation"      — license/key revoked
      - "tampering"       — integrity check failed
      - "hw_mismatch"     — license used on wrong machine
      - "max_devices"     — device limit exceeded
      - "login_with_key"  — user logged in with keygen key
    """
    now = int(time.time())
    event = {
        "ts": now,
        "type": event_type,
        "licenseKey": license_key or "",
        "keygenKey": keygen_key or "",
        "hwFingerprint": hw_fingerprint or "",
        "hwId": hw_id or "",
        "phone": phone or "",
        "ip": ip or "",
        "userAgent": (user_agent or "")[:200],
    }
    if extra:
        event["extra"] = extra

    with _usage_log_lock:
        data = _load_usage_log()
        events = data.get("events", [])
        events.append(event)
        # Trim to max entries
        if len(events) > USAGE_LOG_MAX_ENTRIES:
            events = events[-USAGE_LOG_MAX_ENTRIES:]
        data["events"] = events

        # Update device registry
        devices = data.get("devices", {})
        if hw_fingerprint:
            dev_key = hw_fingerprint
            if dev_key not in devices:
                devices[dev_key] = {
                    "hwId": hw_id or "",
                    "firstSeen": now,
                    "lastSeen": now,
                    "eventCount": 1,
                    "licenseKeys": [],
                    "ipAddresses": [],
                    "phone": phone or "",
                }
            dev = devices[dev_key]
            dev["lastSeen"] = now
            dev["eventCount"] = dev.get("eventCount", 0) + 1
            if license_key and license_key not in dev.get("licenseKeys", []):
                dev["licenseKeys"].append(license_key)
            if ip and ip not in dev.get("ipAddresses", []):
                dev["ipAddresses"].append(ip)
                # Keep only last 10 IPs
                dev["ipAddresses"] = dev["ipAddresses"][-10:]
            if phone:
                dev["phone"] = phone
            data["devices"] = devices

        _save_usage_log(data)


def get_usage_stats() -> Dict[str, Any]:
    """Get comprehensive usage statistics for the admin dashboard.

    Returns:
        {
            "ok": bool,
            "summary": {
                "totalDevices": int,
                "activeDevices24h": int,
                "activeDevices7d": int,
                "totalEvents": int,
                "events24h": int,
                "totalLicenses": int,
                "activeLicenses": int,
                "revokedLicenses": int,
            },
            "devices": [
                {
                    "hwId": str,
                    "hwFingerprint": str,
                    "firstSeen": ts,
                    "lastSeen": ts,
                    "eventCount": int,
                    "licenseKeys": [str],
                    "ipAddresses": [str],
                    "phone": str,
                    "status": "active" | "inactive",
                },
            ],
            "suspicious": [
                {
                    "type": "multi_license" | "multi_device" | ...,
                    "detail": str,
                    "severity": "low" | "medium" | "high",
                },
            ],
            "recentEvents": [event dict],
            "licenseSummary": [license stats],
        }
    """
    with _usage_log_lock:
        data = _load_usage_log()

    now = int(time.time())
    DAY_S = 24 * 60 * 60
    events = data.get("events", [])
    devices = data.get("devices", {})

    # ── Summary ─────────────────────────────────────────────────────────
    active_24h = sum(1 for d in devices.values() if now - d.get("lastSeen", 0) < DAY_S)
    active_7d = sum(1 for d in devices.values() if now - d.get("lastSeen", 0) < 7 * DAY_S)
    events_24h = sum(1 for e in events if now - e.get("ts", 0) < DAY_S)

    # License stats
    lic_data = _load_licenses()
    all_licenses = lic_data.get("licenses", {})
    total_licenses = len(all_licenses)
    active_licenses = 0
    revoked_licenses = 0
    for record in all_licenses.values():
        p = record.get("payload", {})
        if p.get("revoked", False):
            revoked_licenses += 1
        else:
            exp = p.get("expiresAt", 0)
            if not exp or exp == 0 or now < exp:
                active_licenses += 1

    summary = {
        "totalDevices": len(devices),
        "activeDevices24h": active_24h,
        "activeDevices7d": active_7d,
        "totalEvents": len(events),
        "events24h": events_24h,
        "totalLicenses": total_licenses,
        "activeLicenses": active_licenses,
        "revokedLicenses": revoked_licenses,
    }

    # ── Devices list ────────────────────────────────────────────────────
    device_list = []
    for fp, d in devices.items():
        last_seen = d.get("lastSeen", 0)
        status = "active" if now - last_seen < DAY_S else "inactive"
        device_list.append({
            "hwFingerprint": fp[:16] + "..." if len(fp) > 16 else fp,
            "hwId": d.get("hwId", ""),
            "firstSeen": d.get("firstSeen", 0),
            "lastSeen": last_seen,
            "eventCount": d.get("eventCount", 0),
            "licenseKeys": d.get("licenseKeys", []),
            "ipAddresses": d.get("ipAddresses", []),
            "phone": d.get("phone", ""),
            "status": status,
        })
    # Sort by lastSeen descending
    device_list.sort(key=lambda x: x["lastSeen"], reverse=True)

    # ── Suspicious activity detection ───────────────────────────────────
    suspicious = []

    # Check: device with multiple license keys (possible sharing)
    for d in device_list:
        if len(d["licenseKeys"]) > 1:
            suspicious.append({
                "type": "multi_license_per_device",
                "severity": "medium",
                "detail": f"Device {d['hwId']} used {len(d['licenseKeys'])} different licenses: {', '.join(d['licenseKeys'][:3])}",
                "hwId": d["hwId"],
                "licenseKeys": d["licenseKeys"],
            })

    # Check: license activated on multiple devices (possible piracy)
    license_devices = {}  # licenseKey → [device hwIds]
    for d in device_list:
        for lk in d.get("licenseKeys", []):
            if lk not in license_devices:
                license_devices[lk] = []
            if d["hwId"] not in license_devices[lk]:
                license_devices[lk].append(d["hwId"])
    for lk, hwids in license_devices.items():
        if len(hwids) > 1:
            # Check if license maxDevices allows this
            lic_record = all_licenses.get(lk, {})
            max_dev = lic_record.get("payload", {}).get("maxDevices", 1)
            if len(hwids) > max_dev:
                suspicious.append({
                    "type": "multi_device_per_license",
                    "severity": "high",
                    "detail": f"License {lk} used on {len(hwids)} devices (max {max_dev}): {', '.join(hwids[:5])}",
                    "licenseKey": lk,
                    "devices": hwids,
                })

    # Check: tampering events
    tamper_events = [e for e in events if e.get("type") == "tampering"]
    if tamper_events:
        recent_tamper = [e for e in tamper_events if now - e.get("ts", 0) < 7 * DAY_S]
        if recent_tamper:
            suspicious.append({
                "type": "tampering_detected",
                "severity": "high",
                "detail": f"{len(recent_tamper)} tampering event(s) in last 7 days",
                "events": recent_tamper[-5:],
            })

    # Check: hw_mismatch events
    hw_mismatches = [e for e in events if e.get("type") == "hw_mismatch"]
    if hw_mismatches:
        recent_mismatches = [e for e in hw_mismatches if now - e.get("ts", 0) < DAY_S]
        if recent_mismatches:
            suspicious.append({
                "type": "hw_mismatch_attempts",
                "severity": "medium",
                "detail": f"{len(recent_mismatches)} HW mismatch attempt(s) in last 24h",
            })

    # ── Recent events ───────────────────────────────────────────────────
    recent_events = events[-50:][::-1]  # last 50, newest first

    # ── License summary ─────────────────────────────────────────────────
    license_summary = []
    for lk, record in all_licenses.items():
        p = record.get("payload", {})
        activations = record.get("activations", [])
        active_acts = sum(1 for a in activations if a.get("active", True))
        license_summary.append({
            "licenseKey": lk,
            "keygenKey": p.get("keygenKey", ""),
            "type": p.get("type", ""),
            "customer": p.get("customer", ""),
            "phone": p.get("phone", ""),
            "email": p.get("email", ""),
            "maxDevices": p.get("maxDevices", 1),
            "activeDevices": active_acts,
            "revoked": p.get("revoked", False),
            "expiresAt": p.get("expiresAt", 0),
            "hwBound": bool(p.get("hwFingerprint")),
        })
    license_summary.sort(key=lambda x: x.get("expiresAt", 0), reverse=True)

    return {
        "ok": True,
        "summary": summary,
        "devices": device_list,
        "suspicious": suspicious,
        "recentEvents": recent_events,
        "licenseSummary": license_summary,
    }


def clear_usage_log() -> Dict[str, Any]:
    """Clear the usage log (admin only, for maintenance)."""
    with _usage_log_lock:
        _save_usage_log({"events": [], "devices": {}})
    return {"ok": True, "message": "Usage log cleared"}


# ── Initialize on import ───────────────────────────────────────────────────
_ensure_keys()
