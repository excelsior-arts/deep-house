// What the machine is, asked of the machine.
//
// `graph.describe()` and `master.describe()` hand back the nodes and the wires
// **of the graph that was actually built** — not a drawing of one. Every
// reading in here is taken off a live node in the same breath it is asked for:
// a gain's gain, a biquad's type and corner, a compressor's reduction this
// instant, whether the ceiling is the worklet or the gain that stands in for
// it, whether the piano's hall was ever built. A theme whose glue is a wire
// because its ratio is 1 says `gain` here, because that is the node in the
// path.
//
// It is the half of `notes/archive/2026-09-v2-day-chain/plans/PLAN-MACHINE-VIEW.md` that has to live in the
// engine: *the diagram is the code*. The view draws this and has no opinion of
// its own about what the machine contains, so a stage added to `master.ts`
// appears in the picture when it is named here and nowhere else — one table,
// beside the reading of it, rather than a second document to keep in step.
//
// **It reads and never writes.** Nothing in this file touches a parameter,
// connects a node or builds one; `hasHall()` exists on the graph precisely so
// that asking whether the hall is there cannot be what builds it. So a
// description can be taken at any moment of any render without moving a
// sample, which is what the view's inert-taps gate then proves end to end.

import { gainToDb } from './dsp.ts';
import { BUSES } from './voices/descriptor.ts';
import type { VoiceBus } from './voices/descriptor.ts';
import type { V1Graph, V1Master } from './graph.ts';
import type { Deck } from './deck.ts';
import type { Settings } from './settings.ts';
import { DEFAULT_SPACES } from './background-space.ts';

/** What a number in this description is in. `''` is a bare count or a ratio. */
export type Unit = '' | 'db' | 'hz' | 'ratio' | 's' | 'ms' | 'x' | 'ch';

/** One reading off one node: a name, the value, and what the value is in. */
export interface Reading {
  name: string;
  value: number | string | boolean | null;
  unit?: Unit;
}

/**
 * What a box is: the lanes the composer declares, the five buses, the parallel
 * lines something is sent *to*, the stages of a theme's own chain, the tail the
 * set shares, the sink, the clock and the deck's counters.
 */
export type NodeKind =
  | 'lane' | 'bus' | 'send' | 'stage' | 'master' | 'output' | 'clock' | 'deck' | 'ledger';

/**
 * How a box is doing: lit, passed through, switched off by the arrangement — or
 * **`idle`, which is a box that exists and has not been built**.
 *
 * That last one is the whole of what a pause is. Pausing this machine disposes
 * the mix, and a description taken off the live nodes would then have nothing
 * to report for five of its seven stages — so the picture lost every box but
 * the parts, and a resume drew a different picture. **The node set is the
 * machine as built; what a pause changes is state and never structure.** So
 * every table in this file is walked whether or not there is a node under it:
 * with one, the box carries what was read off it; without, the box is there,
 * says `—`, carries no readings, and is `idle`.
 */
export type NodeState = 'live' | 'bypassed' | 'gated' | 'idle';

/**
 * **The named stages of the signal, in the order it passes through them.**
 *
 * A box says which one it belongs to and the picture is laid out in these
 * columns, each with its title and its one sentence — so the diagram explains
 * the architecture without a document beside it, and a stage that has nothing
 * in it is not drawn at all.
 */
export const STAGES = ['sources', 'inserts', 'buses', 'sends', 'stage', 'master', 'output'] as const;
export type Stage = typeof STAGES[number];

/** What each stage is called on the picture, and what it does, in one sentence. */
export const STAGE_ABOUT: Record<Stage, { title: string; what: string }> = {
  sources: { title: 'sources', what: 'the parts the style declares, and the instrument playing each' },
  inserts: { title: 'lane inserts', what: 'what the desk has put on a part for these bars' },
  buses: { title: 'buses', what: 'the five streams every note lands on' },
  sends: { title: 'sends & returns', what: 'parallel lines a note is sent to, returning at a level' },
  stage: { title: 'stage', what: 'the moves a theme makes on itself: the duck, the width, the filter, the push' },
  master: { title: 'master chain', what: 'one serial path the whole set passes through, top to bottom' },
  output: { title: 'output', what: 'where it leaves, on which clock, through how deep a buffer' },
};

