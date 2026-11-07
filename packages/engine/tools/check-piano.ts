import assert from 'node:assert/strict';
import test from 'node:test';
import { INSTRUMENTS } from '../src/params.ts';
import { pianoNoteSettings, pianoStringKey } from '../src/voices/piano.ts';
import { BY_NAME } from '../src/voices/index.ts';

// the piano's own controls, as its row declares them (round SOUNDS-R3)
const C = BY_NAME.piano.controls!;
// (round piano-pool) every room plays a string: the instruments table's block with the row's own, as `withString` hands it
const ROOM = Object.freeze({ ...INSTRUMENTS.piano, string: (BY_NAME.piano.row!.parameters as { string: object }).string }) as unknown as Parameters<typeof pianoNoteSettings>[1];

test('an omitted piano character keeps the room settings and cache identity', () => {
  const base = ROOM;
  assert.equal(pianoNoteSettings({midi:60,vel:.7},base,C),base);
  const key = pianoStringKey(60,.7,2,base);
  assert.equal(key,`${60}:${.7}:${2}:${base.unisonCents}:${base.unisonLevel}:${base.attack}:${base.partialDecay}:${base.partialLevel}:string:${JSON.stringify(base.string)}`);
  assert.equal(pianoStringKey(60,.7,2,pianoNoteSettings({harmonicBody:0},base,C)),key);
});

test('piano characters isolate cached string bodies without mutating shared settings', () => {
  const base=Object.freeze({...ROOM});
  const first=pianoNoteSettings({harmonicBody:.9,partialDecay:.3,unisonCents:2.2,sustainLevel:.58},base,C);
  const second=pianoNoteSettings({sustainLevel:.6,hammerLevel:.1},base,C);
  assert.notEqual(pianoStringKey(60,.7,2,first),pianoStringKey(60,.7,2,base));
  assert.equal(pianoStringKey(60,.7,2,second),pianoStringKey(60,.7,2,base),'live envelope controls must not duplicate identical cached strings');
  assert.equal(base.partialDecay,INSTRUMENTS.piano.partialDecay);
  assert.equal(first.harmonicBody,.9);
  assert.equal(second.partialDecay,base.partialDecay);
  // Taken into their ranges at the voice: an end past its range plays the end,
  // and a value that is not a number plays the piano block's own.
  assert.equal(pianoNoteSettings({partialDecay:NaN},base,C),base);
  assert.equal(pianoNoteSettings({unisonCents:Infinity},base,C),base);
  assert.equal(pianoNoteSettings({harmonicBody:2},base,C).harmonicBody,1);
  assert.equal(pianoNoteSettings({sustainLevel:0},base,C).sustainLevel,.05);
  assert.equal(pianoNoteSettings({decayFast:-1},base,C).decayFast,.04);
});
