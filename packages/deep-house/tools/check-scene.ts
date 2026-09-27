// One foreground: the composition rule Eugene stated on 09-22, over the
// texture round's air-or-sustain. A sustained theme draws a scene — its drone
// in front or behind — and "for tracks where drone pads are in the foreground
// we don't want to deal with percussion and other glass-like sounds, staccato
// keys; but drones in muted background places go along not so bad". The
// texture is read in composition.ts (`textureOf`), the scene and the
// real-world class beside it (`realWorld`, a pace and never a name) in the
// same file, and the lanes and timbre dice follow in generator.ts. Since
// 09-23 a held bass under the full body is always the drone in front (no coin,
// no bird), and behind the drone the sixteenth lane's mid-band voices take the
// lane's scene presence (`Lane.presence`).
import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme } from '../src/mix.ts';
import { composeParts, realWorld, textureOf, textureOfDice, sceneOfDice, medianGapSteps, type Pace, type SceneContext } from '../src/composition.ts';
import type { CompositionPolicy } from '../src/composition-policy.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { style as v1 } from '../src/styles/deep-house.ts';
import { HOUSE, biasFor, musicalControls, type Spell } from '../src/spell.ts';
import { recipeById, PART_LIBRARY } from '../src/recipes.ts';
import { withdrawnFrom } from '../src/lanes.ts';
import { themeSeed } from '../src/set-plan.ts';
import { maskSteps } from '../src/patterns.ts';
import { BY_NAME, FAMILIES, TIMBRES } from '@deep-house/engine/voices';
import { BENCHMARK_SEED, BENCHMARK_SPELL, BENCHMARK_THEMES, blessedLine, themeHash } from './link-digest.ts';
import { linkWrite } from '../src/link.ts';

const opts = { strategy: 'house-v2', spell: HOUSE } as const;
const policy = (style as typeof style & { composition: CompositionPolicy }).composition;
const scene = policy.scene!;
const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
type Plan = ReturnType<typeof planTheme>;
type Event = Plan['events'][number];
const handsOf = (t: Plan) => t.events.filter(e => String(e.part ?? '').startsWith('house/hand'));
// The same style with the scene taken out: the palette as it draws, which is
// what an airy theme plays and what a drone-back theme plays with its pad
// behind and its mid-band sixteenths under.
const noRule = {
  ...style,
  lanes: style.lanes.map(({ withdraw: _, presence: __, ...l }) => l),
  composition: { ...policy, scene: undefined },
};
const plans = SEEDS.map(seed => ({ seed, t: planTheme(seed, 0, opts), was: planTheme(seed, 0, { style: noRule as typeof style, spell: HOUSE }) }));
const at = (seed: number) => plans[seed - 1].t;
/** The held sets the style puts in front whatever the coin (`ScenePolicy.always`). */
const endless = (t: Plan) => {
  const held: string[] = JSON.parse(String(t.dice.composition)).texture?.held ?? [];
  return (scene.always ?? []).some(set => set.every(w => held.includes(w)));
};
/** The sixteenth lane, its scene presence, and whether a voice on it is reached. */
const sixteenth = style.lanes.find(l => l.id === 'sixteenth')!;
const presenceDb = (voice: string, s: string | undefined) => {
  const e = sixteenth.voices!.find(c => c.v === voice);
  return (sixteenth.presence ?? []).filter(p => p.scene === s && (e?.mid ?? 0) >= p.midFrom).reduce((a, p) => a + p.db, 0);
};

/** The grid and the low end: what a drone stands on, not beside. */
const GRID = new Set(['kick', 'hats', 'clap', 'bass', 'fx']);
/**
 * Every stream of a plan that is not the grid, as the pace it plays at: its
 * onsets' median gap and its notes' median length, off the events themselves.
 * A voice with no facts of its own in a percussion family is a hit.
 */
