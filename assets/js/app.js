// App shell: role handling, navigation, hash router.
import { api, CONFIG, loadAll } from './api.js';
import { esc, initials, byId, fmtDate, fmtTime, num, num1, bdt, unitOf } from './utils.js';
import { toast, confirmDialog, closeAllModals, pill } from './ui.js';
import { TABS as settingsTabs } from './views/settings.js';

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  dashboard: P('<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z"/>'),
  request: P('<path d="M5 17h14M6 17l1.5-6h9L18 17M8 17v2M16 17v2M9 7h6"/><circle cx="12" cy="4" r="0.6"/>'),
  mine: P('<path d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01"/>'),
  approvals: P('<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>'),
  drivers: P('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>'),
  cars: P('<path d="M3 16v-3l2-5h14l2 5v3zM5 16v2M19 16v2"/><circle cx="7.5" cy="13" r="0.8"/><circle cx="16.5" cy="13" r="0.8"/>'),
  cards: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  logbook: P('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>'),
  fuel: P('<path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M3 20h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4"/>'),
  mileage: P('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>'),
  consumption: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  overtime: P('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  outbox: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  assignments: P('<path d="M4 8h12M13 5l3 3-3 3"/><path d="M20 16H8M11 13l-3 3 3 3"/>'),
  users: P('<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c.8-3.4 3.6-5 6.5-5s5.7 1.6 6.5 5"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 15.4c2 .6 3.3 2.2 3.8 4.6"/>'),
  account: P('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.9-3.6 3.9-5.4 7.5-5.4s6.6 1.8 7.5 5.4"/>'),
  signout: P('<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>'),
};

const ALL = ['employee', 'ags', 'lead'];
const STAFF = ['ags', 'lead'];
export const ROUTES = [
  { path: 'dashboard', title: 'Dashboard', group: 'Overview', roles: STAFF, load: () => import('./views/dashboard.js') },
  { path: 'request', title: 'Request a car', group: 'Car requests', roles: ALL, load: () => import('./views/request.js') },
  { path: 'my-requests', title: 'My requests', group: 'Car requests', roles: ALL, load: () => import('./views/myrequests.js'), icon: 'mine' },
  { path: 'approvals', title: 'Approvals', group: 'Car requests', roles: STAFF, load: () => import('./views/approvals.js'), badge: 'pending' },
  { path: 'cars', title: 'Cars', group: 'Inventory', roles: STAFF, load: () => import('./views/cars.js') },
  { path: 'drivers', title: 'Drivers', group: 'Inventory', roles: STAFF, load: () => import('./views/drivers.js') },
  { path: 'cards', title: 'Payment cards', group: 'Inventory', roles: STAFF, load: () => import('./views/cards.js') },
  { path: 'logbook', title: 'Daily logbook', group: 'Daily records', roles: STAFF, load: () => import('./views/logbook.js') },
  { path: 'fuel', title: 'Fuel loads', group: 'Daily records', roles: STAFF, load: () => import('./views/fuel.js') },
  { path: 'mileage', title: 'Running km', group: 'Reports', roles: STAFF, load: () => import('./views/mileage.js') },
  { path: 'consumption', title: 'Fuel consumption', group: 'Reports', roles: STAFF, load: () => import('./views/consumption.js') },
  { path: 'overtime', title: 'Driver overtime', group: 'Reports', roles: STAFF, load: () => import('./views/overtime.js') },
  { path: 'assignments', title: 'Assignment history', group: 'Reports', roles: STAFF, load: () => import('./views/assignments.js') },
  { path: 'outbox', title: 'Email log', group: 'Admin', roles: STAFF, load: () => import('./views/outbox.js') },
  { path: 'users', title: 'People and access', group: 'Admin', roles: ['lead'], load: () => import('./views/users.js'), icon: 'users', backend: true },
  { path: 'settings', title: 'Settings', group: 'Admin', roles: ['lead'], load: () => import('./views/settings.js'), tabbed: true },
  // Reached from the user menu rather than the menu bar.
  { path: 'account', title: 'My account', group: 'Account', roles: ALL, load: () => import('./views/account.js'), icon: 'account', hidden: true, backend: true },
];

