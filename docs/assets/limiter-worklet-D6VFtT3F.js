// A true look-ahead brick-wall limiter, as a processor we own.
//
// Why not a DynamicsCompressor: measured across engines, that node moves its
// gain inside one cycle of a fifty hertz wave, and Firefox renders the step
// straight through. Both of them came out of this chain for that reason, which
// left the soft clipper as the only ceiling -- and a dense scene at -12 LUFS
// drives a memoryless waveshaper into audible distortion. Measured on master
// seed 84658, the growl scenes Eugene marked reach the clipper at 0 dBFS with
// 2.1-2.5% of samples shaped and a worst deviation of a quarter of full scale.
// That is the "clipping crazy now" in the ratings log.
//
// The design, and the one rule it keeps: the gain never moves faster than the
// look-ahead ramp, and it only moves that fast on the way *down*, where the
// delay has already bought the time to do it before the sample arrives.
//
//   peak envelope   instant up; then HOLD for one bass cycle and more, so a
//                   45 Hz wave never sees its gain rise between its own two
//                   peaks; then a slow exponential release.
//   target gain     ceiling / env, or exactly 1 below the ceiling. Unity is
//                   unity: under the threshold this node is a wire.
//   boxcar          the target is averaged over the look-ahead window, which
//                   turns every step in it into a straight ramp of exactly
//                   that length. There is no discontinuity in the gain to
//                   put a click on an onset.
//   delay           the audio is held by the same window, so the ramp is
//                   finished by the time the peak it was computed from
//                   arrives. That is what "instant attack" means here: not a
//                   fast gain move, but an early one.
//
// The hold is what keeps this off the bass. With a 25 ms hold the envelope
// cannot fall between successive peaks of anything above 40 Hz, so the gain
// is flat across a bass cycle instead of tracking it.
class LookaheadLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ceiling', defaultValue: 0.75, minValue: 0.02, maxValue: 1, automationRate: 'k-rate' }];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    const sr = sampleRate;
    this.look = Math.max(2, Math.round((o.lookaheadMs ?? 5) * 0.001 * sr));
    this.hold = Math.max(1, Math.round((o.holdMs ?? 25) * 0.001 * sr));
    this.rel = Math.exp(-1 / Math.max(1, (o.releaseMs ?? 200) * 0.001 * sr));
    this.delay = [new Float32Array(this.look), new Float32Array(this.look)];
    this.di = 0;
    this.env = 0;
    this.left = 0;
    this.win = new Float32Array(this.look).fill(1);
    this.wi = 0;
    this.wsum = this.look;
    this.worst = 0; // most gain reduction seen, in dB, for the meter
    this.since = 0;
    // How many samples of tail are left once the master this belongs to has
    // been let go. A processor that returns `true` for ever is processed for
    // as long as the context lives, connected to anything or not, so every
    // stopped set used to leave its limiter running on the audio thread. The
    // master says when it is finished; the delay line is flushed and then this
    // node is done.
    this.tail = -1;
    this.port.onmessage = (e) => {
      if (e.data && e.data.finish && this.tail < 0) this.tail = this.look + 1;
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const n = output[0].length;
    // Nothing connected upstream is not the same as nothing to do: the delay
    // line still holds the last few milliseconds of the record and the
    // envelope is still up. Run the loop on silence so both drain, rather than
    // freezing them — a frozen delay plays its stale samples out on the next
    // reconnection, which is how an impulse came back after a gap.
    const silent = !input || !input.length;
    const ceil = Math.max(0.02, parameters.ceiling[0]);
    const nch = Math.min(output.length, this.delay.length);
    for (let i = 0; i < n; i++) {
      // The loudest thing across the channels right now: one gain for both, so
      // limiting never moves the image.
      let peak = 0;
      if (!silent) {
        for (let c = 0; c < nch; c++) {
          const v = input[c] ? Math.abs(input[c][i]) : 0;
          if (v > peak) peak = v;
        }
      }
      if (peak >= this.env) {
        this.env = peak;
        this.left = this.hold;
      } else if (this.left > 0) {
        this.left -= 1;
      } else {
        this.env *= this.rel;
      }
      const target = this.env > ceil ? ceil / this.env : 1;
      // The window holds Float32, so what is added has to be what will later
      // be subtracted: adding the double and subtracting the rounded value
      // left a residual that integrated for as long as the node ran — 0.7504
      // out of a nominal 0.75 ceiling after two minutes of a constant tone.
      const old = this.win[this.wi];
      this.win[this.wi] = target;
      this.wsum += this.win[this.wi] - old;
      this.wi = this.wi + 1 === this.look ? 0 : this.wi + 1;
      const g = this.wsum / this.look;
      if (g < 0.999) {
        const r = -20 * Math.log10(Math.max(g, 1e-6));
        if (r > this.worst) this.worst = r;
      }
      for (let c = 0; c < nch; c++) {
        const d = this.delay[c];
        const x = silent || !input[c] ? 0 : input[c][i];
        output[c][i] = d[this.di] * g;
        d[this.di] = x;
      }
      this.di = this.di + 1 === this.look ? 0 : this.di + 1;
    }
    // A meter, a few times a second: what the ceiling actually had to do.
    this.since += n;
    if (this.since >= sampleRate / 8) {
      this.port.postMessage({ reduction: +this.worst.toFixed(2) });
      this.worst = 0;
      this.since = 0;
    }
    // Let go once the tail the master asked for has been written out.
    if (this.tail >= 0) {
      this.tail -= n;
      if (this.tail <= 0) return false;
    }
    return true;
  }
}

registerProcessor('lookahead-limiter', LookaheadLimiter);
