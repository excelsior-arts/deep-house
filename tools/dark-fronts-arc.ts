// dark-fronts (the tenth pass): **the arc of a track, as a producer reads it off the plan**. For each link: the sections
// as a bar table (kind, bars, felt bars, the clock), what enters and leaves, what the front and the bass do, the phrase
// and the wave's lengths; then what a producer would hear as wrong: a stitched hand-over out of the intro, a phrase cut
// by a section line, a section too long or too short for its material, a break that does not develop, a call without an
// answer. Never a render.
//
//   node tools/dark-fronts-arc.ts '<link>' ['<link>' …]          the tables
//   node tools/dark-fronts-arc.ts --region 40 --only-roles          the region's stream, the themes whose place turned the roles round
//   node tools/dark-fronts-arc.ts --json out.json …               the facts, for a note

import fs from 'node:fs';
import { planOf, coordinateOf } from '../packages/deep-house/tools/like/features.ts';
import { regionLinks } from '../packages/deep-house/tools/static-runs.ts';
import { staticRuns } from '../packages/deep-house/src/long-main.ts';
import { feltPulseOf } from '../packages/deep-house/src/beat-reading.ts';

const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn, n = console.info; console.log = console.warn = console.info = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.info = n; } };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);

type Ev = { layer: string; voice: string; t: number; bar: number; step?: number; p: Record<string, any> };

/** The period, in bars, at which a lane's bar-by-bar content repeats (the smallest lag of 1, 2, 4, 8, 16 that matches four bars in five). */
function periodOf(keys: string[]): number | null {
  const on = keys.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  if (on.length < 4) return null;
  for (const lag of [1, 2, 4, 8, 16, 32]) {
    let same = 0, n = 0;
    for (const i of on) if (i + lag < keys.length && keys[i + lag]) { n++; if (keys[i + lag] === keys[i]) same++; }
    if (n >= 3 && same / n >= 0.8) return lag;
  }
  return null;
}

export function arcOf(link: string) {
  const { track } = quiet(() => planOf(coordinateOf(link))) as { track: any };
  const bs: number = track.barSeconds, bars: number = track.bars, bpm: number = track.bpm;
  const secs = track.arrangement.sections as Array<{ kind: string; startBar: number; bars: number; half?: true }>;
  const T = track.phraseMap?.time ?? null;
  const events = track.events as Ev[];
  const felt = feltPulseOf({ barSeconds: bs, arrangement: track.arrangement }, events, bpm);
  const feltMul = felt.half ? 2 : 1;
  const phraseBars: number = T?.phraseBars ?? 8;
  // the wave: the reese's sweep period (the composer writes it on the note), in written bars
  const hz = events.filter((e) => e.layer === 'bass' && typeof e.p.movementHz === 'number').map((e) => e.p.movementHz as number);
  const waveS = hz.length ? 1 / hz.sort((a, b) => a - b)[hz.length >> 1] : null;
  const waveBars = waveS != null ? +(waveS / bs).toFixed(2) : null;
  // a lane's bar key: its notes' steps and pitches
  const keyOf = (lane: string, b: number) => events.filter((e) => e.layer === lane && e.bar === b).map((e) => `${e.step ?? 0}:${e.p.midi ?? e.voice}`).sort().join(',');
  const laneKeys = (lane: string, from: number, to: number) => { const out: string[] = []; for (let b = from; b < to; b++) out.push(keyOf(lane, b)); return out; };
  const partsIn = (from: number, to: number, share = 1 / 3) => {
    const count = new Map<string, Set<number>>();
    for (const e of events) {
      if (e.layer === 'fx') continue;
      const b0 = e.bar, dur = Number(e.p.dur ?? 0);
      const b1 = Math.min(to - 1, Math.floor((e.t + dur) / bs - 0.25 + 1e-6));
      const name = `${e.layer}:${e.voice}`;
      let s = count.get(name); if (!s) count.set(name, (s = new Set()));
      for (let b = Math.max(from, b0); b <= Math.max(b0, b1); b++) if (b >= from && b < to) s.add(b);
    }
    return [...count.entries()].filter(([, s]) => s.size >= (to - from) * share).map(([n]) => n).sort();
  };
  const rows: any[] = [];
  let prev: string[] = [];
  for (const [i, s] of secs.entries()) {
    const from = s.startBar, to = s.startBar + s.bars;
    const parts = partsIn(from, to);
    const enters = parts.filter((p) => !prev.includes(p)), leaves = prev.filter((p) => !parts.includes(p));
    const keys = events.filter((e) => e.layer === 'keys' && e.bar >= from && e.bar < to);
    const bass = events.filter((e) => e.layer === 'bass' && e.bar >= from && e.bar < to);
    const kVoices = [...new Set(keys.map((e) => e.voice))];
    const frontPeriod = periodOf(laneKeys('keys', from, to)), bassPeriod = periodOf(laneKeys('bass', from, to));
    rows.push({ i, kind: s.kind + (s.half ? ' (half)' : ''), from, bars: s.bars, feltBars: s.bars / feltMul, at: mmss(from * bs), seconds: +(s.bars * bs).toFixed(1),
      phrases: +(s.bars / phraseBars).toFixed(2), cut: s.bars % phraseBars !== 0,
      enters, leaves, front: kVoices.join('+') || '-', frontPerBar: +(keys.length / s.bars).toFixed(2), frontBars: new Set(keys.map((e) => e.bar)).size,
      bassPerBar: +(bass.length / s.bars).toFixed(2), frontPeriod, bassPeriod, parts });
    prev = parts;
  }
  // the hand-over out of the intro: what the intro's last phrase and the first groove's first phrase share above the drums
  const firstGroove = secs.find((s) => s.kind === 'main' || s.kind === 'drop' || s.kind === 'groove');
  const intro = secs[0];
  let stitched: null | { shared: string[]; introLast: string[]; grooveFirst: string[] } = null;
  if (firstGroove && intro && intro !== firstGroove) {
    const a = partsIn(Math.max(intro.startBar, intro.startBar + intro.bars - phraseBars), intro.startBar + intro.bars, 0.25).filter((p) => !/^(kick|hats|clap|shaker|sixteenths|perc)/.test(p));
    const b = partsIn(firstGroove.startBar, Math.min(firstGroove.startBar + firstGroove.bars, firstGroove.startBar + phraseBars), 0.25).filter((p) => !/^(kick|hats|clap|shaker|sixteenths|perc)/.test(p));
    stitched = { shared: a.filter((p) => b.includes(p)), introLast: a, grooveFirst: b };
  }
  const runs = staticRuns(track).map((r) => ({ from: r.from, to: r.to, bars: r.bars, seconds: r.seconds, kind: r.kind, beatLed: r.beatLed }));
  const df = track.darkFronts ?? null, lm = track.longMain ?? null, bb = track.breakBed ? { sketch: track.breakBed.sketch, reads: (track.breakBed.reads ?? []).map((r: any) => ({ at: r.startBar ?? r.from, kind: r.kind, overDb: r.overDb ?? r.over })) } : null;
  return { link, bpm, bars, seconds: +(bars * bs).toFixed(1), clock: mmss(bars * bs), barS: +bs.toFixed(3), felt, placeFelt: T?.felt ?? null, phraseBars, phraseS: T?.phraseS ?? null,
    waveS: waveS != null ? +waveS.toFixed(2) : null, waveBars, key: track.key ?? null, roles: track.sound?.roles?.id ?? null,
    firstGroove: firstGroove ? { kind: firstGroove.kind, bars: firstGroove.bars, seconds: +(firstGroove.bars * bs).toFixed(1) } : null,
    stitched, rows, runs, darkFronts: df, longMain: lm ? { splits: lm.splits, windows: lm.windows } : null, breakBed: bb };
}

