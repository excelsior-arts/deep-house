// The contract between the composer and the machine: what a plan becomes once
// it has been performed, and what a hand-over is about to do.
//
// **Nothing here composes anything.** A composer decides which notes there are,
// where the stage puts each of them, which curves the arrangement writes and
// where a theme hands over; every one of those decisions arrives here as a
// *value* — an event with its onset already resolved, an automation line
// addressed by a path into the graph, a point of a seam's curve with the ramp
// it is reached by. The engine reads these shapes and plays them, and the day a
// second composer writes a different music it writes the same shapes.
//
// It was the tail of `performance.ts` until round W of PLAN-V1-NEXT, which put
// the compiler's *rules* in `packages/deep-house` and the shapes it produces
// here, where the voices, the graph, the decks and the scheduler can read them
// without the machine importing a note of anybody's music. The sidechain is the
// one piece of arithmetic that came with them: its shape is a function of the
// room and of the beat the graph is running on, which are both the engine's, and
// `master.ts` has always been its only reader.

import type { Settings } from './settings.ts';

// --- the sound program ------------------------------------------------------
//
// What a plan becomes once the stage, the level table and the loudness trim
// have had their say: values and stable names, no audio nodes, no closures, no
// registry references, serialisable and frozen. It is what the live decks, the
// single-theme player and both offline renders are given, and it is what
// `tools/program.ts` locks.

/** A point on a curve: the value a parameter is to reach, in theme seconds. */
export interface CurvePoint {
  t: number;
  value: number;
}

/**
 * One automation line: which parameter of the graph, how the segments between
 * its points are interpolated, and the points themselves in theme seconds. The
 * name is a path into the graph (`push.body.gain`) and never a node: a runtime
 * looks it up when it has one, and the program is the same value in node.
 */
export interface AutomationLine {
  param: string;
  curve: 'linear' | 'exponential';
  points: CurvePoint[];
}

/**
 * One point of the sidechain, relative to the kick that posts it: `dt` is
 * seconds from that kick's onset. A `set` is clamped at zero where it would
 * fall before the start of the timeline, which is what `scheduleDuck` has
 * always done with its first point.
 */
export interface DuckPoint {
  p: string;
  op: 'set' | 'lin';
  dt: number;
  v: number;
}

/**
 * One automation point exactly as an AudioParam is handed it: which parameter,
 * which method, at what time, to what value. This is the shape the program
 * digest records; the runtime writes it and does not read it back.
 */
export interface AutomationPoint {
  p: string;
  op: string;
  t: number;
  v: number;
}

/**
 * One event as the voice will be handed it. `t` is the arrival, under the
 * plan's own name for it, so that everything which reads an event's time — the
 * piano's prewarm, a window of a theme, the bench — reads one field; `onset`
 * is when it has to be *visited*, which for the one anticipatory voice is 1.8
 * seconds earlier. `p` is the whole parameter object after the stage and the
 * level table, with nothing left to multiply at fire time.
 *
 * `duck` and `gap` are the two decisions the engine used to make by comparing
 * an event's voice against a name: which events post the sidechain, and which
 * belong to the low-end hand-over a seam cuts a hole in. They are answers the
 * registry gives, carried as data, so that the engine assumes neither that
 * every kick owns the hand-over nor that the bass is called `sub`.
 */
export interface ProgramEvent {
  /** Optional logical part identity, independent of its sound source. */
  part?: string;
  /** The compiler reserved this note from rotating stage treatments. */
  treatment?: 'none';
  /** Optional musical role, independent of the physical voice/layer. */
  role?: 'texture';
  i: number;
  voice: string;
  layer: string;
  bus: string;
  level: string | null;
  bar: number | null;
  step: number | null;
  t: number;
  onset: number;
  lead: number;
  duck: boolean;
  gap: 'kick' | 'sub' | null;
  /**
   * The values stay `any`, and it is the one place in this file they do: what
   * is in here is *the voice's own* parameter object, and every voice declares
   * a different one — a pitch and a level for a note, a curve and a tail for a
   * sweep. The engine carries it from the compiler to the voice and reads none
   * of it, so a shape written here would be a list of every instrument that
   * exists, which is the thing the registry is for.
   */
  p: Record<string, any>;
}

/** Where a theme hands over on its own: the bar, the instant, the blend. */
export interface SeamPlan {
  at: number;
  bar: number;
  bars: number;
  boundary: number;
}

