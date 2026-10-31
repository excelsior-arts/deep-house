// **BOWLS** (PLAN-AMBIENT P2, ambient-bowls, 10-27; his ask of 10-17: *"yoga shabassana sound healing themes"*), in
// node, on the compiled program: the row admitted and the rim a place's alone; at BOWLS (seeds 1-12, themes 1-3) every
// theme the composer plays as its own lays the bowls and holds their rules — three sizes of one bowl over the ground's
// great bowl (the tonic, its fifth and its octave), two struck a beat apart or one alone, rests of some 20-50 s, the
// rim sung under a bowl just struck and never two at once, a held bed of strings over the tonic (or a slow sway) and nothing
// else, Tide's wash taking the bed away at its low end (round 2), the
// breath on the melodic bus as one writer, every bowl beating under 1.5 Hz, the oscillators under the phone's 32 — and
// each control steers what its words say there; and **containment**: at the place's library turns, at the pulls that
// leave it and at its neighbours (WAVES, PSY, BELLS, the Ambient tile, 27191's spell) every program is the one `local`
// 15eff723 planned, and nothing else in the conversation's table plays the bowls. The link digest is `tools/bless.ts`'s.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { programOf } from '../src/mix.ts';
import { parseSpell, HOUSE, BIRDS, derive, type Spell } from '../src/spell.ts';
import { conversationRowsFaults, conversationRowOf, conversationLeans, washOf } from '../src/slow-conversation.ts';
import { places as PLACES } from '../src/styles/deep-house-places.ts';
import { nearestEntry, zoneOf } from '../src/places.ts';
import { BY_NAME, malletLives } from '@deep-house/engine/voices';
import { AWAITING, BY_PLACE } from '../src/catalogue-v2.ts';
import { strategyById } from '../src/strategies/index.ts';
import { TECHNIQUE_LIST, techniqueBandsOf } from '../src/bird-labels.ts';
import { played, themeHash } from './link-digest.ts';

const BOWLS = 'em:0.02,ti:0.95,ze:0.50,ro:0.40,gl:0.80,ve:0.00,sp:0.00,lo:1.00';
const ROW = conversationRowOf('bowls-breathing')!;
const ENTRY = (PLACES.conversation as any[]).find((e) => e.technique?.row === 'bowls-breathing');
const CENTRE = Object.fromEntries(BIRDS.map((b) => [b, ENTRY.place.birds[b] ?? HOUSE[b]])) as Spell;
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const at = (seed: number | string, theme: number, spell = BOWLS) => quiet(() => played(`seed=${seed}&v=2&spell=${spell}&theme=${theme}`).plan);
const pull = (bird: string, v: number) => BOWLS.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
type Ev = { t: number; voice: string; layer: string; part?: string; role?: string; bar: number | null; step: number | null; p: Record<string, any> };
const PARTS = new Set(['conversation-ground', 'conversation-call', 'conversation-answer', 'conversation-rim']);
const hzOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** each oscillator a strike runs, for its own seconds: the mallet's partials (`malletLives`), the rim's modes for the stick's time and the ring */
const livesOf = (e: Ev): number[] => {
  const row = BY_NAME[e.voice]?.row as { topology?: string; parameters?: any } | undefined;
  if (row?.topology === 'mallet') return malletLives(row.parameters, Number(e.p.vel));
  if (row?.topology === 'rim-bowl') return Array(row.parameters.partials.length).fill(Math.max(row.parameters.attack, Number(e.p.dur)) + row.parameters.ring + 0.024);
  return [];
};

