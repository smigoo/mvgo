/**
 * 🛡️ mc-max-1792718704810-f98f7463（具身机器人设备列表）根治验收探针（2026-10-23）
 *
 * ## 为什么需要这个脚本
 *
 * `docs/2026-10-23-设备列表-f98f7463-问题分析-与解决方案.md` §5 定的验收第一条是
 * **离线重放**：用本单真实语料重放 plan，对 A/B/C 各判据跑断言（阳性 + 阴性对照）。
 * 此前 A 方案的取证是在 **137 个组件的全体语料**上做的（① 只诊断、② 只诊断、③ 确定性修复且零命中），
 * **但从未单独对本单跑过** ⇒ 「③ 能收敛 807:2-tail-text」此前只是推断，不是实测。
 *
 * 本脚本把「真机当时的 plan」与「当前代码重放的 plan」以及各判据命中情况**原样打印**，
 * 让「已根治 / 未根治」可证伪。只读：不改产物、不写 dist、不部署。
 *
 * ## 语料（本单权威副本，非 workspace 交付副本）
 *   temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792718704810-f98f7463
 *   .mc-gen/cache/figma-node-data.json  → fileKey GTcJm0DKQvcJvcOZTh5n1l / nodeId 43:4782 / cachedAt 01:25:11
 *   .checkpoint/analysis.json           → 真机当时落盘的 subComponentPlan（比 server.log 更硬）
 *   .checkpoint/visual.json.layoutStructure → 真机 plan 的真实入参
 *
 * ## 对照（取自文档 §3.1 / §3.2）
 *   A① 阳性：`43:4893`（「8 / 总设备」卡）应出现在 uncovered 里
 *   A② 阳性：overlapping 应含 `807:2-tail-text` × `43:4785`
 *   A③ 阳性：`807:2-tail-text` 应被 heal（合成 id + children 全 TEXT + 锚点含容器）
 *   B  阳性：`43:4892` 统计行应被刀 53d 整行接管，3 members、titles [总设备, 运行中, 离线]
 *   B  阴性：`43:4784` / `43:4785`（4 列 × 9 TEXT）不得被刀 53d 误接管为统计行
 *
 * 用法： node scripts/verify-f98f7463.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MC =
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792718704810-f98f7463/.mc-gen';
const CK =
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792718704810-f98f7463/.checkpoint';
const PKG =
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1792718704810-f98f7463/package';
const BASE = '/Users/smigoo/工作/mvgo/backend-node/src/ai-engine';
const COMPONENT_NAME = 'c-device-f98f7463';

const figmaRaw = JSON.parse(readFileSync(join(MC, 'cache', 'figma-node-data.json'), 'utf-8'));
const doc = figmaRaw.document;
console.log(
  `语料自检：fileKey=${figmaRaw.fileKey} nodeId=${figmaRaw.nodeId} cachedAt=${figmaRaw.cachedAt} root=${doc?.id} (${doc?.name})`,
);

// 🔴 真机 plan 的真实入参是 visual.json.layoutStructure，不是 preview-analysis.json
const visual = JSON.parse(readFileSync(join(CK, 'visual.json'), 'utf-8'));
const layoutStructure = visual.layoutStructure;

const { SubcomponentPlanner } = await import(`${BASE}/roles/subcomponent-planner.js`);
const { detectPlanCoverageGaps, healOversizedTextRowAnchors } = await import(
  `${BASE}/utils/section-plan-coverage.js`
);
const { collectFoldedGridTakeover } = await import(
  `${BASE}/utils/folded-grid-section-takeover.js`
);
const { assignSectionComponentNames } = await import(`${BASE}/utils/section-tree.js`);

const plan = new SubcomponentPlanner().plan(layoutStructure, { figmaNodeData: figmaRaw });
const sections = plan?.effectiveSections || [];

// ---------- 0. 真机 plan（checkpoint）vs 当前代码重放 plan ----------
const flat = (list, out = []) => {
  for (const s of list || []) {
    out.push(s);
    if (s.children?.length) flat(s.children, out);
  }
  return out;
};
const ckPlan = JSON.parse(readFileSync(join(CK, 'analysis.json'), 'utf-8')).subComponentPlan;
const ckAll = flat(ckPlan?.effectiveSections || []);
const nowAll = flat(sections);

const shape = (arr) =>
  arr
    .map((s) => `${s.id}[${(s.sourceNodeIds || []).length}]`)
    .join(', ');

console.log('\n=== 0. plan 形态对照（真机 checkpoint vs 当前代码重放）===');
console.log('  真机 checkpoint :', shape(ckAll));
console.log('  当前代码重放    :', shape(nowAll));
console.log(
  `  ⇒ ${shape(ckAll) === shape(nowAll) ? '✅ 完全一致（重放可信）' : '🟡 不一致（重放输入或代码已变，结论需标注）'}`,
);

console.log('\n=== 1. plan 段树（当前代码重放）===');
const walk = (list, depth = 0) => {
  for (const s of list || []) {
    console.log(
      `${'  '.repeat(depth)}- ${s.id}  type=${s.type ?? '-'}  src=${JSON.stringify(s.sourceNodeIds || [])}`,
    );
    if (s.children?.length) walk(s.children, depth + 1);
  }
};
walk(sections);

// ---------- 2. 命名清单（决定刀 55 能否拦编造副本）----------
const nameMap = assignSectionComponentNames(sections);
const names = [...new Set(nameMap.values())];
const artifactFiles = existsSync(join(PKG, 'components'))
  ? readdirSync(join(PKG, 'components')).filter((f) => f.endsWith('.vue')).map((f) => f.replace(/\.vue$/, ''))
  : [];
console.log('\n=== 2. 命名清单 vs 产物文件（刀 55 判据的「plan 名集合」）===');
console.log('  plan 命名    :', names.join(', '));
console.log('  产物子组件  :', artifactFiles.join(', '));
const orphan = artifactFiles.filter((f) => !names.includes(f));
console.log(`  ∉ plan 名集合（刀 55 可判「编造副本」）: ${orphan.length ? orphan.join(', ') : '（无）'}`);

// ---------- 3. A 方案 ----------
console.log('\n=== 3. A① ② 覆盖缺口 / 兄弟重叠（detectPlanCoverageGaps）===');
const gaps = detectPlanCoverageGaps({ sections, figmaNodeData: figmaRaw });
console.log('  evaluated =', gaps.evaluated, ' skipped =', gaps.skipped, gaps.skippedReason || '');
console.log('  uncovered =', JSON.stringify(gaps.uncovered));
console.log('  overlapping =', JSON.stringify(gaps.overlapping));
console.log('  oversizedTextRow =', JSON.stringify(gaps.oversizedTextRow));
console.log('  📌 文档阳性对照：uncovered 应含 43:4893；overlapping 应含 807:2-tail-text × 43:4785');

console.log('\n=== 4. A③ 锚点膨胀确定性修复（healOversizedTextRowAnchors）===');
const healed = healOversizedTextRowAnchors({ sections, figmaNodeData: figmaRaw });
console.log('  healed =', JSON.stringify(healed?.healed || []));
console.log('  residual =', JSON.stringify(healed?.residual || []));
console.log('  📌 文档阳性对照：807:2-tail-text（合成 id + children 全 TEXT + 锚点含容器）应被 heal');
const tail = nowAll.find((s) => String(s.id).includes('tail-text'));
console.log(
  '  🔍 实际 807:2-tail-text 形态：sourceNodeIds =',
  JSON.stringify(tail?.sourceNodeIds || []),
  ' ⇒ 命中前提「锚点含容器」=',
  (tail?.sourceNodeIds || []).some((id) => String(id) === '807:2'),
);

// ---------- 5. B 刀 53d ----------
console.log('\n=== 5. B 刀 53d 统计行整行接管（collectFoldedGridTakeover）===');
const tk = collectFoldedGridTakeover({
  treeSections: sections,
  figmaNodeData: figmaRaw,
  resourceMapping: [],
  componentName: COMPONENT_NAME,
  logger: null,
});
console.log('  evaluated =', tk.evaluated, ' hits =', tk.map.size, ' kinds =', JSON.stringify(tk.kinds));
for (const [name, tr] of tk.map) {
  console.log(
    `  ✅ ${name} ← section=${tr.sectionId} kind=${tr.kind ?? '-'} members=${tr.members?.length ?? (tr.memberIndex != null ? `idx${tr.memberIndex}` : '-')}`,
  );
}
console.log('  skipped:');
for (const s of tk.skipped || []) console.log(`    - ${s.id}: ${s.reason}`);
console.log('  📌 阳性：43:4893/4898/4903 应被整行接管（3 members，最小 index 渲染整行）');
console.log('  📌 阴性：43:4785（设备名称列，9 TEXT）不得被接管为统计行');

// ---------- 6. 真值基线节点存在性（修正：遍历 document）----------
console.log('\n=== 6. 真值基线节点存在性自查（document 子树）===');
const ids = new Set();
const collect = (n) => {
  if (!n || typeof n !== 'object') return;
  if (n.id != null) ids.add(String(n.id));
  for (const c of n.children || []) collect(c);
};
collect(doc);
const missing = [];
for (const id of [
  '43:4782', '807:3', '43:4890', '43:4886', '43:4891', '43:4892', '43:4893', '43:4898', '43:4903',
  '43:4784', '43:4785', '43:4812', '43:4869', '43:4875', '43:4878', '43:4787', '43:4814',
  '43:4833', '43:4852', '43:4862',
]) {
  if (!ids.has(id)) missing.push(id);
}
console.log(`  文档 §2 列出的 20 个关键节点：缺失 ${missing.length} 个`, missing.length ? missing.join(', ') : '（全在 ✅）');

// ---------- 8. 刀 53d 渲染实测（把「应能渲染 3 卡」从推断升级为实测）----------
console.log('\n=== 8. 刀 53d 渲染实测（map 内已渲染的 vue）===');
// 🔴  collectFoldedGridTakeover 落 map 时已经渲染好（`{kind, sectionId, baseId, vue}`），
//     直接读 vue 才是真机拿到的东西；另起 renderFoldedGridLeafVue(tr) 会因 map 里没带 members 而炸。
const statRows = [...tk.map.entries()].filter(([, tr]) => tr.kind === 'statrow');
const vueOf = (tr) => (Array.isArray(tr.vue) ? tr.vue.join('\n') : String(tr.vue || ''));
// 表格（刀 53e）与统计行同列检查
const tableRows = [...tk.map.entries()].filter(([, tr]) => tr.kind === 'table');
for (const [name, tr] of tableRows) {
  const joined = vueOf(tr);
  const rowsCount = (joined.match(/const rows = \[/g) || []).length
    ? (JSON.parse(joined.match(/const rows = (\[[\s\S]*?\])\n/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')) || []).length
    : 0;
  console.log(`  ${name}: sectionId=${tr.sectionId} baseId=${tr.baseId} 行数=${joined.split('\n').length} rows=${rowsCount}`);
  for (const needle of ['设备名称', '电量', '速度(m/s)', '启用状态', '禁用', 'display:none', 'flex:0 0']) {
    if (joined.includes(needle)) console.log(`      含「${needle}」✅`);
  }
}
const tableMain = tableRows.find(([, tr]) => !vueOf(tr).includes('display:none'));
if (tableMain) {
  console.log(`  --- 整表渲染产物（${tableMain[0]}，前 30 行）---`);
  console.log(
    vueOf(tableMain[1]).split('\n').slice(0, 30).map((l) => `      ${l}`).join('\n'),
  );
  const j = vueOf(tableMain[1]);
  console.log('  --- script（数据行）---');
  console.log(j.split('\n').slice(j.split('\n').findIndex((l) => l.includes('const rows'))).slice(0, 4).map((l) => `      ${l.slice(0, 300)}`).join('\n'));
} else if (tableRows.length) {
  console.log('  ❌ 表格列全部被抑制 ⇒ 整表变空');
}
for (const [name, tr] of statRows) {
  const joined = vueOf(tr);
  console.log(
    `  ${name}: sectionId=${tr.sectionId} kind=${tr.kind} baseId=${tr.baseId} 行数=${joined.split('\n').length}`,
  );
  for (const needle of ['总设备', '运行中', '离线', 'display:none']) {
    if (joined.includes(needle)) console.log(`      含「${needle}」✅`);
  }
}
const first = statRows.find(([, tr]) => !vueOf(tr).includes('display:none'));
if (first) {
  console.log(`  --- 整行渲染产物（${first[0]}，前 46 行）---`);
  console.log(
    vueOf(first[1])
      .split('\n')
      .slice(0, 46)
      .map((l) => `      ${l}`)
      .join('\n'),
  );
} else {
  console.log('  ❌ 三个 statrow 全部被抑制（无整行渲染者）⇒ 统计行会整行消失');
}

// ---------- 9. 刀 55 对「编造副本」的判定（喂真实产物）----------
console.log('\n=== 9. 刀 55 plan 外编造副本判定（detectOrphanDuplicateComponents 喂真实产物）===');
const { detectOrphanDuplicateComponents } = await import(`${BASE}/utils/plan-orphan-guard.js`);
const files = [];
const compDir = join(PKG, 'components');
if (existsSync(compDir)) {
  for (const f of readdirSync(compDir)) {
    if (!f.endsWith('.vue')) continue;
    files.push({ path: `package/components/${f}`, content: readFileSync(join(compDir, f), 'utf-8') });
  }
}
const orphanRes = detectOrphanDuplicateComponents({ files, plan: { effectiveSections: sections } });
console.log('  evaluated =', orphanRes.evaluated, ' hits =', orphanRes.hits, ' planNames =', orphanRes.planNames, orphanRes.skippedReason || '');
for (const i of orphanRes.issues || []) {
  console.log(`  ✅ ${i.orphanName} 判为 ${i.duplicateOfName} 的编造副本，文本=${JSON.stringify(i.texts)}`);
}

// ---------- 7. 产物现状（对照文档 §3.2 / §3.3 的缺陷）----------
console.log('\n=== 7. 产物现状（缺陷是否仍在）===');
const grepAll = (needle) => {
  const hits = [];
  const dir = join(PKG, 'components');
  if (!existsSync(dir)) return hits;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.vue')) continue;
    const txt = readFileSync(join(dir, f), 'utf-8');
    txt.split('\n').forEach((line, i) => {
      if (line.includes(needle)) hits.push(`${f}:${i + 1}`);
    });
  }
  return hits;
};
for (const needle of ['总设备', '运行中', '离线', 'disabled']) {
  console.log(`  「${needle}」出现于: ${grepAll(needle).join(' / ') || '（无）'}`);
}

// ---------- 10. 刀 56 对「disabled 中英混写」的处置（喂真实产物 + Figma 全树真值）----------
console.log('\n=== 10. 刀 56 字面量漂移（healHardcodedText 喂真实产物）===');
const { healHardcodedText } = await import(`${BASE}/utils/hardcoded-text-gate.js`);
const gateRes = healHardcodedText({ files, figmaRoot: figmaRaw });
console.log(`  healed=${gateRes.healed.length} stripped=${gateRes.stripped.length} residual=${gateRes.residual.length} evaluated=${gateRes.evaluated} hits=${gateRes.hits}`);
for (const h of gateRes.healed) {
  console.log(`  ✅ heal ${h.path}: ${JSON.stringify(h.from)} → ${JSON.stringify(h.to)} (${h.kind})`);
}
for (const s of gateRes.stripped) console.log(`  🗑 strip ${s.path}: ${JSON.stringify(s.text)} (${s.kind})`);
for (const r of gateRes.residual) console.log(`  🟡 residual ${r.path}: ${JSON.stringify(r.text)} (${r.reason})`);
// 残留 disabled 必须只剩 CSS class 名后缀（不参与文本渲染）
const disabledLeft = [];
for (const f of gateRes.files) {
  const txt = typeof f.content === 'string' ? f.content : '';
  for (const m of txt.matchAll(/.{0,24}disabled.{0,24}/g)) disabledLeft.push(`${f.path}: …${m[0]}…`);
}
console.log(`  heal 后文件内残留 'disabled' 上下文：${disabledLeft.length} 处`);
for (const l of disabledLeft) console.log(`    ${l}`);

// ---------- 11. 刀 57 对「双标题」的处置（喂真实产物 + plan + Figma 树）----------
console.log('\n=== 11. 刀 57 面板标题槽位归属（healPanelTitleSlot 喂真实产物）===');
const { healPanelTitleSlot } = await import(`${BASE}/utils/panel-chrome-misplacement.js`);
const filesMap = {};
for (const f of files) filesMap[f.path] = f.content;
if (existsSync(join(PKG, 'index.vue'))) {
  filesMap['package/index.vue'] = readFileSync(join(PKG, 'index.vue'), 'utf-8');
}
const slotRes = healPanelTitleSlot(filesMap, { plan: { effectiveSections: sections }, figmaRoot: figmaRaw });
console.log(`  evaluated=${slotRes.evaluated} changes=${slotRes.changes.length} ${slotRes.skippedReason ? 'skipped=' + slotRes.skippedReason : ''}`);
for (const c of slotRes.changes) {
  console.log(`  ✅ ${c.file}: ${c.component}(${c.sectionId}) ${c.from} → ${c.to}`);
}
const healedIndex = slotRes.files['package/index.vue'] || '';
console.log(`  heal 后 index.vue: title-left=${(healedIndex.match(/#title-left/g) || []).length} 处, header-right=${(healedIndex.match(/#header-right/g) || []).length} 处`);
