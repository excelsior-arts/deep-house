// **The piano's string** (round piano-tone, 10-29; his ear on the six sketches of keys-balance's add-on: *"Yeah, I
// guess the number 6 sounds all right … generally, yeah, the 6 sounds a little better"*). The deep house keys: a stiff
// string over a wooden body, struck by felt. Its numbers are the piano row's `string` (`sounds/keyboard/piano.json`);
// a room that carries one plays it, a room that carries none plays the six-partial string `piano.ts` always had.
//
// What it replaces, and why (his ear 10-29: *"it still sounds like there is a piece of paper between a string and a
// hammer"*): the six-partial string has nothing of its own over about 1.5 kHz in the middle register, so everything
// the note had at 2-8 kHz was the hammer, 45 ms of noise band-passed at 2.2 kHz + 2 f0, which the place's grain played
// at 2.5 times and the hall held for seconds. Here the top is the string's own harmonics, the hammer is a short low
// knock of felt, and the board gives the note a body.
//
//   the level    `level` against the room's partials, and by register (`register`, decibels at MIDI notes): the
//                string measured against the six-partial one in the mix, note by note in their themes, is the six
//                partials' loudness in every register (round piano-tone, his ear 10-29 on the next theme)
//   the string   up to `partials` partials, stiff (f_n = n f0 sqrt(1 + B n^2), B = `stiffness` at middle C rising
//                toward the treble), each at 1/n^0.9, through the comb of the strike point (`strike` of the string's
//                length, its notches softened by `comb`), and reaching as far up as the strike is hard: a falling
//                slope from the fundamental, `reach` times 0.7 to 4.5 kHz on velocity. Each partial lives shorter the
//                higher it is: the room's `partialDecay` read per kilohertz of it.
//   the board    the strings' sum through the body's wooden modes (`body`, peaks and the top laid back) and a short
//                knock of the board itself (`knock` against velocity, band-passed at `knockHz`).
//   the hammer   felt: noise low-passed at `felt.hz` + `felt.track` f0 (at most `felt.top`), `felt.level` of the
//                room's `hammerLevel`, gone in `felt.decay`. At play, as today's hiss was.
//
// Every one renders offline into the strings' cache, as the six partials do: at play a note is the same one buffer,
// a low-pass, a high-pass, a pan and an envelope, with the hammer live (one noise and one low-pass, as today's one
// noise and one band-pass). The place's grain is not read by it: the hammer and the body are the string's own.

import { GAIN_FLOOR, MIN_RELEASE, noiseSource } from '../dsp.ts';

/** One mode of the board: a peak (or a dip) at `hz`. */
export interface BodyMode { hz: number; db: number; q: number }

/** The felt hammer. */
export interface FeltHammer {
  /** the low-pass's corner under the lowest note */
  hz: number;
  /** how far the corner follows the note: hertz per hertz of its fundamental */
  track: number;
  /** the corner's ceiling */
  top: number;
  /** against the room's (or the note's) `hammerLevel` */
  level: number;
  /** seconds to sixty decibels under the strike */
  decay: number;
}

/** A point of the string's level by register: decibels at a MIDI note, straight lines between, flat past the ends. */
export interface RegisterPoint { midi: number; db: number }

/** The string, the board and the felt (the piano row's `string`). */
export interface PianoString {
  partials: number;
  reach: number;
  strike: number;
  comb: number;
  stiffness: number;
  /** the string against the room's `partialLevel` */
  level: number;
  /** the level by register, on top of `level` (none: flat) */
  register: readonly RegisterPoint[];
  body: readonly BodyMode[];
  knock: number;
  knockHz: number;
  felt: FeltHammer;
}

/** What the string reads of the room's numbers. */
interface Room {
  partialLevel: number;
  partialDecay: number;
  unisonCents: number;
  unisonLevel: number;
}

/** One partial: a sine from `time`, at `level`, falling to nothing over `pl` seconds. */
function partial(ctx: BaseAudioContext, into: AudioNode, time: number, f: number, cents: number, level: number, pl: number, end: number): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  o.detune.value = cents;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(Math.max(GAIN_FLOOR, level), time);
  g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + Math.max(0.05, pl));
  g.gain.linearRampToValueAtTime(0, time + Math.max(0.05, pl) + MIN_RELEASE);
  o.connect(g);
  g.connect(into);
  o.start(time);
  o.stop(end + 0.02);
}

