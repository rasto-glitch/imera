import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import { Segmented } from '@/components/Segmented';
import { addDaysToKey, parseDayKey, todayKey, weekOf, type DayKey } from '@/core/dates';
import { AgendaView } from '@/features/calendar/AgendaView';
import { MonthView } from '@/features/calendar/MonthView';
import { TimeGrid } from '@/features/calendar/TimeGrid';
import { useThemeColors } from '@/theme/hooks';

type CalendarViewKind = 'month' | 'week' | 'day' | 'agenda';

const VIEW_OPTIONS: { value: CalendarViewKind; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
];

function addMonthsToKey(key: DayKey, months: number): DayKey {
  const { year, month0 } = parseDayKey(key);
  const shifted = new Date(year, month0 + months, 1, 12);
  return format(shifted, 'yyyy-MM-dd');
}

export default function CalendarScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [view, setView] = useState<CalendarViewKind>('month');
  const [anchor, setAnchor] = useState<DayKey>(todayKey());

  const { year, month0 } = parseDayKey(anchor);
  const title =
    view === 'day'
      ? format(new Date(year, month0, parseDayKey(anchor).day, 12), 'MMMM d, yyyy')
      : format(new Date(year, month0, 1, 12), 'MMMM yyyy');

  const step = (direction: 1 | -1) => {
    if (view === 'month') setAnchor(addMonthsToKey(anchor, direction));
    else if (view === 'week') setAnchor(addDaysToKey(anchor, direction * 7));
    else setAnchor(addDaysToKey(anchor, direction));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={styles.headerActions}>
          {view !== 'agenda' && (
            <>
              <Pressable hitSlop={8} onPress={() => step(-1)}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Pressable hitSlop={8} onPress={() => setAnchor(todayKey())}>
                <Text style={{ color: colors.accent }}>Today</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => step(1)}>
                <Ionicons name="chevron-forward" size={22} color={colors.text} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={styles.switcher}>
        <Segmented options={VIEW_OPTIONS} value={view} onChange={setView} />
      </View>

      {view === 'month' && (
        <MonthView anchor={anchor} selected={anchor} onSelectDay={setAnchor} />
      )}
      {view === 'week' && <TimeGrid days={weekOf(anchor)} />}
      {view === 'day' && <TimeGrid days={[anchor]} />}
      {view === 'agenda' && <AgendaView />}

      <Pressable
        onPress={() => router.push(`/event/new?date=${anchor}`)}
        style={[styles.fab, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="add" size={28} color={colors.surface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: { fontSize: 20, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  switcher: { paddingHorizontal: 16, paddingVertical: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
