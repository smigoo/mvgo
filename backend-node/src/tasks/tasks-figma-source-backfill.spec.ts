/**
 * Figma 源回填（tasks.service#resolveFigmaSource）—— 「清理任务不应影响历史记录」
 *
 * 🔴 背景（2026-11-06 用户实锤）：
 *   用户清理 `temp-components/<group>/<sessionId>` 后，历史下拉里的实验任务全部丢失
 *   Figma 链接 —— 因为唯一副本是产物里的 `.cache/figma-source.json`。
 *   但同一条事实生成期也写在**任务自己的进度日志**里：
 *     `💾 Figma 源信息已保存到 .cache/figma-source.json: <fileKey>/<nodeId>`
 *   它随 tasks.json 持久化，与产物目录无关 ⇒ 回填必须以任务记录为优先。
 *
 * 每组都带阳性对照：没有日志时必须回落到「读不到」，否则无法区分
 * 「判据命中」与「判据恒真」。
 */

// Mock archiver 避免 ESM 错误（同 tasks.service.spec.ts）
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

// Mock backend-root：CJS 转换下 __filename 重声明会炸套件；同时让产物目录**不存在**，
// 从而证明回填不依赖产物（这正是本文件要守的语义）。
jest.mock('../config/backend-root', () => ({
  backendRoot: '/tmp/mvgo-test-nothing/backend-node',
  projectRoot: '/tmp/mvgo-test-nothing',
  workspaceRoot: '/tmp/mvgo-test-nothing/workspace',
  customComponentsDir: '/tmp/mvgo-test-nothing/workspace/custom-components',
  vue3ComponentsDir: '/tmp/mvgo-test-nothing/workspace/vue3-components',
  tempComponentsDir: '/tmp/mvgo-test-nothing/temp-components',
  dataDir: '/tmp/mvgo-test-nothing/backend-node/data',
  resolveFrontendWorkspacePath: () => '/tmp/mvgo-test-nothing/frontend/workspace',
  frontendCustomComponentsDir: () => '/tmp/mvgo-test-nothing/frontend/workspace/custom-components',
  frontendVue3ComponentsDir: () => '/tmp/mvgo-test-nothing/frontend/workspace/vue3-components',
}));

jest.mock('../config/workspace.config', () => ({
  resolveFrontendWorkspace: () => '/tmp/mvgo-test-nothing/frontend/workspace',
  isFrontendWorkspaceAvailable: () => false,
}));

import { TasksService } from './tasks.service';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const LOG_LINE = (fileKey: string, nodeId: string) =>
  `💾 Figma 源信息已保存到 .cache/figma-source.json: ${fileKey}/${nodeId}`;

/** 造一个 lab 实验任务（fileKey 为空 = 补丁生效前的历史数据形态） */
function makeLabTask(svc: TasksService, sid: string, progress: any[] = [], fileKey = '') {
  svc.createTask(
    sid,
    {
      componentId: sid,
      componentName: sid,
      groupId: 'g-test',
      target: 'microcode',
      generationTier: 'lite',
      sourceType: 'figma',
      fileKey,
    } as any,
    'completed',
  );
  const t = (svc as any).tasks.get(sid);
  t.progress = progress;
  return t;
}

const listOne = (svc: TasksService, sid: string) => {
  const list = svc.getAllTasks(undefined, { limit: 20, slim: true }) as any[];
  return list.find((t) => t.sessionId === sid)!;
};

