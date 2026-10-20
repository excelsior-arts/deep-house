// Struck voices in slow conversation (PLAN-AMBIENT Phase 1, `src/slow-conversation.ts`), in node, on the compiled
// program: the row admitted; at BELLS (seeds 1-12, themes 1-3), every theme the composer plays as its own lays a
// conversation that holds the planner's invariants — no call or answer over another, the ground's ring over every bar
// from its first strike to its last, the hand at most once an exchange and never within `clearS` of a strike, every
// pitch in its role's register and the key's pentatonic — with no sub, no pad, no keys' figure, no whistle and no
// noise, at most four voices of its own (and one a section Veil hands over, and the heartbeat's) and the cast under the
// catalogue's ceiling; a library turn there plays its row and no conversation; every bird's lean moves its knob the way
// its name says (bells-birds: Root the bells' size, Veil the count, Ember the pulse, Tide the space, Zephyr the strike,
// Gleam the ground's light, Spark the movement, Loom the form) and at the tile none moves anything (the 24 own themes'
// programs as `local` 79a9443b planned them, and since the zones pilot the 12 that were library turns as the
// conversation); outside the zone's box nothing of BELLS is read (the zones pilot moved this check to the box); and the protected spells
// (PLAN-AMBIENT §2.4: seed 6's golden, themes 1-4, and the Ambient tile, seeds 1-8) plan no conversation and the
// whole programs they planned on `local` 61188d14. 27191 and the link rows are the link digest's (`tools/bless.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme, programOf } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { conversationRowsFaults, conversationLeans, CONVERSATION_ROWS } from '../src/slow-conversation.ts';
import { places as PLACES } from '../src/styles/deep-house-places.ts';
import { inZone, zoneBands } from '../src/places.ts';
import { BIRDS, HOUSE } from '../src/spell.ts';
import { BY_NAME, VOICE_COST_UNITS, malletLives } from '@deep-house/engine/voices';
import { CEILING } from '../src/catalogue-v2.ts';
import { isNoiseGlue } from '../src/glue.ts';
import { played, themeHash } from './link-digest.ts';
import { APP } from './as-played.ts';
import { withoutTechniques } from '../src/places.ts';
import fs from 'node:fs';
import { BY_PLACE } from '../src/catalogue-v2.ts';

const BELLS = 'em:0.05,ti:0.65,ze:0.65,ro:0.10,gl:0.80,ve:0.30,sp:0.55,lo:0.90';
const quiet = <T>(fn: () => T): T => {
  const keep = [console.log, console.info, console.warn];
  console.log = console.info = console.warn = () => {};
  try { return fn(); } finally { [console.log, console.info, console.warn] = keep; }
};
const SEEDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const ROW = CONVERSATION_ROWS[0];
const PARTS = new Set(['conversation-ground', 'conversation-call', 'conversation-answer', 'conversation-punctuation', 'conversation-pulse']);
/** the zone the conversation plays in (PLAN-ZONES §5), and BELLS's own birds, every bird named: the leans' centre */
const ZONE = PLACES.zones!.find((z) => z.rows.conversation)!;
const CENTRE = Object.fromEntries(BIRDS.map((b) => [b, ZONE.centre[b] ?? HOUSE[b]]));
/** the leans a theme's conversation was laid under (the planner's own arithmetic, the zone's bands on its address birds) */
const leansOf = (spell: string) => conversationLeans(ROW, parseSpell(spell)!, CENTRE, zoneBands(ZONE));
type Ev = { t: number; voice: string; layer: string; role?: string; part?: string; bar: number | null; step: number | null; p: Record<string, any> };

test('the conversation row is admitted: voices that exist, a pentatonic of the scale, registers of an octave, rests and chances in range', () => {
  assert.deepEqual(conversationRowsFaults((v) => !!BY_NAME[v]), []);
  assert.equal(CONVERSATION_ROWS.length, 1);
  assert.deepEqual(ROW.scale, [0, 2, 3, 4, 6], 'the key\'s pentatonic: the relative major\'s, from the minor or the dorian');
});

/** The section kind a second of a theme falls in (a strike on a section's first one, its seconds rounded, is the section's). */
const kindOf = (t: ReturnType<typeof planTheme>, s0: number, s = s0 + 1e-4) => (t.arrangement.sections.find((x) => s >= x.startBar * t.barSeconds && s < (x.startBar + x.bars) * t.barSeconds) ?? t.arrangement.sections[t.arrangement.sections.length - 1]).kind;

