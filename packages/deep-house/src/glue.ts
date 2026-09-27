// **The glue's noises belong to a bright, driving theme** — house-v2's
// `glueGates`, round S14. Eugene on `?seed=26925&v=2&theme=4` (the house), its
// break at bar 113: *"the use of the FX wind, despite being polished, is not
// justified. That sound would suit higher-frequency synths and stones on loud
// open-hat drums; here we have very low-key deep house with a darker piano,
// closed hats and a slower pace, and out of the blue this 'shooeh' wind in and
// out of the break — it just doesn't belong."*
//
// So the noise glue — the falling sweep, the riser, the swell, the rising
// sweep and the crash: every glue voice that is noise (`GLUE_SHAPES`, and any
// fx voice whose own family is noise and which is not a held bed) — asks two
// gates before the section does, as S1's swells and S2's sweeps do:
//
//   **The spell** admits a driving or a fast kick (Ember's techno and drum and
//     bass families), a broken beat (Spark's `broken` band) or a lifted light
//     (Gleam's `lifted` band); it refuses the slow side (drums off or a free
//     pulse) and a held light under a steady kick (Gleam's `held` band); in
//     between — the house — it says nothing, and the cast decides.
//   **The cast** admits bright synths on bright drums, both, from what the
//     dice drew and what each instrument measures alone: the keys the theme
//     plays (not its texture part) read 0.45 or over on the per-layer
//     brightness table (Zephyr, the instrument rendered alone: a saw lead
//     0.49, a bright piano 0.52, a pulse lead 0.56 — a piano 0.33, a rhodes
//     and vibes 0.24), *and* the drums are bright: the hat the closed lane
//     plays centres at 6 kHz or over (`HAT_CENTROID_HZ`: the tight hat and
//     the sizzle), or open hats are a quarter of the hat notes, or the kit is
//     broken.
//
// A theme the gates refuse has no noise glue at all. Its breaks keep their
// dynamics from what plays: S2's filter breath and low-pass close, S1's swell,
// the fills, and the impact (a sine, not a noise) and the vinyl bed where the
// dice drew them. When the percussion recipes are fixed, a riser built of the
// parts is the follow-up. No die is drawn and no note moves.

import { TIMBRES, GLUE_SHAPES } from '@deep-house/engine/voices';
import type { Style } from '@deep-house/engine/style';
import { derive, asSpell } from './spell.ts';
import type { Spell } from './spell.ts';
import { bandAt } from './bird-labels.ts';

/** How bright a keys instrument must read alone (the per-layer Zephyr) to count as a bright synth. */
export const BRIGHT_KEYS = 0.45;
/** Where a closed hat's centre must sit to count as bright. */
export const BRIGHT_HAT_HZ = 6000;
/** The share of the hat notes open hats must be for the drums to count as open. */
export const OPEN_SHARE = 0.25;

type Ev = { layer: string; voice: string; role?: string; p: Record<string, any> };

/** Whether an fx voice is a noise the rule governs. */
export const isNoiseGlue = (voice: string): boolean =>
  voice in GLUE_SHAPES || (TIMBRES[voice]?.family === 'noise' && (TIMBRES[voice]?.hold ?? 1) < 1);

const word = (bird: 'spark' | 'gleam', spell: Partial<Spell> | null | undefined, style: Style): string | null => {
  try { return bandAt(bird, spell, style)?.word ?? null; } catch { return null; }
};

export interface GlueVerdict { spell: 'admit' | 'refuse' | 'neutral'; cast: 'admit' | 'refuse'; keep: boolean; why: string }

export function glueVerdict(input: { style: Style; spell: Partial<Spell> | null | undefined; events: Ev[]; kit?: string;
  brightness: Record<string, number>; hatCentroid: Record<string, number> }): GlueVerdict {
  const { style, spell, events, kit, brightness, hatCentroid } = input;
  const d = derive(asSpell(spell));
  const gleam = word('gleam', spell, style), spark = word('spark', spell, style);
  const why: string[] = [];
  let sv: GlueVerdict['spell'] = 'neutral';
  if (d.drumsOn && (d.tempoFamily === 'techno' || d.tempoFamily === 'drumAndBass')) { sv = 'admit'; why.push(`Ember: ${d.tempoFamily}`); }
  else if (spark === 'broken') { sv = 'admit'; why.push('Spark: broken'); }
  else if (gleam === 'lifted') { sv = 'admit'; why.push('Gleam: lifted'); }
  else if (!d.drumsOn || d.tempoFamily === 'unmetered') { sv = 'refuse'; why.push('Ember: no drums or a free pulse'); }
  else if (gleam === 'held') { sv = 'refuse'; why.push('Gleam: held under a steady kick'); }
  // the cast
  const keys = [...new Set(events.filter((e) => e.layer === 'keys' && e.role !== 'texture').map((e) => e.p.timbre ?? e.p.preset ?? e.voice))];
  const brightKeys = keys.filter((k) => (brightness[k] ?? 0) >= BRIGHT_KEYS);
  const hats = events.filter((e) => e.layer === 'hats');
  const count: Record<string, number> = {};
  for (const e of hats) count[e.voice] = (count[e.voice] ?? 0) + 1;
  const closed = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const open = hats.filter((e) => e.voice === 'hatOpen').length / Math.max(1, hats.length);
  const brightHat = !!closed && (hatCentroid[closed] ?? 0) >= BRIGHT_HAT_HZ;
  const brightDrums = brightHat || open >= OPEN_SHARE || kit === 'breaks';
  const cast: GlueVerdict['cast'] = brightKeys.length && brightDrums ? 'admit' : 'refuse';
  why.push(`keys ${keys.join('+') || 'none'}${brightKeys.length ? ' (bright)' : ' (dark)'}, hat ${closed ?? 'none'}${brightDrums ? ' (bright)' : ' (dark)'}`);
  const keep = sv === 'admit' || (sv === 'neutral' && cast === 'admit');
  return { spell: sv, cast, keep, why: why.join('; ') };
}
