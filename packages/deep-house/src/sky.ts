// What a saved track's link is worked out to, never stored (PLAN-LIBRARY §1, *Worked out, never stored*): its
// colour, its length, its place in the Genres sky and its genre; and a playlist's constellation.
//
// The sky's stars are the genre table's (`genres/genres.json` through `genres/genre-table.ts`): each family a
// region, each tuned sub-genre a lit, named star, each untuned one a place still to tune. The engine never sees
// any of it (genres → birds → sounds): a genre here is a word for the place the birds play (`genreOfSpell`).
//
// Pure: no DOM. The time plans the theme once per link and keeps it for the session.

import { normaliseLink } from './playlists.ts';
import { linkHere } from './link.ts';
import type { Link } from './link.ts';
import { recipesFor } from './mix.ts';
import { planTheme, themeTempo } from './planning.ts';
import { clockOf, minutesOf } from './length.ts';
import { ringColour } from './ring-colour.ts';
import { BIRDS, HOUSE, asSpell, derive, placeDistanceOf } from './spell.ts';
import type { Bird, Spell } from './spell.ts';
import { STRATEGIES } from './strategies/index.ts';
import { switchOn } from './lanes.ts';
import { FAMILIES, OWN_TILES, familyPreset, spellGap, subPreset } from './genres/genre-table.ts';
import { PLACE_LANES, readPlace, rowOf, zoneOf } from './places.ts';
import type { StylePlaces } from './places.ts';

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

const TEMPI = new Map<string, { bpm: number; free: boolean } | null>();
/**
 * **The theme's tempo**, from the dice before it is composed (round pl-clock, a playlist's clock): the same reading
 * of the link `timeOf` makes, and `themeTempo` where it plans — the tempo the plan would carry, read in well under a
 * millisecond rather than a whole plan, so a playlist's tempo is known from its first paint without planning its
 * tracks on the page's thread. Kept per link for the session; `null` where the link does not plan.
 */
export function tempoOf(link: string): { bpm: number; free: boolean } | null {
  if (TEMPI.has(link)) return TEMPI.get(link)!;
  let out: { bpm: number; free: boolean } | null = null;
  const L = readOf(link);
  if (L?.seed) {
    try {
      const search = `?${normaliseLink(link).link}`;
      const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search });
      out = themeTempo(L.seed, L.theme, { strategy: L.strategy, search, spell: cast.spell, recipe: cast.track });
    } catch (e) { out = null; }
  }
  TEMPI.set(link, out);
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
 * tuned preset where none of its sub-genres is lit (or, its own spell measured, where the grid draws it as a tile of its
 * own: Trance beside Hard Trance and Uplifting Trance) and no lit star stands at that spell already (Techno, Trance,
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
    // (a family the grid draws as its own tile, its own spell measured, stays lit beside its lit sub-genres: trance-1)
    const ownTile = p.own && OWN_TILES.has(p.family);
    if (p.kind !== 'family' || !p.tuned || (!ownTile && all.some((q) => q.lit && q.family === p.family)) || taken.has(spellKey(p.spell))) continue;
    p.lit = true;
    taken.add(spellKey(p.spell));
  }
  return all.map((x) => Object.freeze(x));
})());

// --- what a spell plays: the place tables' reading --------------------------

const PLACES_V2 = (STRATEGIES['house-v2']?.style as { places?: StylePlaces } | undefined)?.places ?? null;

/**
 * **What a spell plays, as the place tables read it**: its zone first, then every lane's row (`readPlace`, the
 * composer's own read, at the spell's tempo centre), each as `rowOf` writes it (`house` for the house's own). Two
 * spells with the same reading play the same place. Empty where no style reads places.
 */
function placeReads(spell: Partial<Spell>): readonly string[] {
  if (!PLACES_V2) return [];
  const full = asSpell({ ...HOUSE, ...spell });
  const zone = zoneOf(PLACES_V2, full);
  const bpm = derive(full).tempoCentre;
  return [zone ? `zone:${zone.id}` : 'house', ...PLACE_LANES.map((lane) => rowOf(readPlace(PLACES_V2, lane, full, bpm, zone)))];
}
const placeReading = (spell: Partial<Spell>): string => placeReads(spell).join('|');

/** The lit stars' own readings, read once on the first ask (the dots below ask before the module is done). */
let STAR_READS: { star: SkyPlace; reads: readonly string[] }[] | null = null;
const GENRES = new Map<string, SkyPlace>();

