// Running km by car, per week and per month.
import { loadAll } from '../api.js';
import { esc, num, fmtShort, fmtMonth, today, addDays, weekStart, monthsBack, sum, plate } from '../utils.js';
import { hbarChart, vbarChart, icon, downloadCsv } from '../ui.js';
import { kmBuckets } from '../calc.js';

export async function render(el) {
  const data = await loadAll('trips', 'cars', 'settings');
  let period = 'week';

  el.innerHTML = `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Period">
        <button data-p="week" aria-pressed="true">By week</button>
        <button data-p="month" aria-pressed="false">By month</button>
      </div>
      <select class="select" id="pick" aria-label="Period to chart"></select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn" id="print">${icon.print}Print</button>
    </div>
    <div class="grid grid-2">
      <section class="panel"><div class="panel-head"><h2 id="h1">Km per car</h2></div><div class="panel-body" id="perCar"></div></section>
      <section class="panel"><div class="panel-head"><h2 id="h2">Fleet total</h2></div><div class="panel-body" id="trend"></div></section>
    </div>
    <section class="panel mt">
      <div class="panel-head"><h2>Running km by car</h2><span class="muted" id="sub"></span></div>
      <div class="panel-body" style="padding:10px 0 0"><div class="table-wrap" id="matrix"></div></div>
    </section>`;

  const $ = (s) => el.querySelector(s);
  const keysFor = () => {
    if (period === 'month') return monthsBack(6).reverse();
    const ws = weekStart(today(), data.settings.weekStartDay);
    return Array.from({ length: 8 }, (_, i) => addDays(ws, -7 * (7 - i)));
  };
  const label = (k) => (period === 'month' ? fmtMonth(k) : `Week of ${fmtShort(k)}`);
  const shortLabel = (k) => (period === 'month' ? fmtMonth(k).slice(0, 3) : fmtShort(k));
  const cars = data.cars.filter((c) => c.status !== 'Retired' || data.trips.some((t) => t.carId === c.id));

  function draw() {
    const keys = keysFor();
    const { table } = kmBuckets(data.trips, period, data.settings);
    const v = (carId, k) => table[carId]?.[k] || 0;

    const pick = $('#pick');
    if (!pick.dataset.period || pick.dataset.period !== period) {
      pick.innerHTML = [...keys].reverse().map((k, i) => `<option value="${k}">${esc(label(k))}${i === 0 ? (period === 'week' ? ' (this week)' : ' (this month)') : ''}</option>`).join('');
      pick.dataset.period = period;
    }
    const sel = pick.value;

    $('#h1').textContent = `Km per car, ${label(sel).replace('Week of', 'week of')}`;
    hbarChart($('#perCar'), {
      data: cars.map((c) => ({ label: `${c.model} ${c.regNo.slice(-7)}`, value: v(c.id, sel), tip: `<b>${esc(c.regNo)}</b><br>${esc(c.make)} ${esc(c.model)}<br>${num(v(c.id, sel))} km` }))
        .sort((a, b) => b.value - a.value),
      format: num, unit: 'km', labelWidth: 170,
    });
    $('#h2').textContent = period === 'week' ? 'Fleet total, last 8 weeks' : 'Fleet total, last 6 months';
    vbarChart($('#trend'), {
      data: keys.map((k) => ({ label: shortLabel(k), value: sum(cars, (c) => v(c.id, k)), tip: `<b>${esc(label(k))}</b><br>${num(sum(cars, (c) => v(c.id, k)))} km across ${cars.length} cars` })),
      format: num, unit: 'km', height: Math.max(220, cars.length * 30 + 22),
    });

    $('#sub').textContent = period === 'week' ? `Weeks start ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][data.settings.weekStartDay]}` : 'Calendar months';
    $('#matrix').innerHTML = `<table class="data">
      <thead><tr><th>Car</th>${keys.map((k) => `<th class="num">${esc(shortLabel(k))}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${cars.map((c) => `<tr><td>${plate(c.regNo)} <span class="muted">${esc(c.model)}</span></td>${keys.map((k) => `<td class="num">${v(c.id, k) ? num(v(c.id, k)) : '<span class="muted">0</span>'}</td>`).join('')}<td class="num"><b>${num(sum(keys, (k) => v(c.id, k)))}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>All cars</td>${keys.map((k) => `<td class="num">${num(sum(cars, (c) => v(c.id, k)))}</td>`).join('')}<td class="num">${num(sum(cars, (c) => sum(keys, (k) => v(c.id, k))))}</td></tr></tfoot>
    </table>`;

    $('#csv').onclick = () => downloadCsv(`running-km-by-${period}.csv`,
      [{ key: 'reg', label: 'Car number' }, { key: 'model', label: 'Model' }, ...keys.map((k) => ({ key: k, label: label(k), csv: (c) => v(c.id, k) })), { key: 't', label: 'Total', csv: (c) => sum(keys, (k) => v(c.id, k)) }],
      cars.map((c) => ({ ...c, reg: c.regNo })));
  }

  $('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    period = b.dataset.p;
    el.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  $('#pick').addEventListener('change', draw);
  $('#print').addEventListener('click', () => window.print());
  draw();
}
