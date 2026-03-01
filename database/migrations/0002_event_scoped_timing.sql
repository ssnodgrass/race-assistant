ALTER TABLE timing_pulses ADD COLUMN event_id INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_timing_pulses_race_event_place
ON timing_pulses (race_id, event_id, place);

ALTER TABLE chute_assignments RENAME TO chute_assignments_old;

CREATE TABLE chute_assignments (
    race_id INTEGER,
    event_id INTEGER DEFAULT 0,
    place INTEGER NOT NULL,
    bib_number TEXT NOT NULL,
    unofficial_time TEXT DEFAULT '',
    PRIMARY KEY(race_id, event_id, place),
    FOREIGN KEY(race_id) REFERENCES races(id),
    FOREIGN KEY(event_id) REFERENCES events(id)
);

INSERT INTO chute_assignments (race_id, event_id, place, bib_number, unofficial_time)
SELECT race_id, 0, place, bib_number, unofficial_time
FROM chute_assignments_old;

DROP TABLE chute_assignments_old;

CREATE INDEX IF NOT EXISTS idx_chute_assignments_race_event_place
ON chute_assignments (race_id, event_id, place);
