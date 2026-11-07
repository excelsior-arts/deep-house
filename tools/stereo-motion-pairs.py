# stereo-motion (10-31): the sketches' and the pairs' measure and level match. A scratch tool: nothing here ships.
#
#   python tools/stereo-motion-pairs.py measure <dir> <name> [<name> ...]
#       per render: the section table (the chord band's and the whole side/mid, corr, the fold) and the 4-bar series
#   python tools/stereo-motion-pairs.py pair <dir> <out dir> <before> <after> [<after2> ...]
#       level-matched to the before by integrated loudness (BS.1770 K-weighting, gated), a common peak guard, 16-bit;
#       prints each one's loudness after the match and the measure

import json
import os
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

sys.path.insert(0, os.path.dirname(__file__))
from stereo_motion_measure import read, measure  # noqa: E402


def kfilter(x, rate):
    # BS.1770 pre-filter (high shelf) and RLB high-pass, worked out for any rate
    import math
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / rate)
    Vh, Vb = 10 ** (G / 20), (10 ** (G / 20)) ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / rate)
    a0 = 1 + K / Q + K * K
    b2 = [1, -2, 1]
    a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    return lfilter(b2, a2, lfilter(b1, a1, x))


def lufs(L, R, rate):
    l, r = kfilter(L, rate), kfilter(R, rate)
    blk, hop = int(0.4 * rate), int(0.1 * rate)
    z = []
    for s in range(0, len(l) - blk + 1, hop):
        z.append(np.mean(l[s:s + blk] ** 2) + np.mean(r[s:s + blk] ** 2))
    z = np.array(z)
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z1 = z[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(z1)) - 10
    z2 = z1[(-0.691 + 10 * np.log10(np.maximum(z1, 1e-20))) > rel]
    return float(-0.691 + 10 * np.log10(np.mean(z2)))


def table(path, facts):
    m = measure(path, facts)
    rows = [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in s.items()} for s in m.get('sections', [])]
    return m, rows


def series(path, facts, bars=4):
    # the chord band's side/mid and the whole's, in windows of `bars` bars, so a walk shows
    rate, L, R = read(path)
    bs = facts['barSeconds']
    out = []
    n = int(bars * bs * rate)
    for s in range(0, len(L) - n + 1, n):
        l, r = L[s:s + n], R[s:s + n]
        lw, rw = np.fft.rfft(l), np.fft.rfft(r)
        f = np.fft.rfftfreq(n, 1 / rate)
        band = (f >= 300) & (f < 2000)
        m2, s2 = np.abs((lw + rw) / 2) ** 2, np.abs((lw - rw) / 2) ** 2
        out.append({'bar': facts['fromBar'] + round(s / rate / bs), 'sm_mid': round(float(10 * np.log10(s2[band].sum() / m2[band].sum())), 2),
                    'sm': round(float(10 * np.log10(s2.sum() / m2.sum())), 2),
                    'fold': round(float(10 * np.log10(m2.sum() / ((np.abs(lw) ** 2 + np.abs(rw) ** 2).sum() / 2))), 2)})
    return out


def write16(path, rate, x):
    wavfile.write(path, rate, (np.clip(x, -1, 1) * 32767).astype(np.int16))


if sys.argv[1] == 'measure':
    d = sys.argv[2]
    res = {}
    for name in sys.argv[3:]:
        facts = json.load(open(os.path.join(d, name + '.json')))
        m, rows = table(os.path.join(d, name + '.wav'), facts)
        res[name] = {'sections': rows, 'series': series(os.path.join(d, name + '.wav'), facts),
                     'whole': {k: round(m[k], 2) for k in ('sm_mid', 'sm_air', 'sm', 'corr', 'corr_p5', 'fold_db', 'bal') if k in m}}
        print(name, json.dumps(res[name]['whole']))
        for r in rows:
            print('   ', r['kind'], r['startBar'], 'sm_mid', r['sm_mid'], 'sm', r['sm'], 'corr', r['corr'], 'fold', r['fold'])
        print('    series', ' '.join(f"{s['bar']}:{s['sm_mid']}" for s in res[name]['series']))
    print(json.dumps(res), file=open(os.path.join(d, 'measure-' + '-'.join(sys.argv[3:4]) + '.json'), 'w'))
    sys.exit()

if sys.argv[1] == 'pair':
    d, out, names = sys.argv[2], sys.argv[3], sys.argv[4:]
    os.makedirs(out, exist_ok=True)
    data = [read(os.path.join(d, n + '.wav')) for n in names]
    rate = data[0][0]
    n = min(len(x[1]) for x in data)
    ref = lufs(data[0][1][:n], data[0][2][:n], rate)
    sts = []
    for (_, L, R) in data:
        g = 10 ** ((ref - lufs(L[:n], R[:n], rate)) / 20)
        sts.append(np.stack([L[:n], R[:n]], axis=1) * g)
    peak = max(np.abs(s).max() for s in sts)
    k = 0.98 / peak if peak > 0.98 else 1
    facts = {}
    for name, s in zip(names, sts):
        p = os.path.join(out, name + '.wav')
        write16(p, rate, s * k)
        _, L, R = read(p)
        fj = json.load(open(os.path.join(d, name + '.json')))
        m, rows = table(p, fj)
        facts[name] = {'file': p, 'lufs': round(lufs(L, R, rate), 2), 'whole': {kk: round(m[kk], 2) for kk in ('sm_mid', 'sm_air', 'sm', 'corr', 'corr_p5', 'fold_db', 'bal') if kk in m},
                       'sections': [{kk: r[kk] for kk in ('kind', 'startBar', 'bars', 'sm_mid', 'sm', 'corr', 'fold')} for r in rows]}
        print(name, facts[name]['lufs'], json.dumps(facts[name]['whole']))
    print(json.dumps(facts), file=open(os.path.join(out, names[0] + '.facts.json'), 'w'))
