// What a topology's parameters may be, as a value the engine checks and a type
// the compiler reads (E04 of the outside review of 10-03).
//
// Until that review a topology stated its parameters as a list of names, and
// admission (`soundFaults`) held every one of them to the same generic shape —
// a finite number, a switch, a word, or a table of numbers — whatever the
// topology did with it. So a reese whose clip had a hardness of nought passed,
// and its waveshaper curve was 2048 samples of NaN: `tanh(k x) / tanh(k)` at
// k = 0. And `patchOf<P>` handed the voice a type it had asserted, never
// proved.
//
// Now a topology states a **contract**: each parameter's field — a number in a
// range (open where nought would divide or a log would fall), a whole count
// with a bound (a buffer, a bank of oscillators), one of a set of words, a
// list of a stated length, a table of stated fields — and the relations
// between them that no one field can say (an envelope's times in order, a word
// that names a key of a table beside it). The TypeScript shape of the patch is
// derived from the same value (`PatchOf`), so the type the voice reads and the
// numbers admission checked are one statement. `contractFaults` is asked once,
// where a row is admitted (`soundFaults`) and where a settings value is
// resolved (`settings.ts`, for the blocks a room may voice); `patchOf` in
// `sound.ts` hands a voice its numbers only once they have passed it.
//
// The ranges are **physical and computational**, not taste: wide enough for
// any sound the topology can make, narrow enough that nothing it computes is
// not a number, no buffer is unbounded and no bank of oscillators has no
// ceiling. A narrower range a style wants is the style's (its knobs, its
// candidate lists), not the engine's.

/**
 * What a number is in, where a word for it exists: how the desk prints it
 * beside its value (PLAN-DESK D0). A field with none is a bare number — a
 * drive, a velocity sensitivity, a count of partials — and is printed bare.
 * The shared words below carry theirs, so the six hundred fields that use them
 * say what they are in without a word written per field; a field declared
 * with a bare `num()` says it with `unitOf`'s suffix rule or not at all.
 */
export const FIELD_UNITS = ['hz', 'seconds', 'ms', 'db', 'cents', 'level', 'ratio', 'x', 'count'] as const;
export type FieldUnit = typeof FIELD_UNITS[number];

/** A number between two bounds, inclusive; `above` instead of `min` excludes the bound (nought, where nought divides). */
export interface NumField {
  kind: 'num';
  min: number;
  max: number;
  /** the lower bound is excluded: the value must be greater than `min` */
  open?: true;
  /** a whole number */
  int?: true;
  /** what it is in, where the shared word says; absent on a bare number */
  unit?: FieldUnit;
}
export interface BoolField { kind: 'bool' }
/** A name: a word the patch defines itself, such as the key of a table beside it (a relation says which). */
export interface NameField { kind: 'name' }
export interface WordField<W extends string = string> { kind: 'word'; of: readonly W[] }
export interface MaybeField<F extends Field = Field> { kind: 'maybe'; of: F }
export interface EitherField<A extends Field = Field, B extends Field = Field> { kind: 'either'; a: A; b: B }
export interface ListField<F extends Field = Field> { kind: 'list'; of: F; min: number; max: number }
export interface TableField<T extends Fields = Fields> { kind: 'table'; fields: T }
export interface MapField<F extends Field = Field> { kind: 'map'; of: F; min: number; max: number }

export type Field = NumField | BoolField | NameField | WordField | MaybeField | EitherField | ListField | TableField | MapField;
/** A table's fields, by name. */
export type Fields = { readonly [name: string]: Field };

/** The value a field admits, as a type. */
export type Infer<F> =
  F extends NumField ? number
  : F extends BoolField ? boolean
  : F extends NameField ? string
  : F extends WordField<infer W> ? W
  : F extends MaybeField<infer G> ? Infer<G> | null
  : F extends EitherField<infer A, infer B> ? Infer<A> | Infer<B>
  : F extends ListField<infer G> ? Infer<G>[]
  : F extends TableField<infer T> ? { readonly [K in keyof T]: Infer<T[K]> }
  : F extends MapField<infer G> ? { readonly [key: string]: Infer<G> }
  : never;

/** The patch a contract's fields describe: what a voice of the topology reads. */
export type PatchOf<S extends Fields> = { readonly [K in keyof S]: Infer<S[K]> };

/**
 * A topology's parameters: the fields, exactly (a row may carry no other and
 * lack none), and the relations between them, as sentences where they fail.
 */
export interface Contract<S extends Fields = Fields> {
  readonly fields: S;
  relations?(patch: PatchOf<S>): string[];
}

