// The ring's words against what each control really does, place by place (the bird-labels round, 10-18).
//
//   node tools/labels-audit.ts                    every place, every control (markdown on stdout)
//   node tools/labels-audit.ts --place BELLS      one place
//   node tools/labels-audit.ts --seeds 4          master seeds 1..n, themes 0-2 each (default 4)
//
// For every shipped place (the tiles, BELLS, 27191's drone and seed 6's golden) and every control, the control is moved
// across its travel (0, 0.25, 0.5, 0.75, 1 and the place's own value) with the other seven at the place, every theme is
// planned as the app plans it, and two things are read at each value: what the cell says (the big word and the short
// line, `bird-labels.ts`, the ring's one author, with the program's facts as the ring reads them), and what the program
// changed against the place's own value: the layers' events and voices, the parts the composer drew, the knobs the
// place's leans set, the conversation's summary, the theme's length and form, and how many place tables leave the
// place. A debug reference: nothing reads it, and it changes nothing.
import { planTheme } from '../src/mix.ts';
import { HOUSE, BIRDS, derive, type Bird, type Spell } from '../src/spell.ts';
import { cellReading, shortOf, hatsOfProgram, programFactsOf, keysOfProgram, heldOfProgram, airPlayOf, type LabelTheme } from '../src/bird-labels.ts';
import { nearestEntry, type PlaceEntry } from '../src/places.ts';
import { style as v2 } from '../src/styles/deep-house-v2.ts';
import { places } from '../src/styles/deep-house-places.ts';

const arg = (name: string, d: string) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('--seeds', '4'));
const ONLY = arg('--place', '');

/** The shipped places: the machine view's tiles, the slow neighbours and the struck place. */
const PLACES: Record<string, Partial<Spell>> = {
  'Deep House': {},
  Downtempo: { ember: 0.35, tide: 0.7, root: 0.55 },
  'Trip Hop': { ember: 0.27, tide: 0.55, zephyr: 0.3, root: 0.8, gleam: 0.2, veil: 0.25, spark: 0.6 },
  Ambient: { ember: 0.1, tide: 0.85, zephyr: 0.9, root: 0.5, veil: 0.3, spark: 0, loom: 0.8 },
  '27191 (HELD_DRONE)': { ember: 0.14, gleam: 0, veil: 0.34, spark: 0, loom: 0.81 },
  "seed 6's golden": { ember: 0, tide: 0.9, zephyr: 0.25, root: 1, gleam: 0, veil: 0, spark: 0.1, loom: 1 },
  BELLS: { ember: 0.05, tide: 0.65, zephyr: 0.65, root: 0.10, gleam: 0.80, veil: 0.30, spark: 0.55, loom: 0.90 },
  Techno: { ember: 0.75, zephyr: 0.5, root: 0.6, veil: 0.6 },
  'Dub techno (DEEP_STILL)': { ember: 0.72, spark: 0.10, tide: 0.90, zephyr: 0.25, root: 0.85, veil: 0.15, loom: 0.80 },
  Trance: { ember: 0.88, tide: 0.7, zephyr: 0.6, root: 0.6, veil: 0.6 },
  Dubstep: { ember: 0.92, tide: 0.9, zephyr: 0.25, root: 0.85, veil: 0.15, spark: 0.1, loom: 0.8 },
  Breaks: { ember: 0.72, tide: 0.45, zephyr: 0.65, spark: 0.7 },
  'Drum & Bass': { ember: 0.95, tide: 0.45, zephyr: 0.6, root: 0.75, veil: 0.6, spark: 0.85, loom: 0.85 },
};
const COMPASS: Bird[] = ['ember', 'spark', 'zephyr', 'gleam', 'root', 'loom', 'tide', 'veil'];

const tables = Object.entries(places).filter(([, v]) => Array.isArray(v) && v.length && (v[0] as PlaceEntry).place) as Array<[string, PlaceEntry[]]>;
const lanePicks = (s: Spell) => { const bpm = derive(s).tempoCentre; return tables.map(([, t]) => nearestEntry(t, s, bpm)?.id ?? 'house'); };

