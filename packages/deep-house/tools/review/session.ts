// The review session: the contract, the gate, and the two writes.
//
// A **session manifest** is the whole of this tool's configuration. Everything
// the page shows and everything the server writes is in one file, so a new
// scenario — variants of a recipe, an approval round, a WAV round trip — is a
// new manifest and not a new tool. The contract is written out in
// `tools/review/README.md` and enforced by `validateSession` below.
//
// Two things are written when a decision is made, and never anything else:
//
//   1. the decision goes into the manifest's own `state`, immediately and
//      atomically, so a refresh (or a crash) continues where he left off;
//   2. when the item names a recipe `row`, the row gets the chef's score and a
//      verdict in his words — the two fields `PLAN-RECIPES` says no tool may
//      derive, carried the way `recipe-from-mark.ts` carries them.
//
// Nothing else in a row is touched: it is read, two keys are set, and it is
// written back with every other field as it was.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The repository, which is what every path in a manifest is relative to. */
export const ROOT = path.join(HERE, '..', '..', '..', '..');

/** The manifest format. Bumped only when a field's meaning changes. */
export const SCHEMA = 1;

/** The chef's scale, which is `src/recipe.ts`'s and the bench's. */
export const CHEF_MIN = -3;
export const CHEF_MAX = 3;

/** How a row is written when an item names one. */
export type RowWrite = 'score+verdict' | 'verdict' | 'none';
export const ROW_WRITES: readonly RowWrite[] = ['score+verdict', 'verdict', 'none'];

/** What a field asks for: one of a few, any of a few, or words. */
export type FieldKind = 'choice' | 'multi' | 'note';
export const FIELD_KINDS: readonly FieldKind[] = ['choice', 'multi', 'note'];

/**
 * One of the buttons a session offers, and the key that presses it. `score` is
 * what lands in the manifest, `chef` overrides it for the row when the two
 * should differ, `verdict` is the word written onto the row, and `pending`
 * marks the skip.
 */
export interface SessionAction {
  id: string;
  label: string;
  key: string;
  score: number;
  chef?: number;
  pending?: boolean;
  verdict?: string;
}

/** One answer a field offers, and the one letter that gives it. */
export interface FieldOption {
  id: string;
  label: string;
  key: string;
}

/**
 * One question of a form. A `note` field has no options, which is why they are
 * optional here and why the gate asks for them everywhere else.
 */
export interface SessionField {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: FieldOption[];
}

/**
 * What a manifest says about the music an item is. It is **free**: whatever a
 * builder puts here is shown as the card's compact table, in the order it is
 * written. The named fields are the few the tool itself reads when it writes a
 * verdict, because a verdict points at a piece of music.
 */
export interface ItemMeta {
  seed?: string | number;
  masterSeed?: string | number;
  theme?: number;
  bar?: number;
  fromBar?: number;
  /** the window, either as a count of bars or as "88+16" */
  bars?: number | string;
  rate?: number;
  /**
   * **The approval identity** (M2 of the mining review, 09-19): which strategy planned the
   * music, which build rendered it and what the audio's own bytes hash to. A
   * decision migrates across a rebuild only onto an item whose identity is the
   * same; an item that carries none is carried by provenance alone and the
   * rebuild says so.
   */
  strategy?: string;
  build?: string;
  audioHash?: string;
  [key: string]: unknown;
}

/** One thing to listen to, and what a decision about it points at. */
export interface SessionItem {
  id: string;
  title: string;
  subtitle?: string;
  /** relative to the repository */
  wav: string;
  /** optional: the A/B on the card */
  source?: string;
  /** optional: the recipe row this item scores */
  row?: string;
  meta?: ItemMeta;
  /** what a builder's own grouping calls it; the tool only ever shows it */
  kind?: string;
}

/**
 * One item's answer: a decision, a form's answers, or both — and when it was
 * given, which is what the page orders the reviewed ones by.
 */
export interface StateEntry {
  action?: string;
  score?: number;
  fields?: Record<string, string | string[]>;
  note?: string;
  at: string;
}

/** Where a built manifest came from, for whoever reads it in a year. */
export interface SessionSource {
  tool: string;
  from: string[];
  at: string;
  note: string;
}

/**
 * **The manifest**: the whole of a review scenario in one file, which is both
 * the configuration and the state. A session says what an answer is with
 * `actions`, with `fields`, or with both, and `state` is what has been said so
 * far, keyed by item id.
 */
export interface Session {
  schema: number;
  id: string;
  title: string;
  kind: string;
  rowWrite?: RowWrite;
  items: SessionItem[];
  actions?: SessionAction[];
  fields?: SessionField[];
  state?: Record<string, StateEntry>;
  source?: SessionSource;
  /**
   * Decisions an earlier build of this session made about music that has
   * since changed under the same seed and bars — kept as context, keyed by the
   * item they would have been about, and never counted as that item's answer.
   */
  superseded?: Record<string, Superseded>;
}

/** An earlier answer about other audio, and what the two audios were. */
export interface Superseded {
  entry: StateEntry;
  was: MusicIdentity;
  now: MusicIdentity;
}

/** The three fields that say which audio a decision was about. */
export interface MusicIdentity {
  strategy?: string;
  build?: string;
  audioHash?: string;
}