/** One box. */
export interface MachineNode {
  id: string;
  label: string;
  kind: NodeKind;
  /** which named stage of the signal it belongs to; the picture's columns */
  stage: Stage;
  /**
   * The framed group it sits inside, where its stage frames anything — the
   * sources are grouped by the **family of the instrument playing them**, which
   * is a fact of the registry and not a list anybody keeps.
   */
  group?: string;
  /**
   * Which side a wire leaves by. A mixer strip is tall and stands beside its
   * neighbours, so its outgoing wire leaves the **bottom** and runs under the
   * column; everything else leaves the right.
   */
  exit?: 'right' | 'bottom';
  /** what the machine made here: `gain`, `biquad lowpass`, `worklet`, `convolver`… */
  made: string;
  readings: Reading[];
  state: NodeState;
  /**
   * The meter this box carries, by the name a meter frame is keyed under.
   * Only the five buses and the output have one; everything else reads its own
   * numbers and needs none.
   */
  meter?: string;
  /** a line of prose the view may show: why this box is here */
  note?: string;
}

/** One wire. `weight` is a send's level, as a gain, which is what draws it. */
export interface MachineEdge {
  from: string;
  to: string;
  kind: 'signal' | 'send' | 'return' | 'sidechain';
  weight?: number;
  label?: string;
}

/** A piece of the machine, described: its boxes and the wires between them. */
export interface MachinePart {
  nodes: MachineNode[];
  edges: MachineEdge[];
}

// --- reading a node ---------------------------------------------------------
//
// Four shapes cover everything either graph builds, and each is asked what it
// is rather than told: a gain has a `gain`, a biquad has a `type` and a
// `frequency`, a compressor has a `reduction` that moves while it works, a
// shaper has a curve and an oversample. What a node is *called* comes off the
// same reading, so a limiter that is a gain because the worklet would not load
// says `gain` and the view draws an amber box without being told to.

const db = (g: number): number => +gainToDb(Math.max(g, 1e-6)).toFixed(2);
const r2 = (x: number): number => +x.toFixed(2);
const r3 = (x: number): number => +x.toFixed(3);

const isGain = (n: unknown): n is GainNode =>
  !!n && typeof n === 'object' && 'gain' in (n as GainNode) && !('frequency' in (n as object));
const isBiquad = (n: unknown): n is BiquadFilterNode =>
  !!n && typeof n === 'object' && 'type' in (n as BiquadFilterNode) && 'frequency' in (n as object) && 'Q' in (n as object);
const isComp = (n: unknown): n is DynamicsCompressorNode =>
  !!n && typeof n === 'object' && 'threshold' in (n as object) && 'ratio' in (n as object) && 'reduction' in (n as object);
const isShaper = (n: unknown): n is WaveShaperNode =>
  !!n && typeof n === 'object' && 'curve' in (n as object) && 'oversample' in (n as object);
const isDelay = (n: unknown): n is DelayNode =>
  !!n && typeof n === 'object' && 'delayTime' in (n as object);
const isWorklet = (n: unknown): boolean =>
  !!n && typeof n === 'object' && 'parameters' in (n as object) && 'port' in (n as object);

/** What this node is, in one word, read off the node. */
export function madeOf(node: unknown): string {
  if (isWorklet(node)) return 'worklet';
  if (isBiquad(node)) return `biquad ${node.type}`;
  if (isComp(node)) return 'compressor';
  if (isShaper(node)) return 'shaper';
  if (isDelay(node)) return 'delay';
  if (isGain(node)) return 'gain';
  return 'node';
}

/**
 * Everything worth reading off one node, right now. A gain is reported in dB
 * as well as linear because a mixer is read in dB; a compressor's `reduction`
 * is the one reading here that moves on its own, which is why the view polls
 * the description and does not cache it.
 */
