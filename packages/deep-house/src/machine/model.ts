// The whole machine, as one value.
//
// The engine describes its own graph and its own master (`@deep-house/engine/
// describe`); what is added here is everything that is the *composer's* and
// that the engine has no business knowing: the lanes a style declares and who
// is playing each of them this bar, where the sound stage has put them, what
// treatment is on which lane with what settings, and the counters the transport
// keeps. Put together they are `MachineSnapshot`, which is the only thing the
// view ever reads.
//
// It is read-only, all the way down. Nothing in this file writes to a plan, a
// program, a node or a parameter: the two lists it walks — the style's lanes
// and the program's `development` rows — are values that were frozen when the
// theme was planned, and `programOf` is the same memoised compile a deck and a
// render both ask for, so asking for one here costs nothing and compiles
// nothing twice.

import { BY_NAME, VOICE_KNOBS, returnsOf } from '@deep-house/engine/voices';
import { clockSource } from '@deep-house/engine/clock';
import { dropInfo } from '@deep-house/engine/deck';
import { lateInfo } from '@deep-house/engine/dsp';
import { pianoCacheStats } from '@deep-house/engine/voices';
import { describeDeck, describeGraph, describeMaster, joinParts } from '@deep-house/engine/describe';
import { settingsOf } from '@deep-house/engine/settings';
import type { MachineEdge, MachineNode, MachinePart, Unit } from '@deep-house/engine/describe';
import type { Lane } from '@deep-house/engine/style';
import { programOf } from '../performance.ts';
import type { StageRow, TreatmentSegment } from '../performance.ts';
import { ringColour } from '../ring-colour.ts';
import { calibrationStatus, forwardSpell } from '../calibration.ts';
import { asSpell } from '../spell.ts';
import { strategyById } from '../strategies/index.ts';
import { lines } from '../ledger.ts';
import type { Entry } from '../ledger.ts';
import type { Control, Readout } from '../control.ts';
import type { MeterFrame } from '@deep-house/engine/taps';
import { BAND_OF, deskFor } from './desk.ts';
import type { DeskState } from './desk.ts';

export type { MachineEdge, MachineNode, MachinePart };

/** What the transport has had to do since the page was opened. */
export interface Counters {
  /** notes the scheduler reached after their time, and the last one's shift */
  late: { count: number; last: number; at: number; cause: string | null };
  /** events a stalled pump found more than a bar behind the head and let go */
  dropped: { count: number; last: number; at: number };
  /** the piano's string cache: built ahead, and built under the scheduler */
  piano: ReturnType<typeof pianoCacheStats>;
}

/** Where the sound leaves, and on what clock. */
export interface Output {
  /** `direct`, `element` or `silent` — which road the set takes off the page */
  route: string;
  /** `worker`, `blob-worker`, `interval`, or nothing before a set has started */
  clock: string | null;
  sampleRate: number | null;
  baseMs: number | null;
  outputMs: number | null;
  lookaheadMs: number;
  /** the context's own state: `running`, `suspended`, `closed` */
  state: string | null;
}

/** One lane of the style, and what is on it this bar. */
export interface LaneRow {
  id: string;
  role: string;
  /** the arrangement layer that gates it, where one does */
  gate: string | null;
  figure: string;
  bus: string | null;
  /** how many candidates the style put on it */
  candidates: number;
  /** who is playing it in this theme, by event name */
  playing: string[];
  /** how many of its events are in this bar */
  firing: number;
  /** whether the section grammar has it switched on this bar */
  on: boolean;
  /** where the stage has put it, where the stage has a view: front, back, hold… */
  stage: string | null;
  /** the treatment on it now, and the settings the rota rolled for it */
  treatment: { kind: string; settings: Record<string, number> } | null;
  /**
   * **What the spell asked of this lane's own instrument** (PLAN-MODULATION
   * M1): one entry per knob the voice playing it declares and the spell moved,
   * in the unit the knob is in. Empty at the house, because at the house every
   * knob is at the number the descriptor measured and there is nothing to say.
   */
  knobs: Array<{ name: string; value: number; unit: Unit }>;
  /** the family of the instrument on it, off the registry: `drum`, `bass`… */
  family: string | null;
  /** the framed group that family puts it in, by the table below */
  group: string;
}

