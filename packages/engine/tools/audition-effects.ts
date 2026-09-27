// The fixture table for round K4's twenty effects: which music each is
// measured through, and the one number of its own each is asked for.
//
// Round K1 built the fixture (`audition.ts`'s `effectAudition`: the sustained
// ensemble for what colours or repeats a sound, round G's plucked figure for
// the drive family) and the measurement recipe with it. Nothing here replaces
// either. What it adds is the **table**, for the reason `audition-voices.ts`
// gives about instruments: with six effects a gate can say `d.family === 'drive'
// ? pluck : strings` in one line, and with twenty-six it is saying it about
// dynamics, which are measured on something with transients in it, and about
// space, which is measured on something with a stereo image.
//
// And the second column, which is this round's own. K1's gate asks every effect
// the same six questions — is it its own input bypassed, is it inside its
// declared tail, is it late, does it click, what does it cost. Those are
// questions about the **contract** and every effect answers them. They do not
// ask whether a compressor compresses. So each row here names what the effect
// is actually *for*, as a reading the gate takes and prints; a `probe` is a
// measurement and not an assertion unless the row says what it has to be.

import { effectAudition } from './audition.ts';
import { BY_ID, EFFECTS } from '../src/effects/index.ts';
import type { Audition } from './audition.ts';

/** Which fixture an effect is measured through, and why that one. */
export type EffectSource = 'strings' | 'pluck';

/** What an effect is asked about beyond the contract. */
export interface EffectProbe {
  /** what is being read, for the log */
  what: string;
  /** the parameters to build with for this reading, over the defaults */
  params?: Record<string, number>;
}

/** One row: an effect, its fixture, and its own question. */
export interface EffectScene {
  id: string;
  source: EffectSource;
  probe?: EffectProbe;
}

/**
 * Round K4's twenty, in the registry's order.
 *
 * The fixture is the ensemble unless the row says otherwise, and every row that
 * says otherwise says why: **a dynamics effect measured on a held chord is
 * measured on the one material it cannot do anything to.** A compressor needs
 * something whose level moves, a gate needs gaps, a transient shaper needs
 * transients, and round G's plucked figure is the fixture in this engine that
 * has all three.
 */
export const SCENES_FX: EffectScene[] = [
  // time
  { id: 'reverb', source: 'strings', probe: { what: 'the tail, per room', params: { mix: 1 } } },
  { id: 'shimmer', source: 'strings', probe: { what: 'the octave in the loop', params: { mix: 1 } } },
  // dynamics — all four on the pluck, because all four need a level that moves
  { id: 'compressor', source: 'pluck', probe: { what: 'what it does to the crest factor, per engine', params: { thresholdDb: -36, ratio: 12, attackMs: 3, releaseMs: 120, makeupDb: 0 } } },
  { id: 'transient', source: 'pluck', probe: { what: 'what a transient gains and loses', params: { attack: 1 } } },
  { id: 'gate', source: 'pluck', probe: { what: 'how far it shuts, and how fast', params: { thresholdDb: -28, floorDb: -60 } } },
  { id: 'duck', source: 'strings', probe: { what: 'one ramp, measured', params: { depthDb: -9 } } },
  // drive
  { id: 'fuzz', source: 'pluck', probe: { what: 'the octave, as a harmonic' } },
  { id: 'crush', source: 'pluck', probe: { what: 'how many levels the output lands on', params: { bits: 4 } } },
  // tone
  { id: 'filter', source: 'strings', probe: { what: 'the slope, per mode' } },
  { id: 'ladder', source: 'strings', probe: { what: 'the slope, against the filter\'s' } },
  { id: 'eq', source: 'strings', probe: { what: 'a bell, measured', params: { midDb: 9, midHz: 900, midQ: 2 } } },
  { id: 'autoWah', source: 'pluck', probe: { what: 'how far the corner travels' } },
  { id: 'formant', source: 'strings', probe: { what: 'the three centres, and the bank\'s own loss' } },
  // motion
  { id: 'phaser', source: 'strings' },
  { id: 'autoPan', source: 'strings', probe: { what: 'constant power across the sweep' } },
  { id: 'lfoParam', source: 'strings', probe: { what: 'the modulation, with no input at all', params: { depth: 1, rateHz: 4 } } },
  { id: 'ringMod', source: 'strings' },
  // space
  { id: 'width', source: 'strings', probe: { what: 'the side, against the mid', params: { width: 2 } } },
  { id: 'haas', source: 'strings', probe: { what: 'what the mono sum loses' } },
  { id: 'mono', source: 'strings', probe: { what: 'the side under the corner' } },
];

/** The ids, in the registry's order: what `test-effects-2.ts` walks. */
export const K4 = SCENES_FX.map((s) => s.id);

/** Round K1's six, so the two gates can be held to covering the kitchen between them. */
export const K1 = ['chorus', 'tremolo', 'flanger', 'overdrive', 'distortion', 'tapeDelay'];

export const fxSceneOf = (id: string): EffectScene => {
  const s = SCENES_FX.find((x) => x.id === id);
  if (!s) throw new Error(`no effect scene called ${id}: try ${K4.join(', ')}`);
  return s;
};

/**
 * Every registered effect is measured by one of the two gates, and every row of
 * either names a registered effect. It is round K4's own lesson about fixture
 * tables (`tools/tables.ts`) applied one folder over, and it is asserted rather
 * than assumed for the same reason: an effect registered and left out of both
 * tables has no gate at all.
 */
export function uncoveredEffects(): string[] {
  const covered = new Set([...K1, ...K4]);
  const out: string[] = [];
  for (const id of EFFECTS) if (!covered.has(id)) out.push(id);
  for (const id of [...K1, ...K4]) if (!BY_ID[id]) out.push(`${id} is in a gate's table and in no registry`);
  return out;
}

/** The fixture an effect is measured through, built. */
export function fxAudition(id: string): Audition {
  return effectAudition({ source: fxSceneOf(id).source });
}

export default { SCENES_FX, K1, K4, fxSceneOf, uncoveredEffects, fxAudition };
