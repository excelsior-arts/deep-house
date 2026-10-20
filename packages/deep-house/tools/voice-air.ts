// The air of each voice Zephyr's cell can name, measured from the sound itself (the bird-labels round, 10-18).
//
//   npx vite build --outDir <dir>                       (in packages/deep-house: the working tree's own build)
//   node tools/voice-air.ts --site <dir>                  writes src/voice-air.json, the table on stdout
//   node tools/voice-air.ts --site <dir> --port 7250 --pages 3 --seeds 6   (one server, three headless pages; the defaults)
//   node tools/voice-air.ts --site <dir> --curves vibes,fmBell             (those voices' curves alone, into the table as it stands)
//   node tools/voice-air.ts --site <dir> --curves marimba --roles answer   (one role's contexts only; an answer is written whole)
//
// Zephyr is air: which voice carries the tone in front and how bright it is. Its cell's big word is the air of the
// voice the theme carries in front (`bird-labels.ts`, `airOf`): the keys where keys play, else the held voice, and at
// the struck conversation the caller (and, in `answers`, the conversation's answerer, read by the draw alone: the
// zephyr-air review). The word is cut from this table (`bird-labels.json`, `zephyr.air`), and the table
// is the sound, not a name: each voice played alone in themes where it is that front voice, at its place's own pitch
// and Zephyr, rendered offline through the real graph.
//
// 1. **Where each voice is in front.** The shipped places (the tiles, BELLS and its two size poles, 27191's drone and
//    seed 6's golden) with Zephyr at 0, 0.1 … 1, master seeds 1..n, themes 0-2, planned as the app plans them: the
//    front voice and its role (keys, held, call). For each voice and role, up to three contexts from the places it is
//    in front most, at each the theme nearest the place's own Zephyr (the call: at BELLS itself where the cast draws
//    it there, else at the size's pole that draws it). A voice in front at no place (a held voice under keys, a lead
//    no place draws) is found over random spells, in the layer it plays, three contexts.
// 2. **Alone.** The context's own program, its events of that voice only (the keys layer's preset, the held layer's
//    timbre, the conversation's calls), twenty seconds from its first note or to its eighth note's ring, at most
//    ninety; headless Chromium, the silent route, an OfflineAudioContext: nothing can be heard.
// 3. **The air.** The spectral centroid (40 Hz-16 kHz) and the energy over 1.5 kHz, at the onsets for the keys and
//    the calls (0-200 ms after each note, each onset's spectrum at unit energy, averaged) and over the whole window
//    for a held voice (it is heard sustained); the median over its contexts (the centroid's geometric median). And a
//    texture index, the spectral flatness 1-8 kHz at the onsets (0 a pure tone, 1 noise), which earns no word today:
//    it stays under 0.12 for every voice.
//
// 4. **The curve: the voice as it is played** (bird-labels round 3, 10-18, his words on BELLS: "ring label doesn't
//    change although immediate description in popup label on slide has good number of variants"). Within one voice
//    Zephyr moves the brightness too, and `hz` is the voice at one setting. So each voice whose brightness a control
//    Zephyr leans moves is measured again, alone in the same contexts, at five settings across the control's reach
//    (Zephyr 0 to 1, log-spaced): the struck calls by their strike (the velocity the program plays, `hardness`), the
//    keys of a keys row by its low-pass (`lpMul`, `keysLp`), and a voice with a brightness knob by the knob
//    (`brightnessHz`, the setting the spell writes). `curve` is those points, the geometric median of the contexts
//    at each; the cell reads it at the setting the theme plays (`bird-labels.ts`, `airPlayOf`). `hz` is untouched in
//    meaning: the voice at its contexts' own settings.
//
// A debug tool: it changes no sound. Re-run it when a voice's sound or a place's draw changes; `tools/check.ts` holds
// that every voice the lists can draw is in the table and that the scale's cuts fall between neighbours.

import fs from 'node:fs';
import path from 'node:path';
import { planTheme } from '../src/mix.ts';
import { HOUSE, BIRDS, knobSetting, type Spell } from '../src/spell.ts';
import { VOICE_KNOBS } from '@deep-house/engine/voices';
import { keysOfProgram, heldOfProgram } from '../src/bird-labels.ts';
import { strategyById } from '../src/strategies/index.ts';
import { candidateLists } from '../src/catalogue.ts';
import Rng from '../src/rng.ts';
import { serveSite, openPage, ROOT } from './imprint/render.ts';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const SITE = arg('site', 'docs');
const PORT = Number(arg('port', '7250'));
const PAGES = Number(arg('pages', '3'));
const SEEDS = Number(arg('seeds', '6'));
const RATE = 48000;
const APP = path.join(ROOT, 'packages', 'deep-house');

