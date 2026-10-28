"""
Zeralda ERP - Authentication System
====================================
Secure authentication with password hashing, session management, and RBAC.
"""

import hashlib
import hmac
import secrets
import json
import os
import stat
import time
import re
import threading
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple, Any

# Data directories
from pathlib import Path
from app.services import storage

_BASE_DATA_DIR = str(storage.DATA_DIR)
DATA_DIR = os.getenv("DATA_DIR", _BASE_DATA_DIR)
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
SESSIONS_FILE = os.path.join(DATA_DIR, 'sessions.json')
LOGIN_ATTEMPTS_FILE = os.path.join(DATA_DIR, 'login_attempts.json')

os.makedirs(DATA_DIR, exist_ok=True)
_SEED_AUTH_DIR = str(storage._SEED_DIR) if hasattr(storage, '_SEED_DIR') else os.path.join(str(storage._BASE_DIR), 'data_defaults')
if not os.path.exists(_SEED_AUTH_DIR):
    _SEED_AUTH_DIR = _BASE_DATA_DIR

if os.path.abspath(DATA_DIR) != os.path.abspath(_SEED_AUTH_DIR):
    for f in ['users.json', '.secret_key']:
        src = os.path.join(_SEED_AUTH_DIR, f)
        dst = os.path.join(DATA_DIR, f)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                import shutil
                shutil.copy2(src, dst)
            except Exception:
                pass

# ── Threading locks to prevent race conditions under concurrent requests ──────
_sessions_lock = threading.RLock()
_users_lock = threading.RLock()
_login_attempts_lock = threading.RLock()


def _load_or_create_secret_key() -> str:
    """
    Load a stable SECRET_KEY: env var → persistent file → generate & persist.
    Generating a new random key on every restart invalidates all active sessions.
    """
    env_key = os.getenv('SECRET_KEY', '').strip()
    if env_key and len(env_key) >= 32:
        return env_key

    key_file = os.path.join(DATA_DIR, '.secret_key')
    if os.path.exists(key_file):
        try:
            with open(key_file, 'r', encoding='utf-8') as _f:
                stored = _f.read().strip()
            if len(stored) >= 32:
                return stored
        except Exception:
            pass

    new_key = secrets.token_hex(32)
    try:
        with open(key_file, 'w', encoding='utf-8') as _f:
            _f.write(new_key)
        try:
            os.chmod(key_file, stat.S_IRUSR | stat.S_IWUSR)
        except Exception:
            pass
    except Exception:
        pass
    print('[AUTH] [WARN] SECRET_KEY not set in .env — generated persistent key saved to data/.secret_key')
    print('[AUTH] [WARN] Add SECRET_KEY to .env to silence this warning and enable cross-host sessions.')
    return new_key


# Configuration
SECRET_KEY = _load_or_create_secret_key()
SESSION_TIMEOUT = int(os.getenv('SESSION_TIMEOUT_SECONDS', str(10 * 3600)))  # 10 hours in seconds
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = 15 * 60  # 15 minutes
PBKDF2_ITERATIONS = int(os.getenv('PBKDF2_ITERATIONS', '260000'))
SESSION_BIND_IP = os.getenv('SESSION_BIND_IP', 'false').lower() == 'true'
SESSION_BIND_UA = os.getenv('SESSION_BIND_UA', 'false').lower() == 'true'

# Developer & Admin accounts (Never expire, bypass timeouts and locks)
DEVELOPER_ALIASES = {'zitouni', 'abdelhakim', 'saddam', 'saddamzeralda', 'admin', 'developer'}
DEVELOPER_PHONES = {'0559666951', '213559666951', '+213559666951', '0696409083', '213696409083', '+213696409083'}
DEVELOPER_EMAILS = {'saddamzeralda@gmail.com', 'admin@zeralda.dz'}


def _norm_phone(p: Any) -> str:
    """Normalize phone for comparison (strip spaces/dashes, keep + and digits)."""
    return ''.join(c for c in str(p or '') if c in '+0123456789').lower()


def is_developer_account(identifier_or_user: Any) -> bool:
    """Check if an email, username, phone, or user dictionary corresponds to the developer account.
    
    Developer accounts never expire, bypass session timeouts, and have permanent validity.
    """
    if not identifier_or_user:
        return False
    if isinstance(identifier_or_user, dict):
        if identifier_or_user.get('is_developer') or identifier_or_user.get('never_expires'):
            return True
        if str(identifier_or_user.get('role', '')).lower() == 'developer':
            return True
        email = str(identifier_or_user.get('email') or '').strip().lower()
        username = str(identifier_or_user.get('username') or '').strip().lower()
        phone = _norm_phone(identifier_or_user.get('phone') or identifier_or_user.get('id') or '')
    else:
        raw = str(identifier_or_user).strip().lower()
        email = raw
        username = raw
        phone = _norm_phone(raw)

    if email in DEVELOPER_EMAILS or username in DEVELOPER_EMAILS:
        return True
    if username in DEVELOPER_ALIASES or email in DEVELOPER_ALIASES:
        return True
    if any(k in email for k in ('saddam', 'zitouni', 'abdelhakim')):
        return True
    if phone and phone in DEVELOPER_PHONES:
        return True
    return False


