INSERT INTO app_settings (key, value)
VALUES ('monitoring_time', '08:00')
ON CONFLICT(key) DO NOTHING;
