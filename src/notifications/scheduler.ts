// The reconcile pass: cancel everything pending and rebuild it from
// core/notificationPlan. Called from foreground triggers (src/notifications)
// and the background task (./background).

import { addDays } from 'date-fns';
import * as Notifications from 'expo-notifications';

import { deviceTimeZone } from '@/core/dates';
import { planNotifications } from '@/core/notificationPlan';
import { useAppStore } from '@/store';

const HORIZON_DAYS = 30;

let running = false;
let queued = false;

/** Rebuild the OS notification schedule from current app state. */
export async function refreshNotifications(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const { events, reminders } = useAppStore.getState();
    if (reminders.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    // Permission is only ever requested once something exists to deliver.
    if (!(await ensurePermissions())) return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const planned = planNotifications(
      events,
      reminders,
      now,
      addDays(now, HORIZON_DAYS),
      deviceTimeZone(),
    );
    for (const item of planned) {
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body: item.body, data: { url: item.url } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.fireAt,
          channelId: 'reminders',
        },
      });
    }
  } catch (error) {
    console.warn('Notification refresh failed', error);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void refreshNotifications();
    }
  }
}

async function ensurePermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}
