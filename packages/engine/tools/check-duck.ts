import assert from 'node:assert/strict';
import test from 'node:test';
import {writeDuck, type AutomationTarget} from '../src/master.ts';
import {duckShape} from '../src/program.ts';
import type {Settings} from '../src/settings.ts';

const shape=duckShape({sidechain:{depthDb:-12,lowDepthDb:-8,attack:.005,minimumAt:.054,recoverBy:.95}} as Settings,.6);
function parameter() {
  const calls:Array<[string,number,number?]>=[];
  const p:AutomationTarget={value:1,setValueAtTime:(v,t)=>calls.push(['set',v,t]),
    linearRampToValueAtTime:(v,t)=>calls.push(['lin',v,t]),exponentialRampToValueAtTime:()=>{},
    cancelScheduledValues:t=>calls.push(['cancel',t])};
  return {p,calls};
}
test('a close kick continues the current recovery and removes the old future',()=>{
  const {p,calls}=parameter(),graph={param:()=>p},one=shape.filter(d=>d.p==='duckLow.gain');
  writeDuck(graph,one,1);writeDuck(graph,one,1.3);
  const depth=10**(-8/20),middle=depth+(1-depth)*.6;
  const held=middle+(1-middle)*(.299-.27)/(.57-.27);
  // The first trigger: a cancel that finds nothing, the set, the four legs.
  assert.deepEqual(calls.slice(0,2),[['cancel',1-.001],['set',1,1-.001]]);
  // The second lands mid-recovery: the future goes, the leg under way is
  // written back up to the trigger (it is where the gain had got to), and the
  // shape continues from there with no set, because there is nothing to step.
  assert.deepEqual(calls[6],['cancel',1.3-.001]);
  assert.ok(Math.abs(calls[7][1]-held)<1e-12);
  assert.deepEqual(calls[7],['lin',calls[7][1],calls[6][1]]);
  assert.equal(calls[8][0],'lin');
  assert.equal(calls.at(-1)![2],1.3+.57);
});
test('ordinary spacing preserves the shape and independent parameters never share recovery',()=>{
  const a=parameter(),b=parameter(),graph={param:(path:string)=>path==='duck.gain'?a.p:b.p};
  for(const at of [0,.6,1.2])writeDuck(graph,shape,at);
  for(const [path,{calls}]of [['duck.gain',a],['duckLow.gain',b]] as const){
    // Every trigger opens with a cancel at its own set; with the recovery over
    // by then it removes nothing, and the rest is the shape as written.
    const expected=[0,.6,1.2].flatMap(at=>shape.filter(d=>d.p===path).flatMap(d=>{
      const t=d.op==='set'?Math.max(0,at+d.dt):at+d.dt;
      return d.op==='set'?[['cancel',t],['set',d.v,t]]:[['lin',d.v,t]];
    }));
    assert.deepEqual(calls,expected);
  }
  const fresh=parameter();writeDuck({param:()=>fresh.p},shape.filter(d=>d.p==='duckLow.gain'),1.3);
  assert.equal(fresh.calls[1][1],1);
});
// An offline render writes every kick of a set onto one line whose clock stands
// at nought, so nothing folds: a read or a cut that walked the whole history
// made it quadratic — 4000 kicks took 800 ms to a second (the reconciled review
// of 09-24, R81). They are read from where the answer is now; the budget is
// stated here, five times what this machine takes and a fifth of what it took.
test('an offline render\'s ducks are written in linear time',()=>{
  const p=parameter().p,q=parameter().p,graph={param:(path:string)=>path==='duck.gain'?p:q};
  const t0=performance.now();
  for(let i=0;i<4000;i++)writeDuck(graph,shape,i*.5);
  const ms=performance.now()-t0;
  assert.ok(ms<150,`4000 kicks written in ${ms.toFixed(0)} ms, over the budget of 150`);
});
