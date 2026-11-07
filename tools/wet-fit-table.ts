// **How wet a voice can be taken, measured** (round dark-fronts' ninth pass, his ear 11-04 on Drive - Cloudburst's next
// theme: the saw stab at Tide 0.9 "sounds fairly dry … what if we actually research on making it maximum wet on this
// Tide bird"; and on the reply: "max wet should be taken responsibly, maybe for known voices that we know will perform
// archetypically fine"). A lab tool: every voice of the keys, pad and bass lanes, alone, one short note (a quarter of a
// second, as a stab is played; the house's room; a mid pitch for the keys and the pads, a low one for the bass), rendered
// offline in a muted headless page, read for what decides whether its repeats and its room can carry it:
//
//   onset  the milliseconds from the note's start to the loudest 10 ms of it: a struck sound peaks at once, a pad or a
//          swelled voice late, and a repeat of a late peak is a smear, not an echo;
//   tail   the share of its energy sounding 0.6 s after it starts, the note long released: a voice that stops leaves its
//          echoes room; a bell or a bowl rings on under them;
//   low    the share under 200 Hz (the note rendered again through two fourth-order low-passes' worth): a voice with a
//          low end would queue its bottom under the reese's.
//
// The plan reads the table (`src/dark-fronts.ts` `wetCeiling`), beside the notes' own sparseness and register.
//
//   node tools/wet-fit-table.ts <site> <port>      (writes packages/engine/src/voices/wet-fit.json)

import fs from 'node:fs';
import { serveSite, openPage } from '../packages/deep-house/tools/imprint/render.ts';
import { recipesFor } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
import { BY_NAME } from '@deep-house/engine/voices';

const [site, port] = [process.argv[2], +process.argv[3]];
const OUT = new URL('../packages/engine/src/voices/wet-fit.json', import.meta.url);
const LINK = 'seed=1&v=2';
const lanes: Record<string, number> = { keys: 60, pad: 60, bass: 40 };
const voices = Object.entries(BY_NAME as Record<string, { row?: { descriptor?: { layer?: string } }; descriptor?: { layer?: string } }>)
  .map(([n, v]) => [n, (v.row?.descriptor ?? v.descriptor)?.layer ?? ''] as const).filter(([, l]) => l in lanes);

const RUN = async ({ job, voice, midi }: { job: { seed: string; theme: number; opts: unknown }; voice: string; midi: number }) => {
  const dh = (window as unknown as { deepHouse: Record<string, any> }).deepHouse;
  const t = dh.planTheme(job.seed, job.theme, job.opts);
  const settings = dh.settingsOf(t);
  const fn = dh.voices[voice];
  const sr = 48000, secs = 6;
  const one = async (low: boolean) => {
    const ctx = new OfflineAudioContext(2, sr * secs, sr);
    let tail: AudioNode = ctx.destination;
    if (low) for (let k = 0; k < 4; k++) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 200; f.Q.value = k % 2 ? 1.3066 : 0.5412; f.connect(tail); tail = f; }
    const g = ctx.createGain(); g.connect(tail);
    const nul = ctx.createGain(); nul.gain.value = 0; nul.connect(ctx.destination);
    fn(ctx, { dry: g, delay: nul, reverb: nul }, 0.05, { midi, vel: 0.8, gain: 0.35, dur: 0.25 }, settings);
    const b = await ctx.startRendering();
    const L = b.getChannelData(0), R = b.getChannelData(1);
    let all = 0, late = 0, peak = 0, peakAt = 0;
    const at = Math.round((0.05 + 0.6) * sr), w = Math.round(0.01 * sr), s0 = Math.round(0.05 * sr);
    for (let i = 0; i < L.length; i++) { const e = L[i] * L[i] + R[i] * R[i]; all += e; if (i >= at) late += e; }
    for (let i = s0; i + w < Math.min(L.length, s0 + 2 * sr); i += w) { let e = 0; for (let j = i; j < i + w; j++) e += L[j] * L[j] + R[j] * R[j]; if (e > peak) { peak = e; peakAt = i - s0; } }
    return { all, late, onset: (1000 * peakAt) / sr };
  };
  const raw = await one(false), lo = await one(true);
  return { tail: raw.all > 0 ? raw.late / raw.all : null, low: raw.all > 0 ? lo.all / raw.all : null, onset: raw.onset, energy: raw.all };
};

const server = await serveSite(port, site) as { close: () => void };
const b = await openPage(port);
const rows: Record<string, { lane: string; onset: number; tail: number; low: number }> = {};
try {
  const read = linkRead(`?${LINK}`);
  const L = read.link, seed = L.seed ?? '1';
  const cast = recipesFor({ masterSeed: seed, strategy: L.strategy, search: `?${read.search}` });
  const job = { seed, theme: L.theme, opts: { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track } };
  for (const [voice, lane] of voices) {
    try {
      const r = await b.page.evaluate(RUN, { job, voice, midi: lanes[lane] });
      if (r.tail == null || !(r.energy > 1e-9)) { console.log(voice, 'silent'); continue; }
      rows[voice] = { lane, onset: Math.round(r.onset), tail: +r.tail.toFixed(3), low: +Math.min(1, r.low!).toFixed(3) };
      console.log(voice, lane, rows[voice].onset, rows[voice].tail, rows[voice].low);
    } catch (e) { console.log(voice, 'failed', String(e).slice(0, 80)); }
  }
} finally { await b.close(); server.close(); }
fs.writeFileSync(OUT, JSON.stringify({ schema: 1, kind: 'wetFit', note: 'MEASURED (round dark-fronts, ninth pass, 11-04) by tools/wet-fit-table.ts: each voice of the keys, pad and bass lanes alone, one note a quarter of a second long (MIDI 60, the bass 40) in the house room of seed 1: `onset` the milliseconds to its loudest 10 ms, `tail` the share of its energy sounding 0.6 s after it starts, `low` the share under 200 Hz. What the plan reads to decide how wet Tide may take a voice (src/dark-fronts.ts).', voices: rows }, null, 1) + '\n');
console.log('wrote', Object.keys(rows).length);
