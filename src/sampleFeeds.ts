import type { OpmlFeed } from './lib/opml';

/**
 * Offered on the empty Feeds screen so a first-time user (and App Review) sees real content in one tap.
 * Chosen for reliable https feeds that include article text, so offline reading works out of the box.
 */
export const SAMPLE_FEEDS: OpmlFeed[] = [
  { url: 'https://www.thelocal.dk/feeds/rss.php', title: 'The Local Denmark', siteUrl: 'https://www.thelocal.dk', folder: 'News' },
  { url: 'https://feeds.arstechnica.com/arstechnica/index', title: 'Ars Technica', siteUrl: 'https://arstechnica.com', folder: 'Technology' },
  { url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', siteUrl: 'https://www.theverge.com', folder: 'Technology' },
  { url: 'https://www.nasa.gov/news-release/feed/', title: 'NASA', siteUrl: 'https://www.nasa.gov', folder: 'Science' },
  { url: 'https://www.quantamagazine.org/feed/', title: 'Quanta Magazine', siteUrl: 'https://www.quantamagazine.org', folder: 'Science' },
  { url: 'https://xkcd.com/atom.xml', title: 'xkcd', siteUrl: 'https://xkcd.com', folder: 'Comics' },
];
