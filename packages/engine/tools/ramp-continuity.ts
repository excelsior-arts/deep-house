import {line} from '../src/ramp.ts';

/**
 * Real AudioParams, offline: a line interrupted part-way through a ramp keeps
 * the part of the ramp that played. The engine review of 09-22 (finding 2)
 * read this at nought until the interruption and then a step of 0.5, because
 * the cancel erased the whole leg and a set anchored the new one. Offline is
 * the hard case: the whole timeline is written before a sample renders.
 */
export async function rampContinuity() {
  const results=[];
  for(const rate of [44100,48000]){
    const ctx=new OfflineAudioContext(1,rate,rate),g=ctx.createGain(),c=ctx.createConstantSource();
    c.connect(g);g.connect(ctx.destination);c.start();
    g.gain.setValueAtTime(0,0);g.gain.linearRampToValueAtTime(1,1);
    const l=line(ctx,g.gain,{from:0,to:1,start:0,end:1});
    l.to(.2,.5,.1);
    const x=(await ctx.startRendering()).getChannelData(0);
    let step=0;for(let i=1;i<x.length;i++)step=Math.max(step,Math.abs(x[i]-x[i-1]));
    results.push({rate,quarter:x[Math.round(rate*.25)],step,final:x[x.length-1]});
  }
  return results;
}
