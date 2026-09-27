import assert from 'node:assert/strict';
import test from 'node:test';
import { INSTRUMENTS } from '../src/params.ts';
import { pianoNoteSettings, pianoStringKey } from '../src/voices/piano.ts';

test('an omitted piano character keeps the legacy settings and cache identity', () => {
  const base = INSTRUMENTS.piano;
  assert.equal(pianoNoteSettings({midi:60,vel:.7},base),base);
  const key = pianoStringKey(60,.7,2,base);
  assert.equal(key,`${60}:${.7}:${2}:${base.unisonCents}:${base.unisonLevel}:${base.attack}:${base.stretchCents}:${base.partialDecay}:${base.partialLevel}`);
  assert.equal(pianoStringKey(60,.7,2,pianoNoteSettings({harmonicBody:0},base)),key);
});

test('piano characters isolate cached string bodies without mutating shared settings', () => {
  const base=Object.freeze({...INSTRUMENTS.piano});
  const first=pianoNoteSettings({harmonicBody:.9,partialDecay:.3,unisonCents:2.2,sustainLevel:.58},base);
  const second=pianoNoteSettings({sustainLevel:.6,hammerLevel:.1},base);
  assert.notEqual(pianoStringKey(60,.7,2,first),pianoStringKey(60,.7,2,base));
  assert.equal(pianoStringKey(60,.7,2,second),pianoStringKey(60,.7,2,base),'live envelope controls must not duplicate identical cached strings');
  assert.equal(base.partialDecay,INSTRUMENTS.piano.partialDecay);
  assert.equal(first.harmonicBody,.9);
  assert.equal(second.partialDecay,base.partialDecay);
  // Taken into their ranges at the voice: an end past its range plays the end,
  // and a value that is not a number plays the piano block's own.
  assert.equal(pianoNoteSettings({partialDecay:NaN},base),base);
  assert.equal(pianoNoteSettings({unisonCents:Infinity},base),base);
  assert.equal(pianoNoteSettings({harmonicBody:2},base).harmonicBody,1);
  assert.equal(pianoNoteSettings({sustainLevel:0},base).sustainLevel,.05);
  assert.equal(pianoNoteSettings({decayFast:-1},base).decayFast,.04);
});
