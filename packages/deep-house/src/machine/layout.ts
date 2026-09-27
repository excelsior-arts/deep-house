// Where a box goes, and how a wire gets there.
//
// Eugene, 09-19, on the first canvas: *"hierarchy is not reading at all; bring
// it to a human-level useful interface that also explains the system
// architecture."* So the picture is the machine's own stages, as titled
// columns — and since round M1 (09-25) there are four of them, because three
// of the seven stages are drawn *inside* another's column:
//
//   sources │ buses — effects over meters │ stage │ master chain, output under it
//
// **Which column a box is in is a field of the box** (`MachineNode.stage`,
// declared where the box is described); `HOST` below says which column a stage
// is drawn in, and a column nothing lands in is not drawn.
//
// What M1 asked of it, in Eugene's words, and where each is answered:
//
//   *"all instruments in one column, compact, one line per instrument; drums,
//   then bass, then mid, then high — all drum components together"* — the
//   sources are one column of one-line rows, framed by `GROUPS` (model.ts);
//
//   *"split the bus column into two vertically stacked areas — effects on top
//   (line inserts on the left, sends and returns on the right), bus meters
//   below"* — `busColumn`;
//
//   *"where stage boxes are stacked vertically, lines may leave and enter from
//   the top and bottom"* — a box feeding the box directly under it is one
//   straight drop (`stack`), and the order of a stacked column is chosen so
//   that as many of its wires as possible are such drops;
//
//   *"the natural output may sit in the master chain's column, at the
//   bottom"* — `HOST.output`;
//
//   and his screenshot of three faults — a thin wire with an arrowhead across
//   two thick ones under the meters, a dotted corner on a solid one at the
//   hall's return, and wires merging into one bundle. All three had one cause:
//   the old router drew a wire as a curve through a *band* and let two wires
//   ask for the same height in it (a lane was `n % 5`, a rail was a sum of two
//   rounded terms), with corners 8 units round on rails 4 apart. **Every wire
//   now has a lane of its own in every channel it runs through** — a gutter
//   between two columns, the rail over the meters, the channel under them, the
//   channel inside the effects area, the one under the whole drawing — and a
//   corner is never rounder than half the distance between two lanes, so two
//   wires can cross but can never run in one line or share a corner.
//
// The wires are orthogonal: out of a box square to its side, along the lanes
// of the channels between, and square into the other box. Which lane in a
// channel, and which port along a box's side, is chosen by counting: every
// adjacent pair is swapped wherever that crosses fewer wires, a few passes
// over (`untangle`).
//
// Everything in here is arithmetic over a description. `npm run check` walks
// it and counts what it finds.

import type { MachineEdge, MachineNode, MachinePart, Stage } from '@deep-house/engine/describe';
import { KEY, SPACE } from './look.ts';

/** Which edge of a box a wire leaves or arrives by. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Where one box landed, in the units the canvas is drawn in. */
export interface Place {
  node: MachineNode;
  x: number;
  y: number;
  w: number;
  h: number;
  /** the column it is in, by index among the columns that are drawn */
  column: number;
  /** a rack unit's rows share one frame; this is its row, or −1 */
  row: number;
}

