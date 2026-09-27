// Focus-listening proposal. Opt in with development=phrased until reviewed.
import type { DevelopmentPolicy } from '../development.ts';
import { rhythmDevelopment } from './deep-house-rhythm-development.ts';

export const development: DevelopmentPolicy = {
  when: { drums: true, kits: ['fourFloor'] },
  themeBarsMax: 128,
  kinds: ['main', 'drop'],
  maxSectionBars: 32,
  phraseBars: 8,
  bridgeKind: 'bridge',
  bridge: {
    label: 'short bridge',
    layers: () => ({ kick: false, hatClosed: true, hatOpen: false, sixteenths: false,
      clap: false, bass: false, keys: false, pad: true, fx: false }),
    filter: [6500, 11000],
  },
  bridgeBars: 4,
  withdrawGates: ['hatOpen', 'sixteenths', 'clap'],
  rhythm: rhythmDevelopment,
  // Authored listening proposal, not calibrated bird probabilities. The theme's
  // actual harmonic character selects these weights after part replacement.
  shape: {
    grooveKind: 'main', grooveKinds: ['main','drop'],
    restKinds: ['bridge','breakdown'], transitionKinds: ['build'], restKind: 'bridge',
    emptyRestBars: 4, supportedRestBars: 8,
    restAnchorRoles: ['kick'],
    finishClosingPhrase: true,
    prepareBars: 8, plateauBars: 16, settleBars: 8,
    contours: [
      {id:'level',weight:{struck:2,sustained:3},peaks:[]},
      {id:'late',weight:{struck:6,sustained:5},peaks:[[.58,.86]]},
      {id:'two-lifts',weight:{struck:2,sustained:2},peaks:[[.15,.50],[.58,.86]]},
    ],
    flow: [
      {withdraw:['hatOpen','sixteenths'],filter:12000},
      {withdraw:['sixteenths'],filter:13500},
    ],
    prepare: {withdraw:['hatOpen','sixteenths'],filter:12000},
    plateau: {withdraw:[],filter:15000},
    settle: {withdraw:['hatOpen','sixteenths'],filter:12000},
    // A supporting pedal follows the sounding chord. Sequencing toward the
    // next root for an entire statement inverted the support under the keys.
    // Explicit bass motifs retain their own development grammar.
    bass: {variationBars:8,moves:[{v:'repeat',w:1}]},
  },
};
