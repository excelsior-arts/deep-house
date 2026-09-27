// The birds memo, measured: every bird swept 0 -> 1 with the other seven at the
// house, and what the planner reads at each step.
//
//   node tools/birds-memo.ts            the tables, as markdown, on stdout
//   node tools/birds-memo.ts --seed 7   another master seed (theme 0 either way)
//
// It is the generator of `notes/diagrams/birds-memo.md` and nothing reads it:
// a debug reference, so a change to `derive()`, a control's slope, a family's
// window or a glyph level shows up as a changed table when this is re-run.
//
// The cell readings are the ring's own (`src/ring.ts`, `cellValue`, and the
// three small readers of a mask it uses), written out here because the ring is
// a page module and cannot be imported under node. If the ring's cells change,
// change `reading` below with them.
import { planTheme } from '../src/mix.ts';
import { HOUSE, BIRDS, derive, musicalControls, type Bird, type Spell } from '../src/spell.ts';
import { percentShown } from '../src/bird-percent.ts';
import { cellReading, bandsOf, LABEL_TABLE, type LabelTheme } from '../src/bird-labels.ts';
import fs from 'node:fs';
import { levelAt as glyphLevelAt } from '../src/bird-glyph.ts';
import { style as v2 } from '../src/styles/deep-house-v2.ts';

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEED = arg('--seed', '1');
const THEME = 0;
const STRATEGY = 'house-v2';

/** The compass, clockwise from north (`ring.ts`, `CELLS`). */
const COMPASS: Bird[] = ['ember', 'spark', 'zephyr', 'gleam', 'root', 'loom', 'tide', 'veil'];
const NAME: Record<Bird, string> = { ember: 'Ember', spark: 'Spark', zephyr: 'Zephyr', gleam: 'Gleam', root: 'Root', loom: 'Loom', tide: 'Tide', veil: 'Veil' };

// --- the ring's cell reading: the one author ------------------------------------
// Since round K13 the ring's cells read `src/bird-labels.ts`, which is pure, so
// this reads it too rather than a copy: the big word is the quantity the bird
// biases, the subtitle the seed's locked reading.

/** A planned theme as a cell reads it, under the spell it was planned with. */
const themeOf = (t: any, spell: Spell): LabelTheme => ({
  spell, bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: 'auto',
  dice: t.dice, bars: t.bars, plan: t.arrangement.sections,
});
/** What the bird's cell prints (word / sub [/ sub2]), upper-cased as the ring does. */
function reading(b: Bird, t: any, spell: Spell): string {
  const v = cellReading(b, themeOf(t, spell), v2);
  return [v.word, v.sub, v.sub2].filter((x) => x !== '' && x != null).join(' / ').toUpperCase();
}
/** The big word alone. */
const bigWord = (b: Bird, t: any, spell: Spell) => String(cellReading(b, themeOf(t, spell), v2).word ?? '').toUpperCase();

/** The glyph's level at a value: `bird-glyph.ts`'s own, keyed to the bands since round K15. */
const levelAt = (b: Bird, v: number): string => glyphLevelAt(b, v);

// --- one plan, read ------------------------------------------------------------
const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const HOUSE_CONTROLS = musicalControls(HOUSE as Spell, v2)!;

function row(b: Bird, v: number, seed: string = SEED) {
  const spell = { ...HOUSE, [b]: v } as Spell;
  const t: any = planTheme(seed, THEME, { strategy: STRATEGY, spell });
  const d = derive(spell);
  const controls = musicalControls(spell, v2)!;
  const moved = Object.entries(controls).filter(([k, x]) => Math.abs(x - HOUSE_CONTROLS[k]) > 5e-4).map(([k, x]) => `${k} ${f2(x)}`);
  const trace = JSON.parse(t.dice.composition || '{}');
  const families = Object.entries(trace.selected || {}).map(([f, w]) => (f === w ? f : `${f}:${w}`));
  return {
    v, pct: percentShown(b, v), level: levelAt(b, v), reading: reading(b, t, spell), big: bigWord(b, t, spell),
    bpm: t.bpm, family: d.tempoFamily, pulse: d.pulse, drums: d.drumsOn, kit: d.kit,
    room: t.presetLabel, scene: trace.scene || '', texture: trace.texture ? `${trace.texture.is} (${trace.texture.held.join(', ')})` : '',
    moved, families, controls,
    cells: Object.fromEntries(COMPASS.map((c) => [c, reading(c, t, spell)])) as Record<Bird, string>,
  };
}

