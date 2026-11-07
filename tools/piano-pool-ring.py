# piano-pool round 2 (11-01), scratch: the renders of tools/piano-pool-notes.ts, each note's fall.
#   python tools/piano-pool-ring.py <out-dir> <render,render,...> [dur|midi|vel]
# each note's fall: the envelope (RMS, 20 ms hops, both channels), its peak, and the time from the strike until it
# last stands within 40 dB (and 20 dB) of that peak; per grand, the median and the range across the notes
import json, os, sys
import numpy as np
from scipy.io import wavfile
d = sys.argv[1]; names = sys.argv[2].split(',')
meta = json.load(open(os.path.join(d, 'notes.json'))); win, start, notes = meta['window'], meta['start'], meta['notes']
res = {}
for name in names:
    rate, x = wavfile.read(os.path.join(d, name + '.wav')); x = x.astype(np.float64)
    n = int(round(win * rate)); hop = int(0.02 * rate)
    t40, t20 = [], []
    for i, nt in enumerate(notes):
        seg = x[i * n:(i + 1) * n]; s = int(start * rate); seg = seg[s:]
        e = np.array([np.sqrt(np.mean(seg[j:j + hop] ** 2)) for j in range(0, len(seg) - hop, hop)])
        db = 20 * np.log10(e + 1e-12); pk = db.max()
        def fall(th):
            idx = np.where(db >= pk - th)[0]; last = idx.max()
            return (last + 1) * 0.02 if last < len(db) - 1 else float('inf')
        t40.append(fall(40)); t20.append(fall(20))
    res[name] = (np.array(t40), np.array(t20))
by = sys.argv[3] if len(sys.argv) > 3 else None
for name in names:
    a, b = res[name]
    fin = lambda v: ('>%.1f' % (win - start)) if np.isinf(v) else '%.2f' % v
    line = f'{name:14s} -40 dB: median {fin(np.median(a))} s  [{fin(a.min())}..{fin(a.max())}]   -20 dB: median {fin(np.median(b))} s'
    if by:
        groups = {}
        for nt, v in zip(notes, a): groups.setdefault(nt[by], []).append(v)
        line += '   by ' + by + ': ' + ' '.join(f'{k}:{fin(np.median(v))}' for k, v in sorted(groups.items()))
    print(line)
