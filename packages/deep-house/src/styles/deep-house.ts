// Deep house, as one file.
//
// Everything in this project that is *this music* rather than the machine that
// plays it: the tempo family and the swing, the key and the register windows,
// the density, groove and harmony tables, the section grammar and the
// arrangement rules, the space, the sends, the push, the sidechain and the
// master curve, the loudness model's fitted coefficients, the two measured
// rooms, the sound stage's own rules, the seam arithmetic, and the frozen
// candidate lists every die draws from. All of it mined from three reference
// DJ sets and marked MEASURED where it was measured; all of it with the
// comment that says which measurement, which benchmark minute, which of
// Eugene's marks. **The comments are the provenance and they move with their
// numbers** — which is why this is a JavaScript module and never JSON.
//
// A second style is a second file of this shape. Nothing in `src/` outside
// `src/styles/` and the app's own entry points knows this file exists, and
// nothing in `src/` outside it knows the string `deep-house`; the engine is
// handed a style and reads it.
//
// Where a number stayed behind, it stayed for a reason:
//
//   `packages/engine/src/params.ts`        the instruments. The kick's envelope, the hats'
//                          ladder, the clap, the bass, the level each voice is
//                          trimmed to and the three harmonic patches. A second
//                          style plays the same instruments, and this file
//                          composes them into `base` in the order the one
//                          table always had.
//   `src/corpus.ts`        the mined sequences. A data module of its own, 30 KB
//                          of it, imported below as this style's vocabulary.
//   `packages/engine/src/voices/*.js`      every voice's DSP, and what each declares about
//                          itself in its descriptor.
//   the engine             the resolver, the compiler's mechanics, the graph,
//                          the limiter's shape, the oversample, `MIN_RELEASE`,
//                          the scheduler's look-ahead.
//
// ## Reachability, as facts
//
// Five things in here are written down and are not reached. None of them is a
// fault and none of them is to be "fixed": making one reachable is a
// composition change and a re-bless (PLAN-SCALE §3), and `tools/check.ts`
// asserts all five — the first by counting what each stream is actually asked
// for over the fourteen golden themes — so that a change to them is a
// deliberate one.
//
//   1. **Four dice draw zero.** MEASURED by patching `Rng.prototype.next` over
//      masters 1 and 92970: `voicing`, `bass`, `stab` and `hat` never draw.
//      Both measured rooms carry their own `shape` — a `voicingStyle` and all
//      three masks — and the generator short-circuits the die when they do, so
//      the three voicing styles and the mined bass, stab and hat tables are
//      unreachable in the released catalogue however often they are hashed.
//   2. **Three sidechain numbers are overridden by every room.**
//      `sidechain.depthDb`, `minimumAt` and `recoverBy` in the base below are
//      unreachable for every golden theme: both measured rooms write their
//      own and the preset die always lands on one of the two. Moving the base
//      number moves nothing. Found in round A by mutating it and watching the
//      program digest not move. `lowDepthDb` is the exception — neither room
//      writes it — and it is what the bass actually ducks by.
//   3. **`kick.startHzSlow` does not exist.** `generate()` reads
//      `S.kick['startHzSlow']` on a slow theme, in the base and in both rooms
//      alike, and gets `undefined`; `kick.ts` then falls back to `K.startHz`,
//      which is the pitch every theme actually plays. It is left exactly as it
//      stands, because writing the key changes the record; it is in
//      notes/TODO.md for Eugene's ear.
//   4. **`stage.backMidShare` is never applied.** The middle of the stage's
//      gradient is for a layer with *two* of its own kind in front of it, and
//      there are only ever two harmonic layers in all — the pad and the keys —
//      so the list of layers behind the lead is never longer than one and the
//      `backMid` role is never assigned. The number is kept because it is the
//      gradient's own shape and a third harmonic lane is exactly what would
//      need it. Found in round F by the check below, not by reading.
//   5. **`dice('timbre:again')` draws zero.** The rule that a set never runs
//      two organ themes back to back is written and is not switched on:
//      `generate()` takes `avoidOrgan` and no caller passes it, so the second
//      timbre draw never happens. Kept as it stands for the same reason as the
//      rest: turning it on moves every theme after an organ.

import { INSTRUMENTS } from '@deep-house/engine/params';
import { CORPUS } from '../corpus.ts';
import signatures from './deep-house-signatures.json' with { type: 'json' };
import { resolveSettings } from '@deep-house/engine/settings';
import {
  ROOMS, VOICING_STYLES, FX_PALETTES, DENSITY_LABEL, MASK_TABLES, candidateLists,
} from '../catalogue.ts';

import type { Lane, Style, Table } from '@deep-house/engine/style';

// --- the table a room is resolved against -----------------------------------
//
// The base: this style's own numbers, with the instruments spread in where
// they have always sat, in the order the one table was always written in. A
// preset's room is merged over it while a theme is planned
// (`resolveSettings` in packages/engine/src/settings.ts), so the style is what the machine
// starts from and never what one room happens to say.

/**
 * The table, and the machine's own shape for it. It was the *source* of that
 * shape until round W of PLAN-V1-NEXT — `Table` in the engine read
 * `typeof import('./styles/deep-house.ts').base`, so whatever this module
 * happened to say a table was, a table was. It is the other way about now: the
 * engine states what it requires and this satisfies it, so a field stated here
 * and named nowhere in the contract is an error in this file, and a field the
 * contract requires and this does not carry is the same error.
 */
