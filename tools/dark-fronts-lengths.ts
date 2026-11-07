// dark-fronts (the tenth pass): **the lengths and the felt pulse**, read off the plans as the page plans them. For the
// featured tracks, the region's reese-wobble stream, and the tiles that must read whole (the house, trance, the four on
// the floor) and half (the deep half-time place, liquid DnB): tempo, bars, the clock, the place's felt pulse, the drums'
// read (`feltPulseOf`), and whether the theme was rolled on the half-time row and kept it. Never a render.
//
//   node tools/dark-fronts-lengths.ts [--region 60] [--tiles] [--featured] [--json out.json]

import fs from 'node:fs';
import { planOf, coordinateOf } from '../packages/deep-house/tools/like/features.ts';
import { regionLinks } from '../packages/deep-house/tools/static-runs.ts';
import { feltPulseOf } from '../packages/deep-house/src/beat-reading.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';

const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn, n = console.info; console.log = console.warn = console.info = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.info = n; } };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);

/** The tiles: a spell each, at the places that must read whole and the ones that read half. */
const TILES: Record<string, string> = {
  house: '', trance: 'em:0.86,sp:0.43,gl:0.18,lo:0.72,ro:0.72,ze:0.45,ve:0.66,ti:0.50',
  'four on the floor (driving)': 'em:0.75,ro:0.60,ze:0.50,ve:0.60', 'four on the floor (high)': 'em:0.88,ro:0.60,ze:0.50,ve:0.60',
  'deep half-time': 'em:0.92,sp:0.10,ti:0.90,ze:0.25,ro:0.85,ve:0.15,lo:0.80', 'liquid DnB': 'em:0.95,sp:0.55,ti:0.75,ze:0.60,ro:0.75,gl:0.55,ve:0.35,lo:0.70',
  'fast broken': 'em:0.95,sp:0.85,ze:0.70,ro:0.60,ve:0.60', 'broken driving': 'em:0.72,sp:0.70,ti:0.45,ze:0.65',
};

function row(group: string, name: string, link: string) {
  const { track } = quiet(() => planOf(coordinateOf(link))) as { track: any };
  const felt = feltPulseOf({ barSeconds: track.barSeconds, arrangement: track.arrangement }, track.events, track.bpm);
  return { group, name, link, bpm: track.bpm, bars: track.bars, seconds: +(track.bars * track.barSeconds).toFixed(1), clock: mmss(track.bars * track.barSeconds),
    placeFelt: track.phraseMap?.time?.felt ?? null, drumsHalf: felt.half, kicks: felt.kicksPerBar, backs: felt.backbeatsPerBar, onThree: felt.onThree, feltWhole: !!track.feltWhole,
    form: track.arrangement.sections.map((s: any) => `${s.kind[0]}${s.bars}`).join(' '), firstGrooveS: (() => { let n = 0; for (const x of track.arrangement.sections) { if (x.kind === 'intro' || x.kind === 'build') continue; if (x.kind === 'main' || x.kind === 'drop') n += x.bars; else break; } return +(n * track.barSeconds).toFixed(1); })(), grown: track.longMain?.splits?.filter((x: any) => x.kind === 'passage').reduce((a: number, x: any) => a + (x.grow ?? 0), 0) ?? 0 };
}

const rows: ReturnType<typeof row>[] = [];
if (has('featured')) for (const list of FEATURED as any[]) list.links.forEach((l: string, i: number) => rows.push(row(`featured ${list.name}`, list.labels?.[i] ?? `${i + 1}`, `?${l}`)));
if (has('tiles')) for (const [name, sp] of Object.entries(TILES)) for (let seed = 1; seed <= Number(arg('seeds', '12')); seed++) for (const theme of [1, 2, 3]) rows.push(row(`tile ${name}`, `${seed} t${theme}`, `?seed=${seed}&v=2${theme > 1 ? `&theme=${theme}` : ''}${sp ? `&spell=${sp}` : ''}`));
if (arg('region')) for (const [name, link] of regionLinks(Number(arg('region')))) rows.push(row('region', name, link));
for (const r of rows) console.log(`${r.group} | ${r.name} | ${r.bpm} | ${r.bars} bars | ${r.clock} | place ${r.placeFelt ?? '-'} | drums ${r.drumsHalf ? 'HALF' : 'whole'} (k ${r.kicks}, b ${r.backs}, on three ${r.onThree})${r.feltWhole ? ' [fell back to the groove band]' : ''}${r.grown ? ` [+${r.grown} bars]` : ''} | ${r.form}`);
const groups = [...new Set(rows.map((r) => r.group))];
for (const g of groups) {
  const xs = rows.filter((r) => r.group === g).map((r) => r.seconds).sort((a, b) => a - b);
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  const half = rows.filter((r) => r.group === g && r.drumsHalf).length;
  console.log(`${g}: n ${xs.length}, p10 ${mmss(q(0.1))}, median ${mmss(q(0.5))}, p90 ${mmss(q(0.9))} (${mmss(xs[0])}-${mmss(xs[xs.length - 1])}); drums read half in ${half}`);
}
if (arg('json')) fs.writeFileSync(arg('json')!, JSON.stringify(rows, null, 1));
