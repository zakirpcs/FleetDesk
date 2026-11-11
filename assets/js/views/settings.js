// Settings — approval contacts, overtime rules, fuel prices.
import { api, CONFIG } from '../api.js';
import { esc, DAY_NAMES } from '../utils.js';
import { fieldHtml, readForm, checkForm, toast } from '../ui.js';

const ENCRYPTION = [
  { value: 'starttls', label: 'STARTTLS — usual for port 587' },
  { value: 'tls', label: 'TLS/SSL — usual for port 465' },
  { value: 'none', label: 'None — only on a trusted internal relay' },
];
const SOURCE_NOTE = {
  settings: 'Fleet Desk is using the server set here.',
  environment: 'Fleet Desk is using the server the container was started with. Fill this in to take over.',
  none: 'No mail server is set up yet, so nothing can be sent. Messages wait in the email log until one is.',
};

export async function render(el) {
  const s = await api.getSettings();
  const section = (title, note, inner) => `<section class="panel" style="margin-bottom:16px"><div class="panel-head"><h2>${esc(title)}</h2></div><div class="panel-body">${note ? `<p class="muted" style="margin:0 0 14px">${esc(note)}</p>` : ''}${inner}</div></section>`;

  el.innerHTML = `<form id="sf" novalidate style="max-width:860px">
    ${section('Approvals and email', 'New car requests are emailed to the team lead. Confirmations are sent from the sender address with the team lead in copy.', `<div class="form-grid">
      ${fieldHtml({ name: 'teamLeadName', label: 'Team lead name (email signature)', required: true }, s.teamLeadName)}
      ${fieldHtml({ name: 'teamLeadEmail', label: 'Team lead email', type: 'email', required: true }, s.teamLeadEmail)}
      ${fieldHtml({ name: 'senderEmail', label: 'Send emails from', type: 'email', required: true }, s.senderEmail)}
      ${fieldHtml({ name: 'orgName', label: 'Default start point', required: true, hint: 'Used to prefill logbook entries' }, s.orgName)}
    </div>`)}
    ${section('Overtime rules', 'Overtime is worked out from each driver\'s duty start and end in the daily logbook.', `<div class="form-grid">
      ${fieldHtml({ name: 'shiftStart', label: 'Shift starts', type: 'time', required: true }, s.shiftStart)}
      ${fieldHtml({ name: 'shiftEnd', label: 'Shift ends', type: 'time', required: true }, s.shiftEnd)}
      ${fieldHtml({ name: 'graceMinutes', label: 'Grace period (minutes)', type: 'number', min: 0, max: 120, required: true, hint: 'Extra time below this is not counted' }, s.graceMinutes)}
      ${fieldHtml({ name: 'roundingMinutes', label: 'Round overtime down to (minutes)', type: 'select', options: [1, 15, 30, 60].map((v) => ({ value: v, label: v === 1 ? 'No rounding' : `${v} minutes` })) }, s.roundingMinutes)}
      ${fieldHtml({ name: 'weekendMultiplier', label: 'Weekend and holiday multiplier', type: 'number', min: 1, max: 3, step: 0.25, required: true, hint: 'e.g. 1.5 pays time and a half' }, s.weekendMultiplier)}
      ${fieldHtml({ name: 'weekStartDay', label: 'Week starts on', type: 'select', options: DAY_NAMES.map((n, i) => ({ value: i, label: n })), hint: 'For weekly running-km reports' }, s.weekStartDay)}
      <fieldset class="field full" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:14px;margin-bottom:6px">Weekend days</legend>
        <div style="display:flex;flex-wrap:wrap;gap:14px">${DAY_NAMES.map((n, i) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="wd${i}" ${s.weekendDays.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      </fieldset>
      ${fieldHtml({ name: 'holidays', label: 'Public and office holidays', type: 'textarea', full: true, placeholder: '2026-12-16\n2026-12-25', hint: 'One date per line (YYYY-MM-DD). Duty on these dates is paid at the weekend multiplier.' }, (s.holidays || []).join('\n'))}
    </div>`)}
    ${CONFIG.USE_MOCK ? '' : section('Mail server (SMTP)', 'How Fleet Desk sends the request, confirmation, rejection and cancellation emails.', `
      <div class="callout ${s.smtp?.source === 'none' ? 'warn' : ''}" style="margin:0 0 14px">${esc(SOURCE_NOTE[s.smtp?.source] || '')}${s.smtp?.source === 'environment' && s.smtp?.envHost ? ` <span class="muted">(${esc(s.smtp.envHost)})</span>` : ''}</div>
      <div class="form-grid">
        ${fieldHtml({ name: 'smtp_host', label: 'Server address', maxlength: 120, placeholder: 'smtp.company.com', hint: 'Leave empty to fall back to the container settings.' }, s.smtp?.host || '')}
        ${fieldHtml({ name: 'smtp_port', label: 'Port', type: 'number', min: 1, max: 65535 }, s.smtp?.port ?? 587)}
        ${fieldHtml({ name: 'smtp_encryption', label: 'Encryption', type: 'select', options: ENCRYPTION }, s.smtp?.encryption || 'starttls')}
        ${fieldHtml({ name: 'smtp_fromName', label: 'Sender name', maxlength: 80, placeholder: 'Fleet Desk', hint: 'Shown beside the sender address.' }, s.smtp?.fromName || '')}
        ${fieldHtml({ name: 'smtp_user', label: 'Username', maxlength: 120, autocomplete: 'off', hint: 'Leave empty if the relay needs no sign-in.' }, s.smtp?.user || '')}
        ${fieldHtml({ name: 'smtp_password', label: 'Password', type: 'password', autocomplete: 'new-password', placeholder: s.smtp?.hasPassword ? 'Saved — type to replace it' : '', hint: s.smtp?.hasPassword ? 'Leave blank to keep the saved password. Type a space to clear it.' : 'Stored on the server and never shown again.' })}
      </div>
      <div class="toolbar mt" style="margin-bottom:0">
        <button class="btn" id="mailTest" type="button">Send a test email</button>
        <span class="muted" id="mailTestNote">Saves first, then sends to your own address.</span>
      </div>
      <div class="callout mt" id="mailTestResult" hidden></div>`)}
    ${section('Fuel prices', 'Prefilled as the rate when a fuel load is recorded. The rate can still be changed on each load.', `<div class="form-grid">
      ${['Octane', 'Petrol', 'Diesel'].map((f) => fieldHtml({ name: `fp_${f}`, label: `${f} (BDT per litre)`, type: 'number', min: 0, step: 0.01, required: true }, s.fuelPrices[f])).join('')}
      ${fieldHtml({ name: 'fp_CNG', label: 'CNG (BDT per m³)', type: 'number', min: 0, step: 0.01, required: true }, s.fuelPrices.CNG)}
    </div>`)}
    <div class="callout bad" id="err" hidden style="margin-bottom:12px"></div>
    <button class="btn btn-primary" type="submit">Save settings</button>
  </form>`;

  const form = el.querySelector('#sf');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#err'); err.hidden = true;
    if (!checkForm(form)) return;
    const v = readForm(form);
    const holidays = v.holidays.split(/\s+/).filter(Boolean);
    const bad = holidays.find((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h));
    if (bad) { err.textContent = `"${bad}" is not a date in YYYY-MM-DD format.`; err.hidden = false; return; }
    if (v.shiftEnd <= v.shiftStart) { err.textContent = 'Shift must end after it starts.'; err.hidden = false; return; }
    const smtp = CONFIG.USE_MOCK ? undefined : {
      host: v.smtp_host, port: Number(v.smtp_port), encryption: v.smtp_encryption,
      user: v.smtp_user, fromName: v.smtp_fromName,
      // Only send a password when one was typed: blank means "keep what is stored".
      ...(v.smtp_password === '' ? {} : { password: v.smtp_password.trim() }),
    };
    await api.saveSettings({
      ...(smtp ? { smtp } : {}),
      teamLeadName: v.teamLeadName, teamLeadEmail: v.teamLeadEmail, senderEmail: v.senderEmail, orgName: v.orgName,
      shiftStart: v.shiftStart, shiftEnd: v.shiftEnd, graceMinutes: Number(v.graceMinutes), roundingMinutes: Number(v.roundingMinutes),
      weekendMultiplier: Number(v.weekendMultiplier), weekStartDay: Number(v.weekStartDay),
      weekendDays: DAY_NAMES.map((_, i) => i).filter((i) => v[`wd${i}`]), holidays,
      fuelPrices: { Octane: Number(v.fp_Octane), Petrol: Number(v.fp_Petrol), Diesel: Number(v.fp_Diesel), CNG: Number(v.fp_CNG) },
    });
    toast('Settings saved');
  });

  // Save whatever is on screen, then ask the server to prove it can send.
  el.querySelector('#mailTest')?.addEventListener('click', async (e) => {
    const box = el.querySelector('#mailTestResult');
    box.hidden = true;
    if (!checkForm(form)) return;
    e.target.disabled = true;
    e.target.textContent = 'Sending…';
    try {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 400));
      const out = await api.testMail();
      box.className = 'callout mt';
      box.innerHTML = `Test message sent to <b>${esc(out.to)}</b> through ${esc(out.host)}. <span class="muted">${esc(out.response)}</span>`;
    } catch (ex) {
      box.className = 'callout bad mt';
      box.textContent = ex.message;
    } finally {
      box.hidden = false;
      e.target.disabled = false;
      e.target.textContent = 'Send a test email';
    }
  });
}
