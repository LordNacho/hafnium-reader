/**
 * A small built-in content filter for the page viewer. Ads and pop-ups are almost all loaded by scripts,
 * so the viewer runs with JavaScript off by default; this filter covers sites the user allows to run it.
 * The WebView can't block individual network requests, so it hides common ad and consent containers
 * and refuses top-level redirects to ad networks.
 */

/** Ad and tracking networks whose pages we never navigate to (redirect ads, pop-unders). */
const AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'criteo.com',
  'outbrain.com',
  'taboola.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'teads.tv',
  'smartadserver.com',
  'adform.net',
  'media.net',
  'revcontent.com',
  'mgid.com',
];

export function hostOf(url: string): string {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

export function isAdNavigation(url: string): boolean {
  const host = hostOf(url);
  return AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Element-hiding rules for common ad slots, sponsored widgets and cookie-consent overlays. */
const HIDE_SELECTORS = [
  'ins.adsbygoogle',
  '[id^="google_ads_"]',
  '[id^="div-gpt-ad"]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="amazon-adsystem.com"]',
  '[class*="ad-slot"]',
  '[class*="ad-container"]',
  '[class*="advert"]',
  '[id*="taboola"]',
  '[class*="taboola"]',
  '.OUTBRAIN',
  '[class*="outbrain"]',
  '[aria-label="Advertisement"]',
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '.fc-consent-root',
  '.qc-cmp2-container',
  '#CybotCookiebotDialog',
  '[id^="sp_message_container"]',
  '.didomi-popup-open #didomi-host',
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
];

/**
 * Dark styling for pages that only have a light design: invert the page's colours and turn images and
 * video back to normal. Pure CSS, so it works with JavaScript off and on both platforms.
 */
export const DARK_PAGE_CSS = `html { background: #fff !important; filter: invert(1) hue-rotate(180deg) !important; }
img, video, picture, canvas, iframe, embed, object, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`;

/** Pages with their own dark design must not be inverted (that would turn them light again). */
export function declaresDarkSupport(html: string): boolean {
  return /prefers-color-scheme\s*:\s*dark/i.test(html) || /<meta[^>]+name=["']?color-scheme["']?[^>]*content=["'][^"']*dark/i.test(html);
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Prepare a downloaded page for display without JavaScript: a base URL for its relative links, and dark styling. */
export function preparePageHtml(html: string, pageUrl: string, dark: boolean): string {
  const extra =
    (/<base\s/i.test(html) ? '' : `<base href="${escapeAttr(pageUrl)}">`) +
    (dark && !declaresDarkSupport(html) ? `<style id="hafnium-dark">${DARK_PAGE_CSS}</style>` : '');
  if (!extra) return html;
  const head = html.match(/<head\b[^>]*>/i);
  if (head && head.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + extra + html.slice(at);
  }
  return extra + html;
}

/** The same dark styling for pages allowed to run JavaScript; removed again if the page turns out to have a dark design. */
export const DARK_PAGE_SCRIPT = `(function () {
  var style = document.createElement('style');
  style.id = 'hafnium-dark';
  style.textContent = ${JSON.stringify(DARK_PAGE_CSS)};
  (document.head || document.documentElement).appendChild(style);
  document.addEventListener('DOMContentLoaded', function () {
    var html = document.documentElement.outerHTML;
    if (/prefers-color-scheme\\s*:\\s*dark/i.test(html) || document.querySelector('meta[name="color-scheme"][content*="dark"]')) {
      style.remove();
    }
  });
})();
true;`;

/** Runs before the page's own scripts when JavaScript is allowed for a site. */
export const PAGE_FILTER_SCRIPT = `(function () {
  var css = ${JSON.stringify(`${HIDE_SELECTORS.join(',\n')} { display: none !important; }
html, body { overflow: auto !important; position: static !important; }`)};
  function add() {
    if (document.getElementById('hafnium-filter')) return;
    var style = document.createElement('style');
    style.id = 'hafnium-filter';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  add();
  document.addEventListener('DOMContentLoaded', add);
  window.open = function () { return null; };
})();
true;`;
