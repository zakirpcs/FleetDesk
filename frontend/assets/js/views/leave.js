// Driver leave — a month at a glance, and the spells behind it.
//
// The grid is the point: a row per driver, a column per day, so a fortnight that two
// drivers have booked off together is obvious before anyone promises a car.
import { api, loadAll } from '../api.js';
import { esc, byId, fmtDate, fmtShort, today, thisMonth, fmtMonth, addDays, initials, DAY_NAMES } from '../utils.js';
import { DataTable, openForm, confirmDialog, toast, icon, pill, downloadCsv } from '../ui.js';
import { LEAVE_KINDS, leaveBetween, leaveOn, clashingLeave, leaveDays } from '../roster.js';

const monthDays = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
};
const shiftMonth = (ym, by) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const weekdayOf = (iso) => new Date(`${iso}T12:00:00`).getDay();

export async function render(el, ctx) {
  const canEdit = ctx.can('manage');
  let month = thisMonth();
  let data;

  el.innerHTML = `
    <p class="lede">Who is away, and when. A driver cannot be given a trip on a day they are on leave, so this is also what the approval screen checks.</p>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Month">
        <button id="prev" type="button" aria-label="Previous month">‹</button>
        <button id="this" type="button">This month</button>
        <button id="next" type="button" aria-label="Next month">›</button>
      </div>
      <strong id="monthName" style="font-size:16px"></strong>
      <span class="spacer"></span>
      <button class="btn" id="csv">${icon.download}Export CSV</button>
      ${canEdit ? `<button class="btn btn-primary" id="add">${icon.plus}Add leave</button>` : ''}
    </div>
    <section class="panel" id="cal"></section>
    <section class="panel mt" id="tbl"></section>`;

  const $ = (q) => el.querySelector(q);
  let table;

  const load = async () => {
    data = await loadAll('leave', 'drivers', 'requisitions', 'settings');
    data.d = byId(data.drivers);
    data.booked = data.requisitions.filter((r) => r.status === 'Approved');
    draw();
  };

  /** The month grid: a row per driver who is on the roster, a column per day. */
  function calendar() {
    const days = monthDays(month);
    const from = days[0], to = days[days.length - 1];
    const roster = data.drivers.filter((d) => d.status !== 'Inactive');
    const spells = leaveBetween(data.leave, from, to);
    if (!roster.length) return '<div class="empty"><strong>No drivers yet</strong>Add drivers first and their leave can be planned here.</div>';

    const head = days.map((iso) => {
      const wd = weekdayOf(iso);
      const weekend = (data.settings?.weekendDays || [5, 6]).includes(wd);
      return `<th class="${weekend ? 'weekend' : ''}${iso === today() ? ' is-today' : ''}" scope="col" title="${esc(fmtDate(iso))}">
        <span class="cal-dow">${DAY_NAMES[wd][0]}</span>${Number(iso.slice(-2))}</th>`;
    }).join('');

    const rows = roster.map((dr) => {
      const cells = days.map((iso) => {
        const l = leaveOn(data.leave, dr.id, iso);
        const weekend = (data.settings?.weekendDays || [5, 6]).includes(weekdayOf(iso));
        if (!l) return `<td class="${weekend ? 'weekend' : ''}${iso === today() ? ' is-today' : ''}"></td>`;
        const first = l.startDate === iso || iso === days[0];
        return `<td class="on-leave k-${esc(l.kind.toLowerCase())}${first ? ' first' : ''}${l.endDate === iso ? ' last' : ''}"
                    data-open="${esc(l.id)}" tabindex="0" role="button"
                    title="${esc(`${dr.name}: ${l.kind.toLowerCase()} leave, ${fmtDate(l.startDate)} to ${fmtDate(l.endDate)}`)}"></td>`;
      }).join('');
      const away = spells.filter((l) => l.driverId === dr.id).reduce((n, l) => n + leaveDays(l), 0);
      return `<tr><th scope="row"><span class="avatar" aria-hidden="true">${esc(initials(dr.name))}</span><span>${esc(dr.name)}</span>${away ? `<small class="muted">${away}d</small>` : ''}</th>${cells}</tr>`;
    }).join('');

    const kinds = [...new Set(spells.map((l) => l.kind))];
    return `<div class="cal-wrap"><table class="cal"><thead><tr><th scope="col" class="cal-who">Driver</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      ${kinds.length ? `<div class="cal-key">${kinds.map((k) => `<span><i class="k-${esc(k.toLowerCase())}"></i>${esc(k)}</span>`).join('')}</div>` : '<p class="muted" style="margin:12px 0 0">Nobody is down as away this month.</p>'}`;
  }

  function draw() {
    $('#monthName').textContent = fmtMonth(month);
    $('#cal').innerHTML = calendar();
    const rows = leaveBetween(data.leave, `${month}-01`, `${month}-31`);
    if (table) table.setRows(rows);
    else table = new DataTable($('#tbl'), {
      rows, sortKey: 'startDate', sortDir: 'asc',
      empty: '<strong>No leave this month</strong>Add a spell of leave and it shows here and in the grid above.',
      onRow: canEdit ? (id) => edit(data.leave.find((l) => l.id === id)) : undefined,
      columns: cols(),
    });
  }

  const cols = () => [
    { key: 'driverId', label: 'Driver', render: (l) => esc(data.d[l.driverId]?.name || '—'), sort: (l) => data.d[l.driverId]?.name || '' },
    { key: 'kind', label: 'Kind', render: (l) => pill(l.kind, l.kind === 'Sick' ? 'Maintenance' : 'On trip') },
    { key: 'startDate', label: 'From', render: (l) => esc(fmtDate(l.startDate)) },
    { key: 'endDate', label: 'To', render: (l) => esc(fmtDate(l.endDate)) },
    { key: 'days', label: 'Days', num: true, render: (l) => leaveDays(l), sort: leaveDays, csv: (l) => leaveDays(l) },
    { key: 'back', label: 'Back on', render: (l) => esc(fmtShort(addDays(l.endDate, 1))), sort: (l) => l.endDate },
    { key: 'notes', label: 'Note', render: (l) => esc(l.notes || '—') },
  ];

  const fields = () => [
    { name: 'driverId', label: 'Driver', type: 'select', required: true, placeholder: 'Choose a driver', options: data.drivers.filter((d) => d.status !== 'Inactive').map((d) => ({ value: d.id, label: `${d.name} · ${d.mobile}` })) },
    { name: 'kind', label: 'Kind of leave', type: 'select', required: true, options: LEAVE_KINDS.map((k) => ({ value: k, label: k })) },
    { name: 'startDate', label: 'First day away', type: 'date', required: true },
    { name: 'endDate', label: 'Last day away', type: 'date', required: true, hint: 'The same date for a single day off.' },
    { name: 'notes', label: 'Note', type: 'textarea', full: true, maxlength: 300, placeholder: 'Optional — who is covering, or why' },
  ];

  /** Shared by add and edit: the rules the server enforces, said before it is asked. */
  const check = (v, id) => {
    if (v.endDate < v.startDate) return 'The last day cannot be before the first day.';
    const clash = clashingLeave(data.leave, { id, driverId: v.driverId, startDate: v.startDate, endDate: v.endDate });
    if (clash) return `${data.d[v.driverId]?.name} is already down as away from ${fmtDate(clash.startDate)} to ${fmtDate(clash.endDate)}. Change that record instead.`;
    const booked = (data.booked || []).find((r) => r.driverId === v.driverId && r.requiredDate >= v.startDate && r.requiredDate <= v.endDate);
    if (booked) return `${data.d[v.driverId]?.name} is booked for ${booked.reqNo} on ${fmtDate(booked.requiredDate)}. Reassign that trip first.`;
    return '';
  };

  function add() {
    openForm({
      title: 'Add leave',
      fields: fields(),
      values: { kind: 'Annual', startDate: today(), endDate: today() },
      submitLabel: 'Save leave',
      onSubmit: async (v) => {
        const bad = check(v);
        if (bad) throw new Error(bad);
        await api.create('leave', v);
        toast('Leave added');
        await load();
      },
    });
  }

  function edit(l) {
    if (!l) return;
    openForm({
      title: `Leave — ${data.d[l.driverId]?.name || ''}`,
      fields: fields(),
      values: l,
      submitLabel: 'Save changes',
      deleteLabel: 'Delete',
      onSubmit: async (v) => {
        const bad = check(v, l.id);
        if (bad) throw new Error(bad);
        await api.update('leave', l.id, v);
        toast('Leave updated');
        await load();
      },
      onDelete: async () => {
        if (!(await confirmDialog({
          title: 'Delete this leave?',
          message: `${data.d[l.driverId]?.name} will be available again from ${fmtDate(l.startDate)} to ${fmtDate(l.endDate)}.`,
          confirmLabel: 'Delete leave', danger: true,
        }))) return false;
        await api.remove('leave', l.id);
        toast('Leave deleted');
        await load();
        return true;
      },
    });
  }

  $('#prev').addEventListener('click', () => { month = shiftMonth(month, -1); draw(); });
  $('#next').addEventListener('click', () => { month = shiftMonth(month, 1); draw(); });
  $('#this').addEventListener('click', () => { month = thisMonth(); draw(); });
  $('#csv').addEventListener('click', () => downloadCsv(`leave-${month}.csv`, cols(), leaveBetween(data.leave, `${month}-01`, `${month}-31`)));
  $('#add')?.addEventListener('click', add);
  el.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-open]');
    if (cell && canEdit) edit(data.leave.find((l) => l.id === cell.dataset.open));
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('[data-open]');
    if (cell && canEdit) { e.preventDefault(); edit(data.leave.find((l) => l.id === cell.dataset.open)); }
  });

  await load();
}
