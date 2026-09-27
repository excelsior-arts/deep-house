// The flip: the same page, the engineer's face.
//
// This is the whole of what the ring's page loads when somebody taps the panel
// mark in the corner or arrives with `?view=machine`, and it is a chunk of its own — the ring's
// bundle carries nothing of it, not React, not a byte of the stylesheet, until
// the moment it is asked for.
//
// **The music never stops across the flip**, because the flip is not a
// transport operation: not one line of this file touches the mix. What it does
// is put a sheet of CSS on the page, stamp `data-view` on the root element,
// build its own `#machine` and *move the ring into it* — the same SVG, still
// live, still subscribed, scaled by the panel it now sits in. Closing moves it
// back to exactly where it came from and takes the sheet and the attribute
// away, which is why the four untouched pictures of the ring are byte for byte
// what they were: with the view closed there is nothing of it on the page at
// all.
//
// There is no `StrictMode` here, and that is deliberate rather than an
// omission. Its double invocation is a fine thing to have over a tree that owns
// its own DOM, and this tree owns one element it did not make — the ring — so a
// mount that ran twice would move the sigil out of the page and put it back
// under a panel React was in the middle of replacing. The view is small, its
// state is one immutable snapshot, and what it would have caught is a class of
// bug it has no room for.

import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Machine } from './view.tsx';
import { makeStore } from './store.ts';
import type { MachineStore } from './store.ts';
import { SHEET } from './look.ts';
import { note } from '../ledger.ts';
import { deskFor } from './desk.ts';
import type { Control } from '../control.ts';

/** What the page holds on to while the view is open. */
export interface MachineView {
  close(): void;
  store: MachineStore;
  /** the snapshot the view is drawing, for a check to read */
  snapshot(): ReturnType<MachineStore['getSnapshot']>;
  /** the diagram's own markup, which is what the headless export writes */
  svg(): string;
}

const SHEET_ID = 'machineSheet';
const HOST_ID = 'machine';
const STAGE_ID = 'stage';
const DIAGRAM_ID = 'machineDiagram';

/**
 * @param exit how the view's own ways out close it (CLOSE in the toolbar
 *   under the ring, M13, and a still press on the dark round the ring) — the page's
 *   close, which takes `view=machine` off the address and gives the ring its
 *   focus back; without one they close the view alone
 */
export function openMachineView(control: Control, exit?: () => void): MachineView {
  const doc = document;
  // Nothing to describe before a set has been planned: refused before a single
  // thing is put on the page, rather than drawn from a snapshot that is null.
  if (!control.readout()) throw new Error('the machine view has nothing to describe before a set is planned');

  const style = doc.createElement('style');
  style.id = SHEET_ID;
  style.textContent = SHEET;
  doc.head.appendChild(style);
  doc.documentElement.setAttribute('data-view', 'machine');

  const host = doc.createElement('div');
  host.id = HOST_ID;
  doc.body.appendChild(host);

  // Where the ring lives when the view is closed, so it can be put back in
  // exactly the place it came from and not merely somewhere in the body.
  const stage = doc.getElementById(STAGE_ID);
  const homeParent = stage ? stage.parentNode : null;
  const homeBefore = stage ? stage.nextSibling : null;

  const store = makeStore(control);
  const root: Root = createRoot(host);

  // Everything the open put on the page, taken off again: the close, and the
  // rollback of an open that threw half way (R130) — which used to leave the
  // sheet, `data-view` and the ring moved into a panel that was never drawn.
  let mounted = false;
  let view: MachineView | null = null;
  const leave = () => { if (exit) exit(); else if (view) view.close(); };
  const takeDown = () => {
    // The taps come out first, before a single box goes: a tap outliving the
    // thing that made it is the one fault round K6 found in its own gates.
    store.close();
    // What was set in the view goes with it: the set plays on clean, and the
    // master at the room.
    deskFor(control).release();
    control.resetSources();
    // The ring goes home before React unmounts the panel it is standing in,
    // or React would take the sigil away with the panel.
    if (stage && homeParent && stage.parentNode !== homeParent) {
      if (homeBefore && homeBefore.parentNode === homeParent) homeParent.insertBefore(stage, homeBefore);
      else homeParent.appendChild(stage);
    }
    if (mounted) root.unmount();
    host.remove();
    style.remove();
    doc.documentElement.removeAttribute('data-view');
  };

  // The ring goes into the panel the moment React has made one, and it is the
  // element itself that moves: no clone, no second render, no second set of
  // handlers. Its own pointer code reads `getBoundingClientRect`, so it works
  // in the panel exactly as it works in the window.
  const ringHost = (el: HTMLDivElement | null) => {
    if (el && stage && stage.parentNode !== el) el.appendChild(stage);
  };

  try {
    // Synchronously, so whatever asked for the view — a key, a query string, a
    // headless export — can read the diagram in the same turn.
    mounted = true;
    flushSync(() => {
      root.render(<Machine store={store} control={control} ringHost={ringHost} exit={leave} />);
    });
    store.open();
  } catch (err) {
    takeDown();
    throw err;
  }
  // The private tier's CAPTURE block, into the left column's slot above ENGINE (`./private/record-tools.tsx`): a dev or preview build only, and nothing at all in a release.
  if (typeof __PRIVATE_TOOLS__ !== 'undefined' && __PRIVATE_TOOLS__) for (const load of Object.values(import.meta.glob<{ mountRecordTools(c: Control, host: HTMLElement): void }>('./private/record-tools.tsx'))) void load().then((m) => m.mountRecordTools(control, host));
  const facts = store.facts();
  note('transport', 'the machine view was opened', {
    fps: facts.fps, taps: facts.taps, reduced: facts.reduced, coarse: facts.coarse,
  });

  let closed = false;
  view = {
    store,
    snapshot: () => store.getSnapshot(),
    svg: () => {
      const el = doc.getElementById(DIAGRAM_ID);
      return el ? el.outerHTML : '';
    },
    close() {
      if (closed) return;
      closed = true;
      note('transport', 'the machine view was closed');
      takeDown();
    },
  };
  return view;
}

export default openMachineView;
