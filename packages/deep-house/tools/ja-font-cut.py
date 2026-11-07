# The Japanese face, cut to the page's own glyphs (round japanese; his pick 11-03, M PLUS 1).
#
#   python3 tools/ja-font-cut.py <MPLUS1[wght].ttf>
#
# The source is M PLUS 1's variable font (OFL, github.com/google/fonts ofl/mplus1). It writes the two weights the page
# draws, a step under the Latin beside them (index.html says why): `public/fonts/ja-400.woff2` for the page's 400-470
# and `ja-450.woff2` for its 500, each cut to every character the tables' Japanese columns say (`words.ts`,
# `words-ring.json`: its lines, words and genres), which it lists in `tools/ja-glyphs.txt`. check-words fails when a column says a character the
# list lacks: run this again then. Needs fontTools and brotli (pip install fonttools brotli).
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
FONTS = os.path.join(HERE, '..', '..', '..', 'public', 'fonts')

def glyphs():
    text = open(os.path.join(SRC, 'words.ts'), encoding='utf8').read()
    ja = ''.join(re.findall(r"ja: '((?:[^'\\]|\\.)*)'", text))
    ring = json.load(open(os.path.join(SRC, 'words-ring.json'), encoding='utf8'))
    for sec in ('lines', 'words', 'genres'):
        for v in ring[sec].values(): ja += v.get('ja', '')
    ja += '日本語自動'
    return ''.join(sorted(set(c for c in ja if ord(c) > 0x2000 and not 0x2000 <= ord(c) <= 0x206F)))

def main(src):
    chars = glyphs()
    open(os.path.join(HERE, 'ja-glyphs.txt'), 'w', encoding='utf8').write(chars + '\n')
    with tempfile.TemporaryDirectory() as tmp:
        for weight in (400, 450):
            inst = os.path.join(tmp, f'{weight}.ttf')
            subprocess.run([sys.executable, '-m', 'fontTools.varLib.instancer', src, f'wght={weight}', '-o', inst, '-q'], check=True)
            subprocess.run([sys.executable, '-m', 'fontTools.subset', inst, f'--text={chars}', '--flavor=woff2',
                            f'--output-file={os.path.join(FONTS, f"ja-{weight}.woff2")}', '--layout-features=kern,palt,vert,ccmp,locl',
                            '--no-hinting', '--desubroutinize', '--name-IDs=*'], check=True)
    print(f'ja-font-cut: {len(chars)} glyphs, ja-400.woff2 and ja-450.woff2')

if __name__ == '__main__':
    main(sys.argv[1])
