// Round KV1's voices, each alone against its own declared numbers, and each
// read back for what it claims to be.
//
//   node tools/test-voices-3.ts                     the whole suite
//   node tools/test-voices-3.ts --only reeseBass    one of them, for a fast loop
//   node tools/test-voices-3.ts --bless             write the measured loudness
//                                                    into the modules
//   node tools/test-voices-3.ts --verbose           every reading, as JSON
//
// Two halves.
//
// **The contract**, which is round K2's list unchanged and for the reason
// `test-voices-2.ts` gives — a contract enforced differently for a fifth table
// is not a contract: the voice alone through the real graph on its role's own
// figure, eight bars at 120 BPM after two of pre-roll, within a decibel of the
// loudness its module declares, in both engines and at both rates; a true
// peak and a sample peak at or under -1; no click by the scenes' own gate; the
// width the descriptor says; not one sample that is not a number.
//
// **The read-backs**, which are this round's own and are the brief's: *an
// engine test that renders it alone and reads back what it claims (pitch,
// envelope, spectrum).* A gate that proves a voice is inside its loudness says
// nothing about whether the reese moves or the 303 line glides, so every row
// of `CLAIMS` below is one note (or one short line) rendered alone and one
// sentence about it that the reading either bears out or does not. The numbers
// each claim is held to are written beside it with what they were measured at.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { playwright, launchOptions, renice, finish, listenOn } from './harness.ts';
import { updateRow } from './rows.ts';
import './lanes.ts';
import { KV1_VOICES, SCENES_3 } from './audition-voices-3.ts';
import { uncovered, coverage } from './tables.ts';
import { THIRDS } from './meter.ts';
import type { PlaywrightFound } from './harness.ts';
import type { ProgramEvent } from '../src/program.ts';
import type { Audition } from './audition.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');
// `/sounds/` is the rows the registry imports (rounds R1 and R2).
const ROOTS: Record<string, string> = { '/src/': SRC, '/tools/': HERE, '/sounds/': path.join(HERE, '..', 'sounds') };

const arg = (k: string, d: string | null = null): string | null => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const ONLY = arg('only');
const BLESS = process.argv.includes('--bless');
const VERBOSE = process.argv.includes('--verbose');
const ENGINES = (arg('engines') || 'chromium,firefox').split(',');
const RATES = (arg('rates') || '44100,48000').split(',').map(Number);
const WANT = KV1_VOICES.filter((id) => !ONLY || id === ONLY);

let failed = 0;
const skipped: string[] = [];
const ok = (what: string): void => console.log(`  ok    ${what}`);
const bad = (what: string): void => { failed++; console.log(`  FAIL  ${what}`); };
const must = (cond: boolean, why: string, what: string): void => (cond ? ok(what) : bad(why));

const GATES = {
  truePeakDbTP: -1,
  samplePeakDbFS: -1,
  clickStep: 0.05,
  clickRatio: 8,
  monoTolerance: 0.0002,
  loudnessBandDb: 1.0,
};

/** One note's reading, as the page takes it: what every claim is judged on. */
export interface NoteReading {
  /** the fundamental, by autocorrelation over the middle of the note's window */
  pitchHz: number;
  /** the same, over the first and the last fifth of the window: a glide's two ends */
  pitchStartHz: number;
  pitchEndHz: number;
  /** the note's window, integrated, and the level at the head and the tail of it */
  levelDb: number;
  headDb: number;
  tailDb: number;
  /** RMS in dBFS, 20 ms a frame, from the start of the render */
  frames: number[];
  /** the window's third-octave shares, in dB of the 40 Hz-10 kHz total */
  thirds: number[];
  centroid: number;
  /** the level of a band over 200 ms frames through the window, peak to trough, in dB */
  bandSwingDb: number;
  /** the share of the window's energy in the band, as a fraction */
  bandShare: number;
  /** where the render falls 60 dB under the window's own level, in seconds after the window */
  silentAfter: number | null;
  /** the peak of the render, dBFS */
  peak: number;
  /** the pitch over each of the job's probes, in hertz */
  pitches: number[];
  /** the third-octave shares over the first and the last fifth of the window */
  thirdsHead: number[];
  thirdsTail: number[];
  /** the lowest 20 ms frame over each probe, in dBFS: a dip where one note hands to the next */
  dips: number[];
  /** the side over the mid through the window, in dB: how wide it is */
  sideDb: number;
}

/** A note to render alone, and what it is asked. */
interface NoteJob {
  midi?: number;
  dur?: number;
  vel?: number;
  p?: Record<string, unknown>;
  /** the band `bandSwingDb` and `bandShare` read */
  band?: [number, number];
  /** a short line of notes instead of one: `[beat offset, semitones, length in beats, glide]` */
  line?: Array<[number, number, number, boolean]>;
  /** stretches of the window, in seconds from its start, to read a pitch over */
  probes?: Array<[number, number]>;
  /** the highest pitch a probe may read, so a slide's short window is not read as its own harmonic */
  probeTopHz?: number;
}

/** One claim: which voice, the note it is read on, and the sentence. */
interface Claim {
  voice: string;
  what: string;
  note: NoteJob;
  /** true or the reason it is not, and the reading said in words */
  holds: (r: NoteReading, all: Record<string, NoteReading>) => [boolean, string];
  /** the key other claims read this one's reading under */
  key?: string;
  /** the key of another claim's reading this one compares against */
  needs?: string;
}

const cents = (a: number, b: number): number => 1200 * Math.log2(a / b);
/** The share of a reading's energy between two frequencies, off its third-octave bands. */
const shareOf = (r: NoteReading | number[], lo: number, hi: number): number => {
  const t = Array.isArray(r) ? r : r.thirds;
  let s = 0; let tot = 0;
  THIRDS.forEach((fc, i) => { const p = Math.pow(10, t[i] / 10); if (fc >= 40 && fc <= 10000) tot += p; if (fc >= lo && fc <= hi) s += p; });
  return tot > 0 ? s / tot : 0;
};
/** How much of the upper band there is for each unit of the lower: a colour, whatever the level. */
const tilt = (r: NoteReading | number[], lower: [number, number], upper: [number, number]): number =>
  shareOf(r, upper[0], upper[1]) / Math.max(1e-9, shareOf(r, lower[0], lower[1]));
