// One long journey (PLAN-AMBIENT Phase 6, `src/journey.ts`), in node, on the compiled program: the row admitted and
// the three modes in the theory, the wheel the two old modes always had; at PSY (seeds 1-12, themes 1-3) every theme
// the composer plays as its own lays the journey — the macro line out of the dark, open to air and closed to the dark
// end as the theme ends, never back and forth; every held note on the tape, its drift in the row's range; the keys and
// the bed into the journey's echoes; the stage's rate the row's; the pulse in the grooves only; the mode one the place
// draws and its cycle that mode's own; no whistle; the cast under the ceiling — and a library turn there lays none; the
// birds lean what they say (Gleam the mode's brightness, Veil the swirl, Tide the echoes, Root the dark end, Spark the
// pulse); taken out, the place plays the composer's own line; and nothing it adds is heard outside its place: the
// protected spells (PLAN-AMBIENT §2.4, the conversation's check holds the same hashes), BELLS and its pulls, a house
// theme and a slow theme with the birds dragged to their ends play the programs `local` a0651532 planned. 27191 and
// the link rows are the link digest's (`tools/bless.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { journeyRowsFaults, JOURNEY_ROWS } from '../src/journey.ts';
import { SCALES, wheelRoot, rootOnWheel, buildChord } from '../src/theory.ts';
import { BY_NAME, VOICE_COST_UNITS } from '@deep-house/engine/voices';
import { CEILING } from '../src/catalogue-v2.ts';
import { played, themeHash } from './link-digest.ts';
import { APP } from './as-played.ts';
import { withoutTechniques, nearestEntry } from '../src/places.ts';
import { soundingBars } from '../src/silence.ts';

const PSY = { em: 0.08, ti: 0.90, ze: 0.65, ro: 0.60, gl: 0.35, ve: 0.90, sp: 0.55, lo: 0.70 } as Record<string, number>;
const spellOf = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(',');
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const ROW = JOURNEY_ROWS[0];
const MODES = ['phrygian', 'dorian', 'mixolydian', 'lydian'];
type Ev = { t: number; voice: string; layer: string; role?: string; part?: string; bar: number | null; p: Record<string, any> };
const themeOf = (o: Record<string, number>, seed: number, theme: number) => quiet(() => played(`seed=${seed}&v=2&spell=${spellOf(o)}&theme=${theme}`)).plan;

test('the journey row is admitted, the three modes are scales, and the wheel says what it always said of minor and dorian', () => {
  assert.deepEqual(journeyRowsFaults((v) => !!BY_NAME[v]), []);
  assert.equal(JOURNEY_ROWS.length, 1);
  assert.deepEqual(Object.keys(SCALES), ['minor', 'dorian', 'phrygian', 'mixolydian', 'lydian']);
  for (let r = 0; r < 12; r++) {
    assert.equal(wheelRoot(r, 'minor'), r);
    assert.equal(wheelRoot(r, 'dorian'), (r + 7) % 12);
    // every mode on the wheel is the seven notes of the minor key there
    for (const m of Object.keys(SCALES)) {
      const tonic = rootOnWheel(r, m);
      assert.equal(wheelRoot(tonic, m), r);
      const pcs = new Set(SCALES[m].map((s) => (tonic + s) % 12)), minor = new Set(SCALES.minor.map((s) => (r + s) % 12));
      assert.deepEqual([...pcs].sort(), [...minor].sort(), `${m} on ${r}`);
    }
  }
});

