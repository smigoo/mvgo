/**
 * B-1 全语料影响面审计（只读）：
 *  统计 491 份真产物中「同时存在 注入的 min-height 标记 与 显式绝对 height」的图表块
 *  —— 这些正是 B-1 会改变行为的样本，需逐条确认「多余兜底值确实压过了真值」。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-b1-corpus-audit.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, 'workspace/custom-components');
const CHART_CLS_RE = /\.(c-[\w-]+-[\w-]*chart[\w-]*|chart-[\w-]+)\s*\{([^}]*)\}/gi;
const NON_CONTAINER_RE =
  /-(?:title|legend|icon|text|header|bridge|section|forecast|tunnel|item|dot|label|name|value|stat)(?:-|$)/i;

function walk(dir, rel, out) {
  let es;
  try {
    es = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of es) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (['images', 'node_modules', 'dist'].includes(e.name) || e.name.startsWith('.snapshots')) continue;
      walk(full, r, out);
    } else if (/\.(less|vue)$/.test(e.name)) out.push({ path: r, content: fs.readFileSync(full, 'utf8') });
  }
  return out;
}

const products = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((p) => fs.existsSync(path.join(ROOT, p, 'package')));

const hits = [];
let totalInjectedBlocks = 0;
let withTruthHeight = 0;
let truthLtInjected = 0;

for (const p of products) {
  const files = walk(path.join(ROOT, p), '', []);
  if (!files.some((f) => /^package\/.*\.vue$/.test(f.path))) continue;
  for (const f of files) {
    if (!f.path.endsWith('.vue') && !f.path.endsWith('.less')) continue;
    CHART_CLS_RE.lastIndex = 0;
    let m;
    while ((m = CHART_CLS_RE.exec(f.content)) !== null) {
      const cls = m[1];
      const body = m[2];
      if (NON_CONTAINER_RE.test(cls)) continue;
      if (!/防挤压/.test(body)) continue; // 只统计本注入器的产物
      totalInjectedBlocks++;
      // 块内是否有显式绝对 height（B-1 的判据）
      const h = /(?:^|[;{])\s*height\s*:\s*([\d.]+)\s*px/i.exec(body);
      const mh = /min-height\s*:\s*([\d.]+)\s*px/i.exec(body);
      if (!h) continue;
      withTruthHeight++;
      const hv = parseFloat(h[1]);
      const mhv = mh ? parseFloat(mh[1]) : null;
      if (mhv != null && mhv > hv) {
        truthLtInjected++;
        if (hits.length < 25) {
          hits.push({ p, file: f.path, cls, height: hv, minHeight: mhv, ratio: (mhv / hv).toFixed(2) });
        }
      }
    }
  }
}

console.log(`真产物（含 package/）：${products.length}`);
console.log(`带「防挤压」注入标记的图表块：${totalInjectedBlocks}`);
console.log(`其中块内还有显式 px height（B-1 判据命中）：${withTruthHeight}`);
console.log(`其中 min-height > height（兜底值压过真值，实际会渲染错）：${truthLtInjected}`);
console.log('');
console.log('样本（min-height 压过真值）:');
for (const h of hits) {
  console.log(`  ${h.p} :: ${h.file}  .${h.cls}  height=${h.height}px  min-height=${h.minHeight}px  (${h.ratio}×)`);
}
