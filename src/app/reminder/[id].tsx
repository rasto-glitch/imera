import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMinutes, format } from 'date-fns';

import {
  dayKeyOf,
  deviceTimeZone,
  inZone,
  parseDayKey,
  startOfDayInZone,
  todayKey,
  type DayKey,
} from '@/core/dates';
import { firstLine } from '@/features/notes/preview';
import { newId } from '@/db/id';
import { useAppStore } from '@/store';
import { useThemeColors } from '@/theme/hooks';

// Standalone reminders only for now: local-notification scheduling and
// event-linked reminders (lead times) arrive with the reminders step of the
// V1 plan.
export default function ReminderEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    fromNote?: string;
    sourceLine?: string;
    title?: string;
    date?: string;
  }>();
  const isNew = params.id === 'new';

  const existing = useAppStore((s) =>
    isNew ? undefined : s.reminders.find((r) => r.id === params.id),
  );
  const upsertReminder = useAppStore((s) => s.upsertReminder);
  const deleteReminder = useAppStore((s) => s.deleteReminder);
  const addNoteLink = useAppStore((s) => s.addNoteLink);
  const deleteNoteLink = useAppStore((s) => s.deleteNoteLink);
  const noteLinks = useAppStore((s) => s.noteLinks);
  const notes = useAppStore((s) => s.notes);

  const timeZone = deviceTimeZone();

  const initial = useMemo(() => {
    if (existing?.at) {
      const wall = inZone(existing.at, timeZone);
      return { day: dayKeyOf(wall), minutes: wall.getHours() * 60 + wall.getMinutes() };
    }
    const day = typeof params.date === 'string' && params.date ? (params.date as DayKey) : todayKey();
    const now = new Date();
    const minutes =
      day === todayKey() ? Math.min(23 * 60, (now.getHours() + 1) * 60) : 9 * 60;
    return { day, minutes };
  }, [existing, params.date, timeZone]);

  const [title, setTitle] = useState(existing?.title ?? (params.title ?? ''));
  const [day, setDay] = useState<DayKey>(initial.day);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const links = existing ? noteLinks.filter((l) => l.targetType === 'reminder' && l.targetId === existing.id) : [];

  const { year, month0, day: dayNum } = parseDayKey(day);
  const pickerDate = new Date(year, month0, dayNum, Math.floor(minutes / 60), minutes % 60);

  const canSave = title.trim().length > 0;

  const save = () => {
    const id = existing?.id ?? newId();
    // Event-linked reminders fire by lead time, not an absolute instant.
    const at = existing?.eventId
      ? existing.at
      : addMinutes(startOfDayInZone(day, timeZone), minutes).toISOString();
    const now = new Date().toISOString();
    upsertReminder({
      id,
      eventId: existing?.eventId ?? null,
      title: title.trim(),
      leadMinutes: existing?.leadMinutes,
      at,
      notificationId: existing?.notificationId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    if (isNew && typeof params.fromNote === 'string' && params.fromNote) {
      addNoteLink({
        id: newId(),
        noteId: params.fromNote,
        targetType: 'reminder',
        targetId: id,
        sourceLine:
          typeof params.sourceLine === 'string' && params.sourceLine !== ''
            ? Number(params.sourceLine)
            : undefined,
        createdAt: now,
      });
    }
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('Delete reminder', 'This removes the reminder.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteReminder(existing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
          {isNew ? 'New reminder' : 'Edit reminder'}
        </Text>
        <Pressable hitSlop={8} onPress={save} disabled={!canSave}>
          <Text style={{ color: canSave ? colors.accent : colors.textMuted, fontSize: 16 }}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Remind me to…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
        />

        {existing?.eventId ? (
          // Event-linked reminders (lead times) are managed on their event.
          <Pressable
            onPress={() => router.replace(`/event/${existing.eventId}`)}
            style={[styles.fieldRow, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textMuted }}>Belongs to an event</Text>
            <Text style={{ color: colors.accent }}>Open event</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() => setShowDatePicker((v) => !v)}
              style={[styles.fieldRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted }}>Date</Text>
              <Text style={{ color: colors.text }}>{format(pickerDate, 'EEE, MMM d, yyyy')}</Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                onChange={(event: DateTimePickerEvent, picked?: Date) => {
                  if (Platform.OS === 'android') setShowDatePicker(false);
                  if (event.type === 'set' && picked) setDay(dayKeyOf(picked));
                }}
              />
            )}

            <Pressable
              onPress={() => setShowTimePicker((v) => !v)}
              style={[styles.fieldRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted }}>Time</Text>
              <Text style={{ color: colors.text }}>{format(pickerDate, 'HH:mm')}</Text>
            </Pressable>
            {showTimePicker && (
              <DateTimePicker
                value={pickerDate}
                mode="time"
                is24Hour
                onChange={(event: DateTimePickerEvent, picked?: Date) => {
                  if (Platform.OS === 'android') setShowTimePicker(false);
                  if (event.type === 'set' && picked)
                    setMinutes(picked.getHours() * 60 + picked.getMinutes());
                }}
              />
            )}
          </>
        )}

        {links.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Linked notes</Text>
            {links.map((link) => {
              const note = notes.find((n) => n.id === link.noteId);
              return (
                <View key={link.id} style={[styles.fieldRow, { borderColor: colors.border }]}>
                  <Pressable
                    style={styles.linkTarget}
                    onPress={() => router.push(`/note/${link.noteId}`)}
                  >
                    <Ionicons name="document-text-outline" size={18} color={colors.accent} />
                    <Text style={{ color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                      {note ? firstLine(note.body) : 'Missing note'}
                    </Text>
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => deleteNoteLink(link.id)}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        {existing && (
          <Pressable onPress={confirmDelete} style={styles.deleteButton}>
            <Text style={{ color: colors.destructive }}>Delete reminder</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  form: { padding: 16, gap: 12, paddingBottom: 48 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  sectionLabel: { fontSize: 13, marginTop: 8 },
  linkTarget: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  deleteButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
});