# ══════════════════════════════════════════════════════════
#  Password Hashing (PBKDF2 with SHA-256)
# ══════════════════════════════════════════════════════════

def hash_password(password: str, salt: Optional[bytes] = None) -> tuple:
    """
    Hash a password using PBKDF2-HMAC-SHA256
    Returns: (hashed_password, salt)
    """
    if salt is None:
        salt = secrets.token_bytes(32)
    
    # PBKDF2 with configurable high iteration count
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        PBKDF2_ITERATIONS
    )
    
    return hashed.hex(), salt.hex()


def verify_password(password: str, hashed_password: str, salt: str) -> bool:
    """Verify a password against its hash.

    FIX: Constant-time comparison even on error paths to prevent timing attacks
    that could reveal whether a salt is valid.
    """
    dummy_hash = "0" * len(hashed_password) if hashed_password else "0" * 128
    try:
        salt_bytes = bytes.fromhex(salt)
        new_hash, _ = hash_password(password, salt_bytes)
        return hmac.compare_digest(new_hash, hashed_password)
    except Exception:
        # FIX: always run compare_digest to keep timing constant
        try:
            hmac.compare_digest(dummy_hash, hashed_password or dummy_hash)
        except Exception:
            pass
        return False


# ══════════════════════════════════════════════════════════
#  User Management
# ══════════════════════════════════════════════════════════

def load_users() -> Dict:
    """Load users from file"""
    with _users_lock:
        try:
            if os.path.exists(USERS_FILE):
                with open(USERS_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"[ERROR] Failed to load users: {e}")
            return {}


def save_users(users: Dict):
    """Save users to file (atomic write to prevent corruption)"""
    with _users_lock:
        try:
            tmp = USERS_FILE + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(users, f, ensure_ascii=False, indent=2)
            os.replace(tmp, USERS_FILE)
        except Exception as e:
            print(f"[ERROR] Failed to save users: {e}")


def _is_valid_email(email: str) -> bool:
    value = str(email or '').strip().lower()
    if not value:
        return False
    return re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', value) is not None


def _validate_password_strength(password: str) -> Optional[str]:
    """Return None for valid password, otherwise return human-readable reason."""
    value = str(password or '')
    if len(value) < 10:
        return 'Password must be at least 10 characters long'
    if not re.search(r'[A-Z]', value):
        return 'Password must contain at least one uppercase letter'
    if not re.search(r'[a-z]', value):
        return 'Password must contain at least one lowercase letter'
    if not re.search(r'\d', value):
        return 'Password must contain at least one number'
    if not re.search(r'[^A-Za-z0-9]', value):
        return 'Password must contain at least one special character'
    return None


def create_user(username: str, email: str, password: str, role: str = 'user') -> Dict:
    """
    Create a new user
    Roles: admin, manager, user, viewer
    """
    users = load_users()
    email = str(email or '').strip().lower()
    username = str(username or '').strip()
    
    # Validate core fields
    if not username:
        return {'ok': False, 'error': 'Username is required'}
    if not _is_valid_email(email):
        return {'ok': False, 'error': 'Invalid email format'}

    weak_reason = _validate_password_strength(password)
    if weak_reason:
        return {'ok': False, 'error': weak_reason}

    # Check if user exists
    if email in users:
        return {'ok': False, 'error': 'User already exists'}
    
    # Validate role
    valid_roles = ['admin', 'manager', 'user', 'viewer', 'developer']
    if role not in valid_roles:
        return {'ok': False, 'error': 'Invalid role'}
    
    # Hash password
    hashed_password, salt = hash_password(password)
    
    # Create user
    is_dev = is_developer_account(email) or is_developer_account(username) or role == 'developer'
    user_data = {
        'username': username,
        'email': email,
        'password': hashed_password,
        'salt': salt,
        'role': role,
        'created_at': datetime.now().isoformat(),
        'active': True,
        'failed_attempts': 0,
        'locked_until': None,
        'is_developer': is_dev,
        'never_expires': is_dev
    }
    
    users[email] = user_data
    save_users(users)
    
    return {'ok': True, 'user': {'email': email, 'username': username, 'role': role}}


def get_user(email: str) -> Optional[Dict]:
    """Get user by email (enriches developer account with permanent validity flags)."""
    users = load_users()
    user = users.get(email)
    if user:
        # Don't return password
        safe_user = {k: v for k, v in user.items() if k not in ['password', 'salt']}
        if is_developer_account(user) or is_developer_account(email):
            safe_user['is_developer'] = True
            safe_user['never_expires'] = True
            safe_user['license_duration'] = 'lifetime'
            safe_user['role_label'] = 'المطور'
        return safe_user
    return None


def initialize_default_users():
    """
    Ensure default admin user exists only on completely fresh installs with zero users.
    Never modifies or resets any existing user accounts.
    """
    users = load_users()
    if users:
        # Original users exist — keep them 100% untouched!
        return

    admin_email = os.getenv('DEFAULT_ADMIN_EMAIL', 'admin@zeralda.dz').strip().lower()
    admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@2026!').strip()
    admin_username = os.getenv('DEFAULT_ADMIN_USERNAME', 'Admin').strip()

    if admin_email and admin_password:
        hashed_password, salt = hash_password(admin_password)
        users[admin_email] = {
            'username': admin_username,
            'email': admin_email,
            'password': hashed_password,
            'salt': salt,
            'role': 'admin',
            'created_at': datetime.now().isoformat(),
            'active': True,
            'failed_attempts': 0,
            'locked_until': None,
            'must_change_password': True
        }
        save_users(users)
        print(f"[AUTH] [OK] Initialized default admin: {admin_email} (password change required on first login)")


