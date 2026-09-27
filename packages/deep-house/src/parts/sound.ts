// Style-owned interpretation of musical characters into engine controls.
import type { Style, Table } from '@deep-house/engine/style';
import type { NoteParams } from '@deep-house/engine/voices/descriptor';

export interface RhythmSound { params: NoteParams; gainDb: number }
export interface RhythmCharacter extends RhythmSound {
  requires: string[];
  /** Complete sound for each musical stroke; no implicit parameter merging. */
  strokes?: Record<string, RhythmSound>;
}
export interface SoundCharacters {
  rhythm?: Record<string, RhythmCharacter>;
  phrases?: Record<string, { requires: string[]; params: Record<string, [number,number,number]>; beats: Record<string, [number,number,number]>; treatment?: 'none' }>;
  presence: { backgroundDb: number };
  ambience: Record<'intimate' | 'spacious' | 'distant', { room: number; reverb: number; delay: number; background?: number }>;
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
  }
  for (const [name, p] of Object.entries(c.phrases || {})) {
    if (!p || !Array.isArray(p.requires) || !p.requires.every(k => typeof k === 'string')
      || (p.treatment !== undefined && p.treatment !== 'none') || !object(p.params) || !object(p.beats)
      || ![...Object.values(p.params), ...Object.values(p.beats)].every(arch)
      || Object.entries(p.beats).some(([k, v]) => k in p.params || v.some(n => n <= 0)))
      bad.push(`phrase character ${name}: declared controls, entry/crest/exit params and positive beats not repeated in params`);
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
