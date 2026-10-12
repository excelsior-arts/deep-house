import assert from 'node:assert/strict';
import test from 'node:test';
import { PART_LIBRARY, LIBRARY, PATTERN_LIBRARY, TRACK_LIBRARY, CANDIDATE_LIBRARY, GLIDE_LIBRARY, FORM_LIBRARY, PINNABLE, recipeById,
  TREATMENT_LIBRARY, TREATMENT_CANDIDATES, SECTION_LIBRARY, SEAM_CANDIDATES } from '../src/recipes.ts';
import { weightOf } from '../src/recipe.ts';
// the house's own six: the section rows at a weight, which the grammar is read off (`grammarFromRows`)
const HOUSE_SECTIONS = SECTION_LIBRARY.filter((r) => weightOf(r) > 0);
import { SECTIONS, GLIDE, FORM } from '../src/styles/deep-house-places.ts';
import { admitsOf } from '../src/sections.ts';
import { PLAYED_KINDS, PLACED_AT } from '../src/treatment.ts';
import { planSubSections, NO_SUBS } from '../src/subsections.ts';
import { recipeRequest } from '../src/recipe-request.ts';
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
    ...PATTERN_LIBRARY.flatMap(r => partsOf(r.id, { rhythm: r.wants.rhythm,
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

test('the glide rows (round DNB-7) are bass motif rows at nought with a glide grammar, and the glide table names them and no other', () => {
  assert.deepEqual(GLIDE_LIBRARY.map(r => r.id), ['dnb/glide-and-back', 'dnb/glide-over-the-bar', 'dnb/glide-held-swoop']);
  const vocab = vocabularyOf(style, registry);
  for (const r of GLIDE_LIBRARY) {
    assert.equal(r.scope, 'motif'); assert.equal(r.applies, 'bass'); assert.equal(r.origin, 'mined');
    assert.equal(r.weight, 0, `${r.id} weighs ${r.weight}: not admitted`);
    assert.ok(r.wants.motif.glide, `${r.id}: no glide grammar`);
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.ok(!LIBRARY.includes(r) && !PINNABLE.includes(r), `${r.id} is drawn or pinned by something other than its place`);
  }
  const named = new Set(GLIDE.flatMap(e => (e.rows ?? []).map(x => x.v)));
  assert.deepEqual([...named].sort(), GLIDE_LIBRARY.map(r => r.id).sort(), 'the glide table names a row that is not a glide row');
  // a glide row says its pedal and nothing else: the grammar beyond it (riff-trim, 10-10) is refused, as is a pedal not true or false
  for (const r of GLIDE_LIBRARY) assert.deepEqual(Object.keys(r.wants.motif.glide), ['pedal'], r.id);
  const glide = (g: object) => ({ ...GLIDE_LIBRARY[0], wants: { motif: { ...GLIDE_LIBRARY[0].wants.motif, glide: g } } });
  assert.ok(validate(glide({ pedal: true, shapes: [{ span: 8, at: 2, up: 2, hold: 1, down: 3, w: 1 }] }), vocab).some(m => /glide must say exactly pedal/.test(m)), 'a retired grammar field is refused');
  assert.ok(validate(glide({ pedal: 'yes' }), vocab).some(m => /glide\.pedal/.test(m)), 'a pedal not true or false is refused');
});

test('the form rows (round DNB-6) are track rows with a form in whole blocks, named by the form table alone, and a drawn form lays its blocks', () => {
  // liquid-space (10-11): the research manual's five shapes beside DNB-6's three, which no place draws now
  assert.deepEqual(FORM_LIBRARY.map(r => r.id), ['dnb/form-classic', 'dnb/form-two-drop', 'dnb/form-rolling',
    'dnb/form-two-return', 'dnb/form-roller', 'dnb/form-islands', 'dnb/form-half-time-dialogue', 'dnb/form-broken-air']);
  const vocab = vocabularyOf(style, registry);
  for (const r of FORM_LIBRARY) {
    assert.equal(r.scope, 'track'); assert.equal(r.applies, null);
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.ok(!PINNABLE.includes(r) && !LIBRARY.includes(r) && !TRACK_LIBRARY.includes(r), `${r.id} is drawn by something other than its place`);
    for (const id of Object.keys(r.form.prefers ?? {})) assert.ok(SECTION_LIBRARY.some(s => s.id === id), `${r.id} prefers ${id}, which is no section row`);
  }
  const named = new Set(FORM.flatMap(e => (e.rows ?? []).map(x => x.v)));
  assert.deepEqual([...named].sort(), FORM_LIBRARY.map(r => r.id).filter(id => !['dnb/form-classic', 'dnb/form-two-drop', 'dnb/form-rolling'].includes(id)).sort());
  // the benchmark's theme draws two returns, its lengths drawn (a 32-bar intro, a 16-bar opening), and lays its first drop on bar 48, its second on 176
  const t = planTheme(1, 0, { strategy: 'house-v2', spell: parseSpell('em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85') });
  assert.equal(t.dice.form, 'dnb/form-two-return');
  assert.deepEqual(t.arrangement.sections.filter(s => s.kind === 'drop').map(s => s.startBar), [48, 176]);
  const bad = { ...FORM_LIBRARY[0], form: { ...FORM_LIBRARY[0].form, bars: [32] } };
  assert.ok(validate(bad, vocab).some(m => /form\.bars/.test(m)));
});

test('the genre rows parse, name a family of the genre keys, are current, weigh their audited standing, and recipe=auto never casts in one', () => {
  assert.ok(PATTERN_LIBRARY.length >= 6);
  assert.deepEqual(LIBRARY.map(r => r.id), SHIPPED, 'the shipped library moved');
  assert.deepEqual(PINNABLE.map(r => r.id), [...SHIPPED, ...PATTERN_LIBRARY.map(r => r.id), ...TRACK_LIBRARY.map(r => r.id), ...CANDIDATE_LIBRARY.map(r => r.id),
    ...TREATMENT_LIBRARY.map(r => r.id), ...TREATMENT_CANDIDATES.map(r => r.id), ...SECTION_LIBRARY.map(r => r.id), ...SEAM_CANDIDATES.map(r => r.id)]);
  // DNB-1's mined candidates not yet admitted are pinnable and weigh nought, so no draw reaches them.
  assert.ok(CANDIDATE_LIBRARY.every(r => r.weight === 0 && r.origin === 'mined'), 'a candidate weighs more than nought');
  assert.equal(new Set(PINNABLE.map(r => r.id)).size, PINNABLE.length, 'an id is used twice across the two libraries');
  assert.ok(CLAIMED.length > 0, 'genres.json claims no rows');
  const vocab = vocabularyOf(style, registry), bias = biasFor(HOUSE, style);
  for (const r of PATTERN_LIBRARY) {
    assert.match(r.id, /^[a-z]+\/[a-z0-9-]+$/);
    assert.ok(CLAIMED.includes(r.id), `${r.id}: no family or style of genres.json claims it`);
    // A short name reaches it and nothing else: no collision with the house's.
    assert.equal(recipeById(r.id.split('/')[1]), r, `${r.id}: its short name is ambiguous`);
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.equal(r.interpreter, INTERPRETER, `${r.id} was written under ${r.interpreter}`);
    assert.equal(r.scope, 'track'); assert.equal(r.applies, null);
    assert.ok(Number.isSafeInteger(r.revision) && r.revision >= 1);
    assert.deepEqual(r.birds, {}, `${r.id}: a genre row's spell is the link's (its key's), never a box of its own`);
    // GA3: a genre row weighs its audited standing — 0.75 where it reaches its
    // genre's playing at its audit link, 0.5 where it leans — and the library's
    // turn draws it inside its key's region; `recipe=auto` still casts a set in
    // the shipped track rows only (below).
    const st = r.provenance.standing;
    assert.ok(st && typeof st.reaches === 'boolean', `${r.id}: no audited standing`);
    assert.equal(st.reaches, Math.abs(st.eventRateZ) <= 1 && st.syncopationZ !== null && Math.abs(st.syncopationZ) <= 1, `${r.id}: its standing does not follow the rule`);
    // ...unless a round reweighed it on his word and the row says so (`provenance.weighed`; round DNB-3,
    // 10-05: liquid first at the fast broken places, the jungle and pop rows reachable but not dominant)
    if (typeof r.provenance.weighed === 'string') assert.ok(Number.isFinite(r.weight) && r.weight > 0, `${r.id} weighs ${r.weight}, reweighed`);
    else assert.equal(r.weight, st.reaches ? 0.75 : 0.5, `${r.id} weighs ${r.weight}`);
    // A pattern row comes from public knowledge, or (R1, part 4) is mined from a
    // named cut of a catalogued source and admitted on Eugene's word.
    const mined = r.origin === 'mined' && /^mined:/.test(r.provenance.knowledge) && /^\d+:\d+\+\d+$/.test(r.provenance.cut) && typeof r.provenance.admitted === 'string';
    assert.ok(typeof r.provenance.pattern === 'string' && (/public knowledge/.test(r.provenance.knowledge) || mined), `${r.id}: provenance`);
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
  const genreIds = new Set(PATTERN_LIBRARY.map(r => r.id));
  for (let seed = 1; seed <= 40; seed++) {
    const cast = quietly(() => recipesFor({ masterSeed: seed, strategy: 'house-v2', search: '?recipe=auto' }));
    assert.ok(cast.track && !genreIds.has(cast.track.id) && cast.parked.every(p => !genreIds.has(p.split(' ')[0])));
  }
});

test('every genre row plays at its audit link and under its key on thirty seeds, its cells where it wrote them', () => {
  const points = auditPoints();
  assert.deepEqual(points.map(p => p.id).sort(), PATTERN_LIBRARY.map(r => r.id).sort(), 'a genre row has no audit link');
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
    // Its mains, or — where its form lays no main — its drops, the body of a
    // form that has none. The dubstep key's form is intro, build, drops and
    // breakdowns once a theme is long: since round L1 gave the themes their
    // minutes the dub rows' audit theme is 212 bars (68 before, which kept a
    // main of 28) and every theme of it is that long (restated in the merge
    // round, Reconcile 1).
    const mains = t.arrangement.sections.filter(s => s.kind === 'main');
    const events = programOf(t).events, main = mains.length ? mains : t.arrangement.sections.filter(s => s.kind === 'drop');
    assert.ok(main.length, `${p.id}: no main and no drop`);
    const inMain = e => main.some(s => e.bar >= s.startBar && e.bar < s.startBar + s.bars);
    // (the kick role's rows: the record's kick and the kit's long and punchy
    // ones, the fast broken place's tight kick since DNB-2, and the deep
    // half-time place's knock since the DUB rounds, where the roles pass swaps
    // the drawn kick for it; the backbeat's rows include that place's drier snare;
    // and the liquid kit's kick, snare and ghost since 10-06, the kit stepping
    // aside for the parts a pinned row writes)
    for (const [role, voices] of [['kick', ['kick', 'kickLong', 'kickPunch', 'kickTight', 'kickKnock', 'kickPunchHigh']], ['backbeat', ['snare', 'snareDry', 'snareCrack', 'snareGhost', 'rimshot', 'clap']]]) {
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

// --- the small things as rows (round T1, PLAN-TREATMENTS) ------------------

const DNB = parseSpell('em:0.95,sp:0.85,ze:0.60,ro:0.75,ve:0.60,ti:0.45');

test('the treatment rows: the eleven figures the code played in the draw\'s order, the six admitted after them at a half, the mains pass\'s nine boxed to the house, the candidates at nought, each pinnable and named on the readout', () => {
  const vocab = vocabularyOf(style, registry);
  const scoped = [...TREATMENT_LIBRARY, ...TREATMENT_CANDIDATES, ...SECTION_LIBRARY, ...SEAM_CANDIDATES];
  for (const r of scoped) {
    assert.deepEqual(validate(r, vocab), [], r.id);
    assert.match(r.id, /^[a-z]+\/[a-z0-9-]+$/);
    assert.equal(recipeById(r.id.split('/')[1]), r, `${r.id}: its short name is ambiguous`);
    assert.ok(Number.isSafeInteger(r.revision) && r.revision >= 1);
    // The name is the word under the needle: short, lower-case, no genre word.
    assert.ok(r.name.length <= 24 && r.name === r.name.toLowerCase() && !/\b(dnb|drum and bass|house|techno|dub|trance|garage)\b/.test(r.name), `${r.id}: the name ${JSON.stringify(r.name)} is the ring's word`);
    // A figure is not a place in bird space — except the mains pass's, boxed to the house and its near places by tempo and Ember (round M1).
    if (r.id.startsWith('mains/')) assert.ok(r.tempo && r.tempo.bpm[1] < 140 && r.birds.ember && Object.keys(r.birds).length === 1, `${r.id}: a mains row is boxed to the house`);
    else assert.deepEqual(r.birds, {}, `${r.id}: a figure is not a place in bird space`);
    assert.ok(!JSON.stringify(r).includes('http'));
    assert.ok(typeof r.provenance.moved === 'string' && /T[12]|M1|DNB-\d|liquid-space/.test(r.provenance.moved), `${r.id}: provenance says when`);
  }
  // The library: the kinds the mechanism plays, at the weights the code had, in the order the code listed them (the draw's order).
  assert.deepEqual(TREATMENT_LIBRARY.map(r => [r.applies, r.weight]), [
    ['switch-up', 3], ['switch-up', 3], ['switch-up', 2], ['switch-up', 2], ['switch-up', 1],
    ['turnaround', 1], ['turnaround', 1], ['turnaround', 1], ['fill', 1], ['fill', 1], ['drop-out', 1],
    // ...and the six mined rows admitted on 2026-10-02, at a half each, after the code's.
    ['fill', 0.5], ['fill', 0.5], ['turnaround', 0.5], ['turnaround', 0.5], ['turnaround', 0.5], ['drop-out', 0.5],
    // ...and the mains pass's nine (round M1), after them: five switch-ups for the four-floor, a turnaround, three on the line.
    ['switch-up', 1], ['switch-up', 0.5], ['switch-up', 1], ['switch-up', 1], ['switch-up', 0.5], ['turnaround', 1],
    ['drop-out', 1], ['drop-out', 1], ['drop-out', 1],
    // ...and the hats' own: three variations over a phrase's second half, a bar of rest before a line.
    ['variation', 1], ['variation', 1], ['variation', 1], ['drop-out', 1]]);
  for (const r of TREATMENT_LIBRARY.filter(r => r.weight === 0.5 && !r.id.startsWith('mains/'))) assert.ok(/^admitted 2026-10-02/.test(r.provenance.admitted), `${r.id}: an admitted row says when`);
  for (const r of TREATMENT_LIBRARY) assert.ok((PLAYED_KINDS as readonly string[]).includes(r.applies!), `${r.id}: a kind nothing plays`);
  // The candidates: nought and mined, so no draw reaches one; a lead-in or a seam refuses a pin in the plan's words.
  for (const r of [...TREATMENT_CANDIDATES, ...SEAM_CANDIDATES]) {
    assert.equal(r.weight, 0, `${r.id} weighs more than nought`); assert.equal(r.origin, 'mined');
  }
  for (const r of SEAM_CANDIDATES) assert.throws(() => recipeRequest(r), /playback is not implemented/);
  for (const r of TREATMENT_CANDIDATES.filter(r => !(PLAYED_KINDS as readonly string[]).includes(r.applies!))) assert.throws(() => recipeRequest(r), /not played yet/);
  assert.throws(() => recipeRequest({ ...TREATMENT_LIBRARY[0], figure: undefined }), /needs a figure/);
  // A playable row pinned under the fast broken key is heard on some bar of its kind's rule, and the readout names the bar by the row's name;
  // a mains row (round M1) at the house, where its kit and its box are.
  const playable = [...TREATMENT_LIBRARY, ...TREATMENT_CANDIDATES.filter(r => (PLAYED_KINDS as readonly string[]).includes(r.applies!))];
  for (const r of playable) {
    let heard = 0;
    const mains = r.id.startsWith('mains/');
    for (const [seed, n] of mains ? [[1, 0], [2, 2], [3, 1]] : [[1, 0], [7, 0], [5555, 0]]) {
      const t = quietly(() => planTheme(seed, n, mains ? { ...opts, recipe: r } : { strategy: 'house-v2', spell: DNB, recipe: r }));
      const named = t.timeline.filter(row => row.sub === r.name);
      heard += named.length;
      assert.ok(t.timeline.every(row => !row.sub || row.sub === r.name), `${r.id}: another small thing played beside the pin`);
    }
    assert.ok(heard > 0, `${r.id} was not heard on three themes at ${mains ? 'the house' : 'the fast broken key'}`);
  }
  // The house, unpinned, draws its share — since the mains pass every kind, the
  // switch-ups among the rows written for its four-floor — and names it.
  const names = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) for (const row of quietly(() => planTheme(seed, 0, opts)).timeline) if (row.sub) names.add(row.sub);
  const house = TREATMENT_LIBRARY.filter(r => r.applies !== 'switch-up' || r.place?.kit === 'four').map(r => r.name);
  assert.ok([...names].every(n => house.includes(n)), `the house drew ${[...names]}`);
  assert.ok([...names].some(n => TREATMENT_LIBRARY.some(r => r.id.startsWith('mains/') && r.name === n)), 'the house drew none of its own mains rows');
  assert.ok(names.size >= 2);
});

// --- the kinds of section as rows (round T2, PLAN-TREATMENTS step 4) --------

test('the section rows: the house\'s six reproduce its grammar one per kind, the mined rows are preferred by the fast broken place alone, and a row pinned plays for its kind', () => {
  // The house's six: one row per kind at weight 1, the record's own words on
  // the ring, and the style's grammar is read off them (`src/sections.ts`).
  assert.deepEqual(HOUSE_SECTIONS.map(r => [r.applies, r.name, r.weight]),
    [['intro', 'intro', 1], ['build', 'build', 1], ['main', 'main groove', 1], ['breakdown', 'breakdown', 1], ['drop', 'drop', 1], ['outro', 'outro', 1]]);
  for (const r of HOUSE_SECTIONS) {
    const kind = style.sections.kinds[r.applies];
    assert.equal(kind.row, r.id); assert.equal(kind.label, r.name); assert.equal(kind.floor, r.section.floor);
    assert.deepEqual(kind.admits, admitsOf(r.section.admits));
    // The pattern answers as the row's phrases say, the first entry that holds, over one to four phrases.
    for (let n = 1; n <= 4; n++) for (let i = 0; i < n; i++) {
      const at = i === 0 && n > 1 ? 'first' : i === n - 1 && n > 1 ? 'last' : n === 1 ? r.section.phrases[0].at === 'first' ? 'first' : 'last' : 'rest';
      const on = r.section.phrases.find(p => p.at === at).on;
      assert.deepEqual(Object.entries(kind.layers(i, n)).filter(([, v]) => v).map(([g]) => g).sort(), [...on].sort(), `${r.id} phrase ${i + 1} of ${n}`);
    }
  }
  // The record's answers, as the functions gave them: an intro of one phrase opens full, a breakdown of one phrase is its opening.
  assert.deepEqual(style.sections.kinds.intro.layers(0, 1), { kick: true, hatClosed: true, hatOpen: true, sixteenths: false, clap: true, bass: false, keys: false, pad: true });
  assert.deepEqual(style.sections.kinds.intro.layers(0, 2), { kick: true, hatClosed: true, hatOpen: false, sixteenths: false, clap: false, bass: false, keys: false, pad: false });
  assert.deepEqual(style.sections.kinds.breakdown.layers(0, 1), { kick: false, hatClosed: true, hatOpen: false, sixteenths: false, clap: false, bass: false, keys: true, pad: true });
  assert.deepEqual(style.sections.kinds.build.layers(0, 1).keys, true);
  assert.deepEqual(style.sections.kinds.build.layers(0, 2).keys, false);
  // The mined rows: at nought in the row, so no place draws one on its word alone; preferred by the fast broken places and nowhere else.
  // (round DNB-6's intro for mixing is authored and preferred by the form rows alone: see the form rows' test)
  const authored = ['dnb/dnb-mix-intro', 'dnb/dnb-exposed'];
  const mined = SECTION_LIBRARY.filter(r => !HOUSE_SECTIONS.includes(r) && !authored.includes(r.id));
  assert.deepEqual(mined.map(r => r.id), ['dnb/dnb-intro', 'dnb/dnb-main', 'dnb/dnb-breakdown', 'dnb/dnb-outro']);
  assert.deepEqual(SECTION_LIBRARY.filter(r => !HOUSE_SECTIONS.includes(r) && !mined.includes(r)).map(r => r.id), authored);
  for (const r of mined) { assert.equal(r.weight, 0, `${r.id} weighs more than nought`); assert.equal(r.origin, 'mined'); }
  const preferring = SECTIONS.filter(e => Object.keys(e.prefers).length);
  assert.equal(preferring.length, 2);
  for (const e of preferring) assert.deepEqual(Object.keys(e.prefers).sort(), mined.map(r => r.id).sort());
  assert.ok(SECTIONS.length > preferring.length, 'every other place keeps the rows\' own weights');
  // The house, unpinned: every section its own row, no die.
  for (let seed = 1; seed <= 6; seed++) {
    const t = quietly(() => planTheme(seed, 0, opts));
    assert.ok(t.arrangement.sections.every(s => s.row === `sections/${s.kind}` && !s.name), `the house drew ${t.arrangement.sections.map(s => s.row)}`);
    assert.ok(t.timeline.every(row => !row.sectionName));
  }
  // The fast broken key: the mined rows drawn, and the house's too, over twelve themes; a mined row names itself on the readout under the kind's word.
  const drawn = new Set(), own = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const t = quietly(() => planTheme(seed, 0, { strategy: 'house-v2', spell: DNB }));
    for (const s of t.arrangement.sections) {
      (s.row.startsWith('dnb/') ? drawn : own).add(s.row);
      if (s.row.startsWith('dnb/')) {
        const r = SECTION_LIBRARY.find(x => x.id === s.row);
        assert.equal(s.name, r.name); assert.equal(s.label, style.sections.kinds[s.kind].label);
        assert.ok(t.timeline.slice(s.startBar, s.startBar + s.bars).every(row => row.section === s.label && row.sectionName === r.name));
      }
    }
  }
  // since liquid-space (10-11) the key's form rows require their own intro, exposed passage and main (the mixing intro,
  // the harmony alone, the house's main) and leave the outro to the place's shares: the mined outro and the house's are drawn
  assert.ok(drawn.has('dnb/dnb-outro'), 'the mined outro never drawn at the fast broken key');
  assert.deepEqual([...drawn].filter(id => !mined.some(r => r.id === id)).sort(), [...authored].sort(), 'a row drawn at the fast broken key that no table prefers');
  assert.ok(['sections/main', 'sections/outro'].every(id => own.has(id)), 'the house\'s main and outro never drawn at the fast broken key');
  // A row pinned plays for its kind, at the house and under the key, on every section of the kind; the listener's marks (no block) cannot be pinned.
  for (const r of SECTION_LIBRARY) {
    assert.equal(recipeRequest(r).section, r);
    for (const spell of [HOUSE, DNB]) {
      const t = quietly(() => planTheme(3, 0, { strategy: 'house-v2', spell, recipe: r }));
      const of = t.arrangement.sections.filter(s => s.kind === r.applies);
      assert.ok(of.every(s => s.row === r.id), `${r.id} pinned and not played`);
      assert.ok(t.arrangement.sections.filter(s => s.kind !== r.applies).every(s => s.row.startsWith('sections/') || spell === DNB));
    }
  }
  assert.throws(() => recipeRequest({ ...SECTION_LIBRARY[0], section: undefined }), /needs a section block/);
});

// --- what a treatment or section row says is what plays (the review of 10-03, R03, R05) ---
test('a drop-out\'s spacing is played, a section admits a kind only where the player places it, and a letter\'s flags are booleans', () => {
  const vocab = vocabularyOf(style, registry);
  const drop = TREATMENT_LIBRARY.find(r => r.id === 'small/drop-out')!;
  // `every` on the lines placement: the lines that many bars from the section's start, on the sixteen-bar grid.
  const main = { sections: [{ index: 0, kind: 'main', startBar: 0, bars: 64, admits: { 'drop-out': ['lines'] } }] } as any;
  for (const [every, bars] of [[undefined, [15, 31, 47]], [16, [15, 31, 47]], [32, [31]], [64, []]] as const) {
    const row = { ...drop, place: { sections: ['main'], ...(every ? { every } : {}) } };
    assert.deepEqual(validate(row, vocab), [], `every ${every}`);
    assert.deepEqual(planSubSections(1, main, { ...NO_SUBS, dropOut: 1 }, { drums: true, broken: false, pinned: true }, [row]).map(s => s.startBar), bars, `every ${every}`);
  }
  assert.match(validate({ ...drop, place: { every: 8 } }, vocab).join(), /sixteen-bar line grid/);
  assert.match(validate({ ...TREATMENT_LIBRARY.find(r => r.applies === 'fill')!, place: { every: 16 } }, vocab).join(), /does not have/);
  // A kind the plan only names keeps its own reading of the field (the riser every two bars).
  for (const r of TREATMENT_CANDIDATES) assert.deepEqual(validate(r, vocab), [], r.id);
  // The table of placements is the player's: a section admitting one pair alone is laid one of that kind.
  const rows = [...TREATMENT_LIBRARY, ...TREATMENT_CANDIDATES].filter(r => (PLAYED_KINDS as readonly string[]).includes(r.applies!));
  const all = { switchUp: 1, switchBars: [16], turnaround: 1, fill: 1, dropOut: 1, crash: false, variation: 1, variationBars: [8] };
  for (const [kind, places] of Object.entries(PLACED_AT)) for (const where of places) {
    const arrangement = { sections: [{ index: 0, kind: 'main', startBar: 0, bars: 64, admits: { [kind]: [where] } }, { index: 1, kind: 'drop', startBar: 64, bars: 32 }] } as any;
    const subs = planSubSections(1, arrangement, all, { drums: true, broken: true, pinned: true }, rows.filter(r => r.applies === kind));
    assert.ok(subs.some(s => s.kind === kind), `${kind} at ${where} is not placed`);
  }
  // ...and a played kind at a placement nothing asks for is refused; a named kind's stays data.
  const section = SECTION_LIBRARY.find(r => r.applies === 'main')!;
  const admits = (a: object) => validate({ ...section, section: { ...section.section, admits: a } }, vocab).join();
  assert.match(admits({ fill: 'span' }), /nothing places a fill/);
  assert.match(admits({ variation: ['halves', 'lines'] }), /nothing places a variation/);
  assert.equal(admits({ 'lead-in': 'last', fill: 'last' }), '');
  // A letter's flags: true or false, never a word for one.
  const letters = (l: object) => validate({ ...drop, figure: { lanes: { kick: { mask: ['x...............'] } }, letters: { x: l } } }, vocab).join();
  assert.match(letters({ level: .8, ghost: 'false' }), /ghost is not true or false/);
  assert.match(letters({ level: .8, absolute: 0 }), /absolute is not true or false/);
  assert.equal(letters({ level: .8, ghost: false, absolute: true }), '');
});
