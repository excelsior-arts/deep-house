// The sparse keys and the harmony they set (liquid-space round 1, `src/keys-phrase.ts`), in node:
// the rows admitted; on the compiled program of the two checkpoint spells and a dozen seeds each,
// every chord change on a landing, nothing held in the bass or the bed outside the arriving chord
// at its onset, the strikes in their chord, the pickups owning their windows; the house and the
// places without the part untouched; and live, on the engine's stand-in, the part's space built
// once a theme, and let go at a seek and at a hand-over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf, createMix } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { keysRowsFaults } from '../src/keys-phrase.ts';
import { liveStandin } from '@deep-house/engine/standin';
import { TICK_MS } from '@deep-house/engine/clock';

const SPELLS: Record<string, string> = {
  A: 'em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
  B: 'em:0.95,ti:0.80,ze:0.45,ro:0.70,gl:0.40,ve:0.30,sp:0.85,lo:0.90',
};
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const plan = (seed: string, spell: string | null, theme = 0) => quiet(() => planTheme(seed, theme, { strategy: 'house-v2', ...(spell ? { spell: parseSpell(spell)! } : {}) }));
const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
/** A note's pitch `dt` seconds in, through its bend (pairs of seconds and semitones over its note). */
const pitchAt = (p: { midi: number; bend?: number[] }, dt: number): number => {
  const b = p.bend;
  if (!Array.isArray(b) || b.length < 2) return p.midi;
  if (dt <= b[0]) return p.midi + b[1];
  for (let i = 2; i < b.length; i += 2) if (dt <= b[i]) return p.midi + b[i - 1] + (b[i + 1] - b[i - 1]) * (dt - b[i - 2]) / Math.max(1e-9, b[i] - b[i - 2]);
  return p.midi + b[b.length - 1];
};

test('the keys rows are admitted: weights, bass homes only on tones of their chord, the draw row naming rows that exist', () => {
  assert.deepEqual(keysRowsFaults(), []);
});

for (const [name, spell] of Object.entries(SPELLS)) for (const seed of ['1', '17', ...Array.from({ length: 10 }, (_, i) => String(i + 2))]) {
  test(`${name} seed ${seed}: the harmony changes only where the keys land, and nothing low or held is outside the arriving chord at its onset`, () => {
    const t = plan(seed, spell);
    assert.ok(t.keys, 'the fast place plays no keys');
    const prog = programOf(t);
    const bs = t.barSeconds;
    const landings = new Map(t.keys!.landings.map((l) => [l.bar, l]));
    const tones = t.keys!.chords.map((c) => new Set(c.tones));
    // every chord change on a landing that strikes that chord
    for (const st of t.keys!.states.slice(1)) {
      const l = landings.get(st.bar);
      assert.ok(l && l.change && l.chord === st.chord, `a chord change at bar ${st.bar} with no landing striking it`);
    }
    // the progression every reader takes is the same state
    const keys = prog.events.filter((e) => e.role === 'sparse-keys');
    assert.ok(keys.length > 0, 'no keys in the program');
    for (const e of keys) assert.ok(e.p.partSpace === 1 && !e.p.hall && !e.p.delay && !e.p.reverb, `a keys note at ${e.t} sends elsewhere than its space`);
    // each strike's notes are its chord's
    for (const e of keys.filter((x) => landings.has(x.bar!) && x.step === 0)) {
      const l = landings.get(e.bar!)!;
      assert.ok(tones[l.chord].has(pc(e.p.midi as number)), `the strike at bar ${e.bar} plays ${e.p.midi}, outside ${t.keys!.chords[l.chord].symbol}`);
    }
    // at each change: the bed and the bass sounding then (their release with them) are tones of the arriving chord
    for (const st of t.keys!.states.slice(1)) {
      const T = st.bar * bs, ok = tones[st.chord];
      for (const e of prog.events) {
        // the bed and the bass; the keys' own chord rings into its space as the lab's did, and is the part, not the bed
        if ((e.layer !== 'pad' && e.layer !== 'bass') || e.role === 'sparse-keys') continue;
        const p = e.p as { midi?: number; dur?: number; release?: number; bend?: number[] };
        if (typeof p.midi !== 'number') continue;
        const end = e.t + Number(p.dur ?? 0) + (e.layer === 'pad' ? Number(p.release ?? 0) : 0);
        if (!(e.t <= T + 1e-6 && end > T + 1e-3)) continue;
        const m = e.layer === 'bass' ? pitchAt(p as { midi: number; bend?: number[] }, T - e.t) : p.midi;
        assert.ok(ok.has(pc(m)), `${e.layer} ${e.voice} holds ${m.toFixed(2)} across the change to ${t.keys!.chords[st.chord].symbol} at bar ${st.bar}`);
      }
    }
    // a pickup owns its window: no texture struck inside one
    for (const w of t.keys!.reserved.filter((x) => x.kind === 'pickup'))
      for (const e of prog.events) if (e.role === 'texture' && e.t >= w.from * bs / 16 && e.t < w.to * bs / 16) assert.fail(`a texture at ${e.t} inside the pickup into bar ${w.bar}`);
    // the part's space is in the theme's settings, one row
    assert.equal(prog.settings.partSpace?.kind, 'space');
  });
}

