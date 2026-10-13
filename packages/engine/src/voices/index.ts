// The voice registry. A voice is (ctx, out, time, p, settings) and knows
// nothing about scheduling, so the same function serves the live context and
// the offline render.
//
// The fifth argument is round C's: the resolved, frozen settings the sound is
// being made under, handed down from the deck, the player or the render that
// owns them. A voice that reads nothing from the table — the four effects —
// simply does not declare it.
//
// Since round B there is one ordered list — `REGISTRY` — and every table
// below it is derived from that list rather than kept in step by hand. Each
// entry is the descriptor the voice's own module declares next to the function
// that makes the sound (see `descriptor.ts` for what a descriptor may say).
//
// **The registry is a lookup table and never a pool.** No die reads it: the
// dice read the style's frozen candidate lists in the composer's
// `catalogue.ts`, which name their entries. So an instrument can be registered here — a whole
// descriptor, dormant, with nothing in any candidate list naming it — and not
// one v1 seed moves. That is the property round B exists to establish, and
// `tools/check.ts` checks the tables; the proof itself is in
// notes/archive/2026-09-v1-stretch/rounds/round-b.md.

import { VOICE_COST_UNITS as VOICE_COST_UNITS_TABLE, knobFaults as knobFaultsOf, controlFaults, LAZY_RETURNS } from './descriptor.ts';
import type {
  Descriptor, Knobs, LazyReturn, NoteParams, PrepareHook, PrepareOptions, TimbreFacts, VoiceBus, VoiceRenderer,
} from './descriptor.ts';
import { BLOCKS, INSTRUMENTS } from '../params.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { holdStrings, stringsAttack } from './strings.ts';
import { pianoCacheStats } from './piano.ts';
import { pickCacheSize } from './pluck-bass.ts';
import { stringCacheSize } from './karplus-pluck.ts';
import { holdFormantPad } from './formant-pad.ts';
import { holdSupersawPad } from './supersaw-pad.ts';
import { holdGrainPad } from './texture.ts';
import { holdWavePad } from './wave-pad.ts';
import { asSound, admittedOf, provePatch, soundDescriptor, voicedPatch } from './sound.ts';
import type { SoundRow } from './sound.ts';
import { TOPOLOGIES } from './topologies.ts';
import { targetOf, timbreOf } from './dispatch.ts';
// The sounds that are rows (round R1): read here where their modules were
// imported, and standing in `REGISTRY` where those stood.
import kickRow from '../../sounds/drum/kick.json' with { type: 'json' };
import kickLongRow from '../../sounds/drum/kickLong.json' with { type: 'json' };
import kickPunchRow from '../../sounds/drum/kickPunch.json' with { type: 'json' };
import subRow from '../../sounds/bass/sub.json' with { type: 'json' };
import reeseBassRow from '../../sounds/bass/reeseBass.json' with { type: 'json' };
import reeseDrivenRow from '../../sounds/bass/reeseDriven.json' with { type: 'json' };
import reeseDeepRow from '../../sounds/bass/reeseDeep.json' with { type: 'json' };
import kickTightRow from '../../sounds/drum/kickTight.json' with { type: 'json' };
import snareDryRow from '../../sounds/drum/snareDry.json' with { type: 'json' };
import kickPunchHighRow from '../../sounds/drum/kickPunchHigh.json' with { type: 'json' };
import snareCrackRow from '../../sounds/drum/snareCrack.json' with { type: 'json' };
import snareGhostRow from '../../sounds/drum/snareGhost.json' with { type: 'json' };
import hatShutRow from '../../sounds/noise/hatShut.json' with { type: 'json' };
import hatSoftRow from '../../sounds/noise/hatSoft.json' with { type: 'json' };
import kickKnockRow from '../../sounds/drum/kickKnock.json' with { type: 'json' };
import reeseWobbleRow from '../../sounds/bass/reeseWobble.json' with { type: 'json' };
import reeseSubRow from '../../sounds/bass/reeseSub.json' with { type: 'json' };
import line303Row from '../../sounds/bass/line303.json' with { type: 'json' };
import congaRow from '../../sounds/drum/conga.json' with { type: 'json' };
import bongoRow from '../../sounds/drum/bongo.json' with { type: 'json' };
import snareRow from '../../sounds/drum/snare.json' with { type: 'json' };
import rimshotRow from '../../sounds/drum/rimshot.json' with { type: 'json' };
import hatTightRow from '../../sounds/noise/hatTight.json' with { type: 'json' };
import hatLooseRow from '../../sounds/noise/hatLoose.json' with { type: 'json' };
import hatSizzleRow from '../../sounds/noise/hatSizzle.json' with { type: 'json' };
import rideRow from '../../sounds/noise/ride.json' with { type: 'json' };
import crashRow from '../../sounds/noise/crash.json' with { type: 'json' };
import tomRow from '../../sounds/drum/tom.json' with { type: 'json' };
import cabasaRow from '../../sounds/noise/cabasa.json' with { type: 'json' };
import tambourineRow from '../../sounds/noise/tambourine.json' with { type: 'json' };
import cowbellRow from '../../sounds/drum/cowbell.json' with { type: 'json' };
import woodblockRow from '../../sounds/drum/woodblock.json' with { type: 'json' };
import clapRow from '../../sounds/drum/clap.json' with { type: 'json' };
import pluckBassRow from '../../sounds/bass/pluckBass.json' with { type: 'json' };
import sawLeadRow from '../../sounds/keyboard/sawLead.json' with { type: 'json' };
import fmBellRow from '../../sounds/keyboard/fmBell.json' with { type: 'json' };
import karplusPluckRow from '../../sounds/keyboard/karplusPluck.json' with { type: 'json' };
import formantPadRow from '../../sounds/ensemble/formantPad.json' with { type: 'json' };
import clavKeyRow from '../../sounds/keyboard/clavKey.json' with { type: 'json' };
import supersawPadRow from '../../sounds/ensemble/supersawPad.json' with { type: 'json' };
import sawPadRow from '../../sounds/ensemble/sawPad.json' with { type: 'json' };
import brightPianoRow from '../../sounds/keyboard/brightPiano.json' with { type: 'json' };
import reedOrganRow from '../../sounds/keyboard/reedOrgan.json' with { type: 'json' };
import wavePadRow from '../../sounds/ensemble/wavePad.json' with { type: 'json' };
import shimmerPadRow from '../../sounds/ensemble/shimmerPad.json' with { type: 'json' };
import supersawLeadRow from '../../sounds/keyboard/supersawLead.json' with { type: 'json' };
import sirenRow from '../../sounds/effect/siren.json' with { type: 'json' };
import organStabRow from '../../sounds/keyboard/organStab.json' with { type: 'json' };
import pulseLeadRow from '../../sounds/keyboard/pulseLead.json' with { type: 'json' };
import triLeadRow from '../../sounds/keyboard/triLead.json' with { type: 'json' };
import vinylBedRow from '../../sounds/noise/vinylBed.json' with { type: 'json' };
import grainPadRow from '../../sounds/ensemble/grainPad.json' with { type: 'json' };
import sweepUpRow from '../../sounds/effect/sweepUp.json' with { type: 'json' };
import hatClosedRow from '../../sounds/noise/hatClosed.json' with { type: 'json' };
import hatOpenRow from '../../sounds/noise/hatOpen.json' with { type: 'json' };
import shakerRow from '../../sounds/noise/shaker.json' with { type: 'json' };
import fmGlassRow from '../../sounds/keyboard/fmGlass.json' with { type: 'json' };
import fmEpRow from '../../sounds/keyboard/fmEp.json' with { type: 'json' };
import fmPluckRow from '../../sounds/keyboard/fmPluck.json' with { type: 'json' };
import marimbaRow from '../../sounds/keyboard/marimba.json' with { type: 'json' };
import vibesRow from '../../sounds/keyboard/vibes.json' with { type: 'json' };
import subSoftRow from '../../sounds/bass/subSoft.json' with { type: 'json' };
import subTriRow from '../../sounds/bass/subTri.json' with { type: 'json' };
import riserRow from '../../sounds/effect/riser.json' with { type: 'json' };
import sweepDownRow from '../../sounds/effect/sweepDown.json' with { type: 'json' };
import swellRow from '../../sounds/effect/swell.json' with { type: 'json' };
import impactRow from '../../sounds/effect/impact.json' with { type: 'json' };
// ...and round SOUNDS-R3's: the record's own roles, the last four that were
// modules — two of them dispatchers over the rows their timbres render through.
import padRow from '../../sounds/ensemble/pad.json' with { type: 'json' };
import keysRow from '../../sounds/keyboard/keys.json' with { type: 'json' };
import pianoRow from '../../sounds/keyboard/piano.json' with { type: 'json' };
import wordlessVocalRow from '../../sounds/vocal/wordlessVocal.json' with { type: 'json' };
import stringsPadRow from '../../sounds/ensemble/stringsPad.json' with { type: 'json' };
import stringsSwellRow from '../../sounds/ensemble/stringsSwell.json' with { type: 'json' };
import keysRhodesRow from '../../sounds/keyboard/keysRhodes.json' with { type: 'json' };
import keysGlassRow from '../../sounds/keyboard/keysGlass.json' with { type: 'json' };
import keysEpRow from '../../sounds/keyboard/keysEp.json' with { type: 'json' };
import keysOrganRow from '../../sounds/keyboard/keysOrgan.json' with { type: 'json' };
import keysPluckRow from '../../sounds/keyboard/keysPluck.json' with { type: 'json' };
// ...and round LIQUID-KEYS's: soft keyboards for a backdrop (and a haze to layer
// under one), candidates for his pick on the keys lab page, admitted by no part yet.
import pianoFeltRow from '../../sounds/keyboard/pianoFelt.json' with { type: 'json' };
import pianoUprightRow from '../../sounds/keyboard/pianoUpright.json' with { type: 'json' };
import pianoWornRow from '../../sounds/keyboard/pianoWorn.json' with { type: 'json' };
import pianoMellowRow from '../../sounds/keyboard/pianoMellow.json' with { type: 'json' };
import keysSuitcaseRow from '../../sounds/keyboard/keysSuitcase.json' with { type: 'json' };
import keysReedRow from '../../sounds/keyboard/keysReed.json' with { type: 'json' };
import fmEpSoftRow from '../../sounds/keyboard/fmEpSoft.json' with { type: 'json' };
import fmEpGlassRow from '../../sounds/keyboard/fmEpGlass.json' with { type: 'json' };
import malletSoftRow from '../../sounds/keyboard/malletSoft.json' with { type: 'json' };
import padHazeRow from '../../sounds/ensemble/padHaze.json' with { type: 'json' };
// ...and its second round's eight: more pianos and electric pianos to pick from,
// and a sine to double a piano with, admitted by no part yet.
import pianoCloseRow from '../../sounds/keyboard/pianoClose.json' with { type: 'json' };
import pianoMuteRow from '../../sounds/keyboard/pianoMute.json' with { type: 'json' };
import pianoConcertRow from '../../sounds/keyboard/pianoConcert.json' with { type: 'json' };
import pianoCassetteRow from '../../sounds/keyboard/pianoCassette.json' with { type: 'json' };
import pianoElectricRow from '../../sounds/keyboard/pianoElectric.json' with { type: 'json' };
import keysTineDarkRow from '../../sounds/keyboard/keysTineDark.json' with { type: 'json' };
import keysReedAmpRow from '../../sounds/keyboard/keysReedAmp.json' with { type: 'json' };
import fmSineLayerRow from '../../sounds/keyboard/fmSineLayer.json' with { type: 'json' };
// liquid-space (10-11): the dark air the surface row lays under the exposed passages, the vinyl topology on a narrow band.
import airBedRow from '../../sounds/noise/airBed.json' with { type: 'json' };
import weatherWindRow from '../../sounds/noise/weatherWind.json' with { type: 'json' };
import weatherUpperAirRow from '../../sounds/noise/weatherUpperAir.json' with { type: 'json' };
import weatherRainRow from '../../sounds/noise/weatherRain.json' with { type: 'json' };
import weatherRumbleRow from '../../sounds/noise/weatherRumble.json' with { type: 'json' };

