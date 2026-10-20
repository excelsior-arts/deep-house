// The rimmed bowl: a singing bowl sustained by friction, a stick drawn round its rim.
//
// The struck bowl (`bowlStruck`, a row of `mallets.ts`) is a strike and a ring: every mode at once, then each falling
// on its own decay. Rubbed, the same bowl does something no strike does: the stick feeds **one mode** a little on
// every turn, and the mode grows — over seconds, not milliseconds — until the stick's grip and the bowl's loss are in
// balance; lift the stick and it falls back into a free ring. So this is a held topology and not a mallet:
//
//   the modes     the struck row's own ratios, the bowl's modes in their beating pairs (1 and 1.0021, 2.71 and
//                 2.7165, 5.13), so the struck and the rimmed bowl are one instrument; each a sine, each pair mirrored
//                 about the middle (`rimPans`), so it beats across the field and as deep in either ear. What the rim
//                 changes is their levels: the rubbed pair carries the sound and the rest stand far under it.
//   the beat      a pair a hair apart is one mode split by the bowl not being perfectly round, and its beat is the
//                 sound; struck high the split beats fast, and a rubbed tone beating faster than about a second and a
//                 half reads as out of tune rather than as alive. So two partials within `pairWithin` of each other
//                 are one mode, and the upper is held no further than `beatMostHz` above the lower.
//   the rise      `attack` seconds from nothing, eased at both ends (a raised cosine: no corner where it starts and
//                 none where it arrives), then a fall to `sustain` of the crest over `fall` seconds while the stick
//                 stays on, then the free ring when it lifts: down to silence over `ring` seconds. A note's `dur` is
//                 how long the stick stays on the rim.
//   the friction  a narrow band of noise (`rubQ`) at `rubAt` times the fundamental (the row puts it on the bowl's
//                 second mode, where a stick's chatter on the rim sits), `rubLevel` under the crest, loudest in the
//                 first second, while the stick is still finding the mode and the tone has hardly begun, and then at
//                 `rubRest` of that: the stick's grain against the metal, never a hiss. Through the same lid.
//
// It holds as well as it plays a note (`holdRim`): the same body against `voice-contract.ts`, the arithmetic of
// holding `held.ts`'s (the note's eased rise; its release a free ring, exponential), with the stick's pressure (`rub`),
// the lid (`brightness`) and the level (`gain`) as controls. It plays on the melodic bus (the row's): the keys' shared
// chorus combs a held low sine into a beat twice as deep as the bowl's own.
// Six sources a note (five sines and the noise), and nothing that can run away: a bank of sines under envelopes.

import { midiToHz, route, panner, startTime, noiseSource, noiseBuffer, MIN_RELEASE, GAIN_FLOOR, CUTOFF_FLOOR } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import { insert } from './treat.ts';
import { heldVoice } from './held.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import type { HeldVoice, HoldRenderer } from './voice-contract.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, list, num, HZ, LEVEL, Q, SECONDS, SEND, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** `[ratio, level]` of each mode, the rubbed one first: the struck row's ratios */
  partials: list(list(num(0, 64), 2), 1, 8),
  /** two partials whose ratios stand within this share of each other are one mode's pair */
  pairWithin: num(0, 0.05),
  /** the fastest a pair may beat, in Hz */
  beatMostHz: num(0, 4),
  /** the rise: seconds from nothing to the crest */
  attack: SECONDS,
  /** after the crest, the level the stick keeps it at (a share of the crest), reached over `fall` seconds */
  sustain: UNIT,
  fall: SECONDS,
  /** the free ring once the stick lifts: seconds to silence */
  ring: SECONDS,
  /** the stick's grain: a band of noise at `rubAt` times the fundamental, its level under the crest (an amplitude
   * ratio, whatever the band's width), its sharpness */
  rubAt: num(0.5, 16),
  rubLevel: LEVEL,
  rubQ: Q,
  /** how long the grain stays loud while the stick finds the mode, and the share of it that stays */
  rubSettle: SECONDS,
  rubRest: UNIT,
  /** the lid over all of it */
  lpHz: HZ,
  spread: UNIT,
  trim: LEVEL,
  delay: SEND,
  reverb: SEND,
}, (m) => [
  ...m.partials.flatMap(([ratio], i) => (ratio > 0 ? [] : [`partials[${i}] has no ratio`])),
  ...(m.attack >= 0.5 ? [] : [`an attack of ${m.attack} s is a strike, not a rim`]),
  ...(m.rubQ > 0 ? [] : ['the grain has no sharpness']),
]);

/** What a row of this topology carries, as its contract types it. */
export type RimPatch = PatchOf<typeof PARAMETERS.fields>;

/** The raised cosine the rise is eased on: nothing to the crest with no corner at either end. */
const RISE = (() => {
  const c = new Float32Array(65);
  for (let i = 0; i < c.length; i++) c[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / (c.length - 1));
  return c;
})();

