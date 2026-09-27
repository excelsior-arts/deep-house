// A true look-ahead brick-wall limiter, as a processor we own.
//
// **This is the one file in `src/` that stays JavaScript, and it is not an
// oversight.** Vite copies it out as a raw asset rather than transforming it:
// `master.ts` asks for it by `new URL('./limiter-worklet.js', import.meta.url)`
// and `addModule` hands the browser the bytes that are on disk. TypeScript in
// here would reach an AudioWorklet unparsed, and a worklet that will not parse
// is a master with no ceiling. It is still checked — `allowJs` and `checkJs`
// are on for the whole tree — so what a `.ts` file states in its signature this
// one states in JSDoc, and the checker holds it to the same sheet.
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

/**
 * What the master sends when it builds this node, in milliseconds.
 * @typedef {object} LimiterOptions
 * @property {number} [lookaheadMs]
 * @property {number} [holdMs]
 * @property {number} [releaseMs]
 * @property {PostChain} [post]
 */

/**
 * What stands between this node's output and the page's: the soft clipper's
 * curve and the trim (`master.ts`: limiter -> clip -> trim -> out). Knowing it,
 * the processor can say when the *output* reaches full scale, which is the one
 * fault the ledger's `clip` line names, without a tap on the output (S16).
 * @typedef {object} PostChain
 * @property {number} [gain]   the trim's gain
 * @property {number} [knee]   the clipper's knee
 * @property {number} [drive]  the clipper's drive
 */

// **The output at full scale, heard where every sample passes** (round S16).
// The view's taps saw it only while the view was open, and the fault Eugene
// asked to hear about is the one that happens when nobody is looking. The
// processor already touches every sample of the record, so it measures what
// its output becomes after the clipper and the trim, and when that reaches
// 0 dBFS it counts the frame. At most once a second it posts what it counted:
// `{ clip: { peakDb, over, overshootDb, gr } }` — the output's peak in dBFS,
// the frames at or over full scale, how far its own output stood over the
// ceiling (0 while it holds) and the most gain reduction of that second.

class LookaheadLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ceiling', defaultValue: 0.75, minValue: 0.02, maxValue: 1, automationRate: 'k-rate' }];
  }

  /** @param {{ processorOptions?: LimiterOptions }} [options] */
  constructor(options) {
    super();
    const o = /** @type {LimiterOptions} */ ((options && options.processorOptions) || {});
    const sr = sampleRate;
    this.look = Math.max(2, Math.round((o.lookaheadMs ?? 5) * 0.001 * sr));
    // **The hold is never shorter than the look-ahead** (R90 of the reconciled
    // review of 09-24): the brick wall is the envelope staying down for as long
    // as a peak it has seen is still in the delay line, and a hold shorter than
    // the line lets the gain recover before the peak comes out. 25 ms against 5
    // held it by the settings' own numbers; the processor holds it now.
    this.hold = Math.max(this.look, Math.round((o.holdMs ?? 25) * 0.001 * sr));
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
    // The output's full scale, as this node's own level (S16): below `fast` a
    // sample cannot reach it through the clipper and the trim, so the test is
    // one comparison a sample and the curve is worked out only above it.
    this.post = { gain: 1, knee: 1, drive: 1 };
    this.fast = 1;
    this.setPost((o.post) || {});
    this.clipOver = 0; // frames at or over full scale this second
    this.clipPeak = 0; // the output's peak this second, linear
    this.ownPeak = 0;  // this node's own output peak this second, linear
    this.clipWorst = 0; // the most gain reduction this second, dB
    this.clipSince = 0;
    // How many samples of tail are left once the master this belongs to has
    // been let go. A processor that returns `true` for ever is processed for
    // as long as the context lives, connected to anything or not, so every
    // stopped set used to leave its limiter running on the audio thread. The
    // master says when it is finished; the delay line is flushed and then this
    // node is done.
    this.tail = -1;
    this.port.onmessage = (e) => {
      if (e.data && e.data.finish && this.tail < 0) this.tail = this.look + 1;
      if (e.data && e.data.post) this.setPost(e.data.post);
    };
  }

  /** @param {PostChain} p */
  setPost(p) {
    const q = this.post;
    if (typeof p.gain === 'number' && p.gain > 0) q.gain = p.gain;
    if (typeof p.knee === 'number' && p.knee > 0 && p.knee <= 1) q.knee = p.knee;
    if (typeof p.drive === 'number' && p.drive > 0) q.drive = p.drive;
    // the clipper never raises a sample, so a sample under 1 / gain stays under full scale
    this.fast = Math.min(1 / q.gain, 1);
  }

  /**
   * A sample of this node's output as the page's output has it: through the
   * soft clipper's curve (`softClipCurve`, which a WaveShaper reads over -1..1
   * and holds at its ends past them) and the trim.
   * @param {number} a  the sample's magnitude
   */
  outOf(a) {
    const { gain, knee, drive } = this.post;
    const x = Math.min(1, a);
    const head = 1 - knee;
    const shaped = x <= knee || head <= 0 ? x : knee + (head / drive) * Math.tanh((drive * (x - knee)) / head);
    return shaped * gain;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   * @returns {boolean}
   */
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
        if (r > this.clipWorst) this.clipWorst = r;
      }
      let own = 0;
      for (let c = 0; c < nch; c++) {
        const d = this.delay[c];
        const x = silent || !input[c] ? 0 : input[c][i];
        const y = d[this.di] * g;
        output[c][i] = y;
        d[this.di] = x;
        const a = y < 0 ? -y : y;
        if (a > own) own = a;
      }
      if (own > this.ownPeak) this.ownPeak = own;
      if (own >= this.fast) {
        const o = this.outOf(own);
        if (o > this.clipPeak) this.clipPeak = o;
        if (o >= 1) this.clipOver += 1;
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
    // The output at full scale, at most once a second, and only when it was.
    this.clipSince += n;
    if (this.clipSince >= sampleRate) {
      if (this.clipOver > 0) {
        this.port.postMessage({ clip: {
          peakDb: +(20 * Math.log10(this.clipPeak)).toFixed(2),
          over: this.clipOver,
          overshootDb: +Math.max(0, 20 * Math.log10(this.ownPeak / ceil)).toFixed(2),
          gr: +this.clipWorst.toFixed(2),
        } });
      }
      this.clipOver = 0;
      this.clipPeak = 0;
      this.ownPeak = 0;
      this.clipWorst = 0;
      this.clipSince = 0;
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
