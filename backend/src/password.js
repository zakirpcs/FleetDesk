// Password hashing with scrypt from Node's own crypto — no extra dependency, and
// deliberately slow so a stolen hash is expensive to attack. Format:
//   scrypt$N$r$p$<salt base64>$<hash base64>
// The parameters live in the string, so raising them later still verifies old hashes.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };
const MIN_LENGTH = 10;

// Not a policy engine: just the handful that show up again and again.
const OBVIOUS = ['password', 'passw0rd', 'fleetdesk', '1234567890', 'qwertyuiop', 'letmein123', 'changeme123'];

export async function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain.normalize('NFKC'), salt, PARAMS.keylen, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(String(plain).normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash something nobody can log in with, to keep failed logins as slow as real ones. */
export const burnTime = () => verifyPassword('no-such-password', `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`);

export function checkPasswordQuality(plain, { email = '', name = '' } = {}) {
  const value = String(plain || '');
  if (value.length < MIN_LENGTH) throw new ApiError(`Choose a password of at least ${MIN_LENGTH} characters`);
  if (value.length > 200) throw new ApiError('That password is too long');
  const flat = value.toLowerCase();
  if (OBVIOUS.some((bad) => flat.includes(bad))) throw new ApiError('That password is too easy to guess. Try an unrelated phrase.');
  const local = email.split('@')[0].toLowerCase();
  if (local && local.length > 2 && flat.includes(local)) throw new ApiError('Leave your email address out of your password');
  if (name && name.length > 2 && flat.includes(name.toLowerCase().split(' ')[0])) throw new ApiError('Leave your name out of your password');
  return value;
}

/** A readable one-time password for a new account or a reset. */
export function temporaryPassword() {
  const words = ['harbour', 'lantern', 'meadow', 'copper', 'ivory', 'cinnamon', 'willow', 'saffron', 'marble', 'ember', 'quartz', 'juniper'];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const digits = String(randomBytes(2).readUInt16BE() % 10000).padStart(4, '0');
  return `${pick()}-${pick()}-${digits}`;
}