/** One framed group: a family of sources, or an area of the bus column. */
export interface Frame {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One column: the stage whose title it carries, and where it is. */
export interface Column {
  stage: Stage;
  x: number;
  w: number;
  /** how far its title's sentence may run: to the next column's title */
  room: number;
}

/** One wire, as a path plus the two points a mark can sit on. */
export interface Wire {
  edge: MachineEdge;
  /** the path, or `''` where the rack's own stacking is the wire */
  d: string;
  /** the corners of the path, before they are rounded: what a measurement reads */
  pts: Array<{ x: number; y: number }>;
  /** where it leaves, for a dot where several wires leave one box */
  from: { x: number; y: number };
  /** where it arrives, for the arrowhead */
  at: { x: number; y: number };
  /** true where the wire is the rack's own stacking and nothing is drawn */
  implied: boolean;
  /**
   * **Where the wire rides a trunk** (M3): the trunk's id, and the two pieces
   * of it that are its own and are drawn — the branch off its own port on the
   * box it leaves, and the branch into its own port on the box it reaches. The
   * run between them is the trunk's, drawn once for every wire riding it; `d`
   * and `pts` are still the wire's whole path, end to end, which is what a
   * hand picking it lights.
   */
  trunk?: string;
  branches?: Array<Array<{ x: number; y: number }>>;
  /** the two branches as drawn: each curving onto the trunk, or off it, the way the signal goes */
  branchD?: [string, string];
  /**
   * **Where the wire arrives by a joined arrival** (M8): the join's id, and
   * what of the wire is its own and drawn — its run, and its curve onto the
   * join's stem and a little way down it. The stem into the box, with the one
   * arrowhead, is the join's, drawn once. `d` is still the whole wire.
   */
  join?: string;
  own?: Array<{ x: number; y: number }>;
  ownD?: string;
}

/**
 * **One arrival several wires join into** (M8, Eugene: *"drums are busy with
 * lines — since the main paths are spread apart on the run, it's fine to merge
 * them at the box"*): the stem from where the furthest of them turns onto it
 * to the port, drawn once with one arrowhead.
 */
export interface Join {
  id: string;
  /** how the wires joining it are drawn: `main` where they are on the way to the output */
  look: string;
  count: number;
  d: string;
  at: { x: number; y: number };
}

/** One trunk: the run a group of wires shares, drawn once. */
export interface Trunk {
  id: string;
  kind: MachineEdge['kind'];
  /** its straight runs, each one lane of one channel */
  segs: Array<[{ x: number; y: number }, { x: number; y: number }]>;
  /** how many wires ride it */
  count: number;
  /** the trunk as drawn: its runs, and a curve where one run turns into another */
  d: string;
}

/** The whole canvas, placed. */
export interface Layout {
  places: Map<string, Place>;
  order: Place[];
  /** the families of the sources */
  frames: Frame[];
  /** the labelled areas inside a column: the bus column's effects, and its two halves */
  areas: Frame[];
  columns: Column[];
  edges: MachineEdge[];
  wires: Wire[];
  /** the drawing's own units */
  width: number;
  height: number;
  /** what one unit is worth in pixels: 1 until the pane is wider than the drawing wants */
  scale: number;
  /** the band the boxes and the wires live in, under the titles and over the legend */
  top: number;
  bottom: number;
  /** the master's response, at the foot of its column under the output, where there is a rack */
  bells: { x: number; y: number; w: number; h: number } | null;
  /** the runs groups of wires share: the sends, and a bus's sidechain keys */
  trunks: Trunk[];
  /** the arrivals several wires into one face of one box join into */
  joins: Join[];
}

/** How much room the canvas has, in pixels. Nought means: draw it at its own size. */
export interface Fit {
  width: number;
  height: number;
  /**
   * How much wider the spacing is than the phone's, in the drawing's units
   * (M6); and the scale the drawing is shown at, which is the size of a box
   * and of a word. Given both, the drawing fills the width it is given by its
   * gutters alone and is never zoomed past `type`.
   */
  space?: number;
  type?: number;
}

// --- the sizes ----------------------------------------------------------------
//
// The boxes are drawn at one size and only ever scaled **as a whole**, because
// type scaled on its own cannot be read. What varies with the room is the space
// between the columns and the length of a meter.

/**
 * a source: its name, what is playing it and its channel strip — one line, or
 * two where the instrument would be cut on one (M4: *"turn back to two-liners
 * and a narrower width"*), the name and the keys on the first and the
 * instrument under them
 */
export const SOURCE_W = 236;
export const SOURCE_H = 28;
export const SOURCE_H2 = 42;
/** the rows of one family are a list, a hair apart */
export const SOURCE_GAP = SPACE.hair;
/**
 * **A source's keys** (drawn by source-controls.tsx): M, S and the level, a gap
 * of `s` between them, and a `hair` inset from the row's frame on the right and
 * above and below alike, so a key never touches the frame (M5).
 */
export const KEY_W = KEY.w;
export const KEY_H = KEY.h;
export const KEY_GAP = SPACE.s;
export const LEVEL_W = 36;
export const KEY_INSET = (SOURCE_H - KEY_H) / 2;
export const SOURCE_KEYS_W = KEY_INSET + KEY_W * 2 + LEVEL_W + KEY_GAP * 2;
/** the room a source's words have on one line, and what they take: the face is monospaced */
const SOURCE_WORDS = SOURCE_W - 16 - SOURCE_KEYS_W;
export const oneLine = (label: string, made: string): boolean =>
  label.length * (8.5 * 0.6 + 0.6) + 7 + made.length * 7.5 * 0.6 <= SOURCE_WORDS;
/** a stage box, and the output */
export const BOX_W = 140;
export const BOX_H = 48;
/**
 * **The effects area is one height through a set** (M4, Eugene: *"reserve more
 * space above the bus block so dynamic lane inserts and effects do not push
 * the bus blocks up and down throughout the song"*): room for six chips a
 * side — every return the graph can build is six (delay, reverb, room, hall,
 * background, immersed) — and more than six are drawn shorter to fit.
 */
export const EFFECTS_ROWS = 6;
/**
 * The rail over the meters keeps room for fourteen wires dropping into the
 * strips: the most measured over forty seeds, three themes each and three bars
 * a theme under both engines is twelve (house-v2's parts and spatial returns
 * come and go, 8 to 12 a theme; house-v1 is always 8), and two more to spare.
 */
export const RAIL_LANES = 14;
/** a lane insert, and a send: small, one title and two lines */
export const CHIP_W = 118;
export const CHIP_H = 40;
export const SEND_W = 150;
export const SEND_H = 42;
/** a bus's strip: its meter is as long as the canvas can afford */
export const STRIP_W = 50;
export const STRIP_GAP = SPACE.s;
export const STRIP_H = 176;
export const STRIP_H_MAX = 520;
/** a row of the master's one rack unit */
export const RACK_W = 180;
export const ROW_H = 24;
export const ROW_H_MAX = 36;
/** the master's response curve, and the line of its title over it */
export const BELLS_H = 52;
export const BELLS_TITLE = 14;
/** the line from the chain's last row down into the output */
export const OUT_DROP = 30;

/** Between two boxes stacked in a column: room for a straight drop and its arrowhead. */
export const STACK_GAP = 18;
/** a frame's inset, the room its label wants, and the room between two frames */
export const FRAME_PAD = SPACE.s;
export const FRAME_LABEL = SPACE.l;
export const FAMILY_GAP = SPACE.m;
/** a box stands this far off the frame of the area it is in, and off the next box */
export const INSET = SPACE.s;

/** Two lanes of one channel are this far apart, and no nearer. */
export const PITCH = 6;
/** A channel's first lane is this far in from its edge: room for an arrowhead. */
export const EDGE = 14;
/**
 * **How round a corner is** (M5, Eugene: *"all curves in lines should have a
 * bigger radius — on merged lines the curves will give a better idea where a
 * line goes"*): 7 units, which is half of `EDGE`, so the stub out of a box and
 * the drop into one still hold a whole corner, and which the lanes allow as
 * they are: two wires turning together in neighbouring lanes turn on arcs that
 * are the same arc moved a lane across, so they stay a lane apart all the way
 * round, whatever the radius. A corner on a leg shorter than two radii is as
 * round as half that leg.
 *
 * **One radius for every wire** (M8, Eugene: *"the curve is too wide — it
 * should be round but consistent on all lines, not relative to distances"*):
 * M6 drew neighbouring corners on one centre, the outer ones wider by a lane
 * each; now each turns at `RADIUS` on its own centre, which keeps a bank a
 * lane apart as well, since the lanes are parallel before and after it.
 */
export const RADIUS = 7;
/** The narrowest a gutter is, and how much wider it may grow before the drawing scales. */
export const GUTTER_MIN = 30;
export const GUTTER_GROW = 60;

export const PAD = 16;
/** the band at the top of a column: its title and its one sentence */
export const HEAD_H = 42;
/** the band under the whole canvas: the legend */
export const LEGEND_H = 32;

/**
 * **The density the drawing is laid out at** (M6): every gap, inset, lane and
 * corner above is multiplied by it — 1 at a phone's width, more as the screen
 * grows (`density` in look.ts) — while the boxes and the type keep their size
 * and grow only with the drawing's own `scale`. It is set at the top of
 * `layoutCanvas`, which is the only way in, and read by the helpers it calls.
 */
let S = 1;

/** The one designed break: under this the three panes become one long page. */
export const RACK_MIN_WIDTH = 900;

/** a coordinate as the path writes it: to a hundredth, so an arc meets its runs on the tangent */
const r = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What a box is drawn as, which is what decides its size. */
export type Shape = 'source' | 'box' | 'chip' | 'send' | 'strip' | 'row';

export function shapeOf(node: MachineNode): Shape {
  if (node.stage === 'sources') return 'source';
  if (node.stage === 'buses') return 'strip';
  if (node.stage === 'inserts') return 'chip';
  if (node.stage === 'sends') return 'send';
  if (node.stage === 'master') return 'row';
  return 'box';
}

/** Which column a stage is drawn in. The output joins the master where there is one. */
type Host = 'sources' | 'buses' | 'stage' | 'master' | 'output';
const HOSTS: Host[] = ['sources', 'buses', 'stage', 'master', 'output'];
const HOST: Record<Stage, Host> = {
  sources: 'sources', inserts: 'buses', buses: 'buses', sends: 'buses', stage: 'stage', master: 'master', output: 'output',
};

// --- the channels ---------------------------------------------------------------

/**
 * A channel: a strip of the canvas with nothing drawn in it, that wires run
 * along — up and down a gutter, or across the rail over the meters. Each wire
 * in it has its own lane, `PITCH` from the next, centred in the channel.
 */
interface Channel {
  id: string;
  orient: 'v' | 'h';
  /** the extent across the lanes: x for a vertical channel, y for a horizontal one */
  lo: number;
  hi: number;
  lanes: Route[];
}

const laneAt = (c: Channel, w: Route): number => {
  const i = c.lanes.indexOf(w.group ?? w);
  const n = c.lanes.length;
  return (c.lo + c.hi) / 2 + (i - (n - 1) / 2) * (PITCH * S);
};
const laneRoom = (n: number) => 2 * (EDGE * S) + Math.max(0, n - 1) * (PITCH * S);

/** One wire on its way through the channels. */
interface Route {
  edge: MachineEdge;
  a: Place;
  b: Place;
  exit: Side;
  entry: Side;
  chans: Channel[];
  kind: 'route' | 'stack' | 'implied';
  pts: Array<{ x: number; y: number }>;
  /** how far its exit, and its entry, are moved along their side, off a lane another wire runs in */
  nudge?: number;
  nudgeIn?: number;
  /** the box its corners stand in, so two wires far apart are not compared at all */
  bb?: [number, number, number, number];
  /** each corner's own radius, by the index of its vertex (`radiiOf`) */
  radii?: number[];
  /** the wire whose lanes it rides, where it rides a trunk (the first of the group, itself included) */
  group?: Route;
  trunk?: string;
  /** the first wire of the joined arrival it arrives by, itself included (M8) */
  join?: Route;
  joinId?: string;
}

/** The ports down one side of one box, in the order they are handed out. */
type Ports = Map<string, Route[]>;
const portKey = (p: Place, side: Side) => `${p.node.id}|${side}`;

function portOf(ports: Ports, p: Place, side: Side, w: Route): { x: number; y: number } {
  const list = ports.get(portKey(p, side)) || [w];
  const i = Math.max(0, list.indexOf(w));
  const n = list.length;
  const t = (i + 1) / (n + 1);
  if (side === 'left' || side === 'right') return { x: side === 'left' ? p.x : p.x + p.w, y: p.y + p.h * t };
  return { x: p.x + p.w * t, y: side === 'top' ? p.y : p.y + p.h };
}

/**
 * **The whole canvas.**
 *
 * @param groups the framed groups of the sources, in the order they are drawn;
 *   a group nothing is in is not drawn
 * @param fit how much room the pane has, in pixels; nought for the drawing's
 *   own packed size, which is what the phone and a check ask for
 */
export function layoutCanvas(
  part: MachinePart,
  groups: ReadonlyArray<{ id: string; label: string }> = [],
  fit: Fit = { width: 0, height: 0 },
): Layout {
  S = fit.space && fit.space > 0 ? fit.space : 1;
  const byId = new Map(part.nodes.map((n): [string, MachineNode] => [n.id, n]));
  const edges = part.edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const hasMaster = part.nodes.some((n) => n.stage === 'master');
  const hostOf = (n: MachineNode): Host => (n.stage === 'output' && hasMaster ? 'master' : HOST[n.stage]);
  const hosts = HOSTS.filter((h) => part.nodes.some((n) => hostOf(n) === h));
  const colOf = (n: MachineNode) => hosts.indexOf(hostOf(n));
  const of = (stage: Stage) => part.nodes.filter((n) => n.stage === stage);

  // --- the order down each stacked column ---------------------------------------
  const feeders = new Map<string, string[]>();
  const fed = new Map<string, string[]>();
  for (const n of part.nodes) { feeders.set(n.id, []); fed.set(n.id, []); }
  for (const e of edges) { feeders.get(e.to)!.push(e.from); fed.get(e.from)!.push(e.to); }
  const strips = of('buses');
  const stackOrder = stackIn(of('stage'), edges, (id) => {
    // what feeds it from outside the stage, by where that is along the desk
    const at = edges.filter((e) => e.to === id && e.kind === 'signal').map((e) => strips.findIndex((s) => s.id === e.from)).filter((i) => i >= 0);
    return at.length ? Math.min(...at) : strips.length;
  });

  // --- the sources, one column, by family ----------------------------------------
  const sources = of('sources');
  const cells: Array<{ id: string; label: string; nodes: MachineNode[] }> = [];
  for (const g of groups) {
    const nodes = sources.filter((n) => n.group === g.id);
    if (nodes.length) cells.push({ id: g.id, label: g.label, nodes });
  }
  const held = new Set(cells.flatMap((c) => c.nodes.map((n) => n.id)));
  const loose = sources.filter((n) => !held.has(n.id));
  if (loose.length) cells.push({ id: 'other', label: 'other', nodes: loose });

  // --- which way each wire goes, before anything is placed ------------------------
  //
  // A wire's channels depend only on which columns its two ends are in and
  // what the ends are, so they are counted first: a gutter is as wide as the
  // lanes it has to hold.
  const inserts = of('inserts');
  const sends = of('sends');
  const stripIds = new Set(strips.map((s) => s.id));
  const rackRows = of('master');
  const rackIndex = new Map(rackRows.map((n, i): [string, number] => [n.id, i]));
  const stackIndex = new Map(stackOrder.map((n, i): [string, number] => [n.id, i]));
  const busCol = hosts.indexOf('buses');

  type Plan = { edge: MachineEdge; kind: Route['kind']; exit: Side; entry: Side; chans: string[]; trunk?: string };
  const plans: Plan[] = [];
  for (const e of edges) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const ca = colOf(a);
    const cb = colOf(b);
    const g = (i: number) => `g${i}`;
    // the rack's own stacking
    if (rackIndex.has(a.id) && rackIndex.get(b.id) === rackIndex.get(a.id)! + 1) {
      plans.push({ edge: e, kind: 'implied', exit: 'bottom', entry: 'top', chans: [] });
      continue;
    }
    // a stacked column's straight drops
    if (stackIndex.has(a.id) && stackIndex.get(b.id) === stackIndex.get(a.id)! + 1) {
      plans.push({ edge: e, kind: 'stack', exit: 'bottom', entry: 'top', chans: [] });
      continue;
    }
    // a send: up off the strip, along a lane of its own over the rail, and up
    // the effects area's channel into the return's side (M2, Eugene: *"they
    // shouldn't overlap, hard to trace"* — it was one shared aux bar in M1)
    if (stripIds.has(a.id) && b.stage === 'sends') {
      plans.push({ edge: e, kind: 'route', exit: 'top', entry: 'left', chans: ['sr', 'm'] });
      continue;
    }
    // the chain's last row into the output straight under it
    if (rackIndex.get(a.id) === rackRows.length - 1 && b.stage === 'output' && colOf(b) === colOf(a)) {
      plans.push({ edge: e, kind: 'stack', exit: 'bottom', entry: 'top', chans: [] });
      continue;
    }
    // into a strip, always from the rail over the meters
    if (stripIds.has(b.id)) {
      if (stripIds.has(a.id)) { plans.push({ edge: e, kind: 'route', exit: 'top', entry: 'top', chans: ['rail'] }); continue; }
      if (a.stage === 'inserts') { plans.push({ edge: e, kind: 'route', exit: 'right', entry: 'top', chans: ['m', 'rail'] }); continue; }
      if (a.stage === 'sends') { plans.push({ edge: e, kind: 'route', exit: 'left', entry: 'top', chans: ['m', 'rail'] }); continue; }
      if (ca < busCol) {
        const chans = ca === busCol - 1 ? [g(ca), 'rail'] : [g(ca), 'bottom', g(busCol - 1), 'rail'];
        plans.push({ edge: e, kind: 'route', exit: 'right', entry: 'top', chans });
        continue;
      }
      const chans = ca === busCol + 1 ? [g(busCol), 'rail'] : [g(ca - 1), 'bottom', g(busCol), 'rail'];
      plans.push({ edge: e, kind: 'route', exit: 'left', entry: 'top', chans });
      continue;
    }
    // out of a strip, always into the channel under the meters
    if (stripIds.has(a.id)) {
      if (cb > busCol) {
        const chans = cb === busCol + 1 ? ['under', g(busCol)] : ['under', g(busCol), 'bottom', g(cb - 1)];
        plans.push({ edge: e, kind: 'route', exit: 'bottom', entry: 'left', chans });
      } else {
        const chans = cb === busCol - 1 ? ['under', g(busCol - 1)] : ['under', g(busCol - 1), 'bottom', g(cb)];
        plans.push({ edge: e, kind: 'route', exit: 'bottom', entry: 'right', chans });
      }
      continue;
    }
    // everything else: forward into the next column, round a column's own
    // right-hand gutter, or back under the drawing
    if (cb > ca) {
      const chans = cb === ca + 1 ? [g(ca)] : [g(ca), 'bottom', g(cb - 1)];
      plans.push({ edge: e, kind: 'route', exit: 'right', entry: 'left', chans });
    } else if (cb === ca) {
      plans.push({ edge: e, kind: 'route', exit: 'right', entry: 'right', chans: [g(ca)] });
    } else {
      const chans = cb === ca - 1 ? [g(cb)] : [g(ca - 1), 'bottom', g(cb)];
      plans.push({ edge: e, kind: 'route', exit: 'left', entry: 'right', chans });
    }
  }
  // **Trunks** (M3, Eugene: *"make sure they don't merge at the box, but it's
  // fine to optimise and merge along the routes"*): every send, and a bus's
  // sidechain keys where it has more than one, ride one set of lanes between
  // their own ports, and so, since M4, do the returns into one box. A trunk
  // counts once in every channel it runs through.
  const trunkOf = (p: Plan): string | undefined => {
    if (p.kind !== 'route') return undefined;
    if (p.edge.kind === 'send' && byId.get(p.edge.to)!.stage === 'sends') return 'sends';
    if (p.edge.kind === 'sidechain') return `sidechain:${p.edge.from}`;
    // the returns into one box (M4): the delay, the reverb and the hall into the duck
    if (p.edge.kind === 'return') return `returns:${p.edge.to}`;
    return undefined;
  };
  for (const p of plans) p.trunk = trunkOf(p);
  for (const id of new Set(plans.map((p) => p.trunk).filter(Boolean))) {
    const riding = plans.filter((p) => p.trunk === id);
    if (riding.length < 2 || riding.some((p) => p.chans.join() !== riding[0].chans.join())) for (const p of riding) p.trunk = undefined;
  }
  const count = (id: string) => {
    const on = plans.filter((p) => p.chans.includes(id));
    return on.filter((p) => !p.trunk).length + new Set(on.filter((p) => p.trunk).map((p) => p.trunk)).size;
  };

