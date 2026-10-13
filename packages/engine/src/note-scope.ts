// **A note lets go of the bus when it has finished** (the performance review of
// 2026-10-06: Eugene's phone plays for about a minute and then degrades, and a
// reload buys another minute).
//
// A voice builds a private chain per note — oscillators or buffer sources, then
// envelopes, filters, shapers, panners, send gains — connects its end to the
// bus it is handed, schedules `stop()` and drops every reference. Nothing ever
// called `disconnect()`. The chain stays wired to a bus that lives for the whole
// theme, so whether the audio thread still visits it is left to the browser.
// Chromium releases a finished source and lets silence propagate. WebKit pulls
// everything reachable from the destination, and an asymmetric WaveShaper (the
// sub's, the reese's even curve) never goes silent: per the Web Audio
// specification a curve with a non-zero value at zero input keeps producing
// output until it is disconnected downstream. The three reviews
// met on this as the slope a phone climbs.
//
// So on a playing context every note is handed its own door into each bus it
// uses: a unity gain made the first time the voice asks for that bus, and
// nothing else. While the voice builds the note, the sources it starts and stops
// are noted. When the last of them has ended, and a margin later, the doors are
// disconnected and the whole chain behind them falls out of the graph. The
// returns behind the buses (the reverb, the room, the echo) keep their tails:
// a door is the note's send, not the return. A note's sends into the theme's
// shared returns by amount (`withReturns` in dsp.ts) pass doors of their own
// too (`noteDoor`), so a sent note's gains are let go with the rest of it.
//
// - **The margin** covers what rings after the last source: a Haas or chorus
//   line (tens of ms), the shimmer pad's own feedback loop (a second or two),
//   and, for a note carrying a kitchen effect (`p.fx`), that effect's tail, which
//   the effect's shell lets go of on its own (`effects/shell.ts`).
// - **A held voice** starts sources it stops only at its release. Its doors
//   wait: the release's `stop()` is noted against the note, and when the last
//   pending source has a stop, the doors are armed off it as above.
// - **A render is untouched**: an offline context, and a context with no Web
//   Audio sources (the node stand-in), gets the bus itself and no door, so every
//   locked render and every node check is what it was.
// - **A deck let go lets its notes go** (the engine review of 10-08, F6): a
//   note is noted against the graph it was fired into, and when that graph's
//   deck is torn down — silent already, its fader off the sum — every source a
//   note of it started is stopped and every door disconnected there and then,
//   rather than a held pad's or a drone's sources running on for half a minute
//   holding the dead graph alive behind their doors (`releaseNotes`).
import { SEND_NAMES, type VoiceOut } from './dsp.ts';
import { isOffline } from './effects/shell.ts';

/** How long after a note's last source ends its doors are let go, in seconds. */
export const NOTE_MARGIN_S = 4;
/** ...and after a note that carries a kitchen effect, whose shell keeps the effect's own tail. */
export const FX_MARGIN_S = 30;

interface Scope {
  doors: GainNode[];
  /** the note's doors into nodes outside the buses (a shared return's input), by that node (`noteDoor`) */
  into: Map<AudioNode, GainNode> | null;
  /** every source the note started, weakly: an ended source is the browser's to collect (its stop is in `stopAt`) */
  sources: Array<WeakRef<AudioScheduledSourceNode>>;
  /** the graph the note was fired into, whose teardown lets it go (`releaseNotes`) */
  owner: object | null;
  /** the doors' timer, once the last source has ended */
  timer: ReturnType<typeof setTimeout> | null;
  released: boolean;
  /** sources started and not yet given a stop */
  pending: Set<AudioScheduledSourceNode>;
  /** the source stopping last, and when */
  last: AudioScheduledSourceNode | null;
  lastAt: number;
  margin: number;
  armed: boolean;
}

// The note being built (set around the voice's call), and the notes whose held
// sources are still waiting for a stop, by source.
let building: Scope | null = null;
const waiting = new WeakMap<AudioScheduledSourceNode, Scope>();
// the notes still holding doors, by the graph they were fired into
const live = new WeakMap<object, Set<Scope>>();
// the stop each scoped source was given
const stopAt = new WeakMap<AudioScheduledSourceNode, number>();
let patched = false;

function patchSources(): void {
  if (patched) return;
  patched = true;
  // the parent's methods, and each kind's own where it overrides them (a buffer source has its own `start`)
  const kinds = [AudioScheduledSourceNode, globalThis.AudioBufferSourceNode, globalThis.OscillatorNode, globalThis.ConstantSourceNode]
    .filter((k): k is typeof AudioScheduledSourceNode => typeof k === 'function');
  for (const K of kinds) {
    const P = K.prototype;
    if (Object.prototype.hasOwnProperty.call(P, 'start')) {
      const start = P.start;
      P.start = function (this: AudioScheduledSourceNode, ...args: Parameters<typeof start>) {
        if (building) { building.pending.add(this); building.sources.push(new WeakRef(this)); }
        return start.apply(this, args);
      } as typeof start;
    }
    if (Object.prototype.hasOwnProperty.call(P, 'stop')) {
      const stop = P.stop;
      P.stop = function (this: AudioScheduledSourceNode, ...args: Parameters<typeof stop>) {
        // the note that started it: a held one waiting for its release, or the one being built (a stop inside
        // a later note's call — a mono voice cutting its last note — is the earlier note's, never the new one's)
        const scope = waiting.get(this) ?? (building?.pending.has(this) ? building : null);
        if (scope) noteStop(scope, this, args[0] ?? 0);
        return stop.apply(this, args);
      } as typeof stop;
    }
  }
}

