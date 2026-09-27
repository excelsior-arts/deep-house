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
import { generationOf } from './generation.ts';
import { prepareLimiter } from '@deep-house/engine/master';
import { resolveSettings, settingsOf } from '@deep-house/engine/settings';
import { prepareVoices } from '@deep-house/engine/voices';
import { lateInfo, noteTransportStart, Offline, latencies } from '@deep-house/engine/dsp';
import { seamPlan, seamFromHere, mixPointSeconds, blendBarsFor, blendAsked, compilePerformance, programOf, PHRASE_BARS, seamTempo, glideBarsFor, playsKick, sameFormTime } from './performance.ts';
import type { SeamTempo } from './performance.ts';
import {
  applyBypass, readBypass, seamCurves, setOptions, swapAfterBars, themeSeed,
  planTheme as planThemeOf, presetOfTheme as presetOfThemeOf, setLayout as setLayoutOf, layOut as layOutOf,
} from './set-plan.ts';
import type { Bypass, MixOptions, SetPlan, SetTrack, Track } from './set-plan.ts';
// The knob tables of the voices a theme drew, asked of the plan and remembered
// on it: the seasoning a note is re-given live is the seasoning it would have
// been planned with, because it is one function.
import { knobTablesOf } from './generator.ts';
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
import { HOUSE, isHouse, knobsFor, sameSpell, spellFromQuery, recipeFromQuery } from './spell.ts';
import type { Spell } from './spell.ts';
import { spellFrom, weightOf } from './recipe.ts';
import type { Recipe } from './recipe.ts';
import type { SourceMix } from '@deep-house/engine/source-mix';
import { LIBRARY, GENRE_LIBRARY, PINNABLE, recipeById } from './recipes.ts';
import { recipeRequest, accompanimentFor } from './recipe-request.ts';
import { developmentFor } from './development.ts';
import Rng from './rng.ts';
// The ledger is a notebook and not a tap: it touches no node and is in no
// signal path, so what is written here cannot move a sample. Every line is a
// value this file already has at the instant it writes it — where a seam
// begins, when the low end changes hands, which set a cast is arriving into —
// and `src/ledger.ts` says why it runs whether or not anybody is reading it.
import { keepPlace, note, outputClipWriter, report } from './ledger.ts';
import { makeSetClock } from '@deep-house/engine/set-clock';
import { makeV1Master } from '@deep-house/engine/graph';
import {
  claim, deckContextTime, deckThemeTime, gridBeat, holdCurves, lineAfter, makeDeck, pourDeck,
  pumpDeck, relayDeck, release, seasonDeck, startDeck, teardown, writeSeam,
} from '@deep-house/engine/deck';
import { renderProgram, holdOpen, doorsOf } from '@deep-house/engine/scheduler';
import type { RenderOptions } from '@deep-house/engine/scheduler';
import { schedule, visitAt } from '@deep-house/engine/schedule';
import { themeInfo } from '@deep-house/engine/session';
import type { MixState, TransportPoint } from '@deep-house/engine/session';
import type { Deck } from '@deep-house/engine/deck';
import type { SetClock } from '@deep-house/engine/set-clock';
import { line as rampLine } from '@deep-house/engine/ramp';
import type { Line } from '@deep-house/engine/ramp';
import type { Room, Style } from '@deep-house/engine/style';
import type { Strategy } from './strategies/index.ts';
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

/**
 * The whole plan of theme n, in this build's style unless told another. A
 * caller may name the music two ways and they compose: `style` is the music
 * itself, and `strategy` is the id of the thing that plays it. A caller that
 * names neither gets the default strategy's style, which is the record.
 */
