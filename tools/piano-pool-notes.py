# piano-pool (11-01), scratch: the notes of tools/piano-pool-notes.ts, measured one by one.
#
#   python tools/piano-pool-notes.py <dir> <render> [<render> ...] [--vs <render>] [--by life|midi|vel] [--json out]
#
# Per note: the strike (K-weighted loudness of its first 0.4 s, LUFS), the ring (0.4-2.0 s), the colour (the spectral
# centroid of the first 80 ms and of 0.3-0.6 s), the share of 1-5 kHz in the first 150 ms. With --vs, each render's
# difference from that one, note by note, summarised by the --by key (mean and the worst).
import json
import os
import sys
import numpy as np
import pyloudnorm as pyln
from scipy.io import wavfile

args = sys.argv[1:]
d = args.pop(0)
vs = by = jout = None
if '--vs' in args: i = args.index('--vs'); vs = args[i + 1]; del args[i:i + 2]
if '--by' in args: i = args.index('--by'); by = args[i + 1]; del args[i:i + 2]
if '--json' in args: i = args.index('--json'); jout = args[i + 1]; del args[i:i + 2]
names = args + ([vs] if vs and vs not in args else [])
meta = json.load(open(os.path.join(d, 'notes.json')))
win, start, notes = meta['window'], meta['start'], meta['notes']


def kweight(x, rate):
    m = pyln.Meter(rate)
    y = x.copy()
    for f in m._filters.values():
        y = f.apply_filter(y)
    return y


def lufs(y):
    ms = np.mean(np.sum(y ** 2, axis=1)) if y.ndim == 2 else np.mean(y ** 2)
    return -0.691 + 10 * np.log10(ms + 1e-20)


def centroid(x, rate):
    w = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / rate)
    return float((f * w).sum() / max(w.sum(), 1e-20))


def hi_share(x, rate, lo=1000, hi=5000):
    w = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / rate)
    return float(10 * np.log10(w[(f >= lo) & (f < hi)].sum() / max(w.sum(), 1e-20)))


res = {}
for name in names:
    rate, x = wavfile.read(os.path.join(d, name + '.wav'))
    x = x.astype(np.float64)
    n = int(round(win * rate))
    rows = []
    for i, nt in enumerate(notes):
        seg = x[i * n:(i + 1) * n]
        s = int(start * rate)
        k = np.stack([kweight(seg[:, 0], rate), kweight(seg[:, 1], rate)], axis=1)
        m = (seg[:, 0] + seg[:, 1]) / 2
        r = {**nt, 'strike': lufs(k[s:s + int(0.4 * rate)]), 'ring': lufs(k[s + int(0.4 * rate):s + int(min(2.0, win - start) * rate)]) if win >= 1 else None,
             'c_att': centroid(m[s:s + int(0.08 * rate)], rate), 'c_body': centroid(m[s + int(0.3 * rate):s + int(0.6 * rate)], rate),
             'hi': hi_share(m[s:s + int(0.15 * rate)], rate)}
        rows.append(r)
    res[name] = rows


def key_of(r):
    return r.get('dur') if by == 'life' else r.get(by) if by else 'all'


for name in args:
    rows = res[name]
    if vs:
        base = res[vs]
        groups = {}
        for a, b in zip(rows, base):
            groups.setdefault(key_of(a), []).append((a['strike'] - b['strike'], (a['ring'] or 0) - (b['ring'] or 0), a['c_att'] - b['c_att']))
        print(f'{name} vs {vs}: strike dB (mean, min, max) | ring dB mean | attack centroid Hz mean')
        allv = [g[0] for v in groups.values() for g in v]
        for k, v in groups.items():
            s = [g[0] for g in v]
            print(f'  {by or "all"} {k}: {np.mean(s):+.2f} ({min(s):+.2f} .. {max(s):+.2f}) | {np.mean([g[1] for g in v]):+.2f} | {np.mean([g[2] for g in v]):+.0f}')
        print(f'  overall {np.mean(allv):+.2f}  rms {np.sqrt(np.mean(np.square(allv))):.2f}')
    else:
        print(name)
        print('  midi  vel  dur  strike  ring   c_att c_body   hi')
        for r in rows:
            print(f"  {r['midi']:4} {r['vel']:.2f} {r['dur']:4} {r['strike']:7.2f} {r['ring'] if r['ring'] is None else round(r['ring'], 2):7} {r['c_att']:6.0f} {r['c_body']:6.0f} {r['hi']:6.1f}")
if jout:
    json.dump(res, open(jout, 'w'), indent=1)
