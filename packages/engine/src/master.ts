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
  melodic: GainNode;
  air: BiquadFilterNode;
  presence: BiquadFilterNode;
  glue: DynamicsCompressorNode | GainNode;
  bassComp: DynamicsCompressorNode;
  push: { wet: GainNode; body: BiquadFilterNode; sub: GainNode };
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
   * Whether the piano's hall has been built.
   *
   * It exists because asking the question any other way *answers it wrongly*:
   * `bus.hall` is a getter that builds a four-second convolver the first time
   * it is read, so a readout that reached for it to see whether it was there
   * would be the thing that put it there. A theme with no piano in it never
   * pays for that convolver, and nothing that only looks may make it.
   */
  hasHall(): boolean;
  hasBackground(): boolean;
  hasImmersed(): boolean;
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
  air.gain.value = P.master.airDb;
  air.connect(master);

  // Presence: the 2-6 kHz band the reference sets carry and a synthesised mix
  // does not. Tuned against the band table, not by taste.
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = P.master.presenceHz;
  presence.gain.value = P.master.presenceDb;
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
  mid.gain.value = P.master.midDb;
  mid.Q.value = P.master.midQ;
  mid.connect(presence);

  // The octave between the kick's body and the bottom of the chords, which the
  // generator leaves thin and the reference sets do not.
  const lowMid = ctx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = P.master.lowMidHz;
  lowMid.gain.value = P.master.lowMidDb;
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
  lowShelf.gain.value = P.master.lowShelfDb;
  lowShelf.connect(lowMid);

  // A wide, gentle high-pass keeps DC and subsonic rumble out of the file.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = P.master.dcHz;
  dcBlock.Q.value = P.master.dcQ;
  dcBlock.connect(lowShelf);

  return { ctx, input: dcBlock, out, dcBlock, lowShelf, lowMid, mid, presence, air, master, limiter, limiterPort, clip, trim, limiterIsWorklet: haveWorklet, settings };
}

// One theme's graph: its buses, its sends, its sidechain, its width and its
// macro filter. `opts.master` hands it a master to feed; without one it builds
// its own, which is what a single track and the offline render of a single
// track do.
/**
 * @param settings this theme's own, resolved once and owned by the
 *   deck, the player or the render that built this graph
 */
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

  const chain = opts.master || buildMaster(ctx, settings);
  const out = opts.master ? themeOut : chain.out;
  if (!opts.master) themeOut.connect(chain.input);
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
  widthLfo.start(0);
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

  const melodic = ctx.createGain();
  melodic.gain.value = 1;
  melodic.connect(duck);

  const drums = ctx.createGain();
  drums.gain.value = 1;
  drums.connect(macro);

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
  // blended in by the arrangement for a few bars at a time. Parallel, so the
  // fundamental is never touched — the drive adds harmonics on top of a bass
  // that stays clean underneath.
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
  lowSum.connect(lowHp);

  const kickBus = ctx.createGain();
  kickBus.gain.value = 1;
  kickBus.connect(lowSum);

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
  subBus.connect(subPush);

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
  conv.buffer = impulseResponse(ctx, P.sends.reverbSeconds, 3.1, 'hall', P.sends.reverbCorr);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = P.sends.reverbLevel;

  reverbIn.connect(preDelay);
  preDelay.connect(rvbCut);
  rvbCut.connect(conv);
  conv.connect(rvbTop);
  rvbTop.connect(reverbOut);
  reverbOut.connect(duck);

  // --- a slow chorus, shared by the keys, so stabs are wide without each
  // note carrying its own delay line ---
  const keysIn = ctx.createGain();
  keysIn.gain.value = 1;
  const chorusDry = ctx.createGain();
  chorusDry.gain.value = 0.7;
  keysIn.connect(chorusDry);
  chorusDry.connect(melodic);
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
    lfo.start(0);
    keepAlive.push(lfo, depth);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    keysIn.connect(dl);
    dl.connect(pn);
    pn.connect(wet);
    wet.connect(melodic);
  });

  // --- the clap room: short, bright, and behind a real pre-delay ---
  const roomIn = ctx.createGain();
  roomIn.gain.value = 1;
  const roomPre = ctx.createDelay(0.5);
  roomPre.delayTime.value = P.sends.roomPreDelay;
  const roomHp = ctx.createBiquadFilter();
  roomHp.type = 'highpass';
  roomHp.frequency.value = P.sends.roomLowHz;
  const roomConv = ctx.createConvolver();
  roomConv.buffer = impulseResponse(ctx, P.sends.roomSeconds, 5.5, 'room', P.sends.roomCorr);
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
  let hallIn: GainNode | null = null;
  const hall = (): GainNode => {
    if (hallIn) return hallIn;
    hallIn = ctx.createGain();
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
    level.connect(duck);
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
  let sweepStages: BusSweep | null = null;
  const sweepOf = (): BusSweep => {
    if (sweepStages) return sweepStages;
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
    const lp = stage('lowpass', SWEEP_FILTER.lpOpenHz, duck);
    const hp = stage('highpass', SWEEP_FILTER.hpOpenHz, lp.input);
    melodic.disconnect(duck);
    melodic.connect(hp.input);
    sweepStages = { hp: hp.stage, lp: lp.stage };
    return sweepStages;
  };

  const bus = (dry: GainNode): Bus => ({
    dry,
    delay: delayIn,
    reverb: reverbIn,
    room: roomIn,
    get hall() {
      return hall();
    },
    get background() { return backgroundInput(); },
    get immersed() { return immersedInput(); },
  });

  return {
    ctx,
    out,
    themeOut,
    chain,
    master: chain.master,
    macro,
    duck,
    duckLow,
    melodic,
    air: chain.air,
    presence: chain.presence,
    glue,
    bassComp,
    push: { wet: pushWet, body: bassBody, sub: subPush },
    get sweep() { return sweepOf(); },
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
      sub: bus(subBus),
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
    hasHall: () => hallIn !== null,
    hasBackground: () => background !== null,
    hasImmersed: () => immersed !== null,
    disposeBackground: () => { background?.dispose(); immersed?.dispose(); },
  };
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
export const RETURN_COST: Record<'hall' | 'background' | 'immersed', 'cheap' | 'mid' | 'dear'> = {
  hall: 'mid',
  background: 'dear',
  immersed: 'dear',
};

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
