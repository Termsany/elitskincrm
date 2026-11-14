-- AI provider chosen from the app (one row). The API key is stored encrypted (AES-256-GCM, key derived from a server secret).
CREATE TABLE IF NOT EXISTS ai_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  model text NOT NULL,
  api_key_enc text NOT NULL,
  key_hint text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
