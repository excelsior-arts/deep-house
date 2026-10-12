// check-composer, shard 2 of 4 (swells): the composer's holes within the locks, as `check-composer-common.ts` says.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planTheme, programOf, interpretWants, pushCurve, organTheme, generate, style, settings, v1, HOUSE, biasFor, swellsOf, spellVerdict, sweepsOf, v2, houseTables, leadInStyle, leadInsOf,
} from './check-composer-common.ts';
import type { Arrangement, Section, Plan } from './check-composer-common.ts';

test('R34: the palette biases the lead-in and never gates it: a dry or tight theme rises quietly on a loud return and not on a modest one', () => {
  // Eugene, 09-24: "if there is space for improvement, go do it." Before, a
  // dry or tight palette had no riser at all (0 of 277 of their returns at the
  // house). Now a full return that brings back five rhythm layers or more
  // rises there a step quieter; three or four keep the swell and impact or
  // the fall; and a theme with no rise on it plans as it did.
  let loud = 0, loudRisen = 0, modest = 0, modestRisen = 0;
  const quiet: number[] = [];
  for (let seed = 1; seed <= 120; seed++) for (let n = 0; n < 4; n++) {
    const t = planTheme(seed, n, { style: leadInStyle, preset: 'auto', spell: HOUSE });
    if (!['dry', 'tight'].includes(String(t.dice.fxPalette)) || t.dice.scene === 'drone-forward') continue;
    leadInsOf(t).returns.forEach((r, i, all) => {
      const risen = r.kind === 'riser' || r.kind === 'swell-long';
      // the second of two returns alternates away from a rise whatever it earned
      const free = i === 0 || !['riser', 'swell-long'].includes(all[i - 1].kind);
      if (r.contrast === 1 && r.gained >= 5 && free && r.s.bars > 4) { loud++; if (risen) { loudRisen++; quiet.push(r.rise!.p.gain!); } }
      if (r.gained <= 3) { modest++; if (risen) modestRisen++; }
    });
  }
  assert.ok(loud > 10 && loudRisen > loud * .8, `${loudRisen} of ${loud} loud returns on a dry or tight palette rise`);
  assert.ok(quiet.every(g => g === .5), `a dry rise at ${[...new Set(quiet)]}, where it is a step under the loud 0.65`);
  assert.ok(modest > 30 && modestRisen === 0, `${modestRisen} of ${modest} modest returns on a dry or tight palette rise`);
});

test('R34: the length follows the tempo — four bars from 110 BPM, two from 90, one bar of swell under it', () => {
  for (const [bpm, bars, noise] of [[118, 4, true], [100, 2, true], [85, 1, false]] as const) {
    let rises = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const t = generate({ style: leadInStyle, seed, bpm, spell: HOUSE, minutes: 4 });
      const { risers, returns } = leadInsOf(t as Plan);
      for (const e of risers) assert.ok(noise && Math.abs(e.p.dur! - bars * t.barSeconds) < 1e-6, `seed ${seed} at ${bpm}: a rise of ${e.p.dur! / t.barSeconds} bars`);
      for (const r of returns) if (r.kind === 'riser' || r.kind === 'swell-long') {
        rises++;
        assert.equal(r.kind, noise ? 'riser' : 'swell-long', `seed ${seed} at ${bpm}`);
        assert.ok(Math.abs(r.rise!.p.dur! - bars * t.barSeconds) < 1e-6, `seed ${seed} at ${bpm}: ${r.rise!.p.dur! / t.barSeconds} bars`);
      }
    }
    assert.ok(rises > 3, `${rises} rises at ${bpm} BPM`);
  }
});

