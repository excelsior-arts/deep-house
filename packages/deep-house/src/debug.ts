import { strategyById, styleOf } from './strategies/index.ts';
// The automation surface. Both faces install the same one, so a headless
// check can render bars and inspect the plan whichever page it opened.

import { generate } from './generator.ts';
import { mergeParams } from '@deep-house/engine/params';
import { settingsOf } from '@deep-house/engine/settings';
import { renderProgram } from '@deep-house/engine/scheduler';
import { compilePerformance, sliceProgram } from './performance.ts';
import { schedule, firstEvent, offsetGrid } from '@deep-house/engine/schedule';
import { VOICES } from '@deep-house/engine/voices';
import { createMix, planTheme, recipesFor, renderMix, renderTrack, STYLE } from './mix.ts';
import { encodeWav } from './wav.ts';
import { lateInfo, leadStats } from '@deep-house/engine/dsp';
import { dropInfo } from '@deep-house/engine/deck';
import { pianoCacheStats } from '@deep-house/engine/voices';
import { clockSource } from '@deep-house/engine/clock';
// The machine view's own meters, on the surface for one reason: the gate that
// proves they are not in the record renders a window of music twice, once with
// every one of them attached, and a scenario serialised into the page cannot
// import a module of ours. It is the *same* function the view calls, which is
// the whole point — a gate that attached its own analysers would prove a thing
// about analysers and nothing about the view.
import { attachTaps } from '@deep-house/engine/taps';
import type { GenerateOptions, PlanAutomation, Track } from './generator.ts';
import type { PlannedTheme } from './performance.ts';
import type { Control } from './control.ts';
import type { PlainTable } from '@deep-house/engine/params';

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    // `apply` spreads a typed array as an argument list at run time; the
    // checker's signature for it says `number[]`, which a Uint8Array is not.
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(bin);
}

/**
 * A *piece* of a plan: a theme with a window of its events in it and one
 * automation line rather than all three. `renderBars` builds one and nothing
 * else does.
 */
type PlanSlice = Omit<Track, 'automation'> & { automation: Partial<PlanAutomation> };

