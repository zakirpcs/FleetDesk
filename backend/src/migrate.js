// Schema migrations. Every .sql file in db/migrations runs once, in name order,
// inside a transaction, and is recorded in schema_migrations.
//
// A database created before this runner existed is adopted rather than rebuilt: if
// the base tables are already there, 001 is marked as applied instead of re-run.
import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, value } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
// In the image the migrations sit next to the app; in a checkout they are at the top.
const CANDIDATES = [process.env.MIGRATIONS_DIR, resolve(here, '../db/migrations'), resolve(here, '../../db/migrations')].filter(Boolean);
const BASELINE = '001_schema.sql';

async function migrationsDir() {
  for (const dir of CANDIDATES) {
    try { await access(dir); return dir; } catch { /* try the next one */ }
  }
  throw new Error(`No migrations directory found (looked in ${CANDIDATES.join(', ')})`);
}

const tableExists = async (name) => Boolean(await value(
  'SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2', ['public', name],
));

export async function migrate({ dir } = {}) {
  dir ||= await migrationsDir();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          text PRIMARY KEY,
      "appliedAt" timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set((await pool.query('SELECT id FROM schema_migrations')).rows.map((r) => r.id));

  // Adopt a database built by the old db/init script.
  if (!done.has(BASELINE) && files.includes(BASELINE) && await tableExists('drivers')) {
    await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [BASELINE]);
    done.add(BASELINE);
    console.log(`[migrate] existing schema adopted as ${BASELINE}`);
  }

  const pending = files.filter((f) => !done.has(f));
  if (!pending.length) {
    console.log(`[migrate] schema up to date (${files.length} migration${files.length === 1 ? '' : 's'})`);
    return [];
  }

  for (const file of pending) {
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`migration ${file} failed: ${e.message}`);
    } finally {
      client.release();
    }
  }
  return pending;
}
