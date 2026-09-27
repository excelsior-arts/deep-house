// What a drive does to a level: the reference signal in, the effect's wet out,
// both integrated, at the drives a gate or a bless asks for.
//
// The reference is pink noise at -36 dBFS RMS. Pink rather than white because
// a drive's tone filter and the meter's K-weighting both lean on the top octave,
// and white noise would read those as the effect's level when they are its
// colour; noise rather than a sine because a curve reads a signal's peaks, and
// this crest (about 4) is music's.
//
// **Why -36 and not -18.** A make-up is a fixed gain and a curve is not, so a
// drive can be loudness-neutral at one input level and no other: calibrated at
// -18 dBFS, the overdrive at its default drive read -0.1 dB there, +8.8 at -36
// and +9.5 at -48 — and the rota's inserts are per note, after the note's own
// gain, where a pad note on seed 20 reaches the insert at -42 dBFS RMS. So the
// make-up is calibrated where the curve is still straight: at -36 a quiet note
// comes out at its own loudness, and anything louder is bent and comes out
// *quieter* than it went in, never louder. The gate holds both halves: within a
// decibel at -36, and nowhere more than a decibel over its input at -18.
//
// Every reading is the effect with every parameter at its default except the
// one being moved, at a mix of 1, against the same noise rendered through a
// wire. It is run in a page (it needs an OfflineAudioContext) and imported by
// `tools/test-effects-2.ts`, which is where it is a gate, and by `--bless`
// there, which is where the make-up tables are written from.

import { makeEffect, BY_ID } from '../src/effects/index.ts';
import { integratedLoudness } from './meter.ts';
import type { Settings } from '../src/settings.ts';

/** The level the make-up is measured at, in dBFS RMS. */
export const REFERENCE_DBFS = -36;
/** The loud reading: where a drive may compress but may not add. */
export const LOUD_DBFS = -18;
const SECONDS = 6;

/** Pink noise (Paul Kellet's filter over a seeded white), scaled to the reference RMS. */
function pink(n: number, seed: number, refDbfs = REFERENCE_DBFS): Float32Array<ArrayBuffer> {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += out[i] * out[i];
  const k = Math.pow(10, refDbfs / 20) / Math.sqrt(sum / n);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/**
 * The loudness of the reference through one effect, less the reference's own:
 * 0 is neutral. `params` are written over the defaults; `null` for the effect
 * means the wire.
 */
export async function driveLevel(id: string, settings: Settings, params: Record<string, number>, rate = 48000, refDbfs = REFERENCE_DBFS): Promise<number> {
  const read = async (fx: string | null): Promise<number> => {
    const n = Math.ceil(SECONDS * rate);
    const ctx = new OfflineAudioContext(2, n, rate);
    const buf = ctx.createBuffer(2, n, rate);
    buf.copyToChannel(pink(n, 7, refDbfs), 0);
    buf.copyToChannel(pink(n, 11, refDbfs), 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (fx) {
      const e = makeEffect(fx, ctx, settings, { ...params, mix: 1 });
      src.connect(e.input);
      e.output.connect(ctx.destination);
    } else src.connect(ctx.destination);
    src.start(0);
    const out = await ctx.startRendering();
    // The first half second is thrown away: a filter's own settling is not a level.
    const from = Math.round(0.5 * rate);
    return integratedLoudness([out.getChannelData(0).slice(from), out.getChannelData(1).slice(from)], rate);
  };
  return (await read(id)) - (await read(null));
}

/** The drive-family effects, and the knob each one drives with. */
export const DRIVES: Record<string, string> = { overdrive: 'drive', distortion: 'drive', fuzz: 'drive', filter: 'drive', ladder: 'drive', crush: 'drive' };

/**
 * What each drive is held to. A drive proper is held to its **input**: the
 * reference comes out at the loudness it went in. A filter's corner and its
 * resonance are its sound, so the filter and the ladder are held to their own
 * loudness **with no drive** — what the drive adds is made up, what the filter
 * takes away is the filter.
 */
export const NEUTRAL_TO: Record<string, 'input' | 'undriven'> = {
  overdrive: 'input', distortion: 'input', fuzz: 'input', crush: 'input', filter: 'undriven', ladder: 'undriven',
};

/**
 * The fractions of a knob's range a make-up table is measured at: its ends, its
 * quarters, its first eighth and sixteenth, and its default (curves.ts says
 * why each).
 */
export function tableFractions(id: string): number[] {
  const spec = BY_ID[id].params[DRIVES[id]];
  const def = +((spec.default - spec.min) / (spec.max - spec.min)).toFixed(4);
  return [...new Set([0, 0.0625, 0.125, 0.25, 0.5, 0.75, 1, def])].sort((a, b) => a - b);
}

/** The same points in the knob's own units. */
export function tablePoints(id: string): number[] {
  const spec = BY_ID[id].params[DRIVES[id]];
  return tableFractions(id).map((f) => +(spec.min + (spec.max - spec.min) * f).toFixed(4));
}

/**
 * One drive effect, read at the five table points and at its default: each
 * reading less the reference's own loudness, and the target it is held to
 * (nought, or its own reading with no drive).
 */
export async function driveReadings(id: string, settings: Settings, rate = 48000) {
  const k = DRIVES[id];
  const def = BY_ID[id].params[k].default;
  const table: number[] = [];
  for (const v of tablePoints(id)) table.push(+(await driveLevel(id, settings, { [k]: v }, rate)).toFixed(2));
  const atDefault = +(await driveLevel(id, settings, { [k]: def }, rate)).toFixed(2);
  const target = NEUTRAL_TO[id] === 'input' ? 0 : table[0];
  const loud: number[] = [];
  for (const v of tablePoints(id)) loud.push(+(await driveLevel(id, settings, { [k]: v }, rate, LOUD_DBFS)).toFixed(2));
  const loudTarget = NEUTRAL_TO[id] === 'input' ? 0 : loud[0];
  return { id, knob: k, fractions: tableFractions(id), points: tablePoints(id), table, def, atDefault, target, loud, loudTarget };
}
