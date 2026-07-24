// Platform-agnostic domain model. Nothing in src/core may import React Native
// or Expo modules — these types and the date/recurrence logic are shared with
// the future web build as plain TypeScript.

/** 0 = Sunday … 6 = Saturday, matching date-fns getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Recurrence =
  | { kind: 'none' }
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; interval: number; weekdays: Weekday[] }
  | { kind: 'monthly'; interval: number }
  | { kind: 'yearly'; interval: number };

export interface PhoneField {
  label?: string;
  number: string;
}

export interface EventLocation {
  text: string;
  mapsUrl?: string;
}

export interface ImeraEvent {
  id: string;
  title: string;
  /** ISO 8601 with offset. All date math goes through src/core/dates. */
  start: string;
  durationMinutes: number;
  allDay: boolean;
  /** IANA timezone the event was created in. */
  timeZone: string;
  description?: string;
  notes?: string;
  phones: PhoneField[];
  location?: EventLocation;
  recurrence: Recurrence;
  /**
   * Skipped occurrences of a recurring event: the occurrence's calendar date
   * (yyyy-MM-dd) in the event's own zone. Skips hide the occurrence
   * everywhere but stay listed on the event, and can be restored.
   */
  skippedDays: string[];
  /**
   * Moved occurrences, keyed like skippedDays by the occurrence's *original*
   * date in the event's zone. The value holds the new start (ISO with
   * offset) — same shape iCalendar expresses as a RECURRENCE-ID override.
   * A key present in both skippedDays and movedOccurrences is skipped.
   */
  movedOccurrences: Record<string, { start: string }>;
  /** expo-calendar event id once written to the device calendar. */
  deviceCalendarEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  /** Null for standalone reminders not tied to an event. */
  eventId: string | null;
  title: string;
  /** Event-linked: minutes before the event start. User-configurable, no preset list. */
  leadMinutes?: number;
  /** Standalone: absolute fire time, ISO 8601 with offset. */
  at?: string;
  /** expo-notifications identifier for cancel/reschedule. */
  notificationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  body: string;
  /** ISO date (yyyy-MM-dd) when the note is attached to a day; null if free-form. */
  date: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A note (or a selected line of it) converted into an event or reminder.
 * The link persists and is visible from both sides.
 */
export interface NoteLink {
  id: string;
  noteId: string;
  targetType: 'event' | 'reminder';
  targetId: string;
  /** The line of the note the target was created from, if a single line. */
  sourceLine?: number;
  createdAt: string;
}
