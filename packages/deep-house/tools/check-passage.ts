// The written passage (`src/passage.ts`) and the producer's grammar around it (`src/producer.ts`), in node: the rows
// admitted; the passage alone (no place naming the producer) confined to its window (outside it
// every event and every line is the one the planners laid); on the compiled program of the two checkpoint spells and a
// dozen seeds each with the grammar on — the planners' figure gone from the whole track, every soloist and keys event in a
// labelled phrase, every chord change the drums play into answered by them, the cast under the phone's ceiling with the
// shared returns counted, every note's return key one the theme's settings build, the field's duck written; and on
// track A the passage as the research manual writes it: the phrases' pitches, the arrival on the Am third with the keys'
// strike, the passing dominant's shells and the leading tone resolving at the return of Em, the half-time breath with
// its way in and out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { PASSAGE_ROWS, posOf, END_NAMES } from '../src/passage.ts';
import { PHRASING_ROWS, SEGMENT_KINDS } from '../src/phrasing.ts';
import { PLAYED_KINDS } from '../src/treatment.ts';
import { PRODUCER_ROWS } from '../src/producer.ts';
import { withoutTechniques } from '../src/places.ts';
import { strategyById } from '../src/strategies/index.ts';
import { asSpace } from '@deep-house/engine/space';
import { castOf } from './ambient-program.ts';
import { CEILING } from '../src/catalogue-v2.ts';

const SPELLS: Record<string, string> = {
  A: 'em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85',
  B: 'em:0.95,ti:0.80,ze:0.45,ro:0.70,gl:0.40,ve:0.30,sp:0.85,lo:0.90',
};
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const V2 = strategyById('house-v2').style;
// the ring's hygiene (`src/hygiene.ts`) off in both: it reads the whole track, so it answers what the window holds
// (PLAN-UNIFY U1); the passage's own confinement is what these hold
const noHygiene = (st: typeof V2) => ({ ...st, switches: { ...(st as { switches?: Record<string, boolean> }).switches, hygiene: false } }) as typeof V2;
const PLANNERS = noHygiene(withoutTechniques(V2, 'passage')), PASSAGE_ALONE = noHygiene(withoutTechniques(V2, 'producer'));
const plan = (seed: string, spell: string | null, style = V2) => quiet(() => planTheme(seed, 0, { strategy: 'house-v2', style, ...(spell ? { spell: parseSpell(spell)! } : {}) })) as any;
const off = (seed: string, spell: string) => plan(seed, spell, PLANNERS);
const passageAlone = (seed: string, spell: string) => plan(seed, spell, PASSAGE_ALONE);

test('the passage rows are admitted: returns that are spaces, lines over phrases that exist, positions that parse, variants that exist', () => {
  for (const R of Object.values(PASSAGE_ROWS)) {
    for (const raw of Object.values(R.returns)) asSpace(raw);
    for (const L of R.lines) { posOf(L.at); assert.ok(Array.isArray(R.phrases[L.phrase]), `${R.id}: no phrase ${L.phrase}`); assert.ok(R.sends[L.send], `${R.id}: no send ${L.send}`); }
    for (const P of Object.values(R.phrases)) if (Array.isArray(P)) for (const n of P) {
      assert.ok(n.rest || (Number.isInteger(n.deg) && (!n.role || R.voice.roles[n.role] || n.role === 'breath')), `${R.id}: a phrase note ${JSON.stringify(n)}`);
      if (n.send) assert.ok(R.sends[n.send], `${R.id}: no send ${n.send}`);
    }
    for (const k of R.keys.strikes) posOf(k.at);
    for (const b of R.bass.phrases) assert.ok(Array.isArray(b.variant) || Array.isArray(R.bass.variants[b.variant]), `${R.id}: no bass variant ${b.variant}`);
  }
  for (const G of Object.values(PRODUCER_ROWS)) {
    const S = PASSAGE_ROWS[G.passage];
    assert.ok(S, `${G.id}: no passage ${G.passage}`);
    const phrases = { ...S.phrases, ...G.phrases } as Record<string, unknown>;
    for (const [id, A] of Object.entries(G.archetypes)) if (typeof A !== 'string') for (const x of A.phrases) assert.ok(Array.isArray(phrases[x.id]), `${G.id}: ${id} names no phrase ${x.id}`);
    for (const [fn, w] of Object.entries(G.voice.byFunction)) for (const k of Object.keys(w)) assert.ok(k === 'rest' || G.archetypes[k], `${G.id}: ${fn} draws ${k}, no archetype`);
    for (const k of Object.keys(G.bass.first)) assert.ok(Array.isArray(S.bass.variants[k]), `${G.id}: no bass variant ${k}`);
  }
});

