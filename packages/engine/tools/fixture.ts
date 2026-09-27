// A table with no music in it.
//
// The machine is handed a style and reads a settings table out of it, and the
// point of round W of PLAN-V1-NEXT is that the table is a *contract* and not
// one composer's file. So this is the contract's own witness: every field
// `Table` requires, with numbers chosen to be ordinary rather than to be deep
// house — a flat 120, straight eighths, one space, a gentle sidechain — and the
// instruments taken from `src/params.ts`, which is the engine's own.
//
// Nothing here is a measurement and nothing here is anybody's record. It exists
// so that `npm test -w @deep-house/engine` can resolve a room, build the graph
// and make a sound with no composer installed at all, which is the whole claim
// the package makes. If a field is added to the contract, this stops satisfying
// it and says so.

import { INSTRUMENTS } from '../src/params.ts';
import type { Table } from '../src/style.ts';

export const table = {
  tempo: { def: 120, slowMin: 118, slowMax: 122, fastMin: 124, fastMax: 128, slowChance: 0.5 },
  swing: 0.5,
  hatNudge: 0,
  key: { roots: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], minorChance: 0.5 },
  register: {
    subLow: 24, subCenter: 31, subHigh: 38, subCeiling: 43,
    chordLow: 55, chordHigh: 72, padLow: 50, padOctaveBelow: 57, padHigh: 76,
  },
  ...INSTRUMENTS,
  space: {
    sideHpHz: 100, sideHpQdB: 0.707, widthBase: 1, widthDepth: 0, widthRateHz: 0.1,
    padDriftHz: 0.1, padDriftCents: 0, hatPan: 0, hatHaas: 0, hatHaasPan: 0,
    hatHaasLevel: 0, clapPan: 0,
  },
  sends: {
    delayFeedback: 0.2, delayDotted: 0.75, delayLevel: 0.1,
    reverbSeconds: 1.2, reverbLevel: 0.1, reverbToneHz: 6000, reverbCorr: 0, reverbLowHz: 200,
    roomSeconds: 0.6, roomPreDelay: 0.01, roomLowHz: 200, roomHighHz: 8000, roomLevel: 0.1, roomCorr: 0,
    clapReverb: 0.1, hatReverb: 0.05,
    hallSeconds: 2, hallDecay: 3, hallToneHz: 5000, hallLowHz: 200,
    hallPreDelay: 0.02, hallLevel: 0.05, hallCorr: 0,
  },
  push: {
    satAmount: 0, satDrive: 0.3, bodyDb: 0, subDb: 0,
    buildBars: 8, dropBars: 1, dropLevel: 0, buildLevel: 0, markLevel: 0,
  },
  sidechain: { depthDb: -6, lowDepthDb: -6, attack: 0.005, minimumAt: 0.065, recoverBy: 0.9 },
  master: {
    gain: 1,
    // The ceiling is an **amplitude**, not a decibel: the worklet's own
    // parameter runs from 0.02 to 1 and 0.9 is about -0.9 dBFS. This table
    // said -1 from round W until round G, which the AudioParam clamped to its
    // minimum of 0.02 — so every render the machine's own suite made was held
    // to -34 dBFS and looked like a quiet mix rather than a misread unit. The
    // check that caught it is round G's first audition, which measures a
    // loudness rather than asking only whether anything came out at all.
    limiter: { ceiling: 0.9, lookaheadMs: 2, holdMs: 5, releaseMs: 60 },
    limiterFallbackDb: -2, trim: 1, targetLufs: -12,
    dcHz: 20, dcQ: 0.707,
    oversample: '4x' as OverSampleType, clipKnee: 0.8, clipDrive: 1.2,
    filterOpen: 20000, filterClosed: 300,
    glue: { threshold: -18, knee: 6, ratio: 2, attack: 0.01, release: 0.12, drive: 0 },
    airHz: 12000, airDb: 0,
    presenceHz: 3000, presenceDb: 0, presenceQ: 0.9,
    lowMidHz: 300, lowMidDb: 0, lowMidQ: 0.9,
    lowShelfHz: 90, lowShelfDb: 0,
    midHz: 1000, midDb: 0, midQ: 0.9,
    breakdownLiftDb: 0,
  },
  density: {
    weights: [{ v: 'medium', w: 1 }],
    bassNotes: { minimal: 1, medium: 2, busy: 3 },
    maxStabs: { minimal: 1, medium: 2, busy: 3 },
    bothHarmonicChance: { minimal: 0, medium: 0.5, busy: 1 },
    fxEveryBars: { minimal: 32, medium: 16, busy: 8 },
    sixteenthHats: { minimal: false, medium: false, busy: true },
  },
  loudness: {
    targetLufs: -12, clampDb: 3, slopeUp: 1, slopeDown: 1,
    intercept: -12, coef: {}, centre: {},
  },
  groove: {
    openHatChance: 0.5, sixteenthHatChance: 0, sixteenthHatLevel: 0.5,
    hatVelocityCv: 0, ghostClapChance: 0,
    bassFifthChance: 0, bassOctaveChance: 0, stabChance: 0.5, kickDropoutChance: 0,
  },
  harmony: {
    degreeWeights: { 0: 1 },
    chordBarsWeights: [{ v: 2, w: 1 }],
    loopBarsWeights: [{ v: 4, w: 1 }],
    ninthChance: 0, eleventhChance: 0,
  },
  arrangement: { breakdownBars: 16, breakdownEvery: 64, kickPresentTarget: 0.75, riserChance: 0 },
} satisfies Table;

export default table;
