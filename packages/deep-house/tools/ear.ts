// ear.ts — eight birds, one at a time, for a listener.
//
//   node tools/ear.ts            writes tmp/ear/pull-*.wav and tmp/ear/recipe-*.wav
//   node tools/ear.ts --bars 16  longer
//   node tools/ear.ts --derive --strategy house-v2 --bars 16 --site tmp/derive/site
//                                writes tmp/ear/derive/*.wav and diffs each
//                                against house.wav
//   node tools/ear.ts --knobs --strategy house-v2 --bars 16 --site tmp/knobs/site
//                                PLAN-MODULATION M1's own gate: the same six
//                                spells with **the cast pinned**, so what moves
//                                is the seasoning and not the draw — six files,
//                                six harmonic-solo renders beside them, and the
//                                tails, the corners and the attacks read back
//                                out of the samples
//   node tools/ear.ts --recipes --strategy house-v2 --bars 16 --when after
//        --site tmp/step6/site-after --before tmp/ear/recipes
//                                step 6's own set: the two lead-entry seeds,
//                                the three melody families against no theme at
//                                all, and two rows rolled to the same spell with
//                                and without their `wants`. The mids of every
//                                file in both the bands the two documents
//                                measure them in, and the lead-entry pair read
//                                against a `--when before` pass rendered from a
//                                build with that switch off
//
// Phase 1 of PLAN-MAGIC-V2 says the birds bias the rolls from a measurement.
// Every claim in `notes/archive/2026-09-kitchen/rounds/phase-1.md` is a number, and none of them is
// whether the thing sounds like what the bird is called. That is Eugene's, and
// it needs one file per bird with everything else held still.
//
// So: **one seed, one theme, one bird moved**. Seed 1 theme 1, eight bars of
// its own main groove, at the house and then with each bird pulled to 0.85 —
// the same window rule every time, the same render path, the same level. The
// nine files differ by exactly one number in the spell, which is the only way
// a listener can say what a bird did rather than what a seed did.
//
// And two rolls of `house/sub-room`, which is the other half of the phase: a
// recipe is a box and two rolls of it are cousins, so the question those two
// ask is whether they are recognisably the same dish.
//
// Rendered offline through the real graph in headless Chromium against the
// built site, one at a time, reniced, on the silent route, on port 7031 and
// never 6975. Nothing here plays and nothing here is in git.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { planTheme, STYLE } from '../src/mix.ts';
import { strategyById } from '../src/strategies/index.ts';
import { derive, asSpell as asFullSpell } from '../src/spell.ts';
import { loudnessWindow } from '../src/loudness.ts';
import { laneVoices } from '../src/lanes.ts';
import { biasFor } from '../src/spell.ts';
import { themeSeed } from '../src/set-plan.ts';
import { thirdOctaves, THIRDS } from '@deep-house/engine/meter';
import { BIRDS, HOUSE, asSpell } from '../src/spell.ts';
import { spellFrom } from '../src/recipe.ts';
import { recipeById } from '../src/recipes.ts';
import { HOUSE_FAMILIES } from '../src/motif.ts';
import Rng from '../src/rng.ts';
import { ROOT, serveSite, openPage, renderToWav } from './imprint/render.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);

// --- derive-lite's own set ---------------------------------------------------
//
// Step 2 of `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md`. The eight-bird set above asks
// *what does this bird do*; this one asks the narrower question the derive-lite
// round is gated on — **is a pull audible at all** — and it asks it of the six
// spells the day plan names, under the strategy that reads the derived state.
//
// The window rule is the same window rule and the render path is the same
// render path. What is different is that the six files are **not the same
// length**: a derived tempo family is a different BPM, so sixteen bars of the
// main groove is a different number of seconds, and the diff below says so
// rather than pretending the files line up. That is the honest shape of the
// answer to "not 1 LSB apart".
const DERIVE_SET = [
  ['house', {}],
  ['ember-low', { ember: 0.10 }],
  ['ember-high', { ember: 0.85 }],
  ['spark-high', { spark: 0.80 }],
  ['dnb', { ember: 0.90, spark: 0.85 }],
  ['tide-high', { tide: 0.85 }],
];

