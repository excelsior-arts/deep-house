// **The sub-sections on the ring** (his word, 10-13: *"more visualisation for sub section on the ring UI for better
// tracking the composer work, nothing crazy, just little bars here and there similar to what we have, maybe dashed
// lines"*). What the arrangement's phrases did inside a theme (`track.phrasing`, `src/phrasing.ts`) read as marks on
// the rim, each at its real bars, in the section plan's own line work: a kind is told by its dash, its length and its
// weight, never by a colour of its own.
//
// Two tracks just outside the section plan's names, and the bar numbers clear beyond them:
//
//   the phrase track  the sub-segments of a long main and the cooldown into a break
//   the low track     the bass out before a drop or a return, and across a cooldown
//   a stroke          the drums answering an arrival, across both tracks at the arrival's bar
//
// A later kind (the pad's arc) is one more row of `SUB_STYLE` and one more line of `subMarksOf`. Nothing here draws;
// the ring does (`drawSubMarks`). Nothing here names a place, a genre or a seed.

/** Every kind a mark is drawn as. */
export type SubMarkKind = 'breakdown-lite' | 'half-time' | 'filtered' | 'drop-out' | 'fill' | 'cooldown' | 'bass-out' | 'answer';

/** One mark: its kind, its bars (`to` exclusive; an answer is the line at `from`, `to` the same bar) and its line. */
export interface SubMark { kind: SubMarkKind; from: number; to: number; label: string }

/**
 * How a kind is drawn, in ring units:
 *   `span`  an arc over its bars, dashed by `dash` (null is a whole line)
 *   `pair`  two short strokes across the phrase track at its bar's two lines, nothing between — a bar emptied
 *   `tick`  a stroke across both tracks at its bar line
 */
export interface SubStyle { track: 'phrase' | 'low' | 'both'; shape: 'span' | 'pair' | 'tick'; w: number; dash: string | null; op: number }

/** The phrase track's radius and the low track's: outside the section names (446), inside the bar numbers (480). */
export const R_SUB = 452;
export const R_SUB_LOW = 458;

export const SUB_STYLE: Readonly<Record<SubMarkKind, SubStyle>> = Object.freeze({
  // the breakdown's own dash, thin: a breakdown in miniature (the kick, the backbeat and the tops out)
  'breakdown-lite': { track: 'phrase', shape: 'span', w: 3, dash: '2 9', op: 0.75 },
  // even dashes, ink and gap alike: the groove at half its pulse
  'half-time': { track: 'phrase', shape: 'span', w: 3, dash: '6 6', op: 0.7 },
  // a whole hairline: the sound narrowed under the closed low-pass, opened at its end
  filtered: { track: 'phrase', shape: 'span', w: 1.4, dash: null, op: 0.8 },
  // one bar emptied: its two lines and nothing between
  'drop-out': { track: 'phrase', shape: 'pair', w: 1.6, dash: null, op: 0.8 },
  // one bar, solid and heavier: the fill into the line (and a re-entry's fill on a span's last bar)
  fill: { track: 'phrase', shape: 'span', w: 4, dash: null, op: 0.8 },
  // the outro's long dash: the main's way out into its break
  cooldown: { track: 'phrase', shape: 'span', w: 3, dash: '14 8', op: 0.55 },
  // a fine dot on the low track: the bass gone for its bars
  'bass-out': { track: 'low', shape: 'span', w: 2, dash: '1.5 3.5', op: 0.75 },
  // the drums answering the line: a stroke across both tracks
  answer: { track: 'both', shape: 'tick', w: 1.6, dash: null, op: 0.5 },
});

/** The phrasing as the track carries it (a structural read: the plan may come off a worker as plain data). */
interface PhrasingLike {
  segments?: ReadonlyArray<{ kind: string; from: number; to: number; label?: string; reentry?: string | null; answered?: readonly string[] }>;
  answers?: ReadonlyArray<{ bar: number; label?: string }>;
  outs?: ReadonlyArray<{ from: number; to: number; label?: string; fill?: string | null; lift?: readonly string[] }>;
  cooldowns?: ReadonlyArray<{ from: number; to: number; label?: string }>;
}

const SEGMENT: Record<string, SubMarkKind> = { 'breakdown-lite': 'breakdown-lite', 'half-time': 'half-time', filtered: 'filtered', 'drop-out': 'drop-out', fill: 'fill' };
/**
 * A build heard on a line's last bar (U2c: the drums roll into the line and stop on its last eighth; a re-entry's fill
 * is played as the build): its row named, and the track saying a lane rolled — what the labels say is what was heard.
 */
export const builtOn = (row: string | null | undefined, said: readonly string[] | undefined): boolean =>
  !!row && (said ?? []).some((x) => / rolling/.test(x));
/**
 * The marks of a theme's phrasing, in bar order, each at its real bars and clipped to the theme. A segment with a
 * build into its line is its body and the fill on its last bar; a cooldown with the bass out across it is both, one
 * track each; a bass out built into its line is the low track's dots and the fill on its last bar. A theme without
 * phrasing has none.
 */
export function subMarksOf(phrasing: PhrasingLike | null | undefined, bars: number): SubMark[] {
  if (!phrasing || !(bars > 0)) return [];
  const out: SubMark[] = [];
  const add = (kind: SubMarkKind, from: number, to: number, label = '') => {
    const a = Math.max(0, Math.floor(from)), z = Math.min(bars, Math.ceil(to));
    if (kind === 'answer' ? a >= 0 && a < bars : z > a) out.push({ kind, from: a, to: kind === 'answer' ? a : z, label });
  };
  for (const s of phrasing.segments ?? []) {
    const kind = SEGMENT[s.kind];
    if (!kind) continue;
    const long = s.to - s.from > 1, built = builtOn(s.reentry, s.answered);
    // the body: a filtered phrase opens over its last bar, so it runs to its end; any other span hands its last bar
    // to the build
    add(kind, s.from, long && built && kind !== 'filtered' ? s.to - 1 : s.to, s.label);
    if (long && built) add('fill', s.to - 1, s.to, s.label);
  }
  for (const c of phrasing.cooldowns ?? []) add('cooldown', c.from, c.to, c.label);
  for (const o of phrasing.outs ?? []) {
    add('bass-out', o.from, o.to, o.label);
    // the drums build into the line the bass comes back on (U2c), on the phrase track over the out's last bar
    if (builtOn(o.fill, o.lift)) add('fill', o.to - 1, o.to, o.label);
  }
  for (const a of phrasing.answers ?? []) add('answer', a.bar, a.bar, a.label);
  return out.sort((x, y) => x.from - y.from || x.to - y.to);
}