function streamsOf(t: Plan): Array<{ key: string; pace: Pace }> {
  const groups = new Map<string, Event[]>();
  for (const e of t.events) {
    if (GRID.has(String(e.layer))) continue;
    const timbre = String(e.p.preset ?? e.p.timbre ?? e.voice);
    const key = `${e.layer}/${timbre}/${e.role ?? ''}/${e.part ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  return [...groups].map(([key, es]) => {
    const timbre = key.split('/')[1], facts = TIMBRES[timbre];
    const hit = !facts && ['drum', 'noise'].includes(BY_NAME[es[0].voice].family);
    const onsets = [...new Set(es.map(e => e.t))].sort((a, b) => a - b);
    const gaps = onsets.slice(1).map((x, i) => x - onsets[i]).sort((a, b) => a - b);
    const durs = es.map(e => Number(e.p.dur ?? 0)).sort((a, b) => a - b);
    return { key, pace: { struck: facts ? facts.struck : hit, pitched: facts?.family === 'harmonic', hold: facts?.hold ?? (hit ? 0 : 1),
      gap: gaps.length ? gaps[gaps.length >> 1] : Infinity, ring: durs[durs.length >> 1] } };
  });
}
const contextOf = (t: Plan, spell: Spell = HOUSE): SceneContext =>
  ({ policy: scene, bpm: t.bpm, drumsOn: biasFor(spell, style).derived.drumsOn });

test('the texture counts what holds, and two held things make it sustained', () => {
  const t = policy.texture!;
  const pedal = { contour: t.droneContours[0] } as never;
  const quiet = { bedHold: t.bedHold - .01, leadHolds: false };
  assert.equal(textureOf({}, undefined, t).is, 'air');
  assert.deepEqual(textureOf({ bassMotif: pedal }, quiet, t), { is: 'air', held: ['drone'] });
  assert.deepEqual(textureOf({ bassMotif: pedal, tone: { bassline: 'full' } }, quiet, t), { is: 'sustained', held: ['drone', 'body'] });
  assert.deepEqual(textureOf({ heldBass: true }, { bedHold: t.bedHold, leadHolds: false }, t), { is: 'sustained', held: ['drone', 'bed'] });
  assert.deepEqual(textureOf({ struckFigures: [{ duration: { beats: [t.heldBeats, t.heldBeats] } } as never] }, { bedHold: 0, leadHolds: true }, t),
    { is: 'sustained', held: ['lead', 'chords'] });
  assert.equal(textureOf({ struckFigures: [{ duration: { beats: [t.heldBeats / 2, t.heldBeats / 2] } } as never], tone: { bassline: 'full' } }, quiet, t).is, 'air');
});

test('the real-world class is a pace: a hit with no pitch always, a tone only when it comes round fast and does not ring', () => {
  const on: SceneContext = { policy: scene, bpm: 100, drumsOn: true }, off = { ...on, drumsOn: false };
  const r = scene.realWorld;
  const tone = (gap: number, ring = 0, hold = .1): Pace => ({ struck: true, pitched: true, hold, gap, ring });
  // Eugene's two sides: the ep and glass stabs of seeds 50 and 20 (a hit
  // every .6-.9 s) against a marimba every 1.8 s at 50 bpm and a bell every
  // eight bars, "Buddhist-bowl-like tones".
  assert.ok(realWorld(tone(.7), on) && realWorld(tone(.9, .15, .37), on));
  assert.ok(!realWorld(tone(1.8), on) && !realWorld(tone(8 * 2.4, .2, .07), on));
  assert.ok(!realWorld(tone(r.sparseSeconds), on) && realWorld(tone(r.sparseSeconds - .01), on));
  // a ringing chord bridges its gap; a staccato one does not
  assert.ok(!realWorld(tone(1.2, 1.2), on) && realWorld(tone(1.2, .3), on));
  // a drum is a drum at any pace; a held instrument is never a hit
  assert.ok(realWorld({ struck: true, pitched: false, hold: .02, gap: 2.4, ring: 0 }, on));
  assert.ok(!realWorld({ struck: false, pitched: true, hold: .9, gap: .1, ring: 0 }, on));
  assert.ok(!realWorld({ struck: true, pitched: true, hold: r.holdBelow, gap: .1, ring: 0 }, on));
  // with no grid nothing struck is withdrawn at all
  assert.ok(!realWorld(tone(.1), off) && !realWorld({ struck: true, pitched: false, gap: .1, ring: 0 }, off));
  assert.equal(medianGapSteps([0, 4, 8, 12], 16), 4);
  assert.equal(medianGapSteps([11], 16), 16);
});

test('a lane puts descriptor families to the question, never names, and only the sixteenth lane does', () => {
  for (const lane of style.lanes) for (const w of lane.withdraw ?? []) {
    assert.ok(w.families.every(f => (FAMILIES as readonly string[]).includes(f)), `${lane.id}: ${w.families} is not a descriptor family`);
    assert.equal(w.scene, 'drone-forward');
  }
  assert.deepEqual(style.lanes.filter(l => l.withdraw?.length).map(l => l.id), ['sixteenth']);
  const sixteenth = style.lanes.find(l => l.id === 'sixteenth')!;
  const live = sixteenth.voices!.filter(e => e.w > 0).map(e => String(e.v));
  assert.ok(live.every(v => withdrawnFrom(sixteenth, 'drone-forward').has(BY_NAME[v].family)), 'every live sixteenth is put to the question');
  assert.equal(withdrawnFrom(sixteenth, 'drone-back').size, 0);
  assert.equal(withdrawnFrom(sixteenth, undefined).size, 0);
});

test('over seeds 1-200 every theme has a scene, air exactly where the texture is air, and where there is a coin the drone is in front about half the time', () => {
  const count: Record<string, number> = {}, coin: Record<string, number> = {};
  for (const { seed, t } of plans) {
    const texture = textureOfDice(t.dice), s = sceneOfDice(t.dice);
    assert.ok(texture && s, `seed ${seed}: an ordinary house-v2 theme reads its texture and scene`);
    assert.equal(s === 'air', texture === 'air', `seed ${seed}: ${texture} ${s}`);
    assert.equal(t.dice.scene, s);
    count[s!] = (count[s!] ?? 0) + 1;
    if (s !== 'air' && !endless(t)) coin[s!] = (coin[s!] ?? 0) + 1;
  }
  // Measured 09-23: 97 air, 63 drone-forward, 40 drone-back; of the 77 with a
  // coin, 37 in front (the 26 holding drone and body are all in front).
  const sustained = count['drone-forward'] + count['drone-back'], drawn = coin['drone-forward'] + coin['drone-back'];
  assert.ok(sustained > 60 && sustained < 140, JSON.stringify(count));
  assert.ok(coin['drone-forward'] > drawn * .35 && coin['drone-forward'] < drawn * .65, JSON.stringify(coin));
});

test('drone + body is the drone in front on every seed, at the house and at both pulls, with no coin and no bird', () => {
  assert.deepEqual(scene.always, [['drone', 'body']]);
  // The two pulls away from the drone keep Loom just inside its `phrases` band
  // since round S9: under short loops (Loom under 0.515) the bass draws no
  // pedal, so no theme there holds drone and body and the rule has nothing
  // to decide (it was Loom 0.45 and 0).
  const spells: Spell[] = [HOUSE, { ...HOUSE, tide: .75, veil: .3, loom: .72 }, { ...HOUSE, tide: .4, veil: .62, loom: .52 },
    { ...HOUSE, tide: 0, veil: 1, loom: .52 }];
  for (const spell of spells) {
    let n = 0;
    for (const seed of SEEDS) {
      const t = spell === HOUSE ? at(seed) : planTheme(seed, 0, { strategy: 'house-v2', spell });
      if (!endless(t)) continue;
      n++;
      assert.equal(sceneOfDice(t.dice), 'drone-forward', `seed ${seed} at drone ${musicalControls(spell, style)!.drone}: drone + body behind`);
    }
    assert.ok(n > 10, `${n} drone + body themes at ${JSON.stringify(spell)}`);
  }
  // The number is still drawn: the coin's own stream is where it was, so the
  // themes it decides draw exactly what they drew before the rule.
  const coinOnly = { ...style, composition: { ...policy, scene: { ...scene, always: [] } } };
  for (const { seed, t } of plans.slice(0, 120)) {
    if (endless(t)) continue;
    assert.deepEqual(t.events, planTheme(seed, 0, { style: coinOnly as typeof style, spell: HOUSE }).events, `seed ${seed}: a coin theme moved`);
  }
});

test('the coin is still reachable for every other held set, both ways, at the house and at both pulls', () => {
  for (const spell of [HOUSE, { ...HOUSE, tide: .75, veil: .3, loom: .72 }, { ...HOUSE, tide: .4, veil: .62, loom: .45 }] as Spell[]) {
    const seen: Record<string, Set<string>> = {};
    for (const seed of SEEDS) {
      const t = spell === HOUSE ? at(seed) : planTheme(seed, 0, { strategy: 'house-v2', spell });
      const s = sceneOfDice(t.dice);
      if (s === 'air' || endless(t)) continue;
      (seen[s!] ??= new Set()).add(JSON.parse(String(t.dice.composition)).texture.held.join('+'));
    }
    assert.ok(seen['drone-forward']?.size && seen['drone-back']?.size, `both scenes at ${JSON.stringify(spell)}: ${JSON.stringify(Object.keys(seen))}`);
  }
});

test('no drone-forward theme carries the real-world class on any stream or in its keys dice', () => {
  let forward = 0;
  for (const { seed, t } of plans) {
    if (sceneOfDice(t.dice) !== 'drone-forward') continue;
    forward++;
    const ctx = contextOf(t);
    for (const { key, pace } of streamsOf(t))
      assert.ok(!realWorld(pace, ctx), `seed ${seed} (${t.dice.texture}) plays ${key} beside a drone in front: ${JSON.stringify(pace)}`);
    assert.equal(handsOf(t).length, 0, `seed ${seed}: hands beside a drone in front`);
    assert.ok(!t.events.some(e => e.layer === 'shaker'), `seed ${seed}: sixteenths beside a drone in front`);
    // The keys lane's timbre at the stab mask's pace, as the dice drew it.
    const facts = TIMBRES[t.dice.keysPreset];
    const mask = String(t.dice.stabMask), step = 15 / t.bpm;
    assert.ok(!facts || !realWorld({ struck: facts.struck, pitched: true, hold: facts.hold,
      gap: medianGapSteps(maskSteps(mask), mask.length) * step, ring: 2 * step }, ctx), `seed ${seed}: keys ${t.dice.keysPreset}`);
  }
  assert.ok(forward > 30, `${forward} drone-forward themes`);
});

test('a drone in front of a grid keeps its pad at the style\'s level: the ringing keys never put it behind', () => {
  // R6 of the review of 09-24, Eugene's answer to question 3: both ringing-keys
  // variants ask for the sustained role at the background presence, and under
  // the drone in front that played the drone nine decibels back — 15 of 63
  // forward themes at the house on theme 0, seeds 73 and 175 (drone + body)
  // among them. The same style with that one ask taken off the variants is
  // what a forward theme over a grid must play, pad and all.
  const inFront = {
    ...style,
    composition: { ...policy, families: policy.families.map(f => f.id !== 'ringing-keys' ? f : {
      ...f, variants: f.variants.map(v => ({ ...v, request: { ...v.request,
        presence: Object.fromEntries(Object.entries(v.request.presence ?? {}).filter(([k]) => k !== 'sustained')) } })) }) },
  };
  let ringing = 0;
  for (const { seed, t } of plans) {
    if (sceneOfDice(t.dice) !== 'drone-forward' || !JSON.parse(String(t.dice.composition)).selected['ringing-keys']) continue;
    ringing++;
    const want = planTheme(seed, 0, { style: inFront as typeof style, spell: HOUSE });
    const pad = t.events.filter(e => e.layer === 'pad'), was = want.events.filter(e => e.layer === 'pad');
    assert.ok(pad.length, `seed ${seed}: a forward theme with no pad`);
    assert.deepEqual(pad.map(e => e.p.gain), was.map(e => e.p.gain), `seed ${seed}: the drone in front plays behind the ringing keys`);
  }
  assert.ok(ringing >= 10, `${ringing} forward themes with the ringing keys`);
  for (const seed of [73, 175]) assert.ok(endless(at(seed)) && JSON.parse(String(at(seed).dice.composition)).selected['ringing-keys'], `seed ${seed}`);
});

test('a drone-back theme is the airy draw with its pad at the background presence and its mid-band sixteenths under', () => {
  const back = -9; // characters.presence.backgroundDb
  let themes = 0, under = 0;
  for (const { seed, t, was } of plans) {
    if (sceneOfDice(t.dice) !== 'drone-back') continue;
    themes++;
    assert.equal(t.events.length, was.events.length, `seed ${seed}`);
    t.events.forEach((e, i) => {
      const before = was.events[i];
      const db = !e.part && sixteenth.voices!.some(c => c.v === e.voice) && e.layer === 'shaker' ? presenceDb(e.voice, 'drone-back') : 0;
      if (db) {
        under++;
        const { gain, ...rest } = e.p, { gain: g0, ...rest0 } = before.p;
        assert.deepEqual({ ...e, p: rest }, { ...before, p: rest0 });
        return assert.ok(Math.abs(20 * Math.log10((gain ?? 1) / (g0 ?? 1)) - db) < 1e-9, `seed ${seed}: ${e.voice} ${gain} from ${g0}`);
      }
      if (e.layer !== 'pad') return assert.deepEqual(e, before, `seed ${seed}: only the pad and a mid-band sixteenth move behind the drone`);
      const { gain, ...rest } = e.p, { gain: g0, ...rest0 } = before.p;
      assert.deepEqual({ ...e, p: rest }, { ...before, p: rest0 });
      // at most nine decibels under the style's level, never above what it was
      assert.ok((gain ?? 1) <= (g0 ?? 1) + 1e-12 && (gain ?? 1) >= (g0 ?? 1) * 10 ** (back / 20) - 1e-12, `seed ${seed}: pad gain ${gain} from ${g0}`);
    });
    assert.ok(t.events.some((e, i) => e.layer === 'pad' && e.p.gain !== was.events[i].p.gain)
      || !t.events.some(e => e.layer === 'pad') || JSON.parse(String(t.dice.composition)).selected['ringing-keys'],
      `seed ${seed}: the pad is behind the drone`);
  }
  assert.ok(themes > 30 && under > 0, `${themes} drone-back themes, ${under} sixteenths under`);
});

test('the sixteenth lane\'s presence is by measured band, only behind the drone, and reaches the mid-band voices alone', () => {
  // The lane-trim reading's per cent in 400 Hz-2 kHz, on the entries.
  const reached = sixteenth.voices!.filter(e => presenceDb(String(e.v), 'drone-back')).map(e => String(e.v)).sort();
  assert.deepEqual(reached, ['bongo', 'cowbell', 'woodblock']);
  for (const e of sixteenth.voices!) {
    assert.ok(Number.isFinite(e.mid), `${e.v} carries its measured mid share`);
    assert.equal(presenceDb(String(e.v), 'air'), 0);
    assert.equal(presenceDb(String(e.v), 'drone-forward'), 0);
  }
  assert.ok(style.lanes.every(l => l === sixteenth || !l.presence));
  assert.ok(v1.lanes.every(l => !l.presence));
});

test("seed 33's woodblock sits at Eugene's 20 %: what he heard, 14 dB down, which renders 10.6 LU under the hats layer", () => {
  // 20 % on the machine view's fader is -13.98 dB. Rendered 09-23, first main
  // bars 24-32, each layer alone: the woodblock -28.38 -> -41.19 LUFS against
  // the hats layer's -30.62 (+2.24 -> -10.57 LU); tools/imprint/kitchen-presence.ts
  // holds it and 79's and 142's bongo at least 6 LU under.
  const t = at(33), heard = plans[32].was;
  assert.equal(sceneOfDice(t.dice), 'drone-back');
  const wood = t.events.filter(e => e.voice === 'woodblock'), was = heard.events.filter(e => e.voice === 'woodblock');
  // (44 woodblocks in its 80 bars before round S19, 36 in its 68 since)
  assert.ok(wood.length > 30 && wood.length === was.length);
  wood.forEach((e, i) => {
    const db = 20 * Math.log10((e.p.gain ?? 1) / (was[i].p.gain ?? 1));
    assert.ok(Math.abs(db - 20 * Math.log10(.2)) < .05, `woodblock ${db.toFixed(2)} dB, not his 20 %`);
  });
  for (const seed of [79, 142]) assert.ok(at(seed).events.some(e => e.voice === 'bongo' && !e.part && (e.p.gain ?? 1) < .2), `seed ${seed}: the bongo under`);
});

test('an airy theme plays exactly what it played before the rule, percussion included', () => {
  let air = 0, hands = 0;
  for (const { seed, t, was } of plans) {
    if (sceneOfDice(t.dice) !== 'air') continue;
    air++;
    if (handsOf(t).length) hands++;
    assert.deepEqual(t.events, was.events, `seed ${seed} is air and its events moved`);
  }
  assert.ok(air > 60 && hands > air / 4, `${air} airy themes, ${hands} with hands`);
});

test('the birds lean the scene and never gate it', () => {
  // Toward the ambient side on the three birds the control reads (the drums
  // stay on), and the opposite pull.
  const ambient: Spell = { ...HOUSE, tide: .75, veil: .3, loom: .72 };
  const busy: Spell = { ...HOUSE, tide: .4, veil: .62, loom: .45 };
  const share = (spell: Spell) => {
    let f = 0, s = 0;
    for (const seed of SEEDS) {
      const x = sceneOfDice(planTheme(seed, 0, { strategy: 'house-v2', spell }).dice);
      if (x === 'drone-forward') f++;
      if (x !== 'air') s++;
    }
    return { f, s };
  };
  const house = plans.filter(p => sceneOfDice(p.t.dice) === 'drone-forward').length / plans.filter(p => sceneOfDice(p.t.dice) !== 'air').length;
  const up = share(ambient), down = share(busy);
  assert.ok(up.f / up.s > house + .15 && up.f < up.s, `ambient pull: ${up.f} of ${up.s} forward, house ${house}`);
  assert.ok(down.f / down.s < house - .15 && down.f > 0, `opposite pull: ${down.f} of ${down.s} forward, house ${house}`);
  // The control's own bounds keep both reachable at every spell.
  for (const spell of [HOUSE, ambient, busy, { ...HOUSE, tide: 1, veil: 0, loom: 1 }, { ...HOUSE, tide: 0, veil: 1, loom: 0 }]) {
    const p = musicalControls(spell as Spell, style)!.drone;
    assert.ok(p > 0 && p < 1, `drone ${p}`);
  }
  assert.equal(musicalControls(HOUSE, style)!.drone, .5);
});

test('every approved hand phrase is still reached by an ordinary theme', () => {
  const seen = new Set(plans.flatMap(({ t }) => (JSON.parse(String(t.dice.composition)).recipes ?? []).map((r: { id: string }) => r.id)));
  assert.deepEqual([...seen].sort(), PART_LIBRARY.map(r => r.id).sort());
});

test('the texture the scene read is the texture of the whole composition wherever nothing was withdrawn', () => {
  const sustainedLeads: readonly string[] = style.catalogue.sustainedLeads;
  for (const { seed, t } of plans.slice(0, 100)) {
    if (sceneOfDice(t.dice) === 'drone-forward') continue;
    const bed = { bedHold: TIMBRES[t.dice.padTimbre].hold, leadHolds: sustainedLeads.includes(t.dice.leadTimbre) };
    const c = composeParts(style, themeSeed(seed, 0), biasFor(HOUSE, style), t.density, t.bpm, undefined, bed)!;
    assert.deepEqual(textureOf(c.parts, bed, policy.texture!), c.trace.texture, `seed ${seed}`);
    assert.deepEqual(c.trace.texture, JSON.parse(String(t.dice.composition)).texture);
  }
});

test('a pinned part is explicit: on a sustained theme the drone goes behind it and its drums play', () => {
  // ?recipe=house/hand-conversation&accompaniment=auto — Eugene's link on 13,
  // and 50, whose ordinary theme draws the drone in front.
  const r = recipeById('house/hand-conversation')!;
  assert.equal(sceneOfDice(at(50).dice), 'drone-forward');
  for (const seed of [13, 20, 50]) {
    const t = planTheme(seed, 0, { ...opts, recipe: r, accompaniment: 'auto' });
    assert.equal(textureOfDice(t.dice), 'sustained', `seed ${seed}`);
    assert.equal(sceneOfDice(t.dice), 'drone-back', `seed ${seed}`);
    assert.ok(t.events.filter(e => e.part === r.id).some(e => BY_NAME[e.voice].family === 'drum'), `seed ${seed}: the pinned conversation keeps its membranes`);
    const pad = t.events.filter(e => e.layer === 'pad');
    assert.ok(pad.length && pad.every(e => (e.p.gain ?? 1) < .5), `seed ${seed}: the pad sits under the hands`);
  }
});

test('one scene per theme: the developments bring nothing withdrawn in and do not lift a pad behind the drone', () => {
  for (const development of ['shaped', 'percussion'] as const) {
    for (const seed of SEEDS.slice(0, 60)) {
      const t = planTheme(seed, 0, { ...opts, development });
      const s = sceneOfDice(t.dice);
      assert.equal(s, sceneOfDice(at(seed).dice), `seed ${seed} ${development}: the scene is the theme's`);
      if (s === 'drone-forward') {
        const ctx = contextOf(t);
        for (const { key, pace } of streamsOf(t)) assert.ok(!realWorld(pace, ctx), `seed ${seed} ${development}: ${key}`);
        assert.equal(t.dice.rhythmDevelopment, undefined, `seed ${seed}: the percussion palette under a drone in front`);
      }
      if (s === 'drone-back') {
        const was = planTheme(seed, 0, { style: noRule as typeof style, spell: HOUSE, development });
        const pad = t.events.filter(e => e.layer === 'pad'), before = was.events.filter(e => e.layer === 'pad');
        pad.forEach((e, i) => assert.ok((e.p.gain ?? 1) <= (before[i].p.gain ?? 1) + 1e-12, `seed ${seed} ${development}: the pad came forward`));
      }
    }
  }
});

