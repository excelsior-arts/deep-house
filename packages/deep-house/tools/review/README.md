# tools/review — listening, and saying so

A local web page for going through a list of wavs and deciding about each one,
with the decisions written back **on the machine** and not downloaded from a
browser. Eugene's ask, 2026-09-18:

> *"I need a tool for listening and scoring: a simple web site, a vertical list,
> I can listen to a track and keep it as a chef's preference, keep it as a decent
> recipe, or drop it; the state recorded on the server in your file format so I
> don't need to download things from the browser; on refresh either drop reviewed
> items or put them aside, your choice, as long as there is a systematic way of
> progressing me through the tracks. We can reuse this tool for future scenarios:
> WAV-to-recipe variant review, approvals, etc."*

So the tool knows nothing about recipes, the cookbook or the encoder. It knows
about **a session manifest**, and every scenario is one of those.

```
npm run review -- notes/reviews/cookbook.json          # from the repository root
npm run review -- notes/reviews/kitchen.json --port 7050
npm run review -- notes/reviews/cookbook.json --lan    # and on the phone as well
node tools/review/server.ts notes/reviews/cookbook.json --port 7040
```

No dependencies, no build, node's own http server. It binds `127.0.0.1` unless
`--lan` is given, and it never takes port 6975, which is the dev server.

## The manifest is the contract

One file under `notes/reviews/<session>.json`, and it is both the configuration
and the state — so a review that was interrupted is a file that says where it
got to, and a new scenario is a new file rather than a new tool.

```jsonc
{
  "schema": 1,
  "id": "cookbook",                  // a plain name; it signs the verdicts it writes
  "title": "The cookbook: which archetypes of the record Eugene keeps",
  "kind": "cookbook",                // cookbook | variants | wav-roundtrip | approvals | …
  "rowWrite": "score+verdict",       // score+verdict (default) | verdict | none
  "items": [{
    "id": "track-01-sub-room-minimal",       // stable: the decisions are keyed by it
    "title": "sub room, minimal: a bright figure over a held ensemble",
    "subtitle": "cookbook/track-01… · track · share 30% (46 of 154)",
    "wav": "tmp/ear/cookbook/track-01-….wav",     // relative to the repository
    "source": "tmp/ear/recipe-A-source.wav",      // optional: the A/B on the card
    "meta": { "seed": "7", "theme": 2, "bar": 88, "bars": 16, "room": "sub",
              "density": "minimal", "box": "em 0.28-0.38, …", "wants": "…" },
    "row": "notes/recipes/candidates/track-01-….json"   // optional: what it scores
  }],
  "actions": [
    { "id": "pick", "label": "chef's pick",   "key": "1", "score":  2, "verdict": "hit" },
    { "id": "keep", "label": "decent recipe", "key": "2", "score":  1, "verdict": "partial" },
    { "id": "drop", "label": "drop",          "key": "3", "score": -1, "verdict": "miss" },
    { "id": "skip", "label": "skip",          "key": "s", "score":  0, "pending": true }
  ],
  "fields": [                                  // instead of, or beside, actions
    { "id": "identity", "label": "sounds like what it is called", "kind": "choice", "required": true,
      "options": [{ "id": "yes", "label": "yes", "key": "y" }, { "id": "no", "label": "no", "key": "n" }] },
    { "id": "fit", "label": "belongs on", "kind": "multi", "required": true, "options": [ … ] }
  ],
  "state": {
    "track-01-sub-room-minimal": { "action": "pick", "score": 2, "note": "…", "at": "2026-09-18T…" },
    "effect-chorus": { "fields": { "identity": "yes", "fit": ["pads", "keys"] }, "note": "…", "at": "…" }
  }
}
```

