# top-voices (11-02), scratch: the listening page (tmp/agents/sites/top-voices/index.html) from the ideas and the reads.
#   python3 tools/top-voices-page.py <ideas.json> <site dir>
import sys, json, html
ideas = json.load(open(sys.argv[1])); site = sys.argv[2]
TRACK = {'pure-gold': ('Vibe - Pure Gold', 2.3077), 'warm-front': ('Vibe - Warm Front', 2.3645), 'saturn-rings': ('Vibe - Saturn Rings', 2.4)}
CARDS = {
 'T14': dict(title='A lighter backbeat', his='“hats too pronounced”; “percussions etc in high mid”',
   lines=['Where a clap would sit on two and four, something smaller keeps the lean.',
          'A soft tick, or a crisp little “chk” with a pickup before it: ta-TAK.'],
   where='bars 12-28, a main with no clap today',
   reads={'t14a-tick': ('doubt', 'The offbeat hat itself on 2 and 4, 8 dB under. It is more of the voice he calls too pronounced, and it fills the band the hat already owns.'),
          't14b-chk-grace': ('take', 'Its own colour at 4 kHz, 30 ms, 8 dB under the hat; the pickup (6 dB lower) is what makes it talk.'),
          't14c-chk': ('try', 'The same chk without the pickup: the plainer one, to hear what the pickup adds.')}),
 'T16': dict(title='One snap, one far echo', his='“sparse arrangement”',
   lines=['In the break a single dry snap lands on beat two, dead centre.',
          'Eight bars in, a far, wide answer joins on the and of four, about 15 dB down.'],
   where='bars 36-52, the breakdown; the answer from bar 44',
   reads={'t16a-rim-room': ('doubt', 'Our rimshot is a low knock (its energy centres near 0.85 kHz), not a snap: the answer reads as a woody thud in the hall.'),
          't16b-snap-room': ('take', 'A 2.5 kHz snap, 5 dB under the main\'s hat; its answer only in the long room, 14.5 LU under the snap.'),
          't16c-snap-delay': ('try', 'The answer through the theme\'s dotted-eighth delay instead (9 LU under): nearer and busier than “far”.')}),
 'T17': dict(title='A splash every second bar', his='“noises … in high freq domain”',
   lines=['A short spray of bright noise on the head of every second bar, nowhere else.',
          'Under a steady hat you start counting in twos.'],
   where='bars 12-28, the first main',
   reads={'t17a-splash': ('take', 'About 300 ms, 6-11 kHz, its pitch a little different each hit; 7 dB under the hat\'s peak.'),
          't17b-splash-long': ('try', 'About 600 ms: more air between the hits, but it starts to be a cymbal and could tire over 16 bars.'),
          't17c-throw': ('try', 'A shaker thrown once (two bursts 60 ms apart) in the same band: softer-edged, more human.')}),
 'T18': dict(title='A tuned metal tick', his='“percussions etc in high mid, and high freq domain”',
   lines=['A tiny struck tine with a real pitch, a few times a bar, some left and some centre.',
          'It fills with a note, not with noise.'],
   where='bars 20-36, the main from its 16-bar line',
   reads={'t18a-tick': ('try', 'Two sines at a high B of the key (7.9 and 9.4 kHz), a 1 ms click, 200 ms fall; left and centre by step. 7 dB under the hat in its band.'),
          't18b-glint': ('try', 'A triangle\'s glint: three falling strokes every second bar at a high A (7, 11, 15 kHz). The most “ornament” of the three.'),
          't18c-lone': ('take', 'One quiet ping a bar on a late sixteenth, to the right, its pitch walking the key (4-5.3 kHz). Its home is a beatless intro; here it is heard over a main.')}),
 'T19': dict(title='Percussion that talks left and right', his='“percussions etc in high mid”',
   lines=['A small figure whose calls sit left and whose answers sit right.',
          'Kick, hat and bass stay in the middle; the talk happens in space.'],
   where='bars 12-28, the first main (it already has a bongo and a cabasa)',
   reads={'t19a-rimshot': ('doubt', 'The rimshot\'s low knock again; 6 dB under the hat it reads as a second hand drum, which he has said doesn\'t fit house grooves.'),
          't19b-woodblock': ('doubt', 'A woodblock at 1.4 kHz: under the band this idea is for, and the same hand-percussion verdict.'),
          't19c-clave': ('try', 'A clave at 2.8 and 4.35 kHz, ±0.4 left and right, 6 dB under the hat: the one that talks in the high mids.')}),
 'T20': dict(title='A soft puff between the hats', his='“fill in a bit better our lacking high freq domain”',
   lines=['A longer, softer “shh” than the hats, like one slow shake, in the gaps between them.',
          'A loose breath in a tight groove.'],
   where='bars 12-28, the first main',
   reads={'t20a-puff-one': ('take', 'One a bar, on four, 9 dB under the hat: a breath where a clap would be.'),
          't20b-puff-two': ('try', 'On two and four, the second 3 dB softer: a soft backbeat made of air.'),
          't20c-puff-three': ('doubt', 'Three a bar, uneven (±3 dB): the floor fills most, and most likely smears the groove.')}),
 'T28': dict(title='A soft, far wash when the kick returns', his='a noise gesture belongs on a seam that changes (10-16)',
   lines=['On the downbeat where the kick comes back, a soft wash blooms and fades over a bar or two.',
          'Like a crash played far away; half the time it would be there.'],
   where='bars 36-52; the kick returns at bar 44 (t=101.5)',
   reads={'t28a-crash-far': ('try', 'The crash, darker (9.5 kHz lid), lighter in metal, a two-bar tail into the long room, 12 dB under the hat.'),
          't28b-wash': ('take', 'The splash\'s voice with a 3 s fall: brighter and softer than the crash, 11 dB under the hat.'),
          't28c-wash-ring': ('try', 'The wash with a far ring at a high A (three inharmonic sines near 7 kHz, about 10 dB under the wash).')}),
 'T38': dict(title='A quiet jingle for one section', his='his verdict on the tambourine (09-19): “metal jingles”',
   lines=['At a 16-bar line a thin, bright jingle joins the hat in the middle, quietly.',
          'The track switches on a light rather than getting louder.'],
   pair='This is a pair against his refusal of the tambourine. It is not the tambourine lane: no skin, a 6.5 kHz high-pass, 9 dB under the hat, by section.',
   where='bars 20-36, entering on the 16-bar line',
   reads={'t38a-jingle-eighths': ('doubt', 'On every eighth: the closest to the lane he refused.'),
          't38b-jingle-offbeats': ('doubt', 'On the offbeats only: it doubles the hat in the hat\'s own band, the wrong way for “too pronounced”.'),
          't38c-jingle-odd-bars': ('try', 'The eighths on odd bars only: a light that comes and goes, the one I would keep for the pair.')}),
}
KIND = {'take': 'Take', 'try': 'Try', 'doubt': 'Doubt'}
def player(src, label):
    return f'<div class="pl"><span>{label}</span><audio controls preload="none" src="{src}"></audio></div>'
