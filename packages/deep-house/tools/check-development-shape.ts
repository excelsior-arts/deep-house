import assert from 'node:assert/strict';
import test from 'node:test';
import { planTheme, programOf, setLayout } from '../src/mix.ts';
import { recipeById } from '../src/recipes.ts';
import { HOUSE } from '../src/spell.ts';
import { style } from '../src/styles/deep-house-v2.ts';
import { developmentFor, developmentOf } from '../src/development.ts';
import { harmonicSupport, shapeArrangement, variationSpan } from '../src/development-shape.ts';
import { sectionsFrom } from '../src/arrangement.ts';
import { createJournal } from '../src/journal.ts';
import { strategyById } from '../src/strategies/index.ts';
import { seamPlan } from '../src/performance.ts';
import Rng from '../src/rng.ts';
import { attacksPerCycle, blessed, fixture, hashOf, rowNamed } from './fixtures/programs.ts';

const piano = fixture('calm-piano-part-02'), cycle = attacksPerCycle(piano.wants!.figures.figure);
const opts = {strategy:'house-v2',spell:HOUSE,accompaniment:'auto' as const};
const policy = style.development!, shape = policy.shape!;

test('current context programs include the adopted percussion in their original modes', () => {
  for (const name of ['calm-piano-02/base/6','pump/phrased/4','calm-piano-02/phrased/4'])
    assert.equal(hashOf(rowNamed(name)),blessed(name),`${name}: re-bless with the reason if the ordinary style moved`);
});

test('the reported empty breakdown and transient pad disappear without altering the piano phrase', () => {
  for (const seed of [4,6,18,19]) {
    const old=planTheme(seed,0,{...opts,recipe:piano,development:'phrased'});
    const t=planTheme(seed,0,{...opts,recipe:piano,development:'shaped'});
    assert.ok(!t.events.some(e => e.layer === 'pad'));
    const first=t.arrangement.sections.find(s=>s.kind==='main')!;
    if ([4,6].includes(seed)) assert.deepEqual(t.events.filter(e=>e.part===piano.id && e.bar>=first.startBar && e.bar<first.startBar+first.bars),
      old.events.filter(e=>e.part===piano.id && e.bar>=first.startBar && e.bar<first.startBar+first.bars));
    for(const s of t.arrangement.sections.filter(s=>s.kind==='bridge')) {
      assert.ok(s.bars<=shape.emptyRestBars);
      const events=t.events.filter(e=>e.bar>=s.startBar&&e.bar<s.startBar+s.bars);
      for(let bar=s.startBar;bar<s.startBar+s.bars;bar++)
        assert.ok(events.some(e=>e.layer==='kick'&&e.bar===bar),'an independent dropout cannot erase a rest anchor');
      assert.ok(!events.some(e=>e.part===piano.id),'a declared phrase rest is respected');
    }
    for(const s of t.arrangement.sections.filter(s=>s.kind==='main')) {
      assert.equal(s.bars%16,0);
      for(let b=s.startBar;b<s.startBar+s.bars;b+=16)
        assert.equal(t.events.filter(e=>e.part===piano.id&&e.bar>=b&&e.bar<b+16).length,cycle);
    }
  }
});

test('harmonic continuity follows the selected part and never forces an unavailable role', () => {
  const input={figureAvailable:true,sustainedAvailable:true,figureSelected:true,figureSustained:false,
    separate:true,leadSustained:true,padUnderFigure:true,bothChance:1,leadAloneChance:1};
  assert.deepEqual(harmonicSupport(input,new Rng(1)),{figure:true,sustained:false,character:'struck'});
  assert.deepEqual(harmonicSupport({...input,figureSelected:false,separate:false,figureAvailable:false},new Rng(1)),
    {figure:false,sustained:true,character:'sustained'});
  assert.equal(harmonicSupport({...input,sustainedAvailable:false,separate:false},new Rng(1)).sustained,false);
});

