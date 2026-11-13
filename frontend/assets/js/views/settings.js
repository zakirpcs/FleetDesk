// Settings — approval contacts, overtime rules, fuel prices.
import { api, CONFIG } from '../api.js';
import { esc, DAY_NAMES } from '../utils.js';
import { fieldHtml, readForm, checkForm, toast } from '../ui.js';

const ENCRYPTION = [
  { value: 'starttls', label: 'STARTTLS — usual for port 587' },
  { value: 'tls', label: 'TLS/SSL — usual for port 465' },
  { value: 'none', label: 'None — only on a trusted internal relay' },
];
const SMS_SOURCE_NOTE = {
  settings: 'Fleet Desk is using the gateway set here.',
  environment: 'Fleet Desk is using the gateway the container was started with. Fill this in to take over.',
  none: 'No SMS gateway is set up yet. Driver texts wait in the message log until one is.',
};
const NUMBER_FORMATS = [
  { value: 'digits', label: 'Digits only — 01711234567' },
  { value: 'country', label: 'With country code — 8801711234567' },
  { value: 'as-is', label: 'Exactly as typed on the driver record' },
];
const SOURCE_NOTE = {
  settings: 'Fleet Desk is using the server set here.',
  environment: 'Fleet Desk is using the server the container was started with. Fill this in to take over.',
  none: 'No mail server is set up yet, so nothing can be sent. Messages wait in the email log until one is.',
};

// The sections of this page, in order. Exported so the search box can offer them.
export const TABS = [
  { id: 'approvals', title: 'Approvals and email' },
  { id: 'overtime', title: 'Overtime rules' },
  { id: 'mail', title: 'Mail server', backend: true },
  { id: 'sms', title: 'SMS gateway', backend: true },
  { id: 'reminders', title: 'Expiry reminders', backend: true },
  { id: 'fuel', title: 'Fuel prices' },
];

