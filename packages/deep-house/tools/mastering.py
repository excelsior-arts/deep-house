# mastering.py — PLAN-MASTERING's measurement: our renders and the reference
# sets through the same instrument, full band and through a phone.
#
#   tmp/analysis/venv/bin/python packages/deep-house/tools/mastering.py \
#       --ours tmp/mastering/ours --refs mining --out tmp/mastering/reading.json
#   ... --ours tmp/mastering/demo-a --ours-b tmp/mastering/demo-b --no-refs   an A/B
#
# **The references are analysed, never played.** A reference window is decoded
# by ffmpeg into this process's memory (48 kHz float, stereo) and nothing is
# written back but numbers. The windows are the catalogue's chunks
# (`mining/manifest.json`), labelled by the catalogue's own `style.label`; each
# chunk contributes its middle `--ref-seconds` (90 by default).
#
# ## The instrument
#
# Every signal is first **levelled to -14 LUFS integrated** (BS.1770-4, gated),
# so every spectrum below is a *shape* at one loudness and not a master's level.
# The as-mastered loudness is reported beside it, because SoundCloud does not
# normalise and neither does our page: a record 4 LU hotter is 4 dB louder on
# the same phone at the same volume step.
#
# - **LTAS**: Welch power spectrum (8192-point Hann, half overlap) of L and R,
#   summed, pooled into third octaves 25 Hz-16 kHz; dB relative to the levelled
#   signal, so two rows subtract.
# - **The phone**: `phone()` below. The two channels summed to mono (a phone's
#   one or two small drivers an inch apart, and the iPhone Air has one), then a
#   fourth-order Butterworth high-pass at `PHONE_HP` Hz (-24 dB/octave, the
#   roll-off of a micro-speaker under its resonance together with the
#   protective high-pass its amplifier's DSP runs), then a second-order
#   Butterworth low-pass at 8 kHz. The corner is a judgement and not a
#   citation: a micro-speaker falls away under its resonance, and the handset's
#   amplifier high-passes on top of that to protect it, so the usable band
#   starts somewhere around 300-500 Hz; 350 Hz is the kind reading and
#   `phone500` (every reading carries both) the harsh one for a thin
#   single-speaker phone. It is a model, stated, and not a measurement of
#   Eugene's phone.
# - **Phone retention**: loudness of the phone's output minus the loudness of
#   the full-band stereo signal, in LU. How much of what the record is survives.
# - **Events**: onsets from a log-spectral flux in three classes by where the
#   flux is — low (31.5-200 Hz: kick, bass), mid (250-2000 Hz: notes, chords,
#   the clap's body), high (2.5-16 kHz: hats, shakers, the clap's crack) — on
#   the levelled full-band signal; a band counts only above an absolute floor
#   (-70 dBFS after levelling) and within 30 dB of the frame's loudest band
#   (what is 30 dB under the loudest thing in the room is masked). The same
#   detector runs on the phone's output. An onset **survives** when the phone's
#   output has an onset within 25 ms of it. The classes and the rates are the
#   comparison; the absolute rate is the detector's and not the music's, which is
#   why ours and the references go through the one detector.
#
# For our renders there are **stems** as well (mastering.ts): each is read for
# its share of the phone's energy, its own spectral shape (how much of the stem
# lives in 250 Hz-2 kHz at all), how often it is within 20 dB of the mix in the
# mid band (present and audible) and what a mono sum costs it.

import argparse
import glob
import json
import os
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 48000
THIRDS = [25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250,
          1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000]
BANDS = {'sub <100': (20, 100), 'low 100-300': (100, 300), 'mid 300-2k': (300, 2000),
         'presence 2-8k': (2000, 8000), 'air >8k': (8000, 20000)}
TARGET = -14.0

# --- loudness (BS.1770-4) ---------------------------------------------------

def k_weight(x, sr=SR):
    # The two published stages, at 48 kHz.
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(x, sr=SR):
    """Integrated loudness of a (channels, n) or (n,) array, gated."""
    x = np.atleast_2d(x)
    y = k_weight(x, sr)
    block, hop = int(0.4 * sr), int(0.1 * sr)
    if y.shape[1] < block:
        return -99.0
    n = 1 + (y.shape[1] - block) // hop
    ms = np.array([[np.mean(y[c, i * hop:i * hop + block] ** 2) for i in range(n)] for c in range(y.shape[0])])
    z = ms.sum(axis=0)
    ld = -0.691 + 10 * np.log10(z + 1e-20)
    g = z[ld > -70]
    if not len(g):
        return -99.0
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = z[(ld > -70) & (ld > rel)]
    return float(-0.691 + 10 * np.log10(g2.mean() + 1e-20))


