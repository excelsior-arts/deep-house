// The link's table: every query parameter the page reads, by name, and the
// engines a link can name. `src/link.ts` is the reader and the writer and says
// why; this is the part the composer's own readers (`spell.ts`,
// `strategies/index.ts`, `development.ts`, `recipe-request.ts`, `set-plan.ts`)
// ask, so it imports nothing at all at run time: they are imported by
// everything, and a table that pulled the composer in behind it would be read
// before the composer had finished loading.

import type { Accompaniment } from './recipe-request.ts';
import type { Development } from './development.ts';

/**
 * What a parameter is for:
 *
 *   `sound`   shapes what is composed — the seed, the engine, the theme, the
 *             spell, the recipe and the two modes. A written link carries every
 *             one of them, or its version's reading of its absence.
 *   `place`   where in the track: the bar (read, never written), and the time
 *             `t` (read once, written only by the time link, K32).
 *   `view`    the page and not the sound: the machine view, the engine
 *             lock, the output road, the latency hint. Kept as given.
 *   `bypass`  a mixing stage taken out for listening (`readBypass` in
 *             `set-plan.ts`). It changes what is heard and never what is
 *             planned; kept as given, never written by the page.
 */
export type LinkClass = 'sound' | 'place' | 'view' | 'bypass';

/** One parameter the page reads. */
export interface LinkRow {
  name: string;
  class: LinkClass;
  /** what a link without it plays */
  absent: string;
  /** when the page's own writer puts it on the address */
  written: string;
}

export const BYPASS_NAMES = ['all', 'kickdrive', 'body', 'push', 'limiter', 'clip', 'glue', 'basscomp', 'duck', 'sub'] as const;

/** **The table.** Every parameter the page reads, once, in the order a written link names them. */
export const LINK_ROWS: readonly LinkRow[] = Object.freeze([
  { name: 'seed', class: 'sound', absent: 'on a bare address, the link stored in this browser (every sound row of it), else seed 1', written: 'always, once a hand has started the set' },
  { name: 'v', class: 'sound', absent: 'the page\'s default engine (`DEFAULT_VER`: house-v2, in every build)', written: 'always, as the version number bare (`v=1`, `v=2`); a full strategy id is read too and written as its number' },
  { name: 'theme', class: 'sound', absent: 'theme one', written: 'when it is not the first (K34: theme one is what a link without one plays, as a bird at its house is left out)' },
  { name: 'spell', class: 'sound', absent: 'the engine\'s house, or the roll a recipe makes off the seed', written: 'when a hand set it or a journal entry was heard under it; not at the house and not a roll the recipe redoes' },
  { name: 'recipe', class: 'sound', absent: 'no recipe (`none`)', written: 'when one is asked (`auto` or a row id); `none` is read and written only by an explicit writer' },
  { name: 'accompaniment', class: 'sound', absent: 'base', written: 'when it is not base' },
  { name: 'development', class: 'sound', absent: 'base', written: 'when it is not base' },
  { name: 'bar', class: 'place', absent: 'the start of the theme (a reload resumes at the second saved in this browser)', written: 'never: a shared link starts the track from its beginning' },
  // K32 (Eugene: "a link with the time"): a start position, not a sound row
  { name: 't', class: 'place', absent: 'the start of the theme', written: 'only by the time link (`linkWithTime`, the machine view\'s key): integer seconds into the theme, never on the canonical link, a digest row or the address the page keeps — read once at the open, the set starting at the bar line at or before it, and dropped from the address at once, so a reload plays from the top' },
  { name: 'lock', class: 'view', absent: 'the engine switch is free', written: 'never; `lock=engine` is kept as given' },
  { name: 'view', class: 'view', absent: 'the ring', written: '`view=machine` while the machine view is open, removed when it closes (K21); a stored place carries it' },
  { name: 'out', class: 'view', absent: 'a media element on an Apple phone, straight out elsewhere', written: 'never; kept as given' },
  { name: 'latency', class: 'view', absent: 'the playback hint', written: 'never; kept as given' },
  ...BYPASS_NAMES.map((name) => ({ name, class: 'bypass' as const, absent: 'the stage in the chain', written: 'never; kept as given' })),
]);

