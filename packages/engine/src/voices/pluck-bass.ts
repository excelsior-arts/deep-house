// The plucked mid bass: the second bass register, an octave over the sub.
//
// It is the "what to try next" item the developer's notes have carried since
// the timbre study — *a second bass register: a plucked mid bass an octave up,
// under the keys, that the eleventh voicings can lean on, and the only honest
// answer to the 500 Hz - 2 kHz hole, which no filter can close*. A hole in a
// band is a hole in the *material*: there is nothing playing there, and an EQ
// can only make the nothing louder.
//
// **It is an audition instrument and nothing in v1 can reach it.** Round G of
// PLAN-V1-NEXT registers it so the completeness gate sees it — one descriptor,
// one entry in the REGISTRY, its numbers in `src/params.ts` beside the other
// instruments — and no candidate list of any style names it, so no die can draw
// it and no seed moves. Both locks were checked either side of the commit that
// registered it and neither moved; the fixtures in `tools/audition.ts` are the
// only things that play it, and they are tests.
//
// The shape, and where each piece of it comes from:
//
//   the note    one sine at the fundamental, through nothing but the body
//               filter. `bass.ts` learned this twice over by ear —
//               a sine driven through a tanh is a sine plus everything — and
//               the lesson is the same an octave up: whatever the rest of the
//               chain does, the pitch of this line stays a clean tone.
//   the body    a sawtooth and a quiet square under it, detuned a few cents
//               either way, saturated *together* and well under the note. A
//               saw already has harmonics, so a little drive on it is colour
//               rather than the fuzz a driven sine is; this is where the
//               500 Hz - 2 kHz this voice exists for actually comes from.
//   the pick    eight milliseconds of high-passed noise, rendered into a
//               one-channel buffer ahead of time (see `preparePluckBass`) and
//               played back through a band-pass. It is the attack a plucked
//               string has and an oscillator does not, and it is the second
//               reason this voice reads in the mids.
//   the filter  a lowpass that starts open and falls onto its corner in about
//               seventy milliseconds. `bass.ts` already does exactly this on
//               every note ("a small lift on each new note so a pitch change
//               speaks"); on a pluck it is the plucking. The timbre study's
//               "nothing closes a filter inside a note" is a measurement of
//               the *harmonic* layer of the references — a held chord — and
//               not of a bass attack.
//
// `mono: true`, and it is a promise about the whole voice and not just the
// oscillators: the pick's buffer has one channel, nothing here is panned, and
// nothing is sent to a stereo return. A kick that read its click off the
// two-channel noise buffer is what made Firefox grow a second channel at every
// beat (`master.ts`, the kick bus), and a mono voice that reaches for a stereo
// reverb is the same mistake with a tail on it.

import { midiToHz, adsrEnv, route, saturationCurve, evenCurve, startTime, lcg, CUTOFF_FLOOR } from '../dsp.ts';
import { insert } from './treat.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Descriptor, NoteParams, PrepareOptions } from './descriptor.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { patchOf } from './sound.ts';
import type { SoundRow, Topology } from './sound.ts';
import { contract, num, pos, CENTS, DB, HZ, LEVEL, OVERSAMPLE, Q, RATIO, SECONDS, UNIT } from './schema.ts';
import type { PatchOf } from './schema.ts';
import type { VoiceRenderer } from './descriptor.ts';

/** What a row of this topology carries: exactly these, each in its range (`schema.ts`). */
const PARAMETERS = contract({
  attack: SECONDS,
  decay: SECONDS,
  sustain: UNIT,
  release: SECONDS,
  cutoff: HZ,
  openMult: RATIO,
  openCeiling: HZ,
  openTime: SECONDS,
  q: DB,
  body: LEVEL,
  square: LEVEL,
  detuneCents: CENTS,
  /** the saturation's amount (`saturationCurve`): nought is clean */
  drive: num(0, 8),
  /** the even shaper's bend (`evenCurve`): past a half either way the curve folds back on itself */
  even: num(-0.5, 0.5),
  oversample: OVERSAMPLE,
  trim: LEVEL,
  pickLevel: LEVEL,
  /** the pick's fall, in seconds: the pick buffer is six of these long, so a second is its ceiling */
  pickDecay: pos(1),
  /** the one-pole that takes the bottom out of the pick's noise: a coefficient, nought to one */
  pickTilt: UNIT,
  pickHz: HZ,
  pickQ: Q,
  hpHz: HZ,
});

