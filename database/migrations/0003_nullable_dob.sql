-- Make DOB nullable in participants table
-- Using a more standard approach for SQLite table alteration

PRAGMA foreign_keys=OFF;

CREATE TABLE participants_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER,
    event_id INTEGER,
    bib_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    dob DATETIME, -- Nullable
    age_on_race_day INTEGER NOT NULL,
    FOREIGN KEY(race_id) REFERENCES races(id)
);

INSERT INTO participants_new (id, race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day)
SELECT id, race_id, event_id, bib_number, first_name, last_name, gender, dob, age_on_race_day FROM participants;

DROP TABLE participants;
ALTER TABLE participants_new RENAME TO participants;

PRAGMA foreign_keys=ON;
