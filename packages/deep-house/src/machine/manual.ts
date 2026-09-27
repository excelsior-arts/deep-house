// The manual's words, as data, and the two rules that read them: which entry
// explains a box, and how a `{name}` is filled from the box as it reads now.
// Plain TypeScript and JSON, so the check reads the same rules the view does.

import MANUAL from './manual.json' with { type: 'json' };
import type { MachineNode } from './model.ts';

export interface Entry {
  title: string;
  text: string[];
  v1?: string;
  v2?: string;
  ring?: string;
  aside?: string;
}
export const ENTRIES = (MANUAL as unknown as { entries: Record<string, Entry> }).entries;

/**
 * **The desk's keys that have pages** (M8): the popovers' M, S, sends off,
 * reset, the level and lean faders with their − and +, and the room.
 */
export const KEY_PAGES = ['key:mute', 'key:solo', 'key:dry', 'key:reset', 'key:level', 'key:lean', 'key:room'] as const;

/** The families a source frame knows by an entry of its own. */
const FAMILIES = ['drum', 'noise', 'bass', 'keyboard', 'ensemble', 'vocal', 'effect'];

/**
 * **Which entry explains a box.** A source by the family of the instrument on
 * it, an insert as an insert, every other box by its own id — which is the
 * description's own name for it and does not move.
 */
export function manualKey(node: MachineNode, family: string | null = null): string {
  if (node.stage === 'sources') return `lane:${family && FAMILIES.includes(family) ? family : 'other'}`;
  if (node.stage === 'inserts') return 'insert';
  return node.id;
}

/** `{label}`, `{made}`, `{note}`, `{instrument}` and `{r:<reading>}`, from the box as it reads now. */
export function fill(text: string, node: MachineNode, instrument = ''): string {
  return text.replace(/\{([a-z:A-Z]+)\}/g, (_, k: string) => {
    if (k === 'label') return node.label;
    if (k === 'made') return node.made;
    if (k === 'note') return node.note || '—';
    if (k === 'instrument') return instrument || 'nothing this theme';
    if (k.startsWith('r:')) {
      const r = node.readings.find((x) => x.name === k.slice(2));
      return r && r.value !== null && r.value !== '' ? String(r.value) : '—';
    }
    return `{${k}}`;
  });
}


/**
 * **A box's readings, said** (M4, Eugene on *"now: events 4 of 1 brightnessHz
 * 1100 hz hold 0.712 ratio"*): each reading as a person would read it — a name
 * in words, a number rounded as it is heard, the unit as it is written — and
 * the ones that mean nothing to a listener (how many candidates a lane has)
 * left out.
 */
const UNIT: Record<string, string> = { hz: ' Hz', db: ' dB', ms: ' ms', s: ' s', ch: ' channels', x: ':1', ratio: '', '': '' };
const WORDS: Record<string, string> = {
  freq: 'frequency', gr: 'gain reduction', thr: 'threshold', os: 'oversampling', rate: 'sample rate',
  buffer: 'buffer', out: 'output latency', return: 'return', plate: 'plate', echo: 'echo', ceiling: 'ceiling',
};
const words = (name: string) => WORDS[name] ?? name
  .replace(/(Hz|Db|Ms|Sec|S)$/, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase();
const num = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(2)));
export function said(node: MachineNode): string {
  const out: string[] = [];
  for (const r of node.readings) {
    if (r.value === null || r.value === '') continue;
    if (r.name === 'of') continue;
    if (r.name === 'events') { out.push(`${r.value} event${r.value === 1 ? '' : 's'} this bar`); continue; }
    if (r.name === 'voices') { out.push(`${r.value} instrument${r.value === 1 ? '' : 's'} on it`); continue; }
    if (r.value === true) { out.push(r.name === 'mute' ? 'muted' : r.name === 'solo' ? 'soloed' : r.name === 'dry' ? 'sends off' : r.name); continue; }
    if (r.name === 'lean') { out.push(`leant ${+r.value > 0 ? '+' : ''}${r.value} dB over the room`); continue; }
    if (r.name === 'curve') { out.push(`a ${r.value}-point curve`); continue; }
    if (r.name === 'ch') { out.push(`${r.value} channel${r.value === 1 ? '' : 's'}`); continue; }
    const unit = UNIT[r.unit ?? ''] ?? '';
    out.push(`${words(r.name)} ${typeof r.value === 'number' ? num(r.value) : r.value}${unit}`);
  }
  return out.join('; ');
}
