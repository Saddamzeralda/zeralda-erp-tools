# AGENTS.md — Project Guide for AI Agents

## Project Overview
Zeralda ERP — a FastAPI-based ERP system with JSON/PostgreSQL storage, IndexedDB
client cache, and real-time SSE sync. The storage layer is in `app/services/storage.py`,
HTTP handlers in `app/handlers/store.py`, and client sync in `shared/app_sync.js`.

## Build & Run
```powershell
# Development
$env:ENVIRONMENT="development"
$env:AUTH_DISABLED_IN_DEV="true"
python -m app.main            # or: uvicorn app.app:app --host 127.0.0.1 --port 8080
```

## Test Commands
```powershell
# Start the development server
$env:ENVIRONMENT="development"
$env:AUTH_DISABLED_IN_DEV="true"
python -m app.main            # or: uvicorn app.app:app --host 127.0.0.1 --port 8080
```

## Storage Architecture
- **Server:** `data/shared_store.json` (authoritative, AES-256-GCM encrypted at rest) + optional PostgreSQL `kv_store` table
- **History:** `data/shared_history.json` (deferred 5s flush, debounced, AES-256-GCM encrypted)
- **Undo:** `data/undo_stack.json` (max 200 entries, AES-256-GCM encrypted)
- **Backups:** `data/backups/shared_store-*.json` (keep last 20, AES-256-GCM encrypted)
- **Encryption Service:** `app/services/crypto_storage.py` (AES-256-GCM authenticated encryption with HKDF key derivation, automatic legacy plaintext detection)
- **Client:** IndexedDB via `zeralda_db.js` + in-memory cache + WAL

## Key Design Decisions
- **UNIFIED STORAGE (RADICAL FIX):** `zeralda-settings` is the CANONICAL source for
  companies, activeCompanyId, preferredLanguage, systemCurrency, users, roles, notifications,
  security, etc. The following standalone keys are LEGACY SHADOWS kept in sync for backward
  compat:
  - `zeralda-companies` ← shadow of `zeralda-settings.companies`
  - `zeralda-active-company` ← shadow of `zeralda-settings.activeCompanyId`
  - `preferred-language` / `language` ← shadow of `zeralda-settings.preferredLanguage`
  - `system-currency` ← shadow of `zeralda-settings.systemCurrency`
  - `zeralda-users` ← shadow of `zeralda-settings.users`
  **Server-side:** AI endpoints (`app/handlers/ai.py`, `server.py`) write to
  `zeralda-settings.companies` (canonical) AND `zeralda-companies` (shadow).
  **Client-side:** `settings.html` writes to `zeralda-settings` first (via `saveSettings`),
  then shadows. `ai_chat_widget.js` and `demo_seed_data.js` do the same.
  **Migration:** `storage.migrate_unified_settings()` runs once on startup to merge any
  orphaned standalone key data into `zeralda-settings`. See `storage.py`.
  **NEVER** write to a standalone key without also updating `zeralda-settings`.
- `HISTORY_EXCLUDE_KEYS` in `storage.py` — ephemeral keys (timestamps, zoom, theme)
  are NOT recorded in history. Add new volatile keys here.
- `compact_history()` removes no-op entries (value == old_value) and excluded keys.
- `_sse_drop_notice` publishes directly (not via `_sse_publish`) to avoid recursion.
- `write_store` uses UPSERT per-key (batched 1000) instead of DELETE-all + re-INSERT.
- Client `pullAllToLocalStorage` and `_handleSSEEvent` skip keys with pending local
  writes to prevent data loss (local edits would be clobbered by stale server data).
- `zeralda-last-pull-ts` is wrapped in `beginSync/endSync` so it doesn't sync to server.
- **Company switch flow:** `header_company_switcher.js` saves new `activeCompanyId` → dispatches
  `activeCompanyChanged` → `company_storage.js` shows loading overlay, flushes ZDB+AppSync,
  clears new company's scoped keys from cache, calls `AppSync.pullAllToLocalStorage()` to fetch
  new company data from server, flushes to IndexedDB, then `location.reload()`. On reload,
  `cacheReady()` → `initSalesScopedData()` reads the new company's data from cache.
  Safety timeout of 10s forces reload if pull hangs.
- CSRF protection is enforced via Origin/Referer validation + custom header requirement
  in `app.py` middleware. State-changing methods (POST/PUT/PATCH/DELETE) require either
  an allowed Origin header or a custom header (X-Requested-With/X-Session-Token/Authorization).
  Login and Google OAuth endpoints are exempt (no session yet). Disabled in dev mode.
