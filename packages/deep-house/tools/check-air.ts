// Zephyr is air (the zephyr-air round, 10-18): wherever Zephyr leans a timbre draw it leans by the voice's measured air,
// about the place's own Zephyr, and a theme's voice only steps airier as Zephyr rises.
//
//   node --test tools/check-air.ts
//
// What is held:
//   1. every tuned place (the tiles, BELLS, 27191's drone, seed 6's golden) stands at its own Zephyr centre, so it plays
//      at its own birds what it played;
//   2. the coupled draw is `Rng.weighted` to the bit where the weights are the centre's, and off it a die's voice never
//      steps darker as the lean rises (nor leaves its group);
//   3. the house's lead, pad and stab lists drawn as the generator draws them (`drawTimbre`) only step airier along
//      Zephyr and a lead keeps its role, at the house, two of its pulls and two tiles; the centre never steps;
//   4. no place leans a timbre by a typed family on Zephyr (the liquid keys' tone, the conversation's caller and answerer);
//   5. at the Drum & Bass tile every theme's keys and at BELLS every theme's call and answerer only step airier from
//      Zephyr 0 to 1;
//   6. a strike's hardness is BELLS's alone, off its own Zephyr, read only by a row that declares it, in its range.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTheme } from '../src/mix.ts';
import { HOUSE, airAtOf, biasFor, drawTimbre, parseSpell, timbreRoleOf, type Spell } from '../src/spell.ts';
import { airAbout, airDraw, airLeaned, airOctaves } from '../src/air-lean.ts';
import { style as v2 } from '../src/styles/deep-house-v2.ts';
import { AIR, KEYS } from '../src/styles/deep-house-places.ts';
import { TILES, DEEP_HOUSE, presetSpell } from '../src/genres/genre-table.ts';
import { conversationRowOf } from '../src/slow-conversation.ts';
import { keysOfProgram } from '../src/bird-labels.ts';
import Rng from '../src/rng.ts';
import { strikeTilt } from '@deep-house/engine/voices/descriptor';
import { BY_NAME } from '@deep-house/engine/voices';

const quiet = <T>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const BELLS: Partial<Spell> = { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 };
const DNB = presetSpell(TILES.find((t) => t?.label === 'Drum & Bass')!);

test('every tuned place stands at its own Zephyr centre', () => {
  const places: Array<[string, Spell]> = [
    ...[DEEP_HOUSE, ...TILES].filter((t) => !!t && t.tuned).map((t) => [t!.label, presetSpell(t!)] as [string, Spell]),
    ['BELLS', { ...HOUSE, ...BELLS }],
    ['27191', { ...HOUSE, ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 }],
    ["seed 6's golden", { ...HOUSE, ember: 0, tide: 0.9, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.1, loom: 0.8 }],
  ];
  for (const [name, spell] of places) assert.equal(airAtOf(spell, v2), null, `${name} stands off its centre`);
  assert.ok(AIR.length >= places.length - 1, 'the centres');
});

test('the coupled draw is the plain draw at the centre, and only steps airier off it', () => {
  const r = new Rng('check-air');
  for (let k = 0; k < 400; k++) {
    const n = 2 + Math.floor(r.next() * 8);
    const list = Array.from({ length: n }, (_, i) => ({ v: `v${i}`, w: r.next() < 0.15 ? 0 : 0.1 + r.next() * 3 }));
    const air = new Map(list.map((e) => [e.v, r.next() < 0.1 ? null : Math.log2(200 + r.next() * 2000)]));
    const group = new Map(list.map((e) => [e.v, r.next() < 0.5 ? 'a' : 'b']));
    const airOf = (v: string) => air.get(v) ?? null;
    const about = airAbout(list, airOf), rank = (v: string) => about[list.findIndex((e) => e.v === v)];
    const seed = `d${k}`;
    assert.equal(airDraw(new Rng(seed), list, list, rank), new Rng(seed).weighted(list), `list ${k}: not the plain draw at the centre`);
    for (const grouped of [false, true]) {
      let last = -Infinity, g: string | null = null;
      for (let off = 0; off <= 1.0001; off += 0.1) {
        const v = airDraw(new Rng(seed), list, airLeaned(list, 6, off, airOf), rank, grouped ? (x) => group.get(x)! : undefined);
        assert.ok(rank(v) >= last - 1e-12, `list ${k}: stepped darker at ${off.toFixed(1)}`);
        if (grouped) { if (g === null) g = group.get(v)!; assert.equal(group.get(v), g, `list ${k}: left its group`); }
        last = rank(v);
      }
    }
  }
});

