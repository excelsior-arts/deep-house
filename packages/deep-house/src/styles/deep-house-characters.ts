// Authored taste settings from listening rounds 6–8. The engine implements
// these controls; this style owns their musical interpretation. Preserve the
// values for accepted recipe replay. Future tuning is a sound revision.
import type { SoundCharacters } from '../parts/sound.ts';
import type { KeyboardPatches } from '@deep-house/engine/style';
import { handCharacters, handConversation } from './deep-house-hand-characters.ts';

// Focus listening, 09-21: a steady, warm chord voice replaces the old bright
// tine and trembling amplifier. Authored for listening, not a new acoustic fit.
// The score and envelope stay intact; the simpler harmonic body carries it.
export const keyboardPatches: KeyboardPatches = {
  ep: { ratio: 2, index: [.45, .55], indexDecay: .35, tine: 0,
    cutoff: 1500, det: 2, formant: [2400, 1.5], tremolo: false },
};

// Prototype sung colours share the same restrained phrase envelope. They are
// explicit characters for listening; ordinary family probabilities do not draw
// them. The excitation is generated, not a recording of a singer.
const sung = (tilt:number, scale:number, width:number, vowel:[number,number], breath:number, open:number) => ({
  requires: ['sourceTilt','formantScale','formantWidth','vocalDetune','open','fadeCurve','vowelFrom','vowelTo','vowelSeconds','breath','vibratoCents','dry','attack','release'],
  treatment: 'none' as const,
  params: { sourceTilt:[tilt,tilt,tilt],formantScale:[scale,scale,scale],formantWidth:[width,width,width],
    vocalDetune:[0,0,0],open:[open,open,open],fadeCurve:[1,1,1],
    vowelFrom:[vowel[0],vowel[0],vowel[0]],vowelTo:[vowel[1],vowel[1],vowel[1]],
    breath:[breath,breath*.65,breath],vibratoCents:[0,0,0],dry:[.8,.8,.8],
    reverb:[.1,.12,.16],delay:[0,0,0],hall:[0,0,0],room:[0,0,0] } as Record<string,[number,number,number]>,
  beats: {attack:[.22,.12,.2],release:[.55,.45,.8],vowelSeconds:[1.4,1.8,1.6]} as Record<string,[number,number,number]>,
});

