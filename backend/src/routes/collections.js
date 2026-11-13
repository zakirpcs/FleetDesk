// Generic CRUD for the collections in schema.js.
//
// Reads are scoped to the caller: AGS staff and the team lead see everything, an
// employee sees only their own requisitions, the emails sent about them, and the
// driver and car assigned to them — which is all "My requests" needs to render.
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { isStaff } from '../auth.js';
import { collectionNames, spec } from '../schema.js';
import * as store from '../store.js';

const router = Router();

function scope(name, user) {
  if (isStaff(user)) return { where: '', params: [] };
  const email = user.email.toLowerCase();
  const mine = 'SELECT id, "driverId", "carId" FROM requisitions WHERE lower(email) = $1';
  switch (name) {
    case 'requisitions': return { where: 'lower(email) = $1', params: [email] };
    case 'outbox': return { where: `"reqId" IN (SELECT id FROM (${mine}) m)`, params: [email] };
    case 'drivers': return { where: `id IN (SELECT "driverId" FROM (${mine}) m WHERE "driverId" IS NOT NULL)`, params: [email] };
    case 'cars': return { where: `id IN (SELECT "carId" FROM (${mine}) m WHERE "carId" IS NOT NULL)`, params: [email] };
    default: throw new ApiError('That list is for the AGS team. Ask AGS if you need something from it.', 403);
  }
}

const writable = (name, user) => {
  if (!isStaff(user)) throw new ApiError('Only the AGS team can change fleet records.', 403);
  if (!store.isWritable(name)) throw new ApiError(`${name} are created and changed through the request workflow, not directly.`, 405);
};

// Validate the collection name once, against the registry, for every route below.
router.param('collection', (req, res, next, name) => {
  if (!collectionNames.includes(name)) return next(new ApiError(`Unknown collection ${name}`, 404));
  req.collection = name;
  next();
});

router.get('/:collection', async (req, res) => {
  const { where, params } = scope(req.collection, req.user);
  res.json(await store.list(req.collection, { where, params }));
});

router.get('/:collection/:id', async (req, res) => {
  const { where, params } = scope(req.collection, req.user);
  const found = await store.list(req.collection, {
    where: where ? `(${where}) AND id = $${params.length + 1}` : `id = $1`,
    params: [...params, req.params.id],
  });
  if (!found[0]) throw new ApiError('Record not found', 404);
  res.json(found[0]);
});

// Try a failed or queued message again, now — after fixing the mail server, say.
router.post('/outbox/:id/retry', async (req, res) => {
  if (!isStaff(req.user)) throw new ApiError('Only the AGS team can resend messages.', 403);
  const { deliver } = await import('../mailer.js');
  const [found] = await store.list('outbox', { where: 'id = $1', params: [req.params.id] });
  if (!found) throw new ApiError('Record not found', 404);
  await deliver([req.params.id]);
  const [after] = await store.list('outbox', { where: 'id = $1', params: [req.params.id] });
  res.json(after);
});

// Housekeeping on the message log. The log is the record of what the system sent, so
// clearing an entry is the team lead's call and cannot be undone. A message still
// queued is simply never sent.
router.delete('/outbox/:id', async (req, res) => {
  if (req.user.role !== 'lead') throw new ApiError('Only the AGS team lead can delete from the message log.', 403);
  await store.remove('outbox', req.params.id);
  res.status(204).end();
});

router.post('/:collection', async (req, res) => {
  writable(req.collection, req.user);
  res.status(201).json(await store.create(req.collection, req.body));
});

router.patch('/:collection/:id', async (req, res) => {
  writable(req.collection, req.user);
  res.json(await store.update(req.collection, req.params.id, req.body));
});

router.delete('/:collection/:id', async (req, res) => {
  writable(req.collection, req.user);
  await store.remove(req.collection, req.params.id);
  res.status(204).end();
});

export default router;
export { spec };
