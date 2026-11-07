# ep-noise (11-05): the FM electric piano's noise as numbers, off the renders `ep-noise-render.ts` writes.
#
#   python tools/ep-noise-measure.py <dir> <a> <b> [<c> ...]
#
# Each name is a WAV in <dir>. For a pair `x:y`, the difference x − y is the layer one render has and the other lacks
# (the renders are offline and deterministic, so a voice through the edge minus the same voice through the clean door
# is the edge's copy of it, sample for sample). Printed per file or difference: RMS dBFS, short-term loudness (LUFS,
# integrated over the window), and the energy by band (under 1 kHz, 1-2, 2-4, 4-8, 8-16 kHz) in dBFS.

import sys
import numpy as np
import soundfile as sf
import pyloudnorm as pyln

BANDS = [(20, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 16000)]


def read(d, name):
    x, sr = sf.read(f'{d}/{name}.wav', dtype='float64')
    return x, sr


def facts(x, sr):
    rms = np.sqrt(np.mean(x ** 2)) + 1e-12
    meter = pyln.Meter(sr)
    try:
        lufs = meter.integrated_loudness(x)
    except Exception:
        lufs = float('nan')
    mono = x.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono)) ** 2
    f = np.fft.rfftfreq(len(mono), 1 / sr)
    tot = spec.sum() + 1e-30
    bands = []
    for lo, hi in BANDS:
        e = spec[(f >= lo) & (f < hi)].sum()
        # the band's RMS as a share of the whole, in dB against the whole's RMS
        bands.append(20 * np.log10(rms) + 10 * np.log10(e / tot + 1e-30))
    return 20 * np.log10(rms), lufs, bands


d = sys.argv[1]
print(f'{"":28s} {"rms":>7s} {"lufs":>7s}  ' + ' '.join(f'{lo/1000:g}-{hi/1000:g}k'.rjust(7) for lo, hi in BANDS))
for arg in sys.argv[2:]:
    if ':' in arg:
        a, b = arg.split(':')
        x, sr = read(d, a)
        y, _ = read(d, b)
        n = min(len(x), len(y))
        z = x[:n] - y[:n]
    else:
        z, sr = read(d, arg)
    r, l, bands = facts(z, sr)
    print(f'{arg:28s} {r:7.1f} {l:7.1f}  ' + ' '.join(f'{v:7.1f}' for v in bands))
