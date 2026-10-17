/// <reference types="jest" />
import { buildOpml, parseOpml } from '../src/lib/opml';
import { SAMPLE_FEEDS } from '../src/sampleFeeds';
import { extractArticle, isWorthKeeping, looksLikeSummary } from '../src/lib/fulltext';
import { hostOf, isAdNavigation, PAGE_FILTER_SCRIPT } from '../src/lib/pageFilter';
import { parseDate, parseFeed } from '../src/lib/feed';
import { absolutizeUrls, discoverFeedLinks, discoverFeeds, htmlToText, httpsVariant, originOf, stripMedia, upgradeInsecureMedia } from '../src/lib/html';
import { DIRECTORY, searchDirectory } from '../src/directory';

const OLD_READER_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head><title>The Old Reader subscriptions</title></head>
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Ars &amp; Technica" title="Ars &amp; Technica" type="rss" xmlUrl="https://feeds.arstechnica.com/arstechnica/index" htmlUrl="https://arstechnica.com"/>
      <outline text="HN" type="rss" xmlUrl="https://news.ycombinator.com/rss"/>
    </outline>
    <outline text="xkcd" title="xkcd" type="rss" xmlUrl="https://xkcd.com/atom.xml" htmlUrl="https://xkcd.com/"/>
    <outline text="dup" type="rss" xmlUrl="https://xkcd.com/atom.xml"/>
  </body>
</opml>`;

describe('opml', () => {
  it('parses folders, titles and dedupes', () => {
    expect(parseOpml(OLD_READER_OPML)).toEqual([
      { url: 'https://feeds.arstechnica.com/arstechnica/index', title: 'Ars & Technica', siteUrl: 'https://arstechnica.com', folder: 'Tech' },
      { url: 'https://news.ycombinator.com/rss', title: 'HN', siteUrl: null, folder: 'Tech' },
      { url: 'https://xkcd.com/atom.xml', title: 'xkcd', siteUrl: 'https://xkcd.com/', folder: null },
    ]);
  });
  it('round-trips through buildOpml', () => {
    const feeds = parseOpml(OLD_READER_OPML);
    expect(parseOpml(buildOpml(feeds))).toEqual(feeds);
  });
  it('rejects non-OPML', () => {
    expect(() => parseOpml('<html><body/></html>')).toThrow(/OPML/);
  });
});

describe('feed parsing', () => {
  it('parses RSS 2.0 with content:encoded and CDATA', () => {
    const f = parseFeed(
      `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>Blog &amp; Co</title><link>https://example.com/</link><atom:link href="https://example.com/feed" rel="self"/>
      <item><title>First</title><link>/posts/1</link><guid isPermaLink="false">id-1</guid>
        <pubDate>Tue, 10 Jun 2003 04:00:00 GMT</pubDate><dc:creator>Ann</dc:creator>
        <description>short</description><content:encoded><![CDATA[<p>Full <b>body</b></p>]]></content:encoded></item>
      <item><title>Second</title><link>https://example.com/2</link><description>&lt;p&gt;Escaped&lt;/p&gt;</description><pubDate>Wed, 11 Jun 2003 09:30:00 -0500</pubDate></item>
      </channel></rss>`,
      'https://example.com/feed',
    );
    expect(f.title).toBe('Blog & Co');
    expect(f.siteUrl).toBe('https://example.com/');
    expect(f.items[0]).toEqual({
      guid: 'id-1',
      url: 'https://example.com/posts/1',
      title: 'First',
      author: 'Ann',
      publishedAt: Date.UTC(2003, 5, 10, 4),
      content: '<p>Full <b>body</b></p>',
    });
    expect(f.items[1].guid).toBe('https://example.com/2');
    expect(f.items[1].content).toBe('<p>Escaped</p>');
    expect(f.items[1].publishedAt).toBe(Date.UTC(2003, 5, 11, 14, 30));
  });

  it('parses Atom with html, xhtml and text content', () => {
    const f = parseFeed(
      `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>xkcd.com</title><link href="https://xkcd.com/" rel="alternate"/><link href="https://xkcd.com/atom.xml" rel="self"/>
      <entry><title>Comic</title><link href="https://xkcd.com/1/" rel="alternate"/><updated>2026-10-14T00:00:00Z</updated><id>https://xkcd.com/1/</id>
        <summary type="html">&lt;img src="a.png" title="x &amp;amp; y"/&gt;</summary></entry>
      <entry><title type="html">A &amp;amp; B</title><link href="/2/"/><published>2026-10-15T10:00:00+02:00</published><id>tag:2</id>
        <author><name>Randall</name></author><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hi</p></div></content></entry>
      <entry><title>Plain</title><id>tag:3</id><content>1 &lt; 2</content></entry>
    </feed>`,
      'https://xkcd.com/atom.xml',
    );
    expect(f.siteUrl).toBe('https://xkcd.com/');
    expect(f.items[0].content).toBe('<img src="a.png" title="x &amp; y"/>');
    expect(f.items[0].publishedAt).toBe(Date.UTC(2026, 9, 14));
    expect(f.items[1].url).toBe('https://xkcd.com/2/');
    expect(f.items[1].author).toBe('Randall');
    expect(f.items[1].content).toContain('<p>Hi</p>');
    expect(f.items[1].publishedAt).toBe(Date.UTC(2026, 9, 15, 8));
    expect(f.items[2].content).toBe('1 &lt; 2');
    expect(f.items[2].url).toBeNull();
  });

  it('parses RSS 1.0 (RDF)', () => {
    const f = parseFeed(
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel rdf:about="https://s.org/"><title>Slash</title><link>https://s.org/</link></channel>
      <item rdf:about="https://s.org/a"><title>A</title><link>https://s.org/a</link><dc:date>2026-01-02T03:04:05Z</dc:date></item>
    </rdf:RDF>`,
      'https://s.org/rss',
    );
    expect(f.title).toBe('Slash');
    expect(f.items).toHaveLength(1);
    expect(f.items[0].guid).toBe('https://s.org/a');
    expect(f.items[0].publishedAt).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
  });

  it('rejects HTML pages', () => {
    expect(() => parseFeed('<html><head></head></html>', 'https://x')).toThrow();
  });

  it('parses date variants', () => {
    expect(parseDate('Mon, 5 Oct 26 12:00 EST')).toBe(Date.UTC(2026, 9, 5, 17));
    expect(parseDate('2026-10-05')).toBe(Date.UTC(2026, 9, 5));
    expect(parseDate('garbage')).toBeNull();
  });
});

