import assert from 'node:assert/strict';
import test from 'node:test';
import { recipesFor, planTheme, programOf } from '../src/mix.ts';
import { MOTIF_LIBRARY, recipeById } from '../src/recipes.ts';
import { recipeRequest } from '../src/recipe-request.ts';
import { HOUSE } from '../src/spell.ts';
import { familyOf, insideBox } from '../src/motif.ts';
import { createJournal } from '../src/journal.ts';
import { BY_NAME } from '@deep-house/engine/voices';
import { SECTION_LIBRARY, TREATMENT_LIBRARY, LIBRARY, GLIDE_LIBRARY, FORM_LIBRARY } from '../src/recipes.ts';
import { RIFF_ROWS, PHRASED_ROWS } from '../src/glide.ts';
import { KIT_ROWS } from '../src/kit.ts';
import { unperformed } from '../src/recipe-request.ts';
import { PLAYED_KINDS } from '../src/treatment.ts';
import { drawSectionRows } from '../src/sections.ts';
import { settleDrums } from '../src/library-draw.ts';
import { definitionOf, generationOf } from '../src/generation.ts';
import { generate } from '../src/generator.ts';
import { style as v2 } from '../src/styles/deep-house-v2.ts';
import { STRATEGIES } from '../src/strategies/index.ts';
import ROW_PLACES from '../src/row-places.json' with { type: 'json' };

const spell = Object.entries(HOUSE).map(([b,v]) => `${b}:${v}`).join(',');

test('a selected motif leaves birds at home, and explicit birds keep the full named request', () => {
  for (const row of MOTIF_LIBRARY) {
    const cast = recipesFor({strategy:'house-v2', search:`?recipe=${row.id}`});
    assert.equal(cast.track, row); assert.equal(cast.spell, null);
    const explicit = recipesFor({strategy:'house-v2', search:`?recipe=${row.id}&spell=${spell}`});
    assert.equal(explicit.track, row); assert.deepEqual(explicit.spell, HOUSE);
  }
  const row = recipeById('sub-room')!;
  assert.equal(recipesFor({strategy:'house-v2', search:`?recipe=${row.id}&spell=${spell}`}).track,row);
  assert.equal(recipesFor({spell:HOUSE}).track,null,'an explicit API spell does not consult the page');
  assert.throws(()=>recipesFor({search:'?recipe=missing'}), /not in this build/);
});

test('named motif recipes select and perform their actual family on independent seeds', () => {
  for (const seed of ['1','17','44','motif-listening']) for (const row of MOTIF_LIBRARY) {
    const track = planTheme(seed,0,{strategy:'house-v2',spell:HOUSE,recipe:row});
    const reference = planTheme(seed,0,{strategy:'house-v2',spell:HOUSE,motif:{family:row.id}});
    assert.equal(track.dice.motif,row.id);
    assert.equal(track.dice.motifRegister,row.applies);
    const motif = {degrees:String(track.dice.motifDegrees).split(' ').map(Number),
      cell:String(track.dice.motifCell).split(' ').map(Number), register:row.applies,
      accent:String(track.dice.motifDegrees).split(' ').map(()=>1)};
    assert.deepEqual(insideBox(motif as any,familyOf(row)!.box),[]);
    assert.deepEqual(programOf(track),programOf(reference),'public request must perform the same family as the isolated motif fixture');
  }
});

