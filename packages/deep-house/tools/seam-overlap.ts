// seam-overlap.ts — how long two harmonies sound together across a hand-over.
//
//   node tools/seam-overlap.ts --keys [--seeds 1-40] [--themes 3]
//        the key of every theme of every seed under house-v2, the notes each
//        seam's two keys share, and the fraction of seams that are related
//        (six or seven of seven), plus 27191 at the benchmark spell
//   node tools/seam-overlap.ts --measure --seeds 5,17,27191 --site tmp/site
//        [--threshold -20,-30] [--hop 0.05] [--out tmp/seam-overlap]
//        for every seam of each seed: the harmonic stems of both themes over
//        the seam window, rendered offline through the page's own graph, the
//        seam's curves applied to each, and the seconds both stand above each
//        threshold together — under six curves from the same stems: the cross
//        off, MIX-X2's gain alone, the gain with MIX-X4's close, and the close
//        with the fade shorter (two bars), with it softer (to 0.5), and
//        landing at the swap instead of where the cross begins.
//        `--reuse` reads a stem already under --out instead of rendering it
//
// Round MIX-X2 (Eugene, 10-02: *"for a significant time — 4–6 s — users may
// experience overlaid voices from different keys"*). The number to bring down
// is the seconds the outgoing theme's pads and keys and the arriving theme's
// are both audible, and what moves it is the curves `seamCurves` writes — so the
// stems are rendered once and the curves are what is varied. A stem is the
// theme's `pad` and `keys` layers (`STAGE_HARMONIC`) through the whole graph, so
// its sends are in it; the seam's gain is applied to the whole stem, which
// overstates what the harmonic gain takes off the sends' tails by the sends'
// share. The outgoing deck's low-pass is not modelled, so its last two bars
// read a little louder than they play. Both readings are the same on both
// sides of the comparison.
//
// **The close is modelled on the spectrum** (round MIX-X4): the stem's power
// spectrum per hop (a Hann window, 2048 points) weighted by the Butterworth
// low-pass's response at the corner the curve has reached, as a ratio to the
// unfiltered power — so a curve with no filter reads exactly as it did, and
// the stems are rendered at 22050 Hz, so what the close takes off above 11 kHz
// is not counted (a pad has little there).
//
// The seconds of the two decks are the set's: every planned seam is a drift
// (one tempo for the set), so a theme second is a set second and the arriving
// theme enters at its first bar at `at`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, setLayout, STRATEGIES } from '../src/mix.ts';
import { seamCurves, setOptions } from '../src/set-plan.ts';
import { STAGE_HARMONIC, programOf, playsKick } from '../src/performance.ts';
import { keysShared } from '../src/theory.ts';
import { BENCHMARK_SEED, BENCHMARK_SPELL } from './link-digest.ts';
import { deckThemeTime } from '@deep-house/engine/deck';
import { ROOT, serveSite, openPage, RENDER_WINDOW, pcmOf, wav } from './imprint/render.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);
const say = (s) => process.stdout.write(`${s}\n`);

const STRATEGY = arg('strategy', 'house-v2');
const THEMES = Number(arg('themes', 3));
const RATE = 22050;
const PORT = 7042;

/** `1-40`, `5,17,27191`, or both. */
function seedsOf(text) {
  const out = [];
  for (const piece of String(text).split(',')) {
    const m = /^(\d+)-(\d+)$/.exec(piece.trim());
    if (m) for (let s = Number(m[1]); s <= Number(m[2]); s++) out.push(String(s));
    else if (piece.trim()) out.push(piece.trim());
  }
  return out;
}

const optsFor = (seed) => ({ strategy: STRATEGY, ...(seed === BENCHMARK_SEED ? { spell: BENCHMARK_SPELL } : {}) });
const themesFor = (seed) => (seed === BENCHMARK_SEED ? 5 : THEMES);

// --- the keys -----------------------------------------------------------------

