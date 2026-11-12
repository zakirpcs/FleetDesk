// Shared pieces for requisition views.
import { esc, fmtDate, fmtTime, fmtDateTime, today, plate } from '../utils.js';
import { pill, printDocument } from '../ui.js';

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
    ${r.status === 'Cancelled' && r.cancelledAt ? `<dt>Cancelled</dt><dd>${esc(fmtDateTime(r.cancelledAt))}${r.cancelledBy ? ` by ${esc(r.cancelledBy)}` : ''}${r.cancelReason ? `<br><small class="muted">${esc(r.cancelReason)}</small>` : ''}</dd>` : ''}
  </dl>`;
}

/**
 * The slip the driver is handed: who to collect, where to go, and who to call.
 * The bottom half is left blank on purpose — the driver fills in times and odometer
 * readings on the road, and AGS types them into the logbook afterwards.
 */
export function tripSlip(req, driver, car, settings = {}) {
  const line = (label, value) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
  return `<article class="slip">
    <header class="slip-head">
      <div>
        <div class="slip-org">${esc(settings.orgName || 'Admin & General Services')}</div>
        <h1>Car requisition slip</h1>
      </div>
      <div class="slip-no">
        <span>Request no.</span>
        <b>${esc(req.reqNo)}</b>
      </div>
    </header>

    <div class="slip-headline">
      ${car ? plate(car.regNo, 'lg') : '<span class="muted">No car assigned</span>'}
      <div class="slip-driver">
        <b>${esc(driver?.name || 'No driver assigned')}</b>
        <span>${esc(driver?.mobile || '')}</span>
      </div>
      <div class="slip-when">
        <b>${esc(fmtDate(req.requiredDate))}</b>
        <span>${esc(fmtTime(req.startTime))}</span>
      </div>
    </div>

    <table class="slip-facts">
      ${line('Pick up from', esc(req.startPoint))}
      ${line('Going to', esc(req.destination))}
      ${line('Passenger', `${esc(req.name)}${req.designation ? `, ${esc(req.designation)}` : ''}<br><span class="muted">${esc(req.email)}</span>`)}
      ${line('Purpose', esc(req.reason) || '<span class="muted">—</span>')}
      ${car ? line('Car', `${esc(car.make)} ${esc(car.model)}${car.seats ? ` · ${esc(car.seats)} seats` : ''}${car.fuelType ? ` · ${esc(car.fuelType)}` : ''}`) : ''}
      ${req.remarks ? line('Note from AGS', esc(req.remarks)) : ''}
      ${line('Approved by', `${esc(req.reviewedBy || settings.teamLeadName || '')}${req.reviewedAt ? `<span class="muted"> · ${esc(fmtDateTime(req.reviewedAt))}</span>` : ''}`)}
    </table>

    <section class="slip-log">
      <h2>To be filled in on the road</h2>
      <table class="slip-facts">
        <tr><th>Time out</th><td class="slip-blank"></td><th>Time in</th><td class="slip-blank"></td></tr>
        <tr><th>Odometer out</th><td class="slip-blank"></td><th>Odometer in</th><td class="slip-blank"></td></tr>
      </table>
      <div class="slip-signatures">
        <div><span class="slip-rule"></span>Driver</div>
        <div><span class="slip-rule"></span>Passenger</div>
        <div><span class="slip-rule"></span>AGS</div>
      </div>
    </section>

    <footer class="slip-foot">
      Hand this to the driver. Changes or cancellations: call AGS${settings.teamLeadEmail ? ` or write to ${esc(settings.teamLeadEmail)}` : ''}.
      <span>Printed ${esc(fmtDateTime(new Date().toISOString()))}</span>
    </footer>
  </article>`;
}

/** True when there is something worth printing: a trip with a car and driver on it. */
export const slipReady = (r) => r.status === 'Approved' && r.driverId && r.carId;

export const printTripSlip = (req, driver, car, settings) => printDocument(tripSlip(req, driver, car, settings));
