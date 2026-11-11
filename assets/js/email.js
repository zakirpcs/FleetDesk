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