def true_peak(x):
    up = signal.resample_poly(np.atleast_2d(x), 4, 1, axis=-1)
    return float(20 * np.log10(np.max(np.abs(up)) + 1e-20))

# --- the phone --------------------------------------------------------------

PHONE_HP = 350.0
PHONE_LP = 8000.0


def phone(x, hp=None):
    hp = hp or PHONE_HP
    m = np.atleast_2d(x).mean(axis=0)
    sos = np.vstack([signal.butter(4, hp, 'highpass', fs=SR, output='sos'),
                     signal.butter(2, PHONE_LP, 'lowpass', fs=SR, output='sos')])
    return signal.sosfilt(sos, m)


def phone_response_db(freqs, hp=None):
    hp = hp or PHONE_HP
    sos = np.vstack([signal.butter(4, hp, 'highpass', fs=SR, output='sos'),
                     signal.butter(2, PHONE_LP, 'lowpass', fs=SR, output='sos')])
    _, h = signal.sosfreqz(sos, worN=np.asarray(freqs, float), fs=SR)
    return 20 * np.log10(np.abs(h) + 1e-20)

# --- spectra ----------------------------------------------------------------

def psd(x):
    x = np.atleast_2d(x)
    f, p = signal.welch(x, fs=SR, nperseg=8192, noverlap=4096, axis=-1)
    return f, p.sum(axis=0)


def thirds(f, p):
    out = []
    for c in THIRDS:
        lo, hi = c / 2 ** (1 / 6), c * 2 ** (1 / 6)
        s = p[(f >= lo) & (f < hi)].sum()
        out.append(10 * np.log10(s + 1e-30))
    return out


def band_shares(f, p):
    tot = p[(f >= 20) & (f < 20000)].sum()
    return {k: float(100 * p[(f >= lo) & (f < hi)].sum() / tot) for k, (lo, hi) in BANDS.items()}


def band_power(f, p, lo, hi):
    return float(p[(f >= lo) & (f < hi)].sum())

# --- events -----------------------------------------------------------------

N_FFT, HOP = 2048, 512
EDGES = [(c / 2 ** (1 / 6), c * 2 ** (1 / 6)) for c in THIRDS[1:]]  # 31.5 .. 16k
CLASSES = {'low': (31.5, 200), 'mid': (250, 2000), 'high': (2500, 16000)}


def band_frames(m):
    f, t, Z = signal.stft(m, fs=SR, nperseg=N_FFT, noverlap=N_FFT - HOP, boundary=None, padded=False)
    P = np.abs(Z) ** 2
    B = np.stack([P[(f >= lo) & (f < hi)].sum(axis=0) for lo, hi in EDGES])
    return 10 * np.log10(B + 1e-20), t


def onsets(m, classes=None):
    """Onset times per class of a mono signal already levelled.

    A band's level is floored at 30 dB under the frame's loudest band (masked)
    and at 60 dB under the loudest frame of the whole window (silence), so a
    band the phone has filtered to nothing contributes no flux at all."""
    L, t = band_frames(m)
    top = np.percentile(L.max(axis=0), 99)
    floor = np.maximum(top - 60.0, L.max(axis=0, keepdims=True) - 30.0)
    Lc = np.maximum(L, floor)
    d = np.diff(Lc, axis=1, prepend=Lc[:, :1])
    d = np.maximum(d, 0)
    centres = np.array(THIRDS[1:])
    out = {}
    for k, (lo, hi) in (classes or CLASSES).items():
        sel = (centres >= lo) & (centres <= hi)
        o = d[sel].sum(axis=0)
        # an adaptive threshold: the median over a second, plus a margin that
        # grows with the number of bands pooled
        w = int(1.0 * SR / HOP) | 1
        med = signal.medfilt(o, w) if len(o) > w else np.full_like(o, np.median(o))
        thr = med + 3.0 * sel.sum() ** 0.5
        peaks, _ = signal.find_peaks(o, height=thr, distance=max(1, int(0.05 * SR / HOP)))
        out[k] = t[peaks]
    return out


PHONE_CLASS = {'any': (250, 8000)}
TOL = 1.5 * HOP / SR  # one frame either side


