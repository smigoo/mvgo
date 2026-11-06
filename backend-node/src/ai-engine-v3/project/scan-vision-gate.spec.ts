import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 扫描同步路径「恒不跑视觉」门禁·判据单测（2026-11-06）
 *
 * 事故：POST /api/v3/project/scan 登录态 70.99s vs 匿名 0.40s。实测后端 server.log
 *   `[S0] runId=... exit=1 117ms` —— 扫描器只占 117ms，其余 ~70.8s 全在
 *   buildFeatureDetails()：只要有视觉配置（本机 dev 用户 modelMode:"unified" +
 *   visionModel + visionApiKey 非空 ⇒ visionCfg 恒非 null）就必然启动 puppeteer 截 5 页
 *   **并**串行跑两轮视觉 LLM（每功能点 coverage 比对 + 每接口 UI 定位，最多 16 次）。
 *   且视觉输出是错的：对照 run pj-20261106-002235-455e21（byVision=true，功能点全判 0/4）
 *   vs 确定性基线 run pj-20261106-002130-516258（0.40s，2/4/2/4/2/4/1/4/1/2），
 *   视觉把本来正确的覆盖结论**污染成错误结论**，20 个接口 visionBox 命中 0 条。
 *
 * 治本：同步路径**默认**不跑视觉（opts.vision !== true ⇒ visionCfg=null）；视觉增强
 *   降级为显式逃生舱（请求体 vision:true）+ 总预算硬闸（VISION_SYNC_BUDGET_MS）。
 *
 * 本 spec 用**源码断言**（该 service 依赖重，jest CJS 下不便 import；本仓已有这种先例写法，
 * 见 src/ai-engine/utils/style-class-consolidator.paren-gate.spec.ts），锁定四点：
 *   ① visionCfg 的赋值表达式必须带 `opts?.vision === true` 门；
 *   ② `visionCfg ? captureShots : planShotPaths` 的分支形态仍存在（未被替换成无条件截图）；
 *   ③ ScanProjectDto 含 vision?: boolean 逃生舱字段；
 *   ④ 三个真机计数行（截图策略 / 视觉覆盖增强 / 视觉接口定位）都能在源码里找到。
 */

const SERVICE_SRC = readFileSync(join(__dirname, 'project-pipeline.service.ts'), 'utf-8');
const DTO_SRC = readFileSync(join(__dirname, 'api/dto/project-pipeline.dto.ts'), 'utf-8');
const CONTROLLER_SRC = readFileSync(join(__dirname, 'api/project-pipeline.controller.ts'), 'utf-8');

/* ------------------------------------------------------------------ 桩 ---
 * ⑩/⑫ 是**行为判据**（挂死页 57,956ms 事故），必须真跑 captureShots。
 * 该 service 依赖重，桩法沿用 project-pipeline.service.units.spec.ts 的先例：
 * archiver 是纯 ESM、logger → backend-root 的 import.meta.url 在 CJS 下必炸、Figma/AiConfig 会打网络。
 * puppeteer 必须换成可编程的假浏览器，否则测试真的拉起 Chromium。
 */
jest.mock('../../ai-engine/logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
jest.mock('../../ai-engine/tools/figma/figma-client.js', () => ({ FigmaClient: jest.fn() }));
jest.mock('../../config/config.service', () => ({ AiConfigService: class {} }));
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));
jest.mock('puppeteer', () => ({ launch: jest.fn() }));

