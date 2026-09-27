// Round K4's sixteen, each alone on the same figure the rest of the catalogue
// plays: the fourth fixture table in this engine.
//
//   node tools/test-voices-2.ts      measures them against their own declared
//                                     numbers, in two engines and at both rates
//   node tools/ear-voices-2.ts       writes them as files somebody can hear
//
// It is `audition-voices.ts`'s table again and it deliberately does not rewrite
// any of it: the figures, the chord, the event builder, the program builder and
// the four-chord progression are **imported** from that file, so a reading of
// `marimba` and a reading of `keys:rhodes` are readings of the same notes.
// That is the whole point of a fixture table rather than a fixture per voice,
// and it is what makes a per-layer imprint comparable at all.
//
// What is here is the rows, the two that hold, and two pieces of music for a
// listener.

import { resolveSettings } from '../src/settings.ts';
import { dbToGain } from '../src/dsp.ts';
import { VOICE_BUS, VOICE_LEVEL, BY_NAME, holdGrainPad, holdWavePad } from '../src/voices/index.ts';
import { table } from './fixture.ts';
import {
  PATTERNS, CHORD, PROGRESSION, event, program, clampVel,
} from './audition-voices.ts';
import type { ProgramEvent } from '../src/program.ts';
import type { Settings } from '../src/settings.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { VoiceScene } from './audition-voices.ts';
import type { Audition } from './audition.ts';
import type { HoldRenderer } from '../src/voices/voice-contract.ts';

/**
 * The decibel a voice is trimmed to, out of the settings' own level table. The
 * registry is open and `VOICE_LEVEL` is a `Record<string, string>` where
 * `levels` is a closed table of named fields, so the table is read by name, the
 * way `buildMaster` reads it (`src/master.ts`'s `level()`).
 */
const levelDb = (settings: Settings, key: string): number => (settings.levels as Record<string, number>)[key];

/**
 * One row per playable instrument. Sixteen voices and sixteen rows — none of
 * these stands for several timbres the way `keys` and `pad` do, which is itself
 * a decision about the round: a voice that needs a `preset` parameter to say
 * what it is is a voice with several instruments hidden inside it, and the
 * kitchen is supposed to make the choosing visible.
 *
 * The register each is played in is the one it is *for*, and that is why the
 * two subs are at MIDI 31 and the two leads at 67: a reading of a bass taken an
 * octave over where a bass plays is a reading of a different instrument.
 */
export const SCENES_2: VoiceScene[] = [
  // the two leads
  { id: 'pulseLead', voice: 'pulseLead', pattern: 'melody', root: 67, dur: 0.36, role: 'melody' },
  { id: 'triLead', voice: 'triLead', pattern: 'melody', root: 72, dur: 0.44, role: 'melody' },
  // the two bottoms
  { id: 'subSoft', voice: 'subSoft', pattern: 'bassline', root: 31, dur: 0.22, role: 'bassline' },
  { id: 'subTri', voice: 'subTri', pattern: 'bassline', root: 31, dur: 0.24, role: 'bassline' },
  // the second saw pad
  { id: 'sawPad', voice: 'sawPad', pattern: 'chord', root: 60, dur: 3.9, role: 'sustained' },
  // the three FM voices
  { id: 'fmGlass', voice: 'fmGlass', pattern: 'melody', root: 72, dur: 0.7, role: 'melody' },
  { id: 'fmEp', voice: 'fmEp', pattern: 'figure', root: 64, dur: 0.3, role: 'figure' },
  { id: 'fmPluck', voice: 'fmPluck', pattern: 'figure', root: 67, dur: 0.16, role: 'figure' },
  // the two mallets
  { id: 'marimba', voice: 'marimba', pattern: 'figure', root: 67, dur: 0.2, role: 'figure' },
  { id: 'vibes', voice: 'vibes', pattern: 'figure', root: 64, dur: 0.5, role: 'figure' },
  // the two keyboards
  { id: 'brightPiano', voice: 'brightPiano', pattern: 'figure', root: 72, dur: 0.24, role: 'figure' },
  { id: 'reedOrgan', voice: 'reedOrgan', pattern: 'melody', root: 60, dur: 0.8, role: 'melody' },
  // the three textures
  { id: 'vinylBed', voice: 'vinylBed', pattern: 'gesture', root: 0, dur: 6, role: 'texture' },
  { id: 'grainPad', voice: 'grainPad', pattern: 'chord', root: 60, dur: 3.9, role: 'sustained' },
  { id: 'sweepUp', voice: 'sweepUp', pattern: 'gesture', root: 0, dur: 3, role: 'texture' },
  // the wavetable pad
  { id: 'wavePad', voice: 'wavePad', pattern: 'chord', root: 60, dur: 3.9, role: 'sustained' },
];

/** The sixteen this round added, in the order the round wrote them. */
export const K4_VOICES = SCENES_2.map((s) => s.id);

