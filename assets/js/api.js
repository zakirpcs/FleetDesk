// API facade. Every view talks to the data only through this module.
//
// USE_MOCK = true  → data lives in the browser (localStorage), seeded with demo data.
// USE_MOCK = false → the same calls go to the REST backend at API_BASE (see API_CONTRACT.md).
// Switching to the real backend should need no change in any view.
//
// The mode comes from <meta name="fleetdesk-mode"> in index.html, so the same files
// serve both the browser-only demo and the containerised stack, where the frontend
// image rewrites that tag to "api".

import { seed, DEFAULT_SETTINGS } from './seed.js';
import { uid, today, pad } from './utils.js';
import { confirmEmail, rejectEmail, newRequestEmail, cancelEmail } from './email.js';

const declaredMode = document.querySelector('meta[name="fleetdesk-mode"]')?.content?.trim();

export const CONFIG = {
  USE_MOCK: declaredMode !== 'api',
  API_BASE: '/api/v1',
  STORAGE_KEY: 'fleetdesk.v1',
  // Set by app.js: what to do when the backend says nobody is signed in.
  onUnauthorized: null,
};

export const COLLECTIONS = ['drivers', 'cars', 'cards', 'trips', 'fuel', 'requisitions', 'outbox'];

export class ApiError extends Error {
  constructor(message, status = 400, details) { super(message); this.status = status; this.details = details; }
}

// ------------------------------------------------------------------ real backend
async function http(method, path, body) {
  const res = await fetch(CONFIG.API_BASE + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) CONFIG.onUnauthorized?.();
  if (!res.ok) throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.details);
  return data;
}

// ------------------------------------------------------------------ mock backend
let db = null;
const delay = (v) => new Promise((ok) => setTimeout(() => ok(structuredClone(v)), 60));

function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)); } catch { db = null; }
  if (!db || db.version !== 1) { db = seed(); persist(); }
  db.settings = { ...structuredClone(DEFAULT_SETTINGS), ...db.settings };
  return db;
}
function persist() { try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(db)); } catch { /* storage unavailable: keep in memory */ } }
const coll = (name) => { const d = load(); if (!d[name]) throw new ApiError(`Unknown collection ${name}`, 404); return d[name]; };
const find = (name, id) => { const x = coll(name).find((r) => r.id === id); if (!x) throw new ApiError('Record not found', 404); return x; };

const REFS = {
  drivers: [['trips', 'driverId', 'logbook entries'], ['fuel', 'driverId', 'fuel entries'], ['requisitions', 'driverId', 'requisitions']],
  cars: [['trips', 'carId', 'logbook entries'], ['fuel', 'carId', 'fuel entries'], ['requisitions', 'carId', 'requisitions']],
  cards: [['fuel', 'cardId', 'fuel loads']],
};

function validate(name, rec, existingId) {
  const d = load();
  const dupe = (field, label) => {
    const v = String(rec[field] ?? '').trim().toLowerCase();
    if (v && d[name].some((x) => x.id !== existingId && String(x[field]).trim().toLowerCase() === v)) throw new ApiError(`${label} "${rec[field]}" already exists`, 409);
  };
  if (name === 'drivers') { dupe('empId', 'Employee ID'); dupe('licenseNo', 'Licence number'); }
  if (name === 'cars') dupe('regNo', 'Registration number');
  if (name === 'cards') {
    if (!/^\d{4}$/.test(String(rec.last4 || ''))) throw new ApiError('Enter only the last 4 digits of the card');
  }
  if (name === 'trips') {
    if (Number(rec.endOdo) < Number(rec.startOdo)) throw new ApiError('End odometer must be greater than start odometer');
    if (rec.endTime && rec.startTime && rec.endTime <= rec.startTime) throw new ApiError('End time must be after start time');
    const clash = d.trips.find((t) => t.id !== existingId && t.date === rec.date && (t.carId === rec.carId));
    if (clash) throw new ApiError('This car already has a logbook entry for that date. Edit the existing entry instead.', 409);
  }
  if (name === 'fuel') {
    if (!(Number(rec.qty) > 0)) throw new ApiError('Quantity must be more than zero');
    if (rec.cardId) {
      const card = d.cards.find((c) => c.id === rec.cardId);
      if (card && card.status !== 'Active') throw new ApiError(`Card ending ${card.last4} is ${card.status.toLowerCase()} and cannot be used`);
    }
  }
}

function afterWrite(name, rec) {
  const d = load();
  if (name === 'fuel') {
    rec.amount = Math.round(Number(rec.qty) * Number(rec.unitPrice) * 100) / 100;
    rec.payment = rec.cardId ? 'Card' : 'Cash';
  }
  const odo = name === 'trips' ? Number(rec.endOdo) : name === 'fuel' ? Number(rec.odometer) : 0;
  if (odo) { const car = d.cars.find((c) => c.id === rec.carId); if (car && odo > Number(car.odometer || 0)) car.odometer = odo; }
}