  // --- the columns, across ----------------------------------------------------------
  const mLanes = count('m');
  const mW = strips.length ? laneRoom(mLanes) : 0;
  const stripsW = strips.length * STRIP_W + Math.max(0, strips.length - 1) * (STRIP_GAP * S);
  const upperW = strips.length || inserts.length ? (INSET * S) + CHIP_W + mW + (sends.length ? SEND_W : 0) + (INSET * S) : 0;
  const widthOf = (h: Host): number => {
    if (h === 'sources') return SOURCE_W + (FRAME_PAD * S) * 2;
    if (h === 'buses') return Math.max(upperW, stripsW, sends.length ? SEND_W : 0);
    if (h === 'master') return Math.max(rackRows.length ? RACK_W : 0, BOX_W);
    return BOX_W;
  };
  const colW = hosts.map(widthOf);
  // a gutter after every column but the last, and after the last only where a
  // wire loops round it
  const gutterW = hosts.map((_, i) => {
    const n = count(`g${i}`);
    if (i === hosts.length - 1) return n ? laneRoom(n) : 0;
    return Math.max((GUTTER_MIN * S), laneRoom(n));
  });
  const packed = PAD * 2 + colW.reduce((a, b) => a + b, 0) + gutterW.reduce((a, b) => a + b, 0);

