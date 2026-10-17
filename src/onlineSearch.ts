/**
 * Find websites by name when they aren't in the built-in directory. Only runs when the user taps
 * "Search the web": the search words go to Wikidata (Wikimedia's open database), which maps names of
 * publications, blogs and organisations to their official websites. The app then looks for feeds on
 * the chosen site itself.
 */
import { hostOf } from './lib/pageFilter';

// Wikimedia asks API clients to identify themselves with a contact.
const USER_AGENT = 'HafniumReader/1.0 (https://reader.hafnium.ltd; info@hafnium.ltd)';
const API = 'https://www.wikidata.org/w/api.php';
const TIMEOUT_MS = 10000;

export interface SiteResult {
  title: string;
  description: string;
  url: string;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`Search service answered HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface WikidataHit {
  id: string;
  label?: string;
  description?: string;
}

async function searchEntities(query: string, language: string): Promise<WikidataHit[]> {
  const params = `action=wbsearchentities&format=json&type=item&limit=15&language=${language}&uselang=${language}&search=${encodeURIComponent(query)}`;
  const data = (await getJson(`${API}?${params}`)) as { search?: WikidataHit[] };
  return data.search ?? [];
}

/** Official websites (Wikidata property P856) for the given items. */
async function officialWebsites(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const data = (await getJson(`${API}?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`)) as {
    entities?: Record<string, { claims?: { P856?: { mainsnak?: { datavalue?: { value?: unknown } } }[] } }>;
  };
  const out: Record<string, string> = {};
  for (const [id, entity] of Object.entries(data.entities ?? {})) {
    const url = entity.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) out[id] = url;
  }
  return out;
}

/** Websites matching a name, best matches first. Searches English labels, then Danish ones if few match. */
export async function searchSitesOnline(query: string): Promise<SiteResult[]> {
  const results: SiteResult[] = [];
  const seenHosts = new Set<string>();
  for (const language of ['en', 'da']) {
    const hits = await searchEntities(query, language);
    const sites = await officialWebsites(hits.map((h) => h.id));
    for (const hit of hits) {
      const url = sites[hit.id];
      const host = url ? hostOf(url) : '';
      if (!url || !host || seenHosts.has(host)) continue;
      seenHosts.add(host);
      results.push({ title: hit.label ?? host, description: hit.description ?? '', url });
    }
    if (results.length >= 3) break;
  }
  return results.slice(0, 10);
}

/** A website address to try for a name, e.g. "stratechery" -> "stratechery.com". */
export function guessDomain(query: string): string | null {
  const slug = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
  return slug.length >= 3 ? `${slug}.com` : null;
}
