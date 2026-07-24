import {
  CoreBridge,
  darkEditorCss,
  darkEditorTheme,
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
} from '@10play/tentap-editor';
import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { addMinutes, format } from 'date-fns';

import { Segmented } from '@/components/Segmented';
import {
  dayKeyOf,
  deviceTimeZone,
  endOfDayInZone,
  eventStart,
  inZone,
  parseDayKey,
  startOfDayInZone,
  todayKey,
  type DayKey,
} from '@/core/dates';
import type { ImeraEvent, PhoneField, Recurrence, Weekday } from '@/core/model/types';
import { expandOccurrences } from '@/core/recurrence';
import { firstLine } from '@/features/notes/preview';
import { formatLead } from '@/features/reminders/format';
import { shareIcs } from '@/interop/share';
import { newId } from '@/db/id';
import { useAppStore } from '@/store';
import { noteSerif } from '@/theme';
import { useScheme, useThemeColors } from '@/theme/hooks';

type RecurrenceKind = Recurrence['kind'];

const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const WEEKDAY_CHIPS: { value: Weekday; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const DURATION_CHIPS = [30, 60, 90, 120];

const INTERVAL_UNITS: Record<Exclude<RecurrenceKind, 'none'>, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

function htmlIsEmpty(html: string): boolean {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}

/** A staged move: the occurrence's new wall-clock date and time. */
interface StagedMove {
  day: DayKey;
  minutes: number;
}

/** Whether the (skip/move-free) rule would produce an occurrence on `key`. */
function ruleGenerates(
  probe: Pick<
    ImeraEvent,
    'id' | 'start' | 'timeZone' | 'durationMinutes' | 'allDay' | 'recurrence'
  >,
  key: DayKey,
): boolean {
  return expandOccurrences(
    { ...probe, skippedDays: [], movedOccurrences: {} },
    startOfDayInZone(key, probe.timeZone),
    endOfDayInZone(key, probe.timeZone),
  ).some((occurrence) => occurrence.key === key);
}

function formatDayLabel(key: DayKey): string {
  const { year, month0, day } = parseDayKey(key);
  return format(new Date(year, month0, day, 12), 'EEE, MMM d, yyyy');
}

export default function EventEditorScreen() {
  const colors = useThemeColors();
  const scheme = useScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id: string;
    date?: string;
    occ?: string;
    fromNote?: string;
    sourceLine?: string;
    title?: string;
  }>();
  const isNew = params.id === 'new';
  /** The occurrence this editor was opened from, as a day in the event's zone. */
  const occ = typeof params.occ === 'string' ? (params.occ as DayKey) : undefined;

  const existing = useAppStore((s) => (isNew ? undefined : s.events.find((e) => e.id === params.id)));
  const upsertEvent = useAppStore((s) => s.upsertEvent);
  const deleteEvent = useAppStore((s) => s.deleteEvent);
  const addNoteLink = useAppStore((s) => s.addNoteLink);
  const deleteNoteLink = useAppStore((s) => s.deleteNoteLink);
  const noteLinks = useAppStore((s) => s.noteLinks);
  const allNotes = useAppStore((s) => s.notes);
  const allReminders = useAppStore((s) => s.reminders);
  const upsertReminder = useAppStore((s) => s.upsertReminder);
  const deleteReminder = useAppStore((s) => s.deleteReminder);

  const linkedNotes = existing
    ? noteLinks.filter((l) => l.targetType === 'event' && l.targetId === existing.id)
    : [];

  const timeZone = existing?.timeZone ?? deviceTimeZone();

  // Editor state, parsed once from the event (or the prefill day).
  const initial = useMemo(() => {
    if (existing) {
      const wall = eventStart(existing);
      return {
        day: dayKeyOf(wall),
        minutes: wall.getHours() * 60 + wall.getMinutes(),
      };
    }
    const day = (params.date as DayKey) ?? todayKey();
    const now = new Date();
    const minutes =
      day === todayKey() ? Math.min(23 * 60, (now.getHours() + 1) * 60) : 9 * 60;
    return { day, minutes };
  }, [existing, params.date]);

  const [title, setTitle] = useState(
    existing?.title ?? (typeof params.title === 'string' ? params.title : ''),
  );
  const [day, setDay] = useState<DayKey>(initial.day);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 60);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // Per-event reminders, staged like every other field. id present = row
  // already in the store; absent = added in this session.
  const [eventReminders, setEventReminders] = useState<{ id?: string; lead: number }[]>(() =>
    existing
      ? allReminders
          .filter((r) => r.eventId === existing.id)
          .map((r) => ({ id: r.id, lead: r.leadMinutes ?? 0 }))
      : [],
  );
  const [skippedDays, setSkippedDays] = useState<string[]>(existing?.skippedDays ?? []);
  const [moves, setMoves] = useState<Record<string, StagedMove>>(() => {
    const out: Record<string, StagedMove> = {};
    for (const [key, move] of Object.entries(existing?.movedOccurrences ?? {})) {
      const wall = inZone(move.start, existing?.timeZone ?? deviceTimeZone());
      out[key] = { day: dayKeyOf(wall), minutes: wall.getHours() * 60 + wall.getMinutes() };
    }
    return out;
  });
  const [phones, setPhones] = useState<PhoneField[]>(existing?.phones ?? []);
  const [locationText, setLocationText] = useState(existing?.location?.text ?? '');
  const [mapsUrl, setMapsUrl] = useState(existing?.location?.mapsUrl ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(
    existing?.recurrence ?? { kind: 'none' },
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showMoveDatePicker, setShowMoveDatePicker] = useState(false);
  const [showMoveTimePicker, setShowMoveTimePicker] = useState(false);

  // The description lives in the rich-text bridge, not React state; it is
  // read back as HTML once, on save.
  const editor = useEditorBridge({
    initialContent: existing?.description ?? '',
    avoidIosKeyboard: true,
    bridgeExtensions:
      scheme === 'dark'
        ? [...TenTapStartKit, CoreBridge.configureCSS(darkEditorCss)]
        : TenTapStartKit,
    theme: scheme === 'dark' ? darkEditorTheme : undefined,
  });

  const { year, month0, day: dayNum } = parseDayKey(day);
  const pickerDate = new Date(year, month0, dayNum, Math.floor(minutes / 60), minutes % 60);

  const canSave = title.trim().length > 0;

  const onChangeDate = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'set' && picked) setDay(dayKeyOf(picked));
  };

  const onChangeTime = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (event.type === 'set' && picked) setMinutes(picked.getHours() * 60 + picked.getMinutes());
  };

  const setRecurrenceKind = (kind: RecurrenceKind) => {
    if (kind === recurrence.kind) return;
    // Exceptions belong to a specific pattern; changing the pattern resets
    // them (stale ones would hide the event or emit ghosts).
    setSkippedDays([]);
    setMoves({});
    if (kind === 'none') {
      setRecurrence({ kind });
    } else if (kind === 'weekly') {
      const startWeekday = new Date(year, month0, dayNum, 12).getDay() as Weekday;
      setRecurrence({ kind, interval: 1, weekdays: [startWeekday] });
    } else {
      setRecurrence({ kind, interval: 1 });
    }
  };

  const toggleWeekday = (weekday: Weekday) => {
    if (recurrence.kind !== 'weekly') return;
    const has = recurrence.weekdays.includes(weekday);
    setRecurrence({
      ...recurrence,
      weekdays: has
        ? recurrence.weekdays.filter((w) => w !== weekday)
        : [...recurrence.weekdays, weekday],
    });
  };

  const save = async () => {
    const html = await editor.getHTML();
    const startMidnight = startOfDayInZone(day, timeZone);
    const start = allDay ? startMidnight : addMinutes(startMidnight, minutes);
    const now = new Date().toISOString();

    // Exceptions whose day the edited rule no longer produces are dropped —
    // a stale move would otherwise emit a ghost occurrence forever.
    const probe = {
      id: existing?.id ?? 'probe',
      start: start.toISOString(),
      timeZone,
      durationMinutes: allDay ? 1440 : Math.max(5, duration),
      allDay,
      recurrence,
    };
    const movedOccurrences: Record<string, { start: string }> = {};
    for (const [key, staged] of Object.entries(moves)) {
      if (!ruleGenerates(probe, key)) continue;
      const movedMidnight = startOfDayInZone(staged.day, timeZone);
      const movedStart = allDay ? movedMidnight : addMinutes(movedMidnight, staged.minutes);
      movedOccurrences[key] = { start: movedStart.toISOString() };
    }

    const eventId = existing?.id ?? newId();
    upsertEvent({
      id: eventId,
      title: title.trim(),
      start: start.toISOString(),
      durationMinutes: allDay ? 1440 : Math.max(5, duration),
      allDay,
      timeZone,
      description: htmlIsEmpty(html) ? undefined : html,
      notes: notes.trim() || undefined,
      phones: phones.filter((p) => p.number.trim().length > 0),
      location: locationText.trim()
        ? { text: locationText.trim(), mapsUrl: mapsUrl.trim() || undefined }
        : undefined,
      recurrence,
      skippedDays: skippedDays.filter((key) => ruleGenerates(probe, key)).sort(),
      movedOccurrences,
      deviceCalendarEventId: existing?.deviceCalendarEventId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    // Reconcile this event's reminder rows with the staged list.
    const keptIds = new Set(eventReminders.map((r) => r.id).filter(Boolean));
    for (const prior of allReminders.filter((r) => r.eventId === eventId)) {
      if (!keptIds.has(prior.id)) deleteReminder(prior.id);
    }
    for (const staged of eventReminders) {
      const prior = staged.id ? allReminders.find((r) => r.id === staged.id) : undefined;
      upsertReminder({
        id: staged.id ?? newId(),
        eventId,
        title: title.trim(),
        leadMinutes: Math.max(0, staged.lead),
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
    }

    if (isNew && typeof params.fromNote === 'string' && params.fromNote) {
      addNoteLink({
        id: newId(),
        noteId: params.fromNote,
        targetType: 'event',
        targetId: eventId,
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
    Alert.alert('Delete event', 'This removes the event and its reminders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEvent(existing.id);
          router.back();
        },
      },
    ]);
  };

  const openMap = () => {
    const url = mapsUrl.trim().startsWith('http')
      ? mapsUrl.trim()
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`;
    Linking.openURL(url);
  };

  const inputStyle = [
    styles.input,
    { borderColor: colors.border, color: colors.text },
  ];

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
          {isNew ? 'New event' : 'Edit event'}
        </Text>
        <Pressable hitSlop={8} onPress={save} disabled={!canSave}>
          <Text style={{ color: canSave ? colors.accent : colors.textMuted, fontSize: 16 }}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={colors.textMuted}
          style={[...inputStyle, styles.titleInput]}
        />

        <View style={styles.switchRow}>
          <Text style={{ color: colors.text }}>All day</Text>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.surface}
          />
        </View>

        <Pressable
          onPress={() => setShowDatePicker((v) => !v)}
          style={[styles.fieldRow, { borderColor: colors.border }]}
        >
          <Text style={{ color: colors.textMuted }}>Date</Text>
          <Text style={{ color: colors.text }}>{format(pickerDate, 'EEE, MMM d, yyyy')}</Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker value={pickerDate} mode="date" onChange={onChangeDate} />
        )}

        {!allDay && (
          <>
            <Pressable
              onPress={() => setShowTimePicker((v) => !v)}
              style={[styles.fieldRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textMuted }}>Time</Text>
              <Text style={{ color: colors.text }}>{format(pickerDate, 'HH:mm')}</Text>
            </Pressable>
            {showTimePicker && (
              <DateTimePicker value={pickerDate} mode="time" is24Hour onChange={onChangeTime} />
            )}

            <View style={styles.durationRow}>
              <Text style={{ color: colors.textMuted }}>Duration</Text>
              <TextInput
                value={String(duration)}
                onChangeText={(t) => setDuration(Number(t.replace(/\D/g, '')) || 0)}
                keyboardType="number-pad"
                style={[...inputStyle, styles.durationInput]}
              />
              <Text style={{ color: colors.textMuted }}>min</Text>
              {DURATION_CHIPS.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => setDuration(chip)}
                  style={[
                    styles.chip,
                    { borderColor: duration === chip ? colors.accent : colors.border },
                  ]}
                >
                  <Text style={{ color: colors.text, fontSize: 12 }}>{chip}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Repeats</Text>
        <Segmented
          options={RECURRENCE_OPTIONS}
          value={recurrence.kind}
          onChange={setRecurrenceKind}
        />
        {recurrence.kind !== 'none' && (
          <View style={styles.intervalRow}>
            <Text style={{ color: colors.textMuted }}>Every</Text>
            <TextInput
              value={String(recurrence.interval)}
              onChangeText={(t) => {
                const interval = Math.max(1, Number(t.replace(/\D/g, '')) || 1);
                setRecurrence({ ...recurrence, interval });
              }}
              keyboardType="number-pad"
              style={[...inputStyle, styles.durationInput]}
            />
            <Text style={{ color: colors.textMuted }}>
              {INTERVAL_UNITS[recurrence.kind][recurrence.interval === 1 ? 0 : 1]}
            </Text>
          </View>
        )}
        {recurrence.kind === 'weekly' && (
          <View style={styles.weekdayRow}>
            {WEEKDAY_CHIPS.map(({ value, label }) => {
              const selected = recurrence.weekdays.includes(value);
              return (
                <Pressable
                  key={value}
                  onPress={() => toggleWeekday(value)}
                  style={[
                    styles.chip,
                    { borderColor: selected ? colors.accent : colors.border },
                    selected && { backgroundColor: colors.accent },
                  ]}
                >
                  <Text style={{ color: selected ? colors.surface : colors.text, fontSize: 12 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {recurrence.kind !== 'none' && occ && !skippedDays.includes(occ) && (
          <>
            <Pressable
              onPress={() => {
                setSkippedDays([...skippedDays, occ]);
                if (moves[occ]) {
                  const { [occ]: _removed, ...rest } = moves;
                  setMoves(rest);
                }
              }}
              style={[styles.fieldRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.accent }}>Skip this occurrence</Text>
              <Text style={{ color: colors.textMuted }}>{formatDayLabel(occ)}</Text>
            </Pressable>

            {!moves[occ] ? (
              <Pressable
                onPress={() => setMoves({ ...moves, [occ]: { day: occ, minutes } })}
                style={[styles.fieldRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.accent }}>Move this occurrence</Text>
                <Text style={{ color: colors.textMuted }}>{formatDayLabel(occ)}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.movedHeader}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                    This occurrence moves to
                  </Text>
                  <Pressable
                    hitSlop={6}
                    onPress={() => {
                      const { [occ]: _removed, ...rest } = moves;
                      setMoves(rest);
                    }}
                  >
                    <Text style={{ color: colors.accent }}>Reset</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => setShowMoveDatePicker((v) => !v)}
                  style={[styles.fieldRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.textMuted }}>Date</Text>
                  <Text style={{ color: colors.text }}>{formatDayLabel(moves[occ].day)}</Text>
                </Pressable>
                {showMoveDatePicker && (
                  <DateTimePicker
                    value={(() => {
                      const p = parseDayKey(moves[occ].day);
                      return new Date(p.year, p.month0, p.day, 12);
                    })()}
                    mode="date"
                    onChange={(event, picked) => {
                      if (Platform.OS === 'android') setShowMoveDatePicker(false);
                      if (event.type === 'set' && picked) {
                        setMoves({ ...moves, [occ]: { ...moves[occ], day: dayKeyOf(picked) } });
                      }
                    }}
                  />
                )}
                {!allDay && (
                  <>
                    <Pressable
                      onPress={() => setShowMoveTimePicker((v) => !v)}
                      style={[styles.fieldRow, { borderColor: colors.border }]}
                    >
                      <Text style={{ color: colors.textMuted }}>Time</Text>
                      <Text style={{ color: colors.text }}>
                        {`${String(Math.floor(moves[occ].minutes / 60)).padStart(2, '0')}:${String(
                          moves[occ].minutes % 60,
                        ).padStart(2, '0')}`}
                      </Text>
                    </Pressable>
                    {showMoveTimePicker && (
                      <DateTimePicker
                        value={(() => {
                          const p = parseDayKey(moves[occ].day);
                          return new Date(
                            p.year,
                            p.month0,
                            p.day,
                            Math.floor(moves[occ].minutes / 60),
                            moves[occ].minutes % 60,
                          );
                        })()}
                        mode="time"
                        is24Hour
                        onChange={(event, picked) => {
                          if (Platform.OS === 'android') setShowMoveTimePicker(false);
                          if (event.type === 'set' && picked) {
                            setMoves({
                              ...moves,
                              [occ]: {
                                ...moves[occ],
                                minutes: picked.getHours() * 60 + picked.getMinutes(),
                              },
                            });
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
        {recurrence.kind !== 'none' && skippedDays.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              Skipped occurrences
            </Text>
            {[...skippedDays].sort().map((skippedDay) => (
              <View key={skippedDay} style={[styles.fieldRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text }}>{formatDayLabel(skippedDay)}</Text>
                <Pressable
                  hitSlop={6}
                  onPress={() => setSkippedDays(skippedDays.filter((d) => d !== skippedDay))}
                >
                  <Text style={{ color: colors.accent }}>Restore</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
        {recurrence.kind !== 'none' &&
          Object.keys(moves).filter((key) => key !== occ).length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                Moved occurrences
              </Text>
              {Object.entries(moves)
                .filter(([key]) => key !== occ)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, staged]) => (
                  <View key={key} style={[styles.fieldRow, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text, flexShrink: 1 }}>
                      {`${formatDayLabel(key)} → ${formatDayLabel(staged.day)}${
                        allDay
                          ? ''
                          : `, ${String(Math.floor(staged.minutes / 60)).padStart(2, '0')}:${String(
                              staged.minutes % 60,
                            ).padStart(2, '0')}`
                      }`}
                    </Text>
                    <Pressable
                      hitSlop={6}
                      onPress={() => {
                        const { [key]: _removed, ...rest } = moves;
                        setMoves(rest);
                      }}
                    >
                      <Text style={{ color: colors.accent }}>Restore</Text>
                    </Pressable>
                  </View>
                ))}
            </>
          )}

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Reminders</Text>
        {eventReminders.map((staged, i) => (
          <View key={staged.id ?? `new-${i}`} style={styles.reminderRow}>
            <TextInput
              value={String(staged.lead)}
              onChangeText={(t) => {
                const lead = Number(t.replace(/\D/g, '')) || 0;
                setEventReminders(eventReminders.map((r, j) => (j === i ? { ...r, lead } : r)));
              }}
              keyboardType="number-pad"
              style={[...inputStyle, styles.durationInput]}
            />
            <Text style={{ color: colors.textMuted }}>min before</Text>
            <Text style={{ color: colors.textMuted, flex: 1, fontSize: 12 }} numberOfLines={1}>
              {staged.lead >= 60 ? formatLead(staged.lead) : ''}
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => setEventReminders(eventReminders.filter((_, j) => j !== i))}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setEventReminders([...eventReminders, { lead: 30 }])}>
          <Text style={{ color: colors.accent }}>Add reminder</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Description</Text>
        <View style={[styles.richWrap, { borderColor: colors.border }]}>
          <RichText editor={editor} />
        </View>
        <Toolbar editor={editor} />

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Anything worth writing down"
          placeholderTextColor={colors.textMuted}
          style={[...inputStyle, styles.multiline, { fontFamily: noteSerif }]}
        />

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Phones</Text>
        {phones.map((phone, i) => (
          <View key={i} style={styles.phoneRow}>
            <TextInput
              value={phone.label ?? ''}
              onChangeText={(t) =>
                setPhones(phones.map((p, j) => (j === i ? { ...p, label: t } : p)))
              }
              placeholder="Label"
              placeholderTextColor={colors.textMuted}
              style={[...inputStyle, { flex: 1 }]}
            />
            <TextInput
              value={phone.number}
              onChangeText={(t) =>
                setPhones(phones.map((p, j) => (j === i ? { ...p, number: t } : p)))
              }
              placeholder="Number"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={[...inputStyle, { flex: 2 }]}
            />
            {phone.number.trim().length > 0 && (
              <>
                <Pressable hitSlop={6} onPress={() => Linking.openURL(`tel:${phone.number}`)}>
                  <Ionicons name="call-outline" size={20} color={colors.accent} />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => Linking.openURL(`sms:${phone.number}`)}>
                  <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
                </Pressable>
              </>
            )}
            <Pressable hitSlop={6} onPress={() => setPhones(phones.filter((_, j) => j !== i))}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setPhones([...phones, { number: '' }])}>
          <Text style={{ color: colors.accent }}>Add phone</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Location</Text>
        <TextInput
          value={locationText}
          onChangeText={setLocationText}
          placeholder="Where"
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
        />
        <TextInput
          value={mapsUrl}
          onChangeText={setMapsUrl}
          placeholder="Maps link (optional)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="url"
          style={inputStyle}
        />
        {locationText.trim().length > 0 && (
          <Pressable onPress={openMap}>
            <Text style={{ color: colors.accent }}>Open map</Text>
          </Pressable>
        )}

        {linkedNotes.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Linked notes</Text>
            {linkedNotes.map((link) => {
              const note = allNotes.find((n) => n.id === link.noteId);
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
          <Pressable
            onPress={() =>
              void shareIcs(
                [existing],
                allReminders.filter((r) => r.eventId === existing.id),
                `${existing.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'event'}.ics`,
              )
            }
            style={[styles.fieldRow, { borderColor: colors.border, marginTop: 12 }]}
          >
            <Text style={{ color: colors.accent }}>Share as .ics</Text>
          </Pressable>
        )}

        {existing && (
          <Pressable onPress={confirmDelete} style={styles.deleteButton}>
            <Text style={{ color: colors.destructive }}>Delete event</Text>
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
    fontSize: 15,
  },
  titleInput: { fontSize: 17 },
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
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  durationInput: { width: 64, textAlign: 'center', paddingVertical: 6 },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekdayRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionLabel: { fontSize: 13, marginTop: 8 },
  movedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  richWrap: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    height: 200,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  linkTarget: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  deleteButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
});