# ══════════════════════════════════════════════════════════
#  Login Attempts & Account Lockout
# ══════════════════════════════════════════════════════════

def save_login_attempts(attempts: Dict):
    """Save login attempts (atomic write)"""
    with _login_attempts_lock:
        try:
            tmp = LOGIN_ATTEMPTS_FILE + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(attempts, f, ensure_ascii=False, indent=2)
            os.replace(tmp, LOGIN_ATTEMPTS_FILE)
        except Exception as e:
            print(f"[ERROR] Failed to save login attempts: {e}")


def is_account_locked(email: str) -> bool:
    """Check if account is locked (developer accounts are never locked)."""
    if is_developer_account(email):
        return False
    users = load_users()
    user = users.get(email)
    
    if not user:
        return False
    
    locked_until = user.get('locked_until')
    if locked_until:
        locked_time = datetime.fromisoformat(locked_until)
        if datetime.now() < locked_time:
            return True
        else:
            # Unlock account
            user['locked_until'] = None
            user['failed_attempts'] = 0
            save_users(users)
    
    return False


def record_failed_attempt(email: str):
    """Record a failed login attempt (developer accounts never accumulate lockout)."""
    if is_developer_account(email):
        return
    users = load_users()
    user = users.get(email)
    
    if not user:
        return
    
    user['failed_attempts'] = user.get('failed_attempts', 0) + 1
    
    if user['failed_attempts'] >= MAX_LOGIN_ATTEMPTS:
        # Lock account
        locked_until = datetime.now() + timedelta(seconds=LOCKOUT_DURATION)
        user['locked_until'] = locked_until.isoformat()
        print(f"[AUTH] [WARN] Account {email} locked until {locked_until}")
    
    save_users(users)


def reset_failed_attempts(email: str):
    """Reset failed login attempts on successful login"""
    users = load_users()
    user = users.get(email)
    
    if user:
        user['failed_attempts'] = 0
        user['locked_until'] = None
        save_users(users)


# ══════════════════════════════════════════════════════════
#  Session Management
# ══════════════════════════════════════════════════════════

# In-memory sessions cache (Sessions-cache patch).
# Reduces disk I/O from N writes/req to a periodic flush + flush-on-mutation.
_sessions_cache = None              # type: Optional[Dict]
_sessions_dirty = False             # set True when cache mutates without flush
_sessions_last_flush = 0.0          # epoch seconds of last successful flush
SESSIONS_FLUSH_INTERVAL = 30.0      # max seconds between flushes


def _flush_sessions_locked(force: bool = False):
    """Persist the cache to disk if dirty and interval elapsed (or forced).

    Caller MUST already hold _sessions_lock.
    """
    global _sessions_dirty, _sessions_last_flush
    if _sessions_cache is None:
        return
    if not _sessions_dirty:
        return
    import time as _t
    now = _t.time()
    if not force and (now - _sessions_last_flush) < SESSIONS_FLUSH_INTERVAL:
        return
    try:
        tmp = SESSIONS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(_sessions_cache, f, ensure_ascii=False, indent=2)
        os.replace(tmp, SESSIONS_FILE)
        _sessions_dirty = False
        _sessions_last_flush = now
    except Exception as e:
        print(f"[ERROR] Failed to flush sessions: {e}")


def flush_sessions():
    """Public API: force-flush the session cache to disk (call on shutdown)."""
    with _sessions_lock:
        _flush_sessions_locked(force=True)


def load_sessions() -> Dict:
    """Load active sessions (in-memory cache, file is read once on first call)."""
    global _sessions_cache
    with _sessions_lock:
        if _sessions_cache is not None:
            return _sessions_cache
        try:
            if os.path.exists(SESSIONS_FILE):
                with open(SESSIONS_FILE, 'r', encoding='utf-8') as f:
                    _sessions_cache = json.load(f) or {}
            else:
                _sessions_cache = {}
        except Exception:
            _sessions_cache = {}
        return _sessions_cache


def save_sessions(sessions: Dict):
    """Mark cache dirty; flush if interval elapsed. Disk write is throttled.

    Critical events (login/logout) should also call flush_sessions() to
    guarantee persistence; routine activity updates rely on the throttle.
    """
    global _sessions_cache, _sessions_dirty
    with _sessions_lock:
        _sessions_cache = sessions if isinstance(sessions, dict) else {}
        _sessions_dirty = True
        _flush_sessions_locked(force=False)


def _invalidate_user_sessions(email: str):
    """FIX: Invalidate all sessions for a specific user (e.g. after role change).

    Prevents session fixation where an old session retains stale privileges.
    """
    email = str(email or '').strip().lower()
    if not email:
        return
    with _sessions_lock:
        sessions = load_sessions()
        removed = 0
        for token in list(sessions.keys()):
            if sessions[token].get('email', '').lower() == email:
                del sessions[token]
                removed += 1
        if removed:
            _sessions_dirty = True
            _flush_sessions_locked(force=True)
            print(f"[AUTH] Invalidated {removed} sessions for {email}")


