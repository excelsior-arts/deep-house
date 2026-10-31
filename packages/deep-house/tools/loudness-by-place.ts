// **Loudness by place** (round loudness-by-place): what each place of the house plays at today, read off the plans and
// joined to the windows already rendered at the trim the app plays, against how beat-led the place is.
//
//   node tools/loudness-by-place.ts --rows a.json[,b.json] [--themes 6] [--from 1 --to 12] [--out tmp/analysis/by-place.json] [--md]
//
// `--rows` are files of `tools/headroom-front.ts --measure --at-trim` (round loudness-v24 left three in its worktree,
// `tmp/loudness-v24/tmp/analysis/hf-attrim-before-*.json`, rendered on the build `local` plays): each 10 ms block's
// peak ahead of the limiter against its ceiling, and the window's landed loudness. A row is matched to a plan by its
// seed, its spell and its theme, never by the link's spelling. A plan with no row shows its plan facts alone.
//
// What is read off each plan: the tempo and the clock, the beat-led reading (`beatLed`, performance.ts: the product
// of a tempo share and a drums share), the loudness family and the target its trim aims at, the trim, the sum clip,
// the model's prediction and the headroom. What is read off a row: the landed loudness, the share of blocks the
// limiter works in (past 0 and past 1 dB), the deepest block, and a crest proxy: the output ceiling (0.75, -2.5 dBFS)
// less the landed loudness where the limiter works, the deepest block under it where it does not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { grid, linkOf, playedWith } from './check-program-guards.ts';
import { beatLed, isFree } from '../src/performance.ts';
import { loudnessFeatures, loudnessFamily, trimTargetLufs, predictedLufs, headroomDb, trimWindow, sumClipOf } from '../src/loudness.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);
const quiet = <T,>(fn: () => T): T => { const k = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { [console.log, console.info, console.warn] = k; } };

/** The output ceiling in dBFS: the limiter's 0.75, the soft clip and a trim of 1 behind it. */
const CEILING_DBFS = 20 * Math.log10(0.75);

type Row = { link: string; place: string; seed: string; theme?: number; atTrim?: number; from: number; bars: number; blocks: number[]; lufs: number };
type Key = string;
/** seed, spell and the theme's index: the same theme whichever way the link spells it. */
function keyOf(link: string): Key {
  const q = new URLSearchParams(link.replace(/^\?/, ''));
  const theme = Math.max(0, Number(q.get('theme') || 1) - 1);
  return `${q.get('seed')}|${q.get('spell') || ''}|${theme}`;
}

function loadRows(): Map<Key, Row> {
  const out = new Map<Key, Row>();
  for (const f of (arg('rows') || '').split(',').filter(Boolean)) {
    const d = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
    for (const r of d.rows as Row[]) if (Number.isFinite(r.lufs)) out.set(keyOf(r.link), r);
  }
  return out;
}

function limiterOf(r: Row) {
  const n = r.blocks.length || 1;
  const over = r.blocks.filter((b) => b > 0);
  const depth = Math.max(...r.blocks);
  const sorted = [...r.blocks].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  return {
    share: +((100 * over.length) / n).toFixed(1),
    share1: +((100 * r.blocks.filter((b) => b > 1).length) / n).toFixed(1),
    depth: +depth.toFixed(2),
    p95: +p95.toFixed(2),
    meanGr: +(over.reduce((a, b) => a + b, 0) / n).toFixed(3),
    crest: +((Math.min(depth, 0) + CEILING_DBFS) - r.lufs).toFixed(2),
  };
}

export interface PlaceFacts {
  group: string; name: string; link: string; theme: number; seed: string; spell: string | null;
  bpm: number; clock: 'free' | 'bar'; bars: number; density: string;
  beatLed: number; felt: number; tempoShare: number; drumsShare: number;
  family: string; target: number; placeTarget: number | null; trimDb: number; predicted: number; headroom: number | null; sumClipOverDb: number | null;
  window: { from: number; bars: number; kind: string };
  sections: string;
  landed?: number; atTrim?: number; limiter?: ReturnType<typeof limiterOf>;
}

function withTheme(link: string, theme: number): string {
  const q = new URLSearchParams(link);
  if (theme <= 0) q.delete('theme'); else q.set('theme', String(theme + 1));
  return q.toString().replace(/%3A/g, ':').replace(/%2C/g, ',');
}

function factsOf(group: string, name: string, link: string, rows: Map<Key, Row>): PlaceFacts {
  const { plan } = quiet(() => playedWith(link));
  const q = new URLSearchParams(link);
  const bl = beatLed(plan);
  const f = loudnessFeatures(plan, plan.style);
  const w = trimWindow(plan, plan.style);
  const secs = (plan.arrangement?.sections ?? []) as { kind: string; startBar: number; bars: number }[];
  const kind = secs.find((s) => s.startBar <= w.from && w.from < s.startBar + s.bars)?.kind ?? '';
  const sc = sumClipOf(plan, plan.style);
  const r = rows.get(keyOf(link));
  return {
    group, name, link, theme: Math.max(0, Number(q.get('theme') || 1) - 1), seed: q.get('seed')!, spell: q.get('spell'),
    bpm: +plan.bpm.toFixed(1), clock: isFree(plan as { clock?: string }) ? 'free' : 'bar', bars: plan.bars, density: plan.density,
    beatLed: bl.value, felt: bl.felt, tempoShare: bl.tempo, drumsShare: bl.drums,
    family: loudnessFamily(f), target: trimTargetLufs(plan, plan.style), placeTarget: (plan as { sound?: { targetLufs?: number } }).sound?.targetLufs ?? null,
    trimDb: plan.trimDb ?? 0, predicted: +predictedLufs(plan, plan.style).toFixed(2), headroom: headroomDb(plan, plan.style), sumClipOverDb: sc ? sc.overDb : null,
    window: { from: w.from, bars: w.bars, kind },
    sections: secs.map((s) => `${s.kind}:${s.bars}`).join(' '),
    ...(r ? { landed: r.lufs, atTrim: r.atTrim, limiter: limiterOf(r) } : {}),
  };
}

