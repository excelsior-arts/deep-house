// A deck: one theme, playing.
//
// It is one theme's compiled program, the v1 graph it is played through, the
// three things a mixer channel has — a high-pass, a low-pass and a fader — and
// where its own seconds fall on the set's grid. Everything a deck does it does
// out of that program and out of nothing else, so two decks at a seam are two
// performances rather than one table being rewritten twice a tick.
//
// This is the execution half of what the composer's `mix.ts` used to be, split
// out in round E of PLAN-V1-NEXT. The other half is
// `packages/deep-house/src/set-plan.ts`, which is pure and knows nothing about
// nodes; a hand-over is planned there and written here.
// Everything below either builds a node, writes to one or throws one away.

import { renderHead } from './dsp.ts';
import { relayLine, paramOf } from './master.ts';
import { makeV1Graph } from './graph.ts';
import { fireEvent, prepareReturns, scheduleAutomation } from './scheduler.ts';
import { BY_NAME } from './voices/index.ts';
import { schedule, firstEvent, visitOrder, sameVisitOrder } from './schedule.ts';
import { line, writePoints } from './ramp.ts';
import type { Line, Rampable } from './ramp.ts';
import type { Grid, Gap } from './schedule.ts';
import type { CurveStep, Program, ProgramEvent, SeamLine, SeamWrite } from './program.ts';
import type { V1Graph, V1Master } from './graph.ts';
import type { AutomationTarget } from './master.ts';
import type { SetClock } from './set-clock.ts';
import type { Settings } from './settings.ts';

/**
 * What the three time functions below read of a deck: the grid it is counted
 * on, the beat of that grid its first bar sits on, and the program whose own
 * seconds its events are in.
 *
 * It is stated as its own shape rather than as `Deck` because a deck is not
 * what they need: the recording stand-in `tools/program.ts` locks a seam's
 * curves with is these three fields and no nodes at all, and it is handed to
 * `deckThemeTime` exactly as a playing deck is.
 */
export interface DeckTime {
  /** the grid the set counts on, which through a seam is one grid for two decks */
  clock: SetClock;
  /** the beat of the set this theme's first bar sits on */
  startBeat: number;
  program: { beat: number };
  /**
   * how many of this theme's beats one beat of the set's grid carries: 1, but
   * 2 for a theme brought in at double time over the grid and ½ at half time
   * (`seamTempo` in the composer's `performance.ts`). Absent is 1.
   */
  perBeat?: number;
}

/**
 * **What one beat of the set's grid is, in this theme's own seconds**: its
 * program's beat times the beats of it the grid carries. The grid is at this
 * theme's own tempo when a beat of it costs exactly this.
 */
export function gridBeat(deck: DeckTime): number {
  return deck.program.beat * (deck.perBeat ?? 1);
}

/** One theme on a set's grid, with everything it owns. */
export interface Deck extends DeckTime {
  /**
   * The plan this theme was made from, and the one field of a deck that stays
   * `any`. What a plan *is* belongs to whoever composed it — the machine has no
   * shape for one and this file never touches this field — and the composer
   * reads its own theme back off the deck it is playing (`deck.track.bars`,
   * `deck.track.barSeconds` in `mix.ts`), so `unknown` here would be a cast in
   * the caller for a shape the engine still would not know.
   */
  track: any;
  program: Program;
  settings: Settings;
  graph: V1Graph;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  fader: GainNode;
  /** where this theme's seconds fall on the clock it is being played on */
  grid: Grid;
  /** one parameter of this deck by path: its own channel first, then its graph */
  param(path: string): AutomationTarget | null;
  /**
   * The written history of one of this deck's parameters (`ramp.ts`), made on
   * first asking: what a hand-over writes onto the fader, the channel filters
   * and the low end goes through it, so whatever moves them next — a claim, a
   * release, a seam abandoned — starts from where they will really be.
   */
  lineOf(path: string): Line | null;
  /** the holes a hand-over has cut in it, by hand-over group */
  gaps: Record<string, Gap[]> | null;
  /** the cursor of the first event it has not visited (`visitOrder`), and how far it has been filled */
  index: number;
  pumpedTo?: number;
  /** the instant its curves were laid from, which a relay reads them back from */
  laidFrom?: number;
  done: boolean;
  failed?: number;
  seamAt?: number;
  seamBars?: number;
}

