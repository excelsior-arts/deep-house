import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme, programOf } from '../src/mix.ts';
import { HOUSE } from '../src/spell.ts';
import { recipeById } from '../src/recipes.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { developmentFor, developmentOf } from '../src/development.ts';
import { prepareRhythmDevelopment, rhythmDevelopmentProblems, rhythmPhaseAt, rhythmPickup } from '../src/development-rhythm.ts';
import type { Recipe } from '../src/recipe.ts';
import { blessed, fixture, hashOf, rowNamed } from './fixtures/programs.ts';

const piano=fixture('calm-piano-part-02'), chords=fixture('ringing-chords-01');
const opts={strategy:'house-v2',spell:HOUSE,accompaniment:'auto' as const};
const policy=style.development!.rhythm!,shape=style.development!.shape!;

test('current contours lock bass support and catalogue percussion',()=>{
  for(const name of ['calm-piano-02/shaped/6','pump/shaped/4','calm-piano-02/shaped/4'])
    assert.equal(hashOf(rowNamed(name)),blessed(name),`${name}: re-bless with the reason if the ordinary style moved`);
});

test('the groove develops in its second half and the bridge ends with one grid-locked pickup',()=>{
  const fallback={...style,composition:{...style.composition,families:style.composition.families.filter(f=>f.id!=='percussion')}};
  for(const seed of [4,6]){
    const old=planTheme(seed,0,{...opts,style:fallback,recipe:piano,development:'shaped'});
    const t=planTheme(seed,0,{...opts,style:fallback,recipe:piano,development:'percussion'});
    assert.deepEqual(t.arrangement,old.arrangement);
    assert.deepEqual(t.events.filter(e=>e.part===piano.id),old.events.filter(e=>e.part===piano.id));
    const first=t.arrangement.sections.find(s=>s.kind==='main')!;
    const hits=(from:number,to:number)=>t.events.filter(e=>e.layer==='shaker'&&e.bar>=from&&e.bar<to);
    assert.ok(hits(first.startBar,first.startBar+16).length>0);
    assert.ok(hits(first.startBar+16,first.startBar+32).length>hits(first.startBar,first.startBar+16).length);
    const pickups=t.arrangement.sections.filter(s=>s.kind==='bridge').map(s=>s.startBar+s.bars-1);
    for(const bar of pickups) {
      const kick=t.events.filter(e=>e.layer==='kick'&&e.bar===bar);
      assert.deepEqual(kick.map(e=>e.step),policy.kickPickup.steps);
      assert.ok(kick.every(e=>Math.abs(e.t-(bar+e.step/16)*t.barSeconds)<1e-8));
      assert.ok(hits(bar,bar+1).length>=7);
    }
    assert.deepEqual(t.events.filter(e=>e.layer==='kick'&&!pickups.includes(e.bar)),
      old.events.filter(e=>e.layer==='kick'&&!pickups.includes(e.bar)));
    assert.equal(t.arrangement.handoverNotBefore,old.arrangement.handoverNotBefore);
  }
});

