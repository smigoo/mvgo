/**
 * N1 数字字面量风险判定。
 *
 * 视觉真值缺失时，模板中的孤立数字可能是模型臆造；但只要布局分析已经
 * 产出了有效 section/visual evidence，直接把数字改成 0 会误伤真实 UI 值。
 * 因此 N1 只在结构证据为空的低置信场景允许改写，其余场景只诊断不改码。
 */

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0
}

function firstArrayLength(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value.length
  }
  return 0
}

/**
 * @param {object} input
 * @returns {{rewrite: boolean, reason: string, sectionCount: number, evidence: string[]}}
 */
export function assessNumericLiteralRewrite(input = {}) {
  const layout = input.layoutStructure || input.layout || {}
  const nestedLayout = layout?.layout || {}
  const plan = input.subComponentPlan || input.componentPlan || {}
  const evidence = []

  const sectionCount = firstArrayLength(
    input.effectiveSections,
    plan.effectiveSections,
    layout.sections,
    nestedLayout.sections,
  )
  if (sectionCount > 0) evidence.push(`sections=${sectionCount}`)

  if (nonEmptyArray(input.visualElements)) evidence.push('visualElements')
  if (nonEmptyArray(input.elements)) evidence.push('elements')
  if (nonEmptyArray(input.chunks)) evidence.push('chunks')
  if (nonEmptyArray(input.charts)) evidence.push('charts')

  if (evidence.length > 0) {
    return {
      rewrite: false,
      reason: '结构/视觉证据已存在，数字只记录诊断，不做确定性改写',
      sectionCount,
      evidence,
    }
  }

  return {
    rewrite: true,
    reason: '未发现有效 section 或视觉结构证据，允许低置信数字占位改写',
    sectionCount,
    evidence,
  }
}
