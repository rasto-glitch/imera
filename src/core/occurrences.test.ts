import { describe, expect, it } from 'vitest';

import { occurrencesByDay } from './occurrences';
import type { ImeraEvent } from './model/types';

function makeEvent(overrides: Partial<ImeraEvent> & Pick<ImeraEvent, 'id' | 'start'>): ImeraEvent {
  return {
    title: 'Test',
    durationMinutes: 60,
    allDay: false,
    timeZone: 'Asia/Baghdad',
    phones: [],
    recurrence: { kind: 'none' },
    skippedDays: [],
    movedOccurrences: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('occurrencesByDay', () => {
  it('groups occurrences under the viewer-zone day they fall on', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-07-24T09:00:00+03:00' }),
      makeEvent({ id: 'b', start: '2026-07-24T15:00:00+03:00' }),
      makeEvent({ id: 'c', start: '2026-07-25T09:00:00+03:00' }),
    ];
    const byDay = occurrencesByDay(events, '2026-07-24', '2026-07-25', 'Asia/Baghdad');
    expect(byDay.get('2026-07-24')?.map((o) => o.eventId)).toEqual(['a', 'b']);
    expect(byDay.get('2026-07-25')?.map((o) => o.eventId)).toEqual(['c']);
  });

  it('lists a multi-day occurrence under every day it covers', () => {
    const events = [
      makeEvent({ id: 'trip', start: '2026-07-24T00:00:00+03:00', allDay: true, durationMinutes: 3 * 1440 }),
    ];
    const byDay = occurrencesByDay(events, '2026-07-23', '2026-07-28', 'Asia/Baghdad');
    expect(byDay.get('2026-07-23')).toBeUndefined();
    expect(byDay.get('2026-07-24')).toHaveLength(1);
    expect(byDay.get('2026-07-25')).toHaveLength(1);
    expect(byDay.get('2026-07-26')).toHaveLength(1);
    expect(byDay.get('2026-07-27')).toBeUndefined();
  });

  it('does not leak a midnight-ending occurrence into the next day', () => {
    const events = [
      makeEvent({ id: 'late', start: '2026-07-24T23:00:00+03:00', durationMinutes: 60 }),
    ];
    const byDay = occurrencesByDay(events, '2026-07-24', '2026-07-25', 'Asia/Baghdad');
    expect(byDay.get('2026-07-24')).toHaveLength(1);
    expect(byDay.get('2026-07-25')).toBeUndefined();
  });

  it('sees the day boundary from the viewer zone, not the event zone', () => {
    // 23:30 in Baghdad on the 24th is already the 25th in Tokyo.
    const events = [
      makeEvent({ id: 'x', start: '2026-07-24T23:30:00+03:00', durationMinutes: 30 }),
    ];
    const byDay = occurrencesByDay(events, '2026-07-24', '2026-07-26', 'Asia/Tokyo');
    expect(byDay.get('2026-07-25')).toHaveLength(1);
    expect(byDay.get('2026-07-24')).toBeUndefined();
  });
});
