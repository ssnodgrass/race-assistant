ALTER TABLE timing_pulses ADD COLUMN captured_at_unix_ms INTEGER;
ALTER TABLE timing_pulses ADD COLUMN capture_source TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS companion_sessions (
    id TEXT PRIMARY KEY,
    race_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at_unix_ms INTEGER NOT NULL,
    expires_at_unix_ms INTEGER NOT NULL,
    stopped_at_unix_ms INTEGER,
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS companion_devices (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    paired_at_unix_ms INTEGER NOT NULL,
    last_seen_at_unix_ms INTEGER NOT NULL,
    revoked_at_unix_ms INTEGER,
    FOREIGN KEY(session_id) REFERENCES companion_sessions(id)
);

CREATE TABLE IF NOT EXISTS companion_role_leases (
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('start', 'timer', 'bib')),
    device_id TEXT NOT NULL,
    acquired_at_unix_ms INTEGER NOT NULL,
    PRIMARY KEY(session_id, role),
    FOREIGN KEY(session_id) REFERENCES companion_sessions(id),
    FOREIGN KEY(device_id) REFERENCES companion_devices(id)
);

CREATE TABLE IF NOT EXISTS companion_requests (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    race_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL DEFAULT 0,
    operation TEXT NOT NULL CHECK(operation IN ('start', 'time', 'bib')),
    assigned_place INTEGER,
    captured_at_unix_ms INTEGER NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    accepted_at_unix_ms INTEGER NOT NULL,
    undone_at_unix_ms INTEGER,
    FOREIGN KEY(session_id) REFERENCES companion_sessions(id),
    FOREIGN KEY(device_id) REFERENCES companion_devices(id),
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE INDEX IF NOT EXISTS idx_companion_requests_stream
ON companion_requests(race_id, event_id, operation, assigned_place);

-- Existing databases may already contain duplicate bibs. These triggers allow
-- them to migrate successfully while preventing any new non-empty duplicates.
CREATE TRIGGER IF NOT EXISTS participants_unique_race_bib_insert
BEFORE INSERT ON participants
WHEN NEW.bib_number <> '' AND EXISTS (
    SELECT 1 FROM participants
    WHERE race_id = NEW.race_id AND bib_number = NEW.bib_number
)
BEGIN
    SELECT RAISE(ABORT, 'bib number already exists in this race');
END;

CREATE TRIGGER IF NOT EXISTS participants_unique_race_bib_update
BEFORE UPDATE OF race_id, bib_number ON participants
WHEN NEW.bib_number <> '' AND EXISTS (
    SELECT 1 FROM participants
    WHERE race_id = NEW.race_id AND bib_number = NEW.bib_number AND id <> NEW.id
)
BEGIN
    SELECT RAISE(ABORT, 'bib number already exists in this race');
END;
