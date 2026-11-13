// The single settings document: shift and overtime rules, contacts, fuel prices.
// Stored as one JSONB row and merged over the defaults the frontend ships with,
// so a new key added to DEFAULT_SETTINGS appears without a migration.
import { ApiError } from './errors.js';
import { pool } from './db.js';
import { DEFAULT_SETTINGS } from './shared/seed.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENCRYPTIONS = ['none', 'starttls', 'tls'];
export const SMTP_PASSWORD_KEY = 'smtp.password';
export const SMS_API_KEY = 'sms.apiKey';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FUELS = ['Octane', 'Petrol', 'Diesel', 'CNG'];

export const defaults = () => structuredClone(DEFAULT_SETTINGS);

export async function getSettings() {
  const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
  const merged = { ...defaults(), ...(rows[0]?.data || {}) };
  merged.smtp = { ...defaults().smtp, ...(merged.smtp || {}) };
  merged.sms = { ...defaults().sms, ...(merged.sms || {}) };
  merged.reminders = { ...defaults().reminders, ...(merged.reminders || {}) };
  return merged;
}

/** True once a mail password has been saved — the password itself never leaves here. */
export const hasMailPassword = async () =>
  Boolean(await pool.query('SELECT 1 FROM app_secrets WHERE key = $1', [SMTP_PASSWORD_KEY]).then((r) => r.rowCount));

export const mailPassword = async () =>
  (await pool.query('SELECT value FROM app_secrets WHERE key = $1', [SMTP_PASSWORD_KEY])).rows[0]?.value || '';

export const hasSmsApiKey = async () =>
  Boolean(await pool.query('SELECT 1 FROM app_secrets WHERE key = $1', [SMS_API_KEY]).then((r) => r.rowCount));

export const smsApiKey = async () =>
  (await pool.query('SELECT value FROM app_secrets WHERE key = $1', [SMS_API_KEY])).rows[0]?.value || '';

async function saveSecret(key, value) {
  if (value === null) return pool.query('DELETE FROM app_secrets WHERE key = $1', [key]);
  return pool.query(
    `INSERT INTO app_secrets (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = now()`,
    [key, value],
  );
}

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
  const apiKey = patch?.sms?.apiKey;
  if (apiKey !== undefined) await saveSecret(SMS_API_KEY, apiKey === '' ? null : String(apiKey));

  const current = await getSettings();
  const merged = { ...current, ...(patch || {}) };
  if (patch?.smtp) merged.smtp = { ...current.smtp, ...patch.smtp };
  if (patch?.sms) merged.sms = { ...current.sms, ...patch.sms };
  if (patch?.reminders) merged.reminders = { ...current.reminders, ...patch.reminders };
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

const SMS_METHODS = ['GET', 'POST'];
const NUMBER_FORMATS = ['as-is', 'digits', 'country'];

function validateSms(sms) {
  const url = String(sms.url ?? '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new ApiError('The gateway address has to start with http:// or https://');
  const method = String(sms.method || 'GET').toUpperCase();
  if (!SMS_METHODS.includes(method)) throw new ApiError(`The request has to be ${SMS_METHODS.join(' or ')}`);
  const numberFormat = String(sms.numberFormat || 'digits');
  if (!NUMBER_FORMATS.includes(numberFormat)) throw new ApiError(`Number format must be one of: ${NUMBER_FORMATS.join(', ')}`);
  const countryCode = String(sms.countryCode ?? '880').replace(/\D/g, '');
  return {
    enabled: sms.enabled !== false,
    url,
    method,
    headers: String(sms.headers ?? '').slice(0, 2000),
    body: String(sms.body ?? '').slice(0, 2000),
    sender: String(sms.sender ?? '').trim().slice(0, 40),
    numberFormat,
    countryCode: countryCode || '880',
    successText: String(sms.successText ?? '').trim().slice(0, 80),
  };
}

const REMINDER_EVERY = ['day', 'week'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The expiry reminder. `to` may name several people, separated by commas; empty means
 * the team lead, so a fresh install reminds somebody without being configured first.
 */
function validateReminders(r) {
  const every = String(r.every || 'week').toLowerCase();
  if (!REMINDER_EVERY.includes(every)) throw new ApiError('Reminders go out either every day or once a week');
  const to = String(r.to ?? '').split(/[,;\s]+/).filter(Boolean);
  for (const one of to) if (!EMAIL_RE.test(one)) throw new ApiError(`"${one}" is not a valid email address`);
  return {
    enabled: r.enabled !== false,
    every,
    weekday: Math.round(num(r.weekday ?? 0, 'Reminder day', { min: 0, max: 6 })),
    sendAt: time(r.sendAt || '08:00', 'Reminder time'),
    days: Math.round(num(r.days ?? 30, 'Days ahead', { min: 1, max: 365 })),
    to: to.join(', '),
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
    sms: validateSms(s.sms || {}),
    reminders: validateReminders(s.reminders || {}),
  };
  if (out.shiftEnd <= out.shiftStart) throw new ApiError('Shift must end after it starts.');
  if (out.weekendDays.length >= 7) throw new ApiError('At least one day of the week must be a working day');
  return out;
}
