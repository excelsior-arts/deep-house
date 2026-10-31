// phrase-sketch.ts — a lead's phrase rows as sketches for the ear (round trance-2, 10-28: *"come up with bunch of
// simplified options for me to choose from"*).
//
//   node tools/phrase-sketch.ts --site <built site> --out <dir> [--port 7600] [--rows a,b] [--seed 1] [--theme 0]
//        [--spell em:0.83,...] [--from 72] [--bars 16] [--trims row:dB,...] [--tones row:light:edge,...]
//        [--harmony row=2:0,4:4,2:5] [--pedal row,...] [--drums] [--dry]
//
// `--tones` sets a row's light and edge (Gleam's and Spark's ends) in place of the theme's; `--harmony` plays a row over
// the key's own chords in a rhythm of its own (beats:scale degree, cycled; the theme's chords elsewhere); `--pedal` lays a
// row's context bass as off-beat eighths on the key's tonic in place of the theme's line (source 10's bass); `--drums`
// renders each row's context without the phrase (`<row>-drums.wav`), to read the phrase's level against it; `--dry` sends
// the phrase to no reverb and no delay.
//
// Each row of `recipes/arrangement/phrases.json` (`src/phrase.ts` places it) over a theme's own chords at its tempo, on
// the hook's voice with the hook's own tone and level at that theme (its riff's notes in the window, or its first):
// `<row>-solo.wav`, the phrase alone, and `<row>-context.wav`, the same bars with the theme's kick, bass and hats.
// Rendered offline through the real graph in one headless, muted Chromium on the silent route (`imprint/render.ts`),
// two bars of pre-roll thrown away. Level-matching is the caller's (the files are as rendered).
import fs from 'node:fs';
import path from 'node:path';
import { serveSite, openPage, pcmOf, wav } from './imprint/render.ts';
import { planTheme } from '../src/mix.ts';
import { asSpell, type Spell } from '../src/spell.ts';
import { chordAtBar, noteName } from '../src/theory.ts';
import { PHRASE_ROWS, phraseBar, type PhraseRow } from '../src/phrase.ts';
import { HOOK_VOICE } from '../src/hook.ts';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BIRD: Record<string, string> = { em: 'ember', ti: 'tide', ze: 'zephyr', ro: 'root', gl: 'gleam', ve: 'veil', sp: 'spark', lo: 'loom' };
const spellOf = (s: string): Spell => asSpell(Object.fromEntries(s.split(',').map((kv) => { const [k, v] = kv.split(':'); return [BIRD[k], +v]; })) as Partial<Spell>);

const SITE = arg('site'), OUT = arg('out');
if (!SITE || !OUT) { console.error('usage: node tools/phrase-sketch.ts --site <dir> --out <dir> [--port 7600] [--rows a,b] [--seed 1] [--theme 0] [--spell ...] [--from 72] [--bars 16]'); process.exit(2); }
const PORT = +(arg('port', '7600')!), SEED = arg('seed', '1')!, THEME = +(arg('theme', '0')!);
const SPELL = spellOf(arg('spell', 'em:0.83,ti:0.62,ze:0.60,ro:0.62,gl:0.62,ve:0.55,sp:0.42,lo:0.82')!);
const FROM = +(arg('from', '72')!), BARS = +(arg('bars', '16')!), PRE = 2, RATE = 48000;
const ROWS = arg('rows') ? PHRASE_ROWS.filter((r) => arg('rows')!.split(',').includes(r.id)) : PHRASE_ROWS;
const CONTEXT = ['kick', 'bass', 'hats'];
const listArg = (k: string) => (arg(k) ?? '').split(/[,;]/).filter(Boolean);
const TONES: Record<string, { light: number; edge: number }> = Object.fromEntries(listArg('tones').map((kv) => { const [k, l, e] = kv.split(':'); return [k, { light: +l, edge: +e }]; }));
const HARMONY: Record<string, Array<[number, number]>> = Object.fromEntries((arg('harmony') ?? '').split(';').filter(Boolean)
  .map((h) => { const [k, v] = h.split('='); return [k, v.split(',').map((x) => x.split(':').map(Number) as [number, number])]; }));