export const base = {
  tempo: {
    // MEASURED: both benchmark minutes run 103-104 BPM. Eugene, hearing the
    // rarer roll: "I see some songs get to 122 bpm, let's stay in the range
    // 95-105 for now" — so the second family is no longer a faster room but a
    // slower one, and the whole record lives between 95 and 105 with its
    // centre of mass on the benchmarks.
    //
    // The two dice this is read with — one `chance`, one `float` — are
    // unchanged in number and order, so only the tempo of a seed moved and
    // nothing else about it did.
    def: 103,
    slowMin: 100,
    slowMax: 105,
    fastMin: 95,
    fastMax: 100,
    slowChance: 0.75,
  },

  // MEASURED: offbeat eighths land at 49.8% of the beat — dead straight.
  // Kept as a dial (0.50-0.58) rather than the 0.56 shuffle of genre lore.
  swing: 0.5,
  // MEASURED: hats sit 5-10 ms early. Seconds, subtracted from hat times.
  hatNudge: 0.006,

  key: {
    roots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // MEASURED: roots are near-flat
    minorChance: 0.8, // MEASURED: minor 80% of the time; the rest dorian
  },

  register: {
    // MEASURED on the benchmarks: bass fundamental 42-49 Hz, MIDI p10/p50/p90
    // of 29/31/38 and 25/28/37 — a good deal lower than the set-wide reading.
    subLow: 24,
    subCenter: 30, // the octave the line is folded toward
    subHigh: 38,
    subCeiling: 43,
    chordLow: 55,
    chordHigh: 72,
    padLow: 50,
    // A voicing whose bottom note is above this gets one an octave under it.
    padOctaveBelow: 57,
    padHigh: 76,
  },

  // The instruments, exactly where `kick` through `timbre` have always stood in
  // this table, and written in packages/engine/src/params.ts beside the measurements that
  // produced them: the kick, the hats, the clap, the bass, the level table and
  // the three harmonic patches with their timbre lists.
  ...INSTRUMENTS,

  // MEASURED (space.md): under 120 Hz the sources are mono to three decimal
  // places; the width lives in 300 Hz - 4 kHz and the highs are *narrower*
  // than that; and the image breathes — the side/mid ratio of the chord band
  // modulates at about 0.21 Hz with a coefficient of variation of 0.45. The
  // last one is the thing a static generator is missing.
  space: {
    // MEASURED: 30-120 Hz is mono to three decimal places but 120-300 Hz still
    // carries side/mid 0.38. A mono-maker at 120 Hz took that band to 0.04, so
    // the crossover comes down to 100 Hz and the slope is gentler (Q 0.5, and
    // the wide path starts an octave lower still) — under 100 Hz stays mono,
    // the low mids keep their width.
    // Mono below this, as a highpass on the *side* only — see the long note in
    // master.ts. The mid is never filtered, so the centre of the record is
    // flat through this stage by construction and "mono below 100 Hz" means
    // there is no side down there rather than that two filters were summed and
    // hoped for the best.
    //
    // MEASURED with the side path this replaces: side/mid survived at -1.7 dB
    // at 50 Hz and +1.4 dB at 100 Hz, so the low end was never mono at all.
    // Here the side is -12.3 dB at 50 Hz, -5.4 at 80, -3.0 at the corner and
    // -0.6 by 160 Hz, which leaves the 120-300 Hz width the sources measure.
    sideHpHz: 100,
    // DECIBELS, not a linear Q: Web Audio defines `Q` on lowpass and highpass
    // as the resonance at the cutoff in dB. -3.01 dB is linear 1/sqrt(2),
    // which is the Butterworth the old comment claimed and did not have.
    sideHpQdB: -3.01,
    // The width belongs to the chord band, not the top: measured side/mid is
    // 0.56 at 300-1k and only 0.42 at 4-16k. A first render had that backwards
    // (0.31 in the chords, 0.82 in the hats), which is why the mix read as
    // wide-but-not-stereo.
    // Side gain on the chord bus. It was 1.9 when the harmonic layer was
    // 10 dB quieter; at the level the strings and the piano now sit it drove
    // 300 Hz - 1 kHz to a side/mid of 1.34 and an L/R correlation of *minus*
    // 0.29 — an image turned inside out, not a wide one.
    // MEASURED this round against the three sets, side minus mid per third
    // octave: the sets sit at -4.2 to -6.0 dB from 315 Hz up and we sat at
    // -11 to -15 there, so the melodic bus was being *narrowed* by this gain
    // rather than widened. It comes up to where the measurement puts it. The
    // earlier reading that put it at 0.85 was taken when the chord band was
    // 10 dB louder relative to the rest and the side was reading against a
    // much quieter bed.
    widthBase: 1.45, // side gain on the chord bus
    // MEASURED: the breathing is a coefficient of variation of 0.45. At a
    // depth of 0.8 the render came out at 0.62 — a third too deep.
    widthDepth: 0.34, // +-, so the image breathes rather than sits
    widthRateHz: 0.21,
    padDriftHz: 0.07, // slow detune drift on the pad's outer voices
    padDriftCents: 7,
    // MEASURED: hats are a transient-wide element, not the widest band —
    // side/mid 0.42 and correlation 0.70 across 4-16 kHz. Per-hit random
    // panning at +-0.22 plus a Haas delay put the render at 0.80/0.23, so the
    // pan comes down and the Haas offset with it.
    // MEASURED this round: at 3-10 kHz the sets sit at side/mid -5.8 to -6.1 dB
    // and we sat at -7.4 — a decibel and a half narrow, and the cheapest
    // decibel and a half there is a wider per-hit pan, which is the one width
    // trick that sums to mono without a comb.
    hatPan: 0.18, // wide as transients, but they are not the widest band
    hatHaas: 0.002,
    // The Haas copy on the opposite side is what actually decorrelates the
    // hats; at +-0.8 and 0.22 it took 4-16 kHz to a correlation of 0.23
    // against a measured 0.70. Half the pan and two thirds the level.
    hatHaasPan: 0.3,
    // MEASURED this round, and left alone: neither this nor the pan is what
    // sets the hats' width. The noise half of a hat is rendered as two
    // independent channels and the metal half as one, so the metal/noise ratio
    // is the width control, and 4-10 kHz comes out at side/mid -7.6 dB against
    // the sets' -5.9. Raising this to 0.125 moved that by 0.1 dB and cost the
    // mono sum a 1.2 dB comb, so it goes back where it was; the remaining
    // decibel and a half is written up rather than bought at that price.
    hatHaasLevel: 0.09,
    clapPan: 0.35,
  },

  sends: {
    delayFeedback: 0.34, // GENRE
    delayDotted: 0.75, // GENRE: dotted eighth, in beats
    delayLevel: 0.5,
    // The chord wash: long and dark, and it never clears inside a bar.
    reverbSeconds: 2.4,
    reverbLevel: 0.95,
    reverbToneHz: 4000,
    reverbCorr: 0.25,
    reverbLowHz: 150,
    // MEASURED: the clap room is short and bright — RT60 144 ms at 3-10 kHz,
    // down 10 dB in 15 ms — and it sits behind a 53 ms pre-delay.
    roomSeconds: 0.32,
    roomPreDelay: 0.053,
    roomLowHz: 600,
    roomHighHz: 11000,
    roomLevel: 0.85,
    // MEASURED: the top of the mix is narrower than the chord band, so the
    // short room behind the hats and the clap is two thirds one tail.
    roomCorr: 0.7,
    clapReverb: 0.5,
    hatReverb: 0.18,
    // The piano's own room: long, dark and a little behind the note. It is
    // built the first time something sends to it, so a track with no piano in
    // it never pays for a four-second convolver.
    hallSeconds: 4.2,
    hallDecay: 2.3,
    hallToneHz: 3400,
    hallLowHz: 190,
    hallPreDelay: 0.032,
    hallLevel: 1.0,
    hallCorr: 0.2,
  },

  // The push: one macro over the bass drive, the body peak, the kick-bus glue
  // and the sub level, automated by the arrangement. Zero through a normal
  // groove — the kick and the bass are the structure and structure does not
  // distort — rising over the last bars of a build, briefly high on the first
  // bars of a drop, and gone again within eight. This is where the loudness
  // and the dirt Eugene wants "on breaks where the drums fill and the energy
  // rises" live, and nowhere else.
  push: {
    // MEASURED on the bass stem of master seed 1 theme 2, bars 60-64, with the
    // ceiling bypassed so nothing is hidden. The fundamental is 61.5 Hz and
    // the harmonics are read relative to it:
    //
    //   push off            h2 -24.4  h3 -44.4  h4 -47.3  h5 -60.1
    //   satAmount 0.50      h2 -30.4  h3 -14.7  h4 -35.3  h5 -25.6
    //   satAmount 0.22, satDrive 0.50   (this setting, measured below)
    //
    // A parallel tanh is symmetric, so what it makes is *odd* harmonics: at
    // 0.5 the third harmonic came up thirty decibels and the fifth
    // thirty-four, which at a 61 Hz fundamental puts 18% of the fundamental's
    // amplitude at 184 Hz. That is not drive on a bass, it is a square wave,
    // and it is what Eugene heard as "it sounds like it breaks the speakers".
    // bass.ts's own rule, three files away, is that the third harmonic stays
    // under -34 dB; a drop is allowed to break that rule, it is not allowed to
    // break it by twenty decibels.
    satAmount: 0.22, // how much of a hot parallel saturation is blended in
    satDrive: 0.5,
    // The body peak and the sub bump are EQ, not distortion, and they are most
    // of what makes a drop feel like a drop. They still move the sub band:
    // a +6 dB peak at 115 Hz with Q 0.65 is +4.0 dB at 62 Hz and +1.9 dB at
    // 39 Hz, which is the bass fundamental, not its body. Trimmed so the lift
    // lands where it is named.
    bodyDb: 4.5, // added to bass.bodyDb at full push
    subDb: 1.5, // and a dB or so of sub with it
    buildBars: 6, // the lift into a drop
    dropBars: 8, // and how long it takes to leave
    // The default ceiling is half; the drop's first bar is the one moment
    // allowed to go higher, and it is gone eight bars later. Eugene: overdrive
    // "is fine in some places, to exaggerate the transition from a loud break
    // beat to the quieter parts" — the moments, and nowhere else.
    dropLevel: 0.85,
    buildLevel: 0.5,
    markLevel: 0.5, // the bar that hands a loud section over to a quiet one
  },

  sidechain: {
    // MEASURED, and the tightest agreement in the whole profile: the minimum
    // sits 54 ms after the beat in both benchmarks and the level is back by
    // 0.94-0.97 of a beat. The depth is much deeper than the set-wide reading.
    depthDb: -16.0,
    // MEASURED on the reference sets: the *bass* ducks 6-9 dB, much less than
    // the midrange does, and its minimum is 54 ms after the beat. Ducking the
    // low end as hard as the chords flattens it — and then the bass
    // compressor, which used to sit after the duck, pushed what was left back
    // up into a straight line.
    lowDepthDb: -8.0,
    attack: 0.005,
    minimumAt: 0.054,
    recoverBy: 0.95, // fraction of a beat
  },

  master: {
    // Set by measurement: at this gain five seeds land within 0.4 dB of each
    // other at about -14 LUFS, with true peak around -5 dBTP — under the -1
    // ceiling with room to spare. Pushing the peak up to -1 would mean
    // crushing the crest, and the benchmark minutes have a *higher* crest than
    // a synthesised low end does, so that would be the wrong trade.
    // 0.77 was the balance pass's make-up, +0.6 dB over the 0.72 that stood
    // before it. The capture Eugene called "nearly perfect" — master seed 1,
    // theme 1, round bar 152 — measures 1.6 to 2.4 dB quieter than the same
    // material at 0.77, which is that make-up plus the low-mid bell's skirt.
    // ...but the record still has to land at -12 LUFS, and the sub ceiling,
    // the low shelf and the re-proportioned push together take about 1.7 dB
    // out of a theme, which is more than the make-up was ever worth. So the
    // make-up goes *up*, and it buys a quieter limiter rather than a louder
    // one: MEASURED on master seed 1 theme 2, at this gain the ceiling works
    // 4.2 dB through a drop against 6.4 dB before, and the crest of the drop
    // is 8.5 dB against 7.1. The record is a third of a decibel quieter than
    // the balance pass left it and a decibel and a half less of it is the
    // limiter. MEASURED over all 224 bars of master seed 1 theme 2, gated:
    // -11.95 LUFS at bf8c701, -12.31 here, against a target of -12.
    gain: 0.84,
    // A real ceiling. The limiter catches peaks, the soft clipper rounds what
    // gets past it, and the trim sets where the file actually lands.
    //
    // The attack is deliberately slow. A 3 ms attack riding a 45 Hz sine acts
    // *inside* one cycle of it: that is not limiting, it is redrawing the
    // waveform, and it is what a listener calls "the bass is clipping". At
    // 14 ms the limiter cannot see a single cycle of anything in the bass
    // register, and the release is long enough not to pump against the beat.
    // Nothing in this chain has a time constant shorter than a cycle of the
    // bass. The limiter rides the level slowly — 30 ms attack, 300 ms release,
    // a gentle ratio — so a 45-65 Hz wave never sees its gain move inside its
    // own period, which is what put a buzz on the bass the first time. The
    // fast peak catching is left to the clipper, which is memoryless: a
    // waveshaper has no attack and no release and therefore cannot pump.
    // Off, and `ratio: 1` means the node is not built. The same reading that
    // took the glue out condemns this one: it is a DynamicsCompressor on the
    // same low end, and Firefox renders the kick's onset with a step 0.35 of
    // its peak through it against 0.11 without. The ceiling is the soft
    // clipper's job now, and a waveshaper is memoryless — it has no attack and
    // no release, so it cannot move its gain inside a cycle of anything.
    // The ceiling, and the only thing holding it. A look-ahead brick-wall
    // limiter in a worklet we own (packages/engine/src/limiter-worklet.js), not a
    // DynamicsCompressor: that node moves its gain inside one cycle of a
    // fifty hertz wave and Firefox plays the step, which is why both of them
    // came out of this chain.
    //
    //   ceiling     0.75, where the clipper used to land its output anyway,
    //               so the record's level does not move -- only the
    //               distortion that used to hold it there goes away.
    //   lookahead   5 ms of delay, which is the time the gain has to ramp
    //               down in before the peak it was computed from arrives.
    //   hold        25 ms, longer than a cycle of anything above 40 Hz, so
    //               the envelope cannot fall between two peaks of the same
    //               bass note and the gain is flat across it.
    //   release     200 ms, slow enough not to pump against the beat.
    limiter: { ceiling: 0.75, lookaheadMs: 5, holdMs: 25, releaseMs: 200 },
    // If the worklet cannot be had, the master runs quieter rather than
    // handing the ceiling back to the clipper.
    limiterFallbackDb: -2,
    trim: 1.0,
    targetLufs: -14,
    dcHz: 22,
    dcQ: 0.7,
    // The shaper's own oversampling, and it is one of three words Web Audio
    // accepts rather than any string: said as `OverSampleType` here so the
    // resolved settings carry the narrow type to the two `WaveShaper`s that
    // read it (packages/engine/src/master.ts) instead of a `string` neither of them can take.
    oversample: '4x' as OverSampleType,
    // **The clipper, and its one ceiling** (round (f) of the reconciled review
    // of 09-24: this paragraph had a twin above `dcHz` that still gave 0.847,
    // -1.4 dBFS, the ceiling of an older knee and drive). A
    // safety clipper, not a saturator: linear up to the knee, so only real
    // overs get rounded; the tanh it replaced shaped *everything*, and on a
    // mix whose peaks are the bass that is broadband distortion by another
    // name.
    //
    // Linear to 0.80 now, not 0.55. With a real limiter in front holding the
    // signal at 0.75, everything reaching the clipper is under the knee and
    // passes through untouched; the curve above it exists only to catch the
    // inter-sample overs a sample-peak limiter cannot see, with a hard
    // ceiling of knee + (1 - knee) / drive = 0.891, or -1.0 dBFS.
    // MEASURED before this round, with the clipper as the only ceiling: the
    // marked growl scenes on master seed 84658 arrived at 0 dBFS and had
    // 2.1-2.5% of their samples shaped, the worst by 0.25 of full scale.
    clipKnee: 0.80,
    clipDrive: 2.2,
    filterOpen: 15000,
    filterClosed: 420,
    // Glue over the kick and the bass together: slow enough to let the kick's
    // transient past, releasing near a beat, 2-3 dB of gain reduction, then a
    // little saturation so the two read as one instrument.
    // 2 dB of gain reduction, no more: the benchmarks' low end has a *higher*
    // crest factor than a synthesised one, so squeezing harder moves away from
    // them rather than toward them.
    // The glue's saturation is off. `saturationCurve` is non-linear well
    // before full scale, and the loudest thing going through this bus is a
    // sustained sine at 45 Hz: any curve here is harmonics on the bass. The
    // push macro is where drive on the low end lives now.
    // The glue is off, and `ratio: 1` now means the node is not built at all.
    //
    // It was two decibels of gain reduction to make the kick and the bass read
    // as one instrument. MEASURED across engines on one kick: through the
    // theme graph Firefox renders its onset with a step 0.84 of the hit's
    // peak, against 0.05 in Chromium and WebKit — a DynamicsCompressor with a
    // 25 ms attack sitting on a 50 Hz wave moves its gain *inside* one cycle
    // of that wave, and Firefox does not smooth it the way Chromium does.
    // Take the node out and the same kick renders at 0.037, cleaner than
    // Chromium managed with it in. Two decibels of glue is not worth a click
    // on every beat in a third of browsers.
    glue: { threshold: -10, knee: 10, ratio: 1, attack: 0.025, release: 0.35, drive: 0 },
    airHz: 8500, // a high shelf on the master so the hats read as hats
    airDb: 1.8,
    // A presence lift where the reference sets carry more energy than a
    // synthesised mix naturally does: hats, clap body, chord harmonics.
    presenceHz: 2600,
    presenceDb: 5.5,
    presenceQ: 0.6, // wide: the hole runs from 1.6 kHz to 4 kHz, not one spot
    // A broad lift where the generator has least to say. MEASURED against the
    // three sets' long-term spectrum: 120-250 Hz sat 10 dB under them, because
    // the kick's body is a sine that stops at 60 Hz and the chord voicings
    // start above middle C, so the octave between them belongs to nothing.
    // The sources there are thin by construction, so this is the one place a
    // broad master EQ is the honest tool rather than a patch.
    lowMidHz: 160,
    lowMidDb: 7.5,
    lowMidQ: 0.62,
    // ...and the shelf that keeps the sub off it. A peaking filter has skirts:
    // +7.5 dB at 160 Hz with Q 0.62 is still +2.7 dB at 62 Hz and +1.2 dB at
    // 39 Hz, so every bass fundamental in the record was riding a filter aimed
    // at the octave above it. MEASURED, this shelf against the bell:
    //
    //   Hz        39    62    80   100   125   160   250   400
    //   bell    +1.2  +2.7  +4.0  +5.4  +6.8  +7.5  +5.6  +2.8
    //   +shelf  -0.6  +1.4  +3.3  +5.0  +6.6  +7.4  +5.6  +2.8
    //
    // — the 125 Hz to 400 Hz the balance pass measured is untouched to within
    // a tenth of a decibel, and the sub band comes back to where it sat before
    // the bell was widened.
    lowShelfHz: 70,
    lowShelfDb: -2.0,
    // The hole this round measured. Against the three sets' long-term
    // spectrum, averaged over five 32-bar windows in three themes, 500 Hz to
    // 2 kHz sits 15-22 dB under them and 2.5 kHz 8 dB under, while 4-8 kHz is
    // within a decibel: the mids are the whole of what Eugene hears as "bass
    // and highs dominant". Two thirds of that gap is the record being minimal
    // where a DJ set is a full production, and no filter can invent a vocal;
    // this is the part an honest broad lift can take, and it is the same tool
    // and the same argument as `lowMid` above.
    // MEASURED twice: at 950 Hz and Q 0.5 this also lifted 250-400 Hz, which
    // a theme whose harmonic layer is already loud does not need — seed 1's
    // third theme went 6 dB *over* the sets there. Higher and a little
    // narrower puts the lift where every theme measured short.
    midHz: 1100,
    midDb: 5.5,
    midQ: 0.55,
    // MEASURED: a breakdown lifts the pad and midrange by +1 to +1.4 dB.
    breakdownLiftDb: 1.4,
  },

  // MEASURED corpus density is biased upward (the note-start detector counts
  // the kick and the pump), and the genre is minimal anyway: space and air,
  // not a note on every sixteenth. The density die leans sparse.
  density: {
    weights: [{ v: 'minimal', w: 5 }, { v: 'medium', w: 3 }, { v: 'busy', w: 1.2 }],
    bassNotes: { minimal: 3, medium: 4, busy: 6 },
    maxStabs: { minimal: 2, medium: 3, busy: 4 },
    // MEASURED (timbres.md): 40% of tracks run two harmonic layers — a
    // sustained floor under a rhythmic stab. So it is 60/40, not 90/10. These
    // three weighted by the density die average out at 0.42.
    bothHarmonicChance: { minimal: 0.32, medium: 0.45, busy: 0.75 },
    // MEASURED nothing; a riser every 32 bars rather than every 8 is what
    // "sparse" means here.
    fxEveryBars: { minimal: 32, medium: 24, busy: 16 },
    sixteenthHats: { minimal: false, medium: true, busy: true },
  },

  // Where a theme's own loudness is decided, before a node is built.
  //
  // MEASURED, 2026-09-17, master seeds 1-40 x themes 0-2 (see the coefficient
  // block below for the count that survived, the residual and the date): eight
  // bars of each theme's main groove rendered offline through the real graph in
  // headless Chromium and metered. See tools/loudness-fit.ts, which writes
  // the whole table and the fit up as loudness-fit.md.
  //
  // `intercept`, `coef` and `centre` are a linear model over the plan:
  //
  //   predicted LUFS = intercept + sum over k of coef[k] x (column[k] - centre[k])
  //   trim dB        = clamp(targetLufs - predicted, -clampDb, +clampDb)
  //
  // The columns are named in LOUDNESS_COLUMNS at the foot of this file and are
  // all functions of `loudnessFeatures(track)`, which reads the dice, the mined
  // masks, the room's own level table and eight rows of the timeline. Nothing
  // in it renders, meters or touches audio: evaluating it is a few dozen
  // multiplications, which is why the record can be levelled on a listener's
  // machine at all.
  loudness: {
    // MEASURED 2026-09-17, master seeds 1-40 x themes 0-2 = 120 themes: eight
    // bars of each one's main groove, rendered offline through the real graph
    // in headless Chromium and metered (tools/loudness-fit.ts, whose report
    // is loudness-fit.md). Ten features chosen by forward selection
    // on the five-fold cross-validated residual, out of a pool of fifty:
    // R2 0.750, in-sample residual 0.461 LU, **cross-validated 0.519 LU**, the
    // worst held-out theme 1.40 LU. A pool that was also allowed a coefficient
    // per instrument and per room cross-validates at 0.508 LU — eleven
    // thousandths of a decibel better for a table somebody would have to refit
    // every time a voice is written, which is why this one names neither.
    //
    // The measured set ran -15.63 to -11.17 LUFS, sd 0.921. What the fit cannot
    // predict is what is left: sd 0.461, and the trims are ±4 dB at the outside.
    //
    // **The target is where the record already is, and that is the point.**
    // -13.0 is the loudness of the blessed reference — seed 1's eight bars in
    // tools/reference-seed1.json measure -12.98 — and it is the mean of the
    // 120 main grooves to a hundredth. So the mean trim is +0.06 dB: this
    // levels the themes against each other and moves the record nowhere.
    //
    // A target of -12 was tried and rejected, MEASURED rather than argued.
    // It asks for +1.54 dB on average in front of a limiter that is already
    // working, and the limiter gives a quiet section more of that decibel than
    // a loud one: seed 1's breakdown went from +0.01 LU over its own mains to
    // **+0.62**, against a rule of 0.5, and the share of the window the limiter
    // spent over a decibel down went from 16% to 40% on that theme's main and
    // from 54% to 80% on seed 68299. Levelling a record and making it louder
    // are two decisions, and the second one is the make-up gain's, which the
    // click gate holds at 0.84 and the notes carry as an open item. This one
    // is the first decision only.
    targetLufs: -13,
    // A clamp and not a limit anybody expects to hit: over the measured 120 the
    // trim runs -2.30 to +3.18 dB and not one of them reaches this. Four
    // decibels is where a prediction has clearly gone wrong and the record
    // should be left where the mix put it rather than driven there.
    clampDb: 4,
    // How much of a decibel put in front of the master comes out the other
    // side. It is not one, because this record lives on its limiter: the
    // reference eight bars spend 45% of their length more than a decibel down.
    // MEASURED by rendering the same 120 themes a second time with the trim in
    // the graph and regressing what moved against what was asked for, through
    // the origin.
    //
    // Two numbers, because a limiter is one-sided: driving a theme up into the
    // ceiling gives back two thirds of the decibel, pulling one back out of it
    // gives back three quarters. Residual 0.065 LU over the 58 themes that went
    // up and 0.099 LU over the 59 that came down, against 0.103 for one slope
    // in the middle — and a slope in the middle is what put seed 38's third
    // theme 1.4 LU under its neighbours in the first montage. The level of the
    // theme adds nothing beyond the direction (0.019 dB of slope per LU going
    // up, nothing coming down), so this is the whole of it.
    slopeUp: 0.6673,
    slopeDown: 0.7662,
    intercept: -11.28438,
    coef: {
      velBass: 10.12243,
      sharePad: -2.02485,
      rateBass: 0.35629,
      wetKeys: -0.50731,
      harmonicBright: 0.16286,
      harmonicHold: 1.22596,
      stabMask: 5.72382,
      ratePad: 0.78353,
      harmonicDb: 0.28782,
      bpm: 0.06386,
    },
    centre: {
      velBass: 0.835112,
      sharePad: 0,
      rateBass: 3.480208,
      wetKeys: 0.367429,
      harmonicBright: 10.790127,
      harmonicHold: 0.379933,
      stabMask: 0.428125,
      ratePad: 1.695833,
      harmonicDb: -15.631364,
      bpm: 101.935,
    },
  },

  // **Four of these and `harmony.loopBarsWeights` are read by nothing** (R107
  // of the reconciled review of 09-24): `sixteenthHatChance`,
  // `sixteenthHatLevel`, `bassFifthChance` and `bassOctaveChance` were meant
  // to be the controls `varyBass` and the sixteenths hard-code, and the loop
  // lengths a theme plays are `corpus.loopLengthBars` (21/17/6), not the
  // 19/17/8 below. They stay written because they are in the resolved settings
  // every theme's `settings` line in `tools/program-digest.json` and the link
  // digest hash: taking them out is a re-bless of house-v2's settings, with no
  // note moved, and that is Eugene's word and not a tidy.
  groove: {
    openHatChance: 0.45,
    sixteenthHatChance: 0.8, // MEASURED: the sixteenth layer is nearly always there
    sixteenthHatLevel: 0.29, // MEASURED: -10.7 dB under the offbeat eighth
    hatVelocityCv: 0.28, // MEASURED
    ghostClapChance: 0.18,
    bassFifthChance: 0.3,
    bassOctaveChance: 0.2,
    stabChance: 0.62,
    // MEASURED: 2-5 bar kick dropouts are far more common than breakdowns and
    // are what keeps the groove from feeling mechanical.
    kickDropoutChance: 0.1,
  },

  harmony: {
    // MEASURED: i 40%, VImaj7 25%, iv 12%, III 2%, VII 1% (plus IV/V/v).
    degreeWeights: { 0: 40, 5: 25, 3: 12, 2: 4, 6: 3, 4: 3 },
    // MEASURED: 66% of chord spans are 1 bar, 21% are 2.
    chordBarsWeights: [{ v: 1, w: 66 }, { v: 2, w: 21 }, { v: 4, w: 13 }],
    // MEASURED: loop period 2 bars (19 windows), 4 (17), 8 (8), 16 (6).
    loopBarsWeights: [{ v: 2, w: 19 }, { v: 4, w: 17 }, { v: 8, w: 8 }],
    // MEASURED: the 9th, 11th and b7 all sit well above the non-chord floor.
    ninthChance: 0.75,
    eleventhChance: 0.35,
  },

  arrangement: {
    breakdownBars: 16, // MEASURED: 12-22 bars, median 15
    breakdownEvery: 64, // MEASURED: one every 48-96 bars
    kickPresentTarget: 0.75, // MEASURED
    // MEASURED: build-ups are filter sweeps in 64-83% of cases; the high band
    // rises in only half. Use the noise riser sparingly.
    riserChance: 0.45,
  },
} satisfies Table;

