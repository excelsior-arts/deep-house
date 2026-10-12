// check-composer, shard 1 of 4 (phrases): the composer's holes within the locks, as `check-composer-common.ts` says.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planTheme, seamPlan, blendAsked, sectionGrid, layersAtBar, style, v1, HOUSE, v2, leadInStyle, pcIn, leadInsOf,
} from './check-composer-common.ts';

test('R15: a lead motif is never clamped onto a note out of the key: such a note folds into the piano by octaves', () => {
  const PI = style.base.piano;
  let themes = 0, notes = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const t = planTheme(seed, 0, v2);
    if (t.dice.motifRegister !== 'lead') continue;
    themes++;
    // Every pitched note of the theme above the bass is in its key (the bass's
    // own approach notes are another question, §3 M19); the lead lane's notes
    // are inside the piano's register.
    for (const e of t.events) {
      if (typeof e.p.midi !== 'number' || e.layer === 'bass') continue;
      assert.ok(pcIn(t, e.p.midi), `seed ${seed} (${t.key.name}): ${e.voice} plays ${e.note} at bar ${e.bar}, out of the key`);
      if (e.layer === 'keys') { notes++; assert.ok(e.p.midi >= PI.low && e.p.midi <= PI.high, `seed ${seed}: ${e.note} outside the piano`); }
    }
  }
  // Measured 09-24: 43 lead-motif themes in 1-300, 14 of them with 897 G3s.
  assert.ok(themes > 30 && notes > 1000, `${themes} lead-motif themes, ${notes} notes`);
});

test('R16: a kick dropout never silences a section\'s first bar under house-v2; house-v1 keeps its own', () => {
  let starts = 0;
  const found: string[] = [];
  for (let seed = 1; seed <= 100; seed++) for (let n = 0; n < 4; n++) {
    const t = planTheme(seed, n, v2);
    for (const s of t.arrangement.sections) {
      if (s.startBar === 0 || !s.phrases[0].layers.kick) continue;
      starts++;
      if (!t.events.some(e => e.voice === 'kick' && e.bar === s.startBar)) found.push(`${seed}#${n} ${s.kind} at bar ${s.startBar}`);
    }
  }
  assert.deepEqual(found, [], `a section whose kick is on enters with no kick: ${found.join('; ')}`);
  assert.ok(starts > 1500, `${starts} section starts`);
  // The switch is house-v2's: the record carries none and its dropouts are where they were.
  assert.equal((style.switches as Record<string, boolean>).sectionEdges, true);
  assert.ok(!('switches' in v1));
  // 17#1's drop (at bar 68 before round S19 cut its first main to 32 bars, at
  // 52 since, and at 64 since round L1 gave the theme its minutes, 116 bars)
  // entered with no kick for four bars.
  const t = planTheme(17, 1, v2);
  const drop = t.arrangement.sections.find(s => s.kind === 'drop')!;
  assert.equal(drop.startBar, 64);
  for (let b = drop.startBar; b < drop.startBar + 4; b++) assert.ok(t.events.some(e => e.voice === 'kick' && e.bar === b), `17#1: no kick at bar ${b} of the drop`);
});