/**
 * **A spell's genre: the lit star whose place it plays** (genres-by-music, his words 10-28: Eclipse, *"which only has
 * bells named Trip Hop is a problem"*). The zone and each of the place tables' lanes (`PLACE_LANES`: the harmony, the
 * form, the sounds, the kit, the riff, the hook, the techniques…) is one vote, given to the lit stars that read the same
 * row there (`rowOf`: two entries with the same row play the same) and shared equally among them, so a row every star
 * plays says little and a row one star plays says it all. A lane reading the house's own row, and a row no lit star
 * plays, votes for no one. The most votes win; a tie (two stars with one reading, or a spell that plays the house in
 * every lane) goes to the nearest by the birds (`placeDistanceOf`, the old rule), then to the table's order. An untuned
 * sub-genre is no candidate: its rows vote for the lit stars that play the same. Pure: the spell and its tempo centre
 * (`derive().tempoCentre`), never a seed's draw, so a link's word never changes with a die. Kept per spell.
 */
export function genreOfSpell(spell: Partial<Spell> | null | undefined): SkyPlace {
  const full = { ...HOUSE, ...(spell ?? {}) } as Spell;
  const key = BIRDS.map((b) => full[b]).join();
  const kept = GENRES.get(key);
  if (kept) return kept;
  STAR_READS ??= SKY_PLACES.filter((p) => p.lit).map((star) => ({ star, reads: placeReads(star.spell) }));
  const votes = STAR_READS.map(() => 0);
  placeReads(full).forEach((row, i) => {
    if (row === 'house') return;
    const who = STAR_READS!.flatMap((s, k) => (s.reads[i] === row ? [k] : []));
    for (const k of who) votes[k] += 1 / who.length;
  });
  let best: SkyPlace | null = null, most = -1, at = Infinity;
  STAR_READS.forEach(({ star }, k) => {
    const d = placeDistanceOf(star.spell, [0, Infinity], full, 0);
    if (votes[k] > most + 1e-9 || (votes[k] > most - 1e-9 && d < at - 1e-9)) { most = Math.max(most, votes[k]); at = d; best = star; }
  });
  GENRES.set(key, best!);
  return best!;
}
/** **A link's genre**: its sub-genre's name, its family beside it. */
export function genreOf(link: string): { name: string; family: string; id: string } {
  const g = genreOfSpell(spellOf(link));
  return { name: g.name, family: g.family, id: g.id };
}

// --- the dots already shown: settled, so they never move (his word 10-28) -----------------------

/**
 * **The dots as they first shipped, settled** (round sky-dots 2; his word 10-28: the dots round the genres are "a general
 * UX improvement for map", kept exactly as round 1 made them): per lit star, each dot as the birds it moves off the
 * star's spell, in its order. A star named here keeps these whatever is tuned later; a star not named (a newly tuned one)
 * draws its own from its stream (`SKY_DOTS`), clear of these. The check (`check-playlists`) holds every one to the
 * rules: its star's genre and place, the clearances, a program of its own.
 */