// --- modulation M1's own set ---------------------------------------------------
//
// Step 3 of `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md`, and it asks a sharper question
// than step 2's. Derive-lite's `tide-high` was 31782 LSB from the house over
// 99.98 % of its samples, and none of that was the seasoning: house-v2's widened
// lists redraw **which** instrument plays when Tide is pulled, so the file
// differed because a marimba had replaced an electric piano. Eugene's own label
// of it (09-19 14:10) is the round's target — *the track's structure changes a
// little, but the character of the change is not audible.*
//
// So this set **pins the cast**. The lane draws and the three harmonic timbres
// are the house's own, handed to every pull through the tool hooks that reach no
// playing path, and the gate below asserts the six plans name the same voices.
// What is left between two files is the knobs, and that is what the numbers read.

// --- step 6's own set: the theme, the wants, and the lead's entry -------------
//
// `notes/archive/2026-09-v2-day-chain/plans/PLAN-DAY-2026-09-19.md` step 6, and it asks three questions that
// are three different kinds of claim, so it is three groups of files and not
// one list.
//
//   **the lead's entry** — the same two seeds under the same build with the
//   rule and without it. It is the only pair here that needs *two sites*: a
//   switch on a style is not a URL, so the *before* is a build of this tree
//   with `leadEntry` turned off (`--before <dir>`), and the mids are read off
//   both.
//   **the theme** — one seed, the cast and the seed held still, with no theme
//   and then with each of the three authored families pinned through the
//   `motif` hook, which reaches no playing path. What moves between the four
//   is which shape the track has and nothing else.
//   **the wants** — one seed, one row, rolled to **the same spell** twice: once
//   with the row's `wants` and `forbids` interpreted and once with the box
//   alone. That is the one pair that isolates this round's first commit, because
//   a row's box was already read before it and its wants were not.
const MOTIF_SET = [
  ['motif-none', { off: true }, 'no theme at all — the track as it was'],
  ...HOUSE_FAMILIES.map((f) => [`motif-${f.id.split('/').pop()}`, { family: f.id }, `${f.name}, in the ${f.register}`]),
];

/** The two rows that carry `wants`, which are the two rooms. */
const WANTS_SET = ['house/growl-room', 'house/sub-room'];

const KNOB_SET = [
  ['house', {}, 'nothing asked for'],
  ['tide-high', { tide: 0.85 }, 'the same instruments, holding longer'],
  ['tide-low', { tide: 0.15 }, 'the same instruments, let go sooner'],
  ['zephyr-high', { zephyr: 0.85 }, 'the same instruments, with the lids open'],
  ['zephyr-low', { zephyr: 0.15 }, 'the same instruments, with the lids down'],
  ['ember-high', { ember: 0.85 }, 'the same instruments, struck harder and faster'],
];

/** Which layers the harmonic reading is taken off. The bus the corner moves in. */
const HARMONIC_LAYERS = ['keys', 'pad'];

/**
 * The house's own cast, as the two hooks take it: which voice each lane drew and
 * which three timbres the harmonic dice rolled. `laneVoices` is the draw itself
 * rather than a reading of the events, so what is pinned is exactly what would
 * have been rolled with nothing asked for.
 */
function houseCast() {
  const style = strategyById(STRATEGY).style;
  const house = planTheme(MASTER, THEME, { ...(STRATEGY ? { strategy: STRATEGY } : {}) });
  return {
    // A lane the theme's scene withdraws is held off in the plan itself, so the
    // voice pinned to it here plays nothing either way.
    lanes: laneVoices(style, themeSeed(MASTER, THEME), biasFor(HOUSE, style)),
    timbres: {
      leadTimbre: house.dice.leadTimbre,
      padTimbre: house.dice.padTimbre,
      stabTimbre: house.dice.stabTimbre,
    },
  };
}

/** The samples of a 16-bit stereo wav, as a flat Int16Array. */
function samplesOf(file) {
  const buf = fs.readFileSync(file);
  return new Int16Array(buf.buffer, buf.byteOffset + 44, (buf.length - 44) >> 1);
}

/**
 * Two renders, compared the way `notes/analysis/imprint-calibration.md` §5
 * compares two: the largest sixteen-bit step between them, how many samples
 * differ at all, and the RMS of the difference in decibels. Over the length the
 * two share, with the length each really is reported beside it — a file that is
 * eighty seconds where the other is thirty-seven is not a file with a small
 * difference in it.
 */
function diffOf(a, b) {
  const x = samplesOf(a);
  const y = samplesOf(b);
  const n = Math.min(x.length, y.length);
  let max = 0;
  let changed = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - y[i];
    if (d !== 0) { changed++; if (Math.abs(d) > max) max = Math.abs(d); }
    sum += d * d;
  }
  const rms = Math.sqrt(sum / Math.max(1, n)) / 32768;
  return { max, changed, pct: (100 * changed) / Math.max(1, n), rmsDb: 20 * Math.log10(rms + 1e-30), n, aLen: x.length, bLen: y.length };
}

