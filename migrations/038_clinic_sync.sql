-- The doctor directory is the source of clinic identities. Manual clinic links stay authoritative.
ALTER TABLE clinics ADD COLUMN source_key text UNIQUE;
ALTER TABLE doctors ADD COLUMN clinic_link_manual boolean NOT NULL DEFAULT false;
-- An existing ID is an intentional link, even when its displayed name changes later.
UPDATE doctors SET clinic_link_manual=true WHERE clinic_id IS NOT NULL;

CREATE FUNCTION forecast_clinic_key(clinic_name text, city_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT length(lower(regexp_replace(btrim(coalesce(clinic_name,'')), '[[:space:]]+', ' ', 'g')))::text || ':' ||
         lower(regexp_replace(btrim(coalesce(clinic_name,'')), '[[:space:]]+', ' ', 'g')) || lower(regexp_replace(btrim(coalesce(city_name,'')), '[[:space:]]+', ' ', 'g'))
$$;

-- Only a unique matching existing clinic can become the canonical automatic ID.
-- Ambiguous same-key branches keep their IDs and history, without an arbitrary merge.
WITH candidates AS (
 SELECT id,forecast_clinic_key(name,city) AS key,
        count(*) OVER (PARTITION BY forecast_clinic_key(name,city)) AS matches
 FROM clinics WHERE btrim(name)<>''
)
UPDATE clinics c SET source_key=k.key FROM candidates k
WHERE c.id=k.id AND k.matches=1;

-- Keep each doctor tied to a stable clinic ID on every insertion or identity edit,
-- including bulk imports and approved doctor requests.
CREATE FUNCTION sync_doctor_clinic() RETURNS trigger LANGUAGE plpgsql AS $$
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
  NEW.clinic_id := matched_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER doctors_sync_clinic BEFORE INSERT OR UPDATE OF clinic_name,city,clinic_link_manual
ON doctors FOR EACH ROW EXECUTE FUNCTION sync_doctor_clinic();

-- Existing names are grouped only when normalized clinic name AND city match.
-- Existing explicit doctor links are never overwritten.
INSERT INTO clinics(name,city,source_key)
SELECT DISTINCT ON (forecast_clinic_key(clinic_name,city))
       btrim(clinic_name),btrim(city),forecast_clinic_key(clinic_name,city)
FROM doctors
WHERE btrim(clinic_name)<>''
ORDER BY forecast_clinic_key(clinic_name,city),id
ON CONFLICT(source_key) DO NOTHING;

UPDATE doctors d SET clinic_id=c.id
FROM clinics c
WHERE d.clinic_id IS NULL AND NOT d.clinic_link_manual
  AND btrim(d.clinic_name)<>''
  AND c.source_key=forecast_clinic_key(d.clinic_name,d.city);
