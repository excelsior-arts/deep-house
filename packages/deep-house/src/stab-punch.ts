// **The stab lane's fixed punch: the ways out, as sketches** (round stab-punch, 11-04; his ear on house seed 148 at t=21:
// "that same stub technic but with pulse lead, which is similar annoying move as it was with organs"; and on the organs,
// 10-31: "this motif or technique keeps revealing itself in house, and it almost always borderlining unpleasant").
//
// A theme whose stab lane strikes one or two chords a bar (the mined mask under the density's cap) plays the same punch,
// at the same place in the bar, for as long as the lane is on: 24 bars at the median, three minutes at most, through the
// main, the breakdown and the drop alike. Four ways out, each a sketch for his ear and none a rule yet
// (`recipes/arrangement/stab-punch.json`):
//
// - **a, the lane steps back:** where a bed holds the bar, the punch does not play, and the pad, the bass and the drums
//   carry the bar; elsewhere it plays as today. (Stepping back wherever the scene was sustained left drums and bass bare
//   for a phrase or more in 24 more themes: a held scene's texture is not always sounding.)
// - **b, the chord breathes:** the punch's chord held instead, swelling in and opening over two bars (the shape of the
//   dark-fronts round's swelling chords: a slow rise, a filter opening, a fade under the next); a struck voice, which
//   cannot swell, strikes the chord once, softly, and lets it ring.
// - **c, a phrase, not a clock:** over each 8-bar phrase the chord speaks as a call and its answer: the call on the
//   theme's own punch, the answer moved through the bar and landing on a strong beat, under the call and softer; then
//   whole bars of rest. The phrase's shape is drawn per phrase, so the rests fall in new places. Where the lane plays
//   alone (no kick, no bed: a breakdown), whole bars of rest would be silence, so there the chord breathes (b).
// - **d, the scene decides** (the count's own split: a punch over a bed, over a held scene with no bed in the bar, or in
//   the air with nothing under it, the commonest): where the bed holds the bar the lane steps back (a); over a held
//   scene with no bed, or where the lane plays alone, the chord breathes (b); in the air, or with a struck voice, where
//   the punch is the groove's only harmony, it speaks in phrases (c).
//
// The sketch is chosen by the build (`__STAB_PUNCH__`, set from `VITE_STAB_PUNCH` by vite.config.ts, a private-tier
// build only) or by a lab tool (`globalThis.__stabPunchLab`); with neither, nothing here plays and every theme is as it
// was. Nothing names a voice, a place, a genre or a seed.
import STAB_PUNCH_FILE from '../recipes/arrangement/stab-punch.json' with { type: 'json' };

export type PunchSketch = 'a' | 'b' | 'c' | 'd';

/** A hit of a phrase: its sixteenth (`anchor` for the bar's own punch), its touch, and its voicing: the whole chord with `up` of its lowest voices an octave up, or (`low`, an answer) the chord without its top note. */
export interface PhraseHit { step: number | 'anchor'; vel: number; low?: boolean; up?: number }
/** A phrase's bars: each a list of hits, empty for a bar of rest. */
export type PhraseShape = PhraseHit[][];

export interface StabPunchRow {
  id: string;
  leastBpm: number;
  mostHits: number;
  swell: { bars: number; vel: number; struckVel: number; rise: number; openFrom: number; openTo: number; open: number; tail: number; release: number };
  phrase: { bars: number; shapes: PhraseShape[] };
  /** (d) where both fit, the birds' lean toward the phrase (over nought) or the breath: a held scene's own lean, and each bird's weight */
  lean: { scene: number; birds: Record<string, number> };
  /** the phrase's hits against everything else in the `hitSeconds` after each, at most (dB, the plan's read less `offsetDb`) */
  ceilingDb: number; offsetDb: { default: number; voices: Record<string, number> }; hitSeconds: number;
  /** the phrase's space by Tide (c) */
  space: { tide: [number, number]; short: number; reverb: [number, number]; throw: { delay: number; reverb: number } };
}
const FILE = STAB_PUNCH_FILE as unknown as { rows: StabPunchRow[] };
/** The stab-punch rows, by id. */
export const STAB_PUNCH_ROWS: Readonly<Record<string, StabPunchRow>> = Object.freeze(Object.fromEntries(FILE.rows.map((r) => [r.id, r])));

/**
 * The sketch this plan plays: a lab's override, else the build's, else `rule` (the style's switch: d, or none). A lab or a
 * build asking `today` plays the lane as it was before the rule.
 */
export function punchSketch(rule: PunchSketch | null): PunchSketch | null {
  const lab = (globalThis as { __stabPunchLab?: unknown }).__stabPunchLab;
  const v = typeof lab === 'string' ? lab : typeof __STAB_PUNCH__ === 'string' ? __STAB_PUNCH__ : rule;
  return v === 'a' || v === 'b' || v === 'c' || v === 'd' ? v : null;
}

/** (d) The birds' lean toward the phrase over the breath (over nought, the phrase): each bird from the house's centre over its outer reach, and the scene's own. */
export function phraseLean(row: StabPunchRow, spell: Record<string, number>, held: boolean, centre: Record<string, number>, reach: Record<string, number>): number {
  let x = held ? -row.lean.scene : row.lean.scene;
  for (const [b, w] of Object.entries(row.lean.birds)) if (Number.isFinite(spell[b])) x += (w * (spell[b] - centre[b])) / Math.max(1e-6, reach[b]);
  return x;
}

/** (c) Tide's reach over the phrase's space, nought (dry and tight) to one (short hits, open room, the echoes thrown). */
export const tideSpace = (row: StabPunchRow, tide: number): number =>
  Math.max(0, Math.min(1, (tide - row.space.tide[0]) / Math.max(1e-6, row.space.tide[1] - row.space.tide[0])));

/**
 * **Where the phrase's echoes go** (c): the sends a thrown hit takes at Tide's reach `u`. Today the room's own dotted echo
 * line (`p.delay`: each repeat darker through its low-pass, the line ducked under the kick) and more of the room. The one
 * place to change when a feedback echo with a voice's measured wetness lands (round dark-fronts' ninth pass): the amount
 * there would be this one times the voice's ceiling, and the send its echo's.
 */
export function throwSends(row: StabPunchRow, u: number, roomNow: number): { delay: number; reverb: number } {
  return { delay: +(row.space.throw.delay * u).toFixed(4), reverb: +(roomNow + row.space.throw.reverb * u).toFixed(4) };
}

/** A phrase hit's sixteenth: the theme's anchor (its punch's first step), or the hit's own. */
export const stepOf = (h: PhraseHit, anchor: number): number => (h.step === 'anchor' ? anchor : h.step);
