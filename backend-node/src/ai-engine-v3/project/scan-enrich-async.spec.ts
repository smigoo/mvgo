import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 扫描同步路径「文本 LLM 功能增强异步化」门禁·判据单测（2026-11-06）
 *
 * 事故：`opts.vision` 门控（dad4ef2）修掉了 puppeteer + 视觉 LLM 后，登录态 scan 仍 57.22s。
 *   日志铁证（唯一变量 = 有没有配文本模型，同目录同 5 页）：
 *     匿名   00:39:15 `[scan] 视觉覆盖增强` → 00:39:16 `[scan] 视觉接口定位`（1s）
 *     登录态 00:39:21 `[scan] 视觉覆盖增强` → 00:40:18 `[scan] 视觉接口定位`（57s 零日志）
 *   空档里只有 `buildFeatureDetails` 的 `if (cfg) await this.enrichFeaturesWithLLM(...)`：
 *   `callChatJson` 单次 fetch + AbortController 60s 超时 + 1 次重试 ⇒ 最坏 ~120s。
 *   它是**第二个独立维度**，与视觉门控互不相干，所以上一轮修复覆盖不到。
 *
 * 治本：确定性结果先落盘秒回，文本 LLM 增强转后台任务（完成后回写 feature-details.json，
 *   状态写 run.json.featureEnrich，前端轮询补齐）；`enrich:'sync'` 只作显式逃生舱。
 *
 * 沿用本仓既有「源码断言」写法（该 service 依赖重，jest CJS 下不便 import；
 * 先例见 scan-vision-gate.spec.ts / style-class-consolidator.paren-gate.spec.ts）。
 */

const SERVICE_SRC = readFileSync(join(__dirname, 'project-pipeline.service.ts'), 'utf-8');
const DTO_SRC = readFileSync(join(__dirname, 'api/dto/project-pipeline.dto.ts'), 'utf-8');
const CONTROLLER_SRC = readFileSync(join(__dirname, 'api/project-pipeline.controller.ts'), 'utf-8');

