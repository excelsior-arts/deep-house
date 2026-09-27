// The composer's holes within the locks: round (e) of the reconciled review of
// 09-24 (`notes/reviews/RECONCILED-2026-09-24.md` §4 (e)). Each test is the
// finding's reproduction swept over seeds, red on the code the review read and
// green after its fix. house-v1 never moves: a fix that reaches a plan is
// house-v2's alone, by what its style carries (the motif, the composition
// policy, the organ rule) or by a switch (`sectionEdges`, and round (g)'s
// `sectionPhrases` and `leadIns`), and the golden and program digests hold v1
// byte for byte.
import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme } from '../src/mix.ts';
import { programOf, seamPlan, blendAsked } from '../src/performance.ts';
import { interpretWants } from '../src/interpret.ts';
import { laneLevelDb, ROOM_OFF_DB } from '../src/lane-level.ts';
import { silentRuns } from '../src/silence.ts';
import { readFileSync } from 'node:fs';
import { pushCurve, sectionGrid, layersAtBar, type Arrangement, type Section } from '../src/arrangement.ts';
import { organTheme } from '../src/set-plan.ts';
import { generate } from '../src/generator.ts';
import { style, settings } from '../src/styles/deep-house-v2.ts';
import { style as v1 } from '../src/styles/deep-house.ts';
import { HOUSE, biasFor } from '../src/spell.ts';
import { swellsOf, spellVerdict } from '../src/swell.ts';
import { sweepsOf } from '../src/sweep.ts';
import { soloPlace, soloEvents, soloCeiling, SOLO_POP_DB } from '../src/solo.ts';

const v2 = { strategy: 'house-v2', spell: HOUSE } as const;
// The lead-ins' own rules are asked with round S14's glue gates off: since S14
// the house's dark casts keep no noise glue, and the lead-in is what is placed
// before the gates take it.
const leadInStyle = { ...style, switches: { ...(style.switches as Record<string, boolean>), glueGates: false } } as typeof style;
type Plan = ReturnType<typeof planTheme>;
const pcIn = (t: Plan, midi: number) => t.key.scale.includes(((midi - t.key.root) % 12 + 12) % 12);

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
  // 52 since) entered with no kick for four bars.
  const t = planTheme(17, 1, v2);
  const drop = t.arrangement.sections.find(s => s.kind === 'drop')!;
  assert.equal(drop.startBar, 52);
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
  const bench = planTheme(27191, 3, { strategy: 'house-v2', spell: { ...HOUSE, ember: .14, gleam: 0, veil: .34, spark: 0, loom: .81 } });
  assert.equal(seamPlan(bench, blendAsked(bench)).bar, 56);
  assert.equal(layersAtBar(bench.arrangement, 56).section.kind, 'breakdown');
  // The switch is house-v2's; the record carries none.
  assert.equal((style.switches as Record<string, boolean>).sectionPhrases, true);
  assert.ok(!('switches' in v1));
});

// **The lead-ins as the plan writes them** (R34), read off the glue lanes'
// events by their shape, since house-v2's glue lanes draw kitchen voices and a
// name says nothing: a rise ends on the line it leads into (0.35, 0.5 or 0.65),
// a long swell arrives on it with the length of a rise, the swell that comes
// with an impact arrives on it in 1.8 s, the impact is on it (0.65, no length),
// and the fall is the bar before it (0.45, one bar).
const RHYTHM_GATES = ['kick', 'hatClosed', 'hatOpen', 'sixteenths', 'clap', 'bass'];
function leadInsOf(t: Plan) {
  const bs = t.barSeconds, glue = t.events.filter(e => (e.role === 'texture' || e.layer === 'fx') && e.p.gain !== undefined);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const played = new Set(t.timeline.flatMap(r => r.layers.filter(l => RHYTHM_GATES.includes(l))));
  const secs = t.arrangement.sections;
  const risers = glue.filter(e => e.p.dur && e.p.dur >= bs - 1e-9 && [0.35, 0.5, 0.65].includes(e.p.gain!) && secs.some(x => x.startBar > 0 && near(e.t + e.p.dur!, x.startBar * bs)));
  const returns = secs.flatMap((s, i) => {
    const next = secs[i + 1];
    if (!next || !['drop', 'main'].includes(next.kind) || s.phrases.at(-1)!.layers.kick) return [];
    const line = next.startBar;
    if (t.timeline[line - 1].layers.includes('kick') || !t.timeline[line].layers.includes('kick')) return [];
    const at = line * bs, before = t.timeline[line - 1].layers, after = t.timeline[line].layers.filter(l => RHYTHM_GATES.includes(l));
    const gained = after.filter(l => !before.includes(l)).length, missing = [...played].filter(l => !after.includes(l)).length;
    const rise = risers.find(e => near(e.t + e.p.dur!, at));
    const long = glue.find(e => near(e.t, at) && e.p.dur && e.p.dur > 2);
    const swell = glue.find(e => near(e.t, at) && e.p.dur && e.p.dur <= 2);
    const impact = glue.find(e => near(e.t, at) && !e.p.dur && e.p.gain === 0.65);
    const fall = glue.find(e => near(e.t, at - bs) && e.p.gain === 0.45 && near(e.p.dur!, bs));
    const kind = rise ? 'riser' : long ? 'swell-long' : swell && impact ? 'swell+impact' : impact ? 'impact' : fall ? 'fall' : 'none';
    return [{ line, s, next, kind, rise: rise ?? long, contrast: gained / Math.max(1, gained + missing), gained }];
  });
  return { risers, returns };
}

