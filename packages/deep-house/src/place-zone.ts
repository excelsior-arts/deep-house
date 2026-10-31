// **A place entry's zone, and the reach dial over it** (round trance-pad; his question 10-28 on the hook's house share:
// *"what's this leak parameter … Maybe this was created because of some lack of awareness about reach parameter"*).
//
// One shape for where an entry of a place table plays and how much, written in the entry's data and read here alone:
//
//   share   the entry's own share where it plays whole
//   radius  the core: within it (by the place's distance, its birds and its tempo band) the share is whole; none: no
//           edge (the entry plays wherever its table reads it)
//   fade    a straight shoulder past the core, to nought `fade` further out (none: the core's edge is a cut)
//   rise    the share grows along these birds, from the centre's value to the one named, whole at it; the distance
//           then reads the other birds only (a zone that is a direction from its centre, not a ball around it)
//
// **The reach dial** (the machine view's DRAW slider, `reachOf` in `src/library-draw.ts`) widens every zone the way it
// widens the library's band: past the zone's reach-0 edge the share falls as the library's own `reachFactor` (e^(-x/λ),
// λ growing from nought at reach 0 to unbounded at 1), so at 0 a zone is what it was to the bit, and at 1 an entry plays
// everywhere at its own share. The fade's shoulder and the dial's decay are not added: the larger of the two holds.
// A zone away from the place a table reads joins as a library row past the band does (`zoneAway`): its share its weight
// times that decay at how much further it stands, drawn against the place's own choice.
// Pure; no DOM.

import { BIRDS, HOUSE, PLACE_TEMPO_WEIGHT, placeDistanceOf, type Bird, type Spell } from './spell.ts';
import { reachFactor, reachOf } from './library-draw.ts';

/** Where a place entry plays and how much (its data). */
export interface ZoneShape {
  share: number;
  radius?: number;
  fade?: number;
  rise?: Readonly<Partial<Record<Bird, number>>>;
}
/** A zone's centre: its birds (the house's where one is not named) and, where it has one, its tempo band. */
export interface ZoneCentre { birds: Readonly<Partial<Spell>>; tempo?: readonly [number, number] }

/** How far a spell stands from a zone's centre: every bird but the rising ones, and the tempo band where there is one. */
export function zoneDistance(z: ZoneShape, at: ZoneCentre, spell: Spell, bpm: number): number {
  if (!z.rise) return placeDistanceOf(at.birds, at.tempo ?? [-Infinity, Infinity], spell, bpm);
  let d2 = 0;
  for (const b of BIRDS) if (!(b in z.rise)) d2 += (spell[b] - (at.birds[b] ?? HOUSE[b])) ** 2;
  if (at.tempo) { const out = bpm < at.tempo[0] ? at.tempo[0] - bpm : bpm > at.tempo[1] ? bpm - at.tempo[1] : 0; d2 += (PLACE_TEMPO_WEIGHT * out) ** 2; }
  return Math.sqrt(d2);
}

/**
 * How much a zone rises at a spell (one where it names no rise): toward the birds it names, whole at them. A bird whose
 * full stands at the centre has no way to rise along and adds nothing (`zoneFaults` refuses such a zone at load).
 */
function riseOf(z: ZoneShape, at: ZoneCentre, spell: Spell): number {
  if (!z.rise) return 1;
  let rise = 0;
  for (const [b, full] of Object.entries(z.rise) as Array<[Bird, number]>) {
    const from = at.birds[b] ?? HOUSE[b];
    if (full === from) continue;
    rise = Math.max(rise, (spell[b] - from) / (full - from));
  }
  return Math.min(1, rise);
}

/**
 * **Everything wrong with a zone, as sentences**: a share from nought to one, a radius and a fade that are distances,
 * and every rise bird a bird whose full value is a bird's (0 to 1) and stands apart from the centre's.
 */
export function zoneFaults(z: ZoneShape, at: ZoneCentre): string[] {
  const bad: string[] = [];
  if (!(z.share >= 0 && z.share <= 1)) bad.push(`share ${z.share} outside 0..1`);
  if (z.radius != null && !(Number.isFinite(z.radius) && z.radius >= 0)) bad.push(`radius ${z.radius} is not a distance`);
  if (z.fade != null && !(Number.isFinite(z.fade) && z.fade > 0)) bad.push(`fade ${z.fade} is not a distance`);
  for (const [b, full] of Object.entries(z.rise ?? {})) {
    if (!(BIRDS as readonly string[]).includes(b)) { bad.push(`a rise on ${b}, no bird`); continue; }
    if (!(Number.isFinite(full) && full! >= 0 && full! <= 1)) bad.push(`a rise on ${b} to ${full}, outside 0..1`);
    else if (full === (at.birds[b as Bird] ?? HOUSE[b as Bird])) bad.push(`a rise on ${b} to ${full}, where the centre stands already`);
  }
  return bad;
}

/** **A zone's share** at a spell and a reach: the shape's own at reach 0, widened past its edge by the dial. */
export function zoneShare(z: ZoneShape, at: ZoneCentre, spell: Spell, bpm: number, reach = 0): number {
  if (!(z.share > 0)) return 0;
  const rise = riseOf(z, at, spell);
  const excess = z.radius == null ? 0 : Math.max(0, zoneDistance(z, at, spell, bpm) - z.radius);
  const shoulder = z.fade ? Math.max(0, 1 - excess / z.fade) : excess > 0 ? 0 : 1;
  // (at reach 0 the edge is the shape's own, to the bit: the dial's decay is not asked)
  const widened = reachOf(reach) > 0 ? reachFactor(excess, reach) : 0;
  return +(z.share * rise * Math.max(shoulder, widened)).toFixed(4);
}

/**
 * **A zone away from the place a table reads** (past reach 0): a candidate as a library row is past today's band
 * (`drawLibrary`), its share (and its rise) its weight, times the library's own `reachFactor` at how much further the
 * zone's centre stands than the place the table read (`nearest`, the same distance). Nought at reach 0.
 */
export function zoneAway(z: ZoneShape, at: ZoneCentre, spell: Spell, bpm: number, reach: number, nearest: number): number {
  if (!(z.share > 0) || !(reachOf(reach) > 0)) return 0;
  const d = placeDistanceOf(at.birds, at.tempo ?? [-Infinity, Infinity], spell, bpm);
  return z.share * riseOf(z, at, spell) * reachFactor(Math.max(0, d - nearest), reach);
}
