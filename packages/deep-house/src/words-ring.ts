// **The ring's readings in the language spoken** (round japanese). The ring's words are composed, not typed: a cell's
// big word is a band of the table (`bird-labels.json`, a technique's `labels`), its subtitle the dice's own words
// joined by ` · `, and its sentence a template filled from the theme (`{keys}`, `{sections}`, `{with}`). So the
// table for them is keyed by the English the composer writes, the template before it is filled and the word as the
// dice say it, and the language's column beside it (`words-ring.json`): `lines` are the templates (their `{fills}`
// kept), `words` the vocabulary a cell or a fill says (a band, a timbre, a room, a section), lower case, and a word
// with a count is keyed with `{n}` in its place (`{n} hits`). English never reads the table: it is the composer's own
// words, unmoved. What stays as written in every language: chord and key names (FM9, C DOR), the progression's
// numerals (I-IV), the tempo and every number, and the controls' names (Ember, Tide, …), which are proper names.
// `tools/check-words.ts` holds that every template and every word the tables and the harvest can print has a column.

import RING from './words-ring.json' with { type: 'json' };
import { lang, englishNames, type Lang } from './words.ts';

type Column = Partial<Record<Lang, string>>;
const TABLE = RING as unknown as { lines: Record<string, Column>; words: Record<string, Column>; genres: Record<string, Column> };

/** Whether the ring speaks the composer's own English (nothing to look up). */
export const ringEnglish = (): boolean => lang() === 'en';

/** A line's template in the language spoken (the English where the column has none). */
export function ringLine(template: string, l: Lang = lang()): string {
  if (l === 'en' || !template) return template;
  return TABLE.lines[template]?.[l] ?? template;
}

/** What `ringWord` could not find this session, for the check and the console. */
export const ringMissed = new Set<string>();

// a key, its mode said short: `C dor`, `Db min`, `A lyd` (stays as written)
const KEY = /^[A-G][b#]?( (min|maj|major|minor|dor|dorian|mix|mixolydian|lyd|lydian|phr|phrygian|loc|aeolian|ionian))?$/i;
// a progression in numerals: `i-VI-III-VII` (stays)
const NUMERALS = /^[ivIV]+(-[ivIV]+)*$/;
// a number, a tempo, a time in seconds or decibels: stays
const NUMBER = /^-?\d+(\.\d+)?( ?(s|db|dB|bpm|%))?$/;

/**
 * One word of a cell or a fill, in the language spoken: the table's, a counted word's, or as written. `ctx` names where
 * the word stands, most particular first (`conversation.root`, `root`): one English word read in two cells (the bass's
 * `full`, the bowls' `full`) is keyed `full|conversation.root` beside its plain `full` (the native reviews, 11-03).
 */
export function ringWord(token: string, l: Lang = lang(), ctx: readonly string[] = []): string {
  const s = String(token ?? '');
  if (l === 'en' || !s.trim()) return s;
  const k = s.trim().toLowerCase();
  for (const c of ctx) { const at = TABLE.words[`${k}|${c}`]?.[l]; if (at !== undefined) return at; }
  const hit = TABLE.words[k]?.[l];
  if (hit !== undefined) return hit;
  if (KEY.test(s.trim()) || NUMERALS.test(s.trim()) || NUMBER.test(s.trim())) return s;
  // a count and its word: `6 sections`, `2 hits`, `1 open`
  const m = /^(\d+(?:\.\d+)?) (.+)$/.exec(k);
  if (m) {
    const c = TABLE.words[`{n} ${m[2]}`]?.[l];
    if (c !== undefined) return c.replace('{n}', m[1]);
  }
  ringMissed.add(k);
  return s;
}

/** A line of words joined by ` · ` (a cell's subtitle), each said in the language spoken. */
export function ringWords(line: string, l: Lang = lang(), ctx: readonly string[] = []): string {
  if (l === 'en' || !line) return line;
  // `sparse · 2 hits · 1 open` on a cell, `2 hits, 1 open` in a sentence: each word alone, the joints as the language has them
  const whole = TABLE.words[String(line).trim().toLowerCase()]?.[l];
  if (whole !== undefined) return whole;
  return String(line).split(/( · |, )/).map((x, i) => (i % 2 ? (x === ', ' ? ringLine(', ', l) : x) : ringWord(x, l, ctx))).join('');
}

/** A cell's three lines in the language spoken. */
export function ringCell<T extends { word: string | number | null | undefined; sub: string; sub2?: string }>(v: T, l: Lang = lang(), ctx: readonly string[] = []): T {
  if (l === 'en') return v;
  const out = { ...v, word: typeof v.word === 'number' ? v.word : ringWords(String(v.word ?? ''), l, ctx), sub: ringWords(v.sub, l, ctx) };
  if (v.sub2 != null) out.sub2 = ringWords(v.sub2, l, ctx);
  return out;
}

/** The section under the needle (`main groove`, `drop · rolling snare`): each part in the language spoken. */
export const ringSection = (s: string, l: Lang = lang()): string => ringWords(s, l);

/**
 * **A sentence's fills, in the language spoken**: each value said as a word of the table (a timbre's phrase, a room,
 * a count), `key` and `bpm` as written; `chords` the line's own template round the chord names.
 */
export function ringFills(words: Record<string, string>, l: Lang = lang()): Record<string, string> {
  if (l === 'en') return words;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(words)) {
    // the key as a key is written (`Db minor`): the sentence's English lower-cases it
    if (k === 'key') out[k] = v.replace(/^[a-g]/, (c) => c.toUpperCase());
    else if (k === 'bpm' || k === 'on' || k === 'period' || k === 'riff' || k === 'pedal' || k === 'callerVoice' || k === 'bloomVoice') out[k] = v;
    else if (k === 'chords') {
      // ` over Am and F` → the line's own words round the chords as written
      const ch = v.replace(/^ over /, '').split(' and ').filter(Boolean);
      out[k] = ch.length ? ringLine(' over {chords}', l).replace('{chords}', ch.join(ringLine(' and ', l))) : '';
    } else out[k] = ringWords(v, l);
  }
  return out;
}

/** Two sentences joined as the language joins them: `first; locked.` in English. */
export function ringJoin(first: string, locked: string, l: Lang = lang()): string {
  if (l === 'en') return locked ? `${first.replace(/\.$/, '')}; ${locked}.` : first;
  const stop = ringLine('.', l);
  const f = first.replace(/[.。]$/, '');
  return locked ? `${f}${stop}${locked.replace(/[.。]$/, '')}${stop}` : `${f}${stop}`;
}

/**
 * **A genre's name in the language spoken** (his word 11-03: genres in katakana, as Japanese streaming apps write them):
 * the table's `genres`, keyed by the genre table's own label; a genre the table lacks keeps its label. English reads
 * the label too, unless the table gives an `en` of its own: a name shown other than the label (his word 11-05, "Liquid"
 * said "Liquid DnB" on the Map), while the label stays the key every id, link, dot and check reads.
 */
export function genreName(label: string, l: Lang = lang()): string {
  if (!label) return label;
  return TABLE.genres[label]?.[l] ?? (l === 'en' ? label : genreName(label, 'en'));
}
/** Where a genre is explained (a tip): the language's name, and the English beside it where the language says so. */
export function genreBoth(label: string, l: Lang = lang()): string {
  const own = genreName(label, l), en = genreName(label, 'en');
  return own === en || !englishNames(l) ? own : `${own} · ${en}`;
}
