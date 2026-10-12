// A measurement identifies musical data plus the algorithm revision. Data
// edits invalidate automatically; changes to generation/render semantics bump
// ALGORITHM_REVISION. Calibration itself is excluded (fitting is not sound).
import type { Style } from '@deep-house/engine/style';
import { weightOf, type Recipe } from './recipe.ts';
import { switchOn } from './lanes.ts';
import { LIBRARY, PATTERN_LIBRARY, TRACK_LIBRARY, TREATMENTS, SECTION_LIBRARY, GLIDE_LIBRARY, FORM_LIBRARY } from './recipes.ts';
import { RIFF_ROWS, PHRASED_ROWS } from './glide.ts';
import { KIT_ROWS } from './kit.ts';
import ROW_PLACES from './row-places.json' with { type: 'json' };
const ALGORITHM_REVISION = 'composer-21/spaces-1/keys-1/phrases-1/piano-2/envelopes-1/vocal-2/membranes-1/duck-2/place-push-1/phrase-body-1';
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
/** FNV-1a over a text: a portable identity, not a security hash. Render files retain SHA-256/build ids. */
function fnv(text: string): string {
  let hash = 2166136261;
  for (let i=0;i<text.length;i++) hash = Math.imul(hash ^ text.charCodeAt(i),16777619) >>> 0;
  return hash.toString(16).padStart(8,'0');
}

/**
 * **What the draws a style makes can reach, outside the style** (the
 * September review's third contract fault, kept open in NEXT and rechecked by
 * the review of 10-03): the library's rows are drawn by weight and placed
 * by `row-places.json`, and neither is style data, so a weight or a place moved
 * every plan a library turn makes and left the stamp where it was. Each row a
 * die can reach is read by its resolved definition (`definitionOf`: id,
 * revision and content, so an edit the revision did not mark moves the stamp
 * too) and its share (`weightOf`, the chef's hand and the likes in it), the
 * place table whole; only what the style's own switches draw from — house-v1
 * draws from none of it and its stamp does not read it. The place tables'
 * own rows are read the same way (review of 10-08, A4): the riffs, the
 * phrased cells, the kits, the glide rows and the forms.
 */
function reachOf(style: Style): unknown {
  const rows = (list: readonly unknown[]) => (list as readonly Recipe[]).map((r) => [definitionOf(r), weightOf(r)]);
  const out: Record<string, unknown> = {};
  if (switchOn(style, 'libraryDraw')) {
    out.library = rows([...LIBRARY, ...PATTERN_LIBRARY, ...TRACK_LIBRARY]);
    out.places = canonical(ROW_PLACES, 'row-places');
  }
  if (switchOn(style, 'subSections')) out.treatments = rows(TREATMENTS);
  if (switchOn(style, 'placeTables')) {
    out.sections = rows(SECTION_LIBRARY);
    out.riffs = rows(RIFF_ROWS);
    out.phrased = rows(PHRASED_ROWS);
    out.kits = rows(KIT_ROWS);
    out.glides = rows(GLIDE_LIBRARY);
    out.forms = rows(FORM_LIBRARY);
  }
  return Object.keys(out).length ? out : null;
}

export function generationOf(style: Style): string {
  const { candidates, ...data } = style;
  const reach = reachOf(style);
  const text = JSON.stringify(canonical(reach ? { ...data, reach } : data));
  return `${ALGORITHM_REVISION}/${fnv(text)}`;
}

/**
 * **A row's resolved definition** (R02 of the review of 10-03): its id
 * names the musical work and its revision and content say which definition of
 * it was played. Two rows are one definition when this is equal — the id, the
 * revision and a fingerprint of the whole canonical row — so a pinned section
 * row of the grammar's own id but a new revision is played and not taken for
 * the grammar's own, and a plan made ahead is reused only for the definition
 * it was made from (`mix.ts`). One helper, for every place that asks.
 */
export function definitionOf(row: Recipe | null | undefined): string | null {
  if (!row) return null;
  return `${row.id}@${row.revision ?? 1}#${fnv(JSON.stringify(canonical(row, row.id)))}`;
}
