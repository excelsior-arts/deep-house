// Musical vocabulary learned from the accepted listening pilot. These are
// authored generalizations, not transcriptions or measured probabilities.
// A family changes here; the sampler and the sound engine do not change.
import type { BirdResponse, CompositionPolicy, PartFamily } from '../composition-policy.ts';
import type { MotifBox } from '../motif.ts';
import type { StruckFigure } from '../parts/figure.ts';
import { partFromRecipe } from '../recipe-part.ts';
import type { Recipe } from '../recipe.ts';
import { HOUSE } from '../spell.ts';
import conversation from '../../recipes/hand-conversation.json' with { type: 'json' };
import rolling from '../../recipes/hand-rolling.json' with { type: 'json' };
import answers from '../../recipes/hand-answers.json' with { type: 'json' };
import anthemRow from '../../recipes/genres/trance/supersaw-anthem.json' with { type: 'json' };
import arpRow from '../../recipes/genres/house/progressive-house.json' with { type: 'json' };
import stabSirenRow from '../../recipes/genres/bigbeat/stab-siren.json' with { type: 'json' };
import echoChordRow from '../../recipes/genres/dub/dub-techno-chord.json' with { type: 'json' };
import slowChordsRow from '../../recipes/genres/ambient/slow-chords.json' with { type: 'json' };
import type { PulseTexture } from '../parts/texture.ts';

export const controls: Record<string, BirdResponse> = {
  // Loom since round S9: a long form draws the bass figure (and so its pedal)
  // more often and a short one less — the ring's "eight-bar pedals" moved only
  // which pedal a drawn one was, never how often one was drawn.
  bass: { home: .45, slopes: { spark: .2, root: .2, tide: -.15, loom: .35 }, bounds: [0, 1] },
  body: { home: .5, slopes: { root: .65 }, bounds: [0, 1] },
  percussion: { home: .4, slopes: { ember: .25, spark: .25 }, bounds: [0, 1] },
  pulse: { home: .18, slopes: { tide: .55, loom: .2, ember: -.18 }, bounds: [0, 1] },
  figure: { home: .4, slopes: { gleam: .25, tide: -.2 }, bounds: [0, 1] },
  ornament: { home: .32, slopes: { veil: .3, gleam: .2 }, bounds: [0, 1] },
  pedal: { home: .28, slopes: { loom: .25, gleam: -.3 }, bounds: [0, 1] },
  // The five controls that are one bird each sit at that bird's own house, so
  // an untouched ring reads each of them at its home: the house vector itself,
  // not the five numbers retyped (round (f) of the reconciled review, D30).
  space: { home: HOUSE.tide, slopes: { tide: 1 }, bounds: [0, 1] },
  form: { home: HOUSE.loom, slopes: { loom: 1 }, bounds: [0, 1] },
  movement: { home: HOUSE.spark, slopes: { spark: 1 }, bounds: [0, 1] },
  light: { home: HOUSE.gleam, slopes: { gleam: 1 }, bounds: [0, 1] },
  air: { home: HOUSE.zephyr, slopes: { zephyr: 1 }, bounds: [0, 1] },
  // **The drone in front** (the scene, `ScenePolicy.forward`): a coin at the
  // house, leaning toward the drone as the birds move to the ambient side —
  // Tide up ("drones that never end"), Veil down (a static field rather than
  // a bar that changes every four) and Loom up (long form, few events): the
  // three birds whose ambient centre sits furthest from the house's in
  // `notes/diagrams/landscape.md` (tide .90, veil .15, loom .90 against .56,
  // .47, .58). Ember is left out on purpose: below .18 the drums go and with
  // them the choice. Eugene, 09-22: birds "stimulate probability", never a
  // gate, so the bounds keep both scenes reachable at every spell — at the
  // ambient centre nine in ten, at the opposite pull one in ten.
  drone: { home: .5, slopes: { tide: .9, veil: -.7, loom: .5 }, bounds: [.1, .9] },
};
const fourFloor = { drums: true, kits: ['fourFloor'] };
/**
 * Where the `body` control crosses the ring's Root bands: the record's lowest
 * and highest Root (house 0.717 -/+ HOUSE_OUTER 0.102) through the control's
 * home 0.5 and its Root slope 0.65. Round S8's drums-off bass reads them.
 */