- Client `_deepMergeObjects` in `app_sync.js` recursively merges nested objects during
  sync (replaces shallow `Object.assign`). Local values win at the leaf level.
- IndexedDB schema uses `DB_VERSION=2` with `onupgradeneeded` migration blocks based on
  `event.oldVersion`. Increment `DB_VERSION` and add a migration block for schema changes.

## Common Pitfalls
- `HTTPException(409, detail={...})` puts the dict in `body["detail"]`, not body root.
- `write_store` invalidates the cache — call `read_store()` after to re-warm it.
- Undo is undoable (redo): `record_change_locked` adds a new stack entry during undo.
- The deferred history flush (5s) means history may lag the store after a crash.
- CSRF middleware blocks POST/PUT/PATCH/DELETE without Origin or custom header in production.
  Always send `X-Requested-With: XMLHttpRequest` from the client for API calls.
- `is_protected_store_key` normalizes Unicode (NFKC + zero-width strip + hyphen normalization)
  before checking against `PROTECTED_STORE_KEYS`. Always use it for store key validation.
- AI endpoints have per-user rate limiting (30 req/min via `AI_RATE_MAX_REQUESTS`).
  Exceeding the limit returns 429 with `code: RATE_LIMITED`.
- Streaming chat has a 60s per-chunk timeout and 300s max duration. Hanging
  streams are automatically terminated.
- SSE has a max subscriber limit (`MAX_SSE_SUBSCRIBERS=50` in server.py).
- `_safe_b64decode` in `ai_file_processor.py` validates size before/after decode.
  Always use it instead of `base64.b64decode` for user-supplied data.
- BroadcastChannel messages in `zeralda_db.js` are validated (structure, key type,
  value serializability) before applying. WAL entries are similarly validated on replay.
- `session_timeout.js` tracks `warningTimerId` to prevent duplicate warning dialogs.
  Always clear it in `resetSessionTimer` and `dismissSessionWarning`.
- **CRITICAL: Company scoping in `_pendingWrites`** — `queueSet` in `app_sync.js` scopes
  the key at queue time (not at flush time). This prevents a race condition where
  `flushPending` would use the wrong `companyId` if the company was switched between
  `queueSet` and `flushPending`. `header_company_switcher.js` also flushes pending
  writes BEFORE changing the company ID (not after) to prevent data contamination.
- **`_pendingWrites` uses scoped keys** (e.g., `invoices-data::companyA`), NOT unscoped
  keys. All checks for `key in _pendingWrites` must use the scoped key. `pullAllToLocalStorage`
  and the SSE handler check `serverKey in _pendingWrites` (not `localKey`).
- **CRITICAL: No `__flushing` markers in `_pendingWrites`** — the old code added
  `_pendingWrites[k + '__flushing'] = true` during flush, which caused infinite chains
  (`key__flushing__flushing__flushing...`) polluting the server store (126 keys!).
  The new code deletes keys from `_pendingWrites` BEFORE sending and re-adds on failure.
  The server also rejects any key containing `__flushing` (see `store.py`).
- **`zeralda-pending-writes::tab-*` keys must NOT be synced to server** — they are
  client-only IndexedDB keys for crash recovery. The old code accidentally synced them.

## KEYGEN System (Activation Keys)
- **Service:** `backend/keygen_service.py` — key generation, verification, revocation, expiry
- **API:** `app/handlers/auth.py` — `/api/auth/login-with-key`, `/api/auth/keygen/*`
- **Config:** `app/handlers/misc.py` — `/api/config/keygen-status`
- **Keys DB:** `data/keys.json` — all activation keys (phone, email, expiry, usage count)
- **Key format:** `KEY-XXXX-XXXX-XXXX` (12 random hex bytes)
- **Desktop Tool:** `tools/keygen_tool.py` — standalone tkinter GUI for key management
  - Launch: `python tools/keygen_tool.py` or `launcher\KeygenTool.cmd`
  - Features: generate, revoke, delete, list, search, export CSV/JSON, expiry dates
- **CLI Tool:** `backend/KEYGEN.py` — command-line keygen (use `--gui` flag for desktop)
- **Login:** `login.html` — "Clé d'activation" tab (shown when keygen_status=enabled)

## License Enforcement System (Developer Rights Protection)
- **Server-side middleware:** `app/app.py` — `license_enforcement` middleware blocks all
  `/api/*` requests (except exempt paths) when license status is "expired" or "invalid".
  Returns 403 with `code: LICENSE_REQUIRED`. Bypassed in dev mode (AUTH_DISABLED_IN_DEV=true).
