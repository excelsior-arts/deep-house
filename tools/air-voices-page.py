# air-voices (11-02), scratch: the listening page from facts.json (tools/air-voices-post.py) and the reads below.
#
#   python tools/air-voices-page.py <site dir>
import html
import importlib.util
import json
import os
import sys

here = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('spec', os.path.join(here, 'air-voices-spec.py'))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

# my read per option: take, try or doubt, and why, in a line
READS = {
    'T26a': ('take', 'Fills the silence between the hats without making the top louder; leaves on the line.'),
    'T26b': ('try', 'The floor of "too much": still closes half the gap, harder to point at.'),
    'T26c': ('try', 'Moves instead of sitting still; the closest of the three to the wind you refused.'),
    'T27a': ('take', 'Rises only in the very top, stops dead on the drop. Aurora\'s build has no rise of its own.'),
    'T27b': ('try', 'Shorter and softer: felt more than heard.'),
    'T27c': ('doubt', 'Pure Gold\'s break has nothing up top, so the hiss is heard alone over keys; I\'d drop it.'),
    'T29a': ('try', 'Marks the 16-bar line; nothing stops.'),
    'T29b': ('doubt', 'Longer and wider: starts to read as a whoosh.'),
    'T29c': ('try', 'My pick of the three: marks the line without announcing it.'),
    'T30a': ('try', 'Fills the beatless bars where the drums were; reads as air, not wind.'),
    'T30b': ('doubt', 'One broad swell is the most present of the three, and the most like wind.'),
    'T30c': ('try', 'The floor of "too much": you notice it when it stops.'),
    'T35a': ('try', 'Glass in the empty top while the drums rest; behind the pad, three bars in eight.'),
    'T35b': ('try', 'A phrase, not pings: call and answer on the chord. Sits lower, around 2-5 kHz.'),
    'T35c': ('take', 'The same pings softer: they colour the break without becoming a part.'),
    'T33a': ('try', 'Strings with their own edge; a touch less 2-5 kHz, since the old lid\'s bump moved up.'),
    'T33b': ('take', 'The edge plus a bow\'s breath at each phrase: the most string-like.'),
    'T33c': ('try', 'Half open, a softer breath: the safe one.'),
    'T33d': ('try', 'The wave pad\'s own top opened: more shimmer, the same chord.'),
    'T33e': ('doubt', 'A breath on a pad has no bow behind it; strong in an empty break.'),
}

# the held voice alone, its lid opened against as it was (dB at 5-9 and 9-16 kHz; measured on the stems, the breaths
# left out): Warm Front's strings, Heat Haze's wave pad
STEM = {'T33a': (7, 12), 'T33b': (7, 12), 'T33c': (9, 5), 'T33d': (10, 21), 'T33e': (10, 21)}

REF = {'hats': 'under the hats\' peaks', 'pad': 'under the pad', 'strings': 'under the held voice'}


def level_line(f):
    lv, a = f.get('level'), f['addedAbove']
    parts = []
    if f.get('settings'):
        hz = next(iter(next(iter(f['settings'].values())).values()))
        parts.append(f"the lid opened to {hz / 1000:g} kHz (from 2.2-2.4)")
    if lv:
        parts.append(f"{'the breath ' if f['idea'] == 'T33' else ''}{-lv['target']} dB {REF[lv['ref']]}")
    if f['idea'] in ('T26', 'T29'):
        parts.append(f"the quiet between the hits {a['floor 5-12 kHz']:+.0f} dB")
    elif f['idea'] in ('T27', 'T30'):
        parts.append(f"9-16 kHz {a['9-16 kHz']:+.0f} dB over its bars")
    elif f['idea'] == 'T35':
        parts.append(f"5-9 kHz {a['5-9 kHz']:+.0f} dB over the break")
    elif f['idea'] == 'T33':
        k = f"{f['idea']}{f['option']}"
        parts.append(f"the voice itself {STEM[k][0]:+d} dB at 5-9 kHz, {STEM[k][1]:+d} at 9-16")
    return '; '.join(parts)


def main(site):
    facts = json.load(open(os.path.join(site, 'facts.json')))
    cards = []
    for idea in S.IDEAS:
        rows = []
        for o in idea['options']:
            k = f"{idea['id']}{o['key']}"
            f = facts[k]
            read, why = READS[k]
            at = f"{f['track']}, from {f['at']} (bar {f['fromBar']})"
            players = ''.join(
                f'<div class="pl"><span>{lab}</span><audio controls preload="none" src="{html.escape(src)}"></audio></div>'
                for lab, src in (('solo', f['solo']), ('before', f['before']), ('after', f['after'])))
            rows.append(f'''<div class="opt">
  <div class="head"><b>{html.escape(o['name'].capitalize())}</b><span class="read {read}">{read}</span></div>
  <div class="meta">{html.escape(at)}: {html.escape(o['what'])}.</div>
  <div class="meta">{html.escape(level_line(f))}.</div>
  <div class="why">{html.escape(why)}</div>
  {players}
</div>''')
        cards.append(f'''<section class="card">
<h2><span class="id">{idea['id']}</span> {html.escape(idea['title'])}</h2>
<p>{html.escape(idea['lines'][0])}<br>{html.escape(idea['lines'][1])}</p>
<div class="opts">{''.join(rows)}</div>
</section>''')
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Air sketches</title>
<style>
:root {{ --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --mute:#6b6b70; --line:#e2e0da; --take:#1f7a4d; --try:#8a6d00; --doubt:#a33a3a; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141416; --card:#1d1d20; --ink:#ececee; --mute:#9a9aa2; --line:#2e2e33; --take:#5fcf95; --try:#e0c25a; --doubt:#f08a8a; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
main {{ max-width:1100px; margin:0 auto; padding:20px 16px 48px; }}
h1 {{ font-size:22px; margin:0 0 6px; }}
.lead {{ color:var(--mute); margin:0 0 18px; }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:0 0 16px; }}
h2 {{ font-size:18px; margin:0 0 6px; }}
.id {{ color:var(--mute); font-weight:500; margin-right:4px; }}
.card > p {{ margin:0 0 12px; }}
.opts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }}
.opt {{ border-top:1px solid var(--line); padding-top:10px; min-width:0; }}
.head {{ display:flex; justify-content:space-between; gap:8px; align-items:baseline; }}
.read {{ font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }}
.read.take {{ color:var(--take); }} .read.try {{ color:var(--try); }} .read.doubt {{ color:var(--doubt); }}
.meta {{ color:var(--mute); font-size:13px; }}
.why {{ margin:4px 0 8px; }}
.pl {{ display:flex; align-items:center; gap:8px; margin:4px 0; }}
.pl span {{ width:48px; flex:none; color:var(--mute); font-size:13px; }}
.pl audio {{ width:100%; min-width:0; height:34px; }}
</style></head><body><main>
<h1>Air, breath and glints up top</h1>
<p class="lead">Sketches, not rules: nothing here is in a track yet. Before and after are the same bars, matched in loudness; a solo is the sound alone, 16 bars, the options of an idea at their level against each other.</p>
{''.join(cards)}
</main>
<script>
document.addEventListener('play', (e) => {{ for (const a of document.querySelectorAll('audio')) if (a !== e.target) a.pause(); }}, true);
</script>
</body></html>
'''
    open(os.path.join(site, 'index.html'), 'w').write(page)
    print('wrote', os.path.join(site, 'index.html'))


if __name__ == '__main__':
    main(sys.argv[1])