export function readingsOf(node: unknown): Reading[] {
  const out: Reading[] = [];
  if (isWorklet(node)) {
    const ceiling = (node as AudioWorkletNode).parameters.get('ceiling');
    if (ceiling) out.push({ name: 'ceiling', value: db(ceiling.value), unit: 'db' });
    return out;
  }
  if (isBiquad(node)) {
    out.push({ name: 'freq', value: Math.round(node.frequency.value), unit: 'hz' });
    if (node.type === 'peaking' || node.type === 'lowshelf' || node.type === 'highshelf') {
      out.push({ name: 'gain', value: r2(node.gain.value), unit: 'db' });
    }
    out.push({ name: 'Q', value: r2(node.Q.value), unit: '' });
    return out;
  }
  if (isComp(node)) {
    out.push({ name: 'gr', value: r2(node.reduction), unit: 'db' });
    out.push({ name: 'thr', value: r2(node.threshold.value), unit: 'db' });
    out.push({ name: 'ratio', value: r2(node.ratio.value), unit: 'x' });
    return out;
  }
  if (isShaper(node)) {
    out.push({ name: 'curve', value: node.curve ? node.curve.length : 0, unit: '' });
    out.push({ name: 'os', value: node.oversample, unit: '' });
    return out;
  }
  if (isDelay(node)) {
    out.push({ name: 'time', value: Math.round(node.delayTime.value * 1000), unit: 'ms' });
    return out;
  }
  if (isGain(node)) {
    out.push({ name: 'gain', value: db(node.gain.value), unit: 'db' });
    return out;
  }
  return out;
}

const box = (
  id: string, label: string, kind: NodeKind, stage: Stage, node: unknown,
  extra: Partial<MachineNode> = {},
): MachineNode => (node == null ? {
  // A box with nothing under it: the machine has this, and it has not been
  // built. Whatever `extra` says about state is overridden, because a
  // bypassed nothing and a gated nothing are both just nothing.
  id, label, kind, stage, made: '—', readings: [], ...extra, state: 'idle',
} : {
  id,
  label,
  kind,
  stage,
  made: madeOf(node),
  readings: readingsOf(node),
  state: 'live',
  ...extra,
});

// --- one theme's graph ------------------------------------------------------

/**
 * A theme's own chain, as `buildGraph` built it.
 *
 * The wires are the connections that file makes, stated here beside the reading
 * of the nodes they join, so the two are one edit. Four junction nodes of the
 * low end (`lowSum`, `lowHp`, the glue's saturation and the keys' chorus) are
 * not on the handle and are not invented: each is folded into the wire that
 * passes through it and named on that wire, so the picture says what the signal
 * does without claiming a box nobody can read.
 *
 * **It is the same walk with or without a graph.** Given `null` — a page that
 * has never started, or one a pause has just taken the mix away from — every
 * box in these tables is still described, `idle` and with nothing read off it,
 * so the picture keeps its shape and a play lights it up rather than redrawing
 * it.
 *
 * @param graph the handle `makeV1Graph` hands back, or nothing where the
 *   machine has not been built
 * @param settings the room it was built under — the send levels and the
 *   sidechain's depth are numbers of the room, not of a node
 */
