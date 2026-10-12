// How many lanes the machine view's channels are asked for, through a set.
//
//   node tools/measure-lanes.ts                  the table: forty seeds, three spells, both engines
//   node tools/measure-lanes.ts --seeds 20       the first twenty seeds
//   node tools/measure-lanes.ts --themes 5       five themes a set (three by default)
//   node tools/measure-lanes.ts --moves          and what moves between the themes of a set
//
// Every wire in the drawing has a lane of its own in every channel it runs
// through, so a channel is as wide as the wires in it ask (`laneRoom`): the
// `m` channel between the lane inserts and the returns, `sr` over the rail the
// sends ride, the rail over the meters, `under` them, the `bottom` channel
// under the whole drawing, and the gutters `g<i>` between the columns. A lane
// insert or a return that comes and goes between themes changes those counts,
// and the drawing re-packs round them — Eugene, 10-05: *"the dynamic lane
// inserts are pushing the rest of the layout … the screen shakes back and
// forward through the track"*. This walks the part the view lays out at rest
// (`describeMachine`'s own joining: the lanes, the graph the program asks for,
// the deck and the master), every bar of every theme, through `layoutCanvas`
// itself, and says per channel the most lanes any of them asked for, the seed
// and theme that asked, and how many themes reach it. The reserves beside
// `RAIL_LANES` in `src/machine/layout.ts` are those maxima plus two.
//
// `tools/check.ts` imports `setLayouts` and `stillOf` from here and holds the
// rule this measures for: the themes of a set agree on every box but the
// chips and returns inside the effects area, to the pixel.

import { fileURLToPath } from 'node:url';
import { planTheme, recipesFor } from '../src/mix.ts';
import { programOf } from '../src/performance.ts';
import { GROUPS, lanePart, lanesOfTheme } from '../src/machine/model.ts';
import { layoutCanvas } from '../src/machine/layout.ts';
import { density } from '../src/machine/look.ts';
import { joinParts, describeGraph, describeDeck, describeMaster } from '@deep-house/engine/describe';
import { returnsOf } from '@deep-house/engine/voices';
import { settingsOf } from '@deep-house/engine/settings';
import { withStage } from '@deep-house/engine/stage';

export const ENGINES = ['house-v1', 'house-v2'];
/** The house, and the two ear fixtures' spells (seed 6's half-time place, and benchmark 27191's ambient one). */
export const SPELLS = [
  ['house', ''],
  ['seed 6', 'em:0.92,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80'],
  ['27191', 'em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81'],
];
/** The panes the view lays the drawing out in: a desktop at 1440 by 900 with the ledger away, and a phone. */
export const FITS = [
  ['1440', { width: 1440 - 336 - 1 - (24 + 16), height: 900, ...density(1440) }],
  ['390', { width: 390, height: 0, ...density(390) }],
];

/** A set's theme as the page plans it: the seed's own cast under the link's spell, if any. */
export function planned(seed, theme, strategy, spell = '') {
  const cast = recipesFor({ masterSeed: seed, strategy, search: spell ? `?spell=${spell}` : '' });
  return planTheme(seed, theme, { masterSeed: seed, preset: 'auto', strategy, spell: cast.spell, recipe: cast.track });
}

/** The machine at a bar of a planned theme, joined as `describeMachine` joins it at rest. */
export function partOf(track, bar) {
  const lanes = lanesOfTheme({ track, bar });
  const part = joinParts(lanePart(lanes, false),
    describeGraph(null, withStage(settingsOf(track)), returnsOf(programOf(track).events)), describeDeck(null), describeMaster(null));
  part.nodes.push({ id: 'sink', label: 'OUTPUT', kind: 'output', stage: 'output', made: '—', readings: [], state: 'idle' });
  part.edges.push({ from: 'm:out', to: 'sink', kind: 'signal' });
  return part;
}

/** What a layout is a function of — the view's own `shapeKey`, with what decides a source row's height. */
const shapeOf = (part) => part.nodes.map((n) => `${n.id}:${n.stage}:${n.group ?? ''}:${n.exit ?? ''}:${n.label}:${n.made}`).join('|')
  + '#' + part.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).join('|');

/**
 * Every distinct machine one theme draws, bar by bar: a lane insert comes and
 * goes with the rota's segments, so a theme is several shapes. Each laid out
 * once per `fit`; `bars` says which bars drew it.
 */
