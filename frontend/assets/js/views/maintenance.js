// Servicing and repairs: what was done to each car, what it cost, and what is due next.
import { api, loadAll } from '../api.js';
import { esc, byId, num, bdt, fmtDate, today, addDays, sum, plate, fromISO } from '../utils.js';
import { DataTable, pill, openForm, confirmDialog, toast, actions, icon, downloadCsv } from '../ui.js';

const KINDS = ['Service', 'Repair', 'Tyres', 'Battery', 'Bodywork', 'Inspection', 'Other'];
const KIND_PILL = { Service: 'Active', Repair: 'Pending', Tyres: 'On trip', Battery: 'On trip', Bodywork: 'On trip', Inspection: 'Completed', Other: '' };

// Warn this far ahead of the next service.
const SOON_KM = 600;
const SOON_DAYS = 14;

/**
 * When a car is next due in the workshop, from the most recent record that said so.
 * Whichever comes first — the odometer reading or the date — is the one that counts.
 */
export function serviceDue(car, records) {
  const mine = records.filter((m) => m.carId === car.id && (m.nextServiceOdo || m.nextServiceDate))
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = mine[0];
  if (!last) return null;
  const kmLeft = last.nextServiceOdo ? Math.round(Number(last.nextServiceOdo) - Number(car.odometer || 0)) : null;
  const daysLeft = last.nextServiceDate ? Math.round((fromISO(last.nextServiceDate) - fromISO(today())) / 86400000) : null;
  const overdue = (kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft < 0);
  const soon = (kmLeft !== null && kmLeft <= SOON_KM) || (daysLeft !== null && daysLeft <= SOON_DAYS);
  return {
    atOdo: last.nextServiceOdo, onDate: last.nextServiceDate, kmLeft, daysLeft,
    state: overdue ? 'due' : soon ? 'soon' : 'ok',
    label: overdue
      ? (kmLeft !== null && kmLeft <= 0 ? `overdue by ${num(-kmLeft)} km` : 'overdue')
      : kmLeft !== null ? `in ${num(kmLeft)} km` : `on ${fmtDate(last.nextServiceDate)}`,
  };
}

