// UI kit: toasts, modals, forms, data tables, charts, status pills.
import { esc } from './utils.js';

export const icon = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M7 14h10v6H7z"/></svg>',
};

// ---------------------------------------------------------------- toasts
export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3500);
}

// ---------------------------------------------------------------- status pills
const PILL = {
  Active: 'ok', Available: 'ok', Approved: 'ok', Sent: 'ok', Completed: 'info',
  Pending: 'warn', 'On leave': 'warn', 'On trip': 'info', Maintenance: 'warn', 'Expiring soon': 'warn',
  Rejected: 'bad', Blocked: 'bad', Expired: 'bad', Inactive: '', Retired: '', Cancelled: '',
};
/** pill('Approved') or pill('Tax token in 12 days', 'Expiring soon') to borrow another status's colour. */
export const pill = (text, as = text) => `<span class="pill ${PILL[as] ?? ''}">${esc(text)}</span>`;

// ---------------------------------------------------------------- modal
let openCount = 0;
export function closeAllModals() {
  document.querySelectorAll('#modalRoot [data-close]').forEach((b) => b.click());
  document.getElementById('modalRoot').innerHTML = '';
  openCount = 0;
  document.getElementById('scrim').hidden = true;
  document.getElementById('vizTip').hidden = true;
}
export function openModal({ title, body = '', foot = '', wide = false, onMount }) {
  const root = document.getElementById('modalRoot');
  const scrim = document.getElementById('scrim');
  const prevFocus = document.activeElement;
  const el = document.createElement('div');
  el.className = `modal${wide ? ' wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon.close}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
  root.append(el);
  scrim.hidden = false; openCount++;
  const close = () => {
    el.remove(); openCount--;
    if (!openCount) scrim.hidden = true;
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === el) close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  scrim.onclick = () => { const top = root.lastElementChild; top?.querySelector('[data-close]')?.click(); };
  onMount?.(el, close);
  (el.querySelector('input,select,textarea') || el.querySelector('.modal-head .icon-btn')).focus();
  return { el, close };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const { close } = openModal({
      title,
      body: `<p style="margin:0">${message}</p>`,
      foot: `<button class="btn" data-close>Keep it</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount(el, closeFn) {
        el.querySelector('[data-ok]').onclick = () => { done = true; resolve(true); closeFn(); };
        el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') && !done) resolve(false); }, true);
      },
    });
    void close;
  });
}

// ---------------------------------------------------------------- forms
export function fieldHtml(f, value) {
  const v = value ?? f.default ?? '';
  const id = `f_${f.name}`;
  const req = f.required ? ' required' : '';
  const attrs = ['min', 'max', 'step', 'pattern', 'placeholder', 'maxlength', 'inputmode', 'autocomplete']
    .filter((a) => f[a] !== undefined).map((a) => ` ${a}="${esc(f[a])}"`).join('');
  let control;
  if (f.type === 'select') {
    const opts = (f.options || []).map((o) => {
      const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
      return `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}${o.disabled ? ' disabled' : ''}>${esc(ol)}</option>`;
    }).join('');
    control = `<select class="select" id="${id}" name="${f.name}"${req}>${f.placeholder !== undefined ? `<option value="">${esc(f.placeholder)}</option>` : ''}${opts}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="textarea" id="${id}" name="${f.name}"${req}${attrs}>${esc(v)}</textarea>`;
  } else {
    control = `<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"${req}${attrs}${f.readonly ? ' readonly' : ''}>`;
  }
  return `<div class="field${f.full ? ' full' : ''}" data-field="${f.name}">
    <label for="${id}">${esc(f.label)}${f.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${control}
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}
    <span class="err" aria-live="polite"></span>
  </div>`;
}

