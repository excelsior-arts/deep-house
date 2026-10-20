// The sea, and the music on its waves (PLAN-AMBIENT Phase 4, `src/surf.ts`), in node, on the compiled program: the row
// admitted; at WAVES (seeds 1-12, themes 1-3) every theme the composer plays as its own lays a sea that holds the
// planner's invariants — every wave's noises inside the wave, the swell no longer than a rise and a crest (never a
// riser), no swell, crest, undertow strike or bell on a beat line, the bloom the set's chord on the wave's swell, the
// bell only on a set's peak's or a great wave's break, in
// its register and the key's pentatonic, the bass on the undertows, the set's root or a slide to the next set's, the
// chords moving at the sets' lines — with nothing else sounding (no held pad, sub, keys' figure, whistle or other
// noise) and the cast under the catalogue's ceiling; the sea irregular, as a sum of swells and a chop is (the waves'
// periods and heights spread, the sets of many lengths, lulls); a library turn there plays its row and no sea; the
// leans move what they say (Tide the sea's size, Root the undertow, Veil the sea state: the period, the spread of the
// periods and the chop, Zephyr the spray); the sea is
// one line of the place; and the weather's admission moves nothing where the weather's row is "none": the protected
// spells (PLAN-AMBIENT §2.4) and a probe of the ring around WAVES (BELLS and its pulls, the slow corners, the birds at
// their ends, the house, a fast place, the slow groove) plan no sea and the whole programs they planned on `local`
// 79a9443b (and still on 4055c89b); a spell where WAVES and BELLS are each nearest in its own table plays BELLS's
// program, as on `local` (one foreground a theme); the ring draws the sea at WAVES and no sea anywhere else. 27191 and
// the link rows are the link digest's (`tools/bless.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { surfRowsFaults, SURF_ROWS } from '../src/surf.ts';
import { chordAtBar } from '../src/theory.ts';
import { BY_NAME, VOICE_COST_UNITS } from '@deep-house/engine/voices';
import { CEILING } from '../src/catalogue-v2.ts';
import { played, themeHash } from './link-digest.ts';
import { APP } from './as-played.ts';
import { withoutTechniques, nearestEntry, type AmbientVoicesEntry, type ConversationEntry } from '../src/places.ts';
import { lanesOf } from '../src/control.ts';
import { marksOf } from '../src/ring-subsections.ts';
import { livelinessOf } from './liveliness.ts';

const WAVES = 'em:0.05,ti:0.85,ze:0.75,ro:0.55,gl:0.50,ve:0.60,sp:0.10,lo:0.95';
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const SEEDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const ROW = SURF_ROWS[0];
const SEA = new Set(['sea-swell', 'sea-surf', 'sea-backwash', 'sea-undertow']);
const ON = new Set(['wave-bloom', 'wave-bell', 'wave-bass']);
/** each sea voice's own release (its row's), so an event's end is its onset, its length and that */
const RELEASE: Record<string, number> = Object.fromEntries(Object.values(ROW.sounds).map((v) => [v, Number((BY_NAME[v]?.row as { parameters?: { release?: number } })?.parameters?.release ?? 0)]));
type Ev = { t: number; voice: string; layer: string; role?: string; part?: string; bar: number | null; step: number | null; p: Record<string, any> };
type Theme = ReturnType<typeof planTheme>;

test('the surf row is admitted: voices that exist, a peak period of 8-14 s, a sea state of a swell, a cross swell and a chop, the arc a calm, a swell and a calm', () => {
  assert.deepEqual(surfRowsFaults((v) => !!BY_NAME[v]), []);
  assert.equal(SURF_ROWS.length, 1);
  assert.deepEqual(ROW.period.s, [8, 14]);
  assert.ok(ROW.state.main.partials > 1 && ROW.state.cross.share > 0 && ROW.state.chop.amp > 0 && ROW.state.chop.periodS[1] < ROW.period.s[0], 'the swell, a cross swell now and then, and a shorter chop');
  const sizes = ROW.arc.map(([, x]) => x);
  assert.ok(sizes[0] < Math.max(...sizes) && sizes[sizes.length - 1] < Math.max(...sizes), 'the arc rises and falls back');
});

