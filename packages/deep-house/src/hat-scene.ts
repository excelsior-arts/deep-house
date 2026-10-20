// **The hats and the scene** (his word 10-16 on the hats' moves: "relate them to the scene itself, as this is that kind
// of coherence we seeking, voices give it a main gravity that hats can work of on segments while adding their accents
// for vectors of track change upward/downward/seam on similar segment parts for liveliness").
//
// The scene's rhythm is read bar by bar from the theme's own sounding voices: where the figure (the keys, the stabs, the
// lead), the bass, the pad's strikes and the hand part strike on the sixteenth grid, and how loud. Over a phrase that is
// the **gravity**: the steps its onsets come back to, how busy its bars are, how often the figure rests. The hats work
// off it inside the phrase —
//
//   a hat variation of the house's that fills over busy voices, adds a sixteenth on the gravity's own, or thins over
//     resting voices takes the next of its kind (its other lanes as drawn);
//   the hats' own hits a little softer in a busy bar and fuller in a resting one, their offbeats with the gravity's
//     where it accents some and not all, a sixteenth the figure strikes too stepped back from (a ghost taken out where
//     the bar is busy), and one ghost in a resting bar's gap
//
// — and at a transition the move's kind leans to the vector the voices make across the seam (`src/hat-moves.ts`), read
// inside the parts either side of it, a build as the rise it is (round hat-seams, `seamWindows`); a bar's call is the
// figure's, or the bass's where the figure rests and the bass carries it (`callOf`). The
// rows are `recipes/arrangement/hat-scene.json` and `hat-moves.json`; nothing here names a place, a genre or a seed.
import SCENE_FILE from '../recipes/arrangement/hat-scene.json' with { type: 'json' };
import { lean } from './lean.ts';
import type { Recipe } from './recipe.ts';
import type { LaneEdit } from './treatment.ts';

type W = Record<string, number>;
export interface HatSceneRow {
  centre: Record<string, number | string>;
  voices: { figure: number; bass: number; hands: number; pad: number };
  busy: number;
  /** a bar whose load is busy while its figure rests is one of the two, never both: `busy` (the bass and the hand part
   * keep it moving) or `rest` */
  both: 'busy' | 'rest';
  recur: number;
  vary: { busy: number; rest: number; adds: number; takes: number };
  level: { lock: number; stack: number; busy: number; rest: number; most: number };
  thin: { ghost: number };
  fill: { chance: number; level: number; lean: W; steps: number[] };
  /** a bar whose figure rests is called by the bass where the bass strikes `bass` steps of it or more (round hat-seams) */
  call: { bass: number };
  vector: { dead: number; bars: number };
  moves: { busy: number };
}
export const HAT_SCENE: Readonly<HatSceneRow> = SCENE_FILE as unknown as HatSceneRow;

/** One bar of the scene: per sixteenth, the loudest onset of each voice there (nought where it strikes none), where the
 * figure's note struck there stops sounding (in sixteenths from the bar's start; past 16 where it rings on), the same
 * for the bass's (`bassEnds`, round hat-seams: the call where the bass carries the bar), and the kick's (never a voice
 * of the load: where a hat answer may not fall). */
export interface SceneBar { figure: number[]; bass: number[]; hands: number[]; pad: number[]; ends: number[]; bassEnds: number[]; kick: number[] }
export type SceneVoice = 'figure' | 'bass' | 'hands' | 'pad';
const zeros = () => new Array(16).fill(0);
export const sceneBar = (): SceneBar => ({ figure: zeros(), bass: zeros(), hands: zeros(), pad: zeros(), ends: zeros(), bassEnds: zeros(), kick: zeros() });
const VOICES: readonly SceneVoice[] = ['figure', 'bass', 'hands', 'pad'];

/** A bar's load: each voice's onsets (a step once) by its weight. */
export function loadOf(b: SceneBar, R: Readonly<HatSceneRow> = HAT_SCENE): number {
  let x = 0;
  for (const v of VOICES) x += R.voices[v] * b[v].filter((y) => y > 0).length;
  return x;
}
const silent = (b: SceneBar) => !b.figure.some((y) => y > 0);
/** The bar's voices are busy: its load at the row's `busy` or over (where its figure rests too, as the row's `both` says). */
export const busyAt = (b: SceneBar, R: Readonly<HatSceneRow> = HAT_SCENE): boolean => loadOf(b, R) >= R.busy && (R.both === 'busy' || !silent(b));
/** The bar rests: the keys, the stabs and the lead strike nothing in it (where its load is busy too, as `both` says). */
export const restsAt = (b: SceneBar, R: Readonly<HatSceneRow> = HAT_SCENE): boolean => silent(b) && (R.both === 'rest' || loadOf(b, R) < R.busy);
/** A voice's strikes in the bar, each with the sixteenth its note stops sounding (the call a hat answer answers). */
export const callAt = (b: SceneBar, voice: 'figure' | 'bass' = 'figure'): Array<{ step: number; end: number }> =>
  struckAt(b, [voice]).map((q) => ({ step: q, end: Math.max(q + 1, (voice === 'bass' ? b.bassEnds : b.ends)[q]) }));
