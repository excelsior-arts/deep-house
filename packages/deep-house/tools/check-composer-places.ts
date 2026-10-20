// check-composer, shard 4 of 4 (places): the composer's holes within the locks, as `check-composer-common.ts` says.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planTheme, Rng, programOf, seamPlan, blendAsked, interpretWants, silentRuns, readFileSync, pushCurve, style, settings, v1, HOUSE, biasFor, soloPlace, soloEvents, soloCeiling, v2,
} from './check-composer-common.ts';
import type { Plan } from './check-composer-common.ts';
import { APP, PLANNERS, faults, asPlayed, departuresSaid, type Departure } from './as-played.ts';

/**
 * The house-v2 style with no place naming a written passage: the planners' own track, which the riff's checks read (one
 * object, so the plan cache keys it once). A global switch was invisible to that cache, which handed the planners' plans
 * to later tests asking the same request with the passage on.
 */
const planners = async (): Promise<any> => PLANNERS;
/** The style the app plays (`tools/as-played.ts`): the riff's rules are read off it too, the producer's re-cut runs counted. */
const APP_STYLE = (): any => APP;
/**
 * **What the app plays departs from the riff's rules here**: the producer's bass (`src/producer.ts`) shifts, octaves and
 * develops the riff's notes after the break and writes answers into the drums' gaps, so a run it moved no longer opens
 * on S's fall and flick, sits off the cycle's home, or holds flat through the snare. Counted, for the bird-relative
 * rounds (Root's meaning at the fast place, U2).
 */
const RIFF_DEPARTURES: readonly Departure[] = [
  { id: 'a re-cut opening', match: /: the opening moves |: the flick rises /, why: 'a cycle the producer re-cut opens on a moved run, not S\'s thirty sixteenths' },
  { id: 'a run off its cycle\'s home', match: / under home \d+$/, why: 'a run the producer shifted or octaved sits under the home its cycle had' },
  { id: 'a run under the floor', match: / under the floor$/, why: 'a run the producer shifted or octaved goes under the riff row\'s floor less S\'s settle' },
  { id: 'a run held flat through the snare', match: /: held flat from the kick through the snare$/, why: 'a run the producer moved lands its flat stretch over the snare' },
];
const riffTally = new Map<string, { n: number; themes: number; first: string }>();

// Round GA1 (Eugene, 09-26: "we go all in on styles … diversity is the
// priority"): the library reaches the draw. One theme in three of a set is the
// library's turn; a turn draws a row the spell admits and the theme can place,
// and plays it as its pin. `notes/rounds/genres-ga1.md`.
test('GA1: one theme in three of a set is the library\'s turn — exactly one in every three running, never two together — and house-v1 never has one', async () => {
  const { libraryTurn, TURN_EVERY } = await import('../src/library-draw.ts');
  assert.equal(TURN_EVERY, 3);
  let turns = 0, themes = 0;
  const phases = new Set<number>();
  for (let seed = 1; seed <= 60; seed++) {
    const row = Array.from({ length: 6 }, (_, n) => libraryTurn(seed, n));
    for (let n = 0; n + 3 <= row.length; n++) assert.equal(row.slice(n, n + 3).filter(Boolean).length, 1, `${seed}: themes ${n}-${n + 2} hold ${row.slice(n, n + 3).filter(Boolean).length} turns`);
    for (let n = 1; n < row.length; n++) assert.ok(!(row[n] && row[n - 1]), `${seed}: two turns running at ${n}`);
    phases.add(row.indexOf(true));
    for (let n = 0; n < 3; n++) { themes++; if (row[n]) turns++; }
  }
  assert.equal(turns, 60, `${turns} turns of ${themes}`);
  assert.deepEqual([...phases].sort(), [0, 1, 2], 'a set opens on every phase of the rule');
  assert.equal((style.switches as Record<string, boolean>).libraryDraw, true);
  assert.ok(!('switches' in v1));
  // the set hands the turn down; house-v1's set never does
  const { themeSeed } = await import('../src/set-plan.ts');
  assert.equal(themeSeed(7, 2), '7#2');
});

test('GA1-GA3: the pool — the shipped rows a die can reach are the two mined whole themes and the 37 genre rows (GA3 lifted them off nought): the hands and the melody families are the style\'s own, the house and its rooms are casts', async () => {
  const { libraryPool, outOfPool, DRAWABLE, isCast } = await import('../src/library-draw.ts');
  const { PATTERN_LIBRARY, TRACK_LIBRARY } = await import('../src/recipes.ts');
  assert.deepEqual(libraryPool(style).map(r => r.id), [...PATTERN_LIBRARY, ...TRACK_LIBRARY].map(r => r.id));
  const why = (id: string) => outOfPool(DRAWABLE.find(r => r.id === id)!, style);
  for (const id of ['house/hand-conversation', 'house/hand-answers', 'house/hand-rolling', 'house/pump', 'house/lick', 'house/answer'])
    assert.equal(why(id), 'the style\'s own', id);
  for (const id of ['house/deep-house', 'house/sub-room', 'house/growl-room']) assert.equal(why(id), 'a cast', id);
  for (const row of PATTERN_LIBRARY) { assert.equal(outOfPool(row, style), null, row.id); assert.ok(!isCast(row), row.id); }
  // At nought a row is out whatever it is; a cast is out whatever its weight.
  const afro = PATTERN_LIBRARY.find(r => r.id === 'house/afro-house')!;
  assert.deepEqual(libraryPool(style, [{ ...afro, weight: 0 }, { ...DRAWABLE.find(r => r.id === 'house/sub-room')!, weight: 2 }, afro]).map(r => r.id), ['house/afro-house']);
});

test('GA1: a drawn row is its pin — every turn under the spell that admits and places it draws it and plans event for event as `?recipe=` does; every other theme is the plan without the library; the readout names the draw and the link never does', async () => {
  const { recipeById } = await import('../src/recipes.ts');
  const { libraryTurn } = await import('../src/library-draw.ts');
  // unclaimed copies: a claimed row is admitted only inside its family's region (GA2)
  const afro = { ...recipeById('house/afro-house')!, id: 'test/afro-copy', weight: 0.5 };
  // a layer row that is not the style's own: the conversation hands under another name
  const hands = { ...recipeById('house/hand-conversation')!, id: 'test/hand-copy' };
  const techHouse = { ember: 0.70, tide: 0.45, zephyr: 0.60, root: 0.60, spark: 0.40 };
  const events = (t: Plan) => JSON.stringify(t.events.map(e => [e.t, e.voice, e.p.midi ?? null, e.p.vel ?? null, e.p.dur ?? null]));
  const dice = (t: Plan) => { const d = { ...t.dice } as Record<string, unknown>; delete d.library; return JSON.stringify(d); };
  let drawn = 0, layers = 0, plain = 0;
  for (let seed = 1; seed <= 12; seed++) for (let n = 0; n < 3; n++) {
    const opts = { strategy: 'house-v2', spell: techHouse } as const;
    const t = planTheme(seed, n, { ...opts, library: [afro] });
    if (!libraryTurn(seed, n)) {
      assert.equal(t.dice.library, undefined, `${seed}#${n}: a draw off the turn`);
      if (seed <= 6) { assert.equal(events(t), events(planTheme(seed, n, opts)), `${seed}#${n}: a theme off the turn moved`); plain++; }
      continue;
    }
    assert.equal(t.dice.library, 'test/afro-copy (track, of 1)', `${seed}#${n}`);
    const pin = planTheme(seed, n, { ...opts, recipe: afro, accompaniment: 'base' });
    assert.equal(events(t), events(pin), `${seed}#${n}: the draw is not its pin`);
    assert.equal(dice(t), dice(pin), `${seed}#${n}: a die of the draw is not its pin's`);
    drawn++;
    if (seed <= 6) {
      const l = planTheme(seed, n, { ...opts, library: [hands] });
      const lp = planTheme(seed, n, { ...opts, recipe: hands, accompaniment: 'auto' });
      assert.match(String(l.dice.library), /^test\/hand-copy \(layer, of 1\)|^turn: test\/hand-copy refused/, `${seed}#${n}`);
      if (!/refused/.test(String(l.dice.library))) {
        assert.equal(events(l), events(lp), `${seed}#${n}: the layer draw is not its pin`);
        assert.equal(JSON.parse(String(l.dice.composition)).library.id, 'test/hand-copy', `${seed}#${n}: the trace does not name the draw`);
        layers++;
      }
    }
  }
  assert.ok(drawn === 12 && layers >= 4 && plain >= 10, `${drawn} track draws, ${layers} layer draws, ${plain} plain themes`);
  // A pin overrides the die, and a requested form keeps a track row out.
  const pinned = planTheme(1, [0, 1, 2].find(n => libraryTurn(1, n))!, { strategy: 'house-v2', spell: techHouse, library: [afro], recipe: { ...afro, id: 'test/afro-pin' }, accompaniment: 'base' });
  assert.equal(pinned.dice.library, undefined, 'a pinned recipe drew as well');
  const n1 = [0, 1, 2].find(n => libraryTurn(2, n))!;
  const shaped = planTheme(2, n1, { strategy: 'house-v2', spell: techHouse, library: [afro], development: 'shaped' });
  assert.equal(shaped.dice.library, undefined, 'a track row under a requested form');
  // Drums off: a four-floor row does not place, and nothing is written.
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const n27 = [0, 1, 2].find(n => libraryTurn('27191', n))!;
  const amb = planTheme('27191', n27, { strategy: 'house-v2', spell: bench, library: [afro] });
  assert.equal(amb.dice.library, undefined, 'a four-floor row on a drumless theme');
  // house-v1 has no turn at all
  assert.equal((planTheme(1, [0, 1, 2].find(n => libraryTurn(1, n))!, { strategy: 'house-v1', library: [afro] }).dice as Record<string, unknown>).library, undefined);
});

