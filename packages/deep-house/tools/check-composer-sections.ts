// check-composer, shard 3 of 4 (sections): the composer's holes within the locks, as `check-composer-common.ts` says.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planTheme, Rng, programOf, interpretWants, laneLevelDb, ROOM_OFF_DB, silentRuns, readFileSync, makeArrangement, cutMainsFirst, mainsApart, style, v1, HOUSE, biasFor, soloPlace, soloEvents, soloCeiling, soloMinBars, SOLO_MIN_MINUTES, SOLO_POP_DB, SOLO_SECTION_BARS, v2, houseTables,
} from './check-composer-common.ts';
import type { Section, Plan } from './check-composer-common.ts';

test('S2: a glue noise comes in and goes out by a curve by the spell\'s side — a beat on the slow side, an eighth on a steady four, its edges under a driving kick — and 21323\'s ambient breakdown sweep rises over a beat an octave lower and 6 dB down', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  // The fades' own rule, with round S14's gates off: since S14 a slow spell
  // and the house's dark casts have no noise glue at all, so the curves are
  // asked of the glue the lead-ins place before the gates take it.
  const ungated = { ...style, switches: { ...(style.switches as Record<string, boolean>), glueGates: false } };
  const t = planTheme('21323', 0, { style: ungated as typeof style, preset: 'auto', spell: bench });
  // Its breakdown was at bar 56, at 68 once round S4 shortened the theme, at
  // 52 since round S19 cut its main, and at 48 since round L1 gave the theme
  // its minutes (72 bars; restated in the merge round, Reconcile 1), and at 52
  // since L2's Loom (80 bars): restated by the rule, its first breakdown.
  const into = t.arrangement.sections.find(x => x.kind === 'breakdown')!.startBar;
  const sweep = t.events.find(e => e.layer === 'fx' && e.voice === 'sweepDown' && e.bar === into)!;
  assert.ok(Math.abs(sweep.p.attack - t.beat) < 1e-9 && sweep.p.top === 4500, `the sweep at ${into} rises over ${sweep.p.attack} s from ${sweep.p.top} Hz`);
  assert.ok(Math.abs(sweep.p.gain - 0.45 * Math.pow(10, -6 / 20)) < 1e-9, 'and 6 dB down on a line with no drums');
  const SPELLS: Array<[typeof HOUSE, number | null]> = [[HOUSE, 0.5], [bench, 1], [{ ...HOUSE, ember: 0.75, spark: 0.3 }, null]];
  const SHAPES: Record<string, string[]> = { sweepDown: ['attack'], swell: ['release'], riser: ['release'] };
  for (const [spell, beats] of SPELLS) for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const p = planTheme(seed, n, { style: ungated as typeof style, preset: 'auto', spell });
    for (const e of p.events.filter(e => e.layer === 'fx')) {
      const keys = SHAPES[e.voice] ?? [];
      for (const k of ['attack', 'release']) {
        if (beats == null || !keys.includes(k)) assert.equal(e.p[k], undefined, `${seed}#${n} ${e.voice} at ${e.bar} writes ${k}`);
        else assert.ok(Math.abs(e.p[k] - beats * p.beat) < 1e-9, `${seed}#${n} ${e.voice} at ${e.bar}: ${k} ${e.p[k]} for ${beats} beats`);
      }
    }
  }
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++)
    assert.ok(!planTheme(seed, n, { style: v1, preset: 'auto' }).events.some(e => e.layer === 'fx' && (e.p.attack != null || e.p.release != null || e.p.top != null)), `house-v1 ${seed}#${n} shapes its glue`);
  assert.equal((style.switches as Record<string, boolean>).glueFades, true);
});

// Round S3 of the composer (`src/solo.ts`): the whistle comes up where it is
// alone with the bass (`sparseTexture`), and the bass's solo at the arc
// (`bassSolo`), written off until Eugene had heard it and on since S17.
test('S3: the benchmark\'s whistle comes up 4 dB and half again its index only where it is alone with the bass, and only on the slow side', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const t = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const tex = t.events.filter(e => e.role === 'texture');
  const up = tex.filter(e => e.p.immersed > 0.9 + 1e-9);
  // (72, 128, 144, 152, 160 and 168 before round S19 cut the mains; 48, 96,
  // 112, 120, 128 and 136 before round L1 made the theme 104 bars, whose
  // whistle stops at bar 80 and whose last bass-and-vibes bars carry none.
  // Restated in the merge round, Reconcile 1.)
  // Restated in round L3 by the rule, since the form counted in time moves
  // the bars (48 until L3): a texture note is lifted exactly where, over its
  // two bars, nothing sustained and nothing of the grid sounds and at most one
  // melodic part plays over the bass — and theme 3 has such bars.
  const roleOf = (layer: string) => style.lanes.find(l => l.gate === layer)?.role ?? '';
  const PERC = ['kick', 'offbeat', 'sixteenth', 'backbeat'];
  const alone = (bar: number) => {
    const ls = [...new Set(t.events.filter(e => e.role !== 'texture' && e.layer !== 'fx' && e.bar != null && e.bar >= bar && e.bar < bar + 2).map(e => e.layer))];
    return !ls.some(l => PERC.includes(roleOf(l)) || roleOf(l) === 'sustained') && ls.filter(l => l !== 'bass' && !PERC.includes(roleOf(l))).length <= 1;
  };
  assert.ok(up.length > 0, 'theme 3 lifts no bar');
  assert.deepEqual(up.map(e => e.bar), tex.filter(e => alone(e.bar!)).map(e => e.bar), 'the bars with no pad, no drums and only the vibes over the bass');
  for (const e of up) { assert.ok(Math.abs(e.p.immersed - 0.9 * Math.pow(10, 4 / 20)) < 1e-9); assert.ok(Math.abs(e.p.indexMul - 0.09) < 1e-9); }
  for (const e of tex.filter(e => !up.includes(e))) assert.ok(e.p.immersed === 0.9 && e.p.indexMul === 0.06, `bar ${e.bar} is lifted with the pad sounding`);
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    assert.ok(!planTheme(seed, n, { strategy: 'house-v2', spell: HOUSE }).events.some(e => e.role === 'texture' && (e.p.indexMul ?? 0) > 0.06 + 1e-9), `${seed}#${n}: a lift under the house`);
    assert.ok(!planTheme(seed, n, { style: v1, preset: 'auto' }).events.some(e => e.role === 'texture' && (e.p.indexMul ?? 0) > 0.06 + 1e-9), `house-v1 ${seed}#${n} lifts its texture`);
  }
});

