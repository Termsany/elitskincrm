DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='plan_period' AND e.enumlabel='daily') THEN
    ALTER TYPE plan_period ADD VALUE 'daily' BEFORE 'weekly';
  END IF;
END $$;
