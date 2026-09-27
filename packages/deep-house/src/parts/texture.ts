// A sparse harmonic punctuation, on the musical clock but with its own phrase
// and space. It borrows an enabled instrument, never the foreground's pattern.
import type { Style } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import { figureCandidates, type StruckFigure } from './figure.ts';
import { rhythmProblems, type RhythmPart } from './rhythm.ts';

export interface PulseTexture {
  follows: 'harmony';
  articulation: 'pulse';
  register: 'mid';
  families: string[];
  properties?: RhythmPart['properties'];
  strength: [number, number];
  spacing: { bars: [number, number] };
  entry: { beats: [number, number] };
  duration: { beats: [number, number] };
  ambience: 'distant' | 'immersed';
}

export function textureProblems(value: any): string[] {
  const at = 'wants.figures.texture';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${at}: expected one pulse part`];
  const bad: string[] = [];
  if (value.follows !== 'harmony' || value.articulation !== 'pulse' || value.register !== 'mid' || !['distant', 'immersed'].includes(value.ambience)) bad.push(`${at}: use a mid-register harmonic pulse in distant or immersed space`);
  if (Object.keys(value).some(k => !['follows', 'articulation', 'register', 'families', 'properties', 'strength', 'spacing', 'entry', 'duration', 'ambience'].includes(k))) bad.push(`${at}: unknown instruction`);
  rhythmProblems({ sixteenth: [{ bars: 1, steps: [0], accents: [1], families: value.families, properties: value.properties }] }).forEach(m => bad.push(m.replace('wants.rhythm.sixteenth[0]', at)));
  const span = (v: any, name: string, lo: number, hi: number, integer = false) => {
    if (!Array.isArray(v) || v.length !== 2 || v.some(x => !Number.isFinite(x) || x < lo || x > hi || (integer && !Number.isInteger(x))) || v[0] > v[1]) bad.push(`${at}.${name}: invalid range`);
  };
  span(value.strength, 'strength', .01, 1);
  for (const [key, unit, lo, hi, integer] of [['spacing', 'bars', 2, 16, true], ['entry', 'beats', 0, 63, false], ['duration', 'beats', .125, 4, false]] as const) {
    span(value[key]?.[unit], `${key}.${unit}`, lo, hi, integer);
    if (value[key] && Object.keys(value[key]).some(k => k !== unit)) bad.push(`${at}.${key}: unknown instruction`);
  }
  if (value.entry?.beats?.[1] + value.duration?.beats?.[1] > 4 * value.spacing?.bars?.[0]) bad.push(`${at}: pulse and entry must fit its spacing`);
  return bad;
}

export function textureCandidates(want: PulseTexture, style: Style, forbids: readonly string[]) {
  if (forbids.includes('texture')) return [];
  return figureCandidates(want as unknown as StruckFigure, style, forbids)
    .filter(c => [want.ambience === 'immersed' ? 'immersed' : 'background', 'indexMul'].every(k => BY_NAME[c.voice].noteControls?.includes(k)));
}

export type Tone = { kick?: 'rounded'; bassline?: 'defined' | 'full' };
export function toneProblems(value: any): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['wants.tone: expected role characters'];
  return Object.entries(value).flatMap(([role, tone]) =>
    (role === 'kick' && tone === 'rounded') || (role === 'bassline' && ['defined', 'full'].includes(tone as string)) ? [] : [`wants.tone.${role}: unsupported character`]);
}