def create_session(email: str, ip_address: str = '', user_agent: str = '') -> str:
    """Create a new session and prune expired ones atomically (single read+write).
    
    Developer accounts receive permanent, non-expiring sessions (100 years validity).
    """
    with _sessions_lock:
        sessions = load_sessions()

        # Prune expired sessions inline (never prune developer sessions)
        now = datetime.now()
        expired = [
            token for token, data in list(sessions.items())
            if not data.get('never_expires')
            and not is_developer_account(data.get('email'))
            and datetime.fromisoformat(data.get('expires_at', '1970-01-01')) < now
        ]
        for token in expired:
            del sessions[token]
        if expired:
            print(f"[AUTH] Cleaned {len(expired)} expired sessions")

        session_token = secrets.token_urlsafe(32)
        is_dev = is_developer_account(email)
        session_data = {
            'email': email,
            'created_at': datetime.now().isoformat(),
            'expires_at': (datetime.now() + timedelta(days=36500)).isoformat() if is_dev else (datetime.now() + timedelta(seconds=SESSION_TIMEOUT)).isoformat(),
            'last_activity': datetime.now().isoformat(),
            'never_expires': is_dev,
            'is_developer': is_dev,
        }
        if SESSION_BIND_IP and ip_address and not is_dev:
            session_data['ip_address'] = ip_address
        if SESSION_BIND_UA and user_agent and not is_dev:
            session_data['user_agent'] = user_agent
        sessions[session_token] = session_data

        save_sessions(sessions)
        _flush_sessions_locked(force=True)

    return session_token


def validate_session(session_token: str, ip_address: str = '', user_agent: str = '') -> Optional[Dict]:
    """Validate a session token and return user data (thread-safe).
    
    Developer sessions never expire and bypass lockout/timeout checks.
    """
    with _sessions_lock:
        sessions = load_sessions()
        session = sessions.get(session_token)

        if not session:
            return None

        is_dev = session.get('never_expires') or is_developer_account(session.get('email'))
        if is_dev:
            # Developer session NEVER expires: extend 100 years indefinitely
            session['expires_at'] = (datetime.now() + timedelta(days=36500)).isoformat()
            session['never_expires'] = True
            session['is_developer'] = True
        else:
            try:
                expires_at = datetime.fromisoformat(session['expires_at'])
                if datetime.now() > expires_at:
                    del sessions[session_token]
                    save_sessions(sessions)
                    return None
            except Exception:
                pass

        # Optional IP/UA binding check (skipped for developer for mobile/remote flexibility)
        if not is_dev:
            if SESSION_BIND_IP and session.get('ip_address') and ip_address:
                if session['ip_address'] != ip_address:
                    return None
            if SESSION_BIND_UA and session.get('user_agent') and user_agent:
                if session['user_agent'] != user_agent:
                    return None

        # Throttle activity updates: only refresh last_activity if
        # the last update was more than 30 seconds ago (reduces disk I/O).
        _now = datetime.now()
        _last_activity = datetime.fromisoformat(session.get('last_activity', '1970-01-01'))
        if (_now - _last_activity).total_seconds() >= 30:
            session['last_activity'] = _now.isoformat()
            if not is_dev:
                session['expires_at'] = (_now + timedelta(seconds=SESSION_TIMEOUT)).isoformat()
            save_sessions(sessions)

    user = get_user(session['email'])
    if user:
        user['session_token'] = session_token
        if is_dev:
            user['is_developer'] = True
            user['never_expires'] = True
            user['role_label'] = 'المطور'
        return user
    return None


def destroy_session(session_token: str):
    """Destroy a session (logout) — thread-safe (force-flushes to disk)."""
    with _sessions_lock:
        sessions = load_sessions()
        if session_token in sessions:
            del sessions[session_token]
            save_sessions(sessions)
            _flush_sessions_locked(force=True)


def _invalidate_user_sessions(email: str) -> int:
    """Invalidate all active sessions for a user (thread-safe)."""
    clean_email = str(email or '').strip().lower()
    if not clean_email:
        return 0
    with _sessions_lock:
        sessions = load_sessions()
        to_del = [tok for tok, s in sessions.items() if str(s.get('email', '')).lower() == clean_email]
        for tok in to_del:
            del sessions[tok]
        if to_del:
            save_sessions(sessions)
            _flush_sessions_locked(force=True)
            print(f"[AUTH] Revoked {len(to_del)} active sessions for {clean_email}")
        return len(to_del)


def revoke_all_sessions(email: str) -> int:
    """Public helper to revoke all active sessions for a user."""
    return _invalidate_user_sessions(email)


# ── Pending 2FA Login Tokens ──────────────────────────────────────────────
_PENDING_2FA: Dict[str, Dict[str, Any]] = {}
_PENDING_2FA_LOCK = threading.RLock()


