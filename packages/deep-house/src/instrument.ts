// Exception tracking: Sentry's browser SDK, errors only.
//
// This is the first import of the page (src/ring.ts), so the global handlers
// are installed before any other module runs and an error thrown while the
// page assembles is caught too. It reports **only where a listener is**: a
// production build served from a real host. The dev server and every check
// that drives a built page do so from localhost or 127.0.0.1, and a page
// there reports nothing, so a scenario that throws on purpose (a bad link, a
// failed open) never reaches the dashboard. Errors only — no tracing, no
// session replay, no logs: nothing about the listener is sent beyond what the
// SDK needs to place a stack trace; this SDK sends no personal data unless told to, and it is not told to.
//
// The DSN is a public key by design (it can only write events, never read
// them), which is why it stands in the bundle and not in an environment
// variable a build machine would have to be given.
import * as Sentry from '@sentry/browser';

const host = typeof location === 'undefined' ? '' : location.hostname;
const local = host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local');
const environment = host === 'deephouse.audio' ? 'production' : host.endsWith('.github.io') ? 'preview' : import.meta.env.MODE;

// **As little as the SDK can send and still place an error** (Eugene, 09-24:
// "collect as little info about users as possible, only errors"). Of the
// twelve integrations the SDK turns on by itself, four are not about errors
// and are left out: `Breadcrumbs` (the listener's clicks, with the element
// pressed, every fetch and every console line, sent along with the error),
// `Console` (console lines as events), `BrowserSession` (a session envelope
// on every load, which is a count of visits) and `CultureContext` (locale and
// time zone). What stays catches an error, links its causes, keeps the two
// halves of one fault to one event, and hands over the stack. No session, no
// breadcrumbs, no client outcome reports, and the event is trimmed once more
// in `beforeSend`: no trace, no referrer, no user, the address without its
// query. The user agent stays, because a fault in one browser's audio
// engine is a different fault from another's and the stack alone does not
// say which.
const LEFT_OUT = new Set(['Breadcrumbs', 'Console', 'BrowserSession', 'CultureContext']);

// **The listener's switch** (round K25, Eugene: *"in About add a switch to turn
// anonymous error recording on/off, and respect it when the app starts,
// cancelling the Sentry init"*). One key in this browser's storage, on unless
// it says `off`; read here, before anything is initialised, so a page opened
// with it off never starts the client at all (the SDK's modules declare no
// side effects: importing them installs nothing and sends nothing). Turned off
// in the About, the running client is disabled and closed there and then;
// turned on, the client starts there and then, not at the next load.
export const REPORTS_KEY = 'deep-house:error-reports';
/** Whether this listener wants error reports: yes unless they said no. */
export function reportsWanted(): boolean {
  try { return localStorage.getItem(REPORTS_KEY) !== 'off'; } catch (e) { return true; }
}
/** Whether a client is running and would send (never on localhost or in dev). */
export function reportsRunning(): boolean {
  const c = Sentry.getClient();
  return !!c && c.getOptions().enabled !== false;
}
/** The switch: stored, and honoured now. */
export function setReports(on: boolean): void {
  try { localStorage.setItem(REPORTS_KEY, on ? 'on' : 'off'); } catch (e) { /* storage blocked: honoured for this page only */ }
  if (on) { if (!reportsRunning()) start(); return; }
  const c = Sentry.getClient();
  if (c) { c.getOptions().enabled = false; void Sentry.close(); }
}

const start = () => Sentry.init({
  dsn: 'https://419249c1ebf298486f24ed20fb0bbe78@o4512143286403072.ingest.us.sentry.io/4512143291842560',
  enabled: import.meta.env.PROD && !local,
  environment,
  release: `deep-house@${__APP_VERSION__}`,
  integrations: (defaults) => defaults.filter((i) => !LEFT_OUT.has(i.name)),
  maxBreadcrumbs: 0,
  beforeBreadcrumb: () => null,
  sendClientReports: false,
  // A browser extension's own errors are not the page's.
  denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-web-extension:\/\//i],
  beforeSend(event) {
    delete event.user;
    delete event.breadcrumbs;
    if (event.contexts) delete event.contexts.trace;
    if (event.request) {
      // The address is the save and the share; it carries no name, but the
      // query is the listener's spell and stays with them. A sound fault (K33)
      // carries the track's link as a field of its own (`tags.link`), so its
      // event has no page address at all.
      if (event.request.url) {
        if (event.tags && event.tags.fault) delete event.request.url;
        else event.request.url = event.request.url.split('?')[0];
      }
      if (event.request.headers) {
        const ua = event.request.headers['User-Agent'];
        event.request.headers = ua ? { 'User-Agent': ua } : {};
      }
    }
    return event;
  },
});

if (reportsWanted()) start();

export { Sentry };
