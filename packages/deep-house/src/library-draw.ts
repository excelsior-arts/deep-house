// **The library reaches the draw** (round GA1, `notes/rounds/genres-ga1.md`).
//
// On the set's turn a theme draws one row of the library that the spell admits
// and the theme can place, by the row's weight, off a stream of its own; the
// drawn row plays exactly as its pin plays (`?recipe=<id>`, and
// `accompaniment=auto` for a layer or a motif), so a row's audit link is what a
// draw of it sounds like at that seed and theme.
//
// Four questions, each a function below and each a rule with a check in
// `tools/check-composer-*.ts`:
//
//   the turn       which themes of a set may take a row: one in three, never
//                  two running (`libraryTurn`, asked by the set)
//   the pool       which rows a die can ever reach: not weight 0, not the
//                  style's own, not a cast (`libraryPool`)
//   admission      which rows the playing spell admits (`admits`)
//   placement      which the theme can place (`placeable`)
//
// house-v2's `libraryDraw` switch opens it; house-v1 carries no switches and
// never asks. Nothing here is in the link: the link carries the spell and the
// seed, and the draw is the seed's.
import type { Style } from '@deep-house/engine/style';
import type { CompositionPolicy } from './composition-policy.ts';
import { permitted } from './composition.ts';
import { switchOn } from './lanes.ts';
import { weightOf, type Recipe } from './recipe.ts';
import { recipeRequest, type Accompaniment } from './recipe-request.ts';
import { PATTERN_LIBRARY, LIBRARY, TRACK_LIBRARY } from './recipes.ts';
import PLACES_TABLE from './row-places.json' with { type: 'json' };
import Rng, { type Seed } from './rng.ts';
import { BY_NAME, TIMBRES } from '@deep-house/engine/voices';
import { dbToGain } from '@deep-house/engine/dsp';
import { laneLevelDb } from './lane-level.ts';
import { BIRDS, HOUSE, asSpell, derive, type Bias, type Spell } from './spell.ts';

/** The stream's namespace; it moves only when what a draw means moves. */
export const LIBRARY_DRAW_VERSION = 'library-1';

/** How many themes of a set make one turn: one in this many is the library's. */
export const TURN_EVERY = 3;
/**
 * **The turn away from the house** (Eugene's question, open): a listener whose
 * birds stand nearer other rows than the house's own may want every theme to
 * be one of the library's. One constant, so the answer is one edit: 1 is every
 * theme; today it is the house's own third, which is no difference at all.
 */
export const AWAY_TURN_EVERY = 3;

type Place = { birds: Partial<Spell>; tempo: [number, number] };
const PLACES = PLACES_TABLE.rows as unknown as Record<string, Place>;
/** Ten BPM is one bird step of 0.15 (`row-places.json` `tempoStep`). */
const TEMPO_WEIGHT = PLACES_TABLE.tempoStep.bird / PLACES_TABLE.tempoStep.bpm;
/** How near the nearest a row may be and still be drawn: half a bird step, five BPM. */
export const NEAR: number = PLACES_TABLE.near;

/** Where a row plays, as dice over the house and a tempo window; `undefined` for a row the table does not name (a tool's). */
export function rowPlace(id: string): { spell: Spell; tempo: [number, number] } | undefined {
  const p = PLACES[id];
  return p ? { spell: { ...HOUSE, ...p.birds } as Spell, tempo: p.tempo } : undefined;
}
/**
 * **How far a spell and a tempo stand from a row** (round GA5): the eight
 * birds' differences, and the tempo's distance outside the row's own window at
 * one bird step of 0.15 for every ten BPM, as one Euclidean distance.
 */
export function rowDistance(id: string, spell: Spell, bpm: number): number {
  const p = rowPlace(id);
  if (!p) return 0;
  let d2 = 0;
  for (const b of BIRDS) d2 += (spell[b] - p.spell[b]) ** 2;
  const out = bpm < p.tempo[0] ? p.tempo[0] - bpm : bpm > p.tempo[1] ? bpm - p.tempo[1] : 0;
  d2 += (TEMPO_WEIGHT * out) ** 2;
  return Math.sqrt(d2);
}
/**
 * **The rows nearest** a spell at a tempo, among `rows` — those within `NEAR`
 * of the nearest: always some, so no bird setting is a dead zone.
 */