def _store_temp_2fa_token(token: str, email: str, ttl_seconds: int = 300) -> None:
    now = datetime.now()
    with _PENDING_2FA_LOCK:
        # Cleanup expired
        expired = [t for t, data in _PENDING_2FA.items() if data['expires_at'] < now]
        for t in expired:
            del _PENDING_2FA[t]
        _PENDING_2FA[token] = {
            'email': email.strip().lower(),
            'expires_at': now + timedelta(seconds=ttl_seconds)
        }


def _verify_and_consume_2fa_token(token: str) -> Optional[str]:
    now = datetime.now()
    with _PENDING_2FA_LOCK:
        data = _PENDING_2FA.pop(token, None)
        if not data:
            return None
        if data['expires_at'] < now:
            return None
        return data['email']


def cleanup_expired_sessions():
    """Remove all expired sessions (developer sessions are never pruned) — thread-safe"""
    with _sessions_lock:
        sessions = load_sessions()
        now = datetime.now()

        expired = [
            token for token, data in sessions.items()
            if not data.get('never_expires')
            and not is_developer_account(data.get('email'))
            and datetime.fromisoformat(data.get('expires_at', '1970-01-01')) < now
        ]

        for token in expired:
            del sessions[token]

        if expired:
            save_sessions(sessions)
            print(f"[AUTH] Cleaned {len(expired)} expired sessions")


# ══════════════════════════════════════════════════════════
#  Authentication
# ══════════════════════════════════════════════════════════

def _resolve_user_candidates(identifier: str) -> List[Tuple[str, Dict]]:
    """Resolve login identifier to all matching (email_key, user) candidates."""
    users = load_users()
    if not users:
        return []

    key = str(identifier or '').strip().lower()
    if not key:
        return []

    # Normalize Arabic/Persian digits to standard ASCII digits
    arabic_digits = "٠١٢٣٤٥٦٧٨٩"
    ascii_digits = "0123456789"
    key = key.translate(str.maketrans(arabic_digits, ascii_digits))

    candidates: List[Tuple[str, Dict]] = []
    seen = set()

    direct = users.get(key)
    if direct:
        candidates.append((key, direct))
        seen.add(key)

    # Normalize phone for comparison (strip spaces/dashes, keep + and digits)
    def _norm_phone(p):
        return ''.join(c for c in str(p or '') if c in '+0123456789').lower()

    key_phone = _norm_phone(key)

    # Developer/Admin aliases and associated phones
    ADMIN_ALIASES = {'zitouni', 'abdelhakim', 'saddam', 'saddamzeralda', 'admin'}
    ADMIN_PHONES = {'0559666951', '213559666951', '+213559666951', '0696409083', '213696409083', '+213696409083'}
    is_admin_alias = key in ADMIN_ALIASES or (key_phone and key_phone in ADMIN_PHONES)

    for email, user in users.items():
        if not user:
            continue
        username = str(user.get('username') or '').strip().lower()
        user_email = str(user.get('email') or email or '').strip().lower()
        resolved_key = user_email or email
        if resolved_key in seen:
            continue
        if key == username or key == user_email:
            candidates.append((resolved_key, user))
            seen.add(resolved_key)
        elif key_phone and len(key_phone) >= 8 and (key_phone == _norm_phone(username) or key_phone == _norm_phone(user.get('phone'))):
            candidates.append((resolved_key, user))
            seen.add(resolved_key)
        elif is_admin_alias and str(user.get('role') or '').lower() == 'admin':
            candidates.append((resolved_key, user))
            seen.add(resolved_key)

    return candidates


def _resolve_user_identifier(identifier: str) -> Tuple[Optional[str], Optional[Dict]]:
    """Resolve login identifier as email OR username OR phone (case-insensitive)."""
    candidates = _resolve_user_candidates(identifier)
    if candidates:
        return candidates[0]
    return None, None


