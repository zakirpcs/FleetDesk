// Fuel loads — every refuel, with the payment card used.
import { api, loadAll } from '../api.js';
import { esc, byId, num, num1, bdt, bdt2, fmtDate, fmtTime, today, thisMonth, sum, plate, unitOf, groupBy } from '../utils.js';
import { DataTable, openForm, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';

export async function render(el) {
  el.innerHTML = `
    <div class="toolbar">
      <label class="muted" for="from">From</label><input class="input" type="date" id="from" value="${thisMonth()}-01">
      <label class="muted" for="to">to</label><input class="input" type="date" id="to" value="${today()}">
      <select class="select" id="car" aria-label="Car"><option value="">All cars</option></select>
      <select class="select" id="card" aria-label="Payment"><option value="">All payments</option><option value="cash">Cash</option></select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn btn-primary" id="add">${icon.plus}Record fuel load</button>
    </div>
    <section class="panel" style="margin-bottom:16px">
      <div class="panel-head"><h2>By payment card</h2><span class="muted" id="range"></span></div>
      <div class="panel-body" id="byCard"></div>
    </section>
    <section class="panel" id="tbl"></section>`;

  let data, table, byCardTable;
  const $ = (s) => el.querySelector(s);
  const cardName = (id) => (id && data.k[id] ? `${data.k[id].provider} ••${data.k[id].last4}` : 'Cash');
  const cols = () => [
    { key: 'date', label: 'Date', render: (f) => `${fmtDate(f.date)}<br><small class="muted">${fmtTime(f.time)}</small>`, sort: (f) => f.date + f.time, csv: (f) => `${f.date} ${f.time}` },
    { key: 'carId', label: 'Car', render: (f) => plate(data.c[f.carId]?.regNo), sort: (f) => data.c[f.carId]?.regNo, csv: (f) => data.c[f.carId]?.regNo },
    { key: 'driverId', label: 'Driver', render: (f) => esc(data.d[f.driverId]?.name || '—'), sort: (f) => data.d[f.driverId]?.name, csv: (f) => data.d[f.driverId]?.name },
    { key: 'cardId', label: 'Paid with', render: (f) => esc(cardName(f.cardId)), sort: (f) => cardName(f.cardId), csv: (f) => cardName(f.cardId) },
    { key: 'fuelType', label: 'Fuel' },
    { key: 'qty', label: 'Quantity', num: true, render: (f) => `${num1(f.qty)} ${unitOf(f.fuelType)}` },
    { key: 'amount', label: 'Amount', num: true, render: (f) => bdt2(f.amount) },
    { key: 'odometer', label: 'Odometer', num: true, render: (f) => num(f.odometer) },
    { key: 'station', label: 'Station', render: (f) => `${esc(f.station)}<br><small class="muted">${esc(f.receiptNo || '')}</small>` },
    { key: 'a', label: 'Action', className: 'col-actions', sortable: false, render: (f) => actions(f.id) },
  ];
  const filter = () => {
    const fr = $('#from').value, to = $('#to').value, car = $('#car').value, card = $('#card').value;
    return data.fuel.filter((f) => (!fr || f.date >= fr) && (!to || f.date <= to) && (!car || f.carId === car) &&
      (!card || (card === 'cash' ? !f.cardId : f.cardId === card)));
  };
  const summary = (rows) => {
    const g = groupBy(rows, (f) => f.cardId || 'cash');
    const out = Object.entries(g).map(([id, list]) => ({
      id, name: id === 'cash' ? 'Cash' : cardName(id), n: list.length,
      cars: new Set(list.map((f) => f.carId)).size, amt: sum(list, (f) => f.amount),
      lit: sum(list.filter((f) => f.fuelType !== 'CNG'), (f) => f.qty), cng: sum(list.filter((f) => f.fuelType === 'CNG'), (f) => f.qty),
    }));
    $('#range').textContent = `${fmtDate($('#from').value)} to ${fmtDate($('#to').value)}`;
    const rowsCfg = {
      rows: out, sortKey: 'amt', sortDir: 'desc', empty: 'No fuel loads in this period.',
      columns: [
        { key: 'name', label: 'Payment card' },
        { key: 'n', label: 'Loads', num: true },
        { key: 'cars', label: 'Cars fuelled', num: true },
        { key: 'lit', label: 'Litres', num: true, render: (r) => num1(r.lit) },
        { key: 'cng', label: 'CNG (m³)', num: true, render: (r) => num1(r.cng) },
        { key: 'amt', label: 'Amount', num: true, render: (r) => bdt(r.amt) },
      ],
      foot: (rs) => ['Total', sum(rs, (r) => r.n), '', num1(sum(rs, (r) => r.lit)), num1(sum(rs, (r) => r.cng)), bdt(sum(rs, (r) => r.amt))],
    };
    if (byCardTable) byCardTable.setRows(out); else byCardTable = new DataTable($('#byCard'), rowsCfg);
  };
  const refresh = () => { const rows = filter(); table.setRows(rows); summary(rows); };
  const load = async () => {
    data = await loadAll('fuel', 'cars', 'drivers', 'cards', 'settings');
    data.c = byId(data.cars); data.d = byId(data.drivers); data.k = byId(data.cards);
    if (!$('#car').options[1]) {
      $('#car').insertAdjacentHTML('beforeend', data.cars.map((c) => `<option value="${c.id}">${esc(c.regNo)}</option>`).join(''));
      $('#card').insertAdjacentHTML('beforeend', data.cards.map((k) => `<option value="${k.id}">${esc(k.provider)} ••${esc(k.last4)}</option>`).join(''));
    }
    if (!table) table = new DataTable($('#tbl'), {
      columns: cols(), rows: [], sortKey: 'date', sortDir: 'desc', pageSize: 25,
      empty: '<strong>No fuel loads for this period</strong>Change the filters or record a load.',
      foot: (rows) => ['Total', `${rows.length} loads`, '', '', '', '', bdt2(sum(rows, (f) => f.amount)), '', '', ''],
    });
    refresh();
  };
  await load();

  ['#from', '#to', '#car', '#card'].forEach((s) => $(s).addEventListener('change', refresh));
  $('#add').onclick = () => edit();
  $('#csv').onclick = () => downloadCsv(`fuel_${$('#from').value}_${$('#to').value}.csv`, [...cols().filter((c) => c.label), { key: 'unitPrice', label: 'Rate' }, { key: 'receiptNo', label: 'Receipt' }], table.sorted());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const f = data.fuel.find((x) => x.id === b.dataset.id);
    if (b.dataset.act === 'edit') edit(f);
    if (b.dataset.act === 'del') {
      if (!(await confirmDialog({ title: 'Delete fuel load?', message: `Delete the ${bdt2(f.amount)} load for ${esc(data.c[f.carId]?.regNo)} on ${fmtDate(f.date)}?`, confirmLabel: 'Delete load', danger: true }))) return;
      await api.remove('fuel', f.id); toast('Fuel load deleted'); await load();
    }
  });

  function edit(f) {
    const now = new Date();
    openForm({
      title: f ? 'Edit fuel load' : 'Record fuel load',
      values: f || { date: today(), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` },
      submitLabel: f ? 'Save changes' : 'Save fuel load',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true, max: today() },
        { name: 'time', label: 'Time', type: 'time', required: true },
        { name: 'carId', label: 'Car', type: 'select', required: true, placeholder: 'Choose a car', options: data.cars.filter((c) => c.status !== 'Retired').map((c) => ({ value: c.id, label: `${c.regNo} · ${c.model} (${c.fuelType})` })) },
        { name: 'driverId', label: 'Driver', type: 'select', required: true, placeholder: 'Choose a driver', options: data.drivers.filter((d) => d.status !== 'Inactive').map((d) => ({ value: d.id, label: d.name })) },
        { name: 'cardId', label: 'Paid with', type: 'select', placeholder: 'Cash', options: data.cards.map((k) => ({ value: k.id, label: `${k.provider} •••• ${k.last4}${k.status !== 'Active' ? ` (${k.status})` : ''}`, disabled: k.status !== 'Active' && k.id !== f?.cardId })) },
        { name: 'fuelType', label: 'Fuel type', type: 'select', required: true, options: ['Octane', 'Petrol', 'Diesel', 'CNG'] },
        { name: 'qty', label: 'Quantity', type: 'number', required: true, min: 0.01, step: 0.01, hint: 'Litres, or m³ for CNG' },
        { name: 'unitPrice', label: 'Rate (BDT per unit)', type: 'number', required: true, min: 0, step: 0.01 },
        { name: 'amount', label: 'Amount (BDT)', type: 'number', readonly: true, hint: 'Quantity × rate' },
        { name: 'odometer', label: 'Odometer at fill (km)', type: 'number', required: true, min: 0, step: 'any' },
        { name: 'station', label: 'Filling station', required: true },
        { name: 'receiptNo', label: 'Receipt / memo no.' },
      ],
      onMount(m, form) {
        const calc = () => { form.amount.value = (Number(form.qty.value || 0) * Number(form.unitPrice.value || 0)).toFixed(2); };
        form.carId.addEventListener('change', () => {
          const c = data.c[form.carId.value]; if (!c) return;
          form.fuelType.value = c.fuelType;
          form.unitPrice.value = data.settings.fuelPrices[c.fuelType] ?? '';
          form.odometer.value = c.odometer;
          if (c.driverId && !form.driverId.value) form.driverId.value = c.driverId;
          const card = data.cards.find((k) => k.carId === c.id && k.status === 'Active');
          if (card && !f) form.cardId.value = card.id;
          calc();
        });
        form.fuelType.addEventListener('change', () => { form.unitPrice.value = data.settings.fuelPrices[form.fuelType.value] ?? form.unitPrice.value; calc(); });
        form.qty.addEventListener('input', calc); form.unitPrice.addEventListener('input', calc);
        calc();
      },
      async onSubmit(v) {
        delete v.amount;
        if (f) await api.update('fuel', f.id, v); else await api.create('fuel', v);
        toast(f ? 'Fuel load updated' : 'Fuel load saved'); await load();
      },
    });
  }
}
