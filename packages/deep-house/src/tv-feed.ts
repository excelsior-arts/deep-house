// **The phone's half of the TV** (round tv-scene, his word 10-26): while the Apple app shows the TV a scene of its
// own (`view=tv`, tv-mode.ts, tv-view.ts), the phone's page says what its ring needs and nothing more, through the
// shell (`deepHouseShell.send`, ShellBridge.swift), which hands it to the TV's page. Events and anchors, never
// frames: the TV's ring runs its own animations on its own clock, and plans the theme itself from the link.
//
// What is said, and when (each a small object; the shell stamps nothing):
//
// - `place`: the link of what sounds (`linkPlaying`: the seed, the theme, the engine, the spell heard, the recipe and
//   the modes), with the transport's own word for the change (`change`). The TV writes it on its address and plans the
//   same theme from it (the planner is deterministic); `sig` is what the phone's ring is drawn from, for the TV to
//   check its plan against. Said when any of it moves.
// - `clock`: an anchor, the second of the theme at an instant of the clock both pages read (`now`, the epoch in
//   milliseconds: `performance.timeOrigin` plus `performance.now()`), whether it plays, the grid's tempo, and the
//   hand-over in flight on the set's own clock. Twice a second while it plays (four times through a seam), and at once
//   on a start, a stop, a seek, a seam or a press.
// - `next`: the coming theme as the phone's ring draws it (its lanes and sections), when it changes.
// - `line`: the line under the ring (the playlist that plays, "2 OF 5"), as the phone's page drew it.
// - `hands`: the spell asked (the address's) and a bird a hand is pulling, as it moves (once a frame at most).
// - `panel`: whether the phone's panel is open, its tab and the playlist it plays: room for the TV's panel, which is
//   a later step (notes/rounds/tv-scene.md); the TV reads nothing of it yet.
//
// The tilt goes from the shell to the TV directly (ShellTilt.swift), so the page pays nothing for it.
//
// In a browser there is no shell and nothing here runs. In the app it runs only while a TV is shown (`tv` from the
// shell); with none, it costs one listener.

import type { Readout, NextInfo } from './control.ts';
import type { BeatSaid } from './ring.ts';
import type createControl from './control.ts';
import { linkHere } from './link.ts';
import { spellQuery } from './spell.ts';

type Control = ReturnType<typeof createControl>;
type Message = { kind: string; [k: string]: unknown };

/** The clock both pages read: milliseconds since the epoch, to the page's own precision. */
export const sharedNow = (): number => performance.timeOrigin + performance.now();

/** The coming theme, as it travels: its lanes as plain arrays. */
export interface NextSaid extends Omit<NextInfo, 'lanes'> {
  lanes: { order: string[]; bars: number; level: Record<string, number[]> } | null;
}
/** The hand-over in flight and the grid, as an anchor carries them. */
export interface ClockSaid {
  t: 'clock';
  /** the shared clock at this reading (ms) */
  at: number;
  /** the second of the theme, as the phone's ring draws it */
  s: number;
  playing: boolean;
  starting: boolean;
  /** the set's own clock (the audio context's seconds) at `at` */
  clock: number;
  grid: number;
  listBpm: number | null;
  transition: number;
  seamAt: number;
  /** the phone's hand-over as its transport will take it, on `clock` (round ring-seam): the TV's coming theme fades in on it */
  seam?: Readout['mix']['seam'];
  cut: { kind: Readout['mix']['cutKind']; asked: Readout['mix']['cutAsked']; casts: boolean; cutting: boolean; in: number; span: number; bars: number; barLeft: number } | null;
  settleIn: number;
  wait: Readout['mix']['wait'];
  theme: number;
  seed: string;
  /** what the phone's page reads of its own output, for the delay (ms): the context's output and base latency */
  out: number | null;
  /** how far the sound leaving the page is behind this anchor's second (ms; `heardLag`) */
  lag: number | null;
  /** the ring's beat count, as its offset off the theme's own beat (`beatOffset`, ring.ts), for the TV's dots */
  beats: BeatSaid | null;
}
export interface PlaceSaid {
  t: 'place';
  at: number;
  link: string;
  seed: string;
  strategy: string;
  theme: number;
  change: { n: number; reason: string };
  sig: string;
}
export type TvSaid =
  | PlaceSaid
  | ClockSaid
  | { t: 'next'; at: number; next: NextSaid | null }
  | { t: 'line'; at: number; html: string; hidden: boolean; quiet: boolean }
  | { t: 'hands'; at: number; ask: Record<string, number> | null; pulling: { bird: string; v: number } | null }
  | { t: 'panel'; at: number; open: boolean; tab: string | null; list: string | null };

