// What a recipe does to the composer, heard in the plan and the program: held
// bass, percussion cells, bass families, struck and continuous phrases, distant
// percussion and sparse pulses, and the explicit refusals beside each.
//
// These thirteen lived in the private mining package's listening check until
// 09-22 (review, finding 9), where root `npm run check` never ran them; they
// guard `generator.ts` and `interpret.ts`, not the catalog, so they are here.
import { laneLevelDb } from '../src/lane-level.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planTheme } from '../src/set-plan.ts';
import { programOf } from '../src/performance.ts';
import { strategyById } from '../src/strategies/index.ts';
import { HOUSE, biasFor } from '../src/spell.ts';
import { interpretWants } from '../src/interpret.ts';
import type { Recipe } from '../src/recipe.ts';
import { validate, vocabularyOf } from '../src/recipe.ts';
import * as registry from '@deep-house/engine/voices';
import { resolveRhythm, withRhythm } from '../src/parts/rhythm.ts';
import { recipesFor } from '../src/mix.ts';
import { figureCandidates } from '../src/parts/figure.ts';

const style = strategyById('house-v2').style;
// Captured pilot fixtures keep their original map, independent of later fits.
const recipe: Recipe = { schema: 1, kind: 'recipe', interpreter: 'v2.8', id: 'test/held', scope: 'track', applies: null, name: 'held', origin: 'mined', birds: {}, wants: { figures: { bassline: { follows: 'harmony', articulation: 'held' } } } };

test('held bass changes actual performances across seeds and respects arrangement gates', () => {
  for (const seed of ['31001', '31002', '31003']) {
    const baseline = planTheme(seed, 0, { style, spell: HOUSE });
    const track = planTheme(seed, 0, { style, spell: HOUSE, recipe });
    const program = programOf(track);
    assert.notEqual(track.dice.motifRegister, 'bass', 'a replaced motif is not reported as playing');
    const bass = program.events.filter(e => e.layer === 'bass');
    assert.ok(bass.length > 0);
    assert.notDeepEqual(bass, programOf(baseline).events.filter(e => e.layer === 'bass'));
    assert.ok(bass.some(e => Number(e.p?.dur) > program.barSeconds), 'there are notes held across bars');
    for (let i = 0; i < bass.length; i++) {
      const e = bass[i];
      assert.equal(e.step, 0, 'harmonic boundaries are on the bar');
      const end = Number(e.bar) + Number(e.p?.dur) / program.barSeconds;
      assert.ok(end <= program.bars + 1e-6, 'notes stop by the theme end');
      if (bass[i + 1]) assert.ok(end <= Number(bass[i + 1].bar) + 1e-6, 'held bass does not overlap its next note');
      for (let b = Number(e.bar); b < end - 1e-6; b++) {
        assert.ok(track.timeline[b].layers.includes('bass'), 'a held note stops when its arrangement gate closes');
      }
    }
  }
});

test('planning facts carry the recipe; unsupported instructions stay visible', () => {
  const wanted = interpretWants({ ...recipe, wants: { ...recipe.wants, mix: { width: 'wide' } } }, style, biasFor(HOUSE, style));
  assert.equal(wanted.heldBass, true);
  assert.ok(wanted.notes.some(n => n.block === 'mix' && n.state === 'unsupported'));
});

const percussionRecipe: Recipe = { ...recipe, id: 'test/percussion', wants: {
  ...recipe.wants, harmony: { movement: 'pedal' }, stage: { front: 'sixteenth' },
  rhythm: { sixteenth: [
    { bars: 2, steps: [0, 4, 8, 12, 16, 20, 24, 28, 30], accents: [.28, .22, .25, .2, .28, .22, .25, .2, .12], families: ['drum'], properties: { struck: true, holdMax: .03, brightnessMin: 2000, brightnessMax: 3500 } },
    { bars: 2, steps: [7, 23, 31], accents: [.13, .11, .09], families: ['noise'], properties: { struck: true, holdMax: .01, brightnessMax: 7000 } },
  ] },
}, forbids: ['figure'] };