test('R34: the lead-ins are scheduled by rules, not by a coin: what follows, the contrast, the scene, alternation and the tempo', () => {
  // Round (g) of the reconciled review of 09-24, Eugene's answer to question
  // 11, the `leadIns` switch. Measured over seeds 1-200 x 4 at the house before
  // it: a riser at 1 of 528 returns (3 of 1094 breakdowns), 363 returns with no
  // lead-in at all and 42 returns running with the same one.
  const spells = [HOUSE, { ...HOUSE, ember: .9 }, { ...HOUSE, veil: .95 }];
  const found: string[] = [];
  let returns = 0, risen = 0, first = 0, firstRisen = 0, long = 0;
  for (const spell of spells) for (let seed = 1; seed <= 60; seed++) for (let n = 0; n < 4; n++) {
    const t = planTheme(seed, n, { style: leadInStyle, preset: 'auto', spell });
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
      const t = planTheme(seed, n, { strategy: 'house-v2', spell: { ...HOUSE, ember }, development: 'phrased' });
      for (const r of leadInsOf(t).returns) if (r.kind === 'riser' || r.kind === 'swell-long') r.contrast < 1 ? partial++ : full++;
    }
    return { partial, full };
  };
  const house = count(HOUSE.ember), up = count(.95);
  assert.equal(house.partial, 0, JSON.stringify(house));
  assert.ok(up.partial > 5, `ember .95: ${JSON.stringify(up)}`);
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

test('R105: compiling a performance freezes nothing the plan owns', () => {
  const t = planTheme(3, 0, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.9, veil: 0.8 } });
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

test('S1: the benchmark\'s pad return (16:00 before round S4 shortened the theme, bar 172 at 13:52 after it, bar 144 since round S19 cut the mains) swells over eight bars; its drop keeps its step', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const t = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const entries = swellsOf({ style, spell: bench, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes });
  const at = (bar: number) => entries.find(e => e.bar === bar && e.layer === 'pad')!;
  assert.equal(at(144).span, 8, 'the breakdown at bar 144 swells over eight bars');
  // A turnover (the bass leaves on the bar the pad arrives) starts at -6 dB, less the wave pad's own attack.
  assert.ok(at(144).depthDb < -5.7 && at(144).depthDb > -6, `and from ${at(144).depthDb} dB`);
  assert.equal(at(104).span, 0);
  assert.match(at(104).sectionVerdict, /drop/);
  const swelled = t.events.filter(e => e.p.swell && e.bar! >= 144);
  assert.deepEqual([...new Set(swelled.map(e => e.bar))], [144, 146, 148, 150], 'the four chords of the span, and none after it');
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
test('S2: the benchmark\'s theme 3 opens two sections with a high-pass, closes none (its vibes are a bright struck keys) and leaves bar 144 (172 before round S19) to the swell and the seam', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const t = planTheme('27191', 2, { strategy: 'house-v2', spell: bench });
  const input = { style, spell: bench, barSeconds: t.barSeconds, bars: t.bars, arrangement: t.arrangement, timeline: t.timeline, events: t.events, lanes: style.lanes };
  const moves = sweepsOf({ ...input, swells: swellsOf(input) });
  assert.deepEqual(moves.filter(m => m.laid).map(m => `${m.kind}@${m.bar}+${m.bars}`), ['entry@36+8', 'entry@88+8']);
  // Bar 144 is past the seam's floor (0.82 of 164, from bar 135), and S1 swells it besides.
  assert.match(moves.find(m => m.kind === 'entry' && m.line === 144)!.sectionVerdict, /seam/);
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

test('S2: a glue noise comes in and goes out by a curve by the spell\'s side — a beat on the slow side, an eighth on a steady four, its edges under a driving kick — and 21323\'s ambient breakdown sweep rises over a beat an octave lower and 6 dB down', () => {
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  // The fades' own rule, with round S14's gates off: since S14 a slow spell
  // and the house's dark casts have no noise glue at all, so the curves are
  // asked of the glue the lead-ins place before the gates take it.
  const ungated = { ...style, switches: { ...(style.switches as Record<string, boolean>), glueGates: false } };
  const t = planTheme('21323', 0, { style: ungated as typeof style, preset: 'auto', spell: bench });
  // Its breakdown was at bar 56, at 68 once round S4 shortened the theme, and
  // at 52 since round S19 cut its main.
  const sweep = t.events.find(e => e.layer === 'fx' && e.voice === 'sweepDown' && e.bar === 52)!;
  assert.ok(Math.abs(sweep.p.attack - t.beat) < 1e-9 && sweep.p.top === 4500, `the sweep at 52 rises over ${sweep.p.attack} s from ${sweep.p.top} Hz`);
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
  // (72, 128, 144, 152, 160 and 168 before round S19 cut the mains)
  assert.deepEqual(up.map(e => e.bar), [48, 96, 112, 120, 128, 136], 'the bars with no pad, no drums and only the vibes over the bass');
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
  for (const [seed, n] of [['27191', 2], ['21323', 2], ['1', 1], ['21323', 1]] as const) {
    const a = planTheme(seed, n, { style: off, preset: 'auto', spell: bench });
    const b = planTheme(seed, n, { strategy: 'house-v2', spell: bench });
    const solo = b.events.filter(e => e.layer === 'bass' && e.p.knobs && e.p.knobs.brightnessHz);
    const from = Math.min(...solo.map(e => e.bar!)), to = Math.max(...solo.map(e => e.bar!)) + 1;
    const figure = a.events.filter(e => e.layer === 'bass' && e.bar! >= from && e.bar! < to);
    // the skeleton: the same hits on the same steps, each at its own pitch or an octave or two over it
    assert.deepEqual(solo.map(e => e.t), figure.map(e => e.t), `${seed}#${n}: the solo's hits are not the figure's`);
    const pops = solo.map((e, i) => e.p.midi - figure[i].p.midi);
    assert.ok(pops.every(d => [0, 12, 24].includes(d)), `${seed}#${n}: a displacement that is not an octave: ${[...new Set(pops)].join(',')}`);
    assert.ok(pops.some(d => d === 24) && pops.filter(d => d > 0).length >= figure.length / 5, `${seed}#${n}: ${pops.filter(d => d > 0).length} pops of ${figure.length} hits`);
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
    assert.ok(solo.at(-1)!.t + solo.at(-1)!.p.dur <= to * b.barSeconds + 1e-6, `${seed}#${n}: it runs past the line`);
    assert.ok(!b.events.some(e => e.layer === 'bass' && e.bar === from - 1), `${seed}#${n}: no rest before it`);
    assert.deepEqual(b.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi]), a.events.filter(e => e.bar! < from - 1 || e.bar! >= to).map(e => [e.t, e.voice, e.p.midi]), `${seed}#${n}: something outside the solo moved`);
    shapes.push(`${seed}#${n} ${from}-${to - 1}: ${pops.filter(d => d === 12).length} octave and ${pops.filter(d => d === 24).length} two-octave pops of ${figure.length}`);
  }
  // The slide: the benchmark's solo told a groove follows runs down the scale over the last two beats into its first note.
  const plan = planTheme('27191', 2, { style: off, preset: 'auto', spell: bench });
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
  assert.ok(planTheme('27191', 2, { strategy: 'house-v2', spell: bench }).events.some(e => e.p.knobs && e.p.knobs.brightnessHz), 'the shipped house-v2 plays no solo on the benchmark');
  assert.ok(shapes.length === 4, shapes.join('; '));
});

// Round S4 (Eugene, 09-25): house-v2's themes a fifth shorter and its mix later.
test('S4: house-v2\'s themes are a fifth shorter with the same tempo, key, cast and progression, its seams start at or after 0.82 of the theme with the blend inside it, and house-v1\'s set is the record\'s', () => {
  assert.deepEqual([...style.set.themeBarPercentiles], [64, 96, 116, 132, 196]);
  assert.equal(style.set.themeBarsMin, 52); assert.equal(style.set.themeBarsMax, 208); assert.equal(style.set.seamFloor, 0.82);
  assert.deepEqual([...v1.set.themeBarPercentiles], [79, 118, 145, 167, 247]);
  assert.equal(v1.set.themeBarsMax, 256); assert.equal(v1.set.seamFloor, 0.75); assert.ok(!('seamLineInside' in v1.set));
  const old = { ...style, set: { ...style.set, themeBarPercentiles: [79, 118, 145, 167, 247], themeBarsMin: 64, themeBarsMax: 256 } };
  let themes = 0, before = 0, after = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const a = planTheme(seed, n, { style: old, preset: 'auto' }), b = planTheme(seed, n, { style, preset: 'auto' });
    for (const k of ['bpm', 'key', 'preset'] as const) assert.deepEqual(b[k], a[k], `${seed}#${n}: the ${k} moved`);
    const dice = (t: Plan) => { const d = { ...t.dice } as Record<string, unknown>; delete d.form; return d; };
    assert.deepEqual(dice(b), dice(a), `${seed}#${n}: a die moved`);
    assert.deepEqual(b.progression.chords.map(c => c.voicing), a.progression.chords.map(c => c.voicing), `${seed}#${n}: the progression moved`);
    assert.ok(b.bars >= 52 && b.bars <= 208 && b.bars <= a.bars, `${seed}#${n}: ${a.bars} -> ${b.bars} bars`);
    themes++; before += a.bars; after += b.bars;
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
  const t = planTheme('26925', 2, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.49, gleam: 1, spark: 1 } });
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
  const at = [0, 0.7, 1].map(r => planTheme('26925', 2, { strategy: 'house-v2', spell: off(r) }));
  const perBar = (t: Plan) => t.events.filter(e => e.layer === 'bass').length / t.bars;
  assert.deepEqual(at.map(t => sel(t)['bass-free'] ?? null), [null, null, 'long-pedal']);
  assert.deepEqual(at.map(t => sel(t)['body-free'] ?? null), [null, null, 'full']);
  // thin and full keep the base figure (the benchmark's bass among them); heavy has more notes
  assert.ok(perBar(at[0]) === perBar(at[1]) && perBar(at[1]) < perBar(at[2]), `notes a bar ${at.map(perBar).map(x => x.toFixed(2)).join(', ')}`);
  const mass = at.map(t => t.knobs?.sub?.mass ?? 1);
  assert.ok(mass[0] < mass[1] && mass[1] < mass[2] && mass[2] > 1.5, `mass ${mass.join(', ')}`);
  // Every step moves the low end, so the ledger says so; the same plan twice does not.
  assert.ok(lowEndDiffers(at[0], at[1]) && lowEndDiffers(at[1], at[2]));
  assert.equal(lowEndDiffers(at[1], planTheme('26925', 2, { strategy: 'house-v2', spell: off(0.7) })), false);
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
  const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), laneFloors: false } };
  const quiet = <T>(fn: () => T): T => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
  const db = (g: number) => 20 * Math.log10(Math.max(g, 1e-9));
  const loudest = (p: any, voices: string[]) => Math.max(-120, ...p.events.filter((e: any) => voices.includes(e.voice)).map((e: any) => db(e.p.gain ?? 1)));
  // the rule itself
  assert.equal(laneLevelDb(style, { clap: -60 }, 'clap', 'clap'), -60, 'the room\'s own clap came back on');
  assert.equal(laneLevelDb(style, { clap: -60 }, 'snare', 'clap'), (style.base.levels as any).clap);
  assert.equal(laneLevelDb(style, { shaker: -60 }, 'conga', 'shaker'), (style.base.levels as any).shaker);
  assert.equal(laneLevelDb(style, { clap: -11.5 }, 'snare', 'clap'), -11.5, 'a room that has its clap on moved');
  assert.equal(laneLevelDb(off, { clap: -60 }, 'snare', 'clap'), -60);
  // the backbeat: Drum and Bass's key, a broken kit, every golden theme in the sub room
  const dnb = { ...HOUSE, ember: 0.95, spark: 0.85, zephyr: 0.7, root: 0.6, veil: 0.6 };
  let buriedBefore = 0, buriedAfter = 0, themes = 0;
  for (const [m, k] of [['1', 6], ['92970', 4], ['21323', 4]] as const) for (let i = 0; i < k; i++) {
    const a = loudest(programOf(planTheme(m, i, { style: off, preset: 'auto', spell: dnb })), ['snare', 'rimshot']);
    const b = loudest(programOf(planTheme(m, i, { strategy: 'house-v2', spell: dnb })), ['snare', 'rimshot']);
    if (a === -120) continue;
    themes++; if (a < ROOM_OFF_DB) buriedBefore++; if (b < ROOM_OFF_DB) buriedAfter++;
  }
  assert.ok(themes >= 10 && buriedBefore === themes && buriedAfter === 0, `the broken kit's backbeat buried on ${buriedBefore} of ${themes} themes before and ${buriedAfter} after`);
  // the sixteenth: a row's percussion cell (dnb/two-step asks no presence for
  // it) under the Tech House key, in the growl room
  const bare = row('genres/dnb/two-step.json');
  const tech = { ...HOUSE, ember: 0.7, spark: 0.4, zephyr: 0.6, root: 0.6, tide: 0.45 };
  const SIX = ['cabasa', 'conga', 'bongo', 'tom', 'tambourine', 'cowbell', 'woodblock'];
  let growl = 0, sixBefore = 0, sixAfter = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', spell: tech, recipe: bare }));
    if (t.preset !== 'growl') continue;
    const a = loudest(programOf(quiet(() => planTheme(seed, 0, { style: off, preset: 'auto', spell: tech, recipe: bare }))), SIX);
    const b = loudest(programOf(t), SIX);
    if (a === -120) continue;
    growl++; if (a < ROOM_OFF_DB) sixBefore++; if (b < ROOM_OFF_DB) sixAfter++;
  }
  assert.ok(growl >= 3 && sixBefore === growl && sixAfter === 0, `a row's sixteenth buried on ${sixBefore} of ${growl} growl themes before and ${sixAfter} after`);
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

