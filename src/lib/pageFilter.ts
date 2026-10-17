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
