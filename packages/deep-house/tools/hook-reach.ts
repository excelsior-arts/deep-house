// hook-reach.ts — where the hook plays (round trance-1; its rows and its arc round trance-2): over seeds 1-40, themes 1-3,
// at the trance corner, its neighbours, the house and the slow side, how many themes play the chopped supersaw, which of
// the riff's rows, with the pedal or not, and how much of the track the saw holds (the whole track, and its last run, the
// peak, against the runs before it).
//
//   node tools/hook-reach.ts                 the table
//   node tools/hook-reach.ts --seeds 12      fewer seeds, for a fast loop
//   node tools/hook-reach.ts --reach 0.5     at a reach of the dial (the machine view's DRAW; 0 by default, as every link)
//
// A theme plays the hook where its plan's dice carry one (`dice.hook`, `src/hook.ts`) and its notes are in the plan. Read
// off the plans, never a render.

import { planTheme } from '../src/mix.ts';
import { asSpell, HOUSE } from '../src/spell.ts';
import { SKY_PLACES, SKY_DOTS } from '../src/sky.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SEEDS = +arg('seeds', 40);
const REACH = +arg('reach', 0);
const star = (id) => SKY_PLACES.find((p) => p.id === id)?.spell ?? null;
const dots = (id) => SKY_DOTS.filter((d) => d.star === id).map((d, i) => [`${id.split('/').pop()} dot ${i + 1}`, d.spell]);
const GROUPS = [
  ['the trance corner', [['Trance', star('trance')], ['Hard Trance', star('trance/hard-trance')], ['Uplifting Trance', star('trance/uplifting-trance')],
    ...dots('trance'), ...dots('trance/hard-trance'), ...dots('trance/uplifting-trance')]],
  ['its neighbours', [['the high four (the old trance region)', { ember: 0.88, root: 0.6, zephyr: 0.6, veil: 0.6, tide: 0.7 }], ['Techno', star('techno')],
    ['Breaks', star('breaks-and-big-beat')], ['Liquid', star('dnb-and-dub/liquid')], ['Dub Techno', star('dnb-and-dub/dub-techno')]]],
  ['the house', [['Deep House', {}], ...dots('house/deep-house'), ['Tech House', star('house/tech-house')], ...dots('house/tech-house'),
    ['house, Pulse 0.55', { ember: 0.55 }], ['house, Gleam 0.75', { gleam: 0.75 }], ['house, Spark 0.42', { spark: 0.42 }],
    ['house, Pulse 0.55 Gleam 0.7', { ember: 0.55, gleam: 0.7 }]]],
  ['the slow side', [['Downtempo', star('ambient-and-downtempo/downtempo')], ['Trip Hop', star('ambient-and-downtempo/trip-hop')],
    ['Ambient', star('ambient-and-downtempo/ambient')], ['Drone', star('ambient-and-downtempo/drone')], ['Dark Ambient', star('ambient-and-downtempo/dark-ambient')],
    ['Ambient Dub', star('ambient-and-downtempo/ambient-dub')], ['Bells', star('ambient-and-downtempo/bells')], ['Waves', star('ambient-and-downtempo/waves')]]],
];
const pct = (n, d) => `${((100 * n) / d).toFixed(0)} %`;
const ROWS = ['gallop', 'gated-chords', 'gallop-dark', 'gallop-bright', 'gallop-sparse'];
const { light: { from: LIGHT_FROM, full: LIGHT_FULL } } = (await import('../src/hook.ts')).HOOK_ROWS[0];
console.log(`| group | spell | themes | the hook | ${ROWS.join(' | ')} | dark | bright | pedal | the saw's share | the peak run, bars (the longest before it) |\n|---|---|---|---|${ROWS.map(() => '---|').join('')}---|---|---|---|---|`);
for (const [group, list] of GROUPS) {
  let gN = 0, gH = 0;
  const G = { rows: Object.fromEntries(ROWS.map((r) => [r, 0])), dark: 0, bright: 0, pedal: 0, share: 0 };
  for (const [name, spell] of list) {
    if (!spell) continue;
    let n = 0, hook = 0, dark = 0, bright = 0, pedal = 0, share = 0, peak = 0, before = 0;
    const rows = Object.fromEntries(ROWS.map((r) => [r, 0]));
    const light = Math.max(0, Math.min(1, ((spell.gleam ?? HOUSE.gleam) - LIGHT_FROM) / (LIGHT_FULL - LIGHT_FROM)));
    for (let seed = 1; seed <= SEEDS; seed++) for (let theme = 1; theme <= 3; theme++) {
      const t = planTheme(String(seed), theme, { strategy: 'house-v2', spell: asSpell({ ...HOUSE, ...spell }), ...(REACH ? { reach: REACH } : {}) });
      n++;
      const h = t.dice.hook;
      // the hook planned and heard: its notes in the plan, not only its word on the dice
      if (!h || !t.events.some((e) => e.p?.hook)) continue;
      hook++;
      const row = h.split(' · ')[1];
      rows[row] = (rows[row] ?? 0) + 1;
      if (row === 'gallop-bright') bright++; else if (row === 'gallop-dark' || light < 0.5) dark++;
      if (h.includes('· pedal ')) pedal++;
      const saw = new Set(t.events.filter((e) => e.p?.hook).map((e) => e.bar));
      share += saw.size / t.bars;
      // the runs, as the plan plays them: stretches of saw bars (a gap of a bar or two inside a run is a fill, not a cut)
      const runs = [];
      let from = -1, last = -9;
      for (let b = 0; b < t.bars; b++) if (saw.has(b)) { if (b - last > 3) { if (from >= 0) runs.push(last - from + 1); from = b; } last = b; }
      if (from >= 0) runs.push(last - from + 1);
      peak += runs[runs.length - 1] ?? 0; before += Math.max(0, ...runs.slice(0, -1));
    }
    gN += n; gH += hook;
    for (const r of ROWS) G.rows[r] += rows[r];
    G.dark += dark; G.bright += bright; G.pedal += pedal; G.share += share;
    const of = (x) => (hook ? pct(x, hook) : '—');
    console.log(`| ${group} | ${name} | ${n} | ${hook} (${pct(hook, n)}) | ${ROWS.map((r) => of(rows[r])).join(' | ')} | ${of(dark)} | ${of(bright)} | ${of(pedal)} | ${hook ? `${(100 * share / hook).toFixed(0)} %` : '—'} | ${hook ? `${(peak / hook).toFixed(0)} (${(before / hook).toFixed(0)})` : '—'} |`);
  }
  const of = (x) => (gH ? pct(x, gH) : '—');
  console.log(`| **${group}** | all | ${gN} | **${gH} (${pct(gH, gN)})** | ${ROWS.map((r) => of(G.rows[r])).join(' | ')} | ${of(G.dark)} | ${of(G.bright)} | ${of(G.pedal)} | ${gH ? `${(100 * G.share / gH).toFixed(0)} %` : '—'} | |`);
}
