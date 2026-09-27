# genres.py — how near a spell's music is to a genre, measured.
#
#   PY=tmp/analysis/venv/bin/python
#   $PY packages/deep-house/tools/genres.py --refs mining --out tmp/genres/refs.json
#   $PY packages/deep-house/tools/genres.py --ours tmp/genres/r1 --out tmp/genres/r1.json
#   $PY packages/deep-house/tools/genres.py --rank tmp/genres/refs.json tmp/genres/r1.json [--json out]
#   $PY packages/deep-house/tools/genres.py --against 'Drum and Bass' tmp/genres/refs.json tmp/recipes-g1/dnb.json [--json out]
#
# PLAN-GENRES' instrument. Every window — a catalogue chunk's middle 90 s (the
# references, decoded into memory and **analysed, never played**) or one of our
# renders (`tools/genres.ts`) — is read the same two ways:
#
#   - `mastering.py`'s: the third-octave LTAS levelled to -14 LUFS, onset rates
#     in three bands, what a phone keeps;
#   - the imprint's (`imprint/birds.py`, the scale `anchors.json`): the eight
#     birds and the raw features under them, on eight-bar windows at the grid
#     it hears — percussive share, syncopation, off-grid share, event rate, the
#     kick's presence, decay, brightness, the low share, block novelty.
#
# A genre is a **target**: a label of the catalogue (its windows' medians and
# spread) or, where the catalogue has no window of it, a rule (tempo band,
# kit, a few features) written here and marked as such. The distance of a
# window to a target is the RMS of each feature's z-score against the target's
# spread (IQR/1.35, floored so a tight label does not make every miss infinite);
# the report also names the features furthest out, which is the gap list.

import argparse
import glob
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'imprint'))
import mastering as M  # noqa: E402
import birds as B  # noqa: E402
import librosa  # noqa: E402

ANCHORS = json.load(open(os.path.join(HERE, 'imprint', 'anchors.json')))
RAW = ['percShare', 'syncIndex', 'offGridShare', 'eventRate', 'kickPresenceDb', 'decayDbPerSec',
       'centroidLogHz', 'lowShareDb', 'blockNovelty', 'sustain300Db']
OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000]