test('the house\'s timbre lists, drawn as the generator draws them, only step airier along Zephyr', () => {
  // the layer table's own clamp sits under the air's lean (`listWeights`), so a voice pinned at the ceiling hands no
  // share down: 400 seeds x 21 points, at the house, along two of its pulls and at the Ambient and Drum & Bass tiles
  const CAT = v2.catalogue as unknown as Record<string, Array<{ v: string; w: number }>> & { sustainedLeads: string[] };
  const at: Array<[string, Spell]> = [
    ['the house', HOUSE], ['em:0.90', { ...HOUSE, ...parseSpell('em:0.90') }], ['sp:0.90', { ...HOUSE, ...parseSpell('sp:0.90') }],
    ['the Ambient tile', presetSpell(TILES.find((t) => t?.label === 'Ambient')!)], ['the Drum & Bass tile', DNB],
  ];
  for (const [name, base] of at) {
    const biases = Array.from({ length: 21 }, (_, zi) => biasFor({ ...base, zephyr: zi / 20 }, v2));
    for (const id of ['leadTimbres', 'padPartners', 'stabPartners']) {
      const role = timbreRoleOf(v2, id), held = new Set(CAT.sustainedLeads);
      for (let s = 1; s <= 400; s++) {
        let last = -Infinity, was = '';
        for (let zi = 0; zi <= 20; zi++) {
          const v = drawTimbre(new Rng(`${s}::${id}`), v2, CAT[id], biases[zi], id);
          const a = airOctaves(v, role(v)) ?? 0;
          assert.ok(a >= last - 1e-9, `${name} ${id} seed ${s}: ${was} to ${v}, darker at Zephyr ${(zi / 20).toFixed(2)}`);
          if (id === 'leadTimbres' && was) assert.equal(held.has(v), held.has(was), `${name} lead seed ${s}: ${was} to ${v} changes the lead's role`);
          last = a; was = v;
        }
      }
    }
  }
});

test('the centre is continuous: a bird other than Zephyr slides it, never steps it', () => {
  for (const b of ['ember', 'tide', 'root', 'gleam', 'veil', 'spark', 'loom'] as const) {
    let last: number | null = null;
    for (let i = 0; i <= 1000; i++) {
      const s = { ...HOUSE, [b]: i / 1000 } as Spell;
      const c = airAtOf(s, v2)?.centre ?? s.zephyr;
      if (last !== null) assert.ok(Math.abs(c - last) < 0.01, `${b} ${(i / 1000).toFixed(3)}: the centre steps ${last.toFixed(4)} to ${c.toFixed(4)}`);
      last = c;
    }
  }
});

test('no place leans a timbre by a typed family on Zephyr', () => {
  for (const e of KEYS) for (const k of Object.keys(e.keys?.leans?.by.zephyr ?? {})) assert.ok(!k.startsWith('tone:'), `${e.id}: Zephyr leans the tone by name (${k})`);
  const conv = conversationRowOf('bells-in-conversation')!;
  for (const k of Object.keys(conv.birds.by.zephyr ?? {})) assert.ok(!/^(caller|answerer):/.test(k), `the conversation: Zephyr leans a voice by name (${k})`);
});

