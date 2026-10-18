import * as SQLite from 'expo-sqlite';

/**
 * One shared connection for the UI and the background refresh task. The background task runs
 * without React, so we don't use SQLiteProvider; screens call getDb() instead.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_VERSION = 2;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('reader.db');
      await migrate(db);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/**
 * Run a write transaction on the shared connection, one at a time. expo-sqlite's exclusive transactions use a
 * second connection, and while one is writing every other write fails with "database is locked" (SQLITE_BUSY),
 * so the app queues its transactions here instead. Single-statement writes issued meanwhile on the shared
 * connection simply join the open transaction.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function withWriteTransaction<T>(task: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const db = await getDb();
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      const result = await task(db);
      await db.execAsync('COMMIT');
      return result;
    } catch (e) {
      try {
        await db.execAsync('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw e;
    }
  });
  writeQueue = run.catch(() => {});
  return run;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  // Wait up to 5 s for another connection (e.g. a background refresh) to finish writing instead of failing.
  await db.execAsync('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        site_url TEXT,
        folder TEXT,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
        guid TEXT NOT NULL,
        url TEXT,
        title TEXT NOT NULL,
        author TEXT,
        published_at INTEGER,
        fetched_at INTEGER NOT NULL,
        sort_at INTEGER NOT NULL,
        preview TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_starred INTEGER NOT NULL DEFAULT 0,
        UNIQUE (feed_id, guid)
      );
      CREATE INDEX IF NOT EXISTS articles_feed_sort ON articles (feed_id, sort_at DESC);
      CREATE INDEX IF NOT EXISTS articles_sort ON articles (sort_at DESC);
      CREATE INDEX IF NOT EXISTS articles_unread ON articles (is_read, sort_at DESC);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }
  if (version < 2) {
    // Full articles downloaded from the linked page; full_status is 'ok' | 'failed' | 'skipped' (feed text is enough).
    await db.execAsync(`
      ALTER TABLE articles ADD COLUMN full_content TEXT;
      ALTER TABLE articles ADD COLUMN full_status TEXT;
      ALTER TABLE articles ADD COLUMN full_fetched_at INTEGER;
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export interface Feed {
  id: number;
  url: string;
  title: string;
  site_url: string | null;
  folder: string | null;
  last_fetched_at: number | null;
  last_error: string | null;
  unread: number;
}

export interface ArticleSummary {
  id: number;
  feed_id: number;
  feed_title: string;
  title: string;
  preview: string;
  sort_at: number;
  is_read: number;
  is_starred: number;
  full_status: 'ok' | 'failed' | 'skipped' | null;
}

export interface Article extends ArticleSummary {
  url: string | null;
  author: string | null;
  content: string;
  full_content: string | null;
  full_status: 'ok' | 'failed' | 'skipped' | null;
}

export type ArticleFilter = { feedId?: number; folder?: string; starred?: boolean; unreadOnly?: boolean };

export async function listFeeds(): Promise<Feed[]> {
  const db = await getDb();
  return db.getAllAsync<Feed>(`
    SELECT f.id, f.url, f.title, f.site_url, f.folder, f.last_fetched_at, f.last_error,
           (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id AND a.is_read = 0) AS unread
    FROM feeds f
    ORDER BY f.folder IS NOT NULL, f.folder COLLATE NOCASE, f.title COLLATE NOCASE`);
}

export async function getFeed(id: number): Promise<Feed | null> {
  return (await listFeeds()).find((f) => f.id === id) ?? null;
}

function whereFor(filter: ArticleFilter): { sql: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filter.feedId != null) {
    clauses.push('a.feed_id = ?');
    params.push(filter.feedId);
  }
  if (filter.folder != null) {
    clauses.push('f.folder = ?');
    params.push(filter.folder);
  }
  if (filter.starred) clauses.push('a.is_starred = 1');
  if (filter.unreadOnly) clauses.push('a.is_read = 0');
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export async function listArticles(filter: ArticleFilter, limit = 500): Promise<ArticleSummary[]> {
  const db = await getDb();
  const { sql, params } = whereFor(filter);
  return db.getAllAsync<ArticleSummary>(
    `SELECT a.id, a.feed_id, f.title AS feed_title, a.title, a.preview, a.sort_at, a.is_read, a.is_starred, a.full_status
     FROM articles a JOIN feeds f ON f.id = a.feed_id
     ${sql}
     ORDER BY a.sort_at DESC LIMIT ?`,
    ...params,
    limit,
  );
}

export async function getArticle(id: number): Promise<Article | null> {
  const db = await getDb();
  return db.getFirstAsync<Article>(
    `SELECT a.*, f.title AS feed_title FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE a.id = ?`,
    id,
  );
}

/** Retry a small write if another connection (e.g. a background refresh) is holding the database. */
async function retryIfBusy<T>(write: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await write();
    } catch (e) {
      if (i >= attempts || !/database is locked|SQLITE_BUSY/i.test(String(e))) throw e;
      await new Promise((resolve) => setTimeout(resolve, 400 * i));
    }
  }
}

export async function setRead(id: number, read: boolean) {
  const db = await getDb();
  await retryIfBusy(() => db.runAsync('UPDATE articles SET is_read = ? WHERE id = ?', read ? 1 : 0, id));
}

export async function setStarred(id: number, starred: boolean) {
  const db = await getDb();
  await retryIfBusy(() => db.runAsync('UPDATE articles SET is_starred = ? WHERE id = ?', starred ? 1 : 0, id));
}

export async function markAllRead(filter: ArticleFilter) {
  const db = await getDb();
  const { sql, params } = whereFor(filter);
  await db.runAsync(
    `UPDATE articles SET is_read = 1 WHERE id IN (SELECT a.id FROM articles a JOIN feeds f ON f.id = a.feed_id ${sql})`,
    ...params,
  );
}

export async function deleteFeed(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM feeds WHERE id = ?', id);
}

export async function renameFeed(id: number, title: string) {
  const db = await getDb();
  await db.runAsync('UPDATE feeds SET title = ? WHERE id = ?', title, id);
}

export async function storageStats(): Promise<{ feeds: number; articles: number; unread: number; starred: number; bytes: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ feeds: number; articles: number; unread: number; starred: number; bytes: number }>(`
    SELECT (SELECT COUNT(*) FROM feeds) AS feeds,
           COUNT(*) AS articles,
           COALESCE(SUM(is_read = 0), 0) AS unread,
           COALESCE(SUM(is_starred = 1), 0) AS starred,
           COALESCE(SUM(LENGTH(content) + LENGTH(preview) + LENGTH(COALESCE(full_content, ''))), 0) AS bytes
    FROM articles`);
  return row ?? { feeds: 0, articles: 0, unread: 0, starred: 0, bytes: 0 };
}

export async function deleteReadArticles() {
  const db = await getDb();
  await db.runAsync('DELETE FROM articles WHERE is_read = 1 AND is_starred = 0');
  try {
    await db.execAsync('VACUUM'); // give the space back to the phone
  } catch {
    // a refresh is writing right now; the freed space is reused by new articles instead
  }
}