// **Every number of a producer row says what it counts** (PLAN-UNIFY U0: the knobs get their units). A row's `units`
// maps a knob's path (`*` any key or index) to a unit of `src/musical-time.ts`; a list of numbers takes its path's
// unit, a list mixing words and numbers (a tuple) a unit per place.
const UNITS = new Set<string>(['bars', 'felt-bars', 'beats', 'felt-beats', 'sixteenths', 'phrases', 'seconds', 'ms', 'dB', 'Hz', 'semitones', 'cents', 'MIDI',
  'scale-steps', 'octaves', 'weight', 'share', 'lean', 'velocity', 'gain', 'pan', 'ratio', 'count', 'position', 'mark']);
function numberPaths(x: unknown, path: string[], out: string[][]): void {
  if (typeof x === 'number') { out.push(path); return; }
  if (Array.isArray(x)) {
    const flat = x.every((v) => !Array.isArray(v) && (typeof v !== 'object' || v === null));
    if (flat && x.some((v) => typeof v === 'number')) { out.push(path); return; }
    if (x.length && x.every((v) => Array.isArray(v) && v.every((w) => typeof w === 'number' || Array.isArray(w)))) { out.push(path); return; }
    for (const v of x) numberPaths(v, [...path, '*'], out);
    return;
  }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (k !== 'says' && k !== 'note' && k !== 'units') numberPaths(v, [...path, k], out);
}
test('one vocabulary (PLAN-UNIFY §2.4): every ending of the producer, every kind of the house\'s small things and every phrase event of the arrangement in exactly one entry', () => {
  for (const R of Object.values(PHRASING_ROWS)) {
    const E = Object.entries(R.vocabulary.entries);
    const once = (what: string, has: (e: (typeof E)[number][1]) => boolean) => {
      const at = E.filter(([, e]) => has(e)).map(([id]) => id);
      assert.equal(at.length, 1, `${R.id}: ${what} is in ${at.length ? at.join(', ') : 'no entry'}`);
    };
    for (const name of END_NAMES) once(`the producer's ending ${name}`, (e) => e.producer.includes(name));
    for (const kind of PLAYED_KINDS) once(`the small things' ${kind}`, (e) => e.house === `treatment:${kind}`);
    for (const kind of SEGMENT_KINDS.filter((k) => k !== 'drop-out' && k !== 'fill')) once(`the segment ${kind}`, (e) => e.house === `segment:${kind}`);
    for (const part of ['crash', 'hatsBreathe', 'reverse']) once(`the answer's ${part}`, (e) => e.house === `answer:${part}`);
    // every ending the producer's row draws is a name of the vocabulary's
    for (const G of Object.values(PRODUCER_ROWS)) {
      const drawn = [...Object.values(G.drums.endings).flatMap((w) => Object.keys(w)), ...Object.keys(G.drums.inflection.ends), ...Object.keys(G.drums.landing).filter((k) => k !== 'says')]
        .flatMap((k) => k.split('+')).filter((k) => k !== 'none');
      for (const k of drawn) assert.ok((END_NAMES as readonly string[]).includes(k), `${G.id}: draws ${k}, no ending of that name`);
    }
  }
});

