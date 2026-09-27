// One store, one direction.
//
// Everything the view draws comes out of here and nothing goes back in: the
// transport, the decks, the taps and the ledger publish, `useSyncExternalStore`
// subscribes, and no component writes to the machine, keeps state of its own
// about it, or reads the DOM to find out what it already knows
// (`PLAN-MACHINE-VIEW` §4b). A snapshot is immutable and is replaced whole, so
// React's own identity check is the redraw rule and there is nothing to
// synchronise.
//
// **The frame rate is the meters' and not the browser's.** Twelve a second is
// what a meter needs to be read; six on a coarse pointer, where the screen is
// small and the hand is far from the machine; and under reduced motion none at
// all — the store then publishes only when something *changes*, which is a
// state on the readout moving (a bar, a section, a seam, a spell: `stateOf`)
// or a line being written, so every number is still true and nothing moves for
// the sake of moving. A readout arriving is not a change: one arrives every
// animation frame.
//
// **The taps live exactly as long as the view.** `open()` makes them, `close()`
// takes them out, and in between the store watches for the deck or the master
// changing hands — a cast is a new deck under the needle and a stop and start
// is a new master — and moves the analysers with them rather than leaving a set
// of them wired to a graph that has been disposed.

import { attachTaps } from '@deep-house/engine/taps';
import type { MeterFrame, Taps } from '@deep-house/engine/taps';
import { describeMachine } from './model.ts';
import { deskFor } from './desk.ts';
import type { MachineSnapshot } from './model.ts';
import { note, watch } from '../ledger.ts';
import type { Control, Readout } from '../control.ts';
import { spellQuery } from '../spell.ts';
import { reducedMotion, coarsePointer } from '../motion.ts';

/** How often the meters are read, by what the screen and the hand are. */
export const FRAME_MS = 1000 / 12;
export const COARSE_FRAME_MS = 1000 / 6;

/**
 * **What a redraw under reduced motion is for: a state that changed.** The
 * control emits a readout on every animation frame, and most of what moves in
 * one — the progress, the beat's phase, the seam's approach — is the clock
 * running, not the machine changing. Under reduced motion the view is redrawn
 * when one of these moves and not otherwise (C11: it published thirteen
 * snapshots a second off unchanged emits while it reported none).
 */
function stateOf(control: Control, r: Readout): string {
  const s = control.state;
  return [
    r.playing, r.seed, r.strategy, r.mix.themeNumber, r.bar, r.section, r.chord,
    r.mix.cutting, r.mix.cutKind, r.recipe, spellQuery(r.spell as never) || 'house',
    s.castTo, s.strategyTo, s.render ? s.render.note : '', JSON.stringify(control.sourceMix),
  ].join('|');
}

/** The external store, as `useSyncExternalStore` wants one. */
export interface MachineStore {
  subscribe(fn: () => void): () => void;
  getSnapshot(): MachineSnapshot;
  /** make the taps and start the frame, if the frame is wanted at all */
  open(): void;
  /** take every tap out and stop the frame */
  close(): void;
  /** what the store is doing, for the round note and for a scenario to read */
  facts(): { fps: number; taps: number; reduced: boolean; coarse: boolean; published: number };
}