test('GA1, GA2: the share — with one row admitted everywhere, and with the shipped library, the carrying share over seeds 1-60 x 3 at the house is the turn\'s third, inside [0.25, 0.40]; the drawn themes keep S21\'s no silence, S7\'s no solo with drums and the seam floor', async () => {
  const { recipeById } = await import('../src/recipes.ts');
  const { libraryPool } = await import('../src/library-draw.ts');
  const afro = { ...recipeById('house/afro-house')!, id: 'test/afro-copy', weight: 0.5 };
  let carrying = 0, themes = 0;
  const found: string[] = [];
  for (let seed = 1; seed <= 60; seed++) for (let n = 0; n < 3; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell: HOUSE, library: [afro] });
    themes++;
    if (!t.dice.library) continue;
    if (/refused/.test(String(t.dice.library))) { found.push(`${seed}#${n}: ${t.dice.library}`); continue; }
    carrying++;
    if (seed > 20) continue;
    const runs = silentRuns(programOf(t).events as any, t.arrangement.sections, t.bars, t.barSeconds);
    if (runs.length) found.push(`${seed}#${n}: silent ${runs.map(([a, b]) => `${a}+${b}`).join(',')}`);
    if (t.events.some(e => e.p.knobs && e.p.knobs.brightnessHz)) found.push(`${seed}#${n}: a solo with drums`);
    if (t.events.some(e => e.layer === 'bass' && e.p.knobs && (e.p.slideFrom || e.p.slideTime != null))) found.push(`${seed}#${n}: a solo glides`);
    const seam = seamPlan(t, blendAsked(t));
    if (seam.bar < t.bars * style.set.seamFloor) found.push(`${seed}#${n}: the seam at ${seam.bar} of ${t.bars} is under the floor`);
  }
  assert.deepEqual(found, [], found.join('; '));
  const share = carrying / themes;
  assert.ok(share >= 0.25 && share <= 0.40, `${carrying} of ${themes} themes carry a library row (${share.toFixed(3)})`);
  // The shipped library (GA2): the two mined whole themes, admitted at the house, so the share is the turn's third again.
  let shipped = 0;
  for (let seed = 1; seed <= 60; seed++) for (let n = 0; n < 3; n++)
    if (/^tracks\/(dark-sixteenths|bright-eighths) \(track/.test(String(planTheme(seed, n, { strategy: 'house-v2', spell: HOUSE }).dice.library ?? ''))) shipped++;
  assert.ok(shipped / 180 >= 0.25 && shipped / 180 <= 0.40, `${shipped} of 180 themes carry a mined whole theme at the house`);
  // 39 until round G4 (10-02) added the four downtempo/ambient rows; 43 until R1 admitted the eleven DnB rows mined from source 8;
  // 54 until round DNB-3 (10-05) admitted two more of them, the sparse half-step and the double-kick two-step.
  assert.equal(libraryPool(style).length, 56);
});

