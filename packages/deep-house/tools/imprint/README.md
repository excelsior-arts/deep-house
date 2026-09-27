# tools/imprint — a piece of audio, read as eight birds

The first piece of the mining pipeline PLAN-SCALE §7 says does not exist. It
takes audio and writes an **imprint**: a row of numbers in the eight-bird space
of `notes/plans/PLAN-MAGIC-V2.md`, in the schema and against the scale that
`notes/plans/PLAN-IMPRINT.md` specifies.

It is tooling, not the record. Nothing here is served to a browser, nothing here
is imported by the page, and nothing it writes is in git.

## What is here

| file | what |
|---|---|
| `birds.py` | the measurement: the eight birds as features of audio, and nothing else — no files, no schema, no command line |
| `anchors.json` | the scale: three raw anchors per feature (the 0 wall, the house centre, the 1 wall) and what each one means |
| `imprint.py` | one file of audio in, one imprint row out |
| `calibrate.py` | imprints in, centres and spreads out; `--recentre` puts the house anchor where the golden measured |
| `render.ts` | the shared renderer: the built site on a port, one headless Chromium on the silent route, a window cut out of the compiled program |
| `imprint-golden.ts` | renders a main-groove window of each of the fourteen golden themes offline and runs `imprint.py` over it |
| `plan-facts.ts` | what the plan and the stage say about a span: timbre properties, per-role rates, the stage's assignment and its treatments — the half a bird measured over a whole mix cannot see |
| `recipe-from-mark.ts` | a mark from a ratings log, encoded as a recipe row in `notes/recipes/` |
| `variants.ts` | what else in today's catalogue falls inside a recipe's box, and eight bars of each for a listener |
| `mine_sources.py` | the three reference sets, read in v2's terms: v1's own coherent stretches, windowed at eight bars of each one's tempo, as the eight birds plus the band rates, the hat fold, the sustain, the brightness, the low mass and the stereo width |
| `mine-v2.ts` | what that becomes: the separation on the sources, the measured box against `HOUSE`, the clusters at four scopes, the rows in `notes/recipes/mined/`, the gap list, and `--ear` for a listening session |
| `human-fields.ts` | the fields no tool derives — `score`, `verdicts`, `picked`, a name somebody gave — and the one way a regeneration carries them: by the row's identity (its medoid, its mark), never by its id or file name; an opinion whose music is gone is an orphan by name |
| `ledger.ts` | a variant keeps its number for life: the append-only ledger of every number ever given, by recipe and by the music |

## Running it

The python is the analysis venv the 2026-09-15 mining was done in — librosa
1.0.0, numpy, scipy, soundfile — which lives in the lab and is not installed by
this repository:

```sh
tmp/analysis/venv/bin/python packages/deep-house/tools/imprint/imprint.py \
    some.wav --out tmp/imprint/some.json --raw
```

There is no `requirements.txt` on purpose: the venv is Eugene's lab and it is
already there. If it is ever lost, it is `python3 -m venv`, then
`pip install librosa soundfile scipy numpy scikit-learn`.

```sh
# the fourteen golden themes: render, then measure  (~9 min, one at a time, niced)
node packages/deep-house/tools/imprint/imprint-golden.ts

# a long set, sampled rather than read through: forty windows of twenty seconds
tmp/analysis/venv/bin/python packages/deep-house/tools/imprint/imprint.py \
    tmp/analysis/wav/s1.wav --sample 40 --window 20 \
    --origin reference --label "reference set 1" --raw --out tmp/imprint/sets/set1.json

# where a pile of imprints sits, and what the scale's centre would be
tmp/analysis/venv/bin/python packages/deep-house/tools/imprint/calibrate.py \
    'tmp/imprint/golden/*.json' --label golden --markdown

# a listener's marks, encoded as recipes  (needs the golden imprints, for the box widths)
node packages/deep-house/tools/imprint/recipe-from-mark.ts \
    notes/ratings/deep-house-ratings-2026-09-18.json

# and what else in the catalogue is that recipe  (~9 min for two recipes)
node packages/deep-house/tools/imprint/variants.ts

# the three reference sets, in v2's terms  (~15 min, one process, niced)
nice -n 18 tmp/analysis/venv/bin/python \
    packages/deep-house/tools/imprint/mine_sources.py --out tmp/analysis/mine_v2

# then the rows, the box table, the gap list and the report  (seconds)
node packages/deep-house/tools/imprint/mine-v2.ts --themes 200

# ... and six renders of the nearest thing today's catalogue makes  (~1 min)
node packages/deep-house/tools/imprint/mine-v2.ts --themes 200 --ear
```