/** The planner's rules over one theme's program, gathered. */
function conversationFaults(t: ReturnType<typeof planTheme>, spell = BELLS): string[] {
  const bad: string[] = [];
  const check = (ok: unknown, says: string) => { if (!ok) bad.push(says); };
  const prog = programOf(t);
  const ev = prog.events as unknown as Ev[];
  const conv = ev.filter((e) => PARTS.has(e.part ?? ''));
  const end = t.bars * t.barSeconds;
  const c = t.conversation!;
  check(conv.length > 0, 'no strike laid');
  // nothing it replaces, nothing it refuses
  check(!ev.some((e) => e.layer === 'bass'), 'a sub sounds');
  check(!ev.some((e) => e.layer === 'pad'), 'a pad sounds');
  check(!ev.some((e) => e.layer === 'keys' && !PARTS.has(e.part ?? '')), 'a keys note outside the conversation');
  check(!ev.some((e) => e.layer === 'fx' && isNoiseGlue(e.voice)), 'a noise of the glue');
  check(!ev.some((e) => !PARTS.has(e.part ?? '')), `something besides the conversation: ${[...new Set(ev.filter((e) => !PARTS.has(e.part ?? '')).map((e) => `${e.voice}/${e.layer}`))].join(', ')}`);
  // at most four voices of its own, and one for each section Veil handed over and the heartbeat's, under the ceiling
  const voices = new Set(conv.map((e) => e.voice));
  check(voices.size <= 4 + c.handovers.length + (c.pulse ? 1 : 0), `${voices.size} voices`);
  const units = [...new Set(ev.map((e) => e.voice))].reduce((a, v) => a + (VOICE_COST_UNITS[BY_NAME[v]?.cost as keyof typeof VOICE_COST_UNITS] ?? 0), 0);
  check(units <= CEILING, `the cast ${units} units over ${CEILING}`);
  // every strike on the theme's sixteenths, with its lateness
  const s16 = t.barSeconds / 16;
  for (const e of conv) {
    const grid = (e.bar! * 16 + e.step!) * s16;
    check(e.t - grid >= -1e-6 && e.t - grid <= ROW.lateMs[1] / 1000 + 1e-6, `${e.part} at ${e.t.toFixed(2)} s is ${((e.t - grid) * 1000).toFixed(0)} ms off its sixteenth`);
    check(e.t < end, `${e.part} after the end`);
  }
  // pitches: the key's pentatonic, each role in its register as the bells' size leaned it, a voice at its own octave
  const LN = leansOf(spell);
  const pcs = new Set(ROW.scale.map((i) => (t.key.root + t.key.scale[i]) % 12));
  const reg = { 'conversation-call': LN.registers.caller, 'conversation-answer': LN.registers.answerer, 'conversation-ground': LN.registers.ground } as Record<string, [number, number]>;
  const octOf = (part: string, v: string) => 12 * ((part === 'conversation-call' ? ROW.caller : part === 'conversation-answer' ? ROW.answerer : ROW.ground).voices.find((x) => x.v === v)?.oct ?? 0);
  for (const e of conv) {
    if (e.part === 'conversation-punctuation' || e.part === 'conversation-pulse') { check(e.p.midi == null, `${e.part} pitched`); continue; }
    check(pcs.has(((e.p.midi % 12) + 12) % 12), `${e.part} ${e.p.midi} outside the key's pentatonic`);
    const r = reg[e.part!], o = octOf(e.part!, e.voice);
    check(e.p.midi - o >= r[0] && e.p.midi - o <= r[1], `${e.part} ${e.p.midi} (${e.voice}) outside ${r.join('-')}`);
  }
  // no call or answer over another: the parts' runs alternate, each starting after the last one's last strike
  const talk = conv.filter((e) => e.part === 'conversation-call' || e.part === 'conversation-answer');
  for (let i = 1; i < talk.length; i++) check(talk[i].t > talk[i - 1].t + 0.1, `two strikes of the talk at ${talk[i].t.toFixed(2)} s`);
  // ...and none of it within clearS of a ground strike as laid (the review's fix: a strike clear of the bowl before its
  // sixteenth and lateness could land a sixteenth nearer and flam it)
  const groundAt = conv.filter((e) => e.part === 'conversation-ground').map((e) => e.t);
  for (const e of talk) check(groundAt.every((g) => Math.abs(g - e.t) >= ROW.clearS - 1e-6), `${e.part} at ${e.t.toFixed(2)} s on a ground strike`);
  // the ground rings over every bar from its first strike to its last: no silent run of two bars
  const ground = conv.filter((e) => e.part === 'conversation-ground');
  check(ground.length >= 2, 'the ground struck once or never');
  for (let i = 1; i < ground.length; i++) check(ground[i].t - ground[i - 1].t <= Number(ground[i - 1].p.dur), `the ground's ring ends ${(ground[i].t - ground[i - 1].t - Number(ground[i - 1].p.dur)).toFixed(1)} s before its next strike at ${ground[i].t.toFixed(1)} s`);
  for (let i = 1; i < ground.length; i++) check(ground[i].t - ground[i - 1].t >= LN.apartS - 0.1, `two ground strikes ${(ground[i].t - ground[i - 1].t).toFixed(1)} s apart`);
  check(ground[0].t <= ROW.ground.firstS[1] + 0.2, 'the theme opens without its ground');
  check(end - ground[ground.length - 1].t >= ROW.ground.lastS - 0.2, 'the ground struck in its last seconds');
  // the heartbeat (Ember's top): on a bar's one, in a section that talks, never within clearS of a strike, never with the kit
  const beats = conv.filter((e) => e.part === 'conversation-pulse');
  for (const h of beats) {
    check(h.step === 0, `a heartbeat off the bar's one at ${h.t.toFixed(2)} s`);
    check(conv.every((e) => e === h || Math.abs(e.t - h.t) >= ROW.clearS), `a heartbeat at ${h.t.toFixed(2)} s on a strike`);
    check(!['intro', 'outro', 'breakdown'].includes(kindOf(t, h.t)), `a heartbeat in the ${kindOf(t, h.t)}`);
  }
  check(!beats.length || !ev.some((e) => e.layer === 'kick'), 'a heartbeat over the kit');
  check(c.pulse === beats.length, 'the summary counts the heartbeats');
  // the hand: never within clearS of a strike, at most once an exchange, never in the chapters of the ground alone
  const hands = conv.filter((e) => e.part === 'conversation-punctuation');
  for (const h of hands) check(conv.every((e) => e === h || Math.abs(e.t - h.t) >= ROW.clearS), `the hand at ${h.t.toFixed(2)} s on a strike`);
  check(hands.length <= c.exchanges, `${hands.length} hands over ${c.exchanges} exchanges`);
  // the ground gives way to the talk: no ground strike inside an exchange, from its call's first strike to its
  // answer's last (a call's strikes within its gap of each other, its answer's first within `afterS` of the call's
  // last and the rest within the answer's gap; the breakdown's single notes follow no call and are no exchange)
  const spans: Array<[number, number]> = [];
  let cur: [number, number] | null = null, lastPart = '';
  const callGap = ROW.caller.gapS[1] + 0.5, answerGap = ROW.caller.gapS[1] * ROW.answerer.gapMul + 0.5;
  for (const e of talk) {
    if (e.part === 'conversation-call') { if (!cur || lastPart === 'conversation-answer' || e.t - cur[1] > callGap) { cur = [e.t, e.t]; spans.push(cur); } else cur[1] = e.t; }
    else if (cur && e.t - cur[1] < (lastPart === 'conversation-call' ? ROW.answerer.afterS[1] + 0.5 : answerGap)) cur[1] = e.t;
    else cur = null;
    lastPart = e.part!;
  }
  for (const g of ground) check(!spans.some(([a, b]) => g.t > a && g.t < b), `the ground at ${g.t.toFixed(2)} s inside an exchange`);
  const kindAt = (s: number) => kindOf(t, s);
  for (const e of conv) if (e.part !== 'conversation-ground') check(!['intro', 'outro'].includes(kindAt(e.t)), `${e.part} in the ${kindAt(e.t)} at ${e.t.toFixed(1)} s`);
  for (const e of conv) if (e.part === 'conversation-call' || e.part === 'conversation-punctuation') check(kindAt(e.t) !== 'breakdown', `${e.part} in the breakdown at ${e.t.toFixed(1)} s`);
  // the phone's ceiling: every oscillator counted for its own seconds (a bar's partials stop at their own ends)
  const marks: Array<[number, number]> = [];
  for (const e of conv) {
    const row = BY_NAME[e.voice]?.row as { topology?: string; parameters?: any } | undefined;
    const lives = row?.topology === 'mallet' ? malletLives(row.parameters, Number(e.p.vel)) : row?.topology === 'fm-bell' ? Array(4).fill(Number(e.p.dur) + (row.parameters?.release ?? 1) + 0.02) : [];
    for (const l of lives) { marks.push([e.t, 1]); marks.push([e.t + l, -1]); }
  }
  marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let running = 0, most = 0;
  for (const [, d] of marks) { running += d; most = Math.max(most, running); }
  check(most <= ROW.oscillatorsMost, `${most} oscillators at once, over ${ROW.oscillatorsMost}`);
  // the conversation's memory: an answer is not the figure of one of the last `memory` answers, but for the theme's
  // last, which may bring back its first on purpose (the answers of the exchanges: the answer strikes after a call)
  const callOrAnswer = conv.filter((e) => (e.part === 'conversation-call' || e.part === 'conversation-answer') && kindOf(t, e.t) !== 'breakdown');
  const figures: string[] = [];
  for (let i = 0; i < callOrAnswer.length; i++) {
    const e = callOrAnswer[i];
    if (e.part !== 'conversation-answer') continue;
    if (callOrAnswer[i - 1]?.part === 'conversation-answer') figures[figures.length - 1] += ` ${e.p.midi}`;
    else figures.push(String(e.p.midi));
  }
  figures.forEach((f, i) => check(i === figures.length - 1 && f === figures[0] || !LN.memory || !figures.slice(Math.max(0, i - LN.memory), i).includes(f),
    `answer ${i + 1} (${f}) said again inside ${LN.memory} answers`));
  // the strikes play as written
  for (const e of conv) check(e.role === 'detail' && e.p.fx == null, `${e.part} at ${e.t.toFixed(2)} s took a treatment`);
  // and the plan says what it laid
  check(c.exchanges === Object.values(c.answers).reduce((a, b) => a + b, 0), 'every exchange answered or left open');
  check(c.ground === ground.length && c.punctuation === hands.length, 'the summary counts what was laid');
  return bad;
}

