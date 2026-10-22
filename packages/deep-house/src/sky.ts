// What a saved track's link is worked out to, never stored (PLAN-LIBRARY §1, *Worked out, never stored*): its
// colour, its length, its place in the Genres sky and its genre; and a playlist's constellation.
//
// The sky's stars are the genre table's (`genres/genres.json` through `genres/genre-table.ts`): each family a
// region, each tuned sub-genre a lit, named star, each untuned one a place still to tune. The engine never sees
// any of it (genres → birds → sounds): a genre here is a word for where the birds stand.
//
// Pure: no DOM. The time plans the theme once per link and keeps it for the session.

import { normaliseLink } from './playlists.ts';
import { linkHere } from './link.ts';
import type { Link } from './link.ts';
import { recipesFor } from './mix.ts';
import { planTheme } from './planning.ts';
import { clockOf, minutesOf } from './length.ts';
import { ringColour } from './ring-colour.ts';
import { BIRDS, HOUSE, placeDistanceOf } from './spell.ts';
import type { Bird, Spell } from './spell.ts';
import { STRATEGIES } from './strategies/index.ts';
import { switchOn } from './lanes.ts';
import { FAMILIES, familyPreset, subPreset } from './genres/genre-table.ts';

// --- the spell a link plays -------------------------------------------------

const readOf = (link: string): Link | null => {
  const n = normaliseLink(link);
  return n.ok ? linkHere(n.link) : null;
};

const SPELLS = new Map<string, Partial<Spell> | null>();
/**
 * **The birds a link plays**, as the ring reads them: the spell it names; under a recipe with none, the spell the
 * recipe rolls off the seed (`recipesFor`, the cast the page plays: no theme is planned); `null` (the house) where
 * it names none, where its engine does not read the birds (house-v1, the record, wears the gold whatever the link
 * holds, as the ring does), or where the link cannot be played. Kept per link for the session.
 */
export function spellOf(link: string): Partial<Spell> | null {
  if (SPELLS.has(link)) return SPELLS.get(link)!;
  let spell: Partial<Spell> | null = null;
  const L = readOf(link);
  const s = L ? STRATEGIES[L.strategy] : null;
  if (L && s && switchOn(s.style, 'derived')) {
    if (L.spell) spell = L.spell;
    else if (L.recipe !== null) {
      try { spell = recipesFor({ masterSeed: L.seed!, strategy: L.strategy, search: `?${normaliseLink(link).link}` }).spell; } catch (e) { spell = null; }
    }
  }
  SPELLS.set(link, spell);
  return spell;
}

/** **The colour**: the ring's ink for the link's birds (`ring-colour.ts`), exactly what the ring would wear. */
export const colourOf = (link: string): string => ringColour(spellOf(link)).hex;

// --- time -------------------------------------------------------------------

export interface ThemeTime { minutes: number; clock: string; bars: number; bpm: number }
const TIMES = new Map<string, ThemeTime | null>();

/**
 * **The theme's length**, from its plan: the same `planTheme` call the page plays and the readout's `length` reads
 * (`clockOf(minutesOf(bars, bpm))`). A full plan, because a cheaper read of the length before the theme is
 * composed misses a recipe's and a development mode's own cut: 5 to 90 ms a track on a laptop (13 ms on average
 * over the link digest's rows), so it is asked lazily, for the rows in view, and kept per link for the session.
 * `null` where the link does not plan.
 */
export function timeOf(link: string): ThemeTime | null {
  if (TIMES.has(link)) return TIMES.get(link)!;
  let out: ThemeTime | null = null;
  const L = readOf(link);
  if (L?.seed) {
    try {
      const search = `?${normaliseLink(link).link}`;
      const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search });
      const t = planTheme(L.seed, L.theme, { strategy: L.strategy, search, spell: cast.spell, recipe: cast.track });
      const minutes = minutesOf(t.bars, t.bpm);
      out = { minutes, clock: clockOf(minutes), bars: t.bars, bpm: t.bpm };
    } catch (e) { out = null; }
  }
  TIMES.set(link, out);
  return out;
}