export { FAMILIES, ROLES, BUSES, FIELDS, VOICE_COST_BANDS, VOICE_COST_UNITS, LAZY_RETURNS } from './descriptor.ts';
export { KNOB_UNITS, KNOB_BIRDS, knobFaults, knobScale, knobsOf } from './descriptor.ts';
export { CONTROL_UNITS, SEND_CONTROL, controlFaults, noteControl, withControls } from './descriptor.ts';
export { asSound, soundDescriptor, soundFaults, soundLine, patchOf, rowBase, admittedOf } from './sound.ts';
export type { SoundRow, SoundDescriptor, Topology } from './sound.ts';
export { TOPOLOGIES } from './topologies.ts';

/**
 * A sound row as a registry entry: read off its JSON, held to its topology,
 * and the descriptor built from the two (`sound.ts`). Every row stands in
 * `REGISTRY` below where its module used to, so the order every derived table
 * comes out in is the order it was.
 */
export const sound = (raw: unknown): Descriptor => {
  const row: SoundRow = asSound(raw);
  return soundDescriptor(row, TOPOLOGIES[row.topology]);
};

// The contract's own types, out of the same door as its values: a consumer
// naming a voice names it from here and has no business reaching past the
// registry for the shape of one.
export type {
  Anticipates, Descriptor, Knobs, KnobSpec, KnobBird, KnobUnit, NoteParams, PrepareHook,
  PrepareOptions, TimbreFacts, VoiceBus, VoiceCost, VoiceFamily, VoiceFieldKind,
  VoiceRenderer, VoiceRole, LazyReturn, ControlSpec, Controls, ControlUnit,
} from './descriptor.ts';

