#!/usr/bin/env node
/**
 * mvgo 轻量组件生成 · 全组合自动化测试
 * 
 * 遍历 12 种有效组合（单组件 × 6 + 批量 × 6），自动执行、校验、输出报告。
 * 
 * 用法：
 *   node scripts/test-combinations.js [--skip-batch] [--skip-single] [--timeout 600]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'test');
const OUTPUT_DIR = path.join(ROOT, 'test-output');

// ─── 配置 ───────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://localhost:13030/api';
const DEFAULT_TIMEOUT = parseInt(process.env.TIMEOUT || '600', 10); // 秒

// 截图 base64
function imgToBase64(file) {
  const p = path.join(TEST_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`截图不存在: ${p}`);
  const buf = fs.readFileSync(p);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// Figma 链接
const FIGMA_URLS = [
  'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/%E8%BF%90%E8%A1%8C%E7%9B%91%E6%B5%8B?node-id=2-7879',
  'https://www.figma.com/design/1t7Dmmpsl5i0PC8BJt2QLf/%E8%BF%90%E8%A1%8C%E7%9B%91%E6%B5%8B?node-id=2-8417',
  'https://www.figma.com/design/My711tWcrpjOZlFBmz5y1B/%E6%99%BA%E6%85%A7%E5%85%BB%E6%8A%A4%E4%B8%BB%E9%A1%B5-%E6%96%BD%E5%B7%A5%E8%AF%A6%E6%83%85-%E6%95%B0%E6%99%BA%E9%A9%BE%E9%A9%B6%E8%88%B1-%E8%8A%82%E8%83%BD%E9%99%8D%E7%A2%B3?node-id=1-98934',
];

// 截图输入
const SCREENSHOTS = [
  { file: '弹窗2.png',    b64: null, label: '弹窗-运单信息' },
  { file: 'cp-环境监测.png', b64: null, label: '环境监测图' },
  { file: 'cp-设备监测.png', b64: null, label: '设备监测图' },
];

// 预加载截图
SCREENSHOTS.forEach(s => { s.b64 = imgToBase64(s.file); });

// ─── 组合定义 ───────────────────────────────────────────────────────

/**
 * 单组件测试组合
 * 
 * 说明：截图来源时 system 强制 Lite，所以：
 *   - 截图 + Vue3 + Lite  ✅ 有效
 *   - 截图 + Vue3 + Max   ⚠️ 会被降级为 Lite，记录但标记
 *   - 截图 + 微码 + Lite  ✅ 有效
 *   - 截图 + 微码 + Max   ⚠️ 同上
 *   - Figma + Vue3 + Lite ✅
 *   - Figma + Vue3 + Max  ✅
 *   - Figma + 微码 + Lite ✅
 *   - Figma + 微码 + Max  ✅
 */
const SINGLE_COMBOS = [
  // ─ 截图组 ──
  {
    id: 's1',
    label: '截图 + Vue3 + Lite',
    source: 'screenshot',
    componentType: 'vue3',
    generationTier: 'lite',
    buildBody: () => ({
      imageBase64: SCREENSHOTS[0].b64,
      componentName: `test-popup-${Date.now()}`,
    }),
    validate: (dir) => validateVue3Output(dir),
  },
  {
    id: 's2',
    label: '截图 + 微码 + Lite',
    source: 'screenshot',
    componentType: 'microcode',
    generationTier: 'lite',
    buildBody: () => ({
      imageBase64: SCREENSHOTS[1].b64,
      componentName: `test-env-${Date.now()}`,
    }),
    validate: (dir) => validateMicrocodeOutput(dir),
  },
  {
    id: 's3',
    label: '截图 + 微码 + Max(降级)',
    source: 'screenshot',
    componentType: 'microcode',
    generationTier: 'max',
    expectDowngrade: true,
    buildBody: () => ({
      imageBase64: SCREENSHOTS[2].b64,
      componentName: `test-device-${Date.now()}`,
    }),
    validate: (dir) => validateMicrocodeOutput(dir),
  },
  // ── Figma 组 ──
  {
    id: 'f1',
    label: 'Figma + Vue3 + Lite',
    source: 'figma',
    componentType: 'vue3',
    generationTier: 'lite',
    figmaUrl: FIGMA_URLS[0],
    buildBody: () => ({
      figmaUrl: FIGMA_URLS[0],
      componentName: `test-figma-v3-lite-${Date.now()}`,
    }),
    validate: (dir) => validateVue3Output(dir),
  },
  {
    id: 'f2',
    label: 'Figma + Vue3 + Max',
    source: 'figma',
    componentType: 'vue3',
    generationTier: 'max',
    figmaUrl: FIGMA_URLS[1],
    buildBody: () => ({
      figmaUrl: FIGMA_URLS[1],
      componentName: `test-figma-v3-max-${Date.now()}`,
    }),
    validate: (dir) => validateVue3Output(dir),
  },
  {
    id: 'f3',
    label: 'Figma + 微码 + Max',
    source: 'figma',
    componentType: 'microcode',
    generationTier: 'max',
    figmaUrl: FIGMA_URLS[2],
    buildBody: () => ({
      figmaUrl: FIGMA_URLS[2],
      componentName: `test-figma-mc-max-${Date.now()}`,
    }),
    validate: (dir) => validateMicrocodeOutput(dir),
  },
];

