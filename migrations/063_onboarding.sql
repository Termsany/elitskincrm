-- First-login guided tour for reps: shown until they finish or skip it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;
