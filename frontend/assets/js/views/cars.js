// Car inventory.
import { api, loadAll } from '../api.js';
import { esc, byId, plate, num, num1, bdt, fmtDate, today, thisMonth, sum, unitOf } from '../utils.js';
import { DataTable, pill, openForm, openModal, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';
import { papersOn, CAR_PAPERS, SOON_DAYS } from '../papers.js';

export function papers(c) {
  const worst = papersOn(c, CAR_PAPERS, today())[0];
  if (!worst) return { label: '—', kind: '' };
  const what = worst.label.replace(' certificate', '');
  if (worst.days < 0) return { label: `${what} expired`, kind: 'Expired' };
  if (worst.days <= SOON_DAYS) return { label: `${what} in ${worst.days} days`, kind: 'Expiring soon' };
  return { label: 'Up to date', kind: 'Active' };
}

export async function render(el, ctx) {
  el.innerHTML = `
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search number, model, driver" aria-label="Search cars"></div>
      <select class="select" id="st" aria-label="Filter by status"><option value="">All statuses</option><option>Available</option><option>On trip</option><option>Maintenance</option><option>Retired</option></select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn btn-primary" id="add">${icon.plus}Add car</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table;
  const cols = () => [
    { key: 'regNo', label: 'Car number', render: (c) => plate(c.regNo) },
    { key: 'model', label: 'Make and model', render: (c) => `<div class="who">${esc(c.make)} ${esc(c.model)}<small>${esc(c.year)} · ${esc(c.seats)} seats · ${esc(c.ownership)}</small></div>`, sort: (c) => c.make + c.model },
    { key: 'fuelType', label: 'Fuel' },
    { key: 'odometer', label: 'Odometer (km)', num: true, render: (c) => num(c.odometer) },
    { key: 'driverId', label: 'Regular driver', render: (c) => data.d[c.driverId] ? `<div class="who">${esc(data.d[c.driverId].name)}<small>${esc(data.d[c.driverId].mobile)}</small></div>` : '<span class="muted">None</span>', sort: (c) => data.d[c.driverId]?.name || '' },
    { key: 'card', label: 'Fuel card', sortable: false, render: (c) => { const k = data.cards.find((x) => x.carId === c.id); return k ? `${esc(k.provider)} ••${esc(k.last4)}` : '<span class="muted">Pool / none</span>'; } },
    { key: 'papers', label: 'Papers', render: (c) => { const p = papers(c); return p.kind === 'Active' ? '<span class="muted">Up to date</span>' : pill(p.label, p.kind); }, sort: (c) => papers(c).kind },
    { key: 'status', label: 'Status', render: (c) => pill(c.status) },
    { key: 'a', label: 'Action', className: 'col-actions', sortable: false, render: (c) => actions(c.id) },
  ];
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase(), st = el.querySelector('#st').value;
    return data.cars.filter((c) => (!st || c.status === st) && (!q || [c.regNo, c.make, c.model, data.d[c.driverId]?.name].join(' ').toLowerCase().includes(q)));
  };
  const load = async () => {
    data = await loadAll('cars', 'drivers', 'cards', 'trips', 'fuel');
    data.d = byId(data.drivers);
    if (table) table.setRows(filter());
    else table = new DataTable(el.querySelector('#tbl'), { columns: cols(), rows: filter(), sortKey: 'regNo', onRow: detail, empty: '<strong>No cars match</strong>Clear the search or add a car.' });
  };
  await load();

  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#st').addEventListener('change', () => table.setRows(filter()));
  el.querySelector('#add').onclick = () => edit();
  el.querySelector('#csv').onclick = () => downloadCsv('cars.csv', [
    { key: 'regNo', label: 'Car number' }, { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }, { key: 'year', label: 'Year' },
    { key: 'fuelType', label: 'Fuel' }, { key: 'tankCapacity', label: 'Tank' }, { key: 'odometer', label: 'Odometer' },
    { key: 'driver', label: 'Regular driver', csv: (c) => data.d[c.driverId]?.name || '' }, { key: 'status', label: 'Status' },
    { key: 'fitnessExpiry', label: 'Fitness expiry' }, { key: 'taxTokenExpiry', label: 'Tax token expiry' }, { key: 'insuranceExpiry', label: 'Insurance expiry' },
  ], table.sorted());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'edit') edit(data.cars.find((c) => c.id === b.dataset.id));
    if (b.dataset.act === 'del') del(b.dataset.id);
  });

  async function del(id) {
    const c = data.cars.find((x) => x.id === id);
    if (!(await confirmDialog({ title: 'Delete car?', message: `Delete ${esc(c.regNo)}? Cars with logbook or fuel history cannot be deleted; set them to Retired instead.`, confirmLabel: 'Delete car', danger: true }))) return;
    try { await api.remove('cars', id); toast('Car deleted'); await load(); } catch (ex) { toast(ex.message, 'bad'); }
  }

  function edit(car) {
    openForm({
      title: car ? `Edit ${car.regNo}` : 'Add car',
      values: car || { fuelType: 'Octane', status: 'Available', ownership: 'Owned', seats: 4 },
      submitLabel: car ? 'Save changes' : 'Add car',
      fields: [
        { name: 'regNo', label: 'Registration number', required: true, full: true, placeholder: 'DHAKA METRO-GA 27-4581', hint: 'Format: city/series, then NN-NNNN', pattern: '.*\\d{2}-\\d{4}$' },
        { name: 'make', label: 'Make', required: true, placeholder: 'Toyota' },
        { name: 'model', label: 'Model', required: true, placeholder: 'Premio' },
        { name: 'year', label: 'Model year', type: 'number', required: true, min: 1990, max: 2030 },
        { name: 'seats', label: 'Seats', type: 'number', required: true, min: 1, max: 60 },
        { name: 'fuelType', label: 'Fuel type', type: 'select', required: true, options: ['Octane', 'Petrol', 'Diesel', 'CNG'] },
        { name: 'tankCapacity', label: 'Tank capacity', type: 'number', required: true, min: 1, step: 'any', hint: 'Litres, or m³ for CNG' },
        { name: 'odometer', label: 'Current odometer (km)', type: 'number', required: true, min: 0, step: 'any' },
        { name: 'ownership', label: 'Ownership', type: 'select', options: ['Owned', 'Rented', 'Leased'] },
        { name: 'driverId', label: 'Regular driver', type: 'select', placeholder: 'None', options: data.drivers.filter((d) => d.status !== 'Inactive').map((d) => ({ value: d.id, label: d.name })) },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Available', 'On trip', 'Maintenance', 'Retired'] },
        { name: 'fitnessExpiry', label: 'Fitness certificate expiry', type: 'date' },
        { name: 'taxTokenExpiry', label: 'Tax token expiry', type: 'date' },
        { name: 'insuranceExpiry', label: 'Insurance expiry', type: 'date' },
      ],
      async onSubmit(v) {
        v.regNo = v.regNo.toUpperCase().replace(/\s+/g, ' ');
        if (car) await api.update('cars', car.id, v); else await api.create('cars', v);
        toast(car ? 'Car updated' : 'Car added'); await load();
      },
    });
  }

  function detail(id) {
    const c = data.cars.find((x) => x.id === id);
    const m = thisMonth();
    const trips = data.trips.filter((t) => t.carId === id && t.date.startsWith(m));
    const loads = data.fuel.filter((f) => f.carId === id && f.date.startsWith(m));
    const km = sum(trips, (t) => t.endOdo - t.startOdo), qty = sum(loads, (f) => f.qty);
    const recent = data.fuel.filter((f) => f.carId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 5);
    const cards = byId(data.cards);
    openModal({
      title: `${c.make} ${c.model}`, wide: true,
      body: `<div style="margin-bottom:16px">${plate(c.regNo, 'lg')}</div>
        <div class="kpis">
          <div class="kpi"><div class="kpi-label">Running this month</div><div class="kpi-value">${num(km)}<small>km</small></div></div>
          <div class="kpi"><div class="kpi-label">Fuel this month</div><div class="kpi-value">${num1(qty)}<small>${unitOf(c.fuelType)}</small></div><div class="kpi-note">${bdt(sum(loads, (f) => f.amount))}</div></div>
          <div class="kpi"><div class="kpi-label">Average</div><div class="kpi-value">${qty ? num1(km / qty) : '—'}<small>km/${unitOf(c.fuelType)}</small></div></div>
        </div>
        <div class="grid grid-2">
          <dl class="facts">
            <dt>Status</dt><dd>${pill(c.status)}</dd>
            <dt>Regular driver</dt><dd>${esc(data.d[c.driverId]?.name || 'None')}</dd>
            <dt>Fuel</dt><dd>${esc(c.fuelType)}, ${esc(c.tankCapacity)} ${unitOf(c.fuelType)} tank</dd>
            <dt>Odometer</dt><dd>${num(c.odometer)} km</dd>
            <dt>Fitness expiry</dt><dd>${fmtDate(c.fitnessExpiry)}</dd>
            <dt>Tax token expiry</dt><dd>${fmtDate(c.taxTokenExpiry)}</dd>
            <dt>Insurance expiry</dt><dd>${fmtDate(c.insuranceExpiry)}</dd>
          </dl>
          <div>
            <h3 style="margin:0 0 6px;font-size:15px">Last fuel loads</h3>
            ${recent.length ? `<table class="data"><tbody>${recent.map((f) => `<tr><td>${fmtDate(f.date)}</td><td class="num">${num1(f.qty)} ${unitOf(f.fuelType)}</td><td class="num">${bdt(f.amount)}</td><td>${f.cardId ? `••${esc(cards[f.cardId]?.last4)}` : 'Cash'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No fuel loads recorded.</p>'}
          </div>
        </div>`,
      foot: `<button class="btn" data-close>Close</button><button class="btn btn-primary" id="ed">Edit car</button>`,
      onMount(mEl, close) { mEl.querySelector('#ed').onclick = () => { close(); edit(c); }; },
    });
  }
}
