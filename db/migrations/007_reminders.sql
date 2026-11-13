-- The expiry reminder is a fifth kind of message: not a reply to anything somebody
-- did, but a standing digest of papers and licences that are running out.
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_kind_check;
ALTER TABLE outbox ADD CONSTRAINT outbox_kind_check
  CHECK (kind IN ('notification', 'confirmation', 'rejection', 'cancellation', 'reminder'));

-- The worker asks for the newest reminder on every check, a few times an hour.
CREATE INDEX IF NOT EXISTS outbox_kind_sent_idx ON outbox (kind, "sentAt" DESC);
