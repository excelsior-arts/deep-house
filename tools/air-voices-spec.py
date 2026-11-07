# air-voices (11-02), scratch: the sketches as data (ideas, options, the moments they live at), and the render jobs.
#
#   python tools/air-voices-spec.py jobs1 <out.json>             # stage 1: references and each option at unit gain
#   python tools/air-voices-spec.py jobs2 <gains.json> <out.json> # stage 2: the options at their measured gains
#
# A level target is dB against a reference stem: `hats` (the hats' peaks: the 99th percentile of 10 ms RMS over the
# track's main), `pad` or `strings` (the held voice's mean over the window); the option's own level is its held mean
# (`mean`) or its loudest 100 ms (`peak`).
import json
import sys

L = {
    'Vibe - Pure Gold': 'seed=40&v=2',
    'Vibe - Aurora': 'seed=68599&v=2&spell=ti:0.17,ze:0.32,gl:0.16,ve:1.00,sp:0.10,lo:0.34',
    'Vibe - Sunrise': 'seed=97369&v=2&spell=em:0.37,ti:0.17,ze:0.32,gl:0.16,ve:0.00,sp:0.10,lo:0.34',
    'Vibe - Warm Front': 'seed=47004&v=2&theme=11&spell=em:0.36,ti:0.34,ze:0.63,ro:0.66,gl:0.05,ve:0.54,sp:0.19,lo:0.80',
    'Vibe - Heat Haze': 'seed=47004&v=2&theme=16&spell=em:0.36,ti:0.48,ze:0.63,ro:0.66,gl:0.05,ve:0.39,sp:0.19,lo:0.80',
}
SHORT = {'Vibe - Pure Gold': 'pg', 'Vibe - Aurora': 'au', 'Vibe - Sunrise': 'su', 'Vibe - Warm Front': 'wf', 'Vibe - Heat Haze': 'hh'}
# where each track's hats are measured: a main, 8 bars
MAIN = {'Vibe - Pure Gold': [28, 36], 'Vibe - Aurora': [8, 16], 'Vibe - Sunrise': [12, 20], 'Vibe - Warm Front': [20, 28], 'Vibe - Heat Haze': [52, 60]}

FX = dict(layer='fx', bus='melodic', level='fx')
KEYS = dict(layer='keys', bus='keys', level='keys')


def air(voice, bar, bars, **p):
    return dict(voice=voice, bar=bar, durBars=bars, p=p, **FX)


def bed(bar, bars, **p):
    # a bed: up over two bars, gone by the line `bar + bars` (a half-bar fall)
    return air('airTop', bar, bars - 0.5, shape='bed', **p)


def ping(bar, step, midi, **p):
    # two operator pairs stacked on one note: 1.17 and 1.41
    return [dict(voice='glassPing', bar=bar + step / 16, p=dict(midi=midi, dur=0.15, tone=t, vel=0.8, reverb=0.55, delay=0.2, **p), **KEYS) for t in ('low', 'high')]


def pluck(bar, step, midi, beats, **p):
    return dict(voice='glassPluck', bar=bar + step / 16, p=dict(midi=midi, dur=beats * 0.6, vel=0.7, delay=0.15, reverb=0.45, **p), **KEYS)


def bars(n, w):
    return n * w  # placeholder for readability


