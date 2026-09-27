// The lists a style's dice draw from, where the list is nothing but a pool.
//
// It was `src/recipe.js` until round F of PLAN-V1-NEXT. The name was a
// collision, and PLAN-RECIPES says which way to resolve it: **the lists are
// the catalogue, and a recipe is what is cooked from it** — an archetype of a
// catchy sound, a component of a track, named in roles and proportions and
// never in instruments. Nothing in the code is a recipe yet, so the word is
// simply free.
//
// Every ordered list the v1 dice draw from is named in one place, and nothing
// else in the codebase may be a pool. That is the rule both reviews agreed on
// and the one thing round B exists to establish:
//
//   **the instrument catalogue is a lookup table, never the pool.** Registering
//   an instrument (`packages/engine/src/voices/index.ts`'s REGISTRY), a room (a style's
//   `rooms`) or a timbre must change no v1 seed. It reaches the record only by
//   being written into a list, and that is a re-bless.
//
// **The order of every list is what the golden digest hashes.** A die is
// `floor(u * n)` over the list as it stands, so appending an entry moves about
// half of all seeds, reordering moves nearly all of them, and removing one
// moves the rest. None of that is a refactor. `Rng.pickWeighted` (round A) is
// the sampler that makes a *disabled* entry free — it drops weight-0 entries
// before it draws, proved bit-identical to `pick` on every boundary value — so
// the way to park an instrument in front of these lists is a weight of 0, and
// never an append.
//
// Since round F the whole catalogue is assembled in the style file
// (`src/styles/deep-house.ts`), because half of it is named by reference into
// the style's own table: where a list lives beside the measurement that
// produced it, it stays there — those comments are the provenance and this
// file will not copy them. What is written here is the other half, the lists
// that are a pool and nothing else, and `candidateLists()`, which is the row
// per list that `tools/check.ts` walks.

import { CORPUS } from './corpus.ts';

// What a weighted entry and a candidate list *are* is the machine's contract —
// `Rng.weighted` reads the one and the completeness gate walks the other — so
// since round W of PLAN-V1-NEXT the two shapes are stated in the engine's
// `style.ts` and named here. The lists themselves are this style's, and every
// one of them is below.
import type { Weighted, CandidateList } from '@deep-house/engine/style';

// --- the lists that are a pool and nothing else -----------------------------

// The rooms the preset die draws from — `dice('preset')`, one draw, in
// `resolveRoom`. Stated rather than derived: it used to be "every room
// carrying a bench", so measuring a third room would have entered the pool on
// its own and moved every auto seed. A room added to a style's `rooms` is now
// dormant until its name is written here.
export const ROOMS: string[] = ['sub', 'growl'];

// How the chords are stacked — `dice('voicing')`, one draw. Unreachable in the
// released catalogue: both measured rooms carry their own `voicingStyle` and
// short-circuit the die (see the reachability note at the head of the style).
export const VOICING_STYLES: string[] = ['ninths', 'sevenths', 'elevenths'];

/** One section-glue palette: which pieces of glue it plays, and how wet they are. */
export interface FxPalette {
  name: string;
  riser: boolean;
  impact: boolean;
  sweep: boolean;
  reverb: number;
  delay: number;
}

// The section glue and how wet it is — `dice('fx')`, one draw.
export const FX_PALETTES: FxPalette[] = [
  { name: 'open', riser: true, impact: true, sweep: true, reverb: 1.0, delay: 1.0 },
  { name: 'dry', riser: false, impact: true, sweep: true, reverb: 0.65, delay: 0.7 },
  { name: 'deep', riser: true, impact: false, sweep: true, reverb: 1.3, delay: 1.25 },
  { name: 'tight', riser: false, impact: true, sweep: false, reverb: 0.8, delay: 1.4 },
];

// What the density die's value is called on the ring. Not a pool — the die
// draws from the style's `density.weights` — but it is the same vocabulary and
// it belongs beside it.
export const DENSITY_LABEL: Record<string, string> = { minimal: 'minimal', medium: 'medium', busy: 'busy' };

// The mined tables the figure dice draw from, all of them `src/corpus.ts`'s own
// arrays in the order they were mined. `dice('bass')`, `dice('stab')`,
// `dice('hat')` and `dice('arrangement')` weight them by how often each turned
// up and never reorder them; a re-mining of the corpus is a re-bless.
export const MASK_TABLES = {
  bass: CORPUS.bass16,
  stab: CORPUS.stabs,
  hat: CORPUS.hats,
  openHat: CORPUS.openHatByStep,
  sectionOrders: CORPUS.sectionOrders,
  sectionBars: CORPUS.sectionBars,
  chords: CORPUS.markov2,
};

// --- the sixteenth lane's own mined table (round K6) ------------------------
//
// The corpus has no separate sixteenth measurement and never had one: the
// detector found **hat** lines, and what the record has always called its
// shaker is the part of a mined hat mask that falls between the offbeat
// eighths. That is a part defined by the absence of another one, and K5b
// measured what it costs — under house-v2's mined tables the shaker is silent
// in 173 themes of 200, because a mask whose hits all land on offbeats leaves
// nothing between them.
//
// So the same measurement is read a second way, for a lane of its own: for
// every mined hat mask, the steps that are neither on a beat nor on an offbeat
// eighth, with the counts of every mask that yields the same figure summed and
// the levels of the commonest of them kept. It is a **derivation and not a
// second mining** — no new number is typed, the provenance is the hat table's
// own, and re-mining the corpus re-derives it.
//
// The result is five figures over 236 mined bars: four of them a single
// sixteenth in the bar and one of them the offbeat-sixteenth shaker
// (`.x...x...x...x..`, 27 bars), which is the figure a deep house shaker plays.
// Sparse is what the reference sets are; **never empty** is the point.
/**
 * One row of a mined table: the mask, how often it turned up, and the
 * velocities of the commonest of the masks that yield it where the mining kept
 * any. It is the shape of a row of `src/corpus.ts`'s own hat table, which is
 * what this one is derived from.
 */
