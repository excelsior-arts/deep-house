// The performance compiler: a plan and a room in, a **sound program** out.
//
// `compilePerformance(plan, settings)` is a pure function. It is handed a
// planned theme and the resolved settings it is to be played under, it reads
// them and writes to neither, and it hands back one frozen value — every event
// with its onset, its bus and the parameter object the voice will actually be
// given; every automation line the graph is to be handed; the sidechain shape a
// kick posts; the trim, the routing, the resolved levels and the theme's own
// seam plan. Live decks, the single-theme player and both offline renders
// consume that program and nothing else; the program digest
// (`tools/program.ts`) is it, written down.
//
// It was a mutator until round D of PLAN-V1-NEXT: `develop(track)` wrote the
// stage's decisions back onto the plan's own events and marked the track
// `developed` so a second pass would not compound them, and every consumer
// read the plan afterwards. The record it produced has not moved by a bit —
// the arithmetic below is that arithmetic, in the order it was in — but a plan
// is now a value two decks, a render and a page can hold at once without
// arranging not to be in each other's way, which is the same sentence round C
// wrote about the settings. The idempotence flag and the pristine parameters
// it guarded (`track.developed`, `ev.p0`) are gone with it: compiling twice is
// compiling twice.
//
// The bulk of the file is the part that decides, and it reads as it always
// did:
//
// The sound stage, in two priorities. Audio only: this file never moves a
// note, a time or a length — it reads the plan that already exists and decides
// what the desk does with it.
//
// Eugene, listening to thirteen ranges of the first build: "we sometimes get
// into the trap of repeating nearly the same segment for 30 s, where if the
// bass or drum signature changes it is barely audible while the pads blast the
// same two chords in the foreground." Seven of the thirteen marks say the same
// thing in different words — "pads are too repetitive", "same two chords like
// 16 times already", "repetitive stuff should be on the back, and an accent in
// front to keep engagement".
//
// Deep house is repetitive by nature; the reference sets loop 2 to 8 bars and
// hold a key for five minutes. So the answer is not more harmony. It is that
// the mix has to know what is moving:
//
//   first priority   whatever changed most recently — a new bass variation, a
//                    new stab figure, a lead entering, a section change. It is
//                    mixed to the front: a little louder, a little drier, a
//                    little brighter.
//   second priority  whatever has not changed for more than eight bars. It
//                    recedes, and it is kept interesting with the things a DJ
//                    does to a loop that is holding — a filter rising over
//                    sixteen bars and released at the phrase line, a phaser, a
//                    width breath, a delay throw, a bar of silence before the
//                    boundary — rather than with level alone.
//
// Change is read off the plan's own events, not guessed: a four-bar block is
// "new" when its figure has not been heard in the last sixteen bars. That is
// why the bass, whose variation is re-rolled every four bars, keeps taking the
// front, and the pad, which is two chords going round, keeps giving it up.
//
// Novelty alone turned out not to be enough, and Eugene's next three marks say
// where: "strings are nice touches but still hard to hear behind drone chords,
// that said this mix is great aesthetically" (-1), "touch notes hard to hear"
// (-1), and then +2 and "great move!" on two windows of the same theme playing
// the same figures. The difference between the window he marked -1 and the one
// he marked +2 was not the notes and it was barely the level: in both, a piano
// melody of three onsets in four bars ran over a strings pad holding two
// chords. In the +2 window the piano was the front, at 1.14x its own lowpass;
// in the -1 window the *bass* had varied more recently, took the front, and
// sent the piano to the back of the stage with `lpClose` on it — half its own
// corner, an octave of brightness off a melody, to keep a loop interesting
// that was not the loop. So two rules stand beside novelty, and both of them
// read the figure rather than its history:
//
//   the harmony and the bottom are two stages. The bass plays an octave and a
//   half under the chords and cannot take their place, so which harmonic layer
//   is at the front of the harmony is asked of the harmonic layers alone. The
//   bass still takes the record's accent and still says it in its own tone.
//
//   the layer that plays notes takes the front from the layer that holds one.
//   `figures` reads two numbers off the plan — how long a layer's notes are
//   against a bar, and how many times a bar it strikes — so a touch is in
//   front of a drone whatever the ages say, and the sparse figure is in front
//   of the busy one. A drone's chord moving every eight bars reads as "new" to
//   a four-bar fingerprint, and it used to step in front of the figure that
//   was actually being played. The drone's own step forward is reserved for
//   the bars where nothing is playing over it, which is to say it no longer
//   has one.
//
//   and where a level cannot help, because the two are in the same octave, the
//   drone at the back makes room: one gentle bell, on it alone, where the tune
//   in front of it is playing.
//
// And nothing is put behind nothing: a layer recedes only while another layer
// of its own kind is in front of it — but a drone holding alone is still
// background, and the rhythm section is still the foreground. Eugene, on the
// first build of that rule, twice at -3: "drone chords are dominating above
// all absolutely", on a minimal growl room with an organ pad and nothing over
// it but a kick, a hat line and three bass notes a bar. He was right and the
// first draft of this was wrong: it let a lone pad stand at its own level and
// in its own tone, which is +3.2 dB and an octave of brightness over where the
// stage had it, and in a room with nothing else in the middle the drone simply
// became the record.
//
// And a minimal room does not wait. The stage is otherwise flat for the first
// eight bars of every section — nothing is moved while everything is still
// moving by itself — but that is the rule that left Eugene's *other* -3 where
// it was: bars 9 to 12 of the same theme, the first four bars of its main
// groove, with the organ pad at its own preset level because nothing had yet
// held long enough to be moved anywhere. In a room the density die called
// minimal there is nothing to wait for: the kick, the hats and a few bass
// notes a bar are the foreground from bar one, and the drone is background
// from bar one. So in a minimal room a holding pad opens at the back, with the
// back's colour and the rota and the same lift, on the first bar of every
// section. Every other layer, and every medium or busy room, waits as before.
//
// So `hold` is the back — the same level, the same colour, the same rota — and
// it only steps toward the layer's own level where the arrangement underneath
// it has actually thinned: a bar with no kick, which is a breakdown or a
// dropout and is where the rhythm section is not the foreground because it is
// not there; or a whole phrase with nothing but drums under it, and then only
// if the density die said medium or busy, because a minimal room cannot carry
// a drone at the front whatever else is missing. What `hold` is *for* is the
// other half of the second mark — the pad of seed 99895's third theme was at
// `backMid` and not `back` through its breakdown, 1.44 dB down and darker and
// wetter, for standing behind a `keys` layer that plays no notes at all. With
// no kick in those bars the lift applies and the only harmonic layer in the
// record comes up to its own level; with a kick under it, it does not.
//
// Nothing here is in the golden snapshot, because nothing here runs until a
// plan becomes sound: the compiler is called by the scheduler and by the mix's
// deck builder, never by `generate()` or by `planTheme()`.

import Rng from './rng.ts';
import { dbToGain } from '@deep-house/engine/dsp';
import { BY_NAME, VOICE_BUS, VOICE_LEVEL } from '@deep-house/engine/voices';
import type { Settings } from '@deep-house/engine/settings';
// The shapes this file produces, and the one piece of arithmetic that went with
// them: since round W of PLAN-V1-NEXT the *contract* — what an event, an
// automation line, a sidechain point and a whole program are — belongs to the
// machine that plays them, and only the rules that decide their numbers are
// here. The sidechain's shape is a function of the room and of the beat a graph
// is running on, both of which are the engine's, so `duckShape` went with it.
import { duckShape, duckAt } from '@deep-house/engine/program';
import { settingsOf } from '@deep-house/engine/settings';
import { laneLevelDb } from './lane-level.ts';
import type {
  AutomationLine, AutomationPoint, CurvePoint, Program, ProgramEvent, SeamPlan,
} from '@deep-house/engine/program';
import type { Descriptor, NoteParams } from '@deep-house/engine/voices';
import type { Style } from '@deep-house/engine/style';
import { sectionAtBar, phraseGrid, setGrid } from './arrangement.ts';
import type { Arrangement, PhraseGrid } from './arrangement.ts';
import { switchOn } from './lanes.ts';

// --- what a plan is ---------------------------------------------------------
//
// The other half of the contract the head of this file describes: the engine
// states what a *program* is (`@deep-house/engine/program`) and this states
// what a **plan** is, because a plan is the composer's and the machine never
// sees one. `generate()` writes it, `planTheme()` adds the set's own fields to
// it, and everything below reads it and writes to none of it.

/**
 * One event of a plan, in the order the generator wrote it. `t` is the
 * arrival; `p` is the voice's own parameter object, which is open for the
 * reason `program.ts` and the voice descriptor both write down — it belongs to
 * the one instrument that wrote it and the one that reads it.
 */
export interface PlanEvent {
  part?: string;
  treatment?: 'none';
  /** Explicit articulation separates a struck decay from a held drone. */
  articulation?: 'struck';
  role?: 'texture';
  t: number;
  voice: string;
  layer: string;
  p: NoteParams;
  /** the bar and the step it was written on, where it was written on a grid */
  bar?: number | null;
  step?: number | null;
  /** the note's name, where the plan wrote one down for a readout */
  note?: string;
  /**
   * **Nothing writes this.** The pristine parameters were kept here while the
   * stage was a mutator; round D of PLAN-V1-NEXT removed both (see the head of
   * this file). `figures` below still reads it, so the field is declared where
   * the read is rather than the read being quietly deleted.
   */
  p0?: NoteParams;
}

/** One bar of a plan's timeline: where it sits, and what is playing over it. */
export interface TimelineRow {
  bar: number;
  t: number;
  /** the section's label, which is what a listener is shown */
  section: string;
  sectionIndex: number;
  phrase: number;
  chord: string;
  roman: string;
  /** the arrangement layers this bar switches on */
  layers: string[];
}

/** The curves a plan writes, in theme seconds. */
export interface PlanAutomation {
  macroFilter?: CurvePoint[];
  melodicGain?: CurvePoint[];
  push?: CurvePoint[];
  /** the melodic bus's section sweeps, by stage (house-v2's `busSweeps`, `src/sweep.ts`) */
  sweep?: { hp: { cutoff: CurvePoint[]; wet: CurvePoint[] } | null; lp: { cutoff: CurvePoint[]; wet: CurvePoint[] } | null };
}

/**
 * **A planned theme**: what `generate()` hands back and what this compiler is
 * given. Every field below is read by something in this file; a plan carries
 * more — the key, the progression, the dice's own readouts, the room's
 * overrides — and what a plan carries is the composer's business and not the
 * compiler's, which is why they are not written out here.
 */
