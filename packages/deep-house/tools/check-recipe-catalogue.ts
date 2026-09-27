import assert from 'node:assert/strict';
import test from 'node:test';
import { PART_LIBRARY, LIBRARY, GENRE_LIBRARY, PINNABLE, recipeById } from '../src/recipes.ts';
import { INTERPRETER, interpretWants } from '../src/interpret.ts';
import { drawable } from '../src/mix.ts';
import { parseSpell } from '../src/spell.ts';
import { linkRead } from '../src/link.ts';
import { auditPoints } from './genre-recipes.ts';
import GENRES from '../src/machine/genres.json' with { type: 'json' };
import { partFromRecipe } from '../src/recipe-part.ts';
import { validate, vocabularyOf } from '../src/recipe.ts';
import { composeParts } from '../src/composition.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { HOUSE, biasFor } from '../src/spell.ts';
import { planTheme, programOf, recipesFor } from '../src/mix.ts';
import * as registry from '@deep-house/engine/voices';
import { inside } from '../src/parts/rhythm.ts';
import { fixture } from './fixtures/programs.ts';

const opts = {strategy:'house-v2',spell:HOUSE};
const trace = t => JSON.parse(t.dice.composition);
const variantOf = id => style.composition.families.flatMap(f=>f.variants).find(v=>v.source?.id===id);
const family = v => registry.BY_NAME[v].family;

test('shipped parts have permanent identities, revisions, admission and neutral evidence references', () => {
  assert.ok(PART_LIBRARY.length>=3);
  for (const r of PART_LIBRARY) {
    assert.match(r.id,/^[a-z0-9-]+\/[a-z0-9-]+$/);
    // CONVENTIONS: a positive integer that a material change increments.
    assert.ok(Number.isSafeInteger(r.revision)&&r.revision>=1);
    // A neutral reference: lower-case words and slashes, no link, date or path.
    assert.match(r.provenance.evidence,/^[a-z0-9-]+(\/[a-z0-9-]+)*$/);
    assert.ok(!JSON.stringify(r).includes('http'));
    assert.deepEqual(Object.keys(r.provenance),['evidence']);
    assert.deepEqual(validate(r,vocabularyOf(style,registry)),[]);
    assert.deepEqual(partFromRecipe(r).request, {rhythm:r.wants.rhythm,presence:r.wants.presence,ambience:r.wants.ambience});
    assert.equal(recipesFor({search:`?recipe=${r.id}&accompaniment=auto`}).spell,null);
    assert.equal(trace(planTheme(4,0,{...opts,recipe:r,accompaniment:'auto'})).pinned.revision,r.revision);
  }
});

test('ordinary draws reach all approved phrases, obey tempo and kit limits, and retain unclaimed streams', () => {
  const seen=new Set(),bias=biasFor(HOUSE,style);
  const noHands={...style,composition:{...style.composition,families:style.composition.families.filter(f=>f.id!=='percussion')}};
  for(let seed=1;seed<=100;seed++) {
    const a=composeParts(style,seed,bias,'medium',104),b=composeParts(noHands,seed,bias,'medium',104);
    for(const family of ['bass','body','pulse','figure','harmony']) assert.equal(a.trace.selected[family],b.trace.selected[family]);
    for(const source of a.trace.recipes??[]) {
      seen.add(source.id);
      assert.equal(source.revision,recipeById(source.id).revision,'the trace names the definition that played');
      assert.deepEqual(source.roles,recipeById(source.id).placement.roles);
    }
    assert.ok(a.trace.usage.rhythmParts<=2);
    for(const [spell,bpm] of [[HOUSE,140],[{...HOUSE,ember:.1},100],[{...HOUSE,spark:.8},104]])
      assert.equal(composeParts(style,seed,biasFor(spell,style),'medium',bpm).trace.recipes,undefined);
    // A variant's own tempo floor, read off the style rather than naming the row.
    for(const source of composeParts(style,seed,bias,'medium',100).trace.recipes??[])
      assert.ok((variantOf(source.id).when?.bpm?.above??-Infinity)<100,`${source.id} is admitted only above its tempo floor`);
  }
  assert.deepEqual([...seen].sort(),PART_LIBRARY.map(r=>r.id).sort());
});

