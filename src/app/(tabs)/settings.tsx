import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Segmented } from '@/components/Segmented';
import { disableDeviceSync, enableDeviceSync } from '@/interop/deviceCalendar';
import { pickAndImportIcs } from '@/interop/importIcs';
import { shareIcs } from '@/interop/share';
import { useAppStore } from '@/store';
import type { ThemeOverride } from '@/theme';
import { useThemeColors } from '@/theme/hooks';

const THEME_OPTIONS: { value: ThemeOverride; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const colors = useThemeColors();
  const themeOverride = useAppStore((s) => s.themeOverride);
  const setThemeOverride = useAppStore((s) => s.setThemeOverride);
  const deviceCalendarSync = useAppStore((s) => s.deviceCalendarSync);
  const events = useAppStore((s) => s.events);
  const reminders = useAppStore((s) => s.reminders);
  const [busy, setBusy] = useState(false);

  const toggleDeviceSync = async (value: boolean) => {
    if (busy) return;
    if (value) {
      setBusy(true);
      try {
        const granted = await enableDeviceSync();
        if (!granted) {
          Alert.alert(
            'Calendar access needed',
            'Allow calendar access in system settings, then try again.',
          );
        }
      } finally {
        setBusy(false);
      }
    } else {
      Alert.alert(
        'Stop writing to the device calendar?',
        'The Imera calendar and its events are removed from the device. Nothing in Imera is lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: () => void disableDeviceSync() },
        ],
      );
    }
  };

  const exportAll = async () => {
    if (busy || events.length === 0) return;
    setBusy(true);
    try {
      await shareIcs(events, reminders, 'imera.ics');
    } catch (error) {
      Alert.alert('Export failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await pickAndImportIcs();
      if (!result.cancelled) {
        Alert.alert(
          'Import finished',
          `${result.imported} event${result.imported === 1 ? '' : 's'} imported` +
            (result.skipped > 0 ? `, ${result.skipped} skipped.` : '.'),
        );
      }
    } catch (error) {
      Alert.alert('Import failed', String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.surface }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Theme</Text>
      <Segmented options={THEME_OPTIONS} value={themeOverride} onChange={setThemeOverride} />

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Device calendar</Text>
      <View style={[styles.row, { borderColor: colors.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text }}>Write events to the device calendar</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Keeps an Imera calendar on this device, which your synced accounts pick up.
            Skipped and moved occurrences stay Imera-only.
          </Text>
        </View>
        <Switch
          value={deviceCalendarSync}
          onValueChange={(v) => void toggleDeviceSync(v)}
          trackColor={{ true: colors.accent }}
          thumbColor={colors.surface}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Interop</Text>
      <Pressable
        onPress={() => void exportAll()}
        disabled={events.length === 0}
        style={[styles.row, { borderColor: colors.border }]}
      >
        <Text style={{ color: events.length === 0 ? colors.textMuted : colors.accent }}>
          Export everything as .ics
        </Text>
      </Pressable>
      <Pressable onPress={() => void importFile()} style={[styles.row, { borderColor: colors.border }]}>
        <Text style={{ color: colors.accent }}>Import an .ics file</Text>
      </Pressable>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Export is never gated. Import is one-time — a file brings its events in as new.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  sectionLabel: { fontSize: 13, marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