// ─── 工具函数 ───────────────────────────────────────────────────────

function fetchJSON(url, opts) {
  // 使用 node 内置 fetch（Node ≥ 18）
  return fetch(url, opts).then(r => r.json());
}

function log(msg, type = 'info') {
  const colors = { info: '\x1b[36m', ok: '\x1b[32m', warn: '\x1b[33m', err: '\x1b[31m', dim: '\x1b[90m' };
  const reset = '\x1b[0m';
  const prefix = { info: 'ℹ', ok: '✓', warn: '⚠', err: '✗', dim: '·' };
  console.log(`${colors[type]}${prefix[type]} ${msg}${reset}`);
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── 校验逻辑 ───────────────────────────────────────────────────────

const WORKSPACE_VUE3 = path.join(ROOT, 'frontend/workspace/vue3-components/default-group');
const WORKSPACE_MC = path.join(ROOT, 'frontend/workspace/custom-components');

function validateVue3Output(sessionId) {
  const dir = path.join(WORKSPACE_VUE3, sessionId, 'package');
  const indexPath = path.join(dir, 'index.vue');
  if (!fs.existsSync(indexPath)) return { ok: false, reason: `缺少 ${indexPath}` };
  const content = fs.readFileSync(indexPath, 'utf-8');
  if (content.length < 50) return { ok: false, reason: '文件内容过短（可能为空壳）' };
  if (!content.includes('<template>') && !content.includes('<script'))
    return { ok: false, reason: '缺少 <template> 或 <script>' };
  return { ok: true, size: content.length, path: indexPath };
}

function validateMicrocodeOutput(sessionId) {
  const dir = path.join(WORKSPACE_MC, sessionId);
  // 微码目录结构：{sessionId}/package/index.vue 或 {sessionId}/*.vue
  const candidates = [
    path.join(dir, 'package', 'index.vue'),
    path.join(dir, 'index.vue'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      if (content.length > 50) return { ok: true, size: content.length, path: p };
    }
  }
  return { ok: false, reason: `微码目录 ${dir} 下未找到有效 index.vue` };
}

// ── 单组件测试流程 ─────────────────────────────────────────────────

async function runSingleCombo(combo, timeoutSec) {
  const body = combo.buildBody();
  body.componentType = combo.componentType;
  if (!combo.expectDowngrade) body.generationTier = combo.generationTier;
  // 截图来源强制 Lite 由后端处理，这里传了也会被覆盖

  const url = `${API_BASE}/lite/generate`;
  const startTime = Date.now();
  let response, sessionId;

  try {
    response = await fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { combo, status: 'error', error: `请求失败: ${e.message}`, elapsed: Date.now() - startTime };
  }

  if (!response.success) {
    return { combo, status: 'failed', error: response.error || response.message || '未知错误', elapsed: Date.now() - startTime };
  }

  sessionId = response.sessionId || response.data?.sessionId;
  if (!sessionId) {
    return { combo, status: 'error', error: '响应缺少 sessionId', response, elapsed: Date.now() - startTime };
  }

  log(`  已提交 sessionId=${sessionId}`, 'dim');

  // 轮询任务状态
  const pollUrl = `${API_BASE}/tasks/${sessionId}`;
  let taskStatus = null;
  let pollCount = 0;
  const maxPolls = timeoutSec * 2; // 每 0.5s 轮询一次

  while (pollCount < maxPolls) {
    await wait(500);
    pollCount++;
    try {
      const task = await fetchJSON(pollUrl);
      taskStatus = task.status || task.data?.status;
      if (taskStatus === 'completed' || taskStatus === 'failed' || taskStatus === 'cancelled') {
        break;
      }
      if (pollCount % 10 === 0) {
        log(`  等待中... ${pollCount * 0.5}s (status=${taskStatus})`, 'dim');
      }
    } catch (e) {
      // ignore poll errors
    }
  }

  const elapsed = Date.now() - startTime;

  if (taskStatus !== 'completed') {
    return { combo, status: 'timeout', sessionId, taskStatus, elapsed };
  }

  // 验证产物
  const result = combo.validate(sessionId);
  return {
    combo,
    status: result.ok ? 'success' : 'verify_failed',
    sessionId,
    elapsed,
    validate: result,
  };
}

// ─── 批量测试流程 ───────────────────────────────────────────────────

async function runBatchTest(combo, timeoutSec) {
  const body = combo.buildBody();
  const batchBody = {
    items: [{
      ...body,
      componentType: combo.componentType,
      generationTier: combo.expectDowngrade ? undefined : combo.generationTier,
    }],
    groupId: 'default-group',
  };

  const url = `${API_BASE}/lite/batch/generate`;
  const startTime = Date.now();
  let response;

  try {
    response = await fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchBody),
    });
  } catch (e) {
    return { combo, status: 'error', error: `请求失败: ${e.message}`, elapsed: Date.now() - startTime };
  }

  if (!response.success) {
    return { combo, status: 'failed', error: response.error || response.message || '未知错误', elapsed: Date.now() - startTime };
  }

  const batchId = response.batchId || response.data?.batchId;
  if (!batchId) {
    return { combo, status: 'error', error: '响应缺少 batchId', response, elapsed: Date.now() - startTime };
  }

  log(`  批量已创建 batchId=${batchId}`, 'dim');

  // 轮询批量状态
  const pollUrl = `${API_BASE}/lite/batch/${batchId}`;
  let batchStatus = null;
  let pollCount = 0;
  const maxPolls = timeoutSec * 2;

  while (pollCount < maxPolls) {
    await wait(500);
    pollCount++;
    try {
      const data = await fetchJSON(pollUrl);
      batchStatus = data.status || data.data?.status;
      const items = data.items || data.data?.items || [];
      const completed = items.filter(i => i.status === 'completed').length;
      const total = items.length;
      if (pollCount % 10 === 0) {
        log(`  批量进度: ${completed}/${total} (status=${batchStatus})`, 'dim');
      }
      if (batchStatus === 'completed' || batchStatus === 'failed' || batchStatus === 'cancelled') {
        break;
      }
    } catch (e) { /* ignore */ }
  }

  const elapsed = Date.now() - startTime;

  if (batchStatus !== 'completed') {
    return { combo, status: 'timeout', batchId, batchStatus, elapsed };
  }

  // 获取子任务 sessionId 并验证
  const detail = await fetchJSON(pollUrl);
  const items = detail.items || detail.data?.items || [];
  const results = items.map(item => {
    const r = combo.validate(item.sessionId);
    return { sessionId: item.sessionId, ...r };
  });

  const allOk = results.every(r => r.ok);
  return {
    combo,
    status: allOk ? 'success' : 'verify_failed',
    batchId,
    elapsed,
    validate: results,
  };
}

