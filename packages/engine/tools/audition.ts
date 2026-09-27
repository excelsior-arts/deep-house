// Two auditions, written out by hand.
//
//   npm test -w @deep-house/engine      plays them and measures them
//   node tools/ear.ts                  renders them to tmp/ear/*.wav
//
// Round G of PLAN-V1-NEXT is the round that asks whether the boundaries the
// stretch drew actually hold for the two things v2 needs most, *without any
// change to what listeners hear*. So these are the two things, as fixtures:
//
//   the pluck   the new instrument (`src/voices/pluck-bass.ts`), alone, through
//               the real graph, in the way the nine scenes meter a window —
//               eight bars with two bars of pre-roll in front of them so the
//               sends and the limiter are running by the time the window
//               opens. It is what the voice's declared loudness is measured
//               from and what its click, mono and peak gates are read off.
//   the drone   a drumless, sustained, long-tailed composition at 70 BPM: two
//               held ensembles and a chord that changes every four bars, a slow
//               line under it from the new instrument, a filter opening over a
//               minute, the reverb send at its maximum — **no kick, no hats,
//               no clap**, so the sidechain has nothing to post and the record
//               has nothing to pump against. It is the design review's second
//               example (§7: *airy, simple, meditative, drumless*; §11 phase
//               five) and the reason the engine may not assume a four-on-the-
//               floor anywhere.
//
// **Nothing here is composed.** There is no die, no corpus, no style and no
// generator: every note is a number in a table below, and what the two
// auditions prove is that the machine plays what it is handed. They are the
// engine's own tests and they are on no page: the released randomiser cannot
// reach either of them, the voice they share is named by no candidate list, and
// both digests are byte-identical either side of the round that wrote them.
//
// A hand-over between the two halves of round G is worth naming: a **drone is
// not an event**. The Program contract carries notes with an onset, an arrival
// and a duration, which is what a note is; a voice that holds until somebody
// lets it go has no duration to carry, so an audition is a program *and* a list
// of drones, and the runner starts the second with the held-voice contract
// (`src/voices/voice-contract.ts`) while the schedule fires the first.

