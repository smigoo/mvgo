#!/usr/bin/env node
/**
 * 组件命名存量清理计划（naming-cleanup-plan）
 *
 * 用途：S4 存量的「删除/回收」前置取证与执行工具。
 *       默认 = 只算不动（dry-run），输出分桶摘要并落一份 manifest JSON。
 *       `--apply` = 把分桶内的目录**移入回收区**（不是 rm，可回滚）。
 *
 * 分桶规则（按「删除后会不会丢产物」判定）：
 *   A 安全  —— 该目录是任务号名，且**同尾缀存在规范 c-* 目录**（跨根聚合）→ 删掉不丢东西
 *   B 风险  —— 该目录是任务号名，但**没有任何规范副本** → 删掉后该组件将无法解析
 *
 * 另外单列：4a「declare.componentId 被污染成任务号」的目录，区分两种：
 *   4a-enc —— 目录本身也是任务号名（随 A/B 一起回收，问题自然消失）
 *   4a-can —— 目录名是规范 c-* 但 declare 被污染（**不能删**，应由 S3 写入时归一）
 *
 * 用法：
 *   cd backend-node
 *   node scripts/naming-cleanup-plan.mjs                  # dry-run + 写 manifest
 *   node scripts/naming-cleanup-plan.mjs --json           # 只输出 JSON 到 stdout
 *   node scripts/naming-cleanup-plan.mjs --apply          # 执行回收（A+B 全部）
 *   node scripts/naming-cleanup-plan.mjs --apply --only-safe   # 只回收 A 组
 *
 * 生产：FRONTEND_WORKSPACE=/home/mvbt/mvgo/frontend/workspace node .../scripts/naming-cleanup-plan.mjs
 *
 * ⚠️ 本脚本只读时绝对不写；`--apply` 只做 rename 到回收区，从不 rm。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.dirname(backendRoot);

const argv = process.argv.slice(2);
const JSON_ONLY = argv.includes('--json');
const APPLY = argv.includes('--apply');
const ONLY_SAFE = argv.includes('--only-safe');
const APPLY_RETIRED_ROOTS = argv.includes('--include-retired-roots');

const frontendWorkspaceRoot =
  process.env.FRONTEND_WORKSPACE?.trim() || path.join(projectRoot, 'frontend', 'workspace');

/**
 * 活跃搜索根（🆕 S5 之后的 componentSearchRoots() == 前 4 项，且 backend 侧置顶）。
 * 只有 component 族参与（page / api-module / other 不在此清理范围）。
 */
const ROOTS = [
  { key: 'be/ws/custom', dir: path.join(backendRoot, 'workspace', 'custom-components'), twoLevel: false },
  { key: 'be/ws/vue3', dir: path.join(backendRoot, 'workspace', 'vue3-components'), twoLevel: true },
  { key: 'fe/custom', dir: path.join(frontendWorkspaceRoot, 'custom-components'), twoLevel: false },
  { key: 'fe/vue3', dir: path.join(frontendWorkspaceRoot, 'vue3-components'), twoLevel: true },
];

/**
 * 🆕 S5 已退役的根：projectRoot/workspace —— 不再被 componentSearchRoots() 扫描。
 * 内容应整体回收（其内容 100% 是任务号名脏数据）。
 */
const RETIRED_ROOTS = [
  { key: 'RETIRED-root-ws/custom', dir: path.join(projectRoot, 'workspace', 'custom-components'), twoLevel: false },
  { key: 'RETIRED-root-ws/vue3', dir: path.join(projectRoot, 'workspace', 'vue3-components'), twoLevel: true },
];

/** 与 naming-audit.mjs 完全一致的编码型判定（保证两边口径可比，基线 813） */
const ENCODED_RE = /^(mc|mv)-[a-z-]*(\d{13})-[0-9a-f]{4,}$/i;
const CANONICAL_RE = /^c-[a-z]/;
const TAIL_RE = /-([0-9a-f]{8})$/;

const readDirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  } catch {
    return [];
  }
};

