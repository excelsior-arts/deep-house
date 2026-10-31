// **The hand-overs over a grid** (round mix-voices): two tracks of the house's places handed over as a playlist hands
// them (the record's own seam line, the hand's numbers, two clocks where far), read off the plans — never a render.
//
//   node tools/mix-voices-grid.ts [--seeds 20] [--jobs 2] [--json <file>]
//
// For each place of the endings grid (Chillstep, the house, the tiles, every tuned genre) and seeds 1..n: the place's
// theme into the same place's theme of seed n+1 (mostly beat-matched) and into the next place's (mostly two clocks).
// Each row: the kind, the record's way (`seamShape`), the lead before and now, the carrier, the key rule, and two ear
// proxies off the curves:
//   - `aheadS`: the seconds before the swap the arriving voices are up (its fader past -20 dB, its harmony open where
//     the keys do not fit) and it has a harmonic note there; before: the exponential rise over min(4, bars/3) bars is
//     past -20 dB at its three quarters, the harmony opens a bar before the swap where the keys do not fit;
//   - `lingerS` (two clocks): the seconds after the swap the record's voices stay within 12 dB of full; before: the
//     fall in decibels from the swap reaches -12 at half of it; now: held for half, then the same fall.

import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { played } from './link-digest.ts';
import { endSpells } from './ends-table.ts';
import { linkWrite } from '../src/link.ts';
import { seamPlan, blendAsked, seamTempo, freeSides, seamFromHere, handSeamBars, splitSeamBars, programOf, isFree } from '../src/performance.ts';
import { setOptions, tailSeconds, swapAfterBars, splitSwap, leadFor, seamShape } from '../src/set-plan.ts';
import { STRATEGIES } from '../src/strategies/index.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const arg = (k: string, d?: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const style = STRATEGIES['house-v2'].style;
const o = setOptions(style, {});
const HERE = fileURLToPath(import.meta.url);

function row(place: string, into: string, a: string, b: string, spellA: any) {
  const A: any = quiet(() => played(a).plan), B: any = quiet(() => played(b).plan);
  if (isFree(A) || isFree(B)) return null;
  const seam = quiet(() => seamPlan(A, blendAsked(A), { boundaryBars: o.boundaryBars, notBefore: 0 }));
  const rule = seamTempo(A.bpm, B.bpm, o, freeSides(A, B));
  const gridBar = A.barSeconds;
  const hand = handSeamBars(o.handSeam, gridBar, o.harmonicCross, o.swapAfterBars);
  const s = seamFromHere(A, seam.at, B, { unit: 1, most: hand.blend });
  const split = rule.kind === 'split';
  const fs_ = split ? splitSeamBars(s.bars, gridBar, tailSeconds(spellA, style).blendSeconds, B.barSeconds) : null;
  const barS = fs_ ? fs_.barSeconds : gridBar, bars = fs_ ? fs_.bars : s.bars;
  const handOn = fs_ ? handSeamBars(o.handSeam, barS, o.harmonicCross, o.swapAfterBars) : hand;
  const least = swapAfterBars(bars, split ? splitSwap({ swapAfterBars: handOn.swap }) : { swapAfterBars: handOn.swap });
  const lead = leadFor(A, B, s.at, 1, bars, barS, least, o);
  const shape = seamShape({ from: A, to: B, fromBpm: A.bpm, bars, barSeconds: barS, split, lead, atInFrom: s.at, atInTo: 0, fromRate: 1, toRate: 1, o });
  const cross = handOn.cross ?? o.harmonicCross!;
  const ev = programOf(B).events;
  const voicesIn = (t0: number, t1: number) => ev.some((e: any) => (e.bus === 'melodic' || e.bus === 'keys') && e.t >= t0 && e.t < t1);
  const ahead = (swapBars: number, upFrom: number) => {
    const swapS = swapBars * barS;
    return upFrom < swapS && voicesIn(upFrom, swapS) ? +(swapS - upFrom).toFixed(1) : 0;
  };
  // before: the fader past -20 dB at three quarters of its rise; the harmony a bar before the swap where the keys do not fit
  const oldUp = Math.max(0.75 * Math.min(4, bars / 3) * barS, shape.related ? 0 : (least - Math.min(least, cross.crossBars)) * barS);
  // now: -6 dB a bar in; the harmony from a bar before the lead's middle where the keys do not fit
  const half = Math.max(1, Math.floor(lead / 2));
  const newUp = shape.related ? Math.min(barS, half * barS) * 0.5 : Math.max(0, half - Math.min(half, cross.crossBars)) * barS;
  const end = bars * barS;
  const ringS = split ? Math.min(tailSeconds(spellA, style).ringSeconds, (end - least * barS) / 2) : 0;
  const lingerOld = split && shape.related ? +(((end - ringS) - least * barS) / 2).toFixed(1) : 0;
  const ringN = split ? Math.min(tailSeconds(spellA, style).ringSeconds, (end - lead * barS) / 2) : 0;
  const lingerNew = split && shape.related ? +(((end - ringN) - lead * barS) * 0.75).toFixed(1) : 0;
  return {
    place, into, a, b, kind: rule.kind, bpm: [A.bpm, B.bpm], way: shape.way, beatLed: shape.beatLed, carrier: shape.carrier, related: shape.related,
    bars, barS: +barS.toFixed(2), least, lead, leastS: +(least * barS).toFixed(1), leadS: +(lead * barS).toFixed(1),
    aheadOld: ahead(least, oldUp), aheadNew: ahead(lead, newUp), lingerOld, lingerNew,
  };
}