test('R34: Ember above the house lowers the contrast a return needs, and never takes a rise from a full one', () => {
  // The phrased development's returns bring back part of the grid (a quarter
  // to three fifths of it); at the house none of them rises, and with Ember
  // near the top of its scale they do.
  const count = (ember: number) => {
    let partial = 0, full = 0;
    for (let seed = 1; seed <= 60; seed++) for (let n = 0; n < 4; n++) {
      const t = planTheme(seed, n, { style: houseTables, preset: 'auto', spell: { ...HOUSE, ember }, development: 'phrased', library: [] });
      for (const r of leadInsOf(t).returns) if (r.kind === 'riser' || r.kind === 'swell-long') r.contrast < 1 ? partial++ : full++;
    }
    return { partial, full };
  };
  const house = count(HOUSE.ember), up = count(.95);
  assert.equal(house.partial, 0, JSON.stringify(house));
  // Restated in round L3: the form is counted in time, so at Ember .95's
  // tempo a theme has fewer, longer sections and fewer returns (476 to 439
  // over these 240 themes) — the rule is that some partial return rises
  // there and none at the house, not how many (9 before L3, 1 since).
  assert.ok(up.partial > 0, `ember .95: ${JSON.stringify(up)}`);
  // The record rolls its coin, and v1 never asks.
  assert.equal((style.switches as Record<string, boolean>).leadIns, true);
  assert.ok(!('switches' in v1));
});

test('R111: a drop followed by a breakdown keeps the breakdown\'s mark under house-v2, and house-v1\'s curve is its own', () => {
  const push = settings.push;
  const section = (kind: string, startBar: number, bars: number, index: number): Section =>
    ({ kind, label: kind, startBar, bars, phrases: [], filter: [15000, 15000], sweepFirst: false, impactFirst: false, riserLast: 0, lift: false, index });
  // A drop shorter than the drive it carries, straight into a breakdown.
  const bars = push.dropBars;
  const arrangement: Arrangement = { sections: [section('main', 0, 16, 0), section('drop', 16, bars, 1), section('breakdown', 16 + bars, 16, 2), section('main', 32 + bars, 16, 3)],
    bars: 48 + bars, phrases: 0 };
  const at = (pts: { bar: number; value: number }[], bar: number) => pts.find(p => Math.abs(p.bar - bar) < 1e-9)?.value;
  const b = 16 + bars;
  const edges = pushCurve(arrangement, push, true);
  assert.equal(at(edges, b - 0.1), push.markLevel, 'the mark before the breakdown');
  assert.equal(at(edges, b), undefined, 'the drop\'s zero cuts the mark at the breakdown\'s first bar');
  assert.equal(at(edges, b + 1), 0, 'the mark decays over the breakdown\'s first bar');
  assert.equal(at(edges, b - 1.5), 0, 'the drop\'s drive is gone where the hand-off begins');
  assert.ok(edges.every((p, i) => i === 0 || p.bar > edges[i - 1].bar));
  // The record's curve is the curve it always was, the fault included.
  const record = pushCurve(arrangement, push);
  assert.equal(at(record, b), 0);
});

test('R37: a set never runs two organ themes back to back, and the rule reads the lead each theme really plays', () => {
  const bias = biasFor(HOUSE, style);
  const runs: string[] = [], wrong: string[] = [];
  for (let seed = 1; seed <= 150; seed++) {
    const leads = [0, 1, 2, 3].map(n => planTheme(seed, n, v2).dice.leadTimbre);
    for (let n = 0; n < 4; n++) {
      if ((leads[n] === 'organ') !== organTheme(seed, n, { style, spell: HOUSE, accompaniment: 'base', development: 'base' })) wrong.push(`${seed}#${n}`);
      if (n && leads[n] === 'organ' && leads[n - 1] === 'organ') runs.push(`${seed}#${n}`);
    }
  }
  // Measured 09-24: organTheme answered wrongly on 46 of 1200, and 123#1 followed 123#0's organ.
  assert.deepEqual(runs, [], 'two organ themes running');
  assert.deepEqual(wrong, [], 'organTheme disagrees with the plan');
});

test('R40: a want with a zero bound leans its pool and never zeroes it', () => {
  const bias = biasFor(HOUSE, style);
  const row = (wants: object) => ({ schema: 1, id: 'check/zero', name: 'Zero bound', scope: 'track', applies: null, origin: 'listener', birds: {}, wants }) as never;
  for (const [wants, list] of [[{ timbres: { lead: { holdMax: 0 } } }, 'leadTimbres'], [{ rates: { bassline: { perBar: 0 } } }, 'densities']] as const) {
    const w = interpretWants(row(wants), style, bias).bias.weights[list];
    assert.ok(w && w.length && w.every(x => x > 0), `${JSON.stringify(wants)} zeroed ${list}: ${w}`);
  }
});

