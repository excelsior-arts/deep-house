// The mix: an endless set rather than a track, and the one door the interface
// comes through.
//
// Themes follow one another the way a DJ runs them together — one tempo all
// night, a seam on a phrase boundary, and one bar where the low end changes
// hands. Everything is derived from a master seed, so a set can be left, come
// back to and shared: theme n's seed is `${masterSeed}#${n}` and nothing else.
//
// Since round E of PLAN-V1-NEXT this file is the **facade** and nothing else.
// It was five things — planning, time mapping, transition rules, graph
// ownership and offline layout — and the four that are not the session live
// where they belong:
//
//   src/set-plan.ts    which theme follows which, where every seam falls, the
//                      curves it will write and the holes it will cut. Pure.
//   packages/engine/src/set-clock.ts   the one grid a set counts on: pins and glides.
//   packages/engine/src/schedule.ts    the one scheduling contract: which events sound between
//                      here and there, and when. Live and offline alike.
//   packages/engine/src/deck.ts        a theme playing: its graph, its channel, its cursor, and
//                      a hand-over written onto nodes.
//   packages/engine/src/graph.ts       the v1 graph behind one factory, unchanged.
//   packages/engine/src/session.ts     the shape of what this file hands back.
//
// What is left here is the session: what is playing, what is arriving, what is
// being let go, the tokens that say whether a start is still the one that was
// asked for, and the two entry points — `createMix` for the page and
// `renderMix` for a render of a whole set. The names every caller has always
// imported from `./mix.ts` are still exported here.

