// seed + length -> the whole track as data. No audio here at all: this file
// produces an event list and a set of automation curves you can print, diff or
// inspect in the console before a single oscillator exists.
//
// Every choice is a separate die rolled from the seed — key, tempo family,
// voicing style, keys timbre, bass template, stab figure, hat figure, section
// plan, FX palette — so the product of the dice, not one number, is what makes
// two seeds different records.

import PARAMS, { applyParams, baseParams, mergeParams, hatEnergy } from './params.js';
import Rng from './rng.js';
import { resolvePreset, PRESETS } from './presets.js';
import { CORPUS } from './corpus.js';
import { SCALES, makeProgression, chordAtBar, noteName, foldTo } from './theory.js';
import { makeArrangement, filterCurve, pushCurve, layersAtBar } from './arrangement.js';
import * as P from './patterns.js';

const TAIL_SECONDS = 4;

// The timbre weights are read off the *base* params rather than the live ones,
// because the mix has to be able to ask what theme n-1's instrument was without
// generating it — and by then some other theme's preset may be applied.
const TIMBRE = baseParams().timbre;

export const TIMBRE_FAMILIES = TIMBRE.lead.map((o) => o.v);

// Which instrument leads a theme. MEASURED weights (timbres.md); see params.js.
export function rawLeadTimbre(seed) {
  return new Rng(`${seed}::timbre`).weighted(TIMBRE.lead);
}

// The organ is the rare colour: about one theme in ten, and never two themes
// running. `avoidOrgan` is the mix telling this theme that the last one was an
// organ; a single track never sets it.
export function leadTimbreFor(seed, avoidOrgan = false) {
  const t = rawLeadTimbre(seed);
  if (t !== 'organ' || !avoidOrgan) return t;
  return new Rng(`${seed}::timbre:again`).weighted(TIMBRE.lead.filter((o) => o.v !== 'organ'));
}

// A send amount rolled inside a family's own measured spread, leaning wet:
// `dB` is the [p10, p90] of that family's wetness and `base` the send the
// median sits at.
function rollWet(rng, base, db) {
  const u = Math.pow(rng.next(), 0.55); // leaning toward the wet end
  return base * Math.pow(10, (db[0] + (db[1] - db[0]) * u) / 20);
}
export const VOICING_STYLES = ['ninths', 'sevenths', 'elevenths'];

const DENSITY_LABEL = { minimal: 'minimal', medium: 'medium', busy: 'busy' };
export const FX_PALETTES = [
  { name: 'open', riser: true, impact: true, sweep: true, reverb: 1.0, delay: 1.0 },
  { name: 'dry', riser: false, impact: true, sweep: true, reverb: 0.65, delay: 0.7 },
  { name: 'deep', riser: true, impact: false, sweep: true, reverb: 1.3, delay: 1.25 },
  { name: 'tight', riser: false, impact: true, sweep: false, reverb: 0.8, delay: 1.4 },
];

