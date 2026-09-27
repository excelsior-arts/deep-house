// One drum, alone, on a groove: a fixture per instrument of the kitchen.
//
//   node tools/test-drums.ts         measures every one of them against its
//                                     own declared numbers, in two engines
//   node tools/ear-drums.ts          writes them as files somebody can hear
//
// Round K3 of PLAN-KITCHEN. `audition.ts` is round G's two pieces of music and
// `audition-voices.ts` is round K2's one figure per harmonic role; this is the
// third shape a fixture can have, and the difference is what a percussion
// instrument is measured *against*. A lead is measured alone because a lead is
// heard alone. A drum is heard inside a groove, and the two things a listener
// actually judges it by — does it sit in the bar, does it stop being the same
// hit over and over — cannot be read off one strike.
//
// So every scene here is a **pattern**, eight bars of it with two in front as
// pre-roll, and there are three of them per instrument:
//
//   the scene    the instrument alone on its role's own figure. What the
//                declared loudness, the peaks, the width and the click bound
//                are measured from.
//   the spread   eight strikes at one velocity, one per beat. Two consecutive
//                hits of a pre-rendered drum are the same samples unless
//                something makes them differ, and this is where that is
//                measured rather than asserted: the velocities are equal on
//                purpose, so what is left between two hits is the spread and
//                nothing else.
//   the ear      four bars alone and then the same four over the measured kick
//                and hats, so a listener hears where it sits. It is in no gate.
//
// **Nothing here is composed.** No die, no corpus, no style, no generator:
// a handful of figures as tables of `[step, velocity]`, a row per playable
// instrument saying which figure it plays and with what articulation, and a
// program built out of the two. What a figure is worth as music is not the
// point; what matters is that it is the *same* figure for every instrument in
// that role, so two readings differ by the instrument and by nothing else.

