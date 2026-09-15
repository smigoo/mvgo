#!/usr/bin/env node
/**
 * @file check-terminal-writes.mjs — 🛡️ P0-1 终态收口门禁（2026-09-15）
 *
 * 「Task 终态写入单点收口」的守卫。
 *
 * 背景：进入 completed / failed / cancelled 的 **Task** 赋值此前散落在 tasks.service.ts 的
 * 11 处，任何新增统计口径（指标宽表、质量报表）都会漏记且**静默无感**——漏一处就少一类
 * 数据，且没有任何报错。收口后 Task 终态只由 TasksService 的两个方法写出：
 *   - finalizeTask(task, status, opts)   正向：进入终态
 *   - unfinalizeTask(task)               反向：撤回人工审核，还原出终态
 *
 * 判据（任一不满足 → 退出码 1，可直接挂 CI）：
 *   1. src/ 下**除白名单外**不得出现字面量终态赋值 `.status = 'completed' | 'failed' | 'cancelled'`
 *      （Task 终态由 finalizeTask 的形参传入，本就不需要字面量）
 *   2. tasks.service.ts 必须同时存在 finalizeTask 与 unfinalizeTask
 *   3. finalizeTask 的调用次数 >= MIN_CALLS（防止新增终态路径却绕开收口）
 *
 * 白名单登记的是「操作**非 Task** 对象、拥有独立 status 枚举」的文件。它们不在 P0-1 收口
 * 范围内，但登记后仍会被统计命中数——若某天这些 status 也要进指标口径，需单独治理。
 *
 * 用法：node scripts/check-terminal-writes.mjs [--json]
 * 退出码：违规 → 1
 *
 * 详见 docs/product/pipeline-monitoring/prd.md §5.4
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');
const TASKS_SERVICE = join(SRC, 'tasks', 'tasks.service.ts');

const TERMINAL = ['completed', 'failed', 'cancelled'];
const LITERAL_RE = new RegExp(`\\.status\\s*=\\s*'(?:${TERMINAL.join('|')})'`);

/** 收口前 tasks.service.ts 有 10 处字面量正向终态赋值；低于此数说明有路径被绕开。 */
const MIN_CALLS = 8;

/**
 * 白名单：操作**非 Task** 对象、拥有独立 status 枚举的文件。
 * 这些 status 与 Task 生命周期相关（按 sessionId 关联），但不是 Task 本身，故不在 P0-1 收口范围。
 */
const ALLOWLIST = {
  'src/lite/batch.service.ts':
    'BatchRecord/BatchItem 独立类型（BatchStatus / BatchItemStatus 枚举），按 sessionId 与 Task 平行记账',
  'src/lite/html-split.service.ts':
    'HtmlSplitComponent 拆分产物状态，独立于 Task',
};

const emitJson = process.argv.includes('--json');

/** 递归收集 .ts 源文件（跳过测试与声明文件） */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 去注释后再匹配：避免「注释里写了示例代码」造成误报。
 * ⚠️ 块注释必须用空白**保留换行**，否则行号会整体偏移、报错定位失效。
 */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const violations = [];
const notes = [];
const allowlistedHits = [];

// ── 判据 1：非白名单文件不得出现字面量终态赋值 ──────────────────
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (LITERAL_RE.test(line)) hits.push({ line: i + 1, text: line.trim() });
  });
  if (hits.length === 0) continue;

  if (ALLOWLIST[rel]) {
    allowlistedHits.push({ file: rel, reason: ALLOWLIST[rel], count: hits.length });
    continue;
  }
  for (const h of hits) {
    violations.push({
      rule: 'literal-terminal-write',
      file: rel,
      line: h.line,
      text: h.text,
    });
  }
}

// ── 判据 2 + 3：收口方法存在且被足量调用 ─────────────────────────
let finalizeCalls = 0;
let unfinalizeCalls = 0;
try {
  const service = stripComments(readFileSync(TASKS_SERVICE, 'utf8'));
  for (const method of ['finalizeTask', 'unfinalizeTask']) {
    if (!new RegExp(`private\\s+${method}\\s*\\(`).test(service)) {
      violations.push({
        rule: 'missing-funnel-method',
        file: 'src/tasks/tasks.service.ts',
        line: 0,
        text: `缺少收口方法 ${method}()`,
      });
    }
  }
  finalizeCalls = (service.match(/this\.finalizeTask\(/g) || []).length;
  unfinalizeCalls = (service.match(/this\.unfinalizeTask\(/g) || []).length;
  if (finalizeCalls < MIN_CALLS) {
    violations.push({
      rule: 'too-few-funnel-calls',
      file: 'src/tasks/tasks.service.ts',
      line: 0,
      text: `finalizeTask 调用仅 ${finalizeCalls} 次（期望 >= ${MIN_CALLS}）：可能有终态路径被绕开`,
    });
  }
  notes.push(`Task 终态收口：finalizeTask 调用 ${finalizeCalls} 次；unfinalizeTask 调用 ${unfinalizeCalls} 次`);
  if (allowlistedHits.length > 0) {
    notes.push(`白名单豁免（非 Task 类型，共 ${allowlistedHits.length} 个文件）：`);
    for (const a of allowlistedHits) {
      notes.push(`   · ${a.file}（命中 ${a.count} 处）— ${a.reason}`);
    }
  }
} catch (err) {
  violations.push({
    rule: 'unreadable',
    file: 'src/tasks/tasks.service.ts',
    line: 0,
    text: `无法读取 tasks.service.ts: ${err.message}`,
  });
}

// ── 输出 ────────────────────────────────────────────────────────
const ok = violations.length === 0;
if (emitJson) {
  console.log(JSON.stringify({ ok, violations, notes, finalizeCalls, unfinalizeCalls, allowlistedHits }, null, 2));
} else {
  console.log('='.repeat(84));
  console.log('🛡️  Task 终态收口门禁（P0-1）');
  console.log('='.repeat(84));
  for (const n of notes) console.log(`   ${n}`);
  console.log('-'.repeat(84));
  if (ok) {
    console.log('✅ Task 终态写入已单点收口：src/ 无字面量终态赋值（白名单除外），收口方法齐备且被足量调用。');
  } else {
    console.log(`❌ 发现 ${violations.length} 处违规：`);
    for (const v of violations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      console.log(`   - [${v.rule}] ${loc}`);
      if (v.text) console.log(`     ${v.text}`);
    }
    console.log('\n修法：Task 终态写入只能经 TasksService#finalizeTask / #unfinalizeTask。');
    console.log('若操作的是非 Task 类型，请在 ALLOWLIST 登记并写明理由。');
    console.log('详见 docs/product/pipeline-monitoring/prd.md §5.4');
  }
  console.log('-'.repeat(84));
}

if (!ok) process.exitCode = 1;
