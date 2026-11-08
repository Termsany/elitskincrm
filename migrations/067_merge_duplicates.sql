-- Merge duplicate clinics / doctors: the dropped record stays (inactive) and points at the one kept, so links and history never break.
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES doctors(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS merge_log (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('clinic','doctor')),
  keep_id uuid NOT NULL,
  drop_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  merged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- "these two are not the same" — hide the suggestion
CREATE TABLE IF NOT EXISTS merge_dismissals (
  kind text NOT NULL CHECK (kind IN ('clinic','doctor')),
  a uuid NOT NULL,
  b uuid NOT NULL,
  by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, a, b)
);
-- a doctor typed with a merged clinic's old name lands on the clinic that was kept
CREATE OR REPLACE FUNCTION public.sync_doctor_clinic()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE matched_id uuid;
BEGIN
  IF NEW.clinic_link_manual THEN RETURN NEW; END IF;
  IF btrim(coalesce(NEW.clinic_name,'')) = '' THEN
    NEW.clinic_id := NULL;
    RETURN NEW;
  END IF;
  INSERT INTO clinics(name,city,source_key)
  VALUES(btrim(NEW.clinic_name),btrim(coalesce(NEW.city,'')),forecast_clinic_key(NEW.clinic_name,NEW.city))
  ON CONFLICT(source_key) DO UPDATE SET source_key=EXCLUDED.source_key
  RETURNING id INTO matched_id;
  SELECT COALESCE(c.merged_into, c.id) INTO matched_id FROM clinics c WHERE c.id = matched_id;
  NEW.clinic_id := matched_id;
  RETURN NEW;
END;
$function$;
