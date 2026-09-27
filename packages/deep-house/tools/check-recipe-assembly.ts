import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { planTheme, programOf, recipesFor } from '../src/mix.ts';
import { generate } from '../src/generator.ts';
import { recipeById, MOTIF_LIBRARY } from '../src/recipes.ts';
import { recipeRequest, accompanimentFor } from '../src/recipe-request.ts';
import { composeParts, partRoles } from '../src/composition.ts';
import { HOUSE, biasFor } from '../src/spell.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { createJournal } from '../src/journal.ts';
import { strategyById } from '../src/strategies/index.ts';
import { validate, vocabularyOf, type Recipe } from '../src/recipe.ts';
import * as registry from '@deep-house/engine/voices';
import { blessed, fixture, hashOf, ROWS } from './fixtures/programs.ts';

const piano: Recipe = fixture('calm-piano-part-01');
const options = { strategy: 'house-v2', spell: HOUSE, accompaniment: 'auto' as const };
const hash = (p: unknown) => crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const trace = (t: ReturnType<typeof planTheme>) => JSON.parse(String(t.dice.composition));

test('the three accepted comparisons retain their blessed compiled programs', () => {
  const approved = ROWS.filter(r => r.kind === 'approved');
  assert.deepEqual(approved.map(r => r.recipe).sort(), MOTIF_LIBRARY.map(r => r.id).sort());
  for (const row of approved) assert.equal(hashOf(row), blessed(row.name), `${row.name} is an approved performance`);
});

test('all three pins survive assembly, reserve their role and leave ordinary choices available', () => {
  let together = 0, changed = 0;
  for (const recipe of MOTIF_LIBRARY) for (const seed of [3, 4, 6, 17, 44, 71, 102]) {
    const base = planTheme(seed, 0, { ...options, accompaniment: 'base', recipe });
    const t = planTheme(seed, 0, { ...options, recipe }), tr = trace(t);
    assert.equal(t.dice.motif, recipe.id);
    assert.equal(t.dice.motifDegrees, base.dice.motifDegrees);
    assert.equal(t.dice.motifCell, base.dice.motifCell);
    assert.equal(tr.pinned.id, recipe.id);
    assert.equal(tr.context.grammar, style.composition.placement!.grammar);
    assert.equal(tr.context.kit, 'fourFloor');
    const events = t.events.filter(e => e.part === recipe.id);
    assert.ok(events.length > 0);
    assert.equal(programOf(t).events.filter(e => e.part === recipe.id).length, events.length);
    assert.deepEqual(programOf(t), programOf(planTheme(seed, 0, { ...options, recipe })));
    const pinRole = tr.pinned.role;
    for (const [family, variant] of Object.entries(tr.selected)) {
      const request = style.composition.families.find(f => f.id === family)!.variants.find(v => v.id === variant)!.request;
      assert.equal(partRoles(request).has(pinRole), false, `${family} overwrites ${pinRole}`);
    }
    assert.ok(tr.usage.upperParts <= style.composition.limits.upperParts);
    assert.ok(tr.usage.sparseUpper <= style.composition.limits.sparseUpper);
    if (Object.keys(tr.selected).length) changed++;
    if (t.dice.accompanimentBass) {
      together++;
      assert.equal(recipe.applies, 'lead');
      assert.ok(t.events.some(e => e.layer === 'bass' && !e.part));
    }
  }
  assert.ok(changed > 8, 'ordinary accompaniment must actually be used');
  assert.ok(together > 0, 'a pinned lead must coexist with an ordinary bass phrase');
});

test('the extracted piano keeps its ordered phrase while accompaniment varies by seed', () => {
  assert.deepEqual(validate(piano, vocabularyOf(style, registry)), []);
  const heard = new Set<string>(), accompaniments = new Set<string>();
  for (const seed of [3, 17, 44, 71]) {
    const t = planTheme(seed, 0, { ...options, recipe: piano });
    const notes = t.events.filter(e => e.part === piano.id);
    assert.ok(notes.length > 0 && notes.every(e => e.voice === 'piano'));
    assert.equal(t.dice.struckFigureDegrees, piano.wants!.figures.figure.motif.paths[0].degrees.join(' '));
    assert.ok(notes.some((e,i) => notes.some((n,j) => j !== i && n.t === e.t && n.p.midi !== e.p.midi)), 'chord landings must survive');
    heard.add(hash(notes)); accompaniments.add(hash(t.events.filter(e => !e.part)));
    const stripped = { ...style, composition: { ...style.composition, families: [] } };
    const samePin = planTheme(seed, 0, { ...options, style: stripped, recipe: piano });
    assert.deepEqual(notes, samePin.events.filter(e => e.part === piano.id), 'unrelated draws cannot reroll a pinned phrase');
  }
  assert.ok(heard.size > 1 && accompaniments.size > 1);
});

