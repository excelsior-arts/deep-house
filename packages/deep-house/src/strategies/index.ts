// The composition strategies, as data.
//
// ROADMAP's decision of 09-18, *how engines evolve*, in one table: **no second
// engine, no v1 copy, no branch.** A composition strategy is a versioned thing
// inside one engine — a style, a catalogue, a bias, a recipe set and an
// interpreter version, each with its own golden and program digest — and v1 is
// one of them rather than the thing the others are a departure from.
//
//   `house-v1`  the record. Today's style, today's frozen catalogue, the
//               identity bias, the two digests Eugene smoke-tests on his
//               reference seeds. It is the **default**: a link, a mark or a
//               saved player state with no strategy on it is this one, and the
//               check asserts that in so many words, because "an unversioned
//               old link resolves to v1" is the promise the whole scheme rests
//               on.
//   `house-v2`  the kitchen, wired and — since round K5b — switched on. The
//               same style data by reference, a catalogue with fifty-two
//               voices and twenty-six effects in it at the weights K5b's rule
//               opened, four switches that are on, twelve lanes that draw
//               (round K6), a loudness model of its own and a third room slot
//               that is still empty. It plans a different record from
//               `house-v1` on every golden theme, which is what its own
//               section of each digest says; it was the record at weight
//               nought from K5a until K5b.
//
// A strategy is retired only when its digest can no longer be reproduced, and
// then its fixtures move to `archive/`. Sound revisions — voices, master — are
// a separate axis and are re-blessed per reference as they always were.
//
// **This is the one module in either package that names a style.** `src/mix.ts`
// used to; it asks here now, so the rule the check keeps — no engine module
// reaches for a style, and the app names one in one place — is a rule about one
// file instead of two.

import { linkRaw, versionOf } from '../link-table.ts';
import { generationOf } from '../generation.ts';
import { validateStyle } from '../composition.ts';
import legacyCalibrationV2 from './calibration-v2-legacy.json' with { type: 'json' };
import type { Style } from '@deep-house/engine/style';
import type { Spell } from '../spell.ts';
import type { Calibration } from '../calibration.ts';
import { HOUSE, HOUSE_BOX } from '../spell.ts';
import { style as houseV1Style } from '../styles/deep-house.ts';
import { style as houseV2Style } from '../styles/deep-house-v2.ts';

/**
 * One composition strategy.
 *
 * `digests` are paths and not contents: a digest is a committed file that a
 * clean clone checks against, and the strategy says which file rather than
 * carrying a hash that would have to be kept in step by hand. Both are relative
 * to `packages/deep-house/`.
 */
export interface Strategy {
  /** the id a URL, a mark and a saved state carry */
  id: string;
  label: string;
  /** the music: everything that is this record rather than the machine */
  style: Style;
  /** the candidate lists with their weights — the style's own, named here so a
   * reader of this table does not have to go and find them. `any` because the
   * engine's `Style.catalogue` is: which lists a style has is the style's, and
   * a shape written here would be one composer's table stated twice. */
  catalogue: any;
  /** the spell layer's two constants: the vector the bias is the identity at,
   * and the box a recipe is rolled inside */
  spell: { HOUSE: Readonly<Spell>; HOUSE_BOX: Readonly<Spell> };
  // **Three fields are gone** (round (f) of the reconciled review of 09-24,
  // R102 and D31): `recipes` (every strategy's was `recipes/`, and the library
  // is `src/recipes.ts`'s), `interpreter` (a number nothing read, beside the
  // recipe rows' own `INTERPRETER` in `interpret.ts`, which is the one that
  // is), and `digests` (two paths nothing read: `tools/golden.ts` and
  // `tools/program.ts` name their files, per strategy section, themselves).
  // A field that moves nothing when it is changed is a promise nobody keeps.
  /**
   * **The map between the dice and the readings**, or `null` where there is
   * none: `src/calibration.ts` for what it is and
   * `packages/mining/tools/calibration.ts` for the sweep that measures it.
   *
   * It is the strategy's own and not the library's, because it is a
   * description of *what this machine's switches do* — a different catalogue
   * at different weights moves a bird's reading a different distance, and a
   * map measured under one strategy is not a measurement of another. So a row
   * of the library means one thing under `house-v2` and, having no map,
   * another under `house-v1`.
   *
   * `house-v1` carries `null` on purpose. It is the record, its four switches
   * are off, and every number in `recipes/` was cut out of the golden it
   * plays: reading those numbers as dice *is* reading them as the readings
   * they were taken from, because under v1 nothing in between has moved.
   */
  calibration: Calibration | null;
  /**
   * Frozen reading translation for recipes captured through interpreter v2.8
   * (`LEGACY_INTERPRETERS` in `src/mix.ts`). It is stale against the current
   * generation by construction and is never a live reach claim.
   */
  legacyCalibration: Calibration | null;
  generation: string;
  /** what this strategy's own ear has ruled out, with the reason */
  flagged: ReadonlyArray<{ id: string; kind: string; why: string; since: string }>;
}

