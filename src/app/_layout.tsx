import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
// Importing background.ts also defines the refresh task at module scope, which the OS needs on wake-up.
import { configureBackgroundRefresh } from '../background';
import { loadSettings } from '../settings';
import { syncAll } from '../sync';
import { useColors } from '../theme';

const FOREGROUND_REFRESH_AFTER_MS = 15 * 60000;

export default function RootLayout() {
  const colors = useColors();

  useEffect(() => {
    configureBackgroundRefresh();
    let lastSync = 0;
    const refreshIfStale = async () => {
      if (Date.now() - lastSync < FOREGROUND_REFRESH_AFTER_MS) return;
      lastSync = Date.now();
      const settings = await loadSettings();
      if (settings.backgroundRefresh) syncAll().catch(() => {});
    };
    refreshIfStale();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIfStale();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Feeds' }} />
        <Stack.Screen name="articles" options={{ title: 'Articles' }} />
        <Stack.Screen name="article/[id]" options={{ title: '' }} />
        <Stack.Screen name="add" options={{ title: 'Add feed', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
