import { buildNodeLayoutFacts } from '../utils/figma-node-layout-facts.js'

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
    const cStrokes = visiblePaints(child.strokes)
    const cRadius = normalizeRadius(child)
    if (cFills.length === 0 && cEffects.length === 0 && cStrokes.length === 0 && !hasPositiveRadius(cRadius)) continue
    return {
      fills: cFills,
      effects: cEffects,
      strokes: cStrokes,
      radius: cRadius,
      nodeName: child.name || null,
    }
  }
  return null
}

/**
 * 🛡️ 刀30b（2026-10-29，mv-max-1793255130119-ab4e3051 实锤）：根背景真值色编译。
 *
 * CODE-007 的期望色旧来源只有 vision（layoutStructure/visualElements/colors[0]）——
 * 本设计 vision 把主题蓝 rgba(3,98,166,1)（标题文字色）当 colors[0]，而 Figma 真值根背景是
 * 渐变 rect（#d4e3ff→#c1d6ff @0.9）→ 期望色张冠李戴 → 照真值落地的渐变产物被 BLOCK。
 * 这里从 figma fills（自身或 backdrop）确定性编译期望色：SOLID→rgba、GRADIENT→各 stop rgba，
 * 数值取整（alpha 2 位），与 normalizeCssLiteral 口径兼容。
 */
function compileBackgroundTruthColors(fills) {
  const out = []
  const push = (c, opacity) => {
    if (!c || typeof c !== 'object') return
    const a = Math.round(((c.a ?? 1) * (opacity ?? 1) + Number.EPSILON) * 100) / 100
    const lit =
      `rgba(${Math.round((c.r ?? 0) * 255)},${Math.round((c.g ?? 0) * 255)},${Math.round((c.b ?? 0) * 255)},${a})`
    if (!out.includes(lit)) out.push(lit)
  }
  for (const paint of visiblePaints(fills)) {
    if (paint.type === 'SOLID') push(paint.color, paint.opacity)
    else if (String(paint.type || '').startsWith('GRADIENT')) {
      for (const stop of paint.gradientStops || []) push(stop?.color, paint.opacity)
    }
  }
  return out
}

/**
 * 🛡️ 还原增强（RESTORE_ENHANCEMENT，2026-11-13）：补充样式真值提取。
 *
 * 纯增量、确定性编译 Figma 节点的「静默遗漏」样式事实：四角圆角、渐变（含径向）、
 * 文字大小写、裁剪、透明度、图层 id。这些字段**不进入**现有 styleEvidence/backgroundTruth
 * （门禁只读那些键），故开关关闭（默认）时 compileDesignFacts 输出与现状逐字一致；
 * 开启后挂到 root.enhancedStyleTruth，供 style-mapper / LLM 作为更全约束源（改造2 消费侧）。
 *
 * 注意：本文件是「存活」的样式真值编译入口；方案原写的 figma-style-extractor.js 已无人
 * import，属死代码，故改造2 提取侧落到此处而非那文件。
 */
export function compileEnhancedStyleTruth(node) {
  if (!node || typeof node !== 'object') return null
  const out = {}

  // 四角圆角（区别于 uniform cornerRadius；仅在确实有分角定义时产出）
  const radii = Array.isArray(node.rectangleCornerRadii) ? node.rectangleCornerRadii : null
  if (radii && radii.length === 4 && typeof node.cornerRadius !== 'number') {
    out.cornerRadii = {
      topLeft: Number(radii[0]) || 0,
      topRight: Number(radii[1]) || 0,
      bottomRight: Number(radii[2]) || 0,
      bottomLeft: Number(radii[3]) || 0,
    }
  }

  // 渐变（fill 级，含 LINEAR / RADIAL / ANGULAR）
  const grads = visiblePaints(node.fills).filter((p) => /^GRADIENT/.test(p.type || ''))
  if (grads.length > 0) {
    out.gradients = grads.map((g) => ({
      type: g.type,
      stops: (g.gradientStops || [])
        .map((s) => {
          const c = s.color || {}
          const a = Math.round(((c.a ?? 1) * (g.opacity ?? 1) + Number.EPSILON) * 100) / 100
          return `rgba(${Math.round((c.r ?? 0) * 255)},${Math.round((c.g ?? 0) * 255)},${Math.round((c.b ?? 0) * 255)},${a})`
        })
        .filter(Boolean),
    }))
  }

  // 文字大小写（textCase → text-transform）
  if (node.type === 'TEXT' && node.style && node.style.textCase && node.style.textCase !== 'ORIGINAL') {
    const map = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }
    const tf = map[node.style.textCase]
    if (tf) out.textTransform = tf
  }

  // 裁剪（clipsContent → overflow:hidden）
  if (node.clipsContent === true) out.overflow = 'hidden'

  // 透明度（仅当 < 1 才有意义）
  if (typeof node.opacity === 'number' && node.opacity < 1) out.opacity = node.opacity

  // 图层 id（信息性，供消费侧决定 z-index 顺序）
  if (node.layerId != null) out.layerId = node.layerId

  return Object.keys(out).length > 0 ? out : null
}

