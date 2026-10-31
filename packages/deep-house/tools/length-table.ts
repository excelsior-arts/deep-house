// **The length table and the seams' phrase** (round length-2, his word 10-27): what the program plays, measured off
// the plans as the page plans them (`played`, the link digest's reading) — never a render.
//
//   node tools/length-table.ts                      the featured tracks, then the distribution and the seams over the grid
//   node tools/length-table.ts --featured           the featured tracks only
//   node tools/length-table.ts --json <file>        every row written to a file (a before/after pair is two of these)
//   node tools/length-table.ts --seeds 12           a smaller grid (seeds 1-12; 40 by default)
//   node tools/length-table.ts --jobs 3             the grid in that many processes (3 by default)
//
// **The families** are the length's own (`src/length.ts`): a groove track (the derived state has drums: Ember over
// `DRUMS_ON_ABOVE`), a struck one (drumless, where the place's read lays the struck voices' conversation: the struck share
// at a half or more, `namedShare`) and a drumless one (the rest of the slow side, the ambient places). His aims: groove
// mostly 3-4 minutes, drumless mostly 9-10 (10-27), struck 5-6 (10-28: *"bowls and bells should not aim to 9 mins as
// they are simplest ambient tone, for them 5-6 minute range was just right"*). The table reports each family's median
// and its 10th and 90th percentiles: a territory, never a clamp.
//
// **The grid**: seeds 1-40, themes 1-3, at the house, every genre tile (the guards' grid), and the slow places' own
// spells (BELLS, WAVES, PSY, and BOWLS at its address and down its Tide travel, at 0.48 and at nought).
//
// **The seams** are the program guards' `seam` (`seamFindings`, `tools/check-program-guards.ts`), counted here over the
// length grid: a rising gesture into a break, and a section ending on a stub of its phrase.

import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { played } from './link-digest.ts';
import { grid, seamFindings, type SeamFinding } from './check-program-guards.ts';
import { linkWrite } from '../src/link.ts';
import { linkRead } from '../src/link.ts';
import { derive, HOUSE, type Spell } from '../src/spell.ts';
import { FEATURED } from '../src/featured.ts';
import { namedShare } from '../src/length.ts';
import { lengthMargin } from '../src/places.ts';
import { places } from '../src/styles/deep-house-places.ts';
import { LENGTH_V2 } from '../src/styles/deep-house-v2.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };

/** The slow places' own spells (their tiles' birds), BOWLS's as its round stands it. */
export const SLOW_SPELLS: Record<string, Partial<Spell>> = {
  BELLS: { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 },
  PSY: { ember: 0.08, tide: 0.90, zephyr: 0.65, root: 0.60, gleam: 0.35, veil: 0.90, spark: 0.55, loom: 0.70 },
  WAVES: { ember: 0.05, tide: 0.85, zephyr: 0.75, root: 0.55, gleam: 0.50, veil: 0.60, spark: 0.10, loom: 0.95 },
  BOWLS: { ember: 0.02, tide: 0.95, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 },
  'BOWLS Tide 0.48': { ember: 0.02, tide: 0.48, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 },
  'BOWLS Tide 0': { ember: 0.02, tide: 0, zephyr: 0.50, root: 0.40, gleam: 0.80, veil: 0.00, spark: 0, loom: 1.0 },
};

/** Every spell of the length grid, by name. */
export function lengthSpells(): Array<{ name: string; spell: Partial<Spell> | null }> {
  const out: Array<{ name: string; spell: Partial<Spell> | null }> = [{ name: 'house', spell: null }];
  for (const g of grid()) if (g.name.startsWith('tile ') && g.spell) out.push({ name: g.name, spell: g.spell });
  for (const [name, s] of Object.entries(SLOW_SPELLS)) out.push({ name, spell: { ...HOUSE, ...s } });
  return out;
}

export type Family = 'groove' | 'struck' | 'drumless';
const FAMILIES: readonly Family[] = ['groove', 'struck', 'drumless'];

export interface Row {
  group: string; name: string; link: string; seed: string; theme: number;
  family: Family; drumsPlayed: boolean; bpm: number; bars: number; minutes: number;
  form: string; seams: SeamFinding[];
  /** the form's breath: its breakdowns, its drops (a drop, or a main back after a break), its shortest main in phrases */
  breaks: number; drops: number; shortestMain: number | null;
}

