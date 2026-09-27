// Legacy keyboard patches and the optional voicing a style places over them.
// Defaults are unchanged; a captured program without overrides plays the same patch.

/**
 * One keyboard patch. Every field below the first five is a patch's own: a
 * modulator ratio belongs to the FM families and a drawbar flag to the organ,
 * so they are optional here and the branch that reads one has already asked
 * whether this is that instrument.
 */
export interface KeyboardPreset {
  cutoff: number;
  det: number;
  attack: number;
  decay: number;
  sustain: number;
  formant: [number, number];
  ratio?: number;
  index?: [number, number];
  indexDecay?: number;
  tine?: number;
  tineIndex?: [number, number];
  tineDecay?: number;
  tremolo?: boolean;
  rotary?: boolean;
  organ?: boolean;
  pluck?: boolean;
}

export const KEYBOARD_PRESETS: Readonly<Record<string, KeyboardPreset>> = {
  // attack / decay / sustain fraction: the measured level at 300 ms and at the
  // bar line, turned into an envelope.
  rhodes: {
    ratio: 2, index: [1.4, 1.8], indexDecay: 0.2, cutoff: 1900, det: 5,
    attack: 0.03, decay: 0.42, sustain: 0.3, formant: [2600, 4.0],
  },
  glass: {
    ratio: 3.5, index: [2.0, 2.6], indexDecay: 0.42, cutoff: 2600, det: 9,
    attack: 0.022, decay: 0.4, sustain: 0.32, formant: [3300, 4.5],
  },
  ep: {
    ratio: 1, tine: 14, index: [0.9, 1.1], tineIndex: [2.2, 3.4], tineDecay: 0.12,
    indexDecay: 0.5, cutoff: 1800, det: 6,
    attack: 0.024, decay: 0.3, sustain: 0.37, formant: [3612, 7.2], tremolo: true,
  },
  organ: {
    organ: true, cutoff: 2500, det: 3,
    attack: 0.009, decay: 0.25, sustain: 0.72, formant: [2444, 3.0], rotary: true,
  },
  pluck: {
    pluck: true, cutoff: 2000, det: 12,
    attack: 0.011, decay: 0.3, sustain: 0.048, formant: [3100, 5.0],
  },
};

/** Sonic character only: a style cannot switch a keyboard's synthesis family. */
export type KeyboardPatch = Partial<Pick<KeyboardPreset,
  'cutoff' | 'det' | 'formant' | 'ratio' | 'index' | 'indexDecay' |
  'tine' | 'tineIndex' | 'tineDecay' | 'tremolo'>>;
export type KeyboardPatches = Record<string, KeyboardPatch>;

const RANGES: Record<string, readonly [number, number]> = {
  cutoff: [20, 20000], det: [0, 100], ratio: [.01, 32], indexDecay: [.001, 8],
  tine: [0, 32], tineDecay: [.001, 8],
};
const bounded = (n: unknown, lo: number, hi: number): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/** Validate once when settings are resolved, before an audio graph is built. */
export function validateKeyboardPatches(patches: KeyboardPatches): void {
  if (!patches || typeof patches !== 'object' || Array.isArray(patches)) throw new Error('invalid keyboard patches');
  for (const [name, patch] of Object.entries(patches)) {
    const base = KEYBOARD_PRESETS[name];
    if (!Object.hasOwn(KEYBOARD_PRESETS, name) || !patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error(`invalid keyboard patch: ${name}`);
    for (const [key, value] of Object.entries(patch)) {
      let valid = false;
      if (key === 'tremolo') valid = typeof value === 'boolean';
      else if (key === 'formant') valid = Array.isArray(value) && value.length === 2 && bounded(value[0], 20, 20000) && bounded(value[1], -24, 24);
      else if (key === 'index' || key === 'tineIndex') valid = Array.isArray(value) && value.length === 2 && bounded(value[0], .001, 32) && bounded(value[1], 0, 32);
      else if (Object.hasOwn(RANGES, key)) valid = bounded(value, ...RANGES[key]);
      if (['ratio', 'index', 'indexDecay', 'tine', 'tineIndex', 'tineDecay'].includes(key) && (base.organ || base.pluck)) valid = false;
      if (['tine', 'tineIndex', 'tineDecay'].includes(key) && base.tine === undefined) valid = false;
      if (!valid) throw new Error(`invalid keyboard patch ${name}.${key}`);
    }
  }
}

/** No override means the exact legacy object, including its optional fields. */
export function keyboardPreset(name: string, patches?: KeyboardPatches): KeyboardPreset {
  const key = Object.hasOwn(KEYBOARD_PRESETS, name) ? name : 'rhodes';
  const base = KEYBOARD_PRESETS[key], patch = patches?.[key];
  return patch ? { ...base, ...patch } : base;
}
