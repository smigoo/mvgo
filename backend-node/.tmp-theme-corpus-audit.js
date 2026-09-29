/**
 * A 的全语料取证（只读）：
 *  Q1 业务样式文件里，有多少「引用了 theme 作用域槽位」但**没有主题作用域**（无 import 入口）？
 *     → 决定「停止注入颜色槽」是否会导致 LESS undefined。
 *  Q2 有多少文件把 theme 槽位当 **LESS 颜色函数实参**（lighten/darken/fade…）？
 *     → 决定「刀 16b 中立色注入」能否安全删除。
 *  Q3 当前全语料 THEME-SLOT-LOCAL-OVERRIDE（门禁 BLOCK）命中面？
 *     → 决定 A 的收益面。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-theme-corpus-audit.js
 */
const fs = require('fs');
const path = require('path');

const {
  detectThemeColorViolations,
  collectFileLevelSlotOverrides,
} = require('./dist/ai-engine/utils/theme-color-guard.js');

const ROOT = path.resolve(__dirname, 'workspace/custom-components');

const LESS_COLOR_FN = /\b(lighten|darken|fade|fadein|fadeout|saturate|desaturate|spin|mix|tint|shade|greyscale|contrast)\s*\(/i;

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
      if (e.name === 'images' || e.name === 'node_modules' || e.name === 'dist') continue;
      walkFiles(full, r, out);
    } else if (/\.(less|vue)$/.test(e.name)) {
      out.push({ path: r, full, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return out;
}

/** theme 作用域槽位名（.theme-light()/.theme-dark() 内声明） */
function themeScopedNames(themeVars) {
  const names = new Set();
  let inTheme = false;
  let depth = 0;
  for (const raw of String(themeVars || '').split('\n')) {
    const t = raw.trim();
    if (!inTheme) {
      if (/^\.(theme-dark|theme-light)\s*\(\s*\)\s*\{/.test(t)) {
        inTheme = true;
        depth = 1;
      }
      continue;
    }
    depth += (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
    const m = t.replace(/\/\/.*$/, '').trim().match(/^@([\w-]+)\s*:/);
    if (m) names.add(m[1]);
    if (depth <= 0) inTheme = false;
  }
  return names;
}

const products = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let q1LackScope = [];
let q2ColorFn = [];
let q3SlotOverride = [];
let q3Files = 0;
let scanned = 0;
let onlyReal = 0;

for (const p of products) {
  const dir = path.join(ROOT, p);
  const files = walkFiles(dir, '', []);
  if (files.length === 0) continue;
  scanned++;
  // 只统计「真产物」：package/*.vue 存在
  if (!files.some((f) => /^package\/.*\.vue$/.test(f.path))) continue;
  onlyReal++;

  const themeVarsFile = files.find((f) => /theme-vars\.less$/.test(f.path));
  const themeVars = themeVarsFile ? themeVarsFile.content : '';
  const scoped = themeScopedNames(themeVars);
  if (scoped.size === 0) continue;

  // Q1/Q2：只看业务样式（排除 themes/、config/、缓存/snapshot）
  for (const f of files) {
    if (/\/themes\//.test(f.path) || /\/config\//.test(f.path)) continue;
    if (f.path.startsWith('.mc-gen/') || f.path.startsWith('.snapshots/')) continue;
    const isVue = f.path.endsWith('.vue');
    let styleText = f.content;
    if (isVue) {
      const parts = [...f.content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
      styleText = parts.join('\n');
      if (!styleText) continue;
    }
    const hasThemeImport = isVue
      ? /@import\s+['"][^'"]*resources\/styles\/index\.less['"]/.test(f.content)
      : // 独立 .less：common.less 由 index.less / themes/*.less **导入**，作用域由入口提供 → 视为有作用域
        /(?:^|\/)(?:common|index)\.less$/.test(f.path) ||
        /@import\s+['"][^'"]*(?:\.\/)?(?:common|themes\/|index)[^'"]*\.less['"]/.test(f.content);
    // 引用了 theme 作用域槽位？
    const refs = [...new Set([...styleText.matchAll(/@([\w-]+)(?![\w-])/g)].map((m) => m[1]))].filter((n) =>
      scoped.has(n),
    );
    if (refs.length > 0 && !hasThemeImport) {
      q1LackScope.push({ p, file: f.path, refs: refs.slice(0, 5), scope: hasThemeImport });
    }
    // Q2：颜色函数实参
    if (refs.some((n) => new RegExp(`${LESS_COLOR_FN.source}[^;{}]*@${n}(?![\\w-])`, 'i').test(styleText))) {
      q2ColorFn.push({ p, file: f.path, refs: refs.slice(0, 5) });
    }
  }

  const issues = detectThemeColorViolations(
    files.filter((f) => !f.path.startsWith('.mc-gen/') && !f.path.startsWith('.snapshots/')),
  );
  const hits = collectFileLevelSlotOverrides(
    files.filter((f) => !f.path.startsWith('.mc-gen/') && !f.path.startsWith('.snapshots/')),
  );
  const blockIds = issues.filter((i) => i.severity === 'BLOCK').map((i) => i.id);
  if (hits.length > 0 || blockIds.includes('THEME-SLOT-LOCAL-OVERRIDE')) {
    const byFile = {};
    for (const h of hits) byFile[h.file] = (byFile[h.file] || 0) + 1;
    q3SlotOverride.push({ p, n: hits.length, files: byFile, blocks: blockIds });
    q3Files += hits.length;
  }
}

console.log(`语料：目录 ${products.length}，含 .less/.vue 的 ${scanned}，判定为「真产物」的 ${onlyReal}`);
console.log('');
console.log(`Q1 引用 theme 槽位但【无主题 import 入口】的文件：${q1LackScope.length} 处`);
for (const x of q1LackScope.slice(0, 15)) console.log(`   ${x.p} :: ${x.file}  refs=${x.refs.join(',')}`);
console.log('');
console.log(`Q2 把 theme 槽位当 LESS 颜色函数实参的文件：${q2ColorFn.length} 处`);
for (const x of q2ColorFn.slice(0, 15)) console.log(`   ${x.p} :: ${x.file}  refs=${x.refs.join(',')}`);
console.log('');
console.log(`Q3 文件级槽位字面量重声明（门禁 BLOCK 源）：${q3SlotOverride.length} 个产物 / ${q3Files} 条`);
{
  const withSlotBlock = q3SlotOverride.filter((x) => x.blocks.includes('THEME-SLOT-LOCAL-OVERRIDE'));
  console.log(`   其中「门禁真报 BLOCK THEME-SLOT-LOCAL-OVERRIDE」：${withSlotBlock.length} 个产物`);
  // 命中位置分布：行号 1 的占比 + SFC 共行 vs 独立 .less
  const allHits = [];
  for (const p of products) {
    const dir = path.join(ROOT, p);
    const files = walkFiles(dir, '', []).filter(
      (f) => !f.path.startsWith('.mc-gen/') && !f.path.startsWith('.snapshots/'),
    );
    if (!files.some((f) => /^package\/.*\.vue$/.test(f.path))) continue;
    for (const h of collectFileLevelSlotOverrides(files)) allHits.push(h);
  }
  const line1 = allHits.filter((h) => h.line === 1).length;
  console.log(`   全语料文件级槽位重声明总条数：${allHits.length}（其中第 1 行 ${line1} = ${((line1 / Math.max(1, allHits.length)) * 100).toFixed(1)}%）`);
  const byExt = {};
  for (const h of allHits) {
    const k = h.file.endsWith('.vue') ? '.vue' : '.less';
    byExt[k] = (byExt[k] || 0) + 1;
  }
  console.log(`   按文件类型：${JSON.stringify(byExt)}`);
  for (const x of withSlotBlock.slice(0, 12)) {
    console.log(`   BLOCK ${x.p}  n=${x.n}  files=${JSON.stringify(x.files)}`);
  }
}
