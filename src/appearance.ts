import { useSyncExternalStore } from 'react';
import { Appearance as NativeAppearance } from 'react-native';
import { APPEARANCE_KEYS, DEFAULT_SETTINGS, loadSettings, saveSetting, type AppearanceKey, type Settings } from './settings';

export type Appearance = Pick<Settings, AppearanceKey>;

/**
 * Appearance settings live in memory so every screen re-renders the moment one changes;
 * they are persisted to the settings table alongside everything else.
 */
let current: Appearance = pick(DEFAULT_SETTINGS);
const listeners = new Set<() => void>();

function pick(s: Settings): Appearance {
  return Object.fromEntries(APPEARANCE_KEYS.map((k) => [k, s[k]])) as Appearance;
}

function set(next: Appearance) {
  current = next;
  // Tell Android/iOS too, so web pages that have a dark design follow the app's theme rather than the phone's.
  try {
    NativeAppearance.setColorScheme(next.theme === 'dark' ? 'dark' : next.theme === 'system' ? 'auto' : 'light');
  } catch {
    // not available (tests, web)
  }
  listeners.forEach((l) => l());
}

export async function initAppearance() {
  set(pick(await loadSettings()));
}

export async function updateAppearance<K extends AppearanceKey>(key: K, value: Settings[K]) {
  set({ ...current, [key]: value });
  await saveSetting(key, value);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => current);
}

export const LINE_HEIGHTS: Record<Appearance['lineSpacing'], number> = { compact: 1.4, normal: 1.6, relaxed: 1.85 };
