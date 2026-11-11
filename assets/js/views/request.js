// Car requisition form — used by every employee.
import { api } from '../api.js';
import { esc, today, fmtDate, fmtTime } from '../utils.js';
import { fieldHtml, readForm, checkForm, toast } from '../ui.js';

export async function render(el, ctx) {
  const u = ctx.user;
  const fields = [
    { name: 'name', label: 'Name', required: true, autocomplete: 'name', maxlength: 80 },
    { name: 'designation', label: 'Designation', required: true, maxlength: 80 },
    { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', full: true, hint: 'The confirmation with driver and car details is sent here.' },
    { name: 'requiredDate', label: 'Car required date', type: 'date', required: true, min: today() },
    { name: 'startTime', label: 'Starting time', type: 'time', required: true, step: 300 },
    { name: 'startPoint', label: 'Start point', required: true, placeholder: 'e.g. Head office, gate 2', maxlength: 120 },
    { name: 'destination', label: 'Destination', required: true, placeholder: 'e.g. Gulshan-1, client office', maxlength: 120 },
    { name: 'reason', label: 'Reason', type: 'textarea', required: true, full: true, maxlength: 500, placeholder: 'What the trip is for, and anything the driver should know (passengers, luggage, return trip).' },
  ];

  el.innerHTML = `
    <p class="lede">Fill this in at least a few hours before you need the car. The AGS team lead assigns a driver and car, and you get an email once it is approved.</p>
    <div class="req-layout">
      <section class="panel">
        <div class="panel-body">
          <form class="form-grid" id="reqForm" novalidate>
            ${fields.map((f) => fieldHtml(f, { name: u.name, designation: u.designation, email: u.email }[f.name])).join('')}
          </form>
          <div class="callout bad mt" id="reqErr" hidden></div>
          <div class="toolbar mt" style="margin-bottom:0">
            <button class="btn btn-primary" id="submitReq" type="button">Submit request</button>
            <button class="btn btn-ghost" id="clearReq" type="button">Clear trip details</button>
          </div>
        </div>
      </section>
      <aside class="panel">
        <div class="panel-head"><h2>What happens next</h2></div>
        <div class="panel-body">
          <ol class="steps">
            <li><b>You submit the request</b><span>It goes to the AGS team lead for review.</span></li>
            <li><b>Team lead reviews</b><span>They check availability and assign a driver and car.</span></li>
            <li><b>You get a confirmation email</b><span>With driver name, mobile number and car number.</span></li>
          </ol>
          <p class="muted" style="margin:4px 0 0;font-size:14px">Track the status any time under <a href="#my-requests">My requests</a>.</p>
        </div>
      </aside>
    </div>`;

  const form = el.querySelector('#reqForm');
  const err = el.querySelector('#reqErr');

  el.querySelector('#clearReq').onclick = () => {
    for (const n of ['requiredDate', 'startTime', 'startPoint', 'destination', 'reason']) form.elements[n].value = '';
  };

  el.querySelector('#submitReq').onclick = async (e) => {
    err.hidden = true;
    if (!checkForm(form)) return;
    const data = readForm(form);
    if (data.requiredDate === today()) {
      const now = new Date(); const [h, m] = data.startTime.split(':').map(Number);
      if (h * 60 + m < now.getHours() * 60 + now.getMinutes()) { err.textContent = 'Starting time has already passed today. Choose a later time or another date.'; err.hidden = false; return; }
    }
    e.target.disabled = true;
    try {
      const req = await api.submitRequisition(data);
      toast(`Request ${req.reqNo} submitted`);
      ctx.refreshNav();
      showDone(el, req, ctx);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { e.target.disabled = false; }
  };
}

function showDone(el, req, ctx) {
  el.innerHTML = `
    <section class="panel" style="max-width:640px">
      <div class="panel-body">
        <h2 style="font-family:var(--font-head);margin:4px 0 6px;font-size:24px">Request submitted</h2>
        <p style="margin:0 0 16px;color:var(--ink-2)">Your request number is <b>${esc(req.reqNo)}</b>. It is now with the AGS team lead. You will get an email at ${esc(req.email)} once it is approved.</p>
        <dl class="facts">
          <dt>Date and time</dt><dd>${esc(fmtDate(req.requiredDate))}, ${esc(fmtTime(req.startTime))}</dd>
          <dt>Route</dt><dd>${esc(req.startPoint)} to ${esc(req.destination)}</dd>
          <dt>Reason</dt><dd>${esc(req.reason)}</dd>
        </dl>
        <div class="toolbar mt" style="margin-bottom:0">
          <a class="btn btn-primary" href="#my-requests">View my requests</a>
          <button class="btn" id="another" type="button">Request another car</button>
        </div>
      </div>
    </section>`;
  el.querySelector('#another').onclick = () => render(el, ctx);
}