// A deck is *handed* its program. Until round W of PLAN-V1-NEXT this file
// compiled one — `programOf(track)`, a WeakMap over the compiler — which is the
// one thing a deck did that needed to know what a plan is; it is
// `programOf` in the composer's `performance.ts` now, and the same cached value
// reaches the prewarm, the deck and an offline render of the same theme.

// Where a theme time of one deck falls on the set's clock, and the other way
// about. A deck's events are its own theme's seconds; `startBeat` is the beat
// of the set its first bar sits on.
//
// **The beat is the program's** (round K6). Four numbers were read off the
// *plan* here — the beat, the tempo, the theme's index in the set and the trim
// — and every one of them is on the program, which is the value a deck is
// handed and the value the program digest hashes. Reading them off the plan was
// the last thing in this file that had an opinion about what a plan is, three
// rounds after `programOf` moved out of it; `track` is still a field of a deck
// because the composer's own session reads a theme off it, and nothing here
// touches it at all.
//
// `index` is the one with a consequence, and it is a repair rather than a move:
// it is `null` on a program that never joined a set and was `undefined` on such
// a plan, and `null % 7` is 0 where `undefined % 7` is **NaN** — so the width
// LFO of a theme played outside a set had a NaN phase. Every theme in a set has
// an index, which is why no digest and no scene moves.
export function deckContextTime(deck: DeckTime, themeTime: number): number {
  return deck.clock.timeAt(deck.startBeat + themeTime / gridBeat(deck));
}

export function deckThemeTime(deck: DeckTime, contextTime: number): number {
  return (deck.clock.beatAt(contextTime) - deck.startBeat) * gridBeat(deck);
}

// The next line of a deck's own grid at or after `t`, in context time: `unit`
// is what a line is — a beat, a bar — in that theme's seconds. Both decks are
// on the set's one grid through a seam, so a line of one is a line of both.
export function lineAfter(deck: DeckTime, t: number, unit: number): number {
  const n = Math.max(0, Math.ceil(deckThemeTime(deck, t) / unit - 1e-9));
  return deckContextTime(deck, n * unit);
}

/**
 * A deck is one theme's graph plus the three things a mixer channel has. It
 * stops at the fader; the master that every deck shares is downstream of the
 * sum, so two decks at a seam pass through one limiter rather than two.
 *
 * @param track the plan, carried and never read: `any` for the reason
 *   `Deck.track` is.
 */
export function makeDeck(ctx: BaseAudioContext, track: any, program: Program, mixOut: AudioNode,
  master: V1Master, clock: SetClock, atTime: number | null = null, perBeat = 1): Deck {
  // This deck's own performance, compiled once by whoever planned the theme and
  // carried on the deck: the sound stage bar by bar, every note with the
  // parameters it will be played with, the curves, the sidechain — and the room
  // all of it was worked out under.
  const settings = program.settings;
  // The graph's tempo-synced parts — the dotted-eighth delay above all — are
  // built on the grid this deck will actually be played on, which through a
  // seam is the outgoing theme's and not this theme's target. The glide
  // afterwards moves the grid by a fifth of a percent, which is a third of a
  // millisecond on a dotted eighth: below what a delay line can show.
  const when = atTime == null ? ctx.currentTime : atTime;
  const bpm = clock ? (60 / clock.spbAt(clock.beatAt(when))) * perBeat : program.bpm;
  const graph = makeV1Graph(ctx, settings, {
    bpm, widthPhase: ((program.index ?? 0) % 7) * 0.9, master, trimDb: program.trimDb,
  });
  // The returns this theme sends to, built with the deck and not on the tick
  // its first sending note is scheduled (src/scheduler.ts).
  prepareReturns(graph, program);
  // Each deck gets its own filters and fader, so the transition can drive the
  // two independently without touching either theme's own automation.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 18;
  hp.Q.value = 0.707;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 20000;
  lp.Q.value = 0.707;
  const fader = ctx.createGain();
  fader.gain.value = 1;
  graph.out.connect(hp);
  hp.connect(lp);
  lp.connect(fader);
  fader.connect(mixOut);
  const channel = { hp, lp, fader };
  const lines = new Map<string, Line>();
  const deck: Deck = {
    track, program, settings, graph, hp, lp, fader, clock, perBeat,
    gaps: null, index: 0, startBeat: 0, done: false,
    // Its own channel first, then its graph: `fader.gain` is the deck's and
    // `buses.sub.dry.gain` is the graph's, and a caller names either the same
    // way. Nothing outside this file reaches into a node to find one.
    param: (path) => paramOf(channel, path) || graph.param(path),
    lineOf(path) {
      const had = lines.get(path);
      if (had) return had;
      const param = deck.param(path) as Rampable | null;
      if (!param) return null;
      const made = line(ctx, param, param.value);
      lines.set(path, made);
      return made;
    },
    grid: {
      at: (themeTime) => deckContextTime(deck, themeTime),
      time: (contextTime) => deckThemeTime(deck, contextTime),
      get gaps() { return deck.gaps; },
    },
  };
  return deck;
}

