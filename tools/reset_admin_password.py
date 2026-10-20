import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import auth

USERS_FILE = ROOT / 'data' / 'users.json'
NEW_PASSWORD = os.getenv('ZERALDA_ADMIN_RESET_PASSWORD', 'Admin@2026!')
def find_admin_email(users: dict) -> str:
    # 1. CLI argument if passed
    if len(sys.argv) > 1 and "@" in sys.argv[1]:
        return sys.argv[1].strip()
    # 2. Match any user with role == 'admin'
    for email, u in users.items():
        if isinstance(u, dict) and u.get("role") == "admin":
            return email
    # 3. Known fallback defaults
    for default in ("saddamzeralda@gmail.com", "admin@zeralda.dz"):
        if default in users:
            return default
    return "saddamzeralda@gmail.com"


def main() -> int:
    if not USERS_FILE.exists():
        print("[RESET] users.json not found")
        return 1

    with USERS_FILE.open("r", encoding="utf-8") as f:
        users = json.load(f)

    target_email = find_admin_email(users)
    user = users.get(target_email)
    if not user:
        print(f"[RESET] Admin user '{target_email}' not found in users.json")
        return 2

    pwd_hash, salt = auth.hash_password(NEW_PASSWORD)
    user["password"] = pwd_hash
    user["salt"] = salt
    user["failed_attempts"] = 0
    user["locked_until"] = None
    users[target_email] = user

    with USERS_FILE.open("w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

    print("[RESET] Admin password updated successfully")
    print(f"[RESET] Login email:    {target_email}")
    print(f"[RESET] Login password: {NEW_PASSWORD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

