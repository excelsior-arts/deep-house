// mains.ts — the house's mains as they are planned (round M1, the mains pass):
// over seeds × themes at a key (the house by default), every section of a kind
// in bars and seconds, the sub-sections drawn inside it, and a "variation
// events per 16 bars" count read off the plan's events the way
// `packages/mining/tools/readings.py` reads a cut off its audio — bar by bar
// against the same bar of the last four two-bar cycles (b−2, b−4, b−6, b−8),
// a change counted where it happens and not while it lasts — so the house's
// number stands beside the reference cuts' (the mains pass's readings in the catalog).
//
//   node tools/mains.ts                      seeds 1–40 × 3 themes at the house
//   node tools/mains.ts --seeds 1-10 --themes 2 --spell em:0.9,… --json out.json
//
// The kinds, as readings.py names them: drop-out (no drum hits where the
// cycles had some), kick out, snare fill, snare added / moved, double kick,
// kick added / dropped / moved, hats thinned / doubled; and the bands' (the
// `bandThings` of the reading): bass out (the bassline silent where it played,
// the kick on), mids up / down (the keys or the pad in or out), top up / down
// (the open hat, a ride, the sixteenths in or out). The FX: a glue voice's
// stroke, swell, sweep or riser on the bar. A plan is not a band: an event is
// a hit, so where the audio's lanes blur two hits the plan does not.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { planTheme, recipesFor } from '../src/mix.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [s0, s1] = arg('--seeds', '1-40').split('-').map(Number);
const THEMES = Number(arg('--themes', '3'));
const SPELL = arg('--spell', '');
const JSON_OUT = arg('--json', '');
const SKIP = 8;
const quiet = <T,>(f: () => T): T => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };

const DRUM = { kick: 'kick', snare: 'clap', hats: 'hats', sixteenth: 'shaker' } as const;
const FX_VOICES = new Set(['impact', 'swell', 'sweepDown', 'riser', 'crash', 'sweepUp', 'reverse']);

type Ev = { voice: string; layer?: string; bar?: number; step?: number; p: { vel?: number } };
interface BarRead { kick: number[]; snare: number[]; hats: number[]; drums: number; bass: number; mids: number; top: number; fx: number }