export interface PlannedTheme {
  seed: string | number;
  /** the music it was planned in; the compiler never learns its name */
  style: Style;
  bpm: number;
  beat: number;
  barSeconds: number;
  bars: number;
  duration: number;
  preset: string;
  arrangement: Arrangement;
  timeline: TimelineRow[];
  events: PlanEvent[];
  automation?: PlanAutomation;
  /** every die, written down; the stage reads the density and the pad's timbre */
  dice?: { density: string; padTimbre: string; [die: string]: unknown };
  /** what `planTheme` adds once a set has had its say */
  index?: number | null;
  trimDb?: number;
  blendBars?: number | null;
  filterMove?: string | null;
  /**
   * **What the spell asked of each drawn voice's own ranges**, by event name
   * (PLAN-MODULATION M1). A parameter of the program, worked out once per theme
   * by `generate` and written onto the notes below — the same line a treatment's
   * settings are on, and for the same reason K5b wrote down: a setting that
   * moved inside a theme would be a decision nobody could hear as a decision.
   * Absent at the house and absent under the record, which carries no switch.
   */
  knobs?: Record<string, Record<string, number>>;
  /** a row's lean on the stage's palette, one weight a row of it (S18); absent at the house */
  treatmentWeights?: number[];
}

// Every number the stage applies is the **style's**, since round F of
// PLAN-V1-NEXT: the grid the foreground is assigned on, how long a loop may be
// new for, what tells a drone from a figure, how far and how fast a layer
// moves, the colour of the front and of the back, the treatments and their
// rota, the bell that makes room for the tune and the make-up that pays for
// it, and which room does not wait. They were eighteen `const`s here with
// their measurements beside them and they are `style.stage` now, with the same
// comments; what is left in this file is the arithmetic that applies them and
// the reasoning above, which is what the arithmetic is for.
//
// The stage is handed a style — through `compilePerformance`'s options, or off
// the plan it is compiling, which carries the style it was planned in — and
// this file never learns one's name.

/**
 * One row of the stage's placement table: a treatment, its weight, the lanes it
 * may be drawn on and the moments it may be drawn at. `paletteOf` below spells
 * the record's two lists out into these.
 */
export interface PaletteRow {
  id: string;
  w: number;
  lanes: readonly string[];
  moments: readonly string[];
}

/**
 * The style's `stage` block as this file reads it: what the machine states a
 * stage is (`@deep-house/engine/style`'s `StageRules`), plus the placement
 * table a style may state **instead of** the two lists that are its shorthand.
 */
type StageBlock = Style['stage'] & { palette?: readonly PaletteRow[] };

/** The rota's own numbers: how long a segment is, and what each roll's range is. */
interface RotaRules {
  shortChance: number;
  shortBars: number;
  longBars: number;
  rate: number[];
  phase: number[];
  stages: number[];
  depth: number[];
  mix: number[];
  amount: number[];
}

const db = (x: number): number => Math.pow(10, x / 20);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Rises over the first part of a segment and is released over the rest of it —
// which is the phrase boundary, and which is where a DJ lets the filter go.
function riseRelease(u: number, G: StageBlock): number {
  const t = clamp(u, 0, 1);
  return t < G.releaseAt ? t / G.releaseAt : Math.max(0, 1 - (t - G.releaseAt) / G.releaseOver);
}

// --- what changed, and when ------------------------------------------------

// One four-bar block of a layer, as a string. Pitches are relative, so the
// same figure under a different chord is the same figure; velocities are left
// out, because a velocity wobble is not a change.
function blockPrint(track: PlannedTheme, layer: string, block: number, G: StageBlock): string {
  const b0 = block * G.block;
  if (layer === 'pad') {
    // The pad's figure is the chords it is holding, not the notes it happens
    // to restrike: two chords going round are one block, every time round.
    const out = [];
    for (let b = b0; b < b0 + G.block; b++) out.push(track.timeline[b] ? track.timeline[b].chord : '-');
    return out.join(',');
  }
  // The union of the steps the figure fires on across the block and the
  // intervals it spans — not the per-bar list. A figure is thinned by its own
  // dice bar by bar, and a thinning is not a change; four bars of the same
  // four stabs have to read as four bars of the same four stabs.
  const steps = new Set<number>();
  const midis: number[] = [];
  for (const e of track.events) {
    if (e.layer !== layer || e.bar == null) continue;
    if (e.bar < b0 || e.bar >= b0 + G.block) continue;
    steps.add(e.step!);
    if (e.p && typeof e.p.midi === 'number') midis.push(e.p.midi);
  }
  if (!steps.size) return 'ø';
  const base = midis.length ? Math.min(...midis) : 0;
  return (
    [...steps].sort((a, b) => a - b).join(' ') +
    '|' +
    [...new Set(midis.map((m) => m - base))].sort((a, b) => a - b).join(',')
  );
}

/**
 * What a layer's figure is over one four-bar block, as the two rules that
 * stand beside novelty read it.
 */
export interface Figure {
  /** Every note in this block explicitly declares a struck articulation. */
  struck?: true;
  /** whether the layer fires at all in this block */
  sounds: boolean;
  /** the median length of a note against a bar */
  hold: number;
  /** how many times a bar it is struck */
  onsets: number;
  /** the median fundamental it is playing, where it plays pitches */
  hz: number | null;
}

// Every layer's figure, block by block, in one pass over the event list: the
// median length of a note against a bar (`hold`), how many times a bar it is
// struck (`onsets`), and the median fundamental it is playing (`hz`). Notes
// struck together are one onset, because a five-note chord is one thing
// arriving and not five.
//
// `hold` and `onsets` are properties of the figure and not of its history,
// which is the point: they are what settle an argument novelty gets wrong.
// `hz` is the middle of the tune and deliberately not `brightnessHz` from
// TIMBRES, which says where a voice *stops* — 3450 Hz for a piano, nowhere
// near where its notes live.
//
// They read `p0` where there is one, so a second pass over a developed track
// measures the notes the plan wrote and not the ones the stage last shortened.
function figures(
  track: PlannedTheme,
  layers: readonly string[],
  barSeconds: number,
  G: StageBlock
): Record<string, Figure[]> {
  const blocks = Math.ceil(track.bars / G.block);
  const bins: Record<string, Array<{ onsets: Map<number, number>; midis: number[]; struck: boolean }>> = {};
  for (const l of layers) bins[l] = Array.from({ length: blocks }, () => ({ onsets: new Map(), midis: [], struck: true }));
  for (const e of track.events) {
    const bin = bins[e.layer];
    if (!bin || e.bar == null) continue;
    const block = Math.floor(e.bar / G.block);
    if (block < 0 || block >= blocks) continue;
    const p = e.p0 || e.p || {};
    const key = Math.round(e.t * 1000);
    const dur = Math.max(0, p.dur ?? barSeconds * 0.25);
    bin[block].struck &&= e.articulation === 'struck';
    bin[block].onsets.set(key, Math.max(bin[block].onsets.get(key) ?? 0, dur));
    if (typeof p.midi === 'number') bin[block].midis.push(p.midi);
  }
  const out: Record<string, Figure[]> = {};
  for (const l of layers) {
    out[l] = bins[l].map(({ onsets, midis, struck }) => {
      if (!onsets.size) return { sounds: false, hold: 0, onsets: 0, hz: null };
      const durs = [...onsets.values()].sort((a, b) => a - b);
      midis.sort((a, b) => a - b);
      return {
        sounds: true,
        ...(struck ? { struck: true as const } : {}),
        hold: durs[Math.floor(durs.length / 2)] / barSeconds,
        onsets: onsets.size / G.block,
        hz: midis.length ? 440 * Math.pow(2, (midis[Math.floor(midis.length / 2)] - 69) / 12) : null,
      };
    });
  }
  return out;
}

// Bars since each layer last played something it had not played in the last
// sixteen. A section boundary wipes the memory: a new section is a change
// whatever it plays.
function ages(track: PlannedTheme, layers: readonly string[], G: StageBlock): Record<string, number[]> {
  const blocks = Math.ceil(track.bars / G.block);
  const out: Record<string, number[]> = {};
  for (const layer of layers) {
    const seen = new Map<string, number>();
    const age: number[] = new Array(track.bars).fill(0);
    let lastChange = 0;
    let section: number | null = null;
    for (let block = 0; block < blocks; block++) {
      const b0 = block * G.block;
      const row = track.timeline[b0];
      const sec: number | null = row ? row.sectionIndex : section;
      if (sec !== section) {
        seen.clear();
        lastChange = b0;
        section = sec;
      }
      const print = blockPrint(track, layer, block, G);
      const before = seen.get(print);
      if (before === undefined || block - before > G.window) lastChange = b0;
      seen.set(print, block);
      for (let b = b0; b < Math.min(track.bars, b0 + G.block); b++) age[b] = b - lastChange;
    }
    out[layer] = age;
  }
  return out;
}

// --- the treatment rota ----------------------------------------------------

// What a lane may be given at a moment: the style's palette, filtered twice and
// read for its weight.
//
// Round K5b. Before it, the pool was `stage.treatments` less the pad-only ones,
// drawn uniformly; now it is the palette's rows placed on this lane and at this
// moment, drawn by weight. **house-v1 takes the identical stream through it**,
// because its palette is its own six rows at weight 1 on every moment and
// `Rng.pickWeighted` at an equal weight is `pick` bit for bit — which is what
// `pool[r.int(0, pool.length)]` was. The golden and the program digests are the
// proof, on fourteen themes and every treatment segment in them.
//
// A lane and a moment the palette places nothing at is an **empty pool**, and
// an empty pool is a segment with no treatment on it. That is not a hole in the
// table: it is the desk left alone in a moment nobody wrote a move for, which
// under house-v2 is the intro of every theme. `treatAt` of a segment whose kind
// is null is the table of ones it already returns for a kind it does not know.
/**
 * The stage's placement table, however the style states it.
 *
 * A style states it **as rows** — an id, a weight, the lanes it may be drawn on
 * and the moments it may be drawn at — and house-v2's `palette` is thirty-two
 * of them. The record states the same thing as the two lists it has always
 * stated it as: `treatments`, uniformly, on both harmonic lanes at every bar of
 * every section, less `padOnlyTreatments` on the rhythmic one. So the two lists
 * are a **shorthand**, and this is where the shorthand is spelled out: six rows
 * at weight 1 on every moment, which `Rng.pickWeighted` draws exactly as `pick`
 * drew them, bit for bit at every boundary. The golden and the program digests
 * are the proof and not this paragraph.
 */
const ALL_MOMENTS = ['intro', 'build', 'main', 'breakdown', 'drop', 'outro', 'seam'];
const paletteOf = (G: StageBlock): readonly PaletteRow[] => G.palette || G.treatments.map((id: string) => ({
  id,
  w: 1,
  lanes: G.padOnlyTreatments.includes(id) ? ['pad'] : ['pad', 'keys'],
  moments: ALL_MOMENTS,
}));

