// Where a theme's loudness comes from, measured once so the record does not
// have to measure it again.
//
//   node tools/loudness-fit.mjs --measure     render and meter the set
//   node tools/loudness-fit.mjs --fit         fit the model to what was measured
//   node tools/loudness-fit.mjs --after       re-measure with the trim in place
//   node tools/loudness-fit.mjs --ab          the four-theme montage, before and after
//   node tools/loudness-fit.mjs               --measure then --fit
//
// ## Why this exists
//
// The make-up gain is one number for the whole record and the limiter does the
// levelling, so a main groove lands anywhere between about -13.6 and -10.7
// LUFS depending on which room the die rolled and how much is playing. Three
// units is not a mix: it is one theme quieter than the next, and a listener
// hears it as a fault in the record rather than as a property of the seed.
//
// The answer is a per-theme trim worked out *at plan time* — no rendering on
// the listener's machine, ever. What makes that possible is that a theme's
// loudness is almost entirely a function of things the plan already knows: the
// room's own level table, the density die, how many layers are sounding, and
// how thick the mined masks are. This tool measures that function over a few
// hundred themes and fits it; `loudnessTrimDb()` in src/params.js evaluates the
// fit in microseconds and `planTheme` writes the answer onto the track.
//
// ## What is measured
//
// One window per theme: eight bars of a *main* groove, taken from the middle
// of the first long main section past bar 16, with two bars of pre-roll. The
// window technique is the scene gate's (tools/test.mjs): everything outside
// the window reaches the render as events with **no voice**, so `develop()`
// stages the window against the theme's real history while `fireEvent` builds
// nothing for them, the automation moves with the window rather than being cut,
// and the two pre-roll bars are rendered and thrown away so the reverb, the
// delay and the limiter's envelope are running when the window opens.
//
// A main groove and not a drop or a breakdown, because the trim has to be one
// number for the theme and the main is what a theme mostly is; the scene gate's
// drop and breakdown rules go on measuring those against their own mains.
//
// Rendered offline in headless Chromium — the engine the loudness gates use —
// against the built site on port 6997. Nothing here reaches an output device:
// an OfflineAudioContext has no destination hardware.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planTheme } from '../src/mix.js';
import { loudnessWindow, loudnessFeatures, LOUDNESS_COLUMNS, LOUDNESS_WINDOW_BARS } from '../src/loudness.js';
import { levelKeyOfRole } from '../src/voices/index.js';
import { playwright, launchOptions } from './harness.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Not 6975 (Eugene's dev server) and not 6977 (the two suites'): this tool
// serves its own build on its own port and stops it when it is done.
const PORT = 6997;
const OUT_DIR = path.join(ROOT, 'tmp', 'analysis');
const EAR_DIR = path.join(ROOT, 'tmp', 'ear');
const DATA = path.join(OUT_DIR, 'loudness-fit.json');
const AFTER = path.join(OUT_DIR, 'loudness-fit-after.json');
const REPORT = path.join(OUT_DIR, 'loudness-fit.md');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);
// The file is a command and a library at once: `--check`'s stored predictions
// and the comparison between two pools import `fit` from here, and importing it
// must not start a browser.
const CLI = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const SEED_FROM = +arg('from', 1);
const SEED_TO = +arg('to', 40);
const THEMES = +arg('themes', 3);
const WINDOW_BARS = +arg('bars', 8);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const RATE = 48000;
// One page, one render at a time, and the browser reniced to the bottom of the
// queue the moment it is up. This runs on the machine somebody is listening on:
// five pages rendering at once put five cores at a hundred per cent and cooked
// it. A hundred and twenty themes at two to four seconds each is six or seven
// minutes of one background core, which is a cost nobody notices.
const PAGES = +arg('pages', 1);
const NICE = +arg('nice', 18);

// --- the window, and what the plan already knows about it -------------------
//
// Both come from src/loudness.js, which is where the record itself reads them:
// the rule that picks the eight bars and the features the fit is allowed to
// draw on are one implementation, so what was measured and what is evaluated on
// a listener's machine cannot drift apart. What is here is only the sampling
// decision — which themes are fit for teaching a fit anything.

// A theme earns a row if its window really is eight bars and every one of them
// is a main groove. A theme too short for that is not a counter-example, it is
// a different measurement, and the record still gets a trim for it from the
// same rule with a shorter window.
export function sampleWindow(track) {
  const w = loudnessWindow(track);
  if (w.bars !== LOUDNESS_WINDOW_BARS) return null;
  for (let b = w.from; b < w.from + w.bars; b++) {
    if (!track.timeline[b] || track.timeline[b].section !== 'main groove') return null;
  }
  return w.from;
}

// Which entry of the level table a role is actually played at: the harmonic
// layer is one role and three voices, and the piano has a level of its own.
export function levelOfRole(f, role) {
  return f[`lv${levelKeyOfRole(role, f.stabTimbre) === 'pad' ? 'Pad' : levelKeyOfRole(role, f.stabTimbre) === 'piano' ? 'Piano' : 'Keys'}`];
}