test('explicit percussion cells play the requested positions, keep gates, and never draw reserved instruments', () => {
  assert.deepEqual(validate(percussionRecipe, vocabularyOf(style, registry)), []);
  const resolved = resolveRhythm(percussionRecipe.wants!.rhythm, style, []);
  assert.deepEqual(resolved.errors, []);
  assert.equal(withRhythm(style.lanes, resolved.lanes).filter(l => l.role === 'sixteenth').length, 2);
  for (const seed of ['31001', '31002', '31003']) {
    const track = planTheme(seed, 0, { style, spell: HOUSE, recipe: percussionRecipe });
    assert.equal(track.progression.chords.length, 1);
    assert.equal(track.progression.chords[0].degree, 0);
    assert.ok(!track.events.some(e => e.layer === 'keys'), 'the forbidden harmonic figure emits no notes');
    assert.ok(!track.dice.motifRegister, 'no forbidden or replaced motif is reported as playing');
    const sixteenth = track.events.filter(e => e.layer === 'shaker');
    assert.ok(sixteenth.length > 0, 'the requested role really plays');
    const choices = new Set(sixteenth.map(e => e.voice));
    assert.equal(choices.size, 2, 'two distinct requested colours are present');
    for (const voice of choices) assert.ok(resolved.lanes.some(r => r.lane.voices!.some(e => e.v === voice && e.w > 0)), `${voice} is an enabled, matching candidate`);
    for (const e of sixteenth) {
      const part = resolved.lanes.find(r => r.lane.voices!.some(v => v.v === e.voice && v.w > 0))!.part;
      const position = (e.bar! % part.bars) * 16 + e.step!;
      assert.ok(part.steps.includes(position));
      assert.ok(track.timeline[e.bar!].layers.includes('sixteenths'), 'a cell never leaks across its arrangement gate');
    }
    for (const row of track.timeline.filter(t => t.layers.includes('sixteenths'))) {
      const expected = resolved.lanes.reduce((n, r) => n + r.part.steps.filter(s => Math.floor(s / 16) === row.bar % r.part.bars).length, 0);
      assert.equal(sixteenth.filter(e => e.bar === row.bar).length, expected, 'the old mask does not double the requested cells');
    }
    const plainStage = planTheme(seed, 0, { style, spell: HOUSE, recipe: { ...percussionRecipe, wants: { ...percussionRecipe.wants, stage: undefined } } });
    const quiet = track.events.filter(e => e.layer === 'pad');
    const normal = plainStage.events.filter(e => e.layer === 'pad');
    assert.ok(quiet.length > 0);
    assert.equal(quiet.length, normal.length);
    // Interpreter v2.25 withdrew `stage.front` naming a percussion role (it
    // quartered harmonic notes for one rejected listening candidate): the want
    // is reported unsupported and the pad plays at its normal strength.
    quiet.forEach((e, i) => assert.equal(e.p.vel, Number(normal[i].p.vel)));
    assert.ok(interpretWants(percussionRecipe, style, biasFor(HOUSE, style)).notes
      .some(n => n.block === 'stage.front' && n.state === 'unsupported'), 'a withdrawn want is said, not dropped');
  }
});