def survival(full, ph):
    """The share of each class's full-band onsets the phone's output also
    shows an onset at (any band it passes, within a frame), and the share a
    phone onset stream that rate would hit by chance."""
    p = np.sort(ph['any'])
    chance = min(1.0, len(p) / max(1e-9, (p[-1] - p[0]) if len(p) > 1 else 1) * 2 * TOL) if len(p) else 0.0
    res = {}
    for k, ts in full.items():
        if not len(ts):
            res[k] = None
            continue
        if not len(p):
            res[k] = 0.0
            continue
        i = np.searchsorted(p, ts)
        near = np.minimum(np.abs(p[np.clip(i, 0, len(p) - 1)] - ts), np.abs(p[np.clip(i - 1, 0, len(p) - 1)] - ts))
        res[k] = float(np.mean(near <= TOL))
    return res, chance

# --- one signal -------------------------------------------------------------

def read_signal(x, hp_list=(350.0, 500.0)):
    """Everything the note reports of one stereo signal (2, n)."""
    raw_lufs = lufs(x)
    g = 10 ** ((TARGET - raw_lufs) / 20)
    y = x * g
    f, p = psd(y)
    row = {
        'lufs': raw_lufs, 'truePeak': true_peak(x),
        'thirds': thirds(f, p), 'shares': band_shares(f, p),
    }
    mono = y.mean(axis=0)
    fm, pm = psd(mono)
    row['monoLossMidDb'] = float(10 * np.log10(band_power(fm, pm, 300, 2000) * 2 / (band_power(f, p, 300, 2000) + 1e-30) + 1e-30))
    full_on = onsets(mono)
    dur = y.shape[1] / SR
    row['seconds'] = dur
    row['onsetsPerSec'] = {k: len(v) / dur for k, v in full_on.items()}
    for hp in hp_list:
        ph = phone(y, hp)
        key = f'phone{int(hp)}'
        fp, pp = psd(ph)
        ph_on = onsets(ph, PHONE_CLASS)
        sv, chance = survival(full_on, ph_on)
        row[key] = {
            'retentionLU': lufs(ph) - TARGET,
            'thirds': thirds(fp, pp),
            'shares': band_shares(fp, pp),
            'onsetsPerSec': len(ph_on['any']) / dur,
            'survival': sv, 'chance': chance,
        }
    return row


def read_stems(d, mix):
    """Our stems: shares of the phone, shape, presence, mono cost."""
    mixL = lufs(mix)
    g = 10 ** ((TARGET - mixL) / 20)
    out = {}
    stems = {}
    for fpath in sorted(glob.glob(os.path.join(d, '*.wav'))):
        name = os.path.basename(fpath)[:-4]
        if name == 'mix':
            continue
        v = load_wav(fpath) * g
        if np.mean(v ** 2) > 1e-14:  # a stem with nothing in its window is not a stem here
            stems[name] = v
    if not stems:
        return out
    ph_pow = {k: float(np.mean(phone(v) ** 2)) for k, v in stems.items()}
    tot_ph = sum(ph_pow.values()) + 1e-30
    full_pow = {k: float(np.mean(v ** 2)) for k, v in stems.items()}
    tot_full = sum(full_pow.values()) + 1e-30
    # the mid band of the mix, in 400 ms frames
    def mid_frames(m):
        sos = signal.butter(4, [300, 2000], 'bandpass', fs=SR, output='sos')
        b = signal.sosfilt(sos, m)
        n = int(0.4 * SR)
        k = len(b) // n
        return 10 * np.log10(np.mean(b[:k * n].reshape(k, n) ** 2, axis=1) + 1e-20)
    mixf = mid_frames(mix.mean(axis=0) * g)
    for k, v in stems.items():
        f, p = psd(v)
        tot = band_power(f, p, 20, 20000) + 1e-30
        fm, pm = psd(v.mean(axis=0))
        sf = mid_frames(v.mean(axis=0))
        active = sf > -80
        out[k] = {
            'fullShare': 100 * full_pow[k] / tot_full,
            'phoneShare': 100 * ph_pow[k] / tot_ph,
            'midOfStem': 100 * band_power(f, p, 300, 2000) / tot,
            'lowOfStem': 100 * band_power(f, p, 20, 300) / tot,
            'midLevelDb': float(10 * np.log10(band_power(f, p, 300, 2000) + 1e-30)),
            'midWithin20': float(np.mean((sf > mixf - 20) & active)) if len(sf) else 0.0,
            'midWithin10': float(np.mean((sf > mixf - 10) & active)) if len(sf) else 0.0,
            'monoLossMidDb': float(10 * np.log10(band_power(fm, pm, 300, 2000) * 2 / (band_power(f, p, 300, 2000) + 1e-30) + 1e-30)),
            'centroidHz': float((f * p).sum() / (p.sum() + 1e-30)),
        }
    return out