  // **Spacing grows before boxes do**: the gutters take up to `GUTTER_GROW`
  // each of what the pane offers beyond the packed width, and past that the
  // whole drawing is scaled together, the one thing that changes a box's size.
  const inner = gutterW.filter((_, i) => i < hosts.length - 1).length || 1;
  // **Given a density, the drawing fills its width by its gutters** (M6,
  // Eugene: *"on bigger screens give it more space to fill the canvas
  // proportionally"* — never a plain zoom): shown at `type`, it has the pane's
  // width over `type` in its own units, and every inch of that the columns do
  // not take goes to the gutters between them. Without one, as before: the
  // gutters take up to `GUTTER_GROW` and the rest is a zoom.
  const typed = fit.type && fit.type > 0 ? fit.type : 0;
  const room = typed && fit.width > 0 ? fit.width / typed : fit.width;
  const spare = room > 0 ? Math.max(0, room - packed) : 0;
  const grow = typed ? spare / inner : Math.min(GUTTER_GROW, spare / inner);
  const grown = gutterW.map((w, i) => (i < hosts.length - 1 ? w + grow : w));
  const natural = packed + grow * inner;
  const scale = typed || (fit.width > natural ? fit.width / natural : 1);
  const width = Math.max(natural, fit.width > 0 ? fit.width / scale : 0);

  const columns: Column[] = [];
  {
    let x = PAD;
    hosts.forEach((h, i) => {
      const stage: Stage = h === 'output' ? 'output' : h === 'master' ? 'master' : h === 'stage' ? 'stage' : h === 'buses' ? 'buses' : 'sources';
      columns.push({ stage, x, w: colW[i], room: 0 });
      x += colW[i] + grown[i];
    });
    columns.forEach((c, i) => { c.room = (i + 1 < columns.length ? columns[i + 1].x : width - PAD) - c.x - 10; });
  }

  const top = PAD + HEAD_H;
  const places = new Map<string, Place>();
  const order: Place[] = [];
  const frames: Frame[] = [];
  const areas: Frame[] = [];
  const put = (node: MachineNode, box: { x: number; y: number; w: number; h: number }, row = -1) => {
    const p: Place = { node, ...box, column: colOf(node), row };
    places.set(node.id, p);
    order.push(p);
    return p;
  };

  // --- the sources ------------------------------------------------------------------
  //
  // **Compact** (M4, Eugene: *"source blocks have gaps in the middle"*): every
  // family as tight as it is, one under the next, whatever the pane's height;
  // the wires fan out of a compact column rather than the column being spread
  // to their spacing.
  let bottomOf = top;
  const fitH = fit.height > 0 ? fit.height / scale : 0;
  let sourcesBottom = top;
  if (hosts.includes('sources')) {
    const cx = columns[hosts.indexOf('sources')].x;
    let y = top;
    for (const cell of cells) {
      const hs = cell.nodes.map((n) => (oneLine(n.label, n.made) ? SOURCE_H : SOURCE_H2));
      const h = FRAME_LABEL + (FRAME_PAD * S) * 2 + hs.reduce((a, b) => a + b, 0) + (cell.nodes.length - 1) * (SOURCE_GAP * S);
      frames.push({ id: cell.id, label: cell.label, x: cx, y, w: SOURCE_W + (FRAME_PAD * S) * 2, h });
      let by = y + FRAME_LABEL + (FRAME_PAD * S);
      cell.nodes.forEach((n, i) => { put(n, { x: cx + (FRAME_PAD * S), y: by, w: SOURCE_W, h: hs[i] }); by += hs[i] + (SOURCE_GAP * S); });
      y += h + (FAMILY_GAP * S);
    }
    sourcesBottom = y - (FAMILY_GAP * S);
    bottomOf = Math.max(bottomOf, sourcesBottom);
  }

  // --- the bus column: the effects over the meters ----------------------------------
  //
  // Eugene (09-25): *"too tall with its label: split it into two vertically
  // stacked areas — effects on top (line inserts on the left, sends and returns
  // on the right), bus meters below."* Between the two, the send lanes and then
  // the rail every wire into a strip drops off; under the strips, the channel
  // every wire out of one runs along.
  let rail: Channel | null = null;
  let under: Channel | null = null;
  let mChan: Channel | null = null;
  let sr: Channel | null = null;
  const railN = count('rail');
  const underN = count('under');
  if (busCol >= 0) {
    const xb = columns[busCol].x;
    const xm = xb + (INSET * S) + CHIP_W;
    const xs = xm + mW;
    const stackH = (n: number, h: number) => (n ? n * h + (n - 1) * (INSET * S) : 0);
    const upperIn = stackH(EFFECTS_ROWS, SEND_H);
    // past six, a side's chips grow shorter to stay inside the area
    const fitted = (n: number, h: number) => (n > EFFECTS_ROWS ? Math.max(24, (upperIn - (n - 1) * (INSET * S)) / n) : h);
    const chipH = fitted(inserts.length, CHIP_H);
    const sendH = fitted(sends.length, SEND_H);
    const hasUpper = inserts.length || sends.length || strips.length;
    const upperH = hasUpper ? FRAME_LABEL + (FRAME_PAD * S) + upperIn + (FRAME_PAD * S) : 0;
    if (hasUpper) {
      areas.push({ id: 'effects', label: 'effects', x: xb, y: top, w: columns[busCol].w, h: upperH });
      areas.push({ id: 'inserts', label: 'lane inserts', x: xb + (INSET * S), y: top, w: CHIP_W, h: upperH });
      if (sends.length) areas.push({ id: 'sends', label: 'sends & returns', x: xs, y: top, w: SEND_W, h: upperH });
    }
    let y = top + FRAME_LABEL + (FRAME_PAD * S);
    // each insert level with the lane it is on, as near as the stack allows
    const insOrder = [...inserts].sort((p, q) => {
      const at = (n: MachineNode) => { const f = feeders.get(n.id)!.map((id) => places.get(id)).find(Boolean); return f ? f.y : 0; };
      return at(p) - at(q);
    });
    insOrder.forEach((n, i) => put(n, { x: xb + (INSET * S), y: y + i * (chipH + (INSET * S)), w: CHIP_W, h: chipH }));
    sends.forEach((n, i) => put(n, { x: xs, y: y + i * (sendH + (INSET * S)), w: SEND_W, h: sendH }));
    y = top + upperH;
    const srN = count('sr');
    if (srN) sr = { id: 'sr', orient: 'h', lo: y, hi: y + laneRoom(srN), lanes: [] };
    const railTop = srN ? y + laneRoom(srN) : y + 10;
    const railBottom = railTop + laneRoom(Math.max(railN, RAIL_LANES));
    rail = { id: 'rail', orient: 'h', lo: railTop, hi: railBottom, lanes: [] };
    if (mLanes) mChan = { id: 'm', orient: 'v', lo: xm, hi: xs, lanes: [] };
    // the meters end where the sources end (M4: *"align the bus lines to the
    // end of the source blocks"*), and are never shorter than a meter wants
    const underRoom = underN ? laneRoom(underN) : 0;
    const stripH = strips.length ? clamp(sourcesBottom - railBottom, STRIP_H, STRIP_H_MAX) : 0;
    // the desk spans its column: the strips spread across the room the effects over them take
    const pitch = strips.length > 1 ? Math.max(STRIP_W + (STRIP_GAP * S), (columns[busCol].w - STRIP_W) / (strips.length - 1)) : 0;
    strips.forEach((n, i) => put(n, { x: xb + i * pitch, y: railBottom, w: STRIP_W, h: stripH }));
    const stripsBottom = railBottom + stripH;
    under = { id: 'under', orient: 'h', lo: stripsBottom, hi: stripsBottom + underRoom, lanes: [] };
    bottomOf = Math.max(bottomOf, stripsBottom + underRoom, top + upperH);
  }

