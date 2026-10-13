// Three short noise bursts a few milliseconds apart plus a longer body, which
// is what makes a clap read as a room of hands rather than one.
//
// Heard on a desktop recording: a high-frequency clap following the drum, so
// abrupt that it sounded like the track clipping. It was. Measured against the growl benchmark's clap, which is
// down 20 dB in 36 ms, this one opened in 0.8 ms and was 20 dB down in 2.6 —
// a 5 kHz noise burst that appears and disappears inside three milliseconds is
// an edge, and an edge is what a clipped sample sounds like. Two things were
// wrong and both are fixed here:
//
//   the decay   the comment said 36 ms and the code asked `percEnv` for a
//               10 ms fall to silence, which is 20 dB down in under three.
//               The decay is now solved for the measurement: an exponential
//               that passes -20 dB at t20 and keeps going.
//   the room    `route(..., { dry: 1 }) // TEST no sends` had been left in,
//               so the clap had no room at all. Its short bright room —
//               MEASURED RT60 144 ms at 3-10 kHz behind a 53 ms pre-delay —
//               is most of what makes a hand clap read as hands in a room
//               rather than as a transient someone drew.
//
// A lid at 9.5 kHz on top, like the hats have, because nothing else in this
// music is brighter than that.

import { noiseBuffer, noiseSource, percEnv, route, panner, startTime} from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { NoteParams } from './descriptor.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, bool, num, HZ, SECONDS } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

// `percEnv` falls from the peak to 0.0001 over its decay. The measurement is
// the time to -20 dB, so this is the decay that puts -20 dB exactly there.
function decayForT20(peak: number, t20: number): number {
  const total = Math.log(0.0001 / peak);
  const twenty = Math.log(0.1);
  return Math.max(0.01, t20 * (total / twenty));
}

function clap(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const vel = p.vel ?? 1;
  const gain = (p.gain ?? 1) * vel;
  const C = patchOf(settings, row, PARAMETERS);

  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800;
  band.Q.value = 0.55;

  // The hands are not all the same hand: the later two go through a darker
  // band, which is the pitch spread a room of people has.
  const band2 = ctx.createBiquadFilter();
  band2.type = 'bandpass';
  band2.frequency.value = 1250;
  band2.Q.value = 0.5;

  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 3000;
  shelf.gain.value = 8;

  // A lid, as on every hat: a clap with nothing above it is a click.
  const lid = ctx.createBiquadFilter();
  lid.type = 'lowpass';
  lid.frequency.value = C.lidHz;
  lid.Q.value = 0.7;

  const sum = ctx.createGain();
  sum.gain.value = gain;

  band.connect(shelf);
  band2.connect(shelf);
  shelf.connect(lid);
  lid.connect(sum);

  // MEASURED: the clap is down 20 dB in 36 ms. The three hands are spread
  // across the first ten of those, which is a room and not a flam.
  const t20 = C.t20;
  const spread = Math.min(0.012, t20 * 0.33);
  const offsets = [0, spread * 0.45, spread];
  let end = time;
  offsets.forEach((off: number, i: number) => {
    const peak = 0.85 - i * 0.12;
    const src = noiseSource(ctx, time + off, t20 * 5);
    const g = ctx.createGain();
    end = Math.max(end, percEnv(g, time + off, peak, C.attack, decayForT20(peak, t20)));
    src.connect(g);
    g.connect(i === 0 ? band : band2);
  });

  // The crack (round SPARK-2, `notes/rounds/spark-2.md`): each hand's first
  // couple of milliseconds, the slap itself, band-passed where the
  // references' claps crack and let past the shelf and the lid. Their first
  // 6 ms stand a decibel over the 34 after (median, 2061 claps of the
  // catalogue's deep house); ours stood three under, every hand opening in
  // 4 ms. Nought builds nothing.
  if (C.crack > 0) {
    const crackBand = ctx.createBiquadFilter();
    crackBand.type = 'bandpass';
    crackBand.frequency.value = C.crackHz;
    crackBand.Q.value = 0.8;
    // through the hands' own shelf and lid, so the slap is coloured as they are
    crackBand.connect(shelf);
    offsets.forEach((off: number, i: number) => {
      // its own stretch of the noise, never the hand's: the same noise through
      // two band-passes side by side sums out of phase
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      src.start(time + off, ((time + off) * 7.13 + src.buffer.duration / 2) % src.buffer.duration);
      src.stop(time + off + C.crackDecay * 8 + 0.002);
      const g = ctx.createGain();
      const lvl = C.crack * (1 - i * 0.2);
      g.gain.value = 0;
      g.gain.setValueAtTime(0, time + off);
      g.gain.linearRampToValueAtTime(lvl, time + off + 0.0004);
      g.gain.exponentialRampToValueAtTime(lvl * 0.001, time + off + 0.0004 + C.crackDecay * 6.9);
      g.gain.linearRampToValueAtTime(0, time + off + 0.0004 + C.crackDecay * 6.9 + 0.001);
      end = Math.max(end, time + off + 0.0004 + C.crackDecay * 6.9 + 0.001);
      src.connect(g);
      g.connect(crackBand);
    });
  }

  // The body: the tail of the last hand, long enough to smear the three.
  const bodyPeak = 0.5;
  const bodySrc = noiseSource(ctx, time + spread * 1.3, t20 * 7);
  const bodyGain = ctx.createGain();
  end = Math.max(
    end,
    percEnv(bodyGain, time + spread * 1.3, bodyPeak, C.attack * 1.5, decayForT20(bodyPeak, t20 * 1.6))
  );
  bodySrc.connect(bodyGain);
  bodyGain.connect(band2);

  const pan = panner(ctx, p.pan ?? 0.06);
  sum.connect(pan);
  route(ctx, pan, out, { dry: p.dry ?? 1, room: p.room ?? settings.sends.clapReverb,
    ...(p.background !== undefined ? { background: p.background } : {}),
    ...(p.reverb !== undefined ? { reverb: p.reverb } : {}),
    ...(p.delay !== undefined ? { delay: p.delay } : {}) });
  return end;
}

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** the clap is there at all: a room that wants none says so */
  on: bool(),
  t20: SECONDS,
  attack: SECONDS,
  lidHz: HZ,
  /** the crack (round SPARK-2): each hand's slap, its level against the hand (nought builds none), its band and its fall (an e-fold) */
  crack: num(0, 2),
  crackHz: HZ,
  crackDecay: SECONDS,
});

/**
 * The clap topology: three hands and a body of noise through two bands under
 * a shelf and a lid (`sounds/drum/clap.json` since round R2: two and four,
 * into the short bright room). Its measured loudness is the row's timbre fact
 * and its click bound `measured.clickStep`.
 */
export const CLAP: Topology = {
  id: 'clap',
  cost: 'mid',
  parameters: PARAMETERS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => clap(row, ctx, out, time, p, settings),
};
