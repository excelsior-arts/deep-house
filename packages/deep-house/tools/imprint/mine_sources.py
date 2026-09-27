# mine_sources.py — the three reference sets, read in v2's own terms.
#
#   tmp/analysis/venv/bin/python packages/deep-house/tools/imprint/mine_sources.py \
#       --out tmp/analysis/mine_v2
#   ... --sets 1,2,3          which sets to read
#   ... --resume              keep whatever stretches are already written
#   ... --seams-only          only the hand-overs between stretches
#
# PLAN-RECIPES' last unbuilt section is *Mining from reference tracks*: turn the
# one-shot analysis scripts into a tool that takes a set of tracks, measures the
# eight primitives per window, clusters, and writes recipe candidates. This file
# is the measuring half of that. The clustering, the rows and the report are
# `mine-v2.js`, which reads what this writes.
#
# ## The rules this file is written under, which do not bend
#
# **The sources are analysed only.** The three files under `tmp/sources/`, named
# `source_1`, `source_2` and `source_3` whatever their container is, are
# decoded into memory a stretch at a time and nothing is ever written back: no
# wav, no segment, no cache of samples, not in `tmp/` and not anywhere else.
# What leaves this process is proportions and numbers. That was the rule the
# 2026-09-15 mining ran under and it does not change because the tool got
# better. (v1's `tmp/analysis/common.py` read decoded copies beside the corpus;
# those are gone, and this file decodes the source itself rather than making
# them again.)
#
# **The segmentation is v1's and is not re-invented.** `tmp/analysis/corpus.json`
# holds 51 *coherent stretches* — `{set, track, start_s, dur_s, key, bpm}`, cut
# on key stability — and this tool takes them as given, windows each one at
# **eight bars of its own measured tempo**, and labels each window with the
# section the same corpus assigned that bar. `CORPUS.md` is blunt that a key
# segment is not guaranteed to be one track; that caveat is inherited whole and
# repeated in the report rather than quietly dropped.
#
# **The scale is the record's.** Every bird is `birds.py` against
# `anchors.json`, which was calibrated on the fourteen golden themes
# (`analysis/imprint-calibration.md`). That is the point: a source window and a
# golden theme are then the same number and the distance between them means
# something. It is also the caveat — the anchors were centred on *our* record,
# so a source reading is a reading of how far that music is from ours, and
# never of how far ours is from the genre.
#
# ## What is measured, beyond the eight
#
# The eight birds are energy over a window and a mix is mostly its drums
# (PLAN-IMPRINT, "A bird cannot see a quiet salient figure"). So every window
# also carries the properties a recipe's `wants` can hold without naming
# anything:
#
#   **rates** — onsets per bar in three bands, 40-120 Hz, 300-2000 Hz and
#     6-11 kHz. They are *band proxies* for the kick, the figure and the hats
#     and they are not source separation: a bassline that moves inside the low
#     band is a low-band onset, and a clap is a mid-band one. The row says so.
#   **hat density** — the high band's onset strength folded onto the sixteen
#     steps of the bar, as three shares (the beats, the offbeat eighths, the
#     sixteenths between), the same fold `CORPUS.md` §4 used on the same
#     material. The *word* is cut out of the corpus's own quartiles by
#     `mine-v2.js`, so no threshold in this file was chosen by eye.
#   **sustain** — the mid band's level a bar after an onset against that
#     onset's own peak, which is Tide's `sustain300Db` asked at the phrase's
#     own scale rather than at 300 ms.
#   **brightness**, **low mass** — the spectral centroid and the 20-120 Hz
#     share, as classes cut on the sources' own quartiles.
#   **width** — the only thing here the birds cannot ever carry: mid against
#     side, whole and per band. `birds.py` is mono at 22050 by construction and
#     PLAN-IMPRINT says in so many words that this is why width is not a bird.
#     It is a property of the mix, it is measurable, and a recipe may want it.
#
# ## The seams
#
# Thirty-four of the fifty junctions between one stretch and the next have no
# gap at all — the second begins exactly where the first ended — which is a DJ's
# hand-over caught in the middle. For each such junction
# the three band levels are read through a two-minute window round the boundary,
# each band's own half-way point between its plateau before and its plateau
# after is found, and what comes out is the **hand-over length** (the spread of
# those three instants) and **which band changes hands first**. Nothing else in
# this project has ever measured that from the sources.