/** The stiff string's spectrum: each partial's frequency, level and life, for one string of a note. */
function spectrum(hz: number, vel: number, life: number, R: Room, S: PianoString) {
  const B = S.stiffness * Math.pow(hz / 261.6, 0.6);
  const fc = S.reach * (700 + 3800 * Math.pow(vel, 1.3));
  const notch = Math.sin(Math.PI * S.strike);
  const out: Array<{ f: number; level: number; pl: number }> = [];
  for (let n = 1; n <= S.partials; n++) {
    const f = n * hz * Math.sqrt(1 + B * n * n);
    if (f > 12000) break;
    const comb = (1 - S.comb) + S.comb * Math.abs(Math.sin(n * Math.PI * S.strike)) / notch;
    const level = (1 / Math.pow(n, 0.9)) * comb * Math.exp(-(f - hz) / fc);
    if (level < 0.004) continue;
    const pl = Math.max(0.08, life / (1 + R.partialDecay * 2.2 * (f / 1000) + 0.04 * (n - 1)));
    out.push({ f, level, pl });
  }
  return out;
}

/** The string's level at a pitch by its register points (round piano-tone: the six-partial string's loudness, register by register). */
export function registerDb(hz: number, points: readonly RegisterPoint[]): number {
  if (!points.length) return 0;
  const m = 69 + 12 * Math.log2(hz / 440);
  if (m <= points[0].midi) return points[0].db;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (m <= b.midi) return a.db + (b.db - a.db) * (m - a.midi) / Math.max(1e-9, b.midi - a.midi);
  }
  return points[points.length - 1].db;
}

/** The strings of one note and the board under them, as oscillators and filters into `into`, from `time`. Returns where they end. */
export function stringNote(ctx: BaseAudioContext, into: AudioNode, time: number, hz: number, vel: number, life: number,
  attack: number, R: Room, S: PianoString): number {
  const end = time + attack + life + MIN_RELEASE;
  let to: AudioNode = into;
  if (S.body.length) {
    let head: AudioNode | null = null, last: BiquadFilterNode | null = null;
    for (const { hz: f, db, q } of S.body) {
      const b = ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.gain.value = db;
      b.Q.value = q;
      if (last) last.connect(b); else head = b;
      last = b;
    }
    last!.connect(into);
    to = head!;
  }
  if (S.knock > 0) {
    // the board's own knock: a few milliseconds of its lowest modes
    const knock = noiseSource(ctx, time, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = S.knockHz;
    bp.Q.value = 1.4;
    const kg = ctx.createGain();
    kg.gain.value = 0;
    kg.gain.setValueAtTime(0, time);
    kg.gain.linearRampToValueAtTime(S.knock * vel, time + 0.003);
    kg.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + 0.05);
    knock.connect(bp); bp.connect(kg); kg.connect(into);
  }
  const parts = spectrum(hz, vel, life, R, S);
  const norm = R.partialLevel * S.level * Math.pow(10, registerDb(hz, S.register) / 20);
  for (const [cents, amp] of [[0, 1], [-R.unisonCents, R.unisonLevel]])
    for (const { f, level, pl } of parts) partial(ctx, to, time, f, cents, level * amp * norm, pl, end);
  return end;
}

/** The felt hammer at play: a short low knock where today's hammer was a band of hiss. */
export function feltHammer(ctx: BaseAudioContext, into: AudioNode, time: number, hz: number, vel: number, hammerLevel: number, F: FeltHammer): void {
  const ham = noiseSource(ctx, time, F.decay + 0.02);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(F.top, F.hz + hz * F.track);
  lp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, hammerLevel * F.level * vel), time + 0.002);
  g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + F.decay);
  g.gain.linearRampToValueAtTime(0, time + F.decay + MIN_RELEASE);
  ham.connect(lp); lp.connect(g); g.connect(into);
}
