// Device-calendar write-through (expo-calendar). Events live in a dedicated
// "Imera" calendar the user can hide or delete; whatever accounts the device
// syncs (Google, Apple, Exchange) pick them up from there.
//
// Like notifications, the mirror is driven by a store subscription: whenever
// the events array changes and sync is enabled, changed events are written
// and removed events deleted, serialized on one promise chain. Fidelity
// note: expo-calendar exposes no per-occurrence exception API, so skips and
// moves do not propagate here — the .ics export carries them.

// The legacy subpath is deliberate: in SDK 57 the root export replaced these
// functions with stubs that throw ("use the class API or expo-calendar/legacy").
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { eventEnd, eventStart } from '@/core/dates';
import { stripHtml } from '@/core/ics';
import type { ImeraEvent, Recurrence } from '@/core/model/types';
import { getSetting, setSetting } from '@/db/repos/settings';
import { useAppStore } from '@/store';

const CALENDAR_TITLE = 'Imera';
const CALENDAR_COLOR = '#2E6B57';
const CALENDAR_ID_KEY = 'deviceCalendarId';

let initialized = false;
let chain: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work).catch((error) => {
    console.warn('Device calendar sync failed', error);
  });
  return chain;
}

export function initDeviceCalendarSync(): void {
  if (initialized) return;
  initialized = true;

  let prev = useAppStore.getState().events;
  useAppStore.subscribe((state) => {
    if (state.events === prev) return;
    const before = prev;
    prev = state.events;
    if (!state.deviceCalendarSync) return;
    void enqueue(() => syncDiff(before, state.events));
  });
}

/** Ask for permission, create the calendar, and mirror every event. */
export async function enableDeviceSync(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') return false;
  await enqueue(async () => {
    await ensureCalendarId();
    useAppStore.getState().setDeviceCalendarSync(true);
    await syncDiff([], useAppStore.getState().events);
  });
  return useAppStore.getState().deviceCalendarSync;
}

/** Remove the Imera calendar (and with it every mirrored event). */
export async function disableDeviceSync(): Promise<void> {
  await enqueue(async () => {
    useAppStore.getState().setDeviceCalendarSync(false);
    const calendarId = getSetting<string>(CALENDAR_ID_KEY);
    if (calendarId) {
      try {
        await Calendar.deleteCalendarAsync(calendarId);
      } catch {
        // Already gone — deleted by the user in the calendar app.
      }
      setSetting(CALENDAR_ID_KEY, undefined);
    }
    const store = useAppStore.getState();
    for (const event of store.events) {
      if (event.deviceCalendarEventId) store.setEventDeviceId(event.id, undefined);
    }
  });
}

async function syncDiff(before: ImeraEvent[], after: ImeraEvent[]): Promise<void> {
  const calendarId = await ensureCalendarId();
  if (!calendarId) return;

  const beforeById = new Map(before.map((e) => [e.id, e]));
  const afterIds = new Set(after.map((e) => e.id));

  for (const gone of before) {
    if (!afterIds.has(gone.id) && gone.deviceCalendarEventId) {
      try {
        await Calendar.deleteEventAsync(gone.deviceCalendarEventId, { futureEvents: true });
      } catch {
        // Already gone on the device.
      }
    }
  }

  for (const event of after) {
    const prior = beforeById.get(event.id);
    const changed = !prior || prior.updatedAt !== event.updatedAt;
    if (!changed && event.deviceCalendarEventId) continue;
    const deviceId = await writeEvent(calendarId, event);
    if (deviceId !== event.deviceCalendarEventId) {
      useAppStore.getState().setEventDeviceId(event.id, deviceId);
    }
  }
}

async function writeEvent(
  calendarId: string,
  event: ImeraEvent,
): Promise<string | undefined> {
  const details = toDeviceEvent(event);
  if (event.deviceCalendarEventId) {
    try {
      await Calendar.updateEventAsync(event.deviceCalendarEventId, details, {
        futureEvents: true,
      });
      return event.deviceCalendarEventId;
    } catch {
      // The device-side copy vanished; fall through and recreate it.
    }
  }
  try {
    return await Calendar.createEventAsync(calendarId, details);
  } catch (error) {
    console.warn('Device calendar write failed', error);
    return undefined;
  }
}

function toDeviceEvent(event: ImeraEvent): Partial<Calendar.Event> {
  const notes = [event.description ? stripHtml(event.description) : '', event.notes ?? '']
    .filter(Boolean)
    .join('\n\n');
  return {
    title: event.title,
    startDate: new Date(eventStart(event).getTime()),
    endDate: new Date(eventEnd(event).getTime()),
    allDay: event.allDay,
    timeZone: event.timeZone,
    location: event.location?.text,
    notes: notes || undefined,
    url: event.location?.mapsUrl,
    recurrenceRule: toRecurrenceRule(event.recurrence),
  };
}

function toRecurrenceRule(recurrence: Recurrence): Calendar.RecurrenceRule | undefined {
  switch (recurrence.kind) {
    case 'none':
      return undefined;
    case 'daily':
      return { frequency: Calendar.Frequency.DAILY, interval: recurrence.interval };
    case 'weekly':
      return {
        frequency: Calendar.Frequency.WEEKLY,
        interval: recurrence.interval,
        // Calendar.DayOfTheWeek: Sunday=1 … Saturday=7; ours: Sunday=0 … Saturday=6.
        daysOfTheWeek: recurrence.weekdays.length
          ? recurrence.weekdays.map((w) => ({ dayOfTheWeek: (w + 1) as Calendar.DayOfTheWeek }))
          : undefined,
      };
    case 'monthly':
      return { frequency: Calendar.Frequency.MONTHLY, interval: recurrence.interval };
    case 'yearly':
      return { frequency: Calendar.Frequency.YEARLY, interval: recurrence.interval };
  }
}

async function ensureCalendarId(): Promise<string | undefined> {
  const known = getSetting<string>(CALENDAR_ID_KEY);
  if (known) {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (calendars.some((c) => c.id === known)) return known;
  }

  let source: Calendar.Source | { isLocalAccount: boolean; name: string; type: string };
  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    source = defaultCalendar.source;
  } else {
    source = { isLocalAccount: true, name: CALENDAR_TITLE, type: Calendar.SourceType.LOCAL };
  }

  const id = await Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    name: CALENDAR_TITLE,
    color: CALENDAR_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    ownerAccount: CALENDAR_TITLE,
    source: source as Calendar.Source,
    sourceId: 'id' in source ? source.id : undefined,
  });
  setSetting(CALENDAR_ID_KEY, id);
  return id;
}
