// **The piano's string** (round piano-tone, 10-29; his ear on the six sketches of keys-balance's add-on: *"Yeah, I
// guess the number 6 sounds all right … generally, yeah, the 6 sounds a little better"*). The deep house keys: a stiff
// string over a wooden body, struck by felt. Its numbers are the piano row's `string` (`sounds/keyboard/piano.json`);
// a room that writes none plays its row's (round piano-pool; the six-partial string is gone).
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

/**
 * **The aftersound** (round voice-homes, his ear 11-01: *"when it's dry it doesn't even sound like piano"*): a struck
 * string's partials live by their frequency, not by the note's written length, and a key held rings on; the damper
 * stops it when the key (and the pedal, the note's `ring`) lets go.
 */
export interface Aftersound {
  /** the fundamental's time to the floor at middle C, seconds */
  seconds: number;
  /** how it shortens up the keyboard: the time goes as (middle C / f) to this power */
  slope: number;
  /** the damper's fall at the key's release, seconds */
  damper: number;
  /**
   * (round voice-homes 2, his ear on Drive - Slow Burn and Vibe - Drizzle: a part's level is its own) the strike held
   * to the loudness the plucked string had in its first 0.4 s: a held string is louder there the shorter the note's
   * life (measured: +5.5 dB at 0.4 s, +3 at a second, nought from about four), so the strings play `db` - `slope` ln(life)
   * decibels under, never over; absent, at the row's level
   */
  keep?: { db?: number; slope?: number; by?: ReadonlyArray<{ life: number; db: number }> } | null;
  /**
   * (round voice-homes 3) a held key's fall: the note reaches the floor over this many seconds or its life, whichever
   * is longer, where the house piano holds flat (absent). A grand whose rows ring long held chords (the liquid keys',
   * up to twelve seconds) keeps their fall as it was, and a short note no longer dies like a pluck
   */
  fade?: number | null;
}

/** One string of a unison: its tuning about the note, in cents, and its level against the first. */
export interface UnisonString { cents: number; level: number }

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
  /** (round voice-homes) the aftersound and the damper; absent, a partial lives by the note's length, as before */
  after?: Aftersound | null;
  /** (round voice-homes) the unison's strings, each a little off the note and each a touch stiffer than the last;
   * absent, the room's two strings (the second `unisonCents` flat) */
  unison?: readonly UnisonString[] | null;
  /** (round voice-homes) how much harder a hard strike reaches (the string's top and the felt's corner, about a
   * velocity of 0.6); absent or nought, as before */
  touch?: number;
  /** (round voice-homes 3) how much of the touch brightens a strike over 0.6: 0 for a felt that only darkens when
   * soft, never past its own lid; absent, all of it */
  touchUp?: number;
}

/** (round voice-homes) how long the damper takes, where the string has an aftersound: what a note adds past its life */
export const damperOf = (S: PianoString | null | undefined): number => S?.after ? S.after.damper : 0;

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
function spectrum(hz: number, vel: number, life: number, R: Room, S: PianoString, stiffer = 0) {
  const B = S.stiffness * Math.pow(hz / 261.6, 0.6) * (1 + stiffer);
  const fc = S.reach * (700 + 3800 * Math.pow(vel, 1.3)) * touchOf(S, vel);
  // (round voice-homes) with an aftersound a partial's life is the string's, by its frequency, not the note's length
  // (round voice-homes 3) and never shorter than its life gave it: the aftersound only ever lengthens a partial
  const lives = S.after ? Math.max(life, S.after.seconds * Math.pow(261.6 / hz, S.after.slope)) : life;
  const notch = Math.sin(Math.PI * S.strike);
  const out: Array<{ f: number; level: number; pl: number }> = [];
  for (let n = 1; n <= S.partials; n++) {
    const f = n * hz * Math.sqrt(1 + B * n * n);
    if (f > 12000) break;
    const comb = (1 - S.comb) + S.comb * Math.abs(Math.sin(n * Math.PI * S.strike)) / notch;
    const level = (1 / Math.pow(n, 0.9)) * comb * Math.exp(-(f - hz) / fc);
    if (level < 0.004) continue;
    const pl = Math.max(0.08, lives / (1 + R.partialDecay * 2.2 * (f / 1000) + 0.04 * (n - 1)));
    out.push({ f, level, pl });
  }
  // (round voice-homes 2, his ear on Drive - Slow Burn and Vibe - Drizzle: a part's level is its own) the touch moves a
  // strike's colour, not its loudness: the partials are held to the loudness the untouched strike has, each weighed as
  // a listener's ear does (the top, over 1.5 kHz, 4 dB the more), so a soft part is not quieter for being darker nor a
  // hard one louder for being brighter; velocity alone sets the level
  if (S.touch) {
    const fc0 = S.reach * (700 + 3800 * Math.pow(vel, 1.3));
    const ear = (f: number) => (f > 1500 ? 2.5 : 1);
    let was = 0, now = 0;
    for (const x of out) { const l0 = x.level * Math.exp(-(x.f - hz) / fc0) / Math.exp(-(x.f - hz) / fc); was += ear(x.f) * l0 * l0; now += ear(x.f) * x.level * x.level; }
    const k = now > 0 ? Math.sqrt(was / now) : 1;
    for (const x of out) x.level *= k;
  }
  return out;
}

