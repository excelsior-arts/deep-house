// The master chain, built identically for the live context and the offline
// render so an exported WAV is the same signal path you heard.
//
// A theme's graph (`buildGraph`), one per deck:
//
//   kick -------------------------+
//   sub ----> duck (low) ---------+-> high-pass -> glue (+ push) -> saturation --+
//                                                                              +-> themeOut (the trim)
//   drums ------------------------+-> macro LPF -> mono below a corner ---------+
//   melodic -> duck -> width -----+
//                 ^
//                 |  one ramp per kick, 6-9 dB, minimum at 65 ms
//
// and the master every deck shares (`buildMaster`), which a render of one
// theme builds for itself:
//
//   themeOut -> DC high-pass -> low shelf -> low-mid bell -> mid -> presence
//            -> air -> master gain -> limiter -> soft clip -> trim -> out
//
// The kick and the sub are the floor of the record, so neither of them ever
// passes through the macro filter: a breakdown closes the music, not the
// bottom, and no arrangement move can take the weight out of the track.
//
// Two sends hang off the buses: a dotted-eighth delay — one line returning to
// both sides, since the records measured do not ping-pong — and a convolution
// reverb whose impulse is generated noise. (The diagram was the theme's half
// alone, with a ping-pong in it, until R80 of the reconciled review of 09-24.)

import { duckShape } from './program.ts';
import { impulseResponse, softClipCurve, saturationCurve, dbToGain, phasedLfo } from './dsp.ts';
import { line, type Line } from './ramp.ts';
import { backgroundSpace, DEFAULT_SPACES, type BackgroundSpace } from './background-space.ts';
import type { Settings } from './settings.ts';
import type { AutomationLine, CurvePoint, DuckPoint } from './program.ts';
import { qFor } from './effects/filter.ts';
import { build as tapeDelay } from './effects/tape-delay.ts';
import { build as bassDrive } from './effects/bass-drive.ts';
import { buildHarmonicEdge, type HarmonicEdgeStage } from './effects/harmonic-edge.ts';
import { HARMONIC_EDGE_AT_NOUGHT } from './voices/grain.ts';
import { liveArmed } from './voices/live.ts';
import { isOffline } from './effects/shell.ts';
import type { EffectInstance } from './effects/contract.ts';
import { asSpace, buildSpace, type SpaceInstance } from './effects/space.ts';

// Everything in this file is handed the settings it is to build under, as its
// second argument, and reads nothing else (PLAN-V1-NEXT round C). That
// includes the lazy hall below: it closes over the value it was constructed
// with, so a theme whose piano arrives four minutes into a set still gets its
// own room and not whichever one was planned last.

/**
 * What a path into a graph resolves to.
 *
 * In a graph that is playing it is an AudioParam; in `tools/program.ts`, which
 * locks what the curves actually are, it is a recorder with the same methods on
 * it and no audio behind them. So what is written down here is the handful of
 * methods and the one value an automation writer uses, rather than `AudioParam`
 * itself: a real parameter satisfies it, the stand-in satisfies it, and nothing
 * that writes a curve reaches past it.
 */
export interface AutomationTarget {
  value: number;
  setValueAtTime(value: number, at: number): unknown;
  linearRampToValueAtTime(value: number, at: number): unknown;
  exponentialRampToValueAtTime(value: number, at: number): unknown;
  cancelScheduledValues(at: number): unknown;
}

/**
 * **The master's tone as a profile** (round E1, Eugene 10-01: *"extract EQ as
 * a parameter to the engine; apply to v1 explicitly, apply to v2 explicitly;
 * assume it may be adjusted on birds change"*). The five gains of the five
 * tone stages, as one vector: the low shelf, the low-mid bell, the mid bell,
 * the presence bell and the air shelf. The stages' corners and widths are the
 * **range** and stay where the style put them -- a profile moves how much each
 * band is lifted or cut, never where the band is, so the sub keeps its octave
 * whatever its level.
 *
 * A style states it in `master` (the five `…Db` fields, `eqProfileOf` reads
 * them), so a theme's settings carry its profile and the program's settings
 * hash locks it.
 */
export interface EqProfile {
  lowShelfDb: number;
  lowMidDb: number;
  midDb: number;
  presenceDb: number;
  airDb: number;
}

/** Each gain of a profile and the stage of the chain it is the gain of, in signal order. */
export const EQ_STAGES: Readonly<Record<keyof EqProfile, 'lowShelf' | 'lowMid' | 'mid' | 'presence' | 'air'>> = Object.freeze({
  lowShelfDb: 'lowShelf', lowMidDb: 'lowMid', midDb: 'mid', presenceDb: 'presence', airDb: 'air',
});
/** The five, in signal order. */
export const EQ_BANDS = Object.freeze(Object.keys(EQ_STAGES) as Array<keyof EqProfile>);

/** A settings' `master` block's profile: its five gains, and nothing else of it. */
export function eqProfileOf(master: Readonly<EqProfile>): EqProfile {
  return { lowShelfDb: master.lowShelfDb, lowMidDb: master.lowMidDb, midDb: master.midDb, presenceDb: master.presenceDb, airDb: master.airDb };
}

/**
 * **How long a profile takes to arrive**, when the caller names no time: a
 * linear walk of each gain over this many seconds, which is long enough that
 * no step is heard in a shelf under a held sub and short enough to land inside
 * the bar it was asked at. A set names a bar of the arriving theme instead.
 */
export const EQ_RAMP_S = 2;

/**
 * The master chain as `buildMaster` builds it: every node of it, in the order
 * the signal passes through them, plus the two facts a caller needs about the
 * limiter. `input` and `out` are the two ends; the rest is named because a
 * caller taking the chain apart disconnects each one.
 */
export interface MasterChain {
  ctx: BaseAudioContext;
  /** feed the mix in here */
  input: BiquadFilterNode;
  /** and take the record out of here */
  out: GainNode;
  dcBlock: BiquadFilterNode;
  lowShelf: BiquadFilterNode;
  lowMid: BiquadFilterNode;
  mid: BiquadFilterNode;
  presence: BiquadFilterNode;
  air: BiquadFilterNode;
  master: GainNode;
  /** the worklet, or the gain that stands in for it where there is none */
  limiter: AudioWorkletNode | GainNode;
  /** the worklet's port, for telling the processor to finish; nothing without one */
  limiterPort: MessagePort | null;
  clip: WaveShaperNode;
  trim: GainNode;
  limiterIsWorklet: boolean;
  settings: Settings;
  /**
   * **Walk the five tone gains to `profile`**, starting at `at` and landing
   * `over` seconds later (`EQ_RAMP_S` when unnamed). Each gain is moved along
   * its own written line (`src/ramp.ts`), so a second move asked before the
   * first has landed starts from where the first had got to and never jumps.
   * The corners and the widths are not touched.
   * @returns the instant the profile lands
   */
  setProfile(profile: EqProfile, at: number, over?: number): number;
  /**
   * **A hand's lean on one band** (the machine view's desk): an offset in dB
   * over the profile, walked to through the same line, and kept -- the next
   * `setProfile` lands at the profile plus the lean, so a theme's boundary
   * never steps a band a hand is holding. Nought lets it go.
   */
  lean(band: keyof EqProfile, offset: number, at: number, over?: number): number;
  /** the profile last asked for, without a hand's lean on it */
  profile(): EqProfile;
  /** the five gains as they will stand at `t`, by everything written, lean and all */
  profileAt(t: number): EqProfile;
}

/**
 * One bus of a theme's graph: the bus itself and the three spaces anything on
 * it may be sent to. `hall` is built the first time it is read, which is why it
 * is a getter and not a field.
 */
export interface Bus {
  /** the bus itself: what a voice's own chain connects to */
  dry: GainNode;
  delay: GainNode;
  reverb: GainNode;
  room: GainNode;
  readonly hall: GainNode;
  readonly background: GainNode;
  readonly immersed: GainNode;
  /** the echo: a note's own repeats, built the first time one asks (`ECHO_SEND`) */
  readonly echo: GainNode;
  /**
   * the part's own space (`settings.partSpace`), one per theme's graph and shared
   * by every bus, built the first time a note asks (`withPartSpace` in dsp.ts);
   * undefined where the theme's settings name none, so nothing is ever built there
   */
  readonly partSpace?: GainNode;
  /**
   * the bass drive's side door, on the sub bus where the theme's copy is built
   * (round DUB-4): a note played here is driven and never heard clean
   */
  readonly ride?: AudioNode;
}

/**
 * The five buses a program's events land on, under the names
 * `voices/descriptor.ts` declares: `kick`, `sub`, `drums`, `melodic`, `keys`.
 *
 * The lookup is **by string** and not by a union of those five, because a
 * program's `bus` is the word the voice registry wrote — a `string` on
 * `ProgramEvent` — and a union here would be a cast at every caller that plays
 * one.
 */
export type Buses = Record<string, Bus>;

/**
 * One theme's graph, node for node: what `buildGraph` builds and what the
 * handle in `src/graph.ts` is put in front of. Nothing outside `src/graph.ts`
 * and this file reads it.
 */
/** One stage of the bus sweep: the filter's corner, and the crossfade it is engaged by. */
export interface SweepStage {
  cutoffHz: AudioParam;
  dry: GainNode;
  wet: GainNode;
  filter: BiquadFilterNode;
}

/** The melodic bus's two sweep stages, in the order the signal passes them. */
export interface BusSweep {
  hp: SweepStage;
  lp: SweepStage;
}

/**
 * **What the bus sweep is built at** (round S2 of the composer): the kitchen
 * `filter`'s own core — one biquad, its resonance in decibels over the passband
 * through the effect's own mapping (`qFor`), a modest two against the default
 * three — **without the effect's drive in front of it**. MEASURED, and the
 * reason it is not the whole effect: the drive's shaper has a small-signal
 * slope of 2.25 whatever its setting, so an engaged instance is a compressor
 * as well as a filter. At the effect's defaults the melodic bus rose 3.5 to 5
 * dB in every band on engaging (seed 1, theme 1, bars 28-31); with the level
 * trimmed to 0.5 a pad-and-keys bus was level, but the benchmark's vibes, all
 * attack and decay, still rose 2.4 dB over an eight-bar move and stepped down
 * again when it let go (27191 theme 3, bars 64-72), and 1.5 dB with the drive
 * at nought. A sweep that changes the level of what it sweeps is a fader move
 * nobody wrote, so the stage is the clean biquad. Parked, a stage is its dry
 * gain at one and its wet at nought: the bus to the sample.
 */
