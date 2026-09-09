function visiblePaints(paints) {
  return Array.isArray(paints) ? paints.filter((paint) => paint && paint.visible !== false) : []
}

function visibleEffects(effects) {
  return Array.isArray(effects) ? effects.filter((effect) => effect && effect.visible !== false) : []
}

function normalizeRadius(node) {
  if (typeof node?.cornerRadius === 'number') return node.cornerRadius
  if (Array.isArray(node?.rectangleCornerRadii)) return node.rectangleCornerRadii
  return null
}

function hasPositiveRadius(radius) {
  if (typeof radius === 'number') return radius > 0
  return Array.isArray(radius) && radius.some((value) => Number(value) > 0)
}

function normalizeCharts(charts) {
  if (!Array.isArray(charts)) return []

  return charts.map((chart, index) => {
    const legendSource = chart.legend
    const legendItems = Array.isArray(legendSource)
      ? legendSource.filter(Boolean)
      : Array.isArray(legendSource?.items)
        ? legendSource.items.filter(Boolean)
        : Array.isArray(legendSource?.data)
          ? legendSource.data.filter(Boolean)
          : []
    return {
      id: chart.id || chart.section || `chart-${index + 1}`,
      type: chart.type || chart.chartType || 'unknown',
      series: Array.isArray(chart.series) ? chart.series : [],
      legend: {
        items: legendItems,
        owner: legendItems.length > 0 ? 'unresolved' : 'none',
        position: chart.legendPosition || null,
      },
      source: 'visual-analysis',
    }
  })
}

/**
 * 🛡️ 全尺寸背景子节点证据采集（2026-09-02，mv-max-1788362379152-efe234bd 实锤）
 *
 * Figma 常见做法：根 FRAME 自身 fills/effects 为空（透明），背景与阴影由「铺满根容器的
 * bg 子节点」承载（如 cp-环境监测 → bg VECTOR 420×186：SOLID #edf4fb + DROP_SHADOW）。
 * 旧实现只看根 FRAME 自身 → background/boxShadow 证据为 0 → CODE-014 判定「根容器臆造
 * 装饰」并 BLOCK → 强制模型删掉【真实存在】的背景与阴影 → 好样式被改成坏样式。
 * 且与 CODE-007「期望根容器落地 #edf4fb」自相矛盾（同一份真值，两个门禁结论相反）。
 *
 * 策略：根容器自身无证据时，回退采集「全尺寸背景子节点」的 fills/effects 作为等价证据。
 * 判定保守：子节点须铺满根容器（宽高 ≥ 95%）且命名/类型符合背景语义，避免误纳内容节点。
 */
function collectBackdropEvidence(root) {
  const rootBox = root?.absoluteBoundingBox
  if (!rootBox || !Array.isArray(root?.children)) return null

  const covers = (box) => {
    if (!box) return false
    const w = Number(box.width) || 0
    const h = Number(box.height) || 0
    if (!Number.isFinite(rootBox.width) || !Number.isFinite(rootBox.height)) return false
    if (rootBox.width <= 0 || rootBox.height <= 0) return false
    return w / rootBox.width >= 0.95 && h / rootBox.height >= 0.95
  }
  const isBackdropName = (name) =>
    /^(bg|background|底|底色|背景|bg[-\s_]?\d*)$/i.test(String(name || '').trim())

  for (const child of root.children) {
    if (!child || typeof child !== 'object') continue
    const box = child.absoluteBoundingBox
    if (!covers(box)) continue
    const type = String(child.type || '').toUpperCase()
    const named = isBackdropName(child.name)
    const shapeLike = ['VECTOR', 'RECTANGLE', 'FRAME'].includes(type)
    if (!named && !shapeLike) continue
    // 命名命中优先；形状节点仅在其确实带装饰时才作数
    const cFills = visiblePaints(child.fills)
    const cEffects = visibleEffects(child.effects)
    if (cFills.length === 0 && cEffects.length === 0) continue
    return { fills: cFills, effects: cEffects, nodeName: child.name || null }
  }
  return null
}

/**
 * 将 Figma API 的确定性属性编译为最小设计事实。
 * Vision 只补充图表语义，不得覆盖根尺寸和根样式证据。
 */
export function compileDesignFacts({ figmaNodeData, visualAnalysis } = {}) {
  const root = figmaNodeData && typeof figmaNodeData === 'object' ? figmaNodeData : null
  const bounds = root?.absoluteBoundingBox || null
  const ownFills = visiblePaints(root?.fills)
  const ownStrokes = visiblePaints(root?.strokes)
  const ownEffects = visibleEffects(root?.effects)
  // 根容器自身无背景/阴影证据时，回退到「全尺寸背景子节点」（见 collectBackdropEvidence 注释）
  const backdrop = collectBackdropEvidence(root)
  const fills = ownFills.length > 0 ? ownFills : backdrop?.fills || ownFills
  const effects =
    ownEffects.length > 0 ? ownEffects : backdrop?.effects || ownEffects
  const strokes = ownStrokes
  const radius = normalizeRadius(root)
  const shadowEffects = effects.filter((effect) =>
    ['DROP_SHADOW', 'INNER_SHADOW'].includes(effect.type),
  )

  return {
    root: {
      nodeId: root?.id || null,
      nodeName: root?.name || null,
      size: {
        width: Number.isFinite(bounds?.width) ? bounds.width : null,
        height: Number.isFinite(bounds?.height) ? bounds.height : null,
        unit: 'css-px',
        source: bounds ? 'figma-api' : 'unknown',
      },
      styleEvidence: {
        background: {
          allowed: fills.length > 0,
          source: 'figma-api',
          evidenceCount: fills.length,
        },
        border: {
          allowed: strokes.length > 0,
          source: 'figma-api',
          evidenceCount: strokes.length,
        },
        borderRadius: {
          allowed: hasPositiveRadius(radius),
          value: hasPositiveRadius(radius) ? radius : null,
          source: 'figma-api',
        },
        boxShadow: {
          allowed: shadowEffects.length > 0,
          source: 'figma-api',
          evidenceCount: shadowEffects.length,
        },
      },
    },
    charts: normalizeCharts(visualAnalysis?.charts || visualAnalysis?.layoutStructure?.charts),
    provenance: {
      deterministicSource: root ? 'figma-api' : 'none',
      semanticSource: visualAnalysis ? 'visual-analysis' : 'none',
    },
  }
}
