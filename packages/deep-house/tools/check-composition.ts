import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme, recipesFor } from '../src/mix.ts';
import { programOf, stage, stageParams } from '../src/performance.ts';
import { composeParts, validateStyle } from '../src/composition.ts';
import { resolveParts } from '../src/parts/resolve.ts';
import { interpretWants } from '../src/interpret.ts';
import type { CompositionPolicy } from '../src/composition-policy.ts';
import { style, settings } from '../src/styles/deep-house-v2.ts';
import { HOUSE, BIRDS, biasFor } from '../src/spell.ts';
import { BY_NAME, voicePlaying } from '@deep-house/engine/voices';
import { layersAtBar } from '../src/arrangement.ts';
import { generate } from '../src/generator.ts';
import { FOCUS_SCENARIOS } from './review/focus.ts';
import { base as v1Base } from '../src/styles/deep-house.ts';
import { resolveSettings } from '@deep-house/engine/settings';
import { figureCandidates, phraseArch } from '../src/parts/figure.ts';
import { struckFigureProblems } from '../src/parts/validation.ts';
import { lanesOfTheme } from '../src/machine/model.ts';
import { insideBox, rollMotif, motifFromPath, readMotif, pathProblems, develop, motifFaults } from '../src/motif.ts';
import Rng from '../src/rng.ts';
import { rhythmProblems } from '../src/parts/rhythm.ts';
import { stepToBeats } from '../src/patterns.ts';

