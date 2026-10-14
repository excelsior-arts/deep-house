// The ambient voices (liquid-ambient, `src/ambient-voices.ts`; the research manual's sections 4-6 and its section 9
// checks that concern them), in node, on the compiled program of the two checkpoint spells and a dozen seeds each:
// the rows admitted; the soloist's note ceiling with its releases; every statement's first and last note on a tone of
// the chord in force and every note in the key; no featured detail over a keys pickup, no kit answer or kept fill while
// one speaks, no thunder beside another detail; the motif recognisable (twice at least, each return keeping its
// declared relation); the weather's spans ended, apart and bounded, its upper air under a quarter of the track; the
// cast under the ceiling with every new part's verdict recorded; the kit's and the riff's draws untouched by the
// ambient choices; the house and the places without the part untouched. The voices' rules are held as the app plays
// the track (the producer retires the statements and recasts the theme) and as the planner lays them alone
// (`tools/as-played.ts`), the app's departures named and counted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { ambientRowsFaults, AMBIENT_ROWS } from '../src/ambient-voices.ts';
import { BY_NAME, VOICE_COST_UNITS } from '@deep-house/engine/voices';
import { costOf as effectsCost } from '@deep-house/engine/effects';
import { CEILING } from '../src/catalogue-v2.ts';
import { APP, PLANNERS, faults, asPlayed, departuresSaid, type Departure } from './as-played.ts';

const SPELLS: Record<string, string> = {
  A: 'em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
  B: 'em:0.95,ti:0.80,ze:0.45,ro:0.70,gl:0.40,ve:0.30,sp:0.85,lo:0.90',
};
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const plan = (seed: string, spell: string | null, theme = 0, style: object = PLANNERS) => quiet(() => planTheme(seed, theme, { strategy: 'house-v2', style: style as typeof APP, ...(spell ? { spell: parseSpell(spell)! } : {}) }));
const pc = (m: number) => ((Math.round(m) % 12) + 12) % 12;
const MOTIF_PARTS = new Set(['soloist', 'bell', 'keys-motif']);
const DETAIL_PARTS = new Set(['soloist', 'soloist-swell', 'bell', 'keys-motif', 'keys-echo', 'weather-thunder']);
const SEEDS = ['1', '17', ...Array.from({ length: 10 }, (_, i) => String(i + 2))];

test('the ambient rows are admitted: voices that exist, controls the soloist has, shapes inside a fifth on the slow pulse, the weather bounded', () => {
  const controls = (v: string) => Object.keys((BY_NAME[v] as { controls?: Record<string, unknown> } | undefined)?.controls ?? {});
  assert.deepEqual(ambientRowsFaults((v) => !!BY_NAME[v], controls), []);
  for (const r of AMBIENT_ROWS.fillers) assert.deepEqual(r.vocabularies.map((v) => v.w), [50, 30, 20], 'the manual\'s first vocabulary draw');
  for (const r of AMBIENT_ROWS.weather) assert.deepEqual(r.families.map((f) => f.w), [15, 45, 25, 15], 'the manual\'s weather weights');
  for (const r of AMBIENT_ROWS.soloist) assert.deepEqual(r.families.map((f) => f.w), [40, 35, 25], 'the manual\'s contour families');
});

