// tops-bus-2 (11-02), scratch: across 90 house themes (seeds 701-730, themes 1-3, the house's birds), where the width
// and air rules land: the centre, the form's steps, the break's side, the lid's octave share
import { played } from '../packages/deep-house/tools/link-digest.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const n = +(process.argv[2] ?? 30);
let themes = 0, kick = 0, placed = 0, steps = 0, breaks = 0, sixteenths = 0;
const octs: number[] = [], lids: number[] = [];
for (let s = 1; s <= n; s++) for (const th of [1, 2, 3]) {
  let plan: any; try { plan = (quiet(() => played(`seed=${700 + s}&v=2&theme=${th}`)) as any).plan; } catch { continue; }
  themes++;
  if (plan.kickPresent) kick++;
  const W = plan.automation?.tops?.widthRead, C = plan.automation?.tops?.character;
  if (!W) continue;
  placed++;
  steps += W.steps.length - 1;
  if (W.breakSide) breaks++;
  if (W.sixteenths) sixteenths++;
  if (C) { octs.push(C.oct); lids.push(plan.paramOverrides.hats.lidHz); }
}
const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };
console.log(`themes ${themes}, with a kick ${kick}, width placed ${placed} (${Math.round(100 * placed / themes)}%)`);
console.log(`form steps ${steps} (${(steps / Math.max(1, placed)).toFixed(1)} a theme), a break's top to a side in ${breaks}, sixteenths widened in ${sixteenths}`);
console.log(`lid octave share p10 ${q(octs, 0.1)} p50 ${q(octs, 0.5)} p90 ${q(octs, 0.9)}; lid Hz p10 ${q(lids, 0.1)} p50 ${q(lids, 0.5)} p90 ${q(lids, 0.9)}; opened ${octs.filter((x) => x > 0).length} of ${octs.length}`);
