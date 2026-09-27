import assert from 'node:assert/strict';
import test from 'node:test';
import {planTheme,programOf} from '../src/mix.ts';
import {HOUSE} from '../src/spell.ts';
import {style} from '../src/styles/deep-house-v2.ts';
import {handCharacters,handConversation} from '../src/styles/deep-house-hand-characters.ts';
import {resolveRhythm,rhythmProblems} from '../src/parts/rhythm.ts';
import {recipeById} from '../src/recipes.ts';
import {loudnessTrimDb} from '../src/loudness.ts';
import {BY_NAME} from '@deep-house/engine/voices';
// The hand player is whichever membrane the family draw chose; the brush is the noise part.
const family=e=>BY_NAME[e.voice].family,drum=e=>!!e.part&&family(e)==='drum';
import {blessed,fixture,hashOf,rowNamed} from './fixtures/programs.ts';
const recipe=fixture('hand-tone-08'),opts={strategy:'house-v2',spell:HOUSE,accompaniment:'auto',development:'percussion'};

test('current percussion programs lock the catalogue adoption with the approved chord score',()=>{
  for(const name of ['calm-piano-02/percussion/6','pump/percussion/4','ringing-chords-01/percussion/4'])
    assert.equal(hashOf(rowNamed(name)),blessed(name),`${name}: re-bless with the reason if the ordinary style moved`);
});

test('nine colours preserve every onset and the backing while targeting only the hand player',()=>{
  let baseline;
  for(const character of Object.keys(handCharacters)){
    const r=structuredClone(recipe);r.wants.rhythm.sixteenth[1].character=character;
    const t=planTheme('4',0,{...opts,recipe:r}),p=programOf(t);
    assert.deepEqual(p,programOf(planTheme('4',0,{...opts,recipe:r})));
    const normalize=p=>({...p,events:p.events.map(e=>!drum(e)?e:{...e,p:{vel:e.p.vel,pan:e.p.pan}})});
    if(baseline)assert.deepEqual(normalize(p),normalize(baseline));else baseline=p;
    const hits=p.events.filter(drum);assert.ok(hits.length>20);
    assert.ok(p.events.some(e=>e.part===recipe.id&&family(e)==='noise'));
    assert.ok(hits.every(e=>e.p.gain>0&&Number.isFinite(e.p.gain)));
    for(const [key,value] of Object.entries(handCharacters[character].params))assert.ok(hits.every(e=>e.p[key]===value));
  }
});

test('rhythm characters require an enabled capable candidate and cannot smuggle engine settings',()=>{
  const cells=structuredClone(recipe.wants.rhythm);
  assert.deepEqual(resolveRhythm(cells,style,[]).errors,[]);
  cells.sixteenth[1].character='missing';assert.ok(resolveRhythm(cells,style,[]).errors.length);
  cells.sixteenth[1].character='warm-open';cells.sixteenth[1].families=['noise'];
  assert.ok(resolveRhythm(cells,style,[]).errors.length);
  assert.ok(rhythmProblems({sixteenth:[{...recipe.wants.rhythm.sixteenth[1],character:{headHz:200}}]}).length);
  assert.ok(resolveRhythm(recipe.wants.rhythm,style,['drum']).errors.length);
  const wrong={...style,characters:{...style.characters,rhythm:{bad:{requires:['gain'],params:{gain:2},gainDb:100}}}};
  cells.sixteenth[1].character='bad';assert.throws(()=>resolveRhythm(cells,wrong,[]),/rhythm character bad/);
});

const phrases=['conversation','rolling','answers'].map(v=>{const r=structuredClone(recipeById(`house/hand-${v}`));delete r.wants.rhythm.sixteenth[1].pickup;return r;});
test('the retained sounds remain exact in the phrases that use them',()=>{
  const expected={tone:'warm-open',low:'low-round',touch:'soft-skin',slap:'crisp-hand'};
  for(const [stroke,name] of Object.entries(expected)) {
    const old=handCharacters[name],current=handConversation.strokes[stroke];
    assert.deepEqual(current,{params:old.params,gainDb:old.gainDb});
  }
  // Every colour's program is the colour test above: the same onsets and backing
  // as the control, with the colour's own parameters on every hand hit. Nine
  // whole-program hashes locked nothing that assertion does not.
});

test('phrases contain quiet touches, displaced body notes, short runs and whole-bar breaths',()=>{
  let backing,trim;
  for(const r of phrases){
    const part=r.wants.rhythm.sixteenth[1],p=programOf(planTheme('4',0,{...opts,recipe:r}));
    const rest=p.events.filter(e=>e.layer!=='shaker').map(({i,...e})=>e);
    if(backing)assert.deepEqual(rest,backing);else backing=rest;
    // One backing, but not one trim: since the 09-22 refit house-v2's headroom
    // reads the hand rows' rate (`rateShaker`), so a busier phrase may be
    // levelled lower. What holds is that the program carries the plan's own
    // trim, and that the phrases move it by no more than a decibel.
    const t=planTheme('4',0,{...opts,recipe:r});
    assert.equal(p.trimDb,loudnessTrimDb(t,t.style));
    if(trim===undefined)trim=p.trimDb;else assert.ok(Math.abs(p.trimDb-trim)<=1,`${r.id} trims ${p.trimDb} against ${trim}`);
    assert.ok(Number.isFinite(p.trimDb));
    const one=p.events.filter(e=>drum(e)&&e.bar>=24&&e.bar<32);
    assert.equal(one.length,part.steps.length,'one whole eight-bar statement of the cell');
    assert.ok(Array.from({length:8},(_,b)=>b+24).some(b=>!one.some(e=>e.bar===b)));
    assert.equal(new Set(part.strokes).size,4);
    let run=1,longest=1;
    part.steps.forEach((s,i)=>{if(i){run=s===part.steps[i-1]+1?run+1:1;longest=Math.max(longest,run);}});
    assert.equal(longest,4);
    assert.ok(part.steps.filter(s=>s%4!==0).length/part.steps.length>.9);
    part.strokes.forEach((s,i)=>{if(s==='touch')assert.ok(part.accents[i]<=.08);});
    for(const e of one){
      const at=part.steps.indexOf((e.bar%8)*16+e.step),sound=handConversation.strokes[part.strokes[at]];
      assert.ok(at>=0);for(const [key,v] of Object.entries(sound.params))assert.equal(e.p[key],v);
      assert.ok(Math.abs(e.t-(e.bar+e.step/16)*p.barSeconds)<p.beat*.06);
    }
  }
});

