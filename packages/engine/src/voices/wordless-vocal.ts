// A wordless sung syllable, independent of the pad's envelope and drift.
// It borrows the common formant resonator, not the pad player. Notes preserve
// the requested pitch; a mouth opening, delayed vibrato and breath shape the
// syllable. The composer supplies phrase-level entrances and endings.
import { adsrEnv, noiseSource, route, startTime } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { SEND_CONTROL, withControls } from './descriptor.ts';
import type { Controls, Descriptor, NoteParams } from './descriptor.ts';
import { formantBody } from './formant-pad.ts';
import { insert } from './treat.ts';

/**
 * What a phrase may write on a syllable. The syllable's own numbers are the
 * defaults (`wordlessVocal` below); the body's are the formant body's
 * (`formantPad` block), where `sourceTilt` has none because an absent tilt is
 * the plain sawtooth, which no tilt is. `vowelSeconds` and `vibratoDelay`
 * follow the note's length unless a phrase says. `dry` is a send.
 */
export const VOCAL_CONTROLS: Controls = {
  attack: { unit: 'seconds', min: 0.005, max: 1, default: 0.065 },
  release: { unit: 'seconds', min: 0.02, max: 2, default: 0.16 },
  vowelFrom: { unit: 'ratio', min: 0, max: 1, default: 0.15 },
  vowelTo: { unit: 'ratio', min: 0, max: 1, default: 0.85 },
  vowelSeconds: { unit: 'seconds', min: 0.01, max: 4, default: null },
  breath: { unit: 'level', min: 0, max: 0.3, default: 0.055 },
  vibratoCents: { unit: 'cents', min: 0, max: 20, default: 4 },
  vibratoHz: { unit: 'hz', min: 1, max: 8, default: 4.7 },
  vibratoDelay: { unit: 'seconds', min: 0, max: 2, default: null },
  dry: { ...SEND_CONTROL, default: 0.8 },
  fadeCurve: { unit: 'switch', min: 0, max: 1, default: 0 },
  sourceTilt: { unit: 'ratio', min: 1, max: 3, default: null },
  formantScale: { unit: 'ratio', min: 0.6, max: 1.4, default: 1 },
  formantWidth: { unit: 'ratio', min: 0.5, max: 2, default: 1 },
  vocalDetune: { unit: 'cents', min: 0, max: 6, default: 3 },
  open: { unit: 'hz', min: 700, max: 8000, default: 4600 },
};
export function vocalNoteSettings(settings: Settings, p: NoteParams): Settings['formantPad'] {
  p = withControls(p, VOCAL_CONTROLS);
  const base=settings.formantPad;
  const vowels={...base.vowels};
  if (p.formantScale!==undefined) for (const k of Object.keys(vowels) as (keyof typeof vowels)[])
    vowels[k]=vowels[k].map(f=>f*p.formantScale);
  return {...base,detuneCents:p.vocalDetune ?? 3,spread:.16,
    ...(p.formantScale!==undefined ? {vowels} : {}),
    ...(p.formantWidth!==undefined ? {q:base.q.map(q=>q/p.formantWidth)} : {}),
  };
}

// A control's default, as the note reads it where the note says nothing: the
// control table is the one place the number is written (round (f) of the
// reconciled review of 09-24, D44: they were literals here as well).
const D = (name: string): number => VOCAL_CONTROLS[name].default as number;

export function wordlessVocal(ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, VOCAL_CONTROLS);
  const time=startTime(ctx,at), dur=Math.max(.08,p.dur ?? .6);
  const attack=Math.min(p.attack ?? D('attack'),dur*.4), decay=Math.min(.12,dur*.3);
  const F=vocalNoteSettings(settings,p);
  const g=ctx.createGain();
  const end=adsrEnv(g,time,(p.vel ?? .8)*(p.gain ?? 1)*F.trim,{
    attack,decay,sustain:.82,hold:Math.max(0,dur-attack-decay),release:p.release ?? D('release'),fadeCurve:p.fadeCurve,
  });
  const controls={vowelFrom:D('vowelFrom'),vowelTo:D('vowelTo'),vowelSeconds:Math.min(.35,dur),
    vibratoCents:D('vibratoCents'),vibratoHz:D('vibratoHz'),vibratoDelay:Math.min(.25,dur*.5),...p,dur};
  const built=formantBody(ctx,g,time,controls,F,settings.space,0);
  const breath=noiseSource(ctx,time,end-time+.02), breathGain=ctx.createGain();
  breathGain.gain.value=p.breath ?? D('breath');
  breath.connect(breathGain);breathGain.connect(built.src);
  for(const source of built.sources)source.stop(end+.05);
  const tail=insert(ctx,p,g,time,end,settings);
  route(ctx,tail,out,{dry:p.dry ?? D('dry'),reverb:p.reverb ?? .6,delay:p.delay ?? .08});
  return end;
}

/**
 * What the vocal declares about itself. `loudnessDb` is MEASURED by the gate
 * every kitchen voice is held to (`tools/test-voices.ts --bless`): the voice
 * alone on its fixture's melody through the real graph, both engines, both
 * rates, less its table's level. It was typed as -12 while the voice waited for
 * a fixture and read four decibels quieter than that when it got one (the
 * engine review of 09-22, finding 5). The other two are read off the sound:
 * `hold` is the envelope's sustain, the fraction a held syllable keeps, and
 * `brightnessHz` the mouth's default opening, the formant body's own corner
 * (`formantPad.lpHz`).
 */
export const WORDLESS_VOCAL_TIMBRES = {
  wordlessVocal: { family: 'vocal', struck: false, hold: 0.82, brightnessHz: 4600, loudnessDb: -16 },
};

// `cost` is MEASURED by `tools/budget.ts --bless`, like every other voice's class:
// 25 nodes a note and 46.6x the reference a minute on its fixture.
export const descriptor: Descriptor = {
  name: 'wordlessVocal',
  cost: 'dear',
  family:'vocal',roles:['sustained'],
  bus:'melodic',level:'pad',layer:'pad',plays:null,mono:false,treat:true,
  anticipates:null,prepare:null,render:wordlessVocal,dispatches:[],mood:[],
  timbres: WORDLESS_VOCAL_TIMBRES,
  controls: VOCAL_CONTROLS,
  noteControls: Object.keys(VOCAL_CONTROLS),
};
