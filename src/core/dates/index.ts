// Date and timezone helpers, built on date-fns + @date-fns/tz. Every piece of
// date math in the app goes through this module — never naive Date arithmetic
// at call sites. Platform-agnostic: no React Native imports.
//
// Conventions:
// - An *instant* is a Date (or ISO string with offset) — an absolute moment.
// - A *DayKey* is 'yyyy-MM-dd' — a calendar date with no zone attached.
//   Which instant a DayKey starts at depends on the zone you ask in.
// - Events carry their own IANA `timeZone`; wall-clock math for an event
//   happens in that zone via TZDate.

import { TZDate } from '@date-fns/tz';
import {
  addDays,
  addMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  startOfWeek,
} from 'date-fns';

import type { ImeraEvent, Weekday } from '../model/types';

export type DayKey = string; // 'yyyy-MM-dd'

/** IANA zone the device is currently in. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The wall clock of an instant in a zone, as a TZDate (a Date subclass). */
export function inZone(instant: Date | string | number, timeZone: string): TZDate {
  return new TZDate(new Date(instant), timeZone);
}

/** Calendar date of an instant, as seen from a zone. */
export function dayKeyInZone(instant: Date | string | number, timeZone: string): DayKey {
  return format(inZone(instant, timeZone), 'yyyy-MM-dd');
}

/** Calendar date of a wall-clock Date (zone already applied). */
export function dayKeyOf(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd');
}

export function parseDayKey(key: DayKey): { year: number; month0: number; day: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month0: m - 1, day: d };
}

/** The instant a calendar date begins in a zone. */
export function startOfDayInZone(key: DayKey, timeZone: string): TZDate {
  const { year, month0, day } = parseDayKey(key);
  return new TZDate(year, month0, day, timeZone);
}

/** The instant a calendar date ends (start of the next day) in a zone. */
export function endOfDayInZone(key: DayKey, timeZone: string): TZDate {
  return startOfDayInZone(addDaysToKey(key, 1), timeZone);
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  const { year, month0, day } = parseDayKey(key);
  // Noon avoids any DST edge in the runtime's local zone; the result is a
  // pure calendar date.
  return dayKeyOf(addDays(new Date(year, month0, day, 12), days));
}

export function todayKey(timeZone: string = deviceTimeZone()): DayKey {
  return dayKeyInZone(new Date(), timeZone);
}

/** Event start as a wall clock in the event's own zone. */
export function eventStart(event: Pick<ImeraEvent, 'start' | 'timeZone'>): TZDate {
  return inZone(event.start, event.timeZone);
}

/** Event end instant. All-day events end at the start of the following day. */
export function eventEnd(
  event: Pick<ImeraEvent, 'start' | 'timeZone' | 'durationMinutes' | 'allDay'>,
): Date {
  const start = eventStart(event);
  if (event.allDay) return addDays(start, Math.max(1, Math.ceil(event.durationMinutes / 1440)));
  return addMinutes(start, event.durationMinutes);
}

/**
 * The calendar-date grid for a month view: full weeks covering the month.
 * Pure calendar math — the same grid regardless of zone.
 */
export function monthGrid(year: number, month0: number, weekStartsOn: Weekday = 1): DayKey[][] {
  const first = new Date(year, month0, 1, 12);
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn });
  const weeks: DayKey[][] = [];
  let cursor = startOfWeek(first, { weekStartsOn });
  while (isBefore(cursor, gridEnd)) {
    const week: DayKey[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(dayKeyOf(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** The seven calendar dates of the week containing `key`, for the week view. */
export function weekOf(key: DayKey, weekStartsOn: Weekday = 1): DayKey[] {
  const { year, month0, day } = parseDayKey(key);
  let cursor = startOfWeek(new Date(year, month0, day, 12), { weekStartsOn });
  const days: DayKey[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(dayKeyOf(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}
