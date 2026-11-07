// Lab tool (round hat-floor): the plan's read of the highs (`src/tops-read.ts`) against renders. For each rendered link
// (rows of `tools/hat-top-render.ts`: the kit's hats alone and the rest, per bar, each section's first 8 bars), the
// plan's read of the hats and of the rest over the same bars, K-weighted and above 3 kHz, beside the render's. Numbers
// only; not in any gate.
//
//   node tools/hat-floor-check.ts --rows <a.jsonl,b.jsonl> [--kinds main,drop] [--out <json>]
import fs from 'node:fs';
import { planOf, coordinateOf } from './like/features.ts';
import { isKitHat, TOP_LANES } from '../src/top-lanes.ts';
import { laneLevelDb } from '../src/lane-level.ts';
import { biasFor } from '../src/spell.ts';
import { topsOver, noteTops, duckLossDb, edgeBlend, TOPS_DRUMS_DB, type TopsReadEvent } from '../src/tops-read.ts';
import { hatHitDb } from '../src/set-plan.ts';
import { settingsOf } from '@deep-house/engine/settings';
import { VOICE_LEVEL, VOICE_BUS } from '@deep-house/engine/voices';

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const pw = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? 10 * Math.log10(v.reduce((a, x) => a + Math.pow(10, x / 10), 0) / v.length) : null; };

/** The plan's read of a stretch of bars: the kit's hats and the rest, K-weighted and above 3 kHz (`tops-read.ts`). */
export function planTops(track: any, birds: any, a: number, z: number, opts: { pick?: (e: any) => boolean } = {}) {
  const style = track.style, set = settingsOf(track) as any, bs = track.barSeconds;
  const floors = track.automation?.floors as Array<any> | undefined;
  const floorDb = (t: number, key: string | undefined) => { if (!floors || !key) return 0; let at: any = null; for (const f of floors) { if (f.t <= t) at = f; else break; } return at ? at[key] ?? 0 : 0; };
  const levelDb = (e: TopsReadEvent) => { const key = VOICE_LEVEL[e.voice]; return (laneLevelDb(style, set.levels, e.voice, key) ?? -12) + floorDb(e.t, key); };
  const hit = process.env.NO_HATREAD ? null : hatHitDb(track, style);
  const hitOf = hit ? (e: TopsReadEvent) => (isKitHat(e) ? hit(e as any) : null) : undefined;
  const base = { events: track.events as TopsReadEvent[], from: a * bs, to: z * bs, levelDb, birds, hitOf, drumsDb: process.env.DRUMS_DB != null ? Number(process.env.DRUMS_DB) : TOPS_DRUMS_DB, lines: process.env.NO_LINES ? null : track.automation, knobs: track.knobs, edgeOf: (e: TopsReadEvent) => edgeBlend(e, set), duck: process.env.NO_DUCK ? null : { loss: duckLossDb(set, track.beat), beat: track.beat } };
  const hats = topsOver({ ...base, pick: (e) => isKitHat(e) });
  const rest = topsOver({ ...base, pick: (e) => !isKitHat(e) && (!opts.pick || opts.pick(e)) });
  const drums = topsOver({ ...base, pick: (e) => !isKitHat(e) && VOICE_BUS[e.voice] === 'drums' && (!opts.pick || opts.pick(e)) });
  return { hats, rest, drums };
}