test('the bowls\' row is admitted, and the rim is a place\'s alone, out of the awaiting list', () => {
  assert.deepEqual(conversationRowsFaults((v) => !!BY_NAME[v]), []);
  assert.deepEqual(ROW.scale, [0, 4], 'the bowls are the tonic and the fifth');
  assert.ok(ROW.bowls && ROW.rim && ROW.breath, 'the bowls, the rim and the breath');
  assert.ok(!AWAITING.some((a) => a.id === 'bowlRim') && BY_PLACE.some((a) => a.id === 'bowlRim'), 'the rim waits, or is no place\'s');
  // no row but the conversation's names the rim (a place's alone: no widened list opens it)
  const named = fs.readdirSync(new URL('../recipes/', import.meta.url), { recursive: true }).filter((f) => String(f).endsWith('.json'))
    .filter((f) => !String(f).endsWith('conversation.json') && /bowlRim/.test(fs.readFileSync(new URL(`../recipes/${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(named, []);
  assert.ok(ENTRY && ENTRY.technique.harmony?.cycles?.length && ENTRY.technique.form && ENTRY.technique.bed && (ENTRY.technique.needs ?? []).includes('no-kit'), 'the entry\'s own harmony, form, bed and need');
  assert.ok(ROW.wash && ROW.birds.by.tide?.bed && !ROW.birds.by.tide?.send && !ROW.birds.by.tide?.tail, 'Tide the wash, the room\'s sends and tail kept');
});

/** The bowls' rules over one theme's program, gathered. */
function bowlsFaults(t: any, spell = BOWLS): string[] {
  const bad: string[] = [];
  const check = (ok: unknown, says: string) => { if (!ok) bad.push(says); };
  const prog = programOf(t) as any;
  const ev = prog.events as Ev[];
  const conv = ev.filter((e) => PARTS.has(e.part ?? ''));
  const end = t.bars * t.barSeconds;
  const c = t.conversation;
  check(c?.row === 'bowls-breathing', 'no bowls');
  // nothing but the bowls and their bed: no sub, no figure, no drums, no hand, no noise; the bed strings or their swell
  check(ev.every((e) => PARTS.has(e.part ?? '') || e.layer === 'pad'), `something besides the bowls and the bed: ${[...new Set(ev.filter((e) => !PARTS.has(e.part ?? '') && e.layer !== 'pad').map((e) => `${e.voice}/${e.layer}`))].join(', ')}`);
  const beds = new Set(ev.filter((e) => e.layer === 'pad').map((e) => e.p.timbre ?? e.voice));
  // Tide's wash (round 2): from its cut down no bed at all, the bowls alone; else the strings or their swell
  const W = washOf(ROW, parseSpell(spell)!, CENTRE);
  if (W.off) check(beds.size === 0, `a bed under the bowls alone: ${[...beds].join(', ')}`);
  else check([...beds].every((b) => b === 'strings' || b === 'swell') && beds.size === 1, `the bed ${[...beds].join(', ')}`);
  // the harmony: the tonic held, or a slow sway to the fourth or the sixth and back
  check(t.progression.chords.every((x: any) => [0, 3, 5].includes(x.degree)) && t.progression.chords[0].degree === 0, 'the harmony leaves the tonic\'s sway');
  // the form: an opening, a long middle, a close
  const kinds = t.arrangement.sections.map((s: any) => s.kind);
  check(kinds[0] === 'intro' && kinds[kinds.length - 1] === 'outro' && kinds.slice(1, -1).every((k: string) => k === 'main'), `the form ${kinds.join(' ')}`);
  const kindAt = (s: number) => (t.arrangement.sections.find((x: any) => s + 1e-4 >= x.startBar * t.barSeconds && s + 1e-4 < (x.startBar + x.bars) * t.barSeconds) ?? t.arrangement.sections.at(-1)).kind;
  // the bowls: the ground one great bowl; every other a size of it, the tonic, the fifth or the octave over it
  const ground = conv.filter((e) => e.part === 'conversation-ground');
  const great = ground[0]?.p.midi;
  check(ground.every((e) => e.p.midi === great), 'the ground leaves its great bowl');
  const set = ROW.bowls!.sets.find((x) => x.id === c.bowls?.set);
  check(set && great + Math.max(...set.sizes) <= ROW.bowls!.mostMidi, `the set ${c.bowls?.set} over ${great}`);
  const sizes = new Set(set?.sizes ?? []);
  for (const e of conv) if (e.part !== 'conversation-ground') check(sizes.has(e.p.midi - great), `${e.part} at ${e.t.toFixed(1)} s on ${e.p.midi}, no size of the great bowl ${great}`);
  // every bowl's pairs beat under 1.5 Hz (the struck bowl's: 0.0021 and 0.0065 of the fundamental; the rim holds its own)
  for (const e of conv) if (e.voice === 'bowlStruck') check(hzOf(e.p.midi) * 0.0065 < 1.5, `a bowl on ${e.p.midi} beats ${(hzOf(e.p.midi) * 0.0065).toFixed(2)} Hz`);
  // the ground rings over every strike to the next, and the theme opens on it
  for (let i = 1; i < ground.length; i++) check(ground[i].t - ground[i - 1].t <= Number(ground[i - 1].p.dur), `the ground's ring ends before its strike at ${ground[i].t.toFixed(1)} s`);
  check(ground[0].t <= ROW.ground.firstS[1] + 0.2, 'the theme opens without its great bowl');
  // a pair: the answer a beat after its call (its `afterS`, on its sixteenth and late), another bowl; and a long rest
  const s16 = t.barSeconds / 16, late = ROW.lateMs[1] / 1000;
  const calls = conv.filter((e) => e.part === 'conversation-call'), answers = conv.filter((e) => e.part === 'conversation-answer');
  for (const a of answers) {
    const call = [...calls].reverse().find((x) => x.t < a.t);
    check(call && a.t - call.t >= ROW.answerer.afterS[0] - 1e-6 && a.t - call.t <= ROW.answerer.afterS[1] + s16 + late + 1e-6 && a.p.midi !== call.p.midi,
      `the answer at ${a.t.toFixed(2)} s is no other bowl a beat after a call`);
  }
  for (let i = 1; i < calls.length; i++) check(calls[i].t - calls[i - 1].t >= 10, `two calls ${(calls[i].t - calls[i - 1].t).toFixed(1)} s apart`);
  for (const e of [...calls, ...answers]) check(kindAt(e.t) === 'main', `${e.part} at ${e.t.toFixed(1)} s in the ${kindAt(e.t)}`);
  // the rim: under a bowl struck just before on its pitch, never two at once, none near the end, only the opening's in the opening
  const rims = conv.filter((e) => e.part === 'conversation-rim');
  for (const [i, r] of rims.entries()) {
    const under = conv.find((e) => e.part !== 'conversation-rim' && e.p.midi === r.p.midi && r.t - e.t >= ROW.rim!.afterS[0] - 1e-6 && r.t - e.t <= ROW.rim!.afterS[1] + s16 + late + 1e-6);
    check(under, `the rim at ${r.t.toFixed(1)} s sings no bowl just struck`);
    if (i > 0) check(r.t >= rims[i - 1].t + Math.max(...livesOf(rims[i - 1])) - 1e-6, `two rims at once at ${r.t.toFixed(1)} s`);
    check(r.t + Number(r.p.dur) <= end - ROW.rim!.lastS + 1e-6, `a rim at ${r.t.toFixed(1)} s near the end`);
    check(kindAt(r.t) === 'main' || (i === 0 && under?.part === 'conversation-ground' && under === ground[0]), `a rim at ${r.t.toFixed(1)} s in the ${kindAt(r.t)}`);
  }
  // the phone's ceiling: every oscillator counted for its own seconds
  const marks: Array<[number, number]> = [];
  for (const e of conv) for (const l of livesOf(e)) { marks.push([e.t, 1]); marks.push([e.t + l, -1]); }
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let run = 0, most = 0;
  for (const [, d] of marks) { run += d; most = Math.max(most, run); }
  check(most <= ROW.oscillatorsMost, `${most} oscillators at once`);
  // the breath, the one writer on the melodic bus: its line is the breath's factor over the arrangement's (here one, no lift)
  const B = c.breath as { periodS: number; db: number; phaseS: number } | undefined;
  const mg = t.automation.melodicGain as Array<{ t: number; value: number }>;
  const periodF = conversationLeans(ROW, parseSpell(spell)!, CENTRE).factor('breath');
  check(B && B.periodS >= ROW.breath!.periodS[0] * periodF - 1e-3 && B.periodS <= ROW.breath!.periodS[1] * periodF + 1e-3 && B.db >= ROW.breath!.db[0] && B.db <= ROW.breath!.db[1], `the breath ${JSON.stringify(B)}`);
  if (B) {
    // the line, read back: one at the breath's floor, its depth over it at the crest, faded at both ends (`breathOf`)
    const R = ROW.breath!, depth = (x: number) => Math.max(0, Math.min(1, x / R.fadeS, (end - x) / R.fadeS));
    const f = (x: number) => 10 ** (B.db * depth(x) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x - B.phaseS)) / B.periodS)) / 20);
    const knotsAt = mg.filter((p) => Math.abs(((p.t / (B.periodS / R.steps)) % 1 + 1) % 1) < 1e-3 || Math.abs(((p.t / (B.periodS / R.steps)) % 1) - 1) < 1e-3 || p.t >= end - 1e-6);
    check(knotsAt.length >= mg.length - 2 && knotsAt.every((p) => Math.abs(p.value - f(p.t)) < 3e-4), 'the melodic bus carries more than the breath');
    // a call is struck as the room breathes out: on a floor, to its sixteenth and lateness
    for (const e of calls) {
      const fl = B.phaseS + Math.round((e.t - B.phaseS) / B.periodS) * B.periodS;
      check(e.t - fl >= -1e-6 && e.t - fl <= s16 + late + 1e-6, `a call at ${e.t.toFixed(2)} s off the breath's floor (${fl.toFixed(2)})`);
    }
  }
  // the strikes play as written, under the place's level
  for (const e of conv) check(e.role === 'detail' && e.p.fx == null, `${e.part} at ${e.t.toFixed(2)} s took a treatment`);
  check(t.sound?.targetLufs === ENTRY.technique.level.targetLufs, 'the theme does not measure itself at the place\'s level');
  return bad;
}

test('at BOWLS, seeds 1-12 themes 1-3: every own theme lays the bowls and holds their rules; a library turn lays none', (ctx) => {
  let own = 0, turns = 0, rims = 0;
  for (let s = 1; s <= 12; s++) for (let th = 1; th <= 3; th++) {
    const t = at(s, th);
    if (!t.conversation) { turns++; assert.ok(!(programOf(t) as any).events.some((e: Ev) => PARTS.has(e.part ?? '')), `s${s} t${th}: the bowls on a library turn`); continue; }
    own++;
    rims += t.conversation.rims ?? 0;
    assert.deepEqual(bowlsFaults(t), [], `seed ${s} theme ${th}`);
  }
  ctx.diagnostic(`${own} own themes, ${turns} library turns, ${rims} rims`);
  assert.ok(own >= 20, `only ${own} own themes`);
});

test('the pulls inside BOWLS keep the bowls and their rules, each control steering what its words say', () => {
  const own = (spell: string) => [1, 2, 3, 4, 5].map((s) => at(s, 1, spell)).filter((t) => t.conversation);
  const sum = (spell: string, f: (t: any) => number) => own(spell).reduce((a, t) => a + f(t), 0);
  const perMin = (spell: string) => sum(spell, (t) => (t.conversation.exchanges + t.conversation.ground) / (t.bars * t.barSeconds / 60));
  const rimsOf = (spell: string) => sum(spell, (t) => t.conversation.rims);
  // an answer's share on the set's great bowl (0) or its top (1)
  const share = (spell: string, top: 0 | 1) => {
    const ev = Array.from({ length: 12 }, (_, i) => at(i + 1, 1, spell)).filter((t) => t.conversation).flatMap((t) => { const e = (programOf(t) as any).events as Ev[]; const g = e.find((x) => x.part === 'conversation-ground')!.p.midi;
      const sz = ROW.bowls!.sets.find((x) => x.id === t.conversation.bowls.set)!.sizes; const want = top ? Math.max(...sz) : 0;
      return e.filter((x) => x.part === 'conversation-answer').map((x) => x.p.midi - g === want); });
    return ev.filter(Boolean).length / Math.max(1, ev.length);
  };
  for (const [b, v] of [['ve', 0.6], ['sp', 0.4], ['gl', 0.3], ['gl', 1], ['ze', 0], ['ze', 1], ['ro', 0], ['ro', 1], ['em', 0.15], ['ti', 0.5], ['ti', 0.1], ['ti', 0], ['lo', 0.3]] as const)
    for (const t of own(pull(b, v))) assert.deepEqual(bowlsFaults(t, pull(b, v)), [], `${b}:${v}`);
  assert.ok(perMin(pull('ve', 0.6)) > perMin(BOWLS) * 1.3, 'Veil: the strikes as often');
  assert.ok(rimsOf(pull('sp', 0.4)) > rimsOf(BOWLS) * 1.5, 'Spark: the rim as rare');
  assert.ok(share(pull('gl', 1), 1) > share(BOWLS, 1) && share(BOWLS, 1) > share(pull('gl', 0.3), 1) && share(pull('gl', 0.3), 0) > share(BOWLS, 0), 'Gleam: the small bowl against the great one');
  // Tide, the wash: the bowls alone at its low end, the bed under them lower toward it, the room's sends where they were
  const pads = (spell: string) => own(spell).reduce((a, t) => a + (programOf(t) as any).events.filter((e: Ev) => e.layer === 'pad').length, 0);
  const padDb = (spell: string) => own(spell).map((t) => (programOf(t) as any).settings.levels.pad as number);
  const sends = (spell: string) => own(spell).flatMap((t) => (programOf(t) as any).events.filter((e: Ev) => e.part === 'conversation-call').map((e: Ev) => e.p.reverb));
  assert.ok(pads(pull('ti', 0)) === 0 && pads(pull('ti', 0.1)) === 0 && pads(BOWLS) > 0 && pads(pull('ti', 0.5)) > 0, 'Tide: the bowls alone at its low end');
  assert.ok(padDb(pull('ti', 0.5)).every((d, i) => d < padDb(BOWLS)[i] - 4), 'Tide: the bed lower toward the low end');
  assert.deepEqual([...new Set(sends(pull('ti', 0)))], [...new Set(sends(BOWLS))], 'Tide: the bowls\' room moved');
  const breath = (spell: string) => own(spell).map((t) => t.conversation.breath.periodS);
  assert.ok(Math.max(...breath(pull('em', 0.15))) < Math.min(...breath(BOWLS)) + 0.5, 'Ember: the breath as slow');
  const great = (spell: string) => own(spell).map((t) => (programOf(t) as any).events.find((x: Ev) => x.part === 'conversation-ground').p.midi);
  assert.ok(great(pull('ro', 1)).every((m, i) => m <= great(BOWLS)[i]), 'Root: the great bowl no deeper at its full end');
  const hard = (spell: string) => own(spell).flatMap((t) => (programOf(t) as any).events.filter((x: Ev) => x.part === 'conversation-call').map((x: Ev) => x.p.hardness ?? 1));
  assert.ok(Math.max(...hard(pull('ze', 0))) < 1 && Math.min(...hard(pull('ze', 1))) > 1 && hard(BOWLS).every((h) => h === 1), 'Zephyr: the strike');
  const rest = (spell: string) => sum(spell, (t) => t.bars * t.barSeconds / Math.max(1, t.conversation.exchanges));
  assert.ok(rest(pull('lo', 0.3)) < rest(BOWLS), 'Loom: the rests as long');
  // Ember over the kit's threshold: no bowls over drums (the entry's need), the theme as `local` planned it (below)
  assert.ok(![1, 2, 3].some((s) => at(s, 1, pull('em', 0.25)).conversation), 'the bowls over a kit');
});

test('each control\'s words at BOWLS solve from the planner\'s own numbers, at least two bands each, cut inside the control', () => {
  const v2 = strategyById('house-v2').style;
  const tech = TECHNIQUE_LIST.find((x) => x.field === 'conversation')!;
  const labels = tech.labelsOf('bowls-breathing')!;
  const birds = Object.keys(labels).filter((k) => (BIRDS as readonly string[]).includes(k));
  assert.deepEqual(birds.sort(), ['ember', 'gleam', 'loom', 'root', 'spark', 'tide', 'veil', 'zephyr']);
  for (const b of birds) {
    const bands = techniqueBandsOf(tech, 'bowls-breathing', b as any, v2);
    assert.ok(bands && bands.length >= 2, `${b}'s bands do not solve`);
    for (const [k, x] of bands!.entries()) if (k < bands!.length - 1) assert.ok(x.upTo! > 0 && x.upTo! < 1 && (k === 0 || x.upTo! > bands![k - 1].upTo!), `${b}'s ${x.word} cut at ${x.upTo}`);
  }
});

/**
 * **Containment**: the first 16 hex digits of each whole program (`themeHash`) as `local` 15eff723 planned it — BOWLS's
 * library turns, the pulls that leave the place (Ember over the kit's threshold, Gleam toward nought, Veil at one, Spark
 * into the bells' zone), and the neighbours (WAVES, PSY, BELLS, the Ambient tile, 27191's spell), each seeds 1-3. None
 * plays the bowls, and none moved.
 */
const UNMOVED: Record<string, string> = JSON.parse(fs.readFileSync(new URL('./check-bowls-unmoved.json', import.meta.url), 'utf8')).programs;

test('outside BOWLS nothing moved: its library turns, the pulls that leave it and its neighbours play what `local` planned', () => {
  for (const [link, hash] of Object.entries(UNMOVED)) {
    const { plan } = quiet(() => played(link));
    assert.notEqual(plan.conversation?.row, 'bowls-breathing', `${link}: the bowls`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});

test('the bowls play only where BOWLS is the conversation table\'s nearest and no drums play', () => {
  // a sweep of the drumless ring and its edge: where a theme plays the bowls, BOWLS's entry is the nearest of the
  // conversation's table (outside every zone) and the spell derives no drums; where it does not, one of those is false
  const rand = (() => { let x = 0x2f6b; return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32); })();
  let bowls = 0, other = 0;
  for (let i = 0; i < 160; i++) {
    const sp = Object.fromEntries(BIRDS.map((b) => [b, +(b === 'ember' ? rand() * 0.3 : rand()).toFixed(2)])) as Spell;
    // half the probes near BOWLS's own birds
    if (i % 2) for (const b of BIRDS) sp[b] = +Math.max(0, Math.min(1, CENTRE[b] + (rand() - 0.5) * 0.5)).toFixed(2);
    const s = BIRDS.map((b) => `${b.slice(0, 2)}:${sp[b].toFixed(2)}`).join(',');
    const t = at(1, 1, s);
    const near = !zoneOf(PLACES, sp) && nearestEntry(PLACES.conversation!.filter((e) => !(PLACES.zones ?? []).some((z) => z.rows.conversation === e.id)), sp, t.placeBpm ?? t.bpm)?.technique?.row === 'bowls-breathing';
    if (t.conversation?.row === 'bowls-breathing') { bowls++; assert.ok(near && !derive(sp).drumsOn, `${s}: the bowls where BOWLS is not the nearest`); }
    else other++;
  }
  assert.ok(bowls >= 20 && other >= 20, `${bowls} bowls, ${other} other`);
});