# the bed's attack is two bars; the theme's bar in seconds is filled at render (`attackBars`)
IDEAS = [
    dict(id='T26', title='An air bed that comes and goes',
         lines=['A soft, wide hiss comes up under the hats on a phrase line and leaves when the section ends.',
                'The gaps between the hits stop being silent; the breathing one closes and opens every four bars.'],
         options=[
             dict(key='a', name='the bed, at the table\'s level', track='Vibe - Heat Haze', ctx=[66, 78], what='enters at bar 68, gone at 76 (the outro)',
                  events=[bed(68, 8, attackBars=2)], solo=[bed(1, 13, attackBars=2)], ref='hats', measure='mean', db=-25),
             dict(key='b', name='the bed, 6 dB quieter', track='Vibe - Heat Haze', ctx=[66, 78], what='the same, 6 dB under it',
                  events=[bed(68, 8, attackBars=2)], solo=[bed(1, 13, attackBars=2)], ref='hats', measure='mean', db=-31),
             dict(key='c', name='the breathing bed', track='Vibe - Aurora', ctx=[14, 26], what='enters at bar 16, breathes every 4 bars, gone at 24 (the breakdown)',
                  events=[bed(16, 8, attackBars=1, cycleBars=4, fallBars=3, lowHz=4000, dipDb=4)], solo=[bed(1, 13, attackBars=1, cycleBars=4, fallBars=3, lowHz=4000, dipDb=4)],
                  ref='hats', measure='mean', db=-25),
         ]),
    dict(id='T27', title='A riser that lives only in the air',
         lines=['Only the very top rises into the bar where the drums come back, and stops dead on the downbeat.',
                'You feel it more than hear it; the held one is a flat hiss over a break\'s last bars, cut by the drop.'],
         options=[
             dict(key='a', name='four bars on a power curve', track='Vibe - Aurora', ctx=[50, 58], what='the build\'s last four bars, cut on the drop at 56',
                  events=[air('airRise', 52, 4)], solo=[air('airRise', 0, 4), air('airRise', 8, 4)], ref='hats', measure='peak', db=-18),
             dict(key='b', name='two bars, 6 dB quieter', track='Vibe - Aurora', ctx=[50, 58], what='the build\'s last two bars, cut on the drop at 56',
                  events=[air('airRise', 54, 2)], solo=[air('airRise', 2, 2), air('airRise', 10, 2)], ref='hats', measure='peak', db=-24),
             dict(key='c', name='the held hiss over a break\'s end', track='Vibe - Pure Gold', ctx=[38, 46], what='flat over the breakdown\'s last four bars, cut by the drop at 44',
                  events=[air('airRise', 40, 4, flat=1, attack=1.2)], solo=[air('airRise', 0, 4, flat=1, attack=1.2), air('airRise', 8, 4, flat=1, attack=1.2)], ref='hats', measure='mean', db=-24),
         ]),
    dict(id='T29', title='A breath at the phrase line',
         lines=['Inside a long groove a short airy swell rises and falls across a phrase line, like the track breathing in.',
                'Nothing stops; the line is just marked.'],
         options=[
             dict(key='a', name='a breath of a bar and a half', track='Vibe - Heat Haze', ctx=[16, 24], what='peaks on the 16-bar line at bar 20',
                  events=[air('airBreath', 19.25, 1.5)], solo=[air('airBreath', 3.25, 1.5), air('airBreath', 11.25, 1.5)], ref='hats', measure='peak', db=-16),
             dict(key='b', name='a longer, wider breath', track='Vibe - Heat Haze', ctx=[16, 24], what='two bars, 4 to 10 kHz, peaks on bar 20',
                  events=[air('airBreath', 19, 2, bandHz=[4000, 10000], bandQ=0.9)], solo=[air('airBreath', 3, 2, bandHz=[4000, 10000], bandQ=0.9), air('airBreath', 11, 2, bandHz=[4000, 10000], bandQ=0.9)], ref='hats', measure='peak', db=-16),
             dict(key='c', name='the breath, 6 dB quieter', track='Vibe - Heat Haze', ctx=[16, 24], what='as the first, 6 dB under it',
                  events=[air('airBreath', 19.25, 1.5)], solo=[air('airBreath', 3.25, 1.5), air('airBreath', 11.25, 1.5)], ref='hats', measure='peak', db=-22),
         ]),
    dict(id='T30', title='Breathing noise for the beatless stretches',
         lines=['In a beatless break a soft band of noise swells and falls away like a wave on sand, every few bars.',
                'The high mids are filled where the drums used to be, without a pulse.'],
         options=[
             dict(key='a', name='arcs, three in eight bars with rests', track='Vibe - Aurora', ctx=[22, 34], what='the breakdown\'s beatless bars 24-32: arcs at 24, 27 and 29, the hats back at 32',
                  events=[air('airArc', 24, 2), air('airArc', 27, 1), air('airArc', 29, 2)],
                  solo=[air('airArc', 0, 2), air('airArc', 3, 1), air('airArc', 5, 2), air('airArc', 8, 2), air('airArc', 11, 1), air('airArc', 13, 2)], ref='pad', measure='peak', db=-24),
             dict(key='b', name='one broad swell in eight bars', track='Vibe - Aurora', ctx=[22, 34], what='the beatless bars: one 4 kHz swell over bars 25-29',
                  events=[air('airArc', 25, 4, bandHz=[3500, 4500], bandQ=0.8, peak=0.5)],
                  solo=[air('airArc', 1, 4, bandHz=[3500, 4500], bandQ=0.8, peak=0.5), air('airArc', 9, 4, bandHz=[3500, 4500], bandQ=0.8, peak=0.5)], ref='pad', measure='peak', db=-24),
             dict(key='c', name='the arcs, 6 dB quieter', track='Vibe - Aurora', ctx=[22, 34], what='as the first, 6 dB under it',
                  events=[air('airArc', 24, 2), air('airArc', 27, 1), air('airArc', 29, 2)],
                  solo=[air('airArc', 0, 2), air('airArc', 3, 1), air('airArc', 5, 2), air('airArc', 8, 2), air('airArc', 11, 1), air('airArc', 13, 2)], ref='pad', measure='peak', db=-30),
         ]),
    dict(id='T35', title='A few glassy pings in the break',
         lines=['Over the held chord a few short glassy pings fall at odd places, three bars in eight, into the room.',
                'Or a soft glass pluck plays the chord as a short phrase, a call and its answer.'],
         options=[
             dict(key='a', name='glassy pings, three bars in eight', track='Vibe - Sunrise', ctx=[30, 40], what='the breakdown: pings in bars 31, 33 and 36',
                  events=ping(31, 3, 108) + ping(31, 11, 104) + ping(33, 6, 110) + ping(33, 14, 106) + ping(36, 2, 103) + ping(36, 7, 108),
                  solo=ping(1, 3, 108) + ping(1, 11, 104) + ping(3, 6, 110) + ping(3, 14, 106) + ping(6, 2, 103) + ping(6, 7, 108) + ping(9, 3, 108) + ping(9, 11, 104) + ping(11, 6, 110) + ping(11, 14, 106) + ping(14, 2, 103) + ping(14, 7, 108),
                  ref='pad', measure='peak', db=0),
             dict(key='b', name='a glass pluck, a phrase', track='Vibe - Sunrise', ctx=[30, 40], what='the breakdown: a call at 32, its answer at 34, again at 36',
                  events=[pluck(32, 0, 86, 2), pluck(32, 6, 89, 1), pluck(32, 10, 87, 1), pluck(33, 0, 86, 4), pluck(34, 0, 89, 1.5), pluck(34, 6, 87, 1), pluck(34, 10, 84, 1), pluck(35, 0, 82, 4),
                          pluck(36, 0, 87, 2), pluck(36, 6, 84, 1), pluck(36, 10, 82, 1), pluck(37, 0, 84, 4)],
                  solo=[pluck(2, 0, 86, 2), pluck(2, 6, 89, 1), pluck(2, 10, 87, 1), pluck(3, 0, 86, 4), pluck(4, 0, 89, 1.5), pluck(4, 6, 87, 1), pluck(4, 10, 84, 1), pluck(5, 0, 82, 4),
                        pluck(6, 0, 87, 2), pluck(6, 6, 84, 1), pluck(6, 10, 82, 1), pluck(7, 0, 84, 4),
                        pluck(10, 0, 86, 2), pluck(10, 6, 89, 1), pluck(10, 10, 87, 1), pluck(11, 0, 86, 4), pluck(12, 0, 89, 1.5), pluck(12, 6, 87, 1), pluck(12, 10, 84, 1), pluck(13, 0, 82, 4)],
                  ref='pad', measure='peak', db=0),
             dict(key='c', name='the pings, 6 dB quieter', track='Vibe - Sunrise', ctx=[30, 40], what='as the first, 6 dB under it',
                  events=ping(31, 3, 108) + ping(31, 11, 104) + ping(33, 6, 110) + ping(33, 14, 106) + ping(36, 2, 103) + ping(36, 7, 108),
                  solo=ping(1, 3, 108) + ping(1, 11, 104) + ping(3, 6, 110) + ping(3, 14, 106) + ping(6, 2, 103) + ping(6, 7, 108) + ping(9, 3, 108) + ping(9, 11, 104) + ping(11, 6, 110) + ping(11, 14, 106) + ping(14, 2, 103) + ping(14, 7, 108),
                  ref='pad', measure='peak', db=-6),
         ]),
    dict(id='T33', title='The harmony reaches up',
         lines=['The strings and the held pad get a silvery edge up top from their own sound, not an octave higher.',
                'Each phrase starts with a short breath, like a bow touching the string.'],
         options=[
             dict(key='a', name='strings, the lid opened to 7.5 kHz', track='Vibe - Warm Front', ctx=[34, 46], what='the breakdown\'s strings',
                  settings={'strings': {'cutoffHz': 7500}}, events=[], solo=[], soloVoices=['pad'], ref=None),
             dict(key='b', name='strings, opened, with a bow breath', track='Vibe - Warm Front', ctx=[34, 46], what='the same, a breath at bars 36, 40 and 44',
                  settings={'strings': {'cutoffHz': 7500}}, events=[air('bowBreath', b, 0.05 / 2.365) for b in (36, 40, 44)],
                  solo=[air('bowBreath', b, 0.05 / 2.365) for b in (2, 6, 10, 14)], soloVoices=['pad', 'bowBreath'], ref='strings', measure='peak', db=-18),
             dict(key='c', name='strings, half open, a softer breath', track='Vibe - Warm Front', ctx=[34, 46], what='the lid at 4.5 kHz, the breath 6 dB under',
                  settings={'strings': {'cutoffHz': 4500}}, events=[air('bowBreath', b, 0.05 / 2.365) for b in (36, 40, 44)],
                  solo=[air('bowBreath', b, 0.05 / 2.365) for b in (2, 6, 10, 14)], soloVoices=['pad', 'bowBreath'], ref='strings', measure='peak', db=-24),
             dict(key='d', name='wave pad, the lid opened to 7.5 kHz', track='Vibe - Heat Haze', ctx=[34, 46], what='the breakdown\'s held wave pad',
                  settings={'wavePad': {'cutoff': 7500}}, events=[], solo=[], soloVoices=['wavePad'], ref=None),
             dict(key='e', name='wave pad, opened, with a breath', track='Vibe - Heat Haze', ctx=[34, 46], what='the same, a breath at bars 36, 40 and 44',
                  settings={'wavePad': {'cutoff': 7500}}, events=[air('bowBreath', b, 0.05 / 2.353) for b in (36, 40, 44)],
                  solo=[air('bowBreath', b, 0.05 / 2.353) for b in (2, 6, 10, 14)], soloVoices=['wavePad', 'bowBreath'], ref='strings', measure='peak', db=-18),
         ]),
]


