// **The birds' ledger** (round bird-ledger, 11-01): what each sound decision does at the birds' ends, read off the
// plans and programs as the page plans them. No render, no audio. A scratch tool; nothing reads it.
//
//   node tools/bird-ledger.ts --featured <out.json>            the featured tracks (src/featured.json)
//   node tools/bird-ledger.ts --sweep <out.json> [--seeds 8]   seeds 1..n at the house and at every bird's nought and one
//   node tools/bird-ledger.ts --links <out.json> <link> ...    any links
//
// Per theme: the spell, the tempo, the places each lane read, the room's settings (the sends, the space, the returns,
// the part space), the stage's numbers (`tightOf`, `kitAirOf`, the plate, the kit's room), the stereo plan's swing,
// and per layer the mean sends (reverb, hall, delay, room, the plate) and the mean seat; the ring's words for each bird.

import fs from 'node:fs';
import { played } from './link-digest.ts';
import { programOf } from '../src/performance.ts';
import { placeReadsOf } from '../src/generator.ts';
import { HOUSE, BIRDS, derive, type Bird, type Spell } from '../src/spell.ts';
import { tightOf, kitAirOf } from '../src/stereo-stage.ts';
import { stereoSwing } from '../src/stereo-plan.ts';
import { linkWrite } from '../src/link.ts';
import { FEATURED } from '../src/featured.ts';
import { style as v2 } from '../src/styles/deep-house-v2.ts';
import { shortOf, bandWordOf, hatsOfProgram, programFactsOf, keysOfProgram, heldOfProgram, airPlayOf, type LabelTheme } from '../src/bird-labels.ts';

