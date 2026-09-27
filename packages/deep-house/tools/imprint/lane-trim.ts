// lane-trim.ts — every candidate of a percussion lane, alone, on the record's
// own figure, measured against the lane's incumbent.
//
//   node packages/deep-house/tools/imprint/lane-trim.ts            measure, print
//   node packages/deep-house/tools/imprint/lane-trim.ts --bless    and write the style's trims
//   node packages/deep-house/tools/imprint/lane-trim.ts --read     re-read the wavs already in
//                                                                  tmp/lane-trim/ and render nothing
//   ... --site tmp/<somewhere>/site   a scratch build (never docs/)
//
// Round K5b opened the kitchen behind the record's own drums at a third of the
// mean weight, and round K6 let a lane draw one. What nobody measured was the
// **level** a kitchen drum arrives at on that lane: a `ride` declares
// `level: 'hatOpen'` and a `hatSizzle` `level: 'hatClosed'`, so each is trimmed
// to the room's number for the instrument it is standing in for, which was
// measured for that instrument and not for it. Eugene's ear said what that
// costs — "very metallic hi-hat", "hi-hats out of balance", "too pronounced",
// on six of thirteen cards (09-19) — and the outside review measured seed
// 21323's 4-12 kHz over 400 Hz-2 kHz up 7.7 dB under house-v2.
//
// So this renders each candidate of the four percussion lanes **alone on the
// lane** — the lane's layer soloed, the candidate forced onto the lane by the
// composer's tool hook (`opts.lanes`), the other lane of the same layer held at
// its incumbent, at a fixed reference window of the record — meters the
// integrated loudness and the high-over-mid band ratio, and writes each
// candidate's trim as the decibels that bring it to the incumbent's loudness
// on the same figure. The incumbent's own trim is nought by construction.
//
// Every number in the blessed file came off a render; nothing in it was
// reasoned. It is JSON beside the style for the reason the loudness fit is.
//
// **`--read` renders nothing.** The wavs of a blessed run are in `tmp/lane-trim/`
// under the names this tool gives them, and a second reading of the same samples
// is a second reading and not a second measurement: it re-meters every file,
// **asserts the loudness and the ratio it recovers are the ones in the blessed
// file** to a hundredth of a decibel, and only then adds what it has newly
// learned to read. Step 5b's woodblock reading came that way, so it cost no
// browser at all and the seventeen trims beside it did not move by a digit.
//
// The measurement is also **not idempotent under a render**, and that is worth
// saying out loud: the style reads this file, so a fresh `--bless` measures each
// candidate *with the trim the last one wrote already on it* and would walk every
// number to nought. A re-measurement is a measurement of an untrimmed tree; a
// re-reading is what `--read` is for.
//
// One headless Chromium, one render at a time, reniced, on port 7057 and
// never 6975.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { planTheme } from '../../src/mix.ts';
import { strategyById } from '../../src/strategies/index.ts';
import { BY_NAME } from '@deep-house/engine/voices';
import { integratedLoudness, thirdOctaves, THIRDS, samplePeak } from '@deep-house/engine/meter';
import { ROOT, serveSite, openPage, renderToWav } from './render.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes(`--${k}`);

const STRATEGY = arg('strategy', 'house-v2');
const PORT = +arg('port', 7057);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 8);
const SITE = arg('site', path.join('tmp', 'lane-trim', 'site'));
const LAB = path.join(ROOT, 'tmp', 'lane-trim');
const OUT = path.join(ROOT, 'packages', 'deep-house', 'src', 'styles', `deep-house-v2-lane-trims.json`);
const PREROLL = 2;
const TAIL = 1.5;

/**
 * The reference windows: the growl reference (master 21323, theme 1, bars
 * 68+8 — the card he called metallic) and the sub reference (master 1, theme
 * 1, bars 76+8). The closed offbeat lane and the backbeat are measured on
 * both and the two differences averaged. The open lane fires by chance and
 * fired once in eight bars of the sub reference and never in the growl one,
 * so it is measured over twenty-four bars of the two sub references (master
 * 92970's busy theme beside master 1's); the sixteenth lane sounds only in
 * the sub room (the growl room's shaker level is -60 dB) and is measured over
 * the sub reference and the busiest sixteenth theme K6 rendered (master
 * 15819). A window with no hit of the lane in it is left out of the mean.
 */
