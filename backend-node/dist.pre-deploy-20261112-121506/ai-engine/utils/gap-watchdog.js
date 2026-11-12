/**
 * 🛡️ 分块间隙看门狗（2026-11-05，mc-max-1793849505022-7cb7125d 实锤）
 *
 * 症状：微码生成在「chunk N 完成 → chunk N+1 模型请求发起」之间的某个 await 挂死，
 * 无日志、无进度、无异常，任务永远 running（该区间没有任何超时罩着——chunk 级
 * 动态超时只罩模型请求本身）。
 *
 * 机制：不活动看门狗。日志/进度事件即「喂狗」；超过阈值无任何活动，则通过
 * Promise.race 在外层强制 reject（挂死的 await 链无法被注入 rejection，race 可以），
 * 错误信息携带「最后活动」快照用于定位挂点区间。
 *
 * 阈值安全性：单次模型尝试的合法静默上限 = 分块动态超时最大值 × 超时重试倍率
 *   = 300s × 1.5(complex) × 1.3(token) × 1.5(retry) ≈ 877s；每次尝试/重试边界必有
 *   日志或进度事件喂狗 ⇒ 默认阈值 960s（16min）不会误杀慢请求。
 * 环境变量：MC_ENGINEER_GAP_WATCHDOG_MS（下限 5min）。
 */

const DEFAULT_TIMEOUT_MS = 960_000;
const MIN_TIMEOUT_MS = 5 * 60_000;

export function resolveGapWatchdogTimeoutMs(env = process.env) {
  const parsed = parseInt(String(env?.MC_ENGINEER_GAP_WATCHDOG_MS || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, parsed);
}

/**
 * 创建不活动看门狗。
 * @param {object} opts
 * @param {string} opts.label - 诊断标识（如 `microcode-engineer:<componentName>`）
 * @param {number} [opts.timeoutMs] - 不活动阈值（默认 16min；默认钳到 ≥5min 防误配误杀）
 * @param {boolean} [opts.clamp=true] - 阈值下限钳制开关；仅单测允许关闭
 * @param {(err: Error) => void} [opts.onFire] - 触发时的旁路回调（如推 SSE 错误事件）
 * @returns {{ promise: Promise<never>, touch: (msg?: string) => void, stop: () => void, snapshot: () => object }}
 */
export function createGapWatchdog({ label, timeoutMs, clamp = true, onFire } = {}) {
  const effectiveTimeout = clamp
    ? Math.max(MIN_TIMEOUT_MS, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS)
    : Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;
  let last = { at: Date.now(), msg: 'watchdog 启动' };
  let timer = null;
  let fired = false;
  let rejectFn = null;

  const promise = new Promise((_, reject) => {
    rejectFn = reject;
  });
  // 防 unhandled rejection：race 消费方正常 await；若调用方忘了 race，也不至于崩进程
  promise.catch(() => {});

  const fire = () => {
    if (fired) return;
    fired = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const silentForMs = Date.now() - last.at;
    const err = new Error(
      [
        `[GAP-WATCHDOG] ${label || 'generation'} 失活超时：${Math.round(silentForMs / 1000)}s 无任何日志/进度活动（阈值 ${Math.round(effectiveTimeout / 1000)}s）。`,
        `最后活动：${last.msg} @ ${new Date(last.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}。`,
        `疑似挂点：分块间隙 await（分块循环后装配/校验段，或分块间预检段）——该区间无超时保护。`,
        `本错误由外层 race 注入；真正挂起的 await 链仍在泄漏挂起（不可注入 rejection），结合「最后活动」定位代码区间。`,
      ].join(''),
    );
    err.name = 'GapWatchdogError';
    err.gapWatchdog = { label, silentForMs, timeoutMs: effectiveTimeout, lastActivity: { ...last } };
    try {
      onFire?.(err);
    } catch {
      /* 旁路回调失败不影响主错误 */
    }
    rejectFn(err);
  };

  const arm = () => {
    if (fired) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, effectiveTimeout);
  };
  arm();

  return {
    promise,
    touch(msg) {
      if (fired) return;
      last = { at: Date.now(), msg: String(msg ?? 'activity').slice(0, 200) };
      arm();
    },
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    snapshot() {
      return { label, timeoutMs: effectiveTimeout, lastActivity: { ...last }, silentForMs: Date.now() - last.at, fired };
    },
  };
}

/**
 * 便捷包装：onProgress 透传 + 喂狗。
 * @param {(evt: any) => void} [baseOnProgress]
 * @param {{ touch: (msg?: string) => void }} watchdog
 */
export function wrapOnProgressWithTouch(baseOnProgress, watchdog) {
  if (typeof baseOnProgress !== 'function') return baseOnProgress ?? null;
  return (evt) => {
    try {
      watchdog.touch(evt?.message || evt?.stage || evt?.type || 'progress');
    } catch {
      /* 喂狗失败不影响业务进度 */
    }
    return baseOnProgress(evt);
  };
}
