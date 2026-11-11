/**
 * P0-B（2026-11-11）：像素保真证据接入 qualityGate 标签链。
 *
 * 背景（本轮六样本实锤 mc-max-1794373676247-3869b726 score=0.4932 / d30c05b4 score=0.5635）：
 *   C2 契约（docs/2026-11-05-VISUAL-002门禁 §7.5，用户裁决）下 VISUAL-002 以 `severity:'WARN'`
 *   进 runtimeGate，走 incremental_fix **不阻断交付** —— 这是既有裁决，本 spec 不推翻它。
 *   但后果是：score<0.6 的产物以 `completed` + `qualityGate='passed'` 姿态交付，用户看不到任何
 *   「视觉差异大」的痕迹（六样本里 4 个 completed 全是这种形态，用户判语「结构布局完全错误」）。
 *
 * 治本（零阻断语义，只透传证据）：
 *   1. `mc-component-graph-phase2.js#complete` 透传 `state.visualFidelity`（generate-runtime-verify
 *      已写入，此前不透 ⇒ 下游恒 undefined）；
 *   2. `tasks.service#completeTask`：
 *      - runtimeGate.issues 含 VISUAL-002 ⇒ qualityGate 至少 'warned'（仍不影响任务终态 completed）；
 *      - 新增 `task.visualFidelityWarning = { score, verdict }` 持久化证据；
 *   3. 前端 TaskCenter / components.vue 据此显示「视觉待改进」标签（不在本 spec 范围）。
 *
 * 判据可辩驳性：
 *   - 阳性：issues 含 VISUAL-002 ⇒ warned + 证据落盘；
 *   - 阴性：无 VISUAL-002 且其余全过 ⇒ passed（防「恒 warned」假绿）；
 *   - 阴性：VISUAL-002 不改变任务 status（completed 语义不动，C2 契约不推翻）。
 */

jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

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

/** 造一个走到 completeTask 的 microcode 任务 */
function makeTask(svc: TasksService, sid: string) {
  svc.createTask(
    sid,
    {
      componentId: sid,
      componentName: sid,
      groupId: 'g-test',
      target: 'microcode',
      generationTier: 'max',
      sourceType: 'figma',
    } as any,
    'running',
  );
  return (svc as any).tasks.get(sid);
}

const getOne = (svc: TasksService, sid: string) => {
  const list = svc.getAllTasks(undefined, { limit: 20, slim: true }) as any[];
  return list.find((t) => t.sessionId === sid)!;
};

describe('P0-B：VISUAL-002 证据接入 qualityGate 标签链', () => {
  it('⭐ 阳性：runtimeGate.issues 含 VISUAL-002 ⇒ qualityGate=warned + visualFidelityWarning 落盘', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1794373676247-3869b726';
    makeTask(svc, sid);
    // 真机形态：C2 契约 push 的 WARN + compareRenderedVsDesign 的 fidelity
    svc.completeTask(sid, {
      runtimeGate: {
        status: 'WARN',
        issues: [
          {
            id: 'VISUAL-002',
            severity: 'WARN',
            category: 'render-fidelity',
            message: '渲染产物与设计稿像素差异过大（score=0.4932，阈值<0.6）',
          },
        ],
      },
      visualFidelity: { score: 0.4932, verdict: 'block' },
      warnings: [],
    });

    const task = getOne(svc, sid);
    expect(task.qualityGate).toBe('warned');
    expect(task.visualFidelityWarning).toEqual({ score: 0.4932, verdict: 'block' });
    // 🔴 C2 契约不推翻：任务终态仍是 completed（不因视觉分 fail）
    expect(task.status).toBe('completed');
    jest.clearAllTimers();
  });

  it('⭐ 阴性：无 VISUAL-002 且其余门禁全过 ⇒ passed（防「恒 warned」假绿）', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1794374000000-cleanpass';
    makeTask(svc, sid);
    svc.completeTask(sid, {
      runtimeGate: { status: 'PASS', issues: [] },
      visualFidelity: { score: 0.9, verdict: 'pass' },
      warnings: [],
      checkResult: { checkResult: 'pass', qualityScore: 90, critiques: [] },
    });

    const task = getOne(svc, sid);
    expect(task.qualityGate).toBe('passed');
    // 证据仍透传（供前端展示分数），但不触发 warned
    expect(task.visualFidelityWarning).toEqual({ score: 0.9, verdict: 'pass' });
    jest.clearAllTimers();
  });

  it('⭐ 阴性：无 runtimeGate/visualFidelity 的旧形态 complete ⇒ 不写 visualFidelityWarning（向后兼容）', () => {
    const svc = new TasksService();
    const sid = 'mc-lab-1794374000001-legacy';
    makeTask(svc, sid);
    svc.completeTask(sid, { code: '<template></template>' });

    const task = getOne(svc, sid);
    expect(task.visualFidelityWarning).toBeNull();
    jest.clearAllTimers();
  });
});