/**
 * **The frequencies of the modes**, as the topology plays them at `hz`: each partial at its ratio, and the upper of a
 * pair (a partial within `pairWithin` of the one before it) no further than `beatMostHz` above it. What a check reads
 * to hold the beat under the line.
 */
export function rimModes(R: Pick<RimPatch, 'partials' | 'pairWithin' | 'beatMostHz'>, hz: number): number[] {
  const out: number[] = [];
  R.partials.forEach(([ratio], i) => {
    const f = hz * ratio;
    const before = i > 0 ? R.partials[i - 1][0] : null;
    const paired = before != null && Math.abs(ratio - before) <= R.pairWithin * before;
    out.push(paired ? Math.min(f, out[i - 1] + R.beatMostHz) : f);
  });
  return out;
}

/**
 * **Where each mode stands**: the two partials of a pair mirrored about the middle at half the spread, the lower one
 * to the left in the first pair and to the right in the next (so neither ear holds every pair's louder member), a
 * mode with no pair in the middle. Mirrored, the pair beats as deep in the mono sum as its levels say and no ear
 * stands far deeper than the other: with the fundamental in the middle and its partner out at the spread, as the
 * mallet's alternation places them, the right ear beat 15-17 dB where the left beat 4.
 */
export function rimPans(R: Pick<RimPatch, 'partials' | 'pairWithin'>, spread: number): number[] {
  const paired = (i: number): boolean => i > 0 && Math.abs(R.partials[i][0] - R.partials[i - 1][0]) <= R.pairWithin * R.partials[i - 1][0];
  const out: number[] = [];
  let side = -1;
  for (let i = 0; i < R.partials.length; i++) {
    if (paired(i)) { out.push(-out[i - 1]); side = -side; continue; }
    out.push(i + 1 < R.partials.length && paired(i + 1) ? side * spread * 0.5 : 0);
  }
  return out;
}

/** The body: the modes and the grain into `g`, through one lid. Returns what a hold needs to move. */
function rimBody(ctx: BaseAudioContext, g: GainNode, time: number, p: NoteParams, R: RimPatch, held: boolean, attack: number) {
  const hz = midiToHz(p.midi);
  const spread = (p.spread ?? R.spread) * (p.spreadMul ?? 1);
  const lid = ctx.createBiquadFilter();
  lid.type = 'lowpass';
  lid.Q.value = 0.5;
  lid.frequency.value = Math.min(12000, R.lpHz * (p.cutoffMul ?? 1));
  lid.connect(g);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [lid];
  // the rubbed mode and the others: pressing harder brings the upper modes up a little (`rub` on a hold)
  const upper = ctx.createGain();
  upper.gain.value = 1;
  upper.connect(lid);
  nodes.push(upper);
  const pans = rimPans(R, spread);
  rimModes(R, hz).forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const lvl = ctx.createGain();
    lvl.gain.value = R.partials[i][1];
    const pan = panner(ctx, pans[i]);
    o.connect(lvl);
    lvl.connect(pan);
    // the rubbed pair straight to the lid; the modes over it through the pressure's gain
    pan.connect(i < 2 ? lid : upper);
    o.start(time);
    sources.push(o);
    nodes.push(lvl, pan);
  });
  // the grain: a narrow band where the stick chatters, loud while the stick finds the mode and then under it
  const noise = held ? ctx.createBufferSource() : null;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  const at = Math.min(ctx.sampleRate * 0.45, hz * R.rubAt);
  band.frequency.value = at;
  band.Q.value = R.rubQ;
  const grain = ctx.createGain();
  // a band this narrow passes a sliver of the noise bed (uniform, an RMS of 1/sqrt 3): its level is stated as an
  // amplitude under the crest, so the gain is that over what the band lets through (its width, at/Q, of the half rate)
  const passed = Math.sqrt(at / R.rubQ / (ctx.sampleRate / 2)) / Math.sqrt(3);
  const grainLevel = R.rubLevel / Math.max(1e-6, passed);
  grain.gain.setValueAtTime(0, time);
  // the stick finds the mode over the first quarter of the rise (the note's own, a second at most)
  const finds = Math.min(1, attack * 0.25);
  grain.gain.linearRampToValueAtTime(grainLevel, time + finds);
  grain.gain.setTargetAtTime(grainLevel * R.rubRest, time + finds, R.rubSettle / 3);
  // the stick's pressure on a hold (`rub`), after the grain's own envelope, so moving it never cuts that line
  const press = ctx.createGain();
  press.gain.value = 1;
  band.connect(grain);
  grain.connect(press);
  press.connect(lid);
  nodes.push(band, grain, press);
  if (noise) {
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    noise.connect(band);
    noise.start(time);
    sources.push(noise);
  }
  return { lid, upper, band, grain, press, sources, nodes };
}

