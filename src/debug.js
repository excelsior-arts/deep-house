// The automation surface. Both faces install the same one, so a headless
// check can render bars and inspect the plan whichever page it opened.

import { generate } from './generator.js';
import { mergeParams } from './params.js';
import { renderTrack } from './scheduler.js';
import { planTheme, renderMix } from './mix.js';
import { encodeWav } from './wav.js';
import { lateInfo, leadStats } from './dsp.js';
import { clockSource } from './clock.js';

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function installDebug(control) {
  const surface = {
    generate,
    renderTrack,
    encodeWav,
    planTheme,
    renderMix,
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
    seekToBar(bar) {
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
    get clock() {
      return clockSource();
    },

    // Used by the headless checks: render and hand back base64, no download.
    async renderBase64({ seed = 1, minutes = 1, preset = 'auto', overrides = null, sampleRate = 44100 } = {}) {
      const track = generate({ seed, minutes, preset });
      if (overrides) track.paramOverrides = mergeParams(track.paramOverrides, overrides);
      const buffer = await renderTrack(track, { sampleRate });
      const blob = encodeWav(buffer);
      return { base64: await toBase64(blob), duration: buffer.duration, bpm: track.bpm, bars: track.bars };
    },

    // Render an arbitrary bar range, for looking at one loop under a microscope.
    async renderBars({ seed = 1, minutes = 1, preset = 'auto', fromBar = 0, toBar = 8, only = null, overrides = null, sampleRate = 44100 } = {}) {
      const track = generate({ seed, minutes, preset });
      if (overrides) track.paramOverrides = mergeParams(track.paramOverrides, overrides);
      const t0 = fromBar * track.barSeconds;
      const t1 = toBar * track.barSeconds;
      const slice = {
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
      const buffer = await renderTrack(slice, { sampleRate });
      const blob = encodeWav(buffer);
      return { base64: await toBase64(blob), duration: buffer.duration, barSeconds: track.barSeconds };
    },
  };
  window.deepHouse = surface;
  return surface;
}

export default installDebug;
