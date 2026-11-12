// The sign-in page. Talks to /auth on its own — the app bundle is not loaded until
// somebody is signed in, so a stale session can never keep you out of this screen.
import { esc } from './utils.js';

const API = '/api/v1';
const form = document.getElementById('loginForm');
const errorBox = document.getElementById('error');
const submit = document.getElementById('submit');
const emailField = document.getElementById('email');
const passwordField = document.getElementById('password');

/** Where to go after signing in. Only same-page hashes are honoured. */
function destination() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return /^#[\w-]*$/.test(next) ? `index.html${next}` : 'index.html';
}

const fail = (message) => {
  errorBox.textContent = message;
  errorBox.hidden = false;
};

async function call(path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Sign-in failed (${res.status})`);
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.hidden = true;
  const email = emailField.value.trim();
  const password = passwordField.value;
  if (!email || !password) return fail('Enter your email address and password');

  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    await call('/auth/login', { email, password });
    location.replace(destination());
  } catch (ex) {
    fail(ex.message);
    passwordField.value = '';
    passwordField.focus();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});

// Set the page up: skip it if already signed in, and say so when the company account
// is what signs people in.
try {
  const info = await call('/auth/info');
  if (info.signedIn) location.replace(destination());

  if (info.mode === 'proxy') {
    form.hidden = true;
    document.getElementById('lede').textContent =
      'Fleet Desk uses your company account. Open it from the company portal, or ask IT if you were sent here.';
  } else if (info.demoAccounts?.length) {
    const demo = document.getElementById('demo');
    demo.innerHTML = `
      <p class="login-demo-title">Sample accounts <span class="login-demo-note">demo only — turn <code>SHOW_DEMO_ACCOUNTS</code> off for real use</span></p>
      <ul>${info.demoAccounts.map((a) => `
        <li><button type="button" class="linklike" data-email="${esc(a.email)}">${esc(a.email)}</button><span>${esc(a.role === 'lead' ? 'AGS team lead' : a.role === 'ags' ? 'AGS staff' : 'Employee')}</span></li>`).join('')}</ul>
      <p class="login-demo-pass">Password for all of them: <code>${esc(info.demoPassword)}</code></p>`;
    demo.hidden = false;
    demo.addEventListener('click', (e) => {
      const button = e.target.closest('[data-email]');
      if (!button) return;
      emailField.value = button.dataset.email;
      passwordField.value = info.demoPassword;
      passwordField.focus();
    });
  }
} catch (ex) {
  fail(`Fleet Desk is not reachable right now (${ex.message}).`);
}
