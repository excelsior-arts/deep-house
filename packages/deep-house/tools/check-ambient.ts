// The ambient plan (liquid-ambient, `src/ambient-plan.ts`), in node: the rows admitted; on the compiled program of the
// two checkpoint spells and a dozen seeds each — after the bed's octave rule, the stage, the swells and every other pass
// — the research manual's §9 conditions the bed, the chapters and the return answer for: no long note without an arc,
// no flat plateau over two bars, no pitch chained past twelve, a genuine retreat in every 32-bar block, the final
// register by part, the bed's note ceiling, its harmony, the slots' and windows' ownership, no salient gap over 32 bars
// in a developed passage, a return changing two axes or more, staggered, the cast under the ceiling; the kit's and the
// riff's streams unmoved by the ambient choices; and the house and the places without it untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { ambientRowsFaults, bedRowOf, chapterRowOf } from '../src/ambient-plan.ts';
import { bedNotes, longestPlateau, samePitchChains, retreatsByBlock, mostAtOnce, tonesAt, salientOf, passageGaps, castOf, endOf, pc } from './ambient-program.ts';
import { strategyById } from '../src/strategies/index.ts';
import { withoutTechniques } from '../src/places.ts';

// The written passage (`src/passage.ts`) rewrites its window after the planners this file holds to their own
// invariants; they are checked here as the planners laid them (the style with no place naming a passage), and the
// passage by `check-passage.ts`.
const PLANNERS = withoutTechniques(strategyById('house-v2').style, 'passage');

const SPELLS: Record<string, string> = {
  A: 'em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
  B: 'em:0.95,ti:0.80,ze:0.45,ro:0.70,gl:0.40,ve:0.30,sp:0.85,lo:0.90',
};
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const plan = (seed: string, spell: string | null, theme = 0) => quiet(() => planTheme(seed, theme, { strategy: 'house-v2', style: PLANNERS, ...(spell ? { spell: parseSpell(spell)! } : {}) })) as any;

test('the ambient rows are admitted', () => {
  assert.deepEqual(ambientRowsFaults(), []);
});

