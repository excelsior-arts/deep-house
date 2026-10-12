// A sound row against its topology's contract, one identity from admission to
// the note: what a row may carry (`voices/schema.ts`), whose block it may name
// (`BLOCKS` in `params.ts`), and that what a preparation warms is what the note
// plays. No browser and no audio device: the stand-ins record what is built.
//
//   node --test tools/check-sounds.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY, ROWS, TIMBRE_ROWS, TOPOLOGIES, admitBlocks, rowsThrough } from '../src/voices/index.ts';
import { asSound, soundDescriptor, soundFaults, patchOf, rowBase, voicedPatch } from '../src/voices/sound.ts';
import { resolveSettings } from '../src/settings.ts';
import { VOICINGS, BLOCKS } from '../src/params.ts';
import { PRINTS, prints } from './voice-prints.ts';
import { stringCacheSize } from '../src/voices/karplus-pluck.ts';
import { pickCacheSize } from '../src/voices/pluck-bass.ts';
import { INSTRUMENTS } from '../src/params.ts';
import { standin, StandinContext } from './standin.ts';
import type { Settings } from '../src/settings.ts';
import type { NumField } from '../src/voices/schema.ts';
import { table } from './fixture.ts';

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sounds');
const read = (family: string, id: string) => JSON.parse(fs.readFileSync(path.join(SOUNDS, family, `${id}.json`), 'utf8'));
const settings = INSTRUMENTS as unknown as Settings;

