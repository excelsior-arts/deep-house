// The master chain, built identically for the live context and the offline
// render so an exported WAV is the same signal path you heard.
//
//   kick --------------------------------+
//   sub ----> duck (low) ----------------+
//   drums ----------------> macro LPF ---+-> air -> master -> soft clip -> out
//   melodic -> duck -----> macro LPF ----+
//                 ^
//                 |  one ramp per kick, 6-9 dB, minimum at 65 ms
//
// The kick and the sub are the floor of the record, so neither of them ever
// passes through the macro filter: a breakdown closes the music, not the
// bottom, and no arrangement move can take the weight out of the track.
//
// Two sends hang off the buses: a dotted-eighth ping-pong delay and a
// convolution reverb whose impulse is generated noise.

import PARAMS from './params.js';
import { impulseResponse, softClipCurve, saturationCurve, dbToGain, phasedLfo } from './dsp.js';

// The shared master: one of these per audio context, and everything goes
// through it — one track, or two decks running into each other at a seam.
//
// It used to be part of every graph, which meant the mix ran two limiters and
// two soft clippers on two halves of the same sound and summed the results
// straight to the speakers with nothing after them. Two decks at full fader
// is +6 dB, and what a listener hears when that lands on a 45 Hz sine is the
// bass distorting. One limiter, once, at the end.
// The limiter's module, loaded once per context. `buildMaster` is synchronous
// and `addModule` is not, so the load is a separate step a caller awaits before
// building the graph; a context that has not been through it, or one where the
// load failed, gets the fallback instead of a broken node.
let limiterReduction = 0;
export const limiterGr = () => +limiterReduction.toFixed(2);
export const resetLimiterGr = () => { limiterReduction = 0; };
const limiterReady = new WeakSet();
const limiterTried = new WeakMap();
export function limiterAvailable(ctx) {
  return limiterReady.has(ctx);
}
export function prepareLimiter(ctx) {
  if (limiterTried.has(ctx)) return limiterTried.get(ctx);
  const done = (async () => {
    if (!ctx.audioWorklet) return false;
    try {
      await ctx.audioWorklet.addModule(new URL('./limiter-worklet.js', import.meta.url));
      limiterReady.add(ctx);
      return true;
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.log('limiter worklet unavailable, master runs ' + PARAMS.master.limiterFallbackDb + ' dB lower: ' + e.message);
      }
      return false;
    }
  })();
  limiterTried.set(ctx, done);
  return done;
}