test('R105: compiling a performance freezes nothing the plan owns', async () => {
  // a fresh plan, not the shard's frozen one (`composer-plans.ts`): what is asked is whether compiling froze it
  const { planTheme: fresh } = await import('../src/mix.ts');
  const t = fresh(3, 0, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.9, veil: 0.8 } });
  const tables = Object.values(t.knobs || {});
  assert.ok(tables.length, 'a pulled plan carries knob tables');
  const program = programOf(t);
  assert.ok(tables.every(k => !Object.isFrozen(k)), 'the plan\'s knob tables were frozen by the compiler');
  const seasoned = program.events.find(e => (e.p as { knobs?: object }).knobs);
  assert.ok(seasoned && Object.isFrozen((seasoned.p as { knobs: object }).knobs), 'the program is frozen as it always was');
});

test('a struck phrase is stated once for its figure group however many of the group\'s lanes are on', () => {
  // The fault pass of 09-24: the phrase sat in a loop over the group's
  // sounding lanes that never read its lane, so a second figure lane on
  // pushed every note again on the same voice at the same time (3#0: 96 keys
  // notes became 192, 96 of them duplicates). The phrase is the part's, on
  // the part's own instrument, and the group's lanes are its gate: a style
  // that gives the figure role two lanes, both on, hears it once. Neither
  // shipped style has two figure lanes (measured over seeds 1-200 x 4 of
  // both, 188 themes with a struck part, 25388 bars asked, never two lanes
  // on), so the second lane here is a twin of the first under its gate.
  const fig = style.lanes.find(l => l.role === 'figure')!;
  const twin = { ...style, lanes: style.lanes.flatMap(l => l === fig ? [l, { ...l, id: 'figure-twin' }] : [l]) };
  const noteKey = (e: Plan['events'][number]) => `${e.voice}|${e.t}|${e.p.midi}`;
  let themes = 0, notes = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 4; n++) {
    const one = planTheme(seed, n, { style, preset: 'auto' });
    if (one.dice.struckFigureDegrees === undefined) continue;
    const two = planTheme(seed, n, { style: twin, preset: 'auto' });
    const keys = (t: Plan) => t.events.filter(e => e.layer === 'keys');
    const played = keys(two);
    const dups = played.length - new Set(played.map(noteKey)).size;
    assert.equal(dups, 0, `${seed}#${n}: ${dups} of ${played.length} struck notes pushed twice under two figure lanes`);
    assert.deepEqual(played, keys(one), `${seed}#${n}: two lanes on state a different phrase from one`);
    assert.deepEqual(two.events.filter(e => e.layer !== 'keys'), one.events.filter(e => e.layer !== 'keys'));
    themes++; notes += played.length;
  }
  // Measured 09-24: 14 themes with a struck part in seeds 1-20, 2467 keys notes;
  // 1873 since round S4 shortened house-v2's themes by a fifth.
  assert.ok(themes >= 10 && notes > 1500, `${themes} themes, ${notes} notes`);
});

// Round S1 of the composer, house-v2's `swellIn` (Eugene, 09-25: "the pad kicks
// in hard at 16:00"). A held layer entering after a phrase without it swells
// in over a span the spell, the cast and the section decide; a drop and a
// return of the kick keep their step; the record never asks.
test('S1: the spell sets the swell\'s span by the tempo family, and a driving or broken beat steps', () => {
  const at = (s: Partial<typeof HOUSE>) => spellVerdict({ ...HOUSE, ...s }, style);
  assert.deepEqual([at({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }).side, at({ ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }).span], ['slow', 8]);
  assert.deepEqual([at({}).side, at({}).span], ['steady', 2]);
  assert.equal(at({ veil: 0.95 }).span, 4, 'a shifting Veil doubles a steady four\'s span');
  assert.equal(at({ loom: 0.3 }).span, 1, 'a Loom of loops halves it');
  assert.equal(at({ ember: 0.75, spark: 0.3 }).side, 'step', 'a driving kick steps');
  assert.equal(at({ spark: 0.9 }).side, 'step', 'a broken beat steps');
});

