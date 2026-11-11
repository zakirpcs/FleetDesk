// Driver overtime, calculated from logbook duty times.
import { loadAll } from '../api.js';
import { esc, byId, num, bdt, fmtDate, fmtMonth, fmtTime, monthsBack, sum, hrs, pad, DAY_NAMES, weekday } from '../utils.js';
import { DataTable, openModal, pill, icon, downloadCsv } from '../ui.js';
import { overtimeDays } from '../calc.js';

const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const h2 = (m) => (m / 60).toFixed(2);

export async function render(el, ctx) {
  const data = await loadAll('trips', 'drivers', 'settings');
  const s = data.settings;
  const d = byId(data.drivers);
  const months = monthsBack(6);

  el.innerHTML = `
    <div class="toolbar">
      <select class="select" id="mon" aria-label="Month">${months.map((m, i) => `<option value="${m}">${fmtMonth(m)}${i === 0 ? ' (to date)' : ''}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      <button class="btn" id="print">${icon.print}Print</button>
    </div>
    <div class="callout" style="margin-bottom:16px">
      Shift ${fmtTime(s.shiftStart)} to ${fmtTime(s.shiftEnd)} on working days. Time before or after the shift counts once it passes ${s.graceMinutes} minutes, rounded down to ${s.roundingMinutes}-minute steps.
      All duty on ${s.weekendDays.map((x) => DAY_NAMES[x]).join(' and ')}${s.holidays?.length ? ' and listed holidays' : ''} is overtime at ${s.weekendMultiplier}× the driver's rate.
      ${ctx.can('approve') ? '<a href="#admin/settings">Change rules</a>' : ''}
    </div>
    <div class="kpis" id="kpis"></div>
    <section class="panel" id="tbl"></section>`;

  const $ = (q) => el.querySelector(q);
  let table, days, rows;
  const cols = [
    { key: 'name', label: 'Driver', render: (r) => `<div class="who">${esc(r.name)}<small>${esc(r.empId)}</small></div>` },
    { key: 'days', label: 'Duty days', num: true },
    { key: 'duty', label: 'Duty hours', num: true, render: (r) => hrs(r.duty), csv: (r) => h2(r.duty) },
    { key: 'wd', label: 'OT, working days', num: true, render: (r) => hrs(r.wd), csv: (r) => h2(r.wd) },
    { key: 'off', label: 'OT, weekends and holidays', num: true, render: (r) => hrs(r.off), csv: (r) => h2(r.off) },
    { key: 'rate', label: 'Rate per hour', num: true, render: (r) => bdt(r.rate) },
    { key: 'amount', label: 'Overtime pay', num: true, render: (r) => `<b>${bdt(r.amount)}</b>`, csv: (r) => r.amount.toFixed(2) },
  ];

  function draw() {
    const m = $('#mon').value;
    days = overtimeDays(data.trips.filter((t) => t.date.startsWith(m)), data.drivers, s);
    rows = data.drivers.map((dr) => {
      const mine = days.filter((x) => x.driverId === dr.id);
      return {
        id: dr.id, name: dr.name, empId: dr.empId, rate: dr.otRate, days: mine.length,
        duty: sum(mine, (x) => x.dutyMin), wd: sum(mine.filter((x) => !x.offDay), (x) => x.otMin),
        off: sum(mine.filter((x) => x.offDay), (x) => x.otMin), amount: sum(mine, (x) => x.amount),
      };
    }).filter((r) => r.days || d[r.id].status === 'Active');
    const otTotal = sum(rows, (r) => r.wd + r.off);
    $('#kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Overtime pay</div><div class="kpi-value">${bdt(sum(rows, (r) => r.amount))}</div><div class="kpi-note">${fmtMonth(m)}</div></div>
      <div class="kpi"><div class="kpi-label">Overtime hours</div><div class="kpi-value">${num(otTotal / 60)}<small>h</small></div></div>
      <div class="kpi"><div class="kpi-label">On weekends and holidays</div><div class="kpi-value">${num(sum(rows, (r) => r.off) / 60)}<small>h</small></div></div>
      <div class="kpi"><div class="kpi-label">Drivers with overtime</div><div class="kpi-value">${rows.filter((r) => r.wd + r.off > 0).length}<small>of ${rows.length}</small></div></div>`;
    if (table) table.setRows(rows);
    else table = new DataTable($('#tbl'), {
      rows, columns: cols, sortKey: 'amount', sortDir: 'desc', onRow: breakdown, empty: 'No logbook entries this month.',
      foot: (rs) => ['All drivers', sum(rs, (r) => r.days), hrs(sum(rs, (r) => r.duty)), hrs(sum(rs, (r) => r.wd)), hrs(sum(rs, (r) => r.off)), '', bdt(sum(rs, (r) => r.amount))],
    });
  }

  function breakdown(id) {
    const list = days.filter((x) => x.driverId === id).sort((a, b) => a.date.localeCompare(b.date));
    const dr = d[id];
    openModal({
      title: `${dr.name}: ${fmtMonth($('#mon').value)}`, wide: true,
      body: `<div class="table-wrap"><table class="data">
        <thead><tr><th>Date</th><th>Duty</th><th class="num">Duty hours</th><th class="num">Overtime</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${list.map((x) => `<tr>
          <td>${fmtDate(x.date)} <small class="muted">${DAY_NAMES[weekday(x.date)].slice(0, 3)}</small> ${x.offDay ? pill('Off day', 'Pending') : ''}</td>
          <td>${fmtTime(hhmm(x.start))} – ${fmtTime(hhmm(x.end))}</td>
          <td class="num">${hrs(x.dutyMin)}</td>
          <td class="num">${x.otMin ? hrs(x.otMin) : '<span class="muted">—</span>'}</td>
          <td class="num">${bdt(dr.otRate)}${x.mult !== 1 ? ` × ${x.mult}` : ''}</td>
          <td class="num">${x.amount ? bdt(x.amount) : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No duty recorded this month.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td>${list.length} days</td><td class="num">${hrs(sum(list, (x) => x.dutyMin))}</td><td class="num">${hrs(sum(list, (x) => x.otMin))}</td><td></td><td class="num">${bdt(sum(list, (x) => x.amount))}</td></tr></tfoot>
      </table></div>`,
      foot: `<button class="btn" id="dcsv">${icon.download}Export CSV</button><button class="btn" data-close>Close</button>`,
      onMount(mEl) {
        mEl.querySelector('#dcsv').onclick = () => downloadCsv(`overtime-${dr.empId}-${$('#mon').value}.csv`, [
          { key: 'date', label: 'Date' }, { key: 'day', label: 'Day', csv: (x) => DAY_NAMES[weekday(x.date)] },
          { key: 'offDay', label: 'Off day', csv: (x) => (x.offDay ? 'Yes' : 'No') },
          { key: 's', label: 'Duty start', csv: (x) => hhmm(x.start) }, { key: 'e', label: 'Duty end', csv: (x) => hhmm(x.end) },
          { key: 'dutyMin', label: 'Duty hours', csv: (x) => h2(x.dutyMin) }, { key: 'otMin', label: 'OT hours', csv: (x) => h2(x.otMin) },
          { key: 'mult', label: 'Multiplier' }, { key: 'amount', label: 'Amount (BDT)', csv: (x) => x.amount.toFixed(2) },
        ], list);
      },
    });
  }

  $('#mon').addEventListener('change', draw);
  $('#csv').onclick = () => downloadCsv(`overtime-${$('#mon').value}.csv`, cols, table.sorted());
  $('#print').addEventListener('click', () => window.print());
  draw();
}
