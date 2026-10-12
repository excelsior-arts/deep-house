// The kick topology: one oscillator, shaped by the numbers a row states.
//
// A click at `startHz` falling to `endHz` over `pitchTime` and settling there,
// with an amplitude envelope given as its -6, -20 and -34 dB times (`t6`,
// `t20`, `t34`); a little saturation (`drive`) that puts harmonics in
// 120-250 Hz, where a small speaker can find the beat even though it cannot
// reproduce a note of the fundamental; a lowpass (`bodyLp`) right over the
// fundamental; a body partial (`partialHz`, `partialLevel`, `partialDecay`) a
// phone can reproduce; and a click (`clickLevel`, `clickHp`, `clickLp`,
// `clickAttack`) that is not built at a level of nought.
//
// **The record's row** is `sounds/drum/kick.json`, and its numbers are the
// benchmark's own (round R1 moved them out of `params.ts`; the measurements
// behind them, kept here because they are about the topology's numbers and
// not one row's): a click in the mid-50s Hz falling into the mid-40s by 40 ms,
// both benchmarks agreeing on the landing and not the start; the three times
// the benchmark states for -6, -20 and the end of anything audible; a click
// level of nought because at 0.1 the hats were 4 dB louder than the kick on a
// phone — the body partial puts the beat back on a small speaker instead; the
// body lid at 140 Hz because almost all of a deep house kick is 40-63 Hz and at
// 300 Hz the body carried 12-16 dB too much between 63 and 250 — *a rock drum*,
// in Eugene's words; the partial at 115 Hz for the 100-250 Hz a phone hears,
// decaying with the hit, at 0.2 since round EQ-1 (0.09 before: the body of
// the house's groove is taken from the partial, never from a higher lid, and
// 0.2 with the house's quiet bass edge took 100-300 Hz from 6-9 % of the
// power to 9-11 % with the 20-60 Hz band within 0.35 dB); and the drive at 0.07, because saturation
// on the kick is saturation *under the bass* and 0.18 put 4.8 dB more into
// 120-250 Hz than 0.06 did. A row with a `block` is voiced through the room's
// copy of it (`patchOf`), so a room's `kick.drive` and a place's `kick.t20`
// land where they always did.
//
// The two knobs (PLAN-MODULATION M1) are the row's: `hold` in **seconds** and
// not in the ratio the harmonic voices use — a kick's fraction still sounding
// at the bar line is nought by construction, so its tail is the -34 dB time —
// scaling all three legs together so the shape of the fall is the shape it
// was; and `attack`. It declares **no `brightnessHz`**: moving the body's lid
// is not a brighter kick, it is a tom, so it is a different instrument and not
// a knob. The two controls a part may write are the body's lid and the
// partial's level, kept in the kick's own register (300 Hz is where a deep
// house kick turns into a tom).

import { noiseSource, route, saturationCurve, MIN_RELEASE, startTime, GAIN_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { knobScale, withControls } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, HZ, LEVEL, SECONDS } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { Settings } from '../settings.ts';

/**
 * What a row of this topology carries: exactly these, as `sounds/SCHEMA.md`
 * says, each in its range (`schema.ts`). The three decay thresholds are times
 * from the onset; the voice keeps each after the one before it whatever a knob
 * asks, so their order is the voice's and not the row's.
 */
const PARAMETERS = contract({
  startHz: HZ,
  endHz: HZ,
  pitchTime: SECONDS,
  t6: SECONDS,
  t20: SECONDS,
  t34: SECONDS,
  clickLevel: LEVEL,
  attack: SECONDS,
  clickAttack: SECONDS,
  clickHp: HZ,
  clickLp: HZ,
  bodyLp: HZ,
  partialHz: HZ,
  partialLevel: LEVEL,
  partialDecay: SECONDS,
  /** the saturation's amount (`saturationCurve`): nought is clean */
  drive: num(0, 8),
});

/** What a row of this topology carries, as its contract types it. */
export type KickPatch = PatchOf<typeof PARAMETERS.fields>;

