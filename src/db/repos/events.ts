import type { ImeraEvent, PhoneField, Recurrence } from '@/core/model/types';
import { getDb } from '../index';

interface EventRow {
  id: string;
  title: string;
  start: string;
  duration_minutes: number;
  all_day: number;
  time_zone: string;
  description: string | null;
  notes: string | null;
  phones: string;
  location_text: string | null;
  location_maps_url: string | null;
  recurrence: string;
  skipped_days: string;
  moved_occurrences: string;
  device_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

function toModel(row: EventRow): ImeraEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    durationMinutes: row.duration_minutes,
    allDay: row.all_day === 1,
    timeZone: row.time_zone,
    description: row.description ?? undefined,
    notes: row.notes ?? undefined,
    phones: JSON.parse(row.phones) as PhoneField[],
    location: row.location_text
      ? { text: row.location_text, mapsUrl: row.location_maps_url ?? undefined }
      : undefined,
    recurrence: JSON.parse(row.recurrence) as Recurrence,
    skippedDays: JSON.parse(row.skipped_days) as string[],
    movedOccurrences: JSON.parse(row.moved_occurrences) as Record<string, { start: string }>,
    deviceCalendarEventId: row.device_calendar_event_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listEvents(): ImeraEvent[] {
  return getDb()
    .getAllSync<EventRow>('SELECT * FROM events ORDER BY start')
    .map(toModel);
}

export function upsertEvent(event: ImeraEvent): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO events (
      id, title, start, duration_minutes, all_day, time_zone, description,
      notes, phones, location_text, location_maps_url, recurrence,
      skipped_days, moved_occurrences, device_calendar_event_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.title,
      event.start,
      event.durationMinutes,
      event.allDay ? 1 : 0,
      event.timeZone,
      event.description ?? null,
      event.notes ?? null,
      JSON.stringify(event.phones),
      event.location?.text ?? null,
      event.location?.mapsUrl ?? null,
      JSON.stringify(event.recurrence),
      JSON.stringify(event.skippedDays),
      JSON.stringify(event.movedOccurrences),
      event.deviceCalendarEventId ?? null,
      event.createdAt,
      event.updatedAt,
    ],
  );
}

/**
 * Deletes the event, its reminders (FK cascade), and any note links pointing
 * at the event or those reminders. Returns the deleted reminder ids so the
 * caller can cancel their scheduled notifications.
 */
export function deleteEvent(id: string): string[] {
  const db = getDb();
  let reminderIds: string[] = [];
  db.withTransactionSync(() => {
    reminderIds = db
      .getAllSync<{ id: string }>('SELECT id FROM reminders WHERE event_id = ?', [id])
      .map((r) => r.id);
    db.runSync("DELETE FROM note_links WHERE target_type = 'event' AND target_id = ?", [id]);
    for (const reminderId of reminderIds) {
      db.runSync("DELETE FROM note_links WHERE target_type = 'reminder' AND target_id = ?", [
        reminderId,
      ]);
    }
    db.runSync('DELETE FROM events WHERE id = ?', [id]);
  });
  return reminderIds;
}
