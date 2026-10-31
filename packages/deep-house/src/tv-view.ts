// **The TV's half** (round tv-scene; tv-mode.ts says what the TV's page is, tv-feed.ts what the phone says). The
// TV's page stands its transport on the phone's place and plans the same theme from the link (`control.follow`), and
// lays the phone's clock over every readout (`face`), so its ring is the phone's ring at the TV's size: the same
// plan, the same second, the same hand-over, the same held birds, drawn by its own frames on its own clock.
//
// **The room hears the music late** (the brief: AirPlay's delay). Everything the music carries — the place, the
// clock, the coming theme, the line under the ring — is taken a delay after the phone said it (`delay`, from the
// shell: the route's own output latency as iOS reports it, or a debug argument's), so the rim lifts on the kick the
// room hears. A hand is not the music: the birds a hand pulls and the spell it asks are drawn as they come, as the
// phone draws them.
//
// Nothing here sounds, plans a set of its own, or writes anything (tv-mode.ts).

import type { Readout, NextInfo, Lanes } from './control.ts';
import type createControl from './control.ts';
import { sharedNow, planSig } from './tv-feed.ts';
import { seamStages } from './seam-stages.ts';
import type { TvSaid, ClockSaid, PlaceSaid, NextSaid } from './tv-feed.ts';
import type { BeatSaid } from './ring.ts';

type Control = ReturnType<typeof createControl>;
type Message = { kind: string; [k: string]: unknown };

/** How the ring answers what the phone's hand does (ring.ts). */
export interface TvRing {
  /** the spell the phone's address asks, for the birds to stand at */
  ask(spell: Record<string, number> | null): void;
  /** the bird a hand is pulling on the phone and its value, or none */
  pull(p: { bird: string; v: number } | null): void;
  /** the line under the ring, as the phone's page drew it */
  line(html: string, hidden: boolean, quiet: boolean): void;
  /** the phone's beat count, so the TV lights the same dot */
  beats(o: BeatSaid | null): void;
}

/** The furthest an anchor's second is eased onto rather than jumped to (s): further is a seek. */
const SLEW_MAX = 0.25;
/** How fast a small error is taken up (s): a beat's drift is gone in about this long, never seen as a step. */
const SLEW_S = 0.4;

export interface TvView {
  /** the readout's clock for this frame: called by the ring at the top of its frame */
  tick(now: number): void;
  /** what the TV reads now, for the probe */
  state(): unknown;
}

