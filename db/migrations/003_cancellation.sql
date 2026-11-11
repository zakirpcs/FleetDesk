-- Requesters can call off their own trip up until it starts, so a cancellation needs
-- a record of its own: who called it off, when, and why. `remarks` is left alone —
-- that belongs to the team lead's note or their reason for rejecting.

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS "cancelledAt"   timestamptz,
  ADD COLUMN IF NOT EXISTS "cancelledBy"   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "cancelReason"  text NOT NULL DEFAULT '';

-- Telling AGS that a booked trip is off is a fourth kind of message.
ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_kind_check;
ALTER TABLE outbox ADD CONSTRAINT outbox_kind_check
  CHECK (kind IN ('notification', 'confirmation', 'rejection', 'cancellation'));