// --- the two measured rooms -------------------------------------------------
//
// A room is a set of overrides on the table above plus a few structural
// choices — which figures to use, whether there is a clap, how the harmony
// moves. Two of them are measured off benchmark minutes and named for what
// they sound like rather than where they came from; "auto" rolls between them
// from the seed.
//
// What every room shares is the family signature, and that is the table above
// rather than anything here: 103-104 BPM, minor, a kick pitched into the
// mid-40s within 30 ms and gone by 150-180 ms, a bass fundamental of 42-49 Hz,
// a hat on every offbeat eighth and nothing open, and a sidechain whose
// minimum sits 54 ms after the beat and is back by the next one.
//
// A room written here is **dormant** until `catalogue.rooms` names it: the pool
// the preset die draws from is that frozen list and not "every room with a
// bench", which is what it used to be, and measuring a third room would
// otherwise have entered the pool on its own and moved every auto seed.

export const rooms = {
  auto: {
    id: 'auto',
    label: 'auto',
    note: 'rolls between the others from the seed',
  },

    // From the archetypal minute: sub-heavy, near-sine bass playing two notes a
    // beat, no clap at all, a loud sixteenth shaker, short bright stabs and a
    // filter opening across the minute.
    sub: {
      id: 'sub',
      label: 'sub',
      note: 'near-sine bass, washy hats, a loud sixteenth layer, no clap',
      bench: 's3_22m00s',
      params: {
        // The minute this came from runs at 103.1 BPM; a measured preset is that
        // room, so it does not roll the tempo family.
        tempo: { slowMin: 103, slowMax: 103, slowChance: 1 },
        kick: {
          startHz: 54, endHz: 46, pitchTime: 0.03,
          t6: 0.075, t20: 0.20, t34: 0.27,
          drive: 0.05, clickLevel: 0.0, clickLp: 1200, bodyLp: 130,
        },
        // Near a sine: 2nd harmonic 19 dB down, 3rd 15 dB down.
        // Near a sine at the fundamental, but the body peak still has to reach
        // the -11.0 dB of 80-160 Hz the minute measures.
        bass: { drive: 0.14, cutoff: 250, triangle: 0.015, octave: 0.035, even: 0.1, bodyDb: 2.0 },
        register: { subCenter: 31 },
        hats: { closedT10: 0.085, shakerT10: 0.09, metalClosed: 0.45, lidHz: 7800 },
        clap: { on: false },
        sidechain: { depthDb: -19.5, minimumAt: 0.055, recoverBy: 0.94 },
        levels: { sub: -11.0, hatClosed: -8.0, shaker: -4.0, clap: -60, keys: -14.5, pad: -9.5, piano: -11.5 },
        master: { presenceDb: 4.2, airDb: 1.0 },
        groove: { openHatChance: 0 },
      },
      shape: {
        // MEASURED masks from the same minute.
        hatMask: '..xx..xx..xx..xx',
        bassMask: '.xx..xx..xx..xx.',
        bassContour: ['x', 'R', 'R', 'R', 'R', 'R', 'x', 'R'],
        stabMask: '..x.xxxx...xxxxx',
        sixteenths: true,
        voicingStyle: 'elevenths',
        // Static tonic with an occasional VI, three bars at a time.
        degreeBias: [{ v: 0, w: 20 }, { v: 5, w: 5 }],
        loopBars: 8,
        changeEvery: 4,
        sweep: 1.0, // the high band moves 25 dB across the minute
        stabLen: 1,
      },
    },

    // From the drum-and-bass-tone minute: flat and mid-forward, harmonically
    // rich bass, a snappy clap, bone-dry offbeat hats with no sixteenth layer,
    // darker sustained chords and nothing moving.
    growl: {
      id: 'growl',
      label: 'growl',
      note: 'dry short hats, a clap on 2 and 4, nothing sweeps',
      bench: 's2_2h40m50s',
      params: {
        tempo: { slowMin: 104, slowMax: 104, slowChance: 1 },
        // MEASURED: 65 Hz falling to 42 within 35 ms and gone by 146.
        kick: {
          startHz: 65, endHz: 42, pitchTime: 0.035,
          t6: 0.06, t20: 0.12, t34: 0.146,
          drive: 0.1, clickLevel: 0.0, clickLp: 1300, bodyLp: 150,
        },
        // This preset used to be the "reedy" one: the benchmark minute measures
        // its 3rd harmonic only 5 dB under the fundamental, and a bass built to
        // that number is the mush Eugene threw out. What the measurement is
        // reading there is a mixed record, not a bass, so the room keeps its
        // identity in the short dry hats and the clap and gives up the drive:
        // the 2nd harmonic sits around 15 dB down and the 3rd around 18, a
        // shade richer than `sub` and nowhere near reedy.
        bass: { drive: 0.2, cutoff: 420, triangle: 0.025, octave: 0.045, even: 0.15, bodyDb: 2.5 },
        register: { subCenter: 28 },
        hats: { closedT10: 0.021, metalClosed: 0.6, lidHz: 8200 },
        clap: { on: true, t20: 0.036 },
        sidechain: { depthDb: -15.1, minimumAt: 0.054, recoverBy: 0.97 },
        levels: { sub: -12.0, hatClosed: -3.5, shaker: -60, clap: -11.5, keys: -9.5, pad: -6.0, piano: -8.5 },
        master: { presenceDb: 4.2, airDb: 1.5 },
        groove: { openHatChance: 0 },
      },
      shape: {
        bassMask: '.x.....x.x....x.',
        bassContour: ['m3', 'x', 'm3', 'm3'],
        stabMask: 'x...x...x...x...',
        hatMask: '..x...x...x...x.',
        sixteenths: false,
        voicingStyle: 'ninths',
        // i alternating with III, two bars each.
        degreeBias: [{ v: 0, w: 12 }, { v: 2, w: 9 }],
        loopBars: 4,
        changeEvery: 2,
        sweep: 0.08, // the high band moves 2 dB across the whole clip
        stabLen: 4,
      },
    },
};

