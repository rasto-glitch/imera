// Background refresh: without it, the 30-day scheduling horizon empties for
// users who stop opening the app. expo-background-task (WorkManager on
// Android, BGTaskScheduler on iOS) reruns the reconcile roughly daily —
// opportunistically, whenever the OS allows. Not available in Expo Go; the
// foreground refresh paths still cover that case.

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { useAppStore } from '@/store';
import { refreshNotifications } from './scheduler';

export const BACKGROUND_REFRESH_TASK = 'imera-notification-refresh';

// Module scope, so the task also exists in headless launches where no UI
// (and no root layout) ever mounts.
TaskManager.defineTask(BACKGROUND_REFRESH_TASK, async () => {
  try {
    const store = useAppStore.getState();
    if (!store.hydrated) store.hydrate();
    await refreshNotifications();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundRefresh(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(BACKGROUND_REFRESH_TASK, {
      minimumInterval: 12 * 60, // minutes; the OS decides the real cadence
    });
  } catch (error) {
    console.warn('Background refresh unavailable', error);
  }
}
