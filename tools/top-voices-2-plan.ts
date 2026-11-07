// top-voices-2 (11-02), scratch: what the top's quiet voices lay on a featured track (or a link), with an arc table: the
// 8-bar blocks from each section's start against the quiet voices that play in them, the voices' hits a bar, and the
// top form's moves. No audio.
//
//   node tools/top-voices-2-plan.ts "Vibe - Pure Gold" [more names...]        (or a link: "seed=40&v=2")
//   node tools/top-voices-2-plan.ts --house 90      (how often each voice lands over the house's themes: seeds 1-30, themes 1-3, the house's birds)
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { FEATURED } from '../packages/deep-house/src/featured.ts';

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const args = process.argv.slice(2);
const links: Array<[string, string]> = [];
for (const p of FEATURED as any[]) p.links.forEach((l: string, i: number) => links.push([`${p.name} - ${p.labels[i]}`, l]));

if (args[0] === '--house') {
  // the house's own birds, seeds 1..n, theme 1 (the gap's "house" links are seeds at the house)
  const n = +(args[1] ?? 90);
  const count: Record<string, number> = {}, rows: Record<string, number> = {}, modes: Record<string, number> = {};
  let themes = 0, withSet = 0, sizes: number[] = [], heard: number[] = [], bars = 0;
  const hits: Record<string, number> = {};
  for (let k = 0; k < n; k++) {
    const s = 1 + Math.floor(k / 3), th = 1 + (k % 3);
    const { plan } = quiet(() => played(`seed=${s}&v=2&theme=${th}`)) as any;
    themes++;
    const tv = plan.topVoices;
    if (!tv) continue;
    withSet++;
    sizes.push(tv.set.length);
    for (const k of tv.set) count[k] = (count[k] ?? 0) + 1;
    const ev = plan.events.filter((e: any) => typeof e.by === 'string' && e.by.startsWith('top-voices/'));
    heard.push(new Set(ev.map((e: any) => e.by.slice(11))).size);
    bars += plan.bars;
    for (const e of ev) hits[e.by.slice(11)] = (hits[e.by.slice(11)] ?? 0) + 1;
    for (const x of tv.spans) { rows[x.voice] = (rows[x.voice] ?? 0) + 1; if (x.mode) modes[`${x.key}:${x.mode}`] = (modes[`${x.key}:${x.mode}`] ?? 0) + 1; }
  }
  console.log(JSON.stringify({ themes, withSet, meanSize: +(sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length)).toFixed(2), meanHeard: +(heard.reduce((a, b) => a + b, 0) / Math.max(1, heard.length)).toFixed(2), set: count, spansByRow: rows, modes, hitsPer100Bars: Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, +(100 * v / Math.max(1, bars)).toFixed(1)])) }, null, 1));
  process.exit(0);
}

for (const want of args) {
  const hit = links.find(([n]) => n === want) ?? links.find(([n]) => n.includes(want)) ?? [want, want];
  const [name, link] = hit;
  const { plan } = quiet(() => played(link)) as any;
  const secs = plan.arrangement.sections as Array<{ kind: string; startBar: number; bars: number; topOpens?: number }>;
  const bs = plan.barSeconds;
  console.log(`${name}  ${link}\n  ${Math.round(60 / (bs / 4) * 10) / 10} BPM, ${plan.bars} bars  ${secs.map((s) => `${s.kind}@${s.startBar}+${s.bars}`).join(' ')}`);
  console.log(`  top form: ${plan.topForm?.summary ?? '(none)'}`);
  console.log(`  voices: ${plan.topVoices?.summary ?? '(none)'}`);
  const tv = plan.topVoices;
  const ev = plan.events.filter((e: any) => typeof e.by === 'string' && e.by.startsWith('top-voices/'));
  console.log('   bars      section     quiet voices playing (hits a bar)');
  for (const s of secs) for (let a = s.startBar; a < s.startBar + s.bars; a += 8) {
    const z = Math.min(a + 8, s.startBar + s.bars);
    const on = (tv?.spans ?? []).filter((x: any) => x.from < z && x.to > a);
    const words = [...new Set(on.map((x: any) => x.key))].map((k: any) => {
      const n = ev.filter((e: any) => e.by === `top-voices/${k}` && e.bar >= a && e.bar < z).length;
      const sp = on.filter((x: any) => x.key === k).map((x: any) => `${Math.max(a, x.from)}-${Math.min(z, x.to)}`).join(',');
      const m = on.find((x: any) => x.key === k && x.mode)?.mode;
      return `${k} ${sp} (${(n / (z - a)).toFixed(1)}${m ? `, ${m}` : ''})`;
    });
    console.log(`  ${String(a).padStart(3)}-${String(z - 1).padEnd(4)} ${s.kind.padEnd(10)}  ${words.join('; ') || '.'}`);
  }
  console.log(`  ${ev.length} quiet-voice events; by voice: ${JSON.stringify(ev.reduce((o: any, e: any) => ((o[e.voice] = (o[e.voice] ?? 0) + 1), o), {}))}\n`);
}
