// **The stab lane's fixed punch** (round stab-punch, 11-04; his ear on house seed 148 at t=21: "that same stub technic but
// with pulse lead, which is similar annoying move as it was with organs"): a lab tool, in no gate.
//
// Plans every theme of a set in node and finds where the stab lane (the mined stab mask's chords, `stabLane` in
// generator.ts) plays a fixed punch: a stretch of 8 bars or more where every bar that sounds strikes one or two chords,
// one position among them struck in three bars of four or more (the anchor). The strict reading (the very same positions
// in every bar) is counted beside it. Per theme: the longest such stretch, its seconds, the sections it crosses, the
// voice, the scene, the texture, the density, the place, and what else sounds there (the pad's bed, another front).
//
//   node tools/stab-punch.ts [--set featured,house,grid] [--house 1-200 [--spell em:0.3,sp:0.1]] [--grid 1-4] [--sketch <a|b|c|d|today>] [--out <json>]
//
// `--sketch` plans as a sketch build does (`globalThis.__stabPunchLab`, src/stab-punch.ts), for what each one moves;
// `--sketch today` plays the lane as it was before the rule (pass 2: without it, the house's rule plays).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
if (arg('sketch')) (globalThis as any).__STAB_PUNCH__ = arg('sketch');
const { planOf, coordinateOf } = await import('./like/features.ts');
const { SKY_DOTS, SKY_PLACES, genreOf } = await import('../src/sky.ts');
const { linkWrite } = await import('../src/link.ts');

type Job = { set: string; name: string; link: string };

export function jobsOf(sets: string[]): Job[] {
  const out: Job[] = [];
  if (sets.includes('featured')) {
    const F = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'featured.json'), 'utf8')) as { playlists: { name: string; links: string[]; labels: string[] }[] };
    for (const p of F.playlists) p.links.forEach((l, i) => out.push({ set: 'featured', name: `${p.name} - ${p.labels[i]}`, link: l }));
  }
  if (sets.includes('house')) {
    const [a, b] = arg('house', '1-200')!.split('-').map(Number);
    const sp = arg('spell');
    for (let s = a; s <= b; s++) out.push({ set: 'house', name: `house seed ${s}`, link: `seed=${s}&v=2${sp ? `&spell=${sp}` : ''}` });
  }
  if (sets.includes('grid')) {
    const [a, b] = arg('grid', '1-4')!.split('-').map(Number);
    for (const star of SKY_PLACES.filter((p) => p.lit)) {
      const spells = [{ n: 'star', spell: star.spell }, ...SKY_DOTS.filter((d) => d.star === star.id).map((d) => ({ n: `dot ${d.n}`, spell: d.spell }))];
      for (const s of spells) for (let k = a; k <= b; k++) out.push({ set: 'grid', name: `${star.name} ${s.n} seed ${k}`, link: linkWrite({ seed: String(k), theme: 0, strategy: 'house-v2', spell: s.spell } as never) });
    }
  }
  return out;
}

/** The stab lane's chords, bar by bar: the steps it strikes short (two notes or more at one step: a chord, never a motif's note). */
export function stabBars(track: any): Map<number, number[]> {
  const stab = new Set([track.dice?.stabTimbre, track.dice?.keysPreset].filter(Boolean));
  const at = new Map<string, number>();
  const beat = track.barSeconds / 4;
  for (const e of track.events) {
    if (e.layer !== 'keys' || e.role || e.part) continue;
    if (!stab.has(e.p?.preset) && !stab.has(e.voice)) continue;
    // a punch is struck short (the mask's one, two or four sixteenths, a beat at most); a chord held a bar or more (the
    // piano's comping, the hook's held chord) is a chord change, not a punch
    if ((e.p?.dur ?? 0) > 1.05 * beat) continue;
    const k = `${e.bar}|${e.step}`;
    at.set(k, (at.get(k) ?? 0) + 1);
  }
  const bars = new Map<number, number[]>();
  for (const [k, n] of at) { if (n < 2) continue; const [b, s] = k.split('|').map(Number); (bars.get(b) ?? bars.set(b, []).get(b)!).push(s); }
  for (const v of bars.values()) v.sort((x, y) => x - y);
  return bars;
}

export interface Punch { from: number; to: number; anchor: number; steps: number[]; strict: boolean; sounding: number; perBar: number }

/**
 * The longest fixed punch: within a stretch where every sounding bar strikes one or two chords (one silent bar between
 * two sounding ones tolerated), the longest window of 8 bars or more over which one step is struck in at least 3/4 of
 * the sounding bars.
 */
