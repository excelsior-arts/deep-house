// All tunables live here, so tuning the genre never means touching the engine.
//
// Values tagged MEASURED come from an analysis of three reference DJ sets
// of the genre. Values tagged GENRE are what the measurement could
// not see — masked tails, octave placement, send amounts — and stay as
// defaults. Where the two disagree, both are written down.

const BASE = {
  tempo: {
    // MEASURED: both benchmark minutes run 103-104 BPM. Eugene, hearing the
    // rarer roll: "I see some songs get to 122 bpm, let's stay in the range
    // 95-105 for now" — so the second family is no longer a faster room but a
    // slower one, and the whole record lives between 95 and 105 with its
    // centre of mass on the benchmarks.
    //
    // The two dice this is read with — one `chance`, one `float` — are
    // unchanged in number and order, so only the tempo of a seed moved and
    // nothing else about it did.
    def: 103,
    slowMin: 100,
    slowMax: 105,
    fastMin: 95,
    fastMax: 100,
    slowChance: 0.75,
  },

  // MEASURED: offbeat eighths land at 49.8% of the beat — dead straight.
  // Kept as a dial (0.50-0.58) rather than the 0.56 shuffle of genre lore.
  swing: 0.5,
  // MEASURED: hats sit 5-10 ms early. Seconds, subtracted from hat times.
  hatNudge: 0.006,

  key: {
    roots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // MEASURED: roots are near-flat
    minorChance: 0.8, // MEASURED: minor 80% of the time; the rest dorian
  },

  register: {
    // MEASURED on the benchmarks: bass fundamental 42-49 Hz, MIDI p10/p50/p90
    // of 29/31/38 and 25/28/37 — a good deal lower than the set-wide reading.
    subLow: 24,
    subCenter: 30, // the octave the line is folded toward
    subHigh: 38,
    subCeiling: 43,
    chordLow: 55,
    chordHigh: 72,
    padLow: 50,
    // A voicing whose bottom note is above this gets one an octave under it.
    padOctaveBelow: 57,
    padHigh: 76,
  },

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

  // MEASURED (space.md): under 120 Hz the sources are mono to three decimal
  // places; the width lives in 300 Hz - 4 kHz and the highs are *narrower*
  // than that; and the image breathes — the side/mid ratio of the chord band
  // modulates at about 0.21 Hz with a coefficient of variation of 0.45. The
  // last one is the thing a static generator is missing.
  space: {
    // MEASURED: 30-120 Hz is mono to three decimal places but 120-300 Hz still
    // carries side/mid 0.38. A mono-maker at 120 Hz took that band to 0.04, so
    // the crossover comes down to 100 Hz and the slope is gentler (Q 0.5, and
    // the wide path starts an octave lower still) — under 100 Hz stays mono,
    // the low mids keep their width.
    // Mono below this, as a highpass on the *side* only — see the long note in
    // master.js. The mid is never filtered, so the centre of the record is
    // flat through this stage by construction and "mono below 100 Hz" means
    // there is no side down there rather than that two filters were summed and
    // hoped for the best.
    //
    // MEASURED with the side path this replaces: side/mid survived at -1.7 dB
    // at 50 Hz and +1.4 dB at 100 Hz, so the low end was never mono at all.
    // Here the side is -12.3 dB at 50 Hz, -5.4 at 80, -3.0 at the corner and
    // -0.6 by 160 Hz, which leaves the 120-300 Hz width the sources measure.
    sideHpHz: 100,
    // DECIBELS, not a linear Q: Web Audio defines `Q` on lowpass and highpass
    // as the resonance at the cutoff in dB. -3.01 dB is linear 1/sqrt(2),
    // which is the Butterworth the old comment claimed and did not have.
    sideHpQdB: -3.01,
    // The width belongs to the chord band, not the top: measured side/mid is
    // 0.56 at 300-1k and only 0.42 at 4-16k. A first render had that backwards
    // (0.31 in the chords, 0.82 in the hats), which is why the mix read as
    // wide-but-not-stereo.
    // Side gain on the chord bus. It was 1.9 when the harmonic layer was
    // 10 dB quieter; at the level the strings and the piano now sit it drove
    // 300 Hz - 1 kHz to a side/mid of 1.34 and an L/R correlation of *minus*
    // 0.29 — an image turned inside out, not a wide one.
    // MEASURED this round against the three sets, side minus mid per third
    // octave: the sets sit at -4.2 to -6.0 dB from 315 Hz up and we sat at
    // -11 to -15 there, so the melodic bus was being *narrowed* by this gain
    // rather than widened. It comes up to where the measurement puts it. The
    // earlier reading that put it at 0.85 was taken when the chord band was
    // 10 dB louder relative to the rest and the side was reading against a
    // much quieter bed.
    widthBase: 1.45, // side gain on the chord bus
    // MEASURED: the breathing is a coefficient of variation of 0.45. At a
    // depth of 0.8 the render came out at 0.62 — a third too deep.
    widthDepth: 0.34, // +-, so the image breathes rather than sits
    widthRateHz: 0.21,
    padDriftHz: 0.07, // slow detune drift on the pad's outer voices
    padDriftCents: 7,
    // MEASURED: hats are a transient-wide element, not the widest band —
    // side/mid 0.42 and correlation 0.70 across 4-16 kHz. Per-hit random
    // panning at +-0.22 plus a Haas delay put the render at 0.80/0.23, so the
    // pan comes down and the Haas offset with it.
    // MEASURED this round: at 3-10 kHz the sets sit at side/mid -5.8 to -6.1 dB
    // and we sat at -7.4 — a decibel and a half narrow, and the cheapest
    // decibel and a half there is a wider per-hit pan, which is the one width
    // trick that sums to mono without a comb.
    hatPan: 0.18, // wide as transients, but they are not the widest band
    hatHaas: 0.002,
    // The Haas copy on the opposite side is what actually decorrelates the
    // hats; at +-0.8 and 0.22 it took 4-16 kHz to a correlation of 0.23
    // against a measured 0.70. Half the pan and two thirds the level.
    hatHaasPan: 0.3,
    // MEASURED this round, and left alone: neither this nor the pan is what
    // sets the hats' width. The noise half of a hat is rendered as two
    // independent channels and the metal half as one, so the metal/noise ratio
    // is the width control, and 4-10 kHz comes out at side/mid -7.6 dB against
    // the sets' -5.9. Raising this to 0.125 moved that by 0.1 dB and cost the
    // mono sum a 1.2 dB comb, so it goes back where it was; the remaining
    // decibel and a half is written up rather than bought at that price.
    hatHaasLevel: 0.09,
    clapPan: 0.35,
  },

  sends: {
    delayFeedback: 0.34, // GENRE
    delayDotted: 0.75, // GENRE: dotted eighth, in beats
    delayLevel: 0.5,
    // The chord wash: long and dark, and it never clears inside a bar.
    reverbSeconds: 2.4,
    reverbLevel: 0.95,
    reverbToneHz: 4000,
    reverbCorr: 0.25,
    reverbLowHz: 150,
    // MEASURED: the clap room is short and bright — RT60 144 ms at 3-10 kHz,
    // down 10 dB in 15 ms — and it sits behind a 53 ms pre-delay.
    roomSeconds: 0.32,
    roomPreDelay: 0.053,
    roomLowHz: 600,
    roomHighHz: 11000,
    roomLevel: 0.85,
    // MEASURED: the top of the mix is narrower than the chord band, so the
    // short room behind the hats and the clap is two thirds one tail.
    roomCorr: 0.7,
    clapReverb: 0.5,
    hatReverb: 0.18,
    // The piano's own room: long, dark and a little behind the note. It is
    // built the first time something sends to it, so a track with no piano in
    // it never pays for a four-second convolver.
    hallSeconds: 4.2,
    hallDecay: 2.3,
    hallToneHz: 3400,
    hallLowHz: 190,
    hallPreDelay: 0.032,
    hallLevel: 1.0,
    hallCorr: 0.2,
  },

  // The push: one macro over the bass drive, the body peak, the kick-bus glue
  // and the sub level, automated by the arrangement. Zero through a normal
  // groove — the kick and the bass are the structure and structure does not
  // distort — rising over the last bars of a build, briefly high on the first
  // bars of a drop, and gone again within eight. This is where the loudness
  // and the dirt Eugene wants "on breaks where the drums fill and the energy
  // rises" live, and nowhere else.
  push: {
    // MEASURED on the bass stem of master seed 1 theme 2, bars 60-64, with the
    // ceiling bypassed so nothing is hidden. The fundamental is 61.5 Hz and
    // the harmonics are read relative to it:
    //
    //   push off            h2 -24.4  h3 -44.4  h4 -47.3  h5 -60.1
    //   satAmount 0.50      h2 -30.4  h3 -14.7  h4 -35.3  h5 -25.6
    //   satAmount 0.22, satDrive 0.50   (this setting, measured below)
    //
    // A parallel tanh is symmetric, so what it makes is *odd* harmonics: at
    // 0.5 the third harmonic came up thirty decibels and the fifth
    // thirty-four, which at a 61 Hz fundamental puts 18% of the fundamental's
    // amplitude at 184 Hz. That is not drive on a bass, it is a square wave,
    // and it is what Eugene heard as "it sounds like it breaks the speakers".
    // bass.js's own rule, three files away, is that the third harmonic stays
    // under -34 dB; a drop is allowed to break that rule, it is not allowed to
    // break it by twenty decibels.
    satAmount: 0.22, // how much of a hot parallel saturation is blended in
    satDrive: 0.5,
    // The body peak and the sub bump are EQ, not distortion, and they are most
    // of what makes a drop feel like a drop. They still move the sub band:
    // a +6 dB peak at 115 Hz with Q 0.65 is +4.0 dB at 62 Hz and +1.9 dB at
    // 39 Hz, which is the bass fundamental, not its body. Trimmed so the lift
    // lands where it is named.
    bodyDb: 4.5, // added to bass.bodyDb at full push
    subDb: 1.5, // and a dB or so of sub with it
    buildBars: 6, // the lift into a drop
    dropBars: 8, // and how long it takes to leave
    // The default ceiling is half; the drop's first bar is the one moment
    // allowed to go higher, and it is gone eight bars later. Eugene: overdrive
    // "is fine in some places, to exaggerate the transition from a loud break
    // beat to the quieter parts" — the moments, and nowhere else.
    dropLevel: 0.85,
    buildLevel: 0.5,
    markLevel: 0.5, // the bar that hands a loud section over to a quiet one
  },

  sidechain: {
    // MEASURED, and the tightest agreement in the whole profile: the minimum
    // sits 54 ms after the beat in both benchmarks and the level is back by
    // 0.94-0.97 of a beat. The depth is much deeper than the set-wide reading.
    depthDb: -16.0,
    // MEASURED on the reference sets: the *bass* ducks 6-9 dB, much less than
    // the midrange does, and its minimum is 54 ms after the beat. Ducking the
    // low end as hard as the chords flattens it — and then the bass
    // compressor, which used to sit after the duck, pushed what was left back
    // up into a straight line.
    lowDepthDb: -8.0,
    attack: 0.005,
    minimumAt: 0.054,
    recoverBy: 0.95, // fraction of a beat
  },

  master: {
    // Set by measurement: at this gain five seeds land within 0.4 dB of each
    // other at about -14 LUFS, with true peak around -5 dBTP — under the -1
    // ceiling with room to spare. Pushing the peak up to -1 would mean
    // crushing the crest, and the benchmark minutes have a *higher* crest than
    // a synthesised low end does, so that would be the wrong trade.
    // 0.77 was the balance pass's make-up, +0.6 dB over the 0.72 that stood
    // before it. The capture Eugene called "nearly perfect" — master seed 1,
    // theme 1, round bar 152 — measures 1.6 to 2.4 dB quieter than the same
    // material at 0.77, which is that make-up plus the low-mid bell's skirt.
    // ...but the record still has to land at -12 LUFS, and the sub ceiling,
    // the low shelf and the re-proportioned push together take about 1.7 dB
    // out of a theme, which is more than the make-up was ever worth. So the
    // make-up goes *up*, and it buys a quieter limiter rather than a louder
    // one: MEASURED on master seed 1 theme 2, at this gain the ceiling works
    // 4.2 dB through a drop against 6.4 dB before, and the crest of the drop
    // is 8.5 dB against 7.1. The record is a third of a decibel quieter than
    // the balance pass left it and a decibel and a half less of it is the
    // limiter. MEASURED over all 224 bars of master seed 1 theme 2, gated:
    // -11.95 LUFS at bf8c701, -12.31 here, against a target of -12.
    gain: 0.84,
    // A real ceiling. The limiter catches peaks, the soft clipper rounds what
    // gets past it, and the trim sets where the file actually lands.
    //
    // The attack is deliberately slow. A 3 ms attack riding a 45 Hz sine acts
    // *inside* one cycle of it: that is not limiting, it is redrawing the
    // waveform, and it is what a listener calls "the bass is clipping". At
    // 14 ms the limiter cannot see a single cycle of anything in the bass
    // register, and the release is long enough not to pump against the beat.
    // Nothing in this chain has a time constant shorter than a cycle of the
    // bass. The limiter rides the level slowly — 30 ms attack, 300 ms release,
    // a gentle ratio — so a 45-65 Hz wave never sees its gain move inside its
    // own period, which is what put a buzz on the bass the first time. The
    // fast peak catching is left to the clipper, which is memoryless: a
    // waveshaper has no attack and no release and therefore cannot pump.
    // Off, and `ratio: 1` means the node is not built. The same reading that
    // took the glue out condemns this one: it is a DynamicsCompressor on the
    // same low end, and Firefox renders the kick's onset with a step 0.35 of
    // its peak through it against 0.11 without. The ceiling is the soft
    // clipper's job now, and a waveshaper is memoryless — it has no attack and
    // no release, so it cannot move its gain inside a cycle of anything.
    // The ceiling, and the only thing holding it. A look-ahead brick-wall
    // limiter in a worklet we own (src/limiter-worklet.js), not a
    // DynamicsCompressor: that node moves its gain inside one cycle of a
    // fifty hertz wave and Firefox plays the step, which is why both of them
    // came out of this chain.
    //
    //   ceiling     0.75, where the clipper used to land its output anyway,
    //               so the record's level does not move -- only the
    //               distortion that used to hold it there goes away.
    //   lookahead   5 ms of delay, which is the time the gain has to ramp
    //               down in before the peak it was computed from arrives.
    //   hold        25 ms, longer than a cycle of anything above 40 Hz, so
    //               the envelope cannot fall between two peaks of the same
    //               bass note and the gain is flat across it.
    //   release     200 ms, slow enough not to pump against the beat.
    limiter: { ceiling: 0.75, lookaheadMs: 5, holdMs: 25, releaseMs: 200 },
    // If the worklet cannot be had, the master runs quieter rather than
    // handing the ceiling back to the clipper.
    limiterFallbackDb: -2,
    trim: 1.0,
    targetLufs: -14,
    // A safety clipper, not a saturator: linear up to the knee, so a signal
    // peaking at -3 dBFS passes through it untouched and only real overs get
    // rounded. The tanh it replaced shaped *everything*, and on a mix whose
    // peaks are the bass that is broadband distortion by another name.
    // The real ceiling: linear below the knee, and however hard it is hit the
    // output cannot exceed knee + (1 - knee) / drive = 0.847, or -1.4 dBFS,
    // which leaves room for the inter-sample peaks a true-peak meter finds.
    dcHz: 22,
    dcQ: 0.7,
    oversample: '4x',
    // Linear to 0.80 now, not 0.55. With a real limiter in front holding the
    // signal at 0.75, everything reaching the clipper is under the knee and
    // passes through untouched; the curve above it exists only to catch the
    // inter-sample overs a sample-peak limiter cannot see, with a hard
    // ceiling of knee + (1 - knee) / drive = 0.891, or -1.0 dBFS.
    // MEASURED before this round, with the clipper as the only ceiling: the
    // marked growl scenes on master seed 84658 arrived at 0 dBFS and had
    // 2.1-2.5% of their samples shaped, the worst by 0.25 of full scale.
    clipKnee: 0.80,
    clipDrive: 2.2,
    filterOpen: 15000,
    filterClosed: 420,
    // Glue over the kick and the bass together: slow enough to let the kick's
    // transient past, releasing near a beat, 2-3 dB of gain reduction, then a
    // little saturation so the two read as one instrument.
    // 2 dB of gain reduction, no more: the benchmarks' low end has a *higher*
    // crest factor than a synthesised one, so squeezing harder moves away from
    // them rather than toward them.
    // The glue's saturation is off. `saturationCurve` is non-linear well
    // before full scale, and the loudest thing going through this bus is a
    // sustained sine at 45 Hz: any curve here is harmonics on the bass. The
    // push macro is where drive on the low end lives now.
    // The glue is off, and `ratio: 1` now means the node is not built at all.
    //
    // It was two decibels of gain reduction to make the kick and the bass read
    // as one instrument. MEASURED across engines on one kick: through the
    // theme graph Firefox renders its onset with a step 0.84 of the hit's
    // peak, against 0.05 in Chromium and WebKit — a DynamicsCompressor with a
    // 25 ms attack sitting on a 50 Hz wave moves its gain *inside* one cycle
    // of that wave, and Firefox does not smooth it the way Chromium does.
    // Take the node out and the same kick renders at 0.037, cleaner than
    // Chromium managed with it in. Two decibels of glue is not worth a click
    // on every beat in a third of browsers.
    glue: { threshold: -10, knee: 10, ratio: 1, attack: 0.025, release: 0.35, drive: 0 },
    airHz: 8500, // a high shelf on the master so the hats read as hats
    airDb: 1.8,
    // A presence lift where the reference sets carry more energy than a
    // synthesised mix naturally does: hats, clap body, chord harmonics.
    presenceHz: 2600,
    presenceDb: 5.5,
    presenceQ: 0.6, // wide: the hole runs from 1.6 kHz to 4 kHz, not one spot
    // A broad lift where the generator has least to say. MEASURED against the
    // three sets' long-term spectrum: 120-250 Hz sat 10 dB under them, because
    // the kick's body is a sine that stops at 60 Hz and the chord voicings
    // start above middle C, so the octave between them belongs to nothing.
    // The sources there are thin by construction, so this is the one place a
    // broad master EQ is the honest tool rather than a patch.
    lowMidHz: 160,
    lowMidDb: 7.5,
    lowMidQ: 0.62,
    // ...and the shelf that keeps the sub off it. A peaking filter has skirts:
    // +7.5 dB at 160 Hz with Q 0.62 is still +2.7 dB at 62 Hz and +1.2 dB at
    // 39 Hz, so every bass fundamental in the record was riding a filter aimed
    // at the octave above it. MEASURED, this shelf against the bell:
    //
    //   Hz        39    62    80   100   125   160   250   400
    //   bell    +1.2  +2.7  +4.0  +5.4  +6.8  +7.5  +5.6  +2.8
    //   +shelf  -0.6  +1.4  +3.3  +5.0  +6.6  +7.4  +5.6  +2.8
    //
    // — the 125 Hz to 400 Hz the balance pass measured is untouched to within
    // a tenth of a decibel, and the sub band comes back to where it sat before
    // the bell was widened.
    lowShelfHz: 70,
    lowShelfDb: -2.0,
    // The hole this round measured. Against the three sets' long-term
    // spectrum, averaged over five 32-bar windows in three themes, 500 Hz to
    // 2 kHz sits 15-22 dB under them and 2.5 kHz 8 dB under, while 4-8 kHz is
    // within a decibel: the mids are the whole of what Eugene hears as "bass
    // and highs dominant". Two thirds of that gap is the record being minimal
    // where a DJ set is a full production, and no filter can invent a vocal;
    // this is the part an honest broad lift can take, and it is the same tool
    // and the same argument as `lowMid` above.
    // MEASURED twice: at 950 Hz and Q 0.5 this also lifted 250-400 Hz, which
    // a theme whose harmonic layer is already loud does not need — seed 1's
    // third theme went 6 dB *over* the sets there. Higher and a little
    // narrower puts the lift where every theme measured short.
    midHz: 1100,
    midDb: 5.5,
    midQ: 0.55,
    // MEASURED: a breakdown lifts the pad and midrange by +1 to +1.4 dB.
    breakdownLiftDb: 1.4,
  },

  // MEASURED corpus density is biased upward (the note-start detector counts
  // the kick and the pump), and the genre is minimal anyway: space and air,
  // not a note on every sixteenth. The density die leans sparse.
  density: {
    weights: [{ v: 'minimal', w: 5 }, { v: 'medium', w: 3 }, { v: 'busy', w: 1.2 }],
    bassNotes: { minimal: 3, medium: 4, busy: 6 },
    maxStabs: { minimal: 2, medium: 3, busy: 4 },
    // MEASURED (timbres.md): 40% of tracks run two harmonic layers — a
    // sustained floor under a rhythmic stab. So it is 60/40, not 90/10. These
    // three weighted by the density die average out at 0.42.
    bothHarmonicChance: { minimal: 0.32, medium: 0.45, busy: 0.75 },
    // MEASURED nothing; a riser every 32 bars rather than every 8 is what
    // "sparse" means here.
    fxEveryBars: { minimal: 32, medium: 24, busy: 16 },
    sixteenthHats: { minimal: false, medium: true, busy: true },
  },

  // Where a theme's own loudness is decided, before a node is built.
  //
  // MEASURED, 2026-09-17, master seeds 1-40 x themes 0-2 (see the coefficient
  // block below for the count that survived, the residual and the date): eight
  // bars of each theme's main groove rendered offline through the real graph in
  // headless Chromium and metered. See tools/loudness-fit.mjs, which writes
  // the whole table and the fit up as loudness-fit.md.
  //
  // `intercept`, `coef` and `centre` are a linear model over the plan:
  //
  //   predicted LUFS = intercept + sum over k of coef[k] x (column[k] - centre[k])
  //   trim dB        = clamp(targetLufs - predicted, -clampDb, +clampDb)
  //
  // The columns are named in LOUDNESS_COLUMNS at the foot of this file and are
  // all functions of `loudnessFeatures(track)`, which reads the dice, the mined
  // masks, the room's own level table and eight rows of the timeline. Nothing
  // in it renders, meters or touches audio: evaluating it is a few dozen
  // multiplications, which is why the record can be levelled on a listener's
  // machine at all.
  loudness: {
    // MEASURED 2026-09-17, master seeds 1-40 x themes 0-2 = 120 themes: eight
    // bars of each one's main groove, rendered offline through the real graph
    // in headless Chromium and metered (tools/loudness-fit.mjs, whose report
    // is loudness-fit.md). Ten features chosen by forward selection
    // on the five-fold cross-validated residual, out of a pool of fifty:
    // R2 0.750, in-sample residual 0.461 LU, **cross-validated 0.519 LU**, the
    // worst held-out theme 1.40 LU. A pool that was also allowed a coefficient
    // per instrument and per room cross-validates at 0.508 LU — eleven
    // thousandths of a decibel better for a table somebody would have to refit
    // every time a voice is written, which is why this one names neither.
    //
    // The measured set ran -15.63 to -11.17 LUFS, sd 0.921. What the fit cannot
    // predict is what is left: sd 0.461, and the trims are ±4 dB at the outside.
    //
    // **The target is where the record already is, and that is the point.**
    // -13.0 is the loudness of the blessed reference — seed 1's eight bars in
    // tools/reference-seed1.json measure -12.98 — and it is the mean of the
    // 120 main grooves to a hundredth. So the mean trim is +0.06 dB: this
    // levels the themes against each other and moves the record nowhere.
    //
    // A target of -12 was tried and rejected, MEASURED rather than argued.
    // It asks for +1.54 dB on average in front of a limiter that is already
    // working, and the limiter gives a quiet section more of that decibel than
    // a loud one: seed 1's breakdown went from +0.01 LU over its own mains to
    // **+0.62**, against a rule of 0.5, and the share of the window the limiter
    // spent over a decibel down went from 16% to 40% on that theme's main and
    // from 54% to 80% on seed 68299. Levelling a record and making it louder
    // are two decisions, and the second one is the make-up gain's, which the
    // click gate holds at 0.84 and the notes carry as an open item. This one
    // is the first decision only.
    targetLufs: -13,
    // A clamp and not a limit anybody expects to hit: over the measured 120 the
    // trim runs -2.30 to +3.18 dB and not one of them reaches this. Four
    // decibels is where a prediction has clearly gone wrong and the record
    // should be left where the mix put it rather than driven there.
    clampDb: 4,
    // How much of a decibel put in front of the master comes out the other
    // side. It is not one, because this record lives on its limiter: the
    // reference eight bars spend 45% of their length more than a decibel down.
    // MEASURED by rendering the same 120 themes a second time with the trim in
    // the graph and regressing what moved against what was asked for, through
    // the origin.
    //
    // Two numbers, because a limiter is one-sided: driving a theme up into the
    // ceiling gives back two thirds of the decibel, pulling one back out of it
    // gives back three quarters. Residual 0.065 LU over the 58 themes that went
    // up and 0.099 LU over the 59 that came down, against 0.103 for one slope
    // in the middle — and a slope in the middle is what put seed 38's third
    // theme 1.4 LU under its neighbours in the first montage. The level of the
    // theme adds nothing beyond the direction (0.019 dB of slope per LU going
    // up, nothing coming down), so this is the whole of it.
    slopeUp: 0.6673,
    slopeDown: 0.7662,
    intercept: -11.28438,
    coef: {
      velBass: 10.12243,
      sharePad: -2.02485,
      rateBass: 0.35629,
      wetKeys: -0.50731,
      harmonicBright: 0.16286,
      harmonicHold: 1.22596,
      stabMask: 5.72382,
      ratePad: 0.78353,
      harmonicDb: 0.28782,
      bpm: 0.06386,
    },
    centre: {
      velBass: 0.835112,
      sharePad: 0,
      rateBass: 3.480208,
      wetKeys: 0.367429,
      harmonicBright: 10.790127,
      harmonicHold: 0.379933,
      stabMask: 0.428125,
      ratePad: 1.695833,
      harmonicDb: -15.631364,
      bpm: 101.935,
    },
  },

  groove: {
    openHatChance: 0.45,
    sixteenthHatChance: 0.8, // MEASURED: the sixteenth layer is nearly always there
    sixteenthHatLevel: 0.29, // MEASURED: -10.7 dB under the offbeat eighth
    hatVelocityCv: 0.28, // MEASURED
    ghostClapChance: 0.18,
    bassFifthChance: 0.3,
    bassOctaveChance: 0.2,
    stabChance: 0.62,
    // MEASURED: 2-5 bar kick dropouts are far more common than breakdowns and
    // are what keeps the groove from feeling mechanical.
    kickDropoutChance: 0.1,
  },

  harmony: {
    // MEASURED: i 40%, VImaj7 25%, iv 12%, III 2%, VII 1% (plus IV/V/v).
    degreeWeights: { 0: 40, 5: 25, 3: 12, 2: 4, 6: 3, 4: 3 },
    // MEASURED: 66% of chord spans are 1 bar, 21% are 2.
    chordBarsWeights: [{ v: 1, w: 66 }, { v: 2, w: 21 }, { v: 4, w: 13 }],
    // MEASURED: loop period 2 bars (19 windows), 4 (17), 8 (8), 16 (6).
    loopBarsWeights: [{ v: 2, w: 19 }, { v: 4, w: 17 }, { v: 8, w: 8 }],
    // MEASURED: the 9th, 11th and b7 all sit well above the non-chord floor.
    ninthChance: 0.75,
    eleventhChance: 0.35,
  },

  arrangement: {
    breakdownBars: 16, // MEASURED: 12-22 bars, median 15
    breakdownEvery: 64, // MEASURED: one every 48-96 bars
    kickPresentTarget: 0.75, // MEASURED
    // MEASURED: build-ups are filter sweeps in 64-83% of cases; the high band
    // rises in only half. Use the noise riser sparingly.
    riserChance: 0.45,
  },
};