test('motif comparisons retain drums, harmony, tempo and non-target bass events', () => {
  const tracks = MOTIF_LIBRARY.map(recipe=>planTheme('44',0,{strategy:'house-v2',spell:HOUSE,recipe}));
  for (const t of tracks.slice(1)) {
    assert.equal(t.bpm,tracks[0].bpm); assert.equal(t.dice.progression,tracks[0].dice.progression);
    assert.deepEqual(t.timeline,tracks[0].timeline);
    // a bass out's marks follow the bass (U2b: its fill on its last bar, a swell into its line; a bass motif that holds
    // its line where another leaves it lays no out there), so the drums are compared off the bars of either's outs
    // (U2d: a theme's builds draw their gestures in line order, so an out one motif lays and another does not moves the
    // next build's gesture: the drums are compared off every build's bars of either, its lead-in and its line with them)
    const marked=new Set([t,tracks[0]].flatMap(x=>[...(x.phrasing?.outs??[]).flatMap(o=>[o.to-1,o.to]),...(x.phrasing?.builds??[]).flatMap(b=>[b.line-2,b.line-1,b.line])]));
    const drums=(x:typeof t)=>x.events.filter(e=>['drum','noise'].includes(BY_NAME[e.voice]?.family)&&!marked.has(e.bar));
    assert.ok(drums(t).length > 0); assert.deepEqual(drums(t),drums(tracks[0]));
  }
  const [lick,answer]=tracks.filter(t=>t.dice.motifRegister==='lead');
  const bass=(x:typeof lick)=>x.events.filter(e=>BY_NAME[e.voice]?.family==='bass');
  assert.ok(bass(lick).length > 0); assert.deepEqual(bass(lick),bass(answer));
  assert.notDeepEqual(lick.events,answer.events,'the lead phrases must actually differ');
});

test('unsupported or impossible explicit requests cannot masquerade as played recipes', () => {
  const row = MOTIF_LIBRARY[0];
  for (const scope of ['layer','seam']) {
    const recipe={...row,scope} as any;
    assert.throws(()=>recipesFor({spell:HOUSE,recipe}),/playback is not implemented/);
    assert.throws(()=>planTheme('1',0,{strategy:'house-v2',recipe}),/playback is not implemented/);
  }
  // A treatment row is played since round T1 (`src/treatment.ts`) and a section row since T2 (`src/sections.ts`);
  // a motif row relabelled either carries no figure, no section block, and says so.
  assert.throws(()=>recipesFor({spell:HOUSE,recipe:{...row,scope:'treatment'} as any}),/needs a figure/);
  assert.throws(()=>recipesFor({spell:HOUSE,recipe:{...row,scope:'section'} as any}),/needs a section block/);
  assert.throws(()=>planTheme('1',0,{strategy:'house-v2',recipe:{...row,scope:'section'} as any}),/needs a section block/);
  assert.throws(()=>recipeRequest({...row,wants:{motif:{}}}),/wants.motif/);
  assert.throws(()=>recipeRequest({...row,birds:{root:[.1,.3]}}),/scoped placement/);
  assert.throws(()=>planTheme('1',0,{strategy:'house-v1',recipe:row}),/no enabled/);
  assert.throws(()=>planTheme('1',0,{strategy:'house-v2',recipe:row,motif:{off:true}}),/cannot both/);
  const impossible={...row,wants:{motif:{...row.wants!.motif,onGrid:[.731,.732]}}};
  assert.throws(()=>planTheme('1',0,{strategy:'house-v2',recipe:impossible}),/no phrase can be rolled/);
});

test('journal restore distinguishes a different selected recipe at the same seed and theme', () => {
  const values=new Map<string,string>();
  const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>{values.delete(k);}};
  const place={seed:'44',theme:0,strategy:'house-v2',spell:HOUSE,recipe:'house/lick'};
  const j=createJournal({store});j.arrived(place,{bar:17,clock:0});
  assert.equal(createJournal({store}).load(place),true);
  assert.equal(createJournal({store}).load({...place,recipe:'house/answer'}),false);
  assert.equal(createJournal({store}).load({...place,recipe:undefined}),false);
});

// --- the executable recipe contract (round CX-C, the review of 10-03) -------