export function themeLayouts(track, fit) {
  const bars = track.timeline.length;
  const out = new Map();
  for (let bar = 0; bar < bars; bar++) {
    const part = partOf(track, bar);
    const k = shapeOf(part);
    const had = out.get(k);
    if (had) { had.bars.push(bar); continue; }
    out.set(k, { part, bars: [bar], layout: layoutCanvas(part, GROUPS, fit) });
  }
  return [...out.values()];
}

/** The layouts of a set's first `themes` themes, each theme's every shape. */
export function setLayouts(seed, strategy, spell, themes, fit) {
  const out = [];
  for (let t = 0; t < themes; t++) for (const s of themeLayouts(planned(seed, t, strategy, spell), fit)) out.push({ theme: t, ...s });
  return out;
}

const q = (v) => Math.round(v * 1000) / 1000;
const box = (b) => ({ x: q(b.x), y: q(b.y), w: q(b.w), h: q(b.h) });
/**
 * **What must stand still through a set**, each as the sides it has — `x` and
 * `w` across, `y` and `h` down: every column's place and width, the gutters
 * between them, the effects area, the rail's band (`y` its top, `h` its
 * depth), every strip, every stage box's place, the master's rack and the
 * output, the response at the foot, and the drawing's own size. What is left
 * out is what is drawn *inside* an area — which chips, which returns — and the
 * wires.
 */
export function stillOf(layout) {
  const out = {};
  const cols = layout.columns;
  cols.forEach((c, i) => {
    out[`column ${c.stage}`] = { x: q(c.x), w: q(c.w) };
    if (i + 1 < cols.length) out[`gutter ${c.stage}|${cols[i + 1].stage}`] = { w: q(cols[i + 1].x - c.x - c.w) };
  });
  const fx = layout.areas.find((a) => a.id === 'effects');
  if (fx) out['effects area'] = box(fx);
  const strips = layout.order.filter((p) => p.node.stage === 'buses');
  for (const p of strips) out[`strip ${p.node.id}`] = box(p);
  // the rail is the band between the effects area's foot and the strips' top
  if (fx && strips.length) out.rail = { y: q(fx.y + fx.h), h: q(strips[0].y - fx.y - fx.h) };
  for (const p of layout.order) if (p.node.stage === 'stage') out[`stage ${p.node.id}`] = { x: q(p.x), y: q(p.y) };
  for (const p of layout.order) if (p.node.stage === 'master') out[`rack ${p.node.id}`] = box(p);
  for (const p of layout.order) if (p.node.stage === 'output') out[`output ${p.node.id}`] = box(p);
  if (layout.bells) out.response = box(layout.bells);
  out.drawing = { w: q(layout.width), h: q(layout.height) };
  return out;
}

/**
 * **What hangs off the floor** (M4: the meters end where the sources end, and
 * the stage and the master reach down to that line): a strip's height, a
 * stage box's place down its stack, the rack's rows, the output, the response
 * and the drawing's height. These, and only these, move between two themes
 * whose sources column ends at another line — a part that comes with a theme,
 * or a row that turns two-line for its instrument's name — or whose stage
 * stack is another (a theme with the bass drive or the bus bell).
 */
export const FLOOR_HUNG = (name, side) => (side === 'h' && /^(strip|rack|response|drawing)/.test(name))
  || (side === 'y' && /^(stage|rack|output|response)/.test(name));
/** Where a layout's sources column ends, and its stage stack, top to bottom. */
export const sourcesFoot = (layout) => q(Math.max(0, ...layout.frames.map((f) => f.y + f.h)));
export const stackOf = (layout) => layout.order.filter((p) => p.node.stage === 'stage').map((p) => p.node.id).join(' ');

/** Where two layouts' still parts differ, as `name side: a → b`, for the parts both have. */
export function moved(a, b, tolerance = 0) {
  const sa = stillOf(a); const sb = stillOf(b);
  const out = [];
  for (const k of Object.keys(sa)) {
    if (!(k in sb)) continue;
    for (const side of Object.keys(sa[k])) if (Math.abs(sa[k][side] - sb[k][side]) > tolerance) out.push({ name: k, side, from: sa[k][side], to: sb[k][side] });
  }
  return out;
}
const said = (m) => `${m.name} ${m.side}: ${m.from} → ${m.to}`;

