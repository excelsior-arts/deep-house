// The four locks in one hand, for the merge round.
//
//   node tools/bless.ts                          check all four; say what moved, with counts, and whether 27191 did
//   node tools/bless.ts --reason "<why>"         re-bless both strategies' sections and the link digest,
//                                                update the alias hashes, copy the golden snapshot
//
// Eugene, 2026-10-01: a feature is built and reviewed without the locks; they
// run once, here, when the approved branches are merged. The check costs
// seconds, so it runs at every merge; a bless follows on his word when the
// check says something moved. One thing never moves on its own: a row a cut
// shipped, outside the digest's stated window — the digest refuses it. The
// benchmark (27191) is not a gate: it is reported, moved or unmoved, so that
// he knows when to listen.
//
// **house-v1 is a composing preset, not a byte lock** (V1-1, Eugene 10-02:
// *"drop the byte-identical … the only thing we keep there is the original
// simple composing rules and the EQ specific to v1; everything else can tag
// along"*). Until then this file held the record by name — `house-v1:
// byte-identical`, and a move was "a fault, not a bless" — and the digest took
// a `--record "<why>"` for the one kind of move the mixer was allowed. Now the
// record's two sections are checked and blessed exactly as house-v2's are:
// what moved is said with its counts (`moved: N of M …`, the lock tools'
// own line), and a bless under `--reason` writes both.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { saved, verify, BENCHMARK_SEED, blessRefusal, lastCut, openWindow, sinceCut } from './link-digest.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ALIASES = path.join(HERE, 'link-aliases.json');
const DIGEST = path.join(HERE, 'link-digest.json');

