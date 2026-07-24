// One-time .ics import: pick a file, parse tolerantly, insert as new events
// (with reminders from VALARMs). Imported events get fresh ids — reimporting
// the same file creates duplicates, which V1 accepts by design.

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { deviceTimeZone } from '@/core/dates';
import { parseIcs } from '@/core/ics';
import { newId } from '@/db/id';
import { useAppStore } from '@/store';

export interface ImportResult {
  cancelled: boolean;
  imported: number;
  skipped: number;
}

export async function pickAndImportIcs(): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/calendar', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled) return { cancelled: true, imported: 0, skipped: 0 };

  const text = await new File(picked.assets[0].uri).text();
  const { events, skipped } = parseIcs(text, deviceTimeZone());

  const store = useAppStore.getState();
  const now = new Date().toISOString();
  for (const item of events) {
    const id = newId();
    store.upsertEvent({ ...item.event, id, createdAt: now, updatedAt: now });
    for (const lead of item.leads) {
      store.upsertReminder({
        id: newId(),
        eventId: id,
        title: item.event.title,
        leadMinutes: lead,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return { cancelled: false, imported: events.length, skipped };
}
