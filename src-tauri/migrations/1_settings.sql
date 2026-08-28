CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO app_settings (key, value)
VALUES ('monitoring_enabled', '0')
ON CONFLICT(key) DO NOTHING;