test("Eugene's ambient fixture: seed 27191 at his spell plays exactly what it did, bells, marimba and vibes kept", () => {
  // "godlike, mega ambience": ~50 bpm, no drums. Themes 0-2 sustained, 3-4
  // air (lead). With no grid the drone is in front and nothing is withdrawn.
  //
  // **"Exactly what it did" is held to a committed hash** (the reconciled review
  // of 09-24, R70). This test used to compare the code with itself
  // minus the scene rule, so a catalogue, derive, knob, voice or settings change
  // moved both sides and passed. Each theme's whole program is now held to the
  // link digest's benchmark row for the link that plays it
  // (`tools/link-digest.json`), which only a stated re-bless moves.
  const spell = { ...HOUSE, ember: .14, gleam: 0, veil: .34, spark: 0, loom: .81 };
  assert.deepEqual(spell, { ...BENCHMARK_SPELL }, 'the benchmark spell here is not the link digest\'s');
  const struck = new Set<string>();
  for (let n = 0; n < BENCHMARK_THEMES; n++) {
    const t = planTheme(27191, n, { strategy: 'house-v2', spell });
    const link = linkWrite({ seed: BENCHMARK_SEED, theme: n, strategy: 'house-v2', spell });
    assert.equal(themeHash(t), blessedLine(link).hash, `theme ${n}: 27191 at its spell is not the program blessed for ${link}`);
    const was = planTheme(27191, n, { style: noRule as typeof style, spell });
    assert.equal(sceneOfDice(t.dice), n < 3 ? 'drone-forward' : 'air', `theme ${n}`);
    assert.deepEqual(t.events, was.events, `theme ${n}`);
    for (const e of t.events) if (TIMBRES[String(e.p.preset ?? e.voice)]?.struck) struck.add(String(e.p.preset ?? e.voice));
  }
  for (const v of ['fmBell', 'marimba', 'vibes']) assert.ok(struck.has(v), `${v} is kept`);
});