const choiceOf = (track: ReturnType<typeof planTheme>) => JSON.parse(String(track.dice.composition));
/** Ordinary themes whose composition drew the ringing keyboard part, first theme of each seed. */
const ringingThemes = (s: typeof style, spell: typeof HOUSE, want = 2) => {
  const out: { seed: string }[] = [];
  for (let i = 1; i <= 200 && out.length < want; i++)
    if (choiceOf(planTheme(String(i), 0, { style: s, spell })).selected['ringing-keys']) out.push({ seed: String(i) });
  return out;
};
test('explicit kick cells replace the floor and per-part feel stays bounded and deterministic', () => {
  const kick={bars:2,steps:[0,6,12],accents:[.9,.55,.7],families:['drum']};
  const percussion={bars:2,steps:[2,6,10,14,18,22,26,30],accents:Array(8).fill(.5),families:['noise']};
  const feel={swing:.59,delay:{beats:.02},timing:{beats:.015},dynamics:.2};
  const recipe:any={schema:1,id:'check/feel',name:'Uneven groove',scope:'track',applies:null,origin:'listener',birds:{},wants:{rhythm:{kick:[kick],offbeat:[percussion]}}};
  const plain=generate({style,recipe,seed:12,spell:HOUSE,bpm:104,bars:64});
  const felt={...recipe,wants:{rhythm:{kick:[kick],offbeat:[{...percussion,feel}]}}};
  const t=generate({style,recipe:felt,seed:12,spell:HOUSE,bpm:104,bars:64});
  assert.deepEqual(programOf(t),programOf(generate({style,recipe:felt,seed:12,spell:HOUSE,bpm:104,bars:64})));
  assert.deepEqual(t.events.filter(e=>e.layer==='bass'),plain.events.filter(e=>e.layer==='bass'));
  const kicks=t.events.filter(e=>BY_NAME[e.voice].roles.includes('kick'));assert.ok(kicks.length>0);
  for(const e of kicks){assert.equal(e.bar!%2,0);assert.ok(kick.steps.includes(e.step!));}
  for(const row of t.timeline.filter(r=>r.bar%2===1))assert.ok(!row.layers.includes('kick'));
  const hits=t.events.filter(e=>BY_NAME[e.voice].roles.includes('offbeat')&&e.step!==undefined);
  assert.ok(hits.length>8);
  for(const e of hits){
    const expected=(e.bar!*4+stepToBeats(e.step!,feel.swing)+feel.delay.beats)*t.beat;
    assert.ok(Math.abs(e.t-expected)<=feel.timing.beats*t.beat+1e-9);
    assert.ok(e.p.vel>=.4&&e.p.vel<=.5);
  }
  assert.ok(new Set(hits.map(e=>e.p.vel)).size>8);
  for(const bad of [{...feel,swing:1},{...feel,timing:{beats:1}},{...feel,dynamics:NaN}])assert.ok(rhythmProblems({offbeat:[{...percussion,feel:bad}]}).length);
});
test('phrase characters shape entrances and tails without changing the melody or note clock', () => {
  const path={degrees:[0,1,2,0],beats:[2,2,2,2],holds:[1.5,1.5,1.5,1.5]};
  const r=readMotif(motifFromPath(path,'mid'));
  const part:any={follows:'harmony',articulation:'sustained',register:'mid',families:['vocal'],properties:{struck:false},
    motif:{contour:r.contour,intervals:{steps:[r.steps,r.steps],leaps:[r.leaps,r.leaps]},cell:{beats:[8,8]},onGrid:[r.onGrid,r.onGrid],range:{semitones:[r.semitones,r.semitones]},density:[r.density,r.density],returns:{bars:[2,2]},paths:[path]},
    strength:[.6,.6],entry:{beats:[0,0]},spacing:{bars:[2,2]},duration:{beats:[1.5,1.5]},envelope:{attack:{beats:.06},release:{beats:.2}}};
  const phrase={starts:[0],dynamics:[.75,1,.6],character:'breathy'};
  const recipe:any={schema:1,id:'check/phrasing',name:'Breathing line',scope:'track',applies:null,origin:'listener',birds:{},wants:{figures:{figure:part},ambience:{figure:'spacious'}}};
  const before=generate({style,recipe,seed:12,spell:HOUSE,bpm:104,bars:64});
  const revised={...recipe,wants:{...recipe.wants,figures:{figure:{...part,phrasing:phrase}}}};
  const after=generate({style,recipe:revised,seed:12,spell:HOUSE,bpm:104,bars:64});
  const pick=(t:any)=>t.events.filter((e:any)=>e.voice==='wordlessVocal'&&e.p.attack!==undefined);
  const a=pick(before),b=pick(after);assert.ok(b.length>4);
  assert.deepEqual(a.map((e:any)=>[e.t,e.p.midi,e.p.dur]),b.map((e:any)=>[e.t,e.p.midi,e.p.dur]));
  const vowel=style.characters.phrases!.breathy.params.vowelFrom;
  assert.equal(b[0].p.vowelFrom,vowel[0]);assert.equal(b[3].p.vowelFrom,vowel[2]);
  assert.ok(b[3].p.release>b[0].p.release);assert.ok(b[3].p.reverb>b[0].p.reverb);
  assert.ok(b[0].p.vel<a[0].p.vel&&b[3].p.vel<a[3].p.vel);
  assert.ok(b.every((e:any)=>Object.values(e.p).every(v=>typeof v!=='number'||Number.isFinite(v))));
  const missing={...style,characters:{...style.characters,phrases:{}}};
  assert.equal(figureCandidates({...part,phrasing:phrase},missing,[]).length,0);
  const broken={...style,characters:{...style.characters,phrases:{breathy:{...style.characters.phrases!.breathy,params:{vowelFrom:[NaN,0,1] as [number,number,number]}}}}};
  // A malformed character is the style's fault: it fails loud, with its name,
  // instead of reading as a request with no capable instrument.
  assert.throws(()=>figureCandidates({...part,phrasing:phrase},broken,[]),/phrase character breathy/);
  assert.throws(()=>validateStyle(broken),/phrase character breathy/);
  for(const starts of [[],[1],[0,0],[0,4]])assert.ok(struckFigureProblems({...part,phrasing:{...phrase,starts}}).length);
  const request={struckFigures:[{...part,phrasing:phrase}]};
  assert.deepEqual(resolveParts(request,style).errors,[]);
  const only={...style,composition:{...style.composition,families:[{id:'breathing',chance:1,variants:[{id:'arch',weight:1,request}]}]}};
  assert.ok(generate({style:only,seed:12,spell:HOUSE,bpm:104,bars:64}).events.some(e=>e.p.vowelSeconds>0));
});
test('a third pitched part preserves the existing duet and has independent source controls', () => {
  const path = { degrees: [0,2,1,0], beats: [2,2,2,2], holds: [1,.5,1,.5] };
  const r = readMotif(motifFromPath(path,'mid'));
  const motif = { contour:r.contour, intervals:{steps:[r.steps,r.steps],leaps:[r.leaps,r.leaps]},
    cell:{beats:[8,8]}, onGrid:[r.onGrid,r.onGrid], range:{semitones:[r.semitones,r.semitones]},
    density:[r.density,r.density], returns:{bars:[2,2]}, paths:[path] };
  const common:any = {follows:'harmony',register:'mid',motif,strength:[.4,.4],entry:{beats:[0,0]},spacing:{bars:[2,2]},duration:{beats:[1,1]}};
  const vocal = {...common,articulation:'sustained',families:['vocal'],properties:{struck:false}};
  const chords = {...common,articulation:'struck',families:['keyboard'],properties:{struck:true,holdMin:.25,holdMax:.3,brightnessMin:2200,brightnessMax:3800}};
  const melody = {...common,articulation:'struck',families:['keyboard'],properties:{struck:true,holdMin:.09,holdMax:.11,brightnessMin:5800,brightnessMax:6400}};
  const recipe:any={schema:1,id:'check/trio',name:'Three parts',scope:'track',applies:null,origin:'listener',birds:{},wants:{figures:{figure:[vocal,chords]}}};
  const before=generate({style,recipe,seed:12,spell:HOUSE,bpm:104,bars:64});
  const trio={...recipe,wants:{figures:{figure:[vocal,chords,melody]}}};
  const after=generate({style,recipe:trio,seed:12,spell:HOUSE,bpm:104,bars:64});
  assert.ok(after.events.some(e=>e.voice==='brightPiano'));
  // The glue's noises aside: since round S14 they ask the cast, and a bright
  // piano on top is a brighter cast (house-v2's glueGates).
  const noGlue=(es:any[])=>es.filter(e=>e.layer!=='fx');
  assert.deepEqual(noGlue(after.events.filter(e=>e.voice!=='brightPiano')),noGlue(before.events));
  const rows=lanesOfTheme({track:after,bar:16} as any);
  for(const voice of ['piano','brightPiano','wordlessVocal']) {
    const own=rows.filter(row=>row.playing.includes(voice));
    assert.equal(own.length,1);assert.deepEqual(own[0].playing,[voice]);
  }
  assert.ok(struckFigureProblems([vocal,chords,melody,melody]).length);
  const rests={bars:16,beats:[[14,18]]};
  const rested={...trio,wants:{figures:{figure:[vocal,chords,{...melody,rests}]}}};
  assert.deepEqual(struckFigureProblems(rested.wants.figures.figure),[]);
  const spaced=generate({style,recipe:rested,seed:12,spell:HOUSE,bpm:104,bars:64});
  const allowed=(e:any)=>{const beat=(e.bar%16)*4+e.step/4;return beat<14||beat>=18;};
  assert.ok(after.events.some(e=>e.voice==='brightPiano'&&!allowed(e)));
  assert.deepEqual(spaced.events,after.events.filter(e=>e.voice!=='brightPiano'||allowed(e)),
    'rests follow the theme clock without rephasing or changing the other parts');
  for(const bad of [null,{bars:0,beats:[[0,1]]},{bars:1,beats:[[0,5]]},
    {bars:2,beats:[[1,3],[2,4]]},{bars:2,beats:[[2,2]]},{bars:2,beats:[[NaN,3]]}])
    assert.ok(struckFigureProblems({...melody,rests:bad}).length);
});
test('ordered phrase paths preserve note order, rests and duration across seeded rolls', () => {
  const path = { degrees: [-4,-5,-6,-4,-3,-2,-3], beats: [3,5,2,3,.5,1,9.5], holds: [1,2,1,2,.5,1,3] };
  const motif = motifFromPath(path, 'mid'), read = readMotif(motif);
  const box = { contour: read.contour, intervals: { steps: [read.steps,read.steps], leaps: [read.leaps,read.leaps] },
    cell: { beats: [24,24] }, onGrid: [read.onGrid,read.onGrid], range: { semitones: [read.semitones,read.semitones] },
    density: [read.density,read.density], returns: { bars: [16,16] }, paths: [path] } as any;
  for (let seed=0; seed<64; seed++) assert.deepEqual(rollMotif({ id:'check/path',name:'Path',register:'mid',weight:1,box,note:'' },new Rng(seed)),motif);
  assert.deepEqual(motifFaults(motif),[]);
  assert.deepEqual(develop(motif,'fragment')!.holds,path.holds.slice(0,4));
  assert.deepEqual(develop(motif,'augment')!.holds,path.holds.map(n=>n*2));
  const fractional = motifFromPath({degrees:[0,1],beats:[1.2,.75],holds:[1.2,.75]},'mid');
  assert.deepEqual(motifFaults(develop(fractional,'diminish')),[]);
  for (const bad of [{...path,degrees:[]},{...path,beats:[-1]},{...path,holds:[9]},
    {...path,accents:Array(7).fill(2)},{...path,voice:'named'}, {...path,beats:Array(7).fill(16)},
    {...path,beats:Array(7).fill(.3)}]) assert.ok(pathProblems(bad).length);
  const impossible = {...box,range:{semitones:[0,0]}};
  assert.equal(rollMotif({id:'check/path',name:'Path',register:'mid',weight:1,box:impossible,note:''},new Rng(1)),null);
});
test('ordered bass paths compile fractional sounding lengths without grid rounding or nonfinite events', () => {
  const path = {degrees:[0,0,0,0],beats:[1,1,1.5,.5],holds:[.6,.8,1.25,.35]};
  const r = readMotif(motifFromPath(path,'bass'));
  const motif:any={contour:r.contour,intervals:{steps:[0,0],leaps:[0,0]},cell:{beats:[4,4]},
    onGrid:[r.onGrid,r.onGrid],range:{semitones:[0,0]},density:[r.density,r.density],returns:{bars:[4,4]},paths:[path]};
  const recipe:any={schema:1,id:'check/bass-path',name:'Bass articulation',scope:'track',applies:null,origin:'listener',birds:{},
    wants:{figures:{bassline:{follows:'harmony',articulation:'legato',motif}}}};
  for (const tide of [.2,.8]) {
    const t=generate({style,recipe,seed:12,spell:{...HOUSE,tide},bpm:104,bars:64});
    const notes=t.events.filter(e=>BY_NAME[e.voice].roles.includes('bassline'));
    assert.ok(notes.length>4);
    for (const e of notes) {
      assert.ok(Number.isFinite(e.t)&&Number.isFinite(e.p.dur)&&e.p.dur>0);
      const i=[0,4,8,14].indexOf(e.step!);assert.ok(i>=0);
      assert.ok(Math.abs(e.p.dur-path.holds[i]*t.beat)<1e-8);
    }
    assert.ok(programOf(t).events.every(e=>Object.values(e.p).every(v=>typeof v!=='number'||Number.isFinite(v))));
  }
});
test('sustained phrases use declared candidates and musical envelopes through shared parts', () => {
  const path = {degrees:[-3,-2,-3,-6],beats:[2,.5,.5,4],holds:[2,.5,.5,3.25]};
  const r=readMotif(motifFromPath(path,'mid'));
  const part:any={follows:'harmony',articulation:'sustained',register:'mid',families:['ensemble'],
    properties:{struck:false,holdMin:.7,holdMax:.8,brightnessMin:4000,brightnessMax:5500},
    motif:{contour:r.contour,intervals:{steps:[r.steps,r.steps],leaps:[r.leaps,r.leaps]},cell:{beats:[7,7]},
      onGrid:[r.onGrid,r.onGrid],range:{semitones:[r.semitones,r.semitones]},density:[r.density,r.density],returns:{bars:[16,16]},paths:[path]},
    strength:[.5,.5],entry:{beats:[0,0]},spacing:{bars:[16,16]},duration:{beats:[1,1]},
    envelope:{attack:{beats:.06},release:{beats:.22}},behavior:'phrase'};
  assert.deepEqual(struckFigureProblems(part),[]);
  const candidates=figureCandidates(part,style,[]);
  assert.ok(candidates.length);
  for(const c of candidates) assert.ok(['attack','release'].every(k=>BY_NAME[c.voice].noteControls?.includes(k)));
  assert.equal(figureCandidates({...part,properties:{...part.properties,struck:true}},style,[]).length,0);
  const recipe:any={schema:1,id:'check/voiced',name:'Voiced path',scope:'track',applies:null,origin:'listener',birds:{},
    wants:{harmony:{movement:'pedal'},figures:{figure:part}}};
  const request={struckFigures:[part],pedalHarmony:true};
  const resolved=resolveParts(request,style);assert.deepEqual(resolved.errors,[]);
  assert.deepEqual(interpretWants(recipe,style,biasFor(HOUSE,style)).struckFigures,resolved.parts.struckFigures);
  const only={...style,composition:{...style.composition,families:[{id:'voiced',chance:1,variants:[{id:'phrase',weight:1,request}]}]}};
  for(const track of [generate({style,recipe,seed:12,spell:HOUSE,bpm:104,bars:64}),generate({style:only,seed:12,spell:HOUSE,bpm:104,bars:64})]) {
    const notes=track.events.filter(e=>candidates.some(c=>c.voice===e.voice)&&e.p.attack!==undefined);
    assert.ok(notes.length>=4);
    assert.deepEqual(notes.slice(1,4).map((e,i)=>e.p.midi-notes[i].p.midi),[1,-1,-5]);
    for (const e of notes) {assert.ok(Math.abs(e.p.attack-.06*track.beat)<1e-9);assert.ok(Math.abs(e.p.release-.22*track.beat)<1e-9);assert.notEqual(e.articulation,'struck');}
  }
  for(const bad of [{...part,duration:undefined},{...part,envelope:{attack:{beats:-1},release:{beats:.2}}},
    {...part,envelope:{attack:{seconds:1},release:{beats:.2}}},
    {...part,envelope:{attack:{beats:.75},release:{beats:.2}}}]) assert.ok(struckFigureProblems(bad).length);
});
test('chord shapes alternate around an ordered root path without changing its rhythm', () => {
  const part:any={follows:'harmony',articulation:'struck',register:'mid',families:['keyboard'],
    properties:{struck:true,holdMin:.25,holdMax:.3,brightnessMin:2200,brightnessMax:3800},
    motif:{contour:'pedal',intervals:{steps:[0,0],leaps:[0,0]},cell:{beats:[4,4]},onGrid:[1,1],
      range:{semitones:[0,0]},density:[2,2],returns:{bars:[1,1]},paths:[{degrees:[0,0],beats:[2,2],holds:[.5,1]}]},
    strength:[.4,.4],entry:{beats:[0,0]},spacing:{bars:[1,1]},duration:{beats:[1,1]},
    voicings:[[0,7],[0,4,7]],behavior:'phrase'};
  assert.deepEqual(struckFigureProblems(part),[]);
  const recipe:any={schema:1,id:'check/chords',name:'Alternating shapes',scope:'track',applies:null,origin:'listener',birds:{},
    wants:{harmony:{movement:'pedal'},figures:{figure:part}}};
  const t=generate({style,recipe,seed:12,spell:HOUSE,bpm:104,bars:64});
  const notes=t.events.filter(e=>e.voice==='piano');
  const first=notes.filter(e=>e.t===notes[0].t), second=notes.filter(e=>e.t===notes[first.length].t);
  assert.deepEqual(first.map(e=>e.p.midi-first[0].p.midi),[0,12]);
  assert.deepEqual(second.map(e=>e.p.midi-second[0].p.midi),[0,7,12]);
  assert.ok(Math.abs(second[0].t-first[0].t-2*t.beat)<1e-9);
  assert.ok(Math.abs(first[0].p.dur-.5*t.beat)<1e-9);
  for(const voicings of [[],[[0,0]],[[0,15]],[[-15,0]],[[0,.5]],[[0,1,2,3,4,5]]]) assert.ok(struckFigureProblems({...part,voicings}).length);
  const inverted={...part,voicings:[[0],[-4,-2,0]],phrasing:{starts:[0],dynamics:[1,1,1],character:'resonant'}};
  assert.deepEqual(struckFigureProblems(inverted),[]);
  const inv=generate({style,recipe:{...recipe,wants:{...recipe.wants,figures:{figure:inverted}}},seed:12,spell:HOUSE,bpm:104,bars:64});
  const voiced=inv.events.filter(e=>e.voice==='piano'), entrance=voiced.filter(e=>e.t===voiced[0].t);
  const landing=voiced.filter(e=>e.t===voiced[1].t);
  assert.equal(entrance.length,1);assert.equal(landing.length,3);
  assert.equal(landing.at(-1)!.p.midi,second[0].p.midi,'the original melody remains the top of the chord');
  assert.ok(landing[0].p.midi<landing[1].p.midi&&landing[1].p.midi<landing[2].p.midi);
  // The two notes of the path are the arch's two ends; the style owns the values.
  const resonant=style.characters.phrases!.resonant, ends=(v:readonly number[])=>[phraseArch(v,0),phraseArch(v,1)];
  for(const e of voiced){
    assert.ok(ends(resonant.params.harmonicBody).includes(e.p.harmonicBody));
    assert.ok(ends(resonant.params.sustainLevel).includes(e.p.sustainLevel));
    assert.equal(e.p.attack,undefined,'a body character must not invent a slow attack');
    assert.ok(ends(resonant.beats.ring).some(r=>Math.abs(e.p.ring-r*inv.beat)<1e-12));
  }
});
test('a low chord inversion moves the whole phrase into register when the key changes', () => {
  const path={degrees:[-4,-4],beats:[2,2],holds:[.5,1]};
  const r=readMotif(motifFromPath(path,'mid'));
  const part:any={follows:'harmony',articulation:'struck',register:'mid',families:['keyboard'],
    properties:{struck:true,holdMin:.25,holdMax:.3,brightnessMin:2200,brightnessMax:3800},
    motif:{contour:r.contour,intervals:{steps:[r.steps,r.steps],leaps:[r.leaps,r.leaps]},
      cell:{beats:[4,4]},onGrid:[r.onGrid,r.onGrid],range:{semitones:[r.semitones,r.semitones]},
      density:[r.density,r.density],returns:{bars:[1,1]},paths:[path]},
    strength:[.4,.4],entry:{beats:[0,0]},spacing:{bars:[1,1]},behavior:'phrase'};
  const recipe:any={schema:1,id:'check/chord-register',name:'Low chord',scope:'track',applies:null,origin:'listener',birds:{},
    wants:{harmony:{movement:'pedal'},figures:{figure:part}}};
  let transposed=0;
  for(let root=60;root<72;root++){
    const opts={style,seed:12,spell:HOUSE,bpm:104,bars:64,root,scaleName:'minor'};
    const melody=generate({...opts,recipe}).events.filter(e=>e.voice==='piano');
    const voiced=generate({...opts,recipe:{...recipe,wants:{...recipe.wants,
      figures:{figure:{...part,voicings:[[0],[-4,-2,0]]}}}}}).events.filter(e=>e.voice==='piano');
    const shift=voiced[0].p.midi-melody[0].p.midi;
    assert.ok(shift===0||shift===12);if(shift)transposed++;
    assert.equal(voiced.length,melody.length*2);
    for(const note of melody){
      const group=voiced.filter(e=>e.t===note.t);
      assert.equal(group.at(-1)!.p.midi,note.p.midi+shift,'the whole contour must keep the same octave shift');
      assert.ok(group.every(e=>e.p.midi>=48&&e.p.midi<=96));
      assert.ok(group.every(e=>e.p.dur===note.p.dur));
    }
  }
  assert.ok(transposed>0&&transposed<12,'exercise both an unchanged and a transposed key');
});
test('a melodic ensemble owns its presence and space independently of the same instrument bed', () => {
  const path={degrees:[0,1,2,0],beats:[2,2,2,2],holds:[1.8,1.8,1.8,1.8]};
  const r=readMotif(motifFromPath(path,'mid'));
  const part:any={follows:'harmony',articulation:'sustained',register:'mid',families:['ensemble'],
    properties:{struck:false,holdMin:.5,holdMax:.6,brightnessMax:1800},
    motif:{contour:r.contour,intervals:{steps:[r.steps,r.steps],leaps:[r.leaps,r.leaps]},cell:{beats:[8,8]},
      onGrid:[r.onGrid,r.onGrid],range:{semitones:[r.semitones,r.semitones]},density:[r.density,r.density],returns:{bars:[2,2]},paths:[path]},
    strength:[.4,.4],entry:{beats:[0,0]},spacing:{bars:[2,2]},duration:{beats:[1.8,1.8]},
    envelope:{attack:{beats:.25},release:{beats:.8}},phrasing:{starts:[0],dynamics:[.8,1,.7],character:'floating'}};
  assert.deepEqual(figureCandidates(part,style,[]).map(c=>c.timbre),['strings']);
  const recipe:any={schema:1,id:'check/shared-ensemble',name:'Melody and bed',scope:'track',applies:null,origin:'listener',birds:{},wants:{figures:{figure:part}}};
  const opts={style,seed:12,spell:HOUSE,bpm:104,bars:64,timbres:{padTimbre:'strings'}};
  const base=generate({...opts,recipe});
  const front=generate({...opts,recipe:{...recipe,wants:{...recipe.wants,presence:{figure:'background'},ambience:{figure:'intimate'}}}});
  const bed=generate({...opts,recipe:{...recipe,wants:{...recipe.wants,presence:{sustained:'background'}}}});
  const line=(t:typeof base)=>t.events.filter(e=>e.voice==='pad'&&e.p.open!==undefined);
  const rest=(t:typeof base)=>t.events.filter(e=>!(e.voice==='pad'&&e.p.open!==undefined));
  assert.ok(line(base).length>4);assert.ok(rest(base).some(e=>e.voice==='pad'));
  assert.deepEqual(rest(front),rest(base),'melody presence and space must not change the bed');
  assert.deepEqual(line(bed),line(base),'bed presence must not change the melody');
  assert.ok(line(front).every((e,i)=>(e.p.gain??1)<(line(base)[i].p.gain??1)));
  assert.ok(rest(bed).some((e,i)=>e.voice==='pad'&&(e.p.gain??1)<(rest(base)[i].p.gain??1)));
  const still={...part,phrasing:{...part.phrasing,character:'steady'}};
  assert.deepEqual(figureCandidates(still,style,['sustained']).map(c=>c.timbre),['strings']);
  assert.deepEqual(figureCandidates(still,style,['figure']),[]);
  assert.deepEqual(figureCandidates(still,style,['ensemble']),[]);
  const clean=generate({...opts,recipe:{...recipe,forbids:['sustained'],wants:{figures:{figure:still}}}});
  assert.ok(!clean.timeline.some(r=>r.layers.includes('pad')));
  assert.ok(clean.events.some(e=>e.voice==='pad'));
  assert.ok(clean.events.filter(e=>e.voice==='pad').every(e=>e.treatment==='none'&&e.p.motion===0&&e.p.fadeCurve===1));
  const first=clean.events.find(e=>e.voice==='pad')!;
  const source=lanesOfTheme({track:clean,bar:first.bar} as any).find(l=>l.playing.includes('pad'))!;
  assert.ok(source.on&&source.firing>0,'the melody stays visible while its borrowed instrument bed is gated off');
  assert.equal(source.treatment,null,'a reserved melody must not display an unapplied rotating insert');
  // Force each kind of rotating insert to reach the same stage row. Only the
  // phrase's reservation may prevent it; an unreserved note must receive it.
  for(const kind of ['phaser','fx:flanger']){
    const rows=stage(clean).map(r=>({...r,seg:{...r.seg,pad:{start:0,len:64,kind,rate:.1,phase:0,stages:4,depth:.5,mix:.5,amount:1}}}));
    const params=stageParams(clean,rows);
    assert.ok(clean.events.every((e,i)=>e.voice!=='pad'||(!params[i].phaser&&!params[i].fx)));
    const unreserved={...clean,events:clean.events.map(({treatment,...e})=>e)};
    const applied=stageParams(unreserved,rows);
    assert.ok(unreserved.events.some((e,i)=>e.voice==='pad'&&(kind==='phaser'?applied[i].phaser:applied[i].fx)));
  }
});
test('keyboard character is style data, preserves the score and isolates legacy settings', () => {
  const spell = { ember:.394, tide:.558, zephyr:.377, root:.717, gleam:.6, veil:.473, spark:.52, loom:.578 };
  const { keyboardPatches, ...legacyBase } = style.base;
  // Exercise the still-supported keyboard patch independently of the ordinary
  // style's new replacement part, which no longer asks this voice to stab.
  const patchStyle = { ...style, composition: { ...style.composition,
    families: style.composition.families.filter(f => f.id !== 'ringing-keys') } };
  const legacyStyle = { ...patchStyle, base: legacyBase };
  // The patch voices the ep wherever a draw, a request or a tool names the
  // timbre; the tool override pins it here on two seeds.
  const ep = { leadTimbre: 'ep', stabTimbre: 'ep' };
  for (const seed of ['543831854', '12']) {
    const before = programOf(generate({ style: legacyStyle, seed, spell, timbres: ep, bars: 64 }));
    const after = programOf(generate({ style: patchStyle, seed, spell, timbres: ep, bars: 64 }));
    assert.ok(after.events.some(e => e.voice === 'keys' && e.p.preset === 'ep'));
    const { keyboardPatches: resolved, ...settings } = after.settings;
    assert.deepEqual(resolved, keyboardPatches);
    assert.deepEqual({ ...after, settings }, before);
  }
  assert.equal(resolveSettings({ base: v1Base }).keyboardPatches, undefined);
  const alternate = resolveSettings({ base: style.base, overrides: { keyboardPatches: { ep: { cutoff: 900 } } } });
  assert.equal(alternate.keyboardPatches!.ep.cutoff, 900);
  assert.equal(resolveSettings({ base: style.base }).keyboardPatches!.ep.cutoff, keyboardPatches.ep.cutoff);
  for (const patches of [{ unknown: {} }, { ep: { cutoff: NaN } }, { ep: { ratio: 0 } },
    { ep: { index: [0, 0] } }, { ep: { formant: [2000, Infinity] } }, { ep: { tremolo: 1 } },
    { ep: { organ: true } }, { organ: { ratio: 2 } }, { rhodes: { tine: 14 } }]) {
    assert.throws(() => resolveSettings({ base: style.base, overrides: { keyboardPatches: patches } }), /invalid keyboard patch/);
  }
});
test('ringing keyboard parts replace the rejected stabs with slow, stable notes in ordinary rolls', () => {
  const family = style.composition.families.find(f => f.id === 'ringing-keys')!;
  const without = { ...style, composition: { ...style.composition, families: style.composition.families.filter(f => f !== family) } };
  const spell = { ...HOUSE, spark: .52, gleam: .6 };
  for (const variant of family.variants) {
    const request = variant.request, part = request.struckFigures![0], grid = part.motif.grid!.beats;
    assert.deepEqual(struckFigureProblems(part), []);
    // A family of ringing keyboards, with the piano it was written on the
    // preferred and so the likely draw, not the only instrument that can answer.
    const candidates = figureCandidates(part, style, []);
    assert.ok(new Set(candidates.map(c => c.timbre)).size >= 2, 'the window admits a family, not one voice');
    const top = candidates.reduce((a, b) => a.w >= b.w ? a : b);
    assert.equal(top.timbre, 'piano');
    assert.ok(top.w / candidates.reduce((n, c) => n + c.w, 0) > .5);
    const interpreted = interpretWants({ schema: 1, id: 'check/ringing', name: 'Ringing part',
      scope: 'track', applies: null, origin: 'listener', birds: {},
      wants: { figures: { figure: part }, ambience: request.ambience, presence: request.presence } }, style, biasFor(spell, style));
    assert.deepEqual(interpreted.struckFigures, request.struckFigures);
    assert.deepEqual(interpreted.presence, request.presence);
    for (let seed = 0; seed < 128; seed++) {
      const motif = rollMotif({ id: 'check/ringing', name: 'ringing', register: 'mid', weight: 1, box: part.motif, note: '' }, new Rng(seed));
      assert.ok(motif); assert.deepEqual(insideBox(motif, part.motif), []);
      assert.ok(motif.cell.every(n => n >= grid * 4 && n % (grid * 4) === 0));
    }
    const only = { ...style, composition: { ...style.composition, families: [{ ...family, chance: 1, variants: [variant], excludes: undefined }] } };
    const track = generate({ style: only, seed: 12, spell, bpm: 104, bars: 64, timbres: { leadTimbre: 'ep', stabTimbre: 'ep' } });
    const notes = track.events.filter(e => e.voice === track.dice.struckFigureVoice);
    assert.ok(notes.length > 8); assert.ok(track.events.every(e => e.p.preset !== 'ep'));
    for (let i = 0; i < notes.length; i++) {
      assert.equal(notes[i].step! % (grid * 4), 0);
      assert.ok(Math.abs(Number(notes[i].p.dur) - grid * 60 / track.bpm) < 1e-8);
      if (i) assert.ok(notes[i].t - notes[i-1].t >= grid * 60 / track.bpm - 1e-8);
    }
  }
  // The part's own claim, apart from the scene: whole-note chords can make a
  // theme sustained and so give it a scene of its own, which the scene's
  // check holds (tools/check-scene.ts); here both sides draw without one.
  // ...and apart from S21's silence rule, which lays a bed in a gap the stabs'
  // absence can open and the ringing part closes: a claim about the part.
  const quietOk = { ...(style.switches as Record<string, boolean>), neverSilent: false };
  const unscened = { ...style, switches: quietOk, composition: { ...style.composition, scene: undefined } };
  const unscenedWithout = { ...without, switches: quietOk, composition: { ...without.composition, scene: undefined } };
  for (const theme of ringingThemes(unscened, spell).slice(0, 2)) {
    const before = planTheme(theme.seed, 0, { style: unscenedWithout, spell });
    const after = planTheme(theme.seed, 0, { style: unscened, spell });
    assert.ok(choiceOf(after).selected['ringing-keys']);
    assert.ok(after.events.some(e => e.voice === after.dice.struckFigureVoice));
    assert.ok(after.events.every(e => e.p.preset !== 'ep' && e.voice !== 'grainPad'));
    assert.deepEqual(after.arrangement, before.arrangement);
    // The figure lane's own instrument in either theme is what the part replaces.
    const figureVoices = [voicePlaying('keys', String(before.dice.stabTimbre)), String(after.dice.struckFigureVoice)];
    const other = (t: typeof after) => t.events.filter(e => !figureVoices.includes(e.voice))
      .map(e => e.layer === 'pad' ? { ...e, p: { ...e.p, gain: undefined } } : e);
    assert.deepEqual(other(after), other(before), 'only the accompanying pad level changes outside the keyboard');
  }
  // An ordinary variant on its own stream: every other family draws the same
  // with or without it, it never joins a fast learned figure, and it plays on
  // about the share of themes its chance states. No timbre is consulted.
  let replaced = 0, eligible = 0;
  for (let seed = 0; seed < 256; seed++) for (const bpm of [104, 125]) {
    const bias = biasFor(spell, style);
    const old = composeParts(without, seed, bias, 'medium', bpm)!;
    const next = composeParts(style, seed, bias, 'medium', bpm)!;
    const { 'ringing-keys': replacement, ...other } = next.trace.selected;
    assert.deepEqual(other, old.trace.selected);
    if (replacement) assert.equal(old.trace.selected.figure, undefined);
    if (!old.trace.selected.figure) { eligible++; if (replacement) replaced++; }
  }
  assert.ok(Math.abs(replaced / eligible - Number(family.chance)) < .06, `${replaced} of ${eligible} against a chance of ${family.chance}`);
  assert.equal(family.when, undefined, 'no condition on a proposed timbre');
  const valid = family.variants[0].request.struckFigures![0];
  for (const bad of [
    { ...valid, motif: { ...valid.motif, grid: { beats: 0 } } },
    { ...valid, motif: { ...valid.motif, grid: { beats: 3 } } },
    { ...valid, spacing: { bars: [1, 1] } },
    { ...valid, duration: { beats: [-1, 2] } },
  ]) assert.ok(struckFigureProblems(bad).length);
});
test('ringing articulation gives a melody space over a drone without changing its score or the rhythm section', () => {
  const spell = { ...HOUSE, spark: .52, gleam: .6 };
  for (const { seed } of ringingThemes(style, spell).slice(0, 2)) {
    const track = planTheme(seed, 0, { style, spell });
    const unmarked = { ...track, events: track.events.map(({ articulation, ...event }) => event) };
    const rows = stage(track), old = stage(unmarked);
    const both = rows.filter(r => r.figure.keys.sounds && r.figure.pad.sounds);
    assert.ok(both.length > 16);
    for (const row of both) {
      assert.equal(row.figure.keys.hold, 1, 'the whole note keeps its measured length');
      assert.equal(row.figure.keys.struck, true);
      assert.equal(row.lead, 'keys'); assert.equal(row.role.pad, 'back');
      assert.equal(row.treat.keys, null, 'a ringing melody must not receive a background modulation');
      assert.equal(row.level.bass, old[row.bar].level.bass);
    }
    assert.equal(rows[4].role.pad, 'back', 'make room from the first entrance, before novelty ages');
    assert.equal(old[4].lead, null, 'unmarked legacy whole notes retain their old classification');
    const noKeys = stage({ ...track, events: track.events.filter(e => e.layer !== 'keys') });
    assert.ok(noKeys.every(row => row.lead !== 'keys'), 'an empty melody must not claim foreground');
    const renamed = stage({ ...track, events: track.events.map(e => e.articulation ? { ...e, voice: 'glassBell' } : e) });
    assert.deepEqual(renamed, rows, 'articulation is independent of the instrument name');
    const withoutPresence = { ...style, composition: { ...style.composition, families: style.composition.families.map(f => f.id !== 'ringing-keys' ? f :
      { ...f, variants: f.variants.map(v => ({ ...v, request: { ...v.request, presence: {} } })) }) } };
    const quieter = planTheme(seed, 0, { style: withoutPresence, spell });
    const plain = (t: typeof track) => t.events.map(e => e.articulation || e.layer === 'pad' ? { ...e, p: { ...e.p, gain: undefined } } : e);
    assert.deepEqual(plain(track), plain(quieter), 'presence changes gain, not notes or other instruments');
    // Supporting is the style's base level, background the quieter of base and
    // room less the style's own margin: the arithmetic, from the tables.
    const room = resolveSettings({ base: style.base, room: style.rooms[track.preset].params }).levels;
    const shift = (e: typeof track.events[number], background: boolean) => {
      const level = BY_NAME[e.voice].level as keyof typeof room, base = style.base.levels[level];
      return (background ? Math.min(base, room[level]) + style.characters.presence.backgroundDb : base) - room[level];
    };
    for (const event of track.events.filter(e => e.articulation)) assert.ok(Math.abs(20 * Math.log10(event.p.gain!) - shift(event, false)) < 1e-8);
    // Behind, unless the drone is in front of a grid: there the pad is the
    // foreground and plays at its room's own level, as every forward pad does
    // (R6 of the review of 09-24).
    const behind = track.dice.scene !== 'drone-forward';
    for (const event of track.events.filter(e => e.layer === 'pad'))
      assert.ok(Math.abs(20 * Math.log10(event.p.gain ?? 1) - (behind ? shift(event, true) : 0)) < 1e-8, `seed ${seed} ${track.dice.scene}: pad ${event.p.gain}`);
  }
});
// **The accordion riff.** What Eugene heard as a fast, ominous, accordion-like
// passage (the listening pilot's two rejections and the transition of seed
// 543831854, 09-21) was the grain pad: every sustained chord note it is given
// cycles its own pitch through [0, 7, 12, 3, 19] semitones, a new pitch every
// 35 ms (a five-note figure every 175 ms, faster than a sixteenth at 95-105
// BPM), spanning nineteen semitones, out of a reedy 24-partial source, with
// each grain's level drawn between .6 and 1. It is reserved in catalogue-v2
// (`e74a821`). The fast learned figures, the other quick pitched part the
// focus reviews named, are ineligible at 110 BPM and below (`f7b4d27`). The
// electric piano is neither (the round note of 09-22 on the electric piano).
test('the accordion riff plays nowhere: no pitch cycle faster than an eighth inside a sustained voice, no reserved pad', () => {
  assert.ok(BY_NAME.grainPad, 'reservation must not remove an engine capability');
  for(const name of ['leadTimbres','padPartners','stabPartners']) {
    const row=style.catalogue[name].find((r:{v:string})=>r.v==='grainPad');
    if(row) assert.ok(row.w===0 && row.dropped?.by==='rule 3');
  }
  // The riff's shape in the grain pad's own settings, so a retuned cloud is
  // read as what it is and not as the numbers of 09-21.
  const cycles = (voice: string) => {
    const s = (settings as unknown as Record<string, { chord?: number[]; every?: number }>)[voice];
    return s && Array.isArray(s.chord) && s.chord.length > 1 && Number.isFinite(s.every) ? { every: s.every!, span: Math.max(...s.chord) - Math.min(...s.chord) } : null;
  };
  const riff = cycles('grainPad')!;
  assert.ok(riff && riff.every < 30 / 105 && riff.span > 12, 'the reserved pad is the pitch cycle this guard describes');
  // Over 200 ordinary themes at the house: no voice that sounds holds an
  // internal pitch cycle faster than an eighth note of its theme; no sustained
  // (ensemble) lane plays four pitch changes in a row at an eighth or faster;
  // the fast learned figure is never drawn at these tempos.
  let themes = 0, sustained = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const track = planTheme(String(seed), 0, { strategy: 'house-v2', spell: HOUSE });
    const eighth = 30 / track.bpm;
    assert.ok(track.bpm <= 110 && !choiceOf(track).selected.figure, `${seed}: a fast learned figure at ${track.bpm} BPM`);
    const lanes = new Map<string, { t: number; midi: number }[]>();
    for (const e of track.events) {
      assert.notEqual(e.voice, 'grainPad', `${seed}: the reserved pad`);
      const c = cycles(e.voice);
      assert.ok(!c || c.every >= eighth, `${seed}: ${e.voice} cycles its pitch every ${c?.every} s`);
      if (BY_NAME[e.voice]?.family !== 'ensemble' || typeof e.p.midi !== 'number') continue;
      const key = `${e.layer}|${e.voice}|${e.part ?? ''}`;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key)!.push({ t: e.t, midi: e.p.midi });
    }
    for (const [key, notes] of lanes) {
      sustained++;
      // One onset per instant, its top note the pitch a listener follows.
      const onsets: { t: number; top: number }[] = [];
      for (const n of notes.sort((x, y) => x.t - y.t)) {
        const last = onsets[onsets.length - 1];
        if (last && n.t - last.t < 1e-4) last.top = Math.max(last.top, n.midi); else onsets.push({ t: n.t, top: n.midi });
      }
      let run = 0;
      for (let i = 1; i < onsets.length; i++) {
        run = onsets[i].t - onsets[i - 1].t <= eighth + 1e-6 && onsets[i].top !== onsets[i - 1].top ? run + 1 : 0;
        assert.ok(run < 4, `${seed}: ${key} runs ${run + 1} pitches at an eighth or faster`);
      }
    }
    themes++;
  }
  assert.equal(themes, 200); assert.ok(sustained > 150, `${sustained} sustained lanes read`);
  // And across the six focus scenarios and successive themes, as on 09-21.
  for(const scenario of FOCUS_SCENARIOS) for(const seed of ['543831854',...Array.from({length:24},(_,i)=>String(i+1))]) for(let theme=0;theme<3;theme++) {
    const track=planTheme(seed,theme,{strategy:'house-v2',spell:scenario.spell});
    assert.ok(track.events.every(e=>e.voice!=='grainPad'),`${scenario.id} ${seed} theme ${theme+1}`);
  }
});
test('the electric piano is an ordinary draw again: the record\'s own weight on the lead and stab lists', () => {
  assert.ok(!style.flagged.some((f: { id: string }) => f.id === 'ep'));
  for (const [name, v1] of [['leadTimbres', v1Base.timbre.lead], ['stabPartners', v1Base.timbre.stabPartner]] as const) {
    const row = style.catalogue[name].find((r: { v: string }) => r.v === 'ep');
    const record = v1.find((r: { v: string }) => r.v === 'ep')!;
    assert.ok(row && record && row.w === record.w && row.w > 0 && !row.dropped, `${name}: ep at ${row?.w}, the record's ${record?.w}`);
  }
  let stab = 0;
  for (let seed = 1; seed <= 200; seed++)
    if (planTheme(String(seed), 0, { strategy: 'house-v2', spell: HOUSE }).events.some(e => e.voice === 'keys' && e.p.preset === 'ep')) stab++;
  assert.ok(stab >= 30, `the ep plays on ${stab} of 200 ordinary themes`);
});
test('ordinary catalogue reaches learned parts, varied motifs and simpler combinations without a recipe', () => {
  const counts: Record<string, number> = {}, combinations = new Set(), shapes = new Set();
  let simple = 0;
  for (let i = 1; i <= 160; i++) {
    const track = planTheme(String(i), 0, { strategy: 'house-v2' }), choice = choiceOf(track);
    assert.equal(recipesFor({ strategy:'house-v2', masterSeed:String(i), search:'' }).track, null);
    combinations.add(JSON.stringify(choice.selected));
    for (const name of Object.keys(choice.selected)) counts[name] = (counts[name] || 0) + 1;
    if (!['bass', 'figure', 'pulse', 'percussion'].some(k => choice.selected[k])) simple++;
    if (choice.selected.bass) shapes.add(`${track.dice.motifDegrees}|${track.dice.motifCell}`);
    for (const [key, count] of Object.entries(choice.usage)) assert.ok(Number(count) <= style.composition.limits[key as keyof typeof style.composition.limits]);
    if (choice.selected.pulse) assert.ok(track.events.some(e => e.role === 'texture' && e.p.dry === 0 && e.p.immersed > 0));
    if (i <= 12) assert.deepEqual(programOf(track), programOf(planTheme(String(i), 0, { strategy:'house-v2' })));
  }
  for (const key of ['bass','body','percussion','pulse']) assert.ok(counts[key] > 5, key);
  assert.equal(counts.figure || 0, 0, 'home rolls stay below the fast-figure threshold');
  assert.equal(counts.ornament || 0, 0);
  assert.ok(simple > 0 && combinations.size > 16 && shapes.size > 12);
});