test('S7: the bass solo, on since S17, is the theme\'s own figure ornamented — every hit on its step, pops of an octave or two that peak around the golden point, struck and never glided, velocity as contrast, home on the line or a run into the next groove; never with drums, and switched off for the test the figure is the plan\'s', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const on = style;
  const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), bassSolo: false } };
  const shapes: string[] = [];
  // Restated in round S24: the gate is minutes at the tempo the theme plays
  // (`SOLO_MIN_MINUTES`, 4.3, 108 bars at the house's 100 BPM), since L1 made
  // a theme's length minutes and left the slow side's themes under 108 bars.
  // The cases are themes that solo under the benchmark's spell: 1 #2, 13 #3,
  // 20 #3, 35 #3, and the benchmark's own 27191 #6. Since S24 the solo keeps
  // the figure's own last note where it is held over the line, so the check
  // that nothing outside the solo moves is asked of every theme that solos.
  let twoOctaves = 0;
  for (const [seed, n] of [['1', 1], ['13', 2], ['20', 2], ['35', 2], ['27191', 5]] as const) {
    const a = planTheme(seed, n, { style: off, preset: 'auto', spell: bench, library: [] });
    const b = planTheme(seed, n, { strategy: 'house-v2', spell: bench, library: [] });
    const solo = b.events.filter(e => e.layer === 'bass' && e.p.knobs && e.p.knobs.brightnessHz);
    const from = Math.min(...solo.map(e => e.bar!)), to = Math.max(...solo.map(e => e.bar!)) + 1;
    const figure = a.events.filter(e => e.layer === 'bass' && e.bar! >= from && e.bar! < to);
    // the skeleton: the same hits on the same steps, each at its own pitch or an octave or two over it
    assert.deepEqual(solo.map(e => e.t), figure.map(e => e.t), `${seed}#${n}: the solo's hits are not the figure's`);
    const pops = solo.map((e, i) => e.p.midi - figure[i].p.midi);
    assert.ok(pops.every(d => [0, 12, 24].includes(d)), `${seed}#${n}: a displacement that is not an octave: ${[...new Set(pops)].join(',')}`);
    // 27191 #6's figure pops from 34 and 39 round its golden point, and two
    // octaves over either is above the sub's ceiling (`soloCeiling`, 54): its
    // peak is one octave, the ceiling's and not the arc's (S24)
    const ceiling = soloCeiling(style.base.register);
    assert.ok(solo.every(e => e.p.midi <= ceiling), `${seed}#${n}: a pop over the ceiling`);
    // Restated in the MIX-X1/X2 merge (10-02): house-v2 draws the next key on
    // the wheel, so 1 #2's figure sits where 27191 #6's did — a two-octave
    // pop is asked only where a hit of the figure has two octaves of room
    // under the ceiling, the rule 27191 was the one case of.
    // (1 #2 has the room and draws none since the key draw: the draw decides,
    // so the two-octave pop is asked of the cases together, not of each.)
    if (pops.some(d => d === 24)) twoOctaves++;
    assert.ok(pops.filter(d => d > 0).length >= figure.length / 5, `${seed}#${n}: ${pops.filter(d => d > 0).length} pops of ${figure.length} hits`);
    if (seed === '27191') assert.ok(twoOctaves >= 1, 'no soloing theme pops two octaves');
    // Since round S15 nothing in the solo slides: no glide into a pop, none
    // out of it and none of the figure's own (Eugene: the slides "don't sound
    // like bass"), and a pop is S7's staccato, under 0.7 of its gap.
    assert.ok(solo.every(e => !e.p.slideFrom && e.p.slideTime == null), `${seed}#${n}: a note of the solo glides`);
    assert.ok(SOLO_POP_DB <= -5.5, 'a two-octave pop is taken back less than half again (S22)');
    // round S22: a pop is taken back 5.5 dB an octave against its figure note
    // (11 dB two octaves up: half again what S7's 2.5 an octave took), a note
    // at the root register untouched
    solo.forEach((e, i) => {
      const want = Math.pow(10, (SOLO_POP_DB * pops[i]) / 12 / 20);
      if (!pops[i]) return;
      assert.ok(Math.abs((e.p.gain ?? 1) / (figure[i].p.gain ?? 1) - want) < 1e-9, `${seed}#${n} bar ${e.bar}: a pop of ${pops[i]} at ${(20 * Math.log10((e.p.gain ?? 1) / (figure[i].p.gain ?? 1))).toFixed(2)} dB`);
      if (i + 1 < solo.length) assert.ok(e.p.dur <= 0.7 * (solo[i + 1].t - e.t) + 1e-9, `${seed}#${n} bar ${e.bar}: a pop that is not staccato`);
    });
    assert.ok(solo.every(e => [1, 0.8, 0.45].includes(e.p.vel)), `${seed}#${n}: a velocity that is not an accent, a middle or a ghost`);
    // a ghost needs a bar of three hits or more (the rank's last third); since
    // round S19 cut its mains, 21323 #3's solo sits on a figure of one and two
    const dense = [...new Set(solo.map(e => e.bar))].some(bar => solo.filter(e => e.bar === bar).length >= 3);
    assert.ok((!dense || solo.some(e => e.p.vel === 0.45)) && solo.some(e => e.p.vel === 1) && new Set(solo.map(e => e.p.vel)).size >= 2, `${seed}#${n}: no contrast`);
    // the envelope: the two-octave pops sit round the golden point, none in the first bar or the last two
    const golden = from + Math.round((to - from) * 0.618);
    solo.forEach((e, i) => { if (pops[i] === 24) assert.ok(Math.abs(e.bar! - golden) <= 4, `${seed}#${n}: a two-octave pop at ${e.bar}, the golden point ${golden}`); });
    solo.forEach((e, i) => { if (e.bar === from || e.bar! >= to - 2) assert.equal(pops[i], 0, `${seed}#${n}: a pop at ${e.bar}, where the arc is home`); });
    // it ends at the line, or where the figure's own last note ends past it (S24)
    assert.ok(solo.at(-1)!.t + solo.at(-1)!.p.dur <= Math.max(to * b.barSeconds, figure.at(-1)!.t + figure.at(-1)!.p.dur) + 1e-6, `${seed}#${n}: it runs past the line`);
    assert.ok(!b.events.some(e => e.layer === 'bass' && e.bar === from - 1), `${seed}#${n}: no rest before it`);
    assert.deepEqual(b.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi]), a.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi]), `${seed}#${n}: something outside the solo moved`);
    shapes.push(`${seed}#${n} ${from}-${to - 1}: ${pops.filter(d => d === 12).length} octave and ${pops.filter(d => d === 24).length} two-octave pops of ${figure.length}`);
  }
  // The slide: a solo told a groove follows runs down the scale over the last two beats into its first note (the benchmark's until round L1, 1 #2's since).
  const plan = planTheme('1', 1, { style: off, preset: 'auto', spell: bench });
  const place = soloPlace({ style: on, spell: bench, bars: plan.bars, barSeconds: plan.barSeconds, beat: plan.beat, arrangement: plan.arrangement, events: plan.events, lanes: style.lanes })!;
  const into = plan.events.find(e => e.layer === 'bass' && e.bar === place.from)!;
  const groove = { ...into, t: place.to * plan.barSeconds, bar: place.to, step: 0, p: { ...into.p, midi: 30 } };
  const arrangement = { ...plan.arrangement, sections: plan.arrangement.sections.map(x => x.startBar === place.to ? { ...x, kind: 'drop' } : x) };
  const r = soloEvents({ style: on, spell: bench, bars: plan.bars, barSeconds: plan.barSeconds, beat: plan.beat, arrangement, events: [...plan.events, groove], lanes: style.lanes,
    scale: plan.key.scale, root: plan.key.root, progression: plan.progression, ceiling: soloCeiling(style.base.register) }, place);
  assert.equal(r.ending, 'slide');
  const run = r.events.filter(e => e.layer === 'bass' && e.t >= place.to * plan.barSeconds - 2 * plan.beat - 1e-6 && e.t < place.to * plan.barSeconds);
  assert.ok(run.length >= 2, `a run of ${run.length} notes`);
  for (let k = 1; k < run.length; k++) assert.ok(run[k].p.midi < run[k - 1].p.midi, 'the run goes down');
  assert.ok(run.at(-1)!.p.midi > 30 && run.at(-1)!.p.midi - 30 <= 3, `the run ends on ${run.at(-1)!.p.midi}, a step over the groove's 30`);
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++)
    assert.ok(!planTheme(seed, n, { style: on, preset: 'auto', spell: HOUSE }).events.some(e => e.p.knobs && e.p.knobs.brightnessHz), `${seed}#${n}: a solo in a drummed house theme`);
  assert.equal((style.switches as Record<string, boolean>).bassSolo, true);
  assert.ok(!plan.events.some(e => e.p.knobs), 'a solo with the switch off');
  assert.ok(planTheme('1', 1, { strategy: 'house-v2', spell: bench }).events.some(e => e.p.knobs && e.p.knobs.brightnessHz), 'the shipped house-v2 plays no solo on 1 #2 under the benchmark\'s spell');
  assert.ok(shapes.length === 5, shapes.join('; '));
  // Round S24: the gate is minutes at the played tempo, on the four-bar grid,
  // and the house's own tempo asks the 108 bars S17's population was counted at.
  assert.equal(soloMinBars(100), 108, 'the house\'s 100 BPM asks 108 bars');
  assert.equal(soloMinBars(50), 56, '50 BPM asks 53.75 bars, 56 on the grid');
  assert.equal(SOLO_MIN_MINUTES, 4.3);
  // Every theme that solos (seeds 1-40 x 3 and the benchmark's twelve, under
  // its spell) is at the minutes at its own tempo, and nothing outside its
  // solo moves: S21's bed after it starts where it does without the solo.
  let soloing = 0;
  const themes: Array<[string, number]> = [];
  for (let seed = 1; seed <= 40; seed++) for (let n = 0; n < 3; n++) themes.push([String(seed), n]);
  for (let n = 0; n < 12; n++) themes.push(['27191', n]);
  for (const [seed, n] of themes) {
    const b = planTheme(seed, n, { strategy: 'house-v2', spell: bench, library: [] });
    const solo = b.events.filter(e => e.layer === 'bass' && e.p.knobs && e.p.knobs.brightnessHz);
    if (!solo.length) continue;
    soloing++;
    assert.ok(b.bars >= soloMinBars(240 / b.barSeconds) && b.bars * b.barSeconds / 60 >= SOLO_MIN_MINUTES - 1e-9, `${seed}#${n}: a solo in ${b.bars} bars at ${b.bpm} BPM`);
    const a = planTheme(seed, n, { style: off, preset: 'auto', spell: bench, library: [] });
    const from = Math.min(...solo.map(e => e.bar!)), to = Math.max(...solo.map(e => e.bar!)) + 1;
    assert.deepEqual(b.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi, e.p.dur]), a.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi, e.p.dur]), `${seed}#${n}: something outside the solo moved`);
  }
  assert.ok(soloing >= 5, `${soloing} themes solo`);
  assert.ok(planTheme('27191', 5, { strategy: 'house-v2', spell: bench }).events.some(e => e.p.knobs && e.p.knobs.brightnessHz), 'the benchmark plays no solo under its own spell');
});

