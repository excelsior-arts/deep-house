// The stage's blocks, declared, and the desk's layer over them.
//
// PLAN-DESK D2 (10-04). D1 put a setter on every number of an instrument's
// row, because a row's contract already said what each number was and where it
// might go. The stage — the boxes `describeGraph` draws between the buses and
// the master: the bass drive in parallel, the bass's body and compressor, the
// two ducks under the kick, the push, the glue, the edge and the bell on the harmonic bus,
// the width and the macro filter — is built from **blocks of the settings**
// (`bass.parallel`, `sidechain`, `bass.comp`, `master.glue`…), and nothing
// declared those fields as an interface. So this file does, once, and nothing
// in the view is wired per box: a box with a declaration here gets the panel.
//
// The unit of the interface stays the declared parameter. Where the box *is* an
// effect instance (the bass drive), its lines are the effect's own `ParamSpec`s
// — the unit, the range and the default the kitchen declared — read off the
// descriptor and not copied. Where the box is a bare node built from a block (a
// compressor, a peaking filter, a gain the duck's shape is written on), the
// lines are a **declared table** of that block's fields: the unit, and the
// range the node admits or the range a hand can mean, with the room's own
// number as the reset. A field of a block that a hand cannot honestly move here
// is listed as **fixed, with the reason**, so the check can hold every stage
// box to *declared or fixed* the way D0 held every row.
//
// **How a move reaches the sound** is said per line, because it is not one way:
//
//   param   an AudioParam of the built graph — the compressor's threshold, the
//           body filter's corner — ramped there through the graph's own door
//           (`V1Graph.stage`), which refuses a parameter a program's line
//           already writes (two writers on one parameter is the fault the ramp
//           lines exist to prevent);
//   effect  the bass drive's own setter (`EffectInstance.params`), which clamps
//           to its `ParamSpec` and moves every node the knob is;
//   setter  a number that is several parameters at different values — the bus
//           edge's drive, its drive gain and the make-up worked out off it —
//           moved through the setter the graph hands for it
//           (`ThemeGraph.stageSetters`), on every path that has the stage;
//   duck    the sidechain's depth: compiled into the five points a kick posts
//           (`duckShape`), so the graph's shape is worked out again from the
//           moved number and the **next kick** writes it;
//   build   a number the graph is built from and holds no parameter for — a
//           saturation curve, which input the drive's copy is fed — so a move
//           is heard **from the next theme**, whose graph is built with it.
//
// **The layer is the page's, never the plan's.** `withStage` hands the very
// same settings object back while nothing is moved (the identity the locks
// rest on, as D1's `withDesk`), and a frozen copy with the moved paths written
// while something is. It is applied where the mix builds a graph and nowhere
// else — never inside `settingsOf` or `resolveSettings`, so a tool, a lock, the
// loudness model and `programOf` read the plan's own numbers, and a desk move
// is not a plan move: the program and link digests do not see it. A block a
// theme does not build (a room that asks for no parallel drive) is not invented by a
// move: the move waits on the layer until a theme builds the block — but for a
// box that says what **stands in** for its block while the desk is up (the bus
// edge, DESK-EDGE): there a graph on a playing context builds the block at
// nought from the stand-in, and a move writes the block from it, so a hand can
// bring the box in where the room left it out. Away from the desk the stand-in
// is nothing, and the layer is empty anyway.

import type { Settings } from './settings.ts';
import type { FieldUnit } from './voices/schema.ts';
import type { ParamUnit } from './effects/contract.ts';
import { descriptor as BASS_DRIVE } from './effects/bass-drive.ts';
import { stepsOf } from './voices/desk-layer.ts';
import { HARMONIC_EDGE_FIELDS, HARMONIC_EDGE_AT_NOUGHT } from './voices/grain.ts';
import { liveArmed } from './voices/live.ts';

/**
 * How a move on a stage line reaches a graph, asked of that graph:
 *
 *   live     it was written to the graph that is up, ramped
 *   build    the graph holds no parameter for it: heard from the next theme
 *   line     a program's automation line writes that parameter this theme, so
 *            the desk does not: the move is heard in a theme without one
 *   absent   the graph has not built the box at all (a room that asks for no parallel drive)
 *   unknown  not a declared line
 */
