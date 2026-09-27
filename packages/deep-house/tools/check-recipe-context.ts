import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme, programOf, setLayout } from '../src/mix.ts';
import { recipeById } from '../src/recipes.ts';
import { HOUSE } from '../src/spell.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { developmentFor, developmentOf, developmentQuantum, developArrangement } from '../src/development.ts';
import { resolveParts } from '../src/parts/resolve.ts';
import { emptyParts } from '../src/parts/types.ts';
import { sectionsFrom } from '../src/arrangement.ts';
import { createJournal } from '../src/journal.ts';
import { strategyById } from '../src/strategies/index.ts';
import { attacksPerCycle, blessed, fixture, hashOf, rowNamed } from './fixtures/programs.ts';

const original = fixture('calm-piano-part-01'), piano = fixture('calm-piano-part-02');
const opts = { strategy: 'house-v2', spell: HOUSE, accompaniment: 'auto' as const };

test('current assembly programs retain their pinned parts with adopted accompaniment', () => {
  for (const name of ['pump/auto/4', 'calm-piano-01/auto/4', 'calm-piano-01/auto/6'])
    assert.equal(hashOf(rowNamed(name)), blessed(name), `${name}: re-bless with the reason if the ordinary style moved`);
});

test('separation preserves the whole phrase while excluding held notes and dry releases from its sections', () => {
  for (const seed of [4,6,17,44]) {
    const before=planTheme(seed,0,{...opts,recipe:original}), after=planTheme(seed,0,{...opts,recipe:piano});
    assert.deepEqual(after.events.filter(e=>e.part===piano.id),before.events.filter(e=>e.part===piano.id));
    assert.deepEqual(after.arrangement,before.arrangement);
    const reservation: number[]=JSON.parse(String(after.dice.composition)).support.reservedBars;
    const pads=after.events.filter(e=>e.layer==='pad');
    assert.ok(reservation.length>0);
    for(const pad of pads) for(const bar of reservation)
      assert.ok(pad.t+Number(pad.p.dur)+Number(pad.p.release)<=bar*after.barSeconds || pad.t>=(bar+1)*after.barSeconds);
    // seed 6's first main (bars 28-44 of it held the case before round S19 cut
    // the mains; the main is bars 4-40 since): the bed steps out of the figure's section
    if(seed===6) {
      assert.ok(before.events.some(e=>e.layer==='pad'&&e.bar>=4&&e.bar<40));
      assert.ok(!pads.some(e=>e.bar>=4&&e.bar<40));
      assert.ok(pads.length>0,'the bed still has sections where the figure rests');
    }
  }
});

test('support is a shared part requirement with validation, not a recipe or instrument special case', () => {
  const figure=piano.wants!.figures.figure;
  assert.equal(resolveParts({struckFigures:[figure]},style).errors.length,0);
  assert.ok(resolveParts({struckFigures:[{...figure,support:{sustained:'anything'}}]},style).errors.length);
  assert.ok(resolveParts({struckFigures:[figure]},{...style,composition:undefined} as typeof style).errors.length);
  const renamed={...piano,id:'study/unrelated-name'};
  const track=planTheme(6,0,{...opts,recipe:renamed});
  assert.ok(JSON.parse(String(track.dice.composition)).support.reservedBars.length);
});

