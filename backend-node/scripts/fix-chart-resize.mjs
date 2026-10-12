/**
 * 存量修复：把 I9 违规的真实产物用自愈器修复（只改目标文件，不碰其他产物）。
 * 用法：node scripts/fix-chart-resize.mjs --target <组件目录名> [--dry]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { healChartResizeListener } from '../src/ai-engine/utils/chart-resize-healer.js';
import { runArtifactInvariants } from '../src/ai-engine/utils/artifact-invariants.js';

const argv = process.argv.slice(2);
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : ''; };
const DRY = argv.includes('--dry');
const target = argOf('--target');

if (!target) {
  console.error('缺少 --target <组件目录名>');
  process.exit(2);
}

// 🔴 作用域白名单：只允许 workspace/custom-components 下的路径
const ROOTS = [
  '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
  '/Users/smigoo/工作/mvgo/backend-node/workspace/custom-components',
];

let touched = 0;
const report = [];

for (const root of ROOTS) {
  const files = {};
  // 只处理该组件目录内的 .vue
  const walk = (dir, base = '') => {
    let es;
    // ⚠️ 必须用 import 进来的 readdirSync：ESM 里 require 未定义，
    // 写成 require() 会每次抛错被下方 catch 吞掉 ⇒ 静默扫不到任何文件
    // （表现为「无I9 违规，无需修复」，极具误导性——本轮真踩过一次）。
    try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (['node_modules', 'dist', '.mc-gen'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, base + e.name + '/');
      else if (/\.vue$/i.test(e.name)) {
        try { files[base + e.name] = readFileSync(p, 'utf8'); } catch { /* 忽略 */ }
      }
    }
  };
  try { walk(join(root, target)); } catch { continue; }

  if (Object.keys(files).length === 0) {
    report.push(`⚠️  ${join(root, target)} 未扫描到任何 .vue（路径不存在或非组件目录）`);
    continue;
  }
  report.push(`── ${root}: 扫描到 ${Object.keys(files).length} 个 .vue`);

  for (const [rel, content] of Object.entries(files)) {
    const r = healChartResizeListener(content);
    if (!r.injected) continue;

    const before = runArtifactInvariants({ [rel]: content }).violations.filter((v) => v.id === 'I9').length;
    const after = runArtifactInvariants({ [rel]: r.content }).violations.filter((v) => v.id === 'I9').length;
    const abs = join(root, target, rel);

    if (before === 0) {
      report.push(`⏭  跳过（非 I9 违规） ${abs}`);
      continue;
    }
    if (after !== 0) {
      report.push(`❌ 修复后仍有 I9 ${abs} (before=${before} after=${after})`);
      continue;
    }
    if (!DRY) writeFileSync(abs, r.content, 'utf8');
    touched++;
    report.push(`✅ 已修复 I9 ${before}→${after}  ${abs}${DRY ? '（dry-run 未落盘）' : ''}`);
    report.push(`     detail=${JSON.stringify(r.detail)}`);
  }
}

console.log(report.join('\n') || '（无 I9 违规，无需修复）');
console.log(`\n处理 ${touched} 个文件${DRY ? '（dry-run）' : ''}`);