/** What the ring's own plan is named by (ring.ts `planKeyOf`), and a digest of its lanes: what the TV checks its plan against. */
export function planSig(r: Readout): string {
  const lanes = r.lanes;
  let h = 7;
  if (lanes) for (const id of lanes.order) { const a = lanes.level[id]; if (a) for (let i = 0; i < a.length; i++) h = (Math.imul(h, 31) + a[i] + 1) >>> 0; }
  return `${r.seed}:${r.mix.themeNumber}:${r.bars}:${r.plan.map((s) => s.kind + s.bars).join('')}:${h.toString(36)}`;
}

function nextSaid(n: NextInfo | null): NextSaid | null {
  if (!n) return null;
  const lanes = n.lanes ? {
    order: n.lanes.order.slice(), bars: n.lanes.bars,
    level: Object.fromEntries(Object.entries(n.lanes.level).map(([k, v]) => [k, Array.from(v)])),
  } : null;
  return { ...n, plan: n.plan.map((s) => ({ ...s })), lanes };
}

/**
 * **How far the sound heard is behind the set's clock** (ms), as the page can know it: the context's own output
 * timestamp where it has one (the second of its clock that reaches the output now), else its two latencies; `ahead`
 * is how far the anchor's line stands ahead of the clock's last step (s). What the device adds after the page (an
 * AirPlay receiver's buffer) is the shell's to say (TVScene.swift).
 */
function heardLag(ctx: (AudioContext & { outputLatency?: number }) | null, ahead: number): number | null {
  if (!ctx) return null;
  try {
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    // (a timestamp more than a second old, or a lag out of any device's reach, is a reading taken across a stall,
    // a seam or a restart: the full tour of 10-26 saw one that put the TV ten seconds behind; nothing is said then)
    const old = ts && ts.performanceTime ? performance.now() - ts.performanceTime : Infinity;
    if (ts && ts.contextTime != null && old >= 0 && old < 1000) {
      const lag = (ctx.currentTime + ahead - (ts.contextTime + old / 1000)) * 1000;
      return lag >= 0 && lag <= LAG_MAX_MS ? +lag.toFixed(1) : null;
    }
  } catch (e) { /* read below */ }
  return +(((ctx.outputLatency || 0) + (ctx.baseLatency || 0) + ahead) * 1000).toFixed(1);
}

/** The most the page's own output can lag its clock and be believed (ms); the route's own word is the shell's. */
const LAG_MAX_MS = 1500;

/** How often an anchor is said while the set plays, and through a seam (ms). */
const ANCHOR_MS = 500;
const SEAM_ANCHOR_MS = 250;
/** A second that moved further than this from where the last anchor puts it is a seek, said at once (s). */
const JUMP_S = 0.04;

export interface TvFeed {
  /** whether a TV is shown and the feed runs */
  readonly on: boolean;
  /** whether the phone's ring may rest while the TV is shown (the shell's word; a measure turns it off) */
  readonly rest: boolean;
  /** one look at the set, from the ring's frame (and a timer while no frame is drawn) */
  tick(r?: Readout | null): void;
  /** the second on the set's line now, as the anchors carry it (null when it is not running): for the pair check */
  lineSecond(): number | null;
}

/**
 * **Start the feed.** `pulling` is the ring's: the bird a hand is moving and its value, or nothing. `line` is the
 * element under the ring the playlists draw. Nothing runs in a browser.
 */
