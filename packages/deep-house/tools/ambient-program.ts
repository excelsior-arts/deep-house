// The ambient plan read back off a compiled program (liquid-ambient, `src/ambient-plan.ts`): the bed's notes as they
// finally sound, after the bed's octave rule, the stage, the swells and every other pass; their level envelopes; the
// same-pitch chains, the plateaus, the retreats, the register and the overlap; the salient moments and their gaps.
// `check-ambient.ts` holds them to the research manual's §9 conditions, and a report reads the same numbers.
import { BY_NAME, VOICE_COST_UNITS } from '@deep-house/engine/voices';
import { costOf as effectsCost } from '@deep-house/engine/effects';
import { bedRowOf, chapterRowOf, bedMoments, type BedNote } from '../src/ambient-plan.ts';

export interface SoundingNote { t: number; midi: number; dur: number; attack: number; decay: number; sustain: number; release: number; swellDb: number; swellOver: number; gain: number; bar: number }

const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;

/** The bed's events in a program: the pad layer's notes on the bed's own voice, none a keys note or a texture. */
export function bedNotes(t: any, prog: any): SoundingNote[] {
  const voice = t.ambient?.drawn.voice;
  const P = (BY_NAME[voice]?.row?.parameters ?? {}) as Record<string, number>;
  return prog.events.filter((e: any) => e.layer === 'pad' && e.voice === voice && !e.role && typeof e.p.midi === 'number').map((e: any): SoundingNote => ({
    t: e.t, midi: e.p.midi, dur: Number(e.p.dur), attack: Number(e.p.attack ?? P.attack ?? 0.5), decay: Number(P.decay ?? 1), sustain: Number(P.sustain ?? 0.8),
    release: Number(e.p.release ?? P.release ?? 1), swellDb: Number(e.p.swell?.db ?? 0), swellOver: Number(e.p.swell?.over ?? 0), gain: Number(e.p.gain ?? 1) * Number(e.p.vel ?? 1), bar: e.bar,
  })).sort((a: SoundingNote, b: SoundingNote) => a.t - b.t);
}

/** A note's level (linear gain) `x` seconds after its start: the voice's ADSR (linear attack, exponential decay and release) under its entrance swell. */
export function levelAt(n: SoundingNote, x: number): number {
  if (x < 0) return 0;
  const a = Math.max(0.003, n.attack), d = Math.max(0.005, n.decay), h = Math.max(0, n.dur - a - d), r = Math.max(0.004, n.release);
  const floor = 0.0002, s = Math.max(floor, n.sustain);
  let g: number;
  if (x < a) g = x / a;
  else if (x < a + d) g = Math.exp(Math.log(s) * (x - a) / d);
  else if (x < a + d + h) g = s;
  else if (x < a + d + h + r) g = s * Math.exp(Math.log(floor / s) * (x - a - d - h) / r);
  else return 0;
  const sw = n.swellOver > 0 && x < n.swellOver ? 10 ** ((n.swellDb * (1 - x / n.swellOver)) / 20) : 1;
  return g * sw * n.gain;
}
export const endOf = (n: SoundingNote) => n.t + Math.max(n.dur, Math.max(0.003, n.attack) + Math.max(0.005, n.decay)) + n.release;

/** The longest stretch, in seconds, where a set of notes' summed power stays within `db` decibels while it sounds (over -40 dB of its own peak). */
export function longestPlateau(notes: readonly SoundingNote[], db: number, dt = 0.02): number {
  if (!notes.length) return 0;
  const t0 = notes[0].t, t1 = Math.max(...notes.map(endOf));
  const lv: number[] = [];
  for (let x = t0; x <= t1; x += dt) { let p = 0; for (const n of notes) { const g = levelAt(n, x - n.t); p += g * g; } lv.push(p > 0 ? 10 * Math.log10(p) : -200); }
  const peak = Math.max(...lv);
  // a sliding window whose span of levels stays within `db`, reset where the notes fall silent
  let best = 0, i = 0;
  const hiQ: number[] = [], loQ: number[] = [];
  for (let j = 0; j < lv.length; j++) {
    if (lv[j] < peak - 40) { hiQ.length = 0; loQ.length = 0; i = j + 1; continue; }
    while (hiQ.length && lv[hiQ[hiQ.length - 1]] <= lv[j]) hiQ.pop();
    while (loQ.length && lv[loQ[loQ.length - 1]] >= lv[j]) loQ.pop();
    hiQ.push(j); loQ.push(j);
    while (lv[hiQ[0]] - lv[loQ[0]] > db) { i++; while (hiQ[0] < i) hiQ.shift(); while (loQ[0] < i) loQ.shift(); }
    best = Math.max(best, (j - i) * dt);
  }
  return best;
}

