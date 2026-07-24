import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';

import { deviceTimeZone, inZone } from '@/core/dates';
import { formatLead } from '@/features/reminders/format';
import { useAppStore } from '@/store';
import { useThemeColors } from '@/theme/hooks';

export default function RemindersScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const reminders = useAppStore((s) => s.reminders);
  const events = useAppStore((s) => s.events);
  const [notificationsGranted, setNotificationsGranted] = useState(true);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setNotificationsGranted(p.granted));
  }, [reminders.length]);

  const eventIndex = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const sorted = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (!a.at && !b.at) return a.createdAt.localeCompare(b.createdAt);
        if (!a.at) return 1;
        if (!b.at) return -1;
        return a.at.localeCompare(b.at);
      }),
    [reminders],
  );

  const now = Date.now();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {!notificationsGranted && reminders.length > 0 && (
        <Pressable
          onPress={() => Linking.openSettings()}
          style={[styles.banner, { borderColor: colors.destructive }]}
        >
          <Text style={{ color: colors.destructive, fontSize: 13 }}>
            Notifications are off, so reminders won't fire. Tap to open settings.
          </Text>
        </Pressable>
      )}

      {sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textMuted }}>
            Nothing to remember yet. Reminders made from notes and events show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(reminder) => reminder.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: reminder }) => {
            const event = reminder.eventId ? eventIndex.get(reminder.eventId) : undefined;
            const past = reminder.at ? new Date(reminder.at).getTime() < now : false;
            return (
              <Pressable
                onPress={() =>
                  event
                    ? router.push(`/event/${event.id}`)
                    : router.push(`/reminder/${reminder.id}`)
                }
                style={[styles.row, { borderColor: colors.border }]}
              >
                <Ionicons
                  name={event ? 'calendar-outline' : 'alarm-outline'}
                  size={20}
                  color={past ? colors.textMuted : colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: past ? colors.textMuted : colors.text }}
                    numberOfLines={1}
                  >
                    {event?.title ?? reminder.title}
                  </Text>
                  {event ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {formatLead(reminder.leadMinutes ?? 0)}
                    </Text>
                  ) : reminder.at ? (
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {format(inZone(reminder.at, deviceTimeZone()), 'EEE, MMM d, yyyy HH:mm')}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Pressable
        onPress={() => router.push('/reminder/new')}
        style={[styles.fab, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="add" size={28} color={colors.surface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 8, paddingBottom: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
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
