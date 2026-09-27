// What a voice that does not end is.
//
// Every voice in `src/voices/` is `(ctx, out, time, p, settings)` and returns
// the instant it is silent: a note with a length, built when it is wanted and
// collected when it has stopped. That is the whole catalogue today, because
// deep house is made of notes, and it is not enough for the music the design
// review's second example describes — *a continuous or slowly sectional
// recipe, sparse notes or sustained gestures*, where a drone is held for as
// long as the listener is there and the record is what the desk does to it
// while it holds.
//
// §9 of that review says exactly what is missing, and this file is it: *for a
// drone, a fixed-duration one-shot is insufficient for indefinite hold, live
// pitch/control, pause/resume, and controlled release. Add those capabilities
// in a new renderer contract and a fixture.* So:
//
//   hold        a `HoldRenderer` is handed the same five arguments a voice is
//               and hands back a handle instead of an end. Nothing about the
//               sound is scheduled to stop.
//   setControl  one named, declared control, moved to a value at an instant,
//               over a stated ramp. Not a parameter object rewritten: a
//               command with a time, which is what §9 asks for and what an
//               offline render can replay.
//   pause/resume  the same drone, silenced and brought back at the level it
//               was holding at. A transport stop is not the end of a voice.
//   release     the controlled ending: down to nothing over the voice's own
//               **stated tail**, and silent from then on.
//   dispose     let it go now, whatever it was doing.
//
// **The tail policy is stated and not discovered.** A held voice says how long
// its release takes before anybody asks it to release, so a caller that has to
// know when the graph can be torn down — a deck at a seam, a fixture counting
// what it left behind — reads a number rather than waiting and hoping.
// `release(at)` returns the instant the voice is silent, which is `at + tail`
// plus the ramp floor every gain in this engine ends on.
//
// What this contract does **not** do is replace the one-shot. A note is not a
// drone with a stopwatch on it, and the review is explicit: *existing one-shot
// functions can be wrapped unchanged and remain owned by their deck; do not
// demand fake per-note capabilities they cannot supply.* A family that has both
// keeps both — `strings.ts` exports `strings` and `holdStrings`, and the
// one-shot is byte-identical to what it was — and a family that only has notes
// declares nothing here.

import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';

/**
 * What a held voice is doing.
 *
 * `holding` from the instant it is made until it is paused or released;
 * `paused` while it is silent and able to come back; `released` once its tail
 * has been started, which is one-way; `gone` once `dispose` has run.
 */
export type HeldState = 'holding' | 'paused' | 'released' | 'gone';

/**
 * One drone, playing. Every method takes the instant it is to take effect, in
 * the context's own seconds, and a method called with none acts now — so the
 * same handle serves an offline render, which schedules the whole life of a
 * voice before a sample is computed, and a live context, which finds out what
 * it wants next while the drone is already sounding.
 */
export interface HeldVoice {
  /** the controls this voice answers to, by name. Anything else is refused */
  readonly controls: readonly string[];
  /** MEASURED by the voice that declares it: how long `release` takes, in seconds */
  readonly tail: number;
  /**
   * what it is doing — as the commands have set it. `released` from the
   * instant a release is *asked for*, which is what an offline script that
   * schedules a whole life and reads back the terminal state wants; `releaseAt`
   * is the other half
   */
  readonly state: HeldState;
  /** the level it is holding at, as the gain a resume would return it to */
  readonly level: number;
  /**
   * the instant the release begins, once one has been asked for, and `null`
   * until then. Live, the voice is sounding until this instant whatever `state`
   * says, and a control aimed before it is taken; one aimed at or after it is
   * refused (the outside review of 09-19, its E07)
   */
  readonly releaseAt: number | null;
  /**
   * Move one control to a value. `over` is the ramp, in seconds; nought is a
   * step, and a step still takes the engine's minimum ramp, because nothing in
   * this machine ends or starts a gain without one.
   * @returns whether the control was one this voice declares
   */
  setControl(name: string, value: number, at?: number, over?: number): boolean;
  /** Silence it, keeping everything it is doing, so `resume` is not a new note */
  pause(at?: number): void;
  /** Bring it back to the level it was holding at */
  resume(at?: number): void;
  /** Down to nothing over `tail`. Returns the instant it is silent */
  release(at?: number): number;
  /** Let it go now: sources stopped, nodes disconnected, whatever it was doing */
  dispose(): void;
}

/**
 * A voice that holds. The five arguments are the ones every voice in this
 * folder takes — `p` is the note (pitch, level, the send amounts) and
 * `settings` the room it is made in — and what comes back is the handle above
 * rather than the instant it ends, because there is no such instant.
 */
export type HoldRenderer = (
  ctx: BaseAudioContext,
  out: VoiceOut,
  at: number,
  p: NoteParams,
  settings: Settings,
) => HeldVoice;

export type { HeldVoice as default };