// Demo identities for mock mode. With the backend connected, the signed-in person
// comes from GET /api/v1/me instead.
const USERS = {
  employee: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: 'tahmina.akter@company.local', role: 'Employee' },
  ags: { name: 'Habibur Rahman', designation: 'Executive, AGS', email: 'habibur.rahman@company.local', role: 'AGS staff' },
  lead: { name: 'Shafiqul Alam', designation: 'Team Lead, AGS', email: 'ags.lead@company.local', role: 'AGS team lead' },
};

/** Pages this person can open: their role, and — for accounts — a backend to talk to. */
const routesFor = (role) => ROUTES.filter((r) => r.roles.includes(role) && !(r.backend && CONFIG.USE_MOCK));

const state = {
  role: (() => { try { return localStorage.getItem('fleetdesk.role') || 'lead'; } catch { return 'lead'; } })(),
  user: null,
  // 'demo' = the browser-only demo with its "Viewing as" switcher; 'password' = signed
  // in through Fleet Desk's own login page; 'proxy' = signed in by the company account.
  authMode: 'demo',
  mustChangePassword: false,
};

export const ctx = {
  get role() { return state.role; },
  get user() { return state.user || USERS[state.role]; },
  can: (what) => ({ approve: state.role === 'lead', manage: STAFF.includes(state.role) }[what]),
  get authMode() { return state.authMode; },
  get mustChangePassword() { return state.mustChangePassword; },
  navigate: (path) => { location.hash = '#' + path; },
  refreshNav: () => renderNav(),
};

const CARET = '<svg class="caret" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

let pendingCount = 0;

/** The top menu: one entry per category, with its pages in a dropdown. */
async function renderNav() {
  const reqs = STAFF.includes(state.role) ? await api.list('requisitions') : [];
  pendingCount = reqs.filter((r) => r.status === 'Pending').length;
  const current = currentPath();

  const groups = {};
  for (const r of routesFor(state.role).filter((r) => !r.hidden)) (groups[r.group] ||= []).push(r);

  const badge = (n) => (n ? `<span class="nav-badge" aria-label="${n} waiting for review">${n}</span>` : '');
  const pageBadge = (r) => badge(r.badge ? pendingCount : 0);
  const isCurrent = (r) => r.path === current || (r.tabbed && currentTop() === r.path);
  const link = (r, cls) => `<a class="${cls}" href="#${r.path}"${isCurrent(r) ? ' aria-current="page"' : ''}>${I[r.icon || r.path]}<span>${esc(r.title)}</span>${pageBadge(r)}</a>`;

  document.getElementById('menuInner').innerHTML = Object.entries(groups).map(([group, items], i) => {
    const here = items.some(isCurrent) ? ' active' : '';
    // A category with a single page needs no dropdown.
    if (items.length === 1) return `<div class="menu-item${here}">${link(items[0], 'menu-top is-link')}</div>`;
    const waiting = items.some((r) => r.badge) ? pendingCount : 0;
    return `<div class="menu-item${here}">
        <button class="menu-top is-group" type="button" aria-expanded="false" aria-controls="submenu-${i}">
          <span>${esc(group)}</span>${badge(waiting)}${CARET}
        </button>
        <div class="submenu" id="submenu-${i}" role="group" aria-label="${esc(group)}">${items.map((r) => link(r, 'submenu-link')).join('')}</div>
      </div>`;
  }).join('');

  renderUserMenu();
}

const ROLE_NAME = { employee: 'Employee', ags: 'AGS staff', lead: 'AGS team lead' };

function renderUserMenu() {
  const u = ctx.user;
  document.getElementById('userChip').innerHTML = `
    <span class="avatar" aria-hidden="true">${initials(u.name)}</span>
    <span class="who">${esc(u.name)}<small>${esc(u.designation || ROLE_NAME[state.role])}</small></span>
    ${CARET}`;
  const signedIn = state.authMode !== 'demo';
  document.getElementById('userPanel').innerHTML = `
    <div class="user-panel-head">
      <b>${esc(u.name)}</b>
      <small>${esc(u.email)}</small>
      ${pill(ROLE_NAME[state.role] || state.role)}
    </div>
    ${signedIn ? `<a href="#account">${I.account}<span>My account</span></a>` : ''}
    ${state.role === 'lead' && signedIn ? `<a href="#users">${I.users}<span>People and access</span></a>` : ''}
    ${state.authMode === 'password' ? `<button type="button" id="signOut" class="danger">${I.signout}<span>Sign out</span></button>` : ''}
    ${state.authMode === 'proxy' ? '<p class="user-panel-note">Signed in with your company account.</p>' : ''}
    ${state.authMode === 'demo' ? '<p class="user-panel-note">Demo mode: pick a role with “Viewing as”. Sign-in needs the backend.</p>' : ''}`;
  document.getElementById('signOut')?.addEventListener('click', signOut);
}