const poolAt = (palette: readonly PaletteRow[], lane: string, moment: string, last: string | null): PaletteRow[] =>
  palette.filter((row) => row.w > 0
    && row.id !== last
    && row.lanes.includes(lane)
    && row.moments.includes(moment));

/**
 * One segment of a lane's rota: which treatment it is, over which bars, and the
 * six settings rolled for it once.
 */
export interface TreatmentSegment {
  start: number;
  len: number;
  /** the treatment drawn, or `null` where the palette places nothing here */
  kind: string | null;
  rate: number;
  phase: number;
  stages: number;
  depth: number;
  mix: number;
  amount: number;
}

// A layer's whole track of treatments, laid out ahead: segments of eight or
// sixteen bars, each a different one from the last, each with its own settings
// rolled from the theme's seed so two themes never phase the same way.
//
// `momentAt` is handed in rather than looked up, because a section is the
// composer's word for a bar and this function knows about bars.
function rota(
  seedTag: string,
  bars: number,
  lane: string,
  palette: readonly PaletteRow[],
  R: RotaRules,
  momentAt: (bar: number) => string
): TreatmentSegment[] {
  const r = new Rng(seedTag);
  const segments: TreatmentSegment[] = [];
  let bar = 0;
  let last = null;
  while (bar < bars) {
    const len = r.chance(R.shortChance) ? R.shortBars : R.longBars;
    const pool = poolAt(palette, lane, momentAt(bar), last);
    // The draw is made only when there is something to draw: a call that is not
    // made takes nothing off the stream, which is what keeps the six settings
    // below on the numbers the record rolled them at.
    const kind = pool.length ? r.pickWeighted(pool, (row) => row.w)!.id : null;
    segments.push({
      start: bar,
      len,
      kind,
      // Every treatment's own settings, rolled once per segment, in the order
      // the style writes them: the stream is the theme's own, so the order of
      // these six rolls is as locked as their ranges are.
      rate: r.float(R.rate[0], R.rate[1]),
      phase: r.float(R.phase[0], R.phase[1]),
      stages: r.int(R.stages[0], R.stages[1]),
      depth: r.float(R.depth[0], R.depth[1]),
      mix: r.float(R.mix[0], R.mix[1]),
      amount: r.float(R.amount[0], R.amount[1]),
    });
    last = kind;
    bar += len;
  }
  return segments;
}

function segmentAt(segments: TreatmentSegment[], bar: number): TreatmentSegment | null {
  for (const s of segments) if (bar >= s.start && bar < s.start + s.len) return s;
  return segments[segments.length - 1] || null;
}

// The rota's own six settings, written onto whichever knobs an effect instance
// declares **by those names**, and onto nothing else.
//
// It is a join on the names and not a table per effect, which is the whole
// reason a kitchen of twenty-six can be drawn by a rota that rolls six numbers:
// a rate is a rate and a depth is a depth, the descriptor says what range each
// may take, and `clampParam` at the far end is the only thing that decides what
// a number out of range becomes. A knob no roll is named for keeps its own
// declared default, which is the value the round that built it measured.
//
// **One of them is in different units on the two sides and is converted here.**
// The rota rolls `phase` over `[0, 2pi]`, because the gesture that reads it
// feeds it to a cosine; every effect in the kitchen declares `phase` as a
// **ratio of a cycle**, `0..1`, because that is the one unit a phase can be
// stated in without naming a trigonometric function. Written across raw, a
// phase of anything over 1 radian clamps to 1 — which is most of the range and
// is the same phase every time, so a number rolled per segment to keep two
// themes from phasing alike would have been a constant. Dividing by `2pi` is
// the conversion and not a taste, and it is the only one: every other roll is
// already in the units its knob declares.
const ROTA_KNOBS: Record<'rate' | 'depth' | 'stages' | 'phase', string> =
  { rate: 'rateHz', depth: 'depth', stages: 'stages', phase: 'phase' };
const ROTA_SCALE: Record<string, number> = { phase: 1 / (Math.PI * 2) };

/** The phaser's own settings, as the one gesture that carries a whole shape. */
export interface PhaserSettings {
  stages: number;
  rate: number;
  depth: number;
  mix: number;
  phase: number;
  center: number;
}

/**
 * What a treatment is doing at one bar: a multiplier on each of the things the
 * voice would otherwise have done, and the two shapes — the gesture's phaser
 * and an effect instance out of the kitchen — that are more than a number.
 */
export interface Treat {
  lpMul: number;
  hpMul: number;
  spreadMul: number;
  delayMul: number;
  levelDb: number;
  phaser: PhaserSettings | null;
  fx: { id: string; params: Record<string, number> } | null;
}

// What a treatment is doing at a (possibly fractional) bar. Everything is a
// multiplier on what the voice would otherwise have done, so an absent
// treatment is a table of ones.
function treatAt(seg: TreatmentSegment | null, bar: number, G: StageBlock, phraseAt: PhraseGrid = setGrid): Treat {
  const flat: Treat = { lpMul: 1, hpMul: 1, spreadMul: 1, delayMul: 1, levelDb: 0, phaser: null, fx: null };
  if (!seg || !seg.kind) return flat;
  const T = G.treatment;
  const u = (bar - seg.start) / seg.len;
  const k = riseRelease(u, G) * seg.amount;
  // An effect instance out of the kitchen: round K1 §6's other half — *what the
  // desk does is a gesture, what the desk has on it is an effect* — and this is
  // the desk putting one on. The segment's `amount` is the rota's own sense of
  // how far a move goes, and on an instance it is what the **wet** is scaled
  // by, so a treatment at three quarters is three quarters of an effect and not
  // three quarters of an effect somewhere else.
  if (seg.kind.startsWith('fx:')) {
    const params: Record<string, number> = { mix: seg.mix * seg.amount };
    const rolls = Object.entries(ROTA_KNOBS) as Array<[keyof typeof ROTA_KNOBS, string]>;
    for (const [roll, knob] of rolls) params[knob] = seg[roll] * (ROTA_SCALE[roll] ?? 1);
    return { ...flat, fx: { id: seg.kind.slice(3), params } };
  }
  switch (seg.kind) {
    case 'hpRise':
      // The classic: the bottom leaves the loop over its segment and comes back
      // at the phrase line.
      return { ...flat, hpMul: 1 + T.hpRise.hpMul * k, levelDb: T.hpRise.levelDb * k };
    case 'lpClose':
      return { ...flat, lpMul: Math.pow(2, T.lpClose.octaves * k) };
    case 'phaser':
      return {
        ...flat,
        phaser: {
          stages: seg.stages,
          rate: seg.rate,
          depth: seg.depth,
          mix: seg.mix,
          phase: seg.phase + ((bar - seg.start) / seg.len) * Math.PI,
          center: T.phaser.center,
        },
      };
    case 'breath': {
      // Not a sweep with a destination: a slow undulation, the width and the
      // tone breathing together.
      const a = (Math.PI * 2 * (bar - seg.start)) / T.breath.cycleBars + seg.phase;
      return {
        ...flat,
        lpMul: Math.pow(2, T.breath.octaves * seg.amount * Math.sin(a)),
        spreadMul: 1 + T.breath.spread * seg.amount * Math.sin(a + Math.PI / 2),
      };
    }
    case 'throw': {
      // Plain until the last bar of the phrase, and then thrown into the
      // dotted-eighth delay on the way over the line.
      const last = Math.floor(bar) === phraseAt(Math.floor(bar), T.throw.everyBars).end - 1;
      return last ? { ...flat, delayMul: T.throw.delayMul, levelDb: T.throw.levelDb } : flat;
    }
    default:
      return flat;
  }
}

// --- the stage -------------------------------------------------------------

/**
 * The phrase grid the stage counts its per-phrase moves on — the lift's
 * phrase, the throw, the bass's opening, the pad's doubled top, a voice's
 * phrase colour and the pad's hole: the set's line, unless the style counts
 * from each section's start and the theme has a grid (`phraseGrid`, R16 of the
 * reconciled review of 09-24).
 */
function phrasesOf(track: PlannedTheme, style: Style): PhraseGrid {
  if (!track.arrangement || !track.arrangement.sections.length) return setGrid;
  const kick = style.lanes.find((l) => l.role === 'kick');
  return phraseGrid(track.arrangement, switchOn(style, 'sectionPhrases'), kick?.gate ?? undefined);
}

// The three lanes the stage moves, and the two of them that are the harmony.
//
// The *membership* is the registry's: every registered voice the stage is
// allowed to touch (`treat: true`), by the layer its events carry, which is
// bass, keys and pad. The *order* is this file's own and has to stay written
// here, because it is a tie-break and not a list: `live` below is read in the
// order a tie is settled in — the rhythmic role, then the bottom, then the
// drone — and the front of the record would move if it were sorted any other
// way. So the two are separated: `tools/check.ts` holds these arrays to being
// exactly the treatable layers, and the order beside them is a decision.
const LAYERS = ['pad', 'keys', 'bass'];
const HARMONIC = ['pad', 'keys'];
export const STAGE_LAYERS = LAYERS;
export const STAGE_HARMONIC = HARMONIC;

/**
 * **One bar of the stage's decisions**, which is a row of the program's
 * `development`. The machine carries these and reads none of them: what a row
 * is stays the composer's to say, which is what `Program.development` being a
 * list of `unknown` says from the other side.
 */
export interface StageRow {
  bar: number;
  /** the section's label, for the readout */
  section: string;
  /** whether the stage has taken a view in this bar at all */
  engaged: boolean;
  /** the record's accent, and the front of the harmony, by layer */
  front: string | null;
  lead: string | null;
  /** where the tune is, for whatever is standing behind it */
  leadHz: number | null;
  /** front, mid, hold, backMid or back, by layer */
  role: Record<string, string>;
  /** whether the arrangement has thinned under a layer that is holding */
  lift: number;
  age: Record<string, number>;
  figure: Record<string, Figure>;
  level: Record<string, number>;
  /** what is on each harmonic lane, by name, and the segment it came from */
  treat: Record<string, string | null>;
  seg: Record<string, TreatmentSegment | null>;
}

/**
 * The stage's decisions, bar by bar: who is at the front, who has receded, how
 * far, and what treatment is on them.
 * @param track a planned theme
 * @param style the music it is being played as — every number below is its
 *   `stage` block; this file holds none of them
 */