// Restated in the merge round of L1 (Reconcile 1): the benchmark's theme 3 is
// 104 bars since L1 gave it its minutes, and its second breakdown no longer
// takes the pad, so the pad return that swells is theme 6's, at bar 36; theme
// 3's drop, at bar 52, still keeps its step.
test('S1: the benchmark\'s pad return (theme 3\'s, at 16:00 before round S4 shortened the theme, bar 172 at 13:52 after it, bar 144 since round S19 cut the mains; theme 6\'s at bar 36 since round L1, its first breakdown, at 32, since round L2) swells over eight bars; a drop keeps its step', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const entriesOf = (t: Plan) => swellsOf({ style, spell: bench, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes });
  // Restated in round L2 by the rule, since the bars move with Loom: theme 3's
  // drop (at 52 since L1, 56 since L2) keeps its step, and theme 6's pad
  // return is its first breakdown (at 36 since L1, 32 since L2).
  const three = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const dropBar = three.arrangement.sections.find(x => x.kind === 'drop')!.startBar;
  const drop = entriesOf(three).find(e => e.bar === dropBar && e.layer === 'pad')!;
  assert.equal(drop.span, 0);
  assert.match(drop.sectionVerdict, /drop/);
  const t = planTheme('27191', 5, { strategy: 'house-v2', spell: bench });
  const entries = entriesOf(t);
  const at = (bar: number) => entries.find(e => e.bar === bar && e.layer === 'pad')!;
  const back = t.arrangement.sections.find(x => x.kind === 'breakdown')!.startBar;
  assert.equal(at(back).span, 8, `the breakdown at bar ${back} swells over eight bars`);
  // A turnover (the bass leaves on the bar the pad arrives) starts at -6 dB, less the wave pad's own attack.
  assert.ok(at(back).depthDb < -5.7 && at(back).depthDb > -6, `and from ${at(back).depthDb} dB`);
  // Restated in round L3 by the rule: the section counted in time gives the
  // theme a second breakdown, whose return is its own, so the span is read
  // inside the first breakdown and not to the theme's end.
  const first = t.arrangement.sections.find(x => x.kind === 'breakdown')!;
  const swelled = t.events.filter(e => e.p.swell && e.bar! >= back && e.bar! < back + first.bars);
  assert.deepEqual([...new Set(swelled.map(e => e.bar))], [back, back + 4], 'the two chords of the span, and none after it in its breakdown');
  // One line across the notes: each starts where the one before it had got to.
  const by = [...new Set(swelled.map(e => e.t))].map(t0 => swelled.find(e => e.t === t0)!);
  for (let i = 1; i < by.length; i++) {
    const a = by[i - 1].p.swell, b = by[i].p.swell;
    const got = a.db * (1 - (by[i].t - by[i - 1].t) / a.over);
    assert.ok(Math.abs(got - b.db) < 1e-6, `bar ${by[i].bar} starts at ${b.db} dB where the line is at ${got}`);
    assert.ok(Math.abs(by[i].t + b.over - (by[0].t + by[0].p.swell.over)) < 1e-6, 'every note lands on the same line');
  }
});

