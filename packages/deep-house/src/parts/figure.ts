// A requested upper phrase has its own family and random stream. It can play
// beside a bass motif without replacing it or reopening a sustained layer.
import type { Style } from '@deep-house/engine/style';
import { BY_NAME, TIMBRES, voicePlaying } from '@deep-house/engine/voices';
import type { MotifBox } from '../motif.ts';
import { inside, preferLean, type RhythmPart } from './rhythm.ts';
import { charactersOf } from './sound.ts';
import { airMeasured } from '../air-lean.ts';
import DISTANCE from '../../recipes/parts/voice-distance.json' with { type: 'json' };

/** A side's weights (`recipes/parts/voice-distance.json`): `up` where the swapped voice stands above the source, `down` below. */
type Side = { up: number; down: number };
const W = DISTANCE as unknown as { air: Side; top: Side & { per: number }; noise: Side & { per: number }; hold: Side & { floor: number } };
/**
 * **How far a voice stands from another, as a listener hears a swap** (10-28): on the descriptors the catalogue keeps —
 * the measured air (`voice-air.json`, wherever the voice was measured in front: the keys, held, the calls; `airMeasured`:
 * the centroid in octaves, the energy over 1.5 kHz, the noise's flatness) and the declared sustain (`hold`). Each weighs
 * as the row says (`recipes/parts/voice-distance.json`): brighter, harder and noisier than the source weigh more than
 * darker and softer (his ear: a darker swap was liked, a harsher one not). **A pair the table has not measured is beyond
 * any tolerance** (Infinity: never near, the code review of 10-29; it had read 0, the nearest of all); a voice is at
 * nought from itself.
 */
export function voiceDistance(timbre: string, source: string): number {
  if (timbre === source) return 0;
  const a = airMeasured(timbre), b = airMeasured(source), ta = TIMBRES[timbre], tb = TIMBRES[source];
  if (!a || !b) return Infinity;
  const side = (x: number, s: Side) => (x > 0 ? x * s.up : -x * s.down);
  let d = 0;
  d += side(Math.log2(a.hz / b.hz), W.air);
  d += side((a.over1500 - b.over1500) / W.top.per, W.top);
  d += side((a.flat - b.flat) / W.noise.per, W.noise);
  if (ta && tb) d += side(Math.log2(((ta.hold ?? 0) + W.hold.floor) / ((tb.hold ?? 0) + W.hold.floor)), W.hold);
  return +d.toFixed(3);
}

