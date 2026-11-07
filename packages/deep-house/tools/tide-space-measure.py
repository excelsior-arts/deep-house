# Round tide-space (11-01), scratch: the wash of each render against the same window with every send at nought.
#
#   python tools/tide-space-measure.py <out.json> <label>=<renders dir> [<label>=<dir> ...]
#
# Per name and label: the mix's loudness (BS.1770, gated), the wash's level (returns = mix less dry, sample by sample:
# the same program and graph with the sends at nought) and its share of the mix (returns over mix, RMS, dB), the
# wash's own loudness under the mix's (LUFS of the returns less the mix's), and the returns' correlation; with a
# `-room0` render beside (the short room off), the wash without the room (`wash`) and the room alone (`room`).
import json
import os
import sys
import numpy as np
from scipy.io import wavfile



def read(path):
    rate, x = wavfile.read(path)
    x = x.astype(np.float64)
    if np.max(np.abs(x)) > 2: x = x / 32768.0
    return rate, x


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


def lufs(x, rate):
    l, r = kfilter(x[:, 0], rate), kfilter(x[:, 1], rate)
    blk, hop = int(0.4 * rate), int(0.1 * rate)
    z = np.array([np.mean(l[s:s + blk] ** 2) + np.mean(r[s:s + blk] ** 2) for s in range(0, len(l) - blk + 1, hop)])
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    z1 = z[lk > -70]
    if not len(z1): return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(z1)) - 10
    z2 = z1[(-0.691 + 10 * np.log10(np.maximum(z1, 1e-20))) > rel]
    return float(-0.691 + 10 * np.log10(np.mean(z2)))


def db(v): return 20 * np.log10(max(v, 1e-9))
def rms(x): return float(np.sqrt(np.mean(x ** 2)))


def corr(x):
    L, R = x[:, 0], x[:, 1]
    d = np.sqrt(np.sum(L ** 2) * np.sum(R ** 2))
    return float(np.sum(L * R) / d) if d > 0 else 1.0


out = sys.argv[1]
dirs = [a.split('=', 1) for a in sys.argv[2:]]
names = sorted({n[:-4] for n in os.listdir(dirs[0][1]) if n.endswith('.wav') and not n.endswith('-dry.wav')})
res = {}
for n in names:
    res[n] = {}
    for label, d in dirs:
        p, q = os.path.join(d, n + '.wav'), os.path.join(d, n + '-dry.wav')
        if not (os.path.exists(p) and os.path.exists(q)): continue
        rate, mix = read(p)
        _, dry = read(q)
        k = min(len(mix), len(dry))
        ret = mix[:k] - dry[:k]
        res[n][label] = {'lufs': round(lufs(mix, rate), 2), 'share': round(db(rms(ret)) - db(rms(mix[:k])), 1),
                         'washLufs': round(lufs(ret, rate) - lufs(mix[:k], rate), 1), 'corr': round(corr(ret), 2)}
        # with a `-room0` render (the short room and the kit's floor into it at nought): the wash without the room
        r0 = os.path.join(d, n + '-room0.wav')
        if os.path.exists(r0):
            _, nr = read(r0)
            k2 = min(k, len(nr))
            wash, room = nr[:k2] - dry[:k2], mix[:k2] - nr[:k2]
            res[n][label].update({'wash': round(db(rms(wash)) - db(rms(mix[:k2])), 1), 'room': round(db(rms(room)) - db(rms(mix[:k2])), 1),
                                  'washOnlyLufs': round(lufs(wash, rate) - lufs(mix[:k2], rate), 1)})
    print(n, ' | '.join(f"{l}: share {v['share']} wash {v.get('wash', '-')} room {v.get('room', '-')} lufs {v['lufs']}" for l, v in res[n].items()))
json.dump(res, open(out, 'w'), indent=1)