const SETTLED_DOTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'house/deep-house': ['lo:0.28', 'ro:0.85,gl:0.22', 'ti:0.32,gl:0.58', 'gl:0.11'],
  'house/tech-house': ['ze:0.74', 'ro:0.90', 'ti:0.69,ro:0.44', 'ze:0.34,lo:0.40'],
  'techno': ['ti:0.68,ro:0.89', 'ti:0.69,gl:0.06', 'ti:0.41,ro:0.28', 'ze:0.25'],
  'ambient-and-downtempo/ambient': ['lo:0.51', 'ze:0.70,ro:0.25', 'lo:0.68', 'ro:0.32,lo:0.48'],
  'ambient-and-downtempo/downtempo': ['ze:0.18,ro:0.39', 'ro:0.30,gl:0.53', 'ze:0.60,lo:0.44', 'ze:0.19'],
  'ambient-and-downtempo/trip-hop': ['ro:0.66,gl:0.35', 'ze:0.60', 'ti:0.39', 'ti:0.40,gl:0.01'],
  'ambient-and-downtempo/dark-ambient': ['ti:0.98,gl:0.64', 'ze:0.23', 'ze:0.20,lo:0.37', 'gl:0.67'],
  'ambient-and-downtempo/ambient-dub': ['ze:0.46', 'ze:0.45,lo:0.70', 'gl:0.51', 'ti:0.83'],
  'ambient-and-downtempo/drone': ['ti:0.83,lo:0.54', 'gl:0.29,lo:0.95', 'ze:0.54,gl:0.27', 'ro:0.93'],
  'ambient-and-downtempo/psybient': ['ti:0.63', 'lo:0.97', 'gl:0.50,lo:0.56', 'ze:0.87,lo:0.46'],
  'ambient-and-downtempo/bells': ['ro:0.42,gl:0.59', 'gl:0.94,lo:0.74', 'ti:0.46,gl:0.59', 'ro:0.39,lo:0.59'],
  'ambient-and-downtempo/waves': ['ze:0.48,lo:0.78', 'ze:0.99', 'gl:0.24,lo:0.69', 'ro:0.81,lo:0.65'],
  'ambient-and-downtempo/bowls': ['ti:0.79,gl:0.54', 'ti:0.77,ro:0.54', 'ti:0.70,ro:0.70', 'ro:0.54,gl:0.57'],
  'dnb-and-dub/liquid': ['ti:0.21', 'ze:0.36', 'ro:0.59', 'gl:0.59'],
  'dnb-and-dub/dub-techno': ['ze:0.38,gl:0.52', 'gl:0.15', 'ze:0.53,ro:0.67', 'ze:0.08,gl:0.22'],
  'dnb-and-dub/chillstep': ['ti:0.73,gl:0.20', 'ro:0.98,lo:0.57', 'ti:0.71,gl:0.62', 'ro:0.66,lo:0.53'],
  // 'trance' left round trance-1 (10-28): its star was tuned to its own spell, so its four are drawn again by the rules
  'breaks-and-big-beat': ['ti:0.30,ro:0.45', 'ro:0.43,gl:0.15', 'ti:0.25,lo:0.38', 'ze:0.47,ro:0.95'],
});
const BIRD_OF: Readonly<Record<string, Bird>> = Object.freeze({ em: 'ember', ti: 'tide', ze: 'zephyr', ro: 'root', gl: 'gleam', ve: 'veil', sp: 'spark', lo: 'loom' });
/** A settled dot's spell: its star's, with the birds it names moved. */
const settledSpell = (star: SkyPlace, moved: string): Partial<Spell> =>
  ({ ...star.spell, ...Object.fromEntries(moved.split(',').map((x) => x.split(':')).map(([b, v]) => [BIRD_OF[b], +v])) });
/** The settled dots of the stars lit today, as places on the sky (the open rings keep off them). */
const SETTLED: readonly { star: SkyPlace; spell: Partial<Spell> }[] = SKY_PLACES.filter((p) => p.lit)
  .flatMap((star) => (SETTLED_DOTS[star.id] ?? []).map((m) => ({ star, spell: settledSpell(star, m) })));

// --- the drawing's regions: a family's name and its open rings -------------------

