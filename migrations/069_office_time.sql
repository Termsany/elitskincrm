-- Time a rep spent away from the field (office work, meetings, training…), so the day's expected visits shrink with it.
CREATE TABLE IF NOT EXISTS office_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL,
  minutes int NOT NULL CHECK (minutes BETWEEN 5 AND 600),
  from_time time,
  to_time time,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS office_time_user_day ON office_time(user_id, day);