export const characters: SoundCharacters = {
  rhythm: {...handCharacters, 'hand-conversation':handConversation},
  phrases: {
    ringing: {
      requires: ['sustainLevel','decayFast','partialDecay','unisonCents','hammerLevel','harmonicBody','ring'],
      treatment: 'none',
      params: { sustainLevel: [.72,.72,.72], partialDecay: [.16,.16,.16],
        unisonCents: [1.8,1.8,1.8], hammerLevel: [.12,.12,.12], harmonicBody: [1,1,1] },
      beats: { decayFast: [.85,.85,.85], ring: [7,7,7] },
    },
    hummed: sung(2.4,.72,1.35,[.95,.95],.018,1400),
    rounded: sung(1.7,.9,1.15,[1,1],.025,2000),
    voiced: sung(1.55,.92,1.15,[.05,.12],.03,2800),
    airy: sung(2,.95,1.5,[.8,.95],.13,2400),
    shaded: sung(1.85,.85,1.1,[.8,.35],.035,2000),
    choral: sung(1.4,1.15,1.3,[.35,.65],.04,3200),
    mellow: sung(2.1,1.05,1.65,[.55,.7],.045,2200),
    full: {
      requires: ['sustainLevel','decayFast','partialDecay','unisonCents','hammerLevel','harmonicBody','ring'],
      treatment: 'none',
      params: { sustainLevel: [.68,.68,.68], partialDecay: [.18,.18,.18],
        unisonCents: [1.8,1.8,1.8], hammerLevel: [.18,.18,.18], harmonicBody: [1,1,1] },
      beats: { decayFast: [.65,.65,.65], ring: [3,3,3] },
    },
    steady: {
      requires: ['attack','release','open','motion','fadeCurve'],
      treatment: 'none',
      params: { open: [850,1050,800], motion: [0,0,0], fadeCurve: [1,1,1],
        reverb: [.18,.2,.26], delay: [0,0,0] },
      beats: { attack: [.45,.28,.42], release: [1,.8,1.4] },
    },
    floating: {
      requires: ['attack','release','open'],
      params: { open: [850,1050,800], reverb: [.18,.2,.26], delay: [0,0,0] },
      beats: { attack: [.32,.2,.3], release: [.8,.65,1.15] },
    },
    resonant: {
      requires: ['sustainLevel','decayFast','partialDecay','unisonCents','hammerLevel','harmonicBody','ring'],
      params: { sustainLevel: [.58,.58,.58], partialDecay: [.3,.3,.3],
        unisonCents: [2.2,2.2,2.2], hammerLevel: [.16,.16,.16], harmonicBody: [.9,.9,.9] },
      beats: { decayFast: [.5,.5,.5], ring: [2.6,2.6,2.6] },
    },
    intimate: {
      requires: ['vowelFrom','vowelTo','vowelSeconds','breath','vibratoCents','vibratoHz','vibratoDelay','dry','attack','release'],
      params: { vowelFrom: [.05,.35,.7], vowelTo: [.65,1,.15], breath: [.1,.035,.14],
        vibratoCents: [2,6,4], vibratoHz: [4.5,4.8,4.5], dry: [.7,.8,.65],
        reverb: [.04,.05,.07], delay: [0,0,0], hall: [0,0,0], room: [0,0,0] },
      beats: { attack: [.16,.045,.1], release: [.1,.18,.35], vowelSeconds: [.6,.8,1.1], vibratoDelay: [.35,.6,.25] },
    },
    breathy: {
      requires: ['vowelFrom','vowelTo','vowelSeconds','breath','vibratoCents','vibratoHz','vibratoDelay','dry','attack','release'],
      params: { vowelFrom: [.05,.35,.7], vowelTo: [.65,1,.15], breath: [.1,.035,.14],
        vibratoCents: [2,6,4], vibratoHz: [4.5,4.8,4.5], dry: [.72,.85,.5],
        reverb: [.5,.65,.9], delay: [.06,.08,.24] },
      beats: { attack: [.16,.045,.1], release: [.1,.18,.55], vowelSeconds: [.6,.8,1.1], vibratoDelay: [.35,.6,.25] },
    },
  },
  presence: { backgroundDb: -9 },
  ambience: {
    intimate: { room: .12, reverb: .12, delay: 0 },
    spacious: { room: .12, reverb: .85, delay: .12 },
    distant: { room: .06, reverb: 0, delay: 0, background: .8 },
  },
  tone: {
    kick: { rounded: { requires: ['bodyLp', 'partialLevel'], params: { bodyLp: 110, partialLevel: .025, startHz: 58, endHz: 40 } } },
    bassline: {
      full: { requires: ['bodyFloor', 'bodyOctave'], params: { bodyFloor: .42, bodyOctave: .18, release: .025 } },
      defined: { requires: ['bodyFloor'], params: { bodyFloor: .16, drive: .1, even: .08, release: .025 } },
    },
  },
  // The values the pitched-part player carried typed into its loop until the
  // composer fix round of 09-22, moved here unchanged: the root folded into
  // the octave above middle C, notes held inside 48-96, a short struck note 70 %
  // of the gap to the next onset between 30 and 350 ms, and a light, wet send.
  figure: {
    home: [60, 71], register: [48, 96],
    struck: { floor: .03, ceiling: .35, share: .7 },
    sends: { delay: .08, reverb: .3, hall: .3 },
    // Off, and it is Eugene's to turn on: 'statement' keeps a long phrase in
    // one octave across its chord changes. It changes the approved piano
    // studies' sound, so nothing is re-blessed until he has heard it.
    fold: 'bar',
  },
  pulse: {
    register: [72, 83], articulation: { indexMul: .06, cutoffMul: .22, delay: 0, reverb: 0, hall: 0, room: 0 },
    space: { immersed: { dry: 0, immersed: .9 }, distant: { dry: .18, background: 3.2 } },
  },
  returns: {
    background: { seconds: 4.8, preDelay: .065, lowHz: 260, highHz: 1400, echoBeats: .75, feedback: .35, echoLevel: .2, plateLevel: .32, diffuseOnly: false, tilt: .06, correlation: .35 },
    immersed: { seconds: 7.5, preDelay: .025, lowHz: 260, highHz: 950, echoBeats: .75, feedback: .28, echoLevel: .35, plateLevel: .65, diffuseOnly: true, tilt: .06, correlation: .35, build: .04, decay: 2 },
  },
};