test('unsupported grammar, meter, scope and inaccurate claims cannot slip through', () => {
  const r=PART_LIBRARY[0];
  assert.throws(()=>partFromRecipe({...r,revision:0}));
  for(const placement of [{...r.placement,roles:['figure']},{...r.placement,roles:['sixteenth','figure']}])
    assert.throws(()=>partFromRecipe({...r,placement}));
  for(const scope of ['track','section','seam','treatment']) assert.throws(()=>partFromRecipe({...r,scope}));
  for(const patch of [{grammar:'dnb-phrases-1'},{beatsPerBar:3}]) {
    const candidate=partFromRecipe({...r,placement:{...r.placement,...patch}});
    const incompatible={...style,composition:{...style.composition,families:[{id:'other',chance:1,variants:[{id:'other',weight:1,...candidate}]}]}};
    assert.equal(composeParts(incompatible,1,biasFor(HOUSE,incompatible),'medium',104).trace.recipes,undefined);
    assert.throws(()=>planTheme(4,0,{...opts,recipe:{...r,placement:{...r.placement,...patch}},accompaniment:'auto'}),/placement context/);
  }
});

test('automatically selected scores survive development and pickups without waking the brush', () => {
  const seen=new Set();
  for(let seed=1;seed<=40&&seen.size<3;seed++) {
    const t=planTheme(seed,0,{...opts,development:'percussion'}),tr=trace(t);
    for(const source of tr.recipes??[]) {
      seen.add(source.id);
      const recipe=recipeById(source.id),part=recipe.wants.rhythm.sixteenth[1];
      const p=programOf(t),hits=p.events.filter(e=>e.part===source.id&&part.families.includes(family(e.voice)));
      assert.ok(hits.length>0,'selection must produce audible events');
      assert.deepEqual(p,programOf(planTheme(seed,0,{...opts,development:'percussion'})));
      for(const s of t.arrangement.sections.filter(s=>s.kind==='bridge'&&t.arrangement.sections[s.index+1]?.kind==='main')) {
        const picked=hits.filter(e=>e.bar>=s.startBar&&e.bar<s.startBar+s.bars);
        assert.deepEqual(picked.map(e=>(e.bar-(s.startBar+s.bars-2))*16+e.step),part.pickup.steps);
        assert.ok(!p.events.some(e=>e.part===source.id&&!part.families.includes(family(e.voice))&&e.bar>=s.startBar&&e.bar<s.startBar+s.bars));
      }
      for(const e of hits) {
        const section=t.arrangement.sections.find(s=>e.bar>=s.startBar&&e.bar<s.startBar+s.bars);
        if(section.kind!=='bridge')assert.ok(part.steps.includes((e.bar%part.bars)*16+e.step));
      }
      assert.ok(!t.dice.rhythmDevelopment,'generic development must not replace a selected catalogue score');
    }
  }
  assert.equal(seen.size,3);
});


test('full IDs are unambiguous across collections and ambiguous short names fail', () => {
  const first=PART_LIBRARY[0],second={...first,id:'another/hand-conversation'};
  assert.equal(recipeById(first.id,[second,first]),first);
  assert.equal(recipeById(second.id,[first,second]),second);
  assert.throws(()=>recipeById('hand-conversation',[first,second]),/Ambiguous/);
  assert.equal(recipeById('missing',[first,second]),null);
  for(const id of ['study/temporary','attempt/temporary','invalid']) assert.throws(()=>partFromRecipe({...first,id}));
});