/** The planner's rules over one theme's program, gathered. */
function journeyFaults(t: ReturnType<typeof planTheme>): string[] {
  const bad: string[] = [];
  const check = (ok: unknown, says: string) => { if (!ok) bad.push(says); };
  const prog = programOf(t);
  const ev = prog.events as unknown as Ev[];
  const J = t.journey!;
  const T = t.bars * t.barSeconds;
  // the macro line: one line, up then down, from the dark side to the air and to the dark end at the theme's end
  const line = t.automation.macroFilter;
  check(line.length >= 10, 'the line has few knots');
  check(Math.abs(line[0].value - J.line.fromHz) < 0.5, `the line starts at ${line[0].value}, not ${J.line.fromHz}`);
  check(Math.abs(line[line.length - 1].value - J.line.darkHz) < 0.5 && Math.abs(line[line.length - 1].t - T) < 0.01, 'the line does not end at the dark end with the theme');
  const peak = line.reduce((i, p, k) => (p.value > line[i].value ? k : i), 0);
  check(line[peak].value >= 0.99 * J.line.airHz, `the line never opens to air (${line[peak].value})`);
  check(line.slice(0, peak + 1).every((p, i, a) => !i || p.value >= a[i - 1].value - 1e-6), 'the line closes on its way up');
  check(line.slice(peak).every((p, i, a) => !i || p.value <= a[i - 1].value + 1e-6), 'the line opens on its way down');
  check(line[line.length - 1].t - line[0].t >= 0.9 * T, 'the line is not over the whole theme');
  // the hand-over: the line back at its start by the seam floor, the dark end only across the blend, the seam no sooner
  const at = (s: number) => { for (let i = 1; i < line.length; i++) if (s <= line[i].t) { const a = line[i - 1], b = line[i]; return a.value * (b.value / a.value) ** ((s - a.t) / Math.max(1e-9, b.t - a.t)); } return line[line.length - 1].value; };
  check(Math.abs(J.line.handAt - t.style.set.seamFloor * T) < 0.05 && Math.abs(at(J.line.handAt) - J.line.fromHz) < 1, `the line at the hand-over floor is ${at(J.line.handAt)}, not ${J.line.fromHz}`);
  check(t.arrangement.handoverNotBefore! >= J.line.handAt / t.barSeconds - 1e-6, 'the theme may hand over before the line is back');
  // the top breathes: at full air at most the row's hold
  check(J.line.fallFrom - J.line.riseTo <= ROW.filter.holdMostS + 1e-6, `held at the air ${J.line.fallFrom - J.line.riseTo} s`);
  // the held notes on one tape, in the row's range
  const held = ev.filter((e) => ROW.drift.layers.includes(e.layer) && e.role !== 'detail');
  check(held.length > 0 && held.every((e) => e.p.drift && e.p.drift.cents >= ROW.drift.cents[0] && e.p.drift.cents <= ROW.drift.cents[1]
    && e.p.drift.hz >= ROW.drift.hz[0] && e.p.drift.hz <= ROW.drift.hz[1] && e.p.drift.phase >= 0 && e.p.drift.phase < 1), 'a held note off the tape');
  check(!ev.some((e) => e.p.drift && !ROW.drift.layers.includes(e.layer)), 'a drift on a layer the row does not name');
  // one tape: every held note's phase is where the same sine stands at its onset (the engine's sine at phase a is cos(ωτ − a))
  const tape = (e: Ev) => (((e.p.drift.phase + e.p.drift.hz * e.t) % 1) + 1) % 1;
  check(held.every((e) => { const d = Math.abs(tape(e) - tape(held[0])); return Math.min(d, 1 - d) < 1e-3; }), 'the held notes are not on one tape');
  // the keys and the bed into the echoes, and the echoes built
  const sends = ev.filter((e) => e.p.returns && Object.keys(e.p.returns).some((k) => k.startsWith(`${ROW.echo.id}.`)));
  check(sends.length > 0 && sends.every((e) => ['keys', 'pad', 'shaker'].includes(e.layer)), 'the echoes take notes they should not, or none');
  check(!!(t.paramOverrides as any)?.returns?.[ROW.echo.id], 'the echoes\' return is not built');
  // the stage's rate
  check(!!t.stageRates && t.stageRates[0] > 0 && t.stageRates[1] > t.stageRates[0] && t.stageRates[1] < 0.2, `the stage's rate ${t.stageRates}`);
  // the pulse in the grooves, at most one hit a sixteenth
  const pulse = ev.filter((e) => e.part === 'journey-pulse');
  const kindAt = (s: number) => (t.arrangement.sections.find((x) => s >= x.startBar * t.barSeconds && s < (x.startBar + x.bars) * t.barSeconds) ?? { kind: 'none' }).kind;
  const kindOfBar = (b: number) => (t.arrangement.sections.find((x) => b >= x.startBar && b < x.startBar + x.bars) ?? { kind: 'none' }).kind;
  check(pulse.every((e) => e.bar != null && ROW.pulse.sections.includes(kindOfBar(e.bar)) && kindAt(e.t) === kindOfBar(e.bar)), 'a pulse outside the grooves');
  check(J.pulse.hits === pulse.length, 'the pulse\'s count');
  // never struck over a room's "off": the pulse's gain is its row's level on the keys' footing, a fraction
  check(pulse.every((e) => e.p.gain > 0 && e.p.gain <= 1), `the pulse struck at ${Math.max(...pulse.map((e) => e.p.gain))}`);
  // the mode is the place's, and the cycle's colour chord is a chord of it with a fifth
  check(MODES.includes(t.key.scaleName), `the mode ${t.key.scaleName}`);
  for (const c of t.progression.chords) { const tri = buildChord(t.progression.root, t.progression.scale, c.degree, 3); check((tri[2] - tri[0]) % 12 === 7, `a chord with no fifth (${c.label})`); }
  check(new Set(t.progression.chords.map((c) => c.degree)).size >= 2, 'one chord only');
  // ...and the second chord the mode's colour (or the step under the tonic), never one the walk nudged in
  const COLOUR: Record<string, number[]> = { phrygian: [1, 6], lydian: [1, 6], dorian: [3, 6], mixolydian: [6] };
  check(t.progression.chords.every((c) => c.degree === 0 || COLOUR[t.key.scaleName]?.includes(c.degree)), `a chord off the mode's cycles: ${t.progression.chords.map((c) => c.roman).join('-')} in ${t.key.scaleName}`);
  // the struck lead's chords a lead's (the row's `leadChord`): where the theme's lead is the stab, no chord of it strikes
  // more than the row's top notes; where the lead is held, the stab keeps its chords and nothing is said
  const d = t.dice as any;
  const struckLead = d.leadTimbre === d.stabTimbre;
  const stab = ev.filter((e) => e.layer === 'keys' && !e.role && !e.part && (e.voice === d.stabTimbre || e.p.preset === d.stabTimbre)).sort((a, b) => a.t - b.t);
  const chords: Ev[][] = []; for (const e of stab) { const c = chords[chords.length - 1]; if (c && c[0].bar === e.bar && c[0].voice === e.voice && e.t - c[0].t < 0.1) c.push(e); else chords.push([e]); }
  const widest = Math.max(0, ...chords.map((c) => c.length));
  if (struckLead && ROW.leadChord) check(widest <= ROW.leadChord.top && (widest < 2 || J.lead?.top === ROW.leadChord.top), `the struck lead strikes ${widest} notes at once`);
  else check(!J.lead, 'a stab that is not the lead voiced as a lead\'s');
  // the outro is the bed's: no two bars of it before the dark end stand with nothing sounding (seed 6 theme 2 stood 19 s
  // at -46 LUFS from its outro's first bar, the bed's gate on and nothing struck)
  const outro = t.arrangement.sections.find((x) => x.kind === 'outro');
  if (outro) {
    const on = soundingBars(ev as any, t.bars, t.barSeconds);
    let run = 0, worst = 0;
    for (let b = outro.startBar; b < t.bars - 2; b++) { run = on[b] ? 0 : run + 1; worst = Math.max(worst, run); }
    check(worst < 2, `${worst} silent bars in the outro`);
  }
  // no whistle: the pulse family withheld
  check(!(t.dice as any).composition?.selected?.pulse, 'the whistle plays');
  // the cast under the ceiling
  const units = [...new Set(ev.map((e) => e.voice))].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  check(units <= CEILING, `the cast at ${units}`);
  return bad;
}