const NUMERIC = {
  drivers: ['otRate'], cars: ['year', 'tankCapacity', 'odometer', 'seats'], cards: ['monthlyLimit'],
  trips: ['startOdo', 'endOdo'], fuel: ['qty', 'unitPrice', 'odometer'],
};
const coerce = (name, rec) => { for (const k of NUMERIC[name] || []) if (rec[k] !== undefined && rec[k] !== '') rec[k] = Number(rec[k]); return rec; };

function conflicts({ date, startTime, driverId, carId, excludeId }) {
  const d = load();
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const s = toMin(startTime || '00:00');
  return d.requisitions.filter((r) =>
    r.id !== excludeId && r.status === 'Approved' && r.requiredDate === date &&
    ((driverId && r.driverId === driverId) || (carId && r.carId === carId)) &&
    Math.abs(toMin(r.startTime) - s) < 180);
}

function nextReqNo(date) {
  const d = load();
  const ym = date.slice(2, 4) + date.slice(5, 7);
  const seqs = d.requisitions.filter((r) => r.reqNo.startsWith(`CR-${ym}-`)).map((r) => Number(r.reqNo.split('-')[2]) || 0);
  return `CR-${ym}-${Math.max(100, ...seqs) + 1}`;
}

function queueEmail(mail) {
  load().outbox.unshift({ id: uid('e'), sentAt: new Date().toISOString(), status: 'Sent', ...mail });
}

const mock = {
  list: (name) => delay(coll(name)),
  get: (name, id) => delay(find(name, id)),
  create(name, data) {
    const rec = coerce(name, { ...data, id: uid(name[0]) });
    validate(name, rec);
    afterWrite(name, rec);
    coll(name).push(rec); persist();
    return delay(rec);
  },
  update(name, id, patch) {
    const rec = find(name, id);
    const next = coerce(name, { ...rec, ...patch, id });
    validate(name, next, id);
    afterWrite(name, next);
    Object.assign(rec, next); persist();
    return delay(rec);
  },
  remove(name, id) {
    find(name, id);
    for (const [other, field, label] of REFS[name] || []) {
      const n = coll(other).filter((x) => x[field] === id).length;
      if (n) throw new ApiError(`Cannot delete: used in ${n} ${label}. Mark it inactive instead.`, 409);
    }
    const arr = coll(name); arr.splice(arr.findIndex((x) => x.id === id), 1); persist();
    return delay(null);
  },
  getSettings: () => delay(load().settings),
  saveSettings(s) { load().settings = { ...load().settings, ...s }; persist(); return delay(load().settings); },
  testMail: () => { throw new ApiError('Sending email needs the backend connected'); },
  retryEmail: () => { throw new ApiError('Sending email needs the backend connected'); },

  submitRequisition(data) {
    const req = {
      ...data, id: uid('r'), reqNo: nextReqNo(data.requiredDate), status: 'Pending',
      createdAt: new Date().toISOString(), reviewedAt: '', reviewedBy: '', driverId: '', carId: '', remarks: '',
    };
    if (req.requiredDate < today()) throw new ApiError('Car required date cannot be in the past');
    load().requisitions.push(req);
    queueEmail(newRequestEmail(req, load().settings));
    persist();
    return delay(req);
  },
  approveRequisition(id, { driverId, carId, remarks }) {
    const d = load(); const req = find('requisitions', id);
    if (req.status !== 'Pending') throw new ApiError(`This request is already ${req.status.toLowerCase()}`, 409);
    if (!driverId || !carId) throw new ApiError('Choose a driver and a car before approving');
    const clash = conflicts({ date: req.requiredDate, startTime: req.startTime, driverId, carId, excludeId: id });
    if (clash.length) throw new ApiError(`Driver or car is already booked around that time (${clash.map((c) => c.reqNo).join(', ')})`, 409);
    Object.assign(req, { status: 'Approved', driverId, carId, remarks: remarks || '', reviewedAt: new Date().toISOString(), reviewedBy: d.settings.teamLeadName });
    queueEmail(confirmEmail(req, d.drivers.find((x) => x.id === driverId), d.cars.find((x) => x.id === carId), d.settings));
    persist();
    return delay(req);
  },
  rejectRequisition(id, remarks) {
    const d = load(); const req = find('requisitions', id);
    if (req.status !== 'Pending') throw new ApiError(`This request is already ${req.status.toLowerCase()}`, 409);
    if (!remarks?.trim()) throw new ApiError('Give a reason so the requester knows what to change');
    Object.assign(req, { status: 'Rejected', remarks, reviewedAt: new Date().toISOString(), reviewedBy: d.settings.teamLeadName });
    queueEmail(rejectEmail(req, d.settings));
    persist();
    return delay(req);
  },
  cancelRequisition(id, reason = '') {
    const req = find('requisitions', id);
    if (req.status === 'Cancelled') throw new ApiError('That request is already cancelled.', 409);
    if (!['Pending', 'Approved'].includes(req.status)) throw new ApiError(`A ${req.status.toLowerCase()} request cannot be cancelled.`, 409);
    if (req.status === 'Approved') {
      const now = new Date();
      const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      if (req.requiredDate < today() || (req.requiredDate === today() && req.startTime <= hhmm)) {
        throw new ApiError('That trip has already started. Call AGS if the car is no longer needed.', 409);
      }
      if (!reason.trim()) throw new ApiError('Give a short reason so AGS knows why the car is free again');
      const d = load();
      queueEmail(cancelEmail({ ...req, cancelReason: reason }, d.drivers.find((x) => x.id === req.driverId), d.cars.find((x) => x.id === req.carId), d.settings));
    }
    Object.assign(req, { status: 'Cancelled', cancelledAt: new Date().toISOString(), cancelledBy: req.name, cancelReason: reason });
    persist();
    return delay(req);
  },
  conflicts: (q) => delay(conflicts(q)),
  resetDemo() { db = seed(); persist(); return delay(true); },
  // In mock mode the signed-in person is whatever the "Viewing as" switcher says,
  // so app.js supplies the identity itself. Accounts need the backend.
  me: () => delay(null),
  signOut: () => delay(null),
  changePassword: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  saveProfile: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  listSessions: () => delay([]),
  revokeOtherSessions: () => delay({ ok: true }),
  listUsers: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  createUser: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  updateUser: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  resetUserPassword: () => { throw new ApiError('Accounts are only available with the backend connected'); },
  deleteUser: () => { throw new ApiError('Accounts are only available with the backend connected'); },
};