`imprint-golden.ts` needs `docs/` built (`npm run build`) and playwright in one
of the two places the harness looks. It serves the built site on **7023** and
never 6975, opens the page on the silent route, renders offline — an
`OfflineAudioContext` has no output device — and renices the browser to the
bottom of the queue, because it runs on the machine somebody is listening on.

## The rules this tool keeps

- **Only numbers leave the lab.** A source is named by a content hash and never
  by a path; `--label` is whatever the caller wants to call it. No audio is
  copied, moved or played, and nothing here writes into `tmp/sources/`.
  `mine_sources.py` decodes the reference sets a stretch at a time into memory
  and writes no wav, no segment and no cache of samples anywhere; it finds its
  input by the stem `source_<n>` and never by an extension, because the release
  audit refuses a recording's name in a file this repository ships and it is
  right to.
- **One analysis front end.** Everything is measured mono at 22050 Hz over a
  2048-point STFT, whatever the file was, so a 48 kHz stereo render and a
  reference set decoded to 22.05 kHz mono land in the same space. That is why
  width is not a bird and why Zephyr's confidence is a function of the file's
  own Nyquist.
- **A measurement that is not there is missing, not zero.** A window with no
  grid has no Spark features and says so; a piece taken as scattered windows has
  no Loom span and says so. Every bird carries a confidence, and a confidence is
  read off the instrument rather than chosen.
- **The scale is a file.** `anchors.json` is the only place that knows what a
  house reading is, and `calibrate.py --recentre` is the only thing that writes
  it.
- **A window that falls on bars is asked for in bars.** Three ways of computing
  the same instant in seconds are three different doubles, and an event
  scheduled a hair earlier renders a hair differently; `render.ts` takes bars
  where there are bars, so a re-render is the same bytes.
- **A recipe is encoded only if the build still makes the music it was marked
  in.** `recipe-from-mark.ts` plans the theme again and checks the tempo, the
  bars, the room, the key and every die against what the mark recorded, and
  refuses the row if any of them moved.
- **A verdict is a field no tool may derive, and so are the chef's score, the
  pick and a name somebody gave.** `human-fields.ts` is the contract: every
  authoring tool (`mine-v2.ts`, `cookbook.ts`, `recipe-from-mark.ts`) carries
  them across a regeneration by the row's **identity** — a mined row's medoid
  stretch, a golden row's medoid seed and bars, a listener row's mark — and
  never by the row's id or file name, both of which move with the rank. A
  previous row with an opinion on it that no regenerated row is the music of is
  an **orphan**: it is named, kept in `orphans/` beside the rows, and never
  transplanted; `mine-v2.ts` refuses to write at all unless told `--orphans-ok`.
  `npm run check` holds the rule on scratch rows (M1 of the mining review, 09-19).
- **A variant keeps its number for life.** `recipe-A-variant-1.wav` is the same
  eight bars it was when somebody judged it, however the ranking moves, because
  a verdict points at a file. `ledger.ts` is the append-only ledger of every
  number ever given, by the recipe's id and by the music (seed, theme, window);
  a letter is given over the whole library before `--recipe` filters it, and a
  wav is reused under `--reuse` only when its sidecar says it is the same job
  (M3 of the mining review, 09-19).
- **A decision is about one audio.** A card's meta carries the strategy that
  planned it, the build that rendered it and the wav's own hash; a rebuilt
  session migrates a decision only onto the same three, keeps it as
  `superseded` otherwise, and says which decisions it carried blind
  (`tools/review/session.ts`, M2 of the mining review).
