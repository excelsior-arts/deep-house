// voice-homes (11-01), scratch: what the keys layer plays in a window (voices, notes a bar, pitches, sends, pans).
//   node tools/voice-homes-plan.ts <link> <fromBar> <toBar>
import { played } from '../packages/deep-house/tools/link-digest.ts';
import { programOf } from '../packages/deep-house/src/performance.ts';
const [link, from, to] = [process.argv[2], +process.argv[3], +process.argv[4]];
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const { plan } = quiet(() => played(link));
const program: any = programOf(plan);
const bs = program.barSeconds;
const ev = program.events.filter((e: any) => e.layer === 'keys' && e.t >= from * bs && e.t < to * bs);
const by = new Map<string, any[]>();
for (const e of ev) { const l = by.get(e.voice) ?? []; l.push(e); by.set(e.voice, l); }
console.log('bpm', program.bpm, 'tide', (plan as any).spell?.tide, 'returns', Object.keys(program.settings.returns ?? {}), 'piano.spread', program.settings.piano?.spread);
for (const [v, l] of by) {
  const bars = new Map<number, any[]>();
  for (const e of l) { const b = Math.floor(e.t / bs); const x = bars.get(b) ?? []; x.push(e); bars.set(b, x); }
  const onsets = new Set(l.map((e) => e.t.toFixed(3))).size;
  console.log(v, 'notes', l.length, 'onsets/bar', (onsets / bars.size).toFixed(2), 'bars', bars.size, 'part', [...new Set(l.map((e) => e.part ?? e.role))].join(','));
  const s = l[0].p;
  console.log('   sends hall', s.hall, 'reverb', s.reverb, 'delay', s.delay, 'returns', JSON.stringify(s.returns), 'vel', s.vel, 'dur', s.dur);
  for (const [b, x] of [...bars].slice(0, 6)) console.log('   bar', b, x.map((e) => `${e.p.midi}${e.p.seat != null ? '@' + e.p.seat : ''} v${(+e.p.vel).toFixed(2)} d${(+e.p.dur).toFixed(2)}`).join(' '));
}