export const SWEEP_FILTER = { resonanceDb: 2, lpOpenHz: 20000, hpOpenHz: 30 } as const;

export interface ThemeGraph {
  ctx: BaseAudioContext;
  /** what a deck's own filters and fader hang off */
  out: GainNode;
  themeOut: GainNode;
  /** the master this theme is feeding, whether it was handed one or built it */
  chain: MasterChain;
  master: GainNode;
  macro: BiquadFilterNode;
  duck: GainNode;
  duckLow: GainNode;
  /** the struck voices' duck (round PIANO-2): beside `duck`, a shallow dip after the strike */
  struckDuck: GainNode;
  /**
   * The struck door of a harmonic bus (round PIANO-2) — `melodic` or `keys`,
   * the same sends as the bus and a dry into the struck path, which ends on
   * `struckDuck` — built the first time it is asked for; `null` for a bus
   * with none.
   */
  struckBus(name: string): Bus | null;
  /** whether the struck path has been built; looking never builds one */
  hasStruck(): boolean;
  /** an automation target by the path a program's line names: a path the two harmonic paths share answers with both */
  param(path: string): AutomationTarget | null;
  melodic: GainNode;
  /** the harmonic sum's seam gain, after `melodic` and before the duck: at one unless a hand-over moves it (`harmonic.gain`) */
  harmonic: GainNode;
  /**
   * **The outgoing harmony's close** (round MIX-X4): a low-pass on the harmonic
   * sum after its seam gain, which a hand-over between unrelated keys closes
   * on the deck that is leaving (`harmonicLp.frequency`) while that gain
   * fades. **Built the first time a path into it is read**, like the sweep, so
   * a deck whose seam never names it plays through the graph it always did;
   * built, it stands open at 20 kHz and flat (Butterworth) until a line moves it.
   */
  readonly harmonicLp: BiquadFilterNode;
  /** whether the close has been built; looking never builds one */
  hasHarmonicLp(): boolean;
  air: BiquadFilterNode;
  presence: BiquadFilterNode;
  glue: DynamicsCompressorNode | GainNode;
  bassComp: DynamicsCompressorNode;
  push: { wet: GainNode; body: BiquadFilterNode; sub: GainNode };
  /**
   * The bass drive in parallel (round B1): the driven copy summed under the
   * clean bass between the bus and the body filter, or `null` where the
   * theme's settings ask for none, which is the house.
   */
  bassDrive: EffectInstance | null;
  /** the presence bell on the harmonic bus (round EQ-2), or `null` where the theme's settings ask for none */
  harmonicBell: BiquadFilterNode | null;
  /**
   * The harmonic bus's edge in parallel (round SPARK-1), the held path's, or
   * `null` where none was built: where the theme's settings ask for none and
   * the desk was not up when the graph was built (DESK-EDGE: while it is, a
   * graph on a playing context builds one at nought).
   */
  harmonicEdge: HarmonicEdgeStage | null;
  /**
   * **The parameters a stage line moves** (PLAN-DESK D2), by the target its
   * declaration names (`stage.ts`): the node's own where the handle has it, and
   * the two this graph keeps to itself — the width's breathing depth and rate —
   * and both bells where the struck path has one. Empty where the graph has no
   * such parameter (a glue built as a gain). Only `V1Graph.stage` asks.
   */
  stageParams(target: string): AudioParam[];
  /**
   * **The setters a stage line moves** (DESK-EDGE), by target: where one
   * number is several parameters at different values — the bus edge's drive,
   * its drive gain and its make-up — one setter per path that has the stage.
   * Empty where none was built.
   */
  stageSetters(target: string): Array<(v: number, at: number, over: number) => void>;
  /**
   * The melodic bus's section sweeps (house-v2's `busSweeps`): a high-pass and
   * a low-pass, each the kitchen filter's core between a dry and a wet gain. **Built the first time a path into it is read**, which only an
   * automation line naming it does, so a program with no sweep never builds
   * one and plays through the graph it always did.
   */
  readonly sweep: BusSweep;
  /** the dotted-eighth delay line's time, which a tempo glide leans */
  echo: { time: AudioParam };
  limiter: AudioWorkletNode | GainNode;
  trim: GainNode;
  width: GainNode;
  /**
   * Anything whose only path to the destination is through an AudioParam.
   * `AudioNode` and not a source type: what is in it is whatever held the graph
   * alive, and the one caller that stops them asks each one whether it stops.
   */
  keepAlive: AudioNode[];
  beat: number;
  duckShape: DuckPoint[];
  buses: Buses;
  level(name: string): number;
  /**
   * Whether the piano's hall has been built: either path's, or (round
   * PIANO-2) the one named — `held` the bus's own, `struck` the struck door's.
   *
   * It exists because asking the question any other way *answers it wrongly*:
   * `bus.hall` is a getter that builds a four-second convolver the first time
   * it is read, so a readout that reached for it to see whether it was there
   * would be the thing that put it there. A theme with no piano in it never
   * pays for that convolver, and nothing that only looks may make it.
   */
  hasHall(which?: 'held' | 'struck'): boolean;
  hasBackground(): boolean;
  hasImmersed(): boolean;
  hasEcho(): boolean;
  /** whether the part's own space has been built; looking never builds one */
  hasPartSpace(): boolean;
  /**
   * The part's own space (`settings.partSpace`), built on this read: what an automation
   * line names by path (`partSpace.levels.dry.gain`, `partSpace.levels.sends.<id>.gain`).
   * Null where the settings name none.
   */
  readonly partSpace: SpaceInstance | null;
  disposeBackground(): void;
}

/**
 * What `buildGraph` takes besides the room: the beat the theme is being played
 * at, the phase its width LFO starts on, the master it is to feed and its own
 * loudness trim. Every one of them is optional and every one of them has the
 * default it has always had.
 */
export interface GraphOptions {
  /** the grid this theme is actually being played on, not its own target */
  bpm?: number;
  /**
   * the instant the theme begins on the context's clock — the deck's first
   * bar line — for anything in the graph with a phase on the bar (the bass
   * drive's wobble). Absent is nought, which offline *is* a bar line.
   */
  at?: number;
  /** `track.trimDb`, worked out at plan time; 0 dB without one */
  trimDb?: number;
  /**
   * where this theme's width LFO starts, **in radians** — `phasedLfo`'s unit.
   * It was documented in turns (R74 of the reconciled review of 09-24); the
   * deck's `(index % 7) * 0.9` has always been read as radians.
   */
  widthPhase?: number;
  /**
   * The master to feed. Without one the graph builds its own, which is what a
   * single track and the offline render of a single track do. A caller holding
   * the handle from `src/graph.ts` hands it over *there*: what reaches here is
   * always the chain behind it.
   */
  master?: MasterChain | null;
}

// The shared master: one of these per audio context, and everything goes
// through it — one track, or two decks running into each other at a seam.
//
// It used to be part of every graph, which meant the mix ran two limiters and
// two soft clippers on two halves of the same sound and summed the results
// straight to the speakers with nothing after them. Two decks at full fader
// is +6 dB, and what a listener hears when that lands on a 45 Hz sine is the
// bass distorting. One limiter, once, at the end.
// The limiter's module, loaded once per context. `buildMaster` is synchronous
// and `addModule` is not, so the load is a separate step a caller awaits before
// building the graph; a context that has not been through it, or one where the
// load failed, gets the fallback instead of a broken node.
//
// (`limiterGr`, `resetLimiterGr` and `limiterAvailable` were here, for a bench
// that asks the taps now; nothing read them, and round (f) of the reconciled
// review of 09-24 took them out, R127.)
const limiterReady = new WeakSet<BaseAudioContext>();
const limiterTried = new WeakMap<BaseAudioContext, Promise<boolean>>();
// Why a context's module did not load, where it had worklets to load it into:
// what a page reports (round R1 of the reports); nothing where there were none.
const limiterFailed = new WeakMap<BaseAudioContext, unknown>();
/** The error the limiter's module failed with on this context, or `null`. */
export const limiterFailure = (ctx: BaseAudioContext): unknown => (limiterFailed.has(ctx) ? limiterFailed.get(ctx) : null);
/**
 * The worklet's module, loaded once per context. Which module it is, and
 * whether it loads, is a property of the *context* and not of a room, so the
 * only thing settings say here is the decibel in the message when it does not
 * — and the fallback gain itself is read by `buildMaster` from its own
 * settings. A caller with no theme chosen yet (the page, before the first
 * mix) passes none and the log simply says the master runs lower: there is no
 * base table to fall back on any more, because the table is a style's and this
 * file does not know one.
 */
export function prepareLimiter(ctx: BaseAudioContext, settings: Settings | null = null): Promise<boolean> {
  if (limiterTried.has(ctx)) return limiterTried.get(ctx)!;
  const done = (async () => {
    if (!ctx.audioWorklet) return false;
    try {
      await ctx.audioWorklet.addModule(new URL('./limiter-worklet.js', import.meta.url));
      limiterReady.add(ctx);
      return true;
    } catch (e) {
      limiterFailed.set(ctx, e);
      if (typeof console !== 'undefined') {
        const how = settings ? `${settings.master.limiterFallbackDb} dB lower` : 'lower';
        console.log('limiter worklet unavailable, master runs ' + how + ': ' + (e as Error).message);
      }
      return false;
    }
  })();
  limiterTried.set(ctx, done);
  return done;
}

/**
 * The set's own room. It belongs to neither theme at a seam, so it is resolved
 * and handed in rather than taken from whatever was applied last — which is
 * what used to make a record's presence and air depend on the order things
 * happened to be worked out in.
 */