// --- what a file says about its own instruments ------------------------------
//
// Three readings, all of them off the **harmonic solo** beside each file — the
// keys and the pad alone through the same graph — because that is the bus the
// three knobs of this round move and a full mix with a kick in it reads the
// kick. The onsets come out of the plan, in node, so nothing here is guessing
// where a note is.

/** A wav's two channels as floats in -1..1. */
function floatsOf(file) {
  const x = samplesOf(file);
  const n = x.length >> 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = x[2 * i] / 32768; R[i] = x[2 * i + 1] / 32768; }
  return { L, R, n };
}

/**
 * A short-window RMS envelope of the mono sum, one value every `hop` seconds.
 * Twelve milliseconds of window is long enough not to read the waveform and
 * short enough that a two-millisecond attack is still several points.
 */
function envelopeOf({ L, R, n }, rate, hop = 0.002, win = 0.012) {
  const h = Math.max(1, Math.round(hop * rate));
  const w = Math.max(2, Math.round(win * rate));
  const out = new Float64Array(Math.max(0, Math.floor((n - w) / h) + 1));
  for (let k = 0; k < out.length; k++) {
    let sum = 0;
    const a = k * h;
    for (let i = a; i < a + w; i++) { const m = 0.5 * (L[i] + R[i]); sum += m * m; }
    out[k] = Math.sqrt(sum / w);
  }
  return { env: out, hop: h / rate };
}

/**
 * **How long the instruments hold and how fast they speak**, off the harmonic
 * solo, in milliseconds, with the onsets taken out of the plan in node so
 * nothing here is guessing where a note is.
 *
 *   hold    per gap between one harmonic onset and the next, the time from the
 *           onset to twenty decibels under the peak it reached, capped at
 *           whatever room the next onset leaves. A note still up when the next
 *           one lands is counted at the room's own length, because throwing it
 *           away would throw away exactly the longest tails.
 *   trough  how far under that peak the bus has fallen by the moment the next
 *           onset arrives. The same claim without a clock on it, and the one
 *           that is level-independent: a shallower trough is an instrument
 *           still sounding.
 *   attack  from the onset to nine tenths of the peak of the quarter second
 *           after it.
 *
 * Three things make this readable on music where a per-note reading is not.
 * The onsets are **deduplicated**, because a chord is six events at one instant
 * and not six notes to read; the room is the next onset of **any** harmonic
 * layer, because what fills a gap is any harmonic note; and the threshold is
 * referenced to the note's **own peak** rather than to the level at its
 * note-off, which on this material is the next note. Gaps under eighty
 * milliseconds are not gaps and are left out: seed 1 theme 1 is an electric
 * piano playing eighths under a swell pad, and of its 143 harmonic onsets 22
 * have room enough behind them to read a decay in.
 */
function readingsOf(file, track, from, seconds, rate) {
  const { env, hop } = envelopeOf(floatsOf(file), rate);
  const at = (t) => env[Math.max(0, Math.min(env.length - 1, Math.round(t / hop)))] || 0;
  // **Only the onsets inside the window.** A theme is four minutes and the file
  // is sixteen bars of it, so an onset past the end reads the last sample of the
  // file over and over — a flat envelope, which is a note that never decays and
  // a trough of exactly nothing. The window's last onset is the last one there
  // is anything to read.
  const onsets = [...new Set(track.events
    .filter((e) => HARMONIC_LAYERS.includes(e.layer) && e.t >= from && e.t < from + seconds)
    .map((e) => +(e.t - from).toFixed(4)))].sort((a, b) => a - b);
  const holds = [];
  const troughs = [];
  const attacks = [];
  let stillUp = 0;
  for (let i = 0; i < onsets.length - 1; i++) {
    const t0 = onsets[i];
    const room = Math.min(2, onsets[i + 1] - t0, seconds - t0);
    if (t0 < 0 || room < 0.08) continue;
    let peak = 0;
    for (let t = t0; t < t0 + Math.min(0.25, room); t += hop) peak = Math.max(peak, at(t));
    if (!(peak > 1e-4)) continue;
    for (let t = t0; t < t0 + Math.min(0.25, room); t += hop) {
      if (at(t) >= 0.9 * peak) { attacks.push((t - t0) * 1000); break; }
    }
    const floor = peak * 0.1;
    let fell = null;
    for (let t = t0; t < t0 + room; t += hop) if (at(t) <= floor) { fell = (t - t0) * 1000; break; }
    if (fell == null) stillUp++;
    holds.push(fell == null ? room * 1000 : fell);
    troughs.push(20 * Math.log10((at(t0 + room - hop) + 1e-12) / (peak + 1e-12)));
  }
  const median = (xs) => (xs.length ? xs.slice().sort((a, b) => a - b)[xs.length >> 1] : NaN);
  return { holdMs: median(holds), troughDb: median(troughs), attackMs: median(attacks), gaps: holds.length, stillUp };
}

