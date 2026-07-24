import { describe, expect, it } from 'vitest';

import { dayKeyInZone } from '../dates';
import type { ImeraEvent, Recurrence } from '../model/types';
import { expandOccurrences, type Occurrence } from './index';

function makeEvent(overrides: {
  start: string;
  timeZone?: string;
  durationMinutes?: number;
  allDay?: boolean;
  recurrence: Recurrence;
  skippedDays?: string[];
  movedOccurrences?: Record<string, { start: string }>;
}): Pick<
  ImeraEvent,
  | 'id'
  | 'start'
  | 'timeZone'
  | 'durationMinutes'
  | 'allDay'
  | 'recurrence'
  | 'skippedDays'
  | 'movedOccurrences'
> {
  return {
    id: 'evt-1',
    timeZone: 'Asia/Baghdad',
    durationMinutes: 60,
    allDay: false,
    skippedDays: [],
    movedOccurrences: {},
    ...overrides,
  };
}

function dayKeys(occurrences: Occurrence[], timeZone = 'Asia/Baghdad'): string[] {
  return occurrences.map((o) => dayKeyInZone(o.start, timeZone));
}

/** TZDate.toISOString() keeps the zone offset; normalize to UTC to compare instants. */
const utc = (d: Date) => new Date(d.getTime()).toISOString();

describe('kind: none', () => {
  const event = makeEvent({
    start: '2026-01-05T09:00:00+03:00',
    recurrence: { kind: 'none' },
  });

  it('yields the single occurrence when it overlaps the range', () => {
    const out = expandOccurrences(
      event,
      new Date('2026-01-01T00:00:00+03:00'),
      new Date('2026-02-01T00:00:00+03:00'),
    );
    expect(out).toHaveLength(1);
    expect(utc(out[0].start)).toBe('2026-01-05T06:00:00.000Z');
    expect(utc(out[0].end)).toBe('2026-01-05T07:00:00.000Z');
  });

  it('yields nothing outside the range', () => {
    const out = expandOccurrences(
      event,
      new Date('2026-02-01T00:00:00+03:00'),
      new Date('2026-03-01T00:00:00+03:00'),
    );
    expect(out).toHaveLength(0);
  });
});

describe('kind: daily', () => {
  it('expands within the window only', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-10T00:00:00+03:00'),
      new Date('2026-01-13T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12']);
  });

  it('respects the interval, counted from the start date', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'daily', interval: 3 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-06T00:00:00+03:00'),
      new Date('2026-01-15T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-08', '2026-01-11', '2026-01-14']);
  });

  it('emits nothing before the event start', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2025-12-01T00:00:00+03:00'),
      new Date('2026-01-01T00:00:00+03:00'),
    );
    expect(out).toHaveLength(0);
  });

  it('fast-forwards far past starts without truncating', () => {
    const event = makeEvent({
      start: '2020-01-01T09:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-07-24T00:00:00+03:00'),
      new Date('2026-07-25T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-07-24']);
  });

  it('keeps wall-clock time across a DST change', () => {
    // US DST starts 2026-03-08 02:00 in New York.
    const event = makeEvent({
      start: '2026-03-06T09:00:00-05:00',
      timeZone: 'America/New_York',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-03-06T00:00:00-05:00'),
      new Date('2026-03-10T00:00:00-04:00'),
    );
    expect(out.map((o) => utc(o.start))).toEqual([
      '2026-03-06T14:00:00.000Z', // 09:00 EST
      '2026-03-07T14:00:00.000Z', // 09:00 EST
      '2026-03-08T13:00:00.000Z', // 09:00 EDT — wall clock held, instant shifted
      '2026-03-09T13:00:00.000Z', // 09:00 EDT
    ]);
  });
});

describe('kind: weekly', () => {
  it('fires on the listed weekdays', () => {
    // 2026-01-05 is a Monday.
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1, 3] },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-19T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-05', '2026-01-07', '2026-01-12', '2026-01-14']);
  });

  it('skips weeks per the interval', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'weekly', interval: 2, weekdays: [1, 3] },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-02-02T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-05', '2026-01-07', '2026-01-19', '2026-01-21']);
  });

  it('never fires before the event start, even in the start week', () => {
    // Start Wednesday Jan 7; Monday Jan 5 of the same week must not fire.
    const event = makeEvent({
      start: '2026-01-07T09:00:00+03:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1, 3] },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-01T00:00:00+03:00'),
      new Date('2026-01-14T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-07', '2026-01-12']);
  });

  it('falls back to the start weekday when the set is empty', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00', // Monday
      recurrence: { kind: 'weekly', interval: 1, weekdays: [] },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-19T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-05', '2026-01-12']);
  });
});