// --- the shape of a track ---------------------------------------------------
//
// Which layers a section kind may switch on, phrase by phrase, where its macro
// filter sits, and which of the section effects it invites. The *order* of
// sections is drawn from the real runs mined into `corpus.sectionOrders` and
// their lengths from `corpus.sectionBars`; this is the grammar those labels are
// read through, and `makeArrangement` in src/arrangement.ts is handed it.
//
// The eight layers a section may switch on and off are not a list this file
// keeps: they are the layers the registered voices say they are gated by
// (`plays` on each descriptor), in the registry's order — kick, hatClosed,
// hatOpen, sixteenths, clap, bass, keys, pad.

// --- the lanes --------------------------------------------------------------
//
// **The parts this music plays, and who plays each of them.** Round K6, and
// Eugene's decision of 09-18: a style declares its own lanes and their number is
// the style's — up to twelve here, two for an ambient style. Before it, the
// number of parts was a constant of the composer: `patterns.ts` wrote
// `hatClosed` and `shaker` by name and `generator.ts` wrote `kick`, `clap`,
// `sub`, `impact`, `swell`, `sweepDown` and `riser`, which is why sixteen
// registered, measured and weighted percussion instruments could be heard by
// nobody — there was no die, because nothing was asking a question.
//
// **Every lane of the record carries exactly one candidate**, and that is the
// whole of why K6 moved no seed: a draw over a list of one is that one, and it
// is taken off a stream of the lane's own (`<seed>::lane:<id>`), which
// reshuffles nothing behind it. The two digests are the proof.
//
// Twelve rows, in the order a bar is written in — which is a decision and not a
// set, because the order is the order the bar's own stream is consumed in and
// the order two events at the same instant come out in:
//
//   the **kick**, then the hat family (the offbeats, whichever of them opens,
//   and the sixteenths between them, which are one pass over one mined mask),
//   then the **backbeat**, the **bassline**, the **figure** and the **drone**,
//   and last the four pieces of **section glue**, which are gated by a
//   boundary and not by a phrase.
//
// The two harmonic lanes carry no candidate list at all and say so: they are
// chosen by *what they play* and not by who plays it, so the timbre die names a
// timbre and `voicePlaying` in the registry answers which instrument makes it.
// That is K5b's seam and it is left exactly where K5b put it.
//
// `bus` is the lane's own where its candidates agree on one, and `null` where
// the voice decides: the piano is on the melodic bus and the electric piano on
// the keys bus, and which of them is playing is a timbre away.