/**
 * The spectral centroid of a file, off the third-octave bands the meter makes —
 * over the window alone, and never the decay handed back past it, so six files
 * are compared over the same sixteen bars of music.
 */
function centroidOf(file, rate, seconds) {
  const { L, R } = floatsOf(file);
  const n = seconds ? Math.min(L.length, Math.round(seconds * rate)) : L.length;
  const bands = thirdOctaves(L.subarray(0, n), R.subarray(0, n), rate);
  let num = 0;
  let den = 0;
  for (let i = 0; i < THIRDS.length; i++) {
    const power = Math.pow(10, bands[i] / 10);
    num += THIRDS[i] * power;
    den += power;
  }
  return den > 0 ? Math.round(num / den) : 0;
}

/**
 * **What share of the whole a band holds, in decibels.** The music review's own
 * instrument (the music adequacy review of 09-19, §2): a band's power over the
 * power of 20 Hz-20 kHz, off the third-octave bands the meter makes, over the
 * window alone. Its *mids* is 300 Hz-2 kHz and `TODO.md`'s is 500 Hz-2 kHz, so
 * both are read and both are printed — a number is only comparable with the
 * number it was measured beside.
 */
function bandShareDb(file, rate, seconds, lo, hi) {
  const { L, R } = floatsOf(file);
  const n = seconds ? Math.min(L.length, Math.round(seconds * rate)) : L.length;
  const bands = thirdOctaves(L.subarray(0, n), R.subarray(0, n), rate);
  let inside = 0;
  let all = 0;
  for (let i = 0; i < THIRDS.length; i++) {
    const p = Math.pow(10, bands[i] / 10);
    all += p;
    if (THIRDS[i] >= lo && THIRDS[i] <= hi) inside += p;
  }
  return all > 0 ? 10 * Math.log10(inside / all) : -Infinity;
}

const OUT = path.join(ROOT, 'tmp', 'ear', flag('derive') ? 'derive' : flag('knobs') ? 'knobs' : flag('recipes') ? 'recipes' : '');

const PORT = +arg('port', 7031);
const SITE = arg('site', 'docs');
const STRATEGY = arg('strategy', null);
// Asked for by id, so a bad one says so here rather than rendering the record
// under a name it is not (the rule K5b's `renderMix` bug wrote down).
if (STRATEGY) strategyById(STRATEGY);
const RATE = +arg('rate', 48000);
const BARS = +arg('bars', 8);
const PREROLL_BARS = 2;
const TAIL_SECONDS = 1.5;
const MASTER = arg('seed', '1');
const THEME = +arg('theme', 1);
const PULL = +arg('pull', 0.85);

/**
 * One file: a name, the spell behind it, and the window of its own groove.
 *
 * `pin` is the tool's hand on the draws — the lanes and the three harmonic
 * timbres — and it is nothing on every path but `--knobs`. See below.
 */
function job(name, masterSeed, theme, spell, pin = null, fromBar = null) {
  const track = planTheme(masterSeed, theme, { spell, ...(STRATEGY ? { strategy: STRATEGY } : {}), ...(pin || {}) });
  // The window is the theme's own loudest sixteen bars, unless the caller names
  // one. It names one exactly once: the lead-entry pair, whose whole question
  // is about the **quiet** stretch, and whose window the loudest bars would
  // therefore never contain.
  const w = fromBar == null ? loudnessWindow(track, BARS) : { from: fromBar, bars: Math.max(BARS, track.bars - fromBar) };
  return {
    name, masterSeed, theme, spell,
    // Which of these are the same piece of music. It is the **plan's** hash and
    // not the file's: two renders of one window differ by a sixteen-bit step on
    // a fraction of their samples (`analysis/imprint-calibration.md` section 5),
    // so a hash of the audio says everything is different and answers nothing.
    // Seven of the eight birds move no die in this build, and a listener told to
    // compare nine wavs would be comparing seven copies of one of them.
    plan: crypto.createHash('sha256')
      .update(JSON.stringify({ ...track, style: track.style.id })).digest('hex').slice(0, 12),
    opts: { spell, ...(STRATEGY ? { strategy: STRATEGY } : {}), ...(pin || {}) },
    preFromBar: Math.max(0, w.from - PREROLL_BARS), fromBar: w.from, toBar: w.from + Math.min(BARS, w.bars),
    tail: TAIL_SECONDS,
    say: `${track.preset} ${track.density} ${track.key.name} ${track.bpm} BPM bar ${w.from}`,
  };
}