async function signOut() {
  closeUserMenu();
  try { await api.signOut(); } catch { /* the session may already be gone */ }
  location.replace('login.html');
}

// Only the browser-only demo can be reset; with the backend it is real data.
const resetBtn = document.getElementById('resetDemo');
resetBtn.hidden = !CONFIG.USE_MOCK;
resetBtn.addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Reset demo data?', message: 'This replaces everything you have entered in this browser with the original sample data.', confirmLabel: 'Reset data', danger: true }))) return;
  await api.resetDemo();
  searchCache = { role: null, at: 0, items: null };
  toast('Demo data reset');
  route();
});

// ---- The user menu ---------------------------------------------------------
const userMenu = document.getElementById('userMenu');
const userBtn = document.getElementById('userChip');
const userPanel = document.getElementById('userPanel');

function closeUserMenu() {
  if (!userMenu.classList.contains('open')) return;
  userMenu.classList.remove('open');
  userPanel.hidden = true;
  userBtn.setAttribute('aria-expanded', 'false');
}

function openUserMenu() {
  closeMenus();
  userMenu.classList.add('open');
  userPanel.hidden = false;
  userBtn.setAttribute('aria-expanded', 'true');
}

userBtn.addEventListener('click', () => (userMenu.classList.contains('open') ? closeUserMenu() : openUserMenu()));
userPanel.addEventListener('click', (e) => { if (e.target.closest('a')) closeUserMenu(); });
document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) closeUserMenu(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || userPanel.hidden) return;
  closeUserMenu();
  userBtn.focus();
});

// ---- Search ----------------------------------------------------------------
// One box for the whole app: it looks through the pages the role can open and the
// records it is allowed to see, then lands on the right page with its own filter
// already filled in (#cars?q=…), so the chosen row is the one on screen.

const searchInput = document.getElementById('globalSearch');
const searchPanel = document.getElementById('searchResults');

