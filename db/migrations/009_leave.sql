-- Driver leave, with dates. `drivers.status` says whether somebody is on the roster
-- at all; it cannot say that Jamal is away from the 14th to the 20th, so a trip on
-- the 16th could be given to him in good faith. This table is that calendar.
CREATE TABLE IF NOT EXISTS leave (
  id          text PRIMARY KEY,
  "driverId"  text NOT NULL REFERENCES drivers(id),
  "startDate" date NOT NULL,
  "endDate"   date NOT NULL,
  kind        text NOT NULL DEFAULT 'Annual'
              CHECK (kind IN ('Annual', 'Sick', 'Casual', 'Unpaid', 'Training', 'Other')),
  notes       text NOT NULL DEFAULT '',
  CONSTRAINT leave_dates CHECK ("endDate" >= "startDate")
);

CREATE INDEX IF NOT EXISTS leave_driver_idx ON leave ("driverId", "startDate");
CREATE INDEX IF NOT EXISTS leave_period_idx ON leave ("startDate", "endDate");
