// The genre table (GA8): the families, their keys and the nine tiles, read off `genres.json`; what the keys
// under the ring (`genres.tsx`) draw and press, and what a node tool plays at each tile. No React here.

import { BIRDS, HOUSE, SPELL_SAME, asSpell } from '../spell.ts';
import type { Spell } from '../spell.ts';
import PRESETS from './genres.json' with { type: 'json' };
import ROW_PLACES from '../row-places.json' with { type: 'json' };

/**
 * **The table** (M7, Eugene: *"we select top-level genres on the first screen,
 * then the selected item becomes the centre and we have eight sub-genres —
 * DnB → Liquid, Jungle, Techstep, Neurofunk…; the matrices of dependencies and
 * control values should be stored in JSON, as we will polish and iterate on
 * it"*). `genres.json` is the table: families, each with its measured spell,
 * and up to eight sub-genres, each either `tuned` with a measured spell of its
 * own or not yet, when it plays its family's and says so.
 */
export interface GenreSub {
  label: string;
  /** the controls away from the house, where the sub is tuned */
  spell?: Partial<Spell>;
  tuned: boolean;
  about: string;
  /** (M18) the recipe library's rows that belong to it, by their own ids */
  recipes?: string[];
}
export interface GenreFamily {
  label: string;
  spell: Partial<Spell>;
  /** false: the ring's controls cannot reach this genre and the spell is the nearest the search found */
  reachable: boolean;
  /** (M10) its own spell is one to play: measured and reached; false, its key on its own tier is disabled */
  tuned: boolean;
  about: string;
  /** (M18) the recipe library's rows that belong to the family as a whole */
  recipes?: string[];
  subs: GenreSub[];
}
/** A key as the grid draws it: its word, its spell, its tooltip, and where it leads. */
export interface GenrePreset {
  label: string;
  spell: Partial<Spell>;
  reachable: boolean;
  /**
   * (M10) whether the key plays: its spell is tuned, or (M23) the recipe rows it
   * claims have a region, so its spell is their audit key's and a theme in
   * three under it draws them; a key that plays neither is disabled
   */
  tuned: boolean;
  /** (M23) the region key its rows are admitted around, where it plays by its rows */
  byRows?: string;
  about: string;
  /** the family it belongs to (M17): with the label, a style's name */
  of?: string;
}
/**
 * A tile of the grid (GA8), as `genres.json` names it: its word, the family it
 * stands for, and — where two tiles share one family — the family's styles it
 * gathers.
 */
export interface GenreTile {
  label: string;
  family: string;
  styles?: string[];
  about?: string;
}

const TABLE = PRESETS as unknown as {
  home: string;
  grid: { centre: { family: string; style: string }; around: GenreTile[] };
  families: GenreFamily[];
};
export const FAMILIES: readonly GenreFamily[] = TABLE.families;
/** The family the house belongs to. */
export const HOME = TABLE.home;

/**
 * **The place a key's rows play at** (M23; since GA5 the composer knows rows
 * and birds only, `src/row-places.json`, keyed by the rows' own ids): a key's
 * spell is the birds most of its rows sit at, the first named on a tie; the
 * house's own place (no bird named) is not a key's. The genre side of the map
 * stays here, in the machine view.
 */
const PLACES = ROW_PLACES as unknown as { rows: Record<string, { birds: Partial<Spell> }> };
const placeOf = (id: string): string | null => {
  const p = PLACES.rows[id];
  return p && Object.keys(p.birds).length ? JSON.stringify(p.birds) : null;
};
export function regionOf(rows: readonly string[] | undefined): string | null {
  const count = new Map<string, number>();
  for (const id of rows || []) { const k = placeOf(id); if (k) count.set(k, (count.get(k) || 0) + 1); }
  let best: string | null = null;
  for (const [k, n] of count) if (!best || n > count.get(best)!) best = k;
  return best;
}
const byRows = (region: string | null) => (region ? { byRows: region, spell: JSON.parse(region) as Partial<Spell> } : null);

/**
 * A sub as a key: its own spell where tuned, its rows' region where it has one (M23), its family's where not.
 * **A tuned sub is reached** (the deep review of 10-08): its spell is a place the
 * ring's controls stand at, so its tooltip never says otherwise; it read its
 * family's `reachable`, and the Drum & Bass tile, which plays Liquid's measured
 * spell, said it was not reached by the ring's controls.
 */
export const subPreset = (f: GenreFamily, s: GenreSub): GenrePreset => {
  const mine = !!(s.tuned && s.spell);
  const own = mine ? null : byRows(regionOf(s.recipes));
  return { label: s.label, spell: mine ? s.spell! : f.spell, reachable: mine || f.reachable, about: s.about, of: f.label, ...own, tuned: s.tuned || !!own };
};
export const familyPreset = (f: GenreFamily): GenrePreset => {
  // a family's rows are its own and its sub-genres': it plays the region most of them share
  const own = f.tuned ? null : byRows(regionOf([...(f.recipes || []), ...f.subs.flatMap((x) => x.recipes || [])]));
  return { label: f.label, spell: f.spell, reachable: f.reachable, about: f.about, of: f.label, ...own, tuned: f.tuned || !!own };
};

/**
 * **A tile's preset** (GA8, the brief: *"the family's existing centre preset;
 * where a family had no single preset, take its first tuned sub-style's"*): a
 * tile of a whole family plays the family's own key as its tier drew it — its
 * tuned spell, or the place its rows share (M23) — and, where it has neither,
 * the family's first tuned style; a tile of some of a family's styles plays the
 * first of them that is tuned, or the place their rows share. Neither: the tile
 * is untuned, and disabled. `null` where the table names no such family.
 */