/** What a row of this topology carries, as its contract types it. */
export type PluckBassPatch = PatchOf<typeof PARAMETERS.fields>;

/** The rows of this topology, by event name, as the registry admitted them. */
const ROWS = new Map<string, SoundRow>();

// The pick, rendered once per context and per shape rather than per note.
//
// It is a WeakMap on the context, so a context that has been let go takes its
// buffers with it: ten starts and stops of a fixture leave ten collected
// contexts and one live cache, which is what `tools/test.ts` counts.
const picks = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * One pick transient, as samples: white noise with its bottom taken out by a
 * one-pole difference and an exponential fall over `pickDecay`. One channel,
 * deterministic from a fixed seed, so the live take and the rendered file are
 * the same pick and neither has a side.
 * @param P the settings' `pluckBass` block
 */
export function pickBuffer(ctx: BaseAudioContext, P: PluckBassPatch): AudioBuffer {
  let per = picks.get(ctx);
  if (!per) {
    per = new Map();
    picks.set(ctx, per);
  }
  const key = `${P.pickDecay}:${P.pickTilt}:${ctx.sampleRate}`;
  const had = per.get(key);
  if (had) return had;
  const len = Math.max(16, Math.ceil(ctx.sampleRate * P.pickDecay * 6));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const noise = lcg(20260917);
  let low = 0;
  for (let i = 0; i < len; i++) {
    const white = noise();
    low += P.pickTilt * (white - low);
    d[i] = (white - low) * Math.exp(-i / (ctx.sampleRate * P.pickDecay));
  }
  per.set(key, buf);
  return buf;
}

/** How many pick buffers a context is holding. The ownership test reads it. */
export const pickCacheSize = (ctx: BaseAudioContext): number => (picks.get(ctx) ? picks.get(ctx)!.size : 0);

/**
 * The pre-render hook: the pick, before the first note wants it.
 *
 * It is a warm-up and never a requirement — `pluckBass` asks `pickBuffer` for
 * the same buffer and gets it whether this ran or not — so a note that arrives
 * before the preparation is finished sounds, it just pays for the buffer
 * itself. A theme with none of these events pays nothing at all, which is what
 * every v1 theme is.
 *
 * @param events this voice's own events, handed over by `prepareVoices`
 */
export function preparePluckBass(
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[],
  _opts: PrepareOptions = {},
): Promise<void> {
  if (!events || !events.length) return Promise.resolve();
  // Each event's own row, resolved as the note will resolve it (E06 of the
  // outside review of 10-03): this read `settings.pluckBass` whatever row the
  // event named, so a variant with numbers of its own was warmed as the
  // incumbent and built its pick on the play path. `pickBuffer` is keyed by
  // what it computes, so two rows with one pick share it.
  const seen = new Set<string>();
  for (const e of events) {
    const row = ROWS.get(e.voice);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    pickBuffer(ctx, patchOf(settings, row, PARAMETERS));
  }
  return Promise.resolve();
}

