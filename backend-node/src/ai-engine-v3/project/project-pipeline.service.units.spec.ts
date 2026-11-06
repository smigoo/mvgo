/**
 * 项目单元拆分（`GET runs/:runId/units`）—— **service 层**判据（P0/P1/P2 · Figma 分支）
 *
 * 拆解规则由 `units/` 两个模块自己测（`unit-contract.spec` / `figma-unit-splitter.spec`）。
 * 这一层只管**缓存与落盘策略**，也就是「真机上真正会让人踩坑的那部分」：
 *   ① 什么算命中（version → runId → 形状 → 可缓存白名单 → 输入一致性）
 *   ② 什么时候必须重算（`refresh` / 版本不符 / 形状不合格 / 跨运行 / 画板换了）
 *   ③ 什么情况**不许**落盘（偶发降级 `FIGMA_FETCH_FAILED`：一次 429 不能钉死整个运行）
 *   ④ 日志必须能区分「命中缓存」与「真去拆了」（`mode: cache|stale|summary|degraded`）
 *
 * 🔴 为什么每条断言都盯着 `getNode` 调用次数：判据是「有没有真的去取图」，不是
 *    「返回值看起来对不对」。只看返回值时，缓存分支整段删掉测试照样绿（重算也能得到
 *    同一份 units）—— 这是本仓反复踩过的「假绿」形态，故计数必须进断言。
 *
 * 🔴 `RUNS_ROOT` 是**模块加载时求值**的 const（`project-pipeline.service.ts:74`），
 *    所以必须：设 `PROJECT_RUNS_ROOT` → `jest.resetModules()` → `require()`。
 *    顺序错一步，测试会往仓库 `data/project-runs/` 里写脏数据；用 `await import()` 也不行
 *    （ts-jest CJS 下缺 `--experimental-vm-modules`）。
 */

// 桩：拆分层 → page-decomposer → logger/index → config/backend-root（import.meta.url，CJS 下必炸）
jest.mock('../../ai-engine/logger/index.js', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));
// 桩：真实 FigmaClient 会打网络；本 spec 只关心「服务有没有调它、调了几次」
jest.mock('../../ai-engine/tools/figma/figma-client.js', () => ({ FigmaClient: jest.fn() }));
// 桩：AiConfigService 会拉 Mongo 连接，本层只需要「能取到 token」
jest.mock('../../config/config.service', () => ({ AiConfigService: class {} }));
// 桩：project-pipeline.service 顶层 `const { ZipArchive } = require('archiver')`，
//     而 archiver@8 是**纯 ESM**，jest(CJS) 下会抛
//     `SyntaxError: Cannot use import statement outside a module`。本层不测打包，只留形状。
jest.mock('archiver', () => ({ ZipArchive: jest.fn() }));

const nodeFs = require('node:fs');
const nodepath = require('node:path');
const os = require('node:os');

// 纯函数、无状态，静态导入即可（无需走 resetModules 的同一实例）
import { unitInputKeyFigma } from './units/unit-contract';

/* ------------------------------------------------------------------ 夹具 --- */

/** 合法 runId 形状：`pj-YYYYMMDD-HHMMSS-6hex`（`assertRunId` 会挡掉一切别的形状） */
const RUN_OK = 'pj-20261106-101010-aaaaaa';
const RUN_OK2 = 'pj-20261106-101020-bbbbbb';
const RUN_REFRESH = 'pj-20261106-101030-cccccc';
const RUN_BAD_VER = 'pj-20261106-101040-dddddd';
const RUN_BAD_SHAPE = 'pj-20261106-101050-eeeeee';
const RUN_FETCH_FAIL = 'pj-20261106-101100-111111';
const RUN_STALE_CACHE = 'pj-20261106-101110-222222';
const RUN_OK_PERSIST = 'pj-20261106-101120-333333';
const RUN_SUMMARY_LOG = 'pj-20261106-101130-444444';
const RUN_CROSS = 'pj-20261106-101140-555555';
const RUN_WRITE_FAIL = 'pj-20261106-101150-666666';
const RUN_SWITCH_BOARD = 'pj-20261106-101200-777777';
const RUN_SAME_BOARD = 'pj-20261106-101210-888888';
const RUN_NO_BOARD = 'pj-20261106-101220-999999';
const RUN_CACHE_LOG = 'pj-20261106-101230-aaaaab';
/** 声明层 `mvgo.project.json` 解析失败（content 只剩 `__parseError`） */
const RUN_MANIFEST_BROKEN = 'pj-20261106-101240-bbbbbc';
/** HTML 分支（无 links.figma，有 S0.html.pages） */
const RUN_HTML = 'pj-20261106-101300-aaaaac';
const RUN_HTML_CACHE = 'pj-20261106-101310-bbbbbd';
const RUN_HTML_STALE = 'pj-20261106-101320-ccccce';
/** 同时声明 links.figma 与原型页 —— 必须仍走 figma 分支 */
const RUN_BOTH = 'pj-20261106-101330-dddddd';
/** 三条分支各打一次 dispatch 计数行 */
const RUN_DISPATCH_FIGMA = 'pj-20261106-101350-ffffff';
const RUN_DISPATCH_HTML = 'pj-20261106-101360-111112';
const RUN_DISPATCH_NONE = 'pj-20261106-101370-222223';
/** 既无 figma 又无原型页（none 分支，独立于已有 RUN_NO_BOARD 以免命中其缓存） */
const RUN_NONE = 'pj-20261106-101380-333334';