export interface MaskRow {
  m: string;
  c: number;
  v: number[] | null;
}

function mineSixteenths(hats: readonly { m: string; c: number; v?: number[] | null }[]): readonly Readonly<MaskRow>[] {
  const by = new Map<string, MaskRow>();
  for (const h of hats) {
    const steps: number[] = [];
    for (let i = 0; i < h.m.length; i++) if (h.m[i] === 'x' && i % 4 !== 0 && i % 4 !== 2) steps.push(i);
    if (!steps.length) continue;
    const m = Array.from({ length: 16 }, (_, i) => (steps.includes(i) ? 'x' : '.')).join('');
    const row = by.get(m);
    if (row) { row.c += h.c; continue; }
    by.set(m, { m, c: h.c, v: h.v || null });
  }
  return Object.freeze([...by.values()].sort((a, b) => b.c - a.c).map((r) => Object.freeze(r)));
}

/** What the reference sets put between the offbeats, as a table of its own. */
export const SIXTEENTH_MASKS = mineSixteenths(CORPUS.hats);

// --- the gate's walk --------------------------------------------------------
//
// One row per list: the die that draws it, where it is written, what its
// entries name, and the list itself. `tools/check.ts` walks this; nothing on a
// sound path does.
//
// `of` says what a candidate has to resolve to: `room` a room the style
// declares, `timbre` an entry in the registry's TIMBRES, `mask` a mined table
// row, and `own` a word that is nothing but itself.
/**
 * Every list of a style's assembled `catalogue` that this walk reads. The
 * catalogue itself is the style's — the machine states only that a style has
 * one — so what is written here is what the gate asks of it and nothing more:
 * a style with more lists than these is a style with more rows than these, and
 * house-v2's is exactly that (`candidateListsV2`).
 */
export interface CatalogueLists {
  rooms: string[];
  voicingStyles: string[];
  fxPalettes: readonly FxPalette[];
  densityLabel: Record<string, string>;
  masks: typeof MASK_TABLES;
  leadTimbres: readonly Weighted<string>[];
  sustainedLeads: readonly string[];
  padPartners: readonly Weighted<string>[];
  stabPartners: readonly Weighted<string>[];
  densities: readonly Weighted<string>[];
  keyRoots: number[];
  melodyBars: readonly Weighted<number>[];
}

/** @param c a style's assembled `catalogue` */
export function candidateLists(c: CatalogueLists): CandidateList[] {
  return [
    { id: 'rooms', die: 'preset', where: 'src/catalogue.ts', of: 'room', list: () => c.rooms },
    { id: 'leadTimbres', die: 'timbre', where: 'the style\'s timbre.lead', of: 'timbre', list: () => c.leadTimbres.map((o) => o.v) },
    // The gate's own row shape says a list is read as `any[]`, and a style may
    // hand over a frozen one — house-v2's is — so the one list that is not
    // built by a `map` on its way out says here that it is read and not written.
    { id: 'sustainedLeads', die: 'timbre (eligibility)', where: 'the style\'s timbre.sustained', of: 'timbre', list: () => c.sustainedLeads as string[] },
    { id: 'padPartners', die: 'partner', where: 'the style\'s timbre.padPartner', of: 'timbre', list: () => c.padPartners.map((o) => o.v) },
    { id: 'stabPartners', die: 'partner', where: 'the style\'s timbre.stabPartner', of: 'timbre', list: () => c.stabPartners.map((o) => o.v) },
    { id: 'densities', die: 'density', where: 'the style\'s density.weights', of: 'own', list: () => c.densities.map((o) => o.v) },
    { id: 'densityLabels', die: 'density (label)', where: 'src/catalogue.ts', of: 'own', list: () => Object.keys(c.densityLabel) },
    { id: 'voicingStyles', die: 'voicing', where: 'src/catalogue.ts', of: 'own', list: () => c.voicingStyles },
    { id: 'fxPalettes', die: 'fx', where: 'src/catalogue.ts', of: 'own', list: () => c.fxPalettes.map((p) => p.name) },
    { id: 'keyRoots', die: 'key', where: 'the style\'s key.roots', of: 'own', list: () => c.keyRoots },
    { id: 'melodyBars', die: 'melody', where: 'the style\'s piano.melodyBars', of: 'own', list: () => c.melodyBars.map((o) => o.v) },
    { id: 'bassMasks', die: 'bass', where: 'src/corpus.ts bass16', of: 'mask', list: () => c.masks.bass },
    { id: 'stabMasks', die: 'stab', where: 'src/corpus.ts stabs', of: 'mask', list: () => c.masks.stab },
    { id: 'hatMasks', die: 'hat', where: 'src/corpus.ts hats', of: 'mask', list: () => c.masks.hat },
    { id: 'sectionOrders', die: 'arrangement', where: 'src/corpus.ts sectionOrders', of: 'own', list: () => c.masks.sectionOrders },
  ];
}

export default candidateLists;
