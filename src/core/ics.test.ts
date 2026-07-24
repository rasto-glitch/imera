import { describe, expect, it } from 'vitest';

import { generateIcs, parseIcs, stripHtml } from './ics';
import type { ImeraEvent, Reminder } from './model/types';

const TZ = 'Asia/Baghdad';

function makeEvent(overrides: Partial<ImeraEvent> & Pick<ImeraEvent, 'id' | 'start'>): ImeraEvent {
  return {
    title: 'Gym',
    durationMinutes: 60,
    allDay: false,
    timeZone: TZ,
    phones: [],
    recurrence: { kind: 'none' },
    skippedDays: [],
    movedOccurrences: {},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const gym = makeEvent({
  id: 'gym-1',
  start: '2026-01-05T18:00:00+03:00',
  recurrence: { kind: 'weekly', interval: 1, weekdays: [1, 3] },
  skippedDays: ['2026-01-12'],
  movedOccurrences: { '2026-01-19': { start: '2026-01-20T19:00:00+03:00' } },
  description: '<p>Leg day, <b>heavy</b></p>',
  location: { text: 'City gym, hall 2', mapsUrl: 'https://maps.example/x' },
});

const lead30: Reminder = {
  id: 'r1',
  eventId: 'gym-1',
  title: 'Gym',
  leadMinutes: 30,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('stripHtml', () => {
  it('flattens tags, lists, and entities', () => {
    expect(stripHtml('<p>One &amp; two</p><ul><li>a</li><li>b</li></ul>')).toBe(
      'One & two\n• a\n• b',
    );
  });
});

describe('generateIcs', () => {
  const ics = generateIcs([gym], [lead30]);
  const unfolded = ics.replace(/\r\n[ \t]/g, '');

  it('emits wall-clock times with TZID and the recurrence rule', () => {
    expect(unfolded).toContain(`DTSTART;TZID=${TZ}:20260105T180000`);
    expect(unfolded).toContain(`DTEND;TZID=${TZ}:20260105T190000`);
    expect(unfolded).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
  });

  it('emits EXDATE for skips and an override VEVENT for moves', () => {
    expect(unfolded).toContain(`EXDATE;TZID=${TZ}:20260112T180000`);
    expect(unfolded).toContain(`RECURRENCE-ID;TZID=${TZ}:20260119T180000`);
    expect(unfolded).toContain(`DTSTART;TZID=${TZ}:20260120T190000`);
    expect((unfolded.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect((unfolded.match(/UID:gym-1@imera/g) ?? []).length).toBe(2);
  });

  it('emits VALARM, escaped text, and stripped description', () => {
    expect(unfolded).toContain('TRIGGER:-PT30M');
    expect(unfolded).toContain('LOCATION:City gym\\, hall 2');
    expect(unfolded).toContain('DESCRIPTION:Leg day\\, heavy');
  });

  it('keeps every physical line within 75 characters plus CRLF', () => {
    for (const line of ics.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it('writes all-day events as VALUE=DATE spans', () => {
    const trip = makeEvent({
      id: 'trip',
      start: '2026-02-01T00:00:00+03:00',
      allDay: true,
      durationMinutes: 2 * 1440,
    });
    const out = generateIcs([trip], []);
    expect(out).toContain('DTSTART;VALUE=DATE:20260201');
    expect(out).toContain('DTEND;VALUE=DATE:20260203');
  });
});

describe('parseIcs round-trip', () => {
  it('recovers the event, exceptions, and alarms from our own export', () => {
    const { events, skipped } = parseIcs(generateIcs([gym], [lead30]), 'America/New_York');
    expect(skipped).toBe(0);
    expect(events).toHaveLength(1);
    const [imported] = events;

    expect(imported.event.title).toBe('Gym');
    expect(imported.event.timeZone).toBe(TZ);
    expect(imported.event.allDay).toBe(false);
    expect(imported.event.durationMinutes).toBe(60);
    expect(new Date(imported.event.start).toISOString()).toBe('2026-01-05T15:00:00.000Z');
    expect(imported.event.recurrence).toEqual({ kind: 'weekly', interval: 1, weekdays: [1, 3] });
    expect(imported.event.skippedDays).toEqual(['2026-01-12']);
    expect(Object.keys(imported.event.movedOccurrences)).toEqual(['2026-01-19']);
    expect(new Date(imported.event.movedOccurrences['2026-01-19'].start).toISOString()).toBe(
      '2026-01-20T16:00:00.000Z',
    );
    expect(imported.event.location).toEqual({
      text: 'City gym, hall 2',
      mapsUrl: 'https://maps.example/x',
    });
    expect(imported.event.description).toBe('Leg day, heavy');
    expect(imported.leads).toEqual([30]);
  });
});

describe('parseIcs on foreign input', () => {
  it('parses a Google-style UTC event with DTEND', () => {
    const foreign = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc123@google.com',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20260710T130000Z',
      'DTEND:20260710T143000Z',
      'SUMMARY:Flight to Erbil',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const { events, skipped } = parseIcs(foreign, TZ);
    expect(skipped).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0].event.title).toBe('Flight to Erbil');
    expect(events[0].event.timeZone).toBe('UTC');
    expect(new Date(events[0].event.start).toISOString()).toBe('2026-07-10T13:00:00.000Z');
    expect(events[0].event.durationMinutes).toBe(90);
    expect(events[0].event.recurrence).toEqual({ kind: 'none' });
  });

  it('skips garbage events without failing the import', () => {
    const mixed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:ok@x',
      'DTSTART:20260710T130000Z',
      'SUMMARY:Fine',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:broken@x',
      'SUMMARY:No start',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const { events, skipped } = parseIcs(mixed, TZ);
    expect(events).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('unfolds folded lines', () => {
    const folded = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:fold@x',
      'DTSTART:20260710T130000Z',
      // The continuation's first space is the fold marker; the space between
      // words rides at the end of the first chunk.
      'SUMMARY:A rather long title that has been ',
      ' folded across two lines',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const { events } = parseIcs(folded, TZ);
    expect(events[0].event.title).toBe('A rather long title that has been folded across two lines');
  });
});
