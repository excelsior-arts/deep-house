// Meters for a rendered buffer, in plain JS so a test needs no ffmpeg:
// third-octave band levels, integrated loudness (ITU-R BS.1770-4, K-weighted,
// gated), true peak (4x oversampled), and a click detector that looks at how
// far the waveform moves in one sample around each hit.
//
// Runs in a browser page (over the channels of an AudioBuffer) and in node
// (over Float32Arrays) alike: nothing here touches the DOM or Web Audio.
//
//   node tools/meter.mjs --selftest   the meters against signals whose answer
//                                     is known on paper (see the foot of the file)

export const THIRDS = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];

// In-place radix-2 FFT on interleaved re/im arrays; n a power of two.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// Welch power spectrum of a mono signal: Hann windows of `n`, half overlap.
function welch(x, n = 8192) {
  const hop = n >> 1;
  const win = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < n; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); wsum += win[i] * win[i]; }
  const p = new Float64Array(n / 2 + 1);
  const re = new Float64Array(n), im = new Float64Array(n);
  let count = 0;
  for (let s = 0; s + n <= x.length; s += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= n / 2; k++) p[k] += (re[k] * re[k] + im[k] * im[k]) / wsum;
    count++;
  }
  if (count) for (let k = 0; k < p.length; k++) p[k] /= count;
  return p;
}

// Third-octave band levels of the mono sum, in dB relative to the total from
// 40 Hz to 10 kHz: the shape of the spectrum, not how loud it is.
export function thirdOctaves(left, right, sampleRate) {
  const n = 8192;
  const m = new Float64Array(left.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (left[i] + (right ? right[i] : left[i]));
  const p = welch(m, n);
  const df = sampleRate / n;
  const bands = THIRDS.map((fc) => {
    const lo = fc / 2 ** (1 / 6), hi = fc * 2 ** (1 / 6);
    let s = 0;
    for (let k = Math.ceil(lo / df); k < Math.min(hi / df, p.length); k++) s += p[k];
    return s;
  });
  let tot = 0;
  THIRDS.forEach((fc, i) => { if (fc >= 40 && fc <= 10000) tot += bands[i]; });
  return bands.map((b) => +(10 * Math.log10(b / tot + 1e-30)).toFixed(2));
}

// A biquad, direct form I, as the loudness standard writes them.
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// K-weighting: the head shelf and the highpass, with coefficients derived for
// the buffer's own rate (the standard tabulates 48 kHz).
function kWeight(x, fs) {
  // stage 1: high shelf, +4 dB above ~1.5 kHz
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  let Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const b0 = (Vh + (Vb * K) / Q + K * K) / a0;
  const b1 = (2 * (K * K - Vh)) / a0;
  const b2 = (Vh - (Vb * K) / Q + K * K) / a0;
  const a1 = (2 * (K * K - 1)) / a0;
  const a2 = (1 - K / Q + K * K) / a0;
  let y = biquad(x, b0, b1, b2, a1, a2);
  // stage 2: highpass at 38 Hz
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const h1 = (2 * (K * K - 1)) / a0;
  const h2 = (1 - K / Q + K * K) / a0;
  y = biquad(y, 1, -2, 1, h1, h2);
  return y;
}

// Integrated loudness in LUFS: 400 ms blocks at 75% overlap, an absolute gate
// at -70 and a relative gate 10 LU under the ungated mean.
export function integratedLoudness(channels, fs) {
  const ks = channels.map((c) => kWeight(c, fs));
  const block = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const blocks = [];
  for (let s = 0; s + block <= ks[0].length; s += hop) {
    let z = 0;
    for (const k of ks) { let e = 0; for (let i = s; i < s + block; i++) e += k[i] * k[i]; z += e / block; }
    blocks.push(z);
  }
  const lk = (z) => -0.691 + 10 * Math.log10(z + 1e-30);
  const abs = blocks.filter((z) => lk(z) > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const gate = lk(mean) - 10;
  const rel = abs.filter((z) => lk(z) > gate);
  if (!rel.length) return -Infinity;
  return +lk(rel.reduce((a, b) => a + b, 0) / rel.length).toFixed(2);
}

// The peak of the samples themselves, as a plain amplitude. It is the floor
// under any true-peak reading: a waveform cannot pass between two samples
// lower than it stands on one of them.
export function samplePeak(channels) {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) { const a = c[i] < 0 ? -c[i] : c[i]; if (a > peak) peak = a; }
  return peak;
}

const TP_TAPS = 48, TP_PHASES = 4;
// Four polyphase windowed sincs, one per quarter-sample offset, the way the
// loudness standard's Annex 2 interpolator is built. Phase 0 is a plain delay
// — the sinc is zero at every other integer — so the oversampled signal passes
// through every sample it came from.
const TP_KERNELS = (() => {
  const kernels = [];
  for (let ph = 0; ph < TP_PHASES; ph++) {
    const k = new Float64Array(TP_TAPS);
    for (let i = 0; i < TP_TAPS; i++) {
      const t = i - TP_TAPS / 2 + ph / TP_PHASES;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + ph / TP_PHASES)) / TP_TAPS);
      k[i] = sinc * w;
    }
    kernels.push(k);
  }
  return kernels;
})();

