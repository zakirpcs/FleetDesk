// Accounts, managed by the AGS team lead: who can sign in and what they may do.
// Password hashes never leave this module.
import { Router } from 'express';
import { ApiError, notFound } from '../errors.js';
import { query, row, tx } from '../db.js';
import { ROLES, requireRole, passwordMode } from '../auth.js';
import * as sessions from '../sessions.js';
import { hashPassword, checkPasswordQuality, temporaryPassword } from '../password.js';
import { uid } from '../store.js';

const router = Router();
const SELECT = `SELECT id, email, name, designation, mobile, role, status,
                       "mustChangePassword", "createdAt", "lastLoginAt"
                  FROM users`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function checkRole(role) {
  if (!ROLES.includes(role)) throw new ApiError(`Choose one of: ${ROLES.join(', ')}`);
  return role;
}

/** The lead account is the only one that can manage users, so never leave zero of them. */
async function assertNotLastLead(email, { changingTo } = {}) {
  const current = await row('SELECT role, status FROM users WHERE email = $1', [email]);
  if (!current || current.role !== 'lead' || current.status !== 'Active') return;
  if (changingTo === 'lead') return;
  const { rows } = await query(`SELECT count(*)::int AS n FROM users WHERE role = 'lead' AND status = 'Active' AND email <> $1`, [email]);
  if (!rows[0].n) throw new ApiError('This is the only active team lead. Make someone else a team lead first.', 409);
}

router.use(requireRole('lead'));

router.get('/', async (req, res) => {
  const { rows } = await query(`${SELECT} ORDER BY CASE role WHEN 'lead' THEN 1 WHEN 'ags' THEN 2 ELSE 3 END, name`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  if (!passwordMode()) throw new ApiError('Accounts come from your company directory in this setup.', 400);
  const email = clean(req.body?.email, 120).toLowerCase();
  const name = clean(req.body?.name, 80);
  if (!EMAIL_RE.test(email)) throw new ApiError('Enter a valid email address');
  if (!name) throw new ApiError('Enter the person’s name');
  const role = checkRole(clean(req.body?.role, 20) || 'employee');
  if (await row('SELECT 1 FROM users WHERE lower(email) = $1', [email])) {
    throw new ApiError(`${email} already has an account`, 409);
  }

  // Either the lead sets the first password, or we make a one-time one to pass on.
  const chosen = String(req.body?.password || '');
  const password = chosen || temporaryPassword();
  if (chosen) checkPasswordQuality(chosen, { email, name });

  const { rows } = await query(
    `INSERT INTO users (id, email, name, designation, mobile, role, status, "passwordHash", "mustChangePassword")
     VALUES ($1, $2, $3, $4, $5, $6, 'Active', $7, true)
     RETURNING id, email, name, designation, mobile, role, status, "mustChangePassword", "createdAt", "lastLoginAt"`,
    [uid('u'), email, name, clean(req.body?.designation, 80), clean(req.body?.mobile, 40), role, await hashPassword(password)],
  );
  // Shown once, so the lead can hand it over; it is never readable again.
  res.status(201).json({ ...rows[0], temporaryPassword: password });
});

router.patch('/:id', async (req, res) => {
  const user = await row(`${SELECT} WHERE id = $1`, [req.params.id]);
  if (!user) throw notFound();
  const patch = {
    name: req.body?.name === undefined ? user.name : clean(req.body.name, 80),
    designation: req.body?.designation === undefined ? user.designation : clean(req.body.designation, 80),
    mobile: req.body?.mobile === undefined ? user.mobile : clean(req.body.mobile, 40),
    role: req.body?.role === undefined ? user.role : checkRole(clean(req.body.role, 20)),
    status: req.body?.status === undefined ? user.status : clean(req.body.status, 20),
  };
  if (!patch.name) throw new ApiError('A name is required');
  if (!['Active', 'Disabled'].includes(patch.status)) throw new ApiError('Status must be Active or Disabled');
  if (patch.role !== user.role || patch.status !== user.status) {
    if (user.email === req.user.email && (patch.role !== 'lead' || patch.status !== 'Active')) {
      throw new ApiError('You cannot take away your own access. Ask another team lead.', 409);
    }
    await assertNotLastLead(user.email, { changingTo: patch.status === 'Active' ? patch.role : 'none' });
  }

  const { rows } = await query(
    `UPDATE users SET name = $2, designation = $3, mobile = $4, role = $5, status = $6
      WHERE id = $1 RETURNING id, email, name, designation, mobile, role, status, "mustChangePassword", "createdAt", "lastLoginAt"`,
    [user.id, patch.name, patch.designation, patch.mobile, patch.role, patch.status],
  );
  // A disabled account loses its sessions straight away; so does a changed role.
  if (patch.status !== 'Active' || patch.role !== user.role) await sessions.destroyAllFor(user.email);
  res.json(rows[0]);
});

// Reset someone's password: a one-time password they must change when they sign in.
router.post('/:id/password', async (req, res) => {
  if (!passwordMode()) throw new ApiError('Passwords come from your company directory in this setup.', 400);
  const user = await row(`${SELECT} WHERE id = $1`, [req.params.id]);
  if (!user) throw notFound();
  const password = temporaryPassword();
  await query('UPDATE users SET "passwordHash" = $2, "mustChangePassword" = true WHERE id = $1',
    [user.id, await hashPassword(password)]);
  await sessions.destroyAllFor(user.email);
  res.json({ id: user.id, email: user.email, temporaryPassword: password });
});

router.delete('/:id', async (req, res) => {
  const user = await row(`${SELECT} WHERE id = $1`, [req.params.id]);
  if (!user) throw notFound();
  if (user.email === req.user.email) throw new ApiError('You cannot delete your own account.', 409);
  await assertNotLastLead(user.email, { changingTo: 'none' });
  const { rows } = await query('SELECT count(*)::int AS n FROM requisitions WHERE lower(email) = lower($1)', [user.email]);
  if (rows[0].n) {
    throw new ApiError(`Cannot delete: ${user.name} has ${rows[0].n} car request${rows[0].n === 1 ? '' : 's'}. Disable the account instead.`, 409);
  }
  await tx(async (client) => {
    await client.query('DELETE FROM sessions WHERE "userEmail" = $1', [user.email]);
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
  });
  res.status(204).end();
});

export default router;
