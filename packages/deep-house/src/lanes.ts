// The lanes: which parts a style plays, who plays each of them, and where each
// one's notes come from.
//
// Round K6 of PLAN-KITCHEN, and Eugene's decision of 09-18: **a style declares
// its own lanes, and their number is the style's** — "we could have up to 12,
// and for some styles it could be only 2, like ambient". What this file is, is
// the machinery that reads such a table; the tables themselves are the styles'
// (`src/styles/deep-house.ts` and `deep-house-v2.ts`), and the shape of a row is
// the machine's (`@deep-house/engine/style`'s `Lane`).
//
// ## What it replaces
//
// The record played eight arrangement layers and four pieces of section glue,
// and every one of them was a **name written in the composer**: `patterns.ts`
// wrote `hatClosed` and `shaker`, `generator.ts` wrote `clap`, `kick`, `sub`,
// `riser`, `impact`, `swell` and `sweepDown`. That is why K3's sixteen
// percussion instruments could be registered, measured, weighted by K5b's rule
// and leaned by K5b's drum imprint and still be heard by nobody: there was no
// die, because the composer was not asking a question.
//
// Now a lane is a row and the composer asks each row two questions — *who plays
// this* and *what does it play* — and writes neither answer down.
//
// ## Why house-v1 does not move
//
// Every lane of the record carries **one** candidate, so every draw is
// `pickWeighted` over a list of one, which is that one. The draw does consume a
// number, so it is taken from a **stream of the lane's own** —
// `<seed>::lane:<id>` — and a new stream reshuffles nothing behind it, which is
// the property `Rng`'s child streams exist for and which round B established.
// Both of house-v1's digests are the proof.
//
// ## The figure sources
//
// A lane's `figure` is a word, and the words are the composer's: what a mined
// mask is and which table it was mined from is music and not machinery. The
// generator holds one function per word (`FIGURES` in `src/generator.ts`) and
// `sourcesOf` below is what puts them in the order a bar is written in — one
// call per source, however many lanes it feeds, because the hat figure has
// always decided the offbeats and the sixteenths in one pass over one mask.

import Rng from './rng.ts';
import { weightsFor } from './spell.ts';
import { BY_NAME } from '@deep-house/engine/voices';
import type { Lane, Style } from '@deep-house/engine/style';
import type { Bias } from './spell.ts';

/**
 * One candidate of a lane's list, which is the shape the *machine* states a
 * lane's candidates have (`@deep-house/engine/style`'s `Lane`): a weighted
 * entry, with what the kitchen's rules did to it where they did anything.
 */
type LaneCandidate = NonNullable<Lane['voices']>[number];

/**
 * The lanes one figure source feeds. `gate` is the first lane's, kept as the
 * group's name for a readout; it is not what the group is asked under — the
 * generator asks a group when any of its lanes' gates is on and each lane
 * emits under its own (`laneOn` there, 09-20).
 */
export interface FigureGroup {
  figure: string;
  lanes: Lane[];
  gate: string | null;
}

/**
 * The closed vocabulary of figure sources. A lane naming anything else is a
 * lane the generator has no function for, and `tools/check.ts` refuses it —
 * the same rule the roles, the families and the buses are held to, for the same
 * reason: a word nobody agreed to is a word that means whatever the last commit
 * thought it meant.
 *
 *   `kick`          four on the floor, and the fill
 *   `hatMask`       one mined hat mask, read for the offbeat eighths, whichever
 *                   of them opens, and — under the record — everything between
 *                   them
 *   `sixteenthMask` a mined table of its own, drawn off its own stream: what the
 *                   reference sets put *between* the offbeats, over the whole
 *                   table instead of over the one mask the hats drew
 *   `backbeat`      two and four, and the ghost
 *   `bassMask`      the mined bass template, its contour and its variations
 *   `stabMask`      the mined stab grid — or the figure a timbre brings with it,
 *                   which is the piano's arpeggio and its melody
 *   `chord`         the voicing, held, when the chord changes
 *   `glue`          the section effects: the boundary, the lift and the fall
 *   `motif`         the track's own theme, stated and developed by the grammar
 *                   (`src/motif.ts`). It is the one word no lane *table*
 *                   carries: a theme's own die rewrites the figure of the lane
 *                   of the register that states it, for that track alone, which
 *                   is what makes a theme a property of a track and not of a
 *                   style. The gate refuses it on a table all the same, because
 *                   a style that wanted a lane permanently on a theme would be
 *                   saying something and should be able to say it.
 */
export const FIGURE_SOURCES: readonly string[] = Object.freeze([
  'kick', 'hatMask', 'sixteenthMask', 'backbeat', 'bassMask', 'stabMask', 'chord', 'glue', 'motif', 'recipeRhythm', 'recipeFigure',
]);

/** Is this row an incumbent — a candidate no rule of the kitchen opened? */
const isIncumbent = (e: LaneCandidate): boolean => e.opened === undefined;

