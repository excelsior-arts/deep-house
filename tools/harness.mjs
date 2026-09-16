// What the two suites stand on: the built site served on one known port, a
// check that what answers there is the build under test and not something
// else, the one browser tool they borrow, and the arithmetic of finishing —
// which is where a skip is kept apart from a pass.
//
// Nothing here is part of the page. It runs on a machine, it may read the
// scratch folder, and it is never served to a browser.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 6977 is the built site's port, live and borrowed alike. 6975 is the dev
// server and is never touched.
export const PORT = 6977;
export const ALLOW_SKIP = process.argv.includes('--allow-skip');

// The site under test: docs/ by default, or a scratch build named with --site,
// which is what a dry release hands over.
export function siteDir() {
  const i = process.argv.indexOf('--site');
  const dir = i < 0 ? path.join(ROOT, 'docs') : path.resolve(process.argv[i + 1]);
  if (!fs.existsSync(path.join(dir, 'index.html')))
    throw new Error(`${path.relative(ROOT, dir)} has not been built; run \`npm run build\` first`);
  return dir;
}

// The built site, served: the site's folder at the root, exactly as Pages will
// serve it, with the meters beside it under /tools/ because they are a check
// and not part of the page.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

export function serve(site) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const name = decodeURIComponent(url.pathname);
      const file = name.startsWith('/tools/') ? path.join(ROOT, name) : path.join(site, name === '/' ? '/index.html' : name);
      if (!file.startsWith(ROOT) && !file.startsWith(site)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    });
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') resolve({ close() {}, borrowed: true });
      else throw e;
    });
    server.listen(PORT, '127.0.0.1', () => resolve({ close: () => server.close(), borrowed: false }));
  });
}

// Nothing a suite runs may be heard. There are two locks and they are
// independent, because either one alone can be lifted by accident.
//
// The first is the page's own: every page a suite opens is opened with
// `?out=silent`, which ends the set in a gain of zero connected to the
// destination (src/control.js). The context still runs, the clock still ticks,
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
export const pageUrl = (extra = '') => `http://127.0.0.1:${PORT}/index.html?${SILENT}${extra ? `&${extra.replace(/^[?&]/, '')}` : ''}`;

export function launchOptions(name) {
  const o = { headless: true };
  if (name === 'chromium') o.args = ['--autoplay-policy=no-user-gesture-required', '--mute-audio'];
  if (name === 'firefox')
    o.firefoxUserPrefs = {
      'media.autoplay.default': 0,
      'media.autoplay.blocking_policy': 0,
      'media.volume_scale': '0.0',
    };
  return o;
}

// Asked of the page itself: is the set's destination the muted node, and is
// its gain zero? A suite that cannot answer this has not proved it is silent.
export async function silentOutput(page) {
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
const assetsOf = (html) => [...html.matchAll(ASSETS)].map((m) => m[1].replace(/^\.?\//, '')).sort();
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

// Who is answering on the port. A server already sitting there is borrowed
// rather than fought with, which is convenient and was also a hole: a suite
// could meter a build nobody had asked about — a stale docs/, another
// project's page, a scratch build from an hour ago — and report a pass for it.
// So the page that answers has to name the same hashed asset as the build
// under test, and that asset has to arrive byte for byte the same.
export async function servedIsUnderTest(site, extra = []) {
  const local = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const want = assetsOf(local);
  let html;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/index.html`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, why: `the server on ${PORT} answered ${res.status} for index.html` };
    html = await res.text();
  } catch (e) {
    return { ok: false, why: `nothing answered on ${PORT}: ${e.message.split('\n')[0]}` };
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
    const disk = fs.readFileSync(path.join(ROOT, rel));
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

function globalRoot() {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export async function playwright() {
  const tried = [];
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
  const e = new Error(`playwright is in neither of the two places it is looked for:\n    ${tried.join('\n    ')}`);
  e.tried = tried;
  throw e;
}

// How a run ends. A suite that could not do its work has not passed it: a skip
// leaves a non-zero exit of its own, so nothing downstream — a release, a
// machine running the checks — can read silence as a green light. `--allow-skip`
// is the deliberate way to accept the gap out loud.
export function finish({ failed = 0, skipped = [] } = {}) {
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
