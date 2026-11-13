// The standing reminder about papers and licences that are running out.
//
// Everything else Fleet Desk sends is a reply to something somebody did. This one is
// not: nobody has to open the dashboard for a tax token to be noticed. The schedule
// lives in Settings → Expiry reminders, and the digest itself goes through the same
// outbox as every other message, so a failed send is retried and logged like the rest.
import { pool } from './db.js';
import { getSettings } from './settings.js';
import { queue, deliverSoon } from './mailer.js';
import { expiringSoon } from './shared/papers.js';
import { expiryDigestEmail } from './shared/email.js';

const TZ = process.env.TZ || 'Asia/Dhaka';
const CHECK_MINUTES = 5;

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const nowHHMM = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false }).slice(0, 5);
/** The weekday of the fleet's own date, read at midday so no offset can shift it. */
const weekdayToday = () => new Date(`${todayISO()}T12:00:00`).getDay();

/** What the fleet's papers look like on `date`, within the window the settings ask for. */
export async function expiryItems(settings, date = todayISO()) {
  const days = settings.reminders?.days ?? 30;
  const [cars, drivers] = await Promise.all([
    pool.query('SELECT id, "regNo", status, "fitnessExpiry", "taxTokenExpiry", "insuranceExpiry" FROM cars'),
    pool.query('SELECT id, name, status, "licenseExpiry" FROM drivers'),
  ]);
  return { items: expiringSoon(cars.rows, drivers.rows, date, days), days, date };
}

/**
 * Write the digest to the outbox and try to send it.
 * Returns null when there is nothing to report and `force` was not asked for — an
 * empty reminder every week is how people learn to ignore a reminder.
 */
export async function sendDigest({ force = false, to = '' } = {}) {
  const settings = await getSettings();
  const { items, days, date } = await expiryItems(settings);
  if (!items.length && !force) return null;
  const mail = expiryDigestEmail(items, settings, {
    date, days, to: to || settings.reminders?.to || settings.teamLeadEmail,
  });
  const id = await queue(pool, mail);
  await deliverSoon([id]);
  const [sent] = (await pool.query('SELECT status, error FROM outbox WHERE id = $1', [id])).rows;
  return { id, to: mail.to, subject: mail.subject, items, days, status: sent?.status, error: sent?.error };
}

/** The date, in the fleet's timezone, of the last reminder that went out. */
async function lastSentOn() {
  const { rows } = await pool.query(`SELECT max("sentAt") AS last FROM outbox WHERE kind = 'reminder'`);
  return rows[0]?.last ? new Date(rows[0].last).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
}

/**
 * Is this the day and the hour, and has today's reminder not gone out already?
 * Returns what it sent, or null with the reason it held off — which is what the
 * scheduling test asserts on.
 */
export async function runDueCheck() {
  const { reminders: r } = await getSettings();
  if (!r?.enabled) return { sent: null, why: 'switched off' };
  if (r.every === 'week' && weekdayToday() !== r.weekday) return { sent: null, why: 'not its day of the week' };
  if (nowHHMM() < r.sendAt) return { sent: null, why: 'not yet the time of day' };
  if (await lastSentOn() === todayISO()) return { sent: null, why: 'already sent today' };
  const out = await sendDigest();
  if (out) console.log(`[reminders] ${out.items.length} papers reported to ${out.to} — ${out.status}`);
  return { sent: out, why: out ? 'sent' : 'nothing to report' };
}

export function startReminderWorker() {
  const tick = () => runDueCheck().catch((e) => console.error('[reminders] check failed:', e.message));
  // Once shortly after start too, so a restart at 08:05 still sends the 08:00 digest.
  setTimeout(tick, 20_000).unref?.();
  const timer = setInterval(tick, CHECK_MINUTES * 60_000);
  timer.unref();
  return timer;
}