export const scene2Of = (id: string): VoiceScene => {
  const s = SCENES_2.find((x) => x.id === id);
  if (!s) throw new Error(`no scene called ${id}: try ${K4_VOICES.join(', ')}`);
  return s;
};

/**
 * One instrument, alone, the way a scene is metered: `prerollBars` bars of the
 * same figure in front of the window so that nothing in the chain starts from
 * rest inside the stretch that is measured. It is `voiceAudition` with this
 * round's table behind it and the same arithmetic in front of it.
 */
export function voiceAudition2(
  id: string,
  { bpm = 120, bars = 8, prerollBars = 2, tail = 3, transpose = 0, velScale = 1 } = {},
): Audition {
  const scene = scene2Of(id);
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

// --- the two that hold ------------------------------------------------------

/** This round's held renderers, by the voice they belong to. */
export const HOLDS_2: Record<string, HoldRenderer> = {
  grainPad: holdGrainPad,
  wavePad: holdWavePad,
};

/**
 * One drone of one voice, with the moves it is going to make. It is round K2's
 * held fixture with one line added: a third control, because both of this
 * round's held voices answer to something its two did not — the cloud to
 * nothing extra, the wavetable pad to `morph`, which is where between two
 * spectra it is sitting and is the reason that voice exists.
 */
export function heldVoiceAudition2(
  id: string,
  { bpm = 70, seconds = 24, at = 0.5, pause = 8, resume = 12, release = 18 } = {},
): Audition {
  const settings = resolveSettings({ base: table });
  const level = VOICE_LEVEL[id];
  const controls: Array<{ name: string, value: number, at: number, over: number }> = [
    { name: 'brightness', value: 2400, at: 1.5, over: 1 },
  ];
  // Early, and over half a second: the hold is read at 3-7 s and the resume at
  // 13-17 s, and a morph still travelling between them would be two different
  // spectra rather than one drone coming back. Round K2 met the same thing from
  // the other side and widened its band; this is the fixture answering it
  // instead, because unlike a vowel that walks for twenty-two seconds a morph
  // is a hand that arrives somewhere and stays.
  if (id === 'wavePad') controls.push({ name: 'morph', value: 0.9, at: 1.6, over: 0.5 });
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
        // The cloud lays grains down to a horizon; the whole render is shorter
        // than its default one, so it is told where the end is.
        horizon: seconds,
      },
      controls,
    }],
    window: { from: 0, to: seconds },
  };
}

// --- for a listener ---------------------------------------------------------

/**
 * One instrument on its own figure, over four chords, with a quiet organ pad
 * underneath: `voiceOverChords` again, with this round's table behind it.
 */
export function voiceOverChords2(id: string, { bpm = 120, bars = 16, padDb = -6 } = {}): Audition {
  const scene = scene2Of(id);
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
    if (b % 4 === 0 && BY_NAME[scene.voice].layer !== 'pad') {
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
      bpm, bars, duration: bars * barSeconds + 5, settings,
      levels: { [levelKey]: levelDb(settings, levelKey), [VOICE_LEVEL.pad]: levelDb(settings, VOICE_LEVEL.pad) },
      events,
    }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + 5 },
  };
}

/**
 * All sixteen over a house groove: twenty-four bars, written out by hand, every
 * note a number in a table. It is round K2's `sixTogether` for this round's
 * cast and it is the only place in the engine where all of them play at once.
 *
 * The arrangement: the vinyl bed under the whole thing; the two subs taking
 * four bars each, because two bottoms at once is a phase measurement and not an
 * arrangement; the wavetable pad holding the harmony from the top and the saw
 * pad answering from the fifth; the grain cloud from the ninth; the reed organ
 * under the middle eight; the marimba and the FM electric piano trading the
 * figure; the bright piano at the half; the vibes and the glass marking the
 * last section; a sweep into bar 17 and the two leads over the last eight.
 */