/** The 303 line's brightness: 700 Hz-5 kHz for each unit of 50-300 Hz. */
const squelch = (t: number[]): number => tilt(t, [50, 300], [700, 5000]);
const hzOf = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const f1 = (v: number): string => v.toFixed(1);

/**
 * **What each voice claims, and the reading that bears it out.** Every
 * threshold is stated with what it was measured at and how far it stands from
 * that, so a threshold is a floor under a measurement and never a hope.
 */
const CLAIMS: Claim[] = [
  // --- the reese --------------------------------------------------------------
  //
  // Read on A1 (MIDI 33, 55 Hz), the bottom of the brief's 28-45. MEASURED in
  // Chromium at 48 kHz when the thresholds were written: 55.0 Hz; 6.1 % of the
  // energy in 300-900 Hz swinging 5.5 dB over a four-second note; the head and
  // the tail of a held note 1 dB apart and 60 dB down 0.16 s after it; 74 % of
  // the energy under 80 Hz.
  {
    voice: 'reeseBass', key: 'reese', what: 'its pitch is the note: A1 read at 55 Hz',
    note: { midi: 33, dur: 2 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(33))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(33)))} cents off 55`],
  },
  {
    voice: 'reeseBass', what: 'the mid-range a reese is for, and it moves: the 300-900 Hz band holds a share of the note and swings over it',
    note: { midi: 33, dur: 4, band: [300, 900] },
    holds: (r) => [r.bandShare > 0.04 && r.bandSwingDb > 3,
      `${(r.bandShare * 100).toFixed(1)} % of the energy in 300-900 Hz, swinging ${f1(r.bandSwingDb)} dB over 200 ms frames`],
  },
  {
    voice: 'reeseBass', what: 'the weight holds for the note, where three drifting fundamentals would cancel, and is gone after its release',
    note: { midi: 33, dur: 1.5 },
    holds: (r) => [Math.abs(r.tailDb - r.headDb) < 3 && r.silentAfter != null && r.silentAfter < 0.3,
      `head ${f1(r.headDb)} dB, tail ${f1(r.tailDb)} dB; 60 dB down ${r.silentAfter == null ? 'never' : `${r.silentAfter.toFixed(2)} s`} after the note`],
  },
  {
    voice: 'reeseBass', what: 'the sine is under it: half the energy or more is under 80 Hz',
    note: { midi: 33, dur: 2, band: [40, 80] },
    holds: (r) => [r.bandShare > 0.5, `${(r.bandShare * 100).toFixed(1)} % of the energy in 40-80 Hz`],
  },
  {
    voice: 'reeseBass', key: 'reeseTop', what: 'the filter keeps the fizz off: little over 1 kHz',
    note: { midi: 33, dur: 2, band: [1000, 5000] },
    holds: (r) => [r.bandShare < 0.02, `${(r.bandShare * 100).toFixed(2)} % of the energy in 1-5 kHz`],
  },
  {
    voice: 'reeseBass', key: 'reeseOpen', needs: 'reeseTop', what: 'its corner is a knob: opened to 1700 Hz, more of the saws comes through over 1 kHz',
    note: { midi: 33, dur: 2, p: { knobs: { brightnessHz: 1700 } } },
    holds: (r, all) => {
      const open = tilt(r, [300, 900], [1000, 5000]);
      const shut = all.reeseTop ? tilt(all.reeseTop, [300, 900], [1000, 5000]) : NaN;
      return [open > shut * 1.5, `${open.toFixed(3)} of 1-5 kHz for each unit of 300-900 Hz, against ${shut.toFixed(3)} at the default corner`];
    },
  },
  // --- the sine line (10-06, the liquid place) ------------------------------------
  //
  // Read on A1 like the reese. The line is a clean sine (source 9's: the growl a mix
  // reading gave it was the pad's), its harmonics 30 dB and more under the fundamental.
  // Since the liquid bass rounds (10-07) a second sine 6.59 Hz over it at a third of its
  // level beats with it, which the autocorrelation reads as no period at all: the pitch
  // is read with the pair aside (`subBeatLevel` nought, a control a note may write).
  {
    voice: 'reeseSub', what: 'its pitch is the note: A1 read at 55 Hz, its pair aside',
    note: { midi: 33, dur: 2, p: { subBeatLevel: 0 } },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(33))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(33)))} cents off 55`],
  },
  {
    voice: 'reeseSub', what: 'a clean sine: next to nothing over 300 Hz',
    note: { midi: 33, dur: 2, band: [300, 5000] },
    holds: (r) => [r.bandShare < 0.02, `${(r.bandShare * 100).toFixed(2)} % of the energy in 300 Hz-5 kHz`],
  },
  // --- the deep reese (round DNB-1) --------------------------------------------
  {
    voice: 'reeseDeep', what: 'its pitch is the note: A1 read at 55 Hz',
    note: { midi: 33, dur: 2 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(33))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(33)))} cents off 55`],
  },
  {
    voice: 'reeseDeep', key: 'reeseDeepLow', what: 'the sine carries the note: more of the energy under 80 Hz than the reese keeps there',
    note: { midi: 33, dur: 2, band: [40, 80] },
    holds: (r) => [r.bandShare > 0.85, `${(r.bandShare * 100).toFixed(1)} % of the energy in 40-80 Hz`],
  },
  {
    voice: 'reeseDeep', what: 'and the roll is still over it, under the reese\'s: the 300-900 Hz band holds half a percent or more and swings over a held note',
    note: { midi: 33, dur: 4, band: [300, 900] },
    holds: (r) => [r.bandShare > 0.005 && r.bandSwingDb > 3,
      `${(r.bandShare * 100).toFixed(2)} % of the energy in 300-900 Hz, swinging ${f1(r.bandSwingDb)} dB over 200 ms frames`],
  },
  // --- the driven reese ------------------------------------------------------
  {
    voice: 'reeseDriven', what: 'its pitch is the note: A1 read at 55 Hz',
    note: { midi: 33, dur: 2 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(33))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(33)))} cents off 55`],
  },
  {
    voice: 'reeseBass', key: 'reeseRollOpen', what: 'at the driven twin\'s corner it still rolls: the 300-900 Hz band swings over a held note',
    note: { midi: 33, dur: 4, band: [300, 900], p: { knobs: { brightnessHz: 1700 } } },
    holds: (r) => [r.bandSwingDb > 3, `${(r.bandShare * 100).toFixed(1)} % of the energy in 300-900 Hz, swinging ${f1(r.bandSwingDb)} dB; a crest factor of ${f1(r.peak - r.levelDb)} dB`],
  },
  {
    voice: 'reeseDriven', needs: 'reeseRollOpen', what: 'the clip squares the saws and keeps the mid-range: a crest factor 2 dB or more under the clean reese\'s at the same corner, and as much of 300-900 Hz',
    note: { midi: 33, dur: 4, band: [300, 900] },
    holds: (r, all) => {
      const o = all.reeseRollOpen;
      const mine = r.peak - r.levelDb;
      const theirs = o ? o.peak - o.levelDb : NaN;
      return [mine <= theirs - 2 && !!o && r.bandShare >= o.bandShare * 0.8,
        `a crest factor of ${f1(mine)} dB against ${f1(theirs)}; ${(r.bandShare * 100).toFixed(1)} % of the energy in 300-900 Hz against ${o ? (o.bandShare * 100).toFixed(1) : '—'} %`];
    },
  },
  // --- the wobble reese (rounds DUB-1..4) -------------------------------------
  //
  // The deep half-time place's line: the sine carries the low end and the saws
  // sweep over it (corner 380 Hz, 0.82 deep, 2 dB of resonance, a light clip in
  // front). Read on A1 (MIDI 33, 55 Hz). MEASURED in Chromium at 48 kHz when
  // the thresholds were written (10-04): 55.0 Hz; 99.9 % of the energy under
  // 80 Hz (the sine at 2.5 over saws at 1.2 behind the corner); 0.02 % of it in
  // 300-900 Hz, swinging 30 dB over a four-second note as the corner sweeps.
  {
    voice: 'reeseWobble', what: 'its pitch is the note: A1 read at 55 Hz',
    note: { midi: 33, dur: 2 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(33))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(33)))} cents off 55`],
  },
  {
    voice: 'reeseWobble', what: 'the sine carries the note: more of the energy under 80 Hz than the reese keeps there',
    note: { midi: 33, dur: 2, band: [40, 80] },
    holds: (r) => [r.bandShare > 0.5, `${(r.bandShare * 100).toFixed(1)} % of the energy in 40-80 Hz`],
  },
  {
    voice: 'reeseWobble', what: 'and the wobble is over it: the 300-900 Hz band holds a share of a held note and swings over it as the corner sweeps',
    note: { midi: 33, dur: 4, band: [300, 900] },
    holds: (r) => [r.bandShare > 0.0001 && r.bandSwingDb > 10,
      `${(r.bandShare * 100).toFixed(3)} % of the energy in 300-900 Hz, swinging ${f1(r.bandSwingDb)} dB over 200 ms frames`],
  },
  // --- the 303 line ---------------------------------------------------------
  {
    voice: 'line303', what: 'its pitch is the note: C2 read at 65.4 Hz',
    note: { midi: 36, dur: 0.5 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(36))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(36)))} cents off 65.4`],
  },
  {
    voice: 'line303', key: 'linePlain', what: 'the squelch: the corner is thrown open on the strike and falls, so the head of a note is brighter than its tail',
    note: { midi: 36, dur: 1, vel: 0.8, band: [300, 700] },
    holds: (r) => [squelch(r.thirdsHead) > squelch(r.thirdsTail) * 3,
      `${squelch(r.thirdsHead).toFixed(3)} of 700 Hz-5 kHz for each unit of 50-300 Hz over the note's first fifth, ${squelch(r.thirdsTail).toFixed(3)} over its last`],
  },
  {
    voice: 'line303', needs: 'linePlain', what: 'an accent is louder and throws the corner further than the same note unaccented',
    note: { midi: 36, dur: 1, vel: 0.8, p: { accent: 1 } },
    holds: (r, all) => {
      const o = all.linePlain;
      return [!!o && r.levelDb > o.levelDb + 2.5 && squelch(r.thirdsHead) > squelch(o.thirdsHead) * 1.1,
        `${f1(r.levelDb)} dB against ${o ? f1(o.levelDb) : '—'}; ${squelch(r.thirdsHead).toFixed(3)} of 700 Hz-5 kHz per unit of 50-300 Hz over the head against ${o ? squelch(o.thirdsHead).toFixed(3) : '—'}`];
    },
  },
  {
    voice: 'line303', needs: 'linePlain', what: 'the resonance is a knob: at 4 dB the band round the corner holds less of the note than at the default 14',
    note: { midi: 36, dur: 1, vel: 0.8, band: [300, 700], p: { knobs: { resonanceDb: 4 } } },
    holds: (r, all) => {
      const o = all.linePlain;
      return [!!o && r.bandShare < o.bandShare * 0.8, `${(r.bandShare * 100).toFixed(1)} % of the energy in 300-700 Hz against ${o ? (o.bandShare * 100).toFixed(1) : '—'} % at the default`];
    },
  },
  {
    voice: 'line303', what: 'a tied note glides and does not strike again: C2 slid to C3 over 0.2 s passes between them, lands on C3, and the level does not dip at the tie',
    note: {
      midi: 36, vel: 0.8, p: { knobs: { glide: 0.2 } },
      line: [[0, 0, 1, false], [1, 12, 1.5, true]],
      probes: [[0.15, 0.4], [0.56, 0.62], [0.95, 1.2], [0.46, 0.56]], probeTopHz: 400,
    },
    holds: (r) => {
      const [from, mid, to] = r.pitches;
      const dip = r.dips[3] - r.dips[0];
      return [Math.abs(cents(from, hzOf(36))) < 20 && mid > hzOf(36) * 1.12 && mid < hzOf(48) * 0.9 && Math.abs(cents(to, hzOf(48))) < 20 && dip > -4,
        `${f1(from)} Hz on the first note, ${f1(mid)} Hz 40-100 ms into the slide, ${f1(to)} Hz on the second; the tie's lowest frame ${f1(dip)} dB against the first note's`];
    },
  },
  // --- the shimmer ------------------------------------------------------------
  {
    voice: 'shimmerPad', key: 'shimmer', what: 'it lives above 2 kHz: most of a held C5 is in 2-10 kHz',
    note: { midi: 72, dur: 3, band: [2000, 10000] },
    holds: (r) => [r.bandShare > 0.75, `${(r.bandShare * 100).toFixed(1)} % of the energy in 2-10 kHz`],
  },
  {
    voice: 'shimmerPad', what: 'its pitch is the note\'s octave: C5 read at 1046.5 Hz or 2093 Hz',
    note: { midi: 72, dur: 3, probes: [[0.8, 1.0]], probeTopHz: 4000 },
    holds: (r) => {
      const c = Math.min(Math.abs(cents(r.pitches[0], hzOf(84))), Math.abs(cents(r.pitches[0], hzOf(96))));
      return [c < 25, `${f1(r.pitches[0])} Hz, ${f1(c)} cents off the nearer octave`];
    },
  },
  {
    voice: 'shimmerPad', needs: 'shimmer', what: 'the octaves climb: the loop moves the note\'s energy up, 4-10 kHz for each unit of 1-3 kHz grows from its head to its tail',
    note: { midi: 72, dur: 3 },
    holds: (r) => {
      const head = tilt(r.thirdsHead, [1000, 3000], [4000, 10000]);
      const tail = tilt(r.thirdsTail, [1000, 3000], [4000, 10000]);
      return [tail > head * 1.3, `${head.toFixed(3)} of 4-10 kHz per unit of 1-3 kHz over the first fifth, ${tail.toFixed(3)} over the last`];
    },
  },
  {
    voice: 'shimmerPad', needs: 'shimmer', what: 'the pitched share is a knob: at 0.1 less of it climbs to 4-10 kHz than at the default',
    note: { midi: 72, dur: 3, p: { knobs: { shift: 0.1 } } },
    holds: (r, all) => {
      const mine = tilt(r, [1000, 3000], [4000, 10000]);
      const theirs = all.shimmer ? tilt(all.shimmer, [1000, 3000], [4000, 10000]) : NaN;
      return [mine < theirs * 0.8, `${mine.toFixed(3)} of 4-10 kHz per unit of 1-3 kHz against ${theirs.toFixed(3)} at the default`];
    },
  },
  {
    voice: 'shimmerPad', what: 'it rings out after the note and is gone inside the tail it states',
    note: { midi: 72, dur: 2 },
    holds: (r) => [r.silentAfter != null && r.silentAfter > 0.3 && r.silentAfter < 0.6 + 2.2 + 0.3,
      `60 dB down ${r.silentAfter == null ? 'never' : `${r.silentAfter.toFixed(2)} s`} after the note (its release 0.6 s and its loop's 2.2 s)`],
  },
  // --- the supersaw lead -------------------------------------------------------
  {
    voice: 'supersawLead', what: 'its pitch is the note: A4 read at 440 Hz',
    note: { midi: 69, dur: 2 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(69))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(69)))} cents off 440`],
  },
  {
    voice: 'supersawLead', key: 'saw', what: 'it holds for the whole note and is never struck again: its tail within 2 dB of its head (a decay leg would be 6 or more; the 1.4 measured is the seven saws beating)',
    note: { midi: 69, dur: 3 },
    holds: (r) => [Math.abs(r.tailDb - r.headDb) <= 2, `head ${f1(r.headDb)} dB, tail ${f1(r.tailDb)} dB`],
  },
  {
    voice: 'supersawLead', needs: 'saw', what: 'its filter opens as it holds: 2-8 kHz for each unit of 200 Hz-1 kHz grows from its head to its tail',
    note: { midi: 69, dur: 3 },
    holds: (r) => {
      const head = tilt(r.thirdsHead, [200, 1000], [2000, 8000]);
      const tail = tilt(r.thirdsTail, [200, 1000], [2000, 8000]);
      return [tail > head * 2, `${head.toFixed(3)} of 2-8 kHz per unit of 200 Hz-1 kHz over the first fifth, ${tail.toFixed(3)} over the last`];
    },
  },
  {
    voice: 'supersawLead', what: 'it is wide: the side is within 12 dB of the mid',
    note: { midi: 69, dur: 2 },
    holds: (r) => [r.sideDb > -12, `the side ${f1(r.sideDb)} dB against the mid`],
  },
  // --- the siren --------------------------------------------------------------
  {
    voice: 'siren', what: 'it glides: C5 read at the strike, between C5 and C6 a quarter of the way through, C6 once the glide is done',
    note: { midi: 72, dur: 1, probes: [[0.005, 0.045], [0.23, 0.27], [0.7, 0.95]], probeTopHz: 3000 },
    holds: (r) => {
      const [a, m, z] = r.pitches;
      return [Math.abs(cents(a, hzOf(72))) < 60 && m > hzOf(72) * 1.15 && m < hzOf(84) * 0.87 && Math.abs(cents(z, hzOf(84))) < 15,
        `${f1(a)} Hz at the strike, ${f1(m)} Hz a quarter through, ${f1(z)} Hz at the end`];
    },
  },
  {
    voice: 'siren', what: 'a note with down glides the other way: C5 falls to C4',
    note: { midi: 72, dur: 1, p: { down: 1 }, probes: [[0.7, 0.95]], probeTopHz: 3000 },
    holds: (r) => [Math.abs(cents(r.pitches[0], hzOf(60))) < 15, `${f1(r.pitches[0])} Hz at the end, ${f1(cents(r.pitches[0], hzOf(60)))} cents off C4`],
  },
  {
    voice: 'siren', what: 'the span is a knob: at 1.5 it lands a fifth up',
    note: { midi: 72, dur: 1, p: { knobs: { span: 1.5 } }, probes: [[0.7, 0.95]], probeTopHz: 3000 },
    holds: (r) => [Math.abs(cents(r.pitches[0], hzOf(72) * 1.5)) < 15, `${f1(r.pitches[0])} Hz at the end, ${f1(cents(r.pitches[0], hzOf(72) * 1.5))} cents off a fifth over C5`],
  },
  {
    voice: 'siren', what: 'it holds its level for the note: its tail within 2 dB of its head',
    note: { midi: 72, dur: 1.5 },
    holds: (r) => [Math.abs(r.tailDb - r.headDb) <= 2, `head ${f1(r.headDb)} dB, tail ${f1(r.tailDb)} dB`],
  },
  // --- the struck organ --------------------------------------------------------
  {
    voice: 'organStab', what: 'its pitch is the note: A4 read at 440 Hz',
    note: { midi: 69, dur: 1 },
    holds: (r) => [Math.abs(cents(r.pitchHz, hzOf(69))) < 15, `${f1(r.pitchHz)} Hz, ${f1(cents(r.pitchHz, hzOf(69)))} cents off 440`],
  },
  {
    voice: 'organStab', what: 'it is struck: its loudest 20 ms on the strike 6 dB or more over its held tail',
    note: { midi: 69, dur: 1 },
    holds: (r) => {
      const strike = Math.max(...r.frames.slice(25, 30));
      return [strike - r.tailDb >= 6, `the strike ${f1(strike)} dB, the tail ${f1(r.tailDb)} dB`];
    },
  },
  {
    voice: 'organStab', what: 'its drawbars are harmonics: the third of the note (1320 Hz) holds energy the band a tritone off it (1000 Hz) does not',
    note: { midi: 69, dur: 1 },
    holds: (r) => {
      const at = (fc: number) => r.thirds[THIRDS.indexOf(fc)];
      return [at(1250) - at(1000) > 10, `${f1(at(1250))} dB in the 1.25 kHz third against ${f1(at(1000))} dB in the 1 kHz third`];
    },
  },
  {
    voice: 'organStab', key: 'organClick', what: 'the key click at its loudest: the strike\'s first 20 ms',
    note: { midi: 69, dur: 1, p: { knobs: { click: 3 } } },
    holds: (r) => [true, `${f1(r.frames[25])} dB over the first 20 ms`],
  },
  {
    voice: 'organStab', needs: 'organClick', what: 'the key click is a knob: at 0.1 the strike\'s first 20 ms are quieter than at 3',
    note: { midi: 69, dur: 1, p: { knobs: { click: 0.1 } } },
    holds: (r, all) => {
      const o = all.organClick;
      return [!!o && o.frames[25] - r.frames[25] >= 1, `${f1(r.frames[25])} dB over the first 20 ms against ${o ? f1(o.frames[25]) : '—'} at 3`];
    },
  },
  // --- the echo send (a treatment, read on the struck organ) ----------------
  {
    voice: 'organStab', key: 'dryStab', what: 'without an echo, a dotted eighth after the stab is 30 dB under it (what is left is the record\'s own short delay and room)',
    note: { midi: 69, dur: 0.1 },
    holds: (r) => [r.frames[44] < r.frames[25] - 30, `${f1(r.frames[25])} dB on the strike, ${f1(r.frames[44])} dB a dotted eighth (0.375 s) after it`],
  },
  {
    voice: 'organStab', needs: 'dryStab', what: 'a note sent to the echo repeats on the dotted eighth, darker and quieter each time',
    note: { midi: 69, dur: 0.1, p: { echo: 1 } },
    holds: (r, all) => {
      // Frames are 20 ms from the render's start and the note is at 0.5 s:
      // the repeats land at 0.875, 1.25 and 1.625 s, frames 43-44, 62-63, 81-82.
      const at = (t: number) => Math.max(r.frames[Math.floor(t / 0.02)], r.frames[Math.floor(t / 0.02) + 1]);
      const between = (t: number) => r.frames[Math.floor(t / 0.02)];
      const [e1, e2, e3] = [at(0.875), at(1.25), at(1.625)];
      const gap = between(1.06);
      const dry = all.dryStab ? Math.max(all.dryStab.frames[43], all.dryStab.frames[44]) : NaN;
      return [e1 > gap + 6 && e2 < e1 && e3 < e2 && e1 > dry + 20,
        `repeats at ${f1(e1)}, ${f1(e2)}, ${f1(e3)} dB against ${f1(gap)} dB between the first two, and ${f1(dry)} dB at the first repeat's place with no echo`];
    },
  },
];