/** 5 个真实形状的原型页 */
const HTML_PAGES = [
  'html/模块1/云资源监测.html',
  'html/模块1/数据安全审计.html',
  'html/模块1/服务概览.html',
  'html/模块1/本地资源监测.html',
  'html/模块1/调用日志.html',
];

const FIGMA_URL = 'https://www.figma.com/design/FileKey123/DaPing?node-id=2-7952';
/** 同一个文件、**换了一个画板** —— 只用来触发「输入变了」那条失效轴 */
const FIGMA_URL_OTHER = 'https://www.figma.com/design/FileKey123/DaPing?node-id=9-9001';

/** 两个 `cp-` + 一个非 cp 节点：既覆盖「拆出 2 个」，也覆盖「非 cp 不计数」 */
function treeFixture(): any {
  return {
    name: 'Board',
    id: '2:7952',
    children: [
      {
        name: 'cp-panel-jiankong',
        id: '2:7953',
        absoluteBoundingBox: { width: 800, height: 600 },
      },
      {
        name: 'cp-table-liebiao',
        id: '2:7954',
        absoluteBoundingBox: { width: 640, height: 400 },
      },
      { name: 'frame-not-a-unit', id: '2:7955' },
    ],
  };
}

let tmpRoot: string;
let ProjectPipelineService: any;
let FigmaClientMock: jest.Mock;
let getNode: jest.Mock;
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let svc: any;

function runDir(runId: string): string {
  return nodepath.join(tmpRoot, runId);
}