export function stage(track: PlannedTheme, style: Style = track.style): StageRow[] {
  // Background punctuation has its own level and return. Sharing an instrument
  // with a foreground figure must not change that figure's stage assignment.
  if (track.events.some(e => e.role === 'texture')) return stage({ ...track, events: track.events.filter(e => e.role !== 'texture') }, style);
  const G: StageBlock = style.stage;
  const phraseAt = phrasesOf(track, style);
  const bars = track.bars;
  const rows: StageRow[] = [];
  const barSeconds = track.barSeconds || 2.3;
  const blocks = Math.ceil(bars / G.block);
  // A layer is on the stage in a block when the timeline lists it *and* its
  // figure fires there. A role the arrangement names and the generator leaves
  // empty used to take a place on the stage all the same: in seed 99895's
  // third theme the keys are listed through the breakdown and play nothing in
  // it, and the pad — the only harmonic layer in the record — was put behind
  // them for it.
  const present: Record<string, boolean[]> = { pad: [], keys: [], bass: [] };
  const fig: Record<string, Figure[]> = { pad: [], keys: [], bass: [] };
  const byBlock = figures(track, LAYERS, barSeconds, G);
  for (const l of LAYERS) {
    for (let block = 0; block < blocks; block++) {
      const f = byBlock[l][block];
      for (let b = block * G.block; b < Math.min(bars, (block + 1) * G.block); b++) {
        const row = track.timeline[b];
        present[l][b] = !!(row && row.layers.includes(l)) && f.sounds;
        fig[l][b] = f;
      }
    }
  }
  const age = ages(track, ['pad', 'keys', 'bass'], G);

  // Whether a lone drone may come forward in this bar. Nothing but drums under
  // it for the phrase is read over the eight bars the phrase is, not over this
  // one, so a bass that rests for a bar is not a thinning.
  const density = track.dice && track.dice.density;
  const thick = G.liftDensity.includes(density!);
  const openAtBack = density === G.openAtBackDensity;
  const lift: number[] = [];
  for (let b = 0; b < bars; b++) {
    const row = track.timeline[b];
    const on = row ? row.layers : [];
    let bassInPhrase = false;
    const phrase = phraseAt(b);
    for (let k = phrase.start; k < Math.min(bars, phrase.end); k++) {
      const r = track.timeline[k];
      if (r && r.layers.includes('bass')) { bassInPhrase = true; break; }
    }
    lift[b] = !on.includes('kick') || (!bassInPhrase && thick) ? 1 : 0;
  }

  const seed = track.seed ?? 1;
  // Which section a bar is in, which is what the palette's `moments` column is
  // asked against.
  //
  // It is the section's **kind** and never its label: the timeline carries
  // `main groove`, which is what a listener is shown, and the grammar's own
  // vocabulary is `main`, which is what a table may name. The two are one word
  // apart and confusing them is a pool that is always empty.
  //
  // A bar off the end of the last section is that last section, because a rota
  // lays its segments out ahead and the final one may overhang the theme.
  const momentAt = (b: number): string =>
    track.arrangement.sections.length ? sectionAtBar(track.arrangement, b).kind : 'main';
  // A hole in the rhythmic layer is a hole in the groove; the pad is the only
  // layer allowed to disappear for a bar, which the placement table says by
  // putting the hole on the pad lane and on no other.
  // A row's `wants.stage.treatments`, leaned on the catalogue's rota by the
  // interpreter, weighs the palette row for row (S18). Only a palette that is
  // the rota row for row is weighed; the record's shorthand has no rota.
  const leaned = track.treatmentWeights;
  const placement = leaned && G.palette && leaned.length === G.palette.length
    ? paletteOf(G).map((row, i) => (leaned[i] === 1 ? row : { ...row, w: row.w * leaned[i] }))
    : paletteOf(G);
  // The rota's ranges are the style's own, under the names `rota` reads them by.
  const R = G.rota as RotaRules;
  const rotas: Record<string, TreatmentSegment[]> = {
    pad: rota(`${seed}::treat:pad`, bars, 'pad', placement, R, momentAt),
    keys: rota(`${seed}::treat:keys`, bars, 'keys', placement, R, momentAt),
  };

  // The target level of each layer, bar by bar, before smoothing.
  const target: Record<string, number[]> = { pad: [], keys: [], bass: [] };
  const roleAt: Array<{ engaged: boolean; front: string | null; lead: string | null; role: Record<string, string> }> = [];
  for (let b = 0; b < bars; b++) {
    const live = ['keys', 'bass', 'pad'].filter((l) => present[l][b]);
    // Nothing is moved while everything is still moving by itself: for the
    // first eight bars of every section the stage is flat, which is also why
    // the reference render of seed 1's first eight bars does not budge.
    const engaged = live.some((l) => age[l][b] >= G.staleBars);
    let front: string | null = null;
    let lead: string | null = null;
    const role: Record<string, string> = {};
    if (engaged && live.length) {
      // The record's accent: the most recent change, as ever. A tie goes to
      // the rhythmic role and then to the bass, because those are the two a
      // listener reads as an accent. This is what the bass's own tone follows.
      let best: string | null = null;
      for (const l of live) if (best === null || age[l][b] < age[best][b]) best = l;
      front = best;

      // The front of the *harmony* is a second question, asked of the harmonic
      // layers alone: a bass variation is an accent in the bottom octave and a
      // half and it has never been able to take the place of the tune. Three
      // answers, and every one of them is stated:
      //
      //   nothing is holding — novelty decides, exactly as it always did.
      //   something holds and something else does not — the one that plays
      //     notes leads, however recently the drone's chord moved, and the
      //     sparse figure leads over a busy one because two notes a bar is
      //     what a listener reads as an accent.
      //   everything holds — there is no harmonic front at all, because a pad
      //     stepping forward to blast two chords is the fault this whole file
      //     was written to answer.
      const harmonic = HARMONIC.filter((l) => live.includes(l));
      const drones = harmonic.filter((l) => !fig[l][b].struck && fig[l][b].hold >= G.holdBar);
      const moving = harmonic.filter((l) => fig[l][b].struck || fig[l][b].hold < G.holdBar);
      const touches = moving.filter((l) => fig[l][b].onsets <= G.touchOnsets);
      const pool = !drones.length ? harmonic : touches.length ? touches : moving;
      for (const l of pool) if (lead === null || age[l][b] < age[lead][b]) lead = l;

      // The stage is a gradient, not a cliff: the stalest layer goes all the
      // way to the back, and anything else that is holding sits between. Two
      // harmonic layers both dropped five dB is a mix with a hole where its
      // middle was, and the corpus says the middle is where this music lives.
      //
      // And nothing is put behind nothing: only a layer with one of its own
      // kind in front of it recedes. How long it has been holding still decides
      // *when* it recedes — a chord that has genuinely just moved is worth a
      // phrase at its own level before the desk takes it back — and what the
      // space rule above changed is only that the drone can no longer answer
      // that phrase by stepping in front of the tune.
      const behind = lead
        ? harmonic.filter((l) => l !== lead && age[l][b] > G.staleBars).sort((a, c) => age[c][b] - age[a][b])
        : [];
      for (const l of live) role[l] = l === lead || (l === 'bass' && front === 'bass') ? 'front' : 'mid';
      behind.forEach((l, i) => {
        role[l] = i === 0 ? 'back' : 'backMid';
      });
      // A harmonic layer that is holding with nothing in front of it is not
      // background and is not an accent either: it stands where it is, at its
      // own level and in its own tone, and the rota is what keeps it moving.
      for (const l of harmonic) if (role[l] === 'mid' && age[l][b] > G.staleBars) role[l] = 'hold';
    }
    // Explicit ringing notes keep their articulation even across a whole bar.
    // Make space around them from their entrance, including the first phrase:
    // a newly changed drone is still a drone. This is only a harmonic priority;
    // the rhythm section keeps its existing novelty, level and treatment rules.
    const struck = HARMONIC.filter(l => present[l][b] && fig[l][b].struck);
    const held = HARMONIC.filter(l => present[l][b] && !fig[l][b].struck && fig[l][b].hold >= G.holdBar);
    if (struck.length && held.length) {
      lead = struck.reduce((best, l) => age[l][b] < age[best][b] ? l : best);
      role[lead] = 'front';
      for (const l of held) role[l] = 'back';
    }
    // The minimal room's one exception to waiting, and it has to be written
    // outside the branch above as well as inside it: a drone that is not
    // leading is at the back in such a room whatever the ages say, whether the
    // stage has taken a view yet or not. Inside the branch it is the bar the
    // stage engages on, where the pad's age is exactly the phrase and the test
    // above wants more than one; outside it, it is the first eight bars of
    // every section.
    if (openAtBack && present.pad[b] && fig.pad[b].hold >= G.holdBar && (role.pad === 'mid' || role.pad === undefined))
      role.pad = 'hold';
    for (const l of ['pad', 'keys', 'bass']) {
      const r = role[l];
      // `hold` is the back until the arrangement thins under it, and then it
      // travels to the layer's own level. One number carries both, so the
      // hand-over ramp below shapes a lift exactly as it shapes a hand-over.
      const share = r === 'hold' ? 1 - lift[b] : 1;
      let v = r === 'front' ? G.level[l].front : r === 'back' || r === 'hold' ? G.level[l].back * share : r === 'backMid' ? G.level[l].back * G.backMidShare : 0;
      // Every so often the background is let back up for a bar. A DJ releases
      // the filter over the phrase line; the level goes with it.
      if ((r === 'back' || r === 'backMid' || r === 'hold') && b % G.letUpEvery === G.letUpEvery - 1) v *= G.letUpTo;
      target[l][b] = v;
    }
    roleAt[b] = { engaged, front, lead, role };
  }

  // The hand-over: two bars up, four bars down.
  const level: Record<string, number[]> = { pad: [], keys: [], bass: [] };
  for (const l of ['pad', 'keys', 'bass']) {
    let v = 0;
    for (let b = 0; b < bars; b++) {
      const t = target[l][b];
      v = t > v ? Math.min(t, v + G.risePerBar) : Math.max(t, v - G.fallPerBar);
      level[l][b] = v;
    }
  }

  for (let b = 0; b < bars; b++) {
    const { engaged, front, lead, role } = roleAt[b];
    const treat: Record<string, TreatmentSegment | null> = {};
    for (const l of ['pad', 'keys']) {
      treat[l] = role[l] === 'back' || role[l] === 'backMid' || role[l] === 'hold'
        ? segmentAt(rotas[l], b)
        : null;
    }
    // Where the tune is, for whatever is standing behind it. There is one
    // lead at a time, so there is one place to make room in.
    const leadHz = lead ? fig[lead][b].hz : null;
    rows.push({
      bar: b,
      section: track.timeline[b] ? track.timeline[b].section : '',
      engaged,
      front,
      lead,
      leadHz,
      role,
      lift: lift[b],
      age: { pad: age.pad[b], keys: age.keys[b], bass: age.bass[b] },
      figure: { pad: fig.pad[b], keys: fig.keys[b], bass: fig.bass[b] },
      level: { pad: level.pad[b], keys: level.keys[b], bass: level.bass[b] },
      treat: { pad: treat.pad ? treat.pad.kind : null, keys: treat.keys ? treat.keys.kind : null },
      seg: treat,
    });
  }
  return rows;
}

