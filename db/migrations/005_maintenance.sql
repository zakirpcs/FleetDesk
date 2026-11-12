-- Servicing and repairs. Fuel told us what a car costs to run; this tells us what it
-- costs to keep, and when it is next due in the workshop.
--
-- A record is what was done and what it cost. What is due next is kept on the same
-- row — the garage tells you at the counter, and it is the last job that decides it.

CREATE TABLE IF NOT EXISTS maintenance (
  id                 text PRIMARY KEY,
  date               date NOT NULL,
  "carId"            text NOT NULL REFERENCES cars (id) ON DELETE RESTRICT,
  kind               text NOT NULL CHECK (kind IN ('Service', 'Repair', 'Tyres', 'Battery', 'Bodywork', 'Inspection', 'Other')),
  odometer           numeric(12, 1) NOT NULL DEFAULT 0 CHECK (odometer >= 0),
  workshop           text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',
  cost               numeric(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  "invoiceNo"        text NOT NULL DEFAULT '',
  "nextServiceDate"  date,
  "nextServiceOdo"   numeric(12, 1) CHECK ("nextServiceOdo" >= 0),
  notes              text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS maintenance_date_idx ON maintenance (date);
CREATE INDEX IF NOT EXISTS maintenance_car_idx ON maintenance ("carId", date DESC);
