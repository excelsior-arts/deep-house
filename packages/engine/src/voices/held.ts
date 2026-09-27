// The arithmetic every held voice does, written once.
//
// `voice-contract.ts` says what a held voice *is*; this is the part of it that
// is the same in every implementation and is worth getting wrong only once:
// the state machine, the level a resume returns to, the tail a release takes,
// and — the one piece that is genuinely subtle — working out where a ramp had
// got to when the next command arrives.
//
// **Why a parameter's own value cannot be read.** `cancelScheduledValues(t)`
// drops a ramp's *end* and leaves the parameter heading for the value it
// started from, so something has to be put back at `t`; and an AudioParam's
// `.value` is what it is **now**, which is not what it will be at an instant in
// the future — and an offline render schedules a whole drone's life before a
// sample of it is computed, which is exactly the case this contract exists for.
// `cancelAndHoldAtTime` is the specified answer to the first half and is not in
// every engine this runs in. So each moving parameter carries its own line and
// the next command interpolates along it. It is round G's finding, in a module
// rather than in one voice, because round K2 adds two more voices that hold and
// a finding copied twice is a finding that will be fixed once — and since
// 09-20 the line itself is `../ramp.ts`, the one copy the effects' knobs stand
// on as well, because the copy here remembered one ramp and the outside review
// of 09-19 (its E07) showed one is not enough.
//
// `holdStrings` in `strings.ts` predates this and keeps its own copy. It is not
// refactored onto this module for the plainest of reasons: its numbers are
// measured, the engine's suite holds them to a fifth of a decibel, and a
// refactor that cannot change what a listener hears has nothing to gain by
// touching the one voice whose release is already a blessed measurement. It
// therefore still remembers one ramp per parameter and still refuses a
// control once a release is asked for, and says so beside its `releaseAt`.

import { MIN_RELEASE, GAIN_FLOOR } from '../dsp.ts';
import { line } from '../ramp.ts';
import type { Line } from '../ramp.ts';
import type { HeldState, HeldVoice } from './voice-contract.ts';

/**
 * The ramp a voice's own module wrote before handing over: where it started,
 * where it is going and when it gets there. It is the seed of the gain's line.
 */
export interface RampLine {
  from: number;
  to: number;
  t0: number;
  t1: number;
}

/** One other parameter a control may move, with the value it was parked at. */
export interface ParkedParam {
  param: AudioParam;
  value: number;
}

/**
 * What one named control means: a value in, the parameters and the targets that
 * value moves them to out.
 */
export type ControlMove = (value: number) => Array<[AudioParam, number]>;

/**
 * The pieces a voice's own module built, handed over for the holding to be done
 * for it.
 */
export interface HeldVoiceSpec {
  /**
   * the output gain: what `pause`, `resume` and `release` move, and what the
   * attack was written on
   */
  gain: GainNode;
  /** MEASURED by the voice: how long `release` takes */
  tail: number;
  /** the level it is holding at */
  level: number;
  /**
   * the line the caller already wrote on `gain.gain`, so the first command
   * after it starts from where it had got to rather than from where it began
   */
  attack: RampLine;
  /** every other parameter a control may move, with the value it was parked at */
  parked?: ParkedParam[];
  /**
   * what this voice answers to, by name: a value in, the parameters and targets
   * that value means out
   */
  controls: Record<string, ControlMove>;
  /** the oscillators and buffer sources holding it alive */
  sources?: Array<{ stop: (t?: number) => void }>;
  /** everything to let go */
  nodes?: Array<{ disconnect: () => void }>;
}

/**
 * One held voice, from the pieces its own module built.
 */
