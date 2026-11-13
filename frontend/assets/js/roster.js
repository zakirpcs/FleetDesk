// Who is on the roster on a given day.
//
// A driver's `status` says whether they are on the strength at all. Leave is a
// period, not a flag: this module answers "is this driver available on that date",
// which is a different question from "are they in today" and is the one the approval
// screen has to ask, often about a date weeks away.
export const LEAVE_KINDS = ['Annual', 'Sick', 'Casual', 'Unpaid', 'Training', 'Other'];

/** The leave record covering `date` for this driver, if there is one. */
export const leaveOn = (leave, driverId, date) =>
  (leave || []).find((l) => l.driverId === driverId && l.startDate <= date && date <= l.endDate) || null;

/** Every leave record touching the period, soonest first. */
export const leaveBetween = (leave, from, to) =>
  (leave || []).filter((l) => l.startDate <= to && l.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

/** The next spell of leave starting on or after `date`. */
export const nextLeave = (leave, driverId, date) =>
  (leave || []).filter((l) => l.driverId === driverId && l.endDate >= date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;

/** Two spells for the same driver cannot overlap: one of them is wrong. */
export const clashingLeave = (leave, { id, driverId, startDate, endDate }) =>
  (leave || []).find((l) => l.driverId === driverId && l.id !== id
    && l.startDate <= endDate && l.endDate >= startDate) || null;

/**
 * Can this driver take a trip on `date`? Returns null when they can, or why not —
 * the wording is used in the approval error and in the dropdown alike.
 */
export function driverUnavailable(driver, leave, date) {
  if (!driver) return null;
  if (driver.status !== 'Active') return { why: 'status', text: `${driver.name} is ${driver.status.toLowerCase()}` };
  const away = leaveOn(leave, driver.id, date);
  if (away) return { why: 'leave', leave: away, text: `${driver.name} is on ${away.kind.toLowerCase()} leave then` };
  return null;
}

/** Whole days in a spell, both ends counted. */
export const leaveDays = (l) =>
  Math.round((Date.parse(`${l.endDate}T00:00:00`) - Date.parse(`${l.startDate}T00:00:00`)) / 86400000) + 1;
