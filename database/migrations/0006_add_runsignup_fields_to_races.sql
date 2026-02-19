-- Add RunSignUpEventID and RunSignUpAPIKey to the races table
ALTER TABLE races ADD COLUMN runsignup_event_id TEXT;
ALTER TABLE races ADD COLUMN runsignup_api_key TEXT;