// The cast, worked out once with nothing asked for, and handed to every pull of
// the knob set. `null` everywhere else, which is every other mode of this tool.
const PIN = flag('knobs') ? houseCast() : null;

// Step 6's three groups. The two seeds are rendered twice — once against this
// build and once against the build with the lead-entry rule off — and the tool
// is run twice for that, with `--site` naming which. Everything else is one
// site and one pass.
/**
 * **The two themes the lead-entry pair is rendered on**, and why they are not
 * seed 1 theme 1: that theme plays both harmonic layers through its whole
 * groove, so the rule moves nothing in it at all and a card of it would be two
 * identical files. `notes/archive/2026-09-plans/cited/PLAN-DEVELOP.md` §1 names 25417 as the theme with no lead to
 * put in front for forty bars; theme 4 of it is where that is true under
 * house-v2's own dice, and seed 1 theme 3 is the record's own seed doing the
 * same thing. Both are stated rather than searched for at run time.
 */
const SEEDS = [[arg('seed1', '1'), +arg('theme1', '3')], [arg('seed2', '25417'), +arg('theme2', '4')]];
const WHEN = arg('when', 'after');
/**
 * **The first sixteen bars the lead-entry rule moves.** The loudest sixteen
 * bars of a theme are by construction a full groove with the figure already
 * playing, so a window chosen that way can never show this rule doing
 * anything: what it changes is the *quiet* stretch. So the window is chosen by
 * the change itself — the first bar at which the plan with the rule has the
 * figure lane on and the plan without it does not — and both passes are
 * rendered over the same bars, because the choice is made in node off the
 * working tree and not off whichever site is being served.
 */
function entryWindow(master, theme) {
  const st = strategyById(STRATEGY || 'house-v1');
  const off = { ...st.style, switches: { ...(st.style.switches || {}), leadEntry: false } };
  const a = planTheme(master, theme, { style: off, ...(STRATEGY ? { strategy: STRATEGY } : {}) });
  const b = planTheme(master, theme, { ...(STRATEGY ? { strategy: STRATEGY } : {}) });
  for (let bar = 0; bar + BARS <= b.bars; bar++) {
    const before = a.timeline[bar];
    const after = b.timeline[bar];
    if (before && after && !before.layers.includes('keys') && after.layers.includes('keys')) {
      // Back up to the bar the run began at, so the card opens on the pad alone
      // and the figure arrives inside the window rather than on its first beat.
      return Math.max(0, bar - 4);
    }
  }
  return null;
}

const recipeJobs = () => {
  const out = SEEDS.map(([m, n]) => {
    const from = entryWindow(m, n);
    return {
      ...job(`seed${m}-${WHEN}`, m, n, null, null, from),
      note: `master ${m} theme ${n}, the lead-entry rule ${WHEN === 'after' ? 'on' : 'off'}${from == null ? ' (its own loudest sixteen; the rule moves nothing in this theme)' : `, from bar ${from} — the bars the rule moves`}`,
    };
  });
  if (WHEN !== 'after') return out;
  for (const [name, pin, why] of MOTIF_SET) out.push({ ...job(name, MASTER, THEME, null, { motif: pin }), note: why });
  for (const id of WANTS_SET) {
    const row = recipeById(id);
    // **The same spell twice.** `spellFor` rolls a box off `<master>::spell`,
    // so the spell is taken once and handed to both takes: what differs
    // between the pair is the row's `wants` and `forbids` and nothing else.
    const spell = spellFrom(row, new Rng(`${MASTER}::spell`));
    const short = id.split('/').pop();
    out.push({ ...job(`wants-${short}-box`, MASTER, THEME, spell, { recipe: { ...row, wants: {}, forbids: [] } }), note: `${row.name}, the box alone` });
    out.push({ ...job(`wants-${short}-on`, MASTER, THEME, spell, { recipe: row }), note: `${row.name}, the box and its wants` });
  }
  return out;
};