- **Exempt paths:** `/api/license/*`, `/api/auth/login`, `/api/auth/google`, `/api/config/keygen-status`
- **Server license status:** `app/services/license_service.py` → `get_server_license_status()`
  Checks: (1) any active license in DB? (2) trial period active? (3) grace period active?
  State stored in `data/license_server_state.json` (trialStart, lastHeartbeat).
- **Heartbeat (phone-home):** `POST /api/license/heartbeat` — client sends periodic heartbeats
  (every 5 min via `license_auto.js`). Server records lastSeen in `license_server_state.json`.
  Grace period is calculated from lastHeartbeat.
- **Server status:** `GET /api/license/server-status` — public endpoint returning current status.
- **Integrity check:** `license_service.check_integrity()` — SHA-256 hashes of 9 critical files
  (Python + JS) stored in `data/license_integrity.json`. Checked at startup (strict in production).
  Use `license_service.reset_integrity()` after intentional updates.
- **Client-side protection:** `shared/license_auto.js` — auto-loader injected into all HTML pages.
  Dynamically loads `license_crypto.js` + `license_manager.js` + `license_guard.js`, calls
  `LicenseGuard.protect()`, sends heartbeats, verifies script integrity.
- **Protected pages:** All module pages + dashboard + settings (11 HTML files).
  Exempt: license.html, login.html, oauth_callback.html, index.html, restore_backup.html.
- **Trial config:** `LICENSE_TRIAL_DAYS` (default 14), `LICENSE_GRACE_HOURS` (default 72) in .env
- **Key file paths are ABSOLUTE** (relative to project root via `Path(__file__).resolve()`),
  so keys are found regardless of CWD. Files: `data/license_private_key.pem`,
  `data/license_public_key.pem`, `data/licenses.json`, `data/license_server_state.json`.
- **Lock is RLock** (re-entrant) to allow `revoke_license_by_keygen_key` to call other locked functions.

## Unified Keygen + License System (Bridge)
- **Concept:** keygen keys (KEY-XXXX, phone-based auth) are now linked to RSA-signed licenses
  (ZERALDA-XXXX, machine-bound protection). Generating a keygen key automatically creates a
  linked license. Revoking a keygen key also revokes the linked license.
- **Bridge functions in `license_service.py`:**
  - `create_license_for_key(keygen_key, phone, ...)` — creates an RSA license linked to a keygen key
  - `find_license_by_keygen_key(keygen_key)` — finds the license record for a keygen key
  - `find_license_by_phone(phone)` — finds the license record by phone number
  - `activate_license_for_hw(license_key, hw_fp, hw_id)` — binds a license to hardware (first activation)
  - `revoke_license_by_keygen_key(keygen_key)` — revokes the license linked to a keygen key
- **keygen_service.py changes:**
  - `generate_key()` now accepts `create_linked_license=True` (default) — auto-creates RSA license
  - `revoke_key()` now also revokes the linked license
  - `list_unified()` — lists keygen keys WITH linked license info (licenseKey, hwBound, etc.)
  - `get_license_for_key(keygen_key)` — returns the linked license info
- **login-with-key endpoint:** `POST /api/auth/login-with-key` now accepts `hwFingerprint` + `hwId`.
  When provided, it activates the linked license on the user's machine and returns `signedPayload`
  for client-side verification. This bridges authentication (keygen) with protection (license).
- **New admin endpoints:**
  - `GET /api/keys/list-unified` — unified view of keys + linked licenses
  - `GET /api/keys/license/{key}` — get linked license for a keygen key
- **KEYGEN.py CLI:** options 7 (list unified) and 8 (show linked license) added.
- **keygen_tool.py GUI:** `generate_key` and `revoke_key` now create/revoke linked licenses.
  `list_all_keys()` includes `licenseKey` and `hwBound` fields.

## Usage Analytics System
- **Tracking:** `license_service.log_usage_event()` logs activation, heartbeat, revocation,
  tampering, hw_mismatch, and max_devices events to `data/license_usage_log.json`.
- **Device registry:** Tracks unique devices by hwFingerprint with firstSeen, lastSeen,
  eventCount, licenseKeys, ipAddresses, and phone.
