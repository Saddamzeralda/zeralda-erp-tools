#!/usr/bin/env python3
"""
Reset admin password to: Admin@2026!
Run this script locally to fix authentication issues.
"""

import json
import os
import sys
import hashlib
import secrets

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
PBKDF2_ITERATIONS = 260000  # Must match auth.py

def hash_password(password: str, salt: bytes = None) -> tuple:
    """Hash password using PBKDF2-HMAC-SHA256"""
    if salt is None:
        salt = secrets.token_bytes(32)
    
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        PBKDF2_ITERATIONS
    )
    return hashed.hex(), salt.hex()

def reset_admin_password():
    """Reset admin password"""
    new_password = 'Admin@2026!'
    
    # Load users
    users = {}
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, 'r') as f:
                users = json.load(f)
        except Exception as e:
            print(f"Error loading users: {e}")
            return False
    
    # Update admin user
    admin_email = 'saddamzeralda@gmail.com'
    if admin_email not in users:
        print(f"Admin user not found: {admin_email}")
        return False
    
    # Hash new password
    hashed_pwd, salt = hash_password(new_password)
    
    # Update user
    users[admin_email]['password'] = hashed_pwd
    users[admin_email]['salt'] = salt
    users[admin_email]['failed_attempts'] = 0
    users[admin_email]['locked_until'] = None
    
    # Save users
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(USERS_FILE, 'w') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)
        print(f"✅ Password has been reset!")
        print(f"📧 Email: {admin_email}")
        print(f"🔑 Password: {new_password}")
        return True
    except Exception as e:
        print(f"❌ Error saving users: {e}")
        return False

if __name__ == '__main__':
    if reset_admin_password():
        print("\n✅ Admin account is ready!")
    else:
        print("\n❌ Failed to reset password")
        sys.exit(1)
