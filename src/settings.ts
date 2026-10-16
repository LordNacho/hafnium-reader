import { getDb } from './db';

export interface Settings {
  /** Newest N articles kept per feed (starred articles are never pruned). */
  maxArticlesPerFeed: number;
  /** Articles older than this are pruned and not downloaded. */
  maxAgeDays: number;
  /** Background refresh interval; the OS treats it as a minimum (never below 15 minutes). */
  refreshIntervalMinutes: number;
  backgroundRefresh: boolean;
  /** Skip background refreshes while on cellular. */
  wifiOnly: boolean;
  /** Article lists hide read articles. */
  unreadOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  maxArticlesPerFeed: 100,
  maxAgeDays: 30,
  refreshIntervalMinutes: 60,
  backgroundRefresh: true,
  wifiOnly: false,
  unreadOnly: true,
};

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const stored: Partial<Settings> = {};
  for (const { key, value } of rows) {
    if (key in DEFAULT_SETTINGS) {
      try {
        (stored as Record<string, unknown>)[key] = JSON.parse(value);
      } catch {
        // ignore a corrupt value and fall back to the default
      }
    }
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
}
