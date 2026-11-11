-- Somewhere for values that must never be read back out through the API — at the
-- moment just the SMTP password. Kept out of the settings document so a plain
-- GET /settings can never return it by accident.
CREATE TABLE IF NOT EXISTS app_secrets (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
