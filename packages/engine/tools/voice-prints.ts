// What the four voices that were modules build, note by note, as a print.
//
// Round SOUNDS-R3 (10-04) turns `pad`, `keys`, `piano` and `wordlessVocal`
// from modules into rows over topologies, and nothing audible may move. A
// browser is the instrument for samples; this is the other one: the recording
// stand-in (`standin.ts`), handed each voice's notes under a few rooms, and
// what it was asked to build — every node in the order it was made, every
// property set on it, every parameter's value and every command it was given,
// every start and stop, every connection by the index of what it went to —
// written down whole and hashed. The same notes through the row and through the
// module ask for the same graph with the same numbers in it, or the prints
// differ.
//
// The prints were taken from the modules, before the round touched them
// (`voice-prints.json`, written by `--write` on that tree), and every later
// tree is held to them by `check-sounds.ts`. The cases are the four voices'
// fixtures and more: every timbre and patch of the two dispatchers, a timbre
// nobody names, knobs and controls at and past their ends, the pad's motion,
// the room's own voicing of each block (the v2 keyboard patch and piano, a
// corner a place writes), the grain a place writes (the strings' breath, the
// keys' edge, the piano's hammer and body), and the piano's strings both built
// live and prepared ahead (the prepared bodies' own graphs are in its print).
//
//   node tools/voice-prints.ts                 compare with voice-prints.json, say what differs
//   node tools/voice-prints.ts --write         write voice-prints.json from this tree
//   node tools/voice-prints.ts --dump <dir>    write each case's whole log, for a diff

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { VOICES, prepareVoices } from '../src/voices/index.ts';
import { resolveSettings } from '../src/settings.ts';
import type { Settings } from '../src/settings.ts';
import { table } from './fixture.ts';
import { OfflineStandin, StandinContext, StandinNode, StandinParam, standin } from './standin.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PRINTS = path.join(HERE, 'voice-prints.json');

// --- the rooms -----------------------------------------------------------------

/** A keyboard voicing as house-v2 writes it (`deep-house-characters.ts`), typed here so the engine names no composer. */
const EP_VOICING = { ratio: 2, index: [0.45, 0.55], indexDecay: 0.35, tine: 0, cutoff: 1500, det: 2, formant: [2400, 1.5], tremolo: false };
/** The grain a place writes (round SPARK-1's house row), typed here for the same reason. */
const GRAIN = {
  keys: { edge: { level: 1, hz: 2000, decay: 0.15, tine: 3, hold: 0.3, chiff: 0.1, chiffHz: 4500, chiffDecay: 0.01 } },
  strings: { breath: { level: 0.03, loHz: 6000, hiHz: 14000 } },
  piano: { grain: { hammer: 2.5, body: 0.4 } },
};

const base = table as unknown as Parameters<typeof resolveSettings>[0]['base'];
const DRIFT = { space: { padDriftCents: 3, padDriftHz: 0.07 } };
export const ROOMS: Record<string, Settings> = {
  plain: resolveSettings({ base, overrides: DRIFT }),
  voiced: resolveSettings({ base, overrides: {
    ...DRIFT,
    keyboardPatches: { ep: EP_VOICING, organ: { cutoff: 1800, det: 4 } },
    piano: { dryLevel: 0.85, sustainLevel: 0.32, partialDecay: 0.4 },
    strings: { cutoffHz: 1200, detuneCents: 12, release: 0.6 },
    keys: { hpHz: 120, tremoloDepth: 0.25 },
  } }),
  grain: resolveSettings({ base, overrides: { ...DRIFT, ...GRAIN } }),
};

// --- the notes -------------------------------------------------------------------

