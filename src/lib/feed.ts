import { XMLParser } from 'fast-xml-parser';
import { decodeEntities, escapeHtml, resolveUrl, stripCdata } from './html';

export interface ParsedItem {
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  publishedAt: number | null;
  /** HTML body: full content when the feed provides it, otherwise the summary. */
  content: string;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  items: ParsedItem[];
}

const ARRAY_TAGS = new Set(['item', 'entry', 'link', 'category', 'author']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
  // Atom <content>/<summary> may hold inline XHTML; keep it raw rather than parsing it as XML.
  stopNodes: ['feed.entry.content', 'feed.entry.summary'],
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Text of a parsed node, whether it came through as a string or {#text, @_attr}. */
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return text((node as Record<string, unknown>)['#text']);
  return '';
}

/** Atom text constructs: type="text" (default), "html" (escaped) or "xhtml" (inline). */
function atomHtml(node: unknown): string {
  if (node == null) return '';
  const raw = stripCdata(text(node));
  const type = typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, string>)['@_type'] : undefined;
  if (type === 'xhtml') return raw;
  if (type === 'html' || type === 'text/html') return decodeEntities(raw);
  return escapeHtml(decodeEntities(raw)).replace(/\n/g, '<br>');
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const ZONES: Record<string, number> = { UT: 0, GMT: 0, Z: 0, EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7 };

/** Parse RFC 822 (RSS) and ISO 8601 (Atom) dates without relying on the JS engine's lenient parser. */
export function parseDate(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (iso) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0', tz] = iso;
    let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec);
    if (tz && tz.toUpperCase() !== 'Z') t -= offsetMinutes(tz) * 60000;
    return t;
  }
  const rfc = s.match(/(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*([+-]\d{4}|[a-z]+)?/i);
  if (rfc) {
    const [, d, mon, yRaw, h = '0', mi = '0', sec = '0', tz = 'GMT'] = rfc;
    const month = MONTHS[mon.toLowerCase()];
    if (month === undefined) return null;
    let y = +yRaw;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    let t = Date.UTC(y, month, +d, +h, +mi, +sec);
    if (/^[+-]/.test(tz)) t -= offsetMinutes(tz) * 60000;
    else t -= (ZONES[tz.toUpperCase()] ?? 0) * 3600000;
    return t;
  }
  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? null : fallback;
}

function offsetMinutes(tz: string): number {
  const m = tz.match(/([+-])(\d{2}):?(\d{2})/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
}

function atomLink(links: unknown, rel = 'alternate'): string | null {
  if (!Array.isArray(links)) return null;
  for (const l of links) {
    if (typeof l !== 'object' || l === null) continue;
    const r = (l as Record<string, string>)['@_rel'] ?? 'alternate';
    const href = (l as Record<string, string>)['@_href'];
    if (r === rel && href) return href;
  }
  return null;
}

function rssLink(links: unknown): string | null {
  // RSS <link> is text; an atom:link sibling (rel="self") may also be present as an attribute-only node.
  if (!Array.isArray(links)) return null;
  for (const l of links) {
    const t = text(l);
    if (t) return t;
  }
  return null;
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const doc = parser.parse(xml);

  if (doc.feed) {
    const feed = doc.feed;
    const siteUrl = atomLink(feed.link);
    const base = siteUrl ?? feedUrl;
    const items = (feed.entry ?? []).map((e: Record<string, unknown>): ParsedItem => {
      const link = atomLink(e.link);
      const url = link ? resolveUrl(link, base) : null;
      const content = atomHtml(e.content) || atomHtml(e.summary);
      const authors = e.author as Record<string, unknown>[] | undefined;
      return {
        guid: text(e.id) || url || text(e.title),
        url,
        title: decodeEntities(text(e.title)) || '(untitled)',
        author: authors?.length ? text(authors[0].name) || null : null,
        publishedAt: parseDate(text(e.published) || text(e.updated)),
        content,
      };
    });
    return { title: decodeEntities(text(feed.title)) || feedUrl, siteUrl, items };
  }

  const channel = doc.rss?.channel ?? doc['rdf:RDF']?.channel;
  if (channel) {
    const rawItems: Record<string, unknown>[] = doc.rss?.channel?.item ?? doc['rdf:RDF']?.item ?? [];
    const siteUrl = rssLink(channel.link);
    const items = rawItems.map((i): ParsedItem => {
      const link = rssLink(i.link);
      const url = link ? resolveUrl(link, siteUrl ?? feedUrl) : null;
      const content = text(i['content:encoded']) || text(i.description);
      return {
        guid: text(i.guid) || text(i['@_rdf:about']) || url || text(i.title),
        url,
        title: decodeEntities(text(i.title)) || '(untitled)',
        author: text(i['dc:creator']) || text(i.author) || null,
        publishedAt: parseDate(text(i.pubDate) || text(i['dc:date'])),
        content,
      };
    });
    return { title: decodeEntities(text(channel.title)) || feedUrl, siteUrl, items };
  }

  throw new Error('Not an RSS or Atom feed');
}

export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2000);
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}
