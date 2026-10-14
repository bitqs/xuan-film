// 列出全片实际会播的音效（场景 sfx() 求值后的绝对时间）。用法（在 studio 目录）：npx tsx episodes/xuan/tools/sfx_cues.ts > episodes/xuan/work/sfx_cues.json
import {SCENES, toF, makeAt, makeAtc, makeLineAt} from '../scenes/core/timeline';
import {REGISTRY as REG} from '../scenes/registry';
import {sfxFiles} from '../scenes/preview';

const out: {t: number; scene: string; name: string; vol: number; len: number}[] = [];
for (const def of SCENES) {
  const mod = (REG as Record<string, {sfx?: Function}>)[def.id];
  if (!mod?.sfx) continue;
  const dur = toF(def.end) - toF(def.start);
  const cues = sfxFiles(def, mod.sfx({at: makeAt(def), atc: makeAtc(def), lineAt: makeLineAt(def), dur})) as [number, string, number?, number?][];
  for (const [cf, name, vol = 0.25, len = 90] of cues) out.push({t: +(def.start + cf / 30).toFixed(3), scene: def.id, name, vol, len});
}
out.sort((a, b) => a.t - b.t);
console.log(JSON.stringify(out));