/**
 * One lane's weight function, as `Rng.pickWeighted` reads it: the entry's own
 * weight times the bias above the dice, and **nought for an incumbent that
 * belongs to another lane**.
 *
 * That last clause is what lets four lanes share one candidate list. The four
 * pieces of section glue are one role — `texture` — and K5b weighted them as
 * one list, but the record's answer at a section boundary is not its answer to
 * a build's last bars: an impact and a riser are two moments and not two
 * spellings. So the list is shared, the lean the layer table gives it is shared,
 * and each lane keeps its own incumbent and puts the other lanes' at nought,
 * where `pickWeighted` drops it before it draws.
 */
/**
 * **A ring the lane's grid cannot hold is never promoted** (round S6, house-v2's
 * `hatRing`). An offbeat hat's ring has to fall 20 dB before the next offbeat
 * lands; one that does not is a wash over the grid, and no bird's lean may
 * make it likelier than the record made it. `ringMs` is the style's measured
 * table and `gridSeconds` the lane's spacing at the theme's tempo; a candidate
 * whose ring is over `RING_SHARE` of it keeps a multiplier no higher than the
 * lowest of the candidates that fit, so its share of the lane can only fall.
 */
export const RING_SHARE = 0.6;
export interface LaneGrid { gridSeconds: number; ringMs: Readonly<Record<string, number>>; roles: readonly string[] }
export function laneWeight(lane: Lane, bias: Bias, grid?: LaneGrid): (e: LaneCandidate, i: number) => number {
  const list = lane.voices || [];
  let w = weightsFor(bias, lane.list || '', list.length);
  const shared = lane.incumbent != null;
  if (grid && grid.roles.includes(lane.role)) {
    const limit = grid.gridSeconds * 1000 * RING_SHARE;
    const rings = (e: LaneCandidate) => (grid.ringMs[String(e.v)] ?? 0) > limit;
    const fit = list.map((e, i) => (e.w > 0 && !rings(e) ? w[i] : Infinity));
    const floor = Math.min(...fit);
    if (Number.isFinite(floor)) w = w.map((x, i) => (rings(list[i]) ? Math.min(x, floor) : x));
  }
  return (e, i) => (shared && isIncumbent(e) && e.v !== lane.incumbent ? 0 : e.w * w[i]);
}

/**
 * Who plays each lane, this theme: one draw per lane that has a candidate list,
 * off a stream of the lane's own.
 *
 * A lane whose `voices` is null is not drawn here — the two harmonic lanes are
 * chosen by the *timbre* dice and the instrument is whatever the registry says
 * makes that timbre (`voicePlaying`), which is round K5b's seam and is the one
 * place where a composer draws one thing and an event carries another.
 *
 * `withdrawn` is the composer's answer, under the theme's scene, to whether a
 * lane's candidate stands beside the drone (`withdrawnFrom` says which
 * families a lane puts to the question; the composer asks it at the lane's
 * pace). A withdrawn candidate weighs nought, so `pickWeighted` drops it
 * before it draws: still one number off the lane's stream. A lane with every
 * candidate withdrawn draws its incumbent here, and the composer holds its
 * gate off instead (`silencedBy`). No answer (the record, a complete recipe,
 * any scene but the drone in front) is no rule.
 *
 * @returns lane id -> the voice's event name
 */
export type LaneWithdrawal = (lane: Lane, voice: string) => boolean;
export function laneVoices(style: Style, seed: string | number, bias: Bias, withdrawn?: LaneWithdrawal, grid?: LaneGrid): Record<string, string> {
  const out: Record<string, string> = {};
  for (const lane of style.lanes) {
    if (!lane.voices || !lane.voices.length) continue;
    const weight = laneWeight(lane, bias, grid);
    const drawn = new Rng(`${seed}::lane:${lane.id}`).pickWeighted([...lane.voices],
      withdrawn ? (e, i) => (withdrawn(lane, String(e.v)) ? 0 : weight(e, i)) : weight);
    out[lane.id] = drawn ? String(drawn.v) : String(lane.incumbent ?? lane.voices[0].v);
  }
  return out;
}

export const familyOf = (voice: string): string => (BY_NAME[voice] || { family: '' }).family;

/** The families a lane puts to the scene's question under this scene. */
export const withdrawnFrom = (lane: Lane, scene: string | undefined): Set<string> =>
  new Set(scene ? (lane.withdraw || []).filter((w) => w.scene === scene).flatMap((w) => w.families) : []);

/** The gates of the lanes the withdrawal leaves with no live candidate at all: held off in the plan. */
export function silencedBy(style: Style, bias: Bias, withdrawn: LaneWithdrawal | undefined): string[] {
  if (!withdrawn) return [];
  return style.lanes.filter((lane) => {
    if (!lane.gate || !lane.voices || !lane.voices.length) return false;
    const weight = laneWeight(lane, bias);
    const live = lane.voices.filter((e, i) => weight(e, i) > 0);
    return live.length > 0 && live.every((e) => withdrawn(lane, String(e.v)));
  }).map((lane) => lane.gate as string);
}