export interface PitchedFigure {
  follows: 'harmony';
  articulation: 'struck' | 'sustained';
  register: 'mid';
  families: string[];
  properties: RhythmPart['properties'];
  /** A narrower profile the draw leans toward; see `RhythmPart.prefer`. */
  prefer?: RhythmPart['prefer'];
  motif: MotifBox;
  strength: [number, number];
  entry: { beats: [number, number] };
  spacing: { bars: [number, number] };
  /** Sounding duration in musical time; omitted retains short struck stabs. */
  duration?: { beats: [number, number] };
  /** Signed scale-degree chord shapes around the melody, cycled over onsets. */
  voicings?: number[][];
  /** Optional phrasing in musical time, only on voices declaring both controls. */
  envelope?: { attack: { beats: number }; release: { beats: number } };
  /** Ordered note indices starting each subphrase; arch is entry/crest/exit. */
  phrasing?: { starts: number[]; dynamics: [number,number,number]; character: string };
  /** An ostinato tiles its cell without melodic development or inserted rests. */
  behavior?: 'phrase' | 'ostinato';
  /** Omit attacks inside these half-open beat windows, on the theme clock (or the section's, `clock: 'section'`). */
  rests?: { bars: number; beats: [number, number][]; clock?: 'section' };
  /** The section kinds the part sits out (an ensemble's development: the comp and the lead leave a breakdown to the hum). */
  leaves?: string[];
  /**
   * **The harmony's colour stays** (10-29, his ear: *"in Sunrise there is an issue that piano is gone from 0:30 until
   * 1:50"*): a part that carries the chords' colour never leaves the track for long without a reason the arrangement
   * gives.
   * - `back`: a switch-up that takes the part out gives it back this many bars before its section's line, so the
   *   return (the switch-up's own lift) is heard inside the section and not lost into the section after it;
   * - `thin`: the section kinds where a theme sits out (`placementOf`: a breakdown, so the return is an event) in which
   *   this part stays instead: over the bed (the pad), a thinner statement of itself — fewer notes (`keep`: `ends`,
   *   where each phrase starts and where it lands; `chords`, the notes it strikes as chords), each rung as a landing,
   *   at `level` of its strength; where no bed plays, its whole statement, the harmony the section is left with.
   *   A part that `leaves` the kind still leaves it: another voice carries that section.
   * - `solo` (keys-moments, his ear 10-29: *"color in breakdown - great"*): the part may take a long
   *   breakdown's last phrase alone, a free line of its own notes over its own soft chords (`src/keys-moments.ts`, the
   *   row `recipes/arrangement/keys-moments.json` says where, how often and how), in place of its thin statement there.
   */
  stays?: { back?: number; thin?: { sections: string[]; keep: 'ends' | 'chords'; level: number }; solo?: boolean };
  /**
   * **Near its source voice** (10-28, his ear: *"those voices make it so harsh"*; *"the voices should roughly be reminding
   * the piano"*): the voice the role was heard on, how far (`voiceDistance`) a swapped voice may stand from it, and how
   * gently the weight leans to the nearer (exp(-d / falloff), in place of the palette's weight): inside the limit the
   * voices are drawn at about even odds.
   */
  near?: { voice?: string; max?: number; falloff: number };
  /**
   * **The octave its chord root folds into** (10-28, his word: *"not going too wide on the octaves"*): an ensemble's role
   * keeps the register its source played in whatever the key (a band of an octave about the source's root), in place of
   * the style's figure home.
   */
  home?: [number, number];
  /**
   * semitones its register may drift, as scale steps in the key, one draw a theme every drifting part reads alike
   * (`'ensemble-drift'`), so they move together: an ensemble's register band widened by the draw's reach (`driftAt`)
   */
  drift?: number;
  /** The MIDI register the part may use, in place of the style's figure register (an ensemble's roles keep their order in it). */
  range?: [number, number];
  /** Reserve harmonic space during this part's active sections. */
  support?: { sustained: 'separate' };
  /**
   * **The sustain pedal** (10-28): every note rings on until the pedal lifts, every `beats` beats from the
   * statement's start, so a line's notes ring into each other; a phrase's last note (and its chord) rings
   * `landingBeats` from its strike, past the statement's end, as a pedal held through the phrase's close.
   * Absent, every note is as long as it is written.
   */
  pedal?: { beats: number; landingBeats?: number };
  /**
   * **A chord where a phrase lands** (10-28, the ensemble): the shape struck on each phrase's last note (`phrasing`'s
   * groups), single notes inside, in place of `voicings` by note index.
   */
  landing?: number[];
  /**
   * **The notes vary, the phrase stays** (the ensemble): once a theme, off the part's own stream, its path's degrees
   * move by a shift drawn in `shift` (scale degrees) and are mirrored about their middle at the chance `invert`;
   * the rhythm, the holds, the accents and the phrase's landings are the path's own.
   */
  vary?: { shift: [number, number]; invert?: number; shared?: boolean };
  /** The part's name inside an ensemble: its notes carry it (`EventMeta.ensemble`), for the ensemble's check. */
  as?: string;
}
/** Historical part-request name retained for captured policy data. */
export type StruckFigure = PitchedFigure;
export interface FigureCandidate { timbre: string; voice: string; w: number }