// --- 1. node: the tables against the registry --------------------------------
console.log('the fixtures, without a browser');
must(
  !uncovered().length,
  `the scene tables and the registry disagree: ${uncovered().join(', ')}`,
  `every registered voice has a fixture and every fixture names a registered voice: ${coverage()}`
);
{
  const noClaim = KV1_VOICES.filter((id) => !CLAIMS.some((c) => c.voice === id));
  must(!noClaim.length, `${noClaim.join(', ')} claims nothing a render can bear out`,
    `${SCENES_3.length} rows, every one with a read-back: ${CLAIMS.length} claims over ${new Set(CLAIMS.map((c) => c.voice)).size} voices`);
}

// --- the page ---------------------------------------------------------------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url!, 'http://127.0.0.1').pathname);
  if (name === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>voices</title>'); return; }
  const root = Object.keys(ROOTS).find((r) => name.startsWith(r));
  const file = root ? path.join(ROOTS[root], name.slice(root.length)) : null;
  if (!file || !file.startsWith(ROOTS[root!]) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('.ts')) body = Buffer.from(stripTypeScriptTypes(body.toString('utf8'), { mode: 'strip' }));
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
const PORT = await listenOn(server, Number(process.env.ENGINE_VOICES3_PORT) || 0);
const BASE = `http://127.0.0.1:${PORT}/`;

interface RunJob {
  base: string;
  kind: 'scene' | 'note';
  id: string;
  rate: number;
  note?: NoteJob;
}

// Everything below runs in the page: serialised on its way there, so it closes
// over nothing and imports what it needs by URL.
const RUN = async (job: RunJob) => {
  const S = job.base;
  const [G, MA, VO, SC, PL, AU, ME] = await Promise.all([
    import(`${S}src/graph.ts`),
    import(`${S}src/master.ts`),
    import(`${S}src/voices/index.ts`),
    import(`${S}src/schedule.ts`),
    import(`${S}src/scheduler.ts`),
    import(`${S}tools/audition-voices-3.ts`),
    import(`${S}tools/meter.ts`),
  ]);
  const rate = job.rate;
  const began = performance.now();
  const round = (v: number, n = 2): number => +v.toFixed(n);
  const db = (v: number): number => round(20 * Math.log10(v + 1e-30));
  type Ch = [Float32Array, Float32Array];
  const channels = (buf: AudioBuffer, from = 0, to: number | null = null): Ch => {
    const a = Math.max(0, Math.round(from * buf.sampleRate));
    const b = Math.min(buf.length, Math.round((to == null ? buf.duration : to) * buf.sampleRate));
    return [buf.getChannelData(0).slice(a, b), buf.getChannelData(1).slice(a, b)];
  };
  const rms = ([L, R]: Ch): number => {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    return Math.sqrt(s / Math.max(1, 2 * L.length));
  };
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
    const aud = AU.voiceAudition3(job.id);
    const { buf, duck } = await play(aud);
    const voice = AU.scene3Of(job.id).voice;
    const level = (aud.program.settings.levels as Record<string, number>)[VO.VOICE_LEVEL[voice]];
    const win = channels(buf, aud.window.from, aud.window.to);
    const withTail = channels(buf, aud.window.from);
    const onsets = aud.program.events.filter((e: ProgramEvent) => e.t >= aud.window.from).map((e: ProgramEvent) => e.t - aud.window.from);
    const lufs = ME.integratedLoudness(win, rate);
    let gap = 0;
    let badN = 0;
    for (let i = 0; i < withTail[0].length; i++) {
      const d = Math.abs(withTail[0][i] - withTail[1][i]);
      if (d > gap) gap = d;
      if (!Number.isFinite(withTail[0][i])) badN++;
      if (!Number.isFinite(withTail[1][i])) badN++;
    }
    const clicks = ME.clicks(withTail, rate, onsets);
    const click = clicks.reduce((a: { step: number; ratio: number; t: number }, c: { step: number; ratio: number; t: number }) => (c.step > a.step ? c : a), { step: 0, ratio: 0, t: 0 });
    return {
      rate, ms: Math.round(performance.now() - began), hits: onsets.length,
      loudnessDb: round(lufs - level),
      declared: VO.TIMBRES[job.id] ? VO.TIMBRES[job.id].loudnessDb : null,
      mono: VO.BY_NAME[voice].mono,
      truePeak: ME.truePeak(withTail), peak: db(ME.samplePeak(withTail)),
      gap: round(gap, 6), bad: badN, click, duck,
    };
  }

  // --- one note (or one short line), alone, and what it reads as ------------
  const n = job.note || {};
  let aud: Audition;
  let from: number;
  let to: number;
  if (n.line) {
    // A line of tied notes: each note's length is its own, and the ones marked
    // glide slide in from the note before. Built on the one-note fixture so
    // the gain, the level and the program are the same arithmetic.
    const one = AU.oneNote3(job.id, { midi: n.midi, dur: 0.1, vel: n.vel ?? 0.9, p: n.p });
    const beat = 0.5;
    const base = one.program.events[0];
    const events = n.line.map(([at, semis, len, glide], i: number) => ({
      ...base, i, t: 0.5 + at * beat, onset: 0.5 + at * beat,
      p: { ...base.p, midi: (n.midi ?? 36) + semis, dur: len * beat,
        ...(glide && i > 0 ? { glideFrom: (n.midi ?? 36) + n.line![i - 1][1] } : {}) },
    }));
    const last = n.line[n.line.length - 1];
    from = 0.5;
    to = 0.5 + (last[0] + last[2]) * beat;
    aud = { ...one, program: { ...one.program, events, duration: to + 4 }, window: { from, to } };
  } else {
    aud = AU.oneNote3(job.id, { midi: n.midi, dur: n.dur ?? 1, vel: n.vel ?? 0.9, p: n.p });
    from = aud.window.from;
    to = aud.window.to;
  }
  const { buf } = await play(aud);
  const win = channels(buf, from, to);
  const mono = new Float32Array(win[0].length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (win[0][i] + win[1][i]);

  // The fundamental, by normalised autocorrelation over a stretch of the
  // window: the lag of the first peak that is nearly as good as the best, so a
  // saw's octave does not win over its own period.
  const pitchOf = (x: Float32Array, lo = 25, hi = 2000): number => {
    const minLag = Math.floor(rate / hi);
    const maxLag = Math.min(Math.floor(rate / lo), Math.floor(x.length / 2));
    const r = new Float64Array(maxLag + 2);
    let e0 = 0;
    for (let i = 0; i < x.length - maxLag; i++) e0 += x[i] * x[i];
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      let s = 0; let e1 = 0;
      for (let i = 0; i < x.length - maxLag; i++) { s += x[i] * x[i + lag]; e1 += x[i + lag] * x[i + lag]; }
      r[lag] = s / Math.sqrt(e0 * e1 + 1e-30);
    }
    let best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (r[lag] > r[best]) best = lag;
    // the first local peak within 5 % of the best
    for (let lag = minLag + 1; lag < best; lag++) {
      if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > r[best] * 0.95) { best = lag; break; }
    }
    const a = r[best - 1] ?? r[best], b = r[best], c = r[best + 1] ?? r[best];
    const den = a - 2 * b + c;
    const shift = den !== 0 ? 0.5 * (a - c) / den : 0;
    return rate / (best + shift);
  };
  const slice = (a: number, b: number) => mono.slice(Math.floor(a * mono.length), Math.floor(b * mono.length));
  const pitchHz = pitchOf(slice(0.3, 0.7));
  const pitchStartHz = pitchOf(slice(0.02, 0.22));
  const pitchEndHz = pitchOf(slice(0.78, 0.98));

  const frameN = Math.round(0.02 * rate);
  const all: Ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const frames: number[] = [];
  for (let i = 0; i + frameN <= all[0].length; i += frameN) {
    let s = 0;
    for (let k = i; k < i + frameN; k++) s += all[0][k] * all[0][k] + all[1][k] * all[1][k];
    frames.push(db(Math.sqrt(s / (2 * frameN))));
  }
  const levelDb = db(rms(win));
  const headDb = db(rms([win[0].slice(Math.floor(win[0].length * 0.1), Math.floor(win[0].length * 0.3)), win[1].slice(Math.floor(win[1].length * 0.1), Math.floor(win[1].length * 0.3))]));
  const tailDb = db(rms([win[0].slice(Math.floor(win[0].length * 0.7), Math.floor(win[0].length * 0.9)), win[1].slice(Math.floor(win[1].length * 0.7), Math.floor(win[1].length * 0.9))]));
  // Where the render falls 60 dB under the window's level, counted from the
  // window's end: the envelope's release and whatever rings after it.
  let silentAfter: number | null = null;
  const endFrame = Math.ceil(to / 0.02);
  for (let f = endFrame; f < frames.length; f++) {
    if (frames.slice(f).every((v) => v < levelDb - 60)) { silentAfter = round(f * 0.02 - to, 3); break; }
  }
  const thirds = ME.thirdOctaves(win[0], win[1], rate);
  const centroidOf = (t: number[]): number => {
    let num = 0, den = 0;
    ME.THIRDS.forEach((fc: number, i: number) => { const p = Math.pow(10, t[i] / 10); num += fc * p; den += p; });
    return den > 0 ? Math.round(num / den) : 0;
  };
  const centroid = centroidOf(thirds);
  const part = (a: number, b: number): Ch => [win[0].slice(Math.floor(a * win[0].length), Math.floor(b * win[0].length)), win[1].slice(Math.floor(a * win[1].length), Math.floor(b * win[1].length))];
  const thirdsHead = ME.thirdOctaves(...part(0, 0.2), rate);
  const thirdsTail = ME.thirdOctaves(...part(0.8, 1), rate);
  const pitches = (n.probes || []).map(([a, b]) => round(pitchOf(mono.slice(Math.floor(a * rate), Math.floor(b * rate)), 25, n.probeTopHz ?? 2000)));
  const dips = (n.probes || []).map(([a, b]) => {
    const f0 = Math.floor((from + a) / 0.02), f1 = Math.ceil((from + b) / 0.02);
    return Math.min(...frames.slice(f0, f1));
  });
  let bandShare = 0;
  let bandSwingDb = 0;
  if (n.band) {
    const [lo, hi] = n.band;
    const share = (t: number[]) => {
      let s = 0; let tot = 0;
      ME.THIRDS.forEach((fc: number, i: number) => { const p = Math.pow(10, t[i] / 10); if (fc >= 40 && fc <= 10000) tot += p; if (fc >= lo && fc <= hi) s += p; });
      return tot > 0 ? s / tot : 0;
    };
    bandShare = round(share(thirds), 4);
    // The band's own level, frame by frame: the window's third-octave shares
    // times the frame's own energy, over 200 ms frames.
    const fN = Math.round(0.2 * rate);
    const levels: number[] = [];
    for (let i = 0; i + fN <= win[0].length; i += Math.round(fN / 2)) {
      const L = win[0].slice(i, i + fN), R = win[1].slice(i, i + fN);
      const t = ME.thirdOctaves(L, R, rate);
      const e = rms([L, R]);
      levels.push(10 * Math.log10(share(t) * e * e + 1e-30));
    }
    if (levels.length > 1) bandSwingDb = round(Math.max(...levels) - Math.min(...levels));
  }
  return {
    rate, ms: Math.round(performance.now() - began),
    pitchHz: round(pitchHz), pitchStartHz: round(pitchStartHz), pitchEndHz: round(pitchEndHz),
    levelDb, headDb, tailDb, frames, thirds, centroid, bandShare, bandSwingDb, silentAfter,
    peak: db(ME.samplePeak(channels(buf))),
    pitches, thirdsHead, thirdsTail, dips,
    sideDb: (() => {
      let m = 0; let sd = 0;
      for (let i = 0; i < win[0].length; i++) { const a = 0.5 * (win[0][i] + win[1][i]); const b = 0.5 * (win[0][i] - win[1][i]); m += a * a; sd += b * b; }
      return round(10 * Math.log10((sd + 1e-30) / (m + 1e-30)));
    })(),
  };
};