/** The shipped places, and BELLS's two size poles (where the small bells and the great bell call). */
const PLACES: Record<string, Partial<Spell>> = {
  'Deep House': {},
  Downtempo: { ember: 0.35, tide: 0.7, root: 0.55 },
  'Trip Hop': { ember: 0.27, tide: 0.55, zephyr: 0.3, root: 0.8, gleam: 0.2, veil: 0.25, spark: 0.6 },
  Ambient: { ember: 0.1, tide: 0.85, zephyr: 0.9, root: 0.5, veil: 0.3, spark: 0, loom: 0.8 },
  '27191': { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 },
  "seed 6's golden": { ember: 0, tide: 0.9, zephyr: 0.25, root: 1, gleam: 0, veil: 0, spark: 0.1, loom: 1 },
  BELLS: { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 },
  'BELLS, Root 0': { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 },
  'BELLS, Root 0.89': { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.89, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 },
  Techno: { ember: 0.75, zephyr: 0.5, root: 0.6, veil: 0.6 },
  'Dub techno': { ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 },
  Trance: { ember: 0.88, tide: 0.7, zephyr: 0.6, root: 0.6, veil: 0.6 },
  Dubstep: { ember: 0.92, tide: 0.9, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.1, loom: 0.8 },
  Breaks: { ember: 0.72, tide: 0.45, zephyr: 0.65, spark: 0.7 },
  'Drum & Bass': { ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 },
};
type Role = 'keys' | 'held' | 'call' | 'answer';
interface Ctx { id: string; role: Role; place: string; z: number; seed: number; theme: number; spell: Spell }

// --- 1. where each voice is in front ---------------------------------------------------------------------------------
const seen = new Map<string, Ctx[]>();
const keyOf = (role: Role, id: string) => `${role}:${id}`;
for (const [place, birds] of Object.entries(PLACES)) for (let zi = 0; zi <= 10; zi++) {
  const spell = { ...HOUSE, ...birds, zephyr: zi / 10 } as Spell;
  for (let seed = 1; seed <= SEEDS; seed++) for (const theme of [0, 1, 2]) {
    const t: any = planTheme(String(seed), theme, { strategy: 'house-v2', spell });
    const conv = typeof t.dice.conversation === 'string' ? t.dice.conversation.split(' · ') : null;
    const keys = keysOfProgram(t.events, t.dice.keysPreset) ?? null, held = heldOfProgram(t.events) ?? null;
    const [id, role]: [string | null, Role] = conv ? [conv[2], 'call'] : keys ? [keys, 'keys'] : [held, 'held'];
    if (!id) continue;
    const k = keyOf(role, id);
    (seen.get(k) ?? seen.set(k, []).get(k)!).push({ id, role, place, z: zi / 10, seed, theme, spell });
    // the conversation's answerer too (the zephyr-air review, 10-18): never the voice in front, but Zephyr's air leans
    // its draw as it leans the caller's, so it is measured as it answers
    if (conv?.[3]) { const ka = keyOf('answer', conv[3]); (seen.get(ka) ?? seen.set(ka, []).get(ka)!).push({ id: conv[3], role: 'answer', place, z: zi / 10, seed, theme, spell }); }
  }
}
const contexts: Ctx[] = [];
for (const rows of seen.values()) {
  const role = rows[0].role;
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.place, (count.get(r.place) ?? 0) + 1);
  let places = [...count].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  if (role === 'call' || role === 'answer') places = places.includes('BELLS') ? ['BELLS'] : places.slice(0, 1);
  for (const p of places.slice(0, 3)) {
    const own = PLACES[p].zephyr ?? HOUSE.zephyr;
    contexts.push(rows.filter((r) => r.place === p).sort((a, b) => Math.abs(a.z - own) - Math.abs(b.z - own) || a.seed - b.seed || a.theme - b.theme)[0]);
  }
}
// every voice that plays in the keys or the held layer and is in front at no place (a held voice under keys, a lead
// the lists draw at no place): three contexts over random spells, in the layer it plays
const idIn = (e: any, layer: string) => (layer === 'pad' ? (typeof e.p?.timbre === 'string' ? e.p.timbre : e.voice) : typeof e.p?.preset === 'string' ? e.p.preset : e.voice);
{
  const atPlace = new Set(contexts.map((c) => keyOf(c.role, c.id))), have = new Map<string, number>();
  const rng = new (Rng as any)(7);
  for (let k = 0; k < 1500; k++) {
    const spell = Object.fromEntries(BIRDS.map((b) => [b, +rng.next().toFixed(2)])) as Spell;
    const seed = 1 + (k % 7), theme = k % 3;
    const t: any = planTheme(String(seed), theme, { strategy: 'house-v2', spell });
    for (const layer of ['keys', 'pad']) for (const id of new Set<string>(t.events.filter((e: any) => e.layer === layer && !String(e.part ?? '').startsWith('conversation-')).map((e: any) => idIn(e, layer)))) {
      const role: Role = layer === 'pad' ? 'held' : 'keys', key = keyOf(role, id);
      if (atPlace.has(key) || (have.get(key) ?? 0) >= 3) continue;
      contexts.push({ id, role, place: `spell ${BIRDS.map((b) => spell[b].toFixed(2)).join(',')}`, z: spell.zephyr, seed, theme, spell });
      have.set(key, (have.get(key) ?? 0) + 1);
    }
  }
  const cat = (strategyById('house-v2').style as any).catalogue;
  for (const l of candidateLists(cat)) if (['leadTimbres', 'sustainedLeads', 'padPartners', 'stabPartners'].includes(l.id)) for (const v of l.list())
    if (![keyOf('keys', String(v)), keyOf('held', String(v))].some((k) => atPlace.has(k) || have.get(k))) console.error(`${v}: in ${l.id}, never plays in 1500 random themes (not measured)`);
}

