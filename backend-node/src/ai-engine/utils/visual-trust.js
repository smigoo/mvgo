/**
 * 视觉分析可信度裁决（纯函数，无 import.meta 依赖，便于单测）。
 *
 * 将视觉解析结果归约为可信 verdict，供 generate 管线在「识图成功但后续可能乱写」时
 * 决定是否降级 / 拒绝盲写：
 *   - trusted   覆盖率 >= 60%，结构可对得上，可信任
 *   - warning   无覆盖率数据（非 Figma 比对任务）或覆盖率 < 60，放行但保留降级提示
 *   - low-coverage 覆盖率 < 40%，严重不足，需定向重分析（2026-08-30 P2-1 新增）
 *   - conflict   覆盖率 0% 却识别出结构/图表 —— 分析自相矛盾，不可信
 *   - blocked   整体降级 / 视觉降级 / 分析为空，不可用
 *
 * @param {object} parsed 视觉解析结果（含 coverageReport / layoutStructure / charts）
 * @returns {{ verdict: string, reason: string, coverageRate: number|null, recognizedSections: number }}
 */

/**
 * 🛡️ verdict 枚举单一真相源（2026-09-02 契约漂移治理）。
 *
 * 事故 mc-max-1788306653919-a57e4409：visual-trust.js 新增 low-coverage verdict 后，
 * 消费方 context-conflict-resolver.js 漏接 → 23% 幻觉 vision 被当 trusted 放行。
 * 收敛为常量 + 消费方用 Map 穷举映射 + 穷举 spec 断言，新增 verdict 忘接即测试红。
 */
export const VISUAL_VERDICTS = Object.freeze({
  BLOCKED: 'blocked',
  CONFLICT: 'conflict',
  LOW_COVERAGE: 'low-coverage',
  WARNING: 'warning',
  TRUSTED: 'trusted',
});

/** verdict 全部取值（供穷举 spec / Map 映射 key 校验） */
export const VISUAL_VERDICT_VALUES = Object.freeze(
  Object.values(VISUAL_VERDICTS),
);

export function evaluateVisualTrustVerdict(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { verdict: VISUAL_VERDICTS.BLOCKED, reason: '分析结果为空', coverageRate: null, recognizedSections: 0 }
  }
  // 整体降级 / 视觉降级 → 不可用
  if (parsed.degraded || parsed.visualDegraded) {
    return { verdict: VISUAL_VERDICTS.BLOCKED, reason: parsed.degradeReason || '视觉分析降级', coverageRate: null, recognizedSections: 0 }
  }

  const coverageReport = parsed.coverageReport || parsed.layoutStructure?.coverageReport || null
  const coverageRate =
    coverageReport && typeof coverageReport.coverageRate === 'number'
      ? coverageReport.coverageRate
      : null

  const recognizedSections =
    parsed.layoutStructure?.sections?.length || parsed.layout?.sections?.length || 0
  const recognizedCharts = parsed.charts?.length || 0

  // 自相矛盾：覆盖率计算为 0，却识别出了结构/图表 → 分析不可信
  if (coverageRate === 0 && (recognizedSections > 0 || recognizedCharts > 0)) {
    return {
      verdict: VISUAL_VERDICTS.CONFLICT,
      reason: `覆盖率 0% 却识别出 ${recognizedSections} 个区块 / ${recognizedCharts} 个图表，分析结果自相矛盾`,
      coverageRate,
      recognizedSections,
    }
  }

  // 无覆盖率数据（如纯截图任务无 Figma 比对）：无法核验，标记 warning 放行
  if (coverageRate === null) {
    return {
      verdict: VISUAL_VERDICTS.WARNING,
      reason: '无覆盖率数据（非 Figma 比对任务），无法核验，生成时保留降级提示',
      coverageRate: null,
      recognizedSections,
    }
  }

  // 🛡️ P2-1（2026-08-30）：覆盖率 < 35% 属「严重不足」，单独判为 low-coverage，
  // 供消费方触发一次定向重分析（复用已识别节点，只重跑 missing），二次仍不达标才降级。
  // 旧逻辑 <60% 一律 warning 静默放行，18% 覆盖率也照样进入生成 → 视觉还原严重失真。
  // 2026-09-04 调整：40% → 35%，避免复杂设计稿（如 56 元素设备监测 38%）被误拦。
  if (coverageRate < 35) {
    return {
      verdict: VISUAL_VERDICTS.LOW_COVERAGE,
      reason: `覆盖率严重不足 (${coverageRate}%)，需定向重分析`,
      coverageRate,
      recognizedSections,
    }
  }

  if (coverageRate < 60) {
    return {
      verdict: VISUAL_VERDICTS.WARNING,
      reason: `覆盖率偏低 (${coverageRate}%)`,
      coverageRate,
      recognizedSections,
    }
  }

  return { verdict: VISUAL_VERDICTS.TRUSTED, reason: `覆盖率 ${coverageRate}%`, coverageRate, recognizedSections }
}