const SOURCES = [
  {
    name: 'requisitions', type: 'Request', roles: ALL, icon: 'approvals',
    page: () => (STAFF.includes(state.role) ? 'approvals' : 'my-requests'),
    when: (r) => r.requiredDate,
    title: (r) => `${r.reqNo} · ${r.name}`,
    sub: (r) => `${fmtDate(r.requiredDate)}, ${fmtTime(r.startTime)} · ${r.startPoint} to ${r.destination} · ${r.status}`,
    terms: (r) => [r.reqNo, r.name, r.designation, r.startPoint, r.destination, r.reason, r.status],
    params: (r) => ({ q: r.reqNo }),
  },
  {
    name: 'cars', type: 'Car', roles: STAFF, icon: 'cars', page: () => 'cars',
    title: (r) => r.regNo,
    sub: (r) => [`${r.make} ${r.model}`.trim(), r.year, r.status].filter(Boolean).join(' · '),
    terms: (r) => [r.regNo, r.make, r.model, r.year, r.fuelType, r.status],
    params: (r) => ({ q: r.regNo }),
  },
  {
    name: 'drivers', type: 'Driver', roles: STAFF, icon: 'drivers', page: () => 'drivers',
    title: (r) => r.name,
    sub: (r) => [r.empId, r.mobile, r.status].filter(Boolean).join(' · '),
    terms: (r) => [r.name, r.empId, r.mobile, r.licenseNo, r.status],
    params: (r) => ({ q: r.name }),
  },
  {
    name: 'cards', type: 'Payment card', roles: STAFF, icon: 'cards', page: () => 'cards',
    title: (r) => `•••• ${r.last4}`,
    sub: (r) => [r.provider, r.cardType, r.status].filter(Boolean).join(' · '),
    terms: (r) => [r.last4, r.provider, r.cardType, r.status],
    params: (r) => ({ q: r.last4 }),
  },
  // A logbook entry is one car on one day, so the date and the car pinpoint it in the
  // page's own filters — which also widens the date range past the month it defaults to.
  {
    name: 'trips', type: 'Logbook entry', roles: STAFF, icon: 'logbook', page: () => 'logbook',
    when: (t) => t.date,
    title: (t, look) => `${fmtDate(t.date)} · ${look.cars[t.carId]?.regNo || 'Unknown car'}`,
    sub: (t, look) => [look.drivers[t.driverId]?.name, `${fmtTime(t.startTime)}–${fmtTime(t.endTime)}`,
      `${num(Math.max(0, t.endOdo - t.startOdo))} km`, `${t.from} to ${t.to}`, t.purpose].filter(Boolean).join(' · '),
    terms: (t, look) => [t.date, fmtDate(t.date), look.cars[t.carId]?.regNo, look.drivers[t.driverId]?.name, t.from, t.to, t.purpose],
    params: (t) => ({ from: t.date, to: t.date, car: t.carId }),
  },
  {
    name: 'fuel', type: 'Fuel load', roles: STAFF, icon: 'fuel', page: () => 'fuel',
    when: (f) => f.date,
    title: (f, look) => `${fmtDate(f.date)} · ${look.cars[f.carId]?.regNo || 'Unknown car'}`,
    sub: (f, look) => [`${num1(f.qty)} ${unitOf(f.fuelType)} ${f.fuelType}`, bdt(f.amount),
      f.cardId ? `${look.cards[f.cardId]?.provider || 'Card'} ••${look.cards[f.cardId]?.last4 || ''}` : 'Cash',
      f.station, f.receiptNo].filter(Boolean).join(' · '),
    terms: (f, look) => [f.date, fmtDate(f.date), look.cars[f.carId]?.regNo, look.drivers[f.driverId]?.name,
      f.station, f.receiptNo, f.fuelType, f.payment, look.cards[f.cardId]?.provider, look.cards[f.cardId]?.last4],
    params: (f) => ({ from: f.date, to: f.date, car: f.carId }),
  },
];
const TYPE_LABEL = {
  Page: 'Pages', Request: 'Requests', Car: 'Cars', Driver: 'Drivers',
  'Payment card': 'Payment cards', 'Logbook entry': 'Logbook entries', 'Fuel load': 'Fuel loads',
};
const TYPE_ORDER = Object.keys(TYPE_LABEL);
const PER_TYPE = 4, MAX_RESULTS = 14, SEARCH_TTL = 30_000;

let searchCache = { role: null, at: 0, items: null };

// The path is searchable too, so "mileage" finds "Running km". A tabbed page offers
// its tabs as well, so "email log" still goes straight there.
const pageItems = () => routesFor(state.role).flatMap((r) => {
  const page = {
    type: 'Page', icon: r.icon || r.path, page: r.path, params: {},
    title: r.title, sub: r.group, terms: [r.title, r.group, r.path],
  };
  if (!r.tabbed) return [page];
  return [page, ...settingsTabs.map((t) => ({
    type: 'Page', icon: r.icon || r.path, page: `${r.path}/${t.id}`, params: {},
    title: t.title, sub: `${r.group} · ${r.title}`, terms: [t.title, t.id, r.title],
  }))];
});

async function recordItems() {
  const usable = searchCache.items && searchCache.role === state.role && Date.now() - searchCache.at < SEARCH_TTL;
  if (usable) return searchCache.items;
  const sources = SOURCES.filter((s) => s.roles.includes(state.role));
  const data = await loadAll(...sources.map((s) => s.name));
  // Logbook and fuel rows only read well with the car, driver and card names filled in.
  const look = { cars: byId(data.cars || []), drivers: byId(data.drivers || []), cards: byId(data.cards || []) };
  const items = sources.flatMap((s) => (data[s.name] || []).map((r) => ({
    type: s.type, icon: s.icon, page: s.page(), params: s.params(r), when: s.when?.(r) || '',
    title: s.title(r, look), sub: s.sub(r, look), terms: s.terms(r, look),
  })));
  searchCache = { role: state.role, at: Date.now(), items };
  return items;
}

const lower = (v) => String(v ?? '').toLowerCase();
const squash = (v) => lower(v).replace(/[^a-z0-9]+/g, '');

const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 3 = starts with, 2 = starts a word, 1 = appears anywhere (punctuation ignored). */
function score(terms, needle, squashed, wordRe) {
  let best = 0;
  for (const term of terms) {
    const v = lower(term);
    if (!v) continue;
    if (v.startsWith(needle)) return 3;
    if (wordRe.test(v)) best = Math.max(best, 2);
    else if (v.includes(needle) || (squashed.length > 2 && squash(term).includes(squashed))) best = Math.max(best, 1);
  }
  return best;
}

