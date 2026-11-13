-- Who changed what. Fuel loads, card limits and odometer readings are money and
-- mileage; until now a corrected figure left no trace of who corrected it.
--
-- The trail is append-only: rows are written beside the change, inside the same
-- transaction, so a change that rolls back leaves nothing behind — and nothing in
-- the application can edit or delete a row afterwards. TRUNCATE still works, which
-- is how the demo seeder clears it.
CREATE TABLE IF NOT EXISTS audit (
  id           text PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  "actorEmail" text NOT NULL DEFAULT '',
  "actorName"  text NOT NULL DEFAULT '',
  "actorRole"  text NOT NULL DEFAULT '',
  action       text NOT NULL,
  entity       text NOT NULL,
  "entityId"   text NOT NULL DEFAULT '',
  label        text NOT NULL DEFAULT '',
  changes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip           text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS audit_at_idx ON audit (at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit (entity, "entityId", at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit ("actorEmail", at DESC);

CREATE OR REPLACE FUNCTION audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The audit trail is append-only: entries cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_no_rewrite ON audit;
CREATE TRIGGER audit_no_rewrite
  BEFORE UPDATE OR DELETE ON audit
  FOR EACH STATEMENT EXECUTE FUNCTION audit_append_only();
