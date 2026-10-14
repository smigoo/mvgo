// 离线全链路自愈重放：刀 27/28/29 在真实带病产物上的端到端验证（dry-run，不落盘）
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { normalizeVForRowListDirection } from '../src/ai-engine/utils/style-fragment-healer.js';
import {
  normalizeSectionFlexTruth,
  normalizeTextSlotOrder,
} from '../src/ai-engine/utils/layout-truth-healer.js';

const TEXT_RE = /\.(vue|less|css|js|json|html)$/;
const SKIP_DIR = new Set(['.mc-gen', '.checkpoint', 'node_modules', 'themes', 'images']);

function collect(dir, out, base = dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collect(p, out, base);
    else if (TEXT_RE.test(name)) {
      // 🔒 键名必须恒以 base 为基准：递归时 dir 逐层下沉，若用 relative(dir, p)
      // 键会被逐层拍扁（resources/styles/common.less → common.less），下游
      // endsWith('/components/X.vue')、按全路径取文件全部失明（2026-10-14 实锤）
      try { out[relative(base, p).replaceAll('\\', '/')] = readFileSync(p, 'utf-8'); } catch {}
    }
  }
  return out;
}

const TARGETS = [
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1791944957047-cd63d1c5',
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1791942831818-0397a327',
];

for (const dir of TARGETS) {
  let figmaRoot = null;
  try { figmaRoot = JSON.parse(readFileSync(join(dir, '.mc-gen/cache/figma-node-data.json'), 'utf-8')); } catch {}
  if (!figmaRoot) { console.log(`SKIP(no figma): ${dir}`); continue; }
  const files = collect(dir, {});
  console.log(`\n########## ${dir.split('/').pop()} (files=${Object.keys(files).length})`);

  // 复刻 pre-write 顺序：刀 27 → 刀 28 → 刀 29
  let cur = JSON.parse(JSON.stringify(files));
  const r27 = normalizeVForRowListDirection(cur);
  cur = r27.files;
  console.log(`刀 27: ${r27.changes.length ? JSON.stringify(r27.changes) : '无改动'}`);
  const r28 = normalizeSectionFlexTruth(cur, { figmaRoot });
  cur = r28.files;
  console.log(`刀 28: ${r28.changes.length ? JSON.stringify(r28.changes) : '无改动'}`);
  const r29 = normalizeTextSlotOrder(cur, { figmaRoot });
  cur = r29.files;
  console.log(`刀 29: ${r29.changes.length ? JSON.stringify(r29.changes, null, 1) : '无改动'}`);

  // 终态验收
  const idx = cur['package/index.vue'] || '';
  const cs = Object.entries(cur).find(([p]) => p.endsWith('ContentSection.vue'))?.[1] || '';
  const common = cur['resources/styles/common.less'] || '';
  const checks = [
    ['list-con 真值 72px', /flex:0 0 auto; height:72px/.test(idx)],
    ['group-con flex:1', /data-section-id="48:5813-list" style="flex:1 1 0/.test(idx) || /data-section-id="48:5813-list" style="flex:1;/.test(idx)],
    ['等分臆造消失', !/flex:0\.500/.test(idx)],
    // 🔒 容器方向判定限定本规则块内（[^}]* 不跨闭括号）：窗口放开会把下一个规则
    //   （如 node-card 的 flex-direction: row）误算进容器块 → 假阴性
    ['容器 column', /group-2136638416 \{[^}]*flex-direction: column/.test(common) || /group-2136638416 \{[^}]*flex-direction: column/.test(cs)],
    ['容器无 row', !/group-2136638416 \{[^}]*flex-direction: row/.test(common) && !/group-2136638416 \{[^}]*flex-direction: row/.test(cs)],
    ['名称槽=名称', /node-(?:name|title)">江苏联网节点</.test(cs)],
    ['地址槽=地址', /node-addr">江苏省南京市建邺区江东中路</.test(cs)],
    ['离线数值槽=数字', /offline(?:-value)?">28</.test(cs)],
    ['离线标签槽=离线', /stat-label">离线</.test(cs)],
  ];
  for (const [name, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