/**
 * A bag of fields nothing has checked yet. The gate below is handed whatever
 * was in a file, so every value it reads is `unknown` until one of its own
 * lines says otherwise, and this is the shape it reads them out of.
 */
type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWord = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * A path a manifest may name: inside the repository, and said the way the rest
 * of `notes/` says one — relative, forward slashes, no climbing out.
 */
export function pathIsSane(p: unknown): p is string {
  if (typeof p !== 'string' || !p.trim()) return false;
  if (path.isAbsolute(p) || p.startsWith('/') || p.includes('\\')) return false;
  return !path.normalize(p).split('/').includes('..');
}

/** A manifest path, resolved against the repository. */
export const resolveIn = (p: string): string => path.join(ROOT, p);

/**
 * The gate. Returns the faults it found, as sentences, in the order it found
 * them; an empty list is a valid manifest. It is the same shape of answer
 * `src/recipe.ts`'s `validate` gives, for the same reason: a tool wants the
 * list and a person wants the first line of it.
 */
export function validateSession(session: unknown): string[] {
  const bad: string[] = [];
  const say = (m: string): number => bad.push(m);
  if (!isObject(session)) return ['not an object'];

  if (session.schema !== SCHEMA) say(`schema is ${JSON.stringify(session.schema)}, not ${SCHEMA}`);
  if (!isWord(session.id)) say('id is missing');
  else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(session.id)) say(`id ${JSON.stringify(session.id)} is not a plain name`);
  if (!isWord(session.title)) say('title is missing');
  if (!isWord(session.kind)) say('kind is missing');
  if (session.rowWrite !== undefined && !ROW_WRITES.includes(session.rowWrite as RowWrite)) {
    say(`rowWrite ${JSON.stringify(session.rowWrite)} is not one of ${ROW_WRITES.join(', ')}`);
  }

  // --- the actions ---
  //
  // A session says what an answer is in one of two ways, and it may say both.
  // **Actions** are one decision out of a few — the cookbook's pick, keep and
  // drop — and **fields** are a form: several questions, each with its own small
  // set of answers, which is what an audition wants, because *"does it sound
  // like what it is called"* and *"is it clean"* are not two ends of one scale.
  const actionIds = new Set<string>();
  const keys = new Set<string>();
  const hasActions = Array.isArray(session.actions) && session.actions.length > 0;
  const hasFields = Array.isArray(session.fields) && session.fields.length > 0;
  if (!hasActions && !hasFields) say('neither actions nor fields: there is no way to answer');
  if (session.actions !== undefined && !Array.isArray(session.actions)) say('actions is not a list');
  else if (hasActions) {
    for (const [i, a] of (session.actions as unknown[]).entries()) {
      const at = `actions[${i}]`;
      if (!isObject(a)) { say(`${at} is not an object`); continue; }
      if (!isWord(a.id)) say(`${at}.id is missing`);
      else if (actionIds.has(a.id)) say(`${at}.id ${JSON.stringify(a.id)} is used twice`);
      else actionIds.add(a.id);
      if (!isWord(a.label)) say(`${at}.label is missing`);
      if (typeof a.key !== 'string' || a.key.length !== 1) say(`${at}.key is not one character`);
      else if (keys.has(a.key.toLowerCase())) say(`${at}.key ${JSON.stringify(a.key)} is used twice`);
      else keys.add(a.key.toLowerCase());
      if (!Number.isFinite(a.score)) say(`${at}.score is not a number`);
      if (a.chef !== undefined && !(Number.isFinite(a.chef) && (a.chef as number) >= CHEF_MIN && (a.chef as number) <= CHEF_MAX)) {
        say(`${at}.chef is not a number in ${CHEF_MIN}..${CHEF_MAX}`);
      }
      if (a.pending !== undefined && typeof a.pending !== 'boolean') say(`${at}.pending is not true or false`);
      if (a.verdict !== undefined && !isWord(a.verdict)) say(`${at}.verdict is not a word`);
    }
    if (!(session.actions as unknown[]).some((a) => a && !(a as Loose).pending)) say('every action leaves the item pending, so nothing can be decided');
  }

  // --- the fields ---
  const fieldIds = new Set<string>();
  const optionsOf = new Map<string, Set<string> | null>();
  if (session.fields !== undefined) {
    if (!Array.isArray(session.fields)) say('fields is not a list');
    else {
      for (const [i, f] of (session.fields as unknown[]).entries()) {
        const at = `fields[${i}]`;
        if (!isObject(f)) { say(`${at} is not an object`); continue; }
        if (!isWord(f.id)) say(`${at}.id is missing`);
        else if (fieldIds.has(f.id)) say(`${at}.id ${JSON.stringify(f.id)} is used twice`);
        else fieldIds.add(f.id);
        if (!isWord(f.label)) say(`${at}.label is missing`);
        if (!FIELD_KINDS.includes(f.kind as FieldKind)) say(`${at}.kind ${JSON.stringify(f.kind)} is not one of ${FIELD_KINDS.join(', ')}`);
        if (f.required !== undefined && typeof f.required !== 'boolean') say(`${at}.required is not true or false`);
        if (f.kind === 'note') { optionsOf.set(f.id as string, null); continue; }
        const ids = new Set<string>();
        if (!Array.isArray(f.options) || !f.options.length) { say(`${at}.options is missing`); continue; }
        for (const [j, o] of (f.options as unknown[]).entries()) {
          const ot = `${at}.options[${j}]`;
          if (!isObject(o)) { say(`${ot} is not an object`); continue; }
          if (!isWord(o.id)) say(`${ot}.id is missing`);
          else if (ids.has(o.id)) say(`${ot}.id ${JSON.stringify(o.id)} is used twice`);
          else ids.add(o.id);
          if (!isWord(o.label)) say(`${ot}.label is missing`);
          if (typeof o.key !== 'string' || o.key.length !== 1) say(`${ot}.key is not one character`);
          // **One key, one answer, over the whole card.** A key that meant two
          // things depending on which group had the focus would be a key that
          // records the wrong opinion, and an opinion is the one thing here
          // nothing else can reconstruct.
          else if (keys.has(o.key.toLowerCase())) say(`${ot}.key ${JSON.stringify(o.key)} is used twice`);
          else keys.add(o.key.toLowerCase());
        }
        optionsOf.set(f.id as string, ids);
      }
    }
  }

  // --- the items ---
  const itemIds = new Set<string>();
  const rows = new Map<string, number>();
  if (!Array.isArray(session.items) || !session.items.length) say('items is missing');
  else {
    for (const [i, it] of (session.items as unknown[]).entries()) {
      const at = `items[${i}]`;
      if (!isObject(it)) { say(`${at} is not an object`); continue; }
      if (!isWord(it.id)) say(`${at}.id is missing`);
      else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(it.id)) say(`${at}.id ${JSON.stringify(it.id)} is not a plain name`);
      else if (itemIds.has(it.id)) say(`${at}.id ${JSON.stringify(it.id)} is used twice`);
      else itemIds.add(it.id);
      if (!isWord(it.title)) say(`${at}.title is missing`);
      if (it.subtitle !== undefined && typeof it.subtitle !== 'string') say(`${at}.subtitle is not a line of words`);
      if (!pathIsSane(it.wav)) say(`${at}.wav ${JSON.stringify(it.wav)} is not a path inside the repository`);
      if (it.source !== undefined && !pathIsSane(it.source)) say(`${at}.source ${JSON.stringify(it.source)} is not a path inside the repository`);
      if (it.meta !== undefined && !isObject(it.meta)) say(`${at}.meta is not an object`);
      if (it.row !== undefined) {
        if (!pathIsSane(it.row) || !it.row.endsWith('.json')) say(`${at}.row ${JSON.stringify(it.row)} is not a path to a row`);
        else rows.set(it.row, (rows.get(it.row) || 0) + 1);
      }
    }
  }
  // One row, one chef's score. Two items writing a score to the same row would
  // be two opinions in one field, so a session whose items share a row scores
  // the music and leaves the row's own score alone — which is what a variants
  // session is, and it says so with `rowWrite: 'verdict'`.
  if ((session.rowWrite ?? 'score+verdict') === 'score+verdict') {
    for (const [row, n] of rows) {
      if (n > 1) say(`${n} items write a score to the same row (${row}); this session wants rowWrite 'verdict'`);
    }
  }

  // --- what an earlier build decided about other audio ---
  if (session.superseded !== undefined) {
    if (!isObject(session.superseded)) say('superseded is not an object');
    else {
      for (const [id, e] of Object.entries(session.superseded as Loose)) {
        if (!isObject(e) || !isObject(e.entry) || !isObject(e.was) || !isObject(e.now)) say(`superseded.${id} is not an earlier answer with the two identities`);
      }
    }
  }

  // --- what has been decided so far ---
  if (session.state !== undefined) {
    if (!isObject(session.state)) say('state is not an object');
    else {
      for (const [id, e] of Object.entries(session.state as Loose)) {
        if (!itemIds.has(id)) { say(`state names ${JSON.stringify(id)}, which is not an item`); continue; }
        if (!isObject(e)) { say(`state.${id} is not an object`); continue; }
        if (e.action !== undefined || !e.fields) {
          if (!actionIds.has(e.action as string)) say(`state.${id}.action ${JSON.stringify(e.action)} is not one of this session's actions`);
          if (!Number.isFinite(e.score)) say(`state.${id}.score is not a number`);
        }
        if (e.fields !== undefined) {
          if (!isObject(e.fields)) say(`state.${id}.fields is not an object`);
          else {
            for (const [k, v] of Object.entries(e.fields)) {
              if (!fieldIds.has(k)) { say(`state.${id}.fields names ${JSON.stringify(k)}, which is not a field`); continue; }
              const allowed = optionsOf.get(k);
              if (allowed === null) { if (typeof v !== 'string') say(`state.${id}.fields.${k} is not a line of words`); continue; }
              for (const one of Array.isArray(v) ? v : [v]) {
                if (!allowed || !allowed.has(one)) say(`state.${id}.fields.${k} is ${JSON.stringify(one)}, which ${k} does not offer`);
              }
            }
          }
        }
        if (e.note !== undefined && typeof e.note !== 'string') say(`state.${id}.note is not a line of words`);
        if (!isWord(e.at)) say(`state.${id}.at is missing`);
      }
    }
  }
  return bad;
}

