// The drum kitchen, each instrument alone against its own declared numbers.
//
//   node tools/test-drums.ts                the whole suite
//   node tools/test-drums.ts --only conga   one of them, for a fast loop
//   node tools/test-drums.ts --also         the articulations as well
//   node tools/test-drums.ts --bless        write the measured loudness and
//                                            the measured click bound into the
//                                            modules (only with Eugene's say-so)
//
// Round K3 of PLAN-KITCHEN. It is round K2's per-instrument scene again, in a
// file of its own for the same reason that one is: `test.ts` is the machine's
// suite and other rounds are inside it. What it holds each instrument to is
// what round G held the plucked mid bass to and round K2 held the six to,
// because a fixture allowed to be louder or clickier than the record proves
// nothing:
//
//   the loudness   the instrument alone through the real graph, eight bars of
//                  its role's own figure at 120 BPM with two bars of pre-roll
//                  thrown away, integrated, less the level the fixture's table
//                  gave it — within a decibel of the number its own module
//                  declares, in both engines and at both rates.
//   the peaks      a true peak at or under -1 dBTP and a sample peak at or
//                  under -1 dBFS.
//   the width      what the descriptor says, in both directions. A voice that
//                  declares `mono` has to be mono to the sample — which is the
//                  two alternative kicks, and it is the pin and not a hope —
//                  and a voice that does not has to genuinely have two
//                  channels.
//   finite         not one sample that is not a number.
//   the sidechain  nothing in the kitchen writes one. The duck is the
//                  composer's gesture; a drum that posted one would be
//                  measuring the duck and calling it the drum.
//
// And two things that are this round's own, because a drum is not a note:
//
//   the click      **per instrument, and declared.** The scenes' gate is a
//                  move over 0.05 in one sample *and* eight times its
//                  neighbours, and the second half of that is exactly what a
//                  drum transient is — a hat reads 4x on its own strike and a
//                  kick 4.1x in the released reference. So each instrument
//                  declares the largest one-sample move a lone hit of it
//                  makes, the gate holds the reading to that bound, and no
//                  bound may be over the scenes' own 0.05: a drum is allowed
//                  its own transient, it is not allowed to grow one.
//   the spread     eight strikes at one velocity, one a beat, and no two
//                  consecutive hits the same samples. A pre-rendered drum
//                  played from one buffer is a machine gun; this is where the
//                  variants, the rate, the gain, the decay and the pan are
//                  measured rather than asserted.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish } from './harness.ts';
import { DRUM_SCENES, missingDrumScenes } from './audition-drums.ts';
import { COVERED, coverage } from './tables.ts';
import { CONGA_MEASURED } from '../src/voices/congas.ts';
import { SNARE_MEASURED } from '../src/voices/snare.ts';
import { HATS_KIT_MEASURED } from '../src/voices/hats-kit.ts';
import { CYMBAL_MEASURED } from '../src/voices/cymbals.ts';
import { TOM_MEASURED } from '../src/voices/toms.ts';
import { PERC_MEASURED } from '../src/voices/perc.ts';
import { ALT_KICK_MEASURED } from '../src/voices/kicks-alt.ts';
import type { PlaywrightFound } from './harness.ts';
import type { ProgramEvent } from '../src/program.ts';
import type { Audition } from './audition.ts';

/**
 * The two numbers one playable articulation declares about itself, as the
 * modules write them (`--bless` puts them there and nobody types them).
 */
interface Declared {
  loudnessDb: number;
  clickStep: number;
}

// What every playable articulation of the kitchen declares about itself, off
// the modules that make the sound. One row per row of the scene table, and the
// gate below holds that to be true in both directions: a module here that the
// table does not play is as much a fault as a scene with nothing declared.
const MODULES: Record<string, Record<string, Declared>> = {
  'congas.ts': CONGA_MEASURED,
  'snare.ts': SNARE_MEASURED,
  'hats-kit.ts': HATS_KIT_MEASURED,
  'cymbals.ts': CYMBAL_MEASURED,
  'toms.ts': TOM_MEASURED,
  'perc.ts': PERC_MEASURED,
  'kicks-alt.ts': ALT_KICK_MEASURED,
};
const DECLARED: Record<string, Declared> = Object.assign({}, ...Object.values(MODULES));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };
// Above the suites' 6977, beside the engine suite's 7023, the ear's 7024 and
// round K2's 7045 and 7046 — and never 6975, which is Eugene's.
const PORT = 7047;

