// The instruments, as they are built.
//
// This file was the whole table — every tunable the machine has, the genre's
// and the engine's together — until round F of PLAN-V1-NEXT split it in two.
// What is left here is the half that describes an **instrument**: the kick's
// envelope, the hats' ladder, the clap, the bass, the level each voice is
// trimmed to, and the three harmonic patches (the ensemble, the keyboards, the
// piano) with the timbre lists that say which of them a theme may ask for.
// They are the numbers a voice module reads about itself, and a second style
// mined tomorrow would play the same instruments.
//
// The other half — tempo, key, register, space, the sends, the push, the
// sidechain, the master curve, the density and groove and harmony tables, the
// arrangement, the loudness model's coefficients — is *deep house* and not the
// machine, and it lives in `packages/deep-house/src/styles/deep-house.ts` with
// the same comments it always had. That file composes the two into the table a room is resolved
// against, in the order this file has always written it, so the settings value
// every voice is handed is the value it was handed before.
//
// Values tagged MEASURED come from an analysis of three reference DJ sets
// of the genre. Values tagged GENRE are what the measurement could
// not see — masked tails, octave placement, send amounts — and stay as
// defaults. Where the two disagree, both are written down.

export const INSTRUMENTS = {
  kick: {
    // MEASURED: a click in the mid-50s Hz falling into the mid-40s by 40 ms
    // and settling there. Both benchmarks agree on the landing, not the start.
    startHz: 56,
    endHz: 46,
    pitchTime: 0.045,
    // The amplitude envelope, given as the three times the benchmark states:
    // -6 dB, -20 dB, and the end of anything audible.
    t6: 0.058,
    t20: 0.125,
    t34: 0.17,
    // A phone reproduces nothing under 300 Hz, so through one the kick is its
    // click and nothing else. At 0.1 the hats were 4 dB louder than the kick
    // on a phone; the click is what puts the beat back on a small speaker.
    clickLevel: 0.0,
    // Onsets, not steps. Linear from true zero rather than exponential from a
    // ten-thousandth: the old curve crossed its last 60 dB inside a tenth of a
    // millisecond, which is a step. The click keeps its old 1.2 ms timing so
    // its band keeps its old energy; only the shape of the ramp changed.
    attack: 0.004,
    clickAttack: 0.0012,
    clickHp: 200, // the click is the kick's only midrange; it starts low enough to be one
    clickLp: 1200, // nothing on the kick above a couple of kHz
    // MEASURED against the three sets' long-term spectrum: 120-250 Hz was
    // 10 dB under them. The kick body stopped at 180-220 Hz and every
    // harmonic voice was high-passed at 130-150, so that octave belonged to
    // nothing. The body reaches up now — level, not drive, because drive is
    // what put grit over the sub.
    // MEASURED against both benchmark kick slots: almost all of a deep house
    // kick is 40-63 Hz and there is very little above 100. At 300 Hz this
    // body carried 12-16 dB too much between 63 and 250 — a rock drum, in
    // Eugene's words. The lid comes down to where the measurement puts it.
    bodyLp: 140,
    // The 100-250 Hz the deferred round wanted, and where a phone hears a kick.
    // Weight for a small speaker, not presence: modest, and it decays with
    // the hit rather than sitting on top of it.
    partialHz: 115,
    partialLevel: 0.09,
    partialDecay: 0.05,
    // Saturation on the kick is saturation *under the bass*: its products land
    // in 120 Hz - 2 kHz, locked to the beat, which is what a listener means by
    // "midrange noise that takes too much attention". Measured: 0.18 puts
    // 4.8 dB more into 120-250 Hz and 4.1 dB more into 150 Hz - 2 kHz than
    // 0.06 does. A little weight, not a tom, and not a fuzzbox.
    drive: 0.07,
  },

  hats: {
    base: 640, // fundamental of the inharmonic ladder
    metalClosed: 0.55, // how much of the hat is oscillators rather than noise
    metalOpen: 0.5,
    // MEASURED as the time to fall 10 dB: 85 ms in one benchmark, 21 in the
    // other — loose and washy against short and dry. A preset picks.
    lidHz: 8500, // a lid on every hat: darker than a synth wants to be
    closedT10: 0.04,
    openT10: 0.18,
    shakerT10: 0.05,
    // MEASURED: neither benchmark has a distinct open hat at all.
    openHats: false,
    // One trim over the whole family, applied inside the voice, so it reaches
    // a preset that sets its own `levels.hatClosed` and `levels.shaker` —
    // which every measured preset does, and which is why a change to the level
    // table alone did nothing to the minute Eugene was listening to.
    // MEASURED against the three sets: at 4-8 kHz the render sits within a
    // decibel of them, so the hats were never hot in absolute terms; they were
    // the only thing above 1.2 kHz. The mid lift below is most of the fix and
    // this is the rest of it.
    trimDb: -0.8,
    // ...and the energy the *theme* asks for, on top of that trim. Eugene, on
    // master seed 15576 theme 2 — preset `sub`, density minimal, a composition
    // he marked "amazing": "hi hats are too intense given minimal density of
    // the current track ... for that track hi hats should be thinner, just to
    // support the rhythm."
    //
    // MEASURED on that seed, four themes, eight bars of the main groove each,
    // third-octave against the three sets' curve. The hats do not move at all
    // between them — 4-10 kHz reads -33.5, -33.3 and -33.5 dB in the three
    // `sub` themes whatever the density die rolled — while what is *under*
    // them does:
    //
    //   theme  room   density   630 Hz-1.6 kHz vs the sets
    //   1      sub    minimal   -14.6 to -20.6 dB
    //   2      sub    medium     -2.3 to -11.0
    //   3      sub    busy       -8.0 to -11.7
    //   0      growl  minimal    -0.3 to  +1.8
    //
    // So "too intense" is not a hat level, it is a hat level chosen without
    // looking at the room it is playing in. Two numbers off the plan decide
    // it, both fixed for the whole theme the way a preset's own levels are:
    // how empty the room is (how far the preset's own `keys` and `pad` levels
    // fall short of the base table) and what the density die rolled. A busy
    // die takes nothing off at all, so the dense case keeps the curve the
    // balance round measured.
    energy: {
      byDensity: { minimal: 1.0, medium: 0.45, busy: 0 },
      emptyRoomMaxDb: 3.0, // the most an empty room may take off
      thinFloorDb: 1.0, // and what a minimal die takes off in a full one
      // The level is the decision; the lid and the open hat's ring only follow
      // it, because a hat played softer is a hat struck softer and a softer
      // strike is duller and shorter. Nothing per hit and nothing per section.
      lidPerDb: 0.02,
      ringPerDb: 0.05,
    },
    // Per-hit variation, all of it in the voice and none of it in the plan:
    // the same hat at the same time, sounding a little different each strike.
    // Hats are pre-rendered buffers, so the variation is a choice among a few
    // renders plus a gain and a playback rate, and the node count per hit does
    // not move.
    variants: 2, // pre-rendered tone variants per hat, chosen per hit
    variantCents: 30, // how far apart the variants' bands sit, in cents
    rateSpread: 0.035, // +-, on the buffer's playback rate
    velBright: 0.35, // how much of a velocity move reaches the band
    gainSpread: 0.09, // +-, on the hit's own level: about three quarters of a dB
    decaySpread: 0.12, // +-, on the hit's own t10
    driftSeconds: 55, // the open hat's decay drifts over about twenty-four bars
    driftAmount: 0.16, // +-, on the open hat's t10
  },

  clap: {
    on: true,
    t20: 0.036, // MEASURED: -20 dB in 36 ms
    // A clap opens in a few milliseconds, not in one. Under 3 ms the ear
    // stops hearing an attack and starts hearing an edge.
    attack: 0.004,
    lidHz: 9500,
  },

  bass: {
    // The fundamental is the sound. Overtones are warmth, not pitch: an
    // octave layer loud enough to be heard makes the ear pitch the line an
    // octave up, which is what turns a bass riff into a synth.
    // MEASURED: inter-kick bass energy is 0.46 of the kick slot, about -7 dB,
    // so the sub sits at -6 against a kick at -3.
    // Clean by default. Eugene, listening: "the bass is still a bit clipping,
    // too mushy and kind of distorted... for the song generally it should not
    // overflow as it is now." So the shaper is warmth and nothing else — the
    // 2nd harmonic sits about 18 dB under the fundamental rather than 12 — and
    // the grit that used to be permanent is now the `push` macro below, which
    // the arrangement turns up for a few bars at a time and then puts away.
    // The drive is on the *body* layer only — the fundamental never reaches a
    // waveshaper — so this is how hard a quiet triangle and octave are pushed,
    // not how hard the bass is.
    drive: 0.3,
    cutoff: 360, // warmth, not brightness
    triangle: 0.035,
    octave: 0.04,
    // Asymmetry: this is where the 2nd harmonic comes from, and at a 45 Hz
    // fundamental the 2nd harmonic lands at 90 Hz — which is most of the
    // "meat" a listener means. A study of five chains found this and the body
    // peak did the work; compression barely moved the numbers.
    even: 0.12,
    // Body: the 80-160 Hz that makes a note something you can hum. The two
    // benchmark minutes sit at -11.0 and -8.4 dB in that band.
    bodyHz: 115,
    // Was +9 dB, which is a bass you can hum and also a bass that overflows.
    // +3 dB is a note with a body; the push macro lends it the rest when the
    // arrangement wants the moment exaggerated.
    bodyDb: 3.0,
    bodyQ: 0.65,
    // A real compressor on the bass, working 3-4 dB, with an attack slow
    // enough to let the front of each note through and a release tied to the
    // beat. It is density, not the source of the body.
    comp: { threshold: -20, knee: 8, ratio: 2.2, attack: 0.018, release: 0.12 },
    // A low key and a low root stack the kick body and the bass in the same
    // octave. Rather than pulling the bass down everywhere, notes below the
    // reference give a little back, per octave — so a track in a low key is as
    // loud as one in a high key instead of louder.
    tiltRefHz: 48,
    lowTiltDb: 5.0,
    hpHz: 28, // below this a speaker makes heat, not sound
    hpQ: 0.7,
    attack: 0.008, // 5-10 ms
    // A note, not a tone. Eugene: "it sounds like a 60 Hz buzz, like somebody
    // didn't plug an electric guitar into the jack all the way." A bass held
    // at one level with a fixed set of harmonics *is* mains hum; what makes it
    // a note is that it falls a little after it starts, and that its colour is
    // in the attack rather than underneath the whole thing.
    decay: 0.22,
    sustain: 0.6, // -4.4 dB into the sustain, so a pitch change is an event
    bodyDecay: 0.1, // the triangle and the octave are mostly a transient
    // ...but not entirely: a small floor is left behind so a phone speaker,
    // which cannot reproduce 46 Hz at all, still hears the note. Kept low
    // enough that the 2nd harmonic sits 20-24 dB under the fundamental and
    // the 3rd stays under -34, which is a note with a body and not a buzz.
    bodyFloor: 0.42,
    glide: 0.03, // legato: every pitch change inside the held line slides
    // A short lowpass lift on each new note, so a change speaks without the
    // line getting brighter.
    openMult: 2.4,
    openTime: 0.08,
  },

  // The plucked mid bass (src/voices/pluck-bass.ts), an octave over the sub.
  //
  // **These are not measurements.** Every other block in this file carries
  // numbers taken off the reference sets or off a benchmark minute, and this
  // one carries numbers chosen to make a plucked bass: the instrument is an
  // audition (round G of PLAN-V1-NEXT), no die can draw it and no record
  // contains it, so there is nothing yet to have measured it against. The one
  // number of it that *is* measured is the timbre's `loudnessDb`, and that is
  // written by the gate that measures it, in the voice's own module.
  //
  // The reasoning behind each, since it is not a measurement:
  pluckBass: {
    // A pluck is its attack. Three milliseconds up, most of the note gone in
    // a third of a second, and a low sustain to hold the tail of a long one:
    // the keys' own `pluck` preset is the nearest thing in the catalogue and
    // it sits at 0.048 — this is a bass and is allowed to stay a little longer
    // under a chord.
    attack: 0.003,
    decay: 0.3,
    sustain: 0.18,
    release: 0.08,
    // The body filter's corner, and how far over it the note starts. Mid bass:
    // the fundamental of the register it plays is 90-200 Hz, so a corner at
    // 900 Hz is four or five harmonics of it — which is the 500 Hz - 2 kHz
    // this voice exists to put something into. `openCeiling` keeps the start
    // of the sweep out of the hats' octave however high the corner is pushed.
    cutoff: 900,
    openMult: 3.6,
    openCeiling: 5200,
    openTime: 0.07,
    q: 0.9,
    // The body, under the note: a saw at this level and a square under it,
    // detuned either way, saturated together. `bass.ts`'s lesson an octave up
    // — the fundamental is a sine and never reaches a shaper — with a little
    // more drive than the sub gets, because a saw driven is colour where a
    // sine driven is fuzz.
    body: 0.34,
    square: 0.4,
    detuneCents: 7,
    drive: 0.35,
    even: 0.1,
    // **Not oversampled, and that is a measurement and not a default.** Every
    // other shaper in this engine asks for 2x or 4x, which is the right answer
    // for a stage whose input is broadband; here the shaped signal is a saw and
    // a square under 200 Hz going straight into a 900 Hz lowpass, so there is
    // very little to alias — and MEASURED, an oversampled shaper is the one
    // thing in this voice the two engines do not agree about. The same eight
    // bars, metered at the bus: at `2x` Chromium reads -21.87 LUFS and Firefox
    // -18.03, at `4x` -19.61 and -18.03, and at `none` **-17.97 and -17.95**.
    // Four decibels between two engines is not a timbre, it is two
    // implementations of an up-sampler, and a voice whose declared loudness has
    // to hold to a decibel in both cannot be built on one.
    oversample: 'none' as OverSampleType,
    // What the voice is worth at a gain of one.
    //
    // MEASURED: without this it peaks at 2.37x the peak its own envelope was
    // given, because the note, the body and the pick all land on the same
    // instant and the body filter is at its most open there. Every other voice
    // in this engine peaks at about the gain it is handed, and a level table is
    // only a level table if they all do — at -10.5 dB this one was playing
    // seven and a half decibels over everything else at the same level. The
    // trim is the reciprocal of that measurement and nothing else.
    trim: 0.42,
    // The pick: high-passed noise, gone in eight milliseconds, band-passed
    // where a plucked string's attack lives. `pickTilt` is the one-pole corner
    // the noise is tilted about; the buffer holds the burst already shaped.
    pickLevel: 0.16,
    pickDecay: 0.008,
    pickTilt: 0.45,
    pickHz: 2200,
    pickQ: 1.1,
    // The bottom belongs to the sub. This voice starts where that one stops
    // carrying the fundamental.
    hpHz: 70,
  },

  // --- the six above middle C (round K2 of PLAN-KITCHEN) ---------------------
  //
  // Six audition instruments, and the reason they exist is a measurement: the
  // record is a kick, a sub and a wash, and 500 Hz - 2 kHz is where it has been
  // measuring short of the reference sets. Round G answered that from below
  // with a plucked mid bass; these answer it from above, and they are the first
  // instruments in this engine written for the register a melody is played in.
  //
  // Every one of them is oscillators, noise and DSP; not one of them plays a
  // sample. **None of them is named by any candidate list of any style**, so no
  // die can draw one and no seed moves — the same dormancy round G proved and
  // `packages/deep-house/tools/check.ts` holds. Their levels are `keys` and
  // `pad`, which the table already has: a level of its own is a key in the
  // program digest and therefore a re-bless (round G's first finding).
  //
  // `loudnessDb` is not here. It belongs to the voice's own module, beside the
  // sound it describes, and it is written there by the gate under `--bless` and
  // never typed.

  // A saw lead: the plainest thing in the set and the one a melody is most
  // likely to be played on. Two saws a fifth of a semitone apart, combed by a
  // delay whose time wanders — which is what a pulse width is, since a saw less
  // the same saw a moment later *is* a pulse of that width — and a resonant
  // lowpass that falls onto its corner over the first fifth of a second.
  sawLead: {
    attack: 0.006,
    decay: 0.22,
    sustain: 0.55,
    release: 0.12,
    // The pair. Twelve cents is about a fifth of a semitone: wide enough to
    // beat at a couple of Hertz in this register and narrow enough that the
    // line still has one pitch.
    detuneCents: 12,
    // The width, as a pulse: the comb's delay is this fraction of the note's
    // own period, so the notch tracks the pitch instead of sitting at a fixed
    // frequency and turning into a formant. It wanders at `pwmHz` by
    // `pwmDepth` of itself, which is the movement a PWM lead has.
    pwmWidth: 0.42,
    pwmDepth: 0.3,
    pwmHz: 0.17,
    pwmMix: 0.85,
    // The filter, and the pluck in it. A lead's envelope is most of its
    // character: it starts `envMult` over the corner and falls onto it over
    // `envTime`, and velocity opens the corner itself.
    cutoff: 1500,
    envMult: 3.4,
    envTime: 0.18,
    q: 6.5,
    veloOpen: 0.55,
    hpHz: 130,
    spread: 0.5,
    trim: 0.5,
  },

  // A two-operator FM bell: one sine modulating another, at a ratio that is
  // not a whole number, which is what makes a struck bar inharmonic and a
  // sawtooth not. The index is velocity's — a bell hit harder is brighter and
  // not just louder — and it falls away inside a second, so the clang is the
  // attack and the tail is nearly a sine. The tail is the point of the voice:
  // nothing else in this engine rings for two seconds after a note.
  fmBell: {
    // The ratio table. A ratio near a small integer sounds like an organ pipe;
    // these four are the ones that ring. `tone` is what a note asks for by
    // name, and the declared loudness is measured on the default.
    ratios: { bell: 3.51, glass: 2.76, tube: 1.41, metal: 5.06 },
    tone: 'bell',
    attack: 0.004,
    decay: 1.5,
    sustain: 0.07,
    release: 0.9,
    // The index, in units of the carrier's own frequency: how far the
    // modulator throws it. The first number is what a note at no velocity
    // gets and the second is what velocity adds.
    index: [0.9, 2.6],
    indexDecay: 0.55,
    indexFloor: 0.04,
    detuneCents: 4,
    spread: 0.55,
    lpHz: 6200,
    hpHz: 170,
    trim: 1.0,
  },

  // A Karplus-Strong string: six milliseconds of noise into a delay line a
  // period long with a lowpass in the loop, which is the oldest cheap string
  // there is and still the most convincing one.
  //
  // **It is computed into a buffer and not built out of nodes, and that is a
  // measurement about this engine rather than a preference.** A cycle through a
  // DelayNode is quantised to a render quantum — 128 samples, 2.9 ms at
  // 44.1 kHz — so a feedback delay cannot be shorter than that, and a string
  // tuned by one cannot play above about 345 Hz. This instrument exists for the
  // octaves *above* middle C, so the loop is arithmetic: a few thousand
  // multiplies per pitch, done once and cached per context the way the pick and
  // the piano's strings are.
  karplusPluck: {
    // The excitation: white noise, high-passed by the loop itself, this long.
    burst: 0.006,
    // The loop filter, as the weight on the newer of its two taps. 0.5 is the
    // classic averager; nearer 1 is brighter and rings longer. Velocity moves
    // it, which is a string plucked harder near the bridge.
    damp: 0.56,
    dampVel: 0.13,
    // How long the string takes to fall 60 dB, and how much of that is worth
    // keeping in a buffer. A note's own envelope cuts it; this is the ceiling.
    decay: 1.9,
    maxSeconds: 1.7,
    // What the *ring* is normalised to, and how far over it the pluck is
    // allowed to stand. See the note at the head of the module: normalising a
    // plucked string on its own attack transient put it seventeen decibels
    // under every other instrument at the same level.
    ringLevel: 0.3,
    peakCeiling: 3.2,
    // The pair: the same string played twice, a few cents apart and to opposite
    // sides. It is one buffer at two playback rates, so the width costs a
    // multiply rather than a second string.
    detuneCents: 5,
    spread: 0.7,
    attack: 0.0015,
    release: 0.09,
    // The body, outside the loop: velocity opens this and the string's own
    // damping stays where it is, so a hard note is brighter without the cache
    // needing a second copy of every pitch.
    cutoff: 3200,
    veloOpen: 0.7,
    hpHz: 160,
    // How many strings one context keeps. A buffer is a second and a
    // half of one channel — about 300 kB at 48 kHz — and a theme plays a
    // couple of octaves, so this is the ceiling and not the usual cost.
    cacheLimit: 48,
    trim: 1.4,
  },

  // A formant pad: a breathy, vocal-ish sustained voice. Two saws and a little
  // noise through three parallel bandpasses parked where a vowel's formants
  // are, and the vowel drifts from one to another and back over about twenty
  // seconds. It is the sustained role for music that is not made of chords on
  // a keyboard, and it holds as well as it plays a note.
  formantPad: {
    // Two vowels and the slow walk between them. The three numbers are the
    // formant centres in Hz; the pad sits between `vowel` and `vowelTo` and
    // wanders across at `driftHz`.
    vowels: {
      ah: [720, 1240, 2540],
      oh: [460, 820, 2620],
      ee: [320, 2200, 2960],
      uh: [500, 1480, 2480],
    },
    vowel: 'ah',
    vowelTo: 'oh',
    driftHz: 0.045,
    // The three bandpasses: how sharp each is and how loud. The first formant
    // carries the body and the third is the breath on top of it.
    q: [6.5, 8.5, 11],
    formantLevel: [1, 0.5, 0.26],
    // What goes into them: two saws a few cents apart, and the breath.
    detuneCents: 9,
    noise: 0.16,
    voiceLevel: 1.2,
    attack: 0.85,
    decay: 1.4,
    sustain: 0.74,
    release: 0.8,
    hpHz: 120,
    lpHz: 4600,
    spread: 0.75,
    trim: 0.8,
  },

  // A clavinet-ish key: a narrow pulse, a comb tuned to the note, a bright
  // resonant lowpass and an envelope that is nearly all attack. It is the
  // figure and the stab voice of the set — the one that plays sixteenths
  // without filling the octave a vocal would sit in.
  //
  // The comb is **feed-forward** — the note plus a copy of itself half a period
  // later — for the same reason the string above is arithmetic: a feedback comb
  // through a DelayNode cannot be shorter than a render quantum, and half a
  // period at 500 Hz is one millisecond. A feed-forward comb has the notches
  // and not the ring, which on a plucked key is what is wanted anyway.
  clavKey: {
    attack: 0.002,
    decay: 0.15,
    sustain: 0.1,
    release: 0.09,
    // The pulse, as a fraction of the note's own period. A clavinet is narrow:
    // a quarter of a cycle is most of where its rasp comes from.
    pwmWidth: 0.26,
    pwmDepth: 0.05,
    pwmHz: 0.8,
    pwmMix: 0.9,
    // The comb, as a fraction of the period, and how much of it is mixed in.
    combRatio: 0.5,
    combMix: 0.42,
    // The pickup, driven. MEASURED per engine under `--ab` (round K2): the
    // shaped signal here is a narrow pulse already full of harmonics going
    // into a 3.6 kHz lowpass, and the two engines agree at every setting, so
    // the cheapest one is the one that is declared. See notes/archive/2026-09-kitchen/rounds/k2.md.
    drive: 0.22,
    oversample: 'none' as OverSampleType,
    // The resonance: one peaking bell where a clavinet's body speaks.
    peakHz: 2300,
    peakDb: 5,
    peakQ: 2.2,
    cutoff: 3400,
    envMult: 2.2,
    envTime: 0.045,
    q: 3,
    veloOpen: 0.8,
    hpHz: 210,
    spread: 0.35,
    trim: 1.0,
  },

  // A supersaw pad: seven saws spread across a fifth of a semitone and across
  // the stereo picture, under a lowpass that opens over the first seconds of
  // the note. It is the widest and the most expensive voice in the engine, and
  // it is the sustained role's second family: `strings` is an ensemble of five
  // with a chorus on it, this is one instrument with seven oscillators in it.
  supersawPad: {
    voices: 7,
    // The spread of the stack, end to end. A supersaw's whole character is
    // that the detune is *even* across the voices and wide enough that the
    // beats are a texture rather than a wobble.
    detuneCents: 22,
    voiceLevel: 0.42,
    spread: 0.95,
    // The slow sweep. It opens from `cutoff` to `sweepTo` over `sweepTime`,
    // which is seconds and not milliseconds: on a pad this is the arrangement
    // and not the attack.
    cutoff: 850,
    sweepTo: 2500,
    sweepTime: 4.5,
    q: 1.1,
    attack: 0.7,
    decay: 1.6,
    sustain: 0.7,
    release: 1.1,
    hpHz: 110,
    // The stack drifts: the outer voices wander a few cents at a fourteenth of
    // a Hertz, so the width breathes instead of standing still.
    driftHz: 0.07,
    driftCents: 6,
    trim: 0.6,
  },

  // --- the rest of the voices (round K4 of PLAN-KITCHEN) ---------------------
  //
  // Sixteen more instruments that no die can draw, and every one of them on a
  // level the table already has. The numbers below are the ones that decide
  // what each *is*; every declared loudness beside them, in the modules, is
  // written by `tools/test-voices-2.ts --bless` and never typed.

  // A narrow pulse, which is the same comb trick as the saw lead at a very
  // different setting: `pwmWidth` is the pulse's duty, and 0.16 is nasal where
  // the saw lead's 0.42 is hollow.
  pulseLead: {
    attack: 0.004,
    decay: 0.16,
    sustain: 0.5,
    release: 0.1,
    detuneCents: 9,
    pwmWidth: 0.16,
    pwmDepth: 0.55,
    pwmHz: 0.31,
    pwmMix: 0.9,
    cutoff: 2100,
    envMult: 4.2,
    envTime: 0.1,
    q: 7.5,
    veloOpen: 0.7,
    hpHz: 150,
    // The octave below, as a plain square. A narrow pulse has almost nothing at
    // its own fundamental — the duty sets the first null — so without this the
    // instrument has no bottom at all.
    subLevel: 0.22,
    spread: 0.45,
    trim: 0.592,
  },

  // A triangle: odd harmonics at 1/n squared, so the fifth is 28 dB down where
  // a square's is 14. The fold is what puts them back when a note is hit hard.
  triLead: {
    attack: 0.012,
    decay: 0.3,
    sustain: 0.7,
    release: 0.18,
    detuneCents: 6,
    cutoff: 2600,
    q: 1.4,
    veloOpen: 0.5,
    // How hard a full-velocity note is driven into the folder. Under 1 the
    // curve is a straight line and a quiet note is a plain triangle.
    fold: 1.6,
    // The vibrato arrives rather than starting: nothing for `vibDelay`, then a
    // ramp into it over `vibRise`.
    vibHz: 5.2,
    vibCents: 9,
    vibDelay: 0.18,
    vibRise: 0.25,
    spread: 0.35,
    trim: 0.911,
  },

  // A soft square sub: the odd harmonics at 1/n with the corners taken off by a
  // lid four harmonics up, plus a sine at the fundamental because a square's
  // own is only 4/pi of its peak.
  subSoft: {
    attack: 0.008,
    release: 0.05,
    squareLevel: 0.5,
    sineLevel: 0.55,
    // The lid, in harmonics and not in hertz: what makes a bottom a bottom is
    // how many harmonics it has and not where they are.
    harmonics: 4,
    veloOpen: 0.5,
    q: 0.8,
    trim: 0.167,
  },

  // A triangle sub, with a sine an octave under it where there is room.
  subTri: {
    attack: 0.01,
    release: 0.06,
    triLevel: 0.85,
    // Under this the sub-octave is not built at all: an octave below 55 Hz is a
    // rumble nothing can reproduce and everything has to make room for.
    octaveAboveHz: 55,
    octaveLevel: 0.28,
    harmonics: 5,
    veloOpen: 0.4,
    q: 0.8,
    trim: 0.244,
  },

  // A second saw pad, and the supersaw's opposite: three voices and not seven,
  // an octave in the stack instead of a wider detune, and a filter that opens
  // and falls back rather than opening over four seconds.
  sawPad: {
    voiceLevel: 0.38,
    attack: 0.5,
    decay: 1.2,
    sustain: 0.75,
    release: 0.9,
    cutoff: 900,
    openTo: 3400,
    // The swell: up over `swellTime`, back down over `settleTime`. Seconds, not
    // milliseconds — on a pad whose note is four bars long this is the
    // arrangement and not the attack.
    swellTime: 0.45,
    settleTime: 2.2,
    q: 1.6,
    veloOpen: 0.6,
    hpHz: 100,
    driftHz: 0.09,
    driftCents: 5,
    spread: 0.8,
    trim: 1.098,
  },

  // Three operators: a second modulator on the first, which makes partials at
  // every sum and difference of two inharmonic series instead of one. The haze
  // is why the index has to fall faster than the bell's.
  fmGlass: {
    ratio: 4.27,
    ratio2: 1.71,
    index: [0.8, 2.6],
    index2: [0.4, 1.4],
    indexDecay: 0.34,
    index2Decay: 0.12,
    indexFloor: 0.02,
    attack: 0.003,
    decay: 1.1,
    sustain: 0.1,
    release: 0.7,
    lpHz: 9000,
    hpHz: 200,
    detuneCents: 5,
    spread: 0.45,
    trim: 1.006,
  },

  // The ratio back on a whole number, which is what makes a pitched electric
  // piano rather than a bell, plus a tine: a short, high, inharmonic second
  // pair that is the hammer on the metal.
  fmEp: {
    ratio: 1,
    index: [0.6, 2.2],
    indexDecay: 0.42,
    indexFloor: 0.05,
    attack: 0.003,
    decay: 0.9,
    sustain: 0.18,
    release: 0.45,
    tineRatio: 14,
    tineIndex: 1.1,
    tineLevel: 0.22,
    tineDecay: 0.03,
    lpHz: 7000,
    hpHz: 90,
    detuneCents: 4,
    spread: 0.35,
    trim: 1.063,
  },

  // The same two operators with everything gone inside a fifth of a second, at
  // a ratio far enough out that the attack is a click with a pitch in it.
  fmPluck: {
    ratio: 7,
    index: [0.5, 3.4],
    indexDecay: 0.05,
    indexFloor: 0.01,
    attack: 0.002,
    decay: 0.2,
    sustain: 0.02,
    release: 0.12,
    lpHz: 8500,
    hpHz: 220,
    detuneCents: 6,
    spread: 0.55,
    trim: 1.846,
  },

  // Marimba: wooden bars, whose second partial the maker tunes down to exactly
  // 4 by carving an arch out of the underside. `[ratio, decay, level]`.
  marimba: {
    partials: [[1, 0.9, 1], [4, 0.12, 0.34], [9.2, 0.06, 0.14]],
    attack: 0.002,
    release: 0.08,
    // The resonator under the bar: it holds the fundamental and nothing else.
    ringLevel: 0.55,
    // A hard mallet head, as a band of noise four milliseconds long.
    malletHz: 2100,
    malletLevel: 0.5,
    malletTime: 0.004,
    spread: 0.4,
    trim: 0.746,
  },

  // Vibes: metal bars, so the partials are left where a free bar puts them —
  // 1, 2.76, 5.40 — and the decay is six times as long. The tremolo is on the
  // *resonator* and not on the note, which is what the rotating discs do.
  vibes: {
    partials: [[1, 5.5, 1], [2.76, 1.6, 0.3], [5.4, 0.7, 0.12]],
    attack: 0.003,
    release: 0.3,
    ringLevel: 0.6,
    tremoloHz: 4.4,
    tremoloDepth: 0.75,
    malletHz: 1200,
    malletLevel: 0.3,
    malletTime: 0.006,
    spread: 0.5,
    trim: 0.3,
  },

  // A bright piano register: six stiff partials rather than twenty rendered
  // ones, with the inharmonicity that tells a piano from an organ.
  brightPiano: {
    partials: 6,
    // A real string is stiff, so its nth partial is at n*f*sqrt(1 + B*n^2). B
    // is about 0.0004 in the middle of a piano and rises towards the top.
    inharmonicity: 0.0009,
    attack: 0.003,
    decay: 1.1,
    // How much faster each partial dies than the one below it. The ratio *is*
    // the decay of a piano.
    partialDecay: 0.62,
    tilt: 0.62,
    // What velocity adds to the partials from the fourth up: a piano hit harder
    // is brighter and not merely louder.
    upper: 0.1,
    release: 0.25,
    lpHz: 7000,
    veloOpen: 0.5,
    hammerHz: 3400,
    hammerLevel: 0.28,
    hammerTime: 0.004,
    spread: 0.3,
    trim: 1.208,
  },

  // A reed organ: a sawtooth through a fixed resonance, which is what a metal
  // tongue is, where the catalogue's organ is drawbars, which is a pipe.
  reedOrgan: {
    attack: 0.045,
    decay: 0.25,
    sustain: 0.85,
    release: 0.14,
    beatCents: 7,
    // The reed's own body: fixed in hertz, because a metal tongue's resonance
    // does not move with the note. It is what makes the bottom dark and the top
    // nasal. A peaking filter's Q is a real Q.
    formantHz: 1150,
    formantQ: 1.1,
    formantDb: 7,
    lpHz: 4200,
    hpHz: 120,
    // The bellows: somebody's arm, on the level and not on the pitch.
    bellowsHz: 0.9,
    bellowsDepth: 0.06,
    breathLevel: 0.12,
    breathTime: 0.05,
    spread: 0.4,
    trim: 0.724,
  },

  // The air of a room and the surface of a record: the cheapest voice in the
  // engine, and the one whose job is to be inaudible until it stops.
  vinylBed: {
    attack: 0.6,
    release: 0.8,
    hpHz: 240,
    lpHz: 5200,
    q: 0.7,
    driftHz: 0.06,
    driftDepth: 0.25,
    trim: 0.363,
  },

  // The second riser, and it rises in **brightness** where `fx.ts`'s rises in
  // pitch. The floor climbs behind the lid, which is what makes room for a drop.
  sweepUp: {
    release: 0.12,
    fromHz: 700,
    toHz: 11000,
    hpHz: 300,
    hpToHz: 2600,
    lpHz: 12000,
    q: 1.4,
    trim: 0.453,
  },

  // A cloud of grains read out of one cached buffer. The source is rendered
  // once per context; a grain is a buffer source, a window, a lid and a panner.
  grainPad: {
    // The source: a second of a rich, slightly stretched harmonic series.
    sourceSeconds: 1,
    sourceHz: 110,
    sourcePartials: 24,
    // How far the partials are pushed off whole multiples, so that two grains
    // from two places never line up.
    sourceStretch: 0.0022,
    sourceTilt: 0.85,
    // The cloud: one grain every `every` seconds, each `grainSeconds` long,
    // with a jitter on the time, the rate, the level, the pan and the lid.
    every: 0.035,
    grainSeconds: 0.09,
    grainLevel: 0.34,
    timeSpread: 0.8,
    rateSpread: 0.012,
    tiltHz: 3000,
    spread: 0.85,
    // How fast the read head walks through the source: a grain is a place in
    // one sound and not a sound of its own.
    scanRate: 0.35,
    chord: [0, 7, 12, 3, 19],
    attack: 0.7,
    release: 1.1,
    // How far ahead a held cloud lays grains down. Offline there is a whole
    // timeline to fill; live there is not.
    horizon: 24,
    trim: 3.02,
  },

  // Two spectra and a crossfade between them, which is the linear interpolation
  // a wavetable synthesiser actually computes.
  wavePad: {
    partials: 20,
    // The first frame: odd harmonics at 1/n with the third and fifth pulled
    // down, which is a closed pipe and reads dark and woody.
    hollow: 0.35,
    // The second: every harmonic at 1/sqrt(n) with a hump five partials up,
    // which is what makes a spectrum read as a mouth rather than as a filter.
    humpAt: 5,
    humpWidth: 2.2,
    humpDb: 1.8,
    // `[octave, level, pan]`. The morph is between two *waves*, so the two
    // oscillators of a pair may not be detuned — that would be a flanger — and
    // the width is a second pair an octave up instead.
    layers: [[0, 0.5, -0.5], [1, 0.22, 0.6]],
    morphFrom: 0.05,
    morphTo: 0.85,
    morphTime: 6,
    attack: 0.6,
    decay: 1.4,
    sustain: 0.8,
    release: 1.2,
    cutoff: 2400,
    q: 0.9,
    veloOpen: 0.5,
    driftHz: 0.05,
    driftDepth: 0.18,
    spread: 0.7,
    trim: 0.959,
  },

  // --- the drum kitchen (round K3 of PLAN-KITCHEN) ---------------------------
  //
  // Sixteen instruments that no die can draw. Every one of them is built the
  // same way — `src/voices/drumkit.ts` — so the knobs repeat: `seconds` is how
  // long the rendered body is and therefore the longest a hit can ring;
  // `variants` is how many tones are rendered and `variantCents` how far apart
  // they are; `t10` is the envelope's time to fall 10 dB, which is the unit the
  // benchmark states a hat's decay in; `trim` is the family trim, in the voice
  // and not in the level table, for the hats' reason — every measured room
  // writes its own levels and a change there would never reach the minute
  // somebody is listening to; `velBright` and `velDecay` are how much a harder
  // hit brightens and rings on; and the four `*Spread` numbers are the per-hit
  // dice, all of them off the strike time.

  // Congas: two tunings, two articulations, a head that falls four semitones
  // as the skin lets go. The second mode at 1.62 is near the first circular
  // membrane mode and far from 1.5, which is what keeps the two partials from
  // locking into a fifth.
  conga: {
    highHz: 258,
    lowHz: 182,
    mode: 1.62,
    modeLevel: 0.26,
    modeDecay: 0.28,
    drop: 1.26,
    dropTime: 0.045,
    bodyLevel: 0.6,
    bodyLp: 2600,
    // The hand. An open tone is nearly all head; a slap is nearly all hand,
    // brighter and gone in a twentieth of a second.
    slapHz: 2300,
    slapHzHard: 3400,
    slapQ: 1.7,
    slapDecay: 0.022,
    slapOpen: 0.3,
    slapHard: 1.35,
    slapBody: 0.72,
    t10Open: 0.16,
    t10Slap: 0.055,
    lowRing: 1.25,
    seconds: 0.95,
    variants: 3,
    variantCents: 14,
    attack: 0.002,
    trim: 0.92,
    rateSpread: 0.03,
    gainSpread: 0.07,
    decaySpread: 0.09,
    panSpread: 0.07,
    velBright: 0.12,
    velDecay: 0.25,
    pan: 0.14,
    room: 0.06,
  },

  // Bongos: the same builder, smaller heads. Higher, drier, a harder slap and
  // no room to speak of — a bongo in a mix is a click with a pitch.
  bongo: {
    highHz: 432,
    lowHz: 324,
    mode: 1.58,
    modeLevel: 0.3,
    modeDecay: 0.16,
    drop: 1.3,
    dropTime: 0.03,
    bodyLevel: 0.55,
    bodyLp: 3600,
    slapHz: 3100,
    slapHzHard: 4400,
    slapQ: 1.9,
    slapDecay: 0.016,
    slapOpen: 0.35,
    slapHard: 1.45,
    slapBody: 0.7,
    t10Open: 0.075,
    t10Slap: 0.035,
    lowRing: 1.2,
    seconds: 0.55,
    variants: 3,
    variantCents: 16,
    attack: 0.0018,
    trim: 1.05,
    rateSpread: 0.035,
    gainSpread: 0.08,
    decaySpread: 0.1,
    panSpread: 0.09,
    velBright: 0.14,
    velDecay: 0.22,
    pan: -0.18,
    room: 0.04,
  },

  // A snare: a tuned shell under wires that outlast it. The shell is a fifth —
  // 180 and 270 Hz — because two partials that far apart read as a note and
  // two an octave apart read as one partial twice.
  snare: {
    shellHz: 180,
    shellFifth: 1.5,
    shellLevel: 0.5,
    shellDecay: 0.1,
    drop: 1.12,
    dropTime: 0.02,
    // The wires. A snare with its bottom left in is a box, so the highpass is
    // not a nicety; the band is broad because a snare is broad.
    wireHp: 420,
    wireHz: 1900,
    wireQ: 0.8,
    wireLevel: 0.5,
    // ...and the stick, which is the loudest sample of the hit and therefore
    // the instrument with the largest declared click bound in the kitchen.
    crackHz: 4200,
    crackQ: 1.4,
    crackDecay: 0.012,
    crackLevel: 0.55,
    lidHz: 11000,
    t10: 0.07,
    seconds: 0.7,
    variants: 3,
    variantCents: 22,
    attack: 0.0022,
    trim: 1.4,
    rateSpread: 0.03,
    gainSpread: 0.08,
    decaySpread: 0.1,
    panSpread: 0.05,
    velBright: 0.18,
    velDecay: 0.3,
    pan: -0.05,
    room: 0.12,
  },

  // The rim, which is the same builder and a different instrument: nearly all
  // stick and a twentieth of the shell, so it reads as a click with a pitch.
  // A cross-stick is the quiet backbeat a house record uses where a snare
  // would be an announcement.
  rimshot: {
    shellHz: 420,
    shellFifth: 1.49,
    shellLevel: 0.35,
    shellDecay: 0.03,
    drop: 1.05,
    dropTime: 0.008,
    wireHp: 900,
    wireHz: 2600,
    wireQ: 1.6,
    wireLevel: 0.12,
    crackHz: 2400,
    crackQ: 3,
    crackDecay: 0.006,
    crackLevel: 0.8,
    lidHz: 9000,
    t10: 0.022,
    seconds: 0.3,
    variants: 3,
    variantCents: 26,
    attack: 0.0012,
    trim: 3.7,
    rateSpread: 0.035,
    gainSpread: 0.09,
    decaySpread: 0.12,
    panSpread: 0.06,
    velBright: 0.2,
    velDecay: 0.2,
    pan: -0.1,
    room: 0.08,
  },

  // Three more hats. The ladder is the record's own — nothing a whole-number
  // multiple of anything else — and what separates the three is the decay, the
  // lid and how much of the hat is metal rather than noise.
  hatTight: {
    ratios: [1, 1.5, 2.08, 2.72, 3.4, 4.11],
    base: 700,
    detune: 10,
    metal: 0.6,
    hp: 4600,
    peakHz: 8200,
    q: 0.3,
    tilt: 3,
    lidHz: 9500,
    t10: 0.02,
    seconds: 0.35,
    variants: 3,
    variantCents: 30,
    attack: 0.0015,
    trim: 1.22,
    rateSpread: 0.035,
    gainSpread: 0.09,
    decaySpread: 0.12,
    panSpread: 0.07,
    velBright: 0.35,
    velDecay: 0.2,
    pan: 0.1,
    room: 0,
    delay: 0,
  },

  // The loose one: five times the ring, the lid open, and the noise share up —
  // a hat left loose breathes, and most of what breathes is the noise
  // outlasting the metal.
  hatLoose: {
    ratios: [1, 1.5, 2.08, 2.72, 3.4, 4.11],
    base: 620,
    detune: 16,
    metal: 0.44,
    hp: 3200,
    peakHz: 6600,
    q: 0.28,
    tilt: 2,
    lidHz: 9000,
    t10: 0.2,
    seconds: 1.1,
    variants: 3,
    variantCents: 30,
    attack: 0.0025,
    trim: 1.13,
    rateSpread: 0.03,
    gainSpread: 0.08,
    decaySpread: 0.14,
    panSpread: 0.08,
    velBright: 0.3,
    velDecay: 0.35,
    pan: -0.12,
    room: 0.05,
    delay: 0.05,
  },

  // The metallic one, and the ladder is the instrument: six ratios packed
  // between 2 and 3.5, through a highpass above all of them, beat into a buzz
  // where the record's own spread ladder chimes.
  hatSizzle: {
    ratios: [2, 2.31, 2.63, 2.87, 3.16, 3.47],
    base: 1150,
    detune: 26,
    metal: 0.82,
    hp: 7000,
    peakHz: 9500,
    q: 0.25,
    tilt: 4,
    lidHz: 11000,
    t10: 0.06,
    seconds: 0.6,
    variants: 3,
    variantCents: 34,
    attack: 0.0015,
    trim: 1.28,
    rateSpread: 0.04,
    gainSpread: 0.1,
    decaySpread: 0.12,
    panSpread: 0.09,
    velBright: 0.32,
    velDecay: 0.25,
    pan: 0.16,
    room: 0,
    delay: 0,
  },

  // A ride: a hat's ladder an octave down with a tuned centre under it, and a
  // wash long enough that the hit's envelope rather than the body decides how
  // much is heard. `p.hit: 'bell'` is the same cymbal struck further in.
  ride: {
    ratios: [1, 1.41, 1.87, 2.34, 2.98, 3.73],
    base: 420,
    detune: 12,
    metal: 0.45,
    hp: 2400,
    peakHz: 5200,
    q: 0.25,
    tilt: 2,
    lidHz: 10000,
    pingHz: 940,
    pingLevel: 0.28,
    pingDecay: 0.09,
    bellPing: 3.2,
    bellWash: 0.45,
    bellRing: 1.8,
    t10: 0.28,
    seconds: 2.2,
    variants: 2,
    variantCents: 26,
    attack: 0.0025,
    trim: 1.07,
    rateSpread: 0.025,
    gainSpread: 0.08,
    decaySpread: 0.12,
    panSpread: 0.06,
    velBright: 0.22,
    velDecay: 0.4,
    pan: 0.22,
    room: 0.1,
  },

  // A crash: the same builder with a wider ladder, more noise and no ping. It
  // is the kitchen's one `texture` instrument, because what a crash does in an
  // arrangement is mark a section rather than keep a rhythm.
  crash: {
    ratios: [1, 1.63, 2.21, 3.07, 4.13, 5.41],
    base: 380,
    detune: 30,
    metal: 0.32,
    hp: 1800,
    peakHz: 7000,
    q: 0.2,
    tilt: 3,
    lidHz: 12000,
    pingHz: 0,
    pingLevel: 0,
    pingDecay: 0.05,
    bellPing: 1,
    bellWash: 1,
    bellRing: 1,
    t10: 0.75,
    seconds: 3.2,
    variants: 2,
    variantCents: 30,
    attack: 0.004,
    trim: 0.72,
    rateSpread: 0.02,
    gainSpread: 0.06,
    decaySpread: 0.1,
    panSpread: 0.05,
    velBright: 0.2,
    velDecay: 0.5,
    pan: -0.25,
    room: 0.18,
  },

  // Toms: the conga's arithmetic with the hand taken off it and the drop made
  // twice as deep. Three sizes, because a fill is three drums; the ring
  // follows the tuning rather than being three numbers kept in step, and
  // `ringPower` is what that follows by.
  tom: {
    hz: { high: 220, mid: 155, low: 104 },
    ringPower: 0.7,
    mode: 1.45,
    modeLevel: 0.22,
    modeDecay: 0.18,
    drop: 1.55,
    dropTime: 0.08,
    bodyLevel: 0.72,
    bodyLp: 1400,
    stickHz: 2200,
    stickQ: 1.2,
    stickDecay: 0.008,
    stickLevel: 0.18,
    t10: 0.19,
    seconds: 1.3,
    variants: 3,
    variantCents: 12,
    attack: 0.0025,
    trim: 1.03,
    rateSpread: 0.025,
    gainSpread: 0.07,
    decaySpread: 0.09,
    panSpread: 0.05,
    velBright: 0.14,
    velDecay: 0.3,
    pan: 0.28,
    room: 0.1,
  },

  // A cabasa: two bursts of high noise five milliseconds apart. The double
  // burst is the instrument — the beads land on the way out and again on the
  // way back — and one burst is a hat with the metal taken out.
  cabasa: {
    hp: 3600,
    peakHz: 6000,
    q: 0.6,
    gapSeconds: 0.005,
    second: 0.7,
    t10: 0.018,
    seconds: 0.25,
    variants: 3,
    variantCents: 40,
    attack: 0.0012,
    trim: 0.95,
    rateSpread: 0.04,
    gainSpread: 0.12,
    decaySpread: 0.14,
    panSpread: 0.1,
    velBright: 0.3,
    velDecay: 0.2,
    pan: -0.14,
    room: 0,
  },

  // A tambourine: the same burst under five inharmonic jingle pairs between 6
  // and 11 kHz, with a shimmer that outlasts the strike, and a low thud where
  // the hand lands.
  tambourine: {
    hp: 4200,
    peakHz: 7500,
    q: 0.5,
    ratios: [1, 1.27, 1.51, 1.73, 1.94],
    jingleHz: 6200,
    jingleLevel: 0.4,
    skinHz: 480,
    skinLevel: 0.22,
    skinDecay: 0.02,
    t10: 0.055,
    seconds: 0.7,
    variants: 3,
    variantCents: 28,
    attack: 0.0018,
    trim: 0.63,
    rateSpread: 0.035,
    gainSpread: 0.1,
    decaySpread: 0.14,
    panSpread: 0.1,
    velBright: 0.28,
    velDecay: 0.3,
    pan: 0.2,
    room: 0.06,
  },

  // A cowbell: two detuned squares a minor sixth and a half apart, through a
  // bandpass. The interval is the point — it beats into something with no
  // pitch at all, which is why a cowbell sits in a key it was never tuned to.
  cowbell: {
    lowHz: 540,
    highHz: 800,
    detune: 7,
    hp: 420,
    band: 2600,
    q: 0.9,
    t10: 0.07,
    seconds: 0.6,
    variants: 3,
    variantCents: 16,
    attack: 0.0015,
    trim: 0.75,
    rateSpread: 0.02,
    gainSpread: 0.08,
    decaySpread: 0.1,
    panSpread: 0.06,
    velBright: 0.12,
    velDecay: 0.25,
    pan: 0.3,
    room: 0.05,
  },

  // A woodblock: two resonators rung by one burst. A real quality factor of
  // twelve on a bandpass rings for about as many cycles, which at 1.4 kHz is
  // the ten milliseconds a block is, and the Q is the block's own hardness.
  woodblock: {
    // The make-up behind the resonators. A bandpass at a real quality factor
    // of nine passes a ninth of an octave of a broadband burst, so what comes
    // out of it is forty decibels under what went in; the gain is behind the
    // filters, where it belongs, rather than hidden in the family trim.
    boost: 26,
    hz: 1400,
    secondHz: 2360,
    second: 0.35,
    q: 9,
    strikeDecay: 0.004,
    t10: 0.014,
    seconds: 0.2,
    variants: 3,
    variantCents: 18,
    attack: 0.001,
    trim: 0.75,
    rateSpread: 0.03,
    gainSpread: 0.07,
    decaySpread: 0.1,
    panSpread: 0.07,
    velBright: 0.15,
    velDecay: 0.15,
    pan: -0.3,
    room: 0.04,
  },

  // The long drop: a sine from two octaves over the fundamental falling onto
  // it over sixty milliseconds and ringing for the best part of a second. The
  // drop is long enough that the ear hears a *pitch* going down, which is what
  // a sub kick is; the click is so low it is felt rather than heard, and it is
  // there for the system that cannot reproduce the rest.
  kickLong: {
    hz: 46,
    drop: 3.8,
    dropTime: 0.06,
    bodyLevel: 0.92,
    bodyLp: 220,
    drive: 0,
    clickHz: 240,
    clickQ: 0.8,
    clickDecay: 0.004,
    clickLevel: 0.22,
    t10: 0.3,
    seconds: 1.4,
    variants: 2,
    variantCents: 6,
    attack: 0.003,
    trim: 0.8,
    rateSpread: 0.012,
    gainSpread: 0.05,
    decaySpread: 0.07,
    velBright: 0.06,
    velDecay: 0.25,
  },

  // The short one: a third of the drop over half the time, a tenth of the
  // ring, a real click where a small speaker lives, and a touch of drive on
  // the body. It cuts through a mix where the other one holds it up.
  kickPunch: {
    hz: 52,
    drop: 2.6,
    dropTime: 0.028,
    bodyLevel: 0.85,
    bodyLp: 420,
    drive: 0.3,
    clickHz: 2600,
    clickQ: 0.9,
    clickDecay: 0.0035,
    clickLevel: 0.3,
    t10: 0.1,
    seconds: 0.6,
    variants: 2,
    variantCents: 6,
    attack: 0.0022,
    trim: 0.8,
    rateSpread: 0.012,
    gainSpread: 0.05,
    decaySpread: 0.07,
    velBright: 0.1,
    velDecay: 0.2,
  },

  // Peak levels in dB relative to the master bus, trimmed against the rendered
  // stems and then against the benchmark minute's band balance. The standing
  // rule when a genre default and a measurement disagree: the drums and the
  // bass are the record, and the mids and highs are flavour on top of them —
  // so the kick and the sustained bass win the argument every time. MEASURED: hats -16, clap -14, harmonic layer -7, all against the
  // kick. The hat figure is read in a 6-11 kHz band against a kick that has
  // almost no top, so taking it literally puts the 85% rolloff at 1.6 kHz when
  // the same report's own brightness target is 3.8 kHz. Hats therefore sit
  // about -10 dB under the kick: the report's spectral numbers over its level
  // numbers, since they disagree.
  levels: {
    kick: -3.0,
    sub: -14.0,
    // A ceiling on what a preset may add to the sub, in dB over the line
    // above. Every measured preset writes its own `levels.sub` from its
    // benchmark minute — `sub` asks for -11.0 and `growl` for -12.0, so the
    // archetypal minute runs the sub three decibels over the base table — and
    // a preset's level is a measurement, so it is not overwritten; it is
    // capped. MEASURED: the bass compressor absorbs a little over half of any
    // change here, so the 1.5 dB this takes off the `sub` preset is 0.6 to
    // 0.8 dB in the 45-90 Hz band.
    subCeilingOverBaseDb: 1.5,
    // A clap that lasts 36 ms instead of 3 carries a great deal more energy at
    // the same peak, and it has its room back on top of that. MEASURED against
    // the growl minute: at the old level it came out 10 dB hot against the hat.
    clap: -5.5,
    hatClosed: -5.5,
    hatOpen: -5.0,
    shaker: -9.5,
    // The midrange is carried by the sustained layer and the piano's room, not
    // by more notes: MEASURED, both presets sat 7-13 dB under their benchmark
    // across 250 Hz - 2 kHz after the minimalism round, and the fix for that
    // is the wash, not the grid.
    keys: -10.5,
    pad: -5.0,
    piano: -7.5,
    fx: -19.0,
  },

  // The sustained role. MEASURED (timbres.md, the 16 strings/pad tracks of
  // 52): attack 25 ms — *not* a bowed swell, only 21% of all tracks attack
  // slower than 30 ms — a 24 dB/oct lowpass landing the centroid at 620 Hz and
  // the 85% rolloff at 851 Hz, still only 8.8 dB down at the bar line, and the
  // wettest family in the study: the reverb tail sits within 1.5 dB of the
  // head, and at the family's p90 it is *louder* than the head.
  strings: {
    voices: 5, // MEASURED: 2-3 saws per chord note, 6-8 across a chord
    detuneCents: 10, // MEASURED: +-7-12 cents, which beats at the measured 0.3 Hz
    octaveLevel: 0.22, // the desk above: brightness, not a second chord
    // MEASURED against the ratings log. Eugene marked five growl scenes as
    // overflowing or clipping (master seed 84658 themes 1, 3 and 4; 68299
    // theme 1). Rendering the harmonic bus alone in each, with the ceiling
    // bypassed, the scenes that overflow are the ones whose pad is strings:
    //
    //   84658 th4 pad=strings   peak  +8.0 dBFS   rms -14.6
    //   68299 th1 pad=strings   peak  +6.9 dBFS   rms -13.9
    //   84658 th1 pad=strings   peak  +5.6 dBFS   rms -15.1
    //   1     th1 pad=rhodes    peak  +0.8 dBFS   rms -21.7
    //   84658 th3 keys=ep       peak  -4.9 dBFS   rms -24.2
    //
    // Peak and RMS differ by the same 7.2 dB, so this is a plain level
    // offset between two timbres at the same `levels.pad` and not a crest
    // problem: five saws at 0.5 through an ensemble that adds its dry and two
    // wet taps sum to far more than one Rhodes does. Six decibels brings the
    // strings pad within about a decibel of the others and takes the growl
    // scenes from needing 3.4-4.3 dB of gain reduction to needing under 2.
    voiceLevel: 0.25,
    attack: 0.025, // MEASURED median
    swellAttack: 0.55, // the 4% "synth swell" family, rolled rarely
    decay: 1.1,
    sustain: 0.52, // MEASURED: -8.8 dB at the bar line, before the reverb
    swellSustain: 0.32, // MEASURED: the swell family dies by the bar line
    release: 0.45,
    cutoffHz: 1200, // MEASURED: lands the centroid at 620 Hz
    q: 0.9, // gentle: a resonant peak in a held chord is a whistle
    hpHz: 90, // low enough that the chord layer reaches into 120-250 Hz
    // MEASURED: chorus at 0.2-0.3 Hz; 15-30 ms is what an ensemble is.
    chorus: [[17, 0.21, -1], [27, 0.29, 1]],
    ensembleDry: 0.62,
    ensembleWet: 0.5,
    vibratoHz: 5.0,
    vibratoCents: 4,
    vibratoHold: 0.18, // nothing until the note has spoken
    vibratoRise: 0.5,
    spread: 0.8,
    // "Strings with various FX levels", MEASURED as the family's own spread:
    // wetness -5.3 to +0.2 dB and width -5.8 to -1.4 dB across its 16 tracks.
    wetDb: [-5.3, 0.2],
    wetBase: 0.62,
    widthDb: [-5.8, -1.4],
  },

  keys: {
    // MEASURED: 27% of tracks carry a 4-7 Hz tremolo; the electric piano
    // family has the highest AM prominence of the sustained families.
    hpHz: 110, // the keys reach down into the band the kick body tops out in
    tremoloHz: 5.2,
    tremoloDepth: 0.18,
    tremoloPan: 0.22,
    rotaryHz: 5.0,
    rotaryDepth: 0.1,
    // Per-family wetness spread, in dB around the send each family sits at.
    wetDb: { ep: [-2.7, -0.1], rhodes: [-3.5, -1.6], glass: [-3.5, -1.6], organ: [-2.0, 0.4], pluck: [-17.9, -4.8] },
    wetBase: { ep: 0.34, rhodes: 0.26, glass: 0.26, organ: 0.3, pluck: 0.22 },
  },

  // The piano. Synthesised, not sampled, and mostly heard as a room.
  piano: {
    attack: 0.004,
    decayFast: 0.32, // the first fall: most of the note
    sustainLevel: 0.26,
    decaySlow: 4.5, // how long a string is allowed to ring at all
    ring: 1.3, // how far past its written length a note rings
    partialLevel: 0.34,
    partialDecay: 0.55, // per partial index: the top of the note goes first
    stretchCents: 2.2, // string stiffness; a couple of cents up the stack
    unisonCents: 4,
    unisonLevel: 0.7,
    hammerLevel: 0.26,
    hammerHz: 2200,
    brightMin: 1500,
    brightMax: 5400,
    hpHz: 105,
    spread: 0.5, // by register: the right hand sits out to the side
    dryLevel: 0.7, // the dry note is quiet; the hall is the instrument
    low: 55,
    high: 84,
    // Heavy ambient reverberation is the deep house piano. Rolled leaning wet.
    wet: [0.45, 0.95],
    delayWet: [0.06, 0.22],
    arpChance: 0.6, // arpeggio against simple melody
    arpBarChance: 0.62, // and it does not play every bar
    melodyBars: [{ v: 2, w: 3 }, { v: 4, w: 2 }],
  },

  // Which instrument holds the chord and which one plays the figure. MEASURED
  // (timbres.md, 52 tracks): electric piano 35%, strings/pad 31%, organ 12%
  // (4% on the strict test — the honest answer is a range, and one theme in
  // ten sits inside it at either end), pluck 12%, keys blend 8%, synth swell
  // 4%. Piano is Eugene's, at about the strings weight: the study could not
  // separate an acoustic piano from an electric one, so both are kept.
  //
  // The die picks the theme's *lead* family; whether it leads from the
  // sustained role or the rhythmic one is a property of the family, and the
  // partner die fills the other role when two layers play.
  timbre: {
    lead: [
      { v: 'ep', w: 35 },
      { v: 'strings', w: 31 },
      { v: 'piano', w: 31 },
      { v: 'pluck', w: 12 },
      { v: 'organ', w: 10 },
      { v: 'rhodes', w: 8 },
      { v: 'swell', w: 4 },
    ],
    // Which role each family fills when it is the lead.
    sustained: ['strings', 'swell', 'organ', 'rhodes'],
    // The companion under a lead stab: MEASURED, 100% of pluck tracks and 75%
    // of strings tracks have a pad under a stab, so the partner is nearly
    // always the ensemble.
    padPartner: [{ v: 'strings', w: 8 }, { v: 'rhodes', w: 2 }],
    // The companion over a lead pad.
    stabPartner: [
      { v: 'ep', w: 35 },
      { v: 'piano', w: 22 },
      { v: 'pluck', w: 18 },
      { v: 'rhodes', w: 10 },
      { v: 'glass', w: 8 },
    ],
    // How often the lead is the layer that plays when only one of the two
    // does. The lead leads.
    leadAlone: 0.72,
  },
};