const href = (params) => {
  const query = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v)).toString();
  return query ? `?${query}` : '';
};

function resultsHtml(groups, needle) {
  let n = 0;
  const html = groups.map(([type, items]) => `
    <div class="search-group" role="group" aria-label="${esc(type)}">
      <div class="search-group-title">${esc(TYPE_LABEL[type] || type)}</div>
      ${items.map((it) => `
        <a class="search-opt" role="option" id="sr-${n++}" aria-selected="false" href="#${it.page}${href(it.params)}">
          ${I[it.icon] || ''}
          <span class="search-text"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
        </a>`).join('')}
    </div>`).join('');
  return html || `<p class="search-empty">Nothing matches “${esc(needle)}”.</p>`;
}

let searchSeq = 0;
let activeIndex = -1;

function closeSearch() {
  searchPanel.hidden = true;
  searchPanel.innerHTML = '';
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
  activeIndex = -1;
}

const options = () => [...searchPanel.querySelectorAll('.search-opt')];

function setActive(n) {
  const list = options();
  if (!list.length) return;
  activeIndex = (n + list.length) % list.length;
  list.forEach((el, i) => el.setAttribute('aria-selected', String(i === activeIndex)));
  const el = list[activeIndex];
  searchInput.setAttribute('aria-activedescendant', el.id);
  el.scrollIntoView({ block: 'nearest' });
}

async function runSearch(raw) {
  const needle = raw.trim().toLowerCase();
  if (needle.length < 2) return closeSearch();
  const seq = ++searchSeq;

  let items = pageItems();
  try {
    items = items.concat(await recordItems());
  } catch (e) {
    if (seq !== searchSeq) return;
    searchPanel.innerHTML = `<p class="search-empty">Search is unavailable: ${esc(e.message)}</p>`;
    searchPanel.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    return;
  }
  if (seq !== searchSeq) return;

  const squashed = squash(needle);
  const wordRe = new RegExp(`\\b${escapeRe(needle)}`);
  const hits = [];
  for (const item of items) {
    const s = score(item.terms, needle, squashed, wordRe);
    if (s) hits.push({ item, s });
  }
  const groups = TYPE_ORDER
    .map((type) => [type, hits
      .filter((h) => h.item.type === type)
      .sort((a, b) => b.s - a.s || (b.item.when || '').localeCompare(a.item.when || ''))
      .slice(0, PER_TYPE)
      .map((h) => h.item)])
    .filter(([, list]) => list.length);

  // Share the panel out a row at a time, so one busy kind cannot crowd out the rest.
  const keep = groups.map(() => 0);
  for (let left = MAX_RESULTS, round = 0; round < PER_TYPE && left > 0; round++) {
    for (let g = 0; g < groups.length && left > 0; g++) {
      if (keep[g] < groups[g][1].length) { keep[g]++; left--; }
    }
  }
  groups.forEach((group, g) => { group[1] = group[1].slice(0, keep[g]); });

  searchPanel.innerHTML = resultsHtml(groups, raw.trim());
  searchPanel.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  activeIndex = -1;
  if (groups.length) setActive(0);
}

function goToResult(el) {
  if (!el) return;
  const target = el.getAttribute('href');
  searchInput.value = '';
  closeSearch();
  searchInput.blur();
  if (location.hash === target) route();     // same page, same filter: just redraw
  else location.hash = target;
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const value = searchInput.value;
  searchTimer = setTimeout(() => runSearch(value), 120);
});
searchInput.addEventListener('focus', () => { if (searchInput.value.trim().length > 1 && searchPanel.hidden) runSearch(searchInput.value); });

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (searchPanel.hidden) return;
    e.preventDefault();
    setActive(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter') {
    const list = options();
    if (!list.length) return;
    e.preventDefault();
    goToResult(list[Math.max(0, activeIndex)]);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (!searchPanel.hidden) closeSearch();
    else { searchInput.value = ''; searchInput.blur(); }
  }
});

