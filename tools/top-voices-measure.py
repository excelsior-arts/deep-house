# top-voices (11-02), scratch: the sketches' levels. Per WAV: integrated loudness (LUFS), the hits' peaks (a 10 ms RMS,
# 2.5 ms hop, mono; peaks 60 ms apart and within 30 dB of the loudest) as median and 90th percentile, full band and
# 6-12 kHz, and the energy's mean frequency. With --against <hat.wav> each line says how far under the hat it sits.
#   tmp/analysis/venv/bin/python tools/top-voices-measure.py <a.wav> ... [--against hat.wav] [--json out.json]
import sys, json, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import butter, sosfilt, find_peaks
args = sys.argv[1:]
def opt(k):
    if k in args: i = args.index(k); v = args[i + 1]; del args[i:i + 2]; return v
against = opt('--against'); jout = opt('--json')
def read(f):
    x, sr = sf.read(f, dtype='float64'); return x, sr
def peaks(m, sr):
    w = int(0.01 * sr); h = int(0.0025 * sr)
    e = np.sqrt(np.convolve(m * m, np.ones(w) / w, mode='same'))[::h]
    db = 20 * np.log10(e + 1e-12)
    if db.max() < -100: return np.array([-120.0])
    pk, _ = find_peaks(db, distance=int(0.06 / 0.0025), height=db.max() - 30, prominence=3)
    return db[pk] if len(pk) else np.array([db.max()])
def measure(f):
    x, sr = read(f); m = x.mean(axis=1)
    lufs = pyln.Meter(sr).integrated_loudness(x)
    band = sosfilt(butter(4, [6000, 12000], btype='band', fs=sr, output='sos'), m)
    p, pb = peaks(m, sr), peaks(band, sr)
    S = np.abs(np.fft.rfft(m)) ** 2; fr = np.fft.rfftfreq(len(m), 1 / sr)
    return dict(lufs=round(float(lufs), 2), med=round(float(np.median(p)), 2), p90=round(float(np.percentile(p, 90)), 2),
      band_med=round(float(np.median(pb)), 2), band_p90=round(float(np.percentile(pb, 90)), 2), hits=int(len(p)),
      centroid=int((S * fr).sum() / max(S.sum(), 1e-20)))
res = {}
ref = measure(against) if against else None
if ref: print('hat', ref)
for f in args:
    r = measure(f)
    if ref: r |= dict(under_hat=round(r['p90'] - ref['med'], 1), band_under_hat=round(r['band_p90'] - ref['band_med'], 1))
    res[f.split('/')[-1]] = r; print(f.split('/')[-1], r)
if jout: json.dump(dict(hat=ref, files=res), open(jout, 'w'), indent=1)
