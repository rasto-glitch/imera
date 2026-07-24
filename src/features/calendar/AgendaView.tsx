import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import { addDaysToKey, deviceTimeZone, parseDayKey, todayKey, type DayKey } from '@/core/dates';
import type { Occurrence } from '@/core/recurrence';
import { useThemeColors } from '@/theme/hooks';
import { formatOccurrenceTime } from './format';
import { useEventIndex, useOccurrences } from './useOccurrences';

const AGENDA_DAYS = 90;

type Row =
  | { kind: 'header'; day: DayKey }
  | { kind: 'occurrence'; day: DayKey; occurrence: Occurrence };

/** Chronological list of the next 90 days, days with events only. */
export function AgendaView() {
  const colors = useThemeColors();
  const router = useRouter();
  const from = todayKey();
  const to = addDaysToKey(from, AGENDA_DAYS - 1);
  const byDay = useOccurrences(from, to);
  const eventIndex = useEventIndex();

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (let day = from; day <= to; day = addDaysToKey(day, 1)) {
      const occurrences = byDay.get(day);
      if (!occurrences?.length) continue;
      out.push({ kind: 'header', day });
      for (const occurrence of occurrences) out.push({ kind: 'occurrence', day, occurrence });
    }
    return out;
  }, [byDay, from, to]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ color: colors.textMuted }}>
          Nothing scheduled in the next {AGENDA_DAYS} days.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row, i) =>
        row.kind === 'header' ? row.day : `${row.day}-${row.occurrence.eventId}-${i}`
      }
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        if (item.kind === 'header') {
          const { year, month0, day } = parseDayKey(item.day);
          const label = format(new Date(year, month0, day, 12), 'EEEE, MMMM d');
          const isToday = item.day === todayKey();
          return (
            <Text style={[styles.header, { color: isToday ? colors.accent : colors.textMuted }]}>
              {isToday ? 'Today' : label}
            </Text>
          );
        }
        const event = eventIndex.get(item.occurrence.eventId);
        if (!event) return null;
        return (
          <Pressable
            onPress={() => router.push(`/event/${event.id}?occ=${item.occurrence.key}`)}
            style={[styles.row, { borderColor: colors.border }]}
          >
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatOccurrenceTime(item.occurrence, event, item.day, deviceTimeZone())}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text }} numberOfLines={1}>
                {event.title}
              </Text>
              {event.location?.text ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {event.location.text}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 8 },
  header: { fontSize: 13, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  time: { fontSize: 13, minWidth: 88 },
});
