// Email log — every notification the system has sent.
import { api, loadAll, CONFIG } from '../api.js';
import { esc, byId, fmtDateTime } from '../utils.js';
import { DataTable, openModal, pill, icon, toast } from '../ui.js';
import { emailHtml } from './reqshared.js';

const KIND = {
  confirmation: ['Confirmation', 'Approved'], rejection: ['Rejection', 'Rejected'],
  notification: ['To team lead', 'Pending'], cancellation: ['Cancellation', 'Cancelled'],
};

export async function render(el) {
  const data = await loadAll('outbox', 'requisitions');
  const reqs = byId(data.requisitions);
  el.innerHTML = `
    ${CONFIG.USE_MOCK ? '<div class="callout warn" style="margin-bottom:14px">Demo mode: emails are recorded here but not actually sent. Once the backend is connected, they go out through the mail server set in Settings.</div>' : ''}
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search recipient, subject" aria-label="Search emails"></div>
      <select class="select" id="k" aria-label="Type"><option value="">All types</option><option value="confirmation">Confirmations</option><option value="rejection">Rejections</option><option value="notification">To team lead</option><option value="cancellation">Cancellations</option></select>
    </div>
    <section class="panel" id="tbl"></section>`;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase(), k = el.querySelector('#k').value;
    return data.outbox.filter((m) => (!k || m.kind === k) && (!q || [m.to, m.subject].join(' ').toLowerCase().includes(q)));
  };
  const table = new DataTable(el.querySelector('#tbl'), {
    rows: filter(), sortKey: 'sentAt', sortDir: 'desc', pageSize: 20,
    empty: '<strong>No emails yet</strong>Emails appear here when requests are submitted, approved or rejected.',
    onRow: (id) => { const m = data.outbox.find((x) => x.id === id); openModal({ title: m.subject, wide: true, body: emailHtml(m), foot: '<button class="btn" data-close>Close</button>' }); },
    columns: [
      { key: 'sentAt', label: 'Sent', render: (m) => esc(fmtDateTime(m.sentAt)) },
      { key: 'kind', label: 'Type', render: (m) => pill(...(KIND[m.kind] || [m.kind])) },
      { key: 'to', label: 'To' },
      { key: 'subject', label: 'Subject' },
      { key: 'req', label: 'Request', render: (m) => esc(reqs[m.reqId]?.reqNo || '—'), sort: (m) => reqs[m.reqId]?.reqNo },
      {
        key: 'status',
        label: 'Delivery',
        render: (m) => `${pill(m.status)}${m.error ? `<br><small class="muted" title="${esc(m.error)}">${esc(m.error.slice(0, 60))}${m.error.length > 60 ? '…' : ''}</small>` : ''}`,
      },
      {
        key: 'retry',
        label: 'Action',
        className: 'col-actions',
        sortable: false,
        render: (m) => (m.status === 'Sent' ? '' : `<div class="row-actions"><button class="btn btn-sm" data-retry="${esc(m.id)}">Send again</button></div>`),
      },
    ],
  });
  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#k').addEventListener('change', () => table.setRows(filter()));

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-retry]');
    if (!b) return;
    e.stopPropagation();                       // not a row click: no need to open the email
    b.disabled = true;
    try {
      const sent = await api.retryEmail(b.dataset.retry);
      Object.assign(data.outbox.find((m) => m.id === sent.id), sent);
      table.setRows(filter());
      toast(sent.status === 'Sent' ? 'Message sent' : `Still ${sent.status.toLowerCase()}: ${sent.error}`, sent.status === 'Sent' ? '' : 'bad');
    } catch (ex) { toast(ex.message, 'bad'); }
    finally { b.disabled = false; }
  });
}
