// One instrument, alone, on a fixed figure: a fixture per playable voice.
//
//   node tools/test-voices.ts        measures the six new ones against their
//                                     own declared numbers, in two engines
//   node tools/ear-voices.ts         writes them as files somebody can hear
//   node ../deep-house/tools/imprint/layer.ts
//                                     renders every one of them and reads its
//                                     eight birds, which is the per-layer
//                                     imprint phase 1 said the project needs
//
// Round K2 of PLAN-KITCHEN. `audition.ts` beside this is round G's: two pieces
// of music, written out by hand, that prove the machine plays what it is
// handed. This file is the other shape a fixture can have — **the same eight
// bars, played by every instrument in the registry in turn** — and it exists
// because two different things want exactly that and would otherwise write it
// twice: a gate that holds a new voice to its declared loudness, and a
// measurement that asks what one layer of this record actually sounds like.
//
// **Nothing here is composed.** There is no die, no corpus, no style and no
// generator: four bars of steps per role, a table saying which role each voice
// is played in and in what register, and a program built out of the two. What a
// figure is worth as music is not the point; what matters is that it is the
// *same* figure for every instrument that plays that role, so two readings can
// be compared and the difference is the instrument.
//
// Three roles have a figure, and the drums have a groove:
//
//   melody     one note at a time, held most of a beat, in the octave above
//              middle C. What a lead plays.
//   figure     a sixteenth pattern, short notes, from E4. What a stab plays.
//   chord      three notes held for two bars, from middle C. What a pad plays.
//   four / offbeat / sixteenth / backbeat / bassline / gesture
//              the drums, the bottom and the glue, so that the layer imprint
//              has a reading for every voice the record is actually made of and
//              not only for the harmonic ones.

import { resolveSettings } from '../src/settings.ts';
import { dbToGain } from '../src/dsp.ts';
import { BY_NAME, VOICE_BUS, VOICE_LEVEL, REGISTRY, holdFormantPad, holdSupersawPad } from '../src/voices/index.ts';
import { table } from './fixture.ts';
import type { V1Graph } from '../src/graph.ts';
import type { Program, ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { Audition } from './audition.ts';
import type { HeldVoice, HoldRenderer } from '../src/voices/voice-contract.ts';

/**
 * The decibel a voice is trimmed to, out of the settings' own level table. The
 * registry is open and `VOICE_LEVEL` is a `Record<string, string>` where
 * `levels` is a closed table of named fields, so the table is read by name, the
 * way `buildMaster` reads it (`src/master.ts`'s `level()`).
 */
const levelDb = (settings: Settings, key: string): number => (settings.levels as Record<string, number>)[key];

/** `[step, semitones from the pattern's own root, velocity]`. Steps are sixteenths. */
export type Hit = [number, number, number];
/** `[step, semitones for each note of the chord, velocity]` */
export type Chord = [number, number[], number];

// A line: one note at a time, leaving room between them. Four bars, cycled.
const MELODY: Hit[][] = [
  [[0, 0, 0.9], [6, 7, 0.75], [10, 5, 0.7]],
  [[0, 3, 0.85], [8, 7, 0.7], [12, 10, 0.65]],
  [[0, -2, 0.9], [4, 2, 0.7], [10, 5, 0.75]],
  [[0, 3, 0.8], [6, 0, 0.7], [12, -2, 0.6]],
];

// A figure: five hits a bar off the sixteenths, the velocities falling away
// from the bar line. It is round G's pluck figure in another register, on
// purpose — the same shape read by two instruments is a comparison.
const FIGURE: Hit[][] = [
  [[0, 0, 0.95], [3, 0, 0.6], [6, 7, 0.8], [10, 3, 0.7], [14, 0, 0.6]],
  [[0, 0, 0.9], [3, 12, 0.5], [6, 7, 0.8], [11, 5, 0.7], [14, 3, 0.6]],
  [[0, -2, 0.95], [3, -2, 0.6], [6, 5, 0.8], [10, 2, 0.7], [14, -2, 0.6]],
  [[0, 3, 0.9], [4, 3, 0.6], [7, 10, 0.8], [10, 7, 0.7], [13, 3, 0.6]],
];

// A chord every two bars, three notes, held through: what a pad is for.
export const CHORD: Chord[] = [
  [0, [0, 3, 7], 0.7],
  [0, [-2, 3, 5], 0.7],
];

// The drums and the bottom. A groove, so that a hat measured alone is a hat
// playing what a hat plays.
const FOUR: Hit[][] = [[[0, 0, 0.95], [4, 0, 0.95], [8, 0, 0.95], [12, 0, 0.95]]];
const OFFBEAT: Hit[][] = [[[2, 0, 0.8], [6, 0, 0.85], [10, 0, 0.8], [14, 0, 0.9]]];
const BACKBEAT: Hit[][] = [[[4, 0, 0.9], [12, 0, 0.9]]];
const SIXTEENTH: Hit[][] = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(
  (s) => [s, 0, s % 4 === 0 ? 0.8 : 0.55] as Hit)];
