// Small shared helpers: escaping, formatting, dates.

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nfIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nfIN2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const num = (n) => nfIN.format(Math.round(n || 0));
export const num1 = (n) => nf1.format(n || 0);
export const num2 = (n) => nfIN2.format(n || 0);
export const bdt = (n) => '৳ ' + nfIN.format(Math.round(n || 0));
export const bdt2 = (n) => '৳ ' + nfIN2.format(n || 0);

// ---- Dates (all local time, ISO yyyy-mm-dd strings in storage) ----
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => toISO(new Date());
export const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const monthKey = (iso) => iso.slice(0, 7);
export const thisMonth = () => today().slice(0, 7);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso) => { if (!iso) return '—'; const d = fromISO(iso.slice(0, 10)); return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const fmtShort = (iso) => { const d = fromISO(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const fmtDateTime = (ts) => { if (!ts) return '—'; const d = new Date(ts); return `${fmtDate(toISO(d))}, ${fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`; };
export const fmtTime = (hhmm) => {
  if (!hhmm) return '—';
  let [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
};
export const weekday = (iso) => fromISO(iso).getDay(); // 0 Sun … 6 Sat
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const mins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const hrs = (minutes) => {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return m ? `${h}h ${pad(m)}m` : `${h}h`;
};

// Week starts Saturday (Bangladesh working week Sat/Sun–Thu). Returns ISO date of week start.
export const weekStart = (iso, startDay = 6) => {
  const d = fromISO(iso);
  const diff = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISO(d);
};

export const monthsBack = (n) => {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); d.setMonth(d.getMonth() - 1); }
  return out;
};

export const initials = (name) => name.replace(/^Md\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Plate "DHAKA METRO-GA 27-4581" → two-line plate chip
export const plate = (regNo, size = '') => {
  if (!regNo) return '<span class="muted">—</span>';
  const m = String(regNo).match(/^(.*?)[\s]+(\d{2}-\d{4})$/);
  const top = m ? m[1] : regNo, bottom = m ? m[2] : '';
  return `<span class="plate ${size}" title="${esc(regNo)}"><span class="p-top">${esc(top)}</span>${bottom ? `<span class="p-num">${esc(bottom)}</span>` : ''}</span>`;
};

export const FUEL_UNIT = { Octane: 'L', Petrol: 'L', Diesel: 'L', CNG: 'm³' };
export const unitOf = (fuelType) => FUEL_UNIT[fuelType] || 'L';