// Round GA2 (Eugene, 09-26: "somehow wire those two full-song-like recipes we
// built with [the other agent]"): the two mined whole-theme rows, ported to what house-v2
// reads and drawn on a turn inside the house's region. `notes/rounds/genres-ga2.md`.
test('GA2: the mined whole themes are ported, not rewritten — ids and names plain, the mined box, weight, marks and provenance kept, every want one house-v2 applies, and what the port could not carry named in the row', async () => {
  const { TRACK_LIBRARY, recipeById } = await import('../src/recipes.ts');
  const { validate, vocabularyOf } = await import('../src/recipe.ts');
  const { INTERPRETER } = await import('../src/interpret.ts');
  const registry = await import('@deep-house/engine/voices');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const mined = path.resolve(import.meta.dirname, '../../../notes/recipes/mined');
  const vocab = vocabularyOf(style, registry);
  assert.deepEqual(TRACK_LIBRARY.map(r => r.id), ['tracks/dark-sixteenths', 'tracks/bright-eighths']);
  for (const [r, file] of [[TRACK_LIBRARY[0], 'track-01'], [TRACK_LIBRARY[1], 'track-02']] as const) {
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.equal(r.interpreter, INTERPRETER);
    assert.equal(recipeById(r.id.split('/')[1]), r, `${r.id}: its short name`);
    assert.ok(!/mined\//.test(r.id) && r.name.length < 100, `${r.id}: a plain id and name`);
    const src = fs.readdirSync(mined).find(f => f.startsWith(file));
    if (src) {
      const m = JSON.parse(fs.readFileSync(path.join(mined, src), 'utf8'));
      assert.deepEqual(r.birds, m.birds); assert.equal(r.weight, m.weight);
      // the verdicts as the mined row has them, less where a take was saved on the bench (`wav`, a local
      // path, which a shipped row does not carry since the liquid bass rounds of 10-07)
      assert.deepEqual(r.score, m.score);
      assert.deepEqual(r.verdicts, m.verdicts.map(({ wav: _wav, ...v }: { wav?: string }) => v));
      assert.equal(r.provenance.mined.id, m.id); assert.deepEqual(r.provenance.mined.wants, m.wants);
      assert.deepEqual(r.wants.rates, { figure: m.wants.rates.figure, offbeat: m.wants.rates.offbeat });
    }
    assert.ok(r.provenance.port.lost.some((l: string) => /^rates\.kick/.test(l)), `${r.id}: the kick's rate is not said lost`);
    const notes = interpretWants(r, style, biasFor(HOUSE, style)).notes;
    assert.deepEqual(notes.filter(n => n.state !== 'applied').map(n => `${n.block}: ${n.say}`), [], r.id);
  }
});

test('GA2, GA5: a mined box is readings, so a mined whole theme is admitted where it is among the nearest rows (it sits at the house), never by its box; at the house both are drawn on a turn and never off one, and the Techno and Tech House keys admit neither', async () => {
  const { TRACK_LIBRARY } = await import('../src/recipes.ts');
  const { admits, rowPlace, libraryTurn } = await import('../src/library-draw.ts');
  for (const r of TRACK_LIBRARY) {
    assert.deepEqual(rowPlace(r.id)!.spell, { ...HOUSE }, `${r.id}: the house's place`);
    assert.deepEqual(rowPlace(r.id)!.tempo, [95, 105]);
    assert.ok(admits(r, HOUSE), `${r.id} at the house`);
    assert.ok(!admits(r, { ...HOUSE, ember: 0.75, root: 0.60, zephyr: 0.50, veil: 0.60 }), `${r.id} under Techno`);
    assert.ok(!admits(r, { ...HOUSE, ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }), `${r.id} under Tech House`);
  }
  // track-01's box excludes the house on Veil and Spark: the box is not what admits it.
  assert.ok(HOUSE.veil < TRACK_LIBRARY[0].birds.veil![0] && HOUSE.spark < TRACK_LIBRARY[0].birds.spark![0]);
  const drew: Record<string, number> = {};
  for (let seed = 1; seed <= 30; seed++) for (let n = 0; n < 3; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell: HOUSE });
    const got = t.dice.library ? String(t.dice.library).split(' ')[0] : null;
    assert.equal(!!got, libraryTurn(seed, n), `${seed}#${n}: ${t.dice.library} on ${libraryTurn(seed, n) ? 'a turn' : 'no turn'}`);
    if (got) { assert.match(got, /^tracks\//); drew[got] = (drew[got] || 0) + 1; }
  }
  assert.ok(drew['tracks/dark-sixteenths'] >= 10 && drew['tracks/bright-eighths'] >= 10, JSON.stringify(drew));
});

test('GA2: a row\'s rates lean the mined masks — the offbeat rate the hat mask, the figure rate the stab mask — toward their window, only where the masks are drawn, and a class word leans a third of the list it names', async () => {
  const { TRACK_LIBRARY } = await import('../src/recipes.ts');
  const { maskPerBar } = await import('../src/patterns.ts');
  const [c1, c2] = TRACK_LIBRARY;
  const inWindow = (w: { min: number; max: number }, m: string) => { const k = maskPerBar(m); return k >= w.min && k <= w.max; };
  for (const r of [c1, c2]) {
    // A lean and not a gate: one tolerance out is the pool's floor, so the
    // mask moves into the window on some seeds and the distance falls on all.
    const off = (w: { min: number; max: number }, m: string) => { const k = maskPerBar(m); return k < w.min ? w.min - k : k > w.max ? k - w.max : 0; };
    let pinned = 0, plain = 0, stabsPinned = 0, stabsPlain = 0, far = [0, 0], stabFar = [0, 0];
    for (let seed = 1; seed <= 40; seed++) {
      const a = planTheme(seed, 0, { strategy: 'house-v2', recipe: r }), b = planTheme(seed, 0, { strategy: 'house-v2', library: [] });
      if (inWindow(r.wants.rates.offbeat, a.dice.hatMask)) pinned++;
      if (inWindow(r.wants.rates.offbeat, b.dice.hatMask)) plain++;
      if (inWindow(r.wants.rates.figure, a.dice.stabMask)) stabsPinned++;
      if (inWindow(r.wants.rates.figure, b.dice.stabMask)) stabsPlain++;
      far[0] += off(r.wants.rates.offbeat, b.dice.hatMask); far[1] += off(r.wants.rates.offbeat, a.dice.hatMask);
      stabFar[0] += off(r.wants.rates.figure, b.dice.stabMask); stabFar[1] += off(r.wants.rates.figure, a.dice.stabMask);
    }
    assert.ok(pinned > plain && stabsPinned >= stabsPlain && far[1] < far[0] && stabFar[1] <= stabFar[0],
      `${r.id}: hats in the window ${plain} -> ${pinned} of 40 (${far[0].toFixed(1)} -> ${far[1].toFixed(1)} hits out), stabs ${stabsPlain} -> ${stabsPinned} (${stabFar[0].toFixed(1)} -> ${stabFar[1].toFixed(1)})`);
    console.log(`  ${r.id}: hats in the window ${plain} -> ${pinned} of 40 (${far[0].toFixed(1)} -> ${far[1].toFixed(1)} hits a bar out, summed), stabs ${stabsPlain} -> ${stabsPinned} (${stabFar[0].toFixed(1)} -> ${stabFar[1].toFixed(1)})`);
  }
  // house-v1 draws its masks off the room: a rate reaches nothing there
  assert.equal(interpretWants(c1, v1, biasFor(HOUSE, v1)).masks, undefined);
  // dark leans the upper two thirds of a list and leaves the lower third alone; bright the other way
  const lead = (r: typeof c1) => interpretWants(r, style, biasFor(HOUSE, style)).bias.weights.leadTimbres;
  const list = (style.candidates as any[]).find(x => x.id === 'leadTimbres').list().map((e: any) => String(e.v ?? e));
  const { TIMBRES } = await import('@deep-house/engine/voices');
  const hz = list.map((t: string) => (TIMBRES as any)[t].brightnessHz);
  const sorted = [...hz].sort((a, b) => a - b);
  const q = (x: number) => { const at = (sorted.length - 1) * x, lo = Math.floor(at); return sorted[lo] + (sorted[Math.ceil(at)] - sorted[lo]) * (at - lo); };
  const dark = lead(c1), bright = lead(c2), base = biasFor(HOUSE, style).weights.leadTimbres;
  hz.forEach((h: number, i: number) => {
    if (h > q(1 / 3)) assert.ok(dark[i] < base[i], `${list[i]} (${h} Hz) is not leaned by dark`);
    if (h < q(2 / 3)) assert.ok(bright[i] < base[i], `${list[i]} (${h} Hz) is not leaned by bright`);
  });
});

// Round GA3 (the brief's: the genre rows admitted under their families' keys,
// the tempo bands, the two faults). `notes/rounds/genres-ga3.md`.
test('GA3, GA5: every pattern row sits where it was audited (the places table is the audit\'s, keyed by the rows\' own ids) and a turn draws among the rows nearest the playing birds and tempo: at the house the house\'s own, under 27191\'s spell the drumless ones there, and under every audit spell a row', async () => {
  const { PATTERN_LIBRARY } = await import('../src/recipes.ts');
  const { rowPlace, admits, libraryTurn, nearestRows, DRAWABLE, NEAR } = await import('../src/library-draw.ts');
  const AUDIT = JSON.parse(readFileSync(new URL('./genre-audit.json', import.meta.url), 'utf8'));
  const code: Record<string, string> = { em: 'ember', ti: 'tide', ze: 'zephyr', ro: 'root', gl: 'gleam', ve: 'veil', sp: 'spark', lo: 'loom' };
  const parse = (s: string) => Object.fromEntries(s.split(',').map(p => { const [k, v] = p.split(':'); return [code[k], Number(v)]; }));
  assert.equal(NEAR, 0.075);
  for (const r of PATTERN_LIBRARY) {
    const at = rowPlace(r.id)!;
    assert.deepEqual(at.spell, { ...HOUSE, ...parse(AUDIT.keys[AUDIT.rows[r.id].key].spell) }, `${r.id}: not placed where it was audited`);
    assert.deepEqual(at.tempo, r.tempo.bpm, `${r.id}: its tempo window is not its own`);
    assert.ok(!admits(r, HOUSE), `${r.id} at the house`);
    assert.ok(nearestRows(DRAWABLE, at.spell, (at.tempo[0] + at.tempo[1]) / 2).includes(r), `${r.id}: not among the nearest at its own place`);
  }
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  assert.ok(nearestRows(DRAWABLE, bench).some(r => r.id === 'ambient/slow-chords'), '27191\'s spell stands nearest the slow chords');
  assert.deepEqual(nearestRows(DRAWABLE, HOUSE).map(r => r.id), ['tracks/dark-sixteenths', 'tracks/bright-eighths']);
  for (const [name, k] of Object.entries(AUDIT.keys) as Array<[string, any]>) {
    const spell = { ...HOUSE, ...parse(k.spell) };
    let drawn = 0;
    for (let seed = 1; seed <= 12; seed++) for (let n = 0; n < 3; n++) {
      const t = planTheme(seed, n, { strategy: 'house-v2', spell });
      const lib = t.dice.library;
      assert.equal(!!lib, libraryTurn(seed, n, spell), `${name} ${seed}#${n}: ${lib}`);
      if (!lib) continue;
      drawn++;
      assert.ok(rowPlace(String(lib).split(' ')[0]), `${name}: ${lib} has no place`);
    }
    assert.equal(drawn, 12, `${name}: ${drawn} themes drew`);
  }
});

test('GA3, GA5: every genre row audits inside its genre\'s own tempo where Ember reaches it, the two that cannot at the nearest', async () => {
  const { PATTERN_LIBRARY } = await import('../src/recipes.ts');
  const nearest = PATTERN_LIBRARY.filter(r => r.tempo.nearest).map(r => r.id).sort();
  // the one drop's 70-80 sits under the Downtempo key's 83-93; bassline's 135-142 over Tech House's 120-130
  assert.deepEqual(nearest, ['dub/one-drop', 'garage/bassline']);
});

test('GA5: Ember is a tempo — a monotone curve from 46 to 176 BPM, the seed pulling five either side — the house exactly its own 95-105 and 27191 exactly its 49-50, and every step of Ember a drift or a near blend but where the drums come in', async () => {
  const { derive, tempoInFamily, TEMPO_CURVE, TEMPO_WINDOW } = await import('../src/spell.ts');
  const { seamTempo } = await import('../src/performance.ts');
  assert.equal(TEMPO_WINDOW, 5);
  assert.deepEqual([TEMPO_CURVE[0][1], TEMPO_CURVE.at(-1)![1]], [46, 176]);
  for (let i = 1; i < TEMPO_CURVE.length; i++) assert.ok(TEMPO_CURVE[i][0] > TEMPO_CURVE[i - 1][0] && TEMPO_CURVE[i][1] > TEMPO_CURVE[i - 1][1], 'the curve is monotone');
  const h = derive(HOUSE);
  assert.equal(h.tempoCentre, 100);
  assert.deepEqual([...h.tempoRange], [95, 105]);
  for (let bpm = 95; bpm <= 105; bpm++) assert.equal(tempoInFamily(bpm, h), bpm, 'the house is the identity');
  let prev = 0;
  for (let e = 0; e <= 100; e++) { const c = derive({ ...HOUSE, ember: e / 100 }).tempoCentre; assert.ok(c >= prev, `ember ${e / 100}: ${c} under ${prev}`); prev = c; }
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  // the set's drift holds at 2 % of the drawn 49 from the fifth theme (the deep review of 10-08, B15; it was 50.2 there)
  assert.deepEqual([0, 1, 2, 3, 4].map(n => planTheme('27191', n, { strategy: 'house-v2', spell: bench }).bpm), [49, 49.3, 49.6, 49.9, 50]);
  const far: string[] = [];
  for (let e = 0; e < 100; e += 5) {
    const a = derive({ ...HOUSE, ember: e / 100 }).tempoCentre, b = derive({ ...HOUSE, ember: (e + 5) / 100 }).tempoCentre;
    if (!['drift', 'near'].includes(seamTempo(a, b).kind)) far.push(`${e / 100}`);
  }
  // 0.25 -> 0.30 is far since round K40 notched the centre (75 -> 90 on the
  // curve's steepest stretch, where the two notches are three apart); the
  // hand steps Ember by the notch since K40 and a notch is always near (below).
  // Restated in the merge round, Reconcile 1.
  assert.deepEqual(far, ['0.15', '0.25']);
  for (const c of [50, 100, 140, 170]) assert.ok(['drift', 'near'].includes(seamTempo(c, c + 5).kind), `${c} -> ${c + 5}`);
});

test('GA5: no dead zone — at every Ember from 0 to 1, with the other birds at the house, every turn draws a row (the nearest it can place); the house\'s own rows are nearest at the default birds', async () => {
  const { nearestRows, libraryTurn, DRAWABLE, awayFromHouse } = await import('../src/library-draw.ts');
  assert.deepEqual(nearestRows(DRAWABLE, HOUSE).map(r => r.id), ['tracks/dark-sixteenths', 'tracks/bright-eighths']);
  assert.equal(awayFromHouse(HOUSE), false);
  const empty: string[] = [];
  for (let e = 0; e <= 100; e += 5) {
    const spell = { ...HOUSE, ember: e / 100 };
    for (let seed = 1; seed <= 6; seed++) for (let n = 0; n < 3; n++) {
      if (!libraryTurn(seed, n, spell)) continue;
      const t = planTheme(seed, n, { strategy: 'house-v2', spell });
      if (!t.dice.library || /refused/.test(String(t.dice.library))) empty.push(`${e / 100} ${seed}#${n} ${t.dice.library ?? 'nothing'}`);
    }
  }
  assert.deepEqual(empty, []);
});

test('GA3: an asked open hat plays at the open lane\'s level (the loose hat -17.6 dB before, the open lane\'s trim since), and the clap declares a timbre, so a cell can ask for it over the snare', async () => {
  const { recipeById } = await import('../src/recipes.ts');
  const { TIMBRES } = await import('@deep-house/engine/voices');
  const r = recipeById('house/disco-house')!;
  const spell = { ...HOUSE, ember: 0.70, tide: 0.45, zephyr: 0.60, root: 0.60, spark: 0.40 };
  const t = planTheme('11', 0, { strategy: 'house-v2', spell, recipe: r });
  const loose = programOf(t).events.filter(e => e.voice === 'hatLoose');
  assert.ok(loose.length > 100);
  const db = 20 * Math.log10(loose.reduce((a, e) => a + (e.p.gain ?? 1), 0) / loose.length);
  assert.ok(db > -13 && db < -8, `the asked loose hat at ${db.toFixed(1)} dB`);
  const clap = (TIMBRES as any).clap, snare = (TIMBRES as any).snare, rim = (TIMBRES as any).rimshot;
  assert.ok(clap && clap.family === 'drum' && clap.struck && Number.isFinite(clap.loudnessDb));
  assert.ok(clap.hold > snare.hold && clap.hold > rim.hold, 'a holdMin over the snare\'s asks for the clap alone');
});

// Round GA4: the parts the families still lacked after GA3's measurement, each
// a family of the style with a window on the derived state that keeps it off
// the house, and each a rule inside its window (chance 1), withdrawn only by
// the scene or an earlier family's claim. `notes/rounds/genres-ga4.md`.
test('GA4: the held mid part, the percussion loop, the lazy kit, the break ghosts and the house stab each play inside their window and nowhere else — never at the house, never under 27191\'s spell — and every eligible theme in the window carries its part unless the scene or an earlier family took the role', () => {
  const windows: Array<[string, string, object]> = [
    ['held-mid', 'fast four-floor', { ember: 0.75, root: 0.60, zephyr: 0.50, veil: 0.60 }],
    ['perc-loop', 'fast four-floor', { ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }],
    ['lazy-kit', 'the slow band', { ember: 0.30, tide: 0.70, root: 0.55 }],
    ['ghost-backbeat', 'the broken kit', { ember: 0.72, spark: 0.70, tide: 0.45, zephyr: 0.65 }],
    ['bright-stab', 'a bright four-floor', { zephyr: 0.65, root: 0.55, spark: 0.40 }],
  ];
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const trace = (t: Plan) => JSON.parse(String(t.dice.composition));
  for (const [fam, where, pull] of windows) {
    let on = 0, eligible = 0;
    for (let seed = 1; seed <= 20; seed++) for (let n = 0; n < 3; n++) {
      const t = planTheme(seed, n, { strategy: 'house-v2', spell: { ...HOUSE, ...pull }, library: [] });
      const tr = trace(t);
      if (tr.selected[fam]) { on++; eligible++; continue; }
      const why = tr.skipped.find((x: any) => x.family === fam)?.reason ?? '';
      if (why === 'chance') assert.fail(`${fam} ${seed}#${n}: drawn by a coin`);
      if (why !== 'compatibility') eligible++;
      assert.ok(why === 'compatibility' || why === 'scene' || /reserved|occupied|budget/.test(why), `${fam} ${seed}#${n} (${where}): skipped for ${why}`);
    }
    assert.ok(on >= 10, `${fam}: ${on} of 60 themes under its key carry it`);
    for (const [name, spell] of [['the house', HOUSE], ['27191', bench]] as const)
      for (let seed = 1; seed <= 20; seed++) assert.ok(!trace(planTheme(seed, 0, { strategy: 'house-v2', spell, library: [] })).selected[fam], `${fam} at ${name}, seed ${seed}`);
  }
});

// Round GA6: everything but the drums, by place (birds and tempo, never a
// name). `notes/rounds/genres-ga6.md`.
test('GA6: the place tables — harmony, form, effects, the bass\'s sound — play where the birds stand nearest their place and nowhere at the house\'s birds, at any tempo; the house\'s own progression and form are what they were', async () => {
  const { nearestEntry, HOUSE_PLACE, placeDistance } = await import('../src/places.ts');
  const P = (style as any).places;
  for (const [name, table] of Object.entries(P) as Array<[string, any]>) {
    // a place table's entries stand at places (the zones, PLAN-ZONES, are boxes and are `tools/check-zones.ts`'s)
    if (!Array.isArray(table) || !table[0]?.place) continue;
    const ids = new Set<string>();
    for (const e of table) {
      assert.ok(!ids.has(e.id), `${name}: ${e.id} twice`); ids.add(e.id);
      assert.ok(!/dnb|techno|trance|dub|garage|house|ambient|downtempo|breaks|genre/.test(e.id), `${name}: ${e.id} names a style`);
      const mid = { ...HOUSE, ...e.place.birds };
      assert.equal(nearestEntry(table, mid, (e.place.tempo[0] + e.place.tempo[1]) / 2)?.place, e.place, `${name}: ${e.id} is not nearest at its own place`);
    }
    // the house's birds at every Ember's tempo: the house's own tables
    for (let bpm = 40; bpm <= 180; bpm += 5) assert.equal(nearestEntry(table, HOUSE, bpm), null, `${name}: an entry plays at the house's birds at ${bpm} BPM`);
  }
  assert.equal(placeDistance(HOUSE_PLACE, HOUSE, 170), 0);
  // the golden themes' progressions and sections: the house's own (the program digest holds them to the byte too)
  const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), placeTables: false } } as typeof style;
  for (const [m, k] of [['1', 6], ['92970', 4], ['21323', 4]] as const) for (let n = 0; n < k; n++) {
    const a = planTheme(m, n, { strategy: 'house-v2' }), b = planTheme(m, n, { style: off, preset: 'auto' });
    assert.deepEqual(a.progression.chords.map(c => c.label), b.progression.chords.map(c => c.label), `${m}#${n}`);
    assert.deepEqual(a.arrangement.sections.map(s => s.kind), b.arrangement.sections.map(s => s.kind), `${m}#${n}`);
  }
});

