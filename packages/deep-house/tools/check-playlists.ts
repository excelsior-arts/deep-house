// The playlists' record and the sky's worked-out values (PLAN-LIBRARY phase 1): `src/playlists.ts` and `src/sky.ts`.
// Run by `tools/check.ts` in its own style (one line a check); on its own, `node tools/check-playlists.ts`.

import { fileURLToPath } from 'node:url';
import { linkRead, linkWrite } from '../src/link.ts';
import { linkOfPlace } from '../src/control.ts';
import { recipesFor, planTheme, programOf } from '../src/mix.ts';
import { STRATEGIES } from '../src/strategies/index.ts';
import { PLACE_LANES, readPlace, rowOf, zoneOf } from '../src/places.ts';
import { TOP_FORM } from '../src/top-form.ts';
import { BIRDS, HOUSE, asSpell, derive } from '../src/spell.ts';
import {
  readLibrary, mergeLibraries, normaliseLink, sameSound, saveTrack, createPlaylist, addToPlaylist, removeTrack, renamePlaylist, setLabel,
  writePlaylistFile, writeBackupFile, readDeephouseFile, backupSummary, keepBothName, playlistOf, tracksOf, stamp, emptyLibrary,
} from '../src/playlists.ts';
import { skyOfLink, genreOf, colourOf, SKY_PLACES, SKY_DOTS, SKY_REGIONS, STEER_BIRDS, DOTS_PER_STAR, NEAR_PLACES, nearStarOf, genreOfSpell, tempoOf, timeOf } from '../src/sky.ts';
import { listTempo, listPull, foldTo, LIST_PULL } from '../src/performance.ts';
import { stepIndex, indexOfSound, seamDue, placeWords, playMark } from '../src/playlist-play.ts';
import { replaceLink, saveTarget, removePlaylist, playlistFileSummary, openPlaylistFile } from '../src/playlists.ts';
import { GOLD_STOPS, BASE } from '../src/ring-colour.ts';
import { writePlaylistLink, readPlaylistLink, savePlaylistLink, percentOf, valueOf, SHARED_LIST } from '../src/playlist-link.ts';
import { linkSameSound } from '../src/link.ts';
import { cleanLink } from '../src/share-link.ts';
import { playlistById, libraryStore, LIBRARY_KEY, UNREAD_KEY } from '../src/playlists.ts';
import { restore, replaceLibrary, BEFORE_SWITCH_KEY } from '../src/playlists.ts';
import { rankBetween, inOrder, movePlaylist, byRecent, moveTrack } from '../src/playlists.ts';
import * as shipped from './fixtures/playlists-2.3.1.ts';
import { shellStore } from '../src/shell-library.ts';
import { FEATURED, FEATURED_WORD, featuredById, featuredTracks, copyOfFeatured, trackShareLink, featKey, featOf, featuredPlace } from '../src/featured.ts';
import { entryOf, withEntry } from './feature.ts';
import { featuredUnfrozen, featuredRows, saved as digestSaved } from './link-digest.ts';

const DAY = 24 * 3600 * 1000;
const T0 = Date.parse('2026-10-20T12:00:00Z');
const at = (days) => T0 + days * DAY;
// links joined here so no parameter name stands after a `?` or an `&` in the source (check-link reads every one)
const L = (...parts) => parts.join('&');
const A = L('seed=1', 'v=2'), B = L('seed=2', 'v=2'), C = L('seed=3', 'v=2');

