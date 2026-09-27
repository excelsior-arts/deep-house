// What the two suites stand on: the built site served on a port of its own, a
// check that what answers there is the build under test and not something
// else, the one browser tool they borrow, and the arithmetic of finishing —
// which is where a skip is kept apart from a pass.
//
// Nothing here is part of the page. It runs on a machine, it may read the
// scratch folder, and it is never served to a browser.
//
// Nothing here knows what music is being metered either, which is why round W
// of PLAN-V1-NEXT left it with the machine: a built site on a port, a proof of
// which build answered, the two locks that keep a run silent, and the
// arithmetic of finishing. Two roots matter and they are not the same one.
// `ROOT` is the **repository** — where `docs/` is written, where the one
// `node_modules` sits once npm's workspaces have hoisted it — and it is found
// by walking up until a package.json says it holds the workspaces, so the
// engine installed on its own somewhere else still answers with its own root.
// `TOOLS` is this folder, which is what the page is served `/tools/` out of:
// the meter is a check and travels with the machine it checks.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TOOLS = path.dirname(fileURLToPath(import.meta.url));

function repoRoot(): string {
  let dir = path.join(TOOLS, '..');
  const here = dir;
  for (let up = 0; up < 6; up++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, 'utf8')).workspaces) return dir;
      } catch { /* not ours */ }
    }
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  return here;
}
export const ROOT = repoRoot();
// **A port of its own, found free, unless `--port` names one** (09-24). Until
// then the two suites both took 6977, so `npm test` and a scenario run could
// not go at once — the second borrowed the first's server, or found it gone
// half-way, and a collision on 09-24 read as 101 `ERR_CONNECTION_REFUSED`
// reds — and two worktrees could not run either suite at the same time. So a
// suite asks the system for a free port when it serves (`serve`, below), and
// `PORT` is that port from then on: it is a live binding, so everything that
// reads it after the server is up reads the one it got.
//
// `--port <n>` is the other way and keeps what it always did: that port, and a
// server already answering there is borrowed — after it has proved it serves
// this build (`servedIsUnderTest`). 6975 is the dev server and is never
// touched; the two ports the machine view and the bench hold are refused too.
export const ASKED_PORT = portOf();
export let PORT: number = ASKED_PORT ?? 0;
function portOf(): number | null {
  const i = process.argv.indexOf('--port');
  if (i < 0) return null;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`--port wants a whole number between 1024 and 65535, not ${process.argv[i + 1]}`);
  if ([6975, 7040, 7059].includes(n)) throw new Error(`${n} is somebody else's port; pick another`);
  return n;
}
export const ALLOW_SKIP = process.argv.includes('--allow-skip');

// The site under test: docs/ by default, or a scratch build named with --site,
// which is what a dry release hands over.
export function siteDir(): string {
  const i = process.argv.indexOf('--site');
  const dir = i < 0 ? path.join(ROOT, 'docs') : path.resolve(process.argv[i + 1]);
  if (!fs.existsSync(path.join(dir, 'index.html')))
    throw new Error(`${path.relative(ROOT, dir)} has not been built; run \`npm run build\` first`);
  return dir;
}

// The built site, served: the site's folder at the root, exactly as Pages will
// serve it, with the meters beside it under /tools/ because they are a check
// and not part of the page. `/tools/` is *this* folder and not the repository's
// — the meter travels with the engine — so a page asking for
// `/tools/meter.ts` gets the one beside the code it is metering.
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/**
 * A file as the browser should be handed it. The site under `site/` is the
 * bundler's output and is already JavaScript; the meter beside it under
 * `/tools/` is **source**, and since the conversion of 2026-09-19 the source is
 * TypeScript — so it is stripped on the way past, which node does natively and
 * which is what the engine's own suites have done since round K2. What the page
 * imports is then the module node itself would run, with no build step between
 * the check and the code it checks.
 *
 * `servedIsUnderTest` reads through this too, so "the one in this checkout"
 * goes on meaning the file on disk rather than a second copy of the rule.
 */
export function bodyOf(file: string): Buffer {
  const buf = fs.readFileSync(file);
  if (!file.endsWith('.ts')) return buf;
  return Buffer.from(stripTypeScriptTypes(buf.toString('utf8'), { mode: 'strip' }));
}