  // --- the stage: a stack, in the order that makes its wires straight drops -----------
  // the line the stage and the master reach down to: where the sources and the
  // meters end (M4), and never above what those columns want packed
  const floor = Math.max(sourcesBottom, bottomOf);
  if (hosts.includes('stage')) {
    const cx = columns[hosts.indexOf('stage')].x;
    const n = stackOrder.length;
    const packedH = n * BOX_H + Math.max(0, n - 1) * (STACK_GAP * S);
    // the gaps open with the room, as the sources' do, and the boxes do not grow
    const gap = (STACK_GAP * S) + (floor && n > 1 ? Math.min(60, Math.max(0, floor - top - packedH) / (n - 1)) : 0);
    let y = top;
    for (const nd of stackOrder) { put(nd, { x: cx, y, w: BOX_W, h: BOX_H }); y += BOX_H + gap; }
    bottomOf = Math.max(bottomOf, y - gap);
  }

  // --- the master: the chain, a line down to the output, and its result at the foot ---
  //
  // Eugene (M2): *"the master chain, then a vertical line down, then the curve
  // picture at the bottom (under OUTPUT), so the chain reads top to bottom and
  // the picture is its result."* The output is as wide as the rack, so the
  // wire from the chain's last row into it is one straight drop.
  let bells: Layout['bells'] = null;
  if (hosts.includes('master')) {
    const cx = columns[hosts.indexOf('master')].x;
    let y = top;
    const outs = of('output');
    const outsH = outs.length * (BOX_H + (OUT_DROP * S));
    // a rack's rows breathe with the room, as they always have: a row's height
    // is part of how it reads, up to a limit
    const rowH = floor && rackRows.length
      ? Math.floor(clamp((floor - top - outsH - BELLS_TITLE - BELLS_H - 40) / rackRows.length, ROW_H, ROW_H_MAX)) : ROW_H;
    rackRows.forEach((n, i) => put(n, { x: cx, y: y + i * rowH, w: RACK_W, h: rowH }, i));
    if (rackRows.length) y += rackRows.length * rowH;
    const w = rackRows.length ? RACK_W : BOX_W;
    for (const n of outs) { y += (OUT_DROP * S); put(n, { x: cx, y, w, h: BOX_H }); y += BOX_H; }
    if (rackRows.length) {
      // the result at the very foot, on a pane that says where that is
      const at = floor ? Math.max(y + (STACK_GAP * S) + BELLS_TITLE, floor - BELLS_H) : y + (STACK_GAP * S) + BELLS_TITLE;
      bells = { x: cx, y: at, w: RACK_W, h: BELLS_H };
      y = at + BELLS_H;
    }
    bottomOf = Math.max(bottomOf, y);
  }
  if (hosts.includes('output')) {
    const cx = columns[hosts.indexOf('output')].x;
    let y = top;
    for (const n of of('output')) { put(n, { x: cx, y, w: BOX_W, h: BOX_H }); y += BOX_H + (STACK_GAP * S); }
    bottomOf = Math.max(bottomOf, y - (STACK_GAP * S));
  }
  // anything no column above placed (a kind of box a later description adds)
  for (const n of part.nodes) {
    if (places.has(n.id)) continue;
    const c = columns[colOf(n)];
    put(n, { x: c.x, y: bottomOf + (STACK_GAP * S), w: BOX_W, h: BOX_H });
    bottomOf += (STACK_GAP * S) + BOX_H;
  }

  // --- the channels down the gutters and under the drawing ---------------------------
  const bottomN = count('bottom');
  const bottomChan: Channel = { id: 'bottom', orient: 'h', lo: bottomOf + 8, hi: bottomOf + 8 + laneRoom(bottomN), lanes: [] };
  const contentBottom = bottomN ? bottomChan.hi : bottomOf;
  const height = Math.max(contentBottom + PAD + LEGEND_H, fitH);
  const bottom = height - PAD - LEGEND_H;
  const chans = new Map<string, Channel>();
  hosts.forEach((_, i) => {
    const lo = columns[i].x + columns[i].w;
    const hi = i + 1 < columns.length ? columns[i + 1].x : lo + grown[i];
    chans.set(`g${i}`, { id: `g${i}`, orient: 'v', lo, hi, lanes: [] });
  });
  chans.set('bottom', bottomChan);
  if (rail) chans.set('rail', rail);
  if (under) chans.set('under', under);
  if (mChan) chans.set('m', mChan);
  if (sr) chans.set('sr', sr);

  // --- the routes -------------------------------------------------------------------
  const routes: Route[] = plans.map((p) => ({
    edge: p.edge, a: places.get(p.edge.from)!, b: places.get(p.edge.to)!,
    exit: p.exit, entry: p.entry, kind: p.kind, pts: [], trunk: p.trunk,
    chans: p.chans.map((id) => chans.get(id)!).filter(Boolean),
  }));
  const heads = new Map<string, Route>();
  for (const w of routes) if (w.trunk) { if (!heads.has(w.trunk)) heads.set(w.trunk, w); w.group = heads.get(w.trunk); }
  // **Converging arrivals join** (M8): where three or more wires would stand
  // side by side on one face of one box, those drawn alike and on no trunk
  // arrive as one, each on its own lane to the join and its own curve into it.
  // Departures, and the sends' branches, keep ports of their own.
  const main = mainPath(part);
  const lookOf = (w: Route) => (w.edge.kind === 'signal' && main.has(`${w.edge.from}>${w.edge.to}`) ? 'main' : w.edge.kind);
  const faces = new Map<string, Route[]>();
  for (const w of routes) {
    if (w.kind === 'implied') continue;
    const k = portKey(w.b, w.entry);
    if (!faces.has(k)) faces.set(k, []);
    faces.get(k)!.push(w);
  }
  for (const [k, list] of faces) {
    if (list.length < 3) continue;
    const alike = new Map<string, Route[]>();
    for (const w of list) {
      if (w.trunk || w.kind !== 'route') continue;
      if (!alike.has(lookOf(w))) alike.set(lookOf(w), []);
      alike.get(lookOf(w))!.push(w);
    }
    for (const [look, mates] of alike) {
      if (mates.length < 2) continue;
      for (const w of mates) { w.join = mates[0]; w.joinId = `${k}|${look}`; }
    }
  }
  const ports: Ports = new Map();
  for (const w of routes) {
    if (w.kind === 'implied') continue;
    for (const [p, side, at] of [[w.a, w.exit, w], [w.b, w.entry, w.join ?? w]] as Array<[Place, Side, Route]>) {
      const k = portKey(p, side);
      if (!ports.has(k)) ports.set(k, []);
      if (!ports.get(k)!.includes(at)) ports.get(k)!.push(at);
    }
  }
  // a trunk takes one lane in each channel, held by the first wire riding it
  for (const w of routes) if (!w.group || w.group === w) for (const c of w.chans) c.lanes.push(w);

