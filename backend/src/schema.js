// One registry describing every collection in API_CONTRACT.md: its columns, the
// fields that must be unique, and what else points at it. Generic CRUD, request
// coercion and JSON serialisation are all driven from here, and column names only
// ever come from this file — never from the request body.
import { ApiError } from './errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const COLLECTIONS = {
  drivers: {
    idPrefix: 'd',
    writable: true,
    order: 'name ASC',
    fields: {
      empId: 'text', name: 'text', mobile: 'text', licenseNo: 'text', licenseExpiry: 'date',
      joinDate: 'date', status: 'text', otRate: 'num', nid: 'text', address: 'text',
    },
    required: ['empId', 'name', 'licenseNo'],
    unique: [['empId', 'Employee ID'], ['licenseNo', 'Licence number']],
    enums: { status: ['Active', 'On leave', 'Inactive'] },
    refs: [['trips', 'driverId', 'logbook entries'], ['fuel', 'driverId', 'fuel entries'], ['requisitions', 'driverId', 'requisitions'], ['cars', 'driverId', 'cars'], ['leave', 'driverId', 'leave records']],
  },

  cars: {
    idPrefix: 'c',
    writable: true,
    order: '"regNo" ASC',
    fields: {
      regNo: 'text', make: 'text', model: 'text', year: 'int', seats: 'int', fuelType: 'text',
      tankCapacity: 'num', odometer: 'num', ownership: 'text', driverId: 'ref:drivers',
      status: 'text', fitnessExpiry: 'date', taxTokenExpiry: 'date', insuranceExpiry: 'date',
    },
    required: ['regNo', 'fuelType'],
    unique: [['regNo', 'Registration number']],
    enums: {
      fuelType: ['Octane', 'Petrol', 'Diesel', 'CNG'],
      ownership: ['Owned', 'Rented', 'Leased'],
      status: ['Available', 'On trip', 'Maintenance', 'Retired'],
    },
    refs: [['trips', 'carId', 'logbook entries'], ['fuel', 'carId', 'fuel entries'], ['requisitions', 'carId', 'requisitions'], ['cards', 'carId', 'payment cards'], ['maintenance', 'carId', 'workshop records']],
  },

  cards: {
    idPrefix: 'k',
    writable: true,
    order: 'provider ASC, last4 ASC',
    fields: {
      provider: 'text', cardType: 'text', last4: 'text', expiry: 'text', carId: 'ref:cars',
      monthlyLimit: 'num', issuedOn: 'date', status: 'text', notes: 'text',
    },
    required: ['provider', 'cardType', 'last4', 'expiry'],
    enums: {
      cardType: ['Fleet card', 'Bank card', 'Prepaid card'],
      status: ['Active', 'Blocked', 'Closed'],
    },
    refs: [['fuel', 'cardId', 'fuel loads']],
  },

  trips: {
    idPrefix: 't',
    writable: true,
    order: 'date DESC, "startTime" DESC',
    fields: {
      date: 'date', carId: 'ref:cars', driverId: 'ref:drivers', reqId: 'ref:requisitions',
      startTime: 'time', endTime: 'time', startOdo: 'num', endOdo: 'num',
      from: 'text', to: 'text', purpose: 'text',
    },
    required: ['date', 'carId', 'startTime', 'endTime', 'startOdo', 'endOdo'],
    refs: [],
  },

  fuel: {
    idPrefix: 'f',
    writable: true,
    order: 'date DESC, time DESC',
    fields: {
      date: 'date', time: 'time', carId: 'ref:cars', driverId: 'ref:drivers', cardId: 'ref:cards',
      payment: 'text', fuelType: 'text', qty: 'num', unitPrice: 'num', amount: 'num',
      odometer: 'num', station: 'text', receiptNo: 'text',
    },
    required: ['date', 'carId', 'fuelType', 'qty', 'unitPrice'],
    enums: { fuelType: ['Octane', 'Petrol', 'Diesel', 'CNG'] },
    // `payment` and `amount` are derived server-side, never taken from the client.
    derived: ['payment', 'amount'],
    refs: [],
  },

  maintenance: {
    idPrefix: 'm',
    writable: true,
    order: 'date DESC',
    fields: {
      date: 'date', carId: 'ref:cars', kind: 'text', odometer: 'num', workshop: 'text',
      description: 'text', cost: 'num', invoiceNo: 'text',
      nextServiceDate: 'date', nextServiceOdo: 'num', notes: 'text',
    },
    required: ['date', 'carId', 'kind'],
    enums: { kind: ['Service', 'Repair', 'Tyres', 'Battery', 'Bodywork', 'Inspection', 'Other'] },
    refs: [],
  },

  // Driver leave, as periods. See roster.js for the rule this feeds.
  leave: {
    idPrefix: 'l',
    writable: true,
    order: '"startDate" DESC',
    fields: {
      driverId: 'ref:drivers', startDate: 'date', endDate: 'date', kind: 'text', notes: 'text',
    },
    required: ['driverId', 'startDate', 'endDate'],
    enums: { kind: ['Annual', 'Sick', 'Casual', 'Unpaid', 'Training', 'Other'] },
    refs: [],
  },

  // Changed only through the workflow endpoints in routes/requisitions.js.
  requisitions: {
    idPrefix: 'r',
    writable: false,
    order: '"requiredDate" DESC, "startTime" DESC',
    fields: {
      reqNo: 'text', name: 'text', designation: 'text', email: 'text', requiredDate: 'date',
      startTime: 'time', startPoint: 'text', destination: 'text', reason: 'text', status: 'text',
      createdAt: 'ts', reviewedAt: 'ts', reviewedBy: 'text', driverId: 'ref:drivers',
      carId: 'ref:cars', remarks: 'text',
      cancelledAt: 'ts', cancelledBy: 'text', cancelReason: 'text',
    },
    required: [],
    refs: [['trips', 'reqId', 'logbook entries'], ['outbox', 'reqId', 'emails']],
  },

  outbox: {
    idPrefix: 'e',
    writable: false,
    order: '"sentAt" DESC',
    fields: {
      sentAt: 'ts', channel: 'text', status: 'text', kind: 'text', reqId: 'ref:requisitions',
      to: 'text', cc: 'text', from: 'text', subject: 'text', html: 'text', text: 'text',
      attempts: 'int', error: 'text',
    },
    required: [],
    refs: [],
  },
};

