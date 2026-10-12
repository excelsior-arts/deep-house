// Focused variable-Reese control checks. Run: node packages/engine/tools/check-reese-motion.ts
// Native PCM verification for the listening candidate is recorded in its round note.
import assert from 'node:assert/strict';
import { beatCurve, beatAt, bodyBuffer, levelBuffer, levelRate, BEAT_CONTROL_RATE, LEVEL_CONTROL_RATE } from '../src/voices/reese-motion.ts';
import { StandinContext } from './standin.ts';
import { REESE } from '../src/voices/reese.ts';
import { asSound, soundDescriptor } from '../src/voices/sound.ts';
import row from '../sounds/bass/reeseSub.json' with { type: 'json' };
import type { NoteParams } from '../src/voices/descriptor.ts';
import type { Settings } from '../src/settings.ts';
const bounds=row.descriptor.controls.subBeatLevel;
const invalid=[null,[],[0,.3],[0,.3,0,.2],[0,.3,.001,.2],[-1,.3,1,.2],[0,.3,1,NaN],[0,.3,1,Infinity],[0,.3,1,.8],[0,.3,1,-.1],Array.from({length:130},(_,i)=>i%2?.3:i/100)];
// a knot past the note's lifetime is held, not a reason to refuse the curve (liquid-fix: a ride or a seek moves the end)
assert.ok(beatCurve([0,.3,2,.3],bounds,1.5));
for(const c of invalid)assert.equal(beatCurve(c,bounds,1.5),null);
assert.equal(beatCurve([0,0,1,.3],undefined,1.5),null);assert.equal(beatCurve([0,0,1,.3],bounds,17),null);
const c=[0,.0396,.2,.0396,.35,.33,.7,.33,.76,.0396,1,.0396];assert.ok(beatCurve(c,bounds,1.2));
assert.deepEqual(beatAt(c,0),[.0396,0]);assert.deepEqual(beatAt(c,1.1),[.0396,0]);
const errors: Array<{ phase: number; maxIntegratedPhaseError: number; maxPowerError: number }> = [];
for(const phase of [0,.375,.8125]){
 const b=bodyBuffer(new StandinContext() as unknown as BaseAudioContext,c,1.2,6.59,phase,.1),f=b.getChannelData(0);let area=0,worst=0,powerErr=0;
 const angle=(t: number)=>{const r=beatAt(c,t)[0],th=2*Math.PI*(phase+6.59*t);return 3*Math.atan2(r*Math.sin(th),1+r*Math.cos(th));};
 for(let i=1;i<f.length;i++){area+=Math.PI*(f[i-1]+f[i])/BEAT_CONTROL_RATE;worst=Math.max(worst,Math.abs(area-(angle(i/BEAT_CONTROL_RATE)-angle(0))));}
 const L=levelBuffer(new StandinContext() as unknown as BaseAudioContext,c,1.2,1.01,levelRate(c));for(let i=0;i<L.length;i++){const r=L.getChannelData(0)[i],n=L.getChannelData(1)[i];powerErr=Math.max(powerErr,Math.abs(n*n*(1.01+r*r)-1.01));}
 assert.ok(worst<.0002);assert.ok(powerErr<1e-6);errors.push({phase,maxIntegratedPhaseError:worst,maxPowerError:powerErr});
}
function graph(p: NoteParams){const ctx=new StandinContext();soundDescriptor(asSound(row),REESE).render(ctx as unknown as BaseAudioContext,{dry:ctx.destination as unknown as AudioNode},.123456,{midi:28,dur:1.1,...p},{} as Settings);return ctx;}
function snapshot(ctx: StandinContext){const ids = new Map<unknown, number>(ctx.nodes.map((n, i) => [n, i])); return ctx.nodes.map(n=>({type:n.type,params:Object.fromEntries(Object.entries(n.params).map(([k,v])=>[k,{value:v.value,events:v.events}])),sets:n.sets,starts:n.starts,stops:n.stops,connections:n.connections.map(c=>ids.get(c) ?? (c as { name?: string }).name ?? 'unknown')}));}
assert.deepEqual(snapshot(graph({})),snapshot(graph({subBeatCurve:[0,.33,1,.33]})));
for(const c of invalid)assert.deepEqual(snapshot(graph({})),snapshot(graph({subBeatCurve:c})));
assert.deepEqual(snapshot(graph({pitchCents:20})),snapshot(graph({pitchCents:20,subBeatCurve:c})));
const zero=graph({subBeatCurve:[0,0,.1,0,.3,.33,1,.33]});assert.equal(zero.nodes.filter(n=>n.buffer?.numberOfChannels===2).length,2);assert.ok(zero.nodes.some(n=>n.type==='osc'&&n.frequency.value===6.59));
// the pair's ratio and normalisation are a control buffer at a millisecond grid (the engine review of 10-08, F5), every frame the
// written smoothstep exactly; a segment under 64 ms is drawn with 64 points, never finer than the body's 4 kHz
assert.equal(levelRate(c),Math.ceil(64/.06));assert.equal(levelRate([0,0,1.021,0,1.191,.33,2.582,.33]),LEVEL_CONTROL_RATE);assert.equal(levelRate([0,0,.01,.33,1,.33]),BEAT_CONTROL_RATE);assert.equal(levelRate([0,0,.032,.33,1,.33]),2000);
const lv=levelBuffer(new StandinContext() as unknown as BaseAudioContext,c,1.2,1.01,LEVEL_CONTROL_RATE,.1);
for(let j=0;j<lv.length;j++)assert.ok(Math.abs(lv.getChannelData(0)[j]-beatAt(c,.1+j/LEVEL_CONTROL_RATE)[0])<1e-7);
// the body's rotation is the cosine per frame to a float's last bit
const sb=bodyBuffer(new StandinContext() as unknown as BaseAudioContext,c,1.2,6.59,.375,.1);
for(let j=0;j<sb.length;j++){const t=j/BEAT_CONTROL_RATE,[r,dr]=beatAt(c,t),th=2*Math.PI*(.375+6.59*t),cc=Math.cos(th),ss=Math.sin(th),d=1+2*r*cc+r*r;
 assert.ok(Math.abs(sb.getChannelData(0)[j]-3*(6.59*(r*cc+r*r)+dr*ss/(2*Math.PI))/d)<1e-5);assert.ok(Math.abs(sb.getChannelData(1)[j]-.1*Math.sqrt(d/(1+r*r)))<1e-7);}
const shed=graph({subBeatCurve:[0,0,.1,0,.3,.33,1,.33],subBodyFollow:0});assert.equal(shed.nodes.filter(n=>n.buffer).length,1,'no following body, no body buffer');
console.log(JSON.stringify({ invalidInputs: invalid.length + 2, staticFallbacks: true, zeroStartPair: true, integratedPhase: errors }, null, 2));