export type StageHow = 'live' | 'build' | 'line' | 'absent' | 'unknown';

/** One declared field of a stage block: one line of its box's panel. */
export interface StageLine {
  /** the settings path: `bass.parallel.blend`, `sidechain.lowDepthDb` */
  path: string;
  /** the line's name on its panel: the field's own name */
  name: string;
  unit: FieldUnit | '';
  min: number;
  max: number;
  int?: boolean;
  /** how a move reaches a graph that is up (above) */
  how: 'param' | 'effect' | 'duck' | 'build' | 'setter';
  /** `param`: the graph's parameter by path; `effect`: the effect's parameter name; `setter`: the graph's setter by path */
  target?: string;
  /** what stands in a room whose block leaves the field out (an effect's own default, the duck's shared depth) */
  fallback?: (S: Settings) => number | undefined;
  /** a `param` or `effect` line held live only where the graph was built with this true (a wobble that was built) */
  liveIf?: (built: Settings) => boolean;
}

/** One stage box, as the desk sees it: its block, its declared lines and its fixed fields. */
export interface StageBox {
  /** the box's id in `describeGraph` */
  id: string;
  /** what a ledger line calls it: `the bass drive` */
  title: string;
  /** the block of the settings it is built from */
  block: string;
  /** whether a theme under these settings builds the box */
  builds: (S: Settings) => boolean;
  lines: StageLine[];
  /** the block's fields no line moves, and why */
  fixed: Array<{ path: string; why: string }>;
  /**
   * What stands in for the block where the room writes none, while the desk is
   * up — the graph built at nought from it (DESK-EDGE) — or `null`. A box
   * without one is never built where its room leaves the block out.
   */
  standIn?: (S: Settings) => Record<string, number> | null;
}

/** An effect's unit as a field's: the words the desk prints in (a beat count and an index are bare). */
export const UNIT_OF_SPEC: Record<ParamUnit, FieldUnit | ''> = {
  hz: 'hz', seconds: 'seconds', ms: 'ms', db: 'db', ratio: 'ratio', beats: '', index: 'count',
};

const parallelOf = (S: Settings) => (S.bass as { parallel?: Record<string, number> }).parallel;
const wobbleBuilt = (S: Settings): boolean => {
  const p = parallelOf(S);
  return !!p && (p.wobbleDepth ?? 0) > 0 && (p.wobbleBeats ?? 0) > 0;
};

/**
 * **The bass drive's lines are its `ParamSpec`s** (`effects/bass-drive.ts`),
 * read off the descriptor: a parameter added there is a line here. All move the
 * instance through its own setters but two: the copy's feed is the graph's
 * shape, set once when it is built, and the shell's mix is the clean path's,
 * always one — the blend is the copy's level.
 */
const bassDriveLines: StageLine[] = Object.entries(BASS_DRIVE.params)
  .filter(([name]) => name !== 'mix')
  .map(([name, spec]): StageLine => ({
    path: `bass.parallel.${name}`,
    name,
    unit: UNIT_OF_SPEC[spec.unit],
    min: spec.min,
    max: spec.max,
    ...(spec.unit === 'index' ? { int: true } : {}),
    how: name === 'side' ? 'build' : 'effect',
    target: name,
    fallback: () => spec.default,
    // the wobble's setters reach an LFO only where one was built (a period and a depth over nought)
    ...(name.startsWith('wobble') ? { liveIf: wobbleBuilt } : {}),
  }));

const num = (path: string, name: string, unit: FieldUnit | '', min: number, max: number, how: StageLine['how'], target?: string, more: Partial<StageLine> = {}): StageLine =>
  ({ path, name, unit, min, max, how, ...(target ? { target } : {}), ...more });

