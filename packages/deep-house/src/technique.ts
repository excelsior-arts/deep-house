// **One reader of every technique by place** (engine-data, 10-28; his question: *"How come we came up with such complex
// rules for trance and we didn't have it for other genres?"*). The struck conversation, the journey, the sea, the
// ensembles and the hook each had their own admission written by hand in the generator; here is the one they share.
//
// A technique lane's entry is read as every lane's is (`readPlace`: inside a zone the zone's own, outside today's
// nearest). Its zone (`src/place-zone.ts`) says how much of the themes play it there: whole where it names none, its
// `share` inside its `radius` at reach 0. **The reach dial** widens it as it widens the library and the hook: past
// reach 0 every other entry of the lane is a candidate as a library row past the band is (`zoneAway`), its share its
// weight times the dial's decay at how much further it stands than the place read, drawn against the place's own
// choice, so the technique plays with (own + F) / (1 + F), F the zones away, and the entry played is drawn by weight.
// At reach 0 nothing is drawn that was not drawn before: a share of one draws no die, and the away list is empty.
//
// The order of reading is the entries' `priority`, and a `foreground` technique is admitted only while no earlier one
// has taken the theme's one foreground (the generator's loop). The needs are `needsMet`'s. Pure; no DOM.

import Rng, { type Seed } from './rng.ts';
import { HOUSE, type Spell } from './spell.ts';
import { readPlace, legacyTable, placeDistance, HOUSE_PLACE, TECHNIQUE_LANES, type StylePlaces, type Zone, type PlaceRead, type TechniqueEntry, type TechniqueBlock, type TechniqueLane } from './places.ts';
import { zoneShare, zoneAway, type ZoneShape, type ZoneCentre } from './place-zone.ts';
import { reachOf } from './library-draw.ts';

/** The lowest priority among a lane's technique entries; none (Infinity) where the lane carries no technique. */
const priorityOf = (P: StylePlaces, lane: TechniqueLane): number => Math.min(...((P[lane] ?? []) as readonly TechniqueEntry[]).flatMap((e) => (e.technique ? [e.technique.priority] : [])));

const ORDER = new WeakMap<StylePlaces, readonly TechniqueLane[]>();
/**
 * **The technique lanes in the order they are read**: by their entries' `priority`, lowest first; a lane with no technique
 * entry is left out. Read once per style's tables (a theme asks it on every plan, the labels on every read).
 */
export function techniqueOrder(P: StylePlaces): readonly TechniqueLane[] {
  let order = ORDER.get(P);
  if (!order) {
    const at = new Map(TECHNIQUE_LANES.map((l) => [l, priorityOf(P, l)]));
    order = Object.freeze(TECHNIQUE_LANES.filter((l) => Number.isFinite(at.get(l))).sort((a, b) => at.get(a)! - at.get(b)!));
    ORDER.set(P, order);
  }
  return order;
}

/** Does a lane claim the one foreground (any of its technique entries says so). */
export const laneForeground = (P: StylePlaces, lane: TechniqueLane): boolean => ((P[lane] ?? []) as readonly TechniqueEntry[]).some((e) => !!e.technique?.foreground);

/** One lane's read: the entry (null: the house's own place), its block (null: the place lays none), its own share, the zones away (`entry` null: the house's zone). */
export interface TechniqueRead {
  entry: TechniqueEntry | null;
  technique: TechniqueBlock | null;
  own: number;
  away: Array<{ entry: TechniqueEntry | null; w: number }>;
}

/**
 * **A lane whose house plays a zone of its own** (the hook's: its row's zone about the house, a share that grows as
 * Pulse, Gleam or Spark rise past the house). The house's own place, and an entry that says `house`, play `zone(entry)`
 * about the house's birds (no tempo band); past reach 0 the house's zone (`zone(null)`) joins the zones away, as the
 * house's own place. A zone of null plays nothing (an entry naming a row the lane does not have).
 */
export interface HouseZone { zone: (entry: TechniqueEntry | null) => ZoneShape | null }
/** The house's zone centre: the house's birds, no tempo band. */
const HOUSE_CENTRE: ZoneCentre = { birds: HOUSE };