// Anything a voice wants rendered before its first note. The offline renders
// await it; the live mix lets the piano's strings arrive while the intro
// plays.
//
// Which hooks there are, and which events each is handed, is the registry's
// answer: a hook is given the events of the voices that declared it and
// nothing else, so no hook picks its own out of a theme. Until round E
// `preparePiano` was named here and filtered a whole theme by
// `e.voice === 'piano'` — the one instrument in the catalogue with a
// preparation deadline, named twice.
//
// `opts` reaches the piano's cache: `{ all: true }` for an offline render,
// which has the whole timeline and no deadline, and `{ from }` for the live
// mix, which prewarms a window round where it is about to play rather than a
// whole theme it cannot hold.
/**
 * @param settings the room the sound is going to be made in — the hats' tones
 *   and the piano's strings are rendered under it, and a render started for one
 *   theme cannot be handed another's
 */
export function prepareVoices(
  ctx: BaseAudioContext,
  settings: Settings,
  events: ProgramEvent[] | null = null,
  opts: PrepareOptions = {},
): Promise<void> {
  // The program's identity goes with the filtered events: the array each hook
  // is handed is new on every call, and a hook that keeps something per program
  // (the piano's holders) keys it on `opts.id`, never on that array (R29).
  const own: PrepareOptions = events && opts.id === undefined ? { ...opts, id: events } : opts;
  const jobs = PREPARE.map(({ hook, voices }) =>
    hook(ctx, settings, events ? events.filter((e) => voices.includes(e.voice)) : [], own));
  return Promise.all(jobs).then(() => undefined);
}

export { pianoCacheStats };

// --- the rows a dispatcher renders through -----------------------------------
//
// Round SOUNDS-R3: the sustained role (`pad`) and the rhythmic one (`keys`) are
// event names that stand for several sounds, each a row of its own (the two
// strings families, the five keyboard patches), which the dispatcher renders a
// note through by its timbre (`dispatch.ts`). These are rows and not event
// names: admitted here, held to their topologies like every row, each with its
// device, and in no table below — no die and no lane can draw one, no lock
// names one but through the event that renders through it. Admitted before the
// registry, because a dispatcher's own admission asks that its table's rows be.
export const TIMBRE_ROWS: Descriptor[] = [
  sound(stringsPadRow),
  sound(stringsSwellRow),
  sound(keysRhodesRow),
  sound(keysGlassRow),
  sound(keysEpRow),
  sound(keysOrganRow),
  sound(keysPluckRow),
];