describe('full-text extraction', () => {
  const paragraph = (n: number) =>
    `<p>Paragraph ${n} of the story. The harbour froze early this year, and the ferries ran late for a week while the ice breakers worked through the channel near the old customs house.</p>`;
  const page = `<!doctype html><html><head><title>Ferries</title></head><body>
    <nav><a href="/">Home</a> <a href="/news">News</a> <a href="/sport">Sport</a></nav>
    <div class="ad">Buy now! Limited offer!</div>
    <article><h1>Ferries run late as harbour freezes</h1>${Array.from({ length: 8 }, (_, i) => paragraph(i + 1)).join('')}
      <img src="/img/ice.jpg"></article>
    <footer>Comments (12) · Share · Cookie settings</footer></body></html>`;

  it('keeps the article body and drops the page furniture', () => {
    const a = extractArticle(page, 'https://news.example/2026/ferries');
    expect(a).not.toBeNull();
    expect(a!.content).toContain('Paragraph 8 of the story');
    expect(a!.content).not.toContain('Limited offer');
    expect(a!.content).not.toContain('Cookie settings');
    expect(a!.content).toContain('https://news.example/img/ice.jpg');
    expect(a!.textLength).toBeGreaterThan(1000);
  });

  it('reveals text hidden behind a "read more" button', () => {
    const collapsed = `<html><body><article><h1>Ferries</h1>${paragraph(1)}${paragraph(2)}
      <div class="article-truncated" hidden>${Array.from({ length: 6 }, (_, i) => paragraph(i + 3)).join('')}</div>
      <button class="btn">Read more</button></article></body></html>`;
    const a = extractArticle(collapsed, 'https://news.example/a')!;
    expect(a.content).toContain('Paragraph 8 of the story');
    expect(a.content).not.toContain('Read more');
  });

  it('uses structured-data articleBody when it is the longer text', () => {
    const body = Array.from({ length: 10 }, (_, i) => `Line ${i + 1} of the full story about the frozen harbour and the late ferries.`).join('\n\n');
    const teaser = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', articleBody: body })}</script></head>
      <body><article><h1>Ferries</h1>${paragraph(1)}</article></body></html>`;
    const a = extractArticle(teaser, 'https://news.example/b')!;
    expect(a.content).toContain('<p>Line 10 of the full story');
  });

  it('does not unhide or lift text from paywalled articles', () => {
    const body = Array.from({ length: 10 }, (_, i) => `Paid line ${i + 1} of the members-only story.`).join('\n\n');
    const paid = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', isAccessibleForFree: false, articleBody: body })}</script></head>
      <body><article><h1>Ferries</h1>${paragraph(1)}${paragraph(2)}<div class="read-more-content" hidden>${paragraph(99)}</div></article></body></html>`;
    const a = extractArticle(paid, 'https://news.example/c');
    expect(a?.content ?? '').not.toContain('Paid line');
    expect(a?.content ?? '').not.toContain('Paragraph 99');
  });

  it('treats short feed text as a summary', () => {
    expect(looksLikeSummary('<p>Ferries run late. Read more…</p>')).toBe(true);
    expect(looksLikeSummary(`<div>${paragraph(1).repeat(12)}</div>`)).toBe(false);
  });

  it('only keeps pages that add real text over the feed', () => {
    const extracted = { content: '', textLength: 4000 };
    expect(isWorthKeeping(extracted, '<p>Short teaser.</p>')).toBe(true);
    expect(isWorthKeeping(extracted, `<p>${'x'.repeat(3500)}</p>`)).toBe(false);
    expect(isWorthKeeping({ content: '', textLength: 300 }, '<p>Hi</p>')).toBe(false);
  });
});

