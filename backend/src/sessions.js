// Server-side sessions. The browser only ever holds an opaque random id in an
// HttpOnly cookie; everything about the session lives in the database, so disabling
// an account or signing out everywhere takes effect on the next request.
import { randomBytes } from 'node:crypto';
import { pool, query, row } from './db.js';
import { config } from './config.js';

const COOKIE = config.auth.cookieName;

export const newId = () => randomBytes(32).toString('base64url');

export async function create(user, req) {
  const id = newId();
  const hours = config.auth.sessionHours;
  await query(
    `INSERT INTO sessions (id, "userEmail", "expiresAt", "userAgent", ip)
     VALUES ($1, $2, now() + ($3 || ' hours')::interval, $4, $5)`,
    [id, user.email, String(hours), String(req.headers['user-agent'] || '').slice(0, 300), req.ip || ''],
  );
  return id;
}

/** The signed-in user for a session id, or null if it is unknown, expired or disabled. */
export async function readUser(id) {
  if (!id) return null;
  const found = await row(
    `SELECT s.id, s."createdAt", u.id AS "userId", u.email, u.name, u.designation, u.role, u.status, u."mustChangePassword"
       FROM sessions s JOIN users u ON u.email = s."userEmail"
      WHERE s.id = $1 AND s."expiresAt" > now()`,
    [id],
  );
  if (!found) return null;
  // Absolute lifetime: a session cannot be kept alive forever by staying active.
  if (Date.now() - new Date(found.createdAt).getTime() > config.auth.absoluteDays * 86400_000) {
    await destroy(id);
    return null;
  }
  if (found.status !== 'Active') {
    await destroyAllFor(found.email);
    return null;
  }
  // Sliding expiry, written at most once a minute so reads stay cheap.
  query(
    `UPDATE sessions SET "lastSeenAt" = now(), "expiresAt" = now() + ($2 || ' hours')::interval
      WHERE id = $1 AND "lastSeenAt" < now() - interval '1 minute'`,
    [id, String(config.auth.sessionHours)],
  ).catch(() => {});
  return {
    id: found.userId, email: found.email, name: found.name, designation: found.designation,
    role: found.role, mustChangePassword: found.mustChangePassword, sessionId: found.id,
  };
}

export const destroy = (id) => query('DELETE FROM sessions WHERE id = $1', [id]);
export const destroyAllFor = (email, exceptId = '') =>
  query('DELETE FROM sessions WHERE "userEmail" = $1 AND id <> $2', [email, exceptId]);
export const countFor = async (email) =>
  Number((await row('SELECT count(*)::int AS n FROM sessions WHERE "userEmail" = $1 AND "expiresAt" > now()', [email]))?.n || 0);

// ---- the cookie ------------------------------------------------------------
const secureFor = (req) => (config.auth.cookieSecure === 'auto'
  ? req.secure || req.headers['x-forwarded-proto'] === 'https'
  : config.auth.cookieSecure);

export function setCookie(req, res, id) {
  res.cookie(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureFor(req),
    path: '/',
    maxAge: config.auth.sessionHours * 3600_000,
  });
}

export const clearCookie = (req, res) =>
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureFor(req), path: '/' });

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export const sessionId = (req) => cookies(req)[COOKIE] || '';

/** Clear out expired rows now and then; nothing depends on it being prompt. */
export function startSweeper() {
  const tick = () => pool.query('DELETE FROM sessions WHERE "expiresAt" < now() - interval \'1 day\'')
    .catch((e) => console.error('[sessions] sweep failed', e.message));
  const timer = setInterval(tick, 3600_000);
  timer.unref();
  tick();
  return timer;
}
