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

import kickRow from '../sounds/drum/kick.json' with { type: 'json' };
import kickLongRow from '../sounds/drum/kickLong.json' with { type: 'json' };
import kickPunchRow from '../sounds/drum/kickPunch.json' with { type: 'json' };
import subRow from '../sounds/bass/sub.json' with { type: 'json' };
import congaRow from '../sounds/drum/conga.json' with { type: 'json' };
import bongoRow from '../sounds/drum/bongo.json' with { type: 'json' };
import snareRow from '../sounds/drum/snare.json' with { type: 'json' };
import rimshotRow from '../sounds/drum/rimshot.json' with { type: 'json' };
import hatTightRow from '../sounds/noise/hatTight.json' with { type: 'json' };
import hatLooseRow from '../sounds/noise/hatLoose.json' with { type: 'json' };
import hatSizzleRow from '../sounds/noise/hatSizzle.json' with { type: 'json' };
import rideRow from '../sounds/noise/ride.json' with { type: 'json' };
import crashRow from '../sounds/noise/crash.json' with { type: 'json' };
import tomRow from '../sounds/drum/tom.json' with { type: 'json' };
import cabasaRow from '../sounds/noise/cabasa.json' with { type: 'json' };
import tambourineRow from '../sounds/noise/tambourine.json' with { type: 'json' };
import cowbellRow from '../sounds/drum/cowbell.json' with { type: 'json' };
import woodblockRow from '../sounds/drum/woodblock.json' with { type: 'json' };
import pulseLeadRow from '../sounds/keyboard/pulseLead.json' with { type: 'json' };
import triLeadRow from '../sounds/keyboard/triLead.json' with { type: 'json' };
import vinylBedRow from '../sounds/noise/vinylBed.json' with { type: 'json' };
import grainPadRow from '../sounds/ensemble/grainPad.json' with { type: 'json' };
import sweepUpRow from '../sounds/effect/sweepUp.json' with { type: 'json' };
import clapRow from '../sounds/drum/clap.json' with { type: 'json' };
import pluckBassRow from '../sounds/bass/pluckBass.json' with { type: 'json' };
import sawLeadRow from '../sounds/keyboard/sawLead.json' with { type: 'json' };
import fmBellRow from '../sounds/keyboard/fmBell.json' with { type: 'json' };
import karplusPluckRow from '../sounds/keyboard/karplusPluck.json' with { type: 'json' };
import formantPadRow from '../sounds/ensemble/formantPad.json' with { type: 'json' };
import clavKeyRow from '../sounds/keyboard/clavKey.json' with { type: 'json' };
import supersawPadRow from '../sounds/ensemble/supersawPad.json' with { type: 'json' };
import sawPadRow from '../sounds/ensemble/sawPad.json' with { type: 'json' };
import wavePadRow from '../sounds/ensemble/wavePad.json' with { type: 'json' };
import brightPianoRow from '../sounds/keyboard/brightPiano.json' with { type: 'json' };
import reedOrganRow from '../sounds/keyboard/reedOrgan.json' with { type: 'json' };
import fmGlassRow from '../sounds/keyboard/fmGlass.json' with { type: 'json' };
import fmEpRow from '../sounds/keyboard/fmEp.json' with { type: 'json' };
import fmPluckRow from '../sounds/keyboard/fmPluck.json' with { type: 'json' };
import marimbaRow from '../sounds/keyboard/marimba.json' with { type: 'json' };
import vibesRow from '../sounds/keyboard/vibes.json' with { type: 'json' };
import subSoftRow from '../sounds/bass/subSoft.json' with { type: 'json' };
import subTriRow from '../sounds/bass/subTri.json' with { type: 'json' };
import pianoRow from '../sounds/keyboard/piano.json' with { type: 'json' };
import stringsPadRow from '../sounds/ensemble/stringsPad.json' with { type: 'json' };
import stringsSwellRow from '../sounds/ensemble/stringsSwell.json' with { type: 'json' };
import keysRhodesRow from '../sounds/keyboard/keysRhodes.json' with { type: 'json' };
import keysGlassRow from '../sounds/keyboard/keysGlass.json' with { type: 'json' };
import keysEpRow from '../sounds/keyboard/keysEp.json' with { type: 'json' };
import keysOrganRow from '../sounds/keyboard/keysOrgan.json' with { type: 'json' };
import keysPluckRow from '../sounds/keyboard/keysPluck.json' with { type: 'json' };

