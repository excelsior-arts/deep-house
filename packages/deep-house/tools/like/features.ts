// like/features.ts — what a track is, as numbers, for `fingerprint.ts` and
// `find-like.ts`. No command line here: the two tools share this file.
//
// ## Two kinds of term
//
// A fingerprint is written to outlive the composer that played it. Eugene
// (09-26): "when the engine's structure changes we can still try to find a
// similar track at other coordinates". So every term is one of two kinds, and
// the file keeps them apart:
//
// - **structural** (`music`, `audio`): facts a future composer still produces
//   whatever it calls its lanes — the tempo, the key and its mode, whether the
//   drums play, the section kinds' proportions and the intro and outro, and per
//   **role** (kick, hats, backbeat, percussion, bass, pad, keys, texture, fx)
//   how much of the theme it sounds in, how many notes it plays, where it sits
//   in pitch, how long it holds, and how far apart its onsets are (the pad's
//   chord rhythm, the texture's interval). And what the record measures as
//   sound: third-octave LTAS, LUFS by section kind, the sub's share, and the
//   level of the quiet texture under the bass (the "whistle" of 27191 t3).
// - **engine-bound** (`engine`): the voice names per role, the dice (timbres,
//   room, masks, voicing, scene), the strategy id and the build it was taken
//   on. The distance reads this block **only when both sides carry the same
//   strategy id** (`engineComparable`); across an engine change it is skipped
//   and the structural terms and the audio decide.
//
// **The one place a role is read off the engine is `roleOf`** below: a layer
// name and the event's `role`. When a future composer renames its layers, that
// function is what gets a line, and every fingerprint already written still
// reads, because what it stores is the role and not the layer.
//
// Known limits of today's roles: a lead that the engine plays on the pad layer
// (27191 t3's wave pad holds both the bed and the lead) reads as `pad`, and a
// lead on the keys layer reads as `keys`; the engine's events do not separate
// them, so the fingerprint does not pretend to.
//
// The audio is the final judge: `find-like.ts --render` renders each candidate
// and ranks by the audio distance weighted over the plan's.

import crypto from 'node:crypto';
import { planTheme, programOf, recipesFor } from '../../src/mix.ts';
import { linkRead, linkWrite } from '../../src/link.ts';
import { loudnessWindow } from '../../src/loudness.ts';
import { thirdOctaves, integratedLoudness, THIRDS } from '@deep-house/engine/meter';

export const SCHEMA = 1;
export const RATE = 48000;

// --- the coordinate ------------------------------------------------------------

/** A link (with or without its `?`) as the page reads it: seed, theme, engine, spell, recipe. */
export function coordinateOf(search) {
  const s = search.includes('?') ? search.slice(search.indexOf('?')) : `?${search}`;
  const link = linkRead(s, { trial: false }).link;
  if (!link.seed) throw new Error(`the link names no seed: ${search}`);
  return { seed: link.seed, theme: link.theme, strategy: link.strategy, spell: link.spell, search: s };
}

/** The written link of a coordinate, the way the page writes one (`v=2`, every sound row). */
export const linkOf = (c) => `?${linkWrite({ seed: String(c.seed), theme: c.theme, strategy: c.strategy, spell: c.spell ?? null })}`;

/** Plan a coordinate exactly as a page opened on its link would. */
export function planOf(c) {
  const search = c.search ?? linkOf(c);
  const cast = recipesFor({ masterSeed: String(c.seed), strategy: c.strategy, search });
  const track = planTheme(String(c.seed), c.theme, { strategy: c.strategy, search, spell: cast.spell, recipe: cast.track });
  return { track, program: programOf(track), search };
}

// --- roles -------------------------------------------------------------------------

const LAYER_ROLE = { kick: 'kick', hats: 'hats', clap: 'backbeat', shaker: 'percussion', sixteenths: 'percussion', bass: 'bass', pad: 'pad', keys: 'keys', fx: 'fx' };
export const ROLES = ['kick', 'hats', 'backbeat', 'percussion', 'bass', 'pad', 'keys', 'texture', 'fx'];
const DRUM_ROLES = new Set(['kick', 'hats', 'backbeat', 'percussion']);