import argparse
import hashlib
import json
import math
import os
import sys
import time

import numpy as np
import librosa
import scipy.signal as sig

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from birds import (  # noqa: E402
    SR, HOP, N_FFT, FRAME_RATE, BIRDS, EPS,
    window_features, track_features, find_grid, score, db,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SOURCE_DIR = os.path.join(ROOT, 'tmp', 'sources')
CORPUS = os.path.join(ROOT, 'tmp', 'analysis', 'corpus.json')


def source_path(n):
    """The file for set `n`, found by its stem and never by its extension.

    The release audit refuses a recording's name written down in a shipped
    file, and it is right to: a source is a thing somebody has and not a path
    this project knows. So the tool is told a directory, looks for the one file
    whose stem is `source_<n>`, and takes whatever container it is in.
    """
    stem = f'source_{n}'
    for name in sorted(os.listdir(SOURCE_DIR)):
        if os.path.splitext(name)[0] == stem:
            return os.path.join(SOURCE_DIR, name)
    raise SystemExit(f'no {stem} in {SOURCE_DIR}')


TOOL = 'mine_sources.py'
TOOL_VERSION = '1'

# The three bands the rates are read in, and the role each is a proxy for.
BANDS = (('low', 40.0, 120.0, 'kick'),
         ('mid', 300.0, 2000.0, 'figure'),
         ('high', 6000.0, 11000.0, 'offbeat'))


def band_env(y, lo, hi, smooth=0.005):
    """One band's rectified, box-smoothed envelope, at the STFT frame rate."""
    ny = SR / 2.0
    b, a = sig.butter(4, [max(lo / ny, 1e-4), min(hi / ny, 0.999)], btype='band')
    x = sig.filtfilt(b, a, y)
    w = max(1, int(smooth * SR))
    e = np.convolve(np.abs(x), np.ones(w) / w, mode='same')
    hop = int(SR / FRAME_RATE)
    return e[::hop].astype(np.float64)


# The peak picker's threshold and its minimum spacing. They are **calibrated
# against a fact about this music and not chosen by eye**: the reference sets
# are four-on-the-floor house, so the 40-120 Hz band has to read about four
# onsets a bar, and at `delta` 0.30 with `wait` 5 it reads 2.6 to 5.0 over six
# stretches spanning 94 to 124 BPM, centred on 4.0. At 0.05 the same band reads
# fourteen a bar, which is the envelope wobbling and not a kick drum. The high
# band then lands at 3.3 to 8.0, which is the offbeat-eighth hat layer with and
# without its sixteenths — the layer `CORPUS.md` §4 measured as 591 bars of
# `..x...x...x...x.` and 427 of `..x.x.x...x.x.x.`.
ONSET_DELTA = 0.30
ONSET_WAIT = 5


def band_onsets(e):
    """Onset frames of one band envelope: rectified difference, peak picked.

    The same shape as the 2026-09-15 mining's per-band fold — a band envelope
    and its positive difference — rather than `librosa.onset.onset_detect` over
    the whole spectrum, because the whole spectrum in this music is the hats.
    """
    d = np.maximum(np.diff(db(np.maximum(e, EPS) ** 2), prepend=db(max(e[0], EPS) ** 2)), 0.0)
    if d.max() <= 0:
        return np.array([], dtype=int)
    d = d / d.max()
    return librosa.util.peak_pick(d, pre_max=3, post_max=3, pre_avg=5, post_avg=5,
                                  delta=ONSET_DELTA, wait=ONSET_WAIT)


def onset_strength(e):
    """One band's onset strength: the positive change of its level, in dB.

    Folded rather than the band's *level*, because a level fold answers "where
    is the energy" and an onset fold answers "where are the hits", and in this
    music they are different questions: an open hat on the offbeat is still
    ringing over the beat after it, so the level on the beat is that hat and
    the hit on the beat is the kick's own air. `CORPUS.md` §4 counted hits.
    """
    x = db(np.maximum(e, EPS) ** 2)
    return np.maximum(np.diff(x, prepend=x[0]), 0.0)


def fold16(env, beats, bpm):
    """A band's onset strength folded onto the sixteen steps of the bar.

    Beats are the grid's own, and the bar is taken as four of them from the
    first beat: a downbeat is not measured, so the fold is read as a *shape* —
    which steps carry the hits relative to each other — and every reading off
    it below is invariant to which of the four beats the bar starts on.
    """
    if bpm is None or len(beats) < 4:
        return None
    step = 60.0 / bpm / 4.0
    slots = np.zeros(16)
    w = max(1, int(step * FRAME_RATE / 4))
    b = np.asarray(beats, dtype=float) / FRAME_RATE
    for bi, t in enumerate(b):
        for k in range(4):
            i = int(round((t + k * step) * FRAME_RATE))
            if 0 <= i < len(env):
                slots[(bi % 4) * 4 + k] += float(env[max(0, i - w):i + w + 1].max())
    return slots


def hat_shares(slots):
    """Where the high band's hits fall inside the bar, as three shares.

    Steps 2, 6, 10 and 14 are the offbeat eighths, which `CORPUS.md` §4 found
    carry 61 % of the corpus's high-band onsets against the 25 % an even spread
    would give; 0, 4, 8 and 12 are the beats; the other eight are the
    sixteenths between them.

    **No word is assigned here on purpose.** A class needs a threshold and a
    threshold picked by eye is a number nobody measured; `mine-v2.js` cuts the
    words out of the quartiles of these shares over the whole corpus, so the
    vocabulary is the sources' own and is derived rather than typed.
    """
    if slots is None or slots.sum() <= 0:
        return None
    s = slots / slots.sum()
    return {'beat': round(float(s[[0, 4, 8, 12]].sum()), 4),
            'offbeat': round(float(s[[2, 6, 10, 14]].sum()), 4),
            'sixteenth': round(float(s[[1, 3, 5, 7, 9, 11, 13, 15]].sum()), 4)}


def sustain_at_bar(y, bpm):
    """The mid band a bar after an onset, against that onset's own peak.

    Tide's `sustain300Db` asks the same question at 300 ms; a phrase-scale
    version of it is what tells a held ensemble from a stab, and it is measured
    the same careful way — the band's own peak is looked for round the onset,
    because a decay measured from before the peak is a rise.
    """
    mid = band_env(y, 300.0, 4000.0)
    mid_db = db(mid ** 2)
    low = band_env(y, 40.0, 120.0)
    kick_level = float(np.percentile(low, 75))
    onsets = band_onsets(mid)
    bar = (4 * 60.0 / bpm) if bpm else 2.0
    ahead = int(min(bar, 2.0) * FRAME_RATE)
    gap = int(0.25 * FRAME_RATE)
    vals = []
    for i, fr in enumerate(onsets):
        nxt = onsets[i + 1] if i + 1 < len(onsets) else len(mid) - 1
        if nxt - fr < gap:
            continue
        if fr < len(low) and low[fr] > kick_level:
            continue
        lo = max(0, fr - 2)
        hi = min(len(mid_db), fr + max(2, int(0.06 * FRAME_RATE)))
        if hi - lo < 2:
            continue
        top = lo + int(np.argmax(mid_db[lo:hi]))
        at = top + ahead
        if at < len(mid_db):
            vals.append(float(mid_db[at]) - float(mid_db[top]))
    return (float(np.median(vals)), len(vals)) if len(vals) >= 3 else (None, len(vals))


def width_of(stereo):
    """Mid against side, whole and per band, in dB. The birds cannot see this."""
    if stereo.ndim != 2 or stereo.shape[0] < 2:
        return None
    left, right = stereo[0].astype(np.float64), stereo[1].astype(np.float64)
    mid = (left + right) / 2.0
    side = (left - right) / 2.0
    out = {'sideMidDb': round(float(db(float((side ** 2).mean())) - db(float((mid ** 2).mean()))), 3)}
    for name, lo, hi, _role in BANDS:
        m = band_env(mid, lo, hi)
        s = band_env(side, lo, hi)
        out[f'{name}SideMidDb'] = round(float(db(float((s ** 2).mean())) - db(float((m ** 2).mean()))), 3)
    return out


def read_stretch(path, start, dur):
    """One stretch of one source, decoded into memory and never to disk."""
    y, _ = librosa.load(path, sr=SR, mono=False, offset=float(start), duration=float(dur))
    y = np.atleast_2d(y)
    mono = librosa.to_mono(y) if y.shape[0] > 1 else y[0]
    return mono.astype(np.float64), y


def measure_stretch(tr, anchors, nyquist, say):
    path = source_path(tr['set'])
    bpm = float(tr['bpm'] or 110.0)
    began = time.time()
    mono, stereo = read_stretch(path, tr['start_s'], tr['dur_s'])
    bar_seconds = 4 * 60.0 / bpm
    window_seconds = 8 * bar_seconds
    n = int(len(mono) / SR // window_seconds)
    if n < 1:
        return None

    # Loom's span, over contiguous audio. This is the thing v1's reading of the
    # same sets could not have: the 2026-09-15 mining and the 09-17 calibration
    # both read the sets as forty scattered twenty-second windows, which has no
    # novelty curve in it at all and dropped Loom's confidence to 0.23. A
    # stretch is three to twenty minutes of contiguous audio and does.
    track = track_features(mono)

    rows = []
    for i in range(n):
        a = int(i * window_seconds * SR)
        b = int(min(len(mono), a + window_seconds * SR))
        y = mono[a:b]
        w = window_features(y, track=track)
        if w.get('missing') == ['silence']:
            continue
        f = w['features']
        ctx = {
            'onsets': w.get('onsets', 0),
            'blocks': w.get('blocks', 0),
            'gridStrength': w.get('grid', {}).get('strength', 0.0),
            'keyMargin': w.get('key', {}).get('margin', 0.0),
            'lowShareDb': f.get('lowShareDb', 0.0),
            'nyquist': nyquist,
            'spanPeaks': track.get('peaks', 0),
        }
        birds, conf, _used = score(f, anchors, ctx)

        grid = find_grid(y, librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP))
        beats = grid['beats'] if grid['bpm'] else []
        rates, folds = {}, {}
        for name, lo, hi, role in BANDS:
            e = band_env(y, lo, hi)
            on = band_onsets(e)
            rates[role] = round(float(len(on) / max(1e-9, (b - a) / SR / bar_seconds)), 3)
            if name == 'high':
                folds['high'] = fold16(onset_strength(e), beats, grid['bpm'] or bpm)
        shares = hat_shares(folds.get('high'))
        sus, sus_n = sustain_at_bar(y, bpm)
        rows.append({
            'index': i,
            'from': round(float(tr['start_s'] + i * window_seconds), 3),
            'seconds': round(float((b - a) / SR), 3),
            'bars': 8,
            'barFrom': i * 8,
            'birds': birds,
            'confidence': conf,
            'missing': w['missing'],
            'raw': {k: round(float(v), 5) for k, v in f.items() if np.isfinite(v)},
            'heard': {
                'bpm': round(w['grid']['bpm'], 2) if w['grid']['bpm'] else None,
                'gridStrength': round(w['grid']['strength'], 3),
                'key': w.get('key', {}).get('root'),
                'mode': w.get('key', {}).get('mode'),
                'onsets': w.get('onsets', 0),
                'rmsDb': round(w.get('rmsDb', -120.0), 2),
            },
            'props': {
                'rates': rates,
                'hatShares': shares,
                'sustainBarDb': None if sus is None else round(sus, 3),
                'sustainOnsets': sus_n,
                'centroidLogHz': round(float(f.get('centroidLogHz', float('nan'))), 4) if np.isfinite(f.get('centroidLogHz', float('nan'))) else None,
                'lowShareDb': round(float(f.get('lowShareDb', float('nan'))), 3) if np.isfinite(f.get('lowShareDb', float('nan'))) else None,
                'width': width_of(stereo[:, a:b]) if stereo.shape[0] > 1 else None,
            },
        })
        if (i + 1) % 10 == 0:
            say(f'      {i + 1}/{n} windows')

    out = {
        'set': tr['set'], 'track': tr['track'], 'key': tr['key'], 'tonic': tr['tonic'],
        'mode': tr['mode'], 'bpm': bpm, 'start_s': tr['start_s'], 'dur_s': tr['dur_s'],
        'barSeconds': round(bar_seconds, 4), 'windowSeconds': round(window_seconds, 4),
        'windows': rows,
        'span': {'spanSeconds': track.get('spanSeconds'), 'peaks': track.get('peaks', 0),
                 'why': track.get('why')},
        'seconds': round(time.time() - began, 1),
    }
    say(f'    set {tr["set"]} track {tr["track"]}: {len(rows)} windows, '
        f'{out["seconds"]} s, span {track.get("spanSeconds")}')
    return out


def measure_seam(setno, before, after, seconds=60.0, say=print):
    """One hand-over: how long it takes and which band goes first.

    Read through a window that reaches `seconds` either side of the instant the
    corpus put the boundary at. Each band's level is smoothed to two seconds,
    its plateau before and after taken as the median of the outer thirds, and
    the instant it crosses half way between them is that band's own hand-over
    point. The length is the spread of the three points and the order is what
    they sort into. A band whose two plateaux are inside 1.5 dB of each other
    did not change hands and is reported as such rather than as a crossing at
    the middle of the window.
    """
    t = float(before['start_s'] + before['dur_s'])
    a = max(0.0, t - seconds)
    dur = seconds * 2.0
    mono, _ = read_stretch(source_path(setno), a, dur)
    if len(mono) < SR * 10:
        return None
    smooth = int(2.0 * FRAME_RATE)
    points, levels = {}, {}
    for name, lo, hi, _role in BANDS:
        e = band_env(mono, lo, hi)
        k = np.ones(smooth) / smooth
        e = np.convolve(e, k, mode='same')
        d = db(np.maximum(e, EPS) ** 2)
        third = max(4, len(d) // 5)
        lo_p, hi_p = float(np.median(d[:third])), float(np.median(d[-third:]))
        levels[name] = {'beforeDb': round(lo_p, 2), 'afterDb': round(hi_p, 2)}
        if abs(hi_p - lo_p) < 1.5:
            points[name] = None
            continue
        mid = (lo_p + hi_p) / 2.0
        rising = hi_p > lo_p
        idx = np.where(d >= mid)[0] if rising else np.where(d <= mid)[0]
        idx = idx[(idx > third) & (idx < len(d) - third)]
        points[name] = round(float(idx[0] / FRAME_RATE - seconds), 2) if len(idx) else None
    got = {k: v for k, v in points.items() if v is not None}
    order = sorted(got, key=lambda k: got[k])
    return {
        'set': setno, 'at_s': t,
        'fromTrack': before['track'], 'toTrack': after['track'],
        'fromKey': before['key'], 'toKey': after['key'],
        'fromBpm': before['bpm'], 'toBpm': after['bpm'],
        'points': points, 'levels': levels,
        'first': order[0] if order else None,
        'order': order,
        'blendSeconds': round(got[order[-1]] - got[order[0]], 2) if len(order) >= 2 else None,
        'bandsThatMoved': len(got),
    }


def main():
    ap = argparse.ArgumentParser(description='The three reference sets, read in v2 terms.')
    ap.add_argument('--out', default=os.path.join(ROOT, 'tmp', 'analysis', 'mine_v2'))
    ap.add_argument('--sets', default='1,2,3')
    ap.add_argument('--anchors', default=os.path.join(HERE, 'anchors.json'))
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--seams-only', action='store_true')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    def say(msg):
        if not args.quiet:
            print(msg, file=sys.stderr, flush=True)

    with open(args.anchors, 'rb') as fh:
        anchors_bytes = fh.read()
    anchors = json.loads(anchors_bytes)
    anchors_id = hashlib.sha256(anchors_bytes).hexdigest()[:8]

    corpus = json.load(open(CORPUS))
    per_track = corpus['progressions']['per_track']
    arrangement = {(t['set'], t['track']): t for t in corpus['arrangement']['per_track']}
    wanted = {int(s) for s in args.sets.split(',') if s.strip()}

    os.makedirs(args.out, exist_ok=True)
    win_path = os.path.join(args.out, 'windows.json')
    seam_path = os.path.join(args.out, 'seams.json')

    # The sources' own identity, by content, never by a path: the same rule an
    # imprint's `source.hash` keeps.
    hashes = {}
    for s in sorted(wanted):
        h = hashlib.sha256()
        with open(source_path(s), 'rb') as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b''):
                h.update(chunk)
        hashes[str(s)] = 'sha256:' + h.hexdigest()[:32]

    done = {}
    if args.resume and os.path.exists(win_path):
        old = json.load(open(win_path))
        done = {(t['set'], t['track']): t for t in old.get('stretches', [])}
        say(f'  resuming: {len(done)} stretches already measured')

    if not args.seams_only:
        stretches = []
        todo = [t for t in per_track if t['set'] in wanted]
        for i, tr in enumerate(todo):
            key = (tr['set'], tr['track'])
            if key in done:
                stretches.append(done[key])
                continue
            say(f'  [{i + 1}/{len(todo)}] set {tr["set"]} track {tr["track"]} '
                f'{tr["start_s"]}+{tr["dur_s"]} s at {tr["bpm"]} BPM')
            row = measure_stretch(tr, anchors, 11025.0, say)
            if row is None:
                continue
            # The section each window sits in, from the same corpus that cut the
            # stretch. A label is v1's arrangement reading and carries v1's own
            # confidence (CORPUS.md §5: measured for groove and breakdown,
            # definitional for build and drop).
            arr = arrangement.get(key)
            if arr:
                labels = []
                for name, bars in arr['sections']:
                    labels += [name] * int(bars)
                for w in row['windows']:
                    centre = w['barFrom'] + 4
                    w['section'] = labels[centre] if centre < len(labels) else None
                    span = labels[w['barFrom']:w['barFrom'] + 8]
                    w['sectionPure'] = bool(span) and len(set(span)) == 1
                row['sections'] = arr['sections']
                row['totalBars'] = arr['total_bars']
            stretches.append(row)
            with open(win_path, 'w') as fh:
                json.dump({'tool': TOOL, 'version': TOOL_VERSION,
                           'anchors': f'anchors.json@{anchors_id}',
                           'sources': hashes,
                           'segmentation': corpus['meta']['track_segmentation'],
                           'stretches': stretches}, fh)
        say(f'  {len(stretches)} stretches, '
            f'{sum(len(s["windows"]) for s in stretches)} windows -> {win_path}')

    seams = []
    for s in sorted(wanted):
        ts = sorted([t for t in per_track if t['set'] == s], key=lambda t: t['start_s'])
        for before, after in zip(ts, ts[1:]):
            gap = after['start_s'] - (before['start_s'] + before['dur_s'])
            if gap != 0:
                continue
            say(f'  seam: set {s} at {before["start_s"] + before["dur_s"]} s, '
                f'{before["key"]} -> {after["key"]}')
            row = measure_seam(s, before, after, say=say)
            if row:
                seams.append(row)
    with open(seam_path, 'w') as fh:
        json.dump({'tool': TOOL, 'version': TOOL_VERSION, 'sources': hashes,
                   'note': 'a hand-over is a junction where one stretch begins exactly where '
                           'the one before it ended; the window is sixty seconds either side',
                   'seams': seams}, fh, indent=1)
    say(f'  {len(seams)} seams -> {seam_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
