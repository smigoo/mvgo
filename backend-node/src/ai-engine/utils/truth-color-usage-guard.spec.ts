/**
 * N1（#139）：真值色值落地门禁。
 *
 * 事故：真值 rgba(226,208,132,0.2) / #ffc800 / #fffdf1 下发到了 prompt，
 *   但 LLM 换成语义变量（@color-bg-card-active / @color-accent-gold）⇒ 真值全丢。
 */
import {
  auditTruthColorUsage,
  collectColorTokens,
  collectImplementedSectionIds,
  collectProminentTruthColors,
  normalizeCssColor,
} from './truth-color-usage-guard.js'

function figmaFixture() {
  return {
    id: '0:0',
    type: 'FRAME',
    name: 'root',
    absoluteBoundingBox: { x: 0, y: 0, width: 660, height: 868 },
    children: [
      {
        // 金面板底 + 内发光（醒目，必须落地）
        id: '38:3138',
        type: 'RECTANGLE',
        name: 'panel-gold',
        absoluteBoundingBox: { x: 0, y: 0, width: 604, height: 161 },
        fills: [{ type: 'SOLID', color: { r: 0.886, g: 0.816, b: 0.517, a: 0.2 } }],
        effects: [
          {
            type: 'INNER_SHADOW',
            visible: true,
            color: { r: 1, g: 0.784, b: 0, a: 1 },
            offset: { x: 0, y: 0 },
            radius: 16,
            spread: 0,
          },
        ],
        children: [
          {
            id: '38:3138-icon',
            type: 'RECTANGLE',
            name: 'tiny-icon',
            // 面积占比 ~0.05% ⇒ 低于默认阈值，不判
            absoluteBoundingBox: { x: 0, y: 0, width: 20, height: 20 },
            fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
          },
        ],
      },
      {
        // 未在产物中实现的区块（无 data-section-id）⇒ 不判
        id: '38:9999',
        type: 'RECTANGLE',
        name: 'not-implemented',
        absoluteBoundingBox: { x: 0, y: 400, width: 600, height: 200 },
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 1, a: 1 } }],
      },
    ],
  }
}

describe('normalizeCssColor（形态归一，比对不受写法差异干扰）', () => {
  test('hex / rgba / 不透明 rgba 归一', () => {
    expect(normalizeCssColor('#FFC800')).toBe('#ffc800')
    expect(normalizeCssColor('#fc0')).toBe('#ffcc00')
    expect(normalizeCssColor('rgba(226, 208, 132, 0.2)')).toBe('#e2d084@0.2')
    expect(normalizeCssColor('rgba(226,208,132,0.2)')).toBe('#e2d084@0.2')
    expect(normalizeCssColor('rgb(255, 255, 255)')).toBe('#ffffff')
    expect(normalizeCssColor('rgba(255, 255, 255, 1)')).toBe('#ffffff')
  })
  test('非颜色返回 null', () => {
    expect(normalizeCssColor('16px')).toBeNull()
    expect(normalizeCssColor('linear-gradient(180deg, #fff 0%, #000 100%)')).toBeNull()
  })
})

describe('collectColorTokens（产物文本 → 颜色集合）', () => {
  test('抽出 hex / rgba 并归一（含变量定义行）', () => {
    const text = `
      .a { background: rgba(226, 208, 132, 0.2); }
      @color-accent-gold: #FFC800;
      .b { color: #fffdf1; box-shadow: inset 0 0 16px 0 fade(@color-accent-gold, 100%); }
    `
    const tokens = collectColorTokens(text)
    expect(tokens.has('#e2d084@0.2')).toBe(true)
    expect(tokens.has('#ffc800')).toBe(true)
    expect(tokens.has('#fffdf1')).toBe(true)
  })
})

describe('collectImplementedSectionIds（产物自锚定）', () => {
  test('合成后缀归一到基 id', () => {
    const ids = collectImplementedSectionIds(
      '<div data-section-id="38:3162"></div><div data-section-id="38:3211-list"></div><div data-section-id="38:3162-tail-text"></div>',
    )
    expect(ids.has('38:3162')).toBe(true)
    expect(ids.has('38:3211')).toBe(true)
  })
})

