// keys-moments-sketch.ts — the keys' moments as sketches for the ear (round keys-moments, 10-29: *"piano solo moment, or
// some motif that not necessary following the same phrase across the track"*; *"see if we can make good technique for
// piano solo or featured riff and see how it flies"*).
//
//   node tools/keys-moments-sketch.ts --site <built site> --out <dir> [--port 7690] [--only id,id] [--list]
//
// Each option is a featured track's own plan with its keys replaced over a few bars and nothing else touched: the notes
// written here by hand (a solo, a second riff) or today's keys edited (the return's one new feature). The new notes are
// struck on the track's own piano (its first keys event, every parameter cloned: the voice, its room, its gain, its
// stage), so the piano's sound and level are the track's; only the notes, their lengths, their touch and their timing are
// the sketch's. Rendered offline through the real graph in one headless, muted Chromium on the silent route
// (`imprint/render.ts`), two bars of pre-roll thrown away, three files an option: `<id>-today.wav` (the scene as it is),
// `<id>-scene.wav` (the scene with the sketch) and `<id>-solo.wav` (the keys alone), and `<id>-today-solo.wav` for the
// level reading. The files are as rendered; the level-matching is the caller's.
//
// A note: [bar, sixteenth, notes ('Eb4' or a chord 'G#3 C4 D#4', struck low to high), beats held, velocity,
//          ms early (−) or late (+) against the grid (the rubato), the pedal: beats it rings past its end].
import fs from 'node:fs';
import path from 'node:path';
import { serveSite, openPage, pcmOf, wav } from './imprint/render.ts';
import { planTheme, recipesFor } from '../src/mix.ts';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RATE = 48000, PRE = 2;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
const midiOf = (n: string) => { const m = /^([A-G][b#]?)(-?\d)$/.exec(n)!; const pc = NAMES.indexOf(FLAT[m[1]] ?? m[1]); return pc + 12 * (+m[2] + 1); };
const nameOf = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

type Note = [bar: number, step: number, notes: string, beats: number, vel: number, ms?: number, ring?: number];
type Ev = { t: number; voice: string; p: Record<string, any>; bar: number; step: number; layer: string; note?: string; [k: string]: any };

const TRACKS: Record<string, { name: string; link: string }> = {
  sunrise: { name: 'Vibe - Sunrise', link: 'seed=97369&v=2&spell=em:0.37,ti:0.17,ze:0.32,gl:0.16,ve:0.00,sp:0.10,lo:0.34' },
  'control-panel': { name: 'Vibe - Drizzle', link: 'seed=1557&v=2&spell=em:0.53,ti:1.00,ze:0.00,gl:0.46,ve:0.11,sp:0.45,lo:0.71' },
};

// --- the sketches -----------------------------------------------------------------------------------------------------

// 1. Vibe - Sunrise, a solo in the breakdown's last eight bars (36-43): the pad and the closed hat only, no kick, no
// bass. Today the thin chords ring at 36 and 42. The piano leads alone: the part's own chords struck softly at each
// chord's line (Abmaj9 36-39, Cm9 40-43, its voicings), and above them a line in two calls and two answers, Eb4 to C5,
// chord tones on the strong beats, steps with a leap, long notes where a phrase lands, late into each phrase and later
// still at the cadence (a ritardando inside the grid); it lands on the Cm chord at 43 and steps back for the build's
// statement at 44.
const SUNRISE_SOLO: Note[] = [
  // the call (36-37, Abmaj9)
  [36, 0, 'G#3 C4 D#4', 8, 0.22, 0, 2],
  [36, 2, 'Eb4', 1, 0.36, 30], [36, 6, 'G4', 0.5, 0.38, 15], [36, 8, 'Ab4', 0.5, 0.36, 5], [36, 10, 'Bb4', 1.5, 0.43, 20],
  [36, 14, 'Ab4', 0.5, 0.34, -5], [37, 0, 'G4', 2, 0.40, 35], [37, 8, 'Eb4', 1, 0.31, 15], [37, 12, 'F4', 0.5, 0.30, 0], [37, 14, 'G4', 0.5, 0.33, -10],
  // the answer (38-39), reaching up to C5 and settling on Eb4
  [38, 0, 'G#3 D#4', 8, 0.20, 10, 2],
  [38, 0, 'C5', 1.5, 0.45, 25], [38, 6, 'Bb4', 0.5, 0.37, 5], [38, 8, 'Ab4', 1, 0.37, 10], [38, 12, 'G4', 0.5, 0.33, 0], [38, 14, 'Ab4', 0.5, 0.34, -5],
  [39, 0, 'Bb4', 1.5, 0.40, 30], [39, 6, 'G4', 0.5, 0.33, 10], [39, 8, 'Eb4', 1.5, 0.35, 40], [39, 14, 'D4', 0.5, 0.29, 10],
  // the second call (40-41, Cm9), more movement
  [40, 0, 'D#3 G3 C4', 8, 0.22, 15, 2],
  [40, 0, 'Eb4', 1, 0.37, 25], [40, 4, 'G4', 1, 0.39, 10], [40, 8, 'Bb4', 1.5, 0.43, 15], [40, 14, 'C5', 0.5, 0.38, -5],
  [41, 0, 'Bb4', 1, 0.40, 30], [41, 4, 'G4', 1, 0.35, 10], [41, 8, 'F4', 0.5, 0.33, 5], [41, 10, 'Eb4', 0.5, 0.32, 0], [41, 12, 'D4', 1, 0.33, 20],
  // the cadence (42-43): slower, softer, landing on the chord, then the piano steps back
  [42, 0, 'Eb4', 2, 0.35, 45], [42, 8, 'D4', 1, 0.30, 60], [42, 12, 'Bb3', 1, 0.28, 70],
  [43, 0, 'D#3 G3 C4', 4, 0.26, 80, 2],
];

// 4. Vibe - Drizzle, a solo in the breakdown's last eight bars (44-51): twenty-four bars of the pad alone today,
// the hook absent so its return at 52 is an event. The piano leads alone with a line made of the hook's own notes
// (F, G, C, F) and their neighbours in the key (Ab, Bb, Eb), over its own soft chords every two bars (Fm7, Eb over G,
// Fm, Ab: the dorian colour the pad's Fm9 already holds), two calls and two answers, a peak on Eb5 in the third, and
// it slows into C4 at 51, the breath before the hook comes back whole at 52.
const CP_SOLO: Note[] = [
  [44, 0, 'F3 G#3 D#4', 8, 0.40, 0, 2],
  [44, 4, 'C5', 1, 0.62, 25], [44, 8, 'Bb4', 0.5, 0.52, 10], [44, 10, 'Ab4', 0.5, 0.52, 0], [44, 12, 'G4', 1, 0.58, 10],
  [45, 0, 'F4', 2, 0.62, 35], [45, 8, 'G4', 0.5, 0.52, 10], [45, 10, 'Ab4', 0.5, 0.54, 0], [45, 12, 'C5', 1, 0.64, -10],
  [46, 0, 'G3 A#3 D#4', 8, 0.38, 15, 2],
  [46, 0, 'Bb4', 1.5, 0.62, 30], [46, 6, 'Ab4', 0.5, 0.52, 5], [46, 8, 'G4', 1, 0.56, 10], [46, 12, 'Eb4', 1, 0.52, 15],
  [47, 0, 'F4', 1.5, 0.58, 35], [47, 6, 'G4', 0.5, 0.50, 5], [47, 8, 'C4', 1.5, 0.54, 25], [47, 14, 'F4', 0.5, 0.48, -10],
  [48, 0, 'F3 G#3 C4', 8, 0.40, 15, 2],
  [48, 0, 'G4', 0.75, 0.60, 25], [48, 3, 'Ab4', 0.75, 0.58, 10], [48, 6, 'C5', 1.5, 0.66, 15], [48, 12, 'Eb5', 1, 0.66, 30],
  [49, 0, 'C5', 1.5, 0.62, 25], [49, 6, 'Bb4', 0.5, 0.52, 5], [49, 8, 'Ab4', 1, 0.54, 10], [49, 12, 'G4', 1, 0.52, 15],
  [50, 0, 'G#3 C4 D#4', 8, 0.36, 20, 1],
  [50, 0, 'F4', 1, 0.58, 30], [50, 4, 'G4', 0.5, 0.50, 10], [50, 6, 'Ab4', 0.5, 0.52, 10], [50, 8, 'G4', 1, 0.52, 30], [50, 12, 'Eb4', 1, 0.48, 45],
  [51, 0, 'F3 G#3 C4', 2.5, 0.42, 70, 0.5],
];

// 5. Vibe - Drizzle, a second riff in the long second main (52-91: the hook forty bars unchanged today). For
// eight bars (68-75) the piano plays a figure made of the hook: the same notes and the same Fm9, its rhythm two bars
// long and squarer where the hook's is a bar and a half, its top climbing to C5 and Eb5 where the hook stays under G4,
// a call that rises and an answer that comes home through the hook's own C4 to F4. The hook comes back at 76.
const CP_RIFF_CELL: Array<[number, number, string, number, number, number?]> = [
  // bar A: the call, up to C5 held; bar B: the answer, home through C4 to F4 (the hook's own fall)
  [0, 0, 'F4', 0.75, 0.84], [0, 3, 'Ab4', 0.75, 0.76], [0, 6, 'C5', 1.5, 0.84], [0, 12, 'Bb4', 0.5, 0.74], [0, 14, 'Ab4', 0.5, 0.74],
  [1, 0, 'G4', 1, 0.80], [1, 4, 'F4', 0.5, 0.74], [1, 6, 'C4', 0.5, 0.80], [1, 8, 'F4', 2, 0.82],
  // bar A': the call reaching Eb5; bar B': the answer stepping down to F4 a beat later
  [2, 0, 'F4', 0.75, 0.84], [2, 3, 'Ab4', 0.75, 0.76], [2, 6, 'C5', 1, 0.82], [2, 10, 'Eb5', 0.5, 0.80], [2, 12, 'C5', 1, 0.78],
  [3, 0, 'Bb4', 1, 0.80], [3, 4, 'Ab4', 0.5, 0.74], [3, 6, 'G4', 1, 0.76], [3, 10, 'F4', 1.5, 0.82],
];
const CP_RIFF: Note[] = [0, 4].flatMap((o) => CP_RIFF_CELL.map(([b, s, n, beats, v]): Note => [68 + o + b, s, n, beats, v, 0]));

// 3. Vibe - Sunrise, a second riff for the drop (52-59): today the drop states the ringing chords as the main does
// (four a phrase, each ringing two bars). The riff is the same chords in the part's own register (its voicings' tones,
// E3 to Ab4), a new rhythm and a moving top: a bar of three short chords on 3+3+2 (sixteenths 0, 6, 12) whose top
// walks by step, then a bar that answers with a short chord and a long one; over Abmaj9 the top climbs Eb4-F4-G4,
// over Cm9 it falls G4-F4-Eb4, each pair landing a different way. Short under the pedal; the landings ring.
const SUNRISE_RIFF_TOPS: Array<[bar: number, tops: string[], kind: 'x' | 'y']> = [
  [52, ['D#4', 'F4', 'G4'], 'x'], [53, ['G4', 'D#4'], 'y'],
  [54, ['D#4', 'F4', 'G4'], 'x'], [55, ['G#4', 'G4'], 'y'],
  [56, ['G4', 'F4', 'D#4'], 'x'], [57, ['D4', 'D#4'], 'y'],
  [58, ['G4', 'F4', 'D#4'], 'x'], [59, ['F4', 'G4'], 'y'],
];

// --- the options ------------------------------------------------------------------------------------------------------

/** The chord tones a riff's top sits on: the two nearest under it, never under E3 (the piano's low cut is 160 Hz). */
const under = (top: number, pcs: number[]) => { const out: number[] = []; for (let m = top - 1; m >= 52 && out.length < 2; m--) if (pcs.includes(m % 12)) out.push(m); return out.reverse(); };
// the seventh chords' tones (the ninth left to the pad, so a top never sits a step over its own ninth)
const ABMAJ9 = [8, 0, 3, 7], CM9 = [0, 3, 7, 10];

interface Option {
  id: string; track: string; about: string;
  /** the window rendered, in bars (`to` exclusive); the bars whose keys are replaced */
  window: [number, number]; replace: [number, number];
  /** the moment's bars, for the level reading */
  moment: [number, number];
  notes?: Note[];
  /** the pedal a written note without its own rings past its end, in beats (absent: the track's piano's own) */
  ring?: number;
  /** dB on the written notes' gain, so the moment's keys alone read at the track's own keys level (today's statement, ±0.5 LU) */
  trimDb?: number;
  /** today's keys in the replaced bars, edited (the return's feature) */
  edit?: (today: Ev[], bs: number) => Ev[];
}

const OPTIONS: Option[] = [
  { id: '1-sunrise-solo-breakdown', track: 'sunrise', window: [32, 48], replace: [36, 44], moment: [36, 44], notes: SUNRISE_SOLO, ring: 2, trimDb: -0.8,
    about: 'a solo in the breakdown: the piano alone over the pad for its last eight bars, then the statement at the build' },
  { id: '2-sunrise-return-anticipated', track: 'sunrise', window: [40, 56], replace: [43, 56], moment: [44, 56],
    about: 'the return with one new feature: the statement comes back at the build and again at the drop with its first chord struck an eighth early, on the last offbeat before the line, held across it',
    edit: (today, bs) => today.map((e) => (e.step === 0 && (e.bar === 44 || e.bar === 52))
      ? { ...e, t: e.t - bs / 8, bar: e.bar - 1, step: 14, p: { ...e.p, dur: e.p.dur + bs / 8, vel: e.p.vel * 1.08 } } : e) },
  { id: '3-sunrise-drop-riff', track: 'sunrise', window: [48, 64], replace: [52, 60], moment: [52, 60], trimDb: 2.2,
    about: 'a second riff for the drop: the same chords in the part\'s register, a new rhythm (3+3+2, then a short and a long) and a top that walks',
    notes: SUNRISE_RIFF_TOPS.flatMap(([bar, tops, kind]) => {
      const pcs = bar % 8 >= 4 ? ABMAJ9 : CM9; // Abmaj9 at 52-55, Cm9 at 56-59 (the theme's four-bar chords)
      const chord = (top: string) => [...under(midiOf(top), pcs), midiOf(top)].map(nameOf).join(' ');
      if (kind === 'x') return [[bar, 0, chord(tops[0]), 1.25, 0.34, 0, 0.5], [bar, 6, chord(tops[1]), 1.25, 0.29, 8, 0.5], [bar, 12, chord(tops[2]), 1, 0.31, 0, 0.5]] as Note[];
      return [[bar, 2, chord(tops[0]), 1, 0.28, 5, 0.5], [bar, 8, chord(tops[1]), 2, 0.34, 10, 1.5]] as Note[];
    }) },
  { id: '4-control-panel-solo-breakdown', track: 'control-panel', window: [40, 56], replace: [44, 52], moment: [44, 52], notes: CP_SOLO, trimDb: 1.3,
    about: 'a solo in the breakdown: the piano alone over the pad for its last eight bars, a line of the hook\'s notes, then the hook whole at 52' },
  { id: '5-control-panel-second-riff', track: 'control-panel', window: [64, 80], replace: [68, 76], moment: [68, 76], notes: CP_RIFF, trimDb: -2.9,
    about: 'a second riff in the long second main: eight bars of a figure made of the hook (its notes, a new two-bar rhythm, a higher top), then the hook again' },
  { id: '6-control-panel-return-octave', track: 'control-panel', window: [48, 64], replace: [52, 64], moment: [52, 64],
    about: 'the return with one new feature: the hook comes back whole at 52, and every second time round its last F4 is answered an octave up, an eighth later and softer',
    edit: (today, bs) => {
      // the hook's cell is a bar and a half: its landing F4 is the note after its C4; every second landing is answered
      const landings = today.filter((e, i) => e.p.midi === 65 && today[i - 1]?.p.midi === 60);
      const answers = landings.filter((_, i) => i % 2 === 1).map((e) => ({ ...e, t: e.t + bs / 8, step: e.step + 2, p: { ...e.p, midi: 77, vel: e.p.vel * 0.72, dur: e.p.dur * 0.8 }, note: 'F5' }));
      return [...today, ...answers];
    } },
];

// --- planning ---------------------------------------------------------------------------------------------------------

const quiet = <T>(f: () => T): T => { const k = [console.log, console.info, console.warn]; console.log = console.info = console.warn = () => {}; try { return f(); } finally { [console.log, console.info, console.warn] = k; } };
const planOf = (track: string) => quiet(() => {
  const q = new URLSearchParams(TRACKS[track].link), seed = q.get('seed')!;
  const cast = recipesFor({ masterSeed: seed, strategy: 'house-v2', search: '?' + TRACKS[track].link });
  const opts = { strategy: 'house-v2', spell: cast.spell, ...(cast.track ? { recipe: cast.track } : {}) };
  return { seed, theme: +(q.get('theme') ?? 1) - 1, opts, plan: planTheme(seed, +(q.get('theme') ?? 1) - 1, opts as any) as any };
});

/** The option's keys over its replaced bars: the notes struck on the track's own piano, or today's edited. */
function keysOf(o: Option, plan: any): Ev[] {
  const bs = plan.barSeconds as number;
  const today: Ev[] = plan.events.filter((e: Ev) => e.layer === 'keys' && e.t >= o.replace[0] * bs - 1e-6 && e.t < o.replace[1] * bs - 1e-6);
  if (o.edit) return o.edit(today, bs);
  const tpl: Ev = plan.events.find((e: Ev) => e.layer === 'keys');
  const out: Ev[] = [];
  for (const [bar, step, notes, beats, vel, ms = 0, ring] of o.notes!) {
    notes.split(' ').forEach((n, i) => {
      const p: Record<string, any> = { ...structuredClone(tpl.p), midi: midiOf(n), dur: beats * bs / 4, vel };
      if (o.trimDb) p.gain = (tpl.p.gain ?? 1) * 10 ** (o.trimDb / 20);
      const rb = ring ?? o.ring;
      if (rb != null) p.ring = rb * bs / 4;
      // a chord's notes struck low to high, 12 ms apart (the piano's touch)
      out.push({ ...structuredClone(tpl), t: bar * bs + step * bs / 16 + (ms + 12 * i) / 1000, bar, step, p, note: n });
    });
  }
  return out;
}

if (process.argv.includes('--list')) {
  for (const o of OPTIONS) {
    const { plan } = planOf(o.track);
    const k = keysOf(o, plan);
    console.log(`\n## ${o.id} (${TRACKS[o.track].name}, bars ${o.window[0]}-${o.window[1] - 1}, t=${Math.round(o.window[0] * plan.barSeconds)}): ${o.about}`);
    for (let b = o.replace[0] - 1; b < o.replace[1]; b++) console.log(`  ${b}`, k.filter((e) => e.bar === b).map((e) => `${nameOf(e.p.midi)}@${e.step}/${(+e.p.dur).toFixed(2)}v${(+e.p.vel).toFixed(2)}`).join(' '));
  }
  process.exit(0);
}

// --- rendering --------------------------------------------------------------------------------------------------------

const SITE = arg('site'), OUT = arg('out');
if (!SITE || !OUT) { console.error('usage: node tools/keys-moments-sketch.ts --site <dir> --out <dir> [--port 7690] [--only id,id] [--list]'); process.exit(2); }
const PORT = +(arg('port', '7690')!);
const ONLY = (arg('only') ?? '').split(',').filter(Boolean);

const JOB = async (job: any) => {
  const dh = (window as any).deepHouse;
  const track = dh.planTheme(job.seed, job.theme, job.opts);
  const bs = track.barSeconds, r0 = job.replace[0] * bs - 1e-6, r1 = job.replace[1] * bs - 1e-6;
  const events = job.keys ? [...track.events.filter((e: any) => !(e.layer === 'keys' && e.t >= r0 && e.t < r1)), ...job.keys].sort((a: any, b: any) => a.t - b.t) : track.events;
  const program = dh.programOf({ ...track, events });
  const tp = Math.max(0, job.window[0] - job.pre) * bs, t0 = job.window[0] * bs, t1 = job.window[1] * bs;
  const slice = dh.sliceProgram(program, { from: tp, to: t1, tail: 0, layers: job.layers || null });
  const buf = await dh.renderProgram(slice, { sampleRate: job.rate });
  const a = Math.round((t0 - tp) * job.rate), b = Math.min(buf.length, Math.round((t1 - tp) * job.rate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const pcm = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.round(Math.max(-1, Math.min(1, L[i])) * 32767); pcm[2 * i + 1] = Math.round(Math.max(-1, Math.min(1, R[i])) * 32767); }
  const bytes = new Uint8Array(pcm.buffer); const chunks: string[] = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  return { chunks, events: slice.events.length, bpm: program.bpm, barSeconds: bs };
};

fs.mkdirSync(OUT, { recursive: true });
const server = await serveSite(PORT, SITE) as { close: () => void };
const b = await openPage(PORT);
const index: any[] = [];
try {
  for (const o of OPTIONS.filter((x) => !ONLY.length || ONLY.includes(x.id))) {
    const { seed, theme, opts, plan } = planOf(o.track);
    const keys = keysOf(o, plan);
    const base = { seed, theme, opts, window: o.window, replace: o.replace, pre: PRE, rate: RATE };
    for (const [suffix, extra] of [['today', {}], ['today-solo', { layers: ['keys'] }], ['scene', { keys }], ['solo', { keys, layers: ['keys'] }]] as const) {
      const t = Date.now();
      const r = await b.page.evaluate(JOB, { ...base, ...extra });
      fs.writeFileSync(path.join(OUT, `${o.id}-${suffix}.wav`), wav(pcmOf(r), RATE));
      console.log(`${o.id}-${suffix}: ${r.events} events, ${r.bpm} BPM (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    }
    index.push({ id: o.id, track: TRACKS[o.track].name, link: TRACKS[o.track].link, window: o.window, moment: o.moment, barSeconds: plan.barSeconds, t: Math.round(o.window[0] * plan.barSeconds), about: o.about });
  }
} finally { await b.close(); server.close(); }
const file = path.join(OUT, 'index.json');
const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
fs.writeFileSync(file, JSON.stringify([...prior.filter((p: any) => !index.some((i) => i.id === p.id)), ...index].sort((x, y) => x.id.localeCompare(y.id)), null, 1));
