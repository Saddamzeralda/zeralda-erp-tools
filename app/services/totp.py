"""Pure-Python implementation of RFC 6238 Time-based One-Time Password (TOTP).

Zero external dependencies. Compatible with:
- Google Authenticator
- Microsoft Authenticator
- Apple Keychain / Passwords
- 1Password / Bitwarden / Authy
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from typing import Optional
from urllib.parse import quote


def generate_secret(byte_count: int = 20) -> str:
    """Generate a random base32-encoded secret key (RFC 3548 / RFC 4648)."""
    raw_bytes = secrets.token_bytes(byte_count)
    return base64.b32encode(raw_bytes).decode("ascii").rstrip("=")


def _clean_secret(secret: str) -> bytes:
    """Normalize and decode a base32 secret."""
    cleaned = secret.strip().replace(" ", "").upper()
    # Add missing base32 padding
    missing_padding = len(cleaned) % 8
    if missing_padding:
        cleaned += "=" * (8 - missing_padding)
    return base64.b32decode(cleaned, casefold=True)


def get_totp_token(secret: str, interval: int = 30, timestamp: Optional[float] = None) -> str:
    """Calculate the 6-digit TOTP code for the given secret at timestamp."""
    if timestamp is None:
        timestamp = time.time()
    
    counter = int(timestamp // interval)
    key = _clean_secret(secret)
    msg = struct.pack(">Q", counter)
    
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
    return f"{code:06d}"


def verify_totp_token(secret: str, token: str, window: int = 1, interval: int = 30) -> bool:
    """Verify a 6-digit TOTP token against secret within a time window (default +/- 30s)."""
    if not secret or not token:
        return False
    
    token = str(token).strip().replace(" ", "")
    if len(token) != 6 or not token.isdigit():
        return False
    
    current_time = time.time()
    for drift in range(-window, window + 1):
        candidate_time = current_time + (drift * interval)
        expected = get_totp_token(secret, interval=interval, timestamp=candidate_time)
        if hmac.compare_digest(expected, token):
            return True
            
    return False


def get_provisioning_uri(secret: str, email: str, issuer: str = "Zeralda ERP") -> str:
    """Generate otpauth:// URI for QR code generation in authenticator apps."""
    clean_sec = secret.strip().replace(" ", "").upper().rstrip("=")
    encoded_issuer = quote(issuer)
    encoded_email = quote(email)
    return f"otpauth://totp/{encoded_issuer}:{encoded_email}?secret={clean_sec}&issuer={encoded_issuer}&algorithm=SHA1&digits=6&period=30"
