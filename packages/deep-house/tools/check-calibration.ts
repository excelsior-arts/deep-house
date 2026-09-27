import assert from 'node:assert/strict';
import test from 'node:test';
import { calibrationStatus, requireCurrentCalibration } from '../src/calibration.ts';
import { strategyById } from '../src/strategies/index.ts';
import { generationOf } from '../src/generation.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { recipesFor } from '../src/mix.ts';
import { spellFrom, type Recipe } from '../src/recipe.ts';
import Rng from '../src/rng.ts';
import { INTERPRETER } from '../src/interpret.ts';

const strategy=strategyById('house-v2'), old=strategy.legacyCalibration!;
test('historical calibration cannot make current reach claims',()=>{
  assert.equal(calibrationStatus(old,strategy.generation),'stale');
  assert.throws(()=>requireCurrentCalibration(old,strategy.generation),/calibration stale/);
  const fresh={...old,provenance:{...old.provenance,generation:strategy.generation}};
  assert.equal(calibrationStatus(fresh,strategy.generation,old.encoder),'current');
  assert.equal(calibrationStatus(fresh,strategy.generation,'different encoder'),'stale');
  assert.equal(calibrationStatus(null,strategy.generation),'missing');
  assert.notEqual(generationOf({...style,composition:{...style.composition,limits:{...style.composition.limits,sparseUpper:0}}}),strategy.generation);
  assert.notEqual(generationOf({...style,characters:{...style.characters,presence:{backgroundDb:-12}}}),strategy.generation);
});
test('the stamp reads code-valued style by its answers and refuses a shape it cannot read',()=>{
  const [name,kind]=Object.entries(style.sections.kinds).find(([,k])=>k.layers.length===2)!;
  const withKind=(layers:(...a:number[])=>Record<string,boolean>)=>({...style,sections:{...style.sections,
    kinds:{...style.sections.kinds,[name]:{...kind,layers}}}}) as typeof style;
  assert.notEqual(generationOf(withKind((i,n)=>({...kind.layers(i,n),pad:!kind.layers(i,n).pad}))),strategy.generation,
    'a section layer rule is part of the music');
  assert.equal(generationOf(withKind((i,n)=>kind.layers(i,n))),strategy.generation,
    'the same answers are the same music, whatever the source text');
  assert.throws(()=>generationOf(withKind((a)=>kind.layers(a,1))),/cannot read/);
});
test('the live map is never a stale one, and the legacy map ships once',()=>{
  // A live field that exists only to be refused is a misleading name: either a
  // map measured on this generator, or nothing.
  assert.notEqual(calibrationStatus(strategy.calibration,strategy.generation),'stale');
  assert.notEqual(strategy.calibration,old);
});
test('captured recipe interpretation retains the historical map',()=>{
  const row:Recipe={schema:1,id:'test/legacy',scope:'track',applies:null,name:'Legacy',origin:'listener',birds:{tide:[.6,.7]},interpreter:'v2.8'};
  const got=recipesFor({strategy:'house-v2',masterSeed:'9',search:'?recipe=test/legacy'},[row]);
  assert.deepEqual(got.spell,spellFrom(row,new Rng('9::spell'),old));
});
test('new captures never silently borrow historical calibration',()=>{
  const row:Recipe={schema:1,id:'test/current',scope:'track',applies:null,name:'Current',origin:'listener',birds:{tide:[.6,.7]},interpreter:INTERPRETER};
  for (const version of [INTERPRETER, undefined]) {
    const recipe={...row,interpreter:version};
    const cast=()=>recipesFor({strategy:'house-v2',masterSeed:'9',search:'?recipe=test/current'},[recipe]);
    if (calibrationStatus(strategy.calibration,strategy.generation)==='current') {
      assert.deepEqual(cast().spell,spellFrom(recipe,new Rng('9::spell'),strategy.calibration));
    } else assert.throws(cast,/calibration stale/);
  }
});
