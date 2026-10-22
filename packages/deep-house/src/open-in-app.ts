// **The app from the web page** (his word 10-21). Two ways in, on Apple's devices only (the app is for iPhone, iPad and
// the Mac; Windows, Linux and Android have none, and the page inside the app never offers itself):
// - **Safari's own banner** on iPhone and iPad (`<meta name="apple-itunes-app">`, index.html): "Open" with the app, "Get"
//   without it, closed once and remembered by Safari. Its `app-argument` follows the address, so Open lands on the
//   track or playlist being looked at (`syncAppBanner`).
// - **Open in app** in the share and ⋯ menus, for whoever closed the banner, and on the Mac, which has no banner: the
//   same link through the app's own `deephouse://` (Shell.open). A page cannot know whether the app is there, so if
//   the page is still in front a moment later, `nope` offers the App Store; nothing is opened without a press.

/** The app's listing. */
export const APP_STORE = 'https://apps.apple.com/app/id6824689539';
const APP_ID = '6824689539';

/** Whether this page may offer the app: an Apple device, and not the app's own page. */
export function appleDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if ((window as { deepHouseShell?: unknown }).deepHouseShell) return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(p) || /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
}

/** The app's own link for a query (a track's or a playlist's rows, without the `?`). */
export const appLink = (query: string): string => `deephouse://?${query.replace(/^\?/, '')}`;

/**
 * **Open in app**: the link through the app's scheme. If the page is still in front and visible after a moment, the
 * app did not take it (or the system is asking first), and `nope` says where to get it.
 */
export function openInApp(query: string, nope: () => void): void {
  let left = false;
  const gone = () => { left = true; };
  window.addEventListener('blur', gone, { once: true });
  document.addEventListener('visibilitychange', gone, { once: true });
  window.setTimeout(() => {
    window.removeEventListener('blur', gone);
    document.removeEventListener('visibilitychange', gone);
    if (!left && document.visibilityState === 'visible') nope();
  }, 1600);
  location.href = appLink(query);
}

/** Keep Safari's banner pointing at what plays: its `app-argument` follows the address, looked at every two seconds. */
export function syncAppBanner(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]');
  if (!meta || !appleDevice()) return;
  let said = '';
  const say = () => {
    const q = location.search.replace(/^\?/, '');
    if (q === said) return;
    said = q;
    meta.content = q ? `app-id=${APP_ID}, app-argument=${appLink(q)}` : `app-id=${APP_ID}`;
  };
  say();
  window.setInterval(say, 2000);
}
