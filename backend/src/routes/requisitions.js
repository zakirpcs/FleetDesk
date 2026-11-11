// The requisition workflow: submit → the team lead assigns a driver and car →
// confirmation or rejection email. Status only ever changes through these routes.
import { Router } from 'express';
import { ApiError, notFound } from '../errors.js';
import { tx } from '../db.js';
import { isStaff, requireRole } from '../auth.js';
import { coerce, serialise, selectList } from '../schema.js';
import { uid, get } from '../store.js';
import { getSettings } from '../settings.js';
import { queue, deliverSoon } from '../mailer.js';
import { confirmEmail, rejectEmail, newRequestEmail } from '../shared/email.js';

const router = Router();
const CLASH_MINUTES = 180;   // a driver or car booked within 3 hours counts as a clash
const SUBMIT_FIELDS = ['name', 'designation', 'email', 'requiredDate', 'startTime', 'startPoint', 'destination', 'reason'];

const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ || 'Asia/Dhaka' });

/** CR-YYMM-NNN, numbered per calendar month. The advisory lock keeps two submissions apart. */
async function nextReqNo(client, requiredDate) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('fleetdesk.reqNo'))");
  const ym = requiredDate.slice(2, 4) + requiredDate.slice(5, 7);
  const { rows } = await client.query(
    `SELECT coalesce(max(split_part("reqNo", '-', 3)::int), 100) AS last FROM requisitions WHERE "reqNo" LIKE $1`,
    [`CR-${ym}-%`],
  );
  return `CR-${ym}-${rows[0].last + 1}`;
}

async function clashes(client, { date, startTime, driverId, carId, excludeId }) {
  const { rows } = await client.query(
    `SELECT ${selectList('requisitions')} FROM requisitions
      WHERE status = 'Approved' AND "requiredDate" = $1 AND id <> $2
        AND (($3 <> '' AND "driverId" = $3) OR ($4 <> '' AND "carId" = $4))
        AND abs(extract(epoch FROM ("startTime" - $5::time))) < $6
      ORDER BY "startTime"`,
    [date, excludeId || '', driverId || '', carId || '', startTime || '00:00', CLASH_MINUTES * 60],
  );
  return rows.map((r) => serialise('requisitions', r));
}

const lockRequisition = async (client, id) => {
  const { rows } = await client.query(`SELECT ${selectList('requisitions')} FROM requisitions WHERE id = $1 FOR UPDATE`, [id]);
  if (!rows[0]) throw notFound();
  return serialise('requisitions', rows[0]);
};

const mustBePending = (req) => {
  if (req.status !== 'Pending') throw new ApiError(`This request is already ${req.status.toLowerCase()}`, 409);
};

// ---- Submit -----------------------------------------------------------------
router.post('/', async (req, res) => {
  const body = coerce('requisitions', Object.fromEntries(SUBMIT_FIELDS.map((f) => [f, req.body?.[f]])), 'create');
  for (const f of ['name', 'email', 'requiredDate', 'startTime', 'startPoint', 'destination']) {
    if (!body[f]) throw new ApiError(`${f === 'requiredDate' ? 'Car required date' : f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} is required`);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) throw new ApiError('Enter a valid email address for the confirmation');
  if (body.requiredDate < todayISO()) throw new ApiError('Car required date cannot be in the past');

  const settings = await getSettings();
  const { created, mailId } = await tx(async (client) => {
    const rec = {
      id: uid('r'),
      ...body,
      reqNo: await nextReqNo(client, body.requiredDate),
      status: 'Pending',
      reviewedBy: '',
      remarks: '',
      designation: body.designation || '',
      reason: body.reason || '',
    };
    const cols = Object.keys(rec);
    const { rows } = await client.query(
      `INSERT INTO requisitions (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${selectList('requisitions')}`,
      cols.map((c) => rec[c]),
    );
    const out = serialise('requisitions', rows[0]);
    return { created: out, mailId: await queue(client, newRequestEmail(out, settings)) };
  });
  await deliverSoon([mailId]);
  res.status(201).json(created);
});

