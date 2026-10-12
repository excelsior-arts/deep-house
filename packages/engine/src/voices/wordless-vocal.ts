// A wordless sung syllable, independent of the pad's envelope and drift.
// It borrows the common formant resonator, not the pad player. Notes preserve
// the requested pitch; a mouth opening, delayed vibrato and breath shape the
// syllable. The composer supplies phrase-level entrances and endings.
//
// **A topology since round SOUNDS-R3** (`sounds/vocal/wordlessVocal.json`). The
// row is the syllable's own numbers — the envelope, the mouth's walk, the
// breath, the vibrato, its own detune and width, the tilt of its source and
// its sends — which were the defaults of its note controls and literals here,
// and are the row's parameters now, the controls defaulting to them
// (`controlOf`). The body it sings through is the formant pad's: the room's
// `formantPad` block (the vowels, the formants, the lid), read as a room fact
// as `settings.space` is, and not a second owner of that block — the formant
// pad's row is its owner. Over that body it lays its own detune and width, and
// what a phrase writes: its formants scaled, its bands widened.
import { adsrEnv, noiseSource, route, startTime } from '../dsp.ts';
import type { VoiceOut } from '../dsp.ts';
import type { Settings } from '../settings.ts';
import { withControls } from './descriptor.ts';
import type { Controls, NoteParams, VoiceRenderer } from './descriptor.ts';
import { formantBody } from './formant-pad.ts';
import { insert } from './treat.ts';
import { rowPatch } from './sound.ts';
import type { Topology } from './sound.ts';
import type { PatchOf } from './schema.ts';
import { contract, inUnit, maybe, num, CENTS, LEVEL, LFO_HZ, SECONDS, SEND, UNIT } from './schema.ts';

/** What the vocal's row carries (`schema.ts`): the syllable's own numbers. */
const PARAMETERS = contract({
  attack: SECONDS,
  release: SECONDS,
  /** the fraction a held syllable keeps: the timbre's `hold` is read off it */
  sustain: UNIT,
  /** where between the vowel pair the mouth opens from and walks to */
  vowelFrom: UNIT,
  vowelTo: UNIT,
  /** the noise under the source */
  breath: LEVEL,
  vibratoCents: CENTS,
  vibratoHz: LFO_HZ,
  /** the source's roll-off (`vocalPartials`): null is the plain sawtooth, which no tilt is */
  sourceTilt: maybe(inUnit(num(1, 3), 'ratio')),
  /** its own detune and width over the formant body */
  detuneCents: CENTS,
  spread: UNIT,
  dry: SEND,
  reverb: SEND,
  delay: SEND,
});

/** The vocal's own numbers. */
type VocalPatch = PatchOf<typeof PARAMETERS.fields>;

/**
 * The formant body a syllable sings through: the room's `formantPad` block with
 * the vocal's own detune (or the phrase's) and width over it, and what a
 * phrase writes on the note — its formants scaled, its bands widened.
 */
export function vocalNoteSettings(settings: Settings, p: NoteParams, V: VocalPatch, controls: Controls): Settings['formantPad'] {
  p = withControls(p, controls);
  const base=settings.formantPad;
  const vowels={...base.vowels};
  if (p.formantScale!==undefined) for (const k of Object.keys(vowels) as (keyof typeof vowels)[])
    vowels[k]=vowels[k].map(f=>f*p.formantScale);
  return {...base,detuneCents:p.vocalDetune ?? V.detuneCents,spread:V.spread,
    ...(p.formantScale!==undefined ? {vowels} : {}),
    ...(p.formantWidth!==undefined ? {q:base.q.map(q=>q/p.formantWidth)} : {}),
  };
}

function wordlessVocal(V: VocalPatch, controls: Controls, ctx: BaseAudioContext, out: VoiceOut, at: number, p: NoteParams = {}, settings: Settings): number {
  p = withControls(p, controls);
  const time=startTime(ctx,at), dur=Math.max(.08,p.dur ?? .6);
  const attack=Math.min(p.attack ?? V.attack,dur*.4), decay=Math.min(.12,dur*.3);
  const F=vocalNoteSettings(settings,p,V,controls);
  const g=ctx.createGain();
  const end=adsrEnv(g,time,(p.vel ?? .8)*(p.gain ?? 1)*F.trim,{
    attack,decay,sustain:V.sustain,hold:Math.max(0,dur-attack-decay),release:p.release ?? V.release,fadeCurve:p.fadeCurve,
  });
  const notes={vowelFrom:V.vowelFrom,vowelTo:V.vowelTo,vowelSeconds:Math.min(.35,dur),
    vibratoCents:V.vibratoCents,vibratoHz:V.vibratoHz,vibratoDelay:Math.min(.25,dur*.5),sourceTilt:V.sourceTilt,...p,dur};
  const built=formantBody(ctx,g,time,notes,F,settings.space,0);
  const breath=noiseSource(ctx,time,end-time+.02), breathGain=ctx.createGain();
  breathGain.gain.value=p.breath ?? V.breath;
  breath.connect(breathGain);breathGain.connect(built.src);
  for(const source of built.sources)source.stop(end+.05);
  const tail=insert(ctx,p,g,time,end,settings);
  route(ctx,tail,out,{dry:p.dry ?? V.dry,reverb:p.reverb ?? V.reverb,delay:p.delay ?? V.delay});
  return end;
}

/**
 * The wordless vocal topology: a syllable over the formant body. Its controls
 * default to the row's own numbers.
 */
export const WORDLESS_VOCAL: Topology = {
  id: 'wordless-vocal',
  cost: 'dear',
  parameters: PARAMETERS,
  controlOf: {
    attack: 'attack', release: 'release', vowelFrom: 'vowelFrom', vowelTo: 'vowelTo', breath: 'breath',
    vibratoCents: 'vibratoCents', vibratoHz: 'vibratoHz', dry: 'dry', vocalDetune: 'detuneCents', sourceTilt: 'sourceTilt',
  },
  render: (row): VoiceRenderer => {
    const controls = row.descriptor.controls ?? {};
    return (ctx, out, time, p = {}, settings) => wordlessVocal(rowPatch(row, PARAMETERS), controls, ctx, out, time, p, settings);
  },
};
