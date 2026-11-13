// Vehicle papers and driving licences: what has to be valid, and on which day.
//
// A trip on the 20th needs papers that are still valid on the 20th, not papers that
// are valid today — so every check here is asked about a particular date. An expiry
// date is the last day the paper counts, so it is valid up to and including that day.
//
// A date that is simply not on file is never treated as expired: nobody is stopped
// over a blank field. The dashboard is where missing and ageing papers get chased.
import { fromISO, fmtDate } from './utils.js';

export const CAR_PAPERS = [
  ['fitnessExpiry', 'Fitness certificate'],
  ['taxTokenExpiry', 'Tax token'],
  ['insuranceExpiry', 'Insurance'],
];
export const DRIVER_PAPERS = [['licenseExpiry', 'Driving licence']];

// Within this many days of the trip, a paper is worth mentioning but does not block.
export const SOON_DAYS = 30;

/** Whole days from one ISO date to another; negative when `to` is in the past. */
export const daysBetween = (from, to) => Math.round((fromISO(to) - fromISO(from)) / 86400000);

/** Every paper on `rec` from `list`, as of `date`, soonest to expire first. */
export function papersOn(rec, list, date) {
  return list
    .filter(([field]) => rec?.[field])
    .map(([field, label]) => ({ field, label, expiry: String(rec[field]).slice(0, 10) }))
    .map((p) => ({ ...p, days: daysBetween(date, p.expiry) }))
    .sort((a, b) => a.days - b.days);
}

/**
 * What stands in the way of this driver and this car taking a trip on `date`, and
 * what is merely worth knowing. `blocked` is papers that have run out by then —
 * the car cannot legally be on the road and the trip must not be booked.
 */
export function tripPapers(driver, car, date) {
  const all = [
    ...papersOn(car, CAR_PAPERS, date).map((p) => ({ ...p, whose: 'car', name: car?.regNo || 'the car' })),
    ...papersOn(driver, DRIVER_PAPERS, date).map((p) => ({ ...p, whose: 'driver', name: driver?.name || 'the driver' })),
  ];
  return {
    blocked: all.filter((p) => p.days < 0),
    soon: all.filter((p) => p.days >= 0 && p.days <= SOON_DAYS),
  };
}

/** One plain sentence about a paper, for an error message or a callout. */
export function paperNote(p, date) {
  const when = fmtDate(p.expiry);
  if (p.days < 0) return `${p.label} for ${p.name} ran out on ${when}, before the trip on ${fmtDate(date)}.`;
  if (p.days === 0) return `${p.label} for ${p.name} runs out on ${when}, the day of the trip itself.`;
  return `${p.label} for ${p.name} runs out on ${when}, ${p.days} day${p.days === 1 ? '' : 's'} after the trip.`;
}

/** The shortest possible label for a dropdown: "fitness expired", "tax token expires in 4 days". */
export function paperTag(p) {
  const what = p.label.toLowerCase().replace(' certificate', '');
  return p.days < 0 ? `${what} expired` : `${what} expires in ${p.days} day${p.days === 1 ? '' : 's'}`;
}

/**
 * Every paper across the fleet that has run out, or will within `days` of `date`,
 * soonest first. Retired cars and inactive drivers are left out: nobody needs
 * chasing about a vehicle that will never be on the road again.
 */
export function expiringSoon(cars, drivers, date, days = SOON_DAYS) {
  const out = [];
  for (const car of cars || []) {
    if (car.status === 'Retired') continue;
    for (const p of papersOn(car, CAR_PAPERS, date)) {
      if (p.days <= days) out.push({ ...p, whose: 'car', name: car.regNo, id: car.id });
    }
  }
  for (const driver of drivers || []) {
    if (driver.status === 'Inactive') continue;
    for (const p of papersOn(driver, DRIVER_PAPERS, date)) {
      if (p.days <= days) out.push({ ...p, whose: 'driver', name: driver.name, id: driver.id });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}