// ---- Approve ----------------------------------------------------------------
router.post('/:id/approve', requireRole('lead'), async (req, res) => {
  const driverId = String(req.body?.driverId || '').trim();
  const carId = String(req.body?.carId || '').trim();
  const remarks = String(req.body?.remarks || '').trim();
  if (!driverId || !carId) throw new ApiError('Choose a driver and a car before approving');

  const settings = await getSettings();
  const { approved, mailId } = await tx(async (client) => {
    const current = await lockRequisition(client, req.params.id);
    mustBePending(current);
    const driver = (await client.query('SELECT id, name, mobile, status FROM drivers WHERE id = $1', [driverId])).rows[0];
    const car = (await client.query('SELECT id, "regNo", make, model FROM cars WHERE id = $1', [carId])).rows[0];
    if (!driver) throw new ApiError('That driver no longer exists. Reload the page and choose again.');
    if (!car) throw new ApiError('That car no longer exists. Reload the page and choose again.');
    if (driver.status !== 'Active') throw new ApiError(`${driver.name} is ${driver.status.toLowerCase()} and cannot be assigned`);

    const clash = await clashes(client, { date: current.requiredDate, startTime: current.startTime, driverId, carId, excludeId: current.id });
    if (clash.length) throw new ApiError(`Driver or car is already booked around that time (${clash.map((c) => c.reqNo).join(', ')})`, 409);

    const { rows } = await client.query(
      `UPDATE requisitions SET status = 'Approved', "driverId" = $2, "carId" = $3, remarks = $4,
              "reviewedAt" = now(), "reviewedBy" = $5
         WHERE id = $1 RETURNING ${selectList('requisitions')}`,
      [current.id, driverId, carId, remarks, req.user.name || settings.teamLeadName],
    );
    const out = serialise('requisitions', rows[0]);
    return { approved: out, mailId: await queue(client, confirmEmail(out, driver, car, settings)) };
  });
  await deliverSoon([mailId]);
  res.json(approved);
});

// ---- Reject -----------------------------------------------------------------
router.post('/:id/reject', requireRole('lead'), async (req, res) => {
  const remarks = String(req.body?.remarks || '').trim();
  if (!remarks) throw new ApiError('Give a reason so the requester knows what to change');

  const settings = await getSettings();
  const { rejected, mailId } = await tx(async (client) => {
    const current = await lockRequisition(client, req.params.id);
    mustBePending(current);
    const { rows } = await client.query(
      `UPDATE requisitions SET status = 'Rejected', remarks = $2, "reviewedAt" = now(), "reviewedBy" = $3
         WHERE id = $1 RETURNING ${selectList('requisitions')}`,
      [current.id, remarks, req.user.name || settings.teamLeadName],
    );
    const out = serialise('requisitions', rows[0]);
    return { rejected: out, mailId: await queue(client, rejectEmail(out, settings)) };
  });
  await deliverSoon([mailId]);
  res.json(rejected);
});

// ---- Cancel (the requester, while it is still pending) ----------------------
router.post('/:id/cancel', async (req, res) => {
  const out = await tx(async (client) => {
    const current = await lockRequisition(client, req.params.id);
    if (!isStaff(req.user) && current.email.toLowerCase() !== req.user.email.toLowerCase()) {
      throw new ApiError('You can only cancel your own requests.', 403);
    }
    if (current.status !== 'Pending') {
      throw new ApiError('Only pending requests can be cancelled here. Contact AGS for approved trips.', 409);
    }
    const { rows } = await client.query(
      `UPDATE requisitions SET status = 'Cancelled' WHERE id = $1 RETURNING ${selectList('requisitions')}`,
      [current.id],
    );
    return serialise('requisitions', rows[0]);
  });
  res.json(out);
});

// ---- Clash check used by the approval screen --------------------------------
router.get('/conflicts', async (req, res) => {
  if (!isStaff(req.user)) throw new ApiError('That check is for the AGS team.', 403);
  const { date, startTime, driverId, carId, excludeId } = req.query;
  if (!date) throw new ApiError('A date is needed to check for clashes');
  res.json(await tx((client) => clashes(client, {
    date: coerceDate(date), startTime: startTime ? String(startTime).slice(0, 5) : '00:00',
    driverId: driverId ? String(driverId) : '', carId: carId ? String(carId) : '', excludeId: excludeId ? String(excludeId) : '',
  })));
});

function coerceDate(v) {
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError('Date must be in YYYY-MM-DD format');
  return s;
}

// ---- Reads (scoped in routes/collections.js for employees) ------------------
router.get('/:id', async (req, res) => {
  const out = await get('requisitions', req.params.id);
  if (!isStaff(req.user) && out.email.toLowerCase() !== req.user.email.toLowerCase()) throw notFound();
  res.json(out);
});

export default router;