test('at PSY, seeds 1-12 themes 1-3: every own theme the journey holding its rules; a library turn lays none', (ctx) => {
  let own = 0, turns = 0;
  const modes: Record<string, number> = {};
  for (let s = 1; s <= 12; s++) for (let th = 1; th <= 3; th++) {
    const t = themeOf(PSY, s, th);
    if ((t.dice as any).library) { turns++; assert.equal(t.journey, undefined, `s${s} t${th}: a library turn lays a journey`); continue; }
    own++;
    assert.ok(t.journey, `s${s} t${th}: no journey`);
    modes[t.key.scaleName] = (modes[t.key.scaleName] ?? 0) + 1;
    assert.deepEqual(journeyFaults(t), [], `s${s} t${th}`);
  }
  assert.ok(own >= 18 && turns >= 6, `${own} own themes and ${turns} turns`);
  assert.ok(MODES.every((m) => (modes[m] ?? 0) > 0), `every mode drawn at the place: ${JSON.stringify(modes)}`);
  ctx.diagnostic(`${own} own themes, ${turns} library turns; modes ${JSON.stringify(modes)}`);
});

/** Over seeds 1-12 theme 1, the own themes at a spell: a number read off each, gathered. */
const over = (o: Record<string, number>, read: (t: ReturnType<typeof planTheme>) => number) => {
  const xs: number[] = [];
  for (let s = 1; s <= 12; s++) { const t = themeOf(o, s, 1); if (t.journey) xs.push(read(t)); }
  return xs;
};
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

