// The reese topology: three detuned saws through a slow low-pass, a sine under
// them, and — where a row asks — a soft clip in front of the filter.
//
// Round KV1 of the kitchen: a bass that *moves* in the mid-range, which no
// bottom in this catalogue did — every one of them is one oscillator and a
// lid, and a reese is the sound of three of them drifting against each other.
// Round R1 made it one topology over three rows (`sounds/bass/reeseBass.json`,
// `reeseDriven.json`, `reeseDeep.json`) where there were three modules.
//
//   the saws     three sawtooths, the outer two `detune` of a semitone either
//                side of the middle one (`middle` is its level against the two
//                outer ones; `saws` their level together against the sine's).
//                Detuned saws beat, and the beating is not a vibrato — the
//                pitch holds — it is the phase of the upper harmonics rolling
//                round, the 5th harmonic three times as fast as the 2nd, which
//                is what the ear hears as the note *moving* inside itself.
//   the movement the outer two's detune breathes at `movementHz`, by
//                `movementDepth` of itself, and the filter's corner by
//                `cutoffDepth`, so the roll speeds and slows and the mid-range
//                opens and closes with it. Its phase is the note's own, so a
//                seeded line moves the same way every time.
//   the filter   a low-pass at `cutoffHz`, resonant by `resonanceDb`: the
//                mid-range a reese is *for* (300-900 Hz) and not the fizz over
//                it. The saws are high-passed off their own fundamental first
//                (`sawFloor`, in multiples of it) — three fundamentals
//                drifting apart cancel each other a second in, and the weight
//                is the sine's job.
//   the sub      a sine at the fundamental, beside the filter and not through
//                it, at `sub` of the saws' level: a bass whose weight comes
//                and goes with its phase is not a bass. `hpHz` is the floor.
//   the clip     `null`, or `{ drive, out, hardness, bend }`: a tanh, hard
//                enough to square the saws' corners off, and bent a little
//                asymmetric so it grows the even harmonics a tanh alone never
//                does, standing **before** the filter so its new harmonics are
//                the filter's to shape and not a fizz laid over it. A clip
//                before a low-pass is warm; after it, it is broken. It takes
//                the three saws whole, fundamentals and all, so what it makes
//                is the sums and differences of three drifting notes. `drive`
//                is the fraction of full scale the saws' summed peak is asked
//                to reach and never past it — a WaveShaper holds anything over
//                one at its last value, and that is a hard clip nobody chose;
//                `out` is the level after it. The DC the bend leaves is the
//                floor's to take out, and it does: two high-passes stand
//                behind it.
//
// The three rows: the reese (the numbers above as KV1 set them, `cutoffHz`
// 850); the driven twin (the clip in, the corner at 1700 — twice the reese's,
// its harmonics being its point — and its own measured knobs, since a knob's
// slope is measured on the voice that declares it); and round DNB-1's deep
// reese, the balance turned round for the fast broken beat's sub-led bass —
// the sine at 1.2 against the reese's 0.8, the saws at 1.2 against 2.4, the
// corner at 637.5, three-quarters of the reese's — with no knob table, so the
// drum and bass tempo's lean toward a lighter bass (`tempoBassLean`, which
// halves the reese's `mass`) does not reach it. Alone on a held A1 the deep
// one reads 96 % of its energy in 40-80 Hz and 0.9 % in 300-900 Hz (the reese:
// 74 % and 6.1 %), the body some twenty decibels under the note and still
// swinging 8 dB, where the readings put it.
//
// Every row is **mono, by a pin**: every source is summed to one channel and
// the output gain is pinned to one, as `subs.ts` says why. They land on the
// `sub` bus at the `sub` level, and their numbers are the row's own and not a
// block of the settings table (no `block`): the settings are hashed into the
// program lock, and a voice nothing draws at the house must not move it. The
// rows are held at nought in house-v2 by name (`BY_PLACE`,
// `packages/deep-house/src/catalogue-v2.ts`) and swapped onto the bass lane
// only where a place table names one.

import { midiToHz, route, startTime, phasedLfo, harmonicWave, MIN_RELEASE, CUTOFF_FLOOR, curveOf } from '../dsp.ts';
import { insert } from './treat.ts';
import { knobScale, noteControl } from './descriptor.ts';
import type { NoteParams, VoiceRenderer } from './descriptor.ts';
import { patchOf } from './sound.ts';
import { centsOf, liveOf } from './live.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, inUnit, maybe, list, num, pos, table, DB, HZ, LEVEL, LFO_HZ, RATIO, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { beatCurve, beatAt, bodyBuffer, levelBuffer, levelRate, BEAT_CONTROL_RATE } from './reese-motion.ts';
import { subEntry } from './reese-entry.ts';
import { bodyCurve as readBodyCurve } from './reese-body.ts';
import { remainingCurve } from './output-envelope.ts';
import { contourElapsed, dipsFrom } from './contour-time.ts';