export function readForm(form) {
  const out = {};
  for (const el of form.elements) if (el.name) out[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  return out;
}

export function checkForm(form) {
  let ok = true;
  form.querySelectorAll('.field').forEach((f) => { f.classList.remove('invalid'); f.querySelector('.err').textContent = ''; });
  for (const el of form.elements) {
    if (!el.name || el.checkValidity()) continue;
    ok = false;
    const field = el.closest('.field');
    field?.classList.add('invalid');
    if (field) field.querySelector('.err').textContent = el.validity.valueMissing ? 'This field is required' : el.validationMessage;
  }
  if (!ok) form.querySelector('.invalid input, .invalid select, .invalid textarea')?.focus();
  return ok;
}

/** Form in a modal. onSubmit(values) may throw; the message is shown in the modal. */
export function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete', intro = '', wide = false, onMount }) {
  return openModal({
    title, wide,
    body: `${intro}<form class="form-grid" novalidate>${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</form><div class="callout bad mt" data-formerr hidden></div>`,
    foot: `${onDelete ? `<button class="btn btn-danger left" data-del type="button">${esc(deleteLabel)}</button>` : ''}<button class="btn" data-close type="button">Cancel</button><button class="btn btn-primary" data-submit type="button">${esc(submitLabel)}</button>`,
    onMount(el, close) {
      const form = el.querySelector('form');
      const errBox = el.querySelector('[data-formerr]');
      const submit = async () => {
        errBox.hidden = true;
        if (!checkForm(form)) return;
        const btn = el.querySelector('[data-submit]'); btn.disabled = true;
        try { await onSubmit(readForm(form), close); close(); }
        catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
        finally { btn.disabled = false; }
      };
      el.querySelector('[data-submit]').onclick = submit;
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
      if (onDelete) el.querySelector('[data-del]').onclick = async () => {
        try { if (await onDelete()) close(); } catch (e) { errBox.textContent = e.message; errBox.hidden = false; }
      };
      onMount?.(el, form);
    },
  });
}

// ---------------------------------------------------------------- data table
export class DataTable {
  /** columns: [{ key, label, render?(row), sort?(row), num?, width? }] */
  constructor(el, { columns, rows = [], empty = 'Nothing here yet', onRow, foot, sortKey, sortDir = 'asc', pageSize = 0 }) {
    Object.assign(this, { el, columns, rows, empty, onRow, foot, sortKey, sortDir, pageSize, page: 0 });
    el.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (th) { const k = th.dataset.sort; this.sortDir = this.sortKey === k && this.sortDir === 'asc' ? 'desc' : 'asc'; this.sortKey = k; this.page = 0; return this.render(); }
      const pg = e.target.closest('[data-page]');
      if (pg) { this.page += Number(pg.dataset.page); return this.render(); }
      if (e.target.closest('.row-actions, a, button')) return;
      const tr = e.target.closest('tr[data-id]');
      if (tr && this.onRow) this.onRow(tr.dataset.id);
    });
    el.addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (tr && e.key === 'Enter' && this.onRow && e.target === tr) this.onRow(tr.dataset.id);
    });
    this.render();
  }
  setRows(rows) { this.rows = rows; this.page = 0; this.render(); }
  sorted() {
    const col = this.columns.find((c) => c.key === this.sortKey);
    if (!col) return this.rows;
    const get = col.sort || ((r) => r[col.key]);
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...this.rows].sort((a, b) => {
      const x = get(a), y = get(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * dir;
    });
  }
  render() {
    const all = this.sorted();
    const rows = this.pageSize ? all.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize) : all;
    const pages = this.pageSize ? Math.ceil(all.length / this.pageSize) : 1;
    const head = this.columns.map((c) => {
      const sortable = c.sortable !== false && c.label;
      const arrow = this.sortKey === c.key ? (this.sortDir === 'asc' ? '▲' : '▼') : '';
      return `<th${sortable ? ` class="sortable${c.num ? ' num' : ''}" data-sort="${c.key}" aria-sort="${arrow ? (this.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : c.num ? ' class="num"' : ''}${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label || '')}${arrow ? `<span class="arrow">${arrow}</span>` : ''}</th>`;
    }).join('');
    const body = rows.map((r) => `<tr data-id="${esc(r.id)}"${this.onRow ? ' class="clickable" tabindex="0"' : ''}>${this.columns.map((c) => `<td${c.num ? ' class="num"' : ''}>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    const foot = this.foot && all.length ? `<tfoot><tr>${this.foot(all).map((v, i) => `<td${this.columns[i]?.num ? ' class="num"' : ''}>${v ?? ''}</td>`).join('')}</tr></tfoot>` : '';
    this.el.innerHTML = all.length
      ? `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>
         ${pages > 1 ? `<div class="toolbar" style="margin:10px 12px 0;justify-content:flex-end"><span class="muted">Page ${this.page + 1} of ${pages} · ${all.length} rows</span><button class="btn btn-sm" data-page="-1" ${this.page === 0 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm" data-page="1" ${this.page >= pages - 1 ? 'disabled' : ''}>Next</button></div>` : ''}`
      : `<div class="empty">${this.empty}</div>`;
  }
}