/** The record's sub, as its row states it: the voice's half of the `bass` block below. */
const SUB = subRow.parameters;
/** The ensemble's body, as the strings rows state it (both carry the same body; round SOUNDS-R3). */
const ENSEMBLE = stringsPadRow.parameters;
/** The amplifier every keyboard patch plays through, as the keys rows state it (all five carry the same). */
const AMP = keysRhodesRow.parameters;
/** The piano, as its row states it: the voice's half of the `piano` block below. */
const PIANO = pianoRow.parameters;

export const INSTRUMENTS = {
  // The kick: the record's own row, `sounds/drum/kick.json`, in the block it
  // has always had so a room may voice it (`rooms` write `kick.drive`, a place
  // `kick.t20`) and the voice renders from the room's copy. What its numbers
  // mean — the measurements off the benchmark minutes — is written at the head
  // of the topology, `voices/kick.ts` (round R1).
  kick: kickRow.parameters,

  hats: {
    base: 640, // fundamental of the inharmonic ladder
    metalClosed: 0.55, // how much of the hat is oscillators rather than noise
    metalOpen: 0.5,
    // MEASURED as the time to fall 10 dB: 85 ms in one benchmark, 21 in the
    // other — loose and washy against short and dry. A preset picks.
    // A lid on every hat: darker than a synth wants to be. Round EQ-3 lifted it
    // from 8500 to 12000 (the rooms' own and the kit rows' by the same ratio,
    // so each keeps its step of darkness): at 8.5 kHz it took the band the
    // master's air shelf lifts, and the long takes read nothing above 8 kHz.
    lidHz: 12000,
    closedT10: 0.04,
    openT10: 0.18,
    shakerT10: 0.05,
    // MEASURED: neither benchmark has a distinct open hat at all.
    openHats: false,
    // One trim over the whole family, applied inside the voice, so it reaches
    // a preset that sets its own `levels.hatClosed` and `levels.shaker` —
    // which every measured preset does, and which is why a change to the level
    // table alone did nothing to the minute being listened to.
    // MEASURED against the three sets: at 4-8 kHz the render sits within a
    // decibel of them, so the hats were never hot in absolute terms; they were
    // the only thing above 1.2 kHz. The mid lift below is most of the fix and
    // this is the rest of it.
    trimDb: -0.8,
    // ...and the energy the *theme* asks for, on top of that trim. On master
    // seed 15576 theme 2 — preset `sub`, density minimal, a composition rated
    // highly — the hats read too intense for the density of the track, where
    // they should be thinner and only support the rhythm.
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
    // The grain (round SPARK-2, `voices/hat-grain.ts`): the closed and open
    // hats' metal above 8 kHz, their air past the lid and their tail after
    // -10 dB, and the shaker's own air, tail and beads. Nought here and in
    // every room, which builds nothing; a place writes them
    // (`styles/deep-house-places.ts`, `DRUM_GRAIN`).
    top: 0,
    air: 0,
    tail: 0,
    shakerAir: 0,
    shakerTail: 0,
    shakerBeads: 0,
  },

  clap: clapRow.parameters,

  // The bass block: the bus's half here — what `master.ts` builds the bass
  // bus out of and what the composer reads of the line's weight — and the
  // record's sub, which is a row (`sounds/bass/sub.json`, round R1) voiced
  // through this block so a room may move it (the rooms write `drive`,
  // `cutoff`, `triangle`, `octave`, `even`; the stage's bypass writes the
  // body off). What the row's numbers mean is at the head of its topology,
  // `voices/sub.ts`. **The keys stand in the order the block has always had**,
  // the row's where its numbers always were: the fixtures lock
  // (`tools/fixtures/programs.ts`) hashes a program as it is written and not
  // sorted, so an order is a byte, and a spread that put the bus's half first
  // moved six fixture rows with every value equal (round R1 found it so).
  bass: {
    drive: SUB.drive,
    cutoff: SUB.cutoff,
    triangle: SUB.triangle,
    octave: SUB.octave,
    even: SUB.even,
    // Body: the 80-160 Hz that makes a note something you can hum. The two
    // benchmark minutes sit at -11.0 and -8.4 dB in that band. Was +9 dB,
    // which is a bass you can hum and also a bass that overflows; +3 dB is a
    // note with a body, and the push macro lends it the rest when the
    // arrangement wants the moment exaggerated.
    bodyHz: 115,
    bodyDb: 3.0,
    bodyQ: 0.65,
    // A real compressor on the bass, working 3-4 dB, with an attack slow
    // enough to let the front of each note through and a release tied to the
    // beat. It is density, not the source of the body.
    comp: { threshold: -20, knee: 8, ratio: 2.2, attack: 0.018, release: 0.12 },
    // A low key and a low root stack the kick body and the bass in the same
    // octave. Rather than pulling the bass down everywhere, notes below the
    // reference give a little back, per octave — so a track in a low key is as
    // loud as one in a high key instead of louder (`patterns.ts` reads it).
    tiltRefHz: 48,
    lowTiltDb: 5.0,
    hpHz: 28, // below this a speaker makes heat, not sound
    hpQ: 0.7,
    attack: SUB.attack,
    decay: SUB.decay,
    sustain: SUB.sustain,
    bodyDecay: SUB.bodyDecay,
    bodyFloor: SUB.bodyFloor,
    glide: SUB.glide,
    openMult: SUB.openMult,
    openTime: SUB.openTime,
  },

  pluckBass: pluckBassRow.parameters,

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

  sawLead: sawLeadRow.parameters,

  fmBell: fmBellRow.parameters,

  karplusPluck: karplusPluckRow.parameters,

  formantPad: formantPadRow.parameters,

  clavKey: clavKeyRow.parameters,

  supersawPad: supersawPadRow.parameters,

  // --- the rest of the voices (round K4 of PLAN-KITCHEN) ---------------------
  //
  // Sixteen more instruments that no die can draw, and every one of them on a
  // level the table already has. The numbers below are the ones that decide
  // what each *is*; every declared loudness beside them, in the modules, is
  // written by `tools/test-voices-2.ts --bless` and never typed.

  pulseLead: pulseLeadRow.parameters,

  triLead: triLeadRow.parameters,

  subSoft: subSoftRow.parameters,

  subTri: subTriRow.parameters,

  sawPad: sawPadRow.parameters,

  fmGlass: fmGlassRow.parameters,

  fmEp: fmEpRow.parameters,

  fmPluck: fmPluckRow.parameters,

  marimba: marimbaRow.parameters,

  vibes: vibesRow.parameters,

  brightPiano: brightPianoRow.parameters,

  reedOrgan: reedOrganRow.parameters,

  vinylBed: vinylBedRow.parameters,

  sweepUp: sweepUpRow.parameters,

  grainPad: grainPadRow.parameters,

  wavePad: wavePadRow.parameters,

  // --- the drum kitchen (round K3 of PLAN-KITCHEN) ---------------------------
  //
  // Every instrument of the kitchen is a row since round R2 (`sounds/drum/`,
  // `sounds/noise/`), in the block it has always had, built by
  // `voices/drumkit.ts`'s `kitTopology` — so the numbers repeat: `seconds` is
  // how long the rendered body is and therefore the longest a hit can ring;
  // `variants` is how many tones are rendered and `variantCents` how far apart
  // they are; `t10` is the envelope's time to fall 10 dB, which is the unit the
  // benchmark states a hat's decay in; `trim` is the family trim, in the voice
  // and not in the level table, for the hats' reason — every measured room
  // writes its own levels and a change there would never reach the minute
  // somebody is listening to; `velBright` and `velDecay` are how much a harder
  // hit brightens and rings on; and the four `*Spread` numbers are the per-hit
  // dice, all of them off the strike time.
  conga: congaRow.parameters,
  bongo: bongoRow.parameters,
  snare: snareRow.parameters,
  rimshot: rimshotRow.parameters,
  hatTight: hatTightRow.parameters,
  hatLoose: hatLooseRow.parameters,
  hatSizzle: hatSizzleRow.parameters,
  ride: rideRow.parameters,
  crash: crashRow.parameters,
  tom: tomRow.parameters,
  cabasa: cabasaRow.parameters,
  tambourine: tambourineRow.parameters,
  cowbell: cowbellRow.parameters,
  woodblock: woodblockRow.parameters,
  // The two kit kicks, `sounds/drum/kickLong.json` and `kickPunch.json`, in
  // the blocks round K3 gave them; the build is `voices/kit-kick.ts`.
  kickLong: kickLongRow.parameters,
  kickPunch: kickPunchRow.parameters,

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
    voices: ENSEMBLE.voices, // MEASURED: 2-3 saws per chord note, 6-8 across a chord
    detuneCents: ENSEMBLE.detuneCents, // MEASURED: +-7-12 cents, which beats at the measured 0.3 Hz
    octaveLevel: ENSEMBLE.octaveLevel, // the desk above: brightness, not a second chord
    // MEASURED against the ratings log, which marked five growl scenes as
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
    voiceLevel: ENSEMBLE.voiceLevel,
    attack: ENSEMBLE.attack, // MEASURED median
    swellAttack: ENSEMBLE.swellAttack, // the 4% "synth swell" family, rolled rarely
    decay: ENSEMBLE.decay,
    sustain: ENSEMBLE.sustain, // MEASURED: -8.8 dB at the bar line, before the reverb
    swellSustain: ENSEMBLE.swellSustain, // MEASURED: the swell family dies by the bar line
    release: ENSEMBLE.release,
    // MEASURED (timbres.md): 1200 Hz landed the family's centroid at 620 Hz and
    // its 85 % rolloff at 851. Round EQ-2 opens the lid and leaves the pitch:
    // the same two poles and Q, the corner at 2200, measured on the pads alone
    // (seeds 1, 7, 29 and 31 at the house) as the centroid 570-660 -> 780-900 Hz
    // and the rolloff 980-1100 -> 1400-1580 Hz, 2-4 kHz up 12-20 dB (the grain),
    // and 100-600 Hz down 0.5-0.8 dB -- the resonance's skirt under the old
    // corner, not the body. The saws' own weight is under 1 kHz, so the review's
    // 1.2-1.6 kHz pad centroid is not a corner's to reach. The drones keep 1200
    // (`deep-house-places.ts` BED); `?strings=` listens to another corner.
    cutoffHz: ENSEMBLE.cutoffHz,
    q: ENSEMBLE.q, // gentle: a resonant peak in a held chord is a whistle
    hpHz: ENSEMBLE.hpHz, // low enough that the chord layer reaches into 120-250 Hz
    // MEASURED: chorus at 0.2-0.3 Hz; 15-30 ms is what an ensemble is.
    chorus: ENSEMBLE.chorus,
    ensembleDry: ENSEMBLE.ensembleDry,
    ensembleWet: ENSEMBLE.ensembleWet,
    vibratoHz: ENSEMBLE.vibratoHz,
    vibratoCents: ENSEMBLE.vibratoCents,
    vibratoHold: ENSEMBLE.vibratoHold, // nothing until the note has spoken
    vibratoRise: ENSEMBLE.vibratoRise,
    spread: ENSEMBLE.spread,
    // "Strings with various FX levels", MEASURED as the family's own spread:
    // wetness -5.3 to +0.2 dB and width -5.8 to -1.4 dB across its 16 tracks.
    wetDb: [-5.3, 0.2],
    wetBase: 0.62,
    widthDb: [-5.8, -1.4],
  },

  keys: {
    // MEASURED: 27% of tracks carry a 4-7 Hz tremolo; the electric piano
    // family has the highest AM prominence of the sustained families.
    hpHz: AMP.hpHz, // the keys reach down into the band the kick body tops out in
    tremoloHz: AMP.tremoloHz,
    tremoloDepth: AMP.tremoloDepth,
    tremoloPan: AMP.tremoloPan,
    rotaryHz: AMP.rotaryHz,
    rotaryDepth: AMP.rotaryDepth,
    // Per-family wetness spread, in dB around the send each family sits at.
    wetDb: { ep: [-2.7, -0.1], rhodes: [-3.5, -1.6], glass: [-3.5, -1.6], organ: [-2.0, 0.4], pluck: [-17.9, -4.8] },
    wetBase: { ep: 0.34, rhodes: 0.26, glass: 0.26, organ: 0.3, pluck: 0.22 },
  },

  // The piano. Synthesised, not sampled, and mostly heard as a room.
  piano: {
    attack: PIANO.attack,
    decayFast: PIANO.decayFast, // the first fall: most of the note
    sustainLevel: PIANO.sustainLevel,
    decaySlow: PIANO.decaySlow, // how long a string is allowed to ring at all
    ring: PIANO.ring, // how far past its written length a note rings
    partialLevel: PIANO.partialLevel,
    partialDecay: PIANO.partialDecay, // per partial index: the top of the note goes first
    stretchCents: PIANO.stretchCents, // string stiffness; a couple of cents up the stack
    unisonCents: PIANO.unisonCents,
    unisonLevel: PIANO.unisonLevel,
    hammerLevel: PIANO.hammerLevel,
    hammerHz: PIANO.hammerHz,
    brightMin: PIANO.brightMin,
    brightMax: PIANO.brightMax,
    hpHz: PIANO.hpHz,
    spread: PIANO.spread, // by register: the right hand sits out to the side
    dryLevel: PIANO.dryLevel, // the dry note is quiet; the hall is the instrument
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
  // 4%. Piano is a choice by ear, at about the strings weight: the study could not
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

/**
 * **Which row owns each block of this table** (E05 of the outside review of
 * 10-03): the block is the room-voiced copy of that one row's parameters, and
 * a row's `block` is a declared alias for it, not an optional string that
 * changes where the row's numbers are read from. A row may name a block only
 * where this table says the block is its own; a variant copied from it carries
 * no `block` and renders its own numbers (`sounds/SCHEMA.md`). Until then a
 * copy that kept the `block` it was copied with passed admission and played the
 * incumbent's numbers, whatever it said its own were.
 */
export const BLOCKS = {
  kick: kickRow.id,
  clap: clapRow.id,
  bass: subRow.id,
  pluckBass: pluckBassRow.id,
  sawLead: sawLeadRow.id,
  fmBell: fmBellRow.id,
  karplusPluck: karplusPluckRow.id,
  formantPad: formantPadRow.id,
  clavKey: clavKeyRow.id,
  supersawPad: supersawPadRow.id,
  pulseLead: pulseLeadRow.id,
  triLead: triLeadRow.id,
  subSoft: subSoftRow.id,
  subTri: subTriRow.id,
  sawPad: sawPadRow.id,
  fmGlass: fmGlassRow.id,
  fmEp: fmEpRow.id,
  fmPluck: fmPluckRow.id,
  marimba: marimbaRow.id,
  vibes: vibesRow.id,
  brightPiano: brightPianoRow.id,
  reedOrgan: reedOrganRow.id,
  vinylBed: vinylBedRow.id,
  sweepUp: sweepUpRow.id,
  grainPad: grainPadRow.id,
  wavePad: wavePadRow.id,
  conga: congaRow.id,
  bongo: bongoRow.id,
  snare: snareRow.id,
  rimshot: rimshotRow.id,
  hatTight: hatTightRow.id,
  hatLoose: hatLooseRow.id,
  hatSizzle: hatSizzleRow.id,
  ride: rideRow.id,
  crash: crashRow.id,
  tom: tomRow.id,
  cabasa: cabasaRow.id,
  tambourine: tambourineRow.id,
  cowbell: cowbellRow.id,
  woodblock: woodblockRow.id,
  kickLong: kickLongRow.id,
  kickPunch: kickPunchRow.id,
  // the piano's half of its block (round SOUNDS-R3); the composer's half —
  // its register, its sends' rolls, its arpeggio chances — stays beside it
  piano: pianoRow.id,
} as const;

/** A block of the instruments table that a sound row owns. */
export type SoundBlock = keyof typeof BLOCKS;

/**
 * **Which rows each voicing voices** (round SOUNDS-R3): a block of the settings
 * that is the room's word on several rows at once, or a row's own partial
 * voicing that a style writes, and so is no one row's copy — the counterpart
 * of `BLOCKS` for the dispatchers' timbre rows. A row names the ones that
 * voice it (`voicedBy`) and may name only those that list it here; at rest it
 * plays its own numbers (`soundFaults` holds the row to the table's where the
 * table holds the voicing), and a room that writes one of them writes it over
 * every row it lists.
 *
 *   strings                  the ensemble's body — five saws, the chorus, the
 *                            corner, the envelopes of both shapes — that the
 *                            strings pad and the swell are both made of; what
 *                            makes a row one or the other is its `shape`,
 *                            which is its own and no room's
 *   keys                     the amplifier every keyboard patch plays through:
 *                            the high-pass, the tremolo, the rotary, the edge a
 *                            place writes
 *   keyboardPatches.<name>   the voicing a style writes over one patch's tone
 *                            (house-v2's quieter electric piano); a partial, so
 *                            the instruments table holds none of them
 */
export const VOICINGS: Readonly<Record<string, readonly string[]>> = {
  strings: [stringsPadRow.id, stringsSwellRow.id],
  keys: [keysRhodesRow.id, keysGlassRow.id, keysEpRow.id, keysOrganRow.id, keysPluckRow.id],
  'keyboardPatches.rhodes': [keysRhodesRow.id],
  'keyboardPatches.glass': [keysGlassRow.id],
  'keyboardPatches.ep': [keysEpRow.id],
  'keyboardPatches.organ': [keysOrganRow.id],
  'keyboardPatches.pluck': [keysPluckRow.id],
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