// --- 4 (planned here). the control each voice's brightness moves by, and its reach ------------------------------
type By = 'knob' | 'lpMul' | 'vel';
interface Reach { by: By; voice?: string; unset?: number; xs: number[] }
const evIdIn = (e: any, role: Role) => idIn(e, role === 'held' ? 'pad' : 'keys');
const matchIn = (role: Role, id: string) => (e: any) => e.layer === (role === 'held' ? 'pad' : 'keys') && evIdIn(e, role) === id
  && (role === 'call' ? e.part === 'conversation-call' : role === 'answer' ? e.part === 'conversation-answer' : !String(e.part ?? '').startsWith('conversation-'));
const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const gm = (pair: unknown) => (Array.isArray(pair) ? Math.sqrt(Math.abs(pair[0] * (pair[1] ?? pair[0]))) : 1);
const most = (xs: string[]) => { const n = new Map<string, number>(); for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]; };
const logspace = (a: number, b: number, n = 5) => Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));
const atZ = (c: Ctx, z: number): any => planTheme(String(c.seed), c.theme, { strategy: 'house-v2', spell: { ...c.spell, zephyr: z } });
/** The keys row's low-pass at a theme, by the value most of its keys notes carry (a swapped tone's own factor beside it). */
const keysLpOf = (t: any) => { const v = most(t.events.filter((e: any) => e.layer === 'keys' && e.role === 'sparse-keys').map((e: any) => gm(e.p?.lpMul).toFixed(4))); return v == null ? null : +v; };
function reachOf(c: Ctx): Reach | null {
  const t: any = planTheme(String(c.seed), c.theme, { strategy: 'house-v2', spell: c.spell });
  const evs = t.events.filter(matchIn(c.role, c.id));
  // an answer's air is read at its own strike alone (`hz`): the draw reads it, and no word does
  if (!evs.length || c.role === 'answer') return null;
  if (c.role === 'call') {
    // the strike: the calls' median velocity at Zephyr's two ends (the hardness factor, whatever voice calls)
    const v = (z: number) => med(atZ(c, z).events.filter((e: any) => e.part === 'conversation-call').map((e: any) => e.p.vel));
    const lo = v(0), hi = v(1);
    if (!(Number.isFinite(lo) && Number.isFinite(hi) && hi > lo * 1.01)) return null;
    // the middle point at the place's own Zephyr (zephyr-air): a struck voice's top follows its strike's hardness off the
    // place, steeply near the ends, so the curve is pinned where the place plays it and the cell reads it there exactly
    const mid = v(PLACES[c.place]?.zephyr ?? HOUSE.zephyr);
    return { by: 'vel', xs: mid > lo && mid < hi ? [lo, Math.sqrt(lo * mid), mid, Math.sqrt(mid * hi), hi] : logspace(lo, hi) };
  }
  if (c.role === 'keys' && evs.some((e: any) => e.role === 'sparse-keys')) {
    // the keys row's low-pass: the factor at Zephyr's ends over the one here, on this voice's own notes' factor
    const own = med(evs.map((e: any) => gm(e.p?.lpMul))), here = keysLpOf(t) ?? 1, lo = keysLpOf(atZ(c, 0)) ?? here, hi = keysLpOf(atZ(c, 1)) ?? here;
    if (hi > lo * 1.01) return { by: 'lpMul', unset: 1, xs: logspace(own * lo / here, own * hi / here) };
  }
  const voice = most(evs.map((e: any) => e.voice))!;
  const spec: any = (VOICE_KNOBS as any)[voice]?.brightnessHz;
  if (spec && spec.bird === 'zephyr') {
    const lo = knobSetting(spec, { ...c.spell, zephyr: 0 } as Spell), hi = knobSetting(spec, { ...c.spell, zephyr: 1 } as Spell);
    return { by: 'knob', voice, unset: spec.default, xs: logspace(Math.min(lo, hi), Math.max(lo, hi)) };
  }
  return null;
}
const roundReach = (by: By, x: number) => (by === 'knob' ? Math.round(x) : +x.toFixed(3));
// a keys voice a keys row plays somewhere other than its own contexts (the Drum & Bass tile's tones): one context more
// there, for its curve only (its `hz` and `at` stay the contexts' own)
const curveOnly = new Set<Ctx>();
for (const [k, rows] of seen) {
  if (rows[0].role !== 'keys' || contexts.some((c) => keyOf(c.role, c.id) === k && planTheme(String(c.seed), c.theme, { strategy: 'house-v2', spell: c.spell }).events.some((e: any) => e.role === 'sparse-keys' && matchIn('keys', c.id)(e)))) continue;
  const own = new Set(contexts.filter((c) => keyOf(c.role, c.id) === k).map((c) => c.place));
  const byPlace = new Map<string, Ctx>();
  for (const r of rows) if (!own.has(r.place)) { const b = byPlace.get(r.place); const z0 = PLACES[r.place].zephyr ?? HOUSE.zephyr; if (!b || Math.abs(r.z - z0) < Math.abs(b.z - z0)) byPlace.set(r.place, r); }
  for (const r of byPlace.values()) if (planTheme(String(r.seed), r.theme, { strategy: 'house-v2', spell: r.spell }).events.some((e: any) => e.role === 'sparse-keys' && matchIn('keys', r.id)(e))) { contexts.push(r); curveOnly.add(r); break; }
}
const reaches = new Map<string, Reach | null>();
for (const c of contexts) {
  const k = keyOf(c.role, c.id), r = reachOf(c);
  if (!reaches.has(k) || (!reaches.get(k) && r)) reaches.set(k, r);
  else if (r && reaches.get(k)!.by !== r.by) console.error(`${k}: moved by ${reaches.get(k)!.by} at one context and ${r.by} at ${c.place} (the first kept)`);
}
if (process.argv.includes('--reach')) {
  for (const [k, r] of [...reaches].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`${k}: ${r ? `${r.by}${r.voice ? ` (${r.voice})` : ''} ${r.xs.map((x) => roundReach(r.by, x)).join(' ')}` : '-'}`);
  process.exit(0);
}

