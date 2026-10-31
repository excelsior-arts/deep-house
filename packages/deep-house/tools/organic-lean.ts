// organic-lean.ts — where the house leans organic (10-28, for the interrupted keyboard's place): N themes over the
// birds (half near the house, half anywhere), each read for hand drums, a played keyboard and a dry room, and the
// score's lean on each bird among the drummed themes at 125 BPM and under.
//
//   node tools/organic-lean.ts [N]        the correlations and the least-squares lean, per bird
import { planTheme } from '../src/mix.ts';
import { HOUSE } from '../src/spell.ts';
const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];
const N = +(process.argv[2] ?? 300);
let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
const ACOUSTIC = new Set(['piano', 'pianoUpright', 'pianoFelt', 'pianoMellow', 'pianoClose', 'pianoConcert', 'pianoWorn', 'pianoMute', 'keysRhodes', 'keysEp', 'keys', 'keysSuitcase', 'rhodes', 'ep', 'marimba', 'vibes', 'reedOrgan', 'keysReed', 'organ', 'keysOrgan', 'clavKey']);
const HANDS = new Set(['conga', 'bongo', 'congas', 'tom', 'woodblock', 'cowbell']);
const rows: any[] = [];
for (let i = 0; i < N; i++) {
  // half the samples near the house (the house's own neighbourhood), half anywhere
  const near = i % 2 === 0;
  const spell: Record<string, number> = {};
  for (const b of BIRDS) spell[b] = near ? Math.max(0, Math.min(1, (HOUSE as any)[b] + (rnd() - .5) * .5)) : rnd();
  const seed = String(1 + Math.floor(rnd() * 99999));
  try {
    const t = planTheme(seed, 0, { strategy: 'house-v2', spell });
    const voices = new Set(t.events.map((e: any) => e.voice));
    const keysV = [...new Set(t.events.filter((e: any) => e.layer === 'keys').map((e: any) => e.voice))];
    const hands = [...voices].some((v) => HANDS.has(v as string));
    const acoustic = keysV.some((v) => ACOUSTIC.has(v as string)) || (t.dice.leadTimbre && ACOUSTIC.has(t.dice.leadTimbre));
    const wet = t.sound?.wetness?.value ?? '';
    const tr = typeof t.dice.composition === 'string' ? JSON.parse(t.dice.composition) : null;
    rows.push({ seed, spell, bpm: t.bpm, kit: t.dice.kit ?? null, drums: !!t.kickPresent, hands, acoustic, keys: keysV, lead: t.dice.leadTimbre, wet, texture: tr?.texture?.is ?? null, scene: tr?.scene ?? null, place: t.dice.place ?? null });
  } catch (e) { rows.push({ seed, spell, error: String(e).slice(0, 120) }); }
}
const ok = rows.filter((r) => !r.error && r.drums && r.bpm <= 125);
const score = (r: any) => Number(r.hands) + Number(!!r.acoustic) + Number(r.wet === 'dry');
const y = ok.map(score), my = y.reduce((a, b) => a + b, 0) / y.length;
console.log(`${ok.length} drummed themes at 125 BPM and under of ${rows.length}; the organic score's mean ${my.toFixed(2)}`);
for (const b of BIRDS) {
  const x = ok.map((r) => r.spell[b]), mx = x.reduce((a: number, c: number) => a + c, 0) / x.length;
  const cov = x.reduce((a: number, c: number, i: number) => a + (c - mx) * (y[i] - my), 0), vx = x.reduce((a: number, c: number) => a + (c - mx) ** 2, 0);
  const vy = y.reduce((a, c) => a + (c - my) ** 2, 0);
  console.log(`${b.padEnd(7)} r ${(cov / Math.sqrt(vx * vy)).toFixed(2)}  slope ${(cov / vx).toFixed(2)} a unit`);
}