// AMBIENT_SEEDS=n widens the sweep to seeds 1..n (a round's sweep; the suite runs the dozen)
const SWEEP = Number(process.env.AMBIENT_SEEDS ?? 0);
const SEEDS = SWEEP > 0 ? Array.from({ length: SWEEP }, (_, i) => String(i + 1)) : ['1', '17', ...Array.from({ length: 10 }, (_, i) => String(i + 2))];
for (const [name, spell] of Object.entries(SPELLS)) for (const seed of SEEDS) {
  test(`${name} seed ${seed}: the bed, the chapters and the return, read off the compiled program`, () => {
    const t = plan(seed, spell);
    assert.ok(t.ambient, 'the fast place made no ambient plan');
    const prog = programOf(t);
    const bs = t.barSeconds;
    const A = t.ambient, B = bedRowOf(A.rows.bed)!, C = chapterRowOf(A.rows.chapters)!, Lm = B.limits;
    const notes = bedNotes(t, prog);
    assert.ok(notes.length > 0, 'the bed plays nothing');
    const lift = (bar: number) => !!t.arrangement.sections.find((s: any) => bar >= s.startBar && bar < s.startBar + s.bars)?.lift;
    for (const n of notes) {
      // long notes: none over the ordinary length (the bed declares no longer arc), none over the most
      assert.ok(n.dur <= Math.min(Lm.arcOverBars * bs, Lm.noteMostS) + 1e-6 && n.dur <= Lm.maxNoteBars * bs, `a bed note of ${(n.dur / bs).toFixed(2)} bars at bar ${n.bar}`);
      // the final register, by part: a lifted (exposed) section's window, else the full passages'
      const [lo, hi] = A.register[lift(n.bar) ? 'exposed' : 'full'];
      assert.ok(n.midi >= lo && n.midi <= hi, `the bed sounds ${n.midi} at bar ${n.bar}, outside ${lo}-${hi}`);
      // harmony: a tone of the chord in force from its start to the end of its release
      for (let b = n.bar; b * bs < endOf(n) - 1e-6 && b < t.bars; b++)
        assert.ok(tonesAt(t, b).includes(pc(n.midi)), `the bed's ${n.midi} (bar ${n.bar}) is not a tone of the chord at bar ${b}`);
    }
    // flat plateaus: each pitch's chain, and the bed as a whole, never within 1 dB for more than two bars
    for (const ch of samePitchChains(notes, Lm.mergeS)) {
      const flat = longestPlateau(ch.notes, Lm.plateauDb);
      assert.ok(flat <= Math.min(Lm.plateauBars * bs, Lm.plateauMostS), `${ch.midi} holds within ${Lm.plateauDb} dB for ${(flat / bs).toFixed(2)} bars from ${(ch.from / bs).toFixed(1)}`);
      // same-pitch chains: no pitch on for more than twelve bars, a release counted, a retrigger never resetting it
      assert.ok(ch.to - ch.from <= Math.min(Lm.samePitchBars * bs, Lm.samePitchMostS) + 1e-6, `${ch.midi} sounds ${((ch.to - ch.from) / bs).toFixed(2)} bars on end from bar ${(ch.from / bs).toFixed(1)}`);
    }
    // genuine retreats: every 32-bar block with bed in it has two bars with none
    for (const r of retreatsByBlock(notes, t.bars, bs, Lm.retreatBlockBars))
      assert.ok(r.longest >= Lm.retreatBars - 1e-6, `the block from bar ${r.from} retreats for ${r.longest.toFixed(2)} bars at most`);
    // the note ceiling, releases counted
    assert.ok(mostAtOnce(notes) <= Lm.maxNotes, `${mostAtOnce(notes)} bed notes at once`);
    // ownership: no bed inside a keys pickup or on a strike's beat; no two slots at once; no slot over a hard keys window or an arrival; no drum answer inside a required motif slot
    for (const w of t.keys.reserved) for (const n of notes)
      assert.ok(!(n.t < w.to * bs / 16 && endOf(n) > w.from * bs / 16), `the bed's ${n.midi} (bar ${n.bar}) sounds inside the keys' ${w.kind} at bar ${w.bar}`);
    A.slots.forEach((s: any, i: number) => {
      for (const o of A.slots.slice(i + 1)) assert.ok(s.to <= o.from || o.to <= s.from, `slots ${s.id} and ${o.id} overlap`);
      for (const r of A.reservations.filter((x: any) => x.kind === 'hard' && x.owner !== 'detail'))
        assert.ok(!(s.from * 16 < r.to && r.from < s.to * 16), `the ${s.use} slot at ${s.from} crosses ${r.why} (bar ${r.bar})`);
    });
    for (const a of t.development.answers) for (const s of A.slots.filter((x: any) => x.required && x.owner === 'motif'))
      assert.ok(!(a.bar >= s.from && a.bar < s.to), `the drums' ${a.answer} on bar ${a.bar} inside the ${s.use} slot`);
    for (const s of A.slots.filter((x: any) => x.bed === 'withdrawn')) for (const n of notes)
      assert.ok(!(n.t < s.to * bs && endOf(n) > s.from * bs), `the bed's ${n.midi} sounds under the ${s.use} slot it withdraws from (bar ${s.from})`);
    // development: no salient gap over the row's most in a developed passage
    const salient = salientOf(t, prog, notes);
    for (const g of passageGaps(t, salient))
      assert.ok(g.gap <= C.continuation.maxGapBars, `the passage ${g.from}-${g.to} goes ${g.gap} bars from bar ${g.at} without a salient moment`);
    // every chapter's obligations met: a change of function or featured material within 32 bars, a recall within 64
    for (const c of A.chapters) for (const o of c.obligations) if (o.kind !== 'opportunity') assert.ok(o.met, `chapter ${c.from}-${c.to} (${c.function}): its ${o.kind} obligation by bar ${o.by} went unmet`);
    // every required event says why and what met it
    for (const r of A.required) assert.ok(r.why && r.met && r.met !== 'unmet', `the requirement at bar ${r.bar} went unmet: ${r.why}`);
    // the return: two declared axes or more, staggered, inside its first bars, the bed's own as the program has them
    const R = A.returnPlan;
    if (R) {
      // two declared axes or more: the bed's and the drums' sound here; a slot's is the melodic part's to fill (a required slot)
      assert.ok(R.axes.length >= 2, `the return declares ${R.axes.length} axis`);
      for (const x of R.axes.filter((y: any) => y.by === 'slot')) assert.ok(A.slots.some((s: any) => s.required && s.from === x.at), `the return's ${x.axis} names no required slot`);
      assert.ok(R.axes.length <= C.return.mostAxes + 1, `the return changes ${R.axes.length} axes, all of them at once is too many`);
      assert.ok(new Set(R.axes.map((x: any) => x.at)).size >= 2, 'the return\'s changes all land at once');
      for (const x of R.axes) assert.ok(x.at >= R.from && x.at < R.from + C.return.within, `the return's ${x.axis} at bar ${x.at} is past its first ${C.return.within} bars`);
      assert.ok(!notes.some((n) => n.t < (R.from + R.bedOffBars) * bs && n.t + n.dur > R.from * bs), 'the return opens with the bed in it');
      const back = R.axes.find((x: any) => x.axis === 'harmonic-voicing');
      if (back) assert.ok(notes.some((n) => n.bar === back.at), `no bed note where the return's voicing comes back (bar ${back.at})`);
    }
    // the cast under the catalogue's ceiling
    const cast = castOf(prog);
    assert.ok(cast.total <= 220, `the cast is ${cast.total} units`);
  });
}