test('the house and the places without the part play no keys and build no part space', () => {
  for (const spell of [null, 'em:0.72,sp:0.10,ti:0.90,ze:0.25,ro:0.85,ve:0.15,lo:0.80', 'em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81']) for (const seed of ['1', '6', '27191']) {
    const t = plan(seed, spell);
    assert.equal(t.keys, undefined, `${seed} at ${spell} plays keys`);
    const prog = programOf(t);
    assert.equal(prog.settings.partSpace, undefined);
    assert.ok(!prog.events.some((e) => e.role === 'sparse-keys'));
  }
});

// --- live: the part's space once a theme, let go at a seek and a hand-over ---------------------

const ticks = new Set<() => void>();
const realSetInterval = globalThis.setInterval;
const realSetTimeout = globalThis.setTimeout;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = ((fn: () => void, ms?: number) => {
  if (ms === TICK_MS) { ticks.add(fn); return fn as unknown as ReturnType<typeof setInterval>; }
  return realSetInterval(fn, ms);
}) as typeof setInterval;
globalThis.clearInterval = ((id: unknown) => { if (ticks.has(id as () => void)) ticks.delete(id as () => void); else realClearInterval(id as ReturnType<typeof setInterval>); }) as typeof clearInterval;
const turn = () => new Promise((r) => setImmediate(r));
async function play(ctx: { currentTime: number }, seconds: number) {
  const end = ctx.currentTime + seconds;
  while (ctx.currentTime < end - 1e-9) { ctx.currentTime = Math.min(end, ctx.currentTime + TICK_MS / 1000); for (const fn of [...ticks]) fn(); await turn(); }
}

test('live: the part\'s space is built once for a theme, every bus shares it, and a seek and a hand-over let the old one go', async () => {
  const ctx = liveStandin();
  const mix = quiet(() => createMix(ctx, { masterSeed: '1', strategy: 'house-v2', destination: ctx.destination as never, bypass: null, spell: parseSpell(SPELLS.A) } as never)) as any;
  const log = console.log; console.log = () => {};
  try { await mix.start(0, 0); } finally { console.log = log; }
  await play(ctx, 2);
  const disposed: string[] = [];
  const watch = (deck: any, name: string) => {
    const g = deck.graph;
    assert.ok(g.hasPartSpace(), `${name}: the theme's part space was not built`);
    const sp = g.nodes.partSpace;
    for (const bus of Object.values(g.nodes.buses) as any[]) assert.equal(bus.partSpace, sp.input, `${name}: a bus has a part space of its own`);
    const dispose = sp.dispose.bind(sp);
    sp.dispose = (when?: number) => { disposed.push(name); dispose(when); };
    return sp;
  };
  const first = mix.record;
  watch(first, 'first');
  console.log = () => {};
  try { await mix.seek(120); } finally { console.log = log; }
  await play(ctx, 3);
  // a released deck is torn down on the platform's timer once its fade is heard (`release` in deck.ts)
  await new Promise((r) => realSetTimeout(r, 1500));
  assert.notEqual(mix.record, first, 'the seek kept the deck');
  assert.deepEqual(disposed, ['first'], 'the seek did not let the first theme\'s space go, or let it go twice');
  const landed = mix.record;
  watch(landed, 'landed');
  console.log = () => {};
  try { await mix.skip(); } finally { console.log = log; }
  await play(ctx, 40);
  await new Promise((r) => realSetTimeout(r, 1500));
  assert.notEqual(mix.record, landed, 'the hand-over kept the deck');
  assert.deepEqual(disposed, ['first', 'landed'], 'the hand-over did not let the landed theme\'s space go, or let it go twice');
  const live = [mix.record, mix.playingOut].filter(Boolean);
  for (const d of live) if (d.program.settings.partSpace) assert.ok(d.graph.hasPartSpace());
  mix.stop();
});