/** A name's own random numbers (FNV-1a into mulberry32): the same name, the same numbers, every time. */
export function rngOf(name: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P2 = { x: number; y: number };
const LIT = SKY_PLACES.filter((p) => p.lit);
const FAMILY_NAMES = [...new Set(SKY_PLACES.map((p) => p.family))];

/** The least spread of a family's rings about its centre (a family of one lit star, or none). */
const RING = 0.075;
/** An open ring's place and magnitude, from its name: one of three sizes and one of two brightnesses. Lit stars stay brightest. */
export interface SkyRing { place: SkyPlace; at: P2; r: number; dim: boolean }
/** A family's region on the drawing: its name's place, its open rings, and whether its name is drawn. */
export interface SkyRegion { family: string; centre: P2; rings: SkyRing[]; named: boolean }

/** Open rings kept this far from a lit star and from each other, and from a settled dot, in sky units. */
const CLEAR_LIT = 0.05, CLEAR_OPEN = 0.032, CLEAR_DOT = 0.028;
const SETTLED_AT = SETTLED.map((d) => skyOf(d.spell));

/**
 * **The families' regions** (genres-sky, 10-20; moved here from the tab with the dots, 10-28, so the dots can keep off
 * the rings): each family's name at its lit stars' centroid and its untuned sub-genres as open rings scattered round it.
 * A drawing, not values: worked out once, the same every time.
 */
export const SKY_REGIONS: readonly SkyRegion[] = Object.freeze((() => {
  const mean = (ps: P2[]): P2 => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
  const lo = { x: Math.min(...LIT.map((p) => p.point.x)), y: Math.min(...LIT.map((p) => p.point.y)) };
  const hi = { x: Math.max(...LIT.map((p) => p.point.x)), y: Math.max(...LIT.map((p) => p.point.y)) };
  // **A family's region is about its own lit stars** (his review 10-20: Liquid read as no part of DnB & Dub): its name
  // at their centroid and its open rings scattered round it, as far out as the stars themselves spread
  const raw = FAMILY_NAMES.map((family) => {
    const own = LIT.filter((p) => p.family === family).map((p) => p.point);
    const centre = own.length ? mean(own) : null;
    const spread = centre ? Math.min(0.3, Math.max(RING, Math.sqrt(own.reduce((s, p) => s + (p.x - centre.x) ** 2 + (p.y - centre.y) ** 2, 0) / own.length))) : RING;
    return { family, centre, spread, rings: SKY_PLACES.filter((p) => p.kind === 'sub' && p.family === family && !p.lit) };
  });
  // a family with no lit star has no place: its region takes the emptiest spot in the sky
  for (const c of raw) {
    if (c.centre) continue;
    let best: P2 = mean(LIT.map((p) => p.point)), far = -1;
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
      const q = { x: lo.x + ((hi.x - lo.x) * i) / 12, y: lo.y + ((hi.y - lo.y) * j) / 12 };
      const near = Math.min(...LIT.map((p) => Math.hypot(p.point.x - q.x, p.point.y - q.y)),
        ...raw.filter((o) => o.centre).map((o) => Math.hypot(o.centre!.x - q.x, o.centre!.y - q.y) - o.spread));
      if (near > far) { far = near; best = q; }
    }
    c.centre = best;
  }
  // **Scattered, not a flower** (his note 10-20): each open ring at a radius of 0.3 to 1.2 of the family's spread and
  // an angle, both from its name, tried again (from the same name) until it clears the lit stars and the rings placed
  const placed: P2[] = [];
  return raw.map((c) => ({
    family: c.family, centre: c.centre!,
    // a family whose own preset is its lit star is named by that star
    named: !LIT.some((p) => p.kind === 'family' && p.family === c.family),
    rings: c.rings.map((place): SkyRing => {
      const rnd = rngOf(place.id);
      let q: P2 = c.centre!;
      for (let n = 0; n < 40; n++) {
        const rr = c.spread * (0.3 + 0.9 * rnd()), t = 2 * Math.PI * rnd();
        q = { x: c.centre!.x + rr * Math.cos(t), y: c.centre!.y + rr * Math.sin(t) };
        if (LIT.every((p) => Math.hypot(p.point.x - q.x, p.point.y - q.y) >= CLEAR_LIT) && placed.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= CLEAR_OPEN)
          && SETTLED_AT.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= CLEAR_DOT)) break;
      }
      placed.push(q);
      const m = rngOf(`${place.id}#magnitude`);
      return { place, at: q, r: [1.2, 1.7, 2.2][Math.floor(m() * 3)], dim: m() < 0.5 };
    }),
  }));
})());


// --- the dots round a star (his idea 10-28) ------------------------------------

/**
 * **The birds that steer inside a place** (the zones' rule, his word 10-18: a few birds pick a zone, the rest steer
 * inside it): Root weight, Gleam light, Zephyr timbre, Tide space, Loom form. Ember, Spark and Veil address (the
 * family, the kind of movement, the rate of change), so a dot never moves them.
 */
export const STEER_BIRDS: readonly Bird[] = Object.freeze(['root', 'gleam', 'zephyr', 'tide', 'loom'] as Bird[]);

/**
 * **An unnamed dot round a lit star**: the star's spell with one or two steering birds nudged, so it is the same genre
 * in another flavour, drawn where its birds put it (`skyOf`). `star` is its star's id; `n` its place among the star's
 * dots (1 to 4).
 */
export interface SkyDot { id: string; star: string; n: number; spell: Readonly<Partial<Spell>>; point: SkyPoint }

/** Dots round each lit star. */
export const DOTS_PER_STAR = 4;
/** A dot's nudge per bird: at least this, and at most this more. */
const NUDGE_MIN = 0.12, NUDGE_SPAN = 0.2;
/** Two dots of one star differ by at least this in some bird, and every dot by as much from its star. */
const DOT_APART = 0.1;
/**
 * In the sky's units (the drawing's: about 380 px a unit at a desktop's fit, 420 to 610 on a phone's first view): a dot
 * stands at least `DOT_CLEAR_LIT` from every lit star and `DOT_CLEAR_DOT` from every dot placed before it, and within
 * `DOT_REACH` of its own star, so it reads as that star's.
 */
