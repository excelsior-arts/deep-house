// A requested upper phrase has its own family and random stream. It can play
// beside a bass motif without replacing it or reopening a sustained layer.
import type { Style } from '@deep-house/engine/style';
import { BY_NAME, TIMBRES, voicePlaying } from '@deep-house/engine/voices';
import type { MotifBox } from '../motif.ts';
import { inside, preferLean, type RhythmPart } from './rhythm.ts';
import { charactersOf } from './sound.ts';

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
  /** Omit attacks inside these half-open beat windows, on the theme clock. */
  rests?: { bars: number; beats: [number, number][] };
  /** Reserve harmonic space during this part's active sections. */
  support?: { sustained: 'separate' };
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
    return [{ timbre: e.v, voice, w: want.prefer && inside(t, want.prefer) ? e.w * preferLean(style) : e.w }];
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
export const AMBIENCE_NAMES = ['intimate', 'spacious', 'distant'] as const;
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
