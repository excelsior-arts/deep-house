// **A render made to fall behind, for a check** (round audio-slack): the
// `?stress=` view row. Never written by the page and never on a shared link
// (a view row: `cleanLink` and the time link drop it); a page without it
// builds nothing here.
//
// `stress=<ms>,<every s>,<for s>` puts an AudioWorklet on the context that
// spins for `ms` milliseconds of each render quantum for `for` seconds out of
// every `every`, by the wall clock. A quantum is 128 frames (2.7 ms at 48 kHz),
// so `stress=6,10,2` holds the render to under half of real time for two
// seconds in ten: the slowdown watch (`slowdown.ts`) should see one each
// time, two seconds long. `stress=<ms>` alone spins all the time. It makes no
// sound: its output is a gain of nought into the destination.

/** The row read: spin milliseconds per quantum, the period and the stretch in seconds (0 for always). */
export interface Stress { ms: number; every: number; span: number }

export function readStress(v: string | null): Stress | null {
  if (!v) return null;
  const [ms, every = 0, span = 0] = v.split(',').map(Number);
  if (!(ms > 0 && ms <= 50) || !(every >= 0) || !(span >= 0)) return null;
  return { ms, every, span: every > 0 ? Math.min(span, every) : 0 };
}

const BODY = `
class Stress extends AudioWorkletProcessor {
  constructor(o) { super(); const p = o.processorOptions; this.ms = p.ms; this.every = p.every * 1000; this.span = p.span * 1000; this.t0 = Date.now(); }
  process() {
    const now = Date.now();
    if (!this.every || (now - this.t0) % this.every < this.span) { while (Date.now() - now < this.ms) { /* spin */ } }
    return true;
  }
}
registerProcessor('deep-house-stress', Stress);
`;

/** Put the stress on a context. Resolves once it is running; never throws into a start. */
export async function stressRender(ctx: AudioContext, s: Stress): Promise<void> {
  try {
    const url = URL.createObjectURL(new Blob([BODY], { type: 'text/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, 'deep-house-stress', { processorOptions: s, numberOfInputs: 0, outputChannelCount: [1] });
    const g = ctx.createGain();
    g.gain.value = 0;
    node.connect(g);
    g.connect(ctx.destination);
    console.info(`deep-house: render stress, ${s.ms} ms a quantum${s.every ? ` for ${s.span} s in every ${s.every} s` : ''}`);
  } catch (e) {
    console.warn('deep-house: the render stress would not start', e);
  }
}
