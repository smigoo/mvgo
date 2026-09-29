/**
 * 全语料审计：T05 fixBackgroundImageSize 到底改掉了什么？
 *
 * 判据（复用实现导出的同源函数）：
 *   - 真函数 = dist/ai-engine/utils/post-process.js#fixBackgroundImageSize
 *   - 几何真值 = dist/ai-engine/utils/background-size-inference.js#inferBackgroundStyle
 *     （对 resource-dom-mapping.json 每条 entry 求 size，得到「管线本应写出的 px 尺寸」集合）
 *
 * 分类：
 *   A. truth-size  —— 被改的 'Xpx Ypx' 精确等于某条映射的推断 size ⇒ T05 改掉了几何真值（有害）
 *   B. other-px    —— 不等 ⇒ 无真值来源（LLM 自写 or 其他），T05 是否合理需人判
 *   C. 按载体分 .vue inline / .less css
 */
const fs = require('fs');
const path = require('path');
const { fixBackgroundImageSize } = require('./dist/ai-engine/utils/post-process.js');
const { inferBackgroundStyle } = require('./dist/ai-engine/utils/background-size-inference.js');

const BASE = path.join(__dirname, 'workspace/custom-components');
const SKIP_DIRS = new Set(['.mc-gen', '.snapshots', '.checkpoint', 'node_modules', '.git']);

function walk(dir, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(vue|less|css)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** 取该组件所有映射条目的推断 size（'Xpx Ypx' / '100% 100%'） */
function truthSizesOf(compDir) {
  const mp = path.join(compDir, '.mc-gen', 'resource-dom-mapping.json');
  const set = new Set();
  let entries = 0;
  if (!fs.existsSync(mp)) return { set, entries };
  let arr;
  try { arr = JSON.parse(fs.readFileSync(mp, 'utf-8')); } catch { return { set, entries }; }
  if (!Array.isArray(arr)) return { set, entries };
  for (const e of arr) {
    entries++;
    const s = inferBackgroundStyle({
      figmaBox: e.figmaBox, parentBox: e.parentBox, visualMeta: e.visualMeta,
    });
    if (s && s.size) set.add(s.size);
  }
  return { set, entries };
}

const RE = /background-?[Ss]ize:\s*['"]?(\d+)px\s+(\d+)px['"]?/g;

const comps = fs.readdirSync(BASE, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name))
  .map((d) => path.join(BASE, d.name));

const stat = {
  comps: 0, compsWithMapping: 0, mappingEntries: 0,
  files: 0, filesHit: 0, hits: 0,
  truthSize: 0, otherPx: 0,
  vue: 0, less: 0,
};
const samplesTruth = [];
const samplesOther = [];
const otherValueCount = new Map();

for (const comp of comps) {
  stat.comps++;
  const { set: truth, entries } = truthSizesOf(comp);
  if (entries > 0) stat.compsWithMapping++;
  stat.mappingEntries += entries;
  const files = walk(path.join(comp, 'package'));
  for (const f of files) {
    stat.files++;
    let c;
    try { c = fs.readFileSync(f, 'utf-8'); } catch { continue; }
    if (!/background-?[Ss]ize:/i.test(c)) continue;
    const matches = [...String(c).matchAll(RE)];
    if (!matches.length) continue;
    stat.filesHit++;
    for (const m of matches) {
      stat.hits++;
      const sizeStr = `${m[1]}px ${m[2]}px`;
      const isLess = /\.less$/i.test(f);
      if (isLess) stat.less++; else stat.vue++;
      if (truth.has(sizeStr)) {
        stat.truthSize++;
        if (samplesTruth.length < 12) {
          samplesTruth.push(`${path.basename(path.dirname(path.dirname(f)))}/${path.relative(BASE, f)}  '${sizeStr}'  (line≈${String(c).slice(0, m.index).split('\n').length})`);
        }
      } else {
        stat.otherPx++;
        otherValueCount.set(sizeStr, (otherValueCount.get(sizeStr) || 0) + 1);
        if (samplesOther.length < 12) {
          samplesOther.push(`${path.relative(BASE, f)}  '${sizeStr}'  (line≈${String(c).slice(0, m.index).split('\n').length})`);
        }
      }
    }
  }
}

console.log('=== T05 fixBackgroundImageSize 全语料审计 ===');
console.log(`组件数            : ${stat.comps}（有映射表 ${stat.compsWithMapping}，映射条目合计 ${stat.mappingEntries}）`);
console.log(`扫描 .vue/.less   : ${stat.files} 个文件，命中 ${stat.filesHit} 个`);
console.log(`命中处（会被改成 cover）: ${stat.hits}     载体 { .vue ${stat.vue}, .less ${stat.less} }`);
console.log(`  A. == 几何真值 size : ${stat.truthSize}   ← 删 T05 即保住这些真值`);
console.log(`  B. 其他 px         : ${stat.otherPx}   ← 无真值来源，需人判`);
console.log('');
console.log('--- A 类样本（T05 正在销毁的几何真值） ---');
for (const s of samplesTruth) console.log('  ' + s);
console.log('');
console.log('--- B 类样本（无真值来源的 px） ---');
for (const s of samplesOther) console.log('  ' + s);
console.log('');
console.log('--- B 类 top 15 频次 ---');
[...otherValueCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