export function buildMaster(ctx: BaseAudioContext, settings: Settings): MasterChain {
  const P = settings;
  // The tone the chain opens at: the settings' own profile. Its corners and
  // widths are read below beside it, and stay.
  const eq = eqProfileOf(P.master);

  const out = ctx.createGain();
  out.gain.value = 1;

  // The trim is the last thing in the chain, so a change of ceiling never
  // changes what the limiter is doing.
  const trim = ctx.createGain();
  trim.gain.value = P.master.trim;
  trim.connect(out);

  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(P.master.clipDrive, P.master.clipKnee);
  clip.oversample = P.master.oversample;
  clip.connect(trim);

  // The ceiling: a look-ahead brick-wall limiter we own, in front of the
  // clipper. Everything before this point can be as loud as the arrangement
  // makes it; nothing after it can exceed the ceiling. The clipper behind it
  // is back to being what its comment always claimed -- a true-peak safety
  // that catches inter-sample overs and otherwise passes the signal through
  // untouched -- because the limiter now holds the level it used to hold by
  // shaping a quarter of full scale off the top of the loudest scenes.
  const L = P.master.limiter;
  // A ceiling of 1 or more cannot limit anything this chain produces, so it
  // means "no limiter" and the node is not built at all -- which is what
  // ?limiter=0 asks for.
  const limitOn = L.ceiling < 1;
  const haveWorklet = limitOn && limiterReady.has(ctx) && typeof AudioWorkletNode === 'function';
  let limiter: AudioWorkletNode | GainNode;
  // The worklet's port, or nothing: a caller that has to tell the processor to
  // write out its tail and finish asks for this rather than reaching into a
  // node that is a gain half the time.
  let limiterPort: MessagePort | null = null;
  if (haveWorklet) {
    const node = new AudioWorkletNode(ctx, 'lookahead-limiter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      // ...and what stands after it, so it can say when the output reaches
      // full scale (S16): the clipper's curve and the trim. A retune that
      // moves the trim posts the new one (`mix.ts`).
      processorOptions: { lookaheadMs: L.lookaheadMs, holdMs: L.holdMs, releaseMs: L.releaseMs,
        post: { gain: P.master.trim, knee: P.master.clipKnee, drive: P.master.clipDrive } },
    });
    // The processor declares it, so it is there: `parameters` is a map and
    // answers `undefined` for a name nobody declared.
    node.parameters.get('ceiling')!.value = L.ceiling;
    // What the ceiling had to do is posted on the port eight times a second,
    // and whoever wants it listens (`taps.ts`, the scene gate). Started here,
    // because a port that only has listeners added to it never starts.
    node.port.start();
    limiter = node;
    limiterPort = node.port;
  } else {
    // No worklet, no ScriptProcessor: a ScriptProcessor runs on the main
    // thread and is exactly the node that put the block-grid bursts in the
    // capture. The honest fallback is to be quieter, so the clipper is not
    // asked to do a limiter's job.
    limiter = ctx.createGain();
    limiter.gain.value = limitOn ? dbToGain(P.master.limiterFallbackDb) : 1;
  }
  limiter.connect(clip);

  const master = ctx.createGain();
  master.gain.value = P.master.gain;
  master.connect(limiter);

  // A little air on the whole record, so the hats read as hats.
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = P.master.airHz;
  air.gain.value = eq.airDb;
  air.connect(master);

  // Presence: the 2-6 kHz band the reference sets carry and a synthesised mix
  // does not. Tuned against the band table, not by taste.
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = P.master.presenceHz;
  presence.gain.value = eq.presenceDb;
  presence.Q.value = P.master.presenceQ;
  presence.connect(air);

  // The midrange. MEASURED against the three sets' long-term spectrum: 500 Hz
  // to 2 kHz sits 15-22 dB under them, because the record is a kick, a sub and
  // a chord layer and a DJ set is a full production. A filter cannot invent
  // the parts that are missing, so this is deliberately a broad, gentle lift
  // and not an attempt to close the whole gap: the rest of it is the level of
  // the harmonic layers and how far back the sound stage pushes them.
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = P.master.midHz;
  mid.gain.value = eq.midDb;
  mid.Q.value = P.master.midQ;
  mid.connect(presence);

  // The octave between the kick's body and the bottom of the chords, which the
  // generator leaves thin and the reference sets do not.
  const lowMid = ctx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = P.master.lowMidHz;
  lowMid.gain.value = eq.lowMidDb;
  lowMid.Q.value = P.master.lowMidQ;
  lowMid.connect(mid);

  // The shelf that keeps the bass fundamental off the bell above it. The bell
  // is 160 Hz wide enough to be still lifting at 40, and every note the sub
  // plays lives there; the shelf takes the skirt back below about 90 Hz and
  // leaves the octave the bell was aimed at alone. It sits immediately in
  // front of the bell, so the two read as one stage.
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = P.master.lowShelfHz;
  lowShelf.gain.value = eq.lowShelfDb;
  lowShelf.connect(lowMid);

  // A wide, gentle high-pass keeps DC and subsonic rumble out of the file.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = P.master.dcHz;
  dcBlock.Q.value = P.master.dcQ;
  dcBlock.connect(lowShelf);

  // Each tone gain's written line, made the first time the profile moves, so
  // a chain that never moves writes nothing on its parameters.
  const stages = { lowShelf, lowMid, mid, presence, air };
  const lines = new Map<keyof EqProfile, Line>();
  const lineOf = (band: keyof EqProfile): Line => {
    let l = lines.get(band);
    if (!l) { const g = stages[EQ_STAGES[band]].gain; l = line(ctx, g, g.value); lines.set(band, l); }
    return l;
  };
  // What was asked, and a hand's offsets over it: a band stands at the sum.
  let asked: EqProfile = { ...eq };
  const leans: Partial<Record<keyof EqProfile, number>> = {};
  function setProfile(profile: EqProfile, at: number, over: number = EQ_RAMP_S): number {
    let lands = at;
    for (const band of EQ_BANDS) {
      const v = profile[band];
      if (!Number.isFinite(v)) continue;
      asked = { ...asked, [band]: v };
      lands = Math.max(lands, lineOf(band).to(v + (leans[band] ?? 0), at, over));
    }
    return lands;
  }
  function lean(band: keyof EqProfile, offset: number, at: number, over: number = EQ_RAMP_S): number {
    if (offset) leans[band] = offset; else delete leans[band];
    return lineOf(band).to(asked[band] + offset, at, over);
  }
  function profileAt(t: number): EqProfile {
    const then = {} as EqProfile;
    for (const band of EQ_BANDS) {
      const l = lines.get(band);
      then[band] = l ? l.at(t) : stages[EQ_STAGES[band]].gain.value;
    }
    return then;
  }

  return { ctx, input: dcBlock, out, dcBlock, lowShelf, lowMid, mid, presence, air, master, limiter, limiterPort, clip, trim, limiterIsWorklet: haveWorklet, settings, setProfile, lean, profile: () => ({ ...asked }), profileAt };
}

// One theme's graph: its buses, its sends, its sidechain, its width and its
// macro filter. `opts.master` hands it a master to feed; without one it builds
// its own, which is what a single track and the offline render of a single
// track do.
/**
 * @param settings this theme's own, resolved once and owned by the
 *   deck, the player or the render that built this graph
 */
/**
 * **The two impulse responses every graph of this room builds**, its reverb
 * and its room, computed now and cached for the context (`impulseResponse`),
 * so that a graph built later — a hand's hand-over into another room, on the
 * tick that lays it — finds them made (the engine review of 10-08, F4: 5 to
 * 14 ms of a cast's seam). The same arguments `buildGraph` passes, below.
 */
export function warmRoom(ctx: BaseAudioContext, settings: Settings): void {
  const P = settings;
  impulseResponse(ctx, P.sends.reverbSeconds, 3.1, 'hall', P.sends.reverbCorr);
  impulseResponse(ctx, P.sends.roomSeconds, 5.5, 'room', P.sends.roomCorr);
}