test('invalid or impossible rhythm requests are explicit failures and cannot reopen a forbidden role', () => {
  const vocab = vocabularyOf(style, registry);
  for (const malformed of [null, [], { sixteenth: [] }, { sixteenth: [{ bars: 1, steps: [0, 0], accents: [1, 1], families: ['drum'] }] }]) {
    assert.ok(validate({ ...recipe, wants: { rhythm: malformed } }, vocab).length);
    assert.equal(resolveRhythm(malformed, style, []).lanes.length, 0);
  }
  const names = { sixteenth: [{ bars: 1, steps: [0], accents: [1], families: ['drum'], voice: 'woodblock' }] };
  assert.ok(validate({ ...recipe, wants: { rhythm: names } }, vocab).some(p => p.includes('voice')));
  const impossible = { sixteenth: [{ bars: 1, steps: [0], accents: [1], families: ['drum'], properties: { brightnessMax: 1 } }] };
  const result = interpretWants({ ...recipe, wants: { rhythm: impossible } }, style, biasFor(HOUSE, style));
  assert.equal(result.rhythm.length, 0);
  assert.ok(result.notes.some(n => n.block === 'rhythm' && n.state === 'unsatisfied'));
  assert.ok(resolveRhythm(percussionRecipe.wants!.rhythm, style, ['sixteenth']).errors.length);
  assert.ok(validate({ ...recipe, wants: { harmony: { movement: 'pedal', extra: true } } }, vocab).length);
});

const bassFamily = { contour: 'pedal', intervals: { steps: [.5, 1], leaps: [0, .5] }, cell: { beats: [4, 4] }, onGrid: [.16, .35], range: { semitones: [2, 5] }, density: [4, 6], returns: { bars: [4, 4] } };
const movingBassRecipe: Recipe = { ...percussionRecipe, id: 'test/moving-bass', wants: {
  harmony: { movement: 'pedal' }, rhythm: percussionRecipe.wants!.rhythm,
  figures: { bassline: { follows: 'harmony', articulation: 'legato', motif: bassFamily } },
}, forbids: ['figure', 'sustained'] };

test('a recipe bass family reaches the real player, moves between kicks, and preserves its phrase register', () => {
  assert.deepEqual(validate(movingBassRecipe, vocabularyOf(style, registry)), []);
  const wanted = interpretWants(movingBassRecipe, style, biasFor(HOUSE, style));
  assert.deepEqual(wanted.bassMotif, bassFamily);
  assert.equal(wanted.heldBass, false);
  const shapes = new Set<string>();
  for (const seed of ['31001', '31002', '31003']) {
    const cast = recipesFor({ strategy: 'house-v2', masterSeed: seed, search: `?recipe=${movingBassRecipe.id}` }, [movingBassRecipe]);
    assert.equal(cast.track!.id, movingBassRecipe.id);
    const track = planTheme(seed, 0, { style, spell: cast.spell, recipe: cast.track });
    assert.ok(!track.events.some(e => ['pad', 'keys'].includes(e.layer!)), 'the rejected harmonic roles are absent from the whole plan');
    assert.equal(track.dice.motifRegister, 'bass');
    shapes.add(`${track.dice.motifDegrees}/${track.dice.motifCell}`);
    const bass = track.events.filter(e => e.layer === 'bass');
    assert.ok(bass.length > 50);
    assert.ok(bass.filter(e => e.step! % 4 !== 0).length / bass.length > .5, 'the bass has a rhythm distinct from quarter-note kicks');
    assert.ok(new Set(bass.map(e => e.p.midi)).size > 1, 'this is a moving pitch line');
    for (let i = 0; i < bass.length; i++) {
      const e = bass[i], end = e.t + Number(e.p.dur);
      if (bass[i + 1]) assert.ok(end <= bass[i + 1].t + 1e-6, 'note durations end at the next actual onset');
      assert.ok(end <= track.bars * track.barSeconds + 1e-6);
      for (let bar = e.bar!; bar * track.barSeconds < end - 1e-6; bar++) assert.ok(track.timeline[bar].layers.includes('bass'), 'a recipe bass note stops at its arrangement gate');
    }
    // Main sections state the family. Its compact register must stay compact
    // even when the root is at the top edge of the ordinary bass register.
    for (const section of track.arrangement.sections.filter(s => s.kind === 'main')) {
      for (let from = section.startBar; from + 4 <= section.startBar + section.bars; from += 4) {
        const notes = bass.filter(e => e.bar! >= from && e.bar! < from + 4).map(e => Number(e.p.midi));
        if (notes.length) assert.ok(Math.max(...notes) - Math.min(...notes) <= 5, 'neighbour notes do not fold into octave jumps');
      }
    }
  }
  assert.ok(shapes.size > 1, 'a family generates different phrases across seeds');
});