/**
 * A voice's per-phrase colour, as the style's table states it: four phrases of
 * gain and wetness, the jitter each is rolled inside, how often the four come
 * round, and the ceiling on the hall.
 */
interface PhraseColour {
  db: number[];
  dbJitter: number[];
  wet: number[];
  wetJitter: number[];
  everyBars: number;
  hallCap: number;
}

// --- applying it to the notes ----------------------------------------------

// The parameter object every event of the plan is to be played with, in the
// plan's own order: the stage's rows applied to the notes. It reads the plan
// and writes to nothing — an event the stage does not touch comes back with
// the object the plan gave it, and every event the stage does touch comes back
// with a new one — so the same plan run twice gives the same answer and the
// idempotence flag the mutating version carried has nothing left to guard.
/** One parameter object per event of `track.events`, in the plan's order. */
export function stageParams(track: PlannedTheme, rows: StageRow[], style: Style = track.style): NoteParams[] {
  const G = style.stage;
  const phraseAt = phrasesOf(track, style);
  const barSeconds = track.barSeconds || 2.3;
  const seed = track.seed ?? 1;
  // How far the pad's octave doubling opens: a property of its own timbre, and
  // a list in the style rather than two names here. A plan with no dice at all
  // — which only a hand-built fixture is — opens all the way, as it always did.
  const padWide = !track.dice || G.wideDouble.includes(track.dice.padTimbre);
  // A per-phrase colour, so phrase two and phrase four of a cycle are not the
  // same phrase twice: rolled from the theme's own seed, and only while the
  // stage is engaged. Which voices have one, and what their four phrases are,
  // is the style's table keyed by voice; the rolls are in the table's order.
  const pr = new Rng(`${seed}::develop:piano`);
  const phraseColour: Record<string, Array<{ db: number; wet: number }>> = {};
  for (const [voice, C] of Object.entries(G.phraseColour) as Array<[string, PhraseColour]>) {
    phraseColour[voice] = C.db.map((d: number, i: number) => ({
      db: d + pr.float(C.dbJitter[0], C.dbJitter[1]),
      wet: C.wet[i] * pr.float(C.wetJitter[0], C.wetJitter[1]),
    }));
  }

  // Bars the bass has been running without a break, so the body only starts
  // breathing once the ear has had time to decide the line is holding.
  const bassRun: number[] = [];
  let run = 0;
  for (let b = 0; b < track.bars; b++) {
    run = track.timeline[b] && track.timeline[b].layers.includes('bass') ? run + 1 : 0;
    bassRun[b] = run;
  }

  // The pristine parameters used to be kept at `ev.p0` so that a second pass
  // over a track the stage had already written to measured the plan's own
  // notes and not the ones it had last shortened. Nothing writes to the plan
  // any more, so `ev.p` *is* the pristine one and there is nothing to keep.
  const out: NoteParams[] = [];
  for (const ev of track.events) {
    const base = ev.p || {};
    if (ev.role === 'texture') { out.push(base); continue; }
    const bar = ev.bar;
    if (bar == null || bar < 0 || bar >= rows.length) { out.push(base); continue; }
    const row = rows[bar];
    const p: NoteParams = { ...base };

    if (ev.layer === 'bass') {
      // The bass bus's level (house-v2's `bassBusDb`, round S12): a trim of the
      // whole line, applied where the lane's level is and never as a shelf.
      p.gain = (base.gain ?? 1) * db(row.level.bass + (G.bassBusDb ?? 0));
      let mul = 1;
      if (bassRun[bar] >= G.bassRunBars) {
        mul *= G.bassOpen[Math.floor(phraseAt(bar).n) % G.bassOpen.length];
        // The bar the figure changes on, opened a little further: the change
        // is in the plan already and this is what makes it reach the ear.
        if (row.age.bass === 0 && bar > 0) mul *= G.bassChangeOpen;
      }
      if (row.front === 'bass') mul *= G.bassFrontOpen;
      p.cutoffMul = mul;
      out.push(p);
      continue;
    }

    if (ev.layer !== 'pad' && ev.layer !== 'keys') { out.push(base); continue; }
    const lane = ev.layer === 'pad' ? 'pad' : 'keys';
    const role = row.role[lane] || 'mid';
    const seg = ev.treatment === 'none' ? null : row.seg[lane];
    const durBars = Math.max(0.25, (base.dur ?? barSeconds * 0.25) / barSeconds);
    const t0 = treatAt(seg, bar, G, phraseAt);
    const t1 = treatAt(seg, bar + durBars, G, phraseAt);

    // How far back the layer is, which is what the wetness, the colour and the
    // bell all ride. `hold` is all the way back until its lift says otherwise.
    const back = role === 'back' ? 1 : role === 'backMid' ? G.backMidShare : role === 'hold' ? 1 - row.lift : 0;
    const dipping = back > 0 && row.leadHz && row.lead !== lane;
    const levelDb = row.level[lane] + (t0.levelDb || 0) + (dipping ? G.dipMakeupDb * back : 0);
    const wet = role === 'front' ? G.frontWet : 1 + (G.backWet - 1) * back;
    const colour = role === 'front' ? G.frontLp : 1 + (G.backLp - 1) * back;

    p.gain = (base.gain ?? 1) * db(levelDb);
    p.lpMul = [colour * t0.lpMul, colour * t1.lpMul];
    p.hpMul = [t0.hpMul, t1.hpMul];
    if (t0.spreadMul !== 1 || t1.spreadMul !== 1) p.spreadMul = (t0.spreadMul + t1.spreadMul) / 2;
    if (t0.phaser) p.phaser = t0.phaser;
    // ...and the same line for an instance out of the kitchen. It is read at
    // the note's start and held for the note, exactly as the phaser is: the
    // segment's settings are rolled once per segment and a note inside one does
    // not move.
    if (t0.fx) p.fx = t0.fx;
    // Room for the tune, in the one layer that is standing behind it. It goes
    // with the back and rides the same gradient, so a layer at `backMid` takes
    // under half of it and a layer at the front takes none.
    if (dipping) p.dip = { hz: row.leadHz, db: G.dipDb * back, q: G.dipQ };

    if (base.reverb != null) p.reverb = base.reverb * wet;
    if (base.hall != null) p.hall = base.hall * wet;
    // A throw is read over the whole note, not just its start: a held chord
    // that crosses the phrase line goes into the delay with everything else.
    if (base.delay != null) p.delay = base.delay * wet * Math.max(t0.delayMul, t1.delayMul);

    const voiceColour: PhraseColour | undefined = G.phraseColour[ev.voice];
    if (voiceColour && row.engaged) {
      const list = phraseColour[ev.voice];
      const c = list[Math.floor(phraseAt(bar, voiceColour.everyBars).n) % list.length];
      p.gain *= db(c.db);
      if (p.hall != null) p.hall = Math.min(voiceColour.hallCap, p.hall * c.wet);
      if (p.delay != null) p.delay *= c.wet;
    }

    if (lane === 'pad') {
      // Register, not harmony: on alternate eight-bar phrases the desk above
      // comes up, so the same chord is played from a different part of the
      // instrument. The notes in the plan are untouched.
      if (row.engaged && Math.floor(phraseAt(bar).n) % 2 === 1) p.doubleTop = padWide ? G.doubleTop.wide : G.doubleTop.narrow;
      // The hole: the pad lets the last bar of a sixteen-bar phrase go by, so
      // the boundary arrives as an arrival.
      if (seg && seg.kind === 'hole' && role !== 'front') {
        const H = G.treatment.hole;
        const endBar = bar + durBars;
        const line = phraseAt(bar, H.everyBars).end - 1;
        if (bar <= line && endBar > line) {
          p.dur = Math.max(barSeconds * H.minBars, (line - bar) * barSeconds);
          p.release = Math.min(base.release ?? 1.2, H.release);
        }
      }
    }
    out.push(p);
  }
  return out;
}

// --- where a theme hands over ----------------------------------------------

