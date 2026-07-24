// .ics file export via the system share sheet. Export is never gated — a
// product principle, not a feature decision.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { generateIcs } from '@/core/ics';
import type { ImeraEvent, Reminder } from '@/core/model/types';

export async function shareIcs(
  events: ImeraEvent[],
  reminders: Reminder[],
  filename: string,
): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(generateIcs(events, reminders));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Export calendar',
      UTI: 'com.apple.ical.ics',
    });
  }
}