export async function render(el, ctx) {
  const data = await loadAll('maintenance', 'cars');
  const c = byId(data.cars);

  el.innerHTML = `
    <p class="lede">Every visit to the workshop: what was done, what it cost, and when the car is due back.</p>
    <div class="toolbar">
      <label class="muted" for="from">From</label><input class="input" type="date" id="from" value="${addDays(today(), -180)}">
      <label class="muted" for="to">to</label><input class="input" type="date" id="to" value="${today()}">
      <select class="select" id="car" aria-label="Car"><option value="">All cars</option>${data.cars.map((x) => `<option value="${esc(x.id)}">${esc(x.regNo)}</option>`).join('')}</select>
      <select class="select" id="kind" aria-label="Kind of work"><option value="">All work</option>${KINDS.map((k) => `<option>${k}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      ${ctx.can('manage') ? `<button class="btn btn-primary" id="add">${icon.plus}Record a job</button>` : ''}
    </div>
    <div class="kpis" id="kpis"></div>
    <section class="panel" id="tbl"></section>`;

  const $ = (q) => el.querySelector(q);
  let table;
  const filter = () => data.maintenance.filter((m) =>
    (!$('#from').value || m.date >= $('#from').value)
    && (!$('#to').value || m.date <= $('#to').value)
    && (!$('#car').value || m.carId === $('#car').value)
    && (!$('#kind').value || m.kind === $('#kind').value));

  const dueCell = (m) => {
    const car = c[m.carId];
    const due = car && serviceDue(car, data.maintenance);
    // Only the record that set the current target speaks for the car.
    if (!due || String(due.atOdo || '') !== String(m.nextServiceOdo || '') || !m.nextServiceOdo) {
      return m.nextServiceOdo || m.nextServiceDate
        ? `<span class="muted">${m.nextServiceOdo ? `${num(m.nextServiceOdo)} km` : esc(fmtDate(m.nextServiceDate))}</span>`
        : '<span class="muted">—</span>';
    }
    return `${num(due.atOdo)} km<br><small class="${due.state === 'ok' ? 'muted' : ''}">${due.state === 'due' ? pill(due.label, 'Expired') : due.state === 'soon' ? pill(due.label, 'Expiring soon') : esc(due.label)}</small>`;
  };

  const cols = [
    { key: 'date', label: 'Date', render: (m) => esc(fmtDate(m.date)), sort: (m) => m.date },
    { key: 'carId', label: 'Car', render: (m) => plate(c[m.carId]?.regNo), sort: (m) => c[m.carId]?.regNo, csv: (m) => c[m.carId]?.regNo },
    { key: 'kind', label: 'Work', render: (m) => `${pill(m.kind, KIND_PILL[m.kind])}${m.description ? `<br><small class="muted">${esc(m.description)}</small>` : ''}` },
    { key: 'odometer', label: 'Odometer', num: true, render: (m) => num(m.odometer) },
    { key: 'workshop', label: 'Workshop', render: (m) => `${esc(m.workshop || '—')}${m.invoiceNo ? `<br><small class="muted">${esc(m.invoiceNo)}</small>` : ''}` },
    { key: 'cost', label: 'Cost', num: true, render: (m) => bdt(m.cost), csv: (m) => Number(m.cost).toFixed(2) },
    { key: 'next', label: 'Next due', render: dueCell, sort: (m) => Number(m.nextServiceOdo || 0), csv: (m) => m.nextServiceOdo || m.nextServiceDate || '' },
    ...(ctx.can('manage') ? [{ key: 'a', label: '', sortable: false, render: (m) => actions(m.id) }] : []),
  ];

  function draw() {
    const rows = filter();
    const cars = new Set(rows.map((m) => m.carId));
    $('#kpis').innerHTML = `
      <div class="kpi"><div class="kpi-label">Workshop spend</div><div class="kpi-value">${bdt(sum(rows, (m) => m.cost))}</div><div class="kpi-note">${rows.length} job${rows.length === 1 ? '' : 's'}</div></div>
      <div class="kpi"><div class="kpi-label">Cars seen</div><div class="kpi-value">${cars.size}<small>of ${data.cars.filter((x) => x.status !== 'Retired').length}</small></div></div>
      <div class="kpi"><div class="kpi-label">Average per job</div><div class="kpi-value">${bdt(rows.length ? sum(rows, (m) => m.cost) / rows.length : 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Due for service</div><div class="kpi-value">${data.cars.filter((x) => x.status !== 'Retired' && ['due', 'soon'].includes(serviceDue(x, data.maintenance)?.state)).length}</div><div class="kpi-note">within ${num(SOON_KM)} km or ${SOON_DAYS} days</div></div>`;
    if (table) table.setRows(rows);
    else table = new DataTable($('#tbl'), {
      rows, columns: cols, sortKey: 'date', sortDir: 'desc', pageSize: 25,
      empty: '<strong>No workshop records for this period</strong>Widen the dates, or record the last job the fleet had done.',
      foot: (rs) => ['Total', '', `${rs.length} jobs`, '', '', bdt(sum(rs, (m) => m.cost)), '', ''].slice(0, cols.length),
    });
  }

  function edit(id) {
    const m = id ? data.maintenance.find((x) => x.id === id) : null;
    const car = m && c[m.carId];
    openForm({
      title: m ? `Edit ${m.kind.toLowerCase()} · ${car?.regNo || ''}` : 'Record a job',
      wide: true,
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true, max: today(), default: today() },
        { name: 'carId', label: 'Car', type: 'select', required: true, placeholder: 'Choose a car', options: data.cars.map((x) => ({ value: x.id, label: `${x.regNo} · ${x.make} ${x.model}` })) },
        { name: 'kind', label: 'Work', type: 'select', required: true, options: KINDS, default: 'Service' },
        { name: 'odometer', label: 'Odometer (km)', type: 'number', min: 0, step: 1, hint: 'Reading when the car went in.' },
        { name: 'workshop', label: 'Workshop', maxlength: 120 },
        { name: 'invoiceNo', label: 'Invoice no.', maxlength: 40 },
        { name: 'description', label: 'Work done', type: 'textarea', full: true, maxlength: 300, placeholder: 'e.g. Full service: oil, filters, brake fluid' },
        { name: 'cost', label: 'Cost (BDT)', type: 'number', min: 0, step: 'any' },
        { name: 'nextServiceOdo', label: 'Next service at (km)', type: 'number', min: 0, step: 1, hint: 'What the garage advises. Drives the reminder.' },
        { name: 'nextServiceDate', label: 'Or next service by', type: 'date' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, maxlength: 300 },
      ],
      values: m || {},
      submitLabel: m ? 'Save' : 'Record it',
      onSubmit: async (v) => {
        if (m) await api.update('maintenance', m.id, v); else await api.create('maintenance', v);
        data.maintenance = await api.list('maintenance');
        data.cars = await api.list('cars');          // the odometer may have moved
        Object.assign(c, byId(data.cars));
        draw();
        toast(m ? 'Record updated' : 'Workshop visit recorded');
      },
    });
  }

  ['#from', '#to', '#car', '#kind'].forEach((s) => $(s).addEventListener('change', draw));
  $('#add')?.addEventListener('click', () => edit());
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'edit') return edit(b.dataset.id);
    const m = data.maintenance.find((x) => x.id === b.dataset.id);
    if (!(await confirmDialog({
      title: 'Delete this record?',
      message: `Delete the ${esc(m.kind.toLowerCase())} on ${esc(c[m.carId]?.regNo || 'this car')} from ${esc(fmtDate(m.date))}? The cost and any service reminder it set go with it.`,
      confirmLabel: 'Delete record', danger: true,
    }))) return;
    try {
      await api.remove('maintenance', m.id);
      data.maintenance = await api.list('maintenance');
      draw();
      toast('Record deleted');
    } catch (ex) { toast(ex.message, 'bad'); }
  });
  $('#csv').onclick = () => downloadCsv(`maintenance_${$('#from').value}_${$('#to').value}.csv`, cols.filter((x) => x.label), table.sorted());
  draw();
}
