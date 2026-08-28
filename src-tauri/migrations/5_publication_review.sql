CREATE TABLE IF NOT EXISTS publication_reviews (
    publication_id INTEGER PRIMARY KEY NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unchecked',
    needs_attention INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publication_reviews_status ON publication_reviews (status);
CREATE INDEX IF NOT EXISTS idx_publication_reviews_attention ON publication_reviews (needs_attention);
CREATE INDEX IF NOT EXISTS idx_search_publications_publication ON search_publications (publication_id);
