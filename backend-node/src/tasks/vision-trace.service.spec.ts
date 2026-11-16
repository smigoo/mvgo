// Mock 依赖链：TasksService 会带入 archiver(ESM) 与 backend-root(__filename 重声明)，
// 两者都会让套件在加载期直接失败（既有基线问题，口径与 tasks.service.spec.ts 一致）。
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

jest.mock('../config/backend-root', () => ({
  backendRoot: '/tmp/mvgo-test/backend-node',
  projectRoot: '/tmp/mvgo-test',
  workspaceRoot: '/tmp/mvgo-test/workspace',
  customComponentsDir: '/tmp/mvgo-test/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test/workspace/vue3-components',
  tempComponentsDir: '/tmp/mvgo-test/temp-components',
  dataDir: '/tmp/mvgo-test/backend-node/data',
  resolveFrontendWorkspacePath: () => '/tmp/mvgo-test/frontend/workspace',
  frontendCustomComponentsDir: () => '/tmp/mvgo-test/frontend/workspace/custom-components',
  frontendVue3ComponentsDir: () => '/tmp/mvgo-test/frontend/workspace/vue3-components',
}));

jest.mock('../config/workspace.config', () => ({
  resolveFrontendWorkspace: () => '/tmp/mvgo-test/frontend/workspace',
  isFrontendWorkspaceAvailable: () => false,
}));

import path from 'node:path';
import { existsSync } from 'node:fs';
import { VisionTraceService } from './vision-trace.service';

/**
 * 视觉分析溯源服务（只读）· 2026-11-16。
 *
 * 目的：前端「视觉」页签要能**靠事实**区分「视觉模型问题」与「后续管线问题」。
 * 本 spec 用两组夹具做阴阳对照，夹具结构取自实单
 * `mc-max-1794760772053-c12d0e52`（视觉有 2:3604、plan 没有 ⇒ 产物整块缺图表）：
 *
 *   - dropped（必红）：视觉 `2:3604` 段 `headerRelation=title-itself`、chart 引用
 *     `2:3565-chart`（Figma 中不存在）；plan 只剩 2 段而且**不含** `2:3604`。
 *     ⇒ 必须报「管线层丢段」+「视觉层编造 id」两类信号，两者不可混为一谈。
 *   - aligned（必绿）：视觉段与 plan 段一致、chart 引用命中 `@echarts` 真值。
 *     ⇒ 只允许一条 `ALIGNED` info，不得凭空白报警。
 *
 * 同时覆盖降级：产物目录缺失时必须 `available=false` 且带 reason，**不得抛错**
 * （否则会把只读诊断接口变成任务接口的故障源）。
 */

const FIXTURE_ROOT = path.join(__dirname, '__fixtures__', 'vision-trace');

function serviceFor(dir: string | null) {
  const fakeTasks = {
    getTask: () => ({ sessionId: 'mc-max-test' }),
    resolveTaskOutputDir: () => dir,
  } as any;
  return new VisionTraceService(fakeTasks);
}