/** Where Loom's `loops` band ends on the `form` control: the record's lowest Loom, house - HOUSE_OUTER. */
export const LOOPS_FORM = 0.578 - 0.063;
export const BODY_BANDS = { full: 0.5 - 0.65 * 0.102, heavy: 0.5 + 0.65 * 0.102 } as const;
const stepwise = { steps: [1, 1], leaps: [0, 0] } as MotifBox['intervals'];
const bass: MotifBox = { contour: 'pedal', intervals: stepwise, cell: { beats: [4, 4] },
  onGrid: [.2, .6], range: { semitones: [2, 5] }, density: [4, 6], returns: { bars: [2, 4] } };
const upper: StruckFigure = {
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .04, holdMax: .2, brightnessMin: 1500, brightnessMax: 6000 },
  motif: { contour: 'pedal', intervals: stepwise, cell: { beats: [2, 2] }, onGrid: [.25, .25], range: { semitones: [2, 2] }, density: [8, 8], returns: { bars: [4, 4] } },
  strength: [.18, .26], entry: { beats: [0, 0] }, spacing: { bars: [1, 1] }, behavior: 'ostinato',
};
const ornament: StruckFigure = {
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .25, holdMax: .45, brightnessMin: 1800, brightnessMax: 5000 },
  motif: { contour: 'arch', intervals: stepwise, cell: { beats: [2, 2] }, onGrid: [.25, .5], range: { semitones: [3, 6] }, density: [8, 8], returns: { bars: [4, 4] } },
  strength: [.25, .34], entry: { beats: [8.5, 9.5] }, spacing: { bars: [4, 4] }, behavior: 'phrase',
};
// Focus listening: sparse, ringing keyboard notes instead of a repeated
// short chord stab. The same request is available to recipes. A two/four-beat
// lattice survives every section; this ostinato never diminishes into a run.
// The window is a family of ringing keyboards (the piano, the rhodes, the
// glass keys); the piano it was written on is the preferred profile, so it
// stays the likely draw without being the only instrument that can answer.
const ringingKeys = (beats: 2 | 4): StruckFigure => ({
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .25, holdMax: .4, brightnessMin: 1500, brightnessMax: 4000 },
  prefer: { holdMin: .25, holdMax: .3, brightnessMin: 3000, brightnessMax: 4000 },
  motif: { contour: 'pedal', intervals: { steps: [0, 0], leaps: [1, 1] },
    cell: { beats: [beats * 4, beats * 4] }, grid: { beats }, onGrid: [1, 1],
    range: { semitones: [3, 4] }, density: [4 / beats, 4 / beats], returns: { bars: [beats, beats] } },
  strength: [.62, .74], entry: { beats: [0, 0] }, spacing: { bars: [beats, beats] },
  duration: { beats: [beats, beats] }, behavior: 'ostinato',
});
const pulse: PulseTexture = {
  follows: 'harmony', articulation: 'pulse', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .05, holdMax: .12, brightnessMin: 2000, brightnessMax: 8000 },
  strength: [.38, .52], spacing: { bars: [4, 4] }, entry: { beats: [.5, 2.5] }, duration: { beats: [.25, .75] }, ambience: 'immersed',
};
/**
 * **The held mid part of the fast band** (round GA4: at 116 BPM and over the
 * record's measured references hold far more mid-range than the composer:
 * held mid -2.6 spreads, mid onsets -1.5). A chord that holds: a seventh on a keyboard that rings, struck on a
 * syncopated two-bar pattern — the one, the and of two, the and of four —
 * and held a beat to a beat and a half, far back in the room. It is the
 * struck-chord pattern row's stab slowed to what a groove carries under it,
 * written as a family so the fast band plays it on the composer's own themes,
 * not only on a library turn.
 */