/** Everything the view draws, taken in one breath. */
export interface MachineSnapshot {
  /** a serial: every publish bumps it, and nothing else in here may be compared */
  n: number;
  playing: boolean;
  seed: string;
  strategy: string;
  room: string;
  theme: number;
  bar: number;
  bars: number;
  section: string;
  bpm: number;
  /** seconds into the theme, the readout's own (M16: COPY AT reads it) */
  seconds: number;
  key: string;
  chord: string;
  /** how far through a hand-over, nought to one */
  transition: number;
  /** the set a cast is arriving into, while one is */
  castTo: string | null;
  /** the spell the set was cast under, and the one colour in the whole view */
  spell: Record<string, number> | null;
  spellHex: string;
  /**
   * **What the map says that spell will measure as** — the other half of the
   * sentence `rounds/calibration-map.md` is about. The eight numbers beside it
   * are dice positions; these are the readings those dice are expected to
   * produce under this strategy's calibration, so a hand holding a bird can
   * see that it asked for one thing and the machine will answer with another.
   *
   * `null` where there is nothing to say: no spell, or a strategy with no map.
   * It is a **prediction and not a measurement** — nothing in the page reads
   * its own audio back — and the readout says `reads` rather than `measured`
   * for exactly that reason.
   */
  reads: Record<string, number> | null;
  /**
   * The engine the set is arriving under, while the view's one control is
   * mid-hand-over. `strategy` above is what is *playing* and becomes this at
   * the swap, which is the rule the seed already follows.
   */
  strategyTo: string | null;
  lanes: LaneRow[];
  /** where the sound stage has put the record this bar: the accent, and the tune */
  stage: { front: string | null; lead: string | null; leadHz: number | null };
  part: MachinePart;
  meters: MeterFrame | null;
  counters: Counters;
  output: Output;
  ledger: Entry[];
  /**
   * **The instruments on each bus this theme**, off the lanes: what a bus's
   * mute, solo and dry act on (round M1), and what its strip says it holds.
   */
  busVoices: Record<string, string[]>;
  /** what the view's desk has leant on the master, over the room */
  desk: DeskState;
}

// --- the lanes --------------------------------------------------------------

/**
 * Which registered voices could stand on this lane, by event name.
 *
 * A lane with a candidate list names them; the two harmonic lanes do not,
 * because they are chosen by the *timbre* dice and the instrument is whatever
 * the registry says makes that timbre — so for those the candidates are every
 * registered voice that plays the lane's own gate. Both answers come off data
 * that is already there, which is why a lane added to a style appears here
 * with nothing edited.
 */
function candidatesOf(lane: Lane): string[] {
  if (lane.voices && lane.voices.length) return lane.voices.map((c) => String(c.v));
  if (!lane.gate) return [];
  return Object.values(BY_NAME).filter((d) => d.plays === lane.gate).map((d) => d.name);
}

/**
 * **The framed groups of the sources, and where they come from.**
 *
 * Eugene (09-25): *"all instruments in one column … drums, then bass, then
 * mid, then high frequency — all drum components together, snare and hats
 * included."* So a lane's group is read off two words the registry already
 * has for the instrument playing it: **its bus** — everything that lands on
 * the kick or the drums bus is a drum component, which is what puts the hats
 * and the shakers (the `noise` family) beside the kick and the snare — and,
 * for the rest, **its family**: `bass` the low end, `keyboard`, `ensemble` and
 * `vocal` the middle, `noise` and `effect` the top. A family written tomorrow
 * lands in a frame by the one row that names it; nothing here counts lanes.
 */
