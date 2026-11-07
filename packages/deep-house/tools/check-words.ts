// The page's words in every language (round japanese): `src/words.ts`, `src/words-ring.json` and index.html's marks.
//
//   node tools/check-words.ts             the table, the page's marks and the ring's templates and words
//   node tools/check-words.ts --harvest   also plans themes across the places and fails on any word the ring prints
//                                         that has no column (slow: a minute)
//
// What it holds:
// - every meaning in `WORDS` has every language's column, none empty, each with the English's `{fills}` exactly;
// - every `data-w`, `data-w-label`, `data-w-title`, `data-w-alt` in index.html names a meaning, and the English the page
//   is written with is the table's English byte for byte, so the English page reads as it did before the table;
// - every template the ring's tables can say (`bird-labels.json`, `hook-labels.json`, the recipes' `labels`) has every
//   language's column in `words-ring.json` with its fills, and every word a cell or a fill says from the tables (a
//   band, a timbre, a room, an effects palette, a density, a figure) has one;
// - (`--harvest`) nothing the ring prints across the places, seeds and travel falls back to English.

import fs from 'node:fs';
import path from 'node:path';
import { WORDS, LANG_TAGS, LANGS } from '../src/words.ts';
import RING from '../src/words-ring.json' with { type: 'json' };
import LABELS from '../src/bird-labels.json' with { type: 'json' };
import HOOK from '../src/hook-labels.json' with { type: 'json' };

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(HERE, '..', 'src');
const RECIPES = path.join(HERE, '..', 'recipes');
const failures = [];
let checks = 0;
const check = (ok, what) => { checks++; if (!ok) failures.push(what); };
const fills = (s) => (String(s).match(/\{\w+\}/g) ?? []).sort().join(' ');
const others = LANG_TAGS.filter((l) => l !== 'en');

// --- the table --------------------------------------------------------------------------------------------------
check(LANGS[0].tag === 'en', 'English is the first language');
for (const [key, row] of Object.entries(WORDS)) {
  for (const l of LANG_TAGS) {
    check(typeof row[l] === 'string' && row[l].length > 0, `${key}: no ${l}`);
    if (row[l]) check(fills(row[l]) === fills(row.en), `${key}: ${l} fills ${fills(row[l]) || 'none'}, English ${fills(row.en) || 'none'}`);
  }
}