test('R16, R38: a theme with a grid counts its phrases from each section\'s start, and its seam keeps out of the build and the drop', () => {
  // Round (g) of the reconciled review of 09-24, Eugene's answer to question
  // 4, the `sectionPhrases` switch. Measured on the head before it, seeds
  // 1-150 x 4 at the house: 2153 of 3926 section entries off the set's
  // eight-bar line, so 1773 had a fill (a phrase's last bar) in front of them;
  // 45 of 600 seams in the outgoing theme's build or drop; none of the 80
  // themes under 96 bars ending on an outro.
  const grid = sectionGrid;
  let entries = 0, runs = 0, short = 0, seams = 0;
  const found: string[] = [];
  for (let seed = 1; seed <= 100; seed++) for (let n = 0; n < 4; n++) {
    const t = planTheme(seed, n, v2);
    const at = grid(t.arrangement);
    for (const s of t.arrangement.sections) {
      if (s.startBar === 0) continue;
      entries++;
      // The bar before every section line is a phrase's last bar: the fill.
      if (at(s.startBar - 1).end !== s.startBar) found.push(`${seed}#${n}: no phrase ends before the ${s.kind} at ${s.startBar}`);
      for (let b = s.startBar; b < s.startBar + s.bars; b++) {
        const p = at(b);
        if (p.start < s.startBar || p.end > s.startBar + s.bars || (p.start - s.startBar) % 8) found.push(`${seed}#${n}: bar ${b}'s phrase ${p.start}-${p.end} is not its section's`);
      }
    }
    // A dropout is the end of a phrase of its own section, at most half of it.
    for (let b = 0; b < t.bars; b++) {
      const on = layersAtBar(t.arrangement, b).layers.kick;
      if (!on || t.timeline[b].layers.includes('kick')) continue;
      let e = b; while (e + 1 < t.bars && layersAtBar(t.arrangement, e + 1).layers.kick && !t.timeline[e + 1].layers.includes('kick')) e++;
      runs++;
      const p = at(b);
      if (e + 1 !== p.end || (e - b + 1) * 2 > p.end - p.start) found.push(`${seed}#${n}: a dropout ${b}-${e} in the phrase ${p.start}-${p.end}`);
      b = e;
    }
    if (t.bars < 96) {
      short++;
      const last = t.arrangement.sections.at(-1)!;
      if (last.kind !== 'outro' || last.bars < 8) found.push(`${seed}#${n}: ${t.bars} bars ending on a ${last.bars}-bar ${last.kind}`);
    }
    const seam = seamPlan(t, blendAsked(t));
    seams++;
    const kind = layersAtBar(t.arrangement, seam.bar).section.kind;
    if (kind === 'build' || kind === 'drop') found.push(`${seed}#${n}: the seam at bar ${seam.bar} is in the ${kind}`);
    if (seam.bar < t.bars * style.set.seamFloor) found.push(`${seed}#${n}: the seam at bar ${seam.bar} is under the floor`);
  }
  assert.deepEqual(found.slice(0, 12), [], `${found.length}: ${found.slice(0, 12).join('; ')}`);
  assert.ok(entries > 2000 && runs > 300 && short > 30 && seams === 400, `${entries} entries, ${runs} dropouts, ${short} short themes, ${seams} seams`);
  // No drums, no grid: the set's line. The benchmark's fourth theme handed
  // over across its build at bar 80 of 96; since round S4 it is 80 bars, its
  // floor 0.82 and its line finer, and it hands over inside its breakdown at 68;
  // since round S19 cut its main it is 68 bars and hands over in the breakdown at 56.
  // Restated in round L2 by the rule: its length is Loom's (72 bars since
  // L2's 1.3), and it hands over inside its last breakdown, at or over the floor.
  const bench = planTheme(27191, 3, { strategy: 'house-v2', spell: { ...HOUSE, ember: .14, gleam: 0, veil: .34, spark: 0, loom: .81 } });
  const handOver = seamPlan(bench, blendAsked(bench)).bar;
  assert.equal(layersAtBar(bench.arrangement, handOver).section, bench.arrangement.sections.filter(x => x.kind === 'breakdown').at(-1));
  assert.ok(handOver >= bench.bars * style.set.seamFloor, `the hand-over at ${handOver} of ${bench.bars}`);
  // The switch is house-v2's; the record carries none.
  assert.equal((style.switches as Record<string, boolean>).sectionPhrases, true);
  assert.ok(!('switches' in v1));
});