const DOT_CLEAR_LIT = 0.03, DOT_CLEAR_DOT = 0.024, DOT_REACH = 0.16;
/** And this far from every open ring (`SKY_REGIONS`), so a press means one thing. */
const DOT_CLEAR_RING = 0.028;
/** The candidates a star's stream is read for, at most. */
const DOT_TRIES = 400;

/** A spell's place on the sky, as two numbers. */
const flat = (s: Partial<Spell>) => { const p = skyOf(s); return { x: p.x, y: p.y }; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * **The dots round every lit star**: a star's settled dots (`SETTLED_DOTS`) where it has them, so a dot once shown
 * never moves; a newly lit star's derived from its id and nothing else (`rngOf(id#dots)`), the same on every visit, and
 * settled in the table by the round that tunes it. Each candidate of the
 * star's stream nudges one or two of the steering birds (`STEER_BIRDS`) by 0.12 to 0.32, kept to the birds' travel and
 * to two decimals (what a link writes), and is kept only if:
 * - its genre is still its star's (`genreOfSpell`);
 * - it plays its star's place: the same zone and the same row in every lane of the place tables (`placeReading`);
 * - it differs from its star and its star's other dots by `DOT_APART` in some bird;
 * - on the sky it stands clear of every lit star, every open ring and every dot placed before it, and near its own star.
 * Otherwise the stream's next candidate is tried. The stars are taken in the table's order.
 */
export const SKY_DOTS: readonly SkyDot[] = Object.freeze((() => {
  const lit = LIT, rings = SKY_REGIONS.flatMap((r) => r.rings);
  // the settled dots first, as they stand; the new stars' streams keep off them
  const out: SkyDot[] = SETTLED.map((d) => d.star.id).filter((id, i, a) => a.indexOf(id) === i).flatMap((id) =>
    SETTLED.filter((d) => d.star.id === id).map((d, i) => Object.freeze({ id: `${id}#${i + 1}`, star: id, n: i + 1, spell: Object.freeze(d.spell), point: skyOf(d.spell) })));
  for (const star of lit) {
    if (SETTLED_DOTS[star.id]) continue;
    const rnd = rngOf(`${star.id}#dots`);
    const home = flat(star.spell), reading = placeReading(star.spell);
    const mine: Partial<Spell>[] = [];
    for (let k = 0; k < DOT_TRIES && mine.length < DOTS_PER_STAR; k++) {
      const birds = [...STEER_BIRDS];
      const many = rnd() < 0.4 ? 1 : 2;
      const spell: Partial<Spell> = { ...star.spell };
      for (let i = 0; i < many; i++) {
        const b = birds.splice(Math.floor(rnd() * birds.length), 1)[0];
        const v = star.spell[b] ?? HOUSE[b], up = rnd() < 0.5, amount = NUDGE_MIN + NUDGE_SPAN * rnd();
        // a bird near its end turns back from it, so the nudge is always whole
        const to = up ? (v + amount <= 1 ? v + amount : v - amount) : (v - amount >= 0 ? v - amount : v + amount);
        spell[b] = r2(Math.min(1, Math.max(0, to)));
      }
      if (spellGap(spell, star.spell) < DOT_APART - 1e-9 || mine.some((m) => spellGap(spell, m) < DOT_APART - 1e-9)) continue;
      const at = flat(spell);
      if (Math.hypot(at.x - home.x, at.y - home.y) > DOT_REACH) continue;
      if (lit.some((p) => Math.hypot(p.point.x - at.x, p.point.y - at.y) < DOT_CLEAR_LIT)) continue;
      if (out.some((d) => Math.hypot(d.point.x - at.x, d.point.y - at.y) < DOT_CLEAR_DOT)) continue;
      if (rings.some((g) => Math.hypot(g.at.x - at.x, g.at.y - at.y) < DOT_CLEAR_RING)) continue;
      if (genreOfSpell(spell) !== star) continue;
      if (placeReading(spell) !== reading) continue;
      mine.push(spell);
      const n = mine.length;
      out.push(Object.freeze({ id: `${star.id}#${n}`, star: star.id, n, spell: Object.freeze(spell), point: skyOf(spell) }));
    }
  }
  const order = new Map(lit.map((p, i) => [p.id, i]));
  return out.sort((a, b) => order.get(a.star)! - order.get(b.star)! || a.n - b.n);
})());

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