export const planTheme = (masterSeed: string | number, n: number, opts: Partial<MixOptions> = {}): SetTrack =>
  planThemeOf(masterSeed, n, { ...opts, accompaniment: accompanimentFor(opts), development: developmentFor(opts), style: opts.style || strategyById(opts.strategy).style });

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
  // A pin reaches the genre rows as well (`GENRE_LIBRARY`); the draw above
  // never does, because it reads `library` and the default is `LIBRARY`.
  const row = recipeById(id, library === LIBRARY ? PINNABLE : library);
  if (!row) {
    throw new Error(`Recipe ${id} is not in this build's library`);
  }
  // A genre row carries no box of its own: the family key's spell is where it
  // plays, and the link names it. Without one it would roll the house's box
  // through a map this generator has not measured; said in words instead.
  if (!named && GENRE_LIBRARY.includes(row))
    throw new Error(`${row.id} is a genre pattern and plays under its family key's spell; the link needs spell=`);
  const request = recipeRequest(row, accompanimentFor(opts));
  // A motif chooses a phrase, not eight new birds. Explicit birds and a
  // named recipe compose: the birds control the setting, the row keeps its wishes.
  return { spell: named ?? (request.motif || request.pin ? null : spellFrom(row, rng, calibrationFor(row))), track: row, name: row.name || row.id, parked: [] };
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
export const startAt = (ctx: AudioContext) => anchorHead(ctx) + START_LEAD;

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
export function createMix(ctx: AudioContext, opts: Partial<MixOptions> = {}) {
  // Which music, before anything else: a strategy is the outermost choice a set
  // makes, and everything below — the set's own numbers, the master's room, the
  // spell, every plan — is made inside it. Nothing asked for is `house-v1`.
  const strategy = strategyFor(opts);
  const o = setOptions(opts.style || strategy.style, opts);
  o.strategy = strategy.id;
  o.accompaniment = accompanimentFor(opts);
  o.development = developmentFor(opts);
  if (strategy.id !== DEFAULT_STRATEGY && typeof console !== 'undefined') {
    console.log(`strategy: ${strategy.id} (${strategy.label})`);
  }
  // **The seed of the set that is playing**, and not of the set that has been
  // asked for. Since 09-19 a cast is a hand-over rather than a stop (Eugene:
  // "once the machine is started it never stops"), so for the length of a blend
  // there are two sets up: this is the one under the needle, and it changes at
  // the swap — the same instant the theme index and the readout change hands.
  let masterSeed = String(opts.masterSeed ?? 1);
  const destination = opts.destination || ctx.destination;

  // A bypass is read once, announced once, and then lives in every theme's
  // audio overrides. The master is built after it is applied, so a bypassed
  // limiter or clipper is really bypassed.
  const bypass = opts.bypass !== undefined ? opts.bypass : readBypass();
  if (bypass && typeof console !== 'undefined') console.log('bypass: ' + bypass.label);

  // The spell, read once and then carried by every theme this set plans. At the
  // house — which is where a set with nothing asked of it sits — the bias above
  // the dice is the identity and every plan is the plan it always was.
  const cast = recipesFor({ ...opts, masterSeed });
  o.spell = cast.spell;
  // The row travels with the set, so every theme it plans is planned under the
  // same `wants` (`src/interpret.ts`). `null` on every path the golden takes.
  o.recipe = cast.track;
  if (o.spell && !isHouse(o.spell) && typeof console !== 'undefined') {
    console.log('spell: ' + Object.entries(o.spell).map(([k, v]) => `${k} ${(+v).toFixed(3)}`).join(', '));
  }

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
    const moves: Array<[string, number]> = [
      ['lowShelf.frequency', M.lowShelfHz], ['lowShelf.gain', M.lowShelfDb],
      ['lowMid.frequency', M.lowMidHz], ['lowMid.gain', M.lowMidDb], ['lowMid.Q', M.lowMidQ],
      ['mid.frequency', M.midHz], ['mid.gain', M.midDb], ['mid.Q', M.midQ],
      ['presence.frequency', M.presenceHz], ['presence.gain', M.presenceDb], ['presence.Q', M.presenceQ],
      ['air.frequency', M.airHz], ['air.gain', M.airDb],
      ['master.gain', M.gain], ['trim.gain', M.trim],
    ];
    const at = ctx.currentTime;
    const over = current ? current.program.barSeconds : 2;
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
  function sourceDeck(...args: Parameters<typeof makeDeck>): Deck {
    const deck = makeDeck(...args);
    if (sourceMix) deck.graph.setSourceMix(sourceMix);
    return deck;
  }

  let retiring: Deck | null = null; // the theme that has handed over and is playing out
  // **What the seam in flight does with the tempo** (`seamTempo`): set as a
  // hand-over begins and read by `settleIn` and a second move; `ride` is the
  // bars the grid was really ridden over before the blend, which a theme too
  // near its end to ride leaves at nought.
  let seamRule: SeamTempo | null = null;
  // The decks whose own seam has had its far ride laid, and the rule it was
  // laid under: the natural seam's ride is laid as the horizon reaches its
  // first bar and the blend is armed later, on the same rule.
  const rode = new WeakMap<Deck, SeamTempo>();
  // The tempo a deck is heard at, at a context instant: the grid's, times the
  // beats of the theme a beat of it carries.
  const heardBpm = (d: Deck, at: number): number => (60 / clock!.spbAt(clock!.beatAt(at))) * (d.perBeat ?? 1);
  let transition: ReturnType<typeof scheduleTransition> | null = null;
  let timer: (() => void) | null = null;
  let running = false;
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
  }
  const placed = new WeakMap<SetTrack, Place>();
  const samePlace = (a: Place, b: Place) => a.seed === b.seed && a.index === b.index && a.strategy === b.strategy
    && a.style === b.style && sameSpell(a.spell, b.spell) && (a.recipe?.id ?? null) === (b.recipe?.id ?? null);

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
  /** A theme already planned at this place, or null: a lookup, never a plan. */
  function plannedAt(p: Place): SetTrack | null {
    for (const r of recent) if (r.preset === o.preset && samePlace(placed.get(r.track)!, p)) return r.track;
    return null;
  }
  function planAt(p: Place): SetTrack {
    const had = plannedAt(p);
    if (had) return had;
    // A plan the tick had to make for itself: a seam that arrived before the
    // idle slot planning its theme did. Counted, so a scenario can say none did.
    if (ticking) tickWork += 1;
    const track = applyBypass(planTheme(p.seed, p.index,
      { ...o, style: p.style, strategy: p.strategy, spell: p.spell, recipe: p.recipe }), bypass);
    placed.set(track, p);
    recent.unshift({ track, preset: o.preset });
    if (recent.length > 6) recent.pop();
    return track;
  }
  /** The set as it is: the record's place. */
  const here = (): Place => ({
    seed: masterSeed, index: n, strategy: o.strategy ?? DEFAULT_STRATEGY, style: o.style,
    spell: o.spell ?? null, recipe: o.recipe ?? null,
  });
  /** The place of a theme this set planned, or where it is if it did not plan it. */
  const placeOf = (track: SetTrack | null | undefined): Place => (track && placed.get(track)) || here();
  /** Where the music is going on its own: the theme arriving, or the record. */
  const heading = (): Place => (incoming ? placeOf(incoming.track) : here());
  /** A place, under what the hand has asked of the sound since. */
  const wish = (p: Place): Place => ({
    ...p,
    ...(spellWanted !== undefined ? { spell: spellWanted } : {}),
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
    if (incoming) {
      const p = placeOf(incoming.track);
      compiled(planAt(wish({ ...p, index: p.index + 1 })));
      return;
    }
    if (!nextPlan) nextPlan = plan(n + 1);
    ready(nextPlan);
  }

  /** How many unplayed notes the last hand on a bird re-seasoned. A bench reading. */
  let seasoned = 0;

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
   * becomes the one playing. At the house, and any time nothing has been asked
   * for, it writes nothing and allocates nothing.
   */
  function reseason(): number {
    const spell = wanted();
    let n = 0;
    for (const d of [current, incoming]) {
      if (!d) continue;
      if (d === incoming && placeOf(d.track).seed !== masterSeed) continue;
      n += seasonDeck(d, knobsFor(spell, knobTablesOf(d.track)));
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
      themeSeconds: current ? current.track.bars * current.track.barSeconds : 0,
      // What a beat of the theme playing costs right now, which through a
      // seam, the glide after it or the ride before it is not what that
      // theme's own tempo says: read off the one clock both decks are on, over
      // the beats of the theme a beat of it carries (two at double time).
      beatSeconds: current ? current.clock.spbAt(current.clock.beatAt(ctx.currentTime)) / (current.perBeat ?? 1) : 0,
      settleIn: settleIn(),
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

  // **When the grid will count at the tempo it is heading for** (round K12c),
  // by the seam's tempo rule (`seamTempo`, the fault pass of 09-24):
  //
  //   a far jump is ridden before the blend, so the tempo is on its target
  //   before the arriving theme sounds and is the theme's own at the swap,
  //   which is where the readout turns over to it: the wait is the swap's;
  //   every other seam blends on the pinned grid and glides after the blend,
  //   by its ratio (sixteen bars for a drift, a bar a percent for a near move,
  //   what is left of a half or double one): the rest of the blend and then
  //   that glide, on the glide's own arithmetic (linear in BPM);
  //   after it, the rest of the glide the clock is carrying.
  //
  // A face reads the whole wait off this.
  function settleIn(): number {
    if (!current) return 0;
    const clk = current.clock;
    const now = ctx.currentTime;
    // (before the swap the arriving deck is `incoming`; after it, `current`,
    // with the outgoing one still sounding until the blend ends)
    if (transition) {
      if (seamRule && seamRule.ride > 0) return Math.max(0, transition.swapAt - now);
      const arriving = incoming ?? current;
      const to = gridBeat(arriving);
      const spb = clk.spbAt(clk.beatAt(Math.max(now, transition.end)));
      const over = Math.max(1, (glideBarsFor(spb / to, o) * 4) / (arriving.perBeat ?? 1));
      const m0 = 60 / spb;
      const m1 = 60 / to;
      const glide = Math.abs(m1 - m0) < 1e-6 ? 0 : (60 / ((m1 - m0) / over)) * Math.log(m1 / m0);
      return Math.max(0, transition.end - now) + (glide > 0 ? glide : 0);
    }
    const segs = clk.segments;
    const open = segs[segs.length - 1];
    const prev = segs[segs.length - 2];
    if (prev && Number.isFinite(prev.beats) && Math.abs(prev.spb1 - prev.spb0) > 1e-12 && open.t0 > now) return open.t0 - now;
    return 0;
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
  function beginTransition(bars: number, whenTime: number, cut = false, stage = 0, rule: SeamTempo | null = null) {
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
    seamRule = rule ?? seamTempo(heardBpm(current!, at + stage), next.bpm, o);
    // MEASURED: nothing changes tempo across a seam. The grid is held where it
    // stands for the length of the blend — a seam that begins in the middle of
    // a glide keeps whatever the glide had reached — and the arriving theme is
    // played on it, so both decks count the same bars: beat for beat, or two of
    // its beats to one at double time (`perBeat`). A bar here is the outgoing
    // theme's, which is what the blend is counted in.
    const barSeconds = (moveGrid(clock!.beatAt(at + stage), 0, (b) => clock!.pin(b)) * 4) / m;
    incoming = sourceDeck(ctx, next, compiled(next), mixOut, master, clock!, at + stage, m * seamRule.perBeat);
    // **A move in place enters where the record is** (Eugene, 09-24: *"a bird
    // move keeps the place"*): the theme playing, planned again under the
    // asked spell, comes in at the bar the outgoing plan is at as the blend
    // begins — the same place in the same form (`sameFormTime`) — rather than
    // at its intro.
    const to = placeOf(next);
    const inPlace = to.seed === masterSeed && to.index === n && to.strategy === (o.strategy ?? DEFAULT_STRATEGY);
    const entry = inPlace ? sameFormTime(current!.track, next, Math.max(0, deckThemeTime(current!, at))) : 0;
    startDeck(ctx, incoming, at + stage, entry + stage);
    transition = scheduleTransition(ctx, current!, incoming, at, bars, barSeconds, o, mixOut, cut, at + stage, sumLine);
    note('seam', cut ? 'a cut began' : 'a hand-over began', {
      bars,
      into: String(next.seed),
      tempo: `${seamRule.kind} ${+seamRule.ratio.toFixed(3)}`,
      ...(inPlace ? { inPlaceAtBar: +(entry / next.barSeconds).toFixed(2) } : {}),
      inSeconds: +(at - ctx.currentTime).toFixed(2),
      swapInSeconds: +(transition.swapAt - ctx.currentTime).toFixed(2),
    });
    emit();
    return transition;
  }

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
  async function move(resolve: () => Place, kind: NonNullable<typeof moving>['kind'], unit = 1): Promise<TransportPoint | null> {
    if (!running || !current) return null;
    const cut = kind === 'cut';
    const token = supersede(kind);
    const stale = () => token !== moveToken || dead || !running || !current;
    try {
      // A tap during a seam lands the hand-over in flight at once — the
      // arriving theme is the record — and the cut is planned from there.
      if (cut) interruptSeam();
      let dest = resolve();
      let arriving = planAt(dest);
      nextPlan = arriving;
      // The landing is built before a deck is: a theme nobody has warmed renders
      // its piano's strings on the scheduling tick otherwise, which is the one
      // thing a hand-over must not do to the theme that is still playing — and
      // where it lands: a move in place lands where the record is.
      const landsAt = dest.seed === masterSeed && dest.index === n
        ? sameFormTime(current!.track, arriving, Math.max(0, deckThemeTime(current!, moveFloor()))) : 0;
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
      if (kind === 'spell' && ridingAhead()) {
        const kept = keepRide(dest, arriving);
        if (kept) return kept;
      }
      if (!cut || transition) interruptSeam(cut);
      if (stale()) return null;
      // Reached already: a seam that landed on the way — its own, armed while
      // the landing was built with the theme this move had planned — brought
      // the very place it asked for, and a second hand-over into the theme
      // after it would be a move nobody made.
      const h = here();
      if (dest.seed === h.seed && dest.index === h.index && dest.strategy === h.strategy && sameSpell(dest.spell, h.spell)) {
        if (aim && aim.seed === h.seed && aim.index === h.index) aim = null;
        const now = ctx.currentTime;
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
      const from = deckThemeTime(current!, moveFloor());
      // One phrase past the swap at the most: see `seamFromHere`. The low end
      // changes hands `swapAfterBars` into any blend, and a hand-over a hand
      // asked for is over a phrase after that rather than two minutes later.
      const most = o.swapAfterBars * 2;
      const s = seamFromHere(current!.track, from, arriving, { unit, most });
      // **A far jump is ridden first** (`seamTempo`): from the line, the grid
      // takes the record to the arriving theme's tempo over the rule's bars —
      // fewer where the record has not that many left before its last three —
      // and the blend begins where the ride ends, on a bar line of the record,
      // at the arriving theme's own tempo.
      const rule = seamTempo(heardBpm(current!, deckContextTime(current!, s.at)), arriving.bpm, o);
      if (rule.ride > 0) {
        const ride = Math.max(0, Math.min(rule.ride, Math.floor(current!.track.bars - s.bar - 3)));
        const m = current!.perBeat ?? 1;
        if (ride > 0) {
          const beats = (ride * 4) / m;
          const target = arriving.beat * m;
          moveGrid(clock!.beatAt(deckContextTime(current!, s.at)), beats, (b) => clock!.glide(b, target, beats));
          const t = seamFromHere(current!.track, (s.bar + ride) * current!.track.barSeconds, arriving, { unit: 1, most });
          note('seam', 'the record rides to the arriving tempo before the blend',
            { from: +heardBpm(current!, deckContextTime(current!, s.at - 1e-3)).toFixed(1), to: arriving.bpm, bars: ride });
          return beginTransition(t.bars, deckContextTime(current!, t.at), false, 0, { ...rule, ride });
        }
        // No room to ride: blended on the grid and glided after, as a near move.
        return beginTransition(s.bars, Math.max(moveFloor(), deckContextTime(current!, s.at)), false, 0,
          { ...rule, ride: 0, glide: glideBarsFor(rule.ratio, o) });
      }
      return beginTransition(s.bars, Math.max(moveFloor(), deckContextTime(current!, s.at)), false, 0, rule);
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
    if (!sameSpell(want.spell, h.spell) || want.strategy !== h.strategy || want.style !== h.style) return false;
    if (pendingAim()) return false;
    if (incoming) {
      const p = placeOf(incoming.track);
      if (!sameSpell(p.spell, h.spell) || p.strategy !== h.strategy) return false;
    }
    spellWanted = undefined;
    engineWanted = null;
    return true;
  }

  /** Where the music is heading — or the aim not yet taken up — under what has been asked: a pull's place. */
  const inPlace = (): Place => wish(pendingAim() ?? heading());

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
    return !!(transition && incoming && seamRule && seamRule.ride > 0 && ctx.currentTime < transition.at);
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
    if (!clock || !current || !transition) return null;
    const h = here();
    if (dest.seed !== h.seed || dest.strategy !== h.strategy) return null;
    if (dest.index === h.index && sameSpell(dest.spell, h.spell)) return null;
    const endBeat = clock.beatAt(transition.at);
    const bars = transition.bars;
    const m = current.perBeat ?? 1;
    const target = arriving.beat * m;
    const from = clock.beatAt(Math.max(ctx.currentTime + 0.5, current.pumpedTo || 0));
    if (!(endBeat > from + 1)) return null;
    // the arriving deck has not sounded: it goes at once, and the record's
    // seam lines — its fade, its filter, its holes — are the record's again
    letGo(incoming!, 0.02);
    incoming = null;
    transition = null;
    claim(ctx, current, 0.08, `buses.${o.bassGroup}.dry.gain`);
    resetSum();
    if (Math.abs(clock.spbAt(endBeat) - target) > 1e-9) {
      const beats = endBeat - from;
      moveGrid(from, beats, (b) => clock!.glide(b, target, beats));
    }
    aim = dest;
    nextPlan = arriving;
    const left = (endBeat - clock.beatAt(ctx.currentTime)) * m / 4;
    const rule = seamTempo(heardBpm(current, clock.timeAt(endBeat) - 1e-3), arriving.bpm, o);
    note('seam', 'a second ask joined the ride', { to: arriving.bpm, bars: +left.toFixed(1) });
    return beginTransition(bars, clock.timeAt(endBeat), false, 0, { ...rule, ride: Math.max(rule.ride, left, 1e-6) });
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
    seamRule = null;
    seamFreeAt = ctx.currentTime;
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
  function interruptSeam(replan = true) {
    if (!transition && !incoming && !retiring) return;
    // **A ride the blend has not reached is dropped, not landed.** The theme
    // it was riding to has not sounded — it starts where the ride ends, as
    // much as sixteen bars away — so landing it would let the record go and
    // leave silence until then. The record stays, and leans back from where
    // the ride had got to (`dropSeam`).
    if (seamRule && seamRule.ride > 0 && transition && incoming && ctx.currentTime < transition.at) {
      dropSeam(0.08, replan);
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
    if (retiring) teardown(retiring);
    retiring = current;
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
      o.strategy = p.strategy;
      o.style = p.style;
      // **An ask is spent only by the theme that carries it.** A spell asked
      // while this seam was already in flight is still waiting for a seam of
      // its own, and forgetting it here would put the ring's held birds and the
      // set's own answer out of step for a whole theme.
      if (spellWanted !== undefined && sameSpell(spellWanted, p.spell)) spellWanted = undefined;
      if (engineWanted && engineWanted.strategy === p.strategy && engineWanted.style === p.style) engineWanted = null;
    }
    n = current.track.index != null ? current.track.index : n + 1;
    // The aim is reached: from here a press counts from the music again.
    if (aim && aim.seed === masterSeed && aim.index === n) aim = null;
    // Only when it did (round S8): an in-place move re-plans the same theme and
    // hands the low end to a bass that may be the one already playing, note for
    // note and setting for setting, and the ledger said it changed hands on
    // every one of them.
    if (!retiring || lowEndDiffers(retiring.track, current.track))
      note('seam', 'the low end changed hands', { theme: n + 1, key: current.track.key.name, bpm: current.track.bpm });
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

  function finishTransition() {
    promote(); // a no-op if the swap has already happened
    note('seam', 'the hand-over landed');
    teardown(retiring!);
    retiring = null;
    transition = null;
    seamRule = null;
    seamFreeAt = ctx.currentTime;
    glideToCurrent();
    emit();
  }

  // The theme that is left is now the only one on the grid, so the grid goes
  // to its tempo — linear in BPM, beginning past everything already
  // scheduled, over what the seam's rule gives what is left (`glideBarsFor`):
  // sixteen bars for a drift, a bar a percent for anything more, in the
  // theme's own bars; nothing at all after a far jump, which was ridden onto
  // this theme's tempo before it sounded. A set never jumps; it leans.
  //
  // **Past everything already handed to the audio clock** (R82): the glide
  // used to begin half a second out while a hidden page fills a second and a
  // half ahead, so beats already scheduled were re-timed under notes that had
  // already been given their instants.
  function glideToCurrent() {
    if (!clock || !current) return;
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
  function moveGrid<T>(beat: number, over: number, change: (beat: number) => T): T {
    const held = [current, retiring].filter((d): d is Deck => !!d).map(holdCurves);
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

  function step() {
    const horizon = ctx.currentTime + lookahead(ctx, o.lookahead);
    if (current) pumpDeck(ctx, current, horizon);
    if (incoming) pumpDeck(ctx, incoming, horizon);
    // The theme that has handed over is still sounding, so it still needs its
    // events scheduled until the blend is over.
    if (retiring) pumpDeck(ctx, retiring, horizon);

    if (transition && incoming && ctx.currentTime >= transition.swapAt) promote();
    if (transition && ctx.currentTime >= transition.end) finishTransition();

    // MEASURED: schedule the seam where the outgoing theme has its last
    // breakdown, so the dip is structural rather than an effect applied over
    // the top of a track that is still going full.
    if (!transition && current) {
      // `seamAt` is set by a seek that landed past the point the arrangement
      // chose; without it the seam is where the plan puts it — on a line, and
      // never before the blend that has just ended.
      const planned = seamPlan(current.track, blendAsked(current.track), {
        boundaryBars: o.boundaryBars,
        notBefore: Math.max(0, deckThemeTime(current, seamFreeAt)),
      });
      const bars = current.seamBars || planned.bars;
      const at = current.seamAt ?? planned.at;
      // A far jump into the theme planned next is ridden over the bars before
      // the line (`seamTempo`), laid as the horizon reaches the ride's first
      // bar, and the blend begins on the line itself.
      if (nextPlan && !rode.has(current)) {
        const rule = seamTempo(heardBpm(current, deckContextTime(current, at)), nextPlan.bpm, o);
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
      }
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
    async start(themeIndex = 0, fromSeconds = 0): Promise<MixState> {
      if (running || dead) return state();
      const token = ++startToken;
      const cancelled = () => dead || token !== startToken;
      if (ctx.state === 'suspended') await ctx.resume();
      if (cancelled()) return state();
      n = Math.max(0, themeIndex);
      let from = Math.max(0, Number(fromSeconds) || 0);
      let first = plan(n);
      let seam = seamOf(first);
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
        seam = seamOf(first, seam.seconds);
      }
      nextPlan = plan(n + 1);
      // the first theme's strings and hats before a note is scheduled, the
      // next theme's on their way while the first plays — and when the set is
      // being picked up inside a blend, the arriving theme's before it is
      // built, because it is about to sound too.
      await ready(first, from);
      // Stopped while that was rendering: nothing is built, no clock is
      // started, and what a second gesture asked for is the set that plays.
      if (cancelled()) return state();
      if (stage != null) {
        await ready(nextPlan, stage);
        if (cancelled()) return state();
      } else {
        ready(nextPlan);
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
      const at = startAt(ctx);
      // A blend that finished before the position we are resuming at still
      // owns the room it took: the next seam is planned from where it ended.
      seamFreeAt = ended > 0 ? at - ended : 0;
      current = sourceDeck(ctx, first, programOf(first), mixOut, master, clock);
      startDeck(ctx, current, at, from);
      running = true;
      // The hand-over the position was inside, built again at the stage it had
      // reached: both decks at their own offsets, the grid pinned as it was,
      // and the fader, the filter and the kick and bass gaps joined where the
      // curves stood rather than started over.
      if (stage != null) beginTransition(seam.bars, at - stage, false, stage);
      timer = startClock(tick, TICK_MS);
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
        room: first.presetLabel, strategy: o.strategy ?? DEFAULT_STRATEGY,
      });
      tick();
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
      engineWanted = null;
      aim = null;
      running = false;
      if (timer) timer();
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', tick);
      for (const d of [current, incoming, retiring]) if (d) letGo(d, STOP_FADE);
      current = null;
      incoming = null;
      retiring = null;
      transition = null;
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
      return move(() => wish(want), 'cut');
    },
    // Cheap because a theme is only a seed: go back one and blend into it.
    async back(): Promise<TransportPoint | null> {
      if (!running || !current) return stepWhileStopped(-1);
      const f = from();
      const want: Place = { ...f, index: Math.max(0, f.index - 1) };
      aim = want;
      note('transport', 'a back was asked for', { from: n + 1, to: want.index + 1, ...(want.seed !== masterSeed ? { seed: want.seed } : {}) });
      return move(() => wish(want), 'cut');
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
        spell: under, recipe: recipe ?? null,
      };
      // The spell a cast names is what the hand has asked for from here.
      if (spell !== undefined && spellWanted !== undefined) spellWanted = under;
      // **The aim moves at the ask**, so a press made while the new set is
      // being built counts from the theme it arrives on.
      aim = place;
      const arriving = planAt(wish(place));
      note('cast', 'a cast was asked for', {
        from: masterSeed, to: next, theme: i + 1, bpm: arriving.bpm, key: arriving.key.name, room: arriving.presetLabel,
      });
      return move(() => wish(place), 'cast', 1);
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
        nextPlan = null;
        emit();
        return Promise.resolve(null);
      }
      note('spell', 'a spell was set', {
        ...(spell ? Object.fromEntries(Object.entries(spell).map(([k, v]) => [k, +(+(v as number)).toFixed(3)])) : { at: 'the house' }),
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
        nextPlan = null;
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
    async seek(seconds: number): Promise<number | null> {
      if (!current) return null;
      const token = supersede('seek');
      // A seek is a move inside the record, so a seam in flight is over: the
      // theme that was arriving has not arrived, one fresh deck plays, and the
      // hand is where it has just put itself — the aim goes with the seam.
      aim = null;
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
      seekingTo = Math.max(0, Number(seconds) || 0);
      await readyEnough(deck.track, seekingTo);
      if (moving && moving.token === token) moving = null;
      // Overtaken: whatever overtook it has cleared `seekingTo` (`supersede`).
      if (token !== moveToken || dead || current !== deck) return null;
      const now = ctx.currentTime;
      const fresh = sourceDeck(ctx, deck.track, programOf(deck.track), mixOut, master, clock!, null, deck.perBeat ?? 1);
      // The same lead as a start: a seek used to land its first events 70 ms
      // past the clock, which on a device with a large buffer is behind the
      // render head, so every jump wrote a late note of its own. The deck
      // being left goes out where this one comes in rather than at once.
      const at = startAt(ctx);
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
  const lastEnd = clock.timeAt(startBeats[startBeats.length - 1] + (last.bars * 4) / perBeats[perBeats.length - 1]);
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

  const decks = plans.map((t, i) => makeDeck(ctx, t, programOf(t), mixOut, master, clock, starts[i], perBeats[i]));
  decks.forEach((d, i) => startDeck(ctx, d, starts[i], entries?.[i] ?? 0));
  // What the graph is actually given, which is what gets reported: the swap
  // time used to be worked out a second time from the wrong end of the blend,
  // and named 140.8 seconds where the kick really changed hands at 87.7.
  const scheduled = seams.map((s) =>
    scheduleTransition(ctx, decks[s.from], decks[s.to], s.at, s.bars, s.barSeconds, o, mixOut)
  );
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