export function buildMaster(ctx) {
  const P = PARAMS;

  const out = ctx.createGain();
  out.gain.value = 1;

  // The trim is the last thing in the chain, so a change of ceiling never
  // changes what the limiter is doing.
  const trim = ctx.createGain();
  trim.gain.value = P.master.trim;
  trim.connect(out);

  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(P.master.clipDrive, P.master.clipKnee);
  clip.oversample = PARAMS.master.oversample;
  clip.connect(trim);

  // The ceiling: a look-ahead brick-wall limiter we own, in front of the
  // clipper. Everything before this point can be as loud as the arrangement
  // makes it; nothing after it can exceed the ceiling. The clipper behind it
  // is back to being what its comment always claimed -- a true-peak safety
  // that catches inter-sample overs and otherwise passes the signal through
  // untouched -- because the limiter now holds the level it used to hold by
  // shaping a quarter of full scale off the top of the loudest scenes.
  const L = P.master.limiter;
  // A ceiling of 1 or more cannot limit anything this chain produces, so it
  // means "no limiter" and the node is not built at all -- which is what
  // ?limiter=0 asks for.
  const limitOn = L.ceiling < 1;
  const haveWorklet = limitOn && limiterReady.has(ctx) && typeof AudioWorkletNode === 'function';
  let limiter;
  if (haveWorklet) {
    limiter = new AudioWorkletNode(ctx, 'lookahead-limiter', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      processorOptions: { lookaheadMs: L.lookaheadMs, holdMs: L.holdMs, releaseMs: L.releaseMs },
    });
    limiter.parameters.get('ceiling').value = L.ceiling;
    // What the ceiling had to do, so a bench can ask instead of guessing.
    limiter.port.onmessage = (e) => {
      const r = e.data && e.data.reduction;
      if (typeof r === 'number') limiterReduction = Math.max(limiterReduction, r);
    };
  } else {
    // No worklet, no ScriptProcessor: a ScriptProcessor runs on the main
    // thread and is exactly the node that put the block-grid bursts in the
    // capture. The honest fallback is to be quieter, so the clipper is not
    // asked to do a limiter's job.
    limiter = ctx.createGain();
    limiter.gain.value = limitOn ? dbToGain(P.master.limiterFallbackDb) : 1;
  }
  limiter.connect(clip);

  const master = ctx.createGain();
  master.gain.value = P.master.gain;
  master.connect(limiter);

  // A little air on the whole record, so the hats read as hats.
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = P.master.airHz;
  air.gain.value = P.master.airDb;
  air.connect(master);

  // Presence: the 2-6 kHz band the reference sets carry and a synthesised mix
  // does not. Tuned against the band table, not by taste.
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = P.master.presenceHz;
  presence.gain.value = P.master.presenceDb;
  presence.Q.value = P.master.presenceQ;
  presence.connect(air);

  // The midrange. MEASURED against the three sets' long-term spectrum: 500 Hz
  // to 2 kHz sits 15-22 dB under them, because the record is a kick, a sub and
  // a chord layer and a DJ set is a full production. A filter cannot invent
  // the parts that are missing, so this is deliberately a broad, gentle lift
  // and not an attempt to close the whole gap: the rest of it is the level of
  // the harmonic layers and how far back the sound stage pushes them.
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = P.master.midHz;
  mid.gain.value = P.master.midDb;
  mid.Q.value = P.master.midQ;
  mid.connect(presence);

  // The octave between the kick's body and the bottom of the chords, which the
  // generator leaves thin and the reference sets do not.
  const lowMid = ctx.createBiquadFilter();
  lowMid.type = 'peaking';
  lowMid.frequency.value = P.master.lowMidHz;
  lowMid.gain.value = P.master.lowMidDb;
  lowMid.Q.value = P.master.lowMidQ;
  lowMid.connect(mid);

  // The shelf that keeps the bass fundamental off the bell above it. The bell
  // is 160 Hz wide enough to be still lifting at 40, and every note the sub
  // plays lives there; the shelf takes the skirt back below about 90 Hz and
  // leaves the octave the bell was aimed at alone. It sits immediately in
  // front of the bell, so the two read as one stage.
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = P.master.lowShelfHz;
  lowShelf.gain.value = P.master.lowShelfDb;
  lowShelf.connect(lowMid);

  // A wide, gentle high-pass keeps DC and subsonic rumble out of the file.
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = P.master.dcHz;
  dcBlock.Q.value = P.master.dcQ;
  dcBlock.connect(lowShelf);

  return { ctx, input: dcBlock, out, dcBlock, lowShelf, lowMid, mid, presence, air, master, limiter, clip, trim, limiterIsWorklet: haveWorklet };
}