/** The role an event plays: the one place a lane name is read (see the header). */
export function roleOf(e) {
  if (e.role === 'texture') return 'texture';
  return LAYER_ROLE[e.layer] ?? e.layer;
}

/** The `layer|role` pairs of a program that play a role, for a solo render in the page. */
export const keysOfRole = (program, role) => [...new Set(program.events.filter((e) => roleOf(e) === role).map((e) => `${e.layer}|${e.role ?? ''}`))];

// --- the music -------------------------------------------------------------------

const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(3));

/** Structural facts of a plan: nothing in here names a lane, a voice or a die. */
export function musicOf(track, program) {
  const bs = program.barSeconds, beat = bs / 4, bars = track.bars;
  const secs = track.arrangement.sections;
  const kindBars = {};
  for (const s of secs) kindBars[s.kind] = (kindBars[s.kind] || 0) + s.bars;
  const kindShare = Object.fromEntries(Object.entries(kindBars).map(([k, v]) => [k, r3(v / bars)]));
  const lead = (kind) => { let n = 0; for (const s of secs) { if (s.kind !== kind) break; n += s.bars; } return n; };
  const tail = (kind) => { let n = 0; for (const s of [...secs].reverse()) { if (s.kind !== kind) break; n += s.bars; } return n; };
  const key = track.key || {};
  const roles = {};
  for (const role of ROLES) {
    const es = program.events.filter((e) => roleOf(e) === role);
    if (!es.length) continue;
    const on = new Set();
    for (const e of es) {
      const b0 = Math.floor(e.t / bs + 1e-9);
      const d = typeof e.p.dur === 'number' ? e.p.dur : 0;
      const b1 = Math.max(b0, Math.floor((e.t + d) / bs - 1e-9));
      for (let b = b0; b <= Math.min(b1, bars - 1); b++) on.add(b);
    }
    const midis = es.map((e) => e.p.midi).filter((m) => typeof m === 'number');
    const holds = es.map((e) => e.p.dur).filter((d) => typeof d === 'number' && d > 0).map((d) => d / beat);
    // onsets on a thirty-second grid, so a strummed chord is one onset
    const onsets = [...new Set(es.map((e) => Math.round(e.t / (beat / 8))))].sort((a, b) => a - b).map((k) => k * beat / 8);
    const gaps = onsets.slice(1).map((t, i) => (t - onsets[i]) / bs).filter((g) => g > 1e-6);
    roles[role] = {
      activeShare: r3(on.size / bars),
      notesPerActiveBar: r3(es.length / Math.max(1, on.size)),
      pitch: midis.length ? { median: median(midis), low: Math.min(...midis), high: Math.max(...midis) } : null,
      holdBeats: r3(median(holds)),
      onsetSpacingBars: r3(median(gaps)),
    };
  }
  const first = program.events.length ? Math.min(...program.events.map((e) => e.t)) : 0;
  return {
    bpm: program.bpm, bars, seconds: r3(program.duration),
    tonic: typeof key.root === 'number' ? ((key.root % 12) + 12) % 12 : null, mode: key.scaleName ?? null,
    drums: program.events.some((e) => DRUM_ROLES.has(roleOf(e))),
    form: { kindShare, sections: secs.length, introBars: lead('intro'), outroBars: tail('outro'), silentLeadBars: r3(first / bs) },
    roles,
  };
}

/** The engine's own words for the same plan: the distance reads these only between like engines. */
export function engineOf(c, track, program) {
  const voices = {};
  for (const e of program.events) (voices[roleOf(e)] ??= new Set()).add(e.p.timbre && e.p.timbre !== e.voice ? `${e.voice}/${e.p.timbre}` : e.voice);
  const d = track.dice || {};
  const pick = ['tempoFamily', 'band', 'scene', 'texture', 'preset', 'density', 'voicingStyle', 'padTimbre', 'leadTimbre', 'stabTimbre', 'keysPreset', 'fxPalette', 'progression', 'bassMask', 'stabMask', 'hatMask', 'breakMask', 'loopBars'];
  return {
    strategy: c.strategy,
    voices: Object.fromEntries(Object.entries(voices).map(([k, v]) => [k, [...v].sort()])),
    room: track.preset ?? null,
    dice: Object.fromEntries(pick.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])),
  };
}