// --- the registry -----------------------------------------------------------
//
// The order is the order every derived table below comes out in, and it is the
// order `VOICES` has always had: the drums as they are heard, then the bottom,
// then the two harmonic roles and the piano, then the glue. Where a consumer
// needs a lane order, this is where it comes from.
export const REGISTRY: Descriptor[] = [
  sound(kickRow),
  sound(hatClosedRow),
  sound(hatOpenRow),
  sound(shakerRow),
  sound(clapRow),
  sound(subRow),
  sound(keysRow),
  sound(padRow),
  sound(pianoRow),
  sound(riserRow),
  sound(sweepDownRow),
  sound(swellRow),
  sound(impactRow),
  // ...and then the audition instruments, after everything the record is made
  // of.
  //
  // **What the paragraphs below say of the day each voice arrived is house-v1's
  // truth, not house-v2's** (R80 of the reconciled review of 09-24). When they
  // were written no candidate list named any of them; house-v2's lists (round
  // K5b, `catalogue-v2.ts`) now name most of the kitchen, so under v2 a die
  // does draw them. House-v1's lists still name none, and the order below is
  // still the order every derived table comes out in.
  //
  // The plucked mid bass (round G of PLAN-V1-NEXT) is registered so that
  // the completeness gate sees it and so that a fixture can play it; no
  // candidate list of any style names it, so no die can draw it, and the two
  // locks were checked either side of the commit that put it here. It is last
  // because the order above is the order the record is heard in and an
  // instrument nothing plays does not belong in the middle of it.
  sound(pluckBassRow),
  // ...and round K2's six above middle C (PLAN-KITCHEN): a saw lead, an FM
  // bell, a Karplus string, a formant pad, a clavinet and a supersaw pad. They
  // are here for the same reason and under the same rule as the one above
  // them — registered so the completeness gate sees them and a fixture can
  // play them, named by no candidate list of any style, so no die can draw one
  // and no seed moves. Both locks were checked either side of the commits that
  // put them here and neither moved. The order among them is the order they
  // were written and has no meaning beyond that; what matters is that all
  // seven auditions stand after everything the record is actually made of.
  sound(sawLeadRow),
  sound(fmBellRow),
  sound(karplusPluckRow),
  sound(formantPadRow),
  sound(clavKeyRow),
  sound(supersawPadRow),
  // ...and round K3's drum kitchen (PLAN-KITCHEN), under the same rule again:
  // sixteen percussion instruments, every one of them registered so the
  // completeness gate sees it and a fixture can play it, named by no candidate
  // list of any style, so no die can draw one and no seed moves. Both locks
  // were checked either side of every commit that put them here and neither
  // moved. They stand after the harmonic auditions because the order above is
  // the order the record is heard in; the order among them is the order they
  // were written, family by family, and means nothing else.
  sound(congaRow),
  sound(bongoRow),
  sound(snareRow),
  sound(rimshotRow),
  sound(hatTightRow),
  sound(hatLooseRow),
  sound(hatSizzleRow),
  sound(rideRow),
  sound(crashRow),
  sound(tomRow),
  sound(cabasaRow),
  sound(tambourineRow),
  sound(cowbellRow),
  sound(woodblockRow),
  sound(kickLongRow),
  sound(kickPunchRow),
  // ...and round K4's sixteen (PLAN-KITCHEN), under the same rule for the third
  // time: two leads, two subs, a second saw pad, three FM voices, two mallets,
  // a bright piano register and a reed organ, three textures and a wavetable
  // pad. Every one registered so the completeness gate sees it and a fixture
  // can play it, named by no candidate list of any style, every `plays` null
  // and every `level` a key the table already had, so no die can draw one and
  // no seed moves. Both locks were checked either side of every commit that put
  // them here and neither moved. The order among them is the order they were
  // written, family by family.
  sound(pulseLeadRow),
  sound(triLeadRow),
  sound(subSoftRow),
  sound(subTriRow),
  sound(sawPadRow),
  sound(fmGlassRow),
  sound(fmEpRow),
  sound(fmPluckRow),
  sound(marimbaRow),
  sound(vibesRow),
  sound(brightPianoRow),
  sound(reedOrganRow),
  sound(vinylBedRow),
  sound(grainPadRow),
  sound(sweepUpRow),
  sound(wavePadRow),
  sound(wordlessVocalRow),
  // ...and round KV1's, sounds the catalogue had none of — a bass that rolls
  // in the mid-range, a resonant line that glides, and more for the middle
  // and the top of the record — under the rule every round of the kitchen has kept: registered so
  // the completeness gate sees them and a fixture can play them, every `plays`
  // null and every `level` a key the table already had, and held at nought in
  // house-v2 by name (`AWAITING`, or `BY_PLACE` once a place table admits
  // one, `packages/deep-house/src/catalogue-v2.ts`) — so no house lane and no house rota row
  // draws them, and both locks and every fixture are byte-identical either
  // side of the commits that put them here.
  sound(reeseBassRow),
  sound(reeseDrivenRow),
  sound(line303Row),
  sound(shimmerPadRow),
  sound(supersawLeadRow),
  sound(sirenRow),
  sound(organStabRow),
  // ...and round DNB-1's: the reese with its sine carrying the note, for the
  // fast broken beat's sub-led bass (a row of the reese topology since round
  // R1), held at nought in house-v2 by name (`BY_PLACE`) and swapped onto the
  // bass lane only where a place table names it.
  sound(reeseDeepRow),
  // ...and round DNB-2's: the short kick and the dry snare a place swaps in
  // for the kick and the snare the kit drew (the fast broken beat, where the
  // sub owns the low band after the hit and the snare stops with the stick),
  // held at nought by name (`BY_PLACE`) like the deep reese.
  sound(kickTightRow),
  sound(snareDryRow),
  // ...and round DNB-7's classic beat at the fast broken place: a kick whose punch sits
  // at 100 Hz over the line's sub, and a snare that is its crack (held at nought by name)
  sound(kickPunchHighRow),
  sound(snareCrackRow),
  sound(snareGhostRow),
  // ...and round DUB-1's: the roles turned round at the deep half-time place —
  // a kick that is the rhythm and not the sub, and a reese whose sine carries
  // the low end with the wobble on its own filter — swapped in only by that
  // place's roles row and held at nought by name (`BY_PLACE`) like the rest.
  sound(kickKnockRow),
  sound(reeseWobbleRow),
  // ...and round DNB-4's closed hat at the fast broken beat, noise more than
  // metal, swapped in by that place's drums row and held at nought the same way.
  sound(hatShutRow),
  sound(hatSoftRow),
  // ...and round DNB-5's line at the fast broken beat: the reese turned all the
  // way to its sine, gliding and wobbling on the eighths, swapped in by that
  // place's bass row and held at nought the same way.
  sound(reeseSubRow),
  // ...and round DNB-6's mid line over it: the reese's saws without the sine, a
  // part of its own at 90-260 Hz, written beside the riff by that place's bass row.
  // ...and round LIQUID-KEYS's ten, under the kitchen's rule: registered so the
  // completeness gate sees them and the keys lab can play them by name, every
  // `plays` null, no timbre declared and every `level` a key the table already
  // had, held at nought in house-v2 by name (`AWAITING`), so no lane draws one
  // and no seed moves.
  sound(pianoFeltRow),
  sound(pianoUprightRow),
  sound(pianoWornRow),
  sound(pianoMellowRow),
  sound(keysSuitcaseRow),
  sound(keysReedRow),
  sound(fmEpSoftRow),
  sound(fmEpGlassRow),
  sound(malletSoftRow),
  sound(padHazeRow),
  // ...and its second round's eight, under the same rule.
  sound(pianoCloseRow),
  sound(pianoMuteRow),
  sound(pianoConcertRow),
  sound(pianoCassetteRow),
  sound(pianoElectricRow),
  sound(keysTineDarkRow),
  sound(keysReedAmpRow),
  sound(fmSineLayerRow),
  // liquid-space (10-11): the surface row's dark air, named by no lane (`plays: null`), written by the composer's surface pass.
  sound(airBedRow),
  // liquid-ambient (10-11): the weather family's four rows, named by no lane, written by the composer's ambient pass.
  sound(weatherWindRow),
  sound(weatherUpperAirRow),
  sound(weatherRainRow),
  sound(weatherRumbleRow),
];