export function playlistChecks(check, must) {
  check('the featured table reads whole: ids and names unique, every link as the page writes it, playable and naming its engine, the first run\'s first track playable', () => {
    must(FEATURED.length >= 1, 'no featured playlist: a first run would fall back to a seed');
    must(FEATURED_WORD === 'Featured', `the section's word is ${FEATURED_WORD}`);
    const ids = FEATURED.map((f) => f.id), names = FEATURED.map((f) => f.name);
    must(new Set(ids).size === ids.length && new Set(names).size === names.length, `ids ${ids.join()} or names ${names.join()} repeat`);
    for (const f of FEATURED) {
      must(featuredById(f.id) === f && Object.isFrozen(f), `${f.name} is not found by its id or can be edited`);
      must(f.links.length >= 1 && new Set(f.links).size === f.links.length, `${f.name} holds ${f.links.length} links, some twice`);
      must(!f.labels || f.labels.length === f.links.length, `${f.name} has ${f.labels?.length} labels for ${f.links.length} links`);
      for (const l of f.links) {
        const n = normaliseLink(l);
        must(n.ok && n.link === l, `${f.name}: ${l} is not a link as the page writes it (${n.ok ? n.link : n.why})`);
        must(/(^|&)v=/.test(l), `${f.name}: ${l} names no engine`);
      }
      must(featuredTracks(f).map((t) => t.link).join() === f.links.join(), `${f.name}'s tracks are not its links in order`);
    }
    return `${FEATURED.length} playlists (${names.join(', ')}), ${FEATURED.reduce((n, f) => n + f.links.length, 0)} links, the first run on ${FEATURED[0].name}'s ${FEATURED[0].links[0]}`;
  });
  check('Save a copy makes an ordinary playlist of yours (a new id, the name, " 2" where it is taken, the tracks and labels in order); the featured table and its ids never enter the record', () => {
    const f = FEATURED[0];
    const one = copyOfFeatured(emptyLibrary(), f, at(0));
    const p = playlistById(one.doc, one.id);
    must(!!p && p.name === f.name && one.id !== f.id && /^[0-9a-f-]{36}$/.test(one.id), `the copy is ${JSON.stringify(p && [p.name, p.id])}`);
    must(tracksOf(p).map((t) => t.link).join() === f.links.join(), 'the copy\'s tracks are not the featured ones in order');
    const two = copyOfFeatured(one.doc, f, at(1));
    must(playlistById(two.doc, two.id)?.name === `${f.name} 2` && two.id !== one.id, `a second copy is ${playlistById(two.doc, two.id)?.name}`);
    must(!JSON.stringify(two.doc).includes(f.id), 'a featured id is in the record');
    // edits of the copy are ordinary: renamed, its track removed; the table stands as it was
    const edited = removeTrack(renamePlaylist(one.doc, f.name, 'Mine', at(2)), 'Mine', f.links[0], at(3));
    must(tracksOf(playlistOf(edited, 'Mine')).length === f.links.length - 1 && featuredById(f.id)!.links.length === f.links.length, 'editing the copy moved the table');
    const labelled = { ...f, id: 'x', name: 'Labelled', labels: f.links.map((_, i) => (i ? '' : 'first light')) };
    const lc = copyOfFeatured(emptyLibrary(), labelled, at(0));
    must(tracksOf(playlistById(lc.doc, lc.id))[0].label === 'first light', 'a featured label did not reach the copy');
    return `${f.name} copied as ${f.name} (new id), again as ${f.name} 2; the record holds no featured id; the copy edits as any playlist`;
  });
  check('the release lock: every featured link is a frozen row of the link digest (group featured where the grid lacks it), and one that is not is named', () => {
    const file = digestSaved();
    const loose = featuredUnfrozen(file);
    const rows = featuredRows();
    // a digest without one of the featured links names exactly that link
    const one = FEATURED[0].links[0];
    const less = { ...file, rows: file.rows.filter((r) => r.link !== one) };
    must(featuredUnfrozen(less).includes(one), `a digest without ${one} does not name it`);
    must(rows.every((r) => r.group === 'featured' && FEATURED.some((f) => f.links.includes(r.link))), 'a featured row is not a featured link');
    return `${loose.length ? `${loose.length} not yet blessed: ${loose.join(', ')}` : 'every featured link frozen'}; ${rows.length} rows of the featured group beside the grid's`;
  });
  check('tools/feature.ts: a share link becomes an entry (its id, its name, its links as the page writes them, its labels), written over the entry of its id in place, or at a place asked; a new one takes its key from --key, a replaced one keeps its own', () => {
    const link = '?' + L('list=Night+test', 'v=2', 'play=27191-3-em14gl0ve34sp0lo81~6~812-2-ze20ve80', 'names=cool+bells~~', 'id=3f9c2a71e8b44d0c9a1e5b7d2c6f8a90');
    const e = entryOf(`https://example.org/deep-house/${link}`);
    must(e.id === '3f9c2a71-e8b4-4d0c-9a1e-5b7d2c6f8a90' && e.name === 'Night test', `the entry is ${e.id} ${e.name}`);
    must(e.links.length === 3 && e.links.every((l) => normaliseLink(l).link === l) && e.labels?.join('|') === 'cool bells||', `the links ${e.links.join(' ')} labels ${e.labels}`);
    const table = { note: '', playlists: FEATURED.map((f) => ({ ...f })) };
    let keyless = '', twice = '';
    try { withEntry(table, e, { at: 1 }); } catch (err) { keyless = err.message; }
    must(/needs --key/.test(keyless), `a new entry without a key was not refused (${keyless})`);
    try { withEntry(table, e, { key: FEATURED[0].key }); } catch (err) { twice = err.message; }
    must(/another featured playlist has the key/.test(twice), `a key taken was not refused (${twice})`);
    const added = withEntry(table, e, { at: 1, key: 'night' });
    must(added.playlists[0].id === e.id && added.playlists[0].key === 'night' && added.playlists.length === FEATURED.length + 1, 'at 1 is not the first run\'s place, or its key is not night');
    const again = withEntry(added, { ...e, name: 'Night' });
    must(again.playlists.length === added.playlists.length && again.playlists[0].name === 'Night' && again.playlists[0].key === 'night', 'the same id again did not replace its entry in place, keeping its key');
    const over = withEntry(table, e, { replace: FEATURED[1].id });
    must(over.playlists[1].id === FEATURED[1].id && over.playlists[1].key === FEATURED[1].key && over.playlists[1].name === 'Night test' && over.playlists.length === FEATURED.length, '--replace did not keep the entry\'s id, key and place');
    let refused = '';
    try { entryOf('?' + L('list=Bad', 'v=9', 'play=6')); } catch (err) { refused = err.message; }
    must(/does not play/.test(refused), `a track this edition can't play was not refused (${refused})`);
    return 'id, name, links and labels from the link; a new one refused without --key or with a key taken; same id replaced in place, its key kept; --at 1 first; --replace keeps the id and key; an unplayable track refused';
  });
  check('a track\'s Copy link names its Featured playlist only there (round pl-link): alone and from one of yours the plain track link; from a Featured list the link and its in (the list\'s key, featured-address), which opens on that place; a UUID on in opens none', () => {
    const base = 'https://deephouse.audio/';
    const f = FEATURED[1], i = 1, track = `${base}?${f.links[i]}`;
    const alone = trackShareLink(track, undefined), saved = trackShareLink(track, null), mine = trackShareLink(track, 'Mine');
    must(alone === track && saved === track && mine === track, `a track alone or in one of yours copied ${alone} ${saved} ${mine}`);
    const feat = trackShareLink(track, featKey(f.id));
    must(feat === `${track}&in=${f.key}`, `from ${f.name} it copied ${feat}`);
    // his word 10-31: the key, a constant per list; no UUID on `in` names one (nothing was shared with it)
    must(FEATURED.map((x) => x.key).join() === 'vibe,drive,ambient', `the keys are ${FEATURED.map((x) => x.key).join()}`);
    for (const id of [f.id, f.id.replace(/-/g, '')]) must(featuredPlace(`?${f.links[i]}&in=${id}`) === null, `in=${id} opened a playlist`);
    const at = featuredPlace(new URL(feat).search);
    must(!!at && at.featured.id === f.id && at.index === i, `it opens on ${at ? `${at.featured.name} ${at.index + 1}` : 'nothing'}`);
    // the time link carries it too; a sound the list doesn't hold (a bird pulled since) copies none
    const timed = trackShareLink(`${track}&t=83`, featKey(f.id));
    must(new URL(timed).searchParams.get('t') === '83' && featuredPlace(new URL(timed).search)?.index === i, `the time link copied ${timed}`);
    const pulled = `${base}?${L('seed=92970', 'v=2', 'spell=em:0.80')}`;
    must(trackShareLink(pulled, featKey(f.id)) === pulled, 'a sound the list doesn\'t hold was copied with in');
    must(featOf(featKey(f.id)) === f && featOf(null) === undefined && featOf('Mine') === undefined, 'the page\'s featured names do not read');
    return `alone, Saved and Mine: ${track}; ${f.name} ${i + 1}: ${feat}`;
  });
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
    must(one.fileName === 'Sunday bells.deephouse' && back.kind === 'playlist' && JSON.stringify(back.doc.playlists[0]) === JSON.stringify({ ...playlistOf(lib, 'Sunday bells'), rank: undefined, rankEdited: undefined }), 'a playlist file did not read back equal (but its place among yours, pl-order)');
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
    const known = new Set(['id', 'name', 'edited', 'nameEdited', 'rank', 'rankEdited', 'removed', 'into', 'tracks', 'link', 'label', 'saved']);
    const fields = new Set(replaced.playlists.flatMap((p) => [...Object.keys(p), ...(p.tracks ?? []).flatMap((t) => Object.keys(t))]));
    must(!!r.doc && replaced.version === 1 && [...fields].every((f) => known.has(f)), `the replaced record reads ${r.error ?? 'fine'} with fields ${[...fields].join(', ')}`);
    // Keep both and a merge from a backup stay as they were: the merge brings Q and R back from the stale copy
    must(names(mergeLibraries(mergeLibraries(here, backup, at(3)), stale, at(4))) === 'P,Q,R,S', 'a merge from a backup changed');
    return 'after Replace, a stale copy merged either way leaves P (A, the backup\'s label) and S, with Q, R and B gone; the record holds only 2.3.0\'s fields and the places (pl-order); a merge still keeps all four';
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
  // --- the order of your playlists (pl-order, 10-23) ---------------------------
  const order = (d) => inOrder(d).map((p) => p.name).join(',');
  const byId = (d) => new Map(d.playlists.map((p) => [p.id, JSON.stringify(p)]));
  /** the playlists whose entries differ between two copies, by name */
  const touched = (a, b) => { const x = byId(a), y = byId(b); return [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k)).map((k) => JSON.parse(x.get(k) ?? y.get(k)).name).sort().join(','); };
  /** a library made the way 2.3.1 made it: no place on any playlist, the record's order the creation's */
  const unranked = (names, t) => { let d = shipped.emptyLibrary(); for (const n of names) d = shipped.createPlaylist(d, n, t); return d; };
  check('a playlist\'s place is a rank of its own: always room between two, one past the top and the bottom, a new playlist at the top, a file\'s place left behind (pl-order)', () => {
    // a thousand ranks made at random places among the others, then a hundred at the top and the bottom: all in order, all valid
    const ranks = [rankBetween(null, null)];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1000; i++) {
      const k = Math.floor(rnd() * (ranks.length + 1));
      ranks.splice(k, 0, rankBetween(k ? ranks[k - 1] : null, k < ranks.length ? ranks[k] : null));
    }
    for (let i = 0; i < 100; i++) { ranks.unshift(rankBetween(null, ranks[0])); ranks.push(rankBetween(ranks.at(-1), null)); }
    must(ranks.every((r, i) => /^[0-9A-Za-z]*[1-9A-Za-z]$/.test(r) && (!i || ranks[i - 1] < r)), 'the ranks are not in order');
    const longest = Math.max(...ranks.map((r) => r.length));
    must(longest <= 24, `a rank ran to ${longest} digits`);
    let refused = 0;
    for (const [a, b] of [['V', 'V'], ['k', 'V'], ['V0', null], ['', null]]) { try { rankBetween(a, b); } catch (e) { refused++; } }
    must(refused === 4, `${4 - refused} bad pairs were given a rank`);
    // a new playlist, the throne's first Saved, an opened file and a copy kept both: each at the top
    let d = createPlaylist(createPlaylist(emptyLibrary(), 'One', at(0)), 'Two', at(1));
    must(order(d) === 'Two,One', `two new playlists stand ${order(d)}`);
    must(order(saveTrack(emptyLibrary(), A, at(0))) === 'Saved', 'the first save made no Saved');
    const file = readDeephouseFile(writePlaylistFile(movePlaylist(d, playlistOf(d, 'One').id, 0, at(2)), 'One').text).doc;
    must(file.playlists[0].rank === undefined && file.playlists[0].rankEdited === undefined, 'a playlist file carries its place');
    d = createPlaylist(d, 'Three', at(3));
    const opened = openPlaylistFile(d, { ...file, playlists: [{ ...file.playlists[0], id: 'elsewhere', name: 'Four', rank: '0001' }] }, 'add', at(4));
    must(order(opened) === 'Four,Three,Two,One', `an opened file stands ${order(opened)}`);
    const kept = openPlaylistFile(d, file, 'keep-both', at(4));
    must(order(kept).startsWith('One 2,'), `a copy kept both stands ${order(kept)}`);
    // replacing keeps the place of the one it replaces
    const moved = movePlaylist(d, playlistOf(d, 'One').id, 0, at(4));
    const rep = openPlaylistFile(moved, file, 'replace', at(5));
    must(order(rep) === order(moved) && playlistOf(rep, 'One').rank === playlistOf(moved, 'One').rank, `replacing moved it: ${order(moved)} became ${order(rep)}`);
    return `1,201 ranks in order, the longest ${longest} digits, four bad pairs refused; new playlists, a first Saved, an opened file and a copy kept both at the top; a file carries no place and a replace keeps the place`;
  });
  check('a library with no ranks shows as it did; the first move ranks the order seen, every move after it writes the moved playlist alone, and the save menu takes no move for a change (pl-order)', () => {
    const old = unranked(['P', 'Q', 'R', 'S'], at(0));
    must(order(old) === 'P,Q,R,S' && old.playlists.every((p) => p.rank === undefined), `a 2.3.1 library stands ${order(old)}`);
    // a playlist made here in it goes at the top, the rest as they were
    const one = createPlaylist(old, 'N', at(1));
    must(order(one) === 'N,P,Q,R,S', `a new one in a 2.3.1 library: ${order(one)}`);
    // the first move: S to the top; the order seen kept as ranks
    const m1 = movePlaylist(old, playlistOf(old, 'S').id, 0, at(2));
    must(order(m1) === 'S,P,Q,R' && inOrder(m1).every((p) => typeof p.rank === 'string'), `the first move left ${order(m1)}`);
    // then each move writes one entry
    const m2 = movePlaylist(m1, playlistOf(m1, 'P').id, 3, at(3));
    must(order(m2) === 'S,Q,R,P' && touched(m1, m2) === 'P', `P to the bottom left ${order(m2)}, writing ${touched(m1, m2)}`);
    const m3 = movePlaylist(m2, playlistOf(m2, 'R').id, 1, at(4));
    must(order(m3) === 'S,R,Q,P' && touched(m2, m3) === 'R', `R up left ${order(m3)}, writing ${touched(m2, m3)}`);
    // a missing rank among ranked ones (a 2.3.1 device's new playlist): after them, and a move ranks it where it is seen
    const late = shipped.createPlaylist(m3, 'Old', at(5));
    must(order(late) === 'S,R,Q,P,Old', `a 2.3.1 device's new playlist stands ${order(late)}`);
    const m4 = movePlaylist(late, playlistOf(late, 'Q').id, 0, at(6));
    must(order(m4) === 'Q,S,R,P,Old' && touched(late, m4) === 'Old,Q', `Q to the top left ${order(m4)}, writing ${touched(late, m4)}`);
    // two of one rank (two devices' new playlists at once): a move between them spaces them
    const twin = { ...m4, playlists: m4.playlists.map((p) => (p.name === 'R' ? { ...p, rank: playlistOf(m4, 'S').rank } : p)) };
    const tw = inOrder(twin).map((p) => p.name);
    const m5 = movePlaylist(twin, playlistOf(twin, 'P').id, 2, at(7));
    must(order(m5) === [tw[0], tw[1], 'P', ...tw.slice(2).filter((n) => n !== 'P')].join(), `between two of one rank: ${order(m5)}`);
    // a move is not a modification for the throne's menu; a track's move is
    let r = addToPlaylist(addToPlaylist(unranked(['P', 'Q'], at(0)), 'P', A, at(1)), 'Q', B, at(2));
    must(byRecent(r).map((p) => p.name).join() === 'Q,P', 'the save menu before the move');
    r = movePlaylist(r, playlistOf(r, 'P').id, 0, at(3));
    must(byRecent(r).map((p) => p.name).join() === 'Q,P', `after P was moved the save menu reads ${byRecent(r).map((p) => p.name).join()}`);
    // an Undo of the first move: back where they stood, and dated so the other device takes it
    const undone = restore(old, m1, at(8));
    const there = mergeLibraries(m1, undone, at(9)), here = mergeLibraries(undone, m1, at(9));
    must(order(undone) === 'P,Q,R,S' && order(there) === 'P,Q,R,S' && order(here) === 'P,Q,R,S', `the first move undone: ${order(undone)}, merged ${order(here)} here and ${order(there)} there`);
    const undone2 = restore(m2, m3, at(8));
    must(order(mergeLibraries(m3, undone2, at(9))) === order(m2), 'a later move undone did not hold through a merge');
    return 'a 2.3.1 library P,Q,R,S as it was; S to the top ranked the order seen; P down and R up each wrote one entry; a 2.3.1 device\'s new playlist after the ranked; two of one rank spaced; a move left the save menu\'s order; Undo held through a merge';
  });
  check('two devices reordering different playlists both keep their moves, either way round; a move here and a track added there both survive (pl-order)', () => {
    const base = unranked(['P', 'Q', 'R', 'S', 'T'], at(0));
    const synced = movePlaylist(base, playlistOf(base, 'T').id, 0, at(1));   // T,P,Q,R,S on both
    const a = movePlaylist(synced, playlistOf(synced, 'P').id, 4, at(2));    // T,Q,R,S,P
    const b = movePlaylist(synced, playlistOf(synced, 'S').id, 0, at(3));    // S,T,P,Q,R
    const ab = mergeLibraries(a, b, at(4)), ba = mergeLibraries(b, a, at(4));
    must(order(ab) === 'S,T,Q,R,P' && order(ba) === order(ab), `the merged order is ${order(ab)} one way and ${order(ba)} the other`);
    // the same playlist moved on both: the later move wins
    const c = movePlaylist(synced, playlistOf(synced, 'Q').id, 0, at(2)), e = movePlaylist(synced, playlistOf(synced, 'Q').id, 4, at(3));
    must(order(mergeLibraries(c, e, at(4))) === order(e) && order(mergeLibraries(e, c, at(4))) === order(e), 'the later of two moves of one playlist lost');
    // a move here, a track added to the same playlist later there: both survive
    const moved = movePlaylist(synced, playlistOf(synced, 'R').id, 0, at(2));
    const added = addToPlaylist(synced, 'R', A, at(3));
    for (const [where, m] of [['here', mergeLibraries(moved, added, at(4))], ['there', mergeLibraries(added, moved, at(4))]]) {
      must(order(m) === order(moved) && tracksOf(playlistOf(m, 'R')).some((t) => t.link === A), `${where}: ${order(m)}, R holding ${tracksOf(playlistOf(m, 'R')).length} tracks`);
      // dated past both, so a 2.3.1 device takes the merged playlist whole
      must(Date.parse(playlistOf(m, 'R').edited) > Date.parse(playlistOf(added, 'R').edited), `${where}: the merged R is not dated past the edit`);
    }
    return `P down on one device, S up on the other: ${order(ab)} both ways; the later of two moves of Q wins; R moved here and given a track there keeps both, dated past both`;
  });
  check('2.3.1 against a record holding places (pl-order): its reader, its edits and its merge carry rank and rankEdited; its merge takes a move whole; a mixed pair of devices settles with nothing left to send', () => {
    const canon = (d) => JSON.stringify({ ...d, playlists: [...d.playlists].sort((x, y) => String(x.id).localeCompare(String(y.id))) },
      (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
    const places = (d) => d.playlists.filter((p) => p.removed === undefined).map((p) => `${p.name}:${p.rank ?? '-'}:${p.rankEdited ?? '-'}`).sort().join(' ');
    // a record ranked here, as iCloud hands it to the store app
    const old = unranked(['P', 'Q', 'R', 'S'], at(0));
    const ranked = movePlaylist(old, playlistOf(old, 'S').id, 0, at(1));
    const r = shipped.readLibrary(JSON.stringify(ranked));
    must(!!r.doc && places(r.doc) === places(ranked), `2.3.1's reader: ${r.error ?? places(r.doc)}`);
    // its edits keep the places (a track saved, renamed, a label, a track moved, another removed, a playlist made)
    let e = shipped.addToPlaylist(r.doc, 'P', A, at(2));
    e = shipped.renamePlaylist(e, 'Q', 'Q2', at(2));
    e = shipped.setLabel(e, A, 'a label', at(2));
    e = shipped.addToPlaylist(e, 'P', B, at(2));
    e = shipped.moveTrack(e, 'P', 1, 0, at(2));
    e = shipped.removeTrack(e, 'P', A, at(2));
    e = shipped.createPlaylist(e, 'New', at(2));
    const kept = (d) => ['P', 'R', 'S'].every((n) => playlistOf(d, n).rank === playlistOf(ranked, n).rank) && playlistOf(d, 'Q2').rank === playlistOf(ranked, 'Q').rank;
    must(kept(e), `2.3.1's edits left ${places(e)}`);
    must(order(e) === 'S,P,Q2,R,New', `2.3.1's edits read here as ${order(e)}`);
    // its merge, both ways: the store app (an older copy, no places) meets the cloud's ranked one
    for (const [what, m] of [['here first', shipped.mergeLibraries(old, ranked, at(3))], ['the cloud first', shipped.mergeLibraries(ranked, old, at(3))]]) must(places(m) === places(ranked), `2.3.1's merge, ${what}: ${places(m)}`);
    // and a later move of a ranked playlist (its rank alone changes) against the store app's copy of the order before
    for (const [n, to] of [['P', 3], ['Q', 0], ['R', 0], ['S', 2]]) {
      const later = movePlaylist(ranked, playlistOf(ranked, n).id, to, at(3));
      for (const m of [shipped.mergeLibraries(ranked, later, at(4)), shipped.mergeLibraries(later, ranked, at(4))]) must(places(m) === places(later), `2.3.1's merge lost ${n}'s move: ${places(m)}`);
    }
    // a backup it writes, read here
    const back = readDeephouseFile(shipped.writeBackupFile(e, {}, at(4)).text);
    must(order(back.doc) === order(e), `2.3.1's backup reads here as ${order(back.doc)}`);
    // the two devices, by turns through the cloud as the shell does (merge what came, send it where it differs),
    // with a move here and an edit of the same playlist later on 2.3.1, made before either heard the other
    const devices = {
      now: { doc: movePlaylist(ranked, playlistOf(ranked, 'R').id, 0, at(5)), merge: mergeLibraries },
      old: { doc: shipped.addToPlaylist(ranked, 'R', C, at(6)), merge: shipped.mergeLibraries },
    };
    let cloud = ranked, writes = 0, quiet = 0, turn = 0;
    for (; turn < 40 && quiet < 4; turn++) {
      const d = devices[turn % 2 ? 'old' : 'now'];
      const merged = d.merge(d.doc, cloud, at(7) + turn * 1000);
      d.doc = merged;
      if (canon(merged) !== canon(cloud)) { cloud = merged; writes++; quiet = 0; } else quiet++;
    }
    must(quiet >= 4, `the two devices were still sending after ${turn} turns (${writes} writes)`);
    must(order(devices.now.doc) === 'R,S,P,Q' && order(devices.old.doc) === 'R,S,P,Q', `they settled on ${order(devices.now.doc)} here and ${order(devices.old.doc)} on 2.3.1`);
    must(tracksOf(playlistOf(devices.old.doc, 'R')).some((t) => t.link === C) && tracksOf(playlistOf(devices.now.doc, 'R')).some((t) => t.link === C), 'the 2.3.1 edit was lost');
    // a playlist file 2.3.1 writes from it carries its place; opened here, the place is left behind
    const file = readDeephouseFile(shipped.writePlaylistFile(ranked, 'S').text).doc;
    must(file.playlists[0].rank !== undefined, 'the 2.3.1 playlist file carries no place');
    must(order(openPlaylistFile(old, { ...file, playlists: [{ ...file.playlists[0], id: 'x', name: 'Y' }] }, 'add', at(8))) === 'Y,P,Q,R,S', 'a 2.3.1 file\'s place was taken');
    return `2.3.1 reads, edits (seven kinds), merges both ways (a first and a later move) and backs up a ranked record with every place kept; a move here and a later edit there settled in ${writes} writes on R,S,P,Q with the edit kept`;
  });
  check('a track moved in its playlist comes back by Undo through a merge (pl-order: every reorder has Undo)', () => {
    const d = addToPlaylist(addToPlaylist(addToPlaylist(createPlaylist(emptyLibrary(), 'P', at(0)), 'P', A, at(0)), 'P', B, at(0)), 'P', C, at(0));
    const m = moveTrack(d, 'P', 0, 2, at(1));
    const u = restore(d, m, at(1));
    const links = (x) => tracksOf(playlistOf(x, 'P')).map((t) => t.link).join();
    must(links(mergeLibraries(m, u, at(2))) === [A, B, C].join() && links(mergeLibraries(u, m, at(2))) === [A, B, C].join(), 'the order undone did not hold');
    return 'A,B,C moved to B,C,A and undone in the same second: A,B,C after a merge either way';
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
    // (trance-1: Trance's own spell measured; trance-drawn's third pass, his word 11-04: its two neighbours are its dots)
    const lit = SKY_PLACES.filter((p) => p.lit).map((p) => p.name);
    must(lit.join() === 'Deep House,Tech House,Techno,Ambient,Downtempo,Trip Hop,Dark Ambient,Ambient Dub,Drone,Psybient,Bells,Waves,Bowls,Om,Field,Liquid,Dub Techno,Chillstep,Trance,Breaks & Big Beat', `the lit stars are ${lit.join(', ')}`);
    return `${pin.length} positions pinned, genres ${pin.map((p) => p[3]).join(', ')}, the house ${colourOf(A)}; ${lit.length} lit stars, Drone by Ambient, Chillstep by Dub Techno`;
  });
  check('a track\'s genre is the star whose place it plays (genres-by-music, 10-29): every lit star reads itself, and the featured tracks read their words', () => {
    // the words the rule gives (genres-by-music), in each playlist's order: Ambient 7, inside the bells' zone, Bells and no
    // longer Trip Hop (his word 10-28); Drive 1 the Breaks place's tables; Drive 4 and 7 the trance and the dub techno
    // places they play; Drive 3 the tech house tables under a saw hook; Vibe 6 the slow place's harmony over the drone's floor
    const WORDS = {
      Vibe: ['Deep House', 'Liquid', 'Deep House', 'Drone', 'Deep House', 'Drone', 'Deep House', 'Downtempo', 'Liquid', 'Ambient Dub', 'Ambient Dub', 'Chillstep'],
      // Drive 4 (Tailwind) reads Trance since the dark trance place became one of Trance's dots (trance-drawn's third pass)
      Drive: ['Breaks & Big Beat', 'Tech House', 'Tech House', 'Trance', 'Chillstep', 'Chillstep', 'Dub Techno', 'Deep House'],
      // Ambient 1 (Moon Tide) Psybient since the Map's Om and Field (ambient-field, 10-31: any new lit star in the family
      // shares the votes of the rows it plays, and Psybient's sea row stood 0.08 over Dark Ambient's); his word pending
      Ambient: ['Psybient', 'Waves', 'Drone', 'Waves', 'Dark Ambient', 'Bells', 'Bells', 'Drone', 'Downtempo', 'Waves', 'Waves'],
    };
    const lit = SKY_PLACES.filter((p) => p.lit);
    for (const p of lit) must(genreOfSpell(p.spell) === p, `the ${p.name} star reads ${genreOfSpell(p.spell).name}`);
    let n = 0;
    for (const f of FEATURED) {
      const want = WORDS[f.name];
      must(!!want && want.length === f.links.length, `${f.name}: ${f.links.length} tracks, ${want?.length ?? 0} words pinned`);
      f.links.forEach((link, i) => { n++; must(genreOf(link).name === want[i], `${f.name} ${i + 1} (${f.labels?.[i] ?? link}) reads ${genreOf(link).name}, pinned ${want[i]}`); });
    }
    return `${lit.length} lit stars read themselves; ${n} featured tracks read their words`;
  });
  check('the sky\'s dots (his idea 10-28): four round every lit star, frozen; each its star\'s genre and place, a steering bird or two off it, clear of the stars, the open rings and the other dots, and playing other than its star', () => {
    // **frozen** (round sky-dots): each dot as the birds it moves off its star. A dot must not move between releases;
    // a star added later (the trance round's) gets its own four by the same rules and is checked below, not here; the
    // Trance star's four of round 1 left with its tuning (trance-1: its spell moved from its rows' region to its own)
    const FROZEN = [
      ['house/deep-house#1', 'lo:0.28'],
      ['house/deep-house#2', 'ro:0.85,gl:0.22'],
      ['house/deep-house#3', 'ti:0.32,gl:0.58'],
      ['house/deep-house#4', 'gl:0.11'],
      ['house/tech-house#1', 'ze:0.74'],
      ['house/tech-house#2', 'ro:0.90'],
      ['house/tech-house#3', 'ti:0.69,ro:0.44'],
      ['house/tech-house#4', 'ze:0.34,lo:0.40'],
      ['techno#1', 'ti:0.68,ro:0.89'],
      ['techno#2', 'ti:0.69,gl:0.06'],
      ['techno#3', 'ti:0.41,ro:0.28'],
      ['techno#4', 'ze:0.25'],
      ['ambient-and-downtempo/ambient#1', 'lo:0.51'],
      ['ambient-and-downtempo/ambient#2', 'ze:0.70,ro:0.25'],
      ['ambient-and-downtempo/ambient#3', 'lo:0.68'],
      ['ambient-and-downtempo/ambient#4', 'ro:0.32,lo:0.48'],
      ['ambient-and-downtempo/downtempo#1', 'ze:0.18,ro:0.39'],
      ['ambient-and-downtempo/downtempo#2', 'ro:0.30,gl:0.53'],
      ['ambient-and-downtempo/downtempo#3', 'ze:0.60,lo:0.44'],
      ['ambient-and-downtempo/downtempo#4', 'ze:0.19'],
      ['ambient-and-downtempo/trip-hop#1', 'ro:0.66,gl:0.35'],
      ['ambient-and-downtempo/trip-hop#2', 'ze:0.60'],
      ['ambient-and-downtempo/trip-hop#3', 'ti:0.39'],
      ['ambient-and-downtempo/trip-hop#4', 'ti:0.40,gl:0.01'],
      // trance (trance-drawn's third pass, 11-04): its stream's four settled as they stood, and its two old neighbours
      ['trance#1', 'ze:0.37'],
      ['trance#2', 'lo:0.52'],
      ['trance#3', 'gl:0.93,lo:0.66'],
      ['trance#4', 'gl:0.85,ro:0.88'],
      ['trance#5', 'em:0.86,ti:0.50,ze:0.45,ro:0.72,gl:0.18,ve:0.66,sp:0.43,lo:0.72'],
      ['trance#6', 'em:0.82,ti:0.78,ze:0.72,ro:0.55,gl:0.92,ve:0.45,sp:0.33,lo:0.92'],
      ['ambient-and-downtempo/dark-ambient#1', 'ti:0.98,gl:0.64'],
      ['ambient-and-downtempo/dark-ambient#2', 'ze:0.23'],
      ['ambient-and-downtempo/dark-ambient#3', 'ze:0.20,lo:0.37'],
      ['ambient-and-downtempo/dark-ambient#4', 'gl:0.67'],
      ['ambient-and-downtempo/ambient-dub#1', 'ze:0.46'],
      ['ambient-and-downtempo/ambient-dub#2', 'ze:0.45,lo:0.70'],
      ['ambient-and-downtempo/ambient-dub#3', 'gl:0.51'],
      ['ambient-and-downtempo/ambient-dub#4', 'ti:0.83'],
      ['ambient-and-downtempo/drone#1', 'ti:0.83,lo:0.54'],
      ['ambient-and-downtempo/drone#2', 'gl:0.29,lo:0.95'],
      ['ambient-and-downtempo/drone#3', 'ze:0.54,gl:0.27'],
      ['ambient-and-downtempo/drone#4', 'ro:0.93'],
      ['ambient-and-downtempo/psybient#1', 'ti:0.63'],
      ['ambient-and-downtempo/psybient#2', 'lo:0.97'],
      ['ambient-and-downtempo/psybient#3', 'gl:0.50,lo:0.56'],
      ['ambient-and-downtempo/psybient#4', 'ze:0.87,lo:0.46'],
      ['ambient-and-downtempo/bells#1', 'ro:0.42,gl:0.59'],
      ['ambient-and-downtempo/bells#2', 'gl:0.94,lo:0.74'],
      ['ambient-and-downtempo/bells#3', 'ti:0.46,gl:0.59'],
      ['ambient-and-downtempo/bells#4', 'ro:0.39,lo:0.59'],
      ['ambient-and-downtempo/waves#1', 'ze:0.48,lo:0.78'],
      ['ambient-and-downtempo/waves#2', 'ze:0.99'],
      ['ambient-and-downtempo/waves#3', 'gl:0.24,lo:0.69'],
      ['ambient-and-downtempo/waves#4', 'ro:0.81,lo:0.65'],
      ['ambient-and-downtempo/bowls#1', 'ti:0.79,gl:0.54'],
      ['ambient-and-downtempo/bowls#2', 'ti:0.77,ro:0.54'],
      ['ambient-and-downtempo/bowls#3', 'ti:0.70,ro:0.70'],
      ['ambient-and-downtempo/bowls#4', 'ro:0.54,gl:0.57'],
      ['ambient-and-downtempo/om#1', 'ti:0.78,gl:0.44'],
      ['ambient-and-downtempo/om#2', 'ti:0.67,ze:0.22'],
      ['ambient-and-downtempo/om#3', 'gl:0.57'],
      ['ambient-and-downtempo/om#4', 'ti:0.64'],
      ['ambient-and-downtempo/field#1', 'ti:0.60'],
      ['ambient-and-downtempo/field#2', 'ti:0.90'],
      ['ambient-and-downtempo/field#3', 'ro:0.23'],
      ['ambient-and-downtempo/field#4', 'ze:0.59,gl:0.32'],
      ['dnb-and-dub/liquid#1', 'ti:0.21'],
      ['dnb-and-dub/liquid#2', 'ze:0.36'],
      ['dnb-and-dub/liquid#3', 'ro:0.59'],
      ['dnb-and-dub/liquid#4', 'gl:0.59'],
      ['dnb-and-dub/dub-techno#1', 'ze:0.38,gl:0.52'],
      ['dnb-and-dub/dub-techno#2', 'gl:0.15'],
      ['dnb-and-dub/dub-techno#3', 'ze:0.53,ro:0.67'],
      ['dnb-and-dub/dub-techno#4', 'ze:0.08,gl:0.22'],
      ['dnb-and-dub/chillstep#1', 'ti:0.73,gl:0.20'],
      ['dnb-and-dub/chillstep#2', 'ro:0.98,lo:0.57'],
      ['dnb-and-dub/chillstep#3', 'ti:0.71,gl:0.62'],
      ['dnb-and-dub/chillstep#4', 'ro:0.66,lo:0.53'],
      ['breaks-and-big-beat#1', 'ti:0.30,ro:0.45'],
      ['breaks-and-big-beat#2', 'ro:0.43,gl:0.15'],
      ['breaks-and-big-beat#3', 'ti:0.25,lo:0.38'],
      ['breaks-and-big-beat#4', 'ze:0.47,ro:0.95'],
    ];
    const SHORT = { em: 'ember', ti: 'tide', ze: 'zephyr', ro: 'root', gl: 'gleam', ve: 'veil', sp: 'spark', lo: 'loom' };
    const lit = SKY_PLACES.filter((p) => p.lit);
    const star = (id) => lit.find((p) => p.id === id);
    const v = (s, b) => s[b] ?? HOUSE[b];
    let frozen = 0;
    for (const [id, moved] of FROZEN) {
      const st = star(id.replace(/#\d$/, ''));
      if (!st) continue;
      const want = { ...st.spell, ...Object.fromEntries(moved.split(',').map((x) => x.split(':')).map(([b, n]) => [SHORT[b], +n])) };
      const got = SKY_DOTS.find((d) => d.id === id);
      must(!!got, `the dot ${id} is gone`);
      must(BIRDS.every((b) => Math.abs(v(got.spell, b) - v(want, b)) < 1e-9), `the dot ${id} moved: ${JSON.stringify(got.spell)}, frozen ${JSON.stringify(want)}`);
      frozen++;
    }
    // the rules, read here again from the composer's own tables, for every dot (a new star's too)
    const P = STRATEGIES['house-v2'].style.places;
    // a sub-section entry's top-form list (round top-form) plays only inside its tempo window: outside it, it is inert and no other place
    const inert = (l, row, bpm) => l === 'subSections' && row?.rates?.top && !(bpm >= TOP_FORM.tempo.bpm[0] && bpm <= TOP_FORM.tempo.bpm[1])
      ? { ...row, rates: Object.fromEntries(Object.entries(row.rates).filter(([k]) => k !== 'top')) } : row;
    const reading = (s) => { const f = asSpell({ ...HOUSE, ...s }); const z = zoneOf(P, f); const bpm = derive(f).tempoCentre; return [z?.id ?? '-', ...PLACE_LANES.map((l) => rowOf(inert(l, readPlace(P, l, f, bpm, z), bpm)))].join('|'); };
    // what plays: the first theme of seeds 1 and 2 (one seed alone can draw the same at two spells: a bird the dice of that
    // theme do not read)
    const hash = (spell) => ['1', '2'].map((seed) => JSON.stringify(programOf(planTheme(seed, 0, { strategy: 'house-v2', spell })).events)).join('\n');
    let near = Infinity, nearDot = Infinity, nearRing = Infinity;
    const rings = SKY_REGIONS.flatMap((r) => r.rings);
    for (const st of lit) {
      const ds = SKY_DOTS.filter((d) => d.star === st.id);
      // (a star with neighbour places of its own, `NEAR_PLACES`, has a dot on each beside its four: trance-drawn's third pass)
      const nearPlaces = NEAR_PLACES[st.id] ?? [];
      must(ds.length === DOTS_PER_STAR + nearPlaces.length, `${st.name} has ${ds.length} dots`);
      const own = reading(st.spell), heard = hash(asSpell({ ...HOUSE, ...st.spell }));
      for (const d of ds) {
        const moved = BIRDS.filter((b) => Math.abs(v(d.spell, b) - v(st.spell, b)) > 1e-9);
        // a dot on a neighbour place of its star's family stands at that place's own spell, address birds and all, and
        // plays that place; every other dot steers inside its star's place
        const onNear = nearStarOf(d.spell) === st.id;
        if (!onNear) must(moved.length >= 1 && moved.length <= 2 && moved.every((b) => STEER_BIRDS.includes(b)), `${d.id} moves ${moved.join(', ')}`);
        must(moved.every((b) => Math.abs(v(d.spell, b) * 100 - Math.round(v(d.spell, b) * 100)) < 1e-6), `${d.id} is not on a link's two decimals`);
        must(genreOfSpell(d.spell) === st, `${d.id} reads ${genreOfSpell(d.spell).name}`);
        if (!onNear) must(reading(d.spell) === own, `${d.id} plays another place than ${st.name}`);
        must(hash(asSpell({ ...HOUSE, ...d.spell })) !== heard, `${d.id} plays seeds 1 and 2 exactly as ${st.name} does`);
        // one settled dot stands under a star tuned after it (Waves 3 by Dark Ambient, 0.011: his word 10-28 kept both, the
        // dot exactly as round 1 made it and the star at its approved spell); it shows from the zoom that parts them
        for (const o of lit) if (!(d.id === 'ambient-and-downtempo/waves#3' && o.name === 'Dark Ambient')) near = Math.min(near, Math.hypot(o.point.x - d.point.x, o.point.y - d.point.y));
        for (const o of SKY_DOTS) if (o !== d) nearDot = Math.min(nearDot, Math.hypot(o.point.x - d.point.x, o.point.y - d.point.y));
        for (const g of rings) nearRing = Math.min(nearRing, Math.hypot(g.at.x - d.point.x, g.at.y - d.point.y));
      }
    }
    must(near >= 0.03 - 1e-9 && nearDot >= 0.024 - 1e-9 && nearRing >= 0.028 - 1e-9, `a dot stands ${near.toFixed(3)} from a star, ${nearDot.toFixed(3)} from another dot, ${nearRing.toFixed(3)} from an open ring`);
    return `${SKY_DOTS.length} dots round ${lit.length} lit stars, ${frozen} as frozen; every one its star's genre and place, another program than its star's on seed 1 or 2; the nearest ${near.toFixed(3)} from a star, ${nearDot.toFixed(3)} from a dot and ${nearRing.toFixed(3)} from an open ring`;
  });
}

// --- a playlist's clock (round pl-clock) --------------------------------------
export function clockChecks(check, must) {
  check('a playlist\'s tempo: each track folded by 1, 2 or 4 to the list\'s centre, the mean in log tempo of those within 8 %, an outlier left out and never dragging it, the same in any order (round pl-clock)', () => {
    const said = [];
    const near = (a, b, why) => must(a != null && Math.abs(a - b) <= 0.05 + 1e-9, `${why}: ${a} where ${b}`);
    // a Drum & Bass list with a 50 BPM track: the centre is the list's, the 50 an outlier (folded to 200, 15 % off)
    const dnb = [174, 172, 175, 170, 174, 50];
    const L1 = listTempo(dnb);
    const mean = (xs) => Math.round(Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) * 10) / 10;
    near(L1, mean([174, 172, 175, 170, 174]), 'the Drum & Bass list');
    must(listPull(50, L1) === null, `the 50 BPM track is pulled to ${listPull(50, L1)}`);
    must(listPull(170, L1) === L1 && listPull(175, L1) === L1, 'a Drum & Bass track is not pulled');
    said.push(`DnB ${L1} (50 left out)`);
    // a house list with a half-time track: the 61 folds to 122 and plays at half the list's
    const house = [122, 124, 121, 61, 123];
    const L2 = listTempo(house);
    near(L2, mean([122, 124, 121, 122, 123]), 'the house list with a half-time track');
    must(Math.abs(listPull(61, L2) - L2 / 2) < 1e-9, `the half-time track plays at ${listPull(61, L2)}, not half of ${L2}`);
    said.push(`house ${L2} (61 at ${listPull(61, L2)})`);
    // a list mostly at half time: the centre is where most of its tracks are without a fold
    const L3 = listTempo([87, 86, 88, 174, 172]);
    must(L3 > 80 && L3 < 95, `the half-time list's tempo is ${L3}`);
    must(Math.abs(listPull(174, L3) - 2 * L3) < 1e-9, 'a double-time track does not play at twice the list\'s');
    said.push(`half-time ${L3}`);
    // two camps: the larger wins, the other plays at its own
    const L4 = listTempo([104, 105, 103, 104, 126, 128]);
    near(L4, mean([104, 105, 103, 104]), 'two camps');
    must(listPull(126, L4) === null && listPull(128, L4) === null, 'the smaller camp is pulled');
    said.push(`camps ${L4}`);
    // stable for the list: every order and a few shuffles
    for (const xs of [dnb, house, [104, 105, 103, 104, 126, 128]]) {
      const want = listTempo(xs);
      for (let k = 0; k < 24; k++) {
        const ys = xs.slice();
        for (let i = ys.length - 1; i > 0; i--) { const j = (i * 7 + k * 13) % (i + 1); [ys[i], ys[j]] = [ys[j], ys[i]]; }
        must(listTempo(ys) === want, `${ys} reads ${listTempo(ys)}, not ${want}`);
      }
    }
    // nothing to read: no list; one track: its own
    must(listTempo([]) === null && listTempo([118.3]) === 118.3, 'an empty or a one-track list');
    // the pull's edge: 8 % either way, folded
    must(listPull(120 * 1.079, 120) === 120 && listPull(120 * 1.081, 120) === null && listPull(120 / 1.079, 120) === 120, 'the pull is not 8 %');
    must(foldTo(50, 174).fold === 4 && LIST_PULL === 0.08, 'the fold');
    return said.join('; ');
  });

  check('a track\'s tempo read from its dice (tempoOf) is the tempo its plan plays (timeOf), on the featured playlists and the link digest\'s track rows, at a fraction of a plan\'s cost (round pl-clock)', () => {
    const links = [...new Set([...FEATURED.flatMap((f) => featuredTracks(f).map((t) => t.link)), ...digestSaved().rows.filter((r) => !r.themes).map((r) => r.link)])];
    let n = 0, cheap = 0, dear = 0, skipped = 0;
    for (const link of links) {
      if (!normaliseLink(link).ok) continue;
      let t0 = performance.now();
      const fast = tempoOf(link);
      cheap += performance.now() - t0;
      t0 = performance.now();
      const slow = timeOf(link);
      dear += performance.now() - t0;
      // (a link whose plan throws here — a mode this edition plans only as a page — has no time to read against)
      if (!slow) { skipped++; continue; }
      must(fast && !fast.free && fast.bpm === slow.bpm, `${link}: the dice say ${fast?.bpm}, the plan ${slow.bpm}`);
      n++;
    }
    must(n > 100, `only ${n} links read`);
    must(cheap < dear / 5, `the dice cost ${cheap.toFixed(0)} ms against the plans' ${dear.toFixed(0)}`);
    return `${n} links the same (${skipped} with no plan here), the dice ${cheap.toFixed(0)} ms, the plans ${dear.toFixed(0)} ms`;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let failed = 0;
  const check = (name, fn) => {
    try { console.log(`ok    ${name}: ${fn()}`); } catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message}`); }
  };
  playlistChecks(check, (cond, why) => { if (!cond) throw new Error(why); });
  clockChecks(check, (cond, why) => { if (!cond) throw new Error(why); });
  if (failed) process.exit(1);
}