// One live params object that every voice imports. A preset is a set of
// overrides merged onto a fresh copy of BASE, applied before a track is
// generated, played or rendered — so the voices need to know nothing about
// presets and the object identity never changes under them.
function clone(o) {
  if (Array.isArray(o)) return o.map(clone);
  if (o && typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o)) out[k] = clone(o[k]);
    return out;
  }
  return o;
}

function merge(target, over) {
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
      merge(target[k], v);
    } else {
      target[k] = clone(v);
    }
  }
  return target;
}

export const PARAMS = clone(BASE);

export function applyParams(overrides) {
  for (const k of Object.keys(PARAMS)) delete PARAMS[k];
  merge(PARAMS, clone(BASE));
  if (overrides) merge(PARAMS, overrides);
  // The one level with a ceiling over it. A preset may set the sub wherever
  // its benchmark minute puts it, up to `subCeilingOverBaseDb` above the base
  // table; past that the record has a different bass every time the preset die
  // rolls, and it is the loudest thing in the mix that changes. It is a
  // ceiling and not a trim, so `?sub=-3` still lands three decibels under
  // whatever the preset ended up with.
  const cap = BASE.levels.sub + BASE.levels.subCeilingOverBaseDb;
  if (PARAMS.levels.sub > cap) PARAMS.levels.sub = cap;
  return PARAMS;
}