test('stability: the ambient choices consume none of the kit\'s or the riff\'s streams', () => {
  for (const [spell, seed] of [[SPELLS.A, '1'], [SPELLS.B, '17'], [SPELLS.A, '5'], [SPELLS.B, '9']] as const) {
    const on = plan(seed, spell);
    const off = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', style: withoutTechniques(PLANNERS, 'ambient'), spell: parseSpell(spell)! })) as any;
    assert.equal(off.ambient, undefined);
    // a bar either plan touched (an answer, a lift, a throw, an auxiliary part, a fill, a state, a bass move) is the plans'; every other bar's drums and bass are the streams'
    const touched = new Set<number>();
    for (const d of [on.development, off.development]) {
      for (const a of d.answers) touched.add(a.bar);
      for (const l of d.lifts) for (let b = l.from; b < l.to; b++) touched.add(b);
      for (const th of d.throws) touched.add(th.bar);
      for (const s of d.aux.spans) for (let b = s.from - 1; b <= s.to; b++) touched.add(b);
      for (const b of [...d.fills.kept, ...d.fills.lines]) { touched.add(b); touched.add(b + 1); }
      for (const m of d.bass) for (let b = m.phrase; b < m.phrase + 8; b++) touched.add(b);
      for (const p of d.phrases) if (p.state !== 'full' && p.state !== 'developed') for (let b = p.start; b < p.start + p.bars; b++) touched.add(b);
    }
    const sig = (t: any, layers: string[]) => t.events.filter((e: any) => layers.includes(e.layer) && e.bar != null && !touched.has(e.bar))
      .map((e: any) => `${e.bar}:${e.step}:${e.voice}:${e.p.midi ?? ''}:${(+e.p.vel || 0).toFixed(3)}`).sort();
    const drums = ['kick', 'snare', 'clap', 'hats', 'perc', 'bass'];
    const a = sig(on, drums), b = sig(off, drums);
    assert.ok(a.length > 100, 'nothing to compare');
    assert.deepEqual(a, b, `seed ${seed}: the kit's or the riff's events moved where neither plan touched`);
  }
});

test('the house and the places without the part make no ambient plan', () => {
  for (const spell of [null, 'em:0.72,sp:0.10,ti:0.90,ze:0.25,ro:0.85,ve:0.15,lo:0.80', 'em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81']) for (const seed of ['1', '6', '27191']) {
    const t = plan(seed, spell);
    assert.equal(t.ambient, undefined, `${seed} at ${spell} made an ambient plan`);
  }
});