test('GA6: away from the house the chords walk their place\'s cycle, the sections its orders and the rota leans its effects — a slow minor cycle at the fast broken place, one chord at the deep still place, a two-chord seventh vamp at the bright four, the anthem turns at the high four, a slow modal drift at the floating place', () => {
  const at = (birds: object) => ({ ...HOUSE, ...birds });
  const cases: Array<[string, object, (t: Plan) => boolean]> = [
    // the fast broken place's chords step back behind the bass line since round DNB-6 (10-05): two to four chords, a phrase or half of one each
    ['fast broken', { ember: 0.95, spark: 0.85, zephyr: 0.70, root: 0.60, veil: 0.60 }, t => t.progression.chords.length >= 2 && t.progression.changeEvery >= 4],
    ['deep still', { ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }, t => t.progression.chords.length === 1],
    ['bright four', { ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }, t => t.progression.chords.length === 2 && t.progression.loopBars === 4],
    ['high four', { ember: 0.88, root: 0.60, zephyr: 0.50, veil: 0.60 }, t => t.progression.chords.length === 4 && t.arrangement.sections.filter(s => s.kind === 'build').length >= 1],
    ['floating', { ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, loom: 0.80, spark: 0 }, t => t.progression.changeEvery === 4],
  ];
  for (const [name, birds, holds] of cases) {
    let ok = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const t = planTheme(seed, 1, { strategy: 'house-v2', spell: at(birds), library: [] });
      if (holds(t)) ok++;
      assert.ok(t.treatmentWeights && t.treatmentWeights.some(w => w > 1.5), `${name} ${seed}: the rota is not leaned`);
    }
    assert.ok(ok >= 6, `${name}: ${ok} of 8 themes play the place's harmony and form`);
  }
});

test('GA6: the mids and highs — a held lead over the high four, a climbing pluck at the bright four, a stab over a two-tone line on the broken kit, a chord into the echo at the deep still place, wide chords where it floats — each a rule inside its window, never at the house or under 27191\'s spell', () => {
  const trace = (t: Plan) => JSON.parse(String(t.dice.composition));
  const where: Array<[string, object]> = [
    ['lead-line', { ember: 0.88, root: 0.60, zephyr: 0.50, veil: 0.60 }],
    ['arp-line', { ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }],
    ['stab-and-two-tone', { ember: 0.72, spark: 0.70, tide: 0.45, zephyr: 0.65 }],
    ['echo-chord', { ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 }],
    ['wide-chords', { ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, loom: 0.80, spark: 0 }],
  ];
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  for (const [fam, birds] of where) {
    let on = 0;
    for (let seed = 1; seed <= 12; seed++) for (let n = 0; n < 3; n++) {
      const tr = trace(planTheme(seed, n, { strategy: 'house-v2', spell: { ...HOUSE, ...birds }, library: [] }));
      if (tr.selected[fam]) on++;
      else assert.notEqual(tr.skipped.find((x: any) => x.family === fam)?.reason, 'chance', `${fam}: a coin`);
    }
    assert.ok(on >= 8, `${fam}: ${on} of 36`);
    for (const [name, spell] of [['the house', HOUSE], ['27191', bench]] as const)
      for (let seed = 1; seed <= 12; seed++) assert.ok(!trace(planTheme(seed, 0, { strategy: 'house-v2', spell, library: [] })).selected[fam], `${fam} at ${name}`);
  }
});

test('GA6: the kitchen\'s voices play where a place names them and nowhere else — the sine line at the fast broken place, the driven bass at the broken drive, the resonant line at the driving four, the shimmer holding where it floats, the wide saw holding at the high four, the struck organ on the stab at the bright four — each a swap on a lane that already plays a voice as dear, in no list the registry widens, never at the house or under 27191\'s spell; the echo counts as a spatial return', async () => {
  const { BY_PLACE, AWAITING } = await import('../src/catalogue-v2.ts');
  const { costOfVoices, BY_NAME } = await import('@deep-house/engine/voices');
  const kitchen = BY_PLACE.map(e => e.id);
  const at = (birds: object) => ({ ...HOUSE, ...birds });
  // A place's own set beyond the one voice measured: the fast broken place
  // plays its deep reese where Root is up (DNB-1) and its tight kick and dry
  // snare (DNB-2) — rows of its drums map, not swaps on another place's lane;
  // since 10-06 its liquid kit (the kit row's kick, snare, ghost and two hats)
  // and the clean sine line, which is the bass it is measured by.
  // Since liquid-space round 1 also its sparse keys, a part of its own (`KEYS`): the tones its draw row names.
  // since liquid-space (10-11) its surface's dark air too (the development table's, `DEVELOPMENT`)
  const own: Record<string, string[]> = { 'fast broken': ['reeseDeep', 'kickTight', 'snareDry', 'reeseBass', 'kickPunchHigh', 'snareCrack', 'snareGhost', 'hatShut', 'hatSoft',
    'pianoClose', 'pianoConcert', 'fmEpSoft', 'fmEpGlass', 'pianoFelt', 'keysSuitcase', 'keysTineDark', 'airBed',
    // since liquid-ambient (10-11) its weather family's four rows (`AMBIENT_VOICES`)
    'weatherWind', 'weatherUpperAir', 'weatherRain', 'weatherRumble'] };
  const where: Array<[string, object, string]> = [
    ['fast broken', { ember: 0.95, spark: 0.85, zephyr: 0.70, root: 0.60, veil: 0.60 }, 'reeseSub'],
    ['broken drive', { ember: 0.72, spark: 0.70, tide: 0.45, zephyr: 0.65 }, 'reeseDriven'],
    ['driving four', { ember: 0.75, root: 0.60, zephyr: 0.50, veil: 0.60 }, 'line303'],
    ['floating', { ember: 0.10, tide: 0.85, zephyr: 0.90, root: 0.50, veil: 0.30, loom: 0.80, spark: 0 }, 'shimmerPad'],
    ['high four', { ember: 0.88, root: 0.60, zephyr: 0.50, veil: 0.60 }, 'supersawLead'],
    ['bright four', { ember: 0.70, spark: 0.40, zephyr: 0.60, root: 0.60, tide: 0.45 }, 'organStab'],
  ];
  for (const [name, birds, voice] of where) {
    let on = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const t = planTheme(seed, 1, { strategy: 'house-v2', spell: at(birds), library: [] });
      const heard = new Set(t.events.map(e => e.voice));
      if (heard.has(voice)) on++;
      // one place, one of the kitchen's voices per lane it swaps
      for (const k of kitchen) if (k !== voice && !(own[name] ?? []).includes(k) && heard.has(k)) {
        const other = where.find(w => w[2] === k);
        assert.fail(`${name} ${seed}: ${k} plays, which is ${other ? other[0] + '\'s' : 'another place\'s own'}`);
      }
    }
    // The organ is the stab's, and the climbing pluck takes the keys where the
    // air is up (the bright four's own family), so it is heard less: measured.
    assert.ok(on >= (voice === 'organStab' ? 1 : 6), `${name}: ${voice} in ${on} of 8`);
    // a swap: as dear as the lane's incumbent or cheaper
    const lane = BY_NAME[voice].family === 'bass' ? 'sub' : voice === 'organStab' ? 'keys' : 'pad';
    assert.ok(costOfVoices([voice]) <= costOfVoices([lane]), `${voice} costs more than ${lane}`);
  }
  // in no list the registry widens: every candidate list and timbre list of house-v2
  for (const c of (style.candidates as any[])) for (const e of c.list()) assert.ok(!kitchen.includes(String(e.v ?? e)), `${c.id} names ${e.v ?? e}`);
  assert.ok(AWAITING.some(a => a.id === 'siren'), 'the siren has a lane of its own it could take, and none was written');
  // never at the house, at any tempo, or under 27191's spell
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  for (const spell of [HOUSE, bench]) for (let seed = 1; seed <= 10; seed++) for (const n of [0, 1, 2]) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell, library: [] });
    for (const e of t.events) assert.ok(!kitchen.includes(e.voice) && !e.p?.echo, `seed ${seed}#${n}: ${e.voice} at the house's birds`);
  }
  // a swapped bass is the lane's, so the faster family's lighter bass leans it
  {
    const { knobsFor } = await import('../src/spell.ts');
    const { VOICE_KNOBS } = await import('@deep-house/engine/voices') as any;
    const spell = at({ ...where[0][1], tide: 0.85 });
    const t = planTheme(1, 1, { strategy: 'house-v2', spell, library: [] });
    const asked = knobsFor(spell, { reeseBass: VOICE_KNOBS.reeseBass }).reeseBass?.mass ?? VOICE_KNOBS.reeseBass.mass.default;
    // Restated in the DNB-2 landing (10-02): the fast broken place keeps its
    // bass's body — the tempo's lean to a lighter bass no longer reaches it
    // (his ask: a full-body bass under the drive) — so the mass is never
    // leaned under what the spell asks.
    assert.ok((t.knobs?.reeseBass?.mass ?? asked) >= asked, `the rolling bass's mass ${t.knobs?.reeseBass?.mass} is leaned under ${asked} at the fast broken place`);
  }
  // the echo is a spatial return, held by the composition's limit
  const { partUsage } = await import('../src/composition.ts');
  assert.equal(partUsage({ bassMotif: null, heldBass: false, struckFigures: [], texture: null, rhythm: [], tone: {}, ambience: { figure: 'echo' }, presence: {}, pedalHarmony: false }, style).spatialReturns, 1);
});