// The plan's own features, plus the labels a report wants to read.
export function featuresOf(track) {
  const f = loudnessFeatures(track);
  return {
    ...f,
    seed: track.seed,
    preset: track.preset,
    stabTimbre: track.dice.stabTimbre,
    padTimbre: track.dice.padTimbre,
    leadTimbre: track.dice.leadTimbre,
    progression: track.dice.progression,
    kind: 'main',
  };
}

// The whole measured set, planned in node: cheap, pure and the same plan the
// page will make, so the page only has to render.
function jobs() {
  const out = [];
  const skipped = [];
  for (let s = SEED_FROM; s <= SEED_TO; s++) {
    for (let n = 0; n < THEMES; n++) {
      const track = planTheme(String(s), n, {});
      const from = sampleWindow(track);
      if (from == null) { skipped.push(`${s}#${n}`); continue; }
      out.push({ ...featuresOf(track), masterSeed: s, theme: n, fromBar: from, bars: WINDOW_BARS });
    }
  }
  return { out, skipped };
}

// --- the page ---------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve(site) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
      const file = name.startsWith('/tools/') ? path.join(ROOT, name) : path.join(site, name === '/' ? '/index.html' : name);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(file));
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve({ close: () => server.close() }));
  });
}

// One window, rendered and metered, in the page. `want` is 'lufs' for the
// measurement and 'pcm' for the montage.
const RENDER = async (job) => {
  const meter = await import('/tools/meter.mjs');
  const MUTE = 'silent:not-in-window';
  const track = window.deepHouse.planTheme(String(job.masterSeed), job.theme, {});
  const bs = track.barSeconds;
  const preBar = Math.max(0, job.fromBar - job.prerollBars);
  const tp = preBar * bs;
  const t0 = job.fromBar * bs;
  const t1 = (job.fromBar + job.bars) * bs;
  const automation = {};
  for (const k of Object.keys(track.automation || {})) {
    const v = track.automation[k];
    automation[k] = Array.isArray(v) ? v.map((p) => ({ ...p, t: p.t - tp })) : v;
  }
  const inside = (e) => e.t >= tp && e.t < t1 && (!job.only || job.only.includes(e.layer));
  const events = track.events.map((e) => (inside(e) ? { ...e, t: e.t - tp } : { ...e, voice: MUTE, t: 0 }));
  const slice = { ...track, duration: t1 - tp + job.tailSeconds, events, automation };
  const buf = await window.deepHouse.renderTrack(slice, { sampleRate: job.sampleRate });
  const from = Math.round((t0 - tp) * job.sampleRate);
  const to = Math.round((t1 - tp) * job.sampleRate);
  const L = buf.getChannelData(0).slice(from, to);
  const R = buf.getChannelData(1).slice(from, to);
  const out = {
    lufs: meter.integratedLoudness([L, R], job.sampleRate),
    truePeak: meter.truePeak([L, R]),
    peak: +(20 * Math.log10(meter.samplePeak([L, R]) + 1e-30)).toFixed(2),
    trimDb: typeof track.trimDb === 'number' ? track.trimDb : null,
    seconds: +(L.length / job.sampleRate).toFixed(3),
  };
  if (job.want === 'pcm') {
    // 16-bit interleaved, base64: a montage is stitched in node and a float
    // buffer through a page boundary is four times the bytes for no more ear.
    const n = L.length;
    const pcm = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
      pcm[i * 2] = Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767)));
      pcm[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767)));
    }
    const bytes = new Uint8Array(pcm.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    out.pcm = btoa(bin);
  }
  return out;
};

// Everything this tool starts goes to the back of the queue. The measurement
// is a background errand on somebody's working machine, and a render that takes
// twice as long and is never felt is the better trade.
function renice(browser) {
  if (!NICE) return;
  const pid = browser.process && browser.process() && browser.process().pid;
  if (!pid) return;
  try {
    const kids = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
    execFileSync('renice', ['-n', String(NICE), '-p', String(pid), ...kids], { stdio: 'ignore' });
  } catch (e) { /* not every machine has pgrep; the run is only slower without it */ }
}