// One theme's graph: its buses, its sends, its sidechain, its width and its
// macro filter. `opts.master` hands it a master to feed; without one it builds
// its own, which is what a single track and the offline render of a single
// track do.
export function buildGraph(ctx, opts = {}) {
  // Anything whose only path to the destination is through an AudioParam can
  // be collected while it is still meant to be running. Hold on to them.
  const keepAlive = [];
  const bpm = opts.bpm || 122;
  const beatSeconds = 60 / bpm;
  const P = PARAMS;

  // Everything this theme makes, gathered in one place: the mono-folded
  // bottom, the wide top, and the kick-and-bass bus. The mono-maker and the
  // width stage stay here rather than in the master, because they are measured
  // per band against *this* theme's material, not against a sum of two.
  // The theme's own output gain, and the one place a per-theme loudness trim
  // is applied: under everything the theme does to itself — the sound stage,
  // the width, the macro filter — and above the master every deck shares, so
  // the limiter and the make-up see a record that has already been levelled
  // rather than one whose rooms are three decibels apart. `opts.trimDb` is
  // `track.trimDb`, worked out at plan time by `loudnessTrimDb` in params.js;
  // without one it is 0 dB and this node is what it always was.
  const themeOut = ctx.createGain();
  themeOut.gain.value = dbToGain(opts.trimDb || 0);

  const chain = opts.master || buildMaster(ctx);
  const out = opts.master ? themeOut : chain.out;
  if (!opts.master) themeOut.connect(chain.input);
  const dcBlock = themeOut;

  // Macro filter: the one automated knob of the arrangement. Q stays at
  // Butterworth: a resonant lowpass parked near Nyquist rings on every hat
  // transient, which reads as a click in the file.
  const macro = ctx.createBiquadFilter();
  macro.type = 'lowpass';
  macro.frequency.value = P.master.filterOpen;
  macro.Q.value = 0.707;

  // Mono below a corner, done as mid/side rather than as a crossover.
  //
  // MEASURED: 30-120 Hz is mono to three decimal places in the sources — but
  // 120-300 Hz is *not*: it still carries a side/mid of 0.38. What this stage
  // has to do is therefore narrow, and it used to be built the wrong way. An
  // 85 Hz lowpass folded to mono was summed with a 60 Hz stereo highpass at
  // the same polarity, and two filters of the same order at different corners
  // are not complementary: their phases disagree where they overlap, so the
  // sum notched the *mid* while the highpass went on passing the side.
  // Measured on the browser's own biquads at 48 kHz, mono in:
  //
  //   Hz        50     60     85    100    120    250
  //   mid    -4.57  -2.76  -2.76  -4.45  -4.33  -0.82
  //   side   -1.69  +0.50  +1.58  +1.36  +1.05  +0.27
  //
  // — four and a half decibels out of the centre of the record at 50 and
  // 100 Hz, and a low end that was never actually mono. Any low-mid EQ tuned
  // against that was compensating for a hole this stage had dug.
  //
  // Mid/side has neither problem by construction: M = (L+R)/2 goes through
  // untouched, so the magnitude response of the centre is exactly 0 dB at
  // every frequency, and only S = (L-R)/2 is highpassed. Below the corner
  // there is no side, which *is* mono; above it the width is whatever the
  // material had.
  //
  // A units note, because it is a real trap: Web Audio's `Q` on `lowpass` and
  // `highpass` is in **decibels of resonance at the cutoff**, not the linear Q
  // of a textbook biquad. `Q = 0.707` is +0.707 dB of peaking, not
  // Butterworth; Butterworth is linear 1/sqrt(2), which is `Q = -3.01` here.
  // `P.space.sideHpQdB` is named for its unit and set to that. The other Q
  // values in this file are deliberately left alone: several are timbres
  // tuned by ear around the response they actually have, and converting them
  // wholesale would change the sound without a measurement asking for it.
  const msLowSplit = ctx.createChannelSplitter(2);
  const lowMidSum = ctx.createGain();
  lowMidSum.gain.value = 0.5;
  const lowSidePos = ctx.createGain();
  lowSidePos.gain.value = 0.5;
  const lowSideNeg = ctx.createGain();
  lowSideNeg.gain.value = -0.5;
  msLowSplit.connect(lowMidSum, 0);
  msLowSplit.connect(lowMidSum, 1);
  msLowSplit.connect(lowSidePos, 0);
  msLowSplit.connect(lowSideNeg, 1);

  const sideHp = ctx.createBiquadFilter();
  sideHp.type = 'highpass';
  sideHp.frequency.value = P.space.sideHpHz;
  sideHp.Q.value = P.space.sideHpQdB;
  lowSidePos.connect(sideHp);
  lowSideNeg.connect(sideHp);

  const sideHpNeg = ctx.createGain();
  sideHpNeg.gain.value = -1;
  sideHp.connect(sideHpNeg);

  const msLowMerge = ctx.createChannelMerger(2);
  lowMidSum.connect(msLowMerge, 0, 0);
  lowMidSum.connect(msLowMerge, 0, 1);
  sideHp.connect(msLowMerge, 0, 0);
  sideHpNeg.connect(msLowMerge, 0, 1);
  msLowMerge.connect(dcBlock);

  macro.connect(msLowSplit);

  // Sidechain duck. Melodic material goes through it; the kick does not.
  const duck = ctx.createGain();
  duck.gain.value = 1;

  // MEASURED: the image breathes. The side/mid ratio of the chord band
  // modulates at about 0.21 Hz with a coefficient of variation of 0.45, and
  // that movement — not more width — is what a static generator is missing.
  // Mid/side: M = (L+R)/2, S = (L-R)/2, S scaled by a slow LFO, then back.
  const msSplit = ctx.createChannelSplitter(2);
  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  const side = ctx.createGain();
  side.gain.value = 0.5;
  const sideNeg = ctx.createGain();
  sideNeg.gain.value = -0.5;
  msSplit.connect(mid, 0);
  msSplit.connect(mid, 1);
  msSplit.connect(side, 0);
  msSplit.connect(sideNeg, 1);
  const sideSum = ctx.createGain();
  sideSum.gain.value = 1;
  side.connect(sideSum);
  sideNeg.connect(sideSum);

  const width = ctx.createGain();
  width.gain.value = P.space.widthBase;
  sideSum.connect(width);
  const widthLfo = phasedLfo(ctx, P.space.widthRateHz, opts.widthPhase || 0);
  const widthDepth = ctx.createGain();
  widthDepth.gain.value = P.space.widthDepth;
  widthLfo.connect(widthDepth);
  widthDepth.connect(width.gain);
  widthLfo.start(0);
  keepAlive.push(widthLfo, widthDepth);

  const widthNeg = ctx.createGain();
  widthNeg.gain.value = -1;
  width.connect(widthNeg);

  const msMerge = ctx.createChannelMerger(2);
  mid.connect(msMerge, 0, 0);
  mid.connect(msMerge, 0, 1);
  width.connect(msMerge, 0, 0);
  widthNeg.connect(msMerge, 0, 1);

  duck.connect(msSplit);
  msMerge.connect(macro);

  const melodic = ctx.createGain();
  melodic.gain.value = 1;
  melodic.connect(duck);

  const drums = ctx.createGain();
  drums.gain.value = 1;
  drums.connect(macro);

  // The kick and the bass share one bus and one compressor, so they read as
  // one instrument rather than two things that happen at the same time.
  //
  //   kick ---------------------------+
  //   sub -> duck -> body -> comp ----+-> glue -> saturation -> dcBlock
  //
  // The saturation and the glue are only built when they are doing something.
  // A WaveShaper with an identity curve and a compressor at ratio 1 are not
  // free: they are nodes in the path, and MEASURED, Firefox renders this
  // stretch of the chain very differently from Chromium — the kick's onset
  // step is 0.62 of its peak through the theme graph against 0.06 in Chromium
  // and 0.05 straight off the bus.
  const glueDrive = P.master.glue.drive;
  const glueSat = glueDrive > 0 ? ctx.createWaveShaper() : ctx.createGain();
  if (glueDrive > 0) {
    glueSat.curve = saturationCurve(glueDrive);
    glueSat.oversample = PARAMS.master.oversample;
  }
  glueSat.connect(dcBlock);

  const glueOn = P.master.glue.ratio > 1;
  const glue = glueOn ? ctx.createDynamicsCompressor() : ctx.createGain();
  if (glueOn) {
    glue.threshold.value = P.master.glue.threshold;
    glue.knee.value = P.master.glue.knee;
    glue.ratio.value = P.master.glue.ratio;
    glue.attack.value = P.master.glue.attack;
    glue.release.value = P.master.glue.release;
  }
  glue.connect(glueSat);

  // Nothing below the low twenties survives: it is headroom spent on something
  // no speaker in the room can reproduce.
  const lowHp = ctx.createBiquadFilter();
  lowHp.type = 'highpass';
  lowHp.frequency.value = P.bass.hpHz;
  lowHp.Q.value = P.bass.hpQ ?? 0.7;
  lowHp.connect(glue);

  // The push: a hot saturation of the low end in parallel with the clean one,
  // blended in by the arrangement for a few bars at a time. Parallel, so the
  // fundamental is never touched — the drive adds harmonics on top of a bass
  // that stays clean underneath.
  const pushSat = ctx.createWaveShaper();
  pushSat.curve = saturationCurve(P.push.satDrive);
  pushSat.oversample = PARAMS.master.oversample;
  const pushWet = ctx.createGain();
  pushWet.gain.value = 0;
  lowHp.connect(pushSat);
  pushSat.connect(pushWet);
  pushWet.connect(glue);

  const lowSum = ctx.createGain();
  lowSum.gain.value = 1;
  lowSum.connect(lowHp);

  const kickBus = ctx.createGain();
  kickBus.gain.value = 1;
  kickBus.connect(lowSum);

  // "Kick and bass mono" is the first rule in the file, and it was an
  // assumption about the voices rather than a property of the bus. It is now
  // the bus: one channel, explicitly, so whatever a voice hands it is summed
  // to the middle here and this stretch of the chain cannot be stereo.
  //
  // MEASURED, and the reason this is a rule and not a tidy-up. The kick still
  // builds its midrange click -- a burst off the *stereo* noise buffer, whose
  // two channels are only 0.62 correlated -- and `clickLevel` has been 0 since
  // the kick was measured against the benchmark slots, so what plays is the
  // 0.0002 floor the envelope will not go under: -74 dB, inaudible, and two
  // channels wide. That was enough to make the kick bus a *two* channel stream
  // for the five milliseconds of the click and a one channel stream for the
  // rest of the beat, and Firefox allocates a filter's per-channel state when
  // the channel arrives: at every kick, `lowHp`, `glue`, `pushSat` and every
  // biquad in the master grew a second channel whose history was zero while
  // the first kept the bass it had been filtering. The right channel then
  // rendered the bass through a highpass starting from rest -- a step of 0.52
  // at the output against 0.0001 in WebKit, right channel only, once per beat.
  // That is the click Eugene heard in one earphone in Firefox and in no other
  // engine. With the count pinned there is no second channel to arrive.
  for (const n of [kickBus, lowSum]) {
    n.channelCount = 1;
    n.channelCountMode = 'explicit';
  }

  // The bass, ducked and then compressed on its own before the glue: the duck
  // is the groove, the compressor is the density.
  const bassComp = ctx.createDynamicsCompressor();
  bassComp.threshold.value = P.bass.comp.threshold;
  bassComp.knee.value = P.bass.comp.knee;
  bassComp.ratio.value = P.bass.comp.ratio;
  bassComp.attack.value = P.bass.comp.attack;
  bassComp.release.value = P.bass.comp.release;

  // Body: the 80-160 Hz that turns a sine into a note you can hum.
  const bassBody = ctx.createBiquadFilter();
  bassBody.type = 'peaking';
  bassBody.frequency.value = P.bass.bodyHz;
  bassBody.gain.value = P.bass.bodyDb;
  bassBody.Q.value = P.bass.bodyQ;
  bassBody.connect(bassComp);

  // The duck sits *after* the bass compressor, not before it. With the duck
  // first, the compressor spent its time pushing the ducked part back up and
  // the bass came out as a straight line — which is most of why it read as a
  // hum rather than as a part.
  const duckLow = ctx.createGain();
  duckLow.gain.value = 1;
  duckLow.connect(lowSum);
  bassComp.connect(duckLow);
  // A dB or two of sub, only at the moments the push is up. It is its own node
  // because the transition automates the sub *bus* and the two must not fight.
  const subPush = ctx.createGain();
  subPush.gain.value = 1;
  subPush.connect(bassBody);
  const subBus = ctx.createGain();
  subBus.gain.value = 1;
  subBus.channelCount = 1;
  subBus.channelCountMode = 'explicit';
  subBus.connect(subPush);

  // --- delay send: dotted eighth, ping-pong ---
  const beat = 60 / bpm;
  const delayTime = P.sends.delayDotted * beat;
  const delayIn = ctx.createGain();
  delayIn.gain.value = 1;
  const dL = ctx.createDelay(2);
  dL.delayTime.value = delayTime;
  const fb = ctx.createGain();
  fb.gain.value = P.sends.delayFeedback;
  // MEASURED: ping-pong asymmetry is 0.00 at every lag in every window — these
  // records do not ping-pong their delays. One line, returning to both
  // channels at once, each repeat darker than the last.
  const dTone = ctx.createBiquadFilter();
  dTone.type = 'lowpass';
  dTone.frequency.value = 2400;
  dTone.Q.value = 0.6;
  const delayOut = ctx.createGain();
  delayOut.gain.value = P.sends.delayLevel;

  delayIn.connect(dL);
  dL.connect(delayOut);
  dL.connect(dTone);
  dTone.connect(fb);
  fb.connect(dL);
  delayOut.connect(duck); // echoes duck under the kick too

  // --- reverb send ---
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const preDelay = ctx.createDelay(0.5);
  preDelay.delayTime.value = 0.018;
  const rvbCut = ctx.createBiquadFilter();
  rvbCut.type = 'highpass';
  // Low enough that the wash reaches into 120-300 Hz, where the references
  // still have width and energy, and high enough to stay off the bass.
  rvbCut.frequency.value = P.sends.reverbLowHz;
  const rvbTop = ctx.createBiquadFilter();
  rvbTop.type = 'lowpass';
  rvbTop.frequency.value = P.sends.reverbToneHz;
  const conv = ctx.createConvolver();
  conv.buffer = impulseResponse(ctx, P.sends.reverbSeconds, 3.1, 'hall', P.sends.reverbCorr);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = P.sends.reverbLevel;

  reverbIn.connect(preDelay);
  preDelay.connect(rvbCut);
  rvbCut.connect(conv);
  conv.connect(rvbTop);
  rvbTop.connect(reverbOut);
  reverbOut.connect(duck);

  // --- a slow chorus, shared by the keys, so stabs are wide without each
  // note carrying its own delay line ---
  const keysIn = ctx.createGain();
  keysIn.gain.value = 1;
  const chorusDry = ctx.createGain();
  chorusDry.gain.value = 0.7;
  keysIn.connect(chorusDry);
  chorusDry.connect(melodic);
  [[0.012, 0.18, -0.6], [0.0175, 0.23, 0.6]].forEach(([base, rate, pan]) => {
    const dl = ctx.createDelay(0.1);
    dl.delayTime.value = base;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 0.0035;
    lfo.connect(depth);
    depth.connect(dl.delayTime);
    lfo.start(0);
    keepAlive.push(lfo, depth);
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    keysIn.connect(dl);
    dl.connect(pn);
    pn.connect(wet);
    wet.connect(melodic);
  });

  // --- the clap room: short, bright, and behind a real pre-delay ---
  const roomIn = ctx.createGain();
  roomIn.gain.value = 1;
  const roomPre = ctx.createDelay(0.5);
  roomPre.delayTime.value = P.sends.roomPreDelay;
  const roomHp = ctx.createBiquadFilter();
  roomHp.type = 'highpass';
  roomHp.frequency.value = P.sends.roomLowHz;
  const roomConv = ctx.createConvolver();
  roomConv.buffer = impulseResponse(ctx, P.sends.roomSeconds, 5.5, 'room', P.sends.roomCorr);
  const roomLp = ctx.createBiquadFilter();
  roomLp.type = 'lowpass';
  roomLp.frequency.value = P.sends.roomHighHz;
  const roomOut = ctx.createGain();
  roomOut.gain.value = P.sends.roomLevel;
  roomIn.connect(roomPre);
  roomPre.connect(roomHp);
  roomHp.connect(roomConv);
  roomConv.connect(roomLp);
  roomLp.connect(roomOut);
  roomOut.connect(drums);

  // --- the piano's hall: long, dark and a little behind the note ---
  //
  // Built the first time something actually sends to it, so a theme with no
  // piano in it never pays for a four-second convolver. `route()` checks the
  // send amount before it touches this getter.
  let hallIn = null;
  const hall = () => {
    if (hallIn) return hallIn;
    hallIn = ctx.createGain();
    hallIn.gain.value = 1;
    const pre = ctx.createDelay(0.5);
    pre.delayTime.value = P.sends.hallPreDelay;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = P.sends.hallLowHz;
    const conv = ctx.createConvolver();
    conv.buffer = impulseResponse(ctx, P.sends.hallSeconds, P.sends.hallDecay, 'piano', P.sends.hallCorr);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = P.sends.hallToneHz;
    const level = ctx.createGain();
    level.gain.value = P.sends.hallLevel;
    hallIn.connect(pre);
    pre.connect(hp);
    hp.connect(conv);
    conv.connect(lp);
    lp.connect(level);
    level.connect(duck);
    return hallIn;
  };

  const bus = (dry) => ({
    dry,
    delay: delayIn,
    reverb: reverbIn,
    room: roomIn,
    get hall() {
      return hall();
    },
  });

  return {
    ctx,
    out,
    themeOut,
    chain,
    master: chain.master,
    macro,
    duck,
    duckLow,
    melodic,
    air: chain.air,
    presence: chain.presence,
    glue,
    bassComp,
    push: { wet: pushWet, body: bassBody, sub: subPush },
    limiter: chain.limiter,
    trim: chain.trim,
    width,
    keepAlive,
    beat: beatSeconds,
    buses: {
      kick: bus(kickBus),
      sub: bus(subBus),
      drums: bus(drums),
      melodic: bus(melodic),
      keys: bus(keysIn),
    },
    level: (name) => dbToGain(PARAMS.levels[name] ?? -12),
  };
}

