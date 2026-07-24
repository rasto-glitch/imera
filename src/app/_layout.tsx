import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { initDeviceCalendarSync } from '@/interop/deviceCalendar';
import { initNotifications } from '@/notifications';
import { useAppStore } from '@/store';
import { palette } from '@/theme';
import { useScheme } from '@/theme/hooks';

// Hydration is synchronous (expo-sqlite sync API): migrations + full load run
// once when the JS bundle boots, before the first frame renders.
if (!useAppStore.getState().hydrated) {
  useAppStore.getState().hydrate();
}

export default function RootLayout() {
  const scheme = useScheme();

  useEffect(() => {
    initNotifications();
    initDeviceCalendarSync();
  }, []);
  const colors = palette[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.surface,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="note/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reminder/[id]" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
