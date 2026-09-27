// A restrained two-player ensemble for focused house: a brushed high layer
// and occasional hand/wood replies. These are authored cells, not a new mine.
import type { RhythmDevelopmentPolicy, RhythmPhase } from '../development-rhythm.ts';
import type { RhythmPart } from '../parts/rhythm.ts';

type Cell = [number, number[], number[]];
const part = (id: string, families: string[], properties: RhythmPart['properties'],
  cells: Record<RhythmPhase, Cell[]>) => ({id,cells:Object.fromEntries(Object.entries(cells).map(([phase, rows])=>
    [phase,rows.map(([bars,steps,accents])=>({bars,steps,accents,families,properties,
      feel:{swing:.54,delay:{beats:.008},timing:{beats:.012},dynamics:.16}}))])) as Record<RhythmPhase,RhythmPart[]>});

export const rhythmDevelopment: RhythmDevelopmentPolicy = {
  role:'sixteenth',phraseBars:8,movingAfter:.5,approachBars:4,pickupBars:1,
  // The already measured wooden voice is admitted only to this proposal.
  // Other zero-weight candidates stay excluded. Existing lane trims apply.
  candidateWeights:{woodblock:.33,tom:0},
  parts:[
    part('brush',['noise'],{struck:true,holdMax:.01,brightnessMin:4000,brightnessMax:7000},{
      space:[[2,[6,14,22,30],[.12,.08,.14,.09]],[2,[2,14,22,30],[.09,.12,.1,.14]]],
      motion:[[2,[2,6,10,14,18,22,26,30],[.1,.17,.1,.14,.11,.19,.1,.16]]],
      approach:[[2,[2,6,10,14,18,22,26,28,30,31],[.1,.17,.11,.18,.11,.19,.12,.09,.17,.08]]],
      peak:[[2,[2,6,10,14,18,22,26,30],[.13,.19,.11,.17,.14,.2,.12,.18]]],
      breath:[[4,[6,22,38],[.09,.1,.1]]],
      pickup:[[1,[2,6,10,12,14,15],[.1,.12,.13,.09,.18,.08]]],
    }),
    part('reply',['drum'],{struck:true,holdMax:.03,brightnessMin:1200,brightnessMax:3500},{
      space:[[4,[22,54],[.19,.16]],[4,[14,46],[.16,.2]]],
      motion:[[2,[6,14,22],[.2,.16,.23]],[2,[2,18,30],[.17,.2,.16]]],
      approach:[[2,[6,14,22,26,30],[.19,.22,.2,.15,.24]]],
      peak:[[2,[2,6,14,18,22,30],[.17,.25,.19,.17,.23,.21]]],
      breath:[[4,[46],[.13]]],
      pickup:[[1,[10,13,14],[.17,.13,.22]]],
    }),
  ],
  // Only the last bar of an unpinned short bridge: three straight anchors,
  // then an eighth-note pickup. The regular groove keeps its four-floor grid.
  kickPickup:{steps:[0,4,8,14],accents:[.9,.86,.88,.65]},
};
