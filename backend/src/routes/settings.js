// The settings document. Everyone signed in may read the parts the app needs (shift
// rules, fuel prices); the mail server block and the whole of PUT are the team lead's.
import { Router } from 'express';
import { ApiError } from '../errors.js';
import { requireRole, isStaff } from '../auth.js';
import { getSettings, putSettings, hasMailPassword, hasSmsApiKey } from '../settings.js';
import { resolveSmtp, buildTransport } from '../mailer.js';
import { resolveSms, sendSms, buildRequest } from '../sms.js';
import { testSms } from '../shared/sms.js';
import { sendDigest } from '../reminders.js';
import * as audit from '../audit.js';
import { config } from '../config.js';

const router = Router();

/** What the caller is allowed to see. Mail server details are for the lead alone. */
async function visible(settings, user) {
  if (user.role !== 'lead') {
    const { smtp, ...rest } = settings;
    return rest;
  }
  const effective = await resolveSmtp();
  const sms = await resolveSms();
  return {
    ...settings,
    sms: {
      ...settings.sms,
      hasApiKey: await hasSmsApiKey(),
      source: sms.source,
      envUrl: config.sms.url || '',
    },
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
  const before = await getSettings();
  const saved = await putSettings(req.body);
  // One level deep, so a changed SMTP port reads as smtp.port rather than as the
  // whole block. The mail password and the API key are not in this document at all.
  const changes = audit.diff(flatten(before), flatten(saved));
  if (Object.keys(changes).length) {
    await audit.record(null, { action: 'updated', entity: 'settings', entityId: 'settings', label: 'Settings', changes });
  }
  res.json(await visible(saved, req.user));
});

const flatten = (doc) => Object.fromEntries(Object.entries(doc).flatMap(([k, v]) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2])
    : [[k, v]])));

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

/**
 * Send one text through the gateway as configured right now, and report back what it
 * said — including the request that was built, which is what you need when a
 * provider's documentation and its behaviour disagree.
 */
router.post('/sms-test', requireRole('lead'), async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!to) throw new ApiError('Enter a mobile number to send the test to');
  const gateway = await resolveSms();
  if (!gateway.url) throw new ApiError('Fill in the gateway address first, then save.', 400);

  const settings = await getSettings();
  const built = buildRequest(gateway, to, testSms(settings));
  const out = await sendSms(to, testSms(settings), gateway);
  res.json({
    ok: true,
    to: out.to,
    source: gateway.source,
    // The secret never comes back, however the gateway wanted it passed.
    request: `${built.method} ${built.url.replace(encodeURIComponent(gateway.apiKey || '\u0000'), '***').replace(gateway.apiKey || '\u0000', '***')}`,
    response: out.response,
  });
});

/**
 * Send the expiry reminder now, to whoever asks for it, whatever the schedule says —
 * so the team lead can see what the weekly digest will look like. It is a real message:
 * it goes to the outbox and counts as today's reminder.
 */
router.post('/reminder-test', requireRole('lead'), async (req, res) => {
  const to = String(req.body?.to || req.user.email).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new ApiError('Enter a valid email address to send the reminder to');
  const out = await sendDigest({ force: true, to });
  if (out.status === 'Failed') throw new ApiError(`The reminder could not be sent — ${out.error}`, 400);
  res.json({
    ok: true,
    to: out.to,
    status: out.status,
    subject: out.subject,
    days: out.days,
    expired: out.items.filter((i) => i.days < 0).length,
    soon: out.items.filter((i) => i.days >= 0).length,
  });
});

export default router;