// Round S4 (Eugene, 09-25): house-v2's themes a fifth shorter and its mix later.
test('S4: house-v2\'s themes are a fifth shorter with the same tempo, key, cast and progression, its seams start at or after 0.82 of the theme with the blend inside it, and house-v1\'s set is the record\'s', () => {
  assert.deepEqual([...style.set.themeBarPercentiles], [64, 96, 116, 132, 196]);
  assert.equal(style.set.themeBarsMin, 52); assert.equal(style.set.themeBarsMax, 208); assert.equal(style.set.seamFloor, 0.82);
  assert.deepEqual([...v1.set.themeBarPercentiles], [79, 118, 145, 167, 247]);
  assert.equal(v1.set.themeBarsMax, 256); assert.equal(v1.set.seamFloor, 0.75); assert.ok(!('seamLineInside' in v1.set));
  // Restated in the merge round of L1 (Reconcile 1): since L1 house-v2's
  // length is minutes from the birds (`themeMinutes`) and the table is only the
  // ladder the seed's place is read on, so the fifth is the table's and is
  // asked of the table's own path (`themeMinutes: false` on both sides); the
  // shipped style keeps the tempo, key, cast and progression and its seams.
  const old = { ...style, set: { ...style.set, themeBarPercentiles: [79, 118, 145, 167, 247], themeBarsMin: 64, themeBarsMax: 256, themeMinutes: false } };
  const table = { ...style, set: { ...style.set, themeMinutes: false } };
  assert.equal(style.set.themeMinutes, true);
  let themes = 0, before = 0, after = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const a = planTheme(seed, n, { style: old, preset: 'auto' }), b = planTheme(seed, n, { style, preset: 'auto' }), c = planTheme(seed, n, { style: table, preset: 'auto' });
    for (const k of ['bpm', 'key', 'preset'] as const) assert.deepEqual(b[k], a[k], `${seed}#${n}: the ${k} moved`);
    const dice = (t: Plan) => { const d = { ...t.dice } as Record<string, unknown>; delete d.form; return d; };
    assert.deepEqual(dice(b), dice(a), `${seed}#${n}: a die moved`);
    assert.deepEqual(b.progression.chords.map(c => c.voicing), a.progression.chords.map(c => c.voicing), `${seed}#${n}: the progression moved`);
    assert.ok(c.bars >= 52 && c.bars <= 208 && c.bars <= a.bars, `${seed}#${n}: ${a.bars} -> ${c.bars} bars`);
    themes++; before += a.bars; after += c.bars;
    const p = programOf(b);
    if (p.seam) {
      const floor = b.bars * 0.82;
      if (p.seam.bars >= 4) assert.ok(p.seam.bar >= floor - 1e-9 || b.arrangement.sections.some(s => s.startBar === p.seam!.bar), `${seed}#${n}: the seam at ${p.seam.bar} of ${b.bars}, before 0.82`);
      assert.ok(p.seam.bar + p.seam.bars <= b.bars, `${seed}#${n}: the blend runs past the theme`);
    }
  }
  // Measured 09-25: seeds 1-20 x 3, the mean length falls by about a fifth.
  assert.ok(after / before < 0.86 && after / before > 0.74, `${themes} themes, ${before} -> ${after} bars (${(after / before).toFixed(3)})`);
});

