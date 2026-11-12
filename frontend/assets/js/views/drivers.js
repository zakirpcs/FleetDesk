// Driver inventory.
import { api, loadAll } from '../api.js';
import { esc, num, bdt, fmtDate, today, fromISO, thisMonth, sum, plate, hrs } from '../utils.js';
import { DataTable, pill, openForm, openModal, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';
import { overtimeDays } from '../calc.js';

const daysTo = (iso) => Math.round((fromISO(iso) - fromISO(today())) / 86400000);
const licence = (d) => {
  if (!d.licenseExpiry) return '<span class="muted">—</span>';
  const n = daysTo(d.licenseExpiry);
  if (n < 0) return pill('Expired ' + fmtDate(d.licenseExpiry), 'Expired');
  if (n <= 60) return pill(`Expires in ${n} days`, 'Expiring soon');
  return `<span class="muted">${fmtDate(d.licenseExpiry)}</span>`;
};

export async function render(el) {
  el.innerHTML = `
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search name, ID, mobile" aria-label="Search drivers"></div>
      <select class="select" id="st" aria-label="Filter by status"><option value="">All statuses</option><option>Active</option><option>On leave</option><option>Inactive</option></select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn btn-primary" id="add">${icon.plus}Add driver</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table, ot;
  const carOf = (id) => data.cars.find((c) => c.driverId === id);
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase(), st = el.querySelector('#st').value;
    return data.drivers.filter((d) => (!st || d.status === st) && (!q || [d.name, d.empId, d.mobile, d.licenseNo].join(' ').toLowerCase().includes(q)));
  };
  const load = async () => {
    data = await loadAll('drivers', 'cars', 'trips', 'settings');
    const m = thisMonth();
    ot = {};
    for (const x of overtimeDays(data.trips.filter((t) => t.date.startsWith(m)), data.drivers, data.settings)) {
      const o = (ot[x.driverId] ||= { days: 0, otMin: 0 }); o.days++; o.otMin += x.otMin;
    }
    if (table) return table.setRows(filter());
    table = new DataTable(el.querySelector('#tbl'), {
      rows: filter(), sortKey: 'name', onRow: detail, empty: '<strong>No drivers match</strong>Clear the search or add a driver.',
      columns: [
        { key: 'name', label: 'Driver', render: (d) => `<div class="who">${esc(d.name)}<small>${esc(d.empId)}</small></div>` },
        { key: 'mobile', label: 'Mobile' },
        { key: 'licenseNo', label: 'Driving licence', render: (d) => `<div class="who">${esc(d.licenseNo)}<small>${licence(d)}</small></div>`, sort: (d) => d.licenseExpiry },
        { key: 'car', label: 'Regular car', render: (d) => (carOf(d.id) ? plate(carOf(d.id).regNo) : '<span class="muted">Relief / none</span>'), sort: (d) => carOf(d.id)?.regNo || '' },
        { key: 'days', label: 'Duty days (month)', num: true, render: (d) => num(ot[d.id]?.days || 0), sort: (d) => ot[d.id]?.days || 0 },
        { key: 'ot', label: 'Overtime (month)', num: true, render: (d) => hrs(ot[d.id]?.otMin || 0), sort: (d) => ot[d.id]?.otMin || 0 },
        { key: 'status', label: 'Status', render: (d) => pill(d.status) },
        { key: 'a', label: '', sortable: false, render: (d) => actions(d.id) },
      ],
    });
  };
  await load();

  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#st').addEventListener('change', () => table.setRows(filter()));
  el.querySelector('#add').onclick = () => edit();
  el.querySelector('#csv').onclick = () => downloadCsv('drivers.csv', [
    { key: 'empId', label: 'Employee ID' }, { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile' },
    { key: 'licenseNo', label: 'Licence no.' }, { key: 'licenseExpiry', label: 'Licence expiry' }, { key: 'joinDate', label: 'Joined' },
    { key: 'otRate', label: 'OT rate (BDT/hr)' }, { key: 'status', label: 'Status' },
  ], table.sorted());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'edit') edit(data.drivers.find((d) => d.id === b.dataset.id));
    if (b.dataset.act === 'del') {
      const d = data.drivers.find((x) => x.id === b.dataset.id);
      if (!(await confirmDialog({ title: 'Delete driver?', message: `Delete ${esc(d.name)}? Drivers with logbook history cannot be deleted; set them to Inactive instead.`, confirmLabel: 'Delete driver', danger: true }))) return;
      try { await api.remove('drivers', d.id); toast('Driver deleted'); await load(); } catch (ex) { toast(ex.message, 'bad'); }
    }
  });

  function edit(d) {
    openForm({
      title: d ? `Edit ${d.name}` : 'Add driver',
      values: d || { status: 'Active', otRate: 100, joinDate: today() },
      submitLabel: d ? 'Save changes' : 'Add driver',
      fields: [
        { name: 'name', label: 'Full name', required: true, maxlength: 80 },
        { name: 'empId', label: 'Employee ID', required: true, placeholder: 'DRV-108' },
        { name: 'mobile', label: 'Mobile number', type: 'tel', required: true, placeholder: '01XXX-XXXXXX', pattern: '^(\\+?88)?01[3-9]\\d{2}-?\\d{6}$', hint: 'Included in the confirmation email' },
        { name: 'joinDate', label: 'Joining date', type: 'date' },
        { name: 'licenseNo', label: 'Driving licence number', required: true },
        { name: 'licenseExpiry', label: 'Licence expiry', type: 'date', required: true },
        { name: 'otRate', label: 'Overtime rate (BDT per hour)', type: 'number', required: true, min: 0, step: 'any' },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'On leave', 'Inactive'] },
        { name: 'address', label: 'Address', full: true },
      ],
      async onSubmit(v) {
        if (d) await api.update('drivers', d.id, v); else await api.create('drivers', v);
        toast(d ? 'Driver updated' : 'Driver added'); await load();
      },
    });
  }

  function detail(id) {
    const d = data.drivers.find((x) => x.id === id);
    const m = thisMonth();
    const days = overtimeDays(data.trips.filter((t) => t.date.startsWith(m) && t.driverId === id), data.drivers, data.settings);
    openModal({
      title: d.name,
      body: `<dl class="facts">
          <dt>Status</dt><dd>${pill(d.status)}</dd>
          <dt>Employee ID</dt><dd>${esc(d.empId)}</dd>
          <dt>Mobile</dt><dd>${esc(d.mobile)}</dd>
          <dt>Licence</dt><dd>${esc(d.licenseNo)} · ${licence(d)}</dd>
          <dt>Joined</dt><dd>${fmtDate(d.joinDate)}</dd>
          <dt>Regular car</dt><dd>${carOf(id) ? plate(carOf(id).regNo) : 'None'}</dd>
          <dt>OT rate</dt><dd>${bdt(d.otRate)} per hour</dd>
          <dt>This month</dt><dd>${days.length} duty days · ${hrs(sum(days, (x) => x.otMin))} overtime · ${bdt(sum(days, (x) => x.amount))}</dd>
          <dt>Address</dt><dd>${esc(d.address || '—')}</dd>
        </dl>`,
      foot: `<a class="btn" href="#overtime">Overtime details</a><button class="btn" data-close>Close</button><button class="btn btn-primary" id="ed">Edit driver</button>`,
      onMount(mEl, close) { mEl.querySelector('#ed').onclick = () => { close(); edit(d); }; },
    });
  }
}