test('an invalid, forbidden or unrollable bass family is not silently replaced with a generic riff', () => {
  for (const bass of [null, { follows: 'harmony', articulation: 'legato' }, { follows: 'harmony', articulation: 'held', motif: bassFamily }]) {
    assert.ok(validate({ ...recipe, wants: { figures: { bassline: bass } } }, vocabularyOf(style, registry)).length);
  }
  const impossible = { ...movingBassRecipe, wants: { figures: { bassline: { follows: 'harmony', articulation: 'legato', motif: { ...bassFamily, density: [16, 16], cell: { beats: [16, 16] } } } } } };
  assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: impossible }), /cannot be rolled/);
  assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: { ...movingBassRecipe, forbids: ['bassline'] } }), /no enabled bass motif lane/);
});

const struckFigure = {
  follows: 'harmony', articulation: 'struck', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .05, holdMax: .09, brightnessMin: 4000, brightnessMax: 7500 },
  motif: { contour: 'arch', intervals: { steps: [.3, 1], leaps: [0, .7] }, cell: { beats: [2, 2] }, onGrid: [.2, .6], range: { semitones: [3, 9] }, density: [10, 14], returns: { bars: [4, 4] } },
  strength: [.38, .44], entry: { beats: [.5, .5] }, spacing: { bars: [1, 1] },
};
const seasonedRecipe: Recipe = { ...movingBassRecipe, id: 'test/seasoned', wants: {
  ...movingBassRecipe.wants,
  figures: { ...movingBassRecipe.wants!.figures, figure: struckFigure },
  ambience: { backbeat: 'spacious', sixteenth: 'spacious', figure: 'spacious' },
  presence: { sixteenth: 'supporting' },
}, forbids: ['sustained'] };