test('every shipped row passes its topology\'s contract, and every row file is in the registry', () => {
  const files = fs.readdirSync(SOUNDS, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(SOUNDS, d.name)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
  // the registered voices and the rows the dispatchers render through (round SOUNDS-R3)
  const rows = [...REGISTRY, ...TIMBRE_ROWS].filter((d) => d.row).map((d) => d.row!);
  assert.ok(REGISTRY.every((d) => d.row), `a registered voice is not a row: ${REGISTRY.filter((d) => !d.row).map((d) => d.name).join(', ')}`);
  assert.deepEqual(rows.map((r) => r.id).sort(), files.sort());
  for (const row of rows) assert.deepEqual(soundFaults(row, TOPOLOGIES[row.topology]), [], row.id);
});

// E04 of the outside review of 10-03, its own counterexample: a driven reese
// with a clip hardness of nought passed admission and its curve was 2048
// samples of NaN. Nought is the curve's linear limit now; what would still
// divide by nought, or allocate without bound, is refused.
test('a reese clip at nought hardness is its straight-line limit, and what would divide by nought is refused', () => {
  const raw = read('bass', 'reeseDriven');
  raw.parameters.clip.hardness = 0;
  const row = asSound(raw);
  assert.deepEqual(soundFaults(row, TOPOLOGIES.reese), []);
  const ctx = standin(4000);
  soundDescriptor(row, TOPOLOGIES.reese).render(ctx, { dry: ctx.destination } as never, 0, { midi: 36, dur: 0.1 }, settings);
  const curves = ctx.nodes.filter((n) => n.type === 'shaper' && (n as unknown as { curve?: Float32Array }).curve);
  assert.ok(curves.length > 0, 'the clip built no shaper');
  for (const n of curves) assert.ok(Array.from((n as unknown as { curve: Float32Array }).curve).every(Number.isFinite), 'a sample of the curve is not a number');
  const refused = (change: (r: any) => void, what: RegExp) => {
    const r = read('bass', 'reeseDriven');
    change(r);
    const faults = soundFaults(asSound(r), TOPOLOGIES.reese);
    assert.ok(faults.some((f) => what.test(f)), `nothing refused ${what}: ${faults.join('; ')}`);
  };
  refused((r) => { r.parameters.clip.bend = -1; }, /clip\.bend is -1, under -0\.5/);
  refused((r) => { r.parameters.clip.hardness = -2; }, /clip\.hardness is -2/);
  refused((r) => { r.parameters.saws = 0; }, /saws is 0, not above 0/);
  refused((r) => { r.parameters.cutoffHz = 'loud'; }, /cutoffHz is "loud", not a finite number/);
  refused((r) => { r.parameters.clip.knee = 1; }, /clip\.knee is not a field/);
});

test('bounded counts, buffer lengths and words are held to their contracts', () => {
  const refused = (family: string, id: string, change: (r: any) => void, what: RegExp) => {
    const r = read(family, id);
    change(r);
    const row = asSound(r);
    const faults = soundFaults(row, TOPOLOGIES[row.topology]);
    assert.ok(faults.some((f) => what.test(f)), `${id}: nothing refused ${what}: ${faults.join('; ')}`);
  };
  refused('ensemble', 'supersawPad', (r) => { r.parameters.voices = 400; }, /voices is 400, over 16/);
  refused('ensemble', 'supersawPad', (r) => { r.parameters.voices = 2.5; }, /not a whole number/);
  refused('keyboard', 'karplusPluck', (r) => { r.parameters.maxSeconds = 600; }, /maxSeconds is 600, over 10/);
  refused('keyboard', 'karplusPluck', (r) => { r.parameters.decay = 0; }, /decay is 0, not above 0/);
  refused('drum', 'conga', (r) => { r.parameters.variants = 40; }, /variants is 40, over 8/);
  refused('drum', 'conga', (r) => { r.parameters.seconds = 90; }, /seconds is 90, over 8/);
  refused('bass', 'pluckBass', (r) => { r.parameters.oversample = '8x'; }, /oversample is "8x", not one of none, 2x, 4x/);
  refused('keyboard', 'organStab', (r) => { r.parameters.bars = r.parameters.bars.map(([m]: number[]) => [m, 0]); }, /add up to nothing/);
  refused('keyboard', 'fmBell', (r) => { r.parameters.tone = 'gong'; }, /tone "gong" is not one of ratios/);
  refused('ensemble', 'formantPad', (r) => { r.parameters.q = [6.5, 8.5]; }, /q has 2 entries, where 3 are wanted/);
  refused('noise', 'crash', (r) => { r.parameters.pingLevel = 0.3; }, /a ping at 0\.3 with no pitch/);
  refused('ensemble', 'shimmerPad', (r) => { r.parameters.ringRatio = 8; }, /past the half second/);
});

test('a room may voice a row\'s block, and may not voice it out of its contract', () => {
  admitBlocks({ ...INSTRUMENTS });
  admitBlocks({ ...INSTRUMENTS, kick: { ...INSTRUMENTS.kick, drive: 0.3 } });
  assert.throws(() => admitBlocks({ ...INSTRUMENTS, kick: { ...INSTRUMENTS.kick, drive: -1 } }), /kick block \(kick\): drive is -1, under 0/);
  assert.throws(() => admitBlocks({ ...INSTRUMENTS, karplusPluck: { ...INSTRUMENTS.karplusPluck, decay: 0 } }), /karplusPluck block/);
  // the bass block carries the bus's half beside the sub's: a block may
  assert.ok('comp' in INSTRUMENTS.bass);
});

// E05 of the outside review of 10-03, its own counterexample: the documented
// copy-a-row workflow kept `block`, the copy passed admission, and its doubled
// trim resolved to the incumbent's 1.4.
test('a copy that keeps another row\'s block is refused, and a copy without one is its own numbers', () => {
  const kept = read('keyboard', 'karplusPluck');
  kept.id = 'karplusVariant';
  kept.parameters.trim = 2.8;
  const row = asSound(kept);
  assert.ok(soundFaults(row, TOPOLOGIES.karplus).some((f) => /the block karplusPluck is karplusPluck's/.test(f)));
  assert.throws(() => patchOf<{ trim: NumField }>(settings, row, TOPOLOGIES.karplus.parameters), /not this row's/);
  const copy = read('keyboard', 'karplusPluck');
  copy.id = 'karplusVariant';
  copy.parameters.trim = 2.8;
  delete copy.block;
  const own = asSound(copy);
  assert.deepEqual(soundFaults(own, TOPOLOGIES.karplus), []);
  assert.equal(patchOf<{ trim: NumField }>(settings, own, TOPOLOGIES.karplus.parameters).trim, 2.8);
  const stray = read('keyboard', 'karplusPluck');
  stray.block = 'nowhere';
  assert.throws(() => asSound(stray), /not a block of the instruments table/);
});

// E06 of the outside review of 10-03, its own counterexample: a blockless
// Karplus variant was warmed as the incumbent string and computed its own on
// the play path. The contract: a prepared note builds no buffer of its own when
// it is played with the row, settings and controls it was prepared with.
test('a prepared note of a variant builds no buffer when it is played', async () => {
  const k = read('keyboard', 'karplusPluck');
  k.id = 'karplusShort';
  delete k.block;
  k.parameters.maxSeconds = 0.02;
  k.parameters.decay = 0.03;
  const kd = soundDescriptor(asSound(k), TOPOLOGIES.karplus);
  const kc = standin(4000);
  const note = { midi: 60, vel: 1, dur: 0.1 };
  await kd.prepare!(kc, settings, [{ voice: 'karplusShort', t: 0, p: note }] as never, {});
  const strings = stringCacheSize(kc);
  assert.equal(strings, 1);
  kd.render(kc, { dry: kc.destination } as never, 0, note, settings);
  assert.equal(stringCacheSize(kc), strings, 'the variant computed its string on the play path');

  const b = read('bass', 'pluckBass');
  b.id = 'pluckShort';
  delete b.block;
  b.parameters.pickDecay = 0.004;
  const bd = soundDescriptor(asSound(b), TOPOLOGIES['pluck-bass']);
  const bc = standin(4000);
  await bd.prepare!(bc, settings, [{ voice: 'pluckShort', t: 0, p: { midi: 40 } }] as never, {});
  const picks = pickCacheSize(bc);
  bd.render(bc, { dry: bc.destination } as never, 0, { midi: 40, dur: 0.2 }, settings);
  assert.equal(pickCacheSize(bc), picks, 'the variant built its pick on the play path');
});

test('a prepared drum variant reads its rendered bodies, and constructs no offline context, when struck', async () => {
  const was = globalThis.OfflineAudioContext;
  let made = 0;
  // an offline context that builds into the stand-in and renders a buffer of the asked length
  class Recorder extends StandinContext {
    length: number; channels: number;
    constructor(channels: number, length: number, sampleRate: number) { super(sampleRate); this.channels = channels; this.length = length; made++; }
    startRendering() { return Promise.resolve(this.createBuffer(this.channels, this.length, this.sampleRate)); }
  }
  globalThis.OfflineAudioContext = Recorder as unknown as typeof OfflineAudioContext;
  try {
    const c = read('drum', 'conga');
    c.id = 'congaTight';
    delete c.block;
    c.parameters.t10Open = 0.05;
    const d = soundDescriptor(asSound(c), TOPOLOGIES.membrane);
    const ctx = standin(4000);
    const notes = [{ voice: 'congaTight', t: 0, p: { vel: 1 } }, { voice: 'congaTight', t: 0.5, p: { vel: 1, hit: 'slap' } }];
    await d.prepare!(ctx, settings, notes as never, {});
    const prepared = made;
    assert.ok(prepared > 0, 'the preparation rendered nothing for the variant');
    for (const n of notes) d.render(ctx, { dry: ctx.destination } as never, n.t, n.p, settings);
    assert.equal(made, prepared, 'a struck variant rendered its bodies on the play path');
  } finally {
    globalThis.OfflineAudioContext = was;
  }
});

// Round SOUNDS-R3, its own proof: the four voices that were modules — `pad`,
// `keys`, `piano`, `wordlessVocal` — render through rows and topologies now,
// and every note asks the recording stand-in for the graph the module asked
// for, node for node, number for number (`voice-prints.ts`: 174 cases, every
// timbre and patch, knobs and controls past their ends, the pad's motion, a
// room's voicing, a place's grain, the piano's strings live and prepared). The
// prints were taken from the modules before the round touched them.
test('the four voices that were modules build what the modules built, case for case', async () => {
  const was = JSON.parse(fs.readFileSync(PRINTS, 'utf8')).prints as Record<string, string>;
  const now = await prints();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(was).sort());
  const differ = Object.keys(was).filter((k) => was[k] !== now[k]);
  assert.deepEqual(differ, [], `${differ.length} cases build another graph: ${differ.slice(0, 12).join(', ')}`);
});

// One sound, one identity (E05), for the rows a block voices and does not own:
// a voicing names the rows it voices, a row may name only one that names it,
// and none is a block a row owns; at rest a voiced row plays its own numbers,
// and a room's voicing reaches the fields its topology says a room may voice
// and no other.
test('a voicing voices the rows it names and only those, and a row voiced by nothing is its own numbers', () => {
  for (const path of Object.keys(VOICINGS)) assert.ok(!Object.prototype.hasOwnProperty.call(BLOCKS, path), `${path} is a voicing and an owned block`);
  for (const [path, ids] of Object.entries(VOICINGS)) for (const id of ids) assert.ok(ROWS[id]?.voicedBy?.includes(path), `${path} voices ${id}, which does not name it`);
  const kept = read('keyboard', 'keysEp');
  kept.id = 'keysEpBright';
  const faults = soundFaults(asSound(kept), TOPOLOGIES.keys);
  assert.ok(faults.some((f) => /the voicing keys is keysRhodes and keysGlass and keysEp and keysOrgan and keysPluck's/.test(f)), faults.join('; '));
  // at rest: the instruments table's own room leaves every strings and keys row its own numbers, the same object
  for (const row of Object.values(ROWS).filter((r) => r.voicedBy)) {
    const p = voicedPatch(settings, row);
    for (const [k, v] of Object.entries(row.parameters)) assert.deepEqual(p[k], v, `${row.id}.${k}`);
  }
  // a room voices the body and the breath, and not the shape; a style's patch voices its own row only
  const S = resolveSettings({ base: table as never, overrides: { strings: { cutoffHz: 1200, breath: { level: 0.03, loHz: 6000, hiHz: 14000 } }, keyboardPatches: { ep: { cutoff: 1500 } } } });
  const swell = ROWS.stringsSwell;
  const sp = rowBase(S, swell);
  assert.equal(sp.cutoffHz, 1200);
  assert.deepEqual(sp.breath, { level: 0.03, loHz: 6000, hiHz: 14000 });
  assert.deepEqual(sp.shape, swell.parameters.shape);
  assert.equal(rowBase(S, ROWS.keysEp).cutoff, 1500);
  assert.equal(rowBase(S, ROWS.keysRhodes).cutoff, ROWS.keysRhodes.parameters.cutoff);
  assert.equal(patchOf(S, swell, TOPOLOGIES.strings.parameters), sp, 'the door handed a voiced row another object at rest');
  // and may not voice a row out of its contract
  assert.throws(() => resolveSettings({ base: table as never, overrides: { strings: { voices: 400 } } }), /stringsPad, as the room voices it.*voices is 400, over 16/);
  // an event renders through its own row and, where it dispatches, its timbre's
  assert.deepEqual(rowsThrough('pad', { timbre: 'swell' }).map((r) => r.id), ['pad', 'stringsSwell']);
  assert.deepEqual(rowsThrough('pad', {}).map((r) => r.id), ['pad', 'stringsPad']);
  assert.deepEqual(rowsThrough('keys', { preset: 'nobody' }).map((r) => r.id), ['keys', 'keysRhodes']);
  assert.deepEqual(rowsThrough('piano', {}).map((r) => r.id), ['piano']);
});