export const ROW: Record<string, LinkRow> = Object.fromEntries(LINK_ROWS.map((r) => [r.name, r]));
export const SOUND = LINK_ROWS.filter((r) => r.class === 'sound').map((r) => r.name);

/**
 * **The engines a link can name, and what each reads a missing sound
 * parameter as.** The version token is what a link carries, the number bare
 * (`v=2`: Eugene, 09-23, *"just `?v=2&seed=5555`, the shortest form
 * possible"*); the strategy id is what the code calls it (`house-v2`). One row per strategy,
 * and `tools/check-link.ts` holds it to `STRATEGIES` both ways.
 *
 * `absent` is part of the engine and frozen with it: a link written under v2
 * that leaves `development` off means `base` for as long as v2 exists, even if
 * a later engine reads a missing development as something else. The spell's
 * absence is the engine's own house (`strategy.spell.HOUSE`), which the check
 * holds to house-v2's plan lock; the theme is written when it is not the first
 * (K34).
 */
export interface Version {
  ver: string;
  strategy: string;
  absent: { recipe: string | null; accompaniment: Accompaniment; development: Development };
}

export const VERSIONS: readonly Version[] = Object.freeze([
  Object.freeze({ ver: '1', strategy: 'house-v1', absent: Object.freeze({ recipe: null, accompaniment: 'base', development: 'base' }) }),
  Object.freeze({ ver: '2', strategy: 'house-v2', absent: Object.freeze({ recipe: null, accompaniment: 'base', development: 'base' }) }),
]) as readonly Version[];

/**
 * **The engine a bare link plays: house-v2, in every build** (Eugene, 09-23:
 * *"we should have the default engine as v2 for now"*). One named field, here
 * and nowhere else — not a build flag, and not the table's order: `VERSIONS`
 * keeps the record first because the composer's `DEFAULT_STRATEGY` (what an
 * absent strategy resolves to everywhere that is not a listener's address bar,
 * and which never moves) is the record, and `tools/check-link.ts` holds both.
 * A written link names its engine and does not care what this says; moving it
 * to a v3 some day moves bare links only, and the check's default-shift proof
 * is the promise that it moves nothing else.
 */
export const DEFAULT_VER = '2';

/** The strategy id a bare link plays: `DEFAULT_VER`'s. */
export function pageDefault(): string {
  return versionOf(DEFAULT_VER, VERSIONS)!.strategy;
}

/** The version a `v` value names: its number, or a strategy id as a fallback. */
export function versionOf(value: string | null | undefined, versions: readonly Version[] = VERSIONS): Version | null {
  const key = String(value ?? '').trim();
  if (!key) return null;
  return versions.find((v) => v.ver === key) ?? versions.find((v) => v.strategy === key) ?? null;
}

/** The token a strategy is written as; an id with no row is written as itself. */
export const verOf = (strategy: string, versions: readonly Version[] = VERSIONS): string =>
  versions.find((v) => v.strategy === strategy)?.ver ?? strategy;

/** The address, or a given query string, as parameters. The one place either is parsed. */
export function linkQuery(search?: string | null): URLSearchParams {
  return new URLSearchParams(search ?? (typeof location !== 'undefined' ? location.search : ''));
}

/**
 * One parameter as the address gives it, by a name the table has. For the
 * readers that validate their own values (`developmentFor` throws on a mode it
 * does not know, and a check holds it to that). A name with no row throws: a
 * parameter is read through the table or not at all.
 */
export function linkRaw(name: string, search?: string | null): string | null {
  if (!ROW[name]) throw new Error(`link: no row for ?${name}= in LINK_ROWS`);
  return linkQuery(search).get(name);
}

/**
 * A sound parameter as the page plays it: what the address says, or — where it
 * says nothing — what the link's engine reads a missing one as. The engine is
 * the one the link names, or the page's default for a bare link.
 */
export function linkValue(name: 'recipe' | 'accompaniment' | 'development', search?: string | null,
  opts: { pageDefault?: string; versions?: readonly Version[] } = {}): string | null {
  const raw = linkRaw(name, search);
  if (raw !== null) return raw;
  const versions = opts.versions ?? VERSIONS;
  const v = versionOf(linkRaw('v', search), versions) ?? versionOf(opts.pageDefault ?? pageDefault(), versions);
  return v ? v.absent[name] : null;
}
