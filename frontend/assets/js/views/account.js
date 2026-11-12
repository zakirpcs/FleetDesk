// My account — your details, your password, and the devices you are signed in on.
import { api, CONFIG } from '../api.js';
import { refreshIdentity, passwordChanged } from '../app.js';
import { esc, fmtDateTime } from '../utils.js';
import { fieldHtml, readForm, checkForm, toast, pill, confirmDialog } from '../ui.js';

const ROLE_NAME = { employee: 'Employee', ags: 'AGS staff', lead: 'AGS team lead' };
const ROLE_CAN = {
  employee: 'Request a car, and follow your own requests.',
  ags: 'Everything in inventory, the daily logbook, fuel and reports. You can see car requests but not approve them.',
  lead: 'Everything AGS staff can do, plus approving requests, settings, and managing accounts.',
};

export async function render(el, ctx) {
  const u = ctx.user;
  const canEdit = !CONFIG.USE_MOCK;
  const mustChange = ctx.mustChangePassword;

  el.innerHTML = `
    <div class="callout warn" id="forceNote" hidden style="margin-bottom:16px">
      <b>Choose a new password to carry on.</b> You are signed in with a temporary password, so the rest of Fleet Desk is locked until you replace it.
    </div>
    <div class="grid grid-2" style="align-items:start">
      <section class="panel">
        <div class="panel-head"><h2>Your details</h2></div>
        <div class="panel-body">
          <dl class="facts" style="margin-bottom:16px">
            <dt>Email</dt><dd>${esc(u.email)}</dd>
            <dt>Role</dt><dd>${pill(ROLE_NAME[ctx.role] || ctx.role)}</dd>
            <dt>What you can do</dt><dd class="muted" style="font-weight:400">${esc(ROLE_CAN[ctx.role] || '')}</dd>
          </dl>
          <form class="form-grid" id="profileForm" novalidate style="grid-template-columns:1fr">
            ${fieldHtml({ name: 'name', label: 'Name', required: true, maxlength: 80, hint: 'Used on the car requests you submit.' }, u.name)}
            ${fieldHtml({ name: 'designation', label: 'Designation', maxlength: 80 }, u.designation)}
            ${fieldHtml({ name: 'mobile', label: 'Mobile', maxlength: 40, hint: 'So AGS can reach you about a trip.' }, u.mobile || '')}
          </form>
          <div class="callout bad mt" id="profileErr" hidden></div>
          <div class="toolbar mt" style="margin-bottom:0">
            <button class="btn btn-primary" id="saveProfile" type="button"${canEdit ? '' : ' disabled'}>Save details</button>
          </div>
          ${canEdit ? '' : '<p class="muted mt" style="margin-bottom:0;font-size:13.5px">Account details need the backend connected.</p>'}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Password</h2></div>
        <div class="panel-body">
          <form class="form-grid" id="passwordForm" novalidate style="grid-template-columns:1fr">
            ${fieldHtml({ name: 'currentPassword', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' })}
            ${fieldHtml({ name: 'newPassword', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 10 characters. Avoid your name or email.' })}
            ${fieldHtml({ name: 'confirmPassword', label: 'Repeat the new password', type: 'password', required: true, autocomplete: 'new-password' })}
          </form>
          <div class="callout bad mt" id="passwordErr" hidden></div>
          <div class="toolbar mt" style="margin-bottom:0">
            <button class="btn btn-primary" id="savePassword" type="button"${canEdit ? '' : ' disabled'}>Change password</button>
          </div>
          <p class="muted mt" style="margin-bottom:0;font-size:13.5px">Changing it signs you out everywhere else.</p>
        </div>
      </section>
    </div>

    <section class="panel mt" id="sessionsPanel"${canEdit ? '' : ' hidden'}>
      <div class="panel-head"><h2>Where you are signed in</h2>
        <button class="btn btn-sm" id="revoke" type="button">Sign out everywhere else</button>
      </div>
      <div class="panel-body" id="sessions"><p class="muted">Loading…</p></div>
    </section>`;

  if (mustChange) el.querySelector('#forceNote').hidden = false;

  // ---- details
  const profileForm = el.querySelector('#profileForm');
  const profileErr = el.querySelector('#profileErr');
  el.querySelector('#saveProfile').onclick = async (e) => {
    profileErr.hidden = true;
    if (!checkForm(profileForm)) return;
    e.target.disabled = true;
    try {
      const saved = await api.saveProfile(readForm(profileForm));
      refreshIdentity({ name: saved.name, designation: saved.designation, mobile: saved.mobile });
      toast('Your details were saved');
    } catch (ex) { profileErr.textContent = ex.message; profileErr.hidden = false; }
    finally { e.target.disabled = false; }
  };

  // ---- password
  const passwordForm = el.querySelector('#passwordForm');
  const passwordErr = el.querySelector('#passwordErr');
  el.querySelector('#savePassword').onclick = async (e) => {
    passwordErr.hidden = true;
    if (!checkForm(passwordForm)) return;
    const v = {
      currentPassword: passwordForm.elements.currentPassword.value,
      newPassword: passwordForm.elements.newPassword.value,
      confirmPassword: passwordForm.elements.confirmPassword.value,
    };
    if (v.newPassword !== v.confirmPassword) {
      passwordErr.textContent = 'The two new passwords are not the same.';
      passwordErr.hidden = false;
      return;
    }
    e.target.disabled = true;
    try {
      await api.changePassword(v.currentPassword, v.newPassword);
      passwordForm.reset();
      passwordChanged();
      el.querySelector('#forceNote').hidden = true;
      toast('Password changed. Other sessions were signed out.');
      loadSessions();
    } catch (ex) { passwordErr.textContent = ex.message; passwordErr.hidden = false; }
    finally { e.target.disabled = false; }
  };

  // ---- sessions
  async function loadSessions() {
    if (!canEdit) return;
    const box = el.querySelector('#sessions');
    try {
      const list = await api.listSessions();
      box.innerHTML = list.length ? `<ul class="plain-list">${list.map((s) => `
        <li>
          <div><b>${esc(deviceOf(s.userAgent))}</b>${s.current ? ' <span class="pill ok">This device</span>' : ''}
            <small class="muted">${esc(s.ip || 'unknown address')}</small></div>
          <span class="muted">last used ${esc(fmtDateTime(s.lastSeenAt))}</span>
        </li>`).join('')}</ul>` : '<p class="muted">No other sessions.</p>';
    } catch (ex) { box.innerHTML = `<p class="muted">Could not load sessions: ${esc(ex.message)}</p>`; }
  }
  el.querySelector('#revoke')?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Sign out everywhere else?', message: 'Every other browser and device signed in as you will have to sign in again.', confirmLabel: 'Sign the others out' }))) return;
    try { await api.revokeOtherSessions(); toast('Other sessions signed out'); loadSessions(); }
    catch (ex) { toast(ex.message, 'bad'); }
  });
  loadSessions();
}

/** A readable name for a browser, from its user agent. */
function deviceOf(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