export function buildGraph(ctx: BaseAudioContext, settings: Settings, opts: GraphOptions = {}): ThemeGraph {
  // Anything whose only path to the destination is through an AudioParam can
  // be collected while it is still meant to be running. Hold on to them.
  const keepAlive: AudioNode[] = [];
  const bpm = opts.bpm || 122;
  const beatSeconds = 60 / bpm;
  const P = settings;

  // Everything this theme makes, gathered in one place: the mono-folded
  // bottom, the wide top, and the kick-and-bass bus. The mono-maker and the
  // width stage stay here rather than in the master, because they are measured
  // per band against *this* theme's material, not against a sum of two.
  // The theme's own output gain, and the one place a per-theme loudness trim
  // is applied: under everything the theme does to itself — the sound stage,
  // the width, the macro filter — and above the master every deck shares, so
  // the limiter and the make-up see a record that has already been levelled
  // rather than one whose rooms are three decibels apart. `opts.trimDb` is
  // `track.trimDb`, worked out at plan time by `loudnessTrimDb` in params.ts;
  // without one it is 0 dB and this node is what it always was.
  const themeOut = ctx.createGain();
  themeOut.gain.value = dbToGain(opts.trimDb || 0);

  // **A soft clip on the theme's own sum** (round DNB-4, `master.mixClip`),
  // after its trim and before the master every deck shares: what the drums'
  // clip leaves — the kick, the snare, the bass and the bed landing on one
  // instant — is rounded where it stands, so the limiter after it holds a
  // ceiling and does not pull the whole mix down for a beat. Absent, the trim
  // is the theme's last node, as it always was.
  const clipNodes = (C: { driveDb: number; knee?: number; curve?: number; makeupDb?: number }, into: AudioNode, mono: boolean): AudioNode => {
    const pre = ctx.createGain();
    pre.gain.value = dbToGain(C.driveDb);
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(C.curve ?? 2, C.knee ?? 0.6);
    shaper.oversample = P.master.oversample;
    const post = ctx.createGain();
    // the drive back down, and the clip's make-up where a room asks one (10-06, hands-on: a master pushed into the limiter, as source 9's is)
    post.gain.value = dbToGain(-C.driveDb + (C.makeupDb ?? 0));
    if (mono) for (const n of [pre, shaper, post]) { n.channelCount = 1; n.channelCountMode = 'explicit'; }
    pre.connect(shaper);
    shaper.connect(post);
    post.connect(into);
    return pre;
  };
  let themeTail: GainNode = themeOut;
  // **A gentle compressor on the theme's own sum** (round DNB-5,
  // `master.busComp`): after the trim, so it works on the level the theme
  // plays at, and before the clip and the master. Absent, nothing is built.
  const BC = P.master.busComp;
  if (BC && BC.ratio > 1) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = BC.threshold;
    comp.knee.value = BC.knee;
    comp.ratio.value = BC.ratio;
    comp.attack.value = BC.attack;
    comp.release.value = BC.release;
    const after = ctx.createGain();
    themeTail.connect(comp);
    comp.connect(after);
    themeTail = after;
  }
  const MC = P.master.mixClip;
  if (MC && MC.driveDb > 0) {
    const after = ctx.createGain();
    themeTail.connect(clipNodes(MC, after, false));
    themeTail = after;
  }
  const chain = opts.master || buildMaster(ctx, settings);
  const out = opts.master ? themeTail : chain.out;
  if (!opts.master) themeTail.connect(chain.input);
  // What the theme's stages end on. It was called `dcBlock`, the name of the
  // master's high-pass, which it is not: it is the theme's output gain, and the
  // DC block is in the chain behind it (R80).
  const themeEnd = themeOut;

  // Macro filter: the one automated knob of the arrangement. Its Q is 0.707,
  // which in Web Audio's units is +0.707 dB at the corner and **not**
  // Butterworth (that is -3.01, the note below): a slight lift, left as it is
  // because the record was made with it. It stays low for the reason it was
  // chosen: a resonant lowpass parked near Nyquist rings on every hat
  // transient, which reads as a click in the file.
  const macro = ctx.createBiquadFilter();
  macro.type = 'lowpass';
  macro.frequency.value = P.master.filterOpen;
  macro.Q.value = 0.707;

  // Mono below a corner, done as mid/side rather than as a crossover.
  //
  // MEASURED: 30-120 Hz is mono to three decimal places in the sources — but
  // 120-300 Hz is *not*: it still carries a side/mid of 0.38. What this stage
  // has to do is therefore narrow, and it used to be built the wrong way. An
  // 85 Hz lowpass folded to mono was summed with a 60 Hz stereo highpass at
  // the same polarity, and two filters of the same order at different corners
  // are not complementary: their phases disagree where they overlap, so the
  // sum notched the *mid* while the highpass went on passing the side.
  // Measured on the browser's own biquads at 48 kHz, mono in:
  //
  //   Hz        50     60     85    100    120    250
  //   mid    -4.57  -2.76  -2.76  -4.45  -4.33  -0.82
  //   side   -1.69  +0.50  +1.58  +1.36  +1.05  +0.27
  //
  // — four and a half decibels out of the centre of the record at 50 and
  // 100 Hz, and a low end that was never actually mono. Any low-mid EQ tuned
  // against that was compensating for a hole this stage had dug.
  //
  // Mid/side has neither problem by construction: M = (L+R)/2 goes through
  // untouched, so the magnitude response of the centre is exactly 0 dB at
  // every frequency, and only S = (L-R)/2 is highpassed. Below the corner
  // there is no side, which *is* mono; above it the width is whatever the
  // material had.
  //
  // A units note, because it is a real trap: Web Audio's `Q` on `lowpass` and
  // `highpass` is in **decibels of resonance at the cutoff**, not the linear Q
  // of a textbook biquad. `Q = 0.707` is +0.707 dB of peaking, not
  // Butterworth; Butterworth is linear 1/sqrt(2), which is `Q = -3.01` here.
  // `P.space.sideHpQdB` is named for its unit and set to that. The other Q
  // values in this file are deliberately left alone: several are timbres
  // tuned by ear around the response they actually have, and converting them
  // wholesale would change the sound without a measurement asking for it.
  const msLowSplit = ctx.createChannelSplitter(2);
  const lowMidSum = ctx.createGain();
  lowMidSum.gain.value = 0.5;
  const lowSidePos = ctx.createGain();
  lowSidePos.gain.value = 0.5;
  const lowSideNeg = ctx.createGain();
  lowSideNeg.gain.value = -0.5;
  msLowSplit.connect(lowMidSum, 0);
  msLowSplit.connect(lowMidSum, 1);
  msLowSplit.connect(lowSidePos, 0);
  msLowSplit.connect(lowSideNeg, 1);

  const sideHp = ctx.createBiquadFilter();
  sideHp.type = 'highpass';
  sideHp.frequency.value = P.space.sideHpHz;
  sideHp.Q.value = P.space.sideHpQdB;
  lowSidePos.connect(sideHp);
  lowSideNeg.connect(sideHp);

  const sideHpNeg = ctx.createGain();
  sideHpNeg.gain.value = -1;
  sideHp.connect(sideHpNeg);

  const msLowMerge = ctx.createChannelMerger(2);
  lowMidSum.connect(msLowMerge, 0, 0);
  lowMidSum.connect(msLowMerge, 0, 1);
  sideHp.connect(msLowMerge, 0, 0);
  sideHpNeg.connect(msLowMerge, 0, 1);
  msLowMerge.connect(themeEnd);

  macro.connect(msLowSplit);

  // Sidechain duck. Melodic material goes through it; the kick does not.
  const duck = ctx.createGain();
  duck.gain.value = 1;

  // MEASURED: the image breathes. The side/mid ratio of the chord band
  // modulates at about 0.21 Hz with a coefficient of variation of 0.45, and
  // that movement — not more width — is what a static generator is missing.
  // Mid/side: M = (L+R)/2, S = (L-R)/2, S scaled by a slow LFO, then back.
  const msSplit = ctx.createChannelSplitter(2);
  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  const side = ctx.createGain();
  side.gain.value = 0.5;
  const sideNeg = ctx.createGain();
  sideNeg.gain.value = -0.5;
  msSplit.connect(mid, 0);
  msSplit.connect(mid, 1);
  msSplit.connect(side, 0);
  msSplit.connect(sideNeg, 1);
  const sideSum = ctx.createGain();
  sideSum.gain.value = 1;
  side.connect(sideSum);
  sideNeg.connect(sideSum);

  const width = ctx.createGain();
  width.gain.value = P.space.widthBase;
  sideSum.connect(width);
  const widthLfo = phasedLfo(ctx, P.space.widthRateHz, opts.widthPhase || 0);
  const widthDepth = ctx.createGain();
  widthDepth.gain.value = P.space.widthDepth;
  widthLfo.connect(widthDepth);
  widthDepth.connect(width.gain);
  // From the deck's first bar line (`opts.at`, nought offline), as the bass drive's wobble is: its
  // phase is the theme's, whenever the graph was built (a graph may be built ahead of its seam).
  widthLfo.start(opts.at ?? 0);
  keepAlive.push(widthLfo, widthDepth);

  const widthNeg = ctx.createGain();
  widthNeg.gain.value = -1;
  width.connect(widthNeg);

  const msMerge = ctx.createChannelMerger(2);
  mid.connect(msMerge, 0, 0);
  mid.connect(msMerge, 0, 1);
  width.connect(msMerge, 0, 0);
  widthNeg.connect(msMerge, 0, 1);

  duck.connect(msSplit);
  msMerge.connect(macro);

  // **The struck voices' duck** (round PIANO-2): beside `duck`, into the same
  // width stage, for the notes that arrive as a hit (`strikes` in the voice
  // registry). The kick writes both on every beat — the pads' pump on `duck`,
  // a shallow dip after the strike on this one (`struckDuckShape`,
  // `program.ts`) — so a held chord breathes with the kick and a piano note
  // struck on it keeps its hammer. Nothing reaches it until a struck note is
  // played: the struck harmonic path below is built for a program that has
  // one, and a gain at one with nothing into it is silence.
  const struckDuck = ctx.createGain();
  struckDuck.gain.value = 1;
  struckDuck.connect(msSplit);

  // **One harmonic path**: the bus's own gain, the seam gain, the edge, the
  // bell, into the duck it ends on — and, built on the first read of a path
  // into them, the close and the sweep (below). The bus has one for the held
  // voices, ending on `duck`, and (round PIANO-2) one for the struck voices,
  // ending on `struckDuck`, so that two notes on one bus can take two ducks.
  // Two and not one with two ducks after it, because everything on the path
  // before the duck is the notes' own and the edge is a clipper: a sum can be
  // split by nothing after it, and a duck moved before the clipper would be
  // read by the clip as a quieter chord. The struck path's parameters follow
  // the held path's (`twins`, below), so an automation line written on one is
  // written on both, and neither its edge nor its bell nor a seam is a
  // different sound for a struck note than for a held one.
  interface HarmonicPath {
    melodic: GainNode;
    harmonic: GainNode;
    bell: BiquadFilterNode | null;
    /** the edge in parallel, where it was built */
    edge: HarmonicEdgeStage | null;
    /** the path's end and what it feeds, as the close and the sweep splice in */
    tail: AudioNode;
    into: AudioNode;
    /** the duck it ends on */
    end: AudioNode;
    lp: BiquadFilterNode | null;
    sweep: BusSweep | null;
  }
  // whether the desk is up over a playing context, read once for the graph so both paths are built alike (DESK-EDGE)
  const armedHere = liveArmed() && !isOffline(ctx);
  const harmonicPath = (end: AudioNode): HarmonicPath => {
    const melodic = ctx.createGain();
    melodic.gain.value = 1;
    // **The harmonic sum's seam gain** (round MIX-X2). `melodic.gain` is the
    // theme's own — its arrangement writes a line on it (`melodicGain`) — and a
    // hand-over that fades the harmony out before the swap and in after it
    // needs a parameter nothing else writes, because two writers on one
    // AudioParam is the fault `ramp.ts` exists to prevent. So the sum passes
    // through one more gain at unity, which only a seam ever moves
    // (`harmonic.gain` by path): a multiply by one is the signal to the sample,
    // and a theme whose seam never names it plays through the graph it always
    // did. The sends' returns join after it at the duck, so what it fades is the
    // pads and the keys themselves and not their rooms.
    const harmonic = ctx.createGain();
    harmonic.gain.value = 1;
    melodic.connect(harmonic);
    // **The harmonic bus's edge in parallel** (round SPARK-1,
    // `effects/harmonic-edge.ts`): the bass drive's topology on the bus that has
    // notes, its copy kept over a floor near two kilohertz, so what it adds is
    // the chords' own harmonics and nothing at their register. After the seam
    // gain and before the bell and the duck, so it takes the pads, the keys and
    // the leads and never a return. Built only where a theme's settings carry
    // it with a blend above nought; otherwise the bus is wired as it always was
    // — but for the desk (DESK-EDGE, D1b's pattern for the strings' breath):
    // while it is up, a graph on a playing context builds the edge at nought,
    // from the room's numbers or the place table's where the room has none
    // (`HARMONIC_EDGE_AT_NOUGHT`), so a hand bringing it in is heard on the
    // chord that is sounding. A blend of nought into the sum is the bus to the
    // sample; away from the desk, and in a render, nothing is built for it.
    const edgeSpec = P.harmonicEdge;
    const edgeAt = edgeSpec && edgeSpec.blend > 0 ? edgeSpec
      : armedHere ? { ...(edgeSpec ?? HARMONIC_EDGE_AT_NOUGHT), blend: 0 } : null;
    let harmonicOut: AudioNode = harmonic;
    let edge: HarmonicEdgeStage | null = null;
    if (edgeAt) {
      edge = buildHarmonicEdge(ctx, edgeAt);
      harmonic.connect(edge.input);
      harmonicOut = edge.output;
    }
    // **The presence bell on the harmonic bus** (round EQ-2, `harmonicBell`):
    // the notes' own 1.1 kHz lifted on the bus that has notes, where the
    // master's mid bell lifts a band the house's grooves leave nearly empty.
    // Before the duck, not after it: the duck is where the sends' returns join,
    // so here the bell shapes the pads, the keys and the leads and leaves their
    // reverb and echo as they were — a brighter chord, not a brighter wash.
    // Built only where a theme's settings carry one with a gain, so a theme
    // that asks for none plays through the graph it always did.
    const bellSpec = P.harmonicBell;
    let bell: BiquadFilterNode | null = null;
    if (bellSpec && bellSpec.db) {
      bell = ctx.createBiquadFilter();
      bell.type = 'peaking';
      bell.frequency.value = bellSpec.hz;
      bell.Q.value = bellSpec.q;
      bell.gain.value = bellSpec.db;
      harmonicOut.connect(bell);
      bell.connect(end);
    } else {
      harmonicOut.connect(end);
    }
    // The harmonic path's end and what it feeds, as either is rebuilt: the
    // close below puts a filter after `harmonic` (after the bell, where there
    // is one), the sweep puts its stages before the duck, and whichever is
    // built second has to splice into what the first left.
    return { melodic, harmonic, bell, edge, tail: bell ?? harmonicOut, into: end, end, lp: null, sweep: null };
  };
  const held = harmonicPath(duck);
  const melodic = held.melodic;
  const harmonic = held.harmonic;
  const harmonicBell = held.bell;

  const drums = ctx.createGain();
  drums.gain.value = 1;
  // **The drums' clip** (round DNB-4, `master.drumClip`): where a room asks
  // for one, the drums' bus and the kick's each pass through a soft clipper
  // before anything sums them — the drive up, the curve, the drive back down,
  // so everything under the knee is a wire and only a hit's first peak is
  // rounded. A clip has no memory: it takes a transient's top off where it
  // stands and moves nothing after it, which a limiter downstream, pulling the
  // whole mix down for a beat after every snare, cannot say of itself. Absent
  // (every room until this round) nothing is built and the bus is the bus.
  const clipOf = (into: AudioNode, mono: boolean, own?: { driveDb: number; knee?: number; curve?: number }): AudioNode => {
    const C = own ?? P.master.drumClip;
    return C && C.driveDb > 0 ? clipNodes(C, into, mono) : into;
  };
  drums.connect(clipOf(macro, false));

  // The kick and the bass share one bus and one compressor, so they read as
  // one instrument rather than two things that happen at the same time.
  //
  //   kick ---------------------------+
  //   sub -> duck -> body -> comp ----+-> glue -> saturation -> themeEnd
  //
  // The saturation and the glue are only built when they are doing something.
  // A WaveShaper with an identity curve and a compressor at ratio 1 are not
  // free: they are nodes in the path, and MEASURED, Firefox renders this
  // stretch of the chain very differently from Chromium — the kick's onset
  // step is 0.62 of its peak through the theme graph against 0.06 in Chromium
  // and 0.05 straight off the bus.
  // Each of the two is built inside the branch that wants it rather than
  // built first and configured after: the same node in the same order, and the
  // shaper is a `WaveShaperNode` where its curve is set instead of a node that
  // might be either.
  const glueDrive = P.master.glue.drive;
  let glueSat: WaveShaperNode | GainNode;
  if (glueDrive > 0) {
    const sat = ctx.createWaveShaper();
    sat.curve = saturationCurve(glueDrive);
    sat.oversample = P.master.oversample;
    glueSat = sat;
  } else {
    glueSat = ctx.createGain();
  }
  glueSat.connect(themeEnd);

  const glueOn = P.master.glue.ratio > 1;
  let glue: DynamicsCompressorNode | GainNode;
  if (glueOn) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = P.master.glue.threshold;
    comp.knee.value = P.master.glue.knee;
    comp.ratio.value = P.master.glue.ratio;
    comp.attack.value = P.master.glue.attack;
    comp.release.value = P.master.glue.release;
    glue = comp;
  } else {
    glue = ctx.createGain();
  }
  glue.connect(glueSat);

  // Nothing below the low twenties survives: it is headroom spent on something
  // no speaker in the room can reproduce.
  const lowHp = ctx.createBiquadFilter();
  lowHp.type = 'highpass';
  lowHp.frequency.value = P.bass.hpHz;
  lowHp.Q.value = P.bass.hpQ ?? 0.7;
  lowHp.connect(glue);

  // The push: a hot saturation of the low end in parallel with the clean one,
  // blended in by the arrangement for a few bars at a time. The clean path
  // remains, but the saturated copy adds fundamental as well as harmonics;
  // its amount changes the shared kick/bass weight, not just its brightness.
  const pushSat = ctx.createWaveShaper();
  pushSat.curve = saturationCurve(P.push.satDrive);
  pushSat.oversample = P.master.oversample;
  const pushWet = ctx.createGain();
  pushWet.gain.value = 0;
  lowHp.connect(pushSat);
  pushSat.connect(pushWet);
  pushWet.connect(glue);

  const lowSum = ctx.createGain();
  lowSum.gain.value = 1;
  // The low sum's own clip, where the room asks for the kick and the bass to be
  // rounded together (`drumClip.low`); else the kick's alone, below.
  lowSum.connect(P.master.drumClip?.low ? clipOf(lowHp, true, P.master.drumClip.low) : lowHp);

  const kickBus = ctx.createGain();
  kickBus.gain.value = 1;
  kickBus.connect(P.master.drumClip?.low ? lowSum : clipOf(lowSum, true));

  // "Kick and bass mono" is the first rule in the file, and it was an
  // assumption about the voices rather than a property of the bus. It is now
  // the bus: one channel, explicitly, so whatever a voice hands it is summed
  // to the middle here and this stretch of the chain cannot be stereo.
  //
  // MEASURED, and the reason this is a rule and not a tidy-up. The kick still
  // builds its midrange click -- a burst off the *stereo* noise buffer, whose
  // two channels are only 0.62 correlated -- and `clickLevel` has been 0 since
  // the kick was measured against the benchmark slots, so what plays is the
  // 0.0002 floor the envelope will not go under: -74 dB, inaudible, and two
  // channels wide. That was enough to make the kick bus a *two* channel stream
  // for the five milliseconds of the click and a one channel stream for the
  // rest of the beat, and Firefox allocates a filter's per-channel state when
  // the channel arrives: at every kick, `lowHp`, `glue`, `pushSat` and every
  // biquad in the master grew a second channel whose history was zero while
  // the first kept the bass it had been filtering. The right channel then
  // rendered the bass through a highpass starting from rest -- a step of 0.52
  // at the output against 0.0001 in WebKit, right channel only, once per beat.
  // That is the click Eugene heard in one earphone in Firefox and in no other
  // engine. With the count pinned there is no second channel to arrive.
  for (const n of [kickBus, lowSum]) {
    n.channelCount = 1;
    n.channelCountMode = 'explicit';
  }

  // The bass, ducked and then compressed on its own before the glue: the duck
  // is the groove, the compressor is the density.
  const bassComp = ctx.createDynamicsCompressor();
  bassComp.threshold.value = P.bass.comp.threshold;
  bassComp.knee.value = P.bass.comp.knee;
  bassComp.ratio.value = P.bass.comp.ratio;
  bassComp.attack.value = P.bass.comp.attack;
  bassComp.release.value = P.bass.comp.release;

  // Body: the 80-160 Hz that turns a sine into a note you can hum.
  const bassBody = ctx.createBiquadFilter();
  bassBody.type = 'peaking';
  bassBody.frequency.value = P.bass.bodyHz;
  bassBody.gain.value = P.bass.bodyDb;
  bassBody.Q.value = P.bass.bodyQ;
  bassBody.connect(bassComp);

  // The duck sits *after* the bass compressor, not before it. With the duck
  // first, the compressor spent its time pushing the ducked part back up and
  // the bass came out as a straight line — which is most of why it read as a
  // hum rather than as a part.
  const duckLow = ctx.createGain();
  duckLow.gain.value = 1;
  duckLow.connect(lowSum);
  bassComp.connect(duckLow);
  // A dB or two of sub, only at the moments the push is up. It is its own node
  // because the transition automates the sub *bus* and the two must not fight.
  const subPush = ctx.createGain();
  subPush.gain.value = 1;
  subPush.connect(bassBody);
  const subBus = ctx.createGain();
  subBus.gain.value = 1;
  subBus.channelCount = 1;
  subBus.channelCountMode = 'explicit';
  // **The bass drive in parallel** (round B1, `effects/bass-drive.ts`): a
  // driven copy of the bass summed under the clean one, between the bus and
  // the body filter, so the body, the compressor and the duck read the pair
  // as the one bass they are. Built only where the theme's own settings carry
  // it with a blend above nought (`bass.parallel`, the composer's place table
  // writes it): a theme at the house wires the bus to the push as it always
  // did, node for node, and no bypassed shell stands in the sub's way.
  const parallel = P.bass.parallel;
  let bassDriveFx: EffectInstance | null = null;
  if (parallel && parallel.blend > 0) {
    // The beat it is played on, for the wobble's period, and the instant the
    // theme begins (`opts.at`: the deck's first bar line; nought offline,
    // where a render starts on one), for the wobble's phase.
    bassDriveFx = bassDrive(ctx, settings, { ...parallel, beat: beatSeconds }, opts.at ?? 0);
    subBus.connect(bassDriveFx.input);
    bassDriveFx.output.connect(subPush);
  } else {
    subBus.connect(subPush);
  }

  // --- delay send: dotted eighth, one line (not a ping-pong: below) ---
  const beat = 60 / bpm;
  const delayTime = P.sends.delayDotted * beat;
  const delayIn = ctx.createGain();
  delayIn.gain.value = 1;
  const dL = ctx.createDelay(2);
  dL.delayTime.value = delayTime;
  const fb = ctx.createGain();
  fb.gain.value = P.sends.delayFeedback;
  // MEASURED: ping-pong asymmetry is 0.00 at every lag in every window — these
  // records do not ping-pong their delays. One line, returning to both
  // channels at once, each repeat darker than the last.
  const dTone = ctx.createBiquadFilter();
  dTone.type = 'lowpass';
  dTone.frequency.value = 2400;
  dTone.Q.value = 0.6;
  const delayOut = ctx.createGain();
  delayOut.gain.value = P.sends.delayLevel;

  delayIn.connect(dL);
  dL.connect(delayOut);
  dL.connect(dTone);
  dTone.connect(fb);
  fb.connect(dL);
  delayOut.connect(duck); // echoes duck under the kick too

  // --- reverb send ---
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const preDelay = ctx.createDelay(0.5);
  preDelay.delayTime.value = 0.018;
  const rvbCut = ctx.createBiquadFilter();
  rvbCut.type = 'highpass';
  // Low enough that the wash reaches into 120-300 Hz, where the references
  // still have width and energy, and high enough to stay off the bass.
  rvbCut.frequency.value = P.sends.reverbLowHz;
  const rvbTop = ctx.createBiquadFilter();
  rvbTop.type = 'lowpass';
  rvbTop.frequency.value = P.sends.reverbToneHz;
  const conv = ctx.createConvolver();
  conv.buffer = impulseResponse(ctx, P.sends.reverbSeconds, 3.1, 'hall', P.sends.reverbCorr); // as `warmRoom` asks
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = P.sends.reverbLevel;

  reverbIn.connect(preDelay);
  preDelay.connect(rvbCut);
  rvbCut.connect(conv);
  conv.connect(rvbTop);
  rvbTop.connect(reverbOut);
  reverbOut.connect(duck);

  // --- a slow chorus, shared by the keys, so stabs are wide without each
  // note carrying its own delay line --- one for each harmonic path's keys
  // (round PIANO-2), on the same two lines started at the same instant, so a
  // struck stab is as wide as a held one and as wide as it was.
  const chorusInto = (into: AudioNode): GainNode => {
    const keysIn = ctx.createGain();
    keysIn.gain.value = 1;
    const chorusDry = ctx.createGain();
    chorusDry.gain.value = 0.7;
    keysIn.connect(chorusDry);
    chorusDry.connect(into);
    [[0.012, 0.18, -0.6], [0.0175, 0.23, 0.6]].forEach(([base, rate, pan]) => {
      const dl = ctx.createDelay(0.1);
      dl.delayTime.value = base;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.0035;
      lfo.connect(depth);
      depth.connect(dl.delayTime);
      lfo.start(opts.at ?? 0);
      keepAlive.push(lfo, depth);
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      const wet = ctx.createGain();
      wet.gain.value = 0.42;
      keysIn.connect(dl);
      dl.connect(pn);
      pn.connect(wet);
      wet.connect(into);
    });
    return keysIn;
  };
  const keysIn = chorusInto(melodic);

  // --- the clap room: short, bright, and behind a real pre-delay ---
  const roomIn = ctx.createGain();
  roomIn.gain.value = 1;
  const roomPre = ctx.createDelay(0.5);
  roomPre.delayTime.value = P.sends.roomPreDelay;
  const roomHp = ctx.createBiquadFilter();
  roomHp.type = 'highpass';
  roomHp.frequency.value = P.sends.roomLowHz;
  const roomConv = ctx.createConvolver();
  roomConv.buffer = impulseResponse(ctx, P.sends.roomSeconds, 5.5, 'room', P.sends.roomCorr); // as `warmRoom` asks
  const roomLp = ctx.createBiquadFilter();
  roomLp.type = 'lowpass';
  roomLp.frequency.value = P.sends.roomHighHz;
  const roomOut = ctx.createGain();
  roomOut.gain.value = P.sends.roomLevel;
  roomIn.connect(roomPre);
  roomPre.connect(roomHp);
  roomHp.connect(roomConv);
  roomConv.connect(roomLp);
  roomLp.connect(roomOut);
  roomOut.connect(drums);

  // --- the piano's hall: long, dark and a little behind the note ---
  //
  // Built the first time something asks for it, so a theme with no piano in
  // it never pays for a four-second convolver. A deck asks when it is made, for
  // a program that sends to it (`prepareReturns`, src/scheduler.ts), so the
  // impulse is not computed on the tick a note is scheduled; `route()` checks
  // the send amount before it touches this getter.
  //
  // **One for each harmonic path** (round PIANO-2): the hall is the pianos'
  // room, and a piano's tail is mostly its hall — on the pads' duck the ring
  // of a struck note dipped eleven decibels at every kick between strikes,
  // which is the hole in the sustain the struck duck exists to close. So a
  // struck note's hall returns into `struckDuck` and a held note's into
  // `duck`; each is built the first time a note of its kind sends to it (the
  // impulse is one computation, cached), and a theme whose hall is the
  // piano's alone builds one, as it always did.
  const halls: { held: GainNode | null; struck: GainNode | null } = { held: null, struck: null };
  const hall = (which: 'held' | 'struck'): GainNode => {
    const had = halls[which];
    if (had) return had;
    const hallIn = ctx.createGain();
    halls[which] = hallIn;
    hallIn.gain.value = 1;
    const pre = ctx.createDelay(0.5);
    pre.delayTime.value = P.sends.hallPreDelay;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = P.sends.hallLowHz;
    const conv = ctx.createConvolver();
    conv.buffer = impulseResponse(ctx, P.sends.hallSeconds, P.sends.hallDecay, 'piano', P.sends.hallCorr);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = P.sends.hallToneHz;
    const level = ctx.createGain();
    level.gain.value = P.sends.hallLevel;
    hallIn.connect(pre);
    pre.connect(hp);
    hp.connect(conv);
    conv.connect(lp);
    lp.connect(level);
    level.connect(which === 'struck' ? struckDuck : duck);
    return hallIn;
  };

  // This return joins the drums after the melodic sidechain, so a long
  // background tail is not reshaped into a breath on every kick. The source
  // note retains its own dry bus and the existing musical parts keep theirs.
  let background: BackgroundSpace | null = null;
  const backgroundInput = (): GainNode => {
    background ??= backgroundSpace(ctx, drums, beatSeconds, settings.backgroundSpaces?.background ?? DEFAULT_SPACES.background);
    return background.input;
  };
  let immersed: BackgroundSpace | null = null;
  const immersedInput = (): GainNode => {
    immersed ??= backgroundSpace(ctx, drums, beatSeconds, settings.backgroundSpaces?.immersed ?? DEFAULT_SPACES.immersed);
    return immersed.input;
  };

  // The melodic bus's section sweeps (house-v2's `busSweeps`, round S2). Only
  // the melodic bus may take one: it carries the pads, the keys (through their
  // chorus) and the leads — the harmony a DJ's filter moves — and not the kick,
  // the sub or the drums, which are the floor and the grid and which the macro
  // filter already leaves the kick and the sub out of. The sends' returns join
  // after it, so a filtered chord keeps its room. Built on the first read.
  const sweepIn = (path: HarmonicPath): BusSweep => {
    if (path.sweep) return path.sweep;
    const stage = (type: BiquadFilterType, openHz: number, into: AudioNode): { input: GainNode; stage: SweepStage } => {
      const input = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = 1;
      wet.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = openHz;
      filter.Q.value = qFor(type, SWEEP_FILTER.resonanceDb);
      input.connect(dry);
      input.connect(filter);
      filter.connect(wet);
      dry.connect(into);
      wet.connect(into);
      return { input, stage: { cutoffHz: filter.frequency, dry, wet, filter } };
    };
    const lp = stage('lowpass', SWEEP_FILTER.lpOpenHz, path.end);
    const hp = stage('highpass', SWEEP_FILTER.hpOpenHz, lp.input);
    path.tail.disconnect(path.into);
    path.tail.connect(hp.input);
    path.into = hp.input;
    path.sweep = { hp: hp.stage, lp: lp.stage };
    return path.sweep;
  };
  const sweepOf = (): BusSweep => {
    if (held.sweep) return held.sweep;
    const made = sweepIn(held);
    if (struck) twinSweep(made, sweepIn(struck.path));
    return made;
  };

  // **The outgoing harmony's close** (round MIX-X4; Eugene, 10-02, on the
  // harmonic cross: a fade alone reads plain). One low-pass after the seam
  // gain, which a hand-over between unrelated keys closes on the deck that is
  // leaving as that gain fades (`seamCurves`, `harmonicLp.frequency`), so the
  // outgoing pads lose their top before they lose their level and the arriving
  // chords come in over a dull bed and not a bright one. Butterworth
  // (`Q = -3.01` dB, the units note above): flat when open, no peak at the
  // corner as it closes. Built on the first read, like the sweep; the sends'
  // returns join after it, so a closing chord keeps its room.
  const closeIn = (path: HarmonicPath): BiquadFilterNode => {
    if (path.lp) return path.lp;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    f.Q.value = -3.01;
    path.tail.disconnect(path.into);
    path.tail.connect(f);
    f.connect(path.into);
    path.tail = f;
    path.lp = f;
    return f;
  };
  const harmonicLpOf = (): BiquadFilterNode => {
    if (held.lp) return held.lp;
    const made = closeIn(held);
    if (struck) twin('harmonicLp.frequency', made.frequency, closeIn(struck.path).frequency);
    return made;
  };

  // **The struck path** (round PIANO-2): the second harmonic path, ending on
  // `struckDuck`, with a door for each harmonic bus — the melodic bus's own
  // gain, and the keys' chorus in front of it. Built the first time a struck
  // note's door is asked for, which a deck does when it is made, for a program
  // that has one (`prepareReturns`), and so before any automation line is laid
  // on the held path: from then on every line written on a path the two share
  // is written on both (`twin`), so the struck path is the held one, parameter
  // for parameter, with a different duck at its end. A theme with no struck
  // note never builds it.
  //
  // `twins` is what `param()` answers with for a path the two share: one
  // target per path, the same object on every ask, because a line (`ramp.ts`)
  // and the duck's writer keep their history by target.
  const twins = new Map<string, AutomationTarget>();
  const twin = (path: string, a: AudioParam, b: AudioParam): void => {
    // Whatever was written on the held one before the struck path existed is
    // not replayed; it starts where the held one stands.
    b.value = a.value;
    const both: Record<string, unknown> = {
      get value() { return a.value; },
      set value(v: number) { a.value = v; b.value = v; },
      get defaultValue() { return a.defaultValue; },
      get minValue() { return a.minValue; },
      get maxValue() { return a.maxValue; },
      setValueAtTime(v: number, t: number) { b.setValueAtTime(v, t); return a.setValueAtTime(v, t); },
      linearRampToValueAtTime(v: number, t: number) { b.linearRampToValueAtTime(v, t); return a.linearRampToValueAtTime(v, t); },
      exponentialRampToValueAtTime(v: number, t: number) { b.exponentialRampToValueAtTime(v, t); return a.exponentialRampToValueAtTime(v, t); },
      setTargetAtTime(v: number, t: number, c: number) { b.setTargetAtTime(v, t, c); return a.setTargetAtTime(v, t, c); },
      setValueCurveAtTime(v: Float32Array | number[], t: number, d: number) { b.setValueCurveAtTime(v, t, d); return a.setValueCurveAtTime(v, t, d); },
      cancelScheduledValues(t: number) { b.cancelScheduledValues(t); return a.cancelScheduledValues(t); },
    };
    // Firefox has no `cancelAndHoldAtTime`, and a writer asks whether it is
    // there before it uses it: the pair has it where the parameter does.
    const hold = (a as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
    if (typeof hold === 'function') {
      both.cancelAndHoldAtTime = (t: number) => {
        (b as AudioParam & { cancelAndHoldAtTime: (t: number) => AudioParam }).cancelAndHoldAtTime(t);
        return hold.call(a, t);
      };
    }
    twins.set(path, both as unknown as AutomationTarget);
  };
  const twinSweep = (a: BusSweep, b: BusSweep): void => {
    for (const s of ['hp', 'lp'] as const) {
      twin(`sweep.${s}.cutoffHz`, a[s].cutoffHz, b[s].cutoffHz);
      twin(`sweep.${s}.wet.gain`, a[s].wet.gain, b[s].wet.gain);
      twin(`sweep.${s}.dry.gain`, a[s].dry.gain, b[s].dry.gain);
    }
  };
  let struck: { path: HarmonicPath; buses: Buses } | null = null;
  const struckOf = (): { path: HarmonicPath; buses: Buses } => {
    if (struck) return struck;
    const path = harmonicPath(struckDuck);
    const keys = chorusInto(path.melodic);
    struck = { path, buses: { melodic: bus(path.melodic, 'struck'), keys: bus(keys, 'struck') } };
    twin('melodic.gain', melodic.gain, path.melodic.gain);
    twin('harmonic.gain', harmonic.gain, path.harmonic.gain);
    if (harmonicBell && path.bell) twin('harmonicBell.gain', harmonicBell.gain, path.bell.gain);
    // The edge has no automation line; a desk move made on the held one
    // before the struck path existed (DESK-EDGE) is where the struck one starts.
    if (held.edge && path.edge) {
      for (const k of ['blend', 'preHz', 'floorHz', 'toneHz'] as const)
        path.edge.params[k].forEach((q, i) => { const v = held.edge!.params[k][i]!.value; if (q.value !== v) q.value = v; });
      if (path.edge.driveNow() !== held.edge.driveNow()) path.edge.drive(held.edge.driveNow(), ctx.currentTime, 0);
    }
    // A close or a sweep already built on the held path (a program whose door
    // was asked late) is built here too, from where it stands.
    if (held.lp) twin('harmonicLp.frequency', held.lp.frequency, closeIn(path).frequency);
    if (held.sweep) twinSweep(held.sweep, sweepIn(path));
    return struck;
  };

  // **The echo** (round KV1): the kitchen's tape delay (`effects/tape-delay.ts`)
  // as a send a note asks for by amount — `p.echo` — so a part can have its own
  // repeats, long and dark, where the dotted-eighth line above is the whole
  // record's and stays short. Built the first time a note asks, like the hall,
  // so a program that never sends here never pays for it; timed to this
  // graph's beat; returned into the duck with the delay line, so its repeats
  // breathe with the kick too.
  let echo: EffectInstance | null = null;
  const echoInput = (): GainNode => {
    if (echo) return echo.input as GainNode;
    const { level, ...params } = ECHO_SEND;
    echo = tapeDelay(ctx, settings, { ...params, beat: beatSeconds }, opts.at ?? 0);
    const back = ctx.createGain();
    back.gain.value = level;
    echo.output.connect(back);
    back.connect(duck);
    return echo.input as GainNode;
  };

  // **A part's own space** (liquid-space round 1, `settings.partSpace`): a space
  // row the theme's composer chose for one part — the sparse keys' tone inserts
  // and their hall — built once for the graph, the first time a note asks
  // (`withPartSpace`), and never where the settings name none. A struck part's
  // room, so it returns into the struck voices' shallow duck, as the piano's own
  // struck hall does; its tail rings out on `disposeBackground`.
  let partSpace: SpaceInstance | null = null;
  const partSpaceInput = (): GainNode | undefined => {
    if (!P.partSpace) return undefined;
    if (!partSpace) {
      partSpace = buildSpace(ctx, settings, asSpace(P.partSpace), { beat: beatSeconds, at: opts.at ?? 0 });
      partSpace.output.connect(struckDuck);
    }
    return partSpace.input as GainNode;
  };

  const bus = (dry: GainNode, which: 'held' | 'struck' = 'held', ride?: AudioNode): Bus => ({
    dry,
    ...(ride ? { ride } : {}),
    delay: delayIn,
    reverb: reverbIn,
    room: roomIn,
    get hall() {
      return hall(which);
    },
    get background() { return backgroundInput(); },
    get immersed() { return immersedInput(); },
    get echo() { return echoInput(); },
    get partSpace() { return partSpaceInput(); },
  });

  const made: ThemeGraph = {
    ctx,
    out,
    themeOut,
    chain,
    master: chain.master,
    macro,
    duck,
    duckLow,
    struckDuck,
    struckBus: (name: string) => (name === 'melodic' || name === 'keys' ? struckOf().buses[name] : null),
    hasStruck: () => struck !== null,
    // A path the two harmonic paths share answers with the pair; any other
    // walks the graph, as `paramOf` always has.
    param: (path: string) => {
      // The close and the sweep are built on the first read of a path into
      // them, and the pair with them: build first, so the first line written
      // is written on both.
      const head = path.split('.')[0];
      if (head === 'sweep') sweepOf();
      else if (head === 'harmonicLp') harmonicLpOf();
      return twins.get(path) ?? walkTo(made, path);
    },
    melodic,
    harmonic,
    air: chain.air,
    presence: chain.presence,
    glue,
    bassComp,
    push: { wet: pushWet, body: bassBody, sub: subPush },
    bassDrive: bassDriveFx,
    harmonicBell,
    harmonicEdge: held.edge,
    stageParams: (target: string): AudioParam[] => {
      if (target === 'widthDepth.gain') return [widthDepth.gain];
      if (target === 'widthLfo.frequency') return [widthLfo.frequency];
      if (target.startsWith('harmonicBell.')) {
        const k = target.slice('harmonicBell.'.length) as 'frequency' | 'Q' | 'gain';
        return [held.bell, struck ? struck.path.bell : null].filter((b): b is BiquadFilterNode => !!b).map((b) => b[k]);
      }
      // the bus edge's blend and corners, on both paths where the struck one is built (DESK-EDGE)
      if (target.startsWith('harmonicEdge.')) {
        const k = target.slice('harmonicEdge.'.length) as keyof HarmonicEdgeStage['params'];
        return [held.edge, struck ? struck.path.edge : null].flatMap((e) => (e && e.params[k] ? e.params[k] : []));
      }
      const p = walkTo(made, target) as unknown;
      return p && typeof (p as AudioParam).setValueAtTime === 'function' ? [p as AudioParam] : [];
    },
    stageSetters: (target: string) => {
      if (target !== 'harmonicEdge.drive') return [];
      return [held.edge, struck ? struck.path.edge : null].filter((e): e is HarmonicEdgeStage => !!e).map((e) => e.drive);
    },
    get sweep() { return sweepOf(); },
    get harmonicLp() { return harmonicLpOf(); },
    // The dotted-eighth line's time, by path: a tempo glide moves the grid
    // under a deck that is already playing, and its echoes move with it.
    echo: { time: dL.delayTime },
    limiter: chain.limiter,
    trim: chain.trim,
    width,
    keepAlive,
    beat: beatSeconds,
    // The sidechain, worked out once for this graph rather than once per kick:
    // the shape is a function of the room and of the beat this graph is
    // running on, and neither moves for as long as the graph is alive.
    duckShape: duckShape(settings, beatSeconds),
    buses: {
      kick: bus(kickBus),
      sub: bus(subBus, 'held', bassDriveFx?.side),
      drums: bus(drums),
      melodic: bus(melodic),
      keys: bus(keysIn),
    },
    // The level table is read by whatever name a caller has, and a name that
    // is not in it is -12 dB; the cast is that statement, since the table
    // itself is a fixed set of keys and this lookup is deliberately not.
    level: (name: string) => dbToGain((P.levels as Record<string, number>)[name] ?? -12),
    // Looking is not asking: this reads the same variable the getter assigns
    // and never calls `hall()`.
    hasHall: (which?: 'held' | 'struck') => (which ? halls[which] !== null : halls.held !== null || halls.struck !== null),
    hasHarmonicLp: () => held.lp !== null,
    hasBackground: () => background !== null,
    hasImmersed: () => immersed !== null,
    hasEcho: () => echo !== null,
    hasPartSpace: () => partSpace !== null,
    get partSpace() { partSpaceInput(); return partSpace; },
    disposeBackground: () => { background?.dispose(); immersed?.dispose(); echo?.dispose(); bassDriveFx?.dispose(); partSpace?.dispose(); },
  };
  return made;
}

