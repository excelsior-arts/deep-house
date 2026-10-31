// ensemble-salt.ts — an ensemble's salt, measured (10-28, `src/ensemble.ts`): every relation its row states, read off a
// planned theme's events, against the range the row gives it. The tripwire: `tools/check-ensembles.ts` runs it over
// forty seeds an ensemble, and a relation out of its range fails loudly.
//
//   node tools/ensemble-salt.ts <ensemble id> [--seeds 1,2,3] [--spell em:0.39,...] [--reach 0.5]    a table a seed
//
// The roles are found by the row's selectors (a part's name, `as`; a layer; a role); a relation is measured over the
// theme's mains and drops (where every role plays), the breakdown for `absentIn`.
import { planTheme } from '../src/mix.ts';
import { tolerancesAt } from '../src/ensemble.ts';
import { parseSpell } from '../src/spell.ts';
import { recipeById } from '../src/recipes.ts';
import type { EnsembleBlock, Relation, RoleSelector } from '../src/ensemble.ts';
import type { Recipe } from '../src/recipe.ts';
import { voiceDistance } from '../src/parts/figure.ts';

type Ev = { t: number; bar: number; step: number; voice: string; layer: string; role?: string; ensemble?: string; p: Record<string, any> };
export interface Salt { relation: Relation; value: number; ok: boolean }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/** Every relation of an ensemble, measured on one planned theme. */
export function saltOf(track: { events: Ev[]; barSeconds: number; bars: number; arrangement: { sections: Array<{ kind: string; startBar: number; bars: number }> };
  timeline?: Array<{ bar: number; layers: string[] }> }, block: EnsembleBlock, reach = 0): Salt[] {
  const kindAt = (bar: number) => track.arrangement.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars)?.kind ?? '';
  const isMain = (bar: number) => ['main', 'drop'].includes(kindAt(bar));
  const pick = (sel: RoleSelector) => (e: Ev) => 'as' in sel ? e.ensemble === sel.as : 'layer' in sel ? e.layer === sel.layer : e.role === sel.role;
  const of = (role: string, where = isMain) => track.events.filter((e) => where(e.bar) && pick(block.roles[role])(e));
  const at = (e: Ev) => e.bar * 16 + e.step;
  const onsets = (es: Ev[]) => new Set(es.map(at));
  const mainBars = Array.from({ length: track.bars }, (_, b) => b).filter(isMain);
  // where a role's own layer is open in the theme's timeline: the house's form may rest the keys for a phrase of a long
  // main (its development, not the ensemble's relation), so a role's density and fill are read where it may play
  const GATES: Record<string, string[]> = { keys: ['keys'], pad: ['pad', 'keys'], bass: ['bass'], kick: ['kick'], hats: ['hatClosed', 'hatOpen'], shaker: ['sixteenths'], clap: ['clap'] };
  const layerOfRole = (role: string) => track.events.find(pick(block.roles[role]))?.layer;
  const open = (role: string) => { const g = GATES[layerOfRole(role) ?? ''];
    return (b: number) => !g || !track.timeline?.[b] || g.some((x) => track.timeline![b].layers.includes(x)); };
  // the breath's windows on each main's and drop's own clock, wholly inside it, in steps
  const B = block.breath;
  const windows: Array<readonly [number, number]> = [];
  if (B) for (const sec of track.arrangement.sections.filter((x) => ['main', 'drop'].includes(x.kind)))
    for (let k = 0; ; k++) {
      const from = (sec.startBar + k * B.every) * 16 + B.at * 4, to = from + B.beats * 4;
      if (to > (sec.startBar + sec.bars) * 16) break;
      windows.push([from, to]);
    }
  const measure = (r: Relation): number => {
    const A = of(r.a), On = onsets(A);
    switch (r.measure) {
      case 'density': return On.size / Math.max(1, mainBars.filter(open(r.a)).length);
      case 'onTheBeat': return [...On].filter((s) => s % 4 === 0).length / Math.max(1, On.size);
      case 'offbeatEighths': return [...On].filter((s) => s % 4 === 2).length / Math.max(1, On.size);
      case 'chords': { const n = new Map<number, number>(); for (const e of A) n.set(at(e), (n.get(at(e)) ?? 0) + 1); return [...n.values()].filter((k) => k > 1).length / Math.max(1, n.size); }
      case 'shared': { const Bs = onsets(of(r.b!)); return [...On].filter((s) => Bs.has(s)).length / Math.max(1, Math.min(On.size, Bs.size)); }
      case 'over': return median(A.map((e) => Number(e.p.midi)).filter(Number.isFinite)) - median(of(r.b!).map((e) => Number(e.p.midi)).filter(Number.isFinite));
      case 'breathRests': return windows.filter(([x, y]) => ![...On].some((s) => s >= x && s < y)).length / Math.max(1, windows.length);
      case 'breathFilled': { const w = windows.filter(([x]) => open(r.a)(Math.floor(x / 16)));
        return w.filter(([x, y]) => [...On].some((s) => s >= x && s < y)).length / Math.max(1, w.length); }
      case 'barsPlayed': return new Set(A.map((e) => e.bar)).size / Math.max(1, mainBars.filter(open(r.a)).length);
      case 'dry': return median(A.map((e) => Number(e.p.dry ?? 1)));
      case 'median': return median(A.map((e) => Number(e.p.midi)).filter(Number.isFinite));
      // the farthest voice the role played from its source (`near` on the part): the drawn timbre is the note's preset
      case 'voiceDistance': return Math.max(0, ...[...new Set(A.map((e) => String(e.p.preset ?? e.voice)))].map((v) => voiceDistance(v, r.voice!)));
      case 'wet': return median(A.map((e) => ['reverb', 'hall', 'immersed', 'background'].reduce((n, k) => n + Number(e.p[k] ?? 0), 0)));
      case 'absentIn': { const bars = Array.from({ length: track.bars }, (_, b) => b).filter((b) => kindAt(b) === r.section);
        return bars.length ? new Set(of(r.a, (b) => kindAt(b) === r.section).map((e) => e.bar)).size / bars.length : 0; }
    }
  };
  // the roles' ingredient tolerances (`RoleSelector.tolerance`), read as relations of their own: the voice near its source,
  // the register near the study's; at the draw's reach as the composer widened them (`tolerancesAt`), the relations as written
  const tol = tolerancesAt(block, reach), r3 = (x: number) => +x.toFixed(3);
  const tolerances: Relation[] = Object.entries(block.roles).flatMap(([role, s]) => [
    ...(s.source && tol[role].voice !== undefined ? [{ says: `${role}: its voice near the study's (${s.source})`, measure: 'voiceDistance', a: role, voice: s.source, range: [0, r3(tol[role].voice!)] } as Relation] : []),
    ...(s.register !== undefined && tol[role].register !== undefined ? [{ says: `${role}: its register near the study's (median ${s.register})`, measure: 'median', a: role,
      range: [r3(s.register - tol[role].register!), r3(s.register + tol[role].register!)] } as Relation] : []),
  ]);
  return [...block.relations, ...tolerances].map((relation) => {
    const value = +measure(relation).toFixed(3);
    return { relation, value, ok: Number.isFinite(value) && value >= relation.range[0] - 1e-9 && value <= relation.range[1] + 1e-9 };
  });
}

