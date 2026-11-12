-- Messages can now go out by SMS as well as email. The outbox keeps both: same
-- queue, same delivery status, same retries, so the message log shows everything
-- Fleet Desk has tried to send.
ALTER TABLE outbox
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms'));

-- An SMS has no subject or HTML body; `text` carries it.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';
ALTER TABLE outbox ALTER COLUMN subject SET DEFAULT '';
ALTER TABLE outbox ALTER COLUMN html SET DEFAULT '';

CREATE INDEX IF NOT EXISTS outbox_channel_idx ON outbox (channel);