function pluckBass(row: SoundRow, ctx: BaseAudioContext, out: VoiceOut, time: number, p: NoteParams = {}, settings: Settings): number {
  time = startTime(ctx, time); // never in the past: a step if it is
  const B = patchOf(settings, row, PARAMETERS);
  const hz = midiToHz(p.midi);
  const dur = Math.max(0.06, p.dur ?? 0.3);
  const vel = p.vel ?? 1;

  // The envelope first: everything else is scheduled against the instant it
  // ends, so nothing is left running with nothing to do.
  const g = ctx.createGain();
  const decay = Math.min(B.decay, Math.max(0.05, dur * 0.7));
  const end = adsrEnv(g, time, vel * (p.gain ?? 1) * B.trim, {
    attack: B.attack,
    decay,
    sustain: B.sustain,
    hold: Math.max(0, dur - B.attack - decay),
    release: p.release ?? B.release,
  });
  // Two channels leave this voice, explicitly, and that is the promise of
  // `mono: true` rather than a detail of it. Everything above this node has one
  // channel, and what becomes of a one-channel stream inside the graph's
  // mid/side width stage is not the same in both engines: MEASURED, the same
  // eight bars came out of Chromium mono to the sample and out of Firefox with
  // the channels 0.0266 apart and two decibels of the level gone. It is the
  // kick bus's rule in reverse — `master.ts` pins that one to *one* channel so
  // that a second cannot arrive — and the answer is the same shape: pin it, and
  // the two channels that reach the bus are the same samples by construction
  // instead of by an engine's up-mixing rule.
  g.channelCount = 2;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';

  // The body filter, and the pluck. It opens `openMult` over its corner and
  // falls onto it over `openTime`; `cutoffMul` is the sound stage's own
  // contrast on the bass lane, the way `bass.ts` reads it.
  const cutoff = (p.cutoff ?? B.cutoff) * (p.cutoffMul ?? 1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = B.q;
  lp.frequency.setValueAtTime(Math.min(B.openCeiling, cutoff * B.openMult), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(CUTOFF_FLOOR, cutoff), time + B.openTime);
  lp.connect(g);

  // Nothing of this voice belongs in the sub's octave: the bottom is one
  // instrument's and this is the one above it.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = B.hpHz;
  hp.Q.value = 0.7;
  hp.connect(lp);

  // The note: one sine, clean, straight into the filter.
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(hz, time);
  o1.connect(hp);

  // The body: a saw and a square a few cents either side of it, through the
  // shapers and well under the note.
  const body = ctx.createGain();
  body.gain.value = B.body;
  const sat = ctx.createWaveShaper();
  sat.curve = saturationCurve(p.drive ?? B.drive);
  sat.oversample = B.oversample as OverSampleType;
  const even = ctx.createWaveShaper();
  even.curve = evenCurve(B.even);
  even.oversample = B.oversample as OverSampleType;
  body.connect(sat);
  sat.connect(even);
  even.connect(hp);

  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.setValueAtTime(hz, time);
  o2.detune.value = B.detuneCents;
  o2.connect(body);

  const o3 = ctx.createOscillator();
  o3.type = 'square';
  o3.frequency.setValueAtTime(hz, time);
  o3.detune.value = -B.detuneCents;
  const sq = ctx.createGain();
  sq.gain.value = B.square;
  o3.connect(sq);
  sq.connect(body);

  // The pick: the prepared burst, band-passed and gone inside a fiftieth of a
  // second. It goes in above the body filter's corner on purpose — the point
  // of it is the octave the body cannot reach.
  const pick = ctx.createBufferSource();
  pick.buffer = pickBuffer(ctx, B);
  const pickBand = ctx.createBiquadFilter();
  pickBand.type = 'bandpass';
  pickBand.frequency.value = B.pickHz;
  pickBand.Q.value = B.pickQ;
  const pickG = ctx.createGain();
  // The level and the velocity are the envelope's, not this node's: the pick
  // plays *through* `g` like everything else, so a gain here would be the
  // level applied twice and a pick at a fiftieth of what it says.
  pickG.gain.value = B.pickLevel;
  pick.connect(pickBand);
  pickBand.connect(pickG);
  pickG.connect(g);

  const tail = insert(ctx, p, g, time, end, settings);
  route(ctx, tail, out, { dry: 1 }); // no send: a mono voice cannot have a stereo tail

  for (const o of [o1, o2, o3]) {
    o.start(time);
    o.stop(end + 0.02);
  }
  pick.start(time);
  pick.stop(time + pick.buffer.duration);
  return end;
}

/**
 * The plucked mid bass topology: a saw and a square under a plucked filter
 * with a pre-rendered pick on the front (`sounds/bass/pluckBass.json` since
 * round R2).
 */
export const PLUCK_BASS: Topology = {
  id: 'pluck-bass',
  cost: 'dear',
  parameters: PARAMETERS,
  prepare: preparePluckBass,
  rows: ROWS,
  render: (row): VoiceRenderer => (ctx, out, time, p = {}, settings) => pluckBass(row, ctx, out, time, p, settings),
};