/**
 * The server a suite is handed back: how to stop it, and whether it is its
 * own. A port that was already answering is borrowed rather than fought with,
 * and `borrowed` is how a suite knows which of the two it got — the closing is
 * a no-op in that case, because what is on the port is somebody else's. Only
 * a port named with `--port` is ever borrowed: a suite that named none serves
 * on a free one, which nothing else can be answering on.
 */
export interface ServedSite {
  close(): void;
  borrowed: boolean;
}

export function serve(site: string): Promise<ServedSite> {
  return new Promise<ServedSite>((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
      const name = decodeURIComponent(url.pathname);
      const file = name.startsWith('/tools/') ? path.join(TOOLS, name.slice('/tools'.length)) : path.join(site, name === '/' ? '/index.html' : name);
      if (!file.startsWith(TOOLS) && !file.startsWith(site)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(bodyOf(file));
    });
    server.on('error', (e: Error & { code?: string }) => {
      if (e.code === 'EADDRINUSE' && ASKED_PORT != null) resolve({ close() {}, borrowed: true });
      else throw e;
    });
    // Port 0 is the system's word for "any free one"; the one it gave is read
    // back before anything is resolved, so no caller ever sees a 0.
    server.listen(ASKED_PORT ?? 0, '127.0.0.1', () => {
      const at = server.address();
      if (at && typeof at === 'object') PORT = at.port;
      resolve({ close: () => server.close(), borrowed: false });
    });
  });
}

/**
 * **A server of a suite's own, on a free port unless one is named** (09-24).
 * The engine's two browser suites served their source on 7023 and 7046, each
 * fixed, so a second run of either — `npm run test:engine` beside `npm test`,
 * or in a second worktree — found the port taken and failed in a third of a
 * second. `asked` is the port an environment variable named, or nought, which
 * is the system's word for any free one; the port the server got is handed
 * back, and a suite builds its addresses from that.
 */
export function listenOn(server: http.Server, asked = 0): Promise<number> {
  return new Promise<number>((done, fail) => {
    server.once('error', fail);
    server.listen(asked, '127.0.0.1', () => {
      const at = server.address();
      done(at && typeof at === 'object' ? at.port : asked);
    });
  });
}

// Nothing a suite runs may be heard. There are two locks and they are
// independent, because either one alone can be lifted by accident.
//
// The first is the page's own: every page a suite opens is opened with
// `?out=silent`, which ends the set in a gain of zero connected to the
// destination (`packages/deep-house/src/control.ts`). The context still runs,
// the clock still ticks,
// the scheduler still fills its horizon and the capture tap still reads the
// mix's own last node, so late-note counts and captures are the same numbers
// they would be out loud. `silentOutput(page)` is how a suite proves it, in
// the page, rather than trusting the query string it wrote.
//
// The second is the browser's: Chromium is launched with --mute-audio and
// Firefox with media.volume_scale at zero — a *string* pref, because Firefox
// stores it as one and handing Playwright a number makes it try setIntPref and
// refuse to start. Playwright offers WebKit no mute at all, so WebKit stands on
// the route alone and on the offline renders, which reach no device by
// construction.
//
// Offline renders never reach a device whatever these say: an
// OfflineAudioContext has no output.
export const SILENT = 'out=silent';
export const pageUrl = (extra = ''): string => `http://127.0.0.1:${PORT}/index.html?${SILENT}${extra ? `&${extra.replace(/^[?&]/, '')}` : ''}`;

/**
 * What a browser is launched with. `args` is chromium's and `firefoxUserPrefs`
 * is firefox's, so each is there or not depending on which one is being
 * launched; the prefs carry strings as well as numbers because one of them has
 * to be a string (see the second lock, above).
 */
export interface LaunchOptions {
  headless: boolean;
  args?: string[];
  firefoxUserPrefs?: Record<string, number | string>;
}

export function launchOptions(name: string): LaunchOptions {
  const o: LaunchOptions = { headless: true };
  if (name === 'chromium') o.args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio'];
  if (name === 'firefox')
    o.firefoxUserPrefs = {
      'media.autoplay.default': 0,
      'media.autoplay.blocking_policy': 0,
      'media.volume_scale': '0.0',
    };
  return o;
}