export function describeGraph(graph: V1Graph | null, settings: Settings, returns: Iterable<string> = []): MachinePart {
  const BACKGROUND_SPACE = settings.backgroundSpaces?.background ?? DEFAULT_SPACES.background;
  const IMMERSED_SPACE = settings.backgroundSpaces?.immersed ?? DEFAULT_SPACES.immersed;
  const g = graph ? graph.nodes : null;
  const S = settings;
  const nodes: MachineNode[] = [];
  const edges: MachineEdge[] = [];

  // The five buses, under the names a program's events carry.
  //
  // The label says `BUS` out loud, and that is a finding and not a flourish: a
  // lane whose only outlet is one bus is drawn as a strip with that bus under
  // it — which is right — and the first picture of it had `KICK` sitting on top
  // of `KICK` with nothing to say which was the part and which was the wire.
  // Keyed by the registry's five bus names (`BUSES`, `voices/descriptor.ts`)
  // and walked in their order, so a sixth bus is a type error here rather than
  // a strip nobody drew (round (f) of the reconciled review of 09-24, D37).
  const ABOUT: Record<VoiceBus, [string, string]> = {
    kick: ['BUS KICK', 'the floor of the record; it never sees the macro filter'],
    sub: ['BUS SUB', 'the bass, ducked after its own compressor'],
    drums: ['BUS DRUMS', 'hats, clap, percussion'],
    melodic: ['BUS MELODIC', 'everything the sidechain moves'],
    keys: ['BUS KEYS', 'through the shared chorus, into melodic'],
  };
  for (const name of BUSES) {
    const [label, note] = ABOUT[name];
    const bus = graph ? graph.buses[name] : null;
    if (graph && !bus) continue;
    // A bus is a mixer strip: tall, beside its neighbours, and its wire leaves
    // the bottom so it never has to cross the strip next to it.
    const n = box(`bus:${name}`, label, 'bus', 'buses', bus ? bus.dry : null, { meter: name, note, exit: 'bottom' });
    if (bus) {
      const dry = bus.dry as GainNode & { channelCount: number };
      if (dry.channelCountMode === 'explicit') n.readings.push({ name: 'ch', value: dry.channelCount, unit: 'ch' });
    }
    nodes.push(n);
  }

  // The four parallel lines something is sent to, and the level each returns
  // at. The level is the room's, because nothing automates a return; the
  // hall's own box says whether a piano ever asked for it, which is a real
  // value and is why `hasHall()` exists rather than a read of the getter that
  // would build one.
  const hallOn = !!graph && graph.hasHall();
  const SENDS: Array<[string, string, number, string, string]> = [
    ['delay', 'DELAY', S.sends.delayLevel, 'duck', graph
      ? `dotted eighth, ${Math.round(S.sends.delayDotted * graph.beat * 1000)} ms, fb ${r2(S.sends.delayFeedback)}`
      : `dotted eighth, fb ${r2(S.sends.delayFeedback)}`],
    ['reverb', 'REVERB', S.sends.reverbLevel, 'duck', `${r2(S.sends.reverbSeconds)} s hall, ${Math.round(S.sends.reverbLowHz)}–${Math.round(S.sends.reverbToneHz)} Hz`],
    ['room', 'ROOM', S.sends.roomLevel, 'bus:drums', `${r2(S.sends.roomSeconds)} s, ${Math.round(S.sends.roomPreDelay * 1000)} ms pre`],
    ['hall', 'HALL', S.sends.hallLevel, 'duck', `${r2(S.sends.hallSeconds)} s, built on the first piano`],
  ];
  // **The two spatial returns are the program's, not the built graph's** (R56):
  // a theme whose events send to them has them whether or not there is a node
  // under the box right now, so a pause draws them idle and never takes the
  // boxes and their five wires away. With nothing built the caller says which
  // the program asks for (`returnsOf`); with a graph, the graph built them for
  // exactly that program (`prepareReturns`).
  const wants = new Set(returns);
  const hasReturn = (name: 'background' | 'immersed') => (graph
    ? (name === 'background' ? graph.hasBackground() : graph.hasImmersed()) || wants.has(name)
    : wants.has(name));
  if (hasReturn('background')) SENDS.push(['background', 'BACKGROUND', BACKGROUND_SPACE.plateLevel, 'bus:drums',
    `${BACKGROUND_SPACE.seconds} s dark plate plus quiet echoes, ${BACKGROUND_SPACE.lowHz}–${BACKGROUND_SPACE.highHz} Hz; independent of kick ducking`]);
  if (hasReturn('immersed')) SENDS.push(['immersed', 'IMMERSED', IMMERSED_SPACE.plateLevel, 'bus:drums',
    `${IMMERSED_SPACE.seconds} s diffuse tail, ${IMMERSED_SPACE.lowHz}–${IMMERSED_SPACE.highHz} Hz; ${IMMERSED_SPACE.diffuseOnly ? 'echoes feed the convolver only' : 'echoes also reach the output'}; independent of kick ducking`]);
  for (const [name, label, level, back, note] of SENDS) {
    nodes.push({
      id: `send:${name}`,
      label,
      kind: 'send',
      stage: 'sends',
      made: graph ? (name === 'delay' ? 'delay line' : ['background', 'immersed'].includes(name) ? 'delay + convolver' : 'convolver') : '—',
      readings: graph ? (name === 'background'
        ? [{ name: 'plate', value: db(level), unit: 'db' }, { name: 'echo', value: db(BACKGROUND_SPACE.echoLevel), unit: 'db' }]
        : [{ name: 'return', value: db(level), unit: 'db' }]) : [],
      state: !graph ? 'idle' : name === 'hall' && !hallOn ? 'gated'
        : (name === 'background' && !graph.hasBackground()) || (name === 'immersed' && !graph.hasImmersed()) ? 'gated' : 'live',
      // What it is, and that the level on it is the return's: a voice's send
      // amount is per note and is not a property of this box.
      note,
    });
    // These are available sends; the wires that matter are the returns,
    // and a return's weight is its level.
    edges.push({ from: `send:${name}`, to: back, kind: 'return', weight: level,
      label: name === 'background' ? `plate ${db(level)} / echo ${db(BACKGROUND_SPACE.echoLevel)} dB` : `${db(level)} dB` });
  }
  // **A send wire says *may*, and the return says *does*.** The amount a voice
  // sends is resolved per event and written by `route()` at fire time, so there
  // is no per-bus send level to read and none is claimed: the outward wires are
  // the connections any voice on that bus can make, drawn as the faintest
  // hairline there is, and the number on the picture is the level the line
  // comes *back* at, which is a node's own gain.
  for (const name of BUSES) {
    if (graph && !graph.buses[name]) continue;
    for (const [send] of SENDS) {
      edges.push({ from: `bus:${name}`, to: `send:${send}`, kind: 'send' });
    }
  }

  // The theme's own stages, in the order the signal passes through them.
  nodes.push(box('duckLow', 'DUCK LOW', 'stage', 'stage', g && g.duckLow, {
    note: `the bass under the kick, ${r2(S.sidechain.lowDepthDb ?? S.sidechain.depthDb)} dB`,
  }));
  nodes.push(box('bassBody', 'BASS BODY', 'stage', 'stage', g && g.push.body));
  nodes.push(box('bassComp', 'BASS COMP', 'stage', 'stage', g && g.bassComp));
  nodes.push(box('push', 'PUSH', 'stage', 'stage', g && g.push.wet, {
    note: 'a hot saturation of the low end, in parallel',
  }));
  nodes.push(box('glue', 'GLUE', 'stage', 'stage', g && g.glue, {
    state: !g ? 'idle' : madeOf(g.glue) === 'gain' ? 'bypassed' : 'live',
    note: 'kick and bass as one instrument',
  }));
  nodes.push(box('duck', 'DUCK', 'stage', 'stage', g && g.duck, {
    note: `one ramp per kick, ${r2(S.sidechain.depthDb)} dB, minimum at ${Math.round(S.sidechain.minimumAt * 1000)} ms`,
  }));
  nodes.push(box('width', 'WIDTH', 'stage', 'stage', g && g.width, {
    note: `mid/side, breathing at ${r3(S.space.widthRateHz)} Hz`,
  }));
  nodes.push(box('macro', 'MACRO', 'stage', 'stage', g && g.macro, {
    note: 'the arrangement\'s one automated knob',
  }));
  nodes.push(box('themeOut', 'THEME TRIM', 'deck', 'master', g && g.themeOut, {
    note: 'the per-theme loudness trim',
  }));

  // ...and the wires, which are the connections `buildGraph` makes.
  edges.push({ from: 'bus:keys', to: 'bus:melodic', kind: 'signal', label: 'chorus' });
  edges.push({ from: 'bus:melodic', to: 'duck', kind: 'signal' });
  edges.push({ from: 'duck', to: 'width', kind: 'signal' });
  edges.push({ from: 'width', to: 'macro', kind: 'signal' });
  edges.push({ from: 'bus:drums', to: 'macro', kind: 'signal' });
  edges.push({ from: 'macro', to: 'themeOut', kind: 'signal', label: 'M/S low' });
  edges.push({ from: 'bus:sub', to: 'bassBody', kind: 'signal' });
  edges.push({ from: 'bassBody', to: 'bassComp', kind: 'signal' });
  edges.push({ from: 'bassComp', to: 'duckLow', kind: 'signal' });
  edges.push({ from: 'duckLow', to: 'glue', kind: 'signal', label: 'HP' });
  edges.push({ from: 'bus:kick', to: 'glue', kind: 'signal', label: 'HP' });
  edges.push({ from: 'duckLow', to: 'push', kind: 'signal' });
  edges.push({ from: 'bus:kick', to: 'push', kind: 'signal' });
  edges.push({ from: 'push', to: 'glue', kind: 'signal' });
  edges.push({ from: 'glue', to: 'themeOut', kind: 'signal', label: 'sat' });
  // The sidechain: the kick is what moves both ducks, and it is drawn as what
  // it is — a control wire and not a signal one.
  edges.push({ from: 'bus:kick', to: 'duck', kind: 'sidechain', weight: S.sidechain.depthDb });
  edges.push({ from: 'bus:kick', to: 'duckLow', kind: 'sidechain', weight: S.sidechain.lowDepthDb ?? S.sidechain.depthDb });

  return { nodes, edges };
}

