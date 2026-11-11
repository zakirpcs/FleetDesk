// Outgoing mail. Templates come from shared/email.js — the very same module the
// frontend uses for its previews — so the email the team lead sees before approving
// is byte-for-byte what the requester receives.
//
// Every message is written to `outbox` first with status Queued, then sent. A failed
// send is left as Failed with the reason and picked up again by the retry worker.
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { pool } from './db.js';
import { uid } from './store.js';

let transport;
function getTransport() {
  if (!config.smtp.host) return null;
  transport ||= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  return transport;
}

/**
 * Store a rendered template (see shared/email.js) in the outbox.
 * Runs on the caller's client so the mail and the record that caused it commit together.
 */
export async function queue(client, mail) {
  const id = uid('e');
  await client.query(
    `INSERT INTO outbox (id, "sentAt", status, kind, "reqId", "to", cc, "from", subject, html)
     VALUES ($1, now(), 'Queued', $2, $3, $4, $5, $6, $7, $8)`,
    [id, mail.kind, mail.reqId || null, mail.to, mail.cc || '', mail.from, mail.subject, mail.html],
  );
  return id;
}

async function send(mail) {
  const tp = getTransport();
  if (!tp) {
    console.log(`[mail] SMTP_HOST not set — "${mail.subject}" stays queued for ${mail.to}`);
    return { status: 'Queued', error: 'No mail relay configured yet' };
  }
  try {
    await tp.sendMail({
      from: mail.from,
      to: mail.to,
      cc: mail.cc || undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { status: 'Sent', error: '' };
  } catch (e) {
    console.error(`[mail] could not send "${mail.subject}" to ${mail.to}: ${e.message}`);
    return { status: 'Failed', error: e.message.slice(0, 500) };
  }
}

/** Try to deliver specific outbox rows (or every pending one when called with none). */
export async function deliver(ids = null) {
  const { rows } = ids
    ? await pool.query('SELECT * FROM outbox WHERE id = ANY($1)', [ids])
    : await pool.query("SELECT * FROM outbox WHERE status IN ('Queued', 'Failed') AND attempts < $1 ORDER BY \"sentAt\" LIMIT 50", [config.smtp.maxAttempts]);
  for (const mail of rows) {
    const { status, error } = await send(mail);
    await pool.query('UPDATE outbox SET status = $2, error = $3, attempts = attempts + 1 WHERE id = $1', [mail.id, status, error]);
  }
  return rows.length;
}

export function startRetryWorker() {
  const every = Math.max(30, config.smtp.retrySeconds) * 1000;
  const tick = () => deliver().catch((e) => console.error('[mail] retry sweep failed', e.message));
  const timer = setInterval(tick, every);
  timer.unref();
  return timer;
}

/**
 * Deliver now if the relay answers quickly, otherwise leave it to the retry worker.
 * Keeps approving a request fast even when the mail server is slow.
 */
export function deliverSoon(ids, ms = 2500) {
  const attempt = deliver(ids).catch((e) => console.error('[mail] delivery failed', e.message));
  return Promise.race([attempt, new Promise((r) => setTimeout(r, ms).unref?.())]);
}