export const lanes: Lane[] = [
  { id: 'kick', role: 'kick', voices: [{ v: 'kick', w: 1 }], figure: 'kick', slot: null, bus: 'kick', gate: 'kick' },
  { id: 'offbeat', role: 'offbeat', voices: [{ v: 'hatClosed', w: 1 }], figure: 'hatMask', slot: 'offbeat', bus: 'drums', gate: 'hatClosed' },
  { id: 'offbeatOpen', role: 'offbeat', voices: [{ v: 'hatOpen', w: 1 }], figure: 'hatMask', slot: 'open', bus: 'drums', gate: 'hatOpen' },
  { id: 'sixteenth', role: 'sixteenth', voices: [{ v: 'shaker', w: 1 }], figure: 'hatMask', slot: 'sixteenth', bus: 'drums', gate: 'sixteenths' },
  { id: 'backbeat', role: 'backbeat', voices: [{ v: 'clap', w: 1 }], figure: 'backbeat', slot: null, bus: 'drums', gate: 'clap' },
  { id: 'bassline', role: 'bassline', voices: [{ v: 'sub', w: 1 }], figure: 'bassMask', slot: null, bus: 'sub', gate: 'bass' },
  { id: 'figure', role: 'figure', voices: null, timbre: 'stabTimbre', figure: 'stabMask', slot: null, bus: null, gate: 'keys' },
  { id: 'drone', role: 'sustained', voices: null, timbre: 'padTimbre', figure: 'chord', slot: null, bus: null, gate: 'pad' },
  { id: 'glueImpact', role: 'texture', voices: [{ v: 'impact', w: 1 }], figure: 'glue', slot: 'impact', bus: null, gate: null, incumbent: 'impact' },
  { id: 'glueSwell', role: 'texture', voices: [{ v: 'swell', w: 1 }], figure: 'glue', slot: 'swell', bus: null, gate: null, incumbent: 'swell' },
  { id: 'glueSweep', role: 'texture', voices: [{ v: 'sweepDown', w: 1 }], figure: 'glue', slot: 'sweep', bus: null, gate: null, incumbent: 'sweepDown' },
  { id: 'glueRiser', role: 'texture', voices: [{ v: 'riser', w: 1 }], figure: 'glue', slot: 'riser', bus: null, gate: null, incumbent: 'riser' },
];