const WINDOWS = {
  offbeat: [{ id: 'growl', seed: '21323', theme: 1, from: 68, bars: 8 }, { id: 'sub', seed: '1', theme: 1, from: 76, bars: 8 }],
  backbeat: [{ id: 'growl', seed: '21323', theme: 1, from: 68, bars: 8 }, { id: 'sub', seed: '1', theme: 1, from: 76, bars: 8 }],
  offbeatOpen: [{ id: 'sub24', seed: '1', theme: 1, from: 76, bars: 24 }, { id: 'busy24', seed: '92970', theme: 1, from: 42, bars: 24 }],
  sixteenth: [{ id: 'sub', seed: '1', theme: 1, from: 76, bars: 8 }, { id: 'sixteenths', seed: '15819', theme: 1, from: 58, bars: 8 }],
};

const style = strategyById(STRATEGY).style;
/** The lanes to measure: those with a candidate list of more than one, by layer. */
const LANES = style.lanes.filter((l) => l.voices && l.voices.length > 1 && l.gate);
const layerOf = (voice) => BY_NAME[voice].layer;
const incumbentOf = (lane) => lane.incumbent ?? lane.voices[0].v;
/**
 * The two hat lanes share one layer, and a solo of that layer would meter the
 * candidate on one lane with the incumbent of the other underneath it. So the
 * **other** lane of the same layer is muted for the measurement — not by a
 * switch the composer has not got, but by putting a registered voice of
 * another layer on it, which the layer solo then leaves out. It is a lab
 * stand-in and nothing anybody hears; the rimshot is cheap and on the clap's
 * layer.
 */
const MUTE_STAND_IN = 'rimshot';

function readWav(file) {
  const b = fs.readFileSync(file);
  const n = (b.length - 44) / 4;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    L[i] = b.readInt16LE(44 + i * 4) / 32768;
    R[i] = b.readInt16LE(46 + i * 4) / 32768;
  }
  return [L, R];
}

/** 4-12.5 kHz over 400 Hz-2 kHz, off the meter's own third-octave bands, in dB. */
function highToMid(bands) {
  const sum = (lo, hi) => THIRDS.reduce((s, f, i) => (f >= lo && f <= hi ? s + Math.pow(10, bands[i] / 10) : s), 0);
  return 10 * Math.log10(Math.max(1e-30, sum(4000, 12500)) / Math.max(1e-30, sum(400, 2000)));
}

/**
 * **Where a candidate's energy actually is, and how sharp it arrives** — the
 * second reading, added 09-20 for the woodblock (step 5b).
 *
 * `highToMid` above is a ratio of two bands and it answers the question the
 * hats asked: *is this brighter than the incumbent*. It cannot answer the one
 * Eugene asked of the sixteenth lane on three sessions — "a faint repetitive
 * click like knocking an empty plastic box ... it reads as a clip (bug) rather
 * than a feature" — because a click is not a ratio of two bands, it is energy
 * **piled into one** of them and arriving all at once. So:
 *
 *   `peakHz`   the loudest third-octave band's centre
 *   `share`    what fraction of the whole sits in that one band, per cent — a
 *              broadband rattle spreads over a dozen of them and a tuned
 *              resonator does not
 *   `mid`/`high`/`low`  the per cent in 400 Hz-2 kHz, 4-12.5 kHz and under
 *              400 Hz, so the three add up to most of a voice and say in words
 *              what the ratio says in decibels
 *   `crestDb`  sample peak over integrated loudness: how much of the voice is
 *              the attack. It is measured through the master the way everything
 *              else here is, so a voice whose peak the limiter is already
 *              holding reads **lower** than it is, and the number is therefore a
 *              floor and never an overstatement.
 *
 * Nothing here is fitted and nothing is weighted: it is the same third-octave
 * bands `highToMid` reads, counted instead of divided.
 */
function shapeOf(bands, lufs, peakDb) {
  // A window the lane never fired in has no shape, and a ratio of two noughts
  // is not a reading of one: it is left out, exactly as the mean leaves it out.
  if (!Number.isFinite(lufs)) return null;
  const power = bands.map((d) => Math.pow(10, d / 10));
  const total = power.reduce((a, b) => a + b, 0);
  const band = (lo, hi) => THIRDS.reduce((s, f, i) => (f >= lo && f <= hi ? s + power[i] : s), 0);
  let top = 0;
  for (let i = 0; i < power.length; i += 1) if (power[i] > power[top]) top = i;
  const pct = (x) => +((100 * x) / Math.max(1e-30, total)).toFixed(1);
  return {
    peakHz: THIRDS[top],
    share: pct(power[top]),
    mid: pct(band(400, 2000)),
    high: pct(band(4000, 12500)),
    low: pct(band(31.5, 315)),
    crestDb: Number.isFinite(lufs) ? +(peakDb - lufs).toFixed(2) : null,
  };
}