/**
 * **The bar's call** (round hat-seams, his word 10-16: the voices give the scene its gravity): the figure's strikes where
 * it plays in the bar; where it rests and the bass carries the bar (it strikes the row's `call.bass` steps or more),
 * the bass's line. Empty where neither calls.
 */
export function callOf(b: SceneBar, R: Readonly<HatSceneRow> = HAT_SCENE): { voice: 'figure' | 'bass'; strikes: Array<{ step: number; end: number }> } {
  const fig = callAt(b, 'figure');
  if (fig.length) return { voice: 'figure', strikes: fig };
  const bass = callAt(b, 'bass');
  return { voice: 'bass', strikes: bass.length >= R.call.bass ? bass : [] };
}
/** The steps the bar's figure and bass strike (the call a move answers, the sixteenths a hat steps back from). */
export const struckAt = (b: SceneBar, voices: readonly SceneVoice[] = ['figure', 'bass']): number[] =>
  Array.from({ length: 16 }, (_, q) => q).filter((q) => voices.some((v) => b[v][q] > 0));

/** A phrase's gravity: its bars' share busy and resting, and the steps its figure, bass or hand part comes back to. */
export interface Gravity { bars: number; busy: number; rest: number; recur: number[] }
export function gravityOf(bars: readonly SceneBar[], R: Readonly<HatSceneRow> = HAT_SCENE): Gravity {
  const n = bars.length;
  if (!n) return { bars: 0, busy: 0, rest: 0, recur: [] };
  const hits = new Array(16).fill(0);
  for (const b of bars) for (let q = 0; q < 16; q++) if (b.figure[q] > 0 || b.bass[q] > 0 || b.hands[q] > 0) hits[q]++;
  return { bars: n, busy: bars.filter((b) => busyAt(b, R)).length / n, rest: bars.filter((b) => restsAt(b, R)).length / n,
    recur: hits.flatMap((h, q) => (h / n >= R.recur ? [q] : [])) };
}

// ----- the house's hat variations against the gravity -----

/** The hats' steps of a bar, as the hat moves read them: all of them, the closed's and the open's; whether its
 * sixteenth lane sounds, and whether the theme has an open hat to copy anywhere. */
export interface SceneHatSteps { all: number[]; closed: number[]; open: number[]; sixteenths?: boolean; canOpen?: boolean }
const HAT_LANES = new Set(['offbeat', 'closed', 'open']);
/**
 * What a row does to a bar's hats: the steps it adds (none of its lane's there before), the ones it takes (cleared, not
 * laid again), and whether it changes another lane there (a sixteenth lane it clears where it sounds).
 */
export function hatEdits(row: Recipe, st: SceneHatSteps): { adds: number[]; takes: number[]; other: boolean } {
  const adds = new Set<number>(), takes = new Set<number>();
  let other = false;
  for (const [lane, e] of Object.entries(row.figure?.lanes ?? {}) as Array<[string, LaneEdit]>) {
    if (!HAT_LANES.has(lane)) { if (lane === 'sixteenth' && st.sixteenths) other = true; continue; }
    // (a figure copies a hit of its lane: an open hat from the theme's nearest, a closed hat from the bar's own)
    const have = lane === 'offbeat' ? st.all : lane === 'closed' ? st.closed : st.open;
    if (lane === 'open' ? st.canOpen === false : !have.length) continue;
    const laid = new Set<number>();
    for (const m of e.mask ?? []) [...m].forEach((c, q) => { if (c !== '.') laid.add(q); });
    if (e.clear !== undefined) for (const q of have) if (q >= e.clear && q < (e.until ?? 16) && !laid.has(q)) takes.add(q);
    for (const q of laid) if (!have.includes(q)) adds.add(q);
  }
  return { adds: [...adds].sort((x, y) => x - y), takes: [...takes].sort((x, y) => x - y), other };
}
const acts = (row: Recipe, steps: readonly SceneHatSteps[], hatsOnly = false) =>
  steps.some((st) => { const e = hatEdits(row, st); return e.adds.length + e.takes.length > 0 || (!hatsOnly && e.other); });
const FIGHTS = { busy: 'fills over busy voices', stack: 'a sixteenth on the gravity\'s own', rest: 'thins over a resting figure' } as const;
/**
 * **Whether a variation fights the gravity over its span**: it adds hits over voices busy on most of its bars, adds a
 * sixteenth on one the gravity comes back to, or takes hits over a figure resting on most of its bars. The reason, or null.
 */
