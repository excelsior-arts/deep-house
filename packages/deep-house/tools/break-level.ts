// Lab tool (round long-main, pass 3): every break that interrupts a groove, its loudest block against the groove's last
// bars (`readBreaks`, src/break-bed.ts, off the plan's read `stretchK`), and whether its bed is a voice the groove did
// not have. Plans as the tree plans (mine, or another sketch with `--sketch`, `none` for the breaks as drawn: `globalThis.__BREAK_BED__`).
//   node tools/break-level.ts [--featured] [--house 1-200] [--grid 1-4] [--sketch ceiling|keep|grow|mine|none] [--json out.json]
import fs from 'node:fs';
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
if (arg('sketch')) (globalThis as { __BREAK_BED__?: string }).__BREAK_BED__ = arg('sketch')!;
const { planOf, coordinateOf } = await import('./like/features.ts');
const { linksOf } = await import('./hat-floor-gather.ts');
const { readBreaks } = await import('../src/break-bed.ts');
const { stretchK } = await import('../src/set-plan.ts');
const { biasFor } = await import('../src/spell.ts');
const { genreOf } = await import('../src/sky.ts');
const jobs = linksOf({ featured: process.argv.includes('--featured'), grid: arg('grid'), house: arg('house') });
const rows: any[] = [];
const quiet = <T,>(f: () => T): T => { const l = console.log, w = console.warn, n = console.info; console.log = console.warn = console.info = () => {}; try { return f(); } finally { console.log = l; console.warn = w; console.info = n; } };
for (const [name, link] of jobs) {
  let p: any; try { p = quiet(() => planOf(coordinateOf(link))); } catch (e) { console.error(name, 'FAILED', String(e).slice(0, 120)); continue; }
  const t = p.track, birds = (biasFor(coordinateOf(link).spell ?? null, t.style) as any).spell;
  const reads = quiet(() => readBreaks(t, (a: number, b: number) => stretchK(t, t.style, birds, a, b)));
  let place = '?'; try { place = genreOf(link).name; } catch { /* */ }
  const kick = t.events.some((e: any) => e.layer === 'kick');
  rows.push({ name, link, place, bpm: +t.bpm.toFixed(1), kick, reads, breakBed: t.breakBed ?? null });
}
const every = rows.flatMap((r) => r.reads.map((x: any) => ({ ...x, row: r })));
const all = every.filter((x: any) => x.beatLed);
console.log(`${every.length - all.length} breaks left to their places (slow, no kick, or a part space of their own)`);
const n = (f: (x: any) => boolean) => all.filter(f).length;
console.log(`${rows.length} themes, ${all.length} breaks after a groove (${n((x) => x.half)} half-breaks)`);
console.log(`louder than the groove: ${n((x) => x.overDb > 0)} (over +1 dB ${n((x) => x.overDb > 1)}, over +3 ${n((x) => x.overDb > 3)}); in themes: ${new Set(all.filter((x) => x.overDb > 0).map((x) => x.row.name)).size}`);
console.log(`a bed the groove did not have: ${n((x) => x.newBed.length > 0)} (of those louder: ${n((x) => x.newBed.length > 0 && x.overDb > 0)})`);
for (const x of all.filter((x) => x.overDb > 1).sort((a, b) => b.overDb - a.overDb).slice(0, 12)) console.log(`  +${x.overDb} dB ${x.row.name} (${x.row.place}, ${Math.round(x.row.bpm)} BPM) bars ${x.from}-${x.to}${x.half ? ' half' : ''}${x.newBed.length ? ' new bed ' + x.newBed.join('/') : ''}`);
if (process.argv.includes('--featured')) for (const x of all.filter((x) => x.overDb > 0)) console.log(`  featured: ${x.row.name} bars ${x.from}-${x.to} ${x.overDb > 0 ? '+' : ''}${x.overDb} dB${x.newBed.length ? ' new bed ' + x.newBed.join('/') : ''}`);
if (arg('json')) fs.writeFileSync(arg('json')!, JSON.stringify(rows));
