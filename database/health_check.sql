-- PostgreSQL health check for Zeralda ERP
-- Verifies required tables, columns, indexes, triggers and key seed user.

WITH required_tables AS (
    SELECT unnest(ARRAY[
        'storage_items',
        'app_users',
        'password_recovery_codes',
        'audit_logs'
    ]) AS table_name
), existing_tables AS (
    SELECT tablename AS table_name
    FROM pg_tables
    WHERE schemaname = 'public'
)
SELECT
    rt.table_name,
    CASE WHEN et.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_tables rt
LEFT JOIN existing_tables et USING (table_name)
ORDER BY rt.table_name;

-- Required columns check
WITH required_columns AS (
    SELECT * FROM (VALUES
        ('storage_items','key'),
        ('storage_items','value'),
        ('storage_items','created_at'),
        ('storage_items','updated_at'),
        ('app_users','id'),
        ('app_users','username'),
        ('app_users','email'),
        ('app_users','full_name'),
        ('app_users','role'),
        ('app_users','active'),
        ('app_users','password_hash'),
        ('password_recovery_codes','id'),
        ('password_recovery_codes','user_id'),
        ('password_recovery_codes','code_hash'),
        ('password_recovery_codes','expires_at'),
        ('audit_logs','id'),
        ('audit_logs','action')
    ) AS t(table_name, column_name)
)
SELECT
    rc.table_name,
    rc.column_name,
    CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_columns rc
LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = rc.table_name
   AND c.column_name = rc.column_name
ORDER BY rc.table_name, rc.column_name;

-- Required indexes check
WITH required_indexes AS (
    SELECT unnest(ARRAY[
        'idx_storage_items_updated_at',
        'idx_app_users_active',
        'uq_app_users_username',
        'uq_app_users_email',
        'idx_recovery_user_active',
        'idx_audit_logs_created_at'
    ]) AS index_name
)
SELECT
    ri.index_name,
    CASE WHEN i.indexname IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_indexes ri
LEFT JOIN pg_indexes i
    ON i.schemaname = 'public'
   AND i.indexname = ri.index_name
ORDER BY ri.index_name;

-- Required triggers check
WITH required_triggers AS (
    SELECT * FROM (VALUES
        ('storage_items','trg_storage_items_updated_at'),
        ('app_users','trg_app_users_updated_at')
    ) AS t(table_name, trigger_name)
)
SELECT
    rt.table_name,
    rt.trigger_name,
    CASE WHEN t.tgname IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM required_triggers rt
LEFT JOIN pg_trigger t
    ON t.tgname = rt.trigger_name
   AND t.tgisinternal = false
ORDER BY rt.table_name, rt.trigger_name;

-- Seed admin check
SELECT
    COALESCE((SELECT username FROM app_users WHERE username = 'admin' LIMIT 1), 'N/A') AS admin_username,
    CASE WHEN EXISTS (SELECT 1 FROM app_users WHERE username = 'admin') THEN 'OK' ELSE 'MISSING' END AS admin_status;