const heldMid: StruckFigure = {
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .25, holdMax: .6, brightnessMin: 1200, brightnessMax: 3500 },
  prefer: { brightnessMax: 2500 },
  motif: { contour: 'pedal', intervals: { steps: [0, 0], leaps: [0, 0] }, cell: { beats: [8, 8] }, onGrid: [.3, .4],
    range: { semitones: [0, 0] }, density: [1.5, 1.5], returns: { bars: [2, 2] },
    paths: [{ degrees: [0, 0, 0], beats: [1.5, 2, 4.5], holds: [1, 1.5, 1.25], accents: [.85, .7, .8] }] } as StruckFigure['motif'],
  strength: [.42, .52], entry: { beats: [0, 0] }, spacing: { bars: [2, 2] }, duration: { beats: [1, 1.5] },
  behavior: 'ostinato', voicings: [[-6, -4, -2, 0]],
};
/**
 * **The fast band's percussion loop** (round GA4: event rate -3.6 spreads,
 * syncopation -2.5 against the fast references). A two-bar loop on the
 * sixteenth lane that talks: a shaker's shuffled sixteenths with the offbeat
 * sixteenths leaned on, and a clicky hand drum answering off the beat — the
 * loop a fast four carries, written from public knowledge as the pattern rows
 * are, swung 0.56, at the style's level on the lane.
 */
const percLoop = [
  { bars: 1, steps: [2, 3, 6, 7, 10, 11, 14, 15], accents: [.34, .2, .38, .2, .34, .2, .4, .22],
    families: ['noise'], properties: { struck: true, holdMax: .03, brightnessMin: 4000 },
    feel: { swing: .56, delay: { beats: 0 }, timing: { beats: .004 }, dynamics: .1 } },
  { bars: 2, steps: [3, 6, 10, 13, 19, 22, 27, 30], accents: [.5, .42, .55, .4, .5, .45, .52, .4],
    families: ['drum'], properties: { struck: true, brightnessMin: 1500, brightnessMax: 4000 }, prefer: { holdMax: .02 },
    feel: { swing: .56, delay: { beats: 0 }, timing: { beats: .004 }, dynamics: .08 } },
];
/**
 * **The slow band's lazy kit** (round GA4: syncopation -2.9, event rate -2.6
 * against the slow references). A snare on two and four with ghosts
 * dragged behind the beat, and a shaker in lazy swung sixteenths — a late,
 * loose feel from public knowledge — at 94 BPM and under, where nothing of
 * the house's 95-105 reaches.
 */
const lazyKit = {
  backbeat: [{ bars: 2, steps: [4, 7, 12, 15, 20, 23, 28, 30], accents: [1, .22, 1, .3, 1, .2, 1, .28],
    families: ['drum'], properties: { struck: true },
    feel: { swing: .6, delay: { beats: .02 }, timing: { beats: .012 }, dynamics: .12 } }],
  sixteenth: [{ bars: 1, steps: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], accents: [.3, .22, .14, .28, .2, .3, .22, .14, .28, .2],
    families: ['noise'], properties: { struck: true, holdMax: .03 },
    feel: { swing: .6, delay: { beats: .02 }, timing: { beats: .012 }, dynamics: .14 } }],
};
/**
 * **The broken kit's ghosts** (round GA4: syncopation -4.0, event rate -4.3
 * against the broken references). The snare's two and four with the ghost
 * notes a funk break carries around them and a pickup into the next bar, swung
 * 0.56: what the authored break is played with, on the backbeat lane, where the
 * spell asks for the broken kit.
 */
// `holdMax` under the clap's declared hold (GA3): a broken kit's backbeat is
// a snare or a rim, never the record's clap.
const breakGhosts = [{ bars: 1, steps: [4, 7, 9, 12, 14, 15], accents: [1, .22, .28, 1, .25, .35],
  families: ['drum'], properties: { struck: true, holdMax: .012 },
  feel: { swing: .56, delay: { beats: 0 }, timing: { beats: .006 }, dynamics: .1 } }];
/**
 * **The fast broken beat's snare** (round DNB-4): the funk break's ghosts are
 * a slower kit's; over 150 BPM the two-step's snare talks on the second half
 * of each beat — a struck note after the second beat and before the fourth,
 * between the ghosts — so the backbeat reads four to five snares a bar and two
 * ghosts, as the mix's two-step drops do (4.3-4.7 and 2.0), where the funk
 * cell read two and three. Straight, not swung: the drops swing 0.52.
 */