export const actions = (id, { edit = true, del = true } = {}) =>
  `<div class="row-actions">${edit ? `<button class="icon-btn" data-act="edit" data-id="${esc(id)}" aria-label="Edit" title="Edit">${icon.edit}</button>` : ''}${del ? `<button class="icon-btn" data-act="del" data-id="${esc(id)}" aria-label="Delete" title="Delete">${icon.trash}</button>` : ''}</div>`;

// ---------------------------------------------------------------- CSV export
export function downloadCsv(filename, columns, rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.csv ? c.csv(r) : r[c.key])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- charts (single-series, one hue)
const tip = () => document.getElementById('vizTip');
function bindTips(root) {
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]'); const el = tip();
    if (!t) { el.hidden = true; return; }
    el.innerHTML = t.dataset.tip; el.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - el.offsetWidth - 8);
    el.style.left = x + 'px'; el.style.top = (e.clientY + 14) + 'px';
  });
  root.addEventListener('pointerleave', () => { tip().hidden = true; });
}
const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

/** Horizontal bars: data [{ label, value, tip }] */
export function hbarChart(el, { data, format = String, unit = '', labelWidth = 150 }) {
  const W = 640, rowH = 30, barH = 14, padR = 70;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = W - labelWidth - padR;
  const H = data.length * rowH + 22;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
    ${ticks.map((t) => { const x = labelWidth + (t / max) * plotW; return `<line class="grid-line" x1="${x}" x2="${x}" y1="0" y2="${H - 20}"/><text class="axis-text" x="${x}" y="${H - 4}" text-anchor="middle">${esc(format(t))}</text>`; }).join('')}
    ${data.map((d, i) => {
      const y = i * rowH + (rowH - barH) / 2; const w = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * plotW);
      const r = Math.min(4, w / 2);
      return `<g class="bar-g" data-tip="${esc(d.tip || `<b>${esc(d.label)}</b><br>${esc(format(d.value))} ${esc(unit)}`)}">
        <rect class="hit" x="0" y="${i * rowH}" width="${W}" height="${rowH}"/>
        <text class="axis-text" x="${labelWidth - 10}" y="${y + barH / 2 + 4}" text-anchor="end" style="fill:var(--ink-2)">${esc(d.label)}</text>
        <path class="bar" d="M${labelWidth},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${barH - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z"/>
        <text class="val-text" x="${labelWidth + w + 6}" y="${y + barH / 2 + 4}">${esc(format(d.value))}</text>
      </g>`;
    }).join('')}
  </svg>`;
  el.innerHTML = `<div class="chart">${svg}</div>${tableView(data, format, unit)}`;
  bindTips(el);
}

/** Vertical bars over time: data [{ label, value, tip }] */
export function vbarChart(el, { data, format = String, unit = '', height = 220 }) {
  const W = 640, H = height, padL = 46, padB = 26, padT = 18;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotH = H - padB - padT, plotW = W - padL - 8;
  const step = plotW / Math.max(data.length, 1); const bw = Math.min(34, step - 2 * 2 - 6);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">
    ${ticks.map((t) => { const y = padT + plotH - (t / max) * plotH; return `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis-text" x="${padL - 8}" y="${y + 4}" text-anchor="end">${esc(format(t))}</text>`; }).join('')}
    ${data.map((d, i) => {
      const h = (d.value / max) * plotH; const x = padL + i * step + (step - bw) / 2; const y = padT + plotH - h; const r = Math.min(4, h / 2, bw / 2);
      const showLabel = data.length <= 14 || i % 2 === 0;
      return `<g class="bar-g" data-tip="${esc(d.tip || `<b>${esc(d.label)}</b><br>${esc(format(d.value))} ${esc(unit)}`)}">
        <rect class="hit" x="${padL + i * step}" y="${padT}" width="${step}" height="${plotH}"/>
        ${h > 0 ? `<path class="bar" d="M${x},${padT + plotH} v-${h - r} a${r},${r} 0 0 1 ${r},-${r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z"/>` : ''}
        ${showLabel ? `<text class="axis-text" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>` : ''}
      </g>`;
    }).join('')}
  </svg>`;
  el.innerHTML = `<div class="chart">${svg}</div>${tableView(data, format, unit)}`;
  bindTips(el);
}

function tableView(data, format, unit) {
  return `<details class="chart-table"><summary>Show as table</summary>
    <table class="data" style="margin-top:6px"><tbody>${data.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${esc(format(d.value))} ${esc(unit)}</td></tr>`).join('')}</tbody></table></details>`;
}