// The keys a section's `layers` map carries: the lanes the grammar gates, in
// the lane table's order. They were `ARRANGEMENT_LAYERS` — the `plays` field of
// every registered voice, in the registry's order — until K6, and the eight
// words are the same eight; what changed is which table says so. A layer a
// section switches on is a **lane of this style**, and a style with two lanes
// has a grammar with two keys in it.
const GATES = lanes.filter((l): l is Lane & { gate: string } => !!l.gate).map((l) => l.gate);

const FULL = Object.fromEntries(GATES.map((l) => [l, true] as const));
const NONE = Object.fromEntries(GATES.map((l) => [l, false] as const));

function L(over: Record<string, boolean>) {
  return { ...NONE, ...over };
}

export const sections = {
  // Layers per phrase within a section. `i` is the phrase index inside the
  // section, `n` how many phrases it has.
  kinds: {
    intro: {
      label: 'intro',
      layers: (i: number, n: number) =>
        i === 0 && n > 1
          ? L({ kick: true, hatClosed: true })
          : L({ kick: true, hatClosed: true, hatOpen: true, clap: true, pad: true }),
      filter: [700, 5000],
    },
    build: {
      label: 'build',
      // MEASURED: a build is a filter sweep in 64-83% of cases; the high band
      // rises in only half of them, so the noise riser is optional here.
      layers: (i: number, n: number) =>
        i < n - 1
          ? L({ kick: true, hatClosed: true, hatOpen: true, clap: true, bass: true, pad: true })
          : L({ ...FULL, sixteenths: false }),
      filter: [2600, 15000],
      riserLast: 0,
    },
    main: {
      label: 'main groove',
      layers: () => L(FULL),
      filter: [15000, 15000],
    },
    breakdown: {
      label: 'breakdown',
      layers: (i: number, n: number) =>
        i === 0
          ? L({ pad: true, keys: true, hatClosed: true })
          : L({ pad: true, keys: true, hatClosed: true, sixteenths: true, bass: true }),
      filter: [900, 11000],
      sweepFirst: true,
      riserLast: 4,
      // MEASURED: the harmonic layer gets louder when the kick leaves.
      lift: true,
    },
    drop: {
      label: 'drop',
      layers: () => L(FULL),
      filter: [15000, 15000],
      impactFirst: true,
    },
    outro: {
      label: 'outro',
      layers: (i: number, n: number) =>
        i < n - 1
          ? L({ kick: true, hatClosed: true, hatOpen: true, clap: true, bass: true, pad: true })
          : L({ kick: true, hatClosed: true, pad: true }),
      filter: [14000, 800],
    },
  },

  labelToKind: {
    intro: 'intro',
    groove: 'main',
    build: 'build',
    breakdown: 'breakdown',
    drop: 'drop',
    outro: 'outro',
  },
};

// --- the sound stage --------------------------------------------------------
//
// What the desk does with a plan: which layer is at the front, which recedes,
// how far, how fast, in what colour, and what a receded layer is kept
// interesting with. The reasoning — thirteen of Eugene's marks and what each
// one changed — is the long note at the head of src/performance.ts, which is
// the machine that applies these; every number it applies is here.