test('an explicit rhythm role and prohibited families remain protected',()=>{
  assert.equal(prepareRhythmDevelopment(style,policy,[],['sixteenth'],[]),null);
  assert.equal(prepareRhythmDevelopment(style,policy,[],[],['noise']),null);
  const ensemble=prepareRhythmDevelopment(style,policy,[],[],[])!;
  assert.equal(ensemble.lanes.length,2);
  assert.ok(ensemble.lanes.every(r=>r.lane.voices?.some(v=>v.w>0)));
  assert.ok(ensemble.lanes.every(r=>r.lane.voices?.filter(v=>v.w>0).every(v=>!['cowbell','tambourine','tom'].includes(v.v))));
  // The palette may not draw what the strategy's ear has flagged: the flagged
  // list is binding on every side table, not only on the ordinary lanes.
  const flagged=style.flagged.map(f=>f.id);
  assert.ok(Object.entries(policy.candidateWeights).every(([id,w])=>!w||!flagged.includes(id)));
  for(const id of flagged.filter(id=>style.lanes.some(l=>l.role===policy.role&&l.voices?.some(e=>e.v===id))))
    assert.match(rhythmDevelopmentProblems({...policy,candidateWeights:{...policy.candidateWeights,[id]:.5}},style).join(),/flagged/);
  const pin:Recipe={...piano,id:'study/pinned-drum',applies:'kick',wants:{rhythm:{kick:[{bars:1,steps:[0,4,8,12],accents:[.8,.8,.8,.8],families:['drum']}]}}};
  // Wherever the development's pickup bar opens the kick (an empty rest; a
  // rest the pad supports keeps the kick out), a pinned kick keeps its own cell
  // instead of the development's pickup figure.
  let pickups=0;
  const kickGate=style.lanes.find(l=>l.role==='kick')!.gate!;
  for(const seed of [4,6,18,71,102]){
    const t=planTheme(seed,0,{...opts,recipe:pin,development:'percussion'}),trace=JSON.parse(String(t.dice.developmentShape));
    for(let bar=0;bar<t.bars;bar++) if(rhythmPhaseAt(t.arrangement,trace,bar,policy,shape.grooveKind,shape.restKind)==='pickup'
      &&t.timeline[bar].layers.includes(kickGate)){
      pickups++;
      assert.deepEqual(t.events.filter(e=>e.part===pin.id&&e.bar===bar).map(e=>e.step),[0,4,8,12]);
    }
  }
  assert.ok(pickups>0);
});

test('rhythmic development is deterministic, rests at the tail, and preserves contour settling',()=>{
  for(const seed of [1,4,6,18,71,102])for(const recipe of [null,piano,recipeById('pump'),chords]){
    const t=planTheme(seed,0,{...opts,recipe,development:'percussion'});
    assert.deepEqual(programOf(t),programOf(planTheme(seed,0,{...opts,recipe,development:'percussion'})));
    const trace=JSON.parse(String(t.dice.developmentShape));
    for(const peak of trace.peaks)for(let bar=peak.to;bar<peak.settled;bar++)
      assert.equal(rhythmPhaseAt(t.arrangement,trace,bar,policy,shape.grooveKind,shape.restKind),'space');
    for(const s of t.arrangement.sections.filter(s=>s.kind==='outro'))
      assert.ok(!t.events.some(e=>e.layer==='shaker'&&e.bar>=s.startBar));
    // A drone in front withdraws the palette (one foreground, 09-22); a pin is
    // explicit and puts the drone behind it, so only an ordinary theme can.
    if(t.dice.scene==='drone-forward'){
      assert.equal(recipe,null);assert.equal(t.dice.rhythmDevelopmentWithheld,'scene');
      assert.ok(!t.events.some(e=>e.layer==='shaker'));continue;
    }
    const noise=t.events.filter(e=>e.voice==='cabasa');
    assert.ok(noise.length>0);assert.ok(new Set(noise.map(e=>e.p.vel)).size>10);
    assert.ok(noise.every(e=>e.t>=e.bar*t.barSeconds&&e.t<(e.bar+1)*t.barSeconds));
  }
});

test('the separate chord recipe uses soft complete voicings and the ringing character',()=>{
  for(const seed of [4,6,18,71]){
    const t=planTheme(seed,0,{...opts,recipe:chords,development:'percussion'});
    const notes=t.events.filter(e=>e.part===chords.id),groups=new Map<number,typeof notes>();
    for(const e of notes)groups.set(e.t,[...(groups.get(e.t)??[]),e]);
    assert.ok(groups.size>0);assert.ok([...groups.values()].every(g=>g.length===3));
    assert.ok(notes.every(e=>e.articulation==='struck'&&e.treatment==='none'&&e.p.ring>=3&&e.p.vel<.7));
    assert.ok(notes.every(e=>e.p.midi>=48&&e.p.midi<=96));
    assert.ok(!t.events.some(e=>e.layer==='pad'));
  }
});