export function heldVoice(
  ctx: BaseAudioContext,
  { gain, tail, level, attack, parked = [], controls, sources = [], nodes = [] }: HeldVoiceSpec,
): HeldVoice {
  let state: HeldState = 'holding';
  let held = level;
  // The instant a release begins, once one has been asked for. `state` turns
  // `released` the moment it is asked for — an offline script schedules a
  // whole life and reads the terminal state back — and this is the other half
  // of the answer: a control aimed *before* this instant is a control on a
  // voice that is still sounding, and is taken (the outside review of 09-19,
  // its E07: `release(10)` at nought used to refuse a control at five).
  let releaseAt: number | null = null;

  // One line per parameter, and the line remembers everything the parameter
  // holds — not the last ramp written but every ramp not yet cancelled — so a
  // command that lands before an earlier one has finished reads the value the
  // parameter will really have (`../ramp.ts`).
  const lines = new Map<AudioParam, Line>();
  lines.set(gain.gain, line(ctx, gain.gain, { from: attack.from, to: attack.to, start: attack.t0, end: attack.t1 }));
  for (const { param, value } of parked) lines.set(param, line(ctx, param, value));
  const lineOf = (param: AudioParam): Line => {
    let l = lines.get(param);
    if (!l) { l = line(ctx, param, param.value); lines.set(param, l); }
    return l;
  };

  const when = (t?: number): number => (t == null ? ctx.currentTime : Math.max(0, t));
  const rampTo = (param: AudioParam, value: number, atTime?: number, over?: number): number =>
    lineOf(param).to(value, when(atTime), over);
  // The stated tail, and then the floor every gain in this engine ends on.
  const writeRelease = (t: number): number => {
    rampTo(gain.gain, GAIN_FLOOR, t, tail);
    const silent = t + tail + MIN_RELEASE;
    lineOf(gain.gain).then(0, silent);
    return silent;
  };

  return {
    controls: Object.keys(controls),
    tail,
    get state() { return state; },
    get level() { return held; },
    get releaseAt() { return releaseAt; },
    setControl(name: string, value: number, atTime?: number, over = 0): boolean {
      if (state === 'gone') return false;
      const moves = controls[name];
      if (!moves) return false;
      const t = when(atTime);
      // Released is one-way from the instant the release begins, not from the
      // instant it was asked for.
      if (releaseAt != null && t >= releaseAt) return false;
      // The level is remembered whatever state it is in, and applied only
      // while the voice is sounding: a paused drone does not come back early
      // because somebody turned it up while it was away.
      if (name === 'gain') {
        held = value;
        if (state === 'paused') return true;
      }
      // A ramp aimed under a scheduled release is cut at the release, and the
      // release is written again behind it, so it starts from where the
      // control left the parameter rather than being cancelled by it.
      const span = releaseAt == null ? over : Math.min(over, Math.max(0, releaseAt - t));
      for (const [param, target] of moves(value)) {
        rampTo(param, target, t, span);
        if (releaseAt != null && param === gain.gain) writeRelease(releaseAt);
      }
      return true;
    },
    pause(atTime?: number): void {
      if (state !== 'holding') return;
      state = 'paused';
      rampTo(gain.gain, GAIN_FLOOR, atTime, MIN_RELEASE);
    },
    resume(atTime?: number): void {
      if (state !== 'paused') return;
      state = 'holding';
      rampTo(gain.gain, Math.max(GAIN_FLOOR, held), atTime, MIN_RELEASE);
    },
    release(atTime?: number): number {
      const t = when(atTime);
      if (state === 'released' || state === 'gone') return t;
      state = 'released';
      releaseAt = t;
      const silent = writeRelease(t);
      for (const s of sources) {
        try { s.stop(silent); } catch (e) { /* already stopped */ }
      }
      return silent;
    },
    dispose(): void {
      state = 'gone';
      for (const s of sources) {
        try { s.stop(); } catch (e) { /* already stopped, or never started */ }
      }
      // A source is declared by what holds it alive and a node by what lets it
      // go, so half of this list has no `disconnect` on its type. Asking anyway
      // is the point: what answers is disconnected and what does not throws
      // into the same catch everything else here throws into.
      for (const node of [...nodes, ...sources]) {
        try { (node as { disconnect: () => void }).disconnect(); } catch (e) { /* already gone */ }
      }
    },
  };
}

export default heldVoice;