// One duck ramp per kick. MEASURED: 6-9 dB down, a ~5 ms attack, the minimum
// 65 ms after the kick, and full recovery by the end of the beat.
export function scheduleDuck(graph, time) {
  const P = PARAMS.sidechain;
  const low = Math.pow(10, (P.lowDepthDb ?? P.depthDb) / 20);
  for (const node of [graph.duck, graph.duckLow]) {
    const depth = node === graph.duckLow ? low : Math.pow(10, P.depthDb / 20);
    const g = node.gain;
    g.setValueAtTime(1, Math.max(0, time - 0.001));
    g.linearRampToValueAtTime(depth * 1.12, time + P.attack);
    g.linearRampToValueAtTime(depth, time + P.minimumAt);
    // Two legs on the way back: most of the recovery happens in the first half
    // of the beat, which is what puts the envelope's minimum where the
    // reference sets have it instead of halfway to the next kick.
    g.linearRampToValueAtTime(depth + (1 - depth) * 0.6, time + graph.beat * 0.45);
    g.linearRampToValueAtTime(1, time + graph.beat * P.recoverBy);
  }
}

// MEASURED: when the kick leaves, the pad and midrange get about 1.4 dB
// louder, not quieter. This rides the melodic bus through the arrangement.
export function scheduleMelodicGain(graph, points, from = 0) {
  applyCurve(graph.melodic.gain, points, from, false);
}

