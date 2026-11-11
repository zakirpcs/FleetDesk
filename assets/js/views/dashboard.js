// Dashboard for AGS staff and team lead.
import { loadAll } from '../api.js';
import { esc, byId, num, bdt, fmtDate, fmtShort, fmtTime, today, addDays, thisMonth, sum, plate, fromISO } from '../utils.js';
import { hbarChart, vbarChart, pill } from '../ui.js';
import { overtimeDays, tripKm } from '../calc.js';
import { papers } from './cars.js';

export async function render(el) {
  const data = await loadAll('cars', 'drivers', 'cards', 'trips', 'fuel', 'requisitions', 'settings');
  const c = byId(data.cars), d = byId(data.drivers);
  const T = today(), m = thisMonth();
  const monthTrips = data.trips.filter((t) => t.date.startsWith(m));
  const monthFuel = data.fuel.filter((f) => f.date.startsWith(m));
  const pending = data.requisitions.filter((r) => r.status === 'Pending');
  const upcoming = data.requisitions.filter((r) => r.status === 'Approved' && r.requiredDate >= T && r.requiredDate <= addDays(T, 2))
    .sort((a, b) => (a.requiredDate + a.startTime).localeCompare(b.requiredDate + b.startTime));
  const ot = overtimeDays(monthTrips, data.drivers, data.settings);
  const usable = data.cars.filter((x) => ['Available', 'On trip'].includes(x.status));

  // Things that need someone's attention
  const daysTo = (iso) => Math.round((fromISO(iso) - fromISO(T)) / 86400000);
  const alerts = [];
  for (const car of data.cars) { const p = papers(car); if (p.kind !== 'Active' && car.status !== 'Retired') alerts.push({ sev: p.kind, html: `${plate(car.regNo)} ${esc(p.label)}`, link: '#cars' }); }
  for (const dr of data.drivers) if (dr.status !== 'Inactive' && dr.licenseExpiry) {
    const n = daysTo(dr.licenseExpiry);
    if (n < 0) alerts.push({ sev: 'Expired', html: `${esc(dr.name)}: driving licence expired`, link: '#drivers' });
    else if (n <= 60) alerts.push({ sev: 'Expiring soon', html: `${esc(dr.name)}: driving licence expires in ${n} days`, link: '#drivers' });
  }
  for (const k of data.cards.filter((x) => x.status === 'Active')) {
    const used = sum(monthFuel.filter((f) => f.cardId === k.id), (f) => f.amount);
    if (k.monthlyLimit && used / k.monthlyLimit >= 0.8) alerts.push({ sev: used >= k.monthlyLimit ? 'Expired' : 'Expiring soon', html: `${esc(k.provider)} card ••${esc(k.last4)} has used ${Math.round((used / k.monthlyLimit) * 100)}% of its monthly limit`, link: '#cards' });
  }
  for (const car of data.cars.filter((x) => x.status === 'Maintenance')) alerts.push({ sev: 'Pending', html: `${plate(car.regNo)} is in maintenance`, link: '#cars' });
  alerts.sort((a, b) => (a.sev === 'Expired' ? 0 : 1) - (b.sev === 'Expired' ? 0 : 1));

  el.innerHTML = `
    <div class="kpis">
      <a class="kpi" href="#approvals" style="color:inherit;text-decoration:none"><div class="kpi-label">Requests waiting</div><div class="kpi-value">${pending.length}</div><div class="kpi-note">${pending.length ? 'Open approvals' : 'All reviewed'}</div></a>
      <div class="kpi"><div class="kpi-label">Cars in service</div><div class="kpi-value">${usable.length}<small>of ${data.cars.filter((x) => x.status !== 'Retired').length}</small></div><div class="kpi-note">${data.cars.filter((x) => x.status === 'Maintenance').length} in maintenance</div></div>
      <div class="kpi"><div class="kpi-label">Km run this month</div><div class="kpi-value">${num(sum(monthTrips, tripKm))}<small>km</small></div><div class="kpi-note">${monthTrips.length} logbook entries</div></div>
      <div class="kpi"><div class="kpi-label">Fuel spend this month</div><div class="kpi-value">${bdt(sum(monthFuel, (f) => f.amount))}</div><div class="kpi-note">${monthFuel.length} loads</div></div>
      <div class="kpi"><div class="kpi-label">Driver overtime this month</div><div class="kpi-value">${num(sum(ot, (x) => x.otMin) / 60)}<small>h</small></div><div class="kpi-note">${bdt(sum(ot, (x) => x.amount))}</div></div>
    </div>

    <div class="grid grid-2">
      <section class="panel">
        <div class="panel-head"><h2>Booked trips, next 3 days</h2><span class="spacer"></span><a href="#approvals" class="muted">All requests</a></div>
        <div class="panel-body" style="padding:8px 0 4px">
          ${upcoming.length ? `<table class="data"><tbody>${upcoming.map((r) => `<tr>
            <td style="white-space:nowrap">${r.requiredDate === T ? '<b>Today</b>' : esc(fmtDate(r.requiredDate))}<br><small class="muted">${fmtTime(r.startTime)}</small></td>
            <td><div class="who">${esc(r.name)}<small>${esc(r.startPoint)} to ${esc(r.destination)}</small></div></td>
            <td>${plate(c[r.carId]?.regNo)}<br><small class="muted">${esc(d[r.driverId]?.name || '')}</small></td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">No approved trips in the next three days.</div>'}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Needs attention</h2><span class="muted">${alerts.length || ''}</span></div>
        <div class="panel-body" style="padding:8px 0 4px">
          ${alerts.length ? `<table class="data"><tbody>${alerts.slice(0, 8).map((a) => `<tr class="clickable" data-href="${a.link}" tabindex="0"><td>${pill(a.sev === 'Expired' ? 'Urgent' : a.sev === 'Pending' ? 'Info' : 'Soon', a.sev)}</td><td>${a.html}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">Nothing needs attention. Papers, licences and card limits are all fine.</div>'}
        </div>
      </section>
    </div>

    <div class="grid grid-2 mt">
      <section class="panel"><div class="panel-head"><h2>Km per car this month</h2></div><div class="panel-body" id="c1"></div></section>
      <section class="panel"><div class="panel-head"><h2>Fleet km per day, last 14 days</h2></div><div class="panel-body" id="c2"></div></section>
    </div>`;

  hbarChart(el.querySelector('#c1'), {
    data: data.cars.filter((x) => x.status !== 'Retired').map((x) => ({ label: `${x.model} ${x.regNo.slice(-7)}`, value: sum(monthTrips.filter((t) => t.carId === x.id), tripKm), tip: `<b>${esc(x.regNo)}</b><br>${num(sum(monthTrips.filter((t) => t.carId === x.id), tripKm))} km this month` })).sort((a, b) => b.value - a.value),
    format: num, unit: 'km', labelWidth: 170,
  });
  const days = Array.from({ length: 14 }, (_, i) => addDays(T, i - 14));
  vbarChart(el.querySelector('#c2'), {
    data: days.map((day) => { const k = sum(data.trips.filter((t) => t.date === day), tripKm); return { label: fmtShort(day), value: k, tip: `<b>${esc(fmtDate(day))}</b><br>${num(k)} km` }; }),
    format: num, unit: 'km', height: 210,
  });
  el.addEventListener('click', (e) => { const tr = e.target.closest('[data-href]'); if (tr) location.hash = tr.dataset.href; });
  el.addEventListener('keydown', (e) => { const tr = e.target.closest('[data-href]'); if (tr && e.key === 'Enter') location.hash = tr.dataset.href; });
}