/**
 * The gate as a sentence, for a caller that wants to stop on the first fault.
 * It hands back what it was given, whatever that was: a builder passes the
 * manifest it has just assembled and goes on using its own shape of it.
 */
export function assertSession<T>(session: T, where = 'the session'): T {
  const bad = validateSession(session);
  if (bad.length) throw new Error(`${where} is not a valid manifest: ${bad.join('; ')}`);
  return session;
}

/** Read a manifest and check it. */
export function readSession(file: string): Session {
  const session: Session = JSON.parse(fs.readFileSync(file, 'utf8'));
  return assertSession(session, path.relative(ROOT, file) || file);
}

/**
 * Write a file so that a reader never sees half of one: the bytes go to a
 * neighbour and the neighbour is renamed over the target, which is atomic on
 * one filesystem. A review that loses its state to a refresh at the wrong
 * moment is a review done twice.
 */
export function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** A manifest, written the way `notes/` writes JSON: two spaces and a newline. */
export const writeSession = (file: string, session: Session): void =>
  writeAtomic(file, `${JSON.stringify(session, null, 2)}\n`);

/**
 * **The id of an item is the provenance of its music**, and it is the same rule
 * in every builder: the scope, the seed, the theme, the bars and the rate, which
 * is also the reference wav's own name. `tools/imprint/cookbook.ts` coined it
 * and owns the cookbook's manifest; this is the same string, written once so the
 * two tools cannot drift.
 *
 * A rank in a run and a truncated description do not survive a re-clustering or
 * a re-render: the row that was second becomes third and a decision points at
 * nothing. A seed and a bar range cannot move, because they *are* the music.
 */