export const GROUPS: ReadonlyArray<{ id: string; label: string; families: readonly string[] }> = [
  { id: 'drums', label: 'drums', families: ['drum'] },
  { id: 'bass', label: 'bass', families: ['bass'] },
  { id: 'mid', label: 'mid', families: ['keyboard', 'ensemble', 'vocal'] },
  { id: 'high', label: 'high', families: ['noise', 'effect'] },
];
const OTHER = 'other';
/** The buses whose every note is a drum component, whatever the family says. */
const DRUM_BUSES = ['kick', 'drums'];
const groupOf = (family: string | null, bus: string | null = null): string =>
  (bus && DRUM_BUSES.includes(bus) ? 'drums' : null)
  || (family && GROUPS.find((g) => g.families.includes(family))?.id) || OTHER;

/** The event layers a lane's own candidates carry, which is how its events are found. */
const layersOf = (names: string[]): string[] => {
  const out: string[] = [];
  for (const name of names) {
    const d = BY_NAME[name];
    if (d && d.layer && !out.includes(d.layer)) out.push(d.layer);
  }
  return out;
};

/** The six numbers the rota rolled for a segment, as the view reports them. */
/**
 * **The graph a stopped set would build, once per track** (M14, the review of 09-26: every
 * redraw with the set stopped re-resolved the room's settings — a deep freeze
 * and a clone — and walked the program's events for the returns). A track is
 * an immutable plan, so its description is too.
 */
const stoppedGraphs = new WeakMap<object, ReturnType<typeof describeGraph>>();
function stoppedGraph(track: Readout['track']): ReturnType<typeof describeGraph> {
  const key = track as unknown as object;
  let g = stoppedGraphs.get(key);
  if (!g) { g = describeGraph(null, settingsOf(track), returnsOf(programOf(track).events)); stoppedGraphs.set(key, g); }
  // a copy of its boxes each time: the desk's readings are pushed onto them below
  return { nodes: g.nodes.map((n) => ({ ...n, readings: n.readings.slice() })), edges: g.edges.slice() };
}

function settingsOfSegment(seg: TreatmentSegment): Record<string, number> {
  return {
    rate: +seg.rate.toFixed(3),
    depth: +seg.depth.toFixed(3),
    mix: +seg.mix.toFixed(3),
    amount: +seg.amount.toFixed(3),
    stages: seg.stages,
    bars: seg.len,
  };
}

/**
 * One theme's event list, read once: which voices sound on each layer at all,
 * and how many events each layer has in each bar.
 *
 * It is memoised on the *program*, which is itself the memoised compile of a
 * plan, because a theme has thousands of events and the view redraws twelve
 * times a second. Walking the list every frame is the one thing in this view
 * that would have cost anything, and it is walked once per theme instead.
 */
interface ThemeIndex {
  unreserved: Set<string>;
  voices: Map<string, Set<string>>;
  perBar: Map<string, Uint16Array>;
  sources: Map<string, { bus: string; perBar: Uint16Array }>;
}
const indexed = new WeakMap<object, ThemeIndex>();

function indexOf(program: ReturnType<typeof programOf>): ThemeIndex {
  const had = indexed.get(program as unknown as object);
  if (had) return had;
  const voices = new Map<string, Set<string>>();
  const perBar = new Map<string, Uint16Array>();
  const sources: ThemeIndex['sources'] = new Map();
  const unreserved = new Set<string>();
  for (const e of program.events) {
    if (e.treatment !== 'none') unreserved.add(e.voice);
    let set = voices.get(e.layer);
    if (!set) voices.set(e.layer, (set = new Set()));
    set.add(e.voice);
    // keyed by the layer *and* the voice: two lanes can share an instrument,
    // and each lights for its own notes and never for the other's
    const lv = `${e.layer}\u0000${e.voice}`;
    let bars = perBar.get(lv);
    if (!bars) perBar.set(lv, (bars = new Uint16Array(program.bars + 1)));
    if (e.bar != null && e.bar >= 0 && e.bar < bars.length) bars[e.bar] += 1;
    let source=sources.get(e.voice);
    if (!source) sources.set(e.voice, source={bus:e.bus,perBar:new Uint16Array(program.bars+1)});
    if (e.bar != null && e.bar>=0 && e.bar<source.perBar.length) source.perBar[e.bar]++;
  }
  const made = { voices, perBar, sources, unreserved };
  indexed.set(program as unknown as object, made);
  return made;
}