// One AudioParam of a graph by the name the program calls it: a path and never
// a node, so a program is a value in node and a graph is only ever what a
// runtime looks it up in.
//
// A graph behind the round E factory (`src/graph.ts`) answers for its own
// paths, so the writers below take either: the thing the factory hands out, the
// graph it wraps, or the recording stand-in `tools/program.ts` locks the
// curves with.
//
// Which is why what it walks is `unknown` and not a shape: three unrelated
// things are addressed by the same paths, and the casts in the walk below are
// the whole of what is assumed about any of them — that one of them may answer
// for itself, that the rest are objects with named fields, and that a path
// which runs out somewhere useful ends on something a curve can be written to.
export function paramOf(graph: unknown, path: string): AutomationTarget | null {
  const answering = graph as { param?: (path: string) => AutomationTarget | null } | null;
  if (answering && typeof answering.param === 'function') return answering.param(path);
  return walkTo(graph, path);
}

/** The walk itself, for a graph that answers for some paths and not others. */
function walkTo(graph: unknown, path: string): AutomationTarget | null {
  let node: unknown = graph;
  for (const k of path.split('.')) {
    if (!node) return null;
    node = (node as Record<string, unknown>)[k];
  }
  return (node as AutomationTarget | null) || null;
}

// The sidechain's lines, one per parameter it moves. A deck's graph has its
// own `duck` and `duckLow`, so two decks overlapping at a seam keep two
// histories, and a disposed graph takes its lines with it.
const duckLines = new WeakMap<AutomationTarget, Line>();