/** A contract, typed off its own fields. */
export function contract<const S extends Fields>(fields: S, relations?: (patch: PatchOf<S>) => string[]): Contract<S> {
  return relations ? { fields, relations } : { fields };
}

// --- the fields --------------------------------------------------------------

/** A number in [min, max]. */
export const num = (min: number, max: number): NumField => ({ kind: 'num', min, max });
/** A number in (0, max]: nought divides, or is a ramp's end, or is no time at all. */
export const pos = (max: number): NumField => ({ kind: 'num', min: 0, max, open: true });
/** A whole number in [min, max]. */
export const int = (min: number, max: number): NumField => ({ kind: 'num', min, max, int: true });
export const bool = (): BoolField => ({ kind: 'bool' });
/** A name the patch defines: a word of letters and digits. */
export const name = (): NameField => ({ kind: 'name' });
/** One of these words. */
export const word = <const W extends string>(...of: W[]): WordField<W> => ({ kind: 'word', of });
/** The field, or `null`: a part of the topology this row does not build. */
export const maybe = <F extends Field>(of: F): MaybeField<F> => ({ kind: 'maybe', of });
/** Either of two fields: a number, or the word naming the room's field that holds it. */
export const either = <A extends Field, B extends Field>(a: A, b: B): EitherField<A, B> => ({ kind: 'either', a, b });
/** A list of `min` to `max` (by default exactly `min`) of the field. */
export const list = <F extends Field>(of: F, min: number, max = min): ListField<F> => ({ kind: 'list', of, min, max });
/** A table with exactly these fields. */
export const table = <const T extends Fields>(fields: T): TableField<T> => ({ kind: 'table', fields });
/** A table of `min` to `max` named entries, each the field. */
export const map = <F extends Field>(of: F, min = 1, max = 32): MapField<F> => ({ kind: 'map', of, min, max });

/** The field, in a unit: what the desk prints its value in. */
export const inUnit = (f: NumField, unit: FieldUnit): NumField => ({ ...f, unit });

/**
 * What a parameter is in, for the desk: the field's own word, else the one
 * its name ends in (`cutoffHz`, `resonanceDb`, `holdMs`, `spreadCents`), else
 * nothing — a bare number, printed bare.
 */
export function unitOf(name: string, f: Field): FieldUnit | '' {
  let g: Field = f;
  while (g.kind === 'maybe') g = g.of;
  if (g.kind !== 'num') return '';
  if (g.unit) return g.unit;
  const leaf = name.slice(name.lastIndexOf('.') + 1);
  if (/Hz$/.test(leaf)) return 'hz';
  if (/Db$/.test(leaf)) return 'db';
  if (/Ms$/.test(leaf)) return 'ms';
  if (/Cents$/.test(leaf)) return 'cents';
  if (/Seconds$/.test(leaf) || /^(attack|decay|release)$/.test(leaf)) return 'seconds';
  return '';
}

// The words the topologies share, so a hertz is a hertz everywhere — and each
// carries the unit the desk prints it in.

/** An audible frequency, or a corner: above nought (an exponential ramp's end, a ratio's denominator), at most 24 kHz. */
export const HZ = inUnit(pos(24000), 'hz');
/** A slow movement — a drift, a tremolo, a pulse width's breathing: nought (still) to 40 Hz. */
export const LFO_HZ = inUnit(num(0, 40), 'hz');
/** A length of time that must pass: above nought, at most a minute. */
export const SECONDS = inUnit(pos(60), 'seconds');
/** A length of time that may be none: a glide, a delay before a vibrato. */
export const WAIT = inUnit(num(0, 60), 'seconds');
/** A level, a trim, a mix amount: nought to sixteen in gain. */
export const LEVEL = inUnit(num(0, 16), 'level');
/** A share of something: nought to one. */
export const UNIT = inUnit(num(0, 1), 'ratio');
/** Where it stands: hard left to hard right. */
export const PAN = num(-1, 1);
/** A detune or a spread in cents, either way, at most an octave. */
export const CENTS = inUnit(num(-1200, 1200), 'cents');
/** A bandpass's, a peak's or a notch's quality: above nought (the bandwidth divides by it), at most a hundred. */
export const Q = pos(100);
/** Decibels, either way. */
export const DB = inUnit(num(-96, 48), 'db');
/** A multiple of a frequency or a time: above nought, at most sixty-four. */
export const RATIO = inUnit(pos(64), 'x');
/** A send to a return: nought to two. */
export const SEND = inUnit(num(0, 2), 'level');
/** A per-hit spread, as a fraction: nought to one. */
export const SPREAD = inUnit(num(0, 1), 'ratio');
/** How many tones are rendered of one articulation: one to eight. */
export const VARIANTS = inUnit(int(1, 8), 'count');
/** How long a rendered body is, in seconds: above nought, at most eight (the buffer it allocates). */
export const BODY_SECONDS = inUnit(pos(8), 'seconds');
/** A shaper's oversampling, as Web Audio spells it. */
export const OVERSAMPLE = word('none', '2x', '4x');

