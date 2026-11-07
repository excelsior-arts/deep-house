# top-voices (11-02), scratch: the sketches' render jobs. Each option is a figure of notes laid over a featured window
# (`add`), rendered three ways: the window as it plays (`<idea>-before`, shared by the window), the window with the option
# (`<option>-after`) and the option alone in the window's rooms (`<option>-solo`); plus the window's offbeat hat alone
# (`<window>-hat`), the stem the levels are read against.
#   python3 tools/top-voices-jobs.py <out.json> [gains.json]
import json, sys
out = sys.argv[1]
gains = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
LINKS = {
  'pure-gold': 'seed=40&v=2',
  'warm-front': 'seed=47004&v=2&theme=11&spell=em:0.36,ti:0.34,ze:0.63,ro:0.66,gl:0.05,ve:0.54,sp:0.19,lo:0.80',
  'saturn-rings': 'seed=33617&v=2&spell=em:0.37,ti:0.37,ze:0.14,ro:0.00,gl:0.00,ve:0.11,sp:0.00,lo:1.00',
}
WINDOWS = {  # name: (track, fromBar, toBar)
  'pg-main': ('pure-gold', 12, 28), 'pg-return': ('pure-gold', 36, 52),
  'wf-main': ('warm-front', 20, 36), 'sr-main': ('saturn-rings', 12, 28), 'sr-break': ('saturn-rings', 36, 52),
}
LAYER = {'hatClosed': ('hats', 'drums'), 'chk': ('clap', 'drums'), 'snap': ('clap', 'drums'), 'rimshot': ('clap', 'drums'),
  'splash': ('fx', 'drums'), 'splashLong': ('fx', 'drums'), 'shakeThrow': ('shaker', 'drums'), 'puff': ('shaker', 'drums'),
  'crashFar': ('fx', 'drums'), 'washSoft': ('fx', 'drums'), 'clave': ('shaker', 'drums'), 'woodblock': ('shaker', 'drums'),
  'jingleLight': ('shaker', 'drums'), 'tickTuned': ('hats', 'drums'), 'glint': ('hats', 'drums'), 'tickLone': ('hats', 'drums'),
  'ringHigh': ('hats', 'drums')}

def every(bars, steps, voice, db=0.0, **p):
    """a note on each listed step of each listed bar of the 4-bar figure"""
    return [dict(fb=b, step=s, voice=voice, db=db, p=p) for b in bars for s in steps]

