/**
 * 🛡️ PATCH-CHAIN-ERROR 哨兵（2026-11-03 · 管线根治方案 v2 S0.2，A 档）
 *
 * 背景：后处理链 catch 全仓 130 处（pre-write-self-healing 28 / microcode-engineer 77 /
 * vue3-engineer 25），现状是 fail-open warn 留痕但**不聚合**——历史上 `input is not defined`
 * 族结构性错误被吞后只能逐点修复（mc :6908/:7154/:8479/:8721、vue3 :1233 实锤），无统一防线。
 *
 * 本模块是统一观测出口（纪律：保持 fail-open、不动 try 边界、不改返回值、禁止改 fail-closed）：
 * - 结构性错误（ReferenceError/TypeError/SyntaxError，≠ 业务分支）⇒ 打 `PATCH-CHAIN-ERROR`
 *   计数行（已登记总纲 §5 grep 清单）+ 可选 counter 自增（供每任务聚合）；
 * - 业务分支异常**不计**（返回 0，原有 warn 不变）。
 *
 * 纯函数、无 import.meta、无副作用（除 logger 调用）⇒ jest CJS 环境可测。
 */

const STRUCTURAL_ERROR_NAMES = new Set(['ReferenceError', 'TypeError', 'SyntaxError']);

/**
 * 判定是否为结构性错误（链损坏信号），区别于业务分支异常。
 * @param {any} err
 * @returns {boolean}
 */
export function isStructuralChainError(err) {
  if (!err || typeof err !== 'object') return false;
  const name = err.name || err.constructor?.name;
  return STRUCTURAL_ERROR_NAMES.has(name);
}

/**
 * catch 块内追加调用（每处一行，由 2026-11-03 codemod 全量接入）。
 * @param {any} err catch 到的异常
 * @param {{logger?: any, pass?: string, file?: string, counter?: object}} [opts]
 *   - pass：`<所在函数>:<catch 起始行>`，用于定位阶段
 *   - counter：传入对象则自增 `counter.patchChainErrors`（自愈链传 summary）
 * @returns {number} 1 = 已计为结构性错误；0 = 业务分支（未计）
 */
export function reportPatchChainError(err, opts = {}) {
  if (!isStructuralChainError(err)) return 0;
  const { logger, pass, file, counter } = opts || {};
  if (counter && typeof counter === 'object') {
    counter.patchChainErrors = (counter.patchChainErrors || 0) + 1;
  }
  try {
    logger?.warn?.(
      '🛡️ PATCH-CHAIN-ERROR：后处理链捕获结构性错误（fail-open 保持，须定位修复）',
      {
        pass: pass || null,
        file: file || null,
        errorName: err?.name || null,
        error: err?.message || String(err),
      },
    );
  } catch (_) {
    // 哨兵自身绝不抛出（fail-open 纪律）
  }
  return 1;
}

export default reportPatchChainError;