import { resolveSettings } from '../src/settings.ts';
import { dbToGain } from '../src/dsp.ts';
import { BY_NAME, VOICE_BUS, VOICE_LEVEL } from '../src/voices/index.ts';
import { table } from './fixture.ts';
import type { Program, ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { Audition } from './audition.ts';

/** `[step, velocity]`. Steps are sixteenths of the fixture's own 120 BPM bar. */
type Hit = [number, number];

// --- the figures ------------------------------------------------------------

/** Four to the floor. */
const FOUR: Hit[][] = [[[0, 0.95], [4, 0.9], [8, 0.95], [12, 0.9]]];
/** Two and four. */
const BACKBEAT: Hit[][] = [[[4, 0.95], [12, 0.9]], [[4, 0.95], [12, 0.85]], [[4, 0.9], [12, 0.95]], [[4, 0.95], [10, 0.4], [12, 0.9]]];
/** The offbeats, which is where a hat lives. */
const OFFBEAT: Hit[][] = [[[2, 0.8], [6, 0.9], [10, 0.8], [14, 0.95]]];
/** Eighths, which is where a ride lives, with the bar line leaned on. */
const EIGHTHS: Hit[][] = [[[0, 0.95], [2, 0.6], [4, 0.75], [6, 0.6], [8, 0.9], [10, 0.6], [12, 0.75], [14, 0.65]]];
/** Every sixteenth, the bar line loudest: a shaker part. */
const SIXTEENTH: Hit[][] = [Array.from({ length: 16 }, (_, s) => [s, s % 4 === 0 ? 0.85 : 0.5] as Hit)];
/**
 * A hand-percussion part: a tumbao's shape without its tuning — the downbeat
 * leaned on, two quiet fills, and the bar answered on the last quarter. Four
 * bars, so no two bars in a row are the same and the velocity spread is
 * genuinely a range.
 */
const PERC: Hit[][] = [
  [[0, 0.9], [3, 0.5], [6, 0.8], [10, 0.55], [14, 0.7]],
  [[0, 0.85], [3, 0.45], [6, 0.9], [11, 0.6], [14, 0.5]],
  [[0, 0.95], [4, 0.5], [6, 0.75], [10, 0.6], [13, 0.65], [14, 0.4]],
  [[0, 0.8], [3, 0.6], [7, 0.85], [10, 0.5], [12, 0.7], [15, 0.45]],
];
/** A fill: what toms are for, at the rate a fill happens. */
const FILL: Hit[][] = [[[0, 0.9], [6, 0.65]], [[0, 0.85], [10, 0.6]], [[0, 0.9], [3, 0.55], [6, 0.7]], [[0, 0.95], [8, 0.7], [12, 0.6], [14, 0.8]]];
/** One gesture every four bars: what a crash does, at the rate it does it. */
const GESTURE: Hit[][] = [[[0, 0.95]], [], [], []];
/** Eight strikes at one velocity, one a beat: the spread's own figure. */
const STEADY: Hit[][] = [[[0, 0.8], [4, 0.8], [8, 0.8], [12, 0.8]]];

const PATTERNS: Record<string, Hit[][]> = {
  four: FOUR, backbeat: BACKBEAT, offbeat: OFFBEAT, eighths: EIGHTHS,
  sixteenth: SIXTEENTH, perc: PERC, fill: FILL, gesture: GESTURE, steady: STEADY,
};

// --- the table --------------------------------------------------------------

/** One playable instrument of the kitchen, and how this fixture plays it. */
export interface DrumScene {
  /** the fixture's own name for it: the voice, and the articulation where a voice has several */
  id: string;
  /** the registered voice */
  voice: string;
  /** which figure it plays */
  pattern: keyof typeof PATTERNS;
  /** what the note asks for on top: a tuning, an articulation, a size */
  p?: NoteParams;
  /** the role this instrument is being played in, for the write-up */
  role: string;
  /** an articulation of an instrument already measured, rather than an instrument of its own */
  also?: boolean;
}

// One row per **playable instrument**, which is not one row per registered
// voice: a conga is two tunings and two hands, a tom is three sizes and a ride
// has a bell, and `p` chooses. The rows marked `also` are articulations of an
// instrument whose declared numbers are measured on the row above them, the way
// the FM bell's loudness is measured on its default tone.
export const DRUM_SCENES: DrumScene[] = [
  { id: 'conga', voice: 'conga', pattern: 'perc', role: 'sixteenth' },
  { id: 'congaLow', voice: 'conga', pattern: 'perc', p: { tuning: 'low' }, role: 'sixteenth', also: true },
  { id: 'congaSlap', voice: 'conga', pattern: 'perc', p: { hit: 'slap' }, role: 'sixteenth', also: true },
  { id: 'bongo', voice: 'bongo', pattern: 'perc', role: 'sixteenth' },
  { id: 'bongoSlap', voice: 'bongo', pattern: 'perc', p: { tuning: 'low', hit: 'slap' }, role: 'sixteenth', also: true },
  { id: 'snare', voice: 'snare', pattern: 'backbeat', role: 'backbeat' },
  { id: 'snareGhost', voice: 'snare', pattern: 'sixteenth', p: { hit: 'ghost' }, role: 'backbeat', also: true },
  { id: 'rimshot', voice: 'rimshot', pattern: 'backbeat', role: 'backbeat' },
  { id: 'hatTight', voice: 'hatTight', pattern: 'offbeat', role: 'offbeat' },
  { id: 'hatLoose', voice: 'hatLoose', pattern: 'offbeat', role: 'offbeat' },
  { id: 'hatSizzle', voice: 'hatSizzle', pattern: 'offbeat', role: 'offbeat' },
  { id: 'ride', voice: 'ride', pattern: 'eighths', role: 'offbeat' },
  { id: 'rideBell', voice: 'ride', pattern: 'eighths', p: { hit: 'bell' }, role: 'offbeat', also: true },
  { id: 'crash', voice: 'crash', pattern: 'gesture', role: 'texture' },
  { id: 'tom', voice: 'tom', pattern: 'fill', role: 'sixteenth' },
  { id: 'tomHigh', voice: 'tom', pattern: 'fill', p: { size: 'high' }, role: 'sixteenth', also: true },
  { id: 'tomLow', voice: 'tom', pattern: 'fill', p: { size: 'low' }, role: 'sixteenth', also: true },
  { id: 'cabasa', voice: 'cabasa', pattern: 'sixteenth', role: 'sixteenth' },
  { id: 'tambourine', voice: 'tambourine', pattern: 'offbeat', role: 'sixteenth' },
  { id: 'cowbell', voice: 'cowbell', pattern: 'eighths', role: 'sixteenth' },
  { id: 'woodblock', voice: 'woodblock', pattern: 'perc', role: 'sixteenth' },
  { id: 'kickLong', voice: 'kickLong', pattern: 'four', role: 'kick' },
  { id: 'kickPunch', voice: 'kickPunch', pattern: 'four', role: 'kick' },
];

export const DRUMS = DRUM_SCENES.filter((s) => !s.also).map((s) => s.id);

const byId = (id: string): DrumScene => {
  const s = DRUM_SCENES.find((r) => r.id === id);
  if (!s) throw new Error(`no drum scene called ${id}`);
  return s;
};
export const drumSceneOf = byId;

/**
 * Every registered voice of the kitchen has a scene, and every scene names a
 * registered voice. Asserted rather than assumed: an instrument added to the
 * registry and left out of this table would have no gate at all.
 */
export function missingDrumScenes(covered: string[] = []): string[] {
  const has = new Set([...DRUM_SCENES.map((s) => s.voice), ...covered]);
  const out: string[] = [];
  for (const d of Object.values(BY_NAME)) if (!has.has(d.name)) out.push(d.name);
  for (const s of DRUM_SCENES) if (!BY_NAME[s.voice]) out.push(`${s.id} names no registered voice`);
  return out;
}

// --- the program ------------------------------------------------------------

const event = (i: number, voice: string, t: number, p: NoteParams, bar: number, step: number): ProgramEvent => ({
  i,
  voice,
  layer: BY_NAME[voice].layer,
  bus: VOICE_BUS[voice],
  level: VOICE_LEVEL[voice],
  bar,
  step,
  t,
  onset: t,
  lead: 0,
  // Nothing here posts a sidechain. The duck is the composer's gesture and it
  // is scheduled per kick *event* in the record; a fixture that wrote one would
  // be measuring the duck and calling it the drum.
  duck: false,
  gap: null,
  p,
});

const program = (fields: Partial<Program> & { bpm: number; bars: number; duration: number; settings: Settings }): Program => ({
  seed: 'audition',
  index: null,
  preset: 'audition',
  beat: 60 / fields.bpm,
  barSeconds: (60 / fields.bpm) * 4,
  trimDb: 0,
  themeGain: 1,
  seam: null,
  blendBars: null,
  filterMove: null,
  routing: {},
  levels: {},
  events: [],
  automation: [],
  duckShape: [],
  duck: [],
  development: [],
  ...fields,
} as Program);

/**
 * The level table's own gain for a voice, which is what an event carries.
 *
 * The table is read **by name** — the registry is open and `VOICE_LEVEL` is a
 * `Record<string, string>` where `levels` is a closed table of named fields —
 * which is how `buildMaster` reads it too (`src/master.ts`'s `level()`).
 */
const levelDb = (settings: Settings, key: string): number => (settings.levels as Record<string, number>)[key];
const gainOf = (settings: Settings, voice: string): number => dbToGain(levelDb(settings, VOICE_LEVEL[voice]));

/**
 * One instrument of the kitchen, alone, the way a scene is metered:
 * `prerollBars` bars of the same figure in front of the window so that nothing
 * in the chain — the sends, the glue, the limiter — starts from rest inside it.
 *
 * `velScale` is **the second register a drum has**, and it is here because the
 * per-layer imprint needs one: a harmonic instrument is read twice, its own
 * figure and the same figure a fifth up, and the spread between the two is how
 * much the reading moves when the *same instrument* is played differently. A
 * drum has no fifth. What it has instead is velocity, which round K3 wired to
 * the playback rate and the envelope and to no filter — so a quieter hit really
 * is a darker, shorter one, and scaling the figure's own velocities is the same
 * instrument played differently in the only way a drum can be. At 1 it is the
 * scene the gate meters, to the sample.
 */
export function drumAudition(id: string, { bpm = 120, bars = 8, prerollBars = 2, tail = 1.5, pattern = '', velScale = 1 } = {}): Audition {
  const scene = byId(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const rows = PATTERNS[pattern || scene.pattern];
  const gain = gainOf(settings, scene.voice);
  const all = prerollBars + bars;
  const events: ProgramEvent[] = [];
  for (let b = 0; b < all; b++) {
    for (const [s, vel] of rows[b % rows.length]) {
      events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
        ...(scene.p || {}), vel: Math.max(0.05, Math.min(1, vel * velScale)), gain,
      }, b, s));
    }
  }
  const levelKey = VOICE_LEVEL[scene.voice];
  return {
    name: velScale === 1 ? id : `${id}@x${velScale}`,
    program: program({
      bpm, bars: all, duration: all * barSeconds + tail, settings,
      levels: { [levelKey]: levelDb(settings, levelKey) },
      events,
    }),
    drones: [],
    window: { from: prerollBars * barSeconds, to: all * barSeconds },
  };
}

