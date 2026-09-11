#!/usr/bin/env node
/**
 * @file r1-3-acceptance.mjs — 🛡️ P1.6 验收脚本（2026-09-11）
 *
 * 把方案里的「验收条目」变成**可执行载体**（此前只写在文档里 → 两次漏执行）。
 * 覆盖：
 *   A) P1.3 验收「产物是否还有非标准方言」：模板 is-active/active 计数（新产物应 = 0）
 *   B) P1.6 类名契约：C1/C2/C3（error）与 C4（warn）逐组件统计
 *   C) P1.4 不变量 I7：与契约同源，单列便于对账
 *   D) P1.1 一致性代理指标：样式选择器短类 → DOM 命中率（facts vs 各链推导结果一致性）
 *
 * 用法：
 *   node scripts/r1-3-acceptance.mjs                 # 最近 20 个组件
 *   node scripts/r1-3-acceptance.mjs --all           # 全部
 *   node scripts/r1-3-acceptance.mjs <dir>           # 单组件（含新产物验收）
 *   node scripts/r1-3-acceptance.mjs --all --strict  # 有 error 时退出码 1（供 CI/自检）
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectClassFacts, resolveDomClass, splitModifier, isAliasModifierToken } from '../src/ai-engine/utils/class-facts.js';
import { checkClassNameContract } from '../src/ai-engine/utils/classname-contract.js';
import { buildResourceFacts, checkResourceContract } from '../src/ai-engine/utils/resource-facts.js';
import { checkSkeletonCompleteness } from '../src/ai-engine/utils/mc-skeleton.js';
import { runArtifactInvariants } from '../src/ai-engine/utils/artifact-invariants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '..');
const WORKSPACE = join(BACKEND_ROOT, 'workspace');
const TEXT_EXT = /\.(vue|less|css|json|js|ts)$/;

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const ALL = args.includes('--all');
const explicit = args.find((a) => !a.startsWith('--'));

function collectFiles(dir) {
  const out = {};
  const walk = (d, base) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p, base);
      else if (TEXT_EXT.test(name)) {
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
  dirs.sort((a, b) => b.mtime - a.mtime);
  return dirs.map((d) => d.p);
}

/** D) 一致性代理：scoped 样式里的短类选择器能否被 facts 解析到 DOM 形态 */
function domHitRate(files, facts) {
  let total = 0;
  let hit = 0;
  for (const [p, c] of Object.entries(files)) {
    if (!/package\/components\/.*\.vue$/.test(p)) continue;
    const fact = facts.byFile?.[p];
    if (!fact) continue;
    const styleBlocks = c.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
    for (const sb of styleBlocks) {
      for (const line of sb.split('\n')) {
        const t = line.trim();
        if (!t.includes('{')) continue;
        for (const m of t.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          const cls = m[1];
          if (!/^c-/.test(cls)) continue;
          total++;
          const r = resolveDomClass(fact, cls);
          if (r && r.variants && r.variants.length > 0) hit++;
        }
      }
    }
  }
  return { total, hit, rate: total ? Math.round((hit / total) * 100) : 100 };
}