/**
 * **What of each glue gesture's envelope a note may write**, by sound: the
 * rows whose topology declares it (`glue`, `voices/fx.ts`), in the registry's
 * order. The composer asks this table and never the voices' names.
 */
export const GLUE_SHAPES: Record<string, { attack?: true; release?: true; top?: true }> = Object.fromEntries(REGISTRY
  .filter((d) => d.row && TOPOLOGIES[d.row.topology].glue)
  .map((d) => [d.name, { ...TOPOLOGIES[d.row!.topology].glue }]));

/** Every descriptor by its event name. */
export const BY_NAME: Record<string, Descriptor> =
  Object.fromEntries(REGISTRY.map((d): [string, Descriptor] => [d.name, d]));

/**
 * **Every row**, by its id: the registered voices' and the rows the
 * dispatchers render through. A row that is not an event name is reached only
 * through one that is.
 */
export const ROWS: Record<string, SoundRow> = Object.fromEntries(
  [...TIMBRE_ROWS, ...REGISTRY].filter((d) => d.row).map((d): [string, SoundRow] => [d.row!.id, d.row!]),
);

/** Whether this event name dispatches by timbre (`pad`, `keys`). */
export const dispatches = (voice: string): boolean => BY_NAME[voice]?.row?.topology === 'dispatch';

/**
 * **The timbre a note of a dispatching voice plays**, as its table resolves it
 * (`p.timbre` for the pad, `p.preset` for the keys, the table's own where the
 * note names none or one it has not); `null` for a voice that does not
 * dispatch.
 */
export function timbreOfNote(voice: string, p: NoteParams | null | undefined): string | null {
  const row = BY_NAME[voice]?.row;
  return row && row.topology === 'dispatch' ? timbreOf(row, p) : null;
}

/** The row a timbre of a dispatching voice renders through, by its id; `null` for none. */
export function rowOfTimbre(voice: string, timbre: string): string | null {
  const row = BY_NAME[voice]?.row;
  if (!row || row.topology !== 'dispatch') return null;
  const t = (row.parameters.timbres as Record<string, { row: string }>)[timbre];
  return t ? t.row : null;
}

/**
 * **The rows an event renders through**: its own, and where it dispatches, the
 * row its timbre names. What the program lock's `sounds` line hashes of a
 * theme, so a changed timbre row moves the themes that play it.
 */
export function rowsThrough(voice: string, p: NoteParams | null | undefined): SoundRow[] {
  const row = BY_NAME[voice]?.row;
  if (!row) return [];
  if (row.topology !== 'dispatch') return [row];
  const target = admittedOf(targetOf(row, p))?.row;
  return target ? [row, target] : [row];
}

