/**
 * ② 全语料误伤审计：新的「归属判据」会让哪些背景挂载被**新挡**（fail-closed）？
 *
 * 口径复用实现导出的真函数：
 *   - bgBindingOwnership  ← dist/ai-engine/roles/microcode/resource-mounter.js
 *   - 锚点标签正则         ← 与 resource-mount-plan.js 事实链分支**逐字同源**
 *   - 背景条目判据         ← previewAnalysisRole === 'bg'
 *
 * 分类（每条 bg 资源）：
 *   anchor-missing   产物里找不到 data-section-id="<ownerSectionId>" 的元素（① 的目标面）
 *   mounted-self     锚点元素已绑本资源（幂等，行为不变）
 *   free             锚点元素无背景绑定（照旧可挂）
 *   blocked-other    ⚠️ 锚点元素已绑**别的资源变量** ⇒ 新增 fail-closed（可能误伤）
 *   blocked-literal  ⚠️ 锚点元素已绑**字面量路径** ⇒ 新增 fail-closed（可能误伤）
 */
const fs = require('fs');
const path = require('path');
const { bgBindingOwnership } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');
const { findTagBySectionAnchor } = require('./dist/ai-engine/roles/microcode/resource-mount-plan.js');

const BASE = path.join(__dirname, 'workspace/custom-components');
const SKIP = new Set(['.mc-gen', '.snapshots', '.checkpoint', 'node_modules', '.git']);

function walk(dir, filter, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

const stat = { comps: 0, bgEntries: 0, anchorMissing: 0, mountedSelf: 0, free: 0, blockedOther: 0, blockedLiteral: 0 };
const samplesBlocked = [];
const samplesMissing = [];

for (const d of fs.readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  const compDir = path.join(BASE, d.name);
  const mp = path.join(compDir, '.mc-gen', 'resource-dom-mapping.json');
  if (!fs.existsSync(mp)) continue;
  let arr;
  try { arr = JSON.parse(fs.readFileSync(mp, 'utf-8')); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  stat.comps++;

  const vueFiles = walk(path.join(compDir, 'package'), (n) => /\.vue$/i.test(n));
  const fileMap = new Map();
  for (const f of vueFiles) { try { fileMap.set(f, fs.readFileSync(f, 'utf-8')); } catch {} }

  for (const e of arr) {
    if (!e || e.previewAnalysisRole !== 'bg') continue;
    const varName = e.assignedVarName;
    const anchor = e.ownerSectionId != null ? String(e.ownerSectionId) : null;
    if (!varName || !anchor) continue;
    stat.bgEntries++;

    let found = null, foundFile = null;
    for (const [f, c] of fileMap) {
      if (!c.includes(`data-section-id="${anchor}"`)) continue;
      const m = findTagBySectionAnchor(c, anchor);
      if (m) { found = m; foundFile = f; break; }
    }
    if (!found) {
      stat.anchorMissing++;
      if (samplesMissing.length < 10) samplesMissing.push(`${d.name}  ${anchor}  ${varName}  ${e.figmaPath || ''}`);
      continue;
    }
    const own = bgBindingOwnership(found, varName);
    if (own === 'self') stat.mountedSelf++;
    else if (own === 'none') stat.free++;
    else if (own === 'other') { stat.blockedOther++; if (samplesBlocked.length < 12) samplesBlocked.push(`[other]   ${d.name}  ${anchor}  ${varName}  ${path.basename(foundFile)}`); }
    else { stat.blockedLiteral++; if (samplesBlocked.length < 12) samplesBlocked.push(`[literal] ${d.name}  ${anchor}  ${varName}  ${path.basename(foundFile)}`); }
  }
}

console.log('=== ② 归属判据 全语料误伤审计 ===');
console.log(`组件（有映射表）    : ${stat.comps}`);
console.log(`bg 类资源条目       : ${stat.bgEntries}`);
console.log(`  anchor-missing    : ${stat.anchorMissing}   ← ① 的目标面（宿主锚点缺失）`);
console.log(`  mounted-self      : ${stat.mountedSelf}   （幂等，行为不变）`);
console.log(`  free              : ${stat.free}   （照旧可挂）`);
console.log(`  blocked-other     : ${stat.blockedOther}   ⚠️ 新增 fail-closed`);
console.log(`  blocked-literal   : ${stat.blockedLiteral}   ⚠️ 新增 fail-closed`);
console.log('');
console.log('--- 新增 fail-closed 样本 ---');
if (!samplesBlocked.length) console.log('  （无）');
for (const s of samplesBlocked) console.log('  ' + s);
console.log('');
console.log('--- anchor-missing 样本（① 待办） ---');
if (!samplesMissing.length) console.log('  （无）');
for (const s of samplesMissing) console.log('  ' + s);
