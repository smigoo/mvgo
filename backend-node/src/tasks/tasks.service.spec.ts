/**
 * TasksService 单元测试：人工审核功能
 *
 * 覆盖：
 * - 归属校验（仅任务创建者）
 * - target/status 校验（仅 vue3 + failed）
 * - 产物存在性校验（无产物 → 拒绝）
 * - 提交成功：status→completed + error 清空 + humanReview 快照
 * - 撤回：还原 failed + previousError 恢复
 * - getReviewableTasks：只返回当前用户、vue3、failed
 */

// Mock archiver 避免 ESM 错误
jest.mock('archiver', () => ({
  ZipArchive: jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    pipe: jest.fn(),
  })),
}));

// Mock backend-root / workspace.config：CJS 转换下 backend-root 的 __filename 重声明会炸套件
// （既有基线问题，2026-09-01 F6 顺带修复：套件从「加载失败」恢复为可运行）
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

import { TasksService, type Task } from './tasks.service';

// 用假定时器避免 setInterval 挂起
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// 每次构造 service 后清掉定时器，避免 Jest 挂起
const clearServiceTimers = (svc: TasksService) => {
  jest.clearAllTimers();
};

const buildService = (): TasksService => {
  // 构造器接受可选 componentModel，不传
  const svc = new TasksService();
  // 关掉 persist 副作用
  (svc as any).persist = jest.fn();
  return svc;
};

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  sessionId: 'session-1',
  componentId: 'TestComp',
  groupId: 'g1',
  status: 'failed',
  startTime: Date.now() - 1000,
  progress: [],
  progressCount: 0,
  result: null,
  error: 'RUNTIME-007: resource 404',
  buffer: [],
  target: 'vue3',
  userId: 'user-A',
  componentName: 'TestComp',
  nodeId: 'node-1',
  fileKey: 'file-1',
  panelKey: 'default-panel',
  taskType: 'component',
  ...overrides,
});

