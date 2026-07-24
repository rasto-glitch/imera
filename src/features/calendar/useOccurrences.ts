import { useMemo } from 'react';

import { deviceTimeZone, type DayKey } from '@/core/dates';
import type { ImeraEvent } from '@/core/model/types';
import { occurrencesByDay, type OccurrencesByDay } from '@/core/occurrences';
import { useAppStore } from '@/store';

/** Occurrences for the span [fromKey, toKey], grouped by device-zone day. */
export function useOccurrences(fromKey: DayKey, toKey: DayKey): OccurrencesByDay {
  const events = useAppStore((s) => s.events);
  return useMemo(
    () => occurrencesByDay(events, fromKey, toKey, deviceTimeZone()),
    [events, fromKey, toKey],
  );
}

/** Event lookup by id, for rendering occurrences. */
export function useEventIndex(): Map<string, ImeraEvent> {
  const events = useAppStore((s) => s.events);
  return useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
}