// --- the page's marks -------------------------------------------------------------------------------------------
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const unescape = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attrOf = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : null; };
let marks = 0;
for (const m of html.matchAll(/<([a-z0-9]+)\s[^>]*data-w[^>]*>/gi)) {
  const tag = m[0];
  for (const [mark, attr] of [['data-w-label', 'aria-label'], ['data-w-title', 'title'], ['data-w-alt', 'alt'], ['data-w-placeholder', 'placeholder']]) {
    const key = attrOf(tag, mark);
    if (key === null) continue;
    marks++;
    check(key in WORDS, `index.html: ${mark}="${key}" names no meaning`);
    if (key in WORDS) check(attrOf(tag, attr) === WORDS[key].en, `index.html: ${attr} of ${key} is not the table's English`);
  }
  const own = attrOf(tag, 'data-w-text');
  if (own !== null) {
    marks++;
    check(own in WORDS, `index.html: data-w-text="${own}" names no meaning`);
    // its own text node: the text after the element's first child closes, up to the next tag
    const rest = html.slice(m.index + tag.length);
    const t = /<\/svg>([^<]*)</.exec(rest);
    if (own in WORDS) check(!!t && unescape(t[1]) === WORDS[own].en, `index.html: the text of ${own} is not the table's English`);
  }
  const key = attrOf(tag, 'data-w');
  if (key === null) continue;
  marks++;
  check(key in WORDS, `index.html: data-w="${key}" names no meaning`);
  // the text up to the element's own closing tag (the marked elements hold text only)
  const after = html.slice(m.index + tag.length);
  const text = unescape(after.slice(0, after.indexOf('</')));
  if (key in WORDS) check(text === WORDS[key].en, `index.html: the text of ${key} is not the table's English ("${text.slice(0, 40)}")`);
}
// the ring's own tables keep the English the composer's checks read; the page says the table's (`w('means.…')`)
const RING_TS = fs.readFileSync(path.join(SRC, 'ring.ts'), 'utf8');
for (const m of RING_TS.matchAll(/\{ key: '([a-z]+)', name: '[A-Za-z]+', means: '([^']+)' \}/g))
  check(WORDS[`means.${m[1]}`]?.en === m[2], `ring.ts says ${m[1]} means "${m[2]}", the table "${WORDS[`means.${m[1]}`]?.en}"`);
for (const m of RING_TS.matchAll(/^  ([a-z]+): \{ short: '([a-z]+)', dash:/gm))
  check(WORDS[`section.short.${m[1]}`]?.en === m[2], `ring.ts shortens ${m[1]} to "${m[2]}", the table to "${WORDS[`section.short.${m[1]}`]?.en}"`);
check(marks >= 40, `index.html carries ${marks} marks; at least 40 are expected`);

// --- the Japanese face holds every character the Japanese columns say (tools/ja-font-cut.py cuts it to this list) ---
const CUT = new Set([...fs.readFileSync(path.join(HERE, 'ja-glyphs.txt'), 'utf8').trim()]);
const said = new Set();
for (const row of Object.values(WORDS)) for (const c of row.ja ?? '') said.add(c);
for (const sec of ['lines', 'words', 'genres']) for (const v of Object.values(RING[sec])) for (const c of v.ja ?? '') said.add(c);
const uncut = [...said].filter((c) => c.codePointAt(0) > 0x2000 && !(c.codePointAt(0) >= 0x2000 && c.codePointAt(0) <= 0x206f) && !CUT.has(c));
check(!uncut.length, `the Japanese face lacks ${uncut.join('')}: run tools/ja-font-cut.py`);

// --- the ring's templates and words -----------------------------------------------------------------------------
const lines = new Map();
const words = new Map();
const addLine = (s, where) => { if (s) lines.set(s, where); };
const addWord = (s, where) => {
  const k = String(s ?? '').trim().toLowerCase();
  if (!k || /^[a-g][b#]?( (min|maj|dor|mix|lyd|phr))?$/.test(k) || /^[iv]+(-[iv]+)*$/.test(k) || /^-?\d+(\.\d+)?( ?(s|db|bpm))?$/.test(k)) return;
  const m = /^(\d+(?:\.\d+)?) (.+)$/.exec(k);
  words.set(m ? `{n} ${m[2]}` : k, where);
};
const SKIP = new Set(['note', 'about', 'comment', 'why', 'reads', 'upTo', 'frame', 'numbers', 'walls', 'highFrom', 'lowTo', 'needs', 'cell', 'unit', 'control', 'derive', 'plan']);
function walk(o, where) {
  if (Array.isArray(o)) { o.forEach((v, i) => walk(v, [...where, String(i)])); return; }
  if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (!SKIP.has(k)) walk(v, [...where, k]); return; }
  if (typeof o !== 'string') return;
  const last = where[where.length - 1], up = where[where.length - 2];
  const at = where.slice(-4).join('.');
  if (['says', 'short', 'lockedSays', 'joiner'].includes(last) || up === 'on' || up === 'says' || up === 'short') addLine(o, at);
  else if (last === 'word') addWord(o, at);
  else if (last === 'sub') for (const part of o.split(' · ')) { if (!part.includes('{')) addWord(part, at); }
  else if (up === 'family') addWord(o, at);
}
walk(LABELS.birds, ['bird-labels']);
walk(HOOK.labels, ['hook-labels']);
for (const [id, phrase] of Object.entries(LABELS.timbres)) { addWord(phrase, `timbre ${id}`); addWord(LABELS.cellWords[id] ?? id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(), `timbre ${id}`); }
for (const [id, word] of Object.entries(LABELS.cellWords)) addWord(word, `timbre ${id}`);
function recipes(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { recipes(p); continue; }
    if (!f.endsWith('.json')) continue;
    const find = (o, where) => {
      if (Array.isArray(o)) o.forEach((v, i) => find(v, [...where, String(i)]));
      else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (k === 'labels' ? walk(v, [...where, 'labels']) : find(v, [...where, k]));
    };
    find(JSON.parse(fs.readFileSync(p, 'utf8')), [f]);
  }
}
recipes(RECIPES);
// a sub-section's name under the needle ("drop · half-bar fill"): every treatment's own
function treatments(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) treatments(p);
    else if (f.endsWith('.json')) { const d = JSON.parse(fs.readFileSync(p, 'utf8')); if (typeof d?.name === 'string') addWord(d.name, `treatment ${f}`); }
  }
}
treatments(path.join(RECIPES, 'treatments'));
// the dice's own words a cell or a fill says, and the joints a line is built with
for (const s of ['silent', 'nothing', 'none', 'no hand', 'no bell', 'no keys', 'no bass', 'no beat', 'sparse', 'offbeat', 'eighths', 'sixteenths', 'broken',
  'held', 'walking', 'pulsing', 'sub', 'growl', 'auto', 'open', 'dry', 'deep', 'tight', 'minimal', 'medium', 'busy', 'room', 'keys', 'density', 'fx', 'bpm',
  'sections', 'bars', 'wet', 'intro', 'build', 'main groove', 'breakdown', 'drop', 'outro', '{n} hit', '{n} hits', '{n} section', '{n} sections', '{n} move',
  '{n} moves', '{n} open', '{n} bar', '{n} bars', '{n} seconds', '{n} db']) addWord(s, 'the dice');