/** Each pitch's chains: occurrences overlapping or within `mergeS` of the one before (a release counted), merged; a retrigger does not reset one. */
export function samePitchChains(notes: readonly SoundingNote[], mergeS: number): Array<{ midi: number; from: number; to: number; notes: SoundingNote[] }> {
  const out: Array<{ midi: number; from: number; to: number; notes: SoundingNote[] }> = [];
  for (const m of [...new Set(notes.map((n) => n.midi))]) {
    let cur: (typeof out)[number] | null = null;
    for (const n of notes.filter((x) => x.midi === m)) {
      if (cur && n.t <= cur.to + mergeS) { cur.to = Math.max(cur.to, endOf(n)); cur.notes.push(n); }
      else { if (cur) out.push(cur); cur = { midi: m, from: n.t, to: endOf(n), notes: [n] }; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** In every block of `blockBars` holding bed, the longest run with nothing sounding (a release counted), in bars. */
export function retreatsByBlock(notes: readonly SoundingNote[], bars: number, bs: number, blockBars: number): Array<{ from: number; longest: number }> {
  const out: Array<{ from: number; longest: number }> = [];
  for (let b0 = 0; b0 < bars; b0 += blockBars) {
    const a = b0 * bs, z = Math.min(bars, b0 + blockBars) * bs;
    const iv = notes.filter((n) => n.t < z && endOf(n) > a).map((n) => [Math.max(a, n.t), Math.min(z, endOf(n))]).sort((x, y) => x[0] - y[0]);
    if (!iv.length) continue;
    let at = a, longest = 0;
    for (const [x, y] of iv) { longest = Math.max(longest, x - at); at = Math.max(at, y); }
    longest = Math.max(longest, z - at);
    out.push({ from: b0, longest: longest / bs });
  }
  return out;
}

/** The most bed notes sounding at once, a release counted. */
export function mostAtOnce(notes: readonly SoundingNote[]): number {
  const ev = notes.flatMap((n) => [[n.t, 1], [endOf(n), -1]] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let k = 0, most = 0;
  for (const [, d] of ev) { k += d; most = Math.max(most, k); }
  return most;
}

/** The chord's tones in force at a moment, by the keys' states. */
export function tonesAt(t: any, bar: number): number[] {
  let c = 0;
  for (const s of t.keys.states) { if (s.bar > bar) break; c = s.chord; }
  return t.keys.chords[c].tones;
}

/** The passages (runs of drops and mains) and the exposed passages, in bars. */
export function regionsOf(t: any): Array<{ kind: 'passage' | 'exposed' | 'other'; from: number; to: number }> {
  const out: Array<{ kind: 'passage' | 'exposed' | 'other'; from: number; to: number }> = [];
  for (const s of t.arrangement.sections) {
    const kind = s.kind === 'breakdown' ? 'exposed' : ['intro', 'build', 'outro'].includes(s.kind) ? 'other' : 'passage';
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind !== 'other' && last.to === s.startBar) last.to += s.bars;
    else out.push({ kind, from: s.startBar, to: s.startBar + s.bars });
  }
  return out;
}

/** The salient moments as the program has them: keys landings that sound, the arrivals, the bed's chapter-level withdrawals and entrances, the drum planner's moves that count. */
export function salientOf(t: any, prog: any, notes: readonly SoundingNote[]): Array<{ bar: number; kind: string }> {
  const C = chapterRowOf(t.ambient.rows.chapters)!, B = bedRowOf(t.ambient.rows.bed)!;
  const bs = t.barSeconds;
  const keysBars = new Set(prog.events.filter((e: any) => e.role === 'sparse-keys').map((e: any) => e.bar));
  const out: Array<{ bar: number; kind: string }> = [];
  for (const l of t.keys.landings) if (keysBars.has(l.bar)) out.push({ bar: l.bar, kind: 'keys-landing' });
  for (const r of regionsOf(t).slice(1)) out.push({ bar: r.from, kind: 'arrival' });
  const asPlan: BedNote[] = notes.map((n) => ({ midi: n.midi, from: Math.round(n.t / bs * 16), to: Math.round((n.t + n.dur) / bs * 16), release: n.release, attack: 0, vel: 0, gesture: 0, swell: { db: 0, oct: 0, over: 0 }, cutoffMul: 1, gain: 1 }));
  for (const m of bedMoments(asPlan, t.bars, bs, B.absences.salientRestBars)) out.push({ bar: m.bar, kind: m.kind });
  const counts = (f: string, v: string) => C.continuation.salient.includes(f) || C.continuation.salient.includes(`${f}.${v}`);
  for (const p of t.development?.phrases ?? []) {
    if (p.variant && p.at != null && counts(p.family, p.variant)) out.push({ bar: p.at, kind: `drums ${p.family}.${p.variant}` });
    for (const f of p.foreground) if (f.startsWith('into ')) out.push({ bar: p.start, kind: 'drums state' });
  }
  for (const s of t.development?.aux.spans ?? []) out.push({ bar: s.to, kind: 'aux leaves' });
  return out.sort((a, b) => a.bar - b.bar);
}

/** The longest gap between salient moments inside each passage, its line and the next counted as moments. */
export function passageGaps(t: any, salient: ReadonlyArray<{ bar: number }>): Array<{ from: number; to: number; gap: number; at: number }> {
  return regionsOf(t).filter((r) => r.kind === 'passage').map((r) => {
    const bars = [r.from, ...salient.map((s) => s.bar).filter((b) => b > r.from && b < r.to), r.to].sort((a, b) => a - b);
    let gap = 0, at = r.from;
    for (let i = 1; i < bars.length; i++) if (bars[i] - bars[i - 1] > gap) { gap = bars[i] - bars[i - 1]; at = bars[i - 1]; }
    return { from: r.from, to: r.to, gap, at };
  });
}

/** The cast in units (voices 4/12/35, the part space's effects 1/3/8): distinct voices sounding in the program, and the keys' space. */
export function castOf(prog: any): { voices: number; space: number; total: number } {
  const voices = [...new Set(prog.events.map((e: any) => e.voice as string))].reduce((a: number, v) => a + (VOICE_COST_UNITS[BY_NAME[v as string]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  const sp = prog.settings?.partSpace;
  const rows = [...(sp ? [sp] : []), ...Object.values(prog.settings?.returns ?? {})] as any[];
  // the part's own space and the theme's shared returns, their effects in the same units
  const space = rows.reduce((a, r) => a + effectsCost([...r.inserts, ...r.sends, ...r.sends.flatMap((x: any) => x.after ?? [])].map((x: any) => x.effect)), 0);
  return { voices, space, total: voices + space };
}
export { pc };