/**
 * One event of a program, into a deck, at the instant the schedule gave it.
 *
 * It is `fireEvent` in `scheduler.ts` over the deck's own graph and program —
 * the same six lines, which were written here a second time and would have
 * drifted the first time somebody touched one of them. A deck's settings are
 * its program's (`makeDeck` reads them off it), so nothing is lost in the
 * hand-over.
 */
export function fireDeckEvent(ctx: BaseAudioContext, deck: Deck, pe: ProgramEvent, at: number): void {
  fireEvent(ctx, deck.graph, deck.program, heldOnGrid(deck, pe), at);
}

/**
 * **Whether a voice's `dur` is a hold that follows the grid**: a voice that
 * holds a note — a pad, keys, a lead, a bass, a vocal, a sweep — and not a hit
 * with its own envelope (the drum and noise families) nor a voice whose sound is
 * rendered ahead and keyed by its length (a `prepare` hook: the piano's strings,
 * the plucked strings, the pluck bass), which keep their seconds.
 */
const followsGrid = new Map<string, boolean>();
export function holdsOnGrid(voice: string): boolean {
  let got = followsGrid.get(voice);
  if (got === undefined) {
    const d = BY_NAME[voice];
    got = !!d && !d.prepare && d.family !== 'drum' && d.family !== 'noise';
    followsGrid.set(voice, got);
  }
  return got;
}

/**
 * **A held note ends on a beat of the grid, not a count of seconds** (the fault
 * pass of 09-24, the ride's hold). A program writes a note's length in its own
 * theme's seconds — four bars of pad at 126 BPM is 7.61 s — and the grid a deck
 * is played on can be moving: a far jump rides the outgoing theme from 126 to
 * 49, and a pad written to cover bars 20–23 covered two of them and left the
 * breakdown silent for six seconds (−40 dB where it read −14). So the length is
 * laid on the grid the way the onset is: the note ends where the grid puts its
 * theme time `onset + dur`, which on a ride down is longer and on a ride up
 * shorter, and on a grid at the theme's own tempo is the same number. Only the
 * copy handed to the voice changes; the program is untouched.
 */
export function heldOnGrid(deck: Deck, pe: ProgramEvent): ProgramEvent {
  const dur = pe.p ? pe.p.dur : undefined;
  if (!(typeof dur === 'number' && dur > 0 && Number.isFinite(dur)) || !holdsOnGrid(pe.voice)) return pe;
  const held = deckContextTime(deck, pe.onset + dur) - deckContextTime(deck, pe.onset);
  if (!(held > 0) || Math.abs(held - dur) < 1e-9) return pe;
  return { ...pe, p: { ...pe.p, dur: held } };
}

/** Lay a deck out: where its first bar sits, where its cursor starts, its curves. */
export function startDeck(ctx: BaseAudioContext, deck: Deck, when: number, fromTime = 0): void {
  // Where this theme's first bar sits on the set's grid. Everything of this
  // deck — its events, its curves, its gaps — is read off that.
  deck.startBeat = deck.clock.beatAt(when) - fromTime / gridBeat(deck);
  deck.index = firstEvent(deck.program, fromTime);
  // The program's curves are laid out on the grid as it stands now — every
  // line of it, whichever parameters this theme's arrangement writes to. A
  // glide after the seam moves them by a fifth of a percent against the notes,
  // which on a filter that opens over an eight-bar phrase is a few
  // milliseconds.
  deck.laidFrom = when;
  scheduleAutomation(deck.graph, deck.program, (t: number) => deckContextTime(deck, t), when);
}