test('bird endpoints and intermediate positions preserve finite compilation, arrangement and kit constraints', () => {
  let plans = 0;
  for (const bird of BIRDS) for (const value of [0,.5,1]) for (let i=1;i<=32;i++) {
    const spell = {...HOUSE,[bird]:value};
    const track = planTheme(String(i),0,{strategy:'house-v2',spell}), program = programOf(track);
    const choice = choiceOf(track).selected, derived = biasFor(spell,style).derived;
    if (!derived.drumsOn) assert.equal(program.events.filter(e => BY_NAME[e.voice].roles.some(r => ['kick','backbeat','offbeat','sixteenth'].includes(r))).length,0);
    if (derived.kit === 'breaks') assert.ok(!choice.bass && !choice.percussion);
    assert.ok(!(choice.pulse && choice.ornament));
    for (const event of program.events) {
      assert.ok(Number.isFinite(event.onset) && event.onset >= 0 && event.onset < program.duration);
      for (const v of Object.values(event.p)) if (typeof v === 'number') assert.ok(Number.isFinite(v));
      if (event.role === 'texture') assert.ok(layersAtBar(track.arrangement,event.bar).layers.keys);
    }
    plans++;
  }
  assert.equal(plans, BIRDS.length * 3 * 32);
});

test('declared bird responses guide choices and removing one family preserves independent draws', () => {
  const counts = {dry:0,wet:0,light:0,heavy:0};
  for (let i=1;i<=256;i++) {
    for (const [label,bird,value] of [['dry','tide',0],['wet','tide',1],['light','root',0],['heavy','root',1]] as const) {
      const row=composeParts(style,i,biasFor({...HOUSE,[bird]:value},style),'minimal',125)!;
      if (row.trace.selected[bird === 'tide' ? 'pulse' : 'body']) counts[label]++;
    }
    const normal=composeParts(style,i,biasFor(HOUSE,style),'minimal',125)!;
    const without={...style,composition:{...style.composition,families:style.composition.families.map(f=>f.id==='pulse'?{...f,chance:0}:f)}};
    const other=composeParts(without,i,biasFor(HOUSE,without),'minimal',125)!;
    for (const name of ['bass','body','percussion','figure']) assert.equal(normal.trace.selected[name],other.trace.selected[name]);
  }
  assert.ok(counts.wet > counts.dry+60 && counts.heavy > counts.light+60);
});