export function figureCandidates(want: StruckFigure, style: Style, forbids: readonly string[]): FigureCandidate[] {
  if (forbids.includes('figure') || !style.lanes.some(l => l.role === 'figure')) return [];
  const palette = [...style.catalogue.leadTimbres,
    ...(style.catalogue.partTimbres || [])] as readonly { v: string; w: number }[];
  return palette.flatMap(e => {
    if (e.w <= 0) return [];
    const t = TIMBRES[e.v];
    const voice = voicePlaying('keys', e.v);
    const d = BY_NAME[voice];
    const p = want.properties || {};
    if (want.phrasing) {
      // The character's shape is the style's, checked once by `charactersOf`;
      // here only whether this instrument declares what it moves.
      const profile = charactersOf(style)?.phrases?.[want.phrasing.character];
      if (!profile || !profile.requires.every(k => d?.noteControls?.includes(k))) return [];
    }
    if (want.envelope && !['attack', 'release'].every(k => d?.noteControls?.includes(k))) return [];
    if (!t || !d || t.struck !== (want.articulation !== 'sustained') || !d.roles.includes(want.articulation === 'sustained' ? 'sustained' : 'figure') || !want.families.includes(d.family)
      // This part occupies the figure role. A sustained articulation can
      // borrow a bed-capable instrument while the sustained bed is forbidden.
      || forbids.includes(d.family)) return [];
    if (!inside(t, p)) return [];
    // the source voice comes from the ensemble's roles (`EnsembleBlock.roles[…].source`, laid on by `ensembleTrack`)
    const near = want.near?.voice ? want.near : null;
    const far = near ? voiceDistance(e.v, near.voice!) : 0;
    // (an unmeasured pair is beyond any tolerance, a limit named or not)
    if (near && (!Number.isFinite(far) || (near.max !== undefined && far > near.max))) return [];
    const w = want.prefer && inside(t, want.prefer) ? e.w * preferLean(style) : e.w;
    // near a source, the tolerance does the excluding and every voice inside it is drawn at about even odds (the palette's
    // own weights and the part's `prefer` set aside), leaning gently to the nearer by the falloff (his ear, 10-28: the
    // swaps he liked are part of why it is no copy)
    return [{ timbre: e.v, voice, w: near ? Math.exp(-far / near.falloff) : w }];
  });
}

/** Interpolate the musical arch; the style supplies the actual sound controls. */
export function phraseArch(values: readonly number[], phase: number): number {
  const half = phase < .5 ? 0 : 1, mix = half ? (phase-.5)*2 : phase*2;
  return values[half] + (values[half+1]-values[half])*mix;
}
export function phrasePhase(starts: readonly number[], count: number, index: number): number {
  let group = 0;
  for (let i=1;i<starts.length&&starts[i]<=index;i++) group=i;
  const start = starts[group], end = starts[group+1] ?? count;
  return end-start <= 1 ? .5 : (index-start)/(end-start-1);
}

// Per-role space is a musical request; these engine sends belong to the
// interpreter, never to a recipe. Omitted requests retain every old default.
export const AMBIENCE_ROLES = ['backbeat', 'sixteenth', 'figure'] as const;
export const PRESENCE_ROLES = [...AMBIENCE_ROLES, 'sustained'] as const;
export const AMBIENCE_NAMES = ['intimate', 'spacious', 'distant', 'echo'] as const;
export type Ambience = Partial<Record<typeof AMBIENCE_ROLES[number], typeof AMBIENCE_NAMES[number]>>;
export type Presence = Partial<Record<typeof PRESENCE_ROLES[number], 'supporting' | 'background'>>;

export function presenceProblems(value: any): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['wants.presence must be keyed by role'];
  return Object.entries(value).flatMap(([role, level]) =>
    !(PRESENCE_ROLES as readonly string[]).includes(role) || !['supporting', 'background'].includes(String(level))
      ? [`wants.presence.${role}: use a supported role and supporting or background`] : []);
}

export function ambienceProblems(value: any): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['wants.ambience must be keyed by role'];
  return Object.entries(value).flatMap(([role, space]) =>
    !(AMBIENCE_ROLES as readonly string[]).includes(role) || !(AMBIENCE_NAMES as readonly string[]).includes(String(space)) || (role === 'figure' && space === 'distant')
      ? [`wants.ambience.${role}: use intimate or spacious; distant is available for backbeat and sixteenth percussion`] : []);
}
