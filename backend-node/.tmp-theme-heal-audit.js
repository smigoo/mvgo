/**
 * A 取证补丁 2（只读）：
 *  Q3b：对 491 份真产物逐个跑 healFileLevelSlotOverrides，看「修 共行 漏洞前/后」能删掉多少条。
 *        若修前删不掉非第 1 行的声明 → 说明自愈器还有别的口径缺口。
 *  Q3c：抽样打印几条真实残留的上下文，判「是注入器产的还是 LLM 写的」。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-theme-heal-audit.js
 */
const fs = require('fs');
const path = require('path');

const g = require('./dist/ai-engine/utils/theme-color-guard.js');

const ROOT = path.resolve(__dirname, 'workspace/custom-components');

function walkFiles(dir, rel, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (['images', 'node_modules', 'dist'].includes(e.name)) continue;
      walkFiles(full, r, out);
    } else if (/\.(less|vue)$/.test(e.name)) {
      out.push({ path: r, full, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return out;
}

function productFiles(p) {
  return walkFiles(path.join(ROOT, p), '', []).filter(
    (f) => !f.path.startsWith('.mc-gen/') && !f.path.startsWith('.snapshots/'),
  );
}

const products = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((p) => productFiles(p).some((f) => /^package\/.*\.vue$/.test(f.path)));

let before = 0;
let afterHeal = 0;
let productsWithResidual = 0;
const residualSamples = [];
const lineNoDist = {};

for (const p of products) {
  const files = productFiles(p);
  const h0 = g.collectFileLevelSlotOverrides(files);
  before += h0.length;
  for (const h of h0) {
    const k = h.file.endsWith('.vue') ? '.vue' : '.less';
    lineNoDist[`${k}@L${h.line === 1 ? '1' : '>1'}`] = (lineNoDist[`${k}@L${h.line === 1 ? '1' : '>1'}`] || 0) + 1;
  }
  g.healFileLevelSlotOverrides(files); // 就地改 content
  const h1 = g.collectFileLevelSlotOverrides(files);
  afterHeal += h1.length;
  if (h1.length > 0) {
    productsWithResidual++;
    if (residualSamples.length < 6) {
      for (const h of h1.slice(0, 2)) {
        residualSamples.push({ p, ...h });
      }
    }
  }
}

console.log(`真产物数：${products.length}`);
console.log(`文件级槽位字面量：自愈前 ${before} 条 → 自愈后 ${afterHeal} 条（残留产物 ${productsWithResidual} 个）`);
console.log('行号分布：', JSON.stringify(lineNoDist));
console.log('');
console.log('=== 残留样本（自愈器删不掉的） ===');
for (const s of residualSamples) {
  const f = productFiles(s.p).find((x) => x.path === s.file);
  const lines = String(f.content).split('\n');
  const i = s.line - 1;
  console.log(`--- ${s.p} :: ${s.file}:${s.line}  ${s.sample}`);
  for (let k = Math.max(0, i - 1); k <= Math.min(lines.length - 1, i + 1); k++) {
    console.log(`      ${k + 1}| ${lines[k].slice(0, 120)}`);
  }
}
