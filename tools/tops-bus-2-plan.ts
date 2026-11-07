// tops-bus-2 (11-02), scratch: what the width and air rules did per featured deep track (and any links given)
import fs from 'node:fs';
import { played } from '../packages/deep-house/tools/link-digest.ts';
const quiet = <T>(fn: () => T): T => { const a = console.log, b = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = a; console.warn = b; } };
const deep = JSON.parse(fs.readFileSync(new URL('./tops-bus-deep.json', import.meta.url), 'utf8'));
const extra = process.argv.slice(2).map((l) => ({ name: l, link: l }));
for (const t of extra.length ? extra : deep) {
  const { plan } = quiet(() => played(t.link)) as any;
  const T = plan.automation.tops;
  const sp = plan.dice?.spell ?? {};
  const W = T?.widthRead, C = T?.character;
  console.log(`${t.name}  bpm ${plan.bpm} tide ${T?.widthRead?.birds?.tide ?? '?'} zephyr ${T?.widthRead?.birds?.zephyr ?? '?'}  ${plan.arrangement.sections.map((s: any) => `${s.kind}@${s.startBar}+${s.bars}`).join(' ')}`);
  if (!T) { console.log('   (no tops)'); continue; }
  console.log(`   width: shelves low ${T.width?.low?.[0]?.value} high ${T.width?.high?.[0]?.value}; sixteenth pan x${W?.sixteenthPan}; ${W?.hats} hat hits, ${W?.sixteenths} sixteenth hits; break side ${W?.breakSide}`);
  console.log(`   steps: ${(W?.steps ?? []).map((s: any) => `${s.from}:${s.open}`).join(' ')}`);
  console.log(`   air: ${C ? `oct ${C.oct} lid x${C.lidMul} trim ${C.trimDb} dB -> lid ${plan.paramOverrides?.hats?.lidHz} Hz` : '-'}`);
}
