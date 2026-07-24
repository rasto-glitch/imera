import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deviceTimeZone, monthGrid, parseDayKey, todayKey, type DayKey } from '@/core/dates';
import { formatOccurrenceTime } from './format';
import { useEventIndex, useOccurrences } from './useOccurrences';
import { useThemeColors } from '@/theme/hooks';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DOTS = 3;

interface MonthViewProps {
  /** Any day inside the visible month. */
  anchor: DayKey;
  selected: DayKey;
  onSelectDay: (key: DayKey) => void;
}

export function MonthView({ anchor, selected, onSelectDay }: MonthViewProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const { year, month0 } = parseDayKey(anchor);
  const grid = monthGrid(year, month0);
  const byDay = useOccurrences(grid[0][0], grid[grid.length - 1][6]);
  const eventIndex = useEventIndex();
  const today = todayKey();

  const selectedOccurrences = byDay.get(selected) ?? [];

  return (
    <View style={styles.root}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={[styles.weekdayLabel, { color: colors.textMuted }]}>
            {label}
          </Text>
        ))}
      </View>

      {grid.map((week, i) => (
        <View key={i} style={styles.weekRow}>
          {week.map((key) => {
            const inMonth = parseDayKey(key).month0 === month0;
            const isToday = key === today;
            const isSelected = key === selected;
            const dots = byDay.get(key) ?? [];
            return (
              <Pressable
                key={key}
                onPress={() => onSelectDay(key)}
                style={[styles.cell, isSelected && { backgroundColor: colors.border }]}
              >
                <View
                  style={[styles.dayBadge, isToday && { backgroundColor: colors.accent }]}
                >
                  <Text
                    style={{
                      color: isToday
                        ? colors.surface
                        : inMonth
                          ? colors.text
                          : colors.textMuted,
                      fontSize: 14,
                    }}
                  >
                    {parseDayKey(key).day}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {dots.slice(0, MAX_DOTS).map((occurrence, d) => (
                    <View key={d} style={[styles.dot, { backgroundColor: colors.accent }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={[styles.dayList, { borderTopColor: colors.border }]}>
        <ScrollView contentContainerStyle={styles.dayListContent}>
          {selectedOccurrences.length === 0 ? (
            <Text style={{ color: colors.textMuted }}>Nothing scheduled.</Text>
          ) : (
            selectedOccurrences.map((occurrence, i) => {
              const event = eventIndex.get(occurrence.eventId);
              if (!event) return null;
              return (
                <Pressable
                  key={`${occurrence.eventId}-${i}`}
                  onPress={() => router.push(`/event/${occurrence.eventId}?occ=${occurrence.key}`)}
                  style={[styles.dayListRow, { borderColor: colors.border }]}
                >
                  <Text style={[styles.dayListTime, { color: colors.textMuted }]}>
                    {formatOccurrenceTime(occurrence, event, selected, deviceTimeZone())}
                  </Text>
                  <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                    {event.title}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  weekdayRow: { flexDirection: 'row', paddingVertical: 6 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
  weekRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    gap: 2,
  },
  dayBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotRow: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  dayList: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  dayListContent: { padding: 16, gap: 8 },
  dayListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  dayListTime: { fontSize: 13, minWidth: 72 },
});
