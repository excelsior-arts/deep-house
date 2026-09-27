// A context that records what it is told and renders nothing.
//
// Half of what the machine promises is not a sound: a knob that clamps to the
// range its descriptor declares, a ramp helper that knows where a parameter
// will be at an instant, a held voice that keeps replenishing — every one of
// those is a claim about *which requests reach the graph*, and a browser is
// the wrong instrument for it, because a browser answers with samples and the
// question is about the AudioParam events behind them. So this is the other
// instrument: every `create*` a module in `src/` calls, handing back a node
// whose parameters write down every command they are given, in order, so a
// gate compares two logs instead of two renders.
//
// It is the recorder the outside review of 09-19 shipped with its probes
// (its `evidence/engine/probes.mjs` in `notes/archive/2026-09-v2-reviews/`), made
// into a fixture the engine's own suite can lean on: what a builder makes,
// what a setter writes, and how many nodes a voice has asked for. Nothing in
// it is arithmetic over audio and nothing in it is a stand-in for the scene
// gate — an effect that clamps correctly and sounds wrong is still wrong, and
// only a render says so.
//
// The typing is loose on purpose: the modules under test are typed against
// the DOM's `BaseAudioContext`, and this is handed to them as one. What it
// actually is, is a table of what they asked for.

/** One command an AudioParam was given, as the log keeps it. */
export type ParamEvent = [op: string, ...args: unknown[]];

/** A parameter that remembers. */
export class StandinParam {
  value: number;
  readonly name: string;
  readonly events: ParamEvent[] = [];
  constructor(name: string, value = 0) { this.name = name; this.value = value; }
  setValueAtTime(v: number, t: number): this { this.events.push(['set', v, t]); return this; }
  linearRampToValueAtTime(v: number, t: number): this { this.events.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v: number, t: number): this { this.events.push(['exp', v, t]); return this; }
  setTargetAtTime(v: number, t: number, tau: number): this { this.events.push(['target', v, t, tau]); return this; }
  setValueCurveAtTime(curve: Float32Array, t: number, d: number): this { this.events.push(['curve', curve.length, t, d]); return this; }
  cancelScheduledValues(t: number): this { this.events.push(['cancel', t]); return this; }
  cancelAndHoldAtTime(t: number): this { this.events.push(['hold', t]); return this; }
}

/** A buffer with channels in it and nothing behind them. */
export interface StandinBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData(n: number): Float32Array;
  copyToChannel(src: Float32Array, n: number, at?: number): void;
  copyFromChannel(dst: Float32Array, n: number, at?: number): void;
}

const PARAMS = [
  'gain', 'frequency', 'Q', 'detune', 'delayTime', 'pan', 'offset', 'playbackRate',
  'threshold', 'knee', 'ratio', 'attack', 'release',
] as const;

/** A node that remembers: its parameters, what was set on it, when it was started and stopped. */
export class StandinNode {
  readonly type: string;
  readonly params: Record<string, StandinParam> = {};
  readonly starts: unknown[][] = [];
  readonly stops: unknown[] = [];
  readonly connections: unknown[] = [];
  /** the things set on it that are not parameters, as the log keeps them */
  readonly sets: ParamEvent[] = [];
  declare gain: StandinParam;
  declare frequency: StandinParam;
  declare Q: StandinParam;
  declare detune: StandinParam;
  declare delayTime: StandinParam;
  declare pan: StandinParam;
  declare offset: StandinParam;
  declare playbackRate: StandinParam;
  declare threshold: StandinParam;
  declare knee: StandinParam;
  declare ratio: StandinParam;
  declare attack: StandinParam;
  declare release: StandinParam;
  reduction = 0;
  private curveHeld: Float32Array | null = null;
  private bufferHeld: StandinBuffer | null = null;
  constructor(type: string, id: number) {
    this.type = type;
    for (const p of PARAMS) {
      const initial = p === 'gain' || p === 'playbackRate' || p === 'ratio' ? 1 : 0;
      const param = new StandinParam(`${type}#${id}.${p}`, initial);
      this.params[p] = param;
      (this as unknown as Record<string, StandinParam>)[p] = param;
    }
  }
  // A curve, a buffer and a wave are the three things a setter can change that
  // are not an AudioParam, so each is logged by a signature that moves when
  // its contents do — a gate comparing two logs then sees a table that was
  // rebuilt differently.
  get curve(): Float32Array | null { return this.curveHeld; }
  set curve(c: Float32Array | null) {
    this.curveHeld = c;
    this.sets.push(['curve', c ? `${c.length}:${c[0]}:${c[c.length >> 2]}:${c[c.length >> 1]}:${c[(c.length * 3) >> 2]}:${c[c.length - 1]}` : null]);
  }
  get buffer(): StandinBuffer | null { return this.bufferHeld; }
  set buffer(b: StandinBuffer | null) {
    this.bufferHeld = b;
    if (!b) { this.sets.push(['buffer', null]); return; }
    const d = b.getChannelData(0);
    this.sets.push(['buffer', `${b.numberOfChannels}:${b.length}:${d[0]}:${d[d.length >> 1]}:${d[d.length - 1]}`]);
  }
  setPeriodicWave(w: { real: Float32Array; imag: Float32Array }): void {
    this.sets.push(['wave', `${w.real.length}:${Array.from(w.real.slice(0, 4)).join(',')}:${Array.from(w.imag.slice(0, 4)).join(',')}`]);
  }
  connect(n: unknown): unknown { this.connections.push(n); return n; }
  disconnect(): void { /* nothing is wired */ }
  start(...a: unknown[]): void { this.starts.push(a); }
  stop(t?: unknown): void { this.stops.push(t); }
}