// --- the tail the whole set shares -----------------------------------------

/**
 * The master chain, node for node, in the order the signal passes through it —
 * which is the order `MasterChain` lists them in, because that interface is
 * written in signal order and this walks it.
 */
export function describeMaster(master: V1Master | null): MachinePart {
  const m = master ? master.nodes : null;
  const ORDER: Array<[string, string, unknown, string]> = [
    ['m:dcBlock', 'DC BLOCK', m && m.dcBlock, 'subsonics out of the file'],
    ['m:lowShelf', 'LOW SHELF', m && m.lowShelf, 'keeps the fundamental off the bell above it'],
    ['m:lowMid', 'LOW MID', m && m.lowMid, 'the octave between the kick body and the chords'],
    ['m:mid', 'MID', m && m.mid, 'MEASURED against the three sets\' long-term spectrum'],
    ['m:presence', 'PRESENCE', m && m.presence, 'the 2–6 kHz the references carry'],
    ['m:air', 'AIR', m && m.air, 'so the hats read as hats'],
    ['m:master', 'MASTER', m && m.master, 'the one gain before the ceiling'],
    ['m:limiter', 'LIMITER', m && m.limiter, 'look-ahead, brick wall, ours'],
    ['m:clip', 'CLIP', m && m.clip, 'the true-peak safety behind the ceiling'],
    ['m:trim', 'TRIM', m && m.trim, 'last in the chain, so the ceiling never moves'],
    ['m:out', 'OUT', m && m.out, 'the set\'s last node'],
  ];
  const nodes = ORDER.map(([id, label, node, note]) => box(id, label, 'master', 'master', node, {
    note,
    // A ceiling that is a gain is the documented fallback and not a limiter:
    // it says so here rather than being drawn as one.
    state: !master ? 'idle' : id === 'm:limiter' && !master.limiterIsWorklet ? 'bypassed' : 'live',
    meter: id === 'm:out' ? 'out' : undefined,
  }));
  const edges: MachineEdge[] = [];
  for (let i = 1; i < ORDER.length; i++) edges.push({ from: ORDER[i - 1][0], to: ORDER[i][0], kind: 'signal' });
  return { nodes, edges };
}

