// trance-drawn (11-04): the saw's solo jobs: three chords held (i, VI, VII, then i: two bars each, his "three chords at
// best"), voiced four notes as one line, on today's held saw, today's gritty one and the smooth one, at the Trance
// tile's tempo; written as a job file for tools/trance-drawn-render.ts (its `events`).
//   node tools/trance-drawn-saw-jobs.ts <out.json>
import fs from 'node:fs';
import { voiceHeld, scaleNote } from '../packages/deep-house/src/theory.ts';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
const LINK = 'seed=1&v=2&spell=em:0.83,ti:0.62,ze:0.60,ro:0.62,gl:0.62,ve:0.55,sp:0.42,lo:0.82';
const read = linkRead(`?${LINK}`);
const cast = recipesFor({ masterSeed: '1', strategy: read.link.strategy, search: `?${read.search}` });
const t = planTheme('1', read.link.theme, { preset: 'auto', strategy: read.link.strategy, spell: cast.spell, recipe: cast.track, trance: 'off' } as never) as any;
const bs = t.barSeconds, root = 57, minor = [0, 2, 3, 5, 7, 8, 10];
const chords = [0, 5, 6, 0];
const VOICES: Record<string, { layer: string; gain: number; p?: Record<string, unknown> }> = {
  supersawLead: { layer: 'pad', gain: 0.3, p: { timbre: 'supersawLead', release: 0.6 } },
  supersawGrit: { layer: 'keys', gain: 0.3, p: { light: 0.5, edge: 0.4, cutoffMul: 1 } },
  supersawSmooth: { layer: 'keys', gain: 0.3 },
};
const jobs = [];
for (const [v, x] of Object.entries(VOICES)) {
  const events = [];
  let top: number | null = null;
  chords.forEach((d, i) => {
    const pcs = [0, 2, 4].map((k) => scaleNote(root, minor, d + k) % 12);
    const notes = voiceHeld(pcs, 4, [67, 74], top, null);
    top = notes[notes.length - 1];
    for (const m of notes) events.push({ t: (8 + i * 2) * bs, voice: v, bar: 8 + i * 2, step: 0, layer: x.layer, p: { midi: m, dur: 2 * bs - 0.02, vel: 0.75, gain: x.gain, reverb: 0.5, delay: 0.1, ...(x.p ?? {}) } });
  });
  jobs.push({ name: `saw-solo-${v}`, link: LINK, trance: 'off', fromBar: 8, toBar: 16, tail: 1.5, events });
}
fs.writeFileSync(process.argv[2], JSON.stringify(jobs));
console.log(jobs.length, 'jobs');
