// Approvals — AGS team lead reviews requests, assigns driver + car, sends confirmation.
import { api, loadAll } from '../api.js';
import { esc, byId, plate, today, fmtTime, mins } from '../utils.js';
import { DataTable, pill, openModal, toast, fieldHtml } from '../ui.js';
import { confirmEmail } from '../email.js';
import { shownStatus, when, reqFacts, emailHtml } from './reqshared.js';

export async function render(el, ctx) {
  const canApprove = ctx.can('approve');
  let tab = 'pending';
  el.innerHTML = `
    ${canApprove ? '' : '<div class="callout warn" style="margin-bottom:14px">You can see requests here, but only the AGS team lead can approve or reject them.</div>'}
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter requests">
        <button data-tab="pending" aria-pressed="true">Waiting for review</button>
        <button data-tab="upcoming" aria-pressed="false">Upcoming trips</button>
        <button data-tab="all" aria-pressed="false">All requests</button>
      </div>
      <span class="spacer"></span>
      <div class="search">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}<input class="input" id="q" type="search" placeholder="Search name, request no., place" aria-label="Search requests"></div>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    let rows = data.requisitions;
    if (tab === 'pending') rows = rows.filter((r) => r.status === 'Pending');
    if (tab === 'upcoming') rows = rows.filter((r) => r.status === 'Approved' && r.requiredDate >= today());
    if (q) rows = rows.filter((r) => [r.reqNo, r.name, r.designation, r.startPoint, r.destination, r.reason].join(' ').toLowerCase().includes(q));
    return rows;
  };
  const load = async () => {
    data = await loadAll('requisitions', 'drivers', 'cars', 'outbox', 'settings');
    data.d = byId(data.drivers); data.c = byId(data.cars);
    if (table) return table.setRows(filter());
    table = new DataTable(el.querySelector('#tbl'), {
      rows: filter(), sortKey: 'requiredDate', sortDir: 'asc',
      empty: '<strong>Nothing waiting</strong>New requests from employees appear here.',
      onRow: (id) => review(id),
      columns: [
        { key: 'reqNo', label: 'Request no.' },
        { key: 'name', label: 'Requested by', render: (r) => `<div class="who">${esc(r.name)}<small>${esc(r.designation)}</small></div>` },
        { key: 'requiredDate', label: 'Needed on', render: when, sort: (r) => r.requiredDate + r.startTime },
        { key: 'route', label: 'Route', sortable: false, render: (r) => `${esc(r.startPoint)}<br><small class="muted">to ${esc(r.destination)}</small>` },
        { key: 'assigned', label: 'Assigned', sortable: false, render: (r) => r.carId ? `${plate(data.c[r.carId]?.regNo)}<br><small class="muted">${esc(data.d[r.driverId]?.name)}</small>` : '<span class="muted">—</span>' },
        { key: 'status', label: 'Status', render: (r) => pill(shownStatus(r)), sort: shownStatus },
        { key: 'go', label: '', sortable: false, render: (r) => r.status === 'Pending' && canApprove ? `<div class="row-actions"><button class="btn btn-sm btn-primary" data-review="${esc(r.id)}">Review</button></div>` : '' },
      ],
    });
  };
  await load();

  el.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    el.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    table.setRows(filter());
  });
  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-review]'); if (b) review(b.dataset.review); });

  function review(id) {
    const r = data.requisitions.find((x) => x.id === id);
    if (r.status !== 'Pending' || !canApprove) {
      const mail = data.outbox.find((m) => m.reqId === id && m.kind !== 'notification');
      return openModal({ title: `Request ${r.reqNo}`, wide: !!mail, body: reqFacts(r, data.d, data.c) + (mail ? `<h3 style="margin:20px 0 8px;font-size:16px">Email sent to requester</h3>${emailHtml(mail)}` : ''), foot: '<button class="btn" data-close>Close</button>' });
    }

    // Bookings on the same day within 3 hours → flag in the dropdowns
    const near = data.requisitions.filter((x) => x.id !== r.id && x.status === 'Approved' && x.requiredDate === r.requiredDate && Math.abs(mins(x.startTime) - mins(r.startTime)) < 180);
    const busyDriver = Object.fromEntries(near.map((x) => [x.driverId, x]));
    const busyCar = Object.fromEntries(near.map((x) => [x.carId, x]));
    const carOpts = data.cars.filter((c) => !['Maintenance', 'Retired'].includes(c.status)).map((c) => ({
      value: c.id, label: `${c.regNo} · ${c.make} ${c.model} (${c.seats} seats)${busyCar[c.id] ? ` · booked ${fmtTime(busyCar[c.id].startTime)}` : ''}`,
    }));
    const drvOpts = data.drivers.filter((d) => d.status === 'Active').map((d) => ({
      value: d.id, label: `${d.name} · ${d.mobile}${busyDriver[d.id] ? ` · booked ${fmtTime(busyDriver[d.id].startTime)}` : ''}`,
    }));

    openModal({
      title: `Review request ${r.reqNo}`, wide: true,
      body: `<div class="grid grid-2">
        <div>
          ${reqFacts(r, data.d, data.c)}
          <form class="form-grid mt" id="assign" novalidate style="grid-template-columns:1fr">
            ${fieldHtml({ name: 'carId', label: 'Car', type: 'select', required: true, placeholder: 'Choose a car', options: carOpts })}
            ${fieldHtml({ name: 'driverId', label: 'Driver', type: 'select', required: true, placeholder: 'Choose a driver', options: drvOpts, hint: 'Picking a car selects its regular driver. You can change it.' })}
            ${fieldHtml({ name: 'remarks', label: 'Note to requester or reason for rejection', type: 'textarea', maxlength: 300, placeholder: 'Optional when approving. Required when rejecting.' })}
          </form>
          <div class="callout warn mt" id="clash" hidden></div>
          <div class="callout bad mt" id="err" hidden></div>
        </div>
        <div>
          <h3 style="margin:0 0 8px;font-size:16px">Confirmation email preview</h3>
          <div id="preview"></div>
        </div>
      </div>`,
      foot: `<button class="btn btn-danger left" id="reject" type="button">Reject request</button>
             <button class="btn" data-close type="button">Close</button>
             <button class="btn btn-primary" id="approve" type="button">Approve and send email</button>`,
      onMount(m, close) {
        const f = m.querySelector('#assign');
        const err = m.querySelector('#err'), clash = m.querySelector('#clash');
        const upd = () => {
          const car = data.c[f.carId.value], drv = data.d[f.driverId.value];
          const preview = confirmEmail({ ...r, remarks: f.remarks.value.trim() }, drv, car, data.settings);
          m.querySelector('#preview').innerHTML = car && drv ? emailHtml(preview) : '<div class="email"><div class="email-body muted">Choose a car and a driver to see the email the requester will get.</div></div>';
          err.hidden = true;
          const msgs = [];
          if (busyCar[f.carId.value]) msgs.push(`This car is booked for ${busyCar[f.carId.value].reqNo} at ${fmtTime(busyCar[f.carId.value].startTime)}.`);
          if (busyDriver[f.driverId.value]) msgs.push(`This driver is booked for ${busyDriver[f.driverId.value].reqNo} at ${fmtTime(busyDriver[f.driverId.value].startTime)}.`);
          clash.textContent = msgs.join(' '); clash.hidden = !msgs.length;
        };
        f.carId.addEventListener('change', () => { const c = data.c[f.carId.value]; if (c?.driverId && data.d[c.driverId]?.status === 'Active') f.driverId.value = c.driverId; upd(); });
        f.driverId.addEventListener('change', upd);
        f.remarks.addEventListener('input', upd);
        upd();
        const act = async (fn, msg) => {
          err.hidden = true;
          try { await fn(); toast(msg); close(); await load(); ctx.refreshNav(); }
          catch (e) { err.textContent = e.message; err.hidden = false; }
        };
        m.querySelector('#approve').onclick = () => act(() => api.approveRequisition(r.id, { carId: f.carId.value, driverId: f.driverId.value, remarks: f.remarks.value.trim() }), `Approved. Confirmation sent to ${r.email}`);
        m.querySelector('#reject').onclick = () => {
          if (!f.remarks.value.trim()) { err.textContent = 'Write the reason for rejection in the note box first.'; err.hidden = false; f.remarks.focus(); return; }
          act(() => api.rejectRequisition(r.id, f.remarks.value.trim()), `Rejected. ${r.name} has been emailed.`);
        };
      },
    });
  }
}