// True peak: the signal oversampled four times through the sinc above, the
// largest sample of that, and the sample peak underneath it as a floor. It
// comes back with where it was found, in samples, for the self-test and for a
// failure that has to name a place.
//
// Both ends are zero-padded rather than skipped. The convolution used to begin
// only once the filter was full and to stop at the last input sample, so the
// first 48 samples and the last 12 quarter-samples of a buffer were never
// looked at: in a hundred samples holding one 0 dBFS impulse, the impulse at
// index 0 read -600 dBTP, at 1 and 99 read -92.65, and at 76 read -0.91. A
// long render with quiet edges hid it; an edge or a truncated export did not.
// Output `out` carries the input at time `out - taps/2 + phase/4`, which is
// what `at` is reported in, so a peak names the sample it sits on rather than
// the filter's delay.
//
// The reading is a ceiling and not a conformance figure: the interpolator's
// passband is not flat, so it over-reads a full-scale tone by up to about
// 1.2 dB, and by more in the last twentieth of the band, which at 48 kHz is
// above 21 kHz. That is the safe direction for a gate, and the self-test pins it so
// the meter cannot drift into under-reading. Flattening it would move every
// true peak this project has recorded, the blessed sound reference included,
// so it is a sound decision of Eugene's and not a bug fix.
export function truePeakDetail(channels) {
  let peak = 0, at = 0, channel = 0;
  channels.forEach((c, ch) => {
    for (let i = 0; i < c.length; i++) {
      const a = c[i] < 0 ? -c[i] : c[i];
      if (a > peak) { peak = a; at = i; channel = ch; }
    }
  });
  channels.forEach((c, ch) => {
    const n = c.length;
    for (let out = 0; out < n + TP_TAPS; out++) {
      const lo = out >= n ? out - n + 1 : 0;
      const hi = out < TP_TAPS - 1 ? out : TP_TAPS - 1;
      for (let ph = 0; ph < TP_PHASES; ph++) {
        const k = TP_KERNELS[ph];
        let v = 0;
        for (let i = lo; i <= hi; i++) v += c[out - i] * k[i];
        const a = v < 0 ? -v : v;
        if (a > peak) { peak = a; at = out - TP_TAPS / 2 + ph / TP_PHASES; channel = ch; }
      }
    }
  });
  return { peak, db: +(20 * Math.log10(peak + 1e-30)).toFixed(2), at: +at.toFixed(3), channel };
}

export function truePeak(channels) {
  return truePeakDetail(channels).db;
}

// The largest one-sample move inside a window of `ms` around each of the
// given times, per channel: a step on a hit reads as a click, and a 56 Hz sine
// near full scale moves under 0.01 a sample. A clap's noise moves as much as
// a step does, so each move is also given against the median move of the
// 20 ms round it: a discontinuity stands alone (the captures that started
// this were 40 times their neighbours), a burst of noise does not.
export function clicks(channels, fs, times, ms = 2) {
  const half = Math.round((ms / 1000) * fs / 2);
  const wide = Math.round(0.01 * fs);
  return times.map((t) => {
    const c0 = Math.round(t * fs);
    let worst = 0, at = c0;
    const around = [];
    for (const c of channels) {
      for (let i = Math.max(1, c0 - half); i < Math.min(c.length, c0 + half); i++) {
        const d = Math.abs(c[i] - c[i - 1]);
        if (d > worst) { worst = d; at = i; }
      }
      for (let i = Math.max(1, c0 - wide); i < Math.min(c.length, c0 + wide); i++) around.push(Math.abs(c[i] - c[i - 1]));
    }
    around.sort((a, b) => a - b);
    const median = around.length ? around[around.length >> 1] : 0;
    return { t: +t.toFixed(4), step: +worst.toFixed(4), at: +(at / fs).toFixed(5), ratio: +(worst / (median + 1e-6)).toFixed(1) };
  });
}

