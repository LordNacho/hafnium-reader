import * as Network from 'expo-network';
import { getDb } from './db';
import { notifyDataChanged } from './events';
import { looksLikeFeed, parseFeed, type ParsedFeed } from './lib/feed';
import { extractArticle, isWorthKeeping, looksLikeSummary } from './lib/fulltext';
import { absolutizeUrls, discoverFeedLinks, discoverFeeds, htmlToText, httpsVariant, originOf } from './lib/html';
import type { OpmlFeed } from './lib/opml';
import { loadSettings, type Settings } from './settings';

const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 4;
const DAY_MS = 86400000;
const HEADERS = {
  Accept: 'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
  'User-Agent': 'HafniumReader/1.0 (+https://reader.hafnium.ltd)',
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

/**
 * Plain-http addresses are tried over https first: most sites serve both, and phones block
 * insecure requests by default. Falls back to http only when https doesn't answer.
 */
async function fetchPreferHttps(url: string, headers: Record<string, string> = {}): Promise<{ res: Response; url: string }> {
  const secure = httpsVariant(url);
  if (!secure) return { res: await fetchWithTimeout(url, headers), url };
  try {
    const res = await fetchWithTimeout(secure, headers);
    if (res.ok || res.status === 304) return { res, url: secure };
  } catch {
    // no https version; try the original address
  }
  try {
    return { res: await fetchWithTimeout(url, headers), url };
  } catch {
    throw new Error('This site has no secure (https) version, and its insecure address could not be loaded');
  }
}

export interface SyncResult {
  feeds: number;
  newArticles: number;
  errors: number;
}

let running: Promise<SyncResult> | null = null;

/**
 * Refresh every feed (or just one). Concurrent calls share the in-flight run.
 * A full refresh then starts downloading full articles in the background; callers that must wait
 * for those too (the background task) also await downloadFullTextBatch().
 */
export function syncAll(onlyFeedId?: number): Promise<SyncResult> {
  if (running && onlyFeedId == null) return running;
  const run = doSync(onlyFeedId).finally(() => {
    if (running === run) running = null;
    notifyDataChanged();
  });
  if (onlyFeedId == null) {
    running = run;
    run.then(() => downloadFullTextBatch()).catch(() => {});
  }
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

  const { res, url } = await fetchPreferHttps(feed.url, headers);
  if (url !== feed.url) {
    // Remember the secure address; OR IGNORE keeps the old one if that address is already subscribed.
    await db.runAsync('UPDATE OR IGNORE feeds SET url = ? WHERE id = ?', url, feed.id);
  }
  if (res.status === 304) {
    await db.runAsync('UPDATE feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?', Date.now(), feed.id);
    return 0;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = parseFeed(await res.text(), url);
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

/** Approximate stored size of an article: feed text, preview and downloaded full text. */
const ARTICLE_SIZE_SQL = "LENGTH(content) + LENGTH(preview) + LENGTH(COALESCE(full_content, ''))";

export async function storedBytes(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ bytes: number }>(`SELECT COALESCE(SUM(${ARTICLE_SIZE_SQL}), 0) AS bytes FROM articles`);
  return row?.bytes ?? 0;
}

/** Over the storage limit, drop the oldest articles: read ones first, then unread. Starred articles stay. */
async function enforceStorageLimit(limitBytes: number) {
  const db = await getDb();
  const starred = await db.getFirstAsync<{ bytes: number }>(
    `SELECT COALESCE(SUM(${ARTICLE_SIZE_SQL}), 0) AS bytes FROM articles WHERE is_starred = 1`,
  );
  // Keep unread before read, newest first, until the running total reaches what's left after starred articles.
  const { changes } = await db.runAsync(
    `DELETE FROM articles WHERE id IN (
       SELECT id FROM (
         SELECT id, SUM(${ARTICLE_SIZE_SQL}) OVER (ORDER BY is_read ASC, sort_at DESC ROWS UNBOUNDED PRECEDING) AS running
         FROM articles WHERE is_starred = 0
       ) WHERE running > ?
     )`,
    Math.max(0, limitBytes - (starred?.bytes ?? 0)),
  );
  if (changes > 100) {
    try {
      await db.execAsync('VACUUM'); // give the space back to the phone
    } catch {
      // another query is running; the space is reused by new articles anyway
    }
  }
}

/** Enforce the offline limits: per-feed article count, maximum age and total storage. Starred articles are kept. */
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
  if (s.maxStorageMB > 0) await enforceStorageLimit(s.maxStorageMB * 1_000_000);
}

/** Safety cap per run; the storage limit normally stops downloads first. */
const FULLTEXT_PER_REFRESH = 100;
const FULLTEXT_CONCURRENCY = 3;
const MAX_PAGE_CHARS = 3_000_000;
const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
  // Some sites serve stripped-down pages to unknown clients, so ask like a mobile browser and name the app.
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 HafniumReader/1.0',
};

