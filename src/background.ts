import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';
import { loadSettings } from './settings';
import { downloadFullTextBatch, syncAll } from './sync';

export const REFRESH_TASK = 'feed-refresh';

// Must be defined at module scope so the task exists when the OS wakes the app in the background.
TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const settings = await loadSettings();
    if (settings.wifiOnly) {
      const net = await Network.getNetworkStateAsync();
      if (net.type !== Network.NetworkStateType.WIFI && net.type !== Network.NetworkStateType.ETHERNET) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }
    }
    await syncAll();
    // Wait for full articles too; the OS may suspend the app as soon as this task returns.
    await downloadFullTextBatch();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Register or unregister the periodic refresh to match the user's settings. */
export async function configureBackgroundRefresh() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    const settings = await loadSettings();
    const registered = await TaskManager.isTaskRegisteredAsync(REFRESH_TASK);
    if (registered) await BackgroundTask.unregisterTaskAsync(REFRESH_TASK);
    if (settings.backgroundRefresh && status === BackgroundTask.BackgroundTaskStatus.Available) {
      await BackgroundTask.registerTaskAsync(REFRESH_TASK, {
        minimumInterval: Math.max(15, settings.refreshIntervalMinutes),
      });
    }
  } catch (e) {
    // Background tasks are unavailable in Expo Go and on the iOS simulator; foreground refresh still works.
    console.warn('Background refresh not configured:', e);
  }
}