const arg = (k: string, d: string | null = null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only');
const BLESS = process.argv.includes('--bless');
const ALSO = process.argv.includes('--also') || BLESS;
const VERBOSE = process.argv.includes('--verbose');
const ENGINES = (arg('engines') || 'chromium,firefox').split(',');
const RATES = (arg('rates') || '44100,48000').split(',').map(Number);
const WANT = DRUM_SCENES.filter((s) => (ONLY ? s.id === ONLY : !s.also || ALSO)).map((s) => s.id);

let failed = 0;
const skipped: string[] = [];
const ok = (what: string): void => console.log(`  ok    ${what}`);
const bad = (what: string): void => { failed++; console.log(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string): void => (cond ? ok(what) : bad(why));

const GATES = {
  truePeakDbTP: -1,
  samplePeakDbFS: -1,
  // The scenes' own gate, and it is **both** halves: a move over 0.05 in one
  // sample *and* eight times its own neighbours. The second half is what
  // separates an edge from a bright instrument — a cymbal lidded at 12 kHz
  // moves that far between two samples all the way through its wash, and it is
  // not a click, it is a cymbal.
  clickCeiling: 0.05,
  clickRatio: 8,
  // ...and the kitchen's own half, which the scenes have no use for: each
  // instrument declares the largest move a lone hit of it makes, and the gate
  // fails when that grows, whatever the ratio says. A drum is allowed its own
  // transient; it is not allowed to grow one behind a gate that only looks at
  // absolutes.
  clickBand: 0.25,
  clickFloor: 0.002,
  monoTolerance: 0.0002,
  loudnessBandDb: 1.0,
  // What two consecutive strikes at one velocity have to differ by. It is a
  // floor and not a target: a pair that differs by less than this is the same
  // buffer read the same way, which is the one thing the spread exists to
  // prevent.
  spreadFloor: 0.0005,
};

// --- 1. node: the table against the registry --------------------------------
console.log('the drum fixtures, without a browser');

// Every registered voice has a fixture — in *one* of the tables. This one
// covers the drum kitchen; the harmonic rounds cover the record and what plays
// a line; and between them they have to cover the registry, because a
// registered instrument with no fixture has no gate at all. Since round K4 the
// tables are one list (`tools/tables.ts`) rather than each gate naming the
// others, so a table added tomorrow is one line there and nothing here.
must(
  !missingDrumScenes(COVERED).length,
  `the fixture tables and the registry disagree: ${missingDrumScenes(COVERED).join(', ')}`,
  `every registered voice has a fixture and every drum scene names a registered voice: ${coverage()}`
);

{
  const noRow = DRUM_SCENES.filter((s) => !DECLARED[s.id]).map((s) => s.id);
  const noScene = Object.keys(DECLARED).filter((id) => !DRUM_SCENES.some((s) => s.id === id));
  must(
    !noRow.length && !noScene.length,
    `the declared numbers and the scene table disagree: ${[...noRow.map((i) => `${i} declares nothing`), ...noScene.map((i) => `${i} is declared and never played`)].join(', ')}`,
    `every playable articulation declares a loudness and a click bound, and every declared row is played: ${Object.keys(DECLARED).length} rows over ${Object.keys(MODULES).length} modules`
  );
}

// --- the page ---------------------------------------------------------------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${PORT}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>drums</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  // `root` is a string wherever `file` is one: they are set together on the line
  // above, and this arm is only reached when `file` was named.
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise<void>((done) => server.listen(PORT, '127.0.0.1', done));
const BASE = `http://127.0.0.1:${PORT}/`;

/** The two channels of one window of a render, as the meters take them. */
type Channels = [Float32Array, Float32Array];

/**
 * The worst one-sample move found round a set of hits: the reading `meter.ts`
 * gives back, and the empty one `worstOf` starts from, which has no `at`
 * because it is not anywhere.
 */
interface Worst {
  t: number;
  step: number;
  ratio: number;
  at?: number;
}

/** What the page is asked for: which reading, of which instrument, at what rate. */
interface RunJob {
  base: string;
  kind: string;
  id: string;
  rate?: number;
}

// Everything below runs in the page: it is serialised on its way there, so it
// closes over nothing and imports what it needs by URL from the two roots this
// file serves.
const RUN = async (job: RunJob) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, AU, ME] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-drums.ts`),
    import(`${S}tools/meter.ts`),
  ]);
  const rate = job.rate || 44100;
  const began = performance.now();
  const round = (v: number, n = 2): number => +v.toFixed(n);
  const db = (v: number): number => round(20 * Math.log10(v + 1e-30));
  const channels = (buf: AudioBuffer, from = 0, to: number | null = null): Channels => {
    const a = Math.max(0, Math.round(from * buf.sampleRate));
    const b = Math.min(buf.length, Math.round((to == null ? buf.duration : to) * buf.sampleRate));
    return [buf.getChannelData(0).slice(a, b), buf.getChannelData(1).slice(a, b)];
  };
  const notNumbers = ([L, R]: Channels): number => {
    let n = 0;
    for (let i = 0; i < L.length; i++) { if (!Number.isFinite(L[i])) n++; if (!Number.isFinite(R[i])) n++; }
    return n;
  };
  const monoGap = ([L, R]: Channels): number => {
    let g = 0;
    for (let i = 0; i < L.length; i++) { const d = Math.abs(L[i] - R[i]); if (d > g) g = d; }
    return round(g, 6);
  };
  const worstOf = (list: Worst[]): Worst => list.reduce((a: Worst, c: Worst) => (c.step > a.step ? c : a), { step: 0, ratio: 0, t: 0 });

  const play = async (aud: Audition) => {
    const program = aud.program;
    const settings = program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    await VO.prepareVoices(ctx, settings, program.events, { all: true });
    PL.scheduleAutomation(graph, program, 0);
    for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, program, s.pe, s.at);
    const buf = await ctx.startRendering();
    const duck = graph.param('duck.gain').value;
    graph.dispose();
    return { buf, duck };
  };

  if (job.kind === 'scene') {
    const scene = AU.drumSceneOf(job.id);
    const aud = AU.drumAudition(job.id);
    const { buf, duck } = await play(aud);
    // The level table is read by name for the reason `audition.ts` writes down:
    // `VOICE_LEVEL` is keyed and valued by plain strings where `levels` is a
    // closed table of named fields.
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[scene.voice]];
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e: ProgramEvent) => e.t >= aud.window.from).map((e: ProgramEvent) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    const d = VO.BY_NAME[scene.voice];
    return {
      rate, ms: Math.round(performance.now() - began),
      voice: scene.voice, role: scene.role,
      hits: onsets.length,
      lufs, level, loudnessDb: round(lufs - level),
      mono: d.mono,
      truePeak: ME.truePeak(withTail),
      peak: db(ME.samplePeak(withTail)),
      gap: monoGap(withTail),
      bad: notNumbers(withTail),
      click: worstOf(ME.clicks(withTail, rate, onsets)),
      duck,
    };
  }

  // Eight strikes at one velocity: what is left between two of them is the
  // spread. The window compared is the shorter of the gap to the next strike
  // and a fifth of a second, so a long instrument is compared over the part of
  // itself that is loud and a short one over the whole of it.
  if (job.kind === 'spread') {
    const aud = AU.spreadAudition(job.id);
    const { buf } = await play(aud);
    const onsets = AU.spreadOnsets(aud);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const pairs = [];
    for (let i = 0; i + 1 < onsets.length; i++) {
      const gap = Math.min(onsets[i + 1] - onsets[i], 0.2);
      const n = Math.round(gap * rate);
      const a = Math.round(onsets[i] * rate);
      const b = Math.round(onsets[i + 1] * rate);
      if (b + n >= L.length) break;
      let diff = 0;
      let pa = 0;
      let pb = 0;
      for (let k = 0; k < n; k++) {
        const dl = Math.abs(L[a + k] - L[b + k]);
        const dr = Math.abs(R[a + k] - R[b + k]);
        if (dl > diff) diff = dl;
        if (dr > diff) diff = dr;
        pa = Math.max(pa, Math.abs(L[a + k]), Math.abs(R[a + k]));
        pb = Math.max(pb, Math.abs(L[b + k]), Math.abs(R[b + k]));
      }
      pairs.push({ diff: round(diff, 5), peakDb: round(20 * Math.log10((pb + 1e-30) / (pa + 1e-30)), 2) });
    }
    const worstSame = pairs.reduce((a, c) => (c.diff < a.diff ? c : a), { diff: Infinity, peakDb: 0 });
    return {
      rate, ms: Math.round(performance.now() - began),
      pairs: pairs.length,
      leastDifferent: worstSame.diff,
      peakSpreadDb: round(Math.max(...pairs.map((p) => Math.abs(p.peakDb))), 2),
    };
  }
  return { error: `no job called ${job.kind}` };
};

// --- 2. every instrument, in every engine, at both rates --------------------
let pw: PlaywrightFound | null = null;
try {
  pw = await playwright();
  console.log(`  ${pw.label}`);
} catch (e) {
  skipped.push(`the drum scenes: ${(e as Error).message.split('\n')[0]}`);
}

/**
 * One row of what was measured.
 *
 * Each instrument leaves two kinds of row in this table — a scene reading, one
 * per engine and rate, and one spread reading per engine — so the fields are
 * optional and `loudnessDb` is what tells the two apart. That is what both of
 * the places that read these rows filter on, and `SceneReading` below is the
 * half they are filtering for.
 */
interface Reading {
  engine: string;
  rate?: number;
  loudnessDb?: number;
  truePeak?: number;
  peak?: number;
  gap?: number;
  click?: Worst;
  spread?: number;
  peakSpreadDb?: number;
}

/** A scene reading: the row a loudness and a click bound are blessed from. */
interface SceneReading extends Reading {
  rate: number;
  loudnessDb: number;
  truePeak: number;
  peak: number;
  gap: number;
  click: Worst;
}

/** What each reading measured, gathered for `--bless` and for the write-up. */
const measured: Record<string, Reading[]> = {};
if (pw) {
  for (const engine of ENGINES) {
    if (!pw.pw[engine]) { skipped.push(`the drum scenes in ${engine}: playwright does not know it`); continue; }
    let browser = null;
    try {
      browser = await pw.pw[engine].launch(launchOptions(engine));
    } catch (e) {
      skipped.push(`the drum scenes in ${engine}: it is not installed (${(e as Error).message.split('\n')[0].slice(0, 60)})`);
      continue;
    }
    renice(browser);
    console.log(`  ${engine}`);
    const run = async (job: Omit<RunJob, 'base'>) => {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e: Error) => errors.push(e.message));
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const out = await page.evaluate(RUN, { ...job, base: BASE });
      await page.close();
      if (VERBOSE) console.log(`        ${job.kind} ${job.id}${job.rate ? `@${job.rate}` : ''} ${JSON.stringify(out)}`);
      if (errors.length) bad(`${job.kind} ${job.id} in ${engine}: the page threw: ${errors.join(' | ')}`);
      return out;
    };

    for (const id of WANT) {
      // A scene with nothing declared is a fault the gate above has already
      // reported; this one still has to say so per reading, so the row it works
      // from is whatever is there.
      const declared: Partial<Declared> = DECLARED[id] || {};
      for (const rate of RATES) {
        const r = await run({ kind: 'scene', id, rate });
        (measured[id] = measured[id] || []).push({ engine, rate, loudnessDb: r.loudnessDb, truePeak: r.truePeak, peak: r.peak, gap: r.gap, click: r.click });
        const off = Math.abs(r.loudnessDb - (declared.loudnessDb ?? 0));
        const widthOk = r.mono ? r.gap <= GATES.monoTolerance : r.gap > GATES.monoTolerance;
        // A bound of nought is a reading and not a hole: it says the largest
        // one-sample move within a millisecond of the strike is under a
        // twenty-thousandth, which is what a two-millisecond linear attack
        // from true zero buys. Eleven of the kitchen's instruments read it.
        const bound = declared.clickStep;
        const edge = r.click.step > GATES.clickCeiling && r.click.ratio > GATES.clickRatio;
        const grown = bound == null || r.click.step > bound * (1 + GATES.clickBand) + GATES.clickFloor;
        const clicked = edge || grown;
        must(
          r.bad === 0 && declared.loudnessDb != null && off <= GATES.loudnessBandDb && widthOk &&
            r.truePeak <= GATES.truePeakDbTP && r.peak <= GATES.samplePeakDbFS &&
            bound != null && !clicked && r.duck === 1,
          `${id} at ${rate}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${declared.loudnessDb == null ? 'it declares no loudness; ' : off > GATES.loudnessBandDb ? `${r.loudnessDb} dB against the declared ${declared.loudnessDb}; ` : ''}${widthOk ? '' : `it declares ${r.mono ? 'mono' : 'two channels'} and its channels differ by ${r.gap}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${bound == null ? 'it declares no click bound; ' : edge ? `a hit moves ${r.click.step} in one sample at ${r.click.ratio}x its neighbours, which is the scenes' own click; ` : grown ? `a hit moves ${r.click.step} in one sample against its declared ${bound}; ` : ''}${r.duck === 1 ? '' : `it wrote a sidechain (${r.duck})`}`,
          `${id} alone at ${rate / 1000} kHz: ${r.hits} hits over eight bars of ${r.role} at ${r.loudnessDb} dB (declared ${declared.loudnessDb}, ${off.toFixed(2)} off), ${r.mono ? 'mono to' : 'two channels apart by'} ${r.gap}, ${r.truePeak} dBTP / ${r.peak} dBFS, worst strike ${r.click.step} at ${r.click.ratio}x against its declared ${bound}, no sidechain written (${r.ms} ms)`
        );
      }

      // ...and that no two consecutive strikes are the same hit.
      const s = await run({ kind: 'spread', id, rate: RATES[RATES.length - 1] });
      (measured[id] = measured[id] || []).push({ engine, spread: s.leastDifferent, peakSpreadDb: s.peakSpreadDb });
      must(
        s.leastDifferent >= GATES.spreadFloor,
        `${id}: two consecutive strikes at one velocity differ by ${s.leastDifferent}, which is the same hit twice`,
        `${id}: ${s.pairs} consecutive pairs at one velocity, the least different by ${s.leastDifferent} and the peaks spread over ${s.peakSpreadDb} dB (${s.ms} ms)`
      );
    }
    await browser.close();
  }
}