// The sidechain, laid down at one instant. The arithmetic that makes the shape
// is the contract's (`duckShape` in src/program.ts); this writes it, through
// the one ramp line (`src/ramp.ts`).
//
// **A close kick starts from where the last recovery had got to.** The shape's
// first point is a set, to 1; laid over a recovery that has not finished, that
// set was a jump from wherever the gain was back to 1 and then a fall to the
// new minimum — a click on everything melodic, 0.357 of one sample's step in
// the golden `1:0` (the engine review of 09-22). So a trigger that lands while
// the line is still moving anchors at the line's own value there, and the rest
// of the shape is appended from it. `line().set` also writes back the leg the
// cancel would erase, which an offline render needs and `cancelAndHoldAtTime`
// would give where it exists. It needs the triggers in onset order, which the
// schedule guarantees per deck, and nothing else writes these two parameters.
//
// `clock` is the context whose present lets the line forget its past: a set
// runs for hours and a line that kept every kick would grow for hours. The
// recording stand-ins and an offline render (whose clock stands at nought
// while everything is written) pass none and keep the whole history.
export function writeDuck(graph: unknown, shape: DuckPoint[], at: number, clock: { currentTime: number } = STILL): void {
  for (const d of shape) {
    const param = paramOf(graph, d.p);
    if (!param) continue;
    let l = duckLines.get(param);
    if (!l) { l = line(clock, param, param.value); duckLines.set(param, l); }
    if (d.op === 'set') {
      const t = Math.max(0, at + d.dt);
      l.set(l.moving(t) ? l.at(t) : d.v, t);
    } else l.then(d.v, at + d.dt);
  }
}
const STILL = { currentTime: 0 };