# --- io ---------------------------------------------------------------------

def load_wav(path):
    import soundfile as sf
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    return x.T.astype(np.float64)


def decode(path, start, seconds):
    """A window of a source, into memory and nowhere else."""
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(seconds), '-i', path,
           '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).T.astype(np.float64)


# --- the report -------------------------------------------------------------

def _med(xs):
    xs = [x for x in xs if x is not None and np.isfinite(x)]
    return float(np.median(xs)) if xs else float('nan')


def _row(rows):
    """One group's medians."""
    g = lambda f: _med([f(r) for r in rows])
    out = {
        'n': len(rows),
        'lufs': g(lambda r: r['lufs']), 'tp': g(lambda r: r['truePeak']),
        **{k: g(lambda r, k=k: r['shares'][k]) for k in BANDS},
        'ret350': g(lambda r: r['phone350']['retentionLU']), 'ret500': g(lambda r: r['phone500']['retentionLU']),
        'played350': g(lambda r: r['lufs'] + r['phone350']['retentionLU']),
        'monoMid': g(lambda r: r['monoLossMidDb']),
        **{f'on_{k}': g(lambda r, k=k: r['onsetsPerSec'][k]) for k in CLASSES},
        **{f'sv_{k}': g(lambda r, k=k: r['phone350']['survival'][k]) for k in CLASSES},
        'chance': g(lambda r: r['phone350']['chance']),
        'thirds': [g(lambda r, i=i: r['thirds'][i]) for i in range(len(THIRDS))],
        'pthirds': [g(lambda r, i=i: r['phone350']['thirds'][i]) for i in range(len(THIRDS))],
    }
    return out


def groups(res):
    ours, refs = res.get('ours', {}), res.get('refs', {})
    G = {}
    def add(name, rows):
        if rows:
            G[name] = _row(rows)
    add('ours: house (12 seeds)', [r for k, r in ours.items() if r['meta']['group'] == 'house'])
    for sc in ('drone-forward', 'drone-back', 'air'):
        add(f'ours: house, {sc}', [r for k, r in ours.items() if r['meta']['group'] == 'house' and r['meta']['scene'] == sc])
    for grp in ('ember-low', 'ember-high', 'dnb', 'veil-high', 'root-low', 'root-high', 'bench', 'v1'):
        add(f'ours: {grp}', [r for k, r in ours.items() if r['meta']['group'] == grp])
    add('ours: every v2 point', [r for k, r in ours.items() if r['meta']['strategy'] == 'house-v2'])
    for lab in ('deep house', 'downtempo', 'house', 'tech house', 'techno', 'ambient'):
        add(f'refs: {lab}', [r for r in refs.values() if r['meta']['label'] == lab])
    add('refs: all', list(refs.values()))
    return G


def stem_table(res, group=None):
    ours = res.get('ours', {})
    names = sorted({s for r in ours.values() for s in r.get('stems', {})})
    out = {}
    for grp in (group or ['house', 'ember-low', 'ember-high', 'veil-high', 'root-low', 'root-high', 'bench', 'v1']):
        rows = [r for r in ours.values() if r['meta']['group'] == grp and 'stems' in r]
        if not rows:
            continue
        out[grp] = {}
        for s in names:
            have = [r['stems'][s] for r in rows if s in r['stems']]
            if not have:
                continue
            out[grp][s] = {k: _med([h[k] for h in have]) for k in have[0]} | {'present': len(have), 'of': len(rows)}
    return out