/** 取某个方法体（从 `private xxx(` 起，到下一个同缩进的 `  }` 止） */
function methodBody(src: string, name: string): string {
  const at = src.indexOf(`${name}(`);
  expect(at).toBeGreaterThan(-1);
  const end = src.indexOf('\n  }\n', at);
  expect(end).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe('扫描同步路径·文本 LLM 功能增强异步化（57s → 秒回）', () => {
  it('① 同步 LLM 块必须由 enrich==="sync" 显式门控（默认不跑）', () => {
    expect(SERVICE_SRC).toMatch(/const enrichNow = opts\?\.enrich === 'sync';/);
    // 正对照：门控真的被用在 if 条件里
    expect(SERVICE_SRC).toMatch(/if \(cfg && enrichNow\) \{/);
    // 反向断言：禁止再出现「配了文本模型就在同步路径里调 LLM」的旧写法
    expect(SERVICE_SRC).not.toMatch(/\/\/ LLM 增强（可选、可降级）\s*\n\s*if \(cfg\) \{/);
  });

  it('② scan() 启动后台增强，且**不 await**（否则又变成同步阻塞）', () => {
    expect(SERVICE_SRC).toMatch(/const featureEnrich = this\.startFeatureEnrichment\(/);
    expect(SERVICE_SRC).not.toMatch(/await this\.startFeatureEnrichment\(/);
    // 后台任务本体也必须是 void（fire-and-forget），并自带 catch 兜底
    expect(SERVICE_SRC).toMatch(/void this\.runFeatureEnrichment\([^)]*\)\.catch\(/);
  });

  it('③ scan 响应里的 featureEnrich 必须覆盖在 `...view` 之后（否则读到启动前的旧状态）', () => {
    const body = methodBody(SERVICE_SRC, 'async scan');
    const atView = body.indexOf('...view,');
    const atEnrich = body.indexOf('      featureEnrich,');
    expect(atView).toBeGreaterThan(-1);
    expect(atEnrich).toBeGreaterThan(atView);
  });

  it('④ GET /runs/:runId 只**读**状态，绝不因此触发后台任务', () => {
    expect(SERVICE_SRC).toMatch(/featureEnrich: this\.deriveFeatureEnrichStatus\(dir\),/);
    const body = methodBody(SERVICE_SRC, 'private deriveFeatureEnrichStatus');
    expect(body).not.toContain('startFeatureEnrichment');
    expect(body).not.toContain('runFeatureEnrichment');
  });

  it('⑤ 同步逃生舱与异步后台共用同一份合并逻辑（判据单一来源）', () => {
    // 两处调用：buildFeatureDetails（sync）+ runFeatureEnrichment（async）
    expect(SERVICE_SRC.match(/this\.applyEnrichment\(details, enriched, epList\);/g) || []).toHaveLength(2);
    // 反向断言：LLM 合并字段不许在两处各写一遍（旧的内联 for 循环形态必须消失）
    expect(SERVICE_SRC).not.toMatch(/if \(e\.relatedPagePaths\) \{\s*\n\s*d\.relatedPages = e\.relatedPagePaths/);
  });

  it('⑥ 后台任务必须写终态（done / failed / skipped），失败不得静默', () => {
    expect(SERVICE_SRC).toMatch(/status: 'done'/);
    expect(SERVICE_SRC).toMatch(/status: 'failed'/);
    expect(SERVICE_SRC).toMatch(/status: 'skipped'/);
    // failed 必须带 error 字段（前端要能说明「已用确定性结果」）
    expect(SERVICE_SRC).toMatch(/status: 'failed',[\s\S]{0,400}error: String\(err\?\.message/);
  });

  it('⑦ running 状态必须有过期判定（服务重启把状态钉死时前端能停轮询）', () => {
    expect(SERVICE_SRC).toMatch(/const ENRICH_STALE_MS = 15 \* 60_000;/);
    expect(SERVICE_SRC).toMatch(/status: 'stale'/);
    const body = methodBody(SERVICE_SRC, 'private deriveFeatureEnrichStatus');
    expect(body).toContain('ENRICH_STALE_MS');
  });

  it('⑧ 同一 runId 只允许一个后台任务在飞（重复 scan 不叠加 LLM 调用）', () => {
    expect(SERVICE_SRC).toMatch(/private readonly enrichInflight = new Set<string>\(\);/);
    expect(SERVICE_SRC).toMatch(/if \(this\.enrichInflight\.has\(runId\)\)/);
    // 必须有回收，否则异常路径会把 runId 永久占住
    expect(
      (SERVICE_SRC.match(/this\.enrichInflight\.delete\(runId\)/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('⑨ 增强改了 relatedPages 后必须重算截图与覆盖（否则新页面没有图）', () => {
    const body = methodBody(SERVICE_SRC, 'private async runFeatureEnrichment');
    expect(body).toContain('prevPages');
    expect(body).toContain('this.planShotPaths(');
    // 视觉比对结论更可信，不得被确定性基线覆盖回去
    expect(body).toMatch(/d\.coverage\?\.byVision !== true/);
    // 建议接口变了要重跑 L1 定位
    expect(body).toContain('this.attachEndpointLocations(');
  });

  it('⑩ DTO 提供 enrich?: "defer"|"sync" 逃生舱，控制器默认 defer', () => {
    expect(DTO_SRC).toMatch(/enrich\?: 'defer' \| 'sync';/);
    expect(DTO_SRC).toMatch(/@IsIn\(\['defer', 'sync'\]\)/);
    expect(CONTROLLER_SRC).toMatch(/enrich: dto\.enrich === 'sync' \? 'sync' : 'defer',/);
  });

  it('⑪ 真机计数行 `[scan] 功能增强` 无条件打（0 也要打，区分「未走链路」与「走了没结果」）', () => {
    expect(SERVICE_SRC).toContain('[scan] 功能增强 ');
    // 该日志必须在 if 之外（无条件），否则 mode:defer 时看不见
    const body = methodBody(SERVICE_SRC, 'private async buildFeatureDetails');
    const atLog = body.indexOf('[scan] 功能增强 ');
    const atIf = body.indexOf('if (cfg && enrichNow) {');
    expect(atLog).toBeGreaterThan(-1);
    expect(atIf).toBeGreaterThan(atLog);
  });
});