/**
 * The lanes grouped by the source that feeds them, in the table's own order.
 *
 * A source is called **once** per bar however many lanes it feeds, because a
 * figure is one decision: the hat mask says where the offbeats are, which of
 * them opens and what falls between them in the same pass over the same mask,
 * and splitting that into three calls would be three draws off one stream where
 * there was one. The group's position is the position of its first lane, and
 * its `gate` is that lane's gate, as a name.
 *
 * What the gate is *not*, since 09-20, is the one gate every lane of the group
 * emits under. The record had always asked *is the hat layer on* and then
 * written the shaker inside that answer, and for the record that is exact —
 * the open hat and the sixteenths read their own gates inside the hat figure,
 * and MEASURED over the fourteen golden themes and seeds 1-199 of both
 * strategies there is no bar where the closed hats are off and either of the
 * others on. But a second lane on the backbeat with a gate of its own emitted
 * whenever the clap's gate was on and never when only its own was (the outside
 * review of 09-19, §1 of its composition review). So the generator asks a
 * group when *any* of its lanes' gates is on, draws once, and each lane emits
 * under its own gate — which is the same plan for every theme of the record,
 * byte for byte, and the right one for the pair.
 */
export function sourcesOf(lanes: readonly Lane[]): FigureGroup[] {
  const out: FigureGroup[] = [];
  for (const lane of lanes) {
    const row = out.find((g) => g.figure === lane.figure);
    if (row) row.lanes.push(lane);
    else out.push({ figure: lane.figure, lanes: [lane], gate: lane.gate });
  }
  return out;
}

/** The lane of a group that plays a named slot, or the group's only lane. */
export const slotOf = (group: FigureGroup, slot: string | null | undefined): Lane | undefined =>
  group.lanes.find((l) => l.slot === slot) || (slot == null ? group.lanes[0] : undefined);

/**
 * What an event of this lane carries, given the voice drawn for it: the event
 * name, and the layer the **descriptor** declares. The layer was written into
 * the generator beside every push until this round, which is the same fault as
 * the voice name being written there — a conga fills the sixteenth lane and its
 * events belong on the layer the sixteenth lane is metered, mixed and soloed
 * on, and the instrument is the only thing that knows which that is.
 */
export function layerOf(voice: string): string {
  const d = BY_NAME[voice];
  if (!d) throw new Error(`lanes: no registered voice called ${voice}`);
  return d.layer;
}


/**
 * **Which of the machine's roles make a drum grid.** Four of the nine in
 * `ROLES` (`packages/engine/src/voices/descriptor.ts`): the floor, the offbeat,
 * whatever falls between the offbeats, and the backbeat. It is a statement about
 * the *vocabulary* and not about any style's table — a two-lane ambient with no
 * row in any of the four has no drum grid, and a style that puts three lanes on
 * `offbeat` has all three in it.
 *
 * `bassline` is not here: a bassline is the low end of the harmony and it plays
 * under a drumless piece exactly as the pads do. `texture` is not here either —
 * the section glue is a boundary and not a grid — and the one consequence worth
 * writing down is that a strategy whose texture list can draw a crash may still
 * strike one at a section boundary with the grid off. That is reported in
 * `notes/archive/2026-09-v2-day-chain/rounds/derive-lite.md` rather than gated, because gating a role by the
 * bus one of its candidates happens to land on is a rule about an instrument.
 */
export const PERCUSSION_ROLES: readonly string[] = Object.freeze([
  'kick', 'offbeat', 'sixteenth', 'backbeat',
]);

/**
 * The gates of every percussion lane of a style: what the section grammar has to
 * switch off for a plan to hold no drum grid at all. Read off the style's own
 * lane table, so a style with no such lane hands back nothing and a style with
 * six hands back six.
 */
export const percussionGates = (lanes: readonly Lane[]): string[] =>
  lanes.filter((l) => l.gate && PERCUSSION_ROLES.includes(l.role)).map((l) => l.gate!);

/**
 * A style as a *strategy* may have added to it. The engine's `Style` states
 * nothing about switches, and rightly: a switch is a composition decision and
 * the machine has no opinion about one. The block is house-v2's own — this is
 * the composer's read of it, written without naming the style that carries it.
 */
type Switchable = Style & { switches?: Record<string, boolean> };

/**
 * One of a strategy's switches, off for a style that carries none. It is a
 * question and not a branch round a feature: the value reaches the call either
 * way, and with every switch off the value is the one the record was planned
 * with.
 *
 * It lived in `src/set-plan.ts` until derive-lite, and moved here when the
 * *generator* gained a switch of its own to read (`derived`): set-plan imports
 * the generator, so the generator cannot import set-plan, and a switch is a
 * read of what a style declares, which is what this file is.
 */
export const switchOn = (style: Style, name: string): boolean =>
  ((style as Switchable).switches || {})[name] === true;

export default laneVoices;
