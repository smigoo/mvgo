/**
 * 分块间隙看门狗判据（2026-11-05，mc-max-1793849505022-7cb7125d 实锤）
 *
 * 背景：微码生成「chunk N 完成 → chunk N+1」之间的 await 无超时保护，挂死即任务
 * 永远 running。看门狗用 Promise.race 在外层强制失败。
 *
 * 判据（全部围绕生产事故语义）：
 * 1. 静默超阈值 → race 以 GapWatchdogError reject，错误含「最后活动」快照
 * 2. 持续喂狗（onProgress 活动）→ 不误杀，核心 promise 正常完成
 * 3. 阈值下限钳制（5min）与环境变量覆盖
 * 4. wrapOnProgressWithTouch：透传事件 + 喂狗 + 喂狗异常不阻断业务
 * 5. stop() 后不再触发
 */
import { createGapWatchdog, resolveGapWatchdogTimeoutMs, wrapOnProgressWithTouch } from '../gap-watchdog.js';

const TINY = 120; // 测试用极短阈值（绕过 5min 下限：直接传 timeoutMs）

describe('GapWatchdog 分块间隙看门狗', () => {
  it('静默超阈值 → race 以 GapWatchdogError reject，含最后活动快照', async () => {
    const wd = createGapWatchdog({ label: 'microcode-engineer:test-1', timeoutMs: TINY, clamp: false });
    wd.touch('chunk 7/8 业务样式 写盘完成');
    const hung = new Promise(() => {}); // 模拟挂死的 await 链（永不 settle）
    await expect(
      Promise.race([hung, wd.promise]),
    ).rejects.toThrow(/GAP-WATCHDOG[\s\S]*业务样式[\s\S]*挂点/);
    const snap = wd.snapshot();
    expect(snap.fired).toBe(true);
    expect(snap.lastActivity.msg).toContain('业务样式');
  });

  it('持续喂狗 → 不误杀，核心 promise 正常完成', async () => {
    const wd = createGapWatchdog({ label: 'test-2', timeoutMs: TINY, clamp: false });
    const slowButAlive = (async () => {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, TINY / 3));
        wd.touch(`progress #${i}`);
      }
      return 'done';
    })();
    await expect(Promise.race([slowButAlive, wd.promise])).resolves.toBe('done');
    expect(wd.snapshot().fired).toBe(false);
    wd.stop();
  });

  it('stop() 后不再触发', async () => {
    const wd = createGapWatchdog({ label: 'test-3', timeoutMs: TINY, clamp: false });
    wd.stop();
    let rejected = false;
    wd.promise.catch(() => { rejected = true; });
    await new Promise((r) => setTimeout(r, TINY * 3));
    expect(rejected).toBe(false);
  });

  it('阈值解析：未设用 960s 默认；设了取 max(设置值, 5min)', () => {
    expect(resolveGapWatchdogTimeoutMs({})).toBe(960_000);
    expect(resolveGapWatchdogTimeoutMs({ MC_ENGINEER_GAP_WATCHDOG_MS: '1200000' })).toBe(1_200_000);
    // 低于 5min 的设置被钳到 5min（防误配误杀慢模型）
    expect(resolveGapWatchdogTimeoutMs({ MC_ENGINEER_GAP_WATCHDOG_MS: '1000' })).toBe(300_000);
    expect(resolveGapWatchdogTimeoutMs({ MC_ENGINEER_GAP_WATCHDOG_MS: 'garbage' })).toBe(960_000);
  });

  it('wrapOnProgressWithTouch：透传事件并喂狗；喂狗抛异常不阻断业务回调', async () => {
    const seen: any[] = [];
    const wd = {
      touch: (msg?: string) => {
        seen.push(msg);
        if (msg === 'boom') throw new Error('touch failed');
      },
    } as any;
    const base = (evt: any) => seen.push(`base:${evt.stage}`);
    const wrapped = wrapOnProgressWithTouch(base, wd);
    wrapped({ stage: 'chunk-start', message: '🚀 开始生成【业务样式】' });
    expect(seen).toContain('🚀 开始生成【业务样式】');
    expect(seen).toContain('base:chunk-start');
    // 喂狗抛异常 → 业务回调仍被执行
    wrapped({ stage: 'boom', message: 'boom' });
    expect(seen).toContain('base:boom');
    // onProgress 为空 → 返回 null（execute 外壳按 null 透传）
    expect(wrapOnProgressWithTouch(null, wd)).toBeNull();
  });

  it('onFire 旁路回调在触发时收到 err（供 SSE 推送）', async () => {
    const fires: any[] = [];
    const wd = createGapWatchdog({
      label: 'test-6',
      timeoutMs: TINY,
      clamp: false,
      onFire: (err) => fires.push(err),
    });
    await expect(Promise.race([new Promise(() => {}), wd.promise])).rejects.toThrow();
    expect(fires).toHaveLength(1);
    expect(fires[0].name).toBe('GapWatchdogError');
    expect(fires[0].gapWatchdog.silentForMs).toBeGreaterThanOrEqual(TINY);
  });
});