/**
 * The clip in front of the filter, where a row has one: `tanh(hardness x) /
 * tanh(hardness)` bent by `bend` toward its even half. A hardness of nought is
 * the curve's own limit, a straight line (E04 of the outside review of 10-03:
 * it was a division by nought, and 2048 samples of NaN); a bend past a half
 * either way folds the curve back on itself, and at minus one divides by
 * nought.
 */
const CLIP = table({
  drive: LEVEL,
  out: LEVEL,
  hardness: num(0, 50),
  bend: num(-0.5, 0.5),
});

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  /** the output level, before the note's own gain */
  trim: LEVEL,
  attack: SECONDS,
  release: SECONDS,
  /** the outer saws' offset, as a fraction of a semitone */
  detune: num(0, 12),
  /** the middle saw's level against the two outer ones */
  middle: LEVEL,
  /** the three saws' level together, against the sine's; a clip's drive is divided by it */
  saws: pos(16),
  /** the low-pass corner, in hertz */
  cutoffHz: HZ,
  /** decibels of resonance at the corner (Q is decibels on a low-pass) */
  resonanceDb: DB,
  /** how fast the detune and the corner breathe */
  movementHz: LFO_HZ,
  /** how far the outer detune breathes, as a fraction of itself */
  movementDepth: UNIT,
  /** how far the corner breathes, as a fraction of itself */
  cutoffDepth: UNIT,
  /** how far the level breathes with it, as a fraction of the peak (round DNB-7: the mid-bass voice's wobble); nought builds nothing */
  levelDepth: UNIT,
  /** the sine under the saws, against their level */
  sub: LEVEL,
  /** where the saws are high-passed off their own fundamental, in multiples of it */
  sawFloor: RATIO,
  /** the floor: nothing under it is the reese's */
  hpHz: HZ,
  clip: maybe(CLIP),
  /**
   * the sine's own harmonics, the 2nd up, as levels against the fundamental (10-06, hands-on: source 9's bass
   * is a sine with h2 -43, h3 -27, h5 -45 dB; null, a pure sine). Each is a desk line (`subHarmonics[1]` is
   * the third), at most the fundamental's own level (the liquid knobs, 10-07). Root's, when a bird moves it.
   */
  subHarmonics: maybe(list(inUnit(num(0, 1), 'level'), 1, 16)),
  /**
   * **The unequal pair** (the liquid bass rounds, 10-06/07; its numbers the row's own since the liquid
   * knobs, 10-07): a second pure sine `hz` over the note at `level` of the sine's, so the two beat — a
   * beat rate in hertz (nought: no pair) and its depth as a ratio of amplitudes, held under the ratio at
   * which the pair would cancel the note. A note may write its own (`subBeatHz`, `subBeatLevel`); a note's
   * pair curve (`subBeatCurve`, the composer's share of the row's depth at the time it was written) is
   * heard at the row's depth as the desk has it, over the row's own. Veil's, when a bird moves it.
   * Null: a plain sine, no pair.
   */
  pair: maybe(table({ hz: inUnit(num(0, 12), 'hz'), level: inUnit(num(0, 0.75), 'ratio') })),
  /**
   * **The low entrance** (10-07): a sine from `cents` over the note's first pitch settling onto it in
   * `seconds`, at `level` of the line, on a note that asks for it (`subEntryLevel` over nought, the
   * composer's: a run after a rest). A note's own level, cents and seconds are heard scaled by the row's
   * number as the desk has it over the row's own. Root's, when a bird moves it. Null: no entrance.
   */
  entry: maybe(table({ level: inUnit(num(0, 1), 'level'), cents: inUnit(num(0, 1200), 'cents'), seconds: inUnit(num(0.03, 0.25), 'seconds') })),
  /** how soon the line is back after a dip under the backbeat (a note's `dips`), past the dip's 8 ms fall */
  dipRecovery: inUnit(num(0.005, 0.2), 'seconds'),
});

/** A desk line's factor on what a note wrote: its number now over the row's own, exactly 1 where nothing moved. */
const ownFactor = (now: number | undefined, own: number | undefined): number =>
  now !== undefined && own !== undefined && own > 0 ? now / own : 1;

/** What a row of this topology carries, as its contract types it. */
export type ReesePatch = PatchOf<typeof PARAMETERS.fields>;
/** The clip in front of the filter, where a row has one. */
export type ReeseClip = NonNullable<ReesePatch['clip']>;

/** The clip's curve, once per hardness and bend. */
const clipCurve = (c: ReeseClip): Float32Array<ArrayBuffer> => curveOf(`reese-clip:${c.hardness}:${c.bend}`, () => {
  const n = 2048;
  const out = new Float32Array(n);
  const k = c.hardness;
  const a = c.bend;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // at nought hardness the curve's limit, `x` itself: tanh(k x) / tanh(k) -> x
    const y = k > 1e-6 ? Math.tanh(k * x) / Math.tanh(k) : x;
    out[i] = (y + a * y * y) / (1 + a);
  }
  return out;
});