/** (round voice-homes) a strike's reach by its velocity: harder is brighter, about 0.6 */
const touchOf = (S: PianoString, vel: number): number => Math.max(0.3, 1 + touchAt(S, vel) * (vel - 0.6));
/** the touch a strike of this velocity takes: all of it under 0.6, `touchUp` of it over (round voice-homes 3) */
export const touchAt = (S: PianoString, vel: number): number => (S.touch ?? 0) * (vel > 0.6 ? S.touchUp ?? 1 : 1);

/**
 * (round voice-homes 2) the decibels a string of this life plays under the row's level, so its strike keeps the plucked
 * string's loudness: `db` - `slope` ln(life), never under nought. (round piano-pool) A grand that fades while held
 * (`after.fade`) gives its own by life instead (`by`, measured note by note against the string without the
 * aftersound): the log line read only the short lives, and a long held chord lost its keep and stood 1-1.7 dB over
 * (seed 3's far grand in its liquid breakdown); straight lines on ln(life) between the points, flat past the ends
 */
export function keepDb(K: Aftersound['keep'], life: number): number {
  if (!K) return 0;
  const L = Math.max(0.05, life);
  if (K.by && K.by.length) {
    const b = K.by, x = Math.log(L);
    if (L <= b[0].life) return b[0].db;
    for (let i = 1; i < b.length; i++) if (L <= b[i].life) {
      const x0 = Math.log(b[i - 1].life), x1 = Math.log(b[i].life);
      return b[i - 1].db + (b[i].db - b[i - 1].db) * (x - x0) / Math.max(1e-9, x1 - x0);
    }
    return b[b.length - 1].db;
  }
  return Math.max(0, (K.db ?? 0) - (K.slope ?? 0) * Math.log(L));
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
  const end = time + attack + life + damperOf(S) + MIN_RELEASE;
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
  const keep = keepDb(S.after?.keep, life);
  const norm = R.partialLevel * S.level * Math.pow(10, (registerDb(hz, S.register) - keep) / 20);
  // (round voice-homes) the unison's own strings, each a touch stiffer than the last, so each partial beats at its own
  // rate (a bloom, where two strings beat every partial in step); their levels summed to the two strings' 1 + level
  if (S.unison && S.unison.length) {
    const sum = S.unison.reduce((a, u) => a + u.level, 0), k = (1 + R.unisonLevel) / Math.max(1e-6, sum);
    S.unison.forEach((u, i) => { for (const { f, level, pl } of spectrum(hz, vel, life, R, S, 0.04 * i)) partial(ctx, to, time, f, u.cents, level * u.level * k * norm, pl, end); });
    return end;
  }
  const parts = spectrum(hz, vel, life, R, S);
  for (const [cents, amp] of [[0, 1], [-R.unisonCents, R.unisonLevel]])
    for (const { f, level, pl } of parts) partial(ctx, to, time, f, cents, level * amp * norm, pl, end);
  return end;
}

/** The felt hammer at play: a short low knock where today's hammer was a band of hiss. */
export function feltHammer(ctx: BaseAudioContext, into: AudioNode, time: number, hz: number, vel: number, hammerLevel: number, F: FeltHammer, touch = 0): void {
  const ham = noiseSource(ctx, time, F.decay + 0.02);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  // (round voice-homes) a harder strike's felt is brighter as well as louder, by the string's touch
  lp.frequency.value = Math.min(F.top, F.hz + hz * F.track) * Math.max(0.3, 1 + touch * (vel - 0.6));
  lp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(Math.max(GAIN_FLOOR, hammerLevel * F.level * vel), time + 0.002);
  g.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + F.decay);
  g.gain.linearRampToValueAtTime(0, time + F.decay + MIN_RELEASE);
  ham.connect(lp); lp.connect(g); g.connect(into);
}