// Round S6 (the hat analysis of 26925, Eugene: "too metallic"): a hat's
// brightness is short and high, a ring the grid cannot hold is never promoted,
// and the offbeat hat follows its section.
test('S6: no bird can promote a weight-0 hat or one whose ring outlasts the grid; the bright end lands on the crisp hats; 26925\'s spell draws no hatLoose', async () => {
  const { laneWeight, RING_SHARE } = await import('../src/lanes.ts');
  const lanes = style.lanes.filter(l => l.role === 'offbeat');
  const ringMs = (style as any).ringMs as Record<string, number>;
  const share = (lane: typeof lanes[number], spell: typeof HOUSE | null, bpm: number) => {
    const f = laneWeight(lane, biasFor(spell, style), { gridSeconds: 30 / bpm, ringMs, roles: ['offbeat'] });
    const w = lane.voices!.map((e, i) => f(e, i)); const s = w.reduce((a, b) => a + b, 0);
    return Object.fromEntries(lane.voices!.map((e, i) => [String(e.v), w[i] / s]));
  };
  let asked = 0;
  for (const lane of lanes) for (const bpm of [100, 120, 128]) {
    const house = share(lane, HOUSE, bpm);
    for (const gleam of [0, 0.25, 0.5, 0.75, 1]) for (const spark of [0, 0.5, 1]) for (const zephyr of [0, 0.5, 1]) {
      const s = share(lane, { ...HOUSE, gleam, spark, zephyr }, bpm);
      asked++;
      for (const e of lane.voices!) {
        const v = String(e.v);
        if (e.w === 0) assert.equal(s[v], 0, `${lane.id} ${bpm} BPM gleam ${gleam} spark ${spark}: ${v} at weight 0 drawn`);
        if ((ringMs[v] ?? 0) > (30 / bpm) * 1000 * RING_SHARE) assert.ok(s[v] <= house[v] + 1e-9, `${lane.id} ${bpm} BPM gleam ${gleam} spark ${spark}: ${v} rings ${ringMs[v]} ms and rose from ${house[v].toFixed(2)} to ${s[v].toFixed(2)}`);
      }
    }
  }
  // Gleam's bright end: the crisp hats, never the ring.
  const closed = lanes.find(l => l.id === 'offbeat')!;
  const bright = share(closed, { ...HOUSE, gleam: 1 }, 100);
  assert.ok(bright.hatTight > share(closed, HOUSE, 100).hatTight && bright.hatLoose < 0.01, `gleam 1: ${JSON.stringify(bright)}`);
  const t = planTheme('26925', 2, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.49, gleam: 1, spark: 1 }, library: [] });
  assert.ok(!t.events.some(e => e.voice === 'hatLoose'), 'the 26925 spell still draws hatLoose');
  assert.ok(asked > 200);
});

test('S6: the offbeat hat rests in a breakdown\'s first phrase and keeps only the offbeats of beats one and three in its later phrases, an intro\'s first and an outro\'s last; mains, builds and drops untouched; never under house-v1', () => {
  let breakdowns = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell: HOUSE });
    for (const s of t.arrangement.sections) {
      const hats = t.events.filter(e => e.layer === 'hats' && e.bar! >= s.startBar && e.bar! < s.startBar + s.bars);
      const phraseOf = (bar: number) => { let k = 0; s.phrases.forEach((p, i) => { if (p.startBar <= bar) k = i; }); return k; };
      for (const e of hats) {
        const k = phraseOf(e.bar!);
        if (s.kind === 'breakdown') { assert.notEqual(k, 0, `${seed}#${n}: a hat in a breakdown's first phrase at ${e.bar}`); assert.ok([2, 10].includes(e.step!), `${seed}#${n}: a breakdown hat on ${e.step}`); }
        if ((s.kind === 'intro' && k === 0 && s.phrases.length > 1) || (s.kind === 'outro' && k === s.phrases.length - 1 && s.phrases.length > 1)) assert.ok([2, 10].includes(e.step!), `${seed}#${n}: an ${s.kind} hat on ${e.step}`);
      }
      if (s.kind === 'breakdown') breakdowns++;
    }
  }
  assert.ok(breakdowns > 20, `${breakdowns} breakdowns`);
  const a = planTheme(3, 0, { style: v1, preset: 'auto' });
  const bd = a.arrangement.sections.find(s => s.kind === 'breakdown');
  if (bd) assert.ok(a.events.some(e => e.layer === 'hats' && e.bar === bd.startBar), 'house-v1 thins its hats');
  assert.equal((style.switches as Record<string, boolean>).hatSections, true);
  assert.equal((style.switches as Record<string, boolean>).hatRing, true);
});

// Round S8 (the Root analysis of 26925 under ember 0.10): Root moves the bass
// with the drums off — the sub's weight by its `mass` knob on every theme, and
// a drums-off figure and body by Root's band, never a coin — and the ledger
// says the low end changed hands only when it did.
test('S8: Root moves a drums-off bass — mass on the sub, a figure and a body by its band — and a drummed theme only by mass', async () => {
  const { lowEndDiffers } = await import('../src/mix.ts');
  const off = (root: number) => ({ ...HOUSE, ember: 0.10, tide: 1, zephyr: 0, root, gleam: 0, veil: 0 });
  const sel = (t: Plan) => { const c = t.dice.composition as unknown; return ((typeof c === 'string' ? JSON.parse(c) : c) ?? {}).selected ?? {}; };
  // The three variants sit at the ring's own three Root words.
  const { BODY_BANDS } = await import('../src/styles/deep-house-parts.ts');
  const { bandsOf } = await import('../src/bird-labels.ts');
  const bands = bandsOf(style).root;
  assert.deepEqual(bands.map(b => b.word), ['thin', 'full', 'heavy']);
  assert.ok(Math.abs(bands[0].upTo! - BODY_BANDS.full) < 1e-3 && Math.abs(bands[1].upTo! - BODY_BANDS.heavy) < 1e-3, `bands ${bands.map(b => b.upTo)} against ${JSON.stringify(BODY_BANDS)}`);
  const at = [0, 0.7, 1].map(r => planTheme('26925', 2, { style: houseTables, preset: 'auto', spell: off(r), library: [] }));
  const perBar = (t: Plan) => t.events.filter(e => e.layer === 'bass').length / t.bars;
  assert.deepEqual(at.map(t => sel(t)['bass-free'] ?? null), [null, null, 'long-pedal']);
  assert.deepEqual(at.map(t => sel(t)['body-free'] ?? null), [null, null, 'full']);
  // thin and full keep the base figure (the benchmark's bass among them); heavy has more notes
  assert.ok(perBar(at[0]) === perBar(at[1]) && perBar(at[1]) < perBar(at[2]), `notes a bar ${at.map(perBar).map(x => x.toFixed(2)).join(', ')}`);
  const mass = at.map(t => t.knobs?.sub?.mass ?? 1);
  assert.ok(mass[0] < mass[1] && mass[1] < mass[2] && mass[2] > 1.5, `mass ${mass.join(', ')}`);
  // Every step moves the low end, so the ledger says so; the same plan twice does not.
  assert.ok(lowEndDiffers(at[0], at[1]) && lowEndDiffers(at[1], at[2]));
  assert.equal(lowEndDiffers(at[1], planTheme('26925', 2, { strategy: 'house-v2', spell: off(0.7), library: [] })), false);
  // A drummed theme: Root reaches the sub's mass and the figure is the one the drums' families drew.
  const house = [0, 1].map(r => planTheme(1, 0, { strategy: 'house-v2', spell: { ...HOUSE, root: r } }));
  assert.ok(!sel(house[0])['bass-free'] && !sel(house[1])['bass-free'] && (house[0].knobs?.sub?.mass ?? 1) < 1 && (house[1].knobs?.sub?.mass ?? 1) > 1);
  // At the house the knob is at its default and absent: the record's table.
  assert.ok(!planTheme(1, 0, { strategy: 'house-v2', spell: HOUSE }).knobs?.sub?.mass);
  for (let seed = 1; seed <= 10; seed++) assert.ok(!sel(planTheme(seed, 0, { style: v1, preset: 'auto' }))['bass-free'], 'house-v1 draws the drums-off figure');
});