test('every number of a producer row declares its unit', () => {
  for (const G of Object.values(PRODUCER_ROWS)) {
    const units = ((G as unknown as { units?: Record<string, string | string[]> }).units ?? {});
    const pats = Object.entries(units).filter(([k]) => k !== 'says').map(([k, u]) => ({ parts: k.split('.'), u }));
    for (const { u } of pats) for (const w of [u].flat()) assert.ok(UNITS.has(w), `${G.id}: ${w} is not a unit`);
    const paths: string[][] = [];
    numberPaths(G, [], paths);
    for (const p of paths) {
      const m = pats.filter((x) => x.parts.length === p.length && x.parts.every((a, i) => a === '*' || a === p[i]));
      assert.ok(m.length, `${G.id}: ${p.join('.')} declares no unit`);
    }
  }
});

const SEEDS = ['1', '17', ...Array.from({ length: 10 }, (_, i) => String(i + 2))];
// a keys tone the birds swapped sends its room into the field's hall where the theme builds one, and keeps its own room
// or none where not (PLAN-UNIFY U3): the hall is the passage's, so with the passage off its keys sound without that send
// across the whole track; that send is the one thing the window does not confine
const unswapped = (e: any) => {
  if (!(e.drawn && e.role === 'sparse-keys')) return e.p;
  const { direct: _d, returns, ...p } = e.p; const { 'field.hall': _h, ...r } = returns ?? {};
  return { ...p, ...(Object.keys(r).length ? { returns: r } : {}) };
};
const key = (e: any) => `${e.t.toFixed(5)}|${e.voice}|${JSON.stringify(unswapped(e))}`;
for (const [name, spell] of Object.entries(SPELLS)) for (const seed of SEEDS) {
  test(`${name} seed ${seed}: the passage alone confined to its window`, () => {
    const t = passageAlone(seed, spell);
    assert.ok(t.passage, 'the fast place played no passage');
    const { from, to } = t.passage.window;
    const bs = t.barSeconds;
    const before = off(seed, spell);
    // outside the window the planners' events, and every line but the returns', as they were
    const outside = (x: any) => x.events.filter((e: any) => e.t < from * bs - 1e-6 || e.t >= to * bs - 1e-6).map(key).sort();
    assert.deepEqual(outside(t), outside(before), 'an event outside the window moved');
    const prog = programOf(t), was = programOf(before);
    const lines = (p: any) => p.automation.filter((l: any) => !l.param.startsWith('returns.')).map((l: any) => JSON.stringify(l));
    assert.deepEqual(lines(prog), lines(was), 'a line other than the returns\' moved');
    // what the passage retires is gone from the window
    const R = PASSAGE_ROWS[t.passage.id];
    for (const e of t.events) if (e.t >= from * bs && e.t < to * bs) {
      assert.ok(!(e.part && R.retire.parts.includes(e.part)), `a retired ${e.part} at bar ${e.bar}`);
      assert.ok(!R.retire.voices.includes(e.voice), `a retired ${e.voice} at bar ${e.bar}`);
    }
  });
  test(`${name} seed ${seed}: the whole track produced: the planners' figure gone, every phrase labelled, the landings answered, the cast under the ceiling, the returns built`, () => {
    const t = plan(seed, spell);
    assert.ok(t.passage, 'the fast place played no passage');
    const prog = programOf(t), bs = t.barSeconds;
    // the planners' figure is gone from bar 0 to the end: the evenly spaced statements, their swells, the keys' automatic echoes
    for (const e of t.events) assert.ok(!['soloist', 'soloist-swell', 'keys-echo', 'keys-motif'].includes(e.part), `the planners' ${e.part} at bar ${e.bar}`);
    // every soloist and keys event belongs to a labelled phrase
    const unl = t.events.filter((e: any) => (e.voice === 'wordlessVocal' || e.role === 'sparse-keys' || e.part === 'study-phrase') && !e.label);
    assert.equal(unl.length, 0, `unlabelled: ${unl.slice(0, 5).map((e: any) => `${e.bar}:${e.voice}/${e.part ?? ''}`).join(', ')}`);
    // a chord change the drums play into is answered by them: a gesture in the bar before or on the landing
    const tl = new Map<number, any>(t.passage.timeline.map((r: any) => [r.bar, r]));
    for (const l of t.keys.landings.filter((x: any) => x.change)) {
      const drums = t.events.some((e: any) => ['kick', 'clap', 'hats'].includes(e.layer) && e.bar >= l.bar - 1 && e.bar <= l.bar);
      if (!drums) continue;
      const near = t.events.some((e: any) => ['crash', 'swell'].includes(e.voice) && Math.abs(e.t - l.bar * bs) < bs * 0.6)
        || [tl.get(l.bar - 1)?.drums, tl.get(l.bar)?.drums].some((x: any) => x && /fill|roll|crash|hatsBreathe|openEnding|snarePickup|ghostAnswer|reverseCymbal|T \(|H \(/.test(x));
      assert.ok(near, `the drums ignore the landing at ${l.bar}`);
    }
    // the cast, the returns counted
    const cast = castOf(prog);
    assert.ok(cast.total <= CEILING, `the cast is ${cast.total} units`);
    // every return key resolves to a send the settings build; the duck written from hits inside the window
    const built = prog.settings.returns ?? {};
    for (const e of prog.events) for (const k of Object.keys(e.p?.returns ?? {})) {
      const [id, send] = k.split('.');
      assert.ok(built[id] && (!send || built[id].sends.some((s: any) => s.id === send)), `a note sends to ${k}, which is not built`);
    }
    const duck = prog.automation.find((l: any) => l.param === 'returns.field.duck.gain');
    assert.ok(duck && duck.points.length > 50, 'the field has no duck');
    for (const p of duck.points) assert.ok(p.value > 0.6 && p.value <= 2, `the field's line goes to ${p.value}`);
  });
}

test('track A: the passage as the research manual writes it', () => {
  const t = plan('1', SPELLS.A);
  const drop = t.arrangement.sections.find((s: any) => s.kind === 'drop').startBar;
  assert.equal(drop, 48);
  const bs = t.barSeconds, s16 = bs / 16;
  const at = (bar: number, step: number) => bar * bs + step * s16;
  const solo = t.events.filter((e: any) => e.part === 'study-soloist');
  const slurAt = (bar: number, step: number) => solo.find((e: any) => Math.abs(e.t - at(bar, step) - 0.012) < 0.002);
  // a slur's pitches: its note, then each step of its path
  const pitches = (e: any) => {
    const c = e.p.pitchCurve as number[] | undefined;
    const out = [e.p.midi];
    if (c) for (let i = 3; i < c.length; i += 2) { const m = e.p.midi + Math.round(c[i] / 100); if (m !== out[out.length - 1] && Math.abs(c[i] % 100) < 1e-6) out.push(m); }
    return out;
  };
  const most = (v: number | number[]) => (Array.isArray(v) ? Math.max(...v.filter((_, i) => i % 2 === 1)) : v);
  // the E question at 58:4&: B3 D4 F#4 G4 F#4, then the thrown E4 on its own into the echo
  const q = slurAt(58, 14);
  assert.ok(q, 'no E question at 58:4&');
  assert.deepEqual(pitches(q), [59, 62, 66, 67, 66]);
  const thrown = slurAt(59, 12);
  assert.ok(thrown && thrown.p.midi === 64 && most(thrown.p.returns['field.echo']) > 0.3, 'the E question\'s last E4 is not thrown');
  // the cross-chord line lands on Am's third, C5, with the keys' strike at 80, scooped and into the hall
  const c5 = slurAt(80, 0);
  assert.ok(c5 && c5.p.midi === 72, 'no C5 at 80:1');
  assert.ok(c5.p.pitchCurve[1] < 0 && most(c5.p.returns['field.hall']) >= 0.8 && c5.p.direct <= 0.16, 'the arrival is not scooped into the hall');
  assert.ok(t.events.some((e: any) => e.role === 'sparse-keys' && !e.part && e.bar === 80 && Number(e.p.dur) > 4 * bs), 'no keys landing at 80');
  // no automatic keys answer after the strikes at 80 and 112, no keys echo anywhere in the window
  for (const b of [80, 112]) assert.ok(!t.events.some((e: any) => e.role === 'sparse-keys' && e.bar === b && e.t > at(b, 3) && Number(e.p.dur) < 2 * bs && !e.part), `a keys answer after the strike at ${b}`);
  assert.ok(!t.events.some((e: any) => e.part === 'keys-echo' && e.bar >= 44 && e.bar < 120), 'a keys echo in the window');
  // the quiet touches at 64 and 96, and the dominant's shells at 111 (B7sus4 then B7b9) into Em at 112
  const touch = (b: number, step: number) => t.events.filter((e: any) => e.part === 'study-keys' && e.bar === b && Math.round((e.t - b * bs) / s16) === step).map((e: any) => e.p.midi).sort((x: number, y: number) => x - y);
  assert.deepEqual(touch(64, 0), [55, 59, 62, 66]);
  assert.deepEqual(touch(96, 0), [55, 59, 64, 74]);
  assert.deepEqual(touch(98, 0), [72]);
  assert.deepEqual(touch(111, 0), [57, 59, 64, 66]);
  assert.deepEqual(touch(111, 8), [57, 60, 63, 66]);
  const lead = slurAt(111, 14);
  assert.ok(lead && lead.p.midi === 63 && slurAt(112, 0)?.p.midi === 64, 'the leading tone does not resolve to E4 at 112');
  // the half-time breath at 96-99: one kick on the downbeat, the principal snare on beat three, no bass in 96-97
  for (let b = 96; b < 100; b++) {
    const kicks = t.events.filter((e: any) => e.layer === 'kick' && e.bar === b);
    assert.equal(kicks.length, 1, `bar ${b} has ${kicks.length} kicks`);
    assert.ok(t.events.some((e: any) => e.voice === 'snareCrack' && e.bar === b && Math.abs(e.t - at(b, 8)) < s16 / 2), `no snare on beat three of ${b}`);
  }
  // the bass holds the floor under the breath (one low root, no riff), the way in and the way out written around it
  const held = t.events.filter((e: any) => e.layer === 'bass' && e.t >= at(96, 0) - 0.01 && e.t < at(98, 0));
  assert.equal(held.length, 1, `the bass plays ${held.length} notes in 96-97`);
  assert.ok(held[0].p.midi === 33 && Number(held[0].p.dur) > bs, 'the held floor is not one long A');
  assert.ok(t.events.some((e: any) => e.voice === 'swell' && Math.abs(e.t - at(96, 0)) < 0.01), 'no reverse swell into the breath');
  assert.ok(t.events.filter((e: any) => e.voice === 'snareCrack' && e.bar === 99 && e.t > at(99, 9)).length >= 4, 'no fill out of the breath');
  assert.ok(t.events.some((e: any) => e.voice === 'crash' && Math.abs(e.t - at(100, 0)) < 0.01), 'no crash on the return at 100');
  assert.ok(t.events.some((e: any) => e.voice === 'crash' && Math.abs(e.t - at(112, 0)) < 0.01), 'no crash on the arrival at 112');
  // the straight hats at 80-87 carry no new melodic attack in 82-85
  assert.ok(!solo.some((e: any) => e.t >= at(82, 0) && e.t < at(86, 0)), 'the voice speaks over the drummer\'s spotlight');
  // the drop's incidental vinyl layer is gone
  assert.ok(!t.events.some((e: any) => e.voice === 'vinylBed' && e.bar === 48));
});
