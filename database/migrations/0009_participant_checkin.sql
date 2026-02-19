-- Add checked_in status to participants
ALTER TABLE participants ADD COLUMN checked_in BOOLEAN DEFAULT 0;
