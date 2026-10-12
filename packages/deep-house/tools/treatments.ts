// treatments.ts — the treatment rows' audit (round T1, PLAN-TREATMENTS): each
// playable row pinned at its point, planned exactly as its link plays it, and
// where it was heard — the bars the readout names by the row's name. Since
// round T2 the section rows too: a section row pinned plays for its kind on
// every section of the kind the form draws, and what is counted is the bars
// of those sections, named by the kind's word and the row's own name.
//
//   node tools/treatments.ts            plan every point; non-zero where a playable row is never heard
//   node tools/treatments.ts --links    print the links and plan nothing
//
// The points are `tools/treatment-audit.json`: every row of the library and
// every candidate the mechanism plays, under the fast broken key, where every
// kind draws; and two unpinned themes — the house and the key — where the
// draw plays the rows by their weights. No browser and no render: a figure
// is a plan's events, and the ear is the link's.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planTheme, recipesFor } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { linkRead, linkWrite } from '../src/link.ts';
import { recipeById } from '../src/recipes.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIT = JSON.parse(fs.readFileSync(path.join(HERE, 'treatment-audit.json'), 'utf8')) as {
  keys: Record<string, { spell: string }>;
  themes: Record<string, { seed: string; theme: number; key: string; t?: number }>;
  rows: Record<string, { seed: string; theme: number; key: string }>;
};

export interface TreatmentPoint { id: string | null; name: string; seed: string; theme: number; key: string; search: string }

/** Every audit point as the link that plays it: the rows pinned, then the two themes. */
export function treatmentPoints(): TreatmentPoint[] {
  const link = (seed: string, theme: number, key: string, recipe: string | null, t?: number) => {
    const spell = AUDIT.keys[key].spell;
    const q = linkWrite({ seed, theme: theme - 1, strategy: 'house-v2', spell: spell ? parseSpell(spell) : null, recipe,
      accompaniment: 'base', development: 'base' }, '', { explicit: true });
    return t ? `${q}&t=${t}` : q;
  };
  return [
    ...Object.entries(AUDIT.rows).map(([id, p]) => ({ id, name: id, seed: p.seed, theme: p.theme, key: p.key, search: link(p.seed, p.theme, p.key, id) })),
    ...Object.entries(AUDIT.themes).map(([name, p]) => ({ id: null, name, seed: p.seed, theme: p.theme, key: p.key, search: link(p.seed, p.theme, p.key, null, p.t) })),
  ];
}

const quiet = <T,>(f: () => T): T => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'treatments.ts')) {
  const points = treatmentPoints();
  if (process.argv.includes('--links')) {
    for (const p of points) console.log(`${p.name.padEnd(28)} ?${p.search}`);
    process.exit(0);
  }
  let silent = 0;
  for (const p of points) {
    const read = quiet(() => linkRead(`?${p.search}`));
    const refused = read.problems.map((x: { say?: string; param?: string }) => x.say ?? x.param ?? String(x));
    const cast = quiet(() => recipesFor({ masterSeed: p.seed, strategy: 'house-v2', search: `?${p.search}` }));
    const t = quiet(() => planTheme(p.seed, p.theme - 1, { strategy: 'house-v2', spell: cast.spell, recipe: cast.track }));
    const row = p.id ? recipeById(p.id) : null;
    // A section row: the sections of its kind, by their first bar; a treatment row: the bars named by the figure.
    const sections = row?.scope === 'section';
    const named = sections ? [] : t.timeline.filter((r) => r.sub);
    const by = new Map<string, number[]>();
    if (sections) for (const s of t.arrangement.sections.filter((s) => s.row === row!.id)) {
      const k = `${s.label}${s.name ? ` · ${s.name}` : ''} ${s.bars} bars`; if (!by.has(k)) by.set(k, []); by.get(k)!.push(s.startBar);
    }
    for (const r of named) { const k = `${r.section} · ${r.sub}`; if (!by.has(k)) by.set(k, []); by.get(k)!.push(r.bar); }
    const where = [...by].map(([k, bars]) => `${k} ×${bars.length} (${bars.slice(0, 6).join(', ')}${bars.length > 6 ? ', …' : ''})`).join('; ');
    const heard = sections ? t.arrangement.sections.filter((s) => s.row === row!.id).reduce((n, s) => n + s.bars, 0)
      : row ? named.filter((r) => r.sub === row.name).length : named.length;
    if (p.id && !heard) silent++;
    console.log(`${p.name.padEnd(28)} ${String(t.bpm).padStart(3)} BPM, ${t.bars} bars: ${heard ? `${heard} bar${heard === 1 ? '' : 's'}` : 'NOT HEARD'}${where ? ` — ${where}` : ''}${refused.length ? ` [refused: ${refused.join('; ')}]` : ''}`);
  }
  if (silent) { console.log(`${silent} row${silent === 1 ? '' : 's'} never heard`); process.exit(1); }
}
