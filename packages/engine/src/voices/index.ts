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
import { INSTRUMENTS } from '../params.ts';
import type { ProgramEvent } from '../program.ts';
import type { Settings } from '../settings.ts';
import { kick, descriptor as kickDescriptor } from './kick.ts';
import { hatClosed, hatOpen, shaker, descriptors as hatDescriptors } from './hats.ts';
import { clap, descriptor as clapDescriptor } from './clap.ts';
import { sub, descriptor as subDescriptor } from './bass.ts';
import { keys, KEYS_TIMBRES, descriptor as keysDescriptor } from './keys.ts';
import { STRINGS_TIMBRES, holdStrings, stringsAttack } from './strings.ts';
import { pad, descriptor as padDescriptor } from './pad.ts';
import { piano, pianoCacheStats, PIANO_TIMBRES, descriptor as pianoDescriptor } from './piano.ts';
import { riser, sweepDown, swell, impact, GLUE_SHAPES, descriptors as fxDescriptors } from './fx.ts';
import { pluckBass, pickCacheSize, PLUCK_BASS_TIMBRES, descriptor as pluckBassDescriptor } from './pluck-bass.ts';
import { sawLead, SAW_LEAD_TIMBRES, descriptor as sawLeadDescriptor } from './saw-lead.ts';
import { fmBell, FM_BELL_TIMBRES, descriptor as fmBellDescriptor } from './fm-bell.ts';
import { karplusPluck, stringCacheSize, KARPLUS_TIMBRES, descriptor as karplusPluckDescriptor } from './karplus-pluck.ts';
import { formantPad, holdFormantPad, FORMANT_PAD_TIMBRES, descriptor as formantPadDescriptor } from './formant-pad.ts';
import { clavKey, CLAV_KEY_TIMBRES, descriptor as clavKeyDescriptor } from './clav-key.ts';
import { supersawPad, holdSupersawPad, SUPERSAW_PAD_TIMBRES, descriptor as supersawPadDescriptor } from './supersaw-pad.ts';
import { conga, bongo, CONGA_TIMBRES, descriptors as congaDescriptors } from './congas.ts';
import { snare, rimshot, SNARE_TIMBRES, descriptors as snareDescriptors } from './snare.ts';
import { hatTight, hatLoose, hatSizzle, HATS_KIT_TIMBRES, descriptors as hatsKitDescriptors } from './hats-kit.ts';
import { ride, crash, CYMBAL_TIMBRES, descriptors as cymbalDescriptors } from './cymbals.ts';
import { tom, TOM_TIMBRES, descriptor as tomDescriptor } from './toms.ts';
import { cabasa, tambourine, cowbell, woodblock, PERC_TIMBRES, descriptors as percDescriptors } from './perc.ts';
import { kickLong, kickPunch, ALT_KICK_TIMBRES, descriptors as altKickDescriptors } from './kicks-alt.ts';
import { pulseLead, triLead, PULSE_LEAD_TIMBRES, TRI_LEAD_TIMBRES, descriptors as waveLeadDescriptors } from './wave-leads.ts';
import { subSoft, subTri, SUB_SOFT_TIMBRES, SUB_TRI_TIMBRES, descriptors as subDescriptors } from './subs.ts';
import { sawPad, SAW_PAD_TIMBRES, descriptor as sawPadDescriptor } from './saw-pad.ts';
import { fmGlass, fmEp, fmPluck, FM_GLASS_TIMBRES, FM_EP_TIMBRES, FM_PLUCK_TIMBRES, descriptors as fmKeyDescriptors } from './fm-keys.ts';
import { marimba, vibes, MARIMBA_TIMBRES, VIBES_TIMBRES, descriptors as malletDescriptors } from './mallets.ts';
import { brightPiano, reedOrgan, BRIGHT_PIANO_TIMBRES, REED_ORGAN_TIMBRES, descriptors as keys2Descriptors } from './keys-2.ts';
import { vinylBed, grainPad, holdGrainPad, sweepUp, VINYL_BED_TIMBRES, GRAIN_PAD_TIMBRES, SWEEP_UP_TIMBRES, descriptors as textureDescriptors } from './texture.ts';
import { wavePad, holdWavePad, WAVE_PAD_TIMBRES, descriptor as wavePadDescriptor } from './wave-pad.ts';
import { descriptor as wordlessVocalDescriptor } from './wordless-vocal.ts';

export { FAMILIES, ROLES, BUSES, FIELDS, VOICE_COST_BANDS, VOICE_COST_UNITS, LAZY_RETURNS } from './descriptor.ts';
export { KNOB_UNITS, KNOB_BIRDS, knobFaults, knobScale, knobsOf } from './descriptor.ts';
export { CONTROL_UNITS, SEND_CONTROL, controlFaults, noteControl, withControls } from './descriptor.ts';

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