export function startTvFeed(d: { control: Control; pulling: () => { bird: string; v: number } | null; beats: () => BeatSaid | null }): TvFeed {
  const shell = typeof window !== 'undefined' ? window.deepHouseShell : undefined;
  let on = false;
  let rest = true;
  const feed: TvFeed = { get on() { return on; }, get rest() { return rest; }, tick, lineSecond: () => (line.n ? sharedNow() / 1000 + line.off : null) };
  if (!shell || typeof shell.on !== 'function' || typeof shell.send !== 'function' || shell.platform === 'macos') return feed;
  const send = (m: TvSaid) => shell.send!({ ev: 'tv', ...m });

  let cheapKey = '', sigFor: Readout['lanes'] | undefined;
  let placeKey = '', nextFor: NextInfo | null | undefined, lineKey = '', handsKey = '', panelKey = '';
  let anchor: { at: number; s: number; playing: boolean; starting: boolean; key: string } | null = null;
  let timer = 0;
  const lineEl = typeof document !== 'undefined' ? document.getElementById('nowList') : null;
  let lineDirty = true, askFrom: string | null = null, ask: Record<string, number> | null = null;
  if (lineEl && typeof MutationObserver === 'function') {
    new MutationObserver(() => { lineDirty = true; }).observe(lineEl, { attributes: true, childList: true, subtree: true, characterData: true });
  }

  function fresh(): void {
    cheapKey = ''; sigFor = undefined; placeKey = ''; nextFor = undefined; lineKey = ''; lineDirty = true; askFrom = null; handsKey = ''; panelKey = ''; anchor = null;
  }

  function tick(given?: Readout | null): void {
    if (!on) return;
    const r = given ?? (d.control.readout() as Readout | null);
    if (!r) return;
    const at = sharedNow();
    // the place first, so the TV plans the theme before the anchor that is on it (read only when something it is
    // made of moved: the link is a roll under a recipe, and a frame is no time for one)
    const cheap = `${r.seed}|${r.strategy}|${r.mix.themeNumber}|${r.change.n}|${spellQuery(r.spell as Parameters<typeof spellQuery>[0])}|${r.recipe}|${typeof location === 'undefined' ? '' : location.search}`;
    if (cheap !== cheapKey || r.lanes !== sigFor) {
      cheapKey = cheap;
      sigFor = r.lanes;
      let link = '';
      try { link = d.control.linkPlaying(); } catch (e) { link = ''; }
      const sig = planSig(r);
      const pk = `${link}|${r.strategy}|${r.change.n}|${sig}`;
      if (pk !== placeKey) {
        placeKey = pk;
        send({ t: 'place', at, link, seed: String(r.seed), strategy: r.strategy, theme: r.mix.themeNumber - 1, change: { ...r.change }, sig });
        anchor = null;
      }
    }
    if (r.mix.next !== nextFor) {
      nextFor = r.mix.next;
      send({ t: 'next', at, next: nextSaid(r.mix.next) });
    }
    // the anchor: on a schedule while it plays, at once when anything it carries jumps
    const m = r.mix;
    const cutting = !!m.cutting;
    const key = `${r.playing}|${r.starting}|${m.themeNumber}|${r.seed}|${cutting}|${m.cutKind}|${m.cutInBars}|${m.wait ? `${m.wait.plan}:${m.wait.laid}:${m.wait.kind}` : ''}|${r.listBpm}|${m.seam ? `${m.seam.at.toFixed(1)}:${m.seam.laid}` : ''}`;
    const sinceMs = anchor ? at - anchor.at : Infinity;
    const expect = anchor ? anchor.s + (anchor.playing && !anchor.starting ? sinceMs / 1000 : 0) : NaN;
    const seam = m.transition > 0 && m.transition < 1;
    // (the second on the line, not the clock's last step, which stands behind it by up to a device buffer: 43 ms on
    // the simulator, so a step read as a seek said an anchor nine times a second)
    const cur = r.playing && !r.starting && line.n ? at / 1000 + line.off : r.seconds;
    const due = !anchor || key !== anchor.key || Math.abs(cur - expect) > JUMP_S
      || ((r.playing || seam) && sinceMs >= (seam || cutting ? SEAM_ANCHOR_MS : ANCHOR_MS));
    if (due) {
      const st = d.control.state as { cut: { at: number } | null; ctx: AudioContext | null };
      const ctxNow = st.ctx ? st.ctx.currentTime : 0;
      const ctx = st.ctx as (AudioContext & { outputLatency?: number }) | null;
      // the second on the set's own line, not the step the context's clock last took (`line`, below)
      const s = cur;
      send({
        t: 'clock', at, s, playing: r.playing, starting: r.starting, clock: m.clock, grid: r.gridBpm, listBpm: r.listBpm,
        transition: m.transition, seamAt: m.seamAt, seam: m.seam ? { ...m.seam } : null,
        cut: cutting || m.cutInBars ? { kind: m.cutKind, asked: m.cutAsked, casts: m.cutCasts, cutting, in: m.cutIn, span: m.cutSpan, bars: m.cutInBars, barLeft: st.cut ? Math.max(0, st.cut.at - ctxNow) : 0 } : null,
        settleIn: m.settleIn, wait: m.wait ? { ...m.wait } : null, theme: m.themeNumber - 1, seed: String(r.seed),
        out: ctx ? +(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000).toFixed(1) : null,
        lag: heardLag(ctx, s - r.seconds),
        beats: d.beats(),
      });
      anchor = { at, s, playing: r.playing, starting: r.starting, key };
    }
    // the hands: the spell asked (the address's) and the bird being pulled, as they move
    const q = typeof location === 'undefined' ? '' : location.search;
    if (q !== askFrom) {
      askFrom = q;
      try { const sp = linkHere().spell; ask = sp && spellQuery(sp) ? { ...sp } as Record<string, number> : null; } catch (e) { ask = null; }
    }
    const pulling = d.pulling();
    const hk = `${ask ? spellQuery(ask) : ''}|${pulling ? `${pulling.bird}:${pulling.v}` : ''}`;
    if (hk !== handsKey) { handsKey = hk; send({ t: 'hands', at, ask, pulling }); }
    // the line under the ring, as the playlists drew it
    if (lineEl && lineDirty) {
      lineDirty = false;
      const html = lineEl.innerHTML, hidden = lineEl.hidden === true, quiet = lineEl.classList.contains('quiet');
      const lk = `${hidden}|${quiet}|${html}`;
      if (lk !== lineKey) { lineKey = lk; send({ t: 'line', at, html, hidden, quiet }); }
    }
    // the panel, for the step after this one: open, its tab and the playlist that plays
    const sheet = typeof document !== 'undefined' ? document.getElementById('library') as HTMLDialogElement | null : null;
    const open = !!sheet && sheet.open;
    const tab = open ? (sheet!.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.dataset.tab ?? null) : null;
    const list = lineEl && !lineEl.hidden ? lineEl.querySelector('.nlName')?.textContent ?? null : null;
    const pnk = `${open}|${tab}|${list}`;
    if (pnk !== panelKey) { panelKey = pnk; send({ t: 'panel', at, open, tab, list }); }
  }

  /**
   * **The set's clock as a line** (the pair check, 10-26: the TV's ring stood 45 to 58 ms behind the phone's). A
   * context's clock moves in steps, a device buffer at a time (mix.ts, `anchorHead`), so a second read off it at any
   * instant is behind the line it steps along by up to a buffer, and an anchor taken from one such reading held the
   * TV that far behind for half a second. Every readout the transport hands out while it plays is read here at the
   * instant it is made, and the top of the last second's readings, the second less the clock, is the line: the
   * anchor is read off it.
   */
  const line = { off: 0, n: 0, at: [] as number[], v: [] as number[], key: '' };
  d.control.subscribe((r: Readout) => {
    if (!on) return;
    if (!r.playing || r.starting) { line.n = 0; line.at.length = 0; line.v.length = 0; return; }
    const at = sharedNow();
    const off = r.seconds - at / 1000;
    const key = `${r.seed}|${r.mix.themeNumber}`;
    // a seek, a seam or a new set starts the line again
    if (key !== line.key || (line.n && Math.abs(off - line.off) > 0.12)) { line.key = key; line.at.length = 0; line.v.length = 0; }
    line.at.push(at); line.v.push(off);
    while (line.at.length && at - line.at[0] > 1000) { line.at.shift(); line.v.shift(); }
    let top = -Infinity;
    for (const v of line.v) if (v > top) top = v;
    line.off = top;
    line.n = line.v.length;
  });

  shell.on('tv', (msg: Message) => {
    const want = !!msg.on;
    if (typeof msg.rest === 'boolean') rest = msg.rest;
    // a TV that was shown again (or whose page loaded) is told everything afresh
    if (want && (!on || msg.again)) fresh();
    on = want;
    clearInterval(timer);
    if (!on) return;
    // the ring's frame ticks while it draws; a page in the background draws no frames, and this keeps the TV told
    timer = window.setInterval(() => tick(), SEAM_ANCHOR_MS);
    tick();
  });
  return feed;
}