describe('VisionTraceService：视觉 vs 管线 事实对照（2026-11-16）', () => {
  it('dropped：视觉有 2:3604、plan 没有 ⇒ 报管线层丢段', () => {
    const svc = serviceFor(path.join(FIXTURE_ROOT, 'dropped'));
    const trace = svc.buildTrace('mc-max-test');

    expect(trace.success).toBe(true);
    expect(trace.available).toBe(true);
    expect(trace.vision.found).toBe(true);
    expect(trace.plan.found).toBe(true);

    // 视觉 3 段 → plan 2 段，缺的正是流量预测
    expect(trace.vision.sectionCount).toBe(3);
    expect(trace.plan.sectionCount).toBe(2);
    expect(trace.plan.droppedSectionIds).toEqual(['2:3604']);

    const dropped = trace.vision.sections.find((s) => s.id === '2:3604');
    expect(dropped).toBeTruthy();
    expect(dropped!.keptInPlan).toBe(false);
    expect(dropped!.headerRelation).toBe('title-itself');
    // 只给「可能命中的判据位置」，不替下游下结论
    expect(dropped!.dropHint).toContain('subcomponent-planner.js:894');

    // 对照：同样是 title-itself 的 2:3565 在 plan 里保留了 ⇒ 丢弃不是「标签一票决定」
    const keptStrip = trace.vision.sections.find((s) => s.id === '2:3565');
    expect(keptStrip!.keptInPlan).toBe(true);
  });

  it('dropped：视觉层编造 id 必须单独标记，不与管线问题混淆', () => {
    const svc = serviceFor(path.join(FIXTURE_ROOT, 'dropped'));
    const trace = svc.buildTrace('mc-max-test');

    const pipelineSignal = trace.signals.find((s) => s.code === 'SECTION_DROPPED_IN_PLAN');
    expect(pipelineSignal).toBeTruthy();
    expect(pipelineSignal!.layer).toBe('pipeline');
    expect(pipelineSignal!.level).toBe('error');
    expect(pipelineSignal!.sectionId).toBe('2:3604');

    const visionSignal = trace.signals.find((s) => s.code === 'CHART_REF_FAKE_ID');
    expect(visionSignal).toBeTruthy();
    expect(visionSignal!.layer).toBe('vision');
    expect(visionSignal!.sectionId).toBe('2:3565-chart');

    // 图表引用对账：bar 命中真值、line 落在编造 id 上
    const bar = trace.vision.chartRefs.find((c) => c.type === 'bar');
    expect(bar!.verdict).toBe('match-truth');
    const line = trace.vision.chartRefs.find((c) => c.type === 'line');
    expect(line!.verdict).toBe('fake-id');
    expect(line!.inFigma).toBe(false);

    // Figma 真值清单要能被前端直接显示（2:3604 才是真图表节点）
    expect(trace.figma.chartTruthNodes.map((n) => n.id)).toContain('2:3604');
  });

  it('aligned：段与引用都对得上时只报一条 ALIGNED，不报警', () => {
    const svc = serviceFor(path.join(FIXTURE_ROOT, 'aligned'));
    const trace = svc.buildTrace('mc-max-test');

    expect(trace.available).toBe(true);
    expect(trace.plan.droppedSectionIds).toEqual([]);
    expect(trace.signals).toHaveLength(1);
    expect(trace.signals[0].code).toBe('ALIGNED');
    expect(trace.signals[0].layer).toBe('aligned');

    // 引用全部命中 @echarts 真值
    expect(trace.vision.chartRefs.every((c) => c.verdict === 'match-truth')).toBe(true);
    expect(trace.artifact.componentFiles).toContain('ContentForecast.vue');
  });

  it('降级：产物目录缺失时 available=false 且带 reason，不抛错', () => {
    const svc = serviceFor(null);
    const trace = svc.buildTrace('mc-max-test');

    expect(trace.success).toBe(true);
    expect(trace.available).toBe(false);
    expect(trace.reason).toContain('产物目录');
    expect(trace.signals[0].code).toBe('TRACE_UNAVAILABLE');
  });
});

/**
 * 真机抽样：默认跳过，只有显式传入 VISION_TRACE_REAL_DIR 才运行。
 * 用途：拿实单目录复核「视觉有、plan 无」确实被报成管线层丢段
 * （2026-11-16 用 `c-traffic-monitor-c12d0e52` 复核过：dropped 含 2:3604）。
 */
const REAL_DIR = process.env.VISION_TRACE_REAL_DIR;
const describeReal = REAL_DIR && existsSync(REAL_DIR) ? describe : describe.skip;

describeReal('VisionTraceService · 真机抽样', () => {
  it('实单目录：视觉有的段被 plan 丢弃时，必须报管线层丢段', () => {
    const trace = serviceFor(REAL_DIR!).buildTrace('real-sample');
    expect(trace.available).toBe(true);
    expect(trace.plan.droppedSectionIds.length).toBeGreaterThan(0);
    const pipelineSignal = trace.signals.find(
      (s) => s.layer === 'pipeline' && s.code === 'SECTION_DROPPED_IN_PLAN',
    );
    expect(pipelineSignal).toBeTruthy();
    expect(trace.vision.sections.length).toBeGreaterThan(trace.plan.sectionCount);
  });
});
