import {writeDuck} from '../src/master.ts';
import {duckShape} from '../src/program.ts';
import type {Settings} from '../src/settings.ts';

/** Real AudioParams: a retrigger cannot rewrite the past or leave stale ramps. */
export async function duckContinuity(settings:Settings) {
  const results=[];
  for(const rate of [44100,48000])for(const path of ['duck.gain','duckLow.gain']){
    const ctx=new OfflineAudioContext(1,rate*2,rate),gain=ctx.createGain(),source=ctx.createConstantSource();
    source.connect(gain);gain.connect(ctx.destination);source.start();
    const shape=duckShape(settings,.6).filter(p=>p.p===path),graph={param:()=>gain.gain};
    const kicks=[.1,.4,.7,.8,.8,1.1]; // eighth, sixteenth, coincident layered kick
    for(const t of kicks)writeDuck(graph,shape,t);
    const data=(await ctx.startRendering()).getChannelData(0);
    let step=0,error=0;
    // Independently integrate the piecewise-linear target, replacing its
    // remaining recovery whenever the next kick starts. Compare every sample.
    let points=[{t:0,v:1}],k=0;
    for(let i=0;i<data.length;i++){
      const time=i/rate;
      const valueAt=(t:number)=>{const n=points.findIndex(p=>p.t>t);if(n<0)return points.at(-1)!.v;
        if(n===0)return points[0].v;const a=points[n-1],b=points[n];return a.v+(b.v-a.v)*(t-a.t)/(b.t-a.t);};
      while(k<kicks.length&&kicks[k]+shape[0].dt<=time){const t=kicks[k]+shape[0].dt,held=valueAt(t);
        points=[{t,v:held},...shape.slice(1).map(p=>({t:kicks[k]+p.dt,v:p.v}))];k++;}
      error=Math.max(error,Math.abs(data[i]-valueAt(time)));if(i)step=Math.max(step,Math.abs(data[i]-data[i-1]));
    }
    results.push({rate,path,step,error,final:data.at(-1)});
  }
  return results;
}