test('the birds lean what they say, each its own: Gleam the mode, Veil the swirl, Tide the echoes, Root the dark end, Spark the pulse', () => {
  const share = (gl: number, mode: string) => { let n = 0, all = 0; for (let s = 1; s <= 12; s++) for (let th = 1; th <= 3; th++) { const t = themeOf({ ...PSY, gl }, s, th); if (!t.journey) continue; all++; if (t.key.scaleName === mode) n++; } return n / all; };
  assert.ok(share(0, 'phrygian') > 0.5 && share(1, 'lydian') > 0.55 && share(0, 'lydian') < 0.1 && share(1, 'phrygian') < 0.05, 'Gleam: phrygian at nought, lydian at one');
  assert.ok(mean(over({ ...PSY, ve: 0.5 }, (t) => t.stageRates![1])) < 0.7 * mean(over(PSY, (t) => t.stageRates![1])), 'Veil down: a slower swirl');
  assert.ok(mean(over({ ...PSY, ti: 0.6 }, (t) => t.journey!.echo.feedback)) < mean(over(PSY, (t) => t.journey!.echo.feedback)) - 0.05, 'Tide down: shorter echoes');
  assert.ok(mean(over({ ...PSY, ro: 1 }, (t) => t.journey!.line.darkHz)) < 0.7 * 400 && mean(over({ ...PSY, ro: 0.2 }, (t) => t.journey!.line.darkHz)) > 1.4 * 400, 'Root: the dark end deeper up, shallower down');
  assert.equal(mean(over({ ...PSY, sp: 0.2 }, (t) => t.journey!.pulse.hits)), 0, 'Spark under 0.3: no pulse');
  assert.ok(mean(over({ ...PSY, sp: 0.9 }, (t) => t.journey!.pulse.hits)) > 1.2 * mean(over(PSY, (t) => t.journey!.pulse.hits)), 'Spark up: more pulse');
  // contained: Veil moves no echo, Tide no swirl, Spark no line
  assert.ok(over({ ...PSY, ve: 0.5 }, (t) => t.journey!.echo.feedback).every((x) => x === ROW.echo.feedback), 'Veil leans the echoes');
  assert.ok(over({ ...PSY, ti: 0.6 }, (t) => t.stageRates![0]).every((x) => x === ROW.swirl.hz[0]), 'Tide leans the swirl');
  assert.ok(over({ ...PSY, sp: 0.9 }, (t) => t.journey!.line.darkHz).every((x) => x === ROW.filter.darkHz), 'Spark leans the line');
});

test('the journey is one line of the place: taken out, PSY plays the composer\'s own line and no tape', () => {
  const style = withoutTechniques(APP, 'journey');
  for (const seed of ['1', '3', '5']) {
    const t = quiet(() => planTheme(seed, 1, { strategy: 'house-v2', style, spell: parseSpell(spellOf(PSY))! }));
    assert.equal(t.journey, undefined, `seed ${seed}: a journey without its line`);
    assert.ok(!(programOf(t).events as unknown as Ev[]).some((e) => e.p.drift || e.part === 'journey-pulse'), `seed ${seed}: the tape or the pulse without the journey`);
    assert.equal(t.stageRates, undefined);
  }
});

/**
 * What `local` a0651532 planned (bells-birds merged), the first 16 hex digits of each whole program (`themeHash`): BELLS's
 * own spell (seeds 1-4; its pulls are the conversation's check's), a house theme at the house and with every bird but
 * Ember dragged to its ends both ways, and a slow theme (Ember 0.10) dragged the same way (the bright end, Zephyr and
 * Gleam at one, is a theme bells-birds moved: 3a0626df0fbc70d6 on 4055c89b).
 * PLAN-AMBIENT §2.4's are the conversation's check's. BELLS's four since zones-pilot-2 (the bowl's level by register,
 * check-conversation's TILE) and the turns' (seed 4), and the place's trim since zones-pilot-3.
 */
