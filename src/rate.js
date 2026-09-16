// A listening bench, not part of the instrument.
//
// Loaded only for ?rate=1, so the page that ships never fetches it. It puts a
// plain panel under the ring where a moment can be marked from −3 to +3 over
// one of three lengths, and writes down everything the generator would need to
// make that moment again: the dice, the plan, the chord, and the events of the
// range themselves. The ring is not touched.

const CLASSES = [
  { id: 'riff', word: 'riff', seconds: 1.5 },
  { id: 'phrase', word: 'phrase', seconds: 5 },
  { id: 'segment', word: 'segment', seconds: 10 },
];
const KEY = 'deep-house.ratings';
// A class is a length in seconds and nothing else — it does not move with the
// tempo — so a label can say the span outright and a score is always read
// against a stated one.
const spanText = (s) => `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
// how long after a mark a note still belongs to it
const NOTE_GRACE = 8000;
const MAX_BYTES = 20000;
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const css = `
/* The bench takes a band of its own at the foot of the page and the ring is
   given what is left, so nothing of it ever sits over the sigil. */
html[data-rate] #stage { bottom: var(--rate-h, 160px); }
html[data-rate] #tilt {
  width: min(94vw, calc((100vh - var(--rate-h, 160px)) * 0.94), 960px);
  height: min(94vw, calc((100vh - var(--rate-h, 160px)) * 0.94), 960px);
  width: min(94vw, calc((100dvh - var(--rate-h, 160px)) * 0.94), 960px);
  height: min(94vw, calc((100dvh - var(--rate-h, 160px)) * 0.94), 960px);
}
html[data-rate] #mark {
  position: static; transform: none; left: auto; right: auto; bottom: auto;
  opacity: 0.4; font-size: 9px;
}

#rate {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 4;
  padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; align-items: stretch; gap: 5px;
  background: #000; border-top: 1px solid rgba(242, 193, 78, 0.45);
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
  color: #f2c14e;
}
#rate .row { display: flex; gap: 5px; align-items: center; justify-content: center; flex-wrap: wrap; }
/* the note has the line to itself: the chips that used to share it named
   instruments he could not always name, and the note says it better */
#rate .noteline { flex-wrap: wrap; gap: 6px; }
#rate .split { gap: 14px; }
/* the seconds a class covers, and the span a score is read against: lower
   case inside an upper-case band, because "5 S" is not a unit */
#rate .secs { text-transform: none; opacity: 0.7; }
#rate .span { text-transform: none; opacity: 0.6; white-space: nowrap; }
#rate button {
  font: inherit; letter-spacing: inherit; text-transform: inherit;
  background: transparent; color: #f2c14e; opacity: 0.85;
  border: 1px solid rgba(242, 193, 78, 0.45); border-radius: 3px;
  min-height: 32px; padding: 0 11px; cursor: pointer;
  transition: opacity 140ms ease, border-color 140ms ease, background 140ms ease;
}
#rate button:hover { opacity: 1; border-color: rgba(255, 233, 168, 0.9); }
#rate button[aria-pressed='true'] { background: rgba(242, 193, 78, 0.16); border-color: #ffe9a8; color: #ffe9a8; }
#rate button.hit { background: #ffe9a8; color: #000; border-color: #ffe9a8; transition: none; }
#rate .dot { opacity: 0.35; }
#rate input {
  font: inherit; letter-spacing: 0.16em; text-transform: none;
  background: transparent; color: #ffe9a8; flex: 1 1 auto; width: 100%;
  border: 0; border-bottom: 1px solid rgba(242, 193, 78, 0.45);
  min-height: 32px; padding: 0 4px; outline: none;
}
#rate input::placeholder { color: #f2c14e; opacity: 0.4; letter-spacing: 0.24em; text-transform: uppercase; }
#rate input:focus { border-bottom-color: #ffe9a8; }
#rate .log {
  display: flex; flex-direction: column; gap: 0; max-height: 64px; overflow-y: auto;
  font-size: 10px; letter-spacing: 0.12em; opacity: 0.7; text-transform: none;
  scrollbar-width: none;
}
#rate .log::-webkit-scrollbar { display: none; }
#rate .log .ln { display: flex; align-items: center; gap: 6px; min-height: 32px; }
#rate .log .txt { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; }
#rate .log .txt:hover { color: #ffe9a8; }
/* The cross is small to look at and big to hit: the padding makes a proper
   target and the negative margin keeps the line its own height. */
/* The cross gets a target of its own inside the line, never spilling over the
   line above or below it. */