/** What a knob's unit is called in a readout. Two of the four are the same word. */
const KNOB_UNIT: Record<string, Unit> = { hz: 'hz', seconds: 's', ratio: 'ratio', db: 'db' };

/**
 * **The seasoning on this lane**, as readings the box can carry: the knobs the
 * spell moved on whatever is playing it, rounded the way a person would say
 * them — a corner to the hertz, a time to the millisecond, a fraction to three
 * places.
 *
 * Where two voices share a lane the reading is prefixed with the instrument,
 * because two numbers under one name would be a mark that is not a value. At
 * the house the list is empty and the box says exactly what it always said.
 */
function knobsOfLane(
  knobs: Record<string, Record<string, number>> | undefined,
  playing: string[],
): LaneRow['knobs'] {
  if (!knobs) return [];
  const out: LaneRow['knobs'] = [];
  const many = playing.filter((v) => knobs[v]).length > 1;
  for (const voice of playing) {
    const row = knobs[voice];
    if (!row) continue;
    const table = VOICE_KNOBS[voice] || {};
    for (const [name, value] of Object.entries(row)) {
      const spec = table[name];
      const unit = KNOB_UNIT[spec ? spec.unit : ''] ?? '';
      const said = unit === 's' ? +(value * 1000).toFixed(0) : unit === 'hz' ? Math.round(value) : +value.toFixed(3);
      out.push({ name: many ? `${voice} ${name}` : name, value: said, unit: unit === 's' ? 'ms' : unit });
    }
  }
  return out;
}

/**
 * Every lane the strategy declares, with the voice each is playing now.
 *
 * *Playing now* is read off the program's own events and not off a second draw:
 * the lane's candidates are intersected with the voices the compiled theme
 * actually fires, so what is drawn is what is being played rather than what a
 * recomputed die would have said.
 */
export function lanesOfTheme(readout: Readout): LaneRow[] {
  const track = readout.track;
  const lanes: readonly Lane[] = track.style.lanes;
  const program = programOf(track);
  const bar = readout.bar;
  const rows = program.development as StageRow[];
  const row: StageRow | undefined = rows[bar];
  const on = track.timeline[bar] ? track.timeline[bar].layers : [];
  const index = indexOf(program);

  const declared = lanes.map((lane): LaneRow => {
    const candidates = candidatesOf(lane);
    const layers = layersOf(candidates);
    const playing: string[] = [];
    let fires = 0;
    for (const layer of layers) {
      for (const v of index.voices.get(layer) || []) {
        if (!candidates.includes(v)) continue;
        if (!playing.includes(v)) playing.push(v);
        fires += index.perBar.get(`${layer}\u0000${v}`)?.[bar] ?? 0;
      }
    }
    // **The stage's rows are keyed by the arrangement layer and not by the
    // lane**, because the sound stage moves `pad`, `keys` and `bass` — three
    // layers — and a style may put several lanes on one of them. So a lane asks
    // under its own id first and under the layer that gates it second, which is
    // how house-v1's `drone` finds the pad's rota and `figure` the keys'. It
    // was the id alone, and every treatment box was missing.
    const key = row && row.seg && row.seg[lane.id] !== undefined ? lane.id : lane.gate;
    const seg = row && row.seg && key ? row.seg[key] : null;
    // The family of what is *playing* it, and failing that of what could: a
    // lane the section has gated off is still a drum lane.
    const first = playing[0] ?? candidates[0];
    const family = (first && BY_NAME[first] && BY_NAME[first].family) || null;
    const bus = (first && BY_NAME[first] && BY_NAME[first].bus) || lane.bus || null;
    return {
      id: lane.id,
      role: lane.role,
      gate: lane.gate,
      figure: lane.figure,
      bus: lane.bus,
      candidates: candidates.length,
      playing,
      firing: fires,
      // Lit by the lane's own gate, or by notes on the very layer its gate
      // names — an explicit part can play there with the section's gate shut —
      // and never by notes on a layer the lane only shares: two lanes can draw
      // the same instrument onto one layer (the closed and the open hat), and a
      // note alone cannot say whose it is.
      on: lane.gate ? on.includes(lane.gate) || candidates.some((v) => (index.perBar.get(`${lane.gate}\u0000${v}`)?.[bar] ?? 0) > 0) : fires > 0,
      stage: row && row.role && key ? row.role[key] ?? null : null,
      treatment: seg && seg.kind && playing.some(v=>index.unreserved.has(v))
        ? { kind: seg.kind, settings: settingsOfSegment(seg) } : null,
      knobs: knobsOfLane(track.knobs, playing),
      family,
      group: groupOf(family, bus),
    };
  });
  // Explicit musical parts can use instruments outside the ordinary lane
  // palette. Their actual compiled sources must remain visible and soloable.
  const represented=new Set(declared.flatMap(l=>l.playing));
  for (const [voice,source] of index.sources) if (!represented.has(voice)) {
    const d=BY_NAME[voice], firing=source.perBar[bar] ?? 0;
    declared.push({id:voice,role:d.roles[0] ?? 'figure',gate:d.plays,figure:'part',bus:source.bus,
      candidates:1,playing:[voice],firing,on:firing>0,stage:row?.role[d.layer] ?? null,
      treatment:null,knobs:knobsOfLane(track.knobs,[voice]),family:d.family,group:groupOf(d.family,d.bus)});
  }
  return declared;
}