describe('page filter', () => {
  it('reads host names without relying on URL()', () => {
    expect(hostOf('https://www.bbc.co.uk/news/world-123?x=1')).toBe('bbc.co.uk');
    expect(hostOf('http://user@Example.COM:8080/a')).toBe('example.com');
    expect(hostOf('not a url')).toBe('');
  });
  it('blocks navigations to ad networks only', () => {
    expect(isAdNavigation('https://ad.doubleclick.net/clk;123')).toBe(true);
    expect(isAdNavigation('https://www.taboola.com/redirect?u=x')).toBe(true);
    expect(isAdNavigation('https://www.theguardian.com/world/2026/oct/17/story')).toBe(false);
    expect(isAdNavigation('https://notdoubleclick.net.example.org/')).toBe(false);
  });
  it('builds a filter script that hides ads and blocks pop-up windows', () => {
    expect(PAGE_FILTER_SCRIPT).toContain('ins.adsbygoogle');
    expect(PAGE_FILTER_SCRIPT).toContain('window.open = function');
    expect(() => new Function(PAGE_FILTER_SCRIPT)).not.toThrow();
  });
});

describe('feed directory', () => {
  it('finds feeds by name, nickname and Danish spelling', () => {
    expect(searchDirectory('guardian').map((f) => f.title)).toContain('The Guardian – World');
    expect(searchDirectory('guardian science')[0].title).toBe('The Guardian – Science');
    expect(searchDirectory('dr nyheder').length).toBeGreaterThan(0);
    expect(searchDirectory('ingenioren')[0].title).toBe('Ingeniøren');
    expect(searchDirectory('nyt').some((f) => f.title.startsWith('The New York Times'))).toBe(true);
    expect(searchDirectory('   ')).toEqual([]);
  });
  it('has unique https addresses', () => {
    const urls = DIRECTORY.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => u.startsWith('https://'))).toBe(true);
  });
});

describe('sample feeds', () => {
  it('are unique https feeds in named folders', () => {
    const urls = SAMPLE_FEEDS.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const f of SAMPLE_FEEDS) {
      expect(f.url).toMatch(/^https:\/\//);
      expect(f.folder).toBeTruthy();
    }
  });
});

describe('html helpers', () => {
  it('discovers feed links', () => {
    const html = `<head><link rel="stylesheet" href="s.css"><link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
      <link type='application/atom+xml' rel='alternate' href='https://a.com/atom'></head>`;
    expect(discoverFeedLinks(html, 'https://a.com/blog/')).toEqual(['https://a.com/feed.xml', 'https://a.com/atom']);
  });
  it('discovers feed titles and origins', () => {
    const html = `<link rel="alternate" type="application/rss+xml" title="World &amp; Europe" href="/world/rss"><link rel="alternate" type="application/atom+xml" href="/atom">`;
    expect(discoverFeeds(html, 'https://news.example/')).toEqual([
      { url: 'https://news.example/world/rss', title: 'World & Europe' },
      { url: 'https://news.example/atom', title: null },
    ]);
    expect(originOf('https://www.example.com:8443/a/b?c')).toBe('https://www.example.com:8443');
    expect(originOf('nope')).toBeNull();
  });
  it('absolutizes relative URLs only', () => {
    expect(absolutizeUrls(`<img src="/a.png"><a href='b'>x</a><a href="#top"></a><img src="data:x"><a href="mailto:z">`, 'https://s.com/p/q'))
      .toBe(`<img src="https://s.com/a.png"><a href='https://s.com/p/b'>x</a><a href="#top"></a><img src="data:x"><a href="mailto:z">`);
  });
  it('prefers https', () => {
    expect(httpsVariant('http://a.com/feed')).toBe('https://a.com/feed');
    expect(httpsVariant('HTTP://a.com/')).toBe('https://a.com/');
    expect(httpsVariant('https://a.com/')).toBeNull();
    expect(upgradeInsecureMedia(`<img src="http://a.com/x.png" srcset="http://a.com/1.png 1x, http://a.com/2.png 2x"><a href="http://a.com">`))
      .toBe(`<img src="https://a.com/x.png" srcset="https://a.com/1.png 1x, https://a.com/2.png 2x"><a href="http://a.com">`);
  });
  it('strips images and embedded media', () => {
    expect(stripMedia('<p>a<img src="x.png"/>b</p><picture><source srcset="y"><img src="y"></picture><iframe src="v"></iframe><p>c</p>'))
      .toBe('<p>ab</p><p>c</p>');
  });
  it('makes text previews', () => {
    expect(htmlToText('<p>Hello&nbsp;<b>world</b></p><script>x()</script>', 8)).toBe('Hello w…');
  });
});
