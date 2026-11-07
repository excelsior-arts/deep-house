// trance-drawn (11-04, pass 2): the lock on his two picks. For each link, the draw (front, voice, colours, bed) and a hash
// of every event (the plan's own events, every field), so a change that moves them shows.
//   node tools/trance-drawn-lock.ts [--json]
import crypto from 'node:crypto';
import { recipesFor, planTheme } from '../packages/deep-house/src/mix.ts';
import { linkRead } from '../packages/deep-house/src/link.ts';
const HARD = 'em:0.86,ti:0.50,ze:0.45,ro:0.72,gl:0.18,ve:0.66,sp:0.43,lo:0.72';
// The lock as his ear left it: pass 2's hashes; the fourth pass (his word 11-04: "it's fine to move my hit, if it's just
// length of segments") moved 82459 by section lengths alone (the drop 16 → 32, the intro 12 → 16; the draw, the voices
// and the material the same), and the merge of local moved 32093's keys lane by local's break rule. The merge pass (his
// word 11-05: "for trance use 3:31") takes the drop's phrase from the 48-bar main instead (main 48 → 32), so 82459 keeps
// its length but for the intro's four bars: 124 bars where pass 4 had 140.
const EXPECT: Record<string, string> = { '82459': '67332be41176dc92', '32093': 'def9b7d2a646ab41' };
const LINKS = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const links = LINKS.length ? LINKS : [`seed=82459&v=2&spell=${HARD}`, `seed=32093&v=2&spell=${HARD}`];
for (const q of links) {
  const read = linkRead(`?${q}`); const L = read.link;
  const cast = recipesFor({ masterSeed: L.seed, strategy: L.strategy, search: `?${read.search}` });
  const t = planTheme(L.seed, L.theme, { preset: 'auto', strategy: L.strategy, spell: cast.spell, recipe: cast.track, accompaniment: L.accompaniment, development: L.development } as never) as any;
  const all = crypto.createHash('sha256').update(JSON.stringify(t.events)).digest('hex').slice(0, 16);
  const byLayer: Record<string, string> = {};
  for (const l of [...new Set(t.events.map((e: any) => e.layer))].sort() as string[]) byLayer[l] = crypto.createHash('sha256').update(JSON.stringify(t.events.filter((e: any) => e.layer === l))).digest('hex').slice(0, 8);
  const want = EXPECT[String(L.seed)];
  console.log(q.split('&')[0], JSON.stringify(t.tranceDrawn), `events ${t.events.length} hash ${all}`, JSON.stringify(byLayer), want ? (want === all ? 'LOCK HOLDS' : `LOCK MOVED (was ${want})`) : '');
}
