// The settings document. Everyone signed in may read the parts the app needs (shift
// rules, fuel prices); the mail server block and the whole of PUT are the team lead's.
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { requireRole, isStaff } from '../auth.js';
import { getSettings, putSettings, hasMailPassword } from '../settings.js';
import { resolveSmtp, buildTransport } from '../mailer.js';
import { config } from '../config.js';

const router = Router();

/** What the caller is allowed to see. Mail server details are for the lead alone. */
async function visible(settings, user) {
  if (user.role !== 'lead') {
    const { smtp, ...rest } = settings;
    return rest;
  }
  const effective = await resolveSmtp();
  return {
    ...settings,
    smtp: {
      ...settings.smtp,
      // Never the password itself — only whether one is stored.
      hasPassword: await hasMailPassword(),
      // So the page can say where the current settings are coming from.
      source: effective.source,
      envHost: config.smtp.host || '',
    },
  };
}

router.get('/', async (req, res) => res.json(await visible(await getSettings(), req.user)));

router.put('/', requireRole('lead'), async (req, res) => {
  const saved = await putSettings(req.body);
  res.json(await visible(saved, req.user));
});

/**
 * Send one message through the mail server as it is configured right now, and report
 * back exactly what the server said. Not recorded in the outbox: it is a check, not
 * a message the fleet sent.
 */
router.post('/mail-test', requireRole('lead'), async (req, res) => {
  const to = String(req.body?.to || req.user.email).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ApiError('Enter a valid email address to send the test to');

  const smtp = await resolveSmtp();
  if (!smtp.host) throw new ApiError('Fill in the mail server address first, then save.', 400);

  const settings = await getSettings();
  const from = smtp.fromName ? `"${smtp.fromName}" <${settings.senderEmail}>` : settings.senderEmail;
  try {
    const info = await buildTransport(smtp).sendMail({
      from,
      to,
      subject: 'Fleet Desk test message',
      text: `This is a test from Fleet Desk, sent through ${smtp.host}:${smtp.port}. If you are reading it, car request emails will go out the same way.`,
      html: `<p>This is a test from Fleet Desk, sent through <b>${smtp.host}:${smtp.port}</b>.</p><p>If you are reading it, car request emails will go out the same way.</p>`,
    });
    res.json({ ok: true, to, from, host: `${smtp.host}:${smtp.port}`, source: smtp.source, response: String(info.response || 'accepted').slice(0, 200) });
  } catch (e) {
    // The SMTP server's own words are far more useful than anything we could invent.
    throw new ApiError(`${smtp.host}:${smtp.port} refused the test — ${e.message}`, 400, { code: e.code, command: e.command });
  }
});

export default router;