const argv = process.argv.slice(2);
const mode = argv[0];
const out = argv[1];
const arg = (k: string, d: string) => { const i = argv.indexOf(k); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r3 = (x: number | null) => (x == null ? null : +x.toFixed(3));

function theme(t: any, spell: Spell): LabelTheme {
  return { spell, bpm: t.bpm, key: t.key.name, presetName: t.presetLabel, preset: t.preset, dice: t.dice, bars: t.bars, plan: t.arrangement.sections,
    hats: hatsOfProgram(t.events, t.timeline), facts: programFactsOf(t.events, t.dice), keys: keysOfProgram(t.events, t.dice.keysPreset) ?? null, held: heldOfProgram(t.events) ?? null, air: airPlayOf(t.events, t.knobs, t.dice.keysPreset) };
}

function facts(name: string, link: string) {
  const { request, plan } = played(link);
  const t: any = plan;
  const spell = { ...HOUSE, ...(request.spell ?? {}) } as Spell;
  const program = programOf(plan);
  const S: any = program.settings;
  const trace = (() => { try { return JSON.parse(t.dice.composition || '{}'); } catch { return {}; } })();
  const layers: Record<string, any> = {};
  const by = new Map<string, any[]>();
  for (const e of program.events as any[]) { let l = by.get(e.layer); if (!l) by.set(e.layer, (l = [])); l.push(e); }
  for (const [layer, list] of by) {
    const num = (k: string) => mean(list.map((e) => (typeof e.p?.[k] === 'number' ? e.p[k] : 0)));
    const voices = new Map<string, number>();
    for (const e of list) voices.set(e.voice, (voices.get(e.voice) ?? 0) + 1);
    const pans = list.map((e) => (typeof e.p?.pan === 'number' ? e.p.pan : null)).filter((x): x is number => x != null);
    layers[layer] = {
      n: list.length, voices: [...voices].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, c]) => `${v}:${c}`),
      reverb: r3(num('reverb')), hall: r3(num('hall')), delay: r3(num('delay')), room: r3(num('room')), background: r3(num('background')),
      partSpace: r3(num('partSpace')), echo: r3(num('echo')),
      plate: r3(mean(list.map((e) => Number(e.p?.returns?.['front.plate'] ?? 0)))),
      spread: r3(mean(list.map((e) => (typeof e.p?.spread === 'number' ? e.p.spread : 0)))),
      seat: pans.length ? { n: pans.length, mean: r3(mean(pans)), abs: r3(mean(pans.map(Math.abs))) } : null,
    };
  }
  const reads = placeReadsOf(plan) ?? [];
  const places: Record<string, string> = {};
  for (const r of reads as any[]) places[r.lane] = r.entry ?? r.id ?? 'house';
  const d = derive(spell);
  const kick = (program.events as any[]).some((e) => e.layer === 'kick');
  const words: Record<string, string> = {};
  const L = theme(t, spell);
  for (const b of BIRDS) { try { words[b] = `${bandWordOf(b as Bird, spell, v2 as any) ?? ''} | ${shortOf(b as Bird, L, v2 as any)}`; } catch (e) { words[b] = `? ${(e as Error).message}`; } }
  return {
    name, link, spell, bpm: program.bpm, bars: program.bars, clock: program.clock ?? 'beat', kick, drumsOn: d.drumsOn, tempoFamily: d.tempoFamily,
    fx: t.dice.fxPalette ?? null, room: t.presetLabel ?? null, library: t.dice.library ?? null, struckFigure: t.dice.struckFigure ?? null, keysPreset: t.dice.keysPreset ?? null, padTimbre: t.dice.padTimbre ?? null, scene: trace.scene ?? null, selected: trace.selected ?? null,
    places,
    space: { widthBase: S.space?.widthBase, widthDepth: S.space?.widthDepth, returnSide: S.space?.returnSide, kitRoom: S.space?.kitRoom, kitAir: S.space?.kitAir ?? 1 },
    sends: { reverbSeconds: S.sends?.reverbSeconds, reverbLevel: S.sends?.reverbLevel, reverbCorr: S.sends?.reverbCorr, roomSeconds: S.sends?.roomSeconds, roomCorr: S.sends?.roomCorr, roomHighHz: S.sends?.roomHighHz,
      hallSeconds: S.sends?.hallSeconds, hallCorr: S.sends?.hallCorr, delayLevel: S.sends?.delayLevel, hatReverb: S.sends?.hatReverb, clapReverb: S.sends?.clapReverb },
    master: { lowShelfDb: S.master?.lowShelfDb, airDb: S.master?.airDb, presenceDb: S.master?.presenceDb },
    returns: Object.fromEntries(Object.entries(S.returns ?? {}).map(([k, v]: [string, any]) => [k, v.sends?.map((s: any) => `${s.effect}:${s.params?.decaySeconds ?? s.params?.timeBeats ?? ''}`).join(',')])),
    partSpace: S.partSpace ? { id: S.partSpace.id, dry: S.partSpace.dry, sends: S.partSpace.sends?.map((s: any) => `${s.id}:${s.level}`).join(',') } : null,
    stage: { tight: r3(tightOf(spell)), kitAir: r3(kitAirOf(spell)), plate: !!S.returns?.front, swing: r3(stereoSwing({ tide: spell.tide, kick })), stereoLines: !!t.automation?.stereo },
    conversation: t.conversation ? { tail: t.conversation.tail, size: t.conversation.size } : null,
    layers, words,
  };
}

const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };

const jobs: Array<{ name: string; link: string }> = [];
if (mode === '--featured') {
  for (const p of FEATURED as any[]) p.links.forEach((l: string, i: number) => jobs.push({ name: `${p.name} - ${p.labels[i]}`, link: l }));
} else if (mode === '--sweep') {
  const n = Number(arg('--seeds', '8'));
  const spells: Array<[string, Partial<Spell> | null]> = [['house', null]];
  for (const b of BIRDS) { spells.push([`${b}=0`, { [b]: 0 }]); spells.push([`${b}=1`, { [b]: 1 }]); }
  spells.push(['tight', { ember: 0.75, tide: 0 }]);
  for (let s = 1; s <= n; s++) for (const [name, sp] of spells) jobs.push({ name: `${name} s${s}`, link: linkWrite({ seed: String(s), theme: 0, strategy: 'house-v2', spell: sp }).replace(/^\?/, '') });
} else if (mode === '--links') {
  argv.slice(2).forEach((l, i) => jobs.push({ name: `link ${i + 1}`, link: l }));
} else { console.error('mode?'); process.exit(2); }

const rows: any[] = [];
for (const j of jobs) {
  try { rows.push(quiet(() => facts(j.name, j.link))); process.stderr.write('.'); }
  catch (e) { rows.push({ name: j.name, link: j.link, error: (e as Error).message }); process.stderr.write('x'); }
}
process.stderr.write('\n');
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`${rows.length} themes -> ${out}`);