// --- a deck, and what it has had to do --------------------------------------

/** The three things a mixer channel has, and where this deck's cursor is. */
export function describeDeck(deck: Deck | null, id = 'deck'): MachinePart {
  const nodes: MachineNode[] = [
    box(`${id}:hp`, 'HP', 'deck', 'master', deck && deck.hp),
    box(`${id}:lp`, 'LP', 'deck', 'master', deck && deck.lp),
    box(`${id}:fader`, 'FADER', 'deck', 'master', deck && deck.fader),
  ];
  const edges: MachineEdge[] = [
    { from: 'themeOut', to: `${id}:hp`, kind: 'signal' },
    { from: `${id}:hp`, to: `${id}:lp`, kind: 'signal' },
    { from: `${id}:lp`, to: `${id}:fader`, kind: 'signal' },
    { from: `${id}:fader`, to: 'm:dcBlock', kind: 'signal', label: 'sum' },
  ];
  return { nodes, edges };
}

/** Two parts, joined: the one operation a caller that has several does. */
export function joinParts(...parts: MachinePart[]): MachinePart {
  const nodes: MachineNode[] = [];
  const edges: MachineEdge[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    for (const n of p.nodes) if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
    edges.push(...p.edges);
  }
  // A wire to or from a box nobody described is a wire that would be drawn
  // into empty space, so it is dropped here rather than in the view: the view
  // draws what it is given and the description is what is true.
  return { nodes, edges: edges.filter((e) => seen.has(e.from) && seen.has(e.to)) };
}

export default describeGraph;
