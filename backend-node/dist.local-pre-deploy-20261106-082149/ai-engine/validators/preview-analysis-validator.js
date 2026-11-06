/**
 * PreviewAnalysisValidator - L0-A 自验器
 * 
 * 在 visual-parser 输出 preview-analysis 后立即执行校验，
 * 拦截不合格的分析结果。设计原则：
 * - 不阻塞流程（大部分 WARN 级别只记录）
 * - 关键缺失（BLOCK）触发重试（最多 1 次）
 */

export class PreviewAnalysisValidator {
  /**
   * 执行校验
   * @param {Object} analysis - preview-analysis.json 解析结果
   * @returns {{ pass: boolean, blockCount: number, warnCount: number, errors: Array }}
   */
  static validate(analysis) {
    const errors = []

    // ========== BLOCK 级别 ==========

    // STRUCT-01: layout.sections 必须存在且为数组
    if (!analysis?.layout || !Array.isArray(analysis.layout.sections)) {
      errors.push({ id: 'STRUCT-01', severity: 'BLOCK', message: '缺少 layout.sections 或格式错误' })
    }

    // STYLE-01: backgroundBrightness 必填且合法
    const brightness = analysis?.styles?.backgroundBrightness
    if (!brightness || !['dark', 'light'].includes(brightness)) {
      errors.push({
        id: 'STYLE-01',
        severity: 'BLOCK',
        message: `backgroundBrightness 必须是 "dark" 或 "light"，当前值: "${brightness || '(空)'}"`
      })
    }

    // STYLE-02: theme 必须以 brightness 为前缀（允许"未知"）
    if (analysis?.styles?.backgroundBrightness && analysis?.styles?.theme) {
      const prefix = analysis.styles.backgroundBrightness === 'dark' ? '深色' : '浅色'
      //允许 theme 为"未知"（AI 无法确定时）
      if (analysis.styles.theme !== '未知' && !analysis.styles.theme.startsWith(prefix)) {
        errors.push({
          id: 'STYLE-02',
          severity: 'BLOCK',
          message: `theme "${analysis.styles.theme}" 必须以 "${prefix}" 开头`
        })
      }
    }

    // ========== WARN 级别 ==========

    // 每个 section 的 headerRelation
    analysis?.layout?.sections?.forEach((sec, i) => {
      if (!sec.headerRelation) {
        errors.push({
          id: `LAYOUT-${String(i + 1).padStart(2, '0')}`,
          severity: 'WARN',
          message: `sections[${i}]("${sec.name || sec.id}") 缺少 headerRelation 字段`
        })
      }
      if (sec.headerRelation === 'title-same-row' && !sec.slotCandidate) {
        errors.push({
          id: `LAYOUT-${String(i + 1).padStart(2, '0')}-a`,
          severity: 'WARN',
          message: `sections[${i}] headerRelation=title-same-row 但缺少 slotCandidate`
        })
      }
      if (sec.body?.children?.length > 0 && !sec.body.layout) {
        errors.push({
          id: `LAYOUT-${String(i + 1).padStart(2, '0')}-b`,
          severity: 'WARN',
          message: `sections[${i}] 有 children 但 body.layout 为空`
        })
      }
    })

    // 图表完整性（同一 CHART-xx 规则族，不新增规则）
    analysis?.charts?.forEach((chart, i) => {
      const chartId = `CHART-${String(i + 1).padStart(2, '0')}`
      if (chart.legend?.length > 0) {
        if (!chart.legendPosition) {
          errors.push({ id: chartId, severity: 'WARN', message: `charts[${i}] 有图例但缺少 legendPosition` })
        }
        if (!chart.seriesColors || chart.seriesColors.length === 0) {
          errors.push({ id: `${chartId}-a`, severity: 'WARN', message: `charts[${i}] 有图例但缺少 seriesColors` })
        }
        if (!chart.legendType) {
          errors.push({ id: `${chartId}-b`, severity: 'WARN', message: `charts[${i}] 有图例但缺少 legendType` })
        }
      } else if (chart.legendPosition || chart.legendType) {
        // 🛡️ 2026-09-15 反向一致性（mc-1789445437366-5b19ce4f 实锤）：
        // legend 空数组却填了 legendPosition/legendType = 视觉模型「看见了图例但没回填文本」，
        // 下游 chart-standards「有图例必生成 legend」因事实源为空而失效 → 图例整段丢失。
        errors.push({
          id: `${chartId}-c`,
          severity: 'WARN',
          message: `charts[${i}] 填了 legendPosition/legendType 但 legend 为空 —— 若画布内确有图例，必须回填 legend 文本；若确无图例，请删除 legendPosition/legendType`,
        })
      }
      // 🔴 画布内阈值线必须结构化进 markLine，不得只在 notes 里提一句
      const notesText = Array.isArray(chart.notes) ? chart.notes.join(' ') : ''
      const hasMarkLine = Array.isArray(chart.markLine) && chart.markLine.length > 0
      if (!hasMarkLine && /阈值线|预警线|目标线|参考线|平均线/.test(notesText)) {
        errors.push({
          id: `${chartId}-d`,
          severity: 'WARN',
          message: `charts[${i}] notes 提到阈值线/预警线但缺少 markLine 结构化字段 —— 画布内参考线必须写 markLine（否则会被拆成图表外的 DOM 标注）`,
        })
      }
      // 🛡️ 2026-09-15（mc-max-1789476464544-07e31fbb 实锤）：chart.section 归属交叉校验。
      // vision 识别到图表但 section 字段指向的 section 在 layout.sections 里不存在 →
      // 下游 planner 找不到图表容器 → LLM 漏写 template 图表 DOM → 图表消失。
      // 用 WARN（非 BLOCK）：chart.section 是 VLM 编的语义 id（如 92:16-tunnel），
      // 与 figma 真实 node id（如 2:3438）常对不上但图表可能真实存在，误报代价高。
      if (chart.section) {
        const secId = String(chart.section).trim()
        const sectionIds = (analysis?.layout?.sections || [])
          .map((s) => String(s?.id || '').trim())
          .filter(Boolean)
        const sectionNames = (analysis?.layout?.sections || [])
          .map((s) => String(s?.name || s?.title || '').trim())
          .filter(Boolean)
        const matchedById = sectionIds.some((id) => id === secId || secId.includes(id) || id.includes(secId))
        const matchedByName = sectionNames.some((n) => secId.includes(n) || n.includes(secId))
        if (!matchedById && !matchedByName) {
          errors.push({
            id: `${chartId}-e`,
            severity: 'WARN',
            message: `charts[${i}].section="${secId}" 在 layout.sections 中未找到对应 section（id 或 name 均不匹配）—— 图表容器可能因归属缺失而漏写，建议确认图表实际所属 section`,
          })
        }
      }
    })

    // interactions 检查
    if (Array.isArray(analysis?.interactions) && analysis.interactions.length === 0) {
      if (analysis.charts?.length > 0) {
        errors.push({ id: 'INTERACT-01', severity: 'INFO', message: '存在图表但 interactions 为空，请确认是否有图例切换等交互被遗漏' })
      }
    }

    const blockCount = errors.filter(e => e.severity === 'BLOCK').length
    const warnCount = errors.filter(e => e.severity === 'WARN').length

    return {
      pass: blockCount === 0,
      blockCount,
      warnCount,
      errors
    }
  }

  /**
   * 生成重试指导（返回给 visual-parser 修正）
   */
  static generateRetryGuidance(errors) {
    const blockErrors = errors.filter(e => e.severity === 'BLOCK')
    const warnErrors = errors.filter(e => e.severity === 'WARN')
    
    let guidance = '# ⚠️ 分析结果校验未通过\n\n'
    
    if (blockErrors.length > 0) {
      guidance += '## 🔴 必须修复的问题（BLOCK）\n\n'
      guidance += blockErrors.map(e => `- **[${e.id}]** ${e.message}`).join('\n') + '\n\n'
    }
    
    if (warnErrors.length > 0) {
      guidance += '## 🟡 建议修复的问题（WARN）\n\n'
      guidance += warnErrors.map(e => `- **[${e.id}]** ${e.message}`).join('\n') + '\n\n'
    }
    
    guidance += '请根据上述问题修正分析结果后重新输出。\n'
    
    return guidance
  }
}