const run = (file: string, ...args: string[]): { ok: boolean; out: string } => {
  try {
    return { ok: true, out: execFileSync(process.execPath, [path.join(HERE, file), ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? err.message}` };
  }
};
const say = (s: string) => process.stdout.write(s.endsWith('\n') ? s : `${s}\n`);
const keyOf = (r: { link: string; themes?: number }) => `${r.link}|${r.themes ?? 0}`;
/** The lock tool's own count of what moved (`moved: N of M …`), or its first line when it has none. */
const counts = (out: string): string => {
  const m = out.match(/^\s*moved: (.*)$/m);
  return m ? m[1] : (out.trim().split('\n')[1] ?? out.trim().split('\n')[0] ?? '').trim();
};

function benchmark(): Map<string, string> {
  return new Map(saved().rows.filter((r) => r.group === 'benchmark' || r.link.includes(`seed=${BENCHMARK_SEED}&`)).map((r) => [keyOf(r), r.hash]));
}

/** Both strategies' two locks, in the order they are blessed. */
const LOCKS = [
  ['house-v1', 'golden.ts', 'program.ts', []],
  ['house-v2', 'golden.ts', 'program.ts', ['--strategy', 'house-v2']],
] as const;

function check(): number {
  let moved = 0;
  // Each strategy's plans and programs, said in one line with the counts: the
  // record's is no longer held by name (V1-1), it is reported like the other.
  for (const [id, plans, programs, args] of LOCKS) {
    const p = run(plans, '--check', ...args);
    const q = run(programs, '--check', ...args);
    if (p.ok && q.ok) say(`${id}: unmoved`);
    else {
      say(`${id} moved: plans ${p.ok ? 'unmoved' : counts(p.out)}; programs ${q.ok ? 'unmoved' : counts(q.out)}`);
      moved++;
    }
  }
  const f = run('fixtures/programs.ts', '--check');
  say(f.ok ? 'fixtures: unmoved' : `fixtures: moved\n${f.out.trim().split('\n').slice(0, 6).map((l) => `  ${l}`).join('\n')}`);
  if (!f.ok) moved++;
  const file = saved();
  const d = verify(file);
  const bench = d.moved.filter((m) => m.startsWith('benchmark '));
  // a moved line reads `<group> <link>[ (<n> themes)]: <what>`; the link names its engine with `v=`
  const byVersion = (ver: string) => d.moved.filter((m) => new RegExp(`^\\w+ (?:[^ :]*&)?v=${ver}(?=[&:\\s]|$)`).test(m)).length;
  say(d.moved.length
    ? `link digest: ${d.moved.length} of ${d.rows} rows moved (house-v1 ${byVersion('1')}, house-v2 ${byVersion('2')})`
    : `link digest: ${d.rows} rows unmoved`);
  say(bench.length ? `27191: MOVED (${bench.length} rows) — Eugene listens before this lands` : '27191: unmoved');
  if (d.moved.length) moved++;
  // the freeze, as the digest's own check reads it (`sinceCut`): a shipped row moved outside a window, or a digest
  // that differs from the cut's with no blessing added (the review of 10-08, A4)
  const cut = lastCut();
  const frozen = sinceCut(cut, file, openWindow());
  say(!cut ? 'freeze: no cut carries the digest (no master, or a cut before the digest)'
    : frozen.length ? `freeze: ${frozen.length} fault${frozen.length > 1 ? 's' : ''}\n${frozen.slice(0, 6).map((l) => `  ${l}`).join('\n')}`
    : `freeze: ${cut.rows.length} shipped rows held`);
  if (frozen.length) moved++;
  return moved;
}

/** The committed files a bless writes, kept to be put back whole where a step refuses. */
const WRITTEN = ['golden-digest.json', 'program-digest.json', 'fixtures/programs.json', 'link-digest.json', 'link-aliases.json'].map((f) => path.join(HERE, f));

function bless(reason: string): void {
  // **All or nothing** (the review of 10-08, A4): the digest's refusal is asked first, before any file is written —
  // it used to come last, after the golden, program and fixture digests were already rewritten — and a step that
  // still refuses puts every file back as it was.
  const refused = blessRefusal();
  if (refused) { say(`link-digest.ts refused, and nothing was written:\n${refused}`); process.exit(1); }
  const before = benchmark();
  const was = new Map(saved().rows.map((r) => [keyOf(r), r.hash]));
  const kept = new Map(WRITTEN.map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]));
  const putBack = () => { for (const [f, body] of kept) { if (body) fs.writeFileSync(f, body); else fs.rmSync(f, { force: true }); } };
  const steps: (readonly [string, readonly string[]])[] = [];
  for (const [, plans, programs, args] of LOCKS) steps.push([plans, ['--bless', ...args]], [programs, ['--bless', ...args]]);
  steps.push(['fixtures/programs.ts', ['--bless']], ['link-digest.ts', ['--bless', '--reason', reason]]);
  for (const [file, args] of steps) {
    const r = run(file, ...args);
    if (!r.ok) { putBack(); say(`${file} refused, and every lock was put back as it was:\n${r.out}`); process.exit(1); }
    say(r.out.trim().split('\n').pop() ?? '');
  }
  // the aliases carry the hash the digest's row now plays, for every row that moved
  const now = new Map(saved().rows.map((r) => [keyOf(r), r.hash]));
  const aliases = JSON.parse(fs.readFileSync(ALIASES, 'utf8')) as { note: string; rows: { new: string; group: string; themes?: number; hash: string }[] };
  let realiased = 0;
  for (const a of aliases.rows) {
    // an alias row is keyed by the link the page writes now (`new`), the digest's own key
    const h = now.get(`${a.new}|${a.themes ?? 0}`);
    if (h && h !== a.hash) { a.hash = h; realiased++; }
  }
  if (realiased) fs.writeFileSync(ALIASES, `${JSON.stringify(aliases, null, 2)}\n`);
  const movedRows = [...now].filter(([k, h]) => was.get(k) !== h).length;
  const after = benchmark();
  const benchMoved = [...after].filter(([k, h]) => before.get(k) !== h).length;
  say(`blessed: ${movedRows} digest rows moved, ${realiased} alias hashes followed; 27191: ${benchMoved ? `MOVED (${benchMoved} rows) — Eugene listens` : 'unmoved'}`);
  // the full snapshot the check reads beside the digest lives under tmp/golden
  // in the tree the bless ran in; a bless in a worktree leaves the main tree's
  // copy stale (the gotcha of 09-26), so the snapshot is written where it ran
  say(`snapshot under ${path.relative(process.cwd(), path.join(ROOT, 'tmp', 'golden'))}; a bless runs in the main tree`);
  void DIGEST;
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--reason');
if (at >= 0) {
  const reason = (argv[at + 1] || '').trim();
  if (!reason) { say('a bless states its reason: --reason "<why the rows move>"'); process.exit(2); }
  bless(reason);
} else {
  const moved = check();
  if (moved) { say(`\n${moved} lock${moved > 1 ? 's' : ''} moved. On Eugene's word: node tools/bless.ts --reason "<why>"`); process.exit(1); }
  say('nothing moved');
}
