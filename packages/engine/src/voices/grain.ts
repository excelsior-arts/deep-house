// **The grain from the voices themselves** (round SPARK-1): the 2-8 kHz
// presence a harmonic voice carries at its own register, made by the voice and
// never by moving it up an octave. Four parts, each optional in the settings
// and absent from every table, so a theme no place writes them for resolves to
// the settings it always had and plays the graph it always played:
//
//   keys.edge         the keyboard's attack let through its own lowpass: the
//                     note's own oscillators (the electric piano's tine, the
//                     pluck's saw) high-passed at `hz` and summed in after the
//                     lowpass at `level`, falling over `decay` to `hold` of
//                     itself — the amp's speaker opened to the grain and not a
//                     brighter note — and a `chiff`, a few milliseconds of
//                     band-passed noise at `chiffHz` on the strike.
//   strings.breath    a breath of filtered noise under the ensemble, `loHz` to
//                     `hiHz`, at `level` against the saws, through the same
//                     chorus and the same envelope as the chord: air, not hiss.
//   piano.grain       the hammer's noise times `hammer` and the second and
//                     third partials' body lifted by `body` (to at most one).
//   malletStrike      (round HF-NOISE) a click on the strike of a bar the
//                     edge does not read: noise half an octave either side of
//                     `hz` at `level`, gone `decay` after the strike.
//   harmonicEdge      a parallel stage on the harmonic bus (`effects/
//                     harmonic-edge.ts`): the bus's own notes driven, their
//                     harmonics kept between `floorHz` and `toneHz`, at a
//                     `blend` against the bus. The returns never pass it.
//
// Every field is a number with a range the topology can compute, checked once
// where a settings value is resolved (`admitGrain`, `settings.ts`), as a sound
// row's block is: a place may write a grain, and may not write one into a NaN.

/** The keyboard's edge and strike (`keys.edge`). */
export interface KeysEdge {
  /** the high-passed copy's level at the strike, against the note: 0 is none */
  level: number;
  /** the copy's corner, two high-passes (24 dB an octave) */
  hz: number;
  /** seconds from the strike to `hold` of the level */
  decay: number;
  /** a factor on the tine's index (the electric piano's 1:14 modulator): its clang is the edge's material */
  tine: number;
  /** the fraction of the level the copy keeps once the strike has gone */
  hold: number;
  /** the strike's noise, against the note: 0 is none */
  chiff: number;
  /** the strike's band-pass centre */
  chiffHz: number;
  /** seconds the strike takes to fall away */
  chiffDecay: number;
}

/** The breath under the ensemble (`strings.breath`). */
export interface StringsBreath {
  /** the noise against the saws: 0 is none */
  level: number;
  /** the band's floor and top, a high-pass and a low-pass */
  loHz: number;
  hiHz: number;
}

/** The piano's hammer and body (`piano.grain`). */
export interface PianoGrain {
  /** a multiplier on the hammer's level, the room's or the note's own */
  hammer: number;
  /** added to the note's `harmonicBody` (0 is none, the sum held to one) */
  body: number;
}

/**
 * **The struck bar's top** (`malletStrike`, round HF-NOISE): a click of
 * band-passed noise on the strike of a bar the bus's edge does not read (its
 * row's `edge: false`), standing in for the presence the edge gave it and
 * ending with the strike, so nothing high rides the ring. Two high-passes and
 * two low-passes half an octave either side of `hz`; up in half a millisecond,
 * sixty decibels down at `decay`.
 */
export interface MalletStrike {
  /** the click against the note's peak: 0 is none */
  level: number;
  /** the band's centre: half an octave under it to half an octave over */
  hz: number;
  /** seconds from the strike to sixty decibels under it */
  decay: number;
}

/** The parallel stage on the harmonic bus (`harmonicEdge`). */
export interface HarmonicEdge {
  /** the driven copy's level against the bus: 0 is none, 1 an edge as loud as the bus */
  blend: number;
  /** 0 to 1 over the effect's decibels into the curve */
  drive: number;
  /** the high-pass before the clip: the bed's body kept out of it */
  preHz: number;
  /** the two high-passes after it: under this the copy carries nothing */
  floorHz: number;
  /** the two low-passes after that: over this the copy is fizz */
  toneHz: number;
}