/** The planner's rules over one theme's program, gathered. */
function surfFaults(t: Theme): string[] {
  const bad: string[] = [];
  const check = (ok: unknown, says: string) => { if (!ok) bad.push(says); };
  const ev = programOf(t).events as unknown as Ev[];
  const sea = t.sea!;
  const end = t.bars * t.barSeconds;
  check(sea.waves > 0 && sea.waves === sea.waveList.length, 'no waves, or the summary miscounts them');
  // nothing it replaces, nothing besides it
  check(!ev.some((e) => !SEA.has(e.part ?? '') && !ON.has(e.part ?? '')), `something besides the sea: ${[...new Set(ev.filter((e) => !SEA.has(e.part ?? '') && !ON.has(e.part ?? '')).map((e) => `${e.voice}/${e.layer}`))].join(', ')}`);
  for (const e of ev) check((SEA.has(e.part!) ? e.role === 'texture' : e.role === 'detail') && e.p.fx == null, `${e.part} at ${e.t.toFixed(2)} s took a treatment or another role`);
  const units = [...new Set(ev.map((e) => e.voice))].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  check(units <= CEILING, `the cast ${units} units over ${CEILING}`);
  // the waves: each in the theme, its noises inside it; the swell a rise and a crest, never longer (never a riser)
  const W = sea.waveList.map(([t0, crest, until, size, set, what, early]) => ({ t0, crest, until, size, set, what, early }));
  check(W.every((w, i) => w.t0 < w.crest && w.crest < w.until && w.until <= end - ROW.endS + 1e-3 && (i === 0 || w.t0 > W[i - 1].t0)), 'a wave out of order or past the end');
  const riseMost = ROW.shape.riseS[1] + ROW.shape.crestS[1];
  // off the beat: no swell, crest, undertow strike or bell within the row's margin of a beat line
  const beat = t.barSeconds / 4;
  const offBeat = (s: number) => { const ph = ((s / beat) % 1 + 1) % 1; return Math.min(ph, 1 - ph) * beat >= ROW.offBeatS - 1e-6; };
  for (const w of W) check(offBeat(w.t0) && offBeat(w.crest), `a wave at ${w.t0.toFixed(2)} s on a beat line`);
  for (const e of ev.filter((x) => x.part === 'wave-bass' || x.part === 'wave-bell')) check(offBeat(e.t), `${e.part} at ${e.t.toFixed(3)} s on a beat line`);
  for (const e of ev.filter((x) => SEA.has(x.part!))) {
    const w = W.find((x) => e.t >= x.t0 - 1e-3 && e.t <= x.crest + ROW.undertow.afterS + 1e-3 && (e.part !== 'sea-swell' || Math.abs(e.t - x.t0) < 1e-3));
    check(w, `${e.part} at ${e.t.toFixed(2)} s on no wave`);
    if (!w) continue;
    const stop = e.t + Number(e.p.dur) + (RELEASE[e.voice] ?? 0);
    check(stop <= w.until + ROW.undertow.afterS + 0.05, `${e.part} at ${e.t.toFixed(2)} s rings ${(stop - w.until).toFixed(2)} s past its wave`);
    if (e.part === 'sea-swell') check(Number(e.p.dur) <= riseMost + 1e-3 && e.p.swell?.over > 0 && e.p.swell?.db < 0, `the swell at ${e.t.toFixed(2)} s held ${Number(e.p.dur).toFixed(1)} s, or not from under its level`);
  }
  check(ev.filter((e) => e.part === 'sea-swell').length === W.length, 'a wave without its swell');
  // the harmony moves at the sets' lines: the progression's states are the sets' first swells, the bloom the chord there
  const states = t.progression.states ?? [];
  check(states.length >= 2 || sea.sets < 2, 'the chords do not move with the sets');
  for (const st of states.slice(1)) check(sea.setLines.some((s) => Math.floor(s / t.barSeconds) === st.bar), `a chord change at bar ${st.bar} on no set's line`);
  for (const e of ev.filter((x) => x.part === 'wave-bloom')) {
    const notes = new Set(chordAtBar(t.progression, e.bar!).notes);
    check(notes.has(e.p.midi) || notes.has(e.p.midi - 12), `a bloom note ${e.p.midi} at ${e.t.toFixed(2)} s off the set's chord`);
    check(W.some((w) => Math.abs(w.t0 - e.t) < 1e-3), `a bloom at ${e.t.toFixed(2)} s on no swell`);
    check(e.p.swell?.db < 0 && e.p.swell?.over > 0, `a bloom at ${e.t.toFixed(2)} s not from under its level`);
  }
  // the phone: the bloom's notes sounding at once (two blooms overlap, a fall under a rise), each from its onset to the
  // end of its release, at most the 32-oscillator ceiling (four oscillators a pad note)
  const marks = ev.filter((x) => x.part === 'wave-bloom').flatMap((e) => [[e.t, 1], [e.t + Number(e.p.dur) + Number(e.p.release ?? 0), -1]] as Array<[number, number]>).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let alive = 0, most = 0;
  for (const [, d] of marks) { alive += d; most = Math.max(most, alive); }
  check(most * 4 <= 32, `the bloom ${most} notes at once (${most * 4} oscillators, over 32)`);
  // the bell: only on a peak's or a seventh's break, in its register and the key's pentatonic
  const pcs = new Set(ROW.bell.scale.map((i) => (t.key.root + t.key.scale[i]) % 12));
  for (const e of ev.filter((x) => x.part === 'wave-bell')) {
    const w = W.find((x) => e.t >= x.crest + ROW.bell.afterS[0] - 1e-3 && e.t <= x.crest + ROW.bell.afterS[1] + ROW.bell.pairS[1] + 1e-3);
    check(w && w.what !== '', `a bell at ${e.t.toFixed(2)} s on no peak's or great wave's break`);
    check(pcs.has(((e.p.midi % 12) + 12) % 12) && e.p.midi >= ROW.bell.register[0] && e.p.midi <= ROW.bell.register[1], `a bell ${e.p.midi} outside the pentatonic or its register`);
  }
  // the bass: on the undertows, the set's root (an octave down on a great wave) or a slide to the next set's
  const fold = (m: number) => { let x = m; while (x < ROW.bass.register[0]) x += 12; while (x > ROW.bass.register[1]) x -= 12; return x; };
  for (const e of ev.filter((x) => x.part === 'wave-bass')) {
    check(e.p.midi >= ROW.bass.register[0] && e.p.midi <= ROW.bass.register[1], `the bass ${e.p.midi} outside its register`);
    const w = W.find((x) => Math.abs(x.crest + ROW.bass.afterS - e.t) < 1e-3);
    check(w, `the bass at ${e.t.toFixed(2)} s on no undertow`);
    if (!w) continue;
    const root = fold(chordAtBar(t.progression, Math.floor(w.t0 / t.barSeconds)).rootMidi);
    check(e.p.midi === root || e.p.midi === root - 12 || e.p.slideFrom === root, `the bass ${e.p.midi} at ${e.t.toFixed(2)} s is not the set's root (${root}) nor a slide from it`);
  }
  // the chapters: no bloom in the breakdown, no bell in the intro or the outro
  const kindAt = (s: number) => (t.arrangement.sections.find((x) => s >= x.startBar * t.barSeconds && s < (x.startBar + x.bars) * t.barSeconds) ?? t.arrangement.sections[t.arrangement.sections.length - 1]).kind;
  for (const e of ev.filter((x) => ON.has(x.part!))) {
    const c = ROW.chapters[kindAt(e.part === 'wave-bloom' ? W.find((w) => Math.abs(w.t0 - e.t) < 1e-3)!.crest : e.part === 'wave-bass' ? e.t : e.t - ROW.bell.afterS[0])] ?? ROW.chapters.main;
    check(e.part === 'wave-bloom' ? c.bloom : e.part === 'wave-bass' ? c.bass : c.bell !== 'none', `${e.part} at ${e.t.toFixed(1)} s in the ${kindAt(e.t)}`);
  }
  check(sea.blooms === new Set(ev.filter((e) => e.part === 'wave-bloom').map((e) => e.t)).size && sea.bells === ev.filter((e) => e.part === 'wave-bell').length
    && sea.bassNotes === ev.filter((e) => e.part === 'wave-bass').length, 'the summary counts what was laid');
  return bad;
}

