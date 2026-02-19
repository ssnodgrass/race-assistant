-- Update Races table to use Race ID terminology
ALTER TABLE races RENAME COLUMN runsignup_event_id TO runsignup_race_id;

-- Update Events table to support mapping to RunSignUp Event IDs
ALTER TABLE events ADD COLUMN runsignup_event_id TEXT;
