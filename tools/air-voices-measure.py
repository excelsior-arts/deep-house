# air-voices (11-02), scratch: each option's level against its reference, and the gain that puts it at its target.
#
#   python tools/air-voices-measure.py <renders dir> <gains.json>
#
# The hats' peaks: the 99th percentile of 10 ms RMS (both channels' mean power) over the track's main, 8 bars. A pad
# or strings reference: its mean power over the window, where it sounds. An option: its held mean (the median 100 ms
# RMS within 6 dB of its loudest) or its loudest 100 ms. All dBFS, as rendered (the master included).
import importlib.util
import json
import os
import sys

import numpy as np
import soundfile as sf

here = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('spec', os.path.join(here, 'air-voices-spec.py'))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)


def power(x, sr, win):
    p = (x ** 2).mean(1)
    n = max(1, int(win * sr))
    return np.convolve(p, np.ones(n) / n, 'valid')


def db(p):
    return 10 * np.log10(np.maximum(p, 1e-20))


def hats_peak(f):
    x, sr = sf.read(f)
    return float(np.percentile(db(power(x, sr, 0.01)), 99))


def held_mean(f):
    x, sr = sf.read(f)
    d = db(power(x, sr, 0.4))
    on = d > d.max() - 30
    return float(db(np.mean(10 ** (d[on] / 10))))


def level(f, how):
    x, sr = sf.read(f)
    d = db(power(x, sr, 0.1))
    if how == 'peak':
        return float(d.max())
    return float(np.median(d[d > d.max() - 6]))


def main(dir, out):
    gains, rows = {}, []
    for idea in S.IDEAS:
        for o in idea['options']:
            k = f"{idea['id']}{o['key']}"
            if not o['events'] or not o.get('ref'):
                continue
            t, c = o['track'], o['ctx']
            ref = hats_peak(f"{dir}/hats-{S.SHORT[t]}.wav") if o['ref'] == 'hats' else held_mean(f"{dir}/pad-{S.base_name(t, c)}.wav")
            lv = level(f"{dir}/unit-{k}.wav", o['measure'])
            g = 10 ** ((ref + o['db'] - lv) / 20)
            gains[k] = round(g, 5)
            rows.append(dict(option=k, ref=o['ref'], refDb=round(ref, 1), target=o['db'], unitDb=round(lv, 1), gain=round(g, 4), gainDb=round(20 * np.log10(g), 1)))
            print(f"{k:6s} ref {o['ref']:7s} {ref:6.1f} dBFS  target {o['db']:+d} dB  unit {o['measure']} {lv:6.1f}  gain {20 * np.log10(g):+6.1f} dB")
    json.dump(gains, open(out, 'w'), indent=1)
    json.dump(rows, open(out.replace('.json', '-table.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