const at = (seed: string, theme: number, spell = WAVES) => quiet(() => played(`seed=${seed}&v=2&spell=${spell}&theme=${theme}`).plan);

test('at WAVES, seeds 1-12 themes 1-3: every own theme a sea holding the invariants, irregular as a sea; a library turn plays its row', (ctx) => {
  let own = 0, turns = 0, waves = 0, greats = 0, bells = 0, crossed = 0;
  const periods: number[] = [], ratios: number[] = [], heights: number[] = [], setSizes = new Set<number>();
  // the onsets moved off the beat land anywhere a free one might (the review of 10-18, its second finding): the count
  // 50-80 ms from a beat line against a uniform sea's there
  let shell = 0, shellUniform = 0;
  for (const seed of SEEDS) for (const theme of [1, 2, 3]) {
    const t = at(seed, theme);
    if (t.drawn) {
      turns++;
      assert.equal(t.sea, undefined, `seed ${seed} theme ${theme}: a library turn (${t.drawn.id}) lays a sea`);
      continue;
    }
    own++;
    assert.ok(t.sea, `seed ${seed} theme ${theme}: the composer's own theme lays no sea`);
    assert.deepEqual(surfFaults(t), [], `seed ${seed} theme ${theme}`);
    assert.ok(t.bpm >= 40 && t.bpm <= 70, `seed ${seed} theme ${theme}: ${t.bpm} BPM`);
    waves += t.sea!.waves; greats += t.sea!.greats; bells += t.sea!.bells; periods.push(t.sea!.periodS); if (t.sea!.state.crossS) crossed++;
    // each wave's period against the theme's median, and its height against the arc where it crests
    const L = t.sea!.waveList, gaps = L.slice(1).map((w, i) => w[1] - L[i][1]).sort((a, b) => a - b), med = gaps[gaps.length >> 1];
    ratios.push(...gaps.map((g) => g / med));
    for (let k = 0; k < t.sea!.sets; k++) setSizes.add(L.filter((w) => w[4] === k).length);
    heights.push(...L.map((w) => w[3]));
    const beat = t.barSeconds / 4, half = beat / 2;
    const ons = [...L.flatMap((w) => [w[0], w[1]]), ...(programOf(t).events as unknown as Ev[]).filter((e) => e.part === 'wave-bass' || e.part === 'wave-bell').map((e) => e.t)];
    for (const s of ons) { const ph = ((s / beat) % 1 + 1) % 1, d = Math.min(ph, 1 - ph) * beat; if (d >= 0.05 && d < 0.08) shell++; shellUniform += Math.max(0, Math.min(0.03, half - 0.05)) / half; }
  }
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
  ctx.diagnostic(`${shell} onsets 50-80 ms from a beat line (a uniform sea ${shellUniform.toFixed(0)})`);
  ctx.diagnostic(`${own} own themes, ${turns} library turns, ${crossed} with a cross swell; ${waves} waves, ${greats} great, ${bells} bells; peak periods ${Math.min(...periods).toFixed(1)}-${Math.max(...periods).toFixed(1)} s; a wave's period over its theme's median p10 ${q(ratios, 0.1).toFixed(2)}, p90 ${q(ratios, 0.9).toFixed(2)}; sizes p10 ${q(heights, 0.1).toFixed(2)}, p90 ${q(heights, 0.9).toFixed(2)}`);
  assert.ok(own >= 18, `only ${own} own themes of 36`);
  assert.ok(greats > 0 && greats < waves / 15, `${greats} great waves of ${waves}`);
  assert.ok(crossed > 0 && crossed < own, `a cross swell in ${crossed} of ${own} themes`);
  assert.ok(Math.min(...periods) >= ROW.period.s[0] - 1e-6 && Math.max(...periods) <= ROW.period.s[1] + 1e-6, 'a peak period outside the row\'s at the place\'s own birds');
  // irregular, as a sea is: the waves' periods spread some ±20 % about their theme's, the sets of many lengths
  assert.ok(q(ratios, 0.1) < 0.88 && q(ratios, 0.9) > 1.15, `the periods within ${q(ratios, 0.1).toFixed(2)}-${q(ratios, 0.9).toFixed(2)} of their theme's: a metronome`);
  assert.ok(setSizes.size >= 5, `the sets only ${[...setSizes].join(', ')} waves long`);
  assert.ok(shell < 1.3 * shellUniform, `${shell} onsets 50-80 ms from a beat line, ${(shell / shellUniform).toFixed(2)} times a uniform sea's ${shellUniform.toFixed(0)}`);
});