// `bpm`, `root` and `scaleName` can be forced from outside, which is how the
// mix engine keeps a whole set tempo-locked and chooses the next key.
export function generate({ seed = 1, minutes = 2, preset = 'auto', bpm: forceBpm = null, root: forceRoot = null, scaleName: forceScale = null, bars: forceBars = null, avoidOrgan = false } = {}) {
  const dice = (tag) => new Rng(`${seed}::${tag}`);

  // The preset decides the room; the seed decides the record inside it. Its
  // params are applied to the live params object before anything is generated,
  // and stored on the track so the player and the renderer can re-apply them.
  //
  // Which means planning *writes* to the table every voice imported, so it
  // also has to put back what it found. A plan is a plan and nothing else: the
  // next theme can be worked out while a set is playing without the deck that
  // is sounding changing rooms under it — which is how a growl theme's kick
  // arrived on a sub deck. The copy goes back at the end, so what `generate`
  // returns is exactly what it always returned.
  const found = mergeParams(PARAMS, {});
  const pre = resolvePreset(preset, dice('preset'));
  const shape = pre.shape || {};
  applyParams(pre.params);

  // --- the dice ---------------------------------------------------------
  const dTempo = dice('tempo');
  const dKey = dice('key');
  const dVoice = dice('voicing');
  const dTimbre = dice('timbre');
  const dPartner = dice('partner');
  const dWet = dice('wet');
  const dPiano = dice('pianorole');
  const dMel = dice('melody');
  const dBass = dice('bass');
  const dStab = dice('stab');
  const dHat = dice('hat');
  const dArr = dice('arrangement');
  const dFx = dice('fx');
  const dDense = dice('density');

  // MEASURED: set 1 sits at 122 BPM, two of three sets run near 103. Fix the
  // tempo for the whole piece — within a track the reference drifts < 0.3 BPM.
  const T = PARAMS.tempo;
  const slow = dTempo.chance(T.slowChance);
  const bpm =
    forceBpm ||
    (slow
      ? Math.min(T.slowMax, Math.round(dTempo.float(T.slowMin, T.slowMax + 0.99)))
      : Math.min(T.fastMax, Math.round(dTempo.float(T.fastMin, T.fastMax + 0.99))));
  const beat = 60 / bpm;
  const barSeconds = beat * 4;
  const swing = PARAMS.swing;

  const rootPc = forceRoot == null ? dKey.pick(PARAMS.key.roots) : ((forceRoot % 12) + 12) % 12;
  // MEASURED: minor 80% of the time; the remainder reads as dorian.
  const scaleName = forceScale || (dKey.chance(PARAMS.key.minorChance) ? 'minor' : 'dorian');
  const scale = SCALES[scaleName];
  const chordRoot = 48 + rootPc;

  // How much is allowed to happen at once. Most seeds are minimal; a few are
  // busier. This is the die that keeps the record deep house rather than
  // something with a note on every sixteenth.
  const D = PARAMS.density;
  const density = shape.density || dDense.weighted(D.weights);
  const maxBassNotes = D.bassNotes[density];
  const maxStabs = D.maxStabs[density];
  const fxEveryBars = D.fxEveryBars[density];

  const voicingStyle = shape.voicingStyle || dVoice.pick(VOICING_STYLES);
  const fx = dFx.pick(FX_PALETTES);

  // --- who is holding the chord and who is playing the figure -----------
  //
  // One die picks the theme's *lead* family; whether that family leads from
  // the sustained role or the rhythmic one is a property of the family, and a
  // second die fills the other role when two layers play. So a theme can be
  // strings holding under an electric piano, a piano over strings, a piano
  // alone with the drums and the bass, or — most often, under minimalism —
  // one layer and silence where the other would be.
  const TB = PARAMS.timbre;
  const leadTimbre = shape.leadTimbre || leadTimbreFor(seed, avoidOrgan);
  const leadSustained = TB.sustained.includes(leadTimbre);
  const padTimbre = shape.padTimbre || (leadSustained ? leadTimbre : dPartner.weighted(TB.padPartner));
  const stabTimbre = shape.stabTimbre || (leadSustained ? dPartner.weighted(TB.stabPartner) : leadTimbre);
  // MEASURED: 100% of the pluck tracks have a sustained pad under them, which
  // is what stops a dry short stab sounding thin, and 75% of the strings ones
  // have a stab over them. The piano joins the pluck in that rule for the same
  // reason and one more: a piano playing three notes a bar leaves 250 Hz - 2
  // kHz empty, and that band being empty was the largest single miss against
  // the benchmarks. A sustained floor under a sparse figure is both what the
  // records do and what fills it.
  const padUnderStab = stabTimbre === 'pluck' || stabTimbre === 'piano';

  // "Strings with various FX levels": MEASURED as the strings family's own
  // spread across its 16 tracks — wetness -5.3 to +0.2 dB and width -5.8 to
  // -1.4 dB — rolled per theme and leaning wet.
  const SG = PARAMS.strings;
  const padWet = rollWet(dWet, SG.wetBase, SG.wetDb) * fx.reverb;
  const padDelay = 0.1 * fx.delay;
  const padSpread = Math.min(
    1,
    SG.spread * Math.pow(10, (SG.widthDb[0] + (SG.widthDb[1] - SG.widthDb[0]) * dWet.next() + 4.4) / 20)
  );
  const stabWet =
    rollWet(dWet, PARAMS.keys.wetBase[stabTimbre] ?? 0.26, PARAMS.keys.wetDb[stabTimbre] ?? [-3.5, -1.6]) *
    fx.reverb;
  // MEASURED: 27% of all tracks carry a 4-7 Hz tremolo, and the electric piano
  // is where nearly all of it lives.
  const tremolo = stabTimbre === 'ep' && dWet.chance(0.5);

  // The piano's two roles, and its room. Heavy ambient reverberation is the
  // deep house piano; the dry note is quiet and rolled wetter still.
  const PI = PARAMS.piano;
  const pianoRole = dPiano.chance(PI.arpChance) ? 'arp' : 'melody';
  const pianoHall = PI.wet[0] + (PI.wet[1] - PI.wet[0]) * Math.pow(dPiano.next(), 0.55);
  const pianoDelay = (PI.delayWet[0] + (PI.delayWet[1] - PI.delayWet[0]) * dPiano.next()) * fx.delay;

  const wantedBars = forceBars
    ? Math.max(16, Math.round(forceBars / 4) * 4)
    : Math.max(16, Math.round((minutes * 60) / barSeconds / 4) * 4);
  const arrangement = makeArrangement(wantedBars, dArr, CORPUS);
  const bars = arrangement.bars;

  const progression = makeProgression(dice('prog'), chordRoot, scaleName, PARAMS, CORPUS, {
    voicingStyle,
    degreeBias: shape.degreeBias,
    loopBars: shape.loopBars,
    changeEvery: shape.changeEvery,
  });

  // A measured preset brings the figures it was measured with; otherwise they
  // are drawn from the corpus.
  const bassTemplate = P.thinMask(
    shape.bassMask
      ? { m: shape.bassMask, k: shape.bassContour, c: 1 }
      : P.pickBassTemplate(dBass, CORPUS, maxBassNotes),
    maxBassNotes
  );
  const stabTemplate = shape.stabMask ? { m: shape.stabMask, c: 1 } : P.pickStabMask(dStab, CORPUS);
  const hatTemplate = shape.hatMask ? { m: shape.hatMask, c: 1 } : P.pickHatMask(dHat, CORPUS);

  // The piano's melody, if that is the role it drew: one short phrase, and the
  // same phrase with one small change, which is the whole difference between a
  // part and a loop.
  let melody = null;
  let melodyVaried = null;
  let melodyBars = 2;
  if (stabTimbre === 'piano' && pianoRole === 'melody') {
    melodyBars = dMel.weighted(PI.melodyBars);
    const scalePool = [];
    for (let m = PI.low; m <= PI.high; m++) {
      if (scale.includes((((m - chordRoot) % 12) + 12) % 12)) scalePool.push(m);
    }
    melody = P.makeMelody(dMel, scalePool, { bars: melodyBars, center: 71 });
    melodyVaried = P.varyMelody(dMel, melody, scalePool);
  }

  const events = [];
  const timeline = [];

  const at = (bar, step) => bar * barSeconds + P.stepToBeats(step, swing) * beat;
  const push = (voice, t, p, meta) => events.push({ t, voice, p, ...meta });

  // Phrase-level variation, memoised so a bar and its neighbour share the same
  // music and the change happens where the rule says it does.
  const phraseBass = new Map();
  const phraseStabs = new Map();

  function bassForBar(bar, chordChanged) {
    const base = P.bassChanges(bassTemplate, { chordChanged });
    const phrase = Math.floor(bar / 8);
    const half = Math.floor((bar % 8) / 4);
    if (phrase === 0 && half === 0) return base;
    const key = `${phrase}:${half}:${chordChanged ? 1 : 0}`;
    if (!phraseBass.has(key)) {
      const r = new Rng(`${seed}::bassvar:${phrase}:${half}`);
      phraseBass.set(key, P.varyBass(r, base, half === 0 ? 'big' : 'small'));
    }
    return phraseBass.get(key);
  }

  function stabsForBar(bar) {
    const phrase = Math.floor(bar / 8);
    const half = Math.floor((bar % 8) / 4);
    const key = `${phrase}:${half}`;
    if (!phraseStabs.has(key)) {
      const base = P.stabsFromMask(new Rng(`${seed}::stabgen`), stabTemplate);
      phraseStabs.set(
        key,
        phrase === 0 && half === 0 ? base : P.varyStabs(new Rng(`${seed}::stabvar:${key}`), base)
      );
    }
    return phraseStabs.get(key);
  }

  // MEASURED: 2-5 bar kick dropouts are far more common than real breakdowns
  // and are what keeps a four-on-the-floor groove from feeling mechanical.
  const kickOut = new Set();
  for (let phrase = 1; phrase < Math.floor(bars / 8); phrase++) {
    const r = new Rng(`${seed}::drop:${phrase}`);
    if (!r.chance(PARAMS.groove.kickDropoutChance)) continue;
    const len = r.int(2, 5);
    const start = phrase * 8 + 8 - len;
    for (let b = start; b < start + len; b++) kickOut.add(b);
  }

  let lastBassMidi = null;
  let lastChordKey = null;
  let kickBars = 0;

  for (let bar = 0; bar < bars; bar++) {
    const { section, layers } = layersAtBar(arrangement, bar);
    const chord = chordAtBar(progression, bar);
    const r = new Rng(`${seed}::bar:${bar}`);
    const isFillBar = bar % 8 === 7;
    const barStart = bar * barSeconds;
    const chordKey = `${Math.floor(bar / (progression.loopBars || 8))}:${progression.chords.indexOf(chord)}`;
    const chordChanged = chordKey !== lastChordKey;
    // One harmonic layer at a time, most of the time, and which one it is
    // changes from section to section so the texture still moves.
    const hr = new Rng(`${seed}::harm:${section.index}`);
    // MEASURED: 40% of tracks run two harmonic layers, so it is 60/40 rather
    // than the 90/10 a strict reading of "minimal" would give — and a pluck
    // always gets its pad.
    const both = padUnderStab || hr.chance(D.bothHarmonicChance[density]);
    // When only one of them plays, it is usually the lead family's own role.
    const leadWins = hr.chance(TB.leadAlone);
    const keysSection = both || (leadSustained ? !leadWins : leadWins);
    const padSection = both || !keysSection;
    const kickThisBar = layers.kick && !kickOut.has(bar);
    if (kickThisBar) kickBars++;

    timeline.push({
      bar,
      t: barStart,
      section: section.label,
      sectionIndex: section.index,
      phrase: Math.floor(bar / 8),
      chord: chord.label,
      roman: chord.roman,
      layers: Object.keys(layers)
        .filter((k) => layers[k])
        .filter((k) => k !== 'kick' || kickThisBar)
        .filter((k) => k !== 'keys' || keysSection)
        .filter((k) => k !== 'pad' || padSection),
    });

    // --- kick -----------------------------------------------------------
    if (kickThisBar) {
      for (const h of P.kickPattern(r, { fill: isFillBar, sparse: false })) {
        push(
          'kick',
          at(bar, h.step),
          { vel: h.vel, startHz: slow ? PARAMS.kick.startHzSlow : PARAMS.kick.startHz },
          { bar, step: h.step, layer: 'kick' }
        );
      }
    }

    // --- hats -----------------------------------------------------------
    if (layers.hatClosed) {
      const hits = P.hatPattern(r, hatTemplate, {
        openHat: layers.hatOpen && r.chance(PARAMS.groove.openHatChance + (isFillBar ? 0.3 : 0)),
        sixteenths:
          layers.sixteenths &&
          shape.sixteenths !== false &&
          (shape.sixteenths === true || D.sixteenthHats[density]),
        corpus: CORPUS,
      });
      for (const h of hits) {
        // MEASURED: hats sit 5-10 ms ahead of the grid.
        const t = Math.max(0, at(bar, h.step) - PARAMS.hatNudge);
        push(
          h.voice,
          t,
          {
            vel: h.vel,
            pan: r.float(-PARAMS.space.hatPan, PARAMS.space.hatPan),
            haas: r.float(0.002, PARAMS.space.hatHaas),
          },
          { bar, step: h.step, layer: h.voice === 'shaker' ? 'shaker' : 'hats' }
        );
      }
    }

    // --- clap -----------------------------------------------------------
    if (layers.clap && PARAMS.clap.on) {
      for (const h of P.clapPattern(r, { ghost: true })) {
        push('clap', at(bar, h.step), { vel: h.vel }, { bar, step: h.step, layer: 'clap' });
      }
    }

    // --- bass -----------------------------------------------------------
    // A sustained line: each change is held until the next, across the bar
    // line, so the level between kicks never reaches zero.
    if (layers.bass) {
      const changes = P.capChanges(
        bassForBar(bar, chordChanged),
        maxBassNotes + (chordChanged ? 1 : 0)
      );
      changes.forEach((c, i) => {
        const nextStep = i + 1 < changes.length ? changes[i + 1].step : 16 + (changes[0]?.step ?? 0);
        const dur = Math.max(0.09, ((nextStep - c.step) / 4) * beat);
        const midi = P.bassNote(chord, c);
        const near = lastBassMidi != null && Math.abs(midi - lastBassMidi) <= 12;
        push(
          'sub',
          at(bar, c.step),
          {
            midi,
            dur,
            vel: (c.step === 0 ? 0.95 : 0.88) * P.bassLowTrim(midi),
            // Legato: the line is one instrument, so every change inside it
            // slides rather than restarting.
            slideFrom: near && midi !== lastBassMidi ? lastBassMidi : undefined,
          },
          { bar, step: c.step, layer: 'bass', note: noteName(midi) }
        );
        lastBassMidi = midi;
      });
    }

    // --- the rhythmic / melodic layer -----------------------------------
    if (layers.keys && keysSection && stabTimbre === 'piano') {
      if (pianoRole === 'arp') {
        // (a) The minimal arpeggio: chord tones with the ninth, one at a time,
        // and — this is most of what makes it deep house — not every bar.
        const opens = bar % 8 === 0 || new Rng(`${seed}::arpbar:${bar}`).chance(PI.arpBarChance);
        if (opens) {
          const contour = new Rng(`${seed}::arpphrase:${Math.floor(bar / 8)}`).pick(P.ARP_CONTOURS);
          const pool = P.pianoPool(chord, progression, PI.low, PI.high);
          const figure = P.pianoArp(new Rng(`${seed}::arp:${bar}`), pool, {
            maxNotes: Math.min(4, maxStabs + 1),
            contour,
          });
          for (const n of figure) {
            push(
              'piano',
              at(bar, n.step),
              { midi: n.midi, dur: beat * 1.5, vel: n.vel, hall: pianoHall, delay: pianoDelay },
              { bar, step: n.step, layer: 'keys', note: noteName(n.midi) }
            );
          }
        }
      } else if (melody) {
        // (b) The simple melody: it enters after a section's first phrase, and
        // in a breakdown it either plays alone or rests — a melody and a pad
        // both filling a breakdown is two things saying the same thing.
        const inSection = bar - section.startBar;
        const play = section.kind === 'breakdown' ? !padSection : inSection >= 8;
        if (play) {
          const phrase = bar % 8 >= 4 ? melodyVaried : melody;
          const inPhrase = bar % melodyBars;
          for (const n of phrase) {
            if (n.bar !== inPhrase) continue;
            // A strong position belongs to the chord.
            const midi = n.strong ? P.snapToChord(n.midi, chord) : n.midi;
            push(
              'piano',
              at(bar, n.step),
              { midi, dur: beat, vel: n.vel, hall: pianoHall, delay: pianoDelay },
              { bar, step: n.step, layer: 'keys', note: noteName(midi) }
            );
          }
        }
      }
    } else if (layers.keys && keysSection) {
      for (const s of stabsForBar(bar).slice(0, maxStabs)) {
        if (!r.chance(PARAMS.groove.stabChance + 0.3)) continue;
        const voicing = s.top ? chord.voicing.slice(-3) : chord.voicing;
        const dur = Math.max(0.12, (shape.stabLen ?? s.len) * 0.25 * beat);
        voicing.forEach((midi, i) => {
          push(
            'keys',
            at(bar, s.step) + i * s.spread,
            {
              midi,
              dur,
              vel: s.vel * (1 - i * 0.05),
              preset: stabTimbre,
              tremolo,
              delay: 0.28 * fx.delay,
              reverb: stabWet,
            },
            { bar, step: s.step, layer: 'keys', note: noteName(midi) }
          );
        });
      }
    }

    // --- pad ------------------------------------------------------------
    if (layers.pad && padSection && chordChanged) {
      const dur = chord.bars * barSeconds;
      const notes = chord.voicing.map((m) => foldTo(m, PARAMS.register.padLow, PARAMS.register.padHigh));
      // A bottom octave when the voicing has floated up out of the register.
      // MEASURED: the references carry -9.5 dB in 120-250 Hz and a chord
      // sitting entirely above middle C leaves that band to the kick alone,
      // which is what makes a mix sound like a bass and a treble with a hole
      // between them.
      const lowest = Math.min(...notes);
      if (lowest > PARAMS.register.padOctaveBelow) notes.unshift(lowest - 12);
      notes.forEach((midi, i) => {
        push(
          'pad',
          barStart,
          {
            midi,
            dur,
            vel: 0.75 - i * 0.04,
            timbre: padTimbre,
            // MEASURED: only the rare "swell" family really swells. Everything
            // else attacks in a few tens of milliseconds and holds.
            attack: padTimbre === 'swell' ? Math.min(SG.swellAttack + i * 0.09, dur * 0.45) : undefined,
            release: Math.min(1.6, dur * 0.8),
            spread: padSpread,
            reverb: padWet,
            delay: padDelay,
          },
          { bar, step: 0, layer: 'pad', note: noteName(midi) }
        );
      });
    }

    lastChordKey = chordKey;
  }

  // --- section FX --------------------------------------------------------
  let lastFxBar = -999;
  const fxAllowed = (bar) => {
    if (bar - lastFxBar < fxEveryBars) return false;
    lastFxBar = bar;
    return true;
  };
  for (const s of arrangement.sections) {
    const startT = s.startBar * barSeconds;
    const endT = (s.startBar + s.bars) * barSeconds;
    const r = new Rng(`${seed}::fxsec:${s.index}`);
    if (s.impactFirst && fx.impact && s.startBar > 0 && fxAllowed(s.startBar)) {
      push('impact', startT, { gain: 0.65 }, { bar: s.startBar, layer: 'fx' });
      // The swell is an *anticipatory* effect: `t` is when it arrives, on this
      // downbeat, and `dur` is how long before that it has to start making a
      // sound. Both are in the event; which of the two the scheduler fires on
      // is the scheduler's business (`leadOf` in scheduler.js), so the plan
      // keeps one time per event and the locked order does not move.
      push('swell', startT, { dur: 1.8, gain: 0.35 }, { bar: s.startBar, layer: 'fx' });
    }
    if (s.sweepFirst && fx.sweep && s.startBar > 0 && fxAllowed(s.startBar)) {
      push('sweepDown', startT, { dur: barSeconds * 2, gain: 0.45 }, { bar: s.startBar, layer: 'fx' });
    }
    if (
      s.riserLast &&
      fx.riser &&
      s.bars > s.riserLast + 2 &&
      r.chance(PARAMS.arrangement.riserChance) &&
      fxAllowed(s.startBar + s.bars - s.riserLast)
    ) {
      const dur = s.riserLast * barSeconds;
      push('riser', endT - dur, { dur, gain: 0.5 }, { bar: s.startBar + s.bars - s.riserLast, layer: 'fx' });
    }
  }

  events.sort((a, b) => a.t - b.t);

  // MEASURED: a breakdown lifts the pad and midrange by about 1.4 dB.
  const lift = Math.pow(10, PARAMS.master.breakdownLiftDb / 20);
  const melodicGain = [{ t: 0, value: 1 }];
  for (const s of arrangement.sections) {
    if (!s.lift) continue;
    const a = s.startBar * barSeconds;
    const b = (s.startBar + s.bars) * barSeconds;
    melodicGain.push({ t: Math.max(0.01, a - 0.4), value: 1 });
    melodicGain.push({ t: a + 0.4, value: lift });
    melodicGain.push({ t: b - 0.6, value: lift });
    melodicGain.push({ t: b, value: 1 });
  }

  // How far the macro filter is allowed to travel is a preset choice: one
  // benchmark minute moves its high band 25 dB across the minute, the other
  // moves it 2 dB and holds everything still.
  const sweep = shape.sweep ?? 1;
  const open = PARAMS.master.filterOpen;
  const automation = {
    macroFilter: filterCurve(arrangement).map((p) => ({
      t: Math.max(0, p.bar * barSeconds),
      value: open * Math.pow(p.value / open, sweep),
    })),
    melodicGain,
    // The push: 0 through a groove, up for the last bars of a build and the
    // first bars of a drop, and away again.
    push: pushCurve(arrangement, PARAMS.push).map((p) => ({
      t: Math.max(0, p.bar * barSeconds),
      value: p.value,
    })),
  };

  const track = {
    seed,
    minutes,
    bpm,
    beat,
    barSeconds,
    swing,
    bars,
    duration: bars * barSeconds + TAIL_SECONDS,
    kickPresent: kickBars / bars,
    key: {
      root: rootPc,
      name: noteName(chordRoot).replace(/-?\d+$/, '') + ' ' + scaleName,
      scaleName,
      scale,
    },
    // Every die, written down, so a listener can see why two seeds differ.
    preset: pre.id,
    presetLabel: pre.label,
    density,
    // The preset's own params, plus the one hat decision this theme's room and
    // character add to them. It is folded in here rather than in the preset so
    // it reaches every preset, and it is in `paramOverrides` rather than in the
    // plan so the golden snapshot never sees it: the hats play exactly where
    // they always played.
    paramOverrides: mergeParams(pre.params || {}, { hats: hatEnergy(pre.params, density) }),
    dice: {
      preset: pre.id,
      density,
      tempoFamily: slow ? 'upper' : 'lower',
      key: noteName(chordRoot).replace(/-?\d+$/, '') + ' ' + scaleName,
      voicingStyle,
      // A readout of the density roll for the ring, in the `{ value, label }`
      // shape: the value is what was rolled, the label is what a listener
      // would call it. Not a new die — the roll already existed.
      densityDie: { value: density, label: DENSITY_LABEL[density] || density },
      leadTimbre,
      padTimbre,
      stabTimbre,
      pianoRole: stabTimbre === 'piano' ? pianoRole : null,
      // The ring's timbre glyph reads this; it is the instrument playing the
      // figure, which is the one a listener names.
      keysPreset: stabTimbre,
      fxPalette: fx.name,
      bassMask: bassTemplate.m,
      stabMask: stabTemplate.m,
      hatMask: hatTemplate.m,
      loopBars: progression.loopBars,
      progression: progression.chords.map((c) => c.roman).join('-'),
    },
    // Not part of the plan: how wet this theme's harmonic layer is, is a
    // mixing decision, so it lives here as a readout rather than in `dice`.
    // The interface draws it; the golden file does not see it.
    sound: {
      wetness: (() => {
        const send = leadSustained ? padWet : stabTimbre === 'piano' ? pianoHall : stabWet;
        const db = 20 * Math.log10(Math.max(1e-4, send));
        const word = db < -14 ? 'dry' : db < -8 ? 'damp' : db < -3.5 ? 'wet' : 'drowned';
        return { value: word, label: `${word} ${db >= 0 ? '+' : ''}${db.toFixed(1)} dB` };
      })(),
    },
    progression,
    arrangement,
    timeline,
    events,
    automation,
  };

  // The table as it was before this plan was made.
  applyParams(found);
  return track;
}

export default generate;
