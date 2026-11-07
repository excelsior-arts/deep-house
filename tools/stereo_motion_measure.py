# stereo-motion (10-31; a copy of the stereo audit's, with the fold per block and per section)
# stereo-audit (10-31): the stereo field of a render, read off a WAV (tools/stereo-render.ts writes them).
#
#   python tools/stereo-measure.py <out.json> <render.wav> [<render.wav> ...]
#
# Per file, in 1 s blocks (hop 0.5 s) over the blocks that sound (block level over -55 dBFS):
#   - side-to-mid energy per band (sub < 120, low-mid 120-300, mid 300-2k, presence 2-6k, air 6-16k), dB, the mean;
#   - L/R correlation, full band and per band: mean, 5th percentile, the share of blocks under 0 and under 0.2;
#   - the balance, L over R in dB: mean, the 95th percentile of its size, the share of blocks past 3 dB;
#   - the mono fold: 20 log10 of the mono sum's RMS over the stereo RMS, and per band the power the fold loses;
#   - movement: the chord band's (300-2k) side/mid over time (CV, the envelope spectrum's peak in 0.03-1.5 Hz and its
#     prominence), the balance's travel (std of the balance series) and the lag of the L/R cross-correlation in the air band
#     (a Haas offset shows as a lag off nought);
#   - by section, where the render's facts (<name>.json beside it) name sections: the chord band's S/M and the correlation.

import json
import sys
import os
import numpy as np
from scipy.io import wavfile

BANDS = [('sub', 20, 120), ('lowmid', 120, 300), ('mid', 300, 2000), ('presence', 2000, 6000), ('air', 6000, 16000)]


def read(path):
    rate, data = wavfile.read(path)
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32768
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483648
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    return rate, data[:, 0].astype(np.float64), data[:, 1].astype(np.float64)


def db(x):
    return 10 * np.log10(np.maximum(x, 1e-20))