// Where a theme hands over, and over how many bars. One plan, used by the
// live set and by the offline render alike.
//
// MEASURED: the seam sits in the outgoing theme's last breakdown, and it lands
// on a 16-bar line in 41% of the references against 19% by chance — the
// strongest alignment there is. So every boundary here is a line, *after* the
// clamping as well as before it: rounding first and clamping to `bars - need`
// afterwards is what put seed 1's first two seams on bars 174 and 158, neither
// of them a line.
//
// MEASURED, and the floor every other rule here is measured against: a
// transition begins in the outgoing theme's **last quarter**. "The last
// breakdown past 55%" describes where a breakdown sits, not when a record is
// finished with: on a 240-bar theme whose late breakdown began at bar 136 it
// started the hand-over at bar 144 — 60% — and the theme's own build, its drop
// and the last four minutes of its main groove were never heard on their own.
// That is the seam Eugene marked at bar 146 of seed 15576, "a mix overlay but
// we are not at the end of the track". So 75% of the length is a floor, and
// the breakdown only decides *where* inside the last quarter the seam lands.
//
// The order is: the last breakdown at or after the floor that still leaves
// room for the whole blend; failing that, the first line at or after the floor
// that falls in the closing main groove — or in the outro, once the groove is
// over — with the blend shortened to whatever is left rather than the line
// moved back. A long blend is what gives way, never the floor.
//
// `notBefore` is the earliest this theme may hand over, in seconds into it. A
// blend that is still running owns the record: with a 64-bar blend the next
// theme's own mix point can fall while the previous seam is still going, and
// the live engine then reached it late and started 37 seconds off while the
// offline one scheduled two overlapping seams. The next seam waits for the
// previous blend to end and takes the first line after it; if that leaves less
// room than the blend wanted, the blend is what shortens, never the line.
// The floor itself is the style's `set.seamFloor`, with the measurement that
// produced it beside it; the order above is this function's.
export function seamPlan(
  track: PlannedTheme,
  blendBars: number,
  { boundaryBars, notBefore = 0, style = track.style }: { boundaryBars?: number; notBefore?: number; style?: Style } = {}
): SeamPlan {
  const bs = track.barSeconds;
  const seamFloor = style.set.seamFloor;
  if (boundaryBars === undefined) boundaryBars = style.set.boundaryBars;
  // A blend can never be more than half the theme, and a short theme mixes on
  // a 4-bar line because a 16-bar one would not fit inside it.
  const asked = blendBarsFor(track, blendBars);
  const need = asked + 2;
  // A short theme, or one with a long blend, mixes on a 4-bar line, because a
  // 16-bar one does not fit in the room the blend leaves it — and the line is
  // what everything else is measured against, so it is chosen against the room
  // rather than against the theme's length alone.
  const room = track.bars - need;
  let q = boundaryBars <= room ? boundaryBars : room >= PHRASE_BARS ? PHRASE_BARS : 1;
  const protectedBar = Math.min(track.bars, Math.max(0, track.arrangement.handoverNotBefore ?? 0));
  // A completed closing phrase outranks a long mix. Use a finer musical line
  // if the coarse grid would delay that handover beyond the theme's sound.
  if (protectedBar > 0 && Math.ceil(protectedBar / q) * q > track.bars - 2) q = Math.min(q, PHRASE_BARS);
  // The floor as a line: the first boundary at or after three quarters.
  const floorBar = track.bars * seamFloor;
  // A floor past the last line that leaves the blend its room steps back
  // before the floor on the set's own grid (a 64-bar theme's 0.82 is bar 53,
  // its next sixteen-bar line is 64, the end, and the seam fell back to 48).
  // Where the style says so the line is made finer instead — eight bars, then
  // four — until one at or after the floor leaves the blend its room: the
  // blend shortens before the line moves back (round S4).
  if (style.set.seamLineInside) {
    for (const finer of [8, PHRASE_BARS]) {
      if (q <= finer) break;
      if (Math.ceil(floorBar / q) * q + need <= track.bars) break;
      q = finer;
    }
  }
  const floorLine = Math.ceil(floorBar / q) * q;
  // The highest line the whole blend still fits behind, the last line that
  // leaves a blend anything at all, and the line the theme ends on — a theme
  // that has been blended over for most of its length hands over when it runs
  // out rather than underneath the blend it is still in.
  const roomy = Math.max(0, Math.floor((track.bars - need) / q) * q);
  const latest = Math.max(0, Math.floor((track.bars - 2) / q) * q);
  const ends = Math.ceil(track.bars / q) * q;
  // The *last* breakdown, and only one that is inside the last quarter and
  // still leaves room for the whole blend.
  let candidate: number | null = null;
  for (const s of track.arrangement.sections) {
    if (s.kind !== 'breakdown') continue;
    if (s.startBar + need > track.bars) continue;
    if (s.startBar < floorBar) continue;
    candidate = s.startBar;
  }
  // On a line either way: never under the floor, and never so late that the
  // blend has nowhere to run. Where there is no breakdown in the last quarter
  // the seam takes the first line in the groove the theme plays out on, and
  // the blend shortens to what is left of the theme behind it.
  let bar = candidate != null
    ? Math.max(floorLine, Math.min(Math.round(candidate / q) * q, roomy))
    : closingLine(track, floorLine, latest, q);
  bar = Math.min(bar, Math.max(floorLine, latest));
  const after = Math.ceil(Math.max(0, notBefore / bs, protectedBar) / q) * q;
  if (after > bar) bar = Math.min(after, ends);
  if (keepsOutOfTheRise(track, style)) bar = outOfTheRise(track, bar, Math.max(floorBar, notBefore / bs, protectedBar), q);
  const bars = Math.max(2, Math.min(asked, track.bars - bar - 2));
  return { at: bar * bs, bar, bars, boundary: q };
}

/**
 * **A seam keeps out of the build and the drop** (R38 of the reconciled review
 * of 09-24, Eugene's answer to question 4). The line arithmetic above put about
 * one seam in thirteen over the outgoing theme's build or drop: a breakdown
 * rounded up into the drop behind it, and a theme too short for an outro with
 * no line in a groove after its floor. Under house-v2's `sectionPhrases`, where
 * the theme has a grid, a seam the lines left in a build or a drop moves to
 * the last breakdown that starts at or after `lo` with room for a blend — on
 * the first line inside it, or on its own first bar — and failing that to the
 * first groove or outro that starts at or after `lo` (a short theme's outro,
 * eight bars since the same switch). With nowhere better it stays. A theme
 * with no drums has no grid, and its seam is where the lines put it: the
 * benchmark's fourth theme hands over across its build, as heard.
 */
function keepsOutOfTheRise(track: PlannedTheme, style: Style): boolean {
  if (!track.arrangement || !track.arrangement.sections.length || !switchOn(style, 'sectionPhrases')) return false;
  const kick = style.lanes.find((l) => l.role === 'kick');
  return phraseGrid(track.arrangement, true, kick?.gate ?? undefined) !== setGrid;
}

function outOfTheRise(track: PlannedTheme, bar: number, lo: number, q: number): number {
  const sections = track.arrangement.sections;
  const rise = (b: number) => ['build', 'drop'].includes(sectionAtBar(track.arrangement, b).kind);
  if (!rise(bar)) return bar;
  const last = track.bars - 2;
  let breakdown: number | null = null;
  for (const s of sections) {
    if (s.kind !== 'breakdown' || s.startBar < lo || s.startBar > last) continue;
    const line = Math.ceil(s.startBar / q) * q;
    breakdown = line < s.startBar + s.bars && line <= last ? line : s.startBar;
  }
  if (breakdown != null) return breakdown;
  const settle = sections.find((s) => ['main', 'outro'].includes(s.kind) && s.startBar >= lo && s.startBar <= last);
  return settle ? settle.startBar : bar;
}

// The first line from `first` to `last` that lands inside a main groove, or
// failing that inside the outro: a hand-over belongs in the groove a theme
// plays out on and not in the middle of its build or its drop.
function closingLine(track: PlannedTheme, first: number, last: number, q: number): number {
  // The sections run on from bar nought without a gap, so the last one to
  // start at or before a bar is the one it is in: `sectionAtBar`, and nothing
  // before the first.
  const kindAt = (bar: number): string | null => {
    const first = track.arrangement.sections[0];
    return first && bar >= first.startBar ? sectionAtBar(track.arrangement, bar).kind : null;
  };
  for (const want of ['main', 'outro']) {
    for (let line = first; line <= last; line += q) if (kindAt(line) === want) return line;
  }
  return Math.min(first, last);
}

// Where the seam belongs, in seconds. The faces draw this; the engine asks for
// the whole plan.
export function mixPointSeconds(track: PlannedTheme, bars: number, boundaryBars: number | undefined = undefined): number {
  return seamPlan(track, bars, { boundaryBars }).at;
}

/**
 * **The blend a plan asks for**: its own `blendBars`, or eight bars where it
 * names none. One function for the eight that was written `|| 8` at eight
 * places across the seam, the set, the transport and the readout (round (f)
 * of the reconciled review of 09-24, D34).
 */
export const BLEND_BARS = 8;
export const blendAsked = (track: { blendBars?: number | null }): number => track.blendBars || BLEND_BARS;

/**
 * **A phrase, in bars**: the line a seam falls back to when a theme is too
 * short for its sixteen-bar one, the line a seek re-arms on when the sixteen
 * does not fit, and the line a spell or an engine set mid-set hands over on
 * (`mix.ts`). It was written as a 4 in each of those places.
 */
export const PHRASE_BARS = 4;

// The blend a theme actually gets, once its own length has had a say.
export function blendBarsFor(track: PlannedTheme, bars: number): number {
  return Math.max(2, Math.min(bars, Math.floor(track.bars / 2)));
}

// --- the tempo at a seam -----------------------------------------------------

/**
 * **What a seam does with the tempo, by the ratio of the two** (the fault pass
 * of 09-24; Eugene, Ember 50 → 120 and back: *"the whole music resets, a clear
 * audible drop and the start of a new song at ~100, then about a minute to
 * ramp to 120; our goal was never to stop/start but always to mix"*). Until
 * this rule every seam blended on the outgoing theme's grid — the arriving
 * theme played at the outgoing tempo, whatever its own — and the grid glided
 * sixteen bars to the new tempo after the outgoing deck had gone: a 4 % nudge
 * and a jump from 49 to 126 BPM were one move, and the second played a drummed
 * theme at 39 % of its tempo for the whole blend. The ratio is the arriving
 * theme's own tempo over the tempo the outgoing one is *heard* at, and it
 * falls in one of four bands, in this order:
 *
 *   drift   within 1 % (`TEMPO_DRIFT`): the set's own slow drift between two
 *           themes of one seed — a tenth of a BPM a minute, at most 0.8 % a
 *           theme at the slowest family (0.4 BPM at 49 BPM). Nobody hears it,
 *           so it glides as it always has, over `tempoGlideBars` (sixteen)
 *           after the blend; every planned set, and every lock laid on one, is
 *           this case and nothing else.
 *   near    0.85 to 1.18 (`TEMPO_NEAR`, a pitch fader's wide range): blended
 *           beat-matched on the outgoing grid, then the grid glides to the new
 *           tempo after the blend, **one bar a percent** (`GLIDE_BARS_PER_PERCENT`)
 *           — a 4 % nudge in four bars, 104 → 112 in eight — never more than
 *           `tempoGlideBars`.
 *   half / double   the doubled or halved ratio within 8 % (`TEMPO_FOLD`, the
 *           standard pitch fader): the arriving theme is counted two of its
 *           beats to one of the grid's (or one to two) — the crossover is on
 *           the shared grid with no glide in it, 104 → 208 is 104 → 104 at
 *           double time — and what is left over (0.95 for 55.3 → 105.1) is a
 *           near glide after the blend.
 *   far     anything else: **the DJ's order**. The outgoing theme is ridden to
 *           the arriving theme's tempo first, on its own deck, before a note of
 *           the new theme sounds — eight bars an octave of tempo
 *           (`RIDE_BARS_PER_OCTAVE`), four at least, `tempoGlideBars` at most,
 *           in the outgoing theme's bars — and then blended at the arriving
 *           theme's own tempo, beat-matched, with nothing left to glide. The
 *           incoming theme never plays at a tempo that is not its own.
 *
 * `perBeat` is how many of the arriving theme's beats one of the outgoing
 * theme's takes on the grid (1, or 2 and ½ at double and half time); `ride` is
 * the far case's glide before the blend, in the outgoing theme's bars; `glide`
 * the glide after it, in the arriving theme's bars. Pure: two tempos in, five
 * numbers out, swept in `tools/check-transport.ts`.
 */
export const TEMPO_DRIFT = 0.01;
export const TEMPO_NEAR: readonly [number, number] = [0.85, 1.18];
export const TEMPO_FOLD = 0.08;
export const GLIDE_BARS_PER_PERCENT = 1;
export const RIDE_BARS_PER_OCTAVE = 8;
export const RIDE_BARS_LEAST = 4;

export interface SeamTempo {
  kind: 'drift' | 'near' | 'double' | 'half' | 'far';
  /** the arriving theme's tempo over the outgoing one's, as heard */
  ratio: number;
  /** the arriving theme's beats to one of the outgoing theme's on the grid */
  perBeat: number;
  /** bars of the outgoing theme the grid rides to the new tempo before the blend */
  ride: number;
  /** bars of the arriving theme the grid glides over after the blend */
  glide: number;
}

