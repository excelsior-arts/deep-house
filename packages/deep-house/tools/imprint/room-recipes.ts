// room-recipes.ts — the two rooms, as rows of the library.
//
//   node tools/imprint/room-recipes.ts          write recipes/{sub,growl}-room.json
//   node tools/imprint/room-recipes.ts --print  say what they are and write nothing
//
// `notes/analysis/imprint-calibration.md` found, out of a measurement that
// knows nothing about rooms, that the fourteen golden themes are **two clusters
// and the split is the room**: Tide, Zephyr, Veil and Spark separate sub from
// growl with no overlap at all. That is the library's first real finding —
// PLAN-RECIPES expected three to six house recipes and here are two of them —
// and this is the tool that writes them down.
//
// A row is two halves and they come from two different places, which is the
// whole point of `notes/analysis/recipe-demo.md`'s lesson:
//
//   the **box** is the audio. It is the room's own signature out of
//     `src/styles/deep-house-signatures.json` — the mean of every measured
//     theme in that room, on each of the eight birds, plus and minus the
//     spread of those themes. Nothing here re-reads a wav: the measurement was
//     made once, is dated, and this reads it.
//   the **wants** are the plan, where the plan is exact. A bird is energy over
//     a window and a mix is mostly its drums, so what the birds cannot see —
//     which roles play at all, which families, how often each fires, and what
//     the desk is doing with them — is read off the plan by `plan-facts.ts`,
//     in properties and roles and never in a name.
//
// And the **weight** is the room's own share of the record, because that is
// what a weight in a library means: how often the randomiser reaches for this
// row when it reaches for one at all.

import fs from 'node:fs';
import path from 'node:path';
import { BY_NAME, FAMILIES } from '@deep-house/engine/voices';
import { planTheme, STYLE } from '../../src/mix.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { BIRDS } from '../../src/spell.ts';
import { eventsIn, ratesOf, stageOf, roleOfVoice, round3, RATE_BAND } from './plan-facts.ts';
import { SWEEP_SEEDS, SWEEP_THEMES } from './signatures.ts';
import { ROOT } from './render.ts';

const OUT = path.join(ROOT, 'packages', 'deep-house', 'recipes');
const WINDOW_BARS = 32;

// How much of a room a thing has to be in before the row says the room wants
// it. A role nine themes in ten play is the room's cast; a role half of them
// play is the randomiser's, and a row that demanded it would be describing one
// roll rather than the room.
const CAST_SHARE = 0.9;
const STAGE_SHARE = 0.6;

