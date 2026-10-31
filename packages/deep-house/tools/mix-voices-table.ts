// **The playlist seams, read off the plans** (round mix-voices, his word 10-30: "our mixing became kind of too
// abrupt … I almost don't even hear any ahead of time voices"). For each featured playlist, each hand-over as the
// transport lays it (`handOver`: the record's own seam line, the hand's numbers, two clocks where far): the kind, both
// tempi, both keys and the notes they share, the blend and the swap, and which parts each side plays around it.
//
//   node tools/mix-voices-table.ts [--json <file>]

import fs from 'node:fs';
import { played } from './link-digest.ts';
import { FEATURED } from '../src/featured.ts';
import { seamPlan, blendAsked, seamTempo, freeSides, listPull, listTempo, seamFromHere, handSeamBars, splitSeamBars, programOf, isFree, beatLed } from '../src/performance.ts';
import { setOptions, tailSeconds, swapAfterBars, splitSwap, leadFor, seamShape } from '../src/set-plan.ts';
import { keysShared } from '../src/theory.ts';
import { STRATEGIES } from '../src/strategies/index.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const OLD = process.argv.includes('--old');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const style = STRATEGIES['house-v2'].style;
const o = setOptions(style, {});
const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** the layers that strike a note in [a, b) of a theme's own seconds, by bus */
function layersIn(plan: any, a: number, b: number): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const e of programOf(plan).events) if (e.t >= a && e.t < b) (out[e.bus] ??= new Set()).add(e.layer);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}
const formOf = (p: any) => (p.arrangement?.sections ?? []).map((s: any) => `${s.kind?.[0] ?? s.name?.[0]}${s.bars}`).join(' ');

const rows: any[] = [];
for (const f of FEATURED) {
  const plans = f.links.map((l) => quiet(() => played(l)));
  const tempi = plans.map((p) => (p.plan as any).bpm);
  const list = listTempo(tempi);
  for (let i = 0; i + 1 < plans.length; i++) {
    const A: any = plans[i].plan, B: any = plans[i + 1].plan;
    const pa = isFree(A) ? A.bpm : listPull(A.bpm, list) ?? A.bpm, pb = isFree(B) ? B.bpm : listPull(B.bpm, list) ?? B.bpm;
    const seam = quiet(() => seamPlan(A, blendAsked(A), { boundaryBars: o.boundaryBars, notBefore: 0 }));
    const rule = seamTempo(pa, pb, o, freeSides(A, B));
    const gridBar = 240 / pa;
    const hand = handSeamBars(o.handSeam, gridBar, o.harmonicCross, o.swapAfterBars);
    const s = seamFromHere(A, seam.at, B, { unit: 1, most: hand.blend });
    const tail = tailSeconds(plans[i].request.spell, A.style ?? style);
    const fs_ = rule.kind === 'split' ? splitSeamBars(s.bars, gridBar, tail.blendSeconds, 240 / pb) : null;
    const barS = fs_ ? fs_.barSeconds : gridBar, bars = fs_ ? fs_.bars : s.bars;
    const handOn = fs_ ? handSeamBars(o.handSeam, barS, o.harmonicCross, o.swapAfterBars) : hand;
    const least = swapAfterBars(bars, rule.kind === 'split' ? splitSwap({ swapAfterBars: handOn.swap }) : { swapAfterBars: handOn.swap });
    const shared = keysShared(A.key, B.key);
    // the record's own seconds a context second, at the tempo it is heard at
    const rate = pa / A.bpm;
    const free = isFree(A) || rule.kind === 'free';
    const swap = OLD || free ? least : leadFor(A, B, s.at, rate, bars, barS, least, o);
    const shape = free ? null : seamShape({ from: A, to: B, fromBpm: pa, bars, barSeconds: barS, split: rule.kind === 'split', lead: swap,
      atInFrom: s.at, atInTo: 0, fromRate: rate, toRate: pb / B.bpm, o: setOptions(style, rule.kind === 'split' ? splitSwap(o) : { ...o, swapAfterBars: handOn.swap, harmonicCross: handOn.cross }) });
    const swapS = swap * barS, endS = bars * barS;
    const row = {
      list: f.name, from: f.labels?.[i], to: f.labels?.[i + 1], kind: rule.kind,
      way: shape?.way ?? null, beatLed: shape?.beatLed ?? null, reading: beatLed(A, pa), carrier: shape?.carrier ?? null, related: shape?.related ?? null, least,
      bpm: [+pa.toFixed(1), +pb.toFixed(1)], own: [A.bpm, B.bpm], keys: [A.key.name, B.key.name], shared,
      formA: formOf(A), barsA: A.bars, seamBar: s.bar, left: A.bars - s.bar,
      bars, barS: +barS.toFixed(2), swap, swapS: +swapS.toFixed(1), endS: +endS.toFixed(1), tailS: +tail.blendSeconds.toFixed(1), ringS: +tail.ringSeconds.toFixed(1),
      cross: shared < o.harmonicCross!.related,
      // the record's bars past the swap that still have notes (its own seconds)
      recordAfterSwapS: +Math.max(0, (A.bars * A.barSeconds - (s.at + swapS * rate)) / rate).toFixed(1),
      formB: formOf(B),
      bLead: layersIn(B, 0, swapS * (B.bpm / pb)),
      bAfter: layersIn(B, swapS * (B.bpm / pb), (swapS + 8 * barS) * (B.bpm / pb)),
      aLead: layersIn(A, s.at, s.at + swapS * rate),
      aAfter: layersIn(A, s.at + swapS * rate, A.bars * A.barSeconds),
    };
    rows.push(row);
  }
}
for (const r of rows) {
  console.log(`${r.list} - ${r.from} → ${r.list} - ${r.to}: ${r.kind} ${r.bpm.join('→')} (own ${r.own.join('/')}) ${r.keys.join('→')} shared ${r.shared}${r.cross ? ' CROSS' : ''}`);
  console.log(`   way ${r.way} beatLed ${JSON.stringify(r.reading)} carrier ${r.carrier} related ${r.related} lead ${r.swap} (was ${r.least})`);
  console.log(`   A ${r.formA} seam@${r.seamBar} left ${r.left}; blend ${r.bars}×${r.barS}s swap ${r.swap} (${r.swapS}s) end ${r.endS}s tail ${r.tailS}/${r.ringS}; record notes after swap ${r.recordAfterSwapS}s`);
  console.log(`   B ${r.formB}`);
  console.log(`   B lead: ${JSON.stringify(r.bLead)}`);
  console.log(`   A lead: ${JSON.stringify(r.aLead)}`);
  console.log(`   A after: ${JSON.stringify(r.aAfter)}`);
}
const j = arg('--json');
if (j) fs.writeFileSync(j, JSON.stringify(rows, null, 1));