// There used to be one live params object here that every voice imported, and
// `applyParams()` rewrote it in place before a track was generated, played or
// rendered. **Both are gone** (PLAN-V1-NEXT round C): a room is resolved into
// a frozen value its owner carries — `resolveSettings()` in `src/settings.ts`
// — and every graph, voice, prepare hook and automation call is handed one
// explicitly. The merge below is that resolver's; `clone` and `merge` are
// exported for it and for nothing else.
//
// What this file is now is the instruments, with the measurements that
// produced them, the two pure helpers over any table, and `hatEnergy`, which
// is a derivation of the hats and the levels and belongs beside the numbers it
// derives from.
/**
 * A plain nested table of values: what `clone` copies and what `merge` writes
 * over. A layer being merged in is a partial of the table it is merged onto
 * and nobody states its shape, so it is named by what it is and not by what it
 * happens to be a part of.
 */
export type PlainTable = Record<string, unknown>;

/** A deep copy: arrays and plain objects rebuilt, everything else handed back. */
function clone<T>(o: T): T {
  if (Array.isArray(o)) return o.map(clone) as T;
  if (o && typeof o === 'object') {
    const out: PlainTable = {};
    for (const k of Object.keys(o)) out[k] = clone((o as PlainTable)[k]);
    return out as T;
  }
  return o;
}

