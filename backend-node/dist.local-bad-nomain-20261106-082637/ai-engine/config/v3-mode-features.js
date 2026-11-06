/**
 * v3 模式功能路由配置（单一真相源）
 *
 * 把 `isFeatureEnabled(v3Mode, feature)` 从 mc-component-graph-phase2.js /
 * mc-component-graph-vue3.js 的重复内联收敛到此处，两图文件共享同一份定义。
 *
 * v3Mode 取值：
 *   - 'off'      关闭所有 L0 校验与精修链路（最小链路，仅视觉解析+并行分析）
 *   - 'generate' 代码写完即停（L0 校验开启，但不进入精修/对抗/质量门禁）
 *   - 'minimal'  轻量链路（L0 + 传统精修，跳过并行精修/L1/L2）
 *   - 'full'     完整自动链路（全部功能启用）
 *
 * 新增 feature 时只需在此处加 case，两图文件自动生效。
 */

/**
 * 判断当前 v3Mode 是否启用某功能
 * @param {string} v3Mode - 'off' | 'generate' | 'minimal' | 'full'
 * @param {string} feature - 功能名
 * @returns {boolean}
 */
export function isFeatureEnabled(v3Mode, feature) {
  switch (feature) {
    // ── L0 校验层 ──
    case 'l0-preview':       return v3Mode !== 'off' && v3Mode !== 'generate'   // minimal+full
    case 'l0-code':          return v3Mode !== 'off'                            // minimal+full+generate(隐式)
    case 'style-standard':   return v3Mode !== 'off'                            // minimal+full+generate(隐式)

    // ── L1 精修层 ──
    case 'parallel-refine':  return v3Mode === 'full'                           // 仅 full
    case 'l1-feedback':      return v3Mode === 'full'                           // 仅 full

    // ── L2 路由层 ──
    case 'l2-routing':       return v3Mode === 'full'                           // 仅 full
    case 'violation-detect': return v3Mode === 'full'                           // 仅 full

    // ── 默认：仅 full 启用未列出的功能 ──
    default:
      return v3Mode === 'full'
  }
}

/**
 * 从 options / env / state 解析 v3Mode（两图文件共用）
 * @param {Object} options - createPhase2Graph / createVue3Graph 的入参
 * @param {Object} [logger] - 可选 logger
 * @returns {{ mode: string, config: Object }}
 */
export function resolveV3Mode(options = {}, logger) {
  const envMode = process.env.V3_MODE || 'generate'
  const paramMode = options.v3Mode || options.config?.v3Mode || ''
  const stateOverride = options.state?.v3ModeOverride

  let mode = stateOverride || paramMode || envMode
  if (!['off', 'minimal', 'full', 'generate'].includes(mode)) {
    logger?.warn?.(`未知 v3Mode "${mode}"，回退到 generate`)
    mode = 'generate'
  }

  return {
    mode,
    config: {
      l0MaxRetry: parseInt(process.env.L0_MAX_RETRY || '2'),
      l0BypassAfterFailures: parseInt(process.env.L0_BYPASS_AFTER_FAILURES || '3'),
      violationMaxCount: parseInt(process.env.VIOLATION_MAX_COUNT || '2'),
    },
  }
}