test('a different catalogue controls parts and budgets without a new sampler branch', () => {
  const request=style.composition.families.find(f=>f.id==='pulse')!.variants[0].request;
  const policy: CompositionPolicy={version:'fixture',provenance:{basis:'authored',reference:'test',note:'not a shipped style'},
    limits:{upperParts:1,sparseUpper:1,rhythmParts:0,spatialReturns:1},families:[
      {id:'a-new-family',chance:1,variants:[{id:'a-new-variant',weight:1,request:{...request,texture:{...request.texture!,spacing:{bars:[12,12]}}}}]},
      {id:'a-conflicting-family',chance:1,variants:[{id:'duplicate',weight:1,request}]},
    ]};
  const alternate={...style,composition:policy};
  const got=composeParts(alternate,1,biasFor(HOUSE,alternate),'minimal',125)!;
  assert.equal(got.parts.texture!.spacing.bars[0],12);
  assert.equal(got.trace.selected['a-new-family'],'a-new-variant');
  assert.match(got.trace.skipped.find(x=>x.family==='a-conflicting-family')!.reason,/conflict/);
  const denied={...alternate,composition:{...policy,limits:{...policy.limits,spatialReturns:0}}};
  assert.equal(composeParts(denied,1,biasFor(HOUSE,denied),'minimal',125)!.parts.texture,null);
  assert.equal(composeParts({...style,composition:undefined},1,biasFor(HOUSE,style),'minimal',125),null);
});