/**
 * **Where a deck's curves stand on the grid, before the grid is moved.** The
 * curves are laid once, at `startDeck`, on the grid as it stood; a tempo glide
 * afterwards moves every note and used to move none of them. MEASURED (the
 * reconciled review of 09-24, R2): a cast from 104 to 169.1 BPM left a
 * macro-filter point about 40 s late, and 120 to 126 BPM put it 0.75 / 3.8 /
 * 9.9 s off at bars 32 / 64 / 128. So whoever moves the clock under a deck
 * takes this first and hands it to `relayDeck` after.
 */
export interface HeldCurves {
  deck: Deck;
  times: number[][];
}
export function holdCurves(deck: Deck): HeldCurves {
  return {
    deck,
    times: deck.program.automation.map((l) => l.points.map((p) => deckContextTime(deck, p.t))),
  };
}

/**
 * Lay a deck's curves again from `from`, the first instant the grid moved at:
 * every line whose points now fall elsewhere is cut there and continued on the
 * new instants (`relayLine`), and the dotted-eighth delay leans to the tempo the
 * grid is heading for over the same stretch, so the echoes stay on the beat.
 * `until` is where the grid stops changing (a glide's end).
 */
export function relayDeck(ctx: BaseAudioContext, held: HeldCurves, from: number, until: number): void {
  const deck = held.deck;
  if (deck.laidFrom == null) return;
  const lines = deck.program.automation;
  for (let i = 0; i < lines.length; i++) {
    const after = lines[i].points.map((p) => deckContextTime(deck, p.t));
    try {
      relayLine(deck.graph, lines[i], deck.laidFrom, held.times[i], after, from);
    } catch (e) {
      /* a graph already let go */
    }
  }
  const beat = deck.clock.spbAt(deck.clock.beatAt(until)) / (deck.perBeat ?? 1);
  if (Math.abs(beat - deck.graph.beat) < 1e-9) return;
  const echo = deck.lineOf('echo.time');
  if (echo) {
    try {
      const at = Math.max(from, ctx.currentTime);
      echo.to(deck.settings.sends.delayDotted * beat, at, Math.max(0.01, until - at));
    } catch (e) {
      /* gone */
    }
  }
  deck.graph.beat = beat;
}

// --- what a stall does to a deck --------------------------------------------
//
// **A set that was not pumped for ten seconds does not play ten seconds of
// music at one instant** (the outside review, 09-19). The pump fills a deck up
// to a horizon,
// and when the main thread is taken away — a tab in the background on a
// machine under load, a phone locking, a long paint — the horizon it comes
// back to is where the clock has got to, not where it stopped. Every event in
// between is then handed to `resolveStart`, which rightly refuses to schedule
// anything behind the render head and moves it to the head: a hit missed by
// two milliseconds and one missed by ten seconds land on the same instant, so
// a hundred of them fire together and the set counts a hundred late notes.
//
// What a stalled set should do is a transport policy and it is stated here:
// **an event more than a bar behind the head is dropped, and counted as
// dropped rather than late.** A bar, because that is the grid's own unit of
// return — what is left is at most one downbeat's worth of music, so the next
// bar plays in one piece — and because the position a deck resumes at is the
// position the *clock* is at: the set never stopped, the notes that were
// missed are notes that have already gone by, and playing them now would put
// the theme behind itself for as long as the burst lasted. A note missed by
// less than a bar is still moved to the head and still counted late, which is
// the measurement the suites have always held the transport to.
//
// The offline renders do not come through here — `pourDeck` has the whole
// timeline and no deadline — so no render and neither digest can see this.
let dropped = 0;
let droppedLast = 0; // how far behind the head the last dropped event was
let droppedAt = 0;   // and when, on the context's clock
/** What `dropInfo` hands back: what a stall cost, for a bench to ask. */
export interface DropInfo {
  count: number;
  last: number;
  at: number;
}
export const dropInfo = (): DropInfo => ({ count: dropped, last: +droppedLast.toFixed(3), at: +droppedAt.toFixed(2) });

/** Two settings tables, the same numbers under the same names. */
const same = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
};