test('developed ordinary and pinned tracks contain real contrast, bounded sections and complete ordered cycles', () => {
  for(const recipe of [null,recipeById('pump'),piano])for(const seed of [4,6,17,44,71,102]) {
    const t=planTheme(seed,0,{...opts,recipe,development:'phrased'}),p=programOf(t);
    assert.ok(t.bars<=style.development!.themeBarsMax);
    assert.deepEqual(p,programOf(planTheme(seed,0,{...opts,recipe,development:'phrased'})));
    for(const s of t.arrangement.sections.filter(s=>['main','drop'].includes(s.kind))) {
      assert.ok(s.bars<=32);
      if(recipe===piano) assert.equal(s.bars%16,0);
      if(s.bars>=16) {
        const claimed=JSON.parse(String(t.dice.composition)).recipes?.some(r=>r.roles.includes('sixteenth'));
        if (!claimed) assert.ok(!t.events.some(e=>e.layer==='shaker'&&e.bar>=s.startBar&&e.bar<s.startBar+8));
        else assert.ok(t.events.filter(e=>e.layer==='shaker').every(e=>e.part),'catalogue scores retain their own musical rests');
        assert.notDeepEqual(s.phrases[0].layers,s.phrases[1].layers);
      }
    }
    for(const s of t.arrangement.sections.filter(s=>s.kind==='bridge')) {
      assert.equal(s.bars,4);
      assert.ok(!t.events.some(e=>['kick','bass'].includes(e.layer)&&e.bar>=s.startBar&&e.bar<s.startBar+s.bars));
      assert.ok(!t.events.some(e=>e.part&&e.bar>=s.startBar&&e.bar<s.startBar+s.bars));
    }
    assert.ok(t.events.every(e=>Number.isFinite(e.t)&&e.t<t.bars*t.barSeconds));
  }
  const t=planTheme(4,0,{...opts,recipe:piano,development:'phrased'});
  assert.ok(t.arrangement.sections.some(s=>s.kind==='bridge'));
  const notes=t.events.filter(e=>e.part===piano.id);
  for(const s of t.arrangement.sections.filter(s=>['main','drop'].includes(s.kind)))
    for(let bar=s.startBar;bar<s.startBar+s.bars;bar+=16)
      assert.equal(notes.filter(e=>e.bar>=bar&&e.bar<bar+16).length,attacksPerCycle(piano.wants!.figures.figure),'every attack and chord landing survives each cycle');
});

test('adjacent full-groove labels share a budget, and short remainders never clip an ordered phrase', () => {
  const policy=style.development!;
  const base=sectionsFrom([{kind:'main',bars:24},{kind:'drop',bars:24},{kind:'main',bars:24}],style.sections);
  const parts={...emptyParts(),struckFigures:[piano.wants!.figures.figure]};
  const developed=developArrangement(base,style,policy,developmentQuantum(parts,policy),[],['sixteenths']);
  assert.deepEqual(developed.sections.map(s=>[s.kind,s.bars]),[['main',32],['bridge',4],['main',32]]);
  assert.equal(developed.sections[0].phrases[0].layers.sixteenths,true,'an explicit percussion pin is not thinned');
  assert.throws(()=>developmentQuantum({...parts,struckFigures:[{...parts.struckFigures[0],spacing:{bars:[8,16]}}]},policy),/fixed cycle/);
});

test('development survives query, set layout, link and journal boundaries and refuses complete arrangements', () => {
  assert.equal(developmentFor({search:'?development=phrased'}),'phrased');
  assert.equal(developmentFor({development:'base',search:'?development=phrased'}),'base');
  assert.throws(()=>developmentFor({search:'?development=unknown'}),/Unknown/);
  assert.throws(()=>developmentOf({...style,development:undefined} as typeof style,'phrased'),/no phrased/);
  assert.throws(()=>planTheme(4,0,{...opts,recipe:recipeById('deep-house'),development:'phrased'}),/complete arrangement/);
  const a=planTheme(4,0,{...opts,recipe:piano,search:'?development=phrased'});
  assert.deepEqual(programOf(a),programOf(planTheme(4,0,{...opts,recipe:piano,development:'phrased'})));
  const layout=setLayout(4,2,{...opts,recipe:piano,development:'phrased'});
  assert.ok(layout);
  const values=new Map<string,string>(),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const place={seed:'4',theme:0,strategy:'house-v2',spell:HOUSE,recipe:piano.id,development:'phrased' as const};
  createJournal({store}).arrived(place,{bar:25,clock:0});
  assert.equal(createJournal({store}).load(place),true);
  assert.equal(createJournal({store}).load({...place,development:'base'}),false);
});