export function nearestRows<T extends { id: string }>(rows: readonly T[], spell: Spell, bpm: number = derive(spell).tempoCentre): T[] {
  const placed = rows.filter(r => rowPlace(r.id));
  if (!placed.length) return [];
  const d = placed.map(r => rowDistance(r.id, spell, bpm));
  const least = Math.min(...d);
  return placed.filter((_, i) => d[i] <= least + NEAR + 1e-12);
}
/**
 * **Reach** (round D1): how far a row leaks beyond the place it was audited
 * at. One number, 0 to 1, in the style's set options (`reach`, house-v2's
 * `set`; the record draws no library row and never asks).
 *
 *   0      today: the rows within `NEAR` of the nearest, by their own weights.
 *   1      every row everywhere, by its own weight alone.
 *   between  every row is a candidate, and a row past today's band has its
 *          weight times `exp(−excess / λ)`, where `excess` is how far it
 *          stands past the nearest plus `NEAR` and `λ = REACH_LENGTH × √(r / (1 − r))`.
 *
 * Why this shape and not a growing radius: it is continuous at both ends
 * (at 0 the rows today admits keep their weights to the bit and every other
 * row has none; at 1 the decay length is unbounded and every weight is the
 * row's own), it needs no second constant for a radius, and below 1 a nearer
 * row always weighs more than a farther one of the same weight, so the
 * nearest keeps the largest single share. `REACH_LENGTH` is 0.14, a hair
 * under one bird step: at a half, a row that far past the band weighs 1/e of
 * its own. The square root spreads the house's stretch from none to most over
 * the dial (expected share of a house turn drawn from past the band: 6 % at
 * 0.25, 24 % at 0.5, 55 % at 0.75); r/(1−r) itself grows the length threefold
 * from a half to three quarters, and no one length put the house near a
 * quarter at the one and under 60 % at the other (one bird step: 28 % and 77 %).
 * The tempo stays inside the distance (`rowDistance`), never a gate: a break
 * drawn at a hundred BPM is the point. And past 0 a track row is no longer
 * refused for wanting drums the theme has not got, or having none where it
 * has (`placeable`): it writes the grid itself, so it plays its bass and its
 * keys over whatever kit the theme has — the ambient bed under a broken
 * row's bass is a crossing, not a fault. Such a row stands one bird step
 * (`DRUMS_STEP`) further off than its birds and tempo put it, and the band
 * is measured from the nearest row reach 0 would admit, so a drumless place's
 * near rows fade in with the slider rather than arriving whole the moment it
 * leaves 0 (at 27191's spell the trip-hop rows sit a hair past the band and
 * took a third of the turns at any reach above 0).
 */
export const REACH_LENGTH = 0.14;
/** What a drums mismatch adds to a track row's distance past reach 0: one bird step (ten BPM's worth). */
export const DRUMS_STEP: number = PLACES_TABLE.tempoStep.bird;

/** A reach as the draw reads it: a number clamped to 0..1, anything else 0. */
export const reachOf = (reach: unknown): number => {
  const r = Number(reach);
  return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 0;
};

/** The decay length at a reach: 0 at 0, `REACH_LENGTH` at a half, unbounded at 1 — the square root of r/(1−r). */
export function reachLength(reach: number): number {
  const r = reachOf(reach);
  if (r <= 0) return 0;
  if (r >= 1) return Infinity;
  return REACH_LENGTH * Math.sqrt(r / (1 - r));
}

/** What a row's weight is multiplied by at `excess` past today's band, at a reach. */
export function reachFactor(excess: number, reach: number): number {
  if (excess <= 1e-12) return 1;
  const l = reachLength(reach);
  if (l === 0) return 0;
  if (l === Infinity) return 1;
  return Math.exp(-excess / l);
}

/** Whether the rows nearest a spell (at its tempo centre) are away from the house's own two. */
export function awayFromHouse(spell: Spell): boolean {
  const bpm = derive(spell).tempoCentre;
  const ids = Object.keys(PLACES);
  const house = Math.min(...TRACK_LIBRARY.map(r => rowDistance(r.id, spell, bpm)));
  return ids.some(id => rowDistance(id, spell, bpm) < house - NEAR);
}

