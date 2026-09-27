import {makeV1Graph} from '../src/graph.ts';
import {prepareReturns, fireEvent} from '../src/scheduler.ts';
import {prepareVoices} from '../src/voices/index.ts';
import type {Program, ProgramEvent} from '../src/program.ts';
import type {Settings} from '../src/settings.ts';

/**
 * A deck builds the returns its program sends to when it is made, and a note
 * never builds one (the engine review of 09-22, finding 7: the first sending
 * note paid 4-14 ms inside `fireEvent`). A piano note, which sends to the hall
 * by default, and a bell asking for the immersed space: after
 * `prepareReturns` both returns are there and the background is not, and
 * firing both notes creates no convolver at all.
 */
export async function returnsAtBuild(settings:Settings) {
  const ctx=new OfflineAudioContext(2,48000*3,48000);
  const event=(i:number,voice:string,bus:string,p:Record<string,unknown>):ProgramEvent=>
    ({i,voice,layer:'keys',bus,level:'piano',bar:0,step:0,t:.1,onset:.1,lead:0,duck:false,gap:null,p} as unknown as ProgramEvent);
  const events=[event(0,'piano','melodic',{midi:60,vel:.6,dur:.5}),event(1,'fmBell','melodic',{midi:72,vel:.6,dur:.5,immersed:.3})];
  const program={settings,events,duration:3,bpm:120,trimDb:0,automation:[]} as unknown as Program;
  const graph=makeV1Graph(ctx,settings,{bpm:120,trimDb:0});
  prepareReturns(graph,program);
  const built={hall:graph.hasHall(),background:graph.hasBackground(),immersed:graph.hasImmersed()};
  await prepareVoices(ctx,settings,events,{all:true});
  let convolvers=0;
  const real=ctx.createConvolver.bind(ctx);
  ctx.createConvolver=()=>{convolvers++;return real();};
  for(const e of events)fireEvent(ctx,graph,program,e,.1);
  ctx.createConvolver=real;
  graph.dispose();
  return {built,convolvers};
}