/**
 * The same instrument, struck eight times at one velocity, one a beat. What is
 * left between two consecutive hits is the per-hit spread, because everything
 * else about them is identical.
 */
export function spreadAudition(id: string, { bpm = 120, bars = 2 } = {}): Audition {
  return drumAudition(id, { bpm, bars, prerollBars: 0, tail: 1.5, pattern: 'steady' });
}

/** The onsets of a spread audition, in the piece's own seconds. */
export const spreadOnsets = (aud: Audition): number[] => aud.program.events.map((e) => e.t);

// --- what a listener is given -----------------------------------------------
//
// Four bars of the instrument alone, then the same four bars again with the
// measured kick and the measured hats under them. A drum alone says what it is;
// a drum in a groove says whether it is any use, and the two halves are in one
// file so a listener is comparing a sound and not two sessions.

const KIT: Array<[string, Hit[]]> = [
  ['kick', [[0, 0.95], [4, 0.95], [8, 0.95], [12, 0.95]]],
  ['hatClosed', [[2, 0.75], [6, 0.8], [10, 0.75], [14, 0.85]]],
  ['hatOpen', [[6, 0.55], [14, 0.6]]],
];

/** @param id a row of the scene table */
export function drumWithKit(id: string, { bpm = 122, bars = 4, tail = 2 } = {}): Audition {
  const scene = byId(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const rows = PATTERNS[scene.pattern];
  const all = bars * 2;
  const ownKick = BY_NAME[scene.voice].roles.includes('kick');
  const events: ProgramEvent[] = [];
  const at = (voice: string, b: number, s: number, p: NoteParams) =>
    events.push(event(0, voice, b * barSeconds + s * step, { ...p, gain: gainOf(settings, voice) }, b, s));

  for (let b = 0; b < all; b++) {
    for (const [s, vel] of rows[b % rows.length]) at(scene.voice, b, s, { ...(scene.p || {}), vel });
    // The second half of the file is the same four bars with a record under
    // them. Nothing is ducked: the sidechain belongs to the composer and this
    // is the machine. And an instrument that is itself a kick gets the hats
    // and not the kick — two bass drums on one beat is a phase measurement
    // and not a placing.
    if (b >= bars) {
      for (const [voice, hits] of KIT) {
        if (ownKick && voice === 'kick') continue;
        for (const [s, vel] of hits) at(voice, b, s, { vel });
      }
    }
  }
  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });
  const levels: Record<string, number> = {};
  // Every event here came out of `event()` above, so its `level` is the key the
  // registry declared for that voice and never the null the Program contract
  // allows for a voice the levels do not trim.
  for (const e of events) levels[e.level!] = levelDb(settings, e.level!);
  return {
    name: `with-kit-${id}`,
    program: program({ bpm, bars: all, duration: all * barSeconds + tail, settings, levels, events }),
    drones: [],
    window: { from: 0, to: all * barSeconds + tail },
  };
}

