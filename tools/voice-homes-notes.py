# voice-homes (11-01), scratch: the piano's notes one by one (tools/voice-homes-notes.ts), what a piano does, measured.
#
#   python tools/voice-homes-notes.py <dir> <variant> [<variant> ...]
#
# Per note (onset at start + i * gap): the level at 0.05/0.3/1/2 s under its peak (dB, 20 ms RMS), the prompt slope
# (dB/s from 0.05 to 0.3 s) and the aftersound's (0.6 to 1.1 s), the spectral centroid of the first 80 ms and of 0.3 to
# 0.6 s, the fundamental's pitch against equal temperament (cents, 0.15 to 1.0 s), the beating (the fundamental's and
# the second partial's envelope, its std in dB over 0.3 to 1.2 s, detrended), and the L/R correlation.
import json
import os
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfiltfilt, hilbert

d = sys.argv[1]
meta = json.load(open(os.path.join(d, 'notes.json')))
gap, start, notes = meta['gap'], meta['start'], meta['notes']


def env_db(x, rate, hop=0.01, win=0.02):
    h, w = int(hop * rate), int(win * rate)
    return np.array([10 * np.log10(np.mean(x[i:i + w] ** 2) + 1e-20) for i in range(0, len(x) - w, h)])


def band_env(x, rate, f, rel=0.03):
    lo, hi = f * (1 - rel), f * (1 + rel)
    sos = butter(2, [lo, hi], btype='band', fs=rate, output='sos')
    y = sosfiltfilt(sos, x)
    return 20 * np.log10(np.abs(hilbert(y)) + 1e-12)


def beat_db(x, rate, f):
    a, b = int(0.3 * rate), int(1.2 * rate)
    e = band_env(x, rate, f)[a:b][::48]
    t = np.arange(len(e))
    p = np.polyfit(t, e, 1)
    return float(np.std(e - np.polyval(p, t)))


def centroid(x, rate):
    w = np.fft.rfft(x * np.hanning(len(x)))
    f = np.fft.rfftfreq(len(x), 1 / rate)
    p = np.abs(w) ** 2
    return float((f * p).sum() / max(p.sum(), 1e-20))


def hi_share(x, rate, lo=1000, hi=5000):
    w = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / rate)
    return float(10 * np.log10(w[(f >= lo) & (f < hi)].sum() / max(w.sum(), 1e-20)))


def pitch_cents(x, rate, f0):
    n = 1 << 19
    w = np.fft.rfft(x * np.hanning(len(x)), n)
    f = np.fft.rfftfreq(n, 1 / rate)
    m = (f > f0 * 0.97) & (f < f0 * 1.03)
    i = np.argmax(np.abs(w[m])) + np.argmax(m)
    a, b, c = np.log(np.abs(w[i - 1:i + 2]) + 1e-20)
    k = i + 0.5 * (a - c) / (a - 2 * b + c)
    return float(1200 * np.log2(k * rate / n / f0))


res = {}
for name in sys.argv[2:]:
    rate, x = wavfile.read(os.path.join(d, name + '.wav'))
    x = x.astype(np.float64)
    rows = []
    for i, nt in enumerate(notes):
        s = int((start + i * gap) * rate)
        L, R = x[s:s + int(gap * rate), 0], x[s:s + int(gap * rate), 1]
        m = (L + R) / 2
        e = env_db(m, rate)
        pk = e.max()
        at = lambda t: float(e[min(len(e) - 1, int(t / 0.01))] - pk)
        f0 = 440 * 2 ** ((nt['midi'] - 69) / 12)
        under40 = np.argmax(e < pk - 40) * 0.01 if (e < pk - 40).any() else float('nan')
        rows.append({'midi': nt['midi'], 'vel': nt['vel'], 'dur': nt['dur'], 'peak': round(float(pk), 1),
                     'l03': round(at(0.3), 1), 'l1': round(at(1.0), 1), 'l2': round(at(2.0), 1),
                     'prompt': round((at(0.3) - at(0.05)) / 0.25, 1), 'after': round((at(1.1) - at(0.6)) / 0.5, 1), 't40': round(under40, 2),
                     'c_att': round(centroid(m[:int(0.08 * rate)], rate)), 'c_body': round(centroid(m[int(0.3 * rate):int(0.6 * rate)], rate)),
                     'hi_att': round(hi_share(m[:int(0.15 * rate)], rate), 1),
                     'cents': round(pitch_cents(m[int(0.15 * rate):int(1.0 * rate)], rate, f0), 2),
                     'beat1': round(beat_db(m, rate, f0), 2), 'beat2': round(beat_db(m, rate, 2 * f0 * 1.0005), 2),
                     'corr': round(float(np.sum(L * R) / np.sqrt(np.sum(L * L) * np.sum(R * R) + 1e-20)), 2)})
    res[name] = rows
    print(name)
    print('  midi vel  dur  peak   @0.3   @1    @2  prompt after  t40  c_att c_body hi_att cents beat1 beat2 corr')
    for r in rows:
        print(f"  {r['midi']:3} {r['vel']:.2f} {r['dur']:4} {r['peak']:6} {r['l03']:6} {r['l1']:6} {r['l2']:6} {r['prompt']:6} {r['after']:6} {r['t40']:5} {r['c_att']:5} {r['c_body']:5} {r['hi_att']:6} {r['cents']:5} {r['beat1']:5} {r['beat2']:5} {r['corr']:5}")
json.dump(res, open(os.path.join(d, 'measure-' + '-'.join(sys.argv[2:]) + '.json'), 'w'), indent=1)
