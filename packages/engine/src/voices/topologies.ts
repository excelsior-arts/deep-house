// The topologies the engine knows, by the name a row names one with.
//
// A topology is a module under `voices/` that renders a row (`sound.ts`):
// `render(row)` is the voice function, `parameters` the exact fields the row
// carries, `cost` the class a new row of it starts at. The engine knows these
// and no sound of its own: what a sound *is* — its numbers — is a row under
// `packages/engine/sounds/`, and `voices/index.ts` lists the rows in the
// order the record is heard in, where the modules used to stand.
//
// Round R1 brought the first five with the kicks and the basses; round R2 the
// rest of the kitchen (notes/rounds/sounds-r2.md); round SOUNDS-R3 the four the
// record's own roles were still modules for — the ensemble, the keyboard, the
// piano and the vocal — and the one that is not a sound but a door to several:
// `dispatch`, an event name standing for the rows its timbres render through
// (notes/rounds/sounds-r3.md).

import type { Topology } from './sound.ts';
import { KICK } from './kick.ts';
import { KIT_KICK } from './kit-kick.ts';
import { SUB } from './sub.ts';
import { REESE } from './reese.ts';
import { LINE_303 } from './line-303.ts';
import { MEMBRANE } from './congas.ts';
import { SNARE } from './snare.ts';
import { KIT_HAT } from './hats-kit.ts';
import { CYMBAL } from './cymbals.ts';
import { TOM } from './toms.ts';
import { SHAKEN, JINGLE, BELL, BLOCK } from './perc.ts';
import { CLAP } from './clap.ts';
import { PLUCK_BASS } from './pluck-bass.ts';
import { SAW_LEAD } from './saw-lead.ts';
import { FM_BELL } from './fm-bell.ts';
import { KARPLUS } from './karplus-pluck.ts';
import { FORMANT_PAD } from './formant-pad.ts';
import { CLAV } from './clav-key.ts';
import { SUPERSAW_PAD } from './supersaw-pad.ts';
import { SAW_PAD } from './saw-pad.ts';
import { BRIGHT_PIANO, REED_ORGAN } from './keys-2.ts';
import { WAVETABLE_PAD } from './wave-pad.ts';
import { SHIMMER_PAD } from './shimmer-pad.ts';
import { SUPERSAW_LEAD } from './supersaw-lead.ts';
import { SIREN } from './siren.ts';
import { ORGAN_STAB } from './organ-stab.ts';
import { PULSE_LEAD, TRI_LEAD } from './wave-leads.ts';
import { VINYL, GRAIN_CLOUD, NOISE_SWEEP } from './texture.ts';
import { HAT_LADDER } from './hats.ts';
import { FM_KEY } from './fm-keys.ts';
import { MALLET } from './mallets.ts';
import { BOTTOM } from './subs.ts';
import { NOISE_RISE, NOISE_FALL, REVERSE_SWELL, THUMP } from './fx.ts';
import { STRINGS } from './strings.ts';
import { KEYS } from './keys.ts';
import { DISPATCH } from './dispatch.ts';
import { PIANO } from './piano.ts';
import { WORDLESS_VOCAL } from './wordless-vocal.ts';

export const TOPOLOGIES: Readonly<Record<string, Topology>> = Object.freeze({
  [KICK.id]: KICK,
  [KIT_KICK.id]: KIT_KICK,
  [SUB.id]: SUB,
  [REESE.id]: REESE,
  [LINE_303.id]: LINE_303,
  [MEMBRANE.id]: MEMBRANE,
  [SNARE.id]: SNARE,
  [KIT_HAT.id]: KIT_HAT,
  [CYMBAL.id]: CYMBAL,
  [TOM.id]: TOM,
  [SHAKEN.id]: SHAKEN,
  [JINGLE.id]: JINGLE,
  [BELL.id]: BELL,
  [BLOCK.id]: BLOCK,
  [CLAP.id]: CLAP,
  [PLUCK_BASS.id]: PLUCK_BASS,
  [SAW_LEAD.id]: SAW_LEAD,
  [FM_BELL.id]: FM_BELL,
  [KARPLUS.id]: KARPLUS,
  [FORMANT_PAD.id]: FORMANT_PAD,
  [CLAV.id]: CLAV,
  [SUPERSAW_PAD.id]: SUPERSAW_PAD,
  [SAW_PAD.id]: SAW_PAD,
  [BRIGHT_PIANO.id]: BRIGHT_PIANO,
  [REED_ORGAN.id]: REED_ORGAN,
  [WAVETABLE_PAD.id]: WAVETABLE_PAD,
  [SHIMMER_PAD.id]: SHIMMER_PAD,
  [SUPERSAW_LEAD.id]: SUPERSAW_LEAD,
  [SIREN.id]: SIREN,
  [ORGAN_STAB.id]: ORGAN_STAB,
  [PULSE_LEAD.id]: PULSE_LEAD,
  [TRI_LEAD.id]: TRI_LEAD,
  [VINYL.id]: VINYL,
  [GRAIN_CLOUD.id]: GRAIN_CLOUD,
  [NOISE_SWEEP.id]: NOISE_SWEEP,
  [HAT_LADDER.id]: HAT_LADDER,
  [FM_KEY.id]: FM_KEY,
  [MALLET.id]: MALLET,
  [BOTTOM.id]: BOTTOM,
  [NOISE_RISE.id]: NOISE_RISE,
  [NOISE_FALL.id]: NOISE_FALL,
  [REVERSE_SWELL.id]: REVERSE_SWELL,
  [THUMP.id]: THUMP,
  [STRINGS.id]: STRINGS,
  [KEYS.id]: KEYS,
  [DISPATCH.id]: DISPATCH,
  [PIANO.id]: PIANO,
  [WORDLESS_VOCAL.id]: WORDLESS_VOCAL,
});