// The same move, asked of one channel at a time: the largest one-sample step
// in `ms` around each time where the *other* channel held still — it moved
// less than `share` of it. Two channels carrying one drum move together; a
// step in one of them alone is not a transient, it is the two channels having
// been filtered differently, and it arrives in one ear.
//
// This is the measurement the browser suite needs that the one above cannot
// make. `clicks` takes the worst move over both channels, so a hat's own
// broadband noise — which is decorrelated on purpose — reads the same as a
// discontinuity, and a step that is in the right channel only reads the same
// as one in both. MEASURED on seed 1 in Firefox: a lone kick moved 0.5235 in
// the right channel while the left moved 0.0003, and the same eight bars in
// WebKit moved 0.0001 either side. Nothing in `clicks` could see that.
export function sidedClicks(channels, fs, times, ms = 2, share = 1 / 3) {
  const L = channels[0];
  const R = channels[1] || channels[0];
  const half = Math.round((ms / 1000) * fs / 2);
  const wide = Math.round(0.01 * fs);
  const n = Math.min(L.length, R.length);
  const sided = (i) => {
    const dl = Math.abs(L[i] - L[i - 1]);
    const dr = Math.abs(R[i] - R[i - 1]);
    const big = dr > dl ? dr : dl;
    const small = dr > dl ? dl : dr;
    return small > big * share ? { step: 0, side: 'both' } : { step: big, side: dr > dl ? 'right' : 'left' };
  };
  return times.map((t) => {
    const c0 = Math.round(t * fs);
    let worst = 0, at = c0, side = 'both';
    for (let i = Math.max(1, c0 - half); i < Math.min(n, c0 + half); i++) {
      const s = sided(i);
      if (s.step > worst) { worst = s.step; at = i; side = s.side; }
    }
    const around = [];
    for (let i = Math.max(1, c0 - wide); i < Math.min(n, c0 + wide); i++) around.push(sided(i).step);
    around.sort((a, b) => a - b);
    const median = around.length ? around[around.length >> 1] : 0;
    return { t: +t.toFixed(4), step: +worst.toFixed(4), side, at: +(at / fs).toFixed(5), ratio: +(worst / (median + 1e-6)).toFixed(1) };
  });
}

// --- the self-test ----------------------------------------------------------
//
//   node tools/meter.mjs --selftest
//
// Signals whose answer is known on paper, so the meter is checked against
// arithmetic instead of against its own last reading. The five impulses are
// the counterexamples from the review: a hundred samples holding one 0 dBFS
// impulse reads 0 dBTP wherever the impulse sits, including the first sample
// and the last. The sweeps are the other half of the same question — a tone
// near the Nyquist rate passes between its samples, and the meter has to find
// that peak from every phase and never read under the samples it was given.

const SINE = (n, f, phase, a = 1) => {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = a * Math.sin(2 * Math.PI * f * i + phase);
  return x;
};