/** A compressor's five, in the ranges a `DynamicsCompressorNode` admits. */
const compLines = (block: string, node: string, liveIf?: (S: Settings) => boolean): StageLine[] => [
  num(`${block}.threshold`, 'threshold', 'db', -100, 0, 'param', `${node}.threshold`, liveIf ? { liveIf } : {}),
  num(`${block}.knee`, 'knee', 'db', 0, 40, 'param', `${node}.knee`, liveIf ? { liveIf } : {}),
  num(`${block}.ratio`, 'ratio', 'x', 1, 20, 'param', `${node}.ratio`, liveIf ? { liveIf } : {}),
  num(`${block}.attack`, 'attack', 'seconds', 0, 1, 'param', `${node}.attack`, liveIf ? { liveIf } : {}),
  num(`${block}.release`, 'release', 'seconds', 0, 1, 'param', `${node}.release`, liveIf ? { liveIf } : {}),
];

const SHAPE_TIMES = 'the shape\'s times are ordered against the beat the graph runs at, and a move that crossed two would fold the ramp; a later round\'s, with the relation stated';

/**
 * **The stage's boxes, declared**, in the order `describeGraph` draws them.
 * The ranges of a bare node's fields are the node's own where it states one (a
 * compressor's), and otherwise the span a hand can mean (a body bell of ±12
 * dB, a macro corner over the top four octaves) — wide of every room the
 * styles write.
 */
