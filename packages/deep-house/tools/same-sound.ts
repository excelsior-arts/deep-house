// The same sound, to the byte: a fixed set rendered offline from two trees and
// compared sample for sample.
//
//   node tools/same-sound.ts --before          render the set from the cached
//                                              tree (tmp/same-sound/before/: a
//                                              built site and a copy of the
//                                              engine) and write its hashes
//   node tools/same-sound.ts                   render the set from this tree (its
//                                              site built into tmp/same-sound/
//                                              after/site first, the engine as it
//                                              is here) and compare; on a
//                                              difference, the first differing
//                                              sample
//   node tools/same-sound.ts --only <a,b>      a few of the set, by name prefix
//   node tools/same-sound.ts --skip-themes     the voice scenes only
//   node tools/same-sound.ts --self            the cached tree against its own hashes
//   node tools/same-sound.ts --repeat 3        each of the set rendered three times from
//                                              the cached tree: is the instrument steady
//   node tools/same-sound.ts --engine chromium the other browser (see ENGINE)
//
// Round R2 of the sounds (the voices that waited on a topology parameter move
// to rows). Where a settings block's keys change, the settings hash moves by
// construction while the sound must not, so the program lock cannot be the
// proof; this is. It lives with the composer's tools and not the engine's
// because half of what it renders is themes, and the engine may not name the
// composer.
//
// **The set.** Two halves, and neither alone covers a migration:
//
//   themes  the three golden masters' first two themes under both strategies,
//           27191's first three under its spell, seed 6 at the dubstep tile's
//           spell and seed 5555 at the drum and bass tile's, their first two —
//           every one three windows of the theme (`WINDOWS`) through the page's
//           own `planTheme`, `programOf`, `sliceProgram` and `renderProgram`,
//           so the rooms, the knobs a spell wrote and the controls a part
//           wrote all reach the voices as they do in the record.
//   scenes  every row of the engine's four fixture tables (`tools/tables.ts`:
//           every registered voice, every timbre), each at its fixture, at a
//           transposed and softer variant, with every declared knob at its
//           floor and at its ceiling, and with every declared control at its
//           two ends; and the five held auditions. A voice no theme draws is
//           still proved here.
//
// The requests a theme is planned under are read once, in node, from this
// tree's composer (`played` in link-digest.ts), and cached with the before
// hashes, so the two renders are asked exactly the same thing.
//
// **What is compared.** The rendered Float32 samples of both channels, in
// blocks of 2048 frames, each block hashed in the page (64 bits: two FNV-1a
// over its words). Equal is every block equal and the same length. On a
// difference the item is rendered again from both trees and the first
// differing block handed back raw, so the report names the exact sample,
// channel and the two values. No tolerance: a float that moved is a move.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice } from '@deep-house/engine/harness';
import { played } from './link-digest.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE = path.resolve(HERE, '..', '..', '..');
const CACHE = path.join(WORKTREE, 'tmp', 'same-sound');
const BEFORE = path.join(CACHE, 'before');
const AFTER_SITE = path.join(CACHE, 'after', 'site');
const ENGINE_HERE = path.join(WORKTREE, 'packages', 'engine');

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? null : argv[i + 1]; };
const MAKE_BEFORE = flag('before');
const ONLY = arg('only') ? arg('only').split(',') : null;
const SKIP_THEMES = flag('skip-themes');
const SKIP_SCENES = flag('skip-scenes');
// `--self` compares the cached tree with its own hashes: the render's determinism, asked of the instrument itself
const SELF = flag('self');
const REPEAT = +(arg('repeat') ?? 0);
// **Firefox, and not Chromium.** Chromium's offline render is not the same
// twice on this machine: a hat or a held ensemble rendered three times in a row
// from one tree comes back three ways, 1e-16 apart in a hat's first hit and a
// part in ten million in the strings, with convolvers, the limiter's worklet,
// delays, shapers and compressors all stubbed out and every node held alive —
// while a sine kick is the same every time. Firefox renders every one of them
// identically run after run, so it is the instrument; `--engine chromium`
// is there to show the other.
const ENGINE = arg('engine') ?? 'firefox';
const THEME_RATE = 44100;
const SCENE_RATE = 48000;
const BLOCK = 2048;
// A whole theme renders slower than it plays in a headless page (a 152-bar
// theme took seventeen minutes), so a theme is three windows of it, eight bars
// each at 15, 45 and 75 per cent of the way in, each after two bars
// of pre-roll so the sends and the limiter are running — sliced from the
// compiled program the way the scene gate slices one, every curve moved with
// the window.
const WINDOWS = [0.15, 0.45, 0.75];
const WINDOW_BARS = 8;
const PREROLL_BARS = 2;

