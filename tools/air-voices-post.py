# air-voices (11-02), scratch: the listening files. Each context pair (before, after) is set to -16 LUFS integrated;
# the solos of one idea on one track share one gain, which puts the loudest of them at -20 LUFS, so the options keep
# their level against each other. 16-bit, 48 kHz. Writes facts.json beside them: the levels, the window, what each
# option adds above 5 kHz where it plays (the after less the before, both as rendered, before any normalising).
#
#   python tools/air-voices-post.py <renders dir> <site dir> <gains table.json>
import importlib.util
import json
import os
import sys

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import butter, sosfilt

here = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('spec', os.path.join(here, 'air-voices-spec.py'))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

CTX_LUFS, SOLO_LUFS = -16.0, -20.0


def lufs(x, sr):
    return pyln.Meter(sr).integrated_loudness(x)


def write(path, x, sr, gain_db):
    y = x * 10 ** (gain_db / 20)
    peak = np.abs(y).max()
    if peak > 0.99:
        y = y * (0.99 / peak)
    sf.write(path, y, sr, subtype='PCM_16')
    return float(20 * np.log10(max(np.abs(y).max(), 1e-9)))


def band_db(x, sr, lo, hi, a, b):
    sos = butter(4, [lo, hi], 'bandpass', fs=sr, output='sos')
    y = sosfilt(sos, x.mean(1))[int(a * sr):int(b * sr)]
    return float(10 * np.log10(max(np.mean(y ** 2), 1e-20)))


def floor_db(x, sr, a, b):
    # the floor between the hits, 5-12 kHz: the 10th percentile of 10 ms power where it plays
    sos = butter(4, [5000, 12000], 'bandpass', fs=sr, output='sos')
    y = sosfilt(sos, x.mean(1))[int(a * sr):int(b * sr)] ** 2
    n = int(0.01 * sr)
    p = np.convolve(y, np.ones(n) / n, 'valid')
    return float(10 * np.log10(max(np.percentile(p, 10), 1e-20))), float(10 * np.log10(max(np.mean(p), 1e-20)))


def main(rdir, site, table):
    os.makedirs(site, exist_ok=True)
    levels = {r['option']: r for r in json.load(open(table))}
    facts, done = {}, set()
    for idea in S.IDEAS:
        solos = {}
        for o in idea['options']:
            k = f"{idea['id']}{o['key']}"
            x, sr = sf.read(f"{rdir}/solo-{k}.wav")
            solos.setdefault(o['track'], []).append((k, x, sr))
        solo_gain = {}
        for track, xs in solos.items():
            loud = max(lufs(x, sr) for _, x, sr in xs)
            for k, _, _ in xs:
                solo_gain[k] = SOLO_LUFS - loud
        # one loudness per context: -16 LUFS, or lower where a file would peak over -1 dBFS there
        target = {}
        for o in idea['options']:
            base = S.base_name(o['track'], o['ctx'])
            for fn in (f"base-{base}", f"after-{idea['id']}{o['key']}"):
                x, sr = sf.read(f"{rdir}/{fn}.wav")
                l, p = lufs(x, sr), 20 * np.log10(max(np.abs(x).max(), 1e-9))
                target[base] = min(target.get(base, CTX_LUFS), -1 - p + l)
        d = os.path.join(site, idea['id'].lower())
        os.makedirs(d, exist_ok=True)
        for o in idea['options']:
            k = f"{idea['id']}{o['key']}"
            t, c = o['track'], o['ctx']
            base = S.base_name(t, c)
            bx, sr = sf.read(f"{rdir}/base-{base}.wav")
            ax, _ = sf.read(f"{rdir}/after-{k}.wav")
            meta = json.load(open(f"{rdir}/after-{k}.json"))
            bs = meta['barSeconds']
            bl, al = lufs(bx, sr), lufs(ax, sr)
            bfile = f"{idea['id'].lower()}/before-{base}.wav"
            if bfile not in done:
                write(os.path.join(site, bfile), bx, sr, target[base] - bl)
                done.add(bfile)
            write(os.path.join(d, f"{k.lower()}-after.wav"), ax, sr, target[base] - al)
            sx, _ = sf.read(f"{rdir}/solo-{k}.wav")
            write(os.path.join(d, f"{k.lower()}-solo.wav"), sx, sr, solo_gain[k])
            # where it plays, in the window: the added events' span, else the whole window
            ev = meta['add']
            if ev:
                a = max(0.0, min(e['t'] for e in ev) - c[0] * bs)
                b = min(len(ax) / sr, max(e['t'] + e['p'].get('dur', 0.2) for e in ev) - c[0] * bs + 0.3)
            else:
                a, b = 0.0, len(ax) / sr
            add = {f"{lo // 1000}-{hi // 1000} kHz": round(band_db(ax, sr, lo, hi, a, b) - band_db(bx, sr, lo, hi, a, b), 2) for lo, hi in [(2000, 5000), (5000, 9000), (9000, 16000)]}
            fb, mb = floor_db(bx, sr, a, b)
            fa, ma = floor_db(ax, sr, a, b)
            add['floor 5-12 kHz'] = round(fa - fb, 2)
            add['gap before'] = round(mb - fb, 1)
            add['gap after'] = round(ma - fa, 1)
            m, s_ = int(c[0] * bs) // 60, int(c[0] * bs) % 60
            facts[k] = dict(idea=idea['id'], option=o['key'], name=o['name'], track=t, link=S.L[t], fromBar=c[0], toBar=c[1],
                            t=round(c[0] * bs, 1), at=f"{m}:{s_:02d}", what=o['what'], before=bfile, after=f"{idea['id'].lower()}/{k.lower()}-after.wav",
                            solo=f"{idea['id'].lower()}/{k.lower()}-solo.wav", lufsBefore=round(bl, 2), lufsAfter=round(al, 2), lufsHeard=round(target[base], 1),
                            loudnessAdded=round(al - bl, 2), addedAbove=add, soloGainDb=round(solo_gain[k], 1),
                            level=levels.get(k), settings=o.get('settings'))
            print(k, t, f"{c[0]}-{c[1]}", f"LUFS {bl:.2f} -> {al:.2f} ({al - bl:+.2f})", 'added', add)
    json.dump(facts, open(os.path.join(site, 'facts.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:4])