/**
 * **The turn** — whether theme `n` of the set under `masterSeed` is the
 * library's. One theme in `TURN_EVERY` (`AWAY_TURN_EVERY` where the nearest
 * rows are away from the house), at a phase that is a die of the master seed,
 * so every run of that many consecutive themes has exactly one turn, a set may
 * open on one, and the house comes back between two visits. A rule and not a
 * coin: a coin at a third runs three visits together and nine houses together
 * over sixty seeds; this is the same third with the house as the set's floor.
 */
export function libraryTurn(masterSeed: Seed, n: number, spell: Partial<Spell> | null = null): boolean {
  const every = spell && awayFromHouse(asSpell(spell)) ? AWAY_TURN_EVERY : TURN_EVERY;
  if (every <= 1) return true;
  const phase = new Rng(`${masterSeed}::library`).int(0, every);
  return (n + phase) % every === 0;
}

/** Every row a draw could reach before the rules: the shipped library, the patterns, the whole themes. */
export const DRAWABLE: readonly Recipe[] = Object.freeze([...LIBRARY, ...PATTERN_LIBRARY, ...TRACK_LIBRARY]);

/**
 * **A cast** is a track row of `LIBRARY` — the house and its two rooms, the
 * rows `?recipe=auto` casts a whole set in. The house row is the composer
 * itself, and a room is a set's colour, not one theme's; they stay
 * `?recipe=auto`'s whatever their wants. Every other track row is an
 * arrangement for one theme (round GA2: the rule was "no part in its wants" in
 * GA1, which a row that leans and plays no part — the two mined whole themes — broke).
 */
const CASTS = new Set(LIBRARY.filter(r => r.scope === 'track').map(r => r.id));
export const isCast = (row: Recipe): boolean => row.scope === 'track' && CASTS.has(row.id);

/** The rows a style already draws itself: its families' recipe sources and its motif families. */
export function ownRows(style: Style): Set<string> {
  const own = new Set<string>();
  const policy = (style as Style & { composition?: CompositionPolicy }).composition;
  for (const family of policy?.families || []) for (const v of family.variants) if (v.source) own.add(v.source.id);
  for (const m of ((style.catalogue as any)?.motifFamilies || []) as Array<{ v: string }>) own.add(m.v);
  return own;
}

/** Why a row is outside the pool, or null where it is in it. */
export function outOfPool(row: Recipe, style: Style): string | null {
  if (!(weightOf(row) > 0)) return 'weight 0';
  if (row.picked === false) return 'put down';
  if (ownRows(style).has(row.id)) return 'the style\'s own';
  if (isCast(row)) return 'a cast';
  if (!['track', 'layer', 'motif'].includes(row.scope)) return `no player for ${row.scope}`;
  return null;
}

/** **The pool**: the rows of `library` a die of this style can ever reach. */
export const libraryPool = (style: Style, library: readonly Recipe[] = DRAWABLE): Recipe[] =>
  library.filter(row => outOfPool(row, style) === null);

/**
 * **Admission**, against the playing spell (dice, what the link carries) and
 * the theme's tempo (round GA5):
 *
 *   - a row the places table names is admitted where it is **among the
 *     nearest** of the table's rows to the spell at that tempo — no radius, no
 *     dead zone (`nearestRows`);
 *   - every bird a row names in its own box holds the spell inside its range —
 *     **except a mined row's**, whose box is readings of somebody's record and
 *     is never held against dice (`rounds/analysts-tooling.md` §7);
 *   - a row the table does not name is admitted everywhere (a tool's).
 */
export function admits(row: Recipe, spell: Spell, bpm: number = derive(spell).tempoCentre, reach = 0): boolean {
  // past reach 0 every placed row is a candidate, at a weight its distance sets (`reachFactor`)
  if (reachOf(reach) <= 0 && rowPlace(row.id) && !nearestRows(Object.keys(PLACES).map(id => ({ id })), spell, bpm).some(r => r.id === row.id)) return false;
  return boxAdmits(row, spell);
}
/** A row's own box against the spell; a mined box is readings and admits everything. */
export function boxAdmits(row: Recipe, spell: Spell): boolean {
  if (row.origin === 'mined') return true;
  for (const b of BIRDS) {
    const r = row.birds?.[b];
    if (Array.isArray(r) && (spell[b] < r[0] || spell[b] > r[1])) return false;
  }
  return true;
}

