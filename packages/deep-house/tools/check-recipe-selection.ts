import assert from 'node:assert/strict';
import test from 'node:test';
import { recipesFor, planTheme, programOf } from '../src/mix.ts';
import { MOTIF_LIBRARY, recipeById } from '../src/recipes.ts';
import { recipeRequest } from '../src/recipe-request.ts';
import { HOUSE } from '../src/spell.ts';
import { familyOf, insideBox } from '../src/motif.ts';
import { createJournal } from '../src/journal.ts';
import { BY_NAME } from '@deep-house/engine/voices';

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
    const drums=(x:typeof t)=>x.events.filter(e=>['drum','noise'].includes(BY_NAME[e.voice]?.family));
    assert.ok(drums(t).length > 0); assert.deepEqual(drums(t),drums(tracks[0]));
  }
  const [lick,answer]=tracks.filter(t=>t.dice.motifRegister==='lead');
  const bass=(x:typeof lick)=>x.events.filter(e=>BY_NAME[e.voice]?.family==='bass');
  assert.ok(bass(lick).length > 0); assert.deepEqual(bass(lick),bass(answer));
  assert.notDeepEqual(lick.events,answer.events,'the lead phrases must actually differ');
});

test('unsupported or impossible explicit requests cannot masquerade as played recipes', () => {
  const row = MOTIF_LIBRARY[0];
  for (const scope of ['section','layer','seam','treatment']) {
    const recipe={...row,scope} as any;
    assert.throws(()=>recipesFor({spell:HOUSE,recipe}),/playback is not implemented/);
    assert.throws(()=>planTheme('1',0,{strategy:'house-v2',recipe}),/playback is not implemented/);
  }
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