- **An item's `id` is a provenance key**, and from 2026-09-18 it is the same
  string as its wav's own name without the extension:
  `<scope>-s<seed>-t<theme>-b<from>-<to>-<rate>`. The decisions are keyed by it,
  so it has to name the *music* and nothing about the run that made it. The
  first cut of the cookbook named both the file and the id by the rank the
  clustering gave the row and a truncated description of it
  (`track-01-sub-room-minimal-a-bright-figure…`), and neither survives a
  re-clustering: a row that moves from second to third renames a file somebody
  has already decided about. A seed and a bar range cannot move, because they
  are the music. The description belongs in `title`, where a person reads it and
  no tool keys on it. A builder that rebuilds a manifest **migrates an older
  one's `state` onto the new ids by matching `meta.seed`, `meta.theme` and
  `meta.bars`**, and says out loud which decisions name music that is no longer
  in the session rather than dropping them in silence.
- **`meta`** is free: whatever it holds is shown as the card's compact table, in
  the order it is written. A few of its keys are read by the tool when it writes
  a verdict, because a verdict points at a piece of music: `seed` (or
  `masterSeed`), `theme`, and the window as either `bar` (or `fromBar`) or
  `bars: "88+16"`.
  `session.ts` holds that rule for every builder: `provenanceKey`, with
  `keyOfItem` and `migrateState` beside it. An audition is the one session whose
  music is not a seed and a bar range, and its id is the file's own name for
  exactly the same reason.
