# keys-balance (10-29): the keys against the scene, read off tools/keys-balance-render.ts's stems.
#
#   python tools/keys-balance.py table <dir> <name>...        per section and per track, the candidate measures
#   python tools/keys-balance.py norm <in.wav> <out.wav> [lufs] to -16 LUFS (or the given), 16-bit
#   python tools/keys-balance.py cut <in.wav> <out.wav> <from_s> <to_s>
#   python tools/keys-balance.py windows <dir> <name>...      a window's keys over the rest, the top, the pad and the hats
#   python tools/keys-balance.py fit <dir> <plan.json>         the plan's reading against the rendered windows
#                                                              (tools/keys-balance-calibrate.ts): each voice's loudness
#
# Every measure is read at the keys' strikes (a strike is the keys' notes on one sixteenth): the 400 ms from it, the
# keys alone against the other stems alone over the same 400 ms, the median over a section's strikes.
#   kr    the keys over the rest, loudness (LUFS, K-weighted)
#   kr_p  the keys over the rest in the piano's presence band (1-5 kHz, power)
#   kh    the keys over the hats (the hats and the shaker), loudness over the strike
#   hr    the hats under the rest, loudness over the section's bars (not the strikes: the hats' own level)
#   kh_s  the keys' strikes over the hats' section loudness
import sys, json
import numpy as np, soundfile as sf, pyloudnorm as pyln

SR = 48000

def lufs(x, sr=SR, block=.4):
    try:
        v = pyln.Meter(sr, block_size=min(block, len(x) / sr)).integrated_loudness(x)
        return v if np.isfinite(v) else -120.0
    except Exception:
        return -120.0

def bandpow(x, lo, hi, sr=SR):
    m = x.mean(axis=1) if x.ndim > 1 else x
    S = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2; f = np.fft.rfftfreq(len(m), 1 / sr)
    return 10 * np.log10(S[(f >= lo) & (f < hi)].sum() + 1e-20)

def load(D, name):
    j = json.load(open(f'{D}/{name}.json'))
    st = {}
    for s in ['keys', 'rest', 'hats', 'mix']:
        try: st[s], _ = sf.read(f'{D}/{name}-{s}.wav')
        except Exception: pass
    return j, st

def strikes(j):
    g = {}
    for e in j['keys']: g.setdefault((e['bar'], e['step']), []).append(e)
    return sorted(g.values(), key=lambda x: x[0]['t'])