type P = Record<string, unknown>;
const KNOBS_STRINGS = { brightnessHz: 2400, hold: 0.8, attack: 0.1, grain: 2 };
const KNOBS_KEYS = { brightnessHz: 4000, hold: 0.6, attack: 0.05, grain: 2 };
const PAD_NOTES: P[] = [
  { midi: 60, dur: 3.9, vel: 0.8 },
  { midi: 48, dur: 1.2, vel: 0.6, knobs: KNOBS_STRINGS, motion: 0.5, fadeCurve: 1, doubleTop: 0.5, lpMul: [1, 1.5], hpMul: [1, 1.2], spreadMul: 0.7, reverb: 0.3, delay: 0.2 },
  { midi: 67, dur: 2, attack: 0.3, release: 1, open: 3000, motion: 0, tremolo: 1 },
  { midi: 72, dur: 0.4, attack: 5, release: 0.001, open: 20000, motion: 2, knobs: { brightnessHz: 99999, hold: -1, attack: Number.NaN } },
];
const KEYS_NOTES: P[] = [
  { midi: 64, dur: 0.24, vel: 1 },
  { midi: 52, dur: 0.6, vel: 0.5, tremolo: 1, knobs: KNOBS_KEYS, doubleTop: 1, open: 1500, lpMul: [1, 0.5], reverb: 0.4 },
  { midi: 76, dur: 2, vel: 0.7, sustain: true, attack: 0.1, release: 0.5, fadeCurve: 1 },
];
const PIANO_NOTES: P[] = [
  { midi: 64, dur: 0.6, vel: 0.7 },
  { midi: 40, dur: 2, vel: 1, sustainLevel: 0.72, partialDecay: 0.16, unisonCents: 1.8, hammerLevel: 0.12, harmonicBody: 1, decayFast: 0.85, ring: 7, hall: 0.3, lpMul: [1, 2] },
  { midi: 96, dur: 0.15, vel: 0.05, ring: 0, decayFast: 5, sustainLevel: 0 },
];
const VOCAL_NOTES: P[] = [
  { midi: 64, dur: 0.6 },
  { midi: 70, dur: 2, sourceTilt: 2.4, formantScale: 0.72, formantWidth: 1.35, vocalDetune: 0, open: 1400, fadeCurve: 1, vowelFrom: 0.95, vowelTo: 0.95, vowelSeconds: 1.4, breath: 0.018, vibratoCents: 0, dry: 0.8, attack: 0.22, release: 0.55, reverb: 0.1, delay: 0 },
  { midi: 55, dur: 1.5, vowel: 'ah', vowelTo: 'oo', vibratoCents: 6, vibratoHz: 5, vibratoDelay: 0.3, sourceTilt: 9, formantScale: 3 },
];

/** One case: a voice, a note and a room, and whether the voice's preparation runs before the note. */
export interface PrintCase { id: string; voice: string; p: P; room: string; prepared?: boolean }

export function cases(): PrintCase[] {
  const out: PrintCase[] = [];
  for (const room of Object.keys(ROOMS)) {
    for (const timbre of [undefined, 'strings', 'swell', 'organ', 'rhodes', 'ep', 'nobody'])
      PAD_NOTES.forEach((p, i) => out.push({ id: `pad:${timbre ?? '-'}:${i}:${room}`, voice: 'pad', p: timbre === undefined ? p : { ...p, timbre }, room }));
    for (const preset of [undefined, 'rhodes', 'glass', 'ep', 'organ', 'pluck', 'nobody'])
      KEYS_NOTES.forEach((p, i) => out.push({ id: `keys:${preset ?? '-'}:${i}:${room}`, voice: 'keys', p: preset === undefined ? p : { ...p, preset }, room }));
    PIANO_NOTES.forEach((p, i) => {
      out.push({ id: `piano:live:${i}:${room}`, voice: 'piano', p, room });
      out.push({ id: `piano:prepared:${i}:${room}`, voice: 'piano', p, room, prepared: true });
    });
    VOCAL_NOTES.forEach((p, i) => out.push({ id: `wordlessVocal:${i}:${room}`, voice: 'wordlessVocal', p, room }));
  }
  return out;
}

// --- the log -------------------------------------------------------------------

const SKIP = new Set(['params', 'starts', 'stops', 'connections', 'sets', 'curveHeld', 'bufferHeld']);
const num = (v: unknown): unknown => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v);