async function run(list, { want = 'lufs', label = 'measuring' } = {}) {
  const site = path.join(ROOT, 'docs');
  if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error('docs/ has not been built; run `npm run build` first');
  const server = await serve(site);
  const { pw, label: pwLabel } = await playwright();
  console.log(`  ${pwLabel}`);
  const opts = launchOptions('chromium');
  const browser = await pw.chromium.launch({ ...opts, args: [...(opts.args || []), '--disable-gpu'] });
  renice(browser);
  // The page under measurement is the ring, and the ring draws. Software
  // rasterising eight cells and a turning star at sixty frames a second costs
  // more than the render does — six pages of it put six renderers at 110% of a
  // core each and turned a four-second render into forty. The loop reschedules
  // itself through requestAnimationFrame, so taking that away lets the current
  // frame finish and no other begin. Nothing in an offline render asks for a
  // frame, so what is metered is untouched.
  const still = async (page) => {
    await page.goto(`http://127.0.0.1:${PORT}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.deepHouse, { timeout: 30000 });
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  };
  const pages = [];
  for (let i = 0; i < Math.max(1, Math.min(PAGES, list.length)); i++) {
    const page = await browser.newPage();
    await still(page);
    pages.push(page);
  }
  // Again, now the renderers exist: a page's process is a child of the
  // browser's and is not there to be reniced until the page is.
  renice(browser);
  const results = new Array(list.length);
  let next = 0, done = 0;
  const began = Date.now();
  // A page is reloaded every so often. Every render leaves an
  // OfflineAudioContext, its buffers and a piano cache behind it, and a page
  // asked for a hundred of them in a row slows to a crawl on its own garbage.
  const RELOAD_EVERY = +arg('reload', 25);
  await Promise.all(pages.map(async (page) => {
    let since = 0;
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      if (since >= RELOAD_EVERY) { await still(page); renice(browser); since = 0; }
      const job = { ...list[i], prerollBars: Math.min(PREROLL_BARS, list[i].fromBar), tailSeconds: TAIL_SECONDS, sampleRate: RATE, want, only: list[i].only || null };
      const t0 = Date.now();
      try {
        results[i] = await page.evaluate(RENDER, job);
      } catch (e) {
        results[i] = { error: e.message.split('\n')[0] };
      }
      since++;
      done++;
      const per = (Date.now() - began) / done;
      process.stdout.write(`\r  ${label} ${done}/${list.length}  ${list[i].masterSeed}#${list[i].theme} ${Math.round(Date.now() - t0)} ms  ${(per / 1000).toFixed(2)} s each, ${Math.round((list.length - done) * per / 1000)} s left        `);
    }
  }));
  process.stdout.write('\n');
  await browser.close();
  server.close();
  return results;
}

// --- the fit ----------------------------------------------------------------
//
// Ordinary least squares with a whisper of ridge, and the features chosen by
// forward selection on the cross-validated residual rather than on R², so a
// column that only fits the noise cannot earn its place. The model is small on
// purpose: it runs on a listener's machine every time a theme is planned, and a
// coefficient nobody can explain is a coefficient that will be wrong on a seed
// nobody measured.

// The candidate pool: every column src/params.js knows how to read. A column
// whose every value is 0 or 1 is left where it is; anything else is centred on
// the measured mean, so the intercept is the loudness of an average theme and a
// coefficient is a decibel per unit of departure from it.
function pool(rows, { instruments = false } = {}) {
  const c = {};
  // Not part of the record and never written into params.js: the one-hot pool
  // the property pool is measured against, so "does an instrument need its own
  // coefficient?" is a number and not an opinion.
  const extra = instruments ? {
    stabPiano: (r) => (r.stabTimbre === 'piano' ? 1 : 0),
    stabOrgan: (r) => (r.stabTimbre === 'organ' ? 1 : 0),
    stabGlass: (r) => (r.stabTimbre === 'glass' ? 1 : 0),
    stabPluck: (r) => (r.stabTimbre === 'pluck' ? 1 : 0),
    stabEp: (r) => (r.stabTimbre === 'ep' ? 1 : 0),
    stabRhodes: (r) => (r.stabTimbre === 'rhodes' ? 1 : 0),
    padStrings: (r) => (r.padTimbre === 'strings' ? 1 : 0),
    padRhodes: (r) => (r.padTimbre === 'rhodes' ? 1 : 0),
    padOrgan: (r) => (r.padTimbre === 'organ' ? 1 : 0),
    padSwell: (r) => (r.padTimbre === 'swell' ? 1 : 0),
    roomGrowl: (r) => (r.preset === 'growl' ? 1 : 0),
    roomSub: (r) => (r.preset === 'sub' ? 1 : 0),
  } : {};
  for (const name of [...Object.keys(LOUDNESS_COLUMNS), ...Object.keys(extra)]) {
    const f = LOUDNESS_COLUMNS[name] || extra[name];
    const xs = rows.map(f);
    const binary = xs.every((x) => x === 0 || x === 1);
    const spread = Math.max(...xs) - Math.min(...xs);
    // A column that never moves over the measured set can teach nothing and
    // would make the normal equations singular.
    if (spread < 1e-9) continue;
    const centre = binary ? 0 : +(xs.reduce((a, v) => a + v, 0) / xs.length).toFixed(6);
    c[name] = { f, centre };
  }
  return c;
}

function solve(A, b, ridge = 1e-6) {
  const n = A[0].length;
  const M = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < A.length; k++) s += A[k][i] * A[k][j];
      M[i][j] = s + (i === j ? ridge : 0);
    }
    let s = 0;
    for (let k = 0; k < A.length; k++) s += A[k][i] * b[k];
    M[i][n] = s;
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      if (!f) continue;
      for (let cI = i; cI <= n; cI++) M[r][cI] -= f * M[i][cI];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