// --- 2. every row, in every engine, at both rates; and the claims ----------
let pw: PlaywrightFound | null = null;
try {
  pw = await playwright();
  console.log(`  ${pw.label}`);
} catch (e) {
  skipped.push(`the voice scenes: ${(e as Error).message.split('\n')[0]}`);
}

interface Reading { engine: string; rate: number; loudnessDb: number }
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
      if (VERBOSE) console.log(`        ${job.kind} ${job.id}@${job.rate} ${JSON.stringify({ ...out, frames: undefined, thirds: undefined })}`);
      if (errors.length) bad(`${job.kind} ${job.id} in ${engine}: the page threw: ${errors.join(' | ')}`);
      return out;
    };

    for (const id of WANT) {
      for (const rate of RATES) {
        const r = await run({ kind: 'scene', id, rate });
        (measured[id] = measured[id] || []).push({ engine, rate, loudnessDb: r.loudnessDb });
        const off = Math.abs(r.loudnessDb - r.declared);
        const widthOk = r.mono ? r.gap <= GATES.monoTolerance : r.gap > GATES.monoTolerance;
        const clicked = r.click.step > GATES.clickStep && r.click.ratio > GATES.clickRatio;
        must(
          r.bad === 0 && (BLESS || off <= GATES.loudnessBandDb) && widthOk && r.truePeak <= GATES.truePeakDbTP &&
            r.peak <= GATES.samplePeakDbFS && !clicked && r.duck === 1,
          `${id} at ${rate}: ${r.bad ? `${r.bad} samples that are not numbers; ` : ''}${off > GATES.loudnessBandDb ? `${r.loudnessDb} dB against the declared ${r.declared}; ` : ''}${widthOk ? '' : `it declares ${r.mono ? 'mono' : 'stereo'} and its channels differ by ${r.gap}; `}${r.truePeak > GATES.truePeakDbTP ? `a true peak of ${r.truePeak} dBTP; ` : ''}${r.peak > GATES.samplePeakDbFS ? `a sample peak of ${r.peak} dBFS; ` : ''}${clicked ? `a click of ${r.click.step} at ${r.click.ratio}x, at ${r.click.t} s; ` : ''}${r.duck === 1 ? '' : `it wrote a sidechain (${r.duck})`}`,
          `${id} alone at ${rate / 1000} kHz in ${engine}: ${r.hits} notes over eight bars at ${r.loudnessDb} dB (declared ${r.declared}, ${off.toFixed(2)} off), ${r.mono ? 'mono to' : 'two channels apart by'} ${r.gap}, ${r.truePeak} dBTP / ${r.peak} dBFS, worst click ${r.click.step} at ${r.click.ratio}x (${r.ms} ms)`
        );
      }
    }

    // The read-backs, at 48 kHz: a claim is about the instrument, and the two
    // rates are the contract's question, already asked above.
    const seen: Record<string, NoteReading> = {};
    // A claim that compares against another's reading brings that one with it,
    // so `--only` of the driven reese still has the clean one to be brighter than.
    const wanted = CLAIMS.filter((x) => WANT.includes(x.voice));
    const brought: Claim[] = [];
    for (let more = true; more;) {
      more = false;
      for (const x of CLAIMS) {
        if (wanted.includes(x) || brought.includes(x) || !x.key) continue;
        if ([...wanted, ...brought].some((w) => w.needs === x.key)) { brought.unshift(x); more = true; }
      }
    }
    for (const c of [...brought.sort((a, b) => CLAIMS.indexOf(a) - CLAIMS.indexOf(b)), ...wanted]) {
      const r = await run({ kind: 'note', id: c.voice, rate: 48000, note: c.note }) as NoteReading;
      if (c.key) seen[c.key] = r;
      const [holds, said] = c.holds(r, seen);
      must(holds, `${c.voice} in ${engine}: ${c.what} — it reads ${said}`, `${c.voice} in ${engine}: ${c.what} — ${said}`);
    }
    await browser.close();
  }
}

