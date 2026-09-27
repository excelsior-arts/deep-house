// One admission path for both explicit musical requests and ordinary draws.
import type { Style } from '@deep-house/engine/style';
import { BY_NAME } from '@deep-house/engine/voices';
import { switchOn } from '../lanes.ts';
import { ambienceProblems, presenceProblems, figureCandidates } from './figure.ts';
import { textureProblems, textureCandidates, toneProblems } from './texture.ts';
import { resolveRhythm } from './rhythm.ts';
import { motifWants, struckFigureProblems } from './validation.ts';
import { emptyParts, type PartRequest, type MusicalParts } from './types.ts';
import { charactersOf } from './sound.ts';
import type { CompositionPolicy } from '../composition-policy.ts';

export function resolveParts(request: PartRequest, style: Style, forbids: readonly string[] = [], namespace = 'recipe'):
  { parts: MusicalParts; errors: string[] } {
  const errors: string[] = [];
  const fields = new Set(['bassMotif','heldBass','struckFigures','texture','rhythm','tone','ambience','presence','pedalHarmony']);
  for (const key of Object.keys(request)) if (!fields.has(key)) errors.push(`unknown musical part field: ${key}`);
  const has = (role: string) => !forbids.includes(role) && style.lanes.some(l => l.role === role);
  if (request.bassMotif) {
    motifWants(request.bassMotif, m => errors.push(m));
    if (!switchOn(style, 'motif') || !has('bassline')) errors.push('no enabled bass motif lane');
  }
  if (request.heldBass && !has('bassline')) errors.push('held bass has no enabled lane');
  if (request.struckFigures?.length) {
    errors.push(...struckFigureProblems(request.struckFigures));
    if (!switchOn(style, 'motif') || request.struckFigures.some(p => !figureCandidates(p, style, forbids).length)) errors.push('struck part has no enabled candidate');
    if (request.struckFigures.some(p => p.support?.sustained === 'separate')) {
      const clearance = (style as Style & { composition?: CompositionPolicy }).composition?.placement?.sustainedClearanceBeats;
      if (!Number.isFinite(clearance) || clearance! < 0 || clearance! > 16)
        errors.push('style has no bounded sustained separation policy');
    }
  }
  if (request.texture) {
    errors.push(...textureProblems(request.texture));
    if (!switchOn(style, 'motif') || !textureCandidates(request.texture, style, forbids).length) errors.push('pulse has no enabled candidate');
  }
  if (request.bassMotif && request.heldBass) errors.push('a bass lane cannot be held and phrased together');
  const rhythm = resolveRhythm(request.rhythm, style, forbids, namespace);
  errors.push(...rhythm.errors);
  if (request.ambience) errors.push(...ambienceProblems(request.ambience));
  if (request.presence) errors.push(...presenceProblems(request.presence));
  if (request.tone) errors.push(...toneProblems(request.tone));
  const characters = charactersOf(style);
  for (const [role, name] of Object.entries(request.tone || {})) {
    const profile = characters?.tone[role]?.[name];
    const lanes = style.lanes.filter(l => l.role === role);
    if (!profile || !has(role) || !lanes.length || lanes.some(l => !l.voices?.some(v => v.w > 0)
      || l.voices.filter(v => v.w > 0).some(v => !profile.requires.every(k => BY_NAME[String(v.v)]?.noteControls?.includes(k))))) {
      errors.push(`${role} character has no capable enabled lane`);
    }
  }
  if ((request.texture || Object.keys(request.ambience || {}).length || Object.keys(request.presence || {}).length) && !characters) errors.push('style declares no sound characters');
  const snapshot = structuredClone(request);
  const parts: MusicalParts = { ...emptyParts(), ...snapshot,
    bassMotif: snapshot.bassMotif ?? null, texture: snapshot.texture ?? null,
    rhythm: structuredClone(rhythm.lanes),
  };
  return { parts: errors.length ? emptyParts() : parts, errors };
}
