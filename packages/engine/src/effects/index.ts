// The effect registry. One ordered list, and every table below derived from
// it — the arrangement `voices/index.ts` has had since round B, for the same
// reason and with the same sentence over it:
//
// **The registry is a lookup table and never a pool.** No die reads this file.
// A composition strategy reaches an effect by naming it in a candidate list of
// its own, and until one does, everything here is dormant: registering an
// effect changes no seed, no plan and no decibel of what v1 sounds like, and
// round K1 landed with both digests byte-identical either side of every commit.
//
// The order is the order they were built, which is the order PLAN-KITCHEN's
// table puts them in: round K1's six first — the two that colour a held sound,
// the one that combs it, the two that drive it, and the one that repeats it —
// and then round K4's rest of the kitchen, family by family. Where a consumer
// needs an order — a rota, a menu, a cost table — this is the one.

import { COST_UNITS } from './contract.ts';
import type {
  EffectBuilder, EffectCost, EffectDescriptor, EffectFamily, EffectInstance, EffectParams, EffectScope,
} from './contract.ts';
import type { Settings } from '../settings.ts';
import { descriptor as chorus } from './chorus.ts';
import { descriptor as tremolo } from './tremolo.ts';
import { descriptor as flanger } from './flanger.ts';
import { descriptor as overdrive } from './overdrive.ts';
import { descriptor as distortion } from './distortion.ts';
import { descriptor as tapeDelay } from './tape-delay.ts';
import { descriptor as reverb } from './reverb.ts';
import { descriptor as shimmer } from './shimmer.ts';
import { descriptor as compressor } from './compressor.ts';
import { descriptor as transient } from './transient.ts';
import { descriptor as gate } from './gate.ts';
import { descriptor as duck } from './duck.ts';
import { descriptor as fuzz } from './fuzz.ts';
import { descriptor as crush } from './crush.ts';
import { descriptor as filter } from './filter.ts';
import { descriptor as ladder } from './ladder.ts';
import { descriptor as eq } from './eq.ts';
import { descriptor as autoWah } from './auto-wah.ts';
import { descriptor as formant } from './formant.ts';
import { descriptor as phaser } from './phaser.ts';
import { descriptor as autoPan } from './auto-pan.ts';
import { descriptor as lfoParam } from './lfo-param.ts';
import { descriptor as ringMod } from './ring-mod.ts';
import { descriptor as width } from './width.ts';
import { descriptor as haas } from './haas.ts';
import { descriptor as mono } from './mono.ts';

export {
  FAMILIES, SCOPES, COSTS, RATES, UNITS, FIELDS, COST_BANDS, COST_UNITS, COST_REFERENCE,
  clampParam, resolveParams, beatsOrSeconds, beatsOrHz, faultsOf,
} from './contract.ts';

// The contract's own types, out of the same door as its values: a consumer
// naming an effect names it from here and has no business reaching past the
// registry for the shape of one.
export type {
  EffectBuilder, EffectCost, EffectDescriptor, EffectFamily, EffectInstance, EffectParam,
  EffectParams, EffectScope, FieldKind, ParamRate, ParamSetter, ParamSpec, ParamUnit,
} from './contract.ts';

export const REGISTRY: EffectDescriptor[] = [
  // round K1: the two that colour a held sound, the one that combs it, the two
  // that drive it, and the one that repeats it
  chorus, tremolo, flanger, overdrive, distortion, tapeDelay,
  // round K4: the rest of the kitchen, family by family in PLAN-KITCHEN's own
  // order — time, dynamics, drive, tone, motion, space
  reverb, shimmer,
  compressor, transient, gate, duck,
  fuzz, crush,
  filter, ladder, eq, autoWah, formant,
  phaser, autoPan, lfoParam, ringMod,
  width, haas, mono,
];

/** Every descriptor by its id. */
export const BY_ID: Record<string, EffectDescriptor> =
  Object.fromEntries(REGISTRY.map((d): [string, EffectDescriptor] => [d.id, d]));

/** The ids, in the registry's order. */
export const EFFECTS: string[] = REGISTRY.map((d) => d.id);

/** The builders, by id: what a strategy's runtime looks a named effect up in. */
export const BUILD: Record<string, EffectBuilder> =
  Object.fromEntries(REGISTRY.map((d): [string, EffectBuilder] => [d.id, d.build]));

/** Which family each is in. */
export const EFFECT_FAMILY: Record<string, EffectFamily> =
  Object.fromEntries(REGISTRY.map((d): [string, EffectFamily] => [d.id, d.family]));

/** Where each one lives. */
export const EFFECT_SCOPE: Record<string, EffectScope> =
  Object.fromEntries(REGISTRY.map((d): [string, EffectScope] => [d.id, d.scope]));

/** What each costs, as a class. */
export const EFFECT_COST: Record<string, EffectCost> =
  Object.fromEntries(REGISTRY.map((d): [string, EffectCost] => [d.id, d.cost]));

/** The bypass key of each, which is what a query switch would carry. */
export const BYPASS_KEYS: Record<string, string> =
  Object.fromEntries(REGISTRY.map((d): [string, string] => [d.id, d.bypass]));

/**
 * Everything that may reasonably be put on a bus or a family, in the registry's
 * order. `applies` is a property of the effect, so this is a question and not a
 * table somebody keeps in step.
 * @param what a bus or a voice family
 */
export const effectsFor = (what: string): EffectDescriptor[] =>
  REGISTRY.filter((d) => d.applies.includes(what));

/**
 * What a chain costs, in units of one cheap effect.
 *
 * It is the number a strategy's ceiling is stated in: a phone gets so many
 * units and a chain that asks for more is a chain that has to give something
 * up. The classes are MEASURED (`notes/archive/2026-09-kitchen/rounds/k1.md`) and the weights are the
 * middles of their bands, so the sum is in the thing actually being rationed —
 * time on the audio thread — and not in a count of effects.
 *
 * An id nobody registered is a fault and not a nought: a ceiling that silently
 * ignores what it cannot price is a ceiling that passes everything.
 */
export function costOf(ids: string[]): number {
  let sum = 0;
  for (const id of ids) {
    const d = BY_ID[id];
    if (!d) throw new Error(`no effect called ${id}`);
    sum += COST_UNITS[d.cost];
  }
  return +sum.toFixed(3);
}

/**
 * One built effect by id, with the room it is built in and whatever parameters
 * the caller has. It is the one door: nothing outside this folder imports an
 * effect module by name.
 */
export function makeEffect(
  id: string,
  ctx: BaseAudioContext,
  settings: Settings,
  params: EffectParams = {},
  at = 0,
): EffectInstance {
  const d = BY_ID[id];
  if (!d) throw new Error(`no effect called ${id}`);
  return d.build(ctx, settings, params, at);
}

/** The defaults of one effect, as a plain value a caller can start from. */
export function defaultsOf(id: string): Record<string, number> {
  const d = BY_ID[id];
  if (!d) throw new Error(`no effect called ${id}`);
  return Object.fromEntries(Object.entries(d.params).map(([k, spec]): [string, number] => [k, spec.default]));
}

export default REGISTRY;