export const provenanceKey = (
  scope: string,
  seed: string | number,
  theme: string | number,
  from: number,
  bars: number,
  rate: number,
): string => `${scope}-s${seed}-t${theme}-b${from}-${from + bars}-${rate}`;

/** The window an item's meta describes: the bar it starts at, and how many. */
export interface ItemWindow {
  from: number | null;
  bars: number | null;
}

/** The window an item's meta describes: `bar`/`fromBar`, or `bars` as "88+16". */
export function windowOf(meta: ItemMeta = {}): ItemWindow {
  const m = /^(\d+)\+(\d+)$/.exec(String(meta.bars ?? ''));
  const from = Number.isFinite(meta.bar ?? meta.fromBar) ? ((meta.bar ?? meta.fromBar) as number) : (m ? +m[1] : null);
  const bars = m ? +m[2] : (Number.isFinite(meta.bars) ? (meta.bars as number) : null);
  return { from, bars };
}

/**
 * The provenance key of an item of an older manifest, so a decision already
 * made survives a rebuild that renames things. It is read off the **meta** and
 * never off the id, because the id is the thing that moved; an id that is
 * already a key comes back as itself.
 */
/**
 * What a builder knows that a manifest does not say: the rate its wavs were
 * rendered at, when an item's own meta has not written it down.
 */
export interface KeyOptions {
  rate?: number;
}

export function keyOfItem(item: SessionItem | null | undefined, { rate }: KeyOptions = {}): string | null | undefined {
  if (!item || !item.meta) return item && item.id;
  const scope = String(item.id || '').split('-')[0];
  const { from, bars } = windowOf(item.meta);
  const seed = item.meta.seed ?? item.meta.masterSeed;
  if (!scope || from == null || bars == null || seed == null || item.meta.theme == null) return item.id;
  return provenanceKey(scope, seed, item.meta.theme, from, bars, item.meta.rate ?? rate ?? 48000);
}

/**
 * What has already been decided, carried onto a rebuilt list by provenance key.
 * A decision that names music the new list does not have is **said out loud**
 * rather than dropped quietly.
 */
/**
 * What a rebuild carried across: the state keyed by the new list's ids, and the
 * decisions that named music this list has not got.
 */
export interface Migrated {
  state: Record<string, StateEntry>;
  /** decisions that name music this list has not got at all */
  lost: string[];
  /** decisions that name the same seed and bars, rendered as other audio: kept beside the state, not in it */
  superseded: Record<string, Superseded>;
  /** decisions carried by provenance alone, because one side or the other carries no audio identity */
  blind: string[];
}

/** The approval identity of an item, off its meta. */
export const identityOfItem = (item: SessionItem | null | undefined): MusicIdentity => ({
  strategy: item?.meta?.strategy,
  build: item?.meta?.build,
  audioHash: item?.meta?.audioHash,
});

/** Do two items carry an identity each, and is it the same one? `null` when either is blind. */
export function sameMusic(a: MusicIdentity, b: MusicIdentity): boolean | null {
  const full = (x: MusicIdentity) => !!(x.strategy && x.build && x.audioHash);
  if (!full(a) || !full(b)) return null;
  return a.strategy === b.strategy && a.build === b.build && a.audioHash === b.audioHash;
}