export function selfTest() {
  const out = [];
  const t = (name, pass, detail) => out.push({ name, pass: !!pass, detail });

  // 1. an impulse anywhere in the buffer is 0 dBFS and cannot read under it
  for (const i of [0, 1, 50, 76, 99]) {
    const x = new Float32Array(100);
    x[i] = 1;
    const r = truePeakDetail([x]);
    t(`impulse at ${i} of 100`, r.db >= -0.001 && Math.abs(r.at - i) <= 0.75,
      `${r.db.toFixed(2)} dBTP at sample ${r.at}`);
  }
  // and the level it reads is the level it was given
  {
    const x = new Float32Array(100);
    x[7] = 0.5;
    const r = truePeakDetail([x]);
    t('a half-scale impulse reads -6 dBTP', r.db >= -6.03 && r.db <= -4.8, `${r.db.toFixed(2)} dBTP`);
  }
  // 2. the sample peak is a floor, on a signal with no tidy answer
  {
    let s = 12345;
    const x = new Float32Array(4000);
    for (let i = 0; i < x.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; x[i] = (s / 0x3fffffff - 1) * 0.8; }
    const sp = 20 * Math.log10(samplePeak([x]));
    const tp = truePeak([x]);
    t('true peak is never under the sample peak', tp >= sp - 0.001, `${tp.toFixed(2)} dBTP over ${sp.toFixed(2)} dBFS`);
  }
  // 3. a quarter-rate tone sampled at 45 degrees: every sample is 0.707, and
  //    the waveform still touches 1.0 between two of them
  {
    const x = SINE(512, 0.25, Math.PI / 4);
    const sp = 20 * Math.log10(samplePeak([x]));
    const tp = truePeak([x]);
    t('the peak between the samples is found', tp >= -0.1 && tp <= 1.2 && tp - sp >= 2.8,
      `${tp.toFixed(2)} dBTP over ${sp.toFixed(2)} dBFS of samples`);
  }
  // 4. the same tone from every phase, at four frequencies: the true peak of a
  //    full-scale tone is 0 dBTP, the meter may only err upwards, and up to
  //    0.45 of the sample rate the over-read stays inside 1.5 dB
  {
    let under = null, low = 99, high = -99;
    for (const f of [0.1, 0.25, 1 / 3, 0.45]) {
      let best = -99;
      for (let p = 0; p < 64; p++) {
        const x = SINE(2048, f, (p * 2 * Math.PI) / 64);
        const sp = 20 * Math.log10(samplePeak([x]));
        const tp = truePeak([x]);
        if (tp < sp - 0.001 && !under) under = `${f.toFixed(3)} at phase ${p}: ${tp} under ${sp.toFixed(2)}`;
        if (tp > best) best = tp;
        if (tp > high) high = tp;
      }
      if (best < low) low = best;
    }
    t('a phase sweep never reads under its own samples', !under, under || 'four frequencies, 64 phases each');
    t('a full-scale tone reads 0 dBTP, erring high', low >= -0.1 && high <= 1.5,
      `worst phase of each frequency reaches ${low.toFixed(2)} dBTP; the highest reading anywhere is ${high.toFixed(2)}`);
  }
  // 5. zeros round a signal are not a signal: padding must not change a reading
  {
    const x = SINE(500, 0.3, 0.7);
    for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-i / 200);
    const padded = new Float32Array(700);
    padded.set(x, 100);
    const a = truePeak([x]), b = truePeak([padded]);
    t('a reading does not move when the buffer is padded', Math.abs(a - b) <= 0.01, `${a} and ${b} dBTP`);
  }
  // 6. the degenerate buffers still return a number
  {
    const one = new Float32Array(1); one[0] = 1;
    const silence = new Float32Array(100);
    const dc = new Float32Array(100).fill(1);
    const vals = [truePeak([one]), truePeak([silence]), truePeak([dc]), truePeak([new Float32Array(0)])];
    t('a one-sample, a silent and an empty buffer are finite', vals.every((v) => Number.isFinite(v)) && vals[0] >= -0.001,
      vals.map((v) => v.toFixed(2)).join(', ') + ' dBTP');
  }
  // 7. loudness, against the standard's own calibration rather than against a
  //    previous reading: a 1 kHz tone at -23 dBFS in both channels is -23 LUFS
  {
    const x = SINE(48000 * 3, 1000 / 48000, 0, Math.pow(10, -23 / 20));
    const l = integratedLoudness([x, x], 48000);
    t('a -23 dBFS 1 kHz tone in both channels reads -23 LUFS', Math.abs(l + 23) <= 0.1, `${l} LUFS`);
  }
  // 8. the one-sided click meter, on signals whose answer is arithmetic: two
  //    channels carrying the same drum have no side to find however hard the
  //    drum hits, and a step put into one of them alone reads at its own height
  //    and names the channel it is in.
  {
    const ramp = new Float32Array(2000);
    for (let i = 0; i < ramp.length; i++) ramp[i] = Math.sin((2 * Math.PI * 900 * i) / 48000) * Math.exp(-i / 300);
    const same = sidedClicks([ramp, ramp], 48000, [0.001], 4);
    t('a hit that is the same in both channels is not one-sided', same[0].step === 0 && same[0].side === 'both',
      `${same[0].step} in the ${same[0].side}`);
    const right = Float32Array.from(ramp);
    for (let i = 40; i < right.length; i++) right[i] += 0.3;
    const one = sidedClicks([ramp, right], 48000, [40 / 48000], 4);
    // The 900 Hz tone under the step moves 0.004 a sample of its own, so the
    // reading is the step plus or minus that and not the step exactly.
    t('a 0.3 step in the right channel alone reads 0.3 in the right', Math.abs(one[0].step - 0.3) < 0.01 && one[0].side === 'right',
      `${one[0].step} in the ${one[0].side}`);
    const left = Float32Array.from(ramp);
    for (let i = 40; i < left.length; i++) left[i] -= 0.3;
    const two = sidedClicks([left, ramp], 48000, [40 / 48000], 4);
    t('the mirror of it reads in the left', Math.abs(two[0].step - 0.3) < 0.01 && two[0].side === 'left',
      `${two[0].step} in the ${two[0].side}`);
    // A step both channels take together is the drum's own onset and is not
    // what this meter is for, however large it is.
    const both = Float32Array.from(ramp);
    for (let i = 40; i < both.length; i++) both[i] += 0.9;
    const w = sidedClicks([both, both], 48000, [40 / 48000], 4);
    t('a 0.9 step both channels take together reads nothing', w[0].step === 0, `${w[0].step}`);
  }
  return out;
}

// Node only, and only when asked: the page imports this file for its meters.
if (typeof process !== 'undefined' && process.argv && process.argv.includes('--selftest')) {
  const results = selfTest();
  for (const r of results) console.log(`  ${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}: ${r.detail}`);
  const bad = results.filter((r) => !r.pass).length;
  console.log(bad ? `\n${bad} of ${results.length} failed` : `\nall ${results.length} passed`);
  process.exit(bad ? 1 : 0);
}
