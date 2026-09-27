// **A sound fault, reported** (round K33, Eugene: *"two pads were pushing the
// sound and I saw red messages in the ledger; is this a case to report? If I
// didn't look at the ledger, how would I know?"* — and *"we will have to pass
// the whole URL to recreate the song"*).
//
// The ledger's faults (`REPORTED_KINDS`: the output at full scale, a stage that
// threw, notes reached late at a start, and — round R1 — every error the page
// catches that is ours to fix, `CAUGHT`) each become one error-report event, at
// the warning level and not an exception: what broke — the ledger line's own
// words and its kind — and **the whole canonical link of the track with `t`**,
// the second its bar starts at, so the fault's place reopens as it was (K32);
// the engine and the bar beside it. Nothing about the listener: no page
// address (the link is the track, not the page), no user, and the browser's
// name and version as every error report carries them.
//
// **Each kind once a session, and six in all** (`REPORT_CAPS`, the held-errors
// audit's budget): a long clip is one report. Nothing is sent where the switch is
// off, on localhost, or in a development build (`instrument.ts` decides; this
// asks `reportsRunning`). The output's full scale is seen by the machine
// view's taps, which run while the view is open; a thrown stage and a late
// note are written with the view closed too.
import { Sentry, reportsRunning } from './instrument.ts';
import { watch, all, isReported, reportedAs, REPORT_CAPS } from './ledger.ts';
import type { Entry } from './ledger.ts';

interface Transport {
  state: { strategy: string; strategyTo?: string | null };
  readout(): { barSeconds: number } | null;
  link: { withTime(seconds?: number): string };
}

const sentKinds = new Map<string, number>();
let sentAll = 0;
let last = 0;

/**
 * The event a fault makes: the line, the kind, the engine, the bar, and the link.
 * A caught error (round R1, `report()` in the ledger) goes under its own kind,
 * carries its own words as `error`, and is one issue wherever it happened: a bug
 * in the planner is the same bug on every track, where a sound fault is a fault
 * of the track it sounded in.
 */
export function faultEvent(e: Entry, link: string, engine: string) {
  const kind = reportedAs(e);
  const caught = kind !== e.kind;
  const error = typeof e.fields.error === 'string' ? e.fields.error : null;
  return {
    message: e.what,
    level: 'warning' as const,
    tags: { fault: kind, engine, link },
    extra: error ? { bar: e.bar, theme: e.theme, error } : { bar: e.bar, theme: e.theme },
    // one issue per kind of fault in one track: the SDK drops an event that
    // repeats the one before it, and the same line on the next theme is a
    // fault of its own (the link without its second names the track)
    fingerprint: caught ? ['caught-fault', kind, e.what]
      : ['sound-fault', e.kind, link.replace(/([?&])t=\d+&?/, '$1').replace(/[?&]$/, '')],
  };
}

/** Start reporting the ledger's faults for this transport. Returns the way to stop. */
export function reportFaults(control: Transport): () => void {
  const scan = () => {
    for (const e of all()) {
      if (e.n <= last) continue;
      last = e.n;
      if (!isReported(e) || !reportsRunning()) continue;
      // the caps (`REPORT_CAPS`): each kind once a session, six in all
      // (a caught error by its own kind: a planner's bug does not use up the tick's)
      const kind = reportedAs(e);
      if ((sentKinds.get(kind) || 0) >= REPORT_CAPS.perKind || sentAll >= REPORT_CAPS.perSession) continue;
      sentKinds.set(kind, (sentKinds.get(kind) || 0) + 1);
      sentAll += 1;
      // **The reporter never throws into whoever wrote the line** (R1): a line is
      // written from inside a catch, a tick or a start, and a link that cannot
      // be written (a `link` fault is exactly that) is sent as none.
      let link = '', engine = '';
      try {
        const r = control.readout();
        const second = r && e.bar > 0 ? Math.floor((e.bar - 1) * r.barSeconds) : 0;
        engine = control.state.strategyTo ?? control.state.strategy;
        link = control.link.withTime(second);
      } catch (err) { /* sent without it */ }
      const ev = faultEvent(e, link, engine);
      // an event built whole, so the SDK adds no stack of its own: a fault is
      // not where in the code, it is where in the track
      try { Sentry.captureEvent({ message: ev.message, level: ev.level, tags: ev.tags, extra: ev.extra, fingerprint: ev.fingerprint }); } catch (err) { /* the SDK's own */ }
    }
  };
  // the lines written before the page started listening (a link read at the
  // open, the first plan) are reported too
  scan();
  return watch(scan);
}