ALL = [0, 1, 2, 3]
# idea -> (window, intro words, options); an option: (id, label, figure (4-bar, repeated), extra (once, window-relative bars))
IDEAS = {
 'T14': ('sr-main', [
   ('t14a-tick', 'the tick', every(ALL, [4, 12], 'hatClosed', vel=0.85, pan=0), []),
   ('t14b-chk-grace', 'the chk, ta-TAK', every(ALL, [4, 12], 'chk', vel=0.9) + every([0, 2], [11], 'chk', db=-6, vel=0.7) + every([1, 3], [3, 11], 'chk', db=-6, vel=0.7), []),
   ('t14c-chk', 'the chk, plain', every(ALL, [4, 12], 'chk', vel=0.9), []),
 ]),
 'T16': ('sr-break', [
   ('t16a-rim-room', 'rim, its answer in the long room', every(ALL, [4], 'rimshot', vel=0.9, pan=0, room=0), [dict(fb=b, step=14, voice='rimshot', db=gains.get('t16-answer', -4), p=dict(vel=0.9, pan=0, dry=0, room=0, reverb=1.0)) for b in range(8, 16)]),
   ('t16b-snap-room', 'snap, its answer in the long room', every(ALL, [4], 'snap', vel=0.9, pan=0, room=0), [dict(fb=b, step=14, voice='snap', db=gains.get('t16-answer', -4), p=dict(vel=0.9, pan=0, dry=0, room=0, reverb=1.0)) for b in range(8, 16)]),
   ('t16c-snap-delay', 'snap, its answer in the delay', every(ALL, [4], 'snap', vel=0.9, pan=0, room=0), [dict(fb=b, step=14, voice='snap', db=gains.get('t16-delay', -2), p=dict(vel=0.9, pan=0, dry=0, room=0, delay=1.0, reverb=0.3)) for b in range(8, 16)]),
 ]),
 'T17': ('pg-main', [
   ('t17a-splash', 'the splash, short', every([1, 3], [0], 'splash', vel=0.9), []),
   ('t17b-splash-long', 'the splash, long', every([1, 3], [0], 'splashLong', vel=0.9), []),
   ('t17c-throw', 'a shaker thrown once', every([1, 3], [0], 'shakeThrow', vel=0.9), []),
 ]),
 'T18': ('wf-main', [
   ('t18a-tick', 'the tuned tick, left and centre', [dict(fb=b, step=s, voice='tickTuned', db=d, p=dict(vel=0.9, midi=119, strikePan=pn)) for b in ALL for (s, pn, d) in ([(7, -0.5, 0), (13, 0, -3)] if b % 2 == 0 else [(7, -0.5, 0), (11, 0, -3), (15, -0.5, -2)])], []),
   ('t18b-glint', 'the glint, every second bar', [dict(fb=b, step=s, voice='glint', db=d, p=dict(vel=0.9, midi=117, strikePan=0.2)) for b in [1, 3] for (s, d) in [(0, 0), (1, -4), (2, -8)]], []),
   ('t18c-lone', 'the lone tick, late in the bar', [dict(fb=b, step=13, voice='tickLone', db=0, p=dict(vel=0.9, midi=m, strikePan=0.6)) for b, m in zip(ALL, [112, 110, 107, 110])], []),
 ]),
 'T19': ('pg-main', [
   (f't19{k}-{v.lower()}', n, [dict(fb=b, step=s, voice=v, db=d, p=dict(vel=0.85, pan=pn, room=0.1)) for b in ALL for (s, pn, d) in ([(3, -0.4, 0), (7, -0.4, -3), (11, 0.4, 0), (13, 0.4, -3)] if b % 2 == 0 else [(3, -0.4, 0), (9, 0.4, -2), (13, 0.4, 0)])], [])
   for k, v, n in [('a', 'rimshot', 'rim, call left, answer right'), ('b', 'woodblock', 'woodblock, call left, answer right'), ('c', 'clave', 'clave, call left, answer right')]
 ]),
 'T20': ('pg-main', [
   ('t20a-puff-one', 'one puff a bar', every(ALL, [12], 'puff', vel=0.9), []),
   ('t20b-puff-two', 'two a bar, the second softer', every(ALL, [4], 'puff', vel=0.9) + every(ALL, [12], 'puff', db=-3, vel=0.9), []),
   ('t20c-puff-three', 'three a bar, uneven', [dict(fb=b, step=s, voice='puff', db=d, p=dict(vel=0.9)) for b in ALL for (s, d) in zip([4, 8, 12], [[0, -3, -1], [-2, 0, -3], [-1, -3, 0], [-3, -1, -2]][b])], []),
 ]),
 'T28': ('pg-return', [
   ('t28a-crash-far', 'the crash, darker and far', [], [dict(fb=8, step=0, voice='crashFar', db=0, p=dict(vel=0.9, pan=0, reverb=0.6))]),
   ('t28b-wash', 'the splash\'s wash', [], [dict(fb=8, step=0, voice='washSoft', db=0, p=dict(vel=0.9, pan=0, reverb=0.4))]),
   ('t28c-wash-ring', 'the wash and a far ring', [], [dict(fb=8, step=0, voice='washSoft', db=0, p=dict(vel=0.9, pan=0, reverb=0.4)), dict(fb=8, step=0, voice='ringHigh', db=gains.get('t28-ring', -10), p=dict(vel=0.9, midi=117, strikePan=0.15))]),
 ]),
 'T38': ('wf-main', [
   ('t38a-jingle-eighths', 'on the eighths', every(ALL, [0, 4, 8, 12], 'jingleLight', db=-4, vel=0.8) + every(ALL, [2, 6, 10, 14], 'jingleLight', vel=0.9), []),
   ('t38b-jingle-offbeats', 'on the offbeats only', every(ALL, [2, 6, 10, 14], 'jingleLight', vel=0.9), []),
   ('t38c-jingle-odd-bars', 'the eighths, odd bars only', every([0, 2], [0, 4, 8, 12], 'jingleLight', db=-4, vel=0.8) + every([0, 2], [2, 6, 10, 14], 'jingleLight', vel=0.9), []),
 ]),
}

def notes(opt, frm, solo):
    oid, _, fig, once = opt
    base = gains.get(oid, -20.0)
    out = []
    for k in range(4):
        for n in fig:
            out.append(n | dict(fb=n['fb'] + 4 * k))
    if solo and not fig:  # a one-off: the solo plays it every four bars
        out = [n | dict(fb=n['fb'] % 4 + 4 * k) for k in range(4) for n in once]
    else:
        out += once
    res = []
    for n in out:
        layer, bus = LAYER[n['voice']]
        res.append(dict(voice=n['voice'], layer=layer, bus=bus, bar=frm + n['fb'], step=n['step'], p=n['p'] | dict(gain=round(10 ** ((base + n['db']) / 20), 6))))
    return res

jobs = []
for w, (track, a, b) in WINDOWS.items():
    jobs.append(dict(name=f'{w}-hat', link=LINKS[track], fromBar=a, toBar=b, only=['hatClosed']))
for idea, (w, opts) in IDEAS.items():
    track, a, b = WINDOWS[w]
    jobs.append(dict(name=f'{w}-before', link=LINKS[track], fromBar=a, toBar=b))
    for o in opts:
        jobs.append(dict(name=f'{o[0]}-solo', link=LINKS[track], fromBar=a, toBar=b, solo=True, add=notes(o, a, True)))
        jobs.append(dict(name=f'{o[0]}-after', link=LINKS[track], fromBar=a, toBar=b, add=notes(o, a, False)))
seen = set(); jobs = [j for j in jobs if not (j['name'] in seen or seen.add(j['name']))]
json.dump(jobs, open(out, 'w'), indent=1)
json.dump({i: dict(window=w, track=WINDOWS[w][0], fromBar=WINDOWS[w][1], toBar=WINDOWS[w][2], options=[dict(id=o[0], label=o[1]) for o in opts]) for i, (w, opts) in IDEAS.items()}, open(out.replace('.json', '-ideas.json'), 'w'), indent=1)
print(len(jobs), 'jobs')