test('a struck phrase coexists with the bass, preserves the drum score, and follows its own gates', () => {
  assert.deepEqual(validate(seasonedRecipe, vocabularyOf(style, registry)), []);
  const pool = figureCandidates(struckFigure as any, style, seasonedRecipe.forbids!);
  assert.ok(pool.length > 0);
  const shapes = new Set<string>();
  for (const seed of ['31001', '31002', '31003']) {
    const cast = recipesFor({ strategy: 'house-v2', masterSeed: seed, search: '?recipe=test/seasoned' }, [seasonedRecipe]);
    const opts = { style, spell: cast.spell };
    const before = planTheme(seed, 0, { ...opts, recipe: movingBassRecipe });
    const after = planTheme(seed, 0, { ...opts, recipe: seasonedRecipe });
    const foundation = (t: typeof after) => t.events.filter(e => ['bass', 'kick'].includes(e.layer));
    assert.deepEqual(foundation(after), foundation(before), 'all kick and bass note parameters survive, not only counts');
    const drumScore = (t: typeof after) => t.events.filter(e => !['keys', 'pad', 'bass'].includes(e.layer)).map(e => ({ t: e.t, voice: e.voice, vel: e.p.vel, pan: e.p.pan }));
    assert.deepEqual(drumScore(after), drumScore(before));
    assert.equal(after.dice.motifRegister, 'bass');
    assert.ok(!after.events.some(e => e.layer === 'pad'));
    const upper = after.events.filter(e => e.layer === 'keys');
    assert.ok(upper.length > 0);
    shapes.add(`${after.dice.struckFigureDegrees}/${after.dice.struckFigureCell}`);
    const played = new Set<number>();
    for (const e of upper) {
      assert.ok(pool.some(c => c.voice === e.voice));
      assert.ok(after.timeline[e.bar!].layers.includes('keys'));
      assert.ok(!after.timeline[e.bar!].section.toLowerCase().includes('breakdown'));
      assert.ok(e.p.midi! >= 48 && e.p.midi! <= 96);
      assert.ok(e.step! >= 2 && e.step! < 16);
      assert.ok(e.p.dur! > 0 && e.p.dur! <= .35);
      assert.equal(e.p.reverb, .85);
      played.add(Number(e.p.midi));
    }
    assert.ok(played.size > 1);
    const compiled = programOf(after);
    const backbeat = compiled.events.filter(e => registry.BY_NAME[e.voice].roles.includes('backbeat'));
    assert.equal(backbeat.length, before.events.filter(e => registry.BY_NAME[e.voice].roles.includes('backbeat')).length);
    assert.ok(backbeat.every(e => e.p.reverb === .85), 'space follows any played backbeat; a gated role is not invented');
    assert.ok(compiled.events.some(e => e.layer === 'shaker' && e.p.reverb === .85));
    for (const e of after.events.filter(e => e.layer === 'shaker')) {
      const old = before.events.find(b => b.voice === e.voice && b.t === e.t)!;
      const level = registry.BY_NAME[e.voice].level;
      const settings = compiled.settings;
      // the level the voice plays at: the room's, or since S18 (`laneFloors`) the
      // record's where the room wrote the word off and the voice is not its own
      const plays = laneLevelDb(style, settings.levels as Record<string, number>, e.voice, level)!;
      const ratio = Math.pow(10, (style.base.levels[level] - plays) / 20);
      assert.ok(Math.abs(Number(e.p.gain) / (Number(old.p.gain) || 1) - ratio) < 1e-8, 'supporting presence undoes the room level, retaining the candidate trim');
    }
    assert.ok(!compiled.events.some(e => ['bass', 'kick'].includes(e.layer) && e.p.reverb !== undefined));
  }
  assert.equal(shapes.size, 3, 'one family produces three distinct phrases without searching seeds');
});

test('invalid, forbidden, unavailable or unrollable upper phrases and spatial requests are refused', () => {
  const withFigure = (figure: any): Recipe => ({ ...seasonedRecipe, wants: { ...seasonedRecipe.wants, figures: { ...seasonedRecipe.wants!.figures, figure } } });
  for (const figure of [null, { ...struckFigure, strength: [2, 3] }, { ...struckFigure, entry: { beats: [3, 3] } }, { ...struckFigure, voice: 'fmBell' }]) {
    assert.ok(validate(withFigure(figure), vocabularyOf(style, registry)).length);
    assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: withFigure(figure) }));
  }
  for (const r of [
    { ...seasonedRecipe, forbids: ['figure', 'sustained'] },
    withFigure({ ...struckFigure, properties: { brightnessMax: 1 } }),
    withFigure({ ...struckFigure, motif: { ...struckFigure.motif, onGrid: [.999, .999] } }),
    { ...seasonedRecipe, wants: { ...seasonedRecipe.wants, ambience: { kick: 'spacious' } } },
    { ...seasonedRecipe, wants: { ...seasonedRecipe.wants, presence: { sixteenth: 'anything' } } },
  ]) assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: r }));
  assert.ok(validate({ ...recipe, wants: { ambience: { backbeat: 'reverb' } } }, vocabularyOf(style, registry)).length);
});

const ostinato = { ...struckFigure, behavior: 'ostinato', strength: [.22, .26], entry: { beats: [0, 0] },
  motif: { contour: 'pedal', intervals: { steps: [1, 1], leaps: [0, 0] }, cell: { beats: [2, 2] }, onGrid: [.25, .25], range: { semitones: [2, 2] }, density: [16, 16], returns: { bars: [4, 4] } },
};
const ornament = { ...struckFigure, behavior: 'phrase',
  properties: { struck: true, holdMin: .25, holdMax: .45, brightnessMin: 3800, brightnessMax: 4800 },
  entry: { beats: [24.5, 24.5] }, spacing: { bars: [8, 8] },
  motif: { ...struckFigure.motif, density: [8, 10], range: { semitones: [3, 7] }, returns: { bars: [8, 8] } },
};
const continuousRecipe: Recipe = { ...seasonedRecipe, id: 'test/continuous', wants: { ...seasonedRecipe.wants,
  figures: { ...seasonedRecipe.wants!.figures, figure: [ostinato, ornament] },
} };

