-- Initial Schema

CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER,
    event_id INTEGER,
    bib_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    dob DATETIME NOT NULL,
    age_on_race_day INTEGER NOT NULL,
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS timing_pulses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER,
    place INTEGER NOT NULL,
    raw_time TEXT NOT NULL,
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS chute_assignments (
    race_id INTEGER,
    place INTEGER NOT NULL,
    bib_number TEXT NOT NULL,
    PRIMARY KEY(race_id, place),
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY
);