export function sixteenTogether({ bpm = 122, bars = 24 } = {}): Audition {
  const settings = resolveSettings({ base: table });
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const step = beat / 4;
  const g = (name: string, db = 0) => dbToGain(levelDb(settings, VOICE_LEVEL[name]) + db);
  const events: ProgramEvent[] = [];
  const at = (voice: string, b: number, s: number, p: NoteParams) =>
    events.push(event(events.length, voice, b * barSeconds + s * step, p, b, s));

  // The bed, once, under everything.
  at('vinylBed', 0, 0, { vel: 0.6, gain: g('vinylBed'), dur: bars * barSeconds, reverb: 0.2 });

  for (let b = 0; b < bars; b++) {
    const here = PROGRESSION[Math.floor(b / 4) % PROGRESSION.length];
    for (const s of [0, 4, 8, 12]) at('kick', b, s, { vel: 0.95, gain: g('kick') });
    for (const s of [2, 6, 10, 14]) at('hatClosed', b, s, { vel: s === 14 ? 0.9 : 0.8, gain: g('hatClosed') });
    if (b >= 4) for (const s of [4, 12]) at('clap', b, s, { vel: 0.85, gain: g('clap') });
    // The two bottoms, four bars each and never together.
    const bottom = Math.floor(b / 4) % 2 === 0 ? 'subSoft' : 'subTri';
    for (const [s, semis, vel] of PATTERNS.bassline[b % PATTERNS.bassline.length]) {
      at(bottom, b, s, { midi: 31 + here.root + semis, vel, gain: g(bottom), dur: 0.22 });
    }
    // The two pads and the cloud.
    if (b % 4 === 0) {
      for (const semis of here.chord) {
        at('wavePad', b, 0, { midi: 60 + semis, vel: 0.6, gain: g('wavePad', -1), dur: barSeconds * 4 - 0.2, reverb: 0.5 });
        if (b >= 4) at('sawPad', b, 2, { midi: 67 + semis, vel: 0.5, gain: g('sawPad', -4), dur: barSeconds * 4 - 0.6, reverb: 0.55 });
      }
      if (b >= 8 && b < 20) at('grainPad', b, 0, { midi: 60 + here.chord[0], vel: 0.55, gain: g('grainPad', -2), dur: barSeconds * 4, reverb: 0.6 });
      if (b >= 8 && b < 16) {
        for (const semis of here.chord) {
          at('reedOrgan', b, 4, { midi: 55 + semis, vel: 0.5, gain: g('reedOrgan', -5), dur: barSeconds * 3, reverb: 0.4 });
        }
      }
    }
    // The figures trade.
    if (b >= 4 && b < 12) {
      for (const [s, semis, vel] of PATTERNS.figure[b % PATTERNS.figure.length]) {
        at('marimba', b, s, { midi: 67 + here.root + semis, vel, gain: g('marimba'), dur: 0.2 });
      }
    }
    if (b >= 12) {
      for (const [s, semis, vel] of PATTERNS.figure[(b + 1) % PATTERNS.figure.length]) {
        at('fmEp', b, s, { midi: 64 + here.root + semis, vel: vel * 0.9, gain: g('fmEp'), dur: 0.3 });
      }
    }
    if (b >= 16 && b < 22) {
      for (const [s, semis, vel] of PATTERNS.figure[(b + 2) % PATTERNS.figure.length]) {
        at('fmPluck', b, (s + 2) % 16, { midi: 72 + here.root + semis, vel: vel * 0.8, gain: g('fmPluck', -2), dur: 0.16 });
      }
    }
    // The two leads take the last eight, one each.
    if (b >= 16 && b < 20) {
      for (const [s, semis, vel] of PATTERNS.melody[b % PATTERNS.melody.length]) {
        at('pulseLead', b, s, { midi: 67 + here.root + semis, vel, gain: g('pulseLead'), dur: 0.36 });
      }
    }
    if (b >= 20) {
      for (const [s, semis, vel] of PATTERNS.melody[b % PATTERNS.melody.length]) {
        at('triLead', b, s, { midi: 72 + here.root + semis, vel, gain: g('triLead'), dur: 0.44 });
      }
    }
  }
  // The marks: a bright piano at the half, glass and vibes over the last
  // section, and a sweep arriving at bar 16.
  at('brightPiano', 12, 0, { midi: 79, vel: 0.85, gain: g('brightPiano'), dur: 0.3 });
  at('brightPiano', 12, 3, { midi: 84, vel: 0.6, gain: g('brightPiano', -3), dur: 0.3 });
  at('fmGlass', 16, 0, { midi: 84, vel: 0.8, gain: g('fmGlass'), dur: 1.4 });
  at('vibes', 20, 0, { midi: 76, vel: 0.7, gain: g('vibes'), dur: 2 });
  at('vibes', 22, 8, { midi: 79, vel: 0.6, gain: g('vibes', -2), dur: 2 });
  at('sweepUp', 13, 0, { vel: 0.8, gain: g('sweepUp'), dur: barSeconds * 3, reverb: 0.5 });

  events.sort((a, b) => a.t - b.t || a.i - b.i);
  events.forEach((e, i) => { e.i = i; });
  const levels: Record<string, number> = {};
  // Every event here came out of `event()` in `audition-voices.ts`, so its
  // `level` is the key the registry declared for that voice and never the null
  // the Program contract allows for a voice the levels do not trim.
  for (const e of events) levels[e.level!] = levelDb(settings, e.level!);

  return {
    name: 'sixteen-together',
    program: program({ bpm, bars, duration: bars * barSeconds + 6, settings, levels, events }),
    drones: [],
    window: { from: 0, to: bars * barSeconds + 6 },
  };
}

export default { SCENES_2, K4_VOICES, scene2Of, voiceAudition2, heldVoiceAudition2, HOLDS_2, voiceOverChords2, sixteenTogether };