/** What the theme is, for placement: its style, its derived kit and whether a form was asked. */
export interface TurnContext {
  style: Style;
  bias: Bias;
  /** the theme's tempo where it is known (a set forces it); else the spell's centre */
  bpm?: number;
  /** a development other than `base` was requested: a form, which a track row cannot take */
  form: boolean;
  /** how far a row leaks beyond its place (round D1): 0 is today's band, 1 every row everywhere */
  reach?: number;
}

/** How a row plays when drawn: exactly as its pin. */
export const accompanimentOf = (row: Recipe): Accompaniment => (row.scope === 'track' ? 'base' : 'auto');

/**
 * **Placement**: whether this theme can place the row, before the plan is made.
 * The last word is still the pin's own — a drawn row is planned as its pin is,
 * and a pin that refuses is the house for that theme (`generator.ts`).
 */
export function placeable(row: Recipe, ctx: TurnContext): boolean {
  const { style, bias } = ctx;
  const policy = (style as Style & { composition?: CompositionPolicy }).composition;
  const p = row.placement;
  if (p) {
    if (p.grammar !== policy?.placement?.grammar || p.beatsPerBar !== policy?.placement?.beatsPerBar) return false;
    // past reach 0 a track row plays over whatever kit the theme has (round D1, `REACH_LENGTH`)
    if (p.drums !== undefined && p.drums !== bias.derived.drumsOn && !(row.scope === 'track' && reachOf(ctx.reach) > 0)) return false;
    // A layer sits in the kit's grid, so its kits are the theme's. A track row
    // writes the grid itself — its kick and backbeat cells replace the kit's
    // figures, as its audit link plays them (three pattern rows name the broken
    // kit and audit under four-floor spells) — so its kits are
    // where it came from, not a door (round GA3).
    if (p.kits && row.scope !== 'track' && !p.kits.includes(bias.derived.kit)) return false;
  }
  let request;
  try { request = recipeRequest(row, accompanimentOf(row)); } catch { return false; }
  if (request.track) return !ctx.form;
  if (request.motif && (!switchOn(style, 'motif') || !['bass', 'lead'].includes(request.motif.register))) return false;
  if (request.pin) {
    if (!policy?.placement) return false;
    // `pinWhen` is read on the kit and the drums; a tempo or density window in
    // it is the pin's own refusal later, which is the house for the theme.
    const when = policy.placement.pinWhen;
    if (when && !permitted({ drums: when.drums, kits: when.kits }, bias, '', 1)) return false;
  }
  return true;
}

/**
 * What a turn drew: the row and how many rows it was drawn among, and where it
 * stands — its distance from the playing birds and tempo, the nearest
 * candidate's, the reach it was drawn at, and whether it came from past
 * today's band (`away`: a row reach 0 would not have drawn).
 */
export interface LibraryDrawn { row: Recipe; among: number; distance: number; nearest: number; reach: number; away: boolean }

/**
 * **The draw**: one `weighted` pick by `weightOf` among the pool's rows that
 * the spell admits and the theme can place, off `<seed>::library:<version>`, a
 * stream nothing else reads; past reach 0 every placed row is a candidate at
 * its weight times `reachFactor` (round D1). `null` where nothing is admitted.
 */
