import { Platform, useColorScheme } from 'react-native';
import { useAppearance } from './appearance';

const light = {
  isDark: false,
  background: '#ffffff',
  surface: '#f4f5f7',
  text: '#16181d',
  muted: '#6b7280',
  border: '#e3e5e8',
  accent: '#d9480f',
  danger: '#c92a2a',
  badge: '#e9ecef',
};

export type Colors = typeof light;

const dark: Colors = {
  isDark: true,
  background: '#111214',
  surface: '#1b1d21',
  text: '#eceef1',
  muted: '#9aa0a8',
  border: '#2a2d33',
  accent: '#ff8a4c',
  danger: '#ff6b6b',
  badge: '#2a2d33',
};

const sepia: Colors = {
  isDark: false,
  background: '#f4ecd8',
  surface: '#ebe0c6',
  text: '#433422',
  muted: '#7a6a55',
  border: '#d9cbb0',
  accent: '#a0522d',
  danger: '#b02a2a',
  badge: '#e2d4b5',
};

export function useColors(): Colors {
  const { theme } = useAppearance();
  const system = useColorScheme();
  if (theme === 'sepia') return sepia;
  if (theme === 'dark' || (theme === 'system' && system === 'dark')) return dark;
  return light;
}

/** Scale a base font size by the user's text-size setting (the OS setting is applied on top by <Text>). */
export function useFontSize(): (base: number) => number {
  const { textScale } = useAppearance();
  return (base) => Math.round(base * textScale);
}

export const SERIF_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ms).toLocaleDateString();
}