const design = (rows, names, cand) => rows.map((r) => [1, ...names.map((n) => cand[n].f(r) - cand[n].centre)]);

function rmse(rows, y, names, cand, w) {
  const X = design(rows, names, cand);
  let s = 0;
  for (let i = 0; i < rows.length; i++) {
    let p = 0;
    for (let j = 0; j < w.length; j++) p += X[i][j] * w[j];
    s += (p - y[i]) ** 2;
  }
  return Math.sqrt(s / rows.length);
}

// Five folds, deterministic: every fifth row, so a fold is a sample of the
// whole set of seeds and not a block of neighbouring ones.
function crossVal(rows, y, names, cand, folds = 5) {
  let ss = 0, n = 0, worst = 0;
  for (let f = 0; f < folds; f++) {
    const trR = [], trY = [], teR = [], teY = [];
    rows.forEach((r, i) => { if (i % folds === f) { teR.push(r); teY.push(y[i]); } else { trR.push(r); trY.push(y[i]); } });
    const w = solve(design(trR, names, cand), trY);
    if (!w) return { rmse: Infinity, worst: Infinity };
    const X = design(teR, names, cand);
    for (let i = 0; i < teR.length; i++) {
      let p = 0;
      for (let j = 0; j < w.length; j++) p += X[i][j] * w[j];
      const e = Math.abs(p - teY[i]);
      ss += e * e; n++;
      if (e > worst) worst = e;
    }
  }
  return { rmse: Math.sqrt(ss / n), worst };
}

export function fit(rows, { max = 16, gain = 0.005, instruments = false } = {}) {
  const y = rows.map((r) => r.lufs);
  const cand = pool(rows, { instruments });
  const names = [];
  let best = crossVal(rows, y, names, cand);
  for (;;) {
    if (names.length >= max) break;
    let pick = null, pickCv = best;
    for (const n of Object.keys(cand)) {
      if (names.includes(n)) continue;
      const cv = crossVal(rows, y, [...names, n], cand);
      if (cv.rmse < pickCv.rmse - gain) { pick = n; pickCv = cv; }
    }
    if (!pick) break;
    names.push(pick);
    best = pickCv;
  }
  const w = solve(design(rows, names, cand), y);
  const mean = y.reduce((a, v) => a + v, 0) / y.length;
  const sst = y.reduce((a, v) => a + (v - mean) ** 2, 0);
  const res = rmse(rows, y, names, cand, w);
  const r2 = 1 - (res * res * rows.length) / sst;
  return {
    names,
    intercept: +w[0].toFixed(5),
    coef: Object.fromEntries(names.map((n, i) => [n, +w[i + 1].toFixed(5)])),
    centre: Object.fromEntries(names.map((n) => [n, cand[n].centre])),
    r2: +r2.toFixed(4),
    rmse: +res.toFixed(4),
    cv: +best.rmse.toFixed(4),
    cvWorst: +best.worst.toFixed(4),
    n: rows.length,
  };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, v) => a + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, v) => a + (v - mean) ** 2, 0) / xs.length);
  return { min: s[0], max: s[s.length - 1], mean, sd, p05: s[Math.floor(s.length * 0.05)], p95: s[Math.floor(s.length * 0.95)] };
};
const f2 = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);

// --- the montage ------------------------------------------------------------