/** A) 方言计数 */
function dialectCount(files) {
  let n = 0;
  const samples = [];
  for (const [p, c] of Object.entries(files)) {
    if (!/\.vue$/i.test(p)) continue;
    for (const m of c.matchAll(/['"\s](is-active|is-on|active)['"\s]/g)) {
      n++;
      if (samples.length < 3) samples.push(`${p}:${m[1]}`);
    }
  }
  return { n, samples };
}

function auditOne(dir) {
  const files = collectFiles(dir);
  if (!files['package/index.vue']) return null;
  const facts = collectClassFacts(files);
  const name = relative(WORKSPACE, dir);
  const contract = checkClassNameContract(files, facts);
  const inv = runArtifactInvariants(files, { classFacts: facts });
  const i7 = inv.violations.filter((v) => v.id === 'I7');
  const dialect = dialectCount(files);
  const hitRate = domHitRate(files, facts);
  // 🛡️ P1.7 资源契约：用该组件的资源映射（若有）判定 R1/R2
  let r1 = 0;
  let r2 = 0;
  try {
    const mp = join(dir, '.mc-gen/resource-dom-mapping.json');
    if (existsSync(mp)) {
      const mapping = JSON.parse(readFileSync(mp, 'utf8'));
      const rv = checkResourceContract(files, buildResourceFacts({ mapping, files }));
      r1 = rv.filter((v) => v.code === 'R1').length;
      r2 = rv.filter((v) => v.code === 'R2').length;
    }
  } catch {
    /* 映射缺失/不可解析 → 跳过资源契约统计 */
  }
  // 🛡️ P1.8 骨架完整性（M2/M3/M4 必要文件 + index.less 引用）
  const skeleton = checkSkeletonCompleteness(files);
  return { name, contract, i7, dialect, hitRate, r1, r2, skeleton };
}

function main() {
  const targets = explicit ? [resolve(explicit)] : ALL ? listTargets() : listTargets().slice(0, 20);
  const rows = [];
  for (const dir of targets) {
    const r = auditOne(dir);
    if (r) rows.push(r);
  }

  let totalErrC1 = 0;
  let totalErrC2 = 0;
  let totalErrC3 = 0;
  let totalWarnC4 = 0;
  let totalDialect = 0;
  let totalR1 = 0;
  let totalSkeleton = 0;
  let skeletonBroken = [];
  let totalR2 = 0;
  let totalI7err = 0;
  console.log('\n组件'.padEnd(44) + 'C1 C2 C3  C4  I7e  方言  DOM%  R1 R2');
  console.log('-'.repeat(90));
  for (const r of rows) {
    const e1 = r.contract.filter((v) => v.code === 'C1').length;
    const e2 = r.contract.filter((v) => v.code === 'C2').length;
    const e3 = r.contract.filter((v) => v.code === 'C3').length;
    const w4 = r.contract.filter((v) => v.code === 'C4').length;
    const i7e = r.i7.filter((v) => v.severity === 'error').length;
    totalErrC1 += e1;
    totalErrC2 += e2;
    totalErrC3 += e3;
    totalWarnC4 += w4;
    totalDialect += r.dialect.n;
    totalI7err += i7e;
    totalR1 += r.r1;
    totalR2 += r.r2;
    totalSkeleton += r.skeleton.length;
    if (r.skeleton.length > 0) skeletonBroken.push(`${r.name}（${[...new Set(r.skeleton.map((x) => x.code))].join('/')}）`);
    const flag = e1 + e2 + e3 + i7e > 0 ? '✗' : '✓';
    console.log(
      `${flag} ${r.name.slice(0, 42).padEnd(42)} ${String(e1).padStart(2)} ${String(e2).padStart(2)} ${String(e3).padStart(2)}  ${String(w4).padStart(2)} ${String(i7e).padStart(3)}  ${String(r.dialect.n).padStart(4)} ${String(r.hitRate.rate).padStart(4)}% ${String(r.r1).padStart(2)} ${String(r.r2).padStart(2)}`,
    );
    if (flag === '✗' && (e1 || e2 || e3)) {
      const v = r.contract.find((x) => x.severity === 'error');
      if (v) console.log(`    ↳ [${v.code}] ${v.message.slice(0, 120)}`);
    }
    if (r.dialect.n > 0) console.log(`    ↳ 方言样本: ${r.dialect.samples.join(', ')}`);
  }
  const scanned = rows.length;
  console.log('\n' + '='.repeat(90));
  console.log(`扫描组件 ${scanned} 个`);
  console.log(`契约 error：C1 方言 ${totalErrC1} / C2 基类形态 ${totalErrC2} / C3 无样式规则 ${totalErrC3}`);
  console.log(`契约 warn：C4 死修饰符规则 ${totalWarnC4}`);
  console.log(`I7 error 合计 ${totalI7err}；模板方言 token 合计 ${totalDialect}`);
  console.log(`资源契约：R1 注入漏项 ${totalR1} / R2 幽灵引用 ${totalR2}`);
  console.log(`骨架完整性：缺失 ${totalSkeleton} 项${skeletonBroken.length ? ' → ' + skeletonBroken.slice(0, 6).join('、') : ''}`);
  console.log('判据：新生成组件应满足 C1=C2=C3=0、方言=0、R1=R2=0（存量违规不阻塞，但应逐批收敛）');

  if (STRICT && totalErrC1 + totalErrC2 + totalErrC3 + totalI7err > 0) process.exitCode = 1;
}

main();
