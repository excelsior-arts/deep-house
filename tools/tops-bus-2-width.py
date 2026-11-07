"""tops-bus-2 (11-02), scratch: the top's width and phase, whole track and bar by bar, before against after.

  python -I tools/tops-bus-2-width.py <before dir> <after dir> <out.json> [names...]

Per track (each render's facts JSON beside its WAV gives the bars): at matched loudness (each side at its own LUFS),
  - side/mid in 2-6, 6-10, 10-16 and 6-16 kHz (dB: the side's power against the mid's, the gap's measure);
  - L/R correlation in the same bands (+1 mono, 0 two unrelated ears, under 0 anti-phase), whole track, and the
    lowest 1-bar value where the band carries anything;
  - the top's level (6-16 kHz, dB re LUFS) whole track: the standing rule (no level goes up top);
  - 6-16 kHz side/mid by section, to see the form's steps (T24).
"""
import json, os, sys
import numpy as np
import scipy.signal as ss
import soundfile as sf
import pyloudnorm as pyln

B, A, OUT = sys.argv[1:4]
NAMES = sys.argv[4:] or sorted(f[:-4] for f in os.listdir(A) if f.endswith('.wav'))
BANDS = {'2-6k': (2000, 6000), '6-10k': (6000, 10000), '10-16k': (10000, 16000), '6-16k': (6000, 16000)}
db = lambda p: 10 * np.log10(max(p, 1e-20))


def read(d, name):
    x, rate = sf.read(f'{d}/{name}.wav', dtype='float32', always_2d=True)
    facts = json.load(open(f'{d}/{name}.json'))
    lufs = pyln.Meter(rate).integrated_loudness(x.astype(np.float64))
    return x, rate, facts, lufs


def stats(x, rate, facts, lufs):
    bs = facts['barSeconds'] if 'barSeconds' in facts else None
    out = {'lufs': round(lufs, 2), 'bands': {}, 'sections': []}
    for k, (lo, hi) in BANDS.items():
        sos = ss.butter(4, [lo, hi], 'bandpass', fs=rate, output='sos')
        y = ss.sosfilt(sos, x, axis=0).astype(np.float64)
        L, R = y[:, 0], y[:, 1]
        m, s = (L + R) / 2, (L - R) / 2
        pm, ps = np.mean(m ** 2), np.mean(s ** 2)
        corr = float(np.sum(L * R) / np.sqrt(np.sum(L ** 2) * np.sum(R ** 2) + 1e-30))
        lows = []
        if bs:
            n = int(round(bs * rate))
            full = np.mean(L ** 2 + R ** 2)
            for i in range(0, len(L) - n, n):
                l, r = L[i:i + n], R[i:i + n]
                e = np.mean(l ** 2 + r ** 2)
                if e < full * 0.05: continue  # a bar the band hardly plays in
                lows.append(float(np.sum(l * r) / np.sqrt(np.sum(l ** 2) * np.sum(r ** 2) + 1e-30)))
        out['bands'][k] = {'sideMidDb': round(db(ps) - db(pm), 2), 'corr': round(corr, 3), 'corrLowestBar': round(min(lows), 3) if lows else None,
                           'levelReLufs': round(db(np.mean((L ** 2 + R ** 2) / 2)) - lufs, 2)}
        if k == '6-16k' and bs:
            for sec in facts.get('sections', []):
                a, b = int(sec['startBar'] * bs * rate), int((sec['startBar'] + sec['bars']) * bs * rate)
                mm, sx = m[a:b], s[a:b]
                if len(mm) == 0: continue
                out['sections'].append({'sec': f"{sec['kind']}@{sec['startBar']}", 'sideMidDb': round(db(np.mean(sx ** 2)) - db(np.mean(mm ** 2)), 2),
                                        'levelReLufs': round(db(np.mean((L[a:b] ** 2 + R[a:b] ** 2) / 2)) - lufs, 2)})
    return out


res = {}
for name in NAMES:
    row = {}
    for side, d in (('before', B), ('after', A)):
        if not os.path.exists(f'{d}/{name}.wav'): continue
        x, rate, facts, lufs = read(d, name)
        row[side] = stats(x, rate, facts, lufs)
    res[name] = row
    if 'before' in row and 'after' in row:
        b, a = row['before']['bands'], row['after']['bands']
        print(f"{name:24s} 6-16k S/M {b['6-16k']['sideMidDb']:6.2f} -> {a['6-16k']['sideMidDb']:6.2f} | level {b['6-16k']['levelReLufs']:6.2f} -> {a['6-16k']['levelReLufs']:6.2f}"
              f" | corr 2-6 {b['2-6k']['corr']:.2f}->{a['2-6k']['corr']:.2f} 6-10 {b['6-10k']['corr']:.2f}->{a['6-10k']['corr']:.2f} 10-16 {b['10-16k']['corr']:.2f}->{a['10-16k']['corr']:.2f}"
              f" | lowest bar 10-16 {a['10-16k']['corrLowestBar']} 6-10 {a['6-10k']['corrLowestBar']}")
json.dump(res, open(OUT, 'w'), indent=1)
