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
//   wait: they are armed when the last of the note's sources has ended, which a
//   held one does only after its release's `stop()` (round crash-resume: every
//   source's own end is counted, so a buffer played to its end arms it too).
// - **A render is untouched**: an offline context, and a context with no Web
//   Audio sources (the node stand-in), gets the bus itself and no door, so every
//   locked render and every node check is what it was.
// - **A deck let go lets its notes go** (the engine review of 10-08, F6): a
//   note is noted against the graph it was fired into, and when that graph's
//   deck is torn down — silent already, its fader off the sum — every source a
//   note of it started is stopped and every door disconnected there and then,
//   rather than a held pad's or a drone's sources running on for half a minute
//   holding the dead graph alive behind their doors (`releaseNotes`).
// - **The whole chain is cut, then held** (round crash-resume, 11-03): every node the note made itself is noted as it
//   is made (`noteNodes`), and at the letting go each one is disconnected, doors and all, and held two seconds more
//   before the page drops it (`cutAndHold`, `graph-scope.ts`), so WebKit never frees a chain still wired: its audio
//   thread aborted on the junctions such a chain's freeing dirtied.
import { SEND_NAMES, type VoiceOut } from './dsp.ts';
import { isOffline } from './effects/shell.ts';
import { cutAndHold, noteNodes } from './graph-scope.ts';

/** How long after a note's last source ends its doors are let go, in seconds. */
export const NOTE_MARGIN_S = 4;
/** ...and after a note that carries a kitchen effect, whose shell keeps the effect's own tail. */
export const FX_MARGIN_S = 30;

interface Scope {
  doors: GainNode[];
  /** every node the note made itself (`noteNodes`): cut whole with its doors, then held a while (`cutAndHold`) */
  nodes: AudioNode[];
  /** the note's doors into nodes outside the buses (a shared return's input), by that node (`noteDoor`) */
  into: Map<AudioNode, GainNode> | null;
  /** every source the note started, weakly (its stop is in `stopAt`) */
  sources: Array<WeakRef<AudioScheduledSourceNode>>;
  /** the graph the note was fired into, whose teardown lets it go (`releaseNotes`) */
  owner: object | null;
  /** the doors' timer, once the last source has ended */
  timer: ReturnType<typeof setTimeout> | null;
  released: boolean;
  /** sources started and not yet ended */
  running: number;
  /** whether the voice's call has returned: a note's sources all end only once it has */
  built: boolean;
  margin: number;
}

// The note being built (set around the voice's call).
let building: Scope | null = null;
// the notes still holding doors, by the graph they were fired into
const live = new WeakMap<object, Set<Scope>>();
// the stop each scoped source was given
const stopAt = new WeakMap<AudioScheduledSourceNode, number>();
// every source a note started
const noted = new WeakSet<AudioScheduledSourceNode>();
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
        const scope = building;
        const r = start.apply(this, args);
        if (scope && !noted.has(this)) started(scope, this);
        return r;
      } as typeof start;
    }
    if (Object.prototype.hasOwnProperty.call(P, 'stop')) {
      const stop = P.stop;
      P.stop = function (this: AudioScheduledSourceNode, ...args: Parameters<typeof stop>) {
        if (noted.has(this)) stopAt.set(this, args[0] ?? 0);
        return stop.apply(this, args);
      } as typeof stop;
    }
  }
}

/**
 * **A note has finished when every source it started has ended** (round crash-resume, 11-03). Until then the note
 * counted the `stop()` calls and waited on the last one's end, so a source that ends of itself — a buffer played to
 * its end, a slice given a duration, the drums' and the grains' every hit — never armed it: such a note's doors and
 * chain stayed wired until its deck's teardown. Each source's own `ended` is counted now, whatever ends it; a held
 * source still ends only at its release.
 */
function started(scope: Scope, source: AudioScheduledSourceNode): void {
  noted.add(source);
  scope.sources.push(new WeakRef(source));
  scope.running++;
  source.addEventListener('ended', () => {
    scope.running--;
    arm(scope);
  }, { once: true });
}

function arm(scope: Scope): void {
  if (scope.released || scope.timer !== null || !scope.built || scope.running > 0 || !scope.sources.length || !scope.doors.length) return;
  // every source of the note has ended: nothing is left to stop at a teardown
  scope.sources.length = 0;
  scope.timer = setTimeout(() => letGo(scope), scope.margin * 1000);
}

/** Disconnect a note's doors, once, and forget it. */
function letGo(scope: Scope): void {
  if (scope.released) return;
  scope.released = true;
  if (scope.timer !== null) { clearTimeout(scope.timer); scope.timer = null; }
  // the whole chain, not only its doors (round crash-resume): a chain the collector takes still wired is cut by
  // WebKit node by node as it frees them, which is what its audio thread aborted on; cut here, held two seconds
  cutAndHold([...scope.doors, ...scope.nodes]);
  scope.doors.length = 0;
  scope.nodes.length = 0;
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
  const scope: Scope = { doors: [], nodes: [], into: null, running: 0, built: false, margin: hasFx ? FX_MARGIN_S : NOTE_MARGIN_S,
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
    noteNodes(ctx, scope.nodes, () => play(doored));
  } finally {
    building = outer;
  }
  scope.built = true;
  // a note that took a door is noted against its graph until the door is let go
  if (owner && scope.doors.length) {
    let set = live.get(owner);
    if (!set) live.set(owner, (set = new Set()));
    set.add(scope);
  }
  arm(scope);
}
