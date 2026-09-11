#!/usr/bin/env node
/**
 * @file mechanism-reachability-audit.mjs — 🛡️ P2-1 治本（2026-09-11）
 *
 * 「死接线盲区」静态审计：从管线入口（roles/*-engineer.js + graphs/*.js）出发，
 * 沿 import / 动态 import 图做 BFS 可达性分析，报告 src/ai-engine 下**机制类文件**
 * （utils/ validators/ orchestrator/）中不可达（从未被任何入口接线）的模块。
 *
 * 背景（实锤）：generation-context.js#createFixPipeline 是死包装 —— 静态 grep
 * `createFixPipeline` 有引用（它自己内部注册规则），但没有任何调用方 import 它，
 * 导致其中注册的 anchor-root-container 规则「看似生效实则从未执行」，
 * figmaNodeData 漏传缺陷潜伏 10+ 天才被产物复现暴露。
 *
 * 关键点：解析器必须同时覆盖
 *   ① 静态 import/export from '...'
 *   ② 动态 await import('...')（engineer 大量动态加载修复器，静态 grep 不可见）
 *   ③ require('...')（兼容个别 CJS 残留）
 *
 * 用法：
 *   node scripts/mechanism-reachability-audit.mjs              # 列出不可达机制文件（exit 0）
 *   node scripts/mechanism-reachability-audit.mjs --strict     # 有不可达机制文件时 exit 1（CI 门禁）
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AI_ENGINE_ROOT = resolve(__dirname, '../src/ai-engine');
// BFS 全域：整个 backend-node/src（外部消费方 lite/phase2/page-generator/ai-engine-v2 等
// 真实存在 —— 2026-09-11 实测首轮误报，入口不能只看 engineer）
const SRC_ROOT = resolve(__dirname, '../src');

const STRICT = process.argv.includes('--strict');

// 机制目录：这些目录下的文件必须可达，否则是死接线/死代码
const MECHANISM_DIRS = ['utils', 'validators', 'orchestrator'];

// 机制目录中的已知豁免（自身被动态字符串拼接引用 / 纯类型 / 测试辅助等）。
// 豁免必须写明理由，禁止无理由豁免。
const EXEMPT = new Set([
  // G3 立项（2026-09-10）：RUNTIME-STATIC-* 规则编号中心表，待接线消费方
  'validators/runtime-static-rules.js',
  // 分块生成 / checkpoint 基建预案：有专属 spec（chunk-tier.spec.ts 等），接线前保留
  'utils/chunk-tier.js',
  'utils/chunk-timeout.js',
  'utils/context-manifest.js',
  // Loop 4 双裁判门禁立项（pipeline-governance-v2 / loop-234-execution docs）：
  // golden 提取器被 manifest-auditor.spec 依赖，生成器为其配套 CLI，待接线
  'utils/figma-golden-extractor.js',
  'utils/__gen-golden.mjs',
  // tech-stack 风格抽取：有立项实施报告（docs/component-generation/tech-stack-style-implementation-report.md）
  // + 专属 test；唯一消费方 tools/figma/figma-style-extractor.js 同为待接线（不在机制目录故不报）
  'utils/tech-stack-style-extractor.js',
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, acc);
    } else if (/\.(js|mjs|cjs|ts)$/.test(name) && !/\.(spec|test|d)\.ts$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

function resolveSpec(fromFile, spec) {
  if (!spec || (!spec.startsWith('.') && !spec.startsWith('/'))) return null; // 只跟踪相对导入
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    join(base, 'index.js'),
    join(base, 'index.mjs'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

function extractSpecs(source) {
  const specs = new Set();
  // ① 静态 import（含多行/别名）+ re-export
  const staticRe = /(?:^|[\s;}])(?:import|export)\s+(?:[\s\S]*?from\s+)?["']([^"']+)["']/g;
  // ② 动态 import('...') / require('...')
  const dynRe = /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*(?:,\s*)?\)/g;
  for (const re of [staticRe, dynRe]) {
    let m;
    while ((m = re.exec(source))) specs.add(m[1]);
  }
  return [...specs];
}

function main() {
  const allFiles = walk(SRC_ROOT);
  const fileSet = new Set(allFiles);

  // 种子（视为「外部世界可达」的真实启动点）：
  //  ① ai-engine 之外的全部 src 文件（NestJS services/controllers/lite/phase2/ai-engine-v2 等）
  //  ② ai-engine/roles/*-engineer.js（管线主角色）
  //  ③ ai-engine/graphs/**（LangGraph 图定义）
  // 机制文件只有「连外部世界 + 角色 + 图都够不到」时才算死接线。
  const seeds = allFiles.filter((f) => {
    const rel = relative(SRC_ROOT, f);
    if (!rel.startsWith('ai-engine/')) return true;
    if (/(^|\/)roles\/[\w-]*engineer\.js$/.test(rel)) return true;
    if (rel.startsWith('ai-engine/graphs/')) return true;
    return false;
  });

  // BFS
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const cur = queue.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    let source = '';
    try {
      source = readFileSync(cur, 'utf8');
    } catch {
      continue;
    }
    for (const spec of extractSpecs(source)) {
      const resolved = resolveSpec(cur, spec);
      if (resolved && fileSet.has(resolved) && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  // 机制文件可达性判定（仅 ai-engine 机制目录）
  const unreachable = allFiles
    .filter((f) => {
      const rel = relative(AI_ENGINE_ROOT, f);
      if (rel.startsWith('..')) return false; // 不在 ai-engine 下
      if (!MECHANISM_DIRS.some((d) => rel.startsWith(`${d}/`))) return false;
      if (EXEMPT.has(rel)) return false;
      return !visited.has(f);
    })
    .map((f) => relative(AI_ENGINE_ROOT, f))
    .sort();

  const totalMechanism = allFiles.filter((f) => {
    const rel = relative(AI_ENGINE_ROOT, f);
    return !rel.startsWith('..') && MECHANISM_DIRS.some((d) => rel.startsWith(`${d}/`));
  }).length;

  console.log(`[mechanism-reachability-audit] 种子 ${seeds.length} 个（外部 src 全量 + engineer + graphs）`);
  console.log(`[mechanism-reachability-audit] 可达文件 ${visited.size} / 全部 ${allFiles.length}`);
  console.log(
    `[mechanism-reachability-audit] 机制文件（${MECHANISM_DIRS.join('/')}）不可达：${unreachable.length} / ${totalMechanism}`,
  );
  if (unreachable.length > 0) {
    for (const rel of unreachable) console.log(`  ✗ ${rel}`);
    console.log(
      '\n处置原则：确认死包装 → 删除；确认应接线 → 补消费方；临时豁免 → EXEMPT 写明理由。',
    );
  } else {
    console.log('  ✅ 无死接线机制文件');
  }

  if (STRICT && unreachable.length > 0) process.exit(1);
}

main();