// ---------- 采集 ----------
const scanRoots = APPLY_RETIRED_ROOTS || argv.includes('--scan-retired') ? [...ROOTS, ...RETIRED_ROOTS] : [...ROOTS];
const entries = [];
for (const root of scanRoots) {
  for (const entry of readDirs(root.dir)) {
    if (!root.twoLevel) {
      entries.push({ rootKey: root.key, rootDir: root.dir, name: entry.name, abs: path.join(root.dir, entry.name), retired: root.key.startsWith('RETIRED-') });
      continue;
    }
    for (const sub of readDirs(path.join(root.dir, entry.name))) {
      entries.push({
        rootKey: root.key,
        rootDir: root.dir,
        name: sub.name,
        abs: path.join(root.dir, entry.name, sub.name),
        group: entry.name,
        retired: root.key.startsWith('RETIRED-'),
      });
    }
  }
}

const declaredIdOf = (abs) => {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(abs, 'declare.json'), 'utf8'));
    return typeof d.componentId === 'string' ? d.componentId.trim() : '';
  } catch {
    return '';
  }
};

for (const e of entries) {
  e.encoded = ENCODED_RE.test(e.name);
  e.canonical = CANONICAL_RE.test(e.name);
  const m = e.name.match(TAIL_RE);
  e.tail = m ? m[1] : null;
  e.declaredId = declaredIdOf(e.abs);
}

// ---------- 分桶 ----------
/** tail → 该尾缀的规范目录数 */
const canonicalByTail = new Map();
for (const e of entries) {
  if (!e.tail || !e.canonical) continue;
  canonicalByTail.set(e.tail, (canonicalByTail.get(e.tail) || 0) + 1);
}

const bucketA = []; // 任务号名 + 有规范副本 → 删除安全
const bucketB = []; // 任务号名 + 无规范副本 → 删除会丢产物
const polluted4aEnc = []; // declare 污染 且 目录名也是任务号（随 A/B 回收）
const polluted4aCan = []; // declare 污染 且 目录名是规范 c-*（**不可删**）
const polluted4aOther = []; // declare 污染、目录名既非任务号也非规范 c-*（需人工看）
const noTail = []; // 任务号名但取不到尾 8hex（异常，单独看）
/** 发布器 quality-staging 临时目录（崩溃残留，属瞬态垃圾，可无条件回收） */
const STAGING_RE = /\.quality-staging-\d+-\d+-[0-9a-f]+$/i;
const staging = [];

for (const e of entries) {
  if (STAGING_RE.test(e.name)) {
    staging.push(e);
    continue;
  }
  if (!e.encoded) {
    if (e.declaredId && ENCODED_RE.test(e.declaredId)) {
      if (e.canonical) polluted4aCan.push(e);
      else polluted4aOther.push(e);
    }
    continue;
  }
  if (!e.tail) {
    noTail.push(e);
  } else if (canonicalByTail.has(e.tail)) {
    bucketA.push(e);
  } else {
    bucketB.push(e);
  }
  if (e.declaredId && ENCODED_RE.test(e.declaredId)) polluted4aEnc.push(e);
}

const byRoot = (arr) => {
  const m = {};
  for (const e of arr) m[e.rootKey] = (m[e.rootKey] || 0) + 1;
  return m;
};

const summary = {
  at: new Date().toISOString(),
  projectRoot,
  frontendWorkspaceRoot,
  totals: {
    scannedDirs: entries.length,
    encoded: bucketA.length + bucketB.length + noTail.length,
    A_safe: bucketA.length,
    B_risky: bucketB.length,
    noTail: noTail.length,
    staging: staging.length,
    polluted4aEnc: polluted4aEnc.length,
    polluted4aCan: polluted4aCan.length,
    polluted4aOther: polluted4aOther.length,
  },
  byRoot: {
    A_safe: byRoot(bucketA),
    B_risky: byRoot(bucketB),
    polluted4aCan: byRoot(polluted4aCan),
  },
};