test('continuous pitched percussion keeps every pulse while an independent ornament enters later', () => {
  assert.deepEqual(validate(continuousRecipe, vocabularyOf(style, registry)), []);
  const bodyVoice = figureCandidates(ostinato as any, style, ['sustained'])[0].voice;
  const ornamentVoice = figureCandidates(ornament as any, style, ['sustained'])[0].voice;
  assert.notEqual(bodyVoice, ornamentVoice, 'the two requested property sets resolve to distinct instruments');
  for (const seed of ['31001', '31002', '31003']) {
    const cast = recipesFor({ strategy: 'house-v2', masterSeed: seed, search: '?recipe=test/continuous' }, [continuousRecipe]);
    const opts = { style, spell: cast.spell };
    const both = planTheme(seed, 0, { ...opts, recipe: continuousRecipe });
    const alone = planTheme(seed, 0, { ...opts, recipe: { ...continuousRecipe, wants: { ...continuousRecipe.wants,
      figures: { ...continuousRecipe.wants!.figures, figure: ostinato },
    } } });
    const before = planTheme(seed, 0, { ...opts, recipe: seasonedRecipe });
    assert.deepEqual(both.events.filter(e => e.layer !== 'keys'), before.events.filter(e => e.layer !== 'keys'), 'all foundation events and their parameters remain fixed');
    const body = both.events.filter(e => e.voice === bodyVoice);
    assert.deepEqual(body, alone.events.filter(e => e.voice === bodyVoice), 'adding an ornament cannot redraw or displace the repeating part');
    assert.ok(body.length > 0);
    const perBar = new Map<number, typeof body>();
    for (const e of body) {
      assert.ok(both.timeline[e.bar].layers.includes('keys'));
      const row = perBar.get(e.bar) || []; row.push(e); perBar.set(e.bar, row);
    }
    for (const notes of perBar.values()) {
      assert.deepEqual(notes.map(e => e.step), Array.from({ length: 16 }, (_, i) => i), 'sixteenths span the entire bar, including its second half');
      assert.equal(new Set(notes.map(e => e.p.midi)).size, 2, 'the accompaniment stays a narrow pedal instead of a melodic run');
      assert.deepEqual(notes.slice(0, 8).map(e => [e.p.midi, e.p.vel]), notes.slice(8).map(e => [e.p.midi, e.p.vel]));
    }
    const top = both.events.filter(e => e.voice === ornamentVoice);
    assert.ok(top.length > 0);
    for (const e of top) {
      const section = both.arrangement.sections.find(s => e.bar >= s.startBar && e.bar < s.startBar + s.bars)!;
      const phase = ((e.bar - section.startBar) % 8) * 16 + e.step!;
      assert.ok(phase >= 98 && phase < 128, 'the ornament waits until the last two bars of its section-relative cycle');
      assert.ok(both.timeline[e.bar].layers.includes('keys'));
      assert.equal(e.p.reverb, .85, 'the second part receives the requested space too');
    }
    const compiled = programOf(both);
    assert.ok(compiled.events.some(e => e.voice === bodyVoice));
    assert.ok(compiled.events.some(e => e.voice === ornamentVoice));
  }
});

