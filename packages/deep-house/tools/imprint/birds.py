# The eight birds, as measurements of a piece of audio.
#
# This module is the whole measurement and nothing else: no files, no schema,
# no command line. `imprint.py` reads audio and writes rows; `calibrate.py`
# reads rows and re-centres the anchors; both import this.
#
# The contract every bird keeps:
#
#   a bird is the mean of its features' normalised values, each feature a
#   single scalar read off the audio, each mapped to 0..1 through three raw
#   anchors — the 0 wall, the house default and the 1 wall — read from
#   anchors.json. Nothing here knows what a good number is; the anchors do.
#
# A feature declares two things about itself. `needsGrid` means it cannot be
# read without a beat grid, and it is dropped (with the bird's confidence) from
# a window where no grid was found. `scope: track` means it is a property of
# the whole piece rather than of the window, and it is measured once over the
# contiguous audio — which is why an imprint taken from sampled windows has no
# section length in it, and says so rather than inventing one.
#
# Everything is measured on ONE analysis front end — mono at 22050 Hz, a 2048
# point STFT every 512 samples — whatever the file was, so a render at 48 kHz
# stereo and a reference set decoded to 22.05 kHz mono land in the same space.
# That costs the top octave of Zephyr's air band and all of the stereo image;
# the first is priced into Zephyr's confidence, and the second is why width is
# not a bird.

import math

import numpy as np
import librosa

SR = 22050
N_FFT = 2048
HOP = 512
FRAME_RATE = SR / HOP  # 43.07 frames a second
EPS = 1e-12

# Krumhansl-Kessler, the same profiles the mining used (tmp/analysis/common.py).
KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

BIRDS = ['ember', 'tide', 'zephyr', 'root', 'gleam', 'veil', 'spark', 'loom']


def db(x):
    return 10.0 * np.log10(np.maximum(x, EPS))


def _band_power(power, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    if not m.any():
        return EPS
    return float(power[m].sum())


def _band_centroid(power, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    p = power[m]
    f = freqs[m]
    s = p.sum()
    if s <= EPS:
        return float('nan')
    return float((p * f).sum() / s)


def _butter_env(y, lo, hi, smooth=0.005):
    """Rectified, box-smoothed envelope of one band, at the frame rate."""
    import scipy.signal as sig
    ny = SR / 2.0
    b, a = sig.butter(4, [max(lo / ny, 1e-4), min(hi / ny, 0.999)], btype='band')
    x = sig.filtfilt(b, a, y)
    w = max(1, int(smooth * SR))
    e = np.convolve(np.abs(x), np.ones(w) / w, mode='same')
    hop = int(SR / FRAME_RATE)
    return e[::hop].astype(np.float64)


# --- the grid ---------------------------------------------------------------

def find_grid(y, onset_env):
    """Tempo, beat phase and how much of a grid there is at all.

    The strength is the normalised autocorrelation of the onset envelope at the
    beat lag: it is Spark's confidence and the gate on every feature that needs
    to know where a beat is.

    The phase is then checked against the low end, because in this music the
    loudest thing every 8th is a hat and a beat tracker will happily lock to it:
    fourteen golden themes read a kick 1.6 dB over the sixteenths after it —
    which is not a deep house kick, it is a grid half a beat out. Where there is
    a low band to ask, the two phases half a beat apart are folded and the
    louder one wins. This is the same correction the 2026-09-15 mining made
    ("without it every swing figure reads ~7% early"), made for the same reason.
    """
    if len(onset_env) < 16:
        return {'bpm': None, 'beats': np.array([]), 'strength': 0.0}
    bpm, beats = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=SR, hop_length=HOP, start_bpm=110.0, trim=False, units='frames')
    bpm = float(np.atleast_1d(bpm)[0]) if bpm is not None else 0.0
    # Fold into the range a human would call the tempo. The mining checked the
    # metrical level three ways and found 103 BPM real, so the fold is a range
    # and not a doubling rule.
    while bpm and bpm < 70:
        bpm *= 2
    while bpm and bpm > 185:
        bpm /= 2
    strength = 0.0
    if bpm:
        d = onset_env - onset_env.mean()
        n = len(d)
        ac = np.correlate(d, d, mode='full')[n - 1:]
        if ac[0] > 0:
            ac = ac / ac[0]
        lag = int(round((60.0 / bpm) * FRAME_RATE))
        if 1 < lag < n - 1:
            strength = float(np.clip(ac[max(0, lag - 1):lag + 2].max(), 0.0, 1.0))
    beats = np.atleast_1d(beats)
    shifted = False
    if bpm and len(beats) >= 4:
        lowe = _butter_env(y, 40, 120)
        if float(lowe.max()) > 1e-5:
            half = int(round((60.0 / bpm) * FRAME_RATE / 2.0))

            def fold(shift):
                idx = np.asarray(beats, dtype=int) + shift
                idx = idx[(idx >= 0) & (idx < len(lowe))]
                return float(np.median(lowe[idx])) if len(idx) else 0.0
            on, off = fold(0), fold(half)
            # A third louder is about 2.3 dB: enough to say the kick is there
            # and not on the beats we were handed, and far enough from parity
            # that a drumless piece is left alone.
            if off > on * 1.3:
                beats = np.asarray(beats, dtype=int) + half
                shifted = True
    return {'bpm': bpm or None, 'beats': beats, 'strength': strength, 'phaseShifted': shifted}


def _beat_times(grid):
    b = grid['beats']
    if b is None or len(b) < 2:
        return np.array([])
    return np.asarray(b, dtype=float) / FRAME_RATE


# --- the key ----------------------------------------------------------------

def read_key(y):
    """Root, mode and the margin between the best fit and the next one.

    The chroma is taken with no per-frame normalisation and summed, so the mean
    vector is a share of energy per pitch class rather than a mean of twelve
    per-frame maxima — which is what an extension share has to be read off.
    """
    c = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP, norm=None).mean(axis=1)
    if c.sum() <= EPS:
        return {'root': None, 'mode': None, 'margin': 0.0, 'chroma': c}
    cc = c - c.mean()
    scores = []
    for mode, prof in (('major', KS_MAJ), ('minor', KS_MIN)):
        p = prof - prof.mean()
        for r in range(12):
            pr = np.roll(p, r)
            den = np.linalg.norm(cc) * np.linalg.norm(pr)
            scores.append((float(np.dot(cc, pr) / (den + EPS)), r, mode))
    scores.sort(reverse=True)
    best = scores[0]
    return {
        'root': NOTES[best[1]], 'rootIndex': best[1], 'mode': best[2],
        'margin': float(best[0] - scores[1][0]), 'correlation': float(best[0]),
        'chroma': c,
        'majorMinus': float(max(s[0] for s in scores if s[2] == 'major')
                            - max(s[0] for s in scores if s[2] == 'minor')),
    }


