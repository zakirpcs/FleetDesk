// Server-side reports, for when the lists grow past what the browser should fetch.
// The rules live in shared/calc.js — the same module the frontend computes with — so
// a report gives the same numbers whichever side works it out.
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { rows } from '../db.js';
import { isStaff } from '../auth.js';
import { getSettings } from '../settings.js';
import { overtimeDays, kmBuckets, tripKm } from '../shared/calc.js';

const router = Router();

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const month = (v, field) => {
  const s = String(v || '').slice(0, 7);
  if (!MONTH_RE.test(s)) throw new ApiError(`${field} must be a month in YYYY-MM format`);
  return s;
};
const date = (v, field, dflt) => {
  if (v === undefined || v === '') return dflt;
  const s = String(v).slice(0, 10);
  if (!DATE_RE.test(s)) throw new ApiError(`${field} must be a date in YYYY-MM-DD format`);
  return s;
};
const monthShift = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

router.use((req, res, next) => next(isStaff(req.user) ? undefined : new ApiError('Reports are for the AGS team.', 403)));

// GET /reports/running-km?period=week|month&from=&to=
router.get('/running-km', async (req, res) => {
  const period = req.query.period === 'month' ? 'month' : 'week';
  const from = date(req.query.from, 'from', '0001-01-01');
  const to = date(req.query.to, 'to', '9999-12-31');
  const settings = await getSettings();
  const trips = await rows('SELECT date, "carId", "startOdo", "endOdo" FROM trips WHERE date BETWEEN $1 AND $2', [from, to]);
  const { buckets, table } = kmBuckets(trips, period, settings);
  res.json(buckets.flatMap((bucket) =>
    Object.entries(table).filter(([, b]) => b[bucket]).map(([carId, b]) => ({ carId, bucket, km: round(b[bucket], 1) }))));
});

// GET /reports/fuel-consumption?month=YYYY-MM  → km/L this month against the 3-month average
router.get('/fuel-consumption', async (req, res) => {
  const ym = month(req.query.month || new Date().toISOString().slice(0, 7), 'month');
  const first = `${monthShift(ym, -3)}-01`;
  const trips = await rows('SELECT date, "carId", "startOdo", "endOdo" FROM trips WHERE date >= $1 AND to_char(date, \'YYYY-MM\') <= $2', [first, ym]);
  const loads = await rows('SELECT date, "carId", qty, amount FROM fuel WHERE date >= $1 AND to_char(date, \'YYYY-MM\') <= $2', [first, ym]);

  const bucket = {};   // carId|YYYY-MM → { km, qty, amount, loads }
  const at = (carId, m) => (bucket[`${carId}|${m}`] ||= { km: 0, qty: 0, amount: 0, loads: 0 });
  for (const t of trips) at(t.carId, t.date.slice(0, 7)).km += tripKm(t);
  for (const f of loads) {
    const b = at(f.carId, f.date.slice(0, 7));
    b.qty += Number(f.qty); b.amount += Number(f.amount); b.loads += 1;
  }
  const prev = [monthShift(ym, -1), monthShift(ym, -2), monthShift(ym, -3)];
  const carIds = [...new Set(Object.keys(bucket).map((k) => k.split('|')[0]))].sort();
  res.json(carIds.map((carId) => {
    const b = bucket[`${carId}|${ym}`] || { km: 0, qty: 0, amount: 0, loads: 0 };
    const history = prev.map((m) => bucket[`${carId}|${m}`]).filter((x) => x && x.qty > 0).map((x) => x.km / x.qty);
    const avg = b.qty > 0 ? b.km / b.qty : null;
    const prevAvg = history.length ? history.reduce((a, x) => a + x, 0) / history.length : null;
    return {
      carId, km: round(b.km, 1), qty: round(b.qty), amount: round(b.amount), loads: b.loads,
      avg: avg === null ? null : round(avg),
      prevAvg: prevAvg === null ? null : round(prevAvg),
      // More than 15% below the previous three months is worth a look.
      flagged: avg !== null && prevAvg !== null && avg < prevAvg * 0.85,
    };
  }));
});

// GET /reports/overtime?month=YYYY-MM
router.get('/overtime', async (req, res) => {
  const ym = month(req.query.month || new Date().toISOString().slice(0, 7), 'month');
  const settings = await getSettings();
  const trips = await rows('SELECT date, "carId", "driverId", "startTime", "endTime", "startOdo", "endOdo" FROM trips WHERE to_char(date, \'YYYY-MM\') = $1', [ym]);
  const drivers = await rows('SELECT id, "otRate" FROM drivers');
  res.json(overtimeDays(trips, drivers, settings)
    .filter((d) => d.otMin > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.driverId.localeCompare(b.driverId))
    .map((d) => ({
      driverId: d.driverId, date: d.date, start: d.start, end: d.end,
      dutyMin: d.dutyMin, otMin: d.otMin, offDay: d.offDay, amount: round(d.amount),
    })));
});

// GET /reports/assignments?from=&to= → who drove which car, from the logbook and
// from approved requests, one row per driver-and-car pairing.
router.get('/assignments', async (req, res) => {
  const from = date(req.query.from, 'from', '0001-01-01');
  const to = date(req.query.to, 'to', '9999-12-31');
  res.json(await rows(
    `WITH events AS (
       SELECT "driverId", "carId", date, greatest("endOdo" - "startOdo", 0) AS km, 'log' AS src
         FROM trips
        WHERE "driverId" IS NOT NULL AND date BETWEEN $1 AND $2
       UNION ALL
       SELECT "driverId", "carId", "requiredDate" AS date, 0 AS km, 'req' AS src
         FROM requisitions
        WHERE status = 'Approved' AND "driverId" IS NOT NULL AND "carId" IS NOT NULL
          AND "requiredDate" BETWEEN $1 AND $2
     )
     SELECT "driverId", "carId",
            count(*) FILTER (WHERE src = 'log')::int AS days,
            count(*) FILTER (WHERE src = 'req')::int AS bookings,
            round(coalesce(sum(km), 0), 1)::float8 AS km,
            min(date) AS first, max(date) AS last
       FROM events
      GROUP BY "driverId", "carId"
      ORDER BY days DESC, km DESC`,
    [from, to],
  ));
});

// GET /reports/card-usage?from=&to=
router.get('/card-usage', async (req, res) => {
  const from = date(req.query.from, 'from', '0001-01-01');
  const to = date(req.query.to, 'to', '9999-12-31');
  res.json(await rows(
    `SELECT "cardId", count(*)::int AS loads, sum(qty)::float8 AS qty, sum(amount)::float8 AS amount
       FROM fuel WHERE "cardId" IS NOT NULL AND date BETWEEN $1 AND $2
      GROUP BY "cardId" ORDER BY amount DESC`,
    [from, to],
  ));
});

export default router;