cards = []
for idea, d in ideas.items():
    c = CARDS[idea]; name, bs = TRACK[d['track']]; t = round(d['fromBar'] * bs)
    opts = []
    for o in d['options']:
        k, why = c['reads'][o['id']]
        base = f"audio/{idea.lower()}/{o['id']}"
        opts.append(f'''<div class="opt"><h3>{html.escape(o['label'])} <em class="{k}">{KIND[k]}</em></h3>
{player(base + '-solo.wav', 'alone')}{player(f'audio/{idea.lower()}/before.wav', 'in the track, before')}{player(base + '-after.wav', 'in the track, with it')}
<p class="read">{html.escape(why)}</p></div>''')
    pair = f'<p class="pair">{html.escape(c["pair"])}</p>' if 'pair' in c else ''
    cards.append(f'''<section class="card"><h2><span class="id">{idea}</span> {html.escape(c['title'])}</h2>
<p class="his">His word: {html.escape(c['his'])}</p>
<p class="lines">{html.escape(c['lines'][0])}<br>{html.escape(c['lines'][1])}</p>{pair}
<p class="where">{html.escape(name)}, {html.escape(c['where'])}; from t={t}</p>
<div class="opts">{''.join(opts)}</div></section>''')
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quiet top voices</title>
<style>
:root{{--bg:#f6f5f2;--card:#fff;--ink:#1d1c1a;--mute:#6b6862;--line:#e3e0da;--take:#1f7a4a;--try:#8a6a12;--doubt:#a03a2c}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#151514;--card:#1f1e1c;--ink:#ecebe7;--mute:#a19d95;--line:#33312d;--take:#5fc48d;--try:#d9b44a;--doubt:#e07a6a}}}}
:root[data-theme="dark"]{{--bg:#151514;--card:#1f1e1c;--ink:#ecebe7;--mute:#a19d95;--line:#33312d;--take:#5fc48d;--try:#d9b44a;--doubt:#e07a6a}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:20px 16px 60px}} h1{{font-size:22px;margin:0 0 6px}} .intro{{color:var(--mute);margin:0 0 18px;max-width:760px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 18px}}
.card h2{{font-size:18px;margin:0 0 6px}} .id{{color:var(--mute);font-weight:500;margin-right:4px}}
.his{{margin:0 0 6px;font-style:italic;color:var(--mute)}} .lines{{margin:0 0 6px}} .where{{margin:0 0 12px;color:var(--mute);font-size:13px}}
.pair{{margin:0 0 6px;padding:6px 10px;border-left:3px solid var(--try);font-size:14px}}
.opts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}}
.opt{{border:1px solid var(--line);border-radius:8px;padding:10px}} .opt h3{{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px}}
.opt h3 em{{font-style:normal;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}}
em.take{{color:var(--take)}} em.try{{color:var(--try)}} em.doubt{{color:var(--doubt)}}
.pl{{margin:0 0 6px}} .pl span{{display:block;font-size:12px;color:var(--mute)}} audio{{width:100%;height:36px}}
.read{{margin:6px 0 0;font-size:14px}}
</style></head><body><main>
<h1>Quiet top voices: sketches</h1>
<p class="intro">Eight ideas for the top, two or three options each. “Alone” is the voice by itself in the track's rooms, raised to be heard. “Before” and “with it” are the same 16 bars, matched in loudness; there the voice sits where it would play, 5-12 dB under the hat's peak. The reads are mine, from the sound's make and its numbers.</p>
{''.join(cards)}
</main>
<script>document.addEventListener('play',e=>{{for(const a of document.querySelectorAll('audio'))if(a!==e.target)a.pause()}},true)</script>
</body></html>'''
open(f'{site}/index.html', 'w').write(page); print('ok', len(page))
