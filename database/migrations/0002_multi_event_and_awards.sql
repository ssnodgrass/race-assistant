-- Multi-Event and Granular Award Support

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    distance_km REAL NOT NULL,
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
