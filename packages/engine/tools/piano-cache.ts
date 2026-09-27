import {piano,preparePiano,pianoCacheStats,resetPianoCacheStats,pianoCacheBytes,PIANO_CACHE_BYTES} from '../src/voices/piano.ts';
import {prepareVoices} from '../src/voices/index.ts';
import type {ProgramEvent} from '../src/program.ts';
import type {Settings} from '../src/settings.ts';

// Two synthetic themes of twenty-four distinct strings each (13.7 MiB, which
// one preparation window holds and two do not together), every string played
// twice, the second time at the far end of the theme.
const theme=(base:number):ProgramEvent[]=>{
  const out:ProgramEvent[]=[];
  for(let pass=0;pass<2;pass++)for(let k=0;k<24;k++){
    const t=pass*120+k*2;
    out.push({i:out.length,voice:'piano',layer:'keys',bus:'melodic',level:'piano',bar:0,step:0,t,onset:t,lead:0,duck:false,gap:null,
      p:{midi:base+k,vel:.6,dur:1.7,gain:.7}} as unknown as ProgramEvent);
  }
  return out;
};
const tick=()=>new Promise(r=>setTimeout(r,0));

/**
 * The playing theme keeps its strings while the next one is prepared (the
 * engine review of 09-22, finding 3). The first theme is prepared and starts;
 * three notes in, the next theme is prepared, as the set does in its first
 * bars; then the first plays out and the second plays. Before the fix the
 * second preparation evicted the first theme's unplayed strings and they were
 * rendered on the scheduling tick. Returned: the live misses of each theme's
 * in-window notes, and the most the cache ever held against its budget.
 */
export async function pianoCache(settings:Settings) {
  resetPianoCacheStats();
  const ctx=new OfflineAudioContext(2,48000,48000),sink=ctx.createGain();
  const A=theme(40),B=theme(72);
  let peak=0;
  const watch=()=>{peak=Math.max(peak,pianoCacheBytes(ctx));};
  await preparePiano(ctx,settings,A,{from:0});watch();
  let missA=0,missB=0;
  for(const [i,e] of A.entries()){
    if(i===3){await preparePiano(ctx,settings,B,{from:0});watch();}
    const l=pianoCacheStats().live;
    piano(ctx,{dry:sink},0,e.p,settings);
    missA+=pianoCacheStats().live-l;
    await tick();watch();
  }
  await new Promise(r=>setTimeout(r,100));watch();
  for(const e of B){
    const l=pianoCacheStats().live;
    piano(ctx,{dry:sink},0,e.p,settings);
    missB+=pianoCacheStats().live-l;
    await tick();watch();
  }
  return {missA,missB,peakMiB:+(peak/1048576).toFixed(2),budgetMiB:+(PIANO_CACHE_BYTES/1048576).toFixed(2),renders:pianoCacheStats().renders};
}

// Play one theme's notes in order, skipping the ones `drop` names, and count
// the notes that found no string and built it on the tick.
async function playOut(ctx:BaseAudioContext,sink:AudioNode,settings:Settings,events:ProgramEvent[],drop=(_i:number)=>false){
  let miss=0;
  for(const [i,e] of events.entries()){
    if(drop(i))continue;
    const l=pianoCacheStats().live;
    piano(ctx,{dry:sink},0,e.p,settings);
    miss+=pianoCacheStats().live-l;
    await tick();
  }
  return miss;
}

/**
 * **Two seeks in the playing theme keep the next theme's strings** (R29 of the
 * reconciled review of 09-24). Theme A plays and theme B is prepared behind it,
 * through `prepareVoices` and each with its own program's events, as the live
 * mix prepares them; then A is prepared twice more from its start, which is
 * what two seeks do. A second preparation of one program replaces its own
 * holder. Before the fix the hook was handed a freshly filtered array each
 * time, so no preparation ever matched its own program: the first seek evicted
 * A's holder, the second B's, and B's strings that were still waiting for room
 * were never rendered — they were built on the tick when B played.
 */
export async function pianoSeeks(settings:Settings) {
  resetPianoCacheStats();
  const ctx=new OfflineAudioContext(2,48000,48000),sink=ctx.createGain();
  const A=theme(40),B=theme(72);
  await prepareVoices(ctx,settings,A,{from:0});
  await prepareVoices(ctx,settings,B,{from:0});
  await prepareVoices(ctx,settings,A,{from:0});
  await prepareVoices(ctx,settings,A,{from:0});
  const missA=await playOut(ctx,sink,settings,A);
  await new Promise(r=>setTimeout(r,150));
  const missB=await playOut(ctx,sink,settings,B);
  return {missA,missB,renders:pianoCacheStats().renders};
}

/**
 * **A note the deck drops lets its string go** (R95). Theme A plays with the
 * second pass of its first sixteen strings dropped, as a stall of more than a
 * bar drops them, and every note after them played; theme B was prepared behind
 * it and waits for room. Before the fix the dropped notes' strings stayed pinned
 * (9 MiB of the 18) until two more themes had been prepared, so B's queue never
 * got the room and half of B was built on the tick.
 */
export async function pianoDropped(settings:Settings) {
  resetPianoCacheStats();
  const ctx=new OfflineAudioContext(2,48000,48000),sink=ctx.createGain();
  const A=theme(40),B=theme(72);
  await prepareVoices(ctx,settings,A,{from:0});
  await prepareVoices(ctx,settings,B,{from:0});
  const missA=await playOut(ctx,sink,settings,A,(i)=>i>=24&&i<40);
  await new Promise(r=>setTimeout(r,150));
  const heldAfterA=+(pianoCacheBytes(ctx)/1048576).toFixed(2);
  const missB=await playOut(ctx,sink,settings,B);
  return {missA,missB,heldAfterA,renders:pianoCacheStats().renders};
}