test('multi-part figure requests fail as a unit and the legacy single part keeps its performance', () => {
  const withParts = (parts: any): Recipe => ({ ...continuousRecipe, wants: { ...continuousRecipe.wants, figures: { ...continuousRecipe.wants!.figures, figure: parts } } });
  const trio = withParts([ostinato, ornament, ornament]);
  assert.deepEqual(validate(trio, vocabularyOf(style, registry)), [], 'the separate piano expanded the contract to three pitched parts');
  assert.doesNotThrow(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: trio }));
  for (const parts of [[], [ostinato, ornament, ornament, ornament], [[ostinato]],
    [{ ...ostinato, behavior: 'anything' }], [{ ...ostinato, entry: { beats: [1, 1] } }],
    [{ ...ostinato, motif: { ...ostinato.motif, cell: { beats: [3, 3] } } }],
    [ostinato, { ...ornament, voice: 'vibes' }],
  ]) {
    const r = withParts(parts);
    assert.ok(validate(r, vocabularyOf(style, registry)).length);
    assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: r }));
  }
  assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: withParts([ostinato, { ...ornament, properties: { brightnessMax: 1 } }]) }));
  const legacy = planTheme('31001', 0, { style, spell: HOUSE, recipe: seasonedRecipe });
  const wrapped = planTheme('31001', 0, { style, spell: HOUSE, recipe: { ...seasonedRecipe, wants: { ...seasonedRecipe.wants, figures: { ...seasonedRecipe.wants!.figures, figure: [struckFigure] } } } });
  assert.deepEqual(wrapped.events, legacy.events);
});

test('distant percussion preserves the accepted score and moves only its space and backbeat presence', () => {
  const recipe: Recipe = { ...continuousRecipe, wants: { ...continuousRecipe.wants,
    ambience: { backbeat: 'distant', sixteenth: 'distant', figure: 'spacious' },
    presence: { sixteenth: 'supporting', backbeat: 'background' },
  } };
  assert.deepEqual(validate(recipe, vocabularyOf(style, registry)), []);
  for (const seed of ['31001', '31002', '31003']) {
    const cast = recipesFor({ strategy: 'house-v2', masterSeed: seed, search: '?recipe=' + recipe.id }, [recipe]);
    const opts = { style, spell: cast.spell };
    const before = planTheme(seed, 0, { ...opts, recipe: continuousRecipe });
    const after = planTheme(seed, 0, { ...opts, recipe });
    const preserved = (t: typeof after) => t.events.filter(e => ['kick', 'bass', 'keys'].includes(e.layer));
    assert.deepEqual(preserved(after), preserved(before));
    assert.equal(after.events.length, before.events.length);
    for (let i = 0; i < after.events.length; i++) {
      const a = after.events[i], b = before.events[i];
      assert.deepEqual([a.voice, a.t, a.p.vel, a.p.midi, a.p.dur], [b.voice, b.t, b.p.vel, b.p.midi, b.p.dur]);
      const roles = registry.BY_NAME[a.voice].roles;
      if (roles.includes('backbeat') || a.layer === 'shaker') {
        assert.equal(a.p.background, .8);
        assert.equal(a.p.reverb, 0);
        assert.equal(a.p.delay, 0);
      }
    }
    const beforeClap = before.events.find(e => e.voice === 'clap');
    const afterClap = after.events.find(e => e.voice === 'clap');
    if (afterClap && beforeClap) assert.ok((afterClap.p.gain ?? 1) < (beforeClap.p.gain ?? 1) * .5, 'background backbeat is quieter than its original foreground placement');
    const compiled = programOf(after);
    assert.ok(compiled.events.some(e => e.p.background === .8));
  }
  const unsupported: Recipe = { ...recipe, wants: { ...recipe.wants, ambience: { figure: 'distant' } } };
  assert.ok(validate(unsupported, vocabularyOf(style, registry)).length, 'only implemented percussion paths can request the new return');
  assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: unsupported }));
});

const pulseTexture = { follows: 'harmony', articulation: 'pulse', register: 'mid', families: ['keyboard'],
  properties: { struck: true, holdMin: .05, holdMax: .09, brightnessMin: 4000, brightnessMax: 7500 },
  strength: [.52, .58], spacing: { bars: [4, 4] }, entry: { beats: [.5, .5] }, duration: { beats: [.5, .5] }, ambience: 'distant' };
