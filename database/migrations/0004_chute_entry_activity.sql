ALTER TABLE chute_assignments ADD COLUMN entered_at_unix_ms INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chute_assignments_latest_entry
ON chute_assignments (race_id, event_id, entered_at_unix_ms DESC, place DESC);