const BASSLINE: Hit[][] = [
  [[0, 0, 0.9], [6, 0, 0.7], [10, 7, 0.75], [14, 0, 0.65]],
  [[0, 0, 0.9], [6, 5, 0.7], [11, 0, 0.75], [14, 3, 0.65]],
  [[0, -2, 0.9], [6, -2, 0.7], [10, 5, 0.75], [14, -2, 0.65]],
  [[0, 3, 0.9], [4, 3, 0.7], [10, 10, 0.75], [14, 3, 0.65]],
];
// One gesture every four bars: what the seam glue does, at the rate it does it.
const GESTURE: Hit[][] = [[[0, 0, 0.9]], [], [], []];

export const PATTERNS: Record<string, Hit[][]> = {
  melody: MELODY, figure: FIGURE, four: FOUR, offbeat: OFFBEAT,
  backbeat: BACKBEAT, sixteenth: SIXTEENTH, bassline: BASSLINE, gesture: GESTURE,
};

/** One instrument, and how this fixture plays it. */
export interface VoiceScene {
  /** the fixture's own name for it: the voice, and the timbre where a voice has several */
  id: string;
  /** the registered voice */
  voice: string;
  /** which figure it plays */
  pattern: keyof typeof PATTERNS | 'chord';
  /** the root of that figure, as MIDI */
  root: number;
  /** how long a note is, in seconds at the fixture's own 120 BPM */
  dur: number;
  /** anything the voice needs on top: a timbre, a preset, a tone */
  p?: NoteParams;
  /** the role this instrument is being played in, for the write-up */
  role: string;
}

