import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import auth

USERS_FILE = ROOT / 'data' / 'users.json'
NEW_PASSWORD = os.getenv('ZERALDA_ADMIN_RESET_PASSWORD', 'Admin@2026!')
TARGET_EMAIL = 'admin@zeralda.dz'


def main() -> int:
    if not USERS_FILE.exists():
        print('[RESET] users.json not found')
        return 1

    with USERS_FILE.open('r', encoding='utf-8') as f:
        users = json.load(f)

    user = users.get(TARGET_EMAIL)
    if not user:
        print(f'[RESET] admin user {TARGET_EMAIL} not found')
        return 2

    pwd_hash, salt = auth.hash_password(NEW_PASSWORD)
    user['password'] = pwd_hash
    user['salt'] = salt
    user['failed_attempts'] = 0
    user['locked_until'] = None
    users[TARGET_EMAIL] = user

    with USERS_FILE.open('w', encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

    print('[RESET] Admin password updated successfully')
    print(f'[RESET] Login email: {TARGET_EMAIL}')
    print(f'[RESET] Login password: {NEW_PASSWORD}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
