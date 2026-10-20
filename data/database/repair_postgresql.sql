-- PostgreSQL repair mode for Zeralda ERP
-- Safe mode: keeps existing data, only creates/fixes required objects.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) storage_items for /api/storage
CREATE TABLE IF NOT EXISTS storage_items (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE storage_items
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_storage_items_updated_at ON storage_items (updated_at DESC);

DROP TRIGGER IF EXISTS trg_storage_items_updated_at ON storage_items;
CREATE TRIGGER trg_storage_items_updated_at
BEFORE UPDATE ON storage_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2) app_users for /api/auth/login and user management
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    full_name TEXT NOT NULL DEFAULT 'Services User',
    role TEXT NOT NULL DEFAULT 'administrator',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'Services User',
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'administrator',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_username ON app_users (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_users_email ON app_users (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users (active);

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 3) password recovery support
CREATE TABLE IF NOT EXISTS password_recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE password_recovery_codes
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_recovery_user_active
ON password_recovery_codes (user_id, used, expires_at DESC);

-- 4) audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- 5) Ensure admin user exists (idempotent)
INSERT INTO app_users (username, email, full_name, role, active, password_hash)
VALUES (
    'admin',
    'admin@example.com',
    'Services User',
    'administrator',
    TRUE,
    '$2b$12$6YfR9QO6f4y1Xr8Y4eYw7e3m8e6q5H5kO8ZQw2v2H2x9k0LQy5v3a'
)
ON CONFLICT (username) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(app_users.full_name, EXCLUDED.full_name),
    role = COALESCE(app_users.role, EXCLUDED.role),
    active = COALESCE(app_users.active, EXCLUDED.active),
    updated_at = NOW();

COMMIT;