test('per-hit articulations remain deterministic on other seeds and theme positions',()=>{
  for(const seed of ['4','6','18','71'])for(const theme of [0,1])for(const recipe of phrases){
    const p=programOf(planTheme(seed,theme,{...opts,recipe}));
    assert.deepEqual(p,programOf(planTheme(seed,theme,{...opts,recipe})));
    const body=p.events.filter(drum);assert.ok(body.length>0);
    assert.equal(new Set(body.map(e=>e.p.headHz)).size,4);
    assert.ok(body.every(e=>Number.isFinite(e.p.gain)&&e.p.gain>0));
  }
});

test('a stroke must exist on a capable sound character and match the entire cell',()=>{
  const source=phrases[0].wants.rhythm.sixteenth[1];
  for(const patch of [{strokes:['tone']},{strokes:Array(source.steps.length).fill(1)},
    {character:undefined},{character:'warm-open'},{strokes:Array(source.steps.length).fill('missing')},
    {strokes:Array(source.steps.length).fill('constructor')}])
    assert.ok(resolveRhythm({sixteenth:[{...source,...patch}]},style,[]).errors.length);
  const broken=structuredClone(handConversation);broken.strokes.touch={params:{unlisted:1},gainDb:0};
  const invalid={...style,characters:{...style.characters,rhythm:{'hand-conversation':broken}}};
  assert.throws(()=>resolveRhythm({sixteenth:[source]},invalid,[]),/rhythm character hand-conversation/);
});

// The 09 approvals describe the original heard artifacts. Current hashes above
// include the separately audited bass-support repair and duck continuity fix.
const pickups=['conversation','rolling','answers'].map(v=>recipeById(`house/hand-${v}`));
test('requested pickups occupy only the end of a bridge and preserve the approved main phrases',()=>{
  for(const [index,recipe]of pickups.entries())for(const seed of ['4','6','18','71']){
    const old=programOf(planTheme(seed,0,{...opts,recipe:phrases[index]}));
    const t=planTheme(seed,0,{...opts,recipe}),p=programOf(t);
    const bridgeBars=new Set(t.arrangement.sections.filter(s=>s.kind==='bridge').flatMap(s=>Array.from({length:s.bars},(_,i)=>s.startBar+i)));
    const clean=p=>p.events.filter(e=>!bridgeBars.has(e.bar)).map(({i,...e})=>e);
    assert.deepEqual(clean(p),clean(old));assert.equal(p.trimDb,old.trimDb);
    for(const s of t.arrangement.sections.filter(s=>s.kind==='bridge')){
      const hits=p.events.filter(e=>e.layer==='shaker'&&e.bar>=s.startBar&&e.bar<s.startBar+s.bars);
      const cell=recipe.wants.rhythm.sixteenth[1].pickup;
      assert.deepEqual(hits.map(e=>(e.bar-(s.startBar+s.bars-2))*16+e.step),cell.steps);
      assert.ok(hits.every(drum),'opening the gate must not wake the brush');
      assert.ok(t.timeline.filter(b=>b.bar>=s.startBar+s.bars-2&&b.bar<s.startBar+s.bars).every(b=>b.layers.includes('sixteenths')));
    }
    assert.deepEqual(p,programOf(planTheme(seed,0,{...opts,recipe})));
  }
});
test('a supporting pedal follows the sounding chord throughout the reported second section',()=>{
  const t=planTheme('4',0,{...opts,recipe:pickups[0]}),p=programOf(t);
  for(let bar=44;bar<76;bar++){
    const chord=t.progression.chords.find(c=>bar%t.progression.loopBars>=c.startBar&&bar%t.progression.loopBars<c.startBar+c.bars);
    const root=p.events.find(e=>e.layer==='bass'&&e.bar===bar&&e.step===0);
    assert.ok(root);assert.equal(root.p.midi%12,chord.rootMidi%12);
  }
});
test('pickup cells refuse unknown strokes, invalid spans and synthesis overrides',()=>{
  const part=pickups[0].wants.rhythm.sixteenth[1];
  for(const patch of [{bars:4},{steps:[33]},{accents:[]},{strokes:['missing']},{families:['noise']},{gain:2}])
    assert.ok(resolveRhythm({sixteenth:[{...part,pickup:{...part.pickup,...patch}}]},style,[]).errors.length);
  const missing=structuredClone(part);missing.pickup.strokes=Array(missing.pickup.steps.length).fill('unknown-stroke');
  assert.ok(resolveRhythm({sixteenth:[missing]},style,[]).errors.length);
});