export const STAGE: Record<string, StageBox> = {
  duckLow: {
    id: 'duckLow', title: 'the low duck', block: 'sidechain', builds: () => true,
    lines: [
      num('sidechain.lowDepthDb', 'lowDepthDb', 'db', -24, 0, 'duck', undefined, { fallback: (S) => S.sidechain.depthDb }),
    ],
    fixed: [
      { path: 'sidechain.attack', why: `shared with the duck; ${SHAPE_TIMES}` },
      { path: 'sidechain.minimumAt', why: `shared with the duck; ${SHAPE_TIMES}` },
      { path: 'sidechain.firstLeg', why: `shared with the duck; ${SHAPE_TIMES}` },
      { path: 'sidechain.recoverBy', why: `shared with the duck; ${SHAPE_TIMES}` },
    ],
  },
  bassDrive: {
    id: 'bassDrive', title: 'the bass drive', block: 'bass.parallel',
    builds: (S) => { const p = parallelOf(S); return !!p && p.blend > 0; },
    lines: bassDriveLines,
    fixed: [{ path: 'bass.parallel.mix', why: 'the clean path\'s own mix, always one: the blend is the copy\'s level' }],
  },
  bassBody: {
    id: 'bassBody', title: 'the bass body', block: 'bass', builds: () => true,
    lines: [
      num('bass.bodyHz', 'bodyHz', 'hz', 30, 400, 'param', 'push.body.frequency'),
      num('bass.bodyDb', 'bodyDb', 'db', -12, 12, 'param', 'push.body.gain'),
      num('bass.bodyQ', 'bodyQ', '', 0.1, 4, 'param', 'push.body.Q'),
    ],
    fixed: [],
  },
  bassComp: {
    id: 'bassComp', title: 'the bass compressor', block: 'bass.comp', builds: () => true,
    lines: compLines('bass.comp', 'bassComp'),
    fixed: [],
  },
  push: {
    id: 'push', title: 'the push', block: 'push', builds: () => true,
    lines: [num('push.satDrive', 'satDrive', 'ratio', 0, 1, 'build')],
    fixed: [
      { path: 'push.satAmount', why: 'compiled into the arrangement\'s push line when the theme is planned: a move there is a plan move' },
      { path: 'push.bodyDb', why: 'compiled into the arrangement\'s push line when the theme is planned: a move there is a plan move' },
      { path: 'push.subDb', why: 'compiled into the arrangement\'s push line when the theme is planned: a move there is a plan move' },
      { path: 'push.buildBars', why: 'the arrangement\'s, read when the theme is planned' },
      { path: 'push.dropBars', why: 'the arrangement\'s, read when the theme is planned' },
      { path: 'push.dropLevel', why: 'the arrangement\'s, read when the theme is planned' },
      { path: 'push.buildLevel', why: 'the arrangement\'s, read when the theme is planned' },
      { path: 'push.markLevel', why: 'the arrangement\'s, read when the theme is planned' },
    ],
  },
  glue: {
    id: 'glue', title: 'the glue', block: 'master.glue', builds: () => true,
    // a glue at ratio 1 is built as a plain gain, and has no compressor to move until a theme builds one
    lines: [...compLines('master.glue', 'glue', (S) => S.master.glue.ratio > 1), num('master.glue.drive', 'drive', 'ratio', 0, 1, 'build')],
    fixed: [],
  },
  // **The bus edge** (DESK-EDGE, `effects/harmonic-edge.ts`): a driven copy of
  // the harmonic bus kept between its floor and its top, summed under the
  // clean bus. Its lines are the block's fields (`HARMONIC_EDGE_FIELDS`, the
  // ranges the topology computes), every one live: the blend and the corners
  // ramped on their parameters, the drive through the stage's setter, which
  // moves the drive and its make-up together; one line moves the edge on both
  // harmonic paths, the held and the struck. While the desk is up a room that
  // writes no edge builds one at nought (`HARMONIC_EDGE_AT_NOUGHT`), so the box
  // is there to bring in; away from the desk it is built where the room asks.
  harmonicEdge: {
    id: 'harmonicEdge', title: 'the bus edge', block: 'harmonicEdge',
    builds: (S) => (S.harmonicEdge?.blend ?? 0) > 0 || liveArmed(),
    lines: (Object.entries(HARMONIC_EDGE_FIELDS) as Array<[keyof typeof HARMONIC_EDGE_FIELDS, readonly [number, number]]>).map(([name, [min, max]]) =>
      num(`harmonicEdge.${name}`, name, name === 'blend' || name === 'drive' ? 'ratio' : 'hz', min, max,
        name === 'drive' ? 'setter' : 'param', `harmonicEdge.${name}`)),
    fixed: [],
    standIn: (S) => (liveArmed() && !S.harmonicEdge ? { ...HARMONIC_EDGE_AT_NOUGHT } : null),
  },
  harmonicBell: {
    id: 'harmonicBell', title: 'the bus bell', block: 'harmonicBell',
    builds: (S) => !!(S.harmonicBell && S.harmonicBell.db),
    lines: [
      num('harmonicBell.hz', 'hz', 'hz', 200, 8000, 'param', 'harmonicBell.frequency'),
      num('harmonicBell.q', 'q', '', 0.1, 4, 'param', 'harmonicBell.Q'),
      num('harmonicBell.db', 'db', 'db', -6, 12, 'param', 'harmonicBell.gain'),
    ],
    fixed: [],
  },
  duck: {
    id: 'duck', title: 'the duck', block: 'sidechain', builds: () => true,
    lines: [
      num('sidechain.depthDb', 'depthDb', 'db', -30, 0, 'duck'),
      // only where the room writes one: without it the struck notes take the pads' own shape, and a move would make a different duck
      num('sidechain.struckDepthDb', 'struckDepthDb', 'db', -24, 0, 'duck'),
    ],
    fixed: [
      { path: 'sidechain.attack', why: SHAPE_TIMES },
      { path: 'sidechain.minimumAt', why: SHAPE_TIMES },
      { path: 'sidechain.firstLeg', why: SHAPE_TIMES },
      { path: 'sidechain.recoverBy', why: SHAPE_TIMES },
      { path: 'sidechain.struckAfter', why: SHAPE_TIMES },
    ],
  },
  width: {
    id: 'width', title: 'the width', block: 'space', builds: () => true,
    lines: [
      num('space.widthBase', 'widthBase', 'x', 0, 3, 'param', 'width.gain'),
      num('space.widthDepth', 'widthDepth', 'x', 0, 1.5, 'param', 'widthDepth.gain'),
      num('space.widthRateHz', 'widthRateHz', 'hz', 0.01, 2, 'param', 'widthLfo.frequency'),
    ],
    fixed: [],
  },
  macro: {
    id: 'macro', title: 'the macro filter', block: 'master', builds: () => true,
    lines: [num('master.filterOpen', 'filterOpen', 'hz', 1000, 20000, 'param', 'macro.frequency')],
    fixed: [{ path: 'master.filterClosed', why: 'the arrangement\'s closed corner, compiled into its line when the theme is planned' }],
  },
};