export function punchOf(bars: Map<number, number[]>, least = 8, share = 0.75): Punch | null {
  const sounding = [...bars.keys()].sort((a, b) => a - b);
  const segs: number[][] = [];
  let cur: number[] = [];
  for (const b of sounding) {
    const ok = bars.get(b)!.length <= 2;
    if (!ok) { if (cur.length) segs.push(cur); cur = []; continue; }
    if (cur.length && b - cur[cur.length - 1] > 2) { segs.push(cur); cur = []; }
    cur.push(b);
  }
  if (cur.length) segs.push(cur);
  let best: Punch | null = null;
  for (const seg of segs) {
    const steps = [...new Set(seg.flatMap((b) => bars.get(b)!))];
    for (const x of steps) {
      for (let i = 0; i < seg.length; i++) {
        if (!bars.get(seg[i])!.includes(x)) continue;
        let hits = 0;
        for (let j = i; j < seg.length; j++) {
          if (bars.get(seg[j])!.includes(x)) hits++;
          const span = seg[j] - seg[i] + 1, n = j - i + 1;
          if (span < least || hits / n < share || !bars.get(seg[j])!.includes(x)) continue;
          if (!best || span > best.to - best.from) {
            const inside = seg.slice(i, j + 1);
            const all = [...new Set(inside.flatMap((b) => bars.get(b)!))].sort((a, b) => a - b);
            const strict = inside.every((b) => bars.get(b)!.join() === bars.get(inside[0])!.join());
            best = { from: seg[i], to: seg[j] + 1, anchor: x, steps: all, strict, sounding: n, perBar: +(inside.reduce((a, b) => a + bars.get(b)!.length, 0) / n).toFixed(2) };
          }
        }
      }
    }
  }
  return best;
}

/** What else sounds over bars [from, to): the pad's bed (share of bars a pad note sounds in), another front on the keys. */
export function around(track: any, from: number, to: number) {
  const bs = track.barSeconds, t0 = from * bs, t1 = to * bs;
  const padBars = new Set<number>(), otherFront = new Set<string>();
  for (const e of track.events) {
    const end = e.t + (e.p?.dur ?? 0);
    if (end <= t0 || e.t >= t1) continue;
    if (e.layer === 'pad') for (let b = Math.max(from, Math.floor(e.t / bs)); b < Math.min(to, Math.ceil(end / bs)); b++) padBars.add(b);
    if (e.layer === 'keys' && (e.role || e.part)) otherFront.add(`${e.voice}${e.part ? `/${e.part}` : ''}${e.role ? `:${e.role}` : ''}`);
  }
  const kinds = [...new Set(track.arrangement.sections.filter((s: any) => s.startBar < to && s.startBar + s.bars > from).map((s: any) => s.kind))];
  return { padShare: +(padBars.size / (to - from)).toFixed(2), otherFront: [...otherFront], kinds };
}

function main() {
  const sets = arg('set', 'featured,house,grid')!.split(',');
  const rows: any[] = [];
  for (const j of jobsOf(sets)) {
    try {
      const c = coordinateOf(j.link);
      const { track } = planOf(c);
      const d: any = track.dice ?? {};
      const bars = stabBars(track);
      const p = punchOf(bars);
      const place = genreOf(`?${j.link}`).name;
      const base = { ...j, place, bpm: track.bpm, scene: d.scene ?? null, texture: d.texture ?? null, density: d.density ?? null, voice: d.stabTimbre ?? null,
        lead: d.leadTimbre ?? null, pad: d.padTimbre ?? null, mask: d.stabMask ?? null, stabBars: bars.size, bars: track.bars,
        // (pass 2) what the way out made of the lane: the bars it breathed in, the bars it spoke a phrase in, and the level's read
        ways: (() => { const w: Record<string, Set<number>> = {}; for (const e of track.events as any[]) if (e.punch) (w[e.punch] ??= new Set()).add(e.bar); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.size])); })(),
        punchRead: (track as any).punchRead ?? null, spell: c.spell ?? null };
      rows.push(p ? { ...base, punch: { ...p, seconds: +((p.to - p.from) * track.barSeconds).toFixed(1), t: Math.round(p.from * track.barSeconds), ...around(track, p.from, p.to) } } : { ...base, punch: null });
    } catch (e) {
      rows.push({ ...j, error: String((e as Error).message || e).slice(0, 300) });
    }
  }
  const out = arg('out');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), JSON.stringify({ note: 'tools/stab-punch.ts: the stab lane\'s fixed punch (round stab-punch)', sketch: arg('sketch'), rows }, null, 1) + '\n'); }
  const by = (set: string) => rows.filter((r) => r.set === set);
  for (const set of sets) {
    const R = by(set), P = R.filter((r) => r.punch);
    console.log(`${set}: ${P.length} of ${R.length} themes with a fixed punch (strict ${P.filter((r) => r.punch.strict).length}); stab lane plays in ${R.filter((r) => r.stabBars).length}; errors ${R.filter((r) => r.error).length}`);
  }
  if (out) console.log(`wrote ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
