// **The zones' borrowed rows** (PLAN-ZONES §3.1): for every lane a zone does not write, the row that lane read at the
// zone's centre before the zone (`nearestEntry` over the whole table, the zone's own entries among them), at every
// tempo the box can draw, written out by value into `src/styles/zones-borrowed.json`. No live coupling: a later change
// to the place a row came from reaches the zone only by the zone's own round. And held (the review of 10-18, M4): with
// no flag this exits 1 wherever a written row is not today's read, and `tools/check-zones.ts` holds the same.
//
//   node tools/zones.ts                     each zone's borrowed lanes against today's read at its centre; exit 1 on a drift
//   node tools/zones.ts --freeze            write today's reads (a zone's own round, never a reflex); a kept lane keeps its row
//   node tools/zones.ts --keep zone/lane    keep that lane's written row against today's read, held by its digest; only
//                                           a row as committed (a hand edit since HEAD is refused)
//   node tools/zones.ts --unkeep zone/lane  drop the keep (then --freeze adopts today's read)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { places } from '../src/styles/deep-house-places.ts';
import { PLACE_LANES, type PlaceEntry } from '../src/places.ts';
import { borrowLines, borrowedOf, digestOf, temposOf, type BorrowedFile } from './zones-borrow.ts';

const FILE = fileURLToPath(new URL('../src/styles/zones-borrowed.json', import.meta.url));
const FREEZE = process.argv.includes('--freeze');
const flag = (k: string) => process.argv.flatMap((a, i) => (a === k && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const saved = JSON.parse(fs.readFileSync(FILE, 'utf8')) as BorrowedFile;
const kept: NonNullable<BorrowedFile['kept']> = JSON.parse(JSON.stringify(saved.kept ?? {}));
const NOTE = 'Written by tools/zones.ts --freeze (PLAN-ZONES §3.1): for every lane a zone does not write, the entry that lane read at the zone\'s centre before the zone, whole and by value (its place too, which its own leans read), or null for the house\'s own. Held to that read by node tools/zones.ts and tools/check-zones.ts: a source that moves fails until the zone\'s own round adopts it (--freeze) or keeps it (--keep zone/lane, listed under kept with the kept row\'s digest, so a hand edit still fails).';
const write = (zones: BorrowedFile['zones']) => {
  const k = Object.fromEntries(Object.entries(kept).filter(([, v]) => Object.keys(v).length));
  fs.writeFileSync(FILE, JSON.stringify({ note: NOTE, zones, ...(Object.keys(k).length ? { kept: k } : {}) }, null, 1) + '\n');
  console.log(`written: ${FILE}`);
};

/** The file as the last commit has it, or null where it has none. */
const REL = 'src/styles/zones-borrowed.json';
const committed = (): BorrowedFile | null => {
  try { return JSON.parse(execFileSync('git', ['show', `HEAD:./${REL}`], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as BorrowedFile; } catch { return null; }
};

const keeps = flag('--keep'), unkeeps = flag('--unkeep');
if (keeps.length || unkeeps.length) {
  for (const zl of unkeeps) { const [z, lane] = zl.split('/'); if (kept[z]) delete kept[z][lane]; }
  for (const zl of keeps) {
    const [z, lane] = zl.split('/');
    if (!saved.zones[z] || !Object.hasOwn(saved.zones[z], lane)) { console.error(`${zl}: no such borrowed lane`); process.exit(1); }
    // only a row that shipped is kept: a row edited by hand since the last commit is refused, so a hand edit is never
    // blessed by its own digest and has to be committed first, where the file's diff shows it (the review of 10-19)
    const was = committed();
    if (!was || !Object.hasOwn(was.zones[z] ?? {}, lane) || JSON.stringify(was.zones[z][lane] ?? null) !== JSON.stringify(saved.zones[z][lane] ?? null)) {
      console.error(`${zl}: the written row differs from the committed file's (git show HEAD:${REL}); a keep holds only a row that shipped, so commit the edit first (or --freeze to adopt today's read)`);
      process.exit(1);
    }
    (kept[z] ??= {})[lane] = digestOf(saved.zones[z][lane]);
  }
  write(saved.zones);
  process.exit(0);
}

if (FREEZE) {
  const out: BorrowedFile['zones'] = {}, faults: string[] = [];
  for (const z of places.zones ?? []) {
    out[z.id] = {};
    for (const lane of PLACE_LANES) {
      if (z.rows[lane] !== undefined) continue;
      if (kept[z.id]?.[lane] !== undefined) { out[z.id][lane] = saved.zones[z.id][lane] ?? null; continue; }
      const got = borrowedOf(places, z, lane);
      if ('fault' in got) faults.push(got.fault);
      else out[z.id][lane] = got.entry as PlaceEntry | null;
    }
    for (const lane of Object.keys(kept[z.id] ?? {})) if (z.rows[lane as keyof typeof z.rows] !== undefined) delete kept[z.id][lane];
  }
  if (faults.length) { console.error(faults.join('\n')); process.exit(1); }
  write(out);
  process.exit(0);
}

const lines = borrowLines(places, saved.kept);
for (const z of places.zones ?? []) {
  const mine = lines.filter((l) => l.zone === z.id);
  console.log(`${z.id}: ${Object.keys(z.rows).length} rows of its own, ${Object.keys(z.borrow).length} borrowed at its centre (${temposOf(z)[0]}-${temposOf(z).at(-1)} BPM)`);
  for (const l of mine) console.log(`  ${l.lane}: ${l.written?.id ?? 'the house'}${l.kept ? ` (kept, ${l.kept})` : ''}${l.fault ? `  <- ${l.fault}` : ''}`);
}
const bad = lines.filter((l) => l.fault);
if (bad.length) { console.error(`${bad.length} borrowed lane${bad.length > 1 ? 's' : ''} not held:\n${bad.map((l) => l.fault).join('\n')}`); process.exit(1); }
console.log('every borrowed row is today\'s read at its zone\'s centre, or kept by its digest');