const real = {
  list: (name) => http('GET', `/${name}`),
  get: (name, id) => http('GET', `/${name}/${id}`),
  create: (name, data) => http('POST', `/${name}`, data),
  update: (name, id, patch) => http('PATCH', `/${name}/${id}`, patch),
  remove: (name, id) => http('DELETE', `/${name}/${id}`),
  getSettings: () => http('GET', '/settings'),
  saveSettings: (s) => http('PUT', '/settings', s),
  testMail: (to) => http('POST', '/settings/mail-test', { to }),
  retryEmail: (id) => http('POST', `/outbox/${id}/retry`),
  submitRequisition: (data) => http('POST', '/requisitions', data),
  approveRequisition: (id, body) => http('POST', `/requisitions/${id}/approve`, body),
  rejectRequisition: (id, remarks) => http('POST', `/requisitions/${id}/reject`, { remarks }),
  cancelRequisition: (id, reason = '') => http('POST', `/requisitions/${id}/cancel`, { reason }),
  conflicts: (q) => http('GET', `/requisitions/conflicts?${new URLSearchParams(q)}`),
  resetDemo: async () => { throw new ApiError('Demo reset is only available in mock mode'); },
  me: () => http('GET', '/me'),

  // ---- accounts
  signOut: () => http('POST', '/auth/logout'),
  changePassword: (currentPassword, newPassword) => http('POST', '/auth/password', { currentPassword, newPassword }),
  saveProfile: (patch) => http('PATCH', '/auth/profile', patch),
  listSessions: () => http('GET', '/auth/sessions'),
  revokeOtherSessions: () => http('POST', '/auth/sessions/revoke'),
  listUsers: () => http('GET', '/users'),
  createUser: (data) => http('POST', '/users', data),
  updateUser: (id, patch) => http('PATCH', `/users/${id}`, patch),
  resetUserPassword: (id) => http('POST', `/users/${id}/password`),
  deleteUser: (id) => http('DELETE', `/users/${id}`),
};

// Wrap mock calls so synchronous throws become rejected promises, like fetch errors.
const wrap = (impl) => Object.fromEntries(Object.entries(impl).map(([k, fn]) => [k, (...a) => { try { return Promise.resolve(fn(...a)); } catch (e) { return Promise.reject(e); } }]));

export const api = CONFIG.USE_MOCK ? wrap(mock) : real;

// Load several collections at once: const { cars, drivers } = await loadAll('cars', 'drivers')
export async function loadAll(...names) {
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = n === 'settings' ? await api.getSettings() : await api.list(n); }));
  return out;
}