type F = Record<string, number | string>;
const dB = (g: number) => 20 * Math.log10(Math.max(1e-6, g));
function features(t: any, centrePicks: string[], spell: Spell): F {
  const f: F = {};
  const trace = (() => { try { return JSON.parse(t.dice.composition || '{}'); } catch { return {}; } })();
  f.bpm = t.bpm; f.bars = t.bars; f.sections = t.arrangement.sections.length;
  f.drums = t.kickPresent ? 1 : 0; f.library = t.dice.library ? 1 : 0;
  if (trace.scene) f.scene = trace.scene;
  const n = new Map<string, number>(), g = new Map<string, number[]>(), v = new Map<string, Map<string, number>>();
  for (const e of t.events) {
    n.set(e.layer, (n.get(e.layer) ?? 0) + 1);
    if (e.p && typeof e.p.gain === 'number') (g.get(e.layer) ?? g.set(e.layer, []).get(e.layer)!).push(e.p.gain);
    const m = v.get(e.layer) ?? v.set(e.layer, new Map()).get(e.layer)!; m.set(e.voice, (m.get(e.voice) ?? 0) + 1);
  }
  for (const [l, c] of n) f[`n:${l}`] = c;
  for (const [l, gs] of g) f[`dB:${l}`] = +dB(gs.reduce((a, b) => a + b, 0) / gs.length).toFixed(1);
  for (const [l, m] of v) f[`v:${l}`] = [...m].sort((a, b) => b[1] - a[1])[0][0];
  for (const [fam, w] of Object.entries(trace.selected || {})) f[`part:${fam}`] = String(w);
  for (const [voice, ks] of Object.entries(t.knobs || {})) for (const [k, x] of Object.entries(ks as object)) if (typeof x === 'number') f[`knob:${voice}.${k}`] = x;
  if (t.sound?.subDb != null) f.subDb = t.sound.subDb;
  const c = t.conversation;
  if (c) {
    f['c:size'] = c.size; f['c:exchanges'] = c.exchanges; f['c:caller'] = c.voices.caller; f['c:answerer'] = c.voices.answerer;
    f['c:hand'] = c.voices.punctuation ?? 'none'; f['c:punctuation'] = c.punctuation; f['c:handovers'] = c.handovers.length;
    f['c:tail'] = c.tail; f['c:silences'] = c.silences; f['c:returns'] = c.returns; f['c:pulse'] = c.pulse; f['c:ground'] = c.ground;
    f['c:open'] = c.answers.open;
  }
  // the harmony: the progression rolled, and how many chords a theme walks
  f.progression = t.dice.progression ?? '';
  f.chords = new Set((t.progression?.chords ?? []).map((c: { label: string }) => c.label)).size;
  // the struck conversation's pitches and touch: the ground off the tonic, the call's velocity, three-note calls
  const conv = t.events.filter((e: any) => typeof e.part === 'string' && e.part.startsWith('conversation-'));
  if (conv.length) {
    const ground = conv.filter((e: any) => e.part === 'conversation-ground' && e.p.midi != null);
    if (ground.length) f['c:groundOffTonic'] = +(ground.filter((e: any) => ((e.p.midi - t.key.root) % 12 + 12) % 12 !== 0).length / ground.length).toFixed(2);
    const calls = conv.filter((e: any) => e.part === 'conversation-call');
    if (calls.length) f['c:callVel'] = +(calls.reduce((a: number, e: any) => a + e.p.vel, 0) / calls.length).toFixed(3);
    if (calls.length) f['c:callMidi'] = Math.round(calls.reduce((a: number, e: any) => a + e.p.midi, 0) / calls.length);
  }
  if (t.ambient?.drawn) for (const [k, x] of Object.entries(t.ambient.drawn)) f[`amb:${k}`] = String(x);
  if (t.passage?.id) f.passage = t.passage.id;
  f.keysPreset = t.dice.keysPreset ?? ''; f.fx = t.dice.fxPalette ?? ''; f.density = String(t.dice.density?.label ?? t.dice.density ?? '');
  f.room = t.presetLabel;
  const picks = lanePicks(spell);
  f.lanesLeft = picks.filter((p, i) => p !== centrePicks[i]).length;
  return f;
}

function theme(t: any, spell: Spell): LabelTheme {
  return { spell, bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: t.preset, dice: t.dice, bars: t.bars, plan: t.arrangement.sections,
    hats: hatsOfProgram(t.events, t.timeline), facts: programFactsOf(t.events, t.dice), keys: keysOfProgram(t.events, t.dice.keysPreset) ?? null, held: heldOfProgram(t.events) ?? null, air: airPlayOf(t.events, t.knobs, t.dice.keysPreset) };
}

