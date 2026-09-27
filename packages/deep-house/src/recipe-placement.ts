// Playback requirements, distinct from a recipe's measured bird box and a
// style's taste/probabilities. Unsupported contexts are refused, never guessed.
export interface RecipePlacement {
  roles: string[];
  grammar: string;
  beatsPerBar: number;
  drums?: boolean;
  kits?: string[];
}
export interface RecipeSource extends RecipePlacement { id: string; revision: number }
export function placementProblems(p: any): string[] {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['placement must be an object'];
  const bad: string[] = [];
  if (Object.keys(p).some(k=>!['roles','grammar','beatsPerBar','drums','kits'].includes(k))) bad.push('unknown placement field');
  if (!Array.isArray(p.roles) || !p.roles.length || p.roles.some((r: unknown)=>typeof r!=='string'||!r.trim())
    || new Set(p.roles).size!==p.roles.length) bad.push('placement needs unique logical roles');
  if (typeof p.grammar!=='string'||!p.grammar.trim()) bad.push('placement needs a grammar');
  if (!Number.isSafeInteger(p.beatsPerBar)||p.beatsPerBar<1) bad.push('placement needs a positive meter');
  if (p.drums!==undefined && typeof p.drums!=='boolean') bad.push('placement drums must be boolean');
  if (p.kits!==undefined && (!Array.isArray(p.kits)||!p.kits.length||p.kits.some((k: unknown)=>typeof k!=='string'||!k.trim())
    || new Set(p.kits).size!==p.kits.length)) bad.push('placement needs unique kit names');
  return bad;
}
