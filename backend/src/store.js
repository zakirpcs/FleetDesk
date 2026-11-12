// Generic persistence for the collections in schema.js, plus the business rules
// API_CONTRACT.md asks the server to enforce. Error messages match the ones the
// frontend's mock layer produced, so the UI reads the same either way.
import { ApiError, notFound } from './errors.js';
import { pool, tx } from './db.js';
import { COLLECTIONS, spec, selectList, serialise, coerce, references } from './schema.js';

export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const q = (client, text, params) => (client || pool).query(text, params);

export async function list(name, { where = '', params = [], order } = {}) {
  const s = spec(name);
  const sql = `SELECT ${selectList(name)} FROM ${name}${where ? ` WHERE ${where}` : ''} ORDER BY ${order || s.order}`;
  const { rows } = await q(null, sql, params);
  return rows.map((r) => serialise(name, r));
}

export async function get(name, id, client) {
  const { rows } = await q(client, `SELECT ${selectList(name)} FROM ${name} WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound();
  return serialise(name, rows[0]);
}

async function checkUnique(client, name, rec, existingId) {
  for (const [field, label] of spec(name).unique || []) {
    const v = rec[field];
    if (v === undefined || v === null || v === '') continue;
    const { rows } = await q(client, `SELECT 1 FROM ${name} WHERE lower("${field}") = lower($1) AND id <> $2 LIMIT 1`, [String(v), existingId || '']);
    if (rows.length) throw new ApiError(`${label} "${v}" already exists`, 409);
  }
}

async function checkReferences(client, name, rec) {
  for (const [field, target] of references(name)) {
    const v = rec[field];
    if (!v) continue;
    const { rows } = await q(client, `SELECT 1 FROM ${target} WHERE id = $1`, [v]);
    if (!rows.length) throw new ApiError(`The ${target.replace(/s$/, '')} chosen for ${field} no longer exists. Reload the page and try again.`);
  }
}

/** Rules that go beyond column constraints, phrased for the person filling the form. */
async function checkRules(client, name, rec, existingId) {
  if (name === 'cards' && rec.last4 !== undefined && !/^\d{4}$/.test(String(rec.last4 ?? ''))) {
    throw new ApiError('Enter only the last 4 digits of the card');
  }
  if (name === 'trips') {
    if (Number(rec.endOdo) < Number(rec.startOdo)) throw new ApiError('End odometer must be greater than start odometer');
    if (rec.endTime && rec.startTime && rec.endTime <= rec.startTime) throw new ApiError('End time must be after start time');
    const { rows } = await q(client, 'SELECT 1 FROM trips WHERE date = $1 AND "carId" = $2 AND id <> $3 LIMIT 1', [rec.date, rec.carId, existingId || '']);
    if (rows.length) throw new ApiError('This car already has a logbook entry for that date. Edit the existing entry instead.', 409);
  }
  if (name === 'fuel') {
    if (!(Number(rec.qty) > 0)) throw new ApiError('Quantity must be more than zero');
    if (rec.cardId) {
      const { rows } = await q(client, 'SELECT last4, status FROM cards WHERE id = $1', [rec.cardId]);
      const card = rows[0];
      if (card && card.status !== 'Active') throw new ApiError(`Card ending ${card.last4} is ${card.status.toLowerCase()} and cannot be used`);
    }
  }
}

/** Derived values the client never gets to set. */
function derive(name, rec) {
  if (name === 'fuel') {
    rec.amount = Math.round(Number(rec.qty) * Number(rec.unitPrice) * 100) / 100;
    rec.payment = rec.cardId ? 'Card' : 'Cash';
  }
  return rec;
}

/** A trip or fuel reading can only move a car's odometer forward. */
async function bumpOdometer(client, name, rec) {
  const reading = name === 'trips' ? Number(rec.endOdo) : ['fuel', 'maintenance'].includes(name) ? Number(rec.odometer) : 0;
  if (!reading || !rec.carId) return;
  await q(client, 'UPDATE cars SET odometer = $1 WHERE id = $2 AND odometer < $1', [reading, rec.carId]);
}

// '' is how the API reports "not set"; dates, times and references store that as NULL.
function toDb(name, rec) {
  const out = {};
  for (const [field, v] of Object.entries(rec)) {
    const kind = spec(name).fields[field];
    const nullable = kind && (kind.startsWith('ref:') || kind === 'date' || kind === 'time' || kind === 'ts');
    out[field] = v === '' && nullable ? null : v;
  }
  return out;
}

function insertSql(name, rec) {
  const cols = Object.keys(rec);
  const params = cols.map((_, i) => `$${i + 1}`);
  return {
    text: `INSERT INTO ${name} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${params.join(', ')}) RETURNING ${selectList(name)}`,
    values: cols.map((c) => rec[c]),
  };
}

/** Insert an already-coerced record (used by create and by the demo seeder). */
export async function insert(client, name, record) {
  const rec = derive(name, { ...record });
  rec.id ||= uid(spec(name).idPrefix);
  await checkUnique(client, name, rec, null);
  await checkReferences(client, name, rec);
  await checkRules(client, name, rec, null);
  const { text, values } = insertSql(name, toDb(name, rec));
  const { rows } = await q(client, text, values);
  await bumpOdometer(client, name, rec);
  return serialise(name, rows[0]);
}

export const create = (name, body) => tx((client) => insert(client, name, coerce(name, body, 'create')));

export function update(name, id, body) {
  const patch = coerce(name, body, 'patch');
  return tx(async (client) => {
    const { rows: found } = await q(client, `SELECT ${selectList(name)} FROM ${name} WHERE id = $1 FOR UPDATE`, [id]);
    if (!found[0]) throw notFound();
    const next = derive(name, { ...serialise(name, found[0]), ...patch });
    delete next.id;
    await checkUnique(client, name, next, id);
    await checkReferences(client, name, next);
    await checkRules(client, name, next, id);
    const cols = Object.keys(next);
    const sql = `UPDATE ${name} SET ${cols.map((c, i) => `"${c}" = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${selectList(name)}`;
    const forDb = toDb(name, next);
    const { rows } = await q(client, sql, [id, ...cols.map((c) => forDb[c])]);
    await bumpOdometer(client, name, { ...next, id });
    return serialise(name, rows[0]);
  });
}

export function remove(name, id) {
  return tx(async (client) => {
    const { rows } = await q(client, `SELECT id FROM ${name} WHERE id = $1`, [id]);
    if (!rows[0]) throw notFound();
    for (const [other, field, label] of spec(name).refs || []) {
      const { rows: used } = await q(client, `SELECT count(*)::int AS n FROM ${other} WHERE "${field}" = $1`, [id]);
      if (used[0].n) throw new ApiError(`Cannot delete: used in ${used[0].n} ${label}. Mark it inactive instead.`, 409);
    }
    await q(client, `DELETE FROM ${name} WHERE id = $1`, [id]);
    return null;
  });
}

export const isWritable = (name) => Boolean(COLLECTIONS[name]?.writable);
