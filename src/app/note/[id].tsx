import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';

import { dayKeyOf, parseDayKey, todayKey, type DayKey } from '@/core/dates';
import { firstLine, lineAt } from '@/features/notes/preview';
import { newId } from '@/db/id';
import { useAppStore } from '@/store';
import { noteSerif } from '@/theme';
import { useThemeColors } from '@/theme/hooks';

export default function NoteEditorScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';

  const existing = useAppStore((s) => (isNew ? undefined : s.notes.find((n) => n.id === params.id)));
  const upsertNote = useAppStore((s) => s.upsertNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const deleteNoteLink = useAppStore((s) => s.deleteNoteLink);
  const noteLinks = useAppStore((s) => s.noteLinks);
  const events = useAppStore((s) => s.events);
  const reminders = useAppStore((s) => s.reminders);

  const [body, setBody] = useState(existing?.body ?? '');
  const [date, setDate] = useState<DayKey | null>(existing?.date ?? null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // The note id once persisted — conversion saves first so the link has a row
  // to point at.
  const savedIdRef = useRef<string | null>(existing?.id ?? null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const links = savedIdRef.current
    ? noteLinks.filter((l) => l.noteId === savedIdRef.current)
    : [];

  const persist = (): string => {
    const id = savedIdRef.current ?? newId();
    savedIdRef.current = id;
    const now = new Date().toISOString();
    upsertNote({
      id,
      body,
      date,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    return id;
  };

  const canSave = body.trim().length > 0;

  const save = () => {
    persist();
    router.back();
  };

  const convert = (target: 'event' | 'reminder') => {
    const noteId = persist();
    const { start, end } = selectionRef.current;
    const selected = start !== end ? body.slice(start, end) : '';
    const chosen = selected.trim().length > 0 ? selected : body;
    const sourceLine = selected.trim().length > 0 ? lineAt(body, start) : undefined;
    const title = firstLine(chosen).slice(0, 120);

    // Built by hand — React Native's URLSearchParams has been a stub in some
    // versions.
    const parts = [`fromNote=${encodeURIComponent(noteId)}`, `title=${encodeURIComponent(title)}`];
    if (sourceLine !== undefined) parts.push(`sourceLine=${sourceLine}`);
    if (date) parts.push(`date=${date}`);
    router.push(`/${target}/new?${parts.join('&')}`);
  };

  const confirmDelete = () => {
    if (!savedIdRef.current) return;
    Alert.alert('Delete note', 'Linked events and reminders stay; only the note goes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteNote(savedIdRef.current!);
          router.back();
        },
      },
    ]);
  };

  const dateLabel = (() => {
    if (!date) return null;
    const { year, month0, day } = parseDayKey(date);
    return format(new Date(year, month0, day, 12), 'EEE, MMM d, yyyy');
  })();

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
          {isNew ? 'New note' : 'Edit note'}
        </Text>
        <Pressable hitSlop={8} onPress={save} disabled={!canSave}>
          <Text style={{ color: canSave ? colors.accent : colors.textMuted, fontSize: 16 }}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <TextInput
          value={body}
          onChangeText={setBody}
          onSelectionChange={(e) => {
            selectionRef.current = e.nativeEvent.selection;
          }}
          multiline
          autoFocus={isNew}
          placeholder="Write it down"
          placeholderTextColor={colors.textMuted}
          style={[
            styles.body,
            { borderColor: colors.border, color: colors.text, fontFamily: noteSerif },
          ]}
        />

        <View style={styles.switchRow}>
          <Text style={{ color: colors.text }}>Attach to a date</Text>
          <Switch
            value={date !== null}
            onValueChange={(on) => setDate(on ? todayKey() : null)}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.surface}
          />
        </View>
        {date && (
          <Pressable
            onPress={() => setShowDatePicker((v) => !v)}
            style={[styles.fieldRow, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.textMuted }}>Date</Text>
            <Text style={{ color: colors.text }}>{dateLabel}</Text>
          </Pressable>
        )}
        {date && showDatePicker && (
          <DateTimePicker
            value={(() => {
              const { year, month0, day } = parseDayKey(date);
              return new Date(year, month0, day, 12);
            })()}
            mode="date"
            onChange={(event: DateTimePickerEvent, picked?: Date) => {
              if (Platform.OS === 'android') setShowDatePicker(false);
              if (event.type === 'set' && picked) setDate(dayKeyOf(picked));
            }}
          />
        )}

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Turn into</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Uses the selected text, or the whole note when nothing is selected.
        </Text>
        <View style={styles.convertRow}>
          <Pressable
            onPress={() => convert('event')}
            disabled={!canSave}
            style={[styles.convertButton, { borderColor: canSave ? colors.accent : colors.border }]}
          >
            <Ionicons name="calendar-outline" size={18} color={canSave ? colors.accent : colors.textMuted} />
            <Text style={{ color: canSave ? colors.accent : colors.textMuted }}>Event</Text>
          </Pressable>
          <Pressable
            onPress={() => convert('reminder')}
            disabled={!canSave}
            style={[styles.convertButton, { borderColor: canSave ? colors.accent : colors.border }]}
          >
            <Ionicons name="alarm-outline" size={18} color={canSave ? colors.accent : colors.textMuted} />
            <Text style={{ color: canSave ? colors.accent : colors.textMuted }}>Reminder</Text>
          </Pressable>
        </View>

        {links.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Linked</Text>
            {links.map((link) => {
              const target =
                link.targetType === 'event'
                  ? events.find((e) => e.id === link.targetId)
                  : reminders.find((r) => r.id === link.targetId);
              return (
                <View key={link.id} style={[styles.fieldRow, { borderColor: colors.border }]}>
                  <Pressable
                    style={styles.linkTarget}
                    onPress={() => router.push(`/${link.targetType}/${link.targetId}`)}
                  >
                    <Ionicons
                      name={link.targetType === 'event' ? 'calendar-outline' : 'alarm-outline'}
                      size={18}
                      color={colors.accent}
                    />
                    <Text style={{ color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                      {target?.title ?? 'Missing'}
                    </Text>
                    {link.sourceLine !== undefined && (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        line {link.sourceLine + 1}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => deleteNoteLink(link.id)}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        {!isNew && (
          <Pressable onPress={confirmDelete} style={styles.deleteButton}>
            <Text style={{ color: colors.destructive }}>Delete note</Text>
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
  body: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 180,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
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
  convertRow: { flexDirection: 'row', gap: 10 },
  convertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkTarget: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  deleteButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
});
