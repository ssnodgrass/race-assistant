CREATE TABLE IF NOT EXISTS companion_checkins (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    participant_id INTEGER NOT NULL,
    bib_number TEXT NOT NULL,
    captured_at_unix_ms INTEGER NOT NULL,
    accepted_at_unix_ms INTEGER NOT NULL,
    FOREIGN KEY(session_id) REFERENCES companion_sessions(id),
    FOREIGN KEY(device_id) REFERENCES companion_devices(id),
    FOREIGN KEY(participant_id) REFERENCES participants(id)
);

CREATE INDEX IF NOT EXISTS idx_companion_checkins_session
ON companion_checkins(session_id, accepted_at_unix_ms);