// The table. One row per **playable instrument**, which is not the same as one
// row per registered voice: `keys` and `pad` each stand for several timbres and
// `p.preset` / `p.timbre` chooses, so a reading of "the keys" would be a
// reading of whichever patch the fixture happened to pick. Twenty voices are
// twenty-six instruments, and every one of them is here.
export const SCENES: VoiceScene[] = [
  // the drums, the bottom and the glue
  { id: 'kick', voice: 'kick', pattern: 'four', root: 0, dur: 0.2, role: 'kick' },
  { id: 'hatClosed', voice: 'hatClosed', pattern: 'offbeat', root: 0, dur: 0.1, role: 'offbeat' },
  { id: 'hatOpen', voice: 'hatOpen', pattern: 'offbeat', root: 0, dur: 0.2, role: 'offbeat' },
  { id: 'shaker', voice: 'shaker', pattern: 'sixteenth', root: 0, dur: 0.08, role: 'sixteenth' },
  { id: 'clap', voice: 'clap', pattern: 'backbeat', root: 0, dur: 0.2, role: 'backbeat' },
  { id: 'sub', voice: 'sub', pattern: 'bassline', root: 31, dur: 0.22, role: 'bassline' },
  // the harmonic layer, one row per timbre
  { id: 'keys:rhodes', voice: 'keys', pattern: 'figure', root: 64, dur: 0.24, p: { preset: 'rhodes' }, role: 'figure' },
  { id: 'keys:glass', voice: 'keys', pattern: 'figure', root: 64, dur: 0.24, p: { preset: 'glass' }, role: 'figure' },
  { id: 'keys:ep', voice: 'keys', pattern: 'figure', root: 64, dur: 0.24, p: { preset: 'ep' }, role: 'figure' },
  { id: 'keys:organ', voice: 'keys', pattern: 'figure', root: 64, dur: 0.24, p: { preset: 'organ' }, role: 'figure' },
  { id: 'keys:pluck', voice: 'keys', pattern: 'figure', root: 64, dur: 0.24, p: { preset: 'pluck' }, role: 'figure' },
  { id: 'piano', voice: 'piano', pattern: 'figure', root: 64, dur: 0.24, role: 'figure' },
  { id: 'pad:strings', voice: 'pad', pattern: 'chord', root: 60, dur: 3.9, p: { timbre: 'strings' }, role: 'sustained' },
  { id: 'pad:swell', voice: 'pad', pattern: 'chord', root: 60, dur: 3.9, p: { timbre: 'swell' }, role: 'sustained' },
  { id: 'pad:organ', voice: 'pad', pattern: 'chord', root: 60, dur: 3.9, p: { timbre: 'organ' }, role: 'sustained' },
  { id: 'pad:rhodes', voice: 'pad', pattern: 'chord', root: 60, dur: 3.9, p: { timbre: 'rhodes' }, role: 'sustained' },
  // the seam glue, one gesture every four bars
  { id: 'riser', voice: 'riser', pattern: 'gesture', root: 0, dur: 4, role: 'texture' },
  { id: 'sweepDown', voice: 'sweepDown', pattern: 'gesture', root: 0, dur: 2, role: 'texture' },
  { id: 'swell', voice: 'swell', pattern: 'gesture', root: 60, dur: 1.6, role: 'texture' },
  { id: 'impact', voice: 'impact', pattern: 'gesture', root: 0, dur: 1.2, role: 'texture' },
  // round G's audition instrument
  { id: 'pluckBass', voice: 'pluckBass', pattern: 'bassline', root: 43, dur: 0.24, role: 'bassline' },
  // ...and round K2's six above middle C
  { id: 'sawLead', voice: 'sawLead', pattern: 'melody', root: 67, dur: 0.42, role: 'melody' },
  { id: 'fmBell', voice: 'fmBell', pattern: 'melody', root: 67, dur: 0.6, role: 'melody' },
  { id: 'karplusPluck', voice: 'karplusPluck', pattern: 'figure', root: 64, dur: 0.26, role: 'figure' },
  { id: 'formantPad', voice: 'formantPad', pattern: 'chord', root: 60, dur: 3.9, role: 'sustained' },
  { id: 'clavKey', voice: 'clavKey', pattern: 'figure', root: 64, dur: 0.2, role: 'figure' },
  { id: 'supersawPad', voice: 'supersawPad', pattern: 'chord', root: 60, dur: 3.9, role: 'sustained' },
  // ...and the wordless vocal, a sung syllable a note, on the melody its
  // phrases are made of (the engine review of 09-22: registered with its
  // facts typed, so measured here like the rest)
  { id: 'wordlessVocal', voice: 'wordlessVocal', pattern: 'melody', root: 64, dur: 0.6, role: 'melody' },
];

/** The six this round added, in the order the round wrote them. */
export const K2 = ['sawLead', 'fmBell', 'karplusPluck', 'formantPad', 'clavKey', 'supersawPad'];

export const sceneOf = (id: string): VoiceScene => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`no scene called ${id}: try ${SCENES.map((x) => x.id).join(', ')}`);
  return s;
};

/** Velocity stays a velocity: a register variant may not push one past 1. */
export const clampVel = (v: number) => Math.max(0.05, Math.min(1, v));

export const event = (i: number, voice: string, t: number, p: NoteParams, bar: number, step: number): ProgramEvent => ({
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
  // Nothing here posts a sidechain: one instrument alone is what is being
  // measured, and a duck is the record's and not the instrument's.
  duck: false,
  gap: null,
  p,
});

