// keys-balance (10-29): the calibration of `hat-scene.json`'s `keys` row, the plan's side. The rule reads the keys
// over the hats off the plan (each voice by its loudness per unit hit); these windows are rendered by
// tools/keys-balance-render.ts and fitted by `tools/keys-balance.py fit`.
//
//   node tools/keys-balance-calibrate.ts jobs <jobs.json>             the first main or drop's 8 bars where the keys play:
//                                                                      the featured and house seeds 1-24 (theme 1)
//   node tools/keys-balance-calibrate.ts plan <jobs.json> <out.json>  each window's strikes and hats as the program plays them
import fs from 'node:fs';
import { linkOf, playedAt } from './check-program-guards.ts';
import { FEATURED } from '../src/featured.ts';
import { programOf } from '../src/mix.ts';

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'jobs') {
  const out: any[] = [];
  const L: Array<{ name: string; link: string }> = [];
  for (const p of FEATURED) p.links.forEach((l, i) => L.push({ name: `${p.name}-${p.labels?.[i] ?? i}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), link: l }));
  for (let s = 1; s <= 24; s++) L.push({ name: `house-${s}`, link: linkOf(String(s), null, 0) });
  for (const x of L) {
    const t: any = playedAt(x.link);
    const sec = t.arrangement.sections.find((s: any) => (s.kind === 'main' || s.kind === 'drop')
      && t.events.some((e: any) => e.layer === 'keys' && e.bar >= s.startBar && e.bar < s.startBar + s.bars));
    if (!sec) continue;
    out.push({ name: x.name, link: x.link, fromBar: sec.startBar, toBar: Math.min(sec.startBar + 8, sec.startBar + sec.bars), stems: { keys: 'keys', hats: 'hats', rest: 'rest' } });
  }
  fs.writeFileSync(a, JSON.stringify(out));
  console.log(out.length, 'windows');
} else if (cmd === 'plan') {
  const jobs = JSON.parse(fs.readFileSync(a, 'utf8'));
  const out: any[] = [];
  for (const j of jobs) {
    const t: any = playedAt(j.link);
    const prog: any = programOf(t);
    const t0 = j.fromBar * t.barSeconds, t1 = j.toBar * t.barSeconds;
    const trim = 10 ** (((t.paramOverrides?.hats?.trimDb ?? 0) as number) / 10);
    const ev = prog.events.filter((e: any) => e.t >= t0 && e.t < t1);
    const strikes = new Map<string, any[]>();
    for (const e of ev) if (e.layer === 'keys') { const k = `${e.bar}|${e.step}`; strikes.set(k, [...(strikes.get(k) ?? []), e]); }
    const rows = [...strikes.values()].map((g) => {
      const keys: Record<string, number> = {};
      for (const e of g) keys[e.voice] = (keys[e.voice] ?? 0) + ((e.p.gain ?? 1) * (e.p.vel ?? 1)) ** 2;
      return { t: Math.min(...g.map((e: any) => e.t)) - t0, keys, tones: g.length };
    });
    // the hats over the window, per voice: energy per 0.4 s, the family trim in
    const hatsWin: Record<string, number> = {};
    for (const e of ev) if (e.layer === 'hats' || e.layer === 'shaker') hatsWin[e.voice] = (hatsWin[e.voice] ?? 0) + trim * ((e.p.gain ?? 1) * (e.p.vel ?? 1)) ** 2 * 0.4 / (t1 - t0);
    out.push({ name: j.name, rows, hatsWin });
  }
  fs.writeFileSync(b, JSON.stringify(out));
  console.log(out.length, 'windows');
}