/** The context: every node it made, in the order it made them. */
export class StandinContext {
  sampleRate: number;
  currentTime = 0;
  readonly nodes: StandinNode[] = [];
  readonly destination: StandinNode;
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = this.node('destination');
  }
  node(type: string): StandinNode {
    const n = new StandinNode(type, this.nodes.length);
    this.nodes.push(n);
    return n;
  }
  createGain(): StandinNode { return this.node('gain'); }
  createBiquadFilter(): StandinNode { return this.node('biquad'); }
  createWaveShaper(): StandinNode { return this.node('shaper'); }
  createDelay(): StandinNode { return this.node('delay'); }
  createStereoPanner(): StandinNode { return this.node('panner'); }
  createChannelSplitter(): StandinNode { return this.node('splitter'); }
  createChannelMerger(): StandinNode { return this.node('merger'); }
  createOscillator(): StandinNode { return this.node('osc'); }
  createConstantSource(): StandinNode { return this.node('constant'); }
  createBufferSource(): StandinNode { return this.node('buffer'); }
  createConvolver(): StandinNode { return this.node('convolver'); }
  createDynamicsCompressor(): StandinNode { return this.node('compressor'); }
  createAnalyser(): StandinNode { return this.node('analyser'); }
  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } { return { real, imag }; }
  createBuffer(channels: number, length: number, sampleRate: number): StandinBuffer {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: (n) => data[n],
      copyToChannel: (src, n, at = 0) => data[n].set(src.subarray(0, Math.max(0, length - at)), at),
      copyFromChannel: (dst, n, at = 0) => dst.set(data[n].subarray(at, at + dst.length)),
    };
  }
  /** Every command every parameter of every node was given, in the order the nodes were made. */
  events(): Array<[string, ParamEvent]> {
    const out: Array<[string, ParamEvent]> = [];
    for (const n of this.nodes) {
      for (const e of n.sets) out.push([n.type, e]);
      for (const p of Object.values(n.params)) for (const e of p.events) out.push([p.name, e]);
    }
    return out;
  }
  /** The nodes of one type. */
  of(type: string): StandinNode[] { return this.nodes.filter((n) => n.type === type); }
}

/**
 * **A live context, in node.** The recorder with the three things a set asks of
 * a context that is playing — a state, a `resume`, and how deep its output
 * buffer says it is — and a clock the test moves by hand. `createMix` runs on
 * it as it does on a page: the decks are built, the pump fills them, a seam is
 * written, and every parameter keeps what it was told. What a transport gate
 * reads is where the set is and what was asked of the graph, never a sample.
 *
 * A voice that renders ahead does it in an `OfflineAudioContext`, and node has
 * none: `liveStandin` installs `OfflineStandin` as the global, which renders a
 * few samples of silence, so a preparation completes and the set goes on.
 */
export class LiveStandin extends StandinContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  baseLatency = 0.01;
  outputLatency = 0.02;
  async resume(): Promise<void> { this.state = 'running'; }
  addEventListener(): void { /* no events in a context nobody hears */ }
  removeEventListener(): void { /* nor any to take away */ }
}

/** An offline context that renders silence, for what prepares a voice ahead. */
export class OfflineStandin extends StandinContext {
  length: number;
  numberOfChannels: number;
  oncomplete: unknown = null;
  constructor(channels: number | { numberOfChannels: number; length: number; sampleRate: number }, length = 1, sampleRate = 48000) {
    const o = typeof channels === 'object' ? channels : { numberOfChannels: channels, length, sampleRate };
    super(o.sampleRate);
    this.length = o.length;
    this.numberOfChannels = o.numberOfChannels;
  }
  async startRendering(): Promise<StandinBuffer> { return this.createBuffer(this.numberOfChannels, Math.min(this.length, 16), this.sampleRate); }
}

/** A live recorder, with the offline one installed for what prepares ahead of it. */
export const liveStandin = (sampleRate = 48000): AudioContext & LiveStandin => {
  const g = globalThis as unknown as { OfflineAudioContext?: unknown };
  if (!g.OfflineAudioContext) g.OfflineAudioContext = OfflineStandin;
  return new LiveStandin(sampleRate) as unknown as AudioContext & LiveStandin;
};

/** A fresh recorder, typed as what the modules under test take. */
export const standin = (sampleRate = 48000): BaseAudioContext & StandinContext =>
  new StandinContext(sampleRate) as unknown as BaseAudioContext & StandinContext;

export default standin;