// --- the table, run on its own -------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
  const SEEDS = arg('--seeds', 40);
  const THEMES = arg('--themes', 3);
  const MOVES = process.argv.includes('--moves');
  const seeds = Array.from({ length: SEEDS }, (_, i) => String(i + 1));
  // channel -> { max, at: [where], themes: Set of themes that reach it, all: themes seen }
  const table = new Map();
  const themeMax = new Map();
  const seen = new Set();
  const moves = new Map();
  let changes = 0; let feet = 0; let stacks = 0; let worst = 0;
  let shapes = 0;
  const t0 = Date.now();
  const runs = [];
  for (const strategy of ENGINES) for (const [name, spell] of SPELLS) {
    for (const seed of seeds) runs.push([strategy, name, spell, seed]);
    // each fixture at its own seed as well
    if (name === 'seed 6' && SEEDS < 6) runs.push([strategy, name, spell, '6']);
    if (name === '27191') runs.push([strategy, name, spell, '27191']);
  }
  for (const [strategy, name, spell, seed] of runs) {
    const set = setLayouts(seed, strategy, spell, THEMES, FITS[0][1]);
    shapes += set.length;
    for (const { theme, layout, bars } of set) {
      const tk = `${strategy}|${name}|${seed}|${theme}`;
      seen.add(tk);
      for (const [ch, n] of Object.entries(layout.lanes)) {
        const k = `${tk}|${ch}`;
        themeMax.set(k, Math.max(themeMax.get(k) ?? 0, n));
        if (!table.has(ch)) table.set(ch, { max: -1, at: '' });
        const row = table.get(ch);
        if (n > row.max) { row.max = n; row.at = `seed ${seed}, theme ${theme + 1}, bar ${bars[0] + 1}, ${strategy}, ${name}`; }
      }
    }
    if (MOVES) {
      // within a theme, bar by bar, against the theme's first shape; across
      // themes, each theme's first shape against the set's, with its cause
      const firstOf = new Map();
      for (const s of set) if (!firstOf.has(s.theme)) firstOf.set(s.theme, s);
      const note = (what, eg) => { if (!moves.has(what)) moves.set(what, { n: 0, eg }); moves.get(what).n++; };
      for (const s of set) {
        const own = firstOf.get(s.theme);
        if (s !== own) for (const m of moved(own.layout, s.layout)) note(`within a theme: ${m.name.split(' ')[0]} ${m.side}`, `${strategy} ${name} seed ${seed} theme ${s.theme + 1} bar ${s.bars[0] + 1}: ${said(m)}`);
      }
      const head = set[0];
      for (const [t, s] of firstOf) {
        if (t === head.theme) continue;
        changes++;
        const foot = sourcesFoot(s.layout) !== sourcesFoot(head.layout);
        const stack = stackOf(s.layout) !== stackOf(head.layout);
        if (foot) feet++;
        if (stack) stacks++;
        for (const m of moved(head.layout, s.layout)) {
          const why = FLOOR_HUNG(m.name, m.side) && (foot || stack) ? (foot ? 'the sources end elsewhere' : 'another stage stack') : 'NOT EXPLAINED';
          note(`across themes (${why}): ${m.name.split(' ')[0]} ${m.side}`, `${strategy} ${name} seed ${seed} theme ${t + 1}: ${said(m)}`);
          if (m.side === 'y' || m.side === 'h') worst = Math.max(worst, Math.abs(m.to - m.from));
        }
      }
    }
  }
  const order = ['m', 'sr', 'rail', 'under', 'bottom', ...[...table.keys()].filter((k) => /^g\d/.test(k)).sort()];
  console.log(`${seeds.length} seeds × ${SPELLS.length} spells × ${ENGINES.length} engines (and each fixture at its own seed), ${THEMES} themes a set, every bar: `
    + `${seen.size} themes, ${shapes} distinct machines laid out in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('');
  console.log('| channel | most lanes | first set by | themes reaching it | range over themes |');
  console.log('|---|---|---|---|---|');
  for (const ch of order) {
    const row = table.get(ch);
    if (!row) continue;
    const per = [...seen].map((tk) => themeMax.get(`${tk}|${ch}`) ?? 0);
    const reach = per.filter((n) => n === row.max).length;
    console.log(`| ${ch} | ${row.max} | ${row.at} | ${reach} of ${seen.size} | ${Math.min(...per)}–${Math.max(...per)} |`);
  }
  if (MOVES) {
    console.log('');
    console.log(`${changes} changes of theme: ${feet} end the sources column at another line, ${stacks} change the stage stack; the most a box moved down or grew, ${worst.toFixed(1)} units`);
    console.log(moves.size ? 'what moved:' : 'nothing moved, within a theme or across');
    for (const [what, { n, eg }] of [...moves].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${what} — ${n} times; e.g. ${eg}`);
  }
}
