// Versioned DDL. MIGRATIONS[n] moves the database from user_version n to n+1;
// the runner in ./index applies each in its own transaction. Never edit a
// shipped migration — append a new one.
//
// Tables mirror src/core/model. JSON columns (phones, recurrence) hold small
// structured fields that are never queried by their contents. note_links has
// no FK on target_id (it points at either events or reminders); the event and
// reminder repositories clean up links on delete.

export const MIGRATIONS: string[] = [
  // v1: initial schema
  `
  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    start TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    all_day INTEGER NOT NULL DEFAULT 0,
    time_zone TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    phones TEXT NOT NULL DEFAULT '[]',
    location_text TEXT,
    location_maps_url TEXT,
    recurrence TEXT NOT NULL DEFAULT '{"kind":"none"}',
    device_calendar_event_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_events_start ON events(start);

  CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    lead_minutes INTEGER,
    at TEXT,
    notification_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_reminders_event ON reminders(event_id);

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_notes_date ON notes(date);

  CREATE TABLE note_links (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('event', 'reminder')),
    target_id TEXT NOT NULL,
    source_line INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_note_links_note ON note_links(note_id);
  CREATE INDEX idx_note_links_target ON note_links(target_type, target_id);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // v2: per-occurrence skips on recurring events
  `
  ALTER TABLE events ADD COLUMN skipped_days TEXT NOT NULL DEFAULT '[]';
  `,

  // v3: per-occurrence moves (RECURRENCE-ID-style overrides)
  `
  ALTER TABLE events ADD COLUMN moved_occurrences TEXT NOT NULL DEFAULT '{}';
  `,
];
