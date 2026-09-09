#!/usr/bin/env node
/**
 * 诊断脚本：候选快照 revision 序列「文件数回退 / 产物丢失」取证。
 *
 * ## 用途
 * 排查「生成过程中一会儿一小部分、之前的不见了」——定位是哪个 revision 丢了哪些文件、
 * 丢的时间间隔是多少。
 *
 * ## ⚠️ 最重要的一条：必须按 mtime 排序
 * revision 目录名是 **UUID**（形如 `r-a201c890-6ea0-406a-9dbb-274184843b0f`），
 * **字母序 ≠ 时间序**。曾经用字母序统计得出「29/31 个任务有回退、文件数在 8~18 之间
 * 反复横跳」的**错误结论**；改用 mtime 后真实数字是 13/31，且丢失集中在 0.1~1.2s 的
 * 并行 worker 交错窗口。用错排序会得出完全相反的判断——务必用 mtime。
 *
 * ## 用法
 *   node scripts/diagnose-snapshot-regression.mjs              # 扫全部 session，列 Top N
 *   node scripts/diagnose-snapshot-regression.mjs <sessionId>  # 单任务逐 revision 明细
 *
 * 只读，不修改任何文件。
 */
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(
  __dirname,
  '../..',
  'temp-components/.task-code-snapshots',
);

const CODE_EXT = /\.(vue|less|js|json|css)$/;

function collect(dir) {
  const out = [];
  const walk = (d, rel) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, r);
      else if (CODE_EXT.test(e.name)) out.push(r);
    }
  };
  walk(dir, '');
  return out.sort();
}

function loadSession(session) {
  const revRoot = join(ROOT, session, 'revisions');
  let revs;
  try {
    revs = readdirSync(revRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }
  if (revs.length < 2) return null;

  const items = revs
    .map((r) => {
      const full = join(revRoot, r);
      return { rev: r, t: statSync(full).mtimeMs, files: collect(full) };
    })
    .sort((a, b) => a.t - b.t); // ⚠️ 必须按 mtime，不能用 rev 名字母序

  const regressions = [];
  for (let i = 1; i < items.length; i += 1) {
    const cur = new Set(items[i].files);
    const lost = items[i - 1].files.filter((f) => !cur.has(f));
    if (lost.length > 0) {
      regressions.push({
        i,
        from: items[i - 1].rev.slice(2, 10),
        to: items[i].rev.slice(2, 10),
        fromN: items[i - 1].files.length,
        toN: items[i].files.length,
        lost,
        gapSec: (items[i].t - items[i - 1].t) / 1000,
      });
    }
  }
  return { session, items, regressions };
}

const only = process.argv[2];

if (only) {
  const a = loadSession(only);
  if (!a) {
    console.error(`未找到 session 或 revision 不足 2 个: ${only}`);
    process.exit(1);
  }
  console.log(`session: ${only}  revisions: ${a.items.length}`);
  console.log(`回退次数: ${a.regressions.length}\n`);
  console.log('时间轴（mtime 序）：');
  for (const it of a.items) {
    console.log(
      `  ${new Date(it.t).toISOString().slice(11, 23)}  ${String(it.files.length).padStart(3)}  ${it.rev.slice(2, 10)}`,
    );
  }
  if (a.regressions.length) {
    console.log('\n回退明细：');
    for (const r of a.regressions) {
      console.log(
        `  ❌ ${r.from}(${r.fromN}) → ${r.to}(${r.toN})  +${r.gapSec.toFixed(1)}s  丢失(${r.lost.length}): ${r.lost.join(', ')}`,
      );
    }
  }
  process.exit(0);
}

let sessions;
try {
  sessions = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
} catch {
  console.error(`快照根目录不存在: ${ROOT}`);
  process.exit(1);
}

const rows = [];
for (const s of sessions) {
  const a = loadSession(s);
  if (!a) continue;
  rows.push({
    s,
    revs: a.items.length,
    counts: a.items.map((i) => i.files.length).join(','),
    regressions: a.regressions,
  });
}

const withReg = rows.filter((r) => r.regressions.length > 0);
console.log(`按 mtime 真实时序统计：有回退的任务 ${withReg.length}/${rows.length}\n`);

withReg.sort((a, b) => b.regressions.length - a.regressions.length);
for (const r of withReg.slice(0, 10)) {
  console.log(`=== ${r.s}  revs=${r.revs}  回退=${r.regressions.length}`);
  console.log(`    counts: ${r.counts}`);
  for (const g of r.regressions.slice(0, 5)) {
    console.log(
      `    ❌ ${g.from}(${g.fromN}) → ${g.to}(${g.toN})  +${g.gapSec.toFixed(1)}s  丢失: ${g.lost.join(', ')}`,
    );
  }
  console.log('');
}

// 归因汇总：按「丢失间隔」分桶，区分并行交错 vs 跨重试轮
const buckets = { 'sub-second(并行交错)': 0, '1-60s(同轮)': 0, '>60s(跨重试轮)': 0 };
let totalLost = 0;
for (const r of withReg) {
  for (const g of r.regressions) {
    totalLost += g.lost.length;
    if (g.gapSec < 1) buckets['sub-second(并行交错)'] += 1;
    else if (g.gapSec <= 60) buckets['1-60s(同轮)'] += 1;
    else buckets['>60s(跨重试轮)'] += 1;
  }
}
console.log('=== 回退事件归因（按间隔） ===');
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k}: ${v}`);
console.log(`  累计丢失文件数: ${totalLost}`);