test('the record reads no texture and no scene, and its lanes put nothing to the question', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const t = planTheme(seed, 0, { strategy: 'house-v1', spell: HOUSE });
    assert.equal(textureOfDice(t.dice), undefined);
    assert.equal(sceneOfDice(t.dice), undefined);
    assert.equal(t.dice.texture, undefined);
    assert.equal(t.dice.scene, undefined);
  }
  assert.ok(v1.lanes.every(l => !l.withdraw));
});

test("Eugene's seeds: 50, 13 and 20 in front with nothing struck beside them; 8 and 33 behind; 5 and 12 air", () => {
  const t50 = at(50);
  assert.equal(t50.dice.padTimbre, 'sawPad');
  assert.ok(!TIMBRES[t50.dice.keysPreset].struck && !t50.events.some(e => e.layer === 'shaker'));
  // 13 and 20 hold drone and body: in front whatever the coin said (09-23).
  for (const seed of [13, 20]) {
    const t = at(seed);
    assert.ok(endless(t), `seed ${seed} holds drone and body`);
    assert.equal(sceneOfDice(t.dice), 'drone-forward', `seed ${seed}`);
    assert.ok(!t.events.some(e => e.layer === 'shaker') && !handsOf(t).length, `seed ${seed}: no sixteenths, no hands`);
    assert.ok(!['fmGlass', 'piano'].includes(t.dice.keysPreset) && !TIMBRES[t.dice.keysPreset].struck, `seed ${seed}: keys ${t.dice.keysPreset}`);
  }
  // 8 (drone + lead) keeps its congas; 33 (body + chords) its woodblock, under.
  for (const seed of [8, 33]) assert.equal(sceneOfDice(at(seed).dice), 'drone-back', `seed ${seed}`);
  assert.ok(handsOf(at(8)).some(e => e.voice === 'conga'));
  for (const seed of [5, 12]) assert.equal(sceneOfDice(at(seed).dice), 'air', `seed ${seed}`);
});

test('R35: the drone in front\'s redraw drops families and never adds one the palette\'s own draw left out', () => {
  const spell = { ...HOUSE, ember: .7 };
  const gained: string[] = [];
  let forward = 0;
  for (const seed of SEEDS) {
    const t = planTheme(seed, 0, { strategy: 'house-v2', spell });
    const c = JSON.parse(String(t.dice.composition));
    if (c.scene !== 'drone-forward') continue;
    forward++;
    const whole = JSON.parse(String(planTheme(seed, 0, { style: noRule as typeof style, spell }).dice.composition));
    const added = Object.keys(c.selected).filter(f => !(f in whole.selected));
    if (added.length) gained.push(`${seed}: ${added.join(', ')}`);
  }
  // Measured 09-24: 4 of 54 forward themes at ember 0.7 gained the ringing keys (22, 88, 99, 112).
  assert.ok(forward > 30, `${forward} forward themes`);
  assert.deepEqual(gained, [], 'a forward theme gained a family');
});