/** Download a web page for the page viewer (JavaScript off), the same way full articles are fetched. */
export async function downloadPage(pageUrl: string): Promise<{ html: string; url: string }> {
  const { res, url } = await fetchPreferHttps(pageUrl, PAGE_HEADERS);
  if (!res.ok) throw new Error(`The site answered HTTP ${res.status}.`);
  const html = await res.text();
  if (html.length > MAX_PAGE_CHARS) throw new Error('The page is too large to show here.');
  return { html, url: res.url || url };
}

export type FullTextStatus = 'ok' | 'failed' | 'skipped';
export interface FullTextResult {
  status: FullTextStatus;
  /** Why it failed, in words a person can act on. */
  error?: string;
}

/** Download one article's linked page and keep its readable text if it adds to the feed's summary. */
export async function downloadFullText(article: { id: number; url: string | null; content: string }): Promise<FullTextResult> {
  const db = await getDb();
  const save = async (status: FullTextStatus, content: string | null, error?: string): Promise<FullTextResult> => {
    await db.runAsync(
      'UPDATE articles SET full_status = ?, full_content = ?, full_fetched_at = ? WHERE id = ?',
      status,
      content,
      Date.now(),
      article.id,
    );
    return { status, error };
  };
  if (!article.url) return save('skipped', null);
  let stage = 'downloading the page';
  try {
    const { res, url } = await fetchPreferHttps(article.url, PAGE_HEADERS);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) throw new Error(`the site answered HTTP ${res.status}`);
    if (type && !/html/i.test(type)) throw new Error(`the link is not a web page (${type.split(';')[0]})`);
    const html = await res.text();
    if (html.length > MAX_PAGE_CHARS) throw new Error('the page is too large');
    stage = 'reading the page';
    const extracted = extractArticle(html, res.url || url);
    if (extracted && isWorthKeeping(extracted, article.content)) return save('ok', extracted.content);
    return save('skipped', null);
  } catch (e) {
    const reason = e instanceof Error ? (e.name === 'AbortError' ? 'the site took too long to answer' : e.message) : String(e);
    return save('failed', null, `Failed while ${stage}: ${reason}`);
  }
}

export interface FullTextCounts {
  saved: number;
  failed: number;
  notNeeded: number;
  notTried: number;
}

export async function fullTextCounts(): Promise<FullTextCounts> {
  const db = await getDb();
  const row = await db.getFirstAsync<FullTextCounts>(`
    SELECT COALESCE(SUM(full_status = 'ok'), 0) AS saved,
           COALESCE(SUM(full_status = 'failed'), 0) AS failed,
           COALESCE(SUM(full_status = 'skipped'), 0) AS notNeeded,
           COALESCE(SUM(full_status IS NULL), 0) AS notTried
    FROM articles`);
  return row ?? { saved: 0, failed: 0, notNeeded: 0, notTried: 0 };
}

async function onUnmeteredNetwork(): Promise<boolean> {
  try {
    const { type } = await Network.getNetworkStateAsync();
    return type === Network.NetworkStateType.WIFI || type === Network.NetworkStateType.ETHERNET;
  } catch {
    return false;
  }
}

export interface FullTextBatchResult {
  saved: number;
  /** Articles that were looked at (downloaded or found not to need it). */
  checked: number;
  failed: number;
  /** The first failure's reason, to show the user. */
  firstError?: string;
  /** Set when nothing ran: the setting is off, or it is waiting for Wi-Fi. */
  skippedBecause?: 'off' | 'not-on-wifi';
}

let fullTextRun: Promise<FullTextBatchResult> | null = null;

/**
 * Download full articles for the newest unread (or starred) articles whose feed only gives a summary.
 * Automatic runs respect the user's setting (off / Wi-Fi only); `manual` runs (the user asked) ignore it.
 * Concurrent automatic calls share one run.
 */
export function downloadFullTextBatch(options: { manual?: boolean } = {}): Promise<FullTextBatchResult> {
  if (options.manual) {
    // Wait for any automatic run to finish, then run regardless of the network setting.
    return (fullTextRun ?? Promise.resolve(null)).then(() => doFullTextBatch(true)).finally(notifyDataChanged);
  }
  if (!fullTextRun) {
    fullTextRun = doFullTextBatch(false).finally(() => {
      fullTextRun = null;
      notifyDataChanged();
    });
  }
  return fullTextRun;
}

