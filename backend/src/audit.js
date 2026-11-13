// The audit trail: one row per change, written on the same client as the change
// itself so the two commit or roll back together.
//
// Nothing here throws into the caller's path for its own reasons — a trail that can
// refuse a legitimate fuel entry is worse than one with a gap — but a failure inside
// the transaction will still roll the change back, which is the honest outcome:
// either both are recorded or neither is.
import { pool } from './db.js';
import { currentActor, currentIp } from './context.js';

const MAX_VALUE = 200;    // a note or an address, not a novel
export const auditId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const show = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
};

/** Only the fields that actually moved, as { field: { from, to } }. */
export function diff(before = {}, after = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
    if (key === 'id') continue;
    const from = before?.[key];
    const to = after?.[key];
    if (show(from) === show(to)) continue;
    out[key] = { from: show(from), to: show(to) };
  }
  return out;
}

/** A created record, shown the same shape as a change: every field that was set. */
export const asNew = (rec = {}) => diff({}, rec);
/** A deleted record: everything it held, on the way out. */
export const asGone = (rec = {}) => diff(rec, {});

/**
 * A handle a person recognises months later, kept on the row itself — the car may
 * have been deleted by the time anyone reads the trail.
 */
async function labelFor(client, entity, rec = {}) {
  switch (entity) {
    case 'drivers': return rec.name || '';
    case 'cars': return rec.regNo || '';
    case 'cards': return [rec.provider, rec.last4 && `ending ${rec.last4}`].filter(Boolean).join(' ');
    case 'requisitions': return rec.reqNo || '';
    case 'users': return rec.email || '';
    case 'settings': return 'Settings';
    case 'outbox': return rec.subject || rec.to || '';
    default: {
      // Logbook, fuel and workshop entries: the day and the car it was about.
      let plate = '';
      if (rec.carId) {
        const { rows } = await (client || pool).query('SELECT "regNo" FROM cars WHERE id = $1', [rec.carId]);
        plate = rows[0]?.regNo || '';
      }
      return [rec.date, plate].filter(Boolean).join(' · ');
    }
  }
}

/**
 * Write one entry. `client` should be the transaction the change is running in.
 * Changes made outside a request — the demo seeder, the reminder worker — have no
 * actor and are not recorded: the trail is about people, not about the machine.
 */
export async function record(client, { action, entity, entityId = '', label, changes = {}, record: rec }) {
  const actor = currentActor();
  if (!actor) return null;
  const id = auditId();
  await (client || pool).query(
    `INSERT INTO audit (id, "actorEmail", "actorName", "actorRole", action, entity, "entityId", label, changes, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, actor.email || '', actor.name || '', actor.role || '', action, entity, entityId || '',
      label ?? await labelFor(client, entity, rec || {}), JSON.stringify(changes), currentIp()],
  );
  return id;
}

export const created = (client, entity, rec) =>
  record(client, { action: 'created', entity, entityId: rec?.id, changes: asNew(rec), record: rec });

export const updated = (client, entity, before, after) =>
  record(client, { action: 'updated', entity, entityId: after?.id || before?.id, changes: diff(before, after), record: after || before });

export const deleted = (client, entity, rec) =>
  record(client, { action: 'deleted', entity, entityId: rec?.id, changes: asGone(rec), record: rec });

/** Rows for the Activity page, newest first. */
export async function list({ entity = '', entityId = '', actor = '', action = '', from = '', to = '', limit = 500 } = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('$?', `$${params.length}`)); };
  if (entity) add('entity = $?', entity);
  if (entityId) add('"entityId" = $?', entityId);
  if (actor) add('lower("actorEmail") = $?', actor.toLowerCase());
  if (action) add('action = $?', action);
  if (from) add('at >= $?::date', from);
  if (to) add('at < $?::date + 1', to);
  params.push(Math.min(Math.max(Number(limit) || 500, 1), 5000));
  const { rows } = await pool.query(
    `SELECT id, at, "actorEmail", "actorName", "actorRole", action, entity, "entityId", label, changes, ip
       FROM audit ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}
