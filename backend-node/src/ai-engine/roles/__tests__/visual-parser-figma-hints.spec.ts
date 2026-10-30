/**
 * 回归夹具 —— fillToRgba 的 fill 级透明度提取（mc-max-1789646258134-d21c0618）。
 *
 * 历史事故：卡片背景 fill = { color: rgb(255,98,98), opacity: 0.10 }，但视觉分析 hint 输出
 * `color=[rgba(255,98,98,1)]` —— fill.opacity 被丢弃、只剩 color.a（Figma 里恒为 1）。
 * LLM 拿到全饱和色后把浅色底当卡片背景满铺，文字深色叠深底 → 对比度崩塌、视觉完全偏离。
 *
 * 治本：fillToRgba 以 fill.opacity 优先于 color.a，与
 * figma-connector._rgbaToHex / prompt-builder.toCssColor / section-tree.rgbaToCss 口径一致。
 * visual-parser.extractFigmaHints 复用了本纯函数。
 */
import { readFileSync } from 'node:fs'
import { fillToRgba } from '../../utils/section-tree.js'

describe('fillToRgba —— fill 级透明度（opacity）提取', () => {
  it('卡片浅色底：fill.opacity=0.1 必须保留，不得输出成不透明全饱和色', () => {
    const fill = { type: 'SOLID', visible: true, opacity: 0.1, color: { r: 1, g: 0.3843, b: 0.3843, a: 1 } }
    expect(fillToRgba(fill)).toBe('rgba(255,98,98,0.1)')
  })

  it('全饱和指示器：fill.opacity=1 → 输出 alpha=1（不误降）', () => {
    const fill = { type: 'SOLID', visible: true, opacity: 1, color: { r: 1, g: 0.3843, b: 0.3843, a: 1 } }
    expect(fillToRgba(fill)).toBe('rgba(255,98,98,1)')
  })

  it('fill.opacity 缺省时回退 color.a', () => {
    const fill = { type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0, a: 0.8 } }
    expect(fillToRgba(fill)).toBe('rgba(255,0,0,0.8)')
  })

  it('fill.opacity 与 color.a 均缺省 → alpha=1', () => {
    const fill = { type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 1 } }
    expect(fillToRgba(fill)).toBe('rgba(0,0,255,1)')
  })

  it('浮点精度：opacity=0.10000000149011612 → round 到 0.1（Figma 实际返回值）', () => {
    const fill = { type: 'SOLID', visible: true, opacity: 0.10000000149011612, color: { r: 1, g: 0.3843, b: 0.3843, a: 1 } }
    expect(fillToRgba(fill)).toBe('rgba(255,98,98,0.1)')
  })

  it('颜色缺失（无 color / 无 r 分量）→ null', () => {
    expect(fillToRgba(null)).toBeNull()
    expect(fillToRgba({ type: 'SOLID', visible: true, color: null })).toBeNull()
    expect(fillToRgba({ type: 'SOLID', visible: true, color: { g: 1, b: 1 } })).toBeNull()
  })
})

describe('VisualParser 结构主权契约（7d7925d2）', () => {
  it('要求视觉阅读顺序、footer 子区域锚点和完整表格列结构', () => {
    // visual-parser 运行时使用 import.meta，当前 ts-jest CJS 环境不能导入；
    // 这里对实际 prompt 源文本做接线断言，表格行为由 takeover 公共接口测试覆盖。
    const source = readFileSync(`${__dirname}/../visual-parser.js`, 'utf8')

    expect(source).toContain('sections 数组必须严格按视觉阅读顺序排列')
    expect(source).toContain('footer 不得锚定整个组件根节点')
    expect(source).toContain('多列表格必须作为一个 type="table" section 输出')
    expect(source).toContain('逐列 cells')
  })

  it('inline-row merger 必须以 preserveVisionStructure 模式接线，禁止后处理越权改骨架', () => {
    const source = readFileSync(`${__dirname}/../visual-parser.js`, 'utf8')
    expect(source).toContain('preserveVisionStructure: true')
    expect(source).toContain('vision-structure-guard')
  })
})