export function drawLibrary(seed: Seed, ctx: TurnContext, library: readonly Recipe[] = DRAWABLE): LibraryDrawn | null {
  const bpm = ctx.bpm ?? ctx.bias.derived.tempoCentre;
  const reach = reachOf(ctx.reach);
  // **The nearest rows this theme can place** (GA5): the rows it can place,
  // and among them those nearest the birds and the tempo — so where the nearest
  // rows all need drums, at an Ember with none, the turn goes to the nearest
  // that do not, and no bird setting is a dead zone. A row the table does not
  // name (a tool's) is a candidate on every turn.
  const pool = libraryPool(ctx.style, library).filter(row => boxAdmits(row, ctx.bias.spell) && placeable(row, ctx));
  const placed = pool.filter(row => rowPlace(row.id));
  // A track row let in past 0 although its drums are not the theme's stands
  // one bird step further off (`DRUMS_STEP`), so it fades in with the reach;
  // the band is measured from the nearest row reach 0 itself would admit.
  const home = new Set(reach > 0 ? placed.filter(row => placeable(row, { ...ctx, reach: 0 })).map(row => row.id) : placed.map(row => row.id));
  const d = new Map(placed.map(row => [row.id, rowDistance(row.id, ctx.bias.spell, bpm) + (home.has(row.id) ? 0 : DRUMS_STEP)]));
  const fromHome = placed.filter(row => home.has(row.id)).map(row => d.get(row.id)!);
  const least = fromHome.length ? Math.min(...fromHome) : placed.length ? Math.min(...d.values()) : 0;
  const excess = (row: Recipe) => (rowPlace(row.id) ? Math.max(0, d.get(row.id)! - least - NEAR) : 0);
  let candidates: Array<{ v: Recipe; w: number }>;
  if (reach <= 0) {
    // today's rule, written as it was so a reach of nought draws what it drew
    const admitted = [...nearestRows(pool, ctx.bias.spell, bpm), ...pool.filter(row => !rowPlace(row.id))];
    candidates = admitted.map(r => ({ v: r, w: weightOf(r) }));
  } else {
    candidates = [...placed, ...pool.filter(row => !rowPlace(row.id))]
      .map(r => ({ v: r, w: weightOf(r) * reachFactor(excess(r), reach) }))
      .filter(c => c.w > 0);
  }
  if (!candidates.length) return null;
  const row = new Rng(`${seed}::library:${LIBRARY_DRAW_VERSION}`).weighted(candidates);
  return { row, among: candidates.length, distance: d.get(row.id) ?? 0, nearest: least, reach, away: excess(row) > 1e-12 };
}

// --- a travelled row's drums, settled at the place -------------------------
//
// **The place decides how loud and how dense the drums are; the row decides
// the figure** (round D1, measured on a slow sparse place at reach 1: a chopped
// break drawn at 67 BPM brought a snare on nearly every sixteenth at the base
// style's level, where the sparse room it landed in sets that lane well under
// it, and the drums sat level with everything else where the place's own theme
// holds them ten decibels under). A row that leaked past reach 0's band is
// settled at the place it was drawn to, by how far it travelled — none at the
// band's edge, all of it from two bird steps past it (`SETTLE_STEPS`):
//
//   density   where the row's drum hits a bar (kick aside) outnumber what the
//             composer writes at the same birds with no row, its ghosts — a
//             hit under 0.6 of its voice's loudest — are thinned, evenly
//             through the theme, toward the place's rate; never an accented
//             hit, so the figure stays the row's;
//   level     then the drums (kick aside) are moved together, so their balance
//             is the row's, until their loudness a bar (`drumLoudness`) is the
//             composer's own at the place, within ±12 dB. What it takes back is
//             mostly the row's `presence` word: 54 of the genre rows name the
//             backbeat `supporting`, which lifts it from the room's level for
//             the lane to the base style's (`treat.ts`) — right where the row
//             was audited, nine decibels too loud in a sparse room.
//
// The kick is the row's figure at the room's level: where it kicks more often
// than the place, it comes down by the power the extra hits add (at most 6 dB),
// and is never thinned. The place's own DNB-1 lifts are read off the playing birds
// (`nearestEntry` in `generator.ts`), so they follow the place, never the row.

/** How far past the band a row must travel to take the place's drums whole: two bird steps. */
export const SETTLE_STEPS = 2 * PLACES_TABLE.tempoStep.bird;
/** A hit under this share of its voice's loudest is a ghost, and is thinned first. */
export const GHOST_SHARE = 0.6;
/** The drum layers a settle reads: what the registry puts on the drum and kick buses, the glue aside. */
const DRUM_LAYERS = new Set(['kick', 'hats', 'shaker', 'clap']);
const isDrum = (ev: SettleEvent) => !!ev.layer && ev.layer !== 'kick' && DRUM_LAYERS.has(ev.layer);

interface SettleEvent { t: number; voice: string; layer?: string; p: { gain?: number; vel?: number } }
interface SettleTrack {
  barSeconds: number;
  events: SettleEvent[];
  arrangement: { sections: Array<{ kind: string; startBar: number; bars: number }> };
  paramOverrides?: { levels?: Record<string, number> } | Record<string, unknown>;
}

/** What a settle did, for the readout: the travel, the two rates a bar, the ghosts taken off and the drums' move, in dB. */
/**
 * What a settle did: the row's and the place's drum rates a bar over the mains
 * and drops, the rate the thinning asked for and the rate it reached there (a
 * row with too few ghosts reaches less than it asked), the ghosts taken out of
 * the mains and drops and out of the other sections, and the two levels.
 */
