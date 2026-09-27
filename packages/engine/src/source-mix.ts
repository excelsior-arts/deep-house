// Diagnostic instrument channels before shared buses. The score and its
// sidechain keep running; muting stops new input to shared effect returns,
// whose existing tails decay naturally.
//
// **No node is in the record until a control has moved.** A clean state —
// nothing muted, soloed or dry, every level at unity — installs nothing, and a
// state that returns to clean stops handing out channels, so the next note goes
// straight to its bus again. This is measured and not a nicety: a unity gain
// node in the path is not bit-transparent, because the notes then sum at the
// node and again at the bus in another order, and Firefox, which renders the
// same program the same way twice, read 448,395 of 3,609,416 samples different
// (worst 3.6e-7) with a clean mixer installed (the page review of 09-22,
// finding 1). The machine view's controls are for listening; opening the view
// must not be a different record.
import { line } from './ramp.ts';
import type { Line } from './ramp.ts';
import { SEND_NAMES } from './dsp.ts';
import type { VoiceOut } from './dsp.ts';
import type { Buses } from './master.ts';

export interface SourceMix {
  mute: string[];
  solo: string[];
  dry: string[];
  /** Linear instrument gain, 0..2. Missing instruments retain unity gain. */
  gain?: Record<string, number>;
}
export const cleanSourceMix = (): SourceMix => ({ mute: [], solo: [], dry: [] });
export function sourceLevel(state: SourceMix, source: string): number {
  const value = state.gain?.[source] ?? 1;
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1;
}
export function sourceGain(state: SourceMix, source: string, send: string): number {
  return state.mute.includes(source) || (state.solo.length > 0 && !state.solo.includes(source))
    || (send !== 'dry' && state.dry.includes(source)) ? 0 : sourceLevel(state, source);
}
/** Whether a state changes nothing: every source on every send at unity. */
export function isCleanSourceMix(state: SourceMix | null | undefined): boolean {
  if (!state) return true;
  if (state.mute.length || state.solo.length || state.dry.length) return false;
  return Object.keys(state.gain ?? {}).every((source) => sourceLevel(state, source) === 1);
}

/** How long a control change takes to land, so a mute is not a click. */
const RAMP = 0.012;

export function makeSourceMixer(ctx: BaseAudioContext, buses: Buses, initial: SourceMix) {
  let state = initial;
  const channels = new Map<string, VoiceOut>();
  // Each gain is moved through the one ramp line (src/ramp.ts): a change made
  // while the last one is still ramping starts from where that had got to,
  // and nothing here needs `cancelAndHoldAtTime`, which Firefox does not have
  // — the second change on a deck used to throw there (engine review, #6).
  const gains: Array<{ source: string; send: string; node: GainNode; line: Line }> = [];
  return {
    output(source: string, bus: string): VoiceOut {
      const key = `${source}:${bus}`;
      if (channels.has(key)) return channels.get(key)!;
      const target = buses[bus];
      if (!target) throw new Error(`Unknown source bus ${bus}`);
      const out: VoiceOut = {};
      // Getters preserve lazy halls/background spaces. Merely drawing the
      // controls must never instantiate a convolver no instrument uses.
      for (const send of SEND_NAMES) {
        let node: GainNode | undefined;
        Object.defineProperty(out, send, { get() {
          if (!node) {
            node = ctx.createGain();
            const value = sourceGain(state, source, send);
            node.gain.value = value;
            node.connect(target[send]);
            gains.push({ source, send, node, line: line(ctx, node.gain, value) });
          }
          return node;
        } });
      }
      channels.set(key, out);
      return out;
    },
    set(next: SourceMix) {
      state = next;
      const at = ctx.currentTime;
      for (const g of gains) g.line.to(sourceGain(state, g.source, g.send), at, RAMP);
    },
    dispose() {
      for (const { node } of gains) node.disconnect();
      gains.length = 0;
      channels.clear();
    },
  };
}
