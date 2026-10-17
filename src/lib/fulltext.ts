import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { absolutizeUrls, escapeHtml, htmlToText } from './html';

/** Feed text shorter than this is treated as a teaser for the linked page. */
export const SUMMARY_MAX_CHARS = 1500;

export interface ExtractedArticle {
  content: string;
  textLength: number;
}

type Doc = ReturnType<typeof parseHTML>['document'];

const textLength = (html: string) => htmlToText(html, Number.MAX_SAFE_INTEGER).length;

/** Class names and button labels that mark "read more" style collapsible text. */
const EXPANDER = /read[\s_-]*more|show[\s_-]*more|see[\s_-]*more|load[\s_-]*more|continue[\s_-]*reading|expand|collaps|truncat|more[\s_-]*content|rest[\s_-]*of/i;

export function looksLikeSummary(feedHtml: string): boolean {
  return textLength(feedHtml) < SUMMARY_MAX_CHARS;
}

/** JSON-LD objects in the page (schema.org NewsArticle and friends), flattened out of arrays and @graph. */
function jsonLdNodes(document: Doc): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      nodes.push(v as Record<string, unknown>);
      visit((v as Record<string, unknown>)['@graph']);
    }
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      visit(JSON.parse(script.textContent ?? ''));
    } catch {
      // ignore malformed structured data
    }
  }
  return nodes;
}

/** Publishers mark paid articles with isAccessibleForFree: false; we never unhide or lift text from those. */
function isPaywalled(nodes: Record<string, unknown>[]): boolean {
  return nodes.some((n) => String(n.isAccessibleForFree).toLowerCase() === 'false');
}

/**
 * Sites with a "show more" button usually ship the rest of the story in the page, hidden.
 * Unhide containers that are marked as collapsible, and drop the buttons themselves.
 */
function revealCollapsedText(document: Doc) {
  const hidden = document.querySelectorAll('[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]');
  for (const el of Array.from(hidden)) {
    const marker = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''} ${el.parentElement?.getAttribute('class') ?? ''}`;
    if (EXPANDER.test(marker)) {
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('style');
    }
  }
  for (const el of Array.from(document.querySelectorAll('button, a[role="button"]'))) {
    if (EXPANDER.test(`${el.textContent ?? ''} ${el.getAttribute('class') ?? ''}`)) el.remove();
  }
}

/** Plain-text articleBody from structured data, as paragraphs. */
function structuredDataBody(nodes: Record<string, unknown>[]): string | null {
  const body = nodes.map((n) => n.articleBody).find((b): b is string => typeof b === 'string' && b.trim().length > 0);
  if (!body) return null;
  return body
    .split(/\n\s*\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n');
}

/** Pull the readable article out of a web page, the way a browser's reader mode does. */
export function extractArticle(html: string, pageUrl: string): ExtractedArticle | null {
  const { document } = parseHTML(html);
  const nodes = jsonLdNodes(document); // read before Readability, which rewrites the document
  const paywalled = isPaywalled(nodes);
  if (!paywalled) revealCollapsedText(document);

  // linkedom's documents are close enough to the DOM for Readability, but their types differ.
  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  let best: ExtractedArticle | null = article?.content
    ? { content: absolutizeUrls(article.content, pageUrl), textLength: (article.textContent ?? '').trim().length }
    : null;

  const structured = paywalled ? null : structuredDataBody(nodes);
  if (structured) {
    const len = textLength(structured);
    if (!best || len > best.textLength * 1.2) best = { content: structured, textLength: len };
  }
  return best;
}

/** Keep the downloaded page only when it adds real text over what the feed already gave us. */
export function isWorthKeeping(extracted: ExtractedArticle, feedHtml: string): boolean {
  return extracted.textLength >= 500 && extracted.textLength > textLength(feedHtml) * 1.5;
}