/**
 * 还原增强（RESTORE_ENHANCEMENT）消费侧：把 enhancedStyleTruth 编译成要注入 LLM prompt 的约束行。
 * 纯函数、不依赖 import.meta.url（可被 jest 直接单测）；prompt-builder / vue3-prompt 调用它。
 * 返回 string[]（无效输入或无可注入提示时返回空数组）。
 */
export function buildEnhancedStyleTruthDirective(enhanced) {
  if (!enhanced || typeof enhanced !== 'object') return []
  const hints = []
  if (enhanced.cornerRadii) {
    const r = enhanced.cornerRadii
    hints.push(
      `四角圆角（figma 真值·非统一值）：topLeft=${r.topLeft} topRight=${r.topRight} bottomRight=${r.bottomRight} bottomLeft=${r.bottomLeft}px`,
    )
  }
  if (Array.isArray(enhanced.gradients) && enhanced.gradients.length > 0) {
    enhanced.gradients.forEach((g, i) => {
      const stops = (g.stops || []).join(' → ')
      hints.push(`渐变#${i + 1}（figma 真值·勿降级）：type=${g.type} stops=[${stops}]`)
    })
  }
  if (enhanced.textTransform)
    hints.push(`文字大小写（figma 真值）：text-transform=${enhanced.textTransform}`)
  if (enhanced.overflow) hints.push(`裁剪（figma 真值）：overflow=${enhanced.overflow}`)
  if (typeof enhanced.opacity === 'number')
    hints.push(`节点透明度（figma 真值）：opacity=${enhanced.opacity}`)
  if (typeof enhanced.layerId !== 'undefined')
    hints.push(`图层 id（figma 真值·供 z-index 排序参考）：layerId=${enhanced.layerId}`)
  if (hints.length === 0) return []
  return [
    `- 🎯 以下为 figma 确定性样式真值补充（RESTORE_ENHANCEMENT 开启），请优先对齐、不要臆造偏离：${hints.join('；')}。`,
  ]
}

/**
 * 将 Figma API 的确定性属性编译为最小设计事实。
 * Vision 只补充图表语义，不得覆盖根尺寸和根样式证据。
 */
export function compileDesignFacts({ figmaNodeData, visualAnalysis, restoreEnhancement = false } = {}) {
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
  // 🛡️ 刀30a（2026-10-29，mv-max-1793255130119-ab4e3051 实锤）：描边/圆角同源回退。
  //   根 GROUP 自身 strokes/radius 为空，但全尺寸 bg 子节点（48:5797「bg」RECTANGLE）
  //   带 SOLID 描边 #a0c1ff + cornerRadius 4 → 产物照真值落地 border/border-radius
  //   却被 CODE-014 判「臆造」BLOCK（styleEvidence 只看根自身 → border.allowed=false）。
  const ownRadius = normalizeRadius(root)
  const strokes = ownStrokes.length > 0 ? ownStrokes : backdrop?.strokes || ownStrokes
  const radius = hasPositiveRadius(ownRadius) ? ownRadius : backdrop?.radius ?? null
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
      // 🛡️ 刀30b：根背景真值色（SOLID/GRADIENT stops），CODE-007 期望色最高优先来源
      backgroundTruth: {
        colors: compileBackgroundTruthColors(fills),
        source: 'figma-api',
      },
      // 🛡️ 还原增强（RESTORE_ENHANCEMENT，默认关闭）：补充样式真值，开关 off 时不输出、不影响门禁
      ...(restoreEnhancement ? { enhancedStyleTruth: compileEnhancedStyleTruth(root) } : {}),
    },
    charts: normalizeCharts(visualAnalysis?.charts || visualAnalysis?.layoutStructure?.charts),
    // 🛡️ B' 事实层（2026-09-18 治本）：每 figma 节点的布局模型（display/flex-direction），
    // 由 Figma 几何确定性编译（标准读 layoutMode；不标准读 absoluteBoundingBox 几何推断，默认 flex）。
    // 覆盖 sectionLayoutFacts（vision 派生 + 仅 section 范围）的局限，含子组件内部容器。
    // engineer prompt 据此作为强制约束下发（见 constraint-reinforcement.buildNodeLayoutFactsReinforcement）。
    nodeLayoutFacts: buildNodeLayoutFacts(figmaNodeData),
    provenance: {
      deterministicSource: root ? 'figma-api' : 'none',
      semanticSource: visualAnalysis ? 'visual-analysis' : 'none',
    },
  }
}
