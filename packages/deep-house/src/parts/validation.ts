// Musical validation shared by recipe adapters and ordinary catalogues.
import { CONTOURS, pathProblems, motifFromPath, insideBox } from '../motif.ts';
import { rhythmProblems } from './rhythm.ts';

export function motifWants(box: any, say: (m: string) => void): void {
  if (!box || typeof box !== 'object' || Array.isArray(box)) { say('wants.motif is not an object'); return; }
  const span = (v: any, at: string, lo = 0, hi = Infinity) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isFinite(n))) { say(`${at} is not a pair of numbers`); return; }
    if (v[0] > v[1]) say(`${at} runs backwards`);
    if (v[0] < lo || v[1] > hi) say(`${at} reaches outside ${lo}..${hi}`);
  };
  if (box.paths !== undefined) {
    if (!Array.isArray(box.paths) || !box.paths.length || box.paths.length > 8) say('wants.motif.paths: use one to eight ordered paths');
    else for (const [i,p] of box.paths.entries()) {
      const errors = pathProblems(p);
      errors.forEach(m => say(`wants.motif.paths[${i}]: ${m}`));
      // Bounds below report malformed boxes; avoid throwing while validating one.
      if (!errors.length && box.intervals?.steps && box.intervals?.leaps && box.cell?.beats && box.range?.semitones && box.onGrid && box.density) {
        insideBox(motifFromPath(p, 'mid'),box).forEach(m => say(`wants.motif.paths[${i}]: ${m}`));
      }
    }
  }
  if (!CONTOURS.includes(box.contour)) say(`wants.motif.contour is ${JSON.stringify(box.contour)}, not one of ${CONTOURS.join(', ')}`);
  if (!box.intervals || typeof box.intervals !== 'object') say('wants.motif.intervals is not an object');
  else { span(box.intervals.steps, 'wants.motif.intervals.steps', 0, 1); span(box.intervals.leaps, 'wants.motif.intervals.leaps', 0, 1); }
  if (!box.cell || typeof box.cell !== 'object') say('wants.motif.cell is not an object');
  else span(box.cell.beats, 'wants.motif.cell.beats', 0.25, box.paths ? 64 : 16);
  if (box.grid !== undefined && (!box.grid || typeof box.grid !== 'object'
    || Object.keys(box.grid).some(k => k !== 'beats') || ![.25, .5, 1, 2, 4].includes(box.grid.beats)
    || !box.cell?.beats?.every((n: number) => Number.isInteger(n / box.grid.beats))))
    say('wants.motif.grid: use a quarter, half, one, two or four beat lattice dividing the cell');
  span(box.onGrid, 'wants.motif.onGrid', 0, 1);
  if (!box.range || typeof box.range !== 'object') say('wants.motif.range is not an object');
  else span(box.range.semitones, 'wants.motif.range.semitones', 0, 48);
  span(box.density, 'wants.motif.density', 0, 16);
  if (!box.returns || typeof box.returns !== 'object') say('wants.motif.returns is not an object');
  else span(box.returns.bars, 'wants.motif.returns.bars', 1, 64);
}

/** A held root or a generated bass family, expressed in musical properties. */
export function bassFigureProblems(bass: any): string[] {
  const at = 'wants.figures.bassline';
  if (!bass || typeof bass !== 'object' || Array.isArray(bass)) return [`${at} is not an object`];
  const bad: string[] = [];
  if (bass.follows !== 'harmony') bad.push(`${at}.follows must be harmony`);
  if (!['held', 'legato'].includes(bass.articulation)) bad.push(`${at}.articulation must be held or legato`);
  const keys = bass.articulation === 'held' ? ['follows', 'articulation'] : ['follows', 'articulation', 'motif'];
  if (Object.keys(bass).some(k => !keys.includes(k))) bad.push(`${at} has an unsupported instruction`);
  if (bass.articulation === 'legato') {
    motifWants(bass.motif, m => bad.push(m.replace('wants.motif', `${at}.motif`)));
  }
  return bad;
}

