import { XMLParser } from 'fast-xml-parser';
import { escapeHtml } from './html';

export interface OpmlFeed {
  url: string;
  title: string;
  siteUrl: string | null;
  folder: string | null;
}

type Outline = Record<string, unknown> & { outline?: Outline[] };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  htmlEntities: true,
  isArray: (name) => name === 'outline',
});

/**
 * Parse an OPML subscription list (e.g. the export from The Old Reader, Feedly, Inoreader).
 * Nested outlines become folders; only the top-level folder name is kept.
 */
export function parseOpml(xml: string): OpmlFeed[] {
  const doc = parser.parse(xml);
  const body = doc?.opml?.body;
  if (!body) throw new Error('Not an OPML file (no <opml><body>)');

  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const walk = (outlines: Outline[] | undefined, folder: string | null) => {
    for (const o of outlines ?? []) {
      const url = str(o.xmlUrl) ?? str(o.xmlurl);
      const title = str(o.title) ?? str(o.text);
      if (url) {
        if (!seen.has(url)) {
          seen.add(url);
          feeds.push({ url, title: title ?? url, siteUrl: str(o.htmlUrl) ?? str(o.htmlurl), folder });
        }
      } else {
        walk(o.outline, folder ?? title);
      }
    }
  };
  walk(body.outline, null);
  return feeds;
}

export function buildOpml(feeds: OpmlFeed[], title = 'RSS Reader subscriptions'): string {
  const attr = (s: string) => escapeHtml(s);
  const line = (f: OpmlFeed, indent: string) =>
    `${indent}<outline type="rss" text="${attr(f.title)}" title="${attr(f.title)}" xmlUrl="${attr(f.url)}"` +
    (f.siteUrl ? ` htmlUrl="${attr(f.siteUrl)}"` : '') +
    '/>';

  const folders = new Map<string | null, OpmlFeed[]>();
  for (const f of feeds) folders.set(f.folder, [...(folders.get(f.folder) ?? []), f]);

  const out: string[] = [];
  for (const [folder, items] of folders) {
    if (folder === null) {
      items.forEach((f) => out.push(line(f, '    ')));
    } else {
      out.push(`    <outline text="${attr(folder)}" title="${attr(folder)}">`);
      items.forEach((f) => out.push(line(f, '      ')));
      out.push('    </outline>');
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="1.0">',
    `  <head><title>${attr(title)}</title></head>`,
    '  <body>',
    ...out,
    '  </body>',
    '</opml>',
    '',
  ].join('\n');
}
