-- One HTML file per product (upload / replace / delete). Kept in its own table so
-- existing product rows, brochures and images are not touched.
CREATE TABLE IF NOT EXISTS product_html_files (
  product_id  uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  title       text NOT NULL DEFAULT '',
  size_bytes  integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
  sha256      text NOT NULL,
  data        bytea NOT NULL,
  warnings    text[] NOT NULL DEFAULT '{}',
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
