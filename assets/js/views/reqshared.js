// Shared pieces for requisition views.
import { esc, fmtDate, fmtTime, fmtDateTime, today, plate } from '../utils.js';
import { pill } from '../ui.js';

export const shownStatus = (r) => (r.status === 'Approved' && r.requiredDate < today() ? 'Completed' : r.status);

export const when = (r) => `${fmtDate(r.requiredDate)}<br><small class="muted">${fmtTime(r.startTime)}</small>`;

export function emailHtml(mail) {
  return `<div class="email">
    <div class="email-meta">
      <span><b>To:</b> ${esc(mail.to)}${mail.cc ? ` &nbsp; <b>Cc:</b> ${esc(mail.cc)}` : ''}</span>
      <span><b>Subject:</b> ${esc(mail.subject)}</span>
      ${mail.sentAt ? `<span><b>Sent:</b> ${esc(fmtDateTime(mail.sentAt))}</span>` : ''}
    </div>
    <div class="email-body">${mail.html}</div>
  </div>`;
}

export function reqFacts(r, drivers = {}, cars = {}) {
  const d = drivers[r.driverId], c = cars[r.carId];
  return `<dl class="facts">
    <dt>Request no.</dt><dd>${esc(r.reqNo)} &nbsp; ${pill(shownStatus(r))}</dd>
    <dt>Requested by</dt><dd>${esc(r.name)}, ${esc(r.designation)}<br><small class="muted">${esc(r.email)}</small></dd>
    <dt>Car required</dt><dd>${esc(fmtDate(r.requiredDate))}, ${esc(fmtTime(r.startTime))}</dd>
    <dt>Start point</dt><dd>${esc(r.startPoint)}</dd>
    <dt>Destination</dt><dd>${esc(r.destination)}</dd>
    <dt>Reason</dt><dd>${esc(r.reason)}</dd>
    <dt>Submitted</dt><dd>${esc(fmtDateTime(r.createdAt))}</dd>
    ${r.reviewedAt ? `<dt>Reviewed</dt><dd>${esc(fmtDateTime(r.reviewedAt))} by ${esc(r.reviewedBy)}</dd>` : ''}
    ${d ? `<dt>Driver</dt><dd>${esc(d.name)} · ${esc(d.mobile)}</dd>` : ''}
    ${c ? `<dt>Car</dt><dd>${plate(c.regNo)} <span class="muted">${esc(c.make)} ${esc(c.model)}</span></dd>` : ''}
    ${r.remarks ? `<dt>${r.status === 'Rejected' ? 'Reason given' : 'Remarks'}</dt><dd>${esc(r.remarks)}</dd>` : ''}
  </dl>`;
}