/**
 * What one lazy return costs while it runs, in the voices' own classes
 * (`VOICE_COST_BANDS`): the nodes building it makes, a minute of it running
 * against the reference effect, and the impulse it holds. A return is priced
 * once per theme, whatever sends to it. MEASURED by `tools/budget.ts` and
 * written by its `--bless`, never typed.
 */
export const RETURN_COST: Record<'hall' | 'background' | 'immersed' | 'echo', 'cheap' | 'mid' | 'dear'> = {
  hall: 'mid',
  background: 'dear',
  immersed: 'dear',
  echo: 'dear',
};

/**
 * **The echo send's tape delay** (round KV1): a dotted eighth, fed back hard
 * and darkened on every pass — a lowpass in the loop at 1.8 kHz and a
 * highpass at 280 Hz, so a chord's repeats thin and dull as they go and the
 * bottom never queues up — with the head wandering a little more than the
 * kitchen's default, and returned at `level`. Constants and not a settings
 * block: the settings are hashed into the program lock, and a return nothing
 * sends to must not move it. The tape delay's own tail (`tailFor`) is what
 * the instance's `dispose` waits for.
 */
export const ECHO_SEND = Object.freeze({
  timeBeats: 0.75,
  feedback: 0.58,
  lowpassHz: 1800,
  highpassHz: 280,
  wow: 0.35,
  pingPong: 0,
  mix: 1,
  level: 0.7,
});

