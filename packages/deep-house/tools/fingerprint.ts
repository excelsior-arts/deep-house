// fingerprint.ts — what a track is, written down so a similar one can be found
// again after the composer has moved (Eugene, 09-26).
//
//   nice -n 18 node tools/fingerprint.ts '<link>' --site tmp/like/site [--port 7331] [--out <file>] [--wav <file>]
//   nice -n 18 node tools/fingerprint.ts '?seed=27191&spell=ember:0.14,gleam:0.00,veil:0.34,spark:0.00,loom:0.81&theme=3' --site tmp/like/site
//
// A link in (a coordinate: seed, theme, engine, spell), a JSON file out, by
// default `tools/fixtures/like/<seed>-t<theme>[-<spell hash>].json` (the theme
// counted from one, as the link counts it; the hash is the first six of the
// spell's SHA-1 where the link has a spell). The site is a scratch build of the
// working tree (`npx vite build --outDir tmp/like/site` in this package), never
// `docs/`.
//
// What is in it, and which terms outlive the engine (`like/features.ts` says
// how each is measured):
//
// - `music` — **structural**: bpm, bars, seconds, tonic and mode, drums on or
//   off, the form (each section kind's share of the bars, the intro and outro
//   lengths, the bars of silence before the first note), and per role (kick,
//   hats, backbeat, percussion, bass, pad, keys, texture, fx) the share of bars
//   it sounds in, notes per sounding bar, pitch (median, low, high), the
//   median hold in beats and the median onset spacing in bars (the pad's chord
//   rhythm, the texture's interval).
// - `audio` — **structural**: the whole theme rendered offline through the real
//   graph and master at 48 kHz (24-bar windows, four bars of pre-roll each):
//   third-octave LTAS (the median of eight-bar blocks, dB re 40 Hz-10 kHz),
//   integrated LUFS, LUFS by section kind, the sub's share (thirds to 100 Hz),
//   and the texture role's level under the bass role (each rendered alone), in
//   LU; `audio.window` is the same over the 32 bars `find-like.ts --render`
//   compares (the loudness window: the first long main past bar 16), and the
//   whole theme's WAV hash (the WAV itself goes to `--wav`, default
//   `tmp/like/<name>.wav`, never into git).
// - `engine` — **engine-bound**: the strategy id, the voices per role, the
//   room and a set of dice (timbres, masks, voicing, scene, progression). Read
//   by the distance only when the candidate carries the same strategy id.
// - `taken` — the link as the page writes it, the build (commit) and the date.
//
// **A fingerprint is taken on the build it was written on.** Its `music` and
// `audio` should still rank candidates after the composer changes, with the
// audio as the final judge; but where the change is to the benchmark's own
// sound, re-take the fingerprint on the build that still plays it (before the
// genres phase: the one in the fixtures was taken on `local`'s tip of 09-26).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveSite, openPage, wav, ROOT } from './imprint/render.ts';
import { SCHEMA, RATE, coordinateOf, linkOf, planOf, musicOf, engineOf, renderBars, channelsOf, audioOf, lufsByKind, underLU, keysOfRole, windowAudio, sha256 } from './like/features.ts';
import { spellQuery } from '../src/spell.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const link = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
if (!link) { console.error('usage: node tools/fingerprint.ts <link> --site <scratch build> [--port 7331] [--out <file>] [--wav <file>]'); process.exit(2); }

const c = coordinateOf(link);
const q = c.spell ? spellQuery(c.spell) : null;
const name = `${c.seed}-t${c.theme + 1}${q ? `-${crypto.createHash('sha1').update(q).digest('hex').slice(0, 6)}` : ''}`;
const OUT = path.resolve(arg('out', path.join(HERE, 'fixtures', 'like', `${name}.json`)));
const WAV = path.resolve(ROOT, arg('wav', path.join('tmp', 'like', `${name}.wav`)));
const build = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })();

const { track, program } = planOf(c);
const music = musicOf(track, program);
const engine = engineOf(c, track, program);
console.log(`  ${linkOf(c)}: ${music.bars} bars at ${music.bpm} BPM, ${music.drums ? 'drums' : 'no drums'}, roles ${Object.keys(music.roles).join(' ')}`);

const server = await serveSite(+arg('port', 7331), arg('site', 'tmp/like/site'));
const br = await openPage(+arg('port', 7331));
try {
  const began = Date.now();
  const pcm = await renderBars(br.page, c, 0, track.bars);
  const mix = channelsOf(pcm);
  fs.mkdirSync(path.dirname(WAV), { recursive: true });
  fs.writeFileSync(WAV, wav(pcm, RATE));
  console.log(`  the whole theme in ${((Date.now() - began) / 1000).toFixed(0)} s`);
  const solo = async (role) => { const keep = keysOfRole(program, role); return keep.length ? channelsOf(await renderBars(br.page, c, 0, track.bars, { keep })) : null; };
  const tex = await solo('texture'), bass = await solo('bass');
  const audio = {
    ...audioOf(mix, program.barSeconds),
    lufsByKind: lufsByKind(mix, track, program.barSeconds),
    textureUnderBassLU: tex && bass ? underLU(tex, bass) : null,
    wavSha256: sha256(pcm),
    window: await windowAudio(br.page, c, track, program),
  };
  const fp = {
    schema: SCHEMA,
    kind: 'fingerprint',
    taken: { link: linkOf(c), build, date: new Date().toISOString().slice(0, 10), note: 'music and audio are structural; engine is read only between like engines (tools/like/features.ts)' },
    music, audio, engine,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(fp, null, 1) + '\n');
  console.log(`  wrote ${path.relative(ROOT, OUT)}; the WAV ${path.relative(ROOT, WAV)} (sha256 ${audio.wavSha256.slice(0, 12)}…)`);
} finally {
  await br.close(); server.close();
}