import { LEGACY_INTERPRETERS, requireCurrentCalibration } from './calibration.ts';
import { generationOf, definitionOf } from './generation.ts';
import { prepareLimiter, eqProfileOf, EQ_BANDS, warmRoom } from '@deep-house/engine/master';
import { switchOn } from './lanes.ts';
import { resolveSettings, settingsOf } from '@deep-house/engine/settings';
import { prepareVoices } from '@deep-house/engine/voices';
import { lateInfo, noteTransportStart, Offline, latencies } from '@deep-house/engine/dsp';
import { freeRingSeconds } from './musical-time.ts';
import { seamPlan, seamFromHere, mixPointSeconds, blendBarsFor, blendAsked, compilePerformance, programOf, PHRASE_BARS, ROOM_BARS, seamTempo, glideBarsFor, rideInRoom, lineWithRoom, handSeamBars, playsKick, sameFormTime, noteKnobs, freeSides, freeSeamBars, isFree } from './performance.ts';
import type { SeamTempo, HandSeamBars } from './performance.ts';
import {
  applyBypass, readBypass, seamCurves, setOptions, swapAfterBars, themeSeed,
  presetOfTheme as presetOfThemeOf, setLayout as setLayoutOf, layOut as layOutOf,
} from './set-plan.ts';
import type { Bypass, MixOptions, SetPlan, SetTrack, Track } from './set-plan.ts';
// The knob tables of the voices a theme drew, asked of the plan and remembered
// on it: the seasoning a note is re-given live is the seasoning it would have
// been planned with, because it is one function.
import { knobTablesOf, seasonOf } from './generator.ts';
// **The one place the machine is told which music it is playing.** Round F of
// PLAN-V1-NEXT put every deep house number in one file and left the engine
// reading a style it is handed. Since round K5a of PLAN-KITCHEN the style is
// not chosen here either: a **composition strategy** is chosen, and the style
// is what it plays. `src/strategies/index.ts` is the one module in either
// package that names a style, and `tools/check.ts` greps the rest to keep it
// so. Everything below passes the chosen style on: a plan carries it, a deck
// reads it off its plan, and the compiler, the seam and the loudness model are
// all handed it rather than reaching for it.
import {
  DEFAULT_STRATEGY, STRATEGIES, STRATEGY_IDS, STYLE as DEFAULT_STYLE,
  strategyById, strategyFromQuery,
} from './strategies/index.ts';
// The spell layer, above the dice and below nothing: `createMix` reads a spell
// off the page's query string the way it reads a bypass, so a URL, a bench and
// a test all reach one the same way and the ring is not involved at all.
import { HOUSE, asSpell, derive, isHouse, knobsFor, sameSpell, spellFromQuery, recipeFromQuery } from './spell.ts';
import type { Spell } from './spell.ts';
import { spellFrom, weightOf } from './recipe.ts';
import type { Recipe } from './recipe.ts';
import type { SourceMix } from '@deep-house/engine/source-mix';
import { LIBRARY, PATTERN_LIBRARY, CANDIDATE_LIBRARY, PINNABLE, TRACK_LIBRARY, recipeById } from './recipes.ts';
import { recipeRequest, accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import { planTheme } from './planning.ts';
import { planOffThread } from './plan-off-thread.ts';
import type { OffThreadHow } from './plan-off-thread.ts';
import Rng from './rng.ts';
// The ledger is a notebook and not a tap: it touches no node and is in no
// signal path, so what is written here cannot move a sample. Every line is a
// value this file already has at the instant it writes it — where a seam
// begins, when the low end changes hands, which set a cast is arriving into —
// and `src/ledger.ts` says why it runs whether or not anybody is reading it.
import { keepPlace, note, outputClipWriter, report } from './ledger.ts';
import { clockOf, minutesOf } from './length.ts';
import { makeSetClock } from '@deep-house/engine/set-clock';
import { makeV1Master } from '@deep-house/engine/graph';
import type { V1Master } from '@deep-house/engine/graph';
import { roomOf, withStage } from '@deep-house/engine/stage';
import type { StageHow } from '@deep-house/engine/stage';
import {
  claim, deckContextTime, deckGraph, deckThemeTime, freeDeck, gridBeat, holdCurves, lineAfter, makeDeck, pourDeck,
  pumpDeck, relayDeck, release, startDeck, teardown, writeSeam,
} from '@deep-house/engine/deck';
import type { DeckGraph } from '@deep-house/engine/deck';
import { renderProgram, holdOpen, doorsOf } from '@deep-house/engine/scheduler';
import type { RenderOptions } from '@deep-house/engine/scheduler';
import { schedule, visitAt, visitOrder, sameVisitOrder } from '@deep-house/engine/schedule';
import { themeInfo } from '@deep-house/engine/session';
import type { MixState, MixWait, TransportPoint } from '@deep-house/engine/session';
import type { Deck } from '@deep-house/engine/deck';
import type { SetClock } from '@deep-house/engine/set-clock';
import { line as rampLine } from '@deep-house/engine/ramp';
import type { Line } from '@deep-house/engine/ramp';
import type { Room, Style } from '@deep-house/engine/style';
import type { Strategy } from './strategies/index.ts';
import { reachOf } from './library-draw.ts';
// The tick, the look-ahead and the hidden stretch are the clock's: one clock
// for this mix and for the single-theme player alike.
import { TICK_MS, lookahead, startClock } from '@deep-house/engine/clock';

// The names this file has always been imported by. Planning, the grid, the seam
// arithmetic and what a hand-over writes are all somebody else's now; a caller
// that asks `./mix.ts` for them gets them, because that is where the set is.
export {
  applyBypass, readBypass, swapAfterBars, themeSeed,
  makeSetClock, seamPlan, seamFromHere, mixPointSeconds, blendBarsFor, blendAsked, programOf,
  HOUSE, knobsFor, spellFromQuery, recipeFromQuery,
  // the knob tables of the voices a theme drew, for a face that has to say what
  // a pull changes in the sound that is already playing
  knobTablesOf,
  DEFAULT_STRATEGY, STRATEGIES, STRATEGY_IDS, strategyById, strategyFromQuery,
};
// What a planned theme *is*, from the package that composes one. The engine
// takes a plan and never reads one (`Deck.track` is `any` and says why), so a
// caller that holds a track holds this: `Track` is what `generate` composes,
// `SetTrack` is that value once a set has planned it and the four fields a set
// writes beside a plan are no longer open. Both are stated in the two files
// that own them and handed on here, under the names every caller already
// imports from.
export type { Bypass, MixOptions, SetPlan, SetTrack, Track };

/**
 * A hand-over, planned and then written.
 *
 * Where a seam falls, how long it takes, what it does to each fader and filter
 * and which holes it cuts in the low end are **deep house** — `seamCurves` in
 * `src/set-plan.ts`, out of the style's own `set` block — and writing the
 * result onto two decks and the sum they pass through is the **machine**:
 * `writeSeam` in the engine. Until round W of PLAN-V1-NEXT the two were one
 * function on the deck, which is the one place the machine reached into a
 * style. What is added here is the three things that belong to the moment:
 * where the swap falls on each deck's own clock, where the sum's gain stands as
 * the curve begins, and, for a cut, which bar line the hand is nearest.
 *
 * Exported under the name it has always had, and `tools/program.ts` still
 * locks what a seam writes by calling it with recording parameters where the
 * audio nodes would be.
 *
 * @param ctx the live or offline context; read only when the seam is a cut
 * @param from the deck handing over
 * @param to the deck arriving
 * @param at when the seam begins, in context time
 * @param bars how long it runs
 * @param barSeconds a bar of the grid both decks are counting on
 * @param opts the set's options; the style is read off the plan
 * @param sum the gain the two decks pass through, if there is one
 * @param cut a cut begins on a bar line rather than after n bars
 * @param writeFrom where the lines are written from
 */
export function scheduleTransition(
  ctx: BaseAudioContext, from: Deck, to: Deck, at: number, bars: number, barSeconds: number,
  opts: Partial<MixOptions>, sum: GainNode | null = null, cut = false, writeFrom: number | null = null,
  sumLine: Line | null = null,
) {
  // The music both decks are playing: a seam's numbers are the style's, and a
  // deck carries the style its theme was planned in.
  const o = setOptions(from.track.style, opts);
  // A seam swaps a fixed number of bars in. A cut begins on a beat, so its
  // swap is a *line* rather than a count: the first bar line after the cut,
  // which is where a downbeat is and where a bass belongs.
  const swapAt = cut
    ? lineAfter(from, at + 1e-3, from.track.barSeconds)
    : at + swapAfterBars(bars, o) * barSeconds;
  const plan = seamCurves({
    at,
    bars,
    barSeconds,
    swapAt,
    filterMove: to.track.filterMove,
    outgoingBar: from.track.barSeconds,
    swapInFrom: deckThemeTime(from, swapAt),
    swapInTo: deckThemeTime(to, swapAt),
    // Where the sum will stand as the curve begins, off its line where the
    // session keeps one: `.value` is the sum now, not at the seam.
    sumGain: sumLine ? sumLine.at(at) : sum ? sum.gain.value : null,
    // A kick is holed only where the other deck has one to overlap it.
    fromKick: playsKick(from.program, o.swapGroup),
    toKick: playsKick(to.program, o.swapGroup),
    // The two keys, for the harmonic cross (round MIX-X2): a seam between
    // unrelated keys fades the harmony out before the swap and in after it.
    fromKey: from.track.key,
    toKey: to.track.key,
    // A free record leaves as a change (`FREE_TAIL_CURVES`), its ring Tide's: only where the outgoing theme is free.
    ...(isFree(from.track) ? { freeTail: { ringS: from.track.ringSeconds ?? freeRingSeconds(0.5) } } : {}),
  }, o);
  return writeSeam(from, to, plan, sum, writeFrom == null ? at : writeFrom, sumLine);
}

/**
 * One theme, rendered offline from its plan: its own room resolved once before
 * anything is awaited, and the performance compiled under it. The render itself
 * is the engine's (`renderProgram`), and what is here is the two lines that
 * turn a plan into the program it renders — which is the composer's half and
 * why it moved out of the engine's scheduler in round W of PLAN-V1-NEXT.
 *
 * @param track a planned theme
 */
export async function renderTrack(track: Track, opts: RenderOptions = {}) {
  return renderProgram(compilePerformance(track, settingsOf(track)), opts);
}

/**
 * The music this build plays with nothing asked of it: the default strategy's
 * style, which is `house-v1` and is the record. A second style is a second
 * module of that shape, named by a strategy in `src/strategies/index.ts`.
 */
export const STYLE = DEFAULT_STYLE;

/**
 * The strategy a set is played under, read once, the way the bypass and the
 * spell are.
 *
 * `?v=2` names one (`src/link.ts` maps the token to `house-v2`). **Nothing
 * named is `house-v1`** to the composer: a caller that names no strategy gets
 * the record (the page's own default for a bare link is `pageDefault()`). An id nothing answers to says
 * so on the console and then behaves like nothing was asked for, the way a
 * malformed spell does.
 *
 * A caller that is not a page — a bench, a check, a tool — passes `search` or
 * passes `strategy` outright, so all three reach one the same way.
 */
export function strategyFor(opts: Partial<MixOptions> = {}): Strategy {
  if (opts.strategy !== undefined && opts.strategy !== null) return strategyById(opts.strategy);
  return strategyById(strategyFromQuery(opts.search));
}

/**
 * The set's own numbers for this style, with the machine's look-ahead under
 * them: the table every caller of `planTheme`, `setLayout` and `createMix` used
 * to import from here under the name `MIX_DEFAULTS`, which is now the style's
 * `set` block resolved once.
 */
export const MIX_DEFAULTS = setOptions(STYLE);

/** Where a theme may hand over at the earliest, as a fraction of its length. */
export const SEAM_FLOOR = STYLE.set.seamFloor;

// The whole plan of theme n (`src/planning.ts`, where a worker can load it:
// the planning perf round of 10-12), under the name every caller imports.
export { planTheme };

/**
 * **Whether the low end two plans hand between is a different one** (round
 * S8): the bass lane's notes — when, which voice, which pitch, how long, how
 * hard and with what — the knob settings on its voice, and the room's bass
 * block. Two different themes always differ; a theme re-planned in place under
 * a move that did not reach its bass does not.
 */
export function lowEndDiffers(a: Track, b: Track): boolean {
  const bass = (t: Track) => t.events.filter((e) => e.layer === 'bass').map((e) => [e.t, e.voice, e.p]);
  const voices = (t: Track) => [...new Set(t.events.filter((e) => e.layer === 'bass').map((e) => e.voice))];
  const knobs = (t: Track) => voices(t).map((v) => t.knobs?.[v] ?? null);
  const room = (t: Track) => (t.paramOverrides as { bass?: unknown } | undefined)?.bass ?? null;
  return JSON.stringify([bass(a), knobs(a), room(a)]) !== JSON.stringify([bass(b), knobs(b), room(b)]);
}

/** The whole layout of a set, in this build's style unless told another. */
export const setLayout = (masterSeed: string | number, themes = 3, opts: Partial<MixOptions> = {}): SetPlan =>
  setLayoutOf(masterSeed, themes, { ...opts, accompaniment: accompanimentFor(opts), development: developmentFor(opts), style: opts.style || strategyById(opts.strategy).style });

/** Which room theme n of a set is in, without generating it. */
export const presetOfTheme = (
  masterSeed: string | number, n: number, asked = 'auto', style: Style = STYLE,
  spell: Partial<Spell> | null = null,
): Room => presetOfThemeOf(style, masterSeed, n, asked, spell);

/**
 * The spell a set is cast under, read once, the way the bypass is.
 *
 * `?spell=em:0.7,ti:0.3` (or with the birds' full names) names the birds it means and leaves the rest at
 * the house. `?recipe=<id>` names a row of the library instead and rolls a
 * spell inside that row's box — one draw per bird from a stream of its own
 * (`::spell`), which is a new tag and therefore disturbs no die that already
 * exists. Neither is asked for on any path the golden takes, and with neither
 * the answer is `null`, which the layer below reads as the house.
 *
 * Three rows since phase 1 (`src/recipes.ts`): the house, which is the whole
 * record and the measured box round it, and the two rooms, which are the two
 * clusters the same measurement found inside it. A row rolled out of any of
 * them is a spell inside a box and not a house vector, so it is a different
 * record on purpose — it is the only thing in the build that reaches the bias
 * off its identity.
 *
 * `?recipe=auto` is the set planner's own draw, wired **only** behind that
 * word. A recipe's `weight` says how often a planner that draws among rows
 * would reach for it; the default draws no row at all, which is what keeps the
 * golden the golden, and `auto` is there so the draw can be tested without the
 * default having an opinion. Both draws come off `<masterSeed>::spell`, a tag
 * of its own, so nothing that already exists is disturbed either way.
 */
export interface Cast {
  /** the eight birds the set is cast under, or `null` for the house */
  spell: Partial<Spell> | null;
  /** the selected track or motif row; name retained for existing callers */
  track: Recipe | null;
  /** what a readout calls it: the row's own name, or `null` */
  name: string | null;
  /** rows the draw passed over because nothing interprets their scope yet */
  parked: string[];
}

/**
 * **Which rows a draw may reach, and it is a partition and not a filter.**
 *
 * The outside review's trap, in its own words: *"a `picked: false`,
 * `scope: 'layer'` candidate is accepted as the whole set's spell when supplied
 * to that library"* (the outside composition review of 09-19, §4). A
 * layer row is a box about one lane and a seam row is a box about a hand-over;
 * rolling a whole night inside either is reading a sentence as a paragraph. So
 * `auto` draws among **track** rows only, and a row the chef has put down
 * (`picked: false`) is not drawn at all.
 *
 * The other scopes are not dropped: they are **parked by name**, so the console
 * says which rows exist that this build cannot yet place. A `motif` row is the
 * one with somewhere to go — the generator draws a melody family per theme
 * (`src/motif.ts`) — and it is parked here because a melody family is not a
 * night's spell.
 */
export const drawable = (r: Recipe): boolean => r.scope === 'track' && r.picked !== false && weightOf(r) > 0;

/**
 * The whole of what `?spell=` and `?recipe=` asked for: the spell, and the row
 * behind it where there was one.
 *
 * `spellFor` below is this without the row, and it is what every caller that
 * only wants eight numbers still asks. Both make exactly the same draws off
 * exactly the same stream, because one of them is the other.
 */
export function recipesFor(opts: Partial<MixOptions> = {}, library: Recipe[] = LIBRARY): Cast {
  const none: Cast = { spell: null, track: null, name: null, parked: [] };
  if (opts.spell !== undefined || opts.recipe !== undefined) {
    recipeRequest(opts.recipe, accompanimentFor(opts));
    return { ...none, spell: opts.spell ?? null, track: opts.recipe ?? null, name: opts.recipe?.name ?? null };
  }
  // `opts.search` is the query string, for a caller that is not a page: a
  // bench, a check and a URL reach a spell the same way, which is the rule
  // `spellFromQuery` was written under. A page passes nothing and gets its own.
  const named = spellFromQuery(opts.search);
  const id = recipeFromQuery(opts.search);
  if (!id) return { ...none, spell: named };
  const rng = new Rng(`${opts.masterSeed ?? 1}::spell`);
  // **The map the row is read through**, which is the strategy's and not the
  // library's: a row is a box of readings and the map says which dice produce
  // them under *this* machine (`src/calibration.ts`). A strategy with no map —
  // `house-v1`, the record — reads the row exactly as it always did.
  const selectedStrategy = strategyFor(opts);
  // A strategy with no map at all is the v1 identity contract. Otherwise a row
  // captured through interpreter v2.8 replays through the frozen map it was
  // captured under, and every other row needs a map measured on this very
  // generator: with no live map the only one there is is the legacy map, and
  // it is refused as stale rather than borrowed.
  const calibrationFor = (row: Recipe) => {
    const { calibration, legacyCalibration } = selectedStrategy;
    if (!calibration && !legacyCalibration) return null;
    if (LEGACY_INTERPRETERS.test(row.interpreter || '')) return legacyCalibration;
    return requireCurrentCalibration(calibration ?? legacyCalibration,
      opts.style ? generationOf(opts.style) : selectedStrategy.generation);
  };
  const say = (line: string) => { if (typeof console !== 'undefined') console.log(line); };
  if (id === 'auto') {
    // `weightOf` and not `weight`: the share the extraction measured, times the
    // chef's own hand and the listeners' likes (`src/recipe.ts`). At `chef: 0,
    // likes: 0` — which is every row today — it is `weight` to the bit, so this
    // moves no draw until somebody has an opinion.
    const pool = library.filter(drawable).map((r) => ({ v: r, w: weightOf(r) }));
    const parked = library.filter((r) => !drawable(r)).map((r) => `${r.id} (${r.scope})`);
    if (!pool.length) { say('recipe: the library has no track row to draw'); return { ...none, parked }; }
    const row = rng.weighted(pool);
    say(`recipe: drew ${row.id} of ${pool.length}${parked.length ? `, parking ${parked.length}` : ''}`);
    return { spell: named ?? spellFrom(row, rng, calibrationFor(row)), track: row, name: row.name || row.id, parked };
  }
  // A pin reaches the pattern rows as well (`PATTERN_LIBRARY`); the draw above
  // never does, because it reads `library` and the default is `LIBRARY`.
  const row = recipeById(id, library === LIBRARY ? PINNABLE : library);
  if (!row) {
    throw new Error(`Recipe ${id} is not in this build's library`);
  }
  // A pattern row carries no box of its own: the spell it was written for is
  // where it plays, and the link names it. Without one it would roll the
  // house's box through a map this generator has not measured; said in words.
  // A mined pattern still at nought (`CANDIDATE_LIBRARY`'s track rows) is one too.
  if (!named && (PATTERN_LIBRARY.includes(row) || (CANDIDATE_LIBRARY.includes(row) && row.scope === 'track')))
    throw new Error(`${row.id} is a pattern row and plays under the spell it was written for; the link needs spell=`);
  const request = recipeRequest(row, accompanimentFor(opts));
  // A whole theme of `TRACK_LIBRARY` (round GA2) plays at the house's place
  // (`row-places.json`); with no spell on the link it plays at the house, and
  // its mined box — readings — is never rolled as dice.
  if (!named && TRACK_LIBRARY.includes(row)) return { spell: null, track: row, name: row.name || row.id, parked: [] };
  // A motif chooses a phrase, not eight new birds. Explicit birds and a
  // named recipe compose: the birds control the setting, the row keeps its wishes.
  return { spell: named ?? (request.motif || request.pin || request.treatment || request.section ? null : spellFrom(row, rng, calibrationFor(row))), track: row, name: row.name || row.id, parked: [] };
}

export function spellFor(opts: Partial<MixOptions> = {}, library: Recipe[] = LIBRARY): Partial<Spell> | null {
  return recipesFor(opts, library).spell;
}
// The earliest instant the transport may put a sound at.
//
// `ctx.currentTime` is not the render head. The renderer has already filled
// the device's buffer up to `outputLatency + baseLatency` past the clock the
// main thread can read, and `resolveStart` — rightly — refuses to schedule
// anything behind that head, moving it forward and counting it late. A start
// that mapped the position it was resuming from onto `currentTime + 0.15`
// therefore put it *behind* the head on any device whose buffer is deeper than
// 147 ms — and the 'playback' hint this page asks for is a request for a deep
// one. MEASURED: headless Chromium hands out 64 ms over a 21 ms block on an
// idle machine and 216 over 21 on a busy one, WebKit 22 ms idle and 160 busy,
// and `?latency=0.3` asks for 280 over 171. So the fault came and went with
// the load on the machine, which is why a minute played by the suite never
// showed it and a hand on the bench did: the first 87 ms of the resumed record
// were already behind the head, and whatever the theme had in that window —
// one or two notes at a pause, the whole downbeat stack of seven on a cold
// start — was pushed forward by `resolveStart` and written into the bench's
// log as a stumble. It was not a stumble: nothing was late, the transport had
// aimed behind the head.
//
// Everything the transport starts is aimed here instead: the head plus a
// stated lead, so the first events are scheduled ahead of the head exactly
// like every other event. The lead only has to cover the main thread between
// this instant being taken and the first pump reaching those events — a
// deck's graph built, its curves written, a blend rebuilt, the clock started,
// which MEASURED is 5 to 21 ms — and 120 ms is `LOOKAHEAD`, the scheduler's
// own reach, the same margin every other event gets. It is a *delay* before
// sound resumes, not a skip: the position resumed from is still the position
// that was paused at, and on a device with a small buffer the wait is 145 ms
// where it was 150.
export const START_LEAD = 0.12;

/**
 * **A start, timed** (K42): a `performance.mark` at each step a first Play
 * waits on — the context's resume, the master, the first theme's plan and
 * compile, its voices, the deck's first fill — so a bench (and the
 * Performance panel) can read where the wait between a hand and the first
 * sound goes. Named `dh:` and nothing else; a runtime with no marks is left alone.
 */
export function startMark(name: string, detail?: unknown): void {
  try { if (typeof performance !== 'undefined' && performance.mark) performance.mark('dh:' + name, detail === undefined ? undefined : { detail }); } catch (e) { /* none */ }
}

// What a start anchors to, which is not quite what the machine says.
// `renderHead` is the truth as reported, and on a cold start it under-reports:
// Chromium leaves `outputLatency` at nought until audio actually flows, so a
// head read in the same breath as the resume is short by the whole output
// buffer. MEASURED on the 'playback' hint at ?latency=0.3: 0.1707 s when the
// start is made and 0.4267 s fifty milliseconds later — a 256 ms hole where
// START_LEAD is 120, which is why a cold start on a deep buffer wrote late
// notes and a warm one never did.
//
// Two answers, and a start uses both. The transport waits for a real head
// before it computes this (`settleHead` in control.ts), and what it reads then
// is floored here for an engine that reports no output latency at all: a
// device on the 'playback' hint does not hand out a buffer smaller than the
// one it has already declared, and on every engine measured here the output
// buffer is one to two of those — Chromium 0.256 s against a 0.1707 s base,
// which is 1.50. The floor takes that 1.5 and nothing more, so a machine that
// does report is left exactly where it was and one that never does is no
// longer anchored short.
const OUT_OF_BASE = 1.5;
export const anchorHead = (ctx: AudioContext) => {
  const { out, base } = latencies(ctx);
  return ctx.currentTime + base + Math.max(out, base * OUT_OF_BASE);
};
// **And past the clock's own step** (the UI-fix round of 10-11). A context's
// clock does not advance smoothly: on a deep buffer it can jump a whole device
// buffer at once. MEASURED on ?latency=0.3 in headless Chromium (a 171 ms
// buffer): `currentTime` moved 0.171 s in 8.4 ms of the page's own time
// between a start's anchor and its first pump, so the notes a start sounds at
// its very instant — those a start inside the theme finds sounding (D1b) —
// landed 8-78 ms behind the head on five or six of eight runs of ten starts,
// where 2.0.0's first notes stood a beat's fraction later and hid it. The lead
// is a buffer and the work of a first pump past the anchor, never under the
// 120 ms it was: unchanged on every buffer under 70 ms (Chromium's own 21 ms,
// WebKit's 3 ms), 221 ms on that deep one.
const STEP_MARGIN = 0.05;
export const startLead = (ctx: AudioContext) => Math.max(START_LEAD, latencies(ctx).base + STEP_MARGIN);
export const startAt = (ctx: AudioContext) => anchorHead(ctx) + startLead(ctx);

// How long the position being left takes to go, when a hand asks for another.
// It begins a hair before the landing and runs a quarter of a second past it:
// see the note in `seek` for what it is covering and what it measured.
export const SEEK_FADE = 0.25;

// A phrase, in bars (`PHRASE_BARS`, `performance.ts`): the line a spell set
// mid-set hands over on.
//
// Four, and not the sixteen a planned seam lands on: a hand-over the
// arrangement chose has a whole theme to be in the right place in, and a hand
// that has just moved a bird is owed an answer inside a few seconds rather than
// inside forty. It is the same four `seamPlan` falls back to when a theme is
// too short for a sixteen-bar line and the same four a seek re-arms on, and it
// was written here and there as its own 4 until round (f) of the reconciled
// review of 09-24 (D34) put it beside `seamPlan`, the lowest of the three.

// What a stop sounds like: the decks come down over this ramp, and nothing is
// disconnected until it has been heard and the tail behind it — the limiter's
// look-ahead delay, the delay line, the reverb's own decay — has run out.
export const STOP_FADE = 0.06;
const STOP_SILENT_MS = 400;

/**
 * A set, playing. The facade: everything the interface does to the transport it
 * does through the object this returns, and everything it reads it reads off
 * `state`.
 *
 * The round E split is a rule as much as a layout: nothing in here works out
 * where a seam falls, what a curve is, or which events are in a window. It
 * decides *when* — when a theme is planned, when a deck is built, when a
 * hand-over begins, when one is abandoned, and whether the start that is
 * finishing is still the start that was asked for.
 *
 * @param ctx — a set is played, so this is a live context and never an offline
 *   one; the render below is the offline half.
 */
/**
 * **What a set is planned under**, resolved from what it was asked: the
 * strategy, the set's own numbers, the seed, the bypass and the spell. One
 * function, so a set (`createMix`) and the first theme planned ahead of one
 * (`primeStart`) resolve the same options in the same order; `loud` is the set
 * announcing what it is under, which a plan made ahead never does.
 */
function setUp(opts: Partial<MixOptions>, loud: boolean) {
  const say = (line: string) => { if (loud && typeof console !== 'undefined') console.log(line); };
  // Which music, before anything else: a strategy is the outermost choice a set
  // makes, and everything below — the set's own numbers, the master's room, the
  // spell, every plan — is made inside it. Nothing asked for is `house-v1`.
  const strategy = strategyFor(opts);
  const o = setOptions(opts.style || strategy.style, opts);
  o.strategy = strategy.id;
  o.accompaniment = accompanimentFor(opts);
  o.development = developmentFor(opts);
  if (strategy.id !== DEFAULT_STRATEGY) say(`strategy: ${strategy.id} (${strategy.label})`);
  const masterSeed = String(opts.masterSeed ?? 1);
  // A bypass is read once, announced once, and then lives in every theme's
  // audio overrides. The master is built after it is applied, so a bypassed
  // limiter or clipper is really bypassed.
  const bypass = opts.bypass !== undefined ? opts.bypass : readBypass();
  if (bypass) say('bypass: ' + bypass.label);
  // The spell, read once and then carried by every theme this set plans. At the
  // house — which is where a set with nothing asked of it sits — the bias above
  // the dice is the identity and every plan is the plan it always was.
  const cast = recipesFor({ ...opts, masterSeed });
  o.spell = cast.spell;
  // The row travels with the set, so every theme it plans is planned under the
  // same `wants` (`src/interpret.ts`). `null` on every path the golden takes.
  o.recipe = cast.track;
  if (o.spell && !isHouse(o.spell)) say('spell: ' + Object.entries(o.spell).map(([k, v]) => `${k} ${(+v).toFixed(3)}`).join(', '));
  return { o, masterSeed, bypass, cast };
}

/** A theme's place as a plan made ahead names it: the same six a set's `Place` has. */
interface PrimedPlace {
  seed: string;
  index: number;
  strategy: string;
  style: Style;
  spell: Partial<Spell> | null;
  recipe: Recipe | null;
}
// A row is its resolved definition here as everywhere (`definitionOf`, R02 of
// the review of 10-03): a plan made ahead from one revision of a row is
// never handed to a set asked for another revision of the same id.
const samePrimedPlace = (a: PrimedPlace, b: PrimedPlace) => a.seed === b.seed && a.index === b.index && a.strategy === b.strategy
  && a.style === b.style && sameSpell(a.spell, b.spell) && definitionOf(a.recipe) === definitionOf(b.recipe);
/** What a set was asked, as one string: the options a page hands `createMix`, the room's bypass beside them. */
const askedKey = (opts: Partial<MixOptions>, bypass: Bypass | null): string =>
  JSON.stringify(opts, (k, v) => (k === 'destination' || k === 'lookahead' ? undefined   // the scheduler's, not the plan's
    : k === 'recipe' && v && typeof v === 'object' ? `#${definitionOf(v as Recipe)}` : v)) + '|' + (bypass ? bypass.label : '');

/**
 * **The first theme, planned and compiled before the hand asks for it** (K42).
 * A first Play waited on the plan and the compile of the theme it opens on —
 * MEASURED 15 ms on this machine and four times that on a phone — and nothing
 * about either needs a context, so the page asks for it in an idle slot after
 * it has drawn (`primeStart`), and the set that is then started takes the very
 * plan it was going to make: the same options resolved by the same `setUp`, the
 * same `planTheme` call `planAt` makes, so what plays is what would have played.
 * One plan, taken once: a set that starts somewhere else, under anything else
 * asked, plans for itself as it always did, and a plan is never handed to two
 * sets (a set re-seasons its own notes).
 */
let primed: { key: string; preset: string | undefined; place: PrimedPlace; track: SetTrack } | null = null;
/** the prime last asked of the planner's worker: only its answer is taken */
let primeAsk = 0;
export function primeStart(opts: Partial<MixOptions>, index: number): boolean {
  if (opts.style) return false;   // a stated style is a bench's, and is planned where it is played
  try {
    const { o, masterSeed, bypass } = setUp(opts, false);
    const key = askedKey(opts, bypass);
    const place: PrimedPlace = {
      seed: masterSeed, index: Math.max(0, index), strategy: o.strategy ?? DEFAULT_STRATEGY, style: o.style,
      spell: o.spell ?? null, recipe: o.recipe ?? null,
    };
    if (primed && primed.key === key && primed.preset === o.preset && samePrimedPlace(primed.place, place)) return true;
    const ask = { ...o, style: place.style, strategy: place.strategy, spell: place.spell, recipe: place.recipe };
    // **Off the page's thread** where the planner's worker is (the planning perf
    // round, 10-12): planned and compiled there, and made ready to take when it
    // lands — the last ask's, so a ring moved again meanwhile primes its own.
    const offer = planOffThread(place.seed, place.index, ask, { bypass, program: true, priority: 'ahead' });
    if (offer) {
      const mine = ++primeAsk;
      void offer.then((track) => { if (mine === primeAsk) primed = { key, preset: o.preset, place, track }; }, () => {});
      return true;
    }
    const track = applyBypass(planTheme(place.seed, place.index, ask), bypass);
    programOf(track);
    primed = { key, preset: o.preset, place, track };
    return true;
  } catch (err) {
    // the start plans for itself, and says whatever it has to say then
    primed = null;
    return false;
  }
}
/** The plan made ahead, if it is this one: taken, so no other set is handed it. */
function takePrimed(key: string, preset: string | undefined, p: PrimedPlace): SetTrack | null {
  if (!primed || primed.key !== key || primed.preset !== preset || !samePrimedPlace(primed.place, p)) return null;
  const track = primed.track;
  primed = null;
  return track;
}

export function createMix(ctx: AudioContext, opts: Partial<MixOptions> = {}) {
  startMark('mix');
  const { o, bypass, cast, masterSeed: seed } = setUp(opts, true);
  /** what this set was asked, for the plan a page made ahead of it */
  const asked0 = askedKey(opts, bypass);
  // **The seed of the set that is playing**, and not of the set that has been
  // asked for. Since 09-19 a cast is a hand-over rather than a stop (Eugene:
  // "once the machine is started it never stops"), so for the length of a blend
  // there are two sets up: this is the one under the needle, and it changes at
  // the swap — the same instant the theme index and the readout change hands.
  let masterSeed = seed;
  const destination = opts.destination || ctx.destination;

  // The master is the *set's* room, not a theme's: two decks pass through one
  // of these at a seam, so it can belong to neither. It used to be built on
  // whatever the last theme planned had left in the table, which made the
  // record's presence and air depend on the order things happened to be worked
  // out in. Said out loud instead: the set's own preset when it was asked for
  // one, and when it was asked for `auto` the preset theme zero of this seed
  // rolls — one room for the night, decided by the seed — with the bypass over
  // the top so a bypassed limiter or clipper really is bypassed.
  const masterPreset = presetOfTheme(masterSeed, 0, o.preset, o.style, o.spell);
  // Said as a value rather than as a side effect: the set's room, the bypass
  // over it, resolved once and held for the life of the set.
  let masterSettings = resolveSettings({ base: o.style.base, room: masterPreset.params, bypass: bypass && bypass.params });
  const master = makeV1Master(ctx, masterSettings);
  master.out.connect(destination);
  startMark('master');
  // **The limiter's processor, heard failing** (K33, the held-errors audit of
  // 09-26): a worklet that throws goes silent and says nothing anywhere. It is
  // the most serious fault the set can have, so it is a ledger line and a report.
  const limiterNode = master.nodes.limiter;
  if (typeof AudioWorkletNode !== 'undefined' && limiterNode instanceof AudioWorkletNode) {
    limiterNode.addEventListener('processorerror', () => note('fault', 'the limiter\'s processor threw', { node: 'lookahead-limiter' }));
  }
  // **The output at full scale, whether or not anybody is looking** (S16): the
  // processor measures it past the clipper and the trim and posts at most once
  // a second; the ledger's `clip` line is written here and nowhere else.
  const limiterPort = master.nodes.limiterPort;
  if (limiterPort) {
    const clipLine = outputClipWriter();
    limiterPort.addEventListener('message', (e: MessageEvent) => { clipLine(e.data); });
  }
  const mixOut = ctx.createGain();
  mixOut.gain.value = 1;
  mixOut.connect(master.input);
  /**
   * **The master's room belongs to the seed, and a cast brings the arriving
   * seed's** (the reconciled review of 09-24, R23; Eugene's question 8). It was
   * resolved once from the first seed and a cast never changed it, so the sound
   * of a seed depended on how it was reached: seed 20 fresh plays 1.5 dB of
   * master air, and 1.0 dB reached by a cast from seed 1 — which a copied link
   * cannot reproduce. At the swap that turns the seed over, the tone of the
   * master — its five bands, its gain and its trim — is walked to the arriving
   * seed's room over a bar, through each parameter's line; the limiter and the
   * clipper are the one shared ceiling and stay as they are.
   */
  const masterLines = new Map<string, Line>();
  function retuneMaster(p: Place): void {
    const room = presetOfTheme(p.seed, 0, o.preset, p.style, p.spell);
    const next = resolveSettings({ base: p.style.base, room: room.params, bypass: bypass && bypass.params });
    const M = next.master;
    // The five gains are the master's profile (round E1) and walk through the
    // master's own lines; the corners, the widths, the gain and the trim here.
    const moves: Array<[string, number]> = [
      ['lowShelf.frequency', M.lowShelfHz],
      ['lowMid.frequency', M.lowMidHz], ['lowMid.Q', M.lowMidQ],
      ['mid.frequency', M.midHz], ['mid.Q', M.midQ],
      ['presence.frequency', M.presenceHz], ['presence.Q', M.presenceQ],
      ['air.frequency', M.airHz],
      ['master.gain', M.gain], ['trim.gain', M.trim],
    ];
    const at = ctx.currentTime;
    const over = current ? current.program.barSeconds : 2;
    master.setProfile(eqProfileOf(M), at, over);
    for (const [path, v] of moves) {
      const param = master.param(path) as unknown as Parameters<typeof rampLine>[1] | null;
      if (!param || !Number.isFinite(v)) continue;
      let l = masterLines.get(path);
      if (!l) { l = rampLine(ctx, param, param.value); masterLines.set(path, l); }
      try { l.to(v, at, over); } catch (e) { /* gone */ }
    }
    // the processor measures the output past the trim, so it is told the new one
    if (limiterPort && Number.isFinite(M.trim)) limiterPort.postMessage({ post: { gain: M.trim } });
    masterSettings = next;
  }

  /**
   * **The master's tone follows the theme** (round E1, `eqByTheme`): where the
   * arriving theme's style says so, the five gains walk to the profile its own
   * settings carry -- its room's, moved by the nearest row of the places' EQ
   * table -- over `over` seconds from `at`. A bird moved mid-play plans the next
   * theme, so it reaches the tone here, at that theme's boundary, and never
   * mid-theme. The ledger carries the five numbers whenever they move. Under a
   * style without the switch (house-v1) the tone is the set's room, as it
   * always was, and nothing here writes a thing -- unless the engine was just
   * handed back from one that follows, and then it walks home to the set's
   * room under that style.
   */
  let toneFollowed = false;
  function toneOfTheme(d: Deck, at: number, over: number): void {
    const style = d.track.style as Style;
    const follows = switchOn(style, 'eqByTheme');
    if (!follows && !toneFollowed) return;
    toneFollowed = follows;
    const to = follows ? eqProfileOf(d.settings.master)
      : eqProfileOf(resolveSettings({ base: style.base, room: presetOfTheme(masterSeed, 0, o.preset, style, o.spell).params, bypass: bypass && bypass.params }).master);
    const was = master.profile();
    master.setProfile(to, at, over);
    if (EQ_BANDS.every((b) => Math.abs(was[b] - to[b]) < 1e-9)) return;
    masterSettings = resolveSettings({ base: masterSettings as unknown as Parameters<typeof resolveSettings>[0]['base'], overrides: { master: to } });
    note('theme', 'the master\'s tone moves to the theme\'s', {
      lowShelfDb: +to.lowShelfDb.toFixed(2), lowMidDb: +to.lowMidDb.toFixed(2), midDb: +to.midDb.toFixed(2),
      presenceDb: +to.presenceDb.toFixed(2), airDb: +to.airDb.toFixed(2), bars: +(over / d.program.barSeconds).toFixed(2),
    });
  }

  /**
   * **The limiter's release follows the theme** (the liquid bass rounds, 10-07): a place may
   * ask the master limiter to let go sooner (`limiterReleaseMs`, written into the theme's
   * room), which a theme's own render plays; the shared master is told so when such a theme
   * becomes the one under the needle, and told back when the next is not. The house's rooms
   * all say the base's 200 ms, so under them nothing is ever posted.
   */
  let masterRelease = masterSettings.master.limiter.releaseMs;
  function releaseOfTheme(d: Deck): void {
    const ms = d.settings.master.limiter.releaseMs;
    if (!(typeof ms === 'number' && ms > 0)) return;
    if (ms !== masterRelease && limiterPort) limiterPort.postMessage({ releaseMs: ms });
    masterRelease = ms;
    if (masterSettings.master.limiter.releaseMs !== ms)
      masterSettings = resolveSettings({ base: masterSettings as unknown as Parameters<typeof resolveSettings>[0]['base'], overrides: { master: { limiter: { releaseMs: ms } } } });
  }

  // The sum's written history: the seam dips it and a seam abandoned brings it
  // back, and the second has to know where the first had got to.
  const sumLine = rampLine(ctx, mixOut.gain, 1);

  let n = 0;
  // The set's own grid. It is made when the first theme is known; until then
  // there is no tempo to keep.
  let clock: SetClock | null = null;
  let current: Deck | null = null;
  let incoming: Deck | null = null;
  let sourceMix: SourceMix | null = null;
  // **The desk's stage moves are laid on where a graph is built, and only
  // there** (PLAN-DESK D2): the deck's graph is built from the program's room
  // with them on (`withStage`, the very same object while nothing is moved),
  // and everything else of the deck — its voices, its curves, its room — reads
  // the program's own. So a cast, a stop and a start, or the next theme
  // arrives with the moves already in its stage.
  function sourceDeck(...args: Parameters<typeof makeDeck>): Deck {
    const [c, track, program, out, m, clk, atTime, perBeat] = args;
    // the arriving deck's graph, where `ahead` built it for this plan (`makeDeck` takes it only where it fits);
    // one built for another plan is let go, and `ahead` builds again for the next seam
    const built = arrival && arrival.track === track ? arrival.built : null;
    if (built) arrival = null; else dropArrival();
    const deck = makeDeck(c, track, program, out, m, clk, atTime, perBeat, withStage(program.settings), built);
    if (sourceMix) deck.graph.setSourceMix(sourceMix);
    return deck;
  }
  /**
   * **The arriving deck's graph, built ahead** (the engine review of 10-08,
   * F4): the record's own seam is known a theme ahead, and its deck's graph —
   * sixty-odd nodes, two convolvers and the returns, 20 to 27 ms of the seam's
   * tick on this Mac — is built by `ahead` in an idle slot in the seconds before
   * the seam rather than on the tick that arms it. It is the graph `makeDeck`
   * would build there, from the same plan, room, grid tempo and first bar
   * line, and `makeDeck` takes it only where every one of those still holds; a
   * graph a move or a ride made stale is let go and the tick builds its own.
   */
  let arrival: { track: SetTrack; built: DeckGraph } | null = null;
  const BUILD_AHEAD_S = 3;
  /** A start nearer its seam than this plans the next theme on the spot (the planning perf round). */
  const NEXT_NOW_S = 20;
  function dropArrival(): void {
    if (arrival) arrival.built.graph.dispose();
    arrival = null;
  }
  function buildArrival(): void {
    if (!current || transition || incoming || !nextPlan || !clock) return;
    const { at } = seamOfRecord();
    const point = deckContextTime(current, at);
    // not yet in reach, or already the tick's to arm
    if (point - ctx.currentTime > BUILD_AHEAD_S || point <= startAt(ctx)) return;
    // a far ride is laid first, as the tick lays it, and the grid it leaves is the one the graph is built on
    const rule = rode.get(current) ?? seamTempo(heardBpm(current, point), nextPlan.bpm, o, freeSides(current.track, nextPlan));
    if (rule.ride > 0 && !rode.has(current)) return;
    // A seam with a free side builds the arriving graph on the arriving theme's own tempo: a free one has no other,
    // and out of a free theme the grid jumps to the metered one's at the blend (`beginTransition`).
    const free = rule.kind === 'free';
    const program = compiled(nextPlan), settings = withStage(program.settings), perBeat = free ? 1 : (current.perBeat ?? 1) * rule.perBeat;
    const bpm = free ? program.bpm : (60 / clock.spbAt(clock.beatAt(point))) * perBeat;
    const had = arrival;
    if (had && had.track === nextPlan && Math.abs(had.built.when - point) <= 1e-9 && Math.abs(had.built.bpm - bpm) <= 1e-9 * bpm && had.built.settings === settings) return;
    dropArrival();
    arrival = { track: nextPlan, built: deckGraph(ctx, program, master, free ? null : clock, point, perBeat, settings) };
  }

  let retiring: Deck | null = null; // the theme that has handed over and is playing out
  // ...and until when: the end of the blend that retired it. A hand-over
  // asked for inside that tail leaves the tail to finish (round MIX-X1), so
  // the instant is the deck's own and not the transition's.
  let retiringUntil = 0;
  // The decks whose own seam has had its far ride laid, and the rule it was
  // laid under: the natural seam's ride is laid as the horizon reaches its
  // first bar and the blend is armed later, on the same rule.
  const rode = new WeakMap<Deck, SeamTempo>();
  // The tempo a deck is heard at, at a context instant: the grid's, times the
  // beats of the theme a beat of it carries.
  // A free deck is heard at its own nominal tempo, whatever the grid is doing: it is not on it.
  const heardBpm = (d: Deck, at: number): number => (freeDeck(d) ? d.program.bpm : (60 / clock!.spbAt(clock!.beatAt(at))) * (d.perBeat ?? 1));
  /**
   * **The hand-over in flight**: where it begins, swaps and ends on the
   * context's clock, and what it does with the tempo (`seamTempo`) — `ride`
   * being the bars the grid was really ridden over before the blend, which a
   * theme too near its end to ride leaves at nought. The rule was a second
   * variable beside this one until round MIX-X1; it is the hand-over's.
   */
  let transition: (ReturnType<typeof scheduleTransition> & { rule: SeamTempo; hand: HandSeamBars | null }) | null = null;
  /**
   * **The hand-over in flight as one wait** (round MIX-X1): asked when, the
   * low end changing hands when, the tempo fully heard when — the ride, the
   * blend and the glide after it in one number — on the context's clock. Set
   * at the ask from the line the move will take, made exact when the seam is
   * laid, moved again only by a genuine re-plan, and gone once everything it
   * named has been heard. A face reads the whole of a bird's wait off it and
   * never extrapolates from a value it sampled.
   */
  let wait: MixWait | null = null;
  let waitPlan = 0;
  let timer: (() => void) | null = null;
  let running = false;
  // **The start's lead** (K42): the context instant the record's first moment
  // is laid at, and the second of the theme it is. Until the clock gets there
  // the set says so (`leading`, `leadFrom`), and a face holds its needle where
  // the set was started from; any move made in the meantime ends it.
  let leadUntil = 0;
  let leadFrom = 0;
  const listeners = new Set<(state: MixState) => void>();
  let nextPlan: SetTrack | null = null;
  // A start is a chain of awaits — a context to resume, a theme's voices to
  // render — and a stop that lands inside one has to cancel it rather than let
  // it finish into a set nobody is holding. Every start takes a token; a stop,
  // or a second start, invalidates it, and the continuation after each await
  // asks whether it is still the one that was asked for.
  let startToken = 0;
  let dead = false;
  // The same discipline for a move as for a start. A skip, a back, a seek, a
  // cast and a spell all wait for the landing to be built before they touch a
  // deck, and a wait is a place a second gesture can arrive in:
  // every move takes the next number and the continuation after the await asks
  // whether it is still the move that was asked for.
  let moveToken = 0;
  // Where a seek has been told to be while its landing is being built. The
  // transport has been asked to be there, so that is what it reports; without
  // it the cursor fell back to the old position for a frame and then jumped.
  // It belongs to the seek that set it, and whatever supersedes that seek
  // clears it (`supersede`): a seek overtaken by a skip used to leave the
  // elapsed time reading the target for good (R21).
  let seekingTo: number | null = null;

  // --- where the set is, and where it has been asked to go -------------------
  //
  // **A move is one request with its destination named in full** (the
  // reconciled review of 09-24, §4 (a), and its first recommended fix). The seed,
  // the theme of it, the engine, the spell and the recipe are one value, a
  // `Place`: every theme this set plans is planned *at* one and remembers it
  // (`placed`), and the swap turns the set over to the place of the theme that
  // has just arrived — whatever asked for it, whichever move was overtaken on
  // the way. Until now the swap was recognised by a side table of five
  // `arriving*` fields written a turn after the ask, and every way of
  // abandoning a move left some of them behind: a spell set during a cast
  // planned from the old seed and was labelled with the new one (R9), a seek
  // left `casting` true for good (R20), a pull overtaken by a skip was never
  // armed and never played (R10), and an engine switch taken back while it was
  // preparing was ignored (R22).

  /** Where a set is or is going: the theme, and everything it is planned under. */
  interface Place {
    seed: string;
    index: number;
    strategy: string;
    style: Style;
    spell: Partial<Spell> | null;
    recipe: Recipe | null;
    /** how far a library turn's row may leak (round D1): one more field of the ask the plan reads, as the spell is */
    reach: number;
  }
  const placed = new WeakMap<SetTrack, Place>();
  // **A row is its resolved definition** (`definitionOf`, as a plan made ahead
  // is matched, R02 of the review of 10-03): a new revision of a row, or a desk
  // edit of it, under the same id is another place, and a plan made from the
  // old one is never handed out for it (the deep review of 10-08).
  const sameRow = (a: Recipe | null, b: Recipe | null) => a === b || definitionOf(a) === definitionOf(b);
  const samePlace = (a: Place, b: Place) => a.seed === b.seed && a.index === b.index && a.strategy === b.strategy
    && a.style === b.style && sameSpell(a.spell, b.spell) && sameRow(a.recipe, b.recipe) && a.reach === b.reach;
  /** the definition of the row a plan was made from, read when it was made: a row edited in place since is another row */
  const placedRow = new WeakMap<SetTrack, string | null>();

  /**
   * **What a hand has asked of the set's sound, and nothing has played yet**:
   * the last pull, and the last engine switch, each taken at the ask. They
   * apply to every theme planned from then on that is not yet sounding — the
   * next one of the set, a skip's landing, a cast's — and each is spent at the
   * swap that brings a theme planned under it. So a pull overtaken by a skip is
   * carried by the skip, and one overtaken by a seek by the next seam, rather
   * than stranded while the ring holds the bird.
   */
  let spellWanted: Partial<Spell> | null | undefined;
  /** and a reach asked (round D1): a pull of its own, spent the same way */
  let reachWanted: number | undefined;
  let engineWanted: { strategy: string; style: Style } | null = null;

  /**
   * **Where the hand has asked the transport to be** — the place it is aiming
   * at, whatever the music has reached.
   *
   * Step 1c, Eugene 09-19: *"no cut guard on next/previous/dice; a press during
   * a blend retargets it."* A press moves the aim and not the index, `null`
   * meaning *the aim is wherever the music is heading*, so five nexts inside a
   * second aim five ahead and the hand-over goes there — one hand-over if the
   * presses are quicker than a landing takes to build, a chain of them on the
   * beat if they are not, and in neither case a stop. A cast moves it too, at
   * the ask: a next pressed while a cast is being built counts from the theme
   * the new set arrives on rather than stopping the set (R7).
   *
   * It is cleared at the swap that reaches it (`promote`) and by a seek, which
   * is a move inside the record and says the hand is where it is.
   */
  let aim: Place | null = null;

  /** The move in flight, while it waits for its landing: which one, and its number. */
  let moving: { token: number; kind: 'cut' | 'cast' | 'spell' | 'engine' | 'seek' } | null = null;

  /**
   * Cancel whatever move is in flight, completely: it will find its number has
   * moved on and touch nothing, and what it had claimed for itself goes with
   * it. The one door every move comes in by.
   */
  function supersede(kind: NonNullable<typeof moving>['kind'] | null = null): number {
    leadUntil = 0;
    // **And what it had asked for goes too** (the deep review of 10-08). A
    // move plans its landing and asks its wait before it waits for the landing
    // to be built; overtaken there — a seek inside a pull's or a cast's
    // preparation — it used to leave both behind, and the record's own next
    // seam handed over into that plan: the pull's theme entering at its own
    // outro, the abandoned cast's seed arriving a minute later, and the ring
    // drawing a wait for a hand-over nobody was building. A wait not yet laid
    // is only ever a move's in flight; the set's next theme is planned again,
    // off the tick.
    if (moving && moving.kind !== 'seek' && !incoming) {
      nextPlan = null;
      // a move asked now names its own; a seek or a stop names none
      if (!kind || kind === 'seek') planAhead();
    }
    if (wait && !wait.laid) wait = null;
    moveToken += 1;
    seekingTo = null;
    moving = kind ? { token: moveToken, kind } : null;
    return moveToken;
  }

  const emit = () => {
    if (!listeners.size) return;
    const s = state();
    for (const fn of listeners) fn(s);
  };

  // Planning is pure: `generate` resolves its own room and writes to nothing,
  // and the bypass is folded into the plan's own overrides rather than into
  // anything live, so working out a theme never changes what is playing.
  //
  // Every theme is planned at a place, and the place is remembered beside it:
  // that is how the swap knows what the set has become.
  //
  // The last few are kept: a move plans its landing at the ask and asks again
  // after the wait, and a cast names what it is arriving at in the ledger
  // before the move is made, and each of those is the same theme.
  //
  // Six, since the theme after the one arriving is planned ahead during a blend
  // (`ahead`) and has to still be here at the swap.
  const recent: Array<{ track: SetTrack; preset: string | undefined }> = [];
  // the reach the set was made at: a plan made ahead of it was made there (round D1)
  const reach0 = reachOf(o.reach);
  /** A theme already planned at this place, or null: a lookup, never a plan. */
  function plannedAt(p: Place): SetTrack | null {
    const row = definitionOf(p.recipe);
    for (const r of recent) if (r.preset === o.preset && samePlace(placed.get(r.track)!, p) && placedRow.get(r.track) === row) return r.track;
    return null;
  }
  /** The request a place is planned under: the set's own options, the place's over them. */
  const askAt = (p: Place): Partial<MixOptions> => ({ ...o, style: p.style, strategy: p.strategy, spell: p.spell, recipe: p.recipe, reach: p.reach });
  /** A plan made at a place, kept: the set will be asked for it by its place. */
  function keep(p: Place, track: SetTrack, preset: string | undefined): SetTrack {
    placed.set(track, p);
    placedRow.set(track, definitionOf(p.recipe));
    recent.unshift({ track, preset });
    if (recent.length > 6) recent.pop();
    return track;
  }
  function planAt(p: Place): SetTrack {
    const had = plannedAt(p);
    if (had) return had;
    // asked while a move finds out what its landing needs: named, and planned off the thread (`landingOff`)
    if (probing) { probing.push(p); throw MISSED; }
    // A plan the tick had to make for itself: a seam that arrived before the
    // idle slot planning its theme did. Counted, so a scenario can say none did.
    if (ticking) tickWork += 1;
    const track = (!running && p.reach === reach0 && takePrimed(asked0, o.preset, p)) || applyBypass(planTheme(p.seed, p.index, askAt(p)), bypass);
    return keep(p, track, o.preset);
  }

  // --- planning off the page's thread -----------------------------------------
  //
  // **A move's landing is planned in the planner's worker** (the planning perf
  // round, 10-12; `src/plan-off-thread.ts`). A pull planned its theme on this
  // thread inside the hand's own task — 50 to 130 ms for the Drum & Bass tile,
  // with the scheduler pumping notes from the same thread — and so did a cast's
  // landing and the set's next theme in its idle slot. Now a move asks the
  // worker for every plan its destination will need, waits for them, and then
  // goes on exactly as it did: `planAt` finds each one by its place. The wait
  // is a move's own (`supersede`'s token guards it as it guards the landing's
  // voices), so a second gesture inside it overtakes it as it always could.
  // Where there is no worker every plan is made here, as before.
  //
  // What a destination needs is found by asking it: `resolve` is run with
  // `planAt` naming each place it has no plan for (`probing`) instead of
  // planning it, those are planned off the thread, and it is asked again —
  // a pull in the outro asks for the theme in place first and then the next.
  const MISSED = new Error('a plan this thread has not made yet');
  let probing: Place[] | null = null;
  /** Plan these places in the worker and keep them as they land; null where the worker cannot take one. */
  function offThread(places: Place[], how: OffThreadHow = {}): Promise<void> | null {
    const preset = o.preset;
    const offers: Array<Promise<unknown>> = [];
    for (const p of places) {
      if (plannedAt(p)) continue;
      // the room's bypass folded in, and the program compiled, there: a landing is compiled before it is built
      const offer = planOffThread(p.seed, p.index, askAt(p), { ...how, bypass, program: true });
      if (!offer) return null;
      // a plan this thread made meanwhile is the one kept; one that failed is made here when it is asked for
      offers.push(offer.then((track) => { if (!dead && preset === o.preset && !plannedAt(p)) keep(p, track, preset); }, () => {}));
    }
    return Promise.all(offers).then(() => {});
  }
  /** The places `resolve` would plan, and the place it names, that have no plan yet: found without planning any. */
  function missingFor(resolve: () => Place): Place[] {
    const missing: Place[] = [];
    probing = missing;
    try { planAt(resolve()); } catch (err) { if (err !== MISSED) return []; } finally { probing = null; }
    return missing;
  }
  /** Those places planned off the thread, and `resolve` asked again until it has them all (or the worker cannot). */
  async function landingOff(resolve: () => Place, missing: Place[]): Promise<void> {
    for (let round = 0; round < 3 && missing.length; round++) {
      const off = offThread(missing);
      if (!off) return;
      await off;
      missing = missingFor(resolve);
    }
  }
  /** The set as it is: the record's place. */
  const here = (): Place => ({
    seed: masterSeed, index: n, strategy: o.strategy ?? DEFAULT_STRATEGY, style: o.style,
    spell: o.spell ?? null, recipe: o.recipe ?? null, reach: reachOf(o.reach),
  });
  /** The place of a theme this set planned, or where it is if it did not plan it. */
  const placeOf = (track: SetTrack | null | undefined): Place => (track && placed.get(track)) || here();
  /** Where the music is going on its own: the theme arriving, or the record. */
  const heading = (): Place => (incoming ? placeOf(incoming.track) : here());
  /** A place, under what the hand has asked of the sound since. */
  const wish = (p: Place): Place => ({
    ...p,
    ...(spellWanted !== undefined ? { spell: spellWanted } : {}),
    ...(reachWanted !== undefined ? { reach: reachWanted } : {}),
    ...(engineWanted ? engineWanted : {}),
  });
  /** An aim no hand-over has taken up yet: a cut or a cast still being built. */
  const pendingAim = (): Place | null =>
    (aim && !(incoming && placeOf(incoming.track).seed === aim.seed && placeOf(incoming.track).index === aim.index) ? aim : null);
  /** Where a press counts from: what is aimed at, or where the music is heading. */
  const from = (): Place => aim ?? heading();
  /** What the hand has asked for, as a place: where a move now would take the set. */
  const asked = (): Place => wish(pendingAim() ?? heading());
  /** The seasoning the hand has asked for: the last pull, or the set's own. */
  const wanted = (): Partial<Spell> | null => (spellWanted !== undefined ? spellWanted : o.spell ?? null);
  /** Theme `i` of this set, planned under everything asked of it. */
  const plan = (i: number) => planAt(wish({ ...here(), index: i }));

  // --- planning ahead, and never on the tick ---------------------------------
  //
  // **The tick only consumes** (the reconciled review of 09-24, R12). The
  // swap used to plan the theme after the one arriving, compile it and start
  // its preparation inside `step()` — house-v2 9 ms a plan and 6 a compile at
  // the median on this machine, 30 at worst, four times that on a phone — on
  // the very tick the low end changes hands, whose look-ahead is 0.12 s. Now
  // the theme after the one arriving is planned and compiled in an idle slot
  // while the blend runs, the swap finds it by its place, and its voices are
  // prepared in the next idle slot after the swap; a seam that reaches a theme
  // nobody planned (a seek landing a bar before its own seam) still plans it,
  // and says so in `tickWork`, which the scenarios hold at nought.
  let ticking = false;
  let tickWork = 0;
  let aheadQueued = false;
  const compiledHere = new WeakSet<SetTrack>();
  /** The program of a plan, counting a compile the tick had to make. */
  function compiled(track: SetTrack) {
    if (ticking && !compiledHere.has(track)) tickWork += 1;
    compiledHere.add(track);
    return programOf(track);
  }
  const idle = (fn: () => void): void => {
    const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(fn, { timeout: 250 });
    else setTimeout(fn, 0);
  };
  /** Ask for `ahead` in the next idle slot, once however often it is asked. */
  function planAhead(): void {
    if (aheadQueued || dead) return;
    aheadQueued = true;
    idle(() => {
      aheadQueued = false;
      try { ahead(); } catch (err) {
        if (typeof console !== 'undefined') console.error('deep-house: planning ahead failed', err);
        // the next seam is then planned on the tick, late (R1, the held-errors audit)
        report('transport', 'planning ahead threw', err);
      }
    });
  }
  /**
   * The theme the next seam will want, planned and compiled: during a blend
   * the one after the theme arriving (the swap's `nextPlan`), otherwise the
   * set's next, whose voices are prepared as well. A blend prepares no voices
   * for it — the piano's cache is the arriving theme's while it arrives.
   */
  function ahead(): void {
    if (dead || !running || !current) return;
    // a move waiting for its landing names the next seam's plan itself
    if (moving && moving.kind !== 'seek') return;
    if (incoming) {
      const p = placeOf(incoming.track);
      const want = wish({ ...p, index: p.index + 1 });
      if (aheadOff(want)) return;
      compiled(planAt(want));
      return;
    }
    if (!nextPlan) {
      const want = wish({ ...here(), index: n + 1 });
      if (aheadOff(want)) return;
      nextPlan = planAt(want);
    }
    ready(nextPlan);
    // and, in the seconds before the record's own seam, the arriving deck's graph
    buildArrival();
  }
  /**
   * **The theme the next seam will want, asked of the planner's worker**: true
   * while it is on its way, and `ahead` is asked again when it lands and finds
   * it by its place. False where it is planned already, or where there is no
   * worker and `ahead` plans it here, in its idle slot, as it always did.
   */
  let aheadAsked: Place | null = null;
  function aheadOff(p: Place): boolean {
    if (plannedAt(p)) return false;
    if (aheadAsked && samePlace(aheadAsked, p)) return true;
    const off = offThread([p], { priority: 'ahead' });
    if (!off) return false;
    aheadAsked = p;
    void off.then(() => {
      if (aheadAsked === p) aheadAsked = null;
      planAhead();
    });
    return true;
  }

  /** How many unplayed notes the last hand on a bird re-seasoned. A bench reading. */
  let seasoned = 0;
  /** the event lists a deck has made its own by seasoning them, and the decks a seasoning has touched */
  const ownLists = new WeakSet<object>();
  const seasonedDecks = new WeakSet<Deck>();
  /** two settings tables, the same numbers under the same names */
  const sameKnobs = (a: Record<string, number>, b: Record<string, number>): boolean => {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) if (a[k] !== b[k]) return false;
    return true;
  };

  /**
   * **The immediate half of a held bird**, given to every note that has not yet
   * been handed to the audio clock.
   *
   * A held bird asks two things and they land at two different times. What it
   * asks of the *structure* is a promise about the next theme, because a plan
   * is a plan and nothing rewrites one that is sounding. What it asks of the
   * **seasoning** — the settings a voice is played inside its own declared
   * range — is a number on a note, and a note nothing has been built for yet
   * can be given a different one. So the next note to sound is already
   * seasoned: a lookahead rather than a phrase line.
   *
   * Both decks, because both may be heard: the one playing, and the one
   * arriving on a seam of this same set. A deck arriving from a **cast** is
   * another set and is planned under its own spell, so it is left alone.
   *
   * It is called again where a theme changes hands, and it has to be: a spell
   * asked while a seam was already in flight cannot reach the plan of the theme
   * that seam is carrying, so the ask is applied to that theme's notes when it
   * becomes the one playing.
   *
   * **Nothing asked of a deck is nothing written to it** (the deep review of
   * 10-08): a deck whose plan was made under the spell the hand asks — every
   * swap and every seek with no pull in flight — plays its program as it was
   * compiled, the locked one. It used to be re-seasoned at every swap and seek
   * with `knobsFor` alone, which left out the plan's tempo lean on the bass and
   * the place's bass mass and dropped each note's own knobs: MEASURED, live
   * play left the locked program from theme 2 and after any seek in about one
   * non-house theme in ten (`seed=1&v=2&spell=em:0.90`: 455 sub notes lost
   * hold 0.39 and mass 0.5). A real pull seasons with the plan's own chain
   * (`seasonOf`), each note's own knobs kept over it (`noteKnobs`), and a
   * pull let go puts the program's own back.
   */
  function reseason(): number {
    const spell = wanted();
    let n = 0;
    for (const d of [current, incoming]) {
      if (!d) continue;
      const p = placeOf(d.track);
      if (d === incoming && p.seed !== masterSeed) continue;
      if (sameSpell(spell, p.spell)) {
        // as compiled, unless a pull since let go had seasoned it
        if (seasonedDecks.has(d)) n += seasonNotes(d, d.track.knobs ?? {});
        continue;
      }
      n += seasonNotes(d, seasonOf(d.track, spell));
    }
    return n;
  }

  /**
   * **Season the notes a deck has not played yet**, each to the seasoning of
   * its voice with the note's own knobs over it, exactly as the compiler made
   * them (`noteKnobs`). Everything from the scheduler's cursor on is a note
   * nothing has been built for, so nothing that sounds is touched; the
   * program the digest hashes is never written — the deck takes its own copy
   * of the list the first time, and every later seasoning writes into it.
   */
  function seasonNotes(d: Deck, seasoning: Record<string, Record<string, number>>): number {
    const events = d.program.events;
    const from = Math.max(0, d.index | 0);
    if (from >= events.length) return 0;
    const order = visitOrder(d.program);
    const plan = d.track.events as Array<{ p?: { knobs?: Record<string, number> } }>;
    let own = ownLists.has(events);
    let n = 0;
    for (let k = from; k < events.length; k++) {
      const i = order ? order[k] : k;
      const ev = events[i];
      const want = noteKnobs(seasoning[ev.voice], plan[ev.i]?.p?.knobs);
      const had = ev.p && (ev.p.knobs as Record<string, number> | undefined);
      if (!want && !had) continue;
      if (want && had && sameKnobs(want, had)) continue;
      if (!own) {
        d.program = { ...d.program, events: events.slice() };
        sameVisitOrder(events, d.program.events);
        ownLists.add(d.program.events);
        seasonedDecks.add(d);
        own = true;
      }
      const q = { ...ev.p } as Record<string, unknown>;
      if (want) q.knobs = want; else delete q.knobs;
      d.program.events[i] = { ...ev, p: q } as typeof ev;
      n++;
    }
    return n;
  }

  // Everything a theme's voices want rendered ahead — the hats' three tones
  // under its preset, the piano's strings — at the live context's rate, asked
  // for as soon as the theme is planned: for the set's first theme before it
  // starts, for the next one while the current plays its first bars, so no
  // offline render is ever started near a seam or under a cut. Returns the
  // promise; the same plan asked for twice renders once.
  //
  // **Keyed by the window, and not by the theme.** A preparation is a window
  // round where a deck is about to start — the piano's string cache holds about
  // a minute of distinct strings and a theme can need half as many again, so
  // asking for the whole thing evicted the front of the pass with the back of
  // it — and until 09-19 the memo was keyed by the plan alone. So a seek to the
  // tenth minute of a theme prepared at its first bar found that first bar's
  // promise, was told the landing was ready, and built its strings on the
  // scheduling tick. A pass from `f0` answers for a landing
  // between `f0` and `f0 + PREPARE_WINDOW`; anything else is its own pass.
  //
  // `PREPARE_WINDOW` is half of what one pass can hold: the budget is about a
  // minute of strings (`WARM_SHARE` of the piano's cache), so half a minute
  // after a pass began is the last landing that pass can honestly claim.
  const PREPARE_WINDOW = 30;
  /** One preparation pass: where it began, whether it has finished, and its promise. */
  interface Prepared { from: number; done: boolean; p: Promise<void> }
  const readied = new WeakMap<SetTrack, Prepared[]>();
  const roomsWarmed = new WeakSet<object>();
  function passFor(track: SetTrack, from: number): Prepared | null {
    const list = readied.get(track);
    if (!list) return null;
    let best: Prepared | null = null;
    for (const e of list) {
      const d = from - e.from;
      if (d < 0 || d > PREPARE_WINDOW) continue;
      if (!best || e.from > best.from) best = e;
    }
    return best;
  }
  function ready(track: SetTrack | null, from = 0): Promise<void> {
    if (!track) return Promise.resolve();
    const got = passFor(track, from);
    if (got) return got.p;
    const program = compiled(track);
    const entry: Prepared = { from, done: false, p: Promise.resolve() };
    // A preparation that fails is the live path for that theme's strings and
    // hats — the documented fallback, on the audio thread, in another timbre
    // — and it used to happen with no line anywhere. It still
    // does not stop the set; it says so.
    entry.p = prepareVoices(ctx, program.settings, program.events, { from }).catch((err: unknown) => {
      if (typeof console !== 'undefined') console.warn('deep-house: a theme\'s voices could not be prepared and will be built live:', err);
      note('prepare', 'a theme\'s voices could not be prepared and fall back to the live path',
        { from: +from.toFixed(2), why: String((err as Error)?.message ?? err).slice(0, 80) });
    }).then(() => { entry.done = true; });
    // and the room's two impulse responses, in an idle slot of their own (`warmRoom`, the engine review of
    // 10-08, F4): a hand's hand-over into another room builds its deck on the turn that lays it, and finds them
    // made rather than computing them there. Not waited for: a deck built first computes them as it always did.
    if (!roomsWarmed.has(program.settings)) {
      roomsWarmed.add(program.settings);
      idle(() => { if (!dead) { try { warmRoom(ctx, withStage(program.settings)); } catch (e) { /* the deck will say so */ } } });
    }
    const list = readied.get(track) || [];
    list.push(entry);
    // Four windows of one theme is more than any transport asks for; the oldest
    // goes, and a landing inside it is prepared again rather than remembered.
    readied.set(track, list.length > 4 ? list.slice(-4) : list);
    return entry.p;
  }
  /** Is this landing built, so a hand-over may begin in the same turn? */
  const isReady = (track: SetTrack | null, from = 0): boolean => {
    if (!track) return true;
    const got = passFor(track, from);
    return !!got && got.done;
  };
  // How long the transport waits for a landing to be built before it goes
  // anyway. A hand that has asked for a position expects the record to be
  // there, and a preparation that takes longer than this is one the deck would
  // rather start without: what it is missing falls back to the live path, which
  // is the documented fallback and what every seek did before 09-19. It is
  // about two beats at the record's tempo, and a landing that reaches it is a
  // landing that builds something under the scheduler — which the transport
  // scenarios count, and which none of them has seen on any engine.
  const PREPARE_DEADLINE = 1.2;
  // The deadline's timer goes with the wait, however the wait ends: one was
  // left behind per move (R99).
  const readyEnough = (track: SetTrack | null, from = 0): Promise<void> => {
    if (isReady(track, from)) return ready(track, from);
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      ready(track, from),
      new Promise<void>((r) => { timer = setTimeout(r, PREPARE_DEADLINE * 1000); }),
    ]).finally(() => clearTimeout(timer));
  };

  // Where the set is, for whoever is writing a line down: the seed under the
  // needle, the theme, the bar of it and the context's own clock. It is the
  // readout's own arithmetic and not a second one — `n` is the index the swap
  // moves and `deckThemeTime` is what the elapsed on the state is made of.
  const placeNow = () => ({
    seed: masterSeed,
    theme: n + 1,
    bar: current ? Math.floor(Math.max(0, deckThemeTime(current, ctx.currentTime)) / current.track.barSeconds) + 1 : 0,
    clock: +ctx.currentTime.toFixed(3),
  });

  // A theme's card, made once per plan (R98): the state is read on every tick
  // and every frame, and three of these were mapped afresh each time.
  const infos = new WeakMap<SetTrack, ReturnType<typeof themeInfo>>();
  const infoOf = (t: SetTrack) => {
    let got = infos.get(t);
    if (!got) { got = themeInfo(t); infos.set(t, got); }
    return got;
  };

  function state(): MixState {
    return {
      running,
      masterSeed,
      // Which strategy this set is being planned under. It is on the state and
      // not worked out again by a reader, because a set is planned under one
      // strategy for its whole life and a face that asked twice could be told
      // two things.
      strategy: o.strategy,
      preset: o.preset || 'auto',
      themeIndex: n,
      theme: current ? infoOf(current.track) : null,
      // While a seam runs, the theme that is arriving *is* the next one, so
      // the readout can name it instead of going blank halfway through the
      // only part of the set where a listener is wondering what is coming.
      next: incoming ? infoOf(incoming.track) : nextPlan ? infoOf(nextPlan) : null,
      incoming: incoming ? infoOf(incoming.track) : null,
      elapsed: seekingTo != null ? seekingTo : current ? Math.max(0, deckThemeTime(current, ctx.currentTime)) : 0,
      leading: running && ctx.currentTime < leadUntil,
      leadFrom,
      themeSeconds: current ? current.track.bars * current.track.barSeconds : 0,
      // What a beat of the theme playing costs right now, which through a
      // seam, the glide after it or the ride before it is not what that
      // theme's own tempo says: read off the one clock both decks are on, over
      // the beats of the theme a beat of it carries (two at double time).
      // A free theme's beat is its own nominal second (the second clock): no grid moves it.
      beatSeconds: current ? (freeDeck(current) ? current.program.beat : current.clock.spbAt(current.clock.beatAt(ctx.currentTime)) / (current.perBeat ?? 1)) : 0,
      settleIn: Math.max(0, heardAt() - ctx.currentTime),
      wait,
      transition: transition
        ? Math.max(0, Math.min(1, (ctx.currentTime - transition.at) / (transition.end - transition.at)))
        : 0,
      // A hand-over into another set is asked for or up: the seed above is
      // still the set under the needle and will be the arriving one at the
      // swap. A cast abandoned — a seek inside it — is not casting any more,
      // which is how the face hears that it was abandoned.
      casting: !!((aim && aim.seed !== masterSeed) || (incoming && placeOf(incoming.track).seed !== masterSeed)),
      // notes the scheduler reached after their time, and by how much the last
      // one was moved: a loaded page says so here
      late: lateInfo(),
    };
  }

  // **When the tempo the set is heading for is fully heard** (round K12c, made
  // one number in round MIX-X1), on the context's clock:
  //
  //   the clock knows where it stops changing (`steadyAt`): the end of the
  //   glide after a blend — laid with the blend since MIX-X1, so it is known
  //   from the hand-over's first instant — or of the ride before a far one;
  //   the readout turns over at the swap, so a far jump, ridden onto the
  //   arriving tempo before a note of it sounds, is heard at the swap;
  //   and a hand-over asked for and not yet laid is the line's own arithmetic.
  //
  // The greatest of the three. A face reads the whole wait off this.
  function heardAt(): number {
    let at = clock ? clock.steadyAt() : -Infinity;
    if (transition) at = Math.max(at, transition.swapAt);
    if (wait && !wait.laid) at = Math.max(at, wait.heardAt);
    return at;
  }

  // How long a glide takes on the clock: linear in BPM over `overBeats`, the
  // clock's own integral (`set-clock.ts`), for a hand-over not yet laid.
  const glideSeconds = (spb0: number, spb1: number, overBeats: number): number => {
    const m0 = 60 / spb0;
    const m1 = 60 / spb1;
    if (Math.abs(m1 - m0) < 1e-6 || !(overBeats > 0)) return 0;
    return (60 / ((m1 - m0) / overBeats)) * Math.log(m1 / m0);
  };

  /**
   * **The hand-over a hand asks for, before it is laid** — the one arithmetic
   * `foresee` reads and `move` lays (round MIX-X3): the line the move takes
   * (`seamFromHere`), the far ride in the room the record has left past it
   * (`rideInRoom`), the grid as it will stand at the blend — ridden towards the
   * arriving tempo, or as it is at the line — the hand's own bars at that grid
   * (`handSeamBars`: the swap and the cross by the style's seconds, the blend
   * twice the swap) and the blend from where the ride ends, no longer than
   * the hand's bars and no longer than the record has left.
   */
  function handOver(arriving: SetTrack, unit: number) {
    const m = current!.perBeat ?? 1;
    const bs = current!.track.barSeconds;
    const from = deckThemeTime(current!, handFloor());
    const line = seamFromHere(current!.track, from, arriving, { unit });
    const lineAt = Math.max(handFloor(), deckContextTime(current!, line.at));
    const rule = seamTempo(heardBpm(current!, lineAt), arriving.bpm, o, freeSides(current!.track, arriving));
    const r = rideInRoom(rule, current!.track.bars - line.bar, o);
    // a free record's beat is its own: the hand's bars are counted in its own four-second bars (`freeSeamBars` lays them)
    const spbLine = freeDeck(current!) ? current!.program.beat : clock!.spbAt(clock!.beatAt(lineAt));
    const spb = r.ride > 0 ? (r.glide === 0 ? arriving.beat * m : spbLine / r.ridden) : spbLine;
    const hand = handSeamBars(o.handSeam, (spb * 4) / m, o.harmonicCross, o.swapAfterBars);
    const s = r.ride > 0
      ? seamFromHere(current!.track, (line.bar + r.ride) * bs, arriving, { unit: 1, most: hand.blend })
      : seamFromHere(current!.track, from, arriving, { unit, most: hand.blend });
    return { m, bs, line, lineAt, rule: { ...rule, ride: r.ride, glide: r.glide }, r, spbLine, spb, hand, s };
  }

  /**
   * **What a hand-over a hand asks for will be**, before it is laid: the line
   * `move` will take, the ride before it where the tempo is far, the blend's
   * bars on the grid as it will stand, and from those the swap and the instant
   * the tempo is fully heard — the same arithmetic `move` lays (`handOver`),
   * so what the face is told at the drop is what the seam does, and a landing
   * that takes longer than its line is the one case the numbers move.
   */
  function foresee(arriving: SetTrack, unit: number, cut: boolean, kind: MixWait['kind']): { swapAt: number; heardAt: number } {
    const now = ctx.currentTime;
    // A pull inside a hand-over joins it (`joinBlend`, `keepRide`), and so
    // does a cast (round MIX-X5): the swap and the end are the hand-over's
    // own, unchanged.
    if ((kind === 'spell' || kind === 'cast') && wait && wait.laid && incoming && (blending() || ridingAhead())) {
      return { swapAt: wait.swapAt, heardAt: wait.heardAt };
    }
    if (cut) {
      const at = cutAt();
      const swapAt = lineAfter(current!, at + 1e-3, current!.track.barSeconds);
      return { swapAt, heardAt: Math.max(swapAt, now) };
    }
    const { m, lineAt, rule, r, spbLine, spb, hand, s } = handOver(arriving, unit);
    // A far jump is ridden in the room the record has left past the line
    // (`rideInRoom`, round MIX-X3), and the blend begins where the ride ends:
    // as many seconds past the line as the glide takes over the ride's bars,
    // which on a record being slowed is more than its bars said.
    let at = lineAt;
    if (r.ride > 0) {
      const beats = (r.ride * 4) / m;
      at = lineAt + (Math.abs(spb - spbLine) < 1e-9 ? beats * spbLine : glideSeconds(spbLine, spb, beats));
    }
    // a seam with a free side is laid on the bar its curves are counted in (`freeSeamBars`), as `beginTransition` lays it
    const fs = rule.kind === 'free' ? freeSeamBars(current!.track, arriving, s.bars, (spb * 4) / m) : null;
    const barSeconds = fs ? fs.barSeconds : (spb * 4) / m;
    const bars = fs ? fs.bars : s.bars;
    // the hand's swap is seconds, counted again in the bar the curves are laid on
    const handOn = fs ? handSeamBars(o.handSeam, barSeconds, o.harmonicCross, o.swapAfterBars) : hand;
    const swapAt = at + swapAfterBars(bars, { swapAfterBars: handOn.swap }) * barSeconds;
    const end = at + bars * barSeconds;
    // nothing glides after a seam with a free side: the tempo, such as it is, is heard at the swap
    if (fs) return { swapAt, heardAt: Math.max(swapAt, now) };
    const perBeat = m * rule.perBeat;
    const target = arriving.beat * perBeat;
    const over = Math.max(1, (glideBarsFor(spb / target, o) * 4) / perBeat);
    // ridden all the way, the tempo is heard at the swap, where the readout turns over; otherwise at the end of the glide after the blend
    const heard = r.ride > 0 && r.glide === 0 ? swapAt : end + glideSeconds(spb, target, over);
    return { swapAt, heardAt: Math.max(swapAt, heard) };
  }

  /** The plan's number: the one before, unless the instants moved by more than a tenth of a second. */
  const planOf = (swapAt: number, heard: number): number =>
    (wait && Math.abs(wait.swapAt - swapAt) <= 0.1 && Math.abs(wait.heardAt - heard) <= 0.1 ? wait.plan : ++waitPlan);

  /**
   * The wait begins: a hand has asked, and this is what it will take.
   *
   * **A hand-over that carries a cast is a cast's wait, whoever asked last**
   * (round MIX-X5). A bird pulled while the dice are in the air joins the
   * cast's hand-over, and that one hand-over is what the cast's node and
   * every bird's fill run on — so its kind stays the cast's, which is what
   * the face draws the node's fill from; the birds draw theirs whatever the
   * kind. A spell asked into the set's own seed is a spell's wait as before.
   */
  function askWait(kind: MixWait['kind'], arriving: SetTrack, unit: number, cut: boolean, into: Place): void {
    const { swapAt, heardAt: heard } = foresee(arriving, unit, cut, kind);
    const carries: MixWait['kind'] = kind === 'spell' && into.seed !== masterSeed ? 'cast' : kind;
    wait = { askedAt: ctx.currentTime, swapAt, heardAt: heard, plan: planOf(swapAt, heard), kind: carries, laid: false };
  }

  /**
   * The wait is exact: the seam is laid, so the swap is the seam's and the
   * tempo's arrival is read off the clock. A hand-over nobody asked for — the
   * set's own — is a wait too, so a face reads the drift's glide the same way.
   * The instants moving by more than a tenth of a second is a re-plan — a
   * landing that missed its line — and says so, in the plan's number and in
   * the ledger.
   */
  function layWait(): void {
    if (!transition) return;
    const heard = Math.max(clock!.steadyAt(), transition.swapAt);
    const plan = planOf(transition.swapAt, heard);
    if (!wait || wait.laid) {
      wait = { askedAt: transition.at, swapAt: transition.swapAt, heardAt: heard, plan, kind: 'seam', laid: true };
      return;
    }
    if (plan !== wait.plan) note('seam', 'the landing missed its line, and the wait was planned again', {
      swapWas: +(wait.swapAt - ctx.currentTime).toFixed(2), swapIs: +(transition.swapAt - ctx.currentTime).toFixed(2),
      heardWas: +(wait.heardAt - ctx.currentTime).toFixed(2), heardIs: +(heard - ctx.currentTime).toFixed(2),
    });
    wait = { ...wait, swapAt: transition.swapAt, heardAt: heard, plan, laid: true };
  }

  // Where a cut starts: the next beat of the record that is playing, past
  // whatever has already been filled in. A skip and a back are a hand asking
  // for something now, and a beat is the shortest unit a cut can land on and
  // still be in time — at 105 BPM it is 570 ms, where the next bar was two and
  // a quarter seconds away and the swap another two behind it.
  function cutAt() {
    const floor = Math.max(startAt(ctx), current!.pumpedTo || 0);
    return lineAfter(current!, floor, current!.track.beat);
  }

  // Move through the set while it is silent. No audio to schedule, so this is
  // only the index, the plan the interface draws from, and a readout.
  function stepWhileStopped(by: number): TransportPoint {
    n = Math.max(0, n + by);
    nextPlan = plan(n + 1);
    emit();
    return { at: 0, end: 0, swapAt: 0, bars: 0, themeIndex: n, silent: true };
  }

  // `stage` is how far into the seam the set already is: zero for one that is
  // about to happen, and for a set resumed inside a blend the seconds that
  // have passed since it began — `at` is then the instant the seam *would*
  // have started, which is in the past. The same construction serves both: the
  // arriving deck comes in at its own offset rather than at its first bar, and
  // every curve is written from the value it had reached instead of from its
  // beginning, so nothing jumps and nothing is played twice.
  function beginTransition(bars: number, whenTime: number, cut = false, stage = 0, rule: SeamTempo | null = null, hand: HandSeamBars | null = null) {
    if (incoming) return transition;
    const next = nextPlan || plan(n + 1);
    nextPlan = null;
    // The theme after this one, planned while the blend runs.
    planAhead();
    const at = whenTime;
    // What the seam does with the tempo (`seamTempo`): handed in by a move
    // that rode the grid first, and otherwise read here, off the tempo the
    // outgoing theme is heard at as the blend begins.
    const m = current!.perBeat ?? 1;
    const tempo = rule ?? seamTempo(heardBpm(current!, at + stage), next.bpm, o, freeSides(current!.track, next));
    // **A seam with a free side** (PLAN-AMBIENT §4.3, the second clock): a free deck is counted by offset, so the
    // grid is the metered theme's alone. Into a free theme it is pinned where the record stands, as below, and holds;
    // out of one it jumps to the arriving metered theme's own tempo at the blend's first instant — only the free
    // record is up, and it does not listen to the grid — so the metered theme keeps its own grid from its first
    // downbeat. The blend is laid on the bar its curves are counted in (`freeSeamBars`).
    const fs = tempo.kind === 'free' ? freeSeamBars(current!.track, next, bars, (clock!.spbAt(clock!.beatAt(at + stage)) * 4) / m) : null;
    // Never under a metered deck still sounding: every path that lays one waits for the tail (`handFloor`); should one
    // not, the tail goes before the jump rather than play on a grid that is no longer its own.
    if (fs?.jump && retiring && !freeDeck(retiring) && retiringUntil > at + stage) {
      note('seam', 'a metered tail was still up where the grid jumps out of a free theme, and was let go', { tailSeconds: +(retiringUntil - at - stage).toFixed(2) });
      letGo(retiring, Math.max(0.02, Math.min(0.3, at + stage - ctx.currentTime)));
      retiring = null;
    }
    if (fs?.jump) moveGrid(clock!.beatAt(at), 0, (b) => clock!.jump(b, next.beat));
    if (fs) bars = fs.bars;
    // ...and a hand's swap and cross, which are seconds, counted again in that bar
    if (fs && hand) hand = handSeamBars(o.handSeam, fs.barSeconds, o.harmonicCross, o.swapAfterBars);
    // MEASURED: nothing changes tempo across a seam. The grid is held where it
    // stands for the length of the blend — a seam that begins in the middle of
    // a glide keeps whatever the glide had reached — and the arriving theme is
    // played on it, so both decks count the same bars: beat for beat, or two of
    // its beats to one at double time (`perBeat`). A bar here is the outgoing
    // theme's, which is what the blend is counted in.
    const pinned = fs?.jump ? 0 : (moveGrid(clock!.beatAt(at + stage), 0, (b) => clock!.pin(b)) * 4) / m;
    const barSeconds = fs ? fs.barSeconds : pinned;
    incoming = sourceDeck(ctx, next, compiled(next), mixOut, master, clock!, at + stage, fs ? 1 : m * tempo.perBeat);
    // **A move in place enters where the record is** (Eugene, 09-24: *"a bird
    // move keeps the place"*): the theme playing, planned again under the
    // asked spell, comes in at the bar the outgoing plan is at as the blend
    // begins — the same place in the same form (`sameFormTime`) — rather than
    // at its intro.
    const to = placeOf(next);
    const inPlace = to.seed === masterSeed && to.index === n && to.strategy === (o.strategy ?? DEFAULT_STRATEGY);
    const entry = inPlace ? sameFormTime(current!.track, next, Math.max(0, deckThemeTime(current!, at))) : 0;
    startDeck(ctx, incoming, at + stage, entry + stage);
    // A hand's seam swaps and crosses on its own bars (`set.handSeam`, round
    // MIX-X3); the set's own, and a cut, on the planned seam's.
    transition = { ...scheduleTransition(ctx, current!, incoming, at, bars, barSeconds, seamOptions(hand), mixOut, cut, at + stage, sumLine), rule: tempo, hand };
    // **A record with nothing left under the blend hands over at full** (round
    // MIX-X1). The arriving theme fades up from nothing over the blend's first
    // bars so that it comes in under a record that is still playing; where the
    // record has already run out — a scrub into its last bar, a move asked
    // there — that fade is a bar of silence, so the arriving theme is heard
    // from its first note instead.
    if (deckThemeTime(current!, at + stage) >= current!.track.bars * current!.track.barSeconds - 1e-3) {
      const fader = incoming.lineOf('fader.gain');
      if (fader) fader.write([{ v: 1, t: at + stage, k: 'set' }], at + stage);
      note('seam', 'the record had run out, so the arriving theme comes in at full');
    }
    // **The glide after the blend is laid with the blend** (round MIX-X1), at
    // the blend's end — exactly where `layOut` lays it for a render, so the
    // live grid and the rendered one are one grid — rather than when the blend
    // ends: the clock knows from the hand-over's first instant when the tempo
    // will be the arriving theme's own, and a face reads the whole wait off
    // it. Nothing before the blend's end moves, and nothing after it has been
    // handed to the audio clock yet.
    if (!fs) glideAfter(transition.end, incoming);
    layWait();
    note('seam', cut ? 'a cut began' : 'a hand-over began', {
      bars,
      into: String(next.seed),
      tempo: `${tempo.kind} ${+tempo.ratio.toFixed(3)}`,
      ...(inPlace ? { inPlaceAtBar: +(entry / next.barSeconds).toFixed(2) } : {}),
      inSeconds: +(at - ctx.currentTime).toFixed(2),
      swapInSeconds: +(transition.swapAt - ctx.currentTime).toFixed(2),
      ...(incoming.builtAhead ? { graph: 'built ahead' } : {}),
    });
    emit();
    return transition;
  }

  /** The seam's numbers for a hand-over: the hand's bars where a hand asked for it, the style's where the set did. */
  const seamOptions = (hand: HandSeamBars | null) => (hand ? { ...o, swapAfterBars: hand.swap, harmonicCross: hand.cross } : o);

  // Where this theme's own hand-over falls, in its own seconds. A seam is a
  // function of the plan alone — the theme, the blend it rolled, the line it
  // lands on and the blend before it — so a position written down in the
  // middle of one can be put back inside it from the position alone, with no
  // record of the seam kept anywhere.
  function seamOf(track: SetTrack, notBefore = 0) {
    const p = seamPlan(track, blendAsked(track), { boundaryBars: o.boundaryBars, notBefore });
    return { at: p.at, bars: p.bars, seconds: p.bars * track.barSeconds };
  }

  // The floor a move asked for by a hand has to clear: the transport's own lead
  // past the render head, and whatever the deck that is playing has already
  // been filled to. `cutAt` is the next beat past it; a hand-over from here
  // takes the next bar or phrase line past the same floor.
  const moveFloor = () => Math.max(startAt(ctx), current!.pumpedTo || 0);
  /**
   * **A free record hands over once the metered tail under it is gone** (the second clock; the review of 10-18, S1).
   * A hand-over out of a free record jumps the grid to the arriving tempo where its blend begins (`beginTransition`),
   * heard by nobody while only the free deck is up; but the metered theme a pull into the free record let go may still
   * be playing out its tail on that grid (`interruptSeam`), and a jump under it re-timed every note it had left
   * (MEASURED: house 119 pulled to the tile, Ember 1 pulled 0.5 s after the swap, the tail's grid at 164 BPM and 59 of
   * its 61 remaining notes off their spacing). The tail is not cut to make room: a tenth of a second off a fading tail
   * is a step a listener hears, where a free record waiting a few seconds more for its line is not heard at all — it
   * has no beat to be late on. So its floor is the tail's end. Free → free waits the same, so that a bird moved
   * inside that blend toward a metered plan can always be joined (`joinBlend`). With no metered tail under a free
   * record this is `moveFloor`, so no metered set moves.
   */
  const handFloor = () => (current && retiring && freeDeck(current) && !freeDeck(retiring) ? Math.max(moveFloor(), retiringUntil) : moveFloor());

  /**
   * **A move asked for by a hand**: a hand-over from here into the place
   * `resolve` names, or a cut to it.
   *
   * The one new piece the never-stop transport needed (Eugene, 09-19: *"once
   * the machine is started it never stops, so all magic-ring manipulations are
   * a smooth transition in the music universe"*). Everything about it is the
   * machinery a seam already has — `seamFromHere` for the line and the blend,
   * `beginTransition` for the decks and the grid, `writeSeam` for the curves,
   * `promote` for the swap — and what is added is the two things a planned seam
   * never has to ask: *where the record has got to*, and *which theme this is*.
   *
   * A cut asked for by a hand and a hand-over asked for by a hand differ in one
   * number, the line they land on: a beat for a skip, a bar for a cast, a
   * phrase for a spell. A cut lands a seam in flight at once, before the wait;
   * a hand-over lands it after, from where the record is then.
   *
   * **The destination is resolved, and resolved again.** It is planned at the
   * ask so its landing can be built, and asked for again once the wait is over
   * and the record has moved — a seam in flight landed, a cast turned the seed
   * over — and planned again if the answer is another place, rather than
   * labelled with the new seed while it plays the old one (R9). What it plays is
   * what `placed` says it is, so the swap cannot be told otherwise.
   *
   * @param resolve where the move goes, asked at the ask and after the wait
   * @param kind which move this is, for `supersede` and the ledger
   * @param unit the line a hand-over begins on, in bars; a cut takes a beat
   */
  async function move(resolve: () => Place, kind: NonNullable<typeof moving>['kind'], unit = 1, asked: MixWait['kind'] = kind === 'cut' ? 'skip' : kind as MixWait['kind'],
    said: ((arriving: SetTrack) => void) | null = null): Promise<TransportPoint | null> {
    if (!running || !current) return null;
    const cut = kind === 'cut';
    const token = supersede(kind);
    const stale = () => token !== moveToken || dead || !running || !current;
    try {
      // A tap during a seam lands the hand-over in flight at once — the
      // arriving theme is the record — and the cut is planned from there.
      if (cut) interruptSeam();
      // the plans the landing needs, made off the page's thread (`landingOff`)
      const missing = missingFor(resolve);
      if (missing.length) {
        await landingOff(resolve, missing);
        if (stale()) return null;
      }
      let dest = resolve();
      let arriving = planAt(dest);
      if (said) said(arriving);
      nextPlan = arriving;
      // The wait begins at the ask, from the line this move will take.
      askWait(asked, arriving, unit, cut, dest);
      // The landing is built before a deck is: a theme nobody has warmed renders
      // its piano's strings on the scheduling tick otherwise, which is the one
      // thing a hand-over must not do to the theme that is still playing — and
      // where it lands: a move in place lands where the record is.
      const landsAt = dest.seed === masterSeed && dest.index === n
        ? sameFormTime(current!.track, arriving, Math.max(0, deckThemeTime(current!, handFloor()))) : 0;
      await readyEnough(arriving, landsAt);
      if (stale()) return null;
      // A seam in flight lands at once — the theme that was arriving is the
      // record — and this move goes on from there, as a skip does it. A cut's
      // own seam may have armed on its own while the landing was built.
      // **A second ask inside a ride keeps the ride** (Eugene on 69fccab: *"on
      // 50 BPM I move Ember to 105 … then I move Loom, and the music drops
      // quiet for a few seconds and then starts playing at 100"*). A pull
      // asked while the record is being ridden to a far tempo, before the
      // blend, joins that hand-over: the grid goes on from the tempo it has
      // reached to the target — the same one, or the new theme's if the ask
      // moved it — the record keeps sounding through it, and the plan asked
      // now blends in at the ride's end, as though both values had been in
      // the first ask.
      // **And so does a cast** (round MIX-X5): the dice thrown while a bird's
      // ride runs re-aim the ride at the new set's tempo and blend into it
      // where the bird's blend was to begin; a bird pulled while a cast's ride
      // runs is the same join the other way round.
      if ((kind === 'spell' || kind === 'cast') && ridingAhead()) {
        const kept = keepRide(dest, arriving);
        if (kept) return kept;
      }
      // **A second ask inside a blend joins it** (round MIX-X1): before the
      // swap the plan asked now takes the arriving theme's place under the
      // same curves, at the same bar; after it, the record is the theme that
      // arrived and the ask hands over from there on the next phrase line
      // while the theme it replaced plays out its tail as written. A cast
      // joins too (round MIX-X5), its theme entering at the bar the blend is
      // on, so that the record is never cut for a throw.
      if ((kind === 'spell' || kind === 'cast') && blending()) {
        const joined = joinBlend(dest, arriving);
        if (joined) return joined;
      }
      if (!cut || transition) interruptSeam(cut, cut);
      if (stale()) return null;
      // Reached already: a seam that landed on the way — its own, armed while
      // the landing was built with the theme this move had planned — brought
      // the very place it asked for, and a second hand-over into the theme
      // after it would be a move nobody made.
      const h = here();
      if (dest.seed === h.seed && dest.index === h.index && dest.strategy === h.strategy && sameSpell(dest.spell, h.spell) && dest.reach === h.reach) {
        if (aim && aim.seed === h.seed && aim.index === h.index) aim = null;
        const now = ctx.currentTime;
        if (wait && !wait.laid) wait = { ...wait, swapAt: now, heardAt: Math.max(now, heardAt()), laid: true };
        return { at: now, end: now, swapAt: now, bars: 0, themeIndex: n };
      }
      const again = resolve();
      if (!samePlace(again, dest)) {
        note('transport', 'the record moved while a landing was built, and the move was planned again from where it is',
          { was: `${dest.seed}#${dest.index}`, now: `${again.seed}#${again.index}` });
        dest = again;
        arriving = planAt(dest);
      }
      // Where presses count from while this is on its way.
      aim = dest;
      nextPlan = arriving;
      if (cut) return beginTransition(o.skipBars, cutAt(), true);
      // The hand's hand-over (`handOver`): its line, the far ride in the room
      // past it, the hand's own bars at the grid the blend is played on
      // (`set.handSeam`, round MIX-X3: the swap about fourteen seconds in, the
      // blend twice that, no longer than the record has left), and the blend
      // from where the ride ends.
      const ho = handOver(arriving, unit);
      // **A far jump is ridden first** (`seamTempo`): from the line, the grid
      // takes the record towards the arriving theme's tempo, and the blend
      // begins where the ride ends, on a bar line of the record. **In the room
      // the record has left** (round MIX-X3, `rideInRoom`): a ride the room
      // cuts short keeps its slope and reaches part of the way, and what it did
      // not cover is the glide after the blend; with no room for a bar of it,
      // no ride at all — blended on the grid and glided after, as a near move.
      if (ho.r.ride > 0) {
        const beats = (ho.r.ride * 4) / ho.m;
        const lineBeat = clock!.beatAt(ho.lineAt);
        moveGrid(lineBeat, beats, (b) => clock!.glide(b, ho.spb, beats));
        note('seam', ho.r.glide > 0
          ? 'the record rides part of the way to the arriving tempo in the room it has left, and the rest is glided after the blend'
          : 'the record rides to the arriving tempo before the blend',
          { from: +heardBpm(current!, ho.lineAt - 1e-3).toFixed(1), to: arriving.bpm, bars: ho.r.ride,
            ...(ho.r.glide > 0 ? { ridesTo: +((60 / ho.spb) * ho.m).toFixed(1), glideBars: ho.r.glide } : {}) });
        return beginTransition(ho.s.bars, deckContextTime(current!, ho.s.at), false, 0, ho.rule, ho.hand);
      }
      return beginTransition(ho.s.bars, Math.max(handFloor(), deckContextTime(current!, ho.s.at)), false, 0, ho.rule, ho.hand);
    } finally {
      if (moving && moving.token === token) moving = null;
    }
  }

  /**
   * **What the hand has asked is what the set already is**, with nothing on its
   * way to change it: no theme arriving under another spell or engine and no
   * aim a move has not yet taken up. A pull let go again, or an engine switch
   * turned back, before anything carried it — so there is nothing to hand over
   * into, and the move that was carrying the first ask is cancelled.
   */
  function takenBack(): boolean {
    const want = asked();
    const h = here();
    if (!sameSpell(want.spell, h.spell) || want.strategy !== h.strategy || want.style !== h.style || want.reach !== h.reach) return false;
    if (pendingAim()) return false;
    if (incoming) {
      const p = placeOf(incoming.track);
      if (!sameSpell(p.spell, h.spell) || p.strategy !== h.strategy || p.reach !== h.reach) return false;
    }
    spellWanted = undefined;
    reachWanted = undefined;
    engineWanted = null;
    return true;
  }

  /**
   * **An ask taken back leaves nothing behind**: the plan it had named for the
   * next seam and a wait it had asked and not laid (F7 of the deep review of
   * 10-08: a bird pulled and put back inside its own preparation left a fill
   * running to an instant nothing was coming at). The set's next theme is
   * planned again, off the tick.
   */
  function letGoOfAsk(): void {
    nextPlan = null;
    if (wait && !wait.laid) wait = null;
    if (running) planAhead();
  }

  /**
   * Where the music is heading — or the aim not yet taken up — under what has
   * been asked: a pull's place.
   *
   * **In place only while the record has somewhere to re-enter** (round
   * MIX-X1). Past the bar the arrangement hands this theme over on, the theme
   * is in its outro: the plan asked for, entered at the same bar, would come in
   * at the end of its own and run out under the hand-over that followed —
   * MEASURED, a bird moved in the last bars of seed 1's first theme: the
   * record ended at bar 152, the arriving theme entered at its 152, and the
   * next theme faded in from nothing over 1.5 s of silence. So from the
   * hand-over bar on, a pull goes where the arrangement was about to go: the
   * next theme, planned under the ask, from its first bar.
   */
  const inPlace = (): Place => {
    const pending = pendingAim();
    if (pending) return wish(pending);
    const h = heading();
    if (!incoming && current && placeOf(current.track).index === h.index && placeOf(current.track).seed === h.seed) {
      const next = wish({ ...h, index: h.index + 1 });
      const from = deckThemeTime(current, handFloor());
      const bs = current.track.barSeconds;
      // The line the move will take (`seamFromHere`, a phrase line with room):
      // at or past the record's own hand-over bar, the arrangement was about
      // to hand over there, and so does the move (round MIX-X3; it used to read
      // the floor, so a pull two bars before the seam went in place onto the
      // seam's own line).
      const line = lineWithRoom(Math.max(0, from) / bs, [PHRASE_BARS, 1], current.track.bars) * bs;
      if (line >= seamOfRecord().at - 1e-6) return next;
      // **And the same place in the plan asked must have room of its own**
      // (round MIX-X3; Eugene, 10-02, seed 1 at 4:50 of a 5:50 theme, Ember to
      // nought: *"the track bar shifted to 0 and didn't move for a while, then
      // the previous track ended and a new one started"*). A spell can change
      // a theme's length — Ember at nought plans seed 1's first theme as 84
      // bars where the house has 152 — and `sameFormTime` then puts the
      // record's bar 128 into the asked plan's last section, clamped to its
      // last bar: MEASURED, the arriving theme entered at 423 s of its 403,
      // the sum fell under -30 dB for eight seconds as the record faded with
      // nothing under it, and the next theme came in at full. The rule is the
      // one above, read on the plan the pull would enter: a place past that
      // plan's own hand-over bar is a place the arrangement would hand over
      // from, so the pull goes to the next theme, from its first bar.
      const asked = wish(h);
      if (!samePlace(asked, h) && sameFormTime(current.track, planAt(asked), from) >= seamOf(planAt(asked)).at - 1e-6) return next;
    }
    return wish(h);
  };

  /** The next theme after where the music is heading, or the aim not yet taken up, under what has been asked. */
  const onward = (): Place => {
    const pending = pendingAim();
    if (pending) return wish(pending);
    const h = heading();
    return wish({ ...h, index: h.index + 1 });
  };

  // Fading a deck out and letting it go belong to a deck, and disposing of the
  // master belongs to the graph it was made by; what belongs to a session is
  // *when*, which is all that is left here.
  const letGo = (deck: Deck, seconds: number, at: number | null = null) => release(ctx, deck, seconds, at);

  // Bring the sum back to where a single deck stands. The seam trims it by
  // 2.5 dB while two decks pass through one master; a seam that is abandoned
  // rather than finished has to hand that back, or the set plays on quiet.
  //
  // From where the dip will be, off the sum's line, and not from `.value` after
  // a cancel, which is where the dip's ramp *began* (R136).
  function resetSum() {
    try {
      sumLine.to(1, ctx.currentTime, 0.12);
    } catch (e) {
      /* already gone */
    }
  }

  // Abandon a seam in flight. Its automation is written in clock times against
  // decks that are about to be thrown away — a fader ramping to zero, a kick
  // gap, a sum sitting in its dip — and none of it means anything once the
  // transport has been sent somewhere else, so every deck but the record goes
  // and the sum comes back. Without this a seek during a seam kept the old
  // hand-over alive: two and a half seconds later it promoted the theme that
  // was arriving and threw the listener back to the start of it.
  /** A far move's ride is running, and its blend has not begun. */
  function ridingAhead(): boolean {
    return !!(transition && incoming && transition.rule.ride > 0 && ctx.currentTime < transition.at);
  }

  /**
   * **Join a ride that is running** (see `move`): the arriving theme the ride
   * was bringing is let go before it has sounded, the record's seam curves and
   * holes are taken back, and the same blend — the same beat of the grid, the
   * same length — is laid again with the plan asked now. When that plan's
   * tempo is not the one the ride is heading for, the ride is re-aimed from
   * the tempo it has reached, past everything already handed to the audio
   * clock, to end on the same beat. A ride that would go nowhere (the ask
   * takes the set back where it is) is not kept, and the move drops it.
   */
  function keepRide(dest: Place, arriving: SetTrack): TransportPoint | null {
    if (!clock || !current || !transition || !incoming) return null;
    const h = here();
    // what is arriving is what is asked: nothing to re-aim
    if (samePlace(dest, placeOf(incoming.track))) return transition;
    // the ask takes the set back where it is: not kept, the move drops the ride
    if (dest.seed === h.seed && dest.strategy === h.strategy && dest.index === h.index && sameSpell(dest.spell, h.spell) && dest.reach === h.reach) return null;
    const endBeat = clock.beatAt(transition.at);
    const { bars, hand } = transition;
    const m = current.perBeat ?? 1;
    const from = clock.beatAt(Math.max(ctx.currentTime + 0.5, current.pumpedTo || 0));
    if (!(endBeat > from + 1)) return null;
    // The ride that is left, re-aimed from the tempo reached: in the room it
    // has (`rideInRoom`, round MIX-X3), the rest glided after the blend.
    const left = ((endBeat - from) * m) / 4;
    const rule = seamTempo((60 / clock.spbAt(from)) * m, arriving.bpm, o, freeSides(current.track, arriving));
    const r = rideInRoom(rule, left + ROOM_BARS, o);
    const target = r.glide === 0 && r.ride > 0 ? arriving.beat * m : clock.spbAt(from) / r.ridden;
    // the arriving deck has not sounded: it goes at once, and the record's
    // seam lines — its fade, its filter, its holes — are the record's again
    letGo(incoming!, 0.02);
    incoming = null;
    transition = null;
    claim(ctx, current, 0.08, `buses.${o.bassGroup}.dry.gain`);
    resetSum();
    if (Math.abs(clock.spbAt(endBeat) - target) > 1e-9 || Math.abs(clock.spbAt(from) - target) > 1e-9) {
      const beats = endBeat - from;
      moveGrid(from, beats, (b) => clock!.glide(b, target, beats));
    }
    aim = dest;
    nextPlan = arriving;
    note('seam', 'a second ask joined the ride', { to: arriving.bpm, bars: +left.toFixed(1), ...(r.glide > 0 ? { glideBars: r.glide } : {}) });
    return beginTransition(bars, clock.timeAt(endBeat), false, 0, { ...rule, ride: Math.max(left, 1e-6), glide: r.ride > 0 ? r.glide : glideBarsFor(rule.ratio, o) }, hand);
  }

  /** A blend is running and the low end has not changed hands: the arriving theme is up, under the record. */
  function blending(): boolean {
    return !!(transition && incoming && ctx.currentTime >= transition.at && ctx.currentTime < transition.swapAt);
  }

  /**
   * **Join a blend that is running** (round MIX-X1; Eugene: *"sometimes when
   * I change a bird close to a song's end it mixes into silence"*). A pull
   * asked while the set's own hand-over was already under way used to land
   * that hand-over at once — the record cut off in 80 ms, the theme arriving
   * promoted from its intro at whatever its fader had reached — and then hand
   * over again a phrase later; MEASURED on seed 1 two seconds before the seam,
   * the sum fell from -17 to -27 dB at the cut. Now the theme that was
   * arriving is let go where it stands, before it has the low end, and the
   * plan asked now comes in at the same bar of the same form (`sameFormTime`)
   * under the same curves — the record's lines where they stand, the fresh
   * deck's from the value the old one's had reached, the sum from its own
   * line — with the same swap and the same end, as though the ask had been in
   * the plan from the start. The grid is pinned through a blend, so a plan
   * whose tempo would have been ridden to is blended here and glided to
   * after, the way a move with no room to ride is.
   *
   * Only the theme the blend is bringing can be joined: a pull is a plan of
   * that theme under another spell. Anything else — another seed, another
   * theme — is not a join, and the caller lands the hand-over as before.
   */
  function joinBlend(dest: Place, arriving: SetTrack): TransportPoint | null {
    if (!clock || !current || !transition || !incoming || !blending()) return null;
    const was = placeOf(incoming.track);
    // what is arriving is what is asked: nothing to join
    if (samePlace(dest, was)) return transition;
    const old = incoming;
    const m = current.perBeat ?? 1;
    const { at, bars, swapAt, hand } = transition;
    const when = startAt(ctx);
    const rule = seamTempo(heardBpm(current, when), arriving.bpm, o, freeSides(current.track, arriving));
    const joined: SeamTempo = rule.ride > 0 ? { ...rule, ride: 0, glide: glideBarsFor(rule.ratio, o) } : rule;
    const freeJoin = joined.kind === 'free';
    // **A free record's blend toward a metered plan is joined too** (the review of 10-18, S5): the grid under it is
    // the arriving theme's alone, so it jumps to the plan asked now where that plan comes in, before its deck is built
    // on it, and the theme that was arriving is let go on the old one as it fades. The free record is not on the grid
    // and plays on to the blend's laid end; no metered tail is under it (`handFloor`). Where the theme that was arriving
    // was free too, the grid had only been pinned, and the jump is the first it makes.
    if (freeDeck(current) && !isFree(arriving)) moveGrid(clock.beatAt(when), 0, (b) => clock!.jump(b, arriving.beat));
    const fresh = sourceDeck(ctx, arriving, compiled(arriving), mixOut, master, clock, when, freeJoin ? 1 : m * joined.perBeat);
    // The same theme under another spell comes in at the same place in the
    // same form; another theme altogether — a cast thrown inside the blend
    // (round MIX-X5) — comes in at the bar the blend is on, counted from its
    // first, so its bar lines are the record's and the swap is where the
    // blend said.
    const sameTheme = dest.seed === was.seed && dest.index === was.index && dest.strategy === was.strategy;
    // (out of a free record, the bar the blend is on is counted in seconds: the blend's bars are the arriving theme's
    // own, laid from its first instant, and the grid under them is about to be the arriving theme's)
    const entry = sameTheme
      ? sameFormTime(old.track, arriving, Math.max(0, deckThemeTime(old, when)))
      : freeDeck(fresh) || freeDeck(current) ? Math.max(0, when - at) : Math.max(0, clock.beatAt(when) - clock.beatAt(at)) * gridBeat(fresh);
    startDeck(ctx, fresh, when, entry);
    letGo(old, 0.08);
    incoming = fresh;
    // The same hand-over, written again from this instant: `writeSeam` folds
    // every point before `when` into the value the line had reached there,
    // so nothing steps. The record's holes are added again with the same
    // bounds, which `schedule` reads as the one hole they are.
    // a free record's blend is on its own bar, as it was laid (`freeSeamBars`); the grid's otherwise
    const barSeconds = freeDeck(current) ? (transition.end - at) / bars : (clock.spbAt(clock.beatAt(at)) * 4) / m;
    transition = { ...scheduleTransition(ctx, current, fresh, at, bars, barSeconds, seamOptions(hand), mixOut, false, when, sumLine), rule: joined, hand };
    aim = dest;
    nextPlan = null;
    planAhead();
    if (!freeJoin) glideAfter(transition.end, fresh);
    layWait();
    note('seam', 'a second ask joined the hand-over', {
      into: String(arriving.seed), atBar: +(entry / arriving.barSeconds).toFixed(2),
      swapInSeconds: +(swapAt - ctx.currentTime).toFixed(2), tempo: `${joined.kind} ${+joined.ratio.toFixed(3)}`,
    });
    emit();
    return transition;
  }

  function dropSeam(seconds = 0.08, replan = true) {
    if (!transition && !incoming && !retiring) return;
    note('seam', 'a hand-over was abandoned');
    // The record's seam lines and holes were written for a blend that is not
    // coming: taken back, or its fade-out would still play at the old seam's
    // end — a hole of silence (Eugene on 69fccab, a second ask inside a ride).
    if (transition && current && !retiring) claim(ctx, current, seconds, `buses.${o.bassGroup}.dry.gain`);
    if (incoming) letGo(incoming, seconds);
    if (retiring) letGo(retiring, seconds);
    incoming = null;
    retiring = null;
    transition = null;
    seamFreeAt = ctx.currentTime;
    // **An ask in flight keeps its wait** (round MIX-X5). A move drops the
    // hand-over it is taking over *after* it has asked its own wait and before
    // it lays its own seam; nulling that unlaid wait here left `layWait` with
    // nothing to make exact, so it wrote the set's own kind of wait — which
    // the ring does not draw — and every bird's fill froze where it stood
    // (MEASURED: Ember pulled and the dice thrown 300 ms later, the fills at
    // 0.01 for 53 s while the cast's node ran). A laid wait is this hand-over's
    // and goes with it.
    if (wait && wait.laid) wait = null;
    glideToCurrent();
    resetSum();
    // A hand-over that is about to be built has its own arriving theme, so it
    // says so rather than paying for a preparation of a theme nobody will hear.
    // In an idle slot, and not here: this is reached from the tick's own swap.
    if (replan && !nextPlan) planAhead();
    return true;
  }

  // A skip or a back landing inside a blend: the hand-over in flight lands at
  // once — the arriving theme is the record — and the seam that was shaping it
  // is dropped rather than left running underneath the new cut.
  function interruptSeam(replan = true, hard = true) {
    if (!transition && !incoming && !retiring) return;
    // **A ride the blend has not reached is dropped, not landed.** The theme
    // it was riding to has not sounded — it starts where the ride ends, as
    // much as sixteen bars away — so landing it would let the record go and
    // leave silence until then. The record stays, and leans back from where
    // the ride had got to (`dropSeam`).
    //
    // **And so is any hand-over whose blend has not begun** (round MIX-X5),
    // under an ask that is not a cut. The arriving deck starts at the blend's
    // own instant and has not sounded; the record has not begun to fade.
    // Landing it here cut the record off in 80 ms and put the arriving theme
    // on from its first bar at once — MEASURED, the dice thrown and Ember
    // pulled 260 ms later: the seed turned over at the pull, forty seconds
    // before the hand-over a listener was promised. The record stays, and the
    // ask lays its own hand-over from here, into the place that was arriving.
    if (ridingAhead() || (!hard && incoming && transition && ctx.currentTime < transition.at)) {
      dropSeam(0.08, replan);
      return;
    }
    // **A hand-over past its swap is left to play out** (round MIX-X1). The
    // record is the theme that arrived; the one it replaced is on its way out
    // on the curves the seam wrote it, and a pull asked now has no reason to
    // cut that tail off in 80 ms — only the seam's bookkeeping is let go, so
    // the pull's own hand-over can be laid from the record, and the sum comes
    // back over what is left of the tail rather than in a step. A cut (a skip,
    // a back) still lands everything at once: it is a hand asking for a
    // record now.
    if (!hard && !incoming && transition && retiring) {
      note('seam', 'a hand-over was left to play out under a new ask', { tailSeconds: +(retiringUntil - ctx.currentTime).toFixed(2) });
      claim(ctx, current!, 0.08, `buses.${o.bassGroup}.dry.gain`);
      transition = null;
      // a free record's own seam is not armed under a metered tail either (`handFloor`): it is free from the tail's end
      seamFreeAt = freeDeck(current!) && !freeDeck(retiring) ? Math.max(ctx.currentTime, retiringUntil) : ctx.currentTime;
      if (wait && wait.laid) wait = null;
      try { sumLine.to(1, ctx.currentTime, Math.max(0.12, retiringUntil - ctx.currentTime)); } catch (e) { /* already gone */ }
      glideToCurrent();
      if (replan && !nextPlan) planAhead();
      return;
    }
    promote(); // a no-op if the swap has already happened
    // Which bus the low end changed hands on is the seam's, so the session
    // names the path the hand-over wrote rather than the deck reading a style.
    claim(ctx, current!, 0.08, `buses.${o.bassGroup}.dry.gain`);
    dropSeam(0.08, replan);
  }

  // The moment the low end changes hands, the arriving theme *is* the record:
  // it becomes `current`, the index moves, and the readout names it. The theme
  // it replaced keeps playing out of `retiring` until the blend ends, which is
  // what a DJ leaves up. Splitting these two used to be one step, and that is
  // why the index did not move until the very end of a cut.
  function promote() {
    if (!incoming) return;
    // A tail still playing out from the hand-over before this one — a pull
    // asked inside that tail laid this one — goes with a short fade rather
    // than a cut: its fader is on its way to nought already.
    if (retiring) letGo(retiring, 0.3);
    retiring = current;
    retiringUntil = transition ? transition.end : ctx.currentTime;
    current = incoming;
    incoming = null;
    current.gaps = null;
    // **The one instant a set changes hands.** The low end changing hands is
    // where a hand-over stops being a promise, so it is where the master seed,
    // the spell, the recipe, the engine and the theme index all turn over
    // together — to the place the arriving theme was planned at, whichever
    // move planned it and whatever was overtaken on the way — which is what
    // makes the readout say the new seed at the boundary rather than at the
    // throw, with no second rule to keep them in step.
    const p = placed.get(current.track);
    if (p) {
      if (p.seed !== masterSeed) {
        note('cast', 'the set changed hands', { from: masterSeed, to: p.seed });
        retuneMaster(p);
      }
      // The engine changes hands here too, and here only. Everything the set
      // plans from now is planned under it, and `state()` reports it, so the
      // readout's strategy follows the music and not the ask.
      if (p.strategy !== (o.strategy ?? DEFAULT_STRATEGY)) {
        note('engine', `the engine changed hands to ${p.strategy}`, { from: o.strategy ?? DEFAULT_STRATEGY, to: p.strategy });
      }
      masterSeed = p.seed;
      o.spell = p.spell;
      o.recipe = p.recipe;
      o.reach = p.reach;
      o.strategy = p.strategy;
      o.style = p.style;
      // **An ask is spent only by the theme that carries it.** A spell asked
      // while this seam was already in flight is still waiting for a seam of
      // its own, and forgetting it here would put the ring's held birds and the
      // set's own answer out of step for a whole theme.
      if (spellWanted !== undefined && sameSpell(spellWanted, p.spell)) spellWanted = undefined;
      if (reachWanted !== undefined && reachWanted === p.reach) reachWanted = undefined;
      if (engineWanted && engineWanted.strategy === p.strategy && engineWanted.style === p.style) engineWanted = null;
    }
    // ...and the master's tone turns over with it, over a bar of the arriving theme.
    toneOfTheme(current, ctx.currentTime, current.program.barSeconds);
    releaseOfTheme(current);
    n = current.track.index != null ? current.track.index : n + 1;
    // The aim is reached: from here a press counts from the music again.
    if (aim && aim.seed === masterSeed && aim.index === n) aim = null;
    // Only when it did (round S8): an in-place move re-plans the same theme and
    // hands the low end to a bass that may be the one already playing, note for
    // note and setting for setting, and the ledger said it changed hands on
    // every one of them.
    if (!retiring || lowEndDiffers(retiring.track, current.track))
      note('seam', 'the low end changed hands', { theme: n + 1, key: current.track.key.name, bpm: current.track.bpm,
        bars: current.track.bars, length: clockOf(minutesOf(current.track.bars, current.track.bpm)) });
    // **And the theme that has just arrived takes the hand's seasoning.** A
    // spell asked while this seam was already in flight could not reach the
    // plan the seam was carrying — that theme was built before the ask — so the
    // ask reaches its notes here instead, the moment they are the notes that
    // will sound. With nothing asked this writes nothing.
    reseason();
    // Planned ahead during the blend, found by its place; prepared off the tick.
    nextPlan = plannedAt(wish({ ...here(), index: n + 1 }));
    planAhead();
    emit();
  }

  /**
   * **The swap taken back** — `promote` the other way, while the theme it let
   * go still plays out its tail: that deck is the record again and the one
   * that arrived is arriving again, the set's place turns back to the theme
   * the record is, and an ask the swap had spent — a pull, a reach or an
   * engine switch carried by a theme of this same set — is asked again, so a
   * seek after this lays it again (`seek`). A cast's swap taken back is a cast
   * abandoned, as a seek inside one has always been (R20).
   */
  function unpromote(): void {
    if (!retiring || !current) return;
    const back = placed.get(retiring.track);
    if (!back) return;
    const gone = placed.get(current.track);
    if (gone && gone.seed === back.seed) {
      if (spellWanted === undefined && !sameSpell(gone.spell, back.spell)) spellWanted = gone.spell;
      if (reachWanted === undefined && gone.reach !== back.reach) reachWanted = gone.reach;
      if (!engineWanted && (gone.strategy !== back.strategy || gone.style !== back.style)) engineWanted = { strategy: gone.strategy, style: gone.style };
    }
    if (back.seed !== masterSeed) {
      note('cast', 'the set changed hands back', { from: masterSeed, to: back.seed });
      retuneMaster(back);
    }
    masterSeed = back.seed;
    o.spell = back.spell;
    o.recipe = back.recipe;
    o.reach = back.reach;
    o.strategy = back.strategy;
    o.style = back.style;
    incoming = current;
    current = retiring;
    retiring = null;
    n = current.track.index != null ? current.track.index : back.index;
    nextPlan = null;
    note('seam', 'the swap was taken back: the theme it let go is the record again', { theme: n + 1 });
  }

  function finishTransition() {
    promote(); // a no-op if the swap has already happened
    note('seam', 'the hand-over landed');
    if (retiring) teardown(retiring);
    retiring = null;
    transition = null;
    seamFreeAt = ctx.currentTime;
    emit();
  }

  // The theme that is left is now the only one on the grid, so the grid goes
  // to its tempo — linear in BPM, beginning past everything already
  // scheduled, over what the seam's rule gives what is left (`glideBarsFor`):
  // sixteen bars for a drift, a bar a percent for anything more, in the
  // theme's own bars; nothing at all after a far jump, which was ridden onto
  // this theme's tempo before it sounded. A set never jumps; it leans (a seek aside: `jump`).
  //
  // **Past everything already handed to the audio clock** (R82): the glide
  // used to begin half a second out while a hidden page fills a second and a
  // half ahead, so beats already scheduled were re-timed under notes that had
  // already been given their instants.
  function glideToCurrent() {
    // a free record is not on the grid: there is nothing to lean toward (the second clock)
    if (!clock || !current || freeDeck(current)) return;
    const from = clock.beatAt(Math.max(ctx.currentTime + 0.5, current.pumpedTo || 0));
    // The program's beat and not the plan's: a deck reads its tempo off the
    // program since K6, and the glide had been the one reader left on the plan
    // — times the beats of it a grid beat carries.
    const target = gridBeat(current);
    const over = Math.max(1, (glideBarsFor(clock.spbAt(from) / target, o) * 4) / (current.perBeat ?? 1));
    moveGrid(from, over, (b) => clock!.glide(b, target, over));
  }

  // **The grid moved under the decks that are playing, and their curves with
  // it** (R2). A pin or a glide changes where every beat after `beat` falls;
  // the notes follow because the pump asks the clock for each one, but a
  // deck's curves were laid once on the grid as it stood, so they are held
  // before the change and laid again after it, from the instant it begins, and
  // the dotted-eighth delay leans with the tempo over the `over` beats the
  // change takes. Hands back what the change does.
  /**
   * The grid leans to the arriving theme's own tempo from the blend's end, over
   * what the seam's rule gives what is left (`glideBarsFor`): sixteen bars for
   * a drift, a bar a percent for anything more, in the arriving theme's own
   * bars; nothing at all after a far jump, whose ride ended on this tempo.
   */
  function glideAfter(end: number, arriving: Deck) {
    const beat = clock!.beatAt(end);
    const target = gridBeat(arriving);
    const over = Math.max(1, (glideBarsFor(clock!.spbAt(beat) / target, o) * 4) / (arriving.perBeat ?? 1));
    moveGrid(beat, over, (b) => clock!.glide(b, target, over));
  }

  function moveGrid<T>(beat: number, over: number, change: (beat: number) => T): T {
    const held = [current, incoming, retiring].filter((d): d is Deck => !!d).map(holdCurves);
    const out = change(beat);
    const from = clock!.timeAt(beat);
    const until = clock!.timeAt(beat + over);
    for (const h of held) relayDeck(ctx, h, from, until);
    return out;
  }

  function tick() {
    if (!running) return;
    ticking = true;
    try {
      step();
    } catch (err) {
      ticksFailed += 1;
      if (ticksFailed <= 3) console.error('mix tick failed', err);
      // a fault the ledger names (K33): what threw, in its own words, no stack
      note('fault', 'the mix tick threw', { error: String((err as Error)?.message ?? err).slice(0, 120) });
    } finally {
      ticking = false;
    }
    // and a voice's note that threw inside a deck (the deck drops the one note
    // and counts it): a line for the step, as the late counter is
    for (const d of [current, incoming]) {
      if (!d) continue;
      const f = d.failed || 0, was = failedSeen.get(d) || 0;
      if (f > was) { failedSeen.set(d, f); note('fault', `${f - was} ${f - was === 1 ? 'note' : 'notes'} of a voice threw`, { total: f }); }
    }
  }
  const failedSeen = new WeakMap<Deck, number>();

  let ticksFailed = 0;
  // The clock time the last blend finished at. Nothing hands over under a
  // hand-over: the next seam is planned from here.
  let seamFreeAt = 0;

  /**
   * **Where the record hands over on its own**, in its own seconds: the bar a
   * seek re-armed it on, or the one the arrangement chose — on a line, never
   * before the blend that has just ended, and never where the record has run
   * out (`seamPlan`). The tick arms the set's own seam here, and a pull reads
   * it to know whether the record still has a place to re-enter.
   */
  function seamOfRecord(): { at: number; bars: number } {
    const notBefore = Math.max(0, deckThemeTime(current!, seamFreeAt));
    // the plan's seam is a function of the plan and the floor alone, so it is worked out once a record and floor
    // and not forty times a second (the engine review of 10-08, F11)
    let planned = plannedSeams.get(current!);
    if (!planned || planned.notBefore !== notBefore) {
      planned = { notBefore, seam: seamPlan(current!.track, blendAsked(current!.track), { boundaryBars: o.boundaryBars, notBefore }) };
      plannedSeams.set(current!, planned);
    }
    return { at: current!.seamAt ?? planned.seam.at, bars: current!.seamBars || planned.seam.bars };
  }
  const plannedSeams = new WeakMap<Deck, { notBefore: number; seam: ReturnType<typeof seamPlan> }>();

  function step() {
    const horizon = ctx.currentTime + lookahead(ctx, o.lookahead);
    if (current) pumpDeck(ctx, current, horizon);
    if (incoming) pumpDeck(ctx, incoming, horizon);
    // The theme that has handed over is still sounding, so it still needs its
    // events scheduled until the blend is over.
    if (retiring) pumpDeck(ctx, retiring, horizon);

    if (transition && incoming && ctx.currentTime >= transition.swapAt) promote();
    if (transition && ctx.currentTime >= transition.end) finishTransition();
    // a tail left to play out under a new ask (`interruptSeam`) ends where its own blend did
    if (retiring && ctx.currentTime >= retiringUntil) { teardown(retiring); retiring = null; }
    // and the wait is over once everything it named has been heard
    if (wait && wait.laid && !transition && ctx.currentTime >= Math.max(wait.swapAt, wait.heardAt)) wait = null;

    // MEASURED: schedule the seam where the outgoing theme has its last
    // breakdown, so the dip is structural rather than an effect applied over
    // the top of a track that is still going full.
    // **Never while a seek is being built** (the deep review of 10-08): the
    // seam would be laid on the deck the seek is about to replace, and the
    // swap then retired the sought deck and cut it dead at the blend's end.
    // The seek re-arms the seam on the deck it builds.
    if (!transition && current && !(moving && moving.kind === 'seek')) {
      const { at, bars } = seamOfRecord();
      // A far jump into the theme planned next is ridden over the bars before
      // the line (`seamTempo`), laid as the horizon reaches the ride's first
      // bar, and the blend begins on the line itself.
      if (nextPlan && !rode.has(current)) {
        const rule = seamTempo(heardBpm(current, deckContextTime(current, at)), nextPlan.bpm, o, freeSides(current.track, nextPlan));
        const bs = current.track.barSeconds;
        const first = Math.max(at - rule.ride * bs, deckThemeTime(current, Math.max(seamFreeAt, moveFloor())));
        if (rule.ride > 0 && horizon + 0.25 >= deckContextTime(current, first)) {
          const m = current.perBeat ?? 1;
          const beats = (at - first) / gridBeat(current);
          const target = nextPlan.beat * m;
          if (beats > 0) moveGrid(clock!.beatAt(deckContextTime(current, first)), beats, (b) => clock!.glide(b, target, beats));
          rode.set(current, beats > 0 ? { ...rule, ride: (at - first) / bs } : { ...rule, ride: 0, glide: glideBarsFor(rule.ratio, o) });
        }
      }
      const point = deckContextTime(current, at);
      // Armed as the horizon reaches the point, not the clock: with a long
      // look-ahead and a slow hidden-page tick, waiting for the clock would
      // start the incoming theme a second off the bar.
      if (horizon + 0.25 >= point) {
        beginTransition(bars, Math.max(startAt(ctx), point), false, 0, rode.get(current) ?? null);
      } else if (point - ctx.currentTime <= BUILD_AHEAD_S && !(arrival && arrival.track === nextPlan)) planAhead();
    }
    emit();
  }

  return {
    // True when a deck's graph took channels in on this call (a clean state
    // installs none, src/source-mix.ts): its notes already scheduled went
    // straight to their buses. Every deck that is sounding is handed it — the
    // theme that has handed over and is playing out as well, which a solo set
    // after the swap used to leave out, silencing the old theme's other voices
    // until its teardown, and which closing the view then left as it was (R51).
    setSourceMix(state: SourceMix): boolean {
      sourceMix = state;
      let took = false;
      for (const d of [current, incoming, retiring]) if (d && d.graph.setSourceMix(state)) took = true;
      return took;
    },
    get state() {
      return state();
    },
    subscribe(fn: (state: MixState) => void) {
      listeners.add(fn);
      fn(state());
      return () => listeners.delete(fn);
    },
    // `fromSeconds` is where the set was left — a pause, a reload, a seek made
    // while it was stopped — and it is not always a position inside one theme
    // playing on its own. A set paused in the middle of a blend has two decks
    // up, so the seam the plan puts there is worked out first and the
    // hand-over is rebuilt at the stage it had reached: before it, one deck as
    // ever; inside it, both; past it, the theme that arrived is the record.
    //
    // `woken` (K42) is a context the caller is already waking: the device's
    // start — MEASURED 80 ms to a whole second before a fresh context's clock
    // runs — is then waited for only where it is needed, at the anchor, and the
    // plan, the compile and the voices are built while it wakes rather than
    // after. Nothing is anchored before it settles, so the record starts where
    // and as it always did; it only stops waiting in series.
    async start(themeIndex = 0, fromSeconds = 0, woken?: Promise<unknown>): Promise<MixState> {
      if (running || dead) return state();
      const token = ++startToken;
      const cancelled = () => dead || token !== startToken;
      if (!woken && ctx.state === 'suspended') await ctx.resume();
      if (cancelled()) return state();
      n = Math.max(0, themeIndex);
      let from = Math.max(0, Number(fromSeconds) || 0);
      let first = plan(n);
      startMark('planned');
      // **A free theme's seam is as long as it is laid** (the review of 10-18): out of a free theme the blend is its
      // seconds on the bar of the theme it hands to (`freeSeamBars`), which is up to half a bar from its own bars
      // counted at four seconds; `beginTransition` lays it so, and the position is read against the same seconds.
      // A metered theme's seam is its own bars, as ever.
      const laid = (track: SetTrack, s: ReturnType<typeof seamOf>, i: number) => {
        if (!isFree(track)) return s;
        const fs = freeSeamBars(track, plan(i + 1), s.bars, track.barSeconds);
        return { ...s, seconds: fs.bars * fs.barSeconds };
      };
      let seam = laid(first, seamOf(first), n);
      let stage: number | null = null;  // seconds since the seam began, when we are inside one
      let ended = 0;     // how long ago the blend before this theme finished
      for (let guard = 0; guard < 8; guard++) {
        if (from < seam.at) break;
        if (from < seam.at + seam.seconds) { stage = from - seam.at; break; }
        // The blend is over, so the theme that arrived at it is the record and
        // the position is its own: the readout and the star name that theme
        // rather than the one it replaced.
        from -= seam.at;
        ended = from - seam.seconds;
        n += 1;
        first = plan(n);
        seam = laid(first, seamOf(first, seam.seconds), n);
      }
      // **The next theme is planned off the page's thread** (the planning perf
      // round, 10-12): it waited on this start before the first note — a whole
      // plan, 50 ms and more for the Drum & Bass tile — and is not wanted until
      // the seam, so `ahead` asks the planner's worker for it once the set is
      // running. A start inside a blend, or a few bars before its seam, wants
      // it now and plans it here, as it always did.
      const nextNow = stage != null || seam.at - from < NEXT_NOW_S;
      nextPlan = nextNow ? plan(n + 1) : plannedAt(wish({ ...here(), index: n + 1 }));
      // the first theme's strings and hats before a note is scheduled, the
      // next theme's on their way while the first plays — and when the set is
      // being picked up inside a blend, the arriving theme's before it is
      // built, because it is about to sound too.
      compiled(first);
      startMark('compiled');
      await ready(first, from);
      startMark('voices');
      // Stopped while that was rendering: nothing is built, no clock is
      // started, and what a second gesture asked for is the set that plays.
      if (cancelled()) return state();
      if (stage != null) {
        await ready(nextPlan, stage);
        if (cancelled()) return state();
      } else if (nextPlan) {
        ready(nextPlan);
      }
      if (woken) {
        await woken;
        if (cancelled()) return state();
      }
      // One grid for the night, starting at the tempo the first theme was
      // drawn at.
      clock = makeSetClock(first.beat, ctx.currentTime);
      // Where the position being resumed from is put: the render head plus
      // the transport's lead, so the first bar of the record — and, inside a
      // blend, the first bar of both decks, since `beginTransition` lays the
      // arriving deck out from this same instant — is scheduled ahead of the
      // head rather than behind it. The set's clock is read from it, so the
      // pin and the glide are on the same grid as the notes.
      //
      // **Read once the deck is built** (the UI-fix round of 10-11): the
      // deck's graph, its tone and its release are built on this same task,
      // and the head goes on moving while they are — a start that read its
      // anchor first and built after aimed its first notes up to 60 ms behind
      // the head on a deep buffer, five or six late on most restarts of a
      // stopped context in Chromium (none on 2.0.0's lighter decks).
      current = sourceDeck(ctx, first, programOf(first), mixOut, master, clock);
      // The set opens at its first theme's own tone, before a note of it sounds.
      toneOfTheme(current, ctx.currentTime, 0);
      releaseOfTheme(current);
      const at = startAt(ctx);
      // A blend that finished before the position we are resuming at still
      // owns the room it took: the next seam is planned from where it ended.
      seamFreeAt = ended > 0 ? at - ended : 0;
      startDeck(ctx, current, at, from);
      leadUntil = at;
      leadFrom = from;
      startMark('deck', { at });
      running = true;
      // The hand-over the position was inside, built again at the stage it had
      // reached: both decks at their own offsets, the grid pinned as it was,
      // and the fader, the filter and the kick and bass gaps joined where the
      // curves stood rather than started over.
      if (stage != null) beginTransition(seam.bars, at - stage, false, stage);
      timer = startClock(tick, TICK_MS);
      // the next theme, off the thread, where the start left it to `ahead`
      if (!nextPlan) planAhead();
      // The moment the page is hidden the horizon jumps out by a second and a
      // half, and that stretch has to be filled before the timers slow down.
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', tick);
      // A note the first pumps reach late is this start's fault and not the
      // machine's, and says so in the count, so the bench's log can tell a
      // stumble from a transport that aimed behind the head.
      noteTransportStart(ctx);
      // From here a line written anywhere knows where the set is. It is taken
      // away again by `stop`, so a ledger line after a stop says the seed and
      // no bar rather than the bar the set happened to die on.
      keepPlace(placeNow);
      note('transport', 'the set started', {
        theme: n + 1, from: +from.toFixed(2), bpm: first.bpm, key: first.key.name,
        bars: first.bars, length: clockOf(minutesOf(first.bars, first.bpm)),
        room: first.presetLabel, strategy: o.strategy ?? DEFAULT_STRATEGY,
      });
      tick();
      startMark('pumped');
      return state();
    },
    // A stop is a fade, and the fade and the letting go are one operation.
    // They used to be two: the mix scheduled its 60 ms ramp and the control
    // disconnected the mix's output in the same turn, which took the ramp
    // away and cut the record off wherever the waveform happened to be. The
    // wire out is pulled once the ramp has been heard and the chain behind it
    // has had time to run dry. Returns how long that is, in seconds, so
    // whoever asked can wait for silence rather than guess at it.
    stop() {
      // Before anything is let go, so the line says the bar the set was on and
      // not the nought a torn-down deck answers with.
      note('transport', 'the set stopped');
      keepPlace(null);
      dead = true;
      startToken += 1;
      // A move waiting on a landing stops here too, and a hand-over that was
      // asked for is claimed by nobody.
      supersede();
      spellWanted = undefined;
      reachWanted = undefined;
      engineWanted = null;
      aim = null;
      running = false;
      if (timer) timer();
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', tick);
      for (const d of [current, incoming, retiring]) if (d) letGo(d, STOP_FADE);
      dropArrival();
      current = null;
      incoming = null;
      retiring = null;
      transition = null;
      wait = null;
      emit();
      listeners.clear();
      setTimeout(() => {
        try { mixOut.disconnect(); } catch (e) { /* gone */ }
        master.dispose();
      }, STOP_SILENT_MS);
      return STOP_SILENT_MS / 1000;
    },
    // A short DJ cut rather than a hard stop: the same bass-swap discipline in
    // a quarter of the bars.
    //
    // Stopped, there is no cut to make, but the set still moves: the index and
    // the plan step forward so the interface can redraw and pressing play
    // starts on the theme that is now showing. Returning null and changing
    // nothing is why this read as a dead control.
    // A tap during a seam used to be swallowed. Now the hand-over in flight
    // lands at once — the arriving theme becomes the record, the one it
    // replaced is left to play out — and the next cut starts from there, so a
    // second tap is a second cut rather than nothing.
    //
    // **It waits for the theme it is going to**. The next theme
    // is warmed as soon as it is planned, so the wait is a turn of the event
    // loop and the press is answered on the same beat it always was; a landing
    // nobody has warmed — a back to a theme the set has passed — is built
    // first instead of on the scheduling tick under the cut.
    //
    // **A press retargets whatever is in flight** (step 1c): it counts from the
    // theme the transport is *aiming* at and not from the one playing, so five
    // nexts inside a second land five ahead. Nothing is refused and nothing
    // stops; `pick` is read after `interruptSeam`, so a press that lands the
    // hand-over in flight aims from the theme that has just become the record.
    //
    // It counts from where the music is *heading*: inside a blend that is the
    // theme arriving, which the cut lands at once, so a next pressed there goes
    // to the theme after it. It used to count from the theme leaving, and the
    // landing then cleared the aim and the cut planned theme `null` (`1#null`).
    async skip(): Promise<TransportPoint | null> {
      if (!running || !current) return stepWhileStopped(1);
      const f = from();
      const want: Place = { ...f, index: f.index + 1 };
      aim = want;
      note('transport', 'a skip was asked for', { from: n + 1, to: want.index + 1, ...(want.seed !== masterSeed ? { seed: want.seed } : {}) });
      return move(() => wish(want), 'cut', 1, 'skip');
    },
    // Cheap because a theme is only a seed: go back one and blend into it.
    async back(): Promise<TransportPoint | null> {
      if (!running || !current) return stepWhileStopped(-1);
      const f = from();
      const want: Place = { ...f, index: Math.max(0, f.index - 1) };
      aim = want;
      note('transport', 'a back was asked for', { from: n + 1, to: want.index + 1, ...(want.seed !== masterSeed ? { seed: want.seed } : {}) });
      return move(() => wish(want), 'cut', 1, 'back');
    },
    /** The theme a press would count from: what is aimed at, or where the music is heading. */
    get aim() {
      return from().index;
    },
    // A cast is a mix, not a restart (Eugene, 09-19). The dice roll a new set
    // and the transport hands over from where the record is into that set's
    // first theme, on the next bar line, over the blend the set-plan owns —
    // which is the same hand-over the set makes between two of its own themes,
    // pointed somewhere else. What the cast *becomes* — the seed, the spell,
    // the theme index, the readout — all turns over at the swap, so nothing
    // about the music or the face changes at the throw except the band's coming
    // lanes, which are what says a new set is on its way.
    //
    // Stopped, there is nothing to hand over from and nothing happens here: the
    // interface starts the set on the new seed, which is what a cast on a
    // stopped ring has always done.
    //
    // @param seed the master seed of the set arriving
    // @param spell the spell it is cast under; left out, the set keeps its own
    //
    // `themeIndex` and `strategy` are the journal's (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3b): a
    // back across a cast is a hand-over into a *stated place* — the seed, the
    // theme of it, the engine and the spell it was heard under — and that is
    // this call with all four named rather than a second door beside it. The
    // dice name none of them and get theme zero under the set's own engine,
    // which is what a cast has always been.
    cast(seed: string | number, { spell, themeIndex = 0, strategy, recipe = o.recipe }: {
      spell?: Partial<Spell> | null; themeIndex?: number; strategy?: string | Strategy | null; recipe?: Recipe | null;
    } = {}): Promise<TransportPoint | null> {
      if (!running || !current) return Promise.resolve(null);
      const next = String(seed);
      // Left out, the set keeps the spell the hand has asked for: the dice roll
      // *inside* the held box.
      const under = spell === undefined ? asked().spell : spell;
      const i = Math.max(0, Math.floor(Number(themeIndex) || 0));
      // A stated engine is this place's (a journal walk); the dice name none
      // and the set's own goes with it, the one a hand has asked for included.
      const engine = strategy == null ? null : strategyById(strategy);
      if (engine) engineWanted = null;
      const was = asked();
      const place: Place = {
        seed: next, index: i, strategy: engine ? engine.id : was.strategy, style: engine ? engine.style : was.style,
        spell: under, recipe: recipe ?? null, reach: was.reach,
      };
      // The spell a cast names is what the hand has asked for from here.
      if (spell !== undefined && spellWanted !== undefined) spellWanted = under;
      // **The aim moves at the ask**, so a press made while the new set is
      // being built counts from the theme it arrives on.
      aim = place;
      // The ledger names the theme arriving once it is planned, off the page's
      // thread like every landing (`landingOff`), and before anything is laid.
      const from = masterSeed;
      return move(() => wish(place), 'cast', 1, 'cast', (arriving) => note('cast', 'a cast was asked for', {
        from, to: next, theme: i + 1, bpm: arriving.bpm, key: arriving.key.name, room: arriving.presetLabel,
      }));
    },
    /**
     * The spell the set is cast under, changed while it plays.
     *
     * `?spell=` and `?recipe=` are read once, when the set is made; this is the
     * same layer moved by a hand (`notes/archive/2026-09-plans/cited/PLAN-BIRDS-UX.md` §3: *"a held bird
     * re-plans what follows from the next phrase line"*). What follows is the
     * next theme, re-planned under the new spell, and it arrives through the
     * same hand-over a cast uses — on a phrase line rather than a bar line,
     * because a pull is a promise about what comes next and not a hand asking
     * for a record now.
     *
     * The theme that is playing keeps the spell it was planned under, the way a
     * room change has always worked: a plan is a plan, and nothing re-writes
     * one that is sounding.
     *
     * Asking for the spell the set is already under plans nothing and hands
     * back nothing, so a face may call this on every release without checking.
     */
    setSpell(spell: Partial<Spell> | null): Promise<TransportPoint | null> {
      // Against the spell the set is *going* to be under, not only the one it
      // is under: while a hand-over runs, the set has already been asked for
      // the arriving one, and asking again for the same thing must plan
      // nothing rather than start a second hand-over on top of the first.
      if (sameSpell(spell, asked().spell)) return Promise.resolve(null);
      spellWanted = spell;
      // Stopped, there is nothing to hand over from: the spell is simply the
      // set's from here, and the first theme played is planned under it.
      if (!running || !current) {
        o.spell = spell;
        spellWanted = undefined;
        nextPlan = null;
        emit();
        return Promise.resolve(null);
      }
      // **And the seasoning is immediate.** A held bird asks two things at once
      // and they land at two different times: what it asks of the *structure*
      // is a promise about the next theme, and what it asks of the **seasoning**
      // is a number on a note. Every note this deck has not yet handed to the
      // audio clock is given the new number here, so the next one to sound is
      // already seasoned — a lookahead rather than a phrase line. A voice
      // already ringing keeps what it was started with; there is no setter on a
      // running instrument and that is a round of its own.
      seasoned = reseason();
      // **A pull taken back before anything carries it** is the set as it is:
      // the move that was carrying it is cancelled and nothing is planned.
      if (takenBack()) {
        if (moving && moving.kind === 'spell') supersede();
        letGoOfAsk();
        emit();
        return Promise.resolve(null);
      }
      note('spell', 'a spell was set', {
        ...(spell ? Object.fromEntries(Object.entries(spell).map(([k, v]) => [k, +(+(v as number)).toFixed(3)])) : { at: 'the house' }),
        // the tempo the spell's Ember stands at, the notch the ring reads (K40)
        bpm: Math.round(derive(asSpell({ ...HOUSE, ...(spell || {}) })).tempoCentre),
        into: onward().index + 1,
      });
      // **In place** (Eugene, 09-24: *"a bird move keeps the place"*): the
      // theme the music is on, planned again under the asked spell, entering
      // at the bar the record is at (`beginTransition`), and not the next
      // theme from its intro — or the place a skip or a cast is already
      // aiming at, which has not begun, from its start.
      return move(inPlace, 'spell', PHRASE_BARS);
    },
    /**
     * **The engine the set is played under, changed while it plays.**
     *
     * The machine view's one control (`notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` §5b:
     * *"choosing another hands over into the same seed under that strategy as a
     * seam ... never a stop"*). It is `setSpell`'s shape exactly, because it is
     * the same question asked one layer out: the theme that is playing keeps
     * the engine it was planned under — a plan is a plan — and **the next theme
     * of the same seed** is re-planned under the new one and handed over from
     * the next phrase line.
     *
     * The next theme and not theme zero, which is what a cast would do, because
     * the seed does not change: the two engines draw the same room, tempo, key,
     * density and section plan for a given theme and different instruments and
     * figures on them (round K5b), so theme `n + 1` under the other engine *is*
     * the A/B, and throwing a listener eight minutes back to theme one is not.
     *
     * Asking for the engine the set is already under — or the one it is already
     * handing over into — plans nothing at all.
     *
     * Stopped, there is nothing to hand over from and the engine is simply the
     * set's from here; the URL is what carries it, which is what `?v=`
     * does.
     */
    setStrategy(id: string | Strategy): Promise<TransportPoint | null> {
      const next = strategyById(id);
      // Against what has been *asked* — synchronously, at the ask — and not
      // what a hand-over has armed a turn later: a switch taken back while its
      // theme was being prepared was compared against the engine still
      // playing, found equal, and ignored, and the set played the engine the
      // hand had just turned away from (R22).
      const was = asked().strategy;
      if (next.id === was) return Promise.resolve(null);
      if (!running || !current) {
        o.strategy = next.id;
        o.style = next.style;
        nextPlan = null;
        emit();
        return Promise.resolve(null);
      }
      engineWanted = { strategy: next.id, style: next.style };
      if (takenBack()) {
        if (moving && moving.kind === 'engine') supersede();
        letGoOfAsk();
        emit();
        return Promise.resolve(null);
      }
      note('engine', `the engine was set to ${next.id}`, { from: was ?? DEFAULT_STRATEGY, into: onward().index + 1 });
      return move(onward, 'engine', PHRASE_BARS);
    },
    /** The engine this set is planning under, and the one it has been asked for. */
    get strategy() {
      return o.strategy ?? DEFAULT_STRATEGY;
    },
    /** Full selection changes hands with the seed and birds, never at the ask. */
    get recipe() {
      return o.recipe ?? null;
    },
    get strategyAsked() {
      return asked().strategy ?? DEFAULT_STRATEGY;
    },
    /** The spell this set is planning under: the house, when nothing was asked for. */
    get spell() {
      return o.spell ?? null;
    },
    /**
     * How many notes the last hand on a bird re-seasoned: the ones this deck
     * had not yet handed to the audio clock. Nothing plays off it; a scenario
     * asks it to say that the immediate half of a pull was immediate.
     */
    get seasoned() {
      return seasoned;
    },
    /**
     * How many plans and compiles the scheduler's tick has had to make for
     * itself since the set was made: a seam that reached a theme nothing had
     * planned ahead. Nothing plays off it; the scenarios hold it at nought.
     */
    get tickWork() {
      return tickWork;
    },
    /**
     * **And what those notes are seasoned with**, by voice, beside how far
     * ahead of the scheduler's own cursor they are. A bench reading over the
     * notes themselves rather than over what was asked for, so a scenario can
     * say the number reached the note and not only the call.
     */
    get seasoning() {
      if (!current) return null;
      const evs = current.program.events;
      const knobs: Record<string, Record<string, number>> = {};
      for (let i = Math.max(0, current.index); i < evs.length; i++) {
        const ev = visitAt(current.program, i);
        const k = ev.p && ev.p.knobs;
        if (k) knobs[ev.voice] = k as Record<string, number>;
      }
      return { index: current.index, total: evs.length, knobs, seasoned };
    },
    /**
     * And the one it has been *asked* for: the same, except while a hand-over
     * a hand asked for is running, when it is the spell arriving. A face asks
     * this before setting one, so that a cell pulled twice to the same value
     * mid-blend is the no-op it looks like.
     */
    get spellAsked() {
      return asked().spell;
    },
    /**
     * **Where a pull that has not landed yet was taking the set** — the theme
     * it was bringing, under the spell asked, and the second of it the landing
     * had reached: since a bird move keeps the place, the theme playing at the
     * bar the record is at, or the arriving deck's own second once the blend
     * has begun — or null when nothing asked of the spell is on its way. A
     * stop reads it before it lets the set go (the fault pass of 09-24, Eugene
     * on the preview: *a change pending at a stop was dropped by the stop*):
     * the address already carries the asked spell, so the set stops at the
     * place the pull was bringing and a play starts there, rather than
     * resuming the theme the ring had promised away. A cast and an engine
     * switch are not in it: the address names neither until the swap, and a
     * stop drops them whole.
     */
    get pendingLanding(): { index: number; spell: Partial<Spell> | null; from: number } | null {
      if (!running || !current) return null;
      const h = here();
      let dest: Place | null = null;
      let from = 0;
      if (incoming) {
        dest = placeOf(incoming.track);
        from = Math.max(0, deckThemeTime(incoming, ctx.currentTime));
      } else if (spellWanted !== undefined && !sameSpell(spellWanted, h.spell)) {
        // a pull not yet armed goes where it would: in place — this theme, at
        // the bar the record is at — or with the aim a skip or cast has taken
        dest = inPlace();
        if (dest.seed === h.seed && dest.index === n) from = sameFormTime(current.track, planAt(dest), Math.max(0, deckThemeTime(current, ctx.currentTime)));
      }
      if (!dest || dest.seed !== h.seed || dest.strategy !== h.strategy || sameSpell(dest.spell, h.spell)) return null;
      return { index: dest.index, spell: dest.spell, from };
    },
    // Seek inside the theme that is playing.
    //
    // **The landing window is built first**. A preparation is a
    // window round where a deck is about to start, and it used to be remembered
    // by the theme alone: a seek to the tenth minute of a theme prepared at its
    // first bar was told it was ready and built its strings under the
    // scheduler. The window is part of the memo now, and the deck waits for it.
    //
    // **What is not resumed, and why.** A note that began before the landing —
    // a pad holding over four bars, the tail in the reverb behind it — is not
    // picked up in the middle: the deck starts at the program's own next event
    // (`firstEvent`), which is what it has always done. Every voice in the
    // registry builds its envelope forward from the instant it is handed, and
    // the contract has no way in to the middle of a note, so "resuming" a held
    // one means striking it again at the landing — a new attack where the music
    // has none, which is the click this same gate forbids, and a level and a
    // filter that are wrong besides, because both are part of the way through a
    // curve nobody wrote down. The tails go the other way: the deck being left
    // is faded rather than cut, so its reverb and its delay ring under the
    // landing instead of stopping at it. What is left is one bar at most of a
    // pad that is missing its own beginning, and the scenario measures the seam
    // for a step rather than asserting the note is there.
    async seek(seconds: number, made: SetTrack | null = null): Promise<number | null> {
      if (!current) return null;
      const token = supersede('seek');
      // A seek is a move inside the record, so a seam in flight is over: the
      // theme that was arriving has not arrived, one fresh deck plays, and the
      // hand is where it has just put itself — the aim goes with the seam.
      aim = null;
      // **A seek made on the theme the swap has just let go** (a drag along
      // the band that spanned the swap, the deep review of 10-08) is a seek
      // inside that theme: the swap is taken back while its tail still plays,
      // and the seek goes on from there as from any record.
      if (made && made !== current.track && retiring && retiring.track === made) unpromote();
      // And the record is claimed from the seam as it is let go (R83): a seek
      // is waited on, and a skip that overtakes the wait finds nothing in
      // flight and cuts from this deck — which still had the seam's curves on
      // it and its kick hole open to the end of the theme.
      const shaped = !!(transition || incoming || retiring);
      dropSeam();
      if (shaped && current) claim(ctx, current, 0.08, `buses.${o.bassGroup}.dry.gain`);
      const deck = current;
      // Where the transport has been told to be, while its landing is built:
      // without it the cursor fell back to the position being left for as long
      // as the preparation took and then jumped.
      //
      // **And never inside the record's last two bars** (round MIX-X1): a
      // landing there leaves the hand-over no bar of the record to begin under,
      // and the band's last two bars are the hand-over in any case — a scrub to
      // the very end lands where that hand-over begins.
      seconds = Math.min(Math.max(0, Number(seconds) || 0), Math.max(0, (deck.track.bars - 2) * deck.track.barSeconds));
      seekingTo = seconds;
      await readyEnough(deck.track, seekingTo);
      if (moving && moving.token === token) moving = null;
      // Overtaken: whatever overtook it has cleared `seekingTo` (`supersede`).
      if (token !== moveToken || dead || current !== deck) return null;
      // Nothing hands over under a seek being built (`step`); whatever did is let go here.
      if (transition || incoming || retiring) {
        dropSeam();
        claim(ctx, current, 0.08, `buses.${o.bassGroup}.dry.gain`);
      }
      const now = ctx.currentTime;
      // The same lead as a start: a seek used to land its first events 70 ms
      // past the clock, which on a device with a large buffer is behind the
      // render head, so every jump wrote a late note of its own. The deck
      // being left goes out where this one comes in rather than at once.
      const at = startAt(ctx);
      // **The grid lands at the theme's own tempo with it** (the deep review
      // of 10-08, B12). A seek out of a far ride or its blend used to keep the
      // grid the ride had reached and glide home from there over as much as
      // sixteen bars — seed 1's theme at 174 BPM leaning back to 104 for 26 s.
      // The seek is a cut, so the clock jumps where the landing comes in, and
      // the deck and its delay are built on the tempo it lands on.
      const program = programOf(deck.track);
      clock!.jump(clock!.beatAt(at), program.beat * (deck.perBeat ?? 1));
      const fresh = sourceDeck(ctx, deck.track, program, mixOut, master, clock!, at, deck.perBeat ?? 1);
      // **And it goes out under the landing rather than before it.** MEASURED
      // (chromium, seed 1, a seek to 55 % of a theme): a 40 ms fade ending
      // where the new deck comes in left **12.7 ms of true silence** in a set
      // whose passages either side of it never fall below -120 dB for a single
      // sample. A landing is a position and not an event: the deck starts at
      // the program's next event, which can be a sixteenth away, and nothing
      // that was ringing before the landing is struck again — so the hole is
      // the width of whatever gap the cursor fell into. The outgoing deck
      // covers it: it keeps the music it has already been filled with, and its
      // reverb and its delay ring under the new deck's first notes for a
      // quarter of a second, which is a hand-over of the shape this transport
      // makes everywhere else rather than a cut.
      letGo(deck, SEEK_FADE, at - 0.05);
      fresh.lineOf('fader.gain')!.write([{ v: 0.0001, t: now, k: 'set' }, { v: 1, t: at, k: 'exp' }], now);
      startDeck(ctx, fresh, at, seconds);
      // A seek is a move inside the record, not an instruction to change it.
      // Landing past the seam the arrangement chose used to begin the
      // transition the instant the finger lifted, so where you clicked the rim
      // decided whether the track changed. Re-arm it on the next sixteen-bar
      // line instead, and if there is no room left for a full blend, shorten
      // the blend rather than cut.
      const bs = fresh.track.barSeconds;
      const full = blendBarsFor(fresh.track, blendAsked(fresh.track));
      const natural = mixPointSeconds(fresh.track, full, o.boundaryBars);
      if (seconds > natural - 0.25) {
        // The next sixteen-bar line if there is room for a handover on it, a
        // four-bar line if not, the next bar as a last resort — and the blend
        // shortened to whatever is left rather than run past the end.
        const here = seconds / bs;
        let line: number | null = null;
        for (const q of [o.boundaryBars || 16, PHRASE_BARS, 1]) {
          const next = Math.ceil((here + 1) / q) * q;
          if (fresh.track.bars - next >= 3) {
            line = next;
            break;
          }
        }
        if (line != null) {
          fresh.seamAt = line * bs;
          fresh.seamBars = Math.max(2, Math.min(full, fresh.track.bars - line - 1));
        }
      }
      current = fresh;
      seekingTo = null;
      toneOfTheme(current, ctx.currentTime, bs);
      releaseOfTheme(current);
      // **And the hand's seasoning goes with it** (R11). The fresh deck is the
      // theme's program as it was compiled, cached and never touched; the deck
      // it replaces had been seasoned by a pull, so a scrub after a pull played
      // the house's settings while the ring held the bird — 1541 kick and sub
      // notes of seed 1. The same rule as every other deck: a note not
      // yet handed to the clock takes what the hand has asked.
      reseason();
      note('transport', 'a seek landed', {
        at: +seconds.toFixed(2), bar: Math.floor(seconds / bs) + 1,
        reArmed: fresh.seamAt != null ? Math.round(fresh.seamAt / bs) + 1 : null,
      });
      // **The hand's ask is laid again from where the seek landed** (the deep
      // review of 10-08; Eugene: *"how it works if birds are in mixing mode
      // but user clicks on track scroll"*). The seek dropped the hand-over a
      // pull, a reach or an engine switch had laid, and nothing laid it again:
      // the ring held the bird as pending while the record played to its own
      // end and then jumped, at the far tempo, into the next theme. The ask is
      // still the set's (`spellWanted`, `reachWanted`, `engineWanted`), so it
      // takes its own door again, from here: a pull or a reach in place on the
      // next phrase line with room, an engine switch into the next theme. A
      // cut or a cast in flight is not an ask the seek keeps — the seek is
      // where the hand has put itself (R20).
      const want = asked(), h = here();
      const engine = want.strategy !== h.strategy || want.style !== h.style;
      if (engine || !sameSpell(want.spell, h.spell) || want.reach !== h.reach) {
        note('transport', 'a seek laid the hand\'s ask again from where it landed', { kind: engine ? 'engine' : 'spell', theme: n + 1 });
        void move(engine ? onward : inPlace, engine ? 'engine' : 'spell', PHRASE_BARS);
      }
      emit();
      return seconds;
    },
    // Changing the room does not cut the record: the theme that is playing
    // keeps the preset it started in and the next one is planned in the new
    // one, so the change arrives through a seam like everything else does.
    setPreset(name: string) {
      o.preset = name;
      if (running && !transition) ready((nextPlan = plan(n + 1)));
      emit();
      return o.preset;
    },
    get preset() {
      return o.preset || 'auto';
    },
    /**
     * **How far a library turn's row may leak beyond its place** (round D1),
     * changed while the set plays — `setSpell`'s shape, because it is one more
     * field of the ask the plan reads: the theme the music is on is planned
     * again at the asked reach and handed over in place from the next phrase
     * line (same section, same bar), joining a hand-over in flight as a second
     * pull does; the ledger names it. `null` is the style's own again. A
     * private-tier hand (the machine view's slider, `reach=`); the shipped
     * page never calls it.
     */
    setReach(reach: number | null): Promise<TransportPoint | null> {
      const r = reachOf(reach ?? (o.style.set as { reach?: number }).reach);
      if (r === asked().reach) return Promise.resolve(null);
      reachWanted = r;
      if (!running || !current) {
        o.reach = r;
        reachWanted = undefined;
        nextPlan = null;
        emit();
        return Promise.resolve(null);
      }
      if (takenBack()) {
        if (moving && moving.kind === 'spell') supersede();
        letGoOfAsk();
        emit();
        return Promise.resolve(null);
      }
      note('spell', 'the reach was set', { reach: r, from: reachOf(o.reach), theme: n + 1 });
      return move(inPlace, 'spell', PHRASE_BARS);
    },
    /** the reach the playing theme was planned at */
    get reach() {
      return reachOf(o.reach);
    },
    /** and the one the hand has asked for, which is the playing one until a pull is spent */
    get reachAsked() {
      return asked().reach;
    },
    planTheme: (i: number) => themeInfo(plan(i)),
    // The set's own room, as the value it was resolved to. Two sets in one
    // context each answer with their own, which is the property the review's
    // "its master EQ depends on whichever preset a previous planning operation
    // left behind" was about; the transport scenarios read it.
    get masterSettings() {
      return masterSettings;
    },
    /**
     * **For anything that only looks.** The deck under the needle and the tail
     * every deck passes through, handed out so that a readout can ask the graph
     * what it is (`graph.describe()`, `master.describe()`) rather than being
     * told by a second document. A set with a hand-over up answers with the
     * *record* and not with the theme arriving, which is the same rule the seed
     * and the theme index follow; a stopped set answers with nothing.
     *
     * They are the handles the transport is playing through, not copies, so a
     * caller may read every node on them and may write to none: nothing outside
     * this file has ever written to a deck and the machine view does not start.
     */
    get record() {
      return current;
    },
    /**
     * **A hand on a stage block** (PLAN-DESK D2): the one write the desk makes
     * on the decks, through each graph's own door (`V1Graph.stage`) — the
     * record, the theme arriving and the one playing out — ramped over 40 ms
     * from now. `null` puts the line back to each deck's own room. Answers
     * how it reached the record: `live`, or why not (heard from the next
     * theme, a program's line writes it, the record has no such box).
     */
    stage(path: string, value: number | null): StageHow {
      // with no record up there is nothing to answer for: the layer alone holds the move
      let said: StageHow = 'unknown';
      const at = ctx.currentTime;
      for (const d of [current, incoming, retiring]) {
        if (!d) continue;
        const v = value ?? roomOf(d.settings, path);
        let how: StageHow;
        try {
          how = v === null ? d.graph.stageHow(path) : d.graph.stage(path, v, at, 0.04);
        } catch (e) {
          how = 'absent'; // a graph already let go
        }
        if (d === current) said = how;
      }
      return said;
    },
    /** And the theme that has handed over and is playing out under it, while it does. For looking only. */
    get playingOut() {
      return retiring;
    },
    /** And the theme arriving at a seam, before the swap. For looking only. */
    get arriving() {
      return incoming;
    },
    master,
    mixOut,
    // The set's last node, after the shared master. A listening bench taps
    // this directly; going round through the sink's MediaStream would re-clock
    // the audio and put a glitch in the capture that is not in the music.
    out: master.out,
  };
}

