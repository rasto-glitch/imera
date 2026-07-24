// App state: one zustand store, kept boring. Hydrated synchronously from
// src/db on launch (expo-sqlite's sync API; V1 data fits in memory) and
// written back through the repositories on every mutation. No Redux, no
// network — V1 is local-first by design.

import { create } from 'zustand';

import type { ImeraEvent, Note, NoteLink, Reminder } from '@/core/model/types';
import * as eventsRepo from '@/db/repos/events';
import * as notesRepo from '@/db/repos/notes';
import * as remindersRepo from '@/db/repos/reminders';
import * as settingsRepo from '@/db/repos/settings';
import type { ThemeOverride } from '@/theme';

interface AppState {
  hydrated: boolean;
  events: ImeraEvent[];
  reminders: Reminder[];
  notes: Note[];
  noteLinks: NoteLink[];
  themeOverride: ThemeOverride;
  /** Whether events are mirrored into the device calendar (src/interop). */
  deviceCalendarSync: boolean;

  /** Runs migrations (via the first repo call) and loads everything. */
  hydrate: () => void;

  upsertEvent: (event: ImeraEvent) => void;
  /** Returns the ids of reminders deleted alongside, for notification cleanup. */
  deleteEvent: (id: string) => string[];
  /** Record the device-calendar id written for an event, without bumping updatedAt. */
  setEventDeviceId: (id: string, deviceCalendarEventId: string | undefined) => void;

  upsertReminder: (reminder: Reminder) => void;
  deleteReminder: (id: string) => void;

  upsertNote: (note: Note) => void;
  deleteNote: (id: string) => void;
  addNoteLink: (link: NoteLink) => void;
  deleteNoteLink: (id: string) => void;

  setThemeOverride: (value: ThemeOverride) => void;
  setDeviceCalendarSync: (value: boolean) => void;
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  events: [],
  reminders: [],
  notes: [],
  noteLinks: [],
  themeOverride: 'system',
  deviceCalendarSync: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({
      events: eventsRepo.listEvents(),
      reminders: remindersRepo.listReminders(),
      notes: notesRepo.listNotes(),
      noteLinks: notesRepo.listNoteLinks(),
      themeOverride: settingsRepo.getSetting<ThemeOverride>('themeOverride') ?? 'system',
      deviceCalendarSync: settingsRepo.getSetting<boolean>('deviceCalendarSync') ?? false,
      hydrated: true,
    });
  },

  upsertEvent: (event) => {
    eventsRepo.upsertEvent(event);
    set((s) => ({ events: upsertById(s.events, event) }));
  },

  deleteEvent: (id) => {
    const removedReminderIds = eventsRepo.deleteEvent(id);
    const removed = new Set(removedReminderIds);
    set((s) => ({
      events: s.events.filter((e) => e.id !== id),
      reminders: s.reminders.filter((r) => !removed.has(r.id)),
      noteLinks: s.noteLinks.filter(
        (l) =>
          !(l.targetType === 'event' && l.targetId === id) &&
          !(l.targetType === 'reminder' && removed.has(l.targetId)),
      ),
    }));
    return removedReminderIds;
  },

  setEventDeviceId: (id, deviceCalendarEventId) => {
    const event = get().events.find((e) => e.id === id);
    if (!event || event.deviceCalendarEventId === deviceCalendarEventId) return;
    const updated = { ...event, deviceCalendarEventId };
    eventsRepo.upsertEvent(updated);
    set((s) => ({ events: upsertById(s.events, updated) }));
  },

  upsertReminder: (reminder) => {
    remindersRepo.upsertReminder(reminder);
    set((s) => ({ reminders: upsertById(s.reminders, reminder) }));
  },

  deleteReminder: (id) => {
    remindersRepo.deleteReminder(id);
    set((s) => ({
      reminders: s.reminders.filter((r) => r.id !== id),
      noteLinks: s.noteLinks.filter((l) => !(l.targetType === 'reminder' && l.targetId === id)),
    }));
  },

  upsertNote: (note) => {
    notesRepo.upsertNote(note);
    set((s) => ({ notes: upsertById(s.notes, note) }));
  },

  deleteNote: (id) => {
    notesRepo.deleteNote(id);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      noteLinks: s.noteLinks.filter((l) => l.noteId !== id),
    }));
  },

  addNoteLink: (link) => {
    notesRepo.addNoteLink(link);
    set((s) => ({ noteLinks: upsertById(s.noteLinks, link) }));
  },

  deleteNoteLink: (id) => {
    notesRepo.deleteNoteLink(id);
    set((s) => ({ noteLinks: s.noteLinks.filter((l) => l.id !== id) }));
  },

  setThemeOverride: (value) => {
    settingsRepo.setSetting('themeOverride', value);
    set({ themeOverride: value });
  },

  setDeviceCalendarSync: (value) => {
    settingsRepo.setSetting('deviceCalendarSync', value);
    set({ deviceCalendarSync: value });
  },
}));
