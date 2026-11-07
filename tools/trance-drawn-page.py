# trance-drawn (11-04): the listening page. Level-matches every WAV to one loudness (ffmpeg's EBU R128), encodes m4a,
# draws the dadaspec pictures (tmp/agents/add-specs.py) and writes index.html from the cards in <cards.json>.
#   python3 tools/trance-drawn-page.py <site dir> <wav dir> <cards.json> <add-specs.py>
import json, sys, html, subprocess, pathlib, re

site, wavs, cards_file, specs = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3], sys.argv[4]
site.mkdir(parents=True, exist_ok=True)
TARGET = -14.0
spec = json.load(open(cards_file))

def lufs(f):
    out = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', str(f), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'^\s+I:\s+(-?[\d.]+) LUFS', out, re.M)[-1])

facts, jobs = {}, []
for c in spec['cards']:
    for row in c['rows']:
        for _, stem in row['files']:
            f = wavs / f'{stem}.wav'
            i = lufs(f); gain = TARGET - i
            jobs.append(subprocess.Popen(['nice', '-n', '18', 'ffmpeg', '-loglevel', 'error', '-y', '-i', str(f), '-af', f'volume={gain:.2f}dB',
                                          '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', str(site / f'{stem}.m4a')]))
            facts[stem] = dict(lufs=round(i, 1), gainDb=round(gain, 1))
for j in jobs: j.wait()

esc = html.escape
out = []
for c in spec['cards']:
    rows = []
    for row in c['rows']:
        players = ''.join(f'<div class="pl"><span>{esc(lab)}</span><audio controls preload="none" src="{stem}.m4a"></audio></div>' for lab, stem in row['files'])
        lv = ' · '.join(f'{lab.split(" ")[0]} {facts[s]["lufs"]:+.1f}' for lab, s in row['files'])
        links = ''.join(f'<a href="{esc(u)}">{esc(t)}</a> ' for t, u in row.get('links', []))
        rows.append(f'<div class="row"><h3>{esc(row["title"])}</h3>{"<p class=meta>" + esc(row["meta"]) + "</p>" if row.get("meta") else ""}{players}'
                    f'<p class="meta">As rendered (LUFS, before matching): {esc(lv)}</p>{"<p class=meta>" + links + "</p>" if links else ""}</div>')
    out.append(f'<section class="card"><h2><span class="id">{esc(c["n"])}</span>{esc(c["title"])}</h2><p>{esc(c["what"])}</p>'
               f'<p class="meta"><b>Listen for:</b> {esc(c["listen"])}</p>{"".join(rows)}</section>')

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trance, drawn</title>
<style>:root{{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--mute:#6b6b70;--line:#e2e0da;--acc:#1f5f9a}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#141416;--card:#1d1d20;--ink:#ececee;--mute:#9a9aa2;--line:#2e2e33;--acc:#7fb4ea}}}}
:root[data-theme="dark"]{{--bg:#141416;--card:#1d1d20;--ink:#ececee;--mute:#9a9aa2;--line:#2e2e33;--acc:#7fb4ea}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,sans-serif}}
main{{max-width:980px;margin:0 auto;padding:20px 16px 48px}}h1{{font-size:22px;margin:0 0 6px}}.lead{{color:var(--mute);margin:0 0 18px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}}h2{{font-size:18px;margin:0 0 4px}}
.id{{color:var(--mute);margin-right:6px}}.meta{{color:var(--mute);font-size:13px;margin:4px 0}}h3{{font-size:14px;margin:12px 0 4px;font-weight:600}}
.row{{border-top:1px solid var(--line);margin-top:10px;padding-top:4px}}.pl{{display:flex;align-items:center;gap:8px;margin:4px 0}}
.pl span{{width:96px;flex:none;color:var(--mute);font-size:13px}}.pl audio{{width:100%;min-width:0;height:34px}}a{{color:var(--acc)}}
</style></head><body><main><h1>Trance, drawn</h1>
<p class="lead">{esc(spec["lead"])} Every file is matched to {TARGET:.0f} LUFS.</p>
{"".join(out)}</main><script>document.addEventListener('play',e=>{{for(const a of document.querySelectorAll('audio'))if(a!==e.target)a.pause()}},true)</script></body></html>'''
(site / 'index.html').write_text(page)
(site / 'facts.json').write_text(json.dumps(facts, indent=1))
subprocess.run(['python3', specs, str(wavs), str(site)], check=False)
print(site / 'index.html', len(facts), 'files')