#rate .log .x {
  flex: 0 0 auto; align-self: stretch; min-height: 32px; border: 0;
  background: transparent; color: #f2c14e; opacity: 0.5; font-size: 13px;
  line-height: 1; padding: 0 10px; cursor: pointer;
}
#rate .log .x:hover { opacity: 1; color: #ffe9a8; }
#rate .log .undo { cursor: pointer; opacity: 0.8; }
#rate .log .undo:hover { color: #ffe9a8; }
@media (pointer: coarse) {
  #rate .log { max-height: 80px; }
  #rate .log .ln { min-height: 40px; }
  #rate .log .x { min-height: 40px; padding: 0 12px; }
}
#rate .meta { opacity: 0.6; font-size: 10px; gap: 10px; }
/* what the bench says back: over the log rather than in the flow, so the band
   keeps its height and the ring never jumps to make room for a sentence */
#rate .said {
  position: absolute; left: 10px; right: 10px; top: 8px; text-align: center;
  pointer-events: none; color: #ffe9a8; font-size: 10px; letter-spacing: 0.2em;
  opacity: 0; transition: opacity 700ms ease;
}
#rate .said[data-on='1'] { opacity: 0.95; transition: none; }

#ratelog {
  position: fixed; inset: 0; z-index: 9; background: #000;
  display: flex; flex-direction: column; color: #f2c14e;
  font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px calc(10px + env(safe-area-inset-bottom, 0px));
}
#ratelog header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  padding-bottom: 8px; border-bottom: 1px solid rgba(242, 193, 78, 0.45); }
#ratelog header input {
  font: inherit; letter-spacing: 0.16em; text-transform: none; background: transparent;
  color: #ffe9a8; flex: 1 1 160px; border: 0; border-bottom: 1px solid rgba(242, 193, 78, 0.45);
  min-height: 32px; padding: 0 4px; outline: none;
}
#ratelog button {
  font: inherit; letter-spacing: inherit; text-transform: inherit; background: transparent;
  color: #f2c14e; border: 1px solid rgba(242, 193, 78, 0.45); border-radius: 3px;
  min-height: 32px; padding: 0 11px; cursor: pointer; opacity: 0.85;
}
#ratelog button:hover { opacity: 1; border-color: #ffe9a8; }
#ratelog .list { flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; }
#ratelog .r { display: flex; align-items: center; gap: 8px; min-height: 36px;
  border-bottom: 1px solid rgba(242, 193, 78, 0.12); font-size: 10px; letter-spacing: 0.1em; }
#ratelog .r .txt { flex: 1 1 auto; text-transform: none; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; cursor: pointer; opacity: 0.8; }
#ratelog .r .txt:hover { opacity: 1; color: #ffe9a8; }
#ratelog .r.dead .txt { cursor: default; opacity: 0.45; }
#ratelog .r .x { flex: 0 0 auto; border: 0; background: transparent; color: #f2c14e;
  opacity: 0.5; font-size: 13px; min-height: 36px; padding: 0 10px; cursor: pointer; }