export async function render(el, ctx, subPath = '') {
  const s = await api.getSettings();
  const tabs = TABS.filter((t) => !(t.backend && CONFIG.USE_MOCK));
  // One form across every tab: switching tab hides a section rather than redrawing it,
  // so half-finished edits in one section survive a look at another.
  const section = (id, title, note, inner) => `<section class="panel" data-tab="${id}" style="margin-bottom:16px"><div class="panel-head"><h2>${esc(title)}</h2></div><div class="panel-body">${note ? `<p class="muted" style="margin:0 0 14px">${esc(note)}</p>` : ''}${inner}</div></section>`;

  el.innerHTML = `
    <nav class="tabs" id="settingTabs" aria-label="Settings sections">
      ${tabs.map((t) => `<button class="tab" type="button" data-go="${t.id}">${esc(t.title)}</button>`).join('')}
    </nav>
    <form id="sf" novalidate style="max-width:860px">
    ${section('approvals', 'Approvals and email', 'New car requests are emailed to the team lead. Confirmations are sent from the sender address with the team lead in copy.', `<div class="form-grid">
      ${fieldHtml({ name: 'teamLeadName', label: 'Team lead name (email signature)', required: true }, s.teamLeadName)}
      ${fieldHtml({ name: 'teamLeadEmail', label: 'Team lead email', type: 'email', required: true }, s.teamLeadEmail)}
      ${fieldHtml({ name: 'senderEmail', label: 'Send emails from', type: 'email', required: true }, s.senderEmail)}
      ${fieldHtml({ name: 'orgName', label: 'Default start point', required: true, hint: 'Used to prefill logbook entries' }, s.orgName)}
    </div>`)}
    ${section('overtime', 'Overtime rules', 'Overtime is worked out from each driver\'s duty start and end in the daily logbook.', `<div class="form-grid">
      ${fieldHtml({ name: 'shiftStart', label: 'Shift starts', type: 'time', required: true }, s.shiftStart)}
      ${fieldHtml({ name: 'shiftEnd', label: 'Shift ends', type: 'time', required: true }, s.shiftEnd)}
      ${fieldHtml({ name: 'graceMinutes', label: 'Grace period (minutes)', type: 'number', min: 0, max: 120, required: true, hint: 'Extra time below this is not counted' }, s.graceMinutes)}
      ${fieldHtml({ name: 'roundingMinutes', label: 'Round overtime down to (minutes)', type: 'select', options: [1, 15, 30, 60].map((v) => ({ value: v, label: v === 1 ? 'No rounding' : `${v} minutes` })) }, s.roundingMinutes)}
      ${fieldHtml({ name: 'weekendMultiplier', label: 'Weekend and holiday multiplier', type: 'number', min: 1, max: 3, step: 'any', required: true, hint: 'e.g. 1.5 pays time and a half' }, s.weekendMultiplier)}
      ${fieldHtml({ name: 'weekStartDay', label: 'Week starts on', type: 'select', options: DAY_NAMES.map((n, i) => ({ value: i, label: n })), hint: 'For weekly running-km reports' }, s.weekStartDay)}
      <fieldset class="field full" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:14px;margin-bottom:6px">Weekend days</legend>
        <div style="display:flex;flex-wrap:wrap;gap:14px">${DAY_NAMES.map((n, i) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="wd${i}" ${s.weekendDays.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      </fieldset>
      ${fieldHtml({ name: 'holidays', label: 'Public and office holidays', type: 'textarea', full: true, placeholder: '2026-12-16\n2026-12-25', hint: 'One date per line (YYYY-MM-DD). Duty on these dates is paid at the weekend multiplier.' }, (s.holidays || []).join('\n'))}
    </div>`)}
    ${CONFIG.USE_MOCK ? '' : section('mail', 'Mail server (SMTP)', 'How Fleet Desk sends the request, confirmation, rejection and cancellation emails.', `
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
    ${CONFIG.USE_MOCK ? '' : section('sms', 'SMS gateway', 'A text to the driver when a trip is approved or called off — they are on the road, not at a desk.', `
      <div class="callout ${s.sms?.source === 'none' ? 'warn' : ''}" style="margin:0 0 14px">${esc(SMS_SOURCE_NOTE[s.sms?.source] || '')}${s.sms?.source === 'environment' && s.sms?.envUrl ? ` <span class="muted">(${esc(s.sms.envUrl)})</span>` : ''}</div>
      <p class="muted" style="margin:0 0 14px">Fleet Desk has no gateway of its own: it sends whatever HTTP request your provider documents. Paste their address and body in below and put these in place of the values:
        <code>{to}</code> the driver's number, <code>{text}</code> the message, <code>{sender}</code> your sender ID, <code>{apiKey}</code> your key.</p>
      <div class="form-grid">
        ${fieldHtml({ name: 'sms_url', label: 'Gateway address', full: true, maxlength: 500, placeholder: 'https://api.provider.com/sendsms?api_key={apiKey}&to={to}&msg={text}', hint: 'Leave empty to fall back to the container settings.' }, s.sms?.url || '')}
        ${fieldHtml({ name: 'sms_method', label: 'Request', type: 'select', options: [{ value: 'GET', label: 'GET — everything in the address' }, { value: 'POST', label: 'POST — send a body' }] }, s.sms?.method || 'GET')}
        ${fieldHtml({ name: 'sms_sender', label: 'Sender ID', maxlength: 40, placeholder: 'FLEETDESK', hint: 'Masking or short code, if your account has one.' }, s.sms?.sender || '')}
        ${fieldHtml({ name: 'sms_apiKey', label: 'API key', type: 'password', autocomplete: 'new-password', placeholder: s.sms?.hasApiKey ? 'Saved — type to replace it' : '', hint: s.sms?.hasApiKey ? 'Leave blank to keep the saved key. Type a space to clear it.' : 'Stored on the server and never shown again.' })}
        ${fieldHtml({ name: 'sms_numberFormat', label: 'Send numbers as', type: 'select', options: NUMBER_FORMATS }, s.sms?.numberFormat || 'digits')}
        ${fieldHtml({ name: 'sms_countryCode', label: 'Country code', maxlength: 4, inputmode: 'numeric', hint: 'Used by the two digit formats above.' }, s.sms?.countryCode || '880')}
        ${fieldHtml({ name: 'sms_successText', label: 'Counts as sent when the reply contains', maxlength: 80, placeholder: 'e.g. SUCCESS', hint: 'Optional. Some gateways answer 200 OK even when they refuse; leave empty to trust the status code.' }, s.sms?.successText || '')}
        ${fieldHtml({ name: 'sms_headers', label: 'Extra headers', type: 'textarea', full: true, maxlength: 2000, placeholder: 'Authorization: Bearer {apiKey}', hint: 'One per line, as Name: value.' }, s.sms?.headers || '')}
        ${fieldHtml({ name: 'sms_body', label: 'Request body (POST only)', type: 'textarea', full: true, maxlength: 2000, placeholder: '{"api_key":"{apiKey}","to":"{to}","message":"{text}"}', hint: 'JSON or form data — whichever your provider documents. Fleet Desk works out the content type.' }, s.sms?.body || '')}
        <label class="field full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="sms_enabled" ${s.sms?.enabled === false ? '' : 'checked'}> Send driver texts. <span class="muted">Turn off to hold them in the message log without sending.</span></label>
      </div>
      <div class="toolbar mt" style="margin-bottom:0">
        <input class="input" id="smsTestTo" style="max-width:220px" placeholder="01711234567" aria-label="Test number" inputmode="tel">
        <button class="btn" id="smsTest" type="button">Send a test SMS</button>
        <span class="muted">Saves first, then sends one message to that number.</span>
      </div>
      <div class="callout mt" id="smsTestResult" hidden></div>`)}
    ${CONFIG.USE_MOCK ? '' : section('reminders', 'Expiry reminders', 'A standing email about papers and licences that are running out, so a renewal is noticed without anyone opening the dashboard.', `
      <div class="form-grid">
        <label class="field full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="rem_enabled" ${s.reminders?.enabled === false ? '' : 'checked'}> Send the expiry reminder. <span class="muted">Turn off to stop it without losing the settings below.</span></label>
        ${fieldHtml({ name: 'rem_every', label: 'How often', type: 'select', options: [{ value: 'week', label: 'Once a week' }, { value: 'day', label: 'Every day' }] }, s.reminders?.every || 'week')}
        ${fieldHtml({ name: 'rem_weekday', label: 'Day of the week', type: 'select', options: DAY_NAMES.map((n, i) => ({ value: i, label: n })), hint: 'Ignored when it goes out every day.' }, s.reminders?.weekday ?? 0)}
        ${fieldHtml({ name: 'rem_sendAt', label: 'Time of day', type: 'time', required: true }, s.reminders?.sendAt || '08:00')}
        ${fieldHtml({ name: 'rem_days', label: 'Look ahead (days)', type: 'number', min: 1, max: 365, required: true, hint: 'Anything already expired is always listed.' }, s.reminders?.days ?? 30)}
        ${fieldHtml({ name: 'rem_to', label: 'Send to', full: true, maxlength: 400, placeholder: s.teamLeadEmail || '', hint: 'Several addresses, separated by commas. Leave empty for the team lead.' }, s.reminders?.to || '')}
      </div>
      <p class="muted" style="margin:14px 0 0">It covers fitness certificates, tax tokens, insurance and driving licences. A car that is retired, or a driver who is inactive, is left out. Nothing is sent on a day when there is nothing to report.</p>
      <div class="toolbar mt" style="margin-bottom:0">
        <button class="btn" id="remTest" type="button">Send one now</button>
        <span class="muted">Saves first, then sends today's reminder to your own address.</span>
      </div>
      <div class="callout mt" id="remTestResult" hidden></div>`)}
    ${section('fuel', 'Fuel prices', 'Prefilled as the rate when a fuel load is recorded. The rate can still be changed on each load.', `<div class="form-grid">
      ${['Octane', 'Petrol', 'Diesel'].map((f) => fieldHtml({ name: `fp_${f}`, label: `${f} (BDT per litre)`, type: 'number', min: 0, step: 0.01, required: true }, s.fuelPrices[f])).join('')}
      ${fieldHtml({ name: 'fp_CNG', label: 'CNG (BDT per m³)', type: 'number', min: 0, step: 0.01, required: true }, s.fuelPrices.CNG)}
    </div>`)}
    <div class="callout bad" id="err" hidden style="margin-bottom:12px"></div>
    <button class="btn btn-primary" type="submit">Save settings</button>
  </form>`;

  // ---- tabs
  const panels = [...el.querySelectorAll('[data-tab]')];
  const buttons = [...el.querySelectorAll('[data-go]')];
  let active = '';
  function show(id, { remember = true } = {}) {
    active = tabs.some((t) => t.id === id) ? id : tabs[0].id;
    panels.forEach((x) => { x.hidden = x.dataset.tab !== active; });
    buttons.forEach((b) => {
      const on = b.dataset.go === active;
      b.setAttribute('aria-current', on ? 'page' : 'false');
      if (!on) b.removeAttribute('aria-current');
    });
    // Keep the address in step without reloading the page, so a tab can be linked to.
    if (remember) history.replaceState(null, '', `#settings${active === tabs[0].id ? '' : `/${active}`}`);
  }
  el.querySelector('#settingTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) show(b.dataset.go);
  });
  show(subPath, { remember: false });

  const form = el.querySelector('#sf');
  /** A problem in a section you cannot see is no use: open that tab first. */
  const revealProblem = () => {
    const bad = form.querySelector('.field.invalid');
    const panel = bad?.closest('[data-tab]');
    if (panel && panel.dataset.tab !== active) show(panel.dataset.tab);
    bad?.querySelector('input, select, textarea')?.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#err'); err.hidden = true;
    if (!checkForm(form)) return revealProblem();
    const v = readForm(form);
    const holidays = v.holidays.split(/\s+/).filter(Boolean);
    const bad = holidays.find((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h));
    if (bad) { show('overtime'); err.textContent = `"${bad}" is not a date in YYYY-MM-DD format.`; err.hidden = false; return; }
    if (v.shiftEnd <= v.shiftStart) { show('overtime'); err.textContent = 'Shift must end after it starts.'; err.hidden = false; return; }
    const smtp = CONFIG.USE_MOCK ? undefined : {
      host: v.smtp_host, port: Number(v.smtp_port), encryption: v.smtp_encryption,
      user: v.smtp_user, fromName: v.smtp_fromName,
      // Only send a password when one was typed: blank means "keep what is stored".
      ...(v.smtp_password === '' ? {} : { password: v.smtp_password.trim() }),
    };
    const sms = CONFIG.USE_MOCK ? undefined : {
      enabled: Boolean(v.sms_enabled), url: v.sms_url.trim(), method: v.sms_method,
      headers: v.sms_headers, body: v.sms_body, sender: v.sms_sender,
      numberFormat: v.sms_numberFormat, countryCode: v.sms_countryCode, successText: v.sms_successText,
      ...(v.sms_apiKey === '' ? {} : { apiKey: v.sms_apiKey.trim() }),
    };
    const reminders = CONFIG.USE_MOCK ? undefined : {
      enabled: Boolean(v.rem_enabled), every: v.rem_every, weekday: Number(v.rem_weekday),
      sendAt: v.rem_sendAt, days: Number(v.rem_days), to: v.rem_to.trim(),
    };
    await api.saveSettings({
      ...(smtp ? { smtp } : {}),
      ...(sms ? { sms } : {}),
      ...(reminders ? { reminders } : {}),
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
    if (!checkForm(form)) return revealProblem();
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

  // The reminder is a real message, so this both shows what it says and proves it sends.
  el.querySelector('#remTest')?.addEventListener('click', async (e) => {
    const box = el.querySelector('#remTestResult');
    box.hidden = true;
    if (!checkForm(form)) return revealProblem();
    e.target.disabled = true;
    e.target.textContent = 'Sending…';
    try {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 400));
      const out = await api.testReminder();
      const found = [out.expired ? `${out.expired} already expired` : '', out.soon ? `${out.soon} running out within ${out.days} days` : ''].filter(Boolean).join(' and ');
      box.className = 'callout mt';
      box.innerHTML = `Reminder sent to <b>${esc(out.to)}</b> — ${esc(found || 'nothing expiring, so it says so')}. <span class="muted">See it in the message log.</span>`;
    } catch (ex) {
      box.className = 'callout bad mt';
      box.textContent = ex.message;
    } finally {
      box.hidden = false;
      e.target.disabled = false;
      e.target.textContent = 'Send one now';
    }
  });

  // Same idea for SMS, and it reports the request it built — which is what you need
  // when a provider's documentation and its behaviour disagree.
  el.querySelector('#smsTest')?.addEventListener('click', async (e) => {
    const box = el.querySelector('#smsTestResult');
    box.hidden = true;
    const to = el.querySelector('#smsTestTo').value.trim();
    if (!to) { box.className = 'callout bad mt'; box.textContent = 'Enter a mobile number to send the test to.'; box.hidden = false; return; }
    if (!checkForm(form)) return revealProblem();
    e.target.disabled = true;
    e.target.textContent = 'Sending…';
    try {
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 400));
      const out = await api.testSms(to);
      box.className = 'callout mt';
      box.innerHTML = `Test message sent to <b>${esc(out.to)}</b>.<br><small class="muted">${esc(out.request)}</small><br><small class="muted">${esc(out.response)}</small>`;
    } catch (ex) {
      box.className = 'callout bad mt';
      box.textContent = ex.message;
    } finally {
      box.hidden = false;
      e.target.disabled = false;
      e.target.textContent = 'Send a test SMS';
    }
  });
}