test('R01: a travelled row\'s ghosts are thinned over its mains and drops alone, and the settle says what it reached', () => {
  // Four bars of main, eight hits a bar (half of them ghosts), against a place at four: the same main settles
  // the same whether or not a quiet outro of a hundred ghosts follows it.
  const hit = (t: number, vel: number) => ({ t, voice: 'clap', layer: 'clap', p: { vel } });
  const fixture = (events: any[]) => ({ barSeconds: 1, arrangement: { sections: [{ kind: 'main', startBar: 0, bars: 4 }, { kind: 'outro', startBar: 4, bars: 100 }] }, events });
  const mains = () => Array.from({ length: 32 }, (_, i) => hit(i / 8, i % 2 === 0 ? 1 : .2));
  const place = fixture(Array.from({ length: 16 }, (_, i) => hit(i / 4, 1)));
  const alone = fixture(mains()), outro = fixture([...mains(), ...Array.from({ length: 100 }, (_, i) => hit(4 + i, .2))]);
  const a = settleDrums(alone as any, place as any, 1, v2)!, b = settleDrums(outro as any, place as any, 1, v2)!;
  const inMain = (row: any) => row.events.filter((e: any) => e.t < 4);
  assert.deepEqual(inMain(alone), inMain(outro), 'the outro moved the main');
  assert.equal(inMain(alone).length / 4, 4);
  for (const k of ['rowRate', 'placeRate', 'asked', 'achieved', 'dropped', 'levelDb', 'kickDb'] as const) assert.equal(a[k], b[k], `${k} read the outro`);
  assert.equal(a.asked, 4); assert.equal(a.achieved, 4);
  // the other sections take the mains' share and are counted apart
  assert.equal(a.elsewhere, 0); assert.equal(b.elsewhere, 100);
});

test('R02: a pinned section row is laid over the grammar by its definition, not its id, and one identity says so everywhere', () => {
  const main = SECTION_LIBRARY.find((r) => r.applies === 'main')!;
  const shipped = planTheme('44', 0, { strategy: 'house-v2', spell: HOUSE, recipe: main });
  assert.equal(shipped.sectionPin?.applied, false, 'the shipped row is the grammar\'s own');
  assert.equal(shipped.sectionPin?.asked, shipped.sectionPin?.grammar);
  const revised = { ...main, revision: (main.revision ?? 1) + 1, section: { ...main.section!, phrases: main.section!.phrases.map((p) => ({ ...p, on: [] })) } };
  const trace: any[] = [];
  const over = drawSectionRows(1, SECTION_LIBRARY, v2.sections, null, revised, trace);
  assert.equal(over.get('main'), revised);
  assert.equal(trace[0].applied, true); assert.notEqual(trace[0].asked, trace[0].grammar);
  const plan = planTheme('44', 0, { strategy: 'house-v2', spell: HOUSE, recipe: revised });
  assert.notEqual(JSON.stringify(plan.events), JSON.stringify(shipped.events), 'the new revision was not heard');
  // one identity for a row everywhere: the same id at another revision or content is another definition
  assert.equal(definitionOf(main), definitionOf({ ...main }));
  assert.notEqual(definitionOf(main), definitionOf(revised));
  assert.notEqual(definitionOf(main), definitionOf({ ...main, name: `${main.name} ` }));
});