describe('kind: monthly', () => {
  it('clamps short months without compounding', () => {
    const event = makeEvent({
      start: '2026-01-31T09:00:00+03:00',
      recurrence: { kind: 'monthly', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-01T00:00:00+03:00'),
      new Date('2026-05-01T00:00:00+03:00'),
    );
    // Feb clamps to 28, but March recovers to the 31st (no drift).
    expect(dayKeys(out)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('respects the interval', () => {
    const event = makeEvent({
      start: '2026-01-15T09:00:00+03:00',
      recurrence: { kind: 'monthly', interval: 2 },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-01T00:00:00+03:00'),
      new Date('2026-07-01T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-15', '2026-03-15', '2026-05-15']);
  });
});

describe('kind: yearly', () => {
  it('clamps Feb 29 in non-leap years and recovers in leap years', () => {
    const event = makeEvent({
      start: '2024-02-29T09:00:00+03:00',
      recurrence: { kind: 'yearly', interval: 1 },
    });
    const out = expandOccurrences(
      event,
      new Date('2024-01-01T00:00:00+03:00'),
      new Date('2028-12-31T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });
});

describe('all-day events', () => {
  it('spans whole days and overlaps ranges by day', () => {
    const event = makeEvent({
      start: '2026-01-05T00:00:00+03:00',
      allDay: true,
      durationMinutes: 0,
      recurrence: { kind: 'weekly', interval: 1, weekdays: [5] }, // Fridays
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-26T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-09', '2026-01-16', '2026-01-23']);
    const first = out[0];
    expect((first.end.getTime() - first.start.getTime()) / 86_400_000).toBe(1);
  });
});

describe('skipped occurrences', () => {
  it('hides exactly the skipped occurrence of a weekly event', () => {
    // Gym every Monday; skip Jan 12.
    const event = makeEvent({
      start: '2026-01-05T18:00:00+03:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1] },
      skippedDays: ['2026-01-12'],
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-27T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-05', '2026-01-19', '2026-01-26']);
  });

  it('identifies the occurrence by its date in the event zone, not the viewer zone', () => {
    // 23:00 Baghdad on the 10th is already the 11th in Tokyo; the skip key
    // is the Baghdad date.
    const event = makeEvent({
      start: '2026-01-05T23:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
      skippedDays: ['2026-01-10'],
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-09T00:00:00+03:00'),
      new Date('2026-01-12T00:00:00+03:00'),
    );
    expect(dayKeys(out)).toEqual(['2026-01-09', '2026-01-11']);
  });

  it('skips a one-off event on its day', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'none' },
      skippedDays: ['2026-01-05'],
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-01T00:00:00+03:00'),
      new Date('2026-02-01T00:00:00+03:00'),
    );
    expect(out).toHaveLength(0);
  });
});

describe('moved occurrences', () => {
  // Gym every Monday at 18:00 Baghdad.
  const gym = {
    start: '2026-01-05T18:00:00+03:00',
    recurrence: { kind: 'weekly', interval: 1, weekdays: [1] } as Recurrence,
  };

  it('moves one occurrence to a later time, keeping the rest', () => {
    const event = makeEvent({
      ...gym,
      movedOccurrences: { '2026-01-12': { start: '2026-01-12T19:00:00+03:00' } },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-20T00:00:00+03:00'),
    );
    expect(out.map((o) => `${o.key} ${utc(o.start)}`)).toEqual([
      '2026-01-05 2026-01-05T15:00:00.000Z',
      '2026-01-12 2026-01-12T16:00:00.000Z', // 19:00 — moved, key keeps the original day
      '2026-01-19 2026-01-19T15:00:00.000Z',
    ]);
  });

  it('finds an occurrence moved into a window that excludes its rule day', () => {
    // Monday Jan 12 moved to Friday Jan 16; the view shows only Friday.
    const event = makeEvent({
      ...gym,
      movedOccurrences: { '2026-01-12': { start: '2026-01-16T18:00:00+03:00' } },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-16T00:00:00+03:00'),
      new Date('2026-01-17T00:00:00+03:00'),
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('2026-01-12');
    expect(utc(out[0].start)).toBe('2026-01-16T15:00:00.000Z');
  });

  it('leaves a hole where a moved-away occurrence used to be', () => {
    const event = makeEvent({
      ...gym,
      movedOccurrences: { '2026-01-12': { start: '2026-01-16T18:00:00+03:00' } },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-12T00:00:00+03:00'),
      new Date('2026-01-13T00:00:00+03:00'),
    );
    expect(out).toHaveLength(0);
  });

  it('skip wins over a move for the same occurrence', () => {
    const event = makeEvent({
      ...gym,
      skippedDays: ['2026-01-12'],
      movedOccurrences: { '2026-01-12': { start: '2026-01-16T18:00:00+03:00' } },
    });
    const out = expandOccurrences(
      event,
      new Date('2026-01-05T00:00:00+03:00'),
      new Date('2026-01-20T00:00:00+03:00'),
    );
    expect(out.map((o) => o.key)).toEqual(['2026-01-05', '2026-01-19']);
  });
});

describe('degenerate input', () => {
  it('returns nothing for an empty or inverted range', () => {
    const event = makeEvent({
      start: '2026-01-05T09:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const at = new Date('2026-01-10T00:00:00+03:00');
    expect(expandOccurrences(event, at, at)).toHaveLength(0);
    expect(expandOccurrences(event, at, new Date(at.getTime() - 1))).toHaveLength(0);
  });
});
