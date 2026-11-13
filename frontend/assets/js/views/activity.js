// Activity — the audit trail. Who changed what, and what it was before.
//
// Read-only on purpose: there is no edit or delete here, and the database refuses
// them too, so what the page shows is what happened.
import { api, CONFIG } from '../api.js';
import { esc, fmtDateTime, today, addDays, initials } from '../utils.js';
import { DataTable, openModal, pill, icon, downloadCsv, toast } from '../ui.js';

// What each collection is called in the trail, and in the filter.
const ENTITY = {
  drivers: 'Driver', cars: 'Car', cards: 'Payment card', trips: 'Logbook entry',
  fuel: 'Fuel load', maintenance: 'Workshop record', requisitions: 'Car request',
  outbox: 'Message', users: 'Account', settings: 'Settings',
};
const ACTION = {
  created: 'Created', updated: 'Changed', deleted: 'Deleted', submitted: 'Submitted',
  approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', 'password reset': 'Password reset',
};
const ACTION_AS = {
  created: 'Active', updated: 'On trip', deleted: 'Rejected', approved: 'Approved',
  rejected: 'Rejected', cancelled: 'Cancelled', submitted: 'Pending', 'password reset': 'Pending',
};
// Field names as people know them, where the column name is not obvious.
const FIELD = {
  regNo: 'Car number', empId: 'Employee ID', licenseNo: 'Licence number', licenseExpiry: 'Licence expiry',
  otRate: 'OT rate', monthlyLimit: 'Monthly limit', last4: 'Last 4 digits', startOdo: 'Start odometer',
  endOdo: 'End odometer', startTime: 'Start time', endTime: 'End time', unitPrice: 'Unit price',
  reqNo: 'Request no.', requiredDate: 'Needed on', driverId: 'Driver', carId: 'Car', cardId: 'Card',
  mustChangePassword: 'Must change password', nextServiceOdo: 'Next service odometer',
  nextServiceDate: 'Next service date', fitnessExpiry: 'Fitness expiry', taxTokenExpiry: 'Tax token expiry',
  insuranceExpiry: 'Insurance expiry', cancelReason: 'Reason for cancelling', reviewedBy: 'Reviewed by',
};
const fieldName = (f) => FIELD[f] || f.replace(/\./g, ' → ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const val = (v) => (v === '' || v === null || v === undefined ? '<span class="muted">not set</span>' : esc(v));

export async function render(el, ctx) {
  if (CONFIG.USE_MOCK) {
    el.innerHTML = '<div class="callout warn">The audit trail is kept by the server, so it needs the backend connected. In this browser-only demo there is nothing to show.</div>';
    return;
  }
  el.innerHTML = `
    <p class="lede">Every change to the fleet records, the accounts and the settings — who made it, when, and what it was before. Entries are never edited or removed.</p>
    <div class="toolbar">
      <label class="muted" for="from">From</label><input class="input" type="date" id="from" value="${addDays(today(), -30)}">
      <label class="muted" for="to">to</label><input class="input" type="date" id="to" value="${today()}">
      <select class="select" id="entity" aria-label="Kind of record"><option value="">Everything</option>${Object.entries(ENTITY).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <select class="select" id="action" aria-label="What happened"><option value="">Any change</option>${Object.entries(ACTION).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search person or record" aria-label="Search the trail"></div>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  const $ = (q) => el.querySelector(q);
  let rows = [], table;

  const summary = (r) => {
    const fields = Object.keys(r.changes || {});
    if (!fields.length) return '<span class="muted">—</span>';
    const shown = fields.slice(0, 3).map(fieldName).join(', ');
    return esc(shown) + (fields.length > 3 ? ` <span class="muted">and ${fields.length - 3} more</span>` : '');
  };

  const filter = () => {
    const q = $('#q').value.trim().toLowerCase();
    const entity = $('#entity').value, action = $('#action').value;
    return rows.filter((r) => (!entity || r.entity === entity) && (!action || r.action === action)
      && (!q || [r.actorName, r.actorEmail, r.label, r.entityId].join(' ').toLowerCase().includes(q)));
  };

  const columns = () => [
    { key: 'at', label: 'When', render: (r) => esc(fmtDateTime(r.at)) },
    {
      key: 'actorName',
      label: 'Who',
      render: (r) => `<div class="who-row"><span class="avatar" aria-hidden="true">${esc(initials(r.actorName || r.actorEmail))}</span><div class="who">${esc(r.actorName || r.actorEmail)}<small>${esc(r.actorEmail)}</small></div></div>`,
      csv: (r) => `${r.actorName} <${r.actorEmail}>`,
    },
    { key: 'action', label: 'What', render: (r) => pill(ACTION[r.action] || r.action, ACTION_AS[r.action] || ''), sort: (r) => r.action },
    { key: 'entity', label: 'Kind', render: (r) => esc(ENTITY[r.entity] || r.entity) },
    { key: 'label', label: 'Record', render: (r) => esc(r.label || r.entityId || '—') },
    { key: 'changes', label: 'Fields', sortable: false, render: summary, csv: (r) => Object.keys(r.changes || {}).map(fieldName).join('; ') },
  ];

  const load = async () => {
    try {
      rows = await api.auditTrail({ from: $('#from').value, to: $('#to').value });
    } catch (e) { toast(e.message, 'bad'); rows = []; }
    if (table) return table.setRows(filter());
    table = new DataTable($('#tbl'), {
      rows: filter(), sortKey: 'at', sortDir: 'desc', pageSize: 25,
      empty: '<strong>Nothing recorded in this period</strong>Changes to cars, drivers, logbook entries, requests, accounts and settings appear here.',
      onRow: (id) => show(rows.find((r) => r.id === id)),
      columns: columns(),
    });
  };
  await load();

  for (const id of ['#from', '#to']) $(id).addEventListener('change', load);
  for (const id of ['#q', '#entity', '#action']) $(id).addEventListener('input', () => table.setRows(filter()));
  $('#csv').addEventListener('click', () => downloadCsv(`activity-${$('#from').value}-to-${$('#to').value}.csv`, columns(), filter()));

  function show(r) {
    const fields = Object.entries(r.changes || {});
    const facts = [
      ['When', fmtDateTime(r.at)],
      ['Who', `${r.actorName || '—'} (${r.actorEmail || '—'})`],
      ['Role', r.actorRole === 'lead' ? 'AGS team lead' : r.actorRole === 'ags' ? 'AGS staff' : 'Employee'],
      ['What', `${ACTION[r.action] || r.action} — ${(ENTITY[r.entity] || r.entity).toLowerCase()}`],
      ['Record', r.label || r.entityId || '—'],
      ['From', r.ip || '—'],
    ];
    openModal({
      title: `${ACTION[r.action] || r.action}: ${r.label || ENTITY[r.entity] || r.entity}`,
      wide: true,
      body: `<dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${fields.length ? `<h3 style="margin:20px 0 8px;font-size:16px">${r.action === 'created' ? 'What it was set to' : r.action === 'deleted' ? 'What it held' : 'What changed'}</h3>
        <table class="data"><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
        <tbody>${fields.map(([f, { from, to }]) => `<tr><td>${esc(fieldName(f))}</td><td>${val(from)}</td><td>${val(to)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted" style="margin-top:18px">No field values were recorded for this entry.</p>'}`,
      foot: '<button class="btn" data-close>Close</button>',
    });
  }
}