test('the new request is validated independently and cannot reshape a complete arrangement',()=>{
  assert.equal(developmentFor({search:'?development=percussion'}),'percussion');
  assert.deepEqual(rhythmDevelopmentProblems(policy,style),[]);
  assert.throws(()=>developmentOf({...style,development:{...style.development!,rhythm:undefined}},'percussion'),/valid percussion/);
  assert.throws(()=>planTheme(4,0,{...opts,recipe:recipeById('deep-house'),development:'percussion'}),/complete arrangement/);
});


test('a pickup is end-aligned once and refuses an outro, short rest or non-groove successor',()=>{
  const part={bars:8,steps:[3],accents:[.2],families:['drum'],pickup:{bars:2,steps:[6,30],accents:[.1,.2]}};
  const t=planTheme(4,0,{...opts,recipe:chords,development:'percussion'});
  const s=t.arrangement.sections.find(s=>s.kind==='bridge')!;
  assert.equal(rhythmPickup(part,t.arrangement,s.startBar,'bridge','main'),null);
  assert.equal(rhythmPickup(part,t.arrangement,s.startBar+2,'bridge','main')!.offset,0);
  assert.equal(rhythmPickup(part,t.arrangement,s.startBar+3,'bridge','main')!.offset,16);
  assert.equal(rhythmPickup(part,t.arrangement,s.startBar+4,'bridge','main'),null);
  const short=structuredClone(t.arrangement);short.sections[s.index].bars=1;
  assert.equal(rhythmPickup(part,short,s.startBar,'bridge','main'),null);
  const ending=structuredClone(t.arrangement);ending.sections[s.index+1].kind='outro';
  assert.equal(rhythmPickup(part,ending,s.startBar+3,'bridge','main'),null);
});

test('the statement fold keeps a ringing phrase in one octave across its chord changes; the default is the heard bar fold',()=>{
  assert.equal(style.characters.figure.fold,'bar','the switch stays off until Eugene has heard it');
  const folded={...style,characters:{...style.characters,figure:{...style.characters.figure,fold:'statement' as const}}};
  const [low,high]=style.characters.figure.register;
  let changes=0;
  for(const seed of [4,6,18,71,102]){
    const t=planTheme(seed,0,{...opts,style:folded,recipe:chords});
    const notes=t.events.filter(e=>e.part===chords.id);
    assert.ok(notes.length>0&&notes.every(e=>e.p.midi>=low&&e.p.midi<=high));
    const tops=[...new Map(notes.map(e=>[e.t,notes.filter(n=>n.t===e.t).reduce((a,b)=>a.p.midi>=b.p.midi?a:b)])).values()];
    const statement=(bar:number)=>{const s=t.arrangement.sections.find(x=>bar>=x.startBar&&bar<x.startBar+x.bars)!;
      return `${s.index}:${Math.floor((bar-s.startBar)/chords.wants!.figures.figure.spacing.bars[0])}`;};
    for(let i=1;i<tops.length;i++) if(statement(tops[i-1].bar!)===statement(tops[i].bar!)){
      changes++;
      assert.ok(Math.abs(tops[i].p.midi-tops[i-1].p.midi)<12,`seed ${seed} bar ${tops[i].bar}: a statement leapt an octave`);
    }
    // Same notes, same times, same strength: only the octave choice differs.
    const heard=planTheme(seed,0,{...opts,recipe:chords}).events.filter(e=>e.part===chords.id);
    assert.deepEqual(notes.map(e=>[e.t,e.p.vel,e.p.midi%12]),heard.map(e=>[e.t,e.p.vel,e.p.midi%12]));
  }
  assert.ok(changes>100);
});
