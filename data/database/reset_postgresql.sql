-- PostgreSQL full reset for Zeralda ERP
-- WARNING: This script drops and recreates the public schema.

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Central key/value storage used by frontend sync layer (/api/storage)
-- NOTE: storage.py uses "kv_store" as the primary table name.
-- "storage_items" is kept for backward compatibility with older schemas.
CREATE TABLE kv_store (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kv_store_updated_at ON kv_store (updated_at DESC);

-- Legacy table name (kept for compatibility)
CREATE TABLE storage_items (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_items_updated_at ON storage_items (updated_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_storage_items_updated_at
BEFORE UPDATE ON storage_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_kv_store_updated_at
BEFORE UPDATE ON kv_store
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Users table (for /api/auth/login and user management)
CREATE TABLE app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'administrator',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_users_active ON app_users (active);

CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Password recovery / OTP flow support
CREATE TABLE password_recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_user_active
ON password_recovery_codes (user_id, used, expires_at DESC);

-- Optional audit trail
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Seed admin account
-- Password below is a placeholder hash for: admin
-- Replace immediately in production.
INSERT INTO app_users (username, email, full_name, role, active, password_hash)
VALUES (
    'admin',
    'admin@example.com',
    'Services User',
    'administrator',
    TRUE,
    '$2b$12$6YfR9QO6f4y1Xr8Y4eYw7e3m8e6q5H5kO8ZQw2v2H2x9k0LQy5v3a'
);

COMMIT;