/** Everything a context was asked to build, as plain data in the order it was asked. */
export function logOf(ctx: StandinContext): unknown[] {
  const where = new Map<unknown, string>();
  ctx.nodes.forEach((n, i) => {
    where.set(n, `${i}`);
    for (const [k, p] of Object.entries(n.params)) where.set(p, `${i}.${k}`);
  });
  const ref = (x: unknown): unknown => where.get(x) ?? (x instanceof StandinNode || x instanceof StandinParam ? '?' : typeof x);
  const deep = (v: unknown): unknown => (Array.isArray(v) ? v.map(deep) : num(v));
  return ctx.nodes.map((n) => {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n)) {
      if (SKIP.has(k) || k in n.params) continue;
      if (v === null || typeof v !== 'object') props[k] = num(v);
    }
    const params: Record<string, unknown> = {};
    for (const [k, p] of Object.entries(n.params)) {
      const initial = k === 'gain' || k === 'playbackRate' || k === 'ratio' ? 1 : 0;
      if (p.events.length || p.value !== initial) params[k] = { value: num(p.value), events: p.events.map(deep) };
    }
    return { props, params, sets: n.sets.map(deep), starts: n.starts.map(deep), stops: n.stops.map(deep), to: n.connections.map(ref) };
  });
}

// An offline context that keeps itself, so a prepared body's own graph is part
// of the print: the strings a piano note reads are the strings it was warmed with.
const offlines: StandinContext[] = [];
class Keeping extends OfflineStandin {
  constructor(...a: ConstructorParameters<typeof OfflineStandin>) { super(...a); offlines.push(this); }
}

/** One case, played on a fresh recorder: what it built, and the instant the voice said it ends. */
export async function play(c: PrintCase): Promise<{ end: unknown; log: unknown[]; offline: unknown[][] }> {
  const g = globalThis as unknown as { OfflineAudioContext?: unknown };
  const was = g.OfflineAudioContext;
  g.OfflineAudioContext = Keeping;
  offlines.length = 0;
  try {
    const ctx = standin(48000);
    const S = ROOMS[c.room];
    const out = Object.fromEntries(['dry', 'delay', 'reverb', 'room', 'hall', 'background', 'immersed', 'echo'].map((k) => [k, ctx.node(`out:${k}`)]));
    const p = structuredClone(c.p);
    if (c.prepared) await prepareVoices(ctx, S, [{ voice: c.voice, t: 0.5, p }] as never, { all: true });
    const end = VOICES[c.voice](ctx, out as never, 0.5, p as never, S);
    // what a live miss queued for the next task is not part of the note
    const kept = c.prepared ? offlines.map(logOf) : [];
    return { end: num(end), log: logOf(ctx), offline: kept };
  } finally {
    g.OfflineAudioContext = was;
  }
}

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** Every case's print. */
export async function prints(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of cases()) out[c.id] = sha(await play(c));
  return out;
}

// --- the command line ------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dump = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null;
  if (dump) {
    fs.mkdirSync(dump, { recursive: true });
    for (const c of cases()) fs.writeFileSync(path.join(dump, `${c.id.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(await play(c), null, 1));
    process.stdout.write(`${cases().length} logs in ${dump}\n`);
  }
  const now = await prints();
  if (args.includes('--write')) {
    fs.writeFileSync(PRINTS, `${JSON.stringify({ note: 'what pad, keys, piano and wordlessVocal build on the recording stand-in, by case (tools/voice-prints.ts): taken from the modules before round SOUNDS-R3', prints: now }, null, 1)}\n`);
    process.stdout.write(`${Object.keys(now).length} prints written to ${path.relative(process.cwd(), PRINTS)}\n`);
  } else {
    const was = JSON.parse(fs.readFileSync(PRINTS, 'utf8')).prints as Record<string, string>;
    const differ = Object.keys(was).filter((k) => was[k] !== now[k]);
    const extra = Object.keys(now).filter((k) => !(k in was));
    process.stdout.write(differ.length || extra.length
      ? `${differ.length} of ${Object.keys(was).length} prints differ: ${differ.slice(0, 20).join(', ')}${extra.length ? `; ${extra.length} cases with no print` : ''}\n`
      : `${Object.keys(was).length} prints equal\n`);
    process.exitCode = differ.length || extra.length ? 1 : 0;
  }
}