- **Suspicious activity detection:** `get_usage_stats()` detects:
  - `multi_license_per_device` — one device using multiple licenses (medium)
  - `multi_device_per_license` — one license on more devices than maxDevices allows (high)
  - `tampering_detected` — integrity check failures in last 7 days (high)
  - `hw_mismatch_attempts` — HW mismatch events in last 24h (medium)
- **Admin endpoints:** `GET /api/license/usage-stats`, `POST /api/license/clear-usage-log`
- **Dashboard:** `usage_dashboard.html` — admin UI with summary cards, device list,
  suspicious alerts, license summary, and recent events (auto-refresh 30s).
- **Automatic logging:** `activate_license_for_hw` logs "activation", `revoke_license`
  logs "revocation", `record_heartbeat` logs "heartbeat", `check_integrity` failure
  in `main.py` logs "tampering".

## Code Obfuscation (Developer Rights Protection)
- **JS Obfuscator:** `tools/obfuscate_js.py` — base64 + Function constructor wrapper.
  Obfuscates 4 files: `license_crypto.js`, `license_manager.js`, `license_guard.js`,
  `license_auto.js`. Originals backed up to `tools/_js_originals/`.
  Restore: `python tools/obfuscate_js.py --restore`
- **Python Obfuscator:** `tools/obfuscate_py.py` — marshal + base64 + integrity hash.
  Obfuscates 3 files: `app/services/license_service.py`, `app/handlers/license.py`,
  `backend/keygen_service.py`. Originals backed up to `tools/_py_originals/`.
  Restore: `python tools/obfuscate_py.py --restore`
- **Integrity check:** SHA-256 hashes of 9 critical files in `data/license_integrity.json`.
  Re-register after intentional changes: `license_service.reset_integrity()`.
  Tampering events logged to usage analytics on check failure.
- **IMPORTANT:** After modifying any obfuscated file:
  1. Restore originals: `python tools/obfuscate_py.py --restore` (or `--restore` for JS)
  2. Make changes
  3. Re-obfuscate: `python tools/obfuscate_py.py` (or run JS obfuscator)
  4. Re-register integrity: `python -c "import sys; sys.path.insert(0,'.'); from app.services import license_service; license_service.reset_integrity()"`
- **Cython Native Compilation:** `tools/compile_protection_cython.py` — compiles critical
  Python protection files (`license_service.py`, `keygen_service.py`, `handlers/license.py`,
  `crypto_storage.py`) into native C extension libraries (`.pyd` on Windows, `.so` on Linux).
  Strips source code, prevents decompilation, and enhances execution performance.
  Commands:
  - Compile: `python tools/compile_protection_cython.py`
  - Restore: `python tools/compile_protection_cython.py --restore`
  - Status:  `python tools/compile_protection_cython.py --status`
- **Protection Toolkit:** `tools/protection_toolkit.py` — unified CLI for all protection features.
  Launch: `python tools/protection_toolkit.py` or double-click `START_TOOLKIT.cmd`.
  Features: keygen+license management, analytics dashboard, obfuscation (JS+Python),
  Cython compilation (options 19-21), integrity check, and full integration test suite.

## Installer
- **Source:** `installer/Zeralda_ERP_Setup.iss` (Inno Setup 6.2+)
- **Build:** `iscc.exe installer\Zeralda_ERP_Setup.iss` → `installer\dist\Zeralda_ERP_Setup_v1.0.0.exe`
- **Bundled Python:** `tools/python-embed/` → installed to `{app}\python\` (no system Python required)
- **Server:** Uses FastAPI `app.main` (preferred), falls back to legacy `server.py`
- **Post-install:** `installer/scripts/bootstrap.ps1` installs requirements.txt + creates launcher VBS/CMD
- **Launcher:** `launcher/Start_Tray_Silent.vbs` — starts server in background + opens browser URL directly
- **Auto-start:** Enabled by default — shortcut in `{commonstartup}` runs VBS on Windows boot
- **Desktop shortcut:** Opens ERP URL directly in default browser (no tray icon, no console)
- **Protection Toolkit:** `START_TOOLKIT.cmd` — Start Menu shortcut for admin tools
- **Uninstall:** `installer/scripts/uninstall_cleanup.ps1` stops processes, asks to keep user data
- **Launcher scripts updated** to prefer `app.main` over `server.py`: `tray.pyw`, `Launch_ERP.ps1`,
  `Start_Server_Silent.vbs`, `Server_Watchdog.ps1`
- **Removed:** `launcher/KeygenTool.cmd` and `launcher/Zeralda_ERP_Launcher.lnk` (replaced by
  `START_TOOLKIT.cmd` + Protection Toolkit)
