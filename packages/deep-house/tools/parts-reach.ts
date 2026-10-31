// parts-reach.ts — where the reference-learning parts play (the reference-learning finish, 10-28): over seeds 1-N, themes 1-3, at
// the house, the ensembles' places, the tiles beside it and the slow side, the share of themes drawing each part of the
// composition's families that came from the two accepted arrangements, and the drone scene's share.
//
//   node tools/parts-reach.ts                 the table
//   node tools/parts-reach.ts --seeds 12      fewer seeds, for a fast loop
//   node tools/parts-reach.ts --tree <dir>    another checkout's composer (a before), read the same way
//   node tools/parts-reach.ts --reach 0.5     at a reach of the dial (the machine view's DRAW; 0 by default, as every link):
//                                             the ensembles' zones widen past their radius (engine-data)
//
// Read off the plans' composition trace (`dice.composition`), never a render.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = +(arg('seeds', '40')!);
const REACH = +(arg('reach', '0')!);
const TREE = arg('tree') ? path.resolve(arg('tree')!, 'packages/deep-house') : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { planTheme } = await import(path.join(TREE, 'src/mix.ts'));
const { asSpell, HOUSE } = await import(path.join(TREE, 'src/spell.ts'));
const { SKY_PLACES, SKY_DOTS } = await import(path.join(TREE, 'src/sky.ts'));
const star = (id: string) => SKY_PLACES.find((p: { id: string }) => p.id === id)?.spell ?? null;
const dots = (id: string) => SKY_DOTS.filter((d: { star: string }) => d.star === id).map((d: { spell: unknown }, i: number) => [`${id.split('/').pop()} dot ${i + 1}`, d.spell]);
const GROUPS: Array<[string, Array<[string, Record<string, number> | null]>]> = [
  ['the house', [['Deep House', {}], ...dots('house/deep-house'), ['Tech House', star('house/tech-house')],
    ['the conversation\'s place', { tide: 0.6, zephyr: 0.53, root: 0.76, gleam: 0.4, veil: 0.58, spark: 0.38 }],
    ['half-way to it', { tide: 0.58, zephyr: 0.45, root: 0.74, gleam: 0.38, veil: 0.53, spark: 0.33 }],
    ['body and distance\'s place', { zephyr: 0.7, root: 0.3, gleam: 0.7, veil: 0.7, spark: 0.16, loom: 0.3 }],
    ['half-way to it', { zephyr: 0.54, root: 0.51, gleam: 0.53, veil: 0.59, spark: 0.22, loom: 0.44 }],
    ['house, Veil 0.9', { veil: 0.9 }], ['house, Veil 0.1', { veil: 0.1 }], ['house, Spark 0.42', { spark: 0.42 }]] as any],
  ['the tiles beside it', [['Techno', star('techno')], ['Breaks', star('breaks-and-big-beat')], ['Trance', star('trance')],
    ['Liquid', star('dnb-and-dub/liquid')], ['Dub Techno', star('dnb-and-dub/dub-techno')]] as any],
  ['the slow side', [['Downtempo', star('ambient-and-downtempo/downtempo')], ['Trip Hop', star('ambient-and-downtempo/trip-hop')],
    ['Ambient', star('ambient-and-downtempo/ambient')], ['Drone', star('ambient-and-downtempo/drone')],
    ['Ambient Dub', star('ambient-and-downtempo/ambient-dub')], ['Bells', star('ambient-and-downtempo/bells')]] as any],
];
const PARTS: Array<[string, (s: Record<string, string>, d?: Record<string, unknown>) => boolean]> = [
  ['the conversation', (_s, d) => d?.ensemble === 'ensembles/the-conversation'],
  ['body and distance', (_s, d) => d?.ensemble === 'ensembles/body-and-distance'],
  ['ringing chords', (s) => s['ringing-keys'] === 'ringing-chords'],
  ['soft phrase', (s) => s['ringing-keys'] === 'soft-phrase'],
  ['phrase + chords', (s) => s['ringing-keys'] === 'phrase-and-chords'],
  ['single tones', (s) => s['ringing-keys'] === 'whole-notes' || s['ringing-keys'] === 'half-notes'],

  ['immersed pulse', (s) => !!s.pulse],
  ['distant backbeat', (s) => !!s['receding-backbeat']],
];
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)} %`;
console.log(`| group | place | themes | drone scene | ${PARTS.map(([n]) => n).join(' | ')} |\n|---|---|---|---|${PARTS.map(() => '---|').join('')}`);
for (const [group, list] of GROUPS) for (const [name, spell] of list) {
  if (!spell) continue;
  let n = 0, drone = 0; const hits = PARTS.map(() => 0);
  for (let seed = 1; seed <= SEEDS; seed++) for (let theme = 0; theme < 3; theme++) {
    const t = planTheme(String(seed), theme, { strategy: 'house-v2', spell: asSpell({ ...HOUSE, ...spell }), ...(REACH ? { reach: REACH } : {}) });
    const tr = typeof t.dice.composition === 'string' ? JSON.parse(t.dice.composition) : { selected: {} };
    n++; if (tr.scene && tr.scene !== 'air') drone++;
    PARTS.forEach(([, f], i) => { if (f(tr.selected ?? {}, t.dice)) hits[i]++; });
  }
  console.log(`| ${group} | ${name} | ${n} | ${pct(drone, n)} | ${hits.map((h) => pct(h, n)).join(' | ')} |`);
}