# --- the block features Veil and Loom read ----------------------------------

def _blocks(power_S, mfcc, chroma, block_frames, hop_frames=None):
    """One feature vector per block of frames: timbre, harmony and band shape.

    MFCC 0 is left out on purpose: it is the block's loudness, it is an order of
    magnitude bigger than everything beside it, and a vector it is in is a
    vector about loudness. What is wanted is what the block is *made of*.
    """
    n = power_S.shape[1]
    hop_frames = hop_frames or block_frames
    nb = max(1, 1 + (n - block_frames) // hop_frames) if n >= block_frames else 1
    out = []
    edges = [(i * hop_frames, min(n, i * hop_frames + block_frames)) for i in range(nb)]
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    bands = [(20, 120), (120, 300), (300, 1000), (1000, 4000), (4000, 11000)]
    for a, b in edges:
        if b - a < 2:
            continue
        p = power_S[:, a:b].mean(axis=1)
        ch = chroma[:, a:b].mean(axis=1)
        ch = ch / (ch.sum() + EPS)
        bd = np.array([db(_band_power(p, freqs, lo, hi)) for lo, hi in bands])
        # Fixed scales, so that one step of any dimension means about as much as
        # one step of any other: a cepstral coefficient over twenty, a pitch
        # class as twelve times its share of the harmony, a band over six
        # decibels. They are part of the measurement and moving one is a
        # re-calibration.
        out.append(np.concatenate([mfcc[1:, a:b].mean(axis=1) / 20.0, ch * 12.0, bd / 6.0]))
    return np.array(out) if out else np.zeros((0, 1))


def _consecutive_distance(blocks):
    """How far each block stands from the one before it, in the blocks' own units.

    Deliberately NOT standardised across the piece. A distance divided by the
    spread of the very blocks it is measured on is about 1 for any material
    whatever, which is a measure of nothing; what Veil wants is an absolute
    rate, so each dimension carries a fixed scale chosen in `_blocks` and the
    step is their mean absolute difference. Zero is a block repeated exactly.
    """
    if len(blocks) < 2:
        return []
    B = np.asarray(blocks, dtype=float)
    return [float(np.abs(B[i] - B[i - 1]).mean()) for i in range(1, len(B))]


def _shuffled_distance(blocks, seed=7):
    """The same distance between blocks chosen at random rather than consecutive.

    This is Veil's 1 wall, measured rather than guessed: "each block as unlike
    the one before it as two blocks of this piece picked out of a hat".
    """
    B = np.asarray(blocks, dtype=float)
    if len(B) < 3:
        return None
    rng = np.random.default_rng(seed)
    pairs = [(int(a), int(b)) for a, b in rng.integers(0, len(B), size=(64, 2)) if a != b]
    if not pairs:
        return None
    return float(np.median([np.abs(B[a] - B[b]).mean() for a, b in pairs]))


def _peak_spacing(curve, seconds_per_step):
    """Median spacing, in seconds, of the novelty curve's own peaks.

    A peak is a local maximum standing over the curve's median by half its own
    spread. Fewer than two peaks is no answer at all, which is what the caller
    is told.
    """
    c = np.asarray(curve, dtype=float)
    if len(c) < 4:
        return None, 0
    thr = float(np.median(c) + 0.25 * (np.percentile(c, 75) - np.percentile(c, 25)))
    peaks = [i for i in range(1, len(c) - 1) if c[i] >= c[i - 1] and c[i] > c[i + 1] and c[i] > thr]
    if len(peaks) < 2:
        return None, len(peaks)
    gaps = np.diff(peaks) * seconds_per_step
    return float(np.median(gaps)), len(peaks)


# --- one window -------------------------------------------------------------

def window_features(y, grid=None, track=None):
    """Every raw feature of one window of audio, with what is unmeasurable in it.

    `grid` is the window's own grid unless one is handed in; `track` carries the
    features whose scope is the whole piece (Loom's span), measured once by
    `track_features` and the same for every window of that piece.
    """
    y = np.asarray(y, dtype=np.float64)
    out = {'features': {}, 'missing': [], 'notes': {}}
    f = out['features']

    if len(y) < SR // 2 or float(np.abs(y).max()) < 1e-5:
        out['missing'] = ['silence']
        return out

    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    power = S ** 2
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    mean_power = power.mean(axis=1)
    onset_env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=SR, hop_length=HOP)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP,
                                        units='frames', backtrack=False)
    onsets = np.atleast_1d(onsets)
    if grid is None:
        grid = find_grid(y, onset_env)
    has_grid = bool(grid['bpm']) and grid['strength'] >= 0.05 and len(grid['beats']) >= 4
    out['grid'] = {'bpm': grid['bpm'], 'strength': grid['strength'], 'hasGrid': has_grid}
    out['onsets'] = int(len(onsets))
    seconds = len(y) / SR

    # --- Ember: how much of the sound arrives as an attack -------------------
    H, P = librosa.decompose.hpss(librosa.stft(y, n_fft=N_FFT, hop_length=HOP), margin=(1.0, 3.0))
    hp, pp = float((np.abs(H) ** 2).sum()), float((np.abs(P) ** 2).sum())
    f['percShare'] = pp / (hp + pp + EPS)
    oe = np.maximum(onset_env, 0.0)
    f['onsetCrestDb'] = float(20.0 * np.log10((np.percentile(oe, 95) + EPS) / (np.median(oe) + EPS)))

    # --- Tide: how long a sound is held, and how wet the room is -------------
    mid = _butter_env(y, 300, 4000)
    mid_db = db(mid ** 2)
    # A tail is measured after a harmonic event and never after a kick. In a
    # sidechained record the mid band *rises* for the whole beat after the
    # kick, because that is what the duck's recovery is, so a decay measured
    # there comes out positive: the fourteen golden themes read +9.7 dB/s
    # before this line and are a record with long tails on everything.
    low_for_tail = _butter_env(y, 40, 120)
    kick_level = float(np.percentile(low_for_tail, 75))
    sustains, slopes = [], []
    ot = onsets.astype(int)
    # A tail can only be read where there is room for one. In a busy mix the
    # onsets are 150 ms apart and what follows one is the rise of the next, so
    # only onsets with a quarter of a second of their own are measured, and a
    # window that has fewer than three of those is a window whose decay is
    # unmeasurable — which is `space.md`'s finding stated as a rule.
    gap = int(0.25 * FRAME_RATE)
    for i, fr in enumerate(ot):
        nxt = ot[i + 1] if i + 1 < len(ot) else len(mid) - 1
        if nxt - fr < gap:
            continue
        if fr < len(low_for_tail) and low_for_tail[fr] > kick_level:
            continue
        # The onset detector fires on the whole spectrum and this is one band of
        # it, so the band's own peak is looked for round the onset rather than
        # assumed to be on it. A decay measured from before the peak is a rise.
        lo = max(0, fr - 2)
        hi = min(len(mid_db), fr + max(2, int(0.06 * FRAME_RATE)))
        if hi - lo < 2:
            continue
        top = lo + int(np.argmax(mid_db[lo:hi]))
        peak = float(mid_db[top])
        at300 = top + int(0.30 * FRAME_RATE)
        if at300 < min(len(mid_db), nxt):
            sustains.append(float(mid_db[at300]) - peak)
        head = top + 1
        end = min(len(mid_db) - 1, nxt, top + int(0.40 * FRAME_RATE))
        if end - head >= 3:
            t = np.arange(end - head) / FRAME_RATE
            slope = float(np.polyfit(t, mid_db[head:end], 1)[0])
            slopes.append(np.clip(slope, -200.0, 20.0))
    if len(sustains) >= 3:
        f['sustain300Db'] = float(np.median(sustains))
    else:
        out['missing'].append('sustain300Db')
    if len(slopes) >= 3:
        f['decayDbPerSec'] = float(np.median(slopes))
    else:
        out['missing'].append('decayDbPerSec')
    out['notes']['tailOnsets'] = len(slopes)
    # How far the mid band falls between hits: a wash never clears, a dry stab does.
    f['floorRatioDb'] = float(np.percentile(mid_db, 10) - np.percentile(mid_db, 95))

    # --- Zephyr: where the spectrum sits, and how much air is over it --------
    f['centroidLogHz'] = float(np.log10(max(_band_centroid(mean_power, freqs, 200, 11000), 20.0)))
    air = _band_power(mean_power, freqs, 4000, 11000)
    body = _band_power(mean_power, freqs, 300, 2000)
    f['airBalanceDb'] = float(db(air) - db(body))

    # --- Root: the mass under everything ------------------------------------
    low = _band_power(mean_power, freqs, 20, 120)
    rest = _band_power(mean_power, freqs, 120, 11000)
    f['lowShareDb'] = float(db(low) - db(rest))
    lc = _band_centroid(mean_power, freqs, 20, 200)
    f['lowCentroidHz'] = float(lc) if np.isfinite(lc) else float('nan')
    if not np.isfinite(f['lowCentroidHz']):
        del f['lowCentroidHz']
        out['missing'].append('lowCentroidHz')
    if has_grid:
        lowe = low_for_tail
        bt = _beat_times(grid)
        on, off = [], []
        step = 60.0 / grid['bpm'] / 4.0
        for t in bt:
            i = int(round(t * FRAME_RATE))
            if 0 <= i < len(lowe):
                w = max(1, int(0.03 * FRAME_RATE))
                on.append(float(lowe[max(0, i - w):i + w + 1].max()))
            for k in (1, 2, 3):
                j = int(round((t + k * step) * FRAME_RATE))
                if 0 <= j < len(lowe):
                    off.append(float(lowe[j]))
        if on and off:
            f['kickPresenceDb'] = float(db(np.median(on) ** 2) - db(np.median(off) ** 2))
        else:
            out['missing'].append('kickPresenceDb')
    else:
        out['missing'].append('kickPresenceDb')

    # --- Gleam: the light in the harmony ------------------------------------
    key = read_key(y)
    out['key'] = {k: key[k] for k in ('root', 'mode', 'margin', 'correlation') if k in key}
    if key['root'] is None:
        out['missing'] += ['modeScore', 'extensionShare']
    else:
        f['modeScore'] = key['majorMinus']
        c = np.roll(key['chroma'], -key['rootIndex'])
        c = c / (c.sum() + EPS)
        # 9th, 11th, 13th and the flat seventh against the root and the fifth:
        # the extensions the mining measured at 1.5x the non-chord-tone floor.
        f['extensionShare'] = float((c[2] + c[5] + c[9] + c[10]) / (c[0] + c[7] + EPS))

    # --- Veil: how fast the thing changes -----------------------------------
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(power), sr=SR, n_mfcc=13)
    chroma = librosa.feature.chroma_stft(S=power, sr=SR)
    block_seconds = (4 * 60.0 / grid['bpm']) if has_grid else 2.0   # one bar, or two seconds
    block_frames = max(4, int(block_seconds * FRAME_RATE))
    blocks = _blocks(power, mfcc, chroma, block_frames)
    d = _consecutive_distance(blocks)
    out['blocks'] = len(blocks)
    if d:
        f['blockNovelty'] = float(np.median(d))
        s = _shuffled_distance(blocks)
        if s is not None:
            out['notes']['shuffledNovelty'] = round(s, 5)
    else:
        out['missing'].append('blockNovelty')
    # Flux on a 64-band mel spectrum and not on the 1025 bins of the STFT: bin
    # to bin, most of what moves between two 23 ms frames is the noise floor
    # wandering, and a measure of that is a measure of the room's hiss.
    mel = librosa.feature.melspectrogram(S=power, sr=SR, n_mels=64)
    mag = mel / (mel.sum(axis=0, keepdims=True) + EPS)
    f['fluxNorm'] = float(np.abs(np.diff(mag, axis=1)).sum(axis=0).mean())

    # --- Spark: what the grid is, and what falls off it ---------------------
    if has_grid:
        step = 60.0 / grid['bpm'] / 4.0
        bt = _beat_times(grid)
        # The onset envelope folded onto the four sixteenths of a beat, peak
        # picked inside a quarter of a sixteenth, the way the mining folded its
        # band envelopes. The envelope and not the detected events: peak picking
        # decides what counts as an onset, and in this music it counts the hats
        # and skips half the kicks, which turns the reading into a statement
        # about the detector.
        slots = np.zeros(4)
        w = max(1, int(step * FRAME_RATE / 4))
        for t in bt:
            for k in range(4):
                i = int(round((t + k * step) * FRAME_RATE))
                if 0 <= i < len(oe):
                    slots[k] += float(oe[max(0, i - w):i + w + 1].max())
        # The 'e' and the 'a' against the whole beat. The beat itself is the
        # kick and the '&' is the offbeat hat, and neither is syncopation: this
        # music's own figure puts 1.00 on the '&' and 0.29 on the sixteenths
        # between (REPORT), which is what makes house a low number here and
        # chopped breaks a high one.
        if slots.sum() > 0:
            f['syncIndex'] = float((slots[1] + slots[3]) / slots.sum())
        else:
            out['missing'].append('syncIndex')
        far, total = 0.0, 0.0
        for fr in ot:
            t = fr / FRAME_RATE
            amp = float(oe[fr]) if fr < len(oe) else 0.0
            if amp <= 0 or not len(bt):
                continue
            total += amp
            rel = (t - bt[int(np.argmin(np.abs(bt - t)))]) / step
            # Off the sixteenth by more than three tenths of one — about 43 ms
            # at 104 BPM, where the frame is 23 and the sixteenth 144. Half a
            # sixteenth is not a threshold: nothing can ever be further from
            # the nearest one than that.
            if abs(rel - round(rel)) > 0.30:
                far += amp
        if total > 0:
            f['offGridShare'] = float(far / total)
        else:
            out['missing'].append('offGridShare')
    else:
        out['missing'] += ['syncIndex', 'offGridShare']

    # --- Loom: how long the thing takes -------------------------------------
    f['eventRate'] = float(len(onsets) / max(seconds, 0.5))
    if track and track.get('spanSeconds') is not None:
        f['spanSeconds'] = float(track['spanSeconds'])
        out['notes']['spanSeconds'] = 'track scope'
    else:
        out['missing'].append('spanSeconds')

    out['seconds'] = seconds
    out['rmsDb'] = float(db(float((y ** 2).mean())))
    return out


