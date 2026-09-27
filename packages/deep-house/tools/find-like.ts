// find-like.ts — the tracks nearest a fingerprint, by brute force over seeds.
//
//   node tools/find-like.ts <fingerprint.json> [--spell <spell>] [--strategy house-v2]
//        [--seeds 1-3000] [--themes 0-5] [--top 10] [--json <out>]
//   nice -n 18 node tools/find-like.ts <fingerprint.json> ... --render --site tmp/like/site [--port 7333]
//
// Plans every seed x theme under the spell (the fingerprint's own by default,
// read off its link; themes counted from nought here, and written from one in
// the links it prints), measures each plan's structural facts
// (`like/features.ts`), and ranks by the weighted plan distance:
//
//   identity 3   drums on or off, the roles present
//   tempo    3   bpm, log-scaled (0.4 octave = 1)
//   form     2   section kinds' shares, the intro's length, each role's share of bars
//   density  2   notes per sounding bar per role, and the onset spacing (chord rhythm)
//   harmony  1   mode, and the tonic on the circle of fifths
//   register 1   each role's median pitch (an octave = 1)
//   hold     1   each role's median hold (a factor of four = 1)
//   cast     4   voices per role, pad/lead timbres, keys preset, scene, texture,
//                room -- **only when the candidate's engine is the fingerprint's**
//
// With `--render` the top N are rendered (their 32-bar loudness window, the
// mix, plus the texture and bass roles alone for the texture's level under the
// bass), two at a time in headless Chromium reniced to the back of the queue,
// and re-ranked by `0.6 * audio + 0.4 * plan`; the audio distance is the LTAS
// shape (3), LUFS (1), the sub share (1) and the texture under the bass (1).
// The audio is the final judge: after an engine change the plan's structural
// terms find the neighbourhood and the render says which of them sounds alike.
//
// A plan is ~6 ms, so seeds 1-3000 x 6 themes is about two minutes. The
// fingerprint is taken on the build it was written on; see `fingerprint.ts`.

import fs from 'node:fs';
import path from 'node:path';
import { serveSite, openPage } from './imprint/render.ts';
import { coordinateOf, linkOf, planOf, musicOf, engineOf, planDistance, audioDistance, windowAudio, WEIGHTS, AUDIO_SHARE } from './like/features.ts';
import { parseSpell } from '../src/spell.ts';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes(`--${k}`);
const range = (s) => { const [a, b] = String(s).split('-').map(Number); return [a, b ?? a]; };
const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: node tools/find-like.ts <fingerprint.json> [--spell s] [--seeds 1-3000] [--themes 0-5] [--top 10] [--render --site dir]'); process.exit(2); }

const fp = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const own = coordinateOf(fp.taken.link);
const spell = arg('spell', null) ? parseSpell(arg('spell', null)) : own.spell;
const strategy = arg('strategy', own.strategy);
const [s0, s1] = range(arg('seeds', '1-3000'));
const [t0, t1] = range(arg('themes', '0-5'));
const TOP = +arg('top', 10);

const quiet = (fn) => { const keep = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return fn(); } finally { [console.log, console.info, console.warn] = keep; } };

const began = Date.now();
const rows = [];
let failed = 0;
for (let s = s0; s <= s1; s++) {
  for (let t = t0; t <= t1; t++) {
    const c = { seed: String(s), theme: t, strategy, spell };
    try {
      const cand = quiet(() => { const { track, program } = planOf(c); return { music: musicOf(track, program), engine: engineOf(c, track, program) }; });
      const { d, groups } = planDistance(fp, cand);
      rows.push({ c, d, groups });
    } catch (e) { failed++; }
  }
  if (s % 250 === 0) process.stdout.write(`  seed ${s} (${((Date.now() - began) / 1000).toFixed(0)} s)\n`);
}
rows.sort((a, b) => a.d - b.d);
console.log(`  ${rows.length} plans in ${((Date.now() - began) / 1000).toFixed(0)} s${failed ? `, ${failed} refused` : ''}; weights ${JSON.stringify(WEIGHTS)}`);
const selfAt = rows.findIndex((r) => r.c.seed === own.seed && r.c.theme === own.theme);
if (selfAt >= 0) console.log(`  the fingerprint's own coordinate ranks ${selfAt + 1} at plan distance ${rows[selfAt].d.toFixed(4)}`);

let top = rows.slice(0, TOP);
if (flag('render')) {
  const port = +arg('port', 7333);
  const server = await serveSite(port, arg('site', 'tmp/like/site'));
  const pages = [await openPage(port), await openPage(port)];
  try {
    let next = 0;
    await Promise.all(pages.map(async (br) => {
      while (next < top.length) {
        const r = top[next++];
        const { track, program } = quiet(() => planOf(r.c));
        r.audio = await windowAudio(br.page, r.c, track, program);
        const a = audioDistance(fp.audio.window, r.audio);
        r.ad = a.d; r.agroups = a.groups;
        r.score = AUDIO_SHARE * a.d + (1 - AUDIO_SHARE) * r.d;
        console.log(`  rendered ${r.c.seed} t${r.c.theme + 1}: audio ${a.d.toFixed(3)}`);
      }
    }));
  } finally { for (const p of pages) await p.close(); server.close(); }
  top = top.sort((a, b) => a.score - b.score);
}

console.log(`\n  nearest to ${fp.taken.link} (taken on ${fp.taken.build}, ${fp.taken.date}) under ${strategy}${spell ? '' : ', the house'}:`);
top.forEach((r, i) => {
  const g = Object.entries(r.groups).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  ${String(i + 1).padStart(2)}. ${r.score != null ? `score ${r.score.toFixed(3)}  audio ${r.ad.toFixed(3)}  ` : ''}plan ${r.d.toFixed(3)}  ${linkOf(r.c)}${g ? `   (${g}${r.agroups ? `; audio ${Object.entries(r.agroups).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''})` : ''}`);
});
if (arg('json', null)) fs.writeFileSync(path.resolve(arg('json', null)), JSON.stringify(top.map((r) => ({ link: linkOf(r.c), plan: +r.d.toFixed(4), groups: r.groups, audio: r.ad ?? null, audioGroups: r.agroups ?? null, score: r.score ?? null })), null, 1) + '\n');
