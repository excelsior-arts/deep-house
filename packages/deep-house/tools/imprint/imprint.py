# imprint.py — one piece of audio, read as eight birds.
#
#   ../../../../tmp/analysis/venv/bin/python imprint.py <wav|mp3> --out <json>
#   ... --sample 40 --window 20        forty twenty-second windows, for a long set
#   ... --origin reference --label "reference set 1"
#   ... --raw                          keep every raw feature in the row
#
# What comes out is an imprint: the schema in notes/plans/PLAN-IMPRINT.md, one
# JSON object, a row of the store. It holds numbers and never audio, and it
# names its source by a content hash and never by a path — a source is a thing
# that was analysed, not a file somebody has.
#
# The measurement is `birds.py`; the scale is `anchors.json`; this file is the
# audio, the windows and the schema.
#
# ## The window rule
#
# A window is eight bars where a grid was found — 18.5 s at 104 BPM — and
# sixteen seconds where none was. Windows do not overlap, and a piece is the
# median and the spread of its own windows, never one number taken over its
# whole length: a track has a breakdown in it and a mean over the breakdown and
# the groove together is a reading of neither.
#
# A file longer than `--max-seconds` is sampled instead of read through, evenly
# spaced across it. That is what the three reference sets get — forty windows of
# twenty seconds each, as the 2026-09-15 mining took them — and it costs Loom
# its span, because a novelty curve needs contiguous audio. The row says so.

import argparse
import hashlib
import json
import math
import os
import sys
import time

import numpy as np
import soundfile as sf
import librosa

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from birds import SR, BIRDS, window_features, track_features, find_grid, read_key, score  # noqa: E402

TOOL = 'imprint.py'
TOOL_VERSION = '1'
SCHEMA = 1


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def percentiles(xs):
    a = np.asarray([x for x in xs if x is not None and np.isfinite(x)], dtype=float)
    if not len(a):
        return None
    return {
        'median': round(float(np.median(a)), 4),
        'p25': round(float(np.percentile(a, 25)), 4),
        'p75': round(float(np.percentile(a, 75)), 4),
        'min': round(float(a.min()), 4),
        'max': round(float(a.max()), 4),
    }