if (JSON_ONLY) {
  console.log(JSON.stringify({ summary, bucketA, bucketB, noTail, staging, polluted4aEnc, polluted4aCan, polluted4aOther }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s ?? '').padEnd(n);
console.log('\n=== 组件命名存量清理计划（dry-run） ===');
console.log(`projectRoot       = ${projectRoot}`);
console.log(`frontendWorkspace = ${frontendWorkspaceRoot}`);
console.log(`扫描目录总数      = ${summary.totals.scannedDirs}`);
console.log(`任务号形态目录    = ${summary.totals.encoded}`);

console.log('\n--- A 安全组（任务号名 + 存在规范副本）---');
console.log(`  合计 ${bucketA.length}`);
for (const [k, v] of Object.entries(summary.byRoot.A_safe)) console.log(`    ${pad(k, 18)} ${v}`);

console.log('\n--- B 风险组（任务号名 + 无任何规范副本）---');
console.log(`  合计 ${bucketB.length}  ← 回收后该组件将无法解析，需确认`);
for (const [k, v] of Object.entries(summary.byRoot.B_risky)) console.log(`    ${pad(k, 18)} ${v}`);

console.log('\n--- 4a declare 被污染 ---');
console.log(`  4a-enc 目录名也是任务号（随回收消失）: ${polluted4aEnc.length}`);
console.log(`  4a-can 目录名是规范 c-*（**不可删**，应由 S3 写入时归一）: ${polluted4aCan.length}`);
console.log(`  4a-other 目录名既非任务号也非规范（需人工看）: ${polluted4aOther.length}`);
for (const e of polluted4aOther.slice(0, 5)) console.log(`    ${pad(e.name, 46)} ${e.rootKey}  declare=${e.declaredId}`);
for (const [k, v] of Object.entries(summary.byRoot.polluted4aCan)) console.log(`    ${pad(k, 18)} ${v}`);
if (polluted4aCan.length) {
  console.log('  样例:');
  for (const e of polluted4aCan.slice(0, 5)) console.log(`    ${pad(e.name, 46)} ${e.rootKey}  declare=${e.declaredId}`);
}

console.log(`\n--- 发布器 quality-staging 残留（瞬态，可无条件回收）: ${staging.length} ---`);
for (const e of staging.slice(0, 6)) console.log(`    ${pad(e.name, 64)} ${e.rootKey}`);
if (noTail.length) console.log(`\n--- 无尾 8hex 的任务号目录（异常，需人工看）: ${noTail.length} ---`);

// ---------- 落 manifest ----------
const manifestDir = path.join(backendRoot, 'data');
fs.mkdirSync(manifestDir, { recursive: true });
const stamp = new Date();
const p = (n) => String(n).padStart(2, '0');
const ts = `${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}-${p(stamp.getHours())}${p(stamp.getMinutes())}${p(stamp.getSeconds())}`;
const manifestPath = path.join(manifestDir, `naming-cleanup-manifest-${ts}.json`);
fs.writeFileSync(manifestPath, JSON.stringify({ summary, bucketA, bucketB, noTail, staging, polluted4aEnc, polluted4aCan, polluted4aOther }, null, 2), 'utf8');
console.log(`\nmanifest 已写入: ${manifestPath}`);

// ---------- 执行回收 ----------
if (!APPLY) {
  console.log('\n（dry-run，未改动任何文件。加 --apply 执行「移入回收区」）\n');
  process.exit(0);
}

const targets = ONLY_SAFE ? [...bucketA] : [...bucketA, ...bucketB, ...noTail, ...staging];
const recycleRoot = path.join(projectRoot, `_naming-cleanup-backup-${ts}`);
console.log(`\n=== 开始回收（不是 rm，可回滚）→ ${recycleRoot} ===`);

let moved = 0;
const failures = [];
for (const e of targets) {
  const dest = path.join(recycleRoot, e.rootKey, e.group ? path.join(e.group, e.name) : e.name);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(e.abs, dest);
    moved += 1;
  } catch (err) {
    try {
      fs.cpSync(e.abs, dest, { recursive: true });
      fs.rmSync(e.abs, { recursive: true, force: true });
      moved += 1;
    } catch (err2) {
      failures.push({ abs: e.abs, error: err2.message });
    }
  }
}
console.log(`已回收 ${moved}/${targets.length} 个目录`);
if (failures.length) {
  console.log(`失败 ${failures.length} 个:`);
  for (const f of failures.slice(0, 10)) console.log(`  ${f.abs} → ${f.error}`);
}
console.log(`回收区: ${recycleRoot}`);
console.log('回滚：把回收区里的目录按原 rootKey 移回即可。\n');
