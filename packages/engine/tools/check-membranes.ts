import assert from 'node:assert/strict';
import test from 'node:test';
import { membraneSpec, membraneControls, MEMBRANE_CONTROLS } from '../src/voices/congas.ts';
import { INSTRUMENTS } from '../src/params.ts';

test('optional membrane controls preserve the original articulations and settings',()=>{
  const settings=structuredClone(INSTRUMENTS.conga),before=structuredClone(settings);
  const open=membraneSpec(settings,{}),low=membraneSpec(settings,{tuning:'low'}),slap=membraneSpec(settings,{hit:'slap'});
  assert.equal(open.key,'high:open');assert.equal(open.hz,258);assert.equal(open.drop,1.26);
  assert.equal(open.bodyLp,2600);assert.equal(open.t10,.16);assert.equal(open.skin,undefined);
  assert.equal(low.hz,182);assert.equal(low.t10,.2);assert.equal(slap.t10,.055);
  const changed=membraneSpec(settings,{headHz:180,bend:1.01,skin:1,damping:.28});
  assert.equal(changed.hz,180);assert.equal(changed.drop,1.01);assert.equal(changed.skin,1);
  assert.ok(changed.seconds>=changed.t10*5);assert.deepEqual(settings,before);
  assert.deepEqual(membraneSpec(settings,{vel:.5,gain:2}),open);
});

test('each membrane colour owns its cache identity and controls are taken into their ranges',()=>{
  const base={headHz:210,skin:1},key=membraneSpec(INSTRUMENTS.conga,base).key;
  for(const [control,{min:lo,max:hi}] of Object.entries(MEMBRANE_CONTROLS)){
    for(const value of [NaN,Infinity])assert.deepEqual(membraneControls({[control]:value}),{});
    assert.deepEqual(membraneControls({[control]:lo-1}),{[control]:lo});
    assert.deepEqual(membraneControls({[control]:hi+1}),{[control]:hi});
    assert.notEqual(membraneSpec(INSTRUMENTS.conga,{...base,[control]:lo}).key,
      membraneSpec(INSTRUMENTS.conga,{...base,[control]:hi}).key,control);
  }
  assert.equal(membraneSpec(INSTRUMENTS.conga,{skin:1,headHz:210}).key,key);
  assert.notEqual(membraneSpec({...INSTRUMENTS.conga,slapQ:2},base).key,key);
});