// Apply a curve to an AudioParam from `from` onwards, starting at whatever
// value the curve had reached at that instant. This is what lets a seek land
// mid-breakdown with the filter already closed instead of snapping open.
function applyCurve(param, points, from, exponential) {
  if (!points || !points.length) return;
  const pts = points.slice().sort((a, b) => a.t - b.t);
  let start = pts[0].value;
  let i = 0;
  while (i < pts.length && pts[i].t <= from) {
    start = pts[i].value;
    i++;
  }
  // Interpolate into the segment we have landed inside.
  if (i > 0 && i < pts.length) {
    const a = pts[i - 1];
    const b = pts[i];
    const span = b.t - a.t;
    if (span > 0) {
      const k = (from - a.t) / span;
      start = exponential
        ? a.value * Math.pow(Math.max(1e-6, b.value / a.value), k)
        : a.value + (b.value - a.value) * k;
    }
  }
  param.cancelScheduledValues(0);
  param.setValueAtTime(start, Math.max(0, from));
  for (; i < pts.length; i++) {
    const t = Math.max(from + 0.001, pts[i].t);
    if (exponential) param.exponentialRampToValueAtTime(Math.max(60, pts[i].value), t);
    else param.linearRampToValueAtTime(pts[i].value, t);
  }
}

// Apply the arrangement's macro filter curve.
export function scheduleMacro(graph, points, from = 0) {
  applyCurve(graph.macro.frequency, points, from, true);
}

// Apply the push curve: the parallel saturation, the body peak and the sub
// level all move together, because they are one gesture and not three knobs.
export function schedulePush(graph, points, from = 0) {
  if (!graph.push || !points || !points.length) return;
  const K = PARAMS.push;
  const body = PARAMS.bass.bodyDb;
  applyCurve(graph.push.wet.gain, points.map((p) => ({ t: p.t, value: p.value * K.satAmount })), from, false);
  applyCurve(graph.push.body.gain, points.map((p) => ({ t: p.t, value: body + p.value * K.bodyDb })), from, false);
  applyCurve(
    graph.push.sub.gain,
    points.map((p) => ({ t: p.t, value: Math.pow(10, (p.value * K.subDb) / 20) })),
    from,
    false
  );
}