/**
 * `--read`: no browser, no server, no build. The blessed file beside the style
 * is the record of the render, and the wavs it was written off are in the lab.
 */
const READ = has('read');
const PREVIOUS = READ ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;

const site = path.isAbsolute(SITE) ? SITE : path.join(ROOT, SITE);
if (!READ && (!fs.existsSync(path.join(site, 'index.html')) || has('build'))) {
  console.error(`  building a scratch site into ${path.relative(ROOT, site)}`);
  execFileSync('npx', ['vite', 'build', '--outDir', site, '--logLevel', 'error'],
    { cwd: path.join(ROOT, 'packages', 'deep-house'), stdio: 'inherit' });
}
fs.mkdirSync(LAB, { recursive: true });
const server = READ ? { close: () => {} } : await serveSite(PORT, site);
const page = READ ? { page: null, label: 'no browser (--read)', close: async () => {} } : await openPage(PORT);
console.error(`  ${page.label}; ${STRATEGY}; ${LANES.length} lanes`);

/**
 * One window of one candidate, metered. In `--read` the samples are the ones
 * the blessed run left in the lab and the two fields a render reports and a
 * file cannot — how many events were in the slice, and the bpm cross-check —
 * come from the blessed file; everything else is read off the samples, and the
 * two it shares with the blessed file are **asserted equal to it**, which is
 * what makes a reading a reading of the same measurement.
 */
async function meterOne(lane, v, w, others) {
  const file = path.join(LAB, `${lane.id}-${v}-${w.id}.wav`);
  let events;
  if (READ) {
    const was = ((PREVIOUS.lanes[lane.id] || {}).measured || {})[v];
    if (!was || !was[w.id]) throw new Error(`${lane.id}/${v}/${w.id}: nothing in the blessed file to read back against`);
    events = was[w.id].events;
    if (!fs.existsSync(file)) {
      if (events > 0) throw new Error(`${lane.id}/${v}/${w.id}: ${path.relative(ROOT, file)} is not in the lab; render it or drop --read`);
      return { ...was[w.id], shape: null };
    }
  } else {
    const track = planTheme(w.seed, w.theme, { strategy: STRATEGY, lanes: { ...others, [lane.id]: v } });
    const r = await renderToWav(page.page, {
      masterSeed: w.seed, theme: w.theme, opts: { strategy: STRATEGY, lanes: { ...others, [lane.id]: v } },
      preFromBar: Math.max(0, w.from - PREROLL), fromBar: w.from, toBar: w.from + (w.bars || BARS), tail: TAIL, layers: [layer0(lane)],
    }, file, RATE);
    if (Math.abs(r.bpm - track.bpm) > 0.01) throw new Error(`${lane.id}/${v}: the page planned ${r.bpm} BPM where node planned ${track.bpm}`);
    events = r.events;
  }
  const [L, R] = readWav(file);
  const lufs = +integratedLoudness([L, R], RATE).toFixed(2);
  const bands = thirdOctaves(L, R, RATE);
  const h2m = +highToMid(bands).toFixed(2);
  // The peak is the **render's** own, off the float buffer before it was written
  // as sixteen-bit; re-reading it out of the wav is a hundredth of a decibel
  // away on three of forty-two windows, which is the quantiser and not the
  // sound. A reading does not overwrite what only a render can say.
  const peakDb = READ
    ? PREVIOUS.lanes[lane.id].measured[v][w.id].peakDb
    : +(20 * Math.log10(samplePeak([L, R]) + 1e-30)).toFixed(2);
  if (READ) {
    const was = PREVIOUS.lanes[lane.id].measured[v][w.id];
    for (const [k, now] of [['lufs', lufs], ['highToMidDb', h2m]]) {
      if (Number.isFinite(was[k]) !== Number.isFinite(now) || (Number.isFinite(now) && Math.abs(was[k] - now) > 0.01))
        throw new Error(`${lane.id}/${v}/${w.id}: re-reading gives ${k} ${now} where the blessed file says ${was[k]}`);
    }
  }
  return { lufs, highToMidDb: h2m, events, peakDb, shape: shapeOf(bands, lufs, peakDb) };
}

const layer0 = (lane) => layerOf(incumbentOf(lane));