function jobs(seeds: number) {
  const places = endSpells();
  const out: Array<{ place: string; into: string; a: string; b: string; spell: any }> = [];
  places.forEach((p, i) => {
    const q = places[(i + 1) % places.length];
    for (let seed = 1; seed <= seeds; seed++) {
      const a = linkWrite({ seed: String(seed), theme: 0, strategy: 'house-v2', spell: p.spell } as any);
      out.push({ place: p.name, into: p.name, a, b: linkWrite({ seed: String(seed + 1), theme: 0, strategy: 'house-v2', spell: p.spell } as any), spell: p.spell });
      out.push({ place: p.name, into: q.name, a, b: linkWrite({ seed: String(seed + 1), theme: 0, strategy: 'house-v2', spell: q.spell } as any), spell: p.spell });
    }
  });
  return out;
}

async function main() {
  const seeds = +(arg('--seeds', '20')!);
  const shard = arg('--shard');
  if (shard) {
    const [k, n] = shard.split('/').map(Number);
    const rows = jobs(seeds).filter((_, i) => i % n === k).map((j) => row(j.place, j.into, j.a.replace(/^\?/, ''), j.b.replace(/^\?/, ''), j.spell)).filter(Boolean);
    process.stdout.write(JSON.stringify(rows));
    return;
  }
  const n = +(arg('--jobs', '2')!);
  const parts = await Promise.all(Array.from({ length: n }, (_, k) => new Promise<any[]>((res, rej) => {
    const c = spawn(process.execPath, [HERE, '--shard', `${k}/${n}`, '--seeds', String(seeds)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => (code ? rej(new Error(`shard ${k} ${code}`)) : res(JSON.parse(out))));
  })));
  const rows = parts.flat();
  const json = arg('--json');
  if (json) fs.writeFileSync(json, JSON.stringify(rows));
  const med = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (k: number, of: number) => `${k} (${of ? Math.round((100 * k) / of) : 0} %)`;
  const table = (title: string, rs: any[]) => {
    console.log(`\n**${title}** (${rs.length} seams)\n`);
    console.log('| | seams | lead before → now (median s) | arriving voices ahead, before → now (median s) | none ahead, before → now | voices linger (two clocks, related; median s) | keys unrelated | carrier |');
    console.log('|---|---|---|---|---|---|---|---|');
    for (const way of ['drive', 'lift', 'deep']) for (const kind of ['split', 'beat-matched']) {
      const g = rs.filter((r) => r.way === way && (kind === 'split' ? r.kind === 'split' : r.kind !== 'split'));
      if (!g.length) continue;
      const lg = g.filter((r) => r.kind === 'split' && r.related);
      const car: Record<string, number> = {};
      for (const r of g) car[r.carrier] = (car[r.carrier] ?? 0) + 1;
      console.log(`| ${way}, ${kind} | ${g.length} | ${med(g.map((r) => r.leastS))} → ${med(g.map((r) => r.leadS))} | ${med(g.map((r) => r.aheadOld))} → ${med(g.map((r) => r.aheadNew))} | ${g.filter((r) => !r.aheadOld).length} → ${g.filter((r) => !r.aheadNew).length} | ${lg.length ? `${med(lg.map((r) => r.lingerOld))} → ${med(lg.map((r) => r.lingerNew))}` : '—'} | ${pct(g.filter((r) => !r.related).length, g.length)} | ${Object.entries(car).map(([k, v]) => `${k} ${v}`).join(', ')} |`);
    }
  };
  table(`The grid, seeds 1-${seeds}: each place into itself and into the next`, rows);
  const lead = rows.filter((r) => r.lead > r.least).length;
  console.log(`\nthe lead grew on ${pct(lead, rows.length)}; the arriving voices ahead longer on ${pct(rows.filter((r) => r.aheadNew > r.aheadOld).length, rows.length)}, shorter on ${rows.filter((r) => r.aheadNew < r.aheadOld).length}`);
  console.log(`a deep record gone the lift way (no arriving voice to bridge on, or a bridge with keys that do not fit over its drums): ${rows.filter((r) => r.way === 'lift' && r.beatLed < 0.5).length}`);
  console.log(`beat-led records whose lead has no carrier of their own (the arriving top carries): ${rows.filter((r) => r.carrier === 'arriving').length}`);
}

if (process.argv[1] === HERE) await main();