function wav(chunks, rate = RATE) {
  const data = Buffer.concat(chunks);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const silence = (seconds) => Buffer.alloc(Math.round(seconds * RATE) * 4);

// --- what the run does ------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });

// --- what an instrument is worth, measured once ------------------------------
//
// The fit may not name an instrument: the catalogue is meant to grow, and a
// coefficient per timbre is a coefficient somebody has to fit again every time
// a voice is written. So each timbre declares a number instead — how loud it is,
// alone, at the level its room's table gives it — and the fit reads a sum over
// whatever is sounding.
//
// This is where that number comes from: the same eight-bar window, rendered
// with only the harmonic layer sounding, across up to `--per` themes that
// happen to have rolled that timbre, and the median taken. What is written down
// is the reading *minus* the level the table set, so it belongs to the
// instrument and not to the room it was measured in: a preset that moves its
// `keys` level by three decibels moves the prediction by three decibels without
// this number changing at all.
if (CLI && has('timbres')) {
  const which = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const PER = +arg('per', 5);
  const groups = new Map();
  for (const r of which.rows) {
    const track = planTheme(String(r.masterSeed), r.theme, {});
    const f = featuresOf(track);
    for (const [role, timbre, share] of [['keys', f.stabTimbre, f.share_keys], ['pad', f.padTimbre, f.share_pad]]) {
      if (!timbre || !share) continue;
      const key = `${timbre}:${role}`;
      if (!groups.has(key)) groups.set(key, []);
      const g = groups.get(key);
      if (g.length < PER) g.push({ masterSeed: r.masterSeed, theme: r.theme, fromBar: r.fromBar, bars: WINDOW_BARS, only: [role], role, timbre, level: levelOfRole(f, role) });
    }
  }
  const list = [...groups.values()].flat();
  console.log(`${groups.size} timbre and role pairs, ${list.length} solo windows`);
  const read = await run(list, { label: 'soloing' });
  const by = new Map();
  list.forEach((j, i) => {
    if (read[i].error || !Number.isFinite(read[i].lufs)) return;
    const key = `${j.timbre}:${j.role}`;
    if (!by.has(key)) by.set(key, { timbre: j.timbre, role: j.role, rows: [] });
    by.get(key).rows.push({ seed: `${j.masterSeed}#${j.theme}`, lufs: read[i].lufs, level: j.level, own: +(read[i].lufs - j.level).toFixed(2) });
  });
  const table = [...by.values()].map((g) => {
    const owns = g.rows.map((r) => r.own).sort((a, b) => a - b);
    return { timbre: g.timbre, role: g.role, n: owns.length, loudnessDb: +owns[Math.floor(owns.length / 2)].toFixed(2), lo: owns[0], hi: owns[owns.length - 1] };
  }).sort((a, b) => (a.timbre < b.timbre ? -1 : 1));
  fs.writeFileSync(path.join(OUT_DIR, 'loudness-timbres.json'), JSON.stringify({ note: 'Each timbre alone in an eight-bar main groove, metered, minus the level its room gave it. The median over the themes that rolled it.', measuredAt: new Date().toISOString().slice(0, 10), perTimbre: PER, table, detail: [...by.values()] }, null, 1) + '\n');
  console.table(table);
  console.log(`wrote ${path.relative(ROOT, path.join(OUT_DIR, 'loudness-timbres.json'))}`);
  process.exit(0);
}

if (CLI && has('ab')) {
  const which = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const pick = (arg('picks', '') || '').split(',').filter(Boolean);
  let chosen;
  if (pick.length) {
    chosen = pick.map((p) => {
      const [s, t] = p.split('#');
      const row = which.rows.find((r) => String(r.masterSeed) === s && String(r.theme) === t);
      if (!row) throw new Error(`no measured row for ${p}`);
      return row;
    });
  } else {
    const sorted = [...which.rows].sort((a, b) => a.lufs - b.lufs);
    chosen = [sorted[0], sorted[Math.floor(sorted.length / 3)], sorted[Math.floor((sorted.length * 2) / 3)], sorted[sorted.length - 1]];
  }
  console.log(`the montage: ${chosen.map((r) => `${r.masterSeed}#${r.theme} at ${r.lufs}`).join(', ')}`);
  const out = await run(chosen, { want: 'pcm', label: 'rendering' });
  const side = has('after') ? 'after' : 'before';
  const chunks = [];
  out.forEach((r, i) => {
    if (r.error) throw new Error(`${chosen[i].masterSeed}#${chosen[i].theme}: ${r.error}`);
    chunks.push(Buffer.from(r.pcm, 'base64'));
    if (i < out.length - 1) chunks.push(silence(0.35));
  });
  fs.mkdirSync(EAR_DIR, { recursive: true });
  const file = path.join(EAR_DIR, `ab-trim-${side}.wav`);
  fs.writeFileSync(file, wav(chunks));
  const table = out.map((r, i) => ({ seed: chosen[i].masterSeed, theme: chosen[i].theme, room: chosen[i].preset, density: chosen[i].density, lufs: r.lufs, trimDb: r.trimDb }));
  fs.writeFileSync(path.join(OUT_DIR, `ab-trim-${side}.json`), JSON.stringify(table, null, 1) + '\n');
  console.log(`wrote ${path.relative(ROOT, file)}`);
  console.table(table);
  process.exit(0);
}

if (CLI && (has('measure') || has('after') || (!has('fit') && !has('ab')))) {
  const { out, skipped } = jobs();
  console.log(`${out.length} themes from master seeds ${SEED_FROM}..${SEED_TO} x ${THEMES}${skipped.length ? `, ${skipped.length} with no eight-bar main past bar 16 (${skipped.slice(0, 6).join(' ')}${skipped.length > 6 ? ' ...' : ''})` : ''}`);
  const read = await run(out, { label: has('after') ? 'measuring (after)' : 'measuring' });
  const rows = [];
  const bad = [];
  out.forEach((j, i) => {
    if (read[i].error) { bad.push(`${j.masterSeed}#${j.theme}: ${read[i].error}`); return; }
    rows.push({ ...j, ...read[i] });
  });
  if (bad.length) console.log(`  ${bad.length} did not render: ${bad.slice(0, 3).join(' | ')}`);
  const file = has('after') ? AFTER : DATA;
  fs.writeFileSync(file, JSON.stringify({
    note: 'One row per theme: eight bars of its main groove, rendered offline in headless Chromium through the real graph and metered, with everything the plan knew about it before a node was built.',
    measuredAt: new Date().toISOString().slice(0, 10),
    seeds: [SEED_FROM, SEED_TO], themes: THEMES, windowBars: WINDOW_BARS, prerollBars: PREROLL_BARS, sampleRate: RATE,
    rows,
  }, null, 1) + '\n');
  const s = stats(rows.map((r) => r.lufs));
  console.log(`  ${rows.length} rows -> ${path.relative(ROOT, file)}`);
  console.log(`  LUFS ${s.min.toFixed(2)} .. ${s.max.toFixed(2)}, mean ${s.mean.toFixed(2)}, sd ${s.sd.toFixed(3)}, spread ${(s.max - s.min).toFixed(2)} LU`);
}

if (CLI && (has('fit') || (!has('measure') && !has('after') && !has('ab')))) {
  const before = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  // The loudness is the only thing a render can tell us; every feature beside
  // it is a pure function of the plan, so it is worked out again here from the
  // seed rather than read out of a file written by an older definition of it.
  // A measurement therefore never has to be repeated because a column was
  // renamed, and a fit is always over today's arithmetic.
  const rows = before.rows.map((r) => ({
    ...featuresOf(planTheme(String(r.masterSeed), r.theme, {})),
    masterSeed: r.masterSeed, theme: r.theme, fromBar: r.fromBar,
    lufs: r.lufs, truePeak: r.truePeak, peak: r.peak,
  }));
  const m = fit(rows, { max: +arg('max', 16) });
  // The same rows, the same selection, with a coefficient per instrument and
  // per room allowed as well. It is not written anywhere: it is the number the
  // property fit has to beat to be worth having.
  const oneHot = fit(rows, { max: +arg('max', 16), instruments: true });
  const b = stats(rows.map((r) => r.lufs));
  // What the trim would be, clamped, and where each theme would land if the
  // record answered the fit exactly.
  const TARGET = +arg('target', -12);
  const CLAMP = 4;
  const cand = pool(rows);
  const predict = (r) => m.intercept + m.names.reduce((a, n) => a + m.coef[n] * (cand[n].f(r) - m.centre[n]), 0);

  // How much of a decibel put in front of the master comes out the other side.
  // The record lives on its limiter, so it is not one: this is measured by
  // rendering the same themes a second time with the trim in the graph and
  // regressing what moved against what was asked for, through the origin.
  // Two of them, because a limiter is one-sided: a decibel driven up into the
  // ceiling does not come back the same as a decibel pulled out of it.
  let slopeUp = 1, slopeDown = 1, slopeFit = null;
  if (fs.existsSync(AFTER)) {
    const af = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
    const key = (r) => `${r.masterSeed}#${r.theme}`;
    const was = new Map(before.rows.map((r) => [key(r), r.lufs]));
    const pts = [];
    for (const r of af.rows) {
      const b = was.get(key(r));
      const t = r.trimDb;
      if (b == null || !Number.isFinite(t) || Math.abs(t) < 0.05) continue;
      pts.push({ t, moved: r.lufs - b });
    }
    const reg = (g) => {
      let sxy = 0, sxx = 0;
      for (const p of g) { sxy += p.t * p.moved; sxx += p.t * p.t; }
      if (!(sxx > 0)) return null;
      const s = sxy / sxx;
      const e = g.map((p) => p.moved - s * p.t);
      return { s: +s.toFixed(4), n: g.length, rms: +Math.sqrt(e.reduce((a, v) => a + v * v, 0) / e.length).toFixed(3) };
    };
    const up = reg(pts.filter((p) => p.t > 0));
    const down = reg(pts.filter((p) => p.t < 0));
    const both = reg(pts);
    if (up) slopeUp = up.s;
    if (down) slopeDown = down.s;
    if (up && down) slopeFit = { up, down, both };
  }
  const slopeFor = (d) => (d >= 0 ? slopeUp : slopeDown);
  const trims = rows.map((r) => {
    const need = TARGET - predict(r);
    return Math.max(-CLAMP, Math.min(CLAMP, need / slopeFor(need)));
  });
  const after = rows.map((r, i) => r.lufs + trims[i] * slopeFor(trims[i]));
  const a = stats(after);
  const t = stats(trims);

  const lines = [];
  lines.push('# Per-theme loudness: the measurement and the fit');
  lines.push('');
  lines.push(`Measured ${rows.length} themes — master seeds ${before.seeds[0]}..${before.seeds[1]}, themes 0..${before.themes - 1} — as ${before.windowBars} bars of main groove with ${before.prerollBars} bars of voiceless pre-roll, rendered offline through the real graph in headless Chromium at ${before.sampleRate} Hz, with the trim at 0 dB. ${before.measuredAt}.`);
  lines.push('');
  lines.push('## Before');
  lines.push('');
  lines.push(`| | LUFS |`);
  lines.push(`| --- | --- |`);
  lines.push(`| min | ${b.min.toFixed(2)} |`);
  lines.push(`| p05 | ${b.p05.toFixed(2)} |`);
  lines.push(`| mean | ${b.mean.toFixed(2)} |`);
  lines.push(`| p95 | ${b.p95.toFixed(2)} |`);
  lines.push(`| max | ${b.max.toFixed(2)} |`);
  lines.push(`| sd | ${b.sd.toFixed(3)} |`);
  lines.push(`| spread | ${(b.max - b.min).toFixed(2)} LU |`);
  lines.push('');
  lines.push('By room and density:');
  lines.push('');
  lines.push('| room | density | n | mean | min | max | sd |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const room of ['sub', 'growl']) {
    for (const d of ['minimal', 'medium', 'busy']) {
      const g = rows.filter((r) => r.preset === room && r.density === d);
      if (!g.length) continue;
      const gs = stats(g.map((r) => r.lufs));
      lines.push(`| ${room} | ${d} | ${g.length} | ${gs.mean.toFixed(2)} | ${gs.min.toFixed(2)} | ${gs.max.toFixed(2)} | ${gs.sd.toFixed(3)} |`);
    }
  }
  lines.push('');
  lines.push('## The fit');
  lines.push('');
  lines.push(`\`predicted LUFS = intercept + Σ coefficient × (feature − centre)\`, and \`trim = ${TARGET} − predicted\`, clamped to ±${CLAMP} dB.`);
  lines.push('');
  lines.push(`Features were chosen by forward selection on the five-fold cross-validated residual, not on R², so a column that only fits the noise cannot earn a place. ${m.names.length} of them did.`);
  lines.push('');
  lines.push('| feature | coefficient (dB per unit) | centre |');
  lines.push('| --- | --- | --- |');
  lines.push(`| (intercept) | ${m.intercept.toFixed(4)} | — |`);
  for (const n of m.names) lines.push(`| \`${n}\` | ${m.coef[n] >= 0 ? '+' : ''}${m.coef[n].toFixed(4)} | ${m.centre[n]} |`);
  lines.push('');
  lines.push(`- R² **${m.r2.toFixed(4)}**`);
  lines.push(`- in-sample residual **${m.rmse.toFixed(3)} LU** RMS`);
  lines.push(`- five-fold cross-validated residual **${m.cv.toFixed(3)} LU** RMS, worst held-out theme ${m.cvWorst.toFixed(2)} LU`);
  lines.push('');
  lines.push(`Against a pool that is also allowed a coefficient per instrument and per room — the thing this fit is built not to need — the same selection picks ${oneHot.names.length} features (${oneHot.names.join(', ')}) and cross-validates at **${oneHot.cv.toFixed(3)} LU**. The property fit is ${(oneHot.cv - m.cv >= 0 ? 'the better of the two by ' : 'behind it by ') + Math.abs(oneHot.cv - m.cv).toFixed(3)} LU, so nothing is given up by refusing to name an instrument, and a family written tomorrow needs its module and its four declared numbers and no new coefficient.`);
  lines.push('');
  lines.push('## What the master gives back');
  lines.push('');
  if (slopeFit) {
    lines.push(`A decibel of trim is not a decibel of loudness: it goes in front of the shared master, and this record lives on its limiter. MEASURED by rendering the same themes a second time with the trim in the graph and regressing what moved against what was asked for, through the origin — and **two slopes and not one**, because a limiter is one-sided:`);
    lines.push('');
    lines.push('| direction | dB out per dB in | themes | residual |');
    lines.push('| --- | --- | --- | --- |');
    lines.push(`| up, into the ceiling | ${slopeFit.up.s} | ${slopeFit.up.n} | ${slopeFit.up.rms} LU |`);
    lines.push(`| down, out of it | ${slopeFit.down.s} | ${slopeFit.down.n} | ${slopeFit.down.rms} LU |`);
    lines.push(`| one slope for both | ${slopeFit.both.s} | ${slopeFit.both.n} | ${slopeFit.both.rms} LU |`);
    lines.push('');
    lines.push('The trim is divided by the one that applies to its direction, so what the meter sees is the decibel that was wanted. One slope in the middle over-trims everything quiet and under-trims everything loud, which is what put seed 38 theme 2 a decibel and a half under its neighbours in the first montage.');
  } else {
    lines.push('Not measured yet: run `node tools/loudness-fit.mjs --after` with the trim in the build, and the slope appears here.');
  }
  lines.push('');
  lines.push('## After, as the fit predicts it');
  lines.push('');
  lines.push(`| | LUFS |`);
  lines.push(`| --- | --- |`);
  lines.push(`| min | ${a.min.toFixed(2)} |`);
  lines.push(`| mean | ${a.mean.toFixed(2)} |`);
  lines.push(`| max | ${a.max.toFixed(2)} |`);
  lines.push(`| sd | ${a.sd.toFixed(3)} |`);
  lines.push(`| spread | ${(a.max - a.min).toFixed(2)} LU |`);
  lines.push('');
  lines.push(`The trim itself runs ${t.min.toFixed(2)} to ${t.max.toFixed(2)} dB, mean ${t.mean.toFixed(2)}; ${trims.filter((x) => Math.abs(x) >= CLAMP - 1e-9).length} themes are on the clamp.`);
  lines.push('');
  if (fs.existsSync(AFTER)) {
    const af = JSON.parse(fs.readFileSync(AFTER, 'utf8'));
    const key = (r) => `${r.masterSeed}#${r.theme}`;
    const byKey = new Map(af.rows.map((r) => [key(r), r]));
    const pairs = rows.filter((r) => byKey.has(key(r))).map((r) => ({ r, after: byKey.get(key(r)) }));
    if (pairs.length) {
      const ms = stats(pairs.map((p) => p.after.lufs));
      lines.push('## After, measured');
      lines.push('');
      lines.push(`${pairs.length} of the same themes re-rendered with the trim in the graph: min ${ms.min.toFixed(2)}, max ${ms.max.toFixed(2)}, mean ${ms.mean.toFixed(2)}, sd ${ms.sd.toFixed(3)}, spread ${(ms.max - ms.min).toFixed(2)} LU.`);
      lines.push('');
      lines.push('The twelve furthest from the target before and where they landed:');
      lines.push('');
      lines.push('| theme | room | density | before | trim | after |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      [...pairs].sort((x, y) => Math.abs(y.r.lufs - TARGET) - Math.abs(x.r.lufs - TARGET)).slice(0, 12)
        .forEach((p) => lines.push(`| ${key(p.r)} | ${p.r.preset} | ${p.r.density} | ${p.r.lufs.toFixed(2)} | ${f2(p.after.trimDb ?? 0)} | ${p.after.lufs.toFixed(2)} |`));
      lines.push('');
    }
  }
  if (fs.existsSync(path.join(OUT_DIR, 'ab-trim-before.json'))) {
    const bJ = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'ab-trim-before.json'), 'utf8'));
    const aJ = fs.existsSync(path.join(OUT_DIR, 'ab-trim-after.json')) ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'ab-trim-after.json'), 'utf8')) : null;
    lines.push('## The montage in tmp/ear');
    lines.push('');
    lines.push('`ab-trim-before.wav` and `ab-trim-after.wav`: four main grooves of eight bars each, in the order below, a third of a second of silence between them, 48 kHz.');
    lines.push('');
    lines.push('| theme | room | density | before | trim | after |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    bJ.forEach((r, i) => lines.push(`| ${r.seed}#${r.theme} | ${r.room} | ${r.density} | ${r.lufs.toFixed(2)} | ${aJ && aJ[i] ? f2(aJ[i].trimDb ?? 0) : '—'} | ${aJ && aJ[i] ? aJ[i].lufs.toFixed(2) : '—'} |`));
    lines.push('');
  }
  lines.push('## The block in src/params.js');
  lines.push('');
  lines.push('```js');
  lines.push('loudness: {');
  lines.push(`  targetLufs: ${TARGET},`);
  lines.push(`  clampDb: ${CLAMP},`);
  lines.push(`  slopeUp: ${+slopeUp.toFixed(4)},`);
  lines.push(`  slopeDown: ${+slopeDown.toFixed(4)},`);
  lines.push(`  intercept: ${m.intercept},`);
  lines.push('  coef: {');
  for (const n of m.names) lines.push(`    ${n}: ${m.coef[n]},`);
  lines.push('  },');
  lines.push('  centre: {');
  for (const n of m.names) lines.push(`    ${n}: ${m.centre[n]},`);
  lines.push('  },');
  lines.push('},');
  lines.push('```');
  lines.push('');
  fs.writeFileSync(REPORT, lines.join('\n'));

  console.log(`\nfeatures (${m.names.length}): ${m.names.join(', ')}`);
  console.log(`R2 ${m.r2}  in-sample ${m.rmse} LU  cross-validated ${m.cv} LU  worst held out ${m.cvWorst} LU`);
  console.log(`one-hot pool for comparison (${oneHot.names.length}): ${oneHot.names.join(', ')}`);
  console.log(`  R2 ${oneHot.r2}  cross-validated ${oneHot.cv} LU  worst held out ${oneHot.cvWorst} LU`);
  console.log(`before: ${b.min.toFixed(2)} .. ${b.max.toFixed(2)} LUFS, sd ${b.sd.toFixed(3)}, spread ${(b.max - b.min).toFixed(2)} LU`);
  console.log(slopeFit
    ? `master gives back ${slopeFit.up.s} dB per dB going up (${slopeFit.up.n}, residual ${slopeFit.up.rms}) and ${slopeFit.down.s} coming down (${slopeFit.down.n}, residual ${slopeFit.down.rms}); one slope for both would be ${slopeFit.both.s} at ${slopeFit.both.rms}`
    : 'master slope not measured: run --after with the trim in the build');
  console.log(`after (predicted): ${a.min.toFixed(2)} .. ${a.max.toFixed(2)} LUFS, sd ${a.sd.toFixed(3)}, spread ${(a.max - a.min).toFixed(2)} LU`);
  console.log(`wrote ${path.relative(ROOT, REPORT)}`);
  console.log('\nthe block for src/params.js:\n');
  console.log(lines.slice(lines.lastIndexOf('```js') + 1, lines.length - 2).join('\n'));
}