const lanes = {};
try {
  for (const lane of LANES) {
    const layer = layerOf(incumbentOf(lane));
    const others = Object.fromEntries(LANES.filter((l) => l !== lane && layerOf(incumbentOf(l)) === layer).map((l) => [l.id, MUTE_STAND_IN]));
    if (Object.keys(others).length && layerOf(MUTE_STAND_IN) === layer) throw new Error(`the mute stand-in is on the ${layer} layer`);
    const candidates = lane.voices.filter((e) => e.v === incumbentOf(lane) || e.opened !== undefined).map((e) => e.v);
    const windows = WINDOWS[lane.id];
    if (!windows) throw new Error(`no reference window for the ${lane.id} lane`);
    const measured = {};
    const shape = {};
    for (const v of candidates) {
      measured[v] = {};
      shape[v] = {};
      for (const w of windows) {
        const { shape: sh, ...m } = await meterOne(lane, v, w, others);
        measured[v][w.id] = m;
        if (sh) shape[v][w.id] = sh;
        console.error(`  ${lane.id.padEnd(12)} ${v.padEnd(11)} ${w.id.padEnd(6)} ${String(m.events).padStart(4)} ev  ${String(m.lufs).padStart(7)} LUFS  high/mid ${String(m.highToMidDb).padStart(6)} dB${sh ? `  loudest ${String(sh.peakHz).padStart(5)} Hz at ${String(sh.share).padStart(4)} %  mid ${String(sh.mid).padStart(5)} %  high ${String(sh.high).padStart(5)} %  crest ${String(sh.crestDb).padStart(6)} dB` : ''}`);
      }
    }
    const inc = incumbentOf(lane);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const trims = {};
    const relative = {};
    const heard = windows.filter((w) => measured[inc][w.id].events > 0 && Number.isFinite(measured[inc][w.id].lufs));
    if (!heard.length) throw new Error(`${lane.id}: the incumbent ${inc} fired in none of its windows`);
    for (const v of candidates) {
      const ws = heard.filter((w) => measured[v][w.id].events > 0 && Number.isFinite(measured[v][w.id].lufs));
      if (!ws.length) { relative[v] = null; continue; }
      const d = ws.map((w) => measured[inc][w.id].lufs - measured[v][w.id].lufs);
      const h = ws.map((w) => measured[v][w.id].highToMidDb - measured[inc][w.id].highToMidDb);
      relative[v] = { lufsDb: +mean(d).toFixed(1), highToMidDb: +mean(h).toFixed(1), windows: ws.map((w) => w.id) };
      if (v !== inc) trims[v] = +mean(d).toFixed(1);
    }
    lanes[lane.id] = { layer, incumbent: inc, windows: windows.map((w) => `${w.id}: ${w.seed}#${w.theme} bar ${w.from}+${w.bars || BARS}`), measured, shape, relative, trims };
  }
} finally {
  await page.close();
  server.close();
}

const TODAY = new Date().toISOString().slice(0, 10);
const out = {
  note: 'Written by tools/imprint/lane-trim.ts --bless. Every number here came off a render of one candidate alone on its lane — the lane\'s layer soloed, the other lane of that layer muted — on the record\'s own figure, against the lane\'s incumbent on the same window; nothing in it was reasoned. `trims` is the decibels that bring a candidate to the incumbent\'s integrated loudness, and the incumbent\'s own is nought by construction. `shape` is the second reading, taken off the same samples by --read: which third-octave band is the loudest, what share of the whole sits in it, the per cent in 400 Hz-2 kHz, 4-12.5 kHz and under 400 Hz, and the sample peak over the integrated loudness.',
  measuredAt: READ ? PREVIOUS.measuredAt : TODAY,
  ...(READ ? { readAt: TODAY } : {}),
  strategy: STRATEGY,
  sampleRate: RATE,
  lanes,
};

// **A reading is a reading of the same measurement.** Every window was already
// held to the blessed file a hundredth of a decibel at a time; this holds the
// seventeen numbers the style actually reads, which are the mean of those, and
// it is the line that says the file's trims did not move when its shape arrived.
if (READ) {
  const moved = [];
  for (const [id, lane] of Object.entries(lanes)) {
    const was = PREVIOUS.lanes[id].trims || {};
    const keys = new Set([...Object.keys(was), ...Object.keys(lane.trims)]);
    for (const k of keys) if (was[k] !== lane.trims[k]) moved.push(`${id}/${k}: ${was[k]} -> ${lane.trims[k]}`);
  }
  if (moved.length) throw new Error(`a re-reading moved a trim: ${moved.join('; ')}`);
  console.error(`  read back: ${Object.values(lanes).reduce((n, l) => n + Object.keys(l.trims).length, 0)} trims on ${Object.keys(lanes).length} lanes, every one at the blessed file's own number`);
}

console.log(JSON.stringify(out, null, 1));
if (has('bless')) {
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.error(`  -> ${path.relative(ROOT, OUT)}`);
}