type Ranges<T> = { readonly [K in keyof T]: readonly [number, number] };

/** What each field may be, as a closed range: what the topology computes, not taste. */
export const KEYS_EDGE_FIELDS: Ranges<KeysEdge> = Object.freeze({
  level: [0, 1], hz: [800, 12000], decay: [0.005, 2], tine: [0.25, 8], hold: [0, 1],
  chiff: [0, 1], chiffHz: [1000, 12000], chiffDecay: [0.002, 0.1],
});
export const STRINGS_BREATH_FIELDS: Ranges<StringsBreath> = Object.freeze({
  level: [0, 0.5], loHz: [500, 12000], hiHz: [1000, 20000],
});
export const PIANO_GRAIN_FIELDS: Ranges<PianoGrain> = Object.freeze({
  hammer: [0, 4], body: [0, 1],
});
export const MALLET_STRIKE_FIELDS: Ranges<MalletStrike> = Object.freeze({
  level: [0, 1], hz: [1000, 10000], decay: [0.005, 0.2],
});
export const HARMONIC_EDGE_FIELDS: Ranges<HarmonicEdge> = Object.freeze({
  blend: [0, 1], drive: [0, 1], preHz: [40, 2000], floorHz: [400, 8000], toneHz: [1000, 16000],
});

/**
 * **The edge at nought** (DESK-EDGE): what the harmonic bus's edge is built
 * from while the desk is up in a place whose row writes none (the drones, the
 * floating pulse, the fast broken beat), so a hand can bring it in on the
 * chord that is sounding. The corners and the drive are the ones the place
 * table writes where it writes an edge at all (the grain row's `bus`); the
 * blend is nought, and a blend of nought into the bus's sum is the bus to the
 * sample. Away from the desk nothing reads it.
 */
export const HARMONIC_EDGE_AT_NOUGHT: Readonly<HarmonicEdge> = Object.freeze({
  blend: 0, drive: 0.6, preHz: 250, floorHz: 1800, toneHz: 5000,
});

function prove<T extends object>(v: unknown, fields: Ranges<T>, where: string, bad: string[]): void {
  if (v === undefined) return;
  if (!v || typeof v !== 'object' || Array.isArray(v)) { bad.push(`${where} is not a table`); return; }
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!(k in fields)) bad.push(`${where}.${k} is not a field`);
  for (const [k, [lo, hi]] of Object.entries(fields) as Array<[string, readonly [number, number]]>) {
    const n = o[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < lo || n > hi) bad.push(`${where}.${k} is ${String(n)}, not in ${lo}..${hi}`);
  }
}

/**
 * Every grain a settings value carries, held to its fields: each part whole
 * (all of its fields, none other), each number in its range, and a band whose
 * floor is under its top. Throws with every fault at once.
 */
export function admitGrain(settings: Readonly<Record<string, any>>): void {
  const bad: string[] = [];
  prove(settings.keys?.edge, KEYS_EDGE_FIELDS, 'keys.edge', bad);
  prove(settings.strings?.breath, STRINGS_BREATH_FIELDS, 'strings.breath', bad);
  prove(settings.piano?.grain, PIANO_GRAIN_FIELDS, 'piano.grain', bad);
  prove(settings.harmonicEdge, HARMONIC_EDGE_FIELDS, 'harmonicEdge', bad);
  prove(settings.malletStrike, MALLET_STRIKE_FIELDS, 'malletStrike', bad);
  const b = settings.strings?.breath;
  if (b && b.loHz >= b.hiHz) bad.push(`strings.breath's floor ${b.loHz} is not under its top ${b.hiHz}`);
  const e = settings.harmonicEdge;
  if (e && e.floorHz >= e.toneHz) bad.push(`harmonicEdge's floor ${e.floorHz} is not under its tone ${e.toneHz}`);
  if (bad.length) throw new Error(`a grain is not a sound: ${bad.join('; ')}`);
}
