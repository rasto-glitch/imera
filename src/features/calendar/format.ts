import { format } from 'date-fns';

import { dayKeyInZone, inZone, type DayKey } from '@/core/dates';
import type { ImeraEvent } from '@/core/model/types';
import type { Occurrence } from '@/core/recurrence';

export function formatClock(instant: Date, timeZone: string): string {
  return format(inZone(instant, timeZone), 'HH:mm');
}

/**
 * An occurrence's time label as seen on `day`: "All day", "09:00 – 10:30",
 * or arrows when it continues from the previous day / into the next.
 */
export function formatOccurrenceTime(
  occurrence: Occurrence,
  event: Pick<ImeraEvent, 'allDay'>,
  day: DayKey,
  timeZone: string,
): string {
  if (event.allDay) return 'All day';
  const startsToday = dayKeyInZone(occurrence.start, timeZone) === day;
  const endsToday = dayKeyInZone(occurrence.end.getTime() - 1, timeZone) === day;
  if (startsToday && endsToday) {
    return `${formatClock(occurrence.start, timeZone)} – ${formatClock(occurrence.end, timeZone)}`;
  }
  if (startsToday) return `${formatClock(occurrence.start, timeZone)} →`;
  if (endsToday) return `→ ${formatClock(occurrence.end, timeZone)}`;
  return 'All day';
}