/**
 * **A technique lane at a spell**: the lane's read, the entry's zone at the dial's reach, and past reach 0 the lane's
 * other entries' zones away from the place read (outside a zone only: inside a PLAN-ZONES zone the zone's own entry
 * alone). A lane with a `house` zone reads it at the house's own place and at an entry that says `house`.
 */
export function techniqueAt(P: StylePlaces, lane: TechniqueLane, spell: Spell, bpm: number, zone: Zone | null, reach = 0, trace?: PlaceRead[], house?: HouseZone): TechniqueRead {
  const entry = readPlace(P, lane, spell, bpm, zone, trace) as TechniqueEntry | null;
  const T = entry?.technique ?? null;
  const atHouse = (e: TechniqueEntry | null) => !!house && (!e || !!(e.technique as { house?: boolean } | undefined)?.house);
  const houseShare = (e: TechniqueEntry | null) => { const z = house!.zone(e); return z ? zoneShare(z, HOUSE_CENTRE, spell, bpm, reach) : 0; };
  const own = atHouse(entry) ? houseShare(entry) : T ? zoneShare(T.zone ?? { share: 1 }, entry!.place, spell, bpm, reach) : 0;
  const away: TechniqueRead['away'] = [];
  if (reachOf(reach) > 0 && !zone) {
    const nearest = placeDistance(entry ? entry.place : HOUSE_PLACE, spell, bpm);
    for (const e of (legacyTable(P, lane) ?? []) as readonly TechniqueEntry[]) {
      if (e === entry || !e.technique || atHouse(e)) continue;
      const w = zoneAway(e.technique.zone ?? { share: 1 }, e.place, spell, bpm, reach, nearest);
      if (w > 0) away.push({ entry: e, w });
    }
    // (the house's own zone, last, where the place read is not the house's)
    const hz = house && !atHouse(entry) ? house.zone(null) : null;
    const w = hz ? zoneAway(hz, HOUSE_CENTRE, spell, bpm, reach, nearest) : 0;
    if (w > 0) away.push({ entry: null, w });
  }
  return { entry, technique: T, own, away };
}

/**
 * **The zone a theme plays on a lane, or null**: the place's own share against the zones away ((own + F) / (1 + F)),
 * a share under one drawn off `<seed>::<lane>`; among the live zones the one played is drawn by weight off
 * `<seed>::<lane>:zone`. At reach 0 the place's own, and no die where its share is one. `entry` null: the house's zone.
 */
export function drawZone(read: TechniqueRead, seed: Seed, lane: TechniqueLane): { entry: TechniqueEntry | null } | null {
  const live = [{ entry: read.entry, w: read.own }, ...read.away].filter((z) => z.w > 0);
  if (!live.length) return null;
  const F = read.away.reduce((t, z) => t + z.w, 0);
  const share = F > 0 ? (read.own + F) / (1 + F) : read.own;
  if (share < 1 && !new Rng(`${seed}::${lane}`).chance(share)) return null;
  return { entry: live.length === 1 ? live[0].entry : new Rng(`${seed}::${lane}:zone`).weighted(live.map((z) => ({ v: z.entry, w: z.w }))) };
}

/** **The technique a theme plays on a lane, or null** (`drawZone`), with its block: a lane with no house zone. */
export function drawTechnique(read: TechniqueRead, seed: Seed, lane: TechniqueLane): { entry: TechniqueEntry; technique: TechniqueBlock } | null {
  const entry = drawZone(read, seed, lane)?.entry;
  return entry?.technique ? { entry, technique: entry.technique } : null;
}

/**
 * **A technique refused is none** (the ambient-waves review, 10-18, its third finding, for the sea; general since
 * engine-data): where an entry says `refused: 'without'`, a planner that lays nothing after the lanes it silences were
 * held off throws this, and the theme is planned again as if the place laid none (`withoutTechniques`).
 */
export class TechniqueRefused extends Error {
  readonly lane: TechniqueLane;
  constructor(lane: TechniqueLane, message: string) { super(message); this.lane = lane; }
}