// Round S9 (the review of 09-26, F6: Loom never changed how often a pedal was
// drawn): a long form draws the bass pedal more often, a form of short loops
// none — its bass figure, where it has one, is the short fall.
test('S9: Loom moves how often the bass pedal is drawn — none in its loops band, more at its long end — and the house is the plan it was', async () => {
  const { LOOPS_FORM } = await import('../src/styles/deep-house-parts.ts');
  const { bandsOf } = await import('../src/bird-labels.ts');
  assert.ok(Math.abs(bandsOf(style).loom[0].upTo! - LOOPS_FORM) < 1e-3, `the loops band ends at ${bandsOf(style).loom[0].upTo}, the rule at ${LOOPS_FORM}`);
  const sel = (t: Plan) => { const c = t.dice.composition as unknown; return ((typeof c === 'string' ? JSON.parse(c) : c) ?? {}).selected ?? {}; };
  const rate = (loom: number) => { const c: Record<string, number> = {}; for (let seed = 1; seed <= 60; seed++) for (const n of [0, 1]) { const b = sel(planTheme(seed, n, { strategy: 'house-v2', spell: { ...HOUSE, loom } })).bass ?? 'none'; c[b] = (c[b] ?? 0) + 1; } return c; };
  const low = rate(0), home = rate(HOUSE.loom), high = rate(1);
  assert.equal((low.pedal ?? 0) + (low['long-pedal'] ?? 0), 0, `a pedal under short loops: ${JSON.stringify(low)}`);
  assert.equal(home.pedal, 36, `the house draws ${JSON.stringify(home)}`);
  assert.ok((high['long-pedal'] ?? 0) > (home.pedal ?? 0) && !high.pedal, `Loom 1: ${JSON.stringify(high)}`);
});

// Round S10 (Eugene on S8: "the same deep bass in both"): the sub's mass runs
// from a pure sine (0, Root 0) to an open harmonic body (2, Root 1), and at the
// house it is absent — the record's table.
test('S10: Root sets the sub\'s mass from 0 to 2 on every theme, drums or not, and the house writes none', async () => {
  const { VOICE_KNOBS } = await import('@deep-house/engine/voices');
  const k = VOICE_KNOBS.sub.mass;
  assert.deepEqual([k.min, k.default, k.max, k.bird], [0, 1, 2, 'root']);
  for (const [seed, n, base] of [['26925', 3, { ...HOUSE, ember: 0.10, tide: 1, zephyr: 0, gleam: 0, veil: 0 }], ['1', 0, HOUSE]] as const) {
    const at = (root: number) => planTheme(seed, n, { strategy: 'house-v2', spell: { ...base, root } }).knobs?.sub?.mass;
    assert.equal(at(0), 0, `${seed}#${n}: Root 0 is not the pure sine`);
    assert.equal(at(1), 2, `${seed}#${n}: Root 1 is not the full body`);
  }
  assert.equal(planTheme(1, 0, { strategy: 'house-v2', spell: HOUSE }).knobs?.sub?.mass, undefined);
});

// Round S13 (his link, 26925 theme 4 under em 0.10 ... ro 1.00: 19.6 s of
// silence): the one-harmonic-layer roll plays the layer a section allows where
// it allows only one, and a theme's first phrase always sounds.
test('S13: no theme opens silent under the house, the ambient, a driving and a Tide-1 spell or his link, and the roll never drops the only harmonic layer a section allows', () => {
  const SPELLS = [HOUSE, { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }, { ...HOUSE, ember: 0.75, spark: 0.3 }, { ...HOUSE, tide: 1 },
    { ...HOUSE, ember: 0.10, tide: 1, zephyr: 0, root: 1, gleam: 0, veil: 0 }];
  let themes = 0, sections = 0;
  for (const spell of SPELLS) for (const [seed, n] of [...Array.from({ length: 30 }, (_, s) => [String(s + 1), 0]), ['26925', 1], ['26925', 2], ['26925', 3]] as const) {
    const t = planTheme(seed, n, { strategy: 'house-v2', preset: 'auto', spell });
    themes++;
    const first = Math.min(...t.events.map(e => e.t));
    assert.ok(first < t.barSeconds, `${seed}#${n} at ${JSON.stringify(spell).slice(0, 60)}: the first note at ${first.toFixed(2)} s, bar ${Math.floor(first / t.barSeconds)}`);
    for (const s of t.arrangement.sections) for (const ph of s.phrases) {
      const only = ph.layers.pad && !ph.layers.keys ? 'pad' : ph.layers.keys && !ph.layers.pad ? 'keys' : null;
      if (!only) continue;
      sections++;
      const b = ph.startBar;
      if (b < t.bars) assert.ok(t.timeline[b].layers.includes(only), `${seed}#${n} bar ${b}: the ${s.kind} allows only the ${only} and the roll dropped it`);
    }
  }
  assert.ok(themes >= 150 && sections > 100, `${themes} themes, ${sections} one-layer phrases`);
  assert.equal((style.switches as Record<string, boolean>).openingSound, true);
});

// Round S14 (Eugene on 26925 theme 4's break: the wind "just doesn't belong"):
// the glue's noises play only where the spell or, at the house, the cast is
// bright and driving.
test('S14: the noise glue asks the spell and the cast — 26925 theme 4 at the house has none, a driving spell keeps it, a slow one has none, and the impact and the vinyl bed are not noise glue', async () => {
  const { isNoiseGlue } = await import('../src/glue.ts');
  assert.deepEqual(['riser', 'sweepDown', 'swell', 'sweepUp', 'crash', 'impact', 'vinylBed'].map(isNoiseGlue), [true, true, true, true, true, false, false]);
  const noise = (t: Plan) => t.events.filter(e => e.layer === 'fx' && isNoiseGlue(e.voice)).length;
  assert.equal(noise(planTheme('26925', 3, { strategy: 'house-v2', preset: 'auto' })), 0, '26925 theme 4 keeps its wind');
  const driving = { ...HOUSE, ember: 0.75, spark: 0.3 };
  const bright = planTheme('21323', 1, { strategy: 'house-v2', preset: 'auto', spell: driving });
  assert.ok(noise(bright) > 0, 'the bright driving theme lost its glue');
  let slow = 0;
  for (let seed = 1; seed <= 20; seed++) slow += noise(planTheme(seed, 0, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.14, veil: 0.34, gleam: 0, spark: 0, loom: 0.81 } }));
  assert.equal(slow, 0, 'a slow spell keeps noise glue');
  for (let seed = 1; seed <= 10; seed++) assert.ok(noise(planTheme(seed, 0, { style: v1, preset: 'auto' })) >= 0);
  assert.ok(planTheme(1, 0, { style: v1, preset: 'auto' }).events.some(e => e.layer === 'fx' && isNoiseGlue(e.voice)), 'house-v1 lost its glue');
  assert.equal((style.switches as Record<string, boolean>).glueGates, true);
});