export const stage = {
  // The grid the foreground is assigned on, and the memory a figure has to fall
  // out of before it counts as new again.
  block: 4, // bars
  window: 4, // blocks: sixteen bars
  // Unchanged for longer than this and a layer is second priority. Eight bars is
  // the phrase, and a phrase is how long a loop is allowed to be new for.
  staleBars: 8,
  // What tells a drone from a figure: how long a layer's notes are against a
  // bar. A strings pad holding a chord across two bars reads 2.00, a drawbar
  // organ on the same duty the same; the piano melody of seed 99895's third
  // theme reads 0.25 and a rhodes stab line 0.26. It has to be the length of a
  // note and not the share of the bar the layer is sounding for, because a stab
  // firing four times a bar fills the bar as completely as a held chord does and
  // is the opposite kind of figure.
  holdBar: 0.75,
  // And how many times a bar it strikes, which is what tells a touch from a busy
  // one. Both are in front of a drone; the sparse one is in front of both.
  touchOnsets: 2,
  // One die, read twice and both times against the minimal room. It is the room
  // in which a drone holding alone may *not* come forward over a phrase that has
  // nothing but drums under it, and it is the room that does not wait eight bars
  // before putting the drone at the back — the room Eugene marked -3 twice, and
  // the room in which a drone at the front has the least to compete with. A bar
  // with no kick lifts in any room.
  liftDensity: ['medium', 'busy'],
  openAtBackDensity: 'minimal',
  // The one thing a level cannot do. A drone at the back is still in the same
  // octave as the touch in front of it: MEASURED over bars 112 to 115 of seed
  // 99895's third theme — the window Eugene marked +2, the piano at the front
  // and the strings five and a half decibels behind it — over the 300 ms after
  // each piano note the piano stands 0.4 dB over the strings at 1 kHz, 2.2 at
  // 1.25 kHz and 1.8 at 1.6 kHz, and sits 6.9 dB *under* them at 800 Hz. Another
  // decibel off the pad everywhere buys a decibel there and a hole in the middle
  // of the record; a bell buys it where the tune is and nowhere else. It is
  // centred on the median fundamental the touch layer is playing in that block,
  // which is a number the plan already holds; the width is about an octave and
  // the depth is small enough that what it does is let a note through rather
  // than carve a notch anybody can name.
  dipDb: -2.5,
  dipQ: 1.2,
  // And the bell is not another decibel: it is the decibel the stage already
  // takes, moved to where the tune is. A bell this deep and this wide costs a
  // strings pad 1.0 dB of its own loudness — MEASURED, seed 99895 bars 28 to 31,
  // the pad alone reads -14.01 LUFS without it and -15.02 with it — so that much
  // is given back as level. The drone ends the size it was, shaped rather than
  // smaller: a decibel and a half further down in the octave the tune is in, and
  // a decibel up everywhere else, which is the 500 Hz - 2 kHz the balance round
  // measured this record short of. The record's own loudness does not move,
  // which matters because `loudness.ts` predicts a theme's loudness from the
  // plan and cannot see a single thing the compiler does.
  dipMakeupDb: 1.0,

  // How far the stage moves, in dB. The drums and the bass are the record, so
  // the bass barely moves at all and says what it has to say with its tone; the
  // harmonic layers are the ones that trade places.
  // MEASURED against the three sets after the stage landed: the back of the
  // stage is where our 500 Hz - 2 kHz deficit got 2 to 4.5 dB worse, because the
  // pad and the keys are the only things we have in that band and the stage was
  // taking five decibels off them. The *contrast* is what Eugene liked, so the
  // contrast is kept — front to back is still 5.7 dB on the pad and 5.1 on the
  // keys, against 7.5 and 6.5 — and the floor comes up under it.
  level: {
    pad: { front: 2.5, back: -3.2 },
    keys: { front: 2.5, back: -2.6 },
    bass: { front: 1.2, back: -1.0 },
  },
  // The stage is a gradient and not a cliff: the stalest layer goes all the way
  // to the back and anything else that is holding sits between, at this share of
  // the back's level and this share of its colour. Fact 4 of the note above: it
  // is never applied, because "anything else" needs a third harmonic lane and
  // there are two.
  backMidShare: 0.45,
  // A layer arrives at the front over a bar or two and the one it displaced
  // leaves over four, so a hand-over is a hand-over and not a jump cut. The
  // numbers are the full travel (back to front is 7.5 dB) divided by those bars.
  risePerBar: 4.0,
  fallPerBar: 1.9,

  // Front is drier and brighter, back is wetter and darker, before any treatment.
  frontWet: 0.82,
  frontLp: 1.14,
  backWet: 1.28,
  // The same argument as the level: a back layer is still darker than a front
  // one, but a sixth of an octave rather than a fifth, because what it darkens
  // is the one band the record is short of.
  backLp: 0.90,

  // Every sixteenth bar the background is let back up for a bar. A DJ releases
  // the filter over the phrase line; the level goes with it, and it is what
  // stops a receded layer becoming a new kind of static.
  letUpEvery: 16,
  letUpTo: 0.35,

  // The treatments a background layer may carry. One at a time, changing every
  // eight to sixteen bars, never the same one twice running, and never on the
  // kick or the sub.
  treatments: ['hpRise', 'lpClose', 'phaser', 'breath', 'throw', 'hole'],
  // A hole in the rhythmic layer is a hole in the groove; the pad is the only
  // layer allowed to disappear for a bar, so the rhythmic lane's rota is the
  // list above less these.
  padOnlyTreatments: ['hole'],
  // A layer's whole track of treatments, laid out ahead: segments of eight or
  // sixteen bars, each a different one from the last, each with its own settings
  // rolled from the theme's seed so two themes never phase the same way. The
  // rolls happen in the order they are written here, off the theme's own stream,
  // so this list's *order* is as locked as its numbers are.
  rota: {
    shortChance: 0.55,
    shortBars: 8,
    longBars: 16,
    rate: [0.05, 0.2],
    phase: [0, Math.PI * 2],
    stages: [4, 7],
    depth: [0.28, 0.5],
    mix: [0.3, 0.45],
    amount: [0.75, 1.0],
  },
  // Rises over the first five sixths of a segment and is released over the last
  // sixth — which is the phrase boundary, and which is where a DJ lets the
  // filter go. Both numbers are written down although they add to one, because
  // `1 - 0.84` is not `0.16` in binary and the release ramp is the record.
  releaseAt: 0.84,
  releaseOver: 0.16,
  // What each treatment does, as multipliers on what the voice would otherwise
  // have done; an absent treatment is a table of ones. The gesture's arithmetic
  // is `treatAt` in src/performance.ts and these are the numbers it applies.
  treatment: {
    // The classic: the bottom leaves the loop over sixteen bars and comes back
    // at the phrase line. On a pad whose highpass sits at 90 Hz this walks it up
    // to about 450 and lets it fall.
    hpRise: { hpMul: 4, levelDb: 1.0 },
    lpClose: { octaves: -1.15 },
    phaser: { center: 520 },
    // Not a sweep with a destination: a slow undulation, one cycle every sixteen
    // bars, which is the width and the tone breathing together.
    breath: { octaves: 0.34, spread: 0.28, cycleBars: 16 },
    // Plain until the last bar of a sixteen-bar phrase, and then thrown into the
    // dotted-eighth delay on the way over the line.
    throw: { everyBars: 16, delayMul: 3.2, levelDb: 0.8 },
    // The pad lets the last bar of a sixteen-bar phrase go by, so the boundary
    // arrives as an arrival.
    hole: { everyBars: 16, minBars: 0.5, release: 0.5 },
  },

  // The bass's own contrast, which is not a DJ treatment and is never switched
  // off. Two things happen to the body filter once a line has been running for
  // sixteen bars: a slow breath on the eight-bar grid so a held line is not one
  // tone for a minute, and a bar of extra opening on the bar where the figure
  // actually varies. The second is the direct answer to Eugene's sentence — "if
  // the bass or drum signature changes it is barely audible".
  //
  // There is deliberately no "held template" test. The table's `density.bassNotes`
  // floors at three moves a bar, so the one-move masks the corpus is full of
  // (`.x..............`, 130 of 2966 bars) never reach a note; what this
  // generator actually produces is a line that varies every four bars and is
  // mixed so that nobody notices. That is the thing to fix.
  bassOpen: [1.0, 1.1, 1.22, 1.08],
  bassRunBars: 16,
  bassChangeOpen: 1.12,
  bassFrontOpen: 1.12,

  // Register, not harmony: on alternate eight-bar phrases the desk above comes
  // up, so the same chord is played from a different part of the instrument. How
  // far it opens is a property of the pad's own timbre — an ensemble doubles
  // nearly the whole way, a keyboard a little over half — so it is a list of
  // timbres here and not `padTimbre === 'strings' || padTimbre === 'swell'` in
  // the compiler, which is what it was until round F.
  wideDouble: ['strings', 'swell'],
  doubleTop: { wide: 0.9, narrow: 0.55 },

  // A per-phrase colour, so phrase two and phrase four of a sixteen-bar cycle
  // are not the same phrase twice: rolled from the theme's own seed, and only
  // while the stage is engaged. It is the piano's alone, and it is the one place
  // here where a single instrument has a rule of its own — which PLAN-V1-NEXT
  // allows as style data and refuses as an engine branch, so it is a table keyed
  // by voice rather than `ev.voice === 'piano'` in the compiler.
  phraseColour: {
    piano: {
      everyBars: 16,
      db: [0, 1.4, -0.4, -1.4],
      dbJitter: [-0.5, 0.5],
      wet: [1, 0.78, 1.05, 1.28],
      wetJitter: [0.94, 1.06],
      hallCap: 1.4,
    },
  },

};

// --- the set, and where a theme hands over ----------------------------------
//
// MEASURED (49 well-formed transitions): the theme lengths, the bimodal blend,
// the 16-bar line, the tempo that does not change across a seam, the key that
// is not mixed, the dip the mix is built around, the clean kick swap, the sub
// three decibels down, the filter that moves in half of them. The arithmetic
// that reads these is `setLayout` and `seamCurves` in src/set-plan.ts and
// `seamPlan` in src/performance.ts.

