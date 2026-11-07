"""tops-bus-2 (11-02): the round's A/B pairs, before (tops-bus, the wave-1 bus his ear passed) against after (this branch),
level-matched by integrated loudness (BS.1770, both at -14 LUFS over the window), each with its top-alone twin (a
2 kHz high-pass of each side at that side's own gain), 48 kHz 16-bit; and the numbers that prove the move is there at
`t`, bar by bar on both sides: the top's level (6-16 kHz, dB re the window's LUFS), its width (6-16 kHz side/mid, dB)
and its phase (6-16 kHz L/R correlation).

  python -I tools/tops-bus-2-pairs.py <pairs.json> <out dir>

pairs.json: [{ dir, name, track, link, before, after, barSeconds, fromBar, toBar, t, idea, listen, headphones, move: [bar, bar] }]
(`before`/`after`: renders from bar 0, or from `offsetBar` for a window render; `t` in seconds into the theme, as the app's `t=`)
"""
import json, os, sys
import numpy as np
import scipy.signal as ss
import soundfile as sf
import pyloudnorm as pyln

PAIRS, OUT = json.load(open(sys.argv[1])), sys.argv[2]
BASE = 'https://eugene-tea.github.io/deep-house/?'
db = lambda p: 10 * np.log10(max(p, 1e-20))

facts = {'round': 'tops-bus-2', 'matched': 'each pair by integrated loudness over its window (both at -14 LUFS); each top twin at its own side\'s gain',
         'order': 'A before (tops-bus: the wave-1 bus), B after (tops-bus-2); the top twins the same seconds high-passed at 2 kHz; 48 kHz', 'pairs': []}
for n, P in enumerate(PAIRS, 1):
    d = os.path.join(OUT, P['dir'])
    os.makedirs(d, exist_ok=True)
    bs = P['barSeconds']
    a, b = P['fromBar'] * bs, P['toBar'] * bs
    sides = {}
    for side in ('before', 'after'):
        x, rate = sf.read(P[side], dtype='float64', always_2d=True)
        off = P.get('offsetBar', 0) * bs  # a window render starts at its own first bar
        x = x[int(round((a - off) * rate)):int(round((b - off) * rate))]
        lufs = pyln.Meter(rate).integrated_loudness(x)
        g = 10 ** ((-14 - lufs) / 20)
        y = x * g
        fade = np.minimum(1, np.minimum(np.arange(len(y)), np.arange(len(y))[::-1]) / (0.02 * rate))[:, None]
        top = ss.sosfiltfilt(ss.butter(6, 2000, 'highpass', fs=rate, output='sos'), y, axis=0)
        lim = min(1, 0.98 / max(np.abs(y).max(), 1e-9))
        sf.write(f'{d}/{P["name"]}-{side}.wav', y * fade * lim, rate, subtype='PCM_16')
        sf.write(f'{d}/{P["name"]}-{side}--top.wav', top * fade * lim, rate, subtype='PCM_16')
        hi = ss.sosfilt(ss.butter(4, [6000, 16000], 'bandpass', fs=rate, output='sos'), y, axis=0)
        lvl, sm, cor = [], [], []
        for k in range(P['toBar'] - P['fromBar']):
            s = hi[int(k * bs * rate):int((k + 1) * bs * rate)]
            L, R = s[:, 0], s[:, 1]
            lvl.append(round(db(np.mean((L ** 2 + R ** 2) / 2)) + 14, 1))
            sm.append(round(db(np.mean(((L - R) / 2) ** 2)) - db(np.mean(((L + R) / 2) ** 2)), 1))
            cor.append(round(float(np.sum(L * R) / np.sqrt(np.sum(L ** 2) * np.sum(R ** 2) + 1e-30)), 2))
        L, R = hi[:, 0], hi[:, 1]
        whole = dict(level=round(db(np.mean((L ** 2 + R ** 2) / 2)) + 14, 2), sideMid=round(db(np.mean(((L - R) / 2) ** 2)) - db(np.mean(((L + R) / 2) ** 2)), 2),
                     corr=round(float(np.sum(L * R) / np.sqrt(np.sum(L ** 2) * np.sum(R ** 2))), 3))
        sides[side] = dict(lufs=round(lufs, 2), gainDb=round(20 * np.log10(g * lim), 2), level=lvl, sideMid=sm, corr=cor, whole=whole)
    m0, m1 = P['move']
    facts['pairs'].append({
        'n': n, 'dir': P['dir'], 'track': P['track'], 'url': f'{BASE}{P["link"]}&t={P["t"]}', 'link': P['link'], 'bars': f'{P["fromBar"]}-{P["toBar"]}',
        't': P['t'], 'tBar': round(P['t'] / bs, 2), 'move': f'bars {m0}-{m1}', 'moveStartsInFileS': round((m0 - P['fromBar']) * bs, 2), 'idea': P['idea'],
        'files': [f'{P["name"]}-before.wav', f'{P["name"]}-after.wav', f'{P["name"]}-before--top.wav', f'{P["name"]}-after--top.wav'],
        'mixLufsBeforeMatching': [sides['before']['lufs'], sides['after']['lufs']], 'matched': 'integrated loudness, both -14 LUFS',
        'byBar6to16kHz': {s: {k: sides[s][k] for k in ('level', 'sideMid', 'corr')} for s in sides},
        'wholeWindow6to16kHz': {s: sides[s]['whole'] for s in sides},
        'listen': P['listen'], 'headphones': P['headphones'],
    })
    print(f"{P['dir']}: lufs {sides['before']['lufs']} / {sides['after']['lufs']} | 6-16k level {sides['before']['whole']['level']} -> {sides['after']['whole']['level']}"
          f" | S/M {sides['before']['whole']['sideMid']} -> {sides['after']['whole']['sideMid']} | corr {sides['before']['whole']['corr']} -> {sides['after']['whole']['corr']}")
    print('   S/M by bar before', sides['before']['sideMid'])
    print('   S/M by bar after ', sides['after']['sideMid'])
    print('   corr by bar after', sides['after']['corr'])
json.dump(facts, open(os.path.join(OUT, 'facts.json'), 'w'), indent=1)
