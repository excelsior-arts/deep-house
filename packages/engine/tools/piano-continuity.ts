import { piano, preparePiano } from '../src/voices/piano.ts';
import type { Settings } from '../src/settings.ts';
import type { ProgramEvent } from '../src/program.ts';

/**
 * Audio regression: the stereo hammer must not reset a mono string's filter,
 * and must not change the level the strings are panned at when it stops.
 *
 * Both were one fault. The hammer is stereo and the strings are mono, so when
 * the hammer stopped the lowpass after them dropped from two channels to one:
 * the biquad's state was reset (a click of 0.05-0.11 in one sample) and the
 * StereoPanner behind it switched from its stereo balance law to its mono
 * equal-power law, a 3 dB step in level (the engine review of 09-22, finding
 * 1). Three pitches — the gate used to read one, at the centre of the pan,
 * and passed a change of 3 to 5 dB — each live and from the cache, with the
 * largest one-sample step round the hammer's end and the level 20 ms either
 * side of it. MEASURED with the channel count pinned: 2.9-3.7 dB of the
 * string's own decay across that gap; unpinned: 6.2-8.8.
 */
export async function pianoContinuity(settings: Settings) {
  const rows=[];
  for (const midi of [55,67,79]) for (const cached of [false,true]) {
    const rate=48000,ctx=new OfflineAudioContext(2,rate*2,rate);
    const p={midi,vel:.57,dur:.23,gain:.67,delay:0,hall:0};
    const ev:ProgramEvent={i:0,voice:'piano',layer:'keys',bus:'melodic',level:'piano',bar:0,step:0,
      t:.2,onset:.2,lead:0,duck:false,gap:null,p};
    if (cached) await preparePiano(ctx,settings,[ev],{all:true});
    piano(ctx,{dry:ctx.destination},.2,p,settings);
    const b=await ctx.startRendering();let step=0,peak=0;
    const level=(a:number,z:number)=>{let s=0;for(let c=0;c<2;c++){const x=b.getChannelData(c);for(let i=Math.floor(a*rate);i<z*rate;i++)s+=x[i]*x[i];}
      return 10*Math.log10(s/((z-a)*rate*2));};
    for (let c=0;c<b.numberOfChannels;c++) {
      const x=b.getChannelData(c);
      for (let i=0;i<x.length;i++) peak=Math.max(peak,Math.abs(x[i]));
      // The hammer stops at .265; allow render-quantum rounding around it.
      for (let i=Math.floor(.262*rate);i<.273*rate;i++) step=Math.max(step,Math.abs(x[i]-x[i-1]));
    }
    rows.push({midi,cached,peak,step,drop:+(level(.24,.26)-level(.28,.30)).toFixed(2)});
  }
  return rows;
}