/** A playlist's total as the panel writes it (his word 10-20): `1 h 14 m (10)`, `52 m (7)`. */
export function totalOf(minutes: number, count: number): string {
  const m = Math.round(minutes);
  return `${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`} (${count})`;
}

// --- the sky ----------------------------------------------------------------

/**
 * **The projection, frozen** (re-frozen 10-20, phase 4, before anything shipped: his word, Drone in the Ambient
 * field). Three axes over the eight birds' distance from the house, so the house is the origin. Derived once as
 * the principal axes of the twelve lit stars' spells (`lit` below: the table's own measured sub-genres and the
 * tuned family presets with no lit sub-genre) under `Sw + 2·Sb`: the scatter within each family plus twice the
 * spread between the families' centres, an LDA-leaning PCA, so a family's stars stay together and still spread
 * (plain LDA put Drone on Ambient and Downtempo on Trip Hop). Each sign set so Ember loads positive; rounded to
 * three places. The first axis is energy (Ember, Spark), the second wet and heavy against bright and busy (Tide,
 * Ember, Loom up; Spark, Zephyr, Veil down), the third the later 3D sky's depth. They carry 48 %, 27 % and 13 %.
 * The 10-20 phase-1 axes (plain principal axes with seven air places for spread) put Drone by the house.
 * **Never re-derived in place**: a star must not move between releases.
 */
export const SKY_AXES: Readonly<Record<'x' | 'y' | 'z', Readonly<Record<Bird, number>>>> = Object.freeze({
  x: Object.freeze({ ember: 0.846, tide: -0.115, zephyr: 0.016, root: 0.102, gleam: 0.179, veil: 0.188, spark: 0.439, loom: -0.032 }),
  y: Object.freeze({ ember: 0.369, tide: 0.479, zephyr: -0.383, root: 0.238, gleam: 0.027, veil: -0.378, spark: -0.457, loom: 0.280 }),
  z: Object.freeze({ ember: 0.238, tide: 0.198, zephyr: 0.466, root: -0.405, gleam: 0.194, veil: 0.370, spark: -0.576, loom: -0.131 }),
});

export interface SkyPoint { x: number; y: number; z: number }

/** A spell's place in the sky (y up, as the arithmetic has it; a drawing flips it). The house is the origin. */
export function skyOf(spell: Partial<Spell> | null | undefined): SkyPoint {
  const at = (axis: 'x' | 'y' | 'z') => BIRDS.reduce((s, b) => s + SKY_AXES[axis][b] * ((spell?.[b] ?? HOUSE[b]) - HOUSE[b]), 0);
  return { x: at('x'), y: at('y'), z: at('z') };
}
/** A link's place in the sky. */
export const skyOfLink = (link: string): SkyPoint => skyOf(spellOf(link));

/**
 * **A named place in the sky**: a genre family (a region, about its own spell) or a sub-genre (a star). `tuned`: lit,
 * a place the ring's controls stand at (its own measured spell, or the region its recipe rows share: the machine
 * view's own reading, `subPreset`); untuned, an open ring still to tune, standing at its family's place. `own`: the
 * spell is the sub-genre's own measurement rather than its rows' region or its family's. The house's own star is
 * `home`. `lit`: a lit, named star in the sky, one to press: a sub-genre with its own measured spell, or a family's
 * tuned preset where none of its sub-genres is lit and no lit star stands at that spell already (Techno, Trance,
 * Breaks). A sub-genre tuned only by its rows' region shares a lit star's place or its family's, so it is drawn as
 * an open ring. No tempo window: the genre table names none.
 */
export interface SkyPlace {
  id: string;
  name: string;
  family: string;
  kind: 'family' | 'sub';
  tuned: boolean;
  own: boolean;
  home: boolean;
  lit: boolean;
  spell: Readonly<Partial<Spell>>;
  point: SkyPoint;
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const spellKey = (s: Readonly<Partial<Spell>>) => BIRDS.map((b) => (s[b] ?? HOUSE[b]).toFixed(3)).join();

/** **The sky's places**, read off the genre table. */
export const SKY_PLACES: readonly SkyPlace[] = Object.freeze((() => {
  const all = FAMILIES.flatMap((f) => {
  const fp = familyPreset(f);
  const family: SkyPlace = { id: slug(f.label), name: f.label, family: f.label, kind: 'family', tuned: fp.tuned, own: f.tuned, home: false, lit: false, spell: fp.spell, point: skyOf(fp.spell) };
  const subs = f.subs.map((s): SkyPlace => {
    const p = subPreset(f, s);
    const spell = p.tuned ? p.spell : fp.spell;
    const own = !!(s.tuned && s.spell);
    return { id: `${slug(f.label)}/${slug(s.label)}`, name: s.label, family: f.label, kind: 'sub', tuned: p.tuned, own,
      home: own && !Object.keys(s.spell!).length, lit: own, spell, point: skyOf(spell) };
  });
  return [family, ...subs];
  });
  const taken = new Set(all.filter((p) => p.lit).map((p) => spellKey(p.spell)));
  for (const p of all) {
    if (p.kind !== 'family' || !p.tuned || all.some((q) => q.lit && q.family === p.family) || taken.has(spellKey(p.spell))) continue;
    p.lit = true;
    taken.add(spellKey(p.spell));
  }
  return all.map((x) => Object.freeze(x));
})());

/**
 * **A spell's genre**: the nearest lit star (a sub-genre or a family's preset), by the composer's own place distance
 * (`placeDistanceOf`, the eight birds' Euclidean distance; the table names no tempo window), so a track's genre is
 * a star the sky shows. A tie goes to the table's order.
 */
export function genreOfSpell(spell: Partial<Spell> | null | undefined): SkyPlace {
  const full = { ...HOUSE, ...(spell ?? {}) } as Spell;
  let best: SkyPlace | null = null, at = Infinity;
  for (const p of SKY_PLACES) {
    if (!p.lit) continue;
    const d = placeDistanceOf(p.spell, [0, Infinity], full, 0);
    if (d < at - 1e-9) { at = d; best = p; }
  }
  return best!;
}
/** **A link's genre**: its sub-genre's name, its family beside it. */
export function genreOf(link: string): { name: string; family: string; id: string } {
  const g = genreOfSpell(spellOf(link));
  return { name: g.name, family: g.family, id: g.id };
}

// --- the constellation ------------------------------------------------------

export interface Star { x: number; y: number; colour: string }

const n2 = (v: number) => String(Math.round(v * 100) / 100);

/**
 * **A playlist's constellation**: its stars (sky points, in playing order) as an SVG string `w` by `h`, the shape
 * scaled to fill the box with its aspect kept (y flipped to point up), a single star (or stars all at one place)
 * centred, the stars joined by lines in playing order, each star a small ring in its own colour. Line work only, no
 * glow and no fill but the stars'.
 */
export function constellationSvg(stars: readonly Star[], w: number, h: number, opts: { pad?: number; r?: number; line?: string } = {}): string {
  const r = opts.r ?? Math.max(1.5, Math.min(w, h) / 16);
  const pad = opts.pad ?? r * 1.5;
  const xs = stars.map((s) => s.x), ys = stars.map((s) => s.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0);
  const k = span > 1e-9 ? Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-9), (h - 2 * pad) / Math.max(y1 - y0, 1e-9)) : 0;
  const at = (s: Star) => [w / 2 + (s.x - (x0 + x1) / 2) * k, h / 2 - (s.y - (y0 + y1) / 2) * k] as const;
  const pts = stars.map(at);
  const line = opts.line ?? 'currentColor';
  const path = pts.length > 1 ? `<polyline points="${pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ')}" fill="none" stroke="${line}" stroke-width="1" stroke-linejoin="round" opacity="0.6"/>` : '';
  const dots = pts.map(([x, y], i) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" fill="none" stroke="${stars[i].colour}" stroke-width="1.25"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${path}${dots}</svg>`;
}

/** A playlist's constellation from its tracks' links. */
export const constellationOf = (links: readonly string[], w: number, h: number): string =>
  constellationSvg(links.map((l) => { const p = skyOfLink(l); return { x: p.x, y: p.y, colour: colourOf(l) }; }), w, h);
