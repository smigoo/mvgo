import { compileEnhancedStyleTruth, compileDesignFacts, buildEnhancedStyleTruthDirective } from './design-facts-compiler.js'

describe('compileEnhancedStyleTruth（还原增强 · 改造2 提取侧，纯增量）', () => {
  it('四角圆角：rectangleCornerRadii 且无 uniform cornerRadius → 分角输出', () => {
    const node = {
      type: 'RECTANGLE',
      rectangleCornerRadii: [2, 4, 6, 8],
      fills: [],
    }
    const r = compileEnhancedStyleTruth(node)
    expect(r).not.toBeNull()
    expect(r!.cornerRadii).toEqual({ topLeft: 2, topRight: 4, bottomRight: 6, bottomLeft: 8 })
  })

  it('四角圆角：有 uniform cornerRadius 时不产出分角（避免与 styleEvidence 重复）', () => {
    const node = {
      type: 'RECTANGLE',
      cornerRadius: 12,
      rectangleCornerRadii: [12, 12, 12, 12],
      clipsContent: true,
      fills: [],
    }
    const r = compileEnhancedStyleTruth(node)
    expect(r).not.toBeNull()
    expect(r!.cornerRadii).toBeUndefined()
  })

  it('渐变：GRADIENT_RADIAL fill → gradients 携带 type 与 stops 颜色', () => {
    const node = {
      type: 'RECTANGLE',
      fills: [
        {
          type: 'GRADIENT_RADIAL',
          visible: true,
          opacity: 1,
          gradientStops: [
            { color: { r: 0.83, g: 0.89, b: 1, a: 1 } },
            { color: { r: 0.75, g: 0.84, b: 1, a: 0.9 } },
          ],
        },
      ],
    }
    const r = compileEnhancedStyleTruth(node)
    expect(r).not.toBeNull()
    expect(r!.gradients).toHaveLength(1)
    expect(r!.gradients![0].type).toBe('GRADIENT_RADIAL')
    expect(r!.gradients![0].stops).toEqual(['rgba(212,227,255,1)', 'rgba(191,214,255,0.9)'])
  })

  it('文字大小写：TEXT + textCase=UPPER → textTransform=uppercase', () => {
    const node = {
      type: 'TEXT',
      style: { textCase: 'UPPER' },
      fills: [],
    }
    const r = compileEnhancedStyleTruth(node)
    expect(r!.textTransform).toBe('uppercase')
  })

  it('文字大小写：textCase=ORIGINAL → 不产出 textTransform', () => {
    const node = {
      type: 'TEXT',
      style: { textCase: 'ORIGINAL' },
      clipsContent: true,
      fills: [],
    }
    const r = compileEnhancedStyleTruth(node)
    expect(r).not.toBeNull()
    expect(r!.textTransform).toBeUndefined()
  })

  it('裁剪：clipsContent=true → overflow=hidden', () => {
    const node = { type: 'FRAME', clipsContent: true, fills: [] }
    const r = compileEnhancedStyleTruth(node)
    expect(r!.overflow).toBe('hidden')
  })

  it('透明度：opacity<1 → 透出数值', () => {
    const node = { type: 'FRAME', opacity: 0.5, fills: [] }
    const r = compileEnhancedStyleTruth(node)
    expect(r!.opacity).toBe(0.5)
  })

  it('默认节点（无任何补充样式）→ 返回 null', () => {
    const node = { type: 'FRAME', fills: [] }
    expect(compileEnhancedStyleTruth(node)).toBeNull()
  })
})

describe('compileDesignFacts · enhancedStyleTruth 开关隔离', () => {
  const root = {
    id: '1:1',
    name: 'cp-test',
    type: 'FRAME',
    absoluteBoundingBox: { width: 100, height: 100 },
    clipsContent: true,
    fills: [],
    children: [],
  }

  it('默认（restoreEnhancement=false）→ root 不含 enhancedStyleTruth，门禁键不变', () => {
    const facts = compileDesignFacts({ figmaNodeData: root })
    expect((facts.root as any).enhancedStyleTruth).toBeUndefined()
    // 现有门禁只读键保持不变
    expect(facts.root.styleEvidence).toBeDefined()
    expect(facts.root.backgroundTruth).toBeDefined()
  })

  it('开启（restoreEnhancement=true）→ root 含 enhancedStyleTruth，且门禁键结构不变', () => {
    const facts = compileDesignFacts({ figmaNodeData: root, restoreEnhancement: true })
    expect((facts.root as any).enhancedStyleTruth).toEqual({ overflow: 'hidden' })
    expect(facts.root.styleEvidence).toBeDefined()
    expect(facts.root.backgroundTruth).toBeDefined()
  })
})

describe('buildEnhancedStyleTruthDirective（还原增强 · 消费侧纯函数）', () => {
  const enhanced = {
    cornerRadii: { topLeft: 4, topRight: 4, bottomRight: 0, bottomLeft: 0 },
    gradients: [{ type: 'RADIAL', stops: ['rgba(10,20,30,1)'] }],
    textTransform: 'uppercase',
    overflow: 'hidden',
    opacity: 0.5,
    layerId: '1:2',
  }

  it('完整 enhanced → 产出含 🎯 的约束行，覆盖四角/渐变/大小写/裁剪/透明度/图层', () => {
    const lines = buildEnhancedStyleTruthDirective(enhanced)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('🎯')
    expect(lines[0]).toContain('topLeft=4')
    expect(lines[0]).toContain('RADIAL')
    expect(lines[0]).toContain('text-transform=uppercase')
    expect(lines[0]).toContain('overflow=hidden')
    expect(lines[0]).toContain('opacity=0.5')
    expect(lines[0]).toContain('layerId=1:2')
  })

  it('仅 cornerRadii → 只产出存在提示，不含渐变', () => {
    const lines = buildEnhancedStyleTruthDirective({
      cornerRadii: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('四角圆角')
    expect(lines[0]).not.toContain('RADIAL')
  })

  it('无效输入（null/undefined/非对象/空对象）→ 返回空数组（默认零影响）', () => {
    expect(buildEnhancedStyleTruthDirective(null)).toEqual([])
    expect(buildEnhancedStyleTruthDirective(undefined)).toEqual([])
    expect(buildEnhancedStyleTruthDirective('x' as any)).toEqual([])
    expect(buildEnhancedStyleTruthDirective({})).toEqual([])
  })
})