/** One theme of an ensemble at a seed, a spell and a reach (the machine view's draw slider): its plan and its salt. */
export function ensembleAt(row: Recipe, seed: string, spell: Record<string, number>, reach = 0) {
  const t = planTheme(seed, 0, { strategy: 'house-v2', spell, recipe: row, ...(reach ? { reach } : {}) }) as any;
  return { t, salt: saltOf(t, row.ensemble as EnsembleBlock, reach) };
}

if (process.argv[1]?.endsWith('ensemble-salt.ts')) {
  const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
  const row = recipeById(process.argv[2])!;
  const spell = parseSpell(arg('spell', 'em:0.39')!) as Record<string, number>;
  for (const seed of arg('seeds', '1,2,3')!.split(',')) {
    const { t, salt } = ensembleAt(row, seed, spell, Number(arg('reach', '0')));
    const voices = [...new Set(t.events.filter((e: Ev) => e.ensemble || e.layer === 'bass' || e.role === 'texture').map((e: Ev) => `${e.ensemble ?? e.role ?? e.layer}:${e.voice}`))].join(' ');
    console.log(`\nseed ${seed}: ${t.key.name}, ${t.bpm} BPM; ${voices}`);
    for (const s of salt) console.log(`  ${s.ok ? 'ok  ' : 'OUT '} ${s.relation.says}: ${s.value} (${s.relation.range.join('-')})`);
  }
}
