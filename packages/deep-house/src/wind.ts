// **The wind lands on its line** (round wind, 11-03). His word: *"this wind, getting it in different tracks … it kinda
// never lands well, it's either too loud, or too fast etc. I like having these effects but i wonder how we can tune
// it"*.
//
// The wind is the noise band whose lid and floor climb (`sounds/effect/sweepUp.json`). Any of the glue's four slots
// may draw it, and three of them laid it the way their own voice plays: the impact on the downbeat, the fall from the
// downbeat, the swell arriving on it (a voice that anticipates; this one does not). So the wind rose for three
// seconds, two bars or two beats *after* the line it marked, into a drop that had already hit or a break that had
// already fallen away, at a pace set in seconds, and where two slots drew it two played at once.
//
// Whichever slot draws it, it now rises into its line and stops on the downbeat:
//   - where the riser's rule lays a riser (a return that earned one, by contrast, scene, haze and alternation:
//     `leadIns` in generator.ts) and the wind is the riser's voice, it is that riser: its length the rule's by tempo
//     (4 bars at 110 BPM and over, 2 at 90-110, 1 under), ending on the line;
//   - anywhere else (an impact's line, a swell's, a fall's, the drums' answer) it is a breath arriving on the line, as
//     the glue's swell does: a bar, never over two seconds. So it never makes a second rise where the rule alternates
//     a riser with a swell and an impact, and never a rise where the rule refuses one (after a build, a drone in front);
//   - one wind a line (the riser's shape if either is, the louder level);
//   - its climb paced by the beat: the lid arrives where it always did and climbs at most so much a beat;
//   - its peak under a ceiling against the mix the theme aims at (`windCeilingDb`, read once the trim is known).
// Everything is read off the plan; the numbers are `recipes/arrangement/wind.json`.

import ROW_FILE from '../recipes/arrangement/wind.json' with { type: 'json' };

export interface WindRow {
  voices: string[];
  breath: { bars: number; mostSeconds: number };
  pace: { octPerBeat: number; mostOct: number };
  level: { ceilingDb: number; peakDb: number };
}
export const WIND: Readonly<WindRow> = Object.freeze(ROW_FILE as unknown as WindRow);

/** Is this voice the wind (the row's list): a gesture that rises, laid into its line whichever slot drew it. */
export const isWind = (voice: string): boolean => WIND.voices.includes(voice);
/** A planned wind: the glue's wind on the effects' layer, whose level the ceiling sets against the whole mix. */
export const isWindEvent = (e: { voice: string; layer?: string }): boolean => e.layer === 'fx' && isWind(e.voice);

/** How far the lid climbs over `seconds` at the theme's beat: at most so much a beat, at most the row's whole climb. */
export const windRise = (seconds: number, beat: number, row: Readonly<WindRow> = WIND): number =>
  +Math.min(row.pace.mostOct, row.pace.octPerBeat * (seconds / beat)).toFixed(4);

/**
 * **A breath into the line**: the wind where the riser's rule laid no riser (an impact's, a swell's, a fall's, the
 * drums' answer's line). It arrives on the line as the glue's swell does: a bar long, never longer than the row's
 * seconds (the swell's own scale), climbing at the beat's pace.
 */
export function breathShape(I: { bpm: number; barSeconds: number }, row: Readonly<WindRow> = WIND): { dur: number; rise: number } {
  const dur = +Math.min(row.breath.bars * I.barSeconds, row.breath.mostSeconds).toFixed(6);
  return { dur, rise: windRise(dur, I.barSeconds / 4, row) };
}

/**
 * **The cut the ceiling asks, in dB** (nought or less): the wind's peak as the plan reads it (its level-table word,
 * its gain and the trim, over the theme's aim) down to the row's ceiling, never up. Null where there is no aim.
 */
export function windCeilingDb(I: { tableDb: number; gain: number; trimDb: number; aimLufs: number | null | undefined }, row: Readonly<WindRow> = WIND): number {
  if (I.aimLufs == null || !(I.gain > 0)) return 0;
  const peak = I.tableDb + 20 * Math.log10(I.gain) + row.level.peakDb + I.trimDb - I.aimLufs;
  return Math.min(0, row.level.ceilingDb - peak);
}