describe('Figma 源回填：任务记录优先于产物读盘', () => {
  it('进度日志里带 Figma 源 → 产物被清也能回填出 fileKey/nodeId', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1793890392882-1b5b72d0';
    makeLabTask(svc, sid, [{ type: 'log', level: 'info', message: LOG_LINE('1t7Dmmpsl5i0PC8BJt2QLf', '2:8417') }]);

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('1t7Dmmpsl5i0PC8BJt2QLf');
    expect(t.nodeId).toBe('2:8417');
    jest.clearAllTimers();
  });

  it('阳性对照：同样的任务、日志里没有该行 → 不回填（证明判据不是恒真）', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1793893569992-90810e74';
    makeLabTask(svc, sid, [
      { type: 'log', level: 'info', message: 'Figma 节点逻辑尺寸: 426x807（导出倍率 scale=1）' },
      { type: 'progress', stage: 'generating', message: '生成组件中…' },
    ]);

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('');
    expect(t.nodeId).toBe('');
    jest.clearAllTimers();
  });

  it('任务字段已有 fileKey → 以任务自身为准，不被日志覆盖', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1793895520058-1367babe';
    makeLabTask(svc, sid, [{ type: 'log', message: LOG_LINE('OLDOLDOLDOLD', '1:1') }], 'GTcJm0DKQvcJvcOZTh5n1l');

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('GTcJm0DKQvcJvcOZTh5n1l');
    expect(t.nodeId).toBe('');
    jest.clearAllTimers();
  });

  it('日志被截断/形态不同（字符串条目）也能识别', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1793860660816-bb416c76';
    makeLabTask(svc, sid, [
      '导出 Figma 图片中...',
      LOG_LINE('AbCdEf123456', '43:4782'),
    ]);

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('AbCdEf123456');
    expect(t.nodeId).toBe('43:4782');
    jest.clearAllTimers();
  });
});

/**
 * 🔴 并发串味防护（2026-11-05 真机证据驱动）
 *
 * 真机现象：3 条并发 lab 任务（`…280074-a2919b5d` / `…292339-2ea39450` / `…302793-3e120489`）
 * 的 progress 里同时含 `.cache/figma-source.json: GTcJm0DK…/48:5796`，timestamp 逐位相同
 * （1793896305583/84/85），而三者 `fileKey` 各不相同 —— 根因是 `LiteService` 每次调用都把
 * 单例 logger 改写成绑定当次 sessionId 的 Proxy 且从不还原（已在 lite 侧治本）。
 *
 * 但**历史数据仍带污染**，未来任何回归都会重新污染 ⇒ 回填必须自证：
 *   多值 = 不可信 = 拒绝（宁可缺链接，也不把 A 设计稿的链接挂到 B 组件上）。
 * 本组两条互为对照：多值必须拒、同值多条必须收（证明判据不是「多条就拒」）。
 */
describe('Figma 源回填：并发串味防护（多值拒绝 / 同值多条照收）', () => {
  it('日志含两个不同 Figma 源（串味）→ 拒绝回填，并留下可定位的告警', () => {
    const svc = new TasksService();
    const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    const sid = 'mc-lab-1793896302793-3e120489';
    makeLabTask(svc, sid, [
      { type: 'log', message: LOG_LINE('GTcJm0DKQvcJvcOZTh5n1l', '48:5796') },
      { type: 'log', message: LOG_LINE('GTcJm0DKQvcJvcOZTh5n1l', '36:1693') },
      { type: 'log', message: 'Lite 生成失败: Figma 图片获取失败：Figma 文件或节点不存在' },
    ]);

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('');
    expect(t.nodeId).toBe('');
    // 拒绝必须是「有意识的拒绝」，不是静默 miss —— 否则无法与回归区分
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('拒绝回填');
    warn.mockRestore();
    jest.clearAllTimers();
  });

  it('阳性对照：同一 Figma 源重复多条 → 仍然回填（证明判据是「多值」而非「多条」）', () => {
    const svc = new TasksService();
    const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    const sid = 'mc-lab-1793896280074-a2919b5d';
    makeLabTask(svc, sid, [
      { type: 'log', message: LOG_LINE('GTcJm0DKQvcJvcOZTh5n1l', '48:5796') },
      { type: 'log', message: LOG_LINE('GTcJm0DKQvcJvcOZTh5n1l', '48:5796') },
    ]);

    const t = listOne(svc, sid);
    expect(t.fileKey).toBe('GTcJm0DKQvcJvcOZTh5n1l');
    expect(t.nodeId).toBe('48:5796');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    jest.clearAllTimers();
  });
});
