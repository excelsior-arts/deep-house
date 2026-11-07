// Style-owned interpretation of musical characters into engine controls.
import type { Style, Table } from '@deep-house/engine/style';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';

export interface RhythmSound { params: NoteParams; gainDb: number }
export interface RhythmCharacter extends RhythmSound {
  requires: string[];
  /** Complete sound for each musical stroke; no implicit parameter merging. */
  strokes?: Record<string, RhythmSound>;
  /** The part's level over every stroke's own matched `gainDb`, in decibels (10-13, the hand part's level); none is nought. */
  levelDb?: number;
}
export interface SoundCharacters {
  rhythm?: Record<string, RhythmCharacter>;
  phrases?: Record<string, { requires: string[]; params: Record<string, [number,number,number]>; beats: Record<string, [number,number,number]>; treatment?: 'none';
    /**
     * **The player's touch** (10-28): a chord's notes struck low to high `rollMs` apart (each gap 70-100 % of it),
     * the whole strike `timingMs` early or late at most, and the level through a curve, `velocityCurve` over 1
     * making a soft note softer and leaving a full one where it was. Absent, every note is struck as written.
     */
    touch?: { rollMs: number; timingMs: number; velocityCurve: number;
      /** a chord's accent at least this share of the phrase's strongest (its tones never curved down): a chord outweighs a single note */
      chordFloor?: number;
      /** where the phrase also plays single notes: a chord's tones together this many dB over its typical single note */
      chordOverDb?: number } }>;
  presence: { backgroundDb: number };
  ambience: Record<'intimate' | 'spacious' | 'distant' | 'echo' | 'tidal', { room: number; reverb: number; delay: number; background?: number; echo?: number }>;
  tone: Record<string, Record<string, { requires: string[]; params: NoteParams }>>;
  pulse: { register: [number, number]; articulation: NoteParams; space: Record<'distant' | 'immersed', NoteParams> };
  /**
   * How a requested pitched part is placed and sounded: the octave its chord
   * root is folded into, the register every note must stay inside, the short
   * struck length when a part names no duration (a share of the time to the
   * next onset, between a floor and a ceiling, in seconds), and its sends.
   */
  figure: { home: [number, number]; register: [number, number];
    struck: { floor: number; ceiling: number; share: number }; sends: NoteParams;
    /**
     * Where a phrase's octave is chosen: `bar`, afresh from each bar's chord
     * (every approved study was heard this way), or `statement`, once from a
     * statement's first chord and then the nearest octave on each chord. An
     * unset switch is `bar`.
     */
    fold?: 'bar' | 'statement' };
  returns: NonNullable<Table['backgroundSpaces']>;
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const arch = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/**
 * What is malformed in a style's characters, one line per entry, naming it.
 * A character is taste data; a malformed one is the style's fault and must not
 * read as "no capable candidate" to the request that happened to reach it.
 */
export function characterProblems(c: SoundCharacters): string[] {
  const bad: string[] = [];
  const sound = (s: any, requires: readonly string[]): boolean => object(s) && object(s.params)
    && Number.isFinite(s.gainDb) && Math.abs(s.gainDb) <= 18
    && Object.entries(s.params).every(([key, value]) => requires.includes(key) && Number.isFinite(value));
  for (const [name, r] of Object.entries(c.rhythm || {})) {
    const requires = Array.isArray(r?.requires) && r.requires.every(k => typeof k === 'string') ? r.requires : null;
    if (!requires || !sound(r, requires)) bad.push(`rhythm character ${name}: declared controls, finite params among them and a gain within 18 dB`);
    else if (r.strokes !== undefined && (!object(r.strokes) || !Object.values(r.strokes).every(s => sound(s, requires))))
      bad.push(`rhythm character ${name}: every stroke a complete sound over the character's own controls`);
    if (r?.levelDb !== undefined && !(Number.isFinite(r.levelDb) && Math.abs(r.levelDb) <= 18)) bad.push(`rhythm character ${name}: a part level within 18 dB`);
  }
  for (const [name, p] of Object.entries(c.phrases || {})) {
    if (!p || !Array.isArray(p.requires) || !p.requires.every(k => typeof k === 'string')
      || (p.treatment !== undefined && p.treatment !== 'none') || !object(p.params) || !object(p.beats)
      || ![...Object.values(p.params), ...Object.values(p.beats)].every(arch)
      || Object.entries(p.beats).some(([k, v]) => k in p.params || v.some(n => n <= 0)))
      bad.push(`phrase character ${name}: declared controls, entry/crest/exit params and positive beats not repeated in params`);
    const t = p?.touch;
    if (t !== undefined && (!object(t) || Object.keys(t).some(k => !['rollMs', 'timingMs', 'velocityCurve', 'chordFloor', 'chordOverDb'].includes(k))
      || !(t.rollMs >= 0 && t.rollMs <= 60) || !(t.timingMs >= 0 && t.timingMs <= 30) || !(t.velocityCurve >= .5 && t.velocityCurve <= 3)
      || (t.chordFloor !== undefined && !(t.chordFloor > 0 && t.chordFloor <= 1)) || (t.chordOverDb !== undefined && !(t.chordOverDb >= 0 && t.chordOverDb <= 6))))
      bad.push(`phrase character ${name}: a touch of a 0-60 ms roll, 0-30 ms of timing and a velocity curve in 0.5-3`);
  }
  const f = c.figure;
  if (f !== undefined) {
    const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] < v[1];
    if (!pair(f.home) || !pair(f.register) || f.home[0] < f.register[0] || f.home[1] > f.register[1]
      || !object(f.struck) || ![f.struck.floor, f.struck.ceiling, f.struck.share].every(n => Number.isFinite(n) && n > 0)
      || f.struck.floor > f.struck.ceiling || !object(f.sends) || !Object.values(f.sends).every(Number.isFinite)
      || (f.fold !== undefined && f.fold !== 'bar' && f.fold !== 'statement'))
      bad.push('figure character: a home octave inside the register, a positive struck floor/ceiling/share and finite sends');
  }
  return bad;
}

const checked = new WeakSet<object>();
/**
 * The style's characters, validated once per table (the branch review of 09-22,
 * composition #5): a malformed entry throws with its name at the first reader
 * — `src/strategies/index.ts` reads both shipped styles at load — instead of
 * quietly emptying every request that reaches it.
 */
export function charactersOf(style: Style): SoundCharacters | undefined {
  const c = (style as Style & { characters?: SoundCharacters }).characters;
  if (!c || checked.has(c)) return c;
  const bad = characterProblems(c);
  if (bad.length) throw new Error(`style ${style.id}: ${bad.join('; ')}`);
  checked.add(c);
  return c;
}
