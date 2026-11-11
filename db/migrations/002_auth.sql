-- Sign-in: passwords on the users table, and server-side sessions.
--
-- Passwords are stored as scrypt hashes (see backend/src/password.js) — never
-- reversible, never logged. Sessions live here rather than in a signed cookie so a
-- disabled account or a "sign out everywhere" takes effect immediately.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id                   text,
  ADD COLUMN IF NOT EXISTS "passwordHash"       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled')),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobile               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "createdAt"          timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "lastLoginAt"        timestamptz;

-- Rows that existed before this migration get an id derived from their email.
UPDATE users SET id = 'u' || substr(md5(email), 1, 12) WHERE id IS NULL;
ALTER TABLE users ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_id_key ON users (id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id           text PRIMARY KEY,
  "userEmail"  text NOT NULL REFERENCES users (email) ON DELETE CASCADE,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL,
  "userAgent"  text NOT NULL DEFAULT '',
  ip           text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions ("userEmail");
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions ("expiresAt");
