// **Where a shared link points** (his iPhone 10-21: the app's Share showed a `deephouse://` link). A link the page
// hands to someone else is this page's own address on the web, a Pages preview's included; inside the Apple app the
// page is served from the app's own scheme, which opens nowhere else, so its links are the public site's.

/** The public site, the base of every link shared from inside the app. */
export const PUBLIC_SITE = 'https://deephouse.audio/';

/** The base a shared link is written on: this page's origin and path on the web, the public site in the app. */
export function pageBase(): string {
  if (typeof location === 'undefined') return PUBLIC_SITE;
  return location.protocol === 'http:' || location.protocol === 'https:' ? `${location.origin}${location.pathname}` : PUBLIC_SITE;
}