// Round S18: two engine gaps the recipes' audit measured.
// (1) A room's "off" is about its own voice (`laneFloors`): the sub room's clap
// at -60 silenced a broken kit's snare, the growl room's shaker at -60 the
// cabasa, the congas and the tom a row's sixteenth cell drew. (2) A row's
// `wants.stage.treatments` reached a list house-v2's stage never read.
test('S18: a room\'s clap or shaker at -60 is about that voice only — a broken kit\'s snare and a row\'s hand drums read the record\'s level — and a row\'s stage treatments move house-v2\'s stage', () => {
  const row = (f: string) => JSON.parse(readFileSync(new URL(`../recipes/${f}`, import.meta.url), 'utf8'));
  const unghosted = (st: typeof style) => ({ ...st, composition: { ...st.composition, families: st.composition.families.filter(f => f.id !== 'ghost-backbeat') } }) as typeof style;
  const quiet = <T>(fn: () => T): T => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
  const db = (g: number) => 20 * Math.log10(Math.max(g, 1e-9));
  const loudest = (p: any, voices: string[]) => Math.max(-120, ...p.events.filter((e: any) => voices.includes(e.voice)).map((e: any) => db(e.p.gain ?? 1)));
  // the rule itself — every style's since V1-1 (10-02), not a switch of
  // house-v2's, so there is no "off" side to plan against any more: the
  // before (the backbeat buried on every theme, the sixteenth on every growl
  // theme) is S18's own round note, and what is held here is the after.
  assert.equal(laneLevelDb(style, { clap: -60 }, 'clap', 'clap'), -60, 'the room\'s own clap came back on');
  assert.equal(laneLevelDb(style, { clap: -60 }, 'snare', 'clap'), (style.base.levels as any).clap);
  assert.equal(laneLevelDb(style, { shaker: -60 }, 'conga', 'shaker'), (style.base.levels as any).shaker);
  assert.equal(laneLevelDb(style, { clap: -11.5 }, 'snare', 'clap'), -11.5, 'a room that has its clap on moved');
  assert.equal(laneLevelDb(v1, { clap: -60 }, 'snare', 'clap'), (v1.base.levels as any).clap, 'the record reads another rule than house-v2');
  assert.equal(laneLevelDb(v1, { clap: -60 }, 'clap', 'clap'), -60);
  // the backbeat: Drum and Bass's key, a broken kit, every golden theme in the sub room
  const dnb = { ...HOUSE, ember: 0.95, spark: 0.85, zephyr: 0.7, root: 0.6, veil: 0.6 };
  let buried = 0, themes = 0;
  for (const [m, k] of [['1', 6], ['92970', 4], ['21323', 4]] as const) for (let i = 0; i < k; i++) {
    // the kit's own backbeat, before GA4's ghosts ask the lane for the style's level themselves
    // (the fast broken place plays its drier snare row since DNB-2, 10-02, and the liquid kit's crack since 10-06)
    const b = loudest(programOf(planTheme(m, i, { style: unghosted(style), preset: 'auto', spell: dnb, library: [] })), ['snare', 'snareDry', 'snareCrack', 'rimshot']);
    if (b === -120) continue;
    themes++; if (b < ROOM_OFF_DB) buried++;
  }
  assert.ok(themes >= 10 && buried === 0, `the broken kit's backbeat buried on ${buried} of ${themes} themes`);
  // the sixteenth: a row's percussion cell (dnb/two-step asks no presence for
  // it) under the Tech House key, in the growl room
  const bare = row('genres/dnb/two-step.json');
  const tech = { ...HOUSE, ember: 0.7, spark: 0.4, zephyr: 0.6, root: 0.6, tide: 0.45 };
  const SIX = ['cabasa', 'conga', 'bongo', 'tom', 'tambourine', 'cowbell', 'woodblock'];
  let growl = 0, six = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', spell: tech, recipe: bare }));
    if (t.preset !== 'growl') continue;
    const b = loudest(programOf(t), SIX);
    if (b === -120) continue;
    growl++; if (b < ROOM_OFF_DB) six++;
  }
  assert.ok(growl >= 3 && six === 0, `a row's sixteenth buried on ${six} of ${growl} growl themes`);
  // (2) the stage: the sub-room row asks for no treatment at all, and house-v2's stage now hears it
  const sub = row('sub-room.json');
  const plain = { ...sub, wants: { ...sub.wants, stage: { ...sub.wants.stage } } };
  delete plain.wants.stage.treatments;
  const notes = interpretWants(sub, style, biasFor(null, style), { log: null }).notes.filter((x: any) => x.block === 'stage.treatments');
  assert.equal(notes[0]?.state, 'applied');
  let moved = 0, unleaned = 0;
  const sig = (p: any) => JSON.stringify(p.events.map((e: any) => [e.voice, e.p]));
  for (let seed = 1; seed <= 20; seed++) {
    const a = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', recipe: sub }));
    const b = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', recipe: plain }));
    assert.ok(Array.isArray(a.treatmentWeights) && !('treatmentWeights' in b), `${seed}: the lean did not ride on the plan`);
    if (sig(programOf(a)) !== sig(programOf(b))) moved++;
    const { treatmentWeights: _w, ...stripped } = a;
    if (sig(programOf(stripped as any)) === sig(programOf(b))) unleaned++;
  }
  assert.ok(moved >= 15, `the row's treatments moved ${moved} of 20 programs`);
  assert.equal(unleaned, 20, 'the lean on the plan is not all that differs');
});

// 10-13 (his ear on seed 11 at Zephyr: "I only hear hat"): the sixteenths' lean turns a growl room's shaker back on
// in the theme's room (`paramOverrides.levels.shaker`, the record's -9.5), and the presence pass read the bare room
// (`S.levels`, the shaker at -60), so it lifted every shaker some 50 dB to undo an "off" the lane no longer plays at:
// +41 dB over everything, the limiter taking the rest under it. Every pass reads the room as the theme plays it
// (`roomLevels` in generator.ts). An "off" is -60, so its compensation is 40 dB and more over a lane that sounds; the
// part that sets its own level (the liquid keys, `laneLevelDb` taken back off each note) stands under 30.
test('no event carries a room\'s "off" compensation while its lane sounds: the lean\'s shaker at the level it plays at (seed 11 at Zephyr, Tide and the Downtempo tile, seed 34\'s second theme at Zephyr and Gleam)', async () => {
  const { playedAt } = await import('./check-program-guards.ts');
  const { settingsOf } = await import('@deep-house/engine/settings');
  const { BY_NAME } = await import('@deep-house/engine/voices');
  const links = ['seed=11&v=2&spell=ze:0.95', 'seed=11&v=2&spell=ti:0.95', 'seed=11&v=2&spell=em:0.35,ti:0.70,ro:0.55', 'seed=34&v=2&theme=2&spell=ze:0.80,gl:0.80'];
  for (const link of links) {
    const plan = playedAt(link) as any;
    const levels = settingsOf(plan).levels as Record<string, number>;
    assert.ok(levels.shaker > ROOM_OFF_DB && plan.events.some((e: any) => e.layer === 'shaker'), `${link}: not a theme whose room's shaker the lean turned on`);
    const hot = plan.events.filter((e: any) => {
      const lane = laneLevelDb(style, levels, e.voice, BY_NAME[e.voice].level)!;
      return lane > ROOM_OFF_DB && 20 * Math.log10(e.p.gain ?? 1) >= -ROOM_OFF_DB;
    });
    assert.equal(hot.length, 0, `${link}: ${hot.length} events 40 dB or more over a sounding lane (${[...new Set(hot.map((e: any) => e.voice))].join(', ')})`);
  }
});