function aggregate(fs: F[]): F {
  const keys = new Set(fs.flatMap((f) => Object.keys(f)));
  const out: F = {};
  for (const k of keys) {
    const xs = fs.map((f) => f[k]);
    if (xs.every((x) => typeof x === 'number' || x === undefined)) {
      const nums = xs.map((x) => (x === undefined ? 0 : (x as number)));
      out[k] = +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3);
    } else {
      const tally = new Map<string, number>();
      for (const x of xs) tally.set(String(x ?? '—'), (tally.get(String(x ?? '—')) ?? 0) + 1);
      const top = [...tally].sort((a, b) => b[1] - a[1]);
      out[k] = top.slice(0, 2).map(([w, c]) => `${w} ${c}`).join(', ');
    }
  }
  return out;
}

/** The features that move across the travel: a mode that changes, or a mean that moves by a fifth or more. */
function moved(rows: F[], at: number): string[] {
  const keys = new Set(rows.flatMap((f) => Object.keys(f)));
  const out: string[] = [];
  for (const k of [...keys].sort()) {
    const xs = rows.map((r) => r[k]);
    if (xs.every((x) => typeof x === 'number' || x === undefined)) {
      const nums = xs.map((x) => (x === undefined ? 0 : (x as number)));
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const ref = Math.max(Math.abs(nums[at]), 1e-9);
      const tiny = k.startsWith('dB:') ? hi - lo < 1 : (hi - lo) / Math.max(ref, Math.abs(lo), Math.abs(hi)) < 0.2;
      if (!tiny) out.push(`${k} ${nums.map((x) => (Math.abs(x) >= 100 ? x.toFixed(0) : +x.toFixed(2))).join(' / ')}`);
    } else {
      const modes = xs.map((x) => String(x ?? '—').split(',')[0].replace(/ \d+$/, ''));
      if (new Set(modes).size > 1) out.push(`${k} ${xs.map((x) => String(x ?? '—')).join(' / ')}`);
    }
  }
  return out;
}

const out: string[] = [];
const say = (s = '') => out.push(s);
say(`<!-- generated by packages/deep-house/tools/labels-audit.ts: seeds 1-${SEEDS}, themes 0-2 each, house-v2 -->`);
for (const [name, birds] of Object.entries(PLACES)) {
  if (ONLY && !name.includes(ONLY)) continue;
  const centre = { ...HOUSE, ...birds } as Spell;
  const centrePicks = lanePicks(centre);
  say(); say(`## ${name}`); say();
  say(`\`${COMPASS.map((b) => `${b.slice(0, 2)}:${centre[b].toFixed(2)}`).join(',')}\``); say();
  for (const b of COMPASS) {
    const values = [...new Set([0, 0.25, 0.5, 0.75, 1, +centre[b].toFixed(3)])].sort((x, y) => x - y);
    const at = values.indexOf(+centre[b].toFixed(3));
    const words: string[] = [], agg: F[] = [];
    for (const v of values) {
      const spell = { ...centre, [b]: v } as Spell;
      const fs: F[] = [];
      const said = new Map<string, number>();
      for (let s = 1; s <= SEEDS; s++) for (let th = 0; th < 3; th++) {
        const t: any = planTheme(String(s), th, { strategy: 'house-v2', spell });
        fs.push(features(t, centrePicks, spell));
        const T = theme(t, spell);
        const c = cellReading(b, T, v2);
        const w = `${String(c.word ?? '').toUpperCase()}${c.sub ? ' · ' + c.sub.toUpperCase() : ''} — ${shortOf(b, T, v2)}`;
        said.set(w, (said.get(w) ?? 0) + 1);
      }
      agg.push(aggregate(fs));
      words.push([...said].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([w, n]) => `${w} (${n})`).join('; '));
    }
    say(`### ${name} · ${b} (place ${centre[b].toFixed(2)})`); say();
    say('| value | the cell says (themes) |'); say('|---|---|');
    values.forEach((v, i) => say(`| ${v.toFixed(2)}${i === at ? ' (place)' : ''} | ${words[i]} |`));
    say();
    const m = moved(agg, at);
    say(`What the program moves (${values.map((v) => v.toFixed(2)).join(' / ')}):`); say();
    for (const line of m.length ? m : ['nothing measured moves']) say(`- ${line}`);
    say();
  }
}
console.log(out.join('\n'));
void BIRDS;