/**
 * The glide after a blend, for what is left between the grid and the tempo it
 * is going to: `tempoGlideBars` for a drift, one bar a percent above it, never
 * more than `tempoGlideBars`. Also what an abandoned seam leans back over.
 */
export function glideBarsFor(ratio: number, o: { tempoGlideBars?: number } = {}): number {
  const most = Math.max(1, o.tempoGlideBars ?? 16);
  const off = Math.max(ratio, 1 / ratio) - 1;
  if (!(off >= TEMPO_DRIFT)) return most;
  return Math.max(1, Math.min(most, Math.ceil(off * 100 * GLIDE_BARS_PER_PERCENT - 1e-9)));
}

export function seamTempo(fromBpm: number, toBpm: number, o: { tempoGlideBars?: number } = {}): SeamTempo {
  const ratio = toBpm / fromBpm;
  const most = Math.max(1, o.tempoGlideBars ?? 16);
  const off = Math.max(ratio, 1 / ratio) - 1;
  if (!(off >= TEMPO_DRIFT)) return { kind: 'drift', ratio, perBeat: 1, ride: 0, glide: most };
  if (ratio >= TEMPO_NEAR[0] && ratio <= TEMPO_NEAR[1]) return { kind: 'near', ratio, perBeat: 1, ride: 0, glide: glideBarsFor(ratio, o) };
  for (const perBeat of [2, 0.5]) {
    const left = ratio / perBeat;
    if (Math.max(left, 1 / left) - 1 <= TEMPO_FOLD) {
      return { kind: perBeat > 1 ? 'double' : 'half', ratio, perBeat, ride: 0, glide: glideBarsFor(left, o) };
    }
  }
  const ride = Math.max(RIDE_BARS_LEAST, Math.min(most, Math.ceil(RIDE_BARS_PER_OCTAVE * Math.abs(Math.log2(ratio)) - 1e-9)));
  return { kind: 'far', ratio, perBeat: 1, ride, glide: 0 };
}

/**
 * **Whether a theme plays a kick at all** — a drummed theme against a drone —
 * read off its program: an event in the seam's `swapGroup` is one a seam may
 * hole. `seamCurves` holes the arriving theme's kick until the swap and the
 * outgoing one's from a bar before it so two kicks never overlap; when only
 * one of the two decks has a kick there is nothing to overlap, and the hole
 * was a stretch of a drummed theme with no kick under a drone — its entry
 * sounding like its own breakdown. See `seamCurves`.
 */
export function playsKick(program: { events: ArrayLike<{ gap?: string | null }> } | null | undefined, group = 'kick'): boolean {
  if (!program) return false;
  const evs = program.events;
  for (let i = 0; i < evs.length; i++) if (evs[i].gap === group) return true;
  return false;
}

// --- the same place in the same form --------------------------------------------

/**
 * **Where a bar of one plan of a theme stands in another plan of the same
 * theme** (Eugene, 09-24: *"a bird move keeps the place"*). A spell move plans
 * the theme playing again under the asked spell and hands over into it where
 * the record is, so the section a listener is in goes on with the bird's
 * change and the intro never comes back.
 *
 * MEASURED, seeds 1–25 × themes 0–1 × every bird at 0.05 and 0.95 under
 * house-v2 (800 plans): a spell never changes a theme's length, and changes its
 * sections in 6 — each a drummed theme against a drone across Ember, where the
 * phrase grid moves a breakdown by four or eight bars and the short theme's
 * outro comes or goes (R16, R38). So where the two plans have the same
 * sections the bar is the bar, and where they do not it is the same section,
 * counted by its place in the form, at the same bar into it — clamped into
 * that section, and failing a section of that number the last one — which
 * keeps the form going and never lands in an intro that is not the one
 * playing. Theme seconds in, theme seconds out: a bar of each plan's own.
 */
export function sameFormTime(from: PlannedTheme, to: PlannedTheme, fromTime: number): number {
  const bar = Math.max(0, fromTime / from.barSeconds);
  const a = from.arrangement?.sections ?? [];
  const b = to.arrangement?.sections ?? [];
  const same = a.length === b.length && a.every((s, i) => s.kind === b[i].kind && s.startBar === b[i].startBar && s.bars === b[i].bars);
  let out = bar;
  if (!same && a.length && b.length) {
    let k = a.length - 1;
    for (let i = 0; i < a.length; i++) if (bar >= a[i].startBar) k = i;
    const into = bar - a[k].startBar;
    const t = b[Math.min(k, b.length - 1)];
    out = t.startBar + Math.min(into, Math.max(0, t.bars - 1e-6));
  }
  return Math.min(out, Math.max(0, to.bars - 1e-6)) * to.barSeconds;
}

// --- where a theme hands over when a hand asks for it ------------------------

/**
 * A hand-over that begins **where the record has got to**, rather than where
 * the arrangement put one.
 *
 * Every seam in this project is planned: `seamPlan` says which bar of a theme
 * hands over, out of the theme's own breakdowns and the floor under them, and
 * a set is laid out from those bars before a note is played. A cast and a held
 * bird ask a different question — *hand over from here* — and it is the one
 * piece of arithmetic the never-stop transport needed that did not exist
 * (Eugene, 09-19: "once the machine is started it never stops").
 *
 * It is the same three numbers as `seamPlan` and answers them the same way:
 *
 *   the line   a hand-over begins on a line, never between two. `unit` is how
 *              long a line is in bars — one bar for a cast, which is a hand
 *              asking for a record now, and a phrase for a spell, which is a
 *              promise about what follows. The first line at or after `from` is
 *              taken, so the bar the playhead is inside is never it.
 *   the blend  the **outgoing** theme's own `blendBars`, which is what a
 *              planned seam blends over too, capped by half of either theme, by
 *              the room the outgoing one has left, and by `most`. A blend is
 *              what gives way, never the line: the same rule `seamPlan` follows.
 *
 * `most` is the one number a hand-over asked for by a hand does not take from
 * the plan. A planned blend is bimodal and MEASURED — 70 % of them around eight
 * bars and 30 % of them thirty-two to sixty-four — and a long one is a move
 * between two records a DJ chose, with a whole theme either side of it. A hand
 * that has just thrown the dice has chosen one record, now: the low end changes
 * hands eight bars in whatever the blend's length (`swapAfterBars`), so past
 * twice that the theme it replaced is lingering over music that has already
 * replaced it, and two graphs stay up for two and a half minutes to do it. So
 * the caller states the longest a hand-over of its own may run, and the rule it
 * states is one phrase past the swap.
 *   the room   a theme with fewer than three bars left still hands over, over
 *              the two-bar floor, and plays out underneath the arriving one.
 *              Nothing waits for a theme to end, because nothing stops.
 *
 * Pure: seconds in, seconds out, no clock and no deck. `tools/check.ts` sweeps
 * it and `src/mix.ts` maps its bar onto the deck that is playing.
 *
 * @param track the theme that is playing
 * @param from where the hand-over may begin at the earliest, in that theme's
 *   own seconds — the transport's own floor: the render head, its lead, and
 *   whatever the deck has already been filled to
 * @param into the theme that is arriving
 * @param unit the line the seam must begin on, in bars
 * @param most the longest this hand-over may run, in bars
 */
export function seamFromHere(
  track: PlannedTheme,
  from: number,
  into: PlannedTheme,
  { unit = 1, most = Infinity }: { unit?: number; most?: number } = {},
): SeamPlan {
  const bs = track.barSeconds;
  const q = Math.max(1, Math.round(unit));
  const bar = Math.ceil(Math.max(0, from) / bs / q - 1e-9) * q;
  // The blend both themes can afford, and then what the outgoing one has left
  // behind the line: a bar of it is kept so the swap has a downbeat to land on.
  const asked = Math.min(most, blendBarsFor(into, blendBarsFor(track, blendAsked(track))));
  const bars = Math.max(2, Math.min(asked, Math.max(2, track.bars - bar - 1)));
  return { at: bar * bs, bar, bars, boundary: q };
}


// An anticipatory voice arrives on its event's time and has to *start* before
// it. `t` is the arrival; this is how long before that the sound begins.
//
// The swell is the only one, and it is 1.8 seconds long. A look-ahead
// scheduler visits an event when its own time enters a window of about 150 ms,
// so firing the swell on its arrival meant asking the browser to start a
// source 1.68 seconds in the past: the start time was checked against the
// arrival, the voice subtracted the duration afterwards, and most of the
// envelope had already gone by. Offline rendering schedules the whole list at
// once, so the bug only ever existed on the page — which is why no render ever
// showed it.
//
// Both times stay in one event, so the plan and its frozen order are
// untouched: the arrival is `t`, the lead is what the instrument says it needs
// from that event's own parameters, and it is the compiler that decides which
// one a scheduler fires on.
//
// Which instrument that is, is the registry's answer and not a name written
// here: `anticipates` on the descriptor is the lead, `null` for everything
// that arrives when it is struck. Until round E this line read
// `ev.voice === 'swell'`.
export function leadOf(ev: PlanEvent): number {
  const d = BY_NAME[ev.voice];
  return d && d.anticipates ? d.anticipates(ev.p) : 0;
}

// The two questions the engine used to ask by name, asked of the registry
// instead. The design review's sentence: *the engine must not assume every
// kick owns the bass handoff, every bass renderer is named `sub`, or every
// anticipatory sound is named `swell`.* All three are answered off the
// descriptor now — the third by `leadOf` above, since round E gave it
// `anticipates` to read.
const postsDuck = (d: Descriptor | undefined): boolean => !!d && d.roles.includes('kick');
const gapGroup = (d: Descriptor | undefined): 'kick' | 'sub' | null =>
  (!d ? null : d.bus === 'kick' ? 'kick' : d.bus === 'sub' ? 'sub' : null);