const DRUM_LAYERS = new Set(['kick', 'clap', 'hats', 'shaker', 'perc', 'snare']);

/** One theme's row. */
export function rowOf(group: string, name: string, link: string, theme?: number): Row {
  const { plan, seed, request } = quiet(() => played(link, theme));
  const p: any = plan;
  const birds = { ...HOUSE, ...((request as any).spell ?? {}) } as Spell;
  const family: Family = derive(birds).drumsOn ? 'groove' : namedShare(lengthMargin(places, 'struck', birds, p.placeBpm ?? p.bpm), LENGTH_V2) >= 0.5 ? 'struck' : 'drumless';
  const drumsPlayed = (p.events ?? []).some((e: any) => DRUM_LAYERS.has(e.layer));
  const form = (p.arrangement?.sections ?? []).map((s: any) => `${s.kind[0] === 'b' && s.kind !== 'breakdown' ? 'B' : s.kind[0]}${s.bars}`).join(' ');
  return { group, name, link, seed, theme: theme ?? linkRead(`?${link}`).link.theme, family, drumsPlayed, bpm: p.bpm, bars: p.bars,
    minutes: +(p.bars * p.barSeconds / 60).toFixed(3), form, seams: seamFindings(p), ...breath(p) };
}

/** The form's breath (the brief's check: a groove keeps a breakdown and a drop, and no main under two phrases). */
function breath(p: any) {
  const S = p.arrangement?.sections ?? [];
  const phrase = Math.round((p.phraseMap?.time?.phraseS ?? 8 * p.barSeconds) / p.barSeconds);
  const breaks = S.filter((s: any) => s.kind === 'breakdown').length;
  const drops = S.filter((s: any, i: number) => s.kind === 'drop' || (s.kind === 'main' && i > 0 && S[i - 1].kind === 'breakdown')).length;
  const mains = S.filter((s: any) => s.kind === 'main').map((s: any) => s.bars / phrase);
  return { breaks, drops, shortestMain: mains.length ? Math.min(...mains) : null };
}

/** The featured tracks, in playlist order. */
export function featuredRows(): Row[] {
  return FEATURED.flatMap((f) => f.links.map((link, i) => rowOf(`featured ${f.name}`, f.labels?.[i] || `${f.name} ${i + 1}`, link)));
}

/** The grid's jobs: [spell name, seed, theme]. */
function gridJobs(seeds: number) {
  const jobs: Array<{ name: string; spell: Partial<Spell> | null; seed: string; theme: number }> = [];
  for (const s of lengthSpells()) for (let seed = 1; seed <= seeds; seed++) for (let theme = 0; theme < 3; theme++) jobs.push({ ...s, seed: String(seed), theme });
  return jobs;
}