describe('collectProminentTruthColors（只收醒目 + 只收已实现区块）', () => {
  test('面积低于阈值的小图元不判；未实现区块不判', () => {
    const truth = collectProminentTruthColors(figmaFixture(), ['38:3138'], { minAreaRatio: 0.01 })
    const values = truth.map((t) => t.value)
    expect(values).toContain('rgba(226, 208, 132, 0.2)')
    expect(values).toContain('#ffc800')
    // 小图标 0.05% 与未实现区块 #ff00ff 都不得出现
    expect(values).not.toContain('#1a334d')
    expect(values).not.toContain('#ff00ff')
  })
})

describe('auditTruthColorUsage（真值必须落地）', () => {
  const figma = figmaFixture()

  test('真值被换成语义变量 ⇒ 报缺失（e7a50be7 形态）', () => {
    const files = {
      'package/index.vue': '<div data-section-id="38:3138" class="c-root"></div>',
      'resources/styles/common.less': `
        .c-panel { background: @color-bg-card-active; box-shadow: inset 0 0 16px 0 fade(@color-accent-gold, 100%); }
      `,
      'resources/styles/themes/theme-vars.less': `
        .common() { @color-bg-card-active: #ffffff; @color-accent-gold: #409EFF; }
      `,
    }
    const r = auditTruthColorUsage({ figmaRoot: figma, files })
    expect(r.skipped).toBe(false)
    const missingValues = r.missing.map((m) => m.value)
    expect(missingValues).toContain('#ffc800')
    expect(missingValues).toContain('rgba(226, 208, 132, 0.2)')
    // 蓝 #409EFF 覆不了真值
    expect(missingValues).not.toContain('#409EFF')
  })

  test('真值写成字面量 ⇒ 通过', () => {
    const files = {
      'package/index.vue': '<div data-section-id="38:3138"></div>',
      'resources/styles/common.less': `
        .c-panel {
          background: rgba(226, 208, 132, 0.2);
          box-shadow: inset 0 0 16px 0 #ffc800;
        }
      `,
    }
    const r = auditTruthColorUsage({ figmaRoot: figma, files })
    expect(r.missing).toEqual([])
    expect(r.covered).toBe(r.truthCount)
  })

  test('真值写进变量定义且值相等 ⇒ 也算落地（允许的写法）', () => {
    const files = {
      'package/index.vue': '<div data-section-id="38:3138"></div>',
      'resources/styles/common.less': `.c-panel { background: @color-group-bg-gold; box-shadow: inset 0 0 16px 0 @color-group-glow-gold; }`,
      'resources/styles/themes/theme-vars.less': `
        .theme-light() {
          @color-group-bg-gold: rgba(226, 208, 132, 0.2);
          @color-group-glow-gold: #ffc800;
        }
      `,
    }
    const r = auditTruthColorUsage({ figmaRoot: figma, files })
    expect(r.missing).toEqual([])
  })

  test('无 data-section-id / 无 figma ⇒ skipped（fail-open，不误报）', () => {
    expect(auditTruthColorUsage({ figmaRoot: figma, files: { 'a.vue': '<div></div>' } }).skipped).toBe(true)
    expect(auditTruthColorUsage({ figmaRoot: null, files: { 'a.vue': '<div data-section-id="38:3138"></div>' } }).skipped).toBe(true)
    expect(auditTruthColorUsage({}).skipped).toBe(true)
  })

  test('缺失项带 nodeId / nodeName / 面积占比（可定位）', () => {
    const files = { 'package/index.vue': '<div data-section-id="38:3138"></div>' }
    const r = auditTruthColorUsage({ figmaRoot: figma, files })
    const glow = r.missing.find((m) => m.value === '#ffc800')!
    expect(glow.bucket).toBe('shadows')
    expect(glow.nodeId).toBe('38:3138')
    expect(glow.nodeName).toBe('panel-gold')
    expect(glow.areaRatio).toBeGreaterThan(0.01)
  })
})
