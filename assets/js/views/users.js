// People and access — who can sign in, and what they may do. AGS team lead only.
import { api } from '../api.js';
import { esc, fmtDate, fmtDateTime, initials } from '../utils.js';
import { DataTable, pill, openForm, openModal, confirmDialog, toast, actions, icon } from '../ui.js';

const ROLES = [
  { value: 'employee', label: 'Employee — request a car, see their own requests' },
  { value: 'ags', label: 'AGS staff — inventory, logbook, fuel and reports' },
  { value: 'lead', label: 'AGS team lead — everything, including approvals and accounts' },
];
const ROLE_NAME = { employee: 'Employee', ags: 'AGS staff', lead: 'AGS team lead' };
// Borrow the colours the status pills already use, so roles read at a glance.
const ROLE_PILL = { lead: 'Approved', ags: 'On trip', employee: '' };

export async function render(el, ctx) {
  el.innerHTML = `
    <p class="lede">Everyone who can sign in to Fleet Desk. A new account gets a one-time password that the person replaces when they first sign in.</p>
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search name, email, role" aria-label="Search people"></div>
      <select class="select" id="st" aria-label="Status"><option value="">All accounts</option><option>Active</option><option>Disabled</option></select>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="add">${icon.plus}Add person</button>
    </div>
    <section class="panel" id="tbl"></section>`;

  let users = [], table;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase();
    const status = el.querySelector('#st').value;
    return users.filter((u) => (!status || u.status === status)
      && (!q || [u.name, u.email, u.designation, ROLE_NAME[u.role]].join(' ').toLowerCase().includes(q)));
  };

  const load = async () => {
    users = await api.listUsers();
    if (table) return table.setRows(filter());
    table = new DataTable(el.querySelector('#tbl'), {
      rows: filter(), sortKey: 'name', sortDir: 'asc',
      empty: '<strong>No accounts yet</strong>Add the people who need Fleet Desk.',
      columns: [
        {
          key: 'name',
          label: 'Person',
          render: (u) => `<div class="who-row"><span class="avatar" aria-hidden="true">${initials(u.name)}</span><div class="who">${esc(u.name)}<small>${esc(u.email)}</small></div></div>`,
        },
        { key: 'designation', label: 'Designation', render: (u) => esc(u.designation || '—') },
        { key: 'role', label: 'Role', render: (u) => pill(ROLE_NAME[u.role] || u.role, ROLE_PILL[u.role]), sort: (u) => u.role },
        { key: 'status', label: 'Status', render: (u) => pill(u.status === 'Active' ? 'Active' : 'Inactive') + (u.mustChangePassword ? ' <span class="pill warn">Temporary password</span>' : '') },
        { key: 'lastLoginAt', label: 'Last signed in', render: (u) => (u.lastLoginAt ? esc(fmtDateTime(u.lastLoginAt)) : '<span class="muted">never</span>') },
        { key: 'createdAt', label: 'Added', render: (u) => esc(fmtDate(String(u.createdAt).slice(0, 10))) },
        {
          key: 'a',
          label: '',
          sortable: false,
          render: (u) => `<div class="row-actions">
            <button class="btn btn-sm" data-edit="${esc(u.id)}">Edit</button>
            <button class="btn btn-sm" data-reset="${esc(u.id)}" title="Give this person a new one-time password">Reset password</button>
            ${u.email === ctx.user.email ? '' : `<button class="btn btn-sm btn-danger" data-del="${esc(u.id)}">${icon.trash}</button>`}
          </div>`,
        },
      ],
    });
  };
  await load();

  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#st').addEventListener('change', () => table.setRows(filter()));
  el.querySelector('#add').onclick = () => addPerson();

  el.addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const reset = e.target.closest('[data-reset]');
    const del = e.target.closest('[data-del]');
    if (edit) return editPerson(users.find((u) => u.id === edit.dataset.edit));
    if (reset) return resetPassword(users.find((u) => u.id === reset.dataset.reset));
    if (!del) return;
    const user = users.find((u) => u.id === del.dataset.del);
    if (!(await confirmDialog({
      title: `Delete ${user.name}?`,
      message: 'They will lose access immediately. If they have car requests on record, disable the account instead so the history stays intact.',
      confirmLabel: 'Delete account', danger: true,
    }))) return;
    try { await api.deleteUser(user.id); toast(`${user.name} removed`); await load(); }
    catch (ex) { toast(ex.message, 'bad'); }
  });

  function addPerson() {
    openForm({
      title: 'Add person',
      submitLabel: 'Create account',
      fields: [
        { name: 'name', label: 'Name', required: true, maxlength: 80 },
        { name: 'email', label: 'Work email', type: 'email', required: true, maxlength: 120 },
        { name: 'designation', label: 'Designation', maxlength: 80 },
        { name: 'mobile', label: 'Mobile', maxlength: 40 },
        { name: 'role', label: 'Role', type: 'select', required: true, options: ROLES, default: 'employee', full: true },
      ],
      onSubmit: async (values) => {
        const created = await api.createUser(values);
        await load();
        // After this form's own modal has closed.
        setTimeout(() => showPassword(created, 'Account created'), 0);
      },
    });
  }

  function editPerson(user) {
    openForm({
      title: `Edit ${user.name}`,
      submitLabel: 'Save',
      fields: [
        { name: 'name', label: 'Name', required: true, maxlength: 80 },
        { name: 'designation', label: 'Designation', maxlength: 80 },
        { name: 'mobile', label: 'Mobile', maxlength: 40 },
        { name: 'role', label: 'Role', type: 'select', required: true, options: ROLES, full: true },
        {
          name: 'status', label: 'Account', type: 'select', full: true,
          options: [{ value: 'Active', label: 'Active — can sign in' }, { value: 'Disabled', label: 'Disabled — cannot sign in' }],
          hint: 'Disabling signs the person out of every device at once.',
        },
      ],
      values: user,
      onSubmit: async (values) => { await api.updateUser(user.id, values); await load(); toast('Account updated'); },
    });
  }

  async function resetPassword(user) {
    if (!(await confirmDialog({
      title: `Reset the password for ${user.name}?`,
      message: 'They will be signed out everywhere and will need the one-time password you are about to see.',
      confirmLabel: 'Reset password', danger: true,
    }))) return;
    try {
      const out = await api.resetUserPassword(user.id);
      await load();
      showPassword({ ...user, ...out }, 'Password reset');
    } catch (ex) { toast(ex.message, 'bad'); }
  }

  // The one and only time this password is readable.
  function showPassword(user, title) {
    openModal({
      title,
      body: `
        <p>Give <b>${esc(user.name || user.email)}</b> this one-time password. Fleet Desk will ask them to choose their own when they sign in.</p>
        <div class="one-time">
          <code id="otp">${esc(user.temporaryPassword)}</code>
          <button class="btn btn-sm" id="copyOtp" type="button">Copy</button>
        </div>
        <p class="muted" style="margin-bottom:0">It cannot be shown again. If it gets lost, reset the password for another one.</p>`,
      foot: '<button class="btn btn-primary" data-close>Done</button>',
      onMount(m) {
        m.querySelector('#copyOtp').onclick = async () => {
          try {
            await navigator.clipboard.writeText(user.temporaryPassword);
            toast('Password copied');
          } catch {
            // Clipboard access can be blocked; select it so it can be copied by hand.
            const range = document.createRange();
            range.selectNodeContents(m.querySelector('#otp'));
            getSelection().removeAllRanges();
            getSelection().addRange(range);
          }
        };
      },
    });
  }
}