// Round S19 (Eugene, 09-26: "trim another 15 % on average, and if possible bias
// the trimming toward the longer segments and away from the breaks and
// bridges"): house-v2 draws a theme at its table's length and cuts the
// arrangement to 0.85 of it, the mains first.
test('S19: house-v2 cuts every theme to 0.85 of its drawn length off the mains first — the breakdowns, builds and drops keep their bars, the intro its first phrase, the seam its floor — and house-v1 is not cut', () => {
  assert.equal(style.set.themeTrim, 0.85);
  assert.deepEqual([...style.set.themeTrimBars!], [44, 176]);
  assert.ok(!('themeTrim' in v1.set));
  // Restated in the merge round of L1 (Reconcile 1): since L1 the heard length
  // is minutes from the birds and the arrangement is drawn at that length over
  // 0.85, on the four-bar grid, and cut back to it. So the uncut theme is the
  // same seed drawn at that length and never cut, which is a stated length
  // (`themeBars`, never cut); its tempo, key and cast are the cut one's.
  const uncutOf = (seed: number, n: number, heard: number) => planTheme(seed, n, { style, preset: 'auto', themeBars: Math.ceil(heard / 0.85 / 4) * 4 });
  const kinds = (t: Plan) => { const o: Record<string, number> = {}; for (const x of t.arrangement.sections) o[x.kind] = (o[x.kind] || 0) + x.bars; return o; };
  let before = 0, after = 0, mains = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const b = planTheme(seed, n, { style, preset: 'auto' }), a = uncutOf(seed, n, b.bars);
    assert.ok(b.bars >= 44 && b.bars <= 176 && b.bars % 4 === 0, `${seed}#${n}: ${b.bars} bars`);
    for (const k of ['bpm', 'key', 'preset'] as const) assert.deepEqual(b[k], a[k], `${seed}#${n}: the ${k} moved`);
    const ka = kinds(a), kb = kinds(b);
    for (const k of ['breakdown', 'build', 'drop', 'intro']) assert.equal(kb[k] ?? 0, ka[k] ?? 0, `${seed}#${n}: the ${k}s lost bars (${ka[k]} -> ${kb[k]})`);
    // an outro never loses a bar, and a theme cut under 96 bars grows a drawn
    // four-bar outro to the eight its short form keeps (R38), off the mains
    assert.ok((kb.outro ?? 0) >= (ka.outro ?? 0), `${seed}#${n}: the outro lost bars`);
    for (const x of b.arrangement.sections) if (x.kind === 'main') assert.ok(x.bars >= 16 || a.arrangement.sections[x.index].bars === x.bars, `${seed}#${n}: a main cut to ${x.bars}`);
    before += a.bars; after += b.bars; mains += (ka.main ?? 0) - (kb.main ?? 0);
  }
  // Measured 09-26: 7184 -> 6104 bars (0.850), every bar of it off the mains;
  // 10-01, on L1's minutes: 8212 -> 6876 (0.837, the drawn length rounded up
  // to its four-bar grid), the mains 1372 of the 1336 (the outros grew).
  assert.ok(after / before > 0.83 && after / before < 0.87, `${before} -> ${after} bars (${(after / before).toFixed(3)})`);
  assert.ok(mains / (before - after) >= 0.8, `the mains carried ${mains} of ${before - after} bars`);
  const bench = planTheme('27191', 2, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 } });
  assert.equal(bench.bars, 112, 'the benchmark\'s theme 3: 192 bars before S19, 164 after it, 104 since L1, 112 since L2\'s Loom');

});

// Round L2 (Eugene of 27191: "those pads were making the track diverse —
// reducing the length by increasing repetitive main segments is actually a
// less interesting scenario"): the cut takes the repeats first and the variety
// last, by a rule on the texture each main's harmonic roll gives it.
test('L2: the cut takes its bars off the mains whose texture another main shares, longest first and the later of two alike, then off the theme\'s only textures, an open one never under the section a solo asks where the theme may solo; the breakdowns, builds and drops after every main, as S19 had them; without a rule, every main is a repeat', () => {
  const order = ['intro', 'groove', 'breakdown', 'groove', 'build', 'drop', 'groove', 'outro'];
  const texture = (i: number) => ({ 1: { key: 'held+figure', open: false }, 3: { key: 'held+figure', open: false }, 6: { key: 'open+figure', open: true } } as Record<number, { key: string; open: boolean }>)[i];
  const cut = (n: number, soloBars: number | null) => { const b = [8, 32, 16, 32, 8, 8, 32, 8]; cutMainsFirst(order, b, n, soloBars == null ? null : { texture, soloBars }); return b; };
  // the two alike give first: the later of two of a length, then the longer, down to their floor
  assert.deepEqual(cut(8, 24), [8, 32, 16, 24, 8, 8, 32, 8], 'the second of two alike gives first');
  assert.deepEqual(cut(32, 24), [8, 16, 16, 16, 8, 8, 32, 8], 'the repeats give everything before the only texture gives a bar');
  // then the open main, down to the solo's section where the theme may solo, then the breakdowns
  assert.deepEqual(cut(40, 24), [8, 16, 16, 16, 8, 8, 24, 8]);
  assert.deepEqual(cut(48, 24), [8, 16, 8, 16, 8, 8, 24, 8], 'past the solo\'s section the breakdowns, builds and drops give, as S19 had them');
  assert.deepEqual(cut(48, 0), [8, 16, 16, 16, 8, 8, 16, 8], 'where the theme may not solo the open main gives down to its floor');
  // no rule: S19's cut, every main a repeat, longest first
  assert.deepEqual(cut(40, null), [8, 24, 16, 16, 8, 8, 16, 8]);
  assert.equal(SOLO_SECTION_BARS, 24);
  // On the plans: under the benchmark's spell, 27191 #6's open first main
  // keeps the section its solo asks, and its solo is the whole sixteen bars.
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const six = planTheme('27191', 5, { strategy: 'house-v2', spell: bench });
  const solo = six.events.filter(e => e.layer === 'bass' && e.p.knobs && e.p.knobs.brightnessHz);
  const main = six.arrangement.sections.find(x => x.kind === 'main' && x.startBar <= solo[0].bar! && solo[0].bar! < x.startBar + x.bars)!;
  assert.ok(main.bars >= SOLO_SECTION_BARS && Math.max(...solo.map(e => e.bar!)) + 1 - Math.min(...solo.map(e => e.bar!)) === 16, `a solo of ${main.bars}-bar main`);
});