/** The whole performance of one theme, as values. */
export interface Program {
  /** the theme's own seed, as whoever planned it writes one */
  seed: string | number;
  index: number | null;
  preset: string;
  bpm: number;
  beat: number;
  barSeconds: number;
  bars: number;
  duration: number;
  /** The room it was compiled under; every voice of it is played in this one. */
  settings: Settings;
  /** The per-theme loudness trim, and the gain the theme's output is set to. */
  trimDb: number;
  themeGain: number;
  seam: SeamPlan | null;
  blendBars: number | null;
  filterMove: string | null;
  routing: Record<string, string>;
  levels: Record<string, number>;
  events: ProgramEvent[];
  automation: AutomationLine[];
  /** The sidechain shape one kick posts, relative to its own onset. */
  duckShape: DuckPoint[];
  /** Per-kick shape requests in theme seconds. Playback joins overlapping
   * requests continuously, replacing the interrupted recovery. */
  duck: AutomationPoint[];
  /**
   * The stage's decisions bar by bar, for a readout. Nothing plays off it, and
   * nothing in the machine reads a row of it: the rows are the composer's own
   * and are carried, so what a row is stays the composer's to say.
   */
  development: unknown[];
}

// One duck ramp per kick. MEASURED: 6-9 dB down, a ~5 ms attack, the minimum
// 65 ms after the kick, and full recovery by the end of the beat.
//
// The shape is worked out once — from the room and from the beat the graph is
// running on — rather than per kick at fire time, which is what it used to be.
// The beat is the graph's and not the plan's on purpose: through a seam a deck
// is played on the set's grid and not on its own theme's target tempo, and
// what a duck recovers over is the beat the listener is hearing.
export function duckShape(settings: Settings, beat: number): DuckPoint[] {
  const P = settings.sidechain;
  const low = Math.pow(10, (P.lowDepthDb ?? P.depthDb) / 20);
  const out: DuckPoint[] = [];
  for (const p of ['duck.gain', 'duckLow.gain']) {
    const depth = p === 'duckLow.gain' ? low : Math.pow(10, P.depthDb / 20);
    out.push({ p, op: 'set', dt: -0.001, v: 1 });
    out.push({ p, op: 'lin', dt: P.attack, v: depth * 1.12 });
    out.push({ p, op: 'lin', dt: P.minimumAt, v: depth });
    // Two legs on the way back: most of the recovery happens in the first half
    // of the beat, which is what puts the envelope's minimum where the
    // reference sets have it instead of halfway to the next kick.
    out.push({ p, op: 'lin', dt: beat * 0.45, v: depth + (1 - depth) * 0.6 });
    out.push({ p, op: 'lin', dt: beat * P.recoverBy, v: 1 });
  }
  return out;
}

/** One trigger's requested shape; the writer resolves overlapping recoveries. */
export function duckAt(shape: DuckPoint[], at: number): AutomationPoint[] {
  return shape.map((d) => ({ p: d.p, op: d.op, t: d.op === 'set' ? Math.max(0, at + d.dt) : at + d.dt, v: d.v }));
}


// --- a hand-over, as values -------------------------------------------------
//
// Where a seam falls and what it does to the two decks is the composer's — the
// arithmetic is `seamCurves` in the deep house package — and these are the
// shapes it hands back. `writeSeam` in src/deck.ts is what turns them into
// parameters; between the two there is no name of a style, a theme or a tune.
/** One point of a seam's curve: the value to reach, when, and how. */
export interface CurveStep {
  v: number;
  t: number;
  k: 'set' | 'lin' | 'exp';
}

/**
 * One line of a hand-over: which of the two decks (or the sum they pass
 * through), which parameter of it by the path the deck resolves, and the points.
 */
export interface SeamLine {
  deck: 'from' | 'to' | 'sum';
  param: string;
  points: CurveStep[];
}

/** One hole in a deck's event list: a hand-over group, and the stretch cut out. */
export interface SeamHole {
  deck: 'from' | 'to';
  group: string;
  gap: [number, number];
}

/** A hand-over, as everything it is about to do. */
export interface SeamWrite {
  at: number;
  end: number;
  swapAt: number;
  bars: number;
  lines: SeamLine[];
  holes: SeamHole[];
}
