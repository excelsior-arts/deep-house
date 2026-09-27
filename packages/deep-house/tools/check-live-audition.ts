import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSourceMix, makeSourceMixer, sourceGain, sourceLevel } from '@deep-house/engine/source-mix';
import { HOUSE } from '../src/spell.ts';
import { strategyById } from '../src/strategies/index.ts';
import { recipesFor, planTheme } from '../src/mix.ts';
import { lanesOfTheme } from '../src/machine/model.ts';
import { rhythmProblems } from '../src/parts/rhythm.ts';

const recipe:any={schema:1,id:'test/live',scope:'track',applies:null,name:'Live',origin:'listener',birds:{tide:[.4,.7]}};

test('explicit dice retain the full recipe in the ordinary mix',()=>{
  const got=recipesFor({masterSeed:'fixed',strategy:'house-v2',spell:HOUSE,recipe});
  assert.equal(got.track,recipe);assert.equal(got.name,recipe.name);assert.equal(got.spell,HOUSE);
  assert.equal(recipesFor({spell:HOUSE}).track,null);
});
test('instrument mixing gates dry and sends independently on a shared bus, keeping lazy returns lazy',()=>{
  let halls=0,disconnected=0;
  const targets:any={dry:{},delay:{},reverb:{},room:{},get hall(){halls++;return{};},background:{},immersed:{}};
  const nodes:any[]=[];
  const ctx:any={currentTime:4,createGain(){const n={gain:{value:1,cancelScheduledValues(){},setValueAtTime(v:number){this.value=v;},linearRampToValueAtTime(v:number){this.value=v;}},connect(){},disconnect(){disconnected++;}};nodes.push(n);return n;}};
  const clean={mute:[],solo:[],dry:[]};
  const mixer=makeSourceMixer(ctx,{melodic:targets},clean);
  const piano=mixer.output('piano','melodic'),vocal=mixer.output('vocal','melodic');
  assert.equal(halls,0);assert.equal(nodes.length,0);
  const pd:any=piano.dry,vd:any=vocal.dry,vr:any=vocal.reverb;
  mixer.set({mute:[],solo:['piano'],dry:[]});
  assert.equal(pd.gain.value,1);assert.equal(vd.gain.value,0);assert.equal(vr.gain.value,0);
  mixer.set({mute:['piano'],solo:['piano','vocal'],dry:['vocal']});
  assert.equal(pd.gain.value,0);assert.equal(vd.gain.value,1);assert.equal(vr.gain.value,0);
  assert.equal((vocal.hall as any).gain.value,0);assert.equal(halls,1);
  mixer.set(clean);assert.equal(pd.gain.value,1);assert.equal(vr.gain.value,1);
  mixer.set({...clean,gain:{piano:.95,vocal:.5}});
  assert.equal(pd.gain.value,.95);assert.equal(vd.gain.value,.5);assert.equal(vr.gain.value,.5);
  assert.equal((piano.room as any).gain.value,.95,'newly connected sends inherit the volume');
  mixer.set({...clean,gain:{piano:.95,vocal:.5},dry:['vocal'],mute:['piano']});
  assert.equal(pd.gain.value,0);assert.equal(vd.gain.value,.5);assert.equal(vr.gain.value,0);
  mixer.set(cleanSourceMix());assert.equal(pd.gain.value,1);assert.equal(vr.gain.value,1);
  assert.equal(mixer.output('piano','melodic'),piano);
  assert.throws(()=>mixer.output('other','missing'),/Unknown source bus/);
  mixer.dispose();assert.equal(disconnected,nodes.length);
  assert.equal(sourceGain({mute:[],solo:['piano'],dry:[]},'vocal','dry'),0);
});
test('source volume is bounded, zero is silence, and absent levels preserve unity',()=>{
  const clean=cleanSourceMix();
  assert.equal(sourceLevel(clean,'piano'),1);
  for(const [input,expected] of [[0,0],[-1,0],[.95,.95],[2,2],[8,2],[NaN,1],[Infinity,1]])
    assert.equal(sourceGain({...clean,gain:{piano:input}},'piano','dry'),expected);
  assert.equal(sourceGain({...clean,gain:{piano:0}},'piano','hall'),0);
  assert.equal(sourceGain({...clean,gain:{piano:.5}},'vocal','reverb'),1);
});
test('a long drum cell preserves one whole interval of silence without shifted kicks',()=>{
  const steps=Array.from({length:64},(_,i)=>i*4).filter(s=>s<56||s>=72);
  const cell={bars:16,steps,accents:steps.map(()=>.9),families:['drum']};
  assert.deepEqual(rhythmProblems({kick:[cell]}),[]);
  assert.equal(steps.length,60);assert.ok(steps.every(s=>s%4===0));
  assert.ok(rhythmProblems({kick:[{...cell,steps:[256],accents:[1]}]}).length);
});
test('an explicit instrument outside the ordinary lane palette gets a source box',()=>{
  const base=planTheme('source-box',0,{strategy:'house-v2'});
  const track={...base,events:[...base.events,{voice:'wordlessVocal',layer:'pad',bar:0,step:0,t:0,p:{midi:60,dur:.5,vel:.5}}]};
  const rows=lanesOfTheme({track,bar:0} as any);
  const vocal=rows.find(r=>r.id==='wordlessVocal');
  assert.deepEqual(vocal?.playing,['wordlessVocal']);
  assert.equal(vocal?.bus,'melodic');assert.equal(vocal?.group,'mid');
});
test('a lane that shares an instrument lights for its own gate and never for the other lane\'s notes',()=>{
  // offbeat and offbeatOpen draw from one list on one layer, so a closed hat
  // is either lane's voice; what says which lane is sounding is the gate
  const t=planTheme('5',0,{strategy:'house-v2'});
  let quietWhileShared=0;
  for(let bar=0;bar<t.bars;bar++){
    const rows=lanesOfTheme({track:t,bar} as any);
    const gates=t.timeline[bar]?.layers??[];
    for(const r of rows) if(r.gate&&r.figure!=='part') assert.equal(r.on,gates.includes(r.gate),`bar ${bar}: ${r.id} is lit ${r.on} with its gate ${r.gate} ${gates.includes(r.gate)?'open':'shut'}`);
    const open=rows.find(r=>r.id==='offbeatOpen');
    if(open&&!open.on&&open.firing>0)quietWhileShared++;
  }
  assert.ok(quietWhileShared>0,'no bar of seed 5 has the open-hat lane shut while the closed hat plays, so this proves nothing');
});
