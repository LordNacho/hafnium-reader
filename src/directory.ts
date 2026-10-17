/**
 * Built-in directory of well-known feeds, so people can subscribe by name without knowing a feed address.
 * Searching it happens on the device; nothing is sent anywhere. Every entry was checked against the live
 * feed with the app's parser when the list was made (2026-10-17).
 */
export interface DirectoryFeed {
  category: string;
  title: string;
  url: string;
  /** Extra words people might search for (brand nicknames, country, topic). */
  keywords: string;
}

export const DIRECTORY: DirectoryFeed[] = [
  { category: "World news", title: "BBC News – Top stories", url: "https://feeds.bbci.co.uk/news/rss.xml", keywords: "bbc" },
  { category: "World news", title: "BBC News – World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", keywords: "bbc" },
  { category: "World news", title: "The Guardian – International", url: "https://www.theguardian.com/international/rss", keywords: "guardian" },
  { category: "World news", title: "The Guardian – World", url: "https://www.theguardian.com/world/rss", keywords: "guardian" },
  { category: "World news", title: "The Guardian – Europe", url: "https://www.theguardian.com/europe/rss", keywords: "guardian" },
  { category: "World news", title: "The Guardian – UK", url: "https://www.theguardian.com/uk-news/rss", keywords: "guardian britain" },
  { category: "World news", title: "The Guardian – Opinion", url: "https://www.theguardian.com/commentisfree/rss", keywords: "guardian comment" },
  { category: "World news", title: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", keywords: "aljazeera" },
  { category: "World news", title: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", keywords: "npr america us" },
  { category: "World news", title: "The New York Times – World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", keywords: "nyt new york times" },
  { category: "World news", title: "The New York Times – Home page", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", keywords: "nyt new york times" },
  { category: "World news", title: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-all", keywords: "dw germany" },
  { category: "World news", title: "France 24", url: "https://www.france24.com/en/rss", keywords: "france" },
  { category: "World news", title: "Euronews", url: "https://www.euronews.com/rss?level=theme&name=news", keywords: "europe" },
  { category: "World news", title: "The Independent – World", url: "https://www.independent.co.uk/news/world/rss", keywords: "independent" },
  { category: "World news", title: "Sky News – World", url: "https://feeds.skynews.com/feeds/rss/world.xml", keywords: "sky" },
  { category: "Danish news", title: "DR Nyheder – Alle nyheder", url: "https://www.dr.dk/nyheder/service/feeds/allenyheder", keywords: "dr danmarks radio denmark dansk" },
  { category: "Danish news", title: "DR Nyheder – Indland", url: "https://www.dr.dk/nyheder/service/feeds/indland", keywords: "dr danmarks radio denmark dansk" },
  { category: "Danish news", title: "DR Nyheder – Udland", url: "https://www.dr.dk/nyheder/service/feeds/udland", keywords: "dr danmarks radio denmark dansk" },
  { category: "Danish news", title: "Politiken – Seneste nyt", url: "https://politiken.dk/rss/senestenyt.rss", keywords: "politiken denmark dansk" },
  { category: "Danish news", title: "Berlingske", url: "https://www.berlingske.dk/content/rss", keywords: "berlingske denmark dansk" },
  { category: "Danish news", title: "Information", url: "https://www.information.dk/feed", keywords: "information dagbladet denmark dansk" },
  { category: "Danish news", title: "The Local Denmark", url: "https://www.thelocal.dk/feeds/rss.php", keywords: "the local denmark copenhagen english" },
  { category: "Danish news", title: "The Copenhagen Post", url: "https://cphpost.dk/feed/", keywords: "copenhagen post cph denmark english" },
  { category: "Danish news", title: "Ingeniøren", url: "https://ing.dk/rss", keywords: "ingenioren ing engineering denmark dansk" },
  { category: "Technology", title: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", keywords: "ars" },
  { category: "Technology", title: "The Verge", url: "https://www.theverge.com/rss/index.xml", keywords: "verge" },
  { category: "Technology", title: "Wired", url: "https://www.wired.com/feed/rss", keywords: "wired" },
  { category: "Technology", title: "TechCrunch", url: "https://techcrunch.com/feed/", keywords: "startups" },
  { category: "Technology", title: "Hacker News – Front page", url: "https://hnrss.org/frontpage", keywords: "hn ycombinator" },
  { category: "Technology", title: "Engadget", url: "https://www.engadget.com/rss.xml", keywords: "gadgets" },
  { category: "Technology", title: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", keywords: "mit" },
  { category: "Technology", title: "The Register", url: "https://www.theregister.com/headlines.atom", keywords: "register el reg" },
  { category: "Technology", title: "LWN.net", url: "https://lwn.net/headlines/rss", keywords: "linux" },
  { category: "Technology", title: "The Guardian – Technology", url: "https://www.theguardian.com/technology/rss", keywords: "guardian" },
  { category: "Technology", title: "Daring Fireball", url: "https://daringfireball.net/feeds/main", keywords: "apple gruber" },
  { category: "Technology", title: "404 Media", url: "https://www.404media.co/rss/", keywords: "404" },
  { category: "Technology", title: "Rest of World", url: "https://restofworld.org/feed/latest", keywords: "global tech" },
  { category: "Science", title: "NASA", url: "https://www.nasa.gov/news-release/feed/", keywords: "space" },
  { category: "Science", title: "ESA – Space news", url: "https://www.esa.int/rssfeed/Our_Activities/Space_News", keywords: "european space agency" },
  { category: "Science", title: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/", keywords: "maths physics biology" },
  { category: "Science", title: "Nature", url: "https://www.nature.com/nature.rss", keywords: "journal" },
  { category: "Science", title: "New Scientist", url: "https://www.newscientist.com/feed/home/", keywords: "newscientist" },
  { category: "Science", title: "ScienceDaily", url: "https://www.sciencedaily.com/rss/top/science.xml", keywords: "science daily" },
  { category: "Science", title: "Phys.org", url: "https://phys.org/rss-feed/", keywords: "physics" },
  { category: "Science", title: "The Guardian – Science", url: "https://www.theguardian.com/science/rss", keywords: "guardian" },
  { category: "Business", title: "BBC News – Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", keywords: "bbc economy" },
  { category: "Business", title: "The Guardian – Business", url: "https://www.theguardian.com/business/rss", keywords: "guardian economy" },
  { category: "Business", title: "The Economist – Finance and economics", url: "https://www.economist.com/finance-and-economics/rss.xml", keywords: "economist economy" },
  { category: "Business", title: "Marginal Revolution", url: "https://marginalrevolution.com/feed", keywords: "economics blog cowen tabarrok" },
  { category: "Ideas and culture", title: "Aeon", url: "https://aeon.co/feed.rss", keywords: "essays philosophy" },
  { category: "Ideas and culture", title: "The New Yorker", url: "https://www.newyorker.com/feed/everything", keywords: "new yorker" },
  { category: "Ideas and culture", title: "Smithsonian Magazine", url: "https://www.smithsonianmag.com/rss/latest_articles/", keywords: "history" },
  { category: "Ideas and culture", title: "Longreads", url: "https://longreads.com/feed/", keywords: "long reads" },
  { category: "Ideas and culture", title: "Kottke.org", url: "https://feeds.kottke.org/main", keywords: "kottke blog" },
  { category: "Ideas and culture", title: "The Guardian – Culture", url: "https://www.theguardian.com/culture/rss", keywords: "guardian arts" },
  { category: "Sport", title: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml", keywords: "bbc" },
  { category: "Sport", title: "The Guardian – Sport", url: "https://www.theguardian.com/sport/rss", keywords: "guardian" },
  { category: "Sport", title: "The Guardian – Football", url: "https://www.theguardian.com/football/rss", keywords: "guardian soccer" },
  { category: "Comics", title: "xkcd", url: "https://xkcd.com/atom.xml", keywords: "webcomic" },
  { category: "Comics", title: "Saturday Morning Breakfast Cereal", url: "https://www.smbc-comics.com/comic/rss", keywords: "smbc webcomic" },
  { category: "Comics", title: "Poorly Drawn Lines", url: "https://poorlydrawnlines.com/feed/", keywords: "webcomic" },
  { category: "Comics", title: "The Oatmeal", url: "https://theoatmeal.com/feed/rss", keywords: "webcomic" },
];

export const DIRECTORY_CATEGORIES = [...new Set(DIRECTORY.map((f) => f.category))];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a');

/** Feeds whose title, address, category or keywords contain every word of the query, best matches first. */
export function searchDirectory(query: string): DirectoryFeed[] {
  const words = normalize(query).split(/[^a-z0-9.]+/).filter(Boolean);
  if (!words.length) return [];
  const scored = DIRECTORY.map((f) => {
    const title = normalize(f.title);
    const haystack = `${title} ${normalize(f.url)} ${normalize(f.category)} ${normalize(f.keywords)}`;
    if (!words.every((w) => haystack.includes(w))) return null;
    const score = words.reduce((n, w) => n + (title.startsWith(w) ? 3 : title.includes(w) ? 2 : 1), 0);
    return { f, score };
  }).filter((x): x is { f: DirectoryFeed; score: number } => x !== null);
  return scored.sort((a, b) => b.score - a.score).map((x) => x.f);
}