test('liquid-fix: a phrase run\'s gestures ride the notes they belong to — S\'s opening fall and flick on every theme, the register chosen once, nothing under home but S\'s own settle; the loader refuses the old knots', async (ctx) => {
  const { validatePhrase, runPitch } = await import('../src/mined-phrase.ts');
  const row = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-mined.json', import.meta.url), 'utf8')).wants.riff;
  const run = row.phrase.runs[0];
  const spec = (r: object) => ({ ...row.phrase, runs: [{ ...run, ...r }] });
  assert.doesNotThrow(() => validatePhrase(spec({}), row.shapes));
  // the knots of revision 8 (a shape note and an offset on every pitch knot) and an anchor naming no note
  assert.throws(() => validatePhrase(spec({ pitch: [[0, 'B', 1, 1.7], [30, 'A', 2, 0]] }), row.shapes), /pitch knot 0 needs 2 fields/);
  assert.throws(() => validatePhrase(spec({ anchors: undefined }), row.shapes), /anchors needs/);
  assert.throws(() => validatePhrase(spec({ anchors: [[0, 'B', 9], [30, 'home']] }), row.shapes), /anchor 0/);
  assert.throws(() => validatePhrase(spec({ anchors: [[0, 'away'], [30, 'home']] }), row.shapes), /anchor 0/);
  // the path: a hold, a straight travel between two notes, and the residual over it
  const path = runPitch({ anchors: [[0, 3], [2, 3], [4, 7]], pitch: [[0, 1], [3, -1], [4, 0]] });
  assert.deepEqual(path.map(([s]) => s), [0, 2, 3, 4]);
  path.forEach(([, v], i) => assert.ok(Math.abs(v - [4, 8 / 3, 4, 7][i]) < 1e-12, `path knot ${i}: ${v}`));
  // the scoop (liquid-desk) scales the residual alone: at nought the anchors' plain path, at a half half the gesture
  const plain = runPitch({ anchors: [[0, 3], [2, 3], [4, 7]], pitch: [[0, 1], [3, -1], [4, 0]] }, 0);
  plain.forEach(([, v], i) => assert.ok(Math.abs(v - [3, 3, 5, 7][i]) < 1e-12, `plain knot ${i}: ${v}`));
  const half = runPitch({ anchors: [[0, 3], [2, 3], [4, 7]], pitch: [[0, 1], [3, -1], [4, 0]] }, 0.5);
  half.forEach(([, v], i) => assert.ok(Math.abs(v - [3.5, 3 - 1 / 6, 4.5, 7][i]) < 1e-12, `half knot ${i}: ${v}`));
  // over themes: the opening run falls 0.89 semitones to its second knot (S's fall on its own note, never the
  // distance between two rolled notes), its double slide rises 11.2 semitones out of its dip, and no run of the
  // phrase sounds more than S's 0.39 semitones under the line's home
  const spell = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 };
  // the riff as its phrase lays it (the planners alone), every rule held; and as the app plays it (the producer's
  // arrangement re-cuts the line on purpose: its shifted, octaved and developed notes, `tools/as-played.ts`), every
  // rule held but the re-cut runs', which are counted
  const runRules = (style: object, check: (ok: unknown, says: string) => void) => {
    let openings = 0;
    for (const seed of [1, 2, 6, 30, 27191, 39]) {
      const t = planTheme(seed, 0, { strategy: 'house-v2', style, spell });
      const program = programOf(t), sixteenth = program.barSeconds / 16;
      const runs = program.events.filter((e) => e.voice === 'reeseSub' && typeof e.p.curveDuration === 'number');
      check(runs.length > 0, `seed ${seed}: no phrase runs`);
      // a phrase cycle opens with its run of thirty sixteenths; the line's home in it is where most of its runs end
      // (a line off the pedal moves its home with the chord)
      const cycles: (typeof runs)[] = [];
      for (const e of [...runs].sort((a, b) => a.t - b.t)) {
        if (!cycles.length || Math.round(e.p.curveDuration / sixteenth) === 30) cycles.push([]);
        cycles[cycles.length - 1].push(e);
      }
      for (const cycle of cycles) {
        const ends = cycle.map((e) => Math.round(e.p.midi + e.p.bend[e.p.bend.length - 1]));
        const home = [...ends].sort((a, b) => ends.filter((x) => x === b).length - ends.filter((x) => x === a).length)[0];
        for (const e of cycle) {
          const b = e.p.bend as number[], at = (i: number) => e.p.midi + b[i];
          // under home only by S's own settle, and by the after-kick sag (liquid-k10), never under the floor less S's settle
          const sag = row.phrase.afterKick?.knobs.sagMaxSt.default ?? 0;
          for (let i = 1; i < b.length; i += 2) {
            check(at(i) >= home - 0.3865 - sag - 1e-9, `seed ${seed} bar ${e.bar}: ${at(i).toFixed(2)} under home ${home}`);
            check(at(i) >= row.play.floor - 0.3865, `seed ${seed} bar ${e.bar}: ${at(i).toFixed(2)} under the floor`);
          }
          if (Math.round(e.p.curveDuration / sixteenth) !== 30) continue; // the opening run, thirty sixteenths whole
          openings++;
          check(Math.abs(b[3] - b[1] + 0.8927) < 1e-3, `seed ${seed} bar ${e.bar}: the opening moves ${(b[3] - b[1]).toFixed(2)} st`);
          let rise = 0;
          for (let i = 3; i < b.length; i += 2) rise = Math.max(rise, b[i] - b[i - 2]);
          check(Math.abs(rise - 7.786) < 1e-3, `seed ${seed} bar ${e.bar}: the flick rises ${rise.toFixed(3)} in one knot`);
        }
      }
    }
    return openings;
  };
  assert.ok(runRules(await planners(), (ok, says) => assert.ok(ok, says)) >= 6);
  const app = faults();
  runRules(APP_STYLE(), app.check);
  asPlayed(ctx, app.out, RIFF_DEPARTURES, riffTally);
});

test('liquid-clock: the riff row\'s optional pairClock beats the pair on the grid — the grid\'s rate, troughs where the row says, from theme time, riding the grid on a ride; absent, the voice\'s own spacing and phase as before; the loader refuses a malformed one', async () => {
  const { validatePairClock, pairClockAt } = await import('../src/glide.ts');
  const row = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-mined.json', import.meta.url), 'utf8')).wants.riff;
  assert.doesNotThrow(() => validatePairClock({ perBeat: 2, trough: 0 }));
  assert.doesNotThrow(() => validatePairClock({ perBeat: 0.25, trough: 0.999 }));
  for (const bad of [null, [], 2, {}, { perBeat: 2 }, { trough: 0 }, { perBeat: 0, trough: 0 }, { perBeat: 5, trough: 0 }, { perBeat: -2, trough: 0 },
    { perBeat: '2', trough: 0 }, { perBeat: Number.NaN, trough: 0 }, { perBeat: 2, trough: 1 }, { perBeat: 2, trough: -0.1 }, { perBeat: 2, trough: 0, hz: 5.8 }])
    assert.throws(() => validatePairClock(bad), /pairClock/, JSON.stringify(bad));
  // the resolution: 5.8 Hz at 174 BPM two to the beat; the trough (the phase's half turn) on each eighth, or half a cycle after it
  const beat = 60 / 174, eighth = beat / 2;
  for (const k of [0, 1, 7, 333, 2001]) {
    const on = pairClockAt({ perBeat: 2, trough: 0 }, beat, k * eighth), off = pairClockAt({ perBeat: 2, trough: 0.5 }, beat, k * eighth);
    assert.equal(on.hz, 5.8);
    const turn = (x: number) => Math.min(Math.abs(x), 1 - Math.abs(x));
    assert.ok(turn(on.phase - 0.5) < 1e-5, `eighth ${k}: the trough on the eighth (${on.phase})`);
    assert.ok(turn(off.phase) < 1e-5, `eighth ${k}: the crest on the eighth (${off.phase})`);
    assert.ok(turn(pairClockAt({ perBeat: 1, trough: 0.25 }, beat, k * beat + beat / 4).phase - 0.5) < 1e-5, `beat ${k}: a quarter of the way in`);
  }
  // over themes, every note the riff plays
  const clock = row.play.pairClock;
  const own = JSON.parse(readFileSync(new URL('../../engine/sounds/bass/reeseSub.json', import.meta.url), 'utf8')).descriptor.controls;
  const spell = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 };
  let notes = 0;
  for (const seed of [1, 2, 6, 30]) {
    const program = programOf(planTheme(seed, 0, { strategy: 'house-v2', spell })), beatS = program.barSeconds / 4;
    for (const e of program.events) {
      if (e.voice !== 'reeseSub') continue;
      notes++;
      const hz = clock ? pairClockAt(clock, beatS, 0).hz : own.subBeatHz.default;
      const drift = ((e.p.subBeatPhase - e.t * hz - (clock ? 0.5 - clock.trough : own.subBeatPhase.default)) % 1 + 1) % 1;
      assert.ok(Math.min(drift, 1 - drift) < 1e-4, `seed ${seed} bar ${e.bar}: phase ${e.p.subBeatPhase} off the ${clock ? 'grid' : 'theme clock'} by ${drift}`);
      if (clock) {
        assert.equal(e.p.subBeatHz, hz, `seed ${seed} bar ${e.bar}: the grid's rate`);
        assert.deepEqual(e.p.gridRates, ['subBeatHz'], `seed ${seed} bar ${e.bar}: the rate rides the grid`);
      } else assert.ok(e.p.subBeatHz === undefined && e.p.gridRates === undefined, `seed ${seed} bar ${e.bar}: a rate written with no clock`);
    }
  }
  assert.ok(notes >= 100, `${notes} notes`);
});