for (const s of [', ', ' and ', ' over {chords}', '.']) addLine(s, 'a joint');
for (const [s, where] of lines) for (const l of others) {
  const col = RING.lines[s]?.[l];
  check(typeof col === 'string', `words-ring.json: no ${l} for the line "${s}" (${where})`);
  if (typeof col === 'string') check(fills(col) === fills(s), `words-ring.json: the ${l} of "${s}" fills ${fills(col) || 'none'}`);
}
for (const [s, where] of words) for (const l of others) check(typeof RING.words[s]?.[l] === 'string' && RING.words[s][l].length > 0, `words-ring.json: no ${l} for the word "${s}" (${where})`);

// --- every genre the genre table names, in every language (the Map's stars and regions, a track's genre line) ---
const GENRES = JSON.parse(fs.readFileSync(path.join(SRC, 'genres', 'genres.json'), 'utf8'));
const labels = new Set();
const labelsOf = (o) => { if (Array.isArray(o)) o.forEach(labelsOf); else if (o && typeof o === 'object') { if (typeof o.label === 'string') labels.add(o.label); Object.values(o).forEach(labelsOf); } };
labelsOf(GENRES);
for (const g of labels) for (const l of others) check(typeof RING.genres?.[g]?.[l] === 'string' && RING.genres[g][l].length > 0, `words-ring.json: no ${l} for the genre "${g}"`);
check(labels.size > 60, `the genre table names ${labels.size} genres`);

// --- the ring as it prints, in each language (slow) -------------------------------------------------------------
if (process.argv.includes('--harvest')) {
  const { planTheme } = await import('../src/mix.ts');
  const { HOUSE, BIRDS } = await import('../src/spell.ts');
  const { cellSaid, shortOf, sentenceOf, hatsOfProgram, programFactsOf, keysOfProgram, heldOfProgram, airPlayOf } = await import('../src/bird-labels.ts');
  const { style } = await import('../src/styles/deep-house-v2.ts');
  const { places } = await import('../src/styles/deep-house-places.ts');
  const { speak } = await import('../src/words.ts');
  const { ringSection, ringMissed } = await import('../src/words-ring.ts');
  const at = [{}];
  for (const t of Object.values(places)) if (Array.isArray(t)) for (const e of t) if (e?.place?.birds) at.push(e.place.birds);
  const seen = new Set();
  let planned = 0;
  for (const l of others) {
    speak(l);
    for (const birds of at) {
      const centre = { ...HOUSE, ...birds };
      const key = JSON.stringify(centre);
      if (seen.has(`${l}${key}`)) continue;
      seen.add(`${l}${key}`);
      for (const b of BIRDS) for (const v of [0, 1, centre[b]]) {
        const spell = { ...centre, [b]: v };
        let t;
        try { t = planTheme(String(7 + (planned % 5)), planned % 3, { strategy: 'house-v2', spell }); } catch (e) { continue; }
        planned++;
        const T = { spell, bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: t.preset, dice: t.dice, bars: t.bars, plan: t.arrangement.sections,
          hats: hatsOfProgram(t.events, t.timeline), facts: programFactsOf(t.events, t.dice), keys: keysOfProgram(t.events, t.dice.keysPreset) ?? null,
          held: heldOfProgram(t.events) ?? null, air: airPlayOf(t.events, t.knobs, t.dice.keysPreset) };
        for (const bb of BIRDS) { cellSaid(bb, T, style); shortOf(bb, T, style); sentenceOf(bb, T, style); }
        for (const row of t.timeline) { if (row.section) ringSection(row.section); if (row.sub) ringSection(row.sub); }
      }
    }
    speak('en');
  }
  check(planned > 100, `the harvest planned ${planned} themes`);
  for (const k of ringMissed) check(false, `the ring prints "${k}" with no column`);
  console.log(`check-words: harvested ${planned} themes`);
}

if (failures.length) {
  for (const f of failures.slice(0, 60)) console.log(`  FAIL ${f}`);
  if (failures.length > 60) console.log(`  … and ${failures.length - 60} more`);
  console.log(`check-words: ${failures.length} of ${checks} failed`);
  process.exit(1);
}
console.log(`check-words: ${checks} checks, ${Object.keys(WORDS).length} meanings in ${LANG_TAGS.length} languages, ${marks} marks in index.html, ${lines.size} ring lines and ${words.size} ring words`);
