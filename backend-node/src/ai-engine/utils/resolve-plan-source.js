/**
 * resolve-plan-source.js
 *
 * 🛡️ G04（2026-11-14 · 视觉真值根治改造 R1）：**判据层 plan 事实源的单一解析器**。
 *
 * 背景（12:34 失败件 `2ef1e1e8` 对账实锤）：
 *   - `generation-context-assembler.js#normalizeComponentPlan` 产出的 `componentPlan` 是
 *     **有损投影**：`body` → `declaredContent`，白名单剥掉 25 类细粒度真值
 *     （charts/series/seriesColors/legend/axes/styles/resourceFile/…），实测逐段保留率 27.9%~46.5%。
 *   - 但 `figma-section-heights.js#resolveSubComponentPlan`、`prompt-builder.js#resolvePlanSections`、
 *     `phase2:3907` 等 13+ 处**判据**却把该投影当优先事实源；同时 `execute:8457` 漏传
 *     `subComponentPlan`，使 `resolveIsoPlanSections` 的「全保真原形」fail-open 回退到投影
 *     ⇒ 刀 66-P0 的同构判据被架空，同一轮生成里出现「全保真 / 投影」双轨口径。
 *
 * G02 决策 1（用户拍板）：`subComponentPlan`（planner 全保真原形）= 唯一**判据**事实源；
 *   `generationInput.componentPlan` 保留兼容旧断点、标记 deprecated，只作 LLM 摘要 / 预算裁剪。
 *
 * 本模块职责（只做解析，不改任何 plan 对象）：
 *   1. 判据一律优先 full plan；仅当 full plan **没有有效段**时才回退投影口（断点续跑 /
 *      reuseCache 场景），且 `source` / `degraded` 可观测 —— 兼容不是偷偷降级。
 *   2. 消费者禁止再各写一份 `genPlan || subPlan`；统一调用本模块，杜绝第 N 次口径漂移。
 *   3. 入参结构不变；`source`/`degraded` 是**纯附加返回值**，不写入 plan，下游剥除范围仅限优先级表达式。
 *
 * 真错仍 FAIL：两者都无 ⇒ 返回带 `reason` 的空 plan（与旧 `resolveSubComponentPlan` 兜底逐字同形），
 *   不伪造段、不静默造真值。
 */

export const PLAN_SOURCE = Object.freeze({
  FULL: 'subComponentPlan',
  PROJECTED: 'generationInput',
  NONE: 'none',
})

/** 判据有效段：数组且非空。空数组视为「无真值」，允许回退兼容旧断点。 */
function hasEffectiveSections(plan) {
  return !!(
    plan &&
    typeof plan === 'object' &&
    Array.isArray(plan.effectiveSections) &&
    plan.effectiveSections.length > 0
  )
}

function emptyPlan() {
  return {
    effectiveSections: [],
    isForced: false,
    minFiles: 0,
    reason: '未传入 subComponentPlan 或 componentPlan',
  }
}

/**
 * 解析判据层 plan 事实源。
 *
 * @param {object|null} [generationInput] Context Assembler 裁决事实（含 deprecated 的 .componentPlan）
 * @param {object|null} [subComponentPlan] planner 全保真原形
 * @returns {{plan:object, source:string, degraded:boolean}} plan 恒为对象；degraded=true 表示吃了投影口
 */
export function resolvePlanSource(generationInput, subComponentPlan) {
  const full = subComponentPlan && typeof subComponentPlan === 'object' ? subComponentPlan : null
  const projected =
    generationInput && typeof generationInput === 'object' && generationInput.componentPlan &&
    typeof generationInput.componentPlan === 'object'
      ? generationInput.componentPlan
      : null

  // ① 全保真原形有段 ⇒ 判据唯一事实源（根治目标路径）
  if (hasEffectiveSections(full)) return { plan: full, source: PLAN_SOURCE.FULL, degraded: false }
  // ② 原形无段但投影有段 ⇒ 兼容断点续跑 / reuseCache；必须留痕，不得静默
  if (hasEffectiveSections(projected)) {
    return { plan: projected, source: PLAN_SOURCE.PROJECTED, degraded: true }
  }
  // ③ 有对象但无段：仍优先返回 planner 原形，避免把投影当判据真值
  if (full) return { plan: full, source: PLAN_SOURCE.FULL, degraded: false }
  if (projected) return { plan: projected, source: PLAN_SOURCE.PROJECTED, degraded: true }
  // ④ 真错：不伪造
  return { plan: emptyPlan(), source: PLAN_SOURCE.NONE, degraded: true }
}

/** input 形态（prompt-builder / code-generator / graph 节点常用）的便捷入口。 */
export function resolvePlanSourceFromInput(input) {
  return resolvePlanSource(input?.generationInput, input?.subComponentPlan);
}

/**
 * 旧日志字段 `planSource` 的语义映射：legacy == planner 原形（非归一化口）。
 * 保持既有日志消费方（G01 守恒计数、phase2 checkSectionContent）口径不变。
 */
export function legacyPlanSourceLabel(source) {
  return source === PLAN_SOURCE.FULL ? 'legacy' : source === PLAN_SOURCE.PROJECTED ? 'generationInput' : 'none'
}
