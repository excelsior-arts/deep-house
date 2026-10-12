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

/**
 * Real AudioParams, offline: a curve written from inside a longer ramp
 * replaces it, and the line reads what the parameter renders (E03 of the
 * outside review of 10-03; `tools/check-ramp.ts` is the same case in node). The
 * review's counterexample a tenth the length: 0 to 1 over a second, then .2
 * set at half a second and a ramp to .3 at 0.6. The write used to cancel
 * nothing, so the first ramp's endpoint still pulled the parameter towards 1
 * after the curve had ended, and the line read the old ramp's middle.
 */
export async function curveOverRamp() {
  const results=[];
  for(const rate of [44100,48000]){
    const ctx=new OfflineAudioContext(1,rate,rate),g=ctx.createGain(),c=ctx.createConstantSource();
    c.connect(g);g.connect(ctx.destination);c.start();
    const l=line(ctx,g.gain,0);
    l.to(1,0,1);
    l.write([{v:.2,t:.5,k:'set'},{v:.3,t:.6,k:'lin'}],.5);
    const x=(await ctx.startRendering()).getChannelData(0);
    let apart=0;for(const t of [.25,.45,.55,.65,.7,.9])apart=Math.max(apart,Math.abs(x[Math.round(rate*t)]-l.at(Math.round(rate*t)/rate)));
    results.push({rate,mid:x[Math.round(rate*.55)],after:x[Math.round(rate*.7)],apart});
  }
  return results;
}