#ratelog .r .x:hover { opacity: 1; color: #ffe9a8; }
#ratelog .r .undo { cursor: pointer; opacity: 0.85; text-transform: none; }
#ratelog .empty { opacity: 0.4; padding: 14px 2px; text-transform: none; }
@media (pointer: coarse) {
  #ratelog button, #ratelog header input { min-height: 40px; }
  #ratelog .r, #ratelog .r .x { min-height: 44px; }
}
@media (pointer: coarse) {
  #rate button { min-height: 40px; padding: 0 13px; }
  #rate input { min-height: 40px; }
}
@media (max-width: 520px) {
  #rate { font-size: 10px; letter-spacing: 0.14em; }
  #rate .split { flex-direction: column; gap: 6px; }
}
`;

const el = (tag, attrs, parent, text) => {
  const n = document.createElement(tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
function save(rows) {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) { /* full or blocked */ }
}

// Which build a rating or a capture came from. This used to look for a `?v=`
// on the page's script tag, which nothing has ever written: every rating made
// on the published site said `dev`, and a report of a fault could not be tied
// to the code that had it. Two things name it now. `__BUILD__` is stamped in
// at build time (see vite.config.js) and is the version with a short hash of
// the source it was built from; the bundle's own file name carries a hash of
// its contents, and after a build `import.meta.url` is that file.
const BUILD = typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__;

function buildStamp() {
  let asset = '';
  try {
    // `assets/deep-house-<hash>.js`, the name vite.config.js gives the one
    // script; the hash can hold a dash of its own, so it is what is left after
    // the name and not the last piece of it. In development the module is its
    // own file and there is no hash to read.
    const file = (import.meta.url || '').split('/').pop().split('?')[0];
    const m = /^deep-house-(.+)\.js$/.exec(file);
    if (m) asset = m[1];
  } catch (e) { /* no import.meta here */ }
  return asset ? `${BUILD}·${asset}` : BUILD;
}

export function installRatings(control) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.documentElement.dataset.rate = '1';
  const panel = el('div', { id: 'rate' }, document.body);
  const logBox = el('div', { class: 'log' }, panel);
  const rowNote = el('div', { class: 'row noteline' }, panel);
  const rowMid = el('div', { class: 'row split' }, panel);
  const rowLen = el('div', { class: 'row' }, rowMid);
  const rowRate = el('div', { class: 'row' }, rowMid);
  const rowMeta = el('div', { class: 'row meta' }, panel);
  // One line the bench says back to him, over the log's own place — which is
  // empty at the moment it has most to say — and gone again on its own. It
  // takes no room in the band, so nothing the ring is given moves.
  const said = el('div', { class: 'said' }, panel, '');
  let sayTimer = null;
  function say(text) {
    said.textContent = text;
    said.dataset.on = '1';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { said.dataset.on = '0'; }, 2200);
  }

  // The band's height is what the ring is given back; it is measured rather
  // than guessed, because the rows wrap differently at every width.
  const fit = () => {
    document.documentElement.style.setProperty('--rate-h', `${panel.offsetHeight}px`);
  };
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(panel);

  const note = el('input', { type: 'text', placeholder: 'note', spellcheck: 'false',
    autocomplete: 'off', autocapitalize: 'off' }, rowNote);
  // the ring's own gestures are not this field's business, and neither is it
  // the ring's: a click here must not reach the sigil underneath
  for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel']) {
    panel.addEventListener(ev, (e) => e.stopPropagation());
  }

  let klass = CLASSES[1];
  // Each class says how much time it covers, because the words alone left him
  // guessing how far back a score reached.
  const lenButtons = CLASSES.map((c) => {
    const b = el('button', { type: 'button', 'data-class': c.id, 'aria-pressed': String(c === klass) }, rowLen, c.word);
    el('span', { class: 'secs' }, b, ` · ${spanText(c.seconds)}`);
    b.addEventListener('click', () => setClass(c));
    return b;
  });
  // and the score buttons say it again beside them, so a mark is never given
  // without the span it is given over
  const spanBox = el('span', { class: 'span' }, rowRate, '');
  function setClass(c) {
    klass = c;
    for (const b of lenButtons) b.setAttribute('aria-pressed', String(b.dataset.class === c.id));
    spanBox.textContent = `the last ${spanText(c.seconds)}`;
  }
  setClass(klass);

  const rateButtons = [];
  for (const v of [-3, -2, -1, 1, 2, 3]) {
    if (v === 1) el('span', { class: 'dot' }, rowRate, '·');
    const b = el('button', { type: 'button', 'data-v': String(v) }, rowRate, v > 0 ? `+${v}` : String(v));
    b.addEventListener('click', () => rate(v));
    rateButtons.push(b);
  }

  const count = el('span', {}, rowMeta, '');
  el('span', { class: 'dot' }, rowMeta, '·');
  const dl = el('button', { type: 'button', 'data-act': 'download' }, rowMeta, 'download log');
  el('span', { class: 'dot' }, rowMeta, '·');
  const openLog = el('button', { type: 'button', 'data-act': 'log' }, rowMeta, 'log');
  el('span', { class: 'dot' }, rowMeta, '·');
  const cap = el('button', { type: 'button', 'data-act': 'capture' }, rowMeta, 'capture');
  cap.addEventListener('click', () => (capturing ? stopCapture() : startCapture()));
  el('span', { class: 'dot' }, rowMeta, '·');
  const clr = el('button', { type: 'button', 'data-act': 'clear' }, rowMeta, 'clear');
  el('span', { class: 'dot' }, rowMeta, '·');
  // which wire the set leaves by; changing it reloads, since the choice is
  // made when the context is built
  const mode = control.out === 'direct' ? 'direct' : 'element';
  const outBtn = el('button', { type: 'button', 'data-act': 'out' }, rowMeta, `output: ${mode}`);
  outBtn.title = mode === 'direct'
    ? 'straight to the context: no lock-screen card'
    : 'through the audio element: lock-screen card and background play';
  outBtn.addEventListener('click', () => {
    // Both ways are asked for by name. Deleting the parameter asked for the
    // default, which on anything but an Apple phone is the mode we are already
    // in, so the button did nothing.
    const u = new URL(location.href);
    u.searchParams.set('out', mode === 'direct' ? 'element' : 'direct');
    location.href = u.toString();
  });

  // what the browser gave us for an output buffer, which is where a click on a
  // busy machine comes from
  el('span', { class: 'dot' }, rowMeta, '·');
  const timing = el('span', {}, rowMeta, '');
  const showTiming = () => {
    const t = control.timing ? control.timing() : null;
    timing.textContent = !t || t.rate == null
      ? `latency ${t ? t.hint : '?'}`
      : `${(t.rate / 1000).toFixed(1)}k · buf ${t.base == null ? '?' : t.base} ms` +
        `${t.output == null ? '' : ` · out ${t.output} ms`} · ${t.hint}`;
  };
  showTiming();
  setInterval(showTiming, 2000);

  // Notes the scheduler handed over after their moment had passed. The count
  // is read wherever it is offered — the debug surface first, the dsp module
  // if that is all there is — and a jump is written into the log, so a
  // listening session records that the machine stumbled.
  el('span', { class: 'dot' }, rowMeta, '·');
  const lateBox = el('span', {}, rowMeta, 'late 0');
  let lateSeen = 0;
  let lateFn = null;
  import('./dsp.js').then((m) => {
    if (typeof m.lateInfo === 'function') lateFn = () => { const i = m.lateInfo(); return { n: i.count, dt: i.last, cause: i.cause }; };
    else if (typeof m.lateCount === 'function') lateFn = () => ({ n: m.lateCount(), dt: null });
  }).catch(() => {});

  const readLate = () => {
    const d = window.deepHouse;
    try {
      if (d) {
        if (typeof d.lateCount === 'function') return { n: d.lateCount(), dt: d.lateDelta };
        if (d.late && typeof d.late.n === 'number') return { n: d.late.n, dt: d.late.dt, cause: d.late.cause };
        if (typeof d.lateStarts === 'number') return { n: d.lateStarts, dt: d.lateDelta };
      }
    } catch (e) { /* the surface is somebody else's */ }
    return lateFn ? lateFn() : null;
  };

  const showLate = () => {
    const v = readLate();
    if (!v || typeof v.n !== 'number') { lateBox.textContent = 'late —'; return; }
    lateBox.textContent = `late ${v.n}${v.dt ? ` · ${Math.round(v.dt * 1000)} ms` : ''}`;
    lateBox.style.color = v.n > 0 ? '#ffe9a8' : '';
    lateBox.style.opacity = v.n > 0 ? '1' : '';
    if (v.n > lateSeen) {
      const jumped = v.n - lateSeen;
      lateSeen = v.n;
      noteLate(jumped, v.dt, v.cause);
    }
  };
  setInterval(showLate, 1000);

  const mark = document.getElementById('mark');
  if (mark) rowMeta.appendChild(mark);

  let seq = 0;
  let rows = load();
  for (const r of rows) if (!r.id) r.id = `${Date.parse(r.at).toString(36)}-${(seq++).toString(36)}`;
  // A stumble the machine wrote down is not a mark he made, so it is counted
  // beside them rather than among them — here, in the log's own header and in
  // what a hand-off says it handed over.
  const marksIn = (list) => list.filter((e) => e.kind !== 'late');
  const countText = () => {
    const n = marksIn(rows).length;
    const late = rows.length - n;
    return `${n} ${n === 1 ? 'mark' : 'marks'}${late ? ` · ${late} late` : ''}`;
  };
  const showCount = () => { count.textContent = countText(); };
  showCount();
  fit();

  // A download is a hand-off and not a copy: the marks of a session leave the
  // bench in the file and the bench is empty for the next one, so a session is
  // never read twice or read half against the wrong seed. The clearing happens
  // only once the file is actually in the browser's hands — if building it
  // throws, nothing is lost and the marks are still there to try again.
  function downloadLog() {
    if (!rows.length) { say('nothing to hand off'); return false; }
    const handed = marksIn(rows).length;
    const stumbles = rows.length - handed;
    let url = null;
    try {
      // The file says which build made the marks and how many it carries,
      // beside the marks themselves; a bare array said neither. The stumbles
      // the machine wrote down travel with them but are counted apart, since
      // they are not opinions.
      const doc = {
        build: buildStamp(),
        at: new Date().toISOString(),
        count: handed,
        lateCount: stumbles,
        marks: rows,
      };
      const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deep-house-ratings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) {
      if (url) URL.revokeObjectURL(url);
      say('the log could not be written');
      return false;
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    rows = [];
    save(rows);
    logBox.textContent = '';
    showCount();
    if (overlay && overlay.dataset.open === '1') paintList();
    say(`${handed} ${handed === 1 ? 'mark' : 'marks'} handed off`);
    return true;
  }
  dl.addEventListener('click', downloadLog);
  clr.addEventListener('click', () => {
    if (!rows.length || !confirm(`Throw away ${rows.length} marks?`)) return;
    rows = [];
    save(rows);
    logBox.textContent = '';
    showCount();
  });

  // --- what a mark is made of ---------------------------------------------
  function entry(value) {
    const r = control.readout();
    if (!r) return null;
    const idx = r.mix.themeIndex - 1;             // the readout counts from one
    const track = control.planned(idx);
    const bs = track.barSeconds;
    const t1 = Math.min(r.seconds, track.bars * bs);
    const t0 = Math.max(0, t1 - klass.seconds);
    const bar0 = t0 / bs;
    const bar1 = t1 / bs;

    const layersByBar = [];
    for (let b = Math.floor(bar0); b <= Math.min(track.bars - 1, Math.floor(bar1)); b++) {
      const row = track.timeline[b];
      if (row) layersByBar.push({ bar: b, section: row.section, chord: row.chord, layers: row.layers.slice() });
    }

    const byLayer = {};
    const counts = {};
    for (const ev of track.events) {
      if (ev.t < t0 || ev.t >= t1) continue;
      const k = ev.layer || ev.voice;
      counts[k] = (counts[k] || 0) + 1;
      (byLayer[k] = byLayer[k] || []).push({
        t: +ev.t.toFixed(4), bar: ev.bar, step: ev.step, voice: ev.voice,
        note: ev.note, midi: ev.p && ev.p.midi, vel: ev.p && ev.p.vel && +ev.p.vel.toFixed(3),
      });
    }

    const e = {
      // a stamp can repeat inside a millisecond, and a mark has to be findable
      id: `${Date.now().toString(36)}-${(seq++).toString(36)}`,
      at: new Date().toISOString(),
      build: buildStamp(),
      rating: value,
      lengthClass: klass.id,
      lengthSeconds: klass.seconds,
      masterSeed: r.seed,
      theme: {
        index: r.mix.themeIndex, seed: track.seed, preset: track.preset, room: track.presetLabel,
        bpm: track.bpm, key: track.key.name, scale: track.key.scaleName, root: track.key.root,
        bars: track.bars, barSeconds: +bs.toFixed(5), dice: track.dice,
        // The per-theme loudness trim in dB, so a mark about level can be read
        // against the level the theme was actually played at.
        trimDb: track.trimDb ?? 0,
      },
      range: { t0: +t0.toFixed(3), t1: +t1.toFixed(3), bar0: +bar0.toFixed(3), bar1: +bar1.toFixed(3) },
      section: r.section,
      chord: { name: r.chord, notes: r.chordNotes.slice() },
      layersByBar,
      eventCounts: counts,
      events: byLayer,
    };

    // Keep a mark small enough to read: if the range is thick with events,
    // the notes that carry the music stay and the rest becomes a count.
    if (JSON.stringify(e).length > MAX_BYTES) {
      e.events = {
        bass: byLayer.bass || [],
        keys: byLayer.keys || [],
        pad: byLayer.pad || [],
      };
      e.trimmed = true;
    }
    return e;
  }

  // A stumble is worth as much to a session as an opinion is.
  //
  // Two things reach this counter and they read identically once they are a
  // number: a machine that could not keep up, and a transport that aimed its
  // first notes behind the render head — which is what a pause and a play used
  // to do on every press. The second is fixed, so `cause: 'resume'` should
  // never be written again; it is written when the scheduler attributed the
  // notes within a fifth of a second of a start, so a log read a month from
  // now can say which of the two it was looking at rather than guess.
  function noteLate(jumped, dt, cause) {
    const r = control.readout();
    if (!r) return;
    const e = {
      id: `${Date.now().toString(36)}-${(seq++).toString(36)}`,
      at: new Date().toISOString(),
      kind: 'late',
      build: buildStamp(),
      lateNotes: jumped,
      lateDeltaMs: dt == null ? null : Math.round(dt * 1000),
      ...(cause ? { cause } : {}),
      masterSeed: r.seed,
      theme: { index: r.mix.themeIndex, bpm: r.bpm, key: r.key },
      range: { t0: +r.seconds.toFixed(3), t1: +r.seconds.toFixed(3), bar0: +(r.bar).toFixed(3), bar1: +(r.bar).toFixed(3) },
      section: r.section,
    };
    rows.push(e);
    save(rows);
    showCount();
    line(e);
  }

  // What a row says of itself. A stumble is written down by the machine and
  // not by him, so it says so in its own words; and a mark from before either
  // a score or a kind was written down says it has no score, rather than
  // reading `undefined undefined` and looking like something he did.
  const scoreText = (e) =>
    e.kind === 'late' ? `late · ${e.lateNotes} ${e.lateNotes === 1 ? 'note' : 'notes'}`
      : typeof e.rating !== 'number' ? 'no score'
      : `${e.rating > 0 ? '+' : ''}${e.rating}${e.lengthClass ? ` · ${e.lengthClass}` : ''}`;
  const whereText = (e) =>
    !e.range ? ''
      : e.kind === 'late' || e.range.bar1 === e.range.bar0 ? ` · bar ${Math.round(e.range.bar0) + 1}`
      : ` · bars ${e.range.bar0.toFixed(1)}-${e.range.bar1.toFixed(1)}`;
  const themeText = (e) => {
    const i = e.theme && e.theme.index;
    return i == null ? '' : ` · theme ${ROMAN[i] || i}`;
  };

  const lineText = (e) =>
    `${scoreText(e)}${themeText(e)}${whereText(e)}` + (e.note ? ` · ${e.note}` : '');

  function line(e) {
    const ln = el('div', { class: 'ln' }, null);
    ln.dataset.id = e.id;
    const s = el('span', { class: 'txt' }, ln, lineText(e));
    s.addEventListener('click', () => {
      const r = control.readout();
      if (!r || r.mix.themeIndex !== e.theme.index || !r.duration) return;
      control.seekTo(e.range.t0 / r.duration, true);
    });
    const x = el('button', { type: 'button', class: 'x', title: 'remove' }, ln, '×');
    x.addEventListener('click', () => remove(e.id));
    logBox.insertBefore(ln, logBox.firstChild);
    while (logBox.childElementCount > 6) logBox.removeChild(logBox.lastElementChild);
    return ln;
  }

  // A mark pressed by mistake goes at once; for five seconds its place in the
  // list offers it back rather than asking whether you meant it.
  function remove(id) {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    const [gone] = rows.splice(i, 1);
    save(rows);
    showCount();
    const ln = logBox.querySelector(`.ln[data-id="${id}"]`);
    if (!ln) return true;
    ln.textContent = '';
    el('span', { class: 'txt' }, ln, 'removed · ');
    const u = el('span', { class: 'undo' }, ln, 'undo');
    const drop = setTimeout(() => { if (ln.parentNode) ln.remove(); }, 5000);
    u.addEventListener('click', () => {
      clearTimeout(drop);
      rows.splice(Math.min(i, rows.length), 0, gone);
      save(rows);
      showCount();
      ln.remove();
      line(gone);
    });
    return true;
  }

  // A note typed after the mark still belongs to it, for a few seconds — to
  // the last mark *he* made, never to a stumble the machine wrote down in
  // between, and it never makes an entry of its own: with nothing of his to
  // attach to, the note is simply his next score's.
  function attachNote() {
    const text = note.value.trim();
    if (!text) { note.value = ''; return false; }
    const mine = marksIn(rows);
    const last = mine[mine.length - 1];
    // nothing of his near enough to carry it: the words stay in the field and
    // go with the score he is about to give, rather than being thrown away
    if (!last || Date.now() - Date.parse(last.at) > NOTE_GRACE) return false;
    note.value = '';
    last.note = last.note ? `${last.note} ${text}` : text;
    save(rows);
    const ln = logBox.querySelector(`.ln[data-id="${last.id}"] .txt`);
    if (ln) ln.textContent = lineText(last);
    return true;
  }

  note.addEventListener('keydown', (ev) => {
    ev.stopPropagation();                 // the rating keys are not for here
    if (ev.key === 'Enter') { attachNote(); note.blur(); ev.preventDefault(); }
    if (ev.key === 'Escape') { note.value = ''; note.blur(); ev.preventDefault(); }
  });

  function rate(value) {
    const e = entry(value);
    if (!e) return;
    // a note already typed belongs to the mark being made
    const typed = note.value.trim();
    if (typed) { e.note = typed; note.value = ''; }
    rows.push(e);
    save(rows);
    showCount();
    line(e);
    const b = rateButtons.find((x) => Number(x.dataset.v) === value);
    if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180); }
  }

  // --- the page's own output, written down exactly ------------------------
  //
  // Taken off the stream the <audio> element plays, in the context's own rate,
  // through a processor that copies the floats it is handed: no encoder, no
  // resampler, no gain. What lands in the file is what left the mix.
  const CAPTURE_SECONDS = 20;
  let capturing = null;

  function wavOf(chans, rate) {
    const n = chans[0].length;
    const ch = chans.length;
    const buf = new ArrayBuffer(44 + n * ch * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true);
    v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * ch * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        const x = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        o += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // The capture taps the set's own last node and reads it on the audio
  // thread.
  //
  // It used to take `sink.stream` back through `createMediaStreamSource` into
  // a `ScriptProcessorNode(4096)`. Both halves of that were wrong. The
  // MediaStream round trip re-clocks the audio through the browser's media
  // pipeline, and a ScriptProcessor's callback runs on the *main* thread —
  // the same thread that builds a kick, a bass note, two hats and a chord at
  // once on every beat — so a block was late whenever the scheduler was busy
  // and the written PCM had a step in it. MEASURED on a capture Eugene made:
  // bursts every 28672 samples, which is exactly seven 4096-frame blocks, at
  // a fixed offset inside the block; the beat at that tempo is 28628 samples,
  // so they followed the capture's clock and not the music, drifting away
  // from the drum they appeared to sit on. The rendered audio of the same
  // bars is clean 17 dB further down.
  // The tap fills a block and hands the block over. A message a quantum — two
  // new arrays and a structured clone every 128 frames, 375 times a second —
  // was allocation on the audio thread's own clock. A block of 4096 frames is
  // twelve messages a second and its buffers are transferred rather than
  // copied; the price is that a capture stopped by hand loses the part-block
  // it was filling, which is the last eighty-five milliseconds.
  const WORKLET = `
    class Tap extends AudioWorkletProcessor {
      constructor() {
        super();
        this.size = 4096;
        this.left = new Float32Array(this.size);
        this.right = new Float32Array(this.size);
        this.at = 0;
      }
      flush() {
        if (!this.at) return;
        const l = this.left.slice(0, this.at);
        const r = this.right.slice(0, this.at);
        this.at = 0;
        this.port.postMessage([l, r], [l.buffer, r.buffer]);
      }
      process(inputs) {
        const inp = inputs[0];
        if (inp && inp.length) {
          const l = inp[0];
          const r = inp[1] || inp[0];
          for (let i = 0; i < l.length; i++) {
            this.left[this.at] = l[i];
            this.right[this.at] = r[i];
            if (++this.at === this.size) this.flush();
          }
        }
        return true;
      }
    }
    registerProcessor('capture-tap', Tap);
  `;
  let workletReady = null;
  function loadWorklet(ctx) {
    if (!ctx.audioWorklet) return Promise.reject(new Error('no audioWorklet'));
    if (!workletReady) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      workletReady = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    }
    return workletReady;
  }

  function startCapture(seconds = CAPTURE_SECONDS) {
    const st = control.state;
    const tap = st.mix && st.mix.out;
    if (capturing || !st.ctx || !tap) return null;
    const ctx = st.ctx;
    const want = Math.round(seconds * ctx.sampleRate);
    const left = [];
    const right = [];
    let frames = 0;
    capturing = { left, right, seconds, rate: ctx.sampleRate, at: Date.now(), done: null, nodes: [] };
    capturing.promise = new Promise((res) => { capturing.done = res; });

    const take = (chs) => {
      if (!capturing) return;
      left.push(chs[0]);
      right.push(chs[1] || chs[0]);
      frames += chs[0].length;
      capturing.frames = frames;
      if (frames >= want) stopCapture();
    };

    loadWorklet(ctx).then(() => {
      if (!capturing) return;
      const node = new AudioWorkletNode(ctx, 'capture-tap', { numberOfOutputs: 0, channelCount: 2 });
      node.port.onmessage = (e) => take(e.data);
      tap.connect(node);
      capturing.nodes.push({ node, from: tap });
    }).catch(() => {
      // No worklet: the old path, but tapping the node rather than the stream,
      // which at least removes the re-clock.
      if (!capturing) return;
      const sp = ctx.createScriptProcessor(4096, 2, 2);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      sp.onaudioprocess = (e) => take([
        new Float32Array(e.inputBuffer.getChannelData(0)),
        new Float32Array(e.inputBuffer.getChannelData(1)),
      ]);
      tap.connect(sp);
      sp.connect(mute);
      mute.connect(ctx.destination);
      capturing.nodes.push({ node: sp, from: tap }, { node: mute });
    });

    tickCapture();
    return capturing.promise;
  }

  function tickCapture() {
    if (!capturing) { cap.textContent = 'capture'; cap.removeAttribute('aria-pressed'); return; }
    const left = Math.max(0, capturing.seconds - (Date.now() - capturing.at) / 1000);
    cap.textContent = `stop ${Math.ceil(left)}s`;
    cap.setAttribute('aria-pressed', 'true');
    capturing.timer = setTimeout(tickCapture, 200);
  }

  function stopCapture() {
    const c = capturing;
    if (!c) return null;
    capturing = null;
    clearTimeout(c.timer);
    for (const n of c.nodes || []) {
      try {
        if (n.node.port) n.node.port.onmessage = null;
        if ('onaudioprocess' in n.node) n.node.onaudioprocess = null;
        if (n.from) n.from.disconnect(n.node);
        n.node.disconnect();
      } catch (e) { /* gone */ }
    }
    cap.textContent = 'capture';
    cap.removeAttribute('aria-pressed');
    const join = (parts) => {
      const n = parts.reduce((a, x) => a + x.length, 0);
      const out = new Float32Array(n);
      let o = 0;
      for (const x of parts) { out.set(x, o); o += x.length; }
      return out;
    };
    const L = join(c.left);
    const Rc = join(c.right);
    // A capture starts and stops in the middle of a waveform, so without this
    // the file opens and closes on a step — which is the very thing these
    // captures are used to look for.
    const fade = Math.min(Math.round(c.rate * 0.003), Math.floor(L.length / 2));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      L[i] *= k; Rc[i] *= k;
      L[L.length - 1 - i] *= k; Rc[Rc.length - 1 - i] *= k;
    }
    const blob = wavOf([L, Rc], c.rate);
    const r = control.readout();
    const name = `deep-house-capture-${r ? r.seed : 'x'}-${r ? r.mix.themeIndex : 0}-${r ? r.bar + 1 : 0}.wav`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    let sum = 0;
    for (let i = 0; i < L.length; i++) sum += L[i] * L[i] + Rc[i] * Rc[i];
    const res = { name, frames: L.length, rate: c.rate, seconds: +(L.length / c.rate).toFixed(3),
      rms: Math.sqrt(sum / Math.max(1, L.length * 2)), bytes: blob.size };
    if (c.done) c.done(res);
    return res;
  }

  // --- the whole log, built the first time it is asked for ----------------
  let overlay = null;
  let listBox = null;
  let filterBox = null;

  const short = (iso) => {
    const d = new Date(iso);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  };
  const rowText = (e) =>
    `${short(e.at)} · seed ${e.masterSeed}${themeText(e)}${whereText(e)}` +
    ` · ${scoreText(e)}` + (e.note ? ` · ${e.note}` : '');

  function paintList() {
    if (!listBox) return;
    const q = (filterBox.value || '').trim().toLowerCase();
    const shown = rows.filter((e) => !q ||
      String(e.note || '').toLowerCase().includes(q) || String(e.masterSeed).toLowerCase().includes(q));
    listBox.textContent = '';
    if (!shown.length) { el('div', { class: 'empty' }, listBox, rows.length ? 'nothing matches' : 'no marks yet'); }
    for (let i = shown.length - 1; i >= 0; i--) {
      const e = shown[i];
      const here = control.readout();
      const live = here && String(here.seed) === String(e.masterSeed) && here.mix.themeIndex === e.theme.index;
      const r = el('div', { class: live ? 'r' : 'r dead', 'data-id': e.id }, listBox);
      const t = el('span', { class: 'txt', title: live ? 'seek here' : 'another set: not seekable' }, r, rowText(e));
      if (live) t.addEventListener('click', () => {
        const now = control.readout();
        if (now && now.duration) control.seekTo(e.range.t0 / now.duration, true);
      });
      const x = el('button', { type: 'button', class: 'x', title: 'remove' }, r, '×');
      x.addEventListener('click', () => removeFromList(e.id, r));
    }
    if (logCount) logCount.textContent = countText();
  }

  function removeFromList(id, r) {
    const i = rows.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [gone] = rows.splice(i, 1);
    save(rows);
    showCount();
    const inBand = logBox.querySelector(`.ln[data-id="${id}"]`);
    if (inBand) inBand.remove();
    r.textContent = '';
    el('span', { class: 'txt' }, r, 'removed · ');
    const u = el('span', { class: 'undo' }, r, 'undo');
    const drop = setTimeout(() => { if (r.parentNode) paintList(); }, 5000);
    u.addEventListener('click', () => {
      clearTimeout(drop);
      rows.splice(Math.min(i, rows.length), 0, gone);
      save(rows);
      showCount();
      paintList();
    });
    if (logCount) logCount.textContent = countText();
  }

  let logCount = null;

  function buildOverlay() {
    overlay = el('div', { id: 'ratelog' }, document.body);
    const head = el('header', {}, overlay);
    logCount = el('span', {}, head, '');
    filterBox = el('input', { type: 'text', placeholder: 'filter note or seed', spellcheck: 'false' }, head);
    filterBox.addEventListener('input', paintList);
    filterBox.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { filterBox.value = ''; paintList(); ev.preventDefault(); }
    });
    const d2 = el('button', { type: 'button' }, head, 'download');
    d2.addEventListener('click', () => dl.click());
    const c2 = el('button', { type: 'button' }, head, 'clear all');
    c2.addEventListener('click', () => { clr.click(); paintList(); });
    const close = el('button', { type: 'button' }, head, '×');
    close.addEventListener('click', toggleLog);
    listBox = el('div', { class: 'list' }, overlay);
  }

  function toggleLog() {
    if (!overlay) buildOverlay();
    const on = overlay.style.display === 'none' || !overlay.isConnected ? true : overlay.dataset.open !== '1';
    overlay.dataset.open = on ? '1' : '0';
    overlay.style.display = on ? 'flex' : 'none';
    if (on) paintList();
  }
  openLog.addEventListener('click', toggleLog);

  window.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const n = '123'.indexOf(ev.key);
    if (n >= 0) { rate(n + 1); ev.preventDefault(); return; }
    const d = '!@#'.indexOf(ev.key);                      // shift + 1 2 3
    if (d >= 0) { rate(-(d + 1)); ev.preventDefault(); return; }
    const c = 'qwe'.indexOf(ev.key.toLowerCase());
    if (c >= 0) { setClass(CLASSES[c]); ev.preventDefault(); return; }
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && rows.length) {
      remove(rows[rows.length - 1].id);
      if (overlay && overlay.dataset.open === '1') paintList();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape' && overlay && overlay.dataset.open === '1') { toggleLog(); ev.preventDefault(); }
  });

  // for the headless check
  return { rate, setClass, attachNote, remove, toggleLog, startCapture, stopCapture,
    downloadLog, note, get rows() { return rows; }, entry, CLASSES };
}

export default installRatings;