def report(paths):
    res = {'ours': {}, 'refs': {}}
    for pth in paths:
        r = json.load(open(pth))
        res['ours'].update(r.get('ours', {}))
        res['refs'].update(r.get('refs', {}))
    G = groups(res)
    f = lambda v, d=1: '—' if v is None or not np.isfinite(v) else f'{v:.{d}f}'
    print('| group | n | LUFS as mastered | TP | sub <100 % | low 100-300 % | mid 300-2k % | pres 2-8k % | air % | phone350 LU | phone500 LU | phone as played | mono mid dB |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for k, g in G.items():
        print(f"| {k} | {g['n']} | {f(g['lufs'])} | {f(g['tp'])} | {f(g['sub <100'])} | {f(g['low 100-300'])} | {f(g['mid 300-2k'])} | {f(g['presence 2-8k'])} | {f(g['air >8k'],2)} | {f(g['ret350'])} | {f(g['ret500'])} | {f(g['played350'])} | {f(g['monoMid'])} |")
    print()
    print('| group | onsets/s low | mid | high | survive phone: low | mid | high | chance |')
    print('|---|---|---|---|---|---|---|---|')
    for k, g in G.items():
        print(f"| {k} | {f(g['on_low'])} | {f(g['on_mid'])} | {f(g['on_high'])} | {f(100*g['sv_low'],0)} % | {f(100*g['sv_mid'],0)} % | {f(100*g['sv_high'],0)} % | {f(100*g['chance'],0)} % |")
    print()
    keys = [k for k in G]
    print('LTAS, third octaves, dB re the levelled signal (-14 LUFS):')
    print('| Hz | ' + ' | '.join(keys) + ' |')
    print('|---|' + '---|' * len(keys))
    for i, c in enumerate(THIRDS):
        print(f'| {c:g} | ' + ' | '.join(f(G[k]['thirds'][i]) for k in keys) + ' |')
    print()
    print('Stems (ours), medians: phone share %, full share %, mid-of-stem %, low-of-stem %, within 10 dB of the mix in 300-2k (share of 400 ms frames), mono mid dB, centroid Hz, present/of')
    for grp, st in stem_table(res).items():
        print(f'\n{grp}:')
        print('| stem | phone % | full % | mid of stem % | low of stem % | within 10 dB | within 20 dB | mono mid dB | centroid Hz | present |')
        print('|---|---|---|---|---|---|---|---|---|---|')
        for s, v in sorted(st.items(), key=lambda kv: -kv[1]['phoneShare']):
            print(f"| {s} | {f(v['phoneShare'])} | {f(v['fullShare'])} | {f(v['midOfStem'])} | {f(v['lowOfStem'])} | {f(v['midWithin10'],2)} | {f(v['midWithin20'],2)} | {f(v['monoLossMidDb'])} | {f(v['centroidHz'],0)} | {v['present']}/{v['of']} |")
    return G


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ours', default=None)
    ap.add_argument('--refs', default=None, help='the mining/ directory')
    ap.add_argument('--ref-seconds', type=float, default=90)
    ap.add_argument('--out', default=None)
    ap.add_argument('--report', nargs='*', default=None, help='readings to tabulate')
    ap.add_argument('--no-stems', action='store_true')
    a = ap.parse_args()
    if a.report is not None:
        report(a.report)
        return
    res = {'target': TARGET, 'thirds': THIRDS, 'phone': {'hp': [350, 500], 'lp': PHONE_LP,
           'response350': phone_response_db(THIRDS, 350).tolist(), 'response500': phone_response_db(THIRDS, 500).tolist()},
           'ours': {}, 'refs': {}}
    if a.ours:
        for d in sorted(glob.glob(os.path.join(a.ours, '*', 'mix.wav'))):
            d = os.path.dirname(d)
            name = os.path.basename(d)
            meta = json.load(open(os.path.join(d, 'meta.json')))
            mix = load_wav(os.path.join(d, 'mix.wav'))
            row = read_signal(mix)
            row['meta'] = {k: meta.get(k) for k in ('group', 'seed', 'theme', 'strategy', 'bpm', 'preset', 'density', 'scene', 'texture', 'tempoFamily', 'kit', 'drumsOn')}
            if not a.no_stems:
                row['stems'] = read_stems(d, mix)
            res['ours'][name] = row
            print(f'  ours {name:16} {row["lufs"]:6.2f} LUFS  phone350 {row["phone350"]["retentionLU"]:6.2f} LU  mid {row["shares"]["mid 300-2k"]:5.1f}%', flush=True)
    if a.refs:
        man = json.load(open(os.path.join(a.refs, 'manifest.json')))
        for cid, c in man['chunks'].items():
            src = os.path.join(a.refs, 'sources', c['source'], man['sources'][c['source']]['file'])
            if not os.path.exists(src):
                continue
            mid = c['start'] + c['duration'] / 2
            secs = min(a.ref_seconds, c['duration'])
            x = decode(src, mid - secs / 2, secs)
            row = read_signal(x)
            row['meta'] = {'label': c['style']['label'], 'source': c['source'], 'bpm': c['bpm'], 'section': c['section']}
            res['refs'][cid] = row
            print(f'  ref  {cid:14} {c["style"]["label"]:11} {row["lufs"]:6.2f} LUFS  phone350 {row["phone350"]["retentionLU"]:6.2f} LU  mid {row["shares"]["mid 300-2k"]:5.1f}%', flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(res, open(a.out, 'w'), indent=1)


if __name__ == '__main__':
    main()
