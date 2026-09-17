import { TaskQueueService } from './task-queue.service';

/**
 * per-user 并发槽位回归测试。
 *
 * 背景：原先 TaskQueueService 是 @Global() 单例 + 单 runningTasks Map，
 * MAX_CONCURRENT 个槽位被全进程共享 —— 一个用户占满，其他所有人都只能排队。
 * 需求改为「每个用户独享 MAX_CONCURRENT 个槽位」，并加一道全局天花板保护。
 */
describe('TaskQueueService per-user 并发槽位', () => {
  let q: TaskQueueService;
  let MAX: number;
  let GLOBAL: number;

  const mkTask = (sessionId: string, userId: string): any => ({
    sessionId,
    componentId: sessionId,
    userId,
    componentName: `c-${sessionId}`,
    nodeId: 'n1',
    fileKey: 'f1',
    panelKey: 'default-panel',
  });

  beforeEach(() => {
    q = new TaskQueueService({} as any);
    MAX = q.MAX_CONCURRENT;
    GLOBAL = q.GLOBAL_MAX_CONCURRENT;
  });

  afterEach(() => {
    q.onModuleDestroy();
  });

  it('每个用户有独立的并发额度：A 占满后不影响 B', () => {
    for (let i = 0; i < MAX; i++) q.registerRunning(`a${i}`, 'userA');

    expect(q.getRunningCount('userA')).toBe(MAX);
    expect(q.getAvailableSlots('userA')).toBe(0);

    // B 完全不受 A 影响（尚未触及全局天花板）
    if (MAX < GLOBAL) {
      expect(q.getRunningCount('userB')).toBe(0);
      expect(q.getAvailableSlots('userB')).toBe(MAX);
    }
  });

  it('同一用户超出自己的额度后必须排队', () => {
    for (let i = 0; i < MAX; i++) q.registerRunning(`a${i}`, 'userA');

    expect(q.getAvailableSlots('userA')).toBe(0);
    // 第 MAX+1 个任务只能入队
    expect(q.getAvailableSlots('userA') <= 0).toBe(true);
  });

  it('全局天花板生效：总并发不会被 N 个用户放大到无限', () => {
    // 让全局跑满（每个用户只占 1 个，避免触发 per-user 上限）
    let n = 0;
    while (q.getRunningCount() < GLOBAL && n < GLOBAL * 2) {
      q.registerRunning(`g${n}`, `u${n}`);
      n++;
    }
    expect(q.getRunningCount()).toBe(GLOBAL);

    // 新用户即使自己一个都没跑，也拿不到槽位
    expect(q.getAvailableSlots('brandNewUser')).toBe(0);
  });

  it('释放后该用户计数回落，且归属记录被清理（不泄漏）', async () => {
    q.registerRunning('s1', 'userA');
    expect(q.getRunningCount('userA')).toBe(1);

    await q.markTaskCompleted('s1');
    expect(q.getRunningCount('userA')).toBe(0);
    expect(q.isRunning('s1')).toBe(false);

    // 释放后可再次占满，证明 owner 记录没有残留导致计数只增不减
    for (let i = 0; i < MAX; i++) q.registerRunning(`r${i}`, 'userA');
    expect(q.getRunningCount('userA')).toBe(MAX);
  });

  it('失败路径同样释放该用户的槽位', async () => {
    q.registerRunning('s2', 'userA');
    await q.markTaskFailed('s2');
    expect(q.getRunningCount('userA')).toBe(0);
  });

  it('调度时某用户槽满不阻塞其他用户的排队任务', async () => {
    // userA 占满自己的额度
    for (let i = 0; i < MAX; i++) q.registerRunning(`a${i}`, 'userA');

    const ran: string[] = [];
    // A 的第 MAX+1 个任务 + B 的任务同时排队，A 在前（先入队）
    await q.enqueue(mkTask('aQueue', 'userA'), 'concurrency_full', async () => {
      ran.push('aQueue');
    });
    await q.enqueue(mkTask('bQueue', 'userB'), 'concurrency_full', async () => {
      ran.push('bQueue');
    });

    await q.scheduleNextWaiting();

    // 关键回归点：A 槽满时 B 必须仍能被调度（旧实现会 break，把 B 一起堵死）
    expect(ran).toContain('bQueue');
    expect(ran).not.toContain('aQueue');
    // A 的任务仍在队列中等待
    expect(q.getQueueStatus('aQueue').inQueue).toBe(true);
  });

  it('无 userId（匿名）退化为全局口径，不崩溃', () => {
    q.registerRunning('anon1');
    expect(q.getRunningCount()).toBe(1);
    expect(q.getRunningCount('anyUser')).toBe(0); // 匿名任务不计入任何用户桶
    expect(q.getAvailableSlots('anyUser')).toBe(MAX);
  });

  /**
   * 伪成功回归（2026-09-17）。
   * 背景：mc-max-1789620070991-4f0b5b54 卡在 queued，前端点「继续生成」提示「已触发」，
   * 但任务实际没跑。根因是 startQueuedTask 调用 scheduleSpecificWaiting 后无条件返回
   * success:true —— 即使执行器缺失/抛错、任务被退回队列，也谎报成功。
   * 下面三条钉死「必须如实返回成败」。
   */
  describe('startQueuedTask 如实返回调度结果', () => {
    it('无执行器 → success=false，且不谎报已触发', async () => {
      // 入队但不给 executeFn（模拟进程重启后闭包丢失、restoreExecutor 又未接管）
      await q.enqueue(mkTask('noExec', 'userA'), 'concurrency_full');
      const r = await q.startQueuedTask('noExec', 'userA');
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/执行上下文|无法/);
      // 任务仍留在队列，等待真正可恢复时再处理
      expect(q.getQueueStatus('noExec').inQueue).toBe(true);
    });

    it('执行器抛错 → success=false，任务退回队列', async () => {
      await q.enqueue(mkTask('boom', 'userA'), 'concurrency_full', async () => {
        throw new Error('executor exploded');
      });
      const r = await q.startQueuedTask('boom', 'userA');
      expect(r.success).toBe(false);
      expect(q.getQueueStatus('boom').inQueue).toBe(true);
      expect(q.isRunning('boom')).toBe(false);
    });

    it('执行器正常 → success=true', async () => {
      let ran = false;
      // 直接种入等待队列，绕开 enqueue 的自动调度
      //（本用例只验证 startQueuedTask 的返回值语义，不验证入队调度）
      (q as any).waitingQueue.set('ok', {
        ...mkTask('ok', 'userA'),
        status: 'queued',
        enqueuedAt: Date.now(),
        executeFn: async () => {
          ran = true;
        },
      });
      const r = await q.startQueuedTask('ok', 'userA');
      expect(r.success).toBe(true);
      expect(ran).toBe(true);
    });

    it('任务不在队列 → success=false', async () => {
      const r = await q.startQueuedTask('ghost-task', 'userA');
      expect(r.success).toBe(false);
      expect(r.message).toMatch(/不在等待队列/);
    });
  });

  /**
   * 治本（方案 A）回归（2026-09-17）。
   * 背景：重启后恢复 queued 任务，若所有 restore executor 都因脏数据（fileKey/nodeId 为空等）
   * 返回 false，队列此前只释放槽位、不更新任务状态 → 任务继续以 queued 残留在磁盘，
   * 下次重启又恢复、又失败、又留孤儿。
   * 现在队列通过 onTaskFailed 回调把失败上报给 TasksService，由其 finalize + 持久化。
   */
  describe('重启恢复失败 → onTaskFailed 上报', () => {
    it('restore executor 因 fileKey/nodeId 为空返回 false → 触发 onTaskFailed（含 fileKey 提示）', async () => {
      const failed: Array<{ sessionId: string; error: string }> = [];
      q.onTaskFailed((sessionId, error) => failed.push({ sessionId, error }));

      // 注册一个「像 phase2/vue3 那样因脏数据拒绝」的执行器
      q.registerRestoreExecutor(async (task: any) => {
        if (!task.fileKey || !task.nodeId) return false;
        return true;
      });

      // fileKey/nodeId 为空的脏数据任务
      const dirty: any = {
        ...mkTask('dirty', 'userA'),
        fileKey: '',
        nodeId: '',
        status: 'queued',
        enqueuedAt: Date.now(),
      };
      await q.restoreQueuedTask(dirty);
      // 恢复是异步调度（restoreQueuedTask 内部 await scheduleNextWaiting），等待微任务
      await new Promise((r) => setImmediate(r));

      expect(failed.length).toBe(1);
      expect(failed[0].sessionId).toBe('dirty');
      expect(failed[0].error).toMatch(/fileKey\/nodeId/);
      // 槽位必须已释放，不允许幽灵占用
      expect(q.isRunning('dirty')).toBe(false);
    });

    it('restore executor 全部未处理（无 fileKey 提示）→ 也触发 onTaskFailed', async () => {
      const failed: Array<{ sessionId: string; error: string }> = [];
      q.onTaskFailed((sessionId, error) => failed.push({ sessionId, error }));

      q.registerRestoreExecutor(async () => false); // 谁都不接管

      const orphan: any = {
        ...mkTask('orphan', 'userA'),
        status: 'queued',
        enqueuedAt: Date.now(),
      };
      await q.restoreQueuedTask(orphan);
      await new Promise((r) => setImmediate(r));

      expect(failed.length).toBe(1);
      expect(failed[0].sessionId).toBe('orphan');
      expect(failed[0].error).toMatch(/恢复执行器/);
      expect(q.isRunning('orphan')).toBe(false);
    });

    it('恢复成功的任务不触发 onTaskFailed', async () => {
      const failed: Array<{ sessionId: string; error: string }> = [];
      q.onTaskFailed((sessionId, error) => failed.push({ sessionId, error }));

      q.registerRestoreExecutor(async (task: any) => Boolean(task.fileKey && task.nodeId));

      const good: any = {
        ...mkTask('good', 'userA'),
        status: 'queued',
        enqueuedAt: Date.now(),
      };
      await q.restoreQueuedTask(good);
      await new Promise((r) => setImmediate(r));

      expect(failed.length).toBe(0);
    });
  });
});
