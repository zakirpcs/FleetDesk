// Business rules computed on the client for now. The backend should implement the same
// rules (see API_CONTRACT.md) so reports match whether computed here or server-side.
import { mins, weekday, weekStart, groupBy, sum } from './utils.js';

/**
 * Overtime per driver per day, from logbook entries.
 * - Duty window = earliest start to latest end across that driver's entries for the day.
 * - Working day: OT = time before shift start + time after shift end, each counted only if it
 *   exceeds the grace period, then rounded down to the rounding step.
 * - Weekend / holiday: the whole duty window is OT, paid at the weekend multiplier.
 */
export function overtimeDays(trips, drivers, settings) {
  const rate = Object.fromEntries(drivers.map((d) => [d.id, Number(d.otRate) || 0]));
  const S = mins(settings.shiftStart), E = mins(settings.shiftEnd);
  const grace = Number(settings.graceMinutes) || 0, step = Number(settings.roundingMinutes) || 1;
  const holidays = new Set(settings.holidays || []);
  const days = groupBy(trips.filter((t) => t.driverId && t.startTime && t.endTime), (t) => `${t.driverId}|${t.date}`);
  return Object.values(days).map((list) => {
    const { driverId, date } = list[0];
    const start = Math.min(...list.map((t) => mins(t.startTime)));
    const end = Math.max(...list.map((t) => mins(t.endTime)));
    const offDay = settings.weekendDays.includes(weekday(date)) || holidays.has(date);
    let raw;
    if (offDay) raw = end - start;
    else {
      const early = S - start > grace ? S - start : 0;
      const late = end - E > grace ? end - E : 0;
      raw = early + late;
    }
    const otMin = Math.floor(raw / step) * step;
    const mult = offDay ? Number(settings.weekendMultiplier) || 1 : 1;
    return {
      driverId, date, offDay, start, end, dutyMin: end - start, otMin, mult,
      amount: (otMin / 60) * rate[driverId] * mult,
      km: sum(list, (t) => t.endOdo - t.startOdo),
    };
  });
}

export const tripKm = (t) => Math.max(0, Number(t.endOdo) - Number(t.startOdo));

/** km per car per bucket. period: 'week' | 'month'. Returns { buckets: [...keys asc], table: { carId: { key: km } } } */
export function kmBuckets(trips, period, settings) {
  const key = (d) => (period === 'week' ? weekStart(d, settings.weekStartDay) : d.slice(0, 7));
  const table = {}; const keys = new Set();
  for (const t of trips) {
    const k = key(t.date); keys.add(k);
    (table[t.carId] ||= {})[k] = (table[t.carId][k] || 0) + tripKm(t);
  }
  return { buckets: [...keys].sort(), table };
}