const at = (seed: string, theme: number, spell = BELLS) => quiet(() => played(`seed=${seed}&v=2&spell=${spell}&theme=${theme}`).plan);

test('at BELLS, seeds 1-12 themes 1-3: every theme a conversation holding the invariants; no library turn inside the zone', (ctx) => {
  let own = 0, turns = 0;
  const kinds: Record<string, number> = {};
  for (const seed of SEEDS) for (const theme of [1, 2, 3]) {
    const t = at(seed, theme);
    if (t.drawn) { turns++; continue; }
    own++;
    assert.ok(t.conversation, `seed ${seed} theme ${theme}: the composer's own theme lays no conversation`);
    assert.deepEqual(conversationFaults(t), [], `seed ${seed} theme ${theme}`);
    assert.ok(t.bpm >= 40 && t.bpm <= 70, `seed ${seed} theme ${theme}: ${t.bpm} BPM`);
    for (const [k, n] of Object.entries(t.conversation!.answers)) kinds[k] = (kinds[k] ?? 0) + n;
  }
  ctx.diagnostic(`${own} own themes, ${turns} library turns; answers ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.equal(turns, 0, `${turns} library turns inside the zone (its list is empty)`);
  for (const k of ['echo', 'invert', 'complete', 'open']) assert.ok((kinds[k] ?? 0) > 0, `no ${k} answer in 36 themes`);
});

test('the pulls inside the zone keep the conversation and play its leans: Spark the hands, Veil the rests', () => {
  const pull = (bird: string, v: number) => BELLS.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
  const sum = (spell: string, f: (t: ReturnType<typeof planTheme>) => number) => SEEDS.reduce((a, s) => { const t = at(s, 1, spell); return a + (t.conversation ? f(t) : 0); }, 0);
  for (const p of [['sp', 0.45], ['sp', 0.85], ['ti', 0.85], ['ve', 0.6], ['ze', 0.35], ['ro', 0.35], ['ro', 1], ['em', 0.15]] as const)
    for (const seed of ['1', '2', '3']) {
      const t = at(seed, 1, pull(p[0], p[1]));
      if (t.drawn) continue;
      assert.ok(t.conversation, `${p[0]}:${p[1]} seed ${seed}: no conversation`);
      assert.deepEqual(conversationFaults(t, pull(p[0], p[1])), [], `${p[0]}:${p[1]} seed ${seed}`);
    }
  const handsLow = sum(pull('sp', 0.5), (t) => t.conversation!.punctuation), handsHigh = sum(pull('sp', 0.85), (t) => t.conversation!.punctuation);
  assert.ok(handsHigh > handsLow, `Spark: ${handsLow} hands at 0.5, ${handsHigh} at 0.85`);
  const perMin = (spell: string) => sum(spell, (t) => t.conversation!.exchanges / (t.duration / 60));
  assert.ok(perMin(pull('ve', 0.6)) > perMin(BELLS), 'Veil up: no more exchanges a minute');
  const groundAt = (spell: string) => { const t = at('1', 1, spell); return Math.min(...programOf(t).events.filter((e: any) => e.part === 'conversation-ground').map((e: any) => e.p.midi)); };
  assert.ok(groundAt(pull('ro', 0.7)) < groundAt(BELLS), 'Root up: the ground no lower');
});

test('the place\'s level is its own in any room the die draws: a pull that lands a theme in the other room plays its strikes at the same level as the keys layer', () => {
  // Veil 0.60 and Spark 0.45 move the room die (the two rooms' keys layers stand 5 dB apart); the program's gains carry
  // the room's keys level, and read the same as at the place's own birds, so the strikes play no hotter there
  const pull = (bird: string, v: number) => BELLS.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
  const keysOf = (t: ReturnType<typeof planTheme>) => (APP.rooms as Record<string, any>)[t.preset]?.params?.levels?.keys as number;
  // by voice: Veil hands the call to another voice in some sections, and each voice stands at its own level
  const asPlayed = (t: ReturnType<typeof planTheme>, part: string, voice: string) => {
    const g = (programOf(t).events as unknown as Ev[]).filter((e) => e.part === part && e.voice === voice).map((e) => Number(e.p.gain));
    return g.length ? 20 * Math.log10(Math.max(...g)) : null;
  };
  let other = 0;
  for (const p of [['ve', 0.6], ['sp', 0.45]] as const) for (const seed of SEEDS) for (const theme of [1, 2, 3]) {
    const a = at(seed, theme), b = at(seed, theme, pull(p[0], p[1]));
    if (a.drawn || b.drawn || !a.conversation || !b.conversation || a.preset === b.preset) continue;
    other++;
    assert.ok(Math.abs(keysOf(a) - keysOf(b)) > 1, `seed ${seed} theme ${theme}: two rooms with the keys at the same level`);
    for (const [part, voice] of [['conversation-call', a.conversation.voices.caller], ['conversation-ground', a.conversation.voices.ground]]) {
      const x = asPlayed(a, part, voice), y = asPlayed(b, part, voice);
      if (x == null || y == null) continue;
      // the pull's own touch is the only difference (Veil's busier count plays every strike lighter, Spark's still end the ground louder)
      const L = leansOf(pull(p[0], p[1])), touch = L.touchDb + (part === 'conversation-ground' ? L.groundDb : 0);
      assert.ok(Math.abs(x + touch - y) < 0.05, `${p[0]}:${p[1]} seed ${seed} theme ${theme}: ${part} ${y.toFixed(2)} dB as played in ${b.preset}, ${x.toFixed(2)} in ${a.preset} (its touch ${touch.toFixed(2)})`);
    }
  }
  assert.ok(other >= 2, `only ${other} themes land in the other room at the pulls`);
});

test('no strike is struck past a sane level in any room: the growl room\'s pulls and every bird\'s ends, the hand under the answer', (ctx) => {
  // the growl room writes its shaker word off (-60); a hand that is not the word's own plays at the style's base level
  // there, and its footing read the -60 and struck it some 50 dB hot (gain 335 and 631; found by the PSY round, 10-18).
  // The tile's loudest strike is the bowl (gain 7.2); the great pole and Spark's still end lift it 4.5 dB at most.
  const MOST = 16;
  const pull = (bird: string, v: number) => BELLS.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
  const growl = [['ve', 0.6], ['sp', 0.45]].flatMap(([b, v]) => SEEDS.flatMap((s) => [1, 2, 3].map((th) => [s, th, pull(b as string, v as number)] as const)));
  const ends = [['ro', 0], ['ro', 0.89], ['ro', 1], ['ve', 0], ['ve', 0.6], ['em', 0], ['em', 0.18], ['ti', 0], ['ti', 1], ['ze', 0], ['ze', 1], ['gl', 0], ['gl', 1], ['sp', 0], ['sp', 0.45], ['sp', 1], ['lo', 0], ['lo', 1]]
    .flatMap(([b, v]) => ['1', '2', '3'].map((s) => [s, 1, pull(b as string, v as number)] as const));
  let rooms = 0, laid = 0;
  for (const [seed, theme, spell] of [...growl, ...ends]) {
    const t = at(seed, theme, spell);
    if (!t.conversation) continue;
    laid++;
    if (t.preset !== at(seed, theme).preset) rooms++;
    const ev = (programOf(t).events as unknown as Ev[]).filter((e) => PARTS.has(e.part ?? ''));
    const hot = ev.filter((e) => !(Number(e.p.gain) <= MOST));
    assert.deepEqual(hot.map((e) => `${e.part} ${e.voice} at ${e.t.toFixed(1)} s: gain ${Number(e.p.gain).toFixed(1)}`), [], `${spell} seed ${seed} theme ${theme} (${t.preset})`);
    // the hand a hint: struck at most as loud as the answer stands (by gain and velocity)
    const most = (part: string) => Math.max(0, ...ev.filter((e) => e.part === part).map((e) => Number(e.p.gain) * Number(e.p.vel)));
    const hand = most('conversation-punctuation'), answer = most('conversation-answer');
    if (hand && answer) assert.ok(hand < answer, `${spell} seed ${seed} theme ${theme} (${t.preset}): the hand ${hand.toFixed(2)} over the answer ${answer.toFixed(2)}`);
  }
  ctx.diagnostic(`${laid} themes laid, ${rooms} of them in another room than the tile's, no strike over gain ${MOST}`);
  assert.ok(rooms >= 3, `only ${rooms} pulls land in the other room`);
});

test('the conversation is one line of the place: taken out, BELLS plays the lanes it held off', () => {
  const style = withoutTechniques(APP, 'conversation');
  for (const seed of ['1', '3', '5']) {
    const t = quiet(() => planTheme(seed, 1, { strategy: 'house-v2', style, spell: parseSpell(BELLS)! }));
    assert.equal(t.conversation, undefined, `seed ${seed}: a conversation without its line`);
    const layers = new Set((programOf(t).events as unknown as Ev[]).map((e) => e.layer));
    assert.ok(layers.has('pad') && layers.has('bass'), `seed ${seed}: the pad and the sub not back (${[...layers].join(', ')})`);
  }
});

/**
 * PLAN-AMBIENT §2.4, the first 16 hex digits of each whole program (`themeHash`, `tools/link-digest.ts`) as `local`
 * 61188d14 planned it: the slow spells the plan protects that no link-digest row holds. 27191's five themes are the
 * digest's own rows (`benchmark`) and are checked there.
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
};

test('the protected slow spells (seed 6\'s golden, the Ambient tile) lay no conversation and play the programs they played', () => {
  for (const [link, hash] of Object.entries(PROTECTED)) {
    const { plan } = quiet(() => played(link));
    assert.equal(plan.conversation, undefined, `${link}: a conversation`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `${link}: its program moved`);
  }
});

/**
 * **The tile plays the row's numbers exactly** (bells-birds): the 24 own themes at BELLS (seed/theme), the first 16 hex
 * digits of each whole program: as `local` 79a9443b planned it, before any bird had a job in the bells beyond the first
 * round's, but for the bowl's level by register (zones-pilot-2: its strikes over B2, `ground.dbFrom` 47, softer by 4 dB an
 * octave up to F#3, `dbTo` 54, so a key that puts the bowl at the top of its register no longer stands two LU over the place; every own
 * theme strikes one there), and the place's trim re-set in zones-pilot-3 (0.693 -> 0.105 dB, the programs otherwise
 * unmoved). Every lean is about the tile, so at the tile every one of them is nought (or one) and nothing moves.
 */
const TILE: Record<string, string> = {
  '1&v=2/1': '9683b597a7dc7378',
  '1&v=2/2': '11df61158b58b2e2',
  '2&v=2/1': 'f104b8cae402eedc',
  '2&v=2/3': '67b08b043aeeca7e',
  '3&v=2/1': '1825a40f3f4c7fe7',
  '3&v=2/2': '723af669d4f24e7a',
  '4&v=2/2': '480007ef46ef53df',
  '4&v=2/3': 'e3b4297e702fa240',
  '5&v=2/1': '881a3f56dc04c9c1',
  '5&v=2/2': 'ad89a8f5052d25c1',
  '6&v=2/2': '52a6f609ab2f9ee1',
  '6&v=2/3': 'ef6c21d22278a7a8',
  '7&v=2/1': '5b18f39a3b7fc1fc',
  '7&v=2/3': '46f373560b0c137b',
  '8&v=2/2': '9c4646f20f0f39e5',
  '8&v=2/3': '590861414b069557',
  '9&v=2/1': 'f1ad1bcf595a69f3',
  '9&v=2/3': 'b3292cac3e401c58',
  '10&v=2/1': '1925035ab75799b8',
  '10&v=2/3': '4ad50b47105146cc',
  '11&v=2/2': 'aa5a8e57b8fab246',
  '11&v=2/3': 'f9537b74c0d2ef0f',
  '12&v=2/2': 'b2902d07b23927e2',
  '12&v=2/3': 'ddb7d983065d9d1f',
};
/**
 * **The tile's twelve library turns, now the conversation** (PLAN-ZONES §4-§5: the zone's library list is empty, so a
 * turn inside it is not taken): each was a synth-pad row on `local` a0651532 (the slow chords nine times, the pedal
 * swell three), and is the zone's own theme since the zones pilot, its program's first 16 hex digits as zones-pilot-2
 * plans it (the bowl's level by register), re-pinned in zones-pilot-3 for the place's trim alone (0.693 -> 0.105 dB).
 */
const TURNED: Record<string, string> = {
  '1&v=2/3': '46ae2fd74f9ae318',
  '2&v=2/2': '0c8ca494aa41652a',
  '3&v=2/3': 'f58af49ec734f3e7',
  '4&v=2/1': '6ec6d7e3071c99ab',
  '5&v=2/3': '81f2fab0ceac6843',
  '6&v=2/1': '6cf2e8fa9af13b4b',
  '7&v=2/2': '5112e91ef9afce26',
  '8&v=2/1': '0ce5d1084fbd6d76',
  '9&v=2/2': '794fd47208cba44b',
  '10&v=2/2': '12f9024ceed6b520',
  '11&v=2/1': '09681453e9f8fd7d',
  '12&v=2/1': 'df6baff0cb1bab07',
};

test('at the tile every lean is nought, the 24 own themes play the programs they played, and the 12 turns the conversation', () => {
  const L = leansOf(BELLS);
  assert.equal(L.size, 0); assert.equal(L.pulse, 0); assert.equal(L.lateMul, 1); assert.equal(L.unit, 1); assert.equal(L.count, 0);
  assert.equal(L.width, 1); assert.equal(L.tail, 1); assert.equal(L.hard, 1); assert.equal(L.leave, 0); assert.equal(L.lively, 0);
  assert.equal(L.memory, ROW.answerer.memory); assert.equal(L.recall, ROW.answerer.recall); assert.equal(L.silence, ROW.breakdown.silence.chance); assert.equal(L.handover, 0);
  assert.equal(L.reach, 0); assert.equal(L.ringsMost, ROW.ground.ringsMost);
  assert.equal(L.restF, 1); assert.equal(L.groundF, 1); assert.equal(L.still, 0); assert.equal(L.handF, 1); assert.equal(L.touchDb, 0); assert.equal(L.apartS, ROW.ground.apartS); assert.equal(L.groundDb, 0);
  for (const n of [1, 2, 3]) assert.equal(L.notesF(n), 1);
  assert.deepEqual(L.registers, { caller: ROW.caller.register, answerer: ROW.answerer.register, ground: ROW.ground.register });
  for (const [st, hash] of Object.entries(TILE)) {
    const [seed, theme] = st.split('/');
    const plan = at(seed, Number(theme));
    assert.ok(plan.conversation, `seed ${seed} theme ${theme}: no conversation at the tile`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `seed ${seed} theme ${theme}: the tile's program moved`);
  }
  for (const [st, hash] of Object.entries(TURNED)) {
    const [seed, theme] = st.split('/');
    const plan = at(seed, Number(theme));
    assert.ok(plan.conversation && !plan.drawn, `seed ${seed} theme ${theme}: a turn inside the zone, not the conversation`);
    assert.equal(themeHash(plan).slice(0, 16), hash, `seed ${seed} theme ${theme}: the turned theme's program moved`);
  }
});

test('Root hands the call and the answer to its pole\'s voices once, and never back, as it is dragged', () => {
  // seeds 1-12 theme 1, Root from the tile down to nought and up to 1 (the whole travel inside the zone; and the tile's own 0.10 to 0.05 by 0.01):
  // each role's voice is the tile's until it is the pole's, and stays the pole's
  const pull = (v: number) => BELLS.replace(/ro:[0-9.]+/, `ro:${v.toFixed(2)}`);
  const POLE = { small: ROW.size!.small.voice!, large: ROW.size!.large.voice! };
  for (const seed of SEEDS) {
    const tile = at(seed, 1);
    if (!tile.conversation) continue;
    for (const [side, steps] of [['small', [0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0]], ['large', [0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.89, 0.95, 1]]] as const) {
      let was = { caller: tile.conversation.voices.caller, answerer: tile.conversation.voices.answerer };
      for (const v of steps) {
        const t = at(seed, 1, pull(v));
        if (!t.conversation) continue;
        for (const role of ['caller', 'answerer'] as const) {
          const now = t.conversation.voices[role];
          if (now !== was[role]) assert.ok(now === POLE[side][role] && was[role] !== POLE[side][role], `seed ${seed}, Root ${v}: the ${role} ${was[role]} -> ${now}`);
          was = { ...was, [role]: now };
        }
      }
    }
  }
});

test('each bird\'s lean moves its knob the way its name says, at both ends', () => {
  const pull = (bird: string, v: number) => BELLS.replace(new RegExp(`${bird}:[0-9.]+`), `${bird}:${v.toFixed(2)}`);
  const lo = (b: string, v = 0) => leansOf(pull(b, v)), hi = (b: string, v = 1) => leansOf(pull(b, v)), mid = leansOf(BELLS);
  // Root, the bells' size: small at nought, great at one; the call and the ground higher small, lower great; rests shorter small, longer great
  assert.equal(lo('ro').size, -1); assert.equal(hi('ro').size, 1);
  assert.ok(lo('ro').registers.caller[0] > mid.registers.caller[0] && hi('ro').registers.caller[0] < mid.registers.caller[0], 'Root: the call\'s register');
  assert.ok(lo('ro').registers.ground[0] > mid.registers.ground[0] && hi('ro').registers.ground[0] < mid.registers.ground[0], 'Root: the ground\'s register');
  assert.ok(lo('ro').restF < 1 && hi('ro').restF > 1, 'Root: small bells talk quicker, great ones rarer');
  // Veil, the count: rests and the ground's gaps longer at nought, shorter at one; the change of hands only over the tile
  assert.ok(lo('ve').restF > 1 && hi('ve').restF < 1 && lo('ve').groundF > 1 && hi('ve').groundF < 1, 'Veil: the count');
  assert.ok(lo('ve').handover === 0 && hi('ve').handover > 0.5, 'Veil: the change of hands');
  assert.ok(Math.abs(leansOf(pull('ve', 0.6)).count - hi('ve').count) < 1e-9, 'Veil: the count at its busiest by 0.6, its band\'s edge');
  // Loom joins the count over its whole travel: a loop close (short rests, a closer ground), a long form breathing
  assert.ok(lo('lo').restF < 1 && lo('lo').groundF < 1 && hi('lo').restF > 1 && hi('lo').groundF > 1, 'Loom: the count');
  // ...and their corner a slow conversation, never a chatter: the rests' factor held at the count's floor
  const corner = leansOf(pull('ve', 0.6).replace(/lo:[0-9.]+/, 'lo:0.00').replace(/ro:[0-9.]+/, 'ro:0.00'));
  assert.ok(corner.restF >= ROW.count!.floor! - 1e-9 && corner.groundF >= ROW.count!.groundFloor! - 1e-9, 'Veil x Loom: under the floor');
  // Ember, the pulse: freer at nought; the grid's beat and the heartbeat at its top (0.18, before the kit)
  assert.ok(lo('em').lateMul > 1, 'Ember: freer at nought');
  assert.ok(hi('em', 0.18).pulse >= 0.99 && hi('em', 0.18).unit === 4 && hi('em', 0.18).lateMul < 0.02, 'Ember: on the beat at 0.18');
  // Tide, the space: narrower and a shorter hall at nought, wider and longer at one
  assert.ok(lo('ti').width < 1 && hi('ti').width > 1 && lo('ti').tail < 1 && hi('ti').tail > 1, 'Tide: the space');
  // Zephyr, the timbre: a softer strike at nought, a harder one at one
  assert.ok(lo('ze').hard < 1 && hi('ze').hard > 1, 'Zephyr: the strike');
  // Gleam, the light: the ground on the tonic at nought, leaving it at one
  assert.equal(lo('gl').leave, -1); assert.equal(hi('gl').leave, 1);
  // Spark, the movement: fewer three-note calls and slower answers at its band's edge (0.45), more and livelier at one
  assert.ok(lo('sp', 0.45).notesF(3) < 1 && hi('sp').notesF(3) > 1 && lo('sp', 0.45).lively < 0 && hi('sp').lively > 0, 'Spark: the movement');
  // ...and its still end (the held side's way), reached at the band's edge since the zone: no hand, fewer calls, the ground closer and carrying more
  assert.ok(lo('sp', 0.45).still === 1 && lo('sp', 0.45).handF === 0 && lo('sp', 0.45).restF > 1 && lo('sp', 0.45).groundF < 1 && lo('sp', 0.45).groundDb > 0 && hi('sp').still === 0, 'Spark: the still end');
  // a range on the ring, not a point (the review of 10-18): whole from the edge to 0.50, half-way down to the tile by 0.525, gone at it
  for (const v of [0.45, 0.46, 0.48, 0.5]) assert.ok(lo('sp', v).still === 1 && lo('sp', v).handF === 0, `Spark: the still end whole at ${v}`);
  assert.ok(Math.abs(lo('sp', 0.53).still - 0.4) < 1e-9 && lo('sp', 0.53).handF > 0, 'Spark: the still end leaving by 0.53');
  // Loom, the form: a loop at nought (no memory, no return, rare silences), the form at one
  assert.ok(lo('lo').memory === 0 && !lo('lo').recall && lo('lo').silence < mid.silence && hi('lo').silence > mid.silence, 'Loom: the form');
  // and as played, on the axes he asked first (seeds 1-3, theme 1, the own themes)
  const own = (spell: string) => ['1', '2', '3'].map((s) => at(s, 1, spell)).filter((t) => t.conversation);
  const callers = (spell: string) => own(spell).map((t) => t.conversation!.voices.caller);
  assert.ok(callers(pull('ro', 0)).includes('bellSmall'), 'Root at nought: no small bells call');
  assert.ok(callers(pull('ro', 0.89)).filter((v) => v === 'bellGreat').length >= 2, 'Root at 0.89: the great bell calling in fewer than two of three');
  assert.ok(callers(pull('ro', 1)).every((v) => v === 'bellGreat') && callers(pull('ro', 1)).length === 3, 'Root at 1: the great bell not calling in every theme');
  // his ask: "mid way for low and high bells and full root only for deep heavy bells" (the pole's curve)
  assert.ok(lo('ro', 0.5).size > 0.4 && leansOf(pull('ro', 0.5)).reach < 0.25, 'Root 0.5: the great pole reached too soon');
  const perMin = (spell: string) => own(spell).reduce((a, t) => a + t.conversation!.exchanges / (t.duration / 60), 0);
  assert.ok(perMin(pull('ro', 0)) > perMin(BELLS) && perMin(BELLS) > perMin(pull('ro', 0.89)), 'Root: the talk quicker small, rarer great');
  assert.ok(perMin(pull('ve', 0.6)) > perMin(BELLS) && perMin(BELLS) > perMin(pull('ve', 0)), 'Veil: the count as played');
  assert.ok(own(pull('em', 0.18)).every((t) => t.conversation!.pulse > 0) && own(BELLS).every((t) => !t.conversation!.pulse), 'Ember: the heartbeat at 0.18 and none at the tile');
  assert.ok(['1', '2', '3'].every((s) => !at(s, 1, pull('em', 0.19)).conversation), 'Ember: a conversation over the kit, outside the zone');
  for (const p of [['ro', 0], ['ro', 0.89], ['ro', 1], ['ve', 0], ['ve', 0.6], ['em', 0.18], ['ti', 0], ['ti', 1], ['gl', 0], ['gl', 1], ['sp', 0.45], ['sp', 1], ['lo', 0]] as const)
    for (const t of own(pull(p[0], p[1]))) assert.deepEqual(conversationFaults(t, pull(p[0], p[1])), [], `${p[0]}:${p[1]}`);
  // Tide's hall, as the room plays it
  const hall = (spell: string) => (programOf(at('1', 1, spell)) as any).settings.sends.reverbSeconds as number;
  assert.ok(hall(pull('ti', 0)) < hall(BELLS) && hall(BELLS) < hall(pull('ti', 1)), 'Tide: the hall as played');
});

/** What only BELLS reads: the conversation's own voices (a place's alone, `BY_PLACE`) and its parts. */
const BELLS_ONLY = new Set([...ROW.ground.voices, ...ROW.caller.voices, ...ROW.answerer.voices, ...ROW.punctuation.voices].map((x) => x.v).filter((v) => !['fmBell', 'vibes', 'marimba', 'malletSoft'].includes(v)));

test('outside the zone nothing of BELLS is read: no row of its place, none of its own voices, none of its leans', (ctx) => {
  // the new voices are named by the conversation's row alone, and a place's alone (no widened list opens them)
  for (const v of BELLS_ONLY) assert.ok(BY_PLACE.some((x) => x.id === v), `${v} is not a place's alone`);
  const named = fs.readdirSync(new URL('../recipes/', import.meta.url), { recursive: true }).filter((f) => String(f).endsWith('.json'))
    .filter((f) => !String(f).endsWith('conversation.json') && /bellGreat|bellSmall/.test(fs.readFileSync(new URL(`../recipes/${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(named, [], 'a row besides the conversation names a new bell');
  // the probes: the link digest's 129 rows, the protected spells, and every other place's own birds with each bird
  // dragged to nought and to one; outside the zone's box (PLAN-ZONES §5: the reach check moved to the box), nothing of BELLS plays
  const atBells = (spell: ReturnType<typeof parseSpell>) => inZone(ZONE, { ...HOUSE, ...spell! });
  const digest = JSON.parse(fs.readFileSync(new URL('./link-digest.json', import.meta.url), 'utf8')).rows.map((r: { link: string }) => r.link) as string[];
  const spellStr = (o: Record<string, number>) => BIRDS.map((b) => `${b.slice(0, 2)}:${o[b].toFixed(2)}`).join(',');
  const others = (PLACES.conversation as any[]).filter((e) => !e.conversation).map((e) => Object.fromEntries(BIRDS.map((b) => [b, e.place.birds[b] ?? HOUSE[b]])));
  const probes = [...digest, ...Object.keys(PROTECTED), `seed=1&v=2&spell=${spellStr(HOUSE as any)}`,
    ...[HOUSE, ...others].flatMap((o: any) => BIRDS.flatMap((b) => [0, 1].map((v) => `seed=1&v=2&spell=${spellStr({ ...o, [b]: v })}`)))];
  let nought = 0, reach = 0;
  for (const link of probes) {
    const read = new URLSearchParams(link);
    const { plan } = quiet(() => played(link));
    if (!plan.events) continue;
    const spell = parseSpell(read.get('spell') ?? spellStr(HOUSE as any));
    if (atBells(spell)) { reach++; continue; }
    nought++;
    assert.equal(plan.conversation, undefined, `${link}: a conversation`);
    const ev = programOf(plan).events as unknown as Ev[];
    // the hand's frame drum and soft woodblock are PSY's journey pulse too (PLAN-AMBIENT Phase 6): played as that part,
    // where the journey is PSY's, they are its own and not BELLS's
    assert.ok(!ev.some((e) => PARTS.has(e.part ?? '') || (BELLS_ONLY.has(e.voice) && !(e.part === 'journey-pulse' && plan.journey))), `${link}: BELLS's own voices or parts`);
  }
  ctx.diagnostic(`${probes.length} probes: ${nought} outside the zone, nothing of BELLS read; ${reach} inside it`);
  assert.ok(nought >= 300, `only ${nought} probes outside the zone (${reach} inside it)`);
});
