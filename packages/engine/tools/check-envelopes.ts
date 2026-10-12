import assert from 'node:assert/strict';
import test from 'node:test';
import { adsrEnv, MIN_RELEASE } from '../src/dsp.ts';
import { INSTRUMENTS } from '../src/params.ts';
import { padNoteSettings } from '../src/voices/dispatch.ts';
import { BY_NAME } from '../src/voices/index.ts';
import type { Settings } from '../src/settings.ts';
import { vocalPartials } from '../src/voices/formant-pad.ts';
import { vocalNoteSettings } from '../src/voices/wordless-vocal.ts';

// the pad's controls and the vocal's own numbers and controls, as their rows declare them (round SOUNDS-R3)
const PAD = BY_NAME.pad.controls!;
const V = BY_NAME.wordlessVocal.row!.parameters as Parameters<typeof vocalNoteSettings>[2];
const VC = BY_NAME.wordlessVocal.controls!;

function capture() {
  const calls: any[][] = [];
  const gain = { value: 1,
    setValueAtTime: (...a: any[]) => calls.push(['set', ...a]),
    linearRampToValueAtTime: (...a: any[]) => calls.push(['linear', ...a]),
    exponentialRampToValueAtTime: (...a: any[]) => calls.push(['exponential', ...a]),
    setValueCurveAtTime: (...a: any[]) => calls.push(['curve', ...a]),
  };
  return { node: { gain } as unknown as GainNode, calls };
}

test('smooth fades preserve the note clock, ease at both ends, and finish at true zero', () => {
  const env={attack:.2,decay:.1,sustain:.6,hold:.7,release:.5};
  const legacy=capture(),explicit=capture(),smooth=capture();
  const end=adsrEnv(legacy.node,1,.8,env);
  assert.equal(adsrEnv(explicit.node,1,.8,{...env,fadeCurve:0}),end);
  assert.deepEqual(explicit.calls,legacy.calls);
  assert.equal(adsrEnv(smooth.node,1,.8,{...env,fadeCurve:1}),end);
  const curves=smooth.calls.filter(c=>c[0]==='curve');assert.equal(curves.length,2);
  const up=curves[0][1] as Float32Array,down=curves[1][1] as Float32Array;
  assert.equal(up[0],0);assert.equal(down.at(-1),0);
  assert.ok(up[1]-up[0] < up[32]-up[31]);
  assert.ok(down[63]-down[64] < down[31]-down[32]);
  assert.ok(up.every((v,i)=>i===0||v>=up[i-1]));
  assert.ok(down.every((v,i)=>i===0||v<=down[i-1]));
  assert.deepEqual(smooth.calls.at(-1),['set',0,end]);
  assert.ok(Math.abs(curves[1][2]+curves[1][3]+MIN_RELEASE-end)<1e-12);
  // A switch: anything but 1 is the legacy envelope, never a throw on the tick.
  const odd=capture();adsrEnv(odd.node,1,.8,{...env,fadeCurve:NaN});
  assert.deepEqual(odd.calls,legacy.calls);
});

test('a steady pad note removes intrinsic motion without changing any shared settings', () => {
  const settings={strings:Object.freeze({...INSTRUMENTS.strings}),keys:Object.freeze({...INSTRUMENTS.keys}),
    space:Object.freeze({padDriftCents:4})} as unknown as Settings;
  Object.freeze(settings);
  assert.equal(padNoteSettings(settings,{},PAD),settings);
  assert.equal(padNoteSettings(settings,{motion:1},PAD),settings);
  const steady=padNoteSettings(settings,{motion:0},PAD);
  assert.equal(steady.strings.detuneCents,0);assert.equal(steady.strings.ensembleWet,0);
  assert.equal(steady.strings.vibratoCents,0);assert.equal(steady.space.padDriftCents,0);
  assert.equal(steady.keys.rotaryDepth,0);assert.equal(steady.keys.tremoloDepth,0);
  assert.equal(steady.strings.sustain,settings.strings.sustain);
  assert.equal(steady.strings.cutoffHz,settings.strings.cutoffHz);
  assert.equal(settings.strings.detuneCents,INSTRUMENTS.strings.detuneCents);
  assert.equal(padNoteSettings(settings,{motion:.5},PAD).strings.vibratoCents,settings.strings.vibratoCents*.5);
  // Taken into its range at the voice: a value past an end plays the end, and
  // one that is not a number plays the room's own motion.
  assert.equal(padNoteSettings(settings,{motion:NaN},PAD),settings);
  assert.equal(padNoteSettings(settings,{motion:2},PAD),settings);
  assert.equal(padNoteSettings(settings,{motion:-1},PAD).strings.detuneCents,0);
});

test('vocal excitation and formant controls are bounded and isolated from the old pad', () => {
  const settings={formantPad:INSTRUMENTS.formantPad} as unknown as Settings;
  const before=structuredClone(settings), legacy=vocalNoteSettings(settings,{},V,VC);
  assert.equal(legacy.detuneCents,3);assert.equal(legacy.spread,.16);
  assert.equal(legacy.vowels,settings.formantPad.vowels);
  const dark=vocalNoteSettings(settings,{sourceTilt:2,formantScale:.8,formantWidth:1.5,vocalDetune:0},V,VC);
  assert.equal(dark.vowels.ah[0],settings.formantPad.vowels.ah[0]*.8);
  assert.equal(dark.q[0],settings.formantPad.q[0]/1.5);
  assert.deepEqual(settings,before);
  const bright=vocalPartials(1),soft=vocalPartials(2);
  assert.equal(soft[0],0);assert.equal(soft[1],bright[1]);
  assert.ok(soft.slice(2).every((p,i)=>Math.abs(p)<Math.abs(bright[i+2])));
  // Taken into their ranges at the voice rather than refused on the tick.
  assert.deepEqual(vocalNoteSettings(settings,{sourceTilt:NaN},V,VC),legacy);
  assert.equal(vocalNoteSettings(settings,{formantScale:0},V,VC).vowels.ah[0],settings.formantPad.vowels.ah[0]*.6);
  assert.equal(vocalNoteSettings(settings,{formantWidth:3},V,VC).q[0],settings.formantPad.q[0]/2);
  assert.equal(vocalNoteSettings(settings,{vocalDetune:-1},V,VC).detuneCents,0);
  assert.deepEqual(vocalNoteSettings(settings,{open:Infinity},V,VC),legacy);
  assert.throws(()=>vocalPartials(.5),/sourceTilt/);
});
