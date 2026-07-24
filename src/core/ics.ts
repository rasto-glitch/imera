// iCalendar (RFC 5545) generation and a tolerant parser for one-time import.
// Platform-free and unit-tested. Mapping notes:
// - Times are written as wall clock with TZID (IANA ids, no VTIMEZONE blocks
//   — every major importer accepts bare IANA TZIDs), so recurring events
//   keep their wall time across DST.
// - skippedDays → EXDATE, movedOccurrences → override VEVENTs carrying
//   RECURRENCE-ID (the same UID), event reminders → VALARM. Export is
//   lossless for everything the model holds except rich-text markup: the
//   DESCRIPTION is the stripped text.

import { addDays, addMinutes, format } from 'date-fns';

import {
  dayKeyOf,
  eventEnd,
  eventStart,
  inZone,
  parseDayKey,
  startOfDayInZone,
  type DayKey,
} from './dates';
import type { ImeraEvent, Recurrence, Reminder, Weekday } from './model/types';

const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const CRLF = '\r\n';

// ---------------------------------------------------------------------------
// Shared

/** Plain text from the rich description HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Generation

export function generateIcs(events: ImeraEvent[], reminders: Reminder[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Imera//Imera//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const leads = reminders
      .filter((r) => r.eventId === event.id && r.leadMinutes !== undefined)
      .map((r) => Math.max(0, r.leadMinutes!));
    pushVevent(lines, event, leads);
    for (const [key, move] of Object.entries(event.movedOccurrences)) {
      pushOverrideVevent(lines, event, key, move.start, leads);
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

function pushVevent(lines: string[], event: ImeraEvent, leads: number[]): void {
  const tz = event.timeZone;
  const start = eventStart(event);
  lines.push('BEGIN:VEVENT', `UID:${event.id}@imera`, `DTSTAMP:${utcStamp(event.updatedAt)}`);

  if (event.allDay) {
    const days = Math.max(1, Math.ceil(event.durationMinutes / 1440));
    lines.push(
      `DTSTART;VALUE=DATE:${dayKeyOf(start).replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${dayKeyOf(addDays(start, days)).replace(/-/g, '')}`,
    );
  } else {
    lines.push(
      `DTSTART;TZID=${tz}:${wallStamp(start)}`,
      `DTEND;TZID=${tz}:${wallStamp(inZone(eventEnd(event), tz))}`,
    );
  }

  const rrule = toRrule(event.recurrence);
  if (rrule) lines.push(rrule);

  for (const skipped of [...event.skippedDays].sort()) {
    if (event.allDay) {
      lines.push(`EXDATE;VALUE=DATE:${skipped.replace(/-/g, '')}`);
    } else {
      lines.push(`EXDATE;TZID=${tz}:${occurrenceWallStamp(event, skipped)}`);
    }
  }

  pushCommonProps(lines, event, leads);
  lines.push('END:VEVENT');
}

function pushOverrideVevent(
  lines: string[],
  event: ImeraEvent,
  originalDay: DayKey,
  movedStartIso: string,
  leads: number[],
): void {
  const tz = event.timeZone;
  const movedStart = inZone(movedStartIso, tz);
  lines.push(
    'BEGIN:VEVENT',
    `UID:${event.id}@imera`,
    `DTSTAMP:${utcStamp(event.updatedAt)}`,
  );
  if (event.allDay) {
    const days = Math.max(1, Math.ceil(event.durationMinutes / 1440));
    lines.push(
      `RECURRENCE-ID;VALUE=DATE:${originalDay.replace(/-/g, '')}`,
      `DTSTART;VALUE=DATE:${dayKeyOf(movedStart).replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${dayKeyOf(addDays(movedStart, days)).replace(/-/g, '')}`,
    );
  } else {
    lines.push(
      `RECURRENCE-ID;TZID=${tz}:${occurrenceWallStamp(event, originalDay)}`,
      `DTSTART;TZID=${tz}:${wallStamp(movedStart)}`,
      `DTEND;TZID=${tz}:${wallStamp(addMinutes(movedStart, event.durationMinutes))}`,
    );
  }
  pushCommonProps(lines, event, leads);
  lines.push('END:VEVENT');
}

function pushCommonProps(lines: string[], event: ImeraEvent, leads: number[]): void {
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) {
    const text = stripHtml(event.description);
    if (text) lines.push(`DESCRIPTION:${escapeText(text)}`);
  }
  if (event.location?.text) lines.push(`LOCATION:${escapeText(event.location.text)}`);
  if (event.location?.mapsUrl) lines.push(`URL:${event.location.mapsUrl}`);
  for (const lead of leads) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      `TRIGGER:${lead === 0 ? 'PT0S' : `-PT${lead}M`}`,
      'END:VALARM',
    );
  }
}

function toRrule(recurrence: Recurrence): string | null {
  if (recurrence.kind === 'none') return null;
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[
    recurrence.kind
  ];
  const parts = [`FREQ=${freq}`];
  if (recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.kind === 'weekly' && recurrence.weekdays.length > 0) {
    const days = [...new Set(recurrence.weekdays)]
      .sort((a, b) => a - b)
      .map((w) => BYDAY_CODES[w]);
    parts.push(`BYDAY=${days.join(',')}`);
  }
  return `RRULE:${parts.join(';')}`;
}

/** Wall-clock stamp of the series time on a given occurrence day. */
function occurrenceWallStamp(event: ImeraEvent, day: DayKey): string {
  const base = eventStart(event);
  const minutes = base.getHours() * 60 + base.getMinutes();
  return `${day.replace(/-/g, '')}T${two(Math.floor(minutes / 60))}${two(minutes % 60)}00`;
}