export const program = (fields: Partial<Program> & { bpm: number; bars: number; duration: number; settings: Settings }): Program => ({
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
 * One instrument, alone, the way a scene is metered: `prerollBars` bars of the
 * same figure in front of the window so that nothing in the chain — the sends,
 * the limiter, a voice's own cache — starts from rest inside the stretch that
 * is measured.
 *
 * @param id a row of `SCENES`
 */
export function voiceAudition(
  id: string,
  { bpm = 120, bars = 8, prerollBars = 2, tail = 2.5, transpose = 0, velScale = 1 } = {},
): Audition {
  const scene = sceneOf(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const levelKey = VOICE_LEVEL[scene.voice];
  const gain = dbToGain(levelDb(settings, levelKey));
  const all = prerollBars + bars;
  const events: ProgramEvent[] = [];
  const base = { gain, ...(scene.p || {}) };

  if (scene.pattern === 'chord') {
    for (let b = 0; b < all; b += 2) {
      const [s, notes, vel] = CHORD[(b / 2) % CHORD.length];
      for (const semis of notes) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root + semis + transpose, vel: clampVel(vel * velScale), dur: scene.dur,
        }, b, s));
      }
    }
  } else {
    const rows = PATTERNS[scene.pattern];
    for (let b = 0; b < all; b++) {
      for (const [s, semis, vel] of rows[b % rows.length]) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root ? scene.root + semis + transpose : undefined,
          vel: clampVel(vel * velScale), dur: scene.dur,
        }, b, s));
      }
    }
  }

  return {
    name: transpose || velScale !== 1 ? `${id}@${transpose >= 0 ? '+' : ''}${transpose}` : id,
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
 * Every playable instrument in the registry has a scene, and every scene names
 * a registered voice. It is asserted rather than assumed: a voice added to the
 * registry and left out of this table would quietly have no layer signature,
 * and a layer table with a hole in it is worse than none.
 *
 * **`covered` is what the other fixture tables already play**, and it is the
 * one-argument fix round K3 asked for by name (`notes/archive/2026-09-kitchen/rounds/k3.md` §6). When
 * this function was written there was one table and "every registered voice has
 * a fixture" was a question it could answer alone; with the drum kitchen's own
 * table beside it — and round K4's third — the same question asked of one table
 * reports sixteen faults that are true of the table and false of the tree. So
 * the caller says what the others cover and this reports only the voices **no**
 * table covers. `tools/tables.ts` is the one list of the tables, so a caller
 * does not name them either.
 */
export function missingScenes(covered: string[] = []): string[] {
  const has = new Set([...SCENES.map((s) => s.voice), ...covered]);
  const out: string[] = [];
  for (const d of REGISTRY) if (!has.has(d.name)) out.push(d.name);
  for (const s of SCENES) if (!BY_NAME[s.voice]) out.push(`${s.id} names no registered voice`);
  return out;
}

// --- the two that hold ------------------------------------------------------
//
// The same fixture round G wrote for `holdStrings`, with the renderer named
// rather than assumed: one drone and nothing else, no notes, no reverb, no room
// to hide in, so the four things a held voice has to do can be *measured* —
// it holds, it is paused, it comes back at the level it was holding at, and it
// is released over its own stated tail and disposed.

/** The two held renderers this round added, by the voice they belong to. */
export const HOLDS: Record<string, HoldRenderer> = {
  formantPad: holdFormantPad,
  supersawPad: holdSupersawPad,
};

/**
 * One drone of one voice, with the moves it is going to make.
 * @param id a voice with an entry in `HOLDS`
 */
export function heldVoiceAudition(id: string, { bpm = 70, seconds = 24, at = 0.5, pause = 8, resume = 12, release = 18 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const level = VOICE_LEVEL[id];
  return {
    name: `held-${id}`,
    program: program({ bpm, bars: 0, duration: seconds, settings, events: [] }),
    drones: [{
      bus: VOICE_BUS[id],
      at,
      release,
      pause,
      resume,
      p: {
        midi: 57,
        vel: 0.6,
        gain: dbToGain(levelDb(settings, level)),
        attack: 1.2,
        // Dry, on purpose: what is measured is the voice's own release over its
        // own stated tail, and a room's tail would be in the way of it.
        reverb: 0,
        delay: 0,
      },
      controls: [{ name: 'brightness', value: 2400, at: 1.5, over: 1 }],
    }],
    window: { from: 0, to: seconds },
  };
}

/**
 * The drones of a held audition, started on a graph with every move they are
 * going to make scheduled ahead of them. It is `startDrones` in `audition.ts`
 * with the renderer looked up by name instead of being `holdStrings`, and the
 * commands are applied **in time order** for the same reason: a held voice
 * works out where a ramp had got to when the next one starts, so a command
 * written for a later instant and issued first would be the one it measures
 * against.
 */
export function startHeldVoices(
  ctx: BaseAudioContext,
  graph: V1Graph,
  audition: Audition,
  id: string,
  offset = 0,
  { schedule = true, holds = HOLDS }: { schedule?: boolean, holds?: Record<string, HoldRenderer> } = {},
): HeldVoice[] {
  const settings = audition.program.settings;
  const hold = holds[id];
  if (!hold) throw new Error(`${id} has no held renderer`);
  return audition.drones.map((d) => {
    const held = hold(ctx, graph.buses[d.bus], offset + d.at, d.p, settings);
    if (!schedule) return held;
    const cmds: Array<{ t: number, run: () => void }> = [];
    for (const c of d.controls) cmds.push({ t: c.at, run: () => held.setControl(c.name, c.value, offset + c.at, c.over) });
    if (d.pause != null) cmds.push({ t: d.pause, run: () => held.pause(offset + (d.pause as number)) });
    if (d.resume != null) cmds.push({ t: d.resume, run: () => held.resume(offset + (d.resume as number)) });
    cmds.push({ t: d.release, run: () => held.release(offset + d.release) });
    cmds.sort((a, b) => a.t - b.t);
    for (const c of cmds) c.run();
    return held;
  });
}

// --- for a listener ---------------------------------------------------------
//
// A gate measures one instrument against its own declared numbers and says
// nothing about whether it is worth having, which is Eugene's ear and nobody
// else's. These two fixtures are for that ear and for no gate.

// Four chords, four bars each: the harmony a figure is heard over. They are the
// drone audition's own progression in this fixture's key, so an instrument is
// heard against the same chords the engine's other audition uses.
export const PROGRESSION: Array<{ root: number, chord: number[] }> = [
  { root: 0, chord: [0, 3, 7] },
  { root: -2, chord: [-2, 2, 5] },
  { root: 5, chord: [-7, -3, 0] },
  { root: 3, chord: [-4, 0, 3] },
];

/**
 * One instrument on its own figure, over four chords: sixteen bars, the figure
 * following the harmony, with a quiet organ pad underneath so the line is heard
 * against something rather than in a vacuum.
 */
export function voiceOverChords(id: string, { bpm = 120, bars = 16, padDb = -6 } = {}): Audition {
  const scene = sceneOf(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const levelKey = VOICE_LEVEL[scene.voice];
  const gain = dbToGain(levelDb(settings, levelKey));
  const padGain = dbToGain(levelDb(settings, VOICE_LEVEL.pad) + padDb);
  const events: ProgramEvent[] = [];
  const base = { gain, ...(scene.p || {}) };
  const rows = scene.pattern === 'chord' ? null : PATTERNS[scene.pattern];

  for (let b = 0; b < bars; b++) {
    const here = PROGRESSION[Math.floor(b / 4) % PROGRESSION.length];
    // The pad: the chord, once every four bars, under everything.
    if (b % 4 === 0 && scene.voice !== 'pad') {
      for (const semis of here.chord) {
        events.push(event(events.length, 'pad', b * barSeconds, {
          midi: 60 + semis, timbre: 'organ', vel: 0.45, gain: padGain,
          dur: barSeconds * 4 - 0.1, reverb: 0.7, delay: 0.1, attack: 0.9,
        }, b, 0));
      }
    }
    if (rows) {
      for (const [s, semis, vel] of rows[b % rows.length]) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root ? scene.root + here.root + semis : undefined, vel, dur: scene.dur,
        }, b, s));
      }
    } else if (b % 2 === 0) {
      const [s, notes, vel] = CHORD[(b / 2) % CHORD.length];
      for (const semis of notes) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root + here.root + semis, vel, dur: scene.dur,
        }, b, s));
      }
    }
  }
  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });

  return {
    name: `${id}-over-chords`,
    program: program({
      bpm, bars, duration: bars * barSeconds + 4, settings,
      levels: { [levelKey]: levelDb(settings, levelKey), [VOICE_LEVEL.pad]: levelDb(settings, VOICE_LEVEL.pad) },
      events,
    }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + 4 },
  };
}