test('liquid-k10: after the step-10 kick a run held flat and without its pair through the step-12 snare flicks on the kick and sags through the snare, riding its own path, lifted over the floor; nothing else moves', async (ctx) => {
  const { validatePhrase, withAfterKick, runPitch, pathAt, afterKickAt } = await import('../src/mined-phrase.ts');
  const row = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-mined.json', import.meta.url), 'utf8')).wants.riff;
  const spec = row.phrase.afterKick;
  assert.ok(spec, 'the riff row declares afterKick');
  const rule = afterKickAt(spec);
  assert.throws(() => validatePhrase({ ...row.phrase, afterKick: { ...spec, snare: 10 } }, row.shapes), /afterKick/);
  assert.throws(() => validatePhrase({ ...row.phrase, afterKick: { ...spec, fallSteps: 2 } }, row.shapes), /afterKick/);
  // a run from step 4 for twelve sixteenths held on home, no pair: the kick is its step 6, the snare its step 8
  const held = { step: 4, len: 12, press: false, anchors: [[0, 0], [12, 0]] as [number, number][], pitch: [[0, 0], [12, 0]] as [number, number][],
    level: [[0, 1], [12, 1]] as [number, number][], pair: [[0, 0], [12, 0]] as [number, number][] };
  const g = withAfterKick(held, rule, -10);
  const path = runPitch(g), at = (s: number) => pathAt(path, s);
  assert.ok(Math.abs(at(6)) < 1e-12 && Math.abs(at(6 + rule.peakSteps) - rule.flickSt) < 1e-9, 'the flick: from the path on the kick to flickSt over the note');
  const land = 6 + rule.peakSteps + rule.fallSteps, depth = Math.min(rule.sagStPerStep * (12 - land), rule.sagMaxSt);
  assert.ok(Math.abs(at(land)) < 1e-9 && Math.abs(at(12) + depth) < 1e-9, 'the sag: from the landing to the run\'s end');
  assert.ok(at(8) < at(land) && at(8) > at(12), 'moving at the snare');
  // the floor: the same sag lifted so the line never goes under it
  const lifted = runPitch(withAfterKick(held, rule, -0.39));
  assert.ok(Math.min(...lifted.map(([, v]) => v)) >= -0.39 - 1e-9 && Math.abs(pathAt(lifted, 12) + 0.39) < 1e-9);
  // not where the pair wobbles at the snare, nor where the line already moves after it, nor before the kick
  assert.deepEqual(withAfterKick({ ...held, pair: [[0, 1], [12, 1]] }, rule, -10), { ...held, pair: [[0, 1], [12, 1]] });
  const moving = { ...held, pitch: [[0, 0], [8.5, 0], [9, 3], [9.5, 0], [12, 0]] as [number, number][] };
  assert.deepEqual(withAfterKick(moving, rule, -10), moving);
  assert.deepEqual(withAfterKick({ ...held, step: 11, len: 5 }, rule, -10), { ...held, step: 11, len: 5 });
  // a run held into the next bar: its sag bottoms out a sixteenth before that bar's kick, on no knot of the path, and
  // the floor holds there and over the taper back
  const long = { ...held, step: 0, len: 32, anchors: [[0, 0], [32, 0]] as [number, number][], pitch: [[0, 0], [32, 0]] as [number, number][],
    level: [[0, 1], [32, 1]] as [number, number][], pair: [[0, 0], [32, 0]] as [number, number][] };
  const floored = runPitch(withAfterKick(long, rule, -0.5));
  for (let s = rule.step + rule.peakSteps + rule.fallSteps; s <= 26; s += 0.125) assert.ok(pathAt(floored, s) >= -0.5 - 1e-9, `step ${s}: ${pathAt(floored, s)} under the floor`);
  // fuzz: over random paths, floors under them (the register's, as the line's own path never goes under its floor)
  // and knob settings, wherever a gesture has landed the line stays over the floor
  const fuzz = new Rng('afterkick-fuzz');
  for (let n = 0; n < 400; n++) {
    const len = 12 + Math.floor(fuzz.float() * 21), step = Math.floor(fuzz.float() * 8);
    const anchors: [number, number][] = [[0, 0]];
    for (let s = 2 + Math.floor(fuzz.float() * 6); s < len; s += 2 + Math.floor(fuzz.float() * 8)) if (s + 0.5 < len) anchors.push([s, anchors.at(-1)![1]], [s + 0.5, Math.round(fuzz.float() * 6 - 3)]);
    anchors.push([len, anchors.at(-1)![1]]);
    const pitch: [number, number][] = [[0, 0]];
    for (let s = 1 + fuzz.float() * 3; s < len; s += 1 + fuzz.float() * 4) pitch.push([s, (fuzz.float() - 0.5) * 0.8]);
    pitch.push([len, 0]);
    const run = { step, len, press: false, anchors, pitch, level: [[0, 1], [len, 1]] as [number, number][], pair: [[0, 0], [len, 0]] as [number, number][] };
    const r = afterKickAt(spec, { flickSt: fuzz.float() * 12, sagStPerStep: fuzz.float(), sagMaxSt: fuzz.float() * 3 });
    const before = runPitch(run), lowest = Math.min(...before.map(([, v]) => v)) - fuzz.float() * 1.5;
    const after = runPitch(withAfterKick(run, r, lowest));
    for (let bar = 0; bar * 16 < step + len; bar++) {
      const land = bar * 16 + r.step - step + r.peakSteps + r.fallSteps;
      for (let s = Math.max(0, land); s <= Math.min(len, bar * 16 + r.step - step + 16); s += 0.0625)
        assert.ok(pathAt(after, s) >= lowest - 1e-9, `fuzz ${n} step ${s}: ${pathAt(after, s)} under ${lowest}`);
    }
  }
  // over themes: every phrase run that sounds from the kick through the snare without its pair is not flat there
  const spell = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 };
  // the riff as its phrase lays it (as liquid-fix reads it), and as the app plays it, the re-cut runs counted
  const flatRules = (style: object, check: (ok: unknown, says: string) => void) => {
    let gestures = 0;
    for (const seed of [1, 2, 6, 30, 27191, 39]) {
      const program = programOf(planTheme(seed, 0, { strategy: 'house-v2', style, spell })), sixteenth = program.barSeconds / 16;
      for (const e of program.events) {
        if (e.voice !== 'reeseSub' || typeof e.p.curveDuration !== 'number') continue;
        const b = e.p.bend as number[], knots: [number, number][] = [];
        for (let i = 0; i < b.length; i += 2) knots.push([b[i] / sixteenth, b[i + 1]]);
        for (let k = rule.step - e.step; k + 2 < e.p.dur / sixteenth; k += 16) {
          if (k < 0) continue;
          const pair = e.p.subBeatCurve ? pathAt(Array.from({ length: e.p.subBeatCurve.length / 2 }, (_, i) => [e.p.subBeatCurve[2 * i] / sixteenth, e.p.subBeatCurve[2 * i + 1]] as [number, number]), k + 2) : 0;
          if (pair >= 0.2) continue;
          const snare = pathAt(knots, k + 2), clear = Math.min(k + 2 + rule.clearSteps, e.p.dur / sixteenth);
          const after = [k + 2, clear, ...knots.map(([s]) => s).filter((s) => s > k + 2 && s < clear)];
          if (after.some((s) => Math.abs(pathAt(knots, s) - snare) > rule.flatSt)) continue; // it moves right after the snare
          const top = Math.max(...knots.filter(([s]) => s > k && s < k + 2).map(([, v]) => v), -99);
          check(top - snare >= 4, `seed ${seed} bar ${e.bar}: held flat from the kick through the snare`);
          gestures++;
        }
      }
    }
    return gestures;
  };
  const gestures = flatRules(await planners(), (ok, says) => assert.ok(ok, says));
  const app = faults();
  flatRules(APP_STYLE(), app.check);
  asPlayed(ctx, app.out, RIFF_DEPARTURES, riffTally);
  assert.ok(gestures >= 30, `${gestures} gestures`);
});