const q = (xs: number[], f: number) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * f, lo = Math.floor(i); return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (i - lo); };
const mmss = (m: number) => { const s = Math.round(m * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** The distribution of a list of rows, per family: count, the 10th, the median, the 90th, the extremes. */
export function distribution(rows: Row[]) {
  const out: Record<string, { n: number; p10: number; median: number; p90: number; min: number; max: number }> = {};
  for (const fam of FAMILIES) {
    const m = rows.filter((r) => r.family === fam).map((r) => r.minutes);
    if (m.length) out[fam] = { n: m.length, p10: q(m, 0.1), median: q(m, 0.5), p90: q(m, 0.9), min: Math.min(...m), max: Math.max(...m) };
  }
  return out;
}

function seamCounts(rows: Row[]) {
  const c: Record<string, number> = {};
  for (const r of rows) for (const f of r.seams) { const k = f.kind === 'rise' ? `rise: ${f.what}` : f.kind; c[k] = (c[k] ?? 0) + 1; }
  return c;
}

// ----- the run -----

const HERE = fileURLToPath(import.meta.url);
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

async function main() {
  const shard = arg('--shard');
  const seeds = +(arg('--seeds', '40')!);
  if (shard) {
    const [k, n] = shard.split('/').map(Number);
    const rows = gridJobs(seeds).filter((_, i) => i % n === k).map((j) => rowOf(j.name, j.name, linkWrite({ seed: j.seed, theme: j.theme, strategy: 'house-v2', spell: j.spell } as any), j.theme));
    process.stdout.write(JSON.stringify(rows));
    return;
  }
  const featured = featuredRows();
  console.log('**The featured tracks**\n');
  console.log('| playlist | track | family | bpm | length | form | seams |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of featured) console.log(`| ${r.group.replace('featured ', '')} | ${r.name} | ${r.family}${r.drumsPlayed === (r.family === 'groove') ? '' : ' (drums ' + (r.drumsPlayed ? 'played' : 'none') + ')'} | ${r.bpm} | ${mmss(r.minutes)} | ${r.form} | ${r.seams.map((f) => f.kind === 'rise' ? `${f.what}@${f.bar}` : `${f.kind}@${f.bar}`).join(', ') || '—'} |`);
  const fd = distribution(featured);
  console.log('\nfeatured:', Object.entries(fd).map(([k, v]) => `${k} ${v.n}: median ${mmss(v.median)}, p10 ${mmss(v.p10)}, p90 ${mmss(v.p90)} (${mmss(v.min)}-${mmss(v.max)})`).join('; '));
  let rows: Row[] = [];
  if (!process.argv.includes('--featured')) {
    const jobs = +(arg('--jobs', String(Math.min(3, os.cpus().length)))!);
    const parts = await Promise.all(Array.from({ length: jobs }, (_, k) => new Promise<Row[]>((done, fail) => {
      const c = spawn('nice', ['-n', '18', process.execPath, HERE, '--shard', `${k}/${jobs}`, '--seeds', String(seeds)], { stdio: ['ignore', 'pipe', 'inherit'] });
      let s = ''; c.stdout.on('data', (d) => (s += d)); c.on('close', (code) => (code ? fail(new Error(`shard ${k} exit ${code}`)) : done(JSON.parse(s))));
    })));
    rows = parts.flat();
    console.log(`\n**The grid** (seeds 1-${seeds}, themes 1-3; ${rows.length} themes)\n`);
    console.log('| spell | family | n | p10 | median | p90 | min | max | seams |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    const names = [...new Set(rows.map((r) => r.group))];
    for (const name of names) {
      const at = rows.filter((r) => r.group === name);
      for (const [fam, v] of Object.entries(distribution(at))) {
        const sc = seamCounts(at.filter((r) => r.family === fam));
        console.log(`| ${name} | ${fam} | ${v.n} | ${mmss(v.p10)} | ${mmss(v.median)} | ${mmss(v.p90)} | ${mmss(v.min)} | ${mmss(v.max)} | ${Object.entries(sc).map(([k, x]) => `${k} ${x}`).join(', ') || '—'} |`);
      }
    }
    const d = distribution(rows);
    console.log('\ngrid:', Object.entries(d).map(([k, v]) => `${k} ${v.n}: median ${mmss(v.median)}, p10 ${mmss(v.p10)}, p90 ${mmss(v.p90)} (${mmss(v.min)}-${mmss(v.max)})`).join('; '));
    const sc = seamCounts(rows);
    console.log('seams over the grid:', Object.entries(sc).map(([k, x]) => `${k} ${x}`).join(', ') || 'none');
    const groove = rows.filter((r) => r.family === 'groove');
    console.log(`the form's breath over ${groove.length} groove themes: no breakdown ${groove.filter((r) => !r.breaks).length}, no drop ${groove.filter((r) => !r.drops).length}, a main under two phrases ${groove.filter((r) => r.shortestMain != null && r.shortestMain < 2).length}`);
    const mis = rows.filter((r) => r.drumsPlayed !== (r.family === 'groove'));
    console.log(`family by the birds vs drums played: ${mis.length} of ${rows.length} differ${mis.length ? ` (${[...new Set(mis.map((r) => r.group))].join(', ')})` : ''}`);
  }
  const file = arg('--json');
  if (file) fs.writeFileSync(file, JSON.stringify({ featured, grid: rows }, null, 0));
}

if (process.argv[1] === HERE) await main();