export interface Settled { travel: number; rowRate: number; placeRate: number; asked: number; achieved: number; dropped: number; elsewhere: number; levelDb: number; kickDb: number }

/** The furthest a settle moves the drums' level either way, in dB: a row is brought to a place, never silenced by one. */
export const SETTLE_RANGE_DB = 12;
/** The furthest a settle brings the kick down, in dB. */
export const KICK_RANGE_DB = 6;
/** A voice that declares no loudness of its own is read at this, in dB (the drum voices' middle). */
const UNDECLARED_DB = -18;

/** The mains and drops, where the drums are compared. */
const mainSpans = (track: SettleTrack) => track.arrangement.sections.filter(s => s.kind === 'main' || s.kind === 'drop');

/**
 * **How loud the drums are a bar** (kick aside), over the mains and drops, as
 * a power: each hit at its voice's own loudness alone at its table level
 * (`TIMBRES`), the room's level for its lane over the base's, and its gain and
 * velocity. A plan-time reading, never a meter: it compares two plans at one
 * place, which is all a settle asks of it.
 */
function drumLoudness(track: SettleTrack, style: Style): number {
  const bs = track.barSeconds;
  const spans = mainSpans(track);
  const bars = spans.reduce((a, s) => a + s.bars, 0);
  if (!bars) return 0;
  const base = style.base.levels as Record<string, number>;
  const levels = { ...base, ...(((track.paramOverrides as { levels?: Record<string, number> } | undefined)?.levels) ?? {}) };
  let p = 0;
  for (const ev of track.events) {
    if (!isDrum(ev) || !spans.some(s => ev.t >= s.startBar * bs && ev.t < (s.startBar + s.bars) * bs)) continue;
    const key = BY_NAME[ev.voice]?.level as string | undefined;
    const room = key ? laneLevelDb(style, levels, ev.voice, key) : undefined;
    const lift = key && room !== undefined && Number.isFinite(room) && Number.isFinite(base[key]) ? room - base[key] : 0;
    const db = (TIMBRES[ev.voice]?.loudnessDb ?? UNDECLARED_DB) + lift + 20 * Math.log10(Math.max(1e-4, (ev.p.gain ?? 1) * (ev.p.vel ?? 1)));
    p += 10 ** (db / 10);
  }
  return p / bars;
}

/** Whether an event sounds in a main or a drop of its theme. */
const inSpans = (track: SettleTrack) => {
  const bs = track.barSeconds, spans = mainSpans(track);
  return (ev: SettleEvent) => spans.some(s => ev.t >= s.startBar * bs && ev.t < (s.startBar + s.bars) * bs);
};

/** Drum hits a bar (kick aside) over the mains and drops. */
function drumRate(track: SettleTrack): number {
  const bars = mainSpans(track).reduce((a, s) => a + s.bars, 0);
  if (!bars) return 0;
  const inMain = inSpans(track);
  let n = 0;
  for (const ev of track.events) if (isDrum(ev) && inMain(ev)) n++;
  return n / bars;
}

/** How far a drawn row travelled, 0..1: its excess past the band over `SETTLE_STEPS`. */
export const travelOf = (drawn: { distance: number; nearest: number }): number =>
  Math.max(0, Math.min(1, (drawn.distance - drawn.nearest - NEAR) / SETTLE_STEPS));

/**
 * **Settle a travelled row's drums at the place**: its `presence` lift on a
 * drum role taken back to the room's level, and its ghosts thinned toward the
 * place's density, both by `travel`. Edits `row.events` in place; `place` is
 * the theme the composer writes at the same birds with no row. `null` where
 * nothing was done.
 */