const OUTSIDE: Record<string, string> = {
  'seed=1&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '9683b597a7dc7378',
  'seed=2&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': 'f104b8cae402eedc',
  'seed=3&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '1825a40f3f4c7fe7',
  // a library turn at the bells' tile, which the zone plays as the conversation (zones-pilot; check-conversation's TURNED)
  'seed=4&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '6ec6d7e3071c99ab',
  'seed=3&v=2': 'aed3f3640846ec08',
  'seed=3&v=2&spell=ti:1,ze:0,ro:1,gl:0,ve:0,sp:0,lo:1': '1cc27d70e922da52',
  'seed=3&v=2&spell=ti:0,ze:1,ro:0,gl:1,ve:1,sp:1,lo:0': 'daf3ef2d7e1827e5',
  'seed=2&v=2&spell=em:0.10,ti:1.00,ze:0.00,ro:1.00,gl:0.00,ve:0.00,sp:0.00,lo:1.00': '18af3c36234e4304',
  // outside the bells' box (Spark 0), where every lane BELLS lists read BELLS's entry on local: the tables less the zone's since zones-pilot
  'seed=2&v=2&spell=em:0.10,ti:0.00,ze:1.00,ro:0.00,gl:1.00,ve:0.30,sp:0.00,lo:0.00': '8737122b17a7edd7',
};

test('the harmony entry that draws its own mode plays only inside its journey\'s region: where the harmony is PSY\'s and the journey is not, the theme plays the house\'s walk in the key die\'s mode', (ctx) => {
  const P = (APP as any).places, H = P.harmony, J = P.journey;
  const psyH = H.find((e: any) => e.scales);
  // the place's harmony entry with nothing in it plays the house's walk, by construction (no cycle, no pedal, no modes)
  const bare = { ...APP, places: { ...P, harmony: H.map((e: any) => (e === psyH ? { id: e.id, place: e.place } : e)) } };
  let s = 7; const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom'];
  // (WAVES says "no journey" in the journey's table and is not in the harmony's, so its own cell of the journey's
  // table lies inside PSY's harmony cell: those spells are counted apart, and tested as every other)
  let outside = 0, atWaves = 0, tested = 0;
  for (let i = 0; i < 20000; i++) {
    const sp: Record<string, number> = {}; for (const b of BIRDS) sp[b] = r(); sp.ember *= 0.18;
    const bpm = 44 + sp.ember / 0.18 * 20;
    if (nearestEntry(H, sp as any, bpm) !== psyH || nearestEntry(J, sp as any, bpm)?.journey) continue;
    if (nearestEntry(J, sp as any, bpm)?.id === 'no-journey-at-waves') atWaves++; else outside++;
    const spell = parseSpell(Object.entries(sp).map(([k, v]) => `${k.slice(0, 2)}:${v.toFixed(4)}`).join(','))!;
    const t = quiet(() => planTheme('1', 1, { strategy: 'house-v2', spell }));
    // read again at the tempo the theme drew: the cell is the plan's
    if (nearestEntry(H, spell, t.bpm) !== psyH || nearestEntry(J, spell, t.bpm)?.journey) continue;
    tested++;
    assert.equal(t.journey, undefined);
    assert.ok(['minor', 'dorian'].includes(t.key.scaleName), `a place's mode without its journey: ${t.key.scaleName}`);
    const b = quiet(() => planTheme('1', 1, { strategy: 'house-v2', spell, style: bare }));
    assert.equal(themeHash(t), themeHash(b), 'the harmony entry plays without its journey');
  }
  assert.ok(outside > 0 && outside < 40 && tested > 0, `${outside} spells where the harmony is PSY's and the journey is not (and ${atWaves} at WAVES), ${tested} planned there`);
  ctx.diagnostic(`${outside} of 20000 drumless spells where the harmony is PSY's and the journey is not, and ${atWaves} at WAVES; ${tested} of them planned there, each the house's walk`);
});

test('nothing of the journey outside its place: BELLS, a house theme and a slow theme with the birds at their ends play the programs they played', () => {
  for (const [link, hash] of Object.entries(OUTSIDE)) {
    const { plan } = quiet(() => played(link));
    assert.equal(plan.journey, undefined, `${link}: a journey`);
    assert.ok(!['phrygian', 'mixolydian', 'lydian'].includes(plan.key.scaleName), `${link}: a place's mode`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});