test('recipes and ordinary families resolve the same musical request and refuse unavailable capabilities', () => {
  const request=style.composition.families.find(f=>f.id==='pulse')!.variants[0].request;
  const direct=resolveParts(request,style);
  assert.deepEqual(direct.errors,[]);
  const original=structuredClone(request);
  direct.parts.texture!.spacing.bars[0]=12;
  assert.deepEqual(request,original,'a resolved part must not mutate its catalogue');
  direct.parts.texture!.spacing.bars[0]=original.texture!.spacing.bars[0];
  const recipe={schema:1,id:'test/pulse',scope:'track' as const,applies:null,name:'Pulse',origin:'listener' as const,birds:{},wants:{figures:{texture:request.texture}}};
  const interpreted=interpretWants(recipe,style,biasFor(HOUSE,style));
  assert.equal(interpreted.identity,false,'a texture-only request must not disappear as identity');
  for (const key of Object.keys(direct.parts)) assert.deepEqual(interpreted[key as keyof typeof direct.parts],direct.parts[key as keyof typeof direct.parts]);
  const unavailable={...style,lanes:[],catalogue:{...style.catalogue,leadTimbres:[]}};
  assert.ok(resolveParts(request,unavailable).errors.length);
  for (let i=1;i<=16;i++) {
    const got=composeParts(unavailable,i,biasFor(HOUSE,unavailable),'minimal',125)!;
    assert.deepEqual(got.trace.selected,{});
  }
});