/** One stroke of the stick round the rim: the rise, the stick's hold, and the free ring when it lifts. */
function rim(R: RimPatch, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time);
  const vel = p.vel ?? 0.8;
  const peak = Math.max(GAIN_FLOOR, vel * (p.gain ?? 1) * R.trim);
  const attack = Math.max(0.5, p.attack ?? R.attack);
  // the stick stays on for the note's length, and never less than the rise
  const on = Math.max(attack, p.dur ?? attack + R.fall);
  const ring = Math.max(MIN_RELEASE, p.release ?? R.ring);
  const end = time + on + ring + MIN_RELEASE;

  const g = ctx.createGain();
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  g.gain.value = 0;
  g.gain.setValueCurveAtTime(RISE.map((v) => v * peak), time, attack);
  g.gain.setValueAtTime(peak, time + attack);
  // falling back while the stick stays on: toward the sustain over `fall`, an exponential approach
  const kept = Math.max(GAIN_FLOOR, peak * R.sustain);
  if (on > attack) g.gain.setTargetAtTime(kept, time + attack, Math.max(0.05, R.fall / 3));
  // the stick lifts: the free ring, an exponential fall to the floor over `ring`, then true zero
  g.gain.setTargetAtTime(GAIN_FLOOR, time + on, ring / 6.9);
  g.gain.setValueAtTime(GAIN_FLOOR, time + on + ring);
  g.gain.linearRampToValueAtTime(0, time + on + ring + MIN_RELEASE);

  const body = rimBody(ctx, g, time, p, R, false, attack);
  // a note's grain is a window of the shared noise bed, as long as the stick is on and a breath after
  const noise = noiseSource(ctx, time, on + 0.5);
  noise.connect(body.band);
  body.grain.gain.setTargetAtTime(0, time + on, 0.15);
  for (const s of body.sources) s.stop(end + 0.02);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1, delay: p.delay ?? R.delay, reverb: p.reverb ?? R.reverb });
  return end;
}

/**
 * **The rimmed bowl, held**: the stick on the rim for as long as the hold lasts, no length and no scheduled end.
 *
 *   controls  `gain` — the level it holds at
 *             `rub` — the stick's pressure, 0 to 1: the grain's level and the modes over the rubbed one (at 1, the
 *                     row's own; at 0, the rubbed pair alone and no grain)
 *             `brightness` — the lid's corner, in Hz
 *   tail      the row's `ring`: the free ring once the stick lifts, stated before anybody asks.
 */
export function holdRim(row: SoundRow): HoldRenderer {
  return (ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): HeldVoice => {
    // the row's numbers as the note reads them, the desk's moves on them
    const R = patchOf(settings, row, PARAMETERS);
    const time = startTime(ctx, at);
    const level = Math.max(GAIN_FLOOR, (p.vel ?? 0.8) * (p.gain ?? 1) * R.trim);
    const attack = Math.max(MIN_RELEASE, p.attack ?? R.attack);
    const tail = p.tail ?? R.ring;
    const g = ctx.createGain();
    g.channelCount = 2;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'speakers';
    // the note's rise, eased at both ends, written through the gain's line (sixteen straight legs on the raised
    // cosine) so a control during it starts from where it had got to
    const rise = Array.from({ length: 17 }, (_, i) => ({ v: level * RISE[i * 4], t: time + (attack * i) / 16, k: (i ? 'lin' : 'set') as 'lin' | 'set' }));
    const body = rimBody(ctx, g, time, p, R, true, attack);
    route(ctx, g, out, { dry: 1, delay: p.delay ?? R.delay, reverb: p.reverb ?? R.reverb });
    return heldVoice(ctx, {
      gain: g,
      tail,
      level,
      attack: { from: 0, to: level, t0: time, t1: time + attack },
      attackPoints: rise,
      // the stick lifts and the bowl rings free: the same decibels every second, as the note's ring falls
      shape: 'exponential',
      parked: [
        { param: body.lid.frequency, value: body.lid.frequency.value },
        { param: body.upper.gain, value: 1 },
        { param: body.press.gain, value: 1 },
      ],
      controls: {
        gain: (v) => [[g.gain, Math.max(GAIN_FLOOR, v)]],
        brightness: (v) => [[body.lid.frequency, Math.max(CUTOFF_FLOOR, Math.min(12000, v))]],
        rub: (v) => {
          const r = Math.max(0, Math.min(1, v));
          return [[body.upper.gain, Math.max(GAIN_FLOOR, r)], [body.press.gain, Math.max(GAIN_FLOOR, r)]];
        },
      },
      sources: body.sources,
      nodes: [...body.nodes, g],
    });
  };
}

/**
 * The rimmed bowl's topology (`sounds/keyboard/bowlRim.json`): the struck bowl's modes, fed by a stick on the rim.
 * Its held entry is `holdRim(row)`.
 */
export const RIM_BOWL: Topology = {
  id: 'rim-bowl',
  cost: 'dear',
  parameters: PARAMETERS,
  // the row's own numbers at each note, with the desk's moves on them (`patchOf`: a row with no block)
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => rim(patchOf(settings, row, PARAMETERS), ctx, out, time, p, settings),
};

export default RIM_BOWL;