const FEATURED = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'featured.json'), 'utf8')) as { playlists: { name: string; links: string[]; labels: string[] }[] };

function main() {
  const rows = loadRows();
  const themes = +arg('themes', '1')!;
  const out: PlaceFacts[] = [];
  for (const p of FEATURED.playlists) {
    p.links.forEach((link, i) => {
      const own = Math.max(0, Number(new URLSearchParams(link).get('theme') || 1) - 1);
      for (let k = 0; k < themes; k++) out.push(factsOf(p.name, `${p.name} - ${p.labels[i]}`, withTheme(link, own + k), rows));
    });
  }
  const from = +arg('from', '1')!, to = +arg('to', '12')!;
  if (!has('no-grid')) for (const g of grid()) {
    if (g.name === '27191 ambient') continue;
    for (let s = from; s <= to; s++) out.push(factsOf('grid', g.name, linkOf(String(s), g.spell, 0), rows));
  }
  if (arg('out')) fs.writeFileSync(path.resolve(arg('out')!), JSON.stringify({ note: 'tools/loudness-by-place.ts: plan facts and the at-trim rows joined (round loudness-by-place)', measuredAt: new Date().toISOString().slice(0, 10), rows: out }, null, 1) + '\n');
  if (has('md')) print(out);
}

const f1 = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '' : x.toFixed(d));
const med = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const mean = (xs: number[]) => { const s = xs.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN; };

function print(out: PlaceFacts[]) {
  for (const g of ['Vibe', 'Drive', 'Ambient']) {
    console.log(`\n### ${g}\n`);
    console.log('| track | theme | BPM | clock | beat-led (tempo × drums) | family | target | trim | predicted | landed | limiter % (>1 dB) | deepest | crest |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of out.filter((r) => r.group === g)) {
      const L = r.limiter;
      console.log(`| ${r.name} | ${r.theme + 1} | ${f1(r.bpm, 0)} | ${r.clock} | ${f1(r.beatLed, 2)} (${f1(r.tempoShare, 2)} × ${f1(r.drumsShare, 2)}) | ${r.family} | ${f1(r.target)} | ${f1(r.trimDb, 2)} | ${f1(r.predicted)} | ${f1(r.landed)} | ${L ? `${f1(L.share)} (${f1(L.share1)})` : ''} | ${L ? f1(L.depth) : ''} | ${L ? f1(L.crest) : ''} |`);
    }
  }
  const places = [...new Set(out.filter((r) => r.group === 'grid').map((r) => r.name))];
  console.log(`\n### The grid, by place (theme 0, seeds ${arg('from', '1')}-${arg('to', '12')})\n`);
  console.log('| place | n (rows) | BPM | beat-led, median | family | target | trim, median | landed, median | limiter %, mean | past 15 % | deepest, median | crest, median |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of places) {
    const rs = out.filter((r) => r.group === 'grid' && r.name === p);
    const withRows = rs.filter((r) => r.limiter);
    const fam = [...new Set(rs.map((r) => r.family))].join('/');
    console.log(`| ${p} | ${rs.length} (${withRows.length}) | ${f1(med(rs.map((r) => r.bpm)), 0)} | ${f1(med(rs.map((r) => r.beatLed)), 2)} | ${fam} | ${f1(med(rs.map((r) => r.target)))} | ${f1(med(rs.map((r) => r.trimDb)), 2)} | ${f1(med(withRows.map((r) => r.landed!)))} | ${f1(mean(withRows.map((r) => r.limiter!.share)))} | ${withRows.filter((r) => r.limiter!.share > 15).length} | ${f1(med(withRows.map((r) => r.limiter!.depth)))} | ${f1(med(withRows.map((r) => r.limiter!.crest)))} |`);
  }
  // by beat-led band, the house family's rows
  console.log('\n### By the beat-led reading (rows with a render)\n');
  console.log('| beat-led | n | landed, median | limiter %, mean | past 15 % | deepest, median | crest, median |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [lo, hi, label] of [[0, 0.001, '0 (deep)'], [0.001, 0.5, '0-0.5'], [0.5, 0.75, '0.5-0.75'], [0.75, 1.01, '0.75-1']] as const) {
    const rs = out.filter((r) => r.limiter && r.beatLed >= lo && r.beatLed < hi);
    if (!rs.length) continue;
    console.log(`| ${label} | ${rs.length} | ${f1(med(rs.map((r) => r.landed!)))} | ${f1(mean(rs.map((r) => r.limiter!.share)))} | ${rs.filter((r) => r.limiter!.share > 15).length} | ${f1(med(rs.map((r) => r.limiter!.depth)))} | ${f1(med(rs.map((r) => r.limiter!.crest)))} |`);
  }
}

main();
