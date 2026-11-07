// ep-noise (11-05): where the FM electric pianos the edge reads play (`fmEpSoft`, `fmEpGlass`): every featured track
// and every link-digest row, with the theme's edge blend (no edge, no noise, nothing moves) and the voice's bars, and
// the longest run of bars where the FM EP is the only harmonic voice sounding (the "it fills the space" stretches).
//
//   node tools/ep-noise-census.ts [--house N] [--corner N]
//     --house N   N seeds of the house at themes 1-3 as well, for the house-wide count
//     --corner N  N seeds at themes 1-4 at the trance corner's three tiles (the Trance star and its two dots)

import fs from 'node:fs';
import { coordinateOf, planOf } from '../packages/deep-house/tools/like/features.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const featured = JSON.parse(fs.readFileSync(`${ROOT}packages/deep-house/src/featured.json`, 'utf8'));
const digest = JSON.parse(fs.readFileSync(`${ROOT}packages/deep-house/tools/link-digest.json`, 'utf8'));
const EP = /^fmEp(Soft|Glass)$/;
const HARMONIC = new Set(['pad', 'keys', 'lead', 'strings', 'texture']);

function census(link: string) {
  const { track, program } = planOf(coordinateOf(`?${link}`));
  const bs = program.barSeconds;
  const ep = program.events.filter((e) => EP.test(e.voice));
  if (!ep.length) return null;
  const edge = program.settings.harmonicEdge?.blend ?? 0;
  const clean = program.settings.cleanKeys ?? [];
  const epBars = new Set(ep.map((e) => Math.floor(e.t / bs + 1e-6)));
  const others = new Set(program.events.filter((e) => !EP.test(e.voice) && HARMONIC.has(e.layer)).map((e) => Math.floor(e.t / bs + 1e-6)));
  let run = 0, best = { from: -1, bars: 0 };
  for (let b = 0; b < track.bars; b++) {
    if (epBars.has(b) && !others.has(b)) { run++; if (run > best.bars) best = { from: b - run + 1, bars: run }; } else run = 0;
  }
  const at = (bar: number) => track.arrangement.sections.find((s) => bar >= s.startBar && bar < s.startBar + s.bars)?.kind ?? '?';
  return {
    voices: [...new Set(ep.map((e) => e.voice))].join('+'), notes: ep.length, bars: epBars.size, of: track.bars, edge, clean: clean.filter((id) => EP.test(id)),
    alone: best.bars ? `${best.bars} bars from ${best.from} (${at(best.from)}, t=${Math.round(best.from * bs)})` : 'never alone',
  };
}

for (const pl of featured.playlists) pl.links.forEach((link, i) => {
  const c = census(link);
  if (c) console.log(`featured ${pl.name} #${i + 1}`, link, JSON.stringify(c));
});
let n = 0;
for (const row of digest.rows) {
  if ((row.strategy && row.strategy !== 'house-v2') || !/(^|&)seed=/.test(row.link)) continue;
  const c = census(row.link);
  if (c) { n++; console.log(`digest ${row.group}`, row.link, JSON.stringify(c)); }
}
console.log('digest rows with an FM EP:', n, 'of', digest.rows.length);
const house = process.argv.indexOf('--house');
if (house > 0) {
  const N = +process.argv[house + 1];
  let with_ = 0, edged = 0, all = 0;
  for (let s = 1; s <= N; s++) for (let t = 1; t <= 3; t++) {
    all++;
    const c = census(`seed=${s}&v=2${t > 1 ? `&theme=${t}` : ''}`);
    if (c) { with_++; if (c.edge > 0 && !c.clean.length) edged++; }
  }
  console.log(`house: ${with_} of ${all} themes play an FM EP the edge may read, ${edged} through an edge`);
}

const CORNER = {
  Trance: 'em:0.83,ti:0.62,ze:0.60,ro:0.62,gl:0.62,ve:0.55,sp:0.42,lo:0.82',
  dark: 'em:0.86,ti:0.50,ze:0.45,ro:0.72,gl:0.18,ve:0.66,sp:0.43,lo:0.72',
  bright: 'em:0.82,ti:0.78,ze:0.72,ro:0.55,gl:0.92,ve:0.45,sp:0.33,lo:0.92',
};
const corner = process.argv.indexOf('--corner');
if (corner > 0) {
  const N = +process.argv[corner + 1];
  for (const [name, spell] of Object.entries(CORNER)) {
    let with_ = 0, all = 0;
    for (let s = 1; s <= N; s++) for (let t = 1; t <= 4; t++) {
      all++;
      const link = `seed=${s}&v=2${t > 1 ? `&theme=${t}` : ''}&spell=${spell}`;
      const c = census(link);
      if (c) { with_++; console.log(`corner ${name}`, link, JSON.stringify(c)); }
    }
    console.log(`corner ${name}: ${with_} of ${all} themes play an FM EP`);
  }
}