test('Zephyr up is airier: the Drum & Bass tile\'s keys and BELLS\'s calls and answers, theme by theme', () => {
  for (const [name, at, read] of [
    ['the Drum & Bass tile', DNB, (t: any) => { const k = keysOfProgram(t.events, t.dice.keysPreset); return k ? airOctaves(k, 'keys') : null; }],
    ['BELLS', { ...HOUSE, ...BELLS }, (t: any) => (typeof t.dice.conversation === 'string' ? airOctaves(t.dice.conversation.split(' · ')[2], 'call') : null)],
    ['BELLS\'s answerer', { ...HOUSE, ...BELLS }, (t: any) => (typeof t.dice.conversation === 'string' ? airOctaves(t.dice.conversation.split(' · ')[3], 'answer') : null)],
  ] as const) {
    let read_ = 0;
    for (const seed of ['1', '2', '3', '4']) for (const theme of [0, 1, 2]) {
      let last = -Infinity, at0: string | null = null;
      for (let zi = 0; zi <= 10; zi++) {
        const t = quiet(() => planTheme(seed, theme, { strategy: 'house-v2', spell: { ...at, zephyr: zi / 10 } as Spell }));
        const a = read(t);
        if (a == null) continue;
        assert.ok(a >= last - 1e-9, `${name} seed ${seed} theme ${theme + 1}: darker at Zephyr ${(zi / 10).toFixed(1)} (${Math.round(2 ** a)} Hz after ${Math.round(2 ** last)})`);
        last = a; at0 ??= String(zi);
      }
      if (at0 !== null) read_++;
    }
    // a library turn plays no conversation and no liquid keys: those themes read nothing
    assert.ok(read_ >= 8, `${name}: only ${read_} of 12 themes read`);
  }
});

test('a harder strike at BELLS is the voice\'s own control, and only there, off the place\'s Zephyr', () => {
  let off = 0;
  for (const seed of ['1', '2', '3']) {
    const at = (z: number) => quiet(() => planTheme(seed, 0, { strategy: 'house-v2', spell: { ...HOUSE, ...BELLS, zephyr: z } as Spell }));
    for (const e of at(0.65).events as any[]) assert.equal(e.p?.hardness, undefined, `seed ${seed}: a strike's hardness at BELLS's own Zephyr`);
    for (const z of [0, 1]) for (const e of at(z).events as any[]) {
      if (e.p?.hardness === undefined) continue;
      off++;
      assert.ok(/^conversation-(call|answer)$/.test(e.part), `seed ${seed} Zephyr ${z}: hardness on a ${e.part ?? e.layer} note`);
      assert.ok(z === 0 ? e.p.hardness < 1 : e.p.hardness > 1, `seed ${seed} Zephyr ${z}: hardness ${e.p.hardness}`);
    }
    for (const spell of [HOUSE, DNB, { ...HOUSE, ember: 0.1, tide: 0.85, zephyr: 0.9, root: 0.5, veil: 0.3, spark: 0, loom: 0.8 }])
      for (const e of quiet(() => planTheme(seed, 0, { strategy: 'house-v2', spell: spell as Spell })).events as any[]) assert.equal(e.p?.hardness, undefined, `seed ${seed}: a strike's hardness away from the conversation`);
  }
  assert.ok(off > 0, 'no strike leaned off the centre');
});

test('the strike\'s hardness: only a row that declares it reads it, inside the range it declares', () => {
  const declared = { hardness: { unit: 'ratio' as const, min: 0.5, max: 1.5, default: 1 } };
  assert.equal(strikeTilt({ hardness: 1.42 }, undefined), 0, 'a row with no controls read the hardness');
  assert.equal(strikeTilt({ hardness: 1.42 }, {}), 0, 'a row that does not declare it read the hardness');
  assert.equal(strikeTilt({}, declared), 0);
  assert.equal(strikeTilt({ hardness: 1 }, declared), 0);
  assert.equal(strikeTilt({ hardness: 4 }, declared), Math.log(1.5), 'the hardness past the declared range');
  assert.equal(strikeTilt({ hardness: 0.25 }, declared), Math.log(0.5) * 0.6, 'the hardness under the declared range');
  // every struck row that declares it declares what BELLS writes and the DSP keeps (the review: at 4 the FM bell's index
  // folded over Nyquist), and BELLS writes inside it
  for (const id of ['vibes', 'bellTemple', 'bellSmall', 'bellGreat', 'marimba', 'malletSoft', 'fmBell']) {
    const c = (BY_NAME as any)[id]?.controls?.hardness;
    assert.ok(c && c.min >= 0.5 && c.max <= 1.5, `${id}: hardness declared ${JSON.stringify(c)}`);
  }
  for (const seed of ['1', '2', '3']) for (const z of [0, 1]) for (const e of quiet(() => planTheme(seed, 0, { strategy: 'house-v2', spell: { ...HOUSE, ...BELLS, zephyr: z } as Spell })).events as any[])
    if (e.p?.hardness !== undefined) assert.ok(e.p.hardness >= 0.5 && e.p.hardness <= 1.5, `seed ${seed} Zephyr ${z}: hardness ${e.p.hardness}`);
});