test('the pulls that stay at WAVES keep the sea and play its leans: Tide its size, Root the undertow, Veil the sea state, Zephyr the spray', () => {
  const pull = (bird: string, v: number) => WAVES.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
  const own = (spell: string) => SEEDS.slice(0, 6).map((s) => at(s, 1, spell)).filter((t) => !t.drawn);
  const gainOf = (ts: Theme[], part: string) => { const g = ts.flatMap((t) => (programOf(t).events as unknown as Ev[]).filter((e) => e.part === part).map((e) => Number(e.p.gain))); return g.reduce((a, b) => a + b, 0) / Math.max(1, g.length); };
  for (const [b, v] of [['ti', 0.55], ['ro', 0.25], ['ro', 0.85], ['ve', 0.35], ['ve', 0.85], ['ve', 1.00], ['ze', 0.45], ['ze', 0.95]] as const)
    for (const t of own(pull(b, v))) {
      assert.ok(t.sea, `${b}:${v} seed ${t.seed}: no sea`);
      assert.deepEqual(surfFaults(t), [], `${b}:${v} seed ${t.seed}`);
    }
  const base = own(WAVES);
  assert.ok(gainOf(own(pull('ti', 0.55)), 'sea-swell') < gainOf(base, 'sea-swell'), 'Tide down: the sea no smaller');
  assert.ok(gainOf(own(pull('ro', 0.85)), 'sea-undertow') > gainOf(own(pull('ro', 0.25)), 'sea-undertow'), 'Root: the undertow no heavier up');
  const period = (ts: Theme[]) => ts.reduce((a, t) => a + t.sea!.periodS, 0) / ts.length;
  const state = (ts: Theme[], k: 'spread' | 'chopAmp') => ts.reduce((a, t) => a + t.sea!.state[k], 0) / ts.length;
  assert.ok(period(own(pull('ve', 0.85))) < period(own(pull('ve', 0.35))), 'Veil: the period no shorter up');
  assert.ok(state(own(pull('ve', 0.85)), 'spread') > state(own(pull('ve', 0.35)), 'spread'), 'Veil: the swell\'s band no broader up');
  assert.ok(state(own(pull('ve', 0.85)), 'chopAmp') > state(own(pull('ve', 0.35)), 'chopAmp'), 'Veil: the chop no stronger up');
  assert.ok(gainOf(own(pull('ze', 0.95)), 'sea-surf') > gainOf(own(pull('ze', 0.45)), 'sea-surf'), 'Zephyr: the spray no brighter up');
  // the calm floor (ambient-waves-3): Tide down brings the bloom nearer, a little louder, and the trim follows what Tide
  // and Veil take from the sea (where its windows measure), so a calm pull is lifted and a large rough one eased
  assert.ok(gainOf(own(pull('ti', 0.55)), 'wave-bloom') > gainOf(base, 'wave-bloom'), 'Tide down: the bloom no nearer');
  const measured = (ts: Theme[]) => ts.reduce((a, t) => a + Number((t as { sound?: { measuredLufs?: number } }).sound?.measuredLufs), 0) / ts.length;
  const calm = own(WAVES.replace('ti:0.85', 'ti:0.55').replace('ve:0.60', 've:0.35')), rough = own(WAVES.replace('ti:0.85', 'ti:1.00').replace('ve:0.60', 've:1.00'));
  assert.ok(measured(calm) < measured(base) && measured(base) < measured(rough), `the sea's measured level ${measured(calm)}, ${measured(base)}, ${measured(rough)} at the calm pull, the place and the rough corner`);
  assert.ok(calm.every((t) => t.trimDb! > base[0].trimDb!) && rough.every((t) => t.trimDb! < base[0].trimDb!), 'the trim does not follow the sea');
});