import { resolveSettings } from '../src/settings.ts';
import { dbToGain } from '../src/dsp.ts';
import { holdStrings, BY_NAME, VOICE_BUS, VOICE_LEVEL, VOICES } from '../src/voices/index.ts';
import { schedule, offsetGrid } from '../src/schedule.ts';
import { table } from './fixture.ts';
import type { V1Graph } from '../src/graph.ts';
import type { Program, ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { VoiceOut } from '../src/dsp.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { HeldVoice } from '../src/voices/voice-contract.ts';

/** One move of one control of one drone, in the piece's own seconds. */
export interface DroneControl {
  name: string;
  value: number;
  at: number;
  over?: number;
}

/** One held voice: where it starts, what it holds, how it is moved, when it goes. */
export interface DroneSpec {
  /** which bus of the graph it is played into */
  bus: string;
  /** when it starts and when `release` is called, in the piece's own seconds */
  at: number;
  release: number;
  p: NoteParams;
  controls: DroneControl[];
  /** a transport stop and start *inside* the piece, if it has one */
  pause?: number;
  resume?: number;
}

/** A fixture: a program to schedule, drones to hold, and the window to meter. */
export interface Audition {
  name: string;
  program: Program;
  drones: DroneSpec[];
  /** the stretch that is metered, in the piece's own seconds; before it is pre-roll */
  window: { from: number; to: number };
}

/**
 * The decibel a voice is trimmed to, out of the settings' own level table.
 *
 * A descriptor's `level` is "the key in the settings' `levels` it is trimmed
 * to" (`src/voices/descriptor.ts`), but the registry is open and `VOICE_LEVEL`
 * is therefore a `Record<string, string>`, where `levels` is a closed table of
 * named fields. So the table is read **by name**, which is exactly how
 * `buildMaster` reads it (`src/master.ts`'s `level()`), and this says in one
 * place what that reading assumes rather than saying it at each of the ten
 * places below.
 */
const levelDb = (settings: Settings, key: string): number => (settings.levels as Record<string, number>)[key];

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
  // No kick posts a sidechain here because there is no kick: `duck` is false on
  // every event of both auditions, and the drone fixture asserts it.
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

// --- the pluck: eight bars of one instrument, and two before them -----------
//
// A four-bar figure, twice, in the register the instrument was written for: a
// root an octave over where the sub sits and a line that leaves the downbeat
// alone as often as it takes it. The velocities fall away from the bar line,
// which is the only thing here that is a musical decision and it is a small
// one — a figure played flat would measure the same and sound like a test.
//
// Steps are sixteenths. `[step, midi, velocity]`.
const FIGURE: Array<Array<[number, number, number]>> = [
  [[0, 43, 0.95], [3, 43, 0.6], [6, 50, 0.8], [10, 46, 0.7], [14, 43, 0.6]],
  [[0, 43, 0.95], [3, 55, 0.5], [6, 50, 0.8], [11, 48, 0.7], [14, 46, 0.6]],
  [[0, 41, 0.95], [3, 41, 0.6], [6, 48, 0.8], [10, 45, 0.7], [14, 41, 0.6]],
  [[0, 46, 0.95], [4, 46, 0.6], [7, 53, 0.8], [10, 50, 0.7], [13, 46, 0.6]],
];

/**
 * The plucked mid bass, alone, the way a scene is metered: `prerollBars` bars
 * of the same figure in front of the window so nothing in the chain starts
 * from rest inside it.
 */
export function pluckAudition({ bpm = 120, bars = 8, prerollBars = 2, tail = 1.5 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const gain = dbToGain(levelDb(settings, VOICE_LEVEL.pluckBass));
  const all = prerollBars + bars;
  const events: ProgramEvent[] = [];
  for (let b = 0; b < all; b++) {
    for (const [s, midi, vel] of FIGURE[b % FIGURE.length]) {
      events.push(event(events.length, 'pluckBass', b * barSeconds + s * step, {
        midi, vel, gain, dur: 0.24,
      }, b, s));
    }
  }
  return {
    name: 'pluck',
    program: program({
      bpm, bars: all, duration: all * barSeconds + tail, settings,
      levels: { [VOICE_LEVEL.pluckBass]: levelDb(settings, VOICE_LEVEL.pluckBass) },
      events,
    }),
    drones: [],
    window: { from: prerollBars * barSeconds, to: all * barSeconds },
  };
}

// --- the drone: no drums, long notes, longer tails --------------------------
//
// The room is the fixture's table with an audition room over it, resolved the
// way every other room in this engine is resolved. Three things are moved and
// each is the point of the fixture: a reverb four seconds long and well up,
// because a tail that has to still be there after the last note has to be
// worth hearing; a master filter that starts nearly shut, because the piece's
// one automation line opens it over a minute; and a sidechain left exactly
// where the table has it, unused, because nothing in this piece posts one.
const DRONE_ROOM = {
  sends: {
    reverbSeconds: 4.2, reverbLevel: 0.34, reverbToneHz: 4200, reverbLowHz: 180, reverbCorr: 0.35,
    hallSeconds: 4.5, hallLevel: 0.2, hallDecay: 3.4,
    delayLevel: 0.06,
  },
  space: { widthBase: 1, widthDepth: 0.12, widthRateHz: 0.07, padDriftCents: 3 },
  master: { filterOpen: 18000, filterClosed: 320 },
};

// The chord, four bars at a time: what the sustained voice holds while the
// drone underneath it stays where it is. Four changes over the piece and no
// more — *few harmonic changes, sparse notes or sustained gestures* is the
// brief the design review writes for this kind of music, and a chord a bar
// would be a house arrangement with the drums taken out, which is the thing it
// warns against.
const CHORD: number[][] = [
  [62, 65, 69],
  [60, 64, 67],
  [62, 67, 70],
  [59, 62, 67],
  [62, 65, 69],
  [57, 60, 64],
];

// The line: one note every two bars, from the new instrument, walking. It is a
// melody by the standards of a piece with six chords in a minute and a half.
const LINE: Array<[number, number]> = [
  [2, 50], [4, 53], [6, 55], [8, 53], [10, 58], [12, 55], [14, 53], [16, 50],
  [18, 55], [20, 58], [22, 57], [24, 53],
];

/**
 * A drumless, sustained, long-tailed piece at 70 BPM: the tempo the set clock
 * carries unchanged, notes that last seconds, a filter that opens over a
 * minute, and nothing anywhere that a kick has to be present for.
 */
export function droneAudition({ bpm = 70, bars = 26, tail = 3 } = {}): Audition {
  const settings = resolveSettings({ base: table, room: DRONE_ROOM });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const padGain = dbToGain(levelDb(settings, VOICE_LEVEL.pad));
  const lineGain = dbToGain(levelDb(settings, VOICE_LEVEL.pluckBass));
  const events: ProgramEvent[] = [];

  // The sustained voice: one chord every four bars, each note held for the
  // whole of it and a second over, so the chords overlap rather than meet.
  CHORD.forEach((notes, c) => {
    const bar = c * 4;
    if (bar >= bars) return;
    for (const midi of notes) {
      events.push(event(events.length, 'pad', bar * barSeconds, {
        midi,
        timbre: 'organ',
        vel: 0.5,
        gain: padGain,
        dur: barSeconds * 4 + 1.5,
        // The send at its maximum: everything this voice makes goes to the
        // long room as well as to the bus.
        reverb: 1,
        delay: 0.15,
        attack: 1.4,
      }, bar, 0));
    }
  });

  // The line, under it.
  for (const [bar, midi] of LINE) {
    if (bar >= bars) continue;
    events.push(event(events.length, 'pluckBass', bar * barSeconds + beat, {
      midi, vel: 0.85, gain: lineGain, dur: 2.4, release: 0.6,
    }, bar, 4));
  }
  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });

  const lastNote = events.reduce((t, e) => Math.max(t, e.t + (e.p.dur || 0)), 0);
  const duration = bars * barSeconds + tail;

  return {
    name: 'drone',
    program: program({
      bpm, bars, duration, settings,
      levels: {
        [VOICE_LEVEL.pad]: levelDb(settings, VOICE_LEVEL.pad),
        [VOICE_LEVEL.pluckBass]: levelDb(settings, VOICE_LEVEL.pluckBass),
      },
      events,
      // One line, and it is the whole arrangement: the master filter opening
      // from nearly shut to wide over the first minute. Exponential, because a
      // filter opening evenly opens evenly in octaves.
      automation: [{
        param: 'macro.frequency',
        curve: 'exponential',
        points: [
          { t: 0, value: settings.master.filterClosed },
          { t: 60, value: settings.master.filterOpen },
        ],
      }],
    }),
    // The two held ensembles: the drone proper. They start two bars apart, hold
    // through the whole piece, brighten over forty seconds in the middle of it
    // and are released with eight seconds to spare — so what is left at the end
    // is the room and nothing else, which is what the tail assertion is for.
    drones: [
      {
        bus: 'melodic',
        at: 0.5,
        release: bars * barSeconds - 3.5,
        p: { midi: 38, vel: 0.55, gain: padGain, reverb: 1, delay: 0.05, attack: 3.5, spread: 0.7 },
        controls: [
          { name: 'brightness', value: 2600, at: 20, over: 40 },
          { name: 'gain', value: padGain * 0.7, at: 66, over: 14 },
        ],
      },
      {
        bus: 'melodic',
        at: barSeconds * 2,
        release: bars * barSeconds - 3.5,
        p: { midi: 57, vel: 0.4, gain: padGain, reverb: 1, delay: 0.1, attack: 5, spread: 1 },
        controls: [
          { name: 'brightness', value: 1800, at: 30, over: 30 },
        ],
      },
    ],
    window: { from: 0, to: Math.min(duration, lastNote + tail) },
  };
}

