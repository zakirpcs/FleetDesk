// PostgreSQL access. Dates, times and numbers are parsed back into the exact
// shapes API_CONTRACT.md promises: 'YYYY-MM-DD', 'HH:MM' and JSON numbers.
import pg from 'pg';
import { config } from './config.js';

const { types, Pool } = pg;
types.setTypeParser(types.builtins.DATE, (v) => v);                 // keep 'YYYY-MM-DD'
types.setTypeParser(types.builtins.TIME, (v) => v.slice(0, 5));     // '09:30:00' → '09:30'
types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));
types.setTypeParser(types.builtins.INT8, (v) => Number(v));

export const pool = new Pool({ connectionString: config.databaseUrl, max: 10, application_name: 'fleetdesk-api' });

pool.on('error', (e) => console.error('[db] idle client error', e.message));

export const query = (text, params) => pool.query(text, params);
export const rows = async (text, params) => (await pool.query(text, params)).rows;
export const row = async (text, params) => (await pool.query(text, params)).rows[0] || null;
export const value = async (text, params) => {
  const r = await row(text, params);
  return r ? Object.values(r)[0] : null;
};

/** Run fn inside a transaction, rolling back on any throw. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Wait for Postgres to accept connections (compose starts us alongside the database). */
export async function waitForDatabase({ attempts = 30, delayMs = 1000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      await query('SELECT 1');
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      console.log(`[db] not ready (${e.code || e.message}), retrying ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/** True once the init scripts in db/init have run. */
export const schemaReady = async () =>
  Boolean(await value("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings'"));