export function settleDrums(row: SettleTrack, place: SettleTrack, travel: number, style: Style): Settled | null {
  const t = Math.max(0, Math.min(1, travel));
  if (!(t > 0)) return null;
  // density: ghosts thinned toward the place's rate. **One region throughout**
  // (R01 of the review of 10-03): the rate compared is the mains' and
  // drops', so the loudest hit a ghost is measured against, the ghosts that can
  // go and the share of them that goes are read over the same mains and drops.
  // A quiet outro no longer counts toward a main's budget, and a main settles
  // the same whatever is around it.
  const mine = drumRate(row), theirs = drumRate(place);
  let dropped = 0, elsewhere = 0, asked = mine;
  if (mine > theirs && mine > 0) {
    asked = mine * (theirs > 0 ? (theirs / mine) ** t : 1 - t);
    const inMain = inSpans(row);
    const bars = mainSpans(row).reduce((a, s) => a + s.bars, 0);
    const loudest = new Map<string, number>();
    for (const ev of row.events) if (isDrum(ev) && inMain(ev)) loudest.set(ev.voice, Math.max(loudest.get(ev.voice) ?? 0, (ev.p.gain ?? 1) * (ev.p.vel ?? 1)));
    const ghost = (ev: SettleEvent) => isDrum(ev) && (ev.p.gain ?? 1) * (ev.p.vel ?? 1) < GHOST_SHARE * (loudest.get(ev.voice) ?? 0);
    const mains = row.events.filter(ev => inMain(ev) && ghost(ev));
    const ghostRate = bars ? mains.length / bars : 0;
    const drop = ghostRate > 0 ? Math.min(1, (mine - asked) / ghostRate) : 0;
    if (drop > 0) {
      // **The other sections, by the mains' share** (the policy, stated): an
      // intro, a breakdown or an outro is thinned by the share the mains
      // decided, its ghosts measured against the same loudest hit — so a
      // travelled row is one row throughout and not busier on the way in than
      // in its main — and never counts toward that share. A voice the mains do
      // not play has no loudest hit there and is left as it is.
      const others = row.events.filter(ev => !inMain(ev) && ghost(ev));
      // evenly through each region: ghost i goes where the running count of drops steps
      const gone = new Set<SettleEvent>();
      const thin = (list: SettleEvent[]) => list.forEach((ev, i) => { if (Math.floor((i + 1) * drop) > Math.floor(i * drop)) gone.add(ev); });
      thin(mains);
      dropped = gone.size;
      thin(others);
      elsewhere = gone.size - dropped;
      const kept = row.events.filter(ev => !gone.has(ev));
      row.events.length = 0;
      row.events.push(...kept);
    }
  }
  const achieved = dropped || elsewhere ? drumRate(row) : mine;
  // level, after the density: the drums (kick aside) moved together, so their
  // balance is the row's, until their loudness a bar is the place's — each hit
  // read as its voice's own loudness (`TIMBRES`), the room's level for its lane
  // against the base's, and the gain and velocity it carries.
  const before = drumLoudness(row, style), target = drumLoudness(place, style);
  let levelDb = 0;
  if (before > 0 && target > 0) {
    levelDb = Math.max(-SETTLE_RANGE_DB, Math.min(SETTLE_RANGE_DB, 10 * Math.log10(target / before))) * t;
    const g = dbToGain(levelDb);
    if (Math.abs(levelDb) > 1e-9) for (const ev of row.events) if (isDrum(ev)) ev.p = { ...ev.p, gain: (ev.p.gain ?? 1) * g };
  }
  // the kick: its hits are the row's figure and its level the room's, so only
  // where the row kicks more often than the place does is it brought down, by
  // the power the extra hits add (never more than `KICK_RANGE_DB`)
  const kicks = (track: SettleTrack) => {
    const spans = mainSpans(track), bs = track.barSeconds, bars = spans.reduce((a, s) => a + s.bars, 0);
    return bars ? track.events.filter(ev => ev.layer === 'kick' && spans.some(s => ev.t >= s.startBar * bs && ev.t < (s.startBar + s.bars) * bs)).length / bars : 0;
  };
  const kr = kicks(row), kp = kicks(place);
  const kickDb = kr > kp && kp > 0 ? Math.max(-KICK_RANGE_DB, 10 * Math.log10(kp / kr)) * t : 0;
  if (kickDb < -1e-9) { const g = dbToGain(kickDb); for (const ev of row.events) if (ev.layer === 'kick') ev.p = { ...ev.p, gain: (ev.p.gain ?? 1) * g }; }
  if (!(Math.abs(levelDb) > 1e-9) && !dropped && !elsewhere && !(kickDb < -1e-9)) return null;
  return { travel: +t.toFixed(3), rowRate: +mine.toFixed(2), placeRate: +theirs.toFixed(2), asked: +asked.toFixed(2), achieved: +achieved.toFixed(2),
    dropped, elsewhere, levelDb: +levelDb.toFixed(2), kickDb: +kickDb.toFixed(2) };
}
