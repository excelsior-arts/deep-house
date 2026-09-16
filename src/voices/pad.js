// The sustained role, in four timbres. The role is one voice name so the
// arrangement, the lane meters and the solo-stem renders do not have to know
// which instrument is holding the chord this time; `p.timbre` decides that.
//
//   strings — the default and MEASURED the biggest sustained family (31% of
//             52 tracks): a fast-attack chord held long and drowned in reverb.
//   swell   — the same body with the slow attack put back. The study's 4%
//             "synth swell": a garnish, not a staple.
//   organ   — drawbars, which hold flatter through the bar than anything else.
//             About one theme in ten.
//   rhodes  — a tine held rather than struck. The study's 8% "keys blend".

import { strings } from './strings.js';
import { keys } from './keys.js';

export function pad(ctx, out, time, p = {}) {
  const timbre = p.timbre || 'strings';
  if (timbre === 'strings' || timbre === 'swell') return strings(ctx, out, time, p);
  return keys(ctx, out, time, { ...p, preset: timbre, sustain: true });
}

export default pad;