const PEDAL = new Set(listArg('pedal'));
// a row's level in the render, dB (`--trims anthem-phrase:0,gated-chords:3`): the options set level with each other over the same drums
const TRIMS: Record<string, number> = Object.fromEntries((arg('trims') ?? '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split(':'); return [k, +v]; }));

const opts = { strategy: 'house-v2', spell: SPELL };
const track = planTheme(SEED, THEME, opts) as unknown as {
  bpm: number; barSeconds: number; beat: number; progression: { root: number; scale: number[] } & Parameters<typeof chordAtBar>[0];
  events: Array<{ t: number; voice: string; layer: string; bar: number; p: Record<string, unknown>; frontDb?: number }>;
};
const bs = track.barSeconds, stepS = bs / 16, key = ((track.progression.root % 12) + 12) % 12;
const scalePcs = track.progression.scale.map((i) => (key + i) % 12);
const chordAt = (b: number) => { const c = chordAtBar(track.progression, FROM + b); return { rootMidi: c.rootMidi, notes: c.notes, scalePcs, label: c.label as string }; };
/** the key's seventh chord on a scale degree, rooted from E3 up */
const degreeChord = (d: number) => {
  const sc = track.progression.scale, deg = (k: number) => sc[k % 7] + 12 * Math.floor(k / 7);
  let root = 48 + key + sc[d % 7]; if (root < 50) root += 12;
  const notes = [0, 2, 4, 6].map((k) => root + deg(d + k) - sc[d % 7]);
  return { rootMidi: root, notes, scalePcs, label: `${noteName(root)}·${d + 1}` };
};
/** a row's chords: the theme's, or the row's own rhythm over the key's chords (`--harmony`) */
const chordsOf = (id: string) => {
  const H = HARMONY[id];
  if (!H) return (b: number) => chordAt(b);
  const cycle = H.reduce((s, [beats]) => s + beats, 0);
  return (b: number, step = 0) => {
    let at = (b * 4 + Math.floor(step / 4)) % cycle;
    for (const [beats, d] of H) { if (at < beats) return degreeChord(d); at -= beats; }
    return degreeChord(H[0][1]);
  };
};
// the hook's own tone and level at this theme: its riff's in the window, else its gate's, else its first note's
const hookIn = track.events.filter((e) => e.voice === HOOK_VOICE && e.p.hook);
const pick = (part: string) => hookIn.find((e) => e.p.hook === part && e.bar >= FROM && e.bar < FROM + BARS) ?? hookIn.find((e) => e.p.hook === part);
const lead = pick('riff') ?? pick('gate') ?? hookIn[0];
if (!lead) { console.error(`theme ${SEED}/${THEME} plays no hook: no tone to borrow`); process.exit(1); }
const gateT = pick('gate') ?? lead;
const tone = (e: typeof lead) => ({ light: e.p.light, edge: e.p.edge, reverb: e.p.reverb, delay: e.p.delay, gain: e.p.gain });

/** A row over `bars` bars: each bar's notes (`phraseBar`), the bar counted from the statement's first. */
const statement = (row: PhraseRow, chords: (b: number, step?: number) => ReturnType<typeof chordAt>, bars: number) =>
  Array.from({ length: bars }, (_, b) => phraseBar(row, b, (st) => chords(b, st)).map((n) => ({ ...n, bar: b, part: 'lead', levelDb: 0 }))).flat();
fs.mkdirSync(OUT, { recursive: true });
const server = await serveSite(PORT, SITE) as { close: () => void };
const browser = await openPage(PORT);
console.log(`seed ${SEED} theme ${THEME}: ${track.bpm} BPM, bars ${FROM}-${FROM + BARS - 1}: ${Array.from({ length: Math.min(8, BARS) }, (_, b) => chordAt(b).label).join(' ')}`);
for (const row of ROWS) {
  const chords = chordsOf(row.id);
  const notes = statement(row, chords, BARS);
  const T = TONES[row.id];
  if (HARMONY[row.id]) console.log(`  ${row.id} over its own chords: ${Array.from({ length: 8 }, (_, k) => chords(Math.floor(k / 2), (k % 2) * 8).label).join(' ')} (by half bar)`);
  // source 10's bass where asked: off-beat eighths on the key's tonic, the theme's own bass voice and level
  const bassT = track.events.find((e) => e.layer === 'bass' && e.bar >= FROM);
  const pedal = PEDAL.has(row.id) && bassT ? Array.from({ length: BARS * 4 }, (_, k) => ({ t: FROM * bs + k * 4 * stepS + 2 * stepS, voice: bassT.voice,
    p: { midi: 36 + key - (key > 7 ? 12 : 0), dur: +(1.6 * stepS).toFixed(4), vel: 0.85 }, bar: FROM + Math.floor(k / 4), step: (k % 4) * 4 + 2, layer: 'bass', note: '' })) : [];
  const events = notes.map((n) => {
    const base = n.gate ? gateT : lead;
    const answer = false;
    const gain = +(Number(base.p.gain) * 10 ** (((TRIMS[row.id] ?? 0) + n.levelDb) / 20)).toFixed(5);
    const p: Record<string, unknown> = answer
      ? { midi: n.midi, dur: +(n.durSteps * stepS).toFixed(4), vel: n.vel, gain }
      : { midi: n.midi, dur: +(n.durSteps * stepS).toFixed(4), vel: n.vel, hook: n.gate ? 'gate' : 'riff', cutoffMul: n.cutoffMul, ...tone(base), ...(T ?? {}),
        ...(n.gate ? { gate: { ...n.gate, stepS: +stepS.toFixed(5) } } : {}), gain, ...(process.argv.includes('--dry') ? { reverb: 0, delay: 0 } : {}) };
    return { t: (FROM + n.bar) * bs + n.step * stepS, voice: HOOK_VOICE, p, bar: FROM + n.bar, step: n.step, layer: 'keys', note: noteName(n.midi), frontDb: base.frontDb };
  });
  for (const ctx of process.argv.includes('--drums') ? [true] : [false, true]) {
    const r = await browser.page.evaluate(async (job) => {
      const dh = (window as unknown as { deepHouse: Record<string, (...a: unknown[]) => unknown> }).deepHouse;
      const tr = dh.planTheme(job.seed, job.theme, job.opts) as { events: Array<{ t: number; layer: string }> };
      const keep = job.layers.length ? tr.events.filter((e) => job.layers.includes(e.layer) && !(job.pedal.length && e.layer === 'bass') && e.t >= job.t0 - 1e-9 && e.t < job.t1) : [];
      const events = [...keep, ...(job.layers.length ? job.pedal : []), ...job.events].sort((a, b) => a.t - b.t);
      const program = dh.programOf({ ...tr, events }) as unknown;
      const slice = dh.sliceProgram(program, { from: job.tp, to: job.t1, tail: 1.5 });
      const buf = await (dh.renderProgram(slice, { sampleRate: job.rate }) as Promise<AudioBuffer>);
      const a = Math.round((job.t0 - job.tp) * job.rate);
      const L = buf.getChannelData(0).subarray(a), R = buf.getChannelData(1).subarray(a);
      const n = L.length, pcm = new Int16Array(n * 2);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        pcm[i * 2] = Math.round(l * 32767); pcm[i * 2 + 1] = Math.round(r * 32767);
      }
      const bytes = new Uint8Array(pcm.buffer), chunks: string[] = [];
      for (let o = 0; o < bytes.length; o += 1 << 20) {
        let s = '';
        const end = Math.min(bytes.length, o + (1 << 20));
        for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
        chunks.push(btoa(s));
      }
      return { chunks, peak: +(20 * Math.log10(peak + 1e-30)).toFixed(2), kept: keep.length };
    }, { seed: SEED, theme: THEME, opts, events: process.argv.includes('--drums') ? [] : events, pedal, layers: ctx ? CONTEXT : [], tp: (FROM - PRE) * bs, t0: FROM * bs, t1: (FROM + BARS) * bs, rate: RATE });
    const file = path.join(OUT, process.argv.includes('--drums') ? `${row.id}-drums.wav` : `${row.id}-${ctx ? 'context' : 'solo'}.wav`);
    fs.writeFileSync(file, wav(pcmOf(r), RATE));
    console.log(`  ${path.basename(file)}: ${notes.length} phrase notes${ctx ? `, ${r.kept} of kick, bass and hats` : ''}, peak ${r.peak} dBFS`);
  }
}
await browser.close();
server.close();