// H3 following the unequal pair's phase, with its amplitude proportional to
// the pair's envelope (p=1). One cycle carries frequency offset in channel 0
// and normalized harmonic amplitude in channel 1. Native buffer playback
// interpolates the controls; no sample loop runs on the JavaScript thread.
const bodyCycles = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const BODY_CYCLE_SAMPLES = 2048;
function bodyCycle(ctx: BaseAudioContext, ratio: number, hz: number, h3: number): AudioBuffer {
  let per = bodyCycles.get(ctx);
  if (!per) bodyCycles.set(ctx, (per = new Map()));
  const key = `${ratio}:${hz}:${h3}`;
  let buffer = per.get(key);
  if (!buffer) {
    buffer = ctx.createBuffer(2, BODY_CYCLE_SAMPLES, ctx.sampleRate);
    const frequency = buffer.getChannelData(0), amplitude = buffer.getChannelData(1);
    const power = 1 + ratio * ratio;
    for (let i = 0; i < BODY_CYCLE_SAMPLES; i++) {
      const c = Math.cos(2 * Math.PI * i / BODY_CYCLE_SAMPLES);
      const d = power + 2 * ratio * c;
      frequency[i] = 3 * hz * (ratio * c + ratio * ratio) / d;
      amplitude[i] = h3 * Math.sqrt(d / power);
    }
    // At most 1 MiB cached per live context; phases reuse a table.
    if (per.size >= 64) per.delete(per.keys().next().value!);
    per.set(key, buffer);
  }
  return buffer;
}