function noteStop(scope: Scope, source: AudioScheduledSourceNode, when: number): void {
  stopAt.set(source, when);
  scope.pending.delete(source);
  waiting.delete(source);
  if (!scope.last || when >= scope.lastAt) { scope.last = source; scope.lastAt = when; }
  // a held note's release: once nothing is left without a stop, arm the doors
  if (building !== scope) arm(scope);
}

function arm(scope: Scope): void {
  if (scope.armed || scope.pending.size || !scope.last || !scope.doors.length) return;
  scope.armed = true;
  const margin = scope.margin * 1000;
  scope.last.addEventListener('ended', () => {
    // every source of the note has ended: nothing is left to stop at a teardown, and the scope holds no source
    // (a node's wrapper holds the chain it feeds, so an ended one held here would hold the note's whole chain)
    scope.sources.length = 0;
    scope.last = null;
    scope.pending.clear();
    if (!scope.released) scope.timer = setTimeout(() => letGo(scope), margin);
  }, { once: true });
}

/** Disconnect a note's doors, once, and forget it. */
function letGo(scope: Scope): void {
  if (scope.released) return;
  scope.released = true;
  if (scope.timer !== null) { clearTimeout(scope.timer); scope.timer = null; }
  for (const d of scope.doors) d.disconnect();
  if (scope.owner) live.get(scope.owner)?.delete(scope);
}

/**
 * **Let go of every note fired into `owner`**, now: what a deck's teardown
 * asks once the deck is off the sum. Each source a note started and that has
 * not already stopped by `now` is stopped (a held one at once, a scheduled one
 * brought forward), and its doors are disconnected without waiting for the
 * margin. Returns how many sources it stopped. A render has no scopes, and a
 * graph whose notes have all let go already has none left.
 */
export function releaseNotes(owner: object, now: number): number {
  const scopes = live.get(owner);
  if (!scopes) return 0;
  let stopped = 0;
  for (const scope of [...scopes]) {
    for (const ref of scope.sources) {
      const source = ref.deref();
      if (!source || (stopAt.get(source) ?? Infinity) <= now) continue;
      try { source.stop(); stopped++; } catch (e) { /* never started, or already gone */ }
    }
    letGo(scope);
  }
  live.delete(owner);
  return stopped;
}

/**
 * **A door of the note being built into a node outside its buses**: a shared
 * return a note sends into by amount (`withReturns` in dsp.ts, the theme's
 * `settings.returns`), whose send gains were wired straight into the return's
 * input and so stayed reachable from the destination after the note had ended
 * (the deep review of 10-12, F7). The door is a unity gain, one per node per
 * note, let go with the note's bus doors. Outside a note being built on a
 * playing context — a render, a node check — it is the node itself.
 */
export function noteDoor(ctx: BaseAudioContext, into: AudioNode): AudioNode {
  const scope = building;
  if (!scope || !scoped(ctx)) return into;
  if (!scope.into) scope.into = new Map();
  let d = scope.into.get(into);
  if (!d) {
    d = ctx.createGain();
    d.connect(into);
    scope.into.set(into, d);
    scope.doors.push(d);
  }
  return d;
}

/** Whether notes on this context get doors: a playing context in a browser. */
export const scoped = (ctx: BaseAudioContext): boolean =>
  typeof AudioScheduledSourceNode !== 'undefined' && !isOffline(ctx);

/**
 * Build one note through `play`, handing it `out` with a door of its own into
 * each bus it uses, and let the doors go when the note has finished. On a
 * render, `play` is handed `out` itself.
 */
export function playScoped(ctx: BaseAudioContext, out: VoiceOut, hasFx: boolean, play: (out: VoiceOut) => void, owner: object | null = null): void {
  if (!scoped(ctx)) { play(out); return; }
  patchSources();
  const scope: Scope = { doors: [], into: null, pending: new Set(), last: null, lastAt: -Infinity, margin: hasFx ? FX_MARGIN_S : NOTE_MARGIN_S, armed: false,
    sources: [], owner, timer: null, released: false };
  const doorOf = new Map<string, GainNode>();
  const doored: VoiceOut = {};
  // **A door reads its bus only when the note asks for it.** Reading `out[name]`
  // is what builds a lazy return (the hall, the two spaces, the echo: a
  // convolver and its impulse response each) and the source's own gain into
  // it, so a loop that read every send up front built all four on the first
  // note of every theme, on the tick that was scheduling it, whether the
  // program sent there or not — and the machine view, which draws a return
  // the graph has, drew three more boxes playing than at rest.
  for (const name of SEND_NAMES) {
    Object.defineProperty(doored, name, {
      enumerable: true,
      get: () => {
        let d = doorOf.get(name);
        if (!d) {
          const bus = out[name];
          if (!bus) return undefined;
          d = ctx.createGain();
          d.connect(bus);
          doorOf.set(name, d);
          scope.doors.push(d);
        }
        return d;
      },
    });
  }
  const outer = building;
  building = scope;
  try {
    play(doored);
  } finally {
    building = outer;
  }
  // a source the note started and did not stop is a held one: its stop, at the release, arms the doors
  for (const s of scope.pending) waiting.set(s, scope);
  // a note that took a door is noted against its graph until the door is let go
  if (owner && scope.doors.length) {
    let set = live.get(owner);
    if (!set) live.set(owner, (set = new Set()));
    set.add(scope);
  }
  arm(scope);
}