function keys() {
  const seeds = seedsOf(arg('seeds', '1-40'));
  if (!seeds.includes(BENCHMARK_SEED)) seeds.push(BENCHMARK_SEED);
  let seams = 0, related = 0;
  const shared = [0, 0, 0, 0, 0, 0, 0, 0];
  const worst = [];
  for (const seed of seeds) {
    const n = themesFor(seed);
    const plans = [];
    for (let i = 0; i < n; i++) plans.push(planTheme(seed, i, optsFor(seed)));
    const row = [];
    for (let i = 0; i < n; i++) {
      const t = plans[i];
      let tag = t.key.name;
      if (i > 0) {
        const s = keysShared(plans[i - 1].key, t.key);
        seams++;
        shared[s]++;
        if (s >= 6) related++;
        tag += ` (${s}/7, blend ${t.blendBars})`;
        worst.push({ seed, seam: i - 1, shared: s, from: plans[i - 1].key.name, to: t.key.name, blend: t.blendBars, bars: plans[i - 1].bars, bpm: plans[i - 1].bpm });
      }
      row.push(tag);
    }
    say(`${seed.padStart(6)}  ${row.join('  →  ')}`);
  }
  say('');
  say(`${seams} seams: ${related} related (six or seven notes of seven shared), ${(100 * related / seams).toFixed(0)} %`);
  say(`shared notes, seams: ${shared.map((c, s) => `${s}:${c}`).join('  ')}`);
  worst.sort((a, b) => a.shared - b.shared || a.seed.localeCompare(b.seed));
  say('');
  say('the worst, by notes shared:');
  for (const w of worst.slice(0, 16))
    say(`  ${w.seed.padStart(6)} seam ${w.seam}: ${w.from} → ${w.to}, ${w.shared}/7, blend ${w.blend} bars, theme of ${w.bars} bars at ${w.bpm} BPM`);
}

// --- the overlap -------------------------------------------------------------

/** A curve's value at `t`, from its points: a `set` holds, `lin` and `exp` walk. */
function curveAt(points, t) {
  if (!points.length) return 1;
  if (t <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (t < b.t) {
      if (b.k === 'set') return a.v;
      const k = (t - a.t) / (b.t - a.t);
      if (b.k === 'exp' && a.v > 0 && b.v > 0) return a.v * Math.pow(b.v / a.v, k);
      return a.v + (b.v - a.v) * k;
    }
  }
  return points[points.length - 1].v;
}

/** The seam's gain on one deck's harmonic stem at set time `t`: its fader times its harmonic gain. */
function seamGain(plan, deck, t) {
  let g = 1;
  for (const line of plan.lines) {
    if (line.deck !== deck) continue;
    if (line.param === 'fader.gain' || line.param === 'harmonic.gain') g *= curveAt(line.points, t);
  }
  return g;
}

/** The corner the seam's close on one deck's harmony has reached at `t`, or none. */
function seamCorner(plan, deck, t) {
  const line = plan.lines.find((l) => l.deck === deck && l.param === 'harmonicLp.frequency');
  return line ? curveAt(line.points, t) : Infinity;
}

/** The same seam with the close landing at the swap instead of where the cross begins. */
function later(plan) {
  return { ...plan, lines: plan.lines.map((l) => (l.deck === 'from' && l.param === 'harmonicLp.frequency'
    ? { ...l, points: [l.points[0], { ...l.points[1], t: plan.swapAt }] } : l)) };
}

/** The same seam with the outgoing harmony's fade stopping short of 0.3: its floor before the cross bar. */
function softened(plan, floor) {
  return { ...plan, lines: plan.lines.map((l) => (l.deck === 'from' && l.param === 'harmonic.gain'
    ? { ...l, points: l.points.map((p) => (p.k === 'lin' && p.v === 0.3 ? { ...p, v: floor } : p)) } : l)) };
}

/** In place, radix two, `re`/`im` of a power-of-two length. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Per hop of interleaved 16-bit stereo PCM: the RMS, and the mid's power
 * spectrum (`N / 2 + 1` bins at `rate / N` Hz) for the close to weigh.
 */
function envelope(pcm, rate, hop) {
  const n = Math.floor(pcm.length / 4);
  const per = Math.max(1, Math.round(hop * rate));
  const N = 1 << Math.ceil(Math.log2(per));
  const window = new Float64Array(per);
  for (let i = 0; i < per; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (per - 1));
  const rms = [], spectra = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i += per) {
    let e = 0, m = 0;
    re.fill(0); im.fill(0);
    for (let j = i; j < Math.min(n, i + per); j++) {
      const l = pcm.readInt16LE(j * 4) / 32768, r = pcm.readInt16LE(j * 4 + 2) / 32768;
      e += (l * l + r * r) / 2;
      re[j - i] = ((l + r) / 2) * window[j - i];
      m++;
    }
    fft(re, im);
    const P = new Float32Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k];
    rms.push(Math.sqrt(e / Math.max(1, m)));
    spectra.push(P);
  }
  return { rms, spectra, binHz: rate / N };
}