/**
 * Is the **question** the same? A card that names a recipe row asks whether
 * this music is that dish; the same eight bars standing in for another row is
 * another question, and an answer about the first is not an answer to the
 * second (the outside review's own point: a clip's quality and its fidelity to
 * one recipe are two labels). Two items that both name a row and name
 * different ones are not the same card, whatever the audio.
 */
export const sameQuestion = (a: SessionItem | null | undefined, b: SessionItem | null | undefined): boolean =>
  !(a?.row && b?.row && a.row !== b.row);

/**
 * A decision follows the music and not the file (M2 of the mining review, 09-19). It is
 * carried onto the rebuilt item with the same provenance key **only if that
 * item is the same audio** — the same strategy, the same build, the same
 * bytes — and otherwise it is kept under `superseded` as the earlier answer
 * about other audio, which the page shows and never counts. Where either side
 * carries no identity at all (every session before this rule) the decision is
 * carried by provenance and the rebuild says so in `blind`.
 */
export function migrateState(
  previous: Session | null | undefined,
  items: SessionItem[],
  opts?: KeyOptions,
): Migrated {
  const byKey = new Map(items.map((it) => [it.id, it]));
  const byId = new Map((previous?.items || []).map((it) => [it.id, it]));
  const state: Record<string, StateEntry> = {};
  const lost: string[] = [];
  const superseded: Record<string, Superseded> = { ...(previous?.superseded || {}) };
  const blind: string[] = [];
  for (const [id, entry] of Object.entries(previous?.state || {})) {
    const old = byId.get(id);
    const key = old ? (keyOfItem(old, opts) as string) : id;
    const now = byKey.get(key);
    if (!now) { lost.push(id); continue; }
    const same = sameMusic(identityOfItem(old), identityOfItem(now));
    if (same === false || !sameQuestion(old, now)) {
      superseded[key] = { entry, was: identityOfItem(old), now: identityOfItem(now) };
      continue;
    }
    if (same === null) blind.push(key);
    state[key] = entry;
    delete superseded[key];
  }
  return { state, lost, superseded, blind };
}

// A session with no actions at all is a session `recordDecision` was never
// meant to be called on, and the `!` keeps that the error it has always been.
export const actionOf = (session: Session, id: string | undefined): SessionAction | undefined =>
  session.actions!.find((a) => a.id === id);
export const itemOf = (session: Session, id: string | undefined): SessionItem | undefined =>
  session.items.find((it) => it.id === id);

/**
 * **When an item counts as reviewed.** With actions it is simply answered: an
 * entry is a decision. With fields it is answered when every field marked
 * `required` has been filled — the kitchen's identity and fit — because a card
 * half filled in is a card he is still working on, and putting it away at the
 * first click would take it off the screen mid-thought.
 */
export function isReviewed(session: Session, id: string): boolean {
  const e = session.state?.[id];
  if (!e) return false;
  const fields = Array.isArray(session.fields) ? session.fields.filter((f) => f.required) : [];
  if (!fields.length) return true;
  return fields.every((f) => {
    const v = e.fields?.[f.id];
    return Array.isArray(v) ? v.length > 0 : isWord(v);
  });
}

/** The count the header is: how many are answered, of how many, and what is left. */
export interface Progress {
  reviewed: number;
  total: number;
  pending: number;
}

/** How far through he is: the two numbers the header prints. */
export function progressOf(session: Session): Progress {
  const total = session.items.length;
  const reviewed = session.items.filter((it) => isReviewed(session, it.id)).length;
  return { reviewed, total, pending: total - reviewed };
}

/** The two lists the page is, by item id. */
export interface Order {
  pending: string[];
  reviewed: string[];
}

/**
 * The order the page shows, and it is the same order after a refresh: pending
 * first **in manifest order**, so there is one systematic way through the list;
 * reviewed after them, newest decision first, because the one most likely to be
 * reopened is the one just made.
 */
export function orderOf(session: Session): Order {
  const state = session.state || {};
  const pending = session.items.filter((it) => !isReviewed(session, it.id)).map((it) => it.id);
  const reviewed = session.items
    .filter((it) => isReviewed(session, it.id))
    .sort((a, b) => String(state[b.id].at).localeCompare(String(state[a.id].at)))
    .map((it) => it.id);
  return { pending, reviewed };
}

/**
 * Record one decision in the manifest's state, in memory.
 *
 * An action marked `pending` is the skip: it is a real answer to "not now", so
 * it *removes* whatever was there and leaves the item in the pending list,
 * which is also how a decision is taken back.
 */
/**
 * What is said about one item. An answer is an `action`, or some `fields`, or
 * a `note`; `at` is the instant it was given, which the caller may name when it
 * is replaying one rather than making it now.
 */
export interface Decision {
  item: string;
  action?: string;
  fields?: Record<string, string | string[] | null> | null;
  note?: string;
  at?: string;
}

/** What a decision left behind: the item, the action it was, and the entry. */
export interface Recorded {
  item: SessionItem;
  action: SessionAction;
  entry: StateEntry | null;
}