// --- the set ------------------------------------------------------------------

const DUBSTEP = 'em:0.92,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80';
const DNB = 'em:0.95,sp:0.85,ze:0.60,ro:0.75,ve:0.60,ti:0.45';
const BENCH = 'em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81';

function themeJobs() {
  const out = [];
  for (const [v, strategy] of [['1', 'house-v1'], ['2', 'house-v2']])
    for (const m of ['1', '92970', '21323'])
      for (const n of [0, 1]) out.push({ name: `theme:${m}/${strategy}/${n + 1}`, link: `seed=${m}&v=${v}`, theme: n });
  for (const n of [0, 1, 2]) out.push({ name: `theme:27191/bench/${n + 1}`, link: `seed=27191&v=2&spell=${BENCH}`, theme: n });
  for (const n of [0, 1]) out.push({ name: `theme:6/dubstep/${n + 1}`, link: `seed=6&v=2&spell=${DUBSTEP}`, theme: n });
  for (const n of [0, 1]) out.push({ name: `theme:5555/dnb/${n + 1}`, link: `seed=5555&v=2&spell=${DNB}`, theme: n });
  return out.flatMap((j) => {
    const { seed, request } = played(j.link, j.theme);
    return WINDOWS.map((at, w) => ({ kind: 'theme', name: `${j.name}@${w + 1}`, seed, theme: j.theme, at, request: JSON.parse(JSON.stringify(request)) }));
  });
}

// --- the servers ----------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

