// The single settings document: shift and overtime rules, contacts, fuel prices.
// Stored as one JSONB row and merged over the defaults the frontend ships with,
// so a new key added to DEFAULT_SETTINGS appears without a migration.
import { ApiError } from './errors.js';
import { pool } from './db.js';
import { DEFAULT_SETTINGS } from './shared/seed.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FUELS = ['Octane', 'Petrol', 'Diesel', 'CNG'];

export const defaults = () => structuredClone(DEFAULT_SETTINGS);

export async function getSettings() {
  const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
  return { ...defaults(), ...(rows[0]?.data || {}) };
}

export async function putSettings(patch) {
  const next = validate({ ...(await getSettings()), ...(patch || {}) });
  await pool.query(
    'INSERT INTO settings (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
    [JSON.stringify(next)],
  );
  return next;
}

const str = (v, field) => {
  const s = String(v ?? '').trim();
  if (!s) throw new ApiError(`${field} cannot be empty`);
  return s;
};
const num = (v, field, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(`${field} must be a number between ${min} and ${max}`);
  return n;
};
const email = (v, field) => {
  const s = str(v, field);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw new ApiError(`${field} is not a valid email address`);
  return s;
};
const time = (v, field) => {
  const s = str(v, field);
  if (!TIME_RE.test(s)) throw new ApiError(`${field} must be a time in HH:MM`);
  return s;
};

export function validate(s) {
  const out = {
    orgName: str(s.orgName, 'Default start point'),
    teamLeadName: str(s.teamLeadName, 'Team lead name'),
    teamLeadEmail: email(s.teamLeadEmail, 'Team lead email'),
    senderEmail: email(s.senderEmail, 'Sender email'),
    shiftStart: time(s.shiftStart, 'Shift start'),
    shiftEnd: time(s.shiftEnd, 'Shift end'),
    graceMinutes: num(s.graceMinutes, 'Grace period', { min: 0, max: 240 }),
    roundingMinutes: num(s.roundingMinutes, 'Rounding', { min: 1, max: 120 }),
    weekendMultiplier: num(s.weekendMultiplier, 'Weekend multiplier', { min: 1, max: 3 }),
    weekStartDay: num(s.weekStartDay, 'Week start day', { min: 0, max: 6 }),
    weekendDays: [...new Set((s.weekendDays || []).map((d) => num(d, 'Weekend day', { min: 0, max: 6 })))].sort(),
    holidays: [...new Set(s.holidays || [])].map((h) => {
      const d = String(h).trim();
      if (!DATE_RE.test(d)) throw new ApiError(`"${d}" is not a date in YYYY-MM-DD format.`);
      return d;
    }).sort(),
    fuelPrices: Object.fromEntries(FUELS.map((f) => [f, num(s.fuelPrices?.[f], `${f} price`, { min: 0, max: 100000 })])),
  };
  if (out.shiftEnd <= out.shiftStart) throw new ApiError('Shift must end after it starts.');
  if (out.weekendDays.length >= 7) throw new ApiError('At least one day of the week must be a working day');
  return out;
}
