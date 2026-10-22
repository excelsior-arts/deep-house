// The playlists' record and the sky's worked-out values (PLAN-LIBRARY phase 1): `src/playlists.ts` and `src/sky.ts`.
// Run by `tools/check.ts` in its own style (one line a check); on its own, `node tools/check-playlists.ts`.

import { fileURLToPath } from 'node:url';
import { linkRead, linkWrite } from '../src/link.ts';
import { linkOfPlace } from '../src/control.ts';
import { recipesFor } from '../src/mix.ts';
import {
  readLibrary, mergeLibraries, normaliseLink, sameSound, saveTrack, createPlaylist, addToPlaylist, removeTrack, renamePlaylist, setLabel,
  writePlaylistFile, writeBackupFile, readDeephouseFile, backupSummary, keepBothName, playlistOf, tracksOf, stamp, emptyLibrary,
} from '../src/playlists.ts';
import { skyOfLink, genreOf, colourOf, SKY_PLACES } from '../src/sky.ts';
import { stepIndex, indexOfSound, seamDue, placeWords, playMark } from '../src/playlist-play.ts';
import { replaceLink, saveTarget, removePlaylist, playlistFileSummary, openPlaylistFile } from '../src/playlists.ts';
import { GOLD_STOPS, BASE } from '../src/ring-colour.ts';
import { writePlaylistLink, readPlaylistLink, savePlaylistLink, percentOf, valueOf, SHARED_LIST } from '../src/playlist-link.ts';
import { linkSameSound } from '../src/link.ts';
import { cleanLink } from '../src/share-link.ts';
import { playlistById, libraryStore, LIBRARY_KEY, UNREAD_KEY } from '../src/playlists.ts';
import { restore, replaceLibrary, BEFORE_SWITCH_KEY } from '../src/playlists.ts';
import { shellStore } from '../src/shell-library.ts';

const DAY = 24 * 3600 * 1000;
const T0 = Date.parse('2026-10-20T12:00:00Z');
const at = (days) => T0 + days * DAY;
// links joined here so no parameter name stands after a `?` or an `&` in the source (check-link reads every one)
const L = (...parts) => parts.join('&');
const A = L('seed=1', 'v=2'), B = L('seed=2', 'v=2'), C = L('seed=3', 'v=2');