// Both shipped styles' composition data is checked here, once, at load: a
// malformed family, condition or sound character fails the import with its
// name rather than quietly emptying the requests that reach it.
validateStyle(houseV1Style);
validateStyle(houseV2Style);

/** The default, and the answer to an absent one. Written once. */
export const DEFAULT_STRATEGY = 'house-v1';

const houseV1: Strategy = Object.freeze({
  id: 'house-v1',
  label: 'house v1 — the record',
  style: houseV1Style,
  catalogue: houseV1Style.catalogue,
  spell: Object.freeze({ HOUSE, HOUSE_BOX }),
  calibration: null, legacyCalibration: null, generation: generationOf(houseV1Style),
  flagged: Object.freeze([]),
});

const houseV2: Strategy = Object.freeze({
  id: 'house-v2',
  label: 'house v2 — the kitchen',
  style: houseV2Style,
  catalogue: houseV2Style.catalogue,
  // The same two constants, deliberately: house-v2's centre is the record's
  // centre until something has been measured that says otherwise, and moving it
  // would be a re-calibration rather than a wider catalogue.
  spell: Object.freeze({ HOUSE, HOUSE_BOX }),
  // No live map: the only one measured (`calibration-v2-legacy.json`) was
  // fitted before `composer-3`, so it is kept for replaying rows captured
  // through interpreter v2.8 and nothing else. A fresh fit writes
  // `calibration-v2.json`, and this line names it.
  calibration: null,
  legacyCalibration: legacyCalibrationV2 as unknown as Calibration, generation: generationOf(houseV2Style),
  flagged: houseV2Style.flagged,
});

/** Every strategy this build can play, in the order they were made. */
export const STRATEGIES: Readonly<Record<string, Strategy>> = Object.freeze({
  'house-v1': houseV1,
  'house-v2': houseV2,
});

/** The ids, in that order. */
export const STRATEGY_IDS: readonly string[] = Object.freeze(Object.keys(STRATEGIES));

/**
 * The strategy an id names. **An absent, empty or unknown id is the default**,
 * which is the rule that keeps every link ever shared working: a seed URL from
 * the public build carries no strategy at all and means the record.
 *
 * An id that is not a strategy says so on the console and then behaves like
 * nothing was asked for, the way a malformed spell does — a listener who
 * mistypes one gets the record and not an error page.
 */
export function strategyById(id: string | Strategy | null | undefined): Strategy {
  if (id && typeof id === 'object' && 'style' in id) return id as Strategy;
  if (!id) return STRATEGIES[DEFAULT_STRATEGY];
  const key = String(id).trim();
  if (!key) return STRATEGIES[DEFAULT_STRATEGY];
  const found = STRATEGIES[key];
  if (found) return found;
  if (typeof console !== 'undefined') console.log(`strategy: no strategy called ${key}; playing ${DEFAULT_STRATEGY}`);
  return STRATEGIES[DEFAULT_STRATEGY];
}

/** The style a strategy plays, for a caller that only wants the music. */
export const styleOf = (id: string | Strategy | null | undefined): Style => strategyById(id).style;

/**
 * `?v=2` — the composer's own read of the page's query string, beside
 * `readBypass`'s and `spellFromQuery`'s, through the link's table
 * (`src/link.ts`, which maps a version token to a strategy id in one place).
 * Nothing in the ring is involved: `createMix` asks for this the way it asks
 * for the bypass, so a bench, a check and a URL all reach a strategy the same
 * way.
 *
 * `null` back means *nothing was asked for*, and the caller uses the default,
 * which is the same call the golden makes. A value no version answers to comes
 * back as it stands, and `strategyById` says so and plays the default.
 */
export function strategyFromQuery(search?: string | null): string | null {
  try {
    const v = linkRaw('v', search);
    if (!v || !v.trim()) return null;
    return versionOf(v)?.strategy ?? v.trim();
  } catch (e) {
    return null;
  }
}

/** The style this build plays with nothing asked of it. */
export const STYLE: Style = STRATEGIES[DEFAULT_STRATEGY].style;

export default STRATEGIES;
