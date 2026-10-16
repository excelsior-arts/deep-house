// Listening candidates, not ordinary randomizer weights. Keep timing and
// velocity independent of colour; gainDb is the measured comparison trim.
// 2026-09-22: same four-bar solo at 48 kHz, matched to familiar at +6 dB.
// These trims are for this listening request, not replacement lane calibration.
import type { SoundCharacters } from '../parts/sound.ts';

const skin = (headHz:number, bend:number, damping:number, headCutoff:number,
  modeLevel:number, modeDecay:number, handLevel:number, handHz:number, handDecay:number,
  modes=1, headLevel=.52) => ({
  requires: ['headHz','bend','bendSeconds','damping','headCutoff','headLevel',
    'modeRatio','modeLevel','modeDecay','skin','handLevel','handHz','handDecay'],
  params: {headHz,bend,bendSeconds:.012,damping,headCutoff,headLevel,
    modeRatio:1.59,modeLevel,modeDecay,skin:modes,handLevel,handHz,handDecay},
  gainDb:6,
});

export const handCharacters: NonNullable<SoundCharacters['rhythm']> = {
  // The existing sound at the same raised comparison level is the control.
  familiar: {requires:['headHz'],params:{},gainDb:6},
  'warm-open': {...skin(210,1.025,.17,2300,.34,.16,.46,1900,.018), gainDb:5.8487},
  'low-round': {...skin(155,1.02,.22,1800,.30,.20,.38,1400,.020), gainDb:4.7948},
  'dry-palm': {...skin(205,1.012,.075,2100,.42,.075,.66,1800,.010), gainDb:9.4543},
  'soft-skin': {...skin(235,1.015,.12,3000,.36,.12,.82,2100,.024), gainDb:7.7986},
  'muted-touch': {...skin(180,1.008,.050,1500,.26,.045,.56,1300,.014,.6,.38), gainDb:13.8745},
  'hollow-shell': {...skin(190,1.018,.18,2800,.58,.22,.32,2400,.012,1,.32), gainDb:8.5834},
  'crisp-hand': {...skin(260,1.035,.085,4200,.42,.09,1.15,3300,.008,.8,.36), gainDb:12.7812},
  'dark-skin': {...skin(170,1.01,.145,1000,.40,.13,.82,950,.032,.8,.46), gainDb:7.2697},
};

// Eugene retained colours 2, 3, 5 and 8 on 2026-09-22. A coherent hand part
// can use all four: open/low bodies, quiet touches and occasional sharp slaps.
// Keep their accepted sound and matched trims; the phrase owns dynamics.
//
// **The heel** (10-13, the hand grammar, `deep-house-v2-hand-phrases.json`): the palm's ghost between the open
// strokes, the low round body damped short (60 ms against its 220) with the hand's noise held under it. It is the
// low round colour struck dead, at its own matched trim; the four kept colours are unchanged.
//
// **The part's level** (his ear 10-13: "congas too quiet"; on house seed 35 raised 3 dB, "still barely hear conga").
// Measured during active strikes (the 60 ms after each onset, the hands alone against the kick alone at its own
// onsets, 20 s windows), the hand rows' open strokes stood 21-22 dB under the kick at Gleam high (seeds 2 and 8) and
// 16.5-18 under it at Ember 0.2-0.3 (the bongo, seeds 15 and 40), 12-14 dB under the rest of the mix in their own
// windows. The part's `levelDb` lifts every stroke of the conversation alike over its colour's matched trim, so the
// phrase keeps its own dynamics and each colour its measured trim: the open tones 8-13 dB under the kick, at or near
// the rest of the mix between the chords.
const heel = {params:{...handCharacters['low-round'].params, damping:.06, handLevel:.25, headCutoff:1200},
  gainDb:handCharacters['low-round'].gainDb};
export const handConversation = {
  ...handCharacters['warm-open'],
  levelDb: 9,
  strokes: {...Object.fromEntries(Object.entries({tone:'warm-open',low:'low-round',touch:'soft-skin',slap:'crisp-hand'})
    .map(([stroke,name])=>[stroke,{params:handCharacters[name].params,gainDb:handCharacters[name].gainDb}])), heel},
};