export function playlistChecks(check, must) {
  check('the share circle copies a clean link: the track\'s own rows on the page\'s base, out and the view and the rest left behind, the same sound as the address', () => {
    const address = '?' + L('seed=6', 'v=2', 'theme=2', 'spell=em:0.20', 'out=silent', 'view=machine', 'lock=engine', 't=40');
    const base = 'https://example.org/deep-house/';
    const plain = cleanLink(address, base), timed = cleanLink(address, base, true);
    must(plain === base + '?' + L('seed=6', 'v=2', 'theme=2', 'spell=em:0.20'), `Copy link wrote ${plain}`);
    must(timed === base + '?' + L('seed=6', 'v=2', 'theme=2', 'spell=em:0.20', 't=40'), `Copy at wrote ${timed}`);
    must(linkSameSound(address.slice(1), plain.slice(base.length + 1)), 'the clean link is not the same sound as the address');
    must(cleanLink('?' + L('out=silent', 'view=machine'), base) === null || !/out=|view=/.test(cleanLink('?' + L('out=silent', 'view=machine'), base)), 'an address with no track kept its flags');
  });
  check('the first-time path off a secure context (a phone over plain http): the throne makes Saved and saves, New makes a playlist', () => {
    const was = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const saved = saveTrack(emptyLibrary(), A, at(0));
      must(tracksOf(playlistOf(saved, 'Saved')).length === 1, 'the first save made no Saved with its track');
      const made = createPlaylist(emptyLibrary(), 'Night', at(0));
      const id = made.playlists.find((p) => p.name === 'Night')?.id ?? '';
      must(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), `New made no playlist with a v4 id (${id})`);
    } finally {
      if (was) Object.defineProperty(globalThis.crypto, 'randomUUID', was); else delete globalThis.crypto.randomUUID;
    }
  });
  check('a playlists link is stored as the page writes it, and sameness reads it, never its text', () => {
    must(normaliseLink(L('seed=6', 'spell=ve:0.30,em:0.50', 'v=2')).link === L('seed=6', 'v=2', 'spell=em:0.50,ve:0.30'), 'shuffled birds not put in ring order');
    must(sameSound(L('seed=6', 'v=2', 'spell=em:0.394'), L('seed=6', 'v=2')), 'a bird written at its house is not the same as none');
    must(sameSound(L('seed=6', 'v=2', 'spell=em:0.5'), L('seed=6', 'spell=em:0.50', 'v=2')), '0.5 and 0.50 differ');
    must(normaliseLink('seed=6').link === L('seed=6', 'v=2'), 'a missing v is not pinned to the default engine');
    must(!sameSound(L('seed=6', 'v=2'), L('seed=6', 'v=2', 'qux=1')) && sameSound(L('seed=6', 'v=2', 't=40'), L('seed=6', 'v=2')), 'a custom parameter or t counted wrong');
    return 'birds in ring order, em:0.394 (the house) = none, 0.5 = 0.50, no v pinned to v2, a custom parameter counts and t does not';
  });

  check('a hand-typed library reads, a newer one is refused, and unknown fields at three levels survive a round trip and a merge', () => {
    const small = readLibrary('{"playlists":[{"tracks":[{"link":"seed=6&v=2"}]}]}', T0);
    must(small.doc && tracksOf(playlistOf(small.doc, null)).length === 1, 'the smallest file does not read');
    must(readLibrary('{"version":2,"playlists":[]}').error?.includes('newer'), 'a newer version is not refused');
    const odd = { format: 'deep-house.library', version: 1, mood: 'd', playlists: [{ name: 'N', edited: stamp(T0), hue: 'p', tracks: [{ link: A, saved: stamp(T0), stars: 5 }] }] };
    const once = readLibrary(JSON.stringify(readLibrary(odd).doc)).doc;
    const merged = mergeLibraries(emptyLibrary(), once, T0);
    for (const d of [once, merged]) {
      const p = playlistOf(d, 'N');
      must(d.mood === 'd' && p.hue === 'p' && p.tracks[0].stars === 5, 'an unknown field was lost');
    }
    return 'the smallest file reads, version 2 is refused with a sentence, a field at the document, a playlist and a track survives';
  });

  check('the merge: a removal against an older edit, a tie, a late addition, an expired tombstone', () => {
    let m;
    // a removal against an older edit wins; against a newer one it loses
    const base = saveTrack(emptyLibrary(), A, at(0));
    const removed = removeTrack(base, null, A, at(2));
    must(tracksOf(playlistOf(mergeLibraries(removed, setLabel(base, A, 'x', at(1)), at(3)), null)).length === 0, 'an older edit undid a removal');
    must(tracksOf(playlistOf(mergeLibraries(removed, setLabel(base, A, 'x', at(4)), at(5)), null)).length === 1, 'a newer edit lost to a removal');
    // a tie is settled by the two copies, never by which is here (the review of 10-21)
    const tieA = setLabel(base, A, 'here', at(1)), tieB = setLabel(base, A, 'there', at(1));
    m = mergeLibraries(tieA, tieB, at(2));
    must(tracksOf(playlistOf(m, null))[0].label === tracksOf(playlistOf(mergeLibraries(tieB, tieA, at(2)), null))[0].label, 'a tie went to whichever copy was here');
    // a late addition: the winning order does not hold it, and it goes at the end
    const two = addToPlaylist(addToPlaylist(createPlaylist(emptyLibrary(), 'N', at(0)), 'N', A, at(0)), 'N', B, at(0));
    const there = addToPlaylist(two, 'N', C, at(1));
    const reordered = { ...two, playlists: two.playlists.map((p) => ({ ...p, edited: stamp(at(2)), tracks: [...p.tracks].reverse() })) };
    must(tracksOf(playlistOf(mergeLibraries(reordered, there, at(3)), 'N')).map((t) => t.link).join(' ') === [B, A, C].join(' '), 'a late addition was lost or misplaced');
    // a tombstone past its year is dropped, so an old copy brings the track back
    must(tracksOf(playlistOf(mergeLibraries(removed, base, at(400)), null)).length === 1, 'an expired tombstone still removes');
    return 'a removal beats an older edit and loses to a newer, a tie keeps here, a late addition goes last, a tombstone expires after a year';
  });

  check('.deephouse files: both kinds read back equal, a backup says what it would do, Keep both names the new one', () => {
    let lib = createPlaylist(saveTrack(emptyLibrary(), A, at(0)), 'Sunday bells', at(0));
    lib = setLabel(addToPlaylist(lib, 'Sunday bells', B, at(0)), B, 'cool bells dialog', at(0));
    const one = writePlaylistFile(lib, 'Sunday bells');
    const back = readDeephouseFile(one.text);
    must(one.fileName === 'Sunday bells.deephouse' && back.kind === 'playlist' && JSON.stringify(back.doc.playlists[0]) === JSON.stringify(playlistOf(lib, 'Sunday bells')), 'a playlist file did not read back equal');
    const all = readDeephouseFile(writeBackupFile(lib, {}, T0).text);
    must(all.kind === 'library' && JSON.stringify(all.doc.playlists) === JSON.stringify(lib.playlists) && JSON.stringify(all.doc.preferences) === '{}', 'a backup did not read back equal');
    must(writePlaylistFile(createPlaylist(lib, 'a/b: c?', at(0)), 'a/b: c?').fileName === 'a b c.deephouse', 'a file name is not made safe');
    let theirs = setLabel(addToPlaylist(lib, 'Sunday bells', C, at(1)), B, 'bells', at(1));
    theirs = removeTrack(addToPlaylist(createPlaylist(theirs, 'Ambient journey', at(1)), 'Ambient journey', A, at(1)), null, A, at(1));
    const text = backupSummary(lib, theirs, [], at(2)).text;
    must(text === 'Adds 2, updates 1 label, removes 1, new playlist Ambient journey', `the summary reads "${text}"`);
    must(keepBothName(createPlaylist(lib, 'Sunday bells 2', at(0)), 'Sunday bells') === 'Sunday bells 3', 'Keep both did not take the next free number');
    return `a playlist and a backup read back equal, "${one.fileName}", "${text}", Keep both gives " 3" where " 2" is taken`;
  });

  check('playing a playlist: next and back step through it and it repeats, the place is found by sound, the seam is asked once in time', () => {
    must(stepIndex(9, 10, 1) === 0 && stepIndex(0, 10, -1) === 9 && stepIndex(3, 10, 1) === 4 && stepIndex(0, 1, 1) === 0 && stepIndex(2, 0, 1) === -1, 'a step does not repeat');
    must(stepIndex(12, 10, 0) === 2, 'a place past the end is not folded back in');
    const links = [A, L('seed=6', 'v=2', 'spell=em:0.95'), B];
    must(indexOfSound(links, L('seed=6', 'spell=em:0.950', 'v=2', 't=40')) === 1, 'a track is not found by its sound');
    must(indexOfSound(links, C) === -1 && indexOfSound(links, B, 2) === 2, 'a missing sound or the hint read wrong');
    must(!seamDue(200, 240) && seamDue(234, 240) && seamDue(250, 240) && !seamDue(1, 4), 'the seam is asked at the wrong time');
    must(placeWords(7, 10) === '8 of 10', 'the place reads wrong');
    must(playMark(true, true) === 'playing' && playMark(true, false) === 'current' && playMark(false, true) === null, 'a resumed playlist reads as playing while nothing sounds');
    // a chip removed: the cleaned sound takes the old one's place and keeps its label
    let lib = setLabel(addToPlaylist(addToPlaylist(createPlaylist(emptyLibrary(), 'N', at(0)), 'N', A, at(0)), 'N', L('seed=6', 'v=2', 'spell=em:0.95'), at(0)), L('seed=6', 'v=2', 'spell=em:0.95'), 'loud', at(0));
    lib = addToPlaylist(lib, 'N', B, at(0));
    const cleaned = replaceLink(lib, 'N', L('seed=6', 'v=2', 'spell=em:0.95'), L('seed=6', 'v=2'), at(1));
    const ts = tracksOf(playlistOf(cleaned, 'N'));
    must(ts.map((t) => t.link).join(' ') === [A, L('seed=6', 'v=2'), B].join(' ') && ts[1].label === 'loud', 'a cleaned track moved or lost its label');
    return 'the last steps to the first and the first back to the last, found by sound with t ignored, asked 6 s before the seam, "8 of 10", a cleaned track keeps its place and label';
  });

  check('playlists match by id: renames on two devices, a rename and a track added elsewhere, one name made on two devices, a renamed file reopened, id-less data', () => {
    const base = addToPlaylist(createPlaylist(emptyLibrary(), 'X', at(0)), 'X', A, at(0));
    const id = playlistOf(base, 'X').id;
    must(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), `the id ${id} is not a UUID v4`);
    // renamed on two devices: the newer name wins, one playlist
    let m = mergeLibraries(renamePlaylist(base, 'X', 'Y', at(1)), renamePlaylist(base, 'X', 'Z', at(2)), at(3));
    must(m.playlists.filter((p) => !p.removed).length === 1 && playlistOf(m, 'Z')?.id === id, 'two renames did not end as one playlist under the newer name');
    // renamed here, a track added there: one playlist, the new name, both tracks
    m = mergeLibraries(renamePlaylist(base, 'X', 'Y', at(1)), addToPlaylist(base, 'X', B, at(2)), at(3));
    must(!playlistOf(m, 'X') && tracksOf(playlistOf(m, 'Y')).length === 2, 'a rename and a track added elsewhere did not meet');
    must(!m.playlists.some((p) => p.renamed !== undefined), 'a rename record was written');
    // one name made on two devices: folded into the older id, the newer tombstoned into it
    const one = addToPlaylist(createPlaylist(emptyLibrary(), 'N', at(0)), 'N', A, at(0));
    const two = addToPlaylist(createPlaylist(emptyLibrary(), 'N', at(1)), 'N', B, at(1));
    m = mergeLibraries(two, one, at(2));
    const n = playlistOf(m, 'N');
    must(n.id === playlistOf(one, 'N').id && tracksOf(n).length === 2 && m.playlists.some((p) => p.id === playlistOf(two, 'N').id && p.into === n.id), 'one name made twice did not fold into the older');
    must(tracksOf(playlistOf(mergeLibraries(two, m, at(3)), 'N')).length === 2 && playlistOf(mergeLibraries(two, m, at(3)), 'N').id === n.id, 'the fold did not carry to the other copy');
    // a file of a renamed playlist reopened: its id is here, so Replace is offered, and it brings the new name
    const sent = readDeephouseFile(writePlaylistFile(renamePlaylist(base, 'X', 'Sunday', at(1)), 'Sunday').text).doc;
    must(playlistFileSummary(base, sent).exists, 'a renamed playlist sent again was not recognised');
    must(playlistOf(openPlaylistFile(base, sent, 'replace', at(2)), 'Sunday')?.id === id, 'Replace did not update the copy here');
    const same = readDeephouseFile(writePlaylistFile(createPlaylist(emptyLibrary(), 'X', at(0)), 'X').text).doc;
    must(!playlistFileSummary(base, same).exists && playlistOf(openPlaylistFile(base, same, 'add', at(1)), 'X 2'), 'the same name under another id was not added as "X 2"');
    // id-less data: ids made on reading; two id-less copies of one name meet as one
    const r1 = readLibrary('{"playlists":[{"name":"Old","tracks":[{"link":"seed=6&v=2"}]}]}', T0), r2 = readLibrary('{"playlists":[{"name":"Old","tracks":[{"link":"seed=7&v=2"}]}]}', T0);
    must(r1.assigned && playlistOf(r1.doc, 'Old').id && playlistOf(r1.doc, 'Old').id !== playlistOf(r2.doc, 'Old').id, 'id-less data got no id');
    must(tracksOf(playlistOf(mergeLibraries(r1.doc, r2.doc, at(1)), 'Old')).length === 2, 'two id-less copies of one name did not meet');
    must(readLibrary('{"playlists":[{"id":"hand","name":"H","tracks":[]}]}').doc.playlists[0].id === 'hand', 'a hand-written id was not kept');
    return 'a UUID v4 id; two renames end as one under the newer name; a rename here and a track there meet; one name made twice folds into the older id; a renamed file reopened offers Replace; another id of one name adds "X 2"; id-less data gets ids and meets by name';
  });

  check('a saved track copies back as the page wrote it: birds off the house as written, absent birds absent, no spell none', () => {
    const cases = [L('seed=5340', 'v=2', 'spell=ro:0.80,gl:0.60'), L('seed=5341', 'v=2'), L('seed=5342', 'v=2', 'theme=2', 'spell=em:0.15,ti:0.90,lo:0.95'), L('seed=5343', 'v=2', 'spell=em:0.00')];
    for (const link of cases) {
      const page = linkWrite(linkRead(link).link);
      const stored = tracksOf(playlistOf(saveTrack(emptyLibrary(), link, T0), null))[0].link;
      const copied = normaliseLink(stored).link;
      must(stored === page && copied === page, `${link} stored as ${stored}, copied as ${copied}, the page writes ${page}`);
      must(!/:0\.00/.test(copied) || /em:0\.00/.test(link), `${link} gained a zero`);
    }
    must(!normaliseLink(L('seed=5341', 'v=2')).link.includes('spell'), 'a link with no spell gained one');
    // the throne's own path: the playing place's link (\`linkOfPlace\`), saved, copied
    const base = { seed: '27191', theme: 0, strategy: 'house-v2', recipe: null, accompaniment: 'base', development: 'base' };
    const throne = (spell) => normaliseLink(tracksOf(playlistOf(saveTrack(emptyLibrary(), linkOfPlace({ ...base, spell }), T0), null))[0].link).link;
    must(throne(null) === L('seed=27191', 'v=2'), `a no-spell place saved and copied as ${throne(null)}`);
    must(throne({ root: 1 }) === L('seed=27191', 'v=2', 'spell=ro:1.00'), `a held Root saved and copied as ${throne({ root: 1 })}`);
    const rolled = recipesFor({ masterSeed: '27191', strategy: 'house-v2', search: `?${L('seed=27191', 'v=2', 'recipe=auto')}` }).spell;
    const auto = linkOfPlace({ ...base, recipe: 'auto', spell: rolled });
    must(!auto.includes('spell'), `a recipe's own roll was pinned: ${auto}`);
    return `${cases.length} links: saved and copied equal linkWrite's, no spell stays none, a real 0.00 stays`;
  });

  check('no default (his word 10-20): the throne saves into the only playlist, asks among several by their last change, an old file\'s default reads and nothing writes one, and any playlist can go', () => {
    const old = readLibrary('{"default":"Mine","defaultEdited":"2026-01-01T00:00:00Z","playlists":[{"name":"Saved","tracks":[]},{"name":"Mine","tracks":[]},{"tracks":[{"link":"seed=6&v=2"}]}]}', T0).doc;
    must(playlistOf(old, 'Saved 2') && playlistOf(old, 'Mine') && old.default === undefined && old.defaultEdited === undefined, 'an old file with a default did not read, or kept its default');
    must(saveTarget(emptyLibrary()).kind === 'create', 'with no playlist the throne did not make one');
    let lib = saveTrack(emptyLibrary(), A, at(0));
    must(tracksOf(playlistOf(lib, 'Saved')).length === 1, 'the first save made no Saved');
    const one = saveTarget(lib);
    must(one.kind === 'one' && one.name === 'Saved', 'with one playlist the throne did not save into it');
    lib = createPlaylist(lib, 'Draft', at(1));
    lib = saveTrack(lib, B, at(2), undefined, 'Draft');
    const pick = saveTarget(lib);
    must(pick.kind === 'pick' && pick.names.join() === 'Draft,Saved', `the menu's order is ${pick.kind === 'pick' ? pick.names.join() : pick.kind}`);
    lib = saveTrack(lib, C, at(3), undefined, 'Saved');
    const again = saveTarget(lib);
    must(again.kind === 'pick' && again.names.join() === 'Saved,Draft', 'a save did not move its playlist to the top');
    let threw = false;
    try { saveTrack(lib, C, at(4)); } catch (e) { threw = true; }
    must(threw, 'a save among several playlists did not ask which');
    lib = removePlaylist(removePlaylist(lib, 'Saved', at(5)), 'Draft', at(6));
    must(saveTarget(lib).kind === 'create', 'the last playlist could not go, or the next save does not make Saved again');
    const written = [JSON.stringify(mergeLibraries(old, lib, at(7))), writeBackupFile(old, {}, T0).text, writePlaylistFile(old, 'Mine').text];
    must(written.every((t) => !/"default(Edited)?"/.test(t)), 'something wrote a default');
    return 'an old default read past, none makes Saved, one saves into it, several ask newest first and a save moves its playlist up, the last can go, nothing writes a default';
  });

  check('a playlist link (phase 5): every track comes back as the same sound and the same link, with its label', () => {
    const tracks = [
      { link: L('seed=6', 'v=2') },
      { link: L('seed=27191', 'v=2', 'theme=3', 'spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81'), label: 'cool bells ~ dialog' },
      { link: L('seed=812', 'v=2', 'theme=2', 'spell=ze:0.205,ve:1.00'), label: 'a & b' },
      { link: L('seed=1', 'v=1', 'spell=em:0.123456789'), label: 'café 🌙 ночь' },
      { link: L('seed=3', 'v=2', 'recipe=auto', 'spell=em:0.5'), label: '' },
      { link: L('seed=4', 'v=2', 'development=shaped', 'accompaniment=auto') },
      { link: L('seed=5', 'v=2', 'reach=0.4', 'qux=a~b;c@d:e', 't=30'), label: '~~' },
      { link: L('seed=a-b~c', 'v=2', 'theme=2') },
    ];
    const list = { name: 'Ambient ~ journey & co', id: '3f9c2a71-e8b4-4d0c-9a1e-5b7d2c6f8a90', tracks };
    const q = writePlaylistLink(list);
    const r = readPlaylistLink(q);
    must(r.list && r.list.tracks.length === tracks.length, `the link does not read back: ${r.error}`);
    tracks.forEach((t, i) => {
      const back = r.list.tracks[i];
      must(back.link === normaliseLink(t.link).link, `${t.link} came back as ${back.link}`);
      must(linkSameSound(t.link, back.link) && sameSound(t.link, back.link), `${t.link} plays otherwise`);
      must((back.label ?? '') === (t.label ?? ''), `label ${JSON.stringify(t.label)} came back as ${JSON.stringify(back.label)}`);
    });
    must(r.list.name === list.name && r.list.id === list.id, 'the name or the id did not come back');
    must(writePlaylistLink(r.list) === q, 'a link read and written again differs');
    must(/^list=[^&]*&v=2&play=[^&]*&names=[^&]*&id=3f9c2a71e8b44d0c9a1e5b7d2c6f8a90$/.test(q), `the rows are out of order, or the id not last: ${q}`);
    must(q.includes('play=6~27191-3-em14gl0ve34sp0lo81~812-2-ze20.5ve100~1-em12.3456789@1~3-em50;recipe:auto~'), `the format moved: ${q}`);
    for (const v of ['0.00', '0.05', '0.10', '0.205', '0.95', '1.00', '0.005', '0.123456789']) must(valueOf(percentOf(v)) === v, `${v} does not round-trip as a percent`);
    return `${tracks.length} tracks (the house, off it, a third decimal and more, v1 among v2, a recipe, the modes, reach and a custom row with every separator, a seed with them), labels with ~ & emoji and empty; ${q.length} characters`;
  });

  check('a playlist link: play alone, the id last, a malformed one refused', () => {
    const r = readPlaylistLink(L('play=6~812-2-ze20ve80'));
    must(r.list && r.list.name === SHARED_LIST && r.list.id === null && r.list.tracks.every((t) => !t.label), 'play alone does not read as Shared list with no id');
    must(r.list.tracks[1].link === L('seed=812', 'v=2', 'theme=2', 'spell=ze:0.20,ve:0.80'), `play alone is not pinned to v2: ${r.list.tracks[1].link}`);
    must(!writePlaylistLink({ name: 'x', id: null, tracks: [{ link: A }] }).includes('id='), 'no id writes one');
    for (const bad of [L('list=x'), L('play='), L('play=6-zz'), L('play=6;nocolon'), L('play=-3')]) must(readPlaylistLink(bad).error, `${bad} is not refused`);
    const newer = readPlaylistLink(L('v=2', 'play=6~7-em95@9'));
    must(newer.list && newer.list.tracks.length === 2 && !normaliseLink(newer.list.tracks[1].link).ok && normaliseLink(newer.list.tracks[1].link).newer, 'a track on an engine this edition lacks is not kept and marked');
    return 'play alone is Shared list on v2, no id written where none, five malformed links refused, a v9 track kept and marked newer';
  });

  check('a playlist link opened: the same id replaces (name, tracks, order, labels), none adds with " 2", a removed one comes back', () => {
    const id = '3f9c2a71-e8b4-4d0c-9a1e-5b7d2c6f8a90';
    let doc = createPlaylist(emptyLibrary(), 'Ambient journey', at(0));
    doc.playlists[0].id = id;
    doc = addToPlaylist(addToPlaylist(doc, 'Ambient journey', A, at(1)), 'Ambient journey', B, at(1));
    const one = savePlaylistLink(doc, { name: 'Renamed', id, tracks: [{ link: C, label: 'c' }, { link: A }] }, at(2));
    const p = playlistById(one.doc, id);
    must(one.replaced && p.name === 'Renamed' && tracksOf(p).map((t) => t.link).join('|') === [C, A].join('|') && tracksOf(p)[0].label === 'c', 'the same id did not take the link\'s version');
    must(one.doc.playlists.filter((x) => x.removed === undefined).length === 1, 'the same id added a second playlist');
    const two = savePlaylistLink(one.doc, { name: 'Renamed', id: null, tracks: [{ link: B }] }, at(3));
    must(!two.replaced && playlistById(two.doc, two.id).name === 'Renamed 2' && two.id !== id, 'no id did not add " 2" on a clash');
    const gone = removePlaylist(one.doc, 'Renamed', at(4));
    const back = savePlaylistLink(gone, { name: 'Renamed', id, tracks: [{ link: A }] }, at(5));
    must(playlistById(back.doc, id)?.name === 'Renamed', 'a removed playlist opened again from its link stays gone');
    return 'the same id replaced as Renamed (C, A, its label), no id added Renamed 2, a removed one came back';
  });

  check('a sound copied, moved or re-saved into a playlist it was removed from survives the other device\'s merge (the test round, 10-21)', () => {
    // A in P and Q since day 0; removed from Q on day 1 (the tombstone syncs); on day 2 moved from P back into Q
    const base = addToPlaylist(addToPlaylist(createPlaylist(createPlaylist(emptyLibrary(), 'P', at(0)), 'Q', at(0)), 'P', A, at(0)), 'Q', A, at(0));
    const removed = removeTrack(base, 'Q', A, at(1));
    const moved = removeTrack(addToPlaylist(removed, 'Q', A, at(2)), 'P', A, at(2));
    must(tracksOf(playlistOf(moved, 'Q')).length === 1, 'the move left nothing in Q here');
    for (const [where, m] of [['the device that moved it', mergeLibraries(moved, removed)], ['the other device', mergeLibraries(removed, moved)]]) {
      must(tracksOf(playlistOf(m, 'Q')).map((t) => t.link).join() === A, `on ${where} Q holds ${tracksOf(playlistOf(m, 'Q')).map((t) => t.link).join() || 'nothing'} after the merge`);
      must(!tracksOf(playlistOf(m, 'P')).length, `on ${where} P still holds the moved track`);
    }
    // a cleaned link (replaceLink) dated now too
    const kept = replaceLink(addToPlaylist(removeTrack(base, 'Q', B, at(1)), 'P', B, at(0)), 'P', A, B, at(2));
    const there = mergeLibraries(removeTrack(base, 'P', B, at(1)), kept);
    must(tracksOf(playlistOf(there, 'P')).some((t) => t.link === B), 'a cleaned link lost the merge to an older removal of its sound');
    return 'a track removed from Q, then moved back into it from P, is in Q and not P on both devices; a cleaned link beats an older removal of its sound';
  });
  check('the store never writes over a library it can\'t read: a newer edition\'s is refused, an unreadable one kept once under a spare key (the test round, 10-21)', () => {
    const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, m }; };
    const newer = JSON.stringify({ format: 'deep-house.library', version: 99, kind: 'library', playlists: [{ id: 'x', name: 'Later', tracks: [] }] });
    const a = mem(); a.setItem(LIBRARY_KEY, newer);
    const sa = libraryStore(a, null);
    const w = sa.write(saveTrack(emptyLibrary(), A, at(0)));
    must(!w.ok && /newer Deep House/.test(w.message) && a.getItem(LIBRARY_KEY) === newer, `a newer library was written over (${JSON.stringify(w)})`);
    const b = mem(); b.setItem(LIBRARY_KEY, '{not json');
    const sb = libraryStore(b, null);
    const w2 = sb.write(saveTrack(emptyLibrary(), A, at(0)));
    must(w2.ok && b.getItem(UNREAD_KEY) === '{not json' && !!readLibrary(b.getItem(LIBRARY_KEY)).doc, `an unreadable library: write ${JSON.stringify(w2)}, kept ${b.getItem(UNREAD_KEY)}`);
    sb.write(saveTrack(emptyLibrary(), B, at(0)));
    must(b.getItem(UNREAD_KEY) === '{not json', 'the spare copy was replaced by a readable library');
    return 'a version-99 library refused with its sentence and left as it was; "{not json" kept under the spare key, then replaced';
  });
  check('an Undo of a removal survives the next merge with a device that has the removal (sync-fixes, 10-21)', () => {
    const base = addToPlaylist(addToPlaylist(createPlaylist(createPlaylist(emptyLibrary(), 'P', at(0)), 'Q', at(0)), 'P', A, at(0)), 'P', B, at(0));
    const links = (d, n) => tracksOf(playlistOf(d, n)).map((t) => t.link).join();
    // a track: removed here, the other device merges the removal in, Undo here (in the removal's own second), merge both ways
    const t1 = at(1);
    const gone = removeTrack(base, 'P', A, t1);
    const other = mergeLibraries(base, gone, t1 + 200);
    must(links(other, 'P') === B, `the other device did not take the removal (P holds ${links(other, 'P')})`);
    const here = mergeLibraries(restore(base, mergeLibraries(gone, other, t1 + 300), t1 + 400), other, t1 + 500);
    const there = mergeLibraries(other, here, t1 + 600);
    must(links(here, 'P') === [A, B].join() && links(there, 'P') === [A, B].join(), `after Undo and the merges P holds ${links(here, 'P') || 'nothing'} here and ${links(there, 'P') || 'nothing'} there`);
    // a playlist: removed, merged into the other device, Undo, merged again
    const t2 = at(2);
    const dropped = removePlaylist(base, 'Q', t2);
    const other2 = mergeLibraries(base, dropped, t2);
    const here2 = mergeLibraries(restore(base, dropped, t2), other2, t2);
    const there2 = mergeLibraries(other2, here2, t2);
    must(!!playlistOf(here2, 'Q') && !!playlistOf(there2, 'Q'), `after Undo Q is ${playlistOf(here2, 'Q') ? 'here' : 'gone here'} and ${playlistOf(there2, 'Q') ? 'there' : 'gone there'}`);
    // a move undone: the copy it made goes too, everywhere
    const moved = removeTrack(addToPlaylist(base, 'Q', A, at(3)), 'P', A, at(3));
    const other3 = mergeLibraries(base, moved, at(3));
    const there3 = mergeLibraries(other3, restore(base, moved, at(3) + 100), at(3) + 200);
    must(links(there3, 'P') === [A, B].join() && !links(there3, 'Q'), `a move undone leaves P ${links(there3, 'P')} and Q ${links(there3, 'Q') || 'empty'} there`);
    return 'a track and a playlist removed, merged into the other device, then undone in the same second, come back on both; a move undone leaves Q empty there';
  });
  check('Replace with a backup wins over a stale copy from another device; the 2.3.0 reader takes it as it stands (sync-fixes, 10-21)', () => {
    // here and the cloud hold P (A, B), Q (C) and R; the backup holds P (A) and S, older than all of it
    let here = addToPlaylist(addToPlaylist(createPlaylist(createPlaylist(createPlaylist(emptyLibrary(), 'P', at(1)), 'Q', at(1)), 'R', at(1)), 'P', A, at(1)), 'P', B, at(1));
    here = setLabel(addToPlaylist(here, 'Q', C, at(2)), A, 'newer label', at(2));
    const pid = playlistOf(here, 'P').id;
    let backup = addToPlaylist(createPlaylist(createPlaylist(emptyLibrary(), 'P', at(0)), 'S', at(0)), 'P', A, at(0));
    backup.playlists[0].id = pid;
    backup = setLabel(backup, A, 'old label', at(0));
    const replaced = replaceLibrary(here, readLibrary(writeBackupFile(backup, {}, at(0)).text).doc, at(3));
    const stale = here;
    const names = (d) => d.playlists.filter((p) => p.removed === undefined).map((p) => p.name).sort().join();
    for (const [where, m] of [['here', mergeLibraries(replaced, stale, at(4))], ['the other device', mergeLibraries(stale, replaced, at(4))]]) {
      must(names(m) === 'P,S', `on ${where} the playlists are ${names(m)} after the merge, where Replace left P and S`);
      const p = tracksOf(playlistOf(m, 'P'));
      must(p.map((t) => t.link).join() === A && p[0].label === 'old label', `on ${where} P holds ${p.map((t) => `${t.link} ${t.label ?? ''}`).join('; ')}`);
    }
    // its record is the 2.3.0 record: read as it stands, unknown fields none, the format and version unchanged
    const r = readLibrary(JSON.stringify(replaced));
    const known = new Set(['id', 'name', 'edited', 'nameEdited', 'removed', 'into', 'tracks', 'link', 'label', 'saved']);
    const fields = new Set(replaced.playlists.flatMap((p) => [...Object.keys(p), ...(p.tracks ?? []).flatMap((t) => Object.keys(t))]));
    must(!!r.doc && replaced.version === 1 && [...fields].every((f) => known.has(f)), `the replaced record reads ${r.error ?? 'fine'} with fields ${[...fields].join(', ')}`);
    // Keep both and a merge from a backup stay as they were: the merge brings Q and R back from the stale copy
    must(names(mergeLibraries(mergeLibraries(here, backup, at(3)), stale, at(4))) === 'P,Q,R,S', 'a merge from a backup changed');
    return 'after Replace, a stale copy merged either way leaves P (A, the backup\'s label) and S, with Q, R and B gone; the record holds only 2.3.0\'s fields; a merge still keeps all four';
  });
  check('the library kept aside before another iCloud account\'s is adopted reads back as a backup (sync-fixes, 10-21)', () => {
    const m = new Map();
    const mem = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
    const doc = saveTrack(emptyLibrary(), A, at(0));
    must(libraryStore(mem, null).keepAside(doc, at(1)), 'nothing was kept');
    const back = readDeephouseFile(m.get(BEFORE_SWITCH_KEY));
    must(back.kind === 'library' && tracksOf(playlistOf(back.doc, 'Saved'))[0]?.link === A && back.doc.switched === stamp(at(1)), `the kept copy reads ${back.error ?? back.kind}`);
    return `kept under ${BEFORE_SWITCH_KEY}, dated ${stamp(at(1))}, it reads as a backup holding Saved`;
  });
  check('a cloud value this device cannot write down is never answered with the library here, and is merged once a write succeeds (the review of 10-21)', () => {
    // the shell's pipe and the page's timers, by hand: every message sent kept, every timer run when asked
    const sent = [], on = {}, timers = [];
    const was = globalThis.window;
    globalThis.window = { deepHouseShell: { platform: 'ios', send: (m) => sent.push(m), on: (k, fn) => { on[k] = fn; } },
      setTimeout: (fn) => timers.push(fn), clearTimeout: () => {} };
    const run = () => { while (timers.length) timers.shift()(); };
    const warn = console.warn;
    console.warn = () => {};
    try {
      let stored = saveTrack(emptyLibrary(), B, at(1)), full = true;
      const said = [];
      const store = shellStore({
        read: () => ({ doc: structuredClone(stored), bad: [] }),
        write: (d) => { if (full) return { ok: false, error: 'quota', message: 'full' }; stored = structuredClone(d); return { ok: true }; },
        subscribe: () => () => {},
        keepAside: () => true,
      }, (m) => said.push(m));
      const visible = (d) => d.playlists.flatMap((p) => tracksOf(p).map((t) => t.link)).sort().join();
      const cloudDoc = saveTrack(emptyLibrary(), C, at(2));
      on.cloud({ kind: 'cloud', text: JSON.stringify(cloudDoc) });
      run();
      must(!sent.length, `the refused merge sent ${sent.map((m) => visible(JSON.parse(m.text))).join(' | ')}`);
      must(said.join() === 'full', `the storage's words said: ${said.join(' | ') || 'none'}`);
      must(visible(stored) === B, `here holds ${visible(stored)}`);
      // a write here refused too sends nothing; one that succeeds merges the cloud's value again, then sends the whole
      store.write(saveTrack(stored, A, at(3)));
      run();
      must(!sent.length, 'a refused write here sent the library');
      full = false;
      store.write(saveTrack(stored, A, at(3)));
      run();
      must(visible(stored) === [A, B, C].join(), `after the write here holds ${visible(stored)}`);
      must(sent.length >= 1 && sent.every((m) => m.ev === 'cloud-write' && visible(JSON.parse(m.text)).includes(C)), `sent ${sent.map((m) => visible(JSON.parse(m.text))).join(' | ')}`);
      const whole = visible(JSON.parse(sent[sent.length - 1].text));
      // another account's library refused on adoption: nothing is sent into it
      sent.length = 0;
      full = true;
      on.cloud({ kind: 'cloud', switched: true, text: JSON.stringify(saveTrack(emptyLibrary(), A, at(4))) });
      run();
      must(!sent.length, `the refused adoption sent ${sent.length}`);
      return `refused: nothing sent and its words said; the next write that succeeded merged the cloud's track back and sent ${whole.split(',').length} tracks; a refused adoption sent nothing`;
    } finally { globalThis.window = was; console.warn = warn; }
  });
  check('two devices\' changes in the same second merge to the same library whichever way round (the review of 10-21)', () => {
    // the same content, the playlists' own order left aside (each device keeps its own)
    const content = (d) => JSON.stringify([...d.playlists].sort((x, y) => String(x.id ?? '').localeCompare(String(y.id ?? ''))),
      (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
    const base = addToPlaylist(createPlaylist(saveTrack(emptyLibrary(), A, at(0)), 'P', at(0)), 'P', B, at(0));
    const t = at(1) + 100, u = at(1) + 800;
    must(stamp(t) === stamp(u), 'the two moments are not one second of the record');
    const pairs = [
      ['a label', setLabel(base, A, 'one', t), setLabel(base, A, 'two', u)],
      ['a rename', renamePlaylist(base, 'P', 'Night', t), renamePlaylist(base, 'P', 'Morning', u)],
      ['a removal against an edit', removeTrack(base, 'P', B, t), setLabel(base, B, 'kept', u)],
      ['a playlist removed against a track added to it', removePlaylist(base, 'P', t), addToPlaylist(base, 'P', C, u)],
    ];
    const said = [];
    for (const [what, x, y] of pairs) {
      const xy = mergeLibraries(x, y, at(2)), yx = mergeLibraries(y, x, at(2));
      must(content(xy) === content(yx), `${what}: merge(a, b) and merge(b, a) differ`);
      // and once more each way changes nothing: the two devices have nothing left to send
      must(content(mergeLibraries(xy, yx, at(2))) === content(xy), `${what}: merging the two results moved again`);
      said.push(what);
    }
    // the removal against an edit in the same second: the track stays (nothing is lost on a tie)
    const kept = mergeLibraries(removeTrack(base, 'P', B, t), setLabel(base, B, 'kept', u), at(2));
    must(tracksOf(playlistOf(kept, 'P')).some((x) => x.link === B), 'a tie between a removal and an edit lost the track');
    // a record written before this round reads as it stands: no new field, the same format
    const legacy = readLibrary(JSON.stringify(base));
    must(!!legacy.doc && legacy.doc.version === base.version && content(legacy.doc) === content(base), `the record reads ${legacy.error ?? 'changed'}`);
    return `${said.join(', ')}: the same both ways and settled; the removal against an edit keeps the track; the record unchanged`;
  });
  check('the sky: the house and three bench links stand where they stood, with their genres, and the house wears the gold', () => {
    const pin = [
      [A, 0, 0, 'Deep House'],
      // the benchmark is Drone's spell (his word 10-20), in the Ambient field: nearer Ambient than the house
      [L('seed=27191', 'v=2', 'theme=3', 'spell=em:0.14,gl:0.00,ve:0.34,sp:0.00,lo:0.81'), -0.4323, 0.1375, 'Drone'],
      [L('seed=6', 'v=2', 'spell=em:0.92,ti:0.90,ze:0.25,ro:0.85,ve:0.15,sp:0.10,lo:0.80'), 0.2725, 0.7024, 'Chillstep'],
      [L('seed=1', 'v=2', 'spell=em:0.95,ti:0.45,ze:0.60,ro:0.75,ve:0.60,sp:0.85,lo:0.85'), 0.7573, -0.1587, 'Liquid'],
    ];
    for (const [link, x, y, genre] of pin) {
      const p = skyOfLink(link);
      must(Math.abs(p.x - x) < 5e-5 && Math.abs(p.y - y) < 5e-5, `${link} moved to ${p.x.toFixed(4)}, ${p.y.toFixed(4)}`);
      must(genreOf(link).name === genre, `${link} reads ${genreOf(link).name}`);
    }
    must(colourOf(A) === GOLD_STOPS[BASE].hex, `the house wears ${colourOf(A)}`);
    // a family's stars together: Drone stands nearer Ambient than the house, Chillstep beside Dub Techno
    const at = (n) => SKY_PLACES.find((p) => p.lit && p.name === n).point;
    const gap = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    must(gap('Drone', 'Ambient') < gap('Drone', 'Deep House') / 3, `Drone stands ${gap('Drone', 'Ambient').toFixed(3)} from Ambient, ${gap('Drone', 'Deep House').toFixed(3)} from the house`);
    must(gap('Chillstep', 'Dub Techno') < 0.2, `Chillstep stands ${gap('Chillstep', 'Dub Techno').toFixed(3)} from Dub Techno`);
    const lit = SKY_PLACES.filter((p) => p.lit).map((p) => p.name);
    must(lit.join() === 'Deep House,Tech House,Techno,Ambient,Downtempo,Trip Hop,Drone,Psybient,Bells,Waves,Liquid,Dub Techno,Chillstep,Trance,Breaks & Big Beat', `the lit stars are ${lit.join(', ')}`);
    return `${pin.length} positions pinned, genres ${pin.map((p) => p[3]).join(', ')}, the house ${colourOf(A)}; ${lit.length} lit stars, Drone by Ambient, Chillstep by Dub Techno`;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let failed = 0;
  const check = (name, fn) => {
    try { console.log(`ok    ${name}: ${fn()}`); } catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message}`); }
  };
  playlistChecks(check, (cond, why) => { if (!cond) throw new Error(why); });
  if (failed) process.exit(1);
}