// Round S25 (Eugene of 27191's third theme: "the solo comes at the very end,
// after two main segments one after another"): two mains alike never stand
// side by side; where the open main lands stays the draw's.
test('S25: a main after a main of its own texture gets a breakdown at its floor between them (a build where a drop follows), off the longer and the later of two of a length, or the two merge where neither can give, and two mains of different textures stay side by side; over the corpus\'s runs no two mains alike stand side by side, and 27191\'s third theme keeps its solo where the draw put it', () => {
  // textures by drawn index: one open main where asked, every other main padded and alike
  const ruleOpen = (open: number) => ({ texture: (i: number) => ({ key: i === open ? 'open' : 'held', open: i === open }), soloBars: 24 });
  const part = (order: string[], bars: number[], open = -1) => { const o = order.slice(), b = bars.slice(), r = order.map((_, i) => i); mainsApart(o, b, r, ruleOpen(open), order.length); return { o, b, r }; };
  // off the longer, at the floor, the inserted section on a roll of its own; a build where a drop follows the second
  assert.deepEqual(part(['intro', 'groove', 'groove', 'outro'], [4, 32, 24, 8]), { o: ['intro', 'groove', 'breakdown', 'groove', 'outro'], b: [4, 24, 8, 24, 8], r: [0, 1, 4, 2, 3] });
  assert.deepEqual(part(['intro', 'groove', 'groove', 'drop', 'outro'], [4, 24, 32, 8, 8]).o, ['intro', 'groove', 'build', 'groove', 'drop', 'outro']);
  // of two of a length the later gives; the other where the longer cannot keep 16
  assert.deepEqual(part(['intro', 'groove', 'groove', 'outro'], [4, 24, 24, 8]).b, [4, 24, 8, 16, 8]);
  assert.deepEqual(part(['intro', 'groove', 'groove', 'outro'], [4, 24, 20, 8]).b, [4, 16, 8, 20, 8]);
  // neither can: the two merge on the first's roll
  assert.deepEqual(part(['intro', 'groove', 'groove', 'outro'], [4, 16, 20, 8]), { o: ['intro', 'groove', 'outro'], b: [4, 36, 8], r: [0, 1, 3] });
  // two textures side by side are a progression and stay; the open main keeps its 24
  assert.deepEqual(part(['intro', 'groove', 'groove', 'outro'], [4, 32, 24, 8], 2).b, [4, 32, 24, 8]);
  // The rule reads the roll's texture, which a plan does not carry (a lead
  // entry adds the figure late, an opening sound the drone), so the
  // arrangement is laid off the corpus directly, a texture die per drawn
  // section, at the house's window and at the benchmark's: no two mains alike
  // stand side by side, and every section keeps the roll it was drawn with.
  const touching: string[] = [];
  const keys = ['held', 'held+figure', 'open+figure', 'open'];
  for (let k = 0; k < 400; k++) {
    const rule = { texture: (i: number) => { const key = keys[new Rng(`s25:${k}:${i}`).int(0, k % 2 ? 2 : 4)]; return { key, open: key.startsWith('open') }; }, soloBars: k % 3 ? 24 : 0 };
    const want = 64 + 8 * (k % 12), window = k % 2 ? 22 : 11;
    const arr = makeArrangement(want, new Rng(`s25:${k}`), style.corpus as any, style.sections, 1, [], 0, null, rule, window, true);
    const S = arr.sections, tex = (x: Section) => rule.texture(x.roll ?? x.index).key;
    if (S.some((x, i) => i > 0 && x.kind === 'main' && S[i - 1].kind === 'main' && tex(x) === tex(S[i - 1]))) touching.push(`die ${k}: ${S.map(x => `${x.kind}:${tex(x)} ${x.bars}`).join(', ')}`);
  }
  assert.deepEqual(touching, [], 'a main beside a main of its own texture');
  // 27191's third theme has no two mains alike side by side: its open main is the drawn one, 24 bars at 76, and its solo 84-99 (6:46-8:04)
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const three = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const solo = three.events.filter(e => e.layer === 'bass' && e.p.knobs && e.p.knobs.brightnessHz).map(e => e.bar!);
  assert.deepEqual([Math.min(...solo), Math.max(...solo)], [84, 99]);
});

// Round S21 (Eugene on ?seed=41475&v=2&theme=3&t=88: "completely empty interval
// in the middle of the song"): the density die took the pad, the motif rested
// the keys in the breakdown and S6 rested the hat, and bars 37-43 were silent.
test('S21: no theme has two bars of silence past its intro\'s first phrase and before its outro\'s last eight — at the house and under the ambient spell, over seeds 1-60 and the golden themes — and 41475\'s third theme\'s breakdown takes its pad', () => {
  const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), neverSilent: false } };
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const gapped = (st: typeof style, spell: typeof HOUSE) => {
    const found: string[] = [];
    const themes: Array<[string, number]> = [...Array.from({ length: 60 }, (_, i) => [String(i + 1), 3] as [string, number]), ['92970', 4], ['21323', 4]];
    for (const [m, k] of themes) for (let n = 0; n < k; n++) {
      const t = planTheme(m, n, { style: st, preset: 'auto', spell });
      const runs = silentRuns(programOf(t).events as any, t.arrangement.sections, t.bars, t.barSeconds);
      if (runs.length) found.push(`${m}#${n + 1} ${runs.map(([a, b]) => `${a}+${b}`).join(',')}`);
    }
    return found;
  };
  // Measured 09-26: 22 themes at the house and 20 under the ambient spell had one before.
  const beforeHouse = gapped(off, HOUSE), beforeAmbient = gapped(off, bench);
  assert.ok(beforeHouse.length >= 15 && beforeAmbient.length >= 15, `${beforeHouse.length} and ${beforeAmbient.length} themes with a gap with the rule off`);
  assert.deepEqual(gapped(style, HOUSE), [], 'a gap at the house');
  assert.deepEqual(gapped(style, bench), [], 'a gap under the ambient spell');
  const t = planTheme('41475', 2, { strategy: 'house-v2' });
  const before = planTheme('41475', 2, { style: off, preset: 'auto' });
  // Bars 37-43 until round L1 gave the theme its minutes (156 bars) and moved
  // its breakdown to bar 40, and 41-47 since (restated in the merge round,
  // Reconcile 1).
  assert.deepEqual(silentRuns(programOf(before).events as any, before.arrangement.sections, before.bars, before.barSeconds), [[41, 7]]);
  const pads = t.events.filter(e => e.layer === 'pad' && e.bar! >= 41 && e.bar! < 48);
  assert.ok(pads.length > 0 && t.timeline[42].layers.includes('pad'), 'the breakdown takes no bed');
  // and nothing else of the theme moved: the rule only adds, and only inside the gap
  const key = (e: any) => `${e.layer}|${e.voice}|${e.t}|${e.p.midi}`;
  const had = new Set(before.events.map(key));
  assert.ok(t.events.filter(e => !had.has(key(e))).every(e => e.layer === 'pad' && e.bar! >= 41 && e.bar! < 48));
  assert.ok(!('switches' in v1));
});