const twoStepGhosts = [{ bars: 1, steps: [4, 7, 9, 10, 12, 14, 15], accents: [1, .3, .6, .25, 1, .3, .55],
  families: ['drum'], properties: { struck: true, holdMax: .012 },
  feel: { swing: .51, delay: { beats: 0 }, timing: { beats: .004 }, dynamics: .1 } }];
/**
 * **The fast broken beat's eighths** (round DNB-1, source 8 read bar by bar,
 * `notes/rounds/dnb-1.md` §2): the hats of the two-step drops are eighths in a
 * two-bar figure — the first bar leaves out the eighth under the three-and kick,
 * the second adds a sixteenth on four-a as a pickup into the line (cuts 2, 4,
 * 7, 9 and 25), the and louder than the beat, 7.2 a bar, swing 0.53 and a few
 * milliseconds early. Where the fast broken kit plays, on the offbeat lane, in
 * place of the house's offbeat mask.
 */
const brokenEighths = [{ bars: 2, steps: [0, 2, 4, 6, 8, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 31],
  accents: [.85, 1, .85, 1, .85, .85, 1, .85, 1, .85, 1, .85, 1, .85, 1, .7],
  families: ['noise'], properties: { struck: true, holdMax: .05, brightnessMin: 6000 },
  feel: { swing: .51, delay: { beats: 0 }, timing: { beats: .004 }, dynamics: .08 } }];
/**
 * **The bright stab** (round GA4: event rate -3.7, mid onsets -3.5 against
 * the bright four-floor references). A bright chord stabbed short on the one, the and of two and the and
 * of four after the one — the house piano and organ stab, from
 * public knowledge — where the House key's brightness asks for it (the `air`
 * control over 0.55: the house itself is 0.377).
 */
const brightStab: StruckFigure = {
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMax: .4, brightnessMin: 2000, brightnessMax: 7000 },
  prefer: { brightnessMin: 3000 },
  motif: { contour: 'pedal', intervals: { steps: [0, 0], leaps: [0, 0] }, cell: { beats: [4, 4] }, onGrid: [.3, .4],
    range: { semitones: [0, 0] }, density: [3, 3], returns: { bars: [1, 1] },
    paths: [{ degrees: [0, 0, 0], beats: [1.5, 2, .5], holds: [.25, .25, .25], accents: [.8, .9, .6] }] } as StruckFigure['motif'],
  strength: [.45, .55], entry: { beats: [0, 0] }, spacing: { bars: [1, 1] },
  behavior: 'ostinato', voicings: [[-4, -2, 0]],
};
/**
 * **The mids and highs away from the house** (round GA6): the pattern rows'
 * own pitched parts, lifted into families so the composer's themes carry them
 * where the birds and the tempo stand near the rows — not only on a library
 * turn. Each is named for what it plays; each window is birds and tempo.
 */
