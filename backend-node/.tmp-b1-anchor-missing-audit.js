/**
 * ① 审计：锚点缺失的 bg 资源，有多少还能靠 mountTarget 关键词确定性命中？
 *   - 复现真函数：findTagByClassKeyword（dist 同源导出）
 *   - 分类：
 *       anchor-ok          锚点元素存在（无需处理）
 *       keyword-hit        锚点缺失，但 mountTarget 关键词在 owner 组件内命中（确定性路径可用，安全）
 *       keyword-miss       ⚠️ 锚点缺失 + 关键词无命中 ⇒ 只能靠语义评分猜祖先（① 的 fail-closed 影响面）
 *   - 另按 mountTarget 长度统计 keyword-miss 分布（单/双字符 mountTarget 是评分噪声高发区）
 */
const fs = require('fs');
const path = require('path');
const { findTagByClassKeyword } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');
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

const stat = { comps: 0, bg: 0, anchorOk: 0, keywordHit: 0, keywordMiss: 0, noMountTarget: 0 };
const missShort = new Map();
const samples = [];

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
    stat.bg++;

    let anchorFound = false;
    for (const [, c] of fileMap) {
      if (!c.includes(`data-section-id="${anchor}"`)) continue;
      if (findTagBySectionAnchor(c, anchor)) { anchorFound = true; break; }
    }
    if (anchorFound) { stat.anchorOk++; continue; }

    const mt = e.mountTarget != null ? String(e.mountTarget) : '';
    if (!mt) { stat.noMountTarget++; continue; }
    let hit = false;
    for (const [, c] of fileMap) {
      if (findTagByClassKeyword(c, mt)) { hit = true; break; }
    }
    if (hit) stat.keywordHit++;
    else {
      stat.keywordMiss++;
      missShort.set(mt, (missShort.get(mt) || 0) + 1);
      if (samples.length < 15) samples.push(`${d.name}  anchor=${anchor}  var=${varName}  mountTarget="${mt}"  ${e.figmaPath || ''}`);
    }
  }
}

console.log('=== ① 锚点缺失 × mountTarget 关键词命中 审计 ===');
console.log(`组件（有映射表）: ${stat.comps}`);
console.log(`bg 条目          : ${stat.bg}`);
console.log(`  anchor-ok      : ${stat.anchorOk}   （锚点元素存在）`);
console.log(`  keyword-hit    : ${stat.keywordHit}   （锚点缺失但关键词命中 → 确定性路径可用）`);
console.log(`  keyword-miss   : ${stat.keywordMiss}   ⚠️ 锚点缺失 + 关键词无命中 → 现走语义评分猜祖先`);
console.log(`  无 mountTarget : ${stat.noMountTarget}`);
console.log('');
console.log('--- keyword-miss 的 mountTarget 频次 top 25（短名 = 评分噪声高发） ---');
[...missShort.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  "${k}"`));
console.log('');
console.log('--- keyword-miss 样本 ---');
for (const s of samples) console.log('  ' + s);
