// "My requests" — the signed-in employee's own requisitions.
import { api, loadAll } from '../api.js';
import { esc, byId, plate, today, pad } from '../utils.js';
import { DataTable, pill, openModal, openForm, confirmDialog, toast, icon } from '../ui.js';
import { shownStatus, when, reqFacts, emailHtml, slipReady, printTripSlip } from './reqshared.js';

/** A trip can be called off by the person who asked for it until it starts. */
function cancellable(r) {
  if (r.status === 'Pending') return true;
  if (r.status !== 'Approved') return false;
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return r.requiredDate > today() || (r.requiredDate === today() && r.startTime > hhmm);
}

export async function render(el, ctx) {
  el.innerHTML = `
    <div class="toolbar">
      <span class="lede" style="margin:0">Requests made with ${esc(ctx.user.email)}.</span>
      <span class="spacer"></span>
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search request no., place" aria-label="Search my requests"></div>
      <a class="btn btn-primary" href="#request">Request a car</a>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    return q ? data.mine.filter((r) => [r.reqNo, r.startPoint, r.destination, r.reason, r.status].join(' ').toLowerCase().includes(q)) : data.mine;
  };
  const load = async () => {
    data = await loadAll('requisitions', 'drivers', 'cars', 'outbox', 'settings');
    data.d = byId(data.drivers); data.c = byId(data.cars);
    data.mine = data.requisitions.filter((r) => r.email.toLowerCase() === ctx.user.email.toLowerCase());
    if (table) table.setRows(filter()); else table = new DataTable(el.querySelector('#tbl'), {
      rows: filter(), sortKey: 'requiredDate', sortDir: 'desc',
      empty: '<strong>No requests yet</strong>When you request a car, it shows up here with its status.',
      onRow: (id) => detail(id),
      columns: [
        { key: 'reqNo', label: 'Request no.' },
        { key: 'requiredDate', label: 'Date and time', render: when, sort: (r) => r.requiredDate + r.startTime },
        { key: 'route', label: 'Route', render: (r) => `${esc(r.startPoint)}<br><small class="muted">to ${esc(r.destination)}</small>`, sortable: false },
        { key: 'car', label: 'Driver and car', sortable: false, render: (r) => r.driverId ? `<div class="who">${esc(data.d[r.driverId]?.name)}<small>${esc(data.d[r.driverId]?.mobile)}</small></div>` : '<span class="muted">Not assigned yet</span>' },
        { key: 'plate', label: '', sortable: false, render: (r) => r.carId ? plate(data.c[r.carId]?.regNo) : '' },
        { key: 'status', label: 'Status', render: (r) => pill(shownStatus(r)), sort: shownStatus },
        { key: 'x', label: 'Action', className: 'col-actions', sortable: false, render: (r) => cancellable(r) ? `<div class="row-actions"><button class="btn btn-sm btn-danger" data-cancel="${esc(r.id)}">Cancel</button></div>` : '' },
      ],
    });
  };
  await load();
  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    const r = data.requisitions.find((x) => x.id === b.dataset.cancel);
    const booked = r.status === 'Approved';

    // A booked trip has a car and a driver held for it, so AGS is told why it is off.
    if (booked) {
      return openForm({
        title: `Cancel ${r.reqNo}?`,
        intro: `<p>This trip is booked for <b>${esc(when(r).replace(/<[^>]+>/g, ' '))}</b> with ${esc(data.d[r.driverId]?.name || 'a driver')} and ${esc(data.c[r.carId]?.regNo || 'a car')}. Cancelling frees them for someone else and emails AGS.</p>`,
        fields: [{ name: 'reason', label: 'Why is it no longer needed?', type: 'textarea', required: true, maxlength: 300, full: true, placeholder: 'e.g. The meeting moved to next week' }],
        submitLabel: 'Cancel the trip',
        onSubmit: async ({ reason }) => {
          await api.cancelRequisition(r.id, reason);
          toast(`${r.reqNo} cancelled. AGS has been told.`);
          await load();
          ctx.refreshNav();
        },
      });
    }

    if (!(await confirmDialog({ title: `Cancel ${r.reqNo}?`, message: 'The AGS team lead will no longer see it for approval.', confirmLabel: 'Cancel request', danger: true }))) return;
    try { await api.cancelRequisition(r.id); toast('Request cancelled'); await load(); ctx.refreshNav(); } catch (ex) { toast(ex.message, 'bad'); }
  });

  function detail(id) {
    const r = data.requisitions.find((x) => x.id === id);
    const mail = data.outbox.find((m) => m.reqId === id && m.kind !== 'notification');
    openModal({
      title: `Request ${r.reqNo}`, wide: !!mail,
      body: `${reqFacts(r, data.d, data.c)}${mail ? `<h3 style="margin:20px 0 8px;font-size:16px">Email you received</h3>${emailHtml(mail)}` : ''}`,
      foot: `${slipReady(r) ? `<button class="btn left" id="slip" type="button">${icon.print}Print trip slip</button>` : ''}<button class="btn" data-close>Close</button>`,
      onMount(m) {
        m.querySelector('#slip')?.addEventListener('click', () => printTripSlip(r, data.d[r.driverId], data.c[r.carId], data.settings));
      },
    });
  }
}