def section_rows(D, name):
    j, st = load(D, name)
    bs = j['barSeconds']; off = j['fromBar'] * bs
    K, R, H = st['keys'], st['rest'], st.get('hats')
    n = int(.4 * SR)
    rows = []
    for s in j['sections']:
        a0, a1 = s['startBar'], s['startBar'] + s['bars']
        if a1 <= j['fromBar'] or a0 >= j['toBar']: continue
        i0, i1 = int((a0 * bs - off) * SR), int((a1 * bs - off) * SR)
        i0 = max(0, i0); i1 = min(len(R), i1)
        rl = lufs(R[i0:i1]); hl = lufs(H[i0:i1]) if H is not None else -120.0
        hits = [e for e in j['hats'] if a0 <= e['bar'] < a1]
        kinds = sorted({e['voice'] for e in hits})
        vals = {'kr': [], 'kr_p': [], 'kh': [], 'kh_s': [], 'on': [], 'lo': [], 'mid': [], 'hi': []}
        for g in strikes(j):
            b = g[0]['bar']
            if not (a0 <= b < a1): continue
            a = int((g[0]['t'] - off) * SR)
            if a < 0 or a + n > len(K): continue
            kk, rr = lufs(K[a:a + n]), lufs(R[a:a + n])
            if kk < -100: continue
            vals['kr'].append(kk - rr)
            vals['kr_p'].append(bandpow(K[a:a + n], 1000, 5000) - bandpow(R[a:a + n], 1000, 5000))
            # the onset: the keys' first 60 ms against the rest's loudest 60 ms over the beat around it
            m = int(.06 * SR); beat = int(bs / 4 * SR)
            ko = 10 * np.log10((K[a:a + m] ** 2).mean() + 1e-20)
            seg = R[max(0, a - beat // 2):a + beat // 2]
            if len(seg) > m:
                e = np.array([(seg[i:i + m] ** 2).mean() for i in range(0, len(seg) - m, m // 2)])
                vals['on'].append(ko - 10 * np.log10(e.max() + 1e-20))
            vals['lo'].append(bandpow(K[a:a + n], 150, 600) - bandpow(R[a:a + n], 150, 600))
            vals['mid'].append(bandpow(K[a:a + n], 600, 1500) - bandpow(R[a:a + n], 600, 1500))
            vals['hi'].append(bandpow(K[a:a + n], 5000, 12000) - bandpow(R[a:a + n], 5000, 12000))
            if H is not None:
                hh = lufs(H[a:a + n])
                vals['kh'].append(kk - hh)
                vals['kh_s'].append(kk - hl)
        med = lambda xs: round(float(np.median(xs)), 1) if xs else None
        rows.append({'kind': s['kind'], 'bars': f"{a0}-{a1 - 1}", 'strikes': len(vals['kr']),
                     'hats': '/'.join(kinds) or 'none', 'hats_per_bar': round(len(hits) / max(1, s['bars']), 1),
                     'rest': round(rl, 1), 'hr': round(hl - rl, 1) if hl > -100 else None,
                     **{k: med(v) for k, v in vals.items()}})
    return rows

def table(D, names):
    out = {}
    for nm in names:
        rows = section_rows(D, nm)
        out[nm] = rows
        print(f'\n{nm}')
        print('  section       strikes  hats (per bar)            rest   hr     kr    kr_p   kh    kh_s   on    lo    mid   hi')
        for r in rows:
            f = lambda v: '  -  ' if v is None else f'{v:+5.1f}'
            print(f"  {r['kind']:9s} {r['bars']:>7s} {r['strikes']:4d}  {r['hats'][:22]:22s}({r['hats_per_bar']:4.1f}) {r['rest']:6.1f} {f(r['hr'])} {f(r['kr'])} {f(r['kr_p'])} {f(r['kh'])} {f(r['kh_s'])} {f(r['on'])} {f(r['lo'])} {f(r['mid'])} {f(r['hi'])}")
    return out

def norm(i, o, target=-16.0):
    x, sr = sf.read(i)
    g = 10 ** ((target - lufs(x, sr)) / 20); y = x * g
    pk = np.abs(y).max()
    sf.write(o, np.clip(y, -1, 1), sr, subtype='PCM_16')
    return {'gainDb': round(20 * np.log10(g), 1), 'peakDb': round(20 * np.log10(pk + 1e-20), 1)}

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'table':
        res = table(sys.argv[2], sys.argv[3:])
        json.dump(res, open(f'{sys.argv[2]}/table.json', 'w'), indent=1)
    elif cmd == 'norm': print(json.dumps(norm(sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else -16.0)))
    elif cmd == 'cut':
        x, sr = sf.read(sys.argv[2]); a, b = float(sys.argv[4]), float(sys.argv[5])
        sf.write(sys.argv[3], x[int(a * sr):int(b * sr)], sr, subtype='FLOAT')

# ---- windows: the keys over each stem at the strikes, and each stem's own level over the window ----
STEMS = ['rest', 'top', 'pad', 'hats']

def window_row(D, name):
    j = json.load(open(f'{D}/{name}.json'))
    st = {}
    for s in ['keys'] + STEMS:
        try: st[s], _ = sf.read(f'{D}/{name}-{s}.wav')
        except Exception: pass
    K = st['keys']; off = j['fromBar'] * j['barSeconds']; n = int(.4 * SR)
    acc = {f'k_{s}': [] for s in STEMS if s in st}
    acc.update({f'kp_{s}': [] for s in STEMS if s in st})
    for g in strikes(j):
        a = int((g[0]['t'] - off) * SR)
        if a < 0 or a + n > len(K): continue
        kk = lufs(K[a:a + n])
        if kk < -100: continue
        for s in STEMS:
            if s not in st: continue
            acc[f'k_{s}'].append(kk - lufs(st[s][a:a + n]))
            acc[f'kp_{s}'].append(bandpow(K[a:a + n], 1000, 5000) - bandpow(st[s][a:a + n], 1000, 5000))
    row = {'name': name, 'strikes': len(acc.get('k_rest', [])), 'keys': round(lufs(K), 1)}
    for s in STEMS:
        if s in st: row[s] = round(lufs(st[s]), 1)
    for k, v in acc.items(): row[k] = round(float(np.median(v)), 1) if v else None
    return row

if __name__ == '__main__' and sys.argv[1] == 'windows':
    rows = [window_row(sys.argv[2], nm) for nm in sys.argv[3:]]
    cols = ['strikes', 'keys'] + STEMS + [f'k_{s}' for s in STEMS] + [f'kp_{s}' for s in STEMS]
    print('name'.ljust(20) + ''.join(c.rjust(9) for c in cols))
    for r in rows: print(r['name'].ljust(20) + ''.join((('%9.1f' % r[c]) if isinstance(r.get(c), (int, float)) else '        -') for c in cols))

# ---- the calibration: the plan's keys and hats against the rendered windows (tools/keys-balance-calibrate.ts) ----
def fit(D, planfile):
    from scipy.optimize import least_squares
    plan = json.load(open(planfile)); n = int(.4 * SR)
    W = []
    for w in plan:
        try: K, _ = sf.read(f'{D}/{w["name"]}-keys.wav')
        except Exception: continue
        try: H, _ = sf.read(f'{D}/{w["name"]}-hats.wav'); hw = lufs(H, block=.4)
        except Exception: hw = -90.0
        ks, kp = [], []
        for r in w['rows']:
            a = int(r['t'] * SR)
            if a + n > len(K): continue
            kk = lufs(K[a:a + n])
            if kk < -80: continue
            ks.append(kk); kp.append(r['keys'])
        if not ks: continue
        W.append({'w': w['name'], 'ka': float(np.median(ks)), 'ha': max(hw, -90.0), 'kp': kp, 'hp': w['hatsWin']})
    kv = sorted({v for x in W for r in x['kp'] for v in r}); hv = sorted({v for x in W for v in x['hp']})
    def kdb(p, x): return float(np.median([10 * np.log10(sum(e * 10 ** (p[kv.index(v)] / 10) for v, e in r.items()) + 1e-12) for r in x['kp']]))
    def hdb(p, x): return 10 * np.log10(sum(e * 10 ** (p[hv.index(v)] / 10) for v, e in x['hp'].items()) + 1e-12) if x['hp'] else -90.0
    rk = least_squares(lambda p: [kdb(p, x) - x['ka'] for x in W], np.zeros(len(kv)))
    Hh = [x for x in W if x['hp'] and x['ha'] > -80]
    rh = least_squares(lambda p: [hdb(p, x) - x['ha'] for x in Hh] + list(0.1 * p), np.zeros(len(hv)))
    print('keys', dict(zip(kv, np.round(rk.x, 1)))); print('hats', dict(zip(hv, np.round(rh.x, 1))))
    ek = np.array([kdb(rk.x, x) - x['ka'] for x in W]); eh = np.array([hdb(rh.x, x) - x['ha'] for x in Hh])
    print('keys resid sd %.2f, hats resid sd %.2f' % (ek.std(), eh.std()))
    xs, ys = [], []
    for x in W:
        a = x['ka'] - x['ha']; p = kdb(rk.x, x) - hdb(rh.x, x)
        xs.append(a); ys.append(p); print(f"{x['w']:26s} audio {a:6.1f} plan {p:6.1f}   hats audio {x['ha']:6.1f} plan {hdb(rh.x, x):6.1f}")
    xs, ys = np.array(xs), np.array(ys); m = (xs < 40)
    print('corr %.3f resid sd %.2f' % (np.corrcoef(xs[m], ys[m])[0, 1], (ys[m] - xs[m]).std()))
    json.dump({'keys': dict(zip(kv, map(float, np.round(rk.x, 1)))), 'hats': dict(zip(hv, map(float, np.round(rh.x, 1))))}, open(f'{D}/offsets2.json', 'w'))

if __name__ == '__main__' and sys.argv[1] == 'fit': fit(sys.argv[2], sys.argv[3])