test('R04: a section or treatment row refuses the fields its player does not perform, with the reason', () => {
  const treatment = TREATMENT_LIBRARY.find((r) => r.applies === 'drop-out')!;
  const section = SECTION_LIBRARY.find((r) => r.applies === 'main')!;
  for (const row of [treatment, section]) {
    assert.doesNotThrow(() => recipeRequest(row));
    assert.throws(() => recipeRequest({ ...row, forbids: ['kick'] }), /cannot audition forbids \(a local exclusion/);
    assert.throws(() => planTheme('44', 0, { strategy: 'house-v2', spell: HOUSE, recipe: { ...row, forbids: ['kick'] } }), /cannot audition forbids/);
    assert.throws(() => recipeRequest({ ...row, wants: { tone: { bassline: 'full' } } } as any), /cannot audition wants/);
  }
  assert.throws(() => recipeRequest({ ...section, birds: { root: [.1, .3] } } as any), /cannot audition birds/);
  // every played row of both scopes carries only what is performed
  for (const row of [...TREATMENT_LIBRARY, ...SECTION_LIBRARY].filter((r) => r.scope === 'section' || (PLAYED_KINDS as readonly string[]).includes(r.applies ?? '')))
    assert.deepEqual(unperformed(row), [], row.id);
});

test('the September faults: a place\'s swap of a lane\'s sound passes the recipe\'s forbids and explicit tone, refused on the plan', () => {
  const probe = (wants: any, forbids: string[]) => ({ schema: 1, id: 'probe/contract', scope: 'track', applies: null, name: 'Contract probe', origin: 'listener', birds: {}, wants, forbids }) as any;
  const spellOf = (s: Record<string, number>) => ({ ...HOUSE, ...s });
  // forbids: the place's held layer would be a keyboard voice
  const kb = generate({ style: v2, seed: 1, bars: 64, bpm: 140, spell: spellOf({ ember: .88, root: .6, zephyr: .5, veil: .6 }), recipe: probe({}, ['keyboard']) }) as any;
  assert.equal(kb.events.filter((e: any) => BY_NAME[e.voice]?.family === 'keyboard').length, 0);
  assert.ok(kb.admission?.some((a: any) => a.at === 'lane sound' && a.why === 'the recipe forbids keyboard'));
  // tone: the place's bass would be a voice without the character's controls, so the lane keeps one with them
  const heard = ['full', 'defined'].map((tone) => generate({ style: v2, seed: 1, bars: 64, bpm: 128,
    spell: spellOf({ ember: .75, root: .6, zephyr: .5, veil: .6 }), recipe: probe({ tone: { bassline: tone } }, []) }) as any);
  for (const t of heard) assert.ok(t.admission?.some((a: any) => a.at === 'bass sound' && /tone/.test(a.why)));
  const bass = (t: any) => JSON.stringify(t.events.filter((e: any) => e.layer === 'bass'));
  assert.notEqual(bass(heard[0]), bass(heard[1]), 'an explicit tone was dropped');
  // with no recipe nothing is read and nothing is written
  assert.equal((generate({ style: v2, seed: 1, bars: 64, bpm: 140, spell: spellOf({ ember: .88, root: .6, zephyr: .5, veil: .6 }) }) as any).admission, undefined);
});

test('the generation stamp reads the library\'s weights, the place table and every row\'s content, the place tables\' rows too', () => {
  const before = generationOf(v2);
  const row = LIBRARY.find((r) => r.scope !== 'track') ?? LIBRARY[0];
  const was = row.weight;
  try { (row as any).weight = (Number.isFinite(was) ? was! : 1) + 1; assert.notEqual(generationOf(v2), before, 'a library weight'); }
  finally { (row as any).weight = was; if (was === undefined) delete (row as any).weight; }
  const near = ROW_PLACES.near;
  try { (ROW_PLACES as any).near = near + .01; assert.notEqual(generationOf(v2), before, 'row-places.json'); }
  finally { (ROW_PLACES as any).near = near; }
  assert.equal(generationOf(v2), before);
  // a row's content, revision or none: a library row's, and each place-table row's (review of 10-08, A4)
  const content = (label: string, edit: () => () => void) => {
    const undo = edit();
    try { assert.notEqual(generationOf(v2), before, label); } finally { undo(); }
    assert.equal(generationOf(v2), before, `${label}: undone`);
  };
  const touch = (o: any, key: string, value: unknown) => () => { const was = o[key]; o[key] = value; return () => { o[key] = was; }; };
  content('a library row\'s content', touch(row, 'name', `${row.name} (edited)`));
  content('a riff row\'s content', touch((RIFF_ROWS[0] as any).wants.riff, 'moveP', (RIFF_ROWS[0] as any).wants.riff.moveP + 0.01));
  content('the phrased row\'s content', touch((PHRASED_ROWS[0] as any).wants.phrased.outro, 'restBars', (PHRASED_ROWS[0] as any).wants.phrased.outro.restBars + 1));
  content('a kit row\'s content', touch((KIT_ROWS[0] as any).wants.kit, 'minP', (KIT_ROWS[0] as any).wants.kit.minP + 0.01));
  content('a glide row\'s content', touch((GLIDE_LIBRARY[0] as any).wants.motif.glide, 'pedal', !(GLIDE_LIBRARY[0] as any).wants.motif.glide.pedal));
  content('a form row\'s content', touch(FORM_LIBRARY[0] as any, 'name', `${FORM_LIBRARY[0].name} (edited)`));
  // the record draws from neither, and its stamp does not read them
  const v1 = generationOf(STRATEGIES['house-v1'].style);
  try { (row as any).weight = 99; assert.equal(generationOf(STRATEGIES['house-v1'].style), v1); }
  finally { (row as any).weight = was; if (was === undefined) delete (row as any).weight; }
});