test('S1: over seeds and spells, a swell is a held layer\'s, never at a drop or a kick\'s return, lands on a line inside its section, and never under house-v1', () => {
  const SPELLS = [HOUSE, { ...HOUSE, ember: 0.14, veil: 0.34, spark: 0, loom: 0.81 }, { ...HOUSE, ember: 0.75, spark: 0.3 }];
  const counts = [0, 0, 0];
  SPELLS.forEach((spell, k) => {
    const family = spellVerdict(spell, style).span;
    for (let seed = 1; seed <= 30; seed++) for (let n = 0; n < 3; n++) {
      const t = planTheme(seed, n, { strategy: 'house-v2', spell });
      const entries = swellsOf({ style, spell, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes });
      for (const e of entries) {
        if (!e.span) {
          assert.ok(!t.events.some(v => v.layer === e.layer && v.bar === e.bar && v.p.swell), `${seed}#${n} bar ${e.bar}: a step carries a swell`);
          continue;
        }
        counts[k]++;
        const s = t.arrangement.sections.find(x => e.bar >= x.startBar && e.bar < x.startBar + x.bars)!;
        assert.notEqual(s.kind, 'drop', `${seed}#${n} bar ${e.bar}: a drop swelled`);
        assert.ok(!(t.timeline[e.bar].layers.includes('kick') && !t.timeline[e.bar - 1].layers.includes('kick')), `${seed}#${n} bar ${e.bar}: the kick's return swelled`);
        assert.ok([1, 2, 4, 8].includes(e.span) && e.span <= family, `${seed}#${n} bar ${e.bar}: span ${e.span} under a family of ${family}`);
        assert.ok(e.bar + e.span <= s.startBar + s.bars, `${seed}#${n} bar ${e.bar}: the swell runs past its section`);
        assert.ok(e.absent >= 8 && e.depthDb < 0 && e.depthDb >= -24);
        const lost = t.timeline[e.bar - 1].layers.filter(l => !t.timeline[e.bar].layers.includes(l));
        if (lost.length) assert.ok(e.depthDb >= -6, `${seed}#${n} bar ${e.bar}: a turnover starts at ${e.depthDb} dB, deeper than -6`);
        const kept = t.timeline[e.bar].layers.filter(l => t.timeline[e.bar - 1].layers.includes(l));
        assert.ok(kept.length, `${seed}#${n} bar ${e.bar}: a hand-over swelled, with nothing under it`);
      }
      for (const v of t.events) if (v.p.swell) assert.ok(entries.some(e => e.span && e.layer === v.layer && v.bar! >= e.bar && v.bar! < e.bar + e.span), `${seed}#${n}: a swell no entrance asked for`);
    }
  });
  // Measured 09-25 over seeds 1-30 x 3: the house swells a little, the ambient spell more, a driving kick never.
  // Measured 09-25 on round S4's shorter forms: 61 / 28 / 0.
  assert.ok(counts[0] > 0 && counts[1] > 0 && counts[2] === 0, `swells by spell: ${counts.join(' / ')}`);
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++)
    assert.ok(!planTheme(seed, n, { style: v1, preset: 'auto' }).events.some(e => e.p.swell), `house-v1 ${seed}#${n} carries a swell`);
  assert.equal((style.switches as Record<string, boolean>).swellIn, true);
});

// Round S2 of the composer, house-v2's `busSweeps` (Eugene, 09-25: high-pass and
// low-pass sweeps as a track insert). A high-pass opening into a section, a
// low-pass closing into a breakdown and a slow breath under a long passage
// with no kick, on the melodic bus only, by the spell, the cast, the section
// and the seam, one at a time; the record never asks.
// Restated in the merge round of L1 (Reconcile 1): the theme is 104 bars since
// L1, its second high-pass opens the main at 60 (88 before), and the second
// breakdown, at 84 (144 before), is past the seam's floor and takes no pad.
test('S2: the benchmark\'s theme 3 opens two sections with a high-pass, closes none (its vibes are a bright struck keys) and leaves its last breakdown (bar 92 since round L2; 172 before round S19, 144 before round L1, 84 before L2) to the seam', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const t = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const input = { style, spell: bench, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes };
  const moves = sweepsOf({ ...input, swells: swellsOf(input) });
  // Restated in round L2 by the rule, since the bars move with Loom (112
  // since L2): the two high-passes open its first breakdown and its second
  // main (36 and 60 since L1, 40 and 64 since L2), and its last breakdown (84
  // since L1, 92 since L2) is at the seam's floor (0.82 of 112, 92).
  const kinds = (k: string) => t.arrangement.sections.filter(x => x.kind === k);
  assert.deepEqual(moves.filter(m => m.laid).map(m => `${m.kind}@${m.bar}+${m.bars}`), [`entry@${kinds('breakdown')[0].startBar}+8`, `entry@${kinds('main')[1].startBar}+8`]);
  assert.match(moves.find(m => m.kind === 'entry' && m.line === kinds('breakdown').at(-1)!.startBar)!.sectionVerdict, /seam/);
  assert.ok(moves.filter(m => m.stage === 'lp').every(m => !m.laid && (/vibes/.test(m.cast) || /seam/.test(m.sectionVerdict))));
  const p = programOf(t);
  assert.deepEqual(p.automation.filter(l => l.param.startsWith('sweep')).map(l => l.param), ['sweep.hp.cutoffHz', 'sweep.hp.wet.gain', 'sweep.hp.dry.gain']);
});

