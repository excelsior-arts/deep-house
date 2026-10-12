// Optional envelope contract and transport continuation, independent of a style.
import assert from 'node:assert/strict';
import { withOutputEnvelope, remainingCurve } from '../src/voices/output-envelope.ts';
import { StandinContext } from './standin.ts';
import type { VoiceOut } from '../src/dsp.ts';
import type { Settings } from '../src/settings.ts';
import type { NoteParams } from '../src/voices/descriptor.ts';
const standin = new StandinContext(), ctx = standin as unknown as BaseAudioContext;
const out: VoiceOut = { dry: standin.destination as unknown as AudioNode };
const note = { dur: 1, midi: 28 }, settings = {} as Settings;
let heard: { out: VoiceOut; p: NoteParams } | undefined;
const play = withOutputEnvelope((_ctx, out, _at, p) => { heard = { out, p }; return 2; });
const count = standin.nodes.length;
assert.equal(play(ctx, out, 1, note, settings), 2);
assert.equal(standin.nodes.length, count);
assert.equal(heard!.out, out); assert.equal(heard!.p, note);
for (const directEnvelope of [
  { kind: 'points', curve: [0, 1, .5, NaN] },
  { kind: 'points', curve: [0, 1, 0, .5] },
  { kind: 'samples', seconds: -1, values: [0, 1] },
  { kind: 'samples', seconds: 1, values: [0, Infinity] },
  { kind: 'samples', seconds: 1, values: [0, 3] },
]) assert.throws(() => play(ctx, out, 1, { ...note, directEnvelope }, settings), /Invalid/);
assert.deepEqual(remainingCurve([0, 0, 1, 1, 2, .5], .5), [0, .5, .5, 1, 1.5, .5]);
const directEnvelope = { kind: 'points', curve: [0, 1, 1, .5] };
assert.equal(play(ctx, out, 1, { ...note, directEnvelope }, settings), 2);
assert.notEqual(heard!.out.dry, out.dry);
directEnvelope.curve[3] = NaN;
assert.throws(() => play(ctx, out, 1, { ...note, directEnvelope }, settings), /Invalid/);
console.log('Direct envelopes: absent path unchanged; invalid data rejected; mutable input revalidated; continuation retains current level.');