// --- the audio ---------------------------------------------------------------------

/** The page's job: a window of a coordinate, optionally only some `layer|role` pairs, as 16-bit PCM. */
export const RENDER_JOB = async (job) => {
  const D = window.deepHouse;
  const cast = D.recipesFor({ masterSeed: job.seed, strategy: job.strategy, search: job.search });
  const track = D.planTheme(job.seed, job.theme, { strategy: job.strategy, search: job.search, spell: cast.spell, recipe: cast.track });
  const program = D.programOf(track);
  const bs = program.barSeconds;
  const tp = Math.max(0, job.fromBar - job.pre) * bs, t0 = job.fromBar * bs, t1 = Math.min(job.toBar * bs, program.duration);
  const last = t1 >= program.duration - 1e-6;
  let slice = D.sliceProgram(program, { from: tp, to: t1, tail: last ? 0 : 0.01 });
  if (job.keep) {
    const keep = new Set(job.keep);
    slice = { ...slice, events: slice.events.filter((e) => keep.has(`${e.layer}|${e.role ?? ''}`)).map((e, i) => ({ ...e, i })) };
  }
  const buf = await D.renderProgram(slice, { sampleRate: job.sampleRate });
  const a = Math.round((t0 - tp) * job.sampleRate);
  const b = last ? buf.length : Math.min(buf.length, Math.round((t1 - tp) * job.sampleRate));
  const L = buf.getChannelData(0).slice(a, b), R = buf.getChannelData(1).slice(a, b);
  const pcm = new Int16Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    pcm[2 * i] = Math.round(Math.max(-1, Math.min(1, L[i])) * 32767);
    pcm[2 * i + 1] = Math.round(Math.max(-1, Math.min(1, R[i])) * 32767);
  }
  const bytes = new Uint8Array(pcm.buffer); const chunks = [];
  for (let o = 0; o < bytes.length; o += 1 << 20) {
    let s = ''; const end = Math.min(bytes.length, o + (1 << 20));
    for (let i = o; i < end; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(end, i + 4096)));
    chunks.push(btoa(s));
  }
  return { chunks, bars: track.bars };
};

/**
 * Render bars `[from, to)` of a coordinate in windows of `win` bars with four of
 * pre-roll each, and hand back the 16-bit PCM joined. `keep` solos `layer|role` pairs.
 */
export async function renderBars(page, c, from, to, { keep = null, win = 24 } = {}) {
  const parts = [];
  for (let f = from; f < to; f += win) {
    const r = await page.evaluate(RENDER_JOB, { seed: String(c.seed), theme: c.theme, strategy: c.strategy, search: c.search ?? linkOf(c),
      fromBar: f, toBar: Math.min(to, f + win), pre: 4, keep, sampleRate: RATE });
    parts.push(Buffer.concat(r.chunks.map((x) => Buffer.from(x, 'base64'))));
  }
  return Buffer.concat(parts);
}

/** Two float channels out of interleaved 16-bit PCM. */
export function channelsOf(pcm) {
  const n = pcm.length >> 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = pcm.readInt16LE(4 * i) / 32768; R[i] = pcm.readInt16LE(4 * i + 2) / 32768; }
  return [L, R];
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const lufsOf = ([L, R]) => { const v = integratedLoudness([L, R], RATE); return Number.isFinite(v) ? v : null; };
const SUB_BANDS = THIRDS.map((f, i) => (f <= 100 ? i : -1)).filter((i) => i >= 0);

/**
 * The sound of a stretch: third-octave LTAS (dB re the 40 Hz-10 kHz total, the
 * median over eight-bar blocks that sound), LUFS, and the share of the energy in
 * the thirds up to 100 Hz (the sub, which reaches ~112 Hz at the band's edge).
 */
