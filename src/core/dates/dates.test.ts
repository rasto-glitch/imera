import { describe, expect, it } from 'vitest';

import {
  addDaysToKey,
  dayKeyInZone,
  endOfDayInZone,
  eventEnd,
  monthGrid,
  startOfDayInZone,
  weekOf,
} from './index';

/** TZDate.toISOString() keeps the zone offset; normalize to UTC to compare instants. */
const utc = (d: Date) => new Date(d.getTime()).toISOString();

describe('dayKeyInZone', () => {
  it('assigns the same instant to different calendar dates per zone', () => {
    const instant = '2026-07-24T22:30:00Z';
    expect(dayKeyInZone(instant, 'Asia/Baghdad')).toBe('2026-07-25'); // UTC+3
    expect(dayKeyInZone(instant, 'America/New_York')).toBe('2026-07-24'); // UTC-4
  });
});

describe('startOfDayInZone / endOfDayInZone', () => {
  it('maps a day key to the correct instant', () => {
    expect(utc(startOfDayInZone('2026-07-25', 'Asia/Baghdad'))).toBe('2026-07-24T21:00:00.000Z');
    expect(utc(endOfDayInZone('2026-07-25', 'Asia/Baghdad'))).toBe('2026-07-25T21:00:00.000Z');
  });

  it('handles DST-transition days (23h day)', () => {
    // US DST starts 2026-03-08; that day is 23 hours long in New York.
    const start = startOfDayInZone('2026-03-08', 'America/New_York');
    const end = endOfDayInZone('2026-03-08', 'America/New_York');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });
});

describe('addDaysToKey', () => {
  it('crosses month and leap boundaries', () => {
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDaysToKey('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('monthGrid', () => {
  it('covers February 2026 in full Monday-started weeks', () => {
    const grid = monthGrid(2026, 1, 1);
    expect(grid).toHaveLength(5);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0]).toBe('2026-01-26'); // Monday before Sun Feb 1
    expect(grid[4][6]).toBe('2026-03-01'); // Sunday after Sat Feb 28
  });
});

describe('weekOf', () => {
  it('returns the Monday-started week containing the key', () => {
    expect(weekOf('2026-07-24', 1)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });
});

describe('eventEnd', () => {
  it('adds duration for timed events', () => {
    const end = eventEnd({
      start: '2026-07-24T09:00:00+03:00',
      timeZone: 'Asia/Baghdad',
      durationMinutes: 90,
      allDay: false,
    });
    expect(utc(end)).toBe('2026-07-24T07:30:00.000Z');
  });

  it('ends all-day events at the start of the following day', () => {
    const end = eventEnd({
      start: '2026-07-24T00:00:00+03:00',
      timeZone: 'Asia/Baghdad',
      durationMinutes: 0,
      allDay: true,
    });
    expect(utc(end)).toBe('2026-07-24T21:00:00.000Z');
  });
});