def track_features(y, grid=None):
    """The features whose scope is the whole piece: Loom's phrase and section span.

    Measured on contiguous audio only, over four-bar blocks, as the median
    spacing of that novelty curve's peaks. A piece sampled as scattered windows
    has no such curve, which is a missing measurement and not a zero.
    """
    y = np.asarray(y, dtype=np.float64)
    out = {'spanSeconds': None, 'peaks': 0, 'blockSeconds': None}
    if len(y) < 40 * SR:
        out['why'] = 'under forty seconds of contiguous audio'
        return out
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    power = S ** 2
    onset_env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=SR, hop_length=HOP)
    if grid is None:
        grid = find_grid(y, onset_env)
    # Four-bar blocks, stepped two bars at a time. The block is the scale the
    # question is asked at — a phrase — and the half-block hop is what lets a
    # minute and a bit of audio carry enough of a curve to have peaks in it at
    # all; read whole blocks apart, a 74 s render is eight numbers and a
    # spacing cannot be taken off eight numbers.
    block_seconds = (16 * 60.0 / grid['bpm']) if grid['bpm'] else 8.0
    block_frames = max(8, int(block_seconds * FRAME_RATE))
    hop_seconds = block_seconds / 2.0
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(power), sr=SR, n_mfcc=13)
    chroma = librosa.feature.chroma_stft(S=power, sr=SR)
    blocks = _blocks(power, mfcc, chroma, block_frames, max(4, block_frames // 2))
    curve = _consecutive_distance(blocks)
    span, peaks = _peak_spacing(curve, hop_seconds)
    out.update({'spanSeconds': span, 'peaks': peaks, 'blockSeconds': block_seconds,
                'hopSeconds': hop_seconds, 'blocks': len(blocks)})
    if span is None:
        out['why'] = f'the novelty curve over {len(blocks)} blocks has {peaks} peaks, and two is the fewest that give a spacing'
    return out


# --- from raw features to birds ---------------------------------------------

def _norm(raw, zero, house, one, house_value):
    if house == zero:
        return house_value
    t = (raw - zero) / (house - zero)
    if t <= 1.0:
        v = t * house_value
    elif one == house:
        v = 1.0
    else:
        v = house_value + (raw - house) / (one - house) * (1.0 - house_value)
    return float(min(1.0, max(0.0, v)))


def score(features, anchors, context):
    """The eight birds and their confidences, from one window's raw features.

    `context` carries what the confidences are read off: the grid's strength,
    the key's margin, how many onsets and blocks there were, and the file's
    Nyquist.
    """
    birds, conf, used = {}, {}, {}
    for name in BIRDS:
        spec = anchors['birds'][name]
        hv = spec['houseValue']
        vals, names = [], []
        for fname, a in spec['features'].items():
            if fname not in features or not np.isfinite(features[fname]):
                continue
            w = float(a.get('weight', 1.0))
            vals.append((w, _norm(features[fname], a['zero'], a['house'], a['one'], hv)))
            names.append(fname)
        wsum = sum(w for w, _ in vals)
        if vals and wsum > 0:
            birds[name] = round(sum(w * v for w, v in vals) / wsum, 4)
        else:
            birds[name] = round(hv, 4) if name != 'spark' else 0.0
        used[name] = names
        conf[name] = round(_confidence(name, names, spec, context), 3)
    return birds, conf, used


def _confidence(name, used, spec, ctx):
    """How much of the measurement was actually available, 0..1.

    Two things pull it down: a feature the window could not give (no grid, no
    key, no contiguous audio), and a measurement whose own instrument was weak.
    """
    want = list(spec['features'].keys())
    total = sum(float(spec['features'][f].get('weight', 1.0)) for f in want)
    coverage = (sum(float(spec['features'][f].get('weight', 1.0)) for f in used) / total) if total > 0 else 0.0
    onsets = ctx.get('onsets', 0)
    if name == 'ember':
        q = min(1.0, onsets / 8.0) if onsets else 0.3
    elif name == 'tide':
        q = min(1.0, onsets / 12.0) if onsets else 0.25
    elif name == 'zephyr':
        # The air band is 4-11 kHz; a file that does not reach 11 kHz has less
        # of it to read. The reference sets are 22.05 kHz mono and sit at 0.92.
        q = float(np.clip((ctx.get('nyquist', SR / 2) - 5000.0) / 6000.0, 0.2, 1.0))
        q = 0.5 + 0.5 * q
    elif name == 'root':
        q = 1.0 if ctx.get('lowShareDb', 0.0) > -45 else 0.5
    elif name == 'gleam':
        q = float(np.clip(ctx.get('keyMargin', 0.0) / 0.12, 0.1, 1.0))
    elif name == 'veil':
        q = min(1.0, ctx.get('blocks', 0) / 6.0)
    elif name == 'spark':
        q = float(np.clip((ctx.get('gridStrength', 0.0) - 0.05) / 0.35, 0.0, 1.0))
    elif name == 'loom':
        q = 0.45 + 0.55 * min(1.0, ctx.get('spanPeaks', 0) / 3.0)
    else:
        q = 1.0
    return float(np.clip(coverage * q, 0.0, 1.0))
