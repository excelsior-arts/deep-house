// The sound rows, for the gates that write what they measure.
//
// A declared number is written by the gate that measures it and never typed
// (every round of the kitchen's rule). Where the sound is a row
// (`src/voices/sound.ts`), the number goes into the row's JSON and not into a
// module: `rowFile` finds the row by its id — the file is `<family>/<id>.json`
// under `sounds/` — and `updateRow` reads it, lets the gate change one field,
// and writes it back in the shape it was in.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sounds');

/** The row's file, or null where the sound is a module. */
export function rowFile(id: string): string | null {
  if (!fs.existsSync(SOUNDS)) return null;
  for (const family of fs.readdirSync(SOUNDS, { withFileTypes: true })) {
    if (!family.isDirectory()) continue;
    const file = path.join(SOUNDS, family.name, `${id}.json`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Read the row, let `mutate` change it, write it back; false where there is no row. */
export function updateRow(id: string, mutate: (row: any) => void): boolean {
  const file = rowFile(id);
  if (!file) return false;
  const row = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(row);
  fs.writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`);
  return true;
}
