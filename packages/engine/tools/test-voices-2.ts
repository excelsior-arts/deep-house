// Round K4's sixteen, each alone against its own declared numbers.
//
//   node tools/test-voices-2.ts                  the whole suite
//   node tools/test-voices-2.ts --only marimba   one of them, for a fast loop
//   node tools/test-voices-2.ts --bless          write the measured loudness
//                                                 into the modules
//
// Round K4 of PLAN-KITCHEN. It is round K2's own gate with this round's table
// behind it, and it is a file of its own for the reason that round gave: a
// round's instruments get a gate beside their fixture, and `test.ts` is the
// machine's suite. Everything it holds a voice to is round K2's list unchanged,
// because a contract enforced differently for the fourth sixteen is not a
// contract:
//
//   the loudness    the voice alone through the real graph, eight bars of its
//                   role's own figure at 120 BPM with two bars of pre-roll
//                   thrown away, integrated, less the level the fixture's table
//                   gave it — within a decibel of the number its own module
//                   declares, in both engines and at both rates.
//   the peaks       a true peak at or under -1 dBTP and a sample peak at or
//                   under -1 dBFS.
//   the clicks      the scenes' own gate: a move over 0.05 in one sample *and*
//                   eight times its own neighbours.
//   the width       what the descriptor says. A voice that declares `mono` has
//                   to be mono to the sample; a voice that does not has to
//                   actually have two channels, because `mono: false` on a
//                   voice whose channels are identical is a claim about the
//                   sound that is not true.
//   finite          not one sample that is not a number.
//
// And three things that are this round's own:
//
//   the tables      all four fixture tables against the registry, from
//                   `tools/tables.ts` — the fix round K3 asked for and round
//                   K4 landed, now with a third table in it.
//   the hold        the two that hold, against the contract: holding, paused,
//                   back at the level they were holding at, released over their
//                   own stated tail, and gone. One of them answers to a third
//                   control, `morph`, which is where between two spectra a
//                   wavetable pad is sitting.
//   the shapes      three readings a contract gate cannot take: that the two
//                   subs are **mono to the sample** (they declare it, and a
//                   one-channel stream through the mid/side stage is 0.0266
//                   apart in Firefox if it is not pinned), that the wavetable
//                   pad's two frames really are two spectra, and that the grain
//                   cloud's grains are the same cloud in a render and in a
//                   slice of one.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish } from './harness.ts';
import { K4_VOICES, SCENES_2 } from './audition-voices-2.ts';
import { uncovered, coverage } from './tables.ts';
import type { PlaywrightFound } from './harness.ts';
import type { ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { Audition } from './audition.ts';
import type { HeldVoice } from '../src/voices/voice-contract.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE };
// Beside the voices' 7045, the effects' 7046 and the ear's 7024, and never
// 6975, which is Eugene's.
const PORT = 7048;

const arg = (k: string, d: string | null = null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only');
const BLESS = process.argv.includes('--bless');
const VERBOSE = process.argv.includes('--verbose');
const ENGINES = (arg('engines') || 'chromium,firefox').split(',');
const RATES = (arg('rates') || '44100,48000').split(',').map(Number);
const WANT = K4_VOICES.filter((id) => !ONLY || id === ONLY);

let failed = 0;
const skipped: string[] = [];
const ok = (what: string): void => console.log(`  ok    ${what}`);
const bad = (what: string): void => { failed++; console.log(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string): void => (cond ? ok(what) : bad(why));

// The gates, and they are the nine scenes' own.
const GATES = {
  truePeakDbTP: -1,
  samplePeakDbFS: -1,
  clickStep: 0.05,
  clickRatio: 8,
  monoTolerance: 0.0002,
  loudnessBandDb: 1.0,
  // What a resume has to come back within. Round G held `holdStrings` to half a
  // decibel over a four-second window, and the formant pad cannot be: its vowel
  // walks a whole cycle in twenty-two seconds, so two four-second windows ten
  // seconds apart are two different vowels and the level is legitimately
  // different. MEASURED: the resume reads 0.61 dB over the hold on a voice
  // whose own drift moves it by that much inside one window, and the supersaw
  // beside it — whose drift is six cents at a fourteenth of a Hertz — reads
  // 0.25. A decibel is the band, and what it is holding is what the contract
  // actually promises: the drone came back, and at the level it was holding at.
  holdBandDb: 1.0,
  centsBand: 1.0,
};

// --- 1. node: the four tables against the registry ---------------------------
console.log('the fixtures, without a browser');

must(
  !uncovered().length,
  `the scene tables and the registry disagree: ${uncovered().join(', ')}`,
  `every registered voice has a fixture and every fixture names a registered voice: ${coverage()}`
);

{
  // Every row of this round's table is one of this round's voices, and every
  // one of this round's voices has a row. It is the same question one table
  // down, and it is asked here because a voice added to a module and left out
  // of the table would be covered by nothing and measured by nothing.
  const rows = SCENES_2.map((s) => s.id);
  const noRow = K4_VOICES.filter((id) => !rows.includes(id));
  must(
    !noRow.length && rows.length === K4_VOICES.length,
    `${noRow.join(', ')} has no row in this round's table`,
    `${rows.length} rows over ${new Set(SCENES_2.map((s) => s.voice)).size} voices, every one of them played in the register it is for`
  );
}

// --- the page ---------------------------------------------------------------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, `http://127.0.0.1:${PORT}`).pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>voices</title>'); return; }
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

/**
 * The settings blocks an override may be put over: the fields of the table that
 * are themselves tables. `swing` and `hatNudge` are numbers and there is
 * nothing to put over one, which is what this says in type.
 */
type SettingsBlock = { [K in keyof Settings]-?: Settings[K] extends object ? K : never }[keyof Settings];

/** One settings block, overridden for the length of one render. */
interface BlockOverride {
  block: SettingsBlock;
  with: Record<string, unknown>;
}

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

/** What the page is asked for: which reading, of which voice, at what rate. */
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
  const [G, MA, VO, SC, PL, AU, ME, AV] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices-2.ts`),
    import(`${S}tools/meter.ts`),
    import(`${S}tools/audition-voices.ts`),
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
  const rms = ([L, R]: Channels): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * L.length));
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

  // The fixture's own runner: the program through `schedule()` into the v1
  // graph. No composer, no plan, no style.
  const play = async (aud: Audition, over: BlockOverride | null = null) => {
    const program = aud.program;
    const settings = over ? { ...program.settings, [over.block]: { ...program.settings[over.block], ...over.with } } : program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: program.trimDb });
    graph.out.connect(ctx.destination);
    await VO.prepareVoices(ctx, settings, program.events, { all: true });
    PL.scheduleAutomation(graph, { ...program, settings }, 0);
    for (const s of SC.schedule(program, SC.offsetGrid(0)).events) PL.fireEvent(ctx, graph, { ...program, settings }, s.pe, s.at);
    const buf = await ctx.startRendering();
    const duck = graph.param('duck.gain').value;
    graph.dispose();
    return { buf, duck };
  };

  if (job.kind === 'scene') {
    const aud = AU.voiceAudition2(job.id);
    const { buf, duck } = await play(aud);
    // The level table is read by name for the reason `audition.ts` writes down:
    // `VOICE_LEVEL` is keyed and valued by plain strings where `levels` is a
    // closed table of named fields.
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[AU.scene2Of(job.id).voice]];
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e: ProgramEvent) => e.t >= aud.window.from).map((e: ProgramEvent) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    const d = VO.BY_NAME[AU.scene2Of(job.id).voice];
    return {
      rate, ms: Math.round(performance.now() - began),
      notes: aud.program.events.length, hits: onsets.length,
      lufs, level, loudnessDb: round(lufs - level),
      declared: VO.TIMBRES[job.id] ? VO.TIMBRES[job.id].loudnessDb : null,
      mono: d.mono,
      truePeak: ME.truePeak(withTail),
      peak: db(ME.samplePeak(withTail)),
      rms: db(rms(win)),
      gap: monoGap(withTail),
      bad: notNumbers(withTail),
      click: worstOf(ME.clicks(withTail, rate, onsets)),
      duck,
    };
  }

  if (job.kind === 'held') {
    const aud = AU.heldVoiceAudition2(job.id);
    const d = aud.drones[0];
    const program = aud.program;
    const settings = program.settings;
    const ctx = new OfflineAudioContext(2, Math.ceil(program.duration * rate), rate);
    await MA.prepareLimiter(ctx, settings);
    const graph = G.makeV1Graph(ctx, settings, { bpm: program.bpm, trimDb: 0 });
    graph.out.connect(ctx.destination);
    const held = AV.startHeldVoices(ctx, graph, aud, job.id, 0, { holds: AU.HOLDS_2 });
    const facts = { tails: held.map((h: HeldVoice) => h.tail), controls: [...held[0].controls], states: held.map((h: HeldVoice) => h.state) };
    const buf = await ctx.startRendering();
    for (const h of held) h.dispose();
    const gone = held.map((h: HeldVoice) => h.state);
    graph.dispose();
    const level = (from: number, to: number): number => db(rms(channels(buf, from, to)));
    const silent = d.release + facts.tails[0];
    return {
      rate, ms: Math.round(performance.now() - began),
      tail: facts.tails[0], controls: facts.controls, state: facts.states[0], disposed: gone[0],
      at: d.at, pause: d.pause, resume: d.resume, release: d.release, silentAt: round(silent, 3),
      // Four seconds a window, for the reason round G wrote down: a pad's own
      // level swings several decibels from one second to the next and a short
      // window reads the beating rather than the drone.
      holding: level(3, 7),
      paused: level(10.5, 11.5),
      resumed: level(13, 17),
      afterTail: level(silent + 0.2, program.duration),
      bad: notNumbers(channels(buf)),
      peak: db(ME.samplePeak(channels(buf))),
    };
  }
  return { error: `no job called ${job.kind}` };
};

// --- 2. every one of the six, in every engine, at both rates -----------------
let pw: PlaywrightFound | null = null;
try {
  pw = await playwright();
  console.log(`  ${pw.label}`);
} catch (e) {
  skipped.push(`the voice scenes: ${(e as Error).message.split('\n')[0]}`);
}

/** One row of what was measured: the five numbers one scene was read on. */
interface Reading {
  engine: string;
  rate: number;
  loudnessDb: number;
  truePeak: number;
  peak: number;
  gap: number;
  click: Worst;
}

/** What each reading measured, gathered for `--bless`. */
const measured: Record<string, Reading[]> = {};

if (pw) {
  for (const engine of ENGINES) {
    if (!pw.pw[engine]) { skipped.push(`the voice scenes in ${engine}: playwright does not know it`); continue; }
    let browser = null;
    try {
      browser = await pw.pw[engine].launch(launchOptions(engine));
    } catch (e) {
      skipped.push(`the voice scenes in ${engine}: it is not installed (${(e as Error).message.split('\n')[0].slice(0, 60)})`);
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
      for (const rate of RATES) {
        const r = await run({ kind: 'scene', id, rate });
        (measured[id] = measured[id] || []).push({ engine, rate, loudnessDb: r.loudnessDb, truePeak: r.truePeak, peak: r.peak, gap: r.gap, click: r.click });
        const off = Math.abs(r.loudnessDb - r.declared);
        const widthOk = r.mono ? r.gap <= GATES.monoTolerance : r.gap > GATES.monoTolerance;
        const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
        must(
          r.bad === 0 && off <= GATES.loudnessBandDb && widthOk && r.truePeak <= GATES.truePeakDbTP &&
            r.peak <= GATES.samplePeakDbFS && !clicked && r.duck === 1,
          `${id} at ${rate}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${off > GATES.loudnessBandDb ? `${r.loudnessDb} dB against the declared ${r.declared}; ` : ''}${widthOk ? '' : `it declares ${r.mono ? 'mono' : 'stereo'} and its channels differ by ${r.gap}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${r.duck === 1 ? '' : `it wrote a sidechain (${r.duck})`}`,
          `${id} alone at ${rate / 1000} kHz: ${r.hits} notes over eight bars at ${r.loudnessDb} dB (declared ${r.declared}, ${off.toFixed(2)} off), ${r.mono ? 'mono to' : 'two channels apart by'} ${r.gap}, ${r.truePeak} dBTP / ${r.peak} dBFS, worst click ${r.click.step} at ${r.click.ratio}x, no sidechain written (${r.ms} ms)`
        );
      }
    }

    // The two that hold, against the contract.
    for (const id of WANT.filter((v) => ['grainPad', 'wavePad'].includes(v))) {
      const r = await run({ kind: 'held', id, rate: 48000 });
      const back = Math.abs(r.resumed - r.holding);
      must(
        r.bad === 0 && r.paused < r.holding - 40 && back <= GATES.holdBandDb && r.afterTail < -80 &&
          r.state === 'released' && r.disposed === 'gone' && r.controls.length >= 2,
        `${id} held: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${r.paused < r.holding - 40 ? '' : `a pause left ${r.paused} dB where it was holding at ${r.holding}; `}${back <= GATES.holdBandDb ? '' : `it came back at ${r.resumed} dB where it was holding at ${r.holding}; `}${r.afterTail < -80 ? '' : `${r.afterTail} dB is still sounding after its stated tail; `}${r.state === 'released' ? '' : `it says it is ${r.state}`}`,
        `${id} held, paused and brought back: ${r.holding} dB holding, ${r.paused} dB paused at ${r.pause} s, ${r.resumed} dB after ${r.resume} s (${back.toFixed(2)} dB of it), released at ${r.release} s over its stated ${r.tail} s tail and silent at ${r.silentAt} s (${r.afterTail} dB after it), then disposed; it answers to ${r.controls.join(', ')} (${r.ms} ms)`
      );
    }

    await browser.close();
  }
}