const jobs = flag('knobs')
  ? KNOB_SET.map(([name, pull]) => job(name, MASTER, THEME, asSpell({ ...HOUSE, ...pull }), PIN))
  : flag('recipes')
    ? recipeJobs()
  : flag('derive')
    ? DERIVE_SET.map(([name, pull]) => job(name, MASTER, THEME, asSpell({ ...HOUSE, ...pull })))
    : [job('pull-house', MASTER, THEME, asSpell(HOUSE))];
if (!flag('derive') && !flag('knobs') && !flag('recipes')) {
  for (const b of BIRDS) jobs.push(job(`pull-${b}`, MASTER, THEME, { ...HOUSE, [b]: PULL }));
  // And the other wall, for the birds the measurement found actually drive a
  // list. A bird pulled up may leave a theme where it already was — seed 1 theme
  // 1 is a sub room at the house and Spark pulled up asks for the sub room — so
  // the pair that is worth an ear is the one that crosses.
  for (const b of (STYLE.signatures?.lists?.rooms?.drives ?? []))
    jobs.push(job(`pull-${b}-low`, MASTER, THEME, { ...HOUSE, [b]: 1 - PULL }));
  // The recipe's own two: the spell a `?recipe=house/sub-room` would roll on
  // master seeds 1 and 2, which is the draw `spellFor` makes and not a new one.
  const SUB = recipeById('house/sub-room');
  for (const master of ['1', '2'])
    jobs.push(job(`recipe-sub-room-${master}`, master, THEME, spellFrom(SUB, new Rng(`${master}::spell`))));
}

