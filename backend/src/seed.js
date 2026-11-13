// Demo data loader.
//
// The data itself comes from shared/seed.js — the same generator the browser-only
// demo uses — so the containerised app opens with the fleet, logbook, fuel loads and
// requisition history people already know, dated relative to today.
//
//   docker compose exec backend npm run seed -- --force   # wipe and reload
import { query, row, tx, value } from './db.js';
import { config } from './config.js';
import { hashPassword, temporaryPassword } from './password.js';
import { coerce } from './schema.js';
import { insert, uid } from './store.js';
import { putSettings } from './settings.js';
import { seed as generate } from './shared/seed.js';

// The three sign-ins the demo offers. In production this table maps the people your
// directory authenticates onto Fleet Desk roles.
export const DEMO_USERS = [
  { email: 'tahmina.akter@company.local', name: 'Tahmina Akter', designation: 'Senior Executive, HR', role: 'employee' },
  { email: 'habibur.rahman@company.local', name: 'Habibur Rahman', designation: 'Executive, AGS', role: 'ags' },
  { email: 'ags.lead@company.local', name: 'Shafiqul Alam', designation: 'Team Lead, AGS', role: 'lead' },
];

const TABLES = ['audit', 'outbox', 'fuel', 'maintenance', 'trips', 'requisitions', 'cards', 'cars', 'drivers'];   // child → parent
const OUTBOX_FIELDS = ['sentAt', 'status', 'channel', 'kind', 'reqId', 'to', 'cc', 'from', 'subject', 'html', 'text'];

export async function ensureUsers(client) {
  for (const u of DEMO_USERS) {
    await client.query(
      `INSERT INTO users (id, email, name, designation, role, status, "passwordHash")
       VALUES ($1, $2, $3, $4, $5, 'Active', '')
         ON CONFLICT (email) DO UPDATE SET name = $3, designation = $4, role = $5`,
      [uid('u'), u.email, u.name, u.designation, u.role],
    );
  }
}

/**
 * Makes sure somebody can actually sign in.
 *
 * Nothing happens when an active team lead already has a password. Otherwise an
 * account is set up — from ADMIN_EMAIL/ADMIN_PASSWORD, or the sample accounts when
 * demo data is on — and the password is printed to the log once.
 */
export async function ensureAccounts() {
  if (config.auth.mode === 'proxy') return { skipped: 'proxy' };
  const ready = await value(`SELECT count(*)::int FROM users WHERE role = 'lead' AND status = 'Active' AND "passwordHash" <> ''`);
  if (ready) return { ready: true };

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    const password = process.env.ADMIN_PASSWORD || temporaryPassword();
    const mustChange = !process.env.ADMIN_PASSWORD;
    await query(
      `INSERT INTO users (id, email, name, designation, role, status, "passwordHash", "mustChangePassword")
       VALUES ($1, $2, $3, 'Team Lead, AGS', 'lead', 'Active', $4, $5)
         ON CONFLICT (email) DO UPDATE SET role = 'lead', status = 'Active', "passwordHash" = $4, "mustChangePassword" = $5`,
      [uid('u'), adminEmail, process.env.ADMIN_NAME || 'Fleet Desk Administrator', await hashPassword(password), mustChange],
    );
    console.log(`[accounts] team lead ${adminEmail} is ready${process.env.ADMIN_PASSWORD ? '' : ` — one-time password: ${password}`}`);
    return { created: adminEmail };
  }

  // Sample accounts: one shared password, and no forced change, so the demo opens cleanly.
  const { rows } = await query(`SELECT email FROM users WHERE "passwordHash" = ''`);
  if (rows.length) {
    const hash = await hashPassword(config.demoPassword);
    await query(`UPDATE users SET "passwordHash" = $1, "mustChangePassword" = false WHERE "passwordHash" = ''`, [hash]);
    console.log(`[accounts] ${rows.length} sample account(s) can now sign in with the password "${config.demoPassword}" — change it before real use`);
    return { seeded: rows.length };
  }

  const password = temporaryPassword();
  const email = 'admin@fleetdesk.local';
  await query(
    `INSERT INTO users (id, email, name, designation, role, status, "passwordHash", "mustChangePassword")
     VALUES ($1, $2, 'Fleet Desk Administrator', 'Team Lead, AGS', 'lead', 'Active', $3, true)
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = $3, "mustChangePassword" = true`,
    [uid('u'), email, await hashPassword(password)],
  );
  console.log(`[accounts] no account could sign in, so one was created — ${email} / ${password} (you must change it at first sign-in)`);
  return { created: email };
}

const isEmpty = async () => (await value('SELECT count(*)::int FROM drivers')) === 0
  && (await value('SELECT count(*)::int FROM requisitions')) === 0;

/**
 * @param {{force?: boolean}} opts force: empty the tables first. Without it, data is
 *   only loaded into an empty database, so restarting the stack never duplicates rows.
 */
export async function seedDemoData({ force = false } = {}) {
  if (!force && !await isEmpty()) {
    await tx(ensureUsers);
    console.log('[seed] database already has data — left as it is (use --force to replace it)');
    return { skipped: true };
  }

  const data = generate();
  const counts = await tx(async (client) => {
    if (force) {
      await client.query(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
      console.log('[seed] cleared existing rows');
    }
    await ensureUsers(client);

    const out = {};
    // Parent → child, so every reference exists by the time it is used.
    for (const name of ['drivers', 'cars', 'cards', 'requisitions', 'trips', 'fuel', 'maintenance']) {
      for (const rec of data[name]) await insert(client, name, { ...coerce(name, rec, 'create'), id: rec.id });
      out[name] = data[name].length;
    }
    for (const mail of data.outbox) {
      await client.query(
        `INSERT INTO outbox (id, ${OUTBOX_FIELDS.map((f) => `"${f}"`).join(', ')}, attempts)
         VALUES ($1, ${OUTBOX_FIELDS.map((_, i) => `$${i + 2}`).join(', ')}, 1)`,
        [mail.id, ...OUTBOX_FIELDS.map((f) => {
          if (f === 'reqId') return mail[f] || null;
          if (f === 'channel') return mail.channel || 'email';
          return mail[f] ?? '';
        })],
      );
    }
    out.outbox = data.outbox.length;
    return out;
  });

  // Settings go through the same validation an edit in the UI would.
  await putSettings(data.settings);
  console.log(`[seed] loaded ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}`);
  return counts;
}

// `node src/seed.js [--force]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force') || process.argv.includes('-f');
  const { pool, waitForDatabase } = await import('./db.js');
  await waitForDatabase();
  await seedDemoData({ force });
  await pool.end();
}
