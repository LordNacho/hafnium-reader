import { getDb } from './db';
import { notifyDataChanged } from './events';
import { looksLikeFeed, parseFeed, type ParsedFeed } from './lib/feed';
import { absolutizeUrls, discoverFeedLinks, htmlToText } from './lib/html';
import type { OpmlFeed } from './lib/opml';
import { loadSettings, type Settings } from './settings';

const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 4;
const DAY_MS = 86400000;
const HEADERS = {
  Accept: 'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
  'User-Agent': 'RSSReader/1.0 (+personal feed reader)',
};

async function fetchWithTimeout(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { ...HEADERS, ...headers }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface SyncResult {
  feeds: number;
  newArticles: number;
  errors: number;
}

let running: Promise<SyncResult> | null = null;

/** Refresh every feed (or just one). Concurrent calls share the in-flight run. */
export function syncAll(onlyFeedId?: number): Promise<SyncResult> {
  if (running && onlyFeedId == null) return running;
  const run = doSync(onlyFeedId).finally(() => {
    if (running === run) running = null;
    notifyDataChanged();
  });
  if (onlyFeedId == null) running = run;
  return run;
}

async function doSync(onlyFeedId?: number): Promise<SyncResult> {
  const db = await getDb();
  const settings = await loadSettings();
  const feeds = await db.getAllAsync<{ id: number; url: string; etag: string | null; last_modified: string | null }>(
    `SELECT id, url, etag, last_modified FROM feeds ${onlyFeedId != null ? 'WHERE id = ?' : ''}`,
    ...(onlyFeedId != null ? [onlyFeedId] : []),
  );

  const result: SyncResult = { feeds: feeds.length, newArticles: 0, errors: 0 };
  let next = 0;
  const worker = async () => {
    while (next < feeds.length) {
      const feed = feeds[next++];
      try {
        result.newArticles += await syncFeed(feed, settings);
      } catch (e) {
        result.errors++;
        await db.runAsync('UPDATE feeds SET last_error = ?, last_fetched_at = ? WHERE id = ?', errorMessage(e), Date.now(), feed.id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, feeds.length) }, worker));
  await prune(settings);
  return result;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.name === 'AbortError' ? 'Timed out' : e.message;
  return String(e);
}

async function syncFeed(
  feed: { id: number; url: string; etag: string | null; last_modified: string | null },
  settings: Settings,
): Promise<number> {
  const db = await getDb();
  const headers: Record<string, string> = {};
  if (feed.etag) headers['If-None-Match'] = feed.etag;
  if (feed.last_modified) headers['If-Modified-Since'] = feed.last_modified;

  const res = await fetchWithTimeout(feed.url, headers);
  if (res.status === 304) {
    await db.runAsync('UPDATE feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?', Date.now(), feed.id);
    return 0;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = parseFeed(await res.text(), feed.url);
  const added = await storeItems(feed.id, parsed, settings);
  await db.runAsync(
    `UPDATE feeds SET last_fetched_at = ?, last_error = NULL, etag = ?, last_modified = ?,
       site_url = COALESCE(site_url, ?) WHERE id = ?`,
    Date.now(),
    res.headers.get('etag'),
    res.headers.get('last-modified'),
    parsed.siteUrl,
    feed.id,
  );
  return added;
}

async function storeItems(feedId: number, parsed: ParsedFeed, settings: Settings): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  const cutoff = now - settings.maxAgeDays * DAY_MS;
  const items = parsed.items
    .filter((i) => i.guid && (i.publishedAt == null || i.publishedAt >= cutoff))
    .slice(0, settings.maxArticlesPerFeed);

  let added = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const item of items) {
      const content = absolutizeUrls(item.content, item.url ?? parsed.siteUrl);
      // Undated items sort by first-seen time; clamp future dates so they don't pin to the top.
      const sortAt = Math.min(item.publishedAt ?? now, now);
      const existing = await txn.getFirstAsync<{ id: number }>('SELECT id FROM articles WHERE feed_id = ? AND guid = ?', feedId, item.guid);
      if (existing) {
        await txn.runAsync(
          'UPDATE articles SET title = ?, url = ?, author = ?, content = ?, preview = ? WHERE id = ?',
          item.title,
          item.url,
          item.author,
          content,
          htmlToText(content),
          existing.id,
        );
      } else {
        await txn.runAsync(
          `INSERT INTO articles (feed_id, guid, url, title, author, published_at, fetched_at, sort_at, preview, content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          feedId,
          item.guid,
          item.url,
          item.title,
          item.author,
          item.publishedAt,
          now,
          sortAt,
          htmlToText(content),
          content,
        );
        added++;
      }
    }
  });
  return added;
}

/** Enforce the offline limits: per-feed article count and maximum age. Starred articles are kept. */
export async function prune(settings?: Settings) {
  const s = settings ?? (await loadSettings());
  const db = await getDb();
  await db.runAsync('DELETE FROM articles WHERE is_starred = 0 AND sort_at < ?', Date.now() - s.maxAgeDays * DAY_MS);
  await db.runAsync(
    `DELETE FROM articles WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY feed_id ORDER BY sort_at DESC) AS rn
         FROM articles WHERE is_starred = 0
       ) WHERE rn > ?
     )`,
    s.maxArticlesPerFeed,
  );
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Subscribe to a feed URL, or a web page that advertises one. Returns the new feed id. */
export async function addFeed(input: string, folder: string | null = null): Promise<number> {
  let url = normalizeUrl(input);
  let res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  let body = await res.text();

  if (!looksLikeFeed(body)) {
    const candidates = discoverFeedLinks(body, res.url || url);
    if (!candidates.length) throw new Error('No RSS or Atom feed found at that address');
    url = candidates[0];
    res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    body = await res.text();
  }

  const parsed = parseFeed(body, url);
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM feeds WHERE url = ?', url);
  if (existing) throw new Error('You are already subscribed to that feed');
  const { lastInsertRowId } = await db.runAsync(
    'INSERT INTO feeds (url, title, site_url, folder, created_at) VALUES (?, ?, ?, ?, ?)',
    url,
    parsed.title,
    parsed.siteUrl,
    folder,
    Date.now(),
  );
  await storeItems(lastInsertRowId, parsed, await loadSettings());
  await db.runAsync('UPDATE feeds SET last_fetched_at = ? WHERE id = ?', Date.now(), lastInsertRowId);
  notifyDataChanged();
  return lastInsertRowId;
}

/** Insert feeds from an OPML import without fetching them; returns how many were new. */
export async function importFeeds(feeds: OpmlFeed[]): Promise<number> {
  const db = await getDb();
  let added = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const f of feeds) {
      const r = await txn.runAsync(
        'INSERT OR IGNORE INTO feeds (url, title, site_url, folder, created_at) VALUES (?, ?, ?, ?, ?)',
        f.url,
        f.title,
        f.siteUrl,
        f.folder,
        Date.now(),
      );
      added += r.changes;
    }
  });
  notifyDataChanged();
  return added;
}

export async function exportFeeds(): Promise<OpmlFeed[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ url: string; title: string; site_url: string | null; folder: string | null }>(
    'SELECT url, title, site_url, folder FROM feeds ORDER BY folder IS NOT NULL, folder, title COLLATE NOCASE',
  );
  return rows.map((r) => ({ url: r.url, title: r.title, siteUrl: r.site_url, folder: r.folder }));
}
