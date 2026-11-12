// Daily logbook — one entry per car per day: driver, duty times and odometer readings.
// Feeds running-km reports and driver overtime.
import { api, loadAll } from '../api.js';
import { esc, byId, num, fmtDate, fmtTime, today, thisMonth, sum, plate, hrs, mins } from '../utils.js';
import { DataTable, openForm, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';
import { tripKm } from '../calc.js';

export async function render(el) {
  el.innerHTML = `
    <p class="lede">Record each car's day: who drove, when duty started and ended, and the odometer at both ends. Running km and overtime are calculated from these entries.</p>
    <div class="toolbar">
      <label class="muted" for="from">From</label><input class="input" type="date" id="from" value="${thisMonth()}-01">
      <label class="muted" for="to">to</label><input class="input" type="date" id="to" value="${today()}">
      <select class="select" id="car" aria-label="Car"><option value="">All cars</option></select>
      <select class="select" id="drv" aria-label="Driver"><option value="">All drivers</option></select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn btn-primary" id="add">${icon.plus}Add entry</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  let data, table;
  const $ = (s) => el.querySelector(s);
  const cols = () => [
    { key: 'date', label: 'Date', render: (t) => fmtDate(t.date), sort: (t) => t.date },
    { key: 'carId', label: 'Car', render: (t) => plate(data.c[t.carId]?.regNo), sort: (t) => data.c[t.carId]?.regNo, csv: (t) => data.c[t.carId]?.regNo },
    { key: 'driverId', label: 'Driver', render: (t) => esc(data.d[t.driverId]?.name || '—'), sort: (t) => data.d[t.driverId]?.name, csv: (t) => data.d[t.driverId]?.name },
    { key: 'duty', label: 'Duty', render: (t) => `${fmtTime(t.startTime)} – ${fmtTime(t.endTime)}<br><small class="muted">${hrs(mins(t.endTime) - mins(t.startTime))}</small>`, sort: (t) => mins(t.endTime) - mins(t.startTime), csv: (t) => `${t.startTime}-${t.endTime}` },
    { key: 'startOdo', label: 'Start km', num: true, render: (t) => num(t.startOdo) },
    { key: 'endOdo', label: 'End km', num: true, render: (t) => num(t.endOdo) },
    { key: 'km', label: 'Run (km)', num: true, render: (t) => `<b>${num(tripKm(t))}</b>`, sort: tripKm, csv: tripKm },
    { key: 'to', label: 'Route and purpose', render: (t) => `${esc(t.from)} to ${esc(t.to)}<br><small class="muted">${esc(t.purpose)}</small>`, csv: (t) => `${t.from} to ${t.to} (${t.purpose})` },
    { key: 'a', label: '', sortable: false, render: (t) => actions(t.id) },
  ];
  const filter = () => {
    const f = $('#from').value, to = $('#to').value, car = $('#car').value, drv = $('#drv').value;
    return data.trips.filter((t) => (!f || t.date >= f) && (!to || t.date <= to) && (!car || t.carId === car) && (!drv || t.driverId === drv));
  };
  const load = async () => {
    data = await loadAll('trips', 'cars', 'drivers', 'requisitions');
    data.c = byId(data.cars); data.d = byId(data.drivers);
    if (!$('#car').options[1]) {
      $('#car').insertAdjacentHTML('beforeend', data.cars.map((c) => `<option value="${c.id}">${esc(c.regNo)}</option>`).join(''));
      $('#drv').insertAdjacentHTML('beforeend', data.drivers.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join(''));
    }
    if (table) return table.setRows(filter());
    table = new DataTable($('#tbl'), {
      columns: cols(), rows: filter(), sortKey: 'date', sortDir: 'desc', pageSize: 25,
      empty: '<strong>No entries for this period</strong>Change the dates or add today\'s entries.',
      foot: (rows) => ['Total', `${rows.length} entries`, '', '', '', '', num(sum(rows, tripKm)), '', ''],
    });
  };
  await load();

  ['#from', '#to', '#car', '#drv'].forEach((s) => $(s).addEventListener('change', () => table.setRows(filter())));
  $('#add').onclick = () => edit();
  $('#csv').onclick = () => downloadCsv(`logbook_${$('#from').value}_${$('#to').value}.csv`, cols().filter((c) => c.label), table.sorted());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = data.trips.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'edit') edit(t);
    if (b.dataset.act === 'del') {
      if (!(await confirmDialog({ title: 'Delete logbook entry?', message: `Delete the entry for ${esc(data.c[t.carId]?.regNo)} on ${fmtDate(t.date)}? Running km and overtime will be recalculated.`, confirmLabel: 'Delete entry', danger: true }))) return;
      await api.remove('trips', t.id); toast('Entry deleted'); await load();
    }
  });

  function edit(t) {
    const activeCars = data.cars.filter((c) => c.status !== 'Retired');
    openForm({
      title: t ? 'Edit logbook entry' : 'Add logbook entry',
      values: t || { date: today(), startTime: '08:30', endTime: '18:00', from: 'Head office' },
      submitLabel: t ? 'Save changes' : 'Add entry',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true, max: today() },
        { name: 'carId', label: 'Car', type: 'select', required: true, placeholder: 'Choose a car', options: activeCars.map((c) => ({ value: c.id, label: `${c.regNo} · ${c.model}` })) },
        { name: 'driverId', label: 'Driver', type: 'select', required: true, placeholder: 'Choose a driver', options: data.drivers.filter((d) => d.status !== 'Inactive').map((d) => ({ value: d.id, label: d.name })) },
        { name: 'reqId', label: 'Linked car request', type: 'select', placeholder: 'None (routine duty)', options: data.requisitions.filter((r) => r.status === 'Approved').map((r) => ({ value: r.id, label: `${r.reqNo} · ${r.name} · ${fmtDate(r.requiredDate)}` })) },
        { name: 'startTime', label: 'Duty start', type: 'time', required: true },
        { name: 'endTime', label: 'Duty end', type: 'time', required: true },
        { name: 'startOdo', label: 'Start odometer (km)', type: 'number', required: true, min: 0, step: 'any', hint: 'Filled from the car\'s last reading' },
        { name: 'endOdo', label: 'End odometer (km)', type: 'number', required: true, min: 0, step: 'any' },
        { name: 'from', label: 'From', required: true },
        { name: 'to', label: 'To', required: true },
        { name: 'purpose', label: 'Purpose', full: true, required: true, placeholder: 'e.g. Client visit, staff pick-up' },
      ],
      onMount(m, form) {
        const fill = () => {
          const c = data.c[form.carId.value]; if (!c) return;
          if (!t) form.startOdo.value = c.odometer;
          if (!form.driverId.value && c.driverId) form.driverId.value = c.driverId;
        };
        form.carId.addEventListener('change', fill);
        form.reqId.addEventListener('change', () => {
          const r = data.requisitions.find((x) => x.id === form.reqId.value); if (!r) return;
          form.date.value = r.requiredDate; form.carId.value = r.carId; form.driverId.value = r.driverId;
          form.from.value = r.startPoint; form.to.value = r.destination; form.purpose.value = r.reason; form.startTime.value = r.startTime; fill();
        });
      },
      async onSubmit(v) {
        if (t) await api.update('trips', t.id, v); else await api.create('trips', v);
        toast(t ? 'Entry updated' : `Entry added: ${num(v.endOdo - v.startOdo)} km`); await load();
      },
    });
  }
}
