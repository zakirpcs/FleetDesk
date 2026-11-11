// The settings document. Everyone signed in may read it (the UI needs the shift
// rules and fuel prices); only the team lead may change it.
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { getSettings, putSettings } from '../settings.js';

const router = Router();

router.get('/', async (req, res) => res.json(await getSettings()));
router.put('/', requireRole('lead'), async (req, res) => res.json(await putSettings(req.body)));

export default router;