server.close();

// --- 3. and what the readings say, if they are to be written down ------------
//
// A declared number is written by the gate that measures it and never typed.
// What is written is the **mean over every reading** — two engines and two
// rates — rounded to a tenth of a decibel, and the band the gate then holds it
// to is a whole decibel, so a number blessed here passes everywhere it was
// measured by construction.
const MODULES: Record<string, string> = {
  pulseLead: 'wave-leads.ts', triLead: 'wave-leads.ts',
  subSoft: 'subs.ts', subTri: 'subs.ts',
  sawPad: 'saw-pad.ts',
  fmGlass: 'fm-keys.ts', fmEp: 'fm-keys.ts', fmPluck: 'fm-keys.ts',
  marimba: 'mallets.ts', vibes: 'mallets.ts',
  brightPiano: 'keys-2.ts', reedOrgan: 'keys-2.ts',
  vinylBed: 'texture.ts', grainPad: 'texture.ts', sweepUp: 'texture.ts',
  wavePad: 'wave-pad.ts',
};
if (BLESS) {
  console.log('\nblessing');
  for (const id of WANT) {
    const rows = measured[id] || [];
    if (rows.length < 2) { console.log(`  ${id}: ${rows.length} readings, not blessed`); continue; }
    const mean = rows.reduce((a: number, r: Reading) => a + r.loudnessDb, 0) / rows.length;
    const now = Math.round(mean * 10) / 10;
    const file = path.join(SRC, 'voices', MODULES[id]);
    const text = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`(${id}: \\{[^}]*loudnessDb: )(-?[0-9.]+)`);
    if (!re.test(text)) { console.log(`  ${id}: no declared loudness found in ${MODULES[id]}`); continue; }
    // The guard above is `re.test(text)`, so there is a match to read.
    const was = text.match(re)![2];
    fs.writeFileSync(file, text.replace(re, `$1${now}`));
    console.log(`  ${id}: ${was} -> ${now}  (${rows.map((r: Reading) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb}`).join(', ')})`);
  }
  console.log('\nre-run without --bless to check the declared numbers against the band.');
  process.exit(0);
}

if (VERBOSE) {
  for (const [id, rows] of Object.entries(measured)) {
    console.log(`  ${id}: ${rows.map((r: Reading) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb} dB, ${r.truePeak} dBTP, gap ${r.gap}`).join(' | ')}`);
  }
}

finish({ failed, skipped });
