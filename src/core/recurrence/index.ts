// Recurrence expansion: given an event's Recurrence rule and a visible range,
// yield concrete occurrences. Platform-agnostic; consumed by the calendar
// views, reminder scheduling, and .ics export alike.
//
// Semantics:
// - Occurrences keep the event's *wall-clock* time in the event's own zone.
//   A 09:00 daily event stays 09:00 across a DST change (the UTC instant
//   shifts instead). TZDate arithmetic gives us this for free.
// - Monthly/yearly rules clamp short months: Jan 31 → Feb 28, Feb 29 → Feb 28
//   in non-leap years. Each occurrence is computed from the original start
//   (start + k·interval months), so clamping never compounds — Mar 31 stays
//   Mar 31 even though Feb clamped.
// - Weekly rules treat the weekday set as authoritative: if the start date's
//   weekday is not in the set, the first occurrence is the first listed
//   weekday on or after the start. Week intervals are counted from the
//   Sunday-started week containing the start.

import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  addYears,
  constructFrom,
  getDay,
  startOfWeek,
} from 'date-fns';

import { dayKeyInZone, eventStart } from '../dates';
import type { ImeraEvent, Weekday } from '../model/types';

export interface Occurrence {
  eventId: string;
  /**
   * The occurrence's identity: its *original* rule date in the event's zone,
   * stable across moves. Skips and moves are keyed by this.
   */
  key: string;
  /** Instants. Wall-clock rendering goes through core/dates with a zone. */
  start: Date;
  end: Date;
}

type RecurringEvent = Pick<
  ImeraEvent,
  | 'id'
  | 'start'
  | 'timeZone'
  | 'durationMinutes'
  | 'allDay'
  | 'recurrence'
  | 'skippedDays'
  | 'movedOccurrences'
>;

const MS_PER_DAY = 86_400_000;
// Backstop against runaway loops; a month view of a daily event needs ~31.
const MAX_OCCURRENCES = 1000;

export function expandOccurrences(
  event: RecurringEvent,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence[] {
  if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

  const base = eventStart(event);
  const rule = event.recurrence;

  const endOf = (start: Date): Date =>
    event.allDay
      ? addDays(start, Math.max(1, Math.ceil(event.durationMinutes / 1440)))
      : addMinutes(start, event.durationMinutes);

  // Skips and moves identify an occurrence by its original calendar date in
  // the event's zone.
  const skipped = new Set(event.skippedDays);
  const moves = event.movedOccurrences;

  const out: Occurrence[] = [];
  const emit = (key: string, start: Date) => {
    const end = endOf(start);
    if (start.getTime() >= rangeEnd.getTime() || end.getTime() <= rangeStart.getTime()) return;
    out.push({ eventId: event.id, key, start, end });
  };
  const push = (start: Date) => {
    const key = dayKeyInZone(start, event.timeZone);
    if (skipped.has(key)) return;
    // Moved occurrences are emitted in the pass below, from the move itself —
    // the rule day only tells us where they *would* have been.
    if (moves[key]) return;
    emit(key, start);
  };

  // Moves can relocate an occurrence into a window whose rule days lie
  // entirely outside it, so they are expanded independently of the range the
  // rule generator walks.
  for (const [key, move] of Object.entries(moves)) {
    if (!skipped.has(key)) emit(key, new Date(move.start));
  }

  switch (rule.kind) {
    case 'none': {
      push(base);
      break;
    }

    case 'daily': {
      const interval = Math.max(1, rule.interval);
      // Fast-forward close to the range; the -2 slack absorbs DST offsets.
      let k = Math.max(
        0,
        Math.floor((rangeStart.getTime() - base.getTime()) / (interval * MS_PER_DAY)) - 2,
      );
      for (; out.length < MAX_OCCURRENCES; k++) {
        const start = addDays(base, k * interval);
        if (start.getTime() >= rangeEnd.getTime()) break;
        push(start);
      }
      break;
    }

    case 'weekly': {
      const interval = Math.max(1, rule.interval);
      const weekdays: Weekday[] = rule.weekdays.length
        ? [...new Set(rule.weekdays)].sort((a, b) => a - b)
        : [getDay(base) as Weekday];
      // Weeks are anchored on Sunday purely to count intervals; the weekday
      // set decides which days inside each week fire.
      const baseWeek = startOfWeek(base, { weekStartsOn: 0 });
      const stepMs = interval * 7 * MS_PER_DAY;
      let k = Math.max(0, Math.floor((rangeStart.getTime() - baseWeek.getTime()) / stepMs) - 2);
      weeks: for (; out.length < MAX_OCCURRENCES; k++) {
        const weekStart = addWeeks(baseWeek, k * interval);
        if (weekStart.getTime() >= rangeEnd.getTime()) break;
        for (const weekday of weekdays) {
          const day = addDays(weekStart, weekday);
          const start = withWallTime(day, base);
          if (start.getTime() < base.getTime()) continue;
          if (start.getTime() >= rangeEnd.getTime()) continue weeks;
          push(start);
        }
      }
      break;
    }

    case 'monthly': {
      const interval = Math.max(1, rule.interval);
      let k = Math.max(0, Math.floor(monthsBetween(base, rangeStart) / interval) - 1);
      for (; out.length < MAX_OCCURRENCES; k++) {
        const start = addMonths(base, k * interval);
        if (start.getTime() >= rangeEnd.getTime()) break;
        push(start);
      }
      break;
    }

    case 'yearly': {
      const interval = Math.max(1, rule.interval);
      let k = Math.max(
        0,
        Math.floor((rangeStart.getUTCFullYear() - base.getFullYear()) / interval) - 1,
      );
      for (; out.length < MAX_OCCURRENCES; k++) {
        const start = addYears(base, k * interval);
        if (start.getTime() >= rangeEnd.getTime()) break;
        push(start);
      }
      break;
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** `day`'s calendar date with `base`'s time of day, in `base`'s zone. */
function withWallTime(day: Date, base: Date): Date {
  // constructFrom keeps the TZDate subclass and zone; setHours on a TZDate
  // sets wall-clock hours in that zone.
  const result = constructFrom(day, day.getTime());
  result.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
  return result;
}

/** Whole months from `base` to `instant`, as a fast-forward estimate. */
function monthsBetween(base: Date, instant: Date): number {
  return (
    (instant.getUTCFullYear() - base.getFullYear()) * 12 +
    (instant.getUTCMonth() - base.getMonth())
  );
}