function render(row: SoundRow): VoiceRenderer {
  const knobs = row.descriptor.knobs;
  const controls = row.descriptor.controls;
  return function kick(ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
    if (controls) p = withControls(p, controls);
    time = startTime(ctx, time); // never in the past: a step if it is
    const K = patchOf(settings, row, PARAMETERS);
    const vel = p.vel ?? 1;
    const startHz = p.startHz ?? K.startHz;
    const endHz = p.endHz ?? K.endHz;
    // The two knobs, as factors against the numbers above: exactly 1 with nothing
    // asked for, so every line below is the line it always was to the bit.
    const kHold = knobScale(p, knobs, 'hold');
    const kAttack = knobScale(p, knobs, 'attack');
    const attack = K.attack * kAttack;
    // Each leg stays after the one before it, whatever the two knobs are asked
    // for together: an exponential ramp that ends before the one it starts from
    // is not a shorter decay, it is a throw. At the defaults each of these is the
    // row's own number, because `Math.max` of a number and something under
    // it is that number.
    const t6 = Math.max(attack + MIN_RELEASE, K.t6 * kHold);
    const t20 = Math.max(t6 + MIN_RELEASE, K.t20 * kHold);
    const t34 = Math.max(t20 + MIN_RELEASE, K.t34 * kHold);

    const sum = ctx.createGain();
    sum.gain.value = p.gain ?? 1;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, time);
    osc.frequency.exponentialRampToValueAtTime(endHz, time + K.pitchTime);

    const drive = ctx.createWaveShaper();
    drive.curve = saturationCurve(K.drive);
    drive.oversample = '2x';

    // The envelope, leg by leg, straight off the measured times.
    const g = ctx.createGain();
    const peak = Math.max(GAIN_FLOOR, vel);
    // A *linear* ramp from true zero. An exponential from 0.0001 spends its
    // last tenth of a millisecond crossing 60 dB, which is a step in all but
    // name and is the loudest sample of the hit; this reaches the peak over four
    // milliseconds and the loudest sample is the peak, where it belongs.
    g.gain.value = 0;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(peak * 0.5012, time + t6); // -6 dB
    g.gain.exponentialRampToValueAtTime(peak * 0.1, time + t20); // -20 dB
    g.gain.exponentialRampToValueAtTime(peak * 0.02, time + t34); // -34 dB
    g.gain.linearRampToValueAtTime(0, time + t34 + MIN_RELEASE);
    const end = time + t34 + MIN_RELEASE;

    // The kick is meant to be felt rather than heard: a lowpass right above the
    // fundamental keeps the saturation's harmonics as weight and throws away the
    // part that makes a kick sound like a tom.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = p.bodyLp ?? K.bodyLp;
    body.Q.value = 0.6;

    // The body partial: a second, shorter sine an octave or two up, which is the
    // part of a kick a small speaker can actually reproduce. It is a *drum*
    // sound — it decays with the hit — where the click was an attack transient.
    const partialLevel = p.partialLevel ?? K.partialLevel;
    if (partialLevel > 0) {
      const po = ctx.createOscillator();
      po.type = 'sine';
      po.frequency.setValueAtTime(K.partialHz * 1.35, time);
      po.frequency.exponentialRampToValueAtTime(K.partialHz, time + K.pitchTime * 1.6);
      const pg = ctx.createGain();
      pg.gain.value = 0;
      pg.gain.setValueAtTime(0, time);
      const partialDecay = Math.max(attack + MIN_RELEASE, K.partialDecay * kHold);
      pg.gain.linearRampToValueAtTime(partialLevel * vel, time + attack);
      pg.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + partialDecay);
      pg.gain.linearRampToValueAtTime(0, time + partialDecay + MIN_RELEASE);
      po.connect(pg);
      pg.connect(sum);
      po.start(time);
      po.stop(time + partialDecay + 0.02);
    }

    osc.connect(drive);
    drive.connect(body);
    body.connect(g);
    g.connect(sum);

    // A soft low-mid transient, not a tick. It was raised 8 dB and opened to
    // 3 kHz in the balance round to give a phone something to hear, and that was
    // the wrong lever: MEASURED, the benchmark kick slots have nothing above
    // about 2 kHz, and a 380 Hz - 3 kHz burst on every beat with an empty band
    // between beats reads as a click and not as a drum. The phone gets its
    // presence from the body partial above instead.
    //
    // A level of zero means the click is not built. Every envelope in this file
    // has a floor of 0.0002 under it, because a gain must never reach true zero
    // on the way down -- but a floor under a peak of nothing is a burst at
    // -74 dB that still runs a noise source and two filters on every beat. The
    // noise buffer is *stereo*, so that inaudible burst was also the one thing
    // making a mono voice two channels wide; `buildGraph` now pins the bus to
    // one channel as well, and between them the kick is mono in the graph and
    // mono in the node count.
    if (K.clickLevel > 0) {
      const click = noiseSource(ctx, time, 0.02);
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.value = K.clickHp;
      // Nothing on the kick above a couple of kHz: the click is a knock, not a
      // tick, and in the benchmarks the top of a kick slot is nearly empty.
      const ct = ctx.createBiquadFilter();
      ct.type = 'lowpass';
      ct.frequency.value = K.clickLp;
      ct.Q.value = 0.6;
      const cg = ctx.createGain();
      const cpeak = Math.max(GAIN_FLOOR, K.clickLevel * vel);
      cg.gain.value = 0;
      cg.gain.setValueAtTime(0, time);
      cg.gain.linearRampToValueAtTime(cpeak, time + K.clickAttack);
      // The click keeps the length it had: a longer ramp in front of the same
      // decay would be a louder click, and its band is 380 Hz - 3 kHz.
      cg.gain.exponentialRampToValueAtTime(GAIN_FLOOR, time + 0.005);
      cg.gain.linearRampToValueAtTime(0, time + 0.005 + MIN_RELEASE);
      click.connect(cf);
      cf.connect(ct);
      ct.connect(cg);
      cg.connect(sum);
    }

    // MEASURED: the kick has no reverb. The 100-300 Hz band isolates in 2 of 15
    // windows and has nothing to decay; whatever room exists is high-passed well
    // above it.
    route(ctx, sum, out, { dry: 1 });

    osc.start(time);
    osc.stop(end + 0.02);
    return end;
  };
}

/**
 * The four-to-the-floor's topology. A row of it owns the kick bus (it and the
 * sub are the record's bottom, so the mono gate holds both and the sound stage
 * moves neither); the row says so in its descriptor. `hold` defaults from
 * `t34`, `attack` from `attack`, and the two controls from the lid and the
 * partial's level, so a row's tables are held to its numbers.
 */
export const KICK: Topology = {
  id: 'kick',
  cost: 'cheap',
  parameters: PARAMETERS,
  knobOf: { hold: 't34', attack: 'attack' },
  controlOf: { bodyLp: 'bodyLp', partialLevel: 'partialLevel' },
  render,
};

export default KICK;