// --- offline render of a mix ---------------------------------------------
//
// The same set plan, the same decks, the same hand-over and the same scheduling
// contract as the live engine; the only difference is that a render has the
// whole timeline in hand and no deadline, so every deck is poured at once
// rather than filled a horizon at a time. `themeBars` shortens the themes so a
// few seams fit into a test render.
//
// It laid the set out for itself until round E — the same loop as the tool that
// predicted it, held together by a gate that compared the two — and finding 08
// of the technical review is what that cost: a middle deck's incoming kick gap
// overwritten by its outgoing one, and thirty-three kicks under the theme that
// still owned the bottom. There is one layout now (`setLayout`), and one hole
// per hand-over group on each deck.
/** What a render of a whole set may be told, beside the set's own options. */
export interface RenderMixOptions {
  masterSeed?: string | number;
  themes?: number;
  /** a stated theme length, so a few seams fit into a test render */
  themeBars?: number | null;
  tail?: number;
  maxSeconds?: number;
  sampleRate?: number;
  OfflineCtx?: typeof OfflineAudioContext | null;
  /** the set's own options, the strategy among them */
  opts?: Partial<MixOptions>;
  /**
   * stated themes to lay out instead of a seed's own (`layOut`): a hand's move
   * between two seeds or two spells, rendered as the set would play it
   */
  plans?: SetTrack[] | null;
  /** and, for those, a stated seam per hand-over (the outgoing bar and the blend) and the second each theme enters at */
  seams?: ({ bar: number; bars: number } | null)[] | null;
  entries?: number[] | null;
  /**
   * a measuring tool's hand on the set's master once it is built, before a note: a limiter read takes the master's
   * gain straight to the output (`tools/loudness-fit.ts` does the same to one theme's graph). Absent on every path
   * that plays.
   */
  onMaster?: ((master: V1Master) => void) | null;
}

