import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  deviceTimeZone,
  parseDayKey,
  startOfDayInZone,
  todayKey,
  type DayKey,
} from '@/core/dates';
import type { Occurrence } from '@/core/recurrence';
import { useThemeColors } from '@/theme/hooks';
import { layoutDayColumn } from './layout';
import { useEventIndex, useOccurrences } from './useOccurrences';

const HOUR_HEIGHT = 56;
const GUTTER_WIDTH = 44;
const MIN_BLOCK_MINUTES = 20;

interface TimeGridProps {
  /** One day key per column: [day] for the day view, seven for the week view. */
  days: DayKey[];
}

/** Shared scrollable 24-hour grid for the week and day views. */
export function TimeGrid({ days }: TimeGridProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const timeZone = deviceTimeZone();
  const byDay = useOccurrences(days[0], days[days.length - 1]);
  const eventIndex = useEventIndex();
  const today = todayKey();

  // Timed occurrences per column, with minutes relative to that column's day.
  const columns = useMemo(
    () =>
      days.map((day) => {
        const dayStartMs = startOfDayInZone(day, timeZone).getTime();
        const timed = (byDay.get(day) ?? []).filter(
          (o) => !eventIndex.get(o.eventId)?.allDay,
        );
        const boxes = timed.map((occurrence) => ({
          startMin: Math.max(0, (occurrence.start.getTime() - dayStartMs) / 60_000),
          endMin: Math.min(1440, (occurrence.end.getTime() - dayStartMs) / 60_000),
        }));
        return { day, timed, boxes, layout: layoutDayColumn(boxes) };
      }),
    [days, byDay, eventIndex, timeZone],
  );

  const allDayRows = days.map((day) => ({
    day,
    occurrences: (byDay.get(day) ?? []).filter((o) => eventIndex.get(o.eventId)?.allDay),
  }));
  const hasAllDay = allDayRows.some((r) => r.occurrences.length > 0);

  const now = new Date();
  const nowKey = todayKey();
  const nowMin = (now.getTime() - startOfDayInZone(nowKey, timeZone).getTime()) / 60_000;

  return (
    <View style={styles.root}>
      {days.length > 1 && <WeekHeader days={days} today={today} />}
      {hasAllDay && (
        <View style={[styles.allDayRow, { borderBottomColor: colors.border }]}>
          <View style={{ width: GUTTER_WIDTH }} />
          {allDayRows.map(({ day, occurrences }) => (
            <View key={day} style={styles.allDayCell}>
              {occurrences.map((occurrence, i) => (
                <Pressable
                  key={`${occurrence.eventId}-${i}`}
                  onPress={() => router.push(`/event/${occurrence.eventId}?occ=${occurrence.key}`)}
                  style={[styles.allDayChip, { backgroundColor: colors.accent }]}
                >
                  <Text style={{ color: colors.surface, fontSize: 11 }} numberOfLines={1}>
                    {eventIndex.get(occurrence.eventId)?.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}

      <ScrollView contentOffset={{ x: 0, y: 8 * HOUR_HEIGHT }}>
        <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row' }}>
          <View style={{ width: GUTTER_WIDTH }}>
            {Array.from({ length: 23 }, (_, h) => (
              <Text
                key={h}
                style={[
                  styles.hourLabel,
                  { top: (h + 1) * HOUR_HEIGHT - 7, color: colors.textMuted },
                ]}
              >
                {String(h + 1).padStart(2, '0')}:00
              </Text>
            ))}
          </View>

          {columns.map(({ day, timed, boxes, layout }, columnIndex) => (
            <View
              key={day}
              style={[
                styles.column,
                { borderLeftColor: colors.border },
                columnIndex === 0 && { borderLeftWidth: 0 },
              ]}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <View
                  key={h}
                  style={[styles.hourLine, { top: h * HOUR_HEIGHT, borderTopColor: colors.border }]}
                />
              ))}

              {timed.map((occurrence, i) => (
                <EventBlock
                  key={`${occurrence.eventId}-${i}`}
                  occurrence={occurrence}
                  title={eventIndex.get(occurrence.eventId)?.title ?? ''}
                  box={boxes[i]}
                  lane={layout[i]}
                  compact={days.length > 1}
                />
              ))}

              {day === nowKey && (
                <View
                  style={[styles.nowLine, { top: (nowMin / 60) * HOUR_HEIGHT, backgroundColor: colors.accent }]}
                />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function WeekHeader({ days, today }: { days: DayKey[]; today: DayKey }) {
  const colors = useThemeColors();
  return (
    <View style={styles.weekHeader}>
      <View style={{ width: GUTTER_WIDTH }} />
      {days.map((day) => {
        const isToday = day === today;
        const { year, month0, day: dayNum } = parseDayKey(day);
        const weekday = new Date(year, month0, dayNum, 12).getDay();
        return (
          <View key={day} style={styles.weekHeaderCell}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]}
            </Text>
            <View style={[styles.weekHeaderBadge, isToday && { backgroundColor: colors.accent }]}>
              <Text style={{ color: isToday ? colors.surface : colors.text, fontSize: 14 }}>
                {dayNum}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function EventBlock({
  occurrence,
  title,
  box,
  lane,
  compact,
}: {
  occurrence: Occurrence;
  title: string;
  box: { startMin: number; endMin: number };
  lane: { lane: number; laneCount: number };
  compact: boolean;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const heightMin = Math.max(box.endMin - box.startMin, MIN_BLOCK_MINUTES);
  const widthPct = 100 / lane.laneCount;
  return (
    <Pressable
      onPress={() => router.push(`/event/${occurrence.eventId}?occ=${occurrence.key}`)}
      style={[
        styles.block,
        {
          top: (box.startMin / 60) * HOUR_HEIGHT,
          height: (heightMin / 60) * HOUR_HEIGHT - 2,
          left: `${lane.lane * widthPct}%`,
          width: `${widthPct}%`,
          backgroundColor: colors.accent,
        },
      ]}
    >
      <Text
        style={{ color: colors.surface, fontSize: compact ? 10 : 13 }}
        numberOfLines={compact ? 3 : 2}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  weekHeader: { flexDirection: 'row', paddingVertical: 6 },
  weekHeaderCell: { flex: 1, alignItems: 'center', gap: 2 },
  weekHeaderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 4,
  },
  allDayCell: { flex: 1, gap: 2, paddingHorizontal: 1 },
  allDayChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  hourLabel: { position: 'absolute', right: 6, fontSize: 10 },
  column: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  block: {
    position: 'absolute',
    borderRadius: 6,
    padding: 4,
    overflow: 'hidden',
  },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2 },
});
