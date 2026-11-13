// Message log — every notification the system has sent, by email or SMS.
import { api, loadAll, CONFIG } from '../api.js';
import { esc, byId, fmtDateTime } from '../utils.js';
import { DataTable, openModal, pill, icon, toast, confirmDialog } from '../ui.js';
import { emailHtml } from './reqshared.js';

const CHANNEL = { email: ['Email', ''], sms: ['SMS', 'Approved'] };
const KIND = {
  confirmation: ['Confirmation', 'Approved'], rejection: ['Rejection', 'Rejected'],
  notification: ['To team lead', 'Pending'], cancellation: ['Cancellation', 'Cancelled'],
};

export async function render(el, ctx) {
  const data = await loadAll('outbox', 'requisitions');
  const reqs = byId(data.requisitions);
  // The log is a record of what was sent, so clearing an entry is the lead's call.
  const canDelete = ctx.can('approve');
  el.innerHTML = `
    ${CONFIG.USE_MOCK ? '<div class="callout warn" style="margin-bottom:14px">Demo mode: messages are recorded here but not actually sent. Once the backend is connected, they go out through the mail server and SMS gateway set in Settings.</div>' : ''}
    <div class="toolbar">
      <div class="search">${icon.search}<input class="input" id="q" type="search" placeholder="Search recipient, subject or message" aria-label="Search messages"></div>
      <select class="select" id="c" aria-label="Channel"><option value="">Email and SMS</option><option value="email">Email only</option><option value="sms">SMS only</option></select>
      <select class="select" id="k" aria-label="Type"><option value="">All types</option><option value="confirmation">Confirmations</option><option value="rejection">Rejections</option><option value="notification">To team lead</option><option value="cancellation">Cancellations</option></select>
    </div>
    <section class="panel" id="tbl"></section>`;
  const filter = () => {
    const q = el.querySelector('#q').value.trim().toLowerCase(), k = el.querySelector('#k').value;
    const c = el.querySelector('#c').value;
    return data.outbox.filter((m) => (!k || m.kind === k) && (!c || (m.channel || 'email') === c)
      && (!q || [m.to, m.subject, m.text].join(' ').toLowerCase().includes(q)));
  };
  const table = new DataTable(el.querySelector('#tbl'), {
    rows: filter(), sortKey: 'sentAt', sortDir: 'desc', pageSize: 20,
    empty: '<strong>Nothing sent yet</strong>Messages appear here when requests are submitted, approved or rejected.',
    onRow: (id) => {
      const m = data.outbox.find((x) => x.id === id);
      const sms = (m.channel || 'email') === 'sms';
      openModal({
        title: sms ? `SMS to ${m.to}` : m.subject,
        wide: !sms,
        body: sms ? `<div class="sms-preview">${esc(m.text)}</div><p class="muted" style="margin:10px 0 0">${m.text.length} characters — ${Math.ceil(m.text.length / 160) || 1} SMS.</p>` : emailHtml(m),
        foot: '<button class="btn" data-close>Close</button>',
      });
    },
    columns: [
      { key: 'sentAt', label: 'Sent', render: (m) => esc(fmtDateTime(m.sentAt)) },
      { key: 'channel', label: 'Via', render: (m) => pill(...(CHANNEL[m.channel || 'email'] || [m.channel])) },
      { key: 'kind', label: 'Type', render: (m) => pill(...(KIND[m.kind] || [m.kind])) },
      { key: 'to', label: 'To' },
      {
        key: 'subject',
        label: 'Message',
        render: (m) => esc((m.channel || 'email') === 'sms' ? m.text : m.subject),
        sort: (m) => ((m.channel || 'email') === 'sms' ? m.text : m.subject),
      },
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
        render: (m) => `<div class="row-actions">
          ${m.status === 'Sent' ? '' : `<button class="btn btn-sm" data-retry="${esc(m.id)}">Send again</button>`}
          ${canDelete ? `<button class="icon-btn danger" data-del="${esc(m.id)}" title="Delete this message from the log" aria-label="Delete this message from the log">${icon.trash}</button>` : ''}
        </div>`,
      },
    ],
  });
  el.querySelector('#q').addEventListener('input', () => table.setRows(filter()));
  el.querySelector('#k').addEventListener('change', () => table.setRows(filter()));
  el.querySelector('#c').addEventListener('change', () => table.setRows(filter()));

  el.addEventListener('click', async (e) => {
    const gone = e.target.closest('[data-del]');
    if (gone) {
      e.stopPropagation();                     // not a row click: no need to open the message
      const m = data.outbox.find((x) => x.id === gone.dataset.del);
      const sms = (m.channel || 'email') === 'sms';
      if (!(await confirmDialog({
        title: 'Delete this message?',
        message: `${sms ? 'The SMS' : 'The email'} to ${m.to}${m.status === 'Queued' ? ', which has not gone out yet, will never be sent and' : ''} will be gone from the log for good. The request itself is not affected.`,
        confirmLabel: 'Delete message', danger: true,
      }))) return;
      try {
        await api.remove('outbox', m.id);
        data.outbox = data.outbox.filter((x) => x.id !== m.id);
        table.setRows(filter());
        toast('Message deleted');
      } catch (ex) { toast(ex.message, 'bad'); }
      return;
    }
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