test('catalogue claims reject later treatments and refuse partially occupied placement', () => {
  const part=partFromRecipe(PART_LIBRARY[0]);
  const score={id:'score',chance:1,variants:[{id:'score',weight:1,...part}]};
  const treatment={id:'treatment',chance:1,variants:[{id:'near',weight:1,request:{presence:{sixteenth:'background'}}}]};
  for(const families of [[score,treatment],[treatment,score]]) {
    const s={...style,composition:{...style.composition,families}},tr=composeParts(s,1,biasFor(HOUSE,s),'medium',104).trace;
    assert.equal(tr.selected[families[1].id],undefined);
    assert.ok(tr.skipped.some(r=>r.family===families[1].id&&r.reason==='reserved recipe role'));
  }
});

// A part's window names a family of sounds, never one instrument in disguise
// (the composition review of 09-22, #1): at least two registered voices of its
// role and family satisfy every rhythm and pitched part the style and the
// shipped rows declare, and the fixtures the checks play. Weights and the
// reserve list decide what is drawn; a character's declared controls may
// narrow it further, and that is a capability, not a fingerprint.
const registeredFor = {
  rhythm: (role, p) => Object.values(registry.BY_NAME).filter(d => d.roles.includes(role) && p.families.includes(d.family)
    && (!p.properties || !Object.keys(p.properties).length || Object.values(d.timbres || {}).some(t => inside(t, p.properties)))).map(d => d.name),
  figure: p => Object.keys(registry.TIMBRES).filter(t => {
    const d = registry.BY_NAME[registry.voicePlaying('keys', t)];
    return d && p.families.includes(d.family) && d.roles.includes(p.articulation === 'sustained' ? 'sustained' : 'figure')
      && registry.TIMBRES[t].struck === (p.articulation !== 'sustained') && inside(registry.TIMBRES[t], p.properties);
  }),
};
const partsOf = (src, request) => [
  ...Object.entries(request.rhythm ?? {}).flatMap(([role, ps]) => ps.map((p, i) => ({ at: `${src} rhythm.${role}[${i}]`, got: registeredFor.rhythm(role, p), p }))),
  ...(request.struckFigures ?? []).map((p, i) => ({ at: `${src} figure[${i}]`, got: registeredFor.figure(p), p })),
];
test('every part admits a family: two or more registered voices, and the preferred profile has an enabled one', () => {
  const all = [
    ...style.composition.families.flatMap(f => f.variants.flatMap(v => partsOf(`${f.id}/${v.id}`, v.request))),
    ...PART_LIBRARY.flatMap(r => partsOf(r.id, { rhythm: r.wants.rhythm })),
    ...GENRE_LIBRARY.flatMap(r => partsOf(r.id, { rhythm: r.wants.rhythm,
      struckFigures: r.wants.figures?.figure ? [r.wants.figures.figure].flat() : [] })),
    ...['calm-piano-part-01', 'calm-piano-part-02', 'ringing-chords-01', 'hand-tone-08'].map(fixture)
      .flatMap(r => partsOf(r.id, { rhythm: r.wants.rhythm, struckFigures: r.wants.figures?.figure ? [r.wants.figures.figure] : [] })),
  ];
  assert.ok(all.length > 20);
  for (const { at, got, p } of all) {
    assert.ok(got.length >= 2, `${at} admits only ${got.join(', ') || 'nothing'}: a window that fits one voice is that voice's name`);
    if (p.prefer) assert.ok(got.some(v => p.articulation ? inside(registry.TIMBRES[v], p.prefer)
      : Object.values(registry.BY_NAME[v].timbres).some(t => inside(t, p.prefer))), `${at} prefers a profile no admitted voice has`);
  }
  // The approved hand phrases still play on the membrane they were written on
  // most of the time, and on its neighbour some of the time.
  const drums = new Map();
  for (let seed = 1; seed <= 60; seed++) for (const r of PART_LIBRARY) {
    const t = planTheme(seed, 0, { ...opts, recipe: r, accompaniment: 'auto' });
    for (const e of t.events) if (e.part === r.id && family(e.voice) === 'drum') { drums.set(e.voice, (drums.get(e.voice) ?? 0) + 1); break; }
  }
  const total = [...drums.values()].reduce((a, b) => a + b, 0), conga = drums.get('conga') ?? 0;
  assert.ok(drums.size >= 2 && conga / total > .6, JSON.stringify([...drums]));
});

