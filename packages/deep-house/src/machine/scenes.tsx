// **The SCENES block** (PLAN-DESK D3, 10-04): the desk as it stands, kept by
// name in this browser, and recalled by name later — in this theme or
// another, in this session or the next.
//
// Eugene's decision (10-04): *nothing outlives the view unless saved by name*.
// The unsaved desk still goes with the view; a saved one is a scene, kept per
// viewer the way the page keeps the viewer's other choices (`desk.ts`,
// `SCENES_KEY`), **never in the address and never in a link**: the link stays
// the promise of the composition.
//
// One field and SAVE (a name already kept is saved over, and the ledger says
// so); then the scenes, newest first, each with RECALL and a delete that asks
// for a second press rather than a dialog. The scene a recall armed is marked,
// and marked again when the desk has moved since. Each scene says how much of
// it the theme playing can use — a strip for a voice on no lane, a device
// line of an instrument this theme does not play, a stage line on a box it
// does not build — counted and drawn dim.
//
// Public tier: the machine view is public and a scene carries nothing
// private, so the block is drawn by the view itself, in the slot the side
// pane leaves for it under CAPTURE and DRAW.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Control } from '../control.ts';
import type { MachineSnapshot } from './model.ts';
import { rowOfTimbre } from '@deep-house/engine/voices';
import { note } from '../ledger.ts';
import { SCENES_KEY, SCENE_NAME_MAX, deskFor, dropScene, keepScene, sayCounts, sceneFit, shelf } from './desk.ts';
import type { Scene } from './desk.ts';
import { keyHelp } from './help.tsx';

/** How long a delete waits for its second press. */
const SURE_MS = 3000;

/** When a scene was saved, as the list says it: the day and the minute. */
const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** The engine as the link counts it: `v2`, never its long name. */
const engineOf = (id: string): string => (/-(v\d+)$/.exec(id)?.[1] ?? id);

