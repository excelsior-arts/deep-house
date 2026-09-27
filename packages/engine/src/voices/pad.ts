// The sustained role, in four timbres. The role is one voice name so the
// arrangement, the lane meters and the solo-stem renders do not have to know
// which instrument is holding the chord this time; `p.timbre` decides that.
//
//   strings — the default and MEASURED the biggest sustained family (31% of
//             52 tracks): a fast-attack chord held long and drowned in reverb.
//   swell   — the same body with the slow attack put back. The study's 4%
//             "synth swell": a garnish, not a staple.
//   organ   — drawbars, which hold flatter through the bar than anything else.
//             About one theme in ten.
//   rhodes  — a tine held rather than struck. The study's 8% "keys blend".

import { strings, STRINGS_TIMBRES, STRINGS_KNOBS } from './strings.ts';
import { keys, KEYS_TIMBRES, KEYS_KNOBS } from './keys.ts';
import type { VoiceOut } from '../dsp.ts';
import { rescaleKnobs, withControls } from './descriptor.ts';
import type { Controls, Descriptor, NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

// The two keys patches this role holds rather than strikes. They are named
// because the arrangement's own lists name them — `padTimbres` in the
// composer's `catalogue.ts` — and the order is the order the dispatch list has
// always had.
const HELD_KEYS = Object.keys(KEYS_TIMBRES).filter((t: string) => t === 'organ' || t === 'rhodes');

/**
 * What a part may write on a sustained note, taken by both of the modules this
 * voice dispatches to. The entrance, the tail and the corner have no single
 * default: they are the timbre's own (a swell's attack is not the strings'),
 * so a note that does not say plays the timbre. `motion` scales the note's own
 * drift, chorus and tremolo (1 is the room's), and `fadeCurve` is the
 * raised-cosine envelope switch.
 */
export const PAD_CONTROLS: Controls = {
  attack: { unit: 'seconds', min: 0.003, max: 2, default: null },
  release: { unit: 'seconds', min: 0.03, max: 3, default: null },
  open: { unit: 'hz', min: 300, max: 8000, default: null },
  motion: { unit: 'ratio', min: 0, max: 1, default: 1 },
  fadeCurve: { unit: 'switch', min: 0, max: 1, default: 0 },
};

/** Scale an individual note's intrinsic motion without changing the room. */
export function padNoteSettings(settings: Settings, p: NoteParams): Settings {
  const motion = withControls(p, PAD_CONTROLS).motion;
  if (motion === undefined || motion === 1) return settings;
  return { ...settings,
    strings: { ...settings.strings, detuneCents: settings.strings.detuneCents * motion,
      ensembleWet: settings.strings.ensembleWet * motion, vibratoCents: settings.strings.vibratoCents * motion },
    space: { ...settings.space, padDriftCents: settings.space.padDriftCents * motion },
    keys: { ...settings.keys, tremoloDepth: settings.keys.tremoloDepth * motion,
      rotaryDepth: settings.keys.rotaryDepth * motion, tremoloPan: settings.keys.tremoloPan * motion },
  };
}

// Which of the two modules holds the chord is asked of the tables the modules
// declare, not of two names: a timbre strings.ts says it makes is rendered
// there, and anything else is a keys patch held rather than struck. Until
// round E this line read `timbre === 'strings' || timbre === 'swell'`, which
// is the same two names written twice — once here and once in the table.
export function pad(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, PAD_CONTROLS);
  settings = padNoteSettings(settings, p);
  const timbre = p.timbre || 'strings';
  if (timbre in STRINGS_TIMBRES) return strings(ctx, out, time, p, settings);
  // The two `keys` holds. A knob setting is a number against the *declaring*
  // voice's default, and this voice declares the strings family's, so the
  // settings are re-expressed against `keys.ts`'s own before they cross — what
  // survives the hand-over is the factor, which is what the sound is made of.
  // A note with no knobs on it is handed over exactly as it always was.
  return keys(ctx, out, time, { ...rescaleKnobs(p, STRINGS_KNOBS, KEYS_KNOBS), preset: timbre, sustain: true }, settings);
}


/**
 * The sustained role, and the second legacy alias: one event voice standing
 * for four sustained families, which `p.timbre` chooses between. Two of them
 * this module renders itself through strings.ts and two it hands to keys.ts
 * held rather than struck — so `timbres` carries the two that are strings.ts's
 * own and `dispatches` names all four, with the other two's numbers declared
 * where they are made.
 */
export const descriptor: Descriptor = {
  name: 'pad',
  cost: 'dear',
  // The sustained role's ranges, declared in the module that makes the family.
  knobs: STRINGS_KNOBS,
  family: 'ensemble',
  roles: ['sustained'],
  bus: 'melodic',
  level: 'pad',
  layer: 'pad',
  plays: 'pad',
  mono: false,
  treat: true,
  anticipates: null,
  prepare: null,
  render: pad,
  timbres: STRINGS_TIMBRES,
  dispatches: [...Object.keys(STRINGS_TIMBRES), ...HELD_KEYS],
  mood: [],
  // Both the strings player and the held-key aliases already read these
  // per-note controls. Declaring them lets a melodic part request the same
  // smooth entrance and tail without changing the room's sustained bed.
  controls: PAD_CONTROLS,
  noteControls: Object.keys(PAD_CONTROLS),
};

export default pad;
