// Local-notification wiring. The OS schedule is treated as derived state:
// after any change to events or reminders (and on boot/foreground/background
// task) the pending notifications are cancelled wholesale and rebuilt from
// core/notificationPlan. No per-notification bookkeeping to drift.

import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { useAppStore } from '@/store';
import { registerBackgroundRefresh } from './background';
import { refreshNotifications } from './scheduler';

export { refreshNotifications };

let initialized = false;

export function initNotifications(): void {
  if (initialized) return;
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  // Tapping a notification lands on the thing it announces.
  Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string') router.push(url);
  });

  let prevEvents = useAppStore.getState().events;
  let prevReminders = useAppStore.getState().reminders;
  useAppStore.subscribe((state) => {
    if (state.events === prevEvents && state.reminders === prevReminders) return;
    prevEvents = state.events;
    prevReminders = state.reminders;
    void refreshNotifications();
  });

  AppState.addEventListener('change', (status) => {
    if (status === 'active') void refreshNotifications();
  });

  void registerBackgroundRefresh();
  void refreshNotifications();
}
