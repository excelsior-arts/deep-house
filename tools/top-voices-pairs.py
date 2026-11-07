# top-voices (11-02), scratch: the listening files. Each context pair (before, after) to -18 LUFS integrated, the same
# gain rule for both, so the pair is 0.0 LU apart; each solo to -24 LUFS (the voice alone, raised to be heard: its level
# in the mix is the pair's). 16-bit, 48 kHz. A file whose true peak would pass -1 dBFS is turned down and says so.
#   tmp/analysis/venv/bin/python tools/top-voices-pairs.py <renders> <ideas.json> <site dir>
import sys, os, json, numpy as np, soundfile as sf, pyloudnorm as pyln
src, ideas_f, site = sys.argv[1:4]
ideas = json.load(open(ideas_f))
facts = {}
def put(name, dst, target):
    x, sr = sf.read(f'{src}/{name}.wav', dtype='float64')
    l = pyln.Meter(sr).integrated_loudness(x)
    g = 10 ** ((target - l) / 20); y = x * g
    pk = np.abs(y).max(); cut = 0.0
    if pk > 10 ** (-1 / 20): cut = 20 * np.log10(pk) + 1; y = y / (pk / 10 ** (-1 / 20))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    sf.write(dst, y.astype(np.float32), sr, subtype='PCM_16')
    facts[os.path.relpath(dst, site)] = dict(render_lufs=round(l, 2), gain_db=round(20 * np.log10(g), 2), peak_cut_db=round(cut, 2))
for idea, d in ideas.items():
    w = d['window']
    put(f'{w}-before', f'{site}/audio/{idea.lower()}/before.wav', -18)
    for o in d['options']:
        put(f"{o['id']}-after", f"{site}/audio/{idea.lower()}/{o['id']}-after.wav", -18)
        put(f"{o['id']}-solo", f"{site}/audio/{idea.lower()}/{o['id']}-solo.wav", -24)
json.dump(facts, open(f'{site}/audio/facts.json', 'w'), indent=1)
for k, v in facts.items(): print(k, v)