fs.mkdirSync(OUT, { recursive: true });
// `--read` reads back files that are already there and renders nothing, so a
// reading can be re-taken without asking a browser for thirty-seven seconds of
// audio six times over. It is a tool's convenience and nothing depends on it.
const READ_ONLY = flag('read');
if (!READ_ONLY) {
const server = await serveSite(PORT, SITE);
const browser = await openPage(PORT);
console.log(`  ${browser.label}; seed ${MASTER} theme ${THEME}, ${BARS} bars, ${flag('recipes') ? `step 6's set (${WHEN}) under ${STRATEGY || 'the default'}` : flag('knobs') ? `modulation M1's six under ${STRATEGY || 'the default'}, the cast pinned to ${PIN.timbres.leadTimbre}/${PIN.timbres.padTimbre}/${PIN.timbres.stabTimbre} and ${Object.keys(PIN.lanes).length} lanes` : flag('derive') ? `derive-lite's six under ${STRATEGY || 'the default'}` : `one bird at ${PULL}`}`);
const digests = new Map();
for (const j of jobs) {
  const began = Date.now();
  const file = path.join(OUT, `${j.name}.wav`);
  const r = await renderToWav(browser.page, j, file, RATE);
  // ...and the same window with the harmonic layers alone, which is the bus
  // this round's three knobs move and the one the readings are taken off. It is
  // a second render and not a filter over the first: a corner and a tail are
  // properties of an instrument, and a kick over them is a kick.
  if (flag('knobs')) {
    await renderToWav(browser.page, { ...j, layers: HARMONIC_LAYERS }, path.join(OUT, `${j.name}-harmonic.wav`), RATE);
  }
  const same = digests.get(j.plan);
  digests.set(j.plan, same || j.name);
  console.log(`  ${j.name.padEnd(22)} ${j.say.padEnd(34)} ${r.seconds} s  ${String(r.events).padStart(4)} events  ${r.peak} dBFS  ${same ? `— the same music as ${same}` : ''}`);
}
await browser.close();
server.close();
console.log(`\n  ${jobs.length} renders in ${path.relative(ROOT, OUT)}, ${digests.size} different pieces of music between them`);
}

// **Read back what the file says it is before handing it over** (the rule K5b's
// `renderMix` bug wrote down). Every file against `house.wav`, in samples.
if (flag('derive')) {
  const house = path.join(OUT, 'house.wav');
  console.log(`\n  against house.wav, in samples of the rendered file:\n`);
  console.log(`  ${'file'.padEnd(12)} ${'derives to'.padEnd(34)} ${'bpm'.padStart(6)} ${'seconds'.padStart(8)} ${'max LSB'.padStart(8)} ${'% changed'.padStart(10)} ${'rms dB'.padStart(8)}`);
  for (const j of jobs) {
    const file = path.join(OUT, `${j.name}.wav`);
    const d = diffOf(file, house);
    const t = planTheme(j.masterSeed, j.theme, j.opts);
    const der = derive(asFullSpell(j.spell));
    const say = `${der.tempoFamily}/${der.kit}/${der.drumsOn ? 'drums on' : 'drums off'}`;
    console.log(`  ${j.name.padEnd(12)} ${say.padEnd(34)} ${String(t.bpm).padStart(6)} ${(d.aLen / 2 / RATE).toFixed(2).padStart(8)} ${String(d.max).padStart(8)} ${d.pct.toFixed(2).padStart(10)} ${d.rmsDb.toFixed(1).padStart(8)}`);
  }
}

// **Step 6's readings.** The mids on every file, in the two bands the two
// documents measure them in, and — for the lead-entry pair — against the same
// seed rendered off the build with the rule off. `--read` re-reads without
// rendering, so the *before* and the *after* passes are compared without
// asking a browser for anything twice.
if (flag('recipes')) {
  const before = arg('before', null);
  console.log(`\n  the mids, as a share of the whole, over the same window:\n`);
  console.log(`  ${'file'.padEnd(20)} ${'300 Hz-2 kHz'.padStart(13)} ${'500 Hz-2 kHz'.padStart(13)} ${'figure bars'.padStart(12)}  what`);
  const rows = [];
  // The *before* pass is served by a build with the rule off, so the plan it
  // is read against has to have the rule off too: a count taken off this tree's
  // own plan would be the after's count under the before's name.
  const st = strategyById(STRATEGY || 'house-v1');
  const planOf = (j) => planTheme(j.masterSeed, j.theme, WHEN === 'after' ? j.opts
    : { ...j.opts, style: { ...st.style, switches: { ...(st.style.switches || {}), leadEntry: false } } });
  for (const j of jobs) {
    const file = path.join(OUT, `${j.name}.wav`);
    if (!fs.existsSync(file)) continue;
    const t = planOf(j);
    const seconds = (j.toBar - j.fromBar) * t.barSeconds;
    const wide = bandShareDb(file, RATE, seconds, 300, 2000);
    const narrow = bandShareDb(file, RATE, seconds, 500, 2000);
    // **In the window**, which is the only place a card's own number means
    // anything: a count over the whole theme says nothing about sixteen bars.
    const keys = t.timeline.slice(j.fromBar, j.toBar).filter((r) => r.layers.includes('keys')).length
      + ' of ' + (j.toBar - j.fromBar);
    rows.push({ name: j.name, wide: +wide.toFixed(2), narrow: +narrow.toFixed(2), keysBars: keys, note: j.note, motif: t.dice.motif || null });
    console.log(`  ${j.name.padEnd(20)} ${wide.toFixed(2).padStart(13)} ${narrow.toFixed(2).padStart(13)} ${String(keys).padStart(12)}  ${j.note}`);
  }
  // The pair, where both passes are on disk.
  if (before) {
    console.log(`\n  the lead-entry rule, against ${before}:\n`);
    for (const [m, n] of SEEDS) {
      const a = path.join(ROOT, before, `seed${m}-before.wav`);
      const b = path.join(OUT, `seed${m}-after.wav`);
      if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log(`  seed ${m}: one half is missing`); continue; }
      const t = planTheme(String(m), n, { ...(STRATEGY ? { strategy: STRATEGY } : {}) });
      const seconds = (BARS) * t.barSeconds;
      const w0 = bandShareDb(a, RATE, seconds, 300, 2000);
      const w1 = bandShareDb(b, RATE, seconds, 300, 2000);
      const n0 = bandShareDb(a, RATE, seconds, 500, 2000);
      const n1 = bandShareDb(b, RATE, seconds, 500, 2000);
      const d = diffOf(b, a);
      console.log(`  seed ${String(m).padEnd(8)} 300 Hz-2 kHz ${w0.toFixed(2)} -> ${w1.toFixed(2)} (${(w1 - w0 >= 0 ? '+' : '')}${(w1 - w0).toFixed(2)} dB), `
        + `500 Hz-2 kHz ${n0.toFixed(2)} -> ${n1.toFixed(2)} (${(n1 - n0 >= 0 ? '+' : '')}${(n1 - n0).toFixed(2)} dB), `
        + `${d.max} LSB over ${d.pct.toFixed(2)} % of the samples at ${d.rmsDb.toFixed(1)} dB`);
    }
  }
  fs.writeFileSync(path.join(OUT, `readings-${WHEN}.json`), JSON.stringify(rows, null, 2));
}

