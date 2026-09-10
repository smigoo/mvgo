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
});