/** Every cell's reading, and every big word, at one spell. */
function cellsAt(spell: Spell, seed: string) {
  const t: any = planTheme(seed, THEME, { strategy: STRATEGY, spell });
  return {
    cells: Object.fromEntries(COMPASS.map((c) => [c, reading(c, t, spell)])) as Record<Bird, string>,
    bigs: Object.fromEntries(COMPASS.map((c) => [c, bigWord(c, t, spell)])) as Record<Bird, string>,
  };
}

/** A base spell off a seed alone: every bird uniform in 0..1, the same numbers on every run. */
function looseBase(seed: string): Spell {
  let h = 2166136261;
  for (const ch of `loose:${seed}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const next = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  return Object.fromEntries(BIRDS.map((b) => [b, +next().toFixed(2)])) as Spell;
}

/**
 * **The influence matrix**: for every bird moved to each wall, the share of
 * seeds on which each cell reads differently from the same seed's base.
 * `house` stands the other seven at the house (the memo's own table); `loose`
 * stands them at a spell rolled off the seed, so an influence that lives only
 * away from the house (Spark on the tempo family, near Ember's thresholds) is
 * measured too. Percent of seeds, the larger of the two walls.
 */
function matrix(kind: 'house' | 'loose', n: number) {
  const out: Record<string, Record<string, number>> = {};
  const walls: Record<string, Record<string, [number, number]>> = {};
  const bigs: Record<string, [number, number]> = {};
  for (const b of COMPASS) { out[b] = {}; walls[b] = {}; for (const c of COMPASS) walls[b][c] = [0, 0]; bigs[b] = [0, 0]; }
  for (let i = 1; i <= n; i++) {
    const seed = String(i);
    const base = kind === 'house' ? ({ ...HOUSE } as Spell) : looseBase(seed);
    const at = cellsAt(base, seed);
    for (const b of COMPASS) {
      [0, 1].forEach((v, k) => {
        const moved = cellsAt({ ...base, [b]: v } as Spell, seed);
        for (const c of COMPASS) if (moved.cells[c] !== at.cells[c]) walls[b][c][k]++;
        if (moved.bigs[b] !== at.bigs[b]) bigs[b][k]++;
      });
    }
  }
  for (const b of COMPASS) for (const c of COMPASS) out[b][c] = Math.round((100 * Math.max(...walls[b][c])) / n);
  const pct = (x: number) => Math.round((100 * x) / n);
  return {
    matrix: out,
    walls: Object.fromEntries(COMPASS.map((b) => [b, Object.fromEntries(COMPASS.map((c) => [c, walls[b][c].map(pct)]))])),
    ownBig: Object.fromEntries(COMPASS.map((b) => [b, bigs[b].map(pct)])),
  };
}

const jsonAt = arg('--matrix-json', '');
if (jsonAt) {
  const N0 = Number(arg('--seeds', '100'));
  const house = matrix('house', N0);
  const loose = matrix('loose', N0);
  const doc = {
    kind: 'birds-matrix', schema: 1,
    note: 'Generated by packages/deep-house/tools/birds-memo.ts --matrix-json; tools/check.ts holds bird-labels.json\'s reads to it. Percent of master seeds (theme 0, house-v2) whose cell (inner key) reads differently when the bird (outer key) is moved to a wall, the larger wall. house: the others at the house. loose: the others at a spell rolled off the seed.',
    seeds: N0, theme: THEME, strategy: STRATEGY, birds: COMPASS,
    house: house.matrix, loose: loose.matrix,
    wallsHouse: house.walls, ownBigHouse: house.ownBig,
  };
  fs.writeFileSync(jsonAt, JSON.stringify(doc, null, 1) + '\n');
  console.log(`wrote ${jsonAt}`);
  process.exit(0);
}

const steps = Array.from({ length: 21 }, (_, i) => +(i * 0.05).toFixed(2));
const sweep = (b: Bird) => [...new Set([...steps, HOUSE[b]])].sort((a, c) => a - c);

// --- print ---------------------------------------------------------------------
const out: string[] = [];
const say = (s = '') => out.push(s);
say(`<!-- generated by packages/deep-house/tools/birds-memo.ts: seed ${SEED}, theme ${THEME}, ${STRATEGY} -->`);
say();
say('House controls (every bird at the house): ' + Object.entries(HOUSE_CONTROLS).map(([k, x]) => `${k} ${f3(x)}`).join(', '));
say();
for (const b of COMPASS) {
  say(`### ${NAME[b]} sweep (house ${HOUSE[b]}; others at the house; seed ${SEED}, theme ${THEME}, ${STRATEGY})`);
  say();
  say('| value | % | glyph | cell reads | BPM | pulse · family · drums · kit | scene | controls moved | families drawn |');
  say('|---|---|---|---|---|---|---|---|---|');
  for (const v of sweep(b)) {
    const r = row(b, v);
    const mark = v === HOUSE[b] ? ` **(house)**` : '';
    say(`| ${f3(v)}${mark} | ${r.pct} | ${r.level || '—'} | ${r.reading} | ${r.bpm} | ${f3(r.pulse)} · ${r.family} · ${r.drums ? 'on' : 'OFF'} · ${r.kit} | ${r.scene}${r.texture ? ` — ${r.texture}` : ''} | ${r.moved.join(', ') || '—'} | ${r.families.join(', ') || '—'} |`);
  }
  say();
}

// Ember at every hundredth a hand can hold: what the ring's BPM cell says.
say('### Ember at every hundredth (others at the house): the BPM the cell prints');
say();
say('| Ember values | % | BPM | family | drums |');
say('|---|---|---|---|---|');
let run: { from: number; to: number; key: string; pct0: number; pct1: number; bpm: number; family: string; drums: boolean } | null = null;
const flush = () => { if (run) say(`| ${f2(run.from)}–${f2(run.to)} | ${run.pct0}–${run.pct1} | ${run.bpm} | ${run.family} | ${run.drums ? 'on' : 'OFF'} |`); };
for (let i = 0; i <= 100; i++) {
  const v = i / 100;
  const r = row('ember', v);
  const key = `${r.bpm}|${r.family}|${r.drums}`;
  if (run && run.key === key) { run.to = v; run.pct1 = r.pct; continue; }
  flush();
  run = { from: v, to: v, key, pct0: r.pct, pct1: r.pct, bpm: r.bpm, family: r.family, drums: r.drums };
}
flush();
say();

// Every BPM a set can open at, per family, over many master seeds.
say('### BPM reachable per tempo family, over master seeds 1–300 (theme 0, Ember set inside each band, others at the house)');
say();
say('| family | Ember used | min BPM | max BPM | distinct BPMs |');
say('|---|---|---|---|---|');
for (const [family, ember] of [['unmetered', 0.1], ['house', HOUSE.ember], ['techno', 0.8], ['drumAndBass', 1]] as const) {
  const seen = new Set<number>();
  for (let s = 1; s <= 300; s++) seen.add(row('ember', ember, String(s)).bpm);
  const all = [...seen].sort((a, c) => a - c);
  say(`| ${family} | ${ember} | ${all[0]} | ${all[all.length - 1]} | ${all.join(', ')} |`);
}
say();

// One seed is one roll. Over many master seeds: how often the bird's own cell
// reads something other than it reads at the house on the same seed, what the
// scene does, and which families come and go.
const N = 100;
const pctOf = (n: number) => `${Math.round((100 * n) / N)}`;
say(`### Over master seeds 1–${N} (theme 0): does the cell move, and what moves under it`);
say();
say('"cell ≠ house" is the share of seeds whose cell reading at that value differs from the same seed at the house. Scene is forward / back / air in % of seeds. Families listed are those whose share moves by 10 points or more across the sweep, as % of seeds at 0 / house / 1.');
say();
say('| bird | value | cell ≠ house | most common readings | scene fwd/back/air | families (0 / house / 1) |');
say('|---|---|---|---|---|---|');
for (const b of COMPASS) {
  const at = [0, HOUSE[b], 1];
  const rows = at.map((v) => Array.from({ length: N }, (_, i) => row(b, v, String(i + 1))));
  const fams = new Set<string>();
  rows.forEach((rs) => rs.forEach((r) => r.families.forEach((f) => fams.add(f.split(':')[0]))));
  const share = (rs: typeof rows[0], f: string) => rs.filter((r) => r.families.some((x) => x.split(':')[0] === f)).length;
  const moving = [...fams].filter((f) => { const s3 = rows.map((rs) => share(rs, f)); return Math.max(...s3) - Math.min(...s3) >= 10; })
    .map((f) => `${f} ${rows.map((rs) => pctOf(share(rs, f))).join(' / ')}`).join('; ');
  at.forEach((v, k) => {
    const rs = rows[k];
    const changed = rs.filter((r, i) => r.reading !== rows[1][i].reading).length;
    const tally = new Map<string, number>();
    for (const r of rs) { const w = r.reading.split(' / ')[0]; tally.set(w, (tally.get(w) || 0) + 1); }
    const top = [...tally].sort((a, c) => c[1] - a[1]).slice(0, 4).map(([w, n]) => `${w} ${pctOf(n)}`).join(', ');
    const sc = (name: string) => pctOf(rs.filter((r) => r.scene === name).length);
    say(`| ${k === 0 ? NAME[b] : ''} | ${f3(v)}${k === 1 ? ' (house)' : ''} | ${k === 1 ? '—' : pctOf(changed) + ' %'} | ${top} | ${sc('drone-forward')}/${sc('drone-back')}/${sc('air')} | ${k === 0 ? moving || '—' : ''} |`);
  });
}
say();

// Which cell a bird actually moves: every bird to each wall, every cell read.
say(`### Which cell moves when a bird moves (master seeds 1–${N}, theme 0)`);
say();
say('% of seeds whose cell (column) reads differently from the same seed at the house, with only the row\'s bird moved. The diagonal is the bird\'s own cell. Ember\'s column is the BPM.');
say();
say(`| moved | ${COMPASS.map((c) => NAME[c] + ' cell').join(' | ')} |`);
say(`|---|${COMPASS.map(() => '---').join('|')}|`);
const houseRows = Array.from({ length: N }, (_, i) => row('ember', HOUSE.ember, String(i + 1)));
for (const b of COMPASS) {
  for (const v of [0, 1]) {
    const rs = Array.from({ length: N }, (_, i) => row(b, v, String(i + 1)));
    const cells = COMPASS.map((c) => {
      const n = rs.filter((r, i) => r.cells[c] !== houseRows[i].cells[c]).length;
      const p = pctOf(n);
      return c === b ? `**${p}**` : p === '0' ? '·' : p;
    });
    say(`| ${NAME[b]} → ${v} | ${cells.join(' | ')} |`);
  }
}
say();

// The big words' bands (round K13), solved from the composer by the labels module.
say('### The big words: bands solved from the composer (`src/bird-labels.ts`)');
say();
say('| bird | quantity | bands (upper edge as the bird\'s value and %) | solved from |');
say('|---|---|---|---|');
{
  const bands = bandsOf(v2);
  for (const b of COMPASS) {
    const row = LABEL_TABLE.birds[b];
    const q = row.big.plan ? `the plan's ${row.big.plan}${row.big.derive ? ` (its family: derive().${row.big.derive})` : ''}` : row.big.control ? `control ${row.big.control}` : `derive().${row.big.derive}`;
    const cut = bands[b];
    say(`| ${NAME[b]} | ${q} | ${cut.length ? cut.map((x) => x.birdAt == null ? x.word.toUpperCase() : `${x.word.toUpperCase()} < ${f3(x.birdAt)} (${percentShown(b, x.birdAt)} %)`).join(' · ') : '—'} | ${cut.filter((x) => x.from).map((x) => x.from).join('; ') || '—'} |`);
  }
}
say();

// And the loose matrix: the same question away from the house.
say(`### Which cell moves, away from the house (seeds 1–${N}, the others at a spell rolled off each seed)`);
say();
{
  const loose = matrix('loose', N).matrix;
  say(`| moved | ${COMPASS.map((c) => NAME[c] + ' cell').join(' | ')} |`);
  say(`|---|${COMPASS.map(() => '---').join('|')}|`);
  for (const b of COMPASS) say(`| ${NAME[b]} | ${COMPASS.map((c) => (c === b ? `**${loose[b][c]}**` : loose[b][c] ? String(loose[b][c]) : '·')).join(' | ')} |`);
}
say();

// The thresholds, solved from the code's own constants rather than read off the sweep.
const sparkF = 0.8 + 0.2 * HOUSE.spark;
say('### Thresholds solved from `derive()` at the house');
say();
say(`- pulse = ember × (0.80 + 0.20 × spark); at Spark's house the factor is ${f3(sparkF)}.`);
for (const [upTo, name] of [[0.15, 'unmetered → house'], [0.55, 'house → techno'], [0.8, 'techno → drumAndBass']] as const) {
  say(`- ${name}: pulse ${upTo} ⇔ Ember ${(upTo / sparkF).toFixed(4)} (${percentShown('ember', upTo / sparkF)} %) at Spark's house; Ember ${upTo.toFixed(4)}–${(upTo / 0.8).toFixed(4)} across Spark 1…0.`);
}
say(`- Spark alone at Ember's house: pulse ${f3(HOUSE.ember * 0.8)} (Spark 0) … ${f3(HOUSE.ember)} (Spark 1) — never leaves the house band.`);
say();

console.log(out.join('\n'));
void BIRDS;