test('liquid-desk-2: the definition\'s numbers as knobs — the accents\' edge, the after-kick flick and sag, the drop push — the written phrase at every default, each knob held to its range', async () => {
  const { validatePhrase, withAfterKick, runPitch, pathAt, afterKickAt, knobAt, PHRASE_KNOBS, AFTER_KICK_KNOBS } = await import('../src/mined-phrase.ts');
  const { DRUMS_KNOBS, drumsKnobOf, drumsKnobFaults } = await import('../src/places.ts');
  const { DRUMS } = await import('../src/styles/deep-house-places.ts');
  const row = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-mined.json', import.meta.url), 'utf8')).wants.riff;
  const phrase = row.phrase, spec = phrase.afterKick;
  assert.deepEqual(Object.keys(phrase.knobs).sort(), [...PHRASE_KNOBS].sort());
  assert.deepEqual(Object.keys(spec.knobs).sort(), [...AFTER_KICK_KNOBS].sort());
  // the defaults are the numbers the rows carried (liquid-k10's measured gesture, the definition round's push)
  assert.deepEqual(afterKickAt(spec), { step: 10, snare: 12, pairUnder: 0.6, flatSt: 1.0, clearSteps: 1.5, flickSt: 7.0, peakSteps: 0.35, fallSteps: 0.85, sagStPerStep: 0.31, sagMaxSt: 1.2, underFloorSt: 0.39 });
  assert.equal(knobAt(phrase.knobs.edge), 1);
  // a setting is held to its range; a knob's number written beside its knob is refused, as is a range past its bounds
  assert.equal(afterKickAt(spec, { flickSt: 99 }).flickSt, spec.knobs.flickSt.max);
  assert.throws(() => validatePhrase({ ...phrase, afterKick: { ...spec, flickSt: 7 } }, row.shapes), /as numbers/);
  assert.throws(() => validatePhrase({ ...phrase, afterKick: { ...spec, knobs: { ...spec.knobs, sagMaxSt: { unit: 'st', min: 0, max: 9, default: 1.2 } } } }, row.shapes), /sagMaxSt/);
  assert.throws(() => validatePhrase({ ...phrase, knobs: { ...phrase.knobs, edge: { unit: 'x', min: 0, max: 9, default: 1 } } }, row.shapes), /edge/);
  // the flick and the sag follow their knobs on a held run; the scoop scales the whole residual, the gesture with it
  const held = { step: 4, len: 12, press: false, anchors: [[0, 2], [12, 2]] as [number, number][], pitch: [[0, 0], [12, 0]] as [number, number][],
    level: [[0, 1], [12, 1]] as [number, number][], pair: [[0, 0], [12, 0]] as [number, number][] };
  const at = (r: typeof held, s: number, scoop = 1) => pathAt(runPitch(r, scoop), s);
  const rule = afterKickAt(spec), taller = afterKickAt(spec, { flickSt: 10, sagStPerStep: 0, sagMaxSt: 0 });
  const peak = 6 + rule.peakSteps;
  assert.ok(Math.abs(at(withAfterKick(held, rule, -10), peak) - (2 + 7)) < 1e-9);
  assert.ok(Math.abs(at(withAfterKick(held, taller, -10), peak) - (2 + 10)) < 1e-9 && Math.abs(at(withAfterKick(held, taller, -10), 12) - 2) < 1e-9, 'no sag at nought');
  assert.ok(Math.abs(at(withAfterKick(held, rule, -10), peak, 0.5) - (2 + 3.5)) < 1e-9, 'half the scoop, half the flick over the anchor');
  assert.ok(runPitch(withAfterKick(held, rule, -10), 0).every(([, v]) => v === 2), 'at no scoop the anchors\' plain path');
  // the edge on the body knots: g × 1 + 0 is g, nought is no accent, two doubles every distance from one
  const edged = (g: number, edge: number) => Math.max(0, Math.min(8, g * edge + (1 - edge)));
  for (const run of phrase.runs) for (const [, g] of run.body ?? []) {
    assert.equal(edged(g, 1), g);
    assert.equal(edged(g, 0), 1);
    assert.ok(Math.abs(edged(g, 2) - (1 + 2 * (g - 1))) < 1e-12);
  }
  // the place's drop push is a knob at its path, the fast places' nought its default, inside its range
  assert.ok(DRUMS_KNOBS['push.dropLevel']);
  const fast = DRUMS.filter((d) => d.push?.dropLevel !== undefined);
  assert.ok(fast.length >= 2 && fast.every((d) => drumsKnobOf(d, 'push.dropLevel') === 0 && drumsKnobOf(d, 'bassDb') === 5));
  assert.deepEqual(drumsKnobFaults({ ...fast[0], push: { dropLevel: 1.5 } }), [`${fast[0].id}: push.dropLevel 1.5 is outside its 0 to 1`]);
  assert.deepEqual(DRUMS.flatMap(drumsKnobFaults), []);
});

test('liquid-riffs-2: several riffs a place — the Liquid key keeps V on every seed, each riff reachable where the birds move toward its corner, drawn by the table\'s weights; the adopted rows play V\'s body and none of V\'s own rules; the loader refuses a malformed riff by name', async () => {
  const { RIFF_IDS, RIFF_DEFAULT, riffOf, drawRiff, riffTableFaults, loadRiff } = await import('../src/glide.ts');
  const { RIFF } = await import('../src/styles/deep-house-places.ts');
  const V = 'dnb/riff-liquid-mined', ADOPTED = ['dnb/riff-liquid-held', 'dnb/riff-liquid-stairs'];
  assert.deepEqual([...RIFF_IDS].sort(), [V, ...ADOPTED].sort());
  assert.equal(RIFF_DEFAULT.id, V);
  assert.deepEqual(riffTableFaults(RIFF), []);
  // the centre: the Liquid key's spell, and the two fast places, draw V alone, so V's sound and links stay there
  const tile = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 };
  for (const e of RIFF.filter((x) => x.rows.length === 1)) assert.deepEqual(e.rows, [{ v: V, w: 1 }], e.id);
  for (let seed = 1; seed <= 48; seed++) {
    const t = planTheme(seed, 0, { strategy: 'house-v2', spell: tile }) as any;
    assert.equal(t.dice.riff, V, `seed ${seed}: the Liquid key plays ${t.dice.riff}`);
  }
  // each riff is reachable: at its corner's entry, over seeds, both it and V are drawn, and the drawn riff's runs play
  const sixteenths = (id: string) => new Set(riffOf(id)!.phrase!.runs.map((r) => r.len));
  for (const id of ADOPTED) {
    const entry = RIFF.find((e) => e.rows.some((r) => r.v === id))!;
    const spell = { ...HOUSE, ...entry.place.birds };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12 && seen.size < 2; seed++) {
      const t = planTheme(seed, 0, { strategy: 'house-v2', spell }) as any;
      seen.add(t.dice.riff);
      if (t.dice.riff !== id) continue;
      const program = programOf(t), sixteenth = program.barSeconds / 16;
      const runs = program.events.filter((e: any) => e.voice === 'reeseSub' && typeof e.p.curveDuration === 'number');
      assert.ok(runs.length > 0, `${id} seed ${seed}: no phrase runs`);
      // the run lengths are the row's (or cut at a section's end), its pair at V's share, no body accents, no press
      assert.ok(runs.some((e: any) => sixteenths(id).has(Math.round((e.p.curveDuration + riffOf(id)!.play.phraseGapS) / sixteenth))), `${id} seed ${seed}: its runs are not the row's`);
      assert.ok(runs.every((e: any) => !e.p.bodyCurve), `${id} seed ${seed}: a body accent, V's own`);
      assert.ok(runs.every((e: any) => Array.isArray(e.p.subBeatCurve) && e.p.subBeatCurve.filter((_: number, i: number) => i % 2).every((v: number) => v > 0)), `${id} seed ${seed}: the pair is off`);
    }
    assert.deepEqual([...seen].sort(), [id, V].sort(), `${entry.id}: drew ${[...seen]}`);
  }
  // the weights are the table's: the draw follows them, a row alone is always drawn, no entry is V's
  const held = { id: 't', place: RIFF[0].place, rows: [{ v: ADOPTED[0], w: 3 }, { v: V, w: 1 }] };
  let n = 0;
  for (let s = 0; s < 2000; s++) if (drawRiff(String(s), held).id === ADOPTED[0]) n++;
  assert.ok(Math.abs(n / 2000 - 0.75) < 0.03, `${n} of 2000 at 3 to 1`);
  assert.equal(drawRiff('1', { ...held, rows: [{ v: ADOPTED[1], w: 1 }] }).id, ADOPTED[1]);
  assert.equal(drawRiff('1', null).id, V);
  assert.deepEqual(riffTableFaults([{ ...held, rows: [{ v: 'dnb/nothing', w: 1 }, { v: V, w: 0 }] }]), ['t: dnb/nothing is not a riff row', `t: ${V} weighs 0`]);
  // the adopted rows: V's body (pair share 1, no body knots), none of V's own rules, V's play block whole (the place's)
  const vRow = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-mined.json', import.meta.url), 'utf8'));
  for (const id of ADOPTED) {
    const row = JSON.parse(readFileSync(new URL(`../recipes/genres/${id}.json`, import.meta.url), 'utf8'));
    assert.equal(row.id, id);
    assert.equal(row.weight, 0, `${id}: a riff is the place's, never the library's draw`);
    const r = row.wants.riff;
    // the place's way of playing a line is V's on every row, its floor too
    const { floor, ...play } = r.play, { floor: vFloor, ...vPlay } = vRow.wants.riff.play;
    assert.deepEqual(play, vPlay, `${id}: the play block is V's`);
    assert.equal(floor, vFloor, `${id}: floor ${floor}`);
    assert.equal(r.phrase.afterKick, undefined, `${id}: afterKick is V's`);
    for (const run of r.phrase.runs) {
      assert.ok(run.pair.every(([, s]: number[]) => s === 1), `${id} run ${run.step}: pair share`);
      assert.ok(run.body === undefined && run.press === undefined, `${id} run ${run.step}: V's body accents or press`);
    }
  }
  // the loader's refusals, by the row's name: past eight bars, a run past 32 sixteenths, a letter with no shape, no play, a bad clock or trim
  const stairs = JSON.parse(readFileSync(new URL('../recipes/genres/dnb/riff-liquid-stairs.json', import.meta.url), 'utf8'));
  const bad = (edit: (r: any) => void) => { const row = structuredClone(stairs); edit(row.wants.riff); return () => loadRiff(row); };
  assert.doesNotThrow(bad(() => {}));
  assert.throws(bad((r) => { r.phrase.bars = 9; }), /riff row dnb\/riff-liquid-stairs: mined phrase: bars/);
  assert.throws(bad((r) => { r.phrase.runs[0].len = 33; }), /dnb\/riff-liquid-stairs: .*run 0/);
  assert.throws(bad((r) => { r.form[0] = 'Z'; }), /dnb\/riff-liquid-stairs: its form/);
  assert.throws(bad((r) => { delete r.play; }), /dnb\/riff-liquid-stairs: .*play block/);
  assert.throws(bad((r) => { r.play.pairClock = { perBeat: 9, trough: 0 }; }), /dnb\/riff-liquid-stairs: .*pairClock/);
  assert.throws(bad((r) => { r.phrase.trimDb = 13; }), /dnb\/riff-liquid-stairs: .*trimDb/);
  assert.throws(bad((r) => { r.phrase.runs[0].pitch[0] = [0, 'A', 0, 1]; }), /pitch knot 0 needs 2 fields/);
});