export function mergeParams(a, b) {
  return merge(clone(a || {}), b || {});
}

export function baseParams() {
  return clone(BASE);
}

// One decision per theme: how much hat this room and this character want.
// `overrides` is the preset's own params, so this reads the levels the preset
// measured for itself and not the base table — which is the whole point, since
// every measured preset writes its own `levels.hatClosed` and `levels.shaker`
// and a change to the table alone would never reach them. What comes back is
// merged on top of the preset's `hats`, so it reaches every preset and every
// future one, and it is audio only: not a note, not a die, not a section.
export function hatEnergy(overrides, density) {
  const E = BASE.hats.energy;
  const L = (overrides && overrides.levels) || {};
  const short =
    ((BASE.levels.keys - (L.keys ?? BASE.levels.keys)) +
      (BASE.levels.pad - (L.pad ?? BASE.levels.pad))) / 2;
  const room = Math.min(Math.max(short, 0), E.emptyRoomMaxDb);
  const k = E.byDensity[density] ?? 0;
  const trimDb = -k * (room + E.thinFloorDb);
  const H = mergeParams(BASE.hats, (overrides && overrides.hats) || {});
  const t = -trimDb;
  return {
    trimDb: (H.trimDb ?? 0) + trimDb,
    lidHz: H.lidHz * (1 - E.lidPerDb * t),
    openT10: H.openT10 * (1 - E.ringPerDb * t),
  };
}

export default PARAMS;