def shift(evs, by):
    return [dict(e, bar=e['bar'] + by) for e in evs]


def gained(evs, g):
    return [dict(e, p=dict(e['p'], gain=round(g * e['p'].get('gain', 1), 6))) for e in evs]


def voices_of(o):
    return sorted({e['voice'] for e in o['events'] + o['solo']})


def base_name(track, ctx):
    return f"{SHORT[track]}-{ctx[0]}-{ctx[1]}"


def jobs1():
    jobs, seen = [], set()
    for idea in IDEAS:
        for o in idea['options']:
            t, c = o['track'], o['ctx']
            for name, job in [
                (f"base-{base_name(t, c)}", dict(link=L[t], fromBar=c[0], toBar=c[1])),
                (f"hats-{SHORT[t]}", dict(link=L[t], fromBar=MAIN[t][0], toBar=MAIN[t][1], only=['hats'])),
                (f"pad-{base_name(t, c)}", dict(link=L[t], fromBar=c[0], toBar=c[1], only=['pad'])),
            ]:
                if name not in seen:
                    seen.add(name)
                    jobs.append(dict(name=name, **job))
            if o['events'] and o.get('ref'):
                jobs.append(dict(name=f"unit-{idea['id']}{o['key']}", link=L[t], fromBar=c[0], toBar=c[1], add=o['events'], voices=voices_of(o)))
    return jobs


def jobs2(gains):
    jobs = []
    for idea in IDEAS:
        for o in idea['options']:
            t, c, k = o['track'], o['ctx'], f"{idea['id']}{o['key']}"
            g = gains.get(k, 1)
            jobs.append(dict(name=f"after-{k}", link=L[t], fromBar=c[0], toBar=c[1], add=gained(o['events'], g), settings=o.get('settings')))
            jobs.append(dict(name=f"solo-{k}", link=L[t], fromBar=c[0], toBar=c[0] + 16, add=gained(shift(o['solo'], c[0]), g), settings=o.get('settings'),
                             voices=o.get('soloVoices') or voices_of(o)))
    return jobs


if __name__ == '__main__':
    if sys.argv[1] == 'jobs1':
        json.dump(jobs1(), open(sys.argv[2], 'w'), indent=1)
    elif sys.argv[1] == 'jobs2':
        json.dump(jobs2(json.load(open(sys.argv[2]))), open(sys.argv[3], 'w'), indent=1)
    elif sys.argv[1] == 'ideas':
        json.dump(IDEAS, open(sys.argv[2], 'w'), indent=1)
