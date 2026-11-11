// Admin: settings, accounts and the email log, as tabs on one page.
//
// Each tab has its own address (#admin/users), so a link, the back button and the
// search box all land where they should. Switching tabs is a normal navigation, so
// a tab always draws from fresh data rather than whatever it held last time.
import { CONFIG } from '../api.js';
import { esc } from '../utils.js';

export const TABS = [
  { path: 'settings', title: 'Settings', roles: ['lead'], load: () => import('./settings.js') },
  { path: 'users', title: 'People and access', roles: ['lead'], backend: true, load: () => import('./users.js') },
  { path: 'outbox', title: 'Email log', roles: ['ags', 'lead'], load: () => import('./outbox.js') },
];

export const tabsFor = (role) => TABS.filter((t) => t.roles.includes(role) && !(t.backend && CONFIG.USE_MOCK));

export async function render(el, ctx, subPath = '') {
  const available = tabsFor(ctx.role);
  if (!available.length) {
    el.innerHTML = '<div class="callout warn">There is nothing here for your role.</div>';
    return;
  }
  const tab = available.find((t) => t.path === subPath) || available[0];

  // The page is "Admin"; the heading says which part of it you are looking at.
  document.getElementById('pageTitle').textContent = tab.title;

  el.innerHTML = `
    ${available.length > 1 ? `<nav class="tabs" aria-label="Admin sections">
      ${available.map((t) => `<a class="tab" href="#admin/${t.path}"${t.path === tab.path ? ' aria-current="page"' : ''}>${esc(t.title)}</a>`).join('')}
    </nav>` : ''}
    <div id="tabBody"></div>`;

  const body = el.querySelector('#tabBody');
  body.innerHTML = '<p class="muted">Loading…</p>';
  const mod = await tab.load();
  body.innerHTML = '';
  await mod.render(body, ctx);
}