function render(row: SoundRow): VoiceRenderer {
  const knobs = row.descriptor.knobs;
  return function reese(ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
    const time = startTime(ctx, at);
    const S = patchOf(settings, row, PARAMETERS);
    // the row's own numbers, under any desk move: what a note's written pair and entrance were written against
    const own = row.parameters as ReesePatch;
    // The ride (round DUB-4): a note the composer writes with `ride` at one
    // plays into the bass drive's side door alone (`Bus.ride`, master.ts) — the
    // copy drives it and the bus never hears it clean, so a figure can ride the
    // copy over a held line without doubling its sub. Where the theme built no
    // copy there is no door, and the note is silence.
    const controls0 = row.descriptor.controls ?? {};
    const ride = noteControl(p, controls0, 'ride') === 1;
    const door = ride ? (out as VoiceOut & { ride?: AudioNode }).ride : null;
    if (ride && !door) return time;
    const hz = midiToHz(p.midi);
    const dur = Math.max(0.05, p.dur ?? 0.3);
    const release = p.release ?? S.release;
    const end = time + Math.max(dur, S.attack + 0.02) + release;
    const stop = end + MIN_RELEASE;
    const vel = p.vel ?? 1;
    const peak = vel * (p.gain ?? 1) * S.trim;

    const detune = S.detune * knobScale(p, knobs, 'detune');
    const cutoff = S.cutoffHz * knobScale(p, knobs, 'brightnessHz');
    // The movement's rate and phase as a note may write them (round DUB-1): a
    // row that declares the two controls lets the composer lock the sweep to
    // the grid — the theme's own rate on every note, and where in its cycle
    // the note starts (`movementPhase`, in turns, nought the corner at its
    // lowest) — so the sweep runs on across notes on the bar's phase. A row
    // that declares neither, and a note that writes neither, breathes from its
    // own start at the row's rate as every reese always has.
    const controls = row.descriptor.controls ?? {};
    const movement = noteControl(p, controls, 'movementHz') ?? S.movementHz * knobScale(p, knobs, 'movement');
    const at0 = noteControl(p, controls, 'movementPhase');
    // An unequal pair, where the row declares it: a quieter pure sine a fixed
    // number of hertz above the pitched wave. The difference makes the beat;
    // it is neither a gain LFO nor pitch vibrato. The row's `pair` (null on
    // every reese but the sine's) is the rate and depth; a note may write its own.
    const subBeatHz = noteControl(p, controls, 'subBeatHz') ?? S.pair?.hz ?? 0;
    // A note started inside itself (`curveDuration`, `contour-time.ts`) is that
    // far into its contours: its path and its dips from there — the path is
    // straight between knots, so trimming it is exact, and the dips already past
    // are dropped — and its pair's phase advanced by the time gone. The pair's
    // own curve is not trimmed: its knots join by smoothstep, which a trimmed
    // curve would restart, so it is read at the elapsed point on (`beatBuffer`'s
    // offset), value and slope both. Ordinary notes start at nought.
    const curveElapsed = contourElapsed(p);
    if (curveElapsed > 0) p = { ...p,
      ...(Array.isArray(p.bend) ? { bend: remainingCurve(p.bend, curveElapsed) } : {}),
      ...(Array.isArray(p.dips) ? { dips: dipsFrom(p.dips, curveElapsed) } : {}),
      subBeatPhase: ((p.subBeatPhase ?? 0) + curveElapsed * subBeatHz) % 1 };
    const pitchCents = noteControl(p, controls, 'pitchCents') ?? 0;
    // Ratio motion assumes a fixed spacing in hertz. Existing detune vibrato
    // changes that spacing, so a note requesting it retains the static path.
    const written = pitchCents > 0 ? null : beatCurve(p.subBeatCurve, controls.subBeatLevel, stop - time);
    // a written curve at the row's depth as the desk has it: `v × 1` is `v` where nothing moved
    const kPair = ownFactor(S.pair?.level, own.pair?.level), pairMax = controls.subBeatLevel?.max ?? 0.75;
    const curve = written && written.map((v, i) => (i % 2 ? Math.min(pairMax, v * kPair) : v));
    const dynamic = curve && curve.some((v, i) => i % 2 === 1 && v !== curve[1]) ? curve : null;
    const subBeatLevel = (curve ? beatAt(curve, curveElapsed)[0] : null) ?? noteControl(p, controls, 'subBeatLevel') ?? S.pair?.level ?? 0;
    const subBeatPhase = noteControl(p, controls, 'subBeatPhase') ?? controls.subBeatPhase?.default ?? 0;
    const beating = subBeatHz > 0 && (subBeatLevel > 0 || dynamic !== null);
    const h3 = S.subHarmonics?.[1] ?? 0;
    const bodyFollow = beating && subBeatLevel < 1 && h3 > 0
      && (noteControl(p, controls, 'subBodyFollow') ?? controls.subBodyFollow?.default ?? 0) === 1;
    // Preserve stationary mean-square power, including the main wave's
    // harmonics. The instantaneous peaks still rise and fall: that is the
    // intended beating, not extra steady level hidden in the new component.
    const subPower = beating ? 1 + (S.subHarmonics ?? []).reduce((sum, h) => sum + h * h, 0) : 1;
    const subNorm = beating && !dynamic ? Math.sqrt(subPower / (subPower + subBeatLevel * subBeatLevel)) : 1;
    // The clip as a note may switch it (round DUB-2): `grit` at nought takes
    // the row's clip out for the note, so a listening row can hear the line
    // with and without it; a row that does not declare it, and a note that
    // does not write it, plays the row's clip as it always has.
    const clip = noteControl(p, controls, 'grit') === 0 ? null : S.clip;
    const sub = S.sub * knobScale(p, knobs, 'mass');
    // **The glide and the pitch's wobble** (round DNB-5), where a row declares
    // them and a note writes them: a note with `slideFrom` slides into its pitch
    // over `glide` seconds, every oscillator together, and the movement that
    // sweeps the corner sweeps the pitch by `pitchCents` either way — source 8's
    // line, a sine whose notes glide into the next and wobble on the eighths. A
    // row that declares neither, and a note that writes neither, plays as every
    // reese always has (the composer writes `slideFrom` on any legato change, so
    // the glide is the control's and not the field's).
    const glide = noteControl(p, controls, 'glide');
    const fromHz = glide && typeof p.slideFrom === 'number' && Number.isFinite(p.slideFrom) && p.slideFrom !== p.midi ? midiToHz(p.slideFrom) : null;
    // **A path** (round DNB-7, the glide line): where a row declares `glide`, a note may
    // write `bend`, its pitch's path as pairs — seconds from the note's start, semitones
    // over its note — moving straight in pitch from one to the next, every oscillator
    // together: a home held, a glide up a fourth and back, inside one note and one
    // envelope, so a line that glides is not a string of notes struck again.
    const bend = controls.glide && Array.isArray(p.bend) && p.bend.length >= 4 && p.bend.length % 2 === 0
      && p.bend.every((v: unknown) => typeof v === 'number' && Number.isFinite(v)) ? p.bend as number[] : null;
    const tune = (f: AudioParam, scale = 1): void => {
      const base = hz * scale;
      if (bend) {
        f.setValueAtTime(base * 2 ** (bend[1] / 12), time);
        let last = time;
        for (let i = 2; i < bend.length; i += 2) {
          const t = time + Math.max(0, bend[i]);
          const v = base * 2 ** (Math.max(-24, Math.min(24, bend[i + 1])) / 12);
          if (t > last + 1e-4) f.exponentialRampToValueAtTime(v, t); else f.setValueAtTime(v, t);
          last = Math.max(last, t);
        }
        return;
      }
      if (!fromHz) { f.value = base; return; }
      f.setValueAtTime(fromHz * scale, time);
      f.exponentialRampToValueAtTime(base, time + Math.min(glide!, dur * 0.9));
    };

    // The envelope: linear from true zero, a hold, a linear fall to true zero —
    // at 40 Hz one cycle is twenty-five milliseconds, and an exponential corner
    // down there is heard as a click (`subs.ts`).
    const g = ctx.createGain();
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    g.channelInterpretation = 'discrete';
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + S.attack);
    g.gain.setValueAtTime(peak, Math.max(time + S.attack, time + dur - release * 0.5));
    g.gain.linearRampToValueAtTime(0, end);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = S.hpHz;
    hp.Q.value = -3.01;
    // **The level's wobble** (round DNB-7, `levelDepth`): the movement that sweeps the
    // corner swells and dips the level with it — at its lowest where the corner is, by
    // `levelDepth` of the peak — so a line held on one note shakes on the grid the
    // movement is locked to (the mid-bass voice over a glide line; his ear on source 8,
    // 10-05: "a wobble perceived with sixteenth amplitude … that shaking sound"). A row
    // at nought builds nothing and plays as every reese always has.
    const wob = S.levelDepth > 0 ? ctx.createGain() : null;
    const wobDepth = S.levelDepth > 0 ? ctx.createGain() : null;
    if (wob && wobDepth) {
      wob.channelCount = 1;
      wob.channelCountMode = 'explicit';
      wob.gain.value = 1 - S.levelDepth / 2;
      wobDepth.gain.value = S.levelDepth / 2;
      hp.connect(wob);
      wob.connect(g);
    } else hp.connect(g);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = S.resonanceDb - 3.01;
    lp.frequency.value = Math.min(12000, Math.max(CUTOFF_FLOOR, cutoff));
    lp.connect(hp);

    // The movement: one LFO, two depths — the outer detune and the corner.
    // `phasedLfo` starts at cos(-phase); a sweep at its lowest at nought turns
    // and rising is -cos, which is the cosine half a turn on.
    const lfo = phasedLfo(ctx, movement, at0 != null ? -2 * Math.PI * (at0 + 0.5) : ((p.midi ?? 36) % 5) * 1.2);
    const cutDepth = ctx.createGain();
    cutDepth.gain.value = lp.frequency.value * S.cutoffDepth;
    lfo.connect(cutDepth);
    cutDepth.connect(lp.frequency);
    if (wob && wobDepth) { lfo.connect(wobDepth); wobDepth.connect(wob.gain); }
    lfo.start(time);
    lfo.stop(stop);

    // The saws, summed into one channel before anything else sees them, and
    // high-passed off their own fundamental before the filter: three
    // fundamentals drifting apart cancel each other a second in, and the weight
    // is the sine's job (below). What the saws keep is the second harmonic up,
    // which is the mid-range the roll is heard in.
    const saws = ctx.createGain();
    saws.channelCount = 1;
    saws.channelCountMode = 'explicit';
    saws.gain.value = S.saws / (2 + S.middle);
    let into: AudioNode = lp;
    const floors: BiquadFilterNode[] = [];
    for (let i = 0; i < 2; i++) {
      const off = ctx.createBiquadFilter();
      off.type = 'highpass';
      off.frequency.value = hz * S.sawFloor;
      off.Q.value = -3.01;
      off.connect(into);
      into = off;
      floors.push(off);
    }
    let pre: GainNode | null = null;
    let post: GainNode | null = null;
    if (clip) {
      // The saws' own peak is their summed level, so the gain in front of the
      // clip is the fraction of full scale that peak is asked to reach.
      pre = ctx.createGain();
      pre.gain.value = clip.drive / S.saws;
      const shaper = ctx.createWaveShaper();
      shaper.curve = clipCurve(clip);
      shaper.oversample = '2x';
      post = ctx.createGain();
      post.gain.value = clip.out;
      pre.connect(shaper);
      shaper.connect(post);
      post.connect(into);
      into = pre;
    }
    saws.connect(into);
    const cents = detune * 100;
    const outer: Array<{ side: number; osc: OscillatorNode; breathe: GainNode }> = [];
    let middleLvl: GainNode | null = null;
    let middleOsc: OscillatorNode | null = null;
    for (const side of [-1, 0, 1]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      tune(o.frequency);
      o.detune.value = side * cents;
      if (side !== 0) {
        const breathe = ctx.createGain();
        breathe.gain.value = side * cents * S.movementDepth;
        lfo.connect(breathe);
        breathe.connect(o.detune);
        outer.push({ side, osc: o, breathe });
      }
      const lvl = ctx.createGain();
      lvl.gain.value = side === 0 ? S.middle : 1;
      if (side === 0) { middleLvl = lvl; middleOsc = o; }
      o.connect(lvl);
      lvl.connect(saws);
      o.start(time);
      o.stop(stop);
    }

    // The sub, beside the saw filter. A following H3 replaces only that one
    // coefficient; the original power calculation above still includes it.
    // A musical contour scales H3 alone. With no following body, the main
    // wave keeps its third and a phase-aligned extra third supplies only the
    // difference. At unity its path is silent, preserving the original wave.
    const bodyCurve = h3 > 0 ? readBodyCurve(p.bodyCurve, curveElapsed) : null;
    const writeBody = (param: AudioParam, scale: number, less = 0): void => {
      param.setValueAtTime(scale * (bodyCurve![1] - less), time);
      for (let i = 2; i < bodyCurve!.length; i += 2)
        param.linearRampToValueAtTime(scale * (bodyCurve![i + 1] - less), time + bodyCurve![i]);
    };
    const sine = ctx.createOscillator();
    if (S.subHarmonics) {
      sine.setPeriodicWave(harmonicWave(ctx, bodyFollow ? S.subHarmonics.map((h, i) => i === 1 ? 0 : h) : S.subHarmonics));
    } else sine.type = 'sine';
    // With a beating pair, both oscillators receive the same audio-rate
    // pitch signal below. Mixing future intrinsic automation with an input
    // signal accumulates different phase in the first partial render block.
    if (beating) sine.frequency.value = 0;
    else tune(sine.frequency);
    const sineG = ctx.createGain();
    sineG.gain.value = sub * subNorm;
    sine.connect(sineG);
    const movingNorm = beating && dynamic ? ctx.createGain() : null;
    if (movingNorm) {
      movingNorm.gain.value = 0;
      sineG.connect(movingNorm);
      movingNorm.connect(hp);
    } else sineG.connect(hp);
    sine.start(time);
    sine.stop(stop);
    let extraThird: OscillatorNode | null = null;
    if (bodyCurve && !bodyFollow) {
      extraThird = ctx.createOscillator();
      extraThird.setPeriodicWave(harmonicWave(ctx, []));
      if (beating) extraThird.frequency.value = 0;
      else tune(extraThird.frequency, 3);
      const share = ctx.createGain();
      share.channelCount = 1; share.channelCountMode = 'explicit'; share.channelInterpretation = 'discrete';
      writeBody(share.gain, h3, 1);
      extraThird.connect(share);
      share.connect(sineG);
      extraThird.start(time);
      extraThird.stop(stop);
    }
    // An opt-in low entrance leaves the pair, H3 and the complete written
    // bend path untouched. The ordinary HP, note gain and snare dips still
    // shape it. With no request this adds no nodes or automation to L.
    // A note's ask is heard at the row's entrance as the desk has it: each written number by the line's
    // factor over the row's own (exactly 1 where nothing moved), each held to its control's range.
    const E = S.entry, ownE = own.entry;
    const asked = (name: string, field: 'level' | 'cents' | 'seconds'): number | undefined => {
      const v = noteControl(p, controls, name), spec = controls[name];
      return v === undefined || !spec ? undefined : Math.max(spec.min, Math.min(spec.max, v * ownFactor(E?.[field], ownE?.[field])));
    };
    const entryLevel = asked('subEntryLevel', 'level') ?? 0;
    if (entryLevel > 0) {
      const firstHz = bend ? hz * 2 ** (Math.max(-24, Math.min(24, bend[1])) / 12) : fromHz ?? hz;
      subEntry(ctx, sineG, time, firstHz, entryLevel,
        asked('subEntryCents', 'cents') ?? E?.cents ?? 0,
        Math.min(dur, asked('subEntrySeconds', 'seconds') ?? E?.seconds ?? 0));
    }
    let beatSine: OscillatorNode | null = null;
    let body: OscillatorNode | null = null;
    if (beating) {
      // phasedLfo is a cached one-partial PeriodicWave: pi/2 is a sine, and
      // subtracting turns advances its phase relative to the main sine.
      // A composer may supply themeTime * subBeatHz modulo one to keep the
      // beat phase across runs. With no phase it restarts per run; neither
      // choice depends on the AudioContext clock. A resumed partial run must
      // advance the supplied phase by its elapsed duration.
      beatSine = phasedLfo(ctx, subBeatHz, Math.PI / 2 - 2 * Math.PI * subBeatPhase);
      // Add the original pitch trajectory as an audio-rate DC signal. Merely
      // ramping between (frequency + offset) endpoints exponentially would
      // change the separation inside every glide; this holds it in hertz.
      const pitch = ctx.createConstantSource();
      tune(pitch.offset);
      pitch.connect(beatSine.frequency);
      pitch.connect(sine.frequency);
      if (extraThird) {
        const thirdPitch = ctx.createGain();
        thirdPitch.gain.value = 3;
        pitch.connect(thirdPitch);
        thirdPitch.connect(extraThird.frequency);
      }
      const beatGain = ctx.createGain();
      beatGain.channelCount = 1;
      beatGain.channelCountMode = 'explicit';
      beatGain.channelInterpretation = 'discrete';
      beatGain.gain.value = dynamic ? 0 : subBeatLevel;
      beatSine.connect(beatGain);
      beatGain.connect(sineG);
      pitch.start(time);
      pitch.stop(stop);
      beatSine.start(time);
      beatSine.stop(stop);
      // Match phasedLfo's cached 1/64-turn starting phase.
      const turn = 2 * Math.PI;
      const requested = Math.PI / 2 - turn * subBeatPhase;
      const step = Math.round((((requested % turn) + turn) % turn) * (64 / turn)) % 64;
      const phase = ((16 - step + 64) % 64) / 64;
      // A moving pair (the engine review of 10-08, F5): its ratio and its power normalisation follow the written
      // smoothstep alone, so they are a control buffer at a millisecond grid (`levelRate`); only a following body's
      // H3 frequency and amplitude, which turn at the pair's own rate, stay a 4 kHz buffer, and a note without one
      // builds none. Until then all four were one buffer at 4 kHz.
      let movingSplit: ChannelSplitterNode | null = null;
      if (dynamic && movingNorm) {
        const rate = levelRate(dynamic);
        const levels = ctx.createBufferSource();
        levels.buffer = levelBuffer(ctx, dynamic, stop - time, subPower, rate, curveElapsed);
        levels.playbackRate.value = rate / ctx.sampleRate;
        const split = ctx.createChannelSplitter(2);
        levels.connect(split);
        split.connect(beatGain.gain, 0);
        split.connect(movingNorm.gain, 1);
        levels.start(time);
        levels.stop(stop);
        if (bodyFollow) {
          const source = ctx.createBufferSource();
          source.buffer = bodyBuffer(ctx, dynamic, stop - time, subBeatHz, phase, h3, curveElapsed);
          source.playbackRate.value = BEAT_CONTROL_RATE / ctx.sampleRate;
          movingSplit = ctx.createChannelSplitter(2);
          source.connect(movingSplit);
          source.start(time);
          source.stop(stop);
        }
      }
      if (bodyFollow) {
        // Match the secondary sine's actual cached starting phase: phasedLfo
        // rounds its cosine phase to 1/64 turn. The body must follow that pair,
        // rather than the slightly different unrounded requested phase.
        const theta = turn * phase;
        const angle = Math.atan2(subBeatLevel * Math.sin(theta), 1 + subBeatLevel * Math.cos(theta));
        body = phasedLfo(ctx, 0, Math.PI / 2 - 3 * angle);
        // Share the same pitch integration as the low pair, threefold. Its
        // phase offset must survive fractional-block starts too.
        const bodyPitch = ctx.createGain();
        bodyPitch.gain.value = 3;
        pitch.connect(bodyPitch);
        bodyPitch.connect(body.frequency);
        const level = ctx.createGain();
        level.channelCount = 1;
        level.channelCountMode = 'explicit';
        level.channelInterpretation = 'discrete';
        level.gain.value = 0;
        body.connect(level);
        if (bodyCurve) {
          const share = ctx.createGain();
          share.channelCount = 1; share.channelCountMode = 'explicit'; share.channelInterpretation = 'discrete';
          writeBody(share.gain, 1);
          level.connect(share);
          share.connect(sineG);
        } else level.connect(sineG);
        if (movingSplit) {
          movingSplit.connect(body.frequency, 0);
          movingSplit.connect(level.gain, 1);
        } else {
          const cycle = ctx.createBufferSource();
          cycle.buffer = bodyCycle(ctx, subBeatLevel, subBeatHz, h3);
          cycle.loop = true;
          cycle.playbackRate.value = subBeatHz * BODY_CYCLE_SAMPLES / ctx.sampleRate;
          const split = ctx.createChannelSplitter(2);
          cycle.connect(split);
          split.connect(body.frequency, 0);
          split.connect(level.gain, 1);
          cycle.start(time, phase * BODY_CYCLE_SAMPLES / ctx.sampleRate);
          cycle.stop(stop);
        }
        body.start(time);
        body.stop(stop);
      }
    }
    if (pitchCents > 0) {
      const wob = ctx.createGain();
      wob.gain.value = pitchCents;
      lfo.connect(wob);
      wob.connect(sine.detune);
      if (beatSine) wob.connect(beatSine.detune);
      if (body) wob.connect(body.detune);
      if (extraThird) wob.connect(extraThird.detune);
      for (const { osc } of outer) wob.connect(osc.detune);
      if (middleOsc) wob.connect(middleOsc.detune);
    }

    // **What this note can still take** (PLAN-DESK D1b): every number above
    // that stands on a parameter it built, by the row's path, through the same
    // arithmetic — the corner through the knob it was built with (as a
    // `detune` on the filter, so the movement riding its frequency is scaled
    // with it, as the note scales it), the resonance onto the Q, the levels
    // against the trim it was built at. The envelope, the clip's curve and the
    // three saws' count are the build's and are not here.
    const live = liveOf(ctx);
    if (live) {
      const kBright = knobScale(p, knobs, 'brightnessHz');
      const kMass = knobScale(p, knobs, 'mass');
      const kDetune = knobScale(p, knobs, 'detune');
      const kMove = knobScale(p, knobs, 'movement');
      const corner = (x: number) => Math.min(12000, Math.max(CUTOFF_FLOOR, x));
      const built = lp.frequency.value;
      const own = noteControl(p, controls, 'movementHz') !== undefined;
      const cur = { saws: S.saws, middle: S.middle, trim: S.trim, sub: S.sub, detune: S.detune, depth: S.movementDepth, drive: clip ? clip.drive : 0, out: clip ? clip.out : 0 };
      const level = () => (S.trim > 0 ? cur.trim / S.trim : 1);
      const sawsAt = (): number => (cur.saws / (2 + cur.middle)) * (clip ? 1 : level());
      const sine = (): [AudioParam, number] => [sineG.gain, cur.sub * kMass * level() * subNorm];
      const breathing = () => outer.map(({ side, breathe }) => [breathe.gain, side * cur.detune * kDetune * 100 * cur.depth] as [AudioParam, number]);
      live
        .on('cutoffHz', (v) => [[lp.detune, centsOf(corner(v * kBright), built)]])
        .on('resonanceDb', (v) => [[lp.Q, v - 3.01]])
        .on('movementHz', (v) => (own ? [] : [[lfo.frequency, v * kMove]]))
        .on('movementDepth', (v) => { cur.depth = v; return breathing(); })
        .on('cutoffDepth', (v) => [[cutDepth.gain, built * v]])
        .on('levelDepth', (v) => (wob && wobDepth ? [[wob.gain, 1 - v / 2], [wobDepth.gain, v / 2]] : []))
        .on('sub', (v) => { cur.sub = v; return [sine()]; })
        .on('saws', (v) => { cur.saws = v; return [[saws.gain, sawsAt()], ...(pre ? [[pre.gain, cur.drive / v] as [AudioParam, number]] : [])]; })
        .on('middle', (v) => { cur.middle = v; return [[saws.gain, sawsAt()], ...(middleLvl ? [[middleLvl.gain, v] as [AudioParam, number]] : [])]; })
        .on('trim', (v) => {
          if (!(S.trim > 0)) return [];
          cur.trim = v;
          return [sine(), post ? [post.gain, cur.out * level()] : [saws.gain, sawsAt()]];
        })
        .on('hpHz', (v) => [[hp.frequency, v]])
        .on('detune', (v) => { cur.detune = v; return [...outer.map(({ side, osc }) => [osc.detune, side * v * kDetune * 100] as [AudioParam, number]), ...breathing()]; })
        .on('sawFloor', (v) => floors.map((f) => [f.frequency, hz * v] as [AudioParam, number]));
      if (pre && post) live
        .on('clip.drive', (v) => { cur.drive = v; return [[pre!.gain, v / cur.saws]]; })
        .on('clip.out', (v) => { cur.out = v; return [[post!.gain, v * level()]]; });
      live.keep(row.id, row, settings, stop);
    }

    // **The note's dips** (10-06, hands-on: source 9's line steps aside under its snare — about 8 dB, back within a
    // sixteenth, no new attack): pairs of seconds-into-the-note and decibels,
    // each a fall over 8 ms and a rise over 80 ms unless a declared control asks otherwise.
    const dips = Array.isArray(p.dips) && p.dips.length >= 2 && p.dips.length % 2 === 0
      && (p.dips as unknown[]).every((v) => typeof v === 'number' && Number.isFinite(v)) ? p.dips as number[] : null;
    let head: AudioNode = g;
    if (dips) {
      const recovery = noteControl(p, controls, 'dipRecovery') ?? S.dipRecovery;
      const returnAt = 0.008 + recovery;
      const guard = recovery + 0.01;
      const dg = ctx.createGain();
      dg.channelCount = 1; dg.channelCountMode = 'explicit'; dg.channelInterpretation = 'discrete';
      dg.gain.setValueAtTime(1, time);
      for (let i = 0; i < dips.length; i += 2) {
        const t = time + Math.max(0, dips[i]), lvl = Math.pow(10, Math.min(0, dips[i + 1]) / 20);
        if (t + guard > end) continue;
        dg.gain.setValueAtTime(1, t);
        dg.gain.linearRampToValueAtTime(lvl, t + 0.008);
        dg.gain.linearRampToValueAtTime(1, t + returnAt);
      }
      g.connect(dg);
      head = dg;
    }
    const tail = insert(ctx, p, head, time, stop, settings);
    route(ctx, tail, door ? { dry: door } : out, { dry: 1, delay: 0, reverb: 0 });
    return stop;
  };
}