/**
 * **Season the notes this deck has not played yet.**
 *
 * A held bird is two things at once (Eugene, 09-20: *"should some bird
 * movements be an instant change in sound and some a remix follow-up? Now there
 * is no direct response to any bird"*). What it asks of the *structure* — the
 * kit, the tempo family, the room, which instruments play — is a promise about
 * the next theme and lands at the seam, because a plan is a plan and nothing
 * rewrites one that is sounding. What it asks of the **seasoning** — the
 * settings a voice is played inside its own declared range — is not a plan at
 * all: it is a number on a note, and a note that has not been handed to the
 * audio clock can still be given a different one.
 *
 * `deck.index` is the cursor of the first event the scheduler has not visited,
 * so everything from it on is a note nothing has been built for. That is the whole of the
 * safety here and it is structural rather than careful: an event this rewrites
 * has **not started**, so there is no node to move and nothing can click. A
 * voice already sounding — a pad holding through the bar — keeps the seasoning
 * it was started with, because changing that needs a setter on the running
 * instrument and the engine has none; that is a later round and it is written
 * down as one.
 *
 * **The program is not touched.** A compiled program is cached per plan and is
 * what the digest hashes, so the first time a deck is seasoned it takes a
 * shallow copy of the event list and replaces whole events in its own copy.
 * Nothing a render, a digest or another deck can reach moves at all.
 *
 * @param knobs the settings by event name, as `knobsFor` hands them over; a
 *   voice the table does not name has its seasoning **removed**, which is what
 *   makes a bird pulled back to the house really go back
 * @returns how many notes were given a new setting
 */
// **The event lists a deck has already made its own** (R89): the first
// seasoning copies the program's list and every later one writes into that
// copy, rather than copying the whole theme again on every hand on a bird.
const seasonedLists = new WeakSet<ProgramEvent[]>();

export function seasonDeck(deck: Deck, knobs: Record<string, Record<string, number>> | null): number {
  const events = deck.program.events;
  const from = Math.max(0, deck.index | 0);
  if (from >= events.length) return 0;
  // The cursor counts in the order the program is visited in (`visitOrder`),
  // which is the list's own except round an anticipatory voice: what is left
  // to play is every position from the cursor on, through the index.
  const order = visitOrder(deck.program);
  let own = seasonedLists.has(events);
  let n = 0;
  for (let k = from; k < events.length; k++) {
    const i = order ? order[k] : k;
    const ev = events[i];
    const want = knobs ? knobs[ev.voice] : undefined;
    const had = ev.p && ev.p.knobs;
    if (!want && !had) continue;
    if (want && had && same(want, had)) continue;
    if (!own) {
      // this deck's own list from here on, so the cached program stays the
      // object every render and every digest sees
      deck.program = { ...deck.program, events: events.slice() };
      // the same onsets, so the same order: handed over, not sorted again
      sameVisitOrder(events, deck.program.events);
      seasonedLists.add(deck.program.events);
      own = true;
    }
    const p = { ...ev.p } as Record<string, any>;
    if (want) p.knobs = want; else delete p.knobs;
    deck.program.events[i] = { ...ev, p };
    n++;
  }
  return n;
}

/** Fill a deck up to a horizon on the context's clock. */
export function pumpDeck(ctx: BaseAudioContext, deck: Deck, horizonTime: number): void {
  // Nothing to put back before the events go out: every one of them is fired
  // under `deck.settings`, which no other deck, plan or render can reach.
  //
  // Which events those are is the one scheduling contract's answer, and the
  // same call an offline render makes over a whole theme.
  const run = schedule(deck.program, deck.grid, deck.index, horizonTime);
  // How far this deck has been filled, in context time: a cut has to land
  // beyond it, or a kick already posted would play under the new theme.
  deck.pumpedTo = Math.max(deck.pumpedTo || 0, horizonTime);
  deck.index = run.next;
  // A bar of this deck's own music, behind the head: past that, an event is
  // not late, it is gone.
  const head = renderHead(ctx);
  const stale = head - deck.program.beat * 4;
  for (const s of run.events) {
    if (s.at < stale) {
      dropped += 1;
      droppedLast = head - s.at;
      droppedAt = ctx.currentTime;
      continue;
    }
    // One event that throws used to stall the deck for good: the index was
    // only advanced *after* the voice returned, so every following tick threw
    // at the same note, nothing else was ever scheduled, and what was left was
    // the pad and the piano ringing out over no drums — which is exactly what
    // "some instruments keep playing and no other theme mixes in" sounds like.
    // A bad note is now one dropped note.
    try {
      fireDeckEvent(ctx, deck, s.pe, s.at);
    } catch (err) {
      deck.failed = (deck.failed || 0) + 1;
      if (deck.failed <= 3) console.error('deck event failed', s.pe, err);
    }
  }
}

