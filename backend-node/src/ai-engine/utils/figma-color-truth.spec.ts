import {
  figmaColorToHex,
  hexToRgb,
  rgbDistance,
  collectFigmaChartColors,
  resolveSeriesColors,
} from './figma-color-truth.js'

describe('figma-color-truth（seriesColors 臆造色真值修正）', () => {
  // ── figmaColorToHex ──
  it('figmaColorToHex：0-1 浮点色 → hex', () => {
    expect(figmaColorToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(figmaColorToHex({ r: 0.27, g: 0.35, b: 1, a: 1 })).toBe('#4559ff')
  })

  it('figmaColorToHex：透明（a<0.05）返回 null', () => {
    expect(figmaColorToHex({ r: 1, g: 0, b: 0, a: 0 })).toBeNull()
  })

  it('figmaColorToHex：非法输入返回 null', () => {
    expect(figmaColorToHex(null)).toBeNull()
    expect(figmaColorToHex({})).toBe('#000000') // 全 0 但有合法结构 → 黑
  })

  // ── hexToRgb / rgbDistance ──
  it('hexToRgb 解析 hex', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('FF0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#xyz')).toBeNull()
  })

  it('rgbDistance：同色为 0，异色为正', () => {
    expect(rgbDistance('#ff0000', '#ff0000')).toBe(0)
    expect(rgbDistance('#ff0000', '#0000ff')).toBeGreaterThan(0)
    expect(rgbDistance('#ff0000', 'invalid')).toBe(Number.POSITIVE_INFINITY)
  })

  // ── collectFigmaChartColors ──
  it('collectFigmaChartColors：收集图表容器下的非中性色', () => {
    const tree = {
      document: {
        name: 'root',
        children: [
          {
            name: '@echarts/bar',
            children: [
              {
                name: '柱',
                type: 'VECTOR',
                fills: [{ color: { r: 0.7412, g: 0.8314, b: 0.9098, a: 1 } }], // #bdd4e8 浅蓝
              },
            ],
          },
          {
            name: '图例',
            children: [
              {
                name: 'Rectangle',
                type: 'RECTANGLE',
                fills: [{ color: { r: 0.2706, g: 0.3529, b: 1, a: 1 } }], // #455aff 蓝
              },
            ],
          },
        ],
      },
    }
    const colors = collectFigmaChartColors(tree)
    expect(colors.has('#bdd4e8')).toBe(true)
    expect(colors.has('#455aff')).toBe(true)
  })

  it('collectFigmaChartColors：白/黑/近白被过滤', () => {
    const tree = {
      document: {
        name: '@echarts/bar',
        children: [
          {
            name: '柱',
            fills: [{ color: { r: 1, g: 1, b: 1, a: 1 } }], // 白
          },
          {
            name: '柱2',
            fills: [{ color: { r: 0, g: 0, b: 0, a: 1 } }], // 黑
          },
        ],
      },
    }
    const colors = collectFigmaChartColors(tree)
    expect(colors.size).toBe(0)
  })

  it('collectFigmaChartColors：非图表上下文不收集（普通容器色不纳入）', () => {
    const tree = {
      document: {
        name: '普通面板',
        children: [
          {
            name: 'Rectangle',
            fills: [{ color: { r: 1, g: 0, b: 0, a: 1 } }], // 红，但不在图表上下文
          },
        ],
      },
    }
    const colors = collectFigmaChartColors(tree)
    expect(colors.size).toBe(0)
  })

  // ── resolveSeriesColors ──
  it('resolveSeriesColors：臆造色用最近真值替换（cd7d0172 #ff7875 场景）', () => {
    const figmaColors = new Set(['#457aff', '#00cccc', '#1588f8', '#2ba0ff', '#57caff'])
    const res = resolveSeriesColors(['#1890ff', '#ff7875'], figmaColors)
    expect(res.replaced).toBe(2)
    // #ff7875（红）在蓝系真值里最近的是 #1588f8 而非保留红
    expect(res.colors[1]).not.toBe('#ff7875')
    expect(figmaColors.has(res.colors[1].toLowerCase())).toBe(true)
  })

  it('resolveSeriesColors：色值已在真值集合内 → 保留（零误伤）', () => {
    const figmaColors = new Set(['#457aff', '#00cccc'])
    const res = resolveSeriesColors(['#457aff', '#00cccc'], figmaColors)
    expect(res.replaced).toBe(0)
    expect(res.colors).toEqual(['#457aff', '#00cccc'])
  })

  it('resolveSeriesColors：忽略大小写命中真值', () => {
    const figmaColors = new Set(['#457AFF'])
    const res = resolveSeriesColors(['#457aff'], figmaColors)
    expect(res.replaced).toBe(0)
    expect(res.colors[0]).toBe('#457AFF')
  })

  it('resolveSeriesColors：figmaColors 为空 → fail-open 原样返回', () => {
    const res = resolveSeriesColors(['#ff7875'], new Set())
    expect(res.replaced).toBe(0)
    expect(res.colors).toEqual(['#ff7875'])
  })

  it('resolveSeriesColors：seriesColors 为空数组 → 原样返回', () => {
    const res = resolveSeriesColors([], new Set(['#457aff']))
    expect(res.replaced).toBe(0)
    expect(res.colors).toEqual([])
  })

  it('resolveSeriesColors：空字符串色值跳过不替换', () => {
    const res = resolveSeriesColors([''], new Set(['#457aff']))
    expect(res.replaced).toBe(0)
    expect(res.colors).toEqual([''])
  })
})
