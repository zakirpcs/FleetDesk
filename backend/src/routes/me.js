// Who is signed in. The frontend prefills the request form from this, builds the
// navigation from `role`, and sends people to the sign-in page when it answers 401.
import { Router } from 'express';
import { passwordMode } from '../auth.js';

const router = Router();

router.get('/', (req, res) => {
  const { id, name, designation, email, role, mustChangePassword } = req.user;
  res.json({
    id, name, designation, email, role,
    mustChangePassword: Boolean(mustChangePassword),
    // 'password' means Fleet Desk signs people in itself, so it can offer sign-out
    // and a password change; 'proxy' means the company account does.
    authMode: passwordMode() ? 'password' : 'proxy',
  });
});

export default router;