/**
 * The four ranges a row may declare, as PLAN-MODULATION declares them, each
 * defaulting from the row's own number: `detune`, `brightnessHz` (the corner),
 * `movement` (its rate) and `mass` (the sine against the saws).
 */
export const REESE: Topology = {
  id: 'reese',
  cost: 'dear',
  parameters: PARAMETERS,
  knobOf: { detune: 'detune', brightnessHz: 'cutoffHz', movement: 'movementHz', mass: 'sub' },
  // round DUB-1: the movement's rate as a note may write it, where a row declares it; the liquid knobs
  // (10-07): the pair, the entrance's shape and the dips' recovery, the row's own numbers a note may write
  // over. A note's `subEntryLevel` is its ask (nought, none) and not the row's level, so it maps onto nothing
  controlOf: {
    movementHz: 'movementHz', subBeatHz: 'pair.hz', subBeatLevel: 'pair.level',
    subEntryCents: 'entry.cents', subEntrySeconds: 'entry.seconds', dipRecovery: 'dipRecovery',
  },
  // D1b: what a sounding reese can still take; the clip's curve, the envelope and the saws' count are the build's
  live: {
    cutoffHz: 'hz', resonanceDb: 'db', movementHz: 'hz', movementDepth: 'ratio', cutoffDepth: 'ratio', levelDepth: 'ratio', sub: 'level',
    saws: 'level', middle: 'level', trim: 'level', hpHz: 'hz', detune: 'x', sawFloor: 'x', 'clip.drive': 'level', 'clip.out': 'level',
  },
  render,
};

export default REESE;