test('malformed catalogue dependencies and controls fail explicitly', () => {
  const first = style.composition.families[0];
  for (const family of [{...first,chance:'missing-control'},{...first,requires:['later']},{...first,variants:[]}]) {
    const broken={...style,composition:{...style.composition,families:[family]}};
    assert.throws(()=>composeParts(broken,1,biasFor(HOUSE,broken),'minimal',125),/composition:/);
  }
  const unknown=resolveParts({unexpected:true} as any,style);
  assert.match(unknown.errors.join(';'),/unknown musical part/);
  const missing={...style,composition:{...style.composition,limits:{...style.composition.limits,upperParts:undefined}}};
  assert.throws(()=>composeParts(missing as any,1,biasFor(HOUSE,style),'minimal',125),/invalid upperParts limit/);
});

test('style characters reach compiled notes and return settings without changing the players', () => {
  const request=style.composition.families.find(f=>f.id==='pulse')!.variants[0].request;
  const recipe={schema:1,id:'test/characters',scope:'track' as const,applies:null,name:'Characters',origin:'listener' as const,birds:{},
    wants:{tone:{bassline:'full' as const},figures:{texture:request.texture}}};
  const alternate={...style,characters:{...style.characters,
    tone:{...style.characters.tone,bassline:{...style.characters.tone.bassline,full:{...style.characters.tone.bassline.full,params:{bodyFloor:.3,bodyOctave:.09,release:.04}}}},
    pulse:{...style.characters.pulse,register:[60,71] as [number,number]},
    returns:{...style.characters.returns,immersed:{...style.characters.returns.immersed,seconds:3,highHz:1800}},
  }};
  const before=programOf(planTheme(42,0,{strategy:'house-v2',style,recipe,spell:HOUSE}));
  const after=programOf(planTheme(42,0,{strategy:'house-v2',style:alternate,recipe,spell:HOUSE}));
  const bass=after.events.filter(e=>e.layer==='bass'), pulse=after.events.filter(e=>e.role==='texture');
  assert.ok(bass.length && pulse.length);
  assert.ok(bass.every(e=>e.p.bodyFloor===.3 && e.p.bodyOctave===.09 && e.p.release===.04));
  assert.ok(pulse.every(e=>e.p.midi>=60 && e.p.midi<=71));
  assert.deepEqual(after.settings.backgroundSpaces,alternate.characters.returns);
  const unchanged=(e:typeof before.events[number])=>e.layer!=='bass' && e.role!=='texture';
  assert.deepEqual(after.events.filter(unchanged),before.events.filter(unchanged));
  const toneOnly={...recipe,wants:{tone:recipe.wants.tone}};
  assert.equal(interpretWants(toneOnly,style,biasFor(HOUSE,style)).identity,false);
});