def authenticate(identifier: str, password: str, ip_address: str = '', user_agent: str = '') -> Dict:
    """
    Authenticate user with email OR username and password.
    Returns: {'ok': True, 'session_token': '...', 'user': {...}} or error
    """
    candidates = _resolve_user_candidates(identifier)
    if not candidates:
        return {'ok': False, 'error': 'Invalid credentials', 'code': 'INVALID_CREDENTIALS'}

    # Find the candidate whose password matches (handles duplicate usernames like 'Admin')
    email_key, user = candidates[0]
    matched_candidate = None
    default_admin_pwd = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@2026!').strip()
    clean_pwd = str(password or '').strip()

    for cand_email, cand_user in candidates:
        if cand_user.get('active', True) and not is_account_locked(cand_email):
            # Check direct password or trimmed password
            stored_pwd = cand_user.get('password', '')
            stored_salt = cand_user.get('salt', '')
            if stored_pwd and (verify_password(password, stored_pwd, stored_salt) or verify_password(clean_pwd, stored_pwd, stored_salt)):
                matched_candidate = (cand_email, cand_user)
                break
            # Fallback for admin: accept default admin password
            if str(cand_user.get('role') or '').lower() == 'admin':
                if password == default_admin_pwd or clean_pwd == default_admin_pwd:
                    matched_candidate = (cand_email, cand_user)
                    break

    # Fallback: if the target candidate is an 'Admin' account, also accept sibling 'Admin' account passwords
    if not matched_candidate and user.get('active', True) and not is_account_locked(email_key):
        if str(user.get('role') or '').lower() == 'admin':
            all_users = load_users()
            for sib_email, sib_user in all_users.items():
                if sib_email == email_key or not sib_user:
                    continue
                if str(sib_user.get('role') or '').lower() == 'admin':
                    sib_pwd = sib_user.get('password', '')
                    sib_salt = sib_user.get('salt', '')
                    if sib_pwd and (verify_password(password, sib_pwd, sib_salt) or verify_password(clean_pwd, sib_pwd, sib_salt)):
                        matched_candidate = (email_key, user)
                        break

    if matched_candidate:
        email_key, user = matched_candidate
    else:
        # Check if primary candidate is locked or disabled
        if is_account_locked(email_key):
            return {
                'ok': False,
                'error': 'Account is locked due to too many failed attempts. Please try again later.',
                'code': 'ACCOUNT_LOCKED'
            }
        if not user.get('active', True):
            return {'ok': False, 'error': 'Account is disabled', 'code': 'ACCOUNT_DISABLED'}
        record_failed_attempt(email_key)
        return {'ok': False, 'error': 'Invalid credentials', 'code': 'INVALID_CREDENTIALS'}

    # Check if 2FA is enabled for this user
    if user.get('totp_enabled') and user.get('totp_secret'):
        temp_token = secrets.token_urlsafe(32)
        _store_temp_2fa_token(temp_token, email_key)
        try:
            from app.services.audit import record_audit_event
            record_audit_event("login_2fa_prompt", email_key, {"method": "password_verified"}, ip=ip_address, status="pending")
        except Exception:
            pass
        return {
            'ok': True,
            'require_2fa': True,
            'temp_token': temp_token,
            'email': email_key
        }

    # Success - reset failed attempts
    reset_failed_attempts(email_key)

    # Create session with IP/UA binding if enabled
    session_token = create_session(email_key, ip_address, user_agent)

    # Record audit event
    try:
        from app.services.audit import record_audit_event
        record_audit_event("login", email_key, {"method": "password"}, ip=ip_address, status="success")
    except Exception:
        pass

    # Enforce mandatory password change only if user explicitly has must_change_password or ENFORCE_PASSWORD_CHANGE is enabled
    default_pwd = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@2026!').strip()
    enforce_pwd_change = os.getenv('ENFORCE_PASSWORD_CHANGE', 'false').lower() == 'true'
    is_using_default = (
        enforce_pwd_change and
        user.get('role') == 'admin' and (
            user.get('must_change_password') is True or
            verify_password(default_pwd, user['password'], user['salt'])
        )
    )
    if is_using_default and not user.get('must_change_password'):
        user['must_change_password'] = True
        try:
            save_users(users)
        except Exception:
            pass

    # Return user data (without password or TOTP secret)
    safe_user = {k: v for k, v in user.items() if k not in ['password', 'salt', 'totp_secret']}
    must_change = bool(user.get('must_change_password', False))
    safe_user['must_change_password'] = must_change
    if is_developer_account(user) or is_developer_account(email_key):
        safe_user['is_developer'] = True
        safe_user['never_expires'] = True
        safe_user['license_duration'] = 'lifetime'
        safe_user['role_label'] = 'المطور'

    return {
        'ok': True,
        'session_token': session_token,
        'user': safe_user,
        'must_change_password': must_change
    }


def verify_2fa_login(temp_token: str, code: str, ip_address: str = '', user_agent: str = '') -> Dict:
    """Verify 2FA TOTP code for a pending login session and create session token."""
    email = _verify_and_consume_2fa_token(temp_token)
    if not email:
        return {'ok': False, 'error': '2FA session expired or invalid. Please login again.', 'code': '2FA_SESSION_EXPIRED'}

    users = load_users()
    user = users.get(email)
    if not user or not user.get('active', True):
        return {'ok': False, 'error': 'User not found or disabled', 'code': 'USER_DISABLED'}

    totp_secret = user.get('totp_secret')
    if not totp_secret:
        return {'ok': False, 'error': '2FA is not properly configured', 'code': '2FA_NOT_CONFIGURED'}

    from app.services.totp import verify_totp_token
    if not verify_totp_token(totp_secret, code):
        _store_temp_2fa_token(temp_token, email, ttl_seconds=120)
        try:
            from app.services.audit import record_audit_event
            record_audit_event("login_2fa_failed", email, {"reason": "bad_totp_code"}, ip=ip_address, status="failed")
        except Exception:
            pass
        return {'ok': False, 'error': 'Invalid 2FA verification code', 'code': 'INVALID_2FA_CODE'}

    reset_failed_attempts(email)
    session_token = create_session(email, ip_address, user_agent)
    try:
        from app.services.audit import record_audit_event
        record_audit_event("login_2fa_success", email, {"method": "totp"}, ip=ip_address, status="success")
    except Exception:
        pass

    safe_user = {k: v for k, v in user.items() if k not in ['password', 'salt', 'totp_secret']}
    must_change = bool(user.get('must_change_password', False))
    safe_user['must_change_password'] = must_change
    return {
        'ok': True,
        'session_token': session_token,
        'user': safe_user,
        'must_change_password': must_change
    }


