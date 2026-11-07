"""tops-bus (11-02): the round's A/B pairs, each before (local today) against after, level-matched by integrated loudness
(BS.1770, both set to -14 LUFS over the window), with its top-alone twin (a 2 kHz high-pass of each side at that side's
own gain), 44.1 kHz 16-bit; and the numbers that prove the move is there at `t`: the top's level (6-16 kHz, dB re the
window's LUFS) bar by bar on both sides.

  python -I tools/tops-bus-pairs.py <pairs.json> <out dir>

pairs.json: [{ dir, name, track, link, before, after, barSeconds, fromBar, toBar, t, listen, move: [fromBar, line], beforeFromBar?, afterFromBar? }]
(`before`/`after`: renders from bar 0, or from `<side>FromBar` for a window; `t` in seconds into the theme)
"""
import json, os, sys
import numpy as np
import scipy.signal as ss
import soundfile as sf
import pyloudnorm as pyln

PAIRS, OUT = json.load(open(sys.argv[1])), sys.argv[2]
BASE = 'https://eugene-tea.github.io/deep-house/?'


def cut(path, a, b):
    x, rate = sf.read(path, dtype='float64', always_2d=True)
    return x[int(round(a * rate)):int(round(b * rate))], rate


def band_db(x, rate, lo, hi):
    sos = ss.butter(4, [lo, hi], 'bandpass', fs=rate, output='sos')
    y = ss.sosfilt(sos, x, axis=0)
    return y


facts = {'round': 'tops-bus', 'matched': 'each pair by integrated loudness over its window (both at -14 LUFS); each top twin at its own side\'s gain',
         'order': 'A before (local today), B after (tops-bus); the top twins the same seconds high-passed at 2 kHz', 'pairs': []}
for n, P in enumerate(PAIRS, 1):
    d = os.path.join(OUT, P['dir'])
    os.makedirs(d, exist_ok=True)
    bs = P['barSeconds']
    a, b = P['fromBar'] * bs, P['toBar'] * bs
    sides = {}
    for side in ('before', 'after'):
        off = P.get(f'{side}FromBar', 0) * bs  # a render of a window starts at its own bar
        x, rate = cut(P[side], a - off, b - off)
        lufs = pyln.Meter(rate).integrated_loudness(x)
        g = 10 ** ((-14 - lufs) / 20)
        y = x * g
        fade = np.minimum(1, np.minimum(np.arange(len(y)), np.arange(len(y))[::-1]) / (0.02 * rate))[:, None]
        sos = ss.butter(6, 2000, 'highpass', fs=rate, output='sos')
        top = ss.sosfiltfilt(sos, y, axis=0)
        lim = min(1, 0.98 / max(np.abs(y).max(), 1e-9))
        sf.write(f'{d}/{P["name"]}-{side}.wav', y * fade * lim, rate, subtype='PCM_16')
        sf.write(f'{d}/{P["name"]}-{side}--top.wav', top * fade * lim, rate, subtype='PCM_16')
        # the top (6-16 kHz) bar by bar, dB re the window's own LUFS (matched level)
        hi = band_db(y, rate, 6000, 16000)
        per = []
        for k in range(P['toBar'] - P['fromBar']):
            s = hi[int(k * bs * rate):int((k + 1) * bs * rate)]
            per.append(round(10 * np.log10(max(np.mean(s ** 2), 1e-20)) + 14, 1))
        whole = round(10 * np.log10(max(np.mean(hi ** 2), 1e-20)) + 14, 2)
        sides[side] = dict(lufs=round(lufs, 2), gainDb=round(20 * np.log10(g * lim), 2), topByBar=per, topWhole=whole)
    m0, m1 = P['move']
    rel = lambda k: k - P['fromBar']
    diff = [round(sides['after']['topByBar'][k] - sides['before']['topByBar'][k], 1) for k in range(P['toBar'] - P['fromBar'])]
    inside = [diff[rel(k)] for k in range(int(np.floor(m0)), int(np.ceil(m1))) if 0 <= rel(k) < len(diff)]
    facts['pairs'].append({
        'n': n, 'dir': P['dir'], 'track': P['track'], 'url': f'{BASE}{P["link"]}&t={P["t"]}', 'bars': f'{P["fromBar"]}-{P["toBar"]}',
        't': P['t'], 'move': f'bars {m0}-{m1}', 'idea': P['idea'],
        'files': [f'{P["name"]}-before.wav', f'{P["name"]}-after.wav', f'{P["name"]}-before--top.wav', f'{P["name"]}-after--top.wav'],
        'mixLufsBefore': [sides['before']['lufs'], sides['after']['lufs']], 'matched': 'integrated loudness, 0.00 LU',
        'top6to16kHzByBar': {'before': sides['before']['topByBar'], 'after': sides['after']['topByBar'], 'afterMinusBefore': diff},
        'topInsideTheMoveDb': inside,
        'topWholeWindowDb': [sides['before']['topWhole'], sides['after']['topWhole']],
        'listen': P['listen'],
    })
    print(P['dir'], 'lufs', sides['before']['lufs'], sides['after']['lufs'], '| top inside the move, after - before:', inside, '| whole window', sides['before']['topWhole'], '->', sides['after']['topWhole'])
json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w'), indent=1)
