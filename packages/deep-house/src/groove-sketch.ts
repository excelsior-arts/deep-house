// **A groove that reads as uplifting** (pass 2 of trance-drawn, a sketch for his A/B; his ear 11-04 on an Uplifting
// Trance theme: *"strange and quirky, a bit out of our app mood, but worth having"*, the mix *"a bit off … I can't even
// understand what style of drums it is"*). Measured on that theme's first main against a theme he liked (the Hard Trance
// tile's sung line): its kick 1.4 dB hotter, its hats 3.8 dB hotter (two hat lanes: a tight hat on every odd sixteenth and
// a loose one on the off-beats, a shaker on every "e"), its backbeat a rimshot 3 dB under the other's clap: busy on top,
// no clear two and four.
//
// The sketch keeps the theme (its tempo, its front, its bed, its bass, its kick) and rewrites only the kit's top:
//   - the off-beat hat opened (the loose hat on the off-beats becomes the open hat);
//   - the backbeat a clap on two and four where it was a rimshot, at the level the other theme's clap stands;
//   - the sixteenths quieter (the tight hat 9 dB down) and the shaker on the "e" 6 dB down;
//   - the kick 1.5 dB down (the level fix the meter asks for).
// A private-tier switch (`groove=uplifting`), read by `readBypass` in a dev or preview build only; a release reads nothing.

import type { PlanEvent, Track } from './generator.ts';

export type GrooveAsk = 'uplifting';
export const readGroove = (raw: string | null): GrooveAsk | null => (raw === 'uplifting' ? raw : null);

const db = (x: number) => 10 ** (x / 20);
/** the levels, dB, against the theme's own */
const LEVEL = { tight: -9, shaker: -6, kick: -1.5, clapOverRim: -10.3 } as const;

export function grooveSketch<T extends Track>(track: T, ask: GrooveAsk | null): T {
  if (ask !== 'uplifting') return track;
  const gain = (e: PlanEvent, d: number) => ({ ...e, p: { ...e.p, gain: +((Number(e.p?.gain ?? 1)) * db(d)).toFixed(4) } }) as PlanEvent;
  track.events = track.events.map((e) => {
    if (e.layer === 'hats' && e.voice === 'hatLoose') return { ...e, voice: 'hatOpen', p: { ...e.p, gain: +(Number(e.p?.gain ?? 1) * 0.8).toFixed(4) } } as PlanEvent;
    if (e.layer === 'hats' && e.voice === 'hatTight' && (e.step ?? 0) % 2 === 1) return gain(e, LEVEL.tight);
    if (e.layer === 'shaker') return gain(e, LEVEL.shaker);
    if (e.layer === 'kick') return gain(e, LEVEL.kick);
    // the rimshot's gain is set for a rim's small body; a clap at the same written level stands well over it
    if (e.layer === 'clap' && e.voice === 'rimshot') return { ...gain(e, LEVEL.clapOverRim), voice: 'clap' } as PlanEvent;
    return e;
  });
  return track;
}
