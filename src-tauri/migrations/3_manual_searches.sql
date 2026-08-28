CREATE TABLE IF NOT EXISTS searches (
    id TEXT PRIMARY KEY NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    tribunal TEXT,
    executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    result_count INTEGER NOT NULL DEFAULT 0,
    warning TEXT
);

CREATE TABLE IF NOT EXISTS search_attorneys (
    search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    attorney_profile_id INTEGER REFERENCES attorney_profiles(id) ON DELETE SET NULL,
    attorney_name TEXT NOT NULL,
    oab_number TEXT NOT NULL,
    oab_uf TEXT NOT NULL,
    PRIMARY KEY (search_id, oab_number, oab_uf)
);

CREATE TABLE IF NOT EXISTS publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedup_key TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    available_on TEXT NOT NULL,
    tribunal TEXT NOT NULL,
    communication_type TEXT NOT NULL,
    court_unit TEXT NOT NULL,
    full_text TEXT NOT NULL,
    process_number TEXT NOT NULL,
    medium TEXT NOT NULL,
    official_link TEXT,
    document_type TEXT,
    class_name TEXT,
    communication_number INTEGER,
    official_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publication_attorneys (
    publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    oab_number TEXT NOT NULL,
    oab_uf TEXT NOT NULL,
    PRIMARY KEY (publication_id, name, oab_number, oab_uf)
);

CREATE TABLE IF NOT EXISTS publication_recipients (
    publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (publication_id, name, role)
);

CREATE TABLE IF NOT EXISTS search_publications (
    search_id TEXT NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
    PRIMARY KEY (search_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_searches_executed_at ON searches (executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_available_on ON publications (available_on DESC);
CREATE INDEX IF NOT EXISTS idx_publications_tribunal ON publications (tribunal);
CREATE INDEX IF NOT EXISTS idx_publications_process ON publications (process_number);
CREATE INDEX IF NOT EXISTS idx_publication_attorneys_oab ON publication_attorneys (oab_number, oab_uf);