test('S2: over seeds and spells a sweep is laid only where its gates let it, one at a time, clear of the seams, and never under house-v1 or a driving kick', () => {
  const SPELLS = [HOUSE, { ...HOUSE, ember: 0.14, veil: 0.34, spark: 0, loom: 0.81 }, { ...HOUSE, ember: 0.75, spark: 0.3 }];
  const counts = [0, 0, 0];
  SPELLS.forEach((spell, k) => {
    for (let seed = 1; seed <= 30; seed++) for (let n = 0; n < 3; n++) {
      const t = planTheme(seed, n, { strategy: 'house-v2', spell });
      const input = { style, spell, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes };
      const laid = sweepsOf({ ...input, swells: swellsOf(input) }).filter(m => m.laid);
      counts[k] += laid.length;
      const at = `${seed}#${n}`;
      laid.forEach((m, i) => {
        assert.ok(m.bar >= 16 && m.bar + m.bars <= Math.floor(t.bars * style.set.seamFloor), `${at} ${m.kind}@${m.bar}: inside a seam`);
        if (i) assert.ok(m.bar >= laid[i - 1].bar + laid[i - 1].bars, `${at}: two sweeps on the bus at once`);
        const s = t.arrangement.sections.find(x => m.line >= x.startBar && m.line < x.startBar + x.bars)!;
        if (m.kind === 'entry') {
          assert.ok(!['drop', 'outro'].includes(s.kind) && m.stage === 'hp', `${at} entry into a ${s.kind}`);
          assert.ok(!(t.timeline[m.line].layers.includes('kick') && !t.timeline[m.line - 1].layers.includes('kick')), `${at}: an entry on the kick's return`);
        }
        if (m.kind === 'exit') assert.equal(s.kind, 'breakdown', `${at}: a close into a ${s.kind}`);
        if (m.kind === 'breath') for (let b = m.bar; b < m.bar + m.bars; b++) assert.ok(!t.timeline[b].layers.includes('kick'), `${at}: a breath over the kick`);
      });
      const lines = programOf(t).automation.filter(l => l.param.startsWith('sweep'));
      assert.equal(lines.length, (laid.some(m => m.stage === 'hp') ? 3 : 0) + (laid.some(m => m.stage === 'lp') ? 3 : 0), `${at}: a stage built with no move on it`);
    }
  });
  // Measured 09-25 over seeds 1-30 x 3: the house sweeps now and then, the ambient spell more, a driving kick never.
  assert.ok(counts[0] > 0 && counts[1] > counts[0] && counts[2] === 0, `sweeps by spell: ${counts.join(' / ')}`);
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++)
    assert.ok(!planTheme(seed, n, { style: v1, preset: 'auto' }).automation.sweep, `house-v1 ${seed}#${n} carries a sweep`);
  assert.equal((style.switches as Record<string, boolean>).busSweeps, true);
});