// --- the registry -----------------------------------------------------------
//
// The order is the order every derived table below comes out in, and it is the
// order `VOICES` has always had: the drums as they are heard, then the bottom,
// then the two harmonic roles and the piano, then the glue. Where a consumer
// needs a lane order, this is where it comes from.
export const REGISTRY: Descriptor[] = [
  kickDescriptor,
  ...hatDescriptors,
  clapDescriptor,
  subDescriptor,
  keysDescriptor,
  padDescriptor,
  pianoDescriptor,
  ...fxDescriptors,
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
  pluckBassDescriptor,
  // ...and round K2's six above middle C (PLAN-KITCHEN): a saw lead, an FM
  // bell, a Karplus string, a formant pad, a clavinet and a supersaw pad. They
  // are here for the same reason and under the same rule as the one above
  // them — registered so the completeness gate sees them and a fixture can
  // play them, named by no candidate list of any style, so no die can draw one
  // and no seed moves. Both locks were checked either side of the commits that
  // put them here and neither moved. The order among them is the order they
  // were written and has no meaning beyond that; what matters is that all
  // seven auditions stand after everything the record is actually made of.
  sawLeadDescriptor,
  fmBellDescriptor,
  karplusPluckDescriptor,
  formantPadDescriptor,
  clavKeyDescriptor,
  supersawPadDescriptor,
  // ...and round K3's drum kitchen (PLAN-KITCHEN), under the same rule again:
  // sixteen percussion instruments, every one of them registered so the
  // completeness gate sees it and a fixture can play it, named by no candidate
  // list of any style, so no die can draw one and no seed moves. Both locks
  // were checked either side of every commit that put them here and neither
  // moved. They stand after the harmonic auditions because the order above is
  // the order the record is heard in; the order among them is the order they
  // were written, family by family, and means nothing else.
  ...congaDescriptors,
  ...snareDescriptors,
  ...hatsKitDescriptors,
  ...cymbalDescriptors,
  tomDescriptor,
  ...percDescriptors,
  ...altKickDescriptors,
  // ...and round K4's sixteen (PLAN-KITCHEN), under the same rule for the third
  // time: two leads, two subs, a second saw pad, three FM voices, two mallets,
  // a bright piano register and a reed organ, three textures and a wavetable
  // pad. Every one registered so the completeness gate sees it and a fixture
  // can play it, named by no candidate list of any style, every `plays` null
  // and every `level` a key the table already had, so no die can draw one and
  // no seed moves. Both locks were checked either side of every commit that put
  // them here and neither moved. The order among them is the order they were
  // written, family by family.
  ...waveLeadDescriptors,
  ...subDescriptors,
  sawPadDescriptor,
  ...fmKeyDescriptors,
  ...malletDescriptors,
  ...keys2Descriptors,
  ...textureDescriptors,
  wavePadDescriptor,
  wordlessVocalDescriptor,
];

/** Every descriptor by its event name. */
export const BY_NAME: Record<string, Descriptor> =
  Object.fromEntries(REGISTRY.map((d): [string, Descriptor] => [d.name, d]));

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

export { kick, hatClosed, hatOpen, shaker, clap, sub, keys, pad, piano, riser, sweepDown, swell, impact, pluckBass };
export { sawLead, fmBell, karplusPluck, formantPad, clavKey, supersawPad };
export { conga, bongo, snare, rimshot, hatTight, hatLoose, hatSizzle, ride, crash, tom, cabasa, tambourine, cowbell, woodblock, kickLong, kickPunch };
export { pulseLead, triLead, subSoft, subTri, sawPad, fmGlass, fmEp, fmPluck, marimba, vibes, brightPiano, reedOrgan, vinylBed, grainPad, sweepUp, wavePad };
export { KEYS_TIMBRES, STRINGS_TIMBRES, PIANO_TIMBRES, PLUCK_BASS_TIMBRES };
export { CONGA_TIMBRES, SNARE_TIMBRES, HATS_KIT_TIMBRES, CYMBAL_TIMBRES, TOM_TIMBRES, PERC_TIMBRES, ALT_KICK_TIMBRES };
export { SAW_LEAD_TIMBRES, FM_BELL_TIMBRES, KARPLUS_TIMBRES, FORMANT_PAD_TIMBRES, CLAV_KEY_TIMBRES, SUPERSAW_PAD_TIMBRES };
export { PULSE_LEAD_TIMBRES, TRI_LEAD_TIMBRES, SUB_SOFT_TIMBRES, SUB_TRI_TIMBRES, SAW_PAD_TIMBRES };
export { FM_GLASS_TIMBRES, FM_EP_TIMBRES, FM_PLUCK_TIMBRES, MARIMBA_TIMBRES, VIBES_TIMBRES };
export { BRIGHT_PIANO_TIMBRES, REED_ORGAN_TIMBRES, VINYL_BED_TIMBRES, GRAIN_PAD_TIMBRES, SWEEP_UP_TIMBRES, WAVE_PAD_TIMBRES };
// The one voice that also holds. `holdStrings` is the sustained family's second
// entry point — the same ensemble with nothing scheduled to stop it, against
// the contract in `voice-contract.ts` — and it stands beside the one-shot
// rather than replacing it: a note is not a drone with a stopwatch on it, and
// `strings` is byte-identical to what it was. It is not a field of any
// descriptor yet, because what a held voice is *for* is a v2 role allocation
// and not a property of an instrument; round G's fixtures name it directly.
export { holdStrings, GLUE_SHAPES };
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
    const t = timbre ?? 'strings';
    if (t in STRINGS_TIMBRES) return stringsAttack(t, table.strings ?? {});
    const k = table.keys?.attack;
    return typeof k === 'number' ? k : 0;
  }
  const own = table[voice]?.attack;
  return typeof own === 'number' ? own : 0;
}

export default VOICES;
