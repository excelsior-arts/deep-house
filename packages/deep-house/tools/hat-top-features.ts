// Lab tool (round hat-top): per section of a theme, what the plan knows that may say how bright the rest is above 3 kHz:
// the kit hats' read against the mix (the hat ceiling's own read, over the section's bars), the power of every other
// family of events as the plan holds them (the room's table, the floor, gain and velocity; a held note by its length),
// the macro filter over the section, the spark bus's edge, the birds. Numbers only, for fitting; not in any gate.
//
//   node tools/hat-top-features.ts --rows <break-hats jsonl> --out <json>     (or --links "name|link;...")
import fs from 'node:fs';
import path from 'node:path';
import { planOf, coordinateOf } from './like/features.ts';
import { hatsOverMix } from '../src/set-plan.ts';
import { isKitHat } from '../src/top-lanes.ts';
import { laneLevelDb } from '../src/lane-level.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { VOICE_LEVEL, VOICE_BUS } from '@deep-house/engine/voices';
import { HOUSE } from '../src/spell.ts';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };

export function familyOf(e: any): string {
  if (isKitHat(e)) return 'hat';
  if (String(e.by ?? '').startsWith('top-voices/')) return 'topv';
  if (e.layer === 'kick') return 'kick';
  if (e.layer === 'bass') return 'bass';
  if (e.layer === 'fx') return 'fx';
  if (e.layer === 'pad') return 'pad';
  if (e.layer === 'keys') return 'keys';
  if (e.layer === 'shaker' || e.layer === 'sixteenths') return 'shaker';
  if (e.layer === 'clap') return 'clap';
  if (VOICE_BUS[e.voice] === 'drums') return 'perc';
  return e.layer === 'lead' ? 'lead' : 'other';
}

export function sectionFeatures(track: any): any[] {
  const style = track.style;
  const set = settingsOf(track) as any;
  const floors = track.automation?.floors as Array<any> | undefined;
  const floorDb = (t: number, key: string | undefined) => { if (!floors || !key) return 0; let at: any = null; for (const f of floors) { if (f.t <= t) at = f; else break; } return at ? at[key] ?? 0 : 0; };
  const bs = track.barSeconds;
  const mf = (track.automation?.macroFilter ?? []) as Array<{ t: number; value: number }>;
  const hzAt = (t: number) => { if (!mf.length) return 20000; let i = 0; while (i + 1 < mf.length && mf[i + 1].t <= t) i++; const a = mf[i], b = mf[i + 1]; if (!b || t <= a.t) return a.value; const u = (t - a.t) / (b.t - a.t); return Math.exp(Math.log(a.value) + u * (Math.log(b.value) - Math.log(a.value))); };
  const edge = Number(track.paramOverrides?.harmonicEdge?.blend ?? 0);
  const spell = track.sound?.spell ?? track.spell ?? null;
  const out: any[] = [];
  for (const s of track.arrangement.sections) {
    const span = Math.min(8, s.bars), t0 = s.startBar * bs, t1 = (s.startBar + span) * bs, secs = t1 - t0;
    const bars = new Set<number>(); for (let b = s.startBar; b < s.startBar + span; b++) bars.add(b);
    const hatRead = hatsOverMix(track, style, bars);
    const fam: Record<string, number> = {}, cls: Record<string, number> = {};
    for (const e of track.events) {
      const dur = Number(e.p?.dur ?? 0);
      const a = Math.max(t0, e.t), z = Math.min(t1, e.t + Math.max(dur, 0.1));
      if (z <= a) continue;
      const key = VOICE_LEVEL[e.voice];
      const db = (laneLevelDb(style, set.levels, e.voice, key) ?? -12) + floorDb(e.t, key) + 20 * Math.log10(Math.max(1e-6, Number(e.p?.gain ?? 1) * Number(e.p?.vel ?? 1)));
      const f = familyOf(e);
      fam[f] = (fam[f] ?? 0) + Math.pow(10, db / 10) * (z - a) / secs;
      const c = `${f}:${e.layer === 'pad' ? e.p?.timbre ?? e.voice : e.voice}`;
      cls[c] = (cls[c] ?? 0) + Math.pow(10, db / 10) * (z - a) / secs;
    }
    let lg = 0, att = 0, n = 0;
    for (let t = t0; t < t1; t += 0.1) { const hz = Math.min(20000, hzAt(t)); lg += Math.log2(hz); att += Math.pow(10, Math.min(0, 40 * Math.log10(hz / 4000)) / 10); n++; }
    out.push({ kind: s.kind, startBar: s.startBar, bars: s.bars, hatRead: hatRead ?? null,
      fam: Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, +(10 * Math.log10(v)).toFixed(2)])),
      cls: Object.fromEntries(Object.entries(cls).map(([k, v]) => [k, +(10 * Math.log10(v)).toFixed(2)])),
      macroLog2: +(lg / n).toFixed(3), macroAttDb: +(10 * Math.log10(att / n)).toFixed(2) });
  }
  return [{ trimDb: track.trimDb, aimLufs: track.aimLufs ?? null, bpm: track.bpm, edge, spell, cut: track.topLanes?.hatCutDb ?? null }, out];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jobs: Array<{ name: string; link: string }> = [];
  if (arg('rows')) for (const line of fs.readFileSync(arg('rows')!, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); jobs.push({ name: r.name, link: r.link }); }
  if (arg('links')) for (const x of arg('links')!.split(/\s*;\s*/).filter(Boolean)) { const [n, l] = x.split('|'); jobs.push({ name: n, link: l }); }
  const rows = jobs.map((j) => { const c = coordinateOf(j.link); const { track } = planOf(c) as any; const [theme, sections] = sectionFeatures(track); return { ...j, ...theme, spell: { ...HOUSE, ...(c.spell ?? {}) }, sections }; });
  fs.writeFileSync(path.resolve(arg('out')!), JSON.stringify(rows, null, 1) + '\n');
  console.log(`wrote ${rows.length} rows`);
}
