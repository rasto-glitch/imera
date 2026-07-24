// Day-indexed occurrence expansion for the calendar views. Pure composition
// of core/dates + core/recurrence: given the event list and a visible span of
// calendar dates, produce every occurrence grouped by the day it touches *as
// seen from the viewer's zone*. Multi-day occurrences appear under every day
// they cover.

import { addDaysToKey, dayKeyInZone, endOfDayInZone, startOfDayInZone, type DayKey } from './dates';
import type { ImeraEvent } from './model/types';
import { expandOccurrences, type Occurrence } from './recurrence';

export type OccurrencesByDay = Map<DayKey, Occurrence[]>;

/**
 * Occurrences of `events` between `fromKey` and `toKey` (inclusive), grouped
 * by calendar date in `timeZone` and sorted by start within each day.
 */
export function occurrencesByDay(
  events: ImeraEvent[],
  fromKey: DayKey,
  toKey: DayKey,
  timeZone: string,
): OccurrencesByDay {
  const rangeStart = startOfDayInZone(fromKey, timeZone);
  const rangeEnd = endOfDayInZone(toKey, timeZone);

  const byDay: OccurrencesByDay = new Map();
  for (const event of events) {
    for (const occurrence of expandOccurrences(event, rangeStart, rangeEnd)) {
      // Walk each calendar day the occurrence touches, clamped to the span.
      let key = dayKeyInZone(occurrence.start, timeZone);
      if (key < fromKey) key = fromKey;
      // end is exclusive: an occurrence ending exactly at midnight does not
      // touch the following day.
      const lastKey = dayKeyInZone(occurrence.end.getTime() - 1, timeZone);
      const stopKey = lastKey < toKey ? lastKey : toKey;
      for (; key <= stopKey; key = addDaysToKey(key, 1)) {
        const list = byDay.get(key);
        if (list) list.push(occurrence);
        else byDay.set(key, [occurrence]);
      }
    }
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
  return byDay;
}