export function audioOf(chs, barSeconds) {
  const [L, R] = chs;
  const block = Math.round(8 * barSeconds * RATE);
  const rows = [];
  for (let s = 0; s + block / 2 <= L.length; s += block) {
    const l = L.subarray(s, Math.min(L.length, s + block)), r = R.subarray(s, Math.min(R.length, s + block));
    let e = 0; for (let i = 0; i < l.length; i++) e += l[i] * l[i];
    if (10 * Math.log10(e / l.length + 1e-30) < -60) continue;
    rows.push(thirdOctaves(l, r, RATE));
  }
  const thirds = THIRDS.map((_, i) => r3(median(rows.map((row) => row[i]))));
  const pw = thirds.map((d) => (d == null ? 0 : 10 ** (d / 10)));
  const tot = pw.reduce((a, b) => a + b, 0);
  return { lufs: lufsOf(chs), thirds, subShare: tot ? r3(SUB_BANDS.reduce((a, i) => a + pw[i], 0) / tot) : null };
}

/** LUFS of a solo against LUFS of another solo, in LU; null where either is silent. */
export function underLU(a, b) {
  const x = lufsOf(a), y = lufsOf(b);
  return x == null || y == null ? null : r3(x - y);
}

/** LUFS per section kind, the median over that kind's sections. */
export function lufsByKind(chs, track, barSeconds) {
  const by = {};
  for (const s of track.arrangement.sections) {
    const a = Math.round(s.startBar * barSeconds * RATE), b = Math.round((s.startBar + s.bars) * barSeconds * RATE);
    const v = lufsOf(chs.map((c) => c.subarray(a, Math.min(c.length, b))));
    if (v != null) (by[s.kind] ??= []).push(v);
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, r3(median(v))]));
}

/** The 32 bars the audio distance compares: the theme's loudness window (the first long main past bar 16). */
export const windowOf = (track) => { const w = loudnessWindow(track, 32); return { from: w.from, to: w.from + w.bars }; };

// --- the distance ----------------------------------------------------------------

/**
 * The weights, stated once. Structural groups are read always; `cast` only
 * between like engines. Each group is a distance in [0, 1]; the plan distance is
 * their weighted mean.
 */
export const WEIGHTS = { identity: 3, tempo: 3, form: 2, density: 2, harmony: 1, register: 1, hold: 1, cast: 4 };
/** With `--render`: the final score is this share of the audio distance plus the rest of the plan's. */
export const AUDIO_SHARE = 0.6;

const clip = (x) => Math.max(0, Math.min(1, x));
const lnr = (a, b, span) => (a > 0 && b > 0 ? clip(Math.abs(Math.log(a / b)) / Math.log(span)) : a === b ? 0 : 1);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); const u = new Set([...A, ...B]); if (!u.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return 1 - n / u.size; };
const FIFTHS = (a, b) => { const d = ((a - b) * 7 % 12 + 12) % 12; return Math.min(d, 12 - d) / 6; };

export const engineComparable = (a, b) => !!(a.engine && b.engine && a.engine.strategy === b.engine.strategy);