/**
 * **A settings value's sound blocks, admitted** (E04, E05 of the outside review
 * of 10-03): every block a row owns (`BLOCKS` in `params.ts`) held to that
 * row's topology's contract, where the value carries it — the room's copy of a
 * row is the row's patch as much as the row is, and a room can voice it out of
 * range. A block of the table may carry fields of its own beside the row's
 * (the `bass` block's bus half). Asked once, where a settings value is
 * resolved; a voice handed one then reads it without asking again (`patchOf`).
 * Throws naming every block that fails.
 */
export function admitBlocks(settings: Readonly<Record<string, unknown>>): void {
  const bad: string[] = [];
  for (const [block, id] of Object.entries(BLOCKS)) {
    const v = settings[block];
    const row = BY_NAME[id]?.row;
    if (v === undefined || !row) continue;
    try {
      provePatch(v, TOPOLOGIES[row.topology].parameters, `the settings' ${block} block (${id})`, true);
    } catch (e) {
      bad.push((e as Error).message);
    }
  }
  // ...and every voiced row as this room voices it (round SOUNDS-R3): the
  // ensemble's body, the amplifier and a style's keyboard voicing are the
  // room's word on rows, and may not voice one out of its contract either.
  for (const row of Object.values(ROWS)) {
    if (!row.voicedBy) continue;
    try {
      provePatch(voicedPatch(settings as unknown as Settings, row), TOPOLOGIES[row.topology].parameters, `${row.id}, as the room voices it (${row.voicedBy.join(', ')})`);
    } catch (e) {
      bad.push((e as Error).message);
    }
  }
  if (bad.length) throw new Error(`a settings value is not a sound: ${bad.join('; ')}`);
}

// The pre-render hooks, each with the voices that declared it, in registry
// order. Two of them: the hats' three tones share one preparation because they
// share the rendered metal and noise beds, and the piano's strings are the
// other. `prepareVoices` above walks this and hands each hook its own events.
const PREPARE: Array<{ hook: PrepareHook; voices: string[] }> = (() => {
  const out: Array<{ hook: PrepareHook; voices: string[] }> = [];
  for (const d of REGISTRY) {
    if (!d.prepare) continue;
    const row = out.find((r) => r.hook === d.prepare);
    if (row) row.voices.push(d.name);
    else out.push({ hook: d.prepare, voices: [d.name] });
  }
  return out;
})();

/**
 * The distinct event layers of the voices that answer a question, in the
 * registry's order: the mono stem is `layersWhere((d) => d.mono)` and the
 * stage's lanes are `layersWhere((d) => d.treat)`.
 */
export function layersWhere(pred: (d: Descriptor) => boolean): string[] {
  const out: string[] = [];
  for (const d of REGISTRY) if (pred(d) && d.layer && !out.includes(d.layer)) out.push(d.layer);
  return out;
}

// The layers the *arrangement* gates, in the registry's order: is this allowed
// to play this bar. Eight of them, and the order is the one `LAYER_ORDER`, the
// loudness fit's `LAYERS` and `arrangement.ts`'s FULL/NONE have always had —
// which is why all three now read it from here.
export const ARRANGEMENT_LAYERS: string[] = (() => {
  const out: string[] = [];
  for (const d of REGISTRY) if (d.plays && !out.includes(d.plays)) out.push(d.plays);
  return out;
})();

// The layers the *event list* carries: what a solo-stem render, the lane
// meters and the loudness fit's per-layer rates filter on.
export const EVENT_LAYERS = layersWhere(() => true);

// --- the tables every consumer already imported -----------------------------

/** The voice functions, by event name. `fireEvent` looks a name up here. */
export const VOICES: Record<string, VoiceRenderer> =
  Object.fromEntries(REGISTRY.map((d): [string, VoiceRenderer] => [d.name, d.render]));

/** Which bus each voice lands on. */
export const VOICE_BUS: Record<string, VoiceBus> =
  Object.fromEntries(REGISTRY.map((d): [string, VoiceBus] => [d.name, d.bus]));

/** Which level in params.ts each voice is trimmed to. */
export const VOICE_LEVEL: Record<string, string> =
  Object.fromEntries(REGISTRY.map((d): [string, string] => [d.name, d.level]));

/**
 * **Which ranges each voice lets a bird move**, by the property the range is
 * of. Empty for a voice that declares none, which is most of them: a knob
 * nobody declares is a bird that voice does not follow, which is honest and is
 * what `knobReadout` prints.
 *
 * PLAN-MODULATION M1, and it is a derived table like every other in this file:
 * the declaration lives beside the sound it describes and nothing is kept in
 * step by hand.
 */
export const VOICE_KNOBS: Record<string, Knobs> =
  Object.fromEntries(REGISTRY.map((d): [string, Knobs] => [d.name, d.knobs || {}]));

/** Everything wrong with every note-control table in the registry. Empty is complete. */
export const controlFaultsOfAll = (): string[] => REGISTRY.flatMap((d) => controlFaults(d));

/** Everything wrong with every knob table in the registry. Empty is complete. */
export const knobFaultsOfAll = (): string[] => REGISTRY.flatMap((d) => knobFaultsOf(d));

/**
 * Which voices declare which knobs, as a sentence for a gate's own log — the
 * completeness readout the contract asks for. A voice with none is counted and
 * not listed, because forty-six names is not a readout.
 */