/**
 * Where the stage has put the record this bar: the accent at the front, the
 * lane holding the tune, and where that tune is. It is the composer's own row,
 * read and never worked out a second time.
 */
function stageOf(readout: Readout): MachineSnapshot['stage'] {
  const rows = programOf(readout.track).development as StageRow[];
  const row = rows[readout.bar];
  if (!row || !row.engaged) return { front: null, lead: null, leadHz: null };
  return { front: row.front, lead: row.lead, leadHz: row.leadHz == null ? null : Math.round(row.leadHz) };
}

/**
 * The lanes as boxes, the treatment the rota has put on each, and the wire from
 * each to the bus it lands on.
 *
 * **A treatment is a box on the lane's own wire**, which is what it is: the
 * rota draws one kind per lane per segment and the desk puts it on between the
 * part and the bus. Its readings are the six numbers the rota rolled, because
 * that is the answer to the question this whole view exists for — *did I hear
 * the effect or was it a ghost in my ears?* A lane the rota left alone has no
 * box, because the desk was left alone there and an empty insert would be a
 * mark that is not a value.
 */
export function lanePart(rows: LaneRow[], built = true): MachinePart {
  const nodes: MachineNode[] = [];
  const edges: MachineEdge[] = [];
  // A part outside the lane palette is its own box, called by its family —
  // unless another such box shares the family, when it is called by its voice,
  // so two keyboard parts never both read KEYBOARD.
  const extra = (l: LaneRow) => l.playing.length === 1 && l.id === l.playing[0];
  const families = rows.filter(extra).map((l) => l.family);
  for (const lane of rows) {
    const byFamily = extra(lane) && lane.family && families.filter((f) => f === lane.family).length === 1;
    nodes.push({
      id: `lane:${lane.id}`,
      label: (byFamily ? lane.family! : lane.id).toUpperCase(),
      kind: 'lane',
      stage: 'sources',
      group: lane.group,
      made: lane.playing.join(' · ') || '—',
      readings: [
        { name: 'events', value: lane.firing, unit: '' },
        { name: 'of', value: lane.candidates, unit: '' },
        // ...and the knob values, in the lane's own box, which is where
        // `PLAN-MACHINE-VIEW` said they go. Nothing at the house.
        ...lane.knobs,
      ],
      state: !built ? 'idle' : lane.on ? 'live' : 'gated',
      note: `${lane.role} · ${lane.figure}${lane.stage ? ` · ${lane.stage}` : ''}`,
    });
    let from = `lane:${lane.id}`;
    if (lane.treatment) {
      const t = lane.treatment;
      nodes.push({
        id: `treat:${lane.id}`,
        stage: 'inserts',
        // `fx:` is how the rota names an instance out of the kitchen against a
        // gesture of the stage's own; the prefix is noise on a box that is
        // already labelled as a treatment.
        label: t.kind.replace(/^fx:/, '').toUpperCase(),
        kind: 'stage',
        made: t.kind.startsWith('fx:') ? 'effect instance' : 'gesture',
        readings: Object.entries(t.settings).map(([name, value]) => ({ name, value, unit: '' as const })),
        // A treatment is only *on* where the stage has put the lane back; a
        // lane the section has gated is a treatment on nothing.
        state: !built ? 'idle' : lane.on ? 'live' : 'bypassed',
        note: `on ${lane.id}${lane.stage ? `, ${lane.stage}` : ''}`,
      });
      edges.push({ from, to: `treat:${lane.id}`, kind: 'signal' });
      from = `treat:${lane.id}`;
    }
    if (lane.bus) edges.push({ from, to: `bus:${lane.bus}`, kind: 'signal' });
  }
  return { nodes, edges };
}