/**
 * Every event of a deck's theme that can be heard before `to`, at once: what an
 * offline render does.
 *
 * `to` is an instant on the context's own clock and defaults to the end of
 * everything, which is what a render of a whole set asks for. A render that is
 * **capped** — `renderMix`'s `maxSeconds` — asks for its own horizon instead,
 * and that is round K6's repair of a cost K5b measured and could not afford:
 * the cap bounded the *buffer* and not the *work*, so a three-minute cap on a
 * set of nine-minute themes poured twenty-seven minutes of music into a context
 * three minutes long and paid for every note of it. Nothing that is kept
 * changes: `schedule` admits an event whose **onset** is inside the horizon, so
 * an anticipatory voice that has to start before the edge still does, and an
 * event whose onset is past the end of the buffer could not have been heard.
 */
export function pourDeck(ctx: BaseAudioContext, deck: Deck, to = Infinity): void {
  // From where `startDeck` put the deck's cursor: its first event, or the
  // first at the second it was started at (a theme entering mid-way).
  for (const s of schedule(deck.program, deck.grid, deck.index, to).events) {
    fireDeckEvent(ctx, deck, s.pe, s.at);
  }
}

// --- a hand-over, written ---------------------------------------------------

// One automation line, onto the parameter it names: `writePoints` in
// `ramp.ts`, which is where the fold of everything before `from` into one
// value lives — a seam's curves are functions of the time since it began, and a
// set resumed in the middle of one joins them where they had reached. A deck's
// own parameters go through their `Line`, which makes the same calls and keeps
// them; the recording stand-in the program digest locks a seam with has none,
// and is written the same way.
function writeLine(param: AutomationTarget | null, pts: CurveStep[], from: number, track: Line | null = null): void {
  if (!param || !pts.length) return;
  if (track) track.write(pts, from);
  else writePoints(param as Rampable, pts, from);
}

/**
 * What `deckParam` reads: a deck that answers for its own paths, or something
 * with a deck's three channel nodes and a graph and no `param` of its own. It
 * is deliberately looser than `Deck` — every field optional, every node
 * `unknown` — because the second of those is the recording stand-in
 * `tools/program.ts` locks the curves with, which carries recorders where the
 * audio nodes would be and is walked by `paramOf` exactly as a deck is.
 */
interface ParamDeck {
  param?: (path: string) => AutomationTarget | null;
  lineOf?: (path: string) => Line | null;
  hp?: unknown;
  lp?: unknown;
  fader?: unknown;
  graph?: unknown;
}

// One parameter of a deck by path. A deck built here answers for itself; the
// recording stand-in `tools/program.ts` locks the curves with is a plain
// object with the same shape, and answers the same way.
const deckParam = (deck: ParamDeck, path: string) =>
  (deck.param ? deck.param(path) : null) ||
  paramOf({ hp: deck.hp, lp: deck.lp, fader: deck.fader }, path) ||
  paramOf(deck.graph, path);

function addGap(deck: Deck, group: string, gap: Gap): void {
  // A deck can be on both sides of a seam at once — the theme arriving at one
  // and leaving at the next — so the stretches with no kick and no bass are a
  // list rather than one pair. They used to be one property, and in an offline
  // render the outgoing seam's gap overwrote the incoming one: thirty-three
  // kicks played under the theme that still owned the bottom.
  if (!deck.gaps) deck.gaps = {};
  if (!deck.gaps[group]) deck.gaps[group] = [];
  deck.gaps[group].push(gap);
}