/** A pitched phrase followed by space, independent of the bass family. */
export function struckFigureProblems(value: any): string[] {
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 3) return ['wants.figures.figure: use one to three independent parts'];
    return value.flatMap((part, i) => Array.isArray(part)
      ? [`wants.figures.figure[${i}]: a part must be an object`]
      : struckFigureProblems(part).map(m => m.replace('wants.figures.figure', `wants.figures.figure[${i}]`)));
  }
  const at = 'wants.figures.figure';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [`${at} must be an object`];
  const bad: string[] = [];
  if (value.follows !== 'harmony' || !['struck', 'sustained'].includes(value.articulation) || value.register !== 'mid') bad.push(`${at}: expected a struck or sustained mid-register phrase following harmony`);
  if (Object.keys(value).some(k => !['follows', 'articulation', 'register', 'families', 'properties', 'prefer', 'motif', 'strength', 'entry', 'spacing', 'behavior', 'duration', 'envelope', 'voicings', 'phrasing', 'rests', 'support'].includes(k))) bad.push(`${at}: unknown instruction`);
  if (value.support !== undefined && (!value.support || typeof value.support !== 'object' || Array.isArray(value.support)
    || Object.keys(value.support).length !== 1 || value.support.sustained !== 'separate'))
    bad.push(`${at}.support: use sustained: separate`);
  if (value.rests !== undefined) {
    const r = value.rests;
    if (!r || typeof r !== 'object' || Object.keys(r).some(k=>!['bars','beats'].includes(k))
      || !Number.isInteger(r.bars) || r.bars < 1 || r.bars > 16
      || !Array.isArray(r.beats) || !r.beats.length || r.beats.length > 16
      || r.beats.some((w:any,i:number)=>!Array.isArray(w)||w.length!==2
        || w.some((n:any)=>!Number.isFinite(n)||n<0||n>r.bars*4||!Number.isInteger(n*4))
        || w[0]>=w[1] || (i>0&&w[0]<r.beats[i-1]?.[1])))
      bad.push(`${at}.rests: use ordered non-overlapping beat windows inside a 1–16 bar cycle`);
  }
  if (value.behavior !== undefined && !['phrase', 'ostinato'].includes(value.behavior)) bad.push(`${at}.behavior: use phrase or ostinato`);
  motifWants(value.motif, m => bad.push(m.replace('wants.motif', `${at}.motif`)));
  rhythmProblems({ sixteenth: [{ bars: 1, steps: [0], accents: [1], families: value.families, properties: value.properties,
    ...(value.prefer !== undefined ? { prefer: value.prefer } : {}) }] }).forEach(m => bad.push(m.replace('wants.rhythm.sixteenth[0]', at)));
  const span = (v: any, name: string, lo: number, hi: number, integer = false) => {
    if (!Array.isArray(v) || v.length !== 2 || v.some(x => !Number.isFinite(x) || x < lo || x > hi || (integer && !Number.isInteger(x))) || v[0] > v[1]) bad.push(`${at}.${name}: invalid range`);
  };
  span(value.strength, 'strength', .01, 1);
  span(value.entry?.beats, 'entry.beats', 0, value.motif?.paths ? 63 : 31);
  span(value.spacing?.bars, 'spacing.bars', 1, value.motif?.paths ? 16 : 8, true);
  if (value.phrasing !== undefined) {
    const p = value.phrasing, paths = value.motif?.paths;
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k=>!['starts','dynamics','character'].includes(k))) bad.push(`${at}.phrasing: unknown phrase instruction`);
    if (!Array.isArray(paths) || !paths.length || !Array.isArray(p?.starts) || p.starts[0] !== 0
      || p.starts.some((n: any,i: number)=>!Number.isInteger(n)||n<0||(i>0&&n<=p.starts[i-1])||paths?.some((path: any)=>n>=path?.degrees?.length))) bad.push(`${at}.phrasing: ordered starts inside every path, beginning at zero, required`);
    if (!Array.isArray(p?.dynamics) || p.dynamics.length!==3 || p.dynamics.some((n:any)=>!Number.isFinite(n)||n<=0||n>1)) bad.push(`${at}.phrasing: entry, crest and exit dynamics in (0,1] required`);
    if (typeof p?.character !== 'string' || !p.character.trim()) bad.push(`${at}.phrasing: name a style sound character`);
  }
  if (value.voicings !== undefined && (!Array.isArray(value.voicings) || !value.voicings.length || value.voicings.length > 16 || value.voicings.some((chord: any) => !Array.isArray(chord) || !chord.length || chord.length > 5 || chord.some((d: any,i: number) => !Number.isInteger(d) || d < -14 || d > 14 || (i > 0 && d <= chord[i-1]))))) bad.push(`${at}.voicings: use ordered chord shapes of one to five relative scale degrees in -14..14`);
  if (value.articulation === 'sustained' && !value.duration) bad.push(`${at}: sustained phrases require a musical duration`);
  if (value.envelope !== undefined) {
    const e = value.envelope;
    if (!e || typeof e !== 'object' || Object.keys(e).some(k => !['attack', 'release'].includes(k))) bad.push(`${at}.envelope: use attack and release in beats`);
    for (const phase of ['attack', 'release']) {
      const v = e?.[phase];
      if (!v || typeof v !== 'object' || Object.keys(v).some(k => k !== 'beats') || !Number.isFinite(v.beats) || v.beats < .01 || v.beats > 2) bad.push(`${at}.envelope.${phase}: use .01 to 2 beats`);
    }
    if (e?.attack?.beats > value.duration?.beats?.[0]) bad.push(`${at}.envelope: attack exceeds shortest note duration`);
    for (const path of Array.isArray(value.motif?.paths) ? value.motif.paths : []) {
      const lengths = path?.holds ?? path?.beats;
      if (Array.isArray(lengths) && lengths.some((n: number) => e?.attack?.beats > n)) bad.push(`${at}.envelope: attack exceeds a path note's duration`);
    }
  }
  if (value.duration !== undefined) {
    span(value.duration?.beats, 'duration.beats', .25, 16);
    if (!value.duration || Object.keys(value.duration).some(k => k !== 'beats')) bad.push(`${at}.duration: unknown instruction`);
  }
  if (value.entry && Object.keys(value.entry).some(k => k !== 'beats')) bad.push(`${at}.entry: unknown instruction`);
  if (value.spacing && Object.keys(value.spacing).some(k => k !== 'bars')) bad.push(`${at}.spacing: unknown instruction`);
  if (value.motif?.cell?.beats?.[1] + value.entry?.beats?.[1] > 4 * value.spacing?.bars?.[0]) bad.push(`${at}: phrase and entry do not fit the shortest spacing`);
  if (value.behavior === 'ostinato') {
    const cell = value.motif?.cell?.beats;
    if (!Array.isArray(cell) || cell[0] !== cell[1] || ![1, 2, 4, 8, 16].includes(cell[0])) bad.push(`${at}: an ostinato cell must divide a bar or span two or four bars`);
    const bars = Math.max(1, (cell?.[0] ?? 4) / 4);
    if (value.entry?.beats?.some((n: number) => n !== 0) || value.spacing?.bars?.some((n: number) => n !== bars)) bad.push(`${at}: an ostinato starts on the bar and repeats after its complete cell`);
  }
  return bad;
}
