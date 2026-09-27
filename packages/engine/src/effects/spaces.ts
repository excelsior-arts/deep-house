// The impulses the kitchen's reverb is made of, generated rather than sampled,
// and the one piece of arithmetic two of the time effects share.
//
// PLAN-KITCHEN's first rule is *no sample playback; every sound from
// oscillators, noise and DSP*, and a convolution reverb is the one place that
// rule is usually broken — a plate is a wav of a plate. So a room here is a
// **shape**: noise under an envelope, with the three numbers that make one room
// different from another written down beside what they do.
//
//   build    how long the tail takes to arrive at full density, in seconds. It
//            is what tells a hall from a plate: a plate is dense at the first
//            sample (a sheet of steel has no far wall), a hall takes forty
//            milliseconds to fill, and a small room is somewhere between.
//   decay    the exponent on `(1 - t)`. Two is a room emptying evenly, six is
//            a tail that falls away fast and then hangs.
//   tilt     decibels per second of extra absorption over the top of the
//            spectrum, applied as a one-pole lowpass whose corner falls as the
//            tail goes on. **Air is what makes a room sound like a room**: a
//            tail whose spectrum does not change is a delay with noise in it.
//   corr     how much of the right channel is the left. `dsp.ts`'s own impulse
//            carries this note and the measurement behind it (space.md: 4-16
//            kHz sits at a side/mid of 0.42, so a fully decorrelated room is
//            wider than these records are).
//
// `dsp.ts`'s `impulseResponse` is v1's and is untouched: it has the three sends
// the record is mixed with in it and its numbers are blessed. This is the
// kitchen's own, with the tilt v1's has not, and it is cached per context and
// per shape exactly as v1's is — an impulse is a second of arithmetic per
// channel and a reverb built per theme may not pay for one twice.

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** The five numbers one room differs from another by, and the noise it is cut from. */
export interface RoomShape {
  seconds: number;
  build: number;
  decay: number;
  tilt: number;
  corr: number;
  seed?: number;
}

/** One of the rooms below: a shape with the name it is known by. */
export interface RoomPreset extends RoomShape {
  id: string;
}

/**
 * A room, as a two-channel buffer.
 *
 * @param shape.seconds how long the buffer is
 * @param shape.build seconds to full density
 * @param shape.decay the exponent on the fall
 * @param shape.tilt how fast the top goes: the lowpass corner falls
 *   from the full band to `tilt` of it over the tail
 * @param shape.corr 0 two tails, 1 one
 */
export function room(
  ctx: BaseAudioContext,
  { seconds, build, decay, tilt, corr, seed = 7919 }: RoomShape,
): AudioBuffer {
  let per = cache.get(ctx);
  if (!per) { per = new Map(); cache.set(ctx, per); }
  const key = `${seconds}:${build}:${decay}:${tilt}:${corr}:${seed}`;
  if (per.has(key)) return per.get(key)!;

  const rate = ctx.sampleRate;
  const len = Math.max(64, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  let s = seed >>> 0;
  const c = Math.max(0, Math.min(1, corr));
  const k = Math.sqrt(1 - c * c);
  const buildN = Math.max(1, Math.floor(rate * build));

  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const other = ch === 1 ? buf.getChannelData(0) : null;
    // The tilt, as a one-pole lowpass whose coefficient walks: at the head of
    // the tail it passes everything and by the end it is `tilt` of the band.
    // One multiply and one add a sample, which is why it can be done here and
    // not as a filter on the output — a filter on the output darkens the head
    // as much as the end, which is the thing a real room does not do.
    let z = 0;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const n = (s / 2147483648) - 1;
      const t = i / len;
      // Density: a plate is dense at once, a hall fills. Below `build` the
      // noise is thinned rather than faded, because a fade is a quiet dense
      // tail and thinning is what early reflections actually are.
      const dense = i >= buildN ? 1 : (i / buildN) ** 2;
      const thin = ((s >>> 9) & 1023) / 1024 < dense ? 1 : 0;
      const a = 1 - (1 - tilt) * t;
      z += a * (n * thin - z);
      const v = z * (1 - t) ** decay;
      d[i] = other ? c * other[i] + k * v : v;
    }
    // Every room is scaled to the same peak, so `decaySeconds` moves the tail
    // and not the level. The convolver's own normalisation is left on over the
    // top of it, which takes care of the energy; this takes care of the head.
    let peak = 0;
    for (let i = 0; i < len; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  }
  per.set(key, buf);
  return buf;
}

/**
 * The three rooms the kitchen's reverb has, as shapes rather than as names in a
 * switch. `mode` indexes this list, so a strategy asking for "the second one"
 * gets the hall and the descriptor says which is which.
 */
export const ROOMS: RoomPreset[] = [
  // a small room: dense quickly, gone quickly, and narrow, because a small room
  // is the one place two ears hear nearly the same thing
  { id: 'room', build: 0.012, decay: 4.2, tilt: 0.18, corr: 0.55, seconds: 1.0 },
  // a hall: forty milliseconds to fill, a long even fall, wide and dark
  { id: 'hall', build: 0.045, decay: 2.4, tilt: 0.08, corr: 0.2, seconds: 1.0 },
  // a plate: dense at the first sample, bright to the end, and the widest of
  // the three — a plate has no walls to correlate two pickups
  { id: 'plate', build: 0.0006, decay: 3.0, tilt: 0.5, corr: 0.05, seconds: 1.0 },
];

export default room;
