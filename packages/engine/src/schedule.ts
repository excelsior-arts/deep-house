// The one scheduling contract.
//
// A program says what a theme plays, in its own seconds, and never where that
// falls on anybody's clock. A **grid** is the other half: where a theme's
// seconds land on the clock a context is playing it on, and which holes the set
// has cut in its low end. Put the two together and you have the only question
// either engine asks — *which events sound between here and there, and when* —
// and one answer for the live look-ahead pump, the single-theme player and both
// offline renders.
//
// Until round E of PLAN-V1-NEXT the answer was written three times: a while
// loop over an index in `pumpDeck`, another in the single-theme player's own
// tick (gone since round K6), and a `for` over
// the whole list in each of the two renders. They agreed, and finding 08 of the
// technical review is what it looks like when two of them stop agreeing — an
// offline render that overwrote one kick gap with another and played
// thirty-three kicks under the theme that still owned the bottom. There is one
// of them now, and the check `live and offline schedule the same window` holds
// the two callers to it.
//
// What is *not* here is anything about a moment: `resolveStart`'s guard against
// the render head, a voice, a node. A schedule is a list of events and instants;
// firing it is the caller's.

import type { Program, ProgramEvent } from './program.ts';

/** One stretch of a deck's own seconds that a hand-over has cut out. */
export type Gap = [number, number];

/**
 * Where a program's seconds fall on the clock a context is playing it on, and
 * the holes the set has cut in it.
 *
 * A deck on the set's grid resolves both through the set clock; an offline
 * render of one theme is an offset and nothing else. `gaps` is read every call
 * rather than captured, because a deck can be on both sides of a seam at once
 * and the holes arrive while it is already playing.
 */
export interface Grid {
  /** theme seconds onto this context's clock */
  at(themeTime: number): number;
  /** this context's clock back onto theme seconds */
  time(contextTime: number): number;
  /** the holes, by the hand-over group the program's `gap` names */
  readonly gaps: Record<string, Gap[]> | null;
}

/** One event of a program, with the instant it is to sound at. */
export interface Scheduled {
  pe: ProgramEvent;
  at: number;
}

/** A window of a program: what sounds in it, and where the caller got to. */
export interface Run {
  events: Scheduled[];
  /** the cursor of the first event the window did not reach — where the next one starts */
  next: number;
}

/** A theme played at an offset on a context's own clock, with no set around it. */
export function offsetGrid(offset = 0, gaps: Record<string, Gap[]> | null = null): Grid {
  return { at: (t) => t + offset, time: (t) => t - offset, gaps };
}

const inGap = (gaps: Gap[] | undefined, t: number) => {
  if (!gaps) return false;
  for (const g of gaps) if (t >= g[0] && t < g[1]) return true;
  return false;
};

// --- the order a theme is visited in ------------------------------------------
//
// **A program is visited in onset order, and it is written in arrival order.**
// The plan's events are in the order they *arrive* (`t`), the program keeps
// that order — both digests hash it — and one voice starts before it arrives:
// the swell, whose onset is 1.8 s ahead of its `t`. A look-ahead run stops at
// the first event whose onset is past its horizon, so walking the list as it
// is written reached a swell only when the events listed ahead of it — every
// one arriving in the 1.8 s before it — had come into reach: at its arrival,
// and `resolveStart` then moved the whole gesture to the head. MEASURED over
// 48 themes (seeds 1-12, themes one and two, both strategies): all 22 swells
// reached 1.5 to 1.7 s after their onset, on every live play; an offline
// render poured everything at once and never showed it (the reconciled review
// of 09-24, R1).
//
// So the cursor walks an **index**: the positions of the events sorted by
// onset, ties kept in the list's own order. It is a function of the onsets and
// nothing else, so it is worked out here, once per event list, rather than
// carried as a field of the program — a field would be a new byte in every
// program the fixtures hash, and the order is not a decision anybody made. A
// list whose onsets already rise (every theme with no anticipatory voice in
// it) has no index at all and is walked as it is written, which is the loop
// this file has always run.

const ORDER = new WeakMap<readonly ProgramEvent[], Int32Array | null>();

/**
 * The order a program's events are visited in: their positions sorted by
 * onset, stably, or `null` when the list is already in that order.
 */
export function visitOrder(program: Pick<Program, 'events'>): Int32Array | null {
  const events = program.events;
  if (ORDER.has(events)) return ORDER.get(events)!;
  let sorted = true;
  for (let i = 1; i < events.length; i++) if (events[i].onset < events[i - 1].onset) { sorted = false; break; }
  let order: Int32Array | null = null;
  if (!sorted) {
    order = new Int32Array(events.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    // `sort` on a typed array compares numbers; the tie-break on the position
    // is what keeps it stable and the list's own order between equal onsets.
    order.sort((a, b) => (events[a].onset - events[b].onset) || (a - b));
  }
  ORDER.set(events, order);
  return order;
}

/**
 * A list that is a copy of another with the same onsets — a deck seasoning
 * its own events (`seasonDeck`) — is visited in the same order, so the copy is
 * handed the index rather than sorting again on the tick.
 */
export function sameVisitOrder(from: readonly ProgramEvent[], to: readonly ProgramEvent[]): void {
  if (ORDER.has(from) && from.length === to.length) ORDER.set(to, ORDER.get(from)!);
}

/** The event at a cursor position: the `k`th to be visited. */
export function visitAt(program: Pick<Program, 'events'>, k: number): ProgramEvent {
  const order = visitOrder(program);
  return program.events[order ? order[k] : k];
}

/**
 * The cursor a deck starts at: the first event, in the order the program is
 * visited in, whose onset is at or after a position in theme seconds. A seek
 * lands here, and so does a set resumed inside a blend.
 */
export function firstEvent(program: Program, fromThemeTime: number): number {
  const events = program.events;
  const order = visitOrder(program);
  let k = 0;
  while (k < events.length && events[order ? order[k] : k].onset < fromThemeTime) k++;
  return k;
}

/**
 * The events of `program` that sound in a window, each with the instant it
 * lands on.
 *
 * `from` is where the caller has got to — the cursor of the first event it
 * has not visited, which is `firstEvent` at a start and `run.next` on every tick
 * after it — and `to` is the instant on this context's clock it is filling to.
 * The run ends at the first event whose **onset** is past that horizon, in
 * the order the program is visited in (`visitOrder`): an anticipatory sound is
 * visited when its own onset comes into reach, however far down the list its
 * arrival has put it.
 *
 * An event a hand-over has cut out is not in the result and the cursor still
 * passes it, so a hole is a hole and not a pause.
 */
export function schedule(program: Program, grid: Grid, from = 0, to = Infinity): Run {
  const events = program.events;
  // `Infinity` is "all of it", and it stays that even on a grid that bends:
  // mapping an infinite instant back through a tempo glide is not a horizon.
  const horizon = to === Infinity ? Infinity : grid.time(to);
  const gaps = grid.gaps;
  const order = visitOrder(program);
  const out: Scheduled[] = [];
  let k = Math.max(0, from);
  for (; k < events.length; k++) {
    const pe = events[order ? order[k] : k];
    if (pe.onset > horizon) break;
    if (pe.gap && gaps && inGap(gaps[pe.gap], pe.t)) continue;
    out.push({ pe, at: grid.at(pe.onset) });
  }
  return { events: out, next: k };
}

export default schedule;
