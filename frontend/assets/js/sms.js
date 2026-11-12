// Text messages to drivers. Short on purpose: one SMS is 160 characters, and a
// driver reads this on a cheap phone, standing in a car park.
//
// The backend renders these with the same module, so what the approval screen shows
// as a preview is exactly what is sent.
import { fmtDate, fmtTime } from './utils.js';

const plateOf = (car) => (car?.regNo ? String(car.regNo).slice(-7) : 'car TBC');

/** Sent to the driver when the team lead assigns them a trip. */
export function driverTripSms(req, driver, car, settings = {}) {
  return [
    `${settings.orgName || 'AGS'}: trip ${req.reqNo}`,
    `${fmtDate(req.requiredDate)} ${fmtTime(req.startTime)}`,
    `Car ${plateOf(car)}`,
    `Pick up ${req.name} at ${req.startPoint}`,
    `Go to ${req.destination}`,
  ].join('. ') + '.';
}

/** Sent to the driver when a trip they were given is called off. */
export function driverCancelSms(req, driver, car, settings = {}) {
  return `${settings.orgName || 'AGS'}: trip ${req.reqNo} on ${fmtDate(req.requiredDate)} ${fmtTime(req.startTime)} is CANCELLED. Car ${plateOf(car)} is free.`;
}

/** What a test message says. */
export const testSms = (settings = {}) =>
  `${settings.orgName || 'Fleet Desk'}: this is a test message from Fleet Desk. If you are reading it, trip messages will reach drivers the same way.`;