test('a moving figure can gain a sparse drum companion without changing other component choices', () => {
  const without={...style,composition:{...style.composition,families:style.composition.families.filter(f=>f.id!=='figure-groove')}};
  let paired=0;
  for(let seed=1;seed<=64;seed++) {
    for(const spell of [HOUSE,{...HOUSE,spark:.52},{...HOUSE,ember:0,spark:.8}]) {
      const bias=biasFor(spell,style),next=composeParts(style,seed,bias,'medium',125)!,before=composeParts(without,seed,bias,'medium',125)!;
      const selected={...next.trace.selected};delete selected['figure-groove'];
      assert.deepEqual(selected,before.trace.selected);
      if(next.trace.selected['figure-groove']) {
        paired++;
        assert.ok(next.trace.selected.figure && bias.derived.drumsOn && bias.derived.kit==='breaks');
        const part=next.parts.rhythm.find(r=>r.lane.role==='offbeat')!.part;
        assert.equal(part.steps.length,6,'leave room around the two pickups');
        assert.ok(part.accents[1]<part.accents[0] && part.accents[4]<part.accents[3]);
        assert.ok(next.trace.usage.rhythmParts<=style.composition.limits.rhythmParts);
      }
    }
  }
  assert.ok(paired>5);
});

test('the v2 saw voicing changes only instrument settings, preserving the score and v1 defaults', () => {
  const baseline={...style,base:{...style.base,sawLead:v1Base.sawLead}};
  // The first ordinary seed whose theme plays the saw lead.
  const seed=Array.from({length:400},(_,i)=>String(i+1)).find(s=>planTheme(s,0,{strategy:'house-v2',spell:HOUSE}).events.some(e=>e.voice==='sawLead'))!;
  const before=programOf(planTheme(seed,0,{strategy:'house-v2',style:baseline,spell:HOUSE}));
  const after=programOf(planTheme(seed,0,{strategy:'house-v2',spell:HOUSE}));
  assert.ok(after.events.some(e=>e.voice==='sawLead'));
  assert.deepEqual(after.events,before.events);
  assert.deepEqual(after.automation,before.automation);
  assert.notDeepEqual(after.settings.sawLead,before.settings.sawLead);
  assert.deepEqual(baseline.base.sawLead,v1Base.sawLead);
});

