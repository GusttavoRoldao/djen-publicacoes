CREATE TABLE IF NOT EXISTS attorney_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    oab_number TEXT NOT NULL,
    oab_uf TEXT NOT NULL,
    photo_data_url TEXT,
    validation_status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (oab_number, oab_uf)
);

CREATE INDEX IF NOT EXISTS idx_attorney_profiles_name
ON attorney_profiles (name COLLATE NOCASE);

INSERT INTO app_settings (key, value)
VALUES ('onboarding_completed', '0')
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_settings (key, value)
VALUES ('retention_days', '0')
ON CONFLICT(key) DO NOTHING;