/** What the first lock reports: whether it held, and the sentence saying why. */
export interface SilentVerdict {
  ok: boolean;
  why: string;
}

// Asked of the page itself: is the set's destination the muted node, and is
// its gain zero? A suite that cannot answer this has not proved it is silent.
export async function silentOutput(page: PlaywrightThing): Promise<SilentVerdict> {
  return page.evaluate(() => {
    const c = window.ring && window.ring.control;
    if (!c) return { ok: false, why: 'the page has no control to ask' };
    const sink = c.state && c.state.sink;
    if (c.out !== 'silent') return { ok: false, why: `the page's output route is ${c.out}, not silent` };
    if (!sink) return { ok: false, why: 'the silent route named no sink' };
    if (typeof GainNode === 'function' && !(sink instanceof GainNode))
      return { ok: false, why: `the sink is a ${sink.constructor && sink.constructor.name}, not a gain` };
    if (!sink.gain || sink.gain.value !== 0) return { ok: false, why: `the sink's gain is ${sink.gain && sink.gain.value}, not 0` };
    return { ok: true, why: 'the set ends in a gain of 0 into the destination' };
  });
}

// Everything the page pulls out of the bundler's folder, as the page names it.
// The build writes one hashed script into assets/ and the page's tags point at
// it, so this list is the build's fingerprint.
const ASSETS = /(?:src|href)\s*=\s*["'](\.?\/?assets\/[^"']+)["']/g;
const assetsOf = (html: string): string[] => [...html.matchAll(ASSETS)].map((m) => m[1].replace(/^\.?\//, '')).sort();
const sha = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

// Who is answering on the port. A server already sitting there is borrowed
// rather than fought with, which is convenient and was also a hole: a suite
// could meter a build nobody had asked about — a stale docs/, another
// project's page, a scratch build from an hour ago — and report a pass for it.
// So the page that answers has to name the same hashed asset as the build
// under test, and that asset has to arrive byte for byte the same.
/**
 * What the check of who is answering comes back as. A refusal carries `why`
 * and a pass carries `what` — the hashed asset the build was identified by —
 * because the two are read by different callers for different reasons.
 */
export type ServedVerdict = { ok: false; why: string } | { ok: true; what: string };

export async function servedIsUnderTest(site: string, extra: string[] = []): Promise<ServedVerdict> {
  const local = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const want = assetsOf(local);
  let html;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/index.html`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, why: `the server on ${PORT} answered ${res.status} for index.html` };
    html = await res.text();
  } catch (e) {
    return { ok: false, why: `nothing answered on ${PORT}: ${(e as Error).message.split('\n')[0]}` };
  }
  const got = assetsOf(html);
  if (!want.length) return { ok: false, why: `${path.relative(ROOT, site)}/index.html names no built asset, so there is nothing to identify it by` };
  if (got.join(' ') !== want.join(' '))
    return { ok: false, why: `the server on ${PORT} is serving ${got.join(', ') || 'no built asset'} where ${path.relative(ROOT, site)} holds ${want.join(', ')}` };
  for (const a of want) {
    const disk = fs.readFileSync(path.join(site, a));
    const res = await fetch(`http://127.0.0.1:${PORT}/${a}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, why: `the server on ${PORT} has no ${a} (${res.status})` };
    const served = Buffer.from(await res.arrayBuffer());
    if (!served.equals(disk))
      return { ok: false, why: `${a} on ${PORT} is ${sha(served)} where ${path.relative(ROOT, site)} holds ${sha(disk)}` };
  }
  // The meters are served beside the page, off tools/ rather than out of the
  // build. A borrowed server that only knows the site cannot run the render,
  // so that is a refusal too and not a page error halfway through.
  for (const rel of extra) {
    const disk = bodyOf(path.join(TOOLS, rel.replace(/^tools\//, '')));
    const res = await fetch(`http://127.0.0.1:${PORT}/${rel}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, why: `the server on ${PORT} does not serve ${rel} (${res.status}), which the check reads from the page` };
    if (!Buffer.from(await res.arrayBuffer()).equals(disk))
      return { ok: false, why: `${rel} on ${PORT} is not the one in this checkout` };
  }
  return { ok: true, what: `${want.join(', ')} (${sha(fs.readFileSync(path.join(site, want[0])))})` };
}

// Playwright drives the browsers and is not a dependency of the page: the page
// is what ships and it has none. It is looked for in exactly two places — this
// project's own node_modules, for a checkout that has added it as a
// devDependency, and the global install that `npm root -g` names — and the
// version that answered is printed, so a run says what drove it. Anything else
// is a skip, and a skip is not a pass.
export const PLAYWRIGHT_PINNED = '1.62.1';

/**
 * Anything Playwright hands over: the module itself, a browser, a page.
 *
 * `any` because there is nothing to be honest with instead — Playwright is not
 * a dependency of this checkout and its types are not installed anywhere in
 * it; it is found by path at run time by the function below, out of whichever
 * of the two places has it. It is one alias rather than an `any` at each of
 * the four places it is needed, so a signature names the hole it has.
 */
export type PlaywrightThing = any;

/** What `playwright()` found, and where it found it. */
export interface PlaywrightFound {
  /** the module itself, imported out of `from` */
  pw: PlaywrightThing;
  /** the folder it was imported out of */
  from: string;
  /** the version its own package.json declares */
  version: string;
  /** the one line a run prints to say what drove it, pinned or not */
  label: string;
}

/**
 * What it throws when it found nothing: the two places it looked, carried on
 * the error, so a caller reporting a skip can name them.
 */
export interface PlaywrightMissing extends Error {
  tried: string[];
}

function globalRoot(): string {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export async function playwright(): Promise<PlaywrightFound> {
  const tried: string[] = [];
  for (const base of [path.join(ROOT, 'node_modules'), globalRoot()].filter(Boolean)) {
    const dir = path.join(base, 'playwright');
    tried.push(dir);
    if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
    const pw = await import(path.join(dir, 'index.mjs'));
    const where = dir.startsWith(ROOT) ? "this checkout's node_modules" : 'the global install';
    const label = `playwright ${version}${version === PLAYWRIGHT_PINNED ? '' : ` where ${PLAYWRIGHT_PINNED} is pinned`}, from ${where}`;
    return { pw, from: dir, version, label };
  }
  const e = new Error(`playwright is in neither of the two places it is looked for:\n    ${tried.join('\n    ')}`) as PlaywrightMissing;
  e.tried = tried;
  throw e;
}

// Everything a suite starts goes to the back of the queue. These runs are
// background errands on somebody's working machine — Eugene is listening on
// 6975 while they go — and a render that takes half again as long and is never
// felt is the better trade. `--nice 0` turns it off; not every machine has
// `pgrep`, and one that has not is only slower.
const NICE = (() => {
  const i = process.argv.indexOf('--nice');
  return i < 0 ? 18 : +process.argv[i + 1];
})();

export function renice(browser: PlaywrightThing): boolean {
  if (!NICE) return false;
  const pid = browser && browser.process && browser.process() && browser.process().pid;
  if (!pid) return false;
  try {
    const kids = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
    execFileSync('renice', ['-n', String(NICE), '-p', String(pid), ...kids], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false; // no pgrep, or a platform that does not renice: only slower
  }
}

// How a run ends. A suite that could not do its work has not passed it: a skip
// leaves a non-zero exit of its own, so nothing downstream — a release, a
// machine running the checks — can read silence as a green light. `--allow-skip`
// is the deliberate way to accept the gap out loud.
/** How a run says it ended: what failed, and what could not be run at all. */
export interface Outcome {
  failed?: number;
  /** one sentence per check that did not run, saying which and why */
  skipped?: string[];
}

export function finish({ failed = 0, skipped = [] }: Outcome = {}): void {
  const skips = skipped.length;
  if (failed) {
    console.log(`\n${failed} failed${skips ? `, ${skips} skipped` : ''}`);
    process.exit(1);
  }
  if (skips) {
    console.log(`\nnothing failed, but ${skips} of the checks did not run: ${skipped.join('; ')}`);
    if (!ALLOW_SKIP) {
      console.log('A skip is not a pass. Install what is missing, or say --allow-skip to accept the gap.');
      process.exit(2);
    }
    console.log('--allow-skip was given, so the gap is accepted.');
    process.exit(0);
  }
  console.log('\nall passed');
  process.exit(0);
}