// ─── 主流程 ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipBatch = args.includes('--skip-batch');
  const skipSingle = args.includes('--skip-single');
  const timeout = parseInt(args.find(a => a.startsWith('--timeout'))?.split('=')[1] || DEFAULT_TIMEOUT, 10);

  log(`mvgo 组件生成 · 全组合测试`, 'info');
  log(`API: ${API_BASE}`, 'dim');
  log(`超时: ${timeout}s/组合`, 'dim');
  log(`截图: ${SCREENSHOTS.length} 张, Figma: ${FIGMA_URLS.length} 个`, 'dim');
  log(``, 'dim');

  // 检查后端是否可用
  try {
    const probe = await fetchJSON(`${API_BASE}/lite/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    log(`后端可用 (statusCode=${probe.statusCode})`, 'ok');
  } catch (e) {
    log(`后端不可用: ${e.message}`, 'err');
    log(`请确认: cd backend-node && npm run start:dev`, 'warn');
    process.exit(1);
  }

  log(``, 'dim');

  const results = [];
  const startedAt = Date.now();

  // ── 单组件测试 ─
  if (!skipSingle) {
    log(`═══ 单组件测试 (${SINGLE_COMBOS.length} 组) ═══`, 'info');
    for (const combo of SINGLE_COMBOS) {
      log(`\n[${combo.id}] ${combo.label}`, 'info');
      const r = await runSingleCombo(combo, timeout);
      results.push(r);

      const icon = r.status === 'success' ? '✓' : r.status === 'timeout' ? '⏱' : r.status === 'verify_failed' ? '⚠' : '✗';
      const color = r.status === 'success' ? 'ok' : r.status === 'timeout' ? 'warn' : 'err';
      const detail = r.status === 'success'
        ? `${r.validate.size}B @ ${r.validate.path}`
        : r.error || r.taskStatus || r.reason || '';
      log(`  ${icon} ${r.status} (${Math.round(r.elapsed / 1000)}s) ${detail}`, color);
    }
  }

  // ─ 批量测试 ──
  if (!skipBatch) {
    log(`\n═══ 批量测试 (${SINGLE_COMBOS.length} 组) ═══`, 'info');
    for (const combo of SINGLE_COMBOS) {
      log(`\n[batch-${combo.id}] ${combo.label}`, 'info');
      const r = await runBatchTest(combo, timeout);
      results.push({ ...r, isBatch: true });

      const icon = r.status === 'success' ? '✓' : r.status === 'timeout' ? '⏱' : r.status === 'verify_failed' ? '⚠' : '✗';
      const color = r.status === 'success' ? 'ok' : r.status === 'timeout' ? 'warn' : 'err';
      const detail = r.validate
        ? (Array.isArray(r.validate) ? r.validate.map(v => `${v.sessionId}:${v.ok ? 'OK' : v.reason}`).join(', ') : r.validate.path)
        : r.error || r.batchStatus || '';
      log(`  ${icon} ${r.status} (${Math.round(r.elapsed / 1000)}s) ${detail}`, color);
    }
  }

  // ── 生成报告 ──
  const totalElapsed = Math.round((Date.now() - startedAt) / 1000);
  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status !== 'success').length;

  log(`\n═══ 测试报告 ═══`, 'info');
  log(`总计: ${results.length} 组 | 成功: ${successCount} | 失败/超时: ${failCount} | 耗时: ${totalElapsed}s`, successCount === results.length ? 'ok' : 'warn');

  // 写 Markdown 报告
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, `test-report-${Date.now()}.md`);
  const reportLines = [
    `# mvgo 组件生成 · 全组合测试报告`,
    ``,
    `**时间**: ${new Date().toISOString()}`,
    `**API**: ${API_BASE}`,
    `**总耗时**: ${totalElapsed}s`,
    ``,
    `## 结果总览`,
    ``,
    `| # | 模式 | 组合 | 状态 | 耗时 | 详情 |`,
    `|---|------|------|------|------|------|`,
  ];

  results.forEach((r, i) => {
    const mode = r.isBatch ? '批量' : '单个';
    const statusIcon = r.status === 'success' ? '✅' : r.status === 'timeout' ? '⏱' : r.status === 'verify_failed' ? '' : '❌';
    const detail = r.error || r.taskStatus || r.batchStatus || (r.validate ? (Array.isArray(r.validate) ? r.validate.map(v => `${v.sessionId}: ${v.ok ? 'OK' : v.reason}`).join('; ') : r.validate.path) : '');
    reportLines.push(`| ${i + 1} | ${mode} | ${r.combo.label} | ${statusIcon} ${r.status} | ${Math.round(r.elapsed / 1000)}s | ${detail} |`);
  });

  reportLines.push(``, `## 统计`, ``, `- 成功: ${successCount}/${results.length}`, `- 失败/超时: ${failCount}/${results.length}`);

  // 失败项分析
  const failures = results.filter(r => r.status !== 'success');
  if (failures.length > 0) {
    reportLines.push(``, `## 失败项分析`, ``);
    failures.forEach(r => {
      reportLines.push(`### ${r.isBatch ? '[批量]' : '[单组件]'} ${r.combo.label}`);
      reportLines.push(`- 状态: ${r.status}`);
      if (r.error) reportLines.push(`- 错误: ${r.error}`);
      if (r.taskStatus) reportLines.push(`- 任务状态: ${r.taskStatus}`);
      if (r.batchStatus) reportLines.push(`- 批量状态: ${r.batchStatus}`);
      if (r.sessionId) reportLines.push(`- SessionId: ${r.sessionId}`);
      if (r.batchId) reportLines.push(`- BatchId: ${r.batchId}`);
      reportLines.push(``);
    });
  }

  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  log(`\n报告已保存: ${reportPath}`, 'ok');
}

main().catch(e => {
  log(`脚本异常: ${e.message}`, 'err');
  process.exit(1);
});