export function startTvView(control: Control, ring: TvRing): TvView {
  const shell = typeof window !== 'undefined' ? window.deepHouseShell : undefined;
  const queue: TvSaid[] = [];
  // the delay: the larger of what the phone's page knows of its output (`lag`, eased) and what iOS says of the route
  // (the shell's `route`), plus the debug argument's offset; or one the shell fixes outright
  let delayMs = 0, lagMs = 0, routeMs = 0, offsetMs = 0;
  let fixedMs: number | null = null;
  const reckon = () => { delayMs = Math.max(0, Math.min(10000, fixedMs ?? Math.max(lagMs, routeMs) + offsetMs)); };
  let clock: ClockSaid | null = null;
  // the second drawn, and when: an anchor's or a delay's small move is eased onto, never stepped to
  let lastS = NaN, drawnAt = 0, drawnKey = '';
  /** the shared clock at the frame the second was last drawn for (ms), for the probe's comparison */
  let drawnShared = 0;
  let next: NextInfo | null = null;
  let applied: PlaceSaid | null = null;
  let changeSeen = -1;
  let planChecks = { same: 0, differ: 0, last: '' };
  /** how long the last place took to follow (the theme planned, if it was not planned ahead), ms */
  let followMs = 0;
  let dirty = true;
  const said: Record<string, number> = {};

  /** The phone's second at an instant of the shared clock, as the TV draws it (the delay already taken). */
  const phoneSecond = (c: ClockSaid, at: number): number => c.s + (c.playing && !c.starting ? (at - c.at) / 1000 : 0);

  function lanesOf(l: NextSaid['lanes']): Lanes | null {
    if (!l) return null;
    return { order: l.order, bars: l.bars, level: Object.fromEntries(Object.entries(l.level).map(([k, v]) => [k, Uint8Array.from(v)])) };
  }

  /** The readout as the phone's: its clock, its grid, its hand-over in flight and its coming theme. */
  function face(r: Readout): Readout {
    const c = clock;
    if (!c) return r;
    const at = sharedNow() - delayMs;
    const dt = Math.max(0, (at - c.at) / 1000);
    const setClock = c.clock + (c.playing ? dt : 0);
    const cut = c.cut;
    const cutIn = cut ? Math.max(0, cut.in - dt) : 0;
    const barLeft = cut ? Math.max(0, cut.barLeft - dt) : 0;
    const window = 32 * r.barSeconds;
    // the coming theme's lead, the crossing and the landing on the phone's seam and its clock (round ring-seam)
    const stages = c.seamAt ? seamStages(r.seconds, c.seamAt, r.barSeconds, c.seam ?? null, setClock) : null;
    return {
      ...r,
      playing: c.playing,
      starting: c.starting,
      gridBpm: c.grid || r.gridBpm,
      listBpm: c.listBpm,
      mix: {
        ...r.mix,
        transition: c.transition,
        seamAt: c.seamAt,
        approach: c.seamAt ? Math.max(0, Math.min(1, (r.seconds - (c.seamAt - window)) / window)) : r.mix.approach,
        ...(stages ?? {}),
        cutKind: cut && cutIn > 0 ? cut.kind : null,
        cutAsked: cut && cutIn > 0 ? cut.asked : null,
        cutCasts: !!cut && cutIn > 0 && cut.casts,
        cutting: !!cut && cutIn > 0 && cut.cutting,
        cutIn,
        cutSpan: cut && cutIn > 0 ? cut.span : 0,
        cutInBars: cut && barLeft > 0 ? Math.max(1, Math.ceil(barLeft / r.barSeconds)) : 0,
        settleIn: Math.max(0, c.settleIn - dt),
        wait: c.wait,
        clock: setClock,
        next,
      },
    };
  }

  function apply(m: TvSaid): void {
    said[m.t] = (said[m.t] ?? 0) + 1;
    switch (m.t) {
      case 'place': {
        // the phone's link on this page's address, the view row kept: the transport plans from it
        try {
          const q = new URLSearchParams(m.link);
          q.set('view', 'tv');
          const search = q.toString();
          if (location.search.replace(/^\?/, '') !== search) history.replaceState(null, '', `${location.pathname}?${search}`);
        } catch (e) { /* a page with no history to write on: the place is still followed */ }
        // the phone's own word for the change, once; the same change said again (a link moved under it) replans quietly
        const reason = m.change.n !== changeSeen && changeSeen >= 0 ? m.change.reason : null;
        changeSeen = m.change.n;
        applied = m;
        const t0 = performance.now();
        control.follow({ seed: m.seed, strategy: m.strategy, theme: m.theme, reason }, face);
        followMs = performance.now() - t0;
        dirty = true;
        checkPlan();
        break;
      }
      case 'clock': {
        clock = m;
        ring.beats(m.beats ?? null);
        // the page's own lag, eased (a few milliseconds' wobble between anchors moves nothing), and only one it can believe
        if (typeof m.lag === 'number' && Number.isFinite(m.lag) && m.lag >= 0 && m.lag <= 1500) { lagMs = lagMs ? lagMs + (m.lag - lagMs) * 0.1 : m.lag; reckon(); }
        dirty = true;
        break;
      }
      case 'next':
        next = m.next ? { ...m.next, lanes: lanesOf(m.next.lanes) } : null;
        dirty = true;
        // the coming theme planned ahead, off the page's thread, so the swap finds it made: the seam is then a
        // frame's work and not a theme's plan (the set's own next theme; a cast's or a pull's is planned at the swap)
        if (m.next && applied && Number.isInteger(m.next.index) && m.next.index >= 1) {
          try { void control.planLater(m.next.index - 1, String(m.next.seed), applied.strategy)?.catch(() => {}); } catch (e) { /* planned at the swap */ }
        }
        break;
      case 'line':
        ring.line(m.html, m.hidden, m.quiet);
        break;
      case 'hands':
        ring.ask(m.ask);
        ring.pull(m.pulling);
        dirty = true;
        break;
      case 'panel':
        // room for the TV's panel (a later step): read, and nothing drawn yet
        break;
    }
  }

  /** Is the TV's plan the phone's? Said to the shell's log once per place. */
  function checkPlan(): void {
    const r = control.readout() as Readout | null;
    if (!r || !applied) return;
    const mine = planSig(r);
    if (mine === applied.sig) planChecks.same += 1; else { planChecks.differ += 1; planChecks.last = `${mine} vs ${applied.sig}`; }
    shell?.send?.({ ev: 'tv-page', what: 'plan', same: mine === applied.sig, mine, phone: applied.sig, ms: +followMs.toFixed(1) });
  }

  /** What the music carries waits the delay; a hand does not. */
  const timed = (m: TvSaid) => m.t === 'place' || m.t === 'clock' || m.t === 'next' || m.t === 'line';

  function take(now: number): void {
    const due = sharedNow() - delayMs;
    while (queue.length && queue[0].at <= due) apply(queue.shift()!);
    void now;
  }

  if (shell && typeof shell.on === 'function') {
    shell.on('tv', (msg: Message) => {
      if (msg.t === 'delay') {
        const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        routeMs = n(msg.route) ?? routeMs;
        offsetMs = n(msg.offset) ?? offsetMs;
        fixedMs = n(msg.fixed);
        reckon();
        return;
      }
      const m = msg as unknown as TvSaid;
      if (!m || typeof m.t !== 'string' || typeof m.at !== 'number') return;
      if (timed(m)) queue.push(m); else apply(m);
    });
    // the page is up: the shell asks the phone's page to say everything afresh
    shell.send?.({ ev: 'tv-page', what: 'ready' });
  }

  return {
    tick(now: number) {
      take(now);
      const c = clock;
      if (!c) return;
      if (!c.playing && !dirty) return;
      dirty = false;
      const shared = sharedNow();
      const target = phoneSecond(c, shared - delayMs);
      // the drawn second runs on the TV's own frames, and an anchor that moves it (a buffer's step, the delay eased)
      // is eased onto within `SLEW_S`; a seek, a seam, a start or a pause is taken at once
      const t = performance.now();
      const key = `${c.seed}|${c.theme}|${c.playing}|${c.starting}`;
      const runs = c.playing && !c.starting;
      let s = target;
      if (runs && key === drawnKey && Number.isFinite(lastS)) {
        const dt = Math.max(0, t - drawnAt) / 1000;
        const pred = lastS + dt;
        const err = target - pred;
        s = Math.abs(err) > SLEW_MAX ? target : pred + err * (1 - Math.exp(-dt / SLEW_S));
      }
      drawnKey = key;
      drawnAt = t;
      lastS = s;
      drawnShared = shared;
      control.mock({ playing: c.playing, seconds: Math.max(0, s) });
    },
    state: () => ({
      followMs: +followMs.toFixed(1), delayMs: +delayMs.toFixed(1), lagMs: +lagMs.toFixed(1), routeMs, offsetMs, fixedMs, queued: queue.length, said: { ...said }, plan: { ...planChecks },
      second: Number.isFinite(lastS) ? +lastS.toFixed(4) : null, at: drawnShared, playing: clock?.playing ?? null,
      theme: applied ? applied.theme : null, seed: applied ? applied.seed : null,
    }),
  };
}
