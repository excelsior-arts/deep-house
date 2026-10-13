// The listen-through: one line per eight-bar phrase off the planned events (what sounds), the producer's plan and the
// passage's bar timeline; then the program guards on this theme (`tools/check-program-guards.ts`: unlabelled events,
// landings the drums ignore, holes in a build, empty stretches, held chords that stop, bends past the register) and
// the one guard that reads a render: a build bar measured more than 2 dB under the bar before.
// usage: node tools/producer-timeline.ts <seed> <spell> [--lufs <per-bar file>]   (from packages/deep-house)
//   --lufs: a render's per-bar loudness (the `per bar` block of a gaps report, its first column the bar)
const args = process.argv.slice(2);
const lufsAt = args.indexOf('--lufs');
const lufsFile = lufsAt >= 0 ? args.splice(lufsAt, 2)[1] : null;
const [seed, spell] = args;
const { planTheme } = await import('../src/mix.ts');
const { parseSpell } = await import('../src/spell.ts');
const keep = console.log; console.log = console.info = console.warn = () => {};
const t: any = planTheme(Number(seed), 0, { strategy: 'house-v2', spell: parseSpell(spell)! });
console.log = keep;
const bs = t.barSeconds, S = t.passage, ev = t.events as any[];
const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nn = (m: number) => `${names[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;
const chordAt = (b: number) => { let c = ''; for (const s of t.progression.states) if (s.bar <= b) c = s.chord.label; return c; };
const tl = new Map<number, any>((S?.timeline ?? []).map((r: any) => [r.bar, r]));
const plans = S?.phrases ?? [];
const sectionAt = (b: number) => t.arrangement.sections.find((s: any) => b >= s.startBar && b < s.startBar + s.bars)?.kind;
const out: string[] = [];
for (let p = 0; p < t.bars; p += 8) {
  const q = Math.min(t.bars, p + 8);
  const inP = (e: any) => e.bar >= p && e.bar < q;
  const pl = plans.find((x: any) => x.from <= p && x.to > p);
  const L = t.keys.landings.filter((l: any) => l.bar >= p && l.bar < q).map((l: any) => `${l.bar} ${t.keys.chords[l.chord].symbol}${l.change ? '' : ' (restrike)'}`);
  const voice = ev.filter((e: any) => inP(e) && (e.part === 'study-soloist' || e.part === 'study-phrase')).map((e: any) => e.label).filter((x: any, i: number, a: any[]) => a.indexOf(x) === i);
  const vnotes = ev.filter((e: any) => inP(e) && (e.part === 'study-soloist' || e.part === 'study-phrase')).map((e: any) => {
    const pc = e.p.pitchCurve as number[] | undefined; const ms = [e.p.midi];
    if (pc) for (let i = 3; i < pc.length; i += 2) { const m = e.p.midi + Math.round(pc[i] / 100); if (Math.abs(pc[i] - pc[i - 2]) > 50 && m !== ms[ms.length - 1]) ms.push(m); }
    return `${e.bar}:${(e.step >> 2) + 1}${['', 'e', '&', 'a'][e.step & 3]} ${ms.map(nn).join(' ')}`; });
  const keys = ev.filter((e: any) => inP(e) && e.role === 'sparse-keys' && e.part !== 'study-phrase').map((e: any) => e.label ?? 'UNLABELLED').filter((x: any, i: number, a: any[]) => a.indexOf(x) === i);
  const pad = ev.filter((e: any) => inP(e) && e.layer === 'pad' && e.part !== 'study-soloist').map((e: any) => e.label ?? `pad ${e.part ?? ''}`).filter((x: any, i: number, a: any[]) => a.indexOf(x) === i);
  const fx = ev.filter((e: any) => inP(e) && (e.layer === 'fx')).map((e: any) => `${e.voice}@${e.bar}${e.p.returns ? '→hall' : ''}`).filter((x: any, i: number, a: any[]) => a.indexOf(x) === i);
  const perc = ev.filter((e: any) => inP(e) && e.layer === 'shaker');
  const bars = [...Array(q - p).keys()].map((i) => p + i);
  const drumsTl = bars.map((b) => tl.get(b)?.drums ? `${b}: ${tl.get(b).drums}` : '').filter(Boolean);
  const kick = bars.map((b) => ev.filter((e: any) => e.bar === b && e.layer === 'kick').length);
  const bassBars = bars.map((b) => ev.some((e: any) => e.layer === 'bass' && e.t < (b + 1) * bs && e.t + Number(e.p.dur) > b * bs) ? 'B' : '.').join('');
  const bassLabels = ev.filter((e: any) => inP(e) && e.layer === 'bass' && e.label).map((e: any) => e.label).filter((x: any, i: number, a: any[]) => a.indexOf(x) === i);
  const space = bars.map((b) => tl.get(b)?.space ? `${b}: ${tl.get(b).space}` : '').filter(Boolean);
  out.push(`### ${p}-${q - 1}  ${sectionAt(p)} · ${pl ? `${pl.fn}${pl.by === 'passage' ? '' : ' (grammar)'}` : ''} · harmony ${chordAt(p)}${chordAt(q - 1) !== chordAt(p) ? `→${chordAt(q - 1)}` : ''}${L.length ? ` · landing ${L.join(', ')}` : ''}`);
  out.push(`  drums: ${pl?.by === 'grammar' ? pl.drums : drumsTl.join(' | ') || 'the planner\'s'}${kick.every((k) => k === 0) ? ' [no kick]' : ''}`);
  out.push(`  bass:  ${bassBars}  ${pl?.by === 'grammar' ? pl.bass : bassLabels.join('; ') || (tl.get(p)?.bass ?? '')}`);
  out.push(`  voice: ${voice.length ? voice.join('; ') : 'rest'}${vnotes.length ? `  [${vnotes.join(' | ')}]` : ''}`);
  out.push(`  keys:  ${keys.join('; ') || 'none'}`);
  if (pad.length) out.push(`  pad:   ${pad.join('; ')}`);
  out.push(`  perc:  ${perc.length ? `${perc.length} hand hits` : 'none'}`);
  out.push(`  fx/space: ${[...fx, ...(pl?.by === 'grammar' ? [pl.space] : space)].filter(Boolean).join('; ') || '-'}`);
  if (pl?.by === 'grammar' && pl.answers) out.push(`  answers: ${pl.answers}`);
}
console.log(out.join('\n'));
// the program guards, as every theme is held to them
const { guards, buildBars, GUARDS } = await import('./check-program-guards.ts');
const found = guards(t);
for (const g of GUARDS) {
  const xs = found.filter((f: any) => f.guard === g);
  console.log(`GUARD ${g}: ${xs.length ? xs.map((f: any) => `${f.bar} ${f.says}`).join('; ') : 'none'}`);
}
// the measured hole: a build bar more than 2 dB under the bar before (a landing's accent bar passed over)
if (lufsFile) {
  const fs = await import('node:fs');
  const lu = new Map<number, number>();
  for (const line of fs.readFileSync(lufsFile, 'utf8').split('\n')) {
    const m = /^\s*(\d+)\s+((?:-?\d+\.\d\s+)+)\s*s\/m/.exec(line);
    if (!m) continue;
    m[2].trim().split(/\s+/).forEach((v, i) => lu.set(Number(m[1]) + i, Number(v)));
  }
  const accent = new Set<number>([...t.keys.landings.map((l: any) => l.bar), ...t.arrangement.sections.map((x: any) => x.startBar)]);
  const falls: string[] = [];
  for (const b of [...buildBars(t)].sort((x, y) => x - y)) {
    const r = accent.has(b - 1) && b - 2 >= 0 ? b - 2 : b - 1;
    if (lu.has(b) && lu.has(r) && lu.get(b)! < lu.get(r)! - 2) falls.push(`${b} (${(lu.get(b)! - lu.get(r)!).toFixed(1)} dB under ${r})`);
  }
  console.log(`GUARD holes (measured): ${falls.length ? falls.join(', ') : 'none'}`);
}