export const set = {
  // MEASURED theme length, as percentiles in bars: p10 / p25 / p50 / p75 / p90.
  themeBarPercentiles: [79, 118, 145, 167, 247],
  themeBarsMin: 64,
  themeBarsMax: 256,
  // MEASURED: bimodal. 70% short blends around 8 bars, 30% long ones.
  shortBlendChance: 0.7,
  shortBlendBars: [{ v: 8, w: 5 }, { v: 16, w: 3 }, { v: 12, w: 2 }],
  longBlendBars: [{ v: 32, w: 3 }, { v: 48, w: 2 }, { v: 64, w: 1 }],
  // MEASURED: transitions land on a 16-bar line at twice chance.
  boundaryBars: 16,
  // A skip is a musical cut, not an instant one: nothing in 49 measured
  // transitions is shorter than 2-3 bars of blend. Four bars, not eight: at
  // eight the low end did not change hands for nine seconds and the readout
  // did not move for twenty, which is long enough that pressing skip reads as
  // pressing nothing.
  skipBars: 4,
  // MEASURED: a filter moves in about half of all mixes, direction a coin flip.
  filterMoveChance: 0.5,
  outgoingLpHz: 520,
  outgoingHpHz: 300,
  // MEASURED: the sub runs about 3 dB down through the seam in half of them.
  seamSubTrimDb: -3,
  // MEASURED: the average level across a seam is 2.3 dB below the flanks. It
  // is also the headroom two decks need to pass through one limiter.
  seamSumTrimDb: -2.5,
  // GENRE: only one bass is ever prominent, so the swap is a downbeat. It used
  // to be the *last* bar of the transition, which is right for an eight-bar
  // blend and wrong for a sixty-four-bar one: the incoming theme spent two and
  // a half minutes with no kick and no bass under it, and what a listener
  // heard at the end of a theme was the old one still going with some extra
  // instruments floating over it — "it doesn't look like we have a continuous
  // hours mode yet". The bottom now changes hands eight bars into the blend,
  // whatever its length, and the outgoing theme plays out its harmonic layer
  // over the incoming groove from there.
  swapAfterBars: 8,
  // A cut is not a blend and it is not a wait either: it begins on the *next
  // beat*, not the next bar, and the low end changes hands on the first bar
  // line after that, so the bottom still arrives on a downbeat. A press used
  // to be answered on the next bar and swap a bar after that — three seconds
  // at 105 BPM, and four when the press just missed a line — which is long
  // enough that pressing NEXT read as pressing nothing and the hand pressed
  // again. The cut's own beat is the unit here; the swap is a line and not a
  // count of bars, so there is nothing left to tune.
  // How long the set's grid takes to reach a new theme's own tempo once the
  // theme it replaced has gone. MEASURED: the change across a seam is exactly
  // zero, so the move happens after the seam and not in it — sixteen bars,
  // linear in BPM, which for a tenth of a BPM is a move no one can hear and
  // the seam before it is exact. Since the fault pass of 09-24 it is the
  // drift's glide and the ceiling of every other: a near move glides a bar a
  // percent, and a far one is ridden before the blend (`seamTempo`).
  tempoGlideBars: 16,
  // Optional and off: the references do not mix in key.
  harmonicMixing: false,
  // Which hand-over groups a seam cuts holes in. They are the names the
  // *program* puts on an event — `pe.gap`, which a voice gets from the bus its
  // descriptor lands it on — so the rule is stated once, here, where the rest
  // of the seam's numbers are, and neither engine assumes that every kick owns
  // the hand-over or that the bass is called `sub`. `bassGroup` names the
  // graph's bus as well: `buses.<bassGroup>.dry.gain` is the send the seam
  // trims, and the hole and the trim are the same low end by construction.
  swapGroup: 'kick',
  bassGroup: 'sub',
  // Only used when harmonicMixing is turned on, which it is not by default.
  keySteps: [
    { v: 0, w: 4 },
    { v: 7, w: 3 },
    { v: 5, w: 3 },
    { v: 3, w: 2 },
    { v: 9, w: 2 },
  ],
  // MEASURED: the seam sits in the outgoing theme's last breakdown, and it lands
  // on a 16-bar line in 41% of the references against 19% by chance — the
  // strongest alignment there is.
  //
  // MEASURED, and the floor every other rule in `seamPlan` is measured against:
  // a transition begins in the outgoing theme's **last quarter**. "The last
  // breakdown past 55%" describes where a breakdown sits, not when a record is
  // finished with: on a 240-bar theme whose late breakdown began at bar 136 it
  // started the hand-over at bar 144 — 60% — and the theme's own build, its drop
  // and the last four minutes of its main groove were never heard on their own.
  // That is the seam Eugene marked at bar 146 of seed 15576, "a mix overlay but
  // we are not at the end of the track". So 75% of the length is a floor, and
  // the breakdown only decides *where* inside the last quarter the seam lands. A
  // long blend is what gives way, never the floor.
  seamFloor: 0.75,

};

// --- the figures ------------------------------------------------------------
//
// Four decisions the generator used to make by comparing a timbre against a
// name. Each is a list or a table here, so the engine tests membership of a
// style's list and never writes an instrument's name down; the outcome for
// every timbre in the catalogue is the outcome those comparisons had, and the
// program digest is the proof.

export const figures = {
  // MEASURED: 100% of the pluck tracks have a sustained pad under them, which
  // is what stops a dry short stab sounding thin, and 75% of the strings ones
  // have a stab over them. The piano joins the pluck in that rule for the same
  // reason and one more: a piano playing three notes a bar leaves 250 Hz - 2
  // kHz empty, and that band being empty was the largest single miss against
  // the benchmarks. A sustained floor under a sparse figure is both what the
  // records do and what fills it.
  padUnder: ['pluck', 'piano'],
  // MEASURED: 27% of all tracks carry a 4-7 Hz tremolo, and the electric piano
  // is where nearly all of it lives. A chance per timbre — and a timbre with no
  // row here never rolls the die at all, which is what keeps the `wet` stream's
  // draw count exactly where PLAN-SCALE's rule R3 found it.
  tremolo: { ep: 0.5 },
  // MEASURED: only the rare "swell" family really swells. Everything else
  // attacks in a few tens of milliseconds and holds.
  slowAttack: ['swell'],
  // The timbres that bring a figure of their own instead of playing the stab
  // grid. One: the piano, which plays an arpeggio or a written melody, takes
  // the melody role, writes its own line in the dice and goes to its own room
  // rather than to the stab's send.
  ownFigure: ['piano'],

};

// --- the loudness model's own numbers ---------------------------------------
//
// The coefficients, the target, the two slopes and the clamp are in
// `base.loudness` above, where the fit's date, its seed range and its residual
// are written beside them. What is here is the window rule's own number: the
// eight bars a theme is measured by, which is also the eight bars
// tools/loudness-fit.ts renders. The *model* — how a window is chosen, what
// the columns are, how a prediction becomes a trim — is engine and stays in
// src/loudness.ts.

export const loudness = { windowBars: 8 };

// --- the catalogue ----------------------------------------------------------
//
// Every ordered list a die of this style draws from, in one place. The lists
// that are nothing but a pool are written in `src/catalogue.ts`; the lists that
// live in the table above beside the measurement that produced them are named
// here by reference, under the name of the die that draws them.
//
// **The order of every list here is what the golden digest hashes.** A die is
// `floor(u * n)` over the list as it stands, so appending an entry moves about
// half of all seeds, reordering moves nearly all of them, and removing one
// moves the rest. `Rng.pickWeighted` is the sampler that makes a *disabled*
// entry free — it drops weight-0 entries before it draws — so the way to park
// an instrument in front of one of these is a weight of 0, never an append.

export const catalogue = {
  /** the rooms the preset die draws from — `dice('preset')`, one draw */
  rooms: ROOMS,
  /** how the chords are stacked — `dice('voicing')`, one draw. Unreachable */
  voicingStyles: VOICING_STYLES,
  /** the section glue and how wet it is — `dice('fx')`, one draw */
  fxPalettes: FX_PALETTES,
  /** what the density die's value is called on the ring */
  densityLabel: DENSITY_LABEL,
  /** the mined tables the figure dice draw from, in the order they were mined */
  masks: MASK_TABLES,
  /** which instrument leads a theme — `dice('timbre')`, weighted, one draw, and
   * `dice('timbre:again')` when the set refuses a second organ running */
  leadTimbres: base.timbre.lead,
  /** which of those lead from the sustained role rather than the rhythmic one.
   * Not drawn from: an eligibility test, and a membership change moves every
   * theme whose lead is in it */
  sustainedLeads: base.timbre.sustained,
  /** the companion under a lead stab, and over a lead pad — `dice('partner')`,
   * weighted, one draw of whichever list the lead's role leaves open */
  padPartners: base.timbre.padPartner,
  stabPartners: base.timbre.stabPartner,
  /** how much is allowed to happen at once — `dice('density')`, weighted */
  densities: base.density.weights,
  /** the twelve roots — `dice('key')`, one draw, before the minor/dorian chance */
  keyRoots: base.key.roots,
  /** how long the piano's melody is — `dice('melody')`, weighted, only when the
   * piano drew the melody role */
  melodyBars: base.piano.melodyBars,
};

// The gate's own walk over the lists above: one row per list, with the die that
// draws it, where it is written, and what its entries have to resolve to.
// `tools/check.ts` walks this; nothing on a sound path does.
const candidates = candidateLists(catalogue);

// The four lists fact 1 at the head of this file names. Written down so that
// nobody makes one reachable by accident.
const unreachable = ['voicingStyles', 'bassMasks', 'stabMasks', 'hatMasks'];

// --- the style --------------------------------------------------------------

export const style = {
  id: 'deep-house',
  label: 'deep house',
  base,
  // The base as one resolved, frozen value: no room, no overrides, no bypass.
  // It is what the parts of the machine that deliberately read the *style* and
  // not a theme's own room use — the tempo and key ranges a set is drawn from,
  // the timbre weights, the loudness coefficients — so that reading them costs
  // no clone and cannot be written to by accident.
  settings: resolveSettings({ base }),
  // The mined sequences this style speaks in: 51 coherent stretches, 2966
  // analysed bars, no audio and no samples. `src/corpus.ts` is a data module of
  // its own and this is where it is named as a style's vocabulary.
  corpus: CORPUS,
  rooms,
  sections,
  lanes,
  stage,
  set,
  figures,
  loudness,
  catalogue,
  candidates,
  unreachable,
  // What this record measured as: the signature of every candidate of every
  // list above, over the eight birds, out of a hundred and thirty-one themes
  // rendered and imprinted at the house. It is data and it is dated, so it is a
  // JSON file beside this one rather than a table in it — the one place in the
  // style where that is true, and it is true because nothing here was reasoned:
  // `tools/imprint/signatures.ts` wrote every number and can write them again.
  signatures,
} satisfies Style;

export default style;