// --- 2. alone -------------------------------------------------------------------------------------------------------
const JOB = async (job: any) => {
  const dh = (window as any).deepHouse, W = window as any;
  const key = JSON.stringify([job.seed, job.theme, job.spell]);
  if (!W.__airPlan || W.__airPlan.key !== key) { const track = dh.planTheme(String(job.seed), job.theme, { strategy: 'house-v2', spell: job.spell }); W.__airPlan = { key, program: dh.programOf(track) }; }
  const program = W.__airPlan.program;
  const layer = job.role === 'held' ? 'pad' : 'keys';
  const idOf = (e: any) => (layer === 'pad' ? (e.p && typeof e.p.timbre === 'string' ? e.p.timbre : e.voice) : e.p && typeof e.p.preset === 'string' ? e.p.preset : e.voice);
  const match = (e: any) => e.layer === layer && idOf(e) === job.id && (job.role === 'call' ? e.part === 'conversation-call' : job.role === 'answer' ? e.part === 'conversation-answer' : !String(e.part ?? '').startsWith('conversation-'));
  const all = program.events.filter(match);
  if (!all.length) return null;
  const t0 = Math.max(0, all[0].onset - 0.05);
  const t1 = Math.min(t0 + 90, Math.max(t0 + 20, all[Math.min(7, all.length - 1)].onset + 4));
  const slice = dh.sliceProgram(program, { from: t0, to: t1, tail: 0, layers: [layer] });
  let events = slice.events.filter(match).map((e: any, i: number) => ({ ...e, i }));
  // a setting of the control the voice's brightness moves by (step 4): the knob set, or the low-pass and the strike
  // scaled from the voice's own (its notes' median) to the setting, each note keeping its own shape
  if (job.set) {
    const med = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const gm = (pair: any) => (Array.isArray(pair) ? Math.sqrt(Math.abs(pair[0] * (pair[1] ?? pair[0]))) : 1);
    const { by, x } = job.set;
    if (by === 'knob') events = events.map((e: any) => ({ ...e, p: { ...e.p, knobs: { ...(e.p?.knobs ?? {}), brightnessHz: x } } }));
    else if (by === 'lpMul') { const k = x / med(events.map((e: any) => gm(e.p?.lpMul))); events = events.map((e: any) => ({ ...e, p: { ...e.p, lpMul: (Array.isArray(e.p?.lpMul) ? e.p.lpMul : [1, 1]).map((v: number) => v * k) } })); }
    // the strike's hardness rides with its velocity (zephyr-air: the voices' top follows it), as the program plays them
    else if (by === 'vel') { const k = x / med(events.map((e: any) => e.p.vel)); events = events.map((e: any) => { const vel = Math.max(0.05, Math.min(0.95, e.p.vel * k)), hardness = +((e.p.hardness ?? 1) * vel / e.p.vel).toFixed(4); const { hardness: _h, ...rest } = e.p; return { ...e, p: { ...rest, vel, ...(hardness !== 1 ? { hardness } : {}) } }; }); }
  }
  // `hz` keeps its meaning (zephyr-air): the voice at its context's velocity with the row's own top; the strike's
  // hardness, which tilts a struck voice's top off the place's own Zephyr, is the curve's
  else events = events.map((e: any) => { if (e.p?.hardness === undefined) return e; const { hardness: _h, ...rest } = e.p; return { ...e, p: rest }; });
  const buf = await dh.renderProgram({ ...slice, events, duck: [] }, { sampleRate: job.rate });
  const L = buf.getChannelData(0), R = buf.getChannelData(1), mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
  const bytes = new Uint8Array(mono.buffer), chunks: string[] = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) { let s = ''; const end = Math.min(bytes.length, o + (1 << 20)); for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096))); chunks.push(btoa(s)); }
  const midi = events.map((e: any) => e.p?.midi).filter((x: any) => typeof x === 'number').sort((a: number, b: number) => a - b);
  return { chunks, onsets: events.map((e: any) => e.onset), midi: midi.length ? midi[Math.floor(midi.length / 2)] : null };
};