test('the sea is one line of the place: taken out, WAVES plays the lanes it held off', () => {
  const style = withoutTechniques(APP, 'sea');
  for (const seed of ['1', '3', '5']) {
    const t = quiet(() => planTheme(seed, 1, { strategy: 'house-v2', style, spell: parseSpell(WAVES)! }));
    assert.equal(t.sea, undefined, `seed ${seed}: a sea without its line`);
    const layers = new Set((programOf(t).events as unknown as Ev[]).map((e) => e.layer));
    assert.ok(layers.has('pad') && layers.has('bass'), `seed ${seed}: the pad and the sub not back (${[...layers].join(', ')})`);
  }
});

/**
 * The first 16 hex digits of each whole program (`themeHash`, `tools/link-digest.ts`) as `local` planned it: 79a9443b,
 * unmoved on 4055c89b, and three BELLS pins re-recorded on a0651532, where the bells-birds round gave BELLS's birds their
 * jobs (each marked; the branch plans `local`'s hash on every pin):
 * the slow spells PLAN-AMBIENT §2.4 protects that no link-digest row holds (seed 6's golden, the Ambient tile), and a
 * probe of the ring around WAVES where the weather's row is "none" — BELLS's own and two of its pulls, the landscape's
 * ambient centre, the dark corner, the rooted corner, Tide and Loom at one, the birds at their ends on the slow side and
 * at the house's tempo, the house, a fast place, the slow groove, the benchmark's wet pull.
 */
const PROTECTED: Record<string, string> = {
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=1': 'ac2d3751bae2c637',
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=2': 'e99faaf857921c8a',
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=3': 'eedeff81be8aeab9',
  'seed=6&v=2&spell=em:0.00,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80&theme=4': '6ea0e00d4737bbaf',
  'seed=1&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': 'c0945e862529d1b4',
  'seed=2&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': '4682ff1b1a1ff5a4',
  'seed=3&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': 'f6af92c14db90357',
  'seed=4&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': '1e5f019bb457a527',
  'seed=5&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': 'd221f7fbc952eab1',
  'seed=6&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': '30971008cdc343e3',
  'seed=7&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': '980302f9d500c15a',
  'seed=8&v=2&spell=em:0.10,ti:0.85,ze:0.90,ro:0.50,ve:0.30,sp:0.00,lo:0.80': '3ececc1aa87bb93d',
  'seed=1&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '9683b597a7dc7378' /* inside the bells' box, the zone's */,
  'seed=2&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': 'f104b8cae402eedc' /* inside the bells' box, the zone's */,
  'seed=3&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '1825a40f3f4c7fe7' /* inside the bells' box, the zone's */,
  'seed=4&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': '6ec6d7e3071c99ab' /* inside the bells' box, the zone's */,
  'seed=1&v=2&spell=em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.60,sp:0.55,lo:0.90': 'bf434cf2a028b8b2' /* inside the bells' box, the zone's */, // bells-birds: Veil 0.60 lengthens BELLS's rests
  'seed=2&v=2&spell=em:0.05,ti:0.85,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90': 'a17f44ef11d3be17' /* inside the bells' box, the zone's */, // bells-birds: Tide 0.85 BELLS's send
  'seed=1&v=2&spell=em:0.08,ti:0.90,ze:0.35,ro:0.55,gl:0.45,ve:0.15,sp:0.10,lo:0.90': '87e02c063f7dee9a',
  'seed=1&v=2&spell=em:0.05,ti:0.95,ze:0.10,ro:0.30,gl:0.10,ve:0.10,sp:0.00,lo:0.95': '1386ed38d249f23d',
  'seed=1&v=2&spell=em:0.05,ti:0.90,ze:0.30,ro:1.00,gl:0.30,ve:0.20,sp:0.00,lo:1.00': '1bd180ad3930608a',
  'seed=1&v=2&spell=em:0.00,ti:1.00,ze:0.50,ro:0.50,gl:0.50,ve:0.00,sp:0.00,lo:1.00': '4184dfb741bfde21',
  'seed=1&v=2&spell=em:0.00,ti:1.00,ze:0.00,ro:1.00,gl:0.00,ve:0.00,sp:0.00,lo:1.00': 'c796ea5a88c5775e',
  'seed=1&v=2&spell=em:0.00,ti:0.00,ze:1.00,ro:0.00,gl:1.00,ve:1.00,sp:1.00,lo:0.00': 'c8e26ea901b8eb44' /* outside the box: the tables less the zone's */, // bells-birds: BELLS's birds at their ends (Root's light bells, Veil and Loom's floor on the rests)
  'seed=1&v=2&spell=ti:1.00,ze:0.00,ro:1.00,gl:1.00,ve:1.00,sp:0.00,lo:1.00': 'bdbe29329814df6d',
  'seed=10&v=2': 'fabbe2fe1e2f381d',
  'seed=1&v=2&spell=em:0.95': 'aa2f6b8cc8f61da2',
  'seed=1&v=2&spell=em:0.30,ti:0.70,ro:0.55': '430109bf855c7191',
  'seed=1&v=2&spell=em:0.14,ti:0.85,gl:0.00,ve:0.34,sp:0.00,lo:0.81': 'e92b3449d50d5b99',
  // Ember up from WAVES, where the kit comes on and WAVES is still the ambient voices' nearest (the review of 10-18, its
  // first finding): the sea needs no drums (`no-kit`), so these play `local`'s programs (3a90d7b1), the kit and the lanes
  'seed=3&v=2&spell=em:0.20,ti:0.85,ze:0.75,ro:0.55,gl:0.50,ve:0.60,sp:0.10,lo:0.95': '7be4c3d83663a38f',
  'seed=1&v=2&spell=em:0.25,ti:0.85,ze:0.75,ro:0.55,gl:0.50,ve:0.60,sp:0.10,lo:0.95': '9839449db1c9a8e5',
  'seed=1&v=2&spell=em:0.35,ti:0.85,ze:0.75,ro:0.55,gl:0.50,ve:0.60,sp:0.10,lo:0.95': 'd1805b75dc59781b',
};

