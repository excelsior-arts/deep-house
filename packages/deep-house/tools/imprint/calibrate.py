# calibrate.py — where a pile of imprints lands, and where the scale's centre is.
#
#   ../../../../tmp/analysis/venv/bin/python calibrate.py tmp/imprint/golden/*.json
#   ... --recentre --out anchors.json     put the house centre where the golden is
#   ... --label golden --markdown         the table the calibration note is written from
#
# Two jobs, and they are the same arithmetic seen twice.
#
# **Report.** Given imprints, print each bird's centre and spread across them
# and each raw feature's centre, so a set of records can be said to sit *here*
# rather than *there*.
#
# **Re-centre.** PLAN-MAGIC-V2 says an untouched ring is deep house, and the
# scorecard says the same thing from the other side: the golden renders must
# read as the house default vector. That is only true if the scale is built so
# it is true, so `--recentre` writes each feature's `house` anchor to the median
# of what the golden actually measured, and recomputes every wall that is
# declared as a factor of the centre. The 0 and 1 walls that are absolute are
# never touched here: they are physics, and moving one is a decision somebody
# writes down.
#
# Nothing here reads audio. It reads rows.

import argparse
import glob
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from birds import BIRDS  # noqa: E402


def load(paths):
    out = []
    for p in paths:
        for f in sorted(glob.glob(p)):
            with open(f) as fh:
                d = json.load(fh)
            if d.get('kind') != 'imprint':
                continue
            d['_file'] = os.path.basename(f)
            out.append(d)
    return out


def raw_centres(imprints):
    """Each raw feature's centre: the median over imprints of each imprint's own median.

    Two levels, so a three-hour set sampled as forty windows does not outvote a
    render that is four windows long. An imprint is one record's worth of
    evidence whatever it is made of.
    """
    per = {}
    for d in imprints:
        vals = {}
        for w in d['windows']:
            for k, v in (w.get('raw') or {}).items():
                vals.setdefault(k, []).append(v)
        for k, xs in vals.items():
            per.setdefault(k, []).append(float(np.median(xs)))
    return {k: {'median': float(np.median(v)), 'p25': float(np.percentile(v, 25)),
                'p75': float(np.percentile(v, 75)), 'n': len(v)}
            for k, v in sorted(per.items())}


def bird_centres(imprints):
    per = {b: [] for b in BIRDS}
    conf = {b: [] for b in BIRDS}
    for d in imprints:
        for b in BIRDS:
            s = d['summary']['birds'].get(b)
            if s:
                per[b].append(s['median'])
            conf[b].append(d['summary']['confidence'].get(b, 0))
    return {b: {'median': float(np.median(per[b])) if per[b] else None,
                'p25': float(np.percentile(per[b], 25)) if per[b] else None,
                'p75': float(np.percentile(per[b], 75)) if per[b] else None,
                'sd': float(np.std(per[b])) if per[b] else None,
                'confidence': float(np.median(conf[b])) if conf[b] else 0.0,
                'n': len(per[b])}
            for b in BIRDS}


def recentre(anchors, centres, label):
    moved = []
    for bird, spec in anchors['birds'].items():
        for name, a in spec['features'].items():
            c = centres.get(name)
            if not c:
                moved.append((bird, name, a['house'], None, 'not measured; left where it was'))
                continue
            # A feature at no weight is measured and recorded but does not move
            # the scale: its centre is written beside its anchors as `measured`
            # and its anchors are left alone, because a centre that nothing
            # reads can sit outside its own walls and there is no sense in
            # storing a map that is not monotone.
            if float(a.get('weight', 1.0)) == 0:
                a['measured'] = round(c['median'], 5)
                moved.append((bird, name, a['house'], None, f'weight 0: measured {a["measured"]}, anchors untouched'))
                continue
            was = a['house']
            a['house'] = round(c['median'], 5)
            why = 'centre'
            if 'zeroFactor' in a:
                a['zero'] = round(a['house'] * a['zeroFactor'], 5)
                why = 'centre and both walls'
            if 'oneFactor' in a:
                a['one'] = round(a['house'] * a['oneFactor'], 5)
            moved.append((bird, name, was, a['house'], why))
    anchors['calibrated'] = {
        'on': label,
        'date': time.strftime('%Y-%m-%d'),
        'note': 'The `house` raw of every feature is the median of what this set of imprints measured; '
                'a wall declared as a factor of the centre moved with it, and an absolute wall did not.',
    }
    return moved


def main():
    ap = argparse.ArgumentParser(description='Where a pile of imprints lands, and where the centre is.')
    ap.add_argument('imprints', nargs='+')
    ap.add_argument('--label', default='a set of imprints')
    ap.add_argument('--recentre', action='store_true')
    ap.add_argument('--anchors', default=None)
    ap.add_argument('--out', default=None, help='where the re-centred anchors are written')
    ap.add_argument('--markdown', action='store_true')
    ap.add_argument('--json', default=None, help='also write the centres as a json file')
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    anchors_path = args.anchors or os.path.join(here, 'anchors.json')

    imprints = load(args.imprints)
    if not imprints:
        print('no imprints in those paths', file=sys.stderr)
        return 2
    centres = raw_centres(imprints)
    birds = bird_centres(imprints)

    print(f'{len(imprints)} imprints: {args.label}')
    if args.markdown:
        print('\n| bird | median | p25 | p75 | sd | confidence |')
        print('|---|---|---|---|---|---|')
        for b in BIRDS:
            r = birds[b]
            print(f'| {b} | {r["median"]:.3f} | {r["p25"]:.3f} | {r["p75"]:.3f} | {r["sd"]:.3f} | {r["confidence"]:.2f} |')
        print('\n| feature | median | p25 | p75 | imprints |')
        print('|---|---|---|---|---|')
        for k, c in centres.items():
            print(f'| {k} | {c["median"]:.4f} | {c["p25"]:.4f} | {c["p75"]:.4f} | {c["n"]} |')
    else:
        for b in BIRDS:
            r = birds[b]
            print(f'  {b:<7} {r["median"]:.3f}  [{r["p25"]:.3f} {r["p75"]:.3f}]  sd {r["sd"]:.3f}  conf {r["confidence"]:.2f}')
        print('  raw:')
        for k, c in centres.items():
            print(f'    {k:<16} {c["median"]:>10.4f}  [{c["p25"]:.4f} {c["p75"]:.4f}]  n={c["n"]}')

    if args.json:
        with open(args.json, 'w') as fh:
            json.dump({'label': args.label, 'imprints': [d['_file'] for d in imprints],
                       'birds': birds, 'raw': centres}, fh, indent=1)

    if args.recentre:
        with open(anchors_path) as fh:
            anchors = json.load(fh)
        moved = recentre(anchors, centres, args.label)
        out = args.out or anchors_path
        with open(out, 'w') as fh:
            json.dump(anchors, fh, indent=1)
            fh.write('\n')
        print(f'\nre-centred on {args.label} -> {out}')
        for bird, name, was, now, why in moved:
            if now is None:
                print(f'  {bird:<7} {name:<16} {was:>10}  {why}')
            else:
                print(f'  {bird:<7} {name:<16} {was:>10.4f} -> {now:>10.4f}  ({why})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
