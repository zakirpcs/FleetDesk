// "My requests" — the signed-in employee's own requisitions.
import { api, loadAll } from '../api.js';
import { esc, byId, plate } from '../utils.js';
import { DataTable, pill, openModal, confirmDialog, toast, icon } from '../ui.js';
import { shownStatus, when, reqFacts, emailHtml } from './reqshared.js';

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
    data = await loadAll('requisitions', 'drivers', 'cars', 'outbox');
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
        { key: 'x', label: '', sortable: false, render: (r) => r.status === 'Pending' ? `<div class="row-actions"><button class="btn btn-sm btn-danger" data-cancel="${esc(r.id)}">Cancel</button></div>` : '' },
      ],
    });
  };
  await load();
  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel]'); if (!b) return;
    if (!(await confirmDialog({ title: 'Cancel this request?', message: 'The AGS team lead will no longer see it for approval.', confirmLabel: 'Cancel request', danger: true }))) return;
    try { await api.cancelRequisition(b.dataset.cancel); toast('Request cancelled'); await load(); ctx.refreshNav(); } catch (ex) { toast(ex.message, 'bad'); }
  });

  function detail(id) {
    const r = data.requisitions.find((x) => x.id === id);
    const mail = data.outbox.find((m) => m.reqId === id && m.kind !== 'notification');
    openModal({
      title: `Request ${r.reqNo}`, wide: !!mail,
      body: `${reqFacts(r, data.d, data.c)}${mail ? `<h3 style="margin:20px 0 8px;font-size:16px">Email you received</h3>${emailHtml(mail)}` : ''}`,
      foot: '<button class="btn" data-close>Close</button>',
    });
  }
}