const figureOf = (row: unknown, i = 0): StruckFigure => {
  const f = (row as { wants: { figures: { figure: StruckFigure | StruckFigure[] } } }).wants.figures.figure;
  return Array.isArray(f) ? f[i] : f;
};
/** A sustained line over the chords (a lead that holds). */
const leadLine = figureOf(anthemRow);
/** A sixteenth pluck climbing the chord. */
const arpLine = figureOf(arpRow);
/** A bright struck triad on the phrase line, and a two-tone held line over it. */
const brightStruck = figureOf(stabSirenRow, 0), twoTone = figureOf(stabSirenRow, 1);
/** A minor seventh stabbed short and sent into the echo. */
const echoChord = figureOf(echoChordRow);
/** Wide chords on a held ensemble, four bars each. */
const wideChords = figureOf(slowChordsRow);
const families: PartFamily[] = [
  { id: 'bass', chance: 'bass', when: fourFloor, variants: [
    // A form of short loops (Loom in its `loops` band, the record's lowest
    // Loom: form under LOOPS_FORM) holds no pedal: its bass figure is the
    // short fall, the one variant left (round S9).
    { id: 'pedal', weight: 1, when: { controls: { form: { min: LOOPS_FORM, max: .7 } } }, request: { bassMotif: bass } },
    { id: 'long-pedal', weight: 1, when: { controls: { form: { min: .7 } } }, request: { bassMotif: { ...bass, returns: { bars: [8, 8] } } } },
    { id: 'fall', weight: 'light', request: { bassMotif: { ...bass, contour: 'fall', density: [2, 3], onGrid: [.2, .75] } } },
  ] },
  { id: 'body', chance: 'body', when: { drums: true }, variants: [
    { id: 'full', weight: 1, request: { tone: { bassline: 'full' } } },
  ] },
  // **The bass without drums** (round S8, the Root analysis of 26925 under
  // ember 0.10: Root moved nothing in the bass, because both parts it drives
  // asked for drums). With no kick there is no grid for a figure to answer, so
  // the drums-off figure is on the beat and slower, and what Root buys is
  // weight, never a coin: the family always draws where the drums are off, and
  // which variant is the `body` control's band — the ring's own three words for
  // Root, at the ring's own thresholds (`bandsOf`: the record's lowest and
  // highest Root, house -/+ HOUSE_OUTER, through the `body` control, 0.434 and
  // 0.566; `tools/check-composer-*.ts` holds the two to each other) —
  //   thin  (Root under 0.615): no figure; the base mask's sparse pedal
  //         plays, as it always did, and the sub is lighter by its mass;
  //   full  (0.615 to 0.819): the base mask too, at the sub's own weight —
  //         the house's Root is here, and so is the ambient benchmark, whose
  //         bass Eugene holds as the one "very well phrased", so its figure
  //         is the one it always had;
  //   heavy (0.819 and over): a long pedal, four to six
  //         notes a cycle and eight-bar returns, with the full body under it —
  //         more notes and a heavier note, since at 48 BPM with no kick
  //         "heavy" cannot be a punch.
  // And the full body (the held bassline tone) where Root is heavy.
  { id: 'bass-free', chance: 1, when: { drums: false }, variants: [
    { id: 'long-pedal', weight: 1, when: { controls: { body: { min: BODY_BANDS.heavy } } },
      request: { bassMotif: { ...bass, onGrid: [.5, .8], density: [4, 6], returns: { bars: [8, 8] } } } },
  ] },
  { id: 'body-free', chance: 1, when: { drums: false, controls: { body: { min: BODY_BANDS.heavy } } }, variants: [
    { id: 'full', weight: 1, request: { tone: { bassline: 'full' } } },
  ] },
  // The approved cells live in JSON. Taste lives here: occasional hands at
  // home, roomier replies with low movement, short rolling turns above 100.
  // Keep the family stream stable; promotion must not reroll bass or harmony.
  // Hands answer on an airy texture and under a drone in the background; a
  // drone in front withdraws them with the rest of the real-world class
  // (`scene` below; Eugene, 09-22).
  { id: 'percussion', chance: 'percussion', when: { ...fourFloor, bpm: { atMost: 130 } }, variants: [
    { id: 'conversation', weight: 1, ...partFromRecipe(conversation as Recipe) },
    { id: 'answers', weight: 1, when: { controls: { movement: { max: .4 } } }, ...partFromRecipe(answers as Recipe) },
    { id: 'rolling', weight: 'movement', when: { bpm: { above: 100 }, controls: { movement: { min: .2 } } }, ...partFromRecipe(rolling as Recipe) },
  ] },
  { id: 'pulse', chance: 'pulse', variants: [
    { id: 'four', weight: 1, when: { controls: { form: { max: .72 } } }, request: { texture: pulse } },
    { id: 'eight', weight: 1, request: { texture: { ...pulse, spacing: { bars: [8, 8] } } } },
  ] },
  // Focus-companion style: repeated pitched figures are reserved for faster
  // tracks. Explicit recipes retain the technique at their requested tempo.
  { id: 'figure', chance: 'figure', when: { bpm: { above: 110 } }, variants: [
    { id: 'two-beat', weight: 1, request: { struckFigures: [upper] } },
    { id: 'one-beat', weight: 'movement', request: { struckFigures: [{ ...upper, motif: { ...upper.motif, cell: { beats: [1, 1] }, density: [16, 16] } }] } },
    { id: 'arch', weight: 'light', request: { struckFigures: [{ ...upper, motif: { ...upper.motif, contour: 'arch', range: { semitones: [3, 5] } } }] } },
    { id: 'long-arch', weight: 'air', when: { controls: { form: { min: .7 } } }, request: { struckFigures: [{ ...upper, motif: { ...upper.motif, contour: 'arch', cell: { beats: [4, 4] }, density: [4, 4], range: { semitones: [3, 5] }, returns: { bars: [8, 8] } } }] } },
  ] },
  { id: 'ornament', chance: 'ornament', requires: ['figure'], excludes: ['pulse'], when: { densities: ['minimal', 'medium'] }, variants: [
    { id: 'late-arch', weight: 1, request: { struckFigures: [ornament] } },
    { id: 'late-fall', weight: 1, request: { struckFigures: [{ ...ornament, motif: { ...ornament.motif, contour: 'fall' } }] } },
    { id: 'long-answer', weight: 1, when: { controls: { form: { min: .7 } } }, request: { struckFigures: [{ ...ornament, entry: { beats: [24.5, 25.5] }, spacing: { bars: [8, 8] }, motif: { ...ornament.motif, returns: { bars: [8, 8] } } }] } },
  ] },
  { id: 'figure-space', chance: 1, requires: ['figure'], variants: [
    { id: 'near', weight: 1, when: { controls: { space: { max: .5 } } }, request: { ambience: { figure: 'intimate' } } },
    { id: 'open', weight: 1, when: { controls: { space: { min: .5 } } }, request: { ambience: { figure: 'spacious' } } },
  ] },
  // The quick struck phrases need a rhythmic partner under a pulled broken
  // kit. Preserve the offbeat anchors; two eighth pickups add motion while
  // the downbeats stay empty, leaving room under the fast pitched part.
  // The fast broken beat's eighths (DNB-1): every broken-kit theme over 150 BPM
  // carries them on the offbeat lane; listed before the figure's groove, which
  // takes the same lane under the slower broken kits.
  { id: 'broken-eighths', chance: 1, when: { drums: true, kits: ['breaks'], bpm: { above: 150 } }, variants: [
    { id: 'two-bar', weight: 1, request: { rhythm: { offbeat: brokenEighths as any } } },
  ] },
  // This replaces the hat role, so it does not add another parallel kit.
  { id: 'figure-groove', chance: 1, requires: ['figure'], when: { drums: true, kits: ['breaks'], controls: { movement: { min: .45 } } }, variants: [
    { id: 'eighth-pickups', weight: 1, request: { rhythm: { offbeat: [{ bars: 1,
      steps: [2, 4, 6, 10, 12, 14], accents: [.65, .22, .6, .65, .22, .6],
      families: ['noise'], properties: { struck: true, holdMax: .03, brightnessMax: 9000 },
      prefer: { brightnessMax: 7000 },
    }] } } },
  ] },
  { id: 'harmony', chance: 'pedal', requires: ['figure'], variants: [{ id: 'pedal', weight: 1, request: { pedalHarmony: true } }] },
  { id: 'receding-backbeat', chance: 1, requires: ['pulse'], when: { drums: true, controls: { space: { min: .6 } } }, variants: [
    { id: 'distant', weight: 1, request: { ambience: { backbeat: 'distant' }, presence: { backbeat: 'background' } } },
  ] },
  // Sparse ringing keyboard notes, an ordinary figure variant on its own
  // stream, beside whatever the palette drew for the figure lane (the electric
  // piano among them, at the record's weight again since 09-22). The chance is
  // the presence Eugene approved: the share of house themes the part played on
  // when it stood in for every ep stab (48 of seeds 1-200), now drawn over
  // every eligible theme; the fast learned figures still take precedence.
  { id: 'ringing-keys', chance: .24, excludes: ['figure'], variants: [
    { id: 'half-notes', weight: 'movement', request: { struckFigures: [ringingKeys(2)], ambience: { figure: 'spacious' }, presence: { figure: 'supporting', sustained: 'background' } } },
    { id: 'whole-notes', weight: 1, request: { struckFigures: [ringingKeys(4)], ambience: { figure: 'spacious' }, presence: { figure: 'supporting', sustained: 'background' } } },
  ] },
  // **GA6's mids and highs**, before GA4's fills so a place's own line wins
  // the figure's space and GA4's held chord and stab fill it where none does.
  // Rules inside their windows (chance 1), claiming by the figure's space.
  { id: 'lead-line', chance: 1, when: { drums: true, kits: ['fourFloor'], bpm: { above: 133 } }, variants: [
    { id: 'held-lead', weight: 1, request: { struckFigures: [leadLine], ambience: { figure: 'spacious' } } },
  ] },
  { id: 'arp-line', chance: 1, when: { drums: true, kits: ['fourFloor'], bpm: { above: 115, atMost: 133 }, controls: { air: { min: .55 } } }, variants: [
    { id: 'climbing-pluck', weight: 1, request: { struckFigures: [arpLine], ambience: { figure: 'intimate' } } },
  ] },
  { id: 'stab-and-two-tone', chance: 1, when: { drums: true, kits: ['breaks'], bpm: { above: 115 } }, variants: [
    { id: 'stab-over-two-tone', weight: 1, request: { struckFigures: [brightStruck, twoTone], ambience: { figure: 'spacious' } } },
  ] },
  { id: 'echo-chord', chance: 1, when: { drums: true, kits: ['fourFloor'], bpm: { above: 115 }, controls: { space: { min: .75 } } }, variants: [
    { id: 'into-the-echo', weight: 1, request: { struckFigures: [echoChord], ambience: { figure: 'echo' } } },
  ] },
  { id: 'wide-chords', chance: 1, when: { drums: false, controls: { space: { min: .75 }, air: { min: .75 } } }, variants: [
    { id: 'four-bar-chords', weight: 1, request: { struckFigures: [wideChords], ambience: { figure: 'spacious' } } },
  ] },
  // The fast band's held mid part (GA4): a rule, not a coin — a fast four-floor
  // theme whose figure family drew nothing (the `figure` control's own coin)
  // and that rang no keys carries the held chord, so the fast band is never
  // without a mid part. Last on the list: its stream is its own and every
  // family before it draws what it drew. **The claims are the parts', not a
  // list of names**: each GA4 family asks for a role an earlier family already
  // holds when it has drawn — the figure's space (`ambience.figure`, which the
  // figure's own space, the ringing keys and the held chord all write), the
  // sixteenth lane, the backbeat — and a role taken is a skip, so no family
  // here names another (a style that drops one keeps the rest valid).
  { id: 'held-mid', chance: 1, when: { drums: true, kits: ['fourFloor'], bpm: { above: 115 } }, variants: [
    { id: 'offbeat-chords', weight: 1, request: { struckFigures: [heldMid], ambience: { figure: 'spacious' } } },
  ] },
  // The fast band's percussion loop (GA4): a rule — a fast four-floor theme
  // whose hands did not answer (they play up to 130 BPM) carries the loop, so
  // the fast band's sixteenth lane always talks.
  { id: 'perc-loop', chance: 1, when: { drums: true, kits: ['fourFloor'], bpm: { above: 115 } }, variants: [
    { id: 'shuffle', weight: 1, request: { rhythm: { sixteenth: percLoop as any }, presence: { sixteenth: 'supporting' } } },
  ] },
  // The slow band's lazy kit (GA4): every drummed theme at 94 BPM or under
  // carries it — the band GA3 opened, where the house never stands.
  { id: 'lazy-kit', chance: 1, when: { drums: true, bpm: { atMost: 94 } }, variants: [
    { id: 'behind', weight: 1, request: { rhythm: lazyKit as any, presence: { backbeat: 'supporting', sixteenth: 'supporting' } } },
  ] },
  // The broken kit's ghosts (GA4): every broken-kit theme carries them on the
  // backbeat, beside whatever the offbeat lane plays.
  { id: 'ghost-backbeat', chance: 1, when: { drums: true, kits: ['breaks'] }, variants: [
    { id: 'funk', weight: 1, when: { bpm: { atMost: 150 } }, request: { rhythm: { backbeat: breakGhosts as any }, presence: { backbeat: 'supporting' } } },
    { id: 'two-step', weight: 1, when: { bpm: { above: 150 } }, request: { rhythm: { backbeat: twoStepGhosts as any }, presence: { backbeat: 'supporting' } } },
  ] },
  // The bright stab (GA4): a four-floor theme under a bright spell whose figure
  // family drew nothing carries it — a bright spell's colour, never the house's.
  { id: 'bright-stab', chance: 1, when: { drums: true, kits: ['fourFloor'], controls: { air: { min: .55 } } }, variants: [
    { id: 'offbeat-stabs', weight: 1, request: { struckFigures: [brightStab], ambience: { figure: 'intimate' } } },
  ] },
];
export const composition: CompositionPolicy = {
  placement: { grammar: 'house-phrases-1', beatsPerBar: 4, pinWhen: fourFloor, sustainedClearanceBeats: 4 },
  version: 'parts-2', provenance: { basis: 'authored', reference: 'listening-pilot/depth-08',
    note: 'Reusable family hypotheses following one accepted reference; probabilities and combinations still need listening. No audio or catalog file is required at runtime.' },
  limits: { upperParts: 2, sparseUpper: 1, rhythmParts: 2, spatialReturns: 2 },
  // A part's preferred profile draws three times its palette weight: the hand
  // cells' conga three in four against the bongo, the ringing keys' piano about
  // seven in eight against the rhodes and the glass (the composer fix round of
  // 09-22, when those windows widened from one instrument to a family).
  prefer: 3,
  // Air or sustain (composition.ts `textureOf`): two held things make a
  // sustained texture. Measured over seeds 1-200 at the house before the rule:
  // 104 themes sustained, 96 air. The bed threshold is the synth pads'
  // (wavePad .9, formantPad .74, supersawPad .7) and leaves the strings (.52),
  // the swell (.32) and the keyboards under it; whole-note chords hold, half
  // notes do not.
  texture: { sustainedFrom: 2, bedHold: .7, heldBeats: 4, droneContours: ['pedal'], heldBodies: ['full'] },
  // One foreground (Eugene, 09-22): a sustained theme draws whether its drone
  // is in front or behind, off the `drone` control above. In front, the
  // real-world class is withdrawn on every draw: a hit (struck, gone before
  // half the bar) that comes round faster than every second and a half and
  // does not ring through most of the gap. The second and a half is where his
  // two examples part: the ep and the glass stabs of seeds 50 and 20, a hit
  // every .6-.9 s at 98-101 bpm, compete with the drone; the marimba stab of
  // 27191 theme 3, a hit every 1.8 s at 50 bpm, and a bell every eight bars
  // are "Buddhist-bowl-like tones". Three quarters of the gap is where a
  // ringing chord (the ringing keys' half and whole notes) stops being a hit.
  //
  // **A held bass under the full body is always the drone in front** (Eugene,
  // 09-23, of seeds 13 and 20 drawn behind it: "the woodblock is more round
  // but it doesn't match foreground drone pads"; "the fmGlass here is still
  // out of place, way louder than the rest of the track and doesn't match
  // drone notes"). A pedal or held bass with the full body is the endless
  // synth drone, and the pad nine decibels down did not make it a floor, so
  // `drone` + `body` draws no coin and hears no bird. Every other sustained
  // set keeps the coin.
  //
  // **The drone in front on a soft floor** (Eugene, 10-01, round GA7): on the
  // slow side of Ember — the drums on, the tempo centre under 95, where the
  // curve's slow labels end and the house's window begins — a drone may stay
  // the foreground with a soft four-floor kick and loose hats under it. The
  // four-floor kit only: a broken kit's own table carries its snare and its
  // figure, and is what it was. Below the drums line (27191) and at the house
  // (centre 100) there is no floor. What each lane plays on it is the lane's
  // (`Lane.floor`, house-v2's lane table).
  scene: { forward: 'drone', always: [['drone', 'body']], realWorld: { holdBelow: .5, sparseSeconds: 1.5, ringCovers: .75 },
    floor: { centreBelow: 95, kits: ['fourFloor'] } },
  families,
};