def plan_windows(duration, window_seconds, sample, max_seconds, head=0.0, tail=0.0):
    """Where the windows fall: through the piece, or sampled across it."""
    usable_from, usable_to = head, max(head, duration - tail)
    span = usable_to - usable_from
    if span < window_seconds:
        return [(usable_from, max(1.0, span))], True
    if sample:
        n = min(sample, int(span // window_seconds))
        if n <= 1:
            return [(usable_from, window_seconds)], False
        step = (span - window_seconds) / (n - 1)
        return [(usable_from + i * step, window_seconds) for i in range(n)], False
    n = int(span // window_seconds)
    if n * window_seconds > max_seconds:
        # Too long to read through on a working machine: sample it instead.
        n = max(1, int(max_seconds // window_seconds))
        step = (span - window_seconds) / max(1, n - 1)
        return [(usable_from + i * step, window_seconds) for i in range(n)], False
    return [(usable_from + i * window_seconds, window_seconds) for i in range(n)], True


def main():
    ap = argparse.ArgumentParser(description='Read one piece of audio as eight birds.')
    ap.add_argument('audio')
    ap.add_argument('--out', default=None, help='where the imprint is written (default: stdout)')
    # Where the audio came from. `golden` is the locked catalogue, `generated`
    # anything else this generator made, `reference` mined material, `listener`
    # a stretch somebody marked, `external` a file from outside the project.
    ap.add_argument('--origin', default='external',
                    choices=['golden', 'generated', 'reference', 'listener', 'external'])
    ap.add_argument('--label', default=None, help='a name for the source; never a path')
    ap.add_argument('--bars', type=int, default=8, help='bars in a window when a grid is found')
    ap.add_argument('--window', type=float, default=None,
                    help='window seconds, fixed; overrides --bars')
    ap.add_argument('--sample', type=int, default=0,
                    help='take this many windows spread across the piece instead of reading it through')
    ap.add_argument('--max-seconds', type=float, default=900.0,
                    help='the most audio one run will analyse before it samples instead')
    ap.add_argument('--anchors', default=None)
    ap.add_argument('--raw', action='store_true', help='keep every raw feature on every window')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    anchors_path = args.anchors or os.path.join(here, 'anchors.json')
    with open(anchors_path, 'rb') as fh:
        anchors_bytes = fh.read()
    anchors = json.loads(anchors_bytes)
    anchors_id = hashlib.sha256(anchors_bytes).hexdigest()[:8]

    info = sf.info(args.audio)
    digest = sha256_of(args.audio)
    began = time.time()

    def say(msg):
        if not args.quiet:
            print(msg, file=sys.stderr, flush=True)

    # One pass over the head of the piece to find the tempo the windows are cut
    # by. Sixty seconds is enough for a grid and cheap; the whole file is not.
    probe_seconds = min(60.0, info.duration)
    probe, _ = librosa.load(args.audio, sr=SR, mono=True, offset=0.0, duration=probe_seconds)
    probe_env = librosa.onset.onset_strength(y=probe, sr=SR, hop_length=512)
    probe_grid = find_grid(probe, probe_env)
    heard_bpm = probe_grid['bpm'] if probe_grid['strength'] >= 0.05 else None
    if args.window:
        window_seconds = args.window
    elif heard_bpm:
        window_seconds = args.bars * 4 * 60.0 / heard_bpm
    else:
        window_seconds = 16.0

    spans, contiguous = plan_windows(info.duration, window_seconds, args.sample, args.max_seconds)
    say(f'  {os.path.basename(args.audio)}: {info.duration:.1f} s, {info.samplerate} Hz, '
        f'{info.channels} ch; {len(spans)} windows of {window_seconds:.1f} s'
        f'{"" if contiguous else " (sampled)"}'
        f'{f", grid at {heard_bpm:.1f} BPM" if heard_bpm else ", no grid"}')

    # Loom's span, where there is contiguous audio to read it from.
    track = {'spanSeconds': None}
    span_note = None
    if contiguous:
        whole, _ = librosa.load(args.audio, sr=SR, mono=True,
                                duration=min(info.duration, args.max_seconds))
        track = track_features(whole, probe_grid if heard_bpm else None)
        span_note = track.get('why')
        del whole
    else:
        span_note = 'the piece was sampled as separate windows, and a novelty curve needs contiguous audio'

    rows = []
    keys = {}
    bpms = []
    for i, (t0, dur) in enumerate(spans):
        y, _ = librosa.load(args.audio, sr=SR, mono=True, offset=t0, duration=dur)
        w = window_features(y, track=track)
        if w.get('missing') == ['silence']:
            say(f'    window {i}: silent, skipped')
            continue
        f = w['features']
        ctx = {
            'onsets': w.get('onsets', 0),
            'blocks': w.get('blocks', 0),
            'gridStrength': w.get('grid', {}).get('strength', 0.0),
            'keyMargin': w.get('key', {}).get('margin', 0.0),
            'lowShareDb': f.get('lowShareDb', 0.0),
            'nyquist': min(info.samplerate, SR) / 2.0,
            'spanPeaks': track.get('peaks', 0),
        }
        b, c, used = score(f, anchors, ctx)
        row = {
            'index': i,
            'from': round(float(t0), 3),
            'to': round(float(t0 + dur), 3),
            'bars': args.bars if (heard_bpm and not args.window) else None,
            'birds': b,
            'confidence': c,
            'heard': {
                'bpm': round(w['grid']['bpm'], 2) if w['grid']['bpm'] else None,
                'gridStrength': round(w['grid']['strength'], 3),
                'key': w.get('key', {}).get('root'),
                'mode': w.get('key', {}).get('mode'),
                'onsets': w.get('onsets', 0),
                'rmsDb': round(w.get('rmsDb', -120.0), 2),
            },
            'missing': w['missing'],
        }
        if args.raw:
            row['raw'] = {k: round(float(v), 5) for k, v in f.items() if np.isfinite(v)}
            row['notes'] = w.get('notes', {})
        rows.append(row)
        if w['grid']['bpm'] and w['grid']['strength'] >= 0.05:
            bpms.append(w['grid']['bpm'])
        k = w.get('key', {}).get('root')
        if k:
            keys[(k, w['key']['mode'])] = keys.get((k, w['key']['mode']), 0) + 1
        if not args.quiet and (i + 1) % 10 == 0:
            say(f'    {i + 1}/{len(spans)} windows')

    if not rows:
        print('nothing measurable in that file', file=sys.stderr)
        return 2

    summary_birds = {n: percentiles([r['birds'][n] for r in rows]) for n in BIRDS}
    summary_conf = {n: round(float(np.median([r['confidence'][n] for r in rows])), 3) for n in BIRDS}
    key = max(keys.items(), key=lambda kv: kv[1])[0] if keys else (None, None)

    out = {
        'schema': SCHEMA,
        'kind': 'imprint',
        'id': 'im_' + hashlib.sha256((digest + anchors_id + str(SCHEMA)).encode()).hexdigest()[:12],
        'source': {
            'hash': 'sha256:' + digest[:32],
            'bytes': os.path.getsize(args.audio),
            'sampleRate': info.samplerate,
            'channels': info.channels,
            'duration': round(float(info.duration), 3),
        },
        'origin': args.origin,
        'label': args.label,
        'heard': {
            'bpm': round(float(np.median(bpms)), 2) if bpms else None,
            'bpmSpread': round(float(np.percentile(bpms, 75) - np.percentile(bpms, 25)), 2) if len(bpms) > 3 else None,
            'key': key[0],
            'mode': key[1],
            'keyAgreement': round(max(keys.values()) / len(rows), 3) if keys else 0.0,
        },
        'windows': rows,
        'summary': {
            'birds': summary_birds,
            'confidence': summary_conf,
            'windows': len(rows),
            'analysedSeconds': round(sum(r['to'] - r['from'] for r in rows), 1),
            'contiguous': contiguous,
            'spanSeconds': round(track['spanSeconds'], 2) if track.get('spanSeconds') else None,
            'spanNote': span_note,
        },
        'tool': {
            'name': TOOL,
            'version': TOOL_VERSION,
            'anchors': f"anchors.json@{anchors_id}",
            'anchorsVersion': anchors.get('version'),
            'librosa': librosa.__version__,
            'analysisRate': SR,
            'seconds': round(time.time() - began, 1),
        },
    }

    text = json.dumps(out, indent=1) + '\n'
    if args.out:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, 'w') as fh:
            fh.write(text)
        line = '  '.join(f'{n[:2]} {summary_birds[n]["median"]:.2f}' for n in BIRDS)
        say(f'  {out["id"]}  {line}  -> {args.out} ({out["tool"]["seconds"]} s)')
    else:
        sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