export const collectionNames = Object.keys(COLLECTIONS);

export function spec(name) {
  const s = COLLECTIONS[name];
  if (!s) throw new ApiError(`Unknown collection ${name}`, 404);
  return s;
}

const kindOf = (kind) => (kind.startsWith('ref:') ? 'text' : kind);

/** Column list for SELECT, in contract order, with id first. */
export const columns = (name) => ['id', ...Object.keys(spec(name).fields)];
export const selectList = (name) => columns(name).map((c) => `"${c}"`).join(', ');

/** DB row → API JSON. Nulls become '' for text-ish fields so the shape matches the frontend's. */
export function serialise(name, row) {
  if (!row) return row;
  const { fields } = spec(name);
  const out = { id: row.id };
  for (const [f, kind] of Object.entries(fields)) {
    const v = row[f];
    switch (kindOf(kind)) {
      case 'num': case 'int': out[f] = v === null || v === undefined ? null : Number(v); break;
      case 'ts': out[f] = v ? new Date(v).toISOString() : ''; break;
      default: out[f] = v === null || v === undefined ? '' : v;
    }
  }
  return out;
}

const fail = (label, what) => { throw new ApiError(`${label} is not a valid ${what}`); };

function coerceField(name, field, kind, raw) {
  const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  // Empty text stays empty ('' is how the API reports "not set"); an empty date,
  // time or reference becomes NULL in store.js.
  if (raw === null || raw === undefined || raw === '') return kindOf(kind) === 'text' ? '' : null;
  switch (kindOf(kind)) {
    case 'text': return String(raw).trim();
    case 'date': {
      const v = String(raw).slice(0, 10);
      return DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : fail(label, 'date (YYYY-MM-DD)');
    }
    case 'time': {
      const v = String(raw).trim();
      return TIME_RE.test(v) ? v.slice(0, 5) : fail(label, 'time (HH:MM)');
    }
    case 'num': case 'int': {
      const n = Number(raw);
      if (!Number.isFinite(n)) fail(label, 'number');
      return kindOf(kind) === 'int' ? Math.trunc(n) : n;
    }
    case 'ts': return new Date(raw).toISOString();
    default: return raw;
  }
}

/**
 * Validate and coerce a request body against the registry.
 * mode 'create' applies defaults and checks required fields; 'patch' keeps only what was sent.
 */
export function coerce(name, body, mode = 'create') {
  const s = spec(name);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('Send the record as a JSON object');
  const out = {};
  for (const [field, kind] of Object.entries(s.fields)) {
    if (s.derived?.includes(field)) continue;
    if (!(field in body)) continue;
    out[field] = coerceField(name, field, kind, body[field]);
  }
  if (mode === 'create') {
    for (const field of s.required) {
      if (out[field] === null || out[field] === undefined || out[field] === '') throw new ApiError(`${field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} is required`);
    }
  }
  for (const [field, allowed] of Object.entries(s.enums || {})) {
    if (out[field] != null && out[field] !== '' && !allowed.includes(out[field])) {
      throw new ApiError(`${out[field]} is not a valid ${field.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}. Choose one of: ${allowed.join(', ')}.`);
    }
  }
  return out;
}

/** Collections a given field of this collection points at: used to check references exist. */
export const references = (name) =>
  Object.entries(spec(name).fields)
    .filter(([, kind]) => kind.startsWith('ref:'))
    .map(([field, kind]) => [field, kind.slice(4)]);