/** 造一个运行目录。`figmaUrl === null` = 声明层没写 links.figma（走确定性降级） */
function makeRun(runId: string, figmaUrl: string | null = FIGMA_URL): void {
  nodeFs.mkdirSync(nodepath.join(runDir(runId), 'spec'), { recursive: true });
  const content: any = { version: 1 };
  if (figmaUrl) content.links = { figma: figmaUrl };
  const manifest = {
    runId,
    S0: { projectJson: { content } },
    S1: { features: [] },
  };
  nodeFs.writeFileSync(
    nodepath.join(runDir(runId), 'spec', 'project.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

/** 改声明层的画板链接（模拟「人把画板换了一个」） */
function setDeclaredFigmaUrl(runId: string, figmaUrl: string): void {
  const file = nodepath.join(runDir(runId), 'spec', 'project.manifest.json');
  const manifest = JSON.parse(nodeFs.readFileSync(file, 'utf8'));
  manifest.S0.projectJson.content.links = { figma: figmaUrl };
  nodeFs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

/** 模拟 `mvgo.project.json` 解析失败：content 只剩 `__parseError`（S0 扫描器就是这么写的） */
function setManifestParseError(runId: string, msg = 'Unexpected token < in JSON at position 0'): void {
  const file = nodepath.join(runDir(runId), 'spec', 'project.manifest.json');
  const manifest = JSON.parse(nodeFs.readFileSync(file, 'utf8'));
  manifest.S0.projectJson.content = { __parseError: msg };
  nodeFs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

/** 造一个「有 HTML 原型页、**无** links.figma」的运行目录（HTML 分支目标场景） */
function makeRunHtml(runId: string, pageRels: string[] = HTML_PAGES): void {
  nodeFs.mkdirSync(nodepath.join(runDir(runId), 'spec'), { recursive: true });
  const manifest = {
    runId,
    S0: {
      projectJson: { content: { version: 1 } }, // 刻意不写 links.figma
      html: { pages: pageRels.map((p) => ({ path: p, bytes: 1234 })) },
    },
    S1: { features: [] },
  };
  nodeFs.writeFileSync(
    nodepath.join(runDir(runId), 'spec', 'project.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

/** 改声明层的原型页集合（模拟「HTML 项目加了/删了一个页」） */
function setHtmlPages(runId: string, pageRels: string[]): void {
  const file = nodepath.join(runDir(runId), 'spec', 'project.manifest.json');
  const manifest = JSON.parse(nodeFs.readFileSync(file, 'utf8'));
  manifest.S0.html = { pages: pageRels.map((p) => ({ path: p, bytes: 1234 })) };
  nodeFs.writeFileSync(file, JSON.stringify(manifest, null, 2));
}

/** 造一个「同时声明 links.figma 与原型页」的运行目录 */
function makeRunBoth(runId: string, figmaUrl: string, pageRels: string[] = HTML_PAGES): void {
  nodeFs.mkdirSync(nodepath.join(runDir(runId), 'spec'), { recursive: true });
  const manifest = {
    runId,
    S0: {
      projectJson: { content: { version: 1, links: { figma: figmaUrl } } },
      html: { pages: pageRels.map((p) => ({ path: p, bytes: 1234 })) },
    },
    S1: { features: [] },
  };
  nodeFs.writeFileSync(
    nodepath.join(runDir(runId), 'spec', 'project.manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

function componentsPath(runId: string): string {
  return nodepath.join(runDir(runId), 'spec', 'components.json');
}

function componentsExists(runId: string): boolean {
  return nodeFs.existsSync(componentsPath(runId));
}

/** 手写一份「历史缓存」—— 用来验证读端把关，**不经** buildUnits */
function writeRawCache(runId: string, over: any = {}): any {
  const base: any = {
    version: 'unit.v2',
    runId,
    builtAt: '2026-11-06T02:00:00Z',
    source: {
      kind: 'figma',
      figmaUrl: FIGMA_URL,
      figmaFileKey: 'FileKey123',
      figmaNodeId: '2:7952',
      inputKey: unitInputKeyFigma(FIGMA_URL),
    },
    degraded: null,
    units: [
      {
        componentId: 'u-figma-2-7953',
        name: 'jiankong',
        sourceType: 'figma',
        anchor: { figmaFileKey: 'FileKey123', figmaNodeId: '2:7953' },
        box: { width: 800, height: 600 },
        tier: 'max',
        status: 'pending',
        feature: null,
      },
    ],
    stats: { total: 1, unmatched: 1, bySource: { figma: 1 }, byTier: { max: 1 } },
  };
  // over 若给了 source，需要它自带 inputKey；否则从 over 里覆盖单字段
  const merged = { ...base, ...over };
  nodeFs.writeFileSync(componentsPath(runId), JSON.stringify(merged, null, 2));
  return merged;
}

/** 收集 `[units] {...}` 计数行（真机判据就靠它，故断言直接打在它上面） */
function unitsLogs(): any[] {
  return logSpy.mock.calls
    .map((c: any[]) => String(c[0] ?? ''))
    .filter((s: string) => s.startsWith('[units] '))
    .map((s: string) => {
      try {
        return JSON.parse(s.slice('[units] '.length));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function logsOfMode(mode: string): any[] {
  return unitsLogs().filter((p) => p.mode === mode);
}

beforeAll(() => {
  // 必须在 require 之前：RUNS_ROOT 在模块顶层求值
  tmpRoot = nodeFs.mkdtempSync(nodepath.join(nodeFs.realpathSync(os.tmpdir()), 'mvgo-units-'));
  process.env.PROJECT_RUNS_ROOT = tmpRoot;
  jest.resetModules();

  // resetModules 之后 require：保证 service 与下面 spy 的 Logger 来自**同一份**模块实例
  const nest = require('@nestjs/common');
  ProjectPipelineService = require('./project-pipeline.service').ProjectPipelineService;
  FigmaClientMock = require('../../ai-engine/tools/figma/figma-client.js').FigmaClient;

  logSpy = jest.spyOn(nest.Logger.prototype, 'log').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(nest.Logger.prototype, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(nest.Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterAll(() => {
  try {
    nodeFs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响判据 */
  }
  delete process.env.PROJECT_RUNS_ROOT;
});

beforeEach(() => {
  getNode = jest.fn().mockResolvedValue(treeFixture());
  FigmaClientMock.mockImplementation(() => ({ getNode }));
  // token 走「用户配置」分支，避免测试依赖环境变量（口径同 lite 链路）
  svc = new ProjectPipelineService({
    getMergedAiConfig: async () => ({ figmaToken: 'tok-for-test' }),
  });
  logSpy.mockClear();
  warnSpy.mockClear();
  errorSpy.mockClear();
});

/* -------------------------------------------------------------- 命中 / 重算 --- */

describe('getUnits · 命中与重算', () => {
  it('命中缓存时**一次都不去取图**（否则缓存分支删掉测试也不红）', async () => {
    makeRun(RUN_OK);
    const first = await svc.getUnits(RUN_OK);
    expect(first.cached).toBe(false);
    expect(first.units.length).toBe(2);
    expect(getNode).toHaveBeenCalledTimes(1);

    const second = await svc.getUnits(RUN_OK);
    expect(second.cached).toBe(true);
    expect(second.units.map((u: any) => u.componentId)).toEqual(
      first.units.map((u: any) => u.componentId),
    );
    // 关键：命中分支没有新增请求
    expect(getNode).toHaveBeenCalledTimes(1);
  });

  it('refresh:true 无视缓存强制重算', async () => {
    makeRun(RUN_REFRESH);
    await svc.getUnits(RUN_REFRESH);
    expect(getNode).toHaveBeenCalledTimes(1);

    const again = await svc.getUnits(RUN_REFRESH, undefined, { refresh: true });
    expect(again.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(2);
  });

  it('版本不符 ⇒ 按无缓存重算（形状变了旧缓存必须作废）', async () => {
    makeRun(RUN_BAD_VER);
    writeRawCache(RUN_BAD_VER, { version: 'unit.v0' });

    const out = await svc.getUnits(RUN_BAD_VER);
    expect(out.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(1);
    // 重算后落盘的是**新版本**，坏缓存被覆盖
    const written = JSON.parse(nodeFs.readFileSync(componentsPath(RUN_BAD_VER), 'utf8'));
    expect(written.version).toBe('unit.v2');
  });

  it('形状不合格（tier 与 sourceType 派生值不符）⇒ 重算', async () => {
    makeRun(RUN_BAD_SHAPE);
    writeRawCache(RUN_BAD_SHAPE, {
      units: [
        {
          componentId: 'u-figma-2-7953',
          name: 'jiankong',
          sourceType: 'figma',
          anchor: { figmaFileKey: 'FileKey123', figmaNodeId: '2:7953' },
          box: { width: 800, height: 600 },
          // figma 只允许 max；手填 lite = 有人在别处自己定义了档位
          tier: 'lite',
          status: 'pending',
          feature: null,
        },
      ],
    });

    const out = await svc.getUnits(RUN_BAD_SHAPE);
    expect(out.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls.some((c: any[]) => String(c[0]).includes('形状不合格'))).toBe(true);
  });

  it('跨运行的缓存被拒（runId 与目录不一致）', async () => {
    makeRun(RUN_CROSS);
    writeRawCache(RUN_CROSS, { runId: RUN_OK2 });

    const out = await svc.getUnits(RUN_CROSS);
    expect(out.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls.some((c: any[]) => String(c[0]).includes('不一致'))).toBe(true);
  });
});

/* ---------------------------------------------------------------- 落盘策略 --- */

describe('getUnits · 落盘策略', () => {
  it('偶发降级 FIGMA_FETCH_FAILED **不落盘**，下次必须重试', async () => {
    makeRun(RUN_FETCH_FAIL);
    getNode.mockRejectedValue(new Error('429 Too Many Requests'));

    const first = await svc.getUnits(RUN_FETCH_FAIL);
    expect(first.degraded?.code).toBe('FIGMA_FETCH_FAILED');
    expect(first.units).toEqual([]);
    // 落盘会被下一次请求当成缓存命中 ⇒ 一次 429 永久钉死这个运行
    expect(componentsExists(RUN_FETCH_FAIL)).toBe(false);

    await svc.getUnits(RUN_FETCH_FAIL);
    expect(getNode).toHaveBeenCalledTimes(2);
  });

  it('历史遗留在盘上的偶发降级缓存被忽略（读端白名单）', async () => {
    makeRun(RUN_STALE_CACHE);
    writeRawCache(RUN_STALE_CACHE, {
      degraded: { code: 'FIGMA_FETCH_FAILED', message: '历史的 429' },
      units: [],
      stats: { total: 0, unmatched: 0, bySource: {}, byTier: {} },
    });

    const out = await svc.getUnits(RUN_STALE_CACHE);
    expect(out.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(1);
  });

  it('成功路径落盘：components.json 内容就是返回体，且 stats.total 自洽', async () => {
    makeRun(RUN_OK_PERSIST);
    const out = await svc.getUnits(RUN_OK_PERSIST);
    expect(componentsExists(RUN_OK_PERSIST)).toBe(true);

    const written = JSON.parse(nodeFs.readFileSync(componentsPath(RUN_OK_PERSIST), 'utf8'));
    expect(written.version).toBe('unit.v2');
    expect(written.runId).toBe(RUN_OK_PERSIST);
    expect(written.degraded).toBeNull();
    expect(written.units.length).toBe(2);
    expect(written.stats.total).toBe(written.units.length);
    expect(written.units.map((u: any) => u.componentId)).toEqual(
      out.units.map((u: any) => u.componentId),
    );
  });

  it('落盘失败 ⇒ 返回体照常、日志 persisted:false（persisted 是磁盘事实）', async () => {
    makeRun(RUN_WRITE_FAIL);
    // 用「同名目录」制造真实的 EISDIR —— 比 mock writeFileSync 更贴近真机（不依赖桩）
    nodeFs.mkdirSync(componentsPath(RUN_WRITE_FAIL), { recursive: true });

    const out = await svc.getUnits(RUN_WRITE_FAIL);
    expect(out.units.length).toBe(2);
    const summary = logsOfMode('summary');
    expect(summary.length).toBe(1);
    expect(summary[0].persisted).toBe(false);
  });
});

/* -------------------------------------------------- 输入一致性（画板换了） --- */

describe('getUnits · 输入一致性门', () => {
  it('声明层换了画板 ⇒ 旧快照作废，并打 mode:stale 计数行', async () => {
    makeRun(RUN_SWITCH_BOARD, FIGMA_URL);
    await svc.getUnits(RUN_SWITCH_BOARD);
    expect(getNode).toHaveBeenCalledTimes(1);

    setDeclaredFigmaUrl(RUN_SWITCH_BOARD, FIGMA_URL_OTHER);
    logSpy.mockClear();
    const out = await svc.getUnits(RUN_SWITCH_BOARD);

    expect(out.cached).toBe(false);
    expect(getNode).toHaveBeenCalledTimes(2);
    const stale = logsOfMode('stale');
    expect(stale.length).toBe(1);
    expect(stale[0].reason).toBe('input-changed');
    // 旧快照是哪块画板 —— 作废也要能一眼看出它原来是谁
    expect(stale[0].cachedFigmaUrl).toBe(FIGMA_URL);
    // 可观测性：期望指纹 vs 缓存指纹
    expect(stale[0].expectedKey).toBe(unitInputKeyFigma(FIGMA_URL_OTHER));
    expect(stale[0].cachedKey).toBe(unitInputKeyFigma(FIGMA_URL));
  });

  it('声明未变 ⇒ 仍命中（这道门不能把正常缓存一起误杀）', async () => {
    makeRun(RUN_SAME_BOARD, FIGMA_URL);
    await svc.getUnits(RUN_SAME_BOARD);
    const out = await svc.getUnits(RUN_SAME_BOARD);

    expect(out.cached).toBe(true);
    expect(getNode).toHaveBeenCalledTimes(1);
    expect(logsOfMode('stale')).toEqual([]);
  });

  it('两边都没画板 ⇒ null === null 命中（NO_FIGMA_LINK 可缓存）', async () => {
    makeRun(RUN_NO_BOARD, null);
    const first = await svc.getUnits(RUN_NO_BOARD);
    expect(first.degraded?.code).toBe('NO_FIGMA_LINK');
    expect(first.source.figmaUrl).toBeNull();
    // 确定性降级：本就没有画板，可缓存
    expect(componentsExists(RUN_NO_BOARD)).toBe(true);

    const second = await svc.getUnits(RUN_NO_BOARD);
    expect(second.cached).toBe(true);
    expect(getNode).toHaveBeenCalledTimes(0);
  });

  it('清单解析失败 ⇒ 同样 NO_FIGMA_LINK，但文案点名「解析失败」而非「未声明」', async () => {
    makeRun(RUN_MANIFEST_BROKEN);
    setManifestParseError(RUN_MANIFEST_BROKEN);

    const out = await svc.getUnits(RUN_MANIFEST_BROKEN);
    // 降级码不变（说明只影响文案，不改判据）
    expect(out.degraded?.code).toBe('NO_FIGMA_LINK');
    expect(getNode).toHaveBeenCalledTimes(0);

    // 端到端接线判据：service 必须真的把 note 传进 splitFigmaUnits。
    // 只测 splitter 的入参语义不够 —— 那样 service 里漏传这一行，测试照样全绿。
    expect(out.degraded?.message).toContain('解析失败');
    expect(out.degraded?.message).toContain('Unexpected token');
    expect(out.degraded?.message).not.toBe('项目未声明 links.figma，无画板可拆');
  });
});

/* ------------------------------------------------------------------ 计数行 --- */

describe('getUnits · 可观测性', () => {
  it('摘要计数行带 units/persisted/elapsedMs，能区分「真拆了」与「命中」', async () => {
    makeRun(RUN_SUMMARY_LOG);
    await svc.getUnits(RUN_SUMMARY_LOG);

    const summary = logsOfMode('summary');
    expect(summary.length).toBe(1);
    expect(summary[0].runId).toBe(RUN_SUMMARY_LOG);
    expect(summary[0].units).toBe(2);
    expect(summary[0].degraded).toBeNull();
    expect(summary[0].persisted).toBe(true);
    expect(typeof summary[0].elapsedMs).toBe('number');
  });

  it('命中行的 persisted 恒为 false（否则按 persisted 聚合会重复计数写盘）', async () => {
    makeRun(RUN_CACHE_LOG);
    await svc.getUnits(RUN_CACHE_LOG);
    logSpy.mockClear();

    const again = await svc.getUnits(RUN_CACHE_LOG);
    expect(again.cached).toBe(true);
    const cache = logsOfMode('cache');
    expect(cache.length).toBe(1);
    expect(cache[0].persisted).toBe(false);
    expect(cache[0].units).toBe(2);
    // 命中不发 summary 行 —— 两条都打会让「拆了几次」数不清
    expect(logsOfMode('summary')).toEqual([]);
  });
});

/* ------------------------------------------------ HTML 原型页分支（非 Figma） --- */

describe('getUnits · HTML 原型页分支（非 Figma）', () => {
  it('a. 有原型页、无 links.figma → html 分支：kind=html、5 单元、落盘 spec/components.json', async () => {
    makeRunHtml(RUN_HTML, HTML_PAGES);
    const out = await svc.getUnits(RUN_HTML);

    expect(out.cached).toBe(false);
    expect(out.source.kind).toBe('html');
    expect(out.source.figmaUrl).toBeNull();
    expect(out.degraded).toBeNull();
    expect(out.units.length).toBe(5);
    // HTML 分支不碰 Figma：一次都不取图
    expect(getNode).toHaveBeenCalledTimes(0);
    for (const u of out.units as any[]) {
      expect(u.sourceType).toBe('html');
      expect(u.tier).toBe('lite');
      expect(u.status).toBe('pending');
      expect(HTML_PAGES).toContain(u.anchor.pagePath);
    }

    // dispatch 计数行：branch=html（含原因：figmaUrl=null、htmlPages=5）
    const dispatch = logsOfMode('dispatch');
    expect(dispatch.length).toBe(1);
    expect(dispatch[0].branch).toBe('html');
    expect(dispatch[0].figmaUrl).toBeNull();
    expect(dispatch[0].htmlPages).toBe(5);

    // html-split 计数行（真机判据）
    const split = logsOfMode('html-split');
    expect(split.length).toBe(1);
    expect(split[0].pages).toBe(5);
    expect(split[0].units).toBe(5);

    // summary + 落盘
    const summary = logsOfMode('summary');
    expect(summary.length).toBe(1);
    expect(summary[0].units).toBe(5);
    expect(summary[0].persisted).toBe(true);

    // 读盘证实真的写了 spec/components.json
    expect(componentsExists(RUN_HTML)).toBe(true);
    const written = JSON.parse(nodeFs.readFileSync(componentsPath(RUN_HTML), 'utf8'));
    expect(written.version).toBe('unit.v2');
    expect(written.source.kind).toBe('html');
    expect(written.source.inputKey).toMatch(/^html:/);
    expect(written.units.length).toBe(5);
    expect(written.stats.total).toBe(5);
  });

  it('b. 紧接着不传 refresh 再请求 → 命中缓存（mode:cache），不重新拆', async () => {
    makeRunHtml(RUN_HTML_CACHE, HTML_PAGES);
    await svc.getUnits(RUN_HTML_CACHE);
    logSpy.mockClear();

    const again = await svc.getUnits(RUN_HTML_CACHE);
    expect(again.cached).toBe(true);
    const cache = logsOfMode('cache');
    expect(cache.length).toBe(1);
    expect(cache[0].units).toBe(5);
    // 命中不发 dispatch（没重算就没分派）
    expect(logsOfMode('dispatch')).toEqual([]);
    expect(getNode).toHaveBeenCalledTimes(0);
  });

  it('c. 原型页 5→4 后再请求 → stale(input-changed)，重算后 units 跟着变', async () => {
    makeRunHtml(RUN_HTML_STALE, HTML_PAGES);
    await svc.getUnits(RUN_HTML_STALE);

    setHtmlPages(RUN_HTML_STALE, HTML_PAGES.slice(0, 4));
    logSpy.mockClear();
    const out = await svc.getUnits(RUN_HTML_STALE);

    expect(out.cached).toBe(false);
    expect(out.units.length).toBe(4);
    const stale = logsOfMode('stale');
    expect(stale.length).toBe(1);
    expect(stale[0].reason).toBe('input-changed');
    expect(stale[0].cachedKey).toMatch(/^html:/);
    expect(stale[0].expectedKey).toMatch(/^html:/);
    expect(stale[0].cachedKey).not.toBe(stale[0].expectedKey);
  });

  it('d. 同时声明 links.figma 与原型页 → 仍走 figma 分支（figma=max，有节点树真值）', async () => {
    makeRunBoth(RUN_BOTH, FIGMA_URL, HTML_PAGES);
    const out = await svc.getUnits(RUN_BOTH);

    expect(out.source.kind).toBe('figma');
    expect(getNode).toHaveBeenCalledTimes(1);
    expect((out.units as any[]).every((u) => u.sourceType === 'figma')).toBe(true);
    const dispatch = logsOfMode('dispatch');
    expect(dispatch[0].branch).toBe('figma');
    // 不做第二次拆分：不产 html 单元
    expect(logsOfMode('html-split')).toEqual([]);
  });

  it('e. 既无 figma 又无原型页 → 仍 NO_FIGMA_LINK（防回归）', async () => {
    makeRun(RUN_NONE, null);
    const out = await svc.getUnits(RUN_NONE);

    expect(out.degraded?.code).toBe('NO_FIGMA_LINK');
    expect(out.units).toEqual([]);
    expect(getNode).toHaveBeenCalledTimes(0);
    expect(logsOfMode('dispatch')[0].branch).toBe('none');
  });

  it('f. dispatch 计数行：figma / html / none 三条分支各出现一次', async () => {
    makeRun(RUN_DISPATCH_FIGMA, FIGMA_URL);
    makeRunHtml(RUN_DISPATCH_HTML, HTML_PAGES);
    makeRun(RUN_DISPATCH_NONE, null);

    await svc.getUnits(RUN_DISPATCH_FIGMA);
    await svc.getUnits(RUN_DISPATCH_HTML);
    await svc.getUnits(RUN_DISPATCH_NONE);

    const branches = logsOfMode('dispatch').map((p) => p.branch).sort();
    expect(branches).toEqual(['figma', 'html', 'none']);
  });
});