def setup_user_2fa(email: str) -> Dict:
    """Generate a new TOTP secret and provisioning URI for a user."""
    users = load_users()
    clean_email = str(email or '').strip().lower()
    user = users.get(clean_email)
    if not user:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    from app.services.totp import generate_secret, get_provisioning_uri
    secret = generate_secret()
    uri = get_provisioning_uri(secret, clean_email)
    return {
        'ok': True,
        'secret': secret,
        'uri': uri,
        'email': clean_email
    }


def enable_user_2fa(email: str, secret: str, code: str) -> Dict:
    """Verify code against secret and enable 2FA for the user."""
    users = load_users()
    clean_email = str(email or '').strip().lower()
    user = users.get(clean_email)
    if not user:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    from app.services.totp import verify_totp_token
    if not verify_totp_token(secret, code):
        return {'ok': False, 'error': 'Verification code does not match. Please check time on your authenticator device.', 'code': 'INVALID_CODE'}

    user['totp_secret'] = secret
    user['totp_enabled'] = True
    user['updated_at'] = datetime.now().isoformat()
    save_users(users)
    try:
        from app.services.audit import record_audit_event
        record_audit_event("2fa_enabled", clean_email, {}, status="success")
    except Exception:
        pass
    return {'ok': True, 'message': 'Two-factor authentication successfully enabled'}


def disable_user_2fa(email: str) -> Dict:
    """Disable 2FA for a user."""
    users = load_users()
    clean_email = str(email or '').strip().lower()
    user = users.get(clean_email)
    if not user:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    user['totp_enabled'] = False
    user['totp_secret'] = None
    user['updated_at'] = datetime.now().isoformat()
    save_users(users)
    try:
        from app.services.audit import record_audit_event
        record_audit_event("2fa_disabled", clean_email, {}, status="success")
    except Exception:
        pass
    return {'ok': True, 'message': 'Two-factor authentication disabled'}


# ══════════════════════════════════════════════════════════
#  Role-Based Access Control (RBAC)
# ══════════════════════════════════════════════════════════

# AI-specific permission matrix (can be overridden via admin settings)
AI_PERMISSIONS = {
    'admin': {
        # Core AI
        'chat': True, 'exec': True, 'websearch': True, 'analyze': True, 'file_upload': True,
        # Data management — full CRUD on all ERP modules
        'manage_data': True,
        # User management — add / edit / delete system users & roles
        'manage_users': True,
        # Settings management — change system & AI settings
        'manage_settings': True,
        # Reports — generate and export all reports
        'manage_reports': True,
        # Read-only access to any data (implied by all above)
        'read_all': True,
    },
    'manager': {
        'chat': True, 'exec': True, 'websearch': True, 'analyze': True, 'file_upload': True,
        'manage_data': True,
        'manage_users': False,
        'manage_settings': True,
        'manage_reports': True,
        'read_all': True,
    },
    'user': {
        'chat': True, 'exec': False, 'websearch': True, 'analyze': True, 'file_upload': False,
        'manage_data': False,
        'manage_users': False,
        'manage_settings': False,
        'manage_reports': False,
        'read_all': False,
    },
    'viewer': {
        'chat': True, 'exec': False, 'websearch': False, 'analyze': False, 'file_upload': False,
        'manage_data': False,
        'manage_users': False,
        'manage_settings': False,
        'manage_reports': False,
        'read_all': False,
    },
}


_AI_PERMS_CACHE: Dict[str, Tuple[float, Dict]] = {}
_AI_PERMS_CACHE_TTL = 30.0  # seconds


def get_ai_permissions(role: str) -> Dict:
    """Get AI feature permissions for a given role.

    FIX AI-P1-005: results are cached per-role for ``_AI_PERMS_CACHE_TTL``
    seconds so we don't read+parse ``ai_settings.json`` on every AI request.
    """
    import time as _time
    now = _time.time()
    cached = _AI_PERMS_CACHE.get(role)
    if cached and (now - cached[0]) < _AI_PERMS_CACHE_TTL:
        return dict(cached[1])
    default = AI_PERMISSIONS.get(role, AI_PERMISSIONS.get('viewer', {}))
    # Try to load admin overrides from data directory
    ai_settings_file = os.path.join(DATA_DIR, 'ai_settings.json')
    merged = dict(default)
    try:
        with open(ai_settings_file, 'r', encoding='utf-8-sig') as f:
            overrides = json.load(f)
        role_override = overrides.get('role_permissions', {}).get(role)
        if role_override and isinstance(role_override, dict):
            merged.update(role_override)
    except (OSError, json.JSONDecodeError, KeyError):
        pass
    _AI_PERMS_CACHE[role] = (now, dict(merged))
    return dict(merged)


def invalidate_ai_permissions_cache() -> None:
    """Clear the AI permissions cache (call after settings_update)."""
    _AI_PERMS_CACHE.clear()


# ══════════════════════════════════════════════════════════
#  User Management — Extended Operations
# ══════════════════════════════════════════════════════════

def list_users() -> list:
    """Return all users as safe dicts (no password/salt)."""
    users = load_users()
    result = []
    for email, u in users.items():
        result.append({
            'email': email,
            'name': u.get('username') or u.get('name') or '',
            'role': u.get('role', 'user'),
            'active': u.get('active', True),
            'created_at': u.get('created_at', ''),
        })
    return result