export function recordDecision(session: Session, { item, action, note = '', at = new Date().toISOString() }: Decision): Recorded {
  const it = itemOf(session, item);
  if (!it) throw new Error(`no item ${JSON.stringify(item)} in this session`);
  const a = actionOf(session, action);
  if (!a) throw new Error(`no action ${JSON.stringify(action)} in this session`);
  session.state = session.state || {};
  if (a.pending) {
    delete session.state[item];
    return { item: it, action: a, entry: null };
  }
  const entry = { action: a.id, score: a.score, note: String(note || ''), at };
  session.state[item] = entry;
  return { item: it, action: a, entry };
}

/**
 * Record an answer to one or more **fields**, in memory. The page writes on any
 * change, so this merges rather than replaces: a click on *artefacts: clean*
 * says that and nothing about identity. A field set to `null` (or an empty
 * list) is taken back, which is how a wrong click is undone.
 */
/** What an answer to a form left behind: the item, and what it now holds. */
export interface Answered {
  item: SessionItem;
  entry: StateEntry | null;
}

export function recordFields(session: Session, { item, fields, note, at = new Date().toISOString() }: Decision): Answered {
  const it = itemOf(session, item);
  if (!it) throw new Error(`no item ${JSON.stringify(item)} in this session`);
  if (!Array.isArray(session.fields) || !session.fields.length) throw new Error('this session has no fields');
  if (!isObject(fields) && note === undefined) throw new Error('nothing to record');
  session.state = session.state || {};
  const was: Partial<StateEntry> = session.state[item] || {};
  const answers: Record<string, string | string[]> = { ...(was.fields || {}) };
  for (const [k, v] of Object.entries(fields || {})) {
    const f = session.fields.find((x) => x.id === k);
    if (!f) throw new Error(`no field ${JSON.stringify(k)} in this session`);
    if (v == null || (Array.isArray(v) && !v.length)) delete answers[k];
    else answers[k] = f.kind === 'multi' ? [...new Set(Array.isArray(v) ? v : [v])] : String(v);
  }
  const entry: StateEntry = { ...was, fields: answers, note: note === undefined ? (was.note || '') : String(note), at };
  // An entry with nothing in it at all is no entry: clearing the last answer
  // puts the item back where it was rather than leaving an empty decision.
  if (!Object.keys(answers).length && !entry.note && was.action === undefined) {
    delete session.state[item];
    return { item: it, entry: null };
  }
  session.state[item] = entry;
  return { item: it, entry };
}

/** What the chef's hand on this action is worth on `score.chef`'s own scale. */
export const chefOf = (action: SessionAction): number =>
  Math.max(CHEF_MIN, Math.min(CHEF_MAX, Number.isFinite(action.chef) ? (action.chef as number) : action.score));

/**
 * One verdict on a row, in the shape `src/recipe.ts` gives one: the music it
 * is about, the word it is, when it was given and by which session.
 */
export interface Verdict {
  seed: string | number;
  verdict: string;
  wav: string;
  at: string;
  by: string;
  theme?: number;
  bar?: number;
  note?: string;
  /** which audio, exactly: the strategy, the build and the bytes, where the item said */
  strategy?: string;
  build?: string;
  audioHash?: string;
}

/**
 * The verdict this decision is, in the shape `src/recipe.ts` gives one: it
 * points at a **piece of music** (the seed, the theme, the bar, the wav) and
 * carries the words in which it was given. `by` says which session said it, so
 * the same session's earlier verdict about the same music is replaced rather
 * than stacked up.
 */
export function verdictOf(session: Session, item: SessionItem, action: SessionAction, entry: StateEntry): Verdict {
  const meta = item.meta || {};
  const chef = chefOf(action);
  const v: Verdict = {
    seed: meta.seed ?? meta.masterSeed ?? item.id,
    verdict: action.verdict || (chef > 0 ? 'hit' : chef < 0 ? 'miss' : 'partial'),
    wav: item.wav,
    at: entry.at,
    by: `review:${session.id}`,
  };
  if (Number.isFinite(meta.theme)) v.theme = meta.theme;
  // The bar is said either way a manifest says it: `bar` outright, or the
  // window `bars` as "88+16", which is what the extraction's own meta carries.
  const { from } = windowOf(meta);
  if (Number.isFinite(from)) v.bar = from as number;
  if (entry.note) v.note = entry.note;
  // The approval identity, so a verdict on a row says which audio it heard and
  // a later reader can tell a verdict on this build from one on the last.
  if (typeof meta.strategy === 'string') v.strategy = meta.strategy;
  if (typeof meta.build === 'string') v.build = meta.build;
  if (typeof meta.audioHash === 'string') v.audioHash = meta.audioHash;
  return v;
}

/**
 * Write the decision onto the recipe row the item scores, and **nothing else in
 * the row**: it is read, `score.chef` and `verdicts` are set, and it is written
 * back with every other field exactly as it was. `likes` is a listener's count
 * and is never touched here; `picked` stays the sheet's own column.
 */
/**
 * A recipe row's own score: the chef's hand and the listeners' count. The rest
 * of a row is not described here because none of it is read — it is carried
 * through exactly as it was found.
 */
interface RowScore {
  chef?: number;
  likes?: number;
  [key: string]: unknown;
}

/** As much of a recipe row as this file touches, and everything else it keeps. */
interface RecipeRow {
  score?: RowScore;
  verdicts?: Verdict[];
  [key: string]: unknown;
}