export function knobReadout(): string {
  const rows = REGISTRY.filter((d) => d.knobs && Object.keys(d.knobs).length);
  const knobs = rows.reduce((n, d) => n + Object.keys(d.knobs!).length, 0);
  const said = rows.map((d) => `${d.name} (${Object.keys(d.knobs!).join(', ')})`).join('; ');
  return `${knobs} knobs on ${rows.length} of ${REGISTRY.length} voices — ${said}`;
}

/**
 * What a set of voices costs, in the same units as `effects/index.ts`'s
 * `costOf`: one cheap effect. A name nobody registered, or a voice nobody has
 * measured, is a throw and not a nought — a ceiling that prices what it cannot
 * find at nothing passes everything, which is round K1's line about the effects
 * said again about the instruments.
 */
export function costOfVoices(names: string[]): number {
  let sum = 0;
  for (const name of names) {
    const d = BY_NAME[name];
    if (!d) throw new Error(`no voice called ${name}`);
    if (!d.cost) throw new Error(`${name} declares no cost: run tools/budget.ts --bless`);
    sum += VOICE_COST_UNITS_TABLE[d.cost];
  }
  return +sum.toFixed(3);
}

/**
 * **Whether a note arrives as a hit** (round PIANO-2), which is what decides
 * which duck it takes on the harmonic bus: a struck note a shallow dip after
 * the strike (`struckDuck`), a held one the pads' pump (`duck`). Read off the
 * descriptor and never off a name: the timbre the note plays (`p.timbre`,
 * `p.preset`, or the voice's one timbre) and that timbre's own `struck` fact —
 * the one the loudness fit has always read — so the piano, the keys' rhodes,
 * glass, ep and pluck, the clav, the mallets, the bells, the plucks and the
 * organ stab are struck, and the pads, the strings, the leads that hold, the
 * keys' organ and a keys patch held by the pad (`p.sustain`) are not. A voice
 * with no timbre (the seam's effects) is held. A bass is never struck here,
 * whatever its envelope: under the kick a bass is the low end's hand-over and
 * not a note's, and the pluck bass on this bus keeps the duck it had. Only the
 * two harmonic buses have a struck door; anywhere else the answer is no.
 */
export function strikes(voice: string, p: NoteParams | null | undefined): boolean {
  const d = BY_NAME[voice];
  if (!d || (d.bus !== 'melodic' && d.bus !== 'keys') || d.family === 'bass') return false;
  if (p && p.sustain) return false;
  const named = p ? (p.timbre ?? p.preset) : undefined;
  const own = Object.keys(d.timbres);
  const facts = (typeof named === 'string' && d.timbres[named]) || (own.length === 1 ? d.timbres[own[0]] : undefined);
  return !!(facts && facts.struck);
}

/**
 * **Whether the harmonic bus's edge reads a note** (round HF-NOISE): what the
 * voice's row says (`edge`), and yes where it says nothing. Read off the
 * descriptor and never off a name, as `strikes` is. A note it does not read
 * takes its bus's clean door, where the theme's graph built an edge; anywhere
 * else it is the door it always took.
 */
export function edgeReads(voice: string): boolean {
  return BY_NAME[voice]?.edge !== false;
}

/**
 * Which lazy returns a program's events will send to, in the order they are
 * built. A return is a convolver whose impulse response is computed when it is
 * built — 4 to 14 ms on this Mac, several times that on a phone — so a deck
 * builds the ones its program uses when it is made (`prepareReturns` in
 * src/scheduler.ts) and never on the tick a note is scheduled. A voice's own
 * default is its descriptor's `returns`; a note's own amount decides either
 * way.
 */
export function returnsOf(events: readonly ProgramEvent[]): LazyReturn[] {
  const want = new Set<LazyReturn>();
  for (const e of events) {
    const p = e.p || {};
    for (const r of LAZY_RETURNS) {
      const byDefault = BY_NAME[e.voice]?.returns?.includes(r) ?? false;
      if (typeof p[r] === 'number' ? p[r] > 0 : byDefault) want.add(r);
    }
  }
  return LAZY_RETURNS.filter((r) => want.has(r));
}

// What the harmonic families say about themselves, gathered from the modules
// that make them rather than from a table somebody keeps in step by hand. Each
// entry carries `family`, `struck`, `hold` (the fraction of the note still
// sounding at the bar line), `brightnessHz` (its own filter corner) and
// `loudnessDb` (MEASURED: the family alone in an eight-bar main groove, less
// the level its room gave it — tools/loudness-fit.ts --timbres).
//
// This is what keeps the per-theme loudness trim from naming instruments. The
// fit sums these over whatever is sounding, so a family written tomorrow needs
// its module and its own four numbers and no new coefficient anywhere.
export const TIMBRES: Record<string, TimbreFacts> =
  Object.assign({}, ...REGISTRY.map((d) => d.timbres));

// Which entry of the level table a harmonic role is played at: the role is one
// name and the voices behind it are three, and one of them has a level of its
// own.
//
// Asked of the registry rather than of two names. The voices that *play* this
// arrangement layer are the candidates, in registry order; the one that makes
// this timbre itself wins, then the one that stands for it as a legacy alias,
// and failing both the first candidate — which is what "and the rest are keys"
// meant when it was written as `timbre === 'piano' ? 'piano' : 'keys'`. A
// timbre moved from one voice to another moves its level with it, and a
// registered instrument that plays no layer cannot be reached from here at
// all.
export function levelKeyOfRole(role: string, timbre: string): string {
  return BY_NAME[voicePlaying(role, timbre)].level;
}

