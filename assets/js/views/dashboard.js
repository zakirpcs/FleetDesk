// Dashboard for AGS staff and team lead.
import { loadAll } from '../api.js';
import { esc, byId, num, bdt, fmtDate, fmtShort, fmtTime, today, addDays, thisMonth, sum, plate, initials, fromISO } from '../utils.js';
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

  // Where every car and driver is right now. A car or driver booked for today, or
  // already out according to today's logbook, counts as out whatever the stored status
  // says — so the desk sees what is actually free without anyone having to keep those
  // fields current.
  const todayTrips = data.trips.filter((t) => t.date === T);
  const bookedToday = data.requisitions.filter((r) => r.status === 'Approved' && r.requiredDate === T);
  const shortPlate = (car) => (car ? car.regNo.slice(-7) : '');

  const fleet = { out: [], free: [], off: [] };
  for (const car of data.cars) {
    if (car.status === 'Retired') continue;
    const lead = plate(car.regNo);
    if (car.status === 'Maintenance') { fleet.off.push({ lead, who: 'In maintenance', note: `${car.make} ${car.model}` }); continue; }
    const booking = bookedToday.find((r) => r.carId === car.id);
    const trip = todayTrips.find((t) => t.carId === car.id);
    const who = (id) => d[id]?.name || 'No driver assigned';
    if (booking) fleet.out.push({ lead, who: who(booking.driverId), note: `${fmtTime(booking.startTime)} · to ${booking.destination}` });
    else if (trip) fleet.out.push({ lead, who: who(trip.driverId), note: `out since ${fmtTime(trip.startTime)} · to ${trip.to}` });
    else if (car.status === 'On trip') fleet.out.push({ lead, who: who(car.driverId), note: 'marked on trip' });
    else fleet.free.push({ lead, who: who(car.driverId), note: [car.seats ? `${car.seats} seats` : '', car.fuelType].filter(Boolean).join(' · ') });
  }
  const inService = fleet.out.length + fleet.free.length + fleet.off.length;

  const regularCar = {};
  for (const car of data.cars) if (car.driverId) regularCar[car.driverId] = car;

  const crew = { out: [], free: [], off: [] };
  for (const dr of data.drivers) {
    const lead = `<span class="avatar" aria-hidden="true">${initials(dr.name)}</span>`;
    if (dr.status !== 'Active') { crew.off.push({ lead, who: dr.name, note: dr.status }); continue; }
    const booking = bookedToday.find((r) => r.driverId === dr.id);
    const trip = todayTrips.find((t) => t.driverId === dr.id);
    if (booking) crew.out.push({ lead, who: dr.name, note: `${fmtTime(booking.startTime)} · ${shortPlate(c[booking.carId])} to ${booking.destination}` });
    else if (trip) crew.out.push({ lead, who: dr.name, note: `out since ${fmtTime(trip.startTime)} · ${shortPlate(c[trip.carId])} to ${trip.to}` });
    else crew.free.push({ lead, who: dr.name, note: [regularCar[dr.id] ? shortPlate(regularCar[dr.id]) : 'No regular car', dr.mobile].filter(Boolean).join(' · ') });
  }
  const onRoster = crew.out.length + crew.free.length + crew.off.length;

  const nowColumn = (label, rows, empty, as = label) => `
    <div>
      <div class="fleet-head">${pill(label, as)}<b>${rows.length}</b></div>
      ${rows.length ? rows.map(({ lead, who, note }) => `
        <div class="fleet-car">${lead}
          <div class="who">${esc(who)}<small>${esc(note || '')}</small></div>
        </div>`).join('') : `<p class="fleet-empty">${esc(empty)}</p>`}
    </div>`;

  // Fuel card headroom for the month, worst first — the cards page uses the same
  // thresholds and the same meter, so the two readings never disagree.
  const spentOn = {};
  for (const f of monthFuel) if (f.cardId) spentOn[f.cardId] = (spentOn[f.cardId] || 0) + Number(f.amount);
  const cardLimits = data.cards
    .filter((k) => k.status === 'Active')
    .map((k) => {
      const used = spentOn[k.id] || 0;
      // The bar stops at full, but the caption tells the truth about an overspend.
      const pct = k.monthlyLimit ? (used / k.monthlyLimit) * 100 : 0;
      return { card: k, used, pct, left: (k.monthlyLimit || 0) - used };
    })
    .sort((a, b) => b.pct - a.pct);
  const cashSpend = sum(monthFuel.filter((f) => !f.cardId), (f) => f.amount);
  const inactiveCards = data.cards.length - cardLimits.length;
  const cardHeadroom = sum(cardLimits, (x) => Math.max(0, x.left));

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
      <a class="kpi" href="#cars" style="color:inherit;text-decoration:none"><div class="kpi-label">Cars available now</div><div class="kpi-value">${fleet.free.length}<small>of ${inService}</small></div><div class="kpi-note">${fleet.out.length} on trip · ${fleet.off.length} in maintenance</div></a>
      <a class="kpi" href="#drivers" style="color:inherit;text-decoration:none"><div class="kpi-label">Drivers available now</div><div class="kpi-value">${crew.free.length}<small>of ${onRoster}</small></div><div class="kpi-note">${crew.out.length} on duty · ${crew.off.length} on leave</div></a>
      <div class="kpi"><div class="kpi-label">Km run this month</div><div class="kpi-value">${num(sum(monthTrips, tripKm))}<small>km</small></div><div class="kpi-note">${monthTrips.length} logbook entries</div></div>
      <a class="kpi" href="#cards" style="color:inherit;text-decoration:none"><div class="kpi-label">Fuel spend this month</div><div class="kpi-value">${bdt(sum(monthFuel, (f) => f.amount))}</div><div class="kpi-note">${monthFuel.length} loads · ${bdt(cardHeadroom)} left on cards</div></a>
      <div class="kpi"><div class="kpi-label">Driver overtime this month</div><div class="kpi-value">${num(sum(ot, (x) => x.otMin) / 60)}<small>h</small></div><div class="kpi-note">${bdt(sum(ot, (x) => x.amount))}</div></div>
    </div>

    <section class="panel mt">
      <div class="panel-head"><h2>Cars right now</h2><span class="spacer"></span><a href="#cars" class="muted">Car inventory</a></div>
      <div class="panel-body">
        <div class="grid grid-3 fleet-now">
          ${nowColumn('On trip', fleet.out, 'Every car is in.')}
          ${nowColumn('Available', fleet.free, 'Every car is out or off the road.')}
          ${nowColumn('Maintenance', fleet.off, 'Nothing off the road.')}
        </div>
      </div>
    </section>

    <section class="panel mt">
      <div class="panel-head"><h2>Drivers right now</h2><span class="spacer"></span><a href="#drivers" class="muted">Driver list</a></div>
      <div class="panel-body">
        <div class="grid grid-3 fleet-now">
          ${nowColumn('On duty', crew.out, 'Nobody is out yet today.', 'On trip')}
          ${nowColumn('Available', crew.free, 'Every driver is out or away.')}
          ${nowColumn('On leave', crew.off, 'Everyone is on the roster.')}
        </div>
      </div>
    </section>

    <div class="grid grid-2 mt">
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

    <section class="panel mt">
      <div class="panel-head">
        <h2>Card limits this month</h2>
        <span class="muted">${[cashSpend ? `${bdt(cashSpend)} also paid in cash` : '', inactiveCards ? `${inactiveCards} card${inactiveCards === 1 ? '' : 's'} not active` : ''].filter(Boolean).join(' · ')}</span>
        <span class="spacer"></span><a href="#cards" class="muted">Payment cards</a>
      </div>
      <div class="panel-body">
        ${cardLimits.length ? `<div class="grid grid-2 card-limits">${cardLimits.map(({ card, used, pct, left }) => `
          <div class="card-limit">
            <div class="card-limit-head">
              <b>${esc(card.provider)} ••${esc(card.last4)}</b>
              <span class="muted">${card.carId ? esc(c[card.carId]?.regNo.slice(-7) || '') : 'Pool card'}</span>
              <span class="spacer"></span>
              <span>${bdt(used)} <small class="muted">of ${bdt(card.monthlyLimit)}</small></span>
            </div>
            <div class="meter ${pct >= 100 ? 'bad' : pct >= 80 ? 'warn' : ''}"><span style="width:${Math.min(100, pct)}%"></span></div>
            <small class="muted">${Math.round(pct)}% used${card.monthlyLimit ? ` · ${left >= 0 ? `${bdt(left)} left` : `${bdt(-left)} over`}` : ' · no limit set'}</small>
          </div>`).join('')}</div>`
          : '<div class="empty">No active payment cards.</div>'}
      </div>
    </section>

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