describe('TasksService 人工审核', () => {
  let svc: TasksService;

  beforeEach(() => {
    svc = buildService();
    // 清空任务 Map
    (svc as any).tasks.clear();
  });

  afterEach(() => {
    // 清掉 service 内部的 setInterval，防止 Jest 挂起
    if (svc) {
      try { (svc as any).gcTimer && clearInterval((svc as any).gcTimer); } catch {}
    }
  });

  describe('任务产物就绪状态', () => {
    it('任意中间文件数量不能替代正式组件骨架', () => {
      const task = makeTask({
        target: 'microcode',
        result: { fileCount: 12 },
      });
      (svc as any).tasks.set(task.sessionId, task);
      jest.spyOn(svc as any, 'hasTaskArtifacts').mockReturnValue(false);

      const status = svc.getTaskStatus(task.sessionId, task.userId);

      expect(status.success).toBe(true);
      expect(status.task?.artifactReady).toBe(false);
    });

    it('正式组件骨架通过后才返回 artifactReady', () => {
      const task = makeTask({ target: 'microcode' });
      (svc as any).tasks.set(task.sessionId, task);
      jest.spyOn(svc as any, 'hasTaskArtifacts').mockReturnValue(true);

      const status = svc.getTaskStatus(task.sessionId, task.userId);
      const list = svc.getAllTasks(task.userId);

      expect(status.task?.artifactReady).toBe(true);
      expect(list[0]?.artifactReady).toBe(true);
    });
  });

  describe('任务终态竞态', () => {
    it('晚到的成功结果会清除先前失败分支留下的错误', () => {
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      svc.completeTask(task.sessionId, { code: '<template></template>' });

      expect(task.status).toBe('completed');
      expect(task.error).toBeUndefined();
      expect(task.result).toMatchObject({ code: '<template></template>' });
    });

    it('晚到的失败结果不能覆盖已经完成的任务', () => {
      const task = makeTask({
        status: 'completed',
        error: undefined,
        result: { code: '<template></template>' },
      });
      (svc as any).tasks.set(task.sessionId, task);

      svc.failTask(task.sessionId, new Error('模型请求排队超时'));

      expect(task.status).toBe('completed');
      expect(task.error).toBeUndefined();
      expect(task.result).toMatchObject({ code: '<template></template>' });
    });
  });

  describe('submitHumanReview', () => {
    it('提交成功：status→completed，error 清空，humanReview 快照原值', () => {
      jest.spyOn(svc as any, 'hasVue3Artifacts').mockReturnValue(true);
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        overrideStatus: 'passed',
        reviewerName: 'Alice',
        comment: '仅样式问题，可接受',
      });

      expect(result.success).toBe(true);
      expect(task.status).toBe('completed');
      expect(task.error).toBeUndefined();
      expect(task.humanReview).toMatchObject({
        reviewedBy: 'user-A',
        reviewedByName: 'Alice',
        overrideStatus: 'passed',
        reason: '仅样式问题，可接受',
        previousStatus: 'failed',
        previousError: 'RUNTIME-007: resource 404',
        action: 'pass',
      });
      expect(typeof task.humanReview?.reviewedAt).toBe('number');
    });

    it('拒绝非任务创建者', () => {
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-B',
        overrideStatus: 'passed',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/创建者/);
    });

    it('拒绝非支持 target 的任务', () => {
      const task = makeTask({ target: 'unknown' });
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        overrideStatus: 'passed',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Vue3 组件或微码组件/);
    });

    it('拒绝非 failed 任务', () => {
      const task = makeTask({ status: 'completed' });
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        overrideStatus: 'passed',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/仅失败任务/);
    });

    it('拒绝无产物任务', () => {
      jest.spyOn(svc as any, 'hasVue3Artifacts').mockReturnValue(false);
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        overrideStatus: 'passed',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/未检测到/);
    });

    it('任务不存在时返回失败', () => {
      const result = svc.submitHumanReview({
        sessionId: 'not-exist',
        userId: 'user-A',
        overrideStatus: 'passed',
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/不存在/);
    });

    it('overrideStatus=warned 也允许通过', () => {
      jest.spyOn(svc as any, 'hasVue3Artifacts').mockReturnValue(true);
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.submitHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        overrideStatus: 'warned',
      });

      expect(result.success).toBe(true);
      expect(task.humanReview?.overrideStatus).toBe('warned');
    });
  });

  describe('revokeHumanReview', () => {
    it('撤回成功：status 还原 failed，error 恢复，action=revoke', () => {
      const task = makeTask();
      task.humanReview = {
        reviewedBy: 'user-A',
        reviewedByName: 'Alice',
        reviewedAt: Date.now(),
        overrideStatus: 'passed',
        previousStatus: 'failed',
        previousError: 'RUNTIME-007',
        action: 'pass',
      };
      task.status = 'completed';
      task.error = undefined;
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.revokeHumanReview({
        sessionId: 'session-1',
        userId: 'user-A',
        reviewerName: 'Alice',
      });

      expect(result.success).toBe(true);
      expect(task.status).toBe('failed');
      expect(task.error).toBe('RUNTIME-007');
      expect(task.humanReview?.action).toBe('revoke');
      expect(task.humanReview?.revokedBy).toBe('Alice');
      expect(typeof task.humanReview?.revokedAt).toBe('number');
    });

    it('拒绝非创建者', () => {
      const task = makeTask({ userId: 'user-A' });
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.revokeHumanReview({ sessionId: 'session-1', userId: 'user-B' });
      expect(result.success).toBe(false);
    });

    it('无审核记录时拒绝', () => {
      const task = makeTask();
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.revokeHumanReview({ sessionId: 'session-1', userId: 'user-A' });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/无人工审核/);
    });

    it('已撤回的不允许重复撤回', () => {
      const task = makeTask();
      task.humanReview = {
        reviewedBy: 'user-A',
        reviewedByName: 'A',
        reviewedAt: Date.now(),
        overrideStatus: 'passed',
        previousStatus: 'failed',
        previousError: '',
        action: 'revoke',
        revokedAt: Date.now(),
        revokedBy: 'user-A',
      };
      (svc as any).tasks.set(task.sessionId, task);

      const result = svc.revokeHumanReview({ sessionId: 'session-1', userId: 'user-A' });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/已被撤回/);
    });
  });

  describe('getReviewableTasks', () => {
    it('只返回当前用户的 vue3/microcode + failed 任务，并标注 reviewable', () => {
      // s1: user-A vue3 failed 有产物 → reviewable=true
      const t1 = makeTask({ sessionId: 's1', userId: 'user-A' });
      // s2: user-A vue3 failed 无产物 → reviewable=false
      const t2 = makeTask({ sessionId: 's2', userId: 'user-A' });
      // s3: user-B vue3 failed → 不归当前用户
      const t3 = makeTask({ sessionId: 's3', userId: 'user-B' });
      // s4: user-A microcode failed 有产物 → reviewable=true
      const t4 = makeTask({ sessionId: 's4', userId: 'user-A', target: 'microcode' });
      // s5: user-A vue3 completed → 非 failed
      const t5 = makeTask({ sessionId: 's5', userId: 'user-A', status: 'completed' });

      [t1, t2, t3, t4, t5].forEach((t) => (svc as any).tasks.set(t.sessionId, t));

      // mock hasVue3Artifacts / hasTaskArtifacts：s1→true, s4→true, 其余→false
      jest.spyOn(svc as any, 'hasTaskArtifacts').mockImplementation((task: Task) => task.sessionId === 's1' || task.sessionId === 's4');

      const list = svc.getReviewableTasks('user-A');
      // 应含 user-A + (vue3|microcode) + failed 的任务（s1、s2、s4）
      expect(list.map((t) => t.sessionId).sort()).toEqual(['s1', 's2', 's4']);
      // reviewable 标注
      const s1 = list.find((t) => t.sessionId === 's1')!;
      const s2 = list.find((t) => t.sessionId === 's2')!;
      const s4 = list.find((t) => t.sessionId === 's4')!;
      expect(s1.reviewable).toBe(true);
      expect(s2.reviewable).toBe(false);
      expect(s4.reviewable).toBe(true);
    });
  });
});