server.close();

// --- 3. and what the readings say, if they are to be written down ------------
//
// A declared number is written by the gate that measures it and never typed.
// The loudness written is the **mean over every reading** — two engines and two
// rates — to a tenth of a decibel, and the band the gate then holds it to is a
// whole decibel. The click bound written is the **largest** reading, because a
// bound is a bound and not an average, and the gate then allows it a quarter of
// itself before it says the transient has grown.
if (BLESS) {
  console.log('\nblessing');
  // Written back into the module the sound is in, beside the code that makes
  // it, by the one regular expression the declared table's shape allows: one
  // row a line, two numbers on it.
  const bless = (id: string, loudnessDb: number, clickStep: number) => {
    for (const [name, rows] of Object.entries(MODULES)) {
      if (!(id in rows)) continue;
      const file = path.join(SRC, 'voices', name);
      const text = fs.readFileSync(file, 'utf8');
      const re = new RegExp(`(\\n  ${id}: \\{ loudnessDb: )(-?[0-9.]+)(, clickStep: )([0-9.]+)`);
      const had = text.match(re);
      if (!had) return { loudnessDb: null, clickStep: null };
      fs.writeFileSync(file, text.replace(re, `$1${loudnessDb}$3${clickStep}`));
      return { loudnessDb: had[2], clickStep: had[4] };
    }
    return { loudnessDb: null, clickStep: null };
  };
  for (const id of WANT) {
    const rows = (measured[id] || []).filter((r): r is SceneReading => r.loudnessDb != null);
    if (rows.length < 2) { console.log(`  ${id}: ${rows.length} readings, not blessed`); continue; }
    const mean = Math.round((rows.reduce((a, r) => a + r.loudnessDb, 0) / rows.length) * 10) / 10;
    const click = Math.ceil(Math.max(...rows.map((r) => r.click.step)) * 10000) / 10000;
    const was = bless(id, mean, click);
    console.log(`  ${id}: ${was.loudnessDb} -> ${mean} dB, click ${was.clickStep} -> ${click}  (${rows.map((r) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb}/${r.click.step}`).join(', ')})`);
  }
  console.log('\nre-run without --bless to check the declared numbers against the band.');
  process.exit(0);
}

if (VERBOSE) {
  for (const [id, rows] of Object.entries(measured)) {
    console.log(`  ${id}: ${rows.filter((r): r is SceneReading => r.loudnessDb != null).map((r) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb} dB, ${r.truePeak} dBTP, gap ${r.gap}`).join(' | ')}`);
  }
}

finish({ failed, skipped });