test('shaped ordinary rolls and pinned parts have bounded rests, complete plateaus and deterministic output', () => {
  const contours=new Set<string>(), supportKinds=new Set<boolean>();let peaks=0;
  for(const recipe of [null,recipeById('pump'),recipeById('lick'),piano]) for(const seed of [4,6,17,44,71,102,131,188]) {
    const t=planTheme(seed,0,{...opts,recipe,development:'shaped'});
    const trace=JSON.parse(String(t.dice.developmentShape));contours.add(trace.contour);supportKinds.add(trace.support.sustained);
    assert.deepEqual(programOf(t),programOf(planTheme(seed,0,{...opts,recipe,development:'shaped'})));
    assert.ok(t.bars<=policy.themeBarsMax && t.bars>=16);
    for(const s of t.arrangement.sections.filter(s=>s.kind==='bridge')) {
      assert.ok(s.bars<=(trace.support.sustained?shape.supportedRestBars:shape.emptyRestBars));
      // Actual notes, including a note held into the section, not just enabled gates.
      const audible=t.events.filter(e=>e.t<(s.startBar+s.bars)*t.barSeconds
        && e.t+Number(e.p.dur??0)+Number(e.p.release??0)>=s.startBar*t.barSeconds);
      assert.ok(audible.some(e=>trace.support.sustained?e.layer==='pad':e.layer==='kick'));
    }
    for(const peak of trace.peaks) {
      peaks++;
      assert.ok(peak.to-peak.from>=shape.plateauBars);
      assert.ok(peak.from-peak.prepare>=shape.prepareBars && peak.settled-peak.to>=shape.settleBars);
      if(trace.contour==='late') assert.ok((peak.from+peak.to)/2/t.bars>=.58);
    }
    assert.ok(t.automation.push.every(p=>p.value===0),'a new label must not sneak in a drive burst');
    const filters=t.automation.macroFilter;
    assert.ok(filters.every((p,i)=>Number.isFinite(p.value)&&(!i||p.t>filters[i-1].t)));
  }
  assert.deepEqual([...contours].sort(),['late','level','two-lifts']);
  assert.equal(supportKinds.size,2);assert.ok(peaks>0);
});

test('a stable sustained bed retains the existing lead-entry rule instead of becoming an endless pad solo', () => {
  let checked=0;
  for(let seed=1;seed<=40;seed++) {
    const t=planTheme(seed,0,{...opts,development:'shaped'}),support=JSON.parse(String(t.dice.developmentShape)).support;
    if(!support.sustained||support.figure)continue;
    checked++;
    for(const s of t.arrangement.sections.filter(s=>s.kind==='main'&&s.bars>=32)) {
      const later=t.timeline.slice(s.startBar+16,s.startBar+s.bars);
      assert.ok(later.every(b=>b.layers.includes('keys')&&b.layers.includes('pad')));
    }
  }
  assert.ok(checked>0);
});

test('adjacent empty rests share one bound and protected percussion survives the contour', () => {
  const grammar={...style.sections,kinds:{...style.sections.kinds,[policy.bridgeKind]:policy.bridge}};
  const base=sectionsFrom([{kind:'main',bars:32},{kind:'breakdown',bars:12},{kind:'bridge',bars:4},
    {kind:'main',bars:32},{kind:'main',bars:32}],grammar);
  const result=shapeArrangement(base,{...style,sections:grammar},shape,{figure:true,sustained:false,character:'struck'},new Rng(3),[],['sixteenths']);
  assert.deepEqual(result.arrangement.sections.filter(s=>s.kind==='bridge').map(s=>s.bars),[4]);
  assert.ok(result.arrangement.sections.filter(s=>s.kind==='main').every(s=>s.phrases.every(p=>p.layers.sixteenths)));
});