export async function renderMix({
  masterSeed = 1,
  themes = 3,
  themeBars = null,
  tail = 4,
  maxSeconds = 0,
  sampleRate = 44100,
  OfflineCtx = null,
  opts = {},
  plans: stated = null,
  seams: statedSeams = null,
  entries = null,
  onMaster = null,
}: RenderMixOptions = {}) {
  // **Which music, before anything else** — the same first line `createMix` has
  // had since round K5a, and this is where it was missing. An offline set render
  // took `opts.strategy`, carried it through the option bag untouched and then
  // planned the whole set under the *default* style, because `setOptions` forces
  // whichever style it is handed onto the options last and this call handed it
  // `STYLE`. So `renderMix({ opts: { strategy: 'house-v2' } })` rendered
  // house-v1 and said nothing about it, which is the worst shape a bug can
  // have: a named strategy that is quietly ignored is an audition of the wrong
  // record. Found by rendering a set for K5b's listening pass and reading the
  // plan it came back with.
  const o = setOptions(opts.style || strategyFor(opts).style, opts);
  // The whole set, before a node exists: the themes, where each one starts on
  // the set's grid, and every hand-over between them — each seam where the
  // arrangement puts it and never inside the blend before it, the grid held
  // through a blend and gliding to the arriving theme's tempo once the theme it
  // replaced has gone. It is the layout the live engine reaches one seam at a
  // time and the one `tools/setplan.ts` predicts.
  const { plans, starts, startBeats, perBeats, seams, clock } = stated && stated.length
    ? layOutOf(stated, { ...o, style: o.style, seams: statedSeams ?? undefined, entries: entries ?? undefined })
    : setLayout(String(masterSeed), themes, { ...o, themeBars: themeBars || undefined });
  const last = plans[plans.length - 1];
  // a free last theme ends its own seconds after its second nought (the second clock), never by the grid
  const lastEnd = isFree(last)
    ? starts[starts.length - 1] - (entries?.[plans.length - 1] ?? 0) + last.bars * last.barSeconds
    : clock.timeAt(startBeats[startBeats.length - 1] + (last.bars * 4) / perBeats[perBeats.length - 1]);
  let duration = lastEnd + tail;
  // A cap, so the live chain can be measured over a minute or two without
  // rendering a whole set to get there.
  if (maxSeconds > 0) duration = Math.min(duration, maxSeconds);

  const Ctor = OfflineCtx || Offline();
  const ctx = new Ctor(2, Math.ceil(duration * sampleRate), sampleRate);
  // The same rule the live set follows: the shared master is the room of the
  // theme the render opens with, stated here rather than left to whichever
  // plan was made last — and resolved before the await rather than applied
  // after it, so no other render or set can be between the two.
  const masterSettings = settingsOf(plans[0]);
  await prepareLimiter(ctx, masterSettings);
  const master = makeV1Master(ctx, masterSettings);
  master.out.connect(ctx.destination);
  const mixOut = ctx.createGain();
  mixOut.gain.value = 1;
  mixOut.connect(master.input);
  if (onMaster) onMaster(master);

  // the desk's stage moves where the graphs are built, as the live set lays them (D2); none moved, the program's own
  const decks = plans.map((t, i) => { const p = programOf(t); return makeDeck(ctx, t, p, mixOut, master, clock, starts[i], perBeats[i], withStage(p.settings)); });
  decks.forEach((d, i) => startDeck(ctx, d, starts[i], entries?.[i] ?? 0));
  // What the graph is actually given, which is what gets reported: the swap
  // time used to be worked out a second time from the wrong end of the blend,
  // and named 140.8 seconds where the kick really changed hands at 87.7.
  const scheduled = seams.map((s) =>
    scheduleTransition(ctx, decks[s.from], decks[s.to], s.at, s.bars, s.barSeconds, o, mixOut)
  );
  // The master's tone turns over where the live set turns it (round E1): at
  // each swap, over a bar of the arriving theme, where its style says so.
  // A theme whose style does not follow keeps the tone it found, unless the
  // one before it followed: then it walks to its own room's.
  scheduled.forEach((t, i) => {
    const d = decks[seams[i].to];
    const follows = (x: typeof d) => switchOn(x.track.style as Style, 'eqByTheme');
    if (follows(d) || follows(decks[seams[i].from])) master.setProfile(eqProfileOf(d.settings.master), t.swapAt, d.program.barSeconds);
  });
  // The very first deck has no one handing it the bass, so it keeps its own;
  // every other deck keeps both of its gaps, the one it arrives under and the
  // one it leaves under.

  // **The work is bounded by the window, and not only the buffer** (round K6).
  // `maxSeconds` capped the context and nothing else: every deck prepared every
  // voice over its whole timeline and every event of every theme was poured in,
  // whether or not the context was long enough to reach it — so a two-minute
  // cap on a set of 240-bar themes paid for twenty-seven minutes of music.
  // K5b measured what that costs and could not afford it: 16-bar themes in
  // ~14 s, 32-bar in 158, and 80-bar not finished in eleven minutes, on both
  // strategies, which is why its set audition is two minutes of 32-bar themes.
  //
  // `schedule` is asked which events this render can reach, and its answer is
  // what is prepared and what is poured. **The audio that is kept is
  // byte-identical**: an event is admitted on its *onset*, so a swell that has
  // to start before the edge still starts, and an event whose onset is past the
  // end of the buffer could never have been heard. A voice's `prepare` is
  // handed the notes that sound rather than all of them, which is the same
  // filter the live mix has always given it.
  for (const d of decks) {
    // The await used to hand the shared table to whoever ran next, so this
    // deck's params went back on twice — before its voices were prepared and
    // again before its events were fired. Each deck carries its own value and
    // the await cannot take it.
    const reachable = schedule(d.program, d.grid, d.index, duration).events.map((s) => s.pe);
    await prepareVoices(ctx, d.settings, reachable, { all: true }); // offline: no deadline to miss
    pourDeck(ctx, d, duration);
  }
  // Every deck's doors and the sum they meet in, fed nought for the whole
  // render, so a bus that falls quiet between two notes is not switched off
  // and back on at an instant the main thread chooses (`holdOpen` in the
  // engine's scheduler says what that cost in Chromium).
  holdOpen(ctx, [mixOut, ...decks.flatMap((d) => doorsOf(d.graph))]);

  const buffer = await ctx.startRendering();
  return {
    buffer,
    duration,
    themes: plans.map((t, i) => ({
      index: i,
      seed: t.seed,
      bpm: t.bpm,
      key: t.key.name,
      bars: t.bars,
      preset: t.preset,
      startTime: starts[i],
      blendBars: t.blendBars,
      filterMove: t.filterMove,
    })),
    seams: scheduled.map((t) => ({ at: t.at, end: t.end, swapAt: t.swapAt, bars: t.bars })),
  };
}

export default createMix;