/** The voices' rules over one theme's plan and program, gathered (`tools/as-played.ts`). */
function voicesFaults(t: ReturnType<typeof plan>): string[] {
  const { out, check } = faults();
    const a = t.ambientVoices!;
    const prog = programOf(t);
    const bs = t.barSeconds, s16 = bs / 16;
    const ev = prog.events as Array<{ t: number; voice: string; role?: string; part?: string; bar: number | null; step: number | null; p: Record<string, any> }>;

    // overlap: the soloist sounds one note, two at most while one releases
    const solo = ev.filter((e) => e.part === 'soloist' || e.part === 'soloist-swell').map((e) => ({ a: e.t, b: e.t + Number(e.p.dur), r: e.t + Number(e.p.dur) + Number(e.p.release ?? 0.6) })).sort((x, y) => x.a - y.a);
    for (const x of solo) {
      check(solo.filter((y) => y.a <= x.a + 1e-6 && y.b > x.a + 1e-6).length <= 1, `two soloist notes held at ${x.a.toFixed(2)} s`);
      check(solo.filter((y) => y.a <= x.a + 1e-6 && y.r > x.a + 1e-6).length <= 2, `three soloist notes sounding at ${x.a.toFixed(2)} s with their releases`);
    }

    // harmony: a statement's first and last on a tone of the chord in force; every note in the key
    const chordAt = (bar: number) => { let c = 0; for (const s of t.keys!.states) { if (s.bar > bar) break; c = s.chord; } return t.keys!.chords[c]; };
    const key = new Set(t.key.scale.map((x: number) => pc(t.key.root + x)));
    for (const s of a.statements) {
      const c = chordAt(s.bar), notes = s.notes;
      check(c.tones.includes(pc(notes[0].midi)) && c.tones.includes(pc(notes[notes.length - 1].midi)), `the ${s.kind} at bar ${s.bar} begins or ends off ${c.symbol}`);
      for (const n of notes) check(key.has(pc(n.midi)), `the ${s.kind} at bar ${s.bar} plays ${n.midi}, outside the key`);
      check(!t.keys!.states.some((st) => st.bar * 16 > s.from && st.bar * 16 < s.to), `the ${s.kind} at bar ${s.bar} crosses a chord change`);
    }
    for (const e of ev.filter((x) => MOTIF_PARTS.has(x.part ?? ''))) {
      const s = a.statements.find((x) => e.t >= x.from * s16 - 1e-6 && e.t < x.to * s16 + 0.05);
      check(s, `a motif note at ${e.t.toFixed(2)} s that no statement declares`);
    }

    // ownership: no featured detail over a keys pickup; no kit answer or kept fill while one speaks; one featured detail at a time
    const pickups = t.keys!.reserved.filter((w) => w.kind === 'pickup');
    for (const e of ev.filter((x) => DETAIL_PARTS.has(x.part ?? ''))) {
      const step = (e.t - 0.03) / s16;
      check(!pickups.some((w) => step >= w.from && step < w.to), `a ${e.part} at ${e.t.toFixed(2)} s over the keys' pickup`);
    }
    const speaking = (bar: number) => a.windows.some((w) => bar * 16 < w.to && (bar + 1) * 16 > w.from);
    for (const x of t.development!.answers) check(!speaking(x.bar), `the kit's ${x.answer} at bar ${x.bar} while a detail speaks`);
    for (const bar of t.development!.fills.kept) check(!speaking(bar), `a kit fill at bar ${bar} while a detail speaks`);
    const featured = [...a.statements.map((s) => ({ from: s.from, to: s.to, what: s.kind })), ...a.weather.thunder.map((x) => ({ from: x.from, to: x.to, what: 'thunder' })),
      ...a.fillers.filter((f) => f.kind === 'keys-echo' || f.kind === 'swell').map((f) => ({ from: f.from, to: f.to, what: f.kind }))].sort((x, y) => x.from - y.from);
    for (let i = 1; i < featured.length; i++) check(featured[i].from >= featured[i - 1].to, `the ${featured[i].what} at step ${featured[i].from} over the ${featured[i - 1].what}`);

    // recognisability: twice at least, each return keeping its declared relation to the first statement
    check(a.statements.length >= 2, `the motif is stated ${a.statements.length} times`);
    const first = a.statements[0];
    check(first.kind === 'statement', `the first statement is a ${first.kind}`);
    const rhythm = (s: typeof first) => s.notes.map((n) => n.step - s.from).join(',');
    const contour = (s: typeof first) => s.notes.slice(1).map((n, i) => Math.sign(n.midi - s.notes[i].midi));
    // the motif's own contour, off its degrees: a statement keeps its head (its tail for a fragment)
    const C = a.motif.deg.slice(1).map((d, i) => Math.sign(d - a.motif.deg[i]));
    const head = (k: number) => C.slice(0, k).join(','), tail = (k: number) => C.slice(C.length - k).join(',');
    check(contour(first).join(',') === head(first.notes.length - 1), 'the first statement is not the motif');
    for (const s of a.statements.slice(1)) {
      const k = s.notes.length - 1;
      if (s.relation === 'same') check(rhythm(s) === rhythm(first) && contour(s).join(',') === head(k), `the ${s.kind} at bar ${s.bar} is not the motif`);
      if (s.relation === 'rhythm') check(rhythm(s) === rhythm(first), `the ${s.kind} at bar ${s.bar} lost the rhythm`);
      if (s.relation === 'contour') check(contour(s).join(',') === head(k), `the ${s.kind} at bar ${s.bar} lost the contour`);
      if (s.relation === 'fragment') check(contour(s).join(',') === tail(k), `the fragment at bar ${s.bar} is not the motif's ending`);
    }

    // the weather: ended spans, eight bars of absence, the upper air under a quarter, thunder twice at most and far apart
    const W = AMBIENT_ROWS.weather.find((r) => r.id === a.rows.weather)!;
    const mains = a.weather.spans.filter((x) => x.technique === 'main');
    for (let i = 1; i < mains.length; i++) check(mains[i].from - mains[i - 1].to >= W.absenceBars, `weather spans at bars ${mains[i - 1].to} and ${mains[i].from} with no absence`);
    check(a.weather.upperShare <= W.upperMost, `the upper air takes ${a.weather.upperShare} of the track`);
    for (const x of a.weather.spans) {
      const last = ev.filter((e) => (e.part === 'weather' || e.part === 'weather-upper') && e.voice === x.voice && e.t >= x.from * bs - 1e-6 && e.t < x.to * bs).pop();
      if (last) check(last.t + Number(last.p.dur) <= x.to * bs + 1e-3, `the span at bar ${x.from} runs past its end`);
    }
    check(a.weather.thunder.length <= 2, `${a.weather.thunder.length} thunders`);
    // one continuous source, a second only for the upper air's window: never two weather identities but those
    const wx = ev.filter((e) => /^weather/.test(e.part ?? '') && e.part !== 'weather-thunder');
    for (const x of wx) check(new Set(wx.filter((y) => y.t <= x.t + 1e-6 && y.t + Number(y.p.dur) > x.t + 1e-6).map((y) => y.voice)).size <= 2, `three weather sources at ${x.t.toFixed(1)} s`);
    for (let i = 1; i < a.weather.thunder.length; i++) check(a.weather.thunder[i].bar - a.weather.thunder[i - 1].bar >= 64, 'two thunders under sixty-four bars apart');
    if (a.weather.spans.length) check(!ev.some((e) => e.voice === 'airBed' && e.part !== 'weather'), 'the surface still plays beside the weather');

    // the cast: under the ceiling, every new part's verdict recorded
    // the cast as the admissions count it: a voice a place swapped for its sound alone counts as drawn (PLAN-UNIFY U1, `EventMeta.drawn`)
    const voices = [...new Set((t.events as Array<{ voice: string; drawn?: string; p: { gone?: unknown } }>).filter((e) => !e.p.gone).map((e) => e.drawn ?? e.voice))];
    const units = voices.reduce((s, v) => s + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
    const sp = (t.paramOverrides as { partSpace?: { inserts: Array<{ effect: string }>; sends: Array<{ effect: string; after?: Array<{ effect: string }> }> } }).partSpace;
    // ...and a keys tone the birds swapped (PLAN-UNIFY U3) counts the inserts the drawn tone would have built (it sounds no dearer)
    const counted = (t as { keys?: { cast?: { inserts: string[] } } }).keys?.cast?.inserts;
    const space = sp ? effectsCost([...(counted ?? sp.inserts.map((x) => x.effect)), ...[...sp.sends, ...sp.sends.flatMap((x) => x.after ?? [])].map((x) => x.effect)]) : 0;
    check(units + space <= CEILING, `the cast is ${units + space} units`);
    check(a.budget && a.budget.after === units + space, `the budget says ${a.budget?.after}, the program ${units + space}`);
    check(a.budget!.parts.map((x) => x.part).join(',') === 'weather,owner,upper,rumble,reverse', `the budget's parts are ${a.budget!.parts.map((x) => x.part).join(', ')}`);
    for (const x of a.budget!.parts) check(x.verdict.length > 0, `the budget's ${x.part} has no verdict`);
    const dear = voices.filter((v) => ['wordlessVocal', 'fmBell', 'wavePad'].includes(v));
    check(dear.length <= 1, `two dear ambient identities: ${dear.join(', ')}`);
  return out;
}

/**
 * **What the app plays departs from the voices' rules here.** The producer retires the planner's statements, bell and
 * echoes (so their notes are not in the program, and the rules over them hold of nothing) and recasts the theme: its
 * own soloist line, its shared hall and echo, admitted under the ceiling by the passage (`check-passage.ts` holds that),
 * not by the voices' budget, which still says the planner's cast.
 */
const DEPARTURES: readonly Departure[] = [
  { id: 'the voices\' budget is not the cast', match: /^the budget says \d+, the program \d+$/, why: 'the producer recasts the theme (its soloist line, the shared returns) under the passage\'s own admission' },
];
const tally = new Map<string, { n: number; themes: number; first: string }>();

for (const [name, spell] of Object.entries(SPELLS)) for (const seed of SEEDS) {
  test(`${name} seed ${seed}, as the app plays it: the soloist's ceiling, the harmony, the ownership, the motif, the weather and the cast, on the compiled program`, (ctx) => {
    const t = plan(seed, spell, 0, APP);
    assert.ok(t.ambientVoices && t.keys && t.development, 'the fast place lays no ambient voices');
    assert.ok(t.passage, 'the fast place arranges no passage');
    // what the producer retires does not sound
    const retired = programOf(t).events.filter((e) => ['soloist', 'soloist-swell', 'bell', 'keys-motif', 'keys-echo', 'reverse-arrival'].includes(e.part ?? ''));
    assert.deepEqual(retired.map((e) => `${e.part} ${e.t.toFixed(2)}`), [], 'a retired statement still sounds');
    asPlayed(ctx, voicesFaults(t), DEPARTURES, tally);
  });
  test(`${name} seed ${seed}, the planner alone: the soloist's ceiling, the harmony, the ownership, the motif, the weather and the cast, on the compiled program`, () => {
    const t = plan(seed, spell);
    assert.ok(t.ambientVoices && t.keys && t.development, 'the fast place lays no ambient voices');
    assert.deepEqual(voicesFaults(t), []);
  });
}
departuresSaid('the ambient voices', DEPARTURES, tally);

test('stability: the ambient choices consume no die of the kit, the riff or the keys; outside the details\' windows the drums and the bass are the ones they were', () => {
  const none = { ...PLANNERS, places: { ...PLANNERS.places, ambientVoices: [] } };
  for (const [name, spell] of Object.entries(SPELLS)) for (const seed of ['1', '17', '3', '5']) {
    const on = plan(seed, spell);
    const off = quiet(() => planTheme(seed, 0, { strategy: 'house-v2', style: none, spell: parseSpell(spell)! }));
    assert.ok(on.ambientVoices && !off.ambientVoices);
    assert.deepEqual(on.keys, off.keys, `${name} ${seed}: the keys moved`);
    assert.equal(on.bars, off.bars);
    // a phrase a detail speaks in may draw another move (that is the reservation); every other phrase's events are the same
    const touched = new Set<number>();
    for (const w of on.ambientVoices!.windows) for (let b = Math.floor(w.from / 128) * 8; b < w.to / 16; b += 8) touched.add(b);
    const drums = new Set(['kick', 'hats', 'clap', 'shaker', 'bass']);
    const key = (e: { t: number; voice: string; p: Record<string, unknown> }) => `${e.t.toFixed(5)}|${e.voice}|${JSON.stringify(e.p)}`;
    const pick = (t: typeof on) => t.events.filter((e) => drums.has(e.layer ?? '') && e.bar != null && !touched.has(Math.floor(e.bar / 8) * 8) && !touched.has(Math.floor(e.bar / 8) * 8 - 8)).map(key).sort();
    assert.deepEqual(pick(on), pick(off), `${name} ${seed}: the drums or the bass moved outside the details' phrases`);
  }
});

test('the house, the deep still four and the benchmark drone\'s spell lay no ambient voices', () => {
  for (const spell of [null, 'em:0.72,sp:0.10,ti:0.90,ze:0.25,ro:0.85,ve:0.15,lo:0.80', 'em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81']) for (const seed of ['1', '6', '27191']) {
    const t = plan(seed, spell);
    assert.equal(t.ambientVoices, undefined, `seed ${seed} at ${spell} lays ambient voices`);
    assert.ok(!t.events.some((e) => e.role === 'detail' || /^weather/.test(e.voice)));
  }
});
