// piano-pool round 2 (11-01), scratch: a spec for tools/piano-pool-notes.ts measuring how long each grand rings (with
// tools/piano-pool-ring.py): `grid`, plain held keys; `notes`, a part's own notes (a JSON list of note parameters), its touch
// played on each grand. Both through the house room (seed 40's, where the pool draws the house piano).
//   node tools/piano-pool-ring-spec.ts <spec.json> grid|notes [notes.json]
// the ring of each grand: held keys through the house room (Pure Gold's, the house piano's), and Sunrise's own chord
// notes with their touch played on each grand (touchOnGrand)
import fs from 'node:fs';
const W = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { pianoVoicing, touchOnGrand } = await import(`${W}/packages/deep-house/src/piano-pool.ts`);
const { played } = await import(`${W}/packages/deep-house/tools/link-digest.ts`);
const { programOf } = await import(`${W}/packages/deep-house/src/performance.ts`);
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const link = 'seed=40&v=2';
const room = (programOf(quiet(() => played(link)).plan) as any).settings.piano;
const G = ['pianoClose', 'pianoUpright', 'pianoMute', 'pianoFelt', 'pianoConcert'];
const mode = process.argv[3] === 'grid' ? 'grid' : 'notes';
const hold = 12;
let notes: any[] = [];
if (mode === 'grid') {
  for (const vel of [0.35, 0.65]) for (const midi of [48, 55, 60, 64, 67, 72, 76, 79]) notes.push({ midi, vel, dur: hold, ring: 0 });
} else {
  // Sunrise's chord notes as local writes them for the house piano (one note per distinct midi/dur), held as written
  const local = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  notes = local.map((q: any) => ({ ...q }));
}
const renders = [{ name: 'piano', voice: 'piano' }, ...G.map((g) => { const v = pianoVoicing(g, room); return { name: g, voice: 'piano', piano: v, notes: notes.map((n) => touchOnGrand(n, room, v)) }; })];
fs.writeFileSync(process.argv[2], JSON.stringify({ rate: 32000, window: mode === 'grid' ? hold : 12, link, again: true, notes, renders }));