function print(a: ReturnType<typeof arcOf>) {
  console.log(`\n### ${a.link}`);
  console.log(`${a.bpm} BPM, ${a.bars} bars, ${a.clock}; bar ${a.barS} s; felt by the drums: ${a.felt.half ? 'HALF' : 'whole'} (kick ${a.felt.kicksPerBar}/bar, backbeat ${a.felt.backbeatsPerBar}/bar, on three ${a.felt.onThree}); the place says ${a.placeFelt}; phrase ${a.phraseBars} bars (${a.phraseS?.toFixed(1)} s); wave ${a.waveS} s = ${a.waveBars} bars; roles ${a.roles}`);
  if (a.darkFronts) console.log(`dark fronts: lead ${a.darkFronts.lead} (${a.darkFronts.phrasing}), call breaks ${JSON.stringify(a.darkFronts.callBreaks ?? [])}, build ${a.darkFronts.callBuild}, form ${JSON.stringify(a.darkFronts.form ?? null)}, wet ${JSON.stringify(a.darkFronts.wet ?? null)}`);
  if (a.longMain) console.log(`long-main: ${JSON.stringify(a.longMain)}`);
  if (a.breakBed) console.log(`break bed: ${JSON.stringify(a.breakBed)}`);
  if (a.stitched) console.log(`intro → groove: shared ${JSON.stringify(a.stitched.shared)}; intro's last phrase ${JSON.stringify(a.stitched.introLast)}; groove's first ${JSON.stringify(a.stitched.grooveFirst)}`);
  console.log('| # | section | at | bars (felt) | s | phrases | enters | leaves | front (notes/bar, bars) | bass/bar | front period | bass period |');
  for (const r of a.rows) console.log(`| ${r.i} | ${r.kind} | ${r.at} | ${r.bars} (${r.feltBars})${r.cut ? ' CUT' : ''} | ${r.seconds} | ${r.phrases} | ${r.enters.join(' ')} | ${r.leaves.join(' ')} | ${r.front} (${r.frontPerBar}, ${r.frontBars}/${r.bars}) | ${r.bassPerBar} | ${r.frontPeriod ?? '-'} | ${r.bassPeriod ?? '-'} |`);
  if (a.runs.length) console.log(`still: ${a.runs.map((r) => `${r.kind} ${r.from}-${r.to} (${r.bars} bars, ${r.seconds} s)`).join('; ')}`);
}

const links: string[] = [];
const region = arg('region');
if (region) { const from = Number(arg('from', '0')); links.push(...regionLinks(from + Number(region)).slice(from).map(([, l]) => l)); }
links.push(...process.argv.slice(2).filter((x) => x.startsWith('?')));
const out: any[] = [];
for (const l of links) { const a = arcOf(l); if (has('only-roles') && !a.roles) continue; out.push(a); print(a); }
if (arg('json')) fs.writeFileSync(arg('json')!, JSON.stringify(out, null, 1));