export function Scenes({ control, snap }: { control: Control; snap: MachineSnapshot }) {
  const desk = deskFor(control);
  const armed = useSyncExternalStore(control.subscribe, desk.armed, desk.armed);
  // the table is read again after this block writes it, and when another tab does
  const [version, setVersion] = useState(0);
  const kept = useMemo(() => shelf(), [version]);
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === SCENES_KEY || e.key === null) setVersion((v) => v + 1); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  const [name, setName] = useState('');
  const [line, setLine] = useState('');
  const [sure, setSure] = useState<string | null>(null);
  const sureTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(sureTimer.current), []);

  // what the theme playing has: the voices on its lanes and the rows their timbres play, and the boxes its graph builds
  const record = control.state.mix ? control.state.mix.record : null;
  const lanesKey = snap.lanes.map((l) => `${l.playing.join(',')}:${JSON.stringify(l.timbres)}`).join('|');
  const fits = useMemo(() => {
    const voices = new Set<string>();
    for (const l of snap.lanes) {
      for (const v of l.playing) voices.add(v);
      for (const [v, ts] of Object.entries(l.timbres)) for (const t of ts) { const row = rowOfTimbre(v, t); if (row) voices.add(row); }
    }
    const built = (path: string): boolean | null => (record ? record.graph.stageHow(path) !== 'absent' : null);
    return new Map(kept.scenes.map((s) => [s.head.name, sceneFit(s, { voices, built })]));
  }, [lanesKey, record, kept]); // the lanes by what they play, not by the snapshot that carries them

  const trimmed = name.trim().slice(0, SCENE_NAME_MAX);
  const save = () => {
    if (!trimmed) return;
    const scene = desk.scene(trimmed);
    const got = keepScene(scene);
    if (!got.ok) { setLine(`not saved: ${got.why}`); return; }
    const counts = sayCounts(scene);
    note('desk', `the scene '${trimmed}' was ${got.over ? 'saved over' : 'saved'}: ${counts}`, { scene: trimmed, seed: scene.head.seed, theme: scene.head.theme, engine: scene.head.engine });
    setLine(`${got.over ? 'saved over' : 'saved'} '${trimmed}': ${counts}`);
    setName('');
    setVersion((v) => v + 1);
  };
  const recall = (s: Scene) => {
    const got = desk.apply(s);
    setLine(`recalled '${s.head.name}'${got.skipped.length ? `: ${got.skipped.length} left out, this page has none of ${got.skipped.join(', ')}` : ''}`);
  };
  const remove = (s: Scene) => {
    window.clearTimeout(sureTimer.current);
    if (sure !== s.head.name) {
      setSure(s.head.name);
      sureTimer.current = window.setTimeout(() => setSure(null), SURE_MS);
      return;
    }
    setSure(null);
    const got = dropScene(s.head.name);
    if (!got.ok) { setLine(`not deleted: ${got.why}`); return; }
    note('desk', `the scene '${s.head.name}' was deleted`, { scene: s.head.name });
    setLine(`deleted '${s.head.name}'`);
    setVersion((v) => v + 1);
  };

  const status = line
    || (kept.later !== null ? 'the scenes here were kept by a later page: this one leaves them be'
      : kept.spoiled ? `${kept.spoiled} kept ${kept.spoiled === 1 ? 'entry' : 'entries'} could not be read`
        : kept.scenes.length ? '' : 'the desk as it stands, kept in this browser by name; never in a link');
  return (
    <>
      <form className="scene-save" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input type="text" className="scene-name" value={name} maxLength={SCENE_NAME_MAX} placeholder="a name" aria-label="Scene name"
          spellCheck={false} autoComplete="off" enterKeyHint="done" {...keyHelp('key:save')}
          onChange={(e) => setName(e.currentTarget.value)} />
        <button type="submit" className="pane-key scene-key" aria-label="Save the desk as a scene" disabled={!trimmed || kept.later !== null}
          title={kept.scenes.some((s) => s.head.name === trimmed) ? `Save the desk over '${trimmed}'` : 'Save the desk as it stands under this name'} {...keyHelp('key:save')}>
          {kept.scenes.some((s) => s.head.name === trimmed) ? 'save over' : 'save'}
        </button>
      </form>
      <div className="scene-line" role="status" title={status}>{status}</div>
      {kept.scenes.length ? (
        <ul className="scene-list" aria-label="saved scenes">
          {kept.scenes.map((s) => {
            const isArmed = !!armed && armed.name === s.head.name;
            const fit = fits.get(s.head.name);
            const out = fit && fit.out ? `${fit.out} of ${fit.lines} lines not in this theme` : '';
            return (
              <li key={s.head.name} className={`scene${isArmed ? ' armed' : ''}${isArmed && armed!.dirty ? ' dirty' : ''}${fit && fit.lines && fit.out === fit.lines ? ' away' : ''}`}
                data-scene={s.head.name} data-out={fit ? fit.out : 0} data-lines={fit ? fit.lines : 0}>
                <div className="scene-head">
                  <svg width={9} height={9} aria-hidden="true" className="scene-lamp">
                    <circle cx={4.5} cy={4.5} r={3.5} className={isArmed ? (armed!.dirty ? 'lamp dirty' : 'lamp armed') : 'lamp'} />
                  </svg>
                  <span className="scene-title" title={s.head.name}>{s.head.name}</span>
                  {isArmed ? <span className="scene-mark">{armed!.dirty ? 'moved since' : armed!.waiting ? 'armed · bands wait' : 'armed'}</span> : null}
                </div>
                <div className="scene-facts" title={fit && fit.outs.length ? `not in this theme: ${fit.outs.join(', ')}` : undefined}>
                  <span>{sayCounts(s)}</span>
                  {out ? <span className="scene-out"> · {out}</span> : null}
                </div>
                <div className="scene-where">seed {s.head.seed} · theme {s.head.theme + 1} · {engineOf(s.head.engine)} · {when(s.head.saved)}</div>
                <div className="scene-keys">
                  <button type="button" className="pane-key scene-key" aria-label={`Recall ${s.head.name}`} onClick={() => recall(s)}
                    title={`Recall '${s.head.name}': the desk cleaned, then this scene on it`} {...keyHelp('key:recall')}>recall</button>
                  <button type="button" className={`pane-key scene-key${sure === s.head.name ? ' sure' : ''}`} aria-label={sure === s.head.name ? `Press again to delete ${s.head.name}` : `Delete ${s.head.name}`}
                    onClick={() => remove(s)} title={sure === s.head.name ? 'Press again to delete it' : 'Delete: a second press deletes it'} {...keyHelp('key:delete')}>
                    {sure === s.head.name ? 'sure?' : 'delete'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

export default Scenes;