// The three curves the arrangement writes, resolved against the room here
// rather than at schedule time: the push is one gesture and not three knobs,
// and its three destinations are three lines of numbers the moment the room is
// known. `applyCurve` in master.ts is all that is left to do with them.
function automationOf(track: PlannedTheme, settings: Settings): AutomationLine[] {
  const lines: AutomationLine[] = [];
  const a: PlanAutomation = track.automation || {};
  const pts = (list: CurvePoint[], f?: (v: number) => number): CurvePoint[] =>
    list.map((p) => ({ t: p.t, value: f ? f(p.value) : p.value }));
  if (a.macroFilter && a.macroFilter.length)
    lines.push({ param: 'macro.frequency', curve: 'exponential', points: pts(a.macroFilter) });
  if (a.melodicGain && a.melodicGain.length)
    lines.push({ param: 'melodic.gain', curve: 'linear', points: pts(a.melodicGain) });
  if (a.push && a.push.length) {
    const K = settings.push;
    const body = settings.bass.bodyDb;
    lines.push({ param: 'push.wet.gain', curve: 'linear', points: pts(a.push, (v) => v * K.satAmount) });
    lines.push({ param: 'push.body.gain', curve: 'linear', points: pts(a.push, (v) => body + v * K.bodyDb) });
    lines.push({ param: 'push.sub.gain', curve: 'linear', points: pts(a.push, (v) => Math.pow(10, (v * K.subDb) / 20)) });
  }
  // The bus sweep's stages, each a corner and a crossfade: the dry is the wet's
  // complement, so a stage engaged at an open corner is the bus it was. A
  // stage with no move has no line, and a graph never builds it.
  for (const stage of ['hp', 'lp'] as const) {
    const c = a.sweep?.[stage];
    if (!c) continue;
    lines.push({ param: `sweep.${stage}.cutoffHz`, curve: 'exponential', points: pts(c.cutoff) });
    lines.push({ param: `sweep.${stage}.wet.gain`, curve: 'linear', points: pts(c.wet) });
    lines.push({ param: `sweep.${stage}.dry.gain`, curve: 'linear', points: pts(c.wet, (v) => 1 - v) });
  }
  return lines;
}

/**
 * Freeze the whole tree on the way out, the way `resolveSettings` does: a
 * frozen program over a writable event list would be exactly the alias rounds
 * C and D exist to remove. `Object.freeze` is shallow and a program is four
 * levels deep in places.
 */
function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze((o as Record<string, unknown>)[k]);
  }
  return o;
}

/**
 * The compiler. A planned theme and the room it is to be played in, in; the
 * sound program, out. It reads the plan and writes to nothing — hand it a
 * deep-frozen plan and it compiles it — and it holds no state between calls, so
 * the same plan and the same settings give the same program every time.
 *
 * `plan` is a planned theme from `planTheme()` or `generate()`, `settings` the
 * resolved room from `resolveSettings()`, and `opts.boundaryBars` the set's own
 * boundary for the seam plan; everything else a theme decides for itself.
 */
export function compilePerformance(
  plan: PlannedTheme,
  settings: Settings,
  opts: { boundaryBars?: number; style?: Style; stage?: boolean } = {}
): Program {
  const style = opts.style || plan.style;
  // `stage: false` compiles the same plan with the **desk left alone**: no
  // front and back, no treatment rota, every event at the parameters the
  // generator wrote. It is what the lab's A/B harness lost when round D moved
  // the stage inside the compiler, and it is the only honest way to hear what
  // the stage is doing — the alternative is reading two renders and guessing
  // which difference is which. Nothing on a page passes it, `staged` already
  // has the no-rows path it needs, and the two digests are compiled with the
  // stage on as they always were.
  const rows = opts.stage !== false && plan && plan.events && plan.timeline && plan.bars ? stage(plan, style) : [];
  const staged = rows.length ? stageParams(plan, rows, style) : (plan.events || []).map((ev) => ev.p || {});

  const routing: Record<string, string> = {};
  const events: ProgramEvent[] = [];
  const duck: AutomationPoint[] = [];
  const shape = duckShape(settings, plan.beat);
  const knobCopies: Record<string, Record<string, number>> = {};
  for (let i = 0; i < plan.events.length; i++) {
    const ev = plan.events[i];
    const d = BY_NAME[ev.voice];
    const bus = VOICE_BUS[ev.voice] || 'melodic';
    const levelKey = VOICE_LEVEL[ev.voice];
    // The level table's say on the gain, made once. It used to be made inside
    // `fireEvent` and `fireDeckEvent`, in a call that also built audio nodes,
    // which is why the program tool had to repeat those two lines and check
    // the repetition against the source text.
    // The level table is read by the key the **descriptor** names, which is a
    // word out of the registry and not one of the eleven the instruments file
    // spells out, so it is read as the table it is.
    // ...a room's "off" for a word being about its own voice only (S18's `laneFloors`).
    const level = dbToGain(laneLevelDb(style, settings.levels as Record<string, number>, ev.voice, levelKey) ?? -12);
    const base = staged[i];
    // The seasoning this voice was given, where the spell gave it any. It is
    // put on the note here rather than in the generator because this is where
    // a note's parameters are made — the level, the stage's colour and the
    // rota's treatment are all written on the same line — and because a plan
    // is a plan whether or not anybody compiles it.
    // A copy per voice, made once: the program is frozen whole on its way out,
    // and the table is the plan's, which the compiler writes to never (R105 of
    // the review of 09-24 — it froze the plan's own table by reference).
    const knobs = plan.knobs && plan.knobs[ev.voice]
      ? knobCopies[ev.voice] ??= { ...plan.knobs[ev.voice] } : undefined;
    // A note that carries a knob setting of its own (round S5's bass solo
    // opening the sub's brightness toward its peak) keeps it over the theme's
    // seasoning for that knob; no other note carries one, so every other note
    // is the note it was.
    const own = base?.knobs as Record<string, number> | undefined;
    const p = knobs || own
      ? { ...base, gain: (base?.gain ?? 1) * level, knobs: own ? { ...(knobs ?? {}), ...own } : knobs }
      : { ...base, gain: (base?.gain ?? 1) * level };
    const lead = leadOf(ev);
    const onset = ev.t - lead;
    routing[ev.voice] = bus;
    const posts = postsDuck(d);
    events.push({
      i,
      voice: ev.voice,
      layer: ev.layer,
      ...(ev.part ? { part: ev.part } : {}),
      ...(ev.role ? { role: ev.role } : {}),
      ...(ev.treatment ? { treatment: ev.treatment } : {}),
      bus,
      level: levelKey ?? null,
      bar: ev.bar ?? null,
      step: ev.step ?? null,
      t: ev.t,
      onset,
      lead,
      duck: posts,
      gap: gapGroup(d),
      p,
    });
    if (posts) for (const pt of duckAt(shape, onset)) duck.push(pt);
  }

  const levels: Record<string, number> = {};
  for (const k of Object.keys(settings.levels).sort()) {
    const v = (settings.levels as Record<string, number>)[k];
    if (typeof v === 'number') levels[k] = v;
  }

  return deepFreeze({
    seed: plan.seed,
    index: plan.index ?? null,
    preset: plan.preset,
    bpm: plan.bpm,
    beat: plan.beat,
    barSeconds: plan.barSeconds,
    bars: plan.bars,
    duration: plan.duration,
    settings,
    // The theme's own output gain, which is the one place the loudness trim is
    // applied: `buildGraph` sets `themeOut.gain.value = dbToGain(trimDb)`. The
    // trim is worked out beside the plan by `planTheme`, so a `generate()`
    // track has none and plays at unity, exactly as it did.
    trimDb: plan.trimDb ?? 0,
    themeGain: dbToGain(plan.trimDb || 0),
    // Where this theme hands over on its own, before a set has a say.
    seam: plan.arrangement ? seamPlan(plan, blendAsked(plan), { boundaryBars: opts.boundaryBars, style }) : null,
    blendBars: plan.blendBars ?? null,
    filterMove: plan.filterMove ?? null,
    routing,
    levels,
    events,
    automation: automationOf(plan, settings),
    duckShape: shape,
    duck,
    development: rows,
  });
}

/**
 * A window of a compiled performance: the events that sound between two
 * instants, moved so the window starts at nought, with the curves moved with
 * them and the duration cut to fit.
 *
 * It exists because a theme is four minutes long and a suite is two, and the
 * nine scenes each meter eight bars from the middle of one. The window used to
 * be taken off the *plan*: every event outside it was handed over with a voice
 * name no voice has, so that the stage still read the theme's real history —
 * the four-bar prints, the bars since a layer last changed — and `fireEvent`
 * built no node for any of them. That worked, and what it cost was that the
 * stage ran again on a list nobody would ever play: slicing a plan and
 * compiling the slice had to be proved not to compound what the stage does,
 * every time anyone touched the stage. Compiling once and slicing the program
 * cannot compound anything, because there is nothing left to run.
 *
 * `layers` keeps only the named layers, which is how the mono stem is rendered
 * alone. The window's own arithmetic is the caller's: these are seconds.
 */
export function sliceProgram(
  program: Program,
  { from = 0, to = Infinity, tail = 0, layers = null }: { from?: number; to?: number; tail?: number; layers?: string[] | null } = {}
): Program {
  const events: ProgramEvent[] = [];
  const duck: AutomationPoint[] = [];
  for (const e of program.events) {
    if (!(e.t >= from && e.t < to)) continue;
    if (layers && !layers.includes(e.layer)) continue;
    const moved = { ...e, i: events.length, t: e.t - from, onset: e.onset - from };
    events.push(moved);
    if (moved.duck) for (const pt of duckAt(program.duckShape, moved.onset)) duck.push(pt);
  }
  // Every point of every curve moves with the window, rather than being cut at
  // its edges: `applyCurve` interpolates into the segment the start lands
  // inside, so a filter that has been opening for eight bars opens from where
  // it had reached and not from where the theme began.
  const automation = program.automation.map((line) => ({
    ...line,
    points: line.points.map((pt) => ({ t: pt.t - from, value: pt.value })),
  }));
  return deepFreeze({
    ...program,
    duration: (to === Infinity ? program.duration : to) - from + tail,
    events,
    automation,
    duck,
  });
}

// One compiled program per plan, worked out the first time something needs it
// and then held. A deck, the preparation its voices want ahead of it and an
// offline render of the same theme are the same performance in the same room,
// so they are the same value; and because it is a value, nothing that happens
// between them can be it. Compiling twice would give the same answer — the
// compiler is pure — so what the map saves is the work and not the meaning,
// and the work is saved where it matters: the prewarm ahead of a seam compiles
// the theme, and the deck built when the seam arrives has it already.
//
// This replaces two containment fixes and one bug they were containing. Every
// synchronous phase that touched a deck used to begin by writing that deck's
// theme into the live params table, and before that there was a marker saying
// which deck was loaded — private to the mix, over a table that was not, so
// a theme planned while the set played, a render, or a preset change left the
// marker naming a theme whose values were no longer there and the deck that
// was sounding went on scheduling kicks and hats out of somebody else's room.
// There is no table now and nothing to re-apply.
//
// It stood in `deck.ts` until round W, and a deck is where it was read; but a
// deck is the machine and this compiles a plan, so it is on the side of the
// line that knows what a plan is, and a deck is handed the program it makes.
const compiled = new WeakMap<PlannedTheme, Program>();
export function programOf(track: PlannedTheme): Program {
  let p = compiled.get(track);
  if (!p) {
    p = compilePerformance(track, settingsOf(track));
    compiled.set(track, p);
  }
  return p;
}

export default compilePerformance;
