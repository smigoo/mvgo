#!/usr/bin/env node
/**
 * LOOP-VERIFY 回放采集器（v1 · 2026-11-08）
 *
 * 职责：对一组目标组件发起 reuseCache:true 的确定性回放（POST /api/phase2/generate），
 * 轮询终态，采集结构化指标（meta / reject-summary / 覆盖度行 / 终态 / 回放有效性），
 * 输出 JSONL 供 baseline 与 after 同口径比较。
 *
 * 零硬编码约束（见 docs/2026-11-08-修复验证loop与自动回滚流程.md §6）：
 *   - 组件清单全部来自 CLI --config，脚本内不写任何任务 id / 组件名 / fileKey；
 *   - 容差/超时为命名常量并注明来源；
 *   - 判分读「落盘事实 + tasks API 结构字段」，与被修复代码的判据不同源（改验分离）；
 *   - 采集器异常 fail-loud（退出码非 0），绝不默认通过。
 *
 * 用法：
 *   node scripts/loop-verify/replay.mjs --config '{"targets":[{label,fileKey,nodeId,componentName}]}'
 *   node scripts/loop-verify/replay.mjs --config @path/to/config.json
 * 输出：每 target 一行 JSON（stdout），同时写 --out 指定文件（默认 loop-replay-<ts>.jsonl）
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

// ── 命名常量（来源注释，禁止散落） ─────────────────────────────
const POLL_INTERVAL_MS = 15_000; // 轮询间隔：任务生成分钟级，15s 足够细且不压服务
const POLL_TIMEOUT_MS = 900_000; // 单任务超时 15min：既往 max 任务（含 2 轮 L0-B）~14min
const TASKS_LIMIT = 20;          // 轮询窗口：新任务排在列表头部，20 覆盖并发 2 + 抽样批
const TERMINAL = new Set(['completed', 'failed', 'error', 'cancelled']);
const REPLAY_HIT_LOG = '续跑命中全局缓存';   // phase2.service S3 命中（sendSseLog，实测不进 progress 数组）
const REPLAY_HIT_GRAPH_LOG = '视觉分析缓存命中'; // graph 侧铁证（mc-component-graph-phase2:1055，落 server.log）
const REPLAY_MISS_LOG = '续跑未命中缓存';    // miss ⇒ 回落全新生成（vision 随机性回归）
const COVERAGE_LOG = '子组件覆盖度';          // microcode-engineer 覆盖度计数行
const SERVER_LOG_TAIL_BYTES = 2 * 1024 * 1024; // 读 server.log 尾部窗口：单任务日志量 << 2MB

// ── CLI 解析 ─────────────────────────────────────────────────
function parseArgs() {
  const out = { config: null, outFile: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--config') out.config = argv[i + 1];
    else if (argv[i] === '--out') out.outFile = argv[i + 1];
  }
  if (!out.config) {
    console.error('用法: replay.mjs --config <json 或 @file> [--out <file>]');
    exit(2);
  }
  let raw = out.config;
  if (raw.startsWith('@')) raw = readFileSync(raw.slice(1), 'utf-8');
  const cfg = JSON.parse(raw);
  if (!Array.isArray(cfg.targets) || cfg.targets.length === 0) {
    console.error('config.targets 必须为非空数组');
    exit(2);
  }
  for (const t of cfg.targets) {
    if (!t.fileKey || !t.nodeId) {
      console.error(`target 缺 fileKey/nodeId: ${JSON.stringify(t)}`);
      exit(2);
    }
  }
  return {
    base: cfg.base || 'http://localhost:13030',
    token: cfg.token || 'dev',
    groupId: cfg.groupId || '',
    serverLog: cfg.serverLog || null, // graph 缓存铁证来源（server.log 绝对路径，配置传入不硬编码）
    reuseCache: cfg.reuseCache !== false, // 默认 true：确定性回放（分支 A）；显式 false 才全新
    targets: cfg.targets,
    outFile: out.outFile || `loop-replay-${Date.now()}.jsonl`,
  };
}

// ── HTTP 帮助 ────────────────────────────────────────────────
async function api(cfg, path, init) {
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', token: cfg.token, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

async function findTask(cfg, sessionId) {
  const j = await api(cfg, `/api/tasks?limit=${TASKS_LIMIT}`);
  const tasks = j?.data?.tasks;
  if (!Array.isArray(tasks)) return null;
  return tasks.find((t) => t?.sessionId === sessionId) || null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 指标采集（全部落盘事实 / 结构字段） ───────────────────────
function readJsonSafe(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null; } catch { return null; }
}

function extractFromProgress(task) {
  const events = Array.isArray(task?.progress) ? task.progress : [];
  const logs = events.filter((e) => e?.type === 'log');
  const replayHit = events.some((e) => String(e?.message || '').includes(REPLAY_HIT_LOG));
  const replayMiss = events.some((e) => String(e?.message || '').includes(REPLAY_MISS_LOG));
  const coverage = [];
  for (const e of logs) {
    if (String(e?.message || '').includes(COVERAGE_LOG) && e?.meta) {
      const m = typeof e.meta === 'string' ? tryJson(e.meta) : e.meta;
      if (m && typeof m === 'object') coverage.push(m);
    }
  }
  const sseError = events.filter((e) => e?.type === 'error' || e?.level === 'error')
    .map((e) => String(e?.message || '').slice(0, 200)).slice(0, 5);
  return { replayHit, replayMiss, coverageLast: coverage[coverage.length - 1] || null, sseError };
}

function tryJson(s) { try { return JSON.parse(s); } catch { return null; } }

// graph 侧 R6b 计数行：`🎯 headerSlots 缓存补跑(ensureHeaderSlots) {json}`（落 server.log）。
// 🔴 2026-11-09 修订：R6/R6b 的计数行此前走 graph logger，既不在 task.progress 也不被本
// 采集器读取 ⇒ 判据不可验签（after-r6b.jsonl 两行 coverage:null 即证据缺失）。现从
// server.log 串行窗口提取最后一条，暴露 derived/sectionArray/total/sectionsIn/hadField
// 与补跑失败标记（error 级）——只读落盘事实，与修复代码判据不同源。
const HEADER_SLOTS_LOG = 'headerSlots 缓存补跑';
const HEADER_SLOTS_FAIL_LOG = 'headerSlots 缓存补跑失败';

function graphCounterSince(serverLogPath, sinceIso, needle) {
  if (!serverLogPath || !existsSync(serverLogPath)) return null;
  try {
    const fd = readFileSync(serverLogPath, 'utf-8');
    const tail = fd.slice(Math.max(0, fd.length - SERVER_LOG_TAIL_BYTES));
    const since = new Date(sinceIso).getTime();
    let last = null;
    for (const line of tail.split('\n')) {
      if (!line.includes(needle)) continue;
      const tm = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+Z)\]/);
      if (tm && new Date(tm[1]).getTime() < since) continue;
      last = line;
    }
    if (!last) return null;
    const jm = last.match(/\{[\s\S]*\}\s*$/);
    return jm ? tryJson(jm[0]) : { raw: last.slice(0, 200) };
  } catch {
    return null;
  }
}

// graph 侧缓存命中铁证：server.log 中「视觉分析缓存命中」行的时间戳 ≥ 本发 startedAt。
// 采集器串行执行（单发在途），时间窗即可归因到本发，无需按 sessionId 关联。
function graphCacheHitSince(serverLogPath, sinceIso) {
  if (!serverLogPath || !existsSync(serverLogPath)) return false;
  try {
    const stat = { size: readFileSync(serverLogPath).length };
    const start = Math.max(0, stat.size - SERVER_LOG_TAIL_BYTES);
    const fd = readFileSync(serverLogPath, 'utf-8'); // 全量读后截尾（文件 <10MB 可接受）
    const lines = fd.slice(start).split('\n');
    const since = new Date(sinceIso).getTime();
    for (const line of lines) {
      if (!line.includes(REPLAY_HIT_GRAPH_LOG)) continue;
      const m = line.match(/\[(\d{4}-\d{2}-\d{2}T[^\]]+Z)\]/);
      if (m && new Date(m[1]).getTime() >= since) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function collectMetrics(outputPath) {
  const meta = readJsonSafe(`${outputPath}/component-meta.json`);
  const rejectSummary = readJsonSafe(`${outputPath}/.checkpoint/reject-summary.json`);
  const takeover = rejectSummary?.takeover || null;
  return {
    artifactIncomplete: meta?.artifactIncomplete ?? null,
    degradedFiles: meta?.degradedFiles ?? null,
    degradedReason: meta?.reason ?? null,
    runtimeVerified: meta?.runtimeVerified ?? null,
    gateSkippedFiles: meta?.gateSkippedFiles ?? null,
    emptySections: meta?.emptySections ?? null,
    missingEntryFiles: meta?.missingEntryFiles ?? null,
    failOpenEvents: Array.isArray(meta?.failOpenEvents) ? meta.failOpenEvents.length : null,
    takeover: takeover ? {
      evaluated: takeover.evaluated ?? null,
      chartOwned: takeover.chartOwned ?? null,
      chartOwnedIds: takeover.chartOwnedIds ?? null,
      hits: takeover.hits ?? null,
      statRowHits: takeover.statRowHits ?? null,
      statRowSuppressed: takeover.statRowSuppressed ?? null,
    } : null,
    indexVueExists: existsSync(`${outputPath}/package/index.vue`),
  };
}

// ── 单目标回放 ───────────────────────────────────────────────
async function replayOne(cfg, target) {
  const startedAt = new Date().toISOString();
  const body = {
    fileKey: target.fileKey,
    nodeId: target.nodeId,
    componentName: target.componentName || '',
    groupId: cfg.groupId || undefined,
    target: 'microcode',
    reuseCache: cfg.reuseCache, // 🔴 显式传递：DTO 默认 falsy = 全新生成（实测坑）
  };
  const start = await api(cfg, '/api/phase2/generate', { method: 'POST', body: JSON.stringify(body) });
  const sessionId = start?.data?.sessionId;
  if (!sessionId) throw new Error(`generate 未返回 sessionId: ${JSON.stringify(start).slice(0, 200)}`);

  let task = null;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    task = await findTask(cfg, sessionId);
    if (task && TERMINAL.has(String(task.status))) break;
  }
  if (!task) throw new Error(`轮询窗口内未见任务: ${sessionId}`);
  if (!TERMINAL.has(String(task.status))) {
    return { label: target.label, sessionId, startedAt, verdict: 'timeout', status: task.status, timeoutMs: POLL_TIMEOUT_MS };
  }

  const prog = extractFromProgress(task);
  const metrics = task.outputPath ? collectMetrics(task.outputPath) : null;
  if (metrics) {
    metrics.headerSlots = graphCounterSince(cfg.serverLog, startedAt, HEADER_SLOTS_LOG);
    metrics.headerSlotsFailed = !!graphCounterSince(cfg.serverLog, startedAt, HEADER_SLOTS_FAIL_LOG);
  }
  // 回放有效性断言（文档 §3）：progress 断言 OR graph 侧 server.log 铁证（串行窗口归因）。
  const graphHit = graphCacheHitSince(cfg.serverLog, startedAt);
  const replayValid = cfg.reuseCache ? (prog.replayHit || graphHit) : true;
  return {
    label: target.label,
    sessionId,
    startedAt,
    finishedAt: new Date().toISOString(),
    verdict: replayValid ? (task.status === 'completed' ? 'ok' : 'task-failed') : 'replay-invalid',
    status: task.status,
    outputPath: task.outputPath || null,
    error: String(task.error || '').slice(0, 300) || null,
    progress: prog.sseError,
    coverage: prog.coverageLast,
    replayHit: prog.replayHit || graphHit,
    replayMiss: prog.replayMiss,
    metrics,
  };
}

// ── 主流程：串行重放（并发上限 2/用户，采集器单发防超限） ──────
const cfg = parseArgs();
const lines = [];
for (const target of cfg.targets) {
  process.stderr.write(`▶ 回放 ${target.label || target.nodeId} …\n`);
  let rec;
  try {
    rec = await replayOne(cfg, target);
  } catch (e) {
    // fail-loud：采集器异常 ⇒ 该样本 verdict=collector-error，绝不默认通过
    rec = { label: target.label, verdict: 'collector-error', error: String(e?.message || e).slice(0, 300) };
  }
  const line = JSON.stringify(rec);
  lines.push(line);
  console.log(line);
}
writeFileSync(cfg.outFile, lines.join('\n') + '\n', 'utf-8');
process.stderr.write(`✅ 采集完成 → ${cfg.outFile}\n`);
const bad = lines.filter((l) => JSON.parse(l).verdict !== 'ok' && JSON.parse(l).verdict !== 'task-failed');
exit(bad.length > 0 ? 1 : 0);