test('a hand row drawn by the catalogue and the same row pinned are one performance', () => {
  let compared = 0;
  for (let seed = 1; seed <= 40 && compared < 6; seed++) {
    const t = planTheme(seed, 0, opts), source = trace(t).recipes?.[0];
    if (!source) continue;
    const pinned = planTheme(seed, 0, { ...opts, recipe: recipeById(source.id), accompaniment: 'auto' });
    const own = x => x.events.filter(e => e.part === source.id);
    assert.ok(own(t).length > 0);
    assert.deepEqual(own(t), own(pinned), `${seed}: ${source.id} drew different streams ordinarily and pinned`);
    compared++;
  }
  assert.ok(compared >= 3);
});

// --- the genres beyond the house (recipes-g1) --------------------------------

/**
 * The rows genres.json claims (M18): a family or a sub-genre names its rows by
 * their own ids in `recipes`, so a family's name and a row's folder need not
 * agree — DnB & Dub keeps `dnb/` and `dub/`, Misc keeps `garage/`.
 */
const CLAIMED = GENRES.families.flatMap(f => [...(f.recipes || []), ...f.subs.flatMap(s => s.recipes || [])]);
const SHIPPED = ['house/deep-house', 'house/sub-room', 'house/growl-room', 'house/pump', 'house/lick', 'house/answer',
  'house/hand-conversation', 'house/hand-rolling', 'house/hand-answers'];
const quietly = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };

test('the genre rows parse, name a family of the genre keys, are current, and no draw can reach one', () => {
  assert.ok(GENRE_LIBRARY.length >= 6);
  assert.deepEqual(LIBRARY.map(r => r.id), SHIPPED, 'the shipped library moved');
  assert.deepEqual(PINNABLE.map(r => r.id), [...SHIPPED, ...GENRE_LIBRARY.map(r => r.id)]);
  assert.equal(new Set(PINNABLE.map(r => r.id)).size, PINNABLE.length, 'an id is used twice across the two libraries');
  assert.ok(CLAIMED.length > 0, 'genres.json claims no rows');
  const vocab = vocabularyOf(style, registry), bias = biasFor(HOUSE, style);
  for (const r of GENRE_LIBRARY) {
    assert.match(r.id, /^[a-z]+\/[a-z0-9-]+$/);
    assert.ok(CLAIMED.includes(r.id), `${r.id}: no family or style of genres.json claims it`);
    // A short name reaches it and nothing else: no collision with the house's.
    assert.equal(recipeById(r.id.split('/')[1]), r, `${r.id}: its short name is ambiguous`);
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.equal(r.interpreter, INTERPRETER, `${r.id} was written under ${r.interpreter}`);
    assert.equal(r.scope, 'track'); assert.equal(r.applies, null);
    assert.ok(Number.isSafeInteger(r.revision) && r.revision >= 1);
    assert.deepEqual(r.birds, {}, `${r.id}: a genre row's spell is the link's (its key's), never a box of its own`);
    assert.equal(r.weight, 0, `${r.id} must weigh nothing, so no draw could take it`);
    assert.equal(drawable(r), false);
    assert.ok(typeof r.provenance.pattern === 'string' && /public knowledge/.test(r.provenance.knowledge), `${r.id}: provenance`);
    assert.ok(Array.isArray(r.tempo?.bpm) && r.tempo.bpm[0] <= r.tempo.bpm[1]);
    assert.ok(r.tempo.nearest === undefined || (r.tempo.nearest[0] <= r.tempo.nearest[1] && (r.tempo.nearest[1] < r.tempo.bpm[0] || r.tempo.nearest[0] > r.tempo.bpm[1])),
      `${r.id}: a nearest band is named only where the genre's own is out of reach`);
    assert.ok(r.sections.length && r.sections.every(k => Object.hasOwn(style.sections.kinds, k)), `${r.id}: sections`);
    assert.ok(!JSON.stringify(r).includes('http'));
    // Every want is one this interpreter applies; none is reported unsupported or unsatisfied.
    const notes = interpretWants(r, style, bias).notes;
    assert.deepEqual(notes.filter(n => n.state !== 'applied').map(n => `${n.block}: ${n.say}`), [], r.id);
    assert.ok(!style.composition.families.some(f => f.variants.some(v => v.source?.id === r.id)), `${r.id} is admitted by the style`);
  }
  // `auto` draws among the shipped track rows only, whatever the seed.
  const genreIds = new Set(GENRE_LIBRARY.map(r => r.id));
  for (let seed = 1; seed <= 40; seed++) {
    const cast = quietly(() => recipesFor({ masterSeed: seed, strategy: 'house-v2', search: '?recipe=auto' }));
    assert.ok(cast.track && !genreIds.has(cast.track.id) && cast.parked.every(p => !genreIds.has(p.split(' ')[0])));
  }
});

