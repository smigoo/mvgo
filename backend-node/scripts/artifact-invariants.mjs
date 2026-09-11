#!/usr/bin/env node
/**
 * @file artifact-invariants.mjs — 🛡️ R2-2 治本（2026-09-11）CLI 入口
 *
 * 对一个已生成组件目录跑六条产物不变量（核心逻辑在
 * src/ai-engine/utils/artifact-invariants.js，与管线内终验共用同一实现）：
 *   I1 内容根高度 / I2 标签↔import↔文件三向对齐 / I3 tabs 唯一性 /
 *   I4 根容器形态锚定 / I5 类名对齐(warn) / I6 资源挂载对齐
 *
 * 用法：
 *   node scripts/artifact-invariants.mjs <componentDir>        # 单组件目录
 *   node scripts/artifact-invariants.mjs --recent [N]          # 最近 N 个 temp-components 任务（默认 5）
 *   加 --strict 时存在 error 级违规 → exit 1（CI / 发布前门禁）
 *
 * 退出码：0 = 无 error 级违规；1 = 有 error 级违规或目录不可读。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArtifactInvariants } from '../src/ai-engine/utils/artifact-invariants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');
const WORKSPACE = join(BACKEND_ROOT, 'workspace');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');

function collectFiles(dir, base = dir, acc = {}) {
  for (const name of readdirSync(dir)) {
    // 隐藏目录一律跳过：.mc-gen（生成缓存 + code-chunks 分片）、.git、.user-patch-* 等
    // 均非产物面。分片片段跑 I2 会必然误报（已由核心 isArtifactPath 兜底，此处省 IO）。
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectFiles(p, base, acc);
    else {
      const rel = relative(base, p).split('\\').join('/');
      try {
        acc[rel] = readFileSync(p, 'utf8');
      } catch {
        /* 二进制跳过（图片等不参与文本不变量） */
      }
    }
  }
  return acc;
}

function report(dir, files) {
  const { violations, passed, summary } = runArtifactInvariants(files);
  console.log(`\n▶ ${relative(BACKEND_ROOT, dir) || dir}`);
  console.log(`  ${summary}`);
  if (violations.length === 0) {
    console.log('  ✅ 六条不变量全部通过');
  } else {
    for (const v of violations) {
      const icon = v.severity === 'error' ? '✗' : '⚠';
      console.log(`  ${icon} [${v.id}] (${v.file}) ${v.message}`);
    }
  }
  return passed;
}

function main() {
  let targets = [];
  const recentIdx = args.indexOf('--recent');
  if (recentIdx >= 0) {
    const n = parseInt(args[recentIdx + 1], 10) || 5;
    // 组件实际驻留根：custom-components（生产/预览主池）；temp-components 是生成期暂存，
    // 提升后不在 —— --recent 以 custom-components 为准，两根都探测。
    const roots = [
      join(WORKSPACE, 'custom-components'),
      join(WORKSPACE, 'temp-components'),
    ];
    const taskDirs = [];
    for (const root of roots) {
      let entries;
      try {
        entries = readdirSync(root);
      } catch {
        continue;
      }
      for (const t of entries) {
        const td = join(root, t);
        try {
          if (statSync(td).isDirectory()) taskDirs.push({ td, mtime: statSync(td).mtimeMs });
        } catch {
          /* skip */
        }
      }
    }
    targets = taskDirs.sort((a, b) => b.mtime - a.mtime).slice(0, n).map((x) => x.td);
  } else if (args[0] && !args[0].startsWith('--')) {
    targets = [resolve(args[0])];
  } else {
    console.error('用法: node scripts/artifact-invariants.mjs <componentDir> | --recent [N] [--strict]');
    process.exit(1);
  }

  let allPassed = true;
  for (const dir of targets) {
    try {
      const files = collectFiles(dir);
      allPassed = report(dir, files) && allPassed;
    } catch (e) {
      console.error(`▶ ${dir} 读取失败: ${e.message}`);
      allPassed = false;
    }
  }
  if (STRICT && !allPassed) process.exit(1);
  if (STRICT) console.log('\n✅ --strict 通过');
}

main();
