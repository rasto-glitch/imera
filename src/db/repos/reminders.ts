import type { Reminder } from '@/core/model/types';
import { getDb } from '../index';

interface ReminderRow {
  id: string;
  event_id: string | null;
  title: string;
  lead_minutes: number | null;
  at: string | null;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
}

function toModel(row: ReminderRow): Reminder {
  return {
    id: row.id,
    eventId: row.event_id,
    title: row.title,
    leadMinutes: row.lead_minutes ?? undefined,
    at: row.at ?? undefined,
    notificationId: row.notification_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listReminders(): Reminder[] {
  return getDb()
    .getAllSync<ReminderRow>('SELECT * FROM reminders ORDER BY created_at')
    .map(toModel);
}

export function upsertReminder(reminder: Reminder): void {
  getDb().runSync(
    `INSERT OR REPLACE INTO reminders (
      id, event_id, title, lead_minutes, at, notification_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reminder.id,
      reminder.eventId,
      reminder.title,
      reminder.leadMinutes ?? null,
      reminder.at ?? null,
      reminder.notificationId ?? null,
      reminder.createdAt,
      reminder.updatedAt,
    ],
  );
}

/** Deletes the reminder and any note links pointing at it. */
export function deleteReminder(id: string): void {
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM note_links WHERE target_type = 'reminder' AND target_id = ?", [id]);
    db.runSync('DELETE FROM reminders WHERE id = ?', [id]);
  });
}