export function installDebug(control: Control) {
  const surface = {
    // The record's music, house-v1 (`DEFAULT_STRATEGY`), and a `generate` bound
    // to it: a caller from outside the bundle — a scenario, the scene gate —
    // asks for a theme without naming a style. It is not what a bare link plays
    // (that is house-v2, `DEFAULT_VER`); a caller that wants the page's engine
    // passes its `style` (R129 of the reconciled review of 09-24).
    style: STYLE,
    generate: (opts: Partial<GenerateOptions> = {}) => generate({ style: STYLE, ...opts }),
    renderTrack,
    // The performance compiler and its two consumers, for the scene gate: a
    // theme is compiled once, a window of the program is sliced out of it and
    // that window is what gets rendered and metered. The suite used to slice
    // the *plan* and let the stage run again on a list nobody would play.
    compilePerformance,
    sliceProgram,
    renderProgram,
    encodeWav,
    planTheme,
    generationOf: (strategy: string) => strategyById(strategy).generation,
    recipesFor,
    renderMix,
    // A second set in the same context, for the transport scenarios: two rooms
    // at once is the thing round C's settings ownership is for, and from a
    // built page there is no `import '/src/mix.ts'` to reach for.
    createMix,
    // The room a plan is played in, as the frozen value `makeDeck`
    // and `renderTrack` each resolve for themselves. Before round C the live
    // table was not reachable from a built page at all and a scenario had to
    // infer the room from the track's overrides; this is the thing itself.
    settingsOf: (track: PlannedTheme) => settingsOf(track),
    // The program a plan plays as, compiled in its own room the way a deck,
    // the player and a render each compile it.
    programOf: (track: PlannedTheme) => compilePerformance(track, settingsOf(track)),
    // The one scheduling contract, and the registry of voice functions a
    // schedule is fired into. A transport scenario asks the first for what an
    // offline render of a theme would play and watches the second to see what a
    // live deck actually played, which is the only way to compare the two from
    // outside: both engines look a voice up in this very object at fire time.
    schedule,
    firstEvent,
    offsetGrid,
    attachTaps,
    voices: VOICES,
    control,
    get mix() {
      return control.mix;
    },
    get track() {
      return control.track;
    },
    get state() {
      return control.state;
    },
    get readout() {
      return control.readout();
    },
    seekToBar(bar: number) {
      return control.seekToBar(bar);
    },
    // Notes the scheduler reached late, and the last one's shift, for the
    // bench; the lead the scheduler is managing; where the ticks come from.
    get late() {
      return lateInfo();
    },
    get leads() {
      return leadStats();
    },
    // What a stall cost: events the pump found more than a bar behind the
    // render head and dropped rather than fired at the head in a burst.
    get dropped() {
      return dropInfo();
    },
    // What the piano's string cache had to do, and how much of it was done
    // under the scheduler rather than ahead of it: `live` is the counter a
    // transport scenario watches, because a move that waits for the theme it
    // is going to never moves it.
    get piano() {
      return pianoCacheStats();
    },
    get clock() {
      return clockSource();
    },

    // Used by the headless checks: render and hand back base64, no download.
    //
    // **These two render the strategy they are asked for, and the record when
    // none is** (R129 of the reconciled review of 09-24): they used to render
    // `STYLE`, house-v1, whatever engine the page was playing, and said
    // nothing about it. A bare call still renders house-v1, byte for byte what
    // it always did; `strategy: 'house-v2'` renders the page's default engine.
    async renderBase64({ seed = 1, minutes = 1, preset = 'auto', overrides = null, sampleRate = 44100, strategy = null }:
      { seed?: string | number; minutes?: number; preset?: string; overrides?: PlainTable | null; sampleRate?: number; strategy?: string | null } = {}) {
      const track = generate({ style: styleOf(strategy), seed, minutes, preset });
      if (overrides) track.paramOverrides = mergeParams(track.paramOverrides, overrides);
      const buffer = await renderTrack(track, { sampleRate });
      const blob = encodeWav(buffer);
      return { base64: await toBase64(blob), duration: buffer.duration, bpm: track.bpm, bars: track.bars };
    },

    // Render an arbitrary bar range, for looking at one loop under a microscope.
    async renderBars({ seed = 1, minutes = 1, preset = 'auto', fromBar = 0, toBar = 8, only = null, overrides = null, sampleRate = 44100, strategy = null }:
      { seed?: string | number; minutes?: number; preset?: string; fromBar?: number; toBar?: number;
        only?: string[] | null; overrides?: PlainTable | null; sampleRate?: number; strategy?: string | null } = {}) {
      const track = generate({ style: styleOf(strategy), seed, minutes, preset });
      if (overrides) track.paramOverrides = mergeParams(track.paramOverrides, overrides);
      const t0 = fromBar * track.barSeconds;
      const t1 = toBar * track.barSeconds;
      const slice: PlanSlice = {
        ...track,
        duration: t1 - t0 + 1.5,
        events: track.events
          .filter((e) => e.t >= t0 && e.t < t1)
          .filter((e) => !only || only.includes(e.layer))
          .map((e) => ({ ...e, t: e.t - t0 })),
        automation: {
          macroFilter: [{ t: 0, value: 18000 }],
        },
      };
      // A slice is a *piece* of a plan and says so: it carries the events of a
      // window and one automation line, the filter held open, because that is
      // what a bar-range render of the debug surface is for. It is not a theme
      // and it does not pretend to be one, so it is cast rather than filled in
      // with lines nobody asked to hear.
      const buffer = await renderTrack(slice as Track, { sampleRate });
      const blob = encodeWav(buffer);
      return { base64: await toBase64(blob), duration: buffer.duration, barSeconds: track.barSeconds };
    },
  };
  window.deepHouse = surface;
  return surface;
}

export default installDebug;
