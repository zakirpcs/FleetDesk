// Signing in and out, and changing your own password.
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { query, row } from '../db.js';
import { config } from '../config.js';
import { passwordMode, requireUser } from '../auth.js';
import * as sessions from '../sessions.js';
import { verifyPassword, hashPassword, burnTime, checkPasswordQuality } from '../password.js';
import { DEMO_USERS } from '../seed.js';

const router = Router();

// Failed attempts, in memory. Enough to blunt guessing; a multi-instance deployment
// should move this to the database or put rate limiting in the proxy.
const failures = new Map();
const keyFor = (email, ip) => `${email}|${ip}`;

function checkLockout(email, ip) {
  const found = failures.get(keyFor(email, ip));
  if (!found) return;
  const windowMs = config.auth.lockoutMinutes * 60_000;
  if (Date.now() - found.first > windowMs) return failures.delete(keyFor(email, ip));
  if (found.count >= config.auth.maxFailures) {
    const minutes = Math.max(1, Math.ceil((found.first + windowMs - Date.now()) / 60_000));
    throw new ApiError(`Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 429);
  }
}

function noteFailure(email, ip) {
  const key = keyFor(email, ip);
  const found = failures.get(key);
  if (found && Date.now() - found.first < config.auth.lockoutMinutes * 60_000) found.count += 1;
  else failures.set(key, { count: 1, first: Date.now() });
}

const publicUser = (u) => ({
  id: u.id, name: u.name, designation: u.designation, email: u.email, role: u.role,
  mustChangePassword: Boolean(u.mustChangePassword),
});

// What the sign-in page needs before anyone has signed in. The hint names only the
// seeded sample accounts — never the real ones, however many get added later.
router.get('/info', async (req, res) => {
  const accounts = config.showDemoAccounts
    ? (await query(
      `SELECT email, role FROM users WHERE status = 'Active' AND "passwordHash" <> '' AND email = ANY($1)
        ORDER BY CASE role WHEN 'lead' THEN 1 WHEN 'ags' THEN 2 ELSE 3 END, email`,
      [DEMO_USERS.map((u) => u.email)],
    )).rows
    : [];
  res.json({
    mode: passwordMode() ? 'password' : 'proxy',
    signedIn: Boolean(req.user),
    demoAccounts: accounts,
    demoPassword: config.showDemoAccounts ? config.demoPassword : '',
  });
});

router.post('/login', async (req, res) => {
  if (!passwordMode()) throw new ApiError('Fleet Desk is set up to sign you in through your company account.', 400);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new ApiError('Enter your email address and password');
  checkLockout(email, req.ip);

  const user = await row('SELECT * FROM users WHERE lower(email) = $1', [email]);
  // Same work and the same message whether or not the account exists.
  const good = user ? await verifyPassword(password, user.passwordHash) : await burnTime();
  if (!user || !good) {
    noteFailure(email, req.ip);
    throw new ApiError('That email address and password do not match.', 401);
  }
  if (user.status !== 'Active') throw new ApiError('That account has been disabled. Ask the AGS team lead.', 403);

  failures.delete(keyFor(email, req.ip));
  const id = await sessions.create(user, req);
  await query('UPDATE users SET "lastLoginAt" = now() WHERE email = $1', [user.email]);
  sessions.setCookie(req, res, id);
  res.json(publicUser(user));
});

router.post('/logout', async (req, res) => {
  const id = sessions.sessionId(req);
  if (id) await sessions.destroy(id);
  sessions.clearCookie(req, res);
  res.status(204).end();
});

// Change your own password. Every other session of yours is signed out.
router.post('/password', requireUser, async (req, res) => {
  if (!passwordMode()) throw new ApiError('Passwords are managed by your company account, not here.', 400);
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const user = await row('SELECT * FROM users WHERE email = $1', [req.user.email]);
  if (!user || !await verifyPassword(current, user.passwordHash)) {
    throw new ApiError('Your current password is not right.', 403);
  }
  if (current === next) throw new ApiError('The new password must be different from the old one');
  checkPasswordQuality(next, { email: user.email, name: user.name });

  await query('UPDATE users SET "passwordHash" = $2, "mustChangePassword" = false WHERE email = $1',
    [user.email, await hashPassword(next)]);
  await sessions.destroyAllFor(user.email, req.user.sessionId);
  res.json({ ok: true, signedOutElsewhere: true });
});

// Update your own name and designation (what appears on your requests).
router.patch('/profile', requireUser, async (req, res) => {
  const name = String(req.body?.name ?? req.user.name).trim();
  const designation = String(req.body?.designation ?? req.user.designation).trim();
  const mobile = String(req.body?.mobile ?? '').trim();
  if (!name) throw new ApiError('Your name cannot be empty');
  const { rows } = await query(
    'UPDATE users SET name = $2, designation = $3, mobile = $4 WHERE email = $1 RETURNING id, name, designation, email, role, mobile',
    [req.user.email, name.slice(0, 80), designation.slice(0, 80), mobile.slice(0, 40)],
  );
  res.json(rows[0]);
});

// Sign out everywhere else.
router.post('/sessions/revoke', requireUser, async (req, res) => {
  await sessions.destroyAllFor(req.user.email, req.user.sessionId);
  res.json({ ok: true });
});

router.get('/sessions', requireUser, async (req, res) => {
  const { rows } = await query(
    `SELECT id, "createdAt", "lastSeenAt", "userAgent", ip FROM sessions
      WHERE "userEmail" = $1 AND "expiresAt" > now() ORDER BY "lastSeenAt" DESC`,
    [req.user.email],
  );
  res.json(rows.map((s) => ({ ...s, id: undefined, current: s.id === req.user.sessionId })));
});

export default router;
