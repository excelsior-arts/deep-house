# voice-homes (11-01), scratch: the piano's width and the mix's, a sketch against the base and the pre-stereo renders.
#
#   python tools/voice-homes-measure.py <out.json> <label>=<renders dir> [<label>=<dir> ...] [--names a,b]
#
# Per track (a render `<name>.wav` with `-dry`, `-room0`, `-keys`, `-keys-dry` beside it where they were rendered):
#   - the piano stem (`-keys`): its side over mid (dB, whole and 300-2k), its correlation (mean, 5th percentile, the share
#     of 1 s blocks under nought), its balance L over R, and its loudness;
#   - the dry stem (`-keys-dry`): the same, with every send at nought (what the voice alone stands as);
#   - the mix: its side over mid (whole, the chord band 300-2k), its correlation and loudness;
#   - the wash: the mix less its `-dry` twin, in dB under the mix (RMS), and less the short room where `-room0` is there.
import json
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from stereo_motion_measure import read, measure  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'packages', 'deep-house', 'tools'))


def kfilter(x, rate):
    import math
    from scipy.signal import lfilter
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / rate)
    Vh, Vb = 10 ** (G / 20), (10 ** (G / 20)) ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / rate)
    a0 = 1 + K / Q + K * K
    return lfilter([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], lfilter(b1, a1, x))


def lufs(L, R, rate):
    l, r = kfilter(L, rate), kfilter(R, rate)
    blk, hop = int(0.4 * rate), int(0.1 * rate)
    z = np.array([np.mean(l[s:s + blk] ** 2) + np.mean(r[s:s + blk] ** 2) for s in range(0, len(l) - blk + 1, hop)])
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z1 = z[lk > -70]
    if not len(z1): return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(z1)) - 10
    z2 = z1[(-0.691 + 10 * np.log10(np.maximum(z1, 1e-20))) > rel]
    return float(-0.691 + 10 * np.log10(np.mean(z2)))


def rmsdb(x): return float(10 * np.log10(max(np.mean(x ** 2), 1e-20)))


def stem(path):
    if not os.path.exists(path): return None
    m = measure(path)
    if m.get('empty'): return None
    rate, L, R = read(path)
    return {'sm': round(m['sm'], 1), 'sm_mid': round(m.get('sm_mid', float('nan')), 1), 'corr': round(m['corr'], 2),
            'p5': round(m['corr_p5'], 2), 'under0': round(m['corr_under0'] * 100), 'bal': round(m['bal'], 1),
            'lufs': round(lufs(L, R, rate), 1)}


argv = [a for a in sys.argv[1:] if not a.startswith('--')]
names = None
for a in sys.argv:
    if a.startswith('--names='): names = a.split('=', 1)[1].split(',')
out = argv[0]
dirs = [a.split('=', 1) for a in argv[1:]]
if names is None:
    names = sorted({n[:-4] for n in os.listdir(dirs[0][1]) if n.endswith('.wav') and not any(n.endswith(s + '.wav') for s in ('-dry', '-room0', '-keys', '-keys-dry'))})
res = {}
for n in names:
    res[n] = {}
    for label, d in dirs:
        p = os.path.join(d, n + '.wav')
        if not os.path.exists(p): continue
        rate, L, R = read(p)
        m = measure(p)
        row = {'mix': {'sm': round(m['sm'], 1), 'sm_mid': round(m['sm_mid'], 1), 'corr': round(m['corr'], 2), 'lufs': round(lufs(L, R, rate), 2)}}
        q = os.path.join(d, n + '-dry.wav')
        if os.path.exists(q):
            _, dl, dr = read(q)
            k = min(len(L), len(dl))
            wl, wr = L[:k] - dl[:k], R[:k] - dr[:k]
            mixdb = rmsdb(np.concatenate([L[:k], R[:k]]))
            row['wash'] = round(rmsdb(np.concatenate([wl, wr])) - mixdb, 1)
            r0 = os.path.join(d, n + '-room0.wav')
            if os.path.exists(r0):
                _, nl, nr = read(r0)
                k2 = min(k, len(nl))
                row['washNoRoom'] = round(rmsdb(np.concatenate([nl[:k2] - dl[:k2], nr[:k2] - dr[:k2]])) - mixdb, 1)
        row['keys'] = stem(os.path.join(d, n + '-keys.wav'))
        row['keysDry'] = stem(os.path.join(d, n + '-keys-dry.wav'))
        res[n][label] = row
    print(n)
    for label, v in res[n].items():
        k, kd = v.get('keys') or {}, v.get('keysDry') or {}
        print(f"  {label:12s} mix sm {v['mix']['sm']:6} chord {v['mix']['sm_mid']:6} corr {v['mix']['corr']:5} lufs {v['mix']['lufs']:6} | wash {v.get('wash', '-'):5} noroom {v.get('washNoRoom', '-'):5}"
              f" | keys sm {k.get('sm', '-'):5} mid {k.get('sm_mid', '-'):5} corr {k.get('corr', '-'):5} p5 {k.get('p5', '-'):5} <0 {k.get('under0', '-'):3}% bal {k.get('bal', '-'):5} lufs {k.get('lufs', '-'):6}"
              f" | dry sm {kd.get('sm', '-'):5} corr {kd.get('corr', '-'):5} lufs {kd.get('lufs', '-')}")
json.dump(res, open(out, 'w'), indent=1)