/** A built site, or an engine's source with its TypeScript stripped, on a free port. */
function serve(root, { strip = false } = {}) {
  const s = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (strip && name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>same sound</title>'); return; }
    const file = path.join(root, name === '/' ? '/index.html' : name);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (strip && file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((done) => s.listen(0, '127.0.0.1', () => done({ port: s.address().port, close: () => s.close() })));
}

// --- what the page runs ------------------------------------------------------------

/** Both channels in blocks, each hashed to 64 bits; and, when asked, one block's raw samples. Installed on each page once. */
const INSTALL_DIGEST = () => {
  window.__sameSound = (buf, block, raw) => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const n = buf.length, blocks = [];
    const fnv = (h, words) => { for (let i = 0; i < words.length; i++) { h ^= words[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    for (let o = 0; o < n; o += block) {
      const e = Math.min(n, o + block);
      const l = new Uint32Array(L.buffer, L.byteOffset + o * 4, e - o), r = new Uint32Array(R.buffer, R.byteOffset + o * 4, e - o);
      const a = fnv(fnv(2166136261, l), r), b = fnv(fnv(0x9747b28c, r), l);
      blocks.push(a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'));
    }
    const out = { frames: n, blocks };
    if (raw != null) { const o = raw * block, e = Math.min(n, o + block); out.raw = { l: Array.from(L.subarray(o, e)), r: Array.from(R.subarray(o, e)) }; }
    return out;
  };
};

const RENDER_THEME = async ({ job, rate, block, raw, bars, pre }) => {
  const track = window.deepHouse.planTheme(String(job.seed), job.theme, job.request);
  const program = window.deepHouse.programOf(track);
  const bs = program.barSeconds;
  const from = Math.max(0, Math.round(track.bars * job.at) - pre);
  const slice = window.deepHouse.sliceProgram(program, { from: from * bs, to: (from + pre + bars) * bs, tail: 2, layers: null });
  const buf = await window.deepHouse.renderProgram(slice, { sampleRate: rate });
  return { ...window.__sameSound(buf, block, raw), events: slice.events.length };
};

/** The scene list of an engine, with every knob's and control's two ends read off its registry. */
const LIST_SCENES = async (base) => {
  const VO = await import(`${base}src/voices/index.ts`);
  const T = await import(`${base}tools/tables.ts`);
  const A1 = await import(`${base}tools/audition-voices.ts`);
  const A2 = await import(`${base}tools/audition-voices-2.ts`);
  const out = [];
  const ends = (voice) => {
    const d = VO.BY_NAME[voice];
    const knobs = Object.entries(d.knobs || {});
    const controls = Object.entries(d.controls || {});
    const row = [];
    if (knobs.length) for (const at of ['min', 'max']) row.push({ tag: `knobs-${at}`, p: { knobs: Object.fromEntries(knobs.map(([k, s]) => [k, s[at]])) } });
    if (controls.length) for (const at of ['min', 'max']) row.push({ tag: `controls-${at}`, p: Object.fromEntries(controls.map(([k, s]) => [k, s[at]])) });
    return row;
  };
  for (const t of T.TABLES) {
    for (const r of t.rows) {
      const at = { table: t.round, id: r.id, voice: r.voice };
      out.push({ ...at, name: `scene:${t.round}/${r.id}`, opts: {}, p: null });
      out.push({ ...at, name: `scene:${t.round}/${r.id}@soft-low`, opts: t.round === 'K3' ? { velScale: 0.55 } : { transpose: -7, velScale: 0.55 }, p: null });
      for (const e of ends(r.voice)) out.push({ ...at, name: `scene:${t.round}/${r.id}#${e.tag}`, opts: {}, p: e.p });
    }
  }
  for (const id of Object.keys(A1.HOLDS)) out.push({ table: 'held', id, voice: id, name: `held:${id}`, opts: {}, p: null });
  for (const id of Object.keys(A2.HOLDS_2)) out.push({ table: 'held2', id, voice: id, name: `held:${id}`, opts: {}, p: null });
  out.push({ table: 'strings', id: 'pad', voice: 'pad', name: 'held:strings', opts: {}, p: null });
  return out.map((s) => ({ kind: 'scene', ...s }));
};

const RENDER_SCENE = async ({ base, job, rate, block, raw }) => {
  const [G, MA, VO, SC, PL, A0, A1, A2, A3, AD] = await Promise.all([
    import(`${base}src/graph.ts`), import(`${base}src/master.ts`), import(`${base}src/voices/index.ts`),
    import(`${base}src/schedule.ts`), import(`${base}src/scheduler.ts`), import(`${base}tools/audition.ts`),
    import(`${base}tools/audition-voices.ts`), import(`${base}tools/audition-voices-2.ts`),
    import(`${base}tools/audition-voices-3.ts`), import(`${base}tools/audition-drums.ts`),
  ]);
  const make = {
    K2: () => A1.voiceAudition(job.id, job.opts), K3: () => AD.drumAudition(job.id, job.opts),
    K4: () => A2.voiceAudition2(job.id, job.opts), KV1: () => A3.voiceAudition3(job.id, job.opts),
    held: () => A1.heldVoiceAudition(job.id), held2: () => A2.heldVoiceAudition2(job.id), strings: () => A0.heldAudition(),
  }[job.table];
  const aud = make();
  let program = aud.program;
  if (job.p) program = { ...program, events: program.events.map((e) => ({ ...e, p: { ...e.p, ...job.p } })) };
  const settings = program.settings;
  const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
  await MA.prepareLimiter(ctx, settings);
  const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
  graph.out.connect(ctx.destination);
  PL.prepareReturns(graph, program);
  await VO.prepareVoices(ctx, settings, program.events, { all: true });
  PL.scheduleAutomation(graph, program, 0);
  for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, program, s.pe, s.at);
  if (job.table === 'held') A1.startHeldVoices(ctx, graph, aud, job.id, 0);
  if (job.table === 'held2') A1.startHeldVoices(ctx, graph, aud, job.id, 0, { holds: A2.HOLDS_2 });
  if (job.table === 'strings') A0.startDrones(ctx, graph, aud, 0);
  const buf = await ctx.startRendering();
  return { ...window.__sameSound(buf, block, raw), events: program.events.length };
};

// --- the run -------------------------------------------------------------------------

async function openTree({ site, engine }) {
  const { pw, label } = await playwright();
  const opts = launchOptions(ENGINE);
  const browser = await pw[ENGINE].launch(ENGINE === 'chromium' ? { ...opts, args: [...(opts.args || []), '--disable-gpu'] } : opts);
  renice(browser);
  const servers = [];
  let themePage = null, scenePage = null, engineBase = null;
  if (site) {
    const s = await serve(site); servers.push(s);
    themePage = await browser.newPage();
    await themePage.goto(`http://127.0.0.1:${s.port}/index.html?out=silent`, { waitUntil: 'domcontentloaded' });
    await themePage.waitForFunction(() => window.deepHouse, { timeout: 60000 });
    await themePage.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await themePage.evaluate(INSTALL_DIGEST);
  }
  if (engine) {
    const s = await serve(engine, { strip: true }); servers.push(s);
    engineBase = `http://127.0.0.1:${s.port}/`;
    scenePage = await browser.newPage();
    await scenePage.goto(engineBase, { waitUntil: 'domcontentloaded' });
    await scenePage.evaluate(INSTALL_DIGEST);
  }
  renice(browser);
  const render = (job, raw = null) => (job.kind === 'theme'
    ? themePage.evaluate(RENDER_THEME, { job, rate: THEME_RATE, block: BLOCK, raw, bars: WINDOW_BARS, pre: PREROLL_BARS })
    : scenePage.evaluate(RENDER_SCENE, { base: engineBase, job, rate: SCENE_RATE, block: BLOCK, raw }));
  return {
    label, render,
    scenes: () => scenePage.evaluate(LIST_SCENES, engineBase),
    close: async () => { await browser.close(); for (const s of servers) s.close(); },
  };
}

const want = (job) => !ONLY || ONLY.some((o) => job.name.startsWith(o));
const sha = (blocks) => crypto.createHash('sha256').update(blocks.join('')).digest('hex').slice(0, 16);
const say = (s) => process.stdout.write(`${s}\n`);

async function makeBefore() {
  if (!fs.existsSync(path.join(BEFORE, 'site', 'index.html')) || !fs.existsSync(path.join(BEFORE, 'engine', 'src')))
    throw new Error(`${BEFORE} holds no site and engine: build local's site there and copy its packages/engine first`);
  const tree = await openTree({ site: path.join(BEFORE, 'site'), engine: path.join(BEFORE, 'engine') });
  say(`  ${tree.label}; the before tree is ${fs.readFileSync(path.join(BEFORE, 'COMMIT'), 'utf8').trim()}`);
  const jobs = [...(SKIP_THEMES ? [] : themeJobs()), ...(SKIP_SCENES ? [] : await tree.scenes())].filter(want);
  const file = path.join(BEFORE, 'hashes.json');
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { items: {} };
  for (const job of jobs) {
    const t = Date.now();
    const r = await tree.render(job);
    saved.items[job.name] = { job, frames: r.frames, events: r.events, blocks: r.blocks };
    saved.engine = ENGINE;
    say(`  ${job.name}: ${r.frames} frames, ${r.events} events, ${sha(r.blocks)} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  fs.writeFileSync(file, JSON.stringify(saved));
  await tree.close();
  say(`before: ${jobs.length} renders written to ${path.relative(WORKTREE, file)}`);
}

async function repeat() {
  const saved = JSON.parse(fs.readFileSync(path.join(BEFORE, 'hashes.json'), 'utf8')).items;
  const jobs = Object.values(saved).map((s) => s.job).filter(want);
  const tree = await openTree({ site: path.join(BEFORE, 'site'), engine: path.join(BEFORE, 'engine') });
  for (const job of jobs) {
    const got = [];
    for (let i = 0; i < REPEAT; i++) got.push(sha((await tree.render(job)).blocks));
    say(`  ${job.name}: saved ${sha(saved[job.name].blocks)}; now ${got.join(' ')}`);
  }
  await tree.close();
}

async function compare() {
  const file = path.join(BEFORE, 'hashes.json');
  if (!fs.existsSync(file)) throw new Error('no before hashes: run with --before first');
  // This tree's site, built here and now: a site built before the last edit is
  // a comparison of the wrong tree, and a relative --outDir lands it somewhere
  // the comparison never looks.
  if (!flag('no-build')) execFileSync('npx', ['vite', 'build', '--outDir', AFTER_SITE, '--emptyOutDir'], { cwd: path.join(WORKTREE, 'packages', 'deep-house'), stdio: 'ignore' });
  if (!fs.existsSync(path.join(AFTER_SITE, 'index.html'))) throw new Error(`no site at ${AFTER_SITE}`);
  const whole = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ((whole.engine ?? 'chromium') !== ENGINE) throw new Error(`the before hashes are ${whole.engine ?? 'chromium'}'s and this is ${ENGINE}`);
  const saved = whole.items;
  const jobs = Object.values(saved).map((s) => s.job)
    .filter((j) => want(j) && !(SKIP_THEMES && j.kind === 'theme') && !(SKIP_SCENES && j.kind === 'scene'));
  const tree = await openTree(SELF ? { site: path.join(BEFORE, 'site'), engine: path.join(BEFORE, 'engine') } : { site: AFTER_SITE, engine: ENGINE_HERE });
  say(`  ${tree.label}${SELF ? '; the before tree against its own hashes' : ''}`);
  const differ = [];
  let equal = 0;
  for (const job of jobs) {
    const was = saved[job.name];
    let r;
    try { r = await tree.render(job); } catch (e) { differ.push({ job, why: `does not render: ${String(e.message || e).split('\n')[0]}` }); say(`  ${job.name}: DOES NOT RENDER`); continue; }
    const k = was.blocks.findIndex((b, i) => r.blocks[i] !== b);
    if (r.frames === was.frames && k < 0) { equal++; continue; }
    const at = k < 0 ? Math.min(r.frames, was.frames) : k * BLOCK;
    differ.push({ job, block: k < 0 ? null : k, frames: [was.frames, r.frames], at });
    say(`  ${job.name}: DIFFERS from frame ${at}${r.frames !== was.frames ? ` (length ${was.frames} -> ${r.frames})` : ''}`);
  }
  await tree.close();
  // The exact sample: both trees again, the first differing block handed back raw.
  if (differ.some((d) => d.block != null)) {
    const before = await openTree({ site: path.join(BEFORE, 'site'), engine: path.join(BEFORE, 'engine') });
    const after = await openTree({ site: AFTER_SITE, engine: ENGINE_HERE });
    for (const d of differ.filter((x) => x.block != null)) {
      const [a, b] = [await before.render(d.job, d.block), await after.render(d.job, d.block)];
      const rate = d.job.kind === 'theme' ? THEME_RATE : SCENE_RATE;
      for (let i = 0; i < a.raw.l.length; i++) {
        const ch = a.raw.l[i] !== b.raw.l[i] ? 'L' : a.raw.r[i] !== b.raw.r[i] ? 'R' : null;
        if (!ch) continue;
        const f = d.block * BLOCK + i;
        d.why = `first differing sample ${f} (${(f / rate).toFixed(4)} s), channel ${ch}: ${ch === 'L' ? a.raw.l[i] : a.raw.r[i]} -> ${ch === 'L' ? b.raw.l[i] : b.raw.r[i]}`;
        break;
      }
      d.why ||= 'the block differs in a re-render of one tree against the other only: the render is not deterministic';
    }
    await before.close(); await after.close();
  }
  for (const d of differ) say(`  ${d.job.name}: ${d.why || `length ${d.frames[0]} -> ${d.frames[1]}`}`);
  say(differ.length ? `same sound: ${differ.length} of ${jobs.length} differ, ${equal} render-equal` : `same sound: all ${jobs.length} render-equal to the byte`);
  process.exit(differ.length ? 1 : 0);
}

await (REPEAT ? repeat() : MAKE_BEFORE ? makeBefore() : compare());