/** Where the rows are, which is the repository unless a caller says otherwise. */
export interface WriteOptions {
  root?: string;
}

/**
 * What writing a row leaves to say about it: the row that was named, and
 * either that it is not on disk or what it holds now.
 */
export interface RowWritten {
  path: string;
  missing?: boolean;
  chef?: number;
  verdicts?: number;
  mode?: RowWrite;
}

export function writeRow(session: Session, item: SessionItem, action: SessionAction, entry: StateEntry, { root = ROOT }: WriteOptions = {}): RowWritten | null {
  if (!item.row) return null;
  const mode = session.rowWrite ?? 'score+verdict';
  if (mode === 'none') return null;
  const file = path.join(root, item.row);
  if (!fs.existsSync(file)) return { path: item.row, missing: true };
  const row: RecipeRow = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (mode === 'score+verdict') {
    const score: RowScore = isObject(row.score) ? { ...row.score } : {};
    score.chef = chefOf(action);
    score.likes = Number.isInteger(score.likes) && (score.likes as number) >= 0 ? score.likes : 0;
    row.score = score;
  }
  const verdict = verdictOf(session, item, action, entry);
  const kept = (Array.isArray(row.verdicts) ? row.verdicts : [])
    .filter((v: Verdict) => !(v && v.by === verdict.by && v.wav === verdict.wav));
  row.verdicts = [...kept, verdict];

  writeAtomic(file, `${JSON.stringify(row, null, 2)}\n`);
  return { path: item.row, chef: row.score?.chef, verdicts: row.verdicts.length, mode };
}

/**
 * One decision, all the way through: the manifest is re-read from disk first,
 * so a hand editing it while the tool is open is not clobbered, and the row is
 * written after the state, so a row can never be ahead of the manifest.
 */
/**
 * One decision, all the way: the manifest as it now stands, the entry it left,
 * the row it reached if it named one, and where the session has got to.
 */
export interface Decided {
  session: Session;
  entry: StateEntry | null;
  row: RowWritten | null;
  progress: Progress;
}

export function decide(file: string, { item, action, fields, note, at }: Decision, { root = ROOT }: WriteOptions = {}): Decided {
  const session = readSession(file);
  if (action === undefined && (fields !== undefined || note !== undefined)) {
    const { entry } = recordFields(session, { item, fields, note, at });
    writeSession(file, session);
    return { session, entry, row: null, progress: progressOf(session) };
  }
  const { item: it, action: a, entry } = recordDecision(session, { item, action, note, at });
  writeSession(file, session);
  const row = entry ? writeRow(session, it, a, entry, { root }) : null;
  return { session, entry, row, progress: progressOf(session) };
}

/**
 * A manifest with nothing in it but the shape, for the gate in `npm run check`
 * and for a builder to start from. The actions are the cookbook's, which are
 * the ones Eugene asked for: a chef's pick, a decent recipe, a drop, a skip.
 */
export function sampleSession(over: Partial<Session> = {}): Session {
  return {
    schema: SCHEMA,
    id: 'sample',
    title: 'A sample session',
    kind: 'cookbook',
    rowWrite: 'score+verdict',
    items: [
      { id: 'one', title: 'The first', subtitle: 'a sample', wav: 'tmp/ear/sample-one.wav', meta: { seed: '7', theme: 2, bars: '88+16', rate: 48000 } },
      { id: 'two', title: 'The second', wav: 'tmp/ear/sample-two.wav', meta: { seed: '10', theme: 1 } },
    ],
    actions: COOKBOOK_ACTIONS,
    state: {},
    ...over,
  };
}

/**
 * The three decisions and the skip, in Eugene's words: *"listen to a track and
 * keep it as a chef's preference, keep it as a decent recipe, or drop it"*. The
 * scores are the chef's own scale, so a pick is +2, a keeper is +1 and a drop
 * is -1 — a drop that is not the bottom of the scale, because the bottom is for
 * music that is wrong and not for music that is merely not wanted.
 */
export const COOKBOOK_ACTIONS: SessionAction[] = [
  { id: 'pick', label: "chef's pick", key: '1', score: 2, verdict: 'hit' },
  { id: 'keep', label: 'decent recipe', key: '2', score: 1, verdict: 'partial' },
  { id: 'drop', label: 'drop', key: '3', score: -1, verdict: 'miss' },
  { id: 'skip', label: 'skip', key: 's', score: 0, pending: true },
];

/**
 * **What is useful to say about an audition**, which is Eugene's question of
 * 2026-09-18 answered as a form and not as a knob. Four things, and none of
 * them is tuning:
 *
 *   **identity** — does it sound like what it is called? yes or no. The one
 *     thing a gate cannot measure and the whole reason a person is listening.
 *   **artefacts** — clean, some, or bad, with a word for what they are.
 *   **fit** — what it belongs on: pads, keys, drums, the drop, a seam, a
 *     breakdown, or nowhere. Several at once, because most things fit more
 *     than one place and *nowhere* is a real answer.
 *   **amount** — the demonstrated setting: less, right, or more. It asks about
 *     the one setting he was played and not about the parameter space.
 *
 * Identity and fit are `required`: they are what the round needs from him, and
 * the other two are worth having when he has them. The keys are one letter each
 * and never two for one letter, so an answer is a keystroke: `y`/`n`, `c`/`s`/`b`,
 * the fit letters, and `a`/`r`/`m` (the amount's first letters are taken by
 * `l`oop and the `r`ight one, so *less* is `a`, as in *a bit less*).
 */
