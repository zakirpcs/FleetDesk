// The audit trail, read-only and for the team lead: it carries who did what, which
// includes account and settings changes, so it is not fleet data like the rest.
//
// There is no POST, PATCH or DELETE here by design, and the table itself refuses
// them — see db/migrations/008_audit.sql.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import * as audit from '../audit.js';

const router = Router();

router.get('/', requireRole('lead'), async (req, res) => {
  const { entity = '', entityId = '', actor = '', action = '', from = '', to = '', limit } = req.query;
  res.json(await audit.list({
    entity: String(entity), entityId: String(entityId), actor: String(actor),
    action: String(action), from: String(from), to: String(to), limit,
  }));
});

export default router;
