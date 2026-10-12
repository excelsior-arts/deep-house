// The voicing a style places over the keyboard patches, and its check.
//
// The five patches themselves were a table here (`KEYBOARD_PRESETS`) until
// round SOUNDS-R3; they are rows now (`sounds/keyboard/keys*.json`), which the
// `keys` dispatcher names by timbre. What stays is the style's side: a partial
// of one patch's tone (`keyboardPatches.<name>` in the settings), which the
// keys topology writes over that row (`voicedBy`), and the check a settings
// value is held to where it is resolved. A captured program without one plays
// the row.

import keysRow from '../../sounds/keyboard/keys.json' with { type: 'json' };
import keysRhodesRow from '../../sounds/keyboard/keysRhodes.json' with { type: 'json' };
import keysGlassRow from '../../sounds/keyboard/keysGlass.json' with { type: 'json' };
import keysEpRow from '../../sounds/keyboard/keysEp.json' with { type: 'json' };
import keysOrganRow from '../../sounds/keyboard/keysOrgan.json' with { type: 'json' };
import keysPluckRow from '../../sounds/keyboard/keysPluck.json' with { type: 'json' };

/** One patch's family, as its row states it: what the check below asks of the patch a voicing lands on. */
interface PatchFacts { tine: number | null; organ: boolean; pluck: boolean }

/** The patches by the timbre that names them, off the `keys` dispatcher's table and the rows it names. */
const BY_ID: Record<string, PatchFacts> = Object.fromEntries(
  [keysRhodesRow, keysGlassRow, keysEpRow, keysOrganRow, keysPluckRow].map((r) => [r.id, r.parameters as PatchFacts]),
);
const PATCHES: Record<string, PatchFacts> = Object.fromEntries(
  Object.entries(keysRow.parameters.timbres).map(([name, t]) => [name, BY_ID[(t as { row: string }).row]]),
);

/** One patch's tone, as a style may voice it. */
export interface KeyboardPreset {
  cutoff: number;
  det: number;
  formant: [number, number];
  ratio?: number;
  index?: [number, number];
  indexDecay?: number;
  tine?: number;
  tineIndex?: [number, number];
  tineDecay?: number;
  tremolo?: boolean;
}

/** Sonic character only: a style cannot switch a keyboard's synthesis family. */
export type KeyboardPatch = Partial<KeyboardPreset>;
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
    const base = PATCHES[name];
    if (!Object.hasOwn(PATCHES, name) || !patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error(`invalid keyboard patch: ${name}`);
    for (const [key, value] of Object.entries(patch)) {
      let valid = false;
      if (key === 'tremolo') valid = typeof value === 'boolean';
      else if (key === 'formant') valid = Array.isArray(value) && value.length === 2 && bounded(value[0], 20, 20000) && bounded(value[1], -24, 24);
      else if (key === 'index' || key === 'tineIndex') valid = Array.isArray(value) && value.length === 2 && bounded(value[0], .001, 32) && bounded(value[1], 0, 32);
      else if (Object.hasOwn(RANGES, key)) valid = bounded(value, ...RANGES[key]);
      if (['ratio', 'index', 'indexDecay', 'tine', 'tineIndex', 'tineDecay'].includes(key) && (base.organ || base.pluck)) valid = false;
      if (['tine', 'tineIndex', 'tineDecay'].includes(key) && base.tine === null) valid = false;
      if (!valid) throw new Error(`invalid keyboard patch ${name}.${key}`);
    }
  }
}
