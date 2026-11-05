/**
 * 运行时错误分类器（2026-09-10 立项：运行时 JS 错误 fail-closed 统一治理）
 *
 * 纯函数、零依赖、**无 import.meta**，便于 jest 单测。
 * 从 screenshot-renderer.js 抽出，供其 import 使用；同时可被 graph 层 / 其他门禁复用。
 *
 * 背景（见 docs/runtime-js-error-governance-2026-09-10.md）：
 *   generate 模式此前把一切 RUNTIME BLOCK 降级 warning 照常发布 → 坏产物当成功任务交付。
 *   仅「确定性运行时缺失」（产物自身缺陷、重试/降级无法自愈）才升级硬 BLOCK。
 *   既有白名单过窄（缺 TDZ 文本）且未消费结构化信号（errorType='vue-render'）→ 反复漏网。
 */

/**
 * 确定性运行时缺失的错误文本模式。
 * 白名单式精确匹配（宁缺毋滥，避免误伤环境性/资源类错误）。
 */
export const DETERMINISTIC_MISSING_PATTERNS = [
  /is not defined/i, // ReferenceError: echarts is not defined（import 缺失/注释吞噬）
  /Cannot read properties of undefined/i,
  /Cannot read properties of null/i,
  /Cannot set properties of undefined/i,
  /Cannot set properties of null/i,
  /ReferenceError/i, // 未捕获裸 ReferenceError（上一条的兜底）
  // 2026-09-10 扩展：引用型 / 赋值型 TDZ 的运行时文本
  // （env 样本 mc-max-1789019718053-fb0a0de7：「watch(activeTab) 在 const activeTab 前」
  //   → Cannot access 'activeTab' before initialization）。此前缺此条 → 被降级发布。
  /Cannot access .*? before initialization/i,
  // Vue 运行时常见确定性错误
  /Maximum recursive updates exceeded/i, // 响应式死循环
  /\[Vue warn\].*?\b(?:Failed to resolve|Invalid|already been declared)/i,
]

/**
 * 结构化确定性信号：RUNTIME-004 的 evidence.errorType 由预览页写入
 * （frontend/src/views/preview/index.vue:341-343：组件渲染崩溃 → errorType='vue-render'），
 * 与「环境不可达 / 网络失败」明确区分。命中即视为产物自身缺陷。
 */
export const DETERMINISTIC_RENDER_ERROR_TYPES = new Set(['vue-render'])

/**
 * 判定运行时门禁失败是否属「确定性运行时缺失」（产物自身缺陷，fail-closed 应当硬 BLOCK）。
 * @param {{issues?: Array}} runtimeGate
 * @returns {boolean}
 */
export function hasDeterministicRuntimeMissing(runtimeGate) {
  const issues = Array.isArray(runtimeGate?.issues) ? runtimeGate.issues : []
  for (const issue of issues) {
    // 只对页面异常 / 控制台错误 / 渲染错误类取证
    // （RUNTIME-004 render-error / RUNTIME-009 pageerror / RUNTIME-010 console）
    if (!/^(RUNTIME-004|RUNTIME-009|RUNTIME-010)$/.test(issue?.id || '')) continue
    const evidence = issue?.evidence
    // 结构化信号优先：RUNTIME-004 明确是 Vue 渲染崩溃（errorType='vue-render'）→ 确定性产物缺陷
    if (issue.id === 'RUNTIME-004' && DETERMINISTIC_RENDER_ERROR_TYPES.has(evidence?.errorType)) {
      return true
    }
    const texts = []
    if (Array.isArray(evidence?.errors)) {
      for (const entry of evidence.errors) {
        texts.push(`${entry?.message || ''} ${entry?.text || ''} ${entry?.stack || ''}`)
      }
    }
    if (evidence?.renderError) texts.push(`renderError: ${evidence.renderError}`)
    if (evidence?.loadError) texts.push(`loadError: ${evidence.loadError}`)
    if (evidence?.error) texts.push(`error: ${String(evidence.error)}`)
    for (const text of texts) {
      if (DETERMINISTIC_MISSING_PATTERNS.some((re) => re.test(text))) return true
    }
  }
  return false
}
