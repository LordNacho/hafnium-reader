import { useColorScheme } from 'react-native';

const light = {
  background: '#ffffff',
  surface: '#f4f5f7',
  text: '#16181d',
  muted: '#6b7280',
  border: '#e3e5e8',
  accent: '#d9480f',
  danger: '#c92a2a',
  badge: '#e9ecef',
};

const dark: typeof light = {
  background: '#111214',
  surface: '#1b1d21',
  text: '#eceef1',
  muted: '#9aa0a8',
  border: '#2a2d33',
  accent: '#ff8a4c',
  danger: '#ff6b6b',
  badge: '#2a2d33',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

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