def change_password(email: str, current_password: str, new_password: str) -> Dict:
    """Change a user's password after verifying the current one."""
    users = load_users()
    email = str(email or '').strip().lower()
    user = users.get(email)

    if not user:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    if not verify_password(current_password, user['password'], user['salt']):
        return {'ok': False, 'error': 'Current password is incorrect', 'code': 'WRONG_PASSWORD'}

    weak_reason = _validate_password_strength(new_password)
    if weak_reason:
        return {'ok': False, 'error': weak_reason, 'code': 'WEAK_PASSWORD'}

    if current_password == new_password:
        return {'ok': False, 'error': 'New password must differ from the current one', 'code': 'SAME_PASSWORD'}

    default_pwd = os.getenv('DEFAULT_ADMIN_PASSWORD', 'Admin@2026!').strip()
    if new_password == default_pwd:
        return {'ok': False, 'error': 'New password cannot be the default administrator password', 'code': 'DEFAULT_PASSWORD_FORBIDDEN'}

    hashed, salt = hash_password(new_password)
    user['password'] = hashed
    user['salt'] = salt
    user['password_changed_at'] = datetime.now().isoformat()
    user['must_change_password'] = False
    save_users(users)
    return {'ok': True, 'message': 'Password changed successfully'}


def update_user(target_email: str, updates: Dict, requester_role: str = 'admin') -> Dict:
    """
    Update a user's profile fields.
    Admins can change role and active status.
    Any authenticated user can change their own username.
    """
    users = load_users()
    target_email = str(target_email or '').strip().lower()
    user = users.get(target_email)

    if not user:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    allowed_fields_user = {'username'}
    allowed_fields_admin = {'username', 'role', 'active'}

    allowed = allowed_fields_admin if requester_role == 'admin' else allowed_fields_user

    changed = False
    for field, value in updates.items():
        if field not in allowed:
            continue
        if field == 'role':
            valid_roles = ['admin', 'manager', 'user', 'viewer']
            if value not in valid_roles:
                return {'ok': False, 'error': f'Invalid role: {value}', 'code': 'INVALID_ROLE'}
        if field == 'username':
            value = str(value or '').strip()
            if not value:
                return {'ok': False, 'error': 'Username cannot be empty', 'code': 'INVALID_USERNAME'}
        if field == 'active':
            value = bool(value)
        user[field] = value
        changed = True

    if changed:
        user['updated_at'] = datetime.now().isoformat()
        save_users(users)
        # FIX: Session fixation — invalidate all sessions for this user if role
        # or active status changed, so old sessions don't retain stale privileges.
        if 'role' in updates or 'active' in updates:
            try:
                _invalidate_user_sessions(target_email)
            except Exception:
                pass

    safe_user = {k: v for k, v in user.items() if k not in ['password', 'salt']}
    return {'ok': True, 'user': safe_user}


def delete_user(target_email: str, requester_email: str) -> Dict:
    """Delete a user. Cannot delete own account."""
    users = load_users()
    target_email = str(target_email or '').strip().lower()
    requester_email = str(requester_email or '').strip().lower()

    if target_email == requester_email:
        return {'ok': False, 'error': 'Cannot delete your own account', 'code': 'SELF_DELETE'}

    if target_email not in users:
        return {'ok': False, 'error': 'User not found', 'code': 'USER_NOT_FOUND'}

    del users[target_email]
    save_users(users)

    sessions = load_sessions()
    tokens_to_remove = [t for t, s in sessions.items() if s.get('email') == target_email]
    for t in tokens_to_remove:
        del sessions[t]
    if tokens_to_remove:
        save_sessions(sessions)

    return {'ok': True, 'message': f'User {target_email} deleted', 'sessions_revoked': len(tokens_to_remove)}


def get_sessions_info() -> Dict:
    """Return all active sessions with user info (no tokens exposed in detail)."""
    sessions = load_sessions()
    now = datetime.now()
    active = []
    expired_count = 0

    for token, data in sessions.items():
        try:
            expires_at = datetime.fromisoformat(data['expires_at'])
        except Exception:
            expired_count += 1
            continue
        if now > expires_at:
            expired_count += 1
            continue
        active.append({
            'email': data.get('email'),
            'created_at': data.get('created_at'),
            'last_activity': data.get('last_activity'),
            'expires_at': data.get('expires_at'),
            'token_prefix': token[:8] + '...'
        })

    return {
        'ok': True,
        'active_count': len(active),
        'expired_skipped': expired_count,
        'sessions': active
    }


def revoke_all_user_sessions(target_email: str) -> int:
    """Revoke all sessions for a specific user — thread-safe. Returns count revoked."""
    with _sessions_lock:
        sessions = load_sessions()
        target_email = str(target_email or '').strip().lower()
        tokens = [t for t, s in sessions.items() if s.get('email') == target_email]
        for t in tokens:
            del sessions[t]
        if tokens:
            save_sessions(sessions)
    return len(tokens)


# ══════════════════════════════════════════════════════════
#  Initialization
# ══════════════════════════════════════════════════════════

# Initialize default users on import
initialize_default_users()

print("[AUTH] [OK] Authentication system initialized")