async function main() {
  // the renders are today's: the plans read as today's, the floor out (`--floor` keeps it)
  if (!process.argv.includes('--floor')) delete (TOP_LANES.level as any).floor;
  const files = arg('rows')!.split(',');
  const kinds = arg('kinds', 'main,drop')!.split(',');
  const rows = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const out: any[] = [];
  const missing: Record<string, number> = {};
  for (const r of rows) {
    if (r.error) continue;
    const c = coordinateOf(r.link);
    const { track } = planOf(c) as any;
    const birds = biasFor(c.spell, track.style).spell;
    for (const e of track.events) if (!noteTops(e, birds)) missing[e.voice] = (missing[e.voice] ?? 0) + 1;
    for (const s of r.sections) {
      if (!kinds.includes(s.kind)) continue;
      const a = s.startBar, z = s.startBar + Math.min(8, s.bars);
      const R = { hk: pw(r.hats.kw.slice(a, z)), hh: pw(r.hats.hi.slice(a, z)), rk: pw(r.rest.kw.slice(a, z)), rh: pw(r.rest.hi.slice(a, z)) };
      if (R.hh == null || R.rh == null || R.hk == null || R.rk == null || R.hk < -100) continue;
      const P = planTops(track, birds, a, z);
      if (!P.hats || !P.rest) continue;
      const t = r.trimDb ?? 0;
      const SC = (track.paramOverrides?.master ?? {}) as any;
      out.push({ name: r.name, link: r.link, kind: s.kind, at: a, trim: t, overDb: SC.sumClip?.overDb ?? null, drumDrive: SC.drumClip?.driveDb ?? null, drumsHi: P.drums ? +(P.drums.hi + t).toFixed(2) : null, drumsK: P.drums ? +(P.drums.k + t).toFixed(2) : null, spark: +birds.spark.toFixed(2), gleam: +birds.gleam.toFixed(2), zephyr: +birds.zephyr.toFixed(2),
        render: { hiOver: +(R.hh - R.rh).toFixed(2), kOver: +(R.hk - R.rk).toFixed(2), restTilt: +(R.rh - R.rk).toFixed(2), hatTilt: +(R.hh - R.hk).toFixed(2), rk: R.rk, rh: R.rh, hk: R.hk, hh: R.hh },
        plan: { hiOver: +(P.hats.hi - P.rest.hi).toFixed(2), kOver: +(P.hats.k - P.rest.k).toFixed(2), restTilt: +(P.rest.hi - P.rest.k).toFixed(2), hatTilt: +(P.hats.hi - P.hats.k).toFixed(2),
          rk: +(P.rest.k + t).toFixed(2), rh: +(P.rest.hi + t).toFixed(2), hk: +(P.hats.k + t).toFixed(2), hh: +(P.hats.hi + t).toFixed(2) } });
    }
  }
  const err = (f: (x: any) => number) => { const e = out.map(f).sort((a, b) => a - b); const abs = e.map(Math.abs).sort((a, b) => a - b);
    return { n: e.length, mean: +(e.reduce((a, x) => a + x, 0) / e.length).toFixed(2), medianAbs: +abs[Math.floor(abs.length / 2)].toFixed(2), p90Abs: +abs[Math.floor(abs.length * 0.9)].toFixed(2), rms: +Math.sqrt(e.reduce((a, x) => a + x * x, 0) / e.length).toFixed(2), worst: +abs[abs.length - 1].toFixed(2) }; };
  const summary = {
    hiOver: err((x) => x.plan.hiOver - x.render.hiOver), kOver: err((x) => x.plan.kOver - x.render.kOver),
    restHi: err((x) => x.plan.rh - x.render.rh), restK: err((x) => x.plan.rk - x.render.rk), hatsHi: err((x) => x.plan.hh - x.render.hh), hatsK: err((x) => x.plan.hk - x.render.hk),
  };
  console.log(JSON.stringify(summary));
  console.log('not tabled (events):', JSON.stringify(missing));
  if (process.argv.includes('--rows-out')) for (const x of out) console.log(`${x.name.padEnd(28)} ${x.kind.padEnd(5)} ${String(x.at).padStart(3)}  hiOver plan ${x.plan.hiOver.toFixed(1).padStart(6)} render ${x.render.hiOver.toFixed(1).padStart(6)}  restHi ${(x.plan.rh - x.render.rh).toFixed(1).padStart(6)}  hatsHi ${(x.plan.hh - x.render.hh).toFixed(1).padStart(6)}  restK ${(x.plan.rk - x.render.rk).toFixed(1).padStart(6)}`);
  if (arg('out')) fs.writeFileSync(arg('out')!, JSON.stringify({ summary, missing, rows: out }, null, 1));
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