- **A decision migrates onto the same audio only** (M2 of the mining review, 2026-09-19). A
  seed and a bar range say how to *ask* for a piece; they do not name what came
  out, and the same bars under another strategy or another build are other
  music. So an item's meta carries the **approval identity** — `strategy`,
  `build` and `audioHash` (the wav's own SHA-256) — and `migrateState` carries a
  decision onto a rebuilt item only when all three are the same. Otherwise the
  decision is kept under the manifest's **`superseded`** block as the earlier
  answer about other audio, keyed by the item it would have been about, and
  never counted as that item's answer; the card shows it for context. Where one
  side carries no identity — every session written before this rule — the
  decision is carried by provenance and the builder says so (`blind`). A verdict
  written onto a row carries the same three fields, so a row can tell a verdict
  on this build from one on the last.
- **`actions`** are the buttons and the keys. `score` is what lands in the
  manifest; `chef` overrides it for the row when the two should differ; `verdict`
  is the word written onto the row (otherwise it is `hit`, `partial` or `miss`
  by the sign of the score). An action with **`pending: true`** is a skip: it
  leaves the item undecided, which is also how a decision is taken back.
- **`fields`** is the other way to answer, and a session may have either or
  both. A field is `choice` (one of a few), `multi` (any of a few) or `note`
  (words); each option carries its own one-letter `key`, and **one key never
  means two things on one card** — the gate refuses a manifest where it does,
  because a keystroke that records the wrong opinion is the one fault nothing
  else here can repair. An answer is written **on every change**, and the item
  counts as reviewed only once every field marked `required` has one, so a card
  half filled in stays where he is looking. The same key pressed again takes its
  answer back, which puts the item back in the queue.
- **`state`** is written by the server and nothing else. Deleting an entry puts
  the item back in the queue; deleting the file starts the session again.
- `src/recipe.ts`'s scale is the chef's, so a score outside **-3..+3** is
  clamped when it reaches a row.

`tools/review/session.ts` is the contract in code: `validateSession` is the
gate (`npm run check` runs it over a sample and over six ways of breaking one),
and `decide` is the one write path.

## What a decision writes

1. **The manifest**, immediately and atomically (written to a neighbour and
   renamed over), so a refresh or a crash loses nothing. The file is re-read
   before every write, so a hand editing it while the page is open is not
   clobbered.
2. **The row**, when the item names one and `rowWrite` is not `none`:
   - `score.chef` — the action's score on the chef's own scale (`score+verdict`
     only). `likes` is a listener's count and is never touched.
   - `verdicts` — one entry `{ seed, theme, bar, wav, verdict, note, at, by }`,
     carried the way `recipe-from-mark.js` carries verdicts: appended, never
     derived, and **replacing this session's own earlier verdict about the same
     wav** rather than stacking another on it.

   **Nothing else in the row is touched** — it is read, those two keys are set,
   and it is written back with every other field exactly as it was; `npm run
   check` asserts that. `picked` stays the contact sheet's own column, and no
   row enters `packages/deep-house/recipes/` from here: that is Eugene's word
   and a separate act.

   A skip clears the decision in the manifest and leaves whatever the row
   already says; re-decide to move it.

## The page

Black ground, the ring's gold, no glow; it works down to 400 px, which is the
phone over `--lan`.

- **Progression**: pending items first, in manifest order, the current one with
  a gold rule and scrolled to. A decision advances to the next pending item and
  starts it playing when **auto-advance** is on (it is by default). Reviewed
  items collapse to one line at the bottom under *reviewed*, newest first, each
  with **reopen** to change its decision. A refresh gives the same order, so he
  always continues where he left off.
- **Keys**: `space` play/pause · `↓` next · `↑` previous · `l` loop · and one
  key per answer: for the cookbook `1` chef's pick, `2` decent recipe, `3` drop,
  `s` skip; for an audition `y`/`n` identity, `c`/`s`/`b` artefacts, `p` pads
  `k` keys `d` drums `o` the drop `e` a seam `w` a breakdown `x` nowhere, and
  `a`/`r`/`m` less, right, more. **What the manifest claims, the manifest gets**:
  `n` and `p` step to the next and previous item only while no answer claims
  them, and the arrows always do. Typing in a note field types; `Escape` leaves
  it.
- **The players** are native (so seeking works — the server answers range
  requests), with a big play/pause, a loop for going round a bar again, and,
  when the item has a `source`, an A/B switch that keeps its place in the file.

## Where a session comes from

**A manifest has one writer, and it is the tool that made the music.** This one
serves and records; it never writes a session it did not make.

- **The cookbook** — `notes/reviews/cookbook.json` belongs to
  `tools/imprint/cookbook.ts`, which writes it beside the contact sheet on every
  run (`node tools/imprint/cookbook.ts`, or `--ear` for the wavs, or `--refresh`
  to re-derive): one item per archetype in the sheet's own order, the medoid's
  seed, theme and bars as the table, the candidate row as what the decision
  scores, and `migrateState` carrying the decisions already made across a
  re-clustering. It checks itself against `validateSession` before writing.
- **The variants** — `node tools/review/session-from-variants.ts` reads
  `tmp/imprint/variants/variants.json` and makes one item per rendered variant
  with the recipe's own source as the A/B, which is the labelling
  `analysis/recipe-demo.md` did by hand. `--letter A` takes one recipe, `--out`
  names the file. Every item points at the same row, so it sets
  `rowWrite: 'verdict'`: the variants are labelled, the recipe's own score is
  not touched. Re-running it carries the decisions across by provenance key and
  says out loud which ones name music the report no longer has.

- **The kitchen** — `node tools/review/session-from-kitchen.ts` lists every wav
  under `tmp/ear/kitchen/` (what `packages/engine/tools/ear.ts`, `ear-voices.ts`
  and `ear-drums.ts` render) as one audition each: `effect-*`, `voice-*`,
  `drum-*` and the together files, in the registries' own order, with the meta
  read off the engine's own descriptors — an effect's family, scope, what it
  applies to, its cost class, its tail and **the defaults it was demonstrated
  at**; a voice's family, roles, bus and its declared hold, brightness and
  loudness. It is a `fields` session and `rowWrite: 'none'`: nothing is scored
  and no recipe row is written. Re-run it whenever a round renders more — the id
  is the file's own name, so every answer already given is carried across.

  **What is worth saying about an audition** is four things and none of them is
  a tuning (Eugene's question, 2026-09-18): *identity* — does it sound like what
  it is called, yes or no; *artefacts* — clean, some or bad, with a word;
  *fit* — what it belongs on, several at once, and *nowhere* is a real answer;
  *amount* — the setting he was played: less, right or more. They live in
  `session.ts` as `AUDITION_FIELDS`, so a second audition round asks the same
  questions and the answers can be compared.

A third scenario needs no code: write the manifest, with ids by the same rule.