test('reserved space counts before ordinary draws, with stable unclaimed family streams', () => {
  const pin = recipeRequest(recipeById('lick'), 'auto').pin!;
  for (let seed = 1; seed <= 24; seed++) {
    const bias = biasFor(HOUSE, style);
    const ordinary = composeParts(style, seed, bias, 'medium', 100)!;
    const pinned = composeParts(style, seed, bias, 'medium', 100, pin)!;
    for (const family of ['bass','body','percussion-space'])
      assert.equal(pinned.trace.selected[family], ordinary.trace.selected[family]);
    // A pin is explicit, so a pinned theme's drone is never in front and its
    // hands are the palette's own draw; the ordinary theme's are the same draw
    // unless its drone is in front, which withdraws them.
    assert.notEqual(pinned.trace.scene, 'drone-forward');
    if (ordinary.trace.scene === 'drone-forward') assert.equal(ordinary.trace.selected.percussion, undefined);
    else assert.equal(pinned.trace.selected.percussion, ordinary.trace.selected.percussion);
    assert.equal(pinned.parts.struckFigures.length, 0);
    assert.equal(pinned.parts.texture, null, 'the pinned lead uses the sparse upper budget');
  }
});

test('layer placement admits bass and drums through the same scoped contract', () => {
  const bass = { ...piano, id: 'test/bass', applies: 'bassline', wants: { figures: { bassline: {
    follows: 'harmony', articulation: 'legato', motif: recipeById('pump')!.wants!.motif,
  } } } };
  const bassTrack = planTheme(3, 0, { ...options, recipe: bass });
  assert.ok(bassTrack.events.some(e => e.part === bass.id && e.layer === 'bass'));
  const held = { ...bass, wants: { figures: { bassline: { follows: 'harmony', articulation: 'held' } } } };
  assert.ok(planTheme(3, 0, { ...options, recipe: held }).events.some(e => e.part === held.id));
  const drum = { ...piano, id: 'test/drum', applies: 'sixteenth', wants: { rhythm: { sixteenth: [{
    bars: 1, steps: [2, 6, 10, 14], accents: [.2,.3,.2,.3], families: ['noise'],
  }] } } };
  const t = planTheme(3, 0, { ...options, recipe: drum });
  assert.ok(t.events.some(e => e.part === drum.id));
  assert.ok(t.events.filter(e => e.part === drum.id).every(e => [2,6,10,14].includes(e.step!)));
});

test('complete arrangements and out-of-scope or impossible pins fail explicitly', () => {
  const track = recipeById('house/deep-house')!;
  assert.throws(() => planTheme(3, 0, { ...options, recipe: track }), /complete arrangement/);
  assert.throws(() => recipeRequest(piano), /not implemented/);
  for (const recipe of [
    { ...piano, wants: { ...piano.wants, harmony: { movement: 'pedal' } } },
    { ...piano, wants: { ...piano.wants, presence: { sustained: 'background' } } },
    { ...piano, birds: { root: [.1,.5] } }, { ...piano, forbids: ['sustained'] },
    { ...piano, wants: {} }, { ...piano, applies: 'keyboard' },
  ] as Recipe[]) assert.throws(() => planTheme(3, 0, { ...options, recipe }));
  assert.throws(() => planTheme(3, 0, { ...options, recipe: piano, spell: { ...HOUSE, spark: .8 } }), /placement context/);
  assert.throws(() => planTheme(3, 0, { ...options, recipe: piano, spell: { ...HOUSE, ember: 0 } }), /placement context/);
  assert.throws(() => generate({ style: { ...style, lanes: [] }, seed: 3, recipe: piano, accompaniment: 'auto' }), /logical role/);
  assert.throws(() => planTheme(3, 0, { ...options, recipe: piano, motif: { off: true } }), /cannot both/);
});

test('query, link and journal retain the accompaniment choice', () => {
  assert.equal(accompanimentFor({ search: '?accompaniment=auto' }), 'auto');
  assert.equal(accompanimentFor({ accompaniment: 'base', search: '?accompaniment=auto' }), 'base');
  assert.throws(() => accompanimentFor({ search: '?accompaniment=unknown' }), /Unknown/);
  const cast = recipesFor({ search: `?recipe=${piano.id}&accompaniment=auto` }, [piano]);
  assert.equal(cast.track, piano); assert.equal(cast.spell, null);
  const values = new Map<string,string>();
  const store = { getItem:(k:string)=>values.get(k)??null, setItem:(k:string,v:string)=>values.set(k,v), removeItem:(k:string)=>{values.delete(k);} };
  const place = { seed:'3', theme:0, strategy:'house-v2', spell:HOUSE, recipe:'house/pump', accompaniment:'auto' as const };
  createJournal({ store }).arrived(place, { bar:29, clock:0 });
  assert.equal(createJournal({ store }).load(place), true);
  assert.equal(createJournal({ store }).load({ ...place, accompaniment:'base' }), false);
});