/**
 * A hand-over, written onto two decks and the sum they pass through.
 *
 * It writes and decides nothing. `plan` is a `SeamWrite` — every line of points
 * and every hole, as values — worked out by whoever knows where a seam belongs
 * and what it costs; here it becomes parameters, by the paths the lines name,
 * and gaps in the two decks' event lists. `writeFrom` is the instant the lines
 * are written from: the seam's own start in ordinary play, the present for one
 * being picked up part-way through.
 *
 * It was `scheduleTransition` and it worked the curves out itself, off the
 * style the outgoing theme was planned in. Round W of PLAN-V1-NEXT split the
 * two: a seam's numbers are deep house, and `scheduleTransition` in the
 * composer's `mix.ts` is where they are worked out and handed over.
 */
export function writeSeam(from: Deck, to: Deck, plan: SeamWrite, sum: unknown = null,
  writeFrom: number | null = null, sumLine: Line | null = null) {
  const w = writeFrom == null ? plan.at : writeFrom;
  const deckOf = (which: SeamLine['deck']) => (which === 'from' ? from : which === 'to' ? to : null);
  for (const line of plan.lines) {
    const deck = line.deck === 'sum' ? null : (deckOf(line.deck)! as ParamDeck);
    const param = deck ? deckParam(deck, line.param) : (sum ? paramOf(sum, line.param) : null);
    const track = deck ? (deck.lineOf ? deck.lineOf(line.param) : null) : sumLine;
    writeLine(param, line.points, w, track);
  }
  for (const hole of plan.holes) addGap(deckOf(hole.deck)!, hole.group, hole.gap);
  return { at: plan.at, end: plan.end, swapAt: plan.swapAt, bars: plan.bars };
}

// --- letting go -------------------------------------------------------------

/** Disconnect a deck and stop what would keep its graph alive. */
export function teardown(deck: Deck): void {
  if (!deck) return;
  try {
    deck.fader.disconnect();
  } catch (e) {
    /* already gone */
  }
  deck.graph.dispose();
}

/**
 * Fade a deck out and let it go: what stop and seek do to a deck that is still
 * sounding. `at` is when the fade begins, which is now for a stop and, for the
 * deck a seek is replacing, the instant the fresh deck starts sounding: the two
 * are aimed at one moment so the jump is a cut and not a hole the length of the
 * device's buffer.
 */
export function release(ctx: BaseAudioContext, deck: Deck, seconds: number, at: number | null = null): void {
  const now = Math.max(ctx.currentTime, at == null ? 0 : at);
  // Through the fader's line, and not by stamping `param.value` after a cancel:
  // the value now is not the value at a fade that begins in the future (a seek
  // aims it at the landing), and a cancel drops a ramp's destination and leaves
  // the fader heading for where that ramp began — a fade-in half done read as
  // nought, then stepped (the reconciled review of 09-24, R136).
  try {
    const fader = deck.lineOf('fader.gain');
    if (fader) fader.to(0, now, seconds);
  } catch (e) {
    /* already gone */
  }
  // Torn down once the fade has been heard and not before, however long the
  // fade is (R88): it was 300 ms past its start whatever it lasted.
  setTimeout(() => teardown(deck), 300 + (seconds + Math.max(0, now - ctx.currentTime)) * 1000);
}

/**
 * A deck a seam was still shaping becomes the record on its own terms:
 * everything the transition had scheduled for it — a fader on its way up, a sub
 * held at nothing until a swap that is not going to happen, a filter opening —
 * is cancelled and walked to where a deck that is playing stands.
 */
export function claim(ctx: BaseAudioContext, deck: Deck, seconds = 0.08, lowPath: string | null = null): void {
  if (!deck) return;
  const now = ctx.currentTime;
  // Each from where its line says it is, not from `param.value` after a cancel
  // (R136): a fader on its way up from 0.0001 was put back at the start of its
  // ramp and glided up again, a hole in the blend a skip was to land cleanly.
  const to = (path: string, value: number) => {
    const track = deck.lineOf(path);
    if (!track) return;
    try {
      track.to(value, now, seconds);
    } catch (e) {
      /* already gone */
    }
  };
  to('fader.gain', 1);
  // Which bus the low end changed hands on is the seam's to say, and a seam is
  // the composer's: the caller names the path it wrote, the way every other
  // line of a hand-over names one.
  if (lowPath) to(lowPath, 1);
  to('lp.frequency', 20000);
  to('hp.frequency', 18);
  deck.gaps = null;
}
