/**
 * Figma 图表系列色真值（确定性事实源）。
 *
 * 🛡️ 治本方向（2026-09-15 · mc-max-1789476471356-cd7d0172 实锤）：
 * charts[].seriesColors 由 VLM 提供（visual-parser 解析 VLM 输出），VLM 会基于「全球 BI
 * 默认红蓝对比」先验臆造色值（如 #ff7875 红），而 Figma 真实图例色块是蓝系
 * （#457aff/#00cccc 等）。色值是可算的，不该过概率模型。
 *
 * 本模块从 Figma 节点树确定性收集「图表相关色值集合」（图例色块 + @echarts 容器下的
 * 非白非黑 fills/strokes），并对 VLM 给出的 seriesColors 做真值校验：
 * - 色值在集合内 → 保留（真值）
 * - 色值不在集合内（臆造）→ 用集合内 RGB 距离最近的色值替换
 *
 * 原则：零误伤——只在「色值明确不在 Figma 树里」时才替换；色值在 Figma 树里存在时一律保留。
 * 即便替换，替换源也是 Figma 树里真实存在的色值（不会凭空生成新色）。
 */

/** Figma color {r,g,b,a}（0-1 浮点）→ '#rrggbb'（小写） */
export function figmaColorToHex(color) {
  if (!color || typeof color !== 'object') return null
  const r = Math.round((color.r ?? 0) * 255)
  const g = Math.round((color.g ?? 0) * 255)
  const b = Math.round((color.b ?? 0) * 255)
  const a = color.a ?? 1
  // 透明填充不参与真值判定
  if (a < 0.05) return null
  const to2 = (v) => v.toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

/** hex → {r,g,b}（0-255 整数），非法返回 null */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const v = m[1]
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

/** 两个 hex 的 RGB 欧氏距离 */
export function rgbDistance(a, b) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (!ca || !cb) return Number.POSITIVE_INFINITY
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2)
}

/** 是否为白/黑/近白（不参与真值判定的中性色） */
function isNeutral(hex) {
  const c = hexToRgb(hex)
  if (!c) return true
  const { r, g, b } = c
  // 白：三通道都 > 245
  if (r > 245 && g > 245 && b > 245) return true
  // 黑：三通道都 < 20
  if (r < 20 && g < 20 && b < 20) return true
  return false
}

/**
 * 收集 Figma 树中「图表相关」的色值集合（hex 小写 Set）。
 *
 * 收集范围（确定性、可算）：
 * 1. name 含「图例 / legend」的 FRAME/GROUP 下的 RECTANGLE/ELLIPSE/VECTOR 非白非黑 fills；
 * 2. name 含「@echarts / chart / 图」的容器节点下所有非白非黑 fills/strokes（柱色/扇区色/折线色）。
 *
 * @param {object} figmaData Figma 节点树（document 或根节点）
 * @returns {Set<string>} 图表色值集合（小写 hex）
 */
export function collectFigmaChartColors(figmaData) {
  const colors = new Set()
  if (!figmaData || typeof figmaData !== 'object') return colors

  const visit = (node, inChartContext) => {
    if (!node || typeof node !== 'object') return

    const name = String(node.name || '').toLowerCase()
    const isLegend = /图例|legend/.test(name)
    const isChart = /@echarts|chart|图表|折线|柱状|饼图|环形|面积|曲线/.test(name)
    const nextContext = inChartContext || isChart

    // 收集本节点 fills/strokes 的色值
    for (const key of ['fills', 'strokes']) {
      const arr = node[key]
      if (!Array.isArray(arr)) continue
      for (const f of arr) {
        if (!f || f.visible === false) continue
        // 纯色
        if (f.color) {
          const hex = figmaColorToHex(f.color)
          if (hex && !isNeutral(hex) && (inChartContext || isLegend)) {
            colors.add(hex)
          }
        }
        // 渐变 stop 里的纯色
        if (Array.isArray(f.gradientStops)) {
          for (const stop of f.gradientStops) {
            if (stop && stop.color) {
              const hex = figmaColorToHex(stop.color)
              if (hex && !isNeutral(hex) && (inChartContext || isLegend)) {
                colors.add(hex)
              }
            }
          }
        }
      }
    }

    for (const c of node.children || []) {
      visit(c, nextContext || isLegend)
    }
  }

  // 从根节点遍历（figmaData 可能是 document 或直接是根节点）
  const root = figmaData.document || figmaData
  visit(root, false)
  return colors
}

/**
 * 用 Figma 色值集合校验/修正 VLM 给出的 seriesColors。
 *
 * 返回 { colors, replaced }：
 * - colors：修正后的 seriesColors（原地长度不变）
 * - replaced：被替换的臆造色数量
 *
 * 规则（零误伤）：
 * - 色值在 figmaColors 里（忽略大小写）→ 保留原值；
 * - 色值不在 → 用 figmaColors 里 RGB 距离最近的色替换；
 * - figmaColors 为空（无可判定真值）→ 原样返回（fail-open，不臆造替换）。
 *
 * @param {Array<string>} seriesColors VLM 给出的系列色
 * @param {Set<string>} figmaColors Figma 图表色值集合
 * @returns {{ colors: string[], replaced: number }}
 */
export function resolveSeriesColors(seriesColors, figmaColors) {
  if (!Array.isArray(seriesColors) || seriesColors.length === 0) {
    return { colors: seriesColors || [], replaced: 0 }
  }
  if (!(figmaColors instanceof Set) || figmaColors.size === 0) {
    return { colors: [...seriesColors], replaced: 0 }
  }

  const palette = [...figmaColors]
  let replaced = 0
  const colors = seriesColors.map((c) => {
    const hex = String(c || '').trim()
    if (!hex) return c
    // 命中真值（忽略大小写）→ 保留
    const hit = [...figmaColors].find((t) => t.toLowerCase() === hex.toLowerCase())
    if (hit) return hit
    // 臆造 → 用最近色替换
    let best = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const p of palette) {
      const d = rgbDistance(hex, p)
      if (d < bestDist) {
        bestDist = d
        best = p
      }
    }
    if (best) {
      replaced++
      return best
    }
    return c
  })

  return { colors, replaced }
}
