// The voice table. A voice is (ctx, out, time, params) and knows nothing
// about scheduling, so the same function serves the live context and the
// offline render.

import { kick } from './kick.js';
import { hatClosed, hatOpen, shaker, prepareHats } from './hats.js';
import { clap } from './clap.js';
import { sub } from './bass.js';
import { keys, KEYS_TIMBRES } from './keys.js';
import { STRINGS_TIMBRES } from './strings.js';
import { pad } from './pad.js';
import { piano, preparePiano, pianoCacheStats, PIANO_TIMBRES } from './piano.js';
import { riser, sweepDown, swell, impact } from './fx.js';

// Anything a voice wants rendered before its first note. The offline renders
// await it; the live mix awaits the hats and lets the piano's strings arrive
// while the intro plays. `events` is the list the strings are read off.
export function prepareVoices(ctx, events = null, opts = {}) {
  const hats = prepareHats(ctx);
  if (!events) return hats;
  // `opts` reaches the piano's cache: `{ all: true }` for an offline render,
  // which has the whole timeline and no deadline, and `{ from }` for the live
  // mix, which prewarms a window round where it is about to play rather than
  // a whole theme it cannot hold.
  return Promise.all([hats, preparePiano(ctx, events, opts)]).then(() => undefined);
}

export { pianoCacheStats };

// What the harmonic families say about themselves: the registry the voices
// fill, rather than a table somebody keeps in step by hand. Each entry carries
// `family`, `struck`, `hold` (the fraction of the note still sounding at the
// bar line), `brightnessHz` (its own filter corner) and `loudnessDb` (MEASURED:
// the family alone in an eight-bar main groove, less the level its room gave
// it — tools/loudness-fit.mjs --timbres).
//
// This is what keeps the per-theme loudness trim from naming instruments. The
// fit sums these over whatever is sounding, so a family written tomorrow needs
// its module and its own four numbers and no new coefficient anywhere.
export const TIMBRES = { ...KEYS_TIMBRES, ...STRINGS_TIMBRES, ...PIANO_TIMBRES };

// Which entry of the level table a harmonic role is played at: the role is one
// name and the voices behind it are three, and the piano has a level of its
// own.
export function levelKeyOfRole(role, timbre) {
  if (role === 'pad') return 'pad';
  return timbre === 'piano' ? 'piano' : 'keys';
}

export const VOICES = {
  kick,
  hatClosed,
  hatOpen,
  shaker,
  clap,
  sub,
  keys,
  pad,
  piano,
  riser,
  sweepDown,
  swell,
  impact,
};

// Which bus each voice lands on.
export const VOICE_BUS = {
  kick: 'kick',
  hatClosed: 'drums',
  hatOpen: 'drums',
  shaker: 'drums',
  clap: 'drums',
  sub: 'sub',
  keys: 'keys',
  pad: 'melodic',
  piano: 'melodic',
  riser: 'melodic',
  sweepDown: 'melodic',
  swell: 'melodic',
  impact: 'melodic',
};

// Which level in params.js each voice is trimmed to.
export const VOICE_LEVEL = {
  kick: 'kick',
  hatClosed: 'hatClosed',
  hatOpen: 'hatOpen',
  shaker: 'shaker',
  clap: 'clap',
  sub: 'sub',
  keys: 'keys',
  pad: 'pad',
  piano: 'piano',
  riser: 'fx',
  sweepDown: 'fx',
  swell: 'fx',
  impact: 'fx',
};

export default VOICES;