export function makeStore(control: Control): MachineStore {
  // Both are read when the view opens and followed while it is open: a
  // preference changed with the view up stops (or starts) the meters' frame.
  let reduced = reducedMotion.on;
  const coarse = coarsePointer.on;
  const period = coarse ? COARSE_FRAME_MS : FRAME_MS;
  let unreduce: (() => void) | null = null;
  let lastState = '';

  const listeners = new Set<() => void>();
  let snapshot: MachineSnapshot | null = null;
  let serial = 0;
  let taps: Taps | null = null;
  let tappedDeck: unknown = null;
  let tappedMaster: unknown = null;
  let frame = 0;
  let unsubscribe: (() => void) | null = null;
  let unwatch: (() => void) | null = null;
  let pending = 0;
  let lastAt = 0;
  let clipping = new Set<string>();
  let delivered: Readout | null = null;

  // The meters follow the record. A cast puts a new deck under the needle and a
  // stop and start builds a new master, and an analyser wired to a graph that
  // has been taken apart measures nothing — so the pair being tapped is checked
  // every frame and the taps are rebuilt when either moves. It is one identity
  // comparison, and it is what keeps a meter honest across a hand-over.
  function retap(): void {
    const mix = control.state.mix;
    const deck = mix ? mix.record : null;
    const master = mix ? mix.master : null;
    if (deck === tappedDeck && master === tappedMaster) return;
    if (taps) { taps.dispose(); taps = null; }
    tappedDeck = deck;
    tappedMaster = master;
    if (!deck || !master) return;
    try {
      taps = attachTaps(deck.graph, master, { periodMs: period });
    } catch (e) {
      // A graph let go between the read and the connect: there is nothing to
      // meter and the view says so by having no meters, which is true.
      taps = null;
      tappedDeck = null;
    }
  }

  // The kind of line the view writes down for itself: a bus running hot, which
  // only a tap can see and a tap exists only while the view is open. The output
  // reaching full scale is written here only where there is no limiter's
  // processor to hear it (the fallback master, a `bypass=limiter` link): since
  // S16 the processor measures it on every sample and `mix.ts` writes that line
  // whether the view is open or not. One writer either way, and the report
  // fires when nobody is looking. Everything else the ledger holds that the transport does not say — a
  // section, a lane, a voice, a treatment, a late note, the clock — is written
  // on the page whether the view is open or not (`scribe.ts`, R54).
  function notice(meters: MeterFrame | null): void {
    if (!meters) return;
    // A clip is reported when it *begins*, not on every frame it lasts, so a
    // loud passage is one line and not two hundred.
    const now = new Set(meters.clipped);
    for (const name of now) {
      if (clipping.has(name)) continue;
      const read = name === 'out' ? meters.out : meters.buses[name];
      const fields = { peak: read ? read.peak : null, hold: read ? read.hold : null, gr: meters.reduction.worst };
      // **A bus over 0 dBFS runs hot; only the output clips** (M15, round S9's
      // measurement: a dry bus's float sum commonly sits at or over 0 dBFS
      // before the limiter with nothing non-linear on the way, so nothing is
      // cut). The limiter is the one ceiling, and the output is where it is.
      if (name !== 'out') note('hot', `${name} ran hot, over 0 dBFS before the limiter`, fields);
      else if (!(control.state.mix && control.state.mix.master.nodes.limiterIsWorklet)) note('clip', `${name} reached full scale`, fields);
    }
    clipping = now;
  }

  /**
   * Take a snapshot.
   *
   * `tell` is false on exactly one path: the first `getSnapshot`, which React
   * may call while it is rendering. Telling listeners from inside a render is
   * the one thing `useSyncExternalStore` is there to avoid, so that call takes
   * the reading and says nothing — the store is about to publish for itself
   * anyway, in `open()`.
   */
  function publish(tell = true): void {
    lastAt = Date.now();
    // **The readout the control last delivered, and not a new one** (R98): a
    // readout taken here read the mix a third time a frame and could re-plan,
    // journal and write storage from the view's own timer. The control hands
    // one to its subscribers every frame; before the first, it is asked.
    const readout = delivered ?? control.readout();
    if (!readout) return;
    retap();
    // the desk follows the set: its leans on the master go back to the room
    // before a cast retunes it, and are forgotten with a master that went
    deskFor(control).follow();
    const meters = taps ? taps.read() : null;
    snapshot = describeMachine(control, readout, meters, ++serial);
    notice(meters);
    if (tell) for (const fn of listeners) fn();
  }

  // On an absolute deadline, so a late timer and the publish itself are not
  // added to every gap: the readings stay a period apart on average, and the
  // window a tap reads is half a period longer than that (`windowFor`, R55).
  let due = 0;
  // **Stopped, a frame is drawn only for a change** (M14, both reviews' F8/F9:
  // with nothing playing the view still redrew twelve times a second, 138 ms/s
  // of task time against the ring's 62 at 1440): the state a listener reads,
  // the desk's leans, and a line written — anything else is the same picture.
  let idleKey = '';
  let linesMoved = false;
  function changedWhileStopped(): boolean {
    const r = delivered ?? control.readout();
    if (!r) return false;
    const k = `${stateOf(control, r)}|${JSON.stringify(deskFor(control).state())}`;
    if (k === idleKey && !linesMoved) return false;
    idleKey = k;
    linesMoved = false;
    return true;
  }
  function tick(): void {
    if (control.playing || changedWhileStopped()) publish();
    const now = Date.now();
    due = Math.max(now, (due || now) + period);
    frame = window.setTimeout(tick, due - now);
  }

  // **A change asks for a frame; it never takes one.**
  //
  // Two things made that necessary rather than tidy. The transport emits a
  // readout on every animation frame, so a publish wired straight to it would
  // draw sixty times a second and the twelve above would be a lie. And a
  // publish *writes lines* — a section turning over, a bus reaching the ceiling
  // — so a listener that published synchronously published from inside its own
  // publish: measured, that is a stack overflow on the first section boundary
  // and a ledger full of its own echo. So a change coalesces into at most one
  // frame per period, and a line written during a frame asks for the next one
  // instead of re-entering this one.
  function request(): void {
    if (pending) return;
    const wait = Math.max(0, period - (Date.now() - lastAt));
    pending = window.setTimeout(() => { pending = 0; publish(); }, wait);
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    getSnapshot() {
      if (!snapshot) publish(false);
      // Before a set has been planned at all there is nothing to describe, and
      // `openMachineView` refuses to open then; a null here is a fault named
      // out loud rather than a snapshot the view would read fields off (R130).
      if (!snapshot) throw new Error('the machine view has no snapshot: nothing has been planned');
      return snapshot;
    },
    open() {
      // A readout and a written line both mean something has changed, and
      // under reduced motion they are the *only* things that redraw the view.
      unsubscribe = control.subscribe((r) => {
        delivered = r;
        if (!reduced) return;
        const now = stateOf(control, r);
        if (now === lastState) return;
        lastState = now;
        request();
      });
      publish();
      unwatch = watch(() => { linesMoved = true; if (reduced) request(); });
      due = 0;
      if (!reduced) frame = window.setTimeout(tick, period);
      unreduce = reducedMotion.watch((on) => {
        reduced = on;
        if (on) { if (frame) window.clearTimeout(frame); frame = 0; lastState = ''; }
        else if (!frame) { due = 0; frame = window.setTimeout(tick, period); }
      });
    },
    close() {
      if (frame) window.clearTimeout(frame);
      if (pending) window.clearTimeout(pending);
      frame = 0;
      pending = 0;
      if (unsubscribe) unsubscribe();
      if (unwatch) unwatch();
      if (unreduce) unreduce();
      unsubscribe = null;
      unwatch = null;
      unreduce = null;
      if (taps) taps.dispose();
      taps = null;
      tappedDeck = null;
      tappedMaster = null;
      delivered = null;
      listeners.clear();
    },
    facts: () => ({
      fps: reduced ? 0 : Math.round(1000 / period),
      taps: taps ? taps.count : 0,
      reduced,
      coarse,
      // how many snapshots have been taken, which is the refresh as it is and
      // not as it was meant to be
      published: serial,
    }),
  };
}

export default makeStore;
