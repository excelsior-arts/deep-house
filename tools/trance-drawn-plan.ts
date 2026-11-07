// trance-drawn (11-04, borrowed from dream-trance): a theme's plan in a listener's summary: its sections, its layers and voices by section, its chords.
//   node tools/trance-drawn-plan.ts '<link query>' [--events layer]
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { chordAtBar } from '../packages/deep-house/src/theory.ts';

const q = process.argv[2];
const read = linkRead(`?${q}`);
const L = read.link, seed = L.seed ?? '1';
const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
const opts = { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development };
const t = planTheme(seed, L.theme, opts) as any;
console.log('bpm', t.bpm, 'bars', t.bars, 'barSeconds', t.barSeconds.toFixed(3), 'key', t.key ?? t.keyName, 'scale', t.scale ?? t.mode);
for (const s of t.arrangement.sections) {
  const evs = t.events.filter((e: any) => e.bar >= s.startBar && e.bar < s.startBar + s.bars);
  const by: Record<string, Set<string>> = {};
  for (const e of evs) (by[e.layer] ??= new Set()).add(e.voice);
  console.log(`${s.kind.padEnd(10)} ${String(s.startBar).padStart(4)} +${String(s.bars).padEnd(3)} t=${(s.startBar * t.barSeconds).toFixed(0)}s`, Object.entries(by).map(([l, v]) => `${l}:${[...v].join('/')}`).join(' '));
}
const ch: string[] = [];
for (let b = 0; b < Math.min(t.bars, 16); b++) { const c = chordAtBar(t.progression, b); ch.push(`${c.name ?? c.rootMidi}`); }
console.log('chords', ch.join(' '));
const want = process.argv.indexOf('--events');
if (want > 0) for (const e of t.events.filter((e: any) => e.layer === process.argv[want + 1]).slice(0, 60)) console.log(e.bar, e.step, e.voice, e.note, JSON.stringify(e.p).slice(0, 200));
