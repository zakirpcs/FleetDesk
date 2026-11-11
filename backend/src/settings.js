// The single settings document: shift and overtime rules, contacts, fuel prices.
// Stored as one JSONB row and merged over the defaults the frontend ships with,
// so a new key added to DEFAULT_SETTINGS appears without a migration.
import { ApiError } from './errors.js';
import { pool } from './db.js';
import { DEFAULT_SETTINGS } from './shared/seed.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENCRYPTIONS = ['none', 'starttls', 'tls'];
export const SMTP_PASSWORD_KEY = 'smtp.password';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FUELS = ['Octane', 'Petrol', 'Diesel', 'CNG'];

export const defaults = () => structuredClone(DEFAULT_SETTINGS);

export async function getSettings() {
  const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
  const merged = { ...defaults(), ...(rows[0]?.data || {}) };
  merged.smtp = { ...defaults().smtp, ...(merged.smtp || {}) };
  return merged;
}

/** True once a mail password has been saved — the password itself never leaves here. */
export const hasMailPassword = async () =>
  Boolean(await pool.query('SELECT 1 FROM app_secrets WHERE key = $1', [SMTP_PASSWORD_KEY]).then((r) => r.rowCount));

export const mailPassword = async () =>
  (await pool.query('SELECT value FROM app_secrets WHERE key = $1', [SMTP_PASSWORD_KEY])).rows[0]?.value || '';

async function saveMailPassword(value) {
  if (value === null) return pool.query('DELETE FROM app_secrets WHERE key = $1', [SMTP_PASSWORD_KEY]);
  return pool.query(
    `INSERT INTO app_secrets (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = now()`,
    [SMTP_PASSWORD_KEY, value],
  );
}

export async function putSettings(patch) {
  // The password arrives here and goes no further: it is stored apart from the
  // settings document, and '' means "forget the one we have".
  const password = patch?.smtp?.password;
  if (password !== undefined) await saveMailPassword(password === '' ? null : String(password));

  const merged = { ...(await getSettings()), ...(patch || {}) };
  if (patch?.smtp) merged.smtp = { ...(await getSettings()).smtp, ...patch.smtp };
  const next = validate(merged);
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

function validateSmtp(smtp) {
  const host = String(smtp.host ?? '').trim();
  const encryption = String(smtp.encryption || 'starttls').toLowerCase();
  if (!ENCRYPTIONS.includes(encryption)) throw new ApiError(`Encryption must be one of: ${ENCRYPTIONS.join(', ')}`);
  if (host && /\s/.test(host)) throw new ApiError('The mail server address cannot contain spaces');
  const port = num(smtp.port ?? 587, 'Mail server port', { min: 1, max: 65535 });
  return {
    host,
    port: Math.round(port),
    encryption,
    user: String(smtp.user ?? '').trim(),
    fromName: String(smtp.fromName ?? '').trim().slice(0, 80),
  };
}

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
    smtp: validateSmtp(s.smtp || {}),
  };
  if (out.shiftEnd <= out.shiftStart) throw new ApiError('Shift must end after it starts.');
  if (out.weekendDays.length >= 7) throw new ApiError('At least one day of the week must be a working day');
  return out;
}