export function variationFights(row: Recipe, g: Gravity, steps: readonly SceneHatSteps[], R: Readonly<HatSceneRow> = HAT_SCENE): string | null {
  if (!steps.length) return null;
  const ed = steps.map((st) => hatEdits(row, st));
  const mean = (k: 'adds' | 'takes') => ed.reduce((x, e) => x + e[k].length, 0) / ed.length;
  if (g.busy >= R.vary.busy && mean('adds') >= R.vary.adds) return FIGHTS.busy;
  if (ed.some((e) => e.adds.some((q) => q % 2 === 1 && g.recur.includes(q)))) return FIGHTS.stack;
  if (g.rest >= R.vary.rest && mean('takes') >= R.vary.takes) return FIGHTS.rest;
  return null;
}
/**
 * **A variation's row by the gravity.** The row that would play is the drawn one where it changes the bars, else the
 * first of its alternates that does (as `playSubSections` plays them). Where that one fights the gravity, another of
 * its kind that does not and changes the hats plays its hats instead: one that thins where the voices are busy, one
 * that fills where the figure rests or where the sixteenths stacked, the draw's order among the rest; the played row's
 * other lanes kept (so nothing but the hats moves). Null where the played row stands or no other fits.
 */
export function sceneVariation(drawn: Recipe, alternates: readonly Recipe[], g: Gravity, steps: readonly SceneHatSteps[],
  R: Readonly<HatSceneRow> = HAT_SCENE): { row: Recipe; alternates: Recipe[]; played: Recipe; reason: string } | null {
  const list = [drawn, ...alternates];
  const played = list.find((a) => acts(a, steps)) ?? null;
  if (!played) return null;
  const reason = variationFights(played, g, steps, R);
  if (!reason) return null;
  const net = (a: Recipe) => steps.reduce((x, st) => { const e = hatEdits(a, st); return x + e.adds.length - e.takes.length; }, 0);
  const want = reason === FIGHTS.busy ? -1 : 1;
  const fits = list.filter((a) => a !== played && acts(a, steps, true) && !variationFights(a, g, steps, R));
  const alt = fits.find((a) => Math.sign(net(a)) === want) ?? fits[0];
  if (!alt) return null;
  return { row: withHatsOf(alt, played), alternates: list.filter((a) => a !== alt).map((a) => withHatsOf(a, played)), played, reason };
}
/** A row playing `hats`'s hat lanes and `rest`'s other lanes (a variation's other lanes stay the played row's). */
export function withHatsOf(hats: Recipe, rest: Recipe): Recipe {
  const L = (r: Recipe, mine: boolean) => Object.fromEntries(Object.entries(r.figure?.lanes ?? {}).filter(([l]) => HAT_LANES.has(l) === mine));
  const lanes = { ...L(rest, false), ...L(hats, true) };
  if (JSON.stringify(Object.keys(lanes).sort()) === JSON.stringify(Object.keys(hats.figure?.lanes ?? {}).sort())
    && Object.entries(L(rest, false)).every(([l, e]) => JSON.stringify(hats.figure?.lanes?.[l]) === JSON.stringify(e))) return hats;
  return { ...hats, figure: { ...hats.figure, lanes } } as Recipe;
}

// ----- the hats' own hits inside a phrase -----

/** A hat hit as the scene shapes it: its step, its level as a share of its voice's loudest in the bar, and its lane. */
export interface SceneHit { step: number; share: number; closed: boolean }
/**
 * **A hit's level by the scene**, in decibels (−Infinity: taken out): a hit on an offbeat the gravity comes back to,
 * where it comes back to some offbeats and not all, `lock`; a sixteenth the bar's figure or bass strikes too `stack`, a
 * ghost there taken out where the bar is busy; every other hit `busy` in a busy bar and `rest` in a resting one, both
 * only in a phrase whose figure plays in some of its bars (a phrase with no figure at all has neither: there the hats
 * are the figure, never stepped back for the bass and the hand part). Held to `most` either way.
 */
export function levelOf(h: SceneHit, bar: SceneBar, g: Gravity, R: Readonly<HatSceneRow> = HAT_SCENE): number {
  const L = R.level;
  const offs = g.recur.filter((q) => q % 4 === 2);
  const struck = struckAt(bar);
  const figured = g.rest < 1, busy = figured && busyAt(bar, R), rest = figured && restsAt(bar, R);
  if (h.step % 2 === 1 && struck.includes(h.step)) {
    if (busy && h.closed && h.share <= R.thin.ghost) return -Infinity;
    return Math.max(-L.most, L.stack + (busy ? L.busy : 0));
  }
  let db = 0;
  if (h.step % 4 === 2 && offs.length > 0 && offs.length < 4 && offs.includes(h.step)) db += L.lock;
  else if (busy) db += L.busy;
  if (rest) db += L.rest;
  return Math.max(-L.most, Math.min(L.most, db));
}
/**
 * A resting bar's fill: the first of the row's steps no hat, bass or hand strikes; null where none is free or the bar is
 * not resting (its figure strikes, or the phrase has no figure at all: there the hats are the figure, and a fill would
 * be more notes, not an answer to a rest).
 */
