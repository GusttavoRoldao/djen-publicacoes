INSERT INTO app_settings (key, value)
VALUES ('storage_limit_mb', '0')
ON CONFLICT(key) DO NOTHING;
