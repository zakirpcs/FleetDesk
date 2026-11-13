// Email templates. The frontend uses these for previews and the mock outbox;
// the backend should render the same fields server-side and send via SMTP.
import { esc, fmtDate, fmtTime } from './utils.js';

const pickup = (r) => `${fmtDate(r.requiredDate)}, ${fmtTime(r.startTime)}`;

export function confirmEmail(req, driver, car, settings) {
  const rows = [
    ['Driver name', driver?.name],
    ['Car number', car?.regNo],
    ['Driver mobile no.', driver?.mobile],
    ['Start point', req.startPoint],
    ['Destination', req.destination],
    ['Request date & time', pickup(req)],
  ];
  return {
    to: req.email,
    cc: settings.teamLeadEmail,
    from: settings.senderEmail,
    subject: `Car request confirmed: ${req.reqNo} on ${fmtDate(req.requiredDate)}`,
    kind: 'confirmation',
    reqId: req.id,
    rows,
    html: `
      <p>Dear ${esc(req.name)},</p>
      <p>Your car request <b>${esc(req.reqNo)}</b> has been approved. Your driver and car are below.</p>
      <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v ?? '—')}</b></td></tr>`).join('')}</table>
      ${req.remarks ? `<p>Note from AGS: ${esc(req.remarks)}</p>` : ''}
      <p>Please be at the start point on time. To change or cancel, reply to this email or call AGS.</p>
      <p>Regards,<br>${esc(settings.teamLeadName)}<br>Admin &amp; General Services</p>`,
  };
}

export function rejectEmail(req, settings) {
  return {
    to: req.email,
    cc: settings.teamLeadEmail,
    from: settings.senderEmail,
    subject: `Car request not approved: ${req.reqNo}`,
    kind: 'rejection',
    reqId: req.id,
    html: `
      <p>Dear ${esc(req.name)},</p>
      <p>Your car request <b>${esc(req.reqNo)}</b> for ${esc(pickup(req))} (${esc(req.startPoint)} to ${esc(req.destination)}) could not be approved.</p>
      <p>Reason: ${esc(req.remarks || 'Not stated')}</p>
      <p>You can submit a new request with a different date or time.</p>
      <p>Regards,<br>${esc(settings.teamLeadName)}<br>Admin &amp; General Services</p>`,
  };
}

export function newRequestEmail(req, settings) {
  return {
    to: settings.teamLeadEmail,
    from: settings.senderEmail,
    subject: `New car request ${req.reqNo} from ${req.name}`,
    kind: 'notification',
    reqId: req.id,
    html: `
      <p>A new car request is waiting for your review.</p>
      <table>
        <tr><td>Requested by</td><td><b>${esc(req.name)}</b>, ${esc(req.designation)}</td></tr>
        <tr><td>Required</td><td><b>${esc(pickup(req))}</b></td></tr>
        <tr><td>Route</td><td><b>${esc(req.startPoint)} to ${esc(req.destination)}</b></td></tr>
        <tr><td>Reason</td><td>${esc(req.reason)}</td></tr>
      </table>
      <p>Open Fleet Desk, then Approvals, to assign a driver and car.</p>`,
  };
}

/** Sent to the team lead when a requester calls off a trip that was already approved. */
export function cancelEmail(req, driver, car, settings) {
  const rows = [
    ['Request no.', req.reqNo],
    ['Was booked for', pickup(req)],
    ['Route', `${req.startPoint} to ${req.destination}`],
    ['Driver', driver?.name],
    ['Car', car?.regNo],
    ['Reason given', req.cancelReason],
  ];
  return {
    to: settings.teamLeadEmail,
    cc: req.email,
    from: settings.senderEmail,
    subject: `Car request cancelled: ${req.reqNo} on ${fmtDate(req.requiredDate)}`,
    kind: 'cancellation',
    reqId: req.id,
    rows,
    html: `
      <p>${esc(req.name)} has cancelled this trip. The car and driver are free again.</p>
      <table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v ?? '—')}</b></td></tr>`).join('')}</table>
      <p>Nothing else is needed unless the car was being held for it.</p>`,
  };
}

/**
 * The standing reminder about papers and licences that have run out or are about to.
 * It goes to whoever is listed in Settings → Expiry reminders, on its own schedule —
 * so a tax token coming up for renewal is noticed without anyone opening the app.
 */
export function expiryDigestEmail(items, settings, { date, days = 30, to = '' } = {}) {
  const gone = items.filter((i) => i.days < 0);
  const soon = items.filter((i) => i.days >= 0);
  const age = (i) => (i.days < 0
    ? `expired ${-i.days} day${i.days === -1 ? '' : 's'} ago`
    : i.days === 0 ? 'expires today' : `in ${i.days} day${i.days === 1 ? '' : 's'}`);
  const table = (list) => `<table>
    <tr><td><b>Car or driver</b></td><td><b>Paper</b></td><td><b>Valid to</b></td><td></td></tr>
    ${list.map((i) => `<tr><td>${esc(i.name)}</td><td>${esc(i.label)}</td><td><b>${esc(fmtDate(i.expiry))}</b></td><td>${esc(age(i))}</td></tr>`).join('')}
  </table>`;
  const count = [
    gone.length ? `${gone.length} expired` : '',
    soon.length ? `${soon.length} expiring within ${days} days` : '',
  ].filter(Boolean).join(', ') || 'nothing expiring';
  return {
    to: to || settings.teamLeadEmail,
    from: settings.senderEmail,
    subject: `Fleet papers: ${count}`,
    kind: 'reminder',
    html: `
      <p>Papers and licences across the fleet as of ${esc(fmtDate(date))}.</p>
      ${gone.length ? `<p><b>Already expired — these cars and drivers cannot be booked.</b></p>${table(gone)}` : ''}
      ${soon.length ? `<p><b>Running out within ${days} days.</b></p>${table(soon)}` : ''}
      ${items.length ? '' : '<p>Nothing is expired and nothing runs out in the period checked.</p>'}
      <p>A trip cannot be approved for a date after the paper runs out, so renew these and
         update the date on the car or driver record in Fleet Desk.</p>
      <p>Regards,<br>${esc(settings.teamLeadName)}<br>Admin &amp; General Services</p>`,
  };
}
