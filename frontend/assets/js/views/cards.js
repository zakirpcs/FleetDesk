// Payment (fuel) card inventory with load history.
import { api, loadAll } from '../api.js';
import { esc, byId, num1, bdt, bdt2, fmtDate, fmtTime, fmtMonth, thisMonth, monthsBack, sum, plate, unitOf } from '../utils.js';
import { DataTable, pill, openForm, openModal, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';

const masked = (k) => `•••• ${esc(k.last4)}`;
const expiryState = (ym) => {
  if (!ym) return '';
  const [y, m] = thisMonth().split('-').map(Number);
  const [ey, em] = ym.split('-').map(Number);
  const diff = ey * 12 + em - (y * 12 + m);
  return diff < 0 ? 'Expired' : diff <= 2 ? 'Expiring soon' : '';
};

export async function render(el) {
  el.innerHTML = `
    <p class="lede">Only the last four digits of each card are stored. Click a card to see every fuel load made with it.</p>
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search provider, last 4, car" aria-label="Search cards"></div>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="add">${icon.plus}Add card</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table, used;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    return data.cards.filter((k) => !q || [k.provider, k.last4, k.cardType, data.c[k.carId]?.regNo].join(' ').toLowerCase().includes(q));
  };
  const load = async () => {
    data = await loadAll('cards', 'cars', 'drivers', 'fuel');
    data.c = byId(data.cars); data.d = byId(data.drivers);
    const m = thisMonth();
    used = {};
    for (const f of data.fuel) if (f.cardId && f.date.startsWith(m)) { const u = (used[f.cardId] ||= { amt: 0, n: 0 }); u.amt += f.amount; u.n++; }
    if (table) return table.setRows(filter());
    table = new DataTable(el.querySelector('#tbl'), {
      rows: filter(), sortKey: 'provider', onRow: history,
      empty: '<strong>No cards yet</strong>Add the fuel cards your drivers use.',
      columns: [
        { key: 'provider', label: 'Card', render: (k) => `<div class="who"><span><b>${masked(k)}</b> &nbsp;${esc(k.provider)}</span><small>${esc(k.cardType)}</small></div>` },
        { key: 'carId', label: 'Assigned to', render: (k) => (k.carId ? plate(data.c[k.carId]?.regNo) : '<span class="muted">Pool card</span>'), sort: (k) => data.c[k.carId]?.regNo || '' },
        { key: 'loads', label: 'Loads this month', num: true, render: (k) => used[k.id]?.n || 0, sort: (k) => used[k.id]?.n || 0 },
        { key: 'used', label: 'Spent this month', num: true, render: (k) => bdt(used[k.id]?.amt || 0), sort: (k) => used[k.id]?.amt || 0 },
        { key: 'limit', label: 'Of monthly limit', sortable: false, render: (k) => {
          // Unclamped for the figure, clamped for the bar: an overspend should still read as one.
          const pct = k.monthlyLimit ? ((used[k.id]?.amt || 0) / k.monthlyLimit) * 100 : 0;
          return `<div title="${Math.round(pct)}% of ${bdt(k.monthlyLimit)}"><div class="meter ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}"><span style="width:${Math.min(100, pct)}%"></span></div><small class="muted">${Math.round(pct)}% of ${bdt(k.monthlyLimit)}</small></div>`;
        } },
        { key: 'expiry', label: 'Expires', render: (k) => { const s = expiryState(k.expiry); return s ? pill(fmtMonth(k.expiry), s) : esc(fmtMonth(k.expiry)); } },
        { key: 'status', label: 'Status', render: (k) => pill(k.status) },
        { key: 'a', label: 'Action', className: 'col-actions', sortable: false, render: (k) => actions(k.id) },
      ],
    });
  };
  await load();

  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#add').onclick = () => edit();
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const k = data.cards.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'edit') edit(k);
    if (b.dataset.act === 'del') {
      if (!(await confirmDialog({ title: 'Delete card?', message: `Delete ${esc(k.provider)} card ending ${esc(k.last4)}? Cards with fuel history cannot be deleted; set them to Blocked or Closed instead.`, confirmLabel: 'Delete card', danger: true }))) return;
      try { await api.remove('cards', k.id); toast('Card deleted'); await load(); } catch (ex) { toast(ex.message, 'bad'); }
    }
  });

  function edit(k) {
    openForm({
      title: k ? `Edit card ending ${k.last4}` : 'Add payment card',
      values: k || { status: 'Active', cardType: 'Fleet card' },
      submitLabel: k ? 'Save changes' : 'Add card',
      intro: '<div class="callout" style="margin-bottom:14px">Enter only the last 4 digits. Never record the full card number or PIN here.</div>',
      fields: [
        { name: 'provider', label: 'Provider', required: true, placeholder: 'e.g. Padma Oil' },
        { name: 'cardType', label: 'Card type', type: 'select', options: ['Fleet card', 'Bank card', 'Prepaid card'] },
        { name: 'last4', label: 'Last 4 digits', required: true, pattern: '^\\d{4}$', maxlength: 4, inputmode: 'numeric', placeholder: '4417' },
        { name: 'expiry', label: 'Expiry month', type: 'month', required: true },
        { name: 'carId', label: 'Assigned car', type: 'select', placeholder: 'Pool card (any car)', options: data.cars.map((c) => ({ value: c.id, label: `${c.regNo} · ${c.model}` })) },
        { name: 'monthlyLimit', label: 'Monthly limit (BDT)', type: 'number', required: true, min: 0, step: 'any' },
        { name: 'issuedOn', label: 'Issued on', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Blocked', 'Closed'] },
        { name: 'notes', label: 'Notes', full: true },
      ],
      async onSubmit(v) {
        if (k) await api.update('cards', k.id, v); else await api.create('cards', v);
        toast(k ? 'Card updated' : 'Card added'); await load();
      },
    });
  }

  function history(id) {
    const k = data.cards.find((x) => x.id === id);
    const all = data.fuel.filter((f) => f.cardId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const months = monthsBack(6);
    const cols = [
      { key: 'date', label: 'Date', render: (f) => `${fmtDate(f.date)}<br><small class="muted">${fmtTime(f.time)}</small>`, sort: (f) => f.date + f.time, csv: (f) => `${f.date} ${f.time}` },
      { key: 'carId', label: 'Car', render: (f) => plate(data.c[f.carId]?.regNo), sort: (f) => data.c[f.carId]?.regNo, csv: (f) => data.c[f.carId]?.regNo },
      { key: 'driverId', label: 'Driver', render: (f) => esc(data.d[f.driverId]?.name || '—'), csv: (f) => data.d[f.driverId]?.name },
      { key: 'station', label: 'Station' },
      { key: 'qty', label: 'Quantity', num: true, render: (f) => `${num1(f.qty)} ${unitOf(f.fuelType)}` },
      { key: 'unitPrice', label: 'Rate', num: true, render: (f) => bdt2(f.unitPrice) },
      { key: 'amount', label: 'Amount', num: true, render: (f) => bdt2(f.amount) },
      { key: 'receiptNo', label: 'Receipt' },
    ];
    openModal({
      title: `${k.provider} •••• ${k.last4}`, wide: true,
      body: `<div class="toolbar">
          <select class="select" id="mon" aria-label="Month"><option value="">All months</option>${months.map((m) => `<option value="${m}"${m === thisMonth() ? ' selected' : ''}>${fmtMonth(m)}</option>`).join('')}</select>
          <span id="tot" class="muted"></span><span class="spacer"></span>
          <button class="btn btn-sm" id="hcsv">${icon.download}Export CSV</button>
        </div>
        <div id="htbl"></div>`,
      foot: '<button class="btn" data-close>Close</button>',
      onMount(m) {
        const pick = () => { const v = m.querySelector('#mon').value; return v ? all.filter((f) => f.date.startsWith(v)) : all; };
        const t = new DataTable(m.querySelector('#htbl'), {
          rows: pick(), columns: cols, sortKey: 'date', sortDir: 'desc', pageSize: 12,
          empty: '<strong>No loads in this period</strong>Fuel entries paid with this card appear here.',
          foot: (rows) => ['Total', '', '', '', '', '', bdt2(sum(rows, (f) => f.amount)), ''],
        });
        const tot = () => { const r = pick(); m.querySelector('#tot').textContent = `${r.length} loads · ${bdt(sum(r, (f) => f.amount))}`; };
        tot();
        m.querySelector('#mon').onchange = () => { t.setRows(pick()); tot(); };
        m.querySelector('#hcsv').onclick = () => downloadCsv(`card-${k.last4}-loads.csv`, cols, t.sorted());
      },
    });
  }
}
