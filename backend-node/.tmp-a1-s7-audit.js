/**
 * A1 取证（第二轮 · 决定性）：S7 评分兜底选中的宿主，**是否锚点命中**？
 *   - 锚点命中（best.dataSectionId === mount.ownerSectionId）⇒ S7 是安全的（等价于事实链）
 *   - 纯语义评分（无锚点）⇒ 是「猜的」⇒ 才是 fail-closed 的适用面
 *
 * 同源性：全部使用 dist 导出的真函数。
 */
const fs = require('fs');
const path = require('path');
const {
  findTagByClassKeyword,
  collectMountCandidates,
  pickBestMountTarget,
} = require('./dist/ai-engine/roles/microcode/resource-mounter.js');

const BASE = path.join(__dirname, '../frontend/workspace/custom-components');
const SKIP = new Set(['.mc-gen', '.snapshots', '.checkpoint', 'node_modules', '.git']);

function walk(dir, filter, out = []) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(e.name)) out.push(p);
  }
  return out;
}

const clsOf = (tag) => {
  if (!tag) return '(null)';
  const m = String(tag).match(/class="([^"]*)"/);
  return m ? m[1].slice(0, 60) : String(tag).slice(0, 60);
};

const stat = {
  comps: 0,
  bg: 0,
  miss: 0,
  noMt: 0,
  s7Anchored: 0,
  s7Guessed: 0,
  s7Null: 0,
  subStateOwner: 0,
  subStateNoOwner: 0,
};
const guessByRole = {};
const anchorByRole = {};
const samplesGuess = [];
const samplesAnchor = [];

for (const d of fs.readdirSync(BASE, { withFileTypes: true })) {
  if (!d.isDirectory() || SKIP.has(d.name)) continue;
  const compDir = path.join(BASE, d.name);
  const mp = path.join(compDir, '.mc-gen', 'resource-dom-mapping.json');
  if (!fs.existsSync(mp)) continue;
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(mp, 'utf-8'));
  } catch {
    continue;
  }
  if (!Array.isArray(arr)) continue;
  stat.comps++;

  const fileMap = [];
  for (const f of walk(path.join(compDir, 'package'), (n) => /\.vue$/i.test(n))) {
    try {
      fileMap.push([f, fs.readFileSync(f, 'utf-8')]);
    } catch {}
  }
  if (!fileMap.length) continue;

  for (const e of arr) {
    if (!e) continue;
    const isBg =
      String(e.assignedVarName || '').startsWith('bg') || e.previewAnalysisRole === 'bg' || !!e.bgRole;
    if (!isBg) continue;
    stat.bg++;
    const role = e.bgRole || '(none)';
    const mt = e.mountTarget ? String(e.mountTarget) : '';

    // 关键词路径
    let tag = null;
    if (mt) {
      for (const [, c] of fileMap) {
        const t = findTagByClassKeyword(c, mt);
        if (t) {
          tag = t;
          break;
        }
      }
    }

    // 走到 S7 的两类：关键词 miss（有 mt）+ 直接兜底（无 mt）
    if (!tag) {
      if (mt) stat.miss++;
      else stat.noMt++;

      let best = null;
      for (const [f, c] of fileMap) {
        const pool = collectMountCandidates({ [f]: c }, { varName: e.assignedVarName });
        const b = pickBestMountTarget(e, pool, { skipBound: true });
        if (b && b.tag) {
          best = b;
          break;
        }
      }
      if (!best) {
        stat.s7Null++;
        continue;
      }
      const owner = e.ownerSectionId != null ? String(e.ownerSectionId) : null;
      const ds = best.dataSectionId ?? best.candidate?.dataSectionId ?? best.ds ?? null;
      const anchored = !!(owner && ds && String(ds) === owner);
      if (anchored) {
        stat.s7Anchored++;
        anchorByRole[role] = (anchorByRole[role] || 0) + 1;
        if (samplesAnchor.length < 8) {
          samplesAnchor.push(`${d.name} var=${e.assignedVarName} role=${role} mt="${mt || '(null)'}" → ${clsOf(best.tag)} (ds=${ds}==owner)`);
        }
      } else {
        stat.s7Guessed++;
        guessByRole[role] = (guessByRole[role] || 0) + 1;
        if (samplesGuess.length < 20) {
          samplesGuess.push(
            `${d.name} var=${e.assignedVarName} role=${role} mt="${mt || '(null)'}" owner=${owner || '-'} ds=${ds || '-'} → ${clsOf(best.tag)}`,
          );
        }
      }
    }
  }
}

console.log('=== A1 决定性取证：S7 兜底是「锚点命中」还是「纯语义猜」 ===');
console.log(`组件                    : ${stat.comps}`);
console.log(`bg 条目                 : ${stat.bg}`);
console.log(`  关键词 miss（有 mt）  : ${stat.miss}`);
console.log(`  无 mt ⇒ 直接 S7       : ${stat.noMt}`);
console.log('');
console.log(`S7 选中 且 锚点命中      : ${stat.s7Anchored}   ${JSON.stringify(anchorByRole)}   ← 安全（等价事实链）`);
console.log(`S7 选中 但 **纯语义猜**  : ${stat.s7Guessed}   ${JSON.stringify(guessByRole)}   ← ⚠️ fail-closed 的适用面`);
console.log(`S7 也选不出（完全不挂）  : ${stat.s7Null}`);
console.log('');
console.log('--- 「锚点命中」样本（安全） ---');
if (!samplesAnchor.length) console.log('  （无）');
for (const s of samplesAnchor) console.log('  ' + s);
console.log('');
console.log('--- 「纯语义猜」样本（⚠️ 需要 fail-closed 的） ---');
if (!samplesGuess.length) console.log('  （无）');
for (const s of samplesGuess) console.log('  ' + s);
