/**
 * ① 全语料差分审计：findTagByClassKeyword 从「裸子串」改为「词边界」后，
 *                    命中结果发生什么变化？
 *
 * 同源性说明：
 *   - NEW 侧 = dist 导出的真函数（实现）
 *   - OLD 侧 = 审计内**逐字复刻**旧逻辑（cls.includes(kw) / dePlural(cls).includes(kwDe)），
 *     仅用于差分对照（旧实现已被替换，无法直接引用）。
 */
const fs = require('fs');
const path = require('path');
const { findTagByClassKeyword: newFind } = require('./dist/ai-engine/roles/microcode/resource-mounter.js');

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

/** 逐字复刻旧实现（差分对照用） */
function oldFind(content, kw) {
  if (!content || typeof content !== 'string') return null;
  const kwNorm = String(kw || '').toLowerCase();
  if (!kwNorm) return null;
  const dePlural = (s) =>
    String(s).toLowerCase().split('-')
      .map((seg) => (seg.length >= 4 && /s$/.test(seg) ? seg.slice(0, -1) : seg)).join('-');
  const kwDe = dePlural(kwNorm);
  const tags = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>/])*)>/g;
  let m;
  while ((m = tagRe.exec(content)) !== null) {
    if (/^script$/i.test(m[1]) || /^style$/i.test(m[1])) continue;
    const attrs = m[2] || '';
    const classMatch = attrs.match(/class="([^"]*)"/) || attrs.match(/class='([^']*')/);
    if (classMatch) tags.push({ raw: m[0], cls: classMatch[1].toLowerCase() });
  }
  const exact = tags.find((t) => t.cls.includes(kwNorm));
  if (exact) return exact.raw;
  const fuzzy = tags.find((t) => dePlural(t.cls).includes(kwDe));
  return fuzzy ? fuzzy.raw : null;
}

const clsOf = (tag) => {
  if (!tag) return '(null)';
  const m = tag.match(/class="([^"]*)"/);
  return m ? m[1] : tag.slice(0, 40);
};

const stat = { comps: 0, entries: 0, same: 0, changed: 0, lost: 0, gained: 0 };
const samplesLost = [];
const samplesChanged = [];
const lostMt = new Map();

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
    if (!e || !e.mountTarget) continue;
    stat.entries++;
    const mt = String(e.mountTarget);
    let o = null, n = null;
    for (const [, c] of fileMap) {
      if (!o) o = oldFind(c, mt);
      if (!n) n = newFind(c, mt);
      if (o && n) break;
    }
    if (o === n) { stat.same++; continue; }
    if (o && !n) {
      stat.lost++;
      lostMt.set(mt, (lostMt.get(mt) || 0) + 1);
      if (samplesLost.length < 15) samplesLost.push(`${d.name}  mountTarget="${mt}"  OLD→${clsOf(o)}`);
    } else if (o && n) {
      stat.changed++;
      if (samplesChanged.length < 12) samplesChanged.push(`${d.name}  mountTarget="${mt}"  OLD→${clsOf(o)}  NEW→${clsOf(n)}`);
    } else { stat.gained++; }
  }
}

console.log('=== ① 词边界 差分审计（OLD 裸子串 vs NEW 词边界）===');
console.log(`组件        : ${stat.comps}`);
console.log(`资源条目（有 mountTarget）: ${stat.entries}`);
console.log(`  命中相同  : ${stat.same}`);
console.log(`  换宿主    : ${stat.changed}   （两边都命中，但选了不同元素）`);
console.log(`  变为 null : ${stat.lost}   ⚠️ 需逐条判「旧命中是否正确」`);
console.log(`  由 null 恢复命中: ${stat.gained}`);
console.log('');
console.log('--- 「变为 null」的 mountTarget 频次 ---');
[...lostMt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  "${k}"`));
console.log('');
console.log('--- 「变为 null」样本（旧命中，看是否本就是错误劫持） ---');
if (!samplesLost.length) console.log('  （无）');
for (const s of samplesLost) console.log('  ' + s);
console.log('');
console.log('--- 「换宿主」样本 ---');
if (!samplesChanged.length) console.log('  （无）');
for (const s of samplesChanged) console.log('  ' + s);
