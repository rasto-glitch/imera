// Pure planning of which local notifications should exist right now: every
// upcoming fire time inside the horizon, derived from standalone reminders
// and event reminders expanded through recurrence (so skips and moves are
// honored for free). The native scheduler (src/notifications) reconciles the
// OS against this plan; keeping the logic here makes it unit-testable and
// platform-free.

import { format } from 'date-fns';

import { dayKeyInZone, inZone } from './dates';
import type { ImeraEvent, Reminder } from './model/types';
import { expandOccurrences } from './recurrence';

export interface PlannedNotification {
  fireAt: Date;
  title: string;
  body?: string;
  /** In-app route to open when the notification is tapped. */
  url: string;
}

/** iOS caps pending local notifications at 64; stay under it. */
export const MAX_PLANNED = 50;

export function planNotifications(
  events: ImeraEvent[],
  reminders: Reminder[],
  now: Date,
  horizonEnd: Date,
  timeZone: string,
  max: number = MAX_PLANNED,
): PlannedNotification[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const planned: PlannedNotification[] = [];

  for (const reminder of reminders) {
    if (reminder.eventId === null) {
      if (!reminder.at) continue;
      const fireAt = new Date(reminder.at);
      if (fireAt.getTime() <= now.getTime()) continue;
      planned.push({
        fireAt,
        title: reminder.title,
        url: `/reminder/${reminder.id}`,
      });
      continue;
    }

    const event = eventById.get(reminder.eventId);
    if (!event || reminder.leadMinutes === undefined) continue;
    const lead = Math.max(0, reminder.leadMinutes);
    for (const occurrence of expandOccurrences(event, now, horizonEnd)) {
      // Reminders announce upcoming starts; an occurrence already underway
      // (or whose fire moment has passed) gets nothing.
      if (occurrence.start.getTime() <= now.getTime()) continue;
      const fireAt = new Date(occurrence.start.getTime() - lead * 60_000);
      if (fireAt.getTime() <= now.getTime()) continue;
      planned.push({
        fireAt,
        title: event.title,
        body: startBody(occurrence.start, fireAt, timeZone),
        url: `/event/${event.id}?occ=${occurrence.key}`,
      });
    }
  }

  return planned.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, max);
}

function startBody(start: Date, fireAt: Date, timeZone: string): string {
  const sameDay = dayKeyInZone(start, timeZone) === dayKeyInZone(fireAt, timeZone);
  const wall = inZone(start, timeZone);
  return sameDay
    ? `Starts at ${format(wall, 'HH:mm')}`
    : `Starts ${format(wall, 'EEE, MMM d')} at ${format(wall, 'HH:mm')}`;
}