export const AUDITION_FIELDS: SessionField[] = [
  { id: 'identity', label: 'sounds like what it is called', kind: 'choice', required: true,
    options: [{ id: 'yes', label: 'yes', key: 'y' }, { id: 'no', label: 'no', key: 'n' }] },
  { id: 'artefacts', label: 'artefacts', kind: 'choice',
    options: [{ id: 'clean', label: 'clean', key: 'c' }, { id: 'some', label: 'some', key: 's' }, { id: 'bad', label: 'bad', key: 'b' }] },
  { id: 'fit', label: 'belongs on', kind: 'multi', required: true,
    options: [
      { id: 'pads', label: 'pads', key: 'p' },
      { id: 'keys', label: 'keys', key: 'k' },
      { id: 'drums', label: 'drums', key: 'd' },
      { id: 'drop', label: 'the drop', key: 'o' },
      { id: 'seam', label: 'a seam', key: 'e' },
      { id: 'breakdown', label: 'a breakdown', key: 'w' },
      { id: 'nowhere', label: 'nowhere', key: 'x' },
    ] },
  { id: 'amount', label: 'the setting you heard', kind: 'choice',
    options: [{ id: 'less', label: 'less', key: 'a' }, { id: 'right', label: 'right', key: 'r' }, { id: 'more', label: 'more', key: 'm' }] },
];

/**
 * **A strategy session's four**, which are the ones round K5b asked house-v2's
 * first listening pass in and round K6 asks its second in — kept here rather
 * than written into a manifest by hand, so that two rounds' answers are
 * comparable because they were the same question.
 *
 * The question a strategy session asks is *is this still the record*, and not
 * *do you like this*: every card is one side of an A/B whose other side is the
 * same seed, the same theme and the same window under `house-v1`, and the
 * `source` button is that. So **keep** is the record and better, **decent** is
 * different and it works, and **drop** is not the record. `rowWrite` is `none`
 * for a session of these: a strategy is not a recipe and a verdict on one does
 * not belong on the other.
 */
export const STRATEGY_ACTIONS: SessionAction[] = [
  { id: 'keep', label: 'keep — this is the record, better', key: 'k', score: 2 },
  { id: 'decent', label: 'decent — different, and it works', key: 'd', score: 0 },
  { id: 'drop', label: 'drop — this is not the record', key: 'x', score: -2 },
  // Eugene, 09-19: a drop was being read as a fault when he meant taste. This
  // is the verdict for a card that is music and is not wanted: it costs the row
  // one, not two, and it is never a finding against the render.
  // The A/B's own answer, the one the first four could not say: the record won.
  { id: 'worse', label: 'worse — the source was better', key: 'w', score: -1 },
  { id: 'pass', label: 'pass — it is music, just not for me', key: 'p', score: -1 },
  { id: 'later', label: 'come back to it', key: 'l', score: 0, pending: true },
];

/**
 * **A mined session's four**, and the reason they are a fourth set rather than
 * one of the three above.
 *
 * A mined row is cut from somebody else's record, and that record is analysed
 * only: it is never copied and never played, so a card here has **no `source`
 * button and cannot have one**. The question it asks is therefore not the
 * variants' *did the recipe catch it* — there is nothing to catch it against by
 * ear — and not the strategy session's *is this still the record*. It is: given
 * the dish this row describes in words and numbers, is what the machine made
 * of it worth keeping. So the labels say the row and not the music, and
 * `rowWrite` for a session of these is `score+verdict`, because the answer is a
 * judgement on the row itself and that is what the chef's score is.
 */
export const MINED_ACTIONS: SessionAction[] = [
  { id: 'keep', label: 'keep — the machine can make this dish', key: 'k', score: 2, chef: 2, verdict: 'hit' },
  { id: 'decent', label: 'decent — near it, and it works', key: 'd', score: 0, chef: 0, verdict: 'partial' },
  { id: 'drop', label: 'drop — not this dish', key: 'x', score: -2, chef: -2, verdict: 'miss' },
  { id: 'pass', label: 'pass — it is music, just not for me', key: 'p', score: -1, chef: -1, verdict: 'partial' },
  { id: 'later', label: 'come back to it', key: 'l', score: 0, pending: true },
];

/**
 * A variants session's own three, which are the labels `analysis/recipe-demo.md`
 * gave by hand: the point is not whether the variant is liked but whether the
 * recipe caught it, so they are hit, partial and miss and they write a verdict
 * onto the row without touching its score.
 */
export const VARIANT_ACTIONS: SessionAction[] = [
  { id: 'hit', label: 'hit', key: '1', score: 2, verdict: 'hit' },
  { id: 'partial', label: 'partial', key: '2', score: 1, verdict: 'partial' },
  { id: 'miss', label: 'miss', key: '3', score: -1, verdict: 'miss' },
  { id: 'skip', label: 'skip', key: 's', score: 0, pending: true },
];
