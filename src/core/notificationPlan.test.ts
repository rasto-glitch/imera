import { describe, expect, it } from 'vitest';

import type { ImeraEvent, Reminder } from './model/types';
import { planNotifications } from './notificationPlan';

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

function makeReminder(overrides: Partial<Reminder> & Pick<Reminder, 'id'>): Reminder {
  return {
    eventId: null,
    title: 'Standalone',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const now = new Date('2026-01-05T00:00:00+03:00');
const horizon = new Date('2026-02-04T00:00:00+03:00');

describe('standalone reminders', () => {
  it('plans future ones and drops past ones', () => {
    const reminders = [
      makeReminder({ id: 'r1', at: '2026-01-06T10:00:00+03:00' }),
      makeReminder({ id: 'r2', at: '2026-01-04T10:00:00+03:00' }),
    ];
    const plan = planNotifications([], reminders, now, horizon, TZ);
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe('Standalone');
    expect(plan[0].url).toBe('/reminder/r1');
    expect(plan[0].fireAt.toISOString()).toBe('2026-01-06T07:00:00.000Z');
  });
});

describe('event reminders', () => {
  // Gym every Monday 18:00 Baghdad; 2026-01-05 is a Monday.
  const gym = makeEvent({
    id: 'gym',
    start: '2026-01-05T18:00:00+03:00',
    recurrence: { kind: 'weekly', interval: 1, weekdays: [1] },
  });
  const lead30 = makeReminder({ id: 'lead', eventId: 'gym', leadMinutes: 30 });

  it('fires lead minutes before each upcoming occurrence', () => {
    const plan = planNotifications([gym], [lead30], now, horizon, TZ);
    expect(plan.map((p) => p.fireAt.toISOString())).toEqual([
      '2026-01-05T14:30:00.000Z', // 17:30 Baghdad
      '2026-01-12T14:30:00.000Z',
      '2026-01-19T14:30:00.000Z',
      '2026-01-26T14:30:00.000Z',
      '2026-02-02T14:30:00.000Z',
    ]);
    expect(plan[0].title).toBe('Gym');
    expect(plan[0].body).toBe('Starts at 18:00');
    expect(plan[0].url).toBe('/event/gym?occ=2026-01-05');
  });

  it('honors skips and moves', () => {
    const withExceptions = {
      ...gym,
      skippedDays: ['2026-01-12'],
      movedOccurrences: { '2026-01-19': { start: '2026-01-20T19:00:00+03:00' } },
    };
    const plan = planNotifications([withExceptions], [lead30], now, horizon, TZ);
    expect(plan.map((p) => `${p.url} ${p.fireAt.toISOString()}`)).toEqual([
      '/event/gym?occ=2026-01-05 2026-01-05T14:30:00.000Z',
      '/event/gym?occ=2026-01-19 2026-01-20T15:30:00.000Z', // moved Tue 18:30 fire
      '/event/gym?occ=2026-01-26 2026-01-26T14:30:00.000Z',
      '/event/gym?occ=2026-02-02 2026-02-02T14:30:00.000Z',
    ]);
  });

  it('drops fire times that already passed even when the event has not started', () => {
    const soon = makeEvent({ id: 'soon', start: '2026-01-05T00:10:00+03:00' });
    const bigLead = makeReminder({ id: 'r', eventId: 'soon', leadMinutes: 30 });
    expect(planNotifications([soon], [bigLead], now, horizon, TZ)).toHaveLength(0);
  });

  it('labels cross-day fires with the start date', () => {
    const event = makeEvent({ id: 'e', start: '2026-01-10T09:00:00+03:00' });
    const dayBefore = makeReminder({ id: 'r', eventId: 'e', leadMinutes: 1440 });
    const plan = planNotifications([event], [dayBefore], now, horizon, TZ);
    expect(plan).toHaveLength(1);
    expect(plan[0].body).toBe('Starts Sat, Jan 10 at 09:00');
  });

  it('caps the plan at the soonest max entries', () => {
    const daily = makeEvent({
      id: 'daily',
      start: '2026-01-01T08:00:00+03:00',
      recurrence: { kind: 'daily', interval: 1 },
    });
    const lead = makeReminder({ id: 'r', eventId: 'daily', leadMinutes: 10 });
    const plan = planNotifications([daily], [lead], now, horizon, TZ, 5);
    expect(plan).toHaveLength(5);
    expect(plan[0].fireAt.toISOString()).toBe('2026-01-05T04:50:00.000Z');
    expect(plan[4].fireAt.toISOString()).toBe('2026-01-09T04:50:00.000Z');
  });
});