// --- the check ---------------------------------------------------------------

const isTable = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Everything wrong with `v` as a value of `f`, as sentences naming `at`. */
export function fieldFaults(v: unknown, f: Field, at: string): string[] {
  switch (f.kind) {
    case 'num': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return [`${at} is ${JSON.stringify(v)}, not a finite number`];
      if (f.int && !Number.isInteger(v)) return [`${at} is ${v}, not a whole number`];
      if (f.open ? !(v > f.min) : v < f.min) return [`${at} is ${v}, ${f.open ? 'not above' : 'under'} ${f.min}`];
      if (v > f.max) return [`${at} is ${v}, over ${f.max}`];
      return [];
    }
    case 'bool':
      return typeof v === 'boolean' ? [] : [`${at} is ${JSON.stringify(v)}, not a switch`];
    case 'name':
      return typeof v === 'string' && /^[a-z][A-Za-z0-9]*$/.test(v) ? [] : [`${at} is ${JSON.stringify(v)}, not a name`];
    case 'word':
      return typeof v === 'string' && f.of.includes(v) ? [] : [`${at} is ${JSON.stringify(v)}, not one of ${f.of.join(', ')}`];
    case 'maybe':
      return v === null ? [] : fieldFaults(v, f.of, at);
    case 'either': {
      const a = fieldFaults(v, f.a, at);
      if (!a.length) return [];
      const b = fieldFaults(v, f.b, at);
      return b.length ? [`${a[0]}; nor ${b[0].slice(at.length + 1)}`] : [];
    }
    case 'list': {
      if (!Array.isArray(v)) return [`${at} is ${JSON.stringify(v)}, not a list`];
      if (v.length < f.min || v.length > f.max)
        return [`${at} has ${v.length} entries, where ${f.min === f.max ? f.min : `${f.min} to ${f.max}`} ${f.max === 1 ? 'is' : 'are'} wanted`];
      return v.flatMap((x, i) => fieldFaults(x, f.of, `${at}[${i}]`));
    }
    case 'table': {
      if (!isTable(v)) return [`${at} is ${JSON.stringify(v)}, not a table`];
      return fieldsFaults(v, f.fields, at);
    }
    case 'map': {
      if (!isTable(v)) return [`${at} is ${JSON.stringify(v)}, not a table`];
      const keys = Object.keys(v);
      if (keys.length < f.min || keys.length > f.max) return [`${at} has ${keys.length} entries, where ${f.min} to ${f.max} are wanted`];
      return keys.flatMap((k) => fieldFaults(v[k], f.of, `${at}.${k}`));
    }
  }
}

/** Everything wrong with a table against exactly these fields: each present and each valid, and nothing else. */
export function fieldsFaults(v: Readonly<Record<string, unknown>>, fields: Fields, at = ''): string[] {
  const bad: string[] = [];
  const name = (k: string) => (at ? `${at}.${k}` : k);
  for (const [k, f] of Object.entries(fields)) {
    if (!(k in v)) { bad.push(`${name(k)} is missing`); continue; }
    bad.push(...fieldFaults(v[k], f, name(k)));
  }
  for (const k of Object.keys(v)) if (!(k in fields)) bad.push(`${name(k)} is not a field it has`);
  return bad;
}

/**
 * Everything wrong with a patch against a contract: its fields, then — only
 * where they are all sound, so a relation never reads a missing number — the
 * relations between them. `extra` lets a settings block carry fields of its
 * own beside the contract's (the `bass` block's bus half); a row may not.
 */
export function contractFaults(v: unknown, c: Contract, extra = false): string[] {
  if (!isTable(v)) return [`the parameters are ${JSON.stringify(v)}, not a table`];
  const fields = fieldsFaults(v, c.fields).filter((s) => !extra || !s.endsWith(' is not a field it has'));
  if (fields.length) return fields;
  return c.relations ? c.relations(v as never) : [];
}

/** `name`'s word is a key of the table `of` (a tone of a ratio table, a vowel of a formant table). */
export const names = (p: Readonly<Record<string, unknown>>, name: string, of: string): string[] =>
  (Object.prototype.hasOwnProperty.call(p[of] as object, p[name] as string) ? [] : [`${name} ${JSON.stringify(p[name])} is not one of ${of}: ${Object.keys(p[of] as object).join(', ')}`]);