server.close();

// --- 3. the declared loudness, written by the gate that measures it ---------
// every instrument of this table is a row (rounds R1 and R2) and is written in it
const MODULES: Record<string, string> = {};
if (BLESS) {
  console.log('\nblessing');
  for (const id of WANT) {
    const rows = measured[id] || [];
    if (rows.length < 2) { console.log(`  ${id}: ${rows.length} readings, not blessed`); continue; }
    const mean = rows.reduce((a, r) => a + r.loudnessDb, 0) / rows.length;
    const now = Math.round(mean * 10) / 10;
    // A sound that is a row (round R1) declares its loudness in the row.
    if (!MODULES[id]) {
      let was: number | undefined;
      if (!updateRow(id, (r) => { was = r.descriptor.timbres[id].loudnessDb; r.descriptor.timbres[id].loudnessDb = now; })) { console.log(`  ${id}: no module and no row`); continue; }
      console.log(`  ${id}: ${was} -> ${now}  (${id}.json; ${rows.map((r) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb}`).join(', ')})`);
      continue;
    }
    const file = path.join(SRC, 'voices', MODULES[id]);
    const text = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`(${id}: \\{[^}]*loudnessDb: )(-?[0-9.]+)`);
    if (!re.test(text)) { console.log(`  ${id}: no declared loudness found in ${MODULES[id]}`); continue; }
    const was = text.match(re)![2];
    fs.writeFileSync(file, text.replace(re, `$1${now}`));
    console.log(`  ${id}: ${was} -> ${now}  (${rows.map((r) => `${r.engine}@${r.rate / 1000}k ${r.loudnessDb}`).join(', ')})`);
  }
  console.log('\nre-run without --bless to check the declared numbers against the band.');
  process.exit(failed ? 1 : 0);
}

finish({ failed, skipped });