def measure(path, facts=None):
    rate, L, R = read(path)
    n = len(L)
    block = rate
    hop = rate // 2
    win = np.hanning(block)
    freqs = np.fft.rfftfreq(block, 1 / rate)
    bands = [(name, (freqs >= lo) & (freqs < min(hi, rate / 2))) for name, lo, hi in BANDS]
    rows = []
    starts = list(range(0, max(1, n - block + 1), hop))
    for s in starts:
        l = L[s:s + block]
        r = R[s:s + block]
        if len(l) < block:
            break
        level = db(np.mean((l * l + r * r) / 2))
        lw = np.fft.rfft(l * win)
        rw = np.fft.rfft(r * win)
        m = (lw + rw) / 2
        sd = (lw - rw) / 2
        pl = np.abs(lw) ** 2
        pr = np.abs(rw) ** 2
        pm = np.abs(m) ** 2
        ps = np.abs(sd) ** 2
        cross = np.real(lw * np.conj(rw))
        row = {'t': s / rate, 'level': level}
        for name, mask in bands:
            el, er, em, es, ec = pl[mask].sum(), pr[mask].sum(), pm[mask].sum(), ps[mask].sum(), cross[mask].sum()
            row[f'sm_{name}'] = db(es) - db(em)
            row[f'corr_{name}'] = ec / np.sqrt(max(el * er, 1e-30))
            row[f'bal_{name}'] = db(el) - db(er)
            # the fold's loss in the band: mono power against the stereo mean power
            row[f'fold_{name}'] = db(em) - db((el + er) / 2)
            row[f'e_{name}'] = db((el + er) / 2)
        row['corr'] = cross.sum() / np.sqrt(max(pl.sum() * pr.sum(), 1e-30))
        row['bal'] = db(pl.sum()) - db(pr.sum())
        row['sm'] = db(ps.sum()) - db(pm.sum())
        row['fold'] = db(pm.sum()) - db((pl.sum() + pr.sum()) / 2)
        # the air band's cross-correlation lag, in ms: a Haas offset or a one-sided delay shows here
        hi = (freqs >= 4000) & (freqs < min(16000, rate / 2))
        cs = np.zeros_like(lw)
        cs[hi] = lw[hi] * np.conj(rw[hi])
        xc = np.fft.irfft(cs, block)
        span = int(0.02 * rate)
        seg = np.concatenate([xc[-span:], xc[:span + 1]])
        lag = int(np.argmax(np.abs(seg))) - span
        row['lag_ms'] = 1000 * lag / rate
        row['lag_peak'] = float(np.abs(seg).max() / max(np.abs(seg[span]), 1e-30))
        rows.append(row)
    rows = [r for r in rows if np.isfinite(r['level'])]
    active = [r for r in rows if r['level'] > -55]
    if not active:
        return {'file': path, 'empty': True}
    out = {'file': os.path.basename(path), 'seconds': n / rate, 'rate': rate, 'blocks': len(active)}
    mono = (L + R) / 2
    out['rms_stereo_db'] = float(db(np.mean((L * L + R * R) / 2)))
    out['rms_mono_db'] = float(db(np.mean(mono * mono)))
    out['fold_db'] = out['rms_mono_db'] - out['rms_stereo_db']
    out['peak_db'] = float(20 * np.log10(max(np.abs(L).max(), np.abs(R).max(), 1e-9)))
    for name, _ in bands:
        sm = np.array([r[f'sm_{name}'] for r in active if np.isfinite(r[f'sm_{name}']) and r[f'e_{name}'] > -70])
        co = np.array([r[f'corr_{name}'] for r in active if r[f'e_{name}'] > -70])
        ba = np.array([r[f'bal_{name}'] for r in active if r[f'e_{name}'] > -70])
        fo = np.array([r[f'fold_{name}'] for r in active if r[f'e_{name}'] > -70])
        if len(sm) == 0:
            continue
        out[f'sm_{name}'] = float(np.mean(sm))
        out[f'corr_{name}'] = float(np.mean(co))
        out[f'corr_{name}_p5'] = float(np.percentile(co, 5))
        out[f'corr_{name}_under0'] = float(np.mean(co < 0))
        out[f'bal_{name}'] = float(np.mean(ba))
        out[f'fold_{name}'] = float(np.mean(fo))
        out[f'e_{name}'] = float(np.mean([r[f'e_{name}'] for r in active]))
    corr = np.array([r['corr'] for r in active])
    bal = np.array([r['bal'] for r in active])
    out['corr'] = float(np.mean(corr))
    out['corr_p5'] = float(np.percentile(corr, 5))
    out['corr_min'] = float(corr.min())
    out['corr_under0'] = float(np.mean(corr < 0))
    out['corr_under02'] = float(np.mean(corr < 0.2))
    out['sm'] = float(np.mean([r['sm'] for r in active]))
    out['bal'] = float(np.mean(bal))
    out['bal_abs_p95'] = float(np.percentile(np.abs(bal), 95))
    out['bal_over3'] = float(np.mean(np.abs(bal) > 3))
    out['bal_travel'] = float(np.std(bal))
    # movement: the chord band's side/mid series
    sm_mid = np.array([r['sm_mid'] for r in active])
    lin = 10 ** (sm_mid / 20)
    out['width_cv_mid'] = float(np.std(lin) / max(np.mean(lin), 1e-9))
    if len(lin) >= 32:
        x = lin - lin.mean()
        spec = np.abs(np.fft.rfft(x * np.hanning(len(x))))
        f = np.fft.rfftfreq(len(x), 0.5)
        band = (f >= 0.03) & (f <= 1.5)
        if band.any():
            i = np.argmax(spec[band])
            out['width_mod_hz'] = float(f[band][i])
            out['width_mod_prom'] = float(spec[band][i] / max(np.median(spec[band]), 1e-9))
    lags = np.array([r['lag_ms'] for r in active if r['e_air'] > -60])
    if len(lags):
        out['lag_ms_median'] = float(np.median(lags))
        out['lag_off0_share'] = float(np.mean(np.abs(lags) > 0.3))
    # the sections, where the facts name them
    if facts and facts.get('sections'):
        bs = facts['barSeconds']
        from_bar = facts.get('fromBar', 0)
        secs = []
        for s in facts['sections']:
            t0 = (s['startBar'] - from_bar) * bs
            t1 = t0 + s['bars'] * bs
            rs = [r for r in active if t0 <= r['t'] < t1]
            if len(rs) < 2:
                continue
            secs.append({'kind': s['kind'], 'startBar': s['startBar'], 'bars': s['bars'],
                         'sm_mid': float(np.mean([r['sm_mid'] for r in rs])), 'sm_air': float(np.mean([r['sm_air'] for r in rs])),
                         'sm': float(np.mean([r['sm'] for r in rs])), 'corr': float(np.mean([r['corr'] for r in rs])),
                         'bal': float(np.mean([r['bal'] for r in rs])), 'fold': float(np.mean([r['fold'] for r in rs])),
                         'corr_p5': float(np.percentile([r['corr'] for r in rs], 5)), 'level': float(np.mean([r['level'] for r in rs]))})
        out['sections'] = secs
    # the series, thinned, for the plots and the sketches' facts
    out['series'] = [{'t': r['t'], 'sm_mid': round(r['sm_mid'], 2), 'sm': round(r['sm'], 2), 'corr': round(r['corr'], 3), 'bal': round(r['bal'], 2), 'level': round(r['level'], 1)} for r in active[::2]]
    return out


if __name__ == '__main__':
    out_path = sys.argv[1]
    results = {}
    for path in sys.argv[2:]:
        base = os.path.basename(path)[:-4]
        name = base.rsplit('-', 1)[0]
        facts_path = os.path.join(os.path.dirname(path), name + '.json')
        facts = json.load(open(facts_path)) if os.path.exists(facts_path) else None
        try:
            results[base] = measure(path, facts)
        except Exception as e:  # a short or odd file is reported, never fatal
            results[base] = {'file': base, 'error': str(e)}
        print(base, {k: round(v, 2) for k, v in results[base].items() if isinstance(v, float) and k in ('sm_sub', 'sm_lowmid', 'sm_mid', 'sm_presence', 'sm_air', 'corr', 'corr_p5', 'bal', 'fold_db', 'width_cv_mid')})
    json.dump(results, open(out_path, 'w'), indent=1)