test('supporting bass slows its development while an explicit bass pin keeps its clock and opening phrase', () => {
  const t=planTheme(4,0,{...opts,recipe:piano,development:'shaped'});
  const previous=planTheme(4,0,{...opts,recipe:piano,development:'phrased'});
  assert.equal(t.dice.motifReturns,previous.dice.motifReturns,'the part retains its declared return interval');
  assert.equal(t.dice.motifCell,previous.dice.motifCell);
  assert.equal(t.dice.motifDegrees,previous.dice.motifDegrees);
  assert.equal(variationSpan(3,8),24);assert.equal(variationSpan(4,8),8);
  const old=planTheme(4,0,{...opts,recipe:recipeById('pump'),development:'phrased'});
  const pinned=planTheme(4,0,{...opts,recipe:recipeById('pump'),development:'shaped'});
  assert.equal(pinned.dice.motifReturns,old.dice.motifReturns);
  assert.equal(pinned.dice.bassDevelopment,undefined);
  const phrase=(x:typeof t)=>x.events.filter(e=>e.part==='house/pump'&&e.bar>=8&&e.bar<40).map(e=>[e.bar,e.step,e.p.midi]);
  assert.deepEqual(phrase(pinned),phrase(old));assert.ok(phrase(pinned).length);
});

test('shaped mode propagates through requests, links and journals and refuses incompatible uses', () => {
  assert.equal(developmentFor({search:'?development=shaped'}),'shaped');
  assert.deepEqual(programOf(planTheme(4,0,{...opts,recipe:piano,search:'?development=shaped'})),
    programOf(planTheme(4,0,{...opts,recipe:piano,development:'shaped'})));
  assert.ok(setLayout(4,2,{...opts,recipe:piano,development:'shaped'}));
  assert.throws(()=>planTheme(4,0,{...opts,recipe:recipeById('deep-house'),development:'shaped'}),/complete arrangement/);
  assert.throws(()=>developmentOf({...style,development:{...policy,shape:undefined}},'shaped'),/valid shaped/);
  assert.throws(()=>developmentOf({...style,development:{...policy,shape:{...shape,prepareBars:4}}},'shaped'),/valid shaped/);
  const values=new Map<string,string>(),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const place={seed:'4',theme:0,strategy:'house-v2',spell:HOUSE,recipe:piano.id,development:'shaped' as const};
  createJournal({store}).arrived(place,{bar:1,clock:0});
  assert.equal(createJournal({store}).load(place),true);
  assert.equal(createJournal({store}).load({...place,development:'phrased'}),false);
});

test('natural handovers finish the closing phrase and never round past the theme into silence', () => {
  for(const seed of [4,6,18,19,71,102])for(const recipe of [null,recipeById('pump'),piano]) {
    const layout=setLayout(seed,6,{...opts,recipe,development:'shaped'});
    for(const seam of layout.seams){
      const track=layout.plans[seam.from];
      assert.ok(seam.bar>=track.arrangement.handoverNotBefore!);
      assert.ok(seam.bar<=track.bars);
      const next=layout.seams[seam.to];
      if(next)assert.ok(next.at>=seam.end-1e-8,'a protected close cannot overlap the preceding seam');
    }
  }
  const t=planTheme(4,0,{...opts,recipe:piano,development:'shaped'});
  const p=seamPlan(t,t.blendBars);
  assert.equal(p.bar,112);assert.equal(p.bars,6);
  assert.ok(p.bar>=JSON.parse(String(t.dice.developmentShape)).peaks.at(-1).settled);
  const end={...t,arrangement:{...t.arrangement,handoverNotBefore:t.bars}};
  assert.equal(seamPlan(end,end.blendBars).bar,end.bars);
});

test('a mode outside its style context falls back to the base form and says so', () => {
  for (const spell of [{...HOUSE,spark:.9},{...HOUSE,ember:.05}]) for (const seed of [4,6,18]) for (const development of ['phrased','shaped','percussion'] as const) {
    const t=planTheme(seed,0,{strategy:'house-v2',spell,development});
    const base=planTheme(seed,0,{strategy:'house-v2',spell});
    assert.equal(t.dice.developmentRefused,development);
    assert.equal(t.dice.development,undefined);
    assert.deepEqual(t.events,base.events,'the fallback is the base form, event for event');
    assert.deepEqual(t.arrangement,base.arrangement);
  }
});
