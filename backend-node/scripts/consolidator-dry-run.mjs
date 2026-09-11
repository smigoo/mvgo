#!/usr/bin/env node
/**
 * @file consolidator-dry-run.mjs — 🛡️ P1.2 验收工具（2026-09-11）
 *
 * 对存量组件跑「类样式收敛」的新实现，输出**与当前 common.less 的差异摘要**，
 * 用于量化 P1.2 的影响面（哪些组件的收敛结果会变、变成什么），不写盘。
 *
 * 用法：
 *   node scripts/consolidator-dry-run.mjs            # 最近 20 个组件
 *   node scripts/consolidator-dry-run.mjs --all      # 全部组件
 *   node scripts/consolidator-dry-run.mjs <dir>      # 单个组件目录
 *   node scripts/consolidator-dry-run.mjs --verbose  # 打印逐条 diff 摘要
 *
 * 退出码恒为 0（信息性工具）。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consolidateSubComponentClasses } from '../src/ai-engine/utils/style-class-consolidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');
const WORKSPACE = join(BACKEND_ROOT, 'workspace');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ALL = args.includes('--all');
const explicit = args.find((a) => !a.startsWith('--'));

function collectComponentFiles(dir) {
  const out = {};
  const walk = (d, base) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, base);
      else if (/\.(vue|less|js)$/.test(name)) {
        try {
          out[relative(base, p).split('\\').join('/')] = readFileSync(p, 'utf8');
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(dir, dir);
  return out;
}

function summarizeDiff(before, after) {
  const b = new Set(before.split('\n').map((l) => l.trim()).filter(Boolean));
  const a = new Set(after.split('\n').map((l) => l.trim()).filter(Boolean));
  const added = [...a].filter((l) => !b.has(l));
  const removed = [...b].filter((l) => !a.has(l));
  return { added, removed };
}

function listTargets() {
  const roots = [join(WORKSPACE, 'custom-components'), join(WORKSPACE, 'temp-components')];
  const dirs = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      const p = join(root, name);
      try {
        if (statSync(p).isDirectory()) dirs.push({ p, mtime: statSync(p).mtimeMs });
      } catch {
        /* skip */
      }
    }
  }
  dirs.sort((x, y) => y.mtime - x.mtime);
  return dirs.map((d) => d.p);
}

function main() {
  const targets = explicit ? [resolve(explicit)] : ALL ? listTargets() : listTargets().slice(0, 20);
  const logger = { warn: () => {}, info: () => {}, log: () => {} };
  let changed = 0;
  let scanned = 0;
  const changedNames = [];

  for (const dir of targets) {
    const files = collectComponentFiles(dir);
    if (!files['resources/styles/common.less']) continue;
    scanned++;
    const out = consolidateSubComponentClasses(files, { logger });
    const before = files['resources/styles/common.less'];
    const after = out['resources/styles/common.less'];
    if (before === after) continue;
    changed++;
    const { added, removed } = summarizeDiff(before, after);
    changedNames.push(relative(WORKSPACE, dir));
    console.log(`\n▶ ${relative(BACKEND_ROOT, dir)}  +${added.length} / -${removed.length} 行`);
    if (VERBOSE) {
      for (const l of added.slice(0, 6)) console.log(`   + ${l.slice(0, 120)}`);
      for (const l of removed.slice(0, 6)) console.log(`   - ${l.slice(0, 120)}`);
    }
  }

  console.log(`\n[consolidator-dry-run] 扫描 ${scanned} 个组件，收敛结果将变化 ${changed} 个`);
  if (!VERBOSE && changed > 0) {
    console.log('  变化组件（前 15）：');
    for (const n of changedNames.slice(0, 15)) console.log('   ✗ ' + n);
    console.log('  （加 --verbose 查看逐条 diff）');
  }
}

main();
