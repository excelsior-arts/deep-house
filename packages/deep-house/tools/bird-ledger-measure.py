# The birds' ledger (11-01): what a render's sends add, and how wide it is. A scratch reader for the pairs
# tools/stereo-motion-render.ts writes (a mix and the same window with every send at nought, `-dry`).
#
#   python tools/bird-ledger-measure.py <renders dir>
#
# Per name: the mix's RMS (dBFS), the dry's, the returns' (mix less dry, sample by sample: the same program, the
# same graph, the sends at nought), the wet share (returns over mix, dB), the chord band's and the air band's side over
# mid (dB), the L/R correlation. Reproducible: the render tool and this script, nothing else.
import os
import sys
import numpy as np
from scipy.io import wavfile

BANDS = {'lowmid': (120, 300), 'mid': (300, 2000), 'air': (6000, 16000)}


def read(path):
    rate, x = wavfile.read(path)
    x = x.astype(np.float64)
    if x.dtype != np.float64 or np.max(np.abs(x)) > 2: x = x / 32768.0
    return rate, x


def db(v): return 20 * np.log10(max(v, 1e-9))


def rms(x): return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0


def band_sm(rate, x):
    L, R = x[:, 0], x[:, 1]
    M, S = (L + R) / 2, (L - R) / 2
    fM, fS = np.fft.rfft(M), np.fft.rfft(S)
    f = np.fft.rfftfreq(len(M), 1 / rate)
    out = {}
    for name, (lo, hi) in BANDS.items():
        sel = (f >= lo) & (f < hi)
        m, s = np.sum(np.abs(fM[sel]) ** 2), np.sum(np.abs(fS[sel]) ** 2)
        out[name] = 10 * np.log10(max(s, 1e-18) / max(m, 1e-18))
    return out


def corr(x):
    L, R = x[:, 0], x[:, 1]
    d = np.sqrt(np.sum(L ** 2) * np.sum(R ** 2))
    return float(np.sum(L * R) / d) if d > 0 else 1.0


folder = sys.argv[1]
names = sorted({n[:-4] for n in os.listdir(folder) if n.endswith('.wav') and not n.endswith('-dry.wav')})
print('name | mix dBFS | dry dBFS | returns dBFS | wet share dB | S/M lowmid mid air (mix) | S/M mid (returns) | corr mix | corr returns')
for n in names:
    rate, mix = read(os.path.join(folder, n + '.wav'))
    dry_path = os.path.join(folder, n + '-dry.wav')
    sm = band_sm(rate, mix)
    line = f"{n} | {db(rms(mix)):.1f}"
    if os.path.exists(dry_path):
        _, dry = read(dry_path)
        k = min(len(mix), len(dry))
        ret = mix[:k] - dry[:k]
        rsm = band_sm(rate, ret)
        line += f" | {db(rms(dry)):.1f} | {db(rms(ret)):.1f} | {db(rms(ret)) - db(rms(mix)):.1f} | {sm['lowmid']:.1f} {sm['mid']:.1f} {sm['air']:.1f} | {rsm['mid']:.1f} | {corr(mix):.2f} | {corr(ret):.2f}"
    else:
        line += f" | - | - | - | {sm['lowmid']:.1f} {sm['mid']:.1f} {sm['air']:.1f} | - | {corr(mix):.2f} | -"
    print(line)