  // First orders, by where the other end is: a port by the far end's height (or
  // place along), a lane by where the wire is going next. `untangle` does the rest.
  const far = (w: Route, p: Place) => (w.a === p ? w.b : w.a);
  const centre = (p: Place) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });
  for (const [k, list] of ports) {
    const side = k.split('|')[1] as Side;
    const p = list[0].a.node.id === k.split('|')[0] ? list[0].a : list[0].b;
    list.sort((u, v) => (side === 'left' || side === 'right'
      ? centre(far(u, p)).y - centre(far(v, p)).y
      : centre(far(u, p)).x - centre(far(v, p)).x));
  }
  for (const c of chans.values()) {
    c.lanes.sort((u, v) => (c.orient === 'v' ? centre(u.b).y - centre(v.b).y : centre(v.b).x - centre(u.b).x));
  }

  // a trunk's head moving moves every wire riding it
  const riders = (w: Route) => (w.group === w ? routes.filter((x) => x.group === w) : w.join === w ? routes.filter((x) => x.join === w) : [w]);
  const trace = (w: Route) => { for (const x of riders(w)) { x.pts = pointsOf(x, ports); x.bb = undefined; } };
  for (const w of routes) trace(w);
  untangle(routes, [...chans.values()].map((c) => c.lanes), [...ports.values()], trace, riders);
  unshare(routes, trace);
  radiiOf(routes);

  // Each trunk, as the union of what its wires run along it: every wire's path
  // but its first and last pieces, one run per lane.
  const trunks: Trunk[] = [];
  for (const [id, head] of heads) {
    const riding = routes.filter((w) => w.trunk === id);
    const runs = new Map<string, [number, number, number, boolean]>();
    for (const w of riding) {
      for (let i = 2; i < w.pts.length - 1; i++) {
        const a = w.pts[i - 1]; const b = w.pts[i];
        const v = Math.abs(a.x - b.x) < 0.01;
        const key = v ? `v${a.x.toFixed(2)}` : `h${a.y.toFixed(2)}`;
        const lo = v ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
        const hi = v ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
        const had = runs.get(key);
        runs.set(key, had ? [Math.min(had[0], lo), Math.max(had[1], hi), had[2], v] : [lo, hi, v ? a.x : a.y, v]);
      }
    }
    const segs = [...runs.values()].filter(([lo, hi]) => hi - lo > 0.5).map(([lo, hi, at, v]): [{ x: number; y: number }, { x: number; y: number }] => (v
      ? [{ x: at, y: lo }, { x: at, y: hi }] : [{ x: lo, y: at }, { x: hi, y: at }]));
    trunks.push({ id, kind: head.edge.kind, count: riding.length, segs, d: trunkPath(segs) });
  }

  // Each joined arrival: the stem from where the furthest of its wires turns
  // onto it to the port, begun a radius on so it starts where that wire's
  // curve ends; each wire draws its own run and its curve onto the stem, and
  // stops where the curve does, so no piece of the stem is drawn twice and
  // reads brighter than the rest.
  const along = (a: { x: number; y: number }, b: { x: number; y: number }, len: number) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const k = Math.min(len, l);
    return { x: a.x + ((b.x - a.x) / l) * k, y: a.y + ((b.y - a.y) / l) * k };
  };
  const joins: Join[] = [];
  for (const head of routes) {
    if (head.join !== head) continue;
    const mates = routes.filter((w) => w.join === head);
    const at = head.pts[head.pts.length - 1];
    const far = mates.map((w) => w.pts[w.pts.length - 2])
      .reduce((m, p) => (Math.hypot(p.x - at.x, p.y - at.y) > Math.hypot(m.x - at.x, m.y - at.y) ? p : m));
    const len = Math.hypot(far.x - at.x, far.y - at.y);
    const top = along(far, at, Math.min((RADIUS * S), len / 2));
    joins.push({ id: head.joinId!, look: lookOf(head), count: mates.length, at, d: `M ${r(top.x)} ${r(top.y)} L ${r(at.x)} ${r(at.y)}` });
  }

  const wires: Wire[] = routes.map((w) => {
    if (w.kind === 'implied') {
      return { edge: w.edge, d: '', pts: [], implied: true,
        from: { x: w.a.x + w.a.w / 2, y: w.a.y + w.a.h }, at: { x: w.b.x + w.b.w / 2, y: w.b.y } };
    }
    const n = w.pts.length;
    if (w.join) {
      const own = [...w.pts.slice(0, n - 1), along(w.pts[n - 2], w.pts[n - 1], 2 * (RADIUS * S))];
      return { edge: w.edge, d: pathOf(w.pts, w.radii), pts: w.pts, implied: false, from: w.pts[0], at: w.pts[n - 1],
        join: w.joinId, own, ownD: pathOf(own, w.radii, true) };
    }
    if (!(w.trunk && n >= 4)) return { edge: w.edge, d: pathOf(w.pts, w.radii), pts: w.pts, implied: false, from: w.pts[0], at: w.pts[n - 1] };
    // **A branch curves onto its trunk and off it** (M5): it runs on along the
    // trunk for two radii, the way the signal goes, so its corner is the same
    // curve the wire's own path takes there and the eye reads which way it goes.
    const out = [w.pts[0], w.pts[1], along(w.pts[1], w.pts[2], 2 * (RADIUS * S))];
    const into = [along(w.pts[n - 2], w.pts[n - 3], 2 * (RADIUS * S)), w.pts[n - 2], w.pts[n - 1]];
    return { edge: w.edge, d: pathOf(w.pts, w.radii), pts: w.pts, implied: false, from: w.pts[0], at: w.pts[n - 1],
      trunk: w.trunk, branches: [out, into], branchD: [pathOf(out), pathOf(into)] };
  });

  return {
    places, order, frames, areas, columns, edges, wires,
    width, height, scale, top, bottom, bells, trunks, joins,
  };
}

/**
 * The order down a stacked column: a box straight over the one it feeds
 * wherever it can be, so the wire between them is one drop. Kahn's order, and
 * of the boxes ready to be placed, the one the last box feeds first; failing
 * that, the one fed from furthest along the desk.
 */
function stackIn(nodes: MachineNode[], edges: MachineEdge[], rank: (id: string) => number): MachineNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const inside = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.kind === 'signal');
  const need = new Map(nodes.map((n): [string, number] => [n.id, 0]));
  for (const e of inside) need.set(e.to, need.get(e.to)! + 1);
  const out: MachineNode[] = [];
  const done = new Set<string>();
  while (out.length < nodes.length) {
    const ready = nodes.filter((n) => !done.has(n.id) && need.get(n.id) === 0);
    const pool = ready.length ? ready : nodes.filter((n) => !done.has(n.id));
    const last = out[out.length - 1];
    const next = (last && pool.find((n) => inside.some((e) => e.from === last.id && e.to === n.id)))
      || [...pool].sort((p, q) => rank(p.id) - rank(q.id) || nodes.indexOf(p) - nodes.indexOf(q))[0];
    out.push(next);
    done.add(next.id);
    for (const e of inside) if (e.from === next.id) need.set(e.to, need.get(e.to)! - 1);
  }
  return out;
}

/** A wire's corners: out square to its side, a lane per channel, square in. */
function pointsOf(w: Route, ports: Ports): Array<{ x: number; y: number }> {
  const p0 = { ...portOf(ports, w.a, w.exit, w) };
  if (w.nudge) { if (w.exit === 'left' || w.exit === 'right') p0.y += w.nudge; else p0.x += w.nudge; }
  const pe = { ...portOf(ports, w.b, w.entry, w.join ?? w) };
  if (w.nudgeIn && !w.join) { if (w.entry === 'left' || w.entry === 'right') pe.y += w.nudgeIn; else pe.x += w.nudgeIn; }
  const pts = [p0];
  let cur = p0;
  for (const c of w.chans) {
    cur = c.orient === 'v' ? { x: laneAt(c, w), y: cur.y } : { x: cur.x, y: laneAt(c, w) };
    pts.push(cur);
  }
  if (w.chans.length) {
    const last = w.chans[w.chans.length - 1];
    pts.push(last.orient === 'v' ? { x: cur.x, y: pe.y } : { x: pe.x, y: cur.y });
  } else if (Math.abs(pe.x - p0.x) > 0.5 && (w.exit === 'bottom' || w.exit === 'top')) {
    // a drop whose two ends are not over each other: a dog-leg at half height
    const mid = (p0.y + pe.y) / 2;
    pts.push({ x: p0.x, y: mid }, { x: pe.x, y: mid });
  }
  pts.push(pe);
  // **a jog of less than two units into the port is no jog** (M8): where the
  // lane a wire comes down and its port stand a hair apart, the two corners
  // between them were two arcs of half a unit — a kink, and off the tangent
  // once written to a hundredth — so the port moves onto the lane instead.
  // Never for a wire of a joined arrival, whose port is the join's.
  if (!w.join && pts.length >= 3) {
    const n = pts.length; const a = pts[n - 3]; const b = pts[n - 2];
    const jog = Math.hypot(b.x - a.x, b.y - a.y);
    if (jog > 0.01 && jog < 2) {
      const e = { x: pe.x + (a.x - b.x), y: pe.y + (a.y - b.y) };
      pts.splice(n - 2, 2, e);
    }
  }
  // two corners at one point, or three in a line, are one
  const out: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) continue;
    const o = out[out.length - 2];
    if (o && q && ((Math.abs(o.x - q.x) < 0.01 && Math.abs(q.x - p.x) < 0.01) || (Math.abs(o.y - q.y) < 0.01 && Math.abs(q.y - p.y) < 0.01))) out.pop();
    out.push(p);
  }
  return out;
}