// The review of 10-08, B11: two moves end to end on one stage were laid as two, the first's let-go after the
// second's engage, so the lines stepped back in time and the engine, which sorts them, played the second entry's
// high-pass with the wet at nought; two lifted sections side by side dipped to unity for a second at their line.
test('B11: moves end to end on a stage chain and lifted sections side by side are one lift: no sweep or lift line steps back in time, and the wet holds on a chained line', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const still = { ...HOUSE, ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 };
  const back = (pts: { t: number }[]) => pts.findIndex((p, i) => i > 0 && p.t < pts[i - 1].t - 1e-9);
  const valueAt = (pts: { t: number; value: number }[], t: number) => {
    let v = pts[0].value;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].t > t) { const a = pts[i - 1], b = pts[i]; return b.t > a.t ? a.value + (b.value - a.value) * (t - a.t) / (b.t - a.t) : v; }
      v = pts[i].value;
    }
    return v;
  };
  let chained = 0, joined = 0;
  for (const spell of [bench, still]) for (let seed = 1; seed <= 12; seed++) for (let n = 0; n < 2; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell });
    const at = `${seed}#${n}`;
    const input = { style, spell, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes };
    const laid = sweepsOf({ ...input, swells: swellsOf(input) }).filter(m => m.laid);
    for (const stage of ['hp', 'lp'] as const) {
      const c = t.automation.sweep?.[stage];
      if (!c) continue;
      assert.equal(back(c.cutoff), -1, `${at} ${stage}: the corner steps back in time`);
      assert.equal(back(c.wet), -1, `${at} ${stage}: the wet steps back in time`);
      for (const m of laid.filter(m => m.stage === stage)) if (m.kind !== 'exit' && laid.some(x => x.stage === stage && x.bar === m.bar + m.bars)) {
        chained++;
        const line = (m.bar + m.bars) * t.barSeconds;
        for (const dt of [-0.05, 0, 0.05]) assert.equal(valueAt(c.wet, line + dt), 1, `${at} ${stage}: the wet leaves the chained line at bar ${m.bar + m.bars}`);
      }
    }
    assert.equal(back(t.automation.melodicGain), -1, `${at}: the lift steps back in time`);
    t.arrangement.sections.forEach((s, i, all) => { if (s.lift && all[i + 1]?.lift) joined++; });
  }
  assert.ok(chained > 0 && joined > 0, `${chained} chained lines, ${joined} lifted pairs`);
});

// The review of 10-08, B1: the fast places' bed is held in a band where nothing lifts and thinned where a section
// lifts (`BedEntry.bandHz`, `thinHz`, `darkHz`), a hold a section; laid one by one, each played as a sweep from the
// open corner down over its whole section, with the wet at nought for 100 ms on every line.
test('B1: a fast place\'s held band holds through each section and across its lines: the corner at the section\'s own value, the wet at one', () => {
  const tile = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.60, root: 0.75, veil: 0.60, spark: 0.85, loom: 0.85 };
  const valueAt = (pts: { t: number; value: number }[], t: number) => {
    let v = pts[0].value;
    for (let i = 1; i < pts.length; i++) { if (pts[i].t > t) { const a = pts[i - 1], b = pts[i]; return a.value + (b.value - a.value) * (t - a.t) / (b.t - a.t); } v = pts[i].value; }
    return v;
  };
  let lines = 0;
  for (let seed = 1; seed <= 6; seed++) for (let n = 0; n < 2; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell: tile });
    const at = `${seed}#${n}`;
    const sw = t.automation.sweep!;
    assert.ok(sw?.hp && sw?.lp, `${at}: no held band`);
    for (const stage of ['hp', 'lp'] as const) {
      const c = sw[stage]!;
      for (const k of ['cutoff', 'wet'] as const) assert.ok(c[k].every((p, i) => !i || p.t >= c[k][i - 1].t - 1e-9), `${at} ${stage}.${k} steps back in time`);
      for (const s of t.arrangement.sections) {
        const a = s.startBar * t.barSeconds, b = (s.startBar + s.bars) * t.barSeconds;
        const want = c.cutoff.find(p => p.t >= a - 1e-9 && p.t <= a + 0.2 + 1e-9 && p.value < 20000 && p.value > 30)?.value ?? valueAt(c.cutoff, a + 0.2);
        for (const x of [0.25, 0.5, 0.9]) assert.ok(Math.abs(valueAt(c.cutoff, a + x * (b - a)) - want) < 1e-6, `${at} ${stage}: the corner moves inside the ${s.kind} at ${s.startBar}`);
        if (s.startBar > 0) { lines++; for (const dt of [-0.05, 0, 0.05]) assert.equal(valueAt(c.wet, a + dt), 1, `${at} ${stage}: the wet leaves the line at bar ${s.startBar}`); }
      }
    }
  }
  assert.ok(lines > 50, `${lines} lines`);
});