test('every genre row plays at its audit link and under its key on thirty seeds, its cells where it wrote them', () => {
  const points = auditPoints();
  assert.deepEqual(points.map(p => p.id).sort(), GENRE_LIBRARY.map(r => r.id).sort(), 'a genre row has no audit link');
  for (const p of points) {
    const r = recipeById(p.id), read = quietly(() => linkRead(`?${p.search}`));
    assert.deepEqual(read.problems, [], `${p.id}: its audit link was refused`);
    assert.equal(read.link.recipe, p.id);
    const cast = quietly(() => recipesFor({ masterSeed: p.seed, strategy: 'house-v2', search: `?${p.search}` }));
    assert.equal(cast.track, r);
    const t = quietly(() => planTheme(p.seed, p.theme - 1, { strategy: 'house-v2', spell: cast.spell, recipe: cast.track }));
    // In the genre's band, or — where no band reaches it — in the nearest the row names.
    const band = r.tempo.nearest ?? r.tempo.bpm;
    assert.ok(t.bpm >= band[0] && t.bpm <= band[1], `${p.id} audits at ${t.bpm} BPM, outside ${band}`);
    const events = programOf(t).events, main = t.arrangement.sections.filter(s => s.kind === 'main');
    const inMain = e => main.some(s => e.bar >= s.startBar && e.bar < s.startBar + s.bars);
    for (const [role, voices] of [['kick', ['kick']], ['backbeat', ['snare', 'rimshot', 'clap']]]) {
      const cell = r.wants.rhythm?.[role]?.[0];
      if (!cell) continue;
      const hits = events.filter(e => voices.includes(e.voice) && inMain(e));
      assert.ok(hits.length > 0, `${p.id}: no ${role} in its mains`);
      for (const e of hits) assert.ok(cell.steps.includes((e.bar % cell.bars) * 16 + e.step), `${p.id}: a ${role} at ${e.bar}:${e.step} is not its cell's`);
      // The backbeat is heard: the sub room's -60 dB clap level does not reach a row that asks for its level.
      if (role === 'backbeat') assert.ok(Math.max(...hits.map(e => e.p.gain)) > 0.1, `${p.id}: the backbeat is at ${Math.max(...hits.map(e => e.p.gain))}`);
    }
    // A row that asks its sixteenth cell for the style's level is heard on it.
    if (r.wants.presence?.sixteenth === 'supporting') {
      const cell = r.wants.rhythm.sixteenth[0], hits = events.filter(e => e.bar >= main[0].startBar && registry.BY_NAME[e.voice]?.roles.includes('sixteenth') && inMain(e));
      assert.ok(hits.length && Math.max(...hits.map(e => e.p.gain)) > 0.03, `${p.id}: its sixteenth cell is not heard`);
      assert.ok(cell.steps.length > 0);
    }
    const spell = parseSpell(p.spell);
    for (let seed = 1; seed <= 30; seed++) for (const theme of [0, 1])
      assert.doesNotThrow(() => quietly(() => planTheme(seed, theme, { strategy: 'house-v2', spell, recipe: r })), `${p.id} refuses ${seed}/${theme + 1} under its key`);
  }
});
