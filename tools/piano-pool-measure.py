# piano-pool (11-01), scratch: a render's loudness as voice-homes read the piano's: the strike (the 90th percentile of
# its 400 ms K-weighted loudness, LUFS, blocks over -70), the power (mean square over the window, dB) and the
# integrated loudness; the colour (the spectral centroid of the whole, Hz) and the share over 2 kHz (dB).
#
#   python tools/piano-pool-measure.py <dir> [<dir> ...] [--names a,b]
import os
import sys
import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))


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


def read(path):
    rate, x = wavfile.read(path)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    return rate, x[:, 0], x[:, 1]


def facts(path):
    rate, L, R = read(path)
    l, r = kfilter(L, rate), kfilter(R, rate)
    blk, hop = int(0.4 * rate), int(0.1 * rate)
    z = np.array([np.mean(l[s:s + blk] ** 2) + np.mean(r[s:s + blk] ** 2) for s in range(0, len(l) - blk + 1, hop)])
    lk = -0.691 + 10 * np.log10(np.maximum(z, 1e-20))
    on = lk[lk > -70]
    strike = float(np.percentile(on, 90)) if len(on) else -99.0
    z1 = z[lk > -70]
    integ = -99.0
    if len(z1):
        rel = -0.691 + 10 * np.log10(np.mean(z1)) - 10
        z2 = z1[(-0.691 + 10 * np.log10(np.maximum(z1, 1e-20))) > rel]
        integ = float(-0.691 + 10 * np.log10(np.mean(z2)))
    m = (L + R) / 2
    power = float(10 * np.log10(max(np.mean(m ** 2), 1e-20)))
    n = 1 << 15
    spec = np.zeros(n // 2 + 1)
    for s in range(0, len(m) - n, n // 2):
        spec += np.abs(np.fft.rfft(m[s:s + n] * np.hanning(n))) ** 2
    f = np.fft.rfftfreq(n, 1 / rate)
    cen = float((f * spec).sum() / max(spec.sum(), 1e-20))
    hi = float(10 * np.log10(spec[f > 2000].sum() / max(spec.sum(), 1e-20)))
    return {'strike': strike, 'power': power, 'lufs': integ, 'centroid': cen, 'hi': hi}


args = sys.argv[1:]
names = None
if '--names' in args: i = args.index('--names'); names = args[i + 1].split(','); del args[i:i + 2]
dirs = args
files = names or sorted({f[:-4] for f in os.listdir(dirs[0]) if f.endswith('.wav')})
print('name'.ljust(28) + ''.join(os.path.basename(d.rstrip('/')).rjust(34) for d in dirs))
for nm in files:
    row = nm.ljust(28)
    base = None
    for d in dirs:
        p = os.path.join(d, nm + '.wav')
        if not os.path.exists(p): row += '-'.rjust(34); continue
        F = facts(p)
        cell = f"{F['strike']:6.1f} {F['power']:6.1f} {F['lufs']:6.1f} {F['centroid']:5.0f} {F['hi']:5.1f}"
        if base is not None: cell += f" {F['strike'] - base:+4.1f}"
        else: base = F['strike']
        row += cell.rjust(34)
    print(row)
