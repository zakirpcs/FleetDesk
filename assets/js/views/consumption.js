// Fuel consumption by car.
import { loadAll } from '../api.js';
import { esc, num, num1, num2, bdt, fmtMonth, monthsBack, sum, plate, unitOf } from '../utils.js';
import { DataTable, hbarChart, pill, icon, downloadCsv } from '../ui.js';
import { tripKm } from '../calc.js';

export async function render(el) {
  const data = await loadAll('trips', 'fuel', 'cars');
  const months = monthsBack(6);

  el.innerHTML = `
    <div class="toolbar">
      <select class="select" id="mon" aria-label="Month">${months.map((m, i) => `<option value="${m}">${fmtMonth(m)}${i === 0 ? ' (to date)' : ''}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="grid grid-2">
      <section class="panel"><div class="panel-head"><h2>Fuel cost by car</h2></div><div class="panel-body" id="chart"></div></section>
      <section class="panel"><div class="panel-head"><h2>How to read this</h2></div><div class="panel-body" style="color:var(--ink-2);font-size:14.5px">
        <p style="margin-top:0">Km comes from the daily logbook; fuel comes from recorded loads. Average is km run per litre (or per m³ for CNG) in the month.</p>
        <p>A car is flagged when its average falls more than 15% below its own average for the previous three months. Check for missing logbook entries, fuel loads charged to the wrong car, or a mechanical problem.</p>
        <p style="margin-bottom:0">Monthly averages swing a little because a tank filled late in one month is used in the next.</p>
      </div></section>
    </div>
    <section class="panel mt" id="tbl"></section>`;

  const $ = (s) => el.querySelector(s);
  const stats = (carId, m) => {
    const km = sum(data.trips.filter((t) => t.carId === carId && t.date.startsWith(m)), tripKm);
    const loads = data.fuel.filter((f) => f.carId === carId && f.date.startsWith(m));
    const qty = sum(loads, (f) => f.qty), amt = sum(loads, (f) => f.amount);
    return { km, qty, amt, n: loads.length, eff: qty ? km / qty : 0, cpk: km ? amt / km : 0 };
  };
  let table;
  function draw() {
    const m = $('#mon').value;
    const idx = months.indexOf(m);
    const prev = months.slice(idx + 1, idx + 4);
    const rows = data.cars.map((c) => {
      const s = stats(c.id, m);
      const prevEff = prev.map((p) => stats(c.id, p)).filter((x) => x.eff > 0);
      const base = prevEff.length ? sum(prevEff, (x) => x.eff) / prevEff.length : 0;
      const change = base && s.eff ? (s.eff - base) / base : null;
      return { id: c.id, car: c, ...s, base, change };
    }).filter((r) => r.km || r.qty || r.car.status !== 'Retired');

    $('#kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Fuel cost</div><div class="kpi-value">${bdt(sum(rows, (r) => r.amt))}</div><div class="kpi-note">${sum(rows, (r) => r.n)} loads</div></div>
      <div class="kpi"><div class="kpi-label">Liquid fuel</div><div class="kpi-value">${num(sum(rows.filter((r) => r.car.fuelType !== 'CNG'), (r) => r.qty))}<small>L</small></div></div>
      <div class="kpi"><div class="kpi-label">CNG</div><div class="kpi-value">${num(sum(rows.filter((r) => r.car.fuelType === 'CNG'), (r) => r.qty))}<small>m³</small></div></div>
      <div class="kpi"><div class="kpi-label">Distance run</div><div class="kpi-value">${num(sum(rows, (r) => r.km))}<small>km</small></div></div>
      <div class="kpi"><div class="kpi-label">Fleet cost per km</div><div class="kpi-value">${sum(rows, (r) => r.km) ? `৳ ${num2(sum(rows, (r) => r.amt) / sum(rows, (r) => r.km))}` : '—'}</div><div class="kpi-note">${fmtMonth(m)}</div></div>`;

    hbarChart($('#chart'), {
      data: rows.map((r) => ({ label: `${r.car.model} ${r.car.regNo.slice(-7)}`, value: r.amt, tip: `<b>${esc(r.car.regNo)}</b><br>${bdt(r.amt)} for ${num1(r.qty)} ${unitOf(r.car.fuelType)}` })).sort((a, b) => b.value - a.value),
      format: (v) => (v >= 1000 ? `${num1(v / 1000)}k` : num(v)), unit: 'BDT', labelWidth: 170,
    });

    const cols = [
      { key: 'car', label: 'Car', render: (r) => `${plate(r.car.regNo)} <span class="muted">${esc(r.car.model)}</span>`, sort: (r) => r.car.regNo, csv: (r) => r.car.regNo },
      { key: 'fuel', label: 'Fuel', render: (r) => esc(r.car.fuelType), sort: (r) => r.car.fuelType, csv: (r) => r.car.fuelType },
      { key: 'km', label: 'Km run', num: true, render: (r) => num(r.km) },
      { key: 'n', label: 'Loads', num: true },
      { key: 'qty', label: 'Quantity', num: true, render: (r) => `${num1(r.qty)} ${unitOf(r.car.fuelType)}`, csv: (r) => r.qty.toFixed(2) },
      { key: 'amt', label: 'Cost', num: true, render: (r) => bdt(r.amt), csv: (r) => r.amt.toFixed(2) },
      { key: 'cpk', label: 'Cost per km', num: true, render: (r) => (r.cpk ? `৳ ${num2(r.cpk)}` : '—'), csv: (r) => r.cpk.toFixed(2) },
      { key: 'eff', label: 'Average', num: true, render: (r) => (r.eff ? `${num1(r.eff)} km/${unitOf(r.car.fuelType)}` : '—'), csv: (r) => r.eff.toFixed(2) },
      { key: 'base', label: 'Previous 3 months', num: true, render: (r) => (r.base ? `${num1(r.base)} km/${unitOf(r.car.fuelType)}` : '—'), csv: (r) => r.base.toFixed(2) },
      { key: 'change', label: 'Check', render: (r) => (r.change === null ? '<span class="muted">—</span>' : r.change < -0.15 ? pill(`${Math.round(r.change * 100)}%`, 'Rejected') : `<span class="muted">${r.change > 0 ? '+' : ''}${Math.round(r.change * 100)}%</span>`), sort: (r) => r.change ?? 0, csv: (r) => (r.change === null ? '' : Math.round(r.change * 100) + '%') },
    ];
    if (table) table.setRows(rows);
    else table = new DataTable($('#tbl'), {
      rows, columns: cols, sortKey: 'amt', sortDir: 'desc', empty: 'No data for this month.',
      foot: (rs) => ['All cars', '', num(sum(rs, (r) => r.km)), sum(rs, (r) => r.n), '', bdt(sum(rs, (r) => r.amt)), sum(rs, (r) => r.km) ? `৳ ${num2(sum(rs, (r) => r.amt) / sum(rs, (r) => r.km))}` : '', '', '', ''],
    });
    $('#csv').onclick = () => downloadCsv(`fuel-consumption-${m}.csv`, cols, table.sorted());
  }
  $('#mon').addEventListener('change', draw);
  draw();
}