/**
 * A trunk as drawn: its straight runs, and where one run's end meets another
 * run — at its end, or part way along it — a curve from each side of the
 * meeting into the run that goes on, so a trunk turning a corner is one curve
 * and a trunk fed from both sides is two meeting in it.
 */
function trunkPath(segs: Array<[{ x: number; y: number }, { x: number; y: number }]>): string {
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
  const on = (p: { x: number; y: number }, [a, b]: [{ x: number; y: number }, { x: number; y: number }]) =>
    Math.abs(a.x - b.x) < 0.01 ? Math.abs(p.x - a.x) < 0.01 && p.y >= Math.min(a.y, b.y) - 0.01 && p.y <= Math.max(a.y, b.y) + 0.01
      : Math.abs(p.y - a.y) < 0.01 && p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01;
  // every place a run's end lands on another run, and by how much each is cut back there
  const cut = segs.map(() => [0, 0]);
  const arcs: string[] = [];
  segs.forEach((s, i) => {
    for (const end of [0, 1] as const) {
      const j = segs.findIndex((t, k) => k !== i && on(s[end], t));
      if (j < 0) continue;
      const p = s[end];
      const t = segs[j];
      const lenS = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
      // the run it lands on goes on to one side of the meeting, or to both
      const sides = [t[0], t[1]].filter((q) => !same(q, p));
      const k = Math.min((RADIUS * S), lenS / 2, ...sides.map((q) => Math.hypot(q.x - p.x, q.y - p.y) / 2));
      if (k <= 0.1) continue;
      cut[i][end] = k;
      const into = s[1 - end];
      const toward = { x: p.x + ((into.x - p.x) / (lenS || 1)) * k, y: p.y + ((into.y - p.y) / (lenS || 1)) * k };
      for (const q of sides) {
        const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const from = { x: p.x + ((q.x - p.x) / l) * k, y: p.y + ((q.y - p.y) / l) * k };
        const d1 = { x: (p.x - from.x) / k, y: (p.y - from.y) / k };
        const d2 = { x: (toward.x - p.x) / k, y: (toward.y - p.y) / k };
        const sweep = d1.x * d2.y - d1.y * d2.x > 0 ? 1 : 0;
        arcs.push(`M ${r(from.x)} ${r(from.y)} A ${r(k)} ${r(k)} 0 0 ${sweep} ${r(toward.x)} ${r(toward.y)}`);
        // where the meeting is the other run's own end, that end is cut back too
        const tj = same(t[0], p) ? 0 : same(t[1], p) ? 1 : -1;
        if (tj >= 0) cut[j][tj] = Math.max(cut[j][tj], k);
      }
    }
  });
  // **a free end stops where the branch there curves off it** (M6: it ran on to
  // the branch's corner and stood out past its curve); the branch runs on along
  // the trunk for two radii, so the line is whole
  segs.forEach((s, i) => {
    const len = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
    for (const end of [0, 1] as const) {
      const meets = segs.some((t, k) => k !== i && (on(s[end], t) || on(t[0], s) && same(t[0], s[end]) || on(t[1], s) && same(t[1], s[end])));
      if (!meets && !cut[i][end]) cut[i][end] = Math.min((RADIUS * S), len / 2);
    }
  });
  const runs = segs.map(([a, b], i) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / l; const uy = (b.y - a.y) / l;
    const a2 = { x: a.x + ux * cut[i][0], y: a.y + uy * cut[i][0] };
    const b2 = { x: b.x - ux * cut[i][1], y: b.y - uy * cut[i][1] };
    return `M ${r(a2.x)} ${r(a2.y)} L ${r(b2.x)} ${r(b2.y)}`;
  });
  return [...runs, ...arcs].join(' ');
}

/**
 * **The path: straight runs, and every corner a true arc** (M6, Eugene: *"some
 * line corners don't look accurate — lines getting out of the curve"*): a
 * quarter circle that leaves one leg and joins the next exactly where each
 * stops, tangent to both — it was a quadratic, which is tangent at its ends but
 * is not a circle, and read as a kink beside a neighbour's. The radius is the
 * corner's own (`radiiOf`: concentric where corners nest), or `RADIUS`, and
 * never more than half either leg.
 */
