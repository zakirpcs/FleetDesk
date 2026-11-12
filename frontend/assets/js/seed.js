// Demo data generator for the mock data layer. Deterministic, relative to today's date.
import { toISO, addDays, today, weekday, pad } from './utils.js';
import { confirmEmail, rejectEmail } from './email.js';

function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

export const DEFAULT_SETTINGS = {
  orgName: 'Head office',
  teamLeadName: 'AGS Team Lead',
  teamLeadEmail: 'ags.lead@company.local',
  senderEmail: 'fleet-desk@company.local',
  shiftStart: '09:00',
  shiftEnd: '18:00',
  graceMinutes: 15,
  roundingMinutes: 30,
  weekendDays: [5, 6],        // Friday, Saturday
  weekStartDay: 0,            // weeks run Sunday → Saturday
  weekendMultiplier: 1.5,
  holidays: [],               // ISO dates treated like weekend days for overtime
  fuelPrices: { Octane: 122, Petrol: 118, Diesel: 102, CNG: 43 },
  // Mail server. Empty means "use whatever the environment was started with".
  // The password is never part of this document — see db/migrations/004_secrets.sql.
  smtp: { host: '', port: 587, encryption: 'starttls', user: '', fromName: '' },
};

export function seed() {
  const r = rng(20261109);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (a, b) => a + r() * (b - a);
  const round5 = (m) => Math.round(m / 5) * 5;
  const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const T = today();
  const settings = structuredClone(DEFAULT_SETTINGS);

  const drivers = [
    { id: 'd1', empId: 'DRV-101', name: 'Md. Rafiqul Islam', mobile: '01711-234567', licenseNo: 'DK0412345L00012', licenseExpiry: addDays(T, 410), joinDate: '2017-03-12', status: 'Active', otRate: 110, nid: '', address: 'Mirpur-10, Dhaka' },
    { id: 'd2', empId: 'DRV-102', name: 'Abdul Karim', mobile: '01819-552310', licenseNo: 'DK0418872L00034', licenseExpiry: addDays(T, 38), joinDate: '2015-08-01', status: 'Active', otRate: 120, nid: '', address: 'Jatrabari, Dhaka' },
    { id: 'd3', empId: 'DRV-103', name: 'Shahidul Haque', mobile: '01552-910044', licenseNo: 'DK0420018L00121', licenseExpiry: addDays(T, 690), joinDate: '2019-01-20', status: 'Active', otRate: 105, nid: '', address: 'Rampura, Dhaka' },
    { id: 'd4', empId: 'DRV-104', name: 'Jamal Uddin', mobile: '01913-447821', licenseNo: 'DK0409931L00007', licenseExpiry: addDays(T, 220), joinDate: '2012-05-15', status: 'Active', otRate: 130, nid: '', address: 'Badda, Dhaka' },
    { id: 'd5', empId: 'DRV-105', name: 'Monir Hossain', mobile: '01675-300918', licenseNo: 'DK0423306L00088', licenseExpiry: addDays(T, 515), joinDate: '2021-10-03', status: 'Active', otRate: 100, nid: '', address: 'Mohammadpur, Dhaka' },
    { id: 'd6', empId: 'DRV-106', name: 'Sohel Rana', mobile: '01720-118764', licenseNo: 'DK0425510L00140', licenseExpiry: addDays(T, 300), joinDate: '2023-02-11', status: 'Active', otRate: 100, nid: '', address: 'Khilgaon, Dhaka' },
    { id: 'd7', empId: 'DRV-107', name: 'Nurul Amin', mobile: '01866-472205', licenseNo: 'DK0411207L00052', licenseExpiry: addDays(T, -12), joinDate: '2014-07-07', status: 'On leave', otRate: 115, nid: '', address: 'Shyamoli, Dhaka' },
  ];

  const cars = [
    { id: 'c1', regNo: 'DHAKA METRO-GA 27-4581', make: 'Toyota', model: 'Premio', year: 2019, fuelType: 'Octane', tankCapacity: 60, odometer: 0, driverId: 'd1', status: 'Available', ownership: 'Owned', seats: 4, fitnessExpiry: addDays(T, 180), taxTokenExpiry: addDays(T, 95), insuranceExpiry: addDays(T, 140) },
    { id: 'c2', regNo: 'DHAKA METRO-CHA 53-1192', make: 'Toyota', model: 'Noah', year: 2018, fuelType: 'Octane', tankCapacity: 55, odometer: 0, driverId: 'd2', status: 'Available', ownership: 'Owned', seats: 7, fitnessExpiry: addDays(T, 25), taxTokenExpiry: addDays(T, 210), insuranceExpiry: addDays(T, 60) },
    { id: 'c3', regNo: 'DHAKA METRO-CHA 51-8834', make: 'Toyota', model: 'Hiace', year: 2017, fuelType: 'Diesel', tankCapacity: 70, odometer: 0, driverId: 'd3', status: 'Available', ownership: 'Owned', seats: 12, fitnessExpiry: addDays(T, 300), taxTokenExpiry: addDays(T, 18), insuranceExpiry: addDays(T, 200) },
    { id: 'c4', regNo: 'DHAKA METRO-GHA 15-2290', make: 'Mitsubishi', model: 'Pajero Sport', year: 2021, fuelType: 'Diesel', tankCapacity: 68, odometer: 0, driverId: 'd4', status: 'Available', ownership: 'Owned', seats: 6, fitnessExpiry: addDays(T, 400), taxTokenExpiry: addDays(T, 150), insuranceExpiry: addDays(T, 260) },
    { id: 'c5', regNo: 'DHAKA METRO-GA 23-7716', make: 'Toyota', model: 'Axio', year: 2016, fuelType: 'CNG', tankCapacity: 14, odometer: 0, driverId: 'd5', status: 'Available', ownership: 'Rented', seats: 4, fitnessExpiry: addDays(T, 75), taxTokenExpiry: addDays(T, 120), insuranceExpiry: addDays(T, 90) },
    { id: 'c6', regNo: 'DHAKA METRO-GA 31-0457', make: 'Toyota', model: 'Allion', year: 2020, fuelType: 'Octane', tankCapacity: 60, odometer: 48210, driverId: '', status: 'Maintenance', ownership: 'Owned', seats: 4, fitnessExpiry: addDays(T, 230), taxTokenExpiry: addDays(T, 230), insuranceExpiry: addDays(T, 230) },
  ];

  const cards = [
    { id: 'k1', last4: '4417', provider: 'Padma Oil', cardType: 'Fleet card', carId: 'c1', monthlyLimit: 45000, expiry: '2027-08', status: 'Active', issuedOn: '2024-09-01', notes: '' },
    { id: 'k2', last4: '2093', provider: 'Meghna Petroleum', cardType: 'Fleet card', carId: '', monthlyLimit: 90000, expiry: '2027-03', status: 'Active', issuedOn: '2024-04-10', notes: 'Pool card for microbuses' },
    { id: 'k3', last4: '7781', provider: 'Jamuna Oil', cardType: 'Fleet card', carId: 'c4', monthlyLimit: 50000, expiry: '2026-12', status: 'Active', issuedOn: '2023-12-15', notes: '' },
    { id: 'k4', last4: '5520', provider: 'Corporate bank card', cardType: 'Bank card', carId: 'c5', monthlyLimit: 20000, expiry: '2028-01', status: 'Active', issuedOn: '2025-01-05', notes: '' },
    { id: 'k5', last4: '6630', provider: 'Padma Oil', cardType: 'Fleet card', carId: '', monthlyLimit: 30000, expiry: '2026-06', status: 'Blocked', issuedOn: '2023-06-01', notes: 'Reported lost' },
  ];

  const profile = {
    c1: { km: 70, eff: 11, card: 'k1', startOdo: 61240 },
    c2: { km: 58, eff: 9, card: 'k2', startOdo: 98410 },
    c3: { km: 92, eff: 7.5, card: 'k2', startOdo: 143880 },
    c4: { km: 66, eff: 8, card: 'k3', startOdo: 37120 },
    c5: { km: 62, eff: 11.5, card: 'k4', startOdo: 121905 },
  };
  const places = ['Gulshan-1', 'Banani', 'Uttara Sector 7', 'Bashundhara R/A', 'Tejgaon I/A', 'Kawran Bazar', 'Mirpur DOHS', 'Dhanmondi 27', 'Narayanganj', 'Gazipur Chowrasta', 'Shahjalal Airport', 'Savar EPZ', 'Motijheel'];
  const purposes = ['Client visit', 'Data centre visit', 'Staff pick-up and drop', 'Bank deposit', 'Vendor meeting', 'Airport transfer', 'DR site visit', 'Office errands'];
  const stations = ['Tejgaon Filling Station', 'Gulshan Fuel Point', 'Banani Service Station', 'Mohakhali CNG Station', 'Kakoli Filling Station', 'Uttara Highway Filling Station'];
  const settingsPrices = settings.fuelPrices;

  const trips = [], fuel = [];
  let tId = 1, fId = 1;
  const state = {};
  for (const c of cars) if (profile[c.id]) state[c.id] = { odo: profile[c.id].startOdo, since: 0, thresh: c.tankCapacity * profile[c.id].eff * between(0.55, 0.75) };

  for (let off = -95; off <= -1; off++) {
    const date = addDays(T, off);
    const isWeekend = settings.weekendDays.includes(weekday(date));
    for (const c of cars) {
      const p = profile[c.id];
      if (!p) continue;
      if (r() > (isWeekend ? 0.14 : 0.9)) continue;
      let driverId = c.driverId;
      if (r() < 0.1) driverId = 'd6';
      if (driverId === 'd7') driverId = 'd6';
      const start = round5(8 * 60 + between(-20, 80));
      const end = round5((c.id === 'c4' ? 18 * 60 + 30 : 17 * 60 + 20) + between(-30, 230));
      const km = Math.max(12, Math.round(p.km * between(0.55, 1.45)));
      const st = state[c.id];
      const to = pick(places);
      trips.push({
        id: 't' + tId++, date, carId: c.id, driverId,
        startTime: hhmm(start), endTime: hhmm(end),
        startOdo: st.odo, endOdo: st.odo + km,
        from: settings.orgName, to, purpose: pick(purposes), reqId: '',
      });
      st.odo += km; st.since += km;
      if (st.since >= st.thresh) {
        const qty = Math.min(c.tankCapacity, (st.since / p.eff) * between(0.95, 1.07));
        const roll = r();
        const cardId = roll < 0.05 ? '' : roll < 0.18 ? pick(['k1', 'k2', 'k3', 'k4']) : p.card;
        const unitPrice = settingsPrices[c.fuelType];
        const q = Math.round(qty * 100) / 100;
        fuel.push({
          id: 'f' + fId++, date, time: hhmm(round5(between(10 * 60, 19 * 60))), carId: c.id, driverId,
          cardId, payment: cardId ? 'Card' : 'Cash', fuelType: c.fuelType,
          qty: q, unitPrice, amount: Math.round(q * unitPrice * 100) / 100,
          odometer: st.odo, station: pick(stations), receiptNo: 'R' + Math.floor(between(100000, 999999)),
        });
        st.since = 0; st.thresh = c.tankCapacity * p.eff * between(0.55, 0.75);
      }
    }
  }
  for (const c of cars) if (state[c.id]) c.odometer = state[c.id].odo;

  // ---- Workshop history ----
  // A service every few thousand km, plus the odd repair, so each car has a history
  // and one or two are due again soon.
  const workshops = ['Navana Toyota, Tejgaon', 'Rangs Workshop, Tejgaon', 'Uttara Motors Service Centre', 'Asian Auto Care, Mohakhali', 'Executive Motors, Banani'];
  const serviceJobs = ['Engine oil and filter', 'Full service: oil, filters, brake fluid', 'Brake pads and discs', 'Wheel alignment and balancing', 'Air-conditioner service', 'Suspension check and bush replacement'];
  const repairJobs = ['Alternator replaced', 'Radiator leak repaired', 'Starter motor replaced', 'Windscreen replaced', 'Clutch plate replaced'];
  const maintenance = [];
  let mId = 1;
  for (const c of cars) {
    const st = state[c.id];
    if (!st) continue;
    const interval = 3000 + Math.round(between(0, 1200) / 100) * 100;      // km between services
    // Walk back from the last service, which is recent enough that the next one is
    // either due soon or not far off — the spread the dashboard warns about.
    let odo = st.odo - Math.round(between(200, interval));
    while (odo > profile[c.id].startOdo) {
      const ago = Math.max(1, Math.round(((st.odo - odo) / profile[c.id].km) * 1.1));
      const date = addDays(T, -Math.min(94, ago));
      maintenance.push({
        id: 'm' + mId++, date, carId: c.id, kind: 'Service',
        odometer: Math.round(odo), workshop: pick(workshops), description: pick(serviceJobs),
        cost: Math.round(between(4500, 16000) / 50) * 50, invoiceNo: 'INV-' + Math.floor(between(10000, 99999)),
        nextServiceDate: '', nextServiceOdo: Math.round(odo + interval), notes: '',
      });
      odo -= interval;
    }
    if (r() < 0.55) {
      maintenance.push({
        id: 'm' + mId++, date: addDays(T, -Math.round(between(5, 80))), carId: c.id, kind: pick(['Repair', 'Tyres', 'Battery']),
        odometer: Math.round(st.odo - between(200, 3000)), workshop: pick(workshops), description: pick(repairJobs),
        cost: Math.round(between(3000, 42000) / 50) * 50, invoiceNo: 'INV-' + Math.floor(between(10000, 99999)),
        nextServiceDate: '', nextServiceOdo: null, notes: '',
      });
    }
  }
  // The car in the workshop today has an open job against it.
  const inShop = cars.find((c) => c.status === 'Maintenance');
  if (inShop) {
    maintenance.push({
      id: 'm' + mId++, date: addDays(T, -3), carId: inShop.id, kind: 'Repair',
      odometer: inShop.odometer, workshop: 'Rangs Workshop, Tejgaon',
      description: 'Gearbox overhaul — car off the road', cost: 68500, invoiceNo: '',
      nextServiceDate: '', nextServiceOdo: null, notes: 'Expected back at the end of the week',
    });
  }
  maintenance.sort((a, b) => b.date.localeCompare(a.date));

  // ---- Requisitions ----
  const people = [
    { name: 'Tahmina Akter', designation: 'Senior Executive, HR', email: 'tahmina.akter@company.local' },
    { name: 'Arif Chowdhury', designation: 'Manager, Network', email: 'arif.chowdhury@company.local' },
    { name: 'Nusrat Jahan', designation: 'Senior Software Engineer', email: 'nusrat.jahan@company.local' },
    { name: 'Kamrul Hasan', designation: 'Assistant Manager, Security', email: 'kamrul.hasan@company.local' },
    { name: 'Farhana Rahman', designation: 'Executive, Finance', email: 'farhana.rahman@company.local' },
    { name: 'Imran Kabir', designation: 'Principal Engineer, Database', email: 'imran.kabir@company.local' },
  ];
  const reasons = ['Client meeting for card switch go-live', 'DR site quarterly drill', 'Bank audit walkthrough', 'Hardware delivery to data centre', 'Interview panel at partner office', 'Visa Bureau review meeting', 'Pick up visiting consultant from airport'];
  const plan = [
    [-26, 'Approved'], [-22, 'Approved'], [-19, 'Rejected'], [-16, 'Approved'], [-13, 'Approved'], [-10, 'Cancelled'],
    [-8, 'Approved'], [-6, 'Approved'], [-3, 'Approved'], [-2, 'Rejected'], [-1, 'Approved'],
    [1, 'Approved'], [1, 'Pending'], [2, 'Pending'], [3, 'Pending'], [5, 'Pending'],
  ];
  const requisitions = [], outbox = [], seq = {};
  const dById = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const cById = Object.fromEntries(cars.map((c) => [c.id, c]));
  plan.forEach(([off, status], i) => {
    const who = i % 4 === 0 ? people[0] : pick(people);
    const requiredDate = addDays(T, off);
    const created = new Date(); created.setDate(created.getDate() + Math.min(off, 1) - 1 - Math.floor(r() * 2)); created.setHours(9 + Math.floor(r() * 4), Math.floor(r() * 60), 0, 0);
    if (created > new Date()) created.setTime(Date.now() - 3600e3);
    const ym = requiredDate.slice(2, 4) + requiredDate.slice(5, 7);
    const carId = pick(['c1', 'c2', 'c4', 'c5']);
    const req = {
      id: 'r' + (i + 1), reqNo: `CR-${ym}-${(seq[ym] = (seq[ym] || 100) + 1)}`,
      ...who, requiredDate, startTime: hhmm(round5(between(8.5 * 60, 16 * 60))),
      startPoint: pick([settings.orgName, 'Gulshan-2 client office', 'Banani branch']), destination: pick(places), reason: pick(reasons),
      status, createdAt: created.toISOString(), reviewedAt: '', reviewedBy: '', driverId: '', carId: '', remarks: '',
    };
    if (status !== 'Pending' && status !== 'Cancelled') {
      const rv = new Date(Math.min(created.getTime() + 2 * 3600e3, Date.now() - 600e3)); req.reviewedAt = rv.toISOString(); req.reviewedBy = settings.teamLeadName;
    }
    if (status === 'Approved') {
      req.carId = carId; req.driverId = cById[carId].driverId;
      outbox.push({ id: 'e' + (outbox.length + 1), sentAt: req.reviewedAt, status: 'Sent', ...confirmEmail(req, dById[req.driverId], cById[carId], settings) });
    }
    if (status === 'Rejected') {
      req.remarks = 'No car free in that slot; all cars booked for the bank audit.';
      outbox.push({ id: 'e' + (outbox.length + 1), sentAt: req.reviewedAt, status: 'Sent', ...rejectEmail(req, settings) });
    }
    requisitions.push(req);
  });

  return { version: 1, settings, drivers, cars, cards, trips, fuel, maintenance, requisitions, outbox };
}