// --- the held-voice contract, on its own ------------------------------------

/**
 * One drone and nothing else: no notes, no reverb, no room to hide in.
 *
 * It exists so that the four things a held voice has to do can be *measured*
 * rather than described — it holds, it is paused, it comes back at the level it
 * was holding at, and it is released over its own stated tail and disposed.
 * With a note under it or a four-second room around it none of those windows
 * would be silent enough to read, so this fixture has neither.
 */
export function heldAudition({ bpm = 70, seconds = 24, at = 0.5, pause = 8, resume = 12, release = 18 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  return {
    name: 'held',
    program: program({ bpm, bars: 0, duration: seconds, settings, events: [] }),
    drones: [{
      bus: 'melodic',
      at,
      release,
      pause,
      resume,
      p: {
        midi: 45,
        vel: 0.6,
        gain: dbToGain(levelDb(settings, VOICE_LEVEL.pad)),
        attack: 1.2,
        // Dry, on purpose: what is being measured is the voice's own release
        // over its own stated tail, and a room's tail would be in the way of it.
        reverb: 0,
        delay: 0,
      },
      controls: [{ name: 'brightness', value: 1900, at: 1.5, over: 1 }],
    }],
    window: { from: 0, to: seconds },
  };
}

/**
 * The drones of an audition, started on a graph at an offset on the context's
 * clock, with every move they are going to make scheduled ahead of them.
 *
 * It is the other half of `schedule(program, grid)`: that says which notes
 * sound and when, and this says which voices are *holding* and what is done to
 * them while they hold. A live caller may pass `{ schedule: false }` and move
 * them itself, which is what a scenario driving a drone by hand does.
 *
 * The moves are applied **in time order** and not in the order the fixture
 * happens to write them down. A held voice works out where a ramp had got to
 * when the next one starts, so a command written for a later instant and
 * issued first would be the one it measures against; commands with an
 * effective time are the design review's §9 and an order is part of what that
 * means.
 */
export function startDrones(
  ctx: BaseAudioContext,
  graph: V1Graph,
  audition: Audition,
  offset = 0,
  { schedule = true } = {},
): HeldVoice[] {
  const settings = audition.program.settings;
  return audition.drones.map((d) => {
    const held = holdStrings(ctx, graph.buses[d.bus], offset + d.at, d.p, settings);
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


// --- the effects kitchen's own fixture (round K1) ---------------------------
//
// One source, played twice: once into a wire and once into the effect under
// test, so that every reading of an effect is a reading *against its own dry*
// and not against a memory of what the fixture sounds like.
//
// Two sources, because the six effects are not all asking the same question.
// PLAN-KITCHEN's K1 says so: **the drone fixture's strings, and a pluck line
// for the drive family** — a chorus, a tremolo, a flanger and a delay want
// something held, with a tail and a wide image to move, and a shaper wants
// transients, because what a shaper does to a decaying pluck is the thing a
// listener can actually hear it doing.
//
// Neither is composed. The chords are a table below and the pluck line is the
// one round G wrote; no die, no corpus, no style.

// Four chords, one every two bars, held over the line so they overlap: the
// drone fixture's own habit, at a tempo that fits two of them into the ten
// seconds an audition gives each half.
const EFFECT_CHORD: number[][] = [
  [55, 62, 67, 71],
  [53, 60, 65, 69],
  [57, 64, 69, 72],
  [50, 57, 62, 66],
];

/**
 * The fixture the six effects are measured and auditioned through.
 *
 * `source: 'strings'` is the sustained ensemble — the drone fixture's own
 * voice, on its own default timbre, dry, so that what a reading measures is the
 * effect and not a room in front of it. `source: 'pluck'` is round G's figure
 * on the plucked mid bass, which is where the drive family is measured.
 *
 * The gain is under the level table's own, deliberately: the fixture is played
 * into a wire rather than into the master, so nothing is holding a ceiling for
 * it, and an effect that adds six decibels has to have somewhere to put them.
 */
export function effectAudition({ source = 'strings', bpm = 0, bars = 0, tail = 4 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const isPluck = source === 'pluck';
  const rate = bpm || (isPluck ? 120 : 100);
  const beat = 60 / rate;
  const barSeconds = beat * 4;
  const count = bars || (isPluck ? 5 : 4);
  const events: ProgramEvent[] = [];

  if (isPluck) {
    const gain = dbToGain(levelDb(settings, VOICE_LEVEL.pluckBass)) * 0.9;
    const step = beat / 4;
    for (let b = 0; b < count; b++) {
      for (const [s, midi, vel] of FIGURE[b % FIGURE.length]) {
        events.push(event(events.length, 'pluckBass', b * barSeconds + s * step, {
          midi, vel, gain, dur: 0.24,
        }, b, s));
      }
    }
  } else {
    // A quarter of the level table's own pad, which lands the four-note chord
    // at about -10 dBFS: room for a drive to make something of it.
    const gain = dbToGain(levelDb(settings, VOICE_LEVEL.pad)) * 0.42;
    EFFECT_CHORD.forEach((notes, c) => {
      const bar = c * 2;
      if (bar >= count) return;
      notes.forEach((midi, i) => {
        events.push(event(events.length, 'pad', bar * barSeconds + i * (beat / 8), {
          midi,
          vel: 0.55,
          gain,
          dur: barSeconds * 2 + 0.6,
          attack: 0.05,
          // Dry: the fixture is played into the effect and nothing else, so a
          // send here would be measuring a room.
          reverb: 0,
          delay: 0,
        }, bar, i));
      });
    });
  }

  // When the source actually stops — the last note's own end, its release and
  // a little air — rather than the last bar line. Half of what this fixture is
  // for is what an effect is left holding when its input stops, and a window
  // that ended while the ensemble was still sounding would be measuring the
  // ensemble.
  const stops = events.reduce((t, e) => Math.max(t, e.t + (e.p.dur || 0) + (e.p.release || 0.6)), 0);

  return {
    name: `effect-${source}`,
    program: program({
      bpm: rate,
      bars: count,
      duration: stops + tail,
      settings,
      levels: { [VOICE_LEVEL.pad]: levelDb(settings, VOICE_LEVEL.pad) },
      events,
    }),
    drones: [],
    window: { from: 0, to: +stops.toFixed(3) },
  };
}

/**
 * An audition's events, fired into one bus object at an offset.
 *
 * It is `startDrones`' twin for the half of a fixture that is notes, and it
 * exists so that a measurement can put something other than the v1 graph in
 * front of the voices: an effect's `input`, wrapped as the bus object every
 * voice in this engine is handed. The one scheduling contract still says which
 * events sound and when — nothing here counts bars.
 */
export function playAudition(
  ctx: BaseAudioContext,
  audition: Audition,
  target: VoiceOut,
  at = 0,
): number {
  const { program: prog } = audition;
  let fired = 0;
  for (const s of schedule(prog, offsetGrid(at)).events) {
    const voice = VOICES[s.pe.voice];
    if (!voice) continue;
    voice(ctx, target, s.at, s.pe.p, prog.settings);
    fired++;
  }
  return fired;
}

export default { pluckAudition, droneAudition, heldAudition, effectAudition, startDrones, playAudition };