/** Whether automatic full-article downloads would run right now. */
export async function fullTextWaitingForWifi(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.fullText === 'wifi' && !(await onUnmeteredNetwork());
}

async function doFullTextBatch(manual: boolean): Promise<FullTextBatchResult> {
  const settings = await loadSettings();
  if (!manual && settings.fullText === 'off') return { saved: 0, checked: 0, failed: 0, skippedBecause: 'off' };
  if (!manual && settings.fullText === 'wifi' && !(await onUnmeteredNetwork())) {
    return { saved: 0, checked: 0, failed: 0, skippedBecause: 'not-on-wifi' };
  }

  const db = await getDb();
  // Automatic runs: unread or starred articles not tried yet. When the user asks: every article
  // without its full text, including read ones and earlier failures.
  const candidates = await db.getAllAsync<{ id: number; url: string | null; content: string }>(
    manual
      ? "SELECT id, url, content FROM articles WHERE full_status IS NULL OR full_status = 'failed' ORDER BY sort_at DESC LIMIT 300"
      : 'SELECT id, url, content FROM articles WHERE full_status IS NULL AND (is_read = 0 OR is_starred = 1) ORDER BY sort_at DESC LIMIT 200',
  );
  const queue: typeof candidates = [];
  for (const a of candidates) {
    if (a.url && looksLikeSummary(a.content)) {
      if (queue.length < FULLTEXT_PER_REFRESH) queue.push(a);
    } else {
      // The feed already carries the article; don't check it again.
      await db.runAsync("UPDATE articles SET full_status = 'skipped' WHERE id = ?", a.id);
    }
  }

  // Stop before the storage limit so we don't download pages only to prune them again.
  const limit = settings.maxStorageMB > 0 ? settings.maxStorageMB * 1_000_000 * 0.95 : Infinity;
  let used = await storedBytes();
  let saved = 0;
  let failed = 0;
  let firstError: string | undefined;
  let next = 0;
  const worker = async () => {
    while (next < queue.length && used < limit) {
      const result = await downloadFullText(queue[next++]);
      if (result.status === 'ok') {
        saved++;
        used = await storedBytes();
        notifyDataChanged(); // lists show the "Full article" marker as each one lands
      } else if (result.status === 'failed') {
        failed++;
        firstError ??= result.error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FULLTEXT_CONCURRENCY, queue.length) }, worker));
  await prune(settings);
  return { saved, checked: candidates.length, failed, firstError };
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface FeedCandidate {
  url: string;
  title: string;
}

/** Addresses many sites serve feeds from without advertising them on their homepage. */
const COMMON_FEED_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml', '/feeds/posts/default'];

/**
 * The feeds a site offers: the address itself if it is a feed, the feeds its page advertises,
 * or else the first common feed address that works.
 */
export async function findFeeds(input: string): Promise<FeedCandidate[]> {
  const { res, url } = await fetchPreferHttps(normalizeUrl(input));
  if (!res.ok) throw new Error(`The site answered with an error (HTTP ${res.status}).`);
  const body = await res.text();
  const pageUrl = res.url || url;
  if (looksLikeFeed(body)) return [{ url, title: parseFeed(body, url).title }];

  const advertised = discoverFeeds(body, pageUrl);
  if (advertised.length) return advertised.map((f) => ({ url: f.url, title: f.title ?? f.url }));

  const origin = originOf(pageUrl);
  if (!origin) return [];
  for (const path of COMMON_FEED_PATHS) {
    try {
      const r = await fetchWithTimeout(origin + path);
      if (!r.ok) continue;
      const text = await r.text();
      if (looksLikeFeed(text)) return [{ url: origin + path, title: parseFeed(text, origin + path).title }];
    } catch {
      // try the next address
    }
  }
  return [];
}

/** Subscribe to a feed URL, or a web page that advertises one. Returns the new feed id. */
export async function addFeed(input: string, folder: string | null = null): Promise<number> {
  let { res, url } = await fetchPreferHttps(normalizeUrl(input));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  let body = await res.text();

  if (!looksLikeFeed(body)) {
    const candidates = discoverFeedLinks(body, res.url || url);
    if (!candidates.length) throw new Error('No RSS or Atom feed found at that address');
    ({ res, url } = await fetchPreferHttps(candidates[0]));
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
