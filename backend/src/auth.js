// Who is calling, and what that role may do.
//
// AUTH_MODE=password (default): people sign in on Fleet Desk's own login page and
// carry an HttpOnly session cookie. Sessions live in the database — see sessions.js.
//
// AUTH_MODE=proxy: an authenticating proxy in front (oauth2-proxy, mod_auth_openidc,
// Keycloak) sets the identity and group headers named in config.js, and Fleet Desk
// maps the directory groups onto its roles. Only use it where that proxy is the only
// way in: the headers are trusted completely.
import { ApiError } from './errors.js';
import { row } from './db.js';
import { config } from './config.js';
import { readUser, sessionId } from './sessions.js';

export const ROLES = ['employee', 'ags', 'lead'];
export const STAFF = ['ags', 'lead'];

export const isStaff = (user) => STAFF.includes(user.role);
export const passwordMode = () => config.auth.mode !== 'proxy';

async function proxyUser(req) {
  const email = String(req.headers[config.auth.headerEmail] || '').trim().toLowerCase();
  if (!email) return null;
  const groups = String(req.headers[config.auth.headerGroups] || '').split(/[,;\s]+/).filter(Boolean);
  const known = await row('SELECT id, email, name, designation, role, status FROM users WHERE lower(email) = $1', [email]);
  if (known && known.status !== 'Active') throw new ApiError('That account has been disabled. Ask the AGS team lead.', 403);
  const role = groups.includes(config.auth.groupLead) ? 'lead'
    : groups.includes(config.auth.groupAgs) ? 'ags'
      : known?.role || 'employee';
  return {
    id: known?.id || '',
    email,
    name: known?.name || email.split('@')[0].replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    designation: known?.designation || '',
    role,
    mustChangePassword: false,
  };
}

/**
 * Works out who is calling and hangs it on req.user — or leaves it null. Routes that
 * need somebody signed in are gated by requireUser, so /auth/login can be reached
 * without a session.
 */
export async function attachUser(req, res, next) {
  try {
    req.user = passwordMode() ? await readUser(sessionId(req)) : await proxyUser(req);
    next();
  } catch (e) { next(e); }
}

export const requireUser = (req, res, next) => (req.user
  ? next()
  : next(new ApiError('Your session has ended. Please sign in again.', 401)));

/** Gate a route on role. `requireRole('lead')` → only the AGS team lead. */
export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return next(new ApiError('Your session has ended. Please sign in again.', 401));
  if (allowed.includes(req.user.role)) return next();
  next(new ApiError(
    req.user.role === 'employee'
      ? 'That page is for the AGS team. Ask AGS if you need something changed.'
      : 'Only the AGS team lead can do that.',
    403,
  ));
};

/**
 * While a password change is outstanding, only the few routes needed to make it are
 * open. Stops a temporary password from being used as a working account.
 */
const ALLOWED_WHILE_STALE = [/^\/me$/, /^\/auth\//];
export const blockUntilPasswordChanged = (req, res, next) => {
  if (!req.user?.mustChangePassword || ALLOWED_WHILE_STALE.some((re) => re.test(req.path))) return next();
  next(new ApiError('Choose a new password before carrying on.', 403, { mustChangePassword: true }));
};