/**
 * Sixteen bars of the kitchen as a kit, written out by hand: the measured kick
 * and hats holding the floor, congas and a shaker over them from the first bar,
 * a snare on the backbeat for eight of the sixteen, and the ride taking the
 * last four. It is round G's `droneAudition()` in the other direction — that
 * one proved the machine can play a piece with no drums in it, this one proves
 * the kitchen is a kit and not a shelf.
 */
export function kitTogether({ bpm = 122, bars = 16, tail = 3 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const events: ProgramEvent[] = [];
  const at = (voice: string, b: number, s: number, p: NoteParams) => {
    if (!BY_NAME[voice]) return;
    events.push(event(0, voice, b * barSeconds + s * step, { ...p, gain: gainOf(settings, voice) * (p.trim ?? 1) }, b, s));
  };

  for (let b = 0; b < bars; b++) {
    for (const [voice, hits] of KIT) for (const [s, vel] of hits) at(voice, b, s, { vel });
    for (const [s, vel] of PERC[b % PERC.length]) {
      at('conga', b, s, { vel, tuning: s % 6 === 0 ? 'high' : 'low', hit: vel > 0.85 ? 'slap' : 'open' });
    }
    if (b >= 2) for (const [s, vel] of SIXTEENTH[0]) at('cabasa', b, s, { vel: vel * 0.8 });
    if (b >= 4) for (const [s, vel] of PERC[(b + 2) % PERC.length]) at('bongo', b, (s + 2) % 16, { vel: vel * 0.7 });
    // The snare takes the middle eight bars and hands the backbeat back.
    if (b >= 4 && b < 12) for (const [s, vel] of BACKBEAT[b % BACKBEAT.length]) at('snare', b, s, { vel });
    if (b >= 12) for (const [s, vel] of EIGHTHS[0]) at('ride', b, s, { vel: vel * 0.8, hit: s === 0 ? 'bell' : 'ride' });
    // One crash where the ride comes in, and one to close.
    if (b === 12) at('crash', b, 0, { vel: 0.9 });
    if (b === 8) for (const [s, vel] of FILL[3]) at('tom', b, s, { vel, size: s > 8 ? 'low' : 'mid' });
  }
  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });
  const levels: Record<string, number> = {};
  // Every event here came out of `event()` above, so its `level` is the key the
  // registry declared for that voice and never the null the Program contract
  // allows for a voice the levels do not trim.
  for (const e of events) levels[e.level!] = levelDb(settings, e.level!);
  return {
    name: 'kit',
    program: program({ bpm, bars, duration: bars * barSeconds + tail, settings, levels, events }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + tail },
  };
}
