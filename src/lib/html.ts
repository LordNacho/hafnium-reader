const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/** Plain-text preview of an HTML fragment, collapsed to a single line. */
export function htmlToText(html: string, maxLength = 300): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1).trimEnd() + '…' : text;
}

export function resolveUrl(href: string, base?: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** The https form of a plain-http address, or null if it isn't plain http. */
export function httpsVariant(url: string): string | null {
  return /^http:\/\//i.test(url) ? 'https://' + url.slice(7) : null;
}

/** Load article images over https; phones block plain-http requests by default. */
export function upgradeInsecureMedia(html: string): string {
  return html.replace(/\b(src|srcset|poster)\s*=\s*(["'])([^"']*)\2/gi, (_m, attr: string, q: string, value: string) =>
    `${attr}=${q}${value.replace(/\bhttp:\/\//gi, 'https://')}${q}`,
  );
}

/** Remove images and embedded media so nothing is downloaded when images are turned off. */
export function stripMedia(html: string): string {
  return html
    .replace(/<(picture|video|audio|iframe|object|svg)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(img|source|embed|iframe)\b[^>]*>/gi, '');
}

/** Rewrite relative src/href attributes so stored HTML renders without a base URL. */
export function absolutizeUrls(html: string, base: string | null): string {
  if (!base) return html;
  return html.replace(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi, (m, attr: string, q: string, value: string) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value)) return m;
    return `${attr}=${q}${resolveUrl(decodeEntities(value), base)}${q}`;
  });
}

/** Find RSS/Atom feeds advertised by an HTML page via <link rel="alternate">. */
export function discoverFeedLinks(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((v) => v !== undefined);
    const rel = attr('rel')?.toLowerCase() ?? '';
    const type = attr('type')?.toLowerCase() ?? '';
    const href = attr('href');
    if (href && rel.split(/\s+/).includes('alternate') && /(rss|atom|rdf)\+xml/.test(type)) {
      const url = resolveUrl(decodeEntities(href), pageUrl);
      if (!found.includes(url)) found.push(url);
    }
  }
  return found;
}
