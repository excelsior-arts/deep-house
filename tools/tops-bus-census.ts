// tops-bus (11-02): across house links, how often each move is laid, and the lid's takes
import { played } from '../packages/deep-house/tools/link-digest.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const n = +(process.argv[2] ?? 30), spellArg = process.argv[3] ?? '';
let themes = 0, placed = 0, returns = 0;
const laid: Record<string, number> = {}, why: Record<string, number> = {}, themesWith: Record<string, number> = {};
for (let s = 1; s <= n; s++) for (const th of [1, 2, 3]) {
  const link = `seed=${700 + s}&v=2&theme=${th}${spellArg ? '&spell=' + spellArg : ''}`;
  let plan: any; try { plan = (quiet(() => played(link)) as any).plan; } catch { continue; }
  if (!plan.kickPresent) continue;
  themes++;
  const T = plan.automation.tops;
  if (!T) continue;
  placed++;
  const kinds = new Set<string>();
  for (const m of T.moves) {
    const k = `${m.kind}/${m.shape}`;
    if (m.laid) { laid[k] = (laid[k] ?? 0) + 1; kinds.add(m.kind); }
    else why[`${m.kind}: ${m.why}`] = (why[`${m.kind}: ${m.why}`] ?? 0) + 1;
    if (m.kind === 'stepOut' || (m.kind === 'secondDrop')) {}
  }
  for (const k of kinds) themesWith[k] = (themesWith[k] ?? 0) + 1;
  returns += new Set(T.moves.filter((m: any) => m.kind === 'stepOut' || m.kind === 'secondDrop').map((m: any) => m.kind === 'stepOut' ? Math.ceil(m.line) : m.from)).size;
}
console.log('themes with a kick', themes, 'with the bus placed', placed, 'return lines', returns);
console.log('laid:', JSON.stringify(laid));
console.log('themes with:', JSON.stringify(themesWith));
console.log('refused:\n ' + Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join('\n '));