searchPanel.addEventListener('click', (e) => {
  const opt = e.target.closest('.search-opt');
  if (!opt) return;
  e.preventDefault();
  goToResult(opt);
});
searchPanel.addEventListener('mousemove', (e) => {
  const opt = e.target.closest('.search-opt');
  if (opt) setActive(options().indexOf(opt));
});

document.addEventListener('click', (e) => { if (!e.target.closest('.menu-search')) closeSearch(); });
searchInput.addEventListener('blur', () => setTimeout(() => { if (!searchPanel.contains(document.activeElement)) closeSearch(); }, 120));

// "/" or Ctrl/Cmd-K jumps to the box from anywhere.
document.addEventListener('keydown', (e) => {
  const typing = e.target.matches('input, select, textarea') || e.target.isContentEditable;
  const shortcut = (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
  if (!shortcut || document.querySelector('.modal')) return;
  e.preventDefault();
  if (!searchInput.offsetParent) setDrawer(true);   // the box lives in the drawer on small screens
  searchInput.focus();
  searchInput.select();
});

// ---- Dropdowns -------------------------------------------------------------
const menubar = document.getElementById('menubar');
const menuBtn = document.getElementById('menuBtn');

const openItem = () => menubar.querySelector('.menu-item.open');
const groupButtons = () => [...menubar.querySelectorAll('.menu-top.is-group')];

function closeMenus({ refocus = false } = {}) {
  const item = openItem();
  if (!item) return;
  const button = item.querySelector('.menu-top');
  item.classList.remove('open', 'flip');
  button?.setAttribute('aria-expanded', 'false');
  if (refocus) button?.focus();
}

function openMenu(item) {
  if (!item || item.classList.contains('open')) return;
  closeMenus();
  item.classList.add('open');
  item.querySelector('.menu-top')?.setAttribute('aria-expanded', 'true');
  // Flip the panel when it would run off the right edge.
  const panel = item.querySelector('.submenu');
  if (panel && panel.getBoundingClientRect().right > window.innerWidth - 8) item.classList.add('flip');
}

const drawerOpen = () => menubar.classList.contains('open');
function setDrawer(open) {
  menubar.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (!open) closeMenus();
}

menuBtn.addEventListener('click', () => setDrawer(!drawerOpen()));

menubar.addEventListener('click', (e) => {
  // Following a link closes the menu, even when it is the page already open.
  if (e.target.closest('a')) { closeMenus(); setDrawer(false); return; }
  const button = e.target.closest('.menu-top.is-group');
  if (!button) return;
  if (button.closest('.menu-item').classList.contains('open')) closeMenus();
  else openMenu(button.closest('.menu-item'));
});

// Once one dropdown is open, moving across the bar switches between them.
menubar.addEventListener('mouseover', (e) => {
  if (!openItem()) return;
  const button = e.target.closest('.menu-top.is-group');
  if (button) openMenu(button.closest('.menu-item'));
});

menubar.addEventListener('keydown', (e) => {
  const button = e.target.closest('.menu-top.is-group');
  const links = () => [...(openItem()?.querySelectorAll('.submenu-link') || [])];
  const step = (list, from, by) => list[(list.indexOf(from) + by + list.length) % list.length]?.focus();

  if (e.key === 'Escape') { if (openItem()) { e.preventDefault(); closeMenus({ refocus: true }); } return; }
  if (button && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    openMenu(button.closest('.menu-item'));
    const items = links();
    (e.key === 'ArrowDown' ? items[0] : items.at(-1))?.focus();
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const buttons = groupButtons();
    const from = button || openItem()?.querySelector('.menu-top');
    if (!from || !buttons.length) return;
    e.preventDefault();
    const next = buttons[(buttons.indexOf(from) + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    const wasOpen = Boolean(openItem());
    next.focus();
    if (wasOpen) { openMenu(next.closest('.menu-item')); next.focus(); }
    return;
  }
  const link = e.target.closest('.submenu-link');
  if (link && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); step(links(), link, e.key === 'ArrowDown' ? 1 : -1); }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('.topbar')) return;
  closeMenus();
  if (drawerOpen()) setDrawer(false);
});
// Tabbing out of the bar closes whatever is open.
menubar.addEventListener('focusout', (e) => {
  if (!menubar.contains(e.relatedTarget)) closeMenus();
});

let leaving = false;
/** Hand over to the sign-in page, remembering where we were. */
function goToLogin() {
  if (leaving) return;
  leaving = true;
  const next = /^#[\w-]*$/.test(location.hash) ? location.hash : '';
  location.replace(`login.html${next ? `?next=${encodeURIComponent(next)}` : ''}`);
}

/**
 * Work out who is signed in: from the session with the backend connected, or from the
 * "Viewing as" switcher in the browser-only demo.
 */
async function identify() {
  if (CONFIG.USE_MOCK) {
    state.user = USERS[state.role];
    state.authMode = 'demo';
    return;
  }
  const me = await api.me();
  state.role = ['employee', 'ags', 'lead'].includes(me.role) ? me.role : 'employee';
  state.user = { id: me.id, name: me.name, designation: me.designation, email: me.email };
  state.authMode = me.authMode === 'proxy' ? 'proxy' : 'password';
  state.mustChangePassword = Boolean(me.mustChangePassword);
  // The account decides the role now, so the demo switcher has nothing to do.
  roleSelect.closest('.role-switch').hidden = true;
}

/** Called by views after the signed-in person edits their own profile. */
export function refreshIdentity(patch) {
  Object.assign(state.user, patch);
  renderUserMenu();
}

/** Called by the account view once a forced password change is done. */
export function passwordChanged() {
  state.mustChangePassword = false;
  renderNav();
}

const currentPath = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');
const currentTop = () => currentPath().split('/')[0];
const routeQuery = () => new URLSearchParams(location.hash.split('?')[1] || '');

let renderSeq = 0;
async function route() {
  const seq = ++renderSeq;
  let path = currentPath();
  const allowed = routesFor(state.role);
  // A temporary password has to be replaced before anything else is reachable.
  if (state.mustChangePassword && path !== 'account') {
    history.replaceState(null, '', '#account');
    path = 'account';
  }
  const top = path.split('/')[0];
  let r = allowed.find((x) => x.path === path) || allowed.find((x) => x.tabbed && x.path === top);
  if (!r) { r = allowed[0]; if (path !== r.path) { history.replaceState(null, '', '#' + r.path); path = r.path; } }
  document.getElementById('pageTitle').textContent = r.title;
  document.getElementById('pageCrumb').textContent = r.group;
  document.title = `${r.title} · Fleet Desk`;
  const view = document.getElementById('view');
  view.innerHTML = '<p class="muted">Loading…</p>';
  closeAllModals();
  closeMenus();
  closeSearch();
  closeUserMenu();
  setDrawer(false);
  searchCache.items = null;       // anything may have changed while we were on that page
  renderNav();
  try {
    const mod = await r.load();
    if (seq !== renderSeq) return;
    // Each page renders into its own pane. When the next page replaces it, the old
    // pane is detached but intact, so a slow load() still finishing on the page we
    // just left writes into nothing instead of tripping over missing elements.
    const pane = document.createElement('div');
    view.replaceChildren(pane);
    await mod.render(pane, ctx, path.split('/').slice(1).join('/'));
    applySearchTerm(pane);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    view.innerHTML = `<div class="callout bad">This page could not load: ${esc(e.message)}</div>`;
  }
}

/**
 * A page opened from the search box starts with that result showing: each query
 * parameter fills the page control of the same name (#cars?q=…, #logbook?from=…&car=…).
 */
function applySearchTerm(view) {
  for (const [name, value] of routeQuery()) {
    const field = view.querySelector(`#${CSS.escape(name)}`);
    if (!field || !['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName)) continue;
    field.value = value;
    field.dispatchEvent(new Event(field.tagName === 'SELECT' || field.type === 'date' ? 'change' : 'input', { bubbles: true }));
  }
}

// ---- role switcher (demo only; a real sign-in gives the role to the API instead)
const roleSelect = document.getElementById('roleSelect');
roleSelect.value = state.role;
roleSelect.addEventListener('change', async () => {
  state.role = roleSelect.value;
  try { localStorage.setItem('fleetdesk.role', state.role); } catch { /* ignore */ }
  await identify();
  route();
});

window.addEventListener('hashchange', route);

// A 401 from anywhere — including a session that expires mid-visit — ends up here.
CONFIG.onUnauthorized = goToLogin;

identify().then(route, (e) => {
  if (leaving || e.status === 401) return;        // already on the way to the sign-in page
  console.error(e);
  document.getElementById('view').innerHTML = `<div class="callout bad">Fleet Desk could not reach the server: ${esc(e.message)}</div>`;
});