/**
 * **Which registered voice renders this timbre in this arrangement role.**
 *
 * The same question `levelKeyOfRole` has always asked, asked once and answered
 * with the instrument rather than with one of its fields — because round K5b is
 * where the answer stopped always being one of three names. A composer draws a
 * *timbre* and an event carries a *voice*, and until house-v2 widened the lists
 * every timbre a list could name was one the record's own `keys`, `pad` or
 * `piano` either makes itself or stands in front of as a legacy alias. The
 * kitchen's are not: `wavePad` is a timbre the `wavePad` voice makes, and
 * writing `pad` on that event would be asking the strings module to render
 * something it has never heard of.
 *
 * Four questions, in order, and every one of them asked of the registry:
 *
 *   1. the voice that **plays this role** and whose own table declares the
 *      timbre — `keys` for `ep`, `piano` for `piano`, `pad` for `strings`;
 *   2. the voice that plays this role and **dispatches** it as an alias —
 *      `pad` for `organ`, which is a keys patch held rather than struck;
 *   3. the voice whose **own table declares it**, whatever it plays — which is
 *      every instrument the kitchen added, none of which plays a role in the
 *      record and all of which declare the layer, bus and level of the lane
 *      they would fill;
 *   4. failing all three, the role's first player, which is what "and the rest
 *      are keys" meant when it was a ternary.
 *
 * The first two are what the record takes, every time, so this is `pad`,
 * `keys` and `piano` under house-v1 for all seven of its lead timbres and both
 * of its partners — which is why the golden digest does not move.
 */
export function voicePlaying(role: string, timbre: string): string {
  const playing = REGISTRY.filter((d) => d.plays === role);
  const own = playing.find((d) => timbre in d.timbres);
  if (own) return own.name;
  const alias = playing.find((d) => d.dispatches.includes(timbre));
  if (alias) return alias.name;
  const makes = REGISTRY.find((d) => timbre in d.timbres);
  if (makes) return makes.name;
  return (playing[0] || REGISTRY[0]).name;
}

// The one voice that also holds. `holdStrings` is the sustained family's second
// entry point — the same ensemble with nothing scheduled to stop it, against
// the contract in `voice-contract.ts` — and it stands beside the one-shot
// rather than replacing it: a note is not a drone with a stopwatch on it, and
// `strings` is byte-identical to what it was. It is not a field of any
// descriptor yet, because what a held voice is *for* is a v2 role allocation
// and not a property of an instrument; round G's fixtures name it directly.
export { holdStrings };
// ...and round K2's two, which are held voices by design rather than a second
// entry point onto a note: a formant pad and a supersaw pad, both against the
// same contract, both with the arithmetic of holding in `held.ts` rather than
// copied out of `strings.ts`. Like `holdStrings` they are a field of no
// descriptor, because what a held voice is *for* is a role allocation and not
// a property of an instrument; the fixtures name them directly.
export { holdFormantPad, holdSupersawPad };
// ...and round K4's two, which are the two the held contract was really written
// for: a cloud of grains, whose sound is *scheduled ahead* rather than
// sustained, so `hold` lays grains down to a horizon and the release fades what
// is already in flight; and a wavetable pad, whose `morph` is a named control,
// because where a note sits between two spectra is exactly the kind of thing a
// hand on a drone reaches for.
export { holdGrainPad, holdWavePad };
// What a context is holding for the audition instrument, for the test that
// counts what a start and a stop leave behind.
export { pickCacheSize, stringCacheSize };

/**
 * **How long a voice's own entrance is**, in seconds: the attack a note of it
 * takes before it reaches its level, read out of the voice's own table in the
 * room it is played in (`settings`, the frozen base when none is given). A
 * note that writes its own `attack` has that one. The role voice `pad`
 * dispatches by timbre, so its answer is the timbre's: a strings-family row's
 * attack, or the keys patch it holds. A voice with no attack of its own
 * enters at once, which is nought.
 *
 * Nothing in the engine reads it: the composer asks it of a drawn voice before
 * it decides how far a sustained layer's entrance may swell (house-v2's
 * `swellIn`, `packages/deep-house/src/swell.ts`), since a voice whose envelope
 * already swells needs less of one.
 */
export function entranceOf(voice: string, p: NoteParams = {}, settings: Settings = INSTRUMENTS as unknown as Settings): number {
  if (typeof p.attack === 'number' && Number.isFinite(p.attack)) return Math.max(0, p.attack);
  const table = settings as unknown as Record<string, Record<string, unknown> | undefined>;
  const timbre = typeof p.timbre === 'string' ? p.timbre : undefined;
  if (voice === 'pad') {
    // The timbre's row: a strings row reads the attack its shape names off the
    // room's `strings` block. A held keyboard patch reads `keys.attack` off the
    // room, as this always has — the amplifier block carries none, so it is
    // nought — and the composer's swells were laid against that answer, so it
    // stands until a round that means to move it (round SOUNDS-R3).
    const pad = BY_NAME.pad.row!;
    const target = ROWS[(pad.parameters.timbres as Record<string, { row: string }>)[timbre ?? (pad.parameters.none as string)]?.row ?? ''];
    if (target && target.topology === 'strings') return stringsAttack(target, table.strings ?? {});
    const k = table.keys?.attack;
    return typeof k === 'number' ? k : 0;
  }
  const own = table[voice]?.attack;
  return typeof own === 'number' ? own : 0;
}

export default VOICES;