function readBars(events: Ev[], bars: number): BarRead[] {
  const out: BarRead[] = Array.from({ length: bars }, () => ({ kick: Array(16).fill(0), snare: Array(16).fill(0), hats: Array(16).fill(0), drums: 0, bass: 0, mids: 0, top: 0, fx: 0 }));
  for (const e of events) {
    if (e.bar == null || e.bar < 0 || e.bar >= bars) continue;
    const b = out[e.bar];
    const s = Math.max(0, Math.min(15, e.step ?? 0));
    if (FX_VOICES.has(e.voice) || e.layer === 'fx') { b.fx++; continue; }
    if (e.layer === DRUM.kick) { b.kick[s] = 1; b.drums++; }
    else if (e.layer === DRUM.snare) { b.snare[s] = 1; b.drums++; }
    else if (e.layer === DRUM.hats || e.layer === DRUM.sixteenth) { b.hats[s] = 1; b.drums++; if (e.voice !== 'hatClosed') b.top++; }
    else if (e.layer === 'bass') b.bass++;
    else if (e.layer === 'keys' || e.layer === 'pad' || e.layer === 'string') b.mids++;
  }
  return out;
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
/** a ref step is a hit where half the cycles or more had one (readings.py's median over 0/1 against 0.35) */
const refMask = (rows: number[][]) => Array.from({ length: 16 }, (_, i) => (sum(rows.map((r) => r[i])) * 2 >= rows.length ? 1 : 0));
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The kinds that changed on bar b, as readings.py's `small_things` and `band_things` name them. */
function changes(B: BarRead[], b: number): { beat: string[]; band: string[]; fx: boolean } {
  const refs = [2, 4, 6, 8].map((k) => b - k).filter((x) => x >= 0);
  const fx = B[b].fx > 0 && median(refs.map((r) => B[r].fx)) === 0;
  if (refs.length < 2) return { beat: [], band: [], fx };
  const R = (k: 'kick' | 'snare' | 'hats') => refMask(refs.map((r) => B[r][k]));
  const beat: string[] = [], band: string[] = [];
  const cur = B[b];
  const rd = median(refs.map((r) => B[r].drums));
  if (cur.drums === 0 && rd > 0) { beat.push('drop-out'); return { beat, band, fx }; }
  const rk = R('kick'), rs = R('snare'), rh = R('hats');
  const dk = cur.kick.map((v, i) => v - rk[i]), ds = cur.snare.map((v, i) => v - rs[i]);
  if (sum(cur.kick) <= 1 && sum(rk) >= 2) beat.push('kick out');
  const roll = sum(cur.snare.slice(12)) - sum(rs.slice(12));
  if (roll >= 2 || sum(cur.snare) - sum(rs) >= 4) beat.push('snare fill');
  else if (sum(ds.map(Math.abs)) >= 3) beat.push(sum(ds) >= 2 ? 'snare added' : 'snare moved');
  if (!beat.includes('kick out') && sum(dk.map(Math.abs)) >= 3) {
    const pairs = (v: number[]) => v.slice(0, -1).filter((x, i) => x && v[i + 1]).length;
    beat.push(pairs(cur.kick) > pairs(rk) ? 'double kick' : sum(dk) >= 2 ? 'kick added' : sum(dk) <= -2 ? 'kick dropped' : 'kick moved');
  }
  const dh = sum(cur.hats) - sum(rh);
  if (dh <= -4) beat.push('hats thinned'); else if (dh >= 4) beat.push('hats doubled');
  if (cur.bass === 0 && median(refs.map((r) => B[r].bass)) > 0 && sum(cur.kick) >= 2) band.push('bass out');
  const rm = median(refs.map((r) => B[r].mids));
  if (cur.mids > 0 && rm === 0) band.push('mids up'); else if (cur.mids === 0 && rm > 0) band.push('mids down');
  const rt = median(refs.map((r) => B[r].top));
  if (cur.top >= rt + 2) band.push('top up'); else if (cur.top + 2 <= rt) band.push('top down');
  return { beat, band, fx };
}

export interface SectionRead { seed: string; theme: number; bpm: number; kind: string; startBar: number; bars: number; seconds: number;
  subs: string[]; beatBars: number; bandBars: number; anyBars: number; fxBars: number; kinds: Record<string, number> }

export function readMains(seeds: string[], themes: number, spell: string): SectionRead[] {
  const out: SectionRead[] = [];
  const search = spell ? `?spell=${spell}&v=2` : '?v=2';
  for (const seed of seeds) for (let n = 0; n < themes; n++) {
    const cast = quiet(() => recipesFor({ masterSeed: seed, strategy: 'house-v2', search }));
    const t: any = quiet(() => planTheme(seed, n, { strategy: 'house-v2', spell: cast.spell, recipe: cast.track }));
    const B = readBars(t.events, t.bars);
    const C = B.map((_, b) => changes(B, b));
    for (const s of t.arrangement.sections) {
      const kinds: Record<string, number> = {};
      let beatBars = 0, bandBars = 0, anyBars = 0, fxBars = 0;
      // A section's own bars, its first eight left out: the cycles a bar is read
      // against reach eight bars back, and before that they are the section
      // before — the line is the form's, not the main's (readings.py's mains
      // are read the same way, the mains pass's readings in the catalog).
      for (let b = s.startBar + SKIP; b < s.startBar + s.bars; b++) {
        const c = C[b];
        if (c.beat.length) beatBars++;
        if (c.band.length) bandBars++;
        if (c.beat.length || c.band.length) anyBars++;
        if (c.fx) fxBars++;
        for (const k of [...c.beat, ...c.band]) kinds[k] = (kinds[k] ?? 0) + 1;
      }
      const subs = [...new Set(t.timeline.filter((r: any) => r.sectionIndex === s.index && r.sub).map((r: any) => r.sub))] as string[];
      out.push({ seed, theme: n + 1, bpm: t.bpm, kind: s.kind, startBar: s.startBar, bars: s.bars, seconds: s.bars * t.barSeconds,
        subs, beatBars, bandBars, anyBars, fxBars, kinds });
    }
  }
  return out;
}

const pct = (v: number[], q: number) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(HERE, 'mains.ts')) {
  const seeds = Array.from({ length: s1 - s0 + 1 }, (_, i) => String(s0 + i));
  const rows = readMains(seeds, THEMES, SPELL);
  const kinds = [...new Set(rows.map((r) => r.kind))];
  console.log(`${seeds.length} seeds × ${THEMES} themes at ${SPELL || 'the house'}: BPM p10–median–p90 ${pct(rows.map((r) => r.bpm), 0.1)}–${pct(rows.map((r) => r.bpm), 0.5)}–${pct(rows.map((r) => r.bpm), 0.9)}`);
  console.log('kind        n   bars p10–med–p90    seconds p10–med–p90   >45 s  beat/16  band/16  any/16  fx/16  with a sub');
  for (const k of kinds) {
    const r = rows.filter((x) => x.kind === k);
    const bars = r.reduce((a, x) => a + Math.max(0, x.bars - SKIP), 0);
    const per = (f: (x: SectionRead) => number) => (bars ? (16 * r.reduce((a, x) => a + f(x), 0)) / bars : NaN);
    console.log(`${k.padEnd(10)} ${String(r.length).padStart(3)}   ${[0.1, 0.5, 0.9].map((q) => pct(r.map((x) => x.bars), q)).join('–').padEnd(16)}  ${[0.1, 0.5, 0.9].map((q) => f1(pct(r.map((x) => x.seconds), q))).join('–').padEnd(20)}  ${String(r.filter((x) => x.seconds > 45).length).padStart(5)}  ${f1(per((x) => x.beatBars)).padStart(7)}  ${f1(per((x) => x.bandBars)).padStart(7)}  ${f1(per((x) => x.anyBars)).padStart(6)}  ${f1(per((x) => x.fxBars)).padStart(5)}  ${r.filter((x) => x.subs.length).length}`);
  }
  const mains = rows.filter((r) => r.kind === 'main');
  const kc: Record<string, number> = {};
  for (const r of mains) for (const [k, v] of Object.entries(r.kinds)) kc[k] = (kc[k] ?? 0) + v;
  const mb = mains.reduce((a, x) => a + Math.max(0, x.bars - SKIP), 0);
  console.log('mains, kinds per 16 bars:', Object.entries(kc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f1((16 * v) / mb)}`).join(', '));
  const sc: Record<string, number> = {};
  for (const r of mains) for (const s of r.subs) sc[s] = (sc[s] ?? 0) + 1;
  console.log('mains, sub-sections named (sections carrying each):', Object.entries(sc).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
}