describe('扫描同步路径视觉门禁（70.99s → 秒回）', () => {
  it('① visionCfg 必须由 opts?.vision === true 显式门控（默认 null）', () => {
    expect(SERVICE_SRC).toMatch(
      /const visionCfg = opts\?\.vision === true \? await this\.resolveVisionConfigSafe\(userId\) : null;/,
    );
    // 反向断言：禁止再出现「无条件解析视觉配置」的旧写法
    expect(SERVICE_SRC).not.toMatch(/const visionCfg = await this\.resolveVisionConfigSafe\(userId\);/);
  });

  it('② 截图策略仍是 visionCfg 三元的 plan 分支（未被替换成无条件 captureShots）', () => {
    // V5 起 captureShots 多接一个 `{ deadline }` 参数（与覆盖/定位共用同一 wall-clock 闸）
    expect(SERVICE_SRC).toMatch(
      /const shotMap = visionCfg\s*\? await this\.captureShots\(dir, projectRoot, htmlPages, \{ deadline: visionDeadline \}\)\s*: this\.planShotPaths\(projectRoot, htmlPages\);/,
    );
  });

  it('③ ScanProjectDto 提供 vision?: boolean 逃生舱（@IsBoolean）', () => {
    expect(DTO_SRC).toMatch(/vision\?: boolean;/);
    expect(DTO_SRC).toMatch(/@IsBoolean\(\)/);
  });

  it('④ 三条真机计数行都在源码里（0 也要打，区分「未走链路」与「走了没结果」）', () => {
    expect(SERVICE_SRC).toContain('[scan] 截图策略');
    expect(SERVICE_SRC).toContain('[scan] 视觉覆盖增强');
    expect(SERVICE_SRC).toContain('[scan] 视觉接口定位');
  });

  it('⑤ 视觉增强有总预算硬闸 VISION_SYNC_BUDGET_MS', () => {
    expect(SERVICE_SRC).toMatch(/const VISION_SYNC_BUDGET_MS = 45_000;/);
    // 两个视觉块都必须用预算 deadline 并在循环开头做到点检查
    expect((SERVICE_SRC.match(/Date\.now\(\) > visionCovDeadline/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((SERVICE_SRC.match(/Date\.now\(\) > visionLocDeadline/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('⑥ 控制器把 dto.vision === true 透传给 service.scan', () => {
    expect(CONTROLLER_SRC).toMatch(/vision: dto\.vision === true/);
  });

  /**
   * V5（2026-11-06）：预算语义必须是「整块共享 wall-clock」而不是「每块各 45s」。
   * 旧形态违背注释：captureShots 自吃 20s（SHOT_TOTAL_BUDGET_MS），覆盖块在截图之后
   * 另起 45s（visionCovT0 + BUDGET），L2 再起第三个 45s（visionLocT0 + BUDGET）
   * ⇒ vision:true 最坏 20+45+45 ≈ 110s，逃生舱留了 2 倍后门。
   */
  it('⑦ V5：截图 / 覆盖 / 定位三者共用同一 visionDeadline（不是各自另起 45s）', () => {
    // 唯一的截止点来源
    expect(SERVICE_SRC).toMatch(/const visionDeadline = visionT0 \+ VISION_SYNC_BUDGET_MS;/);
    expect((SERVICE_SRC.match(/const visionDeadline = /g) || []).length).toBe(1);
    // 覆盖块与定位块都直接引用它
    expect(SERVICE_SRC).toMatch(/const visionCovDeadline = visionDeadline;/);
    expect(SERVICE_SRC).toMatch(/const visionLocDeadline = visionDeadline;/);
    // 反向断言：旧的「各自另起一个 45s」形态必须清零
    expect(SERVICE_SRC).not.toMatch(/visionCovDeadline = visionCovT0 \+ VISION_SYNC_BUDGET_MS/);
    expect(SERVICE_SRC).not.toMatch(/visionLocDeadline = visionLocT0 \+ VISION_SYNC_BUDGET_MS/);
  });

  it('⑧ V5：captureShots 接受共享 deadline，且 launch 超时也按剩余预算收敛', () => {
    // 签名多一个可选 deadline
    expect(SERVICE_SRC).toMatch(
      /private async captureShots\([\s\S]{0,200}?opts\?: \{ deadline\?: number \},/,
    );
    // 取自身与共享预算的较紧者
    expect(SERVICE_SRC).toMatch(
      /typeof opts\?\.deadline === 'number' \? Math\.min\(ownDeadline, opts\.deadline\) : ownDeadline/,
    );
    // launch 的 15s 上限不得突破共享预算（这是最容易被忽略的一条越界路径）
    expect(SERVICE_SRC).toMatch(
      /timeout: Math\.max\(1000, Math\.min\(SHOT_LAUNCH_TIMEOUT_MS, deadline - Date\.now\(\)\)\),/,
    );
    // 反向断言：不得再出现无 clamps 的裸 launch 超时
    expect(SERVICE_SRC).not.toMatch(/timeout: SHOT_LAUNCH_TIMEOUT_MS,/);
  });

  it('⑨ V5：截图计数行必须报告 elapsedMs 与 budgetLeftMs（证明截图受同一预算约束）', () => {
    expect(SERVICE_SRC).toContain('elapsedMs: shotMs,');
    expect(SERVICE_SRC).toContain('budgetLeftMs: visionCfg ? Math.max(0, visionDeadline - Date.now()) : null,');
  });

  /* ------------------------------------------------------------ 预算硬闸 ---
   * 事故（独立验证，挂死页）：实测 57,956ms = SHOT_TOTAL_BUDGET_MS(20s) 的 2.9 倍。
   * 根因不是「没写超时」，而是三条**写了的超时其实是空操作**：
   *   #1 `page.evaluate()` 不接受 timeout ⇒ 两步各吃满 launch 级 protocolTimeout(16s)，waitForPaint 33,502ms；
   *   #2 puppeteer v25 的 `ScreenshotOptions` **没有** timeout 字段（awk types.d.ts 已核实）⇒ 传了被静默忽略
   *      （微测 timeout:2000 仍 16,003ms）；
   *   #3 「到点 break」只在**进下一页前**判一次 ⇒ 单页 goto→waitForPaint→screenshot 之间可把总闸吃穿。
   * 判据因此必须是「行为」而非「源码里有没有 timeout 字样」——后者正是上一轮假绿的来源。
   */

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let Service: any;
  let pupMock: any;
  let tmpRoot: string;

  const makePage = (impl: {
    goto?: () => Promise<any>;
    waitForFunction?: () => Promise<any>;
    evaluate?: () => Promise<any>;
    screenshot?: () => Promise<any>;
  }) => ({
    setViewport: jest.fn(async () => undefined),
    goto: jest.fn(impl.goto ?? (async () => null)),
    waitForFunction: jest.fn(impl.waitForFunction ?? (async () => true)),
    evaluate: jest.fn(impl.evaluate ?? (async () => true)),
    screenshot: jest.fn(impl.screenshot ?? (async () => undefined)),
  });

  const makeBrowser = (page: any) => ({
    newPage: jest.fn(async () => page),
    close: jest.fn(async () => undefined),
    process: () => null,
  });

  /** 一次性临时 run 目录 + 一个有真实 index.html 的 projectRoot */
  const makeDirs = () => {
    const fsx = require('node:fs');
    const pathx = require('node:path');
    const dir = fsx.mkdtempSync(pathx.join(tmpRoot, 'run-'));
    const root = fsx.mkdtempSync(pathx.join(tmpRoot, 'proj-'));
    fsx.writeFileSync(pathx.join(root, 'index.html'), '<html><body><h1>原型</h1></body></html>');
    return { dir, root };
  };

  beforeAll(() => {
    const fsx = require('node:fs');
    const pathx = require('node:path');
    const osx = require('node:os');
    tmpRoot = fsx.mkdtempSync(pathx.join(fsx.realpathSync(osx.tmpdir()), 'mvgo-shotgate-'));
    // RUNS_ROOT 在 service 模块顶层求值 ⇒ 必须在 require 之前设，避免往仓库 data/ 写脏数据
    process.env.PROJECT_RUNS_ROOT = tmpRoot;
    jest.resetModules();
    Service = require('./project-pipeline.service').ProjectPipelineService;
    pupMock = require('puppeteer');
    const nest = require('@nestjs/common');
    jest.spyOn(nest.Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(nest.Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    try {
      require('node:fs').rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* 清不掉临时目录不影响判据 */
    }
    delete process.env.PROJECT_RUNS_ROOT;
  });

  beforeEach(() => {
    pupMock.launch.mockReset();
  });

  it('⑩（判据⑥）evaluate / screenshot 永不 resolve 时，captureShots 必须在总预算内返回（不许挂死）', async () => {
    const svc = new Service({ getMergedAiConfig: async () => ({}) });
    const budgetMs = 400; // 可注入的短预算：绝不真跑 20s

    // (a) 挂死页原形：evaluate 与 screenshot 都返回永不 settle 的 promise
    //     （真机对应 evaluate 吃满 protocolTimeout 16s ×2 + screenshot 16s ⇒ 57,956ms）
    const hangBoth = makePage({
      evaluate: () => new Promise(() => {}),
      screenshot: () => new Promise(() => {}),
    });
    pupMock.launch.mockResolvedValue(makeBrowser(hangBoth));
    const a = makeDirs();
    const t0 = Date.now();
    const mapA = await svc.captureShots(a.dir, a.root, [{ path: 'index.html' }], {
      deadline: Date.now() + budgetMs,
    });
    const elapsedA = Date.now() - t0;
    expect(elapsedA).toBeLessThan(budgetMs + 900); // 余量给 CI 抖动，但远小于 20s / 58s
    expect(elapsedA).toBeLessThan(5_000); // 绝对红线：绝不允许再出现 16s×3 的量级
    expect(Object.keys(mapA)).toHaveLength(0); // 挂死 ⇒ 拿不到图，正常降级
    expect(hangBoth.evaluate).toHaveBeenCalled(); // 确实进了挂死的那一步（不是提前退化掉的假绿）

    // (b) 只有 screenshot 挂死：证明截图步的护栏来自 withBudget（timeout 选项是空操作）
    const hangShot = makePage({ screenshot: () => new Promise(() => {}) });
    pupMock.launch.mockResolvedValue(makeBrowser(hangShot));
    const b = makeDirs();
    const t1 = Date.now();
    await svc.captureShots(b.dir, b.root, [{ path: 'index.html' }], {
      deadline: Date.now() + budgetMs,
    });
    const elapsedB = Date.now() - t1;
    expect(hangShot.screenshot).toHaveBeenCalled();
    expect(elapsedB).toBeLessThan(budgetMs + 900);
  });

  it('⑪（判据⑦）收口原语全局唯一：withBudget 定义 1 处、调用 ≥3 处、screenshot 不再传裸 timeout', () => {
    expect((SERVICE_SRC.match(/private async withBudget</g) || []).length).toBe(1);
    const calls = SERVICE_SRC.match(/this\.withBudget\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // waitForPaint 两步 + screenshot（+ goto）
    // 三个 label 必须在，便于真机日志定位是哪一步吃的预算
    expect(SERVICE_SRC).toContain("'paint-evaluate#1'");
    expect(SERVICE_SRC).toContain("'paint-evaluate#2'");
    expect(SERVICE_SRC).toContain("'screenshot'");
    // 反向断言：page.screenshot 参数里不得再出现 timeout（v25 无该字段 ⇒ 空操作，留着等于误导）
    expect(SERVICE_SRC).not.toMatch(/\.screenshot\(\s*\{[^}]*?\btimeout\s*:/);
  });

  it('⑫（判据⑧）单页三步累计超预算时总耗时仍 ≤ 预算（步间复检生效）', async () => {
    // 三步各 120ms，累计 480ms > 预算 300ms ⇒ 若无步间复检，总耗时会到 ~480ms
    const slow = () => sleep(120).then(() => null);
    const page = makePage({
      goto: slow,
      waitForFunction: async () => true,
      evaluate: slow,
      screenshot: slow,
    });
    pupMock.launch.mockResolvedValue(makeBrowser(page));
    const { dir, root } = makeDirs();
    const svc = new Service({ getMergedAiConfig: async () => ({}) });

    const budgetMs = 300;
    const t0 = Date.now();
    await svc.captureShots(dir, root, [{ path: 'index.html' }], {
      deadline: Date.now() + budgetMs,
    });
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(budgetMs + 120); // 硬闸：不得被单页内多步累加突破
    expect(elapsed).toBeGreaterThan(150); // 反证「真的跑了 goto + 至少一步 evaluate」
  });

  it('⑬ T5：截图策略计数行必须带 bounded / truncatedBy / paint 各步耗时（真机可读）', () => {
    const i = SERVICE_SRC.indexOf('[scan] 截图策略');
    expect(i).toBeGreaterThan(0);
    const block = SERVICE_SRC.slice(i, i + 900);
    expect(block).toContain('bounded:');
    expect(block).toContain('truncatedBy:');
    expect(block).toContain('readyMs:');
    expect(block).toContain('evaluate1Ms:');
    expect(block).toContain('evaluate2Ms:');
  });
});
