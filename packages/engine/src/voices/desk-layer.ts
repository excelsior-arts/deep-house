// The desk's layer over the rows: the numbers a hand has moved, per page.
//
// PLAN-DESK D1 (10-04). The desk's setters act on the contract field — the
// unit of the desk is the field, its declared range the setter's range — and
// every topology reads its numbers through one door, `patchOf` in `sound.ts`.
// So the layer is here, under that door, and nowhere else: a table of
// `{ [voice]: { [path]: number } }` (`cutoffHz`, `clip.drive`, `ratios.bell`)
// and a version that counts its moves. `sound.ts` reads it at the note;
// `device.ts` writes it, clamped to the field, and is what the desk calls.
//
// **It is the page's, never the plan's.** Nothing here reaches a program, a
// settings value, a link or a lock: a voice with nothing moved is handed the
// very object it was handed before the desk existed, and a voice with a move is
// handed a copy of it. It imports nothing, so the door can read it without a
// cycle through the registry.

const layer = new Map<string, Map<string, number>>();
let version = 0;

/** What the desk has moved on this voice, by path; `undefined` where nothing is. */
export const movedOf = (voice: string): ReadonlyMap<string, number> | undefined => layer.get(voice);

/** Every voice with a move, and its moves: a copy, for a reading. */
export function movedAll(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [voice, paths] of layer) out[voice] = Object.fromEntries(paths);
  return out;
}

/** How many times the layer has changed: a patch built over it is good for one version. */
export const layerVersion = (): number => version;

/** Put one number on the layer, or take it off with `null`. Clamping is the caller's (`setDeviceParam`). True when it changed. */
export function putMove(voice: string, path: string, value: number | null): boolean {
  const had = layer.get(voice);
  if (value === null) {
    if (!had || !had.has(path)) return false;
    had.delete(path);
    if (!had.size) layer.delete(voice);
  } else {
    if (had && had.get(path) === value) return false;
    if (had) had.set(path, value); else layer.set(voice, new Map([[path, value]]));
  }
  version++;
  return true;
}

/** Take one voice's moves off, or every voice's. True when anything was on. */
export function clearMoves(voice?: string): boolean {
  const any = voice === undefined ? layer.size > 0 : layer.has(voice);
  if (!any) return false;
  if (voice === undefined) layer.clear(); else layer.delete(voice);
  version++;
  return true;
}

/** A path as its steps: `clip.drive` → clip, drive; `partials[1].level` → partials, 1, level. */
export function stepsOf(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const part of path.split('.')) {
    const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!m) return [];
    out.push(m[1]);
    for (const i of m[2].matchAll(/\[(\d+)\]/g)) out.push(Number(i[1]));
  }
  return out;
}