/** The plan distance of a candidate to a fingerprint, with each group's share. */
export function planDistance(fp, cand) {
  const A = fp.music, B = cand.music;
  const g = {};
  const rolesA = Object.keys(A.roles), rolesB = Object.keys(B.roles);
  const both = rolesA.filter((r) => B.roles[r]);
  const union = [...new Set([...rolesA, ...rolesB])];
  g.identity = 0.5 * (A.drums === B.drums ? 0 : 1) + 0.5 * jaccard(rolesA, rolesB);
  g.tempo = clip(Math.abs(Math.log2(A.bpm / B.bpm)) / 0.4);
  const kinds = [...new Set([...Object.keys(A.form.kindShare), ...Object.keys(B.form.kindShare)])];
  g.form = 0.5 * clip(kinds.reduce((s, k) => s + Math.abs((A.form.kindShare[k] || 0) - (B.form.kindShare[k] || 0)), 0) / 2)
    + 0.25 * clip(Math.abs(A.form.introBars - B.form.introBars) / 8)
    + 0.25 * mean(union.map((r) => Math.abs((A.roles[r]?.activeShare || 0) - (B.roles[r]?.activeShare || 0))));
  g.density = mean(union.map((r) => (A.roles[r] && B.roles[r] ? (lnr(A.roles[r].notesPerActiveBar, B.roles[r].notesPerActiveBar, 4)
    + (A.roles[r].onsetSpacingBars != null && B.roles[r].onsetSpacingBars != null ? lnr(A.roles[r].onsetSpacingBars, B.roles[r].onsetSpacingBars, 4) : 0)) / 2 : 1)));
  g.harmony = 0.5 * (A.mode === B.mode ? 0 : 1) + 0.5 * (A.tonic != null && B.tonic != null ? FIFTHS(A.tonic, B.tonic) : 1);
  const withPitch = both.filter((r) => A.roles[r].pitch && B.roles[r].pitch);
  g.register = withPitch.length ? mean(withPitch.map((r) => clip(Math.abs(A.roles[r].pitch.median - B.roles[r].pitch.median) / 12))) : (both.length ? 0 : 1);
  const withHold = both.filter((r) => A.roles[r].holdBeats && B.roles[r].holdBeats);
  g.hold = withHold.length ? mean(withHold.map((r) => lnr(A.roles[r].holdBeats, B.roles[r].holdBeats, 4))) : (both.length ? 0 : 1);
  if (engineComparable(fp, cand)) {
    const vr = [...new Set([...Object.keys(fp.engine.voices), ...Object.keys(cand.engine.voices)])];
    const dice = ['padTimbre', 'leadTimbre', 'keysPreset', 'scene', 'texture'];
    g.cast = 0.5 * mean(vr.map((r) => jaccard(fp.engine.voices[r] || [], cand.engine.voices[r] || [])))
      + 0.5 * mean([...dice.map((k) => (fp.engine.dice[k] === cand.engine.dice[k] ? 0 : 1)), fp.engine.room === cand.engine.room ? 0 : 1]);
  }
  let s = 0, w = 0;
  for (const [k, v] of Object.entries(g)) { s += WEIGHTS[k] * v; w += WEIGHTS[k]; }
  return { d: s / w, groups: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, +v.toFixed(3)])) };
}

/**
 * The audio distance of a candidate's window to the fingerprint's: the LTAS
 * shape (mean absolute third difference, 10 dB = 1; weight 3), the LUFS (6 LU =
 * 1; weight 1), the sub share (0.3 = 1; weight 1) and the quiet texture under
 * the bass (12 LU = 1, one side without it = 1; weight 1).
 */
export function audioDistance(a, b) {
  const pairs = a.thirds.map((x, i) => [x, b.thirds[i]]).filter(([x, y], i) => x != null && y != null && THIRDS[i] >= 40 && THIRDS[i] <= 10000);
  const shape = clip(mean(pairs.map(([x, y]) => Math.abs(x - y))) / 10);
  const loud = a.lufs != null && b.lufs != null ? clip(Math.abs(a.lufs - b.lufs) / 6) : 1;
  const sub = a.subShare != null && b.subShare != null ? clip(Math.abs(a.subShare - b.subShare) / 0.3) : 1;
  const tex = a.textureUnderBassLU == null && b.textureUnderBassLU == null ? 0
    : a.textureUnderBassLU == null || b.textureUnderBassLU == null ? 1 : clip(Math.abs(a.textureUnderBassLU - b.textureUnderBassLU) / 12);
  return { d: (3 * shape + loud + sub + tex) / 6, groups: { shape: +shape.toFixed(3), loud: +loud.toFixed(3), sub: +sub.toFixed(3), texture: +tex.toFixed(3) } };
}

/** The window's audio for a coordinate: the mix, and the texture's level under the bass. */
export async function windowAudio(page, c, track, program) {
  const w = windowOf(track);
  const mix = channelsOf(await renderBars(page, c, w.from, w.to, { win: 32 }));
  const tex = keysOfRole(program, 'texture'), bass = keysOfRole(program, 'bass');
  let textureUnderBassLU = null;
  if (tex.length && bass.length) {
    const t = channelsOf(await renderBars(page, c, w.from, w.to, { keep: tex, win: 32 }));
    const b = channelsOf(await renderBars(page, c, w.from, w.to, { keep: bass, win: 32 }));
    textureUnderBassLU = underLU(t, b);
  }
  return { bars: [w.from, w.to], ...audioOf(mix, program.barSeconds), textureUnderBassLU };
}
