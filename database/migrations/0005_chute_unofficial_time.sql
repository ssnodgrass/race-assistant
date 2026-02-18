-- Add UnofficialTime to chute_assignments
ALTER TABLE chute_assignments ADD COLUMN unofficial_time TEXT DEFAULT '';
