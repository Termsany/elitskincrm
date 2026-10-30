-- The migration runner wraps this file in BEGIN/COMMIT; block concurrent inserts, updates and deletes until the guarded reset commits.
LOCK TABLE rep_monthly_sales, forecast_sales, forecast_targets IN ACCESS EXCLUSIVE MODE;
-- Abort the legacy reset if any count changed after the approved backup.
DO $$ BEGIN
 IF (SELECT count(*) FROM rep_monthly_sales) <> 3 OR
    (SELECT count(*) FROM forecast_sales) <> 3 OR
    (SELECT count(*) FROM forecast_sales WHERE status='approved') <> 3 OR
    (SELECT count(*) FROM forecast_targets) <> 1 THEN
  RAISE EXCEPTION 'Legacy sales/target counts changed; restore or review before migration';
 END IF;
END $$;
DELETE FROM rep_monthly_sales;
DELETE FROM forecast_sales;
DELETE FROM forecast_targets;
CREATE TABLE rep_target_years(rep_id uuid NOT NULL REFERENCES users(id),year int NOT NULL CHECK(year BETWEEN 2000 AND 2099),annual_amount numeric(14,2) NOT NULL CHECK(annual_amount>=0),set_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(rep_id,year));
INSERT INTO rep_target_years(rep_id,year,annual_amount) SELECT id,EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Riyadh')::int,annual_sales_target FROM users WHERE role='sales_rep' AND annual_sales_target IS NOT NULL;
CREATE TABLE rep_target_overrides(rep_id uuid NOT NULL REFERENCES users(id),year int NOT NULL,month date NOT NULL CHECK(EXTRACT(day FROM month)=1),amount numeric(14,2) NOT NULL CHECK(amount>=0),set_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(rep_id,month),FOREIGN KEY(rep_id,year) REFERENCES rep_target_years(rep_id,year));
CREATE TABLE rep_target_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),rep_id uuid NOT NULL REFERENCES users(id),year int NOT NULL,month date CHECK(month IS NULL OR EXTRACT(day FROM month)=1),level text NOT NULL CHECK(level IN ('annual','monthly')),version int NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('pending','approved','rejected')),amount numeric(14,2) NOT NULL CHECK(amount>=0),reason text,review_note text,reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(rep_id,year) REFERENCES rep_target_years(rep_id,year),CHECK((level='annual' AND month IS NULL) OR (level='monthly' AND month IS NOT NULL)));
CREATE UNIQUE INDEX rep_target_annual_version ON rep_target_versions(rep_id,year,version) WHERE level='annual';
CREATE UNIQUE INDEX rep_target_month_version ON rep_target_versions(rep_id,month,version) WHERE level='monthly';
CREATE UNIQUE INDEX rep_target_annual_pending ON rep_target_versions(rep_id,year) WHERE level='annual' AND status='pending';
CREATE UNIQUE INDEX rep_target_month_pending ON rep_target_versions(rep_id,month) WHERE level='monthly' AND status='pending';
CREATE TABLE rep_target_months(version_id uuid NOT NULL REFERENCES rep_target_versions(id),month date NOT NULL CHECK(EXTRACT(day FROM month)=1),amount numeric(14,2) NOT NULL CHECK(amount>=0),PRIMARY KEY(version_id,month));
CREATE TABLE rep_target_lines(version_id uuid NOT NULL REFERENCES rep_target_versions(id),clinic_id uuid NOT NULL REFERENCES clinics(id),product_id uuid NOT NULL REFERENCES products(id),quantity int NOT NULL CHECK(quantity>0),unit_price numeric(14,2) NOT NULL CHECK(unit_price>0),PRIMARY KEY(version_id,clinic_id,product_id));
-- Decisions preserve snapshots; approved version rows and their children cannot change.
CREATE FUNCTION guard_target_approved() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status='approved' THEN RAISE EXCEPTION 'Approved target version is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER target_version_immutable BEFORE UPDATE OR DELETE ON rep_target_versions FOR EACH ROW EXECUTE FUNCTION guard_target_approved();
CREATE FUNCTION guard_target_children() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM rep_target_versions WHERE id=OLD.version_id AND status='approved') THEN RAISE EXCEPTION 'Approved target lines are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER target_month_immutable BEFORE UPDATE OR DELETE ON rep_target_months FOR EACH ROW EXECUTE FUNCTION guard_target_children();
CREATE TRIGGER target_line_immutable BEFORE UPDATE OR DELETE ON rep_target_lines FOR EACH ROW EXECUTE FUNCTION guard_target_children();