export function tilePreset(t: GenreTile): GenrePreset | null {
  const f = FAMILIES.find((x) => x.label === t.family);
  if (!f) return null;
  let base: GenrePreset;
  if (!t.styles) {
    base = familyPreset(f);
    const first = base.tuned ? undefined : f.subs.find((s) => s.tuned && s.spell);
    if (first) base = subPreset(f, first);
  } else {
    const subs = t.styles.map((w) => f.subs.find((s) => s.label === w)).filter((s): s is GenreSub => !!s);
    const first = subs.find((s) => s.tuned && s.spell);
    const own = first ? null : byRows(regionOf(subs.flatMap((s) => s.recipes || [])));
    base = first ? subPreset(f, first) : { label: t.label, spell: f.spell, reachable: f.reachable, about: subs[0]?.about ?? f.about, ...own, tuned: !!own };
  }
  return { ...base, label: t.label, about: t.about ?? base.about, of: f.label };
}

/**
 * **Whether a key presses** (M10, Eugene: *"the tiles we do not support
 * completely need to be disabled and not clickable"*): only where its spell is
 * tuned — as the table says, never the code. Under house-v1 only the centre.
 */
export function presses(p: GenrePreset, v1: boolean, centre: boolean): boolean {
  if (v1) return centre;
  return p.tuned;
}

/**
 * **Deep House, the centre, always** (M8, Eugene: *"Deep House in the centre as
 * the default style ... this exception is only for Deep House, due to the
 * nature of the project"*): the grid's `centre`, the house's own style, the one
 * tuned to the house itself. Pressed, it plays the house.
 */
const homeFamily = FAMILIES.find((f) => f.label === TABLE.grid.centre.family) ?? FAMILIES.find((f) => f.label === HOME) ?? FAMILIES[0];
export const DEEP_HOUSE: GenrePreset = subPreset(homeFamily,
  homeFamily.subs.find((s) => s.label === TABLE.grid.centre.style)
  ?? homeFamily.subs.find((s) => s.tuned && s.spell && !Object.keys(s.spell).length) ?? homeFamily.subs[0]);

/** The eight tiles round the centre, in reading order; a cell the table names nothing for is `null`. */
export const TILES: ReadonlyArray<GenrePreset | null> = (() => {
  const around: Array<GenrePreset | null> = TABLE.grid.around.slice(0, 8).map(tilePreset);
  while (around.length < 8) around.push(null);
  return around;
})();

/**
 * **The nine cells, fixed** (GA8, Eugene: *"tiles change position. Fix all
 * tiles in place, add a green dot to the selected one. Simple UX."*): in
 * reading order, Deep House always the fifth and the eight always in their
 * cells; nothing moves when a style is chosen.
 */
export const CELLS: ReadonlyArray<GenrePreset | null> = [...TILES.slice(0, 4), DEEP_HOUSE, ...TILES.slice(4, 8)];

/** A key's whole spell, the house under what it names. */
export const presetSpell = (p: GenrePreset): Spell => asSpell({ ...HOUSE, ...p.spell });

/** How far apart two spells read: the largest single bird's difference. */
export function spellGap(a: Partial<Spell> | null | undefined, b: Partial<Spell> | null | undefined): number {
  let gap = 0;
  for (const bird of BIRDS) gap = Math.max(gap, Math.abs((a?.[bird] ?? HOUSE[bird]) - (b?.[bird] ?? HOUSE[bird])));
  return gap;
}

/** Lit within this of its preset: the one tolerance for the same spell (M14, `SPELL_SAME`). */
export const NEAR = SPELL_SAME;

/** Whether a key is lit: its spell is tuned and is the one playing. */
export function isLit(p: GenrePreset, playing: Partial<Spell> | null | undefined): boolean {
  // (M11) an untuned spell says nothing about what plays: a tile with none
  // measured would read as the house
  return p.tuned && spellGap(playing, presetSpell(p)) <= NEAR;
}

/**
 * **The selected style** (M17's rule; since GA8 a dot, never a place): Deep
 * House at the house, or the tile whose spell is playing. Every style a key can
 * play and that is tuned — Deep House and the tuned tiles — named by its family
 * and its word.
 */
export const styleKey = (p: GenrePreset): string => `${p.of ?? ''}/${p.label}`;
export const TUNED_STYLES: readonly GenrePreset[] = [
  DEEP_HOUSE,
  ...TILES.filter((p): p is GenrePreset => !!p && p.tuned && styleKey(p) !== styleKey(DEEP_HOUSE)),
];
/**
 * Which style is selected, and carries the dot: the tuned style the playing spell is
 * (within `SPELL_SAME`) — the one last chosen if it is among them — and, where
 * the spell is no tuned style (a bird moved), the one last chosen, unlit; a
 * viewer who never chose one has Deep House, the default, unlit. Never a blank:
 * one key always carries the dot.
 */
export function selectedOf(playing: Partial<Spell> | null | undefined, chosen: string | null): GenrePreset {
  const same = TUNED_STYLES.filter((p) => spellGap(playing, presetSpell(p)) <= NEAR);
  const kept = chosen ? TUNED_STYLES.find((p) => styleKey(p) === chosen) : undefined;
  if (kept && same.includes(kept)) return kept;
  if (same.length) return same[0];
  return kept ?? DEEP_HOUSE;
}
