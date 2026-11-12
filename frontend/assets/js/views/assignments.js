// Assignment history — which driver took which car, and when.
//
// Two things count as an assignment: a day in the logbook (who actually drove what)
// and an approved car request (who was booked to). The report shows both, so a
// pairing that was booked but never driven is still visible.
import { loadAll } from '../api.js';
import { esc, byId, num, fmtDate, today, thisMonth, sum, plate, initials } from '../utils.js';
import { DataTable, openModal, pill, icon, downloadCsv } from '../ui.js';
import { tripKm } from '../calc.js';

export async function render(el) {
  const data = await loadAll('trips', 'requisitions', 'cars', 'drivers');
  const d = byId(data.drivers), c = byId(data.cars);
  const regularDriver = {};                        // carId → the driver it usually goes out with
  for (const car of data.cars) if (car.driverId) regularDriver[car.id] = car.driverId;

  el.innerHTML = `
    <p class="lede">Who drove which car, over any period. Days come from the daily logbook; bookings come from approved car requests, including ones still to come.</p>
    <div class="toolbar">
      <label class="muted" for="from">From</label><input class="input" type="date" id="from" value="${thisMonth()}-01">
      <label class="muted" for="to">to</label><input class="input" type="date" id="to" value="${today()}">
      <select class="select" id="car" aria-label="Car"><option value="">All cars</option>${data.cars.map((x) => `<option value="${esc(x.id)}">${esc(x.regNo)}</option>`).join('')}</select>
      <select class="select" id="drv" aria-label="Driver"><option value="">All drivers</option>${data.drivers.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn" id="print">${icon.print}Print</button>
    </div>
    <div class="kpis" id="kpis"></div>
    <section class="panel" id="tbl"></section>`;

  const $ = (q) => el.querySelector(q);
  let table, pairs = [], events = [];

  const inRange = (date) => {
    const from = $('#from').value, to = $('#to').value;
    return (!from || date >= from) && (!to || date <= to);
  };

  /** Every assignment in the period, from both sources, as one list. */
  function collect() {
    const car = $('#car').value, drv = $('#drv').value;
    const keep = (carId, driverId) => (!car || carId === car) && (!drv || driverId === drv);

    const fromLogbook = data.trips
      .filter((t) => t.driverId && inRange(t.date) && keep(t.carId, t.driverId))
      .map((t) => ({
        date: t.date, carId: t.carId, driverId: t.driverId, kind: 'Logbook', km: tripKm(t),
        detail: `${t.from} to ${t.to}`, note: t.purpose, reqId: t.reqId,
      }));

    const fromRequests = data.requisitions
      .filter((r) => r.status === 'Approved' && r.driverId && r.carId && inRange(r.requiredDate) && keep(r.carId, r.driverId))
      .map((r) => ({
        date: r.requiredDate, carId: r.carId, driverId: r.driverId, kind: 'Booked', km: 0,
        detail: `${r.startPoint} to ${r.destination}`, note: r.reqNo, reqId: r.id,
      }));

    return [...fromLogbook, ...fromRequests].sort((a, b) => b.date.localeCompare(a.date));
  }

  function draw() {
    events = collect();

    const byPair = {};
    for (const e of events) {
      const key = `${e.driverId}|${e.carId}`;
      const p = (byPair[key] ||= { id: key, driverId: e.driverId, carId: e.carId, days: 0, bookings: 0, km: 0, first: e.date, last: e.date });
      if (e.kind === 'Logbook') { p.days += 1; p.km += e.km; } else p.bookings += 1;
      if (e.date < p.first) p.first = e.date;
      if (e.date > p.last) p.last = e.date;
    }
    pairs = Object.values(byPair).map((p) => ({
      ...p,
      driver: d[p.driverId]?.name || 'Unknown driver',
      empId: d[p.driverId]?.empId || '',
      regNo: c[p.carId]?.regNo || 'Unknown car',
      regular: regularDriver[p.carId] === p.driverId,
    }));

    const coverDays = sum(pairs.filter((p) => !p.regular), (p) => p.days);
    const loggedDays = sum(pairs, (p) => p.days);
    $('#kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Driver and car pairings</div><div class="kpi-value">${pairs.length}</div><div class="kpi-note">${pairs.filter((p) => p.regular).length} are the car's regular driver</div></div>
      <div class="kpi"><div class="kpi-label">Days driven</div><div class="kpi-value">${num(loggedDays)}</div><div class="kpi-note">${num(sum(pairs, (p) => p.bookings))} booked through requests</div></div>
      <div class="kpi"><div class="kpi-label">Km covered</div><div class="kpi-value">${num(sum(pairs, (p) => p.km))}<small>km</small></div></div>
      <div class="kpi"><div class="kpi-label">Cover days</div><div class="kpi-value">${num(coverDays)}</div><div class="kpi-note">${loggedDays ? Math.round((coverDays / loggedDays) * 100) : 0}% driven by someone else's car</div></div>`;

    if (table) table.setRows(pairs);
    else table = new DataTable($('#tbl'), {
      rows: pairs, columns: cols, sortKey: 'days', sortDir: 'desc', pageSize: 25, onRow: breakdown,
      empty: '<strong>No assignments in this period</strong>Widen the dates, or clear the car and driver filters.',
      foot: (rs) => ['All pairings', '', num(sum(rs, (r) => r.days)), num(sum(rs, (r) => r.bookings)), num(sum(rs, (r) => r.km)), '', '', ''],
    });
  }

  const cols = [
    { key: 'driver', label: 'Driver', render: (r) => `<div class="who-row"><span class="avatar" aria-hidden="true">${initials(r.driver)}</span><div class="who">${esc(r.driver)}<small>${esc(r.empId)}</small></div></div>`, csv: (r) => r.driver },
    { key: 'regNo', label: 'Car', render: (r) => plate(r.regNo), csv: (r) => r.regNo },
    { key: 'days', label: 'Days driven', num: true },
    { key: 'bookings', label: 'Booked trips', num: true, render: (r) => (r.bookings ? num(r.bookings) : '<span class="muted">—</span>') },
    { key: 'km', label: 'Km', num: true, render: (r) => num(r.km) },
    { key: 'first', label: 'First', render: (r) => esc(fmtDate(r.first)) },
    { key: 'last', label: 'Last', render: (r) => esc(fmtDate(r.last)) },
    { key: 'regular', label: 'Pairing', render: (r) => pill(r.regular ? 'Regular' : 'Cover', r.regular ? 'Active' : 'On trip'), csv: (r) => (r.regular ? 'Regular' : 'Cover'), sort: (r) => String(!r.regular) },
  ];

  /** Every day that pairing went out. */
  function breakdown(key) {
    const pair = pairs.find((p) => p.id === key);
    const list = events.filter((e) => `${e.driverId}|${e.carId}` === key);
    openModal({
      title: `${pair.driver} with ${pair.regNo}`, wide: true,
      body: `<p class="muted" style="margin:0 0 12px">${num(pair.days)} day${pair.days === 1 ? '' : 's'} in the logbook, ${num(pair.bookings)} booked through requests, ${num(pair.km)} km — ${esc(fmtDate(pair.first))} to ${esc(fmtDate(pair.last))}. ${pair.regular ? 'This is the car’s regular driver.' : 'Cover: the car is usually driven by someone else.'}</p>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Date</th><th>Source</th><th>Route</th><th class="num">Km</th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <td style="white-space:nowrap">${esc(fmtDate(e.date))}</td>
          <td>${pill(e.kind, e.kind === 'Logbook' ? 'Completed' : 'Approved')}${e.kind === 'Booked' ? ` <small class="muted">${esc(e.note)}</small>` : ''}</td>
          <td>${esc(e.detail)}${e.kind === 'Logbook' && e.note ? `<br><small class="muted">${esc(e.note)}</small>` : ''}</td>
          <td class="num">${e.km ? num(e.km) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody>
      </table></div>`,
      foot: `<button class="btn" id="dcsv">${icon.download}Export CSV</button><button class="btn" data-close>Close</button>`,
      onMount(mEl) {
        mEl.querySelector('#dcsv').onclick = () => downloadCsv(
          `assignments-${pair.empId || pair.driverId}-${pair.regNo.slice(-7)}.csv`,
          [{ key: 'date', label: 'Date' }, { key: 'kind', label: 'Source' }, { key: 'detail', label: 'Route' }, { key: 'note', label: 'Purpose or request' }, { key: 'km', label: 'Km' }],
          list,
        );
      },
    });
  }

  ['#from', '#to', '#car', '#drv'].forEach((s) => $(s).addEventListener('change', draw));
  $('#csv').onclick = () => downloadCsv(`assignments_${$('#from').value}_${$('#to').value}.csv`, cols, table.sorted());
  $('#print').addEventListener('click', () => window.print());
  draw();
}