const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const modal = (xs) => {
  const c = new Map();
  for (const x of xs) if (x != null) c.set(x, (c.get(x) || 0) + 1);
  const e = [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return e.length ? e[0][0] : null;
};

/** Every theme the sweep and the golden cover, planned, with its window read. */
export function themeFacts() {
  const keys = new Set();
  const out = [];
  const add = (master, n) => {
    const key = `${master}#${n}`;
    if (keys.has(key)) return;
    keys.add(key);
    const track = planTheme(master, n, {});
    const w = loudnessWindow(track, WINDOW_BARS);
    const from = w.from;
    const to = w.from + w.bars;
    const events = eventsIn(track, from, to);
    const roles = new Set();
    const families = new Set();
    for (const e of events) {
      const role = roleOfVoice(e.voice, track);
      if (role) roles.add(role);
      const d = BY_NAME[e.voice];
      if (d && d.family) families.add(d.family);
    }
    out.push({
      key, track, room: track.preset, bars: w.bars,
      roles: [...roles], families: [...families],
      rates: ratesOf(track, events, w.bars),
      stage: stageOf(track, from, to),
    });
  };
  for (const master of SWEEP_SEEDS) for (let n = 0; n < SWEEP_THEMES; n++) add(master, n);
  for (const [master, themes] of Object.entries({ 1: 6, 92970: 4, 21323: 4 }))
    for (let n = 0; n < themes; n++) add(String(master), n);
  return out;
}

/** The row for one room. Pure: the signatures and the plans, nothing else. */
export function roomRecipe(room, facts, signatures = STYLE.signatures) {
  // The chef's score and the listeners' likes are the only fields here a tool
  // may not derive, so a re-encoding reads them off the row that is already
  // committed and writes them back untouched.
  const file = path.join(OUT, `${room}-room.json`);
  let score = { chef: 0, likes: 0 };
  try { score = JSON.parse(fs.readFileSync(file, 'utf8')).score || score; } catch { /* the first write has none */ }
  const sig = signatures.lists.rooms;
  const c = sig.candidates[room];
  if (!c || !c.mean) throw new Error(`the signatures have no room called ${room}`);
  const total = Object.values(sig.candidates).reduce((a, x) => a + (x.n || 0), 0);
  const mine = facts.filter((f) => f.room === room);
  const n = mine.length;

  const birds = {};
  for (const b of BIRDS) {
    birds[b] = [
      Math.round(Math.max(0, c.mean[b] - c.sd[b]) * 1000) / 1000,
      Math.round(Math.min(1, c.mean[b] + c.sd[b]) * 1000) / 1000,
    ];
  }

  const share = (pick) => {
    const seen = new Map();
    for (const f of mine) for (const x of new Set(pick(f))) seen.set(x, (seen.get(x) || 0) + 1);
    return seen;
  };
  const roles = [...share((f) => f.roles)].filter(([, k]) => k / n >= CAST_SHARE).map(([x]) => x).sort();
  const families = [...share((f) => f.families)].filter(([, k]) => k / n >= CAST_SHARE).map(([x]) => x)
    .filter((x) => FAMILIES.includes(x)).sort();

  const rates = {};
  for (const role of roles) {
    const xs = mine.map((f) => f.rates[role]).filter(Boolean).map((r) => r.perBar);
    if (xs.length < n * CAST_SHARE) continue;
    const perBar = round3(median(xs));
    rates[role] = { perBar, min: round3(perBar / RATE_BAND), max: round3(perBar * RATE_BAND) };
  }

  const backs = share((f) => f.stage.back);
  const treats = share((f) => f.stage.treatments);
  const stage = {
    front: modal(mine.map((f) => f.stage.front)),
    lead: modal(mine.map((f) => f.stage.lead)),
    back: [...backs].filter(([, k]) => k / n >= STAGE_SHARE).map(([x]) => x).sort(),
    treatments: [...treats].filter(([, k]) => k / n >= STAGE_SHARE).map(([x]) => x).sort(),
    steadyFront: mine.filter((f) => f.stage.steadyFront).length / n >= STAGE_SHARE,
  };

  return {
    schema: 1,
    kind: 'recipe',
    id: `house/${room}-room`,
    interpreter: 'v1',
    scope: 'track',
    applies: null,
    name: `the ${STYLE.rooms[room].label} room`,
    origin: 'golden',
    birds,
    wants: { roles, families, rates, stage },
    forbids: [],
    // How often the randomiser reaches for this row when it reaches for one:
    // the room's own share of the record, rounded to a thousandth. What the
    // *draw* reads is `weightOf` in `src/recipe.ts`, which is this share times
    // the chef's own hand and the listeners' likes.
    weight: Math.round((c.n / total) * 1000) / 1000,
    // The one block on a row nobody derives, so it is carried across every
    // re-encoding rather than rewritten: Eugene of 09-18 on the two rooms —
    // "they fit deep house, we can keep them, but they are not my favourites" —
    // which is a nought and not a minus, and a nought draws at the share.
    score,
    provenance: {
      from: `the ${c.n} measured themes of the ${room} room`,
      centre: 'the mean of those themes on each bird, out of src/styles/deep-house-signatures.json',
      box: 'plus and minus their spread on that bird, clamped into 0..1',
      wants: `read off the plans of the same ${n} themes: a role or a family at least ${Math.round(CAST_SHARE * 100)}% of them play, the median rate of each with the +/-${RATE_BAND}x band the verdicts of 09-18 set, and the stage at least ${Math.round(STAGE_SHARE * 100)}% of them hold`,
      window: `up to ${WINDOW_BARS} bars of main groove per theme, the window the imprint was read over`,
      anchors: signatures.provenance.anchors,
      signatures: signatures.provenance.date,
      calibration: 'notes/analysis/imprint-calibration.md',
      note:
        'The two rooms are the two clusters the calibration found, and it found them without knowing '
        + 'a room existed: Tide, Zephyr, Veil and Spark separate sub from growl in the golden with no '
        + 'overlap. A roll inside this row is a roll inside one cluster, where a roll inside the house '
        + 'row is a roll between two.',
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const facts = themeFacts();
  const rows = STYLE.catalogue.rooms.map((room) => roomRecipe(room, facts));
  fs.mkdirSync(OUT, { recursive: true });
  for (const row of rows) {
    const file = path.join(OUT, `${row.id.split('/')[1]}.json`);
    const text = JSON.stringify(row, null, 2) + '\n';
    if (process.argv.includes('--print')) console.log(text);
    else { fs.writeFileSync(file, text); console.log(`  ${row.id.padEnd(18)} weight ${row.weight}  ${Object.keys(row.wants.rates).length} rates  -> ${path.relative(ROOT, file)}`); }
  }
}
