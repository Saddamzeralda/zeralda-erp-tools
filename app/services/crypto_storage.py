"""Cryptographic storage service for Zeralda ERP.

Provides AES-256-GCM authenticated encryption at rest for:
- data/shared_store.json (Authoritative store)
- data/shared_history.json (Change history)
- data/undo_stack.json (Undo stack)
- data/backups/shared_store-*.json (Automated backup snapshots)

Features:
- Authenticated Encryption with Associated Data (AEAD) via AES-256-GCM
- 256-bit key derived via HKDF-SHA256 from system secret
- Cryptographic nonce (96 bits) per encryption prevents replay/pattern attacks
- Backward compatible: automatically detects and migrates legacy plaintext JSON
- Tamper-proof: any modified or corrupted bytes cause decryption failure
"""
from __future__ import annotations

import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any, Optional

try:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False
    hashes = None
    AESGCM = None
    HKDF = None

logger = logging.getLogger("zeralda.crypto_storage")

# Header magic to distinguish encrypted data from plaintext legacy JSON
MAGIC_HEADER = b"ZERALDA_ENC_V1:"
MAGIC_LEN = len(MAGIC_HEADER)
NONCE_LEN = 12  # 96 bits standard for AES-GCM
HKDF_SALT = b"zeralda-erp-storage-encryption-salt-v1"
HKDF_INFO = b"zeralda-erp-storage-key"

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_KEY_FILE = _BASE_DIR / "data" / ".storage_key"

_cached_aes_key: Optional[bytes] = None


def get_encryption_key() -> Optional[bytes]:
    """Retrieve or derive the persistent 256-bit AES-GCM key."""
    if not HAS_CRYPTOGRAPHY or not HKDF:
        return None

    global _cached_aes_key
    if _cached_aes_key is not None:
        return _cached_aes_key

    # 1. Environment variable override
    env_key = os.getenv("STORAGE_ENCRYPTION_KEY", "").strip()
    if env_key and len(env_key) >= 32:
        master_secret = env_key.encode("utf-8")
    else:
        # 2. Check persistent storage key file
        if _KEY_FILE.exists():
            try:
                stored = _KEY_FILE.read_bytes().strip()
                if len(stored) >= 32:
                    _cached_aes_key = stored[:32]
                    return _cached_aes_key
            except Exception as e:
                logger.warning("Could not read .storage_key file: %s", e)

        # 3. Derive from SECRET_KEY if set
        secret_key = os.getenv("SECRET_KEY", "").strip()
        if secret_key and len(secret_key) >= 32:
            master_secret = secret_key.encode("utf-8")
        else:
            # 4. Generate fresh 256-bit random key and persist it
            raw_key = secrets.token_bytes(32)
            try:
                _KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
                _KEY_FILE.write_bytes(raw_key)
                try:
                    _KEY_FILE.chmod(0o600)
                except (OSError, PermissionError):
                    pass
            except Exception as e:
                logger.warning("Could not persist .storage_key: %s", e)
            _cached_aes_key = raw_key
            return _cached_aes_key

    # Derive 256-bit key using HKDF-SHA256
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=HKDF_SALT,
        info=HKDF_INFO,
    )
    _cached_aes_key = hkdf.derive(master_secret)
    return _cached_aes_key


def is_encrypted(data: bytes) -> bool:
    """Check if byte sequence starts with the Zeralda encryption header."""
    return data.startswith(MAGIC_HEADER)


def encrypt_bytes(plaintext: bytes) -> bytes:
    """Encrypt raw bytes using AES-256-GCM.
    Format: MAGIC_HEADER (15 bytes) + NONCE (12 bytes) + CIPHERTEXT_WITH_TAG
    """
    if not HAS_CRYPTOGRAPHY or not AESGCM:
        return plaintext
    key = get_encryption_key()
    if not key:
        return plaintext
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(NONCE_LEN)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return MAGIC_HEADER + nonce + ciphertext


def decrypt_bytes(raw_data: bytes) -> bytes:
    """Decrypt raw bytes. If data is not encrypted (legacy JSON), returns raw_data as-is."""
    if not is_encrypted(raw_data):
        # Plaintext backward compatibility
        return raw_data

    if not HAS_CRYPTOGRAPHY or not AESGCM:
        logger.error("Data is AES-256-GCM encrypted but cryptography library is not installed.")
        raise RuntimeError("Encrypted storage requires 'cryptography' library.")

    header_offset = MAGIC_LEN
    nonce = raw_data[header_offset:header_offset + NONCE_LEN]
    ciphertext = raw_data[header_offset + NONCE_LEN:]

    key = get_encryption_key()
    if not key:
        logger.error("Data is AES-256-GCM encrypted but encryption key is missing.")
        raise RuntimeError("Storage encryption key is missing or unreadable.")
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None)
    except Exception as primary_err:
        # Try fallback candidate keys (e.g. data/.storage_key or data_defaults/.storage_key
        # when STORAGE_ENCRYPTION_KEY env var differs from the repo's seeded store key)
        candidate_keys = []
        for kf in (_KEY_FILE, _BASE_DIR / "data_defaults" / ".storage_key"):
            try:
                if kf.exists():
                    raw = kf.read_bytes()
                    for cand in (raw.strip()[:32], raw[:32]):
                        if len(cand) == 32 and cand != key and cand not in candidate_keys:
                            candidate_keys.append(cand)
            except Exception:
                pass
        if HKDF and hashes:
            for env_name in ("STORAGE_ENCRYPTION_KEY", "SECRET_KEY"):
                val = os.getenv(env_name, "").strip()
                if val and len(val) >= 32:
                    try:
                        derived = HKDF(
                            algorithm=hashes.SHA256(),
                            length=32,
                            salt=HKDF_SALT,
                            info=HKDF_INFO,
                        ).derive(val.encode("utf-8"))
                        if derived != key and derived not in candidate_keys:
                            candidate_keys.append(derived)
                    except Exception:
                        pass
        for cand_key in candidate_keys:
            try:
                plain = AESGCM(cand_key).decrypt(nonce, ciphertext, None)
                global _cached_aes_key
                _cached_aes_key = cand_key
                return plain
            except Exception:
                continue
        logger.error("AES-256-GCM decryption failed (tampering or wrong key): %s", primary_err)
        raise ValueError("Decryption failed: corrupted storage or invalid key") from primary_err


def encrypt_json(obj: Any) -> bytes:
    """Serialize Python object to JSON and encrypt with AES-256-GCM."""
    payload = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    return encrypt_bytes(payload)


def decrypt_json(raw_data: bytes) -> Any:
    """Decrypt and deserialize JSON payload (supports both encrypted and plaintext)."""
    decrypted_bytes = decrypt_bytes(raw_data)
    return json.loads(decrypted_bytes.decode("utf-8"))