function pathOf(pts: Array<{ x: number; y: number }>, radii: number[] = [], stop = false): string {
  const out = [`M ${r(pts[0].x)} ${r(pts[0].y)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]; const p = pts[i]; const b = pts[i + 1];
    const la = Math.hypot(p.x - a.x, p.y - a.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const k = Math.min(radii[i] ?? (RADIUS * S), la / 2, lb / 2);
    const d1 = { x: (p.x - a.x) / (la || 1), y: (p.y - a.y) / (la || 1) };
    const d2 = { x: (b.x - p.x) / (lb || 1), y: (b.y - p.y) / (lb || 1) };
    const inX = p.x - d1.x * k; const inY = p.y - d1.y * k;
    const outX = p.x + d2.x * k; const outY = p.y + d2.y * k;
    const sweep = d1.x * d2.y - d1.y * d2.x > 0 ? 1 : 0;
    out.push(`L ${r(inX)} ${r(inY)}`, `A ${r(k)} ${r(k)} 0 0 ${sweep} ${r(outX)} ${r(outY)}`);
  }
  // `stop`: the path ends where its last curve does (a wire onto a join's stem, M8)
  if (stop && pts.length > 2) return out.join(' ');
  const e = pts[pts.length - 1];
  out.push(`L ${r(e.x)} ${r(e.y)}`);
  return out.join(' ');
}

/**
 * **Every corner at one radius** (M8): `RADIUS`, or half the shorter of its
 * two legs where a jog is shorter than two radii. M6 nested neighbouring
 * corners on one centre and widened the outer ones by a lane each, and Eugene
 * read the wide ones as too wide.
 */
function radiiOf(routes: Route[]): void {
  for (const w of routes) {
    if (w.kind === 'implied') continue;
    w.radii = [];
    for (let i = 1; i < w.pts.length - 1; i++) {
      const a = w.pts[i - 1]; const v = w.pts[i]; const b = w.pts[i + 1];
      w.radii[i] = Math.min((RADIUS * S), Math.hypot(v.x - a.x, v.y - a.y) / 2, Math.hypot(b.x - v.x, b.y - v.y) / 2);
    }
  }
}

// --- counting crossings ------------------------------------------------------------

type Pt = { x: number; y: number };
const crossOne = (a0: Pt, a1: Pt, b0: Pt, b1: Pt): number => {
  const av = Math.abs(a0.x - a1.x) < 0.01;
  const bv = Math.abs(b0.x - b1.x) < 0.01;
  if (av === bv) {
    // parallel: one line only if on one line and overlapping, which is the fault
    if (av && Math.abs(a0.x - b0.x) < (PITCH * S) / 2 && Math.min(Math.max(a0.y, a1.y), Math.max(b0.y, b1.y)) - Math.max(Math.min(a0.y, a1.y), Math.min(b0.y, b1.y)) > 0.5) return 50;
    if (!av && Math.abs(a0.y - b0.y) < (PITCH * S) / 2 && Math.min(Math.max(a0.x, a1.x), Math.max(b0.x, b1.x)) - Math.max(Math.min(a0.x, a1.x), Math.min(b0.x, b1.x)) > 0.5) return 50;
    return 0;
  }
  const [v0, v1, h0, h1] = av ? [a0, a1, b0, b1] : [b0, b1, a0, a1];
  const x = v0.x; const y = h0.y;
  const inV = y > Math.min(v0.y, v1.y) + 0.01 && y < Math.max(v0.y, v1.y) - 0.01;
  const inH = x > Math.min(h0.x, h1.x) + 0.01 && x < Math.max(h0.x, h1.x) - 0.01;
  return inV && inH ? 1 : 0;
};
const boxOf = (w: Route): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of w.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return [x0 - (PITCH * S), y0 - (PITCH * S), x1 + (PITCH * S), y1 + (PITCH * S)];
};
function crossPair(u: Route, v: Route): number {
  if (u === v || u.kind === 'implied' || v.kind === 'implied') return 0;
  // two wires on one trunk are one line where they ride it, and their own
  // ends meet it and never each other
  if (u.trunk && u.trunk === v.trunk) return 0;
  // two wires joining one arrival run in one line into it, by design (M8)
  if (u.join && u.join === v.join) return 0;
  const a = u.bb || (u.bb = boxOf(u)); const b = v.bb || (v.bb = boxOf(v));
  if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) return 0;
  let n = 0;
  for (let i = 1; i < u.pts.length; i++) for (let j = 1; j < v.pts.length; j++) n += crossOne(u.pts[i - 1], u.pts[i], v.pts[j - 1], v.pts[j]);
  return n;
}

/**
 * **Two corners as drawn come within a stroke of each other** (M5): with the
 * radius at 7, two wires turning near the same point — one out of a row into a
 * gutter, one out of the gutter into a chip — can touch on their curves though
 * their straight runs are a lane apart. Each corner is the quadratic the view
 * draws, sampled.
 */
const CORNER_CLEAR = 2;
function cornerCurves(pts: Pt[]): Array<{ c: Pt; s: Pt[] }> {
  const out: Array<{ c: Pt; s: Pt[] }> = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]; const c = pts[i]; const b = pts[i + 1];
    const la = Math.hypot(c.x - a.x, c.y - a.y); const lb = Math.hypot(b.x - c.x, b.y - c.y);
    const k = Math.min((RADIUS * S), la / 2, lb / 2);
    const d1 = { x: (c.x - a.x) / (la || 1), y: (c.y - a.y) / (la || 1) };
    const d2 = { x: (b.x - c.x) / (lb || 1), y: (b.y - c.y) / (lb || 1) };
    // the arc's centre is a radius in from the vertex along both legs
    const o = { x: c.x - d1.x * k + d2.x * k, y: c.y - d1.y * k + d2.y * k };
    const s: Pt[] = [];
    for (let t = 0; t <= 1.0001; t += 0.125) {
      const th = (t * Math.PI) / 2;
      // from (−d2) round to (+d1) about the centre
      s.push({ x: o.x + k * (-d2.x * Math.cos(th) + d1.x * Math.sin(th)), y: o.y + k * (-d2.y * Math.cos(th) + d1.y * Math.sin(th)) });
    }
    out.push({ c, s });
  }
  return out;
}
function cornersMeet(a: Pt[], b: Pt[]): boolean {
  for (const x of cornerCurves(a)) for (const y of cornerCurves(b)) {
    if (Math.abs(x.c.x - y.c.x) > 2 * (RADIUS * S) + 4 || Math.abs(x.c.y - y.c.y) > 2 * (RADIUS * S) + 4) continue;
    for (const p of x.s) for (const q of y.s) if (Math.hypot(p.x - q.x, p.y - q.y) < CORNER_CLEAR) return true;
  }
  return false;
}

/**
 * Swap each pair of neighbouring lanes, and of neighbouring ports, wherever
 * the swap crosses fewer wires — a few passes over, until a pass moves nothing.
 */
function untangle(routes: Route[], lists: Route[][], portLists: Route[][], trace: (w: Route) => void, riders: (w: Route) => Route[]): void {
  const live = routes.filter((w) => w.kind !== 'implied');
  // everything a swap of these two moves, crossed against everything else
  const costOf = (u: Route, v: Route) => {
    const set = [...new Set([...riders(u), ...riders(v)])];
    let n = 0;
    for (const w of set) n += live.reduce((m, x) => m + crossPair(w, x), 0);
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) n -= crossPair(set[i], set[j]);
    return n;
  };
  const all = [...lists, ...portLists];
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const list of all) {
      for (let i = 0; i + 1 < list.length; i++) {
        const u = list[i]; const v = list[i + 1];
        const before = costOf(u, v);
        list[i] = v; list[i + 1] = u;
        trace(u); trace(v);
        const after = costOf(u, v);
        if (after < before) { moved = true; continue; }
        list[i] = u; list[i + 1] = v;
        trace(u); trace(v);
      }
    }
    if (!moved) break;
  }
}

/**
 * **A wire whose way out of its box runs in another's lane moves off it.** A
 * source row's exit is at whatever height the row is, and the rail over the
 * meters begins in the gutter it crosses; where the two meet at one height,
 * the exit (or failing that the entry) steps along its side, a unit at a time and
 * nearest first, to the first place clear of every other wire.
 */
function unshare(routes: Route[], trace: (w: Route) => void): void {
  const live = routes.filter((w) => w.kind === 'route' || w.kind === 'stack');
  const clashes = (u: Route) => routes.some((v) => v !== u && v.kind !== 'implied' && !(u.trunk && u.trunk === v.trunk) && !(u.join && u.join === v.join)
    && (u.pts.some((q, i) => i > 0 && v.pts.some((p, j) => j > 0 && crossOne(u.pts[i - 1], q, v.pts[j - 1], p) >= 50))
      || cornersMeet(u.pts, v.pts)));
  // a step at a time, nearest first, up to three lanes either way
  const TRY = Array.from({ length: 36 }, (_, i) => (i % 2 ? -1 : 1) * (1 + Math.floor(i / 2)));
  // a step taken for one wire can put it in another's way, so the walk is
  // repeated until a pass finds every wire clear, three passes at most
  for (let pass = 0; pass < 3; pass++) {
  let stepped = false;
  for (const u of live) {
    if (!clashes(u)) continue;
    stepped = true;
    let done = false;
    // its way out first, then its way in: each is a port that may step along its side
    // a wire joining an arrival steps only its way out: its way in is the join's
    for (const end of (u.join ? ['nudge'] : ['nudge', 'nudgeIn']) as Array<'nudge' | 'nudgeIn'>) {
      for (const d of TRY) {
        u[end] = d;
        trace(u);
        if (!clashes(u)) { done = true; break; }
      }
      if (done) break;
      u[end] = 0;
      trace(u);
    }
  }
  if (!stepped) break;
  }
}

/** The rows of the master's rack unit, so the view can frame them as one. */
export function rackOf(layout: Layout): { x: number; y: number; w: number; h: number } | null {
  const rows = layout.order.filter((p) => p.row >= 0);
  if (!rows.length) return null;
  const y = Math.min(...rows.map((p) => p.y));
  return { x: rows[0].x, y, w: rows[0].w, h: Math.max(...rows.map((p) => p.y + p.h)) - y };
}

/** Where the master's EQ curve sits: under its rack unit, in its column. */
export const bellsAt = (layout: Layout) => layout.bells;

/**
 * Which wires are the **main path**: the spine of the picture, drawn heavier.
 * It is the signal's own reachability and not a list — everything a source
 * reaches, forward, over signal wires.
 */
export function mainPath(part: MachinePart): Set<string> {
  const out = new Map<string, string[]>();
  for (const n of part.nodes) out.set(n.id, []);
  for (const e of part.edges) if (e.kind === 'signal' && out.has(e.from)) out.get(e.from)!.push(e.to);
  const seen = new Set<string>();
  const wires = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const to of out.get(id) || []) { wires.add(`${id}>${to}`); walk(to); }
  };
  for (const n of part.nodes) if (n.stage === 'sources') walk(n.id);
  return wires;
}

export default layoutCanvas;