// --- the whole thing --------------------------------------------------------

/**
 * The machine, now.
 *
 * `taps` is the meter frame the store took this tick, or nothing when the view
 * has only just opened; everything else is asked of the transport, the plan and
 * the graph in the order the signal runs. A set that is not playing has no
 * graph and no master, and then the description is the lanes and the deck's
 * counters — which is exactly what there is to say about a machine at rest.
 */
export function describeMachine(
  control: Control, readout: Readout, meters: MeterFrame | null, n: number,
): MachineSnapshot {
  const state = control.state;
  const mix = state.mix;
  const ctx = state.ctx;
  const lanes = lanesOfTheme(readout);
  const built = !!mix;
  const parts: MachinePart[] = [lanePart(lanes, built)];

  // **The node set is the machine as built, and a pause changes state and
  // never structure.** A pause on this page *is* a stop — it lets the mix go
  // and takes the whole audio graph down with it — so a description that only
  // walked live nodes drew the parts and nothing else the moment somebody
  // pressed the space bar, and drew a different picture again on the way back.
  // The engine's tables are walked whether or not there is a node under them
  // (`describe.ts`, `NodeState.idle`), so the same boxes and the same wires are
  // there at rest, saying `—`, with their lamps out and their meters on the
  // floor. The room is the planned theme's own, which is a value and needs
  // nothing built to resolve.
  //
  // A set with a hand-over up has two decks and one master; the record is the
  // deck under the needle, which is what `describe()` on its own graph answers
  // for.
  const deck = mixDeck(mix);
  // at rest, the returns the program sends to are still drawn, idle (R56)
  parts.push(deck ? deck.graph.describe() : stoppedGraph(readout.track));
  parts.push(describeDeck(deck));
  const master = mixMaster(mix);
  parts.push(master ? master.describe() : describeMaster(null));

  const part = joinParts(...parts);
  // The sink, which is the last thing in the chain and is not a node of it.
  part.nodes.push({
    id: 'sink',
    label: 'OUTPUT',
    kind: 'output',
    stage: 'output',
    made: built ? control.out : '—',
    readings: built ? [
      { name: 'rate', value: ctx ? Math.round(ctx.sampleRate) : null, unit: 'hz' },
      { name: 'buffer', value: ctx && ctx.baseLatency ? +(ctx.baseLatency * 1000).toFixed(1) : null, unit: 'ms' },
      { name: 'out', value: ctx && ctx.outputLatency ? +(ctx.outputLatency * 1000).toFixed(1) : null, unit: 'ms' },
    ] : [],
    // The silent route is the suites' and is a real state, not a fault: it
    // says so in amber rather than being drawn as a set that is playing out.
    state: !built ? 'idle' : control.out === 'silent' ? 'bypassed' : 'live',
    note: built && ctx ? `context ${ctx.state}` : 'nothing built',
  });
  part.edges.push({ from: 'm:out', to: 'sink', kind: 'signal' });

  // **What the desk has done, as readings on the boxes it did it to** (M1): a
  // bus says it is muted, soloed or dry where every instrument on it is, and a
  // band of the master says how far it is leant over the room. Its own gain is
  // already read off the node, so the curve and the row move with the hand.
  const busVoices: Record<string, string[]> = {};
  for (const lane of lanes) if (lane.bus) for (const v of lane.playing) (busVoices[lane.bus] ||= []).includes(v) || busVoices[lane.bus].push(v);
  const sm = control.sourceMix;
  const desk = deskFor(control).state();
  for (const n of part.nodes) {
    const bus = n.kind === 'bus' ? n.id.replace(/^bus:/, '') : null;
    if (bus) {
      const vs = busVoices[bus] || [];
      n.readings.push({ name: 'voices', value: vs.length, unit: '' });
      for (const k of ['mute', 'solo', 'dry'] as const) if (vs.length && vs.every((v) => sm[k].includes(v))) n.readings.push({ name: k, value: true, unit: '' });
    }
    // a source's own gain where a hand has moved it, raw (M8, Eugene: *"the
    // machine view should operate more on internals than user-facing values"*):
    // the key says 98, the manual's "now" says the gain the mix multiplies by
    const lane = n.stage === 'sources' ? lanes.find((l) => `lane:${l.id}` === n.id) : null;
    const gains = lane ? lane.playing.map((v) => (sm.gain && sm.gain[v] != null ? sm.gain[v] : 1)) : [];
    if (gains.some((g) => g !== 1)) n.readings.push({ name: 'gain', value: +gains[0].toFixed(3), unit: '' });
    const band = BAND_OF[n.id];
    if (band && desk.bands[band] != null) n.readings.push({ name: 'lean', value: desk.bands[band]!, unit: 'db' });
  }

  const colour = ringColour(readout.spell as never);
  const strategy = strategyById(readout.strategy);
  return {
    n,
    playing: readout.playing,
    seed: readout.seed,
    strategy: readout.strategy,
    strategyTo: state.strategyTo,
    room: readout.presetName,
    theme: readout.mix.themeNumber,
    bar: readout.bar + 1,
    bars: readout.bars,
    section: readout.section,
    bpm: readout.bpm,
    seconds: readout.seconds,
    key: readout.key,
    chord: readout.chord,
    transition: readout.mix.transition,
    castTo: state.castTo,
    spell: (readout.spell as Record<string, number> | null) ?? null,
    spellHex: colour.hex,
    reads: readout.spell && calibrationStatus(strategy.calibration, strategy.generation) === 'current'
      ? forwardSpell(strategy.calibration, asSpell(readout.spell as never))
      : null,
    lanes,
    stage: stageOf(readout),
    part,
    meters,
    counters: {
      late: lateInfo(),
      dropped: dropInfo(),
      piano: pianoCacheStats(),
    },
    output: {
      route: control.out,
      clock: clockSource(),
      sampleRate: ctx ? Math.round(ctx.sampleRate) : null,
      baseMs: ctx && ctx.baseLatency != null ? +(ctx.baseLatency * 1000).toFixed(1) : null,
      outputMs: ctx && ctx.outputLatency != null ? +(ctx.outputLatency * 1000).toFixed(1) : null,
      lookaheadMs: Math.round((state.lookahead || 0.12) * 1000),
      state: ctx ? ctx.state : null,
    },
    ledger: lines(),
    busVoices,
    desk,
  };
}

type LiveMix = NonNullable<Control['state']['mix']>;

// The two handles a description is taken of, off the facade that hands them
// out. Both are read on the frame they are wanted and neither is held, so a set
// let go between two frames answers `null` here rather than handing back a
// graph that has been taken apart.
const mixDeck = (mix: LiveMix | null) => (mix ? mix.record : null);
const mixMaster = (mix: LiveMix | null) => (mix ? mix.master : null);

export default describeMachine;