const pulseRecipe: Recipe = { ...continuousRecipe, id: 'test/pulse', wants: { ...continuousRecipe.wants,
  figures: { ...continuousRecipe.wants!.figures, texture: pulseTexture } } };

test('sparse texture keeps its own four-bar clock and return without restaging the foreground', () => {
  assert.deepEqual(validate(pulseRecipe, vocabularyOf(style, registry)), []);
  for (const seed of ['31001', '31002', '31003']) {
    const cast = recipesFor({ strategy: 'house-v2', masterSeed: seed, search: '?recipe=' + pulseRecipe.id }, [pulseRecipe]);
    // (S21's silence rule off: a gap the continuous bed leaves takes the bass,
    // which the pulses close, and the claim here is the pulse's own)
    const opts = { style: { ...style, switches: { ...(style.switches as Record<string, boolean>), neverSilent: false } }, spell: cast.spell };
    const old = planTheme(seed, 0, { ...opts, recipe: continuousRecipe });
    const next = planTheme(seed, 0, { ...opts, recipe: pulseRecipe });
    const pulses = next.events.filter(e => e.role === 'texture');
    assert.ok(pulses.length > 10);
    assert.deepEqual(next.events.filter(e => e.role !== 'texture'), old.events);
    for (const e of pulses) {
      assert.equal(e.bar % 4, 0);
      assert.equal(e.step, 2);
      assert.ok(next.timeline[e.bar].layers.includes('keys'));
      assert.equal(e.p.background, 3.2);
      assert.equal(e.p.reverb, 0);
    }
    const before = programOf(old), after = programOf(next);
    const withoutIndex = ({ i, ...e }: any) => e;
    assert.deepEqual(after.events.filter(e => e.role !== 'texture').map(withoutIndex), before.events.map(withoutIndex));
    assert.deepEqual(after.development, before.development);
    assert.equal(after.events.filter(e => e.role === 'texture').length, pulses.length);
    assert.ok(after.events.filter(e => e.role === 'texture').every(e => e.p.background === 3.2 && !e.p.treatment));
    const changed: Recipe = { ...pulseRecipe, wants: { ...pulseRecipe.wants, tone: { kick: 'rounded', bassline: 'defined' } } };
    const tone = planTheme(seed, 0, { ...opts, recipe: changed });
    assert.deepEqual(tone.events.map(e => [e.voice,e.t,e.p.midi,e.p.vel,e.p.dur]), next.events.map(e => [e.voice,e.t,e.p.midi,e.p.vel,e.p.dur]));
    assert.ok(tone.events.filter(e => e.voice === 'kick').every(e => e.p.bodyLp === 110));
    assert.ok(tone.events.filter(e => e.voice === 'sub').every(e => e.p.bodyFloor === .16));
  }
});

test('invalid or unavailable pulse parts and low-end characters cannot silently fall back', () => {
  for (const texture of [[], { ...pulseTexture, voice: 'fmBell' }, { ...pulseTexture, spacing: { bars: [0, 0] } },
    { ...pulseTexture, entry: { beats: [16, 16] } }, { ...pulseTexture, duration: { beats: [NaN, 1] } }]) {
    const r: Recipe = { ...pulseRecipe, wants: { ...pulseRecipe.wants, figures: { texture } } };
    assert.ok(validate(r, vocabularyOf(style, registry)).length);
    assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: r }));
  }
  for (const patch of [{ forbids: ['texture'] }, { wants: { figures: { texture: { ...pulseTexture, properties: { holdMin: .25, holdMax: .45 } } } } }, { wants: { tone: { kick: 'bright' } } }]) {
    assert.throws(() => planTheme('31001', 0, { style, spell: HOUSE, recipe: { ...pulseRecipe, ...patch } }));
  }
});
