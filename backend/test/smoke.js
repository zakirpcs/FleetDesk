// End-to-end smoke test against a running API. Nothing is mocked: it talks to the
// container the same way the browser does.
//
//   docker compose exec backend npm run smoke          # inside the API container
//   API_URL=http://127.0.0.1:8081/api/v1 node test/smoke.js   # from the host
//
// The default suits both: in the container the API answers on 8080, and on the host
// port 8080 is the frontend, which proxies /api/ to it.
//
// Safe to run against the demo database: everything it creates, it deletes.
const BASE = (process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 8080}/api/v1`).replace(/\/$/, '');
const EMPLOYEE_EMAIL = 'tahmina.akter@company.local';
const ACCOUNTS = {
  employee: EMPLOYEE_EMAIL,
  ags: 'habibur.rahman@company.local',
  lead: 'ags.lead@company.local',
};
const PASSWORD = process.env.DEMO_PASSWORD || 'FleetDesk-2026';

// One signed-in session per role, created in signIn() below.
const session = {};

let pass = 0;
const failures = [];
// SMOKE_VERBOSE=1 prints every check, not just the ones that failed.
const verbose = /^(1|true|yes)$/i.test(process.env.SMOKE_VERBOSE || '');
const ok = (name, cond, extra = '') => {
  if (verbose) console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (cond) { pass++; return true; }
  failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
  return false;
};

async function call(method, path, { role = 'lead', body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ?? (session[role] ? { Cookie: session[role] } : {})),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, setCookie: res.headers.getSetCookie?.() || [] };
}

/** Sign in as one of the sample accounts and keep its session cookie. */
async function signIn(role, password = PASSWORD) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ACCOUNTS[role], password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
    session[role] = cookie;
  }
  return { status: res.status, data };
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); };

async function main() {
  console.log(`smoke test → ${BASE}\n`);

  // ---- health, sign-in and identity
  ok('GET /readyz', (await fetch(BASE.replace(/\/api\/v1$/, '') + '/readyz')).ok);
  ok('GET /me without a session → 401', (await call('GET', '/me', { cookie: {} })).status === 401);
  const wrong = await signIn('lead', 'not-the-password');
  ok('wrong password → 401', wrong.status === 401 && !/password/i.test(wrong.data?.message?.split(' ').pop() || ''), `${wrong.status} ${wrong.data?.message}`);
  for (const role of ['employee', 'ags', 'lead']) {
    const { status, data } = await signIn(role);
    ok(`sign in as ${role}`, status === 200 && data?.role === role && session[role], `${status} ${JSON.stringify(data)}`);
  }
  for (const role of ['employee', 'ags', 'lead']) {
    const { data } = await call('GET', '/me', { role });
    ok(`GET /me as ${role}`, data?.role === role, JSON.stringify(data));
  }
  ok('an invented session is refused', (await call('GET', '/me', { cookie: { Cookie: 'fleetdesk_session=made-up-value' } })).status === 401);

  // ---- reads
  const { data: cars } = await call('GET', '/cars');
  const { data: drivers } = await call('GET', '/drivers');
  ok('GET /cars', Array.isArray(cars) && cars.length > 0, `got ${cars?.length}`);
  ok('GET /drivers', Array.isArray(drivers) && drivers.length > 0);
  ok('cars keep the contract shape', cars?.[0] && 'regNo' in cars[0] && 'fitnessExpiry' in cars[0] && typeof cars[0].odometer === 'number');
  ok('dates stay YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(cars?.[0]?.fitnessExpiry || ''), cars?.[0]?.fitnessExpiry);

  // ---- driver CRUD and validation
  // Everything below works on records this run creates, on a date of its own, so two
  // runs in a row never collide over the same car or time slot.
  const stamp = Date.now().toString(36).toUpperCase();
  const bookingDate = addDays(30 + Math.floor(Math.random() * 300));
  const { status: cs, data: driver } = await call('POST', '/drivers', {
    body: { empId: `SMOKE-${stamp}`, name: 'Smoke Test Driver', mobile: '01700-000000', licenseNo: `SMOKE-L-${stamp}`, licenseExpiry: addDays(200), joinDate: '2024-01-01', status: 'Active', otRate: 100, address: 'Dhaka' },
  });
  ok('POST /drivers', cs === 201 && driver?.id, JSON.stringify(driver));
  const { data: dupe, status: ds } = await call('POST', '/drivers', { body: { empId: `SMOKE-${stamp}`, name: 'Clone', licenseNo: `OTHER-${stamp}` } });
  ok('duplicate empId → 409', ds === 409, `${ds} ${dupe?.message}`);
  const { data: patched } = await call('PATCH', `/drivers/${driver.id}`, { body: { otRate: 150 } });
  ok('PATCH /drivers', patched?.otRate === 150, JSON.stringify(patched));
  const { status: badEnum } = await call('PATCH', `/drivers/${driver.id}`, { body: { status: 'Sleeping' } });
  ok('invalid status → 400', badEnum === 400, String(badEnum));
  const { status: agsWrite } = await call('POST', '/drivers', { role: 'employee', body: { empId: 'X', name: 'X', licenseNo: 'X' } });
  ok('employee cannot write drivers → 403', agsWrite === 403, String(agsWrite));

  // ---- logbook rules
  const { status: carStatus, data: car } = await call('POST', '/cars', {
    body: { regNo: `DHAKA METRO-SMOKE ${stamp}`, make: 'Test', model: 'Smoke', year: 2024, seats: 4, fuelType: 'Octane', tankCapacity: 50, odometer: 1000, ownership: 'Owned', status: 'Available', fitnessExpiry: addDays(300), taxTokenExpiry: addDays(300), insuranceExpiry: addDays(300) },
  });
  ok('POST /cars', carStatus === 201 && car?.id, JSON.stringify(car));
  const date = addDays(-400);                      // far enough back to be free
  const trip = { date, carId: car.id, driverId: driver.id, startTime: '09:00', endTime: '17:30', startOdo: 1000, endOdo: 1120, from: 'Head office', to: 'Smoke test', purpose: 'Smoke test' };
  const { status: ts, data: created } = await call('POST', '/trips', { body: trip });
  ok('POST /trips', ts === 201 && created?.id, JSON.stringify(created));
  const { status: clash } = await call('POST', '/trips', { body: { ...trip, startOdo: 1200, endOdo: 1300 } });
  ok('one logbook entry per car per day → 409', clash === 409, String(clash));
  const { status: odo } = await call('POST', '/trips', { body: { ...trip, date: addDays(-401), endOdo: 900 } });
  ok('endOdo < startOdo → 400', odo === 400, String(odo));

  // ---- fuel: derived fields and card status
  const { data: cards } = await call('GET', '/cards');
  const activeCard = cards.find((c) => c.status === 'Active');
  const blocked = cards.find((c) => c.status === 'Blocked');
  const { status: fs, data: load } = await call('POST', '/fuel', {
    body: { date, time: '12:30', carId: car.id, driverId: driver.id, cardId: activeCard?.id || '', fuelType: car.fuelType, qty: 10, unitPrice: 122.5, odometer: 1120, station: 'Smoke station', receiptNo: 'SMOKE1' },
  });
  ok('POST /fuel', fs === 201, JSON.stringify(load));
  ok('amount is derived server-side', load?.amount === 1225, String(load?.amount));
  ok('payment is derived from the card', load?.payment === (activeCard ? 'Card' : 'Cash'), String(load?.payment));
  if (blocked) {
    const { status, data } = await call('POST', '/fuel', { body: { date: addDays(-402), time: '12:30', carId: car.id, cardId: blocked.id, fuelType: car.fuelType, qty: 5, unitPrice: 100, odometer: 1121 } });
    ok('blocked card refused → 400', status === 400 && /blocked/i.test(data?.message || ''), `${status} ${data?.message}`);
  }
  const { status: zero } = await call('POST', '/fuel', { body: { date: addDays(-403), carId: car.id, time: '10:00', fuelType: car.fuelType, qty: 0, unitPrice: 100 } });
  ok('qty 0 → 400', zero === 400, String(zero));

  // ---- requisition workflow
  const { status: rs, data: reqn } = await call('POST', '/requisitions', {
    role: 'employee',
    body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: bookingDate, startTime: '10:00', startPoint: 'Head office', destination: 'Smoke test destination', reason: 'Smoke test' },
  });
  ok('POST /requisitions', rs === 201 && /^CR-\d{4}-\d+$/.test(reqn?.reqNo || ''), JSON.stringify(reqn));
  ok('new request is Pending', reqn?.status === 'Pending');
  const { status: past } = await call('POST', '/requisitions', { role: 'employee', body: { ...reqn, requiredDate: addDays(-2) } });
  ok('past date → 400', past === 400, String(past));

  const { data: mineAsEmployee } = await call('GET', '/requisitions', { role: 'employee' });
  ok('employee sees only their own requests', Array.isArray(mineAsEmployee) && mineAsEmployee.every((r) => r.email.toLowerCase() === EMPLOYEE_EMAIL), `${mineAsEmployee?.length} rows`);
  const { status: cardsForEmployee } = await call('GET', '/cards', { role: 'employee' });
  ok('employee cannot read payment cards → 403', cardsForEmployee === 403, String(cardsForEmployee));

  const { status: agsApprove } = await call('POST', `/requisitions/${reqn.id}/approve`, { role: 'ags', body: { driverId: driver.id, carId: car.id } });
  ok('AGS staff cannot approve → 403', agsApprove === 403, String(agsApprove));
  const { status: noPick, data: noPickBody } = await call('POST', `/requisitions/${reqn.id}/approve`, { body: {} });
  ok('approve without driver/car → 400', noPick === 400, `${noPick} ${noPickBody?.message}`);

  const { status: as, data: approved } = await call('POST', `/requisitions/${reqn.id}/approve`, { body: { driverId: driver.id, carId: car.id, remarks: 'Smoke test approval' } });
  ok('POST /requisitions/:id/approve', as === 200 && approved?.status === 'Approved', JSON.stringify(approved));
  ok('reviewedAt is set', Boolean(approved?.reviewedAt));
  const { data: outbox } = await call('GET', '/outbox');
  const confirmation = outbox.find((m) => m.reqId === reqn.id && m.kind === 'confirmation');
  ok('confirmation email written to the outbox', Boolean(confirmation), JSON.stringify(outbox.slice(0, 1)));
  ok('email carries the driver and car details', confirmation?.html?.includes(car.regNo) && confirmation?.html?.includes('Smoke Test Driver'));
  const { status: again } = await call('POST', `/requisitions/${reqn.id}/approve`, { body: { driverId: driver.id, carId: car.id } });
  ok('approving twice → 409', again === 409, String(again));

  const { data: conflicts } = await call('GET', `/requisitions/conflicts?date=${approved.requiredDate}&startTime=10:30&driverId=${driver.id}&carId=${car.id}`);
  ok('GET /requisitions/conflicts finds the clash', Array.isArray(conflicts) && conflicts.some((c) => c.id === reqn.id), JSON.stringify(conflicts));

  // a second request at the same hour must be refused the same driver and car
  const { data: second } = await call('POST', '/requisitions', { role: 'employee', body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: approved.requiredDate, startTime: '11:00', startPoint: 'Head office', destination: 'Clash test', reason: 'Clash test' } });
  const { status: clashStatus, data: clashBody } = await call('POST', `/requisitions/${second.id}/approve`, { body: { driverId: driver.id, carId: car.id } });
  ok('double booking within 3 hours → 409', clashStatus === 409, `${clashStatus} ${clashBody?.message}`);
  const { status: noReason } = await call('POST', `/requisitions/${second.id}/reject`, { body: { remarks: '' } });
  ok('reject without a reason → 400', noReason === 400, String(noReason));
  const { status: rejected, data: rejBody } = await call('POST', `/requisitions/${second.id}/reject`, { body: { remarks: 'Smoke test rejection' } });
  ok('POST /requisitions/:id/reject', rejected === 200 && rejBody?.status === 'Rejected', JSON.stringify(rejBody));

  const { data: third } = await call('POST', '/requisitions', { role: 'employee', body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: bookingDate, startTime: '17:00', startPoint: 'Head office', destination: 'Cancel test', reason: 'Cancel test' } });
  const { status: cancelled, data: cancelBody } = await call('POST', `/requisitions/${third.id}/cancel`, { role: 'employee' });
  ok('POST /requisitions/:id/cancel', cancelled === 200 && cancelBody?.status === 'Cancelled', JSON.stringify(cancelBody));
  ok('cancelling twice → 409', (await call('POST', `/requisitions/${third.id}/cancel`, { role: 'employee' })).status === 409);

  // ---- a requester calling off a trip that was already approved
  const { data: booked } = await call('POST', '/requisitions', { role: 'employee', body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: bookingDate, startTime: '18:00', startPoint: 'Head office', destination: 'Self-cancel test', reason: 'Self-cancel test' } });
  const { status: bookedOk } = await call('POST', `/requisitions/${booked.id}/approve`, { body: { driverId: driver.id, carId: car.id } });
  ok('a second trip is approved for the self-cancel test', bookedOk === 200, String(bookedOk));
  const cancelNoReason = await call('POST', `/requisitions/${booked.id}/cancel`, { role: 'employee', body: {} });
  ok('cancelling an approved trip needs a reason → 400', cancelNoReason.status === 400, `${cancelNoReason.status} ${cancelNoReason.data?.message}`);
  // AGS run the desk, so they can call a booked trip off too.
  const byStaff = await call('POST', `/requisitions/${booked.id}/cancel`, { role: 'ags', body: { reason: 'Caller said the car is no longer needed' } });
  ok('AGS staff can cancel a booked trip', byStaff.status === 200 && byStaff.data?.status === 'Cancelled', `${byStaff.status} ${byStaff.data?.message}`);

  // The point of the feature: the requester calling off their own booked trip.
  const { data: own } = await call('POST', '/requisitions', { role: 'employee', body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: bookingDate, startTime: '18:00', startPoint: 'Head office', destination: 'Owner cancel test', reason: 'Owner cancel test' } });
  const { status: ownApproved } = await call('POST', `/requisitions/${own.id}/approve`, { body: { driverId: driver.id, carId: car.id } });
  ok('that trip is approved', ownApproved === 200, String(ownApproved));
  const byOwner = await call('POST', `/requisitions/${own.id}/cancel`, { role: 'employee', body: { reason: 'Meeting moved to next week' } });
  ok('the requester can cancel their own booked trip', byOwner.status === 200 && byOwner.data?.status === 'Cancelled', `${byOwner.status} ${byOwner.data?.message}`);

  const { data: afterCancel } = await call('GET', `/requisitions/${own.id}`, { role: 'employee' });
  ok('the cancellation is recorded', afterCancel?.cancelReason === 'Meeting moved to next week' && afterCancel.cancelledAt && afterCancel.cancelledBy,
    JSON.stringify({ by: afterCancel?.cancelledBy, why: afterCancel?.cancelReason }));
  const { data: outboxAfter } = await call('GET', '/outbox');
  const notice = outboxAfter.find((m) => m.reqId === own.id && m.kind === 'cancellation');
  ok('AGS is emailed about it', notice?.to === 'ags.lead@company.local' && notice.html.includes('Meeting moved to next week'), JSON.stringify(notice?.subject));
  const { data: freed } = await call('GET', `/requisitions/conflicts?date=${bookingDate}&startTime=18:00&driverId=${driver.id}&carId=${car.id}`);
  ok('the car and driver are free again', Array.isArray(freed) && freed.length === 0, JSON.stringify(freed.map((x) => x.reqNo)));

  // Somebody else's request stays off limits.
  const { data: everyRequest } = await call('GET', '/requisitions');
  const stranger = everyRequest.find((r) => r.email.toLowerCase() !== EMPLOYEE_EMAIL && ['Pending', 'Approved'].includes(r.status));
  if (stranger) {
    const forbidden = await call('POST', `/requisitions/${stranger.id}/cancel`, { role: 'employee', body: { reason: 'not mine to cancel' } });
    ok('cancelling someone else\'s request → 403', forbidden.status === 403, `${forbidden.status} ${forbidden.data?.message}`);
  }

  const startedToday = await call('POST', '/requisitions', { role: 'employee', body: { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: EMPLOYEE_EMAIL, requiredDate: today(), startTime: '00:01', startPoint: 'Head office', destination: 'Already started', reason: 'Already started' } });
  if (startedToday.status === 201) {
    await call('POST', `/requisitions/${startedToday.data.id}/approve`, { body: { driverId: driver.id, carId: car.id } });
    const late = await call('POST', `/requisitions/${startedToday.data.id}/cancel`, { role: 'employee', body: { reason: 'too late' } });
    ok('a trip that has already started → 409', late.status === 409, `${late.status} ${late.data?.message}`);
  }

  // ---- settings
  const { data: settings } = await call('GET', '/settings');
  ok('GET /settings', settings?.shiftStart && Array.isArray(settings.weekendDays), JSON.stringify(settings));
  const { status: agsSettings } = await call('PUT', '/settings', { role: 'ags', body: settings });
  ok('AGS staff cannot change settings → 403', agsSettings === 403, String(agsSettings));
  const { status: badShift } = await call('PUT', '/settings', { body: { ...settings, shiftEnd: settings.shiftStart } });
  ok('shift must end after it starts → 400', badShift === 400, String(badShift));
  const { data: saved } = await call('PUT', '/settings', { body: { ...settings, graceMinutes: 20 } });
  ok('PUT /settings', saved?.graceMinutes === 20, JSON.stringify(saved?.graceMinutes));
  await call('PUT', '/settings', { body: settings });   // put it back

  // ---- reports
  const month = today().slice(0, 7);
  for (const [name, path] of [
    ['running-km', `/reports/running-km?period=month`],
    ['fuel-consumption', `/reports/fuel-consumption?month=${month}`],
    ['overtime', `/reports/overtime?month=${month}`],
    ['card-usage', '/reports/card-usage'],
  ]) {
    const { status, data } = await call('GET', path);
    ok(`GET /reports/${name}`, status === 200 && Array.isArray(data), `${status} ${JSON.stringify(data).slice(0, 120)}`);
  }
  const { status: employeeReport } = await call('GET', '/reports/overtime?month=' + month, { role: 'employee' });
  ok('employee cannot read reports → 403', employeeReport === 403, String(employeeReport));

  // ---- accounts
  const { data: people } = await call('GET', '/users');
  ok('GET /users', Array.isArray(people) && people.length >= 3, `${people?.length} accounts`);
  ok('password hashes never leave the server', !JSON.stringify(people).toLowerCase().includes('scrypt'));
  ok('AGS staff cannot list accounts → 403', (await call('GET', '/users', { role: 'ags' })).status === 403);

  const newEmail = `smoke.${stamp.toLowerCase()}@company.local`;
  const { status: madeStatus, data: made } = await call('POST', '/users', { body: { name: 'Smoke Account', email: newEmail, designation: 'Tester', role: 'employee' } });
  ok('POST /users creates an account', madeStatus === 201 && made?.temporaryPassword, JSON.stringify({ ...made, temporaryPassword: Boolean(made?.temporaryPassword) }));
  ok('the new account must change its password', made?.mustChangePassword === true);
  ok('duplicate email → 409', (await call('POST', '/users', { body: { name: 'Clone', email: newEmail } })).status === 409);

  const tempLogin = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail, password: made.temporaryPassword }) });
  const tempCookie = (tempLogin.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  ok('the one-time password signs in', tempLogin.ok && tempCookie, String(tempLogin.status));
  const locked = await call('GET', '/requisitions', { cookie: { Cookie: tempCookie } });
  ok('a temporary password unlocks nothing else → 403', locked.status === 403 && locked.data?.details?.mustChangePassword, `${locked.status} ${locked.data?.message}`);
  const weak = await call('POST', '/auth/password', { cookie: { Cookie: tempCookie }, body: { currentPassword: made.temporaryPassword, newPassword: 'password123' } });
  ok('a weak new password is refused → 400', weak.status === 400, `${weak.status} ${weak.data?.message}`);
  const changed = await call('POST', '/auth/password', { cookie: { Cookie: tempCookie }, body: { currentPassword: made.temporaryPassword, newPassword: 'quartz-meadow-7781' } });
  ok('changing the password works', changed.status === 200, `${changed.status} ${changed.data?.message}`);
  ok('and then the account works normally', (await call('GET', '/requisitions', { cookie: { Cookie: tempCookie } })).status === 200);
  ok('the old password no longer works', (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail, password: made.temporaryPassword }) })).status) === 401);

  const { status: disabled } = await call('PATCH', `/users/${made.id}`, { body: { status: 'Disabled' } });
  ok('an account can be disabled', disabled === 200);
  ok('a disabled account loses its session → 401', (await call('GET', '/me', { cookie: { Cookie: tempCookie } })).status === 401);
  ok('a disabled account cannot sign in → 403', (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail, password: 'quartz-meadow-7781' }) })).status) === 403);
  ok('the last team lead is protected', (await call('PATCH', `/users/${people.find((u) => u.role === 'lead').id}`, { body: { role: 'employee' } })).status === 409);
  ok('DELETE /users/:id', (await call('DELETE', `/users/${made.id}`)).status === 204);

  // ---- referential integrity, then clean up
  const { status: refused, data: refusedBody } = await call('DELETE', `/drivers/${driver.id}`);
  ok('deleting a driver in use → 409', refused === 409 && /Cannot delete/.test(refusedBody?.message || ''), `${refused} ${refusedBody?.message}`);
  ok('DELETE /fuel/:id', (await call('DELETE', `/fuel/${load.id}`)).status === 204);
  ok('DELETE /trips/:id', (await call('DELETE', `/trips/${created.id}`)).status === 204);
  const { status: stillUsed, data: stillUsedBody } = await call('DELETE', `/drivers/${driver.id}`);
  ok('driver still used by a requisition → 409', stillUsed === 409, `${stillUsed} ${stillUsedBody?.message}`);
  ok('car still used by a requisition → 409', (await call('DELETE', `/cars/${car.id}`)).status === 409);
  ok('GET /unknown → 404', (await call('GET', '/unicorns')).status === 404);
  ok('POST /auth/logout', (await call('POST', '/auth/logout', { role: 'ags' })).status === 204);

  console.log(`${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailed:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
  console.log(`\nLeft behind for inspection: driver ${driver.id} and car ${car.id}, kept by requisition ${reqn.reqNo} — reload the sample data to clear them.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