function wallStamp(wall: Date): string {
  return format(wall, "yyyyMMdd'T'HHmmss");
}

function utcStamp(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}` +
    `T${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`
  );
}

function two(n: number): string {
  return String(n).padStart(2, '0');
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets (approximated as characters). */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) chunks.push(rest);
  return chunks.join(`${CRLF} `);
}

// ---------------------------------------------------------------------------
// Parsing

export interface ImportedEvent {
  event: Omit<ImeraEvent, 'id' | 'createdAt' | 'updatedAt'>;
  /** Lead minutes from VALARMs, for creating event reminders. */
  leads: number[];
}

interface IcsProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface VeventBlock {
  props: IcsProp[];
  alarmTriggers: string[];
}

/**
 * Parse an .ics payload into importable events. Tolerant by design: events it
 * cannot make sense of are skipped and counted, not fatal.
 */
export function parseIcs(
  text: string,
  defaultTimeZone: string,
): { events: ImportedEvent[]; skipped: number } {
  const blocks = collectVevents(text);
  const masters = new Map<string, ImportedEvent>();
  const overrides: { uid: string; block: VeventBlock }[] = [];
  let skipped = 0;

  for (const block of blocks) {
    const uid = findProp(block, 'UID')?.value ?? `imported-${Math.random()}`;
    if (findProp(block, 'RECURRENCE-ID')) {
      overrides.push({ uid, block });
      continue;
    }
    const imported = blockToEvent(block, defaultTimeZone);
    if (!imported) {
      skipped++;
      continue;
    }
    masters.set(uid, imported);
  }

  for (const { uid, block } of overrides) {
    const master = masters.get(uid);
    if (!master) {
      skipped++;
      continue;
    }
    const recurrenceId = findProp(block, 'RECURRENCE-ID')!;
    const dtstart = findProp(block, 'DTSTART');
    const originalDay = datePartOf(recurrenceId, master.event.timeZone, defaultTimeZone);
    const movedStart = dtstart
      ? startInstantOf(dtstart, defaultTimeZone)?.iso
      : undefined;
    if (!originalDay || !movedStart) {
      skipped++;
      continue;
    }
    master.event.movedOccurrences[originalDay] = { start: movedStart };
  }

  return { events: [...masters.values()], skipped };
}

function collectVevents(text: string): VeventBlock[] {
  // Unfold continuations, then walk BEGIN/END pairs.
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const blocks: VeventBlock[] = [];
  let current: VeventBlock | null = null;
  let inAlarm = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') {
      current = { props: [], alarmTriggers: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    if (line === 'BEGIN:VALARM') {
      inAlarm = true;
      continue;
    }
    if (line === 'END:VALARM') {
      inAlarm = false;
      continue;
    }
    const prop = parseProp(line);
    if (!prop) continue;
    if (inAlarm) {
      if (prop.name === 'TRIGGER') current.alarmTriggers.push(prop.value);
    } else {
      current.props.push(prop);
    }
  }
  return blocks;
}

function parseProp(line: string): IcsProp | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

function findProp(block: VeventBlock, name: string): IcsProp | undefined {
  return block.props.find((p) => p.name === name);
}

function blockToEvent(block: VeventBlock, defaultTz: string): ImportedEvent | null {
  const dtstart = findProp(block, 'DTSTART');
  if (!dtstart) return null;
  const start = startInstantOf(dtstart, defaultTz);
  if (!start) return null;

  const allDay = dtstart.params.VALUE === 'DATE';
  const durationMinutes = resolveDuration(block, start, allDay, defaultTz);
  if (durationMinutes === null) return null;

  const summary = findProp(block, 'SUMMARY')?.value;
  const description = findProp(block, 'DESCRIPTION')?.value;
  const location = findProp(block, 'LOCATION')?.value;
  const url = findProp(block, 'URL')?.value;

  const skippedDays: string[] = [];
  for (const prop of block.props.filter((p) => p.name === 'EXDATE')) {
    for (const value of prop.value.split(',')) {
      const day = rawDatePart(value);
      if (day) skippedDays.push(day);
    }
  }

  return {
    event: {
      title: summary ? unescapeText(summary) : 'Untitled',
      start: start.iso,
      durationMinutes,
      allDay,
      timeZone: start.timeZone,
      description: description ? unescapeText(description) : undefined,
      notes: undefined,
      phones: [],
      location: location
        ? { text: unescapeText(location), mapsUrl: url || undefined }
        : undefined,
      recurrence: parseRrule(findProp(block, 'RRULE')?.value),
      skippedDays,
      movedOccurrences: {},
      deviceCalendarEventId: undefined,
    },
    leads: block.alarmTriggers
      .map(parseTrigger)
      .filter((lead): lead is number => lead !== null),
  };
}

function startInstantOf(
  prop: IcsProp,
  defaultTz: string,
): { iso: string; timeZone: string } | null {
  const value = prop.value.trim();
  if (prop.params.VALUE === 'DATE') {
    const day = rawDatePart(value);
    if (!day) return null;
    const tz = prop.params.TZID ?? defaultTz;
    return { iso: startOfDayInZone(day, tz).toISOString(), timeZone: tz };
  }
  const match = value.match(/^(\d{8})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const day = rawDatePart(match[1])!;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  const seconds = Number(match[4]);
  if (match[5] === 'Z') {
    const { year, month0, day: d } = parseDayKey(day);
    const instant = new Date(
      Date.UTC(year, month0, d, Math.floor(minutes / 60), minutes % 60, seconds),
    );
    return { iso: instant.toISOString(), timeZone: 'UTC' };
  }
  const tz = prop.params.TZID ?? defaultTz;
  const instant = addMinutes(startOfDayInZone(day, tz), minutes);
  return { iso: instant.toISOString(), timeZone: tz };
}

function resolveDuration(
  block: VeventBlock,
  start: { iso: string },
  allDay: boolean,
  defaultTz: string,
): number | null {
  const dtend = findProp(block, 'DTEND');
  if (dtend) {
    const end = startInstantOf(dtend, defaultTz);
    if (!end) return null;
    const minutes = Math.round(
      (new Date(end.iso).getTime() - new Date(start.iso).getTime()) / 60_000,
    );
    return Math.max(allDay ? 1440 : 5, minutes);
  }
  const duration = findProp(block, 'DURATION')?.value;
  if (duration) {
    const parsed = parseDuration(duration);
    if (parsed !== null) return Math.max(allDay ? 1440 : 5, parsed);
  }
  return allDay ? 1440 : 60;
}

/** P1D / PT2H30M / PT45M → minutes. */
function parseDuration(value: string): number | null {
  const match = value.match(/^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, d, h, m, s] = match;
  return (
    (Number(d) || 0) * 1440 +
    (Number(h) || 0) * 60 +
    (Number(m) || 0) +
    Math.round((Number(s) || 0) / 60)
  );
}

/** -PT30M / -PT1H / -P1D → lead minutes; positive/zero triggers → 0. */
function parseTrigger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('-')) return trimmed.startsWith('P') || trimmed.startsWith('PT') ? 0 : null;
  const minutes = parseDuration(trimmed.slice(1));
  return minutes === null ? null : minutes;
}

function parseRrule(value: string | undefined): Recurrence {
  if (!value) return { kind: 'none' };
  const parts: Record<string, string> = {};
  for (const piece of value.split(';')) {
    const eq = piece.indexOf('=');
    if (eq !== -1) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1);
  }
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  switch (parts.FREQ) {
    case 'DAILY':
      return { kind: 'daily', interval };
    case 'WEEKLY': {
      const weekdays = (parts.BYDAY ?? '')
        .split(',')
        .map((code) => BYDAY_CODES.indexOf(code.trim() as (typeof BYDAY_CODES)[number]))
        .filter((i) => i !== -1) as Weekday[];
      return { kind: 'weekly', interval, weekdays };
    }
    case 'MONTHLY':
      return { kind: 'monthly', interval };
    case 'YEARLY':
      return { kind: 'yearly', interval };
    default:
      return { kind: 'none' };
  }
}

function datePartOf(prop: IcsProp, eventTz: string, defaultTz: string): DayKey | null {
  const raw = rawDatePart(prop.value);
  if (!raw) return null;
  // A Z-form RECURRENCE-ID names an instant; convert to the event's day.
  if (/T\d{6}Z$/.test(prop.value.trim())) {
    const instant = startInstantOf(prop, defaultTz);
    return instant ? dayKeyOf(inZone(instant.iso, eventTz)) : null;
  }
  return raw;
}

function rawDatePart(value: string): DayKey | null {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