test('tempo eligibility uses the forced performance tempo and preserves independent families', () => {
  const spell={...HOUSE,spark:.52,gleam:.6},bias=biasFor(spell,style);
  let fast=0,companions=0;
  for(let seed=1;seed<=64;seed++) {
    const rows=[96,110,110.1,125].map(bpm=>composeParts(style,seed,bias,'medium',bpm)!);
    for(const row of rows.slice(0,2)) for(const name of ['figure','ornament','figure-groove','harmony'])
      assert.equal(row.trace.selected[name],undefined,`${name} must follow tempo eligibility`);
    for(const row of rows.slice(2)) {
      if(row.trace.selected.figure) fast++;
      if(row.trace.selected['figure-groove']) companions++;
      for(const name of ['body','pulse']) assert.equal(row.trace.selected[name],rows[0].trace.selected[name]);
    }
    // Bird position alone still describes a house-tempo break. The actual
    // performance may have a different tempo supplied by its set.
    // A drone in front withdraws the struck figures and what follows them, and
    // keeps every other family as drawn.
    for(const bpm of [110,110.1]) {
      const track=generate({style,seed,spell,bpm,bars:16});
      const expected=composeParts(style,seed,bias,track.density,bpm)!;
      const selected=JSON.parse(String(track.dice.composition)).selected;
      if(track.dice.scene==='drone-forward') for(const [k,v] of Object.entries(selected)) assert.equal(v,expected.trace.selected[k]);
      else assert.deepEqual(selected,expected.trace.selected);
    }
  }
  assert.ok(fast>20 && companions>10,'the learned technique remains reachable above 110');
  assert.throws(()=>composeParts(style,1,bias,'medium',NaN),/planned bpm/);
  const first=style.composition.families[0];
  for(const bpm of [{above:110,atMost:100},{above:Infinity},{atMost:0}]) {
    const bad={...style,composition:{...style.composition,families:[{...first,when:{bpm}}]}};
    assert.throws(()=>composeParts(bad,1,bias,'medium',125),/bpm condition/);
  }
  const bounded={...style,composition:{...style.composition,families:[{...first,chance:1,when:undefined,
    variants:[{...first.variants[0],when:{bpm:{above:110,atMost:125}}}]}]}};
  assert.ok(composeParts(bounded,1,bias,'medium',125)!.trace.selected[first.id]);
  assert.equal(composeParts(bounded,1,bias,'medium',125.1)!.trace.selected[first.id],undefined);
});

test('a percussion role in front is no longer a want, and a held bass is an ordinary figure source', () => {
  const recipe:any={schema:1,id:'check/front',name:'Front',scope:'track',applies:null,origin:'listener',birds:{},wants:{stage:{front:'sixteenth'}}};
  const said=interpretWants(recipe,style,biasFor(HOUSE,style));
  assert.ok(said.notes.some(n=>n.block==='stage.front'&&n.state==='unsupported'));
  assert.equal('percussionFront' in said,false);
  const held:any={...recipe,id:'check/held',wants:{figures:{bassline:{follows:'harmony',articulation:'held'}}}};
  const t=generate({style,recipe:held,seed:12,spell:HOUSE,bpm:104,bars:64});
  const bass=t.events.filter(e=>BY_NAME[e.voice].roles.includes('bassline'));
  assert.ok(bass.length>0&&bass.every(e=>e.step===0),'one root per chord, on the downbeat');
  for(const e of bass){
    const chord=t.progression.chords.find(c=>e.bar!%t.progression.loopBars>=c.startBar&&e.bar!%t.progression.loopBars<c.startBar+c.bars)!;
    assert.equal(e.p.midi%12,chord.rootMidi%12);
  }
});
