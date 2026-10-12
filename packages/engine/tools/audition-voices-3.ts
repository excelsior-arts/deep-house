// Round KV1's voices, each alone on the figure its role plays: the fifth
// fixture table in this engine.
//
//   node tools/test-voices-3.ts      measures them against their own declared
//                                     numbers, and reads back what each claims
//                                     (its pitch, its envelope, its spectrum)
//   node tools/ear-voices-3.ts       writes a four-bar audition of each into
//                                     tmp/kv1/ for a listener
//
// It is `audition-voices-2.ts`'s table again and, like that one, it rewrites
// none of the figures: the patterns, the chord, the event and program builders
// and the progression are imported from `audition-voices.ts`, so a reading of
// the reese and a reading of `sub` are readings of the same bass line.
//
// What is its own is the rows, and one figure the older tables have no need
// of: `tied`, a line whose notes run into each other, which is the only way to
// hear a glide at all.

import { resolveSettings } from '../src/settings.ts';
import { dbToGain } from '../src/dsp.ts';
import { VOICE_LEVEL, BY_NAME } from '../src/voices/index.ts';
import { table } from './fixture.ts';
import { PATTERNS, CHORD, PROGRESSION, event, program, clampVel } from './audition-voices.ts';
import type { Hit, VoiceScene } from './audition-voices.ts';
import type { ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { Audition } from './audition.ts';

const levelDb = (settings: Settings, key: string): number => (settings.levels as Record<string, number>)[key];

/**
 * A line whose notes are tied: every note lasts until the next one begins, and
 * the ones marked `glide` slide into their pitch from the note before. It is the
 * 303 line's figure — four bars, sixteenths with rests, the octave jumps a 303
 * line is made of — and `dur` on its row is ignored, because a tied note's
 * length is the distance to the next.
 */
const TIED: Array<Array<[number, number, number, boolean]>> = [
  [[0, 0, 0.95, false], [3, 12, 0.7, false], [4, 0, 0.8, true], [6, 3, 0.9, false], [8, 0, 0.7, true], [10, 7, 0.95, false], [12, 5, 0.7, true], [14, 0, 0.8, false]],
  [[0, 0, 0.95, false], [2, 0, 0.6, false], [4, 12, 0.9, false], [6, 10, 0.7, true], [8, 7, 0.95, false], [11, 5, 0.7, false], [12, 3, 0.8, true], [14, 0, 0.7, false]],
];

/**
 * One row per playable instrument this round adds. The register each is played
 * in is the one it is for: the reese in the brief's 28-45, which is the bass
 * line's own root and its fifth and seventh over it.
 */
export const SCENES_3: VoiceScene[] = [
  { id: 'reeseBass', voice: 'reeseBass', pattern: 'bassline', root: 33, dur: 0.3, role: 'bassline' },
  { id: 'reeseDriven', voice: 'reeseDriven', pattern: 'bassline', root: 33, dur: 0.3, role: 'bassline' },
  // round DNB-1's deep reese on the same figure: the sine carrying the note
  { id: 'reeseDeep', voice: 'reeseDeep', pattern: 'bassline', root: 33, dur: 0.3, role: 'bassline' },
  // round DUB-1: the reese that carries the sub with the wobble on its filter
  { id: 'reeseWobble', voice: 'reeseWobble', pattern: 'bassline', root: 33, dur: 0.3, role: 'bassline' },
  // the liquid place's clean sine line (dnb-3, 10-06)
  { id: 'reeseSub', voice: 'reeseSub', pattern: 'bassline', root: 33, dur: 0.3, role: 'bassline' },
  // the 303 line on the tied figure, from C2: its octave jumps reach C3
  { id: 'line303', voice: 'line303', pattern: 'bassline', root: 36, dur: 0.12, role: 'bassline' },
  // the shimmer on the held chord from C5: its octaves are 1-4 kHz and climb
  { id: 'shimmerPad', voice: 'shimmerPad', pattern: 'chord', root: 72, dur: 3.9, role: 'sustained' },
  // the supersaw lead on the melody from G4, each note held most of a beat
  { id: 'supersawLead', voice: 'supersawLead', pattern: 'melody', root: 67, dur: 0.9, role: 'melody' },
  // the siren from C5, one two-second glide every four bars
  { id: 'siren', voice: 'siren', pattern: 'gesture', root: 72, dur: 2, role: 'melody' },
  // the struck organ on the figure from E4, short stabs
  { id: 'organStab', voice: 'organStab', pattern: 'figure', root: 64, dur: 0.2, role: 'figure' },
];

/** The instruments this round added, in the order it wrote them. */
export const KV1_VOICES = SCENES_3.map((s) => s.id);

/** The rows played on the tied figure rather than on their role's own. */
export const TIED_ROWS = new Set<string>(['line303']);

export const scene3Of = (id: string): VoiceScene => {
  const s = SCENES_3.find((x) => x.id === id);
  if (!s) throw new Error(`no scene called ${id}: try ${KV1_VOICES.join(', ')}`);
  return s;
};

/**
 * The loudest notes of the tied figure are accented, on a voice that takes an
 * accent — in the listener's four bars only. The metered figure writes no
 * control at all, so a control written at its default is that figure to the
 * sample (`tools/test-voices.ts --controls`).
 */
const accentOf = (voice: string, vel: number): { accent?: number } =>
  (vel >= 0.95 && BY_NAME[voice].noteControls?.includes('accent') ? { accent: 1 } : {});

/** The tied figure's notes for one bar, as `[step, semitones, velocity, glide, length in steps]`. */
function tiedBar(b: number): Array<[number, number, number, boolean, number]> {
  const row = TIED[b % TIED.length];
  return row.map(([s, semis, vel, glide], i) => {
    const next = i + 1 < row.length ? row[i + 1][0] : 16;
    return [s, semis, vel, glide, next - s];
  });
}

/**
 * One instrument, alone, the way every scene is metered: `prerollBars` bars of
 * the figure in front of the window so nothing in the chain starts from rest
 * inside the stretch that is read. It is `voiceAudition2` with this round's
 * table behind it and the tied figure beside the others.
 */
export function voiceAudition3(
  id: string,
  { bpm = 120, bars = 8, prerollBars = 2, tail = 3, transpose = 0, velScale = 1 } = {},
): Audition {
  const scene = scene3Of(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const levelKey = VOICE_LEVEL[scene.voice];
  const gain = dbToGain(levelDb(settings, levelKey));
  const all = prerollBars + bars;
  const events: ProgramEvent[] = [];
  const base = { gain, ...(scene.p || {}) };

  if (TIED_ROWS.has(id)) {
    let last: number | null = null;
    for (let b = 0; b < all; b++) {
      for (const [s, semis, vel, glide, len] of tiedBar(b)) {
        const midi = scene.root + semis + transpose;
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi, vel: clampVel(vel * velScale), dur: len * step,
          ...(glide && last != null ? { glideFrom: last } : {}),
        }, b, s));
        last = midi;
      }
    }
  } else if (scene.pattern === 'chord') {
    for (let b = 0; b < all; b += 2) {
      const [s, notes, vel] = CHORD[(b / 2) % CHORD.length];
      for (const semis of notes) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root + semis + transpose, vel: clampVel(vel * velScale), dur: scene.dur,
        }, b, s));
      }
    }
  } else {
    const rows: Hit[][] = PATTERNS[scene.pattern];
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
 * **One note, alone**: what the read-backs are taken on. A pitch, an envelope
 * and a spectrum are each a property of a note, and a figure of them is several
 * notes overlapping; so the gate asks for one, at a stated pitch and length,
 * with a second of silence either side.
 */
export function oneNote3(id: string, { midi, dur = 1, vel = 0.9, bpm = 120, p = {} }: { midi?: number; dur?: number; vel?: number; bpm?: number; p?: Record<string, unknown> } = {}): Audition {
  const scene = scene3Of(id);
  const settings = resolveSettings({ base: table });
  const levelKey = VOICE_LEVEL[scene.voice];
  const at = 0.5;
  const events: ProgramEvent[] = [event(0, scene.voice, at, {
    gain: dbToGain(levelDb(settings, levelKey)), ...(scene.p || {}),
    midi: midi ?? (scene.root || undefined), vel, dur, ...p,
  }, 0, 0)];
  return {
    name: `${id}-one`,
    program: program({ bpm, bars: 1, duration: at + dur + 4, settings, levels: { [levelKey]: levelDb(settings, levelKey) }, events }),
    drones: [],
    window: { from: at, to: at + dur },
  };
}

/**
 * For a listener: four bars of one instrument on its figure over a chord a
 * bar, with a quiet organ pad under anything that is not itself a pad.
 */
export function voiceOverChords3(id: string, { bpm = 120, bars = 4, padDb = -8, extra = {} as Record<string, unknown> } = {}): Audition {
  const scene = scene3Of(id);
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const levelKey = VOICE_LEVEL[scene.voice];
  const gain = dbToGain(levelDb(settings, levelKey));
  const padGain = dbToGain(levelDb(settings, VOICE_LEVEL.pad) + padDb);
  const events: ProgramEvent[] = [];
  const base = { gain, ...(scene.p || {}), ...extra };
  let last: number | null = null;
  for (let b = 0; b < bars; b++) {
    const here = PROGRESSION[b % PROGRESSION.length];
    if (BY_NAME[scene.voice].layer !== 'pad') {
      for (const semis of here.chord) {
        events.push(event(events.length, 'pad', b * barSeconds, {
          midi: 60 + semis, timbre: 'organ', vel: 0.45, gain: padGain,
          dur: barSeconds - 0.05, reverb: 0.7, delay: 0.1, attack: 0.3,
        }, b, 0));
      }
    }
    if (TIED_ROWS.has(id)) {
      for (const [s, semis, vel, glide, len] of tiedBar(b)) {
        const midi = scene.root + here.root + semis;
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi, vel, dur: len * step, ...(glide && last != null ? { glideFrom: last } : {}), ...accentOf(scene.voice, vel),
        }, b, s));
        last = midi;
      }
    } else if (scene.pattern === 'chord') {
      for (const semis of here.chord) {
        events.push(event(events.length, scene.voice, b * barSeconds, {
          ...base, midi: scene.root + semis, vel: 0.7, dur: Math.min(scene.dur, barSeconds - 0.05),
        }, b, 0));
      }
    } else {
      const rows: Hit[][] = PATTERNS[scene.pattern];
      for (const [s, semis, vel] of rows[b % rows.length]) {
        events.push(event(events.length, scene.voice, b * barSeconds + s * step, {
          ...base, midi: scene.root ? scene.root + here.root + semis : undefined, vel, dur: scene.dur,
        }, b, s));
      }
    }
  }
  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });
  return {
    name: `${id}-four-bars`,
    program: program({
      bpm, bars, duration: bars * barSeconds + 4, settings,
      levels: { [levelKey]: levelDb(settings, levelKey), [VOICE_LEVEL.pad]: levelDb(settings, VOICE_LEVEL.pad) },
      events,
    }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + 4 },
  };
}

export default { SCENES_3, KV1_VOICES, TIED_ROWS, scene3Of, voiceAudition3, oneNote3, voiceOverChords3 };