test('R34: the lead-ins are scheduled by rules, not by a coin: what follows, the contrast, the scene, alternation and the tempo', () => {
  // Round (g) of the reconciled review of 09-24, Eugene's answer to question
  // 11, the `leadIns` switch. Measured over seeds 1-200 x 4 at the house before
  // it: a riser at 1 of 528 returns (3 of 1094 breakdowns), 363 returns with no
  // lead-in at all and 42 returns running with the same one.
  const spells = [HOUSE, { ...HOUSE, ember: .9 }, { ...HOUSE, veil: .95 }];
  const found: string[] = [];
  let returns = 0, risen = 0, first = 0, firstRisen = 0, long = 0;
  for (const spell of spells) for (let seed = 1; seed <= 60; seed++) for (let n = 0; n < 4; n++) {
    const t = planTheme(seed, n, { style: leadInStyle, preset: 'auto', spell, library: [] });
    const { risers, returns: rs } = leadInsOf(t);
    const where = `${seed}#${n} ${JSON.stringify(spell === HOUSE ? {} : { ember: spell.ember, veil: spell.veil })}`;
    const forward = t.dice.scene === 'drone-forward';
    const haze = (spell.veil - HOUSE.veil) / (1 - HOUSE.veil) >= .5;
    const bars = t.bpm >= 110 ? 4 : t.bpm >= 90 ? 2 : 1;
    // Every rise leads into a return: never a build's end, an outro or the end.
    for (const e of risers) {
      const line = Math.round((e.t + e.p.dur!) / t.barSeconds);
      const r = rs.find(x => x.line === line);
      if (!r) found.push(`${where}: a rise into bar ${line}, which is no return (${layersAtBar(t.arrangement, line - 1).section.kind} into ${layersAtBar(t.arrangement, line).section.kind})`);
      if (forward) found.push(`${where}: a rise beside a drone in front`);
      if (haze) found.push(`${where}: a noise rise under haze`);
      if (Math.abs(e.p.dur! - bars * t.barSeconds) > 1e-6) found.push(`${where}: a rise of ${(e.p.dur! / t.barSeconds).toFixed(2)} bars at ${t.bpm} BPM`);
    }
    rs.forEach((r, i) => {
      returns++;
      if (r.kind === 'riser' || r.kind === 'swell-long') { risen++; if (r.contrast < 1) found.push(`${where}: a partial return at the house rises`); }
      if (r.kind === 'swell-long') { long++; if (Math.abs(r.rise!.p.dur! - bars * t.barSeconds) > 1e-6) found.push(`${where}: a long swell of the wrong length`); }
      if (i && r.kind !== 'none' && r.kind === rs[i - 1].kind) found.push(`${where}: two returns running led in by the same ${r.kind}`);
      if (i === 0 && !forward && t.dice.fxPalette && ['open', 'deep'].includes(String(t.dice.fxPalette))) {
        first++;
        if (r.kind === 'riser' || r.kind === 'swell-long') firstRisen++;
      }
      // A palette with no riser of its own (dry, tight) rises a step quieter.
      const STEPS = [.35, .5, .65], sparse = ['dry', 'tight'].includes(String(t.dice.fxPalette));
      const step = STEPS[Math.max(0, (r.gained >= 5 ? 2 : r.gained === 4 ? 1 : 0) - (sparse ? 1 : 0))];
      if (r.rise && r.gained && Math.abs(r.rise.p.gain! / (r.kind === 'swell-long' ? .7 : 1) - step) > 1e-9)
        found.push(`${where}: a rise at ${r.rise.p.gain} for ${r.gained} layers gained on ${t.dice.fxPalette}`);
      if (sparse && r.rise && r.gained < 4) found.push(`${where}: a ${t.dice.fxPalette} theme rises on a return of ${r.gained} layers`);
    });
  }
  assert.deepEqual(found.slice(0, 12), [], `${found.length}: ${found.slice(0, 12).join('; ')}`);
  assert.ok(returns > 400 && risen > returns / 5 && long > 20, `${returns} returns, ${risen} risen, ${long} long swells`);
  // A first return on a palette that has a rise rises unless the spacing
  // between sections' moments holds it back.
  assert.ok(firstRisen > first * .8, `${firstRisen} of ${first} first returns rise`);
});