const BY_PATH = new Map<string, { box: StageBox; line: StageLine }>();
for (const box of Object.values(STAGE)) for (const line of box.lines) if (!BY_PATH.has(line.path)) BY_PATH.set(line.path, { box, line });

/**
 * The declared line at a path, and the box it is on. Two boxes may name one
 * path (none do today); the first in drawing order owns it.
 */
export const stageLine = (path: string): { box: StageBox; line: StageLine } | null => BY_PATH.get(path) ?? null;

// --- reading a block ---------------------------------------------------------

const isTable = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function readPath(o: unknown, path: string): unknown {
  let at = o;
  for (const s of stepsOf(path)) {
    if (!isTable(at)) return undefined;
    at = at[s];
  }
  return at;
}

/**
 * **The room's number on a line**: what the settings say, or what stands in
 * where the block leaves the field out (an effect's own default), or `null`
 * where the block itself is not there or the field has no stand-in.
 */
export function roomOf(S: Settings, path: string): number | null {
  const found = stageLine(path);
  const v = readPath(S, path);
  if (typeof v === 'number') return v;
  if (!found) return null;
  if (!isTable(readPath(S, found.line.path.replace(/\.[^.]+$/, '')))) {
    const stand = found.box.standIn?.(S)?.[found.line.name];
    return typeof stand === 'number' ? stand : null;
  }
  const f = found.line.fallback?.(S);
  return typeof f === 'number' ? f : null;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze((o as Record<string, unknown>)[k]);
  }
  return o;
}

/**
 * **These settings with numbers written on them**, frozen: each path whose
 * block the settings carry, and only those — a move on a block a theme does
 * not build is not a block. A field the block leaves out is written where its
 * line has a stand-in (the effect's own default is what played). With nothing
 * to write, the very same object.
 */
export function settingsWith(S: Settings, moves: Iterable<[string, number]>): Settings {
  let out: Record<string, unknown> | null = null;
  for (const [path, v] of moves) {
    const found = stageLine(path);
    const steps = stepsOf(path);
    const parent = readPath(S, steps.slice(0, -1).join('.'));
    const had = readPath(S, path);
    // a block the room leaves out is written from what stands in for it, where something does (the bus edge while the desk is up)
    const stand = !isTable(parent) && found && steps.length === 2 ? found.box.standIn?.(S) ?? null : null;
    if (!isTable(parent) && !stand) continue;
    if (stand) {
      if (stand[found!.line.name] === v) continue;
      out ??= structuredClone(S) as unknown as Record<string, unknown>;
      const block = (out[steps[0] as string] ??= { ...stand }) as Record<string, unknown>;
      block[steps[1] as string] = v;
      continue;
    }
    if (typeof had !== 'number' && !(found && found.line.fallback?.(S) !== undefined)) continue;
    if (had === v) continue;
    out ??= structuredClone(S) as unknown as Record<string, unknown>;
    let at: Record<string, unknown> = out;
    for (const s of steps.slice(0, -1)) at = at[s] as Record<string, unknown>;
    at[steps[steps.length - 1] as string] = v;
  }
  return out ? deepFreeze(out) as unknown as Settings : S;
}

// --- the desk's layer ----------------------------------------------------------

const moves = new Map<string, number>();
let version = 0;
const cache = new WeakMap<Settings, { version: number; out: Settings }>();

/** What the desk has moved on the stage, by path. */
export const stageMoves = (): Record<string, number> => Object.fromEntries(moves);

/** How many times the stage layer has changed: what a copy built over it is good for. */
export const stageVersion = (): number => version;

/**
 * **The settings a graph is built from, with the desk's stage moves on them**
 * (D2). With nothing moved, the very same object — the program, the link and
 * every lock read what they always read. With a move, a frozen copy, the same
 * copy for one version of the layer.
 */
export function withStage(S: Settings): Settings {
  if (!moves.size) return S;
  const had = cache.get(S);
  if (had && had.version === version) return had.out;
  const out = settingsWith(S, moves);
  cache.set(S, { version, out });
  return out;
}

/** What a move did: the number now on the layer (`null` where the line is the room's again), or why it was refused. */
export interface StageMove {
  changed: boolean;
  value: number | null;
  refused?: string;
}