export function fillStep(bar: SceneBar, g: Gravity, hatSteps: readonly number[], R: Readonly<HatSceneRow> = HAT_SCENE): number | null {
  if (!restsAt(bar, R) || !(g.rest < 1)) return null;
  return R.fill.steps.find((q) => !hatSteps.includes(q) && !(bar.bass[q] > 0) && !(bar.hands[q] > 0)) ?? null;
}
/** The fill's chance where the theme is: the row's, Spark leaning it about the row's centre. */
export function fillChance(spell: Readonly<Record<string, number>>, R: Readonly<HatSceneRow> = HAT_SCENE): number {
  let x = R.fill.chance;
  for (const [bird, v] of Object.entries(R.fill.lean)) { const c = R.centre[bird]; if (typeof c === 'number') x *= lean(v, spell[bird], 1, c); }
  return Math.min(1, x);
}

// ----- the vector of change at a seam -----

export type Vector = 'up' | 'down' | 'level';
/** The vector the voices make across a seam: their energy's change against the row's dead band. */
export const vectorOf = (delta: number, R: Readonly<HatSceneRow> = HAT_SCENE): Vector => (delta >= R.vector.dead ? 'up' : delta <= -R.vector.dead ? 'down' : 'level');
/**
 * **The bars a seam's vector reads** (round hat-seams): up to the row's `vector.bars` before the move's bar, never back
 * across the line the part it sits in begins on (the move's own bar where it is that part's first), against up to as
 * many from the line, never past the next line (a one-bar drop-out reads its own bar, not the groove back after it).
 * `lines`: the bars the arrangement's parts begin on, sorted.
 */
export function seamWindows(bar: number, line: number, lines: readonly number[], R: Readonly<HatSceneRow> = HAT_SCENE): { before: number[]; after: number[] } {
  const n = R.vector.bars;
  const prev = Math.max(0, ...lines.filter((l) => l <= bar));
  const next = Math.min(line + n, ...lines.filter((l) => l > line));
  const before = Array.from({ length: n }, (_, i) => bar - n + i).filter((b) => b >= prev && b >= 0);
  return { before: before.length ? before : [bar], after: Array.from({ length: Math.max(1, next - line) }, (_, i) => line + i) };
}

/** The row's faults: every share a share, the levels in decibels inside `most`, the steps sixteenths. */
export function hatSceneFaults(R: Readonly<HatSceneRow>): string[] {
  const bad: string[] = [];
  const share = (x: unknown) => typeof x === 'number' && x >= 0 && x <= 1;
  for (const [k, x] of Object.entries(R.voices)) if (!(typeof x === 'number' && x >= 0)) bad.push(`voices.${k}`);
  if (!(R.busy > 0)) bad.push('busy: a load above nought');
  if (R.both !== 'busy' && R.both !== 'rest') bad.push('both: busy or rest');
  for (const [k, x] of [['recur', R.recur], ['vary.busy', R.vary.busy], ['vary.rest', R.vary.rest], ['thin.ghost', R.thin.ghost], ['fill.chance', R.fill.chance], ['fill.level', R.fill.level], ['vector.dead', R.vector.dead]] as const)
    if (!share(x)) bad.push(`${k}: a share`);
  if (!(R.vary.adds >= 1) || !(R.vary.takes >= 1)) bad.push('vary: adds and takes are counts of hits');
  if (!(R.level.most > 0)) bad.push('level.most: decibels above nought');
  for (const [k, x] of Object.entries(R.level)) if (k !== 'most' && !(Math.abs(x) <= R.level.most)) bad.push(`level.${k}: inside most`);
  for (const q of R.fill.steps) if (!(Number.isInteger(q) && q >= 0 && q < 16)) bad.push(`fill.steps: ${q}`);
  for (const k of Object.keys(R.fill.lean)) if (typeof R.centre[k] !== 'number') bad.push(`fill.lean: ${k} with no centre`);
  if (!(R.moves.busy >= 0)) bad.push('moves.busy: a ratio');
  if (!(Number.isInteger(R.vector.bars) && R.vector.bars >= 1)) bad.push('vector.bars: a count of bars');
  if (!(Number.isInteger(R.call.bass) && R.call.bass >= 1)) bad.push('call.bass: a count of steps');
  return bad;
}
{
  const bad = hatSceneFaults(HAT_SCENE);
  if (bad.length) throw new Error(`the hat scene: ${bad.join('; ')}`);
}
