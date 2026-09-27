// A measurement identifies musical data plus the algorithm revision. Data
// edits invalidate automatically; changes to generation/render semantics bump
// ALGORITHM_REVISION. Calibration itself is excluded (fitting is not sound).
import type { Style } from '@deep-house/engine/style';
const ALGORITHM_REVISION = 'composer-21/spaces-1/keys-1/phrases-1/piano-2/envelopes-1/vocal-2/membranes-1/duck-2';
// **Code-valued style is read by what it answers** (the measurement review of
// 09-22, #5). A style carries functions — a section kind's `layers(i, n)`, the
// development bridge's `layers()` — and until this round they were filtered
// out, so editing a section's layer rule moved every plan and left the stamp
// where it was. Their source text is no answer: the browser build minifies it,
// and the mining tools compare the page's stamp with node's. So a function is
// stamped by its table of answers — called once with no arguments, or for a
// phrase index and count, every i < n for n up to PHRASES — and a function of
// any other shape is refused, so a new kind of code-valued field has to be
// given a reading here before it can hide from the stamp.
// Engine voice and DSP code is covered only by the manual parts of
// ALGORITHM_REVISION (`piano-2`, `duck-2`, ...).
const PHRASES = 16;
function answers(fn: (...args: number[]) => unknown, at: string): unknown {
  if (fn.length === 0) return { calls: canonical(fn(), at) };
  if (fn.length === 2) {
    const table: unknown[] = [];
    for (let n = 1; n <= PHRASES; n++) for (let i = 0; i < n; i++) table.push(canonical(fn(i, n), at));
    return { phrases: table };
  }
  throw new Error(`generation: ${at} is a function of ${fn.length} arguments, which the stamp cannot read`);
}
function canonical(value: any, at = 'style'): any {
  if (typeof value === 'function') return answers(value, at);
  if (Array.isArray(value)) return value.map((v, i) => canonical(v, `${at}[${i}]`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map(key => [key, canonical(value[key], `${at}.${key}`)]));
  return value;
}
export function generationOf(style: Style): string {
  const { candidates, ...data } = style;
  const text = JSON.stringify(canonical(data));
  // Portable identity, not a security hash. Render files retain SHA-256/build ids.
  let hash = 2166136261;
  for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),16777619) >>> 0;
  return `${ALGORITHM_REVISION}/${hash.toString(16).padStart(8,'0')}`;
}
