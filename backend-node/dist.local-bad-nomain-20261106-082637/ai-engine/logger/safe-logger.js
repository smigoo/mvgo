/**
 * 🔒 安全日志器工厂（统一的 logger 兜底入口）
 *
 * ⚠️ 本模块**刻意保持零依赖**（不 import 任何路径/logger 实现）。
 * 原因：`logger.js` 依赖 `src/config/backend-root.js`，而后者使用 `import.meta.url`；
 * jest 未启用 `--experimental-vm-modules`（CJS 模式）时，任何传递依赖 backend-root 的模块
 * 都会导致整个测试套件加载失败。把 safeLogger 独立出来，可以让下游模块「只拿兜底能力」
 * 而不被拖进 backend-root 依赖链。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * `src/ai-engine/roles/microcode/` 下约 28 个函数以 `options.logger` 或位参形式接收日志器。
 * 调用方漏传时 logger 为 undefined，函数体内 `logger.error(...)` 会抛出
 * `Cannot read properties of undefined (reading 'error')`。
 *
 * 真正致命的是：这类调用大量位于 **catch 块内**——抛出的 TypeError 会**覆盖**真实错误，
 * 使 `throw error` 永远执行不到，原始根因被永久丢弃（错误掩盖 / error masking）。
 * 实测表现为「LLM 明明成功返回了 861 tokens，下一毫秒却报 ❌ 失败」，
 * 日志里只剩一句无信息量的 TypeError。
 *
 * ── 用法 ────────────────────────────────────────────────────────
 * 在**函数入口**归一化一次，函数体内所有 logger.xxx 调用即安全（无需改动任何调用点）：
 *
 *   export function foo(files, options = {}) {
 *     const logger = safeLogger(options.logger);
 *     ... // 下游 logger.info/warn/error/debug 保持原样
 *   }
 *
 * ── 语义 ────────────────────────────────────────────────────────
 *   - 传入完整日志器        → 原样返回（identity，行为零变化）
 *   - 传入「部分日志器」    → 补齐缺失方法为 no-op，避免 `logger.error is not a function`
 *   - 传入 undefined/null/
 *     非对象               → 返回全 no-op shim，降级为「不记日志」而非「崩溃」
 *
 * @param {Object} [logger] - 可能为 undefined 的日志器
 * @returns {{info: Function, warn: Function, error: Function, debug: Function}} 恒可用的日志器
 */
export function safeLogger(logger) {
  const noop = () => {};
  if (!logger || typeof logger !== 'object') {
    return { info: noop, warn: noop, error: noop, debug: noop };
  }
  // 完整日志器（绝大多数场景）：原样返回，保持 identity，不引入任何行为变化
  if (
    typeof logger.info === 'function' &&
    typeof logger.warn === 'function' &&
    typeof logger.error === 'function' &&
    typeof logger.debug === 'function'
  ) {
    return logger;
  }
  // 部分日志器：缺哪个补哪个（bind 保留 this，兼容 class 形态日志器）
  const pick = (name) =>
    typeof logger[name] === 'function' ? logger[name].bind(logger) : noop;
  return {
    info: pick('info'),
    warn: pick('warn'),
    error: pick('error'),
    debug: pick('debug'),
  };
}

export default safeLogger;
