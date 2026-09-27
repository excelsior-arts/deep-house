// The private tier: `.releaseignore` lists the prefixes that are tracked on
// `local` for the private origin and never reach the public repository — the
// notes, the mining tooling. One .gitignore serves both tiers; this is the
// second, tighter list. The release applies it and the audit mirrors it, and
// both read it here: it was the same three lines in each until round (f) of
// the reconciled review of 09-24 (D45).
import fs from 'node:fs';
import path from 'node:path';

/** The prefixes `.releaseignore` names under `root`, blank lines and comments left out. */
export function privateTier(root) {
  const file = path.join(root, '.releaseignore');
  return fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
}

/** Whether a path is in that tier. */
export const inTier = (prefixes, p) => prefixes.some((pre) => p.startsWith(pre));