/**
 * All six of round K2's voices over a house groove: sixteen bars, written out
 * by hand, every note a number in a table. It is round G's drone audition's
 * opposite number — that one proved the engine can play music with no drums in
 * it, and this one is the six new instruments in the place they would actually
 * stand if a strategy ever drew them.
 *
 * The arrangement, bar by bar: the groove throughout; the supersaw holds the
 * chords from the top; the formant pad answers it from bar 4; the clavinet
 * plays the figure from bar 4 and the Karplus string from bar 8; the bell
 * marks the half; and the saw lead takes the last eight bars, which is where a
 * lead belongs.
 */
export function sixTogether({ bpm = 122, bars = 16 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const g = (name: string, db = 0) => dbToGain(levelDb(settings, VOICE_LEVEL[name]) + db);
  const events: ProgramEvent[] = [];
  const at = (voice: string, b: number, s: number, p: NoteParams) =>
    events.push(event(events.length, voice, b * barSeconds + s * step, p, b, s));

  for (let b = 0; b < bars; b++) {
    const here = PROGRESSION[Math.floor(b / 4) % PROGRESSION.length];
    // The groove: four on the floor, an offbeat hat, a backbeat clap from the
    // fifth bar, and a bass line under all of it.
    for (const s of [0, 4, 8, 12]) at('kick', b, s, { vel: 0.95, gain: g('kick') });
    for (const s of [2, 6, 10, 14]) at('hatClosed', b, s, { vel: s === 14 ? 0.9 : 0.8, gain: g('hatClosed') });
    if (b >= 4) for (const s of [4, 12]) at('clap', b, s, { vel: 0.85, gain: g('clap') });
    if (b >= 8) at('hatOpen', b, 14, { vel: 0.7, gain: g('hatOpen') });
    for (const [s, semis, vel] of BASSLINE[b % BASSLINE.length]) {
      at('sub', b, s, { midi: 31 + here.root + semis, vel, gain: g('sub'), dur: 0.22 });
    }
    // The supersaw holds the harmony from the first bar; the formant pad
    // answers it from the fifth, an octave up and quieter.
    if (b % 4 === 0) {
      for (const semis of here.chord) {
        at('supersawPad', b, 0, { midi: 60 + semis, vel: 0.6, gain: g('supersawPad', -2), dur: barSeconds * 4 - 0.2, reverb: 0.5 });
      }
      if (b >= 4) {
        for (const semis of here.chord) {
          at('formantPad', b, 2, { midi: 67 + semis, vel: 0.5, gain: g('formantPad', -4), dur: barSeconds * 4 - 0.6, reverb: 0.6 });
        }
      }
    }
    // The clavinet's figure, the string answering it from the ninth bar.
    if (b >= 4) {
      for (const [s, semis, vel] of FIGURE[b % FIGURE.length]) {
        at('clavKey', b, s, { midi: 64 + here.root + semis, vel, gain: g('clavKey'), dur: 0.18 });
      }
    }
    if (b >= 8) {
      for (const [s, semis, vel] of FIGURE[(b + 2) % FIGURE.length]) {
        at('karplusPluck', b, (s + 2) % 16, { midi: 71 + here.root + semis, vel: vel * 0.8, gain: g('karplusPluck', -1), dur: 0.26 });
      }
    }
    // The bell marks the half, and the lead takes the last eight bars.
    if (b === 8) at('fmBell', b, 0, { midi: 79 + here.root, vel: 0.9, gain: g('fmBell'), dur: 1.2, tone: 'bell' });
    if (b === 12) at('fmBell', b, 8, { midi: 84 + here.root, vel: 0.7, gain: g('fmBell', -3), dur: 1.2, tone: 'glass' });
    if (b >= 8) {
      for (const [s, semis, vel] of MELODY[b % MELODY.length]) {
        at('sawLead', b, s, { midi: 67 + here.root + semis, vel, gain: g('sawLead'), dur: 0.42 });
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
    name: 'together',
    program: program({
      bpm, bars, duration: bars * barSeconds + 5, settings,
      levels, events,
    }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + 5 },
  };
}

export default { SCENES, K2, voiceAudition, sceneOf, missingScenes, heldVoiceAudition, startHeldVoices, voiceOverChords, sixTogether };
