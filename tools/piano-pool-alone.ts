// piano-pool round 2 (11-01), scratch.  node tools/piano-pool-alone.ts [featured]
// how often a house theme's piano rings alone over a held bed: the median gap between its strikes (within a passage of
// 4 bars) and the share of those gaps a pad note holds across; and which grand it plays
const W = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { played } = await import(`${W}/packages/deep-house/tools/link-digest.ts`);
const { programOf } = await import(`${W}/packages/deep-house/src/performance.ts`);
const { FEATURED } = await import(`${W}/packages/deep-house/src/featured.ts`);
const { BY_NAME } = await import(`${W}/packages/engine/src/voices/index.ts`);
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const G = ['piano', 'pianoClose', 'pianoUpright', 'pianoMute', 'pianoFelt', 'pianoConcert'];
const sig = (s: any) => JSON.stringify([s?.felt, s?.body?.[0], s?.reach, s?.stiffness]);
const BY_SIG = new Map(G.map((g) => [sig((BY_NAME as any)[g].row.parameters.string), g]));
const links: string[] = [];
if (process.argv[2] === 'featured') for (const p of FEATURED as any[]) links.push(...p.links);
else for (let s = 1; s <= 40; s++) for (let t = 0; t < 3; t++) links.push(`seed=${s}&v=2&theme=${t}`);
let n = 0, pool = 0; const hits: string[] = [];
for (const link of links) {
  const { plan } = quiet(() => played(link)) as any;
  const pr: any = programOf(plan);
  const ev = pr.events.filter((e: any) => e.voice === 'piano').sort((a: any, b: any) => a.t - b.t);
  if (!ev.length || !pr.events.some((e: any) => e.layer === 'kick')) continue;
  pool++;
  const bs = pr.barSeconds;
  const s: any[] = []; for (const e of ev) { const l = s[s.length - 1]; if (l && e.t - l.t < 0.12) continue; s.push(e); }
  const gaps: Array<[number, number]> = []; for (let k = 1; k < s.length; k++) { const g = s[k].t - s[k - 1].t; if (g <= 4 * bs) gaps.push([s[k - 1].t, g]); }
  const pads = pr.events.filter((e: any) => e.layer === 'pad');
  const bed = gaps.filter(([t, g]) => pads.some((p: any) => p.t <= t + 0.05 && p.t + p.p.dur >= t + g - 0.05)).length / Math.max(1, gaps.length);
  const gap = med(gaps.map((x) => x[1]));
  const drew = BY_SIG.get(sig(pr.settings.piano.string)) ?? '?';
  const line = `${link.padEnd(70)} gap ${gap.toFixed(2)} s (${(gap / bs).toFixed(2)} bars) bed ${(bed * 100).toFixed(0)}% plays ${drew}`;
  if (gap >= 3 || process.argv[2] === 'featured') hits.push(line);
}
console.log(hits.join('\n'));
console.log(`${pool} pool themes of ${links.length}`);