// **The seasoning gate.** Three things have to be true of `tide-high` against
// `house` and they are three different kinds of claim: the plans name the *same
// voices*, so nothing here is derive-lite's redraw wearing a knob's clothes; the
// tails are *measurably longer*, in milliseconds off the samples; and the file
// is not one sixteen-bit step from the house, which is the floor every pull has
// had to clear since phase 1.
if (flag('knobs')) {
  const house = path.join(OUT, 'house.wav');
  const housePlan = planTheme(MASTER, THEME, jobs[0].opts);
  const castOf = (t) => [...new Set(t.events.map((e) => e.voice))].sort().join(' ');
  const rows = [];
  console.log(`\n  the six, read back — the tails, the corner and the attack off the harmonic solo:\n`);
  console.log(`  ${'file'.padEnd(12)} ${'cast'.padStart(6)} ${'bpm'.padStart(5)} ${'hold ms'.padStart(8)} ${'trough'.padStart(9)} ${'centroid'.padStart(9)} ${'attack ms'.padStart(10)} ${'max LSB'.padStart(8)} ${'% changed'.padStart(10)} ${'rms dB'.padStart(8)}  knobs`);
  for (const j of jobs) {
    const file = path.join(OUT, `${j.name}.wav`);
    const solo = path.join(OUT, `${j.name}-harmonic.wav`);
    const t = planTheme(j.masterSeed, j.theme, j.opts);
    const d = diffOf(file, house);
    const from = j.fromBar * t.barSeconds;
    const window = (j.toBar - j.fromBar) * t.barSeconds;
    const m = readingsOf(solo, t, from, window, RATE);
    const centroid = centroidOf(solo, RATE, window);
    const same = castOf(t) === castOf(housePlan);
    const said = t.knobs
      ? Object.entries(t.knobs).map(([v, row]) => `${v}:${Object.entries(row).map(([k, x]) => `${k}=${(+x).toPrecision(3)}`).join(',')}`).join(' ')
      : '—';
    rows.push({ name: j.name, same, bpm: t.bpm, centroid, ...m, diff: d, knobs: said });
    console.log(`  ${j.name.padEnd(12)} ${(same ? 'same' : 'MOVED').padStart(6)} ${String(t.bpm).padStart(5)} ${m.holdMs.toFixed(0).padStart(8)} ${m.troughDb.toFixed(1).padStart(9)} ${String(centroid).padStart(9)} ${m.attackMs.toFixed(1).padStart(10)} ${String(d.max).padStart(8)} ${d.pct.toFixed(2).padStart(10)} ${d.rmsDb.toFixed(1).padStart(8)}  ${said}`);
  }

  const houseRow = rows.find((r) => r.name === 'house');
  const tide = rows.find((r) => r.name === 'tide-high');
  const faults = [];
  for (const r of rows) if (!r.same) faults.push(`${r.name} plans a different cast from the house, and the pin is supposed to hold it`);
  if (!(tide.holdMs > houseRow.holdMs)) faults.push(`tide-high holds ${tide.holdMs.toFixed(0)} ms against the house's ${houseRow.holdMs.toFixed(0)}`);
  if (!(tide.troughDb > houseRow.troughDb)) faults.push(`tide-high's troughs are ${tide.troughDb.toFixed(1)} dB against the house's ${houseRow.troughDb.toFixed(1)}`);
  if (!(tide.diff.max > 1)) faults.push(`tide-high is ${tide.diff.max} LSB from the house`);
  console.log(faults.length
    ? `\n  FAIL  ${faults.join('; ')}`
    : `\n  ok    the same ${castOf(housePlan).split(' ').length} voices in every plan; tide-high holds ${tide.holdMs.toFixed(0)} ms against the house's ${houseRow.holdMs.toFixed(0)} — ${(tide.holdMs - houseRow.holdMs).toFixed(0)} ms longer on the same instruments, with its troughs ${(tide.troughDb - houseRow.troughDb).toFixed(1)} dB shallower — and is ${tide.diff.max} LSB from the house over ${tide.diff.pct.toFixed(2)} % of its samples at ${tide.diff.rmsDb.toFixed(1)} dB`);
  fs.writeFileSync(path.join(OUT, 'readings.json'), JSON.stringify(rows, null, 2));
  if (faults.length) process.exit(1);
}