/**
 * **Move one number of a stage block** (D2): `value` on the declared line at
 * `path`, clamped to its range (a count rounded); `null`, or anything not a
 * finite number, puts the line back to the room. A path no box declares is
 * refused, and so is a field the room does not voice and no stand-in covers
 * (the struck notes' own depth in a room that has none) — `room`, the settings
 * the move is heard in, answers that; without one nothing is refused for it.
 */
export function setStageParam(path: string, value: number | null, room: Settings | null = null): StageMove {
  const found = stageLine(path);
  if (!found) return { changed: false, value: null, refused: `${path} is not a declared line of the stage` };
  const { line, box } = found;
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
    if (!moves.has(path)) return { changed: false, value: null };
    moves.delete(path);
    version++;
    return { changed: true, value: null };
  }
  if (room && box.builds(room) && roomOf(room, path) === null)
    return { changed: false, value: moves.get(path) ?? null, refused: `this room writes no ${line.name}, and nothing stands in for it` };
  let v = line.int ? Math.round(value) : value;
  v = Math.max(line.min, Math.min(line.max, v));
  if (moves.get(path) === v) return { changed: false, value: v };
  moves.set(path, v);
  version++;
  return { changed: true, value: v };
}

/** One box's moves off (by its id), or every box's: the paths that were moved. */
export function clearStage(box?: string): string[] {
  const paths = [...moves.keys()].filter((p) => box === undefined || stageLine(p)?.box.id === box);
  for (const p of paths) moves.delete(p);
  if (paths.length) version++;
  return paths;
}

// --- the panel's reading -----------------------------------------------------

/** One line of a stage box's panel: D1's device line, with what a move waits on where it is not live. */
export interface StageParam {
  path: string;
  name: string;
  value: number | null;
  unit: FieldUnit | '';
  kind: 'num';
  min: number;
  max: number;
  int?: boolean;
  /** where the desk has moved it: the room's number under the move */
  row?: number;
  /** how a move reaches the graph that is up */
  how: StageHow | null;
  /** a sentence for a line that is not live, said under its fader */
  waits?: string;
}

/** The sentence a line that is not live says. */
export const WAITS: Record<Exclude<StageHow, 'live' | 'unknown'>, string> = {
  build: 'takes effect at the next theme: the graph holds no parameter for it',
  line: 'the arrangement\'s line writes this parameter this theme: a move is heard in a theme without one',
  absent: 'not built this theme; a move takes effect when a theme builds it',
};

/** One stage box, read for its panel: its lines under these settings and the desk's moves, and how each would reach the graph. */
export interface StageDevice {
  box: string;
  title: string;
  block: string;
  /** whether the theme builds it */
  built: boolean;
  params: StageParam[];
  fixed: Array<{ path: string; why: string }>;
}

/**
 * **A stage box's device** (D2): its declared lines, each with the room's
 * number (or the desk's, with the room's beside it as `row`), and — given a
 * graph's answer — how a move reaches the sound. A reading; it writes nothing.
 * @param how the graph's own answer per path (`V1Graph.stageHow`), where one is up
 */
export function stageOf(S: Settings | null, box: string, how: ((path: string) => StageHow) | null = null): StageDevice | null {
  const B = STAGE[box];
  if (!B) return null;
  const built = S ? B.builds(S) : false;
  const params = B.lines.map((line): StageParam => {
    const room = S ? roomOf(S, line.path) : null;
    const moved = moves.get(line.path);
    const h: StageHow | null = how ? how(line.path) : S && !built ? 'absent' : line.how === 'build' ? 'build' : null;
    const p: StageParam = {
      path: line.path, name: line.name, value: moved ?? room, unit: line.unit, kind: 'num', min: line.min, max: line.max,
      ...(line.int ? { int: true } : {}), how: h,
    };
    if (moved !== undefined && room !== null) p.row = room;
    if (h && h !== 'live' && h !== 'unknown') p.waits = WAITS[h];
    return p;
  });
  return { box, title: B.title, block: B.block, built, params, fixed: B.fixed };
}

export default STAGE;