/**
 * `over` written into `target`, in place and all the way down. It is generic
 * because what comes back *is* the target — the same object, with a layer
 * merged into it — and a caller that handed in a table wants a table back.
 */
function merge<T>(target: T, over: PlainTable): T {
  const t = target as PlainTable;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') {
      merge(t[k], v as PlainTable);
    } else {
      t[k] = clone(v);
    }
  }
  return target;
}

export { clone, merge };

export function mergeParams<T>(a: T | null | undefined, b: PlainTable | null | undefined): T {
  return merge(clone((a || {}) as T), b || {});
}

/**
 * A preset's own `params` block, as far as this function reads it: a partial of
 * the level table and a partial of the hats, and whatever else a preset writes.
 */
export interface ParamOverrides {
  levels?: Partial<typeof INSTRUMENTS.levels>;
  hats?: Partial<typeof INSTRUMENTS.hats>;
  [key: string]: unknown;
}

/** What one theme's hats are trimmed to, lidded at, and left ringing for. */
export interface HatEnergy {
  trimDb: number;
  lidHz: number;
  openT10: number;
}

// One decision per theme: how much hat this room and this character want.
// `overrides` is the preset's own params, so this reads the levels the preset
// measured for itself and not the base table — which is the whole point, since
// every measured preset writes its own `levels.hatClosed` and `levels.shaker`
// and a change to the table alone would never reach them. What comes back is
// merged on top of the preset's `hats`, so it reaches every preset and every
// future one, and it is audio only: not a note, not a die, not a section.
//
// The density words it is keyed by are the style's (`density.weights`), and
// the `energy` block it reads is the hats' own, which is why this stayed here
// when the style's half of the table left: it is a derivation of an
// instrument, made once per theme, and it names no style constant.
export function hatEnergy(overrides: ParamOverrides | null | undefined, density: string): HatEnergy {
  const E = INSTRUMENTS.hats.energy;
  const L: Partial<typeof INSTRUMENTS.levels> = (overrides && overrides.levels) || {};
  const short =
    ((INSTRUMENTS.levels.keys - (L.keys ?? INSTRUMENTS.levels.keys)) +
      (INSTRUMENTS.levels.pad - (L.pad ?? INSTRUMENTS.levels.pad))) / 2;
  const room = Math.min(Math.max(short, 0), E.emptyRoomMaxDb);
  // The three words the style's density die draws are the three keys here; the
  // cast is what lets a plain word index them, and a fourth word would fall to
  // the nought it has always fallen to.
  const k = E.byDensity[density as keyof typeof E.byDensity] ?? 0;
  const trimDb = -k * (room + E.thinFloorDb);
  const H = mergeParams(INSTRUMENTS.hats, (overrides && overrides.hats) || {});
  const t = -trimDb;
  return {
    trimDb: (H.trimDb ?? 0) + trimDb,
    lidHz: H.lidHz * (1 - E.lidPerDb * t),
    openT10: H.openT10 * (1 - E.ringPerDb * t),
  };
}

export default INSTRUMENTS;