test('review 10-08, A4: the rows and the place tables are read once at load, and a bad one is refused by its id — a kit\'s levels and offsets, a place table\'s words and ids, a chord cycle\'s loop, a riff\'s anchored notes and ids; a note outside a riff\'s vocabulary is kept as written', async () => {
  const { kitOf, kitProblems, KIT_IDS } = await import('../src/kit.ts');
  const { placesFaults, cycleFaults } = await import('../src/places.ts');
  const { places } = await import('../src/styles/deep-house-places.ts');
  const { FORM_LIBRARY } = await import('../src/recipes.ts');
  const { loadRiff, riffsOf, rollMined, riffOf, RIFF_ROWS } = await import('../src/glide.ts');
  // the kit: the shipped row is whole; a level, a spread, an offset, a gain or a pan out of bounds is named
  for (const id of KIT_IDS) assert.deepEqual(kitProblems(kitOf(id)!), [], id);
  const kit = structuredClone(kitOf(KIT_IDS[0])!);
  const lane = Object.keys(kit.lanes)[0];
  kit.lanes[lane].steps[0].vel = 1.5; kit.lanes[lane].steps[0].ms = 80; kit.lanes[lane].pan = 2; kit.lanes[lane].gainDb = 30; kit.lanes[lane].vel = [0.8, 0.5];
  const faults = kitProblems(kit).join('; ');
  for (const word of ['vel and velSd', 'pan from', 'gainDb from', 'vel is [floor, span]']) assert.ok(faults.includes(word), `${word}: ${faults}`);
  // the place tables: the shipped ones are whole; a sound word, a row id, a preferred section, a treatment, a withheld family, a held-off role and a cycle are named by the entry
  // the words the style uses, as the load reads them
  const vocab = { families: (style as any).composition.families.map((f: any) => f.id), roles: style.lanes.map((l) => l.role),
    treatments: ((style.candidates as any[]).find((c) => c.id === 'treatmentRota')?.list() ?? []).map((e: any) => String(e.v ?? e)) };
  assert.deepEqual(placesFaults(places, vocab), []);
  const broken = {
    ...places,
    bassSound: [{ ...places.bassSound![0], sound: 'sine-reeze' }],
    glide: [{ ...places.glide![0], rows: [{ v: 'dnb/glide-nowhere', w: 1 }] }],
    form: [{ ...places.form![0], rows: [{ v: 'dnb/form-nowhere', w: 1 }] }],
    sections: [{ ...places.sections![0], prefers: { 'dnb/dnb-nowhere': 1 } }],
    treatments: [{ ...places.treatments![0], weights: { 'fx:reverbb': 2 } }],
    support: [{ ...places.support![0], withhold: ['figures'], holdOff: ['sixteenths'] }],
    harmony: [{ id: 'h', place: places.harmony![0].place, cycles: [{ degrees: [0, 5], every: 3, loop: 8, w: 1 }, { degrees: [0], every: 1, loop: 1, w: 1 }] }],
    drums: [{ ...places.drums![0], kit: 'dnb/kit-nowhere' }],
  };
  const said = placesFaults(broken as typeof places, vocab);
  for (const word of ['sine-reeze is not a sound word', 'dnb/glide-nowhere is not a glide row', 'dnb/form-nowhere is not a form row', 'prefers dnb/dnb-nowhere', 'fx:reverbb is not a treatment',
    'withholds figures', 'holds off sixteenths', 'h cycle 0: every 3 does not divide', 'h cycle 1: loop 1 is not one of', 'dnb/kit-nowhere is not a kit row'])
    assert.ok(said.some((s) => s.includes(word)), `${word}: ${said.join('; ')}`);
  assert.deepEqual(cycleFaults({ id: 'x', place: places.harmony![0].place, cycles: [{ degrees: [0, 3], every: 8, loop: 16, w: 1 }] }), []);
  // a form row's preferred section rows are rows that exist
  const form = FORM_LIBRARY.find((r) => (r as any).form?.prefers)!;
  const was = (form as any).form.prefers;
  try { (form as any).form.prefers = { ...was, 'dnb/dnb-nowhere': 1 }; assert.ok(placesFaults(places, vocab).some((s) => s.includes(`${form.id}: form.prefers dnb/dnb-nowhere`))); }
  finally { (form as any).form.prefers = was; }
  // a riff: a note its phrase anchors stands in its vocabulary; two rows of one id are refused
  const row = structuredClone(RIFF_ROWS[1]) as any, R = row.wants.riff;
  const anchored = R.phrase.runs.flatMap((r: any) => r.anchors).find((a: any[]) => a.length === 3 && R.shapes[a[1]][a[2]][2] !== 0);
  R.shapes[anchored[1]][anchored[2]][2] = 7.5;
  assert.throws(() => loadRiff(row), new RegExp(`${row.id}: its phrase anchors notes outside its vocabulary: ${anchored[1]}\\[${anchored[2]}\\] 7.5`));
  assert.throws(() => riffsOf([RIFF_ROWS[0], RIFF_ROWS[0]]), /two rows carry this id/);
  // V's D[3], six over home, stands outside its vocabulary and no run names it: every theme keeps it as written
  const V = riffOf('dnb/riff-liquid-mined')!;
  assert.ok(!V.vocab.includes(V.shapes.D[3][2]));
  for (let seed = 1; seed <= 40; seed++) assert.equal(rollMined(V, String(seed)).shapes.D[3][2], V.shapes.D[3][2], `seed ${seed}`);
});

test('review 10-08, A4: the latent hangs and throws are guarded — a solo window with no bass is no place for a solo, two drops side by side keep the second\'s push, a pinned switch-up plays at a place that draws none, a mined pattern pinned without spell= says so', async () => {
  const { recipesFor } = await import('../src/mix.ts');
  const { pinnedRates } = await import('../src/subsections.ts');
  // the solo: at the benchmark's spell, the place a theme's solo takes; with the bass taken out of that window the place moves or there is none
  const bench = { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 };
  const off = { ...style, switches: { ...(style.switches as Record<string, boolean>), bassSolo: false } };
  const a = planTheme('1', 1, { style: off, preset: 'auto', spell: bench, library: [] }) as any;
  const input = { style, spell: bench, bars: a.bars, barSeconds: a.barSeconds, beat: a.beat, arrangement: a.arrangement, events: a.events, lanes: style.lanes };
  const place = soloPlace(input)!;
  assert.ok(place, 'seed 1 theme 1 solos at the benchmark spell');
  const hollow = { ...input, events: a.events.filter((e: any) => !(e.layer === 'bass' && e.bar >= place.from && e.bar < place.to)) };
  const moved = soloPlace(hollow);
  assert.ok(!moved || hollow.events.some((e: any) => e.layer === 'bass' && e.bar >= moved.from && e.bar < moved.to), 'a solo placed where the bass plays nothing');
  if (moved) soloEvents({ ...hollow, scale: a.key.scale, root: a.key.root, progression: a.progression, ceiling: soloCeiling(style.base.register) }, moved);
  // two drops side by side: the second keeps its push on its first bar
  const push = { buildBars: 4, buildLevel: 0.5, dropBars: 16, dropLevel: 0.8, markLevel: 0.3 } as any;
  const arr = { bars: 48, sections: [{ kind: 'intro', startBar: 0, bars: 16 }, { kind: 'drop', startBar: 16, bars: 8 }, { kind: 'drop', startBar: 24, bars: 8 }, { kind: 'outro', startBar: 32, bars: 16 }] } as any;
  const curve = pushCurve(arr, push);
  assert.equal(curve.find((p) => p.bar === 24)?.value, 0.8, JSON.stringify(curve));
  assert.ok(curve.every((p, i) => i === 0 || p.bar > curve[i - 1].bar));
  // a pinned switch-up where the place names no spans takes the ones given; a place's own spans stay
  assert.deepEqual(pinnedRates({ switchUp: 0, switchBars: [], turnaround: 0, fill: 0.3, dropOut: 0.1, crash: false }, 'switch-up', [8, 16]).switchBars, [8, 16]);
  assert.deepEqual(pinnedRates({ switchUp: 0.6, switchBars: [8, 8, 16], turnaround: 0, fill: 0, dropOut: 0, crash: false }, 'switch-up', [4]).switchBars, [8, 8, 16]);
  assert.deepEqual(pinnedRates({ switchUp: 0, switchBars: [], turnaround: 0, fill: 0.3, dropOut: 0.1, crash: false }, 'fill', [8]).switchBars, []);
  // the house's half-time kick pinned at the driving four, whose place names no switch-up spans: it plays (it played nothing)
  const { recipeById } = await import('../src/recipes.ts');
  const row = recipeById('mains/half-time-kick')!;
  for (const spell of [{ ...HOUSE, ember: 0.75, root: 0.6, zephyr: 0.5, veil: 0.6 }, { ...HOUSE, ember: 0.72, spark: 0.1, tide: 0.9, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.8 }]) {
    const pinned = planTheme('1', 0, { strategy: 'house-v2', recipe: row, spell }) as any;
    assert.ok(pinned.events.some((e: any) => e.by === row.id), `${row.id} plays nothing at ${JSON.stringify(spell)}`);
  }
  // a mined pattern at nought pinned without a spell says it needs one
  assert.throws(() => recipesFor({ strategy: 'house-v2', search: '?recipe=dnb/bright-sixteenths' }), /needs spell=/);
});

// The review of 10-08, B2: inside a groove the kit plays whole — a part a drop-out took out of a bar comes back from
// the section's nearest bar — and the refill looked only forward where the bar before the gap stood outside the
// section, so a groove's opening bars played the kick and the snare with no hats (174 bars over 180 plans).
test('B2: inside a fast place\'s groove a bar the kit plays has its hats wherever the section has any', () => {
  const tile = { ...HOUSE, ember: 0.95, tide: 0.45, zephyr: 0.60, root: 0.75, veil: 0.60, spark: 0.85, loom: 0.85 };
  let bars = 0;
  for (let seed = 1; seed <= 12; seed++) for (let n = 0; n < 2; n++) {
    const t = planTheme(seed, n, { strategy: 'house-v2', spell: tile });
    // a drum-led build's own bars (fast-drops, his ear 10-13/10-15) are the gesture's: a kick doubling rests the hats
    const built = new Set(((t as any).passage?.builds ?? []).flatMap((g: { line: number; beats: number }) =>
      Array.from({ length: Math.ceil(g.beats / 4) }, (_, i) => g.line - 1 - i)));
    for (const s of t.arrangement.sections) {
      if (!['drop', 'main', 'groove'].includes(s.kind)) continue;
      const inSec = t.events.filter((e) => e.bar != null && e.bar >= s.startBar && e.bar < s.startBar + s.bars);
      if (!inSec.some((e) => e.layer === 'hats')) continue;
      for (let b = s.startBar; b < s.startBar + s.bars; b++) {
        const here = inSec.filter((e) => e.bar === b);
        if (!here.some((e) => e.layer === 'kick' || e.layer === 'clap') || built.has(b)) continue;
        bars++;
        assert.ok(here.some((e) => e.layer === 'hats'), `${seed}#${n}: the ${s.kind} at ${s.startBar} plays bar ${b} with no hats`);
      }
    }
  }
  assert.ok(bars > 1000, `${bars} bars`);
});

departuresSaid('the riff', RIFF_DEPARTURES, riffTally);
