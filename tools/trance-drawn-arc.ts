// trance-drawn (the third pass): **the arc of a theme in the corner, as a producer reads it off the plan**. For each
// link: the sections as a bar table (kind, bars, the clock, phrases), what enters and leaves, what the front and the bass
// do, where the saw plays and for how long, the figure's filter, the kick's share; then the waits and their releases
// (each breakdown with the build after it, against the groove that answers them). Never a render.
//
//   node tools/trance-drawn-arc.ts '<link query>' ['<link query>' …]
//   node tools/trance-drawn-arc.ts --json out.json …
import fs from 'node:fs';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';

const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn, n = console.info; console.log = console.warn = console.info = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.info = n; } };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
type Ev = { layer: string; voice: string; t: number; bar: number; step?: number; part?: string; p: Record<string, any> };
const DRUMS = /^(kick|hats|clap|shaker|sixteenths|perc|snare|toms|ride|crash)/;

export function planOf(q: string) {
  const read = linkRead(`?${q}`); const L = read.link;
  const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search: `?${read.search}` });
  return quiet(() => planTheme(L.seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } as never)) as any;
}

export function arcOf(q: string) {
  const t = planOf(q);
  const bs: number = t.barSeconds, bars: number = t.bars, bpm: number = t.bpm;
  const secs = t.arrangement.sections as Array<{ kind: string; startBar: number; bars: number; half?: true }>;
  const events = t.events as Ev[];
  const phraseBars: number = t.phraseMap?.time?.phraseBars ?? 8;
  const partsIn = (from: number, to: number, share = 1 / 3) => {
    const count = new Map<string, Set<number>>();
    for (const e of events) {
      if (e.layer === 'fx') continue;
      const b1 = Math.min(to - 1, Math.floor((e.t + Number(e.p.dur ?? 0)) / bs - 0.25 + 1e-6));
      const name = `${e.layer}:${e.voice}${e.p.timbre && e.p.timbre !== e.voice ? '/' + e.p.timbre : ''}`;
      let s = count.get(name); if (!s) count.set(name, (s = new Set()));
      for (let b = Math.max(from, e.bar); b <= Math.max(e.bar, b1); b++) if (b >= from && b < to) s.add(b);
    }
    return [...count.entries()].filter(([, s]) => s.size >= (to - from) * share).map(([n]) => n).sort();
  };
  const rows: any[] = [];
  let prev: string[] = [];
  const med = (xs: number[]) => xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : null;
  for (const [i, s] of secs.entries()) {
    const from = s.startBar, to = from + s.bars;
    const parts = partsIn(from, to);
    const keys = events.filter((e) => e.layer === 'keys' && e.bar >= from && e.bar < to && !/saw/.test(e.part ?? ''));
    const saw = events.filter((e) => /trance:saw/.test(e.part ?? '') || /supersaw/.test(e.voice));
    const sawBars = new Set(saw.filter((e) => e.bar >= from && e.bar < to).map((e) => e.bar)).size;
    const bass = events.filter((e) => e.layer === 'bass' && e.bar >= from && e.bar < to);
    const kickBars = new Set(events.filter((e) => e.layer === 'kick' && e.bar >= from && e.bar < to).map((e) => e.bar)).size;
    const cut = med(keys.map((e) => Number(e.p.cutoffMul)).filter(Number.isFinite));
    const padCut = med(events.filter((e) => e.layer === 'pad' && e.bar >= from && e.bar < to).map((e) => Number(e.p.cutoffMul)).filter(Number.isFinite));
    const vel = med(keys.map((e) => Number(e.p.vel)).filter(Number.isFinite));
    const fx = [...new Set(events.filter((e) => e.layer === 'fx' && e.bar >= from && e.bar < to).map((e) => e.voice))];
    rows.push({ i, kind: s.kind + (s.half ? ' (half)' : ''), from, bars: s.bars, at: mmss(from * bs), seconds: +(s.bars * bs).toFixed(1), phrases: +(s.bars / phraseBars).toFixed(2), cut: s.bars % phraseBars !== 0,
      enters: parts.filter((p) => !prev.includes(p)), leaves: prev.filter((p) => !parts.includes(p)),
      front: [...new Set(keys.map((e) => e.voice))].join('+') || '-', frontPerBar: +(keys.length / s.bars).toFixed(2), frontBars: new Set(keys.map((e) => e.bar)).size,
      frontCut: cut, padCut, frontVel: vel, bassPerBar: +(bass.length / s.bars).toFixed(2), kickBars, sawBars, fx, parts });
    prev = parts;
  }
  // the waits and the releases: each breakdown (with the build after it) against the groove that answers it
  const waits: any[] = [];
  for (let i = 0; i < secs.length; i++) {
    if (secs[i].kind !== 'breakdown') continue;
    let j = i + 1, wait = secs[i].bars;
    while (j < secs.length && secs[j].kind === 'build') { wait += secs[j].bars; j++; }
    let release = 0, k = j;
    while (k < secs.length && (secs[k].kind === 'drop' || secs[k].kind === 'main')) { release += secs[k].bars; k++; }
    waits.push({ at: mmss(secs[i].startBar * bs), breakdown: secs[i].bars, build: wait - secs[i].bars, wait, waitS: +(wait * bs).toFixed(0), release, releaseS: +(release * bs).toFixed(0), answered: secs[j]?.kind ?? 'end' });
  }
  const sawAll = new Set(events.filter((e) => /trance:saw/.test(e.part ?? '') || /supersaw/.test(e.voice)).map((e) => e.bar)).size;
  const frontAll = new Set(events.filter((e) => e.layer === 'keys').map((e) => e.bar)).size;
  const kickAll = new Set(events.filter((e) => e.layer === 'kick').map((e) => e.bar)).size;
  return { link: q, bpm, bars, clock: mmss(bars * bs), barS: +bs.toFixed(3), phraseBars, key: t.key ?? null, drawn: t.tranceDrawn ?? null, hook: !!events.find((e) => e.layer === 'keys' && e.p?.hook != null),
    shares: { front: +(frontAll / bars).toFixed(2), saw: +(sawAll / bars).toFixed(2), kick: +(kickAll / bars).toFixed(2) }, longMain: t.longMain ? { splits: t.longMain.splits, windows: t.longMain.windows } : null,
    breakBed: t.breakBed ? { sketch: t.breakBed.sketch, cuts: t.breakBed.cuts } : null, feltWhole: !!t.feltWhole, rows, waits };
}