test('where the weather\'s row is "none" the admission moves nothing: the protected spells and the ring around WAVES lay no sea and play the programs they played', () => {
  for (const [link, hash] of Object.entries(PROTECTED)) {
    const { plan } = quiet(() => played(link));
    assert.equal(plan.sea, undefined, `${link}: a sea`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});

/**
 * **A sea refused is no sea** (the review of 10-18, its third finding): the lanes the sea replaces are held off before it
 * is laid, and it can still be refused (the cast over the ceiling after its fallbacks). A style whose WAVES lays its sea
 * under the kit and holds nothing off (Ember 0.30: the kit, the pad, the sub and the keys' figure besides) is over the
 * ceiling: the sea is refused and the theme plays the program the sea taken out plays, to the bit, the lanes as drawn.
 * And on the shipped style, every own theme at WAVES and at its pulls that holds those lanes off lays its sea.
 */
test('a sea refused is no sea: the theme plays the lanes it would have held off, the program with the sea taken out', () => {
  const P = (APP as unknown as { places: { ambientVoices: AmbientVoicesEntry[] } }).places;
  const heavy = { ...APP, places: { ...P, ambientVoices: P.ambientVoices.map((e) => e.weather ? { ...e, weather: { ...e.weather, needs: [], holdOff: [] } } : e) } } as typeof APP;
  const spell = parseSpell(WAVES.replace('em:0.05', 'em:0.30'))!;
  for (const seed of ['1', '3', '5']) {
    const t = quiet(() => planTheme(seed, 1, { strategy: 'house-v2', style: heavy, spell }));
    const none = quiet(() => planTheme(seed, 1, { strategy: 'house-v2', style: withoutTechniques(heavy, 'sea'), spell }));
    assert.equal(t.sea, undefined, `seed ${seed}: the sea fitted under the ceiling (${t.sea?.budget.before} units)`);
    assert.equal(themeHash(t), themeHash(none), `seed ${seed}: a refused sea is not the program without it`);
  }
  for (const spell of [WAVES, WAVES.replace('ti:0.85', 'ti:1.00').replace('ve:0.60', 've:1.00'), WAVES.replace('ti:0.85', 'ti:0.55').replace('ve:0.60', 've:0.35')])
    for (const seed of SEEDS) {
      const t = at(seed, 1, spell);
      if (t.drawn) continue;
      const layers = new Set((programOf(t).events as unknown as Ev[]).filter((e) => !e.part || !(SEA.has(e.part) || ON.has(e.part))).map((e) => e.layer));
      assert.ok(t.sea && t.sea.budget.after <= t.sea.budget.ceiling - 40, `${spell} seed ${seed}: ${t.sea ? `the cast ${t.sea.budget.after} of ${t.sea.budget.ceiling}` : 'no sea'}`);
      assert.ok(!layers.has('pad') && !layers.has('bass') && !layers.has('keys'), `${spell} seed ${seed}: ${[...layers].join(', ')} besides the sea`);
    }
});

/**
 * **One foreground a theme** (the ambient-waves review, 10-18): where the tables disagree — WAVES nearest in the
 * ambient voices' table, BELLS nearest in the conversation's (695 of 40 000 drumless spells, and the Spark pull from
 * WAVES at 0.60-0.80) — the sea yields to the conversation, and the spell plays the program `local` planned (a0651532:
 * the bells-birds round moved BELLS's program there, its birds' jobs; 4055c89b planned dc17552948567fb0).
 */
test('where WAVES is nearest in the ambient voices\' table and BELLS in the conversation\'s, one foreground: outside the bells\' box the sea and no conversation, inside it the conversation and no sea', () => {
  // since the zones (zones-pilot): BELLS's conversation is the zone's own entry, read only inside its box (Ember to 0.18,
  // Spark from 0.45, Veil to 0.60), where the ambient voices' lane is the zone's own no-details-or-weather-at-bells;
  // outside it the journey's table reads WAVES's own no-journey (192cafbd), so the sea is the one foreground there
  // (rc-ambient: the merged tree's programs; inside, Zephyr 0.72 off BELLS's own strikes the bells a little harder,
  // zephyr-air's strike hardness and nothing else)
  const link = 'seed=1&v=2&spell=em:0.06,ti:0.86,ze:0.72,ro:0.28,gl:0.82,ve:0.67,sp:0.36,lo:0.91';
  const spell = parseSpell('em:0.06,ti:0.86,ze:0.72,ro:0.28,gl:0.82,ve:0.67,sp:0.36,lo:0.91')!;
  const P = (APP as unknown as { places: { ambientVoices: AmbientVoicesEntry[]; conversation: ConversationEntry[] } }).places;
  const { plan } = quiet(() => played(link));
  assert.equal(nearestEntry(P.ambientVoices, spell, plan.bpm)?.id, 'the-sea-at-waves', 'the spell no longer stands nearest WAVES in the ambient voices\' table');
  assert.ok(nearestEntry(P.conversation, spell, plan.bpm)?.conversation, 'the spell no longer stands nearest a conversation');
  assert.ok(!plan.conversation && plan.sea, 'outside the box: a conversation, or no sea');
  assert.equal(themeHash(plan).slice(0, 16), '190a66c862d450f6', 'its program moved');
  const inside = quiet(() => played(link.replace('ve:0.67', 've:0.60').replace('sp:0.36', 'sp:0.45'))).plan;
  assert.ok(inside.conversation && !inside.sea, 'inside the box: not the conversation alone');
  assert.equal(themeHash(inside).slice(0, 16), '70054ac73cb6214e', 'its program moved');
});

/**
 * **The ring draws the sea** (`lanesOf` in control.ts, the `sea` moments in moments.ts): at WAVES the lanes the place
 * holds off draw the parts that enter on the waves over the bars they sound, every sea lane as deep as the sea is high
 * (all three depths), and the marks are the large waves' crests, the sets' lines, the bells and the great waves, so the
 * ring is never bare for long; a theme with no sea draws no sea mark (the protected spells and the ring around WAVES).
 */
/**
 * **The journey joins the one foreground second, ahead of the sea** (the merge of ambient-psy): PSY is not in the ambient
 * voices' table, so at its own spell that table's nearest is WAVES; the journey is admitted first, and the sea yields
 * there: PSY's program, as on `local`. **And the sea's rough end is the sea's** (the review of 10-19): WAVES says "no
 * journey" in the journey's table, so from WAVES the journey's nearest is WAVES itself all along Veil, and Veil 0.79-1.00
 * lays the sea (it had been PSY's journey there, the one foreground doing an address's job).
 */
test('at PSY the journey plays and the sea yields: one foreground, the journey ahead of the sea; from WAVES the sea plays to Veil\'s end', () => {
  const PSY = 'em:0.08,ti:0.90,ze:0.65,ro:0.60,gl:0.35,ve:0.90,sp:0.55,lo:0.70';
  const P = (APP as unknown as { places: { ambientVoices: AmbientVoicesEntry[] } }).places;
  let own = 0;
  for (const seed of SEEDS) for (const theme of [1, 2]) {
    const t = at(seed, theme, PSY);
    if (t.drawn) continue;
    own++;
    assert.equal(nearestEntry(P.ambientVoices, parseSpell(PSY)!, t.bpm)?.id, 'the-sea-at-waves', 'PSY no longer stands nearest WAVES in the ambient voices\' table');
    assert.ok(t.journey && !t.sea, `PSY seed ${seed} theme ${theme}: ${t.journey ? 'a journey' : 'no journey'}, ${t.sea ? 'a sea' : 'no sea'}`);
  }
  assert.ok(own >= 12, `${own} own themes at PSY`);
  const J = (APP as unknown as { places: { journey: Array<{ id: string; place: unknown; journey?: unknown }> } }).places.journey;
  for (const v of ['0.80', '0.85', '0.90', '1.00']) {
    const sp = WAVES.replace('ve:0.60', `ve:${v}`), rough = at('1', 1, sp);
    assert.equal(nearestEntry(J as never, parseSpell(sp)!, rough.bpm)?.id, 'no-journey-at-waves', `Veil ${v} from WAVES: the journey's table no longer reads WAVES`);
    assert.ok(rough.sea && !rough.journey, `Veil ${v} from WAVES: ${rough.journey ? 'the journey' : 'no journey'}, ${rough.sea ? 'a sea' : 'no sea'}`);
  }
});

test('the ring draws the sea at WAVES, and no sea where there is none', () => {
  for (const seed of ['1', '3', '5']) {
    const { plan } = quiet(() => played(`seed=${seed}&v=2&spell=${WAVES}`));
    const x = livelinessOf(plan);
    const lanes = lanesOf(plan as unknown as Parameters<typeof lanesOf>[0])!;
    for (const id of ['pad', 'bass', 'fx']) {
      const L = Array.from(lanes.level[id] ?? []);
      assert.ok(L.filter((v) => v > 0).length >= plan.bars / 4, `seed ${seed}: the ${id} lane inked on ${L.filter((v) => v > 0).length} of ${plan.bars} bars`);
      assert.ok([1, 2, 3].every((v) => L.includes(v)), `seed ${seed}: the ${id} lane not as deep as the sea is high (${[...new Set(L)].join(', ')})`);
    }
    const marks = marksOf(plan, plan.bars);
    assert.ok(['turn', 'crest', 'keys'].every((k) => marks.some((m) => m.kind === k)), `seed ${seed}: the sea's marks ${[...new Set(marks.map((m) => m.kind))].join(', ')}`);
    assert.ok(x.perMin >= 2 && x.longestS <= 90, `seed ${seed}: ${x.perMin} marks a minute, ${x.longestS} s unmarked`);
  }
  for (const link of Object.keys(PROTECTED)) {
    const { plan } = quiet(() => played(link));
    assert.ok(!(plan.moments ?? []).some((m: { by?: string }) => m.by === 'sea'), `${link}: a sea mark`);
    assert.ok(plan.conversation || !(plan.moments ?? []).some((m: { by?: string }) => m.by === 'conversation'), `${link}: a conversation's mark with no conversation`);
  }
});

/**
 * **The ring draws the conversation** (ambient-waves-3, the sea's rule at BELLS: its ring was as empty as WAVES's had
 * been): the calls, the answers and the hand's marks ink the lanes they play in over the bars they sound, as deep as
 * they were struck (the ground's bowl inks nothing), and each exchange is a pair of strokes on the low track, the
 * call's and its answer's. Every other ring is the one it was (the 178 links' drawn data, the round's note).
 */
test('the ring draws the conversation at BELLS: its strikes ink their lanes by depth, its exchanges are marked', () => {
  const BELLS = 'em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90';
  for (const seed of ['1', '3', '5']) {
    const { plan } = quiet(() => played(`seed=${seed}&v=2&spell=${BELLS}`));
    assert.ok(plan.conversation, `BELLS seed ${seed}: no conversation`);
    const lanes = lanesOf(plan as unknown as Parameters<typeof lanesOf>[0])!;
    const keys = Array.from(lanes.level.keys ?? []);
    assert.ok(keys.filter((v) => v > 0).length >= plan.bars / 4 && new Set(keys.filter((v) => v > 0)).size >= 2, `BELLS seed ${seed}: the keys lane inked on ${keys.filter((v) => v > 0).length} of ${plan.bars} bars, depths ${[...new Set(keys)].join(', ')}`);
    assert.ok(keys.some((v) => v === 0), `BELLS seed ${seed}: the keys lane never rests (the ground inks it)`);
    const marks = marksOf(plan, plan.bars);
    const x = livelinessOf(plan);
    assert.ok(marks.filter((m) => m.kind === 'exchange').length >= 8, `BELLS seed ${seed}: ${marks.filter((m) => m.kind === 'exchange').length} exchanges marked`);
    // (ambient-waves-4, the review of 10-19) an exchange is a call and its first answer within a breath: none spans a
    // breakdown's edge or reaches past a breath and a call's notes, and the keys lane holds one depth across each
    const breath = (plan.conversation as { breathS: number }).breathS, bar = plan.barSeconds;
    for (const m of marks.filter((x) => x.kind === 'exchange')) {
      const edge = plan.arrangement.sections.filter((x: { kind: string }) => x.kind === 'breakdown').flatMap((x: { startBar: number; bars: number }) => [x.startBar, x.startBar + x.bars]).find((b: number) => m.from < b && m.to > b);
      assert.equal(edge, undefined, `BELLS seed ${seed}: the exchange ${m.label} spans the breakdown's edge at bar ${edge}`);
      assert.ok((m.to - m.from) * bar <= breath + 6 + bar / 8, `BELLS seed ${seed}: the exchange ${m.label} spans ${((m.to - m.from) * bar).toFixed(1)} s`);
      const L = keys.slice(Math.floor(m.from), Math.floor(m.to) + 1);
      assert.ok(new Set(L).size === 1, `BELLS seed ${seed}: the keys lane steps ${L.join('')} inside the exchange ${m.label}`);
    }
    assert.ok(x.perMin >= 1.5 && x.longestS <= 90, `BELLS seed ${seed}: ${x.perMin} marks a minute, ${x.longestS} s unmarked`);
  }
});