def imprint(x):
    """The eight birds and their raw features, median over eight-bar windows."""
    mono = librosa.resample(np.atleast_2d(x).mean(axis=0), orig_sr=M.SR, target_sr=B.SR)
    probe = mono[: int(60 * B.SR)]
    env = librosa.onset.onset_strength(y=probe, sr=B.SR, hop_length=B.HOP)
    grid = B.find_grid(probe, env)
    bpm = grid['bpm'] if grid['strength'] >= 0.05 else None
    win = 8 * 4 * 60.0 / bpm if bpm else 16.0
    track = B.track_features(mono, grid if bpm else None)
    rows = []
    n = int(len(mono) / B.SR // win) or 1
    for i in range(n):
        y = mono[int(i * win * B.SR): int((i + 1) * win * B.SR)]
        if len(y) < 4 * B.SR:
            continue
        w = B.window_features(y, track=track)
        if w.get('missing') == ['silence']:
            continue
        f = w['features']
        ctx = {'onsets': w.get('onsets', 0), 'blocks': w.get('blocks', 0),
               'gridStrength': w.get('grid', {}).get('strength', 0.0),
               'keyMargin': w.get('key', {}).get('margin', 0.0), 'lowShareDb': f.get('lowShareDb', 0.0),
               'nyquist': B.SR / 2.0, 'spanPeaks': track.get('peaks', 0)}
        b, c, _ = B.score(f, ANCHORS, ctx)
        rows.append({'birds': b, 'raw': {k: float(f[k]) for k in RAW if k in f and np.isfinite(f[k])},
                     'bpm': w['grid']['bpm'] if w['grid']['strength'] >= 0.05 else None,
                     'grid': w['grid']['strength']})
    med = lambda xs: float(np.median(xs)) if xs else None
    return {
        'birds': {k: med([r['birds'][k] for r in rows if r['birds'].get(k) is not None]) for k in B.BIRDS},
        'raw': {k: med([r['raw'][k] for r in rows if k in r['raw']]) for k in RAW},
        'heardBpm': bpm, 'gridStrength': float(grid['strength']), 'windows': len(rows),
    }


def features(x, bpm=None):
    """Everything the distance reads, flat."""
    s = M.read_signal(x, hp_list=(350.0,))
    im = imprint(x)
    f = {}
    for c in OCT:
        f[f'ltas{c}'] = s['thirds'][M.THIRDS.index(c)]
    f['tilt'] = f['ltas4000'] - f['ltas250']
    for k in ('low', 'mid', 'high'):
        f[f'on_{k}'] = s['onsetsPerSec'][k]
    f['phone'] = s['phone350']['retentionLU']
    for k in RAW:
        if im['raw'].get(k) is not None:
            f[k] = im['raw'][k]
    b = bpm or im['heardBpm']
    if b:
        f['log2bpm'] = float(np.log2(b))
    return {'f': f, 'birds': im['birds'], 'heardBpm': im['heardBpm'], 'lufs': s['lufs'],
            'shares': s['shares'], 'windows': im['windows']}

# --- the targets --------------------------------------------------------------
#
# Five genres the catalogue can judge (its labels: the style bands the mining
# assigned by tempo and position in a set), and three it cannot, judged by
# rule. A rule target borrows a label's spectra and spread where the sound is
# kin, and overrides the features the genre is defined by.

GENRES = {
    'Downtempo': {'label': 'downtempo', 'need': {'tempoFamily': ('house',), 'drumsOn': (True,)}},
    'House': {'label': 'house', 'need': {'tempoFamily': ('house', 'techno'), 'kit': ('fourFloor',), 'drumsOn': (True,)}},
    'Tech House': {'label': 'tech house', 'need': {'tempoFamily': ('techno',), 'kit': ('fourFloor',)}},
    'Techno': {'label': 'techno', 'need': {'tempoFamily': ('techno',), 'kit': ('fourFloor',)}},
    # the catalogue's 'ambient' is the slowest band of the sets (69-90 BPM, with
    # a kick): the spectra are borrowed and the defining features are a rule
    'Ambient': {'label': 'ambient', 'need': {'drumsOn': (False,)}, 'rule': {'kickPresenceDb': ('low', None), 'on_low': ('low', None), 'decayDbPerSec': ('high', None)},
                'drop': ('log2bpm', 'syncIndex'),
                'why': "the catalogue's 'ambient' is its slowest band (69-90 BPM, a kick under it): its spectra, with no kick, few low onsets and long tails, tempo free"},
    # rule targets: tempo band and the defining features, spectra borrowed
    'Drum and Bass': {'label': 'tech house', 'need': {'tempoFamily': ('drumAndBass',), 'kit': ('breaks',)}, 'rule': {'log2bpm': (np.log2(172), 0.03), 'syncIndex': ('high', None)},
                      'why': 'no DnB window in the catalogue: 170-176 BPM, a broken kit, spectra of the hot sets'},
    'Breaks': {'label': 'tech house', 'need': {'kit': ('breaks',), 'drumsOn': (True,), 'tempoFamily': ('house', 'techno')}, 'rule': {'log2bpm': (np.log2(130), 0.04), 'syncIndex': ('high', None)},
               'why': 'no breaks or garage window: 125-135 BPM on a broken kit, spectra of the hot sets'},
    'Dub Techno': {'label': 'techno', 'need': {'tempoFamily': ('techno',), 'kit': ('fourFloor',)}, 'rule': {'log2bpm': (np.log2(122), 0.03), 'decayDbPerSec': ('high', None), 'tilt': ('low', None)},
                   'why': 'no dub window: 118-126 BPM four to the floor, long tails (slow decay), darker than techno'},
}
FLOOR = {'log2bpm': 0.03, 'phone': 1.0, 'tilt': 2.0, 'on_low': 0.8, 'on_mid': 0.8, 'on_high': 0.8}


def spread_of(v, k):
    v = np.asarray(v, float)
    sp = float((np.percentile(v, 75) - np.percentile(v, 25)) / 1.35) if len(v) > 3 else float(np.std(v))
    return max(sp, FLOOR.get(k, 1.0 if k.startswith('ltas') else 1e-3))


def target_of(genre, refs, deep):
    """A label's medians, each held to the spread of **the whole catalogue**:
    the labels are five to thirty windows, and a spread read off five windows
    makes every miss look enormous. The rule features are pushed from the deep
    house median by one and a half catalogue spreads, or set outright."""
    g = GENRES[genre]
    everything = list(refs.values())
    rows = [r for r in everything if r['meta']['label'] == g['label']]
    keys = sorted({k for r in rows for k in r['f']})
    T = {}
    for k in keys:
        med = float(np.median([r['f'][k] for r in rows if k in r['f']]))
        T[k] = [med, spread_of([r['f'][k] for r in everything if k in r['f']], k)]
    for k, (val, spread) in (g.get('rule') or {}).items():
        allv = [r['f'][k] for r in everything if k in r['f']]
        sp = spread_of(allv, k)
        if val in ('high', 'low'):
            d_med = float(np.median([r['f'][k] for r in deep if k in r['f']]))
            # one-sided: past the mark on the genre's side is not a miss
            T[k] = [d_med + (1.5 if val == 'high' else -1.5) * sp, sp, 1 if val == 'high' else -1]
        else:
            T[k] = [float(val), spread if spread is not None else sp]
    for k in g.get('drop', ()):
        T.pop(k, None)
    return T, len(rows)


WEIGHT = {'log2bpm': 3.0, 'syncIndex': 1.5, 'kickPresenceDb': 1.5}


def distance(f, T):
    z = {}
    for k, t in T.items():
        if k not in f:
            continue
        m, s = t[0], t[1]
        side = t[2] if len(t) > 2 else 0
        v = (f[k] - m) / s
        z[k] = 0.0 if (side > 0 and v > 0) or (side < 0 and v < 0) else v
    w = {k: WEIGHT.get(k, 1.0) for k in z}
    d = float(np.sqrt(sum(w[k] * z[k] ** 2 for k in z) / sum(w.values())))
    within = float(np.mean([abs(z[k]) <= 1.0 for k in z]))
    return d, z, within

# --- io -------------------------------------------------------------------------


def run_refs(mining, secs, out):
    man = json.load(open(os.path.join(mining, 'manifest.json')))
    res = {}
    for cid, c in man['chunks'].items():
        src = os.path.join(mining, 'sources', c['source'], man['sources'][c['source']]['file'])
        if not os.path.exists(src):
            continue
        s = min(secs, c['duration'])
        x = M.decode(src, c['start'] + c['duration'] / 2 - s / 2, s)
        r = features(x, bpm=c['bpm'])
        r['meta'] = {'label': c['style']['label'], 'source': c['source'], 'bpm': c['bpm']}
        res[cid] = r
        print(f'  ref {cid:14} {c["style"]["label"]:11} {c["bpm"]:6.1f} BPM  d-birds ' +
              ' '.join(f'{k[:2]} {v:.2f}' for k, v in r['birds'].items() if v is not None), flush=True)
    json.dump({'refs': res}, open(out, 'w'), indent=1)


def run_ours(d, out):
    res = {}
    for mix in sorted(glob.glob(os.path.join(d, '*', 'mix.wav'))):
        name = os.path.basename(os.path.dirname(mix))
        meta = json.load(open(os.path.join(os.path.dirname(mix), 'meta.json')))
        r = features(M.load_wav(mix), bpm=meta['bpm'])
        r['meta'] = {k: meta.get(k) for k in ('group', 'seed', 'theme', 'spell', 'bpm', 'scene', 'tempoFamily', 'kit', 'drumsOn', 'preset')}
        res[name] = r
        print(f'  ours {name:28} {meta["bpm"]:6.1f} BPM {str(meta.get("scene")):14}', flush=True)
    json.dump({'ours': res}, open(out, 'w'), indent=1)


def rank(paths, top=3, jout=None):
    refs, ours = {}, {}
    for p in paths:
        j = json.load(open(p))
        refs.update(j.get('refs', {}))
        ours.update(j.get('ours', {}))
    deep = [r for r in refs.values() if r['meta']['label'] == 'deep house']
    # a candidate is its group (the spell); its seeds are averaged
    groups = {}
    for n, r in ours.items():
        groups.setdefault(r['meta']['group'], []).append(r)
    table = {}
    for genre in GENRES:
        T, n = target_of(genre, refs, deep)
        scored = []
        needs = GENRES[genre].get('need', {})
        for gname, rows in groups.items():
            # the genre's defining facts are hard: a tempo family, a kit, drums
            # or none — the metrics rank only what already has them
            if any(r['meta'].get(k) not in ok for r in rows for k, ok in needs.items()):
                continue
            ds = [distance(r['f'], T) for r in rows]
            d = float(np.mean([x[0] for x in ds]))
            within = float(np.mean([x[1] for x in ds]) if False else np.mean([x[2] for x in ds]))
            zs = {k: float(np.mean([x[1][k] for x in ds if k in x[1]])) for k in T}
            scored.append((d, gname, within, zs, rows[0]['meta']['spell'], [r['meta']['bpm'] for r in rows]))
        scored.sort(key=lambda s: s[0])
        # the references' own distance to their target, for scale
        own = [distance(r['f'], T)[0] for r in refs.values() if r['meta']['label'] == GENRES[genre]['label']]
        deepd = [distance(r['f'], T)[0] for r in deep]
        table[genre] = {'n': n, 'rule': GENRES[genre].get('why'), 'refOwn': float(np.median(own)) if own else None,
                        'deepHouse': float(np.median(deepd)),
                        'best': [{'group': s[1], 'd': s[0], 'within': s[2], 'z': s[3], 'spell': s[4], 'bpm': s[5]} for s in scored[:top]],
                        'house': next(({'d': s[0], 'z': s[3]} for s in scored if s[1] == 'house'), None)}
        print(f'\n## {genre}  ({"rule: " + GENRES[genre]["why"] if GENRES[genre].get("why") else f"{n} reference windows"})')
        print(f'   refs to their own target {table[genre]["refOwn"]:.2f}, deep house refs {table[genre]["deepHouse"]:.2f}' if own else '')
        for s in scored[:top]:
            far = sorted(s[3].items(), key=lambda kv: -abs(kv[1]))[:5]
            print(f'   {s[0]:5.2f}  {s[1]:30} within {100*s[2]:3.0f} %  bpm {s[5]}  far: ' + ', '.join(f'{k} {v:+.1f}' for k, v in far))
    if jout:
        json.dump(table, open(jout, 'w'), indent=1)
    return table


KEYS = ('log2bpm', 'eventRate', 'syncIndex', 'on_mid', 'on_high', 'on_low', 'sustain300Db', 'decayDbPerSec')


def against(genre, paths, jout=None):
    """Every window of ours, one genre's target: the distance, and the features
    the genres research read (tempo, event rate, syncopation, onsets by band,
    held mid, decay) as the value and its z. For the genre recipes (recipes-g1),
    whose renders come in pairs — a row at its audit link and the family key's
    spell alone at the same place — so what the row moved is the difference."""
    refs, ours = {}, {}
    for p in paths:
        j = json.load(open(p))
        refs.update(j.get('refs', {}))
        ours.update(j.get('ours', {}))
    deep = [r for r in refs.values() if r['meta']['label'] == 'deep house']
    T, n = target_of(genre, refs, deep)
    own = [distance(r['f'], T)[0] for r in refs.values() if r['meta']['label'] == GENRES[genre]['label'] and not GENRES[genre].get('rule')]
    out = {'genre': genre, 'rule': GENRES[genre].get('why'), 'target': {k: T[k] for k in KEYS if k in T},
           'refOwn': float(np.median(own)) if own else None,
           'deepHouse': float(np.median([distance(r['f'], T)[0] for r in deep])), 'windows': {}}
    print(f'## {genre}  ' + (f'rule: {out["rule"]}' if out['rule'] else f'{n} reference windows'))
    print('   target ' + '  '.join(f'{k} {T[k][0]:.2f}±{T[k][1]:.2f}' for k in KEYS if k in T))
    for name, r in sorted(ours.items()):
        d, z, within = distance(r['f'], T)
        far = sorted(z.items(), key=lambda kv: -abs(kv[1]))[:4]
        row = {'d': d, 'within': within, 'bpm': r['meta'].get('bpm'),
               'value': {k: r['f'].get(k) for k in KEYS}, 'z': {k: z.get(k) for k in KEYS}, 'far': far}
        out['windows'][name] = row
        print(f'   {d:5.2f}  {name:30} ' + '  '.join(f'{k} {r["f"][k]:.2f} ({z[k]:+.1f})' for k in KEYS if k in r['f'] and k in z)
              + '   far: ' + ', '.join(f'{k} {v:+.1f}' for k, v in far))
    if jout:
        json.dump(out, open(jout, 'w'), indent=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--refs')
    ap.add_argument('--ours')
    ap.add_argument('--out')
    ap.add_argument('--ref-seconds', type=float, default=90)
    ap.add_argument('--rank', nargs='*')
    ap.add_argument('--top', type=int, default=3)
    ap.add_argument('--json')
    ap.add_argument('--against')
    ap.add_argument('paths', nargs='*')
    a = ap.parse_args()
    if a.against:
        against(a.against, a.paths, a.json)
    elif a.rank:
        rank(a.rank, a.top, a.json)
    elif a.refs:
        run_refs(a.refs, a.ref_seconds, a.out)
    elif a.ours:
        run_ours(a.ours, a.out)


if __name__ == '__main__':
    main()