// --- 3. the air -----------------------------------------------------------------------------------------------------
const N = 16384;
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) {
      const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
      re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
/** The power spectrum of one Hann-windowed segment (at most N samples), zero-padded to N. */
function power(x: Float32Array, a: number, b: number): Float64Array | null {
  const n = Math.min(b, x.length) - a;
  if (n < 64) return null;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < Math.min(n, N); i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const p = new Float64Array(N / 2 + 1);
  for (let i = 0; i <= N / 2; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}
function readings(p: Float64Array) {
  const hz = (i: number) => (i * RATE) / N;
  let tot = 0, mom = 0, hi = 0, logs = 0, lin = 0, nt = 0;
  for (let i = 0; i < p.length; i++) {
    const f = hz(i);
    if (f < 40 || f > 16000) continue;
    tot += p[i]; mom += p[i] * f; if (f >= 1500) hi += p[i];
    if (f >= 1000 && f <= 8000) { logs += Math.log(p[i] + 1e-30); lin += p[i] + 1e-30; nt++; }
  }
  return { centroid: mom / (tot || 1e-30), over1500: 10 * Math.log10(hi / (tot || 1e-30) + 1e-30), flat: Math.exp(logs / nt) / (lin / nt) };
}
function measure(x: Float32Array, onsets: number[], held: boolean) {
  const acc = new Float64Array(N / 2 + 1);
  let n = 0;
  if (held) {
    // a held voice: its whole window, in 200 ms frames, as energy
    const hop = Math.round(0.2 * RATE);
    for (let a = 0; a + hop < x.length; a += hop) { const p = power(x, a, a + hop); if (p) { for (let i = 0; i < p.length; i++) acc[i] += p[i]; n++; } }
  } else {
    for (const t of onsets) {
      const a = Math.round(t * RATE), p = power(x, a, a + Math.round(0.2 * RATE));
      if (!p) continue;
      let e = 0; for (let i = 0; i < p.length; i++) e += p[i];
      if (e < 1e-12) continue;
      for (let i = 0; i < p.length; i++) acc[i] += p[i] / e;
      n++;
    }
  }
  return n ? readings(acc) : null;
}

// `--only a,b`: those voices alone, their curves on stderr, nothing written (a debug run)
// `--curves a,b`: those voices alone, and only their curves written into the table as it stands (zephyr-air: a voice's
// sound moved within itself, so its curve is measured again; every `hz`, `at` and every other voice's curve kept, since
// which voice is in front where, and so the contexts, follow the draws and are not this voice's to move)
const CURVES = process.argv.includes('--curves') ? new Set(arg('curves', '').split(',')) : null;
const ONLY = process.argv.includes('--only') ? new Set(arg('only', '').split(',')) : CURVES;
const server: any = await serveSite(PORT, path.isAbsolute(SITE) ? SITE : path.join(ROOT, SITE));
// `--roles call,answer`: only those roles' contexts (a voice measured in two roles keeps the other's as it stands)
const ROLES = process.argv.includes('--roles') ? new Set(arg('roles', '').split(',')) : null;
const queue = contexts.filter((c) => (!ONLY || ONLY.has(c.id)) && (!ROLES || ROLES.has(c.role)));
const results: Array<{ ctx: Ctx; midi: number | null; centroid: number; over1500: number; flat: number; curve: Array<[number, number]> }> = [];
await Promise.all(Array.from({ length: PAGES }, async () => {
  const page = await openPage(PORT);
  const run = async (c: Ctx, set: { by: By; x: number } | null) => {
    const r: any = await page.page.evaluate(JOB, { ...c, rate: RATE, set });
    if (!r) return null;
    const x = new Float32Array(new Uint8Array(Buffer.concat(r.chunks.map((s: string) => Buffer.from(s, 'base64')))).buffer);
    const m = measure(x, r.onsets, c.role === 'held');
    return m ? { midi: r.midi, ...m } : null;
  };
  try {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const own = await run(c, null);
      if (!own) { console.error(`${c.role} ${c.id} at ${c.place}: no events`); continue; }
      const reach = reaches.get(keyOf(c.role, c.id));
      const curve: Array<[number, number]> = [];
      if (reach) for (const x of reach.xs) { const m = await run(c, { by: reach.by, x }); if (m) curve.push([x, m.centroid]); }
      if (reach) console.error(`curve ${keyOf(c.role, c.id)} at ${c.place} (seed ${c.seed} theme ${c.theme + 1}, own ${Math.round(own.centroid)} Hz): ${curve.map(([x, h]) => `${roundReach(reach.by, x)} -> ${Math.round(h)}`).join(', ')}`);
      results.push({ ctx: c, ...own, curve });
    }
  } finally { await page.close(); }
}));
server.close();

interface Curve { by: By; voice?: string; unset?: number; points: Array<[number, number]> }
const table: Record<'keys' | 'held' | 'calls' | 'answers', Record<string, { hz: number; over1500: number; flat: number; at: string[]; curve?: Curve }>> = { keys: {}, held: {}, calls: {}, answers: {} };
const tableOf = (role: Role) => (role === 'call' ? 'calls' : role === 'answer' ? 'answers' : role);
const roundX = (by: By, x: number) => (by === 'knob' ? Math.round(x) : +x.toFixed(3));
const groups = new Map<string, typeof results>();
for (const r of results) { const k = keyOf(r.ctx.role, r.ctx.id); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
for (const [k, all] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
  // a curve-only context (a keys row's tone measured where the row plays it) moves no `hz` and names no `at`
  const own = all.filter((r) => !curveOnly.has(r.ctx)), rs = own.length ? own : all;
  const { role, id } = rs[0].ctx;
  table[tableOf(role)][id] = {
    hz: Math.round(Math.exp(median(rs.map((r) => Math.log(r.centroid))))),
    over1500: +median(rs.map((r) => r.over1500)).toFixed(1),
    flat: +median(rs.map((r) => r.flat)).toFixed(3),
    at: rs.map((r) => `${r.ctx.place}, Zephyr ${r.ctx.z.toFixed(2)}, seed ${r.ctx.seed} theme ${r.ctx.theme + 1}, midi ${r.midi ?? '-'}: ${Math.round(r.centroid)} Hz, ${r.over1500.toFixed(1)} dB`),
  };
  const reach = reaches.get(k);
  const curved = all.filter((r) => r.curve.length === reach?.xs.length);
  if (reach && curved.length) {
    const points = reach.xs.map((x, i) => [roundX(reach.by, x), Math.round(Math.exp(median(curved.map((r) => Math.log(r.curve[i][1])))))] as [number, number]);
    table[tableOf(role)][id].curve = { by: reach.by, ...(reach.voice ? { voice: reach.voice } : {}), ...(reach.unset != null ? { unset: reach.unset } : {}), points };
  }
}
const out = {
  kind: 'voice-air', schema: 1,
  note: 'The air of each voice Zephyr\'s cell can name, measured from the sound by tools/voice-air.ts (the bird-labels round, 10-18): each voice played alone in themes where it is the front voice (the keys that play, else the held voice, and the struck conversation\'s caller; `answers` the conversation\'s answerer, whose air its draw leans by and no word reads), at its place\'s own pitch and Zephyr, rendered offline. `hz` is the spectral centroid (40 Hz-16 kHz) at the onsets for the keys and the calls, over the whole window for a held voice, the geometric median of its contexts; `over1500` the energy over 1.5 kHz in dB of the whole; `flat` the spectral flatness 1-8 kHz (a texture index, 0 a pure tone, 1 noise); `at` the contexts. bird-labels.json `zephyr.air` cuts the words on `hz`. `curve` is the voice as it is played (bird-labels round 3): where a control Zephyr leans moves its brightness, the centroid at five settings across that control\'s reach, `[setting, hz]`, the geometric median of the same contexts; `by` names the control (`vel` the calls\' strike, the velocity the program plays; `lpMul` the keys row\'s low-pass factor on the voice\'s notes; `knob` the `brightnessHz` knob of the event voice `voice`, `unset` its setting where the program writes none). The cell reads the curve at the setting the theme plays and cuts it on the same scale. Generated: re-run the tool, never edit by hand.',
  measured: { seeds: SEEDS, rate: RATE, window: '0-200 ms after each onset (keys, calls); 200 ms frames over the window (held)', curve: 'five settings, log-spaced over the control\'s reach from Zephyr 0 to 1 in the context' },
  ...table,
};
if (!ONLY) fs.writeFileSync(path.join(APP, 'src', 'voice-air.json'), JSON.stringify(out, null, 1) + '\n');
else if (CURVES) {
  const file = path.join(APP, 'src', 'voice-air.json'), was = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const role of ['keys', 'held', 'calls'] as const) for (const [id, v] of Object.entries(table[role])) {
    if (!CURVES.has(id) || !was[role]?.[id]) continue;
    if (v.curve) was[role][id].curve = v.curve; else delete was[role][id].curve;
  }
  // the answers (the zephyr-air review): an answer is its strike's air alone, so a voice named is measured whole
  was.note = out.note;
  was.answers ??= {};
  for (const [id, v] of Object.entries(table.answers)) if (CURVES.has(id)) was.answers[id] = v;
  was.answers = Object.fromEntries(Object.entries(was.answers).sort((a, b) => a[0].localeCompare(b[0])));
  fs.writeFileSync(file, JSON.stringify(was, null, 1) + '\n');
}
const rows = (['keys', 'held', 'calls', 'answers'] as const).flatMap((role) => Object.entries(table[role]).map(([id, v]) => ({ role, id, ...v }))).sort((a, b) => a.hz - b.hz);
console.log('| voice | role | centroid | over 1.5 kHz | flatness | curve | contexts |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.role} | ${r.hz} Hz | ${r.over1500} dB | ${r.flat} | ${r.curve ? `${r.curve.by}${r.curve.voice ? ` (${r.curve.voice})` : ''}: ${r.curve.points.map(([x, h]) => `${x} → ${h}`).join(', ')}` : '-'} | ${r.at.join('; ')} |`);