export function print(a: ReturnType<typeof arcOf>) {
  console.log(`\n### ${a.link}`);
  console.log(`${a.bpm} BPM, ${a.bars} bars, ${a.clock}; bar ${a.barS} s; phrase ${a.phraseBars}; drawn ${JSON.stringify(a.drawn)}; hook ${a.hook}; shares ${JSON.stringify(a.shares)}${a.longMain ? `; long-main ${JSON.stringify(a.longMain)}` : ''}${a.breakBed ? `; break bed ${JSON.stringify(a.breakBed)}` : ''}${a.feltWhole ? '; felt whole (the half band re-rolled)' : ''}`);
  console.log('| # | section | at | bars | s | phr | enters | leaves | front (n/bar, bars) | filter f/p | vel | bass/bar | kick | saw | fx |');
  for (const r of a.rows) console.log(`| ${r.i} | ${r.kind} | ${r.at} | ${r.bars}${r.cut ? ' CUT' : ''} | ${r.seconds} | ${r.phrases} | ${r.enters.join(' ')} | ${r.leaves.join(' ')} | ${r.front} (${r.frontPerBar}, ${r.frontBars}/${r.bars}) | ${r.frontCut ?? '-'}/${r.padCut ?? '-'} | ${r.frontVel ?? '-'} | ${r.bassPerBar} | ${r.kickBars} | ${r.sawBars} | ${r.fx.join(' ')} |`);
  for (const w of a.waits) console.log(`wait at ${w.at}: breakdown ${w.breakdown} + build ${w.build} = ${w.wait} bars (${w.waitS} s) → release ${w.release} bars (${w.releaseS} s), answered by ${w.answered}`);
}

const links = process.argv.slice(2).filter((x) => !x.startsWith('--') && x.includes('seed='));
const out: any[] = [];
for (const l of links) { const a = arcOf(l); out.push(a); print(a); }
if (arg('json')) fs.writeFileSync(arg('json')!, JSON.stringify(out, null, 1));
