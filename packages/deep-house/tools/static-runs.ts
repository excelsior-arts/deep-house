// Lab tool (round long-main): **the minute that doesn't move**. Over a set of links, every stretch of a theme that runs
// 32 bars or more (or 45 s or more) with no change above the drums, read off the plan (never a render).
//
// A change above the drums, bar by bar, per part (a part is a lane's voice: the bass, the pad, the keys' voice, a
// texture; the kit and the one-shot FX are the drums' and never count):
//   - a part entering or leaving (its "absent" is a state like any other),
//   - a new figure or phrase (the pitch classes it strikes in the bar, with its register for every part but the bass),
//   - a harmonic move outside the loop (a chord the last eight bars did not play reads as new pitch classes),
//   - a register or timbre turn (the register above; a voice change is a new part),
//   - a filter arc (the macro filter moving a quarter or more across the bar), a riser or a sweep two bars or longer,
// where the part's state at the bar was not heard in the eight bars before (a loop up to a phrase long repeats, never
// a change; a figure coming back after a phrase away is one). The bass's octave flips and its rhythm inside a bar are
// its fluctuation, not a figure: the bass is read by its pitch classes only.
//
//   node tools/static-runs.ts [--featured] [--house 1-200] [--grid 1-4] [--region 300] [--links 'a b'] [--json out.json]
//
// The reading itself is `src/long-main.ts`'s (`readStatic`, `staticRuns`); the plans are the tree's own, so on a tree
// with house-v2's `halfBreaks` on it counts what is left after them (each row's `longMain`: the splits and their bars).
//
// Prints the runs, a breakdown by section kind, place, tempo and density, and the longest.
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { linksOf } from './hat-floor-gather.ts';
import { genreOf } from '../src/sky.ts';
import { readStatic, staticRuns, type StaticRun } from '../src/long-main.ts';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const has = (k: string) => process.argv.includes(`--${k}`);

/** The reese-wobble region the dark-fronts round draws (its map: the dark, bass-heavy corner), the same stream. */
export function regionLinks(n: number): Array<[string, string]> {
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    const sp = { em: 0.7 + 0.3 * rnd(), ti: rnd(), ze: 0.35 * rnd(), ro: 0.6 + 0.4 * rnd(), gl: 0.4 * rnd(), ve: rnd(), sp: rnd(), lo: rnd() };
    const seed = 1 + Math.floor(rnd() * 99999), theme = 1 + Math.floor(rnd() * 3);
    out.push([`region ${i}`, `?seed=${seed}&v=2${theme > 1 ? `&theme=${theme}` : ''}&spell=${Object.entries(sp).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(',')}`]);
  }
  return out;
}

/** A plan's runs (`staticRuns`, src/long-main.ts), as the tool prints them. */
export function readRuns(track: any): { bars: number; barSeconds: number; bpm: number; changes: number[]; runs: StaticRun[]; sections: string[] } {
  const R = readStatic(track.events, track.bars, track.barSeconds, track.automation?.macroFilter ?? []);
  return { bars: track.bars, barSeconds: track.barSeconds, bpm: track.bpm, changes: R.changes, runs: staticRuns(track), sections: track.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}`) };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function main() {
  const jobs: Array<[string, string]> = [];
  jobs.push(...linksOf({ featured: has('featured'), grid: arg('grid'), house: arg('house') }));
  if (arg('region')) jobs.push(...regionLinks(Number(arg('region'))));
  if (arg('links')) arg('links')!.split(' ').filter(Boolean).forEach((l, i) => jobs.push([`link ${i}`, l]));
  const rows: any[] = [];
  const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn, n = console.info; console.log = console.warn = console.info = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.info = n; } };
  for (const [name, link] of jobs) {
    let r: ReturnType<typeof readRuns>, track: any;
    try { const p: any = quiet(() => planOf(coordinateOf(link))); track = p.track; r = readRuns(p.track); }
    catch (e) { console.error(name, 'FAILED', String(e).slice(0, 160)); continue; }
    let place = '?'; try { place = genreOf(link).name; } catch { /* a link the sky cannot read */ }
    const bassVoice = [...new Set((track.events as any[]).filter((e) => e.layer === 'bass').map((e) => e.voice))].join('/');
    rows.push({ name, link, place, bpm: +r.bpm.toFixed(1), bars: r.bars, seconds: +(r.bars * r.barSeconds).toFixed(0), bass: bassVoice, sections: r.sections, changes: r.changes, runs: r.runs, longMain: track.longMain ?? null });
    for (const run of r.runs) console.log(`${name.padEnd(28)} ${place.padEnd(18)} ${String(Math.round(r.bpm)).padStart(3)} bpm  ${run.kinds.join('>').padEnd(16)} bars ${run.from}-${run.to} (${run.bars}, ${mmss(run.from * r.barSeconds)}-${mmss(run.to * r.barSeconds)}, ${run.seconds} s)${run.beatLed ? '' : ' (slow or no kick)'}  parts ${run.parts.join(' ')}`);
  }
  // the breakdown
  const all = rows.flatMap((x) => x.runs.map((run: StaticRun) => ({ ...run, row: x })));
  const pct = (a: number, b: number) => `${a}/${b} (${b ? Math.round(100 * a / b) : 0} %)`;
  console.log(`\n${pct(rows.filter((x) => x.runs.length).length, rows.length)} themes with a static run of 32 bars or 45 s; ${all.length} runs`);
  const by = (f: (x: any) => string) => { const m: Record<string, number> = {}; for (const x of all) m[f(x)] = (m[f(x)] ?? 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '); };
  console.log('by section kind:', by((x) => x.kind));
  console.log('by place:', by((x) => x.row.place));
  console.log('by tempo:', by((x) => x.row.bpm < 100 ? '<100' : x.row.bpm < 118 ? '100-117' : x.row.bpm < 130 ? '118-129' : x.row.bpm < 150 ? '130-149' : '150+'));
  console.log('by density (parts above the drums):', by((x) => String(Math.min(x.parts.length, 4)) + (x.parts.length >= 4 ? "+" : "")));
  const tempoAll: Record<string, [number, number]> = {};
  for (const x of rows) { const k = x.bpm < 100 ? '<100' : x.bpm < 118 ? '100-117' : x.bpm < 130 ? '118-129' : x.bpm < 150 ? '130-149' : '150+'; tempoAll[k] ??= [0, 0]; tempoAll[k][1]++; if (x.runs.length) tempoAll[k][0]++; }
  console.log('themes with one, by tempo:', Object.entries(tempoAll).map(([k, [a, b]]) => `${k} ${pct(a, b)}`).join(', '));
  const longest = [...all].sort((a, b) => b.seconds - a.seconds).slice(0, 12);
  console.log('longest:'); for (const x of longest) console.log(`  ${x.seconds} s (${x.bars} bars, ${x.kinds.join('>')}) ${x.row.name} · ${x.row.place} · ${x.row.link}`);
  if (arg('json')) fs.writeFileSync(arg('json')!, JSON.stringify(rows));
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
