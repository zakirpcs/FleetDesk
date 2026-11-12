// Sending SMS through whatever gateway the fleet has an account with.
//
// Gateways differ in the details and agree on the shape: an HTTP request carrying a
// number, a message and some credentials. So rather than writing an adapter per
// vendor, the request itself is configuration — URL, method, headers and body are
// templates, and Fleet Desk fills in the placeholders:
//
//   {to}      the driver's number, formatted as the gateway wants it
//   {text}    the message
//   {sender}  the sender ID on the account
//   {apiKey}  the secret, kept out of the settings document
//
// Anything a gateway's documentation shows as a URL or a JSON body can be pasted in.
import { config } from './config.js';
import { ApiError } from './errors.js';
import { getSettings, smsApiKey } from './settings.js';

export const NUMBER_FORMATS = ['as-is', 'digits', 'country'];

/**
 * Put a number in the shape the gateway expects. Numbers are typed the way people
 * write them here — "01711-234567" — and most gateways want digits, often with the
 * country code.
 */
export function formatNumber(raw, how = 'digits', countryCode = '880') {
  const digits = String(raw || '').replace(/\D/g, '');
  if (how === 'as-is') return String(raw || '').trim();
  if (how !== 'country') return digits;
  if (!digits) return '';
  if (digits.startsWith(countryCode)) return digits;
  return countryCode + digits.replace(/^0+/, '');
}

/** The gateway in force: the Settings page once a URL is saved there, else the environment. */
export async function resolveSms() {
  const saved = (await getSettings()).sms || {};
  if (saved.url) {
    return {
      source: 'settings',
      url: saved.url,
      method: (saved.method || 'GET').toUpperCase(),
      headers: saved.headers || '',
      body: saved.body || '',
      sender: saved.sender || '',
      numberFormat: saved.numberFormat || 'digits',
      countryCode: saved.countryCode || '880',
      successText: saved.successText || '',
      apiKey: await smsApiKey(),
      enabled: saved.enabled !== false,
    };
  }
  return {
    source: config.sms.url ? 'environment' : 'none',
    url: config.sms.url,
    method: (config.sms.method || 'GET').toUpperCase(),
    headers: config.sms.headers,
    body: config.sms.body,
    sender: config.sms.sender,
    numberFormat: config.sms.numberFormat,
    countryCode: config.sms.countryCode,
    successText: config.sms.successText,
    apiKey: config.sms.apiKey,
    enabled: Boolean(config.sms.url),
  };
}

const fill = (template, values) =>
  String(template || '').replace(/\{(to|text|sender|apiKey)\}/g, (_, key) => values[key] ?? '');

/**
 * A value dropped into a template has to arrive as data, not as more syntax: a
 * destination written as 7 Gulshan "Pink City" must not break the JSON, and a
 * message with an & in it must not split a form field in two.
 */
const ESCAPE = {
  json: (v) => JSON.stringify(String(v)).slice(1, -1),
  xml: (v) => String(v).replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[c]};`),
  form: (v) => encodeURIComponent(String(v)),
};
/** What the body looks like, going by its first character — that is all a template gives us. */
const bodyShape = (raw) => {
  const t = String(raw || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (t.startsWith('<')) return 'xml';
  return 'form';
};
const CONTENT_TYPE = { json: 'application/json', xml: 'text/xml', form: 'application/x-www-form-urlencoded' };
const escapeAll = (values, how) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, ESCAPE[how](v)]));

/** Header lines, one per line: `Name: value`. */
function parseHeaders(raw, values) {
  const out = {};
  for (const line of String(raw || '').split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = fill(line.slice(i + 1).trim(), values);
  }
  return out;
}

/** What would be sent, without sending it — used by the test button and the tests. */
export function buildRequest(gateway, to, text) {
  const values = {
    to: formatNumber(to, gateway.numberFormat, gateway.countryCode),
    text,
    sender: gateway.sender || '',
    apiKey: gateway.apiKey || '',
  };
  const url = fill(gateway.url, { ...values, to: encodeURIComponent(values.to), text: encodeURIComponent(values.text) });
  const headers = parseHeaders(gateway.headers, values);
  const shape = bodyShape(gateway.body);
  const body = gateway.method === 'GET' || !String(gateway.body || '').trim()
    ? undefined
    : fill(gateway.body, escapeAll(values, shape));
  // Providers rarely say which content type they want, and the wrong one is rejected
  // with an unhelpful error, so it is taken from the body the fleet pasted in.
  if (body && !headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = CONTENT_TYPE[shape];
  return { url, method: gateway.method, headers, body, number: values.to };
}

/**
 * Send one message. Returns what the gateway said either way: its own words are the
 * only useful thing when a message does not arrive.
 */
export async function sendSms(to, text, gateway) {
  const gw = gateway || await resolveSms();
  if (!gw.url) throw new ApiError('No SMS gateway has been set up yet. Settings → SMS gateway.', 400);
  if (!gw.enabled) throw new ApiError('SMS sending is switched off in settings.', 400);
  const req = buildRequest(gw, to, text);
  if (!req.number) throw new ApiError('That mobile number does not look like a number.', 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.sms.timeoutMs);
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: controller.signal });
    const answer = (await res.text().catch(() => '')).slice(0, 500);
    // Most gateways answer 200 whatever happens, so an expected word can be required.
    const wordOk = !gw.successText || answer.toLowerCase().includes(gw.successText.toLowerCase());
    const host = new URL(req.url).host;
    if (!res.ok) throw new ApiError(`${host} refused it — ${res.status} ${answer || 'no response body'}`.trim(), 400);
    if (!wordOk) {
      throw new ApiError(`${host} answered ${res.status} but without "${gw.successText}" — ${answer || 'no response body'}`, 400);
    }
    return { ok: true, to: req.number, response: answer || `${res.status} ${res.statusText}` };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Node's fetch says only "fetch failed"; the cause underneath says why.
    const why = [e.message, e.cause?.message].filter(Boolean).join(': ');
    throw new ApiError(e.name === 'AbortError' ? `${new URL(req.url).host} did not answer in time` : `Could not reach the gateway — ${why}`, 400);
  } finally {
    clearTimeout(timer);
  }
}
