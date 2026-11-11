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
import { getSettings, mailPassword } from './settings.js';

/**
 * Where the mail server details come from: the Settings page once a host has been
 * saved there, otherwise whatever the container was started with. That way a fresh
 * deployment can send before anyone signs in, and the team lead can change relay
 * later without a redeploy.
 */
export async function resolveSmtp() {
  const saved = (await getSettings()).smtp || {};
  if (saved.host) {
    return {
      source: 'settings',
      host: saved.host,
      port: saved.port,
      secure: saved.encryption === 'tls',
      requireTLS: saved.encryption === 'starttls',
      user: saved.user,
      pass: await mailPassword(),
      fromName: saved.fromName,
    };
  }
  return {
    source: config.smtp.host ? 'environment' : 'none',
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    requireTLS: false,
    user: config.smtp.user,
    pass: config.smtp.pass,
    fromName: '',
  };
}

// One transport per distinct configuration; a change on the Settings page replaces it.
let transport = null;
let transportKey = '';
export function buildTransport(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS || undefined,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
}

async function getTransport() {
  const smtp = await resolveSmtp();
  if (!smtp.host) return null;
  const key = JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.requireTLS, smtp.user, smtp.pass.length]);
  if (key !== transportKey) {
    transport?.close?.();
    transport = buildTransport(smtp);
    transportKey = key;
    console.log(`[mail] relay ${smtp.host}:${smtp.port} (${smtp.source}${smtp.user ? `, as ${smtp.user}` : ', no auth'})`);
  }
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
  const tp = await getTransport();
  if (!tp) {
    console.log(`[mail] no relay configured — "${mail.subject}" stays queued for ${mail.to}`);
    return { status: 'Queued', error: 'No mail server has been set up yet. Settings → Mail server.' };
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