describe('F6：重启扫描不覆盖已有终态 error（recoverZombieTasks）', () => {
  let svc: TasksService;

  beforeEach(() => {
    svc = buildService();
    (svc as any).tasks.clear();
    // 断点恢复一律失败（走僵尸标记路径）
    jest.spyOn(svc as any, '_tryRecoverTask').mockResolvedValue(false);
  });

  afterEach(() => {
    if (svc) {
      try { (svc as any).gcTimer && clearInterval((svc as any).gcTimer); } catch {}
    }
  });

  it('running + 已有终态 error（L0-B 质量门禁失败）→ status 置 failed 但 error/endTime 保留', async () => {
    const realError = '生成代码未通过质量检查，系统已自动重试修正';
    const realEnd = 1788252344399;
    const t = makeTask({
      sessionId: 's-f6-1',
      status: 'running',
      error: realError,
      endTime: realEnd,
    });
    (svc as any).tasks.set(t.sessionId, t);

    await (svc as any).recoverZombieTasks();

    expect(t.status).toBe('failed');
    // 🛡️ 核心断言：真实根因不被「服务重启导致任务中断」覆写（A/B 分类不污染）
    expect(t.error).toBe(realError);
    expect(t.endTime).toBe(realEnd);
  });

  it('running + 无 error（真·运行中被重启）→ 填通用中断文案', async () => {
    const t = makeTask({
      sessionId: 's-f6-2',
      status: 'running',
      error: undefined,
      endTime: undefined,
    });
    (svc as any).tasks.set(t.sessionId, t);

    await (svc as any).recoverZombieTasks();

    expect(t.status).toBe('failed');
    expect(t.error).toBe('服务重启导致任务中断，请重新发起生成');
    expect(t.endTime).toBeGreaterThan(0);
  });

  it('paused + 已有终态 error → 同样保留', async () => {
    const realError = 'L0-B 代码结构校验未通过且重试耗尽，禁止发布组件：CODE-011';
    const t = makeTask({
      sessionId: 's-f6-3',
      status: 'paused',
      error: realError,
      endTime: 1788252344399,
    });
    (svc as any).tasks.set(t.sessionId, t);

    await (svc as any).recoverZombieTasks();

    expect(t.status).toBe('failed');
    expect(t.error).toBe(realError);
  });

  it('failed/completed 状态不进僵尸扫描（不受影响）', async () => {
    const t = makeTask({
      sessionId: 's-f6-4',
      status: 'completed',
      error: undefined,
    });
    (svc as any).tasks.set(t.sessionId, t);

    await (svc as any).recoverZombieTasks();

    expect(t.status).toBe('completed');
    expect(t.error).toBeUndefined();
  });
});
