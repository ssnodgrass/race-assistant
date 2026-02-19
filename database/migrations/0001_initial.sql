-- Initial Schema Consolidated

CREATE TABLE IF NOT EXISTS races (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date DATETIME NOT NULL,
    start_time DATETIME,
    runsignup_race_id TEXT,
    runsignup_api_key TEXT,
    runsignup_api_secret TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    distance_km REAL NOT NULL,
    runsignup_event_id TEXT,
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER,
    event_id INTEGER,
    bib_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    dob DATETIME,
    age_on_race_day INTEGER NOT NULL,
    checked_in BOOLEAN DEFAULT 0,
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
    unofficial_time TEXT DEFAULT '',
    PRIMARY KEY(race_id, place),
    FOREIGN KEY(race_id) REFERENCES races(id)
);

CREATE TABLE IF NOT EXISTS award_configs (
    event_id INTEGER PRIMARY KEY,
    overall_count INTEGER DEFAULT 3,
    masters_age INTEGER DEFAULT 40,
    masters_count INTEGER DEFAULT 1,
    grand_masters_age INTEGER DEFAULT 50,
    grand_masters_count INTEGER DEFAULT 1,
    senior_grand_masters_age INTEGER DEFAULT 60,
    senior_grand_masters_count INTEGER DEFAULT 1,
    age_group_depth INTEGER DEFAULT 3,
    include_overall BOOLEAN DEFAULT 1,
    include_masters BOOLEAN DEFAULT 1,
    include_grand_masters BOOLEAN DEFAULT 0,
    include_senior_grand_masters BOOLEAN DEFAULT 0,
    split_gender BOOLEAN DEFAULT 1,
    award_strategy INTEGER DEFAULT 0, -- 0: Prestigious, 1: Distributed
    age_groups_json TEXT,
    FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY
);