// Round S19 (Eugene, 09-26: "trim another 15 % on average, and if possible bias
// the trimming toward the longer segments and away from the breaks and
// bridges"): house-v2 draws a theme at its table's length and cuts the
// arrangement to 0.85 of it, the mains first.
test('S19: house-v2 cuts every theme to 0.85 of its drawn length off the mains first — the breakdowns, builds and drops keep their bars, the intro its first phrase, the seam its floor — and house-v1 is not cut', () => {
  assert.equal(style.set.themeTrim, 0.85);
  assert.deepEqual([...style.set.themeTrimBars!], [44, 176]);
  assert.ok(!('themeTrim' in v1.set));
  const uncut = { ...style, set: { ...style.set, themeTrim: undefined, themeTrimBars: undefined } };
  const kinds = (t: Plan) => { const o: Record<string, number> = {}; for (const x of t.arrangement.sections) o[x.kind] = (o[x.kind] || 0) + x.bars; return o; };
  let before = 0, after = 0, mains = 0;
  for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
    const a = planTheme(seed, n, { style: uncut, preset: 'auto' }), b = planTheme(seed, n, { style, preset: 'auto' });
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
  // Measured 09-26: 7184 -> 6104 bars (0.850), every bar of it off the mains.
  assert.ok(after / before > 0.83 && after / before < 0.87, `${before} -> ${after} bars (${(after / before).toFixed(3)})`);
  assert.ok(mains / (before - after) >= 0.8, `the mains carried ${mains} of ${before - after} bars`);
  const bench = planTheme('27191', 2, { strategy: 'house-v2', spell: { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 } });
  assert.equal(bench.bars, 164, 'the benchmark\'s theme 3: 192 bars before, 164 after');
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
  assert.deepEqual(silentRuns(programOf(before).events as any, before.arrangement.sections, before.bars, before.barSeconds), [[37, 7]]);
  const pads = t.events.filter(e => e.layer === 'pad' && e.bar! >= 37 && e.bar! < 44);
  assert.ok(pads.length > 0 && t.timeline[38].layers.includes('pad'), 'the breakdown takes no bed');
  // and nothing else of the theme moved: the rule only adds, and only inside the gap
  const key = (e: any) => `${e.layer}|${e.voice}|${e.t}|${e.p.midi}`;
  const had = new Set(before.events.map(key));
  assert.ok(t.events.filter(e => !had.has(key(e))).every(e => e.layer === 'pad' && e.bar! >= 37 && e.bar! < 44));
  assert.ok(!('switches' in v1));
});
