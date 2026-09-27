import { scheduleLine } from '../src/master.ts';
import type { AutomationLine } from '../src/program.ts';

/**
 * An exponential program line from 1 to 0.25 over a second, written by the
 * real writer onto a gain in an offline render and read back off the samples
 * (R73 of the reconciled review of 09-24): the value at the end of the line,
 * and one half-way, where an exponential is the geometric mean, 0.5. With the
 * old floor of 60 the line went to +35.6 dB instead.
 */
export async function expLine(): Promise<{ end: number; half: number }> {
  const rate = 48000;
  const ctx = new OfflineAudioContext(1, rate * 1.5, rate);
  const src = ctx.createConstantSource();
  const g = ctx.createGain();
  src.connect(g);
  g.connect(ctx.destination);
  const line = { param: 'g.gain', curve: 'exponential', points: [{ t: 0.25, value: 1 }, { t: 1.25, value: 0.25 }] } as AutomationLine;
  scheduleLine({ g: { gain: g.gain } }, line, 0.25);
  src.start(0);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  return { end: d[Math.round(1.3 * rate)], half: d[Math.round(0.75 * rate)] };
}
