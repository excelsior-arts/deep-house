// The settings a piece of sound is made under, as a value somebody owns.
//
// Before round C of PLAN-V1-NEXT there was one live table — `PARAMS` in
// params.ts — that `applyParams()` rewrote in place and every voice, every
// graph and every lazy closure imported. It worked because every synchronous
// phase re-applied its own room first, and it failed everywhere a phase was
// not synchronous: a theme planned while a set played, an offline render
// awaiting its worklet, a second deck at a seam, a master built before the
// first track was chosen. The design review's sentence for it is the one this
// file is written against: *an alias bound to the last resolved settings is
// still shared mutable state.*
//
// So: `resolveSettings()` takes the layers in the order they have always been
// merged and hands back a **deep-frozen value**. Nothing writes to it, nothing
// can, and two of them can be alive at once without knowing about each other.
// Everything on an executing path receives one explicitly — `buildGraph`,
// `buildMaster`, every voice, every prepare hook, the automation, the sound
// stage's inserts, the lazy hall — and the day a second room plays under a
// first one, that is a second value and not a second write.
//
// The table itself is the **style's**, since round F:
// `packages/deep-house/src/styles/deep-house.ts` composes it out of its own
// numbers and the instruments in `src/params.ts`, and hands it here as `base`.
// There is no default any more, because a default would be this engine knowing
// one style's name. This file is the contract over
// whatever table it is given and nothing else.

import { clone, merge } from './params.ts';
import type { Table } from './style.ts';
import { validateKeyboardPatches } from './voices/keys-patches.ts';

/**
 * Deeply read-only. Arrays are left as they are rather than widened to
 * `ReadonlyArray`: nothing in the tree ever mutates one, the runtime value is
 * frozen either way, and a `readonly number[]` would not go into `Rng.pick`,
 * `Rng.weighted` or `Rng.pickWeighted` — which read the candidate lists and
 * are the reason the arrays are there.
 */
type Frozen<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly any[]
    ? T
    : T extends object
      ? { readonly [K in keyof T]: Frozen<T[K]> }
      : T;

/**
 * One complete, resolved, immutable settings value: the base table with a
 * room, a track's own overrides and the audio bypass merged over it in that
 * order, and every derivation the engine used to make at apply time already
 * made. It is what `buildGraph`, `buildMaster`, a voice, a prepare hook and an
 * automation call are handed, and it is the only thing any of them read.
 */
export type Settings = Frozen<Table>;

/** What `resolveSettings` may be given. Every layer is optional; the order is not. */
export interface SettingsInput {
  /** The table to start from: a style's `base`. There is no default. */
  base: Table;
  /** The room: a preset's own `params` block. */
  room?: any;
  /** A track's `paramOverrides` — the room, the hat energy and, live, the bypass already folded in. */
  overrides?: any;
  /** The audio-only bypass (`?limiter=0`, `?sub=-3`), which is last because it wins. */
  bypass?: any;
}

/**
 * Freeze the whole tree, once, on the way out. `Object.freeze` is shallow and
 * a settings value is three levels deep in places, so a frozen `levels` with a
 * writable `energy` under it would be exactly the alias this round exists to
 * remove.
 * @param o anything
 */
function deepFreeze(o: any): any {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/**
 * The resolver. It reproduces, exactly, what the live table's `applyParams()`
 * used to leave behind — the same deep merge, the same order, the same sub
 * ceiling. That was proved against the real thing, key for key and bit for bit
 * on all fourteen golden themes and all three set masters, while the two stood
 * side by side (notes/archive/2026-09-v1-stretch/rounds/round-c.md); what holds it to those numbers now
 * is the program digest, which records every theme's resolved levels and every
 * resolved parameter object a voice is handed.
 *
 * The order is base, then room, then the track's overrides, then the bypass.
 * A deep merge is not associative in general (an object over a number over an
 * object depends on where the brackets go), so the layers are applied
 * left to right here rather than pre-merged and handed over in one.
 */
export function resolveSettings({ base, room = null, overrides = null, bypass = null }: SettingsInput): Settings {
  const out = clone(base) as Table;
  if (room) merge(out, room);
  if (overrides) merge(out, overrides);
  if (bypass) merge(out, bypass);
  if (out.keyboardPatches !== undefined) validateKeyboardPatches(out.keyboardPatches);
  // The one level with a ceiling over it. A preset may set the sub wherever
  // its benchmark minute puts it, up to `subCeilingOverBaseDb` above the base
  // table; past that the record has a different bass every time the preset die
  // rolls, and it is the loudest thing in the mix that changes. It is a
  // ceiling and not a trim, so `?sub=-3` still lands three decibels under
  // whatever the preset ended up with.
  const cap = base.levels.sub + base.levels.subCeilingOverBaseDb;
  if (out.levels.sub > cap) out.levels.sub = cap;
  return deepFreeze(out) as Settings;
}

/**
 * The room a planned theme is played in: its own style's table with the theme's
 * overrides — the room the preset die rolled, plus the hat energy its density
 * asked for — merged over it, and the page's audio bypass last.
 *
 * Every path that makes a sound out of a plan resolves it this way, and they
 * all resolve the *same* value: a deck, the single-theme player, an offline
 * render and the program tool each hold their own copy of one frozen object.
 * A plan carries the style it was planned in (`generate()` writes it), so a
 * plan is enough — nothing has to be told twice which music it is.
 *
 * @param plan a planned theme
 * @param bypass the audio-only overrides, which are last because they win
 */
export function settingsOf(plan: any, bypass: any = null): Settings {
  return resolveSettings({ base: plan.style.base, overrides: plan.paramOverrides, bypass });
}

export default resolveSettings;