/**
 * What a Butterworth low-pass at `fc` leaves of a hop's power, as a ratio of
 * its level (amplitude); `fromHz` reads the band above it alone, which is
 * where a pad's partials clash and where the close works.
 */
function closeRatio(P, binHz, fc, fromHz = 0) {
  if (!Number.isFinite(fc)) return 1;
  let all = 0, kept = 0;
  for (let k = Math.ceil(fromHz / binHz); k < P.length; k++) {
    const r = (k * binHz) / fc;
    all += P[k];
    kept += P[k] / (1 + r * r * r * r);
  }
  return all > 0 ? Math.sqrt(kept / all) : 1;
}

const db = (x) => 20 * Math.log10(x + 1e-9);

async function measure() {
  const seeds = seedsOf(arg('seeds', '5,17,27191'));
  const site = arg('site', path.join(ROOT, 'tmp', 'site'));
  const thresholds = String(arg('threshold', '-20,-30')).split(',').map(Number);
  const hop = Number(arg('hop', 0.05));
  const outDir = arg('out', path.join(ROOT, 'tmp', 'seam-overlap'));
  fs.mkdirSync(outDir, { recursive: true });
  const style = STRATEGIES[STRATEGY].style;
  // The page, opened the first time a stem has to be rendered: a run that
  // reads every stem off the disk (`--reuse`) never opens a browser.
  let server = null, browser = null;
  const pageOf = async () => {
    if (browser) return browser.page;
    server = await serveSite(PORT, site);
    browser = await openPage(PORT);
    return browser.page;
  };
  const rows = [];
  try {
    for (const seed of seeds) {
      const o = { ...optsFor(seed), style };
      const L = setLayout(seed, themesFor(seed), optsFor(seed));
      const full = setOptions(style, o);
      const hc = full.harmonicCross;
      // The six curves: the cross off (every layer on the fader), MIX-X2's
      // gain alone (the close held open), the gain with the close as it
      // ships, the close with the fade two bars instead of four and with its
      // floor at 0.5 instead of 0.3 before the cross bar, and the close
      // landing at the swap instead of where the cross begins.
      const variants = {
        off: (m) => seamCurves(m, { ...full, harmonicCross: undefined }),
        x2: (m) => seamCurves(m, { ...full, harmonicCross: hc && { ...hc, lpHz: 20000 } }),
        x4: (m) => seamCurves(m, full),
        short: (m) => seamCurves(m, { ...full, harmonicCross: hc && { ...hc, fadeBars: 2 } }),
        soft: (m) => softened(seamCurves(m, full), 0.5),
        late: (m) => later(seamCurves(m, full)),
      };
      const decks = L.plans.map((track, i) => ({ track, program: programOf(track), clock: L.clock, startBeat: L.clock.beatAt(L.starts[i]), perBeat: L.perBeats[i] }));
      for (const s of L.seams) {
        const from = decks[s.from], to = decks[s.to];
        const moment = {
          at: s.at, bars: s.bars, barSeconds: s.barSeconds, swapAt: s.swapAt,
          filterMove: to.track.filterMove, outgoingBar: from.track.barSeconds,
          swapInFrom: deckThemeTime(from, s.swapAt), swapInTo: deckThemeTime(to, s.swapAt),
          sumGain: 1, fromKick: playsKick(from.program, full.swapGroup), toKick: playsKick(to.program, full.swapGroup),
          fromKey: from.track.key, toKey: to.track.key,
        };
        const shared = keysShared(from.track.key, to.track.key);
        // The stems: the outgoing theme from a bar before the seam to a bar past
        // its end, the arriving one from its first bar — both the pad and keys
        // layers, rendered with two bars of pre-roll so their rooms are running.
        const bs = s.barSeconds;
        const fromBar = s.bar;
        const bars = s.bars + 1;
        const jobs = [
          { name: 'out', masterSeed: seed, theme: s.from, opts: optsFor(seed), preFromBar: Math.max(0, fromBar - 2), fromBar, toBar: fromBar + bars, tail: 0, layers: STAGE_HARMONIC },
          { name: 'in', masterSeed: seed, theme: s.to, opts: optsFor(seed), preFromBar: 0, fromBar: 0, toBar: bars, tail: 0, layers: STAGE_HARMONIC },
        ];
        const env = {};
        for (const job of jobs) {
          const file = path.join(outDir, `${seed}-seam${s.from}-${job.name}.wav`);
          let pcm;
          if (flag('reuse') && fs.existsSync(file)) pcm = fs.readFileSync(file).subarray(44);
          else {
            const r = await (await pageOf()).evaluate(RENDER_WINDOW, { ...job, sampleRate: RATE });
            pcm = pcmOf(r);
            fs.writeFileSync(file, wav(pcm, RATE));
          }
          env[job.name] = envelope(pcm, RATE, hop);
        }
        // One deck's harmonic level at hop `i` under a seam's curves: the stem's
        // RMS, the seam's gain, and what its close leaves.
        const level = (plan, deck, i) => {
          const e = env[deck === 'from' ? 'out' : 'in'];
          const t = s.at + i * hop;
          return e.rms[i] * seamGain(plan, deck, t) * closeRatio(e.spectra[i], e.binHz, seamCorner(plan, deck, t));
        };
        const count = (plan, threshold) => {
          let both = 0, outAbove = 0, inAbove = 0, first = null, last = null;
          const n = Math.min(env.out.rms.length, env.in.rms.length);
          for (let i = 0; i < n; i++) {
            const t = s.at + i * hop;
            const a = db(level(plan, 'from', i));
            const b = db(level(plan, 'to', i));
            if (a > threshold) outAbove++;
            if (b > threshold) inAbove++;
            if (a > threshold && b > threshold) { both++; if (first == null) first = t - s.at; last = t - s.at; }
          }
          return { both: +(both * hop).toFixed(1), out: +(outAbove * hop).toFixed(1), in: +(inAbove * hop).toFixed(1), first: first == null ? null : +first.toFixed(1), last: last == null ? null : +last.toFixed(1) };
        };
        // What the curves have taken off the outgoing harmony as the cross bar
        // begins, in dB: the gain and the close together, at that hop — of the
        // whole, and of what is above a kilohertz, where the close works.
        const atCross = (plan, fromHz = 0) => {
          const t = s.swapAt - (hc ? hc.crossBars : 1) * bs;
          const i = Math.min(env.out.rms.length - 1, Math.max(0, Math.round((t - s.at) / hop)));
          return +db(seamGain(plan, 'from', t) * closeRatio(env.out.spectra[i], env.out.binHz, seamCorner(plan, 'from', t), fromHz)).toFixed(1);
        };
        const row = {
          seed, seam: s.from, keys: `${from.track.key.name} → ${to.track.key.name}`, shared, blend: s.bars, bar: s.bar, bpm: from.track.bpm,
          swapBars: +((s.swapAt - s.at) / bs).toFixed(1), blendSeconds: +(s.bars * bs).toFixed(1),
          variants: {},
        };
        for (const [name, curves] of Object.entries(variants)) {
          const plan = curves(moment);
          row.variants[name] = { atCrossDb: atCross(plan), atCrossAboveKiloDb: atCross(plan, 1000), atCrossAbove2kDb: atCross(plan, 2000) };
          for (const th of thresholds) row.variants[name][String(th)] = count(plan, th);
        }
        rows.push(row);
        const cell = (name, th) => { const c = row.variants[name][String(th)]; return `${c.both} s (out ${c.out}, in ${c.in})`; };
        say(`${seed.padStart(6)} seam ${s.from}: ${row.keys} (${shared}/7), blend ${s.bars} bars = ${row.blendSeconds} s, swap ${row.swapBars} bars in`);
        for (const th of thresholds) say(`        both > ${th} dB: ${Object.keys(variants).map((v) => `${v} ${cell(v, th)}`).join('; ')}`);
        say(`        the outgoing harmony at the cross bar: ${Object.keys(variants).map((v) => `${v} ${row.variants[v].atCrossDb} dB (above 1 kHz ${row.variants[v].atCrossAboveKiloDb}, above 2 kHz ${row.variants[v].atCrossAbove2kDb})`).join(', ')}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
  fs.writeFileSync(path.join(outDir, 'overlap.json'), `${JSON.stringify(rows, null, 2)}\n`);
  say(`\nwritten ${path.join(outDir, 'overlap.json')}`);
}

if (flag('keys')) keys();
else if (flag('measure')) await measure();
else say('say --keys or --measure');