// One automation line of a program, written onto the parameter it names. The
// values are resolved already — the push's three destinations were three
// multiplications at schedule time and are three lists of numbers now — so all
// that is left is where the points fall: `mapTime` puts a theme's seconds onto
// whatever grid the caller is playing it on, and `from` is the instant the
// curve is written from.
//
// **A program line never reaches the master every deck shares** (R92 of the
// reconciled review of 09-24). The graph hands its caller the shared chain's
// nodes by name — `chain`, `master`, `air`, `presence`, `limiter`, `trim` —
// and a line naming one of them would be written by `applyCurve`, which
// cancels the parameter's whole future from nought: every deck start would
// wipe whatever the shared chain was doing, the other deck's seam included. No
// program writes one (the five paths the record uses are the macro filter, the
// melodic gain and the three pushes), so a line that does is a fault and says
// so, the way an automation target the recording graph lacks does.
export const SHARED_PATHS = ['chain', 'master', 'air', 'presence', 'limiter', 'trim'];
export function scheduleLine(
  graph: unknown,
  line: AutomationLine,
  from = 0,
  mapTime: ((t: number) => number) | null = null,
): void {
  if (SHARED_PATHS.includes(line.param.split('.')[0]))
    throw new Error(`an automation line names ${line.param}, which is the master every deck shares, not this theme's graph`);
  const param = paramOf(graph, line.param);
  if (!param) return;
  const points = mapTime ? line.points.map((p) => ({ t: mapTime(p.t), value: p.value })) : line.points;
  applyCurve(param, points, from, line.curve === 'exponential');
}

/**
 * **An automation line moved onto a grid that has changed under it**, from an
 * instant on: what a tempo glide does to a deck whose curves were laid on the
 * grid before it (the reconciled review of 09-24, R2).
 *
 * `before` and `after` are the line's points on the context's clock as they
 * were laid and as they fall now; `laidFrom` is the instant `scheduleLine` wrote
 * the line from, and `from` the first instant the grid moved at — everything
 * before it is where it was on both. The parameter is cut there, the leg under
 * way written back to where it had got to (a cancel drops the whole of a ramp
 * that ends after it, `ramp.ts`), and the rest laid on the new instants. A line
 * none of whose points moved is left exactly as it is.
 */
export function relayLine(graph: unknown, line: AutomationLine, laidFrom: number, before: number[], after: number[], from: number): void {
  const param = paramOf(graph, line.param);
  if (!param || !line.points.length) return;
  let moved = false;
  for (let i = 0; i < before.length; i++) if (Math.abs(before[i] - after[i]) > 1e-9) { moved = true; break; }
  if (!moved) return;
  const exponential = line.curve === 'exponential';
  const was = curveEvents(line.points.map((p, i) => ({ t: before[i], value: p.value })), laidFrom, exponential);
  const now = curveEvents(line.points.map((p, i) => ({ t: after[i], value: p.value })), laidFrom, exponential);
  // Where the parameter is at `from`, along what was written.
  let k = 0;
  while (k < was.length && was[k].t <= from) k++;
  const a = was[k - 1];
  const b = was[k];
  let v = a ? a.v : (b ? b.v : 0);
  if (a && b && b.k !== 'set') {
    const span = b.t - a.t;
    const x = span > 0 ? (from - a.t) / span : 1;
    v = b.k === 'exp' ? a.v * Math.pow(b.v / a.v, x) : a.v + (b.v - a.v) * x;
  }
  param.cancelScheduledValues(from);
  if (a && b && b.k === 'exp') param.exponentialRampToValueAtTime(v, from);
  else if (a && b && b.k === 'lin') param.linearRampToValueAtTime(v, from);
  else param.setValueAtTime(v, from);
  for (const e of now) {
    if (e.t <= from) continue;
    if (e.k === 'exp') param.exponentialRampToValueAtTime(e.v, e.t);
    else if (e.k === 'lin') param.linearRampToValueAtTime(e.v, e.t);
    else param.setValueAtTime(e.v, e.t);
  }
}

// The events `applyCurve` writes for a line from an instant, as values: the
// value it stands at, set at `from`, then a ramp to each point after it.
function curveEvents(points: CurvePoint[], from: number, exponential: boolean): Array<{ t: number; v: number; k: 'set' | 'lin' | 'exp' }> {
  const pts = points.slice().sort((a, b) => a.t - b.t);
  let start = pts[0].value;
  let i = 0;
  while (i < pts.length && pts[i].t <= from) { start = pts[i].value; i++; }
  if (i > 0 && i < pts.length) {
    const a = pts[i - 1];
    const b = pts[i];
    const span = b.t - a.t;
    if (span > 0) {
      const k = (from - a.t) / span;
      // Floored at both ends (R73): a segment from nought divided by it and
      // wrote NaN, which `setValueAtTime` throws on.
      start = exponential
        ? expFloor(a.value) * Math.pow(expFloor(b.value) / expFloor(a.value), k)
        : a.value + (b.value - a.value) * k;
    }
  }
  // An exponential ramp from nought holds flat until its end in Web Audio, so
  // the line's own starting value is floored as its targets are.
  if (exponential) start = expFloor(start);
  const out: Array<{ t: number; v: number; k: 'set' | 'lin' | 'exp' }> = [{ t: Math.max(0, from), v: start, k: 'set' }];
  for (; i < pts.length; i++) {
    const t = Math.max(from + 0.001, pts[i].t);
    out.push(exponential ? { t, v: expFloor(pts[i].value), k: 'exp' } : { t, v: pts[i].value, k: 'lin' });
  }
  return out;
}

// An exponential ramp cannot reach nought — Web Audio holds the parameter flat
// if either end is — so an exponential target is floored at a small positive
// value. **Small, and not sixty**: until 09-20 the floor was `60`, a filter
// corner's idea of "low" written into the writer every path goes through, so
// an exponential gain curve to 1 was written as a ramp to 60 (+35.6 dB; the
// outside review of 09-19, its E06). The record never reached it — its only
// exponential lines are `macro.frequency` and their lowest point is 700 Hz,
// MEASURED over the fourteen golden themes of both strategies — which is why
// the program digest is byte-identical either side of this line. A gain curve
// that wants nought writes its last point as this floor, -100 dB, and a caller
// that wants true nought writes a linear step after it, as every release in
// this engine does.
//
// **And it is read.** The commit that wrote the paragraph above (d50a526)
// added the constant and left the writer flooring at 60, so the fault it
// describes stood for four days (R73 of the reconciled review of 09-24); the
// interpolation into a segment that starts at nought divided by it and wrote
// NaN, which `setValueAtTime` throws on. Both ends are floored here now, and
// `tools/check-automation.ts` holds an exponential line to 0.25 to 0.25. The
// flooring is in `curveEvents`, so `applyCurve` and `relayLine` share it.
export const EXP_FLOOR = 1e-5;
const expFloor = (v: number): number => Math.max(EXP_FLOOR, v);

// Apply a curve to an AudioParam from `from` onwards, starting at whatever
// value the curve had reached at that instant. This is what lets a seek land
// mid-breakdown with the filter already closed instead of snapping open.
function applyCurve(param: AutomationTarget, points: CurvePoint[], from: number, exponential: boolean): void {
  if (!points || !points.length) return;
  // Interpolated into the segment `from` lands inside, and then a ramp to
  // every point after it: `curveEvents`, which `relayLine` reads as well, so
  // what is written and what a relay believes was written are one list.
  param.cancelScheduledValues(0);
  for (const e of curveEvents(points, from, exponential)) {
    if (e.k === 'exp') param.exponentialRampToValueAtTime(e.v, e.t);
    else if (e.k === 'lin') param.linearRampToValueAtTime(e.v, e.t);
    else param.setValueAtTime(e.v, e.t);
  }
}